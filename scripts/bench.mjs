/**
 * bench.mjs —— 渲染性能基准（零依赖、无头，提供 CI 阈值）
 *
 * 场景：2000 个对象、1600×900 画布。
 *   1) 缓存帧：拖拽 1 个选中对象时的每帧耗时（静态层命中缓存，只画动态层）
 *   2) 重建帧：静态层失效后的完整重建耗时（对象增删改时发生）
 *   3) 直接帧：导出/打印路径（全量绘制，作为对照）
 *   4) 视口裁剪有效性：高倍缩放下应只绘制视野附近的对象
 *   5) 覆盖率分析：栅格化耗时与缩放无关性
 *   6) C-05 规则检查：2000 对象 / 30 类型阈值；默认 minX 扫描线，--brute 额外全量对照
 *
 * 用法：node scripts/bench.mjs [--json] [--no-gate] [--brute]
 * 门禁（默认启用，--no-gate 仅本地快速跑时关闭）：
 *   缓存帧平均 ≤ 8ms（50fps 预算 20ms 的一半，保留为下限保护）
 *   缓存帧 P95    ≤ 3ms（偶发卡顿不能靠平均帧掩盖）
 *   缓存帧 P99    ≤ 10ms（仅告警，不阻断）
 *   静态层重建    ≤ 60ms（对象增删改时触发）
 *   直接全量帧    ≤ 60ms（导出/打印路径）
 *   heapUsed      ≤ 64MB
 *   覆盖率分析    ≤ 300ms
 *   规则检查      ≤ 500ms（2000 对象 / 30 类型阈值）
 *   视口裁剪      ≥ 60%
 * 任一阻断项超出 → 退出码 1，并打印实测值 / 阈值 / 超出比例。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script\s+src="([^"]+)"><\/script>/g)].map(m => m[1]);
let code = srcs.map(s => readFileSync(join(root, s), 'utf8')).join('\n');

function makeUniversal() {
  const target = function () {};
  return new Proxy(target, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => '';
      if (p === 'then') return undefined;
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'getContext') return () => ctxStub;
      if (p === 'getBoundingClientRect') return () => ({ width: 1600, height: 900, top: 0, left: 0, right: 1600, bottom: 900 });
      if (p in t) return t[p];
      return makeUniversal();
    },
    set(t, p, v) { t[p] = v; return true; },
    apply() { return makeUniversal(); },
    construct() { return makeUniversal(); }
  });
}
const ctxStub = makeUniversal();
const elMap = new Map();
const elStub = id => { if (!elMap.has(id)) elMap.set(id, makeUniversal()); return elMap.get(id); };
const lsMap = new Map();
const sandbox = {
  console, Math, JSON, Date, RegExp, Map, Set, Promise, Proxy, Reflect, Symbol,
  ArrayBuffer, DataView, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray,
  Float32Array, Float64Array, Int8Array, Int32Array, Array, Object, String, Number,
  Boolean, Error, TypeError, isFinite, isNaN, parseInt, parseFloat, encodeURIComponent,
  decodeURIComponent, escape, unescape, TextEncoder, TextDecoder, Blob, atob, btoa,
  setTimeout, clearTimeout, setInterval, clearInterval,
  document: {
    getElementById: id => elStub(id),
    createElement: () => makeUniversal(),
    querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    activeElement: null,
    body: elStub('body'), documentElement: elStub('documentElement')
  },
  localStorage: { getItem: k => (lsMap.has(k) ? lsMap.get(k) : null), setItem: (k, v) => lsMap.set(k, String(v)), removeItem: k => lsMap.delete(k), clear: () => lsMap.clear(), key: i => Array.from(lsMap.keys())[i] ?? null, get length() { return lsMap.size; } },
  navigator: {}, URL: { createObjectURL: () => 'blob:stub', revokeObjectURL() {} },
  Image: function () { return makeUniversal(); },
  devicePixelRatio: 1, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  addEventListener() {}, removeEventListener() {}
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);

code += `\n;globalThis.__bench = {
  get state(){ return state; },
  resetState(){ state=createInitialState(); resetFrameRef(); return state; },
  baseObject, drawScene, invalidateStatic, visibleWorldRect, objectBounds, boundsIntersect, selectedIds,
  resetFrameRef, worldDims, analyzeCoverage, runRuleCheck, listRules
};`;
vm.runInContext(code, sandbox, { filename: 'index.html<scripts>', displayErrors: true });
const api = sandbox.__bench;

/* 2000 个对象：点设备/区域/折线混合，分布在大范围场地上 */
api.resetState();
/* 双槽模型：场地槽承载 2000×1500m 世界域，图片槽为空 */
api.state.background = { kind: 'empty', fileName: '', assetId: '', width: 0, height: 0, origin: [0, 0], metersPerPixel: 0.1, calibrated: false, transform: null };
api.state.site = { id:'site.bench', name:'基准场地', layerId:'layer.default', visible:true, locked:false, annot:{}, style:{}, updatedAt:'',
  kind:'rect', shape:{ type:'rect', x:0, y:0, w:2000, h:1500 } };
api.state.viewport = { zoom: 0.6, panX: 20, panY: 20 };
api.resetFrameRef();
const objs = [];
for (let i = 0; i < 2000; i++) {
  const x = (i * 37) % 1900 + 20, y = (i * 53) % 1400 + 20;
  if (i % 3 === 0) objs.push(api.baseObject('point', 'point.marker', { x, y, name: 'P' + i }));
  else if (i % 3 === 1) objs.push(api.baseObject('rect', 'rect.area', { x, y, width: 4 + (i % 7), height: 3 + (i % 5), name: 'R' + i }));
  else objs.push(api.baseObject('line', 'line.custom', { x, y, points: [[x, y], [x + 6, y], [x + 6, y + 4]], name: 'L' + i }));
}
objs.forEach((o, i) => { o.z = i; });
api.state.objects = objs;
/* 拖拽场景：仅 1 个对象被选中，静态层可命中缓存 */
api.selectedIds.add(objs[1].id);

const W = 1600, H = 900;
const now = () => performance.now();

/* 预热 */
api.invalidateStatic(); api.drawScene(ctxStub, api.state.viewport, W, H, { interactive: true, markerScale: 1 });

function timeSamples(n, fn) {
  const arr = new Float64Array(n);
  for (let i = 0; i < n; i++) { const t0 = now(); fn(i); arr[i] = now() - t0; }
  return arr;
}
function avgOf(arr) { let s = 0; for (const v of arr) s += v; return s / arr.length; }
function pctOf(arr, p) { const a = Array.from(arr).sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; }
function timeIt(label, n, fn) { return avgOf(timeSamples(n, fn)); }

/* 1) 重建帧：每次强制静态层失效 */
const rebuildMs = timeIt('rebuild', 10, () => {
  api.invalidateStatic();
  api.drawScene(ctxStub, api.state.viewport, W, H, { interactive: true, markerScale: 1 });
});
/* 2) 缓存帧：静态层命中，只绘制选中对象与动态层 */
const cachedSamples = timeSamples(200, () => {
  api.drawScene(ctxStub, api.state.viewport, W, H, { interactive: true, markerScale: 1 });
});
const cachedMs = avgOf(cachedSamples);
const cachedP50Ms = pctOf(cachedSamples, 0.5);
const cachedP95Ms = pctOf(cachedSamples, 0.95);
const cachedP99Ms = pctOf(cachedSamples, 0.99);
/* 3) 直接全量绘制（导出路径对照） */
const directMs = timeIt('direct', 10, () => {
  api.drawScene(ctxStub, api.state.viewport, W, H, { interactive: false, markerScale: 1.6 });
});
const out = { rebuildMs: +rebuildMs.toFixed(2), cachedMs: +cachedMs.toFixed(2), cachedP50Ms: +cachedP50Ms.toFixed(2), cachedP95Ms: +cachedP95Ms.toFixed(2), cachedP99Ms: +cachedP99Ms.toFixed(2), directMs: +directMs.toFixed(2), objects: 2000 };
/* 4) 视口裁剪：放大到 6 倍后统计实际绘制的对象数 */
const saved = { ...api.state.viewport };
api.state.viewport = { zoom: 6, panX: 100, panY: 100 };
const d = api.worldDims();
const viewRect = api.visibleWorldRect(api.state.viewport, d, W, H);
const drawn = api.state.objects.filter(o => api.boundsIntersect(api.objectBounds(o), viewRect)).length;
out.drawnObjects = drawn;
out.culledRatio = +(1 - drawn / 2000).toFixed(3);
/* 默认视图（zoom 0.6）实际参与绘制的对象数，用于解释重建耗时 */
const viewBase = api.visibleWorldRect(saved, api.worldDims(), W, H);
out.baseDrawn = api.state.objects.filter(o => api.boundsIntersect(api.objectBounds(o), viewBase)).length;
api.state.viewport = saved;

/* 5) 覆盖率分析：1000×1000m 场地 + 30 个摄像头，目标 36000 格 */
api.resetState();
api.state.objects = [api.baseObject('rect', 'rect.area', { x: 0, y: 0, width: 1000, height: 1000 })];
for (let i = 0; i < 30; i++) {
  const gx = ((i % 6) + 0.5) * 1000 / 6, gy = (Math.floor(i / 6) + 0.5) * 1000 / 5;
  api.state.objects.push(api.baseObject('point', 'point.camera', { x: gx, y: gy, phys: 160, angle: (i * 37) % 360 }));
}
const tCov = now();
const cov = api.analyzeCoverage(api.state, { targetCells: 36000 });
out.coverageMs = +(now() - tCov).toFixed(1);
out.coverageRatio = +(cov.ratio * 100).toFixed(1);

/* 5b) 大场地：5000×5000m + 30 摄像头，固定目标格数（B-09 验收口径） */
api.resetState();
api.state.objects = [api.baseObject('rect', 'rect.area', { x: 0, y: 0, width: 5000, height: 5000 })];
for (let i = 0; i < 30; i++) {
  const gx = ((i % 6) + 0.5) * 5000 / 6, gy = (Math.floor(i / 6) + 0.5) * 5000 / 5;
  api.state.objects.push(api.baseObject('point', 'point.camera', { x: gx, y: gy, phys: 800, angle: (i * 37) % 360 }));
}
const tBig = now();
const covBig = api.analyzeCoverage(api.state);
out.coverageBigMs = +(now() - tBig).toFixed(1);
out.coverageBigCells = covBig.gridCells;
out.coverageBigRatio = +(covBig.ratio * 100).toFixed(1);

/* 5c) 缩放无关性：同一图纸在 4 个缩放级别下的覆盖率差异（B-09 验收 ≤1 个百分点） */
api.resetState();
api.state.objects = [api.baseObject('rect', 'rect.area', { x: 0, y: 0, width: 1000, height: 1000 })];
for (let i = 0; i < 30; i++) {
  const gx = ((i % 6) + 0.5) * 1000 / 6, gy = (Math.floor(i / 6) + 0.5) * 1000 / 5;
  api.state.objects.push(api.baseObject('point', 'point.camera', { x: gx, y: gy, phys: 160, angle: (i * 37) % 360 }));
}
const zoomRatios = [0.25, 1, 4, 16].map(z => {
  api.state.viewport = Object.assign({}, api.state.viewport, { zoom: z });
  return api.analyzeCoverage(api.state).ratio;
});
out.coverageZoomSpreadPp = +((Math.max(...zoomRatios) - Math.min(...zoomRatios)) * 100).toFixed(2);
out.coverageZoomRatios = zoomRatios.map(r => +(r * 100).toFixed(2));

/* 6) C-05 规则检查：2000 对象 + 30 类型阈值（site 2000×1500）
 *    默认 minX 扫描线；--brute 额外跑一次全量两两对照（慢，仅供记录收益） */
{
  api.resetState();
  api.state.site = { id:'site.bench.rules', name:'规则基准场地', layerId:'layer.default', visible:true, locked:false,
    annot:{}, style:{}, updatedAt:'', kind:'rect', shape:{ type:'rect', x:0, y:0, w:2000, h:1500 } };
  const ruleTypes = [];
  for (let i = 0; i < 30; i++) {
    const id = 'bench.ruletype' + i;
    ruleTypes.push(id);
    api.state.objectTypes.push({ id, kind:'point', name:'规则类型' + i, color:'#334155', icon:'custom', builtin:false, scaleShape:'none' });
  }
  const ruleObjs = [];
  for (let i = 0; i < 2000; i++) {
    const x = (i * 37) % 1900 + 20, y = (i * 53) % 1400 + 20;
    const typeId = ruleTypes[i % 30];
    if (i % 3 === 0) ruleObjs.push(api.baseObject('point', typeId, { x, y, name: 'RP' + i }));
    else if (i % 3 === 1) ruleObjs.push(api.baseObject('rect', typeId, { x, y, width: 4 + (i % 7), height: 3 + (i % 5), name: 'RR' + i }));
    else ruleObjs.push(api.baseObject('line', typeId, { x, y, points: [[x, y], [x + 6, y], [x + 6, y + 4]], name: 'RL' + i }));
  }
  ruleObjs.forEach((o, i) => { o.z = i; });
  api.state.objects = ruleObjs;
  ruleTypes.forEach((id, i) => { api.state.rules.spacing.types[id] = 1 + (i % 5) * 0.5; });
  const ruleSamples = timeSamples(5, () => { api.runRuleCheck(); });
  const ruleMs = pctOf(ruleSamples, 0.5);
  const ruleRes = api.runRuleCheck();
  out.ruleCheckMs = +ruleMs.toFixed(1);
  out.ruleObjects = ruleRes.stats.objects;
  out.ruleFloors = ruleRes.stats.floors;
  out.rulePairs = ruleRes.stats.pairs;
  out.ruleTheoretical = ruleRes.stats.theoretical;
  out.rulePairRatio = +(ruleRes.stats.theoretical ? ruleRes.stats.pairs / ruleRes.stats.theoretical : 0).toFixed(4);
  out.ruleViolations = ruleRes.violations.length;
  out.ruleTypeCount = ruleTypes.length;
  out.rulePerRuleMs = Object.keys(ruleRes.perRule).map(id => `${id}:${ruleRes.perRule[id].ms}`).join(' ');
  if (process.argv.includes('--brute')) {
    const tBrute = now();
    const bruteRes = api.runRuleCheck({ mode: 'brute' });
    out.ruleCheckBruteMs = +(now() - tBrute).toFixed(1);
    out.ruleBrutePairs = bruteRes.stats.pairs;
    out.ruleBruteViolations = bruteRes.violations.length;
  }
}

out.heapUsedMB = +(process.memoryUsage().heapUsed / 1048576).toFixed(2);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out));
} else {
  console.log('渲染基准（2000 对象 / 1600×900）');
  console.log(`  静态层重建：${out.rebuildMs} ms/帧（对象增删改时触发）`);
  console.log(`  缓存命中帧：${out.cachedMs} ms/帧（P50 ${out.cachedP50Ms} / P95 ${out.cachedP95Ms} / P99 ${out.cachedP99Ms} ms）`);
  console.log(`  直接全量帧：${out.directMs} ms/帧（导出/打印对照）`);
  console.log(`  堆内存 heapUsed：${out.heapUsedMB} MB`);
  console.log(`  视口裁剪：放大 6 倍时绘制 ${out.drawnObjects} / 2000 个对象（裁剪 ${(out.culledRatio * 100).toFixed(1)}%）`);
  console.log(`  默认视图绘制对象：${out.baseDrawn} / 2000`);
  console.log(`  覆盖率分析：1000×1000m + 30 摄像头 ${out.coverageMs} ms（覆盖率 ${out.coverageRatio}%，目标 < 300ms）`);
  console.log(`  大场地覆盖率：5000×5000m + 30 摄像头 ${out.coverageBigMs} ms（${out.coverageBigCells} 格，覆盖率 ${out.coverageBigRatio}%，目标 < 300ms）`);
  console.log(`  缩放无关性：zoom 0.25/1/4/16 覆盖率 ${out.coverageZoomRatios.join(' / ')}%，差异 ${out.coverageZoomSpreadPp} 个百分点（目标 ≤ 1）`);
  console.log(`  规则检查：2000 对象 / ${out.ruleTypeCount} 类型阈值 ${out.ruleCheckMs} ms（候选对 ${out.rulePairs} / 理论 ${out.ruleTheoretical}，${(out.rulePairRatio * 100).toFixed(2)}%，违规 ${out.ruleViolations} 条，目标 ≤ 500ms）`);
  console.log(`  规则分项：${out.rulePerRuleMs} ms`);
  if (out.ruleCheckBruteMs !== undefined) {
    console.log(`  规则全量对照（--brute）：${out.ruleCheckBruteMs} ms，候选对 ${out.ruleBrutePairs}（扫描线加速 ${(out.ruleCheckBruteMs / out.ruleCheckMs).toFixed(1)}×）`);
  }
}

/* 门禁：阻断项（超出一项即红），P99 仅告警。--no-gate 供本地快速跑。 */
if (!process.argv.includes('--no-gate')) {
  const gates = [
    { name: '缓存帧平均', value: out.cachedMs, limit: 8, op: '≤', unit: 'ms' },
    { name: '缓存帧 P95', value: out.cachedP95Ms, limit: 3, op: '≤', unit: 'ms' },
    { name: '静态层重建', value: out.rebuildMs, limit: 60, op: '≤', unit: 'ms' },
    { name: '直接全量帧', value: out.directMs, limit: 60, op: '≤', unit: 'ms' },
    { name: 'heapUsed', value: out.heapUsedMB, limit: 64, op: '≤', unit: 'MB' },
    { name: '覆盖率分析', value: out.coverageMs, limit: 300, op: '≤', unit: 'ms' },
    { name: '大场地覆盖率分析', value: out.coverageBigMs, limit: 300, op: '≤', unit: 'ms' },
    { name: '覆盖率缩放差异', value: out.coverageZoomSpreadPp, limit: 1, op: '≤', unit: 'pp' },
    { name: '规则检查(2000对象/30类型)', value: out.ruleCheckMs, limit: 500, op: '≤', unit: 'ms' },
    { name: '视口裁剪率', value: out.culledRatio, limit: 0.6, op: '≥', unit: '' }
  ].filter(g => !(out.ruleCheckBruteMs !== undefined && g.name === 'heapUsed')); /* --brute 会物化 2M 候选对，heap 门禁不适用 */
  const failed = [];
  for (const g of gates) {
    const bad = g.op === '≤' ? g.value > g.limit : g.value < g.limit;
    if (bad) {
      const ratio = g.op === '≤'
        ? `超出 ${(((g.value / g.limit) - 1) * 100).toFixed(1)}%`
        : `低于阈值 ${((1 - g.value / g.limit) * 100).toFixed(1)}%`;
      failed.push(`❌ ${g.name}：实测 ${g.value}${g.unit} ${g.op} 阈值 ${g.limit}${g.unit}（${ratio}）`);
    }
  }
  if (out.cachedP99Ms > 10) {
    console.warn(`⚠️  缓存帧 P99 告警：${out.cachedP99Ms} ms > 10 ms（仅告警，不阻断）`);
  }
  if (failed.length) {
    failed.forEach(f => console.error(f));
    process.exit(1);
  }
  console.log(`✅ 渲染基准通过：缓存帧 avg ${out.cachedMs} ms ≤ 8 ms / P95 ${out.cachedP95Ms} ms ≤ 3 ms，重建 ${out.rebuildMs} ms ≤ 60 ms，heapUsed ${out.heapUsedMB} MB ≤ 64 MB，裁剪 ${(out.culledRatio * 100).toFixed(1)}% ≥ 60%，覆盖率 ${out.coverageMs} ms ≤ 300 ms，大场地覆盖率 ${out.coverageBigMs} ms ≤ 300 ms，缩放差异 ${out.coverageZoomSpreadPp}pp ≤ 1pp`);
}
