/* ghost.js —— 会话级幽灵参考层（G-1/G-2）：本地图片或 PDF 第 1 页光栅图，
   叠在底图之上、业务对象之下。只活在 ghostLayer 里，不进 state/JSON/协作/导出。 */
let ghostLayer=null;   /* {canvas,x,y,wm,hm,opacity,sig}；x,y=世界左下角，wm/hm=世界尺寸 */

/** 静态层签名项：任一参数变化必须重建，否则留残影 */
function ghostSig(){
  const g=ghostLayer;
  return g?[g.sig,g.x,g.y,g.wm,g.hm,g.opacity].join('|'):'0';
}
/** 把幽灵图按世界矩形画到画布（只由静态层调用；导出路径不调用） */
function ghostPaint(c,v,toS){
  const g=ghostLayer;
  if(!g||!(g.opacity>0)) return;
  const a=toS([g.x,g.y+g.hm]);   /* 画布行 0 在图像顶部 */
  c.save(); c.globalAlpha=g.opacity;
  c.drawImage(g.canvas,a[0],a[1],g.wm*v.zoom,g.hm*v.zoom);
  c.restore();
}
function ghostClear(){
  if(!ghostLayer) return;
  ghostLayer=null; invalidateStatic(); requestRender();
}
/** 载入参考图：图片直接解码；PDF 取第 1 页（矢量按折线/文字重绘，扫描件用整页内嵌图） */
async function ghostLoadFile(file){
  if(!file) return;
  let canvas=null;
  try{
    canvas=/\.pdf$/i.test(file.name||'')?await ghostRasterPdf(file):await ghostRasterImage(file);
  }catch(e){ return toast(L('导入失败：{msg}',{msg:e&&e.message||e}),'error'); }
  if(canvas) ghostSet(canvas);
}
async function ghostRasterImage(file){
  const url=URL.createObjectURL(file);
  try{
    const img=await loadImageSrc(url);
    const k=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight));
    const c=document.createElement('canvas');
    c.width=Math.max(1,Math.round(img.naturalWidth*k)); c.height=Math.max(1,Math.round(img.naturalHeight*k));
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    return c;
  }finally{ URL.revokeObjectURL(url); }
}
async function ghostRasterPdf(file){
  const pdf=await ensureVendor('PdfRead').parsePdf(await file.arrayBuffer());
  const p=(pdf.pages&&pdf.pages[0])||null;
  const pw=Number(p?p.width:pdf.pageWidth), ph=Number(p?p.height:pdf.pageHeight);
  if(!(pw>0&&ph>0)) throw new Error('PDF 页面尺寸无效');
  const k=Math.min(2,2400/Math.max(pw,ph));
  const c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(pw*k)); c.height=Math.max(1,Math.round(ph*k));
  const g=c.getContext('2d');
  g.fillStyle='#fff'; g.fillRect(0,0,c.width,c.height);
  const paths=(p?p.paths:pdf.paths)||[], texts=(p?p.texts:pdf.texts)||[], imgs=pdf.images||[];
  if(!paths.length&&!texts.length&&imgs.length){   /* 扫描件：按整页铺满（够做对位参考） */
    const rec=imgs[0], url=URL.createObjectURL(new Blob([rec.bytes],{type:rec.mime||'image/png'}));
    try{ g.drawImage(await loadImageSrc(url),0,0,c.width,c.height); }
    finally{ URL.revokeObjectURL(url); }
    return c;
  }
  g.save(); g.scale(k,-k); g.translate(0,-ph);   /* PDF 原点在左下、Y 向上 */
  g.lineWidth=0.7; g.strokeStyle='#1f2937';
  paths.forEach(path=>{
    const pts=path.points||[];
    if(pts.length<2) return;
    g.beginPath(); g.moveTo(pts[0][0],pts[0][1]);
    for(let i=1;i<pts.length;i++) g.lineTo(pts[i][0],pts[i][1]);
    if(path.closed) g.closePath();
    if(path.filled){ g.fillStyle='rgba(100,116,139,0.35)'; g.fill(); }
    g.stroke();
  });
  g.fillStyle='#111827';
  texts.forEach(t=>{
    const s=String(t.text||'').trim();
    if(!s) return;
    g.font=(Number(t.size)||10)+'px sans-serif';
    g.fillText(s,t.x,t.y);
  });
  g.restore();
  return c;
}
/** 落位：有未仿射图片底图时与其重合；否则按当前视图等比居中 */
function ghostSet(canvas){
  const bg=state.background||{};
  const onBg=bg.kind==='image'&&!bg.transform&&Number(bg.width)>0&&Number(bg.height)>0&&Number(bg.metersPerPixel)>0;
  let x,y,wm,hm;
  if(onBg){ x=0; y=0; wm=bg.width*bg.metersPerPixel; hm=bg.height*bg.metersPerPixel; }
  else{
    const R=visibleWorldRect(state.viewport,worldDims(),wrap.clientWidth,wrap.clientHeight,0);
    wm=R.maxX-R.minX; hm=R.maxY-R.minY;
    const ar=canvas.width/canvas.height;
    if(wm/hm>ar) hm=wm/ar; else wm=hm*ar;
    x=R.minX+(R.maxX-R.minX-wm)/2; y=R.minY+(R.maxY-R.minY-hm)/2;
  }
  ghostLayer={canvas,x,y,wm,hm,opacity:.5,sig:Date.now().toString(36)};
  invalidateStatic(); requestRender();
}
