/* p2-render.perf.mjs —— P2 批次 12–16 渲染热路径性能打点（先测后改）
 *
 * 只采集真实 Chromium 数据，不改业务代码。每条用例在改动前后用**同一命令**复测：
 *   node scripts/perf-browser.mjs --no-gate tests/perf/p2-render.perf.mjs
 * 数据写入 test-results/perf-render.json。
 *
 * 环境：1920x1080 CSS 视口 @DPR1，Chromium headless（本机 SwiftShader）。
 * 堆读数经 CDP HeapProfiler.collectGarbage 强制 GC 两次后取 Runtime.getHeapUsage usedSize。
 * 注意：SwiftShader 光栅化读数不代表真实 GPU 表现，只用于同机前后对比。
 */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installScene, hostSnapshot } from './fixture.mjs';

const OUT_DIR = join(process.cwd(), 'test-results');
const REPORT_FILE = join(OUT_DIR, 'perf-render.json');
const SIZES = [2000, 5000, 10000];
const results = [];
const NO_GATE = process.env.PERF_NO_GATE === '1';

/* 性能门禁：2026-11-14 本机两轮实测 P95 取较大值，再留 1.3–2 倍余量（明细见 backup/A4a/CHANGES.md）。
 * 取舍口径：只按「噪声上界 × 1.5 左右」定阈值，不允许为了好过放大到数百毫秒；
 * p95 落在计时分辨率下界（0.0ms）的热点给绝对下限值，不适用倍数口径。
 * --no-gate / PERF_NO_GATE=1 只采数不判定。 */
const GATES = {
  2000: {
    staticRebuild: 125, staticRebuildShapes: 250, panFrame: 10, zoomFrame: 110,
    staticKeyCost: 0.5, staticKeyCostBigSite: 0.8, objectIndexById: 0.4,
    dragMoveRebuildIndex: 0.4, dragMoveCachedIndex: 0.2, dragFrame: 10,
    dragSelectScanAll: 0.6, dragSelectById: 0.2, findIssues1000pt: 2, heapUsedMB: 8
  },
  5000: {
    staticRebuild: 280, staticRebuildShapes: 190, panFrame: 12, zoomFrame: 270,
    staticKeyCost: 0.5, staticKeyCostBigSite: 0.8, objectIndexById: 1.2,
    dragMoveRebuildIndex: 1, dragMoveCachedIndex: 0.2, dragFrame: 8,
    dragSelectScanAll: 2.2, dragSelectById: 0.2, heapUsedMB: 12
  },
  10000: {
    staticRebuild: 450, staticRebuildShapes: 220, panFrame: 13, zoomFrame: 450,
    staticKeyCost: 0.5, staticKeyCostBigSite: 0.8, objectIndexById: 2.2,
    dragMoveRebuildIndex: 2, dragMoveCachedIndex: 0.2, dragFrame: 8,
    dragSelectScanAll: 1.8, dragSelectById: 0.2, heapUsedMB: 19
  }
};

function round(v, n = 2) { return v === null || v === undefined ? null : Number(v.toFixed(n)); }
function pct(arr, p) {
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * p))];
}
function stat(arr) {
  return {
    n: arr.length,
    p50: round(pct(arr, 0.5)),
    p95: round(pct(arr, 0.95)),
    max: round(Math.max(...arr)),
    avg: round(arr.reduce((s, v) => s + v, 0) / arr.length)
  };
}
function record(name, size, arr, extra) {
  const data = Object.assign({ case: name, objects: size, ms: stat(arr) }, extra || {});
  results.push(data);
  console.log('[render] ' + JSON.stringify(data));
}
function save() {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT_FILE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    node: process.version,
    env: { viewport: '1920x1080', dpr: 1, headless: true, raster: 'SwiftShader', forcedGC: 'CDP HeapProfiler.collectGarbage ×2' },
    thresholds: GATES,
    gateEnabled: !NO_GATE,
    cases: results
  }, null, 2), 'utf8');
  console.log('\n[render] 报告已写入 ' + REPORT_FILE + '（' + results.length + ' 组用例）');
}

/** 对本轮 size 的实测值做绝对判据；任一超限即让用例失败（不再只打日志）。 */
function gate(size, cases) {
  if (NO_GATE) return;
  const g = GATES[size];
  const fails = [];
  for (const c of cases) {
    if (c.case === 'heapUsed') {
      const mb = c.bytes / 1048576;
      if (mb > g.heapUsedMB) fails.push(`heapUsed：实测 ${round(mb)}MB > 阈值 ${g.heapUsedMB}MB`);
      continue;
    }
    const limit = g[c.case];
    if (limit === undefined) {
      fails.push(`缺少阈值：${c.case}（GATES[${size}] 未登记，不能只采数不判定）`);
      continue;
    }
    if (c.ms.p95 > limit) fails.push(`${c.case}：P95 ${c.ms.p95}ms > 阈值 ${limit}ms`);
  }
  if (fails.length) console.error(`[render] 门禁失败，主机快照：${hostSnapshot()}`);
  expect(fails, `渲染性能门禁（${size} 对象）`).toEqual([]);
}
async function openApp(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state === 'object');
  if (await page.locator('#modalBackdrop').evaluate(el => el.classList.contains('show'))) {
    await page.click('#modalFooter button');
    await page.waitForFunction(() => !document.getElementById('modalBackdrop').classList.contains('show'));
  }
}
function heapProbe(cdp) {
  return async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    await new Promise(r => setTimeout(r, 60));
    await cdp.send('HeapProfiler.collectGarbage');
    return (await cdp.send('Runtime.getHeapUsage')).usedSize;
  };
}

test.describe('P2 批次 12–16 · 渲染热路径基线', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  test.afterAll(() => save());

  for (const size of SIZES) {
    test('对象数 ' + size, async ({ page }) => {
      test.setTimeout(300000);
      const startIdx = results.length;
      await openApp(page);
      const cdp = await page.context().newCDPSession(page);
      const gcUsed = heapProbe(cdp);
      await page.evaluate(installScene, size);
      await page.evaluate(() => { syncActiveFloor(); fitView(); requestRender(); });
      await page.waitForTimeout(400);
      const heapBase = await gcUsed();
      const meta = await page.evaluate(() => ({
        objects: state.objects.length,
        zoom: state.viewport.zoom,
        w: wrap.clientWidth,
        h: wrap.clientHeight,
        dpr
      }));

      /* 1) 静态层重建：作废后同一视口重绘（对象裁剪 + 光栅化） */
      const rebuild = await page.evaluate(() => {
        const out = [];
        for (let i = 0; i < 30; i++) {
          invalidateStatic();
          const t0 = performance.now();
          drawScene(ctx, state.viewport, wrap.clientWidth, wrap.clientHeight, { interactive: true, markerScale: 1 });
          out.push(performance.now() - t0);
        }
        return out;
      });
      record('staticRebuild', size, rebuild);

      /* 1b) 形状密集场景重建（P2-3）：全部为圆/椭圆/扇形，objectBounds 需 72 段采样 */
      const rebuildShapes = await page.evaluate(() => {
        const prev = state.objects;
        const tpl = baseObject('rect', 'rect.area', {});
        const list = [];
        for (let i = 0; i < 2000; i++) {
          const x = (i * 37) % 1900 + 20, y = (i * 53) % 1400 + 20;
          const r = i % 3;
          const o = Object.assign({}, tpl, {
            id: 'OBJ_SHAPE_' + i, name: 'S' + i, z: i, x, y,
            shape: r === 0 ? { type: 'circle', r: 6 }
              : r === 1 ? { type: 'ellipse', rx: 8, ry: 4, angle: 0.6 }
                : { type: 'sector', r: 7, a0: 20, a1: 160 }
          });
          list.push(o);
        }
        state.objects = list;
        invalidateStatic();
        const out = [];
        for (let i = 0; i < 20; i++) {
          invalidateStatic();
          const t0 = performance.now();
          drawScene(ctx, state.viewport, wrap.clientWidth, wrap.clientHeight, { interactive: true, markerScale: 1 });
          out.push(performance.now() - t0);
        }
        state.objects = prev;
        invalidateStatic();
        return out;
      });
      record('staticRebuildShapes', size === 2000 ? 2000 : size, rebuildShapes);

      /* 2) 平移帧：每帧改 pan 触发静态层重建（现状），60 帧 */
      const pan = await page.evaluate(() => {
        const v = state.viewport, base = v.panX, out = [];
        for (let i = 0; i < 60; i++) {
          v.panX = base + (i % 2 ? 40 : -40);
          const t0 = performance.now();
          drawScene(ctx, v, wrap.clientWidth, wrap.clientHeight, { interactive: true, markerScale: 1 });
          out.push(performance.now() - t0);
        }
        v.panX = base;
        return out;
      });
      record('panFrame', size, pan);

      /* 3) 缩放帧：每帧改 zoom（必然重建），30 帧 */
      const zoom = await page.evaluate(() => {
        const v = state.viewport, base = v.zoom, out = [];
        for (let i = 0; i < 30; i++) {
          v.zoom = base * (i % 2 ? 1.01 : 0.99);
          const t0 = performance.now();
          drawScene(ctx, v, wrap.clientWidth, wrap.clientHeight, { interactive: true, markerScale: 1 });
          out.push(performance.now() - t0);
        }
        v.zoom = base;
        return out;
      });
      record('zoomFrame', size, zoom);

      /* 4) 缓存签名成本：每帧都会执行（与是否重建无关） */
      const keyCost = await page.evaluate(() => {
        const d = worldDims(), out = [];
        for (let i = 0; i < 200; i++) {
          const t0 = performance.now();
          sceneStaticKey(state.viewport, wrap.clientWidth, wrap.clientHeight, d);
          out.push(performance.now() - t0);
        }
        return out;
      });
      record('staticKeyCost', size, keyCost);

      /* 4b) 大场地签名成本（P2-2）：3,000 节点多边形，逐帧 JSON.stringify(state.site) 的真实代价 */
      const bigSiteCost = await page.evaluate(() => {
        const prev = state.site;
        const pts = [];
        for (let i = 0; i < 3000; i++) {
          const a = (i / 3000) * Math.PI * 2;
          pts.push([1000 + Math.cos(a) * 900, 750 + Math.sin(a) * 700]);
        }
        state.site = createSiteSlot({ type: 'polygon', points: pts });
        const d = worldDims(), out = [];
        for (let i = 0; i < 200; i++) {
          const t0 = performance.now();
          sceneStaticKey(state.viewport, wrap.clientWidth, wrap.clientHeight, d);
          out.push(performance.now() - t0);
        }
        state.site = prev;
        invalidateStatic();
        return out;
      });
      record('staticKeyCostBigSite', size, bigSiteCost);

      /* 5) pointermove 索引重建成本（P2-5） */
      const idxCost = await page.evaluate(() => {
        const out = [];
        for (let i = 0; i < 100; i++) {
          const t0 = performance.now();
          objectIndexById();
          out.push(performance.now() - t0);
        }
        return out;
      });
      record('objectIndexById', size, idxCost);

      /* 6) 拖拽 pointermove 索引成本（P2-5）：对比「每帧重建」与「复用缓存索引」 */
      const dragLoop = await page.evaluate(() => {
        const list = state.objects, pick = list.slice(0, 8).map(o => o.id);
        const drag = { type: 'move', start: [0, 0], originals: new Map(), moved: true };
        pick.forEach(id => drag.originals.set(id, deepClone(list.find(o => o.id === id))));
        const rebuild = [], cached = [];
        for (let i = 0; i < 60; i++) {
          const t0 = performance.now();
          const idx = objectIndexById();
          pick.forEach(id => idx.get(id));
          rebuild.push(performance.now() - t0);
        }
        dragObjectIndex(drag);
        for (let i = 0; i < 60; i++) {
          const t0 = performance.now();
          const idx = dragObjectIndex(drag);
          pick.forEach(id => idx.get(id));
          cached.push(performance.now() - t0);
        }
        return { rebuild, cached };
      });
      record('dragMoveRebuildIndex', size, dragLoop.rebuild);
      record('dragMoveCachedIndex', size, dragLoop.cached);

      /* 7) 拖拽帧（P2-4）：200 个对象参与拖拽，静态层命中缓存后的逐帧动态层成本 */
      const dragFrame = await page.evaluate(() => {
        const pick = state.objects.slice(0, 200);
        const d = { type: 'move', start: [0, 0], originals: new Map(), moved: true };
        pick.forEach(o => d.originals.set(o.id, deepClone(o)));
        d.index = objectIndexById();
        const prev = drag; drag = d;
        invalidateStatic();
        drawScene(ctx, state.viewport, wrap.clientWidth, wrap.clientHeight, { interactive: true, markerScale: 1 });
        const out = [];
        const oldSel = [], newSel = [];
        const ds = new Set(pick.map(o => o.id));
        for (let i = 0; i < 30; i++) {
          pick.forEach(o => { o.x += 0.5; });
          const ts = performance.now();
          state.objects.filter(o => ds.has(o.id)).sort((a, b) => a.z - b.z);
          oldSel.push(performance.now() - ts);
          const ts2 = performance.now();
          pick.map(o => d.index.get(o.id)).filter(Boolean).sort((a, b) => a.z - b.z);
          newSel.push(performance.now() - ts2);
          const t0 = performance.now();
          drawScene(ctx, state.viewport, wrap.clientWidth, wrap.clientHeight, { interactive: true, markerScale: 1 });
          out.push(performance.now() - t0);
        }
        drag = prev;
        pick.forEach(o => { o.x -= 15; });
        invalidateStatic();
        return { frame: out, oldSel, newSel };
      });
      record('dragFrame', size, dragFrame.frame);
      record('dragSelectScanAll', size, dragFrame.oldSel);
      record('dragSelectById', size, dragFrame.newSel);

      /* 8) findIssues 自交检测（F16）：单个 1000 点闭合轮廓 */
      if (size === 2000) {
        const issueCost = await page.evaluate(() => {
          const prev = state.objects;
          const pts = [];
          for (let i = 0; i < 1000; i++) {
            const a = i / 1000 * Math.PI * 2;
            pts.push([Math.cos(a) * 50, Math.sin(a) * 50]);
          }
          state.objects = [baseObject('line', 'line.custom', { name: 'P', closed: true, points: pts })];
          resetFrameRef();
          const out = [];
          for (let i = 0; i < 30; i++) {
            const t0 = performance.now();
            findIssues();
            out.push(performance.now() - t0);
          }
          state.objects = prev;
          return out;
        });
        record('findIssues1000pt', 1000, issueCost);
      }

      /* 6) 强制 GC 后堆占用 */
      const heapAfter = await gcUsed();
      results.push({ case: 'heapUsed', objects: size, bytes: heapAfter, baseBytes: heapBase, deltaBytes: heapAfter - heapBase });
      console.log('[render] ' + JSON.stringify({ case: 'heapUsed', objects: size, bytes: heapAfter, deltaBytes: heapAfter - heapBase }));
      void meta;
      gate(size, results.slice(startIdx));
    });
  }
});
