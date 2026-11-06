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
