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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

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
  resetState(){ state = createInitialState(); return state; },
  createInitialState, migrateProject, baseObject,
  polygonArea, polylineLength, pointInPolygon, distanceToSegment, nearestPointOnSegment,
  orthoPoint, polarSnap45, squareCorner, segmentsIntersect,
  normalizeAngle, rotatePoint,
  XmlLite, Zip, Xlsx, DSV, ContentAssets,
  parseRowsStub: DSV.parseRows,
  rowsToObjectsPlan, applyTableImport,
  siteDomainOf, rectShapeFromCorners, circleShapeFrom, polygonShapeFromPoints,
  ellipseShapeFromCorners, sectorShapeFrom,
  siteDescription, worldDims,
  hitPhysicalPoint, siteKindName,
  areaShapeType, shapeWorldPoints, shapeHit, shapeArea, shapeLabelCenter,
  sectorSweep, sectorArcPoints, convertAreaShape, pointIconScale, areaParamText,
  collectSnapCandidates, collectSnapEdges, collectSnapCircles, findOsnap, OSNAP_LABELS,
  applyField,
  lineMinNodes, setNodeCoord, insertLineNode, removeLineNode, moveNode, moveNodeStep,
  TABLE_COLUMNS
};`;
vm.runInContext(code, sandbox, { filename: 'index.html<scripts>', displayErrors: true });

/* ---------------- 微型测试框架 ---------------- */
let pass = 0, fail = 0;
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
  const table = [
    api.TABLE_COLUMNS,
    ['O0001', '监控,一号', '点设备', '摄像头', '默认图层', '1.5', '-2.25', '90', '', '', '0', '', '', '是', '否', '含"引号"\n换行', '2026-10-14T00:00:00Z'],
    ['O0002', '区域A', '矩形/区域', '普通区域', '默认图层', '0', '0', '0', '12.5', '3.5', '0', '', '43.75', '是', '否', '', '2026-10-14T00:00:00Z']
  ];
  const buf = api.Xlsx.build(table, '图纸标注');
  ok('XLSX 是 ZIP（PK 头）', new Uint8Array(buf)[0] === 0x50);
  const rows = await api.Xlsx.readRows(buf);
  eq('XLSX 往返行数', rows.length, 3);
  eq('XLSX 表头往返', rows[0], api.TABLE_COLUMNS);
  eq('XLSX 含逗号/引号/换行单元格往返', rows[1][1], '监控,一号');
  eq('XLSX 备注引号换行往返', rows[1][15], '含"引号"\n换行');
  eq('XLSX 数字以文本往返', rows[2][9], '3.5');
  eq('XLSX 面积往返', rows[2][12], '43.75');
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

  /* 圆形场地清洗：cx/cy 必须回到域中心 r,r */
  const circ = api.migrateProject({ schema:'offline-drawing-annotation/v1',
    background: { kind:'circle', shape:{ type:'circle', r:20, cx:0, cy:0 } } });
  eq('迁移-圆形形状清洗', circ.background.shape, { type:'circle', cx:20, cy:20, r:20 });

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
  eq('worldDims 取初始矩形域', api.worldDims(), { w:100, h:70 });

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

/* ---------------- 结果汇总 ---------------- */
console.log(`\n${fail === 0 ? '✅' : '❌'} 逻辑层自测：${pass} 通过 / ${fail} 失败，共 ${pass + fail} 项断言（加载 ${srcs.length} 个脚本）`);
if (fail) { failures.forEach(f => console.error('  - ' + f)); process.exit(1); }
