/* io-export.js —— 导出：JSON/PNG/SVG/CSV/XLSX/DXF/PDF、二维码标签、盲区与打印报告 */
/* -------------------- 导出 -------------------- */
$('exportBtn').onclick=()=>{
  const kind=$('exportKind').value;
  if(kind.startsWith('plugin:')){ if(typeof exportViaPlugin==='function') exportViaPlugin(kind.slice(7)); return; }
  if(kind==='json') exportJSON();
  if(kind==='png') exportPNG();
  if(kind==='svg') exportSVG();
  if(kind==='pdf') exportPDF();
  if(kind==='dxf') exportDXF();
  if(kind==='csv') exportDelimited(',','csv','text/csv;charset=utf-8');
  if(kind==='tsv') exportDelimited('\t','tsv','text/tab-separated-values;charset=utf-8');
  if(kind==='xlsx') exportXlsx();
  if(kind==='labels') exportLabelSheet();
};
function downloadBlob(blob,name){
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),800);
}
function safeName(){ return (state.meta.name||'图纸工程').replace(/[\\/:*?"<>|]/g,'_'); }
/** 二维码 SVG：一个 path 画全部暗模块（29×29 版式，crispEdges 保证打印锐利） */
function qrSvg(text,px=96){
  const qr=Qr.encodeText(text);
  let d='';
  for(let r=0;r<qr.size;r++) for(let c=0;c<qr.size;c++){
    if(qr.modules[r][c]) d+=`M${c} ${r}h1v1h-1z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${qr.size} ${qr.size}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${qr.size}" height="${qr.size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
/**
 * 设备二维码标签：每个可见点设备一张，扫码得到 `PLOTPIN:编号`，可在工程内搜索编号定位。
 * 离线生成可打印 HTML（A4 三列），不依赖任何外部资源。
 */
function exportLabelSheet(){
  const pts=state.objects.filter(o=>o.kind==='point'&&isVisible(o));
  if(!pts.length) return toast('当前没有可见的点设备','warn');
  const cards=pts.map(o=>{
    const t=getType(o.typeId);
    const base='PLOTPIN:'+(o.name||o.id);
    const payload=Qr.byteLength(base)<=Qr.MAX_BYTES?base:'PLOTPIN:'+o.id;
    let svg;
    try{ svg=qrSvg(payload); }
    catch(e){ svg=`<div style="color:#b91c1c;font-size:12px">${esc(e.message)}</div>`; }
    const line=(label,val)=>val!==undefined&&val!==''?`<div>${esc(L(label))}：${esc(val)}</div>`:'';
    return `<div class="label"><div class="qr">${svg}</div><div class="meta">
      <b>${esc(o.name||'')}</b>
      <div>${esc(t.name)}</div>
      ${line('型号',o.props.model)}${line('IP',o.props.ip)}
      ${line('安装高度',o.props.mountHeight!==undefined?o.props.mountHeight+' m':'')}
      ${line('责任人',o.props.owner)}
      <div class="code">${esc(payload)}</div></div></div>`;
  }).join('');
  const html=`<!doctype html><html lang="${I18N.lang==='en'?'en':'zh-CN'}"><head><meta charset="utf-8"><title>${esc(safeName())} · ${esc(L('设备标签'))}</title>
<style>body{font-family:"Microsoft YaHei",Arial,sans-serif;margin:16px;color:#111827}
.sheet{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.label{border:1px dashed #94a3b8;border-radius:6px;padding:8px;display:flex;gap:8px;align-items:center;break-inside:avoid}
.qr svg{display:block;width:96px;height:96px}
.meta{font-size:12px;line-height:1.55;min-width:0}.meta b{font-size:14px}
.code{font-family:Consolas,Menlo,monospace;color:#475569;word-break:break-all;font-size:11px}
@media print{body{margin:8mm}.label{border-style:solid}}</style></head>
<body><h3>${esc(state.meta.name||L('图纸工程'))} · ${esc(L('设备二维码标签'))}（${esc(L('共'))} ${pts.length} ${esc(L('台'))}）</h3>
<p style="font-size:12px;color:#475569">${esc(L('扫码得到 PLOTPIN:编号，可在工程内搜索该编号定位设备。本页由 PlotPin 离线生成，无外部依赖。'))}</p>
<div class="sheet">${cards}</div></body></html>`;
  downloadBlob(new Blob([html],{type:'text/html;charset=utf-8'}),safeName()+'-'+L('设备标签')+'.html');
  toast('已导出 '+pts.length+' 张设备二维码标签（可打印）','success');
}
/** 导出覆盖率盲区多边形（逐行合并的矩形面，GeoJSON FeatureCollection） */
function exportBlindSpotsGeoJson(){
  if(!coverageResult||!coverageResult.regions||!coverageResult.regions.length){
    return toast('请先执行「覆盖率分析」','warn');
  }
  const rects=blindSpotRects(coverageResult);
  if(!rects.length) return toast('当前没有盲区可导出','warn');
  const features=rects.map((r,i)=>({
    type:'Feature',
    properties:{region:r.regionName,regionId:r.regionId,index:i+1},
    geometry:{type:'Polygon',coordinates:[r.points.concat([r.points[0]])]}
  }));
  const fc={type:'FeatureCollection',features};
  downloadBlob(new Blob([JSON.stringify(fc,null,2)],{type:'application/geo+json'}),safeName()+'-盲区.geojson');
  toast('盲区多边形已导出：'+features.length+' 个面（合计 '+fmt(blindSpotArea(coverageResult))+' ㎡）','success');
}
async function exportJSON(){
  state.meta.updatedAt=nowISO();
  // 工程文件保持可移植：底图字节虽存于 IndexedDB，导出 JSON 时内嵌 dataURL 一并带走。
  // 只要运行时有已装载的图片数据就内嵌——IDB 不可用的降级路径 assetId 为空，同样必须带走（评估报告 5.4）
  const copy=persistableState();
  copy.meta.updatedAt=state.meta.updatedAt;
  if(bgDataUrl) copy.background.dataUrl=bgDataUrl;
  /* 设备照片同样内嵌 dataUrl，跨设备导入后由 ensureObjectPhotoAssets 转回资产库 */
  for(const o of copy.objects||[]){
    const id=o.props&&o.props.photoId;
    if(!id) continue;
    try{
      const rec=await assetGet(id);
      if(rec) o.props.photoDataUrl=bytesToDataUrl(rec.bytes,rec.mime||'image/jpeg');
    }catch(_){}
  }
  /* 非当前楼层的底图也内嵌，保证多楼层工程跨设备可移植 */
  for(const f of copy.floors||[]){
    if(f.id===copy.activeFloorId) continue;
    const bg=f.background;
    if(!bg||!bg.assetId) continue;
    try{
      const rec=await assetGet(bg.assetId);
      if(rec) bg.dataUrl=bytesToDataUrl(rec.bytes,rec.mime||'image/png');
    }catch(_){}
  }
  downloadBlob(new Blob([JSON.stringify(copy,null,2)],{type:'application/json'}),safeName()+'.json');
  toast('JSON 工程已导出（含底图与设备照片）','success');
}
const TABLE_COLUMNS=['编号','名称','对象类型','业务类型','图层','型号','安装高度','IP','责任人','X','Y','角度','宽度','高度','形状','形状参数','闭合','标注类型','节点坐标','节点数','长度','面积','显示','锁定','备注','更新时间'];
function objectRows(){
  return state.objects.map(o=>{
    const t=getType(o.typeId),l=layerOf(o);
    /* 非矩形区域：宽/高列填外接盒尺寸（圆/扇形=2r，椭圆=2rx×2ry），形状列保留精确类型，面积仍取精确值 */
    let w='',h='',ang=o.angle||0,shape='',shapeParam='';
    if(o.kind==='rect'){
      const tt=areaShapeType(o), sh=o.shape||{};
      shape=AREA_SHAPE_LABELS[tt]||'';
      if(tt==='rect'){ w=o.width; h=o.height; }
      else if(tt==='parallelogram'){ w=o.width; h=o.height; shapeParam=String(Math.round(parallelogramSkew(sh))); }
      else if(tt==='circle'){ w=h=2*sh.r; }
      else if(tt==='ellipse'){ w=2*sh.rx; h=2*sh.ry; }
      else { w=h=2*sh.r; shapeParam=Math.round(Number(sh.a0)||0)+','+Math.round(Number(sh.a1)||0); }
    }
    return {
      编号:o.name,名称:o.text||'',对象类型:kindName(o.kind),业务类型:t.name,图层:l.name,
      型号:o.props.model||'',安装高度:o.props.mountHeight!==undefined?o.props.mountHeight:'',IP:o.props.ip||'',责任人:o.props.owner||'',
      X:fmt(o.x),Y:fmt(o.y),角度:ang,宽度:w?fmt(w):'',高度:h?fmt(h):'',
      形状:shape,'形状参数':shapeParam,
      闭合:o.kind==='line'?(o.closed?'是':'否'):'',
      标注类型:o.kind==='dimension'?(DIM_SUB_LABELS[o.subtype]||o.subtype||''):'',
      节点坐标:(o.kind==='line'||o.kind==='dimension')&&o.points?.length?formatNodeCoords(o.points):'',
      节点数:o.points?.length||0,长度:objectLength(o)?fmt(objectLength(o)):'',面积:objectArea(o)?fmt(objectArea(o)):'',
      显示:o.visible?'是':'否',锁定:o.locked?'是':'否',备注:o.props.note||'',更新时间:o.updatedAt
    };
  });
}
function exportDelimited(delim,ext,mime){
  const rows=objectRows(); const cols=TABLE_COLUMNS;
  const text='\ufeff'+[cols.join(delim),...rows.map(r=>cols.map(c=>csvCell(r[c],delim)).join(delim))].join('\n');
  downloadBlob(new Blob([text],{type:mime}),safeName()+'.'+ext);
}
function csvCell(v,delim){ const s=String(v??''); return /[",\n\r\t]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }
/** 导出真 .xlsx（原生 OOXML + stored ZIP，Excel/WPS 可直接打开，亦可再次导入往返） */
function exportXlsx(){
  const cols=TABLE_COLUMNS;
  const table=[cols,...objectRows().map(r=>cols.map(c=>String(r[c]??'')))];
  const buf=Xlsx.build(table, '图纸标注');
  downloadBlob(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),safeName()+'.xlsx');
  toast('XLSX 已导出（可再次导入更新对象属性）','success');
}
function renderToDataURL(scale=2){
  const d=worldDims(), margin=30;
  const z=Math.min(2600/d.w,1800/d.h,60);
  const cw=d.w*z+margin*2, ch=d.h*z+margin*2;
  const c=document.createElement('canvas'); c.width=Math.round(cw*scale); c.height=Math.round(ch*scale);
  const cc=c.getContext('2d'); cc.scale(scale,scale);
  drawScene(cc,{zoom:z,panX:margin,panY:margin},cw,ch,{interactive:false,markerScale:1.6});
  return c.toDataURL('image/png');
}
function exportPNG(){
  const a=document.createElement('a'); a.download=safeName()+'.png'; a.href=renderToDataURL(2);
  document.body.appendChild(a); a.click(); a.remove();
  toast('PNG 已导出','success');
}
function exportSVG(){
  downloadBlob(new Blob([buildSceneSvg()],{type:'image/svg+xml;charset=utf-8'}),safeName()+'.svg');
  toast('SVG 已导出','success');
}
/** 纯函数：按当前工程生成 SVG 文本（导出与自测共用，不触发下载） */
function buildSceneSvg(){
  const d=worldDims(), margin=30, maxW=1800, ppu=Math.min(maxW/d.w,1200/d.h,40), sw=d.w*ppu+margin*2, sh=d.h*ppu+margin*2;
  /* 世界→SVG：以取景框 (minX,minY)-(maxX,maxY) 为基准，兼容仿射校准后含负 min 的包围框 */
  const X=x=>margin+(x-d.minX)*ppu, Y=y=>margin+(d.minY+d.h-y)*ppu;
  const shapes=[], markers=[];
  if(state.background.kind==='image'&&bgImage&&bgDataUrl){
    const bg=state.background, t=validImageTransform(bg.transform);
    if(t){
      /* 按仿射系数把图像像素空间直接映射到 SVG 坐标（支持旋转/不等比/切变） */
      const m=`matrix(${t.a*ppu} ${-t.d*ppu} ${t.b*ppu} ${-t.e*ppu} ${X(t.c)} ${Y(t.f)})`;
      shapes.push(`<image x="0" y="0" width="${bg.width}" height="${bg.height}" transform="${m}" href="${bgDataUrl}" xlink:href="${bgDataUrl}"/>`);
    }else{
      shapes.push(`<image x="${X(0)}" y="${Y(d.minY+d.h)}" width="${d.w*ppu}" height="${d.h*ppu}" href="${bgDataUrl}" xlink:href="${bgDataUrl}"/>`);
    }
  }else if(state.background.shape?.type==='circle'){
    const sh=state.background.shape;
    shapes.push(`<circle cx="${X(sh.cx)}" cy="${Y(sh.cy)}" r="${sh.r*ppu}" fill="#eef2f7" stroke="#3b82f6" stroke-width="2"/>`);
  }else if(state.background.shape?.type==='ellipse'){
    const sh=state.background.shape;
    shapes.push(`<ellipse cx="${X(sh.cx)}" cy="${Y(sh.cy)}" rx="${sh.rx*ppu}" ry="${sh.ry*ppu}" transform="rotate(${-Number(sh.angle)||0} ${X(sh.cx)} ${Y(sh.cy)})" fill="#eef2f7" stroke="#3b82f6" stroke-width="2"/>`);
  }else if(state.background.shape?.type==='sector'){
    const sh=state.background.shape, R=sh.r*ppu, cx=X(sh.cx), cy=Y(sh.cy), sweep=sectorSweep(sh);
    const ex=a=>[cx+R*Math.cos(a*Math.PI/180),cy-R*Math.sin(a*Math.PI/180)];
    /* 注意运算符优先级：(Number(a0)||0)+sweep，不能写成 a0||0+sweep（起始角非零时退化为同点） */
    const a0=Number(sh.a0)||0;
    const p0=ex(a0), p1=ex(a0+sweep), large=sweep>180?1:0;
    shapes.push(`<path d="M${cx},${cy} L${p1[0]},${p1[1]} A${R},${R} 0 ${large} 1 ${p0[0]},${p0[1]} Z" fill="#eef2f7" stroke="#3b82f6" stroke-width="2"/>`);
  }else if(state.background.shape?.type==='parallelogram'){
    const sh=state.background.shape;
    const pts=parallelogramPoints(Number(sh.x)||0,Number(sh.y)||0,Number(sh.w)||0,Number(sh.h)||0,sh.skew)
      .map(p=>`${X(p[0])},${Y(p[1])}`).join(' ');
    shapes.push(`<polygon points="${pts}" fill="#eef2f7" stroke="#3b82f6" stroke-width="2"/>`);
  }else if(state.background.shape?.type==='polygon'&&state.background.shape?.points?.length){
    const pts=state.background.shape.points.map(p=>`${X(p[0])},${Y(p[1])}`).join(' ');
    shapes.push(`<polygon points="${pts}" fill="#eef2f7" stroke="#3b82f6" stroke-width="2"/>`);
  }else{
    shapes.push(`<rect x="${X(0)}" y="${Y(d.h)}" width="${d.w*ppu}" height="${d.h*ppu}" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/>`);
  }
  /* SVG 面积/周长双行标签（与画布 drawAreaTag 语义一致；白描边保证任意底色可读）；可分别关闭 */
  const areaTagSvg=(cx,cy,area,perim,showArea=true,showPerim=true)=>{
    const s1=showArea?`面积 ${fmt(area)} ㎡`:'', s2=showPerim?`周长 ${fmt(perim)} m`:'';
    const line=(t,y)=>t?`<text x="${cx}" y="${y}" text-anchor="middle" font-size="12" font-family="Consolas,Menlo,monospace" fill="#1e3a8a" stroke="#fff" stroke-width="3" paint-order="stroke">${t}</text>`:'';
    if(!s1&&!s2) return '';
    if(s1&&s2) return line(s1,cy-7)+line(s2,cy+9);
    return line(s1||s2,cy+4);
  };
  /* 逐对象标注条目 → SVG 文本（与画布 drawObjectAnnotations 共用同一数据源，导出所见一致） */
  const annotItemsSvg=(o)=>annotationItems(o,{selected:false}).map(it=>
    `<text x="${X(it.wx)+it.dx}" y="${Y(it.wy)+it.dy+4}" font-size="12" font-family="Consolas,Menlo,monospace" fill="#1e3a8a" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(it.text)}</text>`).join('');
  /* 屏幕固定像素的点设备图标（与 render.js drawPoint 的局部坐标一致，不随 ppu 缩放）；
     返回局部坐标 SVG 片段，由外层 <g scale> 包裹 */
  const svgPointIcon=(icon,color,type)=>{
    let body='';
    if(icon==='camera'){
      body=`<rect x="-6" y="-5" width="12" height="10" fill="#fff" stroke="${color}" stroke-width="2"/>`+
        `<circle cx="0" cy="0" r="3.2" fill="${color}"/><path d="M6,0 L16,-5 L16,5 Z" fill="${color}"/>`;
    }else if(icon==='dome'){
      body=`<path d="M-8,0 A8,8 0 0 1 8,0 Z" fill="#fff" stroke="${color}" stroke-width="2"/><circle cx="0" cy="0" r="3" fill="${color}"/>`;
    }else if(icon==='light'){
      const rays=[]; for(let i=0;i<8;i++){ const aa=i*Math.PI/4; rays.push(`<line x1="${(9*Math.cos(aa)).toFixed(2)}" y1="${(9*Math.sin(aa)).toFixed(2)}" x2="${(13*Math.cos(aa)).toFixed(2)}" y2="${(13*Math.sin(aa)).toFixed(2)}" stroke="#fde68a" stroke-width="2"/>`); }
      body=`<circle cx="0" cy="0" r="7" fill="${color}"/>${rays.join('')}`;
    }else if(icon==='gate'){
      body=`<line x1="-10" y1="0" x2="12" y2="0" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`+
        `<rect x="-12" y="-7" width="5" height="14" fill="${color}"/><circle cx="12" cy="0" r="3" fill="${color}"/>`;
    }else if(icon==='charger'){
      body=`<rect x="-7" y="-8" width="14" height="16" fill="#fff" stroke="${color}" stroke-width="2"/>`+
        `<polyline points="1,-5 -3,2 2,2 -1,8" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
    }else if(icon==='warning'){
      body=`<path d="M0,-11 L11,9 L-11,9 Z" fill="${color}"/><text x="0" y="3" text-anchor="middle" font-size="13" font-weight="bold" fill="#fff">!</text>`;
    }else if(icon==='custom'){
      body=`<path d="M0,-10 L10,0 L0,10 L-10,0 Z" fill="${color}"/>`;
    }else if(icon==='symbol'){
      /* 行业/自定义 SVG 图元：24 单位坐标系（或自定义 viewBox）居中缩放到图标尺寸 */
      const vb=type&&type.symbolViewBox||{x:0,y:0,w:24,h:24};
      const fs=0.9*24/Math.max(vb.w,vb.h);
      const paths=(type&&type.symbol||[]).map(p=>`<path d="${esc(p.d)}" fill="${p.fill?color:'none'}" stroke="${p.fill?'none':color}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
      body=`<g transform="translate(${-(vb.x+vb.w/2)*fs} ${-(vb.y+vb.h/2)*fs}) scale(${fs})">${paths}</g>`;
    }else{
      body=`<circle cx="0" cy="0" r="7" fill="#fff" stroke="${color}" stroke-width="2"/><circle cx="0" cy="0" r="3.5" fill="${color}"/>`;
    }
    return body;
  };
  state.objects.filter(isVisible).forEach(o=>{
    const t=getType(o.typeId), color=o.style.color||t.color;
    if(o.kind==='rect'){
      const pts=shapeWorldPoints(o).map(p=>`${X(p[0])},${Y(p[1])}`).join(' ');
      shapes.push(`<polygon points="${pts}" fill="${color}" fill-opacity="${styleVal(o,'fillAlpha',.15)}" stroke="${color}" stroke-width="${styleVal(o,'strokeWidth',.1)*ppu}"/>`);
      if(o.name&&annotOn(o,'name')){ const ce=shapeLabelCenter(o); markers.push(`<text x="${X(ce[0])}" y="${Y(ce[1])}" text-anchor="middle" font-size="14" fill="${color}" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(o.name)}</text>`); }
      const sa=annotOn(o,'area'), sp=annotOn(o,'perimeter');
      if(sa||sp){ const ce=shapeLabelCenter(o); markers.push(areaTagSvg(X(ce[0]),Y(ce[1]),shapeArea(o),shapePerimeter(o),sa,sp)); }
      markers.push(annotItemsSvg(o));
    }else if(o.kind==='line'&&o.points.length){
      /* 闭合折线点串末尾补回首点，闭合边描边才不缺失（与画布 closePath 一致） */
      const pts=o.points.map(p=>`${X(p[0])},${Y(p[1])}`);
      if(o.closed) pts.push(pts[0]);
      shapes.push(`<polyline points="${pts.join(' ')}" fill="${o.closed?color:'none'}" fill-opacity=".08" stroke="${color}" stroke-width="${styleVal(o,'strokeWidth',.1)*ppu}" stroke-linejoin="round"/>`);
      /* 编号与画布一致：开放折线取中点节点，闭合折线取质心（面积/周长胶囊可见时上移 30px 避让，避免重叠） */
      if(o.name&&annotOn(o,'name')){
        if(o.closed){
          const n=o.points.length;
          const gx=o.points.reduce((s,p)=>s+p[0],0)/n, gy=o.points.reduce((s,p)=>s+p[1],0)/n;
          const capShown=n>=3&&(annotOn(o,'area')||annotOn(o,'perimeter'));
          markers.push(`<text x="${X(gx)}" y="${Y(gy)-(capShown?30:0)}" text-anchor="middle" font-size="12" font-weight="bold" fill="${color}" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(o.name)}</text>`);
        }else{
          const mid=o.points[Math.floor((o.points.length-1)/2)];
          markers.push(`<text x="${X(mid[0])}" y="${Y(mid[1])-8}" text-anchor="middle" font-size="12" font-weight="bold" fill="${color}" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(o.name)}</text>`);
        }
      }
      if(o.closed&&o.points.length>=3){
        const sa=annotOn(o,'area'), sp=annotOn(o,'perimeter');
        if(sa||sp){
          const gx=o.points.reduce((s,p)=>s+p[0],0)/o.points.length, gy=o.points.reduce((s,p)=>s+p[1],0)/o.points.length;
          markers.push(areaTagSvg(X(gx),Y(gy),polygonArea(o.points),objectLength(o),sa,sp));
        }
      }
      markers.push(annotItemsSvg(o));
    }else if(o.kind==='point'){
      const x=X(o.x),y=Y(o.y), psh=t.scaleShape||'none';
      if((o.phys||0)>0&&psh!=='none'){
        const R=o.phys*ppu, half=R/2, sw=Math.max(1.5,.06*ppu);
        let body='';
        if(psh==='circle') body=`<circle r="${half}" fill="${color}" fill-opacity=".12" stroke="${color}" stroke-width="${sw}"/>`;
        else if(psh==='square') body=`<rect x="${-half}" y="${-half}" width="${R}" height="${R}" fill="${color}" fill-opacity=".12" stroke="${color}" stroke-width="${sw}"/>`;
        else if(psh==='bar') body=`<line x1="${-half}" y1="0" x2="${half}" y2="0" stroke="${color}" stroke-width="${Math.max(2,.1*ppu)}" stroke-linecap="round"/>`;
        else if(psh==='sector'){
          const fov=Math.min(360,Math.max(10,Number(t.fov)||90))*Math.PI/180, hh=fov/2;
          body=`<path d="M0,0 L ${R*Math.cos(hh)},${-R*Math.sin(hh)} A ${R} ${R} 0 0 1 ${R*Math.cos(hh)},${R*Math.sin(hh)} Z" fill="${color}" fill-opacity=".12" stroke="${color}" stroke-width="${sw}"/>`;
        }
        shapes.push(`<g transform="translate(${x} ${y}) rotate(${-o.angle})">${body}<circle r="3.2" fill="${color}"/></g>`);
      }else{
        const k=pointIconScale(o), icon=t.icon||o.style.icon||'marker';
        markers.push(`<g transform="translate(${x} ${y}) rotate(${-o.angle}) scale(${k})">${svgPointIcon(icon,color,t)}</g>`);
      }
      if(o.name&&annotOn(o,'name')){
        const ly=(o.phys||0)>0?y-Math.max(13,(o.phys||0)/2*ppu+6):y-20*pointIconScale(o);
        markers.push(`<text x="${x}" y="${ly}" text-anchor="middle" font-size="12" fill="${color}" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(o.name)}</text>`);
      }
      markers.push(annotItemsSvg(o));
    }else if(o.kind==='text'){
      markers.push(`<text x="${X(o.x)}" y="${Y(o.y)}" transform="rotate(${-o.angle} ${X(o.x)} ${Y(o.y)})" text-anchor="middle" font-size="${Math.max(10,o.height*ppu*.55)}" fill="${o.style.color||'#111'}">${esc(o.text||'文字')}</text>`);
    }else if(o.kind==='dimension'&&o.points.length>=2){
      const pts=o.points.map(p=>`${X(p[0])},${Y(p[1])}`).join(' ');
      const dash=o.subtype==='ruler'?' stroke-dasharray="7,4"':'';
      const dcolor=o.subtype==='ruler'?'#0891b2':'#111827';
      shapes.push(`<polyline points="${pts}" fill="none" stroke="${dcolor}" stroke-width="1.8"${dash}/>`);
      if(o.subtype==='ruler'){
        o.points.forEach(p=>shapes.push(`<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3" fill="none" stroke="#0891b2" stroke-width="1.5"/>`));
        const ep=o.points[o.points.length-1];
        markers.push(`<text x="${X(ep[0])+6}" y="${Y(ep[1])-6}" text-anchor="start" font-size="12" fill="#0e7490">Σ ${fmt(objectLength(o))} m</text>`);
      }
      if(o.subtype==='distance') markers.push(`<text x="${(X(o.points[0][0])+X(o.points[1][0]))/2}" y="${(Y(o.points[0][1])+Y(o.points[1][1]))/2-8}" text-anchor="middle" font-size="12">${fmt(dist(o.points[0],o.points[1]))} m</text>`);
      if(o.subtype==='area'&&o.points.length>=3){
        /* 与画布 drawDimension 的 area 分支一致：中心附近面积+周长 */
        const cx=o.points.reduce((s,p)=>s+X(p[0]),0)/o.points.length+8;
        const cy=o.points.reduce((s,p)=>s+Y(p[1]),0)/o.points.length;
        markers.push(`<text x="${cx}" y="${cy}" font-size="12">面积 ${fmt(polygonArea(o.points))} ㎡</text>`);
        markers.push(`<text x="${cx}" y="${cy+16}" font-size="12">周长 ${fmt(polylineLength(o.points.concat([o.points[0]])))} m</text>`);
      }
      if(o.subtype==='angle'&&o.points.length>=3){
        /* 与画布一致：按三点算夹角，标在顶点旁 */
        const v0=o.points[0], v1=o.points[1], v2=o.points[2];
        const a1=Math.atan2(v1[1]-v0[1],v1[0]-v0[0]), a2=Math.atan2(v2[1]-v0[1],v2[0]-v0[0]);
        let deg=Math.abs((a2-a1)*180/Math.PI); if(deg>180) deg=360-deg;
        markers.push(`<text x="${X(v0[0])+30}" y="${Y(v0[1])-8}" font-size="12">${fmt(deg)}°</text>`);
      }
    }
  });
  const svg=`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${sw}" height="${sh}" viewBox="0 0 ${sw} ${sh}">
<rect width="100%" height="100%" fill="white"/>
<g>${shapes.join('\n')}</g><g font-family="Microsoft YaHei,Arial,sans-serif">${markers.join('\n')}</g>
<text x="${margin}" y="${sh-8}" font-size="11" fill="#666">${esc(state.meta.name)} · ${esc(siteDescription())}</text>
</svg>`;
  return svg;
}

/* -------------------- DXF 导出（CAD 互通，坐标输出毫米） -------------------- */
function angleDimDeg(o){
  const v0=o.points[0],v1=o.points[1],v2=o.points[2];
  const a1=Math.atan2(v1[1]-v0[1],v1[0]-v0[0]),a2=Math.atan2(v2[1]-v0[1],v2[0]-v0[0]);
  let deg=Math.abs((a2-a1)*180/Math.PI); return deg>180?360-deg:deg;
}
function exportDXF(){
  const entities=[];
  const layers=state.layers.map(l=>({name:l.name,color:'#7c3aed'}));
  state.objects.filter(isVisible).forEach(o=>{
    const color=o.style.color||getType(o.typeId).color||'#111827';
    const layer=layerOf(o).name;
    if(o.kind==='point'){
      entities.push({type:'POINT',layer,color,x:o.x,y:o.y});
    }else if(o.kind==='line'){
      entities.push({type:'LWPOLYLINE',layer,color,points:o.points.map(p=>p.slice()),closed:!!o.closed});
    }else if(o.kind==='rect'){
      const tt=areaShapeType(o);
      if(tt==='circle') entities.push({type:'CIRCLE',layer,color,x:o.x,y:o.y,r:o.shape.r});
      else entities.push({type:'LWPOLYLINE',layer,color,points:shapeWorldPoints(o),closed:true});
    }else if(o.kind==='dimension'&&o.points.length>=2){
      entities.push({type:'LWPOLYLINE',layer,color:'#111827',points:o.points.map(p=>p.slice()),closed:o.subtype==='area'});
      const ep=o.points[o.points.length-1];
      const label=o.subtype==='ruler'?'Σ '+fmt(objectLength(o))+' m'
        :o.subtype==='distance'?fmt(dist(o.points[0],o.points[1]))+' m'
        :o.subtype==='area'?fmt(polygonArea(o.points))+' m2'
        :fmt(angleDimDeg(o))+' deg';
      entities.push({type:'TEXT',layer,color:'#111827',x:ep[0],y:ep[1],text:label,height:.7});
    }else if(o.kind==='text'){
      entities.push({type:'TEXT',layer,color:o.style.color||'#111827',x:o.x,y:o.y,text:o.text||'文字',height:o.height||1});
    }
  });
  if(!entities.length) return toast('当前没有可导出的对象','warn');
  downloadBlob(new Blob([Dxf.buildDxf(entities,layers)],{type:'image/vnd.dxf;charset=utf-8'}),safeName()+'.dxf');
  toast('DXF 已导出（坐标单位：毫米，可用 AutoCAD/LibreCAD 打开）','success');
}

/* -------------------- 多页 PDF 导出（图纸页 + 完整清单分页） -------------------- */
function canvasToJpegBase64(canvas,quality=.92){
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('JPEG 编码失败')),'image/jpeg',quality))
    .then(b=>new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result).split(',')[1]); r.onerror=rej; r.readAsDataURL(b); }));
}
async function renderPdfDrawingPage(){
  const W=1748,H=1240;   /* A4 横向 150dpi 像素 */
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const cc=c.getContext('2d'); cc.fillStyle='#fff'; cc.fillRect(0,0,W,H);
  const d=worldDims(), margin=36;
  const z=Math.min((W-margin*2)/d.w,(H-margin*2)/d.h);
  drawScene(cc,{zoom:z,panX:(W-d.w*z)/2,panY:(H-d.h*z)/2},W,H,{interactive:false,markerScale:1.6});
  cc.fillStyle='#666'; cc.font='16px Microsoft YaHei,Arial';
  cc.fillText(state.meta.name+' · '+siteDescription(),margin,H-14);
  return {width:W,height:H,b64:await canvasToJpegBase64(c)};
}
const PDF_COLS=[['编号',110],['名称',120],['对象类型',100],['业务类型',130],['图层',110],['X',90],['Y',90],['参数',190],['长度',90],['面积',100]];
async function renderPdfListPages(){
  const W=1240,H=1748, margin=48, rowH=30, headH=40;
  const rows=objectRows(), pages=[];
  const per=Math.floor((H-margin*2-150)/rowH);
  const chunks=[]; for(let i=0;i<rows.length;i+=per) chunks.push(rows.slice(i,i+per));
  const total=Math.max(1,chunks.length);
  for(let pi=0;pi<chunks.length||rows.length===0;pi++){
    const c=document.createElement('canvas'); c.width=W; c.height=H;
    const g=c.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,W,H);
    g.fillStyle='#111827'; g.font='bold 26px Microsoft YaHei,Arial'; g.textBaseline='alphabetic';
    g.fillText(state.meta.name+' — '+L('对象清单'),margin,margin+8);
    g.font='14px Microsoft YaHei,Arial'; g.fillStyle='#555';
    g.fillText(L('共')+' '+rows.length+' '+L('个对象')+' · '+L('第')+' '+(pi+1)+' / '+total+' '+L('页')+' · '+new Date().toLocaleString(),margin,margin+34);
    let y=margin+70;
    g.fillStyle='#f1f5f9'; g.fillRect(margin,y,W-margin*2,headH);
    g.strokeStyle='#cbd5e1'; g.lineWidth=1; g.strokeRect(margin,y,W-margin*2,headH);
    g.fillStyle='#111827'; g.font='bold 14px Microsoft YaHei,Arial';
    let x=margin+8;
    PDF_COLS.forEach(([name,w])=>{ g.fillText(L(name),x,y+26); x+=w; });
    y+=headH;
    const list=chunks[pi]||[];
    g.font='13px Consolas,Microsoft YaHei,Arial';
    list.forEach((r,ri)=>{
      if(ri%2){ g.fillStyle='#f8fafc'; g.fillRect(margin,y,W-margin*2,rowH); }
      g.strokeStyle='#e2e8f0'; g.beginPath(); g.moveTo(margin,y+rowH); g.lineTo(W-margin,y+rowH); g.stroke();
      g.fillStyle='#1f2937';
      x=margin+8;
      const param=r['形状']!==''&&r['形状']!=='矩形'?r['形状']+(r['形状参数']?' '+r['形状参数']:''):(r['形状']==='矩形'?'矩形':(r['闭合']==='是'?'闭合':'')+(r['标注类型']?' '+r['标注类型']:''));
      const vals=[r['编号'],r['名称'],L(r['对象类型']),r['业务类型'],r['图层'],r['X'],r['Y'],param,r['长度'],r['面积']];
      PDF_COLS.forEach(([name,w],i)=>{ let s=String(vals[i]??''); if(g.measureText(s).width>w-14) s=s.slice(0,10)+'…'; g.fillText(s,x,y+20); x+=w; });
      y+=rowH;
    });
    pages.push({width:W,height:H,b64:await canvasToJpegBase64(c,.9)});
    if(rows.length===0) break;
  }
  return pages;
}
async function exportPDF(){
  try{
    const pages=[await renderPdfDrawingPage(),...await renderPdfListPages()];
    const buf=Pdf.buildImagePdf(pages);
    downloadBlob(new Blob([buf],{type:'application/pdf'}),safeName()+'.pdf');
    toast('PDF 已导出：图纸 1 页 + 清单 '+ (pages.length-1) +' 页','success');
  }catch(e){ toast('PDF 生成失败：'+e.message,'error'); }
}

/* -------------------- 打印 / PDF 报告 -------------------- */
$('printBtn').onclick=()=>{
  const rows=objectRows(), issues=findIssues(), img=renderToDataURL(1.5);
  const cols=['编号','对象类型','业务类型','图层','X','Y','参数'];
  $('report').innerHTML=`
    <div class="report-page" style="padding:24px;color:#111;font-family:'Microsoft YaHei',Arial,sans-serif">
      <h1 style="margin:0 0 8px">${esc(state.meta.name)} - ${esc(L('图纸标注报告'))}</h1>
      <div style="color:#555;margin-bottom:14px">${esc(L('生成时间：'))}${new Date().toLocaleString()} ｜ ${esc(siteDescription())}</div>
      <img src="${img}" style="width:100%;max-height:58vh;object-fit:contain;border:1px solid #ccc">
      <h2>${esc(L('统计摘要'))}</h2>
      <p>${esc(L('对象总数：'))}${state.objects.length} ｜ ${esc(L('点设备：'))}${state.objects.filter(o=>o.kind==='point').length} ｜ ${esc(L('区域：'))}${state.objects.filter(o=>o.kind==='rect').length} ｜ ${esc(L('折线：'))}${state.objects.filter(o=>o.kind==='line').length}</p>
      <p>${esc(L('几何检查：'))}${issues.length?issues.length+' '+L('项提示'):L('未发现明显问题')}</p>
      ${issues.map(x=>`<div>• ${esc(x)}</div>`).join('')}
    </div>
    <div class="report-page" style="padding:24px;color:#111;font-family:'Microsoft YaHei',Arial,sans-serif">
      <h2>${esc(L('对象清单'))}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr>${cols.map(c=>`<th style="border:1px solid #999;padding:4px;background:#eee">${esc(L(c))}</th>`).join('')}</tr></thead>
        <tbody>${rows.slice(0,180).map(r=>`<tr>${cols.map(c=>`<td style="border:1px solid #ccc;padding:4px">${esc(c==='对象类型'?L(r[c]):r[c])}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
      ${rows.length>180?`<p style="color:#666">${esc(L('清单超过 180 行，已在打印版截断；完整数据请导出 JSON/CSV。'))}</p>`:''}
    </div>`;
  window.print();
};
