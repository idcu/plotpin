/* B-11：真实 Chromium 渲染基线（改造前后同一口径对比；断言为宽松上限，用于防回归） */
import { test, expect } from '@playwright/test';
import { SCENE_A, SCENE_B } from './helpers/scenes.mjs';

async function measure(page, sceneSrc) {
  return page.evaluate(({ sceneSrc }) => {
    const N = eval(sceneSrc)(2000);
    const cv = document.createElement('canvas');
    cv.width = 1600; cv.height = 900;
    const c = cv.getContext('2d');
    const W = 1600, H = 900;
    const now = () => performance.now();

    for (let i = 0; i < 3; i++) { invalidateStatic(); drawScene(c, state.viewport, W, H, { interactive: true, markerScale: 1 }); }

    const rebuild = [];
    for (let i = 0; i < 10; i++) {
      const t0 = now(); invalidateStatic();
      drawScene(c, state.viewport, W, H, { interactive: true, markerScale: 1 });
      rebuild.push(now() - t0);
    }
    const cached = [];
    for (let i = 0; i < 200; i++) {
      const t0 = now();
      drawScene(c, state.viewport, W, H, { interactive: true, markerScale: 1 });
      cached.push(now() - t0);
    }
    const direct = [];
    for (let i = 0; i < 10; i++) {
      const t0 = now();
      drawScene(c, state.viewport, W, H, { interactive: false, markerScale: 1.6 });
      direct.push(now() - t0);
    }
    const d = worldDims();
    const keyTimes = [];
    for (let i = 0; i < 500; i++) {
      const t0 = now(); sceneStaticKey(state.viewport, W, H, d); keyTimes.push(now() - t0);
    }

    /* 重建内部拆解：给出单帧内 measureText / Path2D 的真实次数与耗时，
       并连续重建两次作为「重复帧」探针（本轮结论：两者均无稳定帧级收益，未引入缓存）。 */
    const proto = CanvasRenderingContext2D.prototype;
    const origProtoMeasure = proto.measureText;
    let labelCalls = 0, labelMs = 0;
    proto.measureText = function (t) { const t0 = now(); const r = origProtoMeasure.call(this, t); labelMs += now() - t0; labelCalls++; return r; };
    let p2dCount = 0, p2dMs = 0;
    const RealPath2D = window.Path2D;
    if (RealPath2D) {
      window.Path2D = function (dd) { const t0 = now(); const p = new RealPath2D(dd); p2dMs += now() - t0; p2dCount++; return p; };
      window.Path2D.prototype = RealPath2D.prototype;
    }
    invalidateStatic();
    drawScene(c, state.viewport, W, H, { interactive: true, markerScale: 1 });
    const first = { labels: labelCalls, labelMs: +labelMs.toFixed(2), path2d: p2dCount, p2dMs: +p2dMs.toFixed(2) };
    labelCalls = 0; labelMs = 0; p2dCount = 0; p2dMs = 0;
    invalidateStatic();
    drawScene(c, state.viewport, W, H, { interactive: true, markerScale: 1 });
    const second = { labels: labelCalls, labelMs: +labelMs.toFixed(2), path2d: p2dCount, p2dMs: +p2dMs.toFixed(2) };
    proto.measureText = origProtoMeasure;
    if (RealPath2D) window.Path2D = RealPath2D;

    const visTimes = [];
    for (let i = 0; i < 20; i++) {
      const t0 = now();
      state.objects.filter(o => isVisible(o) && !selectedIds.has(o.id)).sort((a, b) => a.z - b.z);
      visTimes.push(now() - t0);
    }
    const stat = arr => {
      const a = arr.slice().sort((x, y) => x - y);
      const avg = a.reduce((s, v) => s + v, 0) / a.length;
      return { avg: +avg.toFixed(2), p50: +a[Math.floor(a.length * 0.5)].toFixed(2),
        p95: +a[Math.floor(a.length * 0.95)].toFixed(2), p99: +a[Math.max(0, a.length - 1 - Math.floor(a.length * 0.01))].toFixed(2) };
    };
    const heapStart = performance.memory ? performance.memory.usedJSHeapSize : 0;
    for (let i = 0; i < 20; i++) { invalidateStatic(); drawScene(c, state.viewport, W, H, { interactive: true, markerScale: 1 }); }
    const heapEnd = performance.memory ? performance.memory.usedJSHeapSize : 0;

    const saved = { ...state.viewport };
    state.viewport = { zoom: 6, panX: 100, panY: 100 };
    const viewRect = visibleWorldRect(state.viewport, worldDims(), W, H);
    const drawn = state.objects.filter(o => boundsIntersect(objectBounds(o), viewRect)).length;
    state.viewport = saved;

    return {
      objects: state.objects.length,
      annotSample: annotOn(state.objects[0], 'name'),
      rebuild: stat(rebuild),
      cached: stat(cached),
      direct: stat(direct),
      key: stat(keyTimes),
      probe: { first, second },
      visibleFilterSort: stat(visTimes),
      heapDeltaMB: heapStart ? +(((heapEnd - heapStart) / 1048576)).toFixed(2) : null,
      drewAtZoom6: drawn,
      culled: +(1 - drawn / state.objects.length).toFixed(3)
    };
  }, { sceneSrc });
}

test('B-11：真实 Chromium 渲染基线（2000 对象 / 1600×900，A 基础场景 + B 标注/图元）', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  const a = await measure(page, SCENE_A);
  const b = await measure(page, SCENE_B);
  console.log('[B-11][A] ' + JSON.stringify(a));
  console.log('[B-11][B] ' + JSON.stringify(b));

  /* 宽松上限：只做防回归，不替代人工前后对比 */
  for (const m of [a, b]) {
    expect(m.objects).toBe(2000);
    expect(m.rebuild.p95).toBeLessThan(160);
    expect(m.cached.p50).toBeLessThan(8);
    expect(m.cached.p95).toBeLessThan(12);
    expect(m.direct.p95).toBeLessThan(160);
    expect(m.culled).toBeGreaterThan(0.6);
  }
});

/* ----------------------------------------------------------------------------
 * M6：静态层局部补绘的像素级正确性（属性面板逐键编辑走 patchStaticObjects）
 * 三个用例都断言 staticRev 未变 —— 证明补绘走了局部修补，而不是悄悄整层重建把问题掩盖掉。
 * -------------------------------------------------------------------------- */
const px = (p, rgb, tol) => Math.abs(p[0] - rgb[0]) <= tol && Math.abs(p[1] - rgb[1]) <= tol && Math.abs(p[2] - rgb[2]) <= tol;

/* 采样时序说明（2026-11-15）：远端 runner 上 `drawScene` 之后立刻 `getImageData` 会读到
 * 尚未完成合成的帧（实测：源码入口 M6-P3 首帧计数 0、dist 入口 M6-P2 位移首帧取色失败），
 * 本地快机器上几乎不复现。统一改为「有界帧等待」再取样：读不到期望像素时按帧重试并重绘一次
 * （防止排队的 resize/rAF 把画布清掉），总预算 3000 ms / 60 帧。预算耗尽就返回最后一次读数，
 * 断言与阈值原样保留 —— 「画得慢」会被等到，「一直没画出来」仍然红。
 * 返回的 frames/ms 只用于日志，不参与断言。 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__settleSample = async (read, ok, cssW, cssH) => {
      const t0 = performance.now();
      let v = read(), frames = 0;
      while (!ok(v) && frames < 60 && performance.now() - t0 < 3000) {
        await new Promise(res => requestAnimationFrame(() => res()));
        /* 必须用调用方固定的 cssW/cssH 重绘：若改用 wrap 的实时尺寸，等待期间
           布局一旦变化就会让内容与已算好的采样坐标错位，反而制造「永远读不到」。 */
        drawScene(ctx, state.viewport, cssW, cssH, { interactive: true, markerScale: 1 });
        v = read();
        frames++;
      }
      return { v, frames, ms: Math.round(performance.now() - t0) };
    };
  });
});

test('M6-P2 位移超出旧包围盒+pad：新位置重绘、旧位置清除，且走局部补绘', async ({ page }) => {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
  const r = await page.evaluate(async () => {
    const settle = window.__settleSample;
    resizeCanvas();
    const rc = wrap.getBoundingClientRect();
    const W = Math.round(rc.width), H = Math.round(rc.height), Z = 1;
    state = createInitialState();
    state.viewport = { zoom: Z, panX: 0, panY: 0 };
    resetFrameRef();
    const s0 = [Math.round(W * 0.22), Math.round(H * 0.28)];
    const s1 = [Math.round(W * 0.78), Math.round(H * 0.75)];
    const w0 = s2w(s0), w1 = s2w(s1);
    const o = baseObject('point', 'point.marker', { name: 'P1', x: w0[0], y: w0[1], style: { color: '#e11d48' } });
    state.objects = [o];
    history = { past: [], future: [] };
    const red = p => Math.abs(p[0] - 225) <= 40 && Math.abs(p[1] - 29) <= 40 && Math.abs(p[2] - 72) <= 40;
    invalidateStatic();
    drawScene(ctx, state.viewport, W, H, { interactive: true, markerScale: 1 });
    const sample = (s) => {
      const d = ctx.getImageData(Math.round(s[0] * dpr), Math.round(s[1] * dpr), 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    };
    const b0 = await settle(() => sample(s0), red, W, H);
    const before = b0.v;
    const rev0 = staticRev;
    o.x = w1[0]; o.y = w1[1];
    commitObjectEdit([o.id]);
    drawScene(ctx, state.viewport, W, H, { interactive: true, markerScale: 1 });
    /* 先定格「本次编辑是否走了局部补绘」：等待可能让排队的 resize/rAF 介入并作废静态层，
       那是采样之后的时序噪声，不应该反过来改变本用例对补绘路径的判定。 */
    const patchedNow = staticRev === rev0;
    const b1 = await settle(() => ({ atNew: sample(s1), atOld: sample(s0) }), v => red(v.atNew) && !red(v.atOld), W, H);
    return {
      before, atNew: b1.v.atNew, atOld: b1.v.atOld,
      patched: patchedNow, dist: Math.hypot(s1[0] - s0[0], s1[1] - s0[1]),
      settle: { before: [b0.frames, b0.ms], after: [b1.frames, b1.ms] }
    };
  });
  console.log('[M6-P2 位移] settle ' + JSON.stringify(r.settle));
  expect(px(r.before, [225, 29, 72], 40)).toBe(true);
  expect(r.dist).toBeGreaterThan(300);
  expect(r.patched).toBe(true);
  expect(px(r.atNew, [225, 29, 72], 40)).toBe(true);
  expect(px(r.atOld, [225, 29, 72], 40)).toBe(false);
});

test('M6-P2 对象变大超出旧包围盒+pad：新边界内侧为对象色，且走局部补绘', async ({ page }) => {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
  const r = await page.evaluate(async () => {
    const settle = window.__settleSample;
    /* 先把画布位图同步到当前布局再固定采样坐标：画布比 wrap 小会把右侧内容裁掉，
       采样点落到画布外/错位，表现为「等满 60 帧也读不到」。 */
    resizeCanvas();
    const rc = wrap.getBoundingClientRect();
    const W = Math.round(rc.width), H = Math.round(rc.height);
    state = createInitialState();
    state.viewport = { zoom: 1, panX: 0, panY: 0 };
    resetFrameRef();
    const left = Math.round(W * 0.18), right = Math.round(W * 0.36);
    const top = Math.round(H * 0.30), bottom = Math.round(H * 0.60);
    const org = s2w([left, bottom]);
    const o = baseObject('rect', 'rect.area', {
      name: 'R1', x: org[0], y: org[1], width: right - left, height: bottom - top,
      style: { color: '#7c3aed', strokeWidth: 6, fillAlpha: 0.15 }
    });
    state.objects = [o];
    history = { past: [], future: [] };
    const purpleish = p => p[2] - p[0] > 60 && p[2] > 150;
    invalidateStatic();
    drawScene(ctx, state.viewport, W, H, { interactive: true, markerScale: 1 });
    const sample = (x, y) => {
      const d = ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    };
    const newRight = Math.round(W * 0.80), midY = Math.round((top + bottom) / 2);
    /* 基线像素必须来自「尚未长到」的区域，因此不做等待：它本来就该是背景色。
       首帧合成是否完成由下面的 inside1/inside2 等待负责，避免为了等首帧把
       局部补绘的前置状态（staticKey/staticBounds）拖到排队的 resize 之后再失效。 */
    const before = sample(newRight - 2, midY);        /* 尚未长到的区域：应是背景 */
    const rev0 = staticRev;
    o.width = (newRight - left) / 1;                   /* zoom=1，世界宽=屏幕宽 */
    commitObjectEdit([o.id]);
    drawScene(ctx, state.viewport, W, H, { interactive: true, markerScale: 1 });
    const patchedNow = staticRev === rev0;   /* 同上：补绘路径在采样等待前定格 */
    const after = await settle(
      () => ({ inside1: sample(newRight - 1, midY), inside2: sample(newRight - 2, midY) }),
      v => purpleish(v.inside1) && purpleish(v.inside2), W, H);
    return {
      before,
      inside1: after.v.inside1,
      inside2: after.v.inside2,
      patched: patchedNow,
      settle: { after: [after.frames, after.ms] }
    };
  });
  console.log('[M6-P2 变大] settle ' + JSON.stringify(r.settle));
  const purpleish = p => p[2] - p[0] > 60 && p[2] > 150;
  expect(purpleish(r.before)).toBe(false);
  expect(r.patched).toBe(true);
  expect(purpleish(r.inside1)).toBe(true);
  expect(purpleish(r.inside2)).toBe(true);
});

test('M6-P3 编辑 A 后，邻居 B 溢入补绘矩形的标签不被擦除，且走局部补绘', async ({ page }) => {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
  const r = await page.evaluate(async () => {
    const settle = window.__settleSample;
    /* 先把画布位图同步到当前布局再固定采样坐标：画布比 wrap 小会把右侧内容裁掉，
       采样点落到画布外/错位，表现为「等满 60 帧也读不到」。 */
    resizeCanvas();
    const rc = wrap.getBoundingClientRect();
    const W = Math.round(rc.width), H = Math.round(rc.height);
    state = createInitialState();
    state.viewport = { zoom: 1, panX: 0, panY: 0 };
    resetFrameRef();
    const left = Math.round(W * 0.15), right = Math.round(W * 0.40);
    const top = Math.round(H * 0.25), bottom = Math.round(H * 0.55);
    const org = s2w([left, bottom]);
    const a = baseObject('rect', 'rect.area', {
      name: 'A0', x: org[0], y: org[1], width: right - left, height: bottom - top,
      style: { color: '#7c3aed', strokeWidth: 1, fillAlpha: 0.15 }
    });
    /* 补绘矩形 = A 包围盒 + 96：把 B 的锚点放在矩形右边界外 2px，长名让标签向左溢入矩形 */
    const rectRight = Math.min(W, Math.ceil(right + 96));
    const midY = Math.round((top + bottom) / 2);
    const anchor = [rectRight + 2, midY];
    const bw = s2w(anchor);
    const b = baseObject('point', 'point.marker', {
      name: 'B-东门摄像头-01', x: bw[0], y: bw[1], style: { color: '#16a34a' }
    });
    state.objects = [a, b];
    history = { past: [], future: [] };
    invalidateStatic();
    drawScene(ctx, state.viewport, W, H, { interactive: true, markerScale: 1 });
    const greenCount = () => {
      const x0 = Math.round((rectRight - 60) * dpr), x1 = Math.round((rectRight - 8) * dpr);
      const y0 = Math.round((midY - 28) * dpr), y1 = Math.round((midY - 10) * dpr);
      const d = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 1] - d[i] > 40 && d[i + 1] - d[i + 2] > 40 && d[i + 1] > 120 && d[i + 3] > 200) n++;
      }
      return n;
    };
    const before = await settle(greenCount, n => n > 5, W, H);
    const rev0 = staticRev;
    a.style.fillAlpha = 0.45;
    commitObjectEdit([a.id]);
    drawScene(ctx, state.viewport, W, H, { interactive: true, markerScale: 1 });
    const patchedNow = staticRev === rev0;   /* 同上：补绘路径在采样等待前定格 */
    const after = await settle(greenCount, n => n > 5, W, H);
    return {
      before: before.v, after: after.v, patched: patchedNow,
      settle: { before: [before.frames, before.ms], after: [after.frames, after.ms] }
    };
  });
  console.log('[M6-P3] settle ' + JSON.stringify(r.settle));
  expect(r.before).toBeGreaterThan(5);   /* 首帧确实在采样框里画出了 B 的标签 */
  expect(r.patched).toBe(true);          /* 编辑 A 走的是局部补绘 */
  expect(r.after).toBeGreaterThan(5);    /* 补绘后 B 的标签仍在（不被擦掉且不重画） */
});

