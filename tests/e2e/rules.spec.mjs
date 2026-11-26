/* C-05 几何规则检查：浏览器级验证（运行/改配置重查/定位/CSV 导出/免责提示） */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function openApp(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
}

test('C-05 规则检查：重叠/越界到间距改配置重查、点击定位与 CSV 导出', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    state.objects = [
      baseObject('rect', 'rect.area', { name: 'A', x: 10, y: 10, width: 10, height: 10 }),
      baseObject('rect', 'rect.area', { name: 'B', x: 15, y: 15, width: 10, height: 10 }),
      baseObject('point', 'point.marker', { name: 'P1', x: 40, y: 10 }),
      baseObject('point', 'point.marker', { name: 'P2', x: 40.5, y: 10 }),
      baseObject('rect', 'rect.area', { name: 'OUT', x: 150, y: 10, width: 10, height: 10 })
    ];
    state.rules.spacing.types = {};
  });

  await page.locator('#tabBtn-rules').click();
  await expect(page.locator('#tab-rules')).toHaveClass(/active/);
  await expect(page.locator('#ruleConfig')).toContainText('这是几何检查，不是消防/规范审图');
  await expect(page.locator('#ruleConfig')).toContainText('不内置任何规范数值');

  /* 首轮：重叠 1 + 越界 1，间距未配置 */
  await page.locator('#runRulesBtn').click();
  await expect(page.locator('#ruleCount')).toContainText('2 条');
  await expect(page.locator('#ruleResults')).toContainText('对象重叠');
  await expect(page.locator('#ruleResults')).toContainText('越界');
  await expect(page.locator('#ruleResults')).toContainText('完全越出场地边界');
  await expect(page.locator('#ruleResults')).toContainText('未配置阈值类型 2 个');

  /* 改配置 → 重查：给点类型配置 1m 阈值，违规数应变 3 */
  const minInput = page.locator('[data-rule-type-min="point.marker"]');
  await minInput.fill('1');
  await minInput.blur(); /* 失焦触发 change，写入 state.rules 并清空旧结果 */
  await expect.poll(() => page.evaluate(() => state.rules.spacing.types['point.marker'])).toBe(1);
  await page.locator('#runRulesBtn').click();
  await expect(page.locator('#ruleCount')).toContainText('3 条');
  await expect(page.locator('#ruleResults')).toContainText('最小间距');
  await expect(page.locator('#ruleResults')).toContainText('低于阈值');
  await expect(page.locator('#ruleResults')).toContainText('未配置阈值类型 1 个');

  /* 点击违规行：定位到对象并切到属性页签 */
  const first = page.locator('[data-rule-hit]').first();
  await first.click();
  await expect(page.locator('#tab-props')).toHaveClass(/active/);
  const sel = await page.evaluate(() => ({ ids: Array.from(selectedIds), size: selectedIds.size }));
  expect(sel.size).toBeGreaterThanOrEqual(1);
  expect(sel.size).toBeLessThanOrEqual(2);

  /* 导出违规清单：文件名 + 行数 = 表头 + 违规数（先切回规则页签，按钮可见） */
  await page.locator('#tabBtn-rules').click();
  await expect(page.locator('#tab-rules')).toHaveClass(/active/);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#exportRulesBtn').click()
  ]);
  expect(download.suggestedFilename()).toMatch(/^rule-violations-\d{8}-\d{4}\.csv$/);
  const text = readFileSync(await download.path(), 'utf8');
  expect(text.startsWith('\uFEFF规则,对象编号,对象名称,关联对象,楼层,X,Y,说明,值')).toBeTruthy();
  expect(text.trimEnd().split('\r\n').length).toBe(4);
});

/* C2：规则配置改动入历史（300ms 合并）并可撤销；撤销后面板控件按 state.rules 重建。 */
test('C2 规则配置入历史：300ms 内连续改动只增一条，Ctrl+Z 回滚且控件同步', async ({ page }) => {
  await openApp(page);
  await page.locator('#tabBtn-rules').click();
  const before = await page.evaluate(() => ({
    tol: state.rules.bounds.tolerance, ov: state.rules.overlap.tolerance, hist: history.past.length
  }));

  await page.locator('#ruleBoundsTol').fill('1.5');
  await page.locator('#ruleBoundsTol').blur();
  await expect.poll(() => page.evaluate(() => state.rules.bounds.tolerance)).toBe(1.5);
  expect(await page.evaluate(() => history.past.length)).toBe(before.hist + 1);

  /* 同一批内连续改两个输入：只提交一次、一条历史，两处都生效 */
  await page.evaluate(() => {
    const b = document.getElementById('ruleBoundsTol');
    b.value = '2'; b.dispatchEvent(new Event('change', { bubbles: true }));
    const o = document.getElementById('ruleOverlapTol');
    o.value = '0.3'; o.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => ({ b: state.rules.bounds.tolerance, o: state.rules.overlap.tolerance })))
    .toEqual({ b: 2, o: 0.3 });
  expect(await page.evaluate(() => history.past.length)).toBe(before.hist + 2);

  await page.locator('#undoBtn').click();
  await expect.poll(() => page.evaluate(() => ({ b: state.rules.bounds.tolerance, o: state.rules.overlap.tolerance })))
    .toEqual({ b: 1.5, o: before.ov });
  await expect(page.locator('#ruleBoundsTol')).toHaveValue('1.5');
  expect(await page.evaluate(() => history.past.length)).toBe(before.hist + 1);
});

/* C2 验收：一端改规则 → 对端 state.rules 跟随、可 Ctrl+Z 回到应用前值、且应用后不再外发。 */
test('C2 规则配置经显式通道同步到对端且不回发', async ({ page, context }) => {
  const p2 = await context.newPage();
  for (const p of [page, p2]) {
    await p.goto('/index.html?debug=1');
    await expect.poll(() => p.evaluate(() => typeof state)).toBe('object');
    await p.evaluate(() => { state.meta.projectId = 'E2E_RULES'; window.scheduleSave = () => {}; });
  }
  const ch = 'rules-' + Date.now();
  for (const p of [page, p2]) {
    await p.click('#collabBtn');
    await expect(p.locator('#modalBackdrop')).toHaveClass(/show/);
    await p.fill('#collabChannel', ch);
    await p.click('#collabLocalBtn');
  }
  await expect.poll(() => page.evaluate(() => window.__collabState)).toBe('connected');
  await expect.poll(() => p2.evaluate(() => window.__collabState)).toBe('connected');
  for (const p of [page, p2]) {
    if (await p.locator('#modalBackdrop').evaluate(el => el.classList.contains('show'))) await p.click('#modalFooter button');
  }
  /* 对端应用前基线 + 计数自身外发的 rules-apply */
  const peerBefore = await p2.evaluate(() => {
    window.__outRules = 0;
    const orig = window.collabSendObject;
    window.collabSendObject = (o, to) => { if (o && o.t === 'rules-apply') window.__outRules++; return orig(o, to); };
    return state.rules.bounds.tolerance;
  });

  await page.locator('#tabBtn-rules').click();
  await page.evaluate(() => {
    const b = document.getElementById('ruleBoundsTol');
    b.value = '2.25'; b.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => state.rules.bounds.tolerance)).toBe(2.25);
  await expect.poll(() => p2.evaluate(() => state.rules.bounds.tolerance), { timeout: 6000 }).toBe(2.25);
  await p2.waitForTimeout(1000);   /* 等发送端 500ms 快照也到达，确认后续撤销回到应用前 */
  expect(await p2.evaluate(() => window.__outRules)).toBe(0);

  await p2.locator('#undoBtn').click();
  await expect.poll(() => p2.evaluate(() => state.rules.bounds.tolerance)).toBe(peerBefore);
});
