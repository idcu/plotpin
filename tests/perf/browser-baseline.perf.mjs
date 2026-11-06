/* browser-baseline.perf.mjs —— B-01 真实浏览器渲染基线（Chromium + 真实 Canvas2D）
 *
 * 与 scripts/bench.mjs 的差异（不得混用数据）：
 *   bench.mjs    Node + canvas 桩，无真实光栅化/合成器，只守“相对退化”
 *   本用例       真实 Chromium、真实 Canvas2D 光栅化（getImageData 强制同步）
 *
 * 场景：1920×1080 CSS 视口（DPR 1，另加一组 DPR 2 采样），世界域 2000×1500m，
 * 对象构成 1/3 point.marker + 1/3 rect.area + 1/3 line.custom（3 节点折线），
 * 全部落在视野内（最坏情况的静态层重建）。
 *
 * 指标：每帧主线程耗时 P50/P95/P99（含强制光栅同步）、静态层重建、导入耗时、
 * performance.memory heapUsed（含逐帧采样峰值）、画布/静态层显存字节。
 *
 * 运行：node scripts/perf-browser.mjs   （门禁默认开启；PERF_NO_GATE=1 只采数）
 */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = join(process.cwd(), 'test-results');
const REPORT_FILE = join(OUT_DIR, 'perf-browser-baseline.json');
const results = [];
const NO_GATE = process.env.PERF_NO_GATE === '1';

/* 门禁阈值：2026-11-06 本机实测值留约 2 倍余量（明细见 docs/engineering.md §5.4）。
 * 真机/CI 机器性能差异大，本套件默认不进 npm run ci，只在显式 perf:browser 时生效。
 * 导入 O(N²) 已修（B-01 后续），「已有工程内导入」阈值随实测收紧，不再靠松阈值放行。 */
const GATES = {
  '2000@1': { frameP95: 16.7, rebuildP95: 100, heapPeakMB: 64, importEmptyMs: 300, importOverExistingMs: 250, staticMB: 8 },
  '5000@1': { frameP95: 16.7, rebuildP95: 250, heapPeakMB: 128, importEmptyMs: 500, importOverExistingMs: 400, staticMB: 8 },
  '10000@1': { frameP95: 16.7, rebuildP95: 450, heapPeakMB: 200, importEmptyMs: 900, importOverExistingMs: 900, staticMB: 8 },
  '5000@2': { frameP95: 33.3, rebuildP95: 500, heapPeakMB: 128, importEmptyMs: 600, importOverExistingMs: 600, staticMB: 32 }
};

function round(v, n = 2) {
  return v === null || v === undefined ? null : Number(v.toFixed(n));
}

/** 在页面内构造场景并采集一轮数据 */
async function collect(page, scale) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');

  const data = await page.evaluate(async ({ scale }) => {
    const now = () => performance.now();
    const flush = () => ctx.getImageData(0, 0, 1, 1);
    const draw = () => drawScene(ctx, state.viewport, wrap.clientWidth, wrap.clientHeight, { interactive: true, markerScale: 1 });
    const rendererInfo = () => {
      try {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
        if (!gl) return 'no-webgl';
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      } catch (e) { return 'error:' + e.message; }
    };
    const heapMB = () => (performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(2) : null);

    /* ---------- 场景构造：与 bench.mjs 相同的分布与构成，便于对照 ---------- */
    state.background = createEmptyBackground();
    state.site = createSiteSlot({ type: 'rect', w: 2000, h: 1500 });
    state.layers = [{ id: 'layer.default', name: '默认图层', visible: true, locked: false }];
    state.settings = Object.assign({}, state.settings, {
      gridVisible: true, showLabels: true, showAreaTag: true, showSegLen: true,
      showCursor: true, snap: true, markerScale: 1,
      siteNodes: true, siteSegLen: true, siteArea: true, sitePerimeter: true
    });
    state.floors = [{ id: 'floor.default', name: '1F', updatedAt: nowISO() }];
    state.activeFloorId = 'floor.default';
    state.tombstones = [];

    /* 模板来自 baseObject，避免手抄默认字段；每个对象浅拷贝并覆盖 id/name/z/几何 */
    const pTpl = baseObject('point', 'point.marker', {});
    const rTpl = baseObject('rect', 'rect.area', {});
    const lTpl = baseObject('line', 'line.custom', {});
    const objs = [];
    for (let i = 0; i < scale; i++) {
      const x = (i * 37) % 1900 + 20, y = (i * 53) % 1400 + 20;
      let o;
      if (i % 3 === 0) o = Object.assign({}, pTpl, { x, y });
      else if (i % 3 === 1) o = Object.assign({}, rTpl, { x, y, width: 4 + (i % 7), height: 3 + (i % 5) });
      else o = Object.assign({}, lTpl, { x, y, points: [[x, y], [x + 6, y], [x + 6, y + 4]] });
      o.id = 'OBJ_PERF_' + i;
      o.name = 'P' + i;
      o.z = i;
      objs.push(o);
    }
    state.objects = objs;
    selectedIds.clear();
    resetFrameRef();
    resizeCanvas();
    fitView();                       /* 全视野：最坏情况的静态层重建 */
    /* 让 resizeCanvas/fitView 排队的 rAF 先执行完，避免混进测量区间 */
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    /* 预热：静态层 + 动态层各画几帧 */
    for (let i = 0; i < 3; i++) { invalidateStatic(); draw(); flush(); }
    invalidateStatic();
    draw(); flush();
    const heapBaseMB = heapMB();

    /* ---------- 1) 静态层重建（每次强制失效） ---------- */
    const rebuildDraw = [], rebuildFlush = [];
    let heapPeakMB = heapBaseMB || 0;
    for (let i = 0; i < 8; i++) {
      invalidateStatic();
      const t0 = now(); draw(); const t1 = now(); flush(); const t2 = now();
      rebuildDraw.push(t1 - t0);
      rebuildFlush.push(t2 - t1);
      const h = heapMB(); if (h !== null) heapPeakMB = Math.max(heapPeakMB, h);
    }

    /* ---------- 2) 缓存命中帧：拖拽 1 个选中对象（静态层命中） ---------- */
    const sel = state.objects[1];
    selectedIds.add(sel.id);
    invalidateStatic(); draw(); flush();          /* 让静态层不含选中对象 */
    const baseX = sel.x;
    const frameTotal = [], frameDraw = [], heapSeries = [];
    for (let i = 0; i < 150; i++) {
      sel.x = baseX + (i % 5) * 0.01;               /* 模拟拖拽，每帧都有动态层变化 */
      const t0 = now(); draw(); const t1 = now(); flush(); const t2 = now();
      frameDraw.push(t1 - t0);
      frameTotal.push(t2 - t0);
      if (i % 10 === 0) { const h = heapMB(); if (h !== null) { heapPeakMB = Math.max(heapPeakMB, h); heapSeries.push(h); } }
    }
    const staticBytesMB = staticCanvas ? +(staticCanvas.width * staticCanvas.height * 4 / 1048576).toFixed(2) : 0;

    /* ---------- 3) 导出序列化 + JSON 导入（真实 importJsonFile 事务路径） ---------- */
    const tSer0 = now();
    const text = JSON.stringify(persistableState());
    const serializeMs = now() - tSer0;
    const file = new File([text], 'perf-' + scale + '.json', { type: 'application/json' });

    const tImp0 = now();
    await importJsonFile(file);
    const importMs = now() - tImp0;
    const importedCount = state.objects.length;
    const heapAfterImportMB = heapMB();
    if (heapAfterImportMB !== null) heapPeakMB = Math.max(heapPeakMB, heapAfterImportMB);

    /* 诊断：同一份 JSON 从「空工程」导一次。对比上面「当前已有 N 个对象」的结果，
       可区分导入成本是随 JSON 规模增长，还是被现有 state 规模拖成 O(N²)。 */
    state = createInitialState();
    selectedIds.clear();
    resetFrameRef();
    const tImpE0 = now();
    await importJsonFile(file);
    const importEmptyMs = now() - tImpE0;
    const heapAfterEmptyMB = heapMB();
    if (heapAfterEmptyMB !== null) heapPeakMB = Math.max(heapPeakMB, heapAfterEmptyMB);

    /* 导入后的首帧（静态层必须重建）：反映“打开大工程”的首屏成本 */
    invalidateStatic();
    const tIr0 = now(); draw(); const tIr1 = now(); flush(); const tIr2 = now();

    /* 视口内实际参与绘制的对象数（验证确实是“全视野”最坏情况） */
    const view = visibleWorldRect(state.viewport, worldDims(), wrap.clientWidth, wrap.clientHeight);
    const drawn = state.objects.filter(o => boundsIntersect(objectBounds(o), view)).length;

    return {
      scale,
      width: wrap.clientWidth, height: wrap.clientHeight,
      dpr: window.devicePixelRatio,
      renderingMode: document.getElementById('canvas').width !== wrap.clientWidth ? 'dpr-scaled' : 'css-pixels',
      canvasBacking: [document.getElementById('canvas').width, document.getElementById('canvas').height],
      staticBacking: staticCanvas ? [staticCanvas.width, staticCanvas.height] : null,
      staticBytesMB,
      renderer: rendererInfo(),
      hardwareConcurrency: navigator.hardwareConcurrency,
      mix: { point: Math.round(scale / 3), rect: Math.round(scale / 3), line: scale - 2 * Math.round(scale / 3) },
      drawnObjects: drawn,
      zoom: +state.viewport.zoom.toFixed(3),
      world: { w: 2000, h: 1500 },
      rebuild: {
        p50: pctVal(rebuildDraw, 0.5), p95: pctVal(rebuildDraw, 0.95),
        max: Math.max(...rebuildDraw), flushP50: pctVal(rebuildFlush, 0.5)
      },
      frame: {
        p50: pctVal(frameTotal, 0.5), p95: pctVal(frameTotal, 0.95), p99: pctVal(frameTotal, 0.99),
        max: Math.max(...frameTotal), drawP50: pctVal(frameDraw, 0.5), drawP95: pctVal(frameDraw, 0.95)
      },
      heap: { baseMB: heapBaseMB, peakMB: heapPeakMB, afterImportMB: heapAfterImportMB, afterEmptyImportMB: heapAfterEmptyMB },
      serializeMs, importMs, importEmptyMs, importRebuildMs: tIr2 - tIr0, importedCount,
      importDrawMs: tIr1 - tIr0
    };

    function pctVal(arr, p) {
      const a = [...arr].sort((x, y) => x - y);
      return a[Math.min(a.length - 1, Math.floor(a.length * p))];
    }
  }, { scale });

  return { ...data, pageErrors: errors };
}

function record(data) {
  results.push(data);
  const label = `${data.scale} 对象 @ ${data.width}×${data.height} DPR${data.dpr}`;
  console.log(`\n[perf] ${label}（渲染器：${data.renderer}，视野内 ${data.drawnObjects} 个，静态层 ${data.staticBytesMB}MB）`);
  console.log(`  帧耗时：P50 ${round(data.frame.p50)} / P95 ${round(data.frame.p95)} / P99 ${round(data.frame.p99)} / max ${round(data.frame.max)} ms（draw P50 ${round(data.frame.drawP50)}）`);
  console.log(`  静态层重建：P50 ${round(data.rebuild.p50)} / P95 ${round(data.rebuild.p95)} / max ${round(data.rebuild.max)} ms（同步 flush P50 ${round(data.rebuild.flushP50)} ms）`);
  console.log(`  导入：序列化 ${round(data.serializeMs)} ms / 已有工程内导入 ${round(data.importMs)} ms / 空工程导入 ${round(data.importEmptyMs)} ms / 导入后首帧 ${round(data.importRebuildMs)} ms`);
  console.log(`  heapUsed：基线 ${data.heap.baseMB} MB / 峰值 ${data.heap.peakMB} MB / 导入后 ${data.heap.afterImportMB} MB`);
  if (data.importMs > 1000) {
    console.log(`  ⚠ 已有工程内导入 ${round(data.importMs)} ms（空工程仅 ${round(data.importEmptyMs)} ms）：疑似 O(N²)，见 B-09 前置结论`);
  }
  if (data.frame.p99 > 16.7) {
    console.log(`  ⚠ 缓存帧 P99 ${round(data.frame.p99)} ms > 16.7ms（60fps 单帧预算，仅告警）`);
  }
}

function gate(data) {
  const g = GATES[`${data.scale}@${data.dpr}`];
  if (!g) return [];
  const fails = [];
  const chk = (name, value, limit, unit = 'ms') => {
    if (value === null || value === undefined) { fails.push(`${name}：缺少实测值（performance.memory 不可用？）`); return; }
    if (value > limit) fails.push(`${name}：实测 ${round(value)}${unit} > 阈值 ${limit}${unit}`);
  };
  chk('缓存帧 P95', data.frame.p95, g.frameP95);
  chk('静态层重建 P95', data.rebuild.p95, g.rebuildP95);
  chk('heapUsed 峰值', data.heap.peakMB, g.heapPeakMB, 'MB');
  chk('空工程导入', data.importEmptyMs, g.importEmptyMs);
  chk('已有工程内导入', data.importMs, g.importOverExistingMs);
  chk('静态层字节', data.staticBytesMB, g.staticMB, 'MB');
  return fails;
}

test.describe('真实浏览器基线 · DPR1 1920×1080', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  for (const scale of [2000, 5000, 10000]) {
    test(`${scale} 对象：帧 / 重建 / heap / 导入`, async ({ page }) => {
      const data = await collect(page, scale);
      record(data);
      expect(data.importedCount, '导入后的对象数必须与构造一致（否则说明导入失败被吞）').toBe(scale);
      expect(data.drawnObjects, '全视野场景应让全部对象参与绘制').toBe(scale);
      expect(data.pageErrors, '页面不得有脚本错误').toEqual([]);
      const fails = NO_GATE ? [] : gate(data);
      expect(fails, '性能门禁').toEqual([]);
    });
  }
});

test.describe('真实浏览器基线 · DPR2 采样（静态层显存 ×4）', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  test('5000 对象：DPR2 帧与重建', async ({ page }) => {
    const data = await collect(page, 5000);
    record(data);
    expect(data.dpr, 'DPR 必须为 2').toBe(2);
    expect(data.importedCount).toBe(5000);
    expect(data.pageErrors).toEqual([]);
    const fails = NO_GATE ? [] : gate(data);
    expect(fails, '性能门禁（DPR2）').toEqual([]);
  });
});

test.afterAll(() => {
  if (!results.length) return;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT_FILE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    node: process.version,
    thresholds: GATES,
    gateEnabled: !NO_GATE,
    cases: results
  }, null, 2), 'utf8');
  console.log(`\n[perf] 报告已写入 ${REPORT_FILE}（${results.length} 组用例）`);
});
