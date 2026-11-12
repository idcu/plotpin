/* ghost.js —— 会话级参考层：幽灵图（G-1/G-2）与图纸修订参照版（V-5）。
   两者都只活在运行时变量里，不进 state/JSON/协作/导出，灭失即释放。
   参照版复用同一条静态层签名 + 同一个 drawObject 渲染路径，不另建缓存/通道。 */
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

/* -------------------- V-5 图纸修订参照版（双版对比） --------------------
   rRef 只存活在运行时：参照工程（已清洗）+ 按楼层分组对象 + 标定/差异结论。
   不写 state/JSON/协作/导出；revClear 置 null 即释放。
   rOp=不透明度，rBl={on,phase,timer}=闪烁（1 Hz 相位交替）。 */
let rRef=null;
let rOp=.45;
let rBl={on:false,phase:false,timer:0};
let rSeq=0;
/** 静态层签名：参照版（内容/不透明度/闪烁相位任一变化必须重建；幽灵图由 sceneStaticKey 另计） */
function refSig(){
  return rRef?rRef.sig+','+rOp+','+(rBl.on?+rBl.phase:'-'):'0';
}
/** 按当前楼层取参照对象（载入时已分组，绘制 O(1)） */
function revPaint(c,v,toS,ib,eg,view){
  if(!rRef||rOp<=0||(rBl.on&&!rBl.phase)) return;   /* 相位 A 只留当前工程 */
  const b={minX:0,minY:0,maxX:0,maxY:0};
  const list=rRef.byFloor.get(state.activeFloorId)||rRef.byFloor.get(rRef.data.activeFloorId)||[];
  c.save(); c.globalAlpha=rOp;
  list.forEach(o=>{
    if(o.visible!==false&&boundsIntersect(objectSnapBounds(o,b),view)) drawObject(c,o,v,toS,ib,eg);
  });
  c.restore();
}
/** 标定判定（纯函数）：只比图片底图三要素，不猜、不自动对位。
 *  mode: same 一致 / scale 比例不一致 / canvas 画布或原点不一致 / none 两侧均无图片底图 */
function revCalibCheck(cur,ref){
  const bg=x=>x&&x.background&&x.background.kind==='image'&&!x.background.transform?x.background:null;
  const a=bg(cur),b=bg(ref);
  if(!a||!b) return {mode:a||b?'canvas':'none'};
  const am=+a.metersPerPixel||0,bm=+b.metersPerPixel||0;
  if(!(am>0&&bm>0)||+a.width!==+b.width||+a.height!==+b.height) return {mode:'canvas',am,bm};
  const rel=Math.abs(am-bm)/Math.max(am,bm);
  return {mode:rel>1e-3?'scale':'same',am,bm};
}
/** 按当前工程重算标定与差异（载入/打开面板时调用，不沿用旧结论） */
function revDiff(){
  if(!rRef) return;
  const cur=persistableState();
  rRef.calib=revCalibCheck(cur,rRef.data);
  rRef.diff=diffSnapshots(cur,rRef.data);
  setDiffOverlay(true,rRef.diff.items.slice(0,DIFF_ITEM_MAX),{aId:'',bId:rRef.label});
}
/** 载入已清洗的参照工程数据；无可用对象直接拒绝并提示 */
function revLoad(data,label){
  const n=countProjectObjects(data);
  if(!n){ toast(L('参照版为空'),'warn'); return; }
  const byFloor=new Map(),add=(id,list)=>{
    if(id&&list) byFloor.set(id,(byFloor.get(id)||[]).concat(list));
  };
  add(data.activeFloorId||'floor.default',data.objects);
  (data.floors||[]).forEach(f=>add(f.id,f.objects));
  byFloor.forEach(l=>l.sort((a,b)=>(a.z||0)-(b.z||0)));
  rRef={data,label:String(label||''),byFloor,sig:++rSeq};
  revDiff();
  const m=rRef.calib.mode;
  if(m==='scale'||m==='canvas') toast(revInfoText().split('\n')[1],'warn');   /* 标定不一致必须可见 */
}
/** 来源：另一工程的 JSON（与导入同一套 schema 校验/清洗，但不替换现场） */
async function revFile(file){
  if(!file) return;
  try{
    const p=JSON.parse(await file.text());
    if(!isReadableSchema(p.schema)) throw new Error(L('不是工程 JSON'));
    revLoad(buildProject(p),file.name);
  }catch(e){ toast(L('参照版加载失败：{msg}',{msg:e&&e.message||e}),'error'); }
}
/** 闪烁（A/B 交替，1 Hz）：相位进静态层签名，每次切换重建一次 */
function revBlinkSet(on){
  clearInterval(rBl.timer);
  rBl.on=!!on&&!!rRef;
  rBl.phase=false;
  if(rBl.on) rBl.timer=setInterval(()=>{
    if(!rBl.on||!rRef) return;
    rBl.phase=!rBl.phase;
    invalidateStatic(); requestRender();
  },500);
  invalidateStatic(); requestRender();
}
/** 清除即释放：停表、置空、撤差异；不触碰 current/快照/工程记录 */
function revClear(){
  if(!rRef&&!rBl.on) return;
  clearInterval(rBl.timer);
  rBl={on:false,phase:false,timer:0};
  rRef=null;                          /* 先置空：clearDiffOverlay 不会把参照差异再叠回来 */
  clearDiffOverlay();
  invalidateStatic(); requestRender();
}
