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
let coverageResult = null;   /* 视场覆盖率分析结果（含逐区域栅格），供画布叠加层与报告弹窗；对象/底图变更后清空 */
let affinePairs = [];        /* 仿射校准对应点集：[{u,v,x,y}]，像素(u,v y-down) → 实地(x,y y-up) */

/* -------------------- 类型契约（JSDoc，供编辑器提示；不引入 TypeScript 依赖） -------------------- */
/**
 * @typedef {'point'|'rect'|'line'|'text'|'dimension'} ObjectKind
 * @typedef {Object} Tombstone
 * @property {string} id
 * @property {string} deletedAt ISO 时间
 * @property {'object'|'floor'} [kind]
 * @typedef {Object} Layer
 * @property {string} id
 * @property {string} name
 * @property {boolean} visible
 * @property {boolean} locked
 * @typedef {Object} ObjectType
 * @property {string} id
 * @property {ObjectKind} kind
 * @property {string} name
 * @property {string} color
 * @property {string} [icon]
 * @property {boolean} [builtin]
 * @property {number} [iconSize]
 * @property {'none'|'circle'|'square'|'sector'|'bar'} [scaleShape]
 * @property {number} [fov]
 * @property {Array<{d:string,fill?:boolean}>} [symbol]
 * @property {{fillAlpha?:number,strokeWidth?:number}} [defaultStyle]
 * @typedef {Object} DrawingObject
 * @property {string} id
 * @property {string} name
 * @property {ObjectKind} kind
 * @property {string} typeId
 * @property {string} layerId
 * @property {number} x
 * @property {number} y
 * @property {Array<[number,number]>} points
 * @property {number} width
 * @property {number} height
 * @property {number} angle
 * @property {number} phys 点设备物理尺寸（米，0=纯位置）
 * @property {number} iconSize 屏幕图标倍率
 * @property {Object<string,boolean>} annot
 * @property {Object|null} shape
 * @property {string} text
 * @property {boolean} closed
 * @property {Object} style
 * @property {Object} props
 * @property {boolean} visible
 * @property {boolean} locked
 * @property {number} z
 * @property {string} createdAt
 * @property {string} updatedAt
 * @typedef {Object} Floor
 * @property {string} id
 * @property {string} name
 * @property {Object} [background]
 * @property {DrawingObject[]} [objects]
 * @property {Object} [viewport]
 * @property {string} [updatedAt]
 * @typedef {Object} ProjectState
 * @property {string} schema
 * @property {Object} meta
 * @property {Object} settings
 * @property {Object} viewport
 * @property {Object} background
 * @property {Layer[]} layers
 * @property {ObjectType[]} objectTypes
 * @property {DrawingObject[]} objects
 * @property {Floor[]} floors
 * @property {string} activeFloorId
 * @property {Tombstone[]} tombstones
 */
/* -------------------- 初始化 / 工程数据 -------------------- */
/** @returns {ProjectState} 新工程状态 */
function createInitialState(){
  const now = new Date().toISOString();
  return {
    schema: SCHEMA,
    meta: { id: uid('PRJ'), name: '未命名图纸工程', createdAt: now, updatedAt: now },
    settings: { unit:'m', precision:2, gridVisible:true, gridSize:1, snap:true, showLabels:true, markerScale:1,
      showCursor:true,   /* 鼠标十字准星与实时世界坐标 */
      showSegLen:true,   /* 全局缺省：未单独配置「段长」的对象显示段长与总长 */
      showAreaTag:true,  /* 全局缺省：未单独配置「面积/周长」的区域或闭合折线显示面积与周长 */
      siteNodes:true,    /* 矢量场地：边界节点世界坐标标注 */
      siteSegLen:true,   /* 矢量场地：相邻节点段长度标注 */
      siteBase:false,    /* 矢量场地：基点/圆心坐标标注 */
      siteRadius:false,  /* 矢量场地：半径标注（圆/椭圆/扇形） */
      siteArea:true,     /* 矢量场地：中心面积 */
      sitePerimeter:true,/* 矢量场地：中心周长 */
      polar:false,       /* 极轴追踪：逐点录入时自动吸附到极轴角整数倍 */
      polarStep:45,      /* 极轴角步长（15/30/45/90） */
      segLabelMinPx:APP_LIMITS.SEG_LABEL_MIN_PX, /* 段长标注最小屏幕像素：过短的段不标，避免拥挤 */
      lang:'zh',         /* 界面语言：zh / en（静态 chrome 文案） */
      osnap:true },      /* 对象捕捉：端点/中点/圆心 */
    viewport: { zoom:1, panX:0, panY:0 },
    /* kind: image=图片底图(像素×m/px)；rect/circle/ellipse/sector/polygon=矢量场地(世界坐标米，无需校准) */
    background: { kind:'rect', fileName:'', assetId:'', width:1000, height:700, origin:[0,0], metersPerPixel:0.1, calibrated:false,
      transform:null,   /* 仿射校准系数 {a,b,c,d,e,f}：像素(u,v y-down)→世界(x,y y-up)；null=缺省轴对齐 */
      shape:{type:'rect', w:100, h:70} },
    layers: [{ id:'layer.default', name:'默认图层', visible:true, locked:false }],
    objectTypes: deepClone(BUILTIN_TYPES),
    objects: [],
    /* 多楼层/多底图：floors 保存全部楼层元数据；非当前楼层额外持有 background/objects/viewport。
       当前楼层的可编辑数据始终是顶层 state.background / state.objects（切换与保存时同步）。 */
    floors: [{ id:'floor.default', name:'1F' }],
    activeFloorId: 'floor.default',
    /* 删除墓碑（离线 LWW 合并用）：{id, deletedAt, kind:'object'|'floor'}。
       对象被删除后保留删除时间，合并他人工程时用于判定「删除」与「较新编辑」谁生效。 */
    tombstones: []
  };
}
function uid(prefix='O'){
  return prefix + '_' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,7).toUpperCase();
}
function nextObjectId(){
  /* 编号跨楼层唯一：统计当前层 + 非当前层的既有编号 */
  const used=new Set(state.objects.map(o=>o.name));
  (state.floors||[]).forEach(f=>{
    if(f.id===state.activeFloorId) return;
    (f.objects||[]).forEach(o=>{ if(o&&o.name) used.add(o.name); });
  });
  let n=used.size+1;
  while(used.has('O' + String(n).padStart(4,'0'))) n++;
  return 'O' + String(n).padStart(4,'0');
}
/** @template T @param {T} v @returns {T} */
function deepClone(v){ return JSON.parse(JSON.stringify(v)); }
/** @returns {string} ISO 时间 */
function nowISO(){ return new Date().toISOString(); }
/** @param {ObjectKind} kind @returns {string} */
function defaultTypeId(kind){
  if (kind === 'point') return 'point.marker';
  if (kind === 'rect') return 'rect.area';
  if (kind === 'dimension') return 'dimension.distance';
  return 'line.custom';
}
/**
 * @param {ObjectKind} kind
 * @param {string} [typeId]
 * @param {Partial<DrawingObject>} [patch]
 * @returns {DrawingObject}
 */
function baseObject(kind, typeId, patch={}){
  return Object.assign({
    id: uid('OBJ'), name: nextObjectId(), kind, typeId: typeId || defaultTypeId(kind),
    layerId: 'layer.default', x:0, y:0, points:[], width:0, height:0, angle:0,
    phys:0,   /* 点设备物理尺寸(米，高级)：0=纯位置标识(屏幕固定图标)；>0=按世界比例渲染的覆盖图形 */
    iconSize:1, /* 点设备图标屏幕大小倍率（纯视觉，无物理意义）；与类型默认值、全局倍率连乘 */
    annot:{},   /* 逐对象标注显示开关（点坐标/基点/半径/边长/周长/面积/节点坐标），未显式设置时按类型默认 */
    shape:null, /* 区域参数形状：circle{r}/ellipse{rx,ry}/sector{r,a0,a1}；null=矩形(用 width/height/angle) */
    text:'', closed:false, subtype:kind === 'dimension' ? 'distance' : '',
    style:{}, props:{}, visible:true, locked:false, z:state.objects.length,
    createdAt: nowISO(), updatedAt: nowISO()
  }, patch);
}

/* -------------------- 类型 / 图层 / 样式 -------------------- */
/** @param {string} typeId @returns {ObjectType} */
function getType(typeId){
  return state.objectTypes.find(t => t.id === typeId) || state.objectTypes.find(t => t.kind === 'point') || {name:'未知',color:'#666',icon:'marker'};
}
/** 是否为内置类型：载入工程时清洗会把 builtin 标成 false，需按 id 回到内置表判断 */
/** @param {ObjectType} t @returns {boolean} */
function isBuiltinType(t){
  if(!t) return false;
  if(t.builtin) return true;
  try{ return Array.isArray(BUILTIN_TYPES)&&BUILTIN_TYPES.some(b=>b.id===t.id); }
  catch(_){ return false; }
}
/** 类型显示名：内置类型随界面语言切换，用户自定义类型始终保留原名 */
/** @param {ObjectType} t @returns {string} */
function typeDisplayName(t){
  if(!t) return '';
  const n=t.name||'';
  return isBuiltinType(t) && typeof L==='function' ? L(n) : n;
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
/* 开放折线与测距链(ruler)可自由增删节点；闭合区域最少 3 点 */
function isPolylineEditable(o){ return o && (o.kind==='line' || (o.kind==='dimension'&&o.subtype==='ruler')); }
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
  if(!isPolylineEditable(o) || !Array.isArray(o.points) || !Array.isArray(p)) return false;
  const i=Math.min(Math.max(0,at+1),o.points.length);
  o.points.splice(i,0,[Number(p[0]),Number(p[1])]);
  o.x=o.points[0][0]; o.y=o.points[0][1]; o.updatedAt=nowISO(); return true;
}
/** 删除第 i 个节点；低于最小节点数（开放折线2、闭合区域3）时拒绝 */
function removeLineNode(o,i){
  if(!isPolylineEditable(o) || !Array.isArray(o.points) || i<0 || i>=o.points.length) return false;
  if(o.points.length<=lineMinNodes(o)) return false;
  o.points.splice(i,1);
  o.x=o.points[0][0]; o.y=o.points[0][1]; o.updatedAt=nowISO(); return true;
}
/** 节点重排（move 语义）：把 from 处节点移到 to 处，其余节点顺序保持 */
function moveNode(o,from,to){
  if(!isPolylineEditable(o) || !Array.isArray(o.points)) return false;
  const n=o.points.length;
  if(from===to || from<0 || from>=n || to<0 || to>=n) return false;
  const p=o.points.splice(from,1)[0];
  o.points.splice(to,0,p);
  o.x=o.points[0][0]; o.y=o.points[0][1]; o.updatedAt=nowISO(); return true;
}
/** 与相邻节点交换位置（上移=与前一个，下移=与后一个）；到头返回 false */
function moveNodeStep(o,i,dir){
  if(!isPolylineEditable(o) || !Array.isArray(o.points)) return false;
  const to=i+(dir<0?-1:1);
  if(to<0 || to>=o.points.length) return false;
  return moveNode(o,i,to);
}

/* 点设备屏幕图标有效倍率 = 类型默认大小 × 对象覆盖 × 全局倍率（三层连乘，纯屏幕语义） */
function pointIconScale(o){
  const t=getType(o.typeId);
  const k=(Number(t.iconSize)||1)*(Number(o.iconSize)||1)*(Number(state.settings.markerScale)||1);
  return Math.min(APP_LIMITS.ICON_SCALE_MAX,Math.max(APP_LIMITS.ICON_SCALE_MIN,k));
}

/* -------------------- 逐对象标注显示开关 -------------------- */
/* 每个对象可单独配置在图上显示哪些标注；未显式设置的键按类型默认值（默认保持既有观感）。
   点设备：编号/点坐标；区域：编号/基点坐标/半径/边长/顶点坐标/周长/面积；折线：编号/节点坐标(闭合即顶点)/段长/周长/面积。 */
const ANNOT_KEYS={
  point:['name','coord'],
  rect:['name','base','radius','edge','vertex','perimeter','area'],
  line:['name','node','edge','perimeter','area']
};
const ANNOT_LABELS={ name:'编号', coord:'点坐标', base:'基点坐标', radius:'半径', edge:'边长', vertex:'顶点坐标', perimeter:'周长', area:'面积', node:'节点坐标' };
/* 默认值：编号标签沿用全局「显示标签」既有观感（开）、区域/闭合折线的面积周长沿用全局开关默认（开）；其余新增标注默认关闭 */
const ANNOT_DEFAULTS={
  point:{ name:true, coord:false },
  rect:{ name:true, base:false, radius:false, edge:false, vertex:false, perimeter:true, area:true },
  line:{ name:true, node:false, edge:true, perimeter:true, area:true }
};
/** 该对象（按 kind）支持的标注开关键列表 */
function annotKeys(kind){ return ANNOT_KEYS[kind]||[]; }
/** 标注键的面板/提示显示名：同一键在不同类型下语义不同（折线「段长」/区域「边长」，闭合折线节点即「顶点坐标」） */
function annotLabel(o,key){
  if(key==='edge') return o&&o.kind==='line'?'段长':'边长';
  if(key==='node') return o&&o.closed?'顶点坐标':'节点坐标';
  return ANNOT_LABELS[key]||key;
}
/** 某标注键的类型默认值（保持既有观感） */
function annotDefault(o,key){ const d=(o&&ANNOT_DEFAULTS[o.kind])||{}; return d[key]===true; }
/**
 * 全局总开关作为「未显式配置」对象的缺省值：
 * 编号↔显示标签；折线段长↔段长度标注；折线/区域的周长面积↔图上显示面积。
 * 返回 null 表示该键没有对应的全局开关（如基点/半径/顶点/节点/点坐标）。
 */
function annotGlobalDefault(o,key){
  const S=state.settings||{};
  if(key==='name') return S.showLabels!==false;
  if(o&&o.kind==='line'){
    if(key==='edge') return S.showSegLen!==false;
    if(key==='perimeter') return (o.closed?S.showAreaTag!==false:S.showSegLen!==false);
    if(key==='area') return S.showAreaTag!==false;
  }
  if(o&&o.kind==='rect'&&(key==='area'||key==='perimeter')) return S.showAreaTag!==false;
  return null;
}
/**
 * 某对象某标注是否开启。优先级：显式逐对象配置 > 对应全局总开关（仅作缺省） > 类型默认。
 * 因此全局开关不会覆盖对象的显式配置——配置后无论全局如何切换、选中哪个对象，都按对象自身配置显示。
 */
function annotOn(o,key){
  const a=o&&o.annot;
  if(a&&typeof a[key]==='boolean') return a[key];
  const g=annotGlobalDefault(o,key);
  return g===null?annotDefault(o,key):g;
}
/** 写入某标注开关（仅接受布尔值），返回是否变化 */
function setAnnot(o,key,val){
  if(!o||!annotKeys(o.kind).includes(key)) return false;
  o.annot=o.annot||{};
  const v=!!val;
  const changed=o.annot[key]!==v;
  o.annot[key]=v; o.updatedAt=nowISO();
  return changed;
}
