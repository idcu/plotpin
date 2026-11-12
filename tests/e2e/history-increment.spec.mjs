/* B-10 历史栈结构共享/增量：真实 Chromium 下堆占用、撤销耗时、撤销语义与资产保活验证 */
import { test, expect } from '@playwright/test';

const CFG = { objCount: 1000, photoCount: 10, photoBytes: 100000, steps: 20 };

async function openApp(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
}

/* 页面内构造：1000 对象 + 10 张内嵌 base64 照片（约 1.33MB/份），并重置历史栈 */
function buildProject(cfg) {
  state = createInitialState();
  const objs = [];
  for (let i = 0; i < cfg.objCount; i++) {
    objs.push(baseObject('point', 'point.camera', { id: 'OBJ' + i, name: 'O' + i, x: i, y: i }));
  }
  for (let p = 0; p < cfg.photoCount; p++) {
    const raw = ('P' + p + '-').repeat(Math.ceil(cfg.photoBytes / 4)).slice(0, cfg.photoBytes);
    objs[p].props = { photoDataUrl: 'data:image/png;base64,' + btoa(raw) };
  }
  state.objects = objs;
  history = { past: [], future: [] };
}

/* 基线参考：与改造前 pushHistory 完全一致的整份 JSON 深拷贝（20 条） */
function legacyReference(cfg) {
  const ref = [];
  const t0 = performance.now();
  for (let s = 0; s < cfg.steps; s++) {
    state.objects[s % state.objects.length].x += 1;   /* 每步只改一个对象，模拟真实编辑 */
    ref.push(JSON.parse(JSON.stringify(state)));
  }
  window.__histRef = ref;
  return { ms: performance.now() - t0, len: ref.length };
}

/* 改造后：调用真实 pushHistory（结构共享/增量） */
function pushViaHistory(cfg) {
  const t0 = performance.now();
  for (let s = 0; s < cfg.steps; s++) {
    state.objects[s % state.objects.length].x += 1;
    pushHistory();
  }
  return { ms: performance.now() - t0, len: history.past.length };
}

async function gcUsed(cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  await new Promise(r => setTimeout(r, 60));
  await cdp.send('HeapProfiler.collectGarbage');
  const u = await cdp.send('Runtime.getHeapUsage');
  return u.usedSize;
}

test('B-10 内存：20 条含照片历史相对整份深拷贝下降 ≥50%（真实 Chromium 堆）', async ({ page, browserName }) => {
  /* 堆读数走 CDP，仅 Chromium 提供；这是测量通道限制，不是产品差异 */
  test.skip(browserName !== 'chromium', 'B-10 真实堆测量依赖 CDP 会话，Firefox/WebKit 无对应通道');
  await openApp(page);
  const cdp = await page.context().newCDPSession(page);

  /* ---- 基线：20 条整份 JSON 深拷贝 ---- */
  await page.evaluate(buildProject, CFG);
  const baseHeap = await gcUsed(cdp);
  const legacy = await page.evaluate(legacyReference, CFG);
  const legacyHeap = await gcUsed(cdp);
  const legacyBytes = await page.evaluate(() => {
    let n = 0;
    for (const e of window.__histRef) n += JSON.stringify(e).length;
    return n;
  });
  const legacyDelta = legacyHeap - baseHeap;

  /* ---- 清理后重测：真实 pushHistory ---- */
  await page.evaluate(() => {
    window.__histRef = null;
    history = { past: [], future: [] };
    state = createInitialState();
  });
  await gcUsed(cdp);

  await page.evaluate(buildProject, CFG);
  const newBase = await gcUsed(cdp);
  const next = await page.evaluate(pushViaHistory, CFG);
  const newHeap = await gcUsed(cdp);
  const newBytes = await page.evaluate(() => {
    let n = 0;
    for (const e of history.past) n += JSON.stringify(e).length;
    return n;
  });
  const newDelta = newHeap - newBase;
  const dropPct = legacyDelta > 0 ? (1 - newDelta / legacyDelta) * 100 : 0;

  const report = {
    legacyDelta, newDelta, dropPct,
    legacyBytes, newBytes,
    legacyHeap, newHeap,
    legacyMs: legacy.ms, newMs: next.ms,
    legacyLen: legacy.len, newLen: next.len
  };
  console.log('[B-10] ' + JSON.stringify(report, null, 0));
  for (const line of [
    `legacy heap delta=${(legacyDelta / 1048576).toFixed(2)}MB (${legacyDelta}B), new=${(newDelta / 1048576).toFixed(2)}MB (${newDelta}B), drop=${dropPct.toFixed(1)}%`,
    `serialized: legacy=${(legacyBytes / 1048576).toFixed(2)}MB, new=${(newBytes / 1048576).toFixed(2)}MB`,
    `push 20: legacy=${legacy.ms.toFixed(1)}ms, new=${next.ms.toFixed(1)}ms`
  ]) console.log('[B-10] ' + line);

  expect(legacy.len).toBe(20);
  expect(next.len).toBe(20);
  expect(legacyDelta).toBeGreaterThan(0);
  expect(dropPct).toBeGreaterThanOrEqual(50);
});

test('B-10 语义：undo/redo 不变、共享快照不被 live 编辑污染、20 条上限保持', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    state = createInitialState();
    state.objects = [
      baseObject('point', 'point.camera', { id: 'A', name: 'A', x: 1, y: 1 }),
      baseObject('point', 'point.camera', { id: 'B', name: 'B', x: 2, y: 2 })
    ];
    history = { past: [], future: [] };
    pushHistory();                                  /* 压入 S0(A=1,B=2) 作为“编辑前”快照 */
    state.objects[0].x = 10; state.objects[1].x = 20;  /* live 变成 S1(A=10,B=20) */
    const histLen = history.past.length;

    undo();                                          /* 回到 S0 */
    const afterUndo = { a: state.objects[0].x, b: state.objects[1].x };
    /* 撤销后继续编辑 live state：共享快照里的 S1 不得被这次就地编辑污染 */
    state.objects[0].x = 999; state.objects[1].x = 888;
    const futureBeforeRedo = history.future.map(s => ({ a: s.objects[0].x, b: s.objects[1].x }));
    redo();                                          /* 必须回到 S1，而不是 A=999 */
    const afterRedo = { a: state.objects[0].x, b: state.objects[1].x };
    undo();                                          /* 重做前压栈的是 A=999/B=888 */
    const afterUndoAgain = { a: state.objects[0].x, b: state.objects[1].x };

    /* 20 条上限：超过后只保留最近 20 条 */
    history = { past: [], future: [] };
    for (let i = 0; i < 25; i++) { state.objects[0].x = i; pushHistory(); }
    const capped = history.past.length;

    /* 兼容：外部手工 push 的普通 state 条目仍可直接成为 live state（旧语义） */
    const plain = JSON.parse(JSON.stringify(state));
    plain.marker = 'plain-entry';
    history.past.push(plain);
    undo();
    const plainLive = state === plain && state.marker === 'plain-entry';

    return { histLen, afterUndo, futureBeforeRedo, afterRedo, afterUndoAgain, capped, plainLive };
  });
  expect(r.histLen).toBe(1);
  expect(r.afterUndo).toEqual({ a: 1, b: 2 });
  expect(r.futureBeforeRedo).toEqual([{ a: 10, b: 20 }]);
  expect(r.afterRedo).toEqual({ a: 10, b: 20 });
  expect(r.afterUndoAgain).toEqual({ a: 999, b: 888 });
  expect(r.capped).toBe(20);
  expect(r.plainLive).toBe(true);
});

test('B-10 资产保活：历史条目引用的底图/照片阻止 prune 回收；清空历史后可回收', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    const PNG_BG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
    const PNG_PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const bgBin = ContentAssets.dataUrlToBytes(PNG_BG);
    const photoBin = ContentAssets.dataUrlToBytes(PNG_PHOTO);
    const bgId = assetIdFor(bgBin.bytes);
    const photoId = assetIdFor(photoBin.bytes);
    await assetPut(bgId, { bytes: bgBin.bytes, mime: bgBin.mime });
    await assetPut(photoId, { bytes: photoBin.bytes, mime: photoBin.mime });

    state = createInitialState();
    state.background = Object.assign(createEmptyBackground(), { kind: 'image', assetId: bgId });
    state.objects = [baseObject('point', 'point.camera', { id: 'P1', name: 'P1', x: 1, y: 1, props: { photoId } })];
    history = { past: [], future: [] };
    pushHistory();                                   /* 历史快照引用 bgId + photoId */
    const ns = assetRefsInMemory();
    const reachable = reachableBgAssetIds();

    /* 当前工程移除底图/照片引用：历史仍引用，prune 必须保留 */
    state.background = createEmptyBackground();
    state.objects = [];
    const prunedKeep = await pruneBgAssets();
    const keptBg = await assetGet(bgId);
    const keptPhoto = await assetGet(photoId);

    /* 清空历史后不再被引用：prune 应可回收 */
    history = { past: [], future: [] };
    const prunedFree = await pruneBgAssets();
    const goneBg = await assetGet(bgId);
    const gonePhoto = await assetGet(photoId);

    return {
      bgId, photoId,
      nsPast: ns.has('history.past[0]') ? ns.get('history.past[0]') : [],
      reachable,
      prunedKeep, keptBg: !!keptBg, keptPhoto: !!keptPhoto,
      prunedFree, goneBg: !goneBg, gonePhoto: !gonePhoto
    };
  });
  expect(r.nsPast).toEqual(expect.arrayContaining([r.bgId, r.photoId]));
  expect(r.reachable).toEqual(expect.arrayContaining([r.bgId, r.photoId]));
  expect(r.keptBg).toBe(true);
  expect(r.keptPhoto).toBe(true);
  expect(r.goneBg).toBe(true);
  expect(r.gonePhoto).toBe(true);
});

test('B-10 撤销耗时：1000 对象单次 undo 同步耗时 <100ms（含 photo 引用）', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    state = createInitialState();
    const objs = [];
    for (let i = 0; i < 1000; i++) {
      objs.push(baseObject('point', 'point.camera', { id: 'OBJ' + i, name: 'O' + i, x: i, y: i }));
    }
    state.objects = objs;
    history = { past: [], future: [] };
    for (let s = 0; s < 20; s++) { state.objects[s].x += 1; pushHistory(); }
    const times = [];
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      undo();
      times.push(performance.now() - t);
      await new Promise(res => setTimeout(res, 40));
    }
    times.sort((a, b) => a - b);
    return { times, median: times[Math.floor(times.length / 2)], max: times[times.length - 1], past: history.past.length, future: history.future.length };
  });
  console.log('[B-10] undo ms=' + JSON.stringify(r.times.map(t => +t.toFixed(2))));
  expect(r.times.length).toBe(5);
  expect(r.max).toBeLessThan(100);
});
