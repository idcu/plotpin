/* model.js —— DOM 引用、运行时状态、工程模型工厂、类型/图层/样式辅助 */
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const wrap = document.getElementById('canvasWrap');
const $ = id => document.getElementById(id);

let state = createInitialState();
let bgImage = null;
let bgDataUrl = '';      // 运行时底图（dataURL，仅内存；持久化走 assets 库的 assetId）
let bgLoadSeq = 0;       // 防止旧底图异步加载覆盖新底图
let currentTool = 'select';
let selectedIds = new Set();
let history = { past: [], future: [] };
let clipboard = [];
let draft = null;
let drag = null;
let rubber = null;
let calibPoints = [];
let spaceDown = false;
let saveTimer = null;
let dpr = 1;

/* -------------------- 初始化 / 工程数据 -------------------- */
function createInitialState(){
  const now = new Date().toISOString();
  return {
    schema: SCHEMA,
    meta: { id: uid('PRJ'), name: '未命名图纸工程', createdAt: now, updatedAt: now },
    settings: { unit:'m', precision:2, gridVisible:true, gridSize:1, snap:true, showLabels:true, markerScale:1 },
    viewport: { zoom:1, panX:0, panY:0 },
    /* kind: image=图片底图(像素×m/px)；rect/circle/ellipse/sector/polygon=矢量场地(世界坐标米，无需校准) */
    background: { kind:'rect', fileName:'', assetId:'', width:1000, height:700, origin:[0,0], metersPerPixel:0.1, calibrated:false,
      shape:{type:'rect', w:100, h:70} },
    layers: [{ id:'layer.default', name:'默认图层', visible:true, locked:false }],
    objectTypes: deepClone(BUILTIN_TYPES),
    objects: []
  };
}
function uid(prefix='O'){
  return prefix + '_' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,7).toUpperCase();
}
function nextObjectId(){
  let n = state.objects.length + 1;
  const used = new Set(state.objects.map(o => o.name));
  while (used.has('O' + String(n).padStart(4,'0'))) n++;
  return 'O' + String(n).padStart(4,'0');
}
function deepClone(v){ return JSON.parse(JSON.stringify(v)); }
function nowISO(){ return new Date().toISOString(); }
function defaultTypeId(kind){
  if (kind === 'point') return 'point.marker';
  if (kind === 'rect') return 'rect.area';
  if (kind === 'dimension') return 'dimension.distance';
  return 'line.custom';
}
function baseObject(kind, typeId, patch={}){
  return Object.assign({
    id: uid('OBJ'), name: nextObjectId(), kind, typeId: typeId || defaultTypeId(kind),
    layerId: 'layer.default', x:0, y:0, points:[], width:0, height:0, angle:0,
    phys:0,   /* 点设备物理尺寸(米，高级)：0=纯位置标识(屏幕固定图标)；>0=按世界比例渲染的覆盖图形 */
    iconSize:1, /* 点设备图标屏幕大小倍率（纯视觉，无物理意义）；与类型默认值、全局倍率连乘 */
    shape:null, /* 区域参数形状：circle{r}/ellipse{rx,ry}/sector{r,a0,a1}；null=矩形(用 width/height/angle) */
    text:'', closed:false, subtype:kind === 'dimension' ? 'distance' : '',
    style:{}, props:{}, visible:true, locked:false, z:state.objects.length,
    createdAt: nowISO(), updatedAt: nowISO()
  }, patch);
}

/* -------------------- 类型 / 图层 / 样式 -------------------- */
function getType(typeId){
  return state.objectTypes.find(t => t.id === typeId) || state.objectTypes.find(t => t.kind === 'point') || {name:'未知',color:'#666',icon:'marker'};
}
function typesOfKind(kind){ return state.objectTypes.filter(t => t.kind === kind); }
function layerOf(o){ return state.layers.find(l => l.id === o.layerId) || state.layers[0]; }
function styleVal(o, key, fallback){
  if (o.style && o.style[key] !== undefined && o.style[key] !== '') return o.style[key];
  const t = getType(o.typeId);
  if (t.defaultStyle && t.defaultStyle[key] !== undefined) return t.defaultStyle[key];
  return fallback;
}
function kindName(k){ return ({point:'点设备',rect:'矩形/区域',line:'线段/折线',text:'文字',dimension:'尺寸标注'})[k] || k; }

/* 点设备屏幕图标有效倍率 = 类型默认大小 × 对象覆盖 × 全局倍率（三层连乘，纯屏幕语义） */
function pointIconScale(o){
  const t=getType(o.typeId);
  const k=(Number(t.iconSize)||1)*(Number(o.iconSize)||1)*(Number(state.settings.markerScale)||1);
  return Math.min(8,Math.max(.2,k));
}
