/* viewport.js —— 屏幕/世界坐标、DPR、缩放平移、网格吸附 */
/* -------------------- 画布视图 / 坐标 -------------------- */
/**
 * 世界坐标取景框（米）：图片四角轴对齐框 ∪ 矢量场地实际包围盒。
 * 双槽共存时取景框覆盖两者，保证切换/缩放时两张图层都在视野内；
 * 两者都无时回退默认 100×70。w2s/s2w 仍共用同一基准，网格/对象/交互坐标链路不变。
 */
function computeWorldFrame(){
  const frames=[];
  const bg=state.background;
  if(isImageBackground(bg)){
    const f=imageWorldFrame(bg);
    if(f) frames.push(f);
    else if(Number(bg.width)>0&&Number(bg.height)>0){
      const m=positiveNumber(bg.metersPerPixel,0.1);
      const w=Math.max(.01,Number(bg.width)*m), h=Math.max(.01,Number(bg.height)*m);
      frames.push({minX:0,minY:0,maxX:w,maxY:h,w,h});
    }
  }
  const site=state.site;
  if(site&&siteIsVisible(site)) frames.push(siteBounds(site));
  if(!frames.length) return {minX:0,minY:0,maxX:100,maxY:70,w:100,h:70};
  if(frames.length===1) return frames[0];
  const minX=Math.min(...frames.map(f=>f.minX)), minY=Math.min(...frames.map(f=>f.minY));
  const maxX=Math.max(...frames.map(f=>f.maxX)), maxY=Math.max(...frames.map(f=>f.maxY));
  return {minX,minY,maxX,maxY,w:Math.max(.01,maxX-minX),h:Math.max(.01,maxY-minY)};
}
/* 当前取景框缓存：随场地形状变更经 syncFramePan/resetFrameRef 显式刷新。
   缓存可避免每次 w2s 重复计算（扇形弧采样），更重要的是让同一交互帧内的坐标映射保持稳定。 */
let _frameRef=null;
function worldFrame(){ return _frameRef || (_frameRef=computeWorldFrame()); }
function worldDims(){ return worldFrame(); }
/** 重新按实际形状计算取景框并刷新缓存（fitView/载入/撤销重做后调用） */
function resetFrameRef(){ _frameRef=computeWorldFrame(); return _frameRef; }
/**
 * 场地形状变更后调用：取景框随实际包围盒变化时，用 pan 差值补偿，
 * 使视野中未被拖拽/编辑的内容保持屏幕位置不动（拖拽中的节点仍跟随光标）。
 */
function syncFramePan(){
  const old=_frameRef||computeWorldFrame(), next=computeWorldFrame();
  const z=state.viewport.zoom||1;
  state.viewport.panX+=(next.minX-old.minX)*z;
  state.viewport.panY-=(next.maxY-old.maxY)*z;
  _frameRef=next; return next;
}
function view(){ return state.viewport; }
function w2s(p,v=state.viewport,f=worldFrame()){ return [v.panX+(p[0]-f.minX)*v.zoom, v.panY+(f.maxY-p[1])*v.zoom]; }
function s2w(p,v=state.viewport,f=worldFrame()){ return [(p[0]-v.panX)/v.zoom+f.minX, f.maxY-(p[1]-v.panY)/v.zoom]; }
function resizeCanvas(){
  const r=wrap.getBoundingClientRect();
  dpr=window.devicePixelRatio||1;
  canvas.width=Math.max(1,Math.round(r.width*dpr));
  canvas.height=Math.max(1,Math.round(r.height*dpr));
  canvas.style.width=r.width+'px'; canvas.style.height=r.height+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  requestRender();
}
/* 窗口尺寸/DPR 变化时重建画布位图（rAF 合并，避免拖动窗口过程中频繁重建） */
let resizeQueued=false;
window.addEventListener('resize',()=>{
  if(resizeQueued) return;
  resizeQueued=true;
  requestAnimationFrame(()=>{ resizeQueued=false; resizeCanvas(); });
});
function fitView(){
  const r=wrap.getBoundingClientRect(), d=resetFrameRef();
  let z=Math.min((r.width-44)/d.w,(r.height-44)/d.h);
  z=Number.isFinite(z)?Math.max(APP_LIMITS.ZOOM_MIN,Math.min(APP_LIMITS.ZOOM_MAX,z)):1;
  state.viewport.zoom=z;
  state.viewport.panX=(r.width-d.w*z)/2;
  state.viewport.panY=(r.height-d.h*z)/2;
  requestRender(); updateZoomLabel();
}
function zoomAt(cx,cy,factor){
  const v=state.viewport, nz=Math.max(APP_LIMITS.ZOOM_MIN,Math.min(APP_LIMITS.ZOOM_MAX,v.zoom*factor));
  v.panX=cx-(cx-v.panX)*(nz/v.zoom);
  v.panY=cy-(cy-v.panY)*(nz/v.zoom);
  v.zoom=nz; requestRender(); updateZoomLabel();
}
function updateZoomLabel(){ $('zoomLabel').textContent=Math.round(state.viewport.zoom*100)+'%'; }
function niceStep(targetMeters){
  const pow=Math.pow(10,Math.floor(Math.log10(targetMeters)));
  const n=targetMeters/pow;
  const f=n<2?1:n<5?2:5;
  return f*pow;
}
/** 显示网格步长：吸附步长的整数倍，保证每条网格线都落在可吸附坐标上。
 *  目标屏幕间距 minPx（默认 45px）；放大时按吸附步长的整数倍收敛，最小为吸附步长本身。 */
function gridDisplayStep(zoom,gridSize,minPx){
  const g=Math.max(.01,Number(gridSize)||1), z=Math.max(1e-6,Number(zoom)||1);
  return g*Math.max(1,Math.ceil((Number(minPx)||45)/(g*z)));
}
function snapPoint(p,byKey){
  if(!state.settings.snap || byKey?.shiftKey) return p;
  const g=state.settings.gridSize||1;
  return [Math.round(p[0]/g)*g,Math.round(p[1]/g)*g];
}
function pointerWorld(e){
  const r=canvas.getBoundingClientRect();
  return s2w([e.clientX-r.left,e.clientY-r.top]);
}
function pointerScreen(e){
  const r=canvas.getBoundingClientRect();
  return [e.clientX-r.left,e.clientY-r.top];
}
