/* io.js —— 文件导入路由、底图导入压缩、表格导入预览、全部导出器、打印报告 */
/* -------------------- 文件：新建 / 底图 / 导入 -------------------- */
$('newBtn').onclick=()=>showConfirm('新建将清空当前工程。已自动保存的草稿会被覆盖，是否先导出 JSON 或另存到工程库？').then(ok=>{
  if(!ok)return;
  state=createInitialState(); selectedIds.clear(); history={past:[],future:[]};
  assetPrune([]).catch(()=>{});
  afterStateLoaded(); scheduleSave(); toast('已新建工程','success');
});
$('importBtn').onclick=()=>$('fileInput').click();
/* -------------------- 多工程库 -------------------- */
const BG_KIND_LABELS={image:'图片底图',rect:'矩形场地',circle:'圆形场地',ellipse:'椭圆场地',sector:'扇形场地',polygon:'多边形场地'};
$('projBtn').onclick=openProjectLibrary;
async function openProjectLibrary(){
  const projects=await listProjects();
  const rows=projects.map(p=>{
    const dt=p.updatedAt?new Date(p.updatedAt).toLocaleString():'';
    const bg=BG_KIND_LABELS[p.bgKind]||p.bgKind;
    return `<div class="proj-row${p.bound?' bound':''}" data-id="${esc(p.id)}">
      <div class="proj-info"><b>${esc(p.name)}</b>${p.bound?'<span class="proj-tag">当前打开</span>':''}
        <span class="hint-text">${p.objectCount} 个对象 · ${esc(bg)} · ${esc(dt)}</span></div>
      <div class="proj-ops">
        <button data-op="open" ${p.bound?'disabled':''}>打开</button>
        <button data-op="rename">重命名</button>
        <button data-op="copy">复制</button>
        <button data-op="del" class="danger">删除</button>
      </div></div>`;
  }).join('')||'<p class="hint-text">工程库还是空的。先把当前图纸「另存到工程库」，以后可在多个工程间快速切换。</p>';
  const boundName=state.meta.projectId?(state.meta.name||'当前工程'):'';
  openModal('工程库（保存在本机浏览器）',
    `<div class="proj-current">当前草稿：<b>${esc(state.meta.name)}</b>${boundName?' · 已绑定工程库':''}　对象 ${state.objects.length} 个</div>
     <div style="margin:8px 0"><button class="primary" id="projSaveAs">💾 把当前图纸另存到工程库</button></div>
     <div class="proj-list">${rows}</div>
     <p class="hint-text">工程自动保存：绑定后每次修改都会同步到工程库；删除工程不影响已导出的 JSON 文件。</p>`,
    [{text:'关闭',click:closeModal}]);
  $('projSaveAs').onclick=async()=>{
    const v=await showPrompt({title:'另存到工程库',label:'工程名称',value:state.meta.name||'未命名图纸工程'});
    if(v===null) return;
    await saveProjectAs(v); toast('已存入工程库','success'); closeModal(); openProjectLibrary();
  };
  document.querySelectorAll('.proj-row').forEach(row=>{
    row.querySelectorAll('button[data-op]').forEach(btn=>btn.addEventListener('click',async()=>{
      const id=row.dataset.id, op=btn.dataset.op;
      try{
        if(op==='open'){
          closeModal(); await openProjectById(id); toast('已打开工程：'+(state.meta.name||''),'success');
        }else if(op==='rename'){
          const cur=projects.find(p=>p.id===id);
          const v=await showPrompt({title:'重命名工程',label:'工程名称',value:cur?.name||''});
          if(v===null) return;
          await renameProjectById(id,v); toast('已重命名','success'); openProjectLibrary();
        }else if(op==='copy'){
          await duplicateProjectById(id); toast('已复制一份到工程库','success'); openProjectLibrary();
        }else if(op==='del'){
          const cur=projects.find(p=>p.id===id);
          const ok=await showConfirm('确定删除工程「'+(cur?.name||id)+'」？此操作不可撤销（不影响已导出的文件）。');
          if(!ok) return;
          await deleteProjectById(id); toast('工程已删除'); openProjectLibrary();
        }
      }catch(e){ toast('操作失败：'+e.message,'error'); }
    }));
  });
}
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
    state=migrateProject(p);
    /* 跨设备导入的 JSON 不接管本机工程库绑定，避免覆盖同名工程；需要时可另存到工程库 */
    delete state.meta.projectId;
    const keepAsset=state.background.assetId;
    await ensureBackgroundAsset(state);
    /* 导入即新基线：清空撤销栈，避免 Ctrl+Z 把导入前的工程撤回来；回收不再引用的旧底图 */
    history={past:[],future:[]};
    selectedIds.clear(); draft=null;
    if(keepAsset) assetPrune([keepAsset]).catch(()=>{});
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
  /* 默认 100×70 矩形场地时，扩到能容纳导入几何（坐标允许负值，只扩不挪） */
  if(state.background.kind==='rect'&&state.background.shape?.type==='rect'&&!state.background.calibrated&&Number.isFinite(maxX)){
    state.background.shape.w=Math.max(state.background.shape.w,maxX+10);
    state.background.shape.h=Math.max(state.background.shape.h,maxY+10);
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
  /* 无内嵌图时，把矢量场地设为 PDF 页面尺寸的矩形域，保证坐标框正确 */
  if(!pdf.images.length && state.background.kind==='rect' && state.background.shape?.type==='rect' && !state.background.calibrated){
    state.background.shape.w=Math.max(state.background.shape.w,wM||100);
    state.background.shape.h=Math.max(state.background.shape.h,hM||70);
  }
  selectedIds.clear();
  commitChange('PDF 已导入：'+counts.line+' 线 / '+counts.area+' 区域 / '+counts.text+' 文字'+(bgNote?' / '+bgNote:''));
  fitView();
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
  Object.assign(state.background,{kind,shape,assetId:'',fileName:'',calibrated:false,transform:null});
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

/* -------------------- 表格导入（CSV/TSV/XLSX → 对象更新/新增） -------------------- */
const TABLE_KIND_BY_NAME={'点设备':'point','矩形/区域':'rect','线段/折线':'line','文字':'text','尺寸标注':'dimension'};
/* 区域形状 / 标注子类型：表格中文 ↔ 模型枚举（导出导入共用同一映射） */
const AREA_SHAPE_LABELS={rect:'矩形',circle:'圆形',ellipse:'椭圆',sector:'扇形'};
const AREA_SHAPE_BY_LABEL={'矩形':'rect','圆形':'circle','椭圆':'ellipse','扇形':'sector'};
const DIM_SUB_LABELS={ruler:'测距',distance:'两点距离',area:'面积',angle:'角度'};
const DIM_SUB_BY_LABEL={'测距':'ruler','两点距离':'distance','距离':'distance','面积':'area','角度':'angle'};
/* 节点坐标文本：节点间用分号、XY 间用逗号，如 "0,0;3.5,-2;10,4"（CSV 中整格自动加引号）；
   解析宽容逗号/空格/斜杠/竖线等分隔，支持负坐标 */
function formatNodeCoords(points){
  return (points||[]).map(p=>fmt(p[0])+','+fmt(p[1])).join(';');
}
function parseNodeCoords(text){
  if(text===undefined||text===null) return [];
  const out=[];
  String(text).split(';').forEach(seg=>{
    const nums=seg.trim().split(/[,，\s/|xX×]+/).filter(s=>s!=='').map(Number);
    if(nums.length===2&&nums.every(Number.isFinite)) out.push(nums);
  });
  return out;
}
/** 按表格行数据设置区域形状（基点为矩形左下角/圆·椭圆·扇形圆心）；参数不足返回 false */
function applyRowShape(o,label,v){
  const tt=AREA_SHAPE_BY_LABEL[label];
  if(!tt||!Number.isFinite(v.x)||!Number.isFinite(v.y)) return false;
  if(tt==='rect'){
    if(!(v.w>0)||!(v.h>0)) return false;
    o.shape=null; o.width=v.w; o.height=v.h; o.x=v.x; o.y=v.y; o.angle=normalizeAngle(v.angle);
    return true;
  }
  o.x=v.x; o.y=v.y;
  if(tt==='circle'){
    if(!(v.w>0)) return false;
    o.shape={type:'circle',r:v.w/2}; o.width=0; o.height=0; o.angle=0; return true;
  }
  if(tt==='ellipse'){
    if(!(v.w>0)||!(v.h>0)) return false;
    o.shape={type:'ellipse',rx:v.w/2,ry:v.h/2}; o.width=0; o.height=0; o.angle=normalizeAngle(v.angle); return true;
  }
  if(tt==='sector'){
    if(!(v.w>0)) return false;
    let a0=Number.isFinite(v.params[0])?v.params[0]:(Number.isFinite(v.angle)?v.angle:0);
    let a1=Number.isFinite(v.params[1])?v.params[1]:a0+90;
    let sweep=((a1-a0)%360+360)%360; if(sweep===0) sweep=360;
    o.shape={type:'sector',r:v.w/2,a0,a1:a0+sweep}; o.width=0; o.height=0; o.angle=0; return true;
  }
  return false;
}
function tableNum(v){ const n=Number(String(v??'').trim()); return Number.isFinite(n)&&String(v??'').trim()!==''?n:NaN; }
function tableBool(v){ return /^(是|true|1|y|yes)$/i.test(String(v??'').trim()); }
function parseShapeParams(text){
  return String(text??'').split(/[,，\s]+/).filter(s=>s.trim()!=='').map(Number);
}
/**
 * 预览阶段构造「导入后候选对象」（纯内存、不写状态），几何字段应用规则必须与 applyTableImport 一致；
 * 基点平移对长度/面积无影响（刚体平移不变量），故此处只复刻节点/闭合/子类型/形状的变化。
 */
function previewGeomCandidate(base,c){
  const cnd=deepClone(base);
  if(cnd.kind==='line'||cnd.kind==='dimension'){
    const pts=parseNodeCoords(c('节点坐标'));
    if(pts.length){
      const wantClosed=cnd.kind==='line'&&c('闭合')!==''?tableBool(c('闭合')):cnd.closed;
      const wantSub=cnd.kind==='dimension'&&c('标注类型')?DIM_SUB_BY_LABEL[c('标注类型')]:cnd.subtype;
      const subMin=(cnd.kind==='dimension'&&wantSub!=='ruler'&&wantSub!=='distance')?3:2;
      const closedOk=cnd.kind==='line'?(!wantClosed||pts.length>=3):true;
      if(pts.length>=subMin&&closedOk){
        cnd.points=pts;
        if(cnd.kind==='line') cnd.closed=wantClosed;
        if(cnd.kind==='dimension') cnd.subtype=wantSub;
      }
    }else{
      if(cnd.kind==='line'&&c('闭合')!==''&&cnd.points.length>=3) cnd.closed=tableBool(c('闭合'));
      if(cnd.kind==='dimension'&&c('标注类型')){
        const wantSub=DIM_SUB_BY_LABEL[c('标注类型')];
        const subMin=(wantSub!=='ruler'&&wantSub!=='distance')?3:2;
        if(wantSub&&cnd.points.length>=subMin) cnd.subtype=wantSub;
      }
    }
  }else if(cnd.kind==='rect'){
    const label=c('形状'), params=parseShapeParams(c('形状参数'));
    const x=tableNum(c('X')),y=tableNum(c('Y')),ang=tableNum(c('角度'));
    if(label){
      applyRowShape(cnd,label,{x:Number.isFinite(x)?x:cnd.x,y:Number.isFinite(y)?y:cnd.y,
        w:tableNum(c('宽度')),h:tableNum(c('高度')),angle:Number.isFinite(ang)?ang:cnd.angle,params});
    }else if(areaShapeType(cnd)==='rect'){
      const w=tableNum(c('宽度')),h=tableNum(c('高度'));
      if(w>0)cnd.width=w; if(h>0)cnd.height=h;
      if(Number.isFinite(ang))cnd.angle=normalizeAngle(ang);
    }
  }
  return cnd;
}
/**
 * 表格数值是 fmt() 按精度 p 四舍五入的结果（ulp=10^-p）。坐标/宽高取整会传播到长度/面积，
 * 这里给出严格的传播误差界：差异在界内视为取整噪声，超出即判定人工填写不一致。
 */
function geomRoundingTol(cnd,ulp){
  let lenTol=ulp, areaTol=ulp;
  const pts=cnd.points;
  if(pts&&pts.length){
    const segN=cnd.closed?pts.length:Math.max(0,pts.length-1);
    lenTol=segN*1.5*ulp+0.5*ulp;
    /* 鞋带公式：每点坐标误差 ulp/2，面积误差 ≤ ulp/2·Σ(|x|+|y|)，再加面积列自身取整 ulp/2 */
    let s=0; pts.forEach(p=>s+=Math.abs(p[0])+Math.abs(p[1]));
    areaTol=0.5*ulp*s+ulp;
  }
  if(cnd.kind==='rect'){
    const tt=areaShapeType(cnd), sh=cnd.shape||{};
    if(tt==='rect'){
      areaTol=0.5*ulp*(Math.abs(cnd.width)+Math.abs(cnd.height))+ulp;
      lenTol=3*ulp;
    }else if(tt==='circle'){
      const r=sh.r||0;
      areaTol=Math.PI*(r*ulp+ulp*ulp)+ulp;   /* πr²，|Δr|≤ulp/2 */
      lenTol=4*ulp;                            /* 2πr */
    }else if(tt==='ellipse'){
      const rx=sh.rx||0,ry=sh.ry||0;
      areaTol=1.6*ulp*Math.max(rx,ry)+ulp;    /* πrx·ry，半轴由直径/2 得到 */
      lenTol=4*ulp;
    }else{
      const r=sh.r||0;
      /* 扇形：半径取整 + 起止角（张角）取整两项；周长含弧长 r·sweep·π/180 */
      areaTol=4*ulp*r+Math.PI*r*r*ulp/360+ulp;
      lenTol=0.02*r*ulp+4*ulp;
    }
  }
  return {lenTol,areaTol};
}
/** 核对一行「节点数/长度/面积」与候选几何推算值；列缺失或留空不校验（兼容旧表/外部分表） */
function checkRowGeom(where,c,cnd){
  const warns=[];
  const ulp=Math.pow(10,-(state.settings.precision??2));
  const {lenTol,areaTol}=geomRoundingTol(cnd,ulp);
  const isCurve=cnd.kind==='line'||cnd.kind==='dimension';
  const nCell=c('节点数'),lenCell=c('长度'),areaCell=c('面积');
  if(isCurve&&nCell!==''){
    const n=tableNum(nCell);
    if(!Number.isInteger(n)||n!==cnd.points.length)
      warns.push(where+'：节点数列「'+nCell+'」与节点坐标推算的 '+cnd.points.length+' 个节点不一致，已以坐标为准');
  }
  const expLen=objectLength(cnd), expArea=objectArea(cnd);
  if(lenCell!==''){
    const d=tableNum(lenCell);
    if(!Number.isFinite(d)||d<0) warns.push(where+'：长度列「'+lenCell+'」非法（需为非负数字），已忽略并按几何重算');
    else if(Math.abs(d-expLen)>lenTol)
      warns.push(where+'：长度列 '+fmt(d)+' m 与按几何推算的 '+fmt(expLen)+' m 不一致（差 '+fmt(Math.abs(d-expLen))+' m），已以节点/形状为准');
  }
  if(areaCell!==''){
    const a=tableNum(areaCell);
    if(!Number.isFinite(a)||a<0) warns.push(where+'：面积列「'+areaCell+'」非法（需为非负数字），已忽略并按几何重算');
    else if(Math.abs(a-expArea)>areaTol)
      warns.push(where+'：面积列 '+fmt(a)+' ㎡ 与按几何推算的 '+fmt(expArea)+' ㎡ 不一致（差 '+fmt(Math.abs(a-expArea))+' ㎡），已以节点/形状为准');
  }
  return warns;
}
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
  const check=(where,c,cnd)=>checkRowGeom(where,c,cnd).forEach(w=>warnings.push(w));
  rows.slice(1).forEach((r,i)=>{
    const lineNo=i+2;
    if(!r.some(v=>String(v??'').trim()!=='')) return;
    const code=cell(r,'编号');
    const where='第 '+lineNo+' 行'+(code?'（编号 '+code+'）':'');
    const c=name=>cell(r,name);
    if(code&&byCode.has(code)){
      const obj=byCode.get(code);
      check(where,c,previewGeomCandidate(obj,c));
      updates.push({obj,cell:c});
      return;
    }
    const kind=TABLE_KIND_BY_NAME[cell(r,'对象类型')];
    if(!kind){ warnings.push(where+'：对象类型「'+(cell(r,'对象类型')||'空')+'」无法识别，已跳过'); return; }
    const x=tableNum(c('X')), y=tableNum(c('Y'));
    /* 折线/尺寸标注：从「节点坐标」列重建（基点 X/Y 取首节点）；无坐标列无法新建 */
    if(kind==='line'||kind==='dimension'){
      const pts=parseNodeCoords(c('节点坐标'));
      const subtype=kind==='dimension'?(DIM_SUB_BY_LABEL[c('标注类型')]||'distance'):'';
      const minPts=(kind==='dimension'&&subtype!=='ruler'&&subtype!=='distance')?3:2;
      if(pts.length<minPts){
        warnings.push(where+'：缺少有效「节点坐标」（格式 x,y;x,y;…，'+kindName(kind)+'至少 '+minPts+' 点），无法新建，已跳过');
        return;
      }
      const closed=kind==='line'&&tableBool(c('闭合'));
      if(closed&&pts.length<3){ warnings.push(where+'：闭合折线至少需要 3 个节点，已按开放折线处理'); }
      const cr={kind,x,y,closed:closed&&pts.length>=3,subtype,points:pts,cell:c};
      const cnd=baseObject(kind);
      cnd.points=pts;
      if(kind==='line') cnd.closed=cr.closed; else cnd.subtype=subtype;
      syncFirstPoint(cnd);
      check(where,c,cnd);
      creates.push(cr);
      return;
    }
    if(!Number.isFinite(x)||!Number.isFinite(y)){ warnings.push(where+'：缺少有效 X/Y 坐标，已跳过'); return; }
    if(kind==='rect'){
      /* 形状列决定尺寸校验：矩形/椭圆要宽+高；圆/扇形只要直径（宽度列） */
      const shape=AREA_SHAPE_BY_LABEL[c('形状')]||'rect';
      const w=tableNum(c('宽度')), h=tableNum(c('高度'));
      const needH=shape==='rect'||shape==='ellipse';
      if(!(w>0)||(needH&&!(h>0))){
        warnings.push(where+'：'+AREA_SHAPE_LABELS[shape]+'缺少有效宽度'+(needH?'/高度':'')+'，已跳过');
        return;
      }
      const cnd=baseObject(kind);
      applyRowShape(cnd,AREA_SHAPE_LABELS[shape],{x,y,w,h,angle:tableNum(c('角度')),params:parseShapeParams(c('形状参数'))});
      check(where,c,cnd);
      creates.push({kind,x,y,shape,cell:c});
      return;
    }
    check(where,c,baseObject(kind));   /* 点设备/文字：长度面积应为空或 0 */
    creates.push({kind,x,y,cell:c});
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
    '<p class="hint-text">可更新：名称、业务类型、图层、基点坐标、角度、宽高、形状、闭合、节点坐标、标注类型、显隐、锁定、备注；新对象支持点设备 / 矩形·圆·椭圆·扇形区域 / 折线（含闭合）/ 测距等标注（需「节点坐标」列）。<b>长度/面积/节点数为系统按几何自动计算值，导入时会逐行核对，手改不一致只告警不拦截、以几何为准。</b>建议导入前先导出 JSON 备份。</p>'+warnHtml,
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
    if(o.kind==='line'||o.kind==='dimension'){
      /* 折线/标注：「节点坐标」整体替换并同步基点；只改 X/Y 时按基点平移全部节点，杜绝锚点与节点脱节 */
      const pts=parseNodeCoords(c('节点坐标'));
      if(pts.length){
        const wantClosed=o.kind==='line'&&c('闭合')!==''?tableBool(c('闭合')):o.closed;
        const wantSub=o.kind==='dimension'&&c('标注类型')?DIM_SUB_BY_LABEL[c('标注类型')]:o.subtype;
        const subMin=(o.kind==='dimension'&&wantSub!=='ruler'&&wantSub!=='distance')?3:2;
        const closedOk=o.kind==='line'?(!wantClosed||pts.length>=3):true;
        if(pts.length>=subMin&&closedOk){
          o.points=pts;
          if(o.kind==='line') o.closed=wantClosed;
          if(o.kind==='dimension') o.subtype=wantSub;
          syncFirstPoint(o);
        }
      }else{
        const nx=Number.isFinite(x)?x:o.x, ny=Number.isFinite(y)?y:o.y;
        const dx=nx-o.x, dy=ny-o.y;
        if(dx||dy){ o.points=o.points.map(p=>[p[0]+dx,p[1]+dy]); o.x=nx; o.y=ny; }
        if(o.kind==='line'&&c('闭合')!==''&&o.points.length>=3) o.closed=tableBool(c('闭合'));
        /* 仅切换标注类型（不带节点列）：现有节点数满足新类型下限才生效 */
        if(o.kind==='dimension'&&c('标注类型')){
          const wantSub=DIM_SUB_BY_LABEL[c('标注类型')];
          const subMin=(wantSub!=='ruler'&&wantSub!=='distance')?3:2;
          if(wantSub&&o.points.length>=subMin) o.subtype=wantSub;
        }
      }
    }else if(o.kind==='rect'){
      /* 形状列存在时按形状重建（基点/圆心系同一套 X/Y）；否则沿用旧的宽高更新 */
      const shapeLabel=c('形状');
      const params=parseShapeParams(c('形状参数'));
      if(shapeLabel){
        applyRowShape(o,shapeLabel,{x:Number.isFinite(x)?x:o.x,y:Number.isFinite(y)?y:o.y,
          w:tableNum(c('宽度')),h:tableNum(c('高度')),angle:Number.isFinite(ang)?ang:o.angle,params});
      }else{
        if(Number.isFinite(x)) o.x=x;
        if(Number.isFinite(y)) o.y=y;
        if(Number.isFinite(ang)) o.angle=normalizeAngle(ang);
        if(areaShapeType(o)==='rect'){ const w=tableNum(c('宽度')),h=tableNum(c('高度')); if(w>0)o.width=w; if(h>0)o.height=h; }
      }
    }else{
      if(Number.isFinite(x)) o.x=x;
      if(Number.isFinite(y)) o.y=y;
      if(Number.isFinite(ang)) o.angle=normalizeAngle(ang);
    }
    const vis=c('显示'); if(vis!=='') o.visible=tableBool(vis);
    const lk=c('锁定'); if(lk!=='') o.locked=tableBool(lk);
    const note=c('备注'); if(note!==''){ o.props=o.props||{}; o.props.note=note; }
    o.updatedAt=nowISO(); updated++;
  });
  plan.creates.forEach(cr=>{
    const c=cr.cell;
    const type=state.objectTypes.find(x=>x.kind===cr.kind&&x.name===c('业务类型'));
    const o=baseObject(cr.kind,type?type.id:defaultTypeId(cr.kind));
    const ang=tableNum(c('角度'));
    if(cr.kind==='line'||cr.kind==='dimension'){
      o.points=cr.points;
      if(cr.kind==='line') o.closed=!!cr.closed;
      if(cr.kind==='dimension') o.subtype=cr.subtype||'distance';
      syncFirstPoint(o);
    }else if(cr.kind==='rect'){
      const params=parseShapeParams(c('形状参数'));
      applyRowShape(o,AREA_SHAPE_LABELS[cr.shape]||'矩形',
        {x:cr.x,y:cr.y,w:tableNum(c('宽度')),h:tableNum(c('高度')),angle:Number.isFinite(ang)?ang:0,params});
    }else{
      o.x=cr.x; o.y=cr.y;
      if(Number.isFinite(ang)) o.angle=normalizeAngle(ang);
      if(cr.kind==='text'){ o.text=c('名称')||'文字'; o.height=2.2; }
    }
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
  if(kind==='pdf') exportPDF();
  if(kind==='dxf') exportDXF();
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
  // 工程文件保持可移植：底图字节虽存于 IndexedDB，导出 JSON 时内嵌 dataURL 一并带走。
  // 只要运行时有已装载的图片数据就内嵌——IDB 不可用的降级路径 assetId 为空，同样必须带走（评估报告 5.4）
  const copy=persistableState();
  copy.meta.updatedAt=state.meta.updatedAt;
  if(bgDataUrl) copy.background.dataUrl=bgDataUrl;
  downloadBlob(new Blob([JSON.stringify(copy,null,2)],{type:'application/json'}),safeName()+'.json');
  toast('JSON 工程已导出（含底图）','success');
}
const TABLE_COLUMNS=['编号','名称','对象类型','业务类型','图层','X','Y','角度','宽度','高度','形状','形状参数','闭合','标注类型','节点坐标','节点数','长度','面积','显示','锁定','备注','更新时间'];
function objectRows(){
  return state.objects.map(o=>{
    const t=getType(o.typeId),l=layerOf(o);
    /* 非矩形区域：宽/高列填外接盒尺寸（圆/扇形=2r，椭圆=2rx×2ry），形状列保留精确类型，面积仍取精确值 */
    let w='',h='',ang=o.angle||0,shape='',shapeParam='';
    if(o.kind==='rect'){
      const tt=areaShapeType(o), sh=o.shape||{};
      shape=AREA_SHAPE_LABELS[tt]||'';
      if(tt==='rect'){ w=o.width; h=o.height; }
      else if(tt==='circle'){ w=h=2*sh.r; }
      else if(tt==='ellipse'){ w=2*sh.rx; h=2*sh.ry; }
      else { w=h=2*sh.r; shapeParam=Math.round(Number(sh.a0)||0)+','+Math.round(Number(sh.a1)||0); }
    }
    return {
      编号:o.name,名称:o.text||'',对象类型:kindName(o.kind),业务类型:t.name,图层:l.name,
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
  const svgPointIcon=(icon,color)=>{
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
      if(state.settings.showLabels&&o.name){ const ce=shapeLabelCenter(o); markers.push(`<text x="${X(ce[0])}" y="${Y(ce[1])}" text-anchor="middle" font-size="14" fill="${color}" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(o.name)}</text>`); }
      if(state.settings.showAreaTag){
        const sa=annotOn(o,'area'), sp=annotOn(o,'perimeter');
        if(sa||sp){ const ce=shapeLabelCenter(o); markers.push(areaTagSvg(X(ce[0]),Y(ce[1]),shapeArea(o),shapePerimeter(o),sa,sp)); }
      }
      markers.push(annotItemsSvg(o));
    }else if(o.kind==='line'&&o.points.length){
      /* 闭合折线点串末尾补回首点，闭合边描边才不缺失（与画布 closePath 一致） */
      const pts=o.points.map(p=>`${X(p[0])},${Y(p[1])}`);
      if(o.closed) pts.push(pts[0]);
      shapes.push(`<polyline points="${pts.join(' ')}" fill="${o.closed?color:'none'}" fill-opacity=".08" stroke="${color}" stroke-width="${styleVal(o,'strokeWidth',.1)*ppu}" stroke-linejoin="round"/>`);
      if(o.closed&&state.settings.showAreaTag&&o.points.length>=3){
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
        markers.push(`<g transform="translate(${x} ${y}) rotate(${-o.angle}) scale(${k})">${svgPointIcon(icon,color)}</g>`);
      }
      if(state.settings.showLabels&&o.name){
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
    g.fillText(state.meta.name+' — 对象清单',margin,margin+8);
    g.font='14px Microsoft YaHei,Arial'; g.fillStyle='#555';
    g.fillText('共 '+rows.length+' 个对象 · 第 '+(pi+1)+' / '+total+' 页 · '+new Date().toLocaleString(),margin,margin+34);
    let y=margin+70;
    g.fillStyle='#f1f5f9'; g.fillRect(margin,y,W-margin*2,headH);
    g.strokeStyle='#cbd5e1'; g.lineWidth=1; g.strokeRect(margin,y,W-margin*2,headH);
    g.fillStyle='#111827'; g.font='bold 14px Microsoft YaHei,Arial';
    let x=margin+8;
    PDF_COLS.forEach(([name,w])=>{ g.fillText(name,x,y+26); x+=w; });
    y+=headH;
    const list=chunks[pi]||[];
    g.font='13px Consolas,Microsoft YaHei,Arial';
    list.forEach((r,ri)=>{
      if(ri%2){ g.fillStyle='#f8fafc'; g.fillRect(margin,y,W-margin*2,rowH); }
      g.strokeStyle='#e2e8f0'; g.beginPath(); g.moveTo(margin,y+rowH); g.lineTo(W-margin,y+rowH); g.stroke();
      g.fillStyle='#1f2937';
      x=margin+8;
      const param=r['形状']!==''&&r['形状']!=='矩形'?r['形状']+(r['形状参数']?' '+r['形状参数']:''):(r['形状']==='矩形'?'矩形':(r['闭合']==='是'?'闭合':'')+(r['标注类型']?' '+r['标注类型']:''));
      const vals=[r['编号'],r['名称'],r['对象类型'],r['业务类型'],r['图层'],r['X'],r['Y'],param,r['长度'],r['面积']];
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
