/**
 * bench.mjs —— 渲染性能基准（零依赖、无头，提供 CI 阈值）
 *
 * 场景：2000 个对象、1600×900 画布。
 *   1) 缓存帧：拖拽 1 个选中对象时的每帧耗时（静态层命中缓存，只画动态层）
 *   2) 重建帧：静态层失效后的完整重建耗时（对象增删改时发生）
 *   3) 直接帧：导出/打印路径（全量绘制，作为对照）
 *   4) 视口裁剪有效性：高倍缩放下应只绘制视野附近的对象
 *
 * 用法：node scripts/bench.mjs [--json]
 * 阈值：缓存帧平均 < 8ms（50fps 预算 20ms 的一半），超出退出码 1。
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
  resetFrameRef, worldDims, analyzeCoverage
};`;
vm.runInContext(code, sandbox, { filename: 'index.html<scripts>', displayErrors: true });
const api = sandbox.__bench;

/* 2000 个对象：点设备/区域/折线混合，分布在大范围场地上 */
api.resetState();
api.state.background = { kind: 'rect', fileName: '', assetId: '', width: 0, height: 0, origin: [0, 0], metersPerPixel: 1, calibrated: false, shape: { type: 'rect', x: 0, y: 0, w: 2000, h: 1500 } };
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

function timeIt(label, n, fn) {
  const t0 = now();
  for (let i = 0; i < n; i++) fn(i);
  return (now() - t0) / n;
}

/* 1) 重建帧：每次强制静态层失效 */
const rebuildMs = timeIt('rebuild', 10, () => {
  api.invalidateStatic();
  api.drawScene(ctxStub, api.state.viewport, W, H, { interactive: true, markerScale: 1 });
});
/* 2) 缓存帧：静态层命中，只绘制选中对象与动态层 */
const cachedMs = timeIt('cached', 200, () => {
  api.drawScene(ctxStub, api.state.viewport, W, H, { interactive: true, markerScale: 1 });
});
/* 3) 直接全量绘制（导出路径对照） */
const directMs = timeIt('direct', 10, () => {
  api.drawScene(ctxStub, api.state.viewport, W, H, { interactive: false, markerScale: 1.6 });
});
const out = { rebuildMs: +rebuildMs.toFixed(2), cachedMs: +cachedMs.toFixed(2), directMs: +directMs.toFixed(2), objects: 2000 };
/* 4) 视口裁剪：放大到 6 倍后统计实际绘制的对象数 */
const saved = { ...api.state.viewport };
api.state.viewport = { zoom: 6, panX: 100, panY: 100 };
const d = api.worldDims();
const viewRect = api.visibleWorldRect(api.state.viewport, d, W, H);
const drawn = api.state.objects.filter(o => api.boundsIntersect(api.objectBounds(o), viewRect)).length;
out.drawnObjects = drawn;
out.culledRatio = +(1 - drawn / 2000).toFixed(3);
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

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out));
} else {
  console.log('渲染基准（2000 对象 / 1600×900）');
  console.log(`  静态层重建：${out.rebuildMs} ms/帧（对象增删改时触发）`);
  console.log(`  缓存命中帧：${out.cachedMs} ms/帧（拖拽场景，目标 < 8ms）`);
  console.log(`  直接全量帧：${out.directMs} ms/帧（导出/打印对照）`);
  console.log(`  视口裁剪：放大 6 倍时绘制 ${out.drawnObjects} / 2000 个对象（裁剪 ${(out.culledRatio * 100).toFixed(1)}%）`);
  console.log(`  覆盖率分析：1000×1000m + 30 摄像头 ${out.coverageMs} ms（覆盖率 ${out.coverageRatio}%，目标 < 300ms）`);
}
if (out.cachedMs > 8) {
  console.error(`❌ 缓存帧超过阈值：${out.cachedMs} ms > 8 ms`);
  process.exit(1);
}
if (out.culledRatio < 0.6) {
  console.error(`❌ 视口裁剪无效：仅裁剪 ${(out.culledRatio * 100).toFixed(1)}%（期望 ≥ 60%）`);
  process.exit(1);
}
if (out.coverageMs > 300) {
  console.error(`❌ 覆盖率分析超过阈值：${out.coverageMs} ms > 300 ms`);
  process.exit(1);
}
console.log('✅ 渲染基准通过：缓存帧 ' + out.cachedMs + ' ms < 8 ms，裁剪有效，覆盖率分析 ' + out.coverageMs + ' ms < 300 ms');
