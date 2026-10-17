/* viewport.js —— 屏幕/世界坐标、DPR、缩放平移、网格吸附 */
/* -------------------- 画布视图 / 坐标 -------------------- */
/**
 * 世界坐标取景框（米）：矢量场地/未校准图片规整在第一象限 (0,0)-(w,h)；
 * 仿射校准后的图片四角可为任意平行四边形，取其轴对齐包围框（min 允许负值）。
 * w2s/s2w 统一以该框为基准，保证旋转底图与对象、网格、交互仍共用同一坐标链路。
 */
function worldFrame(){
  const bg=state.background;
  if(bg&&bg.kind==='image'){
    const f=imageWorldFrame(bg);
    if(f) return f;
  }
  const d=siteDomainOf(bg);
  return {minX:0,minY:0,maxX:d.w,maxY:d.h,w:d.w,h:d.h};
}
function worldDims(){ return worldFrame(); }
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
  const r=wrap.getBoundingClientRect(), d=worldDims();
  const z=Math.min((r.width-44)/d.w,(r.height-44)/d.h);
  state.viewport.zoom=z;
  state.viewport.panX=(r.width-d.w*z)/2;
  state.viewport.panY=(r.height-d.h*z)/2;
  requestRender(); updateZoomLabel();
}
function zoomAt(cx,cy,factor){
  const v=state.viewport, nz=Math.max(.02,Math.min(200,v.zoom*factor));
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
