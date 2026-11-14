/* io-fields.js —— 导出字段描述表与行渲染器（CSV/TSV/XLSX/PDF/打印报告/GeoJSON/SVG/DXF 的唯一字段源） */
/* 公式注入防护（导出加前导单引号、导入去引号还原）：CSV/TSV/XLSX 往返的唯一实现 */
const NUMERIC_CELL_RE=/^-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?(?:\s*[,;，]\s*-?\d+(?:\.\d+)?)*$/;
function formulaGuard(s){
  const t=String(s??'');
  /* 已有前导单引号的值再加一个（双层），导入侧剥离一层，保证字面量 '=SUM(A1) 可逆（IO-P2-4） */
  if(t.charAt(0)==="'") return true;
  return /^[=+\-@\t\r]/.test(t)&&!NUMERIC_CELL_RE.test(t);
}
/** 表格导入用：先还原 ''→'，再仅对公式前缀去引号；字面单引号文本不会被误删 */
function formulaUnguard(s){
  const t=String(s??'');
  if(t.charAt(0)!=="'") return t;
  const rest=t.slice(1);
  if(rest.charAt(0)==="'") return rest;
  return formulaGuard(rest)?rest:t;
}
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
  {key:'角度',table:true,get:c=>fmt(c.shape.angle)},
  {key:'宽度',table:true,get:c=>c.shape.w?fmt(c.shape.w):''},
  {key:'高度',table:true,get:c=>c.shape.h?fmt(c.shape.h):''},
  {key:'形状',table:true,get:c=>c.shape.label},
  {key:'形状参数',table:true,get:c=>c.shape.param},
  {key:'闭合',table:true,get:c=>c.o.kind==='line'?(c.o.closed?'是':'否'):''},
  {key:'标注类型',table:true,get:c=>c.o.kind==='dimension'?(DIM_SUB_LABELS[c.o.subtype]||c.o.subtype||''):''},
  {key:'节点坐标',table:true,get:c=>(c.o.kind==='line'||c.o.kind==='dimension')&&c.o.points?.length?formatNodeCoords(c.o.points):''},
  {key:'节点数',table:true,get:c=>c.o.points?.length||0},
  {key:'长度',table:true,get:c=>c.len?fmt(c.len):''},
  {key:'面积',table:true,get:c=>c.area?fmt(c.area):''},
  /* 有效可见（对象 visible 且图层 visible）：与画布/图纸导出共用 effectiveVisible，口径单一 */
  {key:'显示',table:true,get:c=>effectiveVisible(c.o)?'是':'否'},
  {key:'锁定',table:true,get:c=>c.o.locked?'是':'否'},
  {key:'备注',table:true,get:c=>c.o.props.note||''},
  {key:'更新时间',table:true,get:c=>c.o.updatedAt},
  {key:'楼层',table:true,get:c=>c.floorName},
  /* 合成列：PDF 清单与打印报告共用；CSV/TSV/XLSX 不输出（列头与旧版完全一致） */
  {key:'参数',table:false,get:c=>exportParamText(c)}
];
/* EXPORT_FIELD_DEFS 是字段唯一源；按 key 取值直接用 find（调用点极少，不建索引） */
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
    else if(tt===PARA){ w=o.width; h=o.height; param=fmt(parallelogramSkew(sh)); }
    else if(tt===CIR){ w=h=2*sh.r; }
    else if(tt===ELL){ w=2*sh.rx; h=2*sh.ry; }
    else { w=h=2*sh.r; param=fmt(Number(sh.a0)||0)+','+fmt(Number(sh.a1)||0); }
  }
  return {w,h,angle,label,param};
}
/** 单一对象行渲染器：所有表格型导出都从这里取一行。
 *  长度/面积在此各算一次并挂到行上下文，字段 getter 只读取，避免非零值时短路求值两次（IO-P2-11）。 */
function buildExportRow(o,floorName){
  const c={o,floorName,type:getType(o.typeId),layer:layerOf(o),shape:exportShapeSummary(o),
    len:objectLength(o),area:objectArea(o)};
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
const QUOTE_FIELD_DEFS=[
  {key:'厂商',p:1,get:r=>r.vendor},{key:'名称',get:r=>r.model},{key:'数量',get:r=>r.qty},
  {key:'单价',p:1,get:r=>r.item?r.item.price:''},{key:'小计',p:1,get:r=>r.amount===undefined?'':r.amount}
];
/* G1：厂商目录 CSV 列别名（字段映射归本文件；缺厂商/型号/单价任一列不识别） */
const CATALOG_CSV_COLS={vendor:['厂商','vendor'],model:['型号','model'],price:['单价','price'],category:['分类','category'],unit:['单位','unit']};
/** 跨楼层 BOM 聚合（唯一实现）：返回行对象与「型号跨厂商重名且未填厂商」清单 */
function quoteAggregate(cat){
  const g=new Map(),idx=new Map(),byModel=new Map(),ambiguous=new Set();
  ((cat&&cat.items)||[]).forEach(x=>{idx.set(x.vendor+'\u0001'+x.model,x);byModel.set(x.model,byModel.has(x.model)?null:x)});
  syncActiveFloor();
  (state.floors||[]).forEach(f=>(f.id===state.activeFloorId?state.objects:f.objects||[]).forEach(o=>{
    const p=(o&&o.props)||{},v=String(p.vendor||'').trim(),m=String(p.model||'').trim();
    if(!v&&!m)return;
    const it=idx.get(v+'\u0001'+m)||(!v&&m?byModel.get(m):null),gk=it?it.vendor+'\u0001'+it.model:v+'\u0001'+m;
    if(!it&&!v&&m&&byModel.has(m)&&byModel.get(m)===null)ambiguous.add(m);
    const x=g.get(gk)||{vendor:it?it.vendor:v,model:it?it.model:m,item:it,qty:0},q=Number(p.qty);
    x.qty+=Number.isFinite(q)&&q>=0?q:1;g.set(gk,x);
  }));
  const rows=Array.from(g.values());
  rows.forEach(x=>{if(x.item)x.amount=roundMoney(x.qty*x.item.price)});
  if(rows.length)rows.push({vendor:'',model:'合计',qty:rows.reduce((n,x)=>n+x.qty,0),
    amount:rows.every(x=>x.item)?roundMoney(rows.reduce((n,x)=>n+x.amount,0)):''});
  return {rows,ambiguous:Array.from(ambiguous)};
}
/** 行对象 → 表格（表头与列序唯一来源；无目录时降级为名称/数量） */
function quoteColumns(agg,cat){
  const d=QUOTE_FIELD_DEFS.filter(f=>!f.p||!!(cat&&cat.items&&cat.items.length));
  return [d.map(f=>f.key),...agg.rows.map(x=>d.map(f=>f.get(x)))];
}
function quoteTable(cat){return quoteColumns(quoteAggregate(cat),cat)}
/* 报价快照：签名 = 厂商/型号/数量（行集合不变才允许沿用冻结单价） */
function quoteSignature(t){return JSON.stringify([t[0].length].concat(t.slice(1, -1).map(r=>r.slice(0,3))))}
/** 快照与当前行集合一致时返回快照表格；否则 null（调用方按当前目录重新计价） */
function quoteSnapshotTable(fresh,snap){
  if(!snap||!Array.isArray(snap.rows)||snap.rows.length!==fresh.length)return null;
  if(quoteSignature(snap.rows)!==quoteSignature(fresh))return null;
  return snap.rows.map(r=>r.slice());
}
/** 在表格末尾追加目录版本/导出时间列（仅在有价格列时；不改变数据行数值） */
function quoteMetaTable(t,meta){
  if(t[0].length!==5)return t;
  const out=t.map((r,i)=>{
    const v=r.concat(['','']);
    if(i===t.length-1&&r[1]==='合计'){v[5]=meta.catalogVersion;v[6]=meta.exportedAt}
    return v;
  });
  out[0][5]='目录版本';out[0][6]='导出时间';
  return out;
}
/** 盲区 GeoJSON 属性字段表（导出唯一来源） */
const BLIND_SPOT_FIELDS=[
  {key:'region',get:(r)=>r.regionName},
  {key:'regionId',get:(r)=>r.regionId},
  {key:'index',get:(r,i)=>i+1}
];
/* G3 带宽/存储估算：字段与系数为经验值（非标准），UI 明示可按实际设备改写 */
const BWC=[['h264','H.264',1],['h265','H.265',.6],['mjpeg','MJPEG',4]];
const BWR=[['1080p',4],['720p',2],['4MP',6],['8MP',10]];
const BWS=[['main','主码流',1],['sub','子码流',.3]];
const BWD={codec:'h264',res:'1080p',fps:25,stream:'main',channels:8,days:30,hours:24,redundancy:10};
/** 输入夹取到区间；空/非有限按 0，0 天=0，超大值与负数不产生 NaN/Infinity/负容量 */
function bwN(v,lo,hi){const n=Number(v);return Number.isFinite(n)?Math.min(hi,Math.max(lo,n)):0}
/** 纯函数：码率=基准(分辨率)×编码系数×帧率/25×码流系数；容量并列十进制 GB 与 2^30 GiB */
function bwEst(o={}){
  const pick=(l,id)=>l.find(x=>x[0]===id)||l[0];
  const c=pick(BWC,o.codec),r=pick(BWR,o.res),s=pick(BWS,o.stream);
  const g=(v,k,hi)=>bwN(v===undefined?BWD[k]:v,0,hi);
  const fps=bwN(o.fps===undefined?BWD.fps:o.fps,1,120),ch=g(o.channels,'channels',10000),days=g(o.days,'days',36500),hours=g(o.hours,'hours',24),red=g(o.redundancy,'redundancy',1000);
  const mbps=r[1]*c[2]*fps/25*s[2],total=mbps*ch,bytes=total*1e6/8*3600*hours*days*(1+red/100);
  return {codec:c,res:r,stream:s,fps,channels:ch,days,hours,redundancy:red,mbps,totalMbps:total,gb:bytes/1e9,gib:bytes/1073741824};
}
/* G4 布线/线缆统计：几何估算（非实测布线），当前楼层对象；预留/弯曲为用户可改参数 */
const WGD={reserve:.5,bend:10};
/** 纯函数：折线逐段 objectLength / 设备图元中心两点直线；总计=几何+端数×预留+几何×弯曲% */
function wireStats(o={}){
  const mode=o.mode==='chain'?'chain':'route', reserve=bwN(o.reserve??WGD.reserve,0,1e6), bend=bwN(o.bend??WGD.bend,0,1000);
  const objs=(o.objects||[]).filter(x=>x&&x.kind), layers=o.layers||[], rows=[];
  const lay=x=>x.layer||((layers.find(l=>l.id===x.layerId)||layers[0]||{}).name||'');
  const len=v=>v>0&&isFinite(v)?v:0;
  if(mode==='route') objs.forEach(x=>{ if(x.kind==='line') rows.push({name:x.name||'',layer:lay(x),len:len(objectLength(x))}); });
  else{
    const pts=objs.filter(x=>x.kind==='point').sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'zh'));
    pts.forEach((b,i)=>{ if(!i) return; const a=pts[i-1];
      rows.push({name:(a.name||'')+'→'+(b.name||''),len:len(dist([a.x,a.y],[b.x,b.y]))}); });
  }
  const ends=rows.length?(mode==='chain'?2:rows.length*2):0, geometry=rows.reduce((s,r)=>s+r.len,0);
  const reserveLen=ends*reserve, bendLen=geometry*bend/100, groups=[];
  if(mode==='route'){ const g=new Map(); rows.forEach(r=>g.set(r.layer,(g.get(r.layer)||0)+r.len)); g.forEach((v,k)=>groups.push({name:k,len:v})); }
  return {reserve,bend,rows,groups,ends,geometry,reserveLen,bendLen,total:geometry+reserveLen+bendLen};
}
/** 纯函数：盲区 GeoJSON FeatureCollection（不触发下载；口径元数据与旧版一致） */
function buildBlindSpotGeoJson(cov){
  if(!cov||!cov.regions||!cov.regions.length) return null;
  const rects=blindSpotRects(cov);
  if(!rects.length) return null;
  /* IO-P2-13：坐标按导出精度取整，外环统一逆时针（RFC 7946），退化面跳过 */
  const p=Math.max(0,Math.min(6,Number(state.settings.precision??2)));
  const q=Math.pow(10,p), rnd=v=>Math.round(v*q)/q;
  const features=[];
  rects.forEach(r=>{
    const ring=r.points.map(pt=>[rnd(pt[0]),rnd(pt[1])]);
    const uniq=ring.filter((pt,k)=>k===0||pt[0]!==ring[k-1][0]||pt[1]!==ring[k-1][1]);
    if(uniq.length<3) return;
    let twice=0;
    for(let k=0;k<uniq.length;k++){ const a=uniq[k],b=uniq[(k+1)%uniq.length]; twice+=a[0]*b[1]-b[0]*a[1]; }
    if(!twice) return;
    if(twice<0) uniq.reverse();
    const properties={};
    BLIND_SPOT_FIELDS.forEach(f=>{ properties[f.key]=f.get(r,features.length); });
    features.push({type:'Feature',properties,
      geometry:{type:'Polygon',coordinates:[uniq.concat([uniq[0]])]}});
  });
  if(!features.length) return null;
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
