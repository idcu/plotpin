/* viewport.js —— 屏幕/世界坐标、DPR、缩放平移、网格吸附 */
/* -------------------- 画布视图 / 坐标 -------------------- */
function worldDims(){ return siteDomainOf(state.background); }
function view(){ return state.viewport; }
function w2s(p,v=state.viewport,dims=worldDims()){ return [v.panX+p[0]*v.zoom, v.panY+(dims.h-p[1])*v.zoom]; }
function s2w(p,v=state.viewport,dims=worldDims()){ return [(p[0]-v.panX)/v.zoom, dims.h-(p[1]-v.panY)/v.zoom]; }
function resizeCanvas(){
  const r=wrap.getBoundingClientRect();
  dpr=window.devicePixelRatio||1;
  canvas.width=Math.max(1,Math.round(r.width*dpr));
  canvas.height=Math.max(1,Math.round(r.height*dpr));
  canvas.style.width=r.width+'px'; canvas.style.height=r.height+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  requestRender();
}
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
