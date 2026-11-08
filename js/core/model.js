/* model.js —— DOM 引用、运行时状态、工程模型工厂、类型/图层/样式辅助 */
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const wrap = document.getElementById('canvasWrap');
const $ = id => document.getElementById(id);

/* 规则配置常量必须先于 state 初始化，避免 createRuleConfig 访问 TDZ */
const RULE_CONFIG_VERSION = 1;
const RULE_TOLERANCE_MAX = 1000;
const RULE_TYPE_LIMIT = 200;
/* 统计页越界口径版本（RT-P2-14）：与规则页共用场地包围盒/容差，口径变化时递增并标注 */
const STATS_ISSUE_VERSION = 2;

let state = createInitialState();
let bgImage = null;
let bgImageState = 'none';
let bgImageErrorNotified = false;
let bgDataUrl = '';      // 运行时底图（dataURL，仅内存；持久化走 assets 库的 assetId）
let bgLoadSeq = 0;       // 防止旧底图异步加载覆盖新底图
let currentTool = 'select';
let selectedIds = new Set();
let history = { past: [], future: [] };
let clipboard = [];
let draft = null;
let symbolPlace = { angle: 0, phys: 0 };   /* 符号库放置选项：旋转角与真实尺寸（临时，不持久化） */
let drag = null;
let rubber = null;
let calibPoints = [];
let spaceDown = false;
let saveTimer = null;
let dpr = 1;
let coverageResult = null;   /* 视场覆盖率分析结果（含逐区域栅格），供画布叠加层与报告弹窗；对象/底图变更后清空 */
/* CORE-P2-19：清空结果与离屏缓存走同一入口，避免只置 null 导致栅格 canvas 常驻 */
function clearCoverageResult(){
  coverageResult=null;
  if(typeof releaseCoverageLayers==='function') releaseCoverageLayers();
}
let affinePairs = [];        /* 仿射校准对应点集：[{u,v,x,y}]，像素(u,v y-down) → 实地(x,y y-up) */
let calibSelection = null;   /* 校准中选中的控制点：{kind:'calibrate'|'affine',part?,index} */
let calibUndoStack = [];     /* 校准控制点专用撤销栈（增/删/拖拽提交前快照；不污染工程撤销历史） */

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
 * @typedef {Object} Site
 * @property {string} type 固定为 'site'（与图片栅格槽区分）
 * @property {string} id
 * @property {string} name
 * @property {string} layerId
 * @property {boolean} visible
 * @property {boolean} locked
 * @property {Object} annot
 * @property {Object} style
 * @property {string} kind 场地形状类型（=shape.type，兼容旧代码）
 * @property {Object} shape 世界坐标形状参数（米）
 * @typedef {Object} Floor
 * @property {string} id
 * @property {string} name
 * @property {Object} [background] 图片栅格槽
 * @property {Site|null} [site] 矢量场地槽
 * @property {DrawingObject[]} [objects]
 * @property {Object} [viewport]
 * @property {string} [updatedAt]
 * @typedef {Object} ProjectState
 * @property {string} schema
 * @property {Object} meta
 * @property {Object} settings
 * @property {Object} viewport
 * @property {Object} background 图片栅格槽（kind:'empty'|'image'）
 * @property {Site|null} site 矢量场地槽（独立于 objects）
 * @property {Layer[]} layers
 * @property {ObjectType[]} objectTypes
 * @property {DrawingObject[]} objects
 * @property {Floor[]} floors
 * @property {string} activeFloorId
 * @property {Tombstone[]} tombstones
 */
/* -------------------- 图框 / 标题栏模板（B-07） -------------------- */
/** 标题栏文本上限（字符）；超长截断，控制字符替换为空格，避免 SVG/PDF 文本层被污染 */
const TITLE_BLOCK_TEXT_MAX=80;
/** 字段顺序即导出渲染顺序；required 仅表示常用字段（空值时导出显示占位符） */
const TITLE_BLOCK_FIELDS=[
  {key:'projectName',label:'工程名'},
  {key:'drawingNo',label:'图号'},
  {key:'scale',label:'比例'},
  {key:'date',label:'日期'},
  {key:'version',label:'版本'},
  {key:'designer',label:'设计'},
  {key:'checker',label:'审核'},
  {key:'unitName',label:'单位'}
];
function titleBlockText(v){
  return String(v==null?'':v).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,TITLE_BLOCK_TEXT_MAX);
}
/** 默认模板：总开关关闭（保证既有 PNG/PDF/SVG 导出字节不变）；日期/比例留空=导出时自动 */
function createTitleBlock(){
  return {enabled:false,frame:true,scaleBar:true,legend:true,
    fields:{projectName:'',drawingNo:'',scale:'',date:'',version:'V1.0',designer:'',checker:'',unitName:''}};
}
/** 旧档/脏数据归一：缺字段按默认模板降级，布尔项缺省开启（仅当 enabled 后生效） */
function normalizeTitleBlock(raw){
  const out=createTitleBlock();
  if(!raw||typeof raw!=='object') return out;
  out.enabled=!!raw.enabled;
  out.frame=raw.frame!==false;
  out.scaleBar=raw.scaleBar!==false;
  out.legend=raw.legend!==false;
  const f=raw.fields&&typeof raw.fields==='object'?raw.fields:{};
  TITLE_BLOCK_FIELDS.forEach(def=>{ if(f[def.key]!==undefined) out.fields[def.key]=titleBlockText(f[def.key]); });
  return out;
}
/* -------------------- 几何规则检查配置（C-05） -------------------- */
/** 规则配置默认值：不内置任何规范数值；间距阈值默认为空，需用户按项目填写 */
function createRuleConfig(){
  return {
    version: RULE_CONFIG_VERSION,
    scope: 'all',
    overlap: { enabled:true, tolerance:0.05 },
    spacing: { enabled:true, types:{} },
    bounds:  { enabled:true, tolerance:0.05 }
  };
}
function ruleTolerance(v,fb){
  const n=Number(v);
  return Number.isFinite(n)&&n>=0&&n<=RULE_TOLERANCE_MAX?Math.round(n*1000)/1000:fb;
}
function normalizeRuleTypes(raw){
  const out={};
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return out;
  Object.keys(raw).slice(0,RULE_TYPE_LIMIT).forEach(k=>{
    if(!/^[A-Za-z0-9_.-]{1,80}$/.test(k)) return;
    const n=Number(raw[k]);
    if(Number.isFinite(n)&&n>=0&&n<=RULE_TOLERANCE_MAX) out[k]=Math.round(n*1000)/1000;
  });
  return out;
}
/** 旧档/脏数据归一：只保留已知规则字段，范围夹取，未知字段剔除 */
function normalizeRuleConfig(raw){
  const out=createRuleConfig();
  if(!raw||typeof raw!=='object') return out;
  if(raw.scope==='current'||raw.scope==='all') out.scope=raw.scope;
  if(raw.overlap&&typeof raw.overlap==='object'){
    out.overlap.enabled=raw.overlap.enabled!==false;
    out.overlap.tolerance=ruleTolerance(raw.overlap.tolerance,out.overlap.tolerance);
  }
  if(raw.spacing&&typeof raw.spacing==='object'){
    out.spacing.enabled=raw.spacing.enabled!==false;
    out.spacing.types=normalizeRuleTypes(raw.spacing.types);
  }
  if(raw.bounds&&typeof raw.bounds==='object'){
    out.bounds.enabled=raw.bounds.enabled!==false;
    out.bounds.tolerance=ruleTolerance(raw.bounds.tolerance,out.bounds.tolerance);
  }
  return out;
}
/* -------------------- 初始化 / 工程数据 -------------------- */
/** 设置键白名单（唯一真源）：从默认设置派生，持久化与启动合并共用，避免第二套清单漏键。 */
const SETTINGS_KEYS=Object.freeze(Object.keys(createInitialState().settings));
/** @returns {ProjectState} 新工程状态 */
function createInitialState(){
  const now = new Date().toISOString();
  return {
    schema: SCHEMA,
    meta: { id: uid('PRJ'), name: '未命名图纸工程', createdAt: now, updatedAt: now, titleBlock: createTitleBlock() },
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
    rules: createRuleConfig(), /* C-05 几何规则检查配置：随工程保存 */
    viewport: { zoom:1, panX:0, panY:0 },
    /* 双槽：background 只承载图片栅格（kind:'empty'|'image'）；site 独立承载矢量场地（世界坐标米）。
       两者互不覆盖，每层最多 1 图 + 1 场地；场地不进 objects，不占编号/表格行。 */
    background: createEmptyBackground(),
    site: createSiteSlot(defaultSiteShape()),
    layers: [{ id:'layer.default', name:'默认图层', visible:true, locked:false }],
    objectTypes: deepClone(BUILTIN_TYPES),
    objects: [],
    /* 多楼层/多底图：floors 保存全部楼层元数据；非当前楼层额外持有 background/site/objects/viewport。
       当前楼层的可编辑数据始终是顶层 state.background / state.site / state.objects（切换与保存时同步）。 */
    floors: [{ id:'floor.default', name:'1F', updatedAt: now }],
    activeFloorId: 'floor.default',
    /* 删除墓碑（离线 LWW 合并用）：{id, deletedAt, kind:'object'|'floor'}。
       对象被删除后保留删除时间，合并他人工程时用于判定「删除」与「较新编辑」谁生效。 */
    tombstones: []
  };
}
function uid(prefix='O'){
  return prefix + '_' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,7).toUpperCase();
}
/** 当前生效的编号作用域（批量创建时由 beginObjectNameScope 建立） */
let objectNameScope = null;

/**
 * 统一清理交互瞬态（N-15）：草稿、拖拽、框选、捕捉高亮、参考线、覆盖率叠加。
 * 载入工程 / 撤销 / 重做 / 切层 / 快照回滚 / 协作合并都走这里，避免各入口漏清。
 * keepCalib=true 时保留比例尺校准点（快照回滚不应打断校准）；仿射校准草稿始终清空。
 * 只清内存瞬态，不改 state/history，也不触发落盘。
 */
function resetTransientInteractionState(opts){
  const keepCalib=!!(opts&&opts.keepCalib);
  const keepCoverage=!!(opts&&opts.keepCoverage);
  const keepGuides=!!(opts&&opts.keepGuides);
  draft=null; drag=null; rubber=null;
  activeOsnap=null; trackLine=null; refEdge=null; osnapMode=null;
  if(!keepCoverage) clearCoverageResult();
  if(!keepGuides&&typeof clearGuides==='function') clearGuides();
  if(!keepCalib) calibPoints=[];
  affinePairs=[]; calibSelection=null; calibUndoStack=[];
  if(typeof document!=='undefined'&&document.body&&document.body.classList) document.body.classList.remove('panning');
}
/**
 * 编号作用域：一次性聚集合法的已占用编号，作用域内 reserve() 只做集合查找。
 * 起点沿用旧 nextObjectId 的语义：从“已占用数量 + 1”开始找空位并跳过已占用编号。
 * @param {Set<string>|string[]} used 已占用编号（会被就地写入新编号，调用方需自备集合）
 */
function objectNameScopeFor(used){
  const set = used instanceof Set ? used : new Set(Array.isArray(used) ? used : []);
  let seq = set.size + 1;
  return {
    reserve(){
      let name;
      do{ name = 'O' + String(seq).padStart(4, '0'); seq++; } while(set.has(name));
      set.add(name);
      return name;
    }
  };
}
/** 建立编号作用域并返回复原函数；批量路径必须 try/finally 复原（可嵌套，内层优先） */
function beginObjectNameScope(used){
  const prev = objectNameScope;
  objectNameScope = objectNameScopeFor(used);
  return () => { objectNameScope = prev; };
}
/** 在编号作用域内同步执行 fn；异常时也会复原外层作用域 */
function withObjectNameScope(used, fn){
  const restore = beginObjectNameScope(used);
  try{ return fn(); } finally{ restore(); }
}
function nextObjectId(){
  /* 批量路径命中作用域：O(1) 取号；单次交互创建仍走一次全量扫描（O(N)，可接受） */
  if(objectNameScope) return objectNameScope.reserve();
  return objectNameScopeFor(allObjectNames()).reserve();
}
/** 全工程既有对象编号（跨楼层唯一性检查用） */
function allObjectNames(){
  const used=new Set();
  state.objects.forEach(o=>{ if(o&&o.name) used.add(o.name); });
  (state.floors||[]).forEach(f=>{
    if(f.id===state.activeFloorId) return;
    (f.objects||[]).forEach(o=>{ if(o&&o.name) used.add(o.name); });
  });
  return used;
}
/** 批量重排编号：prefix+三位序号，按 start/step 递增，自动跳过 used 中已占用编号。
 *  直接改写对象 name/updatedAt，返回处理数量；调用方负责撤销快照。 */
function renumberObjects(objs,prefix,start=1,step=1,used){
  const items=(objs||[]).filter(Boolean);
  if(!items.length) return 0;
  const prefixText=String(prefix??'');
  let seq=Number.isFinite(Number(start))?Math.max(0,Math.floor(Number(start))):1;
  const stride=Number.isFinite(Number(step))?Math.max(1,Math.floor(Number(step))):1;
  const reserved=used instanceof Set?used:new Set(Array.isArray(used)?used:[]);
  items.forEach(o=>{
    let name;
    do{ name=prefixText+String(seq).padStart(3,'0'); seq+=stride; }while(reserved.has(name));
    o.name=name; o.updatedAt=nowISO(); reserved.add(name);
  });
  return items.length;
}
/** 批量置顶/置底：直接重排对象数组并归一 z（与 commitChange 的 z=顺序 不变式一致），
 *  所选对象之间保持原有视觉顺序。 */
function restackObjects(objects,ids,mode){
  const arr=Array.isArray(objects)?objects:[];
  const idSet=ids instanceof Set?ids:new Set(Array.isArray(ids)?ids:[]);
  const order=arr.map((o,i)=>({o,i,z:Number.isFinite(Number(o&&o.z))?Number(o.z):i}))
    .sort((a,b)=>a.z-b.z||a.i-b.i).map(x=>x.o);
  const sel=order.filter(o=>o&&idSet.has(o.id));
  if(!sel.length) return 0;
  const rest=order.filter(o=>o&&!idSet.has(o.id));
  const ordered=mode==='front'?rest.concat(sel):sel.concat(rest);
  const stamp=nowISO();
  sel.forEach(o=>{ o.updatedAt=stamp; });
  arr.length=0; arr.push(...ordered);
  arr.forEach((o,i)=>{ o.z=i; });
  return sel.length;
}
/** @template T @param {T} v @returns {T} */
function deepClone(v){ return JSON.parse(JSON.stringify(v)); }
/* -------------------- 历史快照：结构共享 -------------------- */
/**
 * 历史快照的不可枚举标记。只有本实现生成的快照才能参与「结构共享 / 物化」；
 * 外部（自测、调试、旧代码）手工 push 的普通 state 对象继续走旧语义：
 * 直接成为 live state，避免共享到会被就地编辑的普通对象。
 */
const HISTORY_SNAPSHOT_TAG = Symbol('historySnapshot');
/** @param {*} v @returns {boolean} */
function isHistorySnapshot(v){
  return !!(v && typeof v === 'object' && v[HISTORY_SNAPSHOT_TAG] === HISTORY_SNAPSHOT_TAG);
}
/** 深比较两份可序列化快照值（state 内只有 JSON 安全值，无循环引用） */
function historyValueEqual(a, b){
  if(a === b) return true;
  if(a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  const aArr = Array.isArray(a), bArr = Array.isArray(b);
  if(aArr !== bArr) return false;
  if(aArr){
    if(a.length !== b.length) return false;
    for(let i = 0; i < a.length; i++) if(!historyValueEqual(a[i], b[i])) return false;
    return true;
  }
  const ak = Object.keys(a), bk = Object.keys(b);
  if(ak.length !== bk.length) return false;
  for(const k of ak){
    if(!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if(!historyValueEqual(a[k], b[k])) return false;
  }
  return true;
}
/**
 * 生成结构共享的历史快照：与上一份**已标记快照**逐层比较，未变子树直接复用，
 * 变化子树新建；字符串（含照片 base64）按引用共享，不复制字节。
 * 只与 tagged prev 共享——普通对象可能是 live state，复用会让快照被后续编辑污染。
 * @param {object} src 当前 live state
 * @param {object|null} prev 上一份历史快照（可缺省）
 * @returns {object} 不可变快照（顶层带不可枚举标记）
 */
function snapshotHistoryState(src, prev){
  const shared = sharedHistoryValue(src, isHistorySnapshot(prev) ? prev : undefined);
  if(shared && typeof shared === 'object' && !isHistorySnapshot(shared)){
    try{ Object.defineProperty(shared, HISTORY_SNAPSHOT_TAG, { value: HISTORY_SNAPSHOT_TAG, enumerable: false }); }catch(_){}
  }
  return shared;
}
function sharedHistoryValue(src, prev){
  if(src === null || typeof src !== 'object') return src;   /* 原始值（含字符串）天然按引用共享 */
  if(Array.isArray(src)){
    const prevArr = Array.isArray(prev) ? prev : null;
    const out = new Array(src.length);
    let same = !!prevArr && prevArr.length === src.length;
    for(let i = 0; i < src.length; i++){
      out[i] = sharedHistoryValue(src[i], prevArr ? prevArr[i] : undefined);
      if(same && out[i] !== prevArr[i]) same = false;
    }
    return same && prevArr ? prevArr : out;
  }
  const keys = Object.keys(src);
  const prevObj = (prev && typeof prev === 'object' && !Array.isArray(prev)) ? prev : null;
  if(!prevObj){
    const out = {};
    for(const k of keys) out[k] = sharedHistoryValue(src[k], undefined);
    return out;
  }
  const prevKeys = Object.keys(prevObj);
  let same = prevKeys.length === keys.length;
  const out = {};
  for(const k of keys){
    const v = sharedHistoryValue(src[k], prevObj[k]);
    out[k] = v;
    if(same && (!Object.prototype.hasOwnProperty.call(prevObj, k) || v !== prevObj[k])) same = false;
  }
  return same ? prevObj : out;
}
/**
 * 把历史快照物化为可安全就地编辑的 live state：
 * 容器（对象/数组）重新分配，字符串等原始值按引用共享（不再复制 base64）。
 * 外部普通条目原样返回，保持旧语义。
 */
function materializeHistoryState(snap){
  if(!isHistorySnapshot(snap)) return snap;
  return copySnapshotContainers(snap);
}
function copySnapshotContainers(v){
  if(v === null || typeof v !== 'object') return v;
  if(Array.isArray(v)) return v.map(copySnapshotContainers);
  const out = {};
  for(const k of Object.keys(v)) out[k] = copySnapshotContainers(v[k]);
  return out;
}
/** @returns {string} ISO 时间 */
function nowISO(){ return new Date().toISOString(); }

/* -------------------- 双槽工厂 / 判定（图片栅格 + 矢量场地） -------------------- */
/** 空图片槽：双槽模型下 background 只承载图片栅格，无图时为 empty */
function createEmptyBackground(){
  return { kind:'empty', fileName:'', assetId:'', width:0, height:0, origin:[0,0],
    metersPerPixel:0.1, calibrated:false, transform:null };
}
/** 默认矢量场地形状（世界坐标米，第一象限） */
function defaultSiteShape(){ return { type:'rect', w:100, h:70 }; }
/**
 * 矢量场地槽：独立于 objects，不占 O 编号/CSV/XLSX 行，不设 typeId。
 * @param {Object} [shape]
 * @returns {Site}
 */
function createSiteSlot(shape){
  const sh = shape || defaultSiteShape();
  return { type:'site', id:'site.default', name:'场地', layerId:'layer.default', visible:true, locked:false,
    annot:{}, style:{}, updatedAt:nowISO(), kind: sh.type || 'rect', shape: deepClone(sh) };
}
/** 图片底图判定：只有 kind==='image' 的槽才承载栅格 */
function isImageBackground(bg){ return !!(bg && bg.kind==='image'); }
/** 场地形状（兼容旧 background 对象） */
function siteShapeOf(site){ return (site && site.shape) || defaultSiteShape(); }
/** 场地所属图层（缺失时返回始终可见/未锁定的占位层，避免旧工程无图层字段时报错） */
function siteLayerOf(site){
  const id = site && site.layerId;
  return (state.layers||[]).find(l=>l.id===id) || { visible:true, locked:false };
}
/** 场地可见 = 自身可见且所属图层可见（与业务对象同一套图层语义） */
function siteIsVisible(site){ return !!(site && site.visible!==false && siteLayerOf(site).visible!==false); }
/** 场地锁定 = 自身锁定或所属图层锁定（锁定后不渲染手柄/不可编辑） */
function siteIsLocked(site){ return !!(site && (site.locked || siteLayerOf(site).locked)); }
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
  const o = Object.assign({
    id: uid('OBJ'), name: '', kind, typeId: typeId || defaultTypeId(kind),
    layerId: 'layer.default', x:0, y:0, points:[], width:0, height:0, angle:0,
    phys:0,   /* 点设备物理尺寸(米，高级)：0=纯位置标识(屏幕固定图标)；>0=按世界比例渲染的覆盖图形 */
    iconSize:1, /* 点设备图标屏幕大小倍率（纯视觉，无物理意义）；与类型默认值、全局倍率连乘 */
    annot:{},   /* 逐对象标注显示开关（点坐标/基点/半径/边长/周长/面积/节点坐标），未显式设置时按类型默认 */
    shape:null, /* 区域参数形状：circle{r}/ellipse{rx,ry}/sector{r,a0,a1}；null=矩形(用 width/height/angle) */
    text:'', closed:false, subtype:kind === 'dimension' ? 'distance' : '',
    style:{}, props:{}, visible:true, locked:false, z:state.objects.length,
    createdAt: nowISO(), updatedAt: nowISO()
  }, patch);
  /* 已显式给编号（导入/停车场等批量路径）时不再扫描既有编号，避免每建一个对象全量扫 state 的 O(N²) */
  if(o.name === undefined || o.name === null || o.name === '') o.name = nextObjectId();
  return o;
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
/**
 * 对象索引：id → 对象。供一次操作内多次按 id 查找（拖拽 originals、批量移动/回滚）复用，
 * 把 N 次 `state.objects.find()` 的 O(N²) 扫描收敛为一次 O(N) 建索引（A-15）。
 * @param {Array} [list] 对象数组，缺省为当前楼层 state.objects
 * @returns {Map<string, object>}
 */
function objectIndexById(list){
  const arr=list||state.objects||[], m=new Map();
  for(const o of arr){ if(o&&o.id&&!m.has(o.id)) m.set(o.id,o); }
  return m;
}

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
  if(o.points.length>=APP_LIMITS.SHAPE_POINTS_MAX) return false;
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
/* 场地标注显示开关：沿用 state.settings 原键（不改 schema、不做迁移），
   控件已从工程设置搬进场地属性面板；六项含义与 drawSiteAnnotations / SVG 导出同口径。 */
const SITE_ANNOT_SETTING_KEYS=['siteNodes','siteSegLen','siteBase','siteRadius','siteArea','sitePerimeter'];
/** 某场地标注开关的当前值（缺省按已有工程默认口径） */
function siteAnnotSettingOn(key){
  if(!SITE_ANNOT_SETTING_KEYS.includes(key)) return false;
  return !!(state.settings&&state.settings[key]);
}
/** 写入场地标注开关（仅接受已登记键与布尔值），返回是否变化 */
function setSiteAnnotSetting(key,val){
  if(!SITE_ANNOT_SETTING_KEYS.includes(key)) return false;
  state.settings=state.settings||{};
  const v=!!val, changed=state.settings[key]!==v;
  state.settings[key]=v;
  return changed;
}
