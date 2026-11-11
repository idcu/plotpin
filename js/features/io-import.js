/* io-import.js —— 文件导入路由、DXF/PDF/图片底图、底图/场地选择 */
/** CSV/TSV 行数预判：引号内换行不计；超限时在 parseRows 之前返回 true（边界仍由行数校验兜底） */
function dsvRowsExceed(text,limit){
  let n=0,q=false;
  for(let i=0;i<text.length;i++){
    const c=text.charCodeAt(i);
    if(c===34) q=!q;
    else if(c===10&&!q&&++n>limit) return true;
  }
  return false;
}
function extOfFile(name){ const m=String(name||'').toLowerCase().match(/\.([a-z0-9]+)$/); return m?m[1]:''; }
/**
 * 导入 JSON 工程（事务化）：先构建候选、校验限值、转存资产，全部成功后才替换 state；
 * 提交阶段失败回滚到导入前现场（审计 P1-9 / P1-14）。
 */
async function importJsonFile(f){
  /* 替换现场前强制落盘：租约被占用或保存失败时中止导入并提示（P2-A3） */
  try{ await flushPendingSave(); }
  catch(e){ toast(L('工程导入失败：{msg}',{msg:e.message}),'error'); return; }
  const prevState=state, prevHistory=history, prevSelected=new Set(selectedIds), prevDraft=draft;
  let swapped=false;
  try{
    const fileErrs=importLimitErrors({bytes:f.size});
    if(fileErrs.length) throw new Error('超限：'+importLimitMessage(fileErrs));
    const text=await f.text();
    const textErrs=importLimitErrors({chars:text.length});
    if(textErrs.length) throw new Error('超限：'+importLimitMessage(textErrs));
    const p=JSON.parse(text);
    if(p.schema===CATALOG_SCHEMA){
      try{ await importCatalog(p); renderProps(); toast(L('目录已导入：{n} 个型号',{n:currentCatalog.items.length}),'success'); }
      catch(e){ toast(L('目录导入失败：{msg}',{msg:e.message}),'error'); }
      return;
    }
    if(!isReadableSchema(p.schema)) throw new Error('SCHEMA');
    const next=buildProject(p);
    /* 跨设备导入的 JSON 不接管本机工程库绑定，避免覆盖同名工程；需要时可另存到工程库 */
    delete next.meta.projectId;
    const objErrs=importLimitErrors({objects:countProjectObjects(next)});
    if(objErrs.length) throw new Error('超限：'+importLimitMessage(objErrs));
    await ensureBackgroundAsset(next);      /* 候选状态上准备资产；失败不影响当前现场 */
    state=next; swapped=true;
    /* 导入即新基线：清空撤销栈，避免 Ctrl+Z 把导入前的工程撤回来；
       资产回收必须走全库可达集（其他工程库记录仍可达），不能只保留当前底图 */
    history={past:[],future:[]};
    selectedIds.clear(); draft=null;
    await afterStateLoaded();           /* 先等全楼层照片 dataUrl→资产转换完成，导入才算提交 */
    await pruneBgAssets();              /* N-11：提交成功后才回收；失败回滚不误删旧工程资产 */
    scheduleSave(); toast('工程已导入','success');
  }catch(err){
    if(swapped){
      state=prevState; history=prevHistory;              /* 提交阶段失败：完整回滚 */
      selectedIds.clear(); prevSelected.forEach(x=>selectedIds.add(x)); draft=prevDraft;
      afterStateLoaded(false); requestRender();
    }
    const msg=String(err&&err.message||'');
    if(msg==='SCHEMA') toast('JSON 工程格式不正确（应为图钉 PlotPin 导出的 v1 工程文件）','error');
    else if(msg.startsWith('超限：')) toast(L('工程导入失败：{msg}',{msg:msg.slice(3)}),'error');
    else toast(L('工程导入失败（已回滚）：{msg}',{msg}),'error');
  }
}
async function handleImportFile(f){
  const ext=extOfFile(f.name);
  const fileErrs=importLimitErrors({bytes:f.size});
  if(fileErrs.length) return toast(L('导入失败：{msg}',{msg:importLimitMessage(fileErrs)}),'error');
  if(ext==='json') return importJsonFile(f);
  if(ext==='csv'||ext==='tsv'||ext==='txt'){
    try{
      const text=await f.text();
      const textErrs=importLimitErrors({chars:text.length});
      if(textErrs.length) return toast(L('表格导入失败：{msg}',{msg:importLimitMessage(textErrs)}),'error');
      if(dsvRowsExceed(text,APP_LIMITS.IMPORT_ROWS_MAX)) return toast(L('表格导入失败：{msg}',{msg:importLimitMessage(['rows'])}),'error');
      const rows=DSV.parseRows(text,ext==='tsv'?'\t':DSV.detectDelimiter(text));
      const rowErrs=importLimitErrors({rows:rows.length});
      if(rowErrs.length) return toast(L('表格导入失败：{msg}',{msg:importLimitMessage(rowErrs)}),'error');
      showTableImportPreview(f.name,rowsToObjectsPlan(rows));
    }catch(e){ toast(L('表格读取失败：{msg}',{msg:e.message}),'error'); }
    return;
  }
  if(ext==='xlsx'){
    try{
      const rows=await ensureVendor('Xlsx').readRows(await f.arrayBuffer());
      if(rows.skippedSheets) toast(L('已跳过 {n} 个超过 5 万行的附表，仅导入可用工作表',{n:rows.skippedSheets}),'warn');
      if(!rows.length) return toast('XLSX 中没有可导入的工作表','warn');
      const rowErrs=importLimitErrors({rows:rows.length});
      if(rowErrs.length) return toast(L('表格导入失败：{msg}',{msg:importLimitMessage(rowErrs)}),'error');
      showTableImportPreview(f.name,rowsToObjectsPlan(rows));
    }catch(e){ toast(L('XLSX 解析失败：{msg}',{msg:e.message}),'error'); }
    return;
  }
  if(ext==='dwg') return importDwgFile(f);
  if(ext==='dxf') return importDxfFile(f);
  if(ext==='pdf') return importPdfFile(f);
  if(/^image\//.test(f.type||'')||['png','jpg','jpeg','gif','webp','bmp','svg'].includes(ext)) return importBackgroundFile(f);
  /* 第三方插件注册的导入器 */
  if(typeof PlotPin!=='undefined'){
    const imp=PlotPin.findImporter(ext);
    if(imp) return importViaPlugin(imp,f);
  }
  toast(L('不支持的文件类型：.{ext}（支持 JSON 工程 / DXF / PDF / CSV·TSV·XLSX 表格 / 图片底图）',{ext:(ext||'未知')}),'error');
}

/* -------------------- DWG 兼容入口（不内置 DWG 内核，只做识别与转换指引） -------------------- */
function dwgVersionInfo(head){
  const m=String(head||'').match(/AC10\d{2}/);
  const code=m?m[0]:'';
  const names={AC1009:'R12',AC1012:'R13',AC1014:'R14',AC1015:'2000',AC1018:'2004',AC1021:'2007',AC1024:'2010',AC1027:'2013',AC1032:'2018'};
  return {code,name:names[code]||'',label:code?(code+(names[code]?'（'+names[code]+'）':'（未知版本）')):'无法识别（文件头不是 AC10xx）'};
}
async function importDwgFile(f){
  let head='';
  try{
    const buf=new Uint8Array(await f.arrayBuffer()).slice(0,32);
    for(const b of buf) head+=String.fromCharCode(b);
  }catch(e){ /* 读取失败按无法识别处理，仍给出转换指引 */ }
  const info=dwgVersionInfo(head);
  openModal(L('DWG 文件兼容入口：{name}',{name:f.name}),
    '<p style="line-height:1.7;margin:0 0 8px">'+esc(L('检测到 DWG 文件版本：'))+'<b>'+esc(info.label)+'</b></p>'+
    '<p class="hint-text">'+esc(L(TXT_DWG_HINT))+'</p>'+
    '<ul class="hint-text" style="margin:8px 0 0;padding-left:20px;line-height:1.7">'+
      '<li><b>'+esc(L('转 DXF'))+'</b>：'+esc(L('AutoCAD「文件 → 另存为 → DXF（ASCII）」，建议 2013/2018 版本；'))+'</li>'+
      '<li><b>'+esc(L('转 PDF'))+'</b>：'+esc(L('AutoCAD「打印/导出 → PDF」，可作矢量图纸或底图导入；'))+'</li>'+
      '<li>'+esc(L('动态块 / 外部参照 / 代理对象 / 标注样式在转换时可能丢失，导入后请核对保真度提示。'))+'</li>'+
    '</ul>'+
    '<p class="hint-text">'+esc(L('转换在你的本机完成，PlotPin 只读取 DXF/PDF，单文件承诺不变。'))+'</p>',
    [{text:L('转 DXF 后选择文件'),class:'primary',click:()=>{closeModal();pickConvertedFile('.dxf');}},
     {text:L('转 PDF 后选择文件'),click:()=>{closeModal();pickConvertedFile('.pdf');}},
     {text:L('取消'),click:closeModal}]);
}
/** 从 DWG 指引里选转换产物：临时创建 file input，选完即移除，不污染主入口的 accept */
function pickConvertedFile(accept){
  const inp=document.createElement('input');
  inp.type='file'; inp.accept=accept; inp.style.display='none';
  inp.addEventListener('change',()=>{
    const f=inp.files&&inp.files[0];
    inp.remove();
    if(f) handleImportFile(f);
  });
  document.body.appendChild(inp);
  inp.click();
}

/* -------------------- DXF 导入（预检 → 单位确认/落点 → 事务化提交） -------------------- */
function dxfUnitText(meta,dft){
  if(!meta||meta.insUnits==null) return '未声明（按米处理）';
  return dft.unitLabel(meta.insUnits)+'（$INSUNITS='+meta.insUnits+'）';
}
/** 保真度报告的唯一渲染源；返回纯文本行，模态与自测共用 */
function dxfFidelityLines(meta,parsed){
  if(!meta) return [];
  const lines=[];
  lines.push('版本：'+(meta.version||'未声明')+(meta.versionName?'（'+meta.versionName+'）':'')+(meta.knownVersion?'':' · 未知版本，按通用规则解析'));
  lines.push('单位：'+dxfUnitText(meta,ensureVendor('Dxf')));
  lines.push('可导入实体：'+(parsed?parsed.entities.length:meta.supportedCount)+' 个'+(parsed&&parsed.supplemental?'（含补充解析 '+parsed.supplemental+' 个）':''));
  lines.push('块定义：'+(meta.blocks||0)+' 个');
  if(Object.keys(meta.supplementalTypes||{}).length) lines.push('补充解析：'+Object.keys(meta.supplementalTypes).join(' / '));
  const uns=Object.keys(meta.unsupportedTypes||{});
  if(uns.length) lines.push('未落地（已跳过）：'+uns.join(' / ')+'（'+Object.values(meta.unsupportedTypes).reduce((a,b)=>a+b,0)+' 条）');
  /* ARC/ELLIPSE/SPLINE/INSERT 由解析器统一展开为多段线（含块插入变换），报告里如实给出条数 */
  const approx=['ARC','ELLIPSE','SPLINE','INSERT'].filter(t=>meta.entityCounts&&meta.entityCounts[t]);
  if(approx.length) lines.push('折线近似落地：'+approx.map(t=>t+' '+meta.entityCounts[t]).join(' / ')+'（弧/椭圆/样条按折线，块参照按插入变换展开）');
  if(meta.r12Bulge) lines.push('R12 凸度：'+meta.r12Bulge+' 段 VERTEX 42 会被拉直');
  return lines;
}
function dxfRefLayerName(fileName,version){
  const stem=String(fileName||'未命名').replace(/\.[a-z0-9]+$/i,'').slice(0,40);
  return 'DXF参考 · '+stem+(version?' · '+version:'');
}
async function importDxfFile(f){
  let text;
  try{ text=await f.text(); }
  catch(e){ return toast(L('DXF 读取失败：{msg}',{msg:e.message}),'error'); }
  const Dxf=ensureVendor('Dxf');
  const meta=Dxf.inspect?Dxf.inspect(text):null;
  if(meta&&meta.binary){
    return toast(L(TXT_BINARY_DXF_HINT),'error');
  }
  let parsed;
  try{ parsed=Dxf.parseDxf(text,{strictUnits:true}); }
  catch(e){ return toast(L('DXF 解析失败：{msg}',{msg:e.message}),'error'); }
  const ents=parsed.entities;
  const uns=meta?Object.keys(meta.unsupportedTypes):[];
  if(!ents.length){
    if(uns.length){
      const n=Object.values(meta.unsupportedTypes).reduce((a,b)=>a+b,0);
      return toast('DXF 中暂未找到可导入实体；文件含未落地类型：'+uns.join(' / ')+'（'+n+' 条），已无法保真转换','error');
    }
    return toast('DXF 中未找到支持的实体（线/多段线/圆/弧/椭圆/样条/块参照/点/文字）','error');
  }
  const entErrs=importLimitErrors({entities:ents.length});
  if(entErrs.length) return toast(L('DXF 导入失败：{msg}',{msg:importLimitMessage(entErrs)}),'error');
  /* 预检：单位确认 + 落点选择，确认后才提交 */
  const detected=meta&&meta.insUnits!=null?meta.insUnits:null;
  const unitOpts=[];
  if(detected!=null) unitOpts.push(['auto',L('按文件单位：{unit}（$INSUNITS={code}）',{unit:Dxf.unitLabel(detected),code:detected})]);
  else unitOpts.push(['auto',L('按文件（未声明，按米处理）')]);
  [4,5,6,1,2].forEach(c=>{ if(c!==detected) unitOpts.push([String(c),L('按{unit}',{unit:Dxf.unitLabel(c)})]); });
  const lines=dxfFidelityLines(meta,parsed);
  openModal(L('DXF 导入预检：{name}',{name:f.name}),
    '<p style="line-height:1.7;margin:0 0 8px">'+esc(L('先核对版本、单位与保真度，再决定落点；导入失败会整批回滚。'))+'</p>'+
    '<div style="margin:8px 0;padding:8px 10px;border:1px solid var(--line);border-radius:8px;line-height:1.7">'+
      lines.map(l=>'<div class="hint-text">'+esc(l)+'</div>').join('')+'</div>'+
    '<label style="display:block;margin:8px 0">'+esc(L('单位确认'))+
      ' <select id="dxfUnitSelect">'+unitOpts.map(([v,t])=>'<option value="'+v+'">'+esc(t)+'</option>').join('')+'</select></label>'+
    '<label style="display:block;margin:8px 0">'+esc(L('落点'))+
      ' <select id="dxfLanding"><option value="editable">'+esc(L('可编辑对象（按原图层）'))+'</option><option value="reference">'+esc(L('只读参考层（新建层并锁定）'))+'</option></select></label>'+
    '<p class="hint-text">'+esc(L(TXT_REF_LAYER_HINT))+'</p>',
    [{text:L('取消'),click:closeModal},
     {text:L('导入'),class:'primary',click:()=>{
       const unit=$('dxfUnitSelect').value, landing=$('dxfLanding').value;
       closeModal();
       applyDxfImport(f.name,text,meta,{unit,reference:landing==='reference'});
     }}]);
}
function applyDxfImport(fileName,text,meta,opts){
  const Dxf=ensureVendor('Dxf');
  let parsed;
  try{ parsed=Dxf.parseDxf(text,{strictUnits:true,forceUnit:opts.unit==='auto'?null:Number(opts.unit)}); }
  catch(e){ return toast(L('DXF 解析失败：{msg}',{msg:e.message}),'error'); }
  const ents=parsed.entities;
  if(!ents.length) return toast('DXF 中没有可导入实体','error');
  const entErrs=importLimitErrors({entities:ents.length});
  if(entErrs.length) return toast(L('DXF 导入失败：{msg}',{msg:importLimitMessage(entErrs)}),'error');
  const backup=snapshotHistoryState(state), prevFuture=history.future;
  pushHistory();
  try{
    let refLayer=null;
    if(opts.reference){
      const name=dxfRefLayerName(fileName,meta&&meta.version);
      refLayer=state.layers.find(l=>l.name===name);
      if(!refLayer){ refLayer={id:safeId('layer_'+name,'LAYER'),name,visible:true,locked:true}; state.layers.push(refLayer); }
      else refLayer.locked=true;
    }else{
      ents.map(e=>e.layer).forEach(n=>{
        if(n&&!state.layers.some(l=>l.name===n)) state.layers.push({id:safeId('layer_'+n,'LAYER'),name:n,visible:true,locked:false});
      });
    }
    const layerIdFor=n=>{
      if(refLayer) return refLayer.id;
      const l=state.layers.find(x=>x.name===n); return l?l.id:'layer.default';
    };
    const counts={line:0,rect:0,point:0,text:0};
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    const bounds=p=>p.forEach(([x,y])=>{minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);});
    /* 批量实体一次建立编号作用域：避免逐个 baseObject → nextObjectId 扫描全量 state（O(E²)） */
    withObjectNameScope(allObjectNames(), () => {
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
          const o=baseObject('rect','rect.area',{x,y,shape:{type:CIR,r},width:0,height:0,layerId:layerIdFor(e.layer)});
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
    });
    if(state.site&&state.site.kind==='rect'&&state.site.shape?.type==='rect'&&Number.isFinite(maxX)){
      state.site.shape.w=Math.max(state.site.shape.w,maxX+10);
      state.site.shape.h=Math.max(state.site.shape.h,maxY+10);
    }
    selectedIds.clear();
    const unitCode=opts.unit==='auto'?(meta&&meta.insUnits!=null?meta.insUnits:0):Number(opts.unit);
    const lines=dxfFidelityLines(meta,parsed).filter(l=>!l.startsWith('单位：'));
    const extra=' · '+L('单位')+' '+Dxf.unitLabel(unitCode)+(opts.reference?' · '+L('落点 只读参考层（已锁定）'):'')+
      (lines.length?' · '+lines.join(' · '):'');
    commitChange(L('DXF 已导入：{line} 线 / {rect} 圆 / {point} 点 / {text} 文字{extra}',
      {line:counts.line,rect:counts.rect,point:counts.point,text:counts.text,extra}));
    if(meta&&meta.r12Bulge) toast('提示：该 DXF 含 '+meta.r12Bulge+' 段 R12 多段线凸度（VERTEX 42），当前按折线导入，弧段会被拉直','warn');
    fitView();
  }catch(e){
    state=materializeHistoryState(backup);
    if(history.past.length) history.past.pop();
    history.future=prevFuture;
    selectedIds.clear();
    requestRender(); updateHistoryButtons();
    toast('DXF 导入失败（已回滚）：'+(e&&e.message||e),'error');
  }
}

/* -------------------- PDF 底图导入（矢量优先，扫描件取最大内嵌图） -------------------- */
async function importPdfFile(f){
  let pdf;
  try{ pdf=await ensureVendor('PdfRead').parsePdf(await f.arrayBuffer()); }
  catch(e){ return toast(L('PDF 解析失败：{msg}',{msg:e.message}),'error'); }
  const k=pdf.unitMeter;
  /* PDF 单位点→米：内容坐标已按 MediaBox 左下角归零（Y 向上），直接映射 */
  /* 只导入第 1 页：多页 PDF 不做静默合并，也不提供合并开关（RT/IO-P2-20 产品决策） */
  const pageList=Array.isArray(pdf.pages)&&pdf.pages.length?pdf.pages:null;
  const page1=pageList?pageList[0]:null;
  const pagePaths=page1?page1.paths:pdf.paths;
  const pageTexts=page1?page1.texts:pdf.texts;
  const page1Nums=page1&&Array.isArray(page1.imageNums)?new Set(page1.imageNums):null;
  /* 底图只认第 1 页实际绘制的内嵌图；仅 1 张图时允许兜底，避免资源映射缺失导致整页丢图 */
  let img=null;
  if(pdf.images.length){
    img=page1Nums?pdf.images.find(x=>page1Nums.has(x.num))||null:pdf.images[0];
    if(!img&&pdf.images.length===1) img=pdf.images[0];
  }
  if(!pagePaths.length && !pageTexts.length && !img){
    return toast('PDF 第 1 页未提取到可用图形（仅导入第 1 页，不做多页合并；也可能是扫描图片无内嵌图或使用了不支持的压缩）','error');
  }
  const pdfErrs=importLimitErrors({entities:pagePaths.length+pageTexts.length});
  if(pdfErrs.length) return toast(L('PDF 导入失败：{msg}',{msg:importLimitMessage(pdfErrs)}),'error');
  /* 扫描件/带底图的 PDF：第 1 页内嵌图作为图片底图 */
  let bgNote='';
  let bgStored=true;
  if(img){
    const mime=img.mime;
    const bin=img.bytes;
    let dataUrl='data:'+mime+';base64,';
    let s=''; const CH=0x4000;
    for(let i=0;i<bin.length;i+=CH) s+=String.fromCharCode.apply(null,bin.subarray(i,i+CH));
    dataUrl+=btoa(s);
    const mpp=pdf.pageWidth*k/img.width;   /* PDF 页宽(米)/图像像素宽 */
    /* 与普通图片导入同一路径：内容寻址资产入库（N-03）。只写 dataUrl 会被
       persistableState 剥离，自动保存后重开即永久丢图。 */
    const id=assetIdFor(bin);
    try{ await assetPut(id,{bytes:bin,mime}); }
    catch(e){ bgStored=false; }   /* IndexedDB 不可用时降级：保留 dataUrl，避免静默丢图 */
    pushHistory();
    state.background.kind='image';
    state.background.fileName=f.name.replace(/\.pdf$/i,'')+'（PDF内嵌图）';
    state.background.assetId=bgStored?id:'';
    state.background.dataUrl=bgStored?'':dataUrl;   /* 无资产时保留最后一份数据 */
    state.background.width=img.width; state.background.height=img.height;
    state.background.metersPerPixel=mpp; state.background.calibrated=true;
    state.background.transform=null;   /* 新图像素坐标改变，清除旧仿射校准 */
    bgDataUrl=dataUrl;
    try{ bgImage=await loadImageSrc(dataUrl); }catch(e){ bgImage=null; }
    bgImageState=bgImage?'ready':'missing';
    bgNote=L('底图 {w}×{h}',{w:img.width,h:img.height});
    /* 矢量叠加仍以 PDF 页世界尺寸为场地，图片米/像素一致 */
  }
  /* 矢量内容：路径转折线/区域，文本转文字对象。点→米。只取第 1 页。 */
  const counts={line:0,area:0,text:0};
  const wM=(page1?page1.width:pdf.pageWidth)*k, hM=(page1?page1.height:pdf.pageHeight)*k;
  if((pagePaths.length||pageTexts.length)&&!img) pushHistory();
  /* 矢量内容批量建对象：同样使用编号作用域，避免逐个扫描全量 state */
  withObjectNameScope(allObjectNames(), () => {
    for(const p of pagePaths){
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
    for(const t of pageTexts){
      const h=(t.size||1)*k;
      if(!(h>0)||!t.text) continue;
      const o=baseObject('text',null,{x:t.x*k,y:t.y*k,text:t.text,height:h,style:{color:'#111827'}});
      o.typeId='text.builtin'; if(!state.objectTypes.some(x=>x.id==='text.builtin')) state.objectTypes.push({id:'text.builtin',kind:'text',name:'文字',color:'#111827',icon:'text',builtin:true});
      state.objects.push(o); counts.text++;
    }
  });
  /* 无内嵌图时，把矢量场地设为第 1 页的矩形域，保证坐标框正确 */
  if(!img && state.site && state.site.kind==='rect' && state.site.shape?.type==='rect'){
    state.site.shape.w=Math.max(state.site.shape.w,wM||100);
    state.site.shape.h=Math.max(state.site.shape.h,hM||70);
  }
  selectedIds.clear();
  const totalPages=pageList?pageList.length:(Number(pdf.pageCount)||1);
  const pageNote=totalPages>1?' / '+L('共 {n} 页，已导入第 1 页',{n:totalPages}):'';
  commitChange(L('PDF 已导入：{line} 线 / {area} 区域 / {text} 文字{notes}',
    {line:counts.line,area:counts.area,text:counts.text,notes:pageNote+(bgNote?' / '+bgNote:'')}));
  if(!bgStored) toast('浏览器本地存储不可用，PDF 底图仅本次会话有效，请改用 JSON 工程保存','warn');
  fitView();
}

/* -------------------- 底图/场地：选择弹窗与矢量场地应用 -------------------- */
function openSitePicker(){
  openModal(L('底图 / 场地'),
    `<div class="site-current"><b>${esc(L('当前：'))}</b>${esc(L('图片底图：{file}；{site}',{file:(isImageBackground(state.background)?(state.background.fileName||L('已导入')):L('未设置')),site:siteDescription(state.site)}))}</div>
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
      applyVectorSite(PARA,{type:PARA,x:0,y:0,w:m[0],h:m[1],skew});
      return;
    }
    if(act==='polygon'){ closeModal(); setTool('site-polygon'); return; }
    if(act==='ellipse-num'){
      const v=await showPrompt({title:L('椭圆场地'),label:L('长轴半径, 短轴半径（米，用逗号分隔），例如 40,25'),value:'40,25'});
      if(v===null) return;
      const shape=ellipseShapeFromInput(v);
      if(!shape) return toast(L('请输入两个正数半径，如 40,25'),'error');
      closeModal();
      applyVectorSite(ELL,shape);
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
      closeModal(); applyVectorSite(CIR,circleShapeFrom([0,0],r));
    }
  });
}
/** 椭圆数值输入解析（纯函数）：输入只提供长/短轴半径，中心固定在**世界原点**。
 * 旧实现把 `m[0]/m[1]` 同时当半径与圆心，导致椭圆整体偏移 (rx,ry)（审计 P1-5）。 */
function ellipseShapeFromInput(text){
  const m=String(text||'').split(/[,，x×*\s]+/).map(Number);
  if(m.length<2||!(m[0]>0)||!(m[1]>0)) return null;
  return {type:ELL,cx:0,cy:0,rx:m[0],ry:m[1],angle:0};
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
  fitView(); commitChange(L('已设置为{name}',{name:L(siteKindName(kind))})); setTool('select');
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
  /* 与主导入共用同一字节上限：底图按钮 `bgInput` 与拖拽图片两条入口都经过这里，
     必须在 arrayBuffer() 之前拦截，否则大文件先整份读入内存再报错（P2-04） */
  const byteErrs=importLimitErrors({bytes:f&&f.size});
  if(byteErrs.length) throw new Error('超限：'+importLimitMessage(byteErrs));
  const raw=new Uint8Array(await f.arrayBuffer());
  const mime=f.type||'image/png';
  const url=URL.createObjectURL(new Blob([raw],{type:mime}));
  let img;
  try{ img=await loadImageSrc(url); }finally{ URL.revokeObjectURL(url); }
  const errs=importLimitErrors({pixels:img.naturalWidth*img.naturalHeight});
  if(errs.length) throw new Error(importLimitMessage(errs)+'（'+img.naturalWidth+'×'+img.naturalHeight+'）');
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
/** 替换底图时写入新图元数据，并强制重置旧图的校准与仿射：新图像素坐标不同，
 *  沿用旧 metersPerPixel 会让新图按错误比例测量（P2-A5）。 */
function applyImageBackground(bg,meta){
  bg.kind='image'; bg.fileName=meta.fileName; bg.assetId=meta.assetId;
  bg.width=meta.width; bg.height=meta.height;
  bg.transform=null; bg.calibrated=false; bg.metersPerPixel=0.05;
  return bg;
}
async function importBackgroundFile(f){
  if(!f || !(/^image\//.test(f.type||'')||['png','jpg','jpeg','gif','webp','bmp','svg'].includes(extOfFile(f.name)))){
    return toast('请选择图片文件（PNG/JPG/WebP/BMP/GIF/SVG）','error');
  }
  let prepared;
  try{ prepared=await prepareBackgroundBytes(f); }
  catch(e){ return toast(L('底图读取失败：{msg}',{msg:e.message}),'error'); }
  /* 先完成解码与 dataUrl 生成，再改现场：失败不留半更新状态（审计 P1-9） */
  let dataUrl;
  try{ dataUrl=await bytesToDataUrl(prepared.bytes,prepared.mime); }
  catch(e){ return toast(L('底图读取失败：{msg}',{msg:e.message}),'error'); }
  let image;
  try{ image=await loadImageSrc(dataUrl); }
  catch(e){ return toast(L('底图读取失败：{msg}',{msg:e.message}),'error'); }
  const id=assetIdFor(prepared.bytes);
  let stored=true;
  try{ await assetPut(id,{bytes:prepared.bytes,mime:prepared.mime}); }
  catch(e){ stored=false; }   // IndexedDB 不可用时降级：底图仅本次会话保留
  pushHistory();
  applyImageBackground(state.background,{fileName:f.name,assetId:stored?id:'',width:prepared.width,height:prepared.height});
  /* 不立即删除旧资产：pushHistory 的撤销快照仍引用它，立即删会导致撤销后底图无法恢复；
     待历史栈不再可达时由 pruneBgAssets 统一回收（评估报告 5.2） */
  bgDataUrl=dataUrl;
  const seq=++bgLoadSeq;
  bgImage=image;
  bgImageState='ready';
  if(seq===bgLoadSeq) requestRender();
  refreshCalibStatus();   /* 图片解码完成：三个校准/变换入口从「未就绪」恢复可用 */
  fitView(); pruneBgAssets(); commitChange('底图已导入');
  if(!stored) toast('浏览器本地存储不可用，底图仅本次会话有效，请改用 JSON 工程保存','warn');
  else if(prepared.note) toast(prepared.note,'warn');
}

/* -------------------- 文件输入绑定 -------------------- */
$('bgBtn').onclick=openSitePicker;
$('calibBtn').onclick=()=>startCalibTool('calibrate');
$('fileInput').addEventListener('change',e=>{
  const f=e.target.files[0]; e.target.value='';
  if(f) handleImportFile(f);
});
$('bgInput').addEventListener('change',e=>{
  const f=e.target.files[0]; e.target.value='';
  if(f) importBackgroundFile(f);
});
