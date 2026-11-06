/* io-fields.js —— 导出字段描述表与行渲染器（CSV/TSV/XLSX/PDF/打印报告/GeoJSON/SVG/DXF 的唯一字段源） */
/* 单一字段描述表：每个条目声明键名、取值函数以及进入哪些导出格式。
   各格式只负责布局（列宽/列序/文本模板），不得再各自拼装对象字段。 */
const EXPORT_FIELD_DEFS=[
  {key:'编号',table:true,get:c=>c.o.name},
  {key:'名称',table:true,get:c=>c.o.text||''},
  {key:'对象类型',table:true,get:c=>kindName(c.o.kind)},
  {key:'业务类型',table:true,get:c=>c.type.name},
  {key:'图层',table:true,get:c=>c.layer.name},
  {key:'型号',table:true,ledger:'model',get:c=>c.o.props.model||''},
  {key:'安装高度',table:true,ledger:'mountHeight',get:c=>c.o.props.mountHeight!==undefined?c.o.props.mountHeight:''},
  {key:'IP',table:true,ledger:'ip',get:c=>c.o.props.ip||''},
  {key:'责任人',table:true,ledger:'owner',get:c=>c.o.props.owner||''},
  {key:'X',table:true,get:c=>fmt(c.o.x)},
  {key:'Y',table:true,get:c=>fmt(c.o.y)},
  {key:'角度',table:true,get:c=>c.shape.angle},
  {key:'宽度',table:true,get:c=>c.shape.w?fmt(c.shape.w):''},
  {key:'高度',table:true,get:c=>c.shape.h?fmt(c.shape.h):''},
  {key:'形状',table:true,get:c=>c.shape.label},
  {key:'形状参数',table:true,get:c=>c.shape.param},
  {key:'闭合',table:true,get:c=>c.o.kind==='line'?(c.o.closed?'是':'否'):''},
  {key:'标注类型',table:true,get:c=>c.o.kind==='dimension'?(DIM_SUB_LABELS[c.o.subtype]||c.o.subtype||''):''},
  {key:'节点坐标',table:true,get:c=>(c.o.kind==='line'||c.o.kind==='dimension')&&c.o.points?.length?formatNodeCoords(c.o.points):''},
  {key:'节点数',table:true,get:c=>c.o.points?.length||0},
  {key:'长度',table:true,get:c=>objectLength(c.o)?fmt(objectLength(c.o)):''},
  {key:'面积',table:true,get:c=>objectArea(c.o)?fmt(objectArea(c.o)):''},
  {key:'显示',table:true,get:c=>c.o.visible?'是':'否'},
  {key:'锁定',table:true,get:c=>c.o.locked?'是':'否'},
  {key:'备注',table:true,get:c=>c.o.props.note||''},
  {key:'更新时间',table:true,get:c=>c.o.updatedAt},
  {key:'楼层',table:true,get:c=>c.floorName},
  /* 合成列：PDF 清单与打印报告共用；CSV/TSV/XLSX 不输出（列头与旧版完全一致） */
  {key:'参数',table:false,get:c=>exportParamText(c)}
];
const EXPORT_FIELD_BY_KEY=new Map(EXPORT_FIELD_DEFS.map(f=>[f.key,f]));
/** 完整表格列（CSV/TSV/XLSX 表头，顺序即字段表顺序；兼容旧全局名） */
const TABLE_COLUMNS=EXPORT_FIELD_DEFS.filter(f=>f.table).map(f=>f.key);
/** 设备台账字段（导出与导入共用；key=中文列名，value=props 键） */
const LEDGER_FIELDS=EXPORT_FIELD_DEFS.filter(f=>f.ledger).map(f=>[f.key,f.ledger]);
/** 区域形状导出摘要：外接盒宽高/角度/形状名/形状参数只在此计算一次 */
function exportShapeSummary(o){
  let w='',h='',angle=o.angle||0,label='',param='';
  if(o.kind==='rect'){
    const tt=areaShapeType(o), sh=o.shape||{};
    label=AREA_SHAPE_LABELS[tt]||'';
    if(tt==='rect'){ w=o.width; h=o.height; }
    else if(tt==='parallelogram'){ w=o.width; h=o.height; param=String(Math.round(parallelogramSkew(sh))); }
    else if(tt==='circle'){ w=h=2*sh.r; }
    else if(tt==='ellipse'){ w=2*sh.rx; h=2*sh.ry; }
    else { w=h=2*sh.r; param=Math.round(Number(sh.a0)||0)+','+Math.round(Number(sh.a1)||0); }
  }
  return {w,h,angle,label,param};
}
/** 单一对象行渲染器：所有表格型导出都从这里取一行 */
function buildExportRow(o,floorName){
  const c={o,floorName,type:getType(o.typeId),layer:layerOf(o),shape:exportShapeSummary(o)};
  const row={};
  EXPORT_FIELD_DEFS.forEach(f=>{ row[f.key]=f.get(c); });
  return row;
}
/** 「参数」合成列：非矩形区域=形状[ 参数]；矩形=矩形；折线/标注=闭合[ 标注类型] */
function exportParamText(c){
  const label=c.shape.label, param=c.shape.param;
  if(label!==''&&label!=='矩形') return label+(param?' '+param:'');
  if(label==='矩形') return '矩形';
  const closed=c.o.kind==='line'&&c.o.closed?'闭合':'';
  const dim=c.o.kind==='dimension'?(DIM_SUB_LABELS[c.o.subtype]||c.o.subtype||''):'';
  return closed+(dim?' '+dim:'');
}
/** PDF 清单列布局（值仍来自字段表；仅列宽/列序属于格式层） */
const PDF_COLS=[['编号',110],['名称',120],['对象类型',100],['业务类型',130],['图层',110],['X',90],['Y',90],['参数',190],['长度',90],['面积',100]];
/** 打印报告清单列布局（顺序与旧版一致） */
const REPORT_LIST_COLS=['编号','对象类型','业务类型','图层','X','Y','参数'];
/** XLSX 表格数据（纯函数：表头 + 全楼层行，导出与自测共用） */
function xlsxExportTable(){
  const cols=TABLE_COLUMNS;
  return [cols,...objectRowsAll().map(r=>cols.map(c=>String(r[c]??'')))];
}
/** 尺寸标注读数：SVG/DXF 共用的唯一数值源（文本模板仍由各格式决定） */
function dimensionMeasure(o){
  const ps=o.points||[];
  if(o.subtype==='ruler') return {kind:'ruler',length:objectLength(o)};
  if(o.subtype==='distance') return {kind:'distance',length:ps.length>=2?dist(ps[0],ps[1]):0};
  if(o.subtype==='area') return {kind:'area',area:polygonArea(ps),perimeter:ps.length?polylineLength(ps.concat([ps[0]])):0};
  if(o.subtype==='angle') return {kind:'angle',deg:dimensionAngleDeg(ps)};
  return {kind:o.subtype||''};
}
/** 盲区 GeoJSON 属性字段表（导出唯一来源） */
const BLIND_SPOT_FIELDS=[
  {key:'region',get:(r)=>r.regionName},
  {key:'regionId',get:(r)=>r.regionId},
  {key:'index',get:(r,i)=>i+1}
];
/** 纯函数：盲区 GeoJSON FeatureCollection（不触发下载；口径元数据与旧版一致） */
function buildBlindSpotGeoJson(cov){
  if(!cov||!cov.regions||!cov.regions.length) return null;
  const rects=blindSpotRects(cov);
  if(!rects.length) return null;
  const features=rects.map((r,i)=>{
    const properties={};
    BLIND_SPOT_FIELDS.forEach(f=>{ properties[f.key]=f.get(r,i); });
    return {
      type:'Feature',
      properties,
      geometry:{type:'Polygon',coordinates:[r.points.concat([r.points[0]])]}
    };
  });
  /* 导出的报告必须自带口径，避免与历史 v1（随缩放变化）数值混用 */
  const cells=cov.regions.map(r=>r.cell);
  const spec=cov.spec||{version:2};
  return {
    type:'FeatureCollection',
    coverageSpec:{version:spec.version,targetCells:cov.targetCells,gridCells:cov.gridCells,
      cellMinM:cells.length?Math.min(...cells):0,cellMaxM:cells.length?Math.max(...cells):0,zoomIndependent:true},
    features
  };
}
