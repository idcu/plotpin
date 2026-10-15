/* io.js —— 文件导入路由、底图导入压缩、表格导入预览、全部导出器、打印报告 */
/* -------------------- 文件：新建 / 底图 / 导入 -------------------- */
$('newBtn').onclick=()=>showConfirm('新建将清空当前工程。已自动保存的草稿会被覆盖，是否先导出 JSON？').then(ok=>{
  if(!ok)return;
  state=createInitialState(); selectedIds.clear(); history={past:[],future:[]};
  assetPrune([]).catch(()=>{});
  afterStateLoaded(); scheduleSave(); toast('已新建工程','success');
});
$('importBtn').onclick=()=>$('fileInput').click();
$('bgBtn').onclick=openSitePicker;
$('calibBtn').onclick=()=>{
  if(state.background.kind!=='image') return toast('矢量场地直接以米为坐标，无需比例尺校准；仅图片底图需要','warn');
  setTool('calibrate');
};
$('fileInput').addEventListener('change',e=>{
  const f=e.target.files[0]; e.target.value='';
  if(f) handleImportFile(f);
});
$('bgInput').addEventListener('change',e=>{
  const f=e.target.files[0]; e.target.value='';
  if(f) importBackgroundFile(f);
});
function extOfFile(name){ const m=String(name||'').toLowerCase().match(/\.([a-z0-9]+)$/); return m?m[1]:''; }
async function importJsonFile(f){
  try{
    const p=JSON.parse(await f.text());
    if(p.schema!==SCHEMA) throw new Error('schema');
    pushHistory();
    state=migrateProject(p);
    await ensureBackgroundAsset(state);
    selectedIds.clear(); afterStateLoaded(); scheduleSave(); toast('工程已导入','success');
  }catch(err){ toast('JSON 工程格式不正确（应为离线图纸标注 v1 工程）','error'); }
}
async function handleImportFile(f){
  const ext=extOfFile(f.name);
  if(ext==='json') return importJsonFile(f);
  if(ext==='csv'||ext==='tsv'||ext==='txt'){
    try{
      const text=await f.text();
      const rows=DSV.parseRows(text,ext==='tsv'?'\t':DSV.detectDelimiter(text));
      showTableImportPreview(f.name,rowsToObjectsPlan(rows));
    }catch(e){ toast('表格读取失败：'+e.message,'error'); }
    return;
  }
  if(ext==='xlsx'){
    try{
      const rows=await Xlsx.readRows(await f.arrayBuffer());
      if(!rows.length) return toast('XLSX 中没有可导入的工作表','warn');
      showTableImportPreview(f.name,rowsToObjectsPlan(rows));
    }catch(e){ toast('XLSX 解析失败：'+e.message,'error'); }
    return;
  }
  if(/^image\//.test(f.type||'')||['png','jpg','jpeg','gif','webp','bmp','svg'].includes(ext)) return importBackgroundFile(f);
  toast('不支持的文件类型：.'+(ext||'未知')+'（支持 JSON 工程 / CSV·TSV·XLSX 表格 / 图片底图）','error');
}

/* -------------------- 底图/场地：选择弹窗与矢量场地应用 -------------------- */
function openSitePicker(){
  openModal('底图 / 场地',
    `<div class="site-current"><b>当前：</b>${esc(siteDescription())}</div>
     <div class="site-pick">
       <button class="site-card" data-site="image"><b>🖼 上传图片底图</b><span class="hint-text">PNG/JPG/WebP/BMP；再用「比例尺」校准米/像素</span></button>
       <button class="site-card" data-site="rect-num"><b>▭ 矩形场地（输入尺寸）</b><span class="hint-text">直接输入长×宽（米）</span></button>
       <button class="site-card" data-site="rect-draw"><b>▭ 矩形场地（拖画）</b><span class="hint-text">在画布上拖出对角</span></button>
       <button class="site-card" data-site="circle-num"><b>● 圆形场地（输入半径）</b><span class="hint-text">按半径（米）生成</span></button>
       <button class="site-card" data-site="circle-draw"><b>● 圆形场地（拖画）</b><span class="hint-text">拖出半径长度</span></button>
       <button class="site-card" data-site="ellipse-num"><b>⬭ 椭圆场地（输入半径）</b><span class="hint-text">输入长/短轴半径（米）</span></button>
       <button class="site-card" data-site="ellipse-draw"><b>⬭ 椭圆场地（拖画）</b><span class="hint-text">拖出外接包围盒</span></button>
       <button class="site-card" data-site="sector-draw"><b>◔ 扇形场地（拖画）</b><span class="hint-text">拖出半径后输入起止角</span></button>
       <button class="site-card" data-site="polygon"><b>⬡ 多边形场地（描边）</b><span class="hint-text">沿边界逐点单击，双击/✓闭合；三角形同理</span></button>
     </div>
     <p class="hint-text">矢量场地直接以米为世界坐标，缩放时设备尺寸与场地保持真实比例。切换会替换当前底图/场地，已有标注对象保留（如需请重新对齐）。</p>`,
    [{text:'关闭',click:closeModal}]);
  $('modalBody').querySelectorAll('[data-site]').forEach(btn=>btn.onclick=async()=>{
    const act=btn.dataset.site;
    if(act==='image'){ closeModal(); $('bgInput').click(); return; }
    if(act==='rect-draw'){ closeModal(); setTool('site-rect'); return; }
    if(act==='circle-draw'){ closeModal(); setTool('site-circle'); return; }
    if(act==='ellipse-draw'){ closeModal(); setTool('site-ellipse'); return; }
    if(act==='sector-draw'){ closeModal(); setTool('site-sector'); return; }
    if(act==='polygon'){ closeModal(); setTool('site-polygon'); return; }
    if(act==='ellipse-num'){
      const v=await showPrompt({title:'椭圆场地',label:'长轴半径, 短轴半径（米，用逗号分隔），例如 40,25',value:'40,25'});
      if(v===null) return;
      const m=v.split(/[,，x×*\s]+/).map(Number);
      if(m.length<2||!(m[0]>0)||!(m[1]>0)) return toast('请输入两个正数半径，如 40,25','error');
      closeModal();
      applyVectorSite('ellipse',{type:'ellipse',cx:m[0],cy:m[1],rx:m[0],ry:m[1],angle:0});
      return;
    }
    if(act==='rect-num'){
      const v=await showPrompt({title:'矩形场地',label:'长 × 宽（米，用逗号或 x 分隔），例如 120,80',value:fmt(siteDomainOf().w)+','+fmt(siteDomainOf().h)});
      if(v===null) return;
      const m=v.split(/[,，x×*\s]+/).map(Number);
      if(m.length<2||!(m[0]>0)||!(m[1]>0)) return toast('请输入两个正数，如 120,80','error');
      closeModal(); applyVectorSite('rect',{type:'rect',w:m[0],h:m[1]});
      return;
    }
    if(act==='circle-num'){
      const v=await showPrompt({title:'圆形场地',label:'半径（米）',value:'30'});
      const r=Number(v);
      if(!(r>0)) return toast('请输入正数半径','error');
      closeModal(); applyVectorSite('circle',circleShapeFrom([0,0],r));
    }
  });
}
/** 应用矢量场地（替换当前图片底图；图片资产在无引用时回收） */
function applyVectorSite(kind,shape){
  pushHistory();
  const oldId=state.background.assetId;
  Object.assign(state.background,{kind,shape,assetId:'',fileName:'',calibrated:false});
  bgImage=null; bgDataUrl=''; selectedIds.clear();
  if(oldId) assetPrune([]).catch(()=>{});
  fitView(); commitChange('已设置为'+siteKindName(kind)); setTool('select');
}

/* -------------------- 底图导入：字节入资产库 + 大图自动压缩 -------------------- */
async function prepareBackgroundBytes(f){
  const raw=new Uint8Array(await f.arrayBuffer());
  const mime=f.type||'image/png';
  const url=URL.createObjectURL(new Blob([raw],{type:mime}));
  let img;
  try{ img=await loadImageSrc(url); }finally{ URL.revokeObjectURL(url); }
  const edge=Math.max(img.naturalWidth,img.naturalHeight);
  const huge=raw.length>BG_RECOMPRESS_LIMIT, isJpeg=/jpe?g$/i.test(mime);
  if(edge>BG_MAX_EDGE && (isJpeg||huge)){
    const scale=BG_MAX_EDGE/edge, w=Math.max(1,Math.round(img.naturalWidth*scale)), h=Math.max(1,Math.round(img.naturalHeight*scale));
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    c.getContext('2d').drawImage(img,0,0,w,h);
    const blob=await new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('图片压缩失败')),'image/jpeg',BG_JPEG_QUALITY));
    return {bytes:new Uint8Array(await blob.arrayBuffer()),mime:'image/jpeg',width:w,height,h,
      note:'底图过大，已压缩至 '+w+'×'+h+'（原始 '+img.naturalWidth+'×'+img.naturalHeight+'）'};
  }
  return {bytes:raw,mime,width:img.naturalWidth,height:img.naturalHeight};
}
async function importBackgroundFile(f){
  if(!f || !(/^image\//.test(f.type||'')||['png','jpg','jpeg','gif','webp','bmp','svg'].includes(extOfFile(f.name)))){
    return toast('请选择图片文件（PNG/JPG/WebP/BMP/GIF/SVG）','error');
  }
  let prepared;
  try{ prepared=await prepareBackgroundBytes(f); }
  catch(e){ return toast('底图读取失败：'+e.message,'error'); }
  const id=assetIdFor(prepared.bytes), oldId=state.background.assetId;
  let stored=true;
  try{ await assetPut(id,{bytes:prepared.bytes,mime:prepared.mime}); }
  catch(e){ stored=false; }   // IndexedDB 不可用时降级：底图仅本次会话保留
  pushHistory();
  const calibrated=state.background.calibrated;
  state.background.kind='image';
  state.background.fileName=f.name;
  state.background.assetId=stored?id:'';
  state.background.width=prepared.width; state.background.height=prepared.height;
  if(!calibrated) state.background.metersPerPixel=0.05;
  if(oldId&&stored&&oldId!==id) assetRemove(oldId);
  bgDataUrl=await bytesToDataUrl(prepared.bytes,prepared.mime).catch(()=> '');
  const seq=++bgLoadSeq;
  try{ bgImage=await loadImageSrc(bgDataUrl); if(seq===bgLoadSeq) requestRender(); }catch(e){ bgImage=null; }
  fitView(); commitChange('底图已导入');
  if(!stored) toast('浏览器本地存储不可用，底图仅本次会话有效，请改用 JSON 工程保存','warn');
  else if(prepared.note) toast(prepared.note,'warn');
}

/* -------------------- 表格导入（CSV/TSV/XLSX → 对象更新/新增） -------------------- */
const TABLE_KIND_BY_NAME={'点设备':'point','矩形/区域':'rect','线段/折线':'line','文字':'text','尺寸标注':'dimension'};
function tableNum(v){ const n=Number(String(v??'').trim()); return Number.isFinite(n)&&String(v??'').trim()!==''?n:NaN; }
function tableBool(v){ return /^(是|true|1|y|yes)$/i.test(String(v??'').trim()); }
function rowsToObjectsPlan(rows){
  const warnings=[];
  if(!rows||!rows.length) return {updates:[],creates:[],warnings:['文件内容为空，未导入任何行']};
  const header=rows[0].map(h=>String(h||'').trim().replace(/^\ufeff/,''));
  const idx={};
  header.forEach((h,i)=>{ if(TABLE_COLUMNS.includes(h)&&idx[h]===undefined) idx[h]=i; });
  if(idx['编号']===undefined&&idx['对象类型']===undefined){
    return {updates:[],creates:[],warnings:['首行未找到「编号/对象类型」表头，请使用本工具导出的 CSV/TSV/XLSX 模板']};
  }
  const cell=(r,name)=>idx[name]!==undefined?String(r[idx[name]]??'').trim():'';
  const byCode=new Map(state.objects.map(o=>[o.name,o]));
  const updates=[],creates=[];
  rows.slice(1).forEach((r,i)=>{
    const lineNo=i+2;
    if(!r.some(v=>String(v??'').trim()!=='')) return;
    const code=cell(r,'编号');
    const where='第 '+lineNo+' 行'+(code?'（编号 '+code+'）':'');
    if(code&&byCode.has(code)){ updates.push({obj:byCode.get(code),cell:c=>cell(r,c)}); return; }
    const kind=TABLE_KIND_BY_NAME[cell(r,'对象类型')];
    if(!kind){ warnings.push(where+'：对象类型「'+(cell(r,'对象类型')||'空')+'」无法识别，已跳过'); return; }
    if(kind==='line'||kind==='dimension'){ warnings.push(where+'：'+kindName(kind)+'节点坐标不在表格中，无法从表格重建，已跳过'); return; }
    const x=tableNum(cell(r,'X')), y=tableNum(cell(r,'Y'));
    if(!Number.isFinite(x)||!Number.isFinite(y)){ warnings.push(where+'：缺少有效 X/Y 坐标，已跳过'); return; }
    if(kind==='rect'&&(!(tableNum(cell(r,'宽度'))>0)||!(tableNum(cell(r,'高度'))>0))){ warnings.push(where+'：矩形缺少有效宽度/高度，已跳过'); return; }
    creates.push({kind,x,y,cell:c=>cell(r,c)});
  });
  return {updates,creates,warnings};
}
function showTableImportPreview(fileName,plan){
  if(!plan.updates.length&&!plan.creates.length&&plan.warnings.length){
    openModal('无法导入：'+fileName,'<div class="issue">'+plan.warnings.slice(0,10).map(esc).join('</div><div class="issue">')+'</div>',
      [{text:'知道了',class:'primary',click:closeModal}]);
    return;
  }
  const warnHtml=plan.warnings.length
    ? '<div style="max-height:190px;overflow:auto;margin:10px 0">'+plan.warnings.slice(0,50).map(w=>'<div class="issue">'+esc(w)+'</div>').join('')+
      (plan.warnings.length>50?'<p class="hint-text">其余 '+(plan.warnings.length-50)+' 条提示略</p>':'')+'</div>'
    : '<div class="ok-banner">全部行均可导入。</div>';
  openModal('表格导入预览：'+fileName,
    '<p style="line-height:1.7">将按「编号」匹配对象并更新属性：<b>'+plan.updates.length+'</b> 项更新、<b>'+plan.creates.length+'</b> 项新增。</p>'+
    '<p class="hint-text">可更新：名称、业务类型、图层、坐标、角度、宽高、显隐、锁定、备注；新对象仅支持点设备/矩形/文字。建议导入前先导出 JSON 备份。</p>'+warnHtml,
    [{text:'取消',click:closeModal},
     {text:'合并导入',class:'primary',click:()=>{closeModal();applyTableImport(plan);}}]);
}
function applyTableImport(plan){
  pushHistory();
  let updated=0,created=0;
  plan.updates.forEach(u=>{
    const o=u.obj,c=u.cell;
    const name=c('名称'); if(name!=='') o.text=name;
    const tn=c('业务类型');
    if(tn){ const t=state.objectTypes.find(x=>x.kind===o.kind&&x.name===tn); if(t) o.typeId=t.id; }
    const ln=c('图层');
    if(ln){ const l=state.layers.find(x=>x.name===ln); if(l) o.layerId=l.id; }
    const x=tableNum(c('X')),y=tableNum(c('Y')),ang=tableNum(c('角度'));
    if(Number.isFinite(x)) o.x=x;
    if(Number.isFinite(y)) o.y=y;
    if(Number.isFinite(ang)) o.angle=normalizeAngle(ang);
    if(o.kind==='rect'&&areaShapeType(o)==='rect'){ const w=tableNum(c('宽度')),h=tableNum(c('高度')); if(w>0)o.width=w; if(h>0)o.height=h; }
    const vis=c('显示'); if(vis!=='') o.visible=tableBool(vis);
    const lk=c('锁定'); if(lk!=='') o.locked=tableBool(lk);
    const note=c('备注'); if(note!==''){ o.props=o.props||{}; o.props.note=note; }
    o.updatedAt=nowISO(); updated++;
  });
  plan.creates.forEach(cr=>{
    const c=cr.cell;
    const type=state.objectTypes.find(x=>x.kind===cr.kind&&x.name===c('业务类型'));
    const o=baseObject(cr.kind,type?type.id:defaultTypeId(cr.kind));
    o.x=cr.x; o.y=cr.y;
    const ang=tableNum(c('角度')); if(Number.isFinite(ang)) o.angle=normalizeAngle(ang);
    if(cr.kind==='rect'){ o.width=tableNum(c('宽度')); o.height=tableNum(c('高度')); }
    if(cr.kind==='text'){ o.text=c('名称')||'文字'; o.height=2.2; }
    const ln=c('图层'); const l=state.layers.find(x=>x.name===ln); if(l) o.layerId=l.id;
    const vis=c('显示'); if(vis!=='') o.visible=tableBool(vis);
    const lk=c('锁定'); if(lk!=='') o.locked=tableBool(lk);
    const note=c('备注'); if(note!==''){ o.props=o.props||{}; o.props.note=note; }
    state.objects.push(o); created++;
  });
  selectedIds.clear();
  commitChange('表格导入完成：更新 '+updated+' 项，新增 '+created+' 项');
}

/* -------------------- 导出 -------------------- */
$('exportBtn').onclick=()=>{
  const kind=$('exportKind').value;
  if(kind==='json') exportJSON();
  if(kind==='png') exportPNG();
  if(kind==='svg') exportSVG();
  if(kind==='csv') exportDelimited(',','csv','text/csv;charset=utf-8');
  if(kind==='tsv') exportDelimited('\t','tsv','text/tab-separated-values;charset=utf-8');
  if(kind==='xlsx') exportXlsx();
};
function downloadBlob(blob,name){
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),800);
}
function safeName(){ return (state.meta.name||'图纸工程').replace(/[\\/:*?"<>|]/g,'_'); }
async function exportJSON(){
  state.meta.updatedAt=nowISO();
  // 工程文件保持可移植：底图字节虽存于 IndexedDB，导出 JSON 时内嵌 dataURL 一并带走
  const copy=persistableState();
  copy.meta.updatedAt=state.meta.updatedAt;
  if(state.background.assetId&&bgDataUrl) copy.background.dataUrl=bgDataUrl;
  downloadBlob(new Blob([JSON.stringify(copy,null,2)],{type:'application/json'}),safeName()+'.json');
  toast('JSON 工程已导出（含底图）','success');
}
const TABLE_COLUMNS=['编号','名称','对象类型','业务类型','图层','X','Y','角度','宽度','高度','节点数','长度','面积','显示','锁定','备注','更新时间'];
function objectRows(){
  return state.objects.map(o=>{
    const t=getType(o.typeId),l=layerOf(o);
    /* 非矩形区域：宽/高列填外接盒尺寸（圆/扇形=2r，椭圆=2rx×2ry），面积仍取精确值 */
    let w='',h='',ang=o.angle||0;
    if(o.kind==='rect'){
      const tt=areaShapeType(o), sh=o.shape||{};
      if(tt==='rect'){ w=o.width; h=o.height; }
      else if(tt==='circle'){ w=h=2*sh.r; }
      else if(tt==='ellipse'){ w=2*sh.rx; h=2*sh.ry; }
      else { w=h=2*sh.r; ang=Math.round(Number(sh.a0)||0); }
    }
    return {
      编号:o.name,名称:o.text||'',对象类型:kindName(o.kind),业务类型:t.name,图层:l.name,
      X:fmt(o.x),Y:fmt(o.y),角度:ang,宽度:w?fmt(w):'',高度:h?fmt(h):'',
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
  const d=worldDims(), margin=30, maxW=1800, ppu=Math.min(maxW/d.w,1200/d.h,40), sw=d.w*ppu+margin*2, sh=d.h*ppu+margin*2;
  const X=x=>margin+x*ppu, Y=y=>margin+(d.h-y)*ppu;
  const shapes=[], markers=[];
  if(state.background.kind==='image'&&bgImage&&bgDataUrl){
    shapes.push(`<image x="${X(0)}" y="${Y(d.h)}" width="${d.w*ppu}" height="${d.h*ppu}" href="${bgDataUrl}" xlink:href="${bgDataUrl}"/>`);
  }else if(state.background.shape?.type==='circle'){
    const sh=state.background.shape;
    shapes.push(`<circle cx="${X(sh.cx)}" cy="${Y(sh.cy)}" r="${sh.r*ppu}" fill="#eef2f7" stroke="#3b82f6" stroke-width="2"/>`);
  }else if(state.background.shape?.type==='ellipse'){
    const sh=state.background.shape;
    shapes.push(`<ellipse cx="${X(sh.cx)}" cy="${Y(sh.cy)}" rx="${sh.rx*ppu}" ry="${sh.ry*ppu}" transform="rotate(${-Number(sh.angle)||0} ${X(sh.cx)} ${Y(sh.cy)})" fill="#eef2f7" stroke="#3b82f6" stroke-width="2"/>`);
  }else if(state.background.shape?.type==='sector'){
    const sh=state.background.shape, R=sh.r*ppu, cx=X(sh.cx), cy=Y(sh.cy), sweep=sectorSweep(sh);
    const ex=a=>[cx+R*Math.cos(a*Math.PI/180),cy-R*Math.sin(a*Math.PI/180)];
    const p0=ex(Number(sh.a0)||0), p1=ex(Number(sh.a0)||0+sweep), large=sweep>180?1:0;
    shapes.push(`<path d="M${cx},${cy} L${p1[0]},${p1[1]} A${R},${R} 0 ${large} 1 ${p0[0]},${p0[1]} Z" fill="#eef2f7" stroke="#3b82f6" stroke-width="2"/>`);
  }else if(state.background.shape?.type==='polygon'&&state.background.shape?.points?.length){
    const pts=state.background.shape.points.map(p=>`${X(p[0])},${Y(p[1])}`).join(' ');
    shapes.push(`<polygon points="${pts}" fill="#eef2f7" stroke="#3b82f6" stroke-width="2"/>`);
  }else{
    shapes.push(`<rect x="${X(0)}" y="${Y(d.h)}" width="${d.w*ppu}" height="${d.h*ppu}" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/>`);
  }
  state.objects.filter(isVisible).forEach(o=>{
    const t=getType(o.typeId), color=o.style.color||t.color;
    if(o.kind==='rect'){
      const pts=shapeWorldPoints(o).map(p=>`${X(p[0])},${Y(p[1])}`).join(' ');
      shapes.push(`<polygon points="${pts}" fill="${color}" fill-opacity="${styleVal(o,'fillAlpha',.15)}" stroke="${color}" stroke-width="${styleVal(o,'strokeWidth',.1)*ppu}"/>`);
      if(state.settings.showLabels&&o.name){ const ce=shapeLabelCenter(o); markers.push(`<text x="${X(ce[0])}" y="${Y(ce[1])}" text-anchor="middle" font-size="14" fill="${color}">${esc(o.name)}</text>`); }
    }else if(o.kind==='line'&&o.points.length){
      const pts=o.points.map(p=>`${X(p[0])},${Y(p[1])}`).join(' ');
      shapes.push(`<polyline points="${pts}" fill="${o.closed?color:'none'}" fill-opacity=".08" stroke="${color}" stroke-width="${styleVal(o,'strokeWidth',.1)*ppu}"/>`);
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
        const k=pointIconScale(o);
        markers.push(`<g transform="translate(${x} ${y}) rotate(${-o.angle}) scale(${k})"><circle r="9" fill="#fff" stroke="${color}" stroke-width="2"/><circle r="3.5" fill="${color}"/><line x1="9" y1="0" x2="20" y2="0" stroke="${color}" stroke-width="2"/></g>`);
      }
      if(state.settings.showLabels&&o.name){
        const ly=(o.phys||0)>0?y-Math.max(13,(o.phys||0)/2*ppu+6):y-20*pointIconScale(o);
        markers.push(`<text x="${x}" y="${ly}" text-anchor="middle" font-size="12" fill="${color}">${esc(o.name)}</text>`);
      }
    }else if(o.kind==='text'){
      markers.push(`<text x="${X(o.x)}" y="${Y(o.y)}" transform="rotate(${-o.angle} ${X(o.x)} ${Y(o.y)})" text-anchor="middle" font-size="${Math.max(10,o.height*ppu*.55)}" fill="${o.style.color||'#111'}">${esc(o.text||'文字')}</text>`);
    }else if(o.kind==='dimension'&&o.points.length>=2){
      const pts=o.points.map(p=>`${X(p[0])},${Y(p[1])}`).join(' ');
      shapes.push(`<polyline points="${pts}" fill="none" stroke="#111827" stroke-width="1.6"/>`);
      if(o.subtype==='distance') markers.push(`<text x="${(X(o.points[0][0])+X(o.points[1][0]))/2}" y="${(Y(o.points[0][1])+Y(o.points[1][1]))/2-8}" text-anchor="middle" font-size="12">${fmt(dist(o.points[0],o.points[1]))} m</text>`);
    }
  });
  const svg=`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${sw}" height="${sh}" viewBox="0 0 ${sw} ${sh}">
<rect width="100%" height="100%" fill="white"/>
<g>${shapes.join('\n')}</g><g font-family="Microsoft YaHei,Arial,sans-serif">${markers.join('\n')}</g>
<text x="${margin}" y="${sh-8}" font-size="11" fill="#666">${esc(state.meta.name)} · ${esc(siteDescription())}</text>
</svg>`;
  downloadBlob(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),safeName()+'.svg');
  toast('SVG 已导出','success');
}

/* -------------------- 打印 / PDF 报告 -------------------- */
$('printBtn').onclick=()=>{
  const rows=objectRows(), issues=findIssues(), img=renderToDataURL(1.5);
  const cols=['编号','对象类型','业务类型','图层','X','Y','参数'];
  $('report').innerHTML=`
    <div class="report-page" style="padding:24px;color:#111;font-family:'Microsoft YaHei',Arial,sans-serif">
      <h1 style="margin:0 0 8px">${esc(state.meta.name)} - 图纸标注报告</h1>
      <div style="color:#555;margin-bottom:14px">生成时间：${new Date().toLocaleString()} ｜ ${esc(siteDescription())}</div>
      <img src="${img}" style="width:100%;max-height:58vh;object-fit:contain;border:1px solid #ccc">
      <h2>统计摘要</h2>
      <p>对象总数：${state.objects.length} ｜ 点设备：${state.objects.filter(o=>o.kind==='point').length} ｜ 区域：${state.objects.filter(o=>o.kind==='rect').length} ｜ 折线：${state.objects.filter(o=>o.kind==='line').length}</p>
      <p>几何检查：${issues.length?issues.length+' 项提示':'未发现明显问题'}</p>
      ${issues.map(x=>`<div>• ${esc(x)}</div>`).join('')}
    </div>
    <div class="report-page" style="padding:24px;color:#111;font-family:'Microsoft YaHei',Arial,sans-serif">
      <h2>对象清单</h2>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr>${cols.map(c=>`<th style="border:1px solid #999;padding:4px;background:#eee">${c}</th>`).join('')}</tr></thead>
        <tbody>${rows.slice(0,180).map(r=>`<tr>${cols.map(c=>`<td style="border:1px solid #ccc;padding:4px">${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
      ${rows.length>180?`<p style="color:#666">清单超过 180 行，已在打印版截断；完整数据请导出 JSON/CSV。</p>`:''}
    </div>`;
  window.print();
};
