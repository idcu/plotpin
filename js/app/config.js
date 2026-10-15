/* config.js —— 常量、内置类型（零 DOM 依赖，须最先加载） */
/* ============================================================
 * 图钉 PlotPin —— 离线图纸标注工具
 * 零第三方依赖：状态 / 几何 / 渲染 / 交互 / 导入导出
 * ============================================================ */
const SCHEMA = 'offline-drawing-annotation/v1';
const LS_KEY = 'offline-drawing-annotation.project';
const SETTINGS_KEY = 'offline-drawing-annotation.settings';
const DB_NAME = 'offline_drawing_annotation';
const DB_VERSION = 2;
const DB_STORE = 'projects';
const DB_ASSETS = 'assets';
const EPS = 1e-8;
/* 底图压缩阈值：边超过 BG_MAX_EDGE 的 JPEG，或大于 BG_RECOMPRESS_LIMIT 的其他栅格图，降采样为 JPEG */
const BG_MAX_EDGE = 3000;
const BG_JPEG_QUALITY = 0.85;
const BG_RECOMPRESS_LIMIT = 6 * 1024 * 1024;

/* 点类型的 scaleShape：设置对象“物理尺寸(m)”后按世界坐标渲染（随底图缩放），
 * none=始终屏幕固定图标（纯位置标识）；circle 圆 / square 方 / sector 扇形视场（fov 张角）/ bar 杆 */
const POINT_SCALE_SHAPES = {none:'仅位置图标', circle:'圆形覆盖', square:'方形区域', sector:'扇形视场', bar:'杆/线段'};
const BUILTIN_TYPES = [
  {id:'point.marker', kind:'point', name:'通用标记', color:'#2563eb', icon:'marker', scaleShape:'none', builtin:true},
  {id:'point.camera', kind:'point', name:'摄像头', color:'#dc2626', icon:'camera', scaleShape:'sector', fov:90, builtin:true},
  {id:'point.dome', kind:'point', name:'球机', color:'#1d4ed8', icon:'dome', scaleShape:'circle', builtin:true},
  {id:'point.light', kind:'point', name:'路灯', color:'#ca8a04', icon:'light', scaleShape:'circle', builtin:true},
  {id:'point.gate', kind:'point', name:'道闸', color:'#ea580c', icon:'gate', scaleShape:'bar', builtin:true},
  {id:'point.charger', kind:'point', name:'充电桩', color:'#0f766e', icon:'charger', scaleShape:'square', builtin:true},
  {id:'point.warning', kind:'point', name:'警示点', color:'#f59e0b', icon:'warning', scaleShape:'none', builtin:true},
  {id:'point.custom', kind:'point', name:'自定义点', color:'#7c3aed', icon:'custom', scaleShape:'none', builtin:true},
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
