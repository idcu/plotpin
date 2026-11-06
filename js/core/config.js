/* config.js —— 常量、内置类型（零 DOM 依赖，须最先加载） */
/* ============================================================
 * 图钉 PlotPin —— 离线图纸标注工具
 * 零第三方依赖：状态 / 几何 / 渲染 / 交互 / 导入导出
 * ============================================================ */
const SCHEMA = 'offline-drawing-annotation/v2';
/* 旧版 v1 → v2：v2 为每个楼层补 `updatedAt`（协作 LWW 的楼层级时间戳），读取时迁移并回写。
 * 旧档没有时间戳的楼层保留空串（""），避免「打开旧文件」被误判为最新写入而覆盖他人编辑。 */
const SCHEMA_V1 = 'offline-drawing-annotation/v1';
const SCHEMA_READABLE = Object.freeze([SCHEMA, SCHEMA_V1]);
function isReadableSchema(schema){ return SCHEMA_READABLE.includes(String(schema||'')); }
const LS_KEY = 'offline-drawing-annotation.project';
const SETTINGS_KEY = 'offline-drawing-annotation.settings';
const DB_NAME = 'offline_drawing_annotation';
const DB_VERSION = 2;
const DB_STORE = 'projects';
const DB_ASSETS = 'assets';
const EPS = 1e-8;
/* 底图压缩阈值：最长边超过 BG_MAX_EDGE 的栅格图统一降采样；超过 BG_RECOMPRESS_LIMIT 的透明图转 JPEG */
const BG_MAX_EDGE = 3000;
const BG_JPEG_QUALITY = 0.85;
const BG_RECOMPRESS_LIMIT = 6 * 1024 * 1024;
/* 统一的资源边界（缩放/图标倍率/段长标注阈值/底图解码上限/导入限值），避免魔法数字散落各处 */
const APP_LIMITS = Object.freeze({
  ZOOM_MIN: 0.02, ZOOM_MAX: 200,
  ICON_SCALE_MIN: 0.2, ICON_SCALE_MAX: 8,
  SEG_LABEL_MIN_PX: 26, SEG_LABEL_MIN_PX_MIN: 10, SEG_LABEL_MIN_PX_MAX: 60,
  BG_MAX_EDGE, BG_JPEG_QUALITY, BG_RECOMPRESS_LIMIT,
  BG_MAX_DECODE_PIXELS: 40 * 1000 * 1000,   /* 单张图片解码像素上限（约 40MP），防大图冻结主线程 */
  ASSET_MAX_BYTES: 16 * 1024 * 1024,        /* 单个内容寻址资产（底图/照片）字节上限 */
  IMPORT_FILE_MAX_BYTES: 32 * 1024 * 1024,  /* 导入文件字节上限（JSON/CSV/XLSX/DXF/PDF/图片） */
  IMPORT_TEXT_MAX_CHARS: 32 * 1024 * 1024,  /* 文本类导入字符上限（JSON/CSV 先读入内存） */
  IMPORT_ROWS_MAX: 20000,                   /* 表格导入行数上限 */
  IMPORT_ENTITIES_MAX: 100000,              /* DXF/PDF 实体上限 */
  OBJECTS_MAX: 100000,                      /* 单工程对象上限（含所有楼层） */
  HISTORY_MAX: 20,                          /* 撤销栈深度 */
  TOMBSTONE_MAX: 20000,                     /* 删除墓碑硬上限：按对象 id 长期保留，仅在超限时淘汰 */
  TOMBSTONE_EVICT_BATCH: 2000,              /* 增量淘汰批量：攒够一批才压缩一次，避免每次删除都全量排序 */
  TOMBSTONE_RETENTION_DAYS: 730,            /* 墓碑保留窗口：只有超过该天数的旧墓碑才允许按时间淘汰 */
  COVERAGE_TARGET_CELLS: 18000,             /* 覆盖率栅格固定目标总格数（按区域面积分配，与视口缩放无关） */
  COVERAGE_MAX_CELLS: 200000,               /* 单次覆盖率分析的栅格总格数上限（大场地性能护栏） */
  COVERAGE_CELL_MIN_M: 0.03,                /* 覆盖率格边下限（m），防止极小区域产生过量格 */
  COVERAGE_CELL_MAX_M: 10,                  /* 覆盖率格边上限（m），防止超大场地粗于 10m（超格数上限时仍会统一放大） */
  SNAPSHOT_MAX_PER_PROJECT: 20,             /* 每个工程保留的版本快照上限（超出淘汰最旧） */
  SNAPSHOT_MAX_BYTES_PER_PROJECT: 16*1048576 /* 每个工程快照数据总量上限（16MB，超出淘汰最旧；单条超限仍保留） */
});
/** 导入限值统一校验：传 {bytes,chars,rows,entities,objects,pixels} 的已知项，返回超限字段列表（空=通过） */
function importLimitErrors(spec){
  const s=spec||{}, errs=[];
  const over=(key,val,max)=>{ if(Number(val)>max) errs.push(key); };
  over('file', s.bytes, APP_LIMITS.IMPORT_FILE_MAX_BYTES);
  over('text', s.chars, APP_LIMITS.IMPORT_TEXT_MAX_CHARS);
  over('rows', s.rows, APP_LIMITS.IMPORT_ROWS_MAX);
  over('entities', s.entities, APP_LIMITS.IMPORT_ENTITIES_MAX);
  over('objects', s.objects, APP_LIMITS.OBJECTS_MAX);
  over('pixels', s.pixels, APP_LIMITS.BG_MAX_DECODE_PIXELS);
  return errs;
}
/** 超限提示：字段名 → 中文可读提示（与 importLimitErrors 的键一一对应） */
function importLimitMessage(errs){
  const map={file:'文件过大',text:'文本过长',rows:'表格行数过多',entities:'图形实体过多',objects:'对象数量过多',pixels:'图片像素过大'};
  return (errs||[]).map(k=>map[k]||k).join('、');
}

/* -------------------- 第三方公共模块（ngm.vendor）可用性 -------------------- */
/* 说明：导出/导入依赖 vendor 提供的适配器全局（Dxf/Xlsx/Pdf/PdfRead/Qr/ContentAssets）与底层
 * `__idcu*` 命名空间。单文件包或裁剪部署里任一模块缺失时，原先会在调用处抛
 * `Cannot read properties of undefined`；统一走 ensureVendor() 给出可读中文错误。 */
const VENDOR_LABELS=Object.freeze({
  Dxf:'DXF 解析/生成', Xlsx:'XLSX 读写', Pdf:'PDF 导出', PdfRead:'PDF 解析', Qr:'二维码编码',
  ContentAssets:'资产库',
  __idcuDxf:'DXF 解析/生成', __idcuXlsx:'XLSX 读写', __idcuPdf:'PDF 生成',
  __idcuPdfImage:'PDF 多页生成', __idcuQr:'二维码编码', __idcuAssets:'资产库', __idcuGeometry:'几何内核'
});
/** 取第三方公共模块；缺失时抛出带中文模块名的错误 */
function ensureVendor(name){
  const v=typeof globalThis!=='undefined'?globalThis[name]:undefined;
  if(!v) throw new Error('公共模块未加载：'+(VENDOR_LABELS[name]||name));
  return v;
}

/* 点类型的 scaleShape：设置对象“物理尺寸(m)”后按世界坐标渲染（随底图缩放），
 * none=始终屏幕固定图标（纯位置标识）；circle 圆 / square 方 / sector 扇形视场（fov 张角）/ bar 杆 */
const POINT_SCALE_SHAPES = {none:'仅位置图标', circle:'圆形覆盖', square:'方形区域', sector:'扇形视场', bar:'杆/线段'};
/* 图元图标白名单：与 render.js drawPoint 的绘制分支一一对应。
 * type.icon 来自可编辑数据（导入 JSON / 插件 / 旧存档），任意字符串不得进入 UI 或导出。 */
const TYPE_ICONS = Object.freeze(['marker','camera','dome','light','gate','charger','warning','custom','symbol','rect','line','text','dimension']);
const DEFAULT_ICON_BY_KIND = Object.freeze({point:'custom', rect:'rect', line:'line'});
/** 图标白名单化：未知值回退到 kind 默认值，绝不回传调用方传入的原始字符串 */
function normalizeIcon(icon, kind){
  const v=String(icon||'');
  if(TYPE_ICONS.includes(v)) return v;
  return DEFAULT_ICON_BY_KIND[kind]||'marker';
}
const BUILTIN_TYPES = [
  {id:'point.marker', kind:'point', name:'通用标记', color:'#2563eb', icon:'marker', scaleShape:'none', builtin:true},
  {id:'point.camera', kind:'point', name:'摄像头', color:'#dc2626', icon:'camera', scaleShape:'sector', fov:90, builtin:true},
  {id:'point.dome', kind:'point', name:'球机', color:'#1d4ed8', icon:'dome', scaleShape:'circle', builtin:true},
  {id:'point.light', kind:'point', name:'路灯', color:'#ca8a04', icon:'light', scaleShape:'circle', builtin:true},
  {id:'point.gate', kind:'point', name:'道闸', color:'#ea580c', icon:'gate', scaleShape:'bar', builtin:true},
  {id:'point.charger', kind:'point', name:'充电桩', color:'#0f766e', icon:'charger', scaleShape:'square', builtin:true},
  {id:'point.warning', kind:'point', name:'警示点', color:'#f59e0b', icon:'warning', scaleShape:'none', builtin:true},
  {id:'point.custom', kind:'point', name:'自定义点', color:'#7c3aed', icon:'custom', scaleShape:'none', builtin:true},
  /* 行业标准图元：来自 symbols.js 的 36 个 24×24 线性图标（视频监控/门禁/消防/网络/停车/其他） */
  ...((typeof SYMBOL_LIBRARY!=='undefined'?SYMBOL_LIBRARY:[]).map(sym=>({
    id:sym.id, kind:'point', name:sym.name, color:'#1e293b', icon:'symbol', scaleShape:'none',
    builtin:true, symbol:sym.paths.map(p=>typeof p==='string'?{d:p,fill:false}:p),
    symbolViewBox:sym.views, category:sym.cat
  }))),
  {id:'rect.area', kind:'rect', name:'普通区域', color:'#2563eb', icon:'rect', builtin:true, defaultStyle:{fillAlpha:.13,strokeWidth:.12}},
  {id:'rect.parking', kind:'rect', name:'车位区域', color:'#16a34a', icon:'rect', builtin:true, defaultStyle:{fillAlpha:.18,strokeWidth:.12}},
  {id:'rect.building', kind:'rect', name:'建筑/遮挡', color:'#6b7280', icon:'rect', builtin:true, defaultStyle:{fillAlpha:.28,strokeWidth:.12}},
  {id:'rect.aisle', kind:'rect', name:'通道', color:'#0891b2', icon:'rect', builtin:true, defaultStyle:{fillAlpha:.12,strokeWidth:.12}},
  {id:'line.boundary', kind:'line', name:'围墙/边界', color:'#334155', icon:'line', builtin:true, defaultStyle:{strokeWidth:.14,closed:false}},
  {id:'line.fence', kind:'line', name:'围栏', color:'#92400e', icon:'line', builtin:true, defaultStyle:{strokeWidth:.10,closed:false}},
  {id:'line.vehicle', kind:'line', name:'车行线', color:'#1d4ed8', icon:'line', builtin:true, defaultStyle:{strokeWidth:.12,closed:false}},
  {id:'line.pedestrian', kind:'line', name:'人行线', color:'#16a34a', icon:'line', builtin:true, defaultStyle:{strokeWidth:.10,closed:false}},
  {id:'line.custom', kind:'line', name:'自定义线', color:'#7c3aed', icon:'line', builtin:true, defaultStyle:{strokeWidth:.10,closed:false}},
  {id:'text.builtin', kind:'text', name:'文字', color:'#111827', icon:'text', builtin:true},
  {id:'dimension.distance', kind:'dimension', name:'尺寸标注', color:'#111827', icon:'dimension', builtin:true}
];
