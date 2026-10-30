/**
 * 离线通用图纸标注工具 —— 逻辑层零依赖自测（多文件版）
 *
 * 解析 index.html 中按顺序声明的 <script src>，按同样顺序拼接后注入最小
 * 浏览器桩在 vm 中执行（经典脚本共享全局作用域，拼接等价于浏览器按序加载），
 * 对几何、CRC32/ZIP、OOXML(XLSX) 双向往返、CSV、表格导入规划、迁移清洗、
 * 底图资产哈希、矢量场地（矩形/圆形/多边形域与形状规整）、点设备物理尺寸
 * （圆/方/扇形视场/杆的世界坐标命中）等纯逻辑做断言。无需 npm install，Node 18+：
 *
 *   node scripts/selftest.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { buildStandalone } from './pack-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

/* 按 index.html 中声明的真实顺序加载脚本 */
const srcs = [...html.matchAll(/<script\s+src="([^"]+)"><\/script>/g)].map(m => m[1]);
if (srcs.length < 5) { console.error('index.html 中未找到拆分后的 <script src> 列表'); process.exit(1); }
let code = srcs.map(s => `/* ===== ${s} ===== */\n` + readFileSync(join(root, s), 'utf8')).join('\n');

/* ---------------- 最小 DOM / 浏览器桩 ---------------- */
function makeUniversal() {
  const target = function () {};
  return new Proxy(target, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => '';
      if (p === 'then') return undefined;
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (p === 'getContext') return () => ctxStub;
      if (p === 'getBoundingClientRect') return () => ({ width: 900, height: 600, top: 0, left: 0, right: 900, bottom: 600 });
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
const localStorageStub = {
  getItem: k => (lsMap.has(k) ? lsMap.get(k) : null),
  setItem: (k, v) => lsMap.set(k, String(v)),
  removeItem: k => lsMap.delete(k),
  clear: () => lsMap.clear(),
  key: i => Array.from(lsMap.keys())[i] ?? null,
  get length() { return lsMap.size; }
};
const documentStub = {
  getElementById: id => elStub(id),
  createElement: () => makeUniversal(),
  querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  activeElement: null,
  body: elStub('body'), documentElement: elStub('documentElement')
};
const setTimeoutStub = (fn, ms, ...args) => { const h = setTimeout(fn, ms, ...args); h.unref?.(); return h; };
const sandbox = {
  console, Math, JSON, Date, RegExp, Map, Set, Promise, Proxy, Reflect, Symbol,
  ArrayBuffer, DataView, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray,
  Float32Array, Float64Array, Int8Array, Int32Array, Array, Object, String, Number,
  Boolean, Error, TypeError, isFinite, isNaN, parseInt, parseFloat, encodeURIComponent,
  decodeURIComponent, escape, unescape, TextEncoder, TextDecoder, Blob, atob, btoa,
  setTimeout: setTimeoutStub, clearTimeout, setInterval: setTimeoutStub, clearInterval,
  CompressionStream:globalThis.CompressionStream, DecompressionStream:globalThis.DecompressionStream, Response:globalThis.Response,
  document: documentStub,
  localStorage: localStorageStub,
  navigator: {},
  URL: { createObjectURL: () => 'blob:stub', revokeObjectURL() {} },
  Image: function () { return makeUniversal(); },
  devicePixelRatio: 1,
  requestAnimationFrame: () => 0,
  cancelAnimationFrame() {},
  addEventListener() {}, removeEventListener() {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

/* 暴露内部函数给断言 */
code += `\n;globalThis.__api = {
  get state(){ return state; },
  resetState(){ state = createInitialState(); resetFrameRef(); return state; },
  createInitialState, migrateProject, baseObject,
  polygonArea, polylineLength, pointInPolygon, distanceToSegment, nearestPointOnSegment,
  orthoPoint, polarSnap45, squareCorner, segmentsIntersect,
  boundsIntersect, scaleWorldAround, reachableBgAssetIds,
  translateObject, alignObjects, distributeObjects, objectBounds,
  get history(){ return history; },
  normalizeAngle, rotatePoint,
  XmlLite, Zip, Xlsx, DSV, ContentAssets,
  parseRowsStub: DSV.parseRows,
  rowsToObjectsPlan, applyTableImport,
  siteDomainOf, rectShapeFromCorners, circleShapeFrom, polygonShapeFromPoints,
  ellipseShapeFromCorners, sectorShapeFrom,
  siteDescription, worldDims,
  hitPhysicalPoint, siteKindName,
  areaShapeType, shapeWorldPoints, shapeHit, shapeArea, shapeLabelCenter, shapePerimeter,
  convertAreaShape, parallelogramPoints, parallelogramSkew, AREA_SHAPE_TYPES,
  PARALLELOGRAM_DEFAULT_SKEW, PARALLELOGRAM_MAX_SKEW, AREA_SHAPE_LABELS, applyRowShape,
  sectorSweep, sectorArcPoints, pointIconScale, areaParamText,
  collectSnapCandidates, collectSnapEdges, collectSnapCircles, findOsnap, OSNAP_LABELS,
  applyField,
  lineMinNodes, setNodeCoord, insertLineNode, removeLineNode, moveNode, moveNodeStep,
  isPolylineEditable, objectArea, objectLength, renderNodeEditor,
  annotKeys, annotOn, annotLabel, annotDefault, setAnnot, annotationItems, renderAnnotToggles,
  typeDisplayName, populateSelects,
  esc, segLabelMinPx, APP_LIMITS, backgroundScalePlan,
  $, renderProps, renderStats, tabTargetIndex, isCanvasShortcutTarget, modalKeydown, openModal, closeModal,
  get selectedIds(){ return selectedIds; },
  objectRows, formatNodeCoords, parseNodeCoords,
  previewGeomCandidate, checkRowGeom, geomRoundingTol,
  buildSceneSvg,
  Dxf: globalThis.Dxf, Pdf: globalThis.Pdf,
  PdfRead: globalThis.PdfRead, Qr: globalThis.Qr,
  SYMBOL_LIBRARY: globalThis.SYMBOL_LIBRARY, parseSvgSymbol: globalThis.parseSvgSymbol, BUILTIN_TYPES,
  PlotPin: globalThis.PlotPin, I18N: globalThis.I18N,
  exportViaPlugin: globalThis.exportViaPlugin, importViaPlugin: globalThis.importViaPlugin,
  parkingLayout, parkingWarningText, applyParkingLayout,
  collabChunkText, collabCleanSDP, collabOnLocalChange,
  undo, redo, get history(){ return history; },
  applyLedgerCells, LEDGER_FIELDS,
  csvCell: (v,d)=>csvCell(v,d),
  TABLE_COLUMNS,
  cameraFootprint, pointInFootprint, regionPolygons, polygonBBox, analyzeCoverage, blindSpotRects, blindSpotArea,
  optimizeCameraPlacement,
  defaultImageTransform, imageTransformOf, bgPixelToWorld, bgWorldToPixel,
  imageCornerWorld, imageWorldFrame, validImageTransform,
  solveImageAffine, affApply, affMul, affInv, migrateObjectsByAffine,
  siteBoundaryPoints, siteShapeCenter, siteBasePoint, siteRadiusText, siteAreaPerimeter,
  worldFrame, computeWorldFrame, resetFrameRef, syncFramePan, siteBounds,
  siteHandleList, siteHandleAt, resizeSiteByHandle, sitePropsHTML, imagePropsHTML,
  drawObject, drawLabel, drawAreaTag,
  invalidateStatic, visibleWorldRect, sceneStaticKey, detectCapabilities, detectRuntimeCapabilities,
  syncActiveFloor, switchFloorData, currentFloorName, currentFloor, floorObjectCount, floorSummaries, persistableState,
  directionalSnap, addGuideLine, removeLastGuideLine, clearGuideLines, guideLineList, guideEdges,
  mergeProjectData, mergeTombstoneMap, sanitizeTombstones, markTombstone, TOMBSTONE_LIMIT, mergeProjectJSON,
};`;
vm.runInContext(code, sandbox, { filename: 'index.html<scripts>', displayErrors: true });

/* ---------------- 微型测试框架 ---------------- */
let pass = 0, fail = 0;
const asyncSuites=[];
const failures = [];
function ok(name, cond) {
  if (cond) { pass++; } else { fail++; failures.push(name); console.error('  ✗ ' + name); }
}
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  ok(name + (a === e ? '' : `（期望 ${e}，实际 ${a}）`), a === e);
}
function approx(name, actual, expected, eps = 1e-9) {
  ok(name + `（期望 ${expected}，实际 ${actual}）`, Math.abs(actual - expected) <= eps);
}

const api = sandbox.__api;
ok('公共命名空间 Zip/XmlLite/Xlsx/DSV/ContentAssets 已挂载',
  !!api.Zip && !!api.XmlLite && !!api.Xlsx && !!api.DSV && !!api.ContentAssets);

/* 1. 几何 ---------------------------------------------------------------- */
eq('多边形面积-正方形100', api.polygonArea([[0,0],[10,0],[10,10],[0,10]]), 100);
eq('多边形面积-三角形50', api.polygonArea([[0,0],[10,0],[0,10]]), 50);
eq('折线长度 3+4+5', api.polylineLength([[0,0],[3,0],[3,4],[3,9]]), 12);
eq('点在多边形内', api.pointInPolygon([1,1],[[0,0],[10,0],[10,10],[0,10]]), true);
eq('点在多边形外', api.pointInPolygon([11,1],[[0,0],[10,0],[10,10],[0,10]]), false);
approx('点到线段距离-在线上', api.distanceToSegment([5,0],[0,0],[10,0]), 0);
approx('点到线段距离-垂直3', api.distanceToSegment([0,3],[0,0],[10,0]), 3);
approx('点到线段距离-端点外', api.distanceToSegment([12,0],[0,0],[10,0]), 2);
eq('线段最近点-中点垂足', api.nearestPointOnSegment([5,3],[0,0],[10,0]), [5,0]);
eq('线段最近点-斜线段投影', api.nearestPointOnSegment([0,0],[10,0],[10,10]), [10,0]);
eq('线段最近点-端点外夹回端点', api.nearestPointOnSegment([12,0],[0,0],[10,0]), [10,0]);
eq('线段最近点-反向延长同样夹回', api.nearestPointOnSegment([-2,5],[0,0],[10,0]), [0,0]);
eq('线段最近点-退化线段取端点', api.nearestPointOnSegment([3,4],[7,7],[7,7]), [7,7]);
eq('线段相交', api.segmentsIntersect([0,0],[10,10],[0,10],[10,0]), true);
eq('线段不相交', api.segmentsIntersect([0,0],[1,0],[5,5],[6,5]), false);
eq('角度归一化', [api.normalizeAngle(-90), api.normalizeAngle(370)], [270, 10]);
approx('绕原点旋转90°', api.rotatePoint([1,0],[0,0],90)[1], 1, 1e-9);

/* 2. CRC32 标准向量 ------------------------------------------------------- */
eq('CRC32("123456789")=0xCBF43926', api.Zip.crc32(api.Zip.encodeUtf8('123456789')), 0xCBF43926);

/* 3. ZIP 往返 ------------------------------------------------------------- */
{
  const bin = new Uint8Array([0, 1, 2, 250, 255, 10, 31]);
  const buf = api.Zip.build([
    { name: '中文/文件.txt', text: '你好，世界\nHELLO' },
    { name: 'a/b.bin', bytes: bin }
  ]);
  const entries = await api.Zip.readEntries(buf);
  eq('ZIP 中文文件名条目', api.Zip.decodeUtf8(entries['中文/文件.txt']), '你好，世界\nHELLO');
  eq('ZIP 二进制条目保真', Array.from(entries['a/b.bin']), Array.from(bin));
  ok('ZIP 魔数头', new Uint8Array(buf)[0] === 0x50 && new Uint8Array(buf)[1] === 0x4b);
}

/* 4. XLSX 构建→读取双向往返 ---------------------------------------------- */
{
  const C4=api.TABLE_COLUMNS;
  const r4=(m)=>C4.map((_,i)=>m[i]??'');
  const table = [
    C4,
    r4(['O0001', '监控,一号', '点设备', '摄像头', '默认图层', '1.5', '-2.25', '90', '', '', '', '', '', '', '', '0', '', '', '是', '否', '含"引号"\n换行', '2026-10-14T00:00:00Z']),
    r4(['O0002', '区域A', '矩形/区域', '普通区域', '默认图层', '0', '0', '0', '12.5', '3.5', '矩形', '', '', '', '', '0', '', '43.75', '是', '否', '', '2026-10-14T00:00:00Z']),
    r4(['O0003', '', '尺寸标注', '两点距离', '默认图层', '', '', '', '', '', '', '', '', '测距', '0,0;3,4;3,14', '3', '15', '', '是', '否', '', '2026-10-14T00:00:00Z'])
  ];
  const buf = api.Xlsx.build(table, '图纸标注');
  ok('XLSX 是 ZIP（PK 头）', new Uint8Array(buf)[0] === 0x50);
  const rows = await api.Xlsx.readRows(buf);
  eq('XLSX 往返行数', rows.length, 4);
  eq('XLSX 表头往返', rows[0], C4);
  eq('XLSX 含逗号/引号/换行单元格往返', rows[1][1], '监控,一号');
  eq('XLSX 备注引号换行往返', rows[1][20], '含"引号"\n换行');
  eq('XLSX 数字以文本往返', rows[2][9], '3.5');
  eq('XLSX 面积往返', rows[2][17], '43.75');
  eq('XLSX 测距类型往返', rows[3][13], '测距');
  eq('XLSX 节点坐标单元格往返', rows[3][14], '0,0;3,4;3,14');
  eq('XLSX 节点坐标解析3点', api.parseNodeCoords(rows[3][14]).length, 3);
  eq('列字母 A/Z/AA', [api.Xlsx.colLetter(0), api.Xlsx.colLetter(25), api.Xlsx.colLetter(26)], ['A', 'Z', 'AA']);
}

/* 5. CSV / TSV 解析 ------------------------------------------------------- */
{
  const csv = '\ufeff编号,名称\nO0001,"含,逗号"\nO0002,"引号""内"\nO0003,"换行\n字段"\r\nO0004,普通';
  const rows = api.DSV.parseRows(csv, ',');
  eq('CSV BOM 去除', rows[0][0], '编号');
  eq('CSV 行数（含引号内换行）', rows.length, 5);
  eq('CSV 引号内逗号', rows[1][1], '含,逗号');
  eq('CSV 双引号转义', rows[2][1], '引号"内');
  eq('CSV 引号内换行', rows[3][1], '换行\n字段');
  eq('CSV CRLF 正常', rows[4], ['O0004', '普通']);
  eq('TSV 制表符分隔', api.DSV.parseRows('a\tb\n1\t2', '\t'), [['a', 'b'], ['1', '2']]);
  eq('分隔符自动探测-逗号', api.DSV.detectDelimiter('a,b,c\n1,2,3'), ',');
  eq('分隔符自动探测-制表', api.DSV.detectDelimiter('a\tb\tc\n'), '\t');
}

/* 6. XmlLite 直接断言 ----------------------------------------------------- */
{
  const doc = api.XmlLite.parse('<root xmlns:r="http://x"><a r:id="r1" q="v&amp;w">文&amp;本</a><b><c>1</c><c>2</c></b></root>');
  const a = doc.getElementsByTagName('a')[0];
  eq('XmlLite 属性', a.getAttribute('q'), 'v&w');
  eq('XmlLite 命名空间属性', a.getAttribute('r:id'), 'r1');
  eq('XmlLite 文本实体', a.textContent, '文&本');
  eq('XmlLite 深度查询数量', doc.getElementsByTagName('c').length, 2);
  let threw = false;
  try { api.XmlLite.parse('<a><b></a></b>'); } catch (e) { threw = true; }
  eq('XmlLite 畸形标签报错', threw, true);
}

/* 7. 底图资产：内容寻址哈希 + dataURL 解码 -------------------------------- */
{
  const a = api.ContentAssets.idFor(new Uint8Array([1, 2, 3, 4]), 'bg');
  const b = api.ContentAssets.idFor(new Uint8Array([1, 2, 3, 4]), 'bg');
  const c = api.ContentAssets.idFor(new Uint8Array([1, 2, 3, 5]), 'bg');
  eq('资产哈希确定性', a, b);
  ok('资产哈希抗差异', a !== c);
  ok('资产 id 带前缀与长度', a.startsWith('bg') && a.endsWith('-4'));
  const png = btoa(String.fromCharCode(...Array.from({ length: 255 }, (_, i) => i % 256)));
  const bin = api.ContentAssets.dataUrlToBytes('data:image/png;base64,' + png);
  eq('dataURL mime 解析', bin.mime, 'image/png');
  eq('dataURL 字节长度', bin.bytes.length, 255);
  eq('dataURL 首尾字节', [bin.bytes[0], bin.bytes[254]], [0, 254]);
  eq('dataURL→哈希可重入', api.ContentAssets.idFor(bin.bytes, 'bg') === api.ContentAssets.idFor(bin.bytes, 'bg'), true);
}

/* 8. 表格导入规划与应用 --------------------------------------------------- */
{
  const st = api.resetState();
  const p0 = api.baseObject('point');
  p0.name = 'O0001'; p0.x = 0; p0.y = 0;
  st.objects.push(p0);
  const C = api.TABLE_COLUMNS;
  const row = obj => C.map(k => obj[k] ?? '');
  const header = C.slice();
  const updateRow = row({ 编号: 'O0001', 对象类型: '点设备', 业务类型: '摄像头', 图层: '默认图层', X: '8.5', Y: '9.2', 角度: '45', 显示: '是', 锁定: '否' });
  const newPoint = row({ 编号: 'O0009', 对象类型: '点设备', 业务类型: '通用标记', X: '1', Y: '2' });
  const newRect = row({ 编号: 'O0010', 对象类型: '矩形/区域', X: '0', Y: '0', 宽度: '3', 高度: '4' });
  const badRect = row({ 编号: 'O0011', 对象类型: '矩形/区域', X: '0', Y: '0', 宽度: '0', 高度: '4' });
  const lineRow = row({ 编号: 'O0012', 对象类型: '线段/折线', X: '0', Y: '0' });
  const weirdRow = row({ 编号: 'O0013', 对象类型: '飞船', X: '0', Y: '0' });
  const emptyRow = C.map(() => '');
  const plan = api.rowsToObjectsPlan([header, updateRow, newPoint, newRect, badRect, lineRow, weirdRow, emptyRow]);
  eq('表格规划-更新数', plan.updates.length, 1);
  eq('表格规划-新建数', plan.creates.length, 2);
  ok('表格规划-零高矩形告警', plan.warnings.some(w => w.includes('O0011')));
  ok('表格规划-折线不可重建告警', plan.warnings.some(w => w.includes('O0012')));
  ok('表格规划-未知类型告警', plan.warnings.some(w => w.includes('飞船')));
  api.applyTableImport(plan);
  const after = api.state;
  eq('应用后对象总数（原1+新增2）', after.objects.length, 3);
  const o1 = after.objects.find(o => o.name === 'O0001');
  approx('更新 X 生效', o1.x, 8.5);
  approx('更新 Y 生效', o1.y, 9.2);
  eq('更新业务类型生效', o1.typeId, 'point.camera');
  const o10 = after.objects.find(o => o.name !== 'O0001' && o.kind === 'rect');
  ok('矩形新建成功', !!o10 && o10.width === 3 && o10.height === 4);
  const allEmpty = api.rowsToObjectsPlan([header, emptyRow]);
  eq('全空数据行跳过且不告警', [allEmpty.updates.length, allEmpty.creates.length, allEmpty.warnings.length], [0, 0, 0]);
  const noHeader = api.rowsToObjectsPlan([['foo', 'bar'], ['1', '2']]);
  ok('无有效表头报错', noHeader.warnings.length === 1 && noHeader.updates.length === 0);
}

/* 9. 矢量场地模型 --------------------------------------------------------- */
{
  eq('域-image 像素×mpp', api.siteDomainOf({kind:'image',width:1000,height:700,metersPerPixel:0.1}), {w:100,h:70});
  eq('域-rect 直接米', api.siteDomainOf({kind:'rect',shape:{type:'rect',w:12,h:8}}), {w:12,h:8});
  eq('域-circle 2r', api.siteDomainOf({kind:'circle',shape:{type:'circle',cx:30,cy:30,r:30}}), {w:60,h:60});
  eq('域-polygon 外接盒', api.siteDomainOf({kind:'polygon',shape:{type:'polygon',points:[[0,0],[20,0],[20,10],[0,10]]}}), {w:20,h:10});
  eq('域-缺省 rect 兜底', api.siteDomainOf({kind:'rect'}), {w:100,h:70});
  eq('矩形形状-对角规整', api.rectShapeFromCorners([2,3],[12,8]), {type:'rect',w:10,h:5});
  eq('圆形形状-圆心置于域中心', api.circleShapeFrom([100,100],25), {type:'circle',cx:25,cy:25,r:25});
  eq('多边形形状-平移到原点', api.polygonShapeFromPoints([[5,5],[25,5],[25,15]]), {type:'polygon',points:[[0,0],[20,0],[20,10]]});
  eq('场地中文名', [api.siteKindName('image'),api.siteKindName('circle')], ['图片底图','圆形场地']);
}

/* 10. 物理尺寸点设备命中（世界坐标） --------------------------------------- */
{
  api.resetState();
  api.state.viewport.zoom = 1;   // 经 getter 改闭包内 state（hitPhysicalPoint 读同一引用）
  const cam = {x:0,y:0,angle:0,phys:10,typeId:'point.camera'};
  const dome = {x:0,y:0,angle:0,phys:10,typeId:'point.dome'};
  const chg = {x:0,y:0,angle:0,phys:10,typeId:'point.charger'};
  const gate = {x:0,y:0,angle:0,phys:10,typeId:'point.gate'};
  /* sector fov=90 朝 +X */
  eq('扇形-内点(5,5)边界内', api.hitPhysicalPoint(cam,'sector',[5,5]), true);
  eq('扇形-背面点(-5,5)不在', api.hitPhysicalPoint(cam,'sector',[-5,5]), false);
  eq('扇形-超半径不在', api.hitPhysicalPoint(cam,'sector',[11,0]), false);
  eq('扇形-中心点在', api.hitPhysicalPoint(cam,'sector',[0,0]), true);
  const cam90 = Object.assign({}, cam, {angle:90});
  eq('扇形-旋转90后 +Y 在', api.hitPhysicalPoint(cam90,'sector',[0,5]), true);
  eq('扇形-旋转90后 +X 不在', api.hitPhysicalPoint(cam90,'sector',[5,0]), false);
  /* circle */
  eq('圆-半径内', api.hitPhysicalPoint(dome,'circle',[5,0]), true);
  eq('圆-半径外', api.hitPhysicalPoint(dome,'circle',[6,0]), false);
  /* square */
  eq('方-角点内', api.hitPhysicalPoint(chg,'square',[5,5]), true);
  eq('方-超出不在', api.hitPhysicalPoint(chg,'square',[5,6]), false);
  const chg90 = Object.assign({}, chg, {angle:90});
  eq('方-旋转后世界点在', api.hitPhysicalPoint(chg90,'square',[5,0]), true);
  /* bar */
  eq('杆-端点内', api.hitPhysicalPoint(gate,'bar',[5,0]), true);
  eq('杆-垂直方向近线在', api.hitPhysicalPoint(gate,'bar',[0,1]), true);
  eq('杆-过远不在', api.hitPhysicalPoint(gate,'bar',[0,9]), false);
  /* phys=0 不生效 */
  eq('零尺寸不命中物理', api.hitPhysicalPoint(Object.assign({},cam,{phys:0}),'sector',[5,5]), false);
}

/* 11. 旧工程迁移与清洗 ----------------------------------------------------- */
{
  const legacy = {
    schema: 'offline-drawing-annotation/v1',
    meta: { name: '旧工程' },
    settings: { precision: 9, gridSize: -3 },
    background: { fileName: 'old.png', dataUrl: 'data:image/png;base64,' + btoa('PNG'), width: 500, height: 400, metersPerPixel: 0.2, calibrated: true },
    layers: [{ id: 'layer.default', name: '默认图层' }],
    objects: [
      { id: 'x1', kind: 'point', typeId: 'point.marker', name: 'P1', x: 1, y: 2 },
      { id: 'x2', kind: 'rect', typeId: 'rect.area', name: 'R1', x: 0, y: 0, width: 0, height: 5 },
      { id: 'x3', kind: 'line', typeId: 'line.custom', name: 'L1', points: [[0, 0]] },
      { kind: 'unknown', x: 0 }
    ]
  };
  const st = api.migrateProject(legacy);
  eq('迁移-精度钳制到6', st.settings.precision, 6);
  eq('迁移-网格间距回退默认', st.settings.gridSize, 1);
  eq('迁移-有图片引用判为 image', st.background.kind, 'image');
  eq('迁移-保留内嵌 dataUrl（待入资产库）', st.background.dataUrl.startsWith('data:image/png'), true);
  eq('迁移-合法点保留', st.objects.filter(o => o.name === 'P1').length, 1);
  eq('迁移-零宽矩形丢弃', st.objects.some(o => o.name === 'R1'), false);
  eq('迁移-单节点折线丢弃', st.objects.some(o => o.name === 'L1'), false);
  eq('迁移-未知类型丢弃', st.objects.length, 1);
  eq('迁移-点对象默认 phys=0', st.objects[0].phys, 0);
  eq('迁移-默认图层兜底', st.layers[0].id, 'layer.default');

  /* 无图片引用的旧空白档 → 矩形矢量场地，域由像素参数推导（1000×700×0.1=100×70） */
  const blank = api.migrateProject({ schema:'offline-drawing-annotation/v1',
    background: { width:1000, height:700, metersPerPixel:0.1 } });
  eq('迁移-空白档判为 rect', blank.background.kind, 'rect');
  eq('迁移-空白档形状域 100×70', [blank.background.shape.w, blank.background.shape.h], [100, 70]);

  /* 圆形场地清洗：保留实际圆心坐标（不再强制拉回域中心，便于「场地节点」编辑后重载还原） */
  const circ = api.migrateProject({ schema:'offline-drawing-annotation/v1',
    background: { kind:'circle', shape:{ type:'circle', r:20, cx:0, cy:0 } } });
  eq('迁移-圆形形状保留圆心', circ.background.shape, { type:'circle', cx:0, cy:0, r:20 });
  /* 缺省 cx/cy 时回退到域中心 r,r，与新建场地一致 */
  const circ2 = api.migrateProject({ schema:'offline-drawing-annotation/v1',
    background: { kind:'circle', shape:{ type:'circle', r:20 } } });
  eq('迁移-圆形缺省圆心回退域中心', [circ2.background.shape.cx, circ2.background.shape.cy], [20, 20]);

  /* 损坏的多边形（不足3点）回退矩形域 */
  const badPoly = api.migrateProject({ schema:'offline-drawing-annotation/v1',
    background: { kind:'polygon', shape:{ type:'polygon', points:[[0,0],[1,1]] }, width:2000, height:1000, metersPerPixel:0.1 } });
  eq('迁移-坏多边形回退矩形', badPoly.background.shape.type, 'rect');
  eq('迁移-回退域取像素推导 200×100', [badPoly.background.shape.w, badPoly.background.shape.h], [200, 100]);

  /* phys 清洗 + 自定义点类型 scaleShape/fov 保留 */
  const withPhys = api.migrateProject({ schema:'offline-drawing-annotation/v1',
    objectTypes: [{ id:'t1', kind:'point', name:'自定摄像', color:'#123456', scaleShape:'sector', fov:120 }],
    objects: [
      { id:'p1', kind:'point', typeId:'t1', name:'C1', x:1, y:1, phys:8.5 },
      { id:'p2', kind:'point', typeId:'t1', name:'C2', x:1, y:1, phys:-3 }
    ] });
  const t1 = withPhys.objectTypes.find(t => t.id === 't1');
  eq('迁移-自定义类型保留 scaleShape', t1.scaleShape, 'sector');
  eq('迁移-自定义类型保留 fov', t1.fov, 120);
  eq('迁移-正数 phys 保留', withPhys.objects.find(o=>o.name==='C1').phys, 8.5);
  eq('迁移-负 phys 归零', withPhys.objects.find(o=>o.name==='C2').phys, 0);
  eq('迁移-非法 scaleShape 丢弃', api.migrateProject({ schema:'offline-drawing-annotation/v1',
    objectTypes: [{ id:'t2', kind:'point', name:'X', color:'#123456', scaleShape:'weird' }] }).objectTypes.find(t=>t.id==='t2').scaleShape, undefined);
}

/* 12. 场地形状：默认值、规整、健壮性与描述文案 ----------------------------- */
{
  /* 新建工程默认就是 100×70 的矩形矢量场地，世界域一致 */
  const init = api.createInitialState();
  eq('初始场地 kind=rect', init.background.kind, 'rect');
  eq('初始场地形状', init.background.shape, { type:'rect', w:100, h:70 });
  api.resetState();
  eq('worldDims 取初始矩形域', api.worldDims(), { minX:0, minY:0, maxX:100, maxY:70, w:100, h:70 });

  /* 非法/非正尺寸一律回退默认（100×70）或最小下限，不能产生 NaN/0/负域 */
  eq('rect 域 w=0 回退100', api.siteDomainOf({kind:'rect',shape:{type:'rect',w:0,h:8}}), {w:100,h:8});
  eq('rect 域 负宽回退100', api.siteDomainOf({kind:'rect',shape:{type:'rect',w:-5,h:8}}), {w:100,h:8});
  eq('rect 域 字符串回退100', api.siteDomainOf({kind:'rect',shape:{type:'rect',w:'abc',h:8}}), {w:100,h:8});
  eq('rect 域 NaN 回退', api.siteDomainOf({kind:'rect',shape:{type:'rect',w:NaN,h:NaN}}), {w:100,h:70});
  eq('rect 域 缺 shape 回退默认', api.siteDomainOf({kind:'rect',shape:null}), {w:100,h:70});
  eq('rect 域 空背景默认', api.siteDomainOf({}), {w:100,h:70});
  eq('image 域 非正像素不塌缩', api.siteDomainOf({kind:'image',width:0,height:0,metersPerPixel:0.1}), {w:0.01,h:0.01});

  /* 对角拖拽：反向（右上→左下）与重合点（最小 0.05 下限） */
  eq('矩形规整-反向拖拽', api.rectShapeFromCorners([12,8],[2,3]), {type:'rect',w:10,h:5});
  eq('矩形规整-重合点保最小宽', api.rectShapeFromCorners([3,3],[3,3]), {type:'rect',w:0.05,h:0.05});

  /* 圆形：非法半径回退 0.05；域始终以 r 为边长、圆心在域中心 */
  eq('圆形规整-零半径下限', api.circleShapeFrom([0,0],0), {type:'circle',cx:0.05,cy:0.05,r:0.05});
  eq('圆形规整-负半径下限', api.circleShapeFrom([0,0],-10), {type:'circle',cx:0.05,cy:0.05,r:0.05});
  eq('圆形域-非法 r 回退50（域100）', api.siteDomainOf({kind:'circle',shape:{type:'circle',r:0}}), {w:100,h:100});

  /* 多边形：含负坐标点集先平移到第一象限，域随外接盒；不规则凹多边形也成立 */
  const shifted = api.polygonShapeFromPoints([[-5,-5],[5,-5],[5,5],[-5,5]]);
  eq('多边形规整-平移到原点', shifted, {type:'polygon',points:[[0,0],[10,0],[10,10],[0,10]]});
  eq('多边形域-平移后外接10×10', api.siteDomainOf({kind:'polygon',shape:shifted}), {w:10,h:10});
  const concave = api.polygonShapeFromPoints([[10,0],[0,0],[0,10],[5,5],[10,10]]);
  eq('凹多边形-首点即最小X', concave.points[0], [10,0]);
  eq('凹多边形-点数保留', concave.points.length, 5);

  /* 场地描述文案（统计/弹窗/报告共用），精度 2 位 */
  ok('描述-矩形含尺寸', api.siteDescription({kind:'rect',shape:{type:'rect',w:120,h:80}}).includes('矩形场地')
    && api.siteDescription({kind:'rect',shape:{type:'rect',w:120,h:80}}).includes('120.00×80.00'));
  ok('描述-图片含 m/px 与校准态', /图片底图[\s\S]*0\.20 m\/px[\s\S]*已校准/.test(
    api.siteDescription({kind:'image',fileName:'a.png',width:500,height:400,metersPerPixel:0.2,calibrated:true})));
  ok('描述-圆形含半径', api.siteDescription({kind:'circle',shape:{type:'circle',cx:30,cy:30,r:30}}).includes('半径 30.00'));
  ok('描述-多边形含边数', api.siteDescription({kind:'polygon',shape:{type:'polygon',points:[[0,0],[1,0],[1,1],[0,1]]}}).includes('4 条边'));
  eq('场地中文名覆盖四种', ['image','rect','circle','polygon'].map(api.siteKindName), ['图片底图','矩形场地','圆形场地','多边形场地']);
}

/* 13. 物理尺寸：缩放不变性、朝向覆盖、自定义视场、默认值 --------------------- */
{
  api.resetState();
  /* 新建点对象默认纯位置（phys=0） */
  eq('baseObject 点 phys 默认 0', api.baseObject('point').phys, 0);

  /* 世界坐标命中与 zoom 无关：圆形覆盖在任何缩放级别同一世界点结果一致 */
  const dome = {x:0,y:0,angle:0,phys:10,typeId:'point.dome'};
  api.state.viewport.zoom = 1;
  eq('圆形 zoom=1 命中', api.hitPhysicalPoint(dome,'circle',[5,0]), true);
  api.state.viewport.zoom = 20;
  eq('圆形 zoom=20 同点仍命中（真实比例）', api.hitPhysicalPoint(dome,'circle',[5,0]), true);
  eq('圆形 zoom=20 域外仍不命中', api.hitPhysicalPoint(dome,'circle',[6,0]), false);

  /* 杆：zoom 越大，世界坐标拾取容差越小（视觉越精确），但杆本身长度不随 zoom 变 */
  const gate = {x:0,y:0,angle:0,phys:10,typeId:'point.gate'};
  api.state.viewport.zoom = 1;
  eq('杆 zoom=1 近线 1m 在（容差 8m）', api.hitPhysicalPoint(gate,'bar',[0,1]), true);
  api.state.viewport.zoom = 100;
  eq('杆 zoom=100 近线 1m 不在（容差 0.12m）', api.hitPhysicalPoint(gate,'bar',[0,1]), false);
  eq('杆 zoom=100 端点仍在（长度是世界值）', api.hitPhysicalPoint(gate,'bar',[5,0]), true);
  const gate90 = Object.assign({}, gate, {angle:90});
  api.state.viewport.zoom = 100;   // 收紧拾取容差到 0.12m，才能判定杆的轴向
  eq('杆旋转90°沿 Y 轴', api.hitPhysicalPoint(gate90,'bar',[0,5]), true);
  eq('杆旋转90°X 向无杆', api.hitPhysicalPoint(gate90,'bar',[5,0]), false);

  /* 扇形：朝向角周期性（450°≡90°）、视场边界对称性、fov=360 全覆盖 */
  const cam = {x:0,y:0,angle:0,phys:10,typeId:'point.camera'};
  eq('扇形 450°≡90° +Y 在', api.hitPhysicalPoint(Object.assign({},cam,{angle:450}),'sector',[0,5]), true);
  eq('扇形 450°≡90° +X 不在', api.hitPhysicalPoint(Object.assign({},cam,{angle:450}),'sector',[5,0]), false);
  eq('扇形 180°朝 -X 背面点在', api.hitPhysicalPoint(Object.assign({},cam,{angle:180}),'sector',[-5,0]), true);
  eq('扇形 180°朝 -X 正向点不在', api.hitPhysicalPoint(Object.assign({},cam,{angle:180}),'sector',[5,0]), false);
  eq('扇形 fov90 另一侧对称点在', api.hitPhysicalPoint(cam,'sector',[5,-5]), true);
  eq('扇形 恰在半径边界在（含等号）', api.hitPhysicalPoint(cam,'sector',[10,0]), true);
  eq('扇形 超半径 1 像素不在', api.hitPhysicalPoint(cam,'sector',[10.001,0]), false);

  /* 非法 phys：负数/NaN 一律退回纯位置 */
  eq('负 phys 不生效', api.hitPhysicalPoint(Object.assign({},cam,{phys:-5}),'sector',[5,5]), false);
  eq('NaN phys 不生效', api.hitPhysicalPoint(Object.assign({},cam,{phys:NaN}),'sector',[5,5]), false);

  /* 自定义类型 fov：360° 全向覆盖，背面点也在；非法 fov 回退 90° */
  api.state.objectTypes.push({id:'t.omni',kind:'point',name:'全向',color:'#123456',scaleShape:'sector',fov:360});
  const omni = {x:0,y:0,angle:0,phys:10,typeId:'t.omni'};
  eq('自定义 fov=360 背面点在', api.hitPhysicalPoint(omni,'sector',[-5,0]), true);
  eq('自定义 fov=360 超半径不在', api.hitPhysicalPoint(omni,'sector',[11,0]), false);
  api.state.objectTypes.push({id:'t.bad',kind:'point',name:'坏张角',color:'#123456',scaleShape:'sector',fov:'abc'});
  const badFov = {x:0,y:0,angle:0,phys:10,typeId:'t.bad'};
  eq('非法 fov 回退90° 背面不在', api.hitPhysicalPoint(badFov,'sector',[-5,5]), false);
  eq('非法 fov 回退90° 正面在', api.hitPhysicalPoint(badFov,'sector',[5,5]), true);

  /* 方形：45° 旋转后轴点按旋转框判定 */
  const chg45 = {x:0,y:0,angle:45,phys:10,typeId:'point.charger'};
  eq('方旋转45° 轴上5m 在', api.hitPhysicalPoint(chg45,'square',[5,0]), true);
  eq('方旋转45° 轴上8m 不在', api.hitPhysicalPoint(chg45,'square',[8,0]), false);
}

/* 14. 区域参数形状：面积/命中/采样/标签中心 ------------------------------- */
{
  const rect={kind:'rect',x:0,y:0,width:10,height:10,angle:0,shape:null};
  const circle={kind:'rect',x:0,y:0,shape:{type:'circle',r:10}};
  const ellipse={kind:'rect',x:0,y:0,angle:0,shape:{type:'ellipse',rx:10,ry:5}};
  const sector={kind:'rect',x:0,y:0,shape:{type:'sector',r:10,a0:0,a1:90}};
  eq('形状类型-缺省 rect', api.areaShapeType({shape:null}), 'rect');
  eq('形状类型-circle', api.areaShapeType(circle), 'circle');
  approx('面积-矩形 100', api.shapeArea(rect), 100);
  approx('面积-圆 r10=100π', api.shapeArea(circle), 100*Math.PI, 1e-9);
  approx('面积-椭圆 10×5=50π', api.shapeArea(ellipse), 50*Math.PI, 1e-9);
  approx('面积-90°扇形=25π', api.shapeArea(sector), 25*Math.PI, 1e-9);
  approx('面积-整圆扇形=100π', api.shapeArea({shape:{type:'sector',r:10,a0:0,a1:360}}), 100*Math.PI, 1e-9);

  /* 周长：矩形 2(w+h)；圆 2πr；椭圆退化为圆时=2πr；扇形=2r+弧长；整圆扇=圆周 */
  approx('周长-矩形 40', api.shapePerimeter(rect), 40, 1e-9);
  approx('周长-圆 20π', api.shapePerimeter(circle), 20*Math.PI, 1e-9);
  approx('周长-椭圆(a=b=10)退化圆', api.shapePerimeter({kind:'rect',x:0,y:0,shape:{type:'ellipse',rx:10,ry:10}}), 20*Math.PI, 1e-6);
  approx('周长-90°扇形 20+5π', api.shapePerimeter(sector), 20+5*Math.PI, 1e-9);
  approx('周长-整圆扇=20π', api.shapePerimeter({kind:'rect',x:0,y:0,shape:{type:'sector',r:10,a0:0,a1:360}}), 20*Math.PI, 1e-9);
  approx('周长-零尺寸矩形为0', api.shapePerimeter({kind:'rect',x:0,y:0,width:0,height:0,shape:null}), 0, 1e-9);

  eq('扇形张角-普通 90', api.sectorSweep({a0:0,a1:90}), 90);
  eq('扇形张角-反向取模 270', api.sectorSweep({a0:90,a1:0}), 270);
  eq('扇形张角-零张角视为 360', api.sectorSweep({a0:30,a1:30}), 360);
  eq('扇形弧采样点数 seg+1', api.sectorArcPoints(0,0,10,0,90,12).length, 13);

  eq('圆形采样 72 顶点', api.shapeWorldPoints(circle).length, 72);
  eq('扇形首点为圆心', api.shapeWorldPoints(sector)[0], [0,0]);

  eq('命中-圆边界在', api.shapeHit(circle,[10,0]), true);
  eq('命中-圆外不在', api.shapeHit(circle,[10.01,0]), false);
  eq('命中-椭圆轴端在', api.shapeHit(ellipse,[0,-5]), true);
  eq('命中-椭圆短轴外不在', api.shapeHit(ellipse,[0,5.01]), false);
  eq('命中-椭圆内点(7,4)换算不在', api.shapeHit(ellipse,[7,4]), false);
  const ellipse90=Object.assign({},ellipse,{angle:90});
  eq('命中-椭圆旋转90后短轴到X', api.shapeHit(ellipse90,[5,0]), true);
  eq('命中-扇形内侧点', api.shapeHit(sector,[5,5]), true);
  eq('命中-扇形背面不在', api.shapeHit(sector,[-5,5]), false);
  eq('命中-扇形圆心在', api.shapeHit(sector,[0,0]), true);
  eq('命中-扇形超半径不在', api.shapeHit(sector,[10.01,0]), false);

  eq('标签中心-圆取锚点', api.shapeLabelCenter(circle), [0,0]);
  ok('参数文案-圆形含半径', api.areaParamText(circle).includes('圆形'));
  ok('参数文案-扇形含张角', api.areaParamText(sector).includes('90'));
}

/* 15. 区域形状互换：中心保持、等面积换算、角度保留 -------------------------- */
{
  /* 10×10 矩形（左下原点）→ 圆：面积 100 不变，圆心移到矩形中心 (5,5) */
  const o1={kind:'rect',x:0,y:0,width:10,height:10,angle:0,shape:null};
  api.convertAreaShape(o1,'circle');
  eq('换形-rect→circle 类型', o1.shape.type, 'circle');
  approx('换形-rect→circle 面积守恒', api.shapeArea(o1), 100, 1e-9);
  eq('换形-rect→circle 圆心居中', [Math.round(o1.x*1e6)/1e6,Math.round(o1.y*1e6)/1e6], [5,5]);

  /* 圆 r=10（面积 100π，中心 0,0）→ 矩形：边长 sqrt(100π)≈17.725，中心仍 (0,0) */
  const o2={kind:'rect',x:0,y:0,shape:{type:'circle',r:10}};
  const area2=api.shapeArea(o2);
  api.convertAreaShape(o2,'rect');
  eq('换形-circle→rect 清空 shape', o2.shape, null);
  approx('换形-circle→rect 面积守恒', api.shapeArea(o2), area2, 1e-9);
  approx('换形-circle→rect 中心 X 不变', o2.x+o2.width/2, 0, 1e-9);

  /* 圆 r=10 → 90°扇形：等面积 r=20；再回圆面积仍一致 */
  const o3={kind:'rect',x:0,y:0,shape:{type:'circle',r:10}};
  const area3=api.shapeArea(o3);
  api.convertAreaShape(o3,'sector');
  eq('换形-circle→sector 类型', o3.shape.type, 'sector');
  approx('换形-sector r=20', o3.shape.r, 20, 1e-9);
  approx('换形-circle→sector 面积守恒', api.shapeArea(o3), area3, 1e-9);
  api.convertAreaShape(o3,'circle');
  approx('换形-sector→circle 面积守恒', api.shapeArea(o3), area3, 1e-9);

  /* 椭圆 20×10 → 矩形：外接盒宽高 20×10 */
  const o4={kind:'rect',x:0,y:0,angle:0,shape:{type:'ellipse',rx:10,ry:5}};
  api.convertAreaShape(o4,'rect');
  approx('换形-ellipse→rect 取外接宽', o4.width, 20, 1e-9);
  approx('换形-ellipse→rect 取外接高', o4.height, 10, 1e-9);

  /* 矩形旋转 30° → 椭圆保留角度；未知形状忽略 */
  const o5={kind:'rect',x:0,y:0,width:12,height:6,angle:30,shape:null};
  api.convertAreaShape(o5,'ellipse');
  approx('换形-rect30→ellipse 保留角度', o5.angle, 30, 1e-9);
  approx('换形-ellipse 半轴 rx=6', o5.shape.rx, 6, 1e-9);
  const before=JSON.stringify(o5);
  api.convertAreaShape(o5,'star');
  eq('换形-未知形状忽略', JSON.stringify(o5), before);
}

/* 16. 点设备图标倍率：三层连乘与钳制（屏幕语义，与 zoom 无关） ------------- */
{
  api.resetState();
  const st=api.state;
  st.settings.markerScale=1;
  const p=api.baseObject('point','point.marker',{x:0,y:0});
  eq('倍率-默认 1', api.pointIconScale(p), 1);
  st.settings.markerScale=1.5; p.iconSize=2;
  approx('倍率-全局1.5×对象2', api.pointIconScale(p), 3, 1e-9);
  st.objectTypes.find(t=>t.id==='point.marker').iconSize=1.5;
  approx('倍率-三层连乘 4.5', api.pointIconScale(p), 4.5, 1e-9);
  st.settings.markerScale=10; p.iconSize=10;
  eq('倍率-上限钳制 8', api.pointIconScale(p), 8);
  st.settings.markerScale=0.1; p.iconSize=0.1;
  st.objectTypes.find(t=>t.id==='point.marker').iconSize=1;
  eq('倍率-下限钳制 .2', api.pointIconScale(p), .2);
  st.settings.markerScale=1;
}

/* 17. 椭圆/扇形矢量场地：构造、域、描述、迁移清洗 -------------------------- */
{
  /* 包围盒两角点 → 中心在域中心 */
  eq('椭圆场地-角点规整', api.ellipseShapeFromCorners([0,0],[20,10]),
    {type:'ellipse',cx:10,cy:5,rx:10,ry:5,angle:0});
  eq('椭圆场地-反向角点', api.ellipseShapeFromCorners([20,10],[0,0]),
    {type:'ellipse',cx:10,cy:5,rx:10,ry:5,angle:0});
  eq('椭圆域-2rx×2ry', api.siteDomainOf({kind:'ellipse',shape:{type:'ellipse',cx:10,cy:5,rx:10,ry:5}}), {w:20,h:10});

  /* 第一象限扇形（0–90°，圆心原点）：弧点 x,y∈[0,10]，域 10×10，不平移 */
  const s1=api.sectorShapeFrom([0,0],10,0,90);
  eq('扇形场地-第一象限圆心', [s1.cx,s1.cy], [0,0]);
  eq('扇形场地-域 10×10', api.siteDomainOf({kind:'sector',shape:s1}), {w:10,h:10});

  /* 圆心 (5,5) 同扇形：整体平移到第一象限，圆心归 0，域不变 */
  const s2=api.sectorShapeFrom([5,5],10,0,90);
  eq('扇形场地-圆心平移归零', [s2.cx,s2.cy], [0,0]);
  eq('扇形场地-平移后域 10×10', api.siteDomainOf({kind:'sector',shape:s2}), {w:10,h:10});

  /* 180–270°（左下象限）圆心原点：弧点 x,y∈[-10,0]，平移后圆心到 (10,10) */
  const s3=api.sectorShapeFrom([0,0],10,180,270);
  approx('扇形场地-负象限平移后圆心X', s3.cx, 10, 1e-9);
  approx('扇形场地-负象限平移后圆心Y', s3.cy, 10, 1e-9);
  const d3=api.siteDomainOf({kind:'sector',shape:s3});
  approx('扇形场地-负象限域宽', d3.w, 10, 1e-9);
  approx('扇形场地-负象限域高', d3.h, 10, 1e-9);

  /* 非法半径/角度兜底 */
  eq('扇形场地-零半径下限', api.sectorShapeFrom([0,0],0,0,90).r, 0.05);
  eq('扇形场地-缺省张角 90', api.sectorSweep(api.sectorShapeFrom([0,0],10)), 90);

  eq('场地中文名-六种', ['image','rect','circle','ellipse','sector','polygon'].map(api.siteKindName),
    ['图片底图','矩形场地','圆形场地','椭圆场地','扇形场地','多边形场地']);
  ok('描述-椭圆含两半径', api.siteDescription({kind:'ellipse',shape:{type:'ellipse',cx:10,cy:5,rx:10,ry:5,angle:0}}).includes('10.00×5.00'));
  ok('描述-扇形含半径张角', /扇形场地[\s\S]*半径 10\.00[\s\S]*90°/.test(
    api.siteDescription({kind:'sector',shape:s1})));
}

/* 18. 迁移：区域参数形状、点 iconSize、全局倍率、自定义类型图标大小 --------- */
{
  /* 圆形/椭圆/扇形区域对象往返 */
  const m1=api.migrateProject({ schema:'offline-drawing-annotation/v1',
    objects:[
      { id:'c1', kind:'rect', typeId:'rect.area', name:'C1', x:5, y:5, shape:{type:'circle',r:12} },
      { id:'e1', kind:'rect', typeId:'rect.area', name:'E1', x:0, y:0, shape:{type:'ellipse',rx:8,ry:4} },
      { id:'s1', kind:'rect', typeId:'rect.area', name:'S1', x:0, y:0, shape:{type:'sector',r:10,a0:0,a1:270} },
      { id:'bad', kind:'rect', typeId:'rect.area', name:'BAD', x:0, y:0, shape:{type:'circle',r:0}, width:4, height:5 }
    ]});
  const C1=m1.objects.find(o=>o.name==='C1');
  eq('迁移-圆形区域保留', C1.shape, {type:'circle',r:12});
  eq('迁移-圆形区域清空宽高', [C1.width,C1.height], [0,0]);
  const E1=m1.objects.find(o=>o.name==='E1');
  eq('迁移-椭圆区域保留', E1.shape, {type:'ellipse',rx:8,ry:4});
  const S1=m1.objects.find(o=>o.name==='S1');
  eq('迁移-扇形区域保留张角', [S1.shape.type,S1.shape.a0,S1.shape.a1], ['sector',0,270]);
  ok('迁移-非法圆形不残留 shape', m1.objects.every(o=>o.name!=='BAD' || !o.shape));

  /* 点对象 iconSize 钳制 .5–3 */
  const m2=api.migrateProject({ schema:'offline-drawing-annotation/v1',
    objects:[
      { id:'i1', kind:'point', typeId:'point.marker', name:'I1', x:0, y:0, iconSize:2 },
      { id:'i2', kind:'point', typeId:'point.marker', name:'I2', x:0, y:0, iconSize:99 },
      { id:'i3', kind:'point', typeId:'point.marker', name:'I3', x:0, y:0, iconSize:-4 }
    ]});
  eq('迁移-iconSize 合法保留', m2.objects.find(o=>o.name==='I1').iconSize, 2);
  eq('迁移-iconSize 上限 3', m2.objects.find(o=>o.name==='I2').iconSize, 3);
  eq('迁移-iconSize 下限 .5', m2.objects.find(o=>o.name==='I3').iconSize, .5);

  /* 全局点大小倍率钳制 .5–2.5，缺省 1 */
  eq('迁移-markerScale 缺省 1', api.migrateProject({schema:'offline-drawing-annotation/v1'}).settings.markerScale, 1);
  eq('迁移-markerScale 过大钳 2.5', api.migrateProject({schema:'offline-drawing-annotation/v1',settings:{markerScale:9}}).settings.markerScale, 2.5);
  eq('迁移-markerScale 过小钳 .5', api.migrateProject({schema:'offline-drawing-annotation/v1',settings:{markerScale:0}}).settings.markerScale, .5);

  /* 十字准星/段长度开关：旧档缺省为 true，显式 false 保留 */
  const dflt=api.migrateProject({schema:'offline-drawing-annotation/v1'}).settings;
  eq('迁移-十字开关缺省开', dflt.showCursor, true);
  eq('迁移-段长开关缺省开', dflt.showSegLen, true);
  const off=api.migrateProject({schema:'offline-drawing-annotation/v1',settings:{showCursor:false,showSegLen:false}}).settings;
  eq('迁移-十字关闭保留', off.showCursor, false);
  eq('迁移-段长关闭保留', off.showSegLen, false);

  /* 自定义点类型 iconSize 保留，越界丢弃 */
  const m3=api.migrateProject({ schema:'offline-drawing-annotation/v1',
    objectTypes:[
      { id:'big', kind:'point', name:'大点', color:'#123456', iconSize:2.5 },
      { id:'huge', kind:'point', name:'超大点', color:'#123456', iconSize:99 }
    ]});
  eq('迁移-类型 iconSize 保留', m3.objectTypes.find(t=>t.id==='big').iconSize, 2.5);
  eq('迁移-类型非法 iconSize 丢弃', m3.objectTypes.find(t=>t.id==='huge').iconSize, undefined);

  /* 椭圆/扇形场地迁移 */
  const m4=api.migrateProject({ schema:'offline-drawing-annotation/v1',
    background:{ kind:'ellipse', shape:{type:'ellipse',rx:30,ry:15} } });
  eq('迁移-椭圆场地 kind', m4.background.kind, 'ellipse');
  eq('迁移-椭圆场地形状', [m4.background.shape.rx,m4.background.shape.ry,m4.background.shape.cx,m4.background.shape.cy], [30,15,30,15]);
  const m5=api.migrateProject({ schema:'offline-drawing-annotation/v1',
    background:{ kind:'sector', shape:{type:'sector',cx:0,cy:0,r:20,a0:0,a1:90} } });
  eq('迁移-扇形场地 kind', m5.background.kind, 'sector');
  eq('迁移-扇形场地半径', m5.background.shape.r, 20);
  eq('迁移-扇形场地域', [api.siteDomainOf(m5.background).w,api.siteDomainOf(m5.background).h], [20,20]);

  /* 坏椭圆场地回退矩形（不产生非法域） */
  const m6=api.migrateProject({ schema:'offline-drawing-annotation/v1',
    background:{ kind:'ellipse', shape:{type:'ellipse',rx:0,ry:0} } });
  eq('迁移-坏椭圆回退矩形形状', m6.background.shape.type, 'rect');

  /* 测距链：subtype=ruler 保留；非法 subtype 回退 distance；ruler 至少 2 点，单点丢弃 */
  const m7=api.migrateProject({ schema:'offline-drawing-annotation/v1',
    objects:[
      { id:'r1', kind:'dimension', typeId:'dim.custom', name:'R1', x:0, y:0, subtype:'ruler',
        points:[[0,0],[3,4],[3,14]] },
      { id:'r2', kind:'dimension', typeId:'dim.custom', name:'R2', x:0, y:0, subtype:'bogus',
        points:[[0,0],[1,1]] },
      { id:'r3', kind:'dimension', typeId:'dim.custom', name:'R3', x:0, y:0, subtype:'ruler',
        points:[[0,0]] }
    ]});
  const R1=m7.objects.find(o=>o.name==='R1');
  eq('迁移-测距链子类型保留', R1.subtype, 'ruler');
  eq('迁移-测距链3点保留', R1.points.length, 3);
  eq('迁移-测距链首点同步锚点', [R1.x,R1.y], [0,0]);
  eq('迁移-非法子类型回退 distance', m7.objects.find(o=>o.name==='R2').subtype, 'distance');
  eq('迁移-单点测距链丢弃', m7.objects.some(o=>o.name==='R3'), false);

  /* 面积图签开关：旧档缺省开，显式关闭保留 */
  eq('迁移-面积图签缺省开', api.migrateProject({schema:'offline-drawing-annotation/v1'}).settings.showAreaTag, true);
  eq('迁移-面积图签关闭保留', api.migrateProject({schema:'offline-drawing-annotation/v1',settings:{showAreaTag:false}}).settings.showAreaTag, false);
}

/* 19. 区域基点：面板设置 (o.x,o.y) 与渲染/命中同基准，允许负值 ---------------- */
{
  api.resetState();
  const field=(k,v)=>({dataset:{field:k}, value:String(v), type:'number', checked:false});
  const noop=()=>{};

  /* 圆形：基点=圆心，改基点后命中判定立刻跟随同一基准 */
  const c=api.baseObject('rect','rect.area',{x:10,y:10,shape:{type:'circle',r:5}});
  eq('基点-初始圆心在圆内', api.shapeHit(c,[10,10]), true);
  api.applyField(field('x',20),c,noop);
  api.applyField(field('y',20),c,noop);
  eq('基点-设置圆心 X', c.x, 20);
  eq('基点-设置圆心 Y', c.y, 20);
  eq('基点-旧圆心已在圆外', api.shapeHit(c,[10,10]), false);
  eq('基点-新圆心在圆内', api.shapeHit(c,[20,20]), true);
  eq('基点-半径不随移动改变', c.shape.r, 5);

  /* 基点允许负值（可在场地外，与拖拽移动一致），非法输入归零 */
  api.applyField(field('x',-12.5),c,noop);
  eq('基点-负坐标保留', c.x, -12.5);
  api.applyField(field('y','abc'),c,noop);
  eq('基点-非法输入归零', c.y, 0);

  /* 矩形：基点=第一角点；尺寸字段仍被钳为非负 */
  const r=api.baseObject('rect','rect.area',{x:0,y:0,width:8,height:4});
  api.applyField(field('x',-3),r,noop);
  eq('基点-矩形负基点保留', r.x, -3);
  api.applyField(field('width',-9),r,noop);
  eq('基点-矩形宽度仍非负', r.width, 0);

  /* 基点修改不破坏形状对象引用（圆仍可正常换算面积） */
  approx('基点-移动后圆面积不变', api.shapeArea(c), 25*Math.PI, 1e-9);
}

/* 20. 折线节点编辑：坐标修改、插入、删除、最小点数与锚点同步 ----------------- */
{
  const mk=closed=>api.baseObject('line','line.custom',{points:[[0,0],[10,0],[10,10]],closed:!!closed,x:0,y:0});

  /* 最小节点数：开放 2 / 闭合 3 */
  eq('节点-开放折线最小2点', api.lineMinNodes(mk(false)), 2);
  eq('节点-闭合区域最小3点', api.lineMinNodes(mk(true)), 3);

  /* 修改坐标：允许负值；首点修改同步锚点；非法值拒绝 */
  const l1=mk(false);
  eq('节点-改节点1 Y', api.setNodeCoord(l1,1,'y',-5), true);
  eq('节点-负值写入', l1.points[1][1], -5);
  eq('节点-非节点对象拒改', api.setNodeCoord({},0,'x',1), false);
  eq('节点-越界索引拒改', api.setNodeCoord(l1,9,'x',1), false);
  eq('节点-非法数字拒改', api.setNodeCoord(l1,0,'x','abc'), false);
  eq('节点-非法时原值保留', l1.points[0][0], 0);
  api.setNodeCoord(l1,0,'x',3);
  eq('节点-首点同步锚点 X', l1.x, 3);

  /* 中间插入：在 #1 后插中点 (10,5)，点数 4，位置索引 2 */
  const l2=mk(false);
  eq('节点-插入返回成功', api.insertLineNode(l2,1,[10,5]), true);
  eq('节点-插入后点数', l2.points.length, 4);
  eq('节点-插入点坐标', l2.points[2], [10,5]);
  /* 末尾节点后插入=追加 */
  eq('节点-末点后追加', api.insertLineNode(l2,3,[20,20]), true);
  eq('节点-追加在末尾', l2.points[4], [20,20]);
  /* 非折线对象不能插 */
  eq('节点-非折线拒插', api.insertLineNode({kind:'rect'},0,[1,1]), false);

  /* 删除：开放折线 3 点可删 1 个；2 点时再删被拒 */
  const l3=mk(false);
  eq('节点-删除成功', api.removeLineNode(l3,1), true);
  eq('节点-删除后点数', l3.points.length, 2);
  eq('节点-删除后剩余点正确', l3.points[1], [10,10]);
  eq('节点-2点拒绝再删', api.removeLineNode(l3,0), false);
  eq('节点-拒绝后点数不变', l3.points.length, 2);

  /* 闭合 3 点不允许删除；插入后可删；删首点后锚点跟随新首点 */
  const l4=mk(true);
  eq('节点-闭合3点拒删', api.removeLineNode(l4,2), false);
  api.insertLineNode(l4,0,[0,5]);           // #1 后插入，新点成 #2
  eq('节点-闭合插入后4点', l4.points.length, 4);
  eq('节点-闭合插入位置', l4.points[1], [0,5]);
  eq('节点-闭合4点可删', api.removeLineNode(l4,0), true);
  eq('节点-删首点后锚点同步 X', l4.x, l4.points[0][0]);
  eq('节点-删首点后锚点同步 Y', l4.y, l4.points[0][1]);
  eq('节点-闭合态保持', l4.closed, true);

  /* 节点编辑器 HTML：列表需跨满属性面板两列（否则坐标输入框被压进标签列只剩几十像素） */
  const eh=api.renderNodeEditor(mk(false));
  ok('节点编辑器-列表跨满整行', eh.includes('class="node-list span2"'));
  ok('节点编辑器-含坐标输入框', eh.includes('data-node-axis="x"') && eh.includes('data-node-axis="y"'));
}

/* 21. 节点排序：move/step 语义、越界保护、锚点同步 -------------------------- */
{
  const mk=()=>api.baseObject('line','line.custom',{points:[[0,0],[1,1],[2,2],[3,3]],x:0,y:0});

  /* #0 与 #1 交换（上移到头被拒）；下移同理 */
  const l1=mk();
  eq('排序-首节点不能上移', api.moveNodeStep(l1,0,-1), false);
  eq('排序-拒绝后顺序不变', l1.points.map(p=>p[0]).join(','), '0,1,2,3');
  eq('排序-#1 上移', api.moveNodeStep(l1,1,-1), true);
  eq('排序-#1 上移后顺序', l1.points.map(p=>p[0]).join(','), '1,0,2,3');
  eq('排序-末节点不能下移', api.moveNodeStep(l1,3,1), false);

  /* move：#0 移到 #2 位置（1,0,2,3 → 1,2,0,3），其余相对顺序保持 */
  const l2=mk();
  eq('排序-move 成功', api.moveNode(l2,0,2), true);
  eq('排序-move 后序列', l2.points.map(p=>p[0]).join(','), '1,2,0,3');
  eq('排序-move 非法参数拒绝', api.moveNode(l2,1,9), false);
  eq('排序-move 同位拒绝', api.moveNode(l2,1,1), false);
  eq('排序-move 拒绝后序列不变', l2.points.map(p=>p[0]).join(','), '1,2,0,3');

  /* 排序后首点变化同步锚点 */
  const l3=mk();
  api.moveNode(l3,2,0);
  eq('排序-新首点同步锚点', [l3.x,l3.y], [2,2]);
  eq('排序-新首点位于首位', l3.points[0], [2,2]);

  /* 非折线对象不能排序 */
  eq('排序-非折线拒绝', api.moveNode({kind:'rect'},0,1), false);
}

/* 22. 静态资源引用完整性：index.html 引用的本地文件都必须真实存在 ------------- */
{
  const exists = rel => { try { readFileSync(join(root, rel)); return true; } catch { return false; } };
  const referenced = [...html.matchAll(/(?:src|href)="(?!https?:|data:|#)([^"]+)"/g)].map(m => m[1]);
  ok('静态-存在本地引用（脚本/样式/图标/manifest）', referenced.length >= 16);
  const missing = referenced.filter(r => !exists(r.split('?')[0]));
  eq('静态-全部本地引用可达', missing, []);
  ok('静态-icon.svg 存在', exists('icon.svg'));
  ok('静态-manifest.webmanifest 存在', exists('manifest.webmanifest'));
  ok('静态-标题含图钉品牌', /图钉 PlotPin/.test(html));
}

/* 23. Shift 精确约束：正交/极轴/正方形（预览与落点共用纯函数） ---------------- */
{
  /* 正交：主导分量为 X 时钳为水平（Y 回到基点）；主导为 Y 时钳为垂直 */
  eq('正交-水平(右)', api.orthoPoint([0,0],[8,2],true), [8,0]);
  eq('正交-水平(左)', api.orthoPoint([0,0],[-8,-2],true), [-8,0]);
  eq('正交-垂直(上)', api.orthoPoint([5,5],[6,12],true), [5,12]);
  eq('正交-垂直(下)', api.orthoPoint([5,5],[4,-9],true), [5,-9]);
  eq('正交-45°等分量取水平(含等号)', api.orthoPoint([0,0],[5,5],true), [5,0]);
  eq('正交-不按Shift透传', api.orthoPoint([0,0],[8,2],false), [8,2]);
  eq('正交-无基点透传', api.orthoPoint(null,[8,2],true), [8,2]);

  /* 极轴 45° 吸附：半径保持，角度钳到最近的 45° 倍 */
  eq('极轴-20°→0°', api.polarSnap45([0,0],[10*Math.cos(20*Math.PI/180),10*Math.sin(20*Math.PI/180)],true).map(v=>Math.round(v*1e6)), [10000000,0]);
  const p90=api.polarSnap45([0,0],[0,10],true);
  approx('极轴-70°→90° X≈0', p90[0], 0, 1e-9);
  approx('极轴-70°→90° Y=10', p90[1], 10, 1e-9);
  eq('极轴-120°→135°', (()=>{const p=api.polarSnap45([0,0],[10*Math.cos(120*Math.PI/180),10*Math.sin(120*Math.PI/180)],true);return [Math.round(p[0]*1e6),Math.round(p[1]*1e6)];})(),
    [Math.round(10*Math.cos(135*Math.PI/180)*1e6),Math.round(10*Math.sin(135*Math.PI/180)*1e6)]);
  const c=[3,4], snapped=api.polarSnap45(c,[13,9],true);
  approx('极轴-吸附后到圆心半径不变', Math.hypot(snapped[0]-c[0],snapped[1]-c[1]), Math.hypot(10,5), 1e-9);
  eq('极轴-不按Shift透传', api.polarSnap45([0,0],[3,1],false), [3,1]);

  /* 正方形角点：边长=主导位移，方向符号保留 */
  eq('正方形-右下拉正', api.squareCorner([0,0],[8,3],true), [8,8]);
  eq('正方形-右下拉正(Y主导)', api.squareCorner([0,0],[3,8],true), [8,8]);
  eq('正方形-左上符号保留', api.squareCorner([10,10],[2,4],true), [2,2]);
  eq('正方形-不按Shift透传', api.squareCorner([0,0],[8,3],false), [8,3]);
  eq('正方形-零位移透传', api.squareCorner([0,0],[0,0],true), [0,0]);
}

/* 24. 对象捕捉 OSNAP：候选收集、阈值命中、自身排除、类型齐全 ------------------ */
{
  api.resetState();
  const st=api.state;
  /* 开放折线 3 点：3 个端点 + 2 个中点 */
  const line=api.baseObject('line','line.custom',{points:[[0,0],[10,0],[10,10]],x:0,y:0});
  /* 圆形区域：1 圆心 + 4 象限点 */
  const circ=api.baseObject('rect','rect.area',{x:30,y:30,shape:{type:'circle',r:5}});
  /* 点设备：1 端点 */
  const pt=api.baseObject('point','point.marker',{x:50,y:50});
  st.objects.push(line,circ,pt);

  const cands=api.collectSnapCandidates(st);
  eq('捕捉-候选总数 3+2+1+4+1=11', cands.length, 11);
  eq('捕捉-类型标签中文', api.OSNAP_LABELS.midpoint, '中点');

  const byType=t=>cands.filter(c=>c.type===t).length;
  eq('捕捉-端点数 折线3+点1=4', byType('endpoint'), 4);
  eq('捕捉-中点数 2', byType('midpoint'), 2);
  eq('捕捉-圆心率 1', byType('center'), 1);
  eq('捕捉-象限点数 4', byType('quadrant'), 4);

  /* 线段中点 (5,0) 与 (10,5) */
  ok('捕捉-含第一段中点', cands.some(c=>c.type==='midpoint'&&c.p[0]===5&&c.p[1]===0));
  ok('捕捉-含第二段中点', cands.some(c=>c.type==='midpoint'&&c.p[0]===10&&c.p[1]===5));
  /* 圆象限点 (35,30)/(25,30)/(30,35)/(30,25) */
  [[35,30],[25,30],[30,35],[30,25]].forEach(q=>{
    ok('捕捉-圆象限点 '+q.join(), cands.some(c=>c.type==='quadrant'&&Math.abs(c.p[0]-q[0])<1e-9&&Math.abs(c.p[1]-q[1])<1e-9));
  });
  ok('捕捉-圆心(30,30)', cands.some(c=>c.type==='center'&&c.p[0]===30&&c.p[1]===30));

  /* 阈值命中：鼠标世界点在阈值内被吸到候选；阈值外返回 null */
  const hit1=api.findOsnap(st,[10.3,0.2],0.5);
  ok('捕捉-近端点击中端点', hit1&&hit1.type==='endpoint'&&hit1.p[0]===10&&hit1.p[1]===0);
  eq('捕捉-空旷处无命中', api.findOsnap(st,[80,80],0.5), null);
  /* 同时靠近端点与中点时取更近者 */
  const hit2=api.findOsnap(st,[10,0.2],0.5);
  ok('捕捉-取最近候选', hit2&&hit2.p[0]===10&&hit2.p[1]===0);

  /* 排除自身：拖折线节点时不吸到自己的特征点（避免抖动），但能吸到别的对象 */
  const excl=new Set([line.id]);
  eq('捕捉-排除自身后原端点不命中', api.findOsnap(st,[10.3,0.2],0.5,excl), null);
  const hit3=api.findOsnap(st,[30,30.2],0.5,excl);
  ok('捕捉-排除自身仍可吸其他对象(圆心)', hit3&&hit3.type==='center'&&hit3.p[0]===30);

  /* 闭合多边形：n 个节点产生 n 个中点（含闭合边） */
  const poly=api.baseObject('line','line.custom',{closed:true,points:[[0,0],[10,0],[10,10],[0,10]],x:0,y:0});
  const st2=api.createInitialState(); st2.objects.push(poly);
  eq('捕捉-闭合区域中点含闭合边=4', api.collectSnapCandidates(st2).filter(c=>c.type==='midpoint').length, 4);

  /* 不可见对象不提供候选 */
  const st3=api.createInitialState();
  const hidden=api.baseObject('point','point.marker',{x:0,y:0,visible:false});
  st3.objects.push(hidden);
  eq('捕捉-隐藏点无候选', api.collectSnapCandidates(st3,o=>o.visible!==false).length, 0);

  /* Tab 类型锁定：仅命中指定类型，其余类型即使更近也被过滤 */
  const hitF1=api.findOsnap(st,[5.1,0.1],0.5,null,null,'midpoint');
  ok('锁定中点-命中第一段中点', hitF1&&hitF1.type==='midpoint'&&hitF1.p[0]===5&&hitF1.p[1]===0);
  eq('锁定端点-中点位置不命中', api.findOsnap(st,[5.1,0.1],0.5,null,null,'endpoint'), null);
  /* 锁定圆心：(30,30.2) 只命中圆心；锁定端点时同位置无端点候选 → null */
  const hitF2=api.findOsnap(st,[30,30.2],0.5,null,null,'center');
  ok('锁定圆心-命中', hitF2&&hitF2.type==='center'&&hitF2.p[0]===30);
  eq('锁定端点-圆心位置不命中', api.findOsnap(st,[30,30.2],0.5,null,null,'endpoint'), null);
  /* 锁定类型不放宽阈值：远处无该类型候选时返回 null */
  eq('锁定象限-空旷处无命中', api.findOsnap(st,[80,80],0.5,null,null,'quadrant'), null);
}

/* 25. 捕捉扩展：象限点/垂足/跨对象交点/切点 ------------------------------- */
{
  api.resetState();
  const st=api.state;
  /* 两条跨对象相交的水平线/竖直线：y=10 与 x=15 交于 (15,10)；
     两线都取不对称长度，使中点不落在交点，保证交点被独立识别 */
  const hLine=api.baseObject('line','line.custom',{points:[[0,10],[40,10]],x:0,y:10});
  const vLine=api.baseObject('line','line.custom',{points:[[15,0],[15,40]],x:15,y:0});
  /* 圆心 (40,10) r=5；点 (40,20) 在圆外，其切线切点之一在圆上 */
  const circ=api.baseObject('rect','rect.area',{x:40,y:10,shape:{type:'circle',r:5}});
  st.objects.push(hLine,vLine,circ);

  /* 象限点：圆上 0/90/180/270 四个方向点单独成类 */
  const quads=api.collectSnapCandidates(st).filter(c=>c.type==='quadrant');
  eq('象限-圆4个象限点', quads.length, 4);
  [[45,10],[35,10],[40,15],[40,5]].forEach(q=>{
    ok('象限-含 '+q.join(), quads.some(c=>Math.hypot(c.p[0]-q[0],c.p[1]-q[1])<1e-9));
  });
  const hitQ=api.findOsnap(st,[45.15,10.1],0.3);
  ok('象限-右点被捕捉', hitQ&&hitQ.type==='quadrant'&&Math.abs(hitQ.p[0]-45)<1e-9);

  /* 垂足：取 (25,14) 到水平线 y=10 的垂足 (25,10)，垂距 4 < tol 5；
     避开中点(20,10)与交点(15,10)，保证独立命中垂足 */
  const hitP=api.findOsnap(st,[25,14],5);
  ok('垂足-命中线段', hitP&&hitP.type==='perpendicular'&&hitP.p[0]===25&&hitP.p[1]===10);
  /* 垂足夹到线段端点内：x=-5 超出水平线起点，垂足夹回端点 (0,10)，归为端点类型（端点优先） */
  const hitP2=api.findOsnap(st,[-5,10.2],6);
  ok('垂足-超出夹回端点', hitP2&&hitP2.type==='endpoint'&&hitP2.p[0]===0);

  /* 跨对象交点：(15,10)，交点优先级高于垂足（鼠标偏离 0.17 仍命中交点而非线上垂足） */
  const allEdges=api.collectSnapEdges(st);
  eq('交点-两条线各1边共2', allEdges.length, 2);
  const hitI=api.findOsnap(st,[15.12,10.12],0.3);
  ok('交点-跨对象命中 '+JSON.stringify(hitI), hitI&&hitI.type==='intersection'&&hitI.p[0]===15&&hitI.p[1]===10);
  /* 同对象线段交点不算：单独一条 V 形折线自身节点不产生交点候选 */
  const st2=api.createInitialState();
  st2.objects.push(api.baseObject('line','line.custom',{points:[[0,0],[10,10],[0,20]],x:0,y:0}));
  eq('交点-同对象自身不产交点', api.collectSnapCandidates(st2).filter(c=>c.type==='intersection').length, 0);

  /* 切点（径向语义）：鼠标在圆周外侧贴近时，捕捉到圆心→鼠标方向与圆周交点。
     取 30° 方向、半径外 0.3 的查询点 (40+5.3cos30°, 10+5.3sin30°)，
     切点应为 (40+5cos30°, 10+5sin30°)，距查询点恰为 0.3 */
  const tAng=30*Math.PI/180;
  const tangentPoint=[40+5*Math.cos(tAng),10+5*Math.sin(tAng)];
  const nearOutside=[40+5.3*Math.cos(tAng),10+5.3*Math.sin(tAng)];
  const hitT=api.findOsnap(st,nearOutside,0.6);
  ok('切点-贴近圆周命中 tangent', hitT&&hitT.type==='tangent');
  approx('切点-径向圆周点 X', hitT&&hitT.p[0], tangentPoint[0], 1e-9);
  approx('切点-径向圆周点 Y', hitT&&hitT.p[1], tangentPoint[1], 1e-9);
  approx('切点-在圆周上', hitT&&Math.hypot(hitT.p[0]-40,hitT.p[1]-10), 5, 1e-9);
  /* 切线方向（圆在该点的切线⊥半径）：切点与圆心连线斜率已知，切线点积为 0 */
  approx('切点-半径⊥切线方向', hitT&&((hitT.p[0]-40)*(-Math.sin(tAng))+(hitT.p[1]-10)*Math.cos(tAng)), 0, 1e-9);
  /* 圆内靠近中心的点不产生切点（径向圆上点距离≈r，超出小容差） */
  const st3=api.createInitialState();
  st3.objects.push(circ);
  const none=api.findOsnap(st3,[40,11],0.5);
  ok('切点-圆心附近无切点', !none||none.type!=='tangent');

  /* 边收集：每条开放折线 1 边，两条共 2；圆不产生采样边（由切点/圆心/象限覆盖） */
  eq('边-两条折线共2边', api.collectSnapEdges(st).filter(e=>hLine.id===e.id||vLine.id===e.id).length, 2);
  eq('边-圆不产生采样边', api.collectSnapEdges(st).filter(e=>e.id===circ.id).length, 0);
  eq('边-矩形4直边', (function(){
    const s=api.createInitialState();
    s.objects.push(api.baseObject('rect','rect.area',{x:0,y:0,width:10,height:10}));
    return api.collectSnapEdges(s).length;
  })(), 4);
  eq('边-圆曲线收集1个', api.collectSnapCircles(st).length, 1);
}

/* 26. 测距链(ruler)：可编辑性、节点操作、长度/面积语义 ---------------------- */
{
  api.resetState();
  const ruler=api.baseObject('dimension','dimension.distance',{subtype:'ruler',points:[[0,0],[3,4],[3,14]],x:0,y:0});
  const distDim=api.baseObject('dimension','dimension.distance',{subtype:'distance',points:[[0,0],[6,8]]});
  const areaDim=api.baseObject('dimension','dimension.distance',{subtype:'area',points:[[0,0],[10,0],[0,10]]});
  const angleDim=api.baseObject('dimension','dimension.distance',{subtype:'angle',points:[[0,0],[10,0],[0,10]]});
  const line=api.baseObject('line','line.custom',{points:[[0,0],[1,1]]});

  /* 仅开放折线与测距链可增删拖拽节点；其余标注类型不可 */
  eq('测距-链可编辑', api.isPolylineEditable(ruler), true);
  eq('测距-折线可编辑', api.isPolylineEditable(line), true);
  eq('测距-两点距离不可编辑', api.isPolylineEditable(distDim), false);
  eq('测距-面积标注不可编辑', api.isPolylineEditable(areaDim), false);
  eq('测距-角度标注不可编辑', api.isPolylineEditable(angleDim), false);
  eq('测距-点设备不可编辑', api.isPolylineEditable({kind:'point'}), false);
  eq('测距-最小2点', api.lineMinNodes(ruler), 2);

  /* 测距链节点操作与折线完全同一套，且首点变更同步基点 */
  eq('测距-中段插入', api.insertLineNode(ruler,1,[10,10]), true);
  eq('测距-插入后4点', ruler.points.length, 4);
  eq('测距-插入后锚点不变', [ruler.x,ruler.y], [0,0]);
  eq('测距-末点不可再删(2点下限)', (function(){
    const r2=api.baseObject('dimension','dimension.distance',{subtype:'ruler',points:[[0,0],[3,4]],x:0,y:0});
    return api.removeLineNode(r2,0);
  })(), false);
  eq('测距-重排节点', api.moveNode(ruler,0,2), true);
  approx('测距-重排后锚点跟随新首点X', ruler.x, ruler.points[0][0]);
  approx('测距-重排后锚点跟随新首点Y', ruler.y, ruler.points[0][1]);

  /* 长度：3-4-5 链 = 5+10=15，开放不闭合；面积恒 0 */
  const r3=api.baseObject('dimension','dimension.distance',{subtype:'ruler',points:[[0,0],[3,4],[3,14]],x:0,y:0});
  approx('测距-总长15', api.objectLength(r3), 15, 1e-9);
  eq('测距-面积恒0', api.objectArea(r3), 0);
  /* 面积标注的面积取自其节点多边形 */
  approx('测距-面积标注=50', api.objectArea(areaDim), 50, 1e-9);
  eq('测距-两点距离无面积', api.objectArea(distDim), 0);
}

/* 27. 面积/长度统计：区域四形状、闭合折线、开放折线、点设备 ------------------- */
{
  const rect={kind:'rect',x:0,y:0,width:10,height:10,shape:null};
  const circle={kind:'rect',x:0,y:0,shape:{type:'circle',r:5}};
  const square={kind:'line',closed:true,points:[[0,0],[10,0],[10,10],[0,10]]};
  const tri={kind:'line',closed:true,points:[[0,0],[10,0],[0,10]]};
  const open={kind:'line',closed:false,points:[[0,0],[3,4],[3,14]]};
  approx('统计-矩形面积100', api.objectArea(rect), 100);
  approx('统计-圆面积25π', api.objectArea(circle), 25*Math.PI, 1e-9);
  approx('统计-闭合方形100', api.objectArea(square), 100);
  approx('统计-闭合三角50', api.objectArea(tri), 50);
  eq('统计-开放折线无面积', api.objectArea(open), 0);
  eq('统计-点设备无面积', api.objectArea({kind:'point',x:0,y:0,phys:5}), 0);
  /* 长度：开放链 15；闭合方形含闭合边 40；三角 10+10+10√2；无节点对象 0 */
  approx('统计-开放链长15', api.objectLength(open), 15, 1e-9);
  approx('统计-闭合周长40', api.objectLength(square), 40, 1e-9);
  approx('统计-三角周长', api.objectLength(tri), 20+10*Math.SQRT2, 1e-9);
  eq('统计-点设备长度0', api.objectLength({kind:'point'}), 0);
}

/* 28. 表格导入导出往返：节点坐标/闭合/形状/标注类型新列 + CSV 引号往返 -------- */
{
  /* 28.1 节点坐标编解码：负坐标、空白/分号、容错 */
  eq('节点码-编码', api.formatNodeCoords([[0,0],[3.5,-2],[10,4]]), '0.00,0.00;3.50,-2.00;10.00,4.00');
  const parsed=api.parseNodeCoords('0,0; 3.5, -2 ;10/4');
  eq('节点码-解析3点', parsed.length, 3);
  approx('节点码-负值解析', parsed[1][1], -2);
  approx('节点码-斜杠分隔', parsed[2][0], 10);
  eq('节点码-空文本', api.parseNodeCoords('').length, 0);
  eq('节点码-坏段跳过', api.parseNodeCoords('0,0;a,b;5,6').length, 2);
  eq('节点码-单点丢弃', api.parseNodeCoords('1,2;3').length, 1);
  /* CSV 中含逗号的整格被引号包裹后可无损往返 */
  const cell=api.csvCell('0,0;3,4;10,4',',');
  ok('节点码-CSV自动加引号', cell.startsWith('"')&&cell.endsWith('"'));
  const reparsed=api.parseRowsStub(['a,b',cell+',x'].join('\n'),',');
  eq('节点码-CSV引号往返字段数', reparsed[1].length, 2);
  eq('节点码-CSV引号内容保持', reparsed[1][0].trim(), '0,0;3,4;10,4');

  /* 28.2 导出行包含全部新列 */
  const st=api.resetState();
  st.objects.push(
    api.baseObject('line','line.custom',{name:'L1',closed:true,points:[[0,0],[10,0],[10,10],[0,10]],x:0,y:0}),
    api.baseObject('dimension','dimension.distance',{name:'R1',subtype:'ruler',points:[[1,1],[4,5]],x:1,y:1}),
    api.baseObject('rect','rect.area',{name:'C1',x:30,y:30,shape:{type:'circle',r:5}}),
    api.baseObject('rect','rect.area',{name:'S1',x:0,y:0,shape:{type:'sector',r:10,a0:30,a1:120}}),
    api.baseObject('point','point.marker',{name:'P1',x:1,y:2})
  );
  const rows=api.objectRows(); const byCode=Object.fromEntries(rows.map(r=>[r.编号,r]));
  eq('导出-闭合列', byCode['L1']['闭合'], '是');
  ok('导出-闭合折线节点坐标', byCode['L1']['节点坐标'].startsWith('0.00,0.00;10.00,0.00'));
  eq('导出-测距标注类型', byCode['R1']['标注类型'], '测距');
  ok('导出-测距节点坐标', byCode['R1']['节点坐标'].includes('4.00,5.00'));
  eq('导出-圆形形状列', byCode['C1']['形状'], '圆形');
  eq('导出-圆形直径列', byCode['C1']['宽度'], '10.00');
  eq('导出-扇形形状列', byCode['S1']['形状'], '扇形');
  eq('导出-扇形起止角', byCode['S1']['形状参数'], '30,120');
  eq('导出-点设备无闭合列', byCode['P1']['闭合'], '');
  eq('导出-点设备无节点坐标列', byCode['P1']['节点坐标'], '');
  ok('导出-列头含全部新列', ['形状','形状参数','闭合','标注类型','节点坐标'].every(k=>api.TABLE_COLUMNS.includes(k)));
}

/* 29. 表格规划与应用：折线/测距/形状重建、基点平移、非法行告警 -------------- */
{
  const st=api.resetState();
  const L1=api.baseObject('line','line.custom',{name:'L1',points:[[0,0],[10,0],[10,10]],x:0,y:0});
  const L2=api.baseObject('line','line.custom',{name:'L2',points:[[5,5],[15,5]],x:5,y:5});
  const D1=api.baseObject('dimension','dimension.distance',{name:'D1',subtype:'distance',points:[[0,0],[5,0]],x:0,y:0});
  st.objects.push(L1,L2,D1);
  const C=api.TABLE_COLUMNS;
  /* 台账新增的 4 列（型号/安装高度/IP/责任人）插在「图层」之后；旧用例按旧列序书写，这里自动补空位 */
  const row=m=>{ const cells=m.slice(); cells.splice(5,0,'','','',''); const o={}; cells.forEach((v,i)=>{ if(v!=='')o[C[i]]=v; }); return C.map(k=>o[k]??''); };
  const H=C.slice();
  const rL1=row(['L1','','线段/折线','','','','','','','','','','是','','0,0;20,0;20,10;0,10']);
  const rL2=row(['L2','','线段/折线','','','25','35']);                       /* 仅改基点：整体平移 */
  const rD1=row(['D1','','尺寸标注','','','','','','','','','','','测距']);  /* distance→ruler */
  const rNewRuler=row(['','','尺寸标注','','','','','','','','','','','测距','0,0;6,8;6,18']);
  const rNewLine=row(['','','线段/折线','','','','','','','','','','是','','0,0;10,0;10,10;0,10']);
  const rCircle=row(['','','矩形/区域','','','30','30','','10','','圆形']);
  const rSector=row(['','','矩形/区域','','','0','0','','20','','扇形','30,120']);
  const rEllipse=row(['','','矩形/区域','','','1','2','30','10','6','椭圆']);
  const rBadRuler=row(['','','尺寸标注','','','','','','','','','','','测距','0,0']);
  const rBadClosed=row(['','','线段/折线','','','','','','','','','','是','','0,0;10,0']);
  const rBadCircle=row(['','','矩形/区域','','','0','0','','0','','圆形']);
  const plan=api.rowsToObjectsPlan([H,rL1,rL2,rD1,rNewRuler,rNewLine,rCircle,rSector,rEllipse,rBadRuler,rBadClosed,rBadCircle]);
  eq('表格29-更新3项', plan.updates.length, 3);
  eq('表格29-新建6项（含闭合2点降级的开放折线）', plan.creates.length, 6);
  ok('表格29-测距单点告警', plan.warnings.some(w=>w.includes('尺寸标注')&&w.includes('2 点')));
  ok('表格29-闭合2点降级告警', plan.warnings.some(w=>w.includes('闭合折线至少需要 3')));
  ok('表格29-圆缺直径告警', plan.warnings.some(w=>w.includes('圆形')));
  const degraded=plan.creates.find(cr=>cr.kind==='line'&&cr.points.length===2);
  ok('表格29-闭合2点降级为开放', degraded&&degraded.closed===false);
  api.applyTableImport(plan);

  const aL1=st.objects.find(o=>o.name==='L1');
  eq('表格29-L1闭合生效', aL1.closed, true);
  eq('表格29-L1四点替换', aL1.points.length, 4);
  approx('表格29-L1周长60', api.objectLength(aL1), 60, 1e-9);
  approx('表格29-L1面积200', api.objectArea(aL1), 200, 1e-9);
  const aL2=st.objects.find(o=>o.name==='L2');
  eq('表格29-L2基点平移', [aL2.x,aL2.y,aL2.points[0][0],aL2.points[0][1],aL2.points[1][0],aL2.points[1][1]],
    [25,35,25,35,35,35]);
  const aD1=st.objects.find(o=>o.name==='D1');
  eq('表格29-D1变测距', aD1.subtype, 'ruler');
  eq('表格29-D1节点保留', aD1.points.length, 2);

  const nr=st.objects.find(o=>o.kind==='dimension'&&o.name!=='D1');
  eq('表格29-新测距3点', nr.points.length, 3);
  eq('表格29-新测距基点取首点', [nr.x,nr.y], [0,0]);
  approx('表格29-新测距总长20', api.objectLength(nr), 20, 1e-9);
  const nl=st.objects.find(o=>o.kind==='line'&&o.closed&&o.points.length===4);
  eq('表格29-新折线闭合', nl.closed, true);
  const nd=st.objects.find(o=>o.kind==='line'&&!o.closed&&o.name!=='L2');
  ok('表格29-降级折线落地为开放2点', nd&&nd.points.length===2);
  const nc=st.objects.find(o=>o.kind==='rect'&&o.shape?.type==='circle');
  eq('表格29-圆重建半径', nc.shape.r, 5);
  eq('表格29-圆基点即圆心', [nc.x,nc.y], [30,30]);
  eq('表格29-圆清空宽高', [nc.width,nc.height], [0,0]);
  const ns=st.objects.find(o=>o.shape?.type==='sector');
  eq('表格29-扇形重建', [ns.shape.r,ns.shape.a0,ns.shape.a1], [10,30,120]);
  const ne=st.objects.find(o=>o.shape?.type==='ellipse');
  eq('表格29-椭圆半轴', [ne.shape.rx,ne.shape.ry], [5,3]);
  approx('表格29-椭圆角度', ne.angle, 30, 1e-9);

  /* 29.2 旧版表头（无新列）仍可规划：折线行无法新建但不报错阻断 */
  const oldH=['编号','名称','对象类型','X','Y','宽度','高度'];
  const oldPlan=api.rowsToObjectsPlan([oldH,
    ['O100','','点设备','1','2','',''],
    ['O101','','线段/折线','0','0','','']]);
  eq('表格29-旧表头点设备可新建', oldPlan.creates.length, 1);
  ok('表格29-旧表头折线缺坐标告警', oldPlan.warnings.some(w=>w.includes('O101')&&w.includes('节点坐标')));
}

/* 30. JSON 工程往返：基点(含负值)/节点/闭合/测距子类型/形状全保留 ----------- */
{
  const m=api.migrateProject({ schema:'offline-drawing-annotation/v1',
    objects:[
      { id:'l1', kind:'line', typeId:'line.custom', name:'L1', x:-12.5, y:-8.25, closed:true,
        points:[[-12.5,-8.25],[20,-8.25],[20,30],[-12.5,30]] },
      { id:'r1', kind:'dimension', typeId:'dimension.distance', name:'R1', x:-3, y:4, subtype:'ruler',
        points:[[-3,4],[0,8],[0,0],[9,0]] },
      { id:'c1', kind:'rect', typeId:'rect.area', name:'C1', x:-50, y:-50, shape:{type:'circle',r:12} }
    ]});
  const L1=m.objects.find(o=>o.name==='L1');
  eq('JSON-闭合保留', L1.closed, true);
  eq('JSON-节点数保留', L1.points.length, 4);
  approx('JSON-负基点X', L1.x, -12.5, 1e-9);
  approx('JSON-负基点Y', L1.y, -8.25, 1e-9);
  approx('JSON-负节点坐标', L1.points[3][0], -12.5, 1e-9);
  const R1=m.objects.find(o=>o.name==='R1');
  eq('JSON-测距子类型保留', R1.subtype, 'ruler');
  eq('JSON-测距4点保留', R1.points.length, 4);
  eq('JSON-测距首点同步基点', [R1.x,R1.y], [-3,4]);
  approx('JSON-测距总长', api.objectLength(R1), 5+8+9, 1e-9);
  const C1=m.objects.find(o=>o.name==='C1');
  eq('JSON-圆形形状保留', C1.shape.type, 'circle');
  eq('JSON-圆形负圆心保留', [C1.x,C1.y,C1.shape.r], [-50,-50,12]);
}

/* 31. 导入面积/长度/节点数核对：导出回导零告警、篡改告警非阻断、取整容差、非法值 ---- */
{
  /* 31.1 全类型工程导出后原样回导：长度/面积/节点数必须零告警（含大坐标多小数的取整传播） */
  const st=api.resetState();
  st.objects.push(
    api.baseObject('line','line.custom',{name:'K1',points:[[0,0],[3,4],[3,14]],x:0,y:0}),
    api.baseObject('line','line.custom',{name:'K2',closed:true,points:[[1000.333,500.777],[1234.567,512.123],[1230.9,777.456],[990.1,760.0]],x:1000.333,y:500.777}),
    api.baseObject('dimension','dimension.distance',{name:'K3',subtype:'ruler',points:[[0,0],[6,8],[6,18]],x:0,y:0}),
    api.baseObject('dimension','dimension.distance',{name:'K4',subtype:'distance',points:[[0,0],[9,12]],x:0,y:0}),
    api.baseObject('dimension','dimension.distance',{name:'K5',subtype:'area',points:[[0,0],[10,0],[0,10]],x:0,y:0}),
    api.baseObject('rect','rect.area',{name:'K6',x:0,y:0,width:12.5,height:8.25}),
    api.baseObject('rect','rect.area',{name:'K7',x:500.1,y:500.2,shape:{type:'circle',r:33.333}}),
    api.baseObject('rect','rect.area',{name:'K8',x:0,y:0,shape:{type:'ellipse',rx:40.5,ry:12.25}}),
    api.baseObject('rect','rect.area',{name:'K9',x:0,y:0,shape:{type:'sector',r:25.5,a0:15,a1:195}}),
    api.baseObject('point','point.marker',{name:'K10',x:1,y:2}),
    api.baseObject('text',undefined,{name:'K11',x:3,y:4,text:'注'})
  );
  const cols=api.TABLE_COLUMNS;
  const dataRows=api.objectRows().map(r=>cols.map(c=>String(r[c]??'')));
  const rt=api.rowsToObjectsPlan([cols,...dataRows]);
  eq('核对-全类型导出回导零告警', rt.warnings.length, 0);
  eq('核对-回导全部走更新(11项)', rt.updates.length, 11);

  /* 31.2 直接核对函数：候选长度/面积推算 */
  {
    const o=api.baseObject('line','line.custom',{points:[[0,0],[3,4],[3,14]],x:0,y:0});
    eq('核对-空列不校验', api.checkRowGeom('行X',()=> '',o).length, 0);
    const get=n=>({'长度':'15','节点数':'3'})[n]??'';
    eq('核对-长度一致无告警', api.checkRowGeom('行X',get,o).length, 0);
  }

  /* 31.3 规划层篡改：长度/面积/节点数错误要告警但仍新建（非阻断） */
  const H=cols.slice();
  const row=m=>{ const o={}; m.forEach(([k,v])=>o[k]=v); return cols.map(k=>o[k]??''); };
  const tamperedLen=row([['对象类型','线段/折线'],['闭合','否'],['节点坐标','0,0;3,4;3,14'],['节点数','3'],['长度','99'],['面积','']]);
  const tamperedArea=row([['对象类型','矩形/区域'],['X','0'],['Y','0'],['宽度','10'],['高度','10'],['形状','矩形'],['面积','999']]);
  const tamperedN=row([['对象类型','尺寸标注'],['标注类型','测距'],['节点坐标','0,0;6,8;6,18'],['节点数','5'],['长度','20']]);
  const negLen=row([['对象类型','线段/折线'],['节点坐标','0,0;3,4'],['长度','-1']]);
  const badAreaTxt=row([['对象类型','矩形/区域'],['X','0'],['Y','0'],['宽度','2'],['高度','2'],['形状','矩形'],['面积','abc']]);
  const p2=api.rowsToObjectsPlan([H,tamperedLen,tamperedArea,tamperedN,negLen,badAreaTxt]);
  eq('核对-篡改后仍全部新建5项', p2.creates.length, 5);
  ok('核对-长度不一致告警', p2.warnings.some(w=>w.includes('长度列')&&w.includes('不一致')));
  ok('核对-面积不一致告警', p2.warnings.some(w=>w.includes('面积列')&&w.includes('999')));
  ok('核对-节点数不一致告警', p2.warnings.some(w=>w.includes('节点数列')));
  ok('核对-负长度非法告警', p2.warnings.some(w=>w.includes('长度列')&&w.includes('非法')));
  ok('核对-非数字面积非法告警', p2.warnings.some(w=>w.includes('面积列')&&w.includes('非法')));
  /* 告警文本带推算值与差值 */
  ok('核对-告警含推算值15', p2.warnings.some(w=>w.includes('15.00')));

  /* 31.4 取整容差内不告警：闭合4边周长60，容差 4*1.5*.01+.005=.065，60.01 通过 */
  const near=row([['对象类型','线段/折线'],['闭合','是'],['节点坐标','0,0;20,0;20,10;0,10'],['节点数','4'],['长度','60.01'],['面积','199.98']]);
  const p3=api.rowsToObjectsPlan([H,near]);
  eq('核对-容差内零告警', p3.warnings.filter(w=>w.includes('不一致')).length, 0);
  const far=row([['对象类型','线段/折线'],['闭合','是'],['节点坐标','0,0;20,0;20,10;0,10'],['长度','60.5']]);
  const p4=api.rowsToObjectsPlan([H,far]);
  ok('核对-超出容差告警', p4.warnings.some(w=>w.includes('长度列')));

  /* 31.5 更新行：节点坐标已改但长度列还是旧值 → 告警（防止台账与图脱节） */
  const uo=api.baseObject('line','line.custom',{name:'U1',points:[[0,0],[10,0]],x:0,y:0});
  st.objects.push(uo);
  const upd=row([['编号','U1'],['节点坐标','0,0;30,0'],['长度','10']]);
  const p5=api.rowsToObjectsPlan([H,upd]);
  eq('核对-更新1项', p5.updates.length, 1);
  ok('核对-更新行旧长度告警', p5.warnings.some(w=>w.includes('U1')&&w.includes('长度列')));
  /* 节点改成 30m 后长度列同步改为 30 → 不告警 */
  const upd2=row([['编号','U1'],['节点坐标','0,0;30,0'],['长度','30']]);
  const p6=api.rowsToObjectsPlan([H,upd2]);
  eq('核对-更新行一致零告警', p6.warnings.length, 0);

  /* 31.6 点设备填长度/面积无效列 → 告警；留空不告警 */
  const p7=api.rowsToObjectsPlan([H,
    row([['对象类型','点设备'],['X','1'],['Y','2'],['长度','5']]),
    row([['对象类型','点设备'],['X','1'],['Y','2']])]);
  eq('核对-点设备2项新建', p7.creates.length, 2);
  ok('核对-点设备长度无效告警', p7.warnings.some(w=>w.includes('长度列')&&w.includes('不一致')));
  eq('核对-点设备留空零告警', p7.warnings.length, 1);

  /* 31.7 圆形面积篡改：πr² 推算 25π≈78.54，填 100 必告警 */
  const p8=api.rowsToObjectsPlan([H,
    row([['对象类型','矩形/区域'],['X','0'],['Y','0'],['宽度','10'],['形状','圆形'],['面积','100']])]);
  ok('核对-圆形面积不一致告警', p8.warnings.some(w=>w.includes('面积列')));

  /* 31.8 旧版表头（无长度/面积列）不产生任何核对告警 */
  const oldH=['编号','名称','对象类型','X','Y','宽度','高度'];
  const p9=api.rowsToObjectsPlan([oldH,['U9','','点设备','1','2','','']]);
  eq('核对-旧表头无核对告警', p9.warnings.length, 0);
}

/* 32. 评估报告高优先缺陷回归：框选错轴 / 校准漂移 / 资产可达集合 / 捕捉粗筛 -------- */
{
  /* 5.3 boundsIntersect：报告中的两个反例（原实现 b.maxY<a.minX 错轴） */
  const A={minX:10,maxX:20,minY:0,maxY:5};
  const inside={minX:12,maxX:14,minY:1,maxY:3};
  const aside={minX:0,maxX:5,minY:100,maxY:110};
  eq('框选-内含判定相交', api.boundsIntersect(A,inside), true);
  eq('框选-X 与 Y 都分离不相交', api.boundsIntersect(A,aside), false);
  eq('框选-对角不相交(25,0)-(30,5)', api.boundsIntersect(A,{minX:25,maxX:30,minY:0,maxY:5}), false);
  eq('框选-Y 分离不相交', api.boundsIntersect(A,{minX:12,maxX:14,minY:10,maxY:12}), false);
  eq('框选-边界接触算相交', api.boundsIntersect(A,{minX:20,maxX:30,minY:0,maxY:5}), true);

  /* 5.1 校准围绕世界原点缩放：对象像素位置保持、校准两点新距离=输入值 */
  const st=api.resetState();
  st.objects.push(
    api.baseObject('point','point.marker',{x:20,y:20}),
    api.baseObject('line','line.custom',{points:[[10,10],[20,10]],x:10,y:10}),
    api.baseObject('rect','rect.area',{x:0,y:0,width:10,height:10,shape:null})
  );
  api.scaleWorldAround([0,0],2);
  const p=st.objects[0], l=st.objects[1], rc=st.objects[2];
  /* 世界坐标×2；新 mpp=0.2 时像素 = world/mpp = 原 (200,200) 不变 */
  eq('校准-点世界坐标×2', [p.x,p.y], [40,40]);
  eq('校准-折线节点×2', l.points[1], [40,20]);
  approx('校准-校准两点新距离=20', api.polylineLength(l.points), 20);
  eq('校准-矩形宽高×2', [rc.width,rc.height], [20,20]);
  /* 圆形/椭圆区域半径、圆心也围绕原点同比 */
  api.resetState();
  api.state.objects.push(
    api.baseObject('rect','rect.area',{x:50,y:50,shape:{type:'circle',r:5}}),
    api.baseObject('rect','rect.area',{x:0,y:0,shape:{type:'ellipse',rx:8,ry:4}})
  );
  api.scaleWorldAround([0,0],0.5);
  const cc=api.state.objects[0], ce=api.state.objects[1];
  eq('校准-圆半径同比缩放', cc.shape.r, 2.5);
  eq('校准-圆心同比缩放', [cc.x,cc.y], [25,25]);
  eq('校准-椭圆半轴同比', [ce.shape.rx,ce.shape.ry], [4,2]);

  /* 5.2 底图资产可达集合：当前 + past + future 任一引用都不得回收 */
  api.resetState();
  api.history.past.length=0; api.history.future.length=0;
  api.state.background.assetId='CUR';
  api.history.past.push({background:{assetId:'A'}},{background:{assetId:'B'}},{background:{}});
  api.history.future.push({background:{assetId:'C'}});
  const reach=new Set(api.reachableBgAssetIds());
  eq('资产-可达集合数量4', reach.size, 4);
  ok('资产-含当前', reach.has('CUR'));
  ok('资产-含历史A/B', reach.has('A')&&reach.has('B'));
  ok('资产-含重做C', reach.has('C'));
  /* 栈清空后只剩当前（新建/导入新工程场景） */
  api.history.past.length=0; api.history.future.length=0;
  eq('资产-无栈时仅当前', api.reachableBgAssetIds(), ['CUR']);
  api.state.background.assetId='';
  eq('资产-无引用空集合', api.reachableBgAssetIds().length, 0);
}

/* 33. 捕捉包围盒粗筛：500 个远处矩形不影响 tol 内交点/垂足命中（性能优化不改变结果） --- */
{
  const st=api.createInitialState();
  /* 远处铺满 500 个矩形（2000 条边），距鼠标邻域极远 */
  for(let i=0;i<500;i++){
    const x=1000+(i%25)*60, y=1000+Math.floor(i/25)*60;
    st.objects.push(api.baseObject('rect','rect.area',{x,y,width:40,height:40}));
  }
  /* 近处两条跨对象相交线：y=10 与 x=15 */
  st.objects.push(
    api.baseObject('line','line.custom',{points:[[0,10],[40,10]],x:0,y:10}),
    api.baseObject('line','line.custom',{points:[[15,0],[15,40]],x:15,y:0})
  );
  const edges=api.collectSnapEdges(st);
  eq('性能-500矩形共2002边', edges.length, 2002);
  const hitI=api.findOsnap(st,[15.12,10.12],0.3);
  ok('性能-粗筛后交点仍命中', hitI&&hitI.type==='intersection'&&hitI.p[0]===15&&hitI.p[1]===10);
  const hitP=api.findOsnap(st,[25,14],5);
  ok('性能-粗筛后垂足仍命中', hitP&&hitP.type==='perpendicular'&&hitP.p[0]===25&&hitP.p[1]===10);
  /* 鼠标在远处矩形群中：邻域粗筛不丢边/中点（竖边中点 (1040,1020) 距 0.14，优先于垂足） */
  const hitFar=api.findOsnap(st,[1040.1,1020.1],0.3);
  ok('性能-远处矩形邻域不被漏筛', hitFar&&['midpoint','perpendicular'].includes(hitFar.type)&&Math.abs(hitFar.p[0]-1040)<1e-9);
  /* 空旷处无命中（粗筛不误造候选） */
  eq('性能-空旷处无命中', api.findOsnap(st,[500,500],0.3), null);
}

/* 34. SVG 导出与画布语义一致：扇形弧/闭合边/面积角度文字/设备图标 ------------- */
{
  /* 扇形场地 a0=30,a1=120：圆弧两端点必须不同（原 a0||0+sweep 优先级 bug 会退化为同点） */
  const st=api.resetState();
  st.background={kind:'sector',fileName:'',assetId:'',width:0,height:0,origin:[0,0],metersPerPixel:1,calibrated:false,
    shape:{type:'sector',cx:0,cy:0,r:20,a0:30,a1:120}};
  st.objects.push(
    api.baseObject('line','line.custom',{name:'BOX',closed:true,points:[[0,0],[10,0],[10,10],[0,10]],x:0,y:0}),
    api.baseObject('dimension','dimension.distance',{name:'AR',subtype:'area',points:[[30,0],[40,0],[30,10]],x:30,y:0}),
    api.baseObject('dimension','dimension.distance',{name:'AN',subtype:'angle',points:[[60,0],[70,0],[60,10]],x:60,y:0}),
    api.baseObject('point','point.camera',{name:'CAM',x:80,y:80}),
    api.baseObject('rect','rect.area',{name:'RC',x:90,y:90,width:8,height:6})
  );
  const svg=api.buildSceneSvg();
  /* 扇形路径：L 终点(弧起始角端) 与 arc 终点必须不同（原 a0||0+sweep 优先级 bug 会退化为同点） */
  const sectorPath=svg.match(/<path d="M[\d.\- ,eLA]+Z" fill="#eef2f7"[^>]*>/);
  ok('SVG-扇形路径存在', !!sectorPath);
  const lEnd=(sectorPath?.[0]||'').match(/L(-?[\d.]+),(-?[\d.]+) A/);
  const aEnd=(sectorPath?.[0]||'').match(/1 (-?[\d.]+),(-?[\d.]+) Z"/);
  ok('SVG-扇形弧两端坐标均解析', !!(lEnd&&aEnd));
  ok('SVG-30°扇形弧两端不同', lEnd&&aEnd&&(Math.abs(+lEnd[1]-+aEnd[1])>1||Math.abs(+lEnd[2]-+aEnd[2])>1));
  /* 闭合折线：polyline 坐标点数量 = 节点数+1（首点回补，闭合边有描边） */
  const closedLine=svg.match(/<polyline points="([^"]+)"[^>]*>/g)?.find(s=>s.includes('fill="#'));
  const closedPts=closedLine?.match(/([-\d.]+),([-\d.]+)/g)||[];
  eq('SVG-闭合折线补回首点(5点串)', closedPts.length, 5);
  ok('SVG-面积标注文字', svg.includes('面积')&&svg.includes('周长'));
  ok('SVG-90°角度数值文字', svg.includes('90.00°'));
  /* 摄像头专有图标：机身+支架三角路径，不再是统一圆点 */
  ok('SVG-摄像头支架三角', svg.includes('L16,-5 L16,5'));
  ok('SVG-区域面积标签', svg.includes('㎡'));
  /* 球机图标分支 */
  st.objects.push(api.baseObject('point','point.dome',{name:'DOME',x:70,y:70}));
  ok('SVG-球机半圆图标', api.buildSceneSvg().includes('A8,8 0 0 1 8,0'));
  /* 逐对象「编号」开关：关闭后 SVG 不再输出该对象的名称标签（与画布所见一致） */
  const rcObj=st.objects.find(o=>o.name==='RC');
  api.setAnnot(rcObj,'name',false);
  ok('SVG-关闭编号后区域标签消失', !api.buildSceneSvg().includes('>RC<'));
  api.setAnnot(rcObj,'name',true);
  ok('SVG-编号开启时区域标签存在', api.buildSceneSvg().includes('>RC<'));
  const camObj=st.objects.find(o=>o.name==='CAM');
  api.setAnnot(camObj,'name',false);
  ok('SVG-关闭编号后点设备标签消失', !api.buildSceneSvg().includes('>CAM<'));
  /* 折线编号：开放与闭合折线都应输出（修复闭合折线不显示编号的缺陷） */
  const lnOpen=api.baseObject('line','line.custom',{name:'LOPEN',x:10,y:10,points:[[10,10],[30,10]]});
  const lnClosed=api.baseObject('line','line.custom',{name:'LCLOSED',x:40,y:40,points:[[40,40],[60,40],[60,60]],closed:true});
  st.objects.push(lnOpen,lnClosed);
  ok('SVG-开放折线输出编号', api.buildSceneSvg().includes('>LOPEN<'));
  ok('SVG-闭合折线输出编号', api.buildSceneSvg().includes('>LCLOSED<'));
  api.setAnnot(lnClosed,'name',false);
  ok('SVG-关闭编号后闭合折线标签消失', !api.buildSceneSvg().includes('>LCLOSED<'));
  ok('SVG-同组开放折线编号不受影响', api.buildSceneSvg().includes('>LOPEN<'));
}

/* 35. DXF 解析/生成往返 + 多页 PDF 结构 --------------------------------------- */
{
  /* 35.1 生成一段含 7 类实体的 R12 DXF 再解析回来 */
  const ents=[
    {type:'LWPOLYLINE',layer:'围墙',color:'#334155',points:[[0,0],[10,0],[10,10],[0,10]],closed:true},
    {type:'LINE',layer:'0',color:'#2563eb',points:[[1,1],[5,6]]},
    {type:'CIRCLE',layer:'设备',color:'#dc2626',x:20,y:20,r:5},
    {type:'POINT',layer:'设备',color:'#16a34a',x:30,y:30},
    {type:'TEXT',layer:'0',color:'#111111',x:0,y:15,text:'O0001 camera-01',height:.8}
  ];
  const dxf=api.Dxf.buildDxf(ents,[{name:'围墙',color:'#334155'},{name:'设备',color:'#dc2626'}]);
  ok('DXF-头AC1009', dxf.includes('$ACADVER')&&dxf.includes('AC1009'));
  ok('DXF-单位毫米INSUNITS=4', dxf.includes('$INSUNITS')&&dxf.includes('\r\n70\r\n4\r\n'));
  ok('DXF-含EOF', dxf.endsWith('EOF\r\n')||dxf.trimEnd().endsWith('EOF'));
  ok('DXF-图层表含围墙', dxf.includes('\r\n围墙\r\n'));
  const back=api.Dxf.parseDxf(dxf);
  eq('DXF-往返实体数5', back.entities.length, 5);
  const poly=back.entities.find(e=>e.type==='LWPOLYLINE'&&e.layer==='围墙');
  eq('DXF-闭合多段线4点', poly.points.length, 4);
  eq('DXF-闭合标志', poly.closed, true);
  /* 生成时米→毫米 ×1000，解析 INSUNITS=4 时毫米→米 /1000，回到原值 */
  approx('DXF-坐标往返0点', poly.points[0][0], 0, 1e-6);
  approx('DXF-坐标往返10m', poly.points[1][0], 10, 1e-6);
  /* LINE 在解析器中统一落地为开放 2 点 LWPOLYLINE（与 ARC/ELLIPSE 一致，方便同一套编辑） */
  const line=back.entities.find(e=>e.type==='LWPOLYLINE'&&!e.closed&&e.points.length===2);
  approx('DXF-LINE终点', line.points[1][0], 5, 1e-6);
  const circle=back.entities.find(e=>e.type==='CIRCLE');
  approx('DXF-圆半径5m', circle.r, 5, 1e-6);
  approx('DXF-圆心20m', circle.x, 20, 1e-6);
  const txt=back.entities.find(e=>e.type==='TEXT');
  eq('DXF-文本往返', txt.text, 'O0001 camera-01');
  approx('DXF-字高往返', txt.height, .8, 1e-6);
  const pt=back.entities.find(e=>e.type==='POINT');
  approx('DXF-点坐标', pt.y, 30, 1e-6);

  /* 35.2 解析外部常见形态：POLYLINE+VERTEX、$INSUNITS=1（英寸→米）、CRLF、多余段 */
  const sample=[
    '0','SECTION','2','HEADER','9','$INSUNITS','70','1','0','ENDSEC',
    '0','SECTION','2','ENTITIES',
    '0','POLYLINE','8','PIPE','70','1',
    '0','VERTEX','8','PIPE','10','0.0','20','0.0',
    '0','VERTEX','8','PIPE','10','39.370079','20','0.0',
    '0','SEQEND',
    '0','ENDSEC','0','EOF'
  ].join('\r\n');
  const imp=api.Dxf.parseDxf(sample);
  eq('DXF-英寸系数', Math.abs(imp.unit-0.0254)<1e-12, true);
  eq('DXF-POLYLINE解析1条', imp.entities.length, 1);
  const pl=imp.entities[0];
  eq('DXF-VERTEX累积2点', pl.points.length, 2);
  approx('DXF-39.37英寸≈1m', pl.points[1][0], 1, 1e-4);
  /* 仅 2 个顶点的闭合多段线是退化图形，降级为开放线（首尾边为零长度） */
  eq('DXF-2点闭合降级开放', pl.closed, false);

  /* 35.3 图层名清洗与颜色索引 */
  eq('DXF-非法图层名清洗', api.Dxf.safeLayer('a/b:c*'), 'a_b_c_');
  eq('DXF-红色ACI=1', api.Dxf.nearestAci('#ff0000'), 1);
  eq('DXF-绿色ACI=3', api.Dxf.nearestAci('#00ff00'), 3);

  /* 35.4 多页 PDF：xref/页对象/图片流结构正确 */
  const pdf=api.Pdf.buildImagePdf([
    {width:100,height:80,b64:''/*空JPEG仅验结构*/},
    {width:100,height:80,b64:''}
  ]);
  const head=String.fromCharCode(...pdf.slice(0,5));
  eq('PDF-魔数%PDF-', head, '%PDF-');
  const tail=String.fromCharCode(...pdf.slice(-5));
  eq('PDF-尾%%EOF', tail, '%%EOF');
  const all=String.fromCharCode(...pdf);
  eq('PDF-页数Count=2', /\/Count 2/.test(all), true);
  eq('PDF-两个DCT图片', (all.match(/\/Filter \/DCTDecode/g)||[]).length, 2);
  ok('PDF-两个页面对象', (all.match(/\/Type \/Page /g)||[]).length===2);
  ok('PDF-含startxref', all.includes('startxref'));
  /* xref 表每对象一行 10 位偏移 */
  ok('PDF-xref段存在', /xref\n0 \d+\n0000000000 65535 f /.test(all));
  /* 空页面列表抛错 */
  let threw=false; try{ api.Pdf.buildImagePdf([]); }catch(e){ threw=true; }
  eq('PDF-空页面拒绝', threw, true);
}

/* 36. DXF 高级实体：凸度弧 / ELLIPSE / SPLINE / INSERT 块 / MTEXT ---------------- */
{
  const P=(c,v)=>c+'\n'+v+'\n';
  let s=P(0,'SECTION')+P(2,'HEADER')+P(9,'$INSUNITS')+P(70,0)+P(0,'ENDSEC');
  s+=P(0,'SECTION')+P(2,'BLOCKS');
  s+=P(0,'BLOCK')+P(8,'0')+P(2,'MK')+P(70,0)+P(10,0)+P(20,0)+P(30,0)+P(3,'MK');
  s+=P(0,'CIRCLE')+P(8,'0')+P(10,0)+P(20,0)+P(30,0)+P(40,2);
  s+=P(0,'LINE')+P(8,'PIPE')+P(10,0)+P(20,0)+P(30,0)+P(11,10)+P(21,0)+P(31,0);
  s+=P(0,'ENDBLK')+P(8,'0')+P(0,'ENDSEC');
  s+=P(0,'SECTION')+P(2,'ENTITIES');
  /* 凸度半圆：(0,0)→(10,0) b=1；AutoCAD 约定正凸度逆时针，+X 弦弧经过 (5,-5) */
  s+=P(0,'LWPOLYLINE')+P(8,'0')+P(90,2)+P(70,0)+P(10,0)+P(20,0)+P(42,1)+P(10,10)+P(20,0)+P(42,0);
  /* 圆角矩形闭合：10×10 方形、R=2，8 个相切点；4 条直边凸度 0，4 个内角弧凸度 -tan(22.5°) */
  const bb=(-Math.tan(Math.PI/8)).toFixed(10), z='0';
  const rv=(x,y,b)=>P(10,x)+P(20,y)+P(42,b);
  s+=P(0,'LWPOLYLINE')+P(8,'0')+P(90,8)+P(70,1)
    +rv(2,0,z)+rv(8,0,bb)+rv(10,2,z)+rv(10,8,bb)+rv(8,10,z)+rv(2,10,bb)+rv(0,8,z)+rv(0,2,bb);
  /* 椭圆：中心(20,20)，长轴 (10,0)，ratio .5，完整 */
  s+=P(0,'ELLIPSE')+P(8,'0')+P(10,20)+P(20,20)+P(30,0)+P(11,10)+P(21,0)+P(31,0)+P(40,.5)+P(41,0)+P(42,6.283185307179586);
  /* 椭圆弧：90°~270°（左半椭圆） */
  s+=P(0,'ELLIPSE')+P(8,'0')+P(10,60)+P(20,20)+P(30,0)+P(11,5)+P(21,0)+P(31,0)+P(40,1)+P(41,Math.PI/2)+P(42,3*Math.PI/2);
  /* 二次 B 样条：3 控制点，首末必通过 */
  s+=P(0,'SPLINE')+P(8,'0')+P(70,8)+P(71,2)+P(74,0)+P(73,3)+P(75,0)
    +P(10,40)+P(20,0)+P(10,50)+P(20,10)+P(10,60)+P(20,0);
  /* INSERT：块 MK（layer0 圆+PIPE 线）放到(100,100) 缩放2 */
  s+=P(0,'INSERT')+P(8,'TOP')+P(2,'MK')+P(10,100)+P(20,100)+P(30,0)+P(41,2)+P(42,2)+P(50,0);
  /* MTEXT 格式清洗 */
  s+=P(0,'MTEXT')+P(8,'0')+P(10,0)+P(20,30)+P(30,0)+P(40,2.5)+P(1,'{\\fArial;Hello}\\PWorld');
  s+=P(0,'ENDSEC')+P(0,'EOF');
  const r=api.Dxf.parseDxf(s);
  eq('高级-块定义被识别', r.blockCount, 1);
  const polylines=r.entities.filter(e=>e.type==='LWPOLYLINE');
  /* 凸度半圆：采样点密集，首(0,0) 末(10,0)，弧顶≈(5,-5) */
  const semi=polylines.find(p=>!p.closed&&p.points.length>2&&p.points[0][0]===0&&p.points.at(-1)[0]===10);
  ok('高级-半圆采样>10点', semi.points.length>10);
  const apex=semi.points.reduce((m,p)=>p[1]<m[1]?p:m,semi.points[0]);
  approx('高级-凸度弧顶(5,-5)x', apex[0], 5, 1e-6);
  approx('高级-凸度弧顶(5,-5)y', apex[1], -5, 1e-6);
  eq('高级-半圆首尾精确', Math.abs(semi.points.at(-1)[0]-10)<1e-9&&semi.points.at(-1)[1]===0, true);
  /* 圆角矩形：闭合、4 个角点保留且边中点在原 10×10 包络附近 */
  const rounded=polylines.find(p=>p.closed);
  ok('高级-圆角矩形闭合', rounded.closed);
  const rx=rounded.points.map(p=>p[0]), ry=rounded.points.map(p=>p[1]);
  approx('高级-圆角矩形包络x0', Math.min(...rx), 0, 1e-6);
  approx('高级-圆角矩形包络x10', Math.max(...rx), 10, 1e-6);
  approx('高级-圆角矩形包络y10', Math.max(...ry), 10, 1e-6);
  /* 圆角把尖角(10,0)切掉：所有点在包络内且不存在尖角顶点 */
  ok('高级-圆角不越界', rounded.points.every(q=>q[0]>=-1e-9&&q[0]<=10+1e-9&&q[1]>=-1e-9&&q[1]<=10+1e-9));
  ok('高级-角弧切点光滑(无10,0尖角)', !rounded.points.some(q=>Math.abs(q[0]-10)<1e-6&&Math.abs(q[1])<1e-6));
  /* 完整椭圆：x[10,30] y[15,25] 闭合 */
  const fullEll=polylines.find(p=>p.closed&&p.points.some(q=>q[0]>15&&q[0]<25));
  approx('高级-椭圆x左界', Math.min(...fullEll.points.map(q=>q[0])), 10, 1e-6);
  approx('高级-椭圆x右界', Math.max(...fullEll.points.map(q=>q[0])), 30, 1e-6);
  approx('高级-椭圆短轴半高', Math.max(...fullEll.points.map(q=>q[1]))-20, 5, 1e-6);
  /* 椭圆弧不闭合，起止点在 (60,20) 两端（左半圆上下端） */
  const arcEll=polylines.find(p=>!p.closed&&p.points.length>2&&p.points[0][0]===60);
  eq('高级-椭圆弧开放', arcEll.closed, false);
  approx('高级-椭圆弧端点x=60', arcEll.points.at(-1)[0], 60, 1e-6);
  ok('高级-椭圆弧全部在左半(x≤60)', arcEll.points.every(q=>q[0]<=60+1e-9));
  /* 样条首末通过控制点 */
  const sp=polylines.find(p=>!p.closed&&p.points[0][0]===40);
  approx('高级-样条起点', sp.points[0][0], 40, 1e-9);
  approx('高级-样条终点', sp.points.at(-1)[0], 60, 1e-9);
  approx('高级-二次样条中点(50,5)', sp.points[Math.floor(sp.points.length/2)][1], 5, 1e-6);
  /* INSERT 展开：layer0 圆继承 TOP、r=4 中心(100,100)；PIPE 线保持图层、终点(120,100) */
  const ic=r.entities.find(e=>e.type==='CIRCLE');
  eq('高级-INSERT圆继承图层', ic.layer, 'TOP');
  approx('高级-INSERT圆中心', ic.x, 100, 1e-9);
  approx('高级-INSERT圆缩放r=4', ic.r, 4, 1e-9);
  const il=polylines.find(p=>p.layer==='PIPE');
  approx('高级-INSERT线终点', il.points[1][0], 120, 1e-9);
  /* MTEXT */
  const mt=r.entities.find(e=>e.type==='TEXT'&&e.text.includes('Hello'));
  eq('高级-MTEXT清洗', mt.text, 'Hello World');
  approx('高级-MTEXT字高', mt.height, 2.5, 1e-9);
}

/* 37. PDF 读取器：矢量路径/文本（未压缩流）+ Flate 栅格重组 PNG + DCT JPEG ------ */
asyncSuites.push((async()=>{
  const toLatin=bytes=>{ let s=''; for(let i=0;i<bytes.length;i++) s+=String.fromCharCode(bytes[i]); return s; };
  /* 内容流：描边矩形、直线、填充矩形 + 一段标准字体文本 */
  const content='1 0 0 1 0 0 cm\n10 10 100 50 re S\n50 50 m 150 60 l S\n20 20 30 30 re f\nBT /F1 12 Tf 50 80 Td (Hello World) Tj ET\n';
  /* 2×1 RGB 原始像素 → Flate（/Predictor 1），验证解压后重组 PNG */
  const rgb=new Uint8Array([255,0,0, 0,255,0]);
  const z=deflateSync(rgb);
  const obj=(n,body)=>n+' 0 obj\n'+body+'\nendobj\n';
  let pdf='%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n';
  pdf+=obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  pdf+=obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  pdf+=obj(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R >>');
  pdf+=obj(4,'<< /Length '+content.length+' >>\nstream\n'+content+'endstream');
  pdf+=obj(5,'<< /Type /XObject /Subtype /Image /Width 2 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 '+
        '/Filter /FlateDecode /DecodeParms << /Predictor 1 /Columns 2 /Colors 3 >> /Length '+z.length+' >>\nstream\n'+toLatin(z)+'endstream');
  pdf+=obj(6,'<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length 4 >>\nstream\n'+toLatin(new Uint8Array([0xFF,0xD8,0xFF,0xE0]))+'endstream');
  const r=await api.PdfRead.parsePdf(pdf);
  approx('PDF-页宽200点', r.pageWidth, 200, 1e-9);
  approx('PDF-页高100点', r.pageHeight, 100, 1e-9);
  eq('PDF-路径3条', r.paths.length, 3);
  const rect=r.paths.find(p=>p.closed&&!p.filled);
  const fill=r.paths.find(p=>p.filled);
  const line=r.paths.find(p=>!p.closed);
  eq('PDF-矩形闭合4点', rect.points.length, 4);
  approx('PDF-矩形角点(110,60)', rect.points[2][0], 110, 1e-9);
  eq('PDF-直线开放2点', line.points.length, 2);
  approx('PDF-直线终点', line.points[1][0], 150, 1e-9);
  eq('PDF-填充矩形识别', fill.closed, true);
  eq('PDF-文本1段', r.texts.length, 1);
  eq('PDF-文本内容', r.texts[0].text, 'Hello World');
  approx('PDF-文本定位(50,80)', r.texts[0].x, 50, 1e-9);
  approx('PDF-字号12点', r.texts[0].size, 12, 1e-9);
  eq('PDF-内嵌图2张', r.images.length, 2);
  /* 最大者为 2×1 的 Flate 图，已重组为 PNG */
  const png=r.images[0];
  eq('PDF-Flate图选最大', png.width*png.height, 2);
  eq('PDF-PNG魔数', png.bytes[0]===0x89&&png.bytes[1]===0x50&&png.bytes[2]===0x4e&&png.bytes[3]===0x47, true);
  /* IHDR：宽在偏移16、高在偏移20（大端） */
  const dv=new DataView(png.bytes.buffer,png.bytes.byteOffset,png.bytes.byteLength);
  eq('PDF-PNG宽2', dv.getUint32(16), 2);
  eq('PDF-PNG高1', dv.getUint32(20), 1);
  /* 像素保真：重组后 IDAT 前的扫描行 filter=0 + 原 6 像素字节（取首个 IDAT 之外不便定位，验证长度=2行*(1+6)） */
  ok('PDF-PNG含像素字节', png.bytes.length>14+14);
  /* 次大图为 DCT JPEG */
  const jpg=r.images[1];
  eq('PDF-JPEG魔数', jpg.bytes[0]===0xFF&&jpg.bytes[1]===0xD8, true);
  eq('PDF-JPEG类型', jpg.mime, 'image/jpeg');
  /* 空/坏 PDF */
  let threw=0;
  try{ await api.PdfRead.parsePdf('not a pdf at all'); }catch(e){ threw++; }
  eq('PDF-坏文件拒绝', threw, 1);
  /* CID 乱码文本过滤 */
  eq('PDF-CID乱码丢弃', api.PdfRead.looksLikeCidGarbage('\u0001\u0002\u0003'), true);
  eq('PDF-拉丁文本保留', api.PdfRead.looksLikeCidGarbage('Building A-101'), false);
})());

/* 38. 视场覆盖率分析：扇形/圆形覆盖判定 + 栅格覆盖率与盲区 ------------------- */
{
  api.resetState();
  /* 20×20 区域（面积400），先不放点设备 → 全盲 */
  api.state.objects.push(api.baseObject('rect','rect.area',{name:'P1',x:0,y:0,width:20,height:20}));
  let r=api.analyzeCoverage(api.state);
  eq('覆盖-区域数1', r.regions.length, 1);
  eq('覆盖-无设备相机数0', r.cameraCount, 0);
  approx('覆盖-无设备覆盖率0', r.ratio, 0, 1e-9);
  approx('覆盖-无设备盲区=总面积', r.totalBlind, 400, 1e-6);

  /* 球机（圆形覆盖）phys=1000→半径500，完全覆盖 */
  api.state.objects.push(api.baseObject('point','point.dome',{name:'D1',x:10,y:10,phys:1000}));
  r=api.analyzeCoverage(api.state);
  eq('覆盖-球机计数1', r.cameraCount, 1);
  approx('覆盖-全圆覆盖率≈1', r.ratio, 1, 1e-6);
  approx('覆盖-全圆盲区≈0', r.totalBlind, 0, 1e-3);

  /* 换成摄像头（扇形90°，0°朝 +X）：仅右半锥覆盖，覆盖率≈0.25 */
  api.state.objects[1]=api.baseObject('point','point.camera',{name:'C1',x:10,y:10,phys:1000,angle:0});
  r=api.analyzeCoverage(api.state);
  eq('覆盖-扇形计数1', r.cameraCount, 1);
  ok('覆盖-扇形部分覆盖(0<ratio<1)', r.ratio>0.15&&r.ratio<0.45);
  ok('覆盖-扇形盲区>0', r.totalBlind>0);

  /* footprint 判定单测：0°=+X，半径=phys（扇形）/ phys/2（圆） */
  const cam=api.cameraFootprint(api.baseObject('point','point.camera',{x:0,y:0,phys:10,angle:0}));
  eq('覆盖-footprint扇形类型', cam.kind, 'sector');
  eq('覆盖-扇形半径=phys', cam.r, 10);
  eq('覆盖-锥内点命中', api.pointInFootprint([5,0],cam), true);
  eq('覆盖-反方向点不命中', api.pointInFootprint([-5,0],cam), false);
  eq('覆盖-超半径点不命中', api.pointInFootprint([20,0],cam), false);
  const dome=api.cameraFootprint(api.baseObject('point','point.dome',{x:0,y:0,phys:10}));
  eq('覆盖-circle半径=phys/2', dome.r, 5);
  eq('覆盖-圆内点命中', api.pointInFootprint([4,0],dome), true);
  /* fov=360 扇形退化为整圆，不再受朝向限制 */
  const ctype=api.state.objectTypes.find(t=>t.id==='point.camera');
  const oldFov=ctype.fov; ctype.fov=360;
  const cam360=api.cameraFootprint(api.baseObject('point','point.camera',{x:0,y:0,phys:10,angle:0}));
  eq('覆盖-360视场=圆', cam360.kind, 'circle');
  eq('覆盖-360背后点也命中', api.pointInFootprint([-5,0],cam360), true);
  ctype.fov=oldFov;
  /* 纯位置图标点（phys=0）不计入覆盖 */
  eq('覆盖-图标点无footprint', api.cameraFootprint(api.baseObject('point','point.marker',{x:0,y:0,phys:0})), null);

  /* 统计区域来源：闭合折线计入，开放折线不计入 */
  api.resetState();
  api.state.objects.push(
    api.baseObject('line','line.custom',{name:'Z1',closed:true,points:[[0,0],[10,0],[10,10],[0,10]],x:0,y:0}),
    api.baseObject('line','line.custom',{name:'Z2',closed:false,points:[[0,0],[10,0]],x:0,y:0}),
    api.baseObject('point','point.marker',{x:1,y:1,phys:0})
  );
  const rg=api.regionPolygons(api.state);
  eq('覆盖-仅闭合折线计入', rg.length, 1);
  eq('覆盖-闭合折线名', rg[0].name, 'Z1');
  eq('覆盖-图标点计入忽略数', api.analyzeCoverage(api.state).ignoredPoints, 1);
  eq('覆盖-多边形包围盒', (()=>{const bb=api.polygonBBox(rg[0].points);return [bb.minX,bb.minY,bb.maxX,bb.maxY];})(), [0,0,10,10]);
}

/* 39. 仿射校准：像素↔世界映射 / 相似与完整仿射求解 / 旧对象随映射迁移 ---------- */
{
  /* 39.1 缺省（轴对齐）映射与往返：像素 v 向下、世界 y 向上 */
  const bg={kind:'image',width:100,height:10,metersPerPixel:0.1,transform:null};
  approx('仿射-缺省a项=mpp', api.defaultImageTransform(bg).a, 0.1, 1e-12);
  approx('仿射-缺省e项=-mpp', api.defaultImageTransform(bg).e, -0.1, 1e-12);
  approx('仿射-缺省f项=高×mpp', api.defaultImageTransform(bg).f, 1, 1e-12);
  eq('仿射-像素(30,4)→世界', api.bgPixelToWorld(bg,[30,4]), [3,0.6]);
  eq('仿射-世界(3,0.6)→像素', api.bgWorldToPixel(bg,[3,0.6]), [30,4]);
  eq('仿射-四角世界坐标', api.imageCornerWorld(bg), [[0,1],[10,1],[10,0],[0,0]]);

  /* 39.2 2 点求相似（纯放大 2×、无旋转）：像素(0,0)(10,0) → 世界(0,0)(20,0) */
  const s2=api.solveImageAffine([{u:0,v:0,x:0,y:0},{u:10,v:0,x:20,y:0}]);
  approx('仿射-相似a=2', s2.T.a, 2, 1e-9);
  approx('仿射-相似e=-2', s2.T.e, -2, 1e-9);
  approx('仿射-相似b=0', s2.T.b, 0, 1e-9);
  approx('仿射-相似d=0', s2.T.d, 0, 1e-9);
  approx('仿射-相似缩放=2', s2.scale, 2, 1e-9);
  eq('仿射-相似标志', s2.isSimilarity, true);
  /* 2 点含 45° 旋转：像素(0,0)(1,0) → 世界(0,0)(0,1)（世界 +Y） */
  const rot=api.solveImageAffine([{u:0,v:0,x:0,y:0},{u:1,v:0,x:0,y:1}]);
  approx('仿射-45旋转scale=1', rot.scale, 1, 1e-9);
  approx('仿射-45旋转角', rot.rotationDeg, 90, 1e-9);   /* y-down 像素系中 +90° */
  /* 两点退化（重合像素）应抛错 */
  let threw=0; try{ api.solveImageAffine([{u:1,v:1,x:0,y:0},{u:1,v:1,x:5,y:5}]); }catch(e){ threw++; }
  eq('仿射-重合点拒绝', threw, 1);

  /* 39.3 3 点最小二乘完整仿射：精确还原已知系数 */
  const pairs=[
    {u:0,v:0,x:10,y:5},
    {u:100,v:0,x:210,y:-25},
    {u:0,v:100,x:60,y:155}
  ];
  const f3=api.solveImageAffine(pairs);
  approx('仿射-完整a', f3.T.a, 2, 1e-6);
  approx('仿射-完整b', f3.T.b, 0.5, 1e-6);
  approx('仿射-完整c', f3.T.c, 10, 1e-6);
  approx('仿射-完整d', f3.T.d, -0.3, 1e-6);
  approx('仿射-完整e', f3.T.e, 1.5, 1e-6);
  approx('仿射-完整f', f3.T.f, 5, 1e-6);
  eq('仿射-非相似标志', f3.isSimilarity, false);
  /* 6 系数全有限且行列式非退化的才判有效 */
  ok('仿射-有效性校验通过', !!api.validImageTransform(f3.T));
  eq('仿射-全零transform无效', api.validImageTransform({a:0,b:0,c:0,d:0,e:0,f:0}), null);
  eq('仿射-缺字段无效', api.validImageTransform({a:1,b:0}), null);

  /* 39.4 图片四角世界包围框：含负 min 的旋转+缩放 */
  const rotBg={kind:'image',width:10,height:20,transform:{a:0,b:-2,c:0,d:2,e:0,f:0}};
  const fr=api.imageWorldFrame(rotBg);
  eq('仿射-旋转框minX', fr.minX, -40);
  eq('仿射-旋转框maxY', fr.maxY, 20);
  approx('仿射-旋转框w', fr.w, 40, 1e-9);
  approx('仿射-旋转框h', fr.h, 20, 1e-9);

  /* 39.5 仿射矩阵基本运算：逆 × 原 = 单位阵；组合映射等价逐步映射 */
  const T=[2,0.5,10,-0.3,1.5,5];
  const Ti=api.affInv(T);
  const I=api.affMul(Ti,T);
  approx('仿射-逆×原≈单位a', I[0], 1, 1e-9);
  approx('仿射-逆×原≈单位e', I[4], 1, 1e-9);
  approx('仿射-逆×原≈单位c', I[2], 0, 1e-9);
  approx('仿射-逆×原≈单位f', I[5], 0, 1e-9);
  eq('仿射-单点映射', api.affApply(T,[100,0]), [210,-25]);
  eq('仿射-复合映射=逐步', api.affApply(api.affMul(T,[2,0,0,0,2,0]),[3,4]), api.affApply(T,api.affApply([2,0,0,0,2,0],[3,4])));

  /* 39.6 旧对象迁移：相似缩放（点/线/圆/矩形精确同步） */
  const objs=[
    api.baseObject('point','point.marker',{x:5,y:7,angle:0,phys:4}),
    api.baseObject('line','line.custom',{points:[[0,0],[3,4]],x:0,y:0}),
    api.baseObject('rect','rect.area',{x:5,y:7,shape:{type:'circle',r:3}}),
    api.baseObject('rect','rect.area',{x:0,y:0,width:4,height:2,angle:0,shape:null})
  ];
  api.migrateObjectsByAffine(objs,[2,0,0,0,2,0]);   /* 纯放大 2× */
  eq('迁移-点坐标×2', [objs[0].x,objs[0].y], [10,14]);
  approx('迁移-点物理尺寸×2', objs[0].phys, 8, 1e-9);
  eq('迁移-折线节点×2', objs[1].points[1], [6,8]);
  approx('迁移-圆半径×2', objs[2].shape.r, 6, 1e-9);
  eq('迁移-圆仍为圆', objs[2].shape.type, 'circle');
  approx('迁移-矩形宽×2', objs[3].width, 8, 1e-9);
  approx('迁移-矩形高×2', objs[3].height, 4, 1e-9);

  /* 39.7 一般仿射（不等比）：圆升级为椭圆，矩形按主轴伸缩 */
  const objs2=[
    api.baseObject('rect','rect.area',{x:5,y:7,shape:{type:'circle',r:3}}),
    api.baseObject('rect','rect.area',{x:0,y:0,width:4,height:2,angle:0,shape:null})
  ];
  api.migrateObjectsByAffine(objs2,[2,0,0,0,3,0]);   /* x×2, y×3 */
  eq('迁移-非等比圆→椭圆', objs2[0].shape.type, 'ellipse');
  approx('迁移-椭圆rx', objs2[0].shape.rx, 6, 1e-9);
  approx('迁移-椭圆ry', objs2[0].shape.ry, 9, 1e-9);
  approx('迁移-非等比矩形宽', objs2[1].width, 8, 1e-9);
  approx('迁移-非等比矩形高', objs2[1].height, 6, 1e-9);
}

/* 40. 矢量场地标注：边界折点 / 几何中心 / 面积周长（三开关默认值与旧档迁移） -------- */
{
  api.resetState();
  /* 缺省矩形场地（域 100×70，基点原点）：四角折点、中心均值、面积周长 */
  eq('场地标注-默认矩形折点', api.siteBoundaryPoints(api.state.background), [[0,0],[100,0],[100,70],[0,70]]);
  eq('场地标注-默认矩形中心', api.siteShapeCenter(api.state.background), [50,35]);
  { const ap=api.siteAreaPerimeter(api.state.background);
    approx('场地标注-默认矩形面积', ap.area, 7000, 1e-6);
    approx('场地标注-默认矩形周长', ap.perimeter, 340, 1e-6); }

  /* 多边形场地：顶点即折点，面积用鞋带公式、周长为闭合边长和，中心为顶点均值 */
  api.state.background={kind:'polygon',shape:{type:'polygon',points:[[0,0],[10,0],[10,10],[0,10]]}};
  eq('场地标注-多边形折点', api.siteBoundaryPoints(api.state.background), [[0,0],[10,0],[10,10],[0,10]]);
  eq('场地标注-多边形中心', api.siteShapeCenter(api.state.background), [5,5]);
  { const ap=api.siteAreaPerimeter(api.state.background);
    approx('场地标注-多边形面积', ap.area, 100, 1e-9);
    approx('场地标注-多边形周长', ap.perimeter, 40, 1e-9); }
  /* 退化多边形（两点）不构成面：无折点标注可闭合，面积 0、周长为线段长 */
  api.state.background={kind:'polygon',shape:{type:'polygon',points:[[0,0],[3,4]]}};
  { const ap=api.siteAreaPerimeter(api.state.background);
    approx('场地标注-两点多边形面积0', ap.area, 0, 1e-9);
    approx('场地标注-两点多边形周长=线段长', ap.perimeter, 5, 1e-9); }

  /* 圆形：无折点（不逐点标坐标），中心取圆心，面积 πr²、周长 2πr */
  api.state.background={kind:'circle',shape:{type:'circle',cx:0,cy:0,r:10}};
  eq('场地标注-圆形无折点', api.siteBoundaryPoints(api.state.background), null);
  eq('场地标注-圆形中心', api.siteShapeCenter(api.state.background), [0,0]);
  { const ap=api.siteAreaPerimeter(api.state.background);
    approx('场地标注-圆面积', ap.area, Math.PI*100, 1e-9);
    approx('场地标注-圆周长', ap.perimeter, Math.PI*20, 1e-9); }

  /* 扇形：无折点，中心取圆心，面积 πr²·sweep/360、周长 2r+弧长 */
  api.state.background={kind:'sector',shape:{type:'sector',cx:0,cy:0,r:10,a0:0,a1:90}};
  eq('场地标注-扇形无折点', api.siteBoundaryPoints(api.state.background), null);
  eq('场地标注-扇形中心', api.siteShapeCenter(api.state.background), [0,0]);
  { const ap=api.siteAreaPerimeter(api.state.background);
    approx('场地标注-扇形面积', ap.area, Math.PI*100/4, 1e-9);
    approx('场地标注-扇形周长', ap.perimeter, 20+10*Math.PI/2, 1e-9); }

  /* 椭圆：无折点，中心取圆心，面积 πrx·ry，周长取 Ramanujan（界于两轴圆周之间） */
  api.state.background={kind:'ellipse',shape:{type:'ellipse',cx:0,cy:0,rx:20,ry:10,angle:0}};
  eq('场地标注-椭圆无折点', api.siteBoundaryPoints(api.state.background), null);
  eq('场地标注-椭圆中心', api.siteShapeCenter(api.state.background), [0,0]);
  { const ap=api.siteAreaPerimeter(api.state.background);
    approx('场地标注-椭圆面积', ap.area, Math.PI*200, 1e-9);
    ok('场地标注-椭圆周长界于两轴周长之间', ap.perimeter>2*Math.PI*10 && ap.perimeter<2*Math.PI*20); }

  /* 三开关：新建工程默认全开；旧档缺省补齐为 true；显式 false 被保留 */
  const fresh=api.createInitialState();
  eq('场地标注-默认开关(坐标)', fresh.settings.siteNodes, true);
  eq('场地标注-默认开关(段长)', fresh.settings.siteSegLen, true);
  eq('场地标注-默认开关(面积)', fresh.settings.siteArea, true);
  { const m=api.migrateProject({});
    eq('场地标注-旧档缺省补齐(坐标)', m.settings.siteNodes, true);
    eq('场地标注-旧档缺省补齐(段长)', m.settings.siteSegLen, true);
    eq('场地标注-旧档缺省补齐(面积)', m.settings.siteArea, true); }
  { const m=api.migrateProject({settings:{siteNodes:false,siteSegLen:false,siteArea:false}});
    eq('场地标注-显式关闭保留(坐标)', m.settings.siteNodes, false);
    eq('场地标注-显式关闭保留(段长)', m.settings.siteSegLen, false);
    eq('场地标注-显式关闭保留(面积)', m.settings.siteArea, false); }
  api.resetState();
}

/* 41. 场地节点编辑：实际包围盒取景框 / pan 补偿 / 控制点拖拽改写 ------------------ */
{
  api.resetState();
  /* siteBounds：默认矩形（基点原点）与实际取景框一致 */
  eq('场地节点-默认矩形包围盒', api.siteBounds(api.state.background), {minX:0,minY:0,maxX:100,maxY:70,w:100,h:70});
  eq('场地节点-默认取景框=包围盒', api.computeWorldFrame(), {minX:0,minY:0,maxX:100,maxY:70,w:100,h:70});
  /* 偏移矩形：基点 x,y 生效，包围盒随基点平移 */
  eq('场地节点-偏移矩形包围盒', api.siteBounds({kind:'rect',shape:{type:'rect',x:-5,y:-2,w:100,h:70}}), {minX:-5,minY:-2,maxX:95,maxY:68,w:100,h:70});
  /* 负坐标多边形：包围盒取实际 min/max（不裁剪到 0） */
  eq('场地节点-负坐标多边形包围盒', api.siteBounds({kind:'polygon',shape:{type:'polygon',points:[[-10,-10],[10,-10],[10,10],[-10,10]]}}), {minX:-10,minY:-10,maxX:10,maxY:10,w:20,h:20});
  /* 偏心圆 / 旋转椭圆 / 扇形包围盒 */
  eq('场地节点-偏心圆包围盒', api.siteBounds({kind:'circle',shape:{type:'circle',cx:30,cy:20,r:10}}), {minX:20,minY:10,maxX:40,maxY:30,w:20,h:20});
  { const b=api.siteBounds({kind:'ellipse',shape:{type:'ellipse',cx:0,cy:0,rx:20,ry:10,angle:90}});
    approx('场地节点-旋转椭圆包围盒宽', b.w, 20, 1e-9);
    approx('场地节点-旋转椭圆包围盒高', b.h, 40, 1e-9); }
  { const b=api.siteBounds({kind:'sector',shape:{type:'sector',cx:0,cy:0,r:10,a0:0,a1:90}});
    approx('场地节点-扇形包围盒宽', b.w, 10, 1e-6);
    approx('场地节点-扇形包围盒高', b.h, 10, 1e-6); }

  /* syncFramePan：形状变更时按取景框差值补偿 pan，使未变内容保持屏幕位置 */
  api.resetState();
  api.state.viewport.panX=10; api.state.viewport.panY=20; api.state.viewport.zoom=2;
  api.state.background={kind:'rect',shape:{type:'rect',x:-5,y:0,w:100,h:70}};
  const nf=api.syncFramePan();
  approx('场地节点-补偿后 panX（minX −5×zoom2）', api.state.viewport.panX, 0, 1e-9);
  approx('场地节点-补偿后 panY 不变', api.state.viewport.panY, 20, 1e-9);
  eq('场地节点-取景框刷新为新包围盒', [nf.minX,nf.maxX], [-5,95]);
  eq('场地节点-worldFrame 缓存同步', [api.worldFrame().minX,api.worldFrame().maxX], [-5,95]);

  /* 控制点清单：各形状手柄数量与位置 */
  api.resetState();
  api.state.background={kind:'polygon',shape:{type:'polygon',points:[[0,0],[10,0],[10,10],[0,10]]}};
  eq('场地节点-多边形手柄数', api.siteHandleList().length, 4);
  eq('场地节点-多边形手柄0', [api.siteHandleList()[0].mode,api.siteHandleList()[0].x,api.siteHandleList()[0].y], ['vertex',0,0]);
  { const hs=api.siteHandleList({kind:'circle',shape:{type:'circle',cx:5,cy:5,r:10}});
    eq('场地节点-圆手柄数', hs.length, 2);
    eq('场地节点-圆圆心手柄', [hs[0].mode,hs[0].x,hs[0].y], ['center',5,5]);
    eq('场地节点-圆半径手柄', [hs[1].mode,hs[1].x,hs[1].y], ['radius',15,5]); }
  eq('场地节点-矩形手柄数', api.siteHandleList({kind:'rect',shape:{type:'rect',x:0,y:0,w:10,h:20}}).length, 4);
  { const hs=api.siteHandleList({kind:'ellipse',shape:{type:'ellipse',cx:0,cy:0,rx:20,ry:10,angle:0}});
    eq('场地节点-椭圆手柄数', hs.length, 4);
    eq('场地节点-椭圆模式', hs.map(h=>h.mode), ['center','rx','ry','rotate']); }
  { const hs=api.siteHandleList({kind:'sector',shape:{type:'sector',cx:0,cy:0,r:10,a0:0,a1:90}});
    eq('场地节点-扇形手柄数', hs.length, 4);
    eq('场地节点-扇形模式', hs.map(h=>h.mode), ['center','edge0','edge1','radius']); }
  eq('场地节点-图片底图无手柄', api.siteHandleList({kind:'image',shape:{}}), []);

  /* resizeSiteByHandle：按模式改写规格参数 */
  api.resetState();
  api.state.background={kind:'polygon',shape:{type:'polygon',points:[[0,0],[10,0],[10,10],[0,10]]}};
  api.resizeSiteByHandle({mode:'vertex',index:1},[20,3]);
  eq('场地节点-拖拽多边形顶点', api.state.background.shape.points[1], [20,3]);

  api.state.background={kind:'rect',shape:{type:'rect',x:0,y:0,w:10,h:20}};
  api.resizeSiteByHandle({mode:'corner',index:2},[14,30]);
  eq('场地节点-拖拽矩形角(对角固定)', [api.state.background.shape.x,api.state.background.shape.y,api.state.background.shape.w,api.state.background.shape.h], [0,0,14,30]);

  api.state.background={kind:'circle',shape:{type:'circle',cx:5,cy:5,r:10}};
  api.resizeSiteByHandle({mode:'center'},[7,8]);
  eq('场地节点-拖拽圆心(半径不变)', [api.state.background.shape.cx,api.state.background.shape.cy,api.state.background.shape.r], [7,8,10]);
  api.resizeSiteByHandle({mode:'radius'},[7,18]);
  approx('场地节点-拖拽圆半径', api.state.background.shape.r, 10, 1e-9);

  api.state.background={kind:'ellipse',shape:{type:'ellipse',cx:0,cy:0,rx:20,ry:10,angle:0}};
  api.resizeSiteByHandle({mode:'rx'},[30,0]);
  approx('场地节点-拖拽椭圆长轴', api.state.background.shape.rx, 30, 1e-9);
  api.resizeSiteByHandle({mode:'ry'},[0,4]);
  approx('场地节点-拖拽椭圆短轴', api.state.background.shape.ry, 4, 1e-9);

  api.state.background={kind:'sector',shape:{type:'sector',cx:0,cy:0,r:10,a0:0,a1:90}};
  api.resizeSiteByHandle({mode:'edge0'},[0,20]);
  approx('场地节点-拖拽扇形边0半径', api.state.background.shape.r, 20, 1e-9);
  approx('场地节点-拖拽扇形边0角度', api.state.background.shape.a0, 90, 1e-9);
  api.resizeSiteByHandle({mode:'edge1'},[-30,0]);
  approx('场地节点-拖拽扇形边1角度', api.state.background.shape.a1, 180, 1e-9);

  /* sanitizeShape：编辑后的负坐标/偏移在保存→重载后保留（不被打回原点） */
  const mp=api.migrateProject({schema:'offline-drawing-annotation/v1',background:{kind:'polygon',shape:{type:'polygon',points:[[-10,-10],[10,-10],[10,10]]}}});
  eq('场地节点-负坐标多边形重载保留', mp.background.shape.points, [[-10,-10],[10,-10],[10,10]]);
  const mrx=api.migrateProject({schema:'offline-drawing-annotation/v1',background:{kind:'rect',shape:{type:'rect',x:-5,y:-3,w:20,h:10}}});
  eq('场地节点-偏移矩形重载保留', [mrx.background.shape.x,mrx.background.shape.y,mrx.background.shape.w,mrx.background.shape.h], [-5,-3,20,10]);
  const mc=api.migrateProject({schema:'offline-drawing-annotation/v1',background:{kind:'circle',shape:{type:'circle',cx:30,cy:20,r:10}}});
  eq('场地节点-偏心圆重载保留', [mc.background.shape.cx,mc.background.shape.cy,mc.background.shape.r], [30,20,10]);
  api.resetState();
}

/* 42. 场地属性面板：未选中对象时的可编辑场地属性 / 图片底图摘要 ------------------------ */
{
  api.resetState();
  /* 矢量场地（默认模式 = 未选中对象时显示，可编辑） */
  const rectBG={kind:'rect',shape:{type:'rect',x:-5,y:-2,w:112,h:74}};
  const h1=api.sitePropsHTML(rectBG,'default');
  ok('场地属性-默认模式含标题', h1.includes('场地属性'));
  ok('场地属性-含场地类型', h1.includes('矩形场地'));
  ok('场地属性-含可编辑基点X（负坐标）', h1.includes('data-site-field="x"') && h1.includes('value="-5.00"'));
  ok('场地属性-含宽高可编辑', h1.includes('data-site-field="w"') && h1.includes('data-site-field="h"'));
  ok('场地属性-含面积周长', h1.includes('id="siteAreaVal"') && h1.includes('id="sitePerimVal"'));
  ok('场地属性-面积值', h1.includes('8288.00'));
  ok('场地属性-周长值', h1.includes('372.00'));
  ok('场地属性-未选中对象操作提示', h1.includes('单击对象可在此编辑其属性'));
  /* 工具模式（场地节点）：标题与提示切换，且不再出现未选中对象的操作提示 */
  const h2=api.sitePropsHTML(rectBG,'tool');
  ok('场地节点-工具模式标题', h2.includes('场地节点') && !h2.includes('场地属性'));
  ok('场地节点-工具模式含画布拖拽提示', h2.includes('拖拽画布上的控制点'));
  ok('场地节点-工具模式无未选中提示', !h2.includes('单击对象可在此编辑其属性'));
  /* 各矢量形状的参数入口 */
  const hc=api.sitePropsHTML({kind:'circle',shape:{type:'circle',cx:30,cy:20,r:10}},'default');
  ok('场地属性-圆形含半径与圆心', hc.includes('data-site-field="r"') && hc.includes('data-site-field="cx"') && hc.includes('314.16'));
  const hp=api.sitePropsHTML({kind:'polygon',shape:{type:'polygon',points:[[0,0],[10,0],[10,10],[0,10]]}},'default');
  ok('场地属性-多边形顶点行数', (hp.match(/data-site-node-row=/g)||[]).length===4);
  ok('场地属性-多边形含插入/删除顶点', hp.includes('data-site-node-add=') && hp.includes('data-site-node-del='));
  /* 布局回归：节点列表需跨满 form-grid 两列，顶点行需用无抓手的 7 列模板（否则输入框被压进 78px 标签列） */
  ok('场地属性-多边形列表跨满整行', hp.includes('class="node-list span2"'));
  ok('场地属性-多边形行采用顶点列模板', hp.includes('class="node-row vtx"'));
  ok('场地属性-扇形含张角', api.sitePropsHTML({kind:'sector',shape:{type:'sector',cx:0,cy:0,r:10,a0:0,a1:90}},'default').includes('data-site-field="sweep"'));
  ok('场地属性-椭圆含两半径与旋转', (()=>{ const e=api.sitePropsHTML({kind:'ellipse',shape:{type:'ellipse',cx:0,cy:0,rx:20,ry:10,angle:0}},'default'); return e.includes('data-site-field="rx"') && e.includes('data-site-field="ry"') && e.includes('data-site-field="angle"'); })());
  /* 图片底图：显示摘要 + 校准入口按钮；工具模式下给引导语 */
  const hi=api.sitePropsHTML({kind:'image',fileName:'plan.png',width:500,height:400,metersPerPixel:0.2,calibrated:true,transform:null},'default');
  ok('底图属性-图片含名称像素比例', hi.includes('plan.png') && hi.includes('500×400 px') && hi.includes('0.20 m/px'));
  ok('底图属性-图片含校准状态', hi.includes('已校准') && hi.includes('轴对齐'));
  ok('底图属性-图片含校准入口按钮', hi.includes('id="siteOpenBtn"') && hi.includes('id="siteCalibBtn"') && hi.includes('id="siteAffineBtn"'));
  ok('场地节点-图片底图给引导语', api.sitePropsHTML({kind:'image',fileName:'x.png'},'tool').includes('暂无场地节点可编辑'));
  /* 无底图 */
  const saved=api.state.background; api.state.background=null;
  ok('场地属性-无底图提示', api.sitePropsHTML(null,'default').includes('尚未设置底图/场地'));
  api.state.background=saved;
  api.resetState();
}

/* 43. 逐对象标注开关：默认值 / setAnnot / annotationItems / 面板 HTML / 迁移清洗 ---- */
{
  api.resetState();
  /* 支持键与类型默认值（保持既有观感） */
  eq('标注-点支持键', api.annotKeys('point'), ['name','coord']);
  eq('标注-区域支持键', api.annotKeys('rect'), ['name','base','radius','edge','vertex','perimeter','area']);
  eq('标注-折线支持键', api.annotKeys('line'), ['name','node','edge','perimeter','area']);
  eq('标注-文字无键', api.annotKeys('text'), []);
  eq('标注-尺寸标注无键', api.annotKeys('dimension'), []);

  const pt=api.baseObject('point','point.marker',{x:3,y:4});
  eq('标注-点坐标默认关', api.annotOn(pt,'coord'), false);
  const rc=api.baseObject('rect','rect.area',{x:0,y:0,width:10,height:6});
  eq('标注-区域面积默认开', api.annotOn(rc,'area'), true);
  eq('标注-区域周长默认开', api.annotOn(rc,'perimeter'), true);
  eq('标注-区域基点默认关', api.annotOn(rc,'base'), false);
  eq('标注-区域半径默认关', api.annotOn(rc,'radius'), false);
  eq('标注-区域边长默认关', api.annotOn(rc,'edge'), false);
  const ln=api.baseObject('line','line.custom',{points:[[0,0],[10,0],[10,10]],x:0,y:0});
  eq('标注-折线节点默认关', api.annotOn(ln,'node'), false);
  eq('标注-折线边长默认开', api.annotOn(ln,'edge'), true);

  /* setAnnot：写入、同值无变化、非法键拒绝、显式关覆盖默认 */
  eq('标注-写入返回变化', api.setAnnot(pt,'coord',true), true);
  eq('标注-再写同值无变化', api.setAnnot(pt,'coord',true), false);
  eq('标注-写入生效', api.annotOn(pt,'coord'), true);
  eq('标注-非法键拒绝', api.setAnnot(pt,'base',true), false);
  eq('标注-非法键未写入', api.annotOn(pt,'base'), false);
  api.setAnnot(rc,'area',false);
  eq('标注-显式关覆盖默认', api.annotOn(rc,'area'), false);

  /* annotationItems：世界坐标锚点的逐对象标注条目 */
  api.resetState();
  const p2=api.baseObject('point','point.marker',{x:5,y:6});
  eq('标注项-点坐标关时0条', api.annotationItems(p2).length, 0);
  api.setAnnot(p2,'coord',true);
  const pi=api.annotationItems(p2);
  eq('标注项-点坐标开时1条', pi.length, 1);
  ok('标注项-点坐标文本含 X/Y', pi[0].text.includes('X')&&pi[0].text.includes('Y'));

  const r2=api.baseObject('rect','rect.area',{x:2,y:3,width:8,height:5});
  eq('标注项-矩形默认0条(面积/周长为胶囊)', api.annotationItems(r2).length, 0);
  api.setAnnot(r2,'base',true);
  eq('标注项-矩形基点1条', api.annotationItems(r2).length, 1);
  ok('标注项-矩形基点文本含坐标', api.annotationItems(r2)[0].text.includes('2.00'));
  api.setAnnot(r2,'edge',true);
  eq('标注项-矩形四边+基点=5条', api.annotationItems(r2).length, 5);

  const c2=api.baseObject('rect','rect.area',{x:0,y:0,shape:{type:'circle',r:7}});
  api.setAnnot(c2,'radius',true);
  eq('标注项-圆形半径1条', api.annotationItems(c2).length, 1);
  ok('标注项-半径文本以 R 开头', api.annotationItems(c2)[0].text.startsWith('R '));
  eq('标注项-圆形无边长项', api.annotationItems(c2).filter(it=>it.lenWorld).length, 0);

  const l2=api.baseObject('line','line.custom',{points:[[0,0],[4,0],[4,3]],x:0,y:0});
  /* 折线段长/周长标注按对象自身配置显示，与是否被选中无关（修复「改选其他对象后消失」） */
  eq('标注项-折线未选中也含2段长+总长', api.annotationItems(l2).length, 3);
  eq('标注项-折线选中与否条目一致', api.annotationItems(l2,{selected:true}).length, 3);
  api.setAnnot(l2,'edge',false);
  eq('标注项-关段长后仅总长(未选中仍生效)', api.annotationItems(l2).length, 1);
  api.setAnnot(l2,'perimeter',false);
  eq('标注项-关总长后0条', api.annotationItems(l2).length, 0);
  api.setAnnot(l2,'node',true);
  eq('标注项-节点坐标3条', api.annotationItems(l2).length, 3);

  /* 属性面板「图上标注」开关组 HTML */
  ok('标注UI-点含点坐标开关', api.renderAnnotToggles(api.baseObject('point','point.marker',{})).includes('data-annot="coord"'));
  const hRc=api.renderAnnotToggles(api.baseObject('rect','rect.area',{x:0,y:0,width:1,height:1}));
  ok('标注UI-矩形含编号/基点/边长/顶点/周长/面积无半径', ['name','base','edge','vertex','perimeter','area'].every(k=>hRc.includes(`data-annot="${k}"`)) && !hRc.includes('data-annot="radius"'));
  const hCir=api.renderAnnotToggles(api.baseObject('rect','rect.area',{x:0,y:0,shape:{type:'circle',r:5}}));
  ok('标注UI-圆形含半径不含边长', hCir.includes('data-annot="radius"') && !hCir.includes('data-annot="edge"'));
  ok('标注UI-开关组跨满两列', hRc.includes('class="annot-chks span2"'));
  const hLn=api.renderAnnotToggles(api.baseObject('line','line.custom',{points:[[0,0],[1,0]]}));
  ok('标注UI-开放折线含编号/节点/段长/周长无面积', ['name','node','edge','perimeter'].every(k=>hLn.includes(`data-annot="${k}"`)) && !hLn.includes('data-annot="area"'));
  eq('标注UI-文字无开关组', api.renderAnnotToggles(api.baseObject('text','text.custom',{})), '');

  /* 持久化迁移：仅保留该 kind 支持的布尔键，丢弃非法键/非本类型键 */
  const m=api.migrateProject({schema:'offline-drawing-annotation/v1',objects:[
    {kind:'point',name:'PT',x:1,y:2,annot:{coord:true,bogus:true,area:true}},
    {kind:'rect',name:'RC',width:10,height:5,annot:{area:false,base:'yes'}},
    {kind:'line',name:'LN',points:[[0,0],[1,0]],annot:{node:true,edge:false}}
  ]});
  const M=n=>m.objects.find(o=>o.name===n);
  eq('标注迁移-点仅保留 coord', M('PT').annot, {coord:true});
  eq('标注迁移-区域丢弃非布尔 base', M('RC').annot, {area:false});
  eq('标注迁移-折线保留布尔键', M('LN').annot, {node:true,edge:false});
  eq('标注迁移-点坐标生效', api.annotOn(M('PT'),'coord'), true);
  eq('标注迁移-区域面积关生效', api.annotOn(M('RC'),'area'), false);

  /* 41. 标注开关扩展：编号 / 顶点坐标 / 键名随类型变化 / 场地分级开关 ------- */
  api.resetState();
  api.state.settings.precision=2;
  eq('标注-编号默认开(点)', api.annotOn(api.baseObject('point','point.marker',{}),'name'), true);
  eq('标注-编号默认开(区域)', api.annotOn(api.baseObject('rect','rect.area',{x:0,y:0,width:1,height:1}),'name'), true);
  eq('标注-编号默认开(折线)', api.annotOn(api.baseObject('line','line.custom',{points:[[0,0],[1,0]]}),'name'), true);
  eq('标注-区域顶点坐标默认关', api.annotOn(api.baseObject('rect','rect.area',{x:0,y:0,width:1,height:1}),'vertex'), false);

  /* 键名随类型/形态变化：折线=段长、区域=边长；闭合折线节点即顶点坐标 */
  eq('标注-键名:折线边长即段长', api.annotLabel(api.baseObject('line','line.custom',{points:[[0,0],[1,0]]}),'edge'), '段长');
  eq('标注-键名:区域边长', api.annotLabel(api.baseObject('rect','rect.area',{x:0,y:0,width:1,height:1}),'edge'), '边长');
  eq('标注-键名:闭合折线节点即顶点', api.annotLabel(api.baseObject('line','line.custom',{points:[[0,0],[1,0],[1,1]],closed:true}),'node'), '顶点坐标');
  eq('标注-键名:开放折线节点', api.annotLabel(api.baseObject('line','line.custom',{points:[[0,0],[1,0]]}),'node'), '节点坐标');

  /* 区域顶点坐标标注：矩形四角各 1 条；圆/椭圆/扇形无顶点 */
  const rv=api.baseObject('rect','rect.area',{x:0,y:0,width:4,height:3});
  eq('标注项-矩形顶点默认0条', api.annotationItems(rv).length, 0);
  api.setAnnot(rv,'vertex',true);
  eq('标注项-矩形顶点坐标4条', api.annotationItems(rv).length, 4);
  ok('标注项-顶点坐标文本为括号坐标', api.annotationItems(rv)[0].text.startsWith('('));
  const rvCircle=api.baseObject('rect','rect.area',{x:0,y:0,shape:{type:'circle',r:5}});
  api.setAnnot(rvCircle,'vertex',true);
  eq('标注项-圆形无顶点项', api.annotationItems(rvCircle).length, 0);

  /* 编号由 drawLabel/SVG 文本层渲染，不计入 annotationItems；显式关可覆盖默认 */
  const pn=api.baseObject('point','point.marker',{name:'P',x:1,y:1});
  eq('标注项-编号不计入条目', api.annotationItems(pn).length, 0);
  api.setAnnot(pn,'name',false);
  eq('标注-显式关编号', api.annotOn(pn,'name'), false);

  /* 面板按键过滤：圆形不含边长/顶点；矩形不含半径 */
  const hRc2=api.renderAnnotToggles(api.baseObject('rect','rect.area',{x:0,y:0,width:1,height:1}));
  ok('标注UI-矩形含编号与顶点', hRc2.includes('data-annot="name"') && hRc2.includes('data-annot="vertex"'));
  const hCir2=api.renderAnnotToggles(api.baseObject('rect','rect.area',{x:0,y:0,shape:{type:'circle',r:5}}));
  ok('标注UI-圆形无顶点与边长', !hCir2.includes('data-annot="vertex"') && !hCir2.includes('data-annot="edge"'));
  ok('标注UI-折线开关显示为段长', api.renderAnnotToggles(api.baseObject('line','line.custom',{points:[[0,0],[1,0]]})).includes('段长'));
  ok('标注UI-闭合折线含面积开关', api.renderAnnotToggles(api.baseObject('line','line.custom',{points:[[0,0],[1,0],[1,1]],closed:true})).includes('data-annot="area"'));

  /* 折线段长/周长：SVG 与画布同源输出，按逐对象配置显隐、与是否选中无关 */
  api.resetState();
  api.state.settings.precision=2;
  const lnSvg=api.baseObject('line','line.custom',{name:'LS',x:0,y:0,points:[[0,0],[7,0],[7,24]]});
  api.state.objects.push(lnSvg);
  const lnS1=api.buildSceneSvg();
  ok('SVG-折线按配置输出段长(7/24)', lnS1.includes('7.00 m')&&lnS1.includes('24.00 m'));
  ok('SVG-折线按配置输出总长(Σ31)', lnS1.includes('Σ 31.00 m'));
  api.setAnnot(lnSvg,'edge',false);
  const lnS2=api.buildSceneSvg();
  ok('SVG-关段长后段长文字消失', !lnS2.includes('7.00 m')&&!lnS2.includes('24.00 m'));
  ok('SVG-关段长后总长仍在', lnS2.includes('Σ 31.00 m'));
  api.setAnnot(lnSvg,'perimeter',false);
  ok('SVG-关总长后总长消失', !api.buildSceneSvg().includes('Σ 31.00 m'));

  /* 场地标注分级开关：迁移默认与继承（周长自原「周长面积」拆出） */
  eq('迁移-场地周长缺省继承面积(开)', api.migrateProject({schema:'offline-drawing-annotation/v1'}).settings.sitePerimeter, true);
  eq('迁移-场地基点默认关', api.migrateProject({schema:'offline-drawing-annotation/v1'}).settings.siteBase, false);
  eq('迁移-场地半径默认关', api.migrateProject({schema:'offline-drawing-annotation/v1'}).settings.siteRadius, false);
  eq('迁移-场地周长继承面积(关)', api.migrateProject({schema:'offline-drawing-annotation/v1',settings:{siteArea:false}}).settings.sitePerimeter, false);
  const sm=api.migrateProject({schema:'offline-drawing-annotation/v1',settings:{sitePerimeter:true,siteBase:true,siteRadius:true}}).settings;
  eq('迁移-场地分级开关保留', [sm.sitePerimeter,sm.siteBase,sm.siteRadius], [true,true,true]);

  /* 场地基点/半径取值的形状差异 */
  eq('场地-圆基点即圆心', api.siteBasePoint({shape:{type:'circle',cx:3,cy:4,r:5}}), [3,4]);
  eq('场地-矩形基点', api.siteBasePoint({shape:{type:'rect',x:1,y:2,w:5,h:5}}), [1,2]);
  eq('场地-多边形无基点', api.siteBasePoint({shape:{type:'polygon',points:[[0,0],[1,0],[1,1]]}}), null);
  eq('场地-圆半径文案', api.siteRadiusText({shape:{type:'circle',cx:0,cy:0,r:7}}), '7.00 m');
  eq('场地-椭圆半径文案', api.siteRadiusText({shape:{type:'ellipse',rx:4,ry:3}}), 'Rx 4.00  Ry 3.00');
  eq('场地-矩形无半径', api.siteRadiusText({shape:{type:'rect',x:0,y:0,w:1,h:1}}), '');

  /* 属性面板接线：单选各类型对象时「图上标注」组按类型/形状正确呈现 */
  api.resetState();
  const selR=api.baseObject('rect','rect.area',{name:'R1',x:0,y:0,width:4,height:3});
  api.state.objects=[selR]; api.selectedIds.add(selR.id);
  api.renderProps();
  const panelR=api.$('propPanel').innerHTML;
  ok('属性面板-区域标注组含编号与顶点坐标', panelR.includes('data-annot="name"') && panelR.includes('data-annot="vertex"'));
  ok('属性面板-区域无半径开关', !panelR.includes('data-annot="radius"') && panelR.includes('data-annot="edge"'));
  const selC=api.baseObject('rect','rect.area',{name:'R2',x:0,y:0,shape:{type:'circle',r:5}});
  api.state.objects=[selC]; api.selectedIds.clear(); api.selectedIds.add(selC.id);
  api.renderProps();
  const panelC=api.$('propPanel').innerHTML;
  ok('属性面板-圆形含半径不含顶点/边长', panelC.includes('data-annot="radius"') && !panelC.includes('data-annot="vertex"') && !panelC.includes('data-annot="edge"'));
  const selP=api.baseObject('point','point.marker',{name:'P1',x:1,y:1});
  api.state.objects=[selP]; api.selectedIds.clear(); api.selectedIds.add(selP.id);
  api.renderProps();
  ok('属性面板-点设备含编号开关', api.$('propPanel').innerHTML.includes('data-annot="name"'));
  api.selectedIds.clear();
  api.resetState();
}

/* 44. 逐对象标注开关完全优先：全局总开关仅作未显式配置对象的缺省值 --------- */
{
  /* 编号：全局关 → 未配置对象隐藏；显式开 → 全局关也显示；显式关 → 全局开也隐藏 */
  api.resetState();
  api.state.settings.precision=2;
  const ptQ=api.baseObject('point','point.marker',{name:'PQ',x:1,y:1});
  const ptE=api.baseObject('point','point.marker',{name:'PE',x:2,y:2});
  api.state.objects.push(ptQ,ptE);
  api.state.settings.showLabels=false;
  ok('优先-全局关标签时未配置对象编号隐藏', !api.buildSceneSvg().includes('>PQ<'));
  api.setAnnot(ptQ,'name',true);
  ok('优先-全局关标签但逐对象开编号仍显示', api.buildSceneSvg().includes('>PQ<'));
  api.setAnnot(ptE,'name',false);
  api.state.settings.showLabels=true;
  ok('优先-全局开标签但逐对象关编号仍隐藏', !api.buildSceneSvg().includes('>PE<'));

  /* 折线段长/总长：全局关 → 未配置对象隐藏；显式开 → 仍显示 */
  const lnQ=api.baseObject('line','line.custom',{name:'LQ',x:0,y:0,points:[[0,0],[6,0],[6,8]]});
  api.state.objects.push(lnQ);
  api.state.settings.showSegLen=false;
  const svgL0=api.buildSceneSvg();
  ok('优先-全局关段长时未配置折线无段长/总长', !svgL0.includes('6.00 m')&&!svgL0.includes('8.00 m')&&!svgL0.includes('Σ 14.00 m'));
  api.setAnnot(lnQ,'edge',true); api.setAnnot(lnQ,'perimeter',true);
  const svgL1=api.buildSceneSvg();
  ok('优先-全局关段长但逐对象开仍显示分段', svgL1.includes('6.00 m')&&svgL1.includes('8.00 m'));
  ok('优先-全局关段长但逐对象开总长仍显示', svgL1.includes('Σ 14.00 m'));
  api.state.settings.showSegLen=true;
  api.setAnnot(lnQ,'edge',false); api.setAnnot(lnQ,'perimeter',false);
  const svgL2=api.buildSceneSvg();
  ok('优先-全局开段长但逐对象关仍隐藏段长/总长', !svgL2.includes('6.00 m')&&!svgL2.includes('Σ 14.00 m'));

  /* 区域面积/周长：全局关 → 未配置无胶囊；显式开 → 显示；显式关面积只留周长 */
  api.resetState();
  api.state.settings.precision=2;
  const rcQ=api.baseObject('rect','rect.area',{name:'RQ',x:0,y:0,width:10,height:6});
  api.state.objects.push(rcQ);
  api.state.settings.showAreaTag=false;
  ok('优先-全局关面积时未配置区域无胶囊', !api.buildSceneSvg().includes('面积 60.00 ㎡'));
  api.setAnnot(rcQ,'area',true);
  ok('优先-全局关面积但逐对象开面积仍显示', api.buildSceneSvg().includes('面积 60.00 ㎡'));
  api.setAnnot(rcQ,'perimeter',true);
  api.setAnnot(rcQ,'area',false);
  const svgR=api.buildSceneSvg();
  ok('优先-逐对象关面积仅留周长', !svgR.includes('面积 60.00 ㎡')&&svgR.includes('周长 32.00 m'));
  api.state.settings.showAreaTag=true;
  ok('优先-全局开面积但逐对象关面积仍隐藏', !api.buildSceneSvg().includes('面积 60.00 ㎡'));

  /* 闭合折线：面积/周长同样只按逐对象配置；与全局开关、选中状态均无关 */
  api.resetState();
  api.state.settings.precision=2;
  const cl=api.baseObject('line','line.custom',{name:'CL',x:0,y:0,points:[[0,0],[10,0],[10,10],[0,10]],closed:true});
  api.state.objects.push(cl);
  api.state.settings.showAreaTag=false;
  ok('优先-全局关面积时未配置闭合折线无胶囊', !api.buildSceneSvg().includes('面积 100.00 ㎡'));
  api.setAnnot(cl,'area',true);
  ok('优先-全局关面积但逐对象开闭合折线面积仍显示', api.buildSceneSvg().includes('面积 100.00 ㎡'));
  api.setAnnot(cl,'area',false);
  ok('优先-逐对象关面积后闭合折线面积隐藏', !api.buildSceneSvg().includes('面积 100.00 ㎡'));
  api.state.settings.showAreaTag=true;
  ok('优先-全局开面积仍按逐对象关隐藏', !api.buildSceneSvg().includes('面积 100.00 ㎡'));
  api.setAnnot(cl,'perimeter',false);
  ok('优先-面积周长均关后胶囊消失', !api.buildSceneSvg().includes('周长 40.00 m'));
  api.resetState();
}

/* 45. 画布渲染链路：逐对象标注显隐与 SVG 一致（非选中态、受全局开关影响时仍按对象配置） ---- */
{
  /* 记录型 2D 上下文：只关心 fillText 文本，其余绘制调用一律吞掉 */
  const recCtx=()=>{
    const texts=[];
    return new Proxy({}, {
      get(t,p){
        if(p==='then') return undefined;
        if(p==='fillText') return s=>{ texts.push(String(s)); };
        if(p==='measureText') return s=>({width:String(s).length*7});
        if(p==='canvas') return {clientWidth:900,clientHeight:600};
        if(p==='texts') return texts;
        if(p in t) return t[p];
        return ()=>{};
      },
      set(t,p,v){ t[p]=v; return true; }
    });
  };
  const toS=p=>[p[0]*10,-p[1]*10];

  api.resetState();
  api.state.settings.precision=2;
  const lnC=api.baseObject('line','line.custom',{name:'LC',x:0,y:0,points:[[0,0],[50,0],[50,120]]});
  api.state.objects=[lnC];
  const c1=recCtx(); api.drawObject(c1,lnC,{zoom:1},toS,1,1);
  ok('画布-折线未选中仍显示编号', c1.texts.includes('LC'));
  ok('画布-折线未选中仍显示分段长', c1.texts.includes('50.00 m')&&c1.texts.includes('120.00 m'));
  ok('画布-折线未选中仍显示总长', c1.texts.includes('Σ 170.00 m'));
  api.setAnnot(lnC,'edge',false);
  const c2=recCtx(); api.drawObject(c2,lnC,{zoom:1},toS,1,1);
  ok('画布-逐对象关段长后无分段文字', !c2.texts.includes('50.00 m')&&!c2.texts.includes('120.00 m'));
  ok('画布-逐对象关段长后总长仍在', c2.texts.includes('Σ 170.00 m'));
  api.setAnnot(lnC,'perimeter',false);
  api.state.settings.showSegLen=false;
  const c3=recCtx(); api.drawObject(c3,lnC,{zoom:1},toS,1,1);
  ok('画布-全局关段长且逐对象关总长后无总长', !c3.texts.includes('Σ 170.00 m'));
  api.setAnnot(lnC,'perimeter',true);
  const c4=recCtx(); api.drawObject(c4,lnC,{zoom:1},toS,1,1);
  ok('画布-全局关段长但逐对象开总长仍显示', c4.texts.includes('Σ 170.00 m'));

  /* 区域面积/周长：逐对象开关独立于全局「图上显示面积」 */
  api.resetState();
  api.state.settings.precision=2;
  const rcC=api.baseObject('rect','rect.area',{name:'RC',x:0,y:0,width:10,height:6});
  api.state.objects=[rcC];
  const c5=recCtx(); api.drawObject(c5,rcC,{zoom:1},toS,1,1);
  ok('画布-区域默认显示面积+周长', c5.texts.includes('面积 60.00 ㎡')&&c5.texts.includes('周长 32.00 m'));
  api.setAnnot(rcC,'area',false);
  const c6=recCtx(); api.drawObject(c6,rcC,{zoom:1},toS,1,1);
  ok('画布-逐对象关面积后仅剩周长', !c6.texts.includes('面积 60.00 ㎡')&&c6.texts.includes('周长 32.00 m'));
  api.setAnnot(rcC,'perimeter',true);
  api.state.settings.showAreaTag=false;
  const c7=recCtx(); api.drawObject(c7,rcC,{zoom:1},toS,1,1);
  ok('画布-全局关面积不影响逐对象开周长', c7.texts.includes('周长 32.00 m'));

  /* 闭合折线：全局关面积时，逐对象仍开则照常显示 */
  api.resetState();
  api.state.settings.precision=2;
  const clC=api.baseObject('line','line.custom',{name:'CLC',x:0,y:0,points:[[0,0],[10,0],[10,10],[0,10]],closed:true});
  api.state.objects=[clC];
  api.setAnnot(clC,'area',true); api.setAnnot(clC,'perimeter',true);
  api.state.settings.showAreaTag=false;
  const c8=recCtx(); api.drawObject(c8,clC,{zoom:1},toS,1,1);
  ok('画布-闭合折线全局关面积仍按逐对象显示', c8.texts.includes('面积 100.00 ㎡')&&c8.texts.includes('周长 40.00 m'));
  api.setAnnot(clC,'area',false); api.setAnnot(clC,'perimeter',false);
  const c9=recCtx(); api.drawObject(c9,clC,{zoom:1},toS,1,1);
  ok('画布-闭合折线面积周长关后胶囊消失', !c9.texts.includes('面积 100.00 ㎡')&&!c9.texts.includes('周长 40.00 m'));
  ok('画布-闭合折线胶囊消失后编号回到中心', c9.texts.includes('CLC'));
  api.resetState();
}

/* 46. 平行四边形：区域与矢量场地共用的参数形状 ------------------------------ */
{
  api.resetState();
  api.state.settings.precision=2;
  ok('平行四边形-已注册为区域形状', api.AREA_SHAPE_TYPES.includes('parallelogram'));
  eq('平行四边形-默认倾角30°', api.PARALLELOGRAM_DEFAULT_SKEW, 30);
  eq('平行四边形-倾角上限80°', api.PARALLELOGRAM_MAX_SKEW, 80);
  eq('平行四边形-表格中文名', api.AREA_SHAPE_LABELS.parallelogram, '平行四边形');

  /* 顶点：基点=左下角，上边右移 h·tanθ（错切不改变底与高） */
  const pts=api.parallelogramPoints(0,0,10,6,30);
  eq('平行四边形-四顶点', pts.length, 4);
  eq('平行四边形-下边右角', pts[1], [10,0]);
  approx('平行四边形-左上角X=h·tanθ', pts[3][0], 6*Math.tan(Math.PI/6), 1e-9);
  approx('平行四边形-右上角X=w+h·tanθ', pts[2][0], 10+6*Math.tan(Math.PI/6), 1e-9);
  approx('平行四边形-上下边等长', Math.hypot(pts[2][0]-pts[3][0],pts[2][1]-pts[3][1]), 10, 1e-9);

  const o=api.baseObject('rect','rect.area',{x:0,y:0,width:10,height:6,shape:{type:'parallelogram',skew:30}});
  eq('平行四边形-形状类型', api.areaShapeType(o), 'parallelogram');
  eq('平行四边形-面积=底×高', api.shapeArea(o), 60);
  approx('平行四边形-周长=2(w+h/cosθ)', api.shapePerimeter(o), 2*(10+6/Math.cos(Math.PI/6)), 1e-9);
  eq('平行四边形-渲染四顶点', api.shapeWorldPoints(o).length, 4);
  approx('平行四边形-质心X含错切', api.shapeLabelCenter(o)[0], (2*10+2*6*Math.tan(Math.PI/6))/4, 1e-9);
  ok('平行四边形-内部命中', api.shapeHit(o,[7,3]));
  ok('平行四边形-左上外接盒角落不命中', !api.shapeHit(o,[0.2,5.5]));

  const oRot=api.baseObject('rect','rect.area',{x:0,y:0,width:10,height:6,angle:90,shape:{type:'parallelogram',skew:30}});
  const pr=api.shapeWorldPoints(oRot);
  approx('平行四边形-旋转后基点不动', Math.hypot(pr[0][0],pr[0][1]), 0, 1e-9);
  approx('平行四边形-旋转90°后下边沿Y轴', pr[1][1], 10, 1e-9);

  /* 形状互换：质心与面积保持不变（错切面积不变） */
  const cv=api.baseObject('rect','rect.area',{x:0,y:0,width:10,height:6});
  const c0=api.shapeLabelCenter(cv), a0=api.shapeArea(cv);
  api.convertAreaShape(cv,'parallelogram');
  eq('互换-矩形→平行四边形', api.areaShapeType(cv), 'parallelogram');
  eq('互换-面积不变', api.shapeArea(cv), a0);
  approx('互换-质心X不变', api.shapeLabelCenter(cv)[0], c0[0], 1e-9);
  approx('互换-质心Y不变', api.shapeLabelCenter(cv)[1], c0[1], 1e-9);
  api.convertAreaShape(cv,'rect');
  eq('互换-回矩形类型', api.areaShapeType(cv), 'rect');
  approx('互换-回矩形宽度不变', cv.width, 10, 1e-9);
  approx('互换-回矩形质心不变', api.shapeLabelCenter(cv)[1], c0[1], 1e-9);

  const c2=api.baseObject('rect','rect.area',{x:0,y:0,shape:{type:'circle',r:5}});
  const ac=api.shapeArea(c2);
  api.convertAreaShape(c2,'parallelogram');
  approx('互换-圆形→平行四边形等面积', api.shapeArea(c2), ac, 1e-6);

  /* 逐对象标注：四边+四顶点，无半径开关 */
  api.resetState(); api.state.settings.precision=2;
  const sv=api.baseObject('rect','rect.area',{name:'PAR',x:0,y:0,width:10,height:6,shape:{type:'parallelogram',skew:30}});
  api.state.objects=[sv];
  api.setAnnot(sv,'edge',true); api.setAnnot(sv,'vertex',true);
  eq('标注项-平行四边形四边', api.annotationItems(sv).filter(it=>it.lenWorld).length, 4);
  eq('标注项-平行四边形四顶点', api.annotationItems(sv).filter(it=>!it.lenWorld).length, 4);
  const hP=api.renderAnnotToggles(sv);
  ok('标注UI-平行四边形含边长/顶点无半径', hP.includes('data-annot="edge"')&&hP.includes('data-annot="vertex"')&&!hP.includes('data-annot="radius"'));
  api.selectedIds.add(sv.id); api.renderProps();
  ok('属性面板-平行四边形倾角输入', api.$('propPanel').innerHTML.includes('data-field="shapeSkew"'));
  ok('属性面板-形状下拉含平行四边形', api.$('propPanel').innerHTML.includes('>平行四边形</option>'));

  /* 属性面板接线：切换形状与倾角写入走 applyField（与真实输入事件同一入口） */
  const pf=(f,v)=>({dataset:{field:f},value:v,checked:false});
  const pv=api.baseObject('rect','rect.area',{x:0,y:0,width:8,height:4});
  api.applyField(pf('shapeType','parallelogram'),pv,()=>{});
  eq('面板接线-矩形切换为平行四边形', api.areaShapeType(pv),'parallelogram');
  api.applyField(pf('shapeSkew',-45),pv,()=>{});
  approx('面板接线-倾角写入-45°', api.parallelogramSkew(pv.shape), -45, 1e-9);
  api.applyField(pf('shapeSkew',200),pv,()=>{});
  approx('面板接线-倾角超限钳到80°', api.parallelogramSkew(pv.shape), 80, 1e-9);
  api.applyField(pf('shapeType','rect'),pv,()=>{});
  eq('面板接线-切回矩形', api.areaShapeType(pv),'rect');

  /* SVG 导出：按四顶点多边形绘制 */
  const svg=api.buildSceneSvg();
  const poly=svg.match(/<polygon points="([^"]+)"/);
  eq('SVG-平行四边形四顶点', poly?poly[1].trim().split(/\s+/).length:0, 4);
  ok('SVG-平行四边形四角X互不相同（含错切）', !!poly&&new Set(poly[1].trim().split(/\s+/).map(s=>s.split(',')[0])).size===4);

  /* 表格导出/导入：形状列 + 倾角参数往返 */
  const row=api.objectRows().find(r=>r['编号']==='PAR');
  eq('表格-平行四边形形状列', row['形状'], '平行四边形');
  eq('表格-平行四边形倾角参数', row['形状参数'], '30');
  eq('表格-平行四边形宽度', row['宽度'], '10.00');
  const imp=api.baseObject('rect','rect.area',{x:0,y:0});
  ok('表格导入-平行四边形成功', api.applyRowShape(imp,'平行四边形',{x:2,y:3,w:8,h:4,angle:45,params:[20]}));
  eq('表格导入-类型', api.areaShapeType(imp), 'parallelogram');
  approx('表格导入-倾角20°', api.parallelogramSkew(imp.shape), 20, 1e-9);
  eq('表格导入-面积32', api.shapeArea(imp), 32);
  approx('表格导入-旋转角45°', imp.angle, 45, 1e-9);

  /* 工程迁移：尺寸保留（平行四边形尺寸存于 width/height）、倾角钳制 */
  const m=api.migrateProject({schema:'offline-drawing-annotation/v1',objects:[
    {kind:'rect',name:'PM',x:1,y:2,width:10,height:6,angle:15,shape:{type:'parallelogram',skew:120}}
  ]});
  const pm=m.objects.find(x=>x.name==='PM');
  ok('迁移-平行四边形保留宽高', !!pm&&pm.width===10&&pm.height===6);
  eq('迁移-倾角钳到80°', pm&&pm.shape&&pm.shape.skew, 80);
  approx('迁移-保留旋转角', pm&&pm.angle, 15, 1e-9);

  /* 矢量场地：边界/面积周长/基点/控制点/属性面板/SVG */
  api.resetState();
  const bg={kind:'parallelogram',shape:{type:'parallelogram',x:0,y:0,w:10,h:6,skew:30}};
  const bp=api.siteBoundaryPoints(bg);
  eq('场地-四界点', bp.length, 4);
  approx('场地-左上界点X', bp[3][0], 6*Math.tan(Math.PI/6), 1e-9);
  const sap=api.siteAreaPerimeter(bg);
  eq('场地-面积=底×高', sap.area, 60);
  approx('场地-周长公式', sap.perimeter, 2*(10+6/Math.cos(Math.PI/6)), 1e-9);
  eq('场地-基点=左下角', api.siteBasePoint(bg), [0,0]);
  eq('场地-无半径文案', api.siteRadiusText(bg), '');
  const hs=api.siteHandleList(bg);
  eq('场地-控制点=4角+倾角', hs.length, 5);
  ok('场地-含倾角控制点', hs.some(h=>h.mode==='skew'));
  ok('场地-属性含倾角输入', api.sitePropsHTML(bg).includes('data-site-field="skew"'));
  ok('场地-属性显示种类', api.sitePropsHTML(bg).includes('平行四边形场地'));
  const gb=api.siteBounds(bg);
  approx('场地-包围盒宽含错切', gb.w, 10+6*Math.tan(Math.PI/6), 1e-9);
  approx('场地-包围盒高', gb.h, 6, 1e-9);

  api.state.background=bg; api.resetFrameRef(); api.state.objects=[];
  const svgSite=api.buildSceneSvg();
  ok('SVG-场地平行四边形多边形', /<polygon points="[^"]+" fill="#eef2f7"/.test(svgSite));

  const m2=api.migrateProject({schema:'offline-drawing-annotation/v1',background:{kind:'parallelogram',shape:{type:'parallelogram',x:1,y:2,w:10,h:6,skew:200}}});
  eq('迁移-场地种类', m2.background.kind, 'parallelogram');
  eq('迁移-场地倾角钳到80°', m2.background.shape.skew, 80);
  approx('迁移-场地宽保留', m2.background.shape.w, 10, 1e-9);
  api.resetState();
}

/* 47. 分层渲染：视口裁剪矩形与静态层缓存签名 -------------------------------- */
{
  api.resetState();
  api.state.background={kind:'rect',fileName:'',assetId:'',width:0,height:0,origin:[0,0],metersPerPixel:1,calibrated:false,
    shape:{type:'rect',x:0,y:0,w:100,h:70}};
  api.resetFrameRef();
  const v={zoom:1,panX:0,panY:0}, dims=api.worldDims();
  const r=api.visibleWorldRect(v,dims,800,600,0);
  eq('裁剪-视口左边界', r.minX, 0);
  eq('裁剪-视口右边界', r.maxX, 800);
  eq('裁剪-视口下边界', r.minY, -530);
  eq('裁剪-视口上边界', r.maxY, 70);
  const rPad=api.visibleWorldRect(v,dims,800,600,48);
  eq('裁剪-外扩像素换算为世界', rPad.minX, -48);

  const k1=api.sceneStaticKey(v,dims,800,600);
  eq('缓存-同输入签名稳定', api.sceneStaticKey(v,dims,800,600), k1);
  ok('缓存-视口变化使签名失效', api.sceneStaticKey({zoom:2,panX:0,panY:0},dims,800,600)!==k1);
  api.invalidateStatic();
  ok('缓存-显式作废使签名失效', api.sceneStaticKey(v,dims,800,600)!==k1);
  const k2=api.sceneStaticKey(v,dims,800,600);
  api.selectedIds.add('X1');
  ok('缓存-选择集变化使签名失效', api.sceneStaticKey(v,dims,800,600)!==k2);
  api.resetState();
}

/* 48. 覆盖率：分辨率参数与盲区多边形导出数据 -------------------------------- */
{
  api.resetState();
  api.state.objects.push(api.baseObject('rect','rect.area',{name:'B1',x:0,y:0,width:20,height:20}));
  const coarse=api.analyzeCoverage(api.state,{targetCells:400});
  const fine=api.analyzeCoverage(api.state,{targetCells:9000});
  ok('覆盖精度-目标格数越大步长越小', fine.regions[0].cell < coarse.regions[0].cell);
  ok('覆盖精度-步长下限0.03m', coarse.regions[0].cell >= .03);

  const rects=api.blindSpotRects(coarse);
  eq('盲区-全盲时每行合并为一个矩形', rects.length, coarse.regions[0].ny);
  eq('盲区-矩形为四个顶点', rects[0].points.length, 4);
  approx('盲区-多边形总面积=区域面积', api.blindSpotArea(coarse), 400, 1e-6);

  api.state.objects.push(api.baseObject('point','point.dome',{name:'D',x:10,y:10,phys:1000}));
  const full=api.analyzeCoverage(api.state,{targetCells:400});
  eq('盲区-全覆盖时无盲区面', api.blindSpotRects(full).length, 0);
  approx('盲区-全覆盖面积为0', api.blindSpotArea(full), 0, 1e-9);

  api.state.objects[1]=api.baseObject('point','point.camera',{name:'C',x:10,y:10,phys:1000,angle:0});
  const part=api.analyzeCoverage(api.state,{targetCells:4000});
  const pr=part.regions[0];
  const blindCells=pr.grid.reduce((s,g)=>s+(g===0?1:0),0);
  approx('盲区-多边形面积=盲格数×格面积', api.blindSpotArea(part), blindCells*pr.cell*pr.cell, 1e-6);
  ok('盲区-多边形面积与栅格盲区接近(<2%)', Math.abs(api.blindSpotArea(part)-part.totalBlind)<=part.totalBlind*.02);
  ok('盲区-部分覆盖存在面', api.blindSpotRects(part).length>0);
  api.resetState();
}

/* 49. 运行环境能力探测：file:// 与 IDB/SW/Blob 缺失时的显式降级 ---------------- */
{
  const fileEnv=api.detectCapabilities({protocol:'file:',indexedDB:{},serviceWorker:{},Blob:function(){},createObjectURL:true});
  eq('能力-file模式识别', fileEnv.file, true);
  eq('能力-file下SW不可用', fileEnv.sw, false);
  eq('能力-file下IDB可用为ok', fileEnv.level, 'ok');
  ok('能力-file给出离线模式说明', fileEnv.warnings.some(w=>w.includes('file://')));

  const hosted=api.detectCapabilities({protocol:'https:',indexedDB:{},serviceWorker:{},Blob:function(){},createObjectURL:true});
  eq('能力-托管模式SW可用', hosted.sw, true);
  eq('能力-托管模式无file提示', hosted.warnings.some(w=>w.includes('file://')), false);

  const degraded=api.detectCapabilities({protocol:'https:',indexedDB:null,serviceWorker:{}});
  eq('能力-无IDB降级标记', degraded.level, 'degraded');
  ok('能力-无IDB给出localStorage降级提示', degraded.warnings.some(w=>w.includes('localStorage')));

  const noBlob=api.detectCapabilities({protocol:'file:',indexedDB:{},Blob:null,createObjectURL:true});
  eq('能力-无Blob识别', noBlob.blob, false);
  ok('能力-无Blob给出导入导出提示', noBlob.warnings.some(w=>w.includes('Blob')));

  /* Service Worker 必须在站点根目录：/js/ 下的默认 scope 只能接管 /js/，无法缓存 index.html */
  ok('PWA-Service Worker 位于根目录', existsSync(join(root,'sw.js')));
  ok('PWA-旧 js/sw.js 已移除', !existsSync(join(root,'js','sw.js')));
  const appSrc=readFileSync(join(root,'js','app','app.js'),'utf8');
  ok('PWA-注册路径指向根 sw.js', /serviceWorker\.register\(\s*['"]sw\.js['"]\s*\)/.test(appSrc));
}

/* 50. 解析器加固：ZIP/XLSX/DXF/PDF 的输入上限与畸形样例 ---------------------- */
asyncSuites.push((async()=>{
  const rejects=async(name,promise,re)=>{
    try{ await promise; ok(name+'（未抛错）',false); }
    catch(e){ ok(name+(re?`（${e.message}）`:''),re?re.test(e.message):true); }
  };

  /* ---- ZIP ---- */
  const zipOk=api.Zip.build([{name:'a.txt',text:'hello',},{name:'b/d.bin',bytes:new Uint8Array([1,2,3])}]);
  ok('加固ZIP-正常包可读', Object.keys(await api.Zip.readEntries(zipOk)).length===2);
  await rejects('加固ZIP-超过字节上限', api.Zip.readEntries(zipOk,{maxBytes:10}), /过大/);
  await rejects('加固ZIP-条目数超限', api.Zip.readEntries(zipOk,{maxEntries:1}), /条目数/);
  await rejects('加固ZIP-单文件解压上限', api.Zip.readEntries(zipOk,{maxEntryBytes:2}), /单文件/);
  await rejects('加固ZIP-解压总量上限', api.Zip.readEntries(zipOk,{maxTotalBytes:3}), /总量/);
  await rejects('加固ZIP-空缓冲', api.Zip.readEntries(new ArrayBuffer(0)), /ZIP 结构缺失|截断/);
  await rejects('加固ZIP-随机字节', api.Zip.readEntries(new Uint8Array([1,2,3,4,5,6,7,8]).buffer), /ZIP 结构缺失|截断/);
  /* ZIP64 标记（EOCD 条目数 0xFFFF） */
  const zip64=zipOk.slice(0);
  const z64=new Uint8Array(zip64);
  for(let i=z64.length-22;i>=0;i--){
    if(z64[i]===0x50&&z64[i+1]===0x4b&&z64[i+2]===0x05&&z64[i+3]===0x06){
      new DataView(zip64).setUint16(i+10,0xFFFF,true); break;
    }
  }
  await rejects('加固ZIP-ZIP64拒绝', api.Zip.readEntries(zip64), /ZIP64/);
  /* 不支持的压缩方式（中央目录 method 改为 99） */
  const badMethod=zipOk.slice(0), bm=new Uint8Array(badMethod);
  for(let i=0;i<bm.length-4;i++){
    if(bm[i]===0x50&&bm[i+1]===0x4b&&bm[i+2]===0x01&&bm[i+3]===0x02){ new DataView(badMethod).setUint16(i+10,99,true); break; }
  }
  await rejects('加固ZIP-不支持的压缩方式', api.Zip.readEntries(badMethod), /压缩方式/);
  /* 中央目录偏移越界 → 统一转为「损坏或截断」 */
  const badOffset=zipOk.slice(0), bo=new Uint8Array(badOffset);
  for(let i=bo.length-22;i>=0;i--){
    if(bo[i]===0x50&&bo[i+1]===0x4b&&bo[i+2]===0x05&&bo[i+3]===0x06){ new DataView(badOffset).setUint32(i+16,0xFFFFF000,true); break; }
  }
  await rejects('加固ZIP-中央目录越界', api.Zip.readEntries(badOffset), /损坏|截断/);
  const zipDir=api.Zip.build([{name:'dir/',text:''},{name:'f.txt',text:'x'}]);
  eq('加固ZIP-目录条目不计入文件', Object.keys(await api.Zip.readEntries(zipDir)).length, 1);

  /* ---- XLSX ---- */
  const table=[['编号','对象类型','X','Y'],['O1','点设备','1','2'],['O2','点设备','3','4'],['O3','点设备','5','6']];
  const xlsxOk=api.Xlsx.build(table,'S');
  eq('加固XLSX-正常读取行数', (await api.Xlsx.readRows(xlsxOk)).length, 4);
  await rejects('加固XLSX-行数超限', api.Xlsx.readRows(xlsxOk,{maxRows:2}), /行数/);
  await rejects('加固XLSX-列数超限', api.Xlsx.readRows(xlsxOk,{maxCols:2}), /列数/);
  await rejects('加固XLSX-非ZIP输入', api.Xlsx.readRows(new Uint8Array([1,2,3,4])), /ZIP|XLSX/);
  const zipNoSheet=api.Zip.build([{name:'hello.txt',text:'x'}]);
  await rejects('加固XLSX-无工作表', api.Xlsx.readRows(zipNoSheet), /工作表/);
  const badXml=api.Zip.build([{name:'xl/worksheets/sheet1.xml',text:'<worksheet><row><c r="A1"><v>1</v></c>'}]);
  await rejects('加固XLSX-畸形XML', api.Xlsx.readRows(badXml), /./);
  await rejects('加固XLSX-空缓冲', api.Xlsx.readRows(new ArrayBuffer(0)), /ZIP/);
  const emptySheet=api.Zip.build([{name:'xl/worksheets/sheet1.xml',text:'<worksheet></worksheet>'}]);
  eq('加固XLSX-空工作表返回空表', (await api.Xlsx.readRows(emptySheet)).length, 0);

  /* ---- DXF ---- */
  eq('加固DXF-空文本返回空实体', api.Dxf.parseDxf('').entities.length, 0);
  eq('加固DXF-null返回空实体', api.Dxf.parseDxf(null).entities.length, 0);
  eq('加固DXF-随机文本返回空实体', api.Dxf.parseDxf('not a dxf at all\n1\n2\n3').entities.length, 0);
  const dxfLines=['0','SECTION','2','ENTITIES'];
  for(let i=0;i<5;i++) dxfLines.push('0','LINE','8','0','10',''+i,'20','0','11',''+(i+1),'21','0');
  dxfLines.push('0','ENDSEC','0','EOF');
  const dxfOk=dxfLines.join('\n');
  eq('加固DXF-正常解析5条线', api.Dxf.parseDxf(dxfOk).entities.length, 5);
  let dxfErr=null; try{ api.Dxf.parseDxf(dxfOk,{maxChars:20}); }catch(e){ dxfErr=e; }
  ok('加固DXF-文本长度超限', !!dxfErr&&/过大/.test(dxfErr.message));
  dxfErr=null; try{ api.Dxf.parseDxf(dxfOk,{maxEntities:2}); }catch(e){ dxfErr=e; }
  ok('加固DXF-实体数超限', !!dxfErr&&/实体数/.test(dxfErr.message));
  eq('加固DXF-实体数恰好等于上限可通过', api.Dxf.parseDxf(dxfOk,{maxEntities:5}).entities.length, 5);
  let truncatedOk=true; try{ api.Dxf.parseDxf(dxfOk.slice(0,Math.floor(dxfOk.length/2))); }catch(e){ truncatedOk=false; }
  ok('加固DXF-截断文件友好降级', truncatedOk);

  /* ---- PDF ---- */
  const content='10 10 100 50 re S\n';
  const obj=(n,body)=>n+' 0 obj\n'+body+'\nendobj\n';
  let pdf='%PDF-1.4\n';
  pdf+=obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  pdf+=obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  pdf+=obj(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R >>');
  pdf+=obj(4,'<< /Length '+content.length+' >>\nstream\n'+content+'endstream');
  pdf+='%%EOF';
  eq('加固PDF-正常页数', (await api.PdfRead.parsePdf(pdf)).paths.length>=1, true);
  await rejects('加固PDF-非PDF输入', api.PdfRead.parsePdf('not a pdf'), /不是有效的 PDF/);
  await rejects('加固PDF-空输入', api.PdfRead.parsePdf(new Uint8Array(0)), /不是有效的 PDF/);
  await rejects('加固PDF-字节上限', api.PdfRead.parsePdf(pdf,{maxBytes:8}), /过大/);
  await rejects('加固PDF-页数上限', api.PdfRead.parsePdf(pdf,{maxPages:0}), /页数/);
  await rejects('加固PDF-对象数上限', api.PdfRead.parsePdf(pdf,{maxObjects:1}), /对象数/);
  await rejects('加固PDF-无页面结构', api.PdfRead.parsePdf('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'), /未找到页面/);
  await rejects('加固PDF-截断内容流', api.PdfRead.parsePdf(pdf.slice(0,60)), /未找到页面|不是有效/);
  /* 两页 PDF：页数上限 1 应拒绝；对象数恰好等于上限应通过 */
  const two=pdf.replace('%%EOF',obj(5,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>')+'%%EOF');
  await rejects('加固PDF-两页超过上限1', api.PdfRead.parsePdf(two,{maxPages:1}), /页数/);
  eq('加固PDF-对象数恰好等于上限可通过', (await api.PdfRead.parsePdf(two,{maxObjects:5})).paths.length, 1);
})());

/* 51. 布点优化：贪心覆盖最大化、增益递减、目标/台数上限 ---------------------- */
{
  api.resetState();
  api.state.objects.push(api.baseObject('rect','rect.area',{name:'A',x:0,y:0,width:100,height:100}));
  const opt=api.optimizeCameraPlacement(api.state,{phys:40,fov:360,targetRatio:.9,maxAdd:3,grid:8,targetCells:2500});
  eq('布点-初始覆盖率为0', opt.beforeRatio, 0);
  ok('布点-给出至少一台建议', opt.suggestions.length>=1);
  ok('布点-单台增益大于0', opt.suggestions[0].gain>0);
  ok('布点-不超过最大新增台数', opt.suggestions.length<=3);
  ok('布点-覆盖率单调不降', opt.suggestions.every((s,i)=>i===0||s.ratioAfter>=opt.suggestions[i-1].ratioAfter));
  ok('布点-最终覆盖率提升', opt.afterRatio>opt.beforeRatio);
  eq('布点-全向视场朝向为0', opt.suggestions[0].angle, 0);
  ok('布点-建议点位为有限坐标', Number.isFinite(opt.suggestions[0].x)&&Number.isFinite(opt.suggestions[0].y));

  const one=api.optimizeCameraPlacement(api.state,{phys:40,fov:360,targetRatio:.99,maxAdd:1,grid:6,targetCells:1500});
  eq('布点-最多新增1台生效', one.suggestions.length, 1);

  /* 已全覆盖：不再给建议且标记达标 */
  api.resetState();
  api.state.objects.push(
    api.baseObject('rect','rect.area',{name:'B',x:0,y:0,width:10,height:10}),
    api.baseObject('point','point.dome',{name:'D',x:5,y:5,phys:1000})
  );
  const full=api.optimizeCameraPlacement(api.state,{phys:40,fov:360,targetRatio:.9,maxAdd:3});
  eq('布点-已达标不再建议', full.suggestions.length, 0);
  eq('布点-已达标标记', full.reached, true);
  approx('布点-已全覆盖比例≈1', full.beforeRatio, 1, 1e-6);

  /* 扇形：朝向在 [0,360) 内 */
  const sec=api.optimizeCameraPlacement(api.state,{phys:60,fov:90,targetRatio:.5,maxAdd:1,grid:6,targetCells:1500});
  ok('布点-扇形朝向合法', sec.suggestions.length===0||(sec.suggestions[0].angle>=0&&sec.suggestions[0].angle<360));

  api.resetState();
  const none=api.optimizeCameraPlacement(api.state,{});
  eq('布点-无区域返回空结果', none.empty, true);
  eq('布点-无区域无建议', none.suggestions.length, 0);
}

/* 52. 设备台账扩展字段 + 零依赖二维码编码器 -------------------------------- */
{
  const q=api.Qr;
  eq('QR-矩阵尺寸29', q.SIZE, 29);
  eq('QR-最大载荷42字节', q.MAX_BYTES, 42);
  eq('QR-格式信息M掩码0=0x5412', q._internals.formatBits(0), 0x5412);
  const data=Array.from({length:44},(_,i)=>(i*7)&255);
  const ec=q._internals.rsEc(data);
  eq('QR-纠错码字26个', ec.length, 26);
  let synOk=true;
  for(let i=0;i<26;i++){
    let s=0;
    for(const b of data.concat(ec)) s=q._internals.gfMul(s,q._internals.EXP[i])^b;
    if(s!==0){ synOk=false; break; }
  }
  ok('QR-Reed-Solomon 26个综合式全为0', synOk);

  const r=q.encodeText('PLOTPIN:P0001');
  eq('QR-编码尺寸', r.size, 29);
  ok('QR-掩码在0..7', r.mask>=0&&r.mask<=7);
  const corner=(r0,c0)=>{ for(let i=0;i<7;i++){ if(!r.modules[r0][c0+i]||!r.modules[r0+6][c0+i]||!r.modules[r0+i][c0]||!r.modules[r0+i][c0+6]) return false; } return true; };
  ok('QR-左上定位图形', corner(0,0));
  ok('QR-右上定位图形', corner(0,22));
  ok('QR-左下定位图形', corner(22,0));
  ok('QR-定时图形交替', r.modules[6][8]===1&&r.modules[6][9]===0&&r.modules[8][6]===1&&r.modules[9][6]===0);
  ok('QR-固定暗模块为黑', r.modules[21][8]===1);
  let tooLong=false;
  try{ q.encodeText('x'.repeat(43)); }catch(e){ tooLong=/过长/.test(e.message); }
  ok('QR-超过42字节拒绝', tooLong);
  eq('QR-UTF8字节长度', q.byteLength('P0001'), 5);
  ok('QR-中文按UTF8多字节计', q.byteLength('设备')>2);

  /* 台账字段：props 写入 / 导出列 / 空单元格不覆盖 / 照片资产可达 */
  api.resetState();
  const pt=api.baseObject('point','point.marker',{name:'L1',x:1,y:2});
  api.state.objects=[pt];
  const baseRow=api.objectRows().find(x=>x['编号']==='L1');
  ok('台账-包含型号/安装高度/IP/责任人列', ['型号','安装高度','IP','责任人'].every(k=>Object.prototype.hasOwnProperty.call(baseRow,k)));
  api.applyLedgerCells(pt,col=>({型号:'CAM-2',安装高度:'3.5',IP:'10.0.0.8',责任人:'张三'}[col]??''));
  eq('台账-型号写入props', pt.props.model, 'CAM-2');
  eq('台账-安装高度数值化', pt.props.mountHeight, 3.5);
  eq('台账-IP写入props', pt.props.ip, '10.0.0.8');
  eq('台账-责任人写入props', pt.props.owner, '张三');
  const row2=api.objectRows().find(x=>x['编号']==='L1');
  eq('台账-导出型号', row2['型号'], 'CAM-2');
  eq('台账-导出安装高度', row2['安装高度'], 3.5);
  eq('台账-导出IP', row2['IP'], '10.0.0.8');
  api.applyLedgerCells(pt,()=> '');
  eq('台账-空单元格不覆盖既有值', pt.props.model, 'CAM-2');

  pt.props.photoId='bg_photo';
  ok('台账-照片资产纳入可达集合', api.reachableBgAssetIds().includes('bg_photo'));
  api.selectedIds.add(pt.id); api.renderProps();
  const panel=api.$('propPanel').innerHTML;
  ok('台账-面板含型号/IP/责任人输入', panel.includes('data-field="propModel"')&&panel.includes('data-field="propIp"')&&panel.includes('data-field="propOwner"'));
  ok('台账-面板含照片上传控件', panel.includes('data-photo-input'));
  api.resetState();
}

/* 53. 多楼层 / 多底图：数据切换、持久化裁剪、迁移与资产可达 ------------------ */
{
  const st=api.resetState();
  eq('楼层-默认一层', st.floors.length, 1);
  eq('楼层-默认活动层', st.activeFloorId, 'floor.default');
  eq('楼层-默认名称', api.currentFloorName(), '1F');

  st.objects.push(api.baseObject('point','point.marker',{name:'A',x:1,y:1}));
  api.syncActiveFloor();
  eq('楼层-同步对象到当前层条目', st.floors[0].objects.length, 1);
  eq('楼层-当前层对象计数', api.floorObjectCount(st.floors[0]), 1);

  const init=api.createInitialState();
  st.floors.push({id:'floor.F2',name:'2F',background:init.background,
    objects:[api.baseObject('point','point.marker',{name:'B',x:2,y:2})],viewport:{zoom:2,panX:10,panY:20}});
  ok('楼层-切换成功', api.switchFloorData('floor.F2'));
  eq('楼层-切换后活动层', st.activeFloorId, 'floor.F2');
  eq('楼层-切换后对象属于目标层', st.objects[0].name, 'B');
  eq('楼层-切换后名称', api.currentFloorName(), '2F');
  eq('楼层-切换后视口恢复', st.viewport.zoom, 2);
  ok('楼层-切回成功', api.switchFloorData('floor.default'));
  eq('楼层-切回对象完好', st.objects[0].name, 'A');
  eq('楼层-切回名称', api.currentFloorName(), '1F');
  ok('楼层-切到当前层返回false', !api.switchFloorData('floor.default'));
  ok('楼层-切到不存在层返回false', !api.switchFloorData('missing'));

  /* 持久化：当前层数据在顶层，楼层条目里不重复；非当前层保留完整数据 */
  api.syncActiveFloor();
  const snap=api.persistableState();
  const activeEntry=snap.floors.find(f=>f.id===snap.activeFloorId);
  ok('持久化-当前层条目不重复存数据', activeEntry&&activeEntry.background===undefined&&activeEntry.objects===undefined);
  const otherEntry=snap.floors.find(f=>f.id==='floor.F2');
  ok('持久化-非当前层保留对象', !!otherEntry&&Array.isArray(otherEntry.objects)&&otherEntry.objects.length===1);
  eq('持久化-顶层对象为当前层', snap.objects.length, 1);

  /* 迁移：多楼层工程；活动层取顶层，非活动层各自清洗 */
  const m=api.migrateProject({schema:'offline-drawing-annotation/v1',
    background:{kind:'rect',shape:{type:'rect',x:0,y:0,w:100,h:70}},
    objects:[{kind:'point',name:'A',x:1,y:1}],
    activeFloorId:'f2',
    floors:[
      {id:'f1',name:'1F',background:{kind:'circle',shape:{type:'circle',cx:0,cy:0,r:5}},objects:[{kind:'point',name:'B',x:2,y:2}]},
      {id:'f2',name:'2F'}
    ]});
  eq('迁移-楼层数', m.floors.length, 2);
  eq('迁移-活动层', m.activeFloorId, 'f2');
  eq('迁移-顶层对象属于活动层', m.objects[0].name, 'A');
  const f1=m.floors.find(f=>f.id==='f1');
  ok('迁移-非活动层保留对象', !!f1&&f1.objects[0].name==='B');
  eq('迁移-非活动层背景类型', f1&&f1.background.kind, 'circle');
  const legacy=api.migrateProject({schema:'offline-drawing-annotation/v1',objects:[]});
  eq('迁移-旧档补默认楼层', legacy.floors.length, 1);
  eq('迁移-旧档默认层名', legacy.floors[0].name, '1F');

  /* 资产可达：非当前楼层底图与照片都纳入保留集合（migrateProject 已替换全局 state） */
  api.state.floors.push({id:'floor.F3',name:'3F',background:{kind:'image',assetId:'bg_floor3',shape:{type:'rect',w:1,h:1}},
    objects:[{props:{photoId:'bg_photo3'}}]});
  const ids=api.reachableBgAssetIds();
  ok('楼层-可达集合含非当前层底图', ids.includes('bg_floor3'));
  ok('楼层-可达集合含非当前层照片', ids.includes('bg_photo3'));
  api.resetState();
}

/* 54. 方向约束（平行/垂直/等距/极轴）与临时参考线 ---------------------------- */
{
  const p=(wp,opt)=>api.directionalSnap([0,0],wp,opt);
  let r=p([10,0.5],{refDir:0});
  eq('约束-参考边平行模式', r.mode, 'parallel');
  approx('约束-平行投影Y=0', r.p[1], 0, 1e-9);
  approx('约束-平行投影X=10', r.p[0], 10, 1e-9);
  r=p([0.5,10],{refDir:0});
  eq('约束-参考边垂直模式', r.mode, 'perpendicular');
  approx('约束-垂直投影X=0', r.p[0], 0, 1e-9);
  approx('约束-垂直投影Y=10', r.p[1], 10, 1e-9);
  r=p([-10,0.1],{refDir:0});
  eq('约束-反向平行也吸附', r.mode, 'parallel');
  approx('约束-反向平行X=-10', r.p[0], -10, 1e-9);
  r=p([7,0.2],{prevDir:0,prevLen:5});
  eq('约束-等距模式', r.mode, 'equal');
  approx('约束-等距长度沿用上一段', Math.hypot(r.p[0],r.p[1]), 5, 1e-9);
  r=p([10,0.4],{polarStep:45});
  eq('约束-极轴模式', r.mode, 'polar');
  approx('约束-极轴吸附到0°', r.p[1], 0, 1e-9);
  r=p([10,10],{});
  eq('约束-超出容差不吸附', r.mode, 'none');
  r=p([0.1,10],{refDir:0,tolDeg:0.5});
  eq('约束-容差可配置', r.mode, 'none');
  r=p([0,10],{refDir:0,tolDeg:0.5});
  eq('约束-垂直在严格容差内吸附', r.mode, 'perpendicular');

  /* 临时参考线：添加/延展/参与捕捉/删除/清除 */
  api.clearGuideLines();
  ok('参考线-添加成功', api.addGuideLine([0,0],[0,10]));
  eq('参考线-列表1条', api.guideLineList().length, 1);
  ok('参考线-零长度拒绝', !api.addGuideLine([1,1],[1,1]));
  const ge=api.guideEdges();
  eq('参考线-生成1条捕捉边', ge.length, 1);
  ok('参考线-按无限长延展', Math.hypot(ge[0].b[0]-ge[0].a[0],ge[0].b[1]-ge[0].a[1])>1e5);

  api.resetState();
  api.state.objects.push(api.baseObject('line','line.custom',{points:[[0,0],[10,0]],x:0,y:0}));
  api.clearGuideLines(); api.addGuideLine([7,-5],[7,5]);
  const edges=api.collectSnapEdges(api.state,()=>true);
  ok('参考线-纳入捕捉边集合', edges.some(e=>e.guide));
  const hit=api.findOsnap(api.state,[7,0.2],1,new Set(),()=>true,null);
  ok('参考线-与对象边交点可捕捉', !!hit&&hit.type==='intersection'&&Math.hypot(hit.p[0]-7,hit.p[1])<1e-6);
  ok('参考线-删除上一条', !!api.removeLastGuideLine());
  eq('参考线-删除后为空', api.guideLineList().length, 0);

  /* 设置默认与迁移 */
  eq('设置-极轴追踪默认关', api.migrateProject({schema:'offline-drawing-annotation/v1'}).settings.polar, false);
  eq('设置-极轴步长默认45', api.migrateProject({schema:'offline-drawing-annotation/v1'}).settings.polarStep, 45);
  eq('设置-非法极轴步长回退45', api.migrateProject({schema:'offline-drawing-annotation/v1',settings:{polarStep:37}}).settings.polarStep, 45);
  eq('设置-合法极轴步长保留', api.migrateProject({schema:'offline-drawing-annotation/v1',settings:{polar:true,polarStep:15}}).settings.polarStep, 15);
  api.clearGuideLines();
  api.resetState();
}

/* 55. 行业图元库与自定义 SVG 导入 ------------------------------------------- */
{
  const lib=api.SYMBOL_LIBRARY;
  ok('图元库-数量≥60', lib.length>=60);
  eq('图元库-id唯一', new Set(lib.map(s=>s.id)).size, lib.length);
  eq('图元库-名称唯一', new Set(lib.map(s=>s.name)).size, lib.length);
  ok('图元库-每条都有路径', lib.every(s=>Array.isArray(s.paths)&&s.paths.length>0));
  ok('图元库-覆盖安防/弱电/停车/消防', ['安防','弱电','停车','消防'].every(cat=>lib.some(s=>s.cat===cat)));
  eq('图元库-全部注册为内置点类型', api.BUILTIN_TYPES.filter(t=>t.kind==='point'&&t.symbol&&t.symbol.length).length, lib.length);

  /* SVG 导入：path/circle/rect/polygon/line + viewBox + 安全与上限 */
  const parsed=api.parseSvgSymbol('<svg viewBox="0 0 48 32"><path d="M0 0L10 10" fill="none"/><circle cx="5" cy="6" r="2"/><rect x="1" y="2" width="3" height="4"/><polygon points="0,0 1,0 1,1"/><line x1="0" y1="0" x2="2" y2="2"/></svg>');
  eq('SVG导入-viewBox解析', parsed.vb, {x:0,y:0,w:48,h:32});
  eq('SVG导入-五类图元路径数', parsed.paths.length, 5);
  ok('SVG导入-圆形转路径', parsed.paths[1].d.includes('a2 2'));
  ok('SVG导入-矩形转路径', parsed.paths[2].d.includes('h3v4'));
  ok('SVG导入-多边形闭合', parsed.paths[3].d.endsWith('Z'));
  let err=null; try{ api.parseSvgSymbol('<svg></svg>'); }catch(e){ err=e; }
  ok('SVG导入-无图形拒绝', !!err&&/未找到/.test(err.message));
  err=null; try{ api.parseSvgSymbol('<svg><script>alert(1)</script><path d="M0 0L1 1"/></svg>'); }catch(e){ err=e; }
  ok('SVG导入-含脚本拒绝', !!err&&/脚本/.test(err.message));
  const many=Array.from({length:201},()=>'<path d="M0 0L1 1"/>').join('');
  err=null; try{ api.parseSvgSymbol('<svg>'+many+'</svg>'); }catch(e){ err=e; }
  ok('SVG导入-路径数上限200', !!err&&/最多 200/.test(err.message));

  /* 迁移保留自定义图元几何 */
  const m=api.migrateProject({schema:'offline-drawing-annotation/v1',
    objectTypes:[{id:'sym.test',kind:'point',name:'测试图元',color:'#123456',icon:'symbol',
      symbol:[{d:'M0 0L10 10',fill:false}],symbolViewBox:{x:0,y:0,w:48,h:32}}],objects:[]});
  const tt=m.objectTypes.find(t=>t.id==='sym.test');
  ok('图元-迁移保留路径', !!tt&&tt.symbol.length===1&&tt.symbol[0].d==='M0 0L10 10');
  eq('图元-迁移保留viewBox', tt&&tt.symbolViewBox.w, 48);

  /* 属性面板列出行业图元；SVG 导出使用同一路径；无 Path2D 环境降级不抛错 */
  api.resetState();
  const pt=api.baseObject('point',lib[0].id,{name:'SYM',x:1,y:1});
  api.state.objects=[pt]; api.selectedIds.add(pt.id); api.renderProps();
  ok('图元-属性面板类型下拉含行业图元', api.$('propPanel').innerHTML.includes('枪机摄像头'));
  const svg=api.buildSceneSvg();
  ok('图元-SVG导出包含图元路径', svg.includes('M3 9h11v6H3z')&&svg.includes('stroke-linecap="round"'));
  const rec=new Proxy({},{get(t,p){
    if(p==='then') return undefined;
    if(p==='measureText') return ()=>({width:10});
    if(p==='canvas') return {clientWidth:900,clientHeight:600};
    if(p in t) return t[p];
    return ()=>{};
  },set(t,p,v){ t[p]=v; return true; }});
  let threw=false; try{ api.drawObject(rec,pt,{zoom:1},p=>p,1,1); }catch(e){ threw=true; }
  ok('图元-无Path2D环境降级不抛错', !threw);
  api.resetState();
}

/* 56. 单文件发行包：内联、去外链、图标 data URI、真实入口构建 --------------- */
{
  const sample='<html><head><link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon.svg" type="image/svg+xml"><link rel="stylesheet" href="a.css"></head><body><script src="a.js"></script><script src="b.js"></script></body></html>';
  const files={'a.css':'body{color:red}','a.js':'console.log("a")','b.js':'const x="</script>";','icon.svg':'<svg/>','manifest.webmanifest':'{}'};
  const out=buildStandalone(sample,p=>files[p]);
  ok('打包-样式内联', out.includes('<style>')&&out.includes('body{color:red}'));
  ok('打包-脚本顺序保留', out.indexOf('/* a.js */')<out.indexOf('/* b.js */'));
  ok('打包-无脚本外链', !/<script\s+src=/.test(out));
  ok('打包-manifest移除', !out.includes('manifest.webmanifest'));
  ok('打包-图标转dataURI', out.includes('data:image/svg+xml;base64,'));
  ok('打包-转义script闭合', out.includes('<\\/script'));

  const real=buildStandalone(readFileSync(join(root,'index.html'),'utf8'),p=>readFileSync(join(root,p),'utf8'));
  ok('打包-真实入口无外链脚本', !/<script\s+src=/.test(real));
  ok('打包-真实入口无外链样式', !/<link\s+rel="stylesheet"/.test(real));
  ok('打包-真实入口无manifest', !/rel="manifest"/.test(real));
  ok('打包-真实入口包含核心脚本', real.includes('buildSceneSvg')&&real.includes('openFloorManager'));
  ok('打包-体积合理(>100KB)', real.length>100000);
}

/* 57. 插件注册点：导出器 / 导入器注册、校验、查找与注销 -------------------- */
{
  const PP=api.PlotPin;
  ok('插件-暴露全局 API 与版本', !!PP&&typeof PP.version==='string'&&PP.version.length>0);
  eq('插件-初始无导出器', PP.listExporters().length, 0);
  ok('插件-注册导出器', PP.registerExporter({id:'demo',label:'演示导出',ext:'.txt',mime:'text/plain',run(){}}));
  eq('插件-导出器列表', PP.listExporters()[0].label, '演示导出');
  eq('插件-导出扩展名规范化', PP.listExporters()[0].ext, 'txt');
  ok('插件-按 id 查找导出器', !!PP.findExporter('demo'));
  let e1=null; try{ PP.registerExporter({id:'demo',run(){}}); }catch(e){ e1=e; }
  ok('插件-重复 id 拒绝', !!e1&&/已存在/.test(e1.message));
  let e2=null; try{ PP.registerExporter({id:'x'}); }catch(e){ e2=e; }
  ok('插件-缺少 run 拒绝', !!e2&&/run/.test(e2.message));

  ok('插件-注册导入器', PP.registerImporter({ext:'.foo',label:'FOO',run(){}}));
  ok('插件-按扩展名查找(大小写不敏感)', !!PP.findImporter('FOO'));
  eq('插件-导入器扩展名规范化', PP.listImporters()[0].ext, 'foo');
  let e3=null; try{ PP.registerImporter({ext:'foo',run(){}}); }catch(e){ e3=e; }
  ok('插件-重复扩展名拒绝', !!e3&&/已存在/.test(e3.message));

  ok('插件-注销导出器', PP.unregisterExporter('demo'));
  eq('插件-导出器注销后为空', PP.listExporters().length, 0);
  ok('插件-注销导入器', PP.unregisterImporter('FOO'));
  eq('插件-导入器注销后为空', PP.listImporters().length, 0);

  /* 自定义设备类型注册（P2-3 插件化补齐） */
  const typeBase=api.BUILTIN_TYPES.length;
  eq('插件-初始无插件类型', PP.listPluginTypes().length, 0);
  ok('插件-注册自定义设备类型', PP.registerObjectType({
    id:'plugin.ptz', kind:'point', name:'全景相机', color:'#0ea5e9', icon:'custom',
    scaleShape:'sector', fov:360, iconSize:1.5,
    symbol:[{d:'M0 0h24v24H0z', fill:false}], symbolViewBox:{x:0,y:0,w:24,h:24},
    defaultStyle:{fillAlpha:.2,strokeWidth:.08}
  }));
  const pt=PP.listPluginTypes()[0];
  eq('插件-类型写入内置表', api.BUILTIN_TYPES.filter(t=>t.id==='plugin.ptz').length, 1);
  eq('插件-类型写入当前工程', api.state.objectTypes.filter(t=>t.id==='plugin.ptz').length, 1);
  ok('插件-类型标记为非内置', pt&&pt.builtin===false&&pt.plugin===true);
  eq('插件-扇形视场规范化', pt.fov, 360);
  eq('插件-图元路径保留', pt.symbol.length, 1);
  eq('插件-图元 viewBox 保留', pt.symbolViewBox.w, 24);
  approx('插件-默认样式填充', pt.defaultStyle.fillAlpha, .2, 1e-9);
  ok('插件-新工程自带插件类型', api.createInitialState().objectTypes.some(t=>t.id==='plugin.ptz'));
  const withPlugin=api.migrateProject({schema:'offline-drawing-annotation/v1'});
  ok('插件-载入工程自带插件类型', withPlugin.objectTypes.some(t=>t.id==='plugin.ptz'));
  api.resetState();

  const throws=f=>{ try{ f(); return false; }catch(e){ return true; } };
  ok('插件-拒绝缺少 kind', throws(()=>PP.registerObjectType({id:'plugin.bad1',name:'X'})));
  ok('插件-拒绝非法类型 id', throws(()=>PP.registerObjectType({id:'bad id!',kind:'point',name:'X'})));
  ok('插件-拒绝非法 scaleShape', throws(()=>PP.registerObjectType({id:'plugin.bad2',kind:'point',name:'X',scaleShape:'cone'})));
  ok('插件-拒绝非法 fov', throws(()=>PP.registerObjectType({id:'plugin.bad3',kind:'point',name:'X',scaleShape:'sector',fov:5})));
  ok('插件-拒绝超量图元路径', throws(()=>PP.registerObjectType({id:'plugin.bad4',kind:'point',name:'X',symbol:Array.from({length:201},()=>({d:'M0 0'}))})));
  ok('插件-拒绝重复类型 id', throws(()=>PP.registerObjectType({id:'plugin.ptz',kind:'point',name:'重复'})));

  ok('插件-注册自定义区域类型', PP.registerObjectType({id:'plugin.zone',kind:'rect',name:'警戒区域',color:'#f97316'}));
  const zt=PP.listPluginTypes().find(t=>t.id==='plugin.zone');
  ok('插件-区域类型带默认样式', !!zt&&zt.defaultStyle.fillAlpha===.15&&zt.defaultStyle.strokeWidth===.1);
  ok('插件-区域类型进入当前工程', api.state.objectTypes.some(t=>t.id==='plugin.zone'));

  api.resetState();
  ok('插件-可读取实时工程状态', PP.state===api.state);
  let exportCtx=null;
  PP.registerExporter({id:'ctx',label:'上下文',ext:'txt',run(ctx){ exportCtx=ctx; }});
  api.exportViaPlugin('ctx');
  ok('插件-导出上下文有状态快照', !!exportCtx&&Array.isArray(exportCtx.state.objects));
  ok('插件-导出上下文有实时状态', !!exportCtx&&exportCtx.liveState===api.state);
  eq('插件-导出上下文工程名', exportCtx&&exportCtx.projectName, api.state.meta.name);
  PP.unregisterExporter('ctx');
  let importCtx=null;
  PP.registerImporter({ext:'ctx',label:'CTX',run(ctx){ importCtx=ctx; }});
  api.importViaPlugin(PP.findImporter('CTX'),{name:'x.ctx'});
  ok('插件-导入上下文含实时状态', !!importCtx&&importCtx.state===api.state);
  ok('插件-导入上下文含提交函数', !!importCtx&&typeof importCtx.commitChange==='function');
  PP.unregisterImporter('ctx');

  api.resetState();
  api.state.objects=[api.baseObject('point','plugin.ptz',{name:'P',x:1,y:1})];
  ok('插件-使用中的类型拒绝注销', !PP.unregisterObjectType('plugin.ptz'));
  ok('插件-使用中的类型仍保留', api.state.objectTypes.some(t=>t.id==='plugin.ptz'));
  api.resetState();
  ok('插件-未使用时可注销类型', PP.unregisterObjectType('plugin.ptz'));
  eq('插件-注销后内置表移除', api.BUILTIN_TYPES.filter(t=>t.id==='plugin.ptz').length, 0);
  eq('插件-注销后当前工程移除', api.state.objectTypes.filter(t=>t.id==='plugin.ptz').length, 0);
  ok('插件-内置类型不可注销', !PP.unregisterObjectType('point.marker'));
  ok('插件-注销第二个插件类型', PP.unregisterObjectType('plugin.zone'));
  eq('插件-内置类型表恢复原长度', api.BUILTIN_TYPES.length, typeBase);
  eq('插件-插件类型表清空', PP.listPluginTypes().length, 0);
  api.resetState();
}

/* 58. 中英界面切换与无障碍标记 --------------------------------------------- */
{
  const I=api.I18N;
  eq('i18n-默认中文', I.lang, 'zh');
  eq('i18n-中文文案', I.t('new'), '新建');
  eq('i18n-切换英文', I.setLang('en'), 'en');
  eq('i18n-英文文案', I.t('new'), 'New');
  eq('i18n-未知键回退键名', I.t('__missing__'), '__missing__');
  eq('i18n-非法语言回退中文', I.setLang('fr'), 'zh');
  ok('i18n-中英键集合一致', Object.keys(I.dict.zh).sort().join(',')===Object.keys(I.dict.en).sort().join(','));
  ok('i18n-关键键英文齐全', ['new','projects','floors','import','export','settings','select','guide','exportLabels'].every(k=>I.dict.en[k]));
  let applyOk=true; try{ I.apply(); }catch(e){ applyOk=false; }
  ok('i18n-apply在最小DOM下不抛错', applyOk);

  eq('i18n-迁移默认中文', api.migrateProject({schema:'offline-drawing-annotation/v1'}).settings.lang, 'zh');
  eq('i18n-迁移保留英文', api.migrateProject({schema:'offline-drawing-annotation/v1',settings:{lang:'en'}}).settings.lang, 'en');
  eq('i18n-迁移非法语言回退中文', api.migrateProject({schema:'offline-drawing-annotation/v1',settings:{lang:'fr'}}).settings.lang, 'zh');

  ok('无障碍-画布 role=application', /<canvas[^>]*role="application"/.test(html));
  ok('无障碍-工具栏 role=toolbar', /role="toolbar"/.test(html));
  ok('无障碍-页签 role=tablist', /role="tablist"/.test(html));
  ok('无障碍-toast aria-live', /aria-live="polite"/.test(html));
  ok('i18n-入口 data-i18n 标记≥20', (html.match(/data-i18n="/g)||[]).length>=20);
  ok('i18n-入口 ARIA 翻译标记≥5', (html.match(/data-i18n-aria-label="/g)||[]).length>=5);
  ok('i18n-入口占位符翻译标记≥2', (html.match(/data-i18n-placeholder="/g)||[]).length>=2);
  ok('i18n-新增 ARIA 文案中文', I.dict.zh.ariaTools === '绘图工具' && I.dict.zh.ariaCanvas.includes('绘图画布'));
  ok('i18n-新增 ARIA 文案英文', I.dict.en.ariaTools === 'Drawing tools' && I.dict.en.ariaExport === 'Choose export format');
  ok('i18n-顶栏功能按钮中英齐全', ['baseSite','scaleBtn','affineBtn','coverageBtn','panelToggle','fitBtn'].every(k => I.dict.zh[k] && I.dict.en[k]));
  ok('i18n-类型面板选项中英齐全', ['iconCamera','scaleNone','scaleSector','typeNamePlaceholder'].every(k => I.dict.zh[k] && I.dict.en[k]));
  ok('i18n-入口顶栏按钮已标记翻译', /id="bgBtn"[^>]*data-i18n="baseSite"/.test(html) && /id="coverageBtn"[^>]*data-i18n="coverageBtn"/.test(html));
  ok('i18n-入口类型形状选项已标记翻译', /value="sector"[^>]*data-i18n="scaleSector"/.test(html));
  ok('i18n-通用按钮中英齐全', ['cancel','ok','close','save'].every(k => I.dict.zh[k] && I.dict.en[k]));
  ok('i18n-设置面板标签中英齐全', ['settingsTitle','projectName','gridSpacing','languageLabel','runtimeSetting'].every(k => I.dict.zh[k] && I.dict.en[k]));
  eq('i18n-英文确定按钮', I.setLang('en') && I.t('ok'), 'OK');
  I.setLang('zh');
  eq('i18n-中文取消按钮', I.t('cancel'), '取消');

  /* 动态业务文案：中文原文键 + 英文短语表 */
  ok('i18n-动态短语表规模', Object.keys(I.phrases).length >= 180);
  ok('i18n-动态短语英文无中文残留', Object.values(I.phrases).every(v => typeof v === 'string' && !/[\u4e00-\u9fff]/.test(v)));
  I.setLang('en');
  eq('i18n-动态词组宽度', I.p('宽度'), 'Width');
  eq('i18n-动态词组关闭', I.p('关闭'), 'Close');
  eq('i18n-动态词组未收录回退原文', I.p('__未收录词组__'), '__未收录词组__');
  eq('i18n-动态模板粘贴', I.p('已粘贴 3 个对象'), 'Pasted 3 objects');
  eq('i18n-动态模板表格导入', I.p('表格导入完成：更新 2 项，新增 1 项'), 'Table import complete: 2 updated, 1 created');
  eq('i18n-捕捉类型英文', I.p('端点') + ' / ' + I.p('切点'), 'endpoint / tangent');
  eq('i18n-捕捉提示英文', I.p('捕捉：自动（全部类型）'), 'Snap: Auto (all types)');
  api.resetState();
  const rectForI18n=api.baseObject('rect','rect.area',{x:1,y:2,width:10,height:5});
  api.state.objects=[rectForI18n]; api.selectedIds.add(rectForI18n.id); api.renderProps();
  const propEn=api.$('propPanel').innerHTML;
  ok('i18n-英文属性面板标题', propEn.includes('Object properties'));
  ok('i18n-英文属性面板字段', propEn.includes('Width') && propEn.includes('Height') && propEn.includes('Shape'));
  ok('i18n-英文属性面板无核心中文', !propEn.includes('对象属性') && !propEn.includes('宽度') && !propEn.includes('填充色'));
  const pointForI18n=api.baseObject('point','point.marker',{x:1,y:2});
  api.state.objects=[pointForI18n]; api.selectedIds.clear(); api.selectedIds.add(pointForI18n.id); api.renderProps();
  const pointEn=api.$('propPanel').innerHTML;
  ok('i18n-英文点设备面板', pointEn.includes('Object properties') && pointEn.includes('Heading') && pointEn.includes('Model') && pointEn.includes('Owner') && pointEn.includes('Custom properties'));
  ok('i18n-英文点设备面板无核心中文', !pointEn.includes('对象属性') && !pointEn.includes('朝向角') && !pointEn.includes('责任人'));
  ok('i18n-内置类型名英文显示', api.typeDisplayName(api.state.objectTypes.find(t=>t.id==='point.camera')) === 'Camera' || api.typeDisplayName(api.state.objectTypes.find(t=>t.id==='point.marker')) === 'Generic marker');
  const savedBuiltin=Object.assign({},api.state.objectTypes.find(t=>t.id==='point.camera'),{builtin:false});
  eq('i18n-载入后内置类型仍按英文显示', api.typeDisplayName(savedBuiltin), 'Camera');
  eq('i18n-用户自定义同名类型保持原名', api.typeDisplayName({id:'custom.mine',kind:'point',name:'摄像头',builtin:false}), '摄像头');
  /* 下拉框直接用 typeDisplayName，避免载入工程 builtin:false 时回退中文 */
  api.state.objectTypes=[savedBuiltin,{id:'point.marker',kind:'point',name:'通用标记',builtin:false}];
  api.populateSelects();
  const opts=api.$('pointType').innerHTML;
  ok('i18n-点类型下拉英文', opts.includes('Camera') && opts.includes('Generic marker') && !opts.includes('摄像头'));
  const siteEn=api.sitePropsHTML(api.state.background,'default');
  ok('i18n-英文场地面板', siteEn.includes('Site properties') && siteEn.includes('Area') && siteEn.includes('Perimeter') && siteEn.includes('Width (m)') && siteEn.includes('Height (m)'));
  api.renderStats();
  const statsEn=api.$('statsPanel').innerHTML;
  ok('i18n-英文统计面板', statsEn.includes('Project info') && statsEn.includes('Geometry check') && statsEn.includes('Local storage'));
  I.setLang('zh');
  api.resetState();

  /* 模态框语义：dialog + aria-modal + 标题关联 + Tab 焦点容器 */
  ok('无障碍-模态框 role=dialog', /id="modalBox"[^>]*role="dialog"/.test(html));
  ok('无障碍-模态框 aria-modal', /id="modalBox"[^>]*aria-modal="true"/.test(html));
  ok('无障碍-模态框标题关联', /id="modalBox"[^>]*aria-labelledby="modalTitle"/.test(html));
  ok('无障碍-模态框可编程聚焦', /id="modalBox"[^>]*tabindex="-1"/.test(html));

  /* ARIA tablist：每个页签有关联面板，每个面板有标签来源 */
  const tabBtns=[...html.matchAll(/<button[^>]*class="side-tab[^"]*"[^>]*>/g)].map(m=>m[0]);
  eq('无障碍-页签按钮数', tabBtns.length, 4);
  ok('无障碍-页签均有 aria-controls', tabBtns.every(s=>/aria-controls="tab-/.test(s)));
  ok('无障碍-页签均有 roving tabindex', tabBtns.every(s=>/tabindex="(?:0|-1)"/.test(s)));
  const tabPanels=[...html.matchAll(/<section[^>]*class="tab-pane[^"]*"[^>]*>/g)].map(m=>m[0]);
  eq('无障碍-页签面板数', tabPanels.length, 4);
  ok('无障碍-面板均为 tabpanel', tabPanels.every(s=>/role="tabpanel"/.test(s)));
  ok('无障碍-面板均有 aria-labelledby', tabPanels.every(s=>/aria-labelledby="tabBtn-/.test(s)));

  eq('页签键盘-右移', api.tabTargetIndex(0,4,'ArrowRight'), 1);
  eq('页签键盘-右移循环', api.tabTargetIndex(3,4,'ArrowRight'), 0);
  eq('页签键盘-左移循环', api.tabTargetIndex(0,4,'ArrowLeft'), 3);
  eq('页签键盘-Home', api.tabTargetIndex(2,4,'Home'), 0);
  eq('页签键盘-End', api.tabTargetIndex(1,4,'End'), 3);
  eq('页签键盘-非导航键', api.tabTargetIndex(1,4,'Enter'), -1);
  eq('页签键盘-无页签', api.tabTargetIndex(-1,0,'ArrowRight'), -1);

  /* 画布快捷键只在画布/文档体聚焦时生效，避免劫持按钮与表单 */
  eq('键盘策略-空标签视为画布', api.isCanvasShortcutTarget(''), true);
  eq('键盘策略-canvas', api.isCanvasShortcutTarget('canvas'), true);
  eq('键盘策略-body', api.isCanvasShortcutTarget('body'), true);
  eq('键盘策略-input 不劫持', api.isCanvasShortcutTarget('input'), false);
  eq('键盘策略-button 不劫持', api.isCanvasShortcutTarget('button'), false);
  eq('键盘策略-select 不劫持', api.isCanvasShortcutTarget('select'), false);

  /* 弹窗键盘策略：Escape 返回已处理且不抛错（DOM 桩环境） */
  let modalEsc=false;
  try{ modalEsc=api.modalKeydown({key:'Escape',preventDefault(){}}); }catch(e){ modalEsc=false; }
  ok('弹窗键盘-Escape 可关闭', modalEsc === true);
  I.setLang('zh');
}

/* 59. 离线协作：工程级 LWW 合并与删除墓碑 -------------------------------- */
{
  const T1 = '2026-10-01T01:00:00.000Z';
  const T2 = '2026-10-01T02:00:00.000Z';
  const T3 = '2026-10-01T03:00:00.000Z';
  const P = (objects, extra = {}) => Object.assign({
    schema: 'offline-drawing-annotation/v1',
    meta: { name: '本地工程', projectId: 'PRJ_LOCAL', createdAt: T1, updatedAt: T1 },
    settings: { unit: 'm', snap: true },
    background: { kind: 'rect', shape: { type: 'rect', w: 10, h: 10 } },
    viewport: { zoom: 1, panX: 0, panY: 0 },
    layers: [{ id: 'layer.default', name: '默认图层', visible: true, locked: false }],
    objectTypes: [{ id: 'custom.type', kind: 'point', name: '本地类型', color: '#123456', icon: 'custom' }],
    objects,
    floors: [{ id: 'floor.default', name: '1F' }],
    activeFloorId: 'floor.default',
    tombstones: []
  }, extra);
  const O = (id, ts, x = 1) => ({
    id, name: String(id), kind: 'point', typeId: 'point.marker', layerId: 'layer.default',
    x, y: 0, updatedAt: ts, createdAt: ts, style: {}, props: {}, visible: true, locked: false, z: 0
  });
  const M = (a, b) => api.mergeProjectData(a, b);
  const ids = p => (p.objects || []).map(o => o.id).join(',');
  const zero = { added: 0, updated: 0, deleted: 0, conflicts: 0, floorsAdded: 0 };

  const m1 = M(P([]), P([O('A', T1)]));
  eq('合并-新增对象数量', m1.project.objects.length, 1);
  eq('合并-新增统计', m1.stats.added, 1);
  eq('合并-新增顺序', ids(m1.project), 'A');
  eq('合并-新增不记更新', m1.stats.updated, 0);

  const m2 = M(P([O('A', T1)]), P([]));
  eq('合并-仅本地对象保留', ids(m2.project), 'A');
  eq('合并-仅本地无新增统计', m2.stats.added, 0);

  const m3 = M(P([O('A', T1, 1)]), P([O('A', T2, 2)]));
  eq('合并-较新编辑胜出', m3.project.objects[0].x, 2);
  eq('合并-更新统计', m3.stats.updated, 1);
  eq('合并-冲突统计', m3.stats.conflicts, 1);
  eq('合并-删除统计为零', m3.stats.deleted, 0);

  const m4 = M(P([O('A', T2, 2)]), P([O('A', T1, 1)]));
  eq('合并-旧版本不覆盖新版本', m4.project.objects[0].x, 2);
  eq('合并-本地胜出不计更新', m4.stats.updated, 0);
  eq('合并-仍计一次冲突', m4.stats.conflicts, 1);

  const m5 = M(P([O('A', T1, 1)]), P([O('A', T1, 1)]));
  eq('合并-相同内容零统计', m5.stats, zero);
  eq('合并-相同内容保留对象', ids(m5.project), 'A');
  const m5z = M(P([O('A', T1, 1)]), P([Object.assign(O('A', T1, 1), { z: 5 })]));
  eq('合并-仅叠放顺序不同不算冲突', m5z.stats.conflicts, 0);
  eq('合并-仅叠放顺序不同保留本地', m5z.project.objects[0].z, 0);

  const m6 = M(P([O('A', T1, 1)]), P([O('A', T1, 2)]));
  const m6r = M(P([O('A', T1, 2)]), P([O('A', T1, 1)]));
  eq('合并-同时间戳字典序兜底', m6.project.objects[0].x, 2);
  eq('合并-同时间戳双向一致', m6r.project.objects[0].x, 2);
  eq('合并-同时间戳记更新', m6.stats.updated, 1);

  const m7 = M(P([O('A', T1)]), P([], { tombstones: [{ id: 'A', deletedAt: T2, kind: 'object' }] }));
  eq('合并-删除墓碑胜过旧对象', m7.project.objects.length, 0);
  eq('合并-删除统计', m7.stats.deleted, 1);
  eq('合并-删除不记冲突', m7.stats.conflicts, 0);

  const m8 = M(P([], { tombstones: [{ id: 'A', deletedAt: T2, kind: 'object' }] }), P([O('A', T1)]));
  eq('合并-入站旧对象被本地墓碑压制', m8.project.objects.length, 0);
  eq('合并-入站压制不计新增', m8.stats.added, 0);

  const m9 = M(P([O('A', T2)]), P([], { tombstones: [{ id: 'A', deletedAt: T1, kind: 'object' }] }));
  eq('合并-较新编辑可复活对象', ids(m9.project), 'A');
  ok('合并-复活后清理过期墓碑', !(m9.project.tombstones || []).some(t => t.id === 'A'));

  const m10 = M(P([O('A', T1)]), P([], { tombstones: [{ id: 'A', deletedAt: T2, kind: 'object' }] }));
  ok('合并-删除墓碑写入结果', (m10.project.tombstones || []).some(t => t.id === 'A' && t.kind === 'object'));

  const srcA = P([O('A', T1)]);
  const srcB = P([O('A', T2, 5), O('B', T2)]);
  const m11 = M(srcA, srcB);
  const m11b = M(m11.project, srcB);
  eq('合并-幂等统计归零', m11b.stats, zero);
  eq('合并-幂等工程一致', JSON.stringify(m11b.project), JSON.stringify(m11.project));
  eq('合并-重复合并顺序不变', ids(m11.project), 'A,B');

  const d1 = M(P([O('A', T1)]), P([O('A', T2, 9), O('B', T2)]));
  const d2 = M(P([O('A', T1)]), P([O('A', T2, 9), O('B', T2)]));
  eq('合并-确定性输出一致', JSON.stringify(d1.project), JSON.stringify(d2.project));
  const dRev = M(P([O('A', T2, 9), O('B', T2)]), P([O('A', T1)]));
  eq('合并-双向对象内容一致', JSON.stringify(dRev.project.objects), JSON.stringify(d1.project.objects));

  const fB = P([], {
    floors: [
      { id: 'floor.default', name: '1F' },
      { id: 'floor.F2', name: '2F', background: { kind: 'circle', shape: { type: 'circle', cx: 0, cy: 0, r: 3 } }, viewport: { zoom: 2, panX: 1, panY: 2 }, objects: [O('F2OBJ', T1)] }
    ]
  });
  const mf = M(P([]), fB);
  eq('合并-新增楼层数量', mf.project.floors.length, 2);
  eq('合并-新增楼层统计', mf.stats.floorsAdded, 1);
  eq('合并-新增楼层对象统计', mf.stats.added, 1);
  eq('合并-新楼层对象随楼层保存', mf.project.floors[1].objects.length, 1);
  eq('合并-新楼层底图保留', mf.project.floors[1].background.kind, 'circle');

  const fMetaA = P([], {
    floors: [
      { id: 'floor.default', name: '1F' },
      { id: 'floor.F2', name: '二层', updatedAt: T1, background: { kind: 'circle', shape: { type: 'circle', cx: 0, cy: 0, r: 1 } }, objects: [] }
    ]
  });
  const fMetaB = P([], {
    floors: [
      { id: 'floor.default', name: '1F' },
      { id: 'floor.F2', name: '二号层', updatedAt: T2, background: { kind: 'polygon', shape: { type: 'polygon', points: [[0, 0], [1, 0], [0, 1]] } }, objects: [] }
    ]
  });
  const mf2 = M(fMetaA, fMetaB);
  eq('合并-楼层名称较新者胜', mf2.project.floors[1].name, '二号层');
  eq('合并-楼层底图随较新者', mf2.project.floors[1].background.kind, 'polygon');
  eq('合并-既有楼层不计新增', mf2.stats.floorsAdded, 0);

  const fObjA = P([], { floors: [{ id: 'floor.default', name: '1F' }, { id: 'floor.F2', name: '2F', objects: [O('X1', T1)] }] });
  const fObjB = P([], { floors: [{ id: 'floor.default', name: '1F' }, { id: 'floor.F2', name: '2F', objects: [O('X2', T2)] }] });
  const mf3 = M(fObjA, fObjB);
  eq('合并-楼层内对象并集', mf3.project.floors[1].objects.map(o => o.id).join(','), 'X1,X2');

  const fDelA = P([], {
    floors: [
      { id: 'floor.default', name: '1F' },
      { id: 'floor.F2', name: '2F', objects: [O('X1', T1), O('X2', T1)] }
    ]
  });
  const fDelB = P([], { tombstones: [{ id: 'floor.F2', deletedAt: T2, kind: 'floor' }] });
  const mf4 = M(fDelA, fDelB);
  eq('合并-楼层墓碑删除整层', mf4.project.floors.length, 1);
  eq('合并-楼层删除统计对象数', mf4.stats.deleted, 2);
  ok('合并-楼层墓碑写入结果', (mf4.project.tombstones || []).some(t => t.id === 'floor.F2' && t.kind === 'floor'));

  const fRevA = P([], { floors: [{ id: 'floor.default', name: '1F' }, { id: 'floor.F2', name: '2F', objects: [O('X1', T3)] }] });
  const fRevB = P([], { tombstones: [{ id: 'floor.F2', deletedAt: T2, kind: 'floor' }] });
  const mf5 = M(fRevA, fRevB);
  eq('合并-较新楼层编辑胜过删除', mf5.project.floors.length, 2);
  ok('合并-楼层复活后清理过期墓碑', !(mf5.project.tombstones || []).some(t => t.id === 'floor.F2'));

  const fNewB = P([], {
    floors: [
      { id: 'floor.default', name: '1F' },
      { id: 'floor.F3', name: '3F', background: { kind: 'rect', shape: { type: 'rect', w: 5, h: 5 } }, objects: [O('X3', T1)] }
    ],
    tombstones: [{ id: 'floor.F3', deletedAt: T2, kind: 'floor' }]
  });
  const mf6 = M(P([]), fNewB);
  eq('合并-入站楼层先删后不新增', mf6.project.floors.length, 1);
  eq('合并-被墓碑楼层不计新增', mf6.stats.floorsAdded, 0);
  eq('合并-被墓碑楼层对象不计新增', mf6.stats.added, 0);

  const actA = P([O('A', T1)], {
    floors: [{ id: 'floor.default', name: '1F' }, { id: 'floor.F2', name: '2F', objects: [] }],
    activeFloorId: 'floor.F2'
  });
  const actB = P([O('B', T2)], {
    floors: [{ id: 'floor.default', name: '1F' }, { id: 'floor.F2', name: '2F', objects: [] }],
    activeFloorId: 'floor.F2'
  });
  const ma = M(actA, actB);
  eq('合并-本地活动楼层保留', ma.project.activeFloorId, 'floor.F2');
  eq('合并-活动楼层对象进入顶层', ids(ma.project), 'A,B');
  eq('合并-活动楼层顶层底图来自本地', ma.project.background.kind, 'rect');
  eq('合并-非活动楼层仅存元数据', ma.project.floors[1].objects, undefined);

  const actDelB = P([], { tombstones: [{ id: 'floor.F2', deletedAt: T2, kind: 'floor' }] });
  const ma2 = M(actA, actDelB);
  eq('合并-活动楼层被删回退首层', ma2.project.activeFloorId, 'floor.default');
  eq('合并-活动楼层删除统计', ma2.stats.deleted, 1);

  const ord = M(P([O('A1', T1), O('A2', T1)]), P([O('A2', T2, 9), O('B3', T2)]));
  eq('合并-本地对象顺序在前', ids(ord.project), 'A1,A2,B3');
  eq('合并-z按顺序重排', ord.project.objects.map(o => o.z), [0, 1, 2]);
  eq('合并-更新对象位置保留', ord.project.objects[1].x, 9);

  const layA = P([], { layers: [{ id: 'layer.default', name: '默认图层' }, { id: 'layerA', name: 'A层' }] });
  const layB = P([], { layers: [{ id: 'layer.default', name: '默认图层' }, { id: 'layerA', name: 'B层' }, { id: 'layerC', name: 'C层' }] });
  const ml = M(layA, layB);
  eq('合并-图层并集数量', ml.project.layers.length, 3);
  eq('合并-同 id 图层本地优先', ml.project.layers.find(l => l.id === 'layerA').name, 'A层');
  ok('合并-新图层追加', ml.project.layers.some(l => l.id === 'layerC'));

  const typA = P([], { objectTypes: [{ id: 'custom.type', kind: 'point', name: '本地类型' }] });
  const typB = P([], { objectTypes: [{ id: 'custom.type', kind: 'point', name: '他人类型' }, { id: 'other.type', kind: 'line', name: '新增类型' }] });
  const mt = M(typA, typB);
  eq('合并-类型并集数量', mt.project.objectTypes.length, 2);
  eq('合并-同 id 类型本地优先', mt.project.objectTypes.find(t => t.id === 'custom.type').name, '本地类型');
  ok('合并-新类型追加', mt.project.objectTypes.some(t => t.id === 'other.type'));

  const metaA = P([], { meta: { name: '本地工程', projectId: 'PRJ_LOCAL', updatedAt: T2 }, settings: { unit: 'm', gridSize: 2 } });
  const metaB = P([], { meta: { name: '他人工程', projectId: 'PRJ_OTHER', updatedAt: T1 }, settings: { unit: 'm', gridSize: 9 } });
  const mm2 = M(metaA, metaB);
  eq('合并-工程名保留本地', mm2.project.meta.name, '本地工程');
  eq('合并-工程绑定保留本地', mm2.project.meta.projectId, 'PRJ_LOCAL');
  eq('合并-工程更新时间取较新', mm2.project.meta.updatedAt, T2);
  eq('合并-设置保留本地', mm2.project.settings.gridSize, 2);

  const mEmpty = M(P([]), P([], { tombstones: [{ id: 'floor.default', deletedAt: T2, kind: 'floor' }] }));
  eq('合并-至少保留一个楼层', mEmpty.project.floors.length, 1);
  eq('合并-回退楼层为默认层', mEmpty.project.activeFloorId, 'floor.default');

  const mBad = M({ objects: 'x', floors: [null, {}, { id: 'f', objects: [null, { foo: 1 }] }], tombstones: 'bad' }, null);
  eq('合并-非法对象数组忽略', mBad.project.objects.length, 0);
  eq('合并-非法楼层数据仍可合并', mBad.project.floors.length >= 1, true);
  const mNull = M(null, null);
  eq('合并-空输入不抛错且保留一层', mNull.project.floors.length, 1);

  const mNum = M(P([O(123, T1)]), P([]));
  eq('合并-数字 id 归一为字符串', String(mNum.project.objects[0].id), '123');

  const mTombOrder = M(P([], { tombstones: [{ id: 'Z', deletedAt: T1, kind: 'object' }, { id: 'A', deletedAt: T1, kind: 'object' }] }), P([]));
  eq('合并-墓碑按 kind+id 排序', mTombOrder.project.tombstones.map(t => t.id).join(','), 'A,Z');
  const mTombLatest = M(P([], { tombstones: [{ id: 'A', deletedAt: T1, kind: 'object' }, { id: 'A', deletedAt: T3, kind: 'object' }] }), P([], { tombstones: [{ id: 'A', deletedAt: T2, kind: 'object' }] }));
  eq('合并-重复墓碑取最晚', mTombLatest.project.tombstones.length, 1);
  eq('合并-墓碑最晚时间', mTombLatest.project.tombstones[0].deletedAt, T3);
  const mTombBad = M(P([], { tombstones: [{ id: 'A', deletedAt: '' }, { id: 'B', deletedAt: 'not-a-date' }, { id: 'C' }, null] }), P([]));
  eq('合并-非法墓碑忽略', (mTombBad.project.tombstones || []).length, 0);

  /* 状态字段 / 墓碑清洗 / 迁移 / 持久化 */
  eq('墓碑-初始工程为空', api.createInitialState().tombstones, []);
  api.resetState();
  const tRec = api.markTombstone('OBJ_A', 'object');
  eq('墓碑-记录对象删除', api.state.tombstones.length, 1);
  eq('墓碑-记录对象 id', api.state.tombstones[0].id, 'OBJ_A');
  const tRec2 = api.markTombstone('OBJ_A', 'object');
  eq('墓碑-重复删除仍一条', api.state.tombstones.length, 1);
  ok('墓碑-重复删除刷新时间', tRec2 >= tRec);
  api.markTombstone('floor.F2', 'floor');
  eq('墓碑-楼层类型独立计数', api.state.tombstones.filter(t => t.kind === 'floor').length, 1);
  api.markTombstone('');
  eq('墓碑-忽略空 id', api.state.tombstones.length, 2);

  const cleaned = api.sanitizeTombstones([
    { id: 'A', deletedAt: T1, kind: 'object' },
    { id: 'A', deletedAt: T3, kind: 'object' },
    { id: 'F', deletedAt: T2, kind: 'floor' },
    { id: 'X', deletedAt: '' },
    { id: 'Y', deletedAt: 'not-a-date' },
    null, { foo: 1 }
  ]);
  eq('墓碑清洗-去重与过滤', cleaned.length, 2);
  eq('墓碑清洗-取最晚删除时间', cleaned[0].id, 'A');
  eq('墓碑清洗-楼层墓碑保留', cleaned.some(t => t.id === 'F' && t.kind === 'floor'), true);
  const huge = api.sanitizeTombstones(Array.from({ length: api.TOMBSTONE_LIMIT + 100 }, (_, i) => ({ id: 'T' + i, deletedAt: T1 })));
  eq('墓碑清洗-总量上限', huge.length, api.TOMBSTONE_LIMIT);

  const migT = api.migrateProject({ schema: 'offline-drawing-annotation/v1', tombstones: [{ id: 'A', deletedAt: T2, kind: 'object' }] });
  eq('迁移-保留删除墓碑', migT.tombstones.length, 1);
  eq('迁移-缺省墓碑为空', api.migrateProject({ schema: 'offline-drawing-annotation/v1' }).tombstones.length, 0);
  api.resetState();
  api.state.tombstones = [{ id: 'A', deletedAt: T1, kind: 'object' }];
  eq('持久化-携带删除墓碑', api.persistableState().tombstones.length, 1);

  /* 应用层入口：schema 校验、无可合并变化、实际合并与删除传播 */
  api.resetState();
  api.state.meta.projectId = 'PRJ_LOCAL';
  let errNull = null;
  try { await api.mergeProjectJSON(null); } catch (e) { errNull = e; }
  ok('合并入口-空输入拒绝', !!errNull);
  let errSchema = null;
  try { await api.mergeProjectJSON({ schema: 'wrong' }); } catch (e) { errSchema = e; }
  ok('合并入口-schema 校验', !!errSchema && /schema/.test(errSchema.message));
  const histBefore = api.history.past.length;
  const noStats = await api.mergeProjectJSON(api.persistableState());
  eq('合并入口-自身工程无变化', noStats, zero);
  eq('合并入口-无变化不写历史栈', api.history.past.length, histBefore);

  const incoming = P([O('OBJ_MERGE', T2)], {
    meta: { name: '他人工程', projectId: 'PRJ_OTHER', createdAt: T1, updatedAt: T2 }
  });
  const yesStats = await api.mergeProjectJSON(incoming);
  eq('合并入口-新增统计', yesStats.added, 1);
  eq('合并入口-新对象进入现场', api.state.objects.length, 1);
  eq('合并入口-新对象 id', api.state.objects[0].id, 'OBJ_MERGE');
  eq('合并入口-历史栈增加', api.history.past.length, histBefore + 1);
  eq('合并入口-不接管他人工程绑定', api.state.meta.projectId, 'PRJ_LOCAL');
  eq('合并入口-工程名保持本地', api.state.meta.name, '未命名图纸工程');

  const legacyObj = O('OBJ_MERGE', T1, 99);
  delete legacyObj.updatedAt;
  const legacyStats = await api.mergeProjectJSON(P([legacyObj], { meta: { name: '他人工程', updatedAt: T1 } }));
  eq('合并入口-缺失更新时间的旧对象不覆盖本地', api.state.objects[0].x, 1);
  eq('合并入口-旧对象不计更新', legacyStats.updated, 0);
  eq('合并入口-旧对象计冲突', legacyStats.conflicts, 1);

  const delStats = await api.mergeProjectJSON(P([], {
    meta: { name: '他人工程', updatedAt: T1 },
    tombstones: [{ id: 'OBJ_MERGE', deletedAt: T3, kind: 'object' }]
  }));
  eq('合并入口-删除墓碑生效', api.state.objects.length, 0);
  eq('合并入口-删除统计', delStats.deleted, 1);
  ok('合并入口-墓碑写入现场', api.state.tombstones.some(t => t.id === 'OBJ_MERGE' && t.kind === 'object'));

  const floorStats = await api.mergeProjectJSON(P([], {
    meta: { name: '他人工程', updatedAt: T1 },
    floors: [
      { id: 'floor.default', name: '1F' },
      { id: 'floor.F9', name: '9F', background: { kind: 'rect', shape: { type: 'rect', w: 20, h: 20 } }, viewport: { zoom: 1, panX: 0, panY: 0 }, objects: [O('OBJ_F9', T2)] }
    ]
  }));
  eq('合并入口-新增楼层', api.state.floors.length, 2);
  eq('合并入口-楼层统计', floorStats.floorsAdded, 1);
  eq('合并入口-楼层对象已装载', api.state.floors.find(f => f.id === 'floor.F9').objects.length, 1);
  eq('合并入口-当前层不变', api.state.activeFloorId, 'floor.default');
  api.resetState();
}

/* 60. 测试盲区补强：SVG 视觉快照 + 弹窗焦点管理（真实 DOM 语义桩） ---------- */
{
  api.resetState();
  const push=(kind,typeId,patch)=>api.state.objects.push(api.baseObject(kind,typeId,patch));
  push('rect','rect.area',{id:'G_RECT',name:'R1',x:3,y:3,width:8,height:5,angle:15});
  push('rect','rect.area',{id:'G_PARA',name:'P1',x:16,y:4,width:6,height:4,shape:{type:'parallelogram',x:16,y:4,w:6,h:4,skew:25}});
  push('point','point.camera',{id:'G_CAM',name:'C1',x:7,y:13,angle:35,phys:10,fov:90,scaleShape:'sector'});
  push('line','line.boundary',{id:'G_LINE',name:'L1',closed:true,points:[[2,2],[10,2],[10,8]]});
  push('dimension','dimension.distance',{id:'G_DIM',name:'D1',points:[[3,11],[13,11]],subtype:'distance'});
  push('text','text.label',{id:'G_TXT',name:'T1',x:14,y:13,text:'SITE A',width:8,height:1.6});
  Object.assign(api.state.settings,{precision:2,showLabels:true,showSegLen:true,showAreaTag:true,markerScale:1,unit:'m'});
  const scene=api.buildSceneSvg();
  const sceneHash=createHash('sha256').update(scene).digest('hex');
  eq('视觉快照-SVG 场景哈希', sceneHash, '7b43d7ae3452b85caaa8f076dde7edcfe001220612b9b43e8bd57d895c057b49');
  ok('视觉快照-SVG 输出非空', typeof scene==='string' && scene.length>1000);
  ok('视觉快照-平行四边形与扇形路径存在', scene.includes('<polygon') && scene.includes(' A'));
  eq('视觉快照-重复导出稳定', createHash('sha256').update(api.buildSceneSvg()).digest('hex'), sceneHash);

  /* 真实 DOM 语义桩：验证弹窗打开聚焦、Tab 首尾循环、Esc 关闭与焦点还原 */
  const makeEl=id=>{
    const el={
      id, textContent:'', innerHTML:'', className:'', onclick:null, offsetParent:{}, _focusable:[],
      classList:(()=>{ const s=new Set(); return {add:c=>s.add(c),remove:c=>s.delete(c),contains:c=>s.has(c),toggle:(c,on)=>on?s.add(c):s.delete(c)}; })(),
      appendChild(c){ this.children=this.children||[]; this.children.push(c); return c; },
      setAttribute(){}, getAttribute(){ return null; }, hasAttribute(){ return false; },
      querySelectorAll(){ return this._focusable; },
      focus(){ fakeDoc.activeElement=this; }, remove(){}
    };
    return el;
  };
  const fakeDoc={activeElement:null,_els:new Map(),getElementById(id){ if(!this._els.has(id)) this._els.set(id,makeEl(id)); return this._els.get(id); },createElement(){ return makeEl(''); },querySelectorAll(){ return []; },addEventListener(){},removeEventListener(){},body:makeEl('body'),documentElement:makeEl('html')};
  const f1=makeEl('f1'), f2=makeEl('f2'), trigger=makeEl('trigger');
  fakeDoc.getElementById('modalBox')._focusable=[f1,f2];
  fakeDoc.activeElement=trigger;
  const oldDoc=sandbox.document;
  sandbox.document=fakeDoc;
  try{
    api.openModal('测试','<p>x</p>',[{text:'OK',click(){}}]);
    eq('焦点管理-打开后聚焦首个控件', fakeDoc.activeElement, f1);
    fakeDoc.activeElement=f2;
    api.modalKeydown({key:'Tab',shiftKey:false,preventDefault(){}});
    eq('焦点管理-Tab 末位回到首位', fakeDoc.activeElement, f1);
    api.modalKeydown({key:'Tab',shiftKey:true,preventDefault(){}});
    eq('焦点管理-Shift+Tab 首位回到末位', fakeDoc.activeElement, f2);
    api.modalKeydown({key:'Escape',preventDefault(){}});
    eq('焦点管理-Esc 关闭并还原焦点', fakeDoc.activeElement, trigger);
    eq('焦点管理-关闭后弹窗隐藏', fakeDoc.getElementById('modalBackdrop').classList.contains('show'), false);
  }finally{
    sandbox.document=oldDoc;
  }
  api.resetState();
}

/* 61. 停车规划：双面垂直车位/通道布局、净宽检查与旋转排列 ---------- */
{
  const base={siteX:0,siteY:0,siteW:100,siteH:70,stallWidth:2.5,stallDepth:5.3,aisleWidth:6,margin:1,orientation:'x'};
  const r=api.parkingLayout(base);
  eq('停车-默认布局可生成', r.error, null);
  eq('停车-每排车位数', r.stats.perRow, 39);
  eq('停车-排数（模块）', r.stats.modules, 4);
  eq('停车-车位总数', r.stats.stallCount, 312);
  eq('停车-通道总数', r.stats.aisleCount, 4);
  approx('停车-车位面积', r.stats.stallArea, 4134, 1e-6);
  approx('停车-车位占比', r.stats.stallRatio, 4134/7000, 1e-6);
  approx('停车-含通道利用率', r.stats.totalRatio, 6474/7000, 1e-6);
  approx('停车-首个车位 X', r.stalls[0].x, 1.25, 1e-9);
  approx('停车-首个车位 Y', r.stalls[0].y, 1.8, 1e-9);
  eq('停车-首个车位角度', r.stalls[0].angle, 0);
  approx('停车-首个通道 Y', r.aisles[0].y, 7.1, 1e-9);
  eq('停车-首个通道宽度', r.aisles[0].width, 97.5);
  eq('停车-通道净宽', r.aisles[0].height, 6);
  eq('停车-无规范提示', r.warnings.length, 0);

  const y=api.parkingLayout(Object.assign({},base,{orientation:'y'}));
  eq('停车-纵向排列可生成', y.error, null);
  eq('停车-纵向每排车位', y.stats.perRow, 27);
  eq('停车-纵向排数', y.stats.modules, 5);
  eq('停车-纵向车位总数', y.stats.stallCount, 270);
  eq('停车-纵向通道数', y.stats.aisleCount, 5);
  eq('停车-纵向车位角度', y.stalls[0].angle, 90);
  approx('停车-纵向首个车位 X', y.stalls[0].x, 8.5, 1e-9);
  approx('停车-纵向首个车位 Y', y.stalls[0].y, 66.25, 1e-9);

  const inside=(rect2,site)=>rect2.angle===90
    ?rect2.x-rect2.height>=-1e-9&&rect2.x<=site.siteW+1e-9&&rect2.y>=-1e-9&&rect2.y+rect2.width<=site.siteH+1e-9
    :rect2.x>=-1e-9&&rect2.x+rect2.width<=site.siteW+1e-9&&rect2.y>=-1e-9&&rect2.y+rect2.height<=site.siteH+1e-9;
  ok('停车-横向车位均在场地内', r.stalls.every(s=>inside(s,base)) && r.aisles.every(a=>inside(a,base)));
  ok('停车-纵向车位均在场地内', y.stalls.every(s=>inside(s,base)) && y.aisles.every(a=>inside(a,base)));

  eq('停车-通道过窄拒绝生成', api.parkingLayout(Object.assign({},base,{aisleWidth:2})).error, 'aisleTooSmall');
  eq('停车-场地过小拒绝生成', api.parkingLayout(Object.assign({},base,{siteW:3,siteH:3})).error, 'siteTooSmall');
  eq('停车-非法尺寸拒绝生成', api.parkingLayout(Object.assign({},base,{stallWidth:0})).error, 'invalid');
  ok('停车-通道偏窄给出提示', api.parkingLayout(Object.assign({},base,{aisleWidth:4})).warnings.includes('aisleNarrow'));
  ok('停车-车位偏窄给出提示', api.parkingLayout(Object.assign({},base,{stallWidth:2.2})).warnings.includes('stallWidthSmall'));
  ok('停车-车位偏浅给出提示', api.parkingLayout(Object.assign({},base,{stallDepth:4.8})).warnings.includes('stallDepthSmall'));
  ok('停车-边距过小给出提示', api.parkingLayout(Object.assign({},base,{margin:0})).warnings.includes('marginSmall'));
  api.I18N.setLang('en');
  ok('停车-规范提示可翻译', api.parkingWarningText('aisleNarrow').includes('Aisle'));
  api.I18N.setLang('zh');
  eq('停车-中文规范提示', api.parkingWarningText('siteTooSmall'), '当前场地不足以排下完整车位与通道');

  /* 应用 / 撤销 / 重做：验证写入停车场图层、墓碑与历史栈 */
  api.resetState();
  api.history.past=[]; api.history.future=[];
  api.$('parkingStallW').value='2.5'; api.$('parkingStallD').value='5.3';
  api.$('parkingAisle').value='6'; api.$('parkingMargin').value='1';
  api.$('parkingOrient').value='x'; api.$('parkingClear').checked=true;
  api.applyParkingLayout();
  eq('停车-应用生成车位', api.state.objects.filter(o=>o.typeId==='rect.parking').length, 312);
  eq('停车-应用生成通道', api.state.objects.filter(o=>o.typeId==='rect.aisle').length, 4);
  eq('停车-应用创建图层', api.state.layers.some(l=>l.id==='layer.parking'), true);
  eq('停车-应用进入历史栈', api.history.past.length, 1);
  api.undo();
  eq('停车-撤销移除车位', api.state.objects.filter(o=>o.typeId==='rect.parking').length, 0);
  api.redo();
  eq('停车-重做恢复车位', api.state.objects.filter(o=>o.typeId==='rect.parking').length, 312);
  api.history.past=[]; api.history.future=[];
  api.resetState();
}

/* 62. 实时协作：长消息分块与本地提交防抖（WebRTC/BC 传输层为浏览器环境） ---------- */
{
  const text='A'.repeat(100);
  const parts=api.collabChunkText(text,30);
  eq('协作分块-块数', parts.length, 4);
  eq('协作分块-首块长度', parts[0].length, 30);
  eq('协作分块-末块长度', parts[3].length, 10);
  eq('协作分块-拼接还原', parts.join(''), text);
  eq('协作分块-空文本', api.collabChunkText('').join(''), '');
  const big='测'.repeat(100000);
  const bigParts=api.collabChunkText(big,48000);
  eq('协作分块-大文本块数', bigParts.length, 3);
  eq('协作分块-大文本还原', bigParts.join(''), big);
  ok('协作分块-非字符串安全', api.collabChunkText(null).join('') === '');
  const sdpClean=api.collabCleanSDP('v=0\r\na=mid:0\r\na=max-message-size:262144\r\na=sctp-port:5000\r\n');
  ok('协作-SDP 清洗移除不兼容属性', !sdpClean.includes('max-message-size'));
  ok('协作-SDP 清洗保留关键行', sdpClean.includes('a=mid:0') && sdpClean.includes('a=sctp-port:5000'));
  const sdpMedia=api.collabCleanSDP('v=0\na=group:BUNDLE 0\na=mid:0\n\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\na=sctp-port:5000\n');
  ok('协作-SDP 移除空行（Chromium 解析器不接受空行）', !sdpMedia.includes('\r\n\r\n'));
  ok('协作-SDP 媒体段紧接会话段', sdpMedia.includes('a=mid:0\r\nm=application'));
  ok('协作-SDP 以换行结尾', sdpMedia.endsWith('\r\n'));
  let threw=false;
  try{ api.collabOnLocalChange(); }catch(_){ threw=true; }
  ok('协作-未连接时本地提交不抛错', !threw);
}

/* 63. 多楼层汇总：逐层对象数/分类/面积/长度与合计 ---------------------------- */
{
  const st=api.resetState();
  st.objects.push(api.baseObject('point','point.marker',{name:'A',x:1,y:1}));
  st.objects.push(api.baseObject('rect','rect.area',{name:'R1',x:0,y:0,width:10,height:10}));
  st.objects.push(api.baseObject('line','line.boundary',{name:'L1',points:[[0,0],[3,0],[3,4]]}));
  api.syncActiveFloor();
  const init=api.createInitialState();
  st.floors.push({id:'floor.F2',name:'2F',background:init.background,objects:[
    api.baseObject('point','point.marker',{name:'B',x:2,y:2}),
    api.baseObject('rect','rect.area',{name:'R2',x:0,y:0,width:5,height:4})
  ],viewport:init.viewport});
  const s1=api.floorSummaries();
  eq('楼层汇总-层数', s1.rows.length, 2);
  eq('楼层汇总-当前层对象数', s1.rows[0].count, 3);
  eq('楼层汇总-当前层点设备', s1.rows[0].counts.point, 1);
  eq('楼层汇总-当前层区域', s1.rows[0].counts.rect, 1);
  eq('楼层汇总-当前层折线', s1.rows[0].counts.line, 1);
  approx('楼层汇总-当前层面积', s1.rows[0].area, 100);
  approx('楼层汇总-当前层长度', s1.rows[0].len, 7);
  ok('楼层汇总-活动层标记', s1.rows[0].active===true&&s1.rows[1].active===false);
  eq('楼层汇总-非活动层取楼层条目对象', s1.rows[1].count, 2);
  approx('楼层汇总-非活动层面积', s1.rows[1].area, 20);
  eq('楼层汇总-合计对象数', s1.total.count, 5);
  eq('楼层汇总-合计分类', [s1.total.counts.point,s1.total.counts.rect,s1.total.counts.line], [2,2,1]);
  approx('楼层汇总-合计面积', s1.total.area, 120);
  approx('楼层汇总-合计长度', s1.total.len, 7);
  ok('楼层汇总-切换二层', api.switchFloorData('floor.F2'));
  const s2=api.floorSummaries();
  ok('楼层汇总-切换后活动层变更', s2.rows.find(r=>r.id==='floor.F2').active===true);
  eq('楼层汇总-切换后合计不变', s2.total.count, 5);
  api.resetState();
}

/* 64. 资源上限：缩放/图标/段长阈值、底图降采样策略、设置迁移与 HTML 转义 ---------- */
{
  eq('资源上限-缩放范围', [api.APP_LIMITS.ZOOM_MIN, api.APP_LIMITS.ZOOM_MAX], [0.02, 200]);
  eq('资源上限-图标倍率范围', [api.APP_LIMITS.ICON_SCALE_MIN, api.APP_LIMITS.ICON_SCALE_MAX], [0.2, 8]);
  eq('资源上限-段长标注阈值范围', [api.APP_LIMITS.SEG_LABEL_MIN_PX_MIN, api.APP_LIMITS.SEG_LABEL_MIN_PX_MAX], [10, 60]);

  eq('底图策略-小图不缩放', api.backgroundScalePlan(2000, 1000, 'image/png', 1024 * 1024), null);
  const wide = api.backgroundScalePlan(5000, 1000, 'image/png', 1024 * 1024);
  eq('底图策略-长边限制到 3000', [wide.width, wide.height], [3000, 600]);
  eq('底图策略-透明格式保留 PNG', wide.format, 'image/png');
  const square = api.backgroundScalePlan(4000, 4000, 'image/jpeg', 2 * 1024 * 1024);
  eq('底图策略-方形等比缩放', [square.width, square.height], [3000, 3000]);
  eq('底图策略-不透明格式转 JPEG', square.format, 'image/jpeg');
  approx('底图策略-JPEG 质量', square.quality, 0.85);
  const hugePng = api.backgroundScalePlan(5000, 5000, 'image/png', 7 * 1024 * 1024);
  eq('底图策略-超大透明图转 JPEG', hugePng.format, 'image/jpeg');
  eq('底图策略-SVG 不降采样', api.backgroundScalePlan(5000, 5000, 'image/svg+xml', 1024), null);
  const thin = api.backgroundScalePlan(9000, 1, 'image/jpeg', 1024);
  eq('底图策略-极窄图最小边仍为 1', [thin.width, thin.height], [3000, 1]);

  const m1 = api.migrateProject({schema:'offline-drawing-annotation/v1', objects:[], settings:{segLabelMinPx:5}});
  eq('设置迁移-段长阈值下限', m1.settings.segLabelMinPx, 10);
  const m2 = api.migrateProject({schema:'offline-drawing-annotation/v1', objects:[], settings:{segLabelMinPx:999}});
  eq('设置迁移-段长阈值上限', m2.settings.segLabelMinPx, 60);
  const m3 = api.migrateProject({schema:'offline-drawing-annotation/v1', objects:[], settings:{segLabelMinPx:'abc'}});
  eq('设置迁移-段长阈值缺省', m3.settings.segLabelMinPx, 26);
  const mv = api.migrateProject({schema:'offline-drawing-annotation/v1', objects:[], viewport:{zoom:0.001}});
  eq('设置迁移-缩放下限', mv.viewport.zoom, 0.02);
  const mv2 = api.migrateProject({schema:'offline-drawing-annotation/v1', objects:[], viewport:{zoom:500}});
  eq('设置迁移-缩放上限', mv2.viewport.zoom, 200);
  ok('段长阈值-读取下限', (()=>{ api.state.settings.segLabelMinPx=5; return api.segLabelMinPx()===10; })());
  ok('段长阈值-读取上限', (()=>{ api.state.settings.segLabelMinPx=999; return api.segLabelMinPx()===60; })());
  ok('段长阈值-非法值回退默认', (()=>{ api.state.settings.segLabelMinPx='abc'; return api.segLabelMinPx()===26; })());

  ok('HTML 转义-不保留未转义标签', !api.esc('<img src=x onerror=alert(1)>').includes('<'));
  eq('HTML 转义-引号与尖括号', api.esc('a"b\'c<d>&'), 'a&quot;b&#39;c&lt;d&gt;&amp;');
  api.resetState();
}

/* 65. 对象对齐与分布：包围盒边界/中线、等间距、少于阈值不动 -------------------- */
{
  const mk=(patch)=>api.baseObject('rect','rect.area',Object.assign({x:0,y:0,width:10,height:10},patch));
  const boxes=objs=>objs.map(o=>api.objectBounds(o));

  let a=mk({x:0,y:0}), b=mk({x:20,y:5}), c=mk({x:40,y:2});
  api.alignObjects([a,b,c],'left');
  eq('对齐-左边界一致', boxes([a,b,c]).map(x=>x.minX), [0,0,0]);
  eq('对齐-左对齐不改变 Y', [a.y,b.y,c.y], [0,5,2]);

  a=mk({x:0,y:0}); b=mk({x:20,y:5}); c=mk({x:40,y:2});
  api.alignObjects([a,b,c],'centerX');
  eq('对齐-水平居中中心一致', boxes([a,b,c]).map(x=>(x.minX+x.maxX)/2), [25,25,25]);

  a=mk({x:0,y:0}); b=mk({x:20,y:5}); c=mk({x:40,y:2});
  api.alignObjects([a,b,c],'right');
  eq('对齐-右边界一致', boxes([a,b,c]).map(x=>x.maxX), [50,50,50]);

  a=mk({x:0,y:0}); b=mk({x:20,y:5}); c=mk({x:40,y:2});
  api.alignObjects([a,b,c],'top');
  eq('对齐-上边界一致', boxes([a,b,c]).map(x=>x.maxY), [15,15,15]);

  a=mk({x:0,y:0}); b=mk({x:20,y:5}); c=mk({x:40,y:2});
  api.alignObjects([a,b,c],'centerY');
  approx('对齐-垂直居中 A', boxes([a])[0].minY+boxes([a])[0].maxY, 15);
  approx('对齐-垂直居中 B', boxes([b])[0].minY+boxes([b])[0].maxY, 15);
  approx('对齐-垂直居中 C', boxes([c])[0].minY+boxes([c])[0].maxY, 15);

  a=mk({x:0,y:0}); b=mk({x:20,y:5}); c=mk({x:40,y:2});
  api.alignObjects([a,b,c],'bottom');
  eq('对齐-下边界一致', boxes([a,b,c]).map(x=>x.minY), [0,0,0]);
  eq('对齐-返回对象数', api.alignObjects([a,b,c],'left'), 3);
  const solo=mk({x:7,y:7});
  eq('对齐-少于两个对象不移动', api.alignObjects([solo],'left'), 0);
  eq('对齐-单对象坐标不变', [solo.x,solo.y], [7,7]);

  const line=api.baseObject('line','line.boundary',{x:10,y:5,points:[[0,0],[10,0]]});
  api.translateObject(line,5,-3);
  eq('平移-折线锚点同步', [line.x,line.y], [15,2]);
  eq('平移-折线节点同步', line.points, [[5,-3],[15,-3]]);

  const p1=mk({x:0,y:0}), p2=mk({x:10,y:0}), p3=mk({x:40,y:0});
  api.distributeObjects([p3,p1,p2],'x');
  eq('分布-水平等间距', boxes([p1,p2,p3]).map(x=>(x.minX+x.maxX)/2), [5,25,45]);
  eq('分布-首末保持不动', [p1.x,p3.x], [0,40]);

  const q1=mk({x:0,y:0}), q2=mk({x:0,y:10}), q3=mk({x:0,y:40});
  api.distributeObjects([q3,q1,q2],'y');
  eq('分布-垂直等间距', boxes([q1,q2,q3]).map(x=>(x.minY+x.maxY)/2), [5,25,45]);
  eq('分布-少于三个对象不移动', api.distributeObjects([p1,p2],'x'), 0);
  api.resetState();
}

/* ---------------- 结果汇总 ---------------- */
await Promise.all(asyncSuites);
console.log(`\n${fail === 0 ? '✅' : '❌'} 逻辑层自测：${pass} 通过 / ${fail} 失败，共 ${pass + fail} 项断言（加载 ${srcs.length} 个脚本）`);
if (fail) { failures.forEach(f => console.error('  - ' + f)); process.exit(1); }
