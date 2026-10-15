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
    settings: { unit:'m', precision:2, gridVisible:true, gridSize:1, snap:true, showLabels:true, markerScale:1,
      showCursor:true,   /* 鼠标十字准星与实时世界坐标 */
      showSegLen:true }, /* 折线选中/绘制时显示段长度与总长 */
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

/* -------------------- 折线节点编辑（纯数据，供面板与画布双击共用） -------------------- */
function lineMinNodes(o){ return o && o.closed ? 3 : 2; }
/** 修改第 i 个节点坐标（允许负值，与拖拽同一基准）；i===0 时同步锚点 x,y */
function setNodeCoord(o,i,axis,v){
  if(!o || !Array.isArray(o.points) || i<0 || i>=o.points.length) return false;
  const n=Number(v); if(!Number.isFinite(n)) return false;
  o.points[i][axis==='y'?1:0]=n;
  if(i===0){ o.x=o.points[0][0]; o.y=o.points[0][1]; }
  o.updatedAt=nowISO(); return true;
}
/** 在第 at 个节点之后插入节点 p（at 为末节点时追加到末尾） */
function insertLineNode(o,at,p){
  if(!o || o.kind!=='line' || !Array.isArray(o.points) || !Array.isArray(p)) return false;
  const i=Math.min(Math.max(0,at+1),o.points.length);
  o.points.splice(i,0,[Number(p[0]),Number(p[1])]);
  o.x=o.points[0][0]; o.y=o.points[0][1]; o.updatedAt=nowISO(); return true;
}
/** 删除第 i 个节点；低于最小节点数（开放折线2、闭合区域3）时拒绝 */
function removeLineNode(o,i){
  if(!o || o.kind!=='line' || !Array.isArray(o.points) || i<0 || i>=o.points.length) return false;
  if(o.points.length<=lineMinNodes(o)) return false;
  o.points.splice(i,1);
  o.x=o.points[0][0]; o.y=o.points[0][1]; o.updatedAt=nowISO(); return true;
}
/** 节点重排（move 语义）：把 from 处节点移到 to 处，其余节点顺序保持 */
function moveNode(o,from,to){
  if(!o || o.kind!=='line' || !Array.isArray(o.points)) return false;
  const n=o.points.length;
  if(from===to || from<0 || from>=n || to<0 || to>=n) return false;
  const p=o.points.splice(from,1)[0];
  o.points.splice(to,0,p);
  o.x=o.points[0][0]; o.y=o.points[0][1]; o.updatedAt=nowISO(); return true;
}
/** 与相邻节点交换位置（上移=与前一个，下移=与后一个）；到头返回 false */
function moveNodeStep(o,i,dir){
  if(!o || o.kind!=='line' || !Array.isArray(o.points)) return false;
  const to=i+(dir<0?-1:1);
  if(to<0 || to>=o.points.length) return false;
  return moveNode(o,i,to);
}

/* 点设备屏幕图标有效倍率 = 类型默认大小 × 对象覆盖 × 全局倍率（三层连乘，纯屏幕语义） */
function pointIconScale(o){
  const t=getType(o.typeId);
  const k=(Number(t.iconSize)||1)*(Number(o.iconSize)||1)*(Number(state.settings.markerScale)||1);
  return Math.min(8,Math.max(.2,k));
}
