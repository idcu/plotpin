/* io-import.js —— 文件导入路由、DXF/PDF/图片底图、底图/场地选择 */
function extOfFile(name){ const m=String(name||'').toLowerCase().match(/\.([a-z0-9]+)$/); return m?m[1]:''; }
async function importJsonFile(f){
  try{
    const p=JSON.parse(await f.text());
    if(!isReadableSchema(p.schema)) throw new Error('schema');
    state=migrateProject(p);
    /* 跨设备导入的 JSON 不接管本机工程库绑定，避免覆盖同名工程；需要时可另存到工程库 */
    delete state.meta.projectId;
    await ensureBackgroundAsset(state);
    /* 导入即新基线：清空撤销栈，避免 Ctrl+Z 把导入前的工程撤回来；
       资产回收必须走全库可达集（其他工程库记录仍可达），不能只保留当前底图 */
    history={past:[],future:[]};
    selectedIds.clear(); draft=null;
    await pruneBgAssets();
    afterStateLoaded(); scheduleSave(); toast('工程已导入','success');
  }catch(err){ toast('JSON 工程格式不正确（应为图钉 PlotPin 导出的 v1 工程文件）','error'); }
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
  if(ext==='dxf') return importDxfFile(f);
  if(ext==='pdf') return importPdfFile(f);
  if(/^image\//.test(f.type||'')||['png','jpg','jpeg','gif','webp','bmp','svg'].includes(ext)) return importBackgroundFile(f);
  /* 第三方插件注册的导入器 */
  if(typeof PlotPin!=='undefined'){
    const imp=PlotPin.findImporter(ext);
    if(imp) return importViaPlugin(imp,f);
  }
  toast('不支持的文件类型：.'+(ext||'未知')+'（支持 JSON 工程 / DXF / PDF / CSV·TSV·XLSX 表格 / 图片底图）','error');
}

/* -------------------- DXF 导入（CAD 互通） -------------------- */
async function importDxfFile(f){
  let parsed;
  try{ parsed=Dxf.parseDxf(await f.text()); }
  catch(e){ return toast('DXF 解析失败：'+e.message,'error'); }
  const ents=parsed.entities;
  if(!ents.length) return toast('DXF 中未找到支持的实体（LINE/多段线/圆/弧/点/文字）','error');
  pushHistory();
  /* DXF 图层：缺失的自动创建（锁定/可见默认） */
  ents.map(e=>e.layer).forEach(n=>{
    if(n&&!state.layers.some(l=>l.name===n)) state.layers.push({id:safeId('layer_'+n,'LAYER'),name:n,visible:true,locked:false});
  });
  const layerIdFor=n=>{ const l=state.layers.find(x=>x.name===n); return l?l.id:'layer.default'; };
  const counts={line:0,rect:0,point:0,text:0};
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const bounds=p=>p.forEach(([x,y])=>{minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);});
  ents.forEach(e=>{
    if(e.type==='LWPOLYLINE'){
      const pts=e.points.map(p=>[p[0],p[1]]);
      if(pts.length<2) return;
      bounds(pts);
      const o=baseObject('line','line.custom',{points:pts,closed:!!e.closed,x:pts[0][0],y:pts[0][1],layerId:layerIdFor(e.layer)});
      state.objects.push(o); counts.line++;
    }else if(e.type==='CIRCLE'){
      if(!(e.r>0)) return;
      const x=e.x,y=e.y,r=e.r; bounds([[x-r,y-r],[x+r,y+r]]);
      const o=baseObject('rect','rect.area',{x,y,shape:{type:'circle',r},width:0,height:0,layerId:layerIdFor(e.layer)});
      state.objects.push(o); counts.rect++;
    }else if(e.type==='POINT'){
      const x=e.x,y=e.y; bounds([[x,y]]);
      const o=baseObject('point','point.marker',{x,y,layerId:layerIdFor(e.layer)});
      state.objects.push(o); counts.point++;
    }else if(e.type==='TEXT'){
      const x=e.x,y=e.y,h=e.height||1; bounds([[x,y],[x+h*4,y+h]]);
      const o=baseObject('text',null,{x,y,text:e.text||'文字',height:h>0?h:1,layerId:layerIdFor(e.layer)});
      o.typeId='text.builtin';
      state.objects.push(o); counts.text++;
    }
  });
  /* 默认矩形场地时，扩到能容纳导入几何（坐标允许负值，只扩不挪）；图片槽不受影响 */
  if(state.site&&state.site.kind==='rect'&&state.site.shape?.type==='rect'&&Number.isFinite(maxX)){
    state.site.shape.w=Math.max(state.site.shape.w,maxX+10);
    state.site.shape.h=Math.max(state.site.shape.h,maxY+10);
  }
  selectedIds.clear();
  commitChange('DXF 已导入：'+counts.line+' 线 / '+counts.rect+' 圆 / '+counts.point+' 点 / '+counts.text+' 文字');
  fitView();
}

/* -------------------- PDF 底图导入（矢量优先，扫描件取最大内嵌图） -------------------- */
async function importPdfFile(f){
  let pdf;
  try{ pdf=await PdfRead.parsePdf(await f.arrayBuffer()); }
  catch(e){ return toast('PDF 解析失败：'+e.message,'error'); }
  const k=pdf.unitMeter;
  /* PDF 单位点→米：内容坐标已按 MediaBox 左下角归零（Y 向上），直接映射 */
  if(!pdf.paths.length && !pdf.texts.length && !pdf.images.length){
    return toast('PDF 中未提取到可用图形（可能是扫描图片但无内嵌图，或使用了不支持的压缩）','error');
  }
  /* 扫描件/带底图的 PDF：最大内嵌图作为图片底图 */
  let bgNote='';
  if(pdf.images.length){
    const img=pdf.images[0];
    const mime=img.mime;
    const bin=img.bytes;
    let dataUrl='data:'+mime+';base64,';
    let s=''; const CH=0x4000;
    for(let i=0;i<bin.length;i+=CH) s+=String.fromCharCode.apply(null,bin.subarray(i,i+CH));
    dataUrl+=btoa(s);
    const mpp=pdf.pageWidth*k/img.width;   /* PDF 页宽(米)/图像像素宽 */
    const wM=pdf.pageWidth*k, hM=pdf.pageHeight*k;
    pushHistory();
    state.background.kind='image';
    state.background.fileName=f.name.replace(/\.pdf$/i,'')+'（PDF内嵌图）';
    state.background.assetId='';          /* 不进 IDB 资产库，直接 dataUrl 内联运行时 */
    state.background.dataUrl=dataUrl;
    state.background.width=img.width; state.background.height=img.height;
    state.background.metersPerPixel=mpp; state.background.calibrated=true;
    state.background.transform=null;   /* 新图像素坐标改变，清除旧仿射校准 */
    bgDataUrl=dataUrl;
    try{ bgImage=await loadImageSrc(dataUrl); }catch(e){ bgImage=null; }
    bgNote='底图 '+img.width+'×'+img.height;
    /* 矢量叠加仍以 PDF 页世界尺寸为场地，图片米/像素一致 */
  }
  /* 矢量内容：路径转折线/区域，文本转文字对象。点→米 */
  const counts={line:0,area:0,text:0};
  const wM=pdf.pageWidth*k, hM=pdf.pageHeight*k;
  if((pdf.paths.length||pdf.texts.length)&&!pdf.images.length) pushHistory();
  for(const p of pdf.paths){
    const pts=p.points.map(q=>[q[0]*k,q[1]*k]);
    if(pts.length<2) continue;
    const len=polylineLength(pts);
    if(len<0.05) continue;   /* 去噪 */
    const o=baseObject('line','line.custom',{points:pts,closed:!!p.closed,x:pts[0][0],y:pts[0][1]});
    if(p.closed){
      o.style={strokeWidth:.05};
      counts.area++;
    }else counts.line++;
    state.objects.push(o);
  }
  for(const t of pdf.texts){
    const h=(t.size||1)*k;
    if(!(h>0)||!t.text) continue;
    const o=baseObject('text',null,{x:t.x*k,y:t.y*k,text:t.text,height:h,style:{color:'#111827'}});
    o.typeId='text.builtin'; if(!state.objectTypes.some(x=>x.id==='text.builtin')) state.objectTypes.push({id:'text.builtin',kind:'text',name:'文字',color:'#111827',icon:'text',builtin:true});
    state.objects.push(o); counts.text++;
  }
  /* 无内嵌图时，把矢量场地设为 PDF 页面尺寸的矩形域，保证坐标框正确；图片槽保持不变 */
  if(!pdf.images.length && state.site && state.site.kind==='rect' && state.site.shape?.type==='rect'){
    state.site.shape.w=Math.max(state.site.shape.w,wM||100);
    state.site.shape.h=Math.max(state.site.shape.h,hM||70);
  }
  selectedIds.clear();
  commitChange('PDF 已导入：'+counts.line+' 线 / '+counts.area+' 区域 / '+counts.text+' 文字'+(bgNote?' / '+bgNote:''));
  fitView();
}

/* -------------------- 底图/场地：选择弹窗与矢量场地应用 -------------------- */
function openSitePicker(){
  openModal(L('底图 / 场地'),
    `<div class="site-current"><b>${esc(L('当前：'))}</b>${esc(L('图片底图')+'：'+(isImageBackground(state.background)?(state.background.fileName||L('已导入')):L('未设置'))+'；'+siteDescription(state.site))}</div>
     <div class="site-pick">
       <button class="site-card" data-site="image"><b>🖼 ${esc(L('上传图片底图'))}</b><span class="hint-text">${esc(L('PNG/JPG/WebP/BMP；再用「比例尺」校准米/像素'))}</span></button>
       <button class="site-card" data-site="rect-num"><b>▭ ${esc(L('矩形场地（输入尺寸）'))}</b><span class="hint-text">${esc(L('直接输入长×宽（米）'))}</span></button>
       <button class="site-card" data-site="rect-draw"><b>▭ ${esc(L('矩形场地（拖画）'))}</b><span class="hint-text">${esc(L('在画布上拖出对角'))}</span></button>
       <button class="site-card" data-site="circle-num"><b>● ${esc(L('圆形场地（输入半径）'))}</b><span class="hint-text">${esc(L('按半径（米）生成'))}</span></button>
       <button class="site-card" data-site="circle-draw"><b>● ${esc(L('圆形场地（拖画）'))}</b><span class="hint-text">${esc(L('拖出半径长度'))}</span></button>
       <button class="site-card" data-site="ellipse-num"><b>⬭ ${esc(L('椭圆场地（输入半径）'))}</b><span class="hint-text">${esc(L('输入长/短轴半径（米）'))}</span></button>
       <button class="site-card" data-site="ellipse-draw"><b>⬭ ${esc(L('椭圆场地（拖画）'))}</b><span class="hint-text">${esc(L('拖出外接包围盒'))}</span></button>
       <button class="site-card" data-site="sector-draw"><b>◔ ${esc(L('扇形场地（拖画）'))}</b><span class="hint-text">${esc(L('拖出半径后输入起止角'))}</span></button>
       <button class="site-card" data-site="para-num"><b>▱ ${esc(L('平行四边形场地（输入尺寸）'))}</b><span class="hint-text">${esc(L('输入 底边, 高, 倾角（米/度）'))}</span></button>
       <button class="site-card" data-site="para-draw"><b>▱ ${esc(L('平行四边形场地（拖画）'))}</b><span class="hint-text">${esc(L('拖出底×高，生成后默认倾角 30°'))}</span></button>
       <button class="site-card" data-site="polygon"><b>⬡ ${esc(L('多边形场地（描边）'))}</b><span class="hint-text">${esc(L('沿边界逐点单击，双击/✓闭合；三角形同理'))}</span></button>
     </div>
     <p class="hint-text">${esc(L('图片底图与矢量场地可共存：每层最多 1 张图 + 1 个场地。矢量场地直接以米为世界坐标，缩放时保持真实比例；替换场地不会删除已导入的图片底图，已有标注对象保留（如需请重新对齐）。'))}</p>`,
    [{text:L('关闭'),click:closeModal}]);
  $('modalBody').querySelectorAll('[data-site]').forEach(btn=>btn.onclick=async()=>{
    const act=btn.dataset.site;
    if(act==='image'){ closeModal(); $('bgInput').click(); return; }
    if(act==='rect-draw'){ closeModal(); setTool('site-rect'); return; }
    if(act==='circle-draw'){ closeModal(); setTool('site-circle'); return; }
    if(act==='ellipse-draw'){ closeModal(); setTool('site-ellipse'); return; }
    if(act==='sector-draw'){ closeModal(); setTool('site-sector'); return; }
    if(act==='para-draw'){ closeModal(); setTool('site-parallelogram'); return; }
    if(act==='para-num'){
      const v=await showPrompt({title:L('平行四边形场地'),label:L('底边, 高, 倾角（米/度，用逗号分隔），例如 120,80,30'),value:'120,80,30'});
      if(v===null) return;
      const m=v.split(/[,，x×*\s]+/).map(Number);
      if(m.length<2||!(m[0]>0)||!(m[1]>0)) return toast(L('请输入底边与高（均为正数），如 120,80,30'),'error');
      const skew=Number.isFinite(m[2])?m[2]:PARALLELOGRAM_DEFAULT_SKEW;
      closeModal();
      applyVectorSite('parallelogram',{type:'parallelogram',x:0,y:0,w:m[0],h:m[1],skew});
      return;
    }
    if(act==='polygon'){ closeModal(); setTool('site-polygon'); return; }
    if(act==='ellipse-num'){
      const v=await showPrompt({title:L('椭圆场地'),label:L('长轴半径, 短轴半径（米，用逗号分隔），例如 40,25'),value:'40,25'});
      if(v===null) return;
      const shape=ellipseShapeFromInput(v);
      if(!shape) return toast(L('请输入两个正数半径，如 40,25'),'error');
      closeModal();
      applyVectorSite('ellipse',shape);
      return;
    }
    if(act==='rect-num'){
      const v=await showPrompt({title:L('矩形场地'),label:L('长 × 宽（米，用逗号或 x 分隔），例如 120,80'),value:fmt(siteDomainOf().w)+','+fmt(siteDomainOf().h)});
      if(v===null) return;
      const m=v.split(/[,，x×*\s]+/).map(Number);
      if(m.length<2||!(m[0]>0)||!(m[1]>0)) return toast(L('请输入两个正数，如 120,80'),'error');
      closeModal(); applyVectorSite('rect',{type:'rect',w:m[0],h:m[1]});
      return;
    }
    if(act==='circle-num'){
      const v=await showPrompt({title:L('圆形场地'),label:L('半径（米）'),value:'30'});
      const r=Number(v);
      if(!(r>0)) return toast(L('请输入正数半径'),'error');
      closeModal(); applyVectorSite('circle',circleShapeFrom([0,0],r));
    }
  });
}
/** 椭圆数值输入解析（纯函数）：输入只提供长/短轴半径，中心固定在**世界原点**。
 * 旧实现把 `m[0]/m[1]` 同时当半径与圆心，导致椭圆整体偏移 (rx,ry)（审计 P1-5）。 */
function ellipseShapeFromInput(text){
  const m=String(text||'').split(/[,，x×*\s]+/).map(Number);
  if(m.length<2||!(m[0]>0)||!(m[1]>0)) return null;
  return {type:'ellipse',cx:0,cy:0,rx:m[0],ry:m[1],angle:0};
}
/** 应用矢量场地：只更新独立 site 槽，保留图片底图、场地元数据（id/name/layer/visible/locked/annot/style） */
function applyVectorSite(kind,shape){
  pushHistory();
  const site=state.site||createSiteSlot(shape);
  site.kind=shape.type||kind;
  site.shape=deepClone(shape);
  site.updatedAt=nowISO();
  if(!state.site) state.site=site;
  selectedIds.clear();
  fitView(); commitChange(L('已设置为')+L(siteKindName(kind))); setTool('select');
}

/* -------------------- 底图导入：字节入资产库 + 大图自动降采样 -------------------- */
/** 底图降采样策略（纯函数）：最长边一律限制在 BG_MAX_EDGE，避免大尺寸图片解码后占用巨量内存。
 *  透明格式（PNG/WebP/GIF/BMP）在未超过体积上限时重编码为 PNG 以保留透明，否则转 JPEG。 */
function backgroundScalePlan(w,h,mime,byteLen){
  if(/^image\/svg\+xml$/i.test(String(mime||''))) return null;
  const width=Math.max(1,Math.round(Number(w)||0));
  const height=Math.max(1,Math.round(Number(h)||0));
  const edge=Math.max(width,height);
  if(!(edge>BG_MAX_EDGE)) return null;
  const scale=BG_MAX_EDGE/edge;
  const tw=Math.max(1,Math.round(width*scale)), th=Math.max(1,Math.round(height*scale));
  const huge=Number(byteLen)>BG_RECOMPRESS_LIMIT;
  const keepAlpha=/^image\/(png|webp|gif|bmp)/i.test(String(mime||''))&&!huge;
  return {width:tw,height:th,format:keepAlpha?'image/png':'image/jpeg',quality:keepAlpha?undefined:BG_JPEG_QUALITY};
}
async function prepareBackgroundBytes(f){
  const raw=new Uint8Array(await f.arrayBuffer());
  const mime=f.type||'image/png';
  const url=URL.createObjectURL(new Blob([raw],{type:mime}));
  let img;
  try{ img=await loadImageSrc(url); }finally{ URL.revokeObjectURL(url); }
  const plan=backgroundScalePlan(img.naturalWidth,img.naturalHeight,mime,raw.length);
  if(plan){
    const c=document.createElement('canvas'); c.width=plan.width; c.height=plan.height;
    c.getContext('2d').drawImage(img,0,0,plan.width,plan.height);
    const blob=await new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('图片压缩失败')),plan.format,plan.quality));
    return {bytes:new Uint8Array(await blob.arrayBuffer()),mime:plan.format,width:plan.width,height:plan.height,
      note:'底图过大，已降采样至 '+plan.width+'×'+plan.height+'（原始 '+img.naturalWidth+'×'+img.naturalHeight+'）'};
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
  const id=assetIdFor(prepared.bytes);
  let stored=true;
  try{ await assetPut(id,{bytes:prepared.bytes,mime:prepared.mime}); }
  catch(e){ stored=false; }   // IndexedDB 不可用时降级：底图仅本次会话保留
  pushHistory();
  const calibrated=state.background.calibrated;
  state.background.kind='image';
  state.background.fileName=f.name;
  state.background.assetId=stored?id:'';
  state.background.width=prepared.width; state.background.height=prepared.height;
  state.background.transform=null;   /* 新图像素坐标改变，清除旧仿射校准 */
  if(!calibrated) state.background.metersPerPixel=0.05;
  /* 不立即删除旧资产：pushHistory 的撤销快照仍引用它，立即删会导致撤销后底图无法恢复；
     待历史栈不再可达时由 pruneBgAssets 统一回收（评估报告 5.2） */
  bgDataUrl=await bytesToDataUrl(prepared.bytes,prepared.mime).catch(()=> '');
  const seq=++bgLoadSeq;
  try{ bgImage=await loadImageSrc(bgDataUrl); if(seq===bgLoadSeq) requestRender(); }catch(e){ bgImage=null; }
  fitView(); pruneBgAssets(); commitChange('底图已导入');
  if(!stored) toast('浏览器本地存储不可用，底图仅本次会话有效，请改用 JSON 工程保存','warn');
  else if(prepared.note) toast(prepared.note,'warn');
}

/* -------------------- 文件输入绑定 -------------------- */
$('bgBtn').onclick=openSitePicker;
$('calibBtn').onclick=()=>{
  if(!isImageBackground(state.background)) return toast('当前没有图片底图；矢量场地直接以米为坐标，无需比例尺校准','warn');
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
