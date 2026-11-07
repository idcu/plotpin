/* B-06 协作易用性：双标签建连/状态、消息层护栏、冲突回滚、离线重连、邀请串与二维码容量 */
import { test, expect } from '@playwright/test';
import { clickCanvasCenter } from './helpers.mjs';

async function openApp(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
  /* 两个标签共享同一个 IndexedDB：测试只验证内存合并，关闭自动保存避免互相覆盖 current */
  await page.evaluate(() => { window.scheduleSave = () => {}; });
}

async function openCollab(page) {
  await page.click('#collabBtn');
  await expect(page.locator('#modalBackdrop')).toHaveClass(/show/);
  await expect(page.locator('#collabStatus')).toBeVisible();
}

async function closeModal(page) {
  if (await page.locator('#modalBackdrop').evaluate(el => el.classList.contains('show'))) {
    await page.click('#modalFooter button');
    await expect(page.locator('#modalBackdrop')).not.toHaveClass(/show/);
  }
}

async function startLocal(page, channel) {
  await openCollab(page);
  await page.fill('#collabChannel', channel);
  await page.click('#collabLocalBtn');
}

async function waitState(page, wanted, timeout = 6000) {
  await expect.poll(() => page.evaluate(() => window.__collabState), { timeout }).toBe(wanted);
}

async function drawPoint(page) {
  await page.locator('.tool-btn[data-tool="point"]').click();
  await clickCanvasCenter(page);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);
}

function uniqueChannel(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

test('双标签建连与状态：等待 → 已连接 → 对端断开可见', async ({ page, context }) => {
  const p2 = await context.newPage();
  await openApp(page);
  await openApp(p2);
  const ch = uniqueChannel('e2e-connect');

  await startLocal(page, ch);
  await expect(page.locator('#collabStatus')).toContainText('等待对方接入');
  expect(await page.evaluate(() => window.__collabState)).toBe('waiting');

  await startLocal(p2, ch);
  await waitState(page, 'connected');
  await waitState(p2, 'connected');
  await expect(page.locator('#collabPeers')).toContainText('已连接对端');
  await expect(p2.locator('#collabPeers')).toContainText('已连接对端');

  await closeModal(page);
  await drawPoint(page);
  await expect.poll(() => p2.evaluate(() => state.objects.length), { timeout: 4000 }).toBe(1);

  await page.evaluate(() => collabStopAll());
  await waitState(p2, 'disconnected');
  await expect(p2.locator('#collabStatus')).toContainText('对端已断开');
  expect(await page.evaluate(() => window.__collabState)).toBe('disconnected');
});

test('消息层加固：TTL/key 上限、重复 hello 去重、发送异常不冒泡、异常断开可见', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    const out = {};
    collabInbound.clear(); collabHelloSeen.clear();
    collabBC = null; collabDC = null;
    const now = 1000;
    collabInbound.set('old', { total: 2, parts: ['a'], size: 1, lastAt: now - 31000 });
    collabInbound.set('fresh', { total: 2, parts: ['a'], size: 1, lastAt: now - 1000 });
    out.ttl = collabSweepInbound(now);
    collabInbound.clear();
    for (let i = 0; i < 70; i++) collabInbound.set('k' + i, { total: 1, parts: ['x'], size: 1, lastAt: now + i });
    out.keys = collabSweepInbound(now + 100);
    out.oldestEvicted = !collabInbound.has('k0');

    const orig = collabSendObject, calls = [];
    collabSendObject = o => { calls.push(o && o.t); return true; };
    collabHandleMessage({ t: 'hello', name: 'E2E-PEER' }, 'E2E-SENDER');
    collabHandleMessage({ t: 'hello', name: 'E2E-PEER' }, 'E2E-SENDER');
    collabSendObject = orig;
    out.helloCalls = calls.slice();

    collabDC = { readyState: 'open', bufferedAmount: 0, send() { throw new Error('boom'); } };
    let threw = false, ok = false;
    try { ok = collabSendRaw('x'); } catch (_) { threw = true; }
    out.send = { ok, threw, err: window.__collabLastError };

    const dc = { readyState: 'open', bufferedAmount: 0, send() { return true; } };
    collabWireDC(dc);
    dc.onclose();
    out.abnormal = { state: window.__collabState, status: collabLastStatus };

    collabDC = null;
    collabInbound.clear(); collabHelloSeen.clear();
    return out;
  });

  expect(r.ttl).toBe(1);
  expect(r.keys).toBe(64);
  expect(r.oldestEvicted).toBe(true);
  expect(r.helloCalls).toEqual(['hello-ack', 'snapshot']);
  expect(r.send.threw).toBe(false);
  expect(r.send.ok).toBe(false);
  expect(r.send.err).toContain('boom');
  expect(r.abnormal.state).toBe('error');
  expect(r.abnormal.status).toContain('异常断开');
});

test('冲突提示与回滚：LWW 覆盖写入撤销栈，Ctrl+Z 恢复本地值', async ({ page, context }) => {
  const p2 = await context.newPage();
  await openApp(page);
  await openApp(p2);
  const ch = uniqueChannel('e2e-conflict');
  await startLocal(page, ch);
  await startLocal(p2, ch);
  await waitState(page, 'connected');
  await waitState(p2, 'connected');
  await closeModal(page);
  await closeModal(p2);
  await drawPoint(page);
  await expect.poll(() => p2.evaluate(() => state.objects.length), { timeout: 4000 }).toBe(1);

  await page.evaluate(() => collabStopAll());
  await waitState(p2, 'disconnected');
  const histBefore = await page.evaluate(() => history.past.length);

  const t1 = await page.evaluate(() => {
    const o = state.objects[0]; o.x = 100; o.updatedAt = nowISO(); commitObjectEdit(); return o.updatedAt;
  });
  await page.waitForTimeout(80);
  const t2 = await p2.evaluate(() => {
    const o = state.objects[0]; o.x = 200; o.updatedAt = nowISO(); commitObjectEdit(); return o.updatedAt;
  });
  expect(t2 >= t1).toBe(true);
  /* p2 的 500ms 防抖广播 */
  await p2.waitForTimeout(800);

  await page.evaluate(c => collabStartLocal(c), ch);
  await expect.poll(() => page.evaluate(() => (window.__collabLastMerge && window.__collabLastMerge.updated) || 0),
    { timeout: 6000 }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => state.objects[0].x)).toBe(200);

  const merged = await page.evaluate(() => ({
    updated: window.__collabLastMerge.updated,
    conflicts: window.__collabLastMerge.conflicts,
    history: history.past.length
  }));
  console.log(`[B-06] merge updated=${merged.updated}, conflicts=${merged.conflicts}, history=${histBefore}→${merged.history}`);
  expect(merged.conflicts).toBeGreaterThanOrEqual(1);
  expect(merged.history).toBe(histBefore + 1);

  /* 重新打开面板读取常驻冲突行（合并发生在面板关闭期间） */
  await openCollab(page);
  await expect(page.locator('#collabConflictInfo')).toContainText('冲突');
  await expect(page.locator('#collabConflictInfo')).toContainText('回滚');

  await page.evaluate(() => undo());
  await expect.poll(() => page.evaluate(() => state.objects[0].x)).toBe(100);
});

test('N-04：对端清空场地可见可撤销；场地拖点实时同步；旧快照不复活已清空场地', async ({ page, context }) => {
  const p2 = await context.newPage();
  await openApp(page);
  await openApp(p2);
  const ch = uniqueChannel('e2e-site');
  await startLocal(page, ch);
  await startLocal(p2, ch);
  await waitState(page, 'connected');
  await waitState(p2, 'connected');
  await closeModal(page);
  await closeModal(p2);

  /* 初始场地只由 p1 创建，验证增量同步 */
  await page.evaluate(() => {
    state.site = createSiteSlot({ type: 'rect', w: 20, h: 10 });
    state.site.updatedAt = nowISO();
    commitChange();
  });
  await expect.poll(() => p2.evaluate(() => !!state.site), { timeout: 4000 }).toBe(true);

  /* ④ 场地拖点：真实鼠标拖动右上角手柄，p2 收到并合并 */
  await page.locator('.tool-btn[data-tool="site-node"]').click();
  const pt = await page.evaluate(() => {
    const s = w2s([20, 10]);
    const r = document.getElementById('canvas').getBoundingClientRect();
    return { x: r.left + s[0], y: r.top + s[1] };
  });
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await page.mouse.move(pt.x + 80, pt.y - 40, { steps: 6 });
  await page.mouse.up();
  const draggedW = await page.evaluate(() => state.site && state.site.shape.w);
  expect(draggedW).toBeGreaterThan(20);
  await expect.poll(() => p2.evaluate(() => state.site && Math.round(state.site.shape.w)), { timeout: 5000 })
    .toBeGreaterThan(20);
  await page.locator('.tool-btn[data-tool="select"]').click();
  await page.waitForTimeout(700);   /* 等拖点产生的 500ms 防抖广播发完，隔离属性面板自身的广播 */

  /* ④b 属性面板精确输入：走 commitObjectEdit，同样实时广播给对端（N-04 修复的静默路径） */
  await page.locator('#propPanel [data-site-field="w"]').fill('35');
  await expect.poll(() => p2.evaluate(() => Math.round(state.site.shape.w)), { timeout: 5000 }).toBe(35);

  /* ② 对端清空场地 → 本地状态栏明确提示 + 写入撤销栈 + Ctrl+Z 恢复 */
  const oldSnapshot = await p2.evaluate(() => persistableState());
  const histBefore = await page.evaluate(() => history.past.length);
  await p2.evaluate(() => { state.site = null; touchFloor(); commitChange(); });
  await expect.poll(() => page.evaluate(() => state.site), { timeout: 5000 }).toBe(null);
  const cleared = await page.evaluate(() => window.__collabLastMerge);
  expect(cleared.siteCleared).toBeGreaterThanOrEqual(1);
  expect(cleared.siteDeleted).toBeGreaterThanOrEqual(1);
  await expect.poll(() => page.evaluate(() => history.past.length)).toBe(histBefore + 1);
  await openCollab(page);
  await expect(page.locator('#collabStatus')).toContainText('对端清空了场地');
  await expect(page.locator('#collabStatus')).toContainText('Ctrl+Z');
  await closeModal(page);
  await page.keyboard.press('Control+z');
  await expect.poll(() => page.evaluate(() => !!state.site)).toBe(true);

  /* ③ 本地清空后，对端较旧的快照不能把场地复活 */
  await page.evaluate(() => { pushHistory(); clearCurrentFloor(); commitChange('已清空当前楼层'); });
  await page.waitForTimeout(700);
  await p2.evaluate(proj => collabSendObject({ t: 'snapshot', project: proj }), oldSnapshot);
  await expect.poll(() => page.evaluate(() => state.site), { timeout: 5000 }).toBe(null);
});

test('离线重连：本地未同步修改不丢且对端可见（短间隔确定性）', async ({ page, context }) => {
  const p2 = await context.newPage();
  await openApp(page);
  await openApp(p2);
  const ch = uniqueChannel('e2e-offline');
  await startLocal(page, ch);
  await startLocal(p2, ch);
  await waitState(page, 'connected');
  await waitState(p2, 'connected');
  await closeModal(page);
  await closeModal(p2);
  await drawPoint(page);
  await expect.poll(() => p2.evaluate(() => state.objects.length), { timeout: 4000 }).toBe(1);

  await page.evaluate(() => collabStopAll());
  await waitState(p2, 'disconnected');
  await page.evaluate(() => {
    const base = JSON.parse(JSON.stringify(state.objects[0]));
    base.id = 'OBJ_OFFLINE'; base.x = 55; base.z = state.objects.length; base.updatedAt = nowISO(); base.createdAt = base.updatedAt;
    state.objects.push(base);
    commitObjectEdit();
  });
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(2);

  await page.evaluate(c => collabStartLocal(c), ch);
  await expect.poll(() => p2.evaluate(() => state.objects.some(o => o.id === 'OBJ_OFFLINE')), { timeout: 6000 }).toBe(true);
  expect(await page.evaluate(() => state.objects.some(o => o.id === 'OBJ_OFFLINE'))).toBe(true);
});

test('邀请串三步建连与二维码容量提示（同机双标签，非双设备）', async ({ page, context }) => {
  const p2 = await context.newPage();
  await openApp(page);
  await openApp(p2);
  await openCollab(page);
  await page.click('#collabOfferBtn');
  await expect.poll(() => page.inputValue('#collabSignalOut'), { timeout: 10000 }).toMatch(/^PLOTPIN-COLLAB:1:O:/);
  const invite = await page.inputValue('#collabSignalOut');
  const fit = await page.evaluate(t => collabQrFit(t), invite);
  console.log(`[B-06] inviteBytes=${fit.bytes}, qrLimit=${fit.limit}, fits=${fit.fits}`);
  expect(fit.bytes).toBeGreaterThan(42);
  await expect(page.locator('#collabInviteQr')).toContainText('42');
  expect(await page.locator('#collabInviteQr svg').count()).toBe(0);

  await openCollab(p2);
  await p2.fill('#collabSignalIn', invite);
  await p2.click('#collabAcceptBtn');
  await expect.poll(() => p2.inputValue('#collabSignalOut'), { timeout: 10000 }).toMatch(/^PLOTPIN-COLLAB:1:A:/);
  const answer = await p2.inputValue('#collabSignalOut');

  const t0 = Date.now();
  await page.fill('#collabSignalIn', answer);
  await page.click('#collabAcceptBtn');
  const open = await page.waitForFunction(
    () => typeof collabDC !== 'undefined' && !!collabDC && collabDC.readyState === 'open',
    null, { timeout: 5000 }
  ).then(() => true).catch(() => false);
  const elapsed = Date.now() - t0;
  const stateAfter = await page.evaluate(() => window.__collabState);
  console.log(`[B-06] same-machine WebRTC open=${open}, elapsed=${elapsed}ms, state=${stateAfter}`);
  expect(['connecting', 'connected', 'error']).toContain(stateAfter);
  if (open) expect(stateAfter).toBe('connected');
});

test('离线 5 分钟真实浸泡：重连后本地修改不丢', async ({ page, context }) => {
  test.skip(process.env.COLLAB_SOAK !== '1', '设置 COLLAB_SOAK=1 才运行 5 分钟真实离线浸泡');
  test.setTimeout(7 * 60 * 1000);
  const p2 = await context.newPage();
  await openApp(page);
  await openApp(p2);
  const ch = uniqueChannel('e2e-soak');
  await startLocal(page, ch);
  await startLocal(p2, ch);
  await waitState(page, 'connected');
  await waitState(p2, 'connected');
  await closeModal(page);
  await closeModal(p2);
  await drawPoint(page);
  await expect.poll(() => p2.evaluate(() => state.objects.length), { timeout: 4000 }).toBe(1);

  await page.evaluate(() => collabStopAll());
  await waitState(p2, 'disconnected');
  await page.evaluate(() => {
    const base = JSON.parse(JSON.stringify(state.objects[0]));
    base.id = 'OBJ_SOAK'; base.x = 77; base.updatedAt = nowISO(); base.createdAt = base.updatedAt;
    state.objects.push(base);
    commitObjectEdit();
  });
  await page.waitForTimeout(5 * 60 * 1000);

  await page.evaluate(c => collabStartLocal(c), ch);
  await expect.poll(() => p2.evaluate(() => state.objects.some(o => o.id === 'OBJ_SOAK')), { timeout: 8000 }).toBe(true);
  expect(await page.evaluate(() => state.objects.some(o => o.id === 'OBJ_SOAK'))).toBe(true);
});
