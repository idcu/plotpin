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
  if(kind==='quote-csv') exportQuote('csv');
  if(kind==='quote-xlsx') exportQuote('xlsx');
  if(kind==='catalog-json') exportCatalogJSON();
  if(kind==='catalog-delete') deleteCatalog();
  if(kind==='labels') exportLabelSheet();
  if(kind==='title-block') openTitleBlockDialog();
};
function downloadBlob(blob,name){
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),800);
}
function safeName(){ return (state.meta.name||'图纸工程').replace(/[\\/:*?"<>|]/g,'_'); }
/** 图框/标题栏配置弹窗：字段值全部经 normalizeTitleBlock 清洗后再落盘 */
function openTitleBlockDialog(){
  const tb=normalizeTitleBlock(state.meta&&state.meta.titleBlock);
  const inputs=TITLE_BLOCK_FIELDS.map(def=>
    '<label style="display:block;margin:7px 0"><span style="display:inline-block;width:58px;color:#475569">'+esc(L(def.label))+'</span>'+
    '<input id="tb_'+def.key+'" maxlength="'+TITLE_BLOCK_TEXT_MAX+'" value="'+esc(tb.fields[def.key]||'')+'" style="width:calc(100% - 66px)"></label>'
  ).join('');
  const checks=
    '<label style="display:block;margin:8px 0"><input type="checkbox" id="tb_enabled"'+(tb.enabled?' checked':'')+'> '+esc(L('启用图框、标题栏、比例尺与图例'))+'</label>'+
    '<label style="display:block;margin:4px 0"><input type="checkbox" id="tb_frame"'+(tb.frame?' checked':'')+'> '+esc(L('绘制图框边框'))+'</label>'+
    '<label style="display:block;margin:4px 0"><input type="checkbox" id="tb_scaleBar"'+(tb.scaleBar?' checked':'')+'> '+esc(L('绘制比例尺'))+'</label>'+
    '<label style="display:block;margin:4px 0"><input type="checkbox" id="tb_legend"'+(tb.legend?' checked':'')+'> '+esc(L('绘制图例（按可见对象类型/图层）'))+'</label>';
  openModal(L('图框 / 标题栏模板'),
    '<p class="hint-text">'+esc(L('默认关闭；关闭时导出产物与旧版一致。日期留空=导出当天，比例留空=按当前缩放自动 1:N。'))+'</p>'+checks+'<hr>'+inputs,
    [{text:L('取消'),click:closeModal},
     {text:I18N.t('save'),class:'primary',click:()=>{
       const fields={};
       TITLE_BLOCK_FIELDS.forEach(def=>{ const el=$('tb_'+def.key); fields[def.key]=el?el.value:''; });
       const next=normalizeTitleBlock({enabled:$('tb_enabled')?.checked,frame:$('tb_frame')?.checked,
         scaleBar:$('tb_scaleBar')?.checked,legend:$('tb_legend')?.checked,fields});
       pushHistory();
       state.meta.titleBlock=next; state.meta.updatedAt=nowISO();
       commitChange(L('图框模板已保存'));
       closeModal();
     }}]);
}
/** 二维码 SVG 的唯一实现在 js/common/qr.js（qrSvg）；此处直接复用。 */
/**
 * 设备二维码标签：每个可见点设备一张，扫码得到 `PLOTPIN:编号`，可在工程内搜索编号定位。
 * 离线生成可打印 HTML（A4 三列），不依赖任何外部资源。
 */
function exportLabelSheet(){
  const pts=state.objects.filter(o=>o.kind==='point'&&exportScope(o,'draw'));
  if(!pts.length) return toast('当前没有可见的点设备','warn');
  const cards=pts.map(o=>{
    const t=getType(o.typeId);
    const base='PLOTPIN:'+(o.name||o.id);
    const payload=ensureVendor('Qr').byteLength(base)<=Qr.MAX_BYTES?base:'PLOTPIN:'+o.id;
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
  toast(L('已导出 {n} 张设备二维码标签（可打印）',{n:pts.length}),'success');
}
/** 导出覆盖率盲区多边形（逐行合并的矩形面，GeoJSON FeatureCollection） */
function exportBlindSpotsGeoJson(){
  if(!coverageResult||!coverageResult.regions||!coverageResult.regions.length){
    return toast('请先执行「覆盖率分析」','warn');
  }
  const fc=buildBlindSpotGeoJson(coverageResult);
  if(!fc) return toast('当前没有盲区可导出','warn');
  downloadBlob(new Blob([JSON.stringify(fc,null,2)],{type:'application/geo+json'}),safeName()+'-盲区.geojson');
  toast(L('盲区多边形已导出：{n} 个面（合计 {area} ㎡，口径 v{version}）',
    {n:fc.features.length,area:fmt(blindSpotArea(coverageResult)),version:fc.coverageSpec.version}),'success');
}
async function exportJSON(){
  state.meta.updatedAt=nowISO();
  // 工程文件保持可移植：底图字节虽存于 IndexedDB，导出 JSON 时内嵌 dataURL 一并带走。
  // 只要运行时有已装载的图片数据就内嵌——IDB 不可用的降级路径 assetId 为空，同样必须带走（评估报告 5.4）
  const copy=persistableState();
  copy.meta.updatedAt=state.meta.updatedAt;
  if(bgDataUrl && isImageBackground(copy.background)) copy.background.dataUrl=bgDataUrl;
  /* 设备照片同样内嵌 dataUrl：遍历全楼层，同一 photoId 只读一次资产（A-10） */
  const photoDataUrls=new Map();
  for(const list of projectObjectLists(copy)) for(const o of list||[]){
    const id=o&&o.props&&o.props.photoId;
    if(!id) continue;
    try{
      if(!photoDataUrls.has(id)){
        const rec=await assetGet(id);
        photoDataUrls.set(id,rec?await bytesToDataUrl(rec.bytes,rec.mime||'image/jpeg'):'');
      }
      const du=photoDataUrls.get(id);
      if(du) o.props.photoDataUrl=du;
    }catch(_){}
  }
  /* 非当前楼层的底图也内嵌，保证多楼层工程跨设备可移植 */
  for(const f of copy.floors||[]){
    if(f.id===copy.activeFloorId) continue;
    const bg=f.background;
    if(!bg||!bg.assetId) continue;
    try{
      const rec=await assetGet(bg.assetId);
      if(rec) bg.dataUrl=await bytesToDataUrl(rec.bytes,rec.mime||'image/png');
    }catch(_){}
  }
  downloadBlob(new Blob([JSON.stringify(copy,null,2)],{type:'application/json'}),safeName()+'.json');
  toast('JSON 工程已导出（含底图与设备照片）','success');
}
/** 导出口径唯一源（N-05）：
 *  - 'table'：台账类（CSV/TSV/XLSX）保留全量对象，隐藏状态由「显示」列反映有效可见；
 *  - 'draw' ：图纸类（PNG/SVG/DXF/PDF 图纸页与清单/二维码标签/图例）只输出有效可见对象。
 *  有效可见统一定义在 render.js 的 effectiveVisible（对象 visible 且所属图层 visible）。 */
function exportScope(o, mode){ return mode==='draw' ? effectiveVisible(o) : true; }
/** 行渲染器与列定义在 io-fields.js（字段描述表唯一源）；此包装保留既有签名 */
function objectRows(objs=state.objects,floorName){
  const fname=floorName===undefined?currentFloorName():floorName;
  return objs.map(o=>buildExportRow(o,fname));
}
/** 全楼层行（当前层对象取 state.objects，其余层取楼层条目）；台账口径=全量 */
function objectRowsAll(){
  syncActiveFloor();
  return (state.floors||[]).flatMap(f=>objectRows(
    (f.id===state.activeFloorId?state.objects:(f.objects||[])).filter(o=>exportScope(o,'table')),
    f.name
  ));
}
/* 公式注入防护（formulaGuard / formulaUnguard）在 io-fields.js：导出加引号、导入去引号共用一份实现 */
function delimitedFromTable(table,delim){
  const cols=table[0];
  const body=DSV.formatRows(table.slice(1),{
    delimiter:delim,eol:'\n',bom:false,quoteChars:/[",\n\r\t]/,guardFormula:formulaGuard
  });
  return '\ufeff'+cols.join(delim)+'\n'+body;
}
/** 纯函数：生成 CSV/TSV 文本（导出与自测共用，不触发下载） */
function delimitedText(delim){
  return delimitedFromTable([TABLE_COLUMNS,...objectRowsAll().map(r=>TABLE_COLUMNS.map(c=>r[c]))],delim);
}
async function exportQuote(kind){
  const csv=kind==='csv';
  try{
    const agg=quoteAggregate(currentCatalog),fresh=quoteColumns(agg,currentCatalog);
    if(fresh.length<2)return toast('无可汇总型号：先绑定型号并填数量','warn');
    let t=fresh,meta=null,reused=false;
    try{
      const snap=await idbGetKey(QUOTE_SNAPSHOT_KEY),hit=quoteSnapshotTable(fresh,snap);
      if(hit){t=hit;meta={catalogVersion:snap.catalogVersion,exportedAt:snap.exportedAt};reused=true}
      else{
        meta={catalogVersion:catalogVersion(currentCatalog),exportedAt:new Date().toISOString()};
        try{await idbPutKey(QUOTE_SNAPSHOT_KEY,{v:1,cols:fresh[0].length,rows:fresh.map(r=>r.slice()),
          catalogVersion:meta.catalogVersion,exportedAt:meta.exportedAt})}catch(_){}
      }
    }catch(_){}
    if(!meta)meta={catalogVersion:catalogVersion(currentCatalog),exportedAt:new Date().toISOString()};
    const out=quoteMetaTable(t,meta);
    downloadBlob(new Blob([csv?delimitedFromTable(out,','):ensureVendor('Xlsx').build(out,'产品报价')],
      {type:csv?'text/csv;charset=utf-8':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),
      safeName()+'-产品报价.'+(csv?'csv':'xlsx'));
    const n=agg.ambiguous.length;
    toast(reused?L('报价表已导出（沿用上次单价快照）'):n?L('报价表已导出；{n} 个型号跨厂商重名未计价（请填厂商）',{n}):L('报价表已导出'),
      reused||!n?'success':'warn');
  }catch(e){toast(L('报价导出失败：{msg}',{msg:e.message}),'error')}
}
/** 分隔文本导出（CSV/TSV） */
function exportDelimited(delim,ext,mime){
  downloadBlob(new Blob([delimitedText(delim)],{type:mime}),safeName()+'.'+ext);
}
/* 保留旧单格转义入口（自测与插件可能调用），实现委托公共 DSV */
function csvCell(v,delim){ return DSV.quoteCell(v,{delimiter:delim,quoteChars:/[",\n\r\t]/,guardFormula:formulaGuard}); }
/** 导出真 .xlsx（原生 OOXML + stored ZIP，Excel/WPS 可直接打开，亦可再次导入往返）。
 * 所有单元格写 `t="inlineStr"`（文本），即使值以 =/@ 开头也不会成为公式，与 CSV 防护互补。 */
function exportXlsx(){
  const table=xlsxExportTable();
  const buf=ensureVendor('Xlsx').build(table, '图纸标注');
  downloadBlob(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),safeName()+'.xlsx');
  toast('XLSX 已导出（可再次导入更新对象属性）','success');
}
/* -------------------- 图框 / 标题栏 / 比例尺 / 图例（B-07） --------------------
 * 默认 enabled:false → 既有 PNG/PDF/SVG 导出路径完全不调用本组函数，产物字节不变。
 * 启用后：图框（内边框）+ 右下标题栏（8 字段）+ 左下比例尺 + 右上图例（按当前可见对象/图层生成）。
 * 三种格式共用 titleBlockSpec（同一几何/文案源），颜色/字号由各自渲染器负责。 */
const TITLE_BLOCK_DPI={png:96,svg:96,pdf:150};
function titleBlockEffective(){
  const tb=normalizeTitleBlock(state.meta&&state.meta.titleBlock);
  const values=Object.assign({},tb.fields);
  if(!values.projectName) values.projectName=state.meta.name||'未命名图纸工程';
  if(!values.drawingNo) values.drawingNo='—';
  if(!values.date) values.date=new Date().toLocaleDateString('zh-CN');
  if(!values.version) values.version='V1.0';
  return {tb,values};
}
/** 比例尺取“整齐”长度：目标像素内取 1/2/5×10^n 米（保证刻度可读且不越界） */
function niceScaleBarMeters(ppu,targetPx=140){
  const k=ppu>0?ppu:1, raw=targetPx/k;
  const p=Math.pow(10,Math.floor(Math.log10(raw)));
  const m=raw/p, nice=m>=5?5:m>=2?2:1;
  return {meters:nice*p,px:nice*p*k};
}
/** 自动比例 1:N：N = 每米像素 / 每像素物理尺寸（PNG/SVG 按 96dpi，PDF 按 150dpi 页面） */
function titleBlockRatio(ppu,format){
  const dpi=TITLE_BLOCK_DPI[format]||96;
  return Math.max(1,Math.round(dpi/((ppu>0?ppu:1)*0.0254)));
}
/** 图例：按当前可见对象的类型聚合（名称/颜色/数量），并列出涉及图层；上限 8 类/6 层，多余显示 +N */
function titleBlockLegendData(){
  const map=new Map(), layerSet=new Set();
  state.objects.filter(o=>exportScope(o,'draw')).forEach(o=>{
    const t=getType(o.typeId)||{};
    const id=t.id||o.typeId||'?';
    const e=map.get(id)||{name:t.name||id,color:(o.style&&o.style.color)||t.color||'#64748b',count:0};
    e.count++; map.set(id,e);
    const l=layerOf(o); if(l&&l.name) layerSet.add(l.name);
  });
  const all=Array.from(map.values()).sort((a,b)=>a.name.localeCompare(b.name,'zh'));
  const layers=Array.from(layerSet).sort();
  return {items:all.slice(0,8),more:Math.max(0,all.length-8),layers:layers.slice(0,6),layerMore:Math.max(0,layers.length-6)};
}
/** 导出叠加层唯一布局源：返回 null 表示未启用（调用方直接跳过，保证默认产物不变） */
function titleBlockSpec(W,H,ppu,format){
  const {tb,values}=titleBlockEffective();
  if(!tb.enabled) return null;
  const pad=12, ratio=titleBlockRatio(ppu,format);
  const blockW=Math.min(440,Math.max(300,W*0.46)), rowH=30, blockH=rowH*4;
  const bx=W-pad-blockW, by=H-pad-blockH;
  const cells=[];
  for(let r=0;r<4;r++) for(let c=0;c<2;c++){
    const def=TITLE_BLOCK_FIELDS[r*2+c], half=blockW/2;
    const val=def.key==='scale'?(values.scale||('1:'+ratio)):values[def.key];
    cells.push({x:bx+c*half,y:by+r*rowH,w:half,h:rowH,label:L(def.label),value:val||'—',key:def.key});
  }
  const bar=niceScaleBarMeters(ppu,140);
  const legend=titleBlockLegendData(), lineH=18;
  const legendW=Math.min(240,Math.max(170,W*0.3));
  const legendH=26+legend.items.length*lineH+(legend.layers.length?16:0)+(legend.more?16:0);
  return {
    tb,values,ratio,
    frame:tb.frame?{x:8,y:8,w:Math.max(1,W-16),h:Math.max(1,H-16)}:null,
    block:{x:bx,y:by,w:blockW,h:blockH,rowH,cells},
    scaleBar:tb.scaleBar?{x:pad+18,y:H-pad-42,w:bar.px,h:8,meters:bar.meters}:null,
    legend:tb.legend?{x:W-pad-legendW,y:pad+10,w:legendW,h:legendH,lineH,...legend}:null
  };
}
/** Canvas 渲染（PNG / PDF 位图页共用）：字号/坐标单位为 CSS 像素 */
function drawTitleBlockOnCanvas(c,W,H,spec){
  if(!spec) return;
  c.save();
  if(spec.frame){ c.strokeStyle='#111827'; c.lineWidth=1.5; c.strokeRect(spec.frame.x,spec.frame.y,spec.frame.w,spec.frame.h); }
  const b=spec.block;
  c.fillStyle='#ffffff'; c.fillRect(b.x,b.y,b.w,b.h);
  c.strokeStyle='#111827'; c.lineWidth=1; c.strokeRect(b.x,b.y,b.w,b.h);
  c.beginPath();
  for(let r=1;r<4;r++){ const y=b.y+r*b.rowH; c.moveTo(b.x,y); c.lineTo(b.x+b.w,y); }
  c.moveTo(b.x+b.w/2,b.y); c.lineTo(b.x+b.w/2,b.y+b.h); c.stroke();
  c.textBaseline='alphabetic';
  spec.block.cells.forEach(cell=>{
    c.fillStyle='#4b5563'; c.font='10px Microsoft YaHei,Arial'; c.fillText(cell.label,cell.x+6,cell.y+12);
    c.fillStyle='#111827'; c.font='12px Microsoft YaHei,Arial';
    let v=String(cell.value);
    while(v.length>1&&c.measureText(v).width>cell.w-12) v=v.slice(0,-1);
    c.fillText(v,cell.x+6,cell.y+26);
  });
  if(spec.scaleBar){
    const s=spec.scaleBar, seg=s.w/2;
    c.fillStyle='#111827'; c.fillRect(s.x,s.y,seg,s.h);
    c.fillStyle='#ffffff'; c.fillRect(s.x+seg,s.y,seg,s.h);
    c.strokeStyle='#111827'; c.lineWidth=1; c.strokeRect(s.x,s.y,s.w,s.h);
    c.fillStyle='#111827'; c.font='10px Microsoft YaHei,Arial';
    c.fillText('0',s.x,s.y-3);
    c.textAlign='center'; c.fillText(fmt(s.meters/2),s.x+seg,s.y-3); c.textAlign='right';
    c.fillText(fmt(s.meters)+' m',s.x+s.w,s.y-3); c.textAlign='left';
  }
  if(spec.legend){
    const lg=spec.legend;
    c.fillStyle='rgba(255,255,255,.92)'; c.fillRect(lg.x,lg.y,lg.w,lg.h);
    c.strokeStyle='#111827'; c.lineWidth=1; c.strokeRect(lg.x,lg.y,lg.w,lg.h);
    c.fillStyle='#111827'; c.font='bold 11px Microsoft YaHei,Arial'; c.fillText(L('图例'),lg.x+6,lg.y+16);
    c.font='11px Microsoft YaHei,Arial';
    let y=lg.y+34;
    lg.items.forEach(it=>{
      c.fillStyle=it.color; c.fillRect(lg.x+7,y-8,8,8);
      c.strokeStyle='#111827'; c.strokeRect(lg.x+7,y-8,8,8);
      c.fillStyle='#111827'; c.fillText(it.name+' ×'+it.count,lg.x+20,y); y+=lg.lineH;
    });
    if(lg.more){ c.fillStyle='#4b5563'; c.fillText('… +'+lg.more+' 类',lg.x+7,y); y+=lg.lineH; }
    if(lg.layers.length){ c.fillStyle='#4b5563'; c.fillText('图层：'+lg.layers.join('、')+(lg.layerMore?' +'+lg.layerMore:''),lg.x+7,y); }
  }
  c.restore();
}
/** SVG 渲染：所有文本走 esc()（与既有导出同一转义表），几何与 titleBlockSpec 同源 */
function exportTitleBlockSvg(spec){
  if(!spec) return '';
  const out=[];
  if(spec.frame) out.push(`<rect x="${spec.frame.x}" y="${spec.frame.y}" width="${spec.frame.w}" height="${spec.frame.h}" fill="none" stroke="#111827" stroke-width="1.5"/>`);
  const b=spec.block;
  out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#ffffff" stroke="#111827" stroke-width="1"/>`);
  for(let r=1;r<4;r++) out.push(`<line x1="${b.x}" y1="${b.y+r*b.rowH}" x2="${b.x+b.w}" y2="${b.y+r*b.rowH}" stroke="#111827" stroke-width="1"/>`);
  out.push(`<line x1="${b.x+b.w/2}" y1="${b.y}" x2="${b.x+b.w/2}" y2="${b.y+b.h}" stroke="#111827" stroke-width="1"/>`);
  spec.block.cells.forEach(cell=>{
    out.push(`<text x="${cell.x+6}" y="${cell.y+12}" font-size="10" fill="#4b5563">${esc(cell.label)}</text>`);
    out.push(`<text x="${cell.x+6}" y="${cell.y+26}" font-size="12" fill="#111827">${esc(cell.value)}</text>`);
  });
  if(spec.scaleBar){
    const s=spec.scaleBar, seg=s.w/2;
    out.push(`<rect x="${s.x}" y="${s.y}" width="${seg}" height="${s.h}" fill="#111827"/>`);
    out.push(`<rect x="${s.x+seg}" y="${s.y}" width="${seg}" height="${s.h}" fill="#ffffff" stroke="#111827" stroke-width="1"/>`);
    out.push(`<text x="${s.x}" y="${s.y-3}" font-size="10" fill="#111827">0</text>`);
    out.push(`<text x="${s.x+seg}" y="${s.y-3}" text-anchor="middle" font-size="10" fill="#111827">${esc(fmt(s.meters/2))}</text>`);
    out.push(`<text x="${s.x+s.w}" y="${s.y-3}" text-anchor="end" font-size="10" fill="#111827">${esc(fmt(s.meters))} m</text>`);
  }
  if(spec.legend){
    const lg=spec.legend;
    out.push(`<rect x="${lg.x}" y="${lg.y}" width="${lg.w}" height="${lg.h}" fill="#ffffff" fill-opacity=".92" stroke="#111827" stroke-width="1"/>`);
    out.push(`<text x="${lg.x+6}" y="${lg.y+16}" font-size="11" font-weight="bold" fill="#111827">${esc(L('图例'))}</text>`);
    let y=lg.y+34;
    lg.items.forEach(it=>{
      out.push(`<rect x="${lg.x+7}" y="${y-8}" width="8" height="8" fill="${normalizeExportColor(it.color,'#111827')}" stroke="#111827" stroke-width="1"/>`);
      out.push(`<text x="${lg.x+20}" y="${y}" font-size="11" fill="#111827">${esc(it.name+' ×'+it.count)}</text>`);
      y+=lg.lineH;
    });
    if(lg.more){ out.push(`<text x="${lg.x+7}" y="${y}" font-size="11" fill="#4b5563">${esc('… +'+lg.more+' 类')}</text>`); y+=lg.lineH; }
    if(lg.layers.length) out.push(`<text x="${lg.x+7}" y="${y}" font-size="11" fill="#4b5563">${esc('图层：'+lg.layers.join('、')+(lg.layerMore?' +'+lg.layerMore:''))}</text>`);
  }
  return out.join('\n');
}
function renderToDataURL(scale=2){
  const d=worldDims(), margin=30;
  const z=Math.min(2600/d.w,1800/d.h,60);
  const cw=d.w*z+margin*2, ch=d.h*z+margin*2;
  const c=document.createElement('canvas'); c.width=Math.round(cw*scale); c.height=Math.round(ch*scale);
  markSurfaceSize(c,cw,ch);
  const cc=c.getContext('2d'); cc.scale(scale,scale);
  drawScene(cc,{zoom:z,panX:margin,panY:margin},cw,ch,{interactive:false,markerScale:1.6});
  drawTitleBlockOnCanvas(cc,cw,ch,titleBlockSpec(cw,ch,z,'png'));
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
/** 导出层颜色白名单：拒绝引号/空白/分号等可逃逸 SVG 属性的取值，非法回退 fb */
function normalizeExportColor(v, fb){
  const s=String(v==null?'':v).trim();
  if(/^#[0-9a-f]{3,8}$/i.test(s)) return s;
  if(/^rgba?\([\d.,%\s/]+\)$/i.test(s)) return s;
  if(/^[a-z]{3,20}$/i.test(s)) return s;
  return fb;
}
/** DXF 图层名清洗：去控制字符（CR/LF/制表）与 vendor 会替换的保留字符，保证组码结构不被截断 */
function dxfSanitizeName(name){
  const s=String(name==null?'':name)
    .replace(/[\r\n\t\u0000-\u001f\u007f]+/g,' ')
    .replace(/[<>/\\":;?*|=`]/g,'_')
    .trim().slice(0,60);
  return s||'LAYER';
}
/** 纯函数：按当前工程生成 SVG 文本（导出与自测共用，不触发下载） */
function buildSceneSvg(){
  const d=worldDims(), margin=30, maxW=1800, ppu=Math.min(maxW/d.w,1200/d.h,40), sw=d.w*ppu+margin*2, sh=d.h*ppu+margin*2;
  /* 世界→SVG：以取景框 (minX,minY)-(maxX,maxY) 为基准，兼容仿射校准后含负 min 的包围框 */
  const X=x=>margin+(x-d.minX)*ppu, Y=y=>margin+(d.minY+d.h-y)*ppu;
  const shapes=[], markers=[];
  const bg=state.background, site=state.site;
  if(isImageBackground(bg)&&bgImage&&bgDataUrl){
    const t=validImageTransform(bg.transform);
    if(t){
      /* 按仿射系数把图像像素空间直接映射到 SVG 坐标（支持旋转/不等比/切变） */
      const m=`matrix(${t.a*ppu} ${-t.d*ppu} ${t.b*ppu} ${-t.e*ppu} ${X(t.c)} ${Y(t.f)})`;
      shapes.push(`<image x="0" y="0" width="${bg.width}" height="${bg.height}" transform="${m}" href="${xmlEscape(bgDataUrl)}" xlink:href="${xmlEscape(bgDataUrl)}"/>`);
    }else{
      /* 轴对齐图片：按自身像素×m/px 尺寸绘制，不能用并集取景框尺寸（否则有场地时会被拉伸 */
      const ww=Math.max(.01,Number(bg.width)*positiveNumber(bg.metersPerPixel,0.1));
      const hh=Math.max(.01,Number(bg.height)*positiveNumber(bg.metersPerPixel,0.1));
      shapes.push(`<image x="${X(0)}" y="${Y(hh)}" width="${ww*ppu}" height="${hh*ppu}" href="${xmlEscape(bgDataUrl)}" xlink:href="${xmlEscape(bgDataUrl)}"/>`);
    }
  }
  /* 矢量场地层：独立于图片槽，SVG 中始终叠加在图片之上 */
  if(site&&siteIsVisible(site)){
    const sh=siteShapeOf(site), st=site.style||{};
    const fill=xmlEscape(st.fill||'#eef2f7'), stroke=xmlEscape(st.stroke||'#3b82f6');
    if(sh.type==='circle'){
      shapes.push(`<circle cx="${X(sh.cx)}" cy="${Y(sh.cy)}" r="${sh.r*ppu}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`);
    }else if(sh.type==='ellipse'){
      shapes.push(`<ellipse cx="${X(sh.cx)}" cy="${Y(sh.cy)}" rx="${sh.rx*ppu}" ry="${sh.ry*ppu}" transform="rotate(${-Number(sh.angle)||0} ${X(sh.cx)} ${Y(sh.cy)})" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`);
    }else if(sh.type==='sector'){
      const R=sh.r*ppu, cx=X(sh.cx), cy=Y(sh.cy), sweep=sectorSweep(sh);
      const ex=a=>[cx+R*Math.cos(a*Math.PI/180),cy-R*Math.sin(a*Math.PI/180)];
      const a0=Number(sh.a0)||0;
      const p0=ex(a0), p1=ex(a0+sweep), large=sweep>180?1:0;
      shapes.push(`<path d="M${cx},${cy} L${p1[0]},${p1[1]} A${R},${R} 0 ${large} 1 ${p0[0]},${p0[1]} Z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`);
    }else{
      const pts=siteOutlinePoints(site).map(p=>`${X(p[0])},${Y(p[1])}`).join(' ');
      shapes.push(`<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`);
    }
  }
  /* SVG 面积/周长双行标签（与画布 drawAreaTag 语义一致；白描边保证任意底色可读）；可分别关闭 */
  const areaTagSvg=(cx,cy,area,perim,showArea=true,showPerim=true)=>{
    const s1=showArea?`面积 ${fmt(area)} ㎡`:'', s2=showPerim?`周长 ${fmt(perim)} m`:'';
    const line=(t,y)=>t?`<text x="${cx}" y="${y}" text-anchor="middle" font-size="12" font-family="Consolas,Menlo,monospace" fill="#1e3a8a" stroke="#fff" stroke-width="3" paint-order="stroke">${t}</text>`:'';
    if(!s1&&!s2) return '';
    if(s1&&s2) return line(s1,cy-7)+line(s2,cy+9);
    return line(s1||s2,cy+4);
  };
  /* 场地标注：节点坐标 / 段长 / 半径 / 面积周长（与画布 drawSiteAnnotations 同口径） */
  if(site&&siteIsVisible(site)){
    const S=state.settings||{}, ap=siteAreaPerimeter(site), cen=siteShapeCenter(site);
    if(S.siteArea||S.sitePerimeter) markers.push(areaTagSvg(X(cen[0]),Y(cen[1]),ap.area,ap.perimeter,!!S.siteArea,!!S.sitePerimeter));
    if(S.siteRadius){
      const rt=siteRadiusText(site);
      if(rt) markers.push(`<text x="${X(cen[0])}" y="${Y(cen[1])+18}" text-anchor="middle" font-size="12" font-family="Consolas,Menlo,monospace" fill="#1e3a8a" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(rt)}</text>`);
    }
    const bp=siteBoundaryPoints(site);
    if(bp&&bp.length){
      if(S.siteNodes) bp.forEach((p,i)=>markers.push(`<text x="${X(p[0])+5}" y="${Y(p[1])-5}" font-size="11" font-family="Consolas,Menlo,monospace" fill="#1e3a8a" stroke="#fff" stroke-width="3" paint-order="stroke">P${i+1} (${fmt(p[0])}, ${fmt(p[1])})</text>`));
      if(S.siteSegLen) bp.forEach((p,i)=>{
        const q=bp[(i+1)%bp.length], len=dist(p,q);
        if(len*ppu<segLabelMinPx()) return;   /* 与画布同口径：屏幕上过短的段不标 */
        const mx=(p[0]+q[0])/2, my=(p[1]+q[1])/2;
        markers.push(`<text x="${X(mx)}" y="${Y(my)}" text-anchor="middle" font-size="11" font-family="Consolas,Menlo,monospace" fill="#0f766e" stroke="#fff" stroke-width="3" paint-order="stroke">${fmt(len)} m</text>`);
      });
    }
    /* 基点坐标（矩形/平行四边形/圆/椭圆/扇形）：画布 drawSiteAnnotations 同口径 */
    if(S.siteBase){
      const b=siteBasePoint(site);
      if(b) markers.push(`<text x="${X(b[0])+7}" y="${Y(b[1])-16}" font-size="11" font-family="Consolas,Menlo,monospace" fill="#1e3a8a" stroke="#fff" stroke-width="3" paint-order="stroke">(${fmt(b[0])}, ${fmt(b[1])})</text>`);
    }
  }
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
      /* 行业/自定义 SVG 图元：与画布共用 symbolPathsFor 的 path 源 */
      const vb=type&&type.symbolViewBox||{x:0,y:0,w:24,h:24};
      const fs=0.9*24/Math.max(vb.w,vb.h);
      const paths=(type?symbolPathsFor(type):[]).map(p=>`<path d="${esc(p.d)}" fill="${p.fill?color:'none'}" stroke="${p.fill?'none':color}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
      body=`<g transform="translate(${-(vb.x+vb.w/2)*fs} ${-(vb.y+vb.h/2)*fs}) scale(${fs})">${paths}</g>`;
    }else{
      body=`<circle cx="0" cy="0" r="7" fill="#fff" stroke="${color}" stroke-width="2"/><circle cx="0" cy="0" r="3.5" fill="${color}"/>`;
    }
    return body;
  };
  state.objects.filter(o=>exportScope(o,'draw')).forEach(o=>{
    const t=getType(o.typeId), color=normalizeExportColor(o.style.color||t.color,'#111827');
    if(o.kind==='rect'){
      const pts=outlineOf(o).map(p=>`${X(p[0])},${Y(p[1])}`).join(' ');
      shapes.push(`<polygon points="${pts}" fill="${color}" fill-opacity="${styleVal(o,'fillAlpha',.15)}" stroke="${color}" stroke-width="${styleVal(o,'strokeWidth',.1)*ppu}"/>`);
      if(o.name&&annotOn(o,'name')){ const ce=shapeLabelCenter(o); markers.push(`<text x="${X(ce[0])}" y="${Y(ce[1])}" text-anchor="middle" font-size="14" fill="${color}" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(o.name)}</text>`); }
      const sa=annotOn(o,'area'), sp=annotOn(o,'perimeter');
      if(sa||sp){ const ce=shapeLabelCenter(o); markers.push(areaTagSvg(X(ce[0]),Y(ce[1]),shapeArea(o),shapePerimeter(o),sa,sp)); }
      markers.push(annotItemsSvg(o));
    }else if(o.kind==='line'&&o.points.length){
      /* 闭合折线点串末尾补回首点，闭合边描边才不缺失（与画布 closePath 一致） */
      const pts=outlineOf(o).map(p=>`${X(p[0])},${Y(p[1])}`);
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
      /* 符号真实尺寸：phys>0 时按米缩放，与画布同一 path 源与同一尺寸基准 */
      const symSize=(t.symbol&&t.symbol.length&&(o.phys||0)>0)?o.phys*ppu:0;
      if(symSize){
        const vb=t.symbolViewBox||{x:0,y:0,w:24,h:24};
        const fs=symSize/Math.max(vb.w,vb.h), lw=Math.max(.06,Math.min(6,1.6/fs));
        const paths=symbolPathsFor(t).map(p=>`<path d="${esc(p.d)}" fill="${p.fill?color:'none'}" stroke="${p.fill?'none':color}" stroke-width="${lw.toFixed(3)}" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
        shapes.push(`<g transform="translate(${x} ${y}) rotate(${-o.angle})"><g transform="translate(${-(vb.x+vb.w/2)*fs} ${-(vb.y+vb.h/2)*fs}) scale(${fs})">${paths}</g></g>`);
      }else if((o.phys||0)>0&&psh!=='none'){
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
      markers.push(`<text x="${X(o.x)}" y="${Y(o.y)}" transform="rotate(${-o.angle} ${X(o.x)} ${Y(o.y)})" text-anchor="middle" font-size="${Math.max(10,o.height*ppu*.55)}" fill="${normalizeExportColor(o.style.color,'#111')}">${esc(o.text||'文字')}</text>`);
    }else if(o.kind==='dimension'&&o.points.length>=2){
      const pts=outlineOf(o).map(p=>`${X(p[0])},${Y(p[1])}`).join(' ');
      const dash=o.subtype==='ruler'?' stroke-dasharray="7,4"':'';
      const dcolor=o.subtype==='ruler'?'#0891b2':'#111827';
      const dm=dimensionMeasure(o);   /* 数值唯一源；文本模板仍按 SVG 既有格式 */
      shapes.push(`<polyline points="${pts}" fill="none" stroke="${dcolor}" stroke-width="1.8"${dash}/>`);
      if(o.subtype==='ruler'){
        o.points.forEach(p=>shapes.push(`<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3" fill="none" stroke="#0891b2" stroke-width="1.5"/>`));
        const ep=o.points[o.points.length-1];
        markers.push(`<text x="${X(ep[0])+6}" y="${Y(ep[1])-6}" text-anchor="start" font-size="12" fill="#0e7490">Σ ${fmt(dm.length)} m</text>`);
      }
      if(o.subtype==='distance') markers.push(`<text x="${(X(o.points[0][0])+X(o.points[1][0]))/2}" y="${(Y(o.points[0][1])+Y(o.points[1][1]))/2-8}" text-anchor="middle" font-size="12">${fmt(dm.length)} m</text>`);
      if(o.subtype==='area'&&o.points.length>=3){
        /* 与画布 drawDimension 的 area 分支一致：中心附近面积+周长 */
        const cx=o.points.reduce((s,p)=>s+X(p[0]),0)/o.points.length+8;
        const cy=o.points.reduce((s,p)=>s+Y(p[1]),0)/o.points.length;
        markers.push(`<text x="${cx}" y="${cy}" font-size="12">面积 ${fmt(dm.area)} ㎡</text>`);
        markers.push(`<text x="${cx}" y="${cy+16}" font-size="12">周长 ${fmt(dm.perimeter)} m</text>`);
      }
      if(o.subtype==='angle'&&o.points.length>=3){
        /* 与画布一致：按三点算夹角，标在顶点旁 */
        const v0=o.points[0];
        markers.push(`<text x="${X(v0[0])+30}" y="${Y(v0[1])-8}" font-size="12">${fmt(dm.deg)}°</text>`);
      }
    }
  });
  /* B-07：默认关闭时不得多出任何字节（视觉快照 golden 按整段 SVG 哈希） */
  const tbSvg=exportTitleBlockSvg(titleBlockSpec(sw,sh,ppu,'svg'));
  const svg=`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${sw}" height="${sh}" viewBox="0 0 ${sw} ${sh}">
<rect width="100%" height="100%" fill="white"/>
<g>${shapes.join('\n')}</g><g font-family="Microsoft YaHei,Arial,sans-serif">${markers.join('\n')}</g>
<text x="${margin}" y="${sh-8}" font-size="11" fill="#666">${esc(state.meta.name)} · ${esc(siteDescription())}</text>${tbSvg?'\n'+tbSvg:''}
</svg>`;
  return svg;
}

/* -------------------- DXF 导出（CAD 互通，坐标输出毫米） -------------------- */
/** 场地 DXF 实体：独立 SITE 图层闭合 LWPOLYLINE；隐藏场地不导出 */
function siteDxfEntities(){
  const site=state.site;
  if(!site||!siteIsVisible(site)) return [];
  return [{type:'LWPOLYLINE',layer:'SITE',color:'#16a34a',points:siteOutlinePoints(site).map(p=>p.slice()),closed:true}];
}
/** 纯函数：按当前工程组装 DXF 实体与图层（导出与自测共用；不触发下载）。
 *  对象顶点统一走 outlineOf（A-15），保证 SVG/DXF 顶点源一致。 */
function dxfEntitiesForExport(){
  const entities=[];
  /* N-10：图层名在调用侧清洗（不改 vendor）；SITE 保留，清洗后重名追加 _2 后缀 */
  const usedNames=new Set(['SITE']), nameMap=new Map();
  state.layers.forEach(l=>{
    let nm=dxfSanitizeName(l.name);
    if(usedNames.has(nm)){ let k=2; while(usedNames.has(nm+'_'+k)) k++; nm=nm+'_'+k; }
    usedNames.add(nm); nameMap.set(l.id,nm);
  });
  const layers=state.layers.map(l=>({name:nameMap.get(l.id),color:'#7c3aed'}));
  /* DXF 明确降级报告：符号点保留 POINT 锚点，形状以折线近似（不静默丢失） */
  const report={symbolPoints:0, approxPolylines:0, degraded:false,
    note:'符号图元在 DXF 中以 LWPOLYLINE 折线近似（曲线/圆弧离散），不可再编辑为符号；真实尺寸按对象 phys，phys=0 时用 0.6 m 名义尺寸。'};
  /* 矢量场地：独立 SITE 图层，闭合 LWPOLYLINE（不进 objects/CSV/XLSX） */
  const siteEnts=siteDxfEntities();
  if(siteEnts.length&&!layers.some(l=>l.name==='SITE')) layers.push({name:'SITE',color:'#16a34a'});
  entities.push(...siteEnts);
  state.objects.filter(o=>exportScope(o,'draw')).forEach(o=>{
    const t=getType(o.typeId);
    const color=o.style.color||t.color||'#111827';
    const layer=nameMap.get(o.layerId)||dxfSanitizeName(layerOf(o).name);
    if(o.kind==='point'){
      entities.push({type:'POINT',layer,color,x:o.x,y:o.y});
      if(t.symbol&&t.symbol.length){
        const size=(o.phys||0)>0?o.phys:0.6;
        const polys=symbolPolylinesInWorld(t,o.x,o.y,size,o.angle,t.symbolViewBox);
        for(const poly of polys){
          entities.push({type:'LWPOLYLINE',layer,color,points:poly.points,closed:!!poly.closed});
          report.approxPolylines++;
        }
        report.symbolPoints++;
      }
    }else if(o.kind==='line'){
      entities.push({type:'LWPOLYLINE',layer,color,points:outlineOf(o),closed:!!o.closed});
    }else if(o.kind==='rect'){
      const tt=areaShapeType(o);
      if(tt==='circle') entities.push({type:'CIRCLE',layer,color,x:o.x,y:o.y,r:o.shape.r});
      else entities.push({type:'LWPOLYLINE',layer,color,points:outlineOf(o),closed:true});
    }else if(o.kind==='dimension'&&o.points.length>=2){
      entities.push({type:'LWPOLYLINE',layer,color:'#111827',points:outlineOf(o),closed:o.subtype==='area'});
      const ep=o.points[o.points.length-1], dm=dimensionMeasure(o);
      const label=o.subtype==='ruler'?'Σ '+fmt(dm.length)+' m'
        :o.subtype==='distance'?fmt(dm.length)+' m'
        :o.subtype==='area'?fmt(dm.area)+' m2'
        :fmt(dm.deg)+' deg';
      entities.push({type:'TEXT',layer,color:'#111827',x:ep[0],y:ep[1],text:label,height:.7});
    }else if(o.kind==='text'){
      entities.push({type:'TEXT',layer,color:o.style.color||'#111827',x:o.x,y:o.y,text:o.text||'文字',height:o.height||1});
    }
  });
  report.degraded=report.symbolPoints>0;
  return {entities,layers,report};
}
function exportDXF(){
  const {entities,layers,report}=dxfEntitiesForExport();
  if(!entities.length) return toast('当前没有可导出的对象','warn');
  downloadBlob(new Blob([ensureVendor('Dxf').buildDxf(entities,layers)],{type:'image/vnd.dxf;charset=utf-8'}),safeName()+'.dxf');
  if(report&&report.degraded){
    openModal(L('DXF 导出报告'),
      `<p>${esc(L('本次导出含 {n} 个符号图元，已按 {m} 条 LWPOLYLINE 折线近似（曲线/圆弧离散）。',{n:report.symbolPoints,m:report.approxPolylines}))}</p>`+
      `<p class="hint-text">${esc(report.note)}</p>`,
      [{text:L('知道了'),class:'primary',click:closeModal}]);
  }else{
    toast('DXF 已导出（坐标单位：毫米，可用 AutoCAD/LibreCAD 打开）','success');
  }
}

/* -------------------- 多页 PDF 导出（图纸页 + 完整清单分页） -------------------- */
function canvasToJpegBase64(canvas,quality=.92){
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('JPEG 编码失败')),'image/jpeg',quality))
    .then(b=>new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result).split(',')[1]); r.onerror=rej; r.readAsDataURL(b); }));
}
/* 清单页版式常量：分页数与渲染共用一份（避免两处各写一套导致页码/总页数不一致） */
const PDF_LIST_PAGE={W:1240,H:1748,margin:48,rowH:30,headH:40};
function pdfListRowsPerPage(){ return Math.max(1,Math.floor((PDF_LIST_PAGE.H-PDF_LIST_PAGE.margin*2-150)/PDF_LIST_PAGE.rowH)); }
/** PDF 图纸口径对象（N-05）：图纸页与清单页共用，只看有效可见对象，避免清单含隐藏项而图纸不画 */
function pdfDrawObjectsFor(row){
  const objs=row&&row.id!==undefined
    ? (row.id===state.activeFloorId?state.objects:((state.floors||[]).find(f=>f.id===row.id)||{}).objects||[])
    : state.objects;
  return (objs||[]).filter(o=>exportScope(o,'draw'));
}
/** 整套 PDF 的页序/页码计划：楼层顺序 → 每层「图纸页 + 清单页」，页码全局连续 */
function pdfPagePlan(){
  const fs=floorSummaries();
  const per=pdfListRowsPerPage();
  const listCount=n=>Math.max(1,Math.ceil((Number(n)||0)/per));
  const out=[];
  if(fs.rows.length<=1){
    out.push({kind:'drawing',floorName:null});
    for(let i=0;i<listCount(pdfDrawObjectsFor(fs.rows[0]).length);i++) out.push({kind:'list',floorName:null,pageIndex:i});
  }else{
    for(const row of fs.rows){
      out.push({kind:'drawing',floorId:row.id,floorName:row.name});
      for(let i=0;i<listCount(pdfDrawObjectsFor(row).length);i++) out.push({kind:'list',floorId:row.id,floorName:row.name,pageIndex:i});
    }
  }
  out.forEach((p,i)=>{ p.pageNo=i+1; p.total=out.length; });
  return out;
}
async function renderPdfDrawingPage(floorName,pageNo,pageTotal){
  const W=1748,H=1240;   /* A4 横向 150dpi 像素 */
  const c=document.createElement('canvas'); c.width=W; c.height=H; markSurfaceSize(c,W,H);
  const cc=c.getContext('2d'); cc.fillStyle='#fff'; cc.fillRect(0,0,W,H);
  const d=worldDims(), margin=36;
  const z=Math.min((W-margin*2)/d.w,(H-margin*2)/d.h);
  drawScene(cc,{zoom:z,panX:(W-d.w*z)/2,panY:(H-d.h*z)/2},W,H,{interactive:false,markerScale:1.6});
  drawTitleBlockOnCanvas(cc,W,H,titleBlockSpec(W,H,z,'pdf'));
  cc.fillStyle='#666'; cc.font='16px Microsoft YaHei,Arial';
  const pageTag=pageNo?L(' · 第 {n} / {total} 页',{n:pageNo,total:pageTotal}):'';
  cc.fillText(state.meta.name+(floorName?' · '+floorName:'')+' · '+siteDescription()+pageTag,margin,H-14);
  return {width:W,height:H,b64:await canvasToJpegBase64(c)};
}
async function renderPdfListPages(floorName,pageNos,pageTotal){
  const {W,H,margin,rowH,headH}=PDF_LIST_PAGE;
  const rows=objectRows(pdfDrawObjectsFor(null)), pages=[];
  const per=pdfListRowsPerPage();
  const chunks=[]; for(let i=0;i<rows.length;i+=per) chunks.push(rows.slice(i,i+per));
  const total=Math.max(1,chunks.length);
  for(let pi=0;pi<chunks.length||rows.length===0;pi++){
    const c=document.createElement('canvas'); c.width=W; c.height=H;
    const g=c.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,W,H);
    g.fillStyle='#111827'; g.font='bold 26px Microsoft YaHei,Arial'; g.textBaseline='alphabetic';
    g.fillText(state.meta.name+(floorName?' — '+floorName:'')+' — '+L('对象清单'),margin,margin+8);
    g.font='14px Microsoft YaHei,Arial'; g.fillStyle='#555';
    const pageNo=(pageNos&&pageNos[pi])||pi+1, pageAll=pageTotal||total;
    g.fillText(L('共 {n} 个对象 · 第 {page} / {total} 页 · {time}',{n:rows.length,page:pageNo,total:pageAll,time:new Date().toLocaleString()}),margin,margin+34);
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
      /* 列布局来自字段表投影；值一律取 objectRows() 的行，不在格式层二次拼装 */
      PDF_COLS.forEach(([name,w])=>{ let s=String(name==='对象类型'?L(r[name]):(r[name]??'')); if(g.measureText(s).width>w-14) s=s.slice(0,10)+'…'; g.fillText(s,x,y+20); x+=w; });
      y+=rowH;
    });
    pages.push({width:W,height:H,b64:await canvasToJpegBase64(c,.9)});
    if(rows.length===0) break;
  }
  return pages;
}
async function exportPDF(){
  try{
    const fs=floorSummaries();
    const plan=pdfPagePlan();
    const listNosFor=floorId=>plan.filter(p=>p.kind==='list'&&(floorId===undefined||p.floorId===floorId)).map(p=>p.pageNo);
    const totalPages=plan[0]?plan[0].total:1;
    let pages=[];
    if(fs.rows.length<=1){
      const draw=plan.find(p=>p.kind==='drawing');
      pages=[await renderPdfDrawingPage(null,draw&&draw.pageNo,totalPages),
        ...await renderPdfListPages(null,listNosFor(),totalPages)];
    }else{
      toast(L('正在生成多楼层 PDF…'));
      for(const row of fs.rows){
        await withFloor(row.id, async()=>{
          const draw=plan.find(p=>p.kind==='drawing'&&p.floorId===row.id);
          pages.push(await renderPdfDrawingPage(row.name,draw&&draw.pageNo,totalPages));
          pages.push(...await renderPdfListPages(row.name,listNosFor(row.id),totalPages));
        });
      }
    }
    const buf=ensureVendor('Pdf').buildImagePdf(pages);
    downloadBlob(new Blob([buf],{type:'application/pdf'}),safeName()+'.pdf');
    const msg=fs.rows.length>1
      ? L('多楼层 PDF 已导出：{floors} 层 / {pages} 页',{floors:fs.rows.length,pages:pages.length})
      : L('PDF 已导出：图纸 1 页 + 清单 {n} 页',{n:pages.length-1});
    toast(msg,'success');
  }catch(e){ toast(L('PDF 生成失败：{msg}',{msg:e.message}),'error'); }
}

/* -------------------- 打印 / PDF 报告 -------------------- */
/** 对象清单页（每层独立分页，超 180 行截断并提示）；列布局取自 io-fields.js */
function reportListPageHtml(rows,title){
  return `<div class="report-page" style="padding:24px;color:#111;font-family:'Microsoft YaHei',Arial,sans-serif">
      <h2>${esc(title)}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr>${REPORT_LIST_COLS.map(c=>`<th style="border:1px solid #999;padding:4px;background:#eee">${esc(L(c))}</th>`).join('')}</tr></thead>
        <tbody>${rows.slice(0,180).map(r=>`<tr>${REPORT_LIST_COLS.map(c=>`<td style="border:1px solid #ccc;padding:4px">${esc(c==='对象类型'?L(r[c]):r[c])}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
      ${rows.length>180?`<p style="color:#666">${esc(L('清单超过 180 行，已在打印版截断；完整数据请导出 JSON/CSV。'))}</p>`:''}
    </div>`;
}
/** 楼层汇总表（全部楼层；与统计页签共用 floorSummaries 的口径） */
function reportFloorSummaryTableHtml(fs){
  const floorCols=['楼层','对象','点设备','区域','折线','总长','总面积'];
  const cell=(v,align)=>`<td style="border:1px solid #ccc;padding:4px${align?';text-align:right':''}">${v}</td>`;
  return `<table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr>${floorCols.map(c=>`<th style="border:1px solid #999;padding:4px;background:#eee">${esc(L(c))}</th>`).join('')}</tr></thead>
      <tbody>
        ${fs.rows.map(r=>`<tr><td style="border:1px solid #ccc;padding:4px">${esc(r.name)}${r.active?' ★':''}</td>${cell(r.count,1)}${cell(r.counts.point,1)}${cell(r.counts.rect,1)}${cell(r.counts.line,1)}${cell(fmt(r.len)+' m',1)}${cell(fmt(r.area)+' ㎡',1)}</tr>`).join('')}
        <tr style="font-weight:700;background:#f3f4f6">${cell(esc(L('全楼合计')))}${cell(fs.total.count,1)}${cell(fs.total.counts.point,1)}${cell(fs.total.counts.rect,1)}${cell(fs.total.counts.line,1)}${cell(fmt(fs.total.len)+' m',1)}${cell(fmt(fs.total.area)+' ㎡',1)}</tr>
      </tbody></table>`;
}
/** 单层图纸页（标题含楼层名） */
function reportFloorPageHtml(name,img){
  const counts={point:0,rect:0,line:0,text:0,dimension:0};
  state.objects.forEach(o=>{ counts[o.kind]=(counts[o.kind]||0)+1; });
  const area=state.objects.reduce((s,o)=>s+objectArea(o),0);
  const len=state.objects.reduce((s,o)=>s+objectLength(o),0);
  const issues=findIssues();
  return `<div class="report-page" style="padding:24px;color:#111;font-family:'Microsoft YaHei',Arial,sans-serif">
      <h1 style="margin:0 0 8px">${esc(state.meta.name)} - ${esc(name)}</h1>
      <div style="color:#555;margin-bottom:14px">${esc(L('生成时间：'))}${new Date().toLocaleString()} ｜ ${esc(siteDescription())}</div>
      <img src="${img}" style="width:100%;max-height:58vh;object-fit:contain;border:1px solid #ccc">
      <h2>${esc(L('统计摘要'))}</h2>
      <p>${esc(L('对象总数：'))}${state.objects.length} ｜ ${esc(L('点设备：'))}${counts.point} ｜ ${esc(L('区域：'))}${counts.rect} ｜ ${esc(L('折线：'))}${counts.line}</p>
      <p>${esc(L('标注总长：'))}${fmt(len)} m ｜ ${esc(L('区域总面积：'))}${fmt(area)} ㎡</p>
      <p>${esc(L('几何检查：'))}${issues.length?issues.length+' '+L('项提示'):L('未发现明显问题')}</p>
      ${issues.map(x=>`<div>• ${esc(x)}</div>`).join('')}
    </div>`;
}
$('printBtn').onclick=async()=>{
  if(window.__printingReport) return;
  window.__printingReport=true;
  try{
    const fs=floorSummaries();
    if(fs.rows.length<=1){
      const rows=objectRows(), issues=findIssues(), img=renderToDataURL(1.5);
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
        ${reportListPageHtml(rows,L('对象清单'))}`;
    }else{
      toast(L('正在生成多楼层报告…'));
      const pages=[`<div class="report-page" style="padding:24px;color:#111;font-family:'Microsoft YaHei',Arial,sans-serif">
          <h1 style="margin:0 0 8px">${esc(state.meta.name)} - ${esc(L('图纸标注报告'))}</h1>
          <div style="color:#555;margin-bottom:14px">${esc(L('生成时间：'))}${new Date().toLocaleString()} ｜ ${fs.rows.length} ${esc(L('层'))}</div>
          <h2>${esc(L('统计摘要（全部楼层）'))}</h2>
          <p>${esc(L('对象总数：'))}${fs.total.count} ｜ ${esc(L('点设备：'))}${fs.total.counts.point} ｜ ${esc(L('区域：'))}${fs.total.counts.rect} ｜ ${esc(L('折线：'))}${fs.total.counts.line}</p>
          <p>${esc(L('标注总长：'))}${fmt(fs.total.len)} m ｜ ${esc(L('区域总面积：'))}${fmt(fs.total.area)} ㎡</p>
          <h2>${esc(L('楼层汇总'))}</h2>
          ${reportFloorSummaryTableHtml(fs)}
          <p style="color:#666">${esc(L('每层图纸与对象清单见后；几何检查按层列出。'))}</p>
        </div>`];
      for(const row of fs.rows){
        await withFloor(row.id, ()=>{
          const img=renderToDataURL(1.2);
          pages.push(reportFloorPageHtml(row.name,img));
          pages.push(reportListPageHtml(objectRows(),row.name+' — '+L('对象清单')));
        });
      }
      $('report').innerHTML=pages.join('');
    }
    window.print();
  }catch(e){
    toast(L('报告生成失败：{msg}',{msg:e.message}),'error');
  }finally{
    window.__printingReport=false;
  }
};
