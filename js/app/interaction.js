/* interaction.js —— 工具/指针交互、对象操作、快捷键、关闭落盘、拖拽导入 */
/* -------------------- 工具与指针交互 -------------------- */
function setTool(tool){
  currentTool=tool; draft=null; calibPoints=[]; rubber=null; drag=null;
  lastCanvasHandledAt=0; lastCanvasPointerUpAt=0;
  document.body.className='tool-'+tool+(spaceDown?' panning':'');
  document.querySelectorAll('.tool-btn[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
  const titles={
    select:'选择：点击对象，框选多个对象',pan:'平移：拖拽移动画布',point:'点设备：单击放置',
    rect:'区域：在上方选择矩形/圆形/椭圆/扇形后，按住左键拖画，Esc 取消',line:'折线：逐点单击，双击/Enter 完成，Esc 取消（勾选闭合可画三角形/多边形）',
    text:'文字：单击输入文字内容',dimension:'尺寸标注：按所选类型逐点单击',calibrate:'比例尺：依次点击图上两个已知点',
    'site-rect':'绘制矩形场地：按住左键拖出场地对角，松开完成，Esc 取消',
    'site-circle':'绘制圆形场地：按住左键从圆心拖出半径，松开完成，Esc 取消',
    'site-ellipse':'绘制椭圆场地：按住左键拖出包围盒（外接矩形），松开完成，Esc 取消',
    'site-sector':'绘制扇形场地：按住左键从圆心拖出半径，松开后输入起止角，Esc 取消',
    'site-polygon':'绘制多边形场地：沿边界逐点单击，双击/Enter 或点左侧✓闭合，Esc 取消'
  };
  $('toolTitle').textContent=titles[tool]||'';
  requestRender();
}
let lastCanvasHandledAt=0, lastCanvasPointerUpAt=0;
canvas.addEventListener('pointerdown',e=>{
  lastCanvasHandledAt=performance.now();
  if(e.pointerId!==undefined && e.pointerId>=0) canvas.setPointerCapture(e.pointerId);
  const sp=pointerScreen(e), wp=snapPoint(pointerWorld(e),e);
  if(e.button===1||e.button===2||spaceDown||currentTool==='pan'){
    drag={type:'pan',start:sp,pan:deepClone(state.viewport)}; document.body.classList.add('panning'); e.preventDefault(); return;
  }
  if(currentTool==='calibrate'){
    if(calibPoints.length>=2) return;
    calibPoints.push(pointerWorld(e));
    if(calibPoints.length===2) finishCalibration();
    requestRender(); return;
  }
  if(['site-rect','site-circle','site-ellipse','site-sector'].includes(currentTool)){
    const kindMap={'site-rect':'siteRect','site-circle':'siteCircle','site-ellipse':'siteEllipse','site-sector':'siteSector'};
    draft={kind:kindMap[currentTool],start:wp,current:wp,pending:true};
    requestRender(); return;
  }
  if(currentTool==='site-polygon'){
    if(!draft) draft={kind:'sitePolygon',points:[wp],current:wp};
    else draft.points.push(wp);
    requestRender(); return;
  }
  if(currentTool==='select'){
    const h=handleAt(wp,sp);
    if(h){
      pushHistory();
      drag={type:h.type,handle:h,id:h.object.id,start:wp,original:deepClone(h.object)};
      return;
    }
    const o=hitObject(wp,sp);
    if(o){
      if(isEditable(o)){
        if(e.shiftKey){ selectedIds.has(o.id)?selectedIds.delete(o.id):selectedIds.add(o.id); }
        else if(!selectedIds.has(o.id)){ selectedIds.clear(); selectedIds.add(o.id); }
        drag={type:'move',start:wp,originals:new Map(),moved:false};
        selectedIds.forEach(id=>{ const obj=state.objects.find(x=>x.id===id); if(obj&&isEditable(obj)) drag.originals.set(id,deepClone(obj)); });
      }else{
        selectedIds.clear(); selectedIds.add(o.id);
      }
      refreshUI(); requestRender(); return;
    }
    if(!e.shiftKey) selectedIds.clear();
    rubber={a:sp,b:sp}; refreshUI(); requestRender(); return;
  }
  if(currentTool==='point'){
    pushHistory();
    const typeId=$('pointType').value || 'point.marker';
    const o=baseObject('point',typeId,{x:wp[0],y:wp[1],angle:0});
    state.objects.push(o); selectedIds.clear(); selectedIds.add(o.id); commitChange('已添加点设备');
    switchTab('props'); return;
  }
  if(currentTool==='rect'){
    const shape=$('areaShape')?.value||'rect';
    const draftKind={rect:'rect',circle:'areaCircle',ellipse:'areaEllipse',sector:'areaSector'}[shape]||'rect';
    if(draft && draft.kind===draftKind){
      draft.current=wp; draft.pending=false; finishDraft();
    }else{
      draft={kind:draftKind,start:wp,current:wp,pending:true,typeId:$('rectType').value,a0:0,a1:shape==='sector'?90:undefined};
    }
    return;
  }
  if(currentTool==='line'){
    if(!draft){ draft={kind:'line',points:[wp],current:wp}; }
    else draft.points.push(wp);
    requestRender(); return;
  }
  if(currentTool==='dimension'){
    const subtype=$('dimensionType').value;
    if(!draft){ draft={kind:'dimension',subtype,points:[wp],current:wp}; }
    else draft.points.push(wp);
    if((subtype==='distance'&&draft.points.length>=2)||(subtype==='angle'&&draft.points.length>=3)) finishDraft();
    else requestRender();
    return;
  }
  if(currentTool==='text'){
    showPrompt({title:'添加文字',label:'文字内容',value:'标注文字'}).then(text=>{
      if(text===null) return;
      pushHistory();
      const o=baseObject('text',null,{x:wp[0],y:wp[1],text,height:2.2,style:{color:'#111827'}});
      o.typeId='text.builtin'; if(!state.objectTypes.some(t=>t.id===o.typeId)) state.objectTypes.push({id:'text.builtin',kind:'text',name:'文字',color:'#111827',icon:'text',builtin:true});
      state.objects.push(o); selectedIds.clear(); selectedIds.add(o.id); commitChange('已添加文字'); switchTab('props');
    });
  }
});
canvas.addEventListener('pointermove',e=>{
  const sp=pointerScreen(e), wp=snapPoint(pointerWorld(e),e);
  $('coordText').textContent='鼠标：'+fmt(wp[0])+', '+fmt(wp[1])+' '+state.settings.unit;
  if(drag?.type==='pan'){
    state.viewport.panX=drag.pan.panX+sp[0]-drag.start[0];
    state.viewport.panY=drag.pan.panY+sp[1]-drag.start[1];
    requestRender(); updateZoomLabel(); return;
  }
  if(drag?.type==='move'){
    if(!drag.moved){ pushHistory(); drag.moved=true; }
    const d=[wp[0]-drag.start[0],wp[1]-drag.start[1]];
    drag.originals.forEach((orig,id)=>{ moveObjectBy(state.objects.find(o=>o.id===id),orig,d); });
    requestRender(); return;
  }
  if(drag?.type==='node'){
    const o=state.objects.find(x=>x.id===drag.id); if(o){ o.points[drag.handle.index]=wp; syncFirstPoint(o); requestRender(); } return;
  }
  if(drag?.type==='rotate'){
    const o=state.objects.find(x=>x.id===drag.id); if(!o) return;
    let deg=Math.atan2(wp[1]-o.y,wp[0]-o.x)*180/Math.PI;
    if(drag.handle.kind!=='pointRotate') deg-=90;
    o.angle=normalizeAngle(Math.round(deg));
    requestRender(); return;
  }
  if(drag?.type==='rect'){
    resizeRectByHandle(state.objects.find(x=>x.id===drag.id),drag,wp);
    requestRender(); return;
  }
  if(drag?.type==='shapeHandle'){
    resizeShapeByHandle(state.objects.find(x=>x.id===drag.id),drag.handle,wp);
    requestRender(); return;
  }
  if(draft && draft.points){ draft.current=wp; requestRender(); }
  if(draft && ['rect','siteRect','siteCircle','siteEllipse','siteSector','areaCircle','areaEllipse','areaSector'].includes(draft.kind)){
    draft.current=wp; if(draft.kind==='rect'&&e.buttons===1) draft.pending=false; requestRender();
  }
  if(rubber){ rubber.b=sp; requestRender(); }
});
canvas.addEventListener('pointerup',e=>{
  if(!e.synthetic) lastCanvasPointerUpAt=performance.now();
  if(drag?.type==='pan'){ drag=null; document.body.classList.remove('panning'); return; }
  if(drag && ['move','node','rotate','rect','shapeHandle'].includes(drag.type)){
    const changed=state.objects.some(o=>drag.originals?.has(o.id) || o.id===drag.id);
    drag=null;
    if(changed) commitChange(); else refreshUI();
    return;
  }
  if(draft && draft.kind==='rect' && draft.pending===false){ finishDraft(); return; }
  if(draft && ['areaCircle','areaEllipse','areaSector'].includes(draft.kind)){ finishDraft(); return; }
  if(draft && ['siteRect','siteCircle','siteEllipse','siteSector'].includes(draft.kind)){ finishSiteDraft(); return; }
  if(rubber){
    const min=s2w([Math.min(rubber.a[0],rubber.b[0]),Math.max(rubber.a[1],rubber.b[1])]);
    const max=s2w([Math.max(rubber.a[0],rubber.b[0]),Math.min(rubber.a[1],rubber.b[1])]);
    const rb={minX:min[0],maxX:max[0],minY:min[1],maxY:max[1]};
    if(Math.abs(rubber.b[0]-rubber.a[0])>4||Math.abs(rubber.b[1]-rubber.a[1])>4){
      if(!e.shiftKey) selectedIds.clear();
      state.objects.forEach(o=>{ if(isVisible(o)&&boundsIntersect(objectBounds(o),rb)) selectedIds.add(o.id); });
    }
    rubber=null; refreshUI(); requestRender();
  }
});
canvas.addEventListener('pointercancel',()=>{ drag=null; rubber=null; document.body.classList.remove('panning'); requestRender(); });
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('dblclick',e=>{
  if(draft&&draft.kind==='sitePolygon') finishSiteDraft();
  else if(draft && draft.points && draft.points.length>1) finishDraft();
  else editLineNodeByDoubleClick(e);
});
/** 选择工具下双击折线：点中节点→删除；点中线段→在该处插入节点（吸附生效） */
function editLineNodeByDoubleClick(e){
  if(currentTool!=='select'||selectedIds.size!==1) return;
  const o=state.objects.find(x=>x.id===Array.from(selectedIds)[0]);
  if(!o||o.kind!=='line'||!isEditable(o)||o.points.length<2) return;
  const wp=snapPoint(pointerWorld(e),e), tol=9/state.viewport.zoom;
  let ni=-1;
  o.points.forEach((p,i)=>{ if(dist(p,wp)<=tol) ni=i; });
  if(ni>=0){
    if(o.points.length<=lineMinNodes(o)){ toast(`至少保留 ${lineMinNodes(o)} 个节点`,'warn'); return; }
    pushHistory(); removeLineNode(o,ni); commitChange('已删除节点');
    return;
  }
  let best=null;
  const segN=o.closed?o.points.length:o.points.length-1;
  for(let k=0;k<segN;k++){
    const a=o.points[k], b=o.points[(k+1)%o.points.length];
    const dd=distanceToSegment(wp,a,b);
    if(dd<=tol&&(!best||dd<best.d)) best={k,d:dd,a,b};
  }
  if(best){
    /* 取双击点在线段上的垂足，再做网格吸附，保证新节点在线段上而非点击处 */
    const foot=nearestPointOnSegment(wp,best.a,best.b);
    pushHistory(); insertLineNode(o,best.k,snapPoint(foot,e)); commitChange('已插入节点');
  }
}
function moveObjectBy(o,orig,d){
  if(!o) return;
  o.x=orig.x+d[0]; o.y=orig.y+d[1];
  if(o.points && o.points.length) o.points=orig.points.map(p=>[p[0]+d[0],p[1]+d[1]]);
  o.updatedAt=nowISO();
}
function syncFirstPoint(o){ if(o.points&&o.points.length){ o.x=o.points[0][0]; o.y=o.points[0][1]; } }
function resizeRectByHandle(o,drag,p){
  if(!o) return;
  const orig=drag.original, idx=drag.handle.index;
  const local=rotatePoint(p,[orig.x,orig.y],-orig.angle);
  const corners=[[0,0],[orig.width,0],[orig.width,orig.height],[0,orig.height]];
  const fixed=corners[(idx+2)%4];
  const origin=[Math.min(fixed[0],local[0]),Math.min(fixed[1],local[1])];
  o.width=Math.max(.08,Math.abs(local[0]-fixed[0]));
  o.height=Math.max(.08,Math.abs(local[1]-fixed[1]));
  const worldOrigin=add([orig.x,orig.y],rotatePoint(origin,[0,0],orig.angle));
  o.x=worldOrigin[0]; o.y=worldOrigin[1]; o.updatedAt=nowISO();
}
/** 圆/椭圆/扇形控制点拖拽（世界坐标米） */
function resizeShapeByHandle(o,h,p){
  if(!o||!o.shape) return;
  const sh=o.shape, mode=h.mode;
  if(mode==='arcR'){
    sh.r=Math.max(.05,dist([o.x,o.y],p));
  }else if(mode==='rx'||mode==='ry'){
    const q=rotatePoint(p,[o.x,o.y],-(o.angle||0));
    if(mode==='rx') sh.rx=Math.max(.05,Math.abs(q[0]-o.x));
    else sh.ry=Math.max(.05,Math.abs(q[1]-o.y));
  }else if(mode==='edge0'||mode==='edge1'){
    sh.r=Math.max(.05,dist([o.x,o.y],p));
    const deg=normalizeAngle(Math.atan2(p[1]-o.y,p[0]-o.x)*180/Math.PI);
    if(mode==='edge0') sh.a0=deg; else sh.a1=deg;
  }
  o.updatedAt=nowISO();
}
/** Esc 取消进行中的拖拽：把对象恢复到 pointerdown 前，并弹出当时压入的撤销快照 */
function cancelActiveDrag(){
  if(!drag) return false;
  const d=drag; drag=null;
  document.body.classList.remove('panning');
  if(d.type==='pan') return true;
  if(d.type==='move'){
    if(!d.moved) return true;
    d.originals.forEach((orig,id)=>{ const o=state.objects.find(x=>x.id===id); if(o) Object.assign(o,deepClone(orig)); });
    history.past.pop();
  }else if(['node','rotate','rect','shapeHandle'].includes(d.type)){
    const o=state.objects.find(x=>x.id===d.id);
    if(o && d.original) Object.assign(o,deepClone(d.original));
    history.past.pop();
  }else return true;
  commitChange(); return true;
}
canvas.addEventListener('wheel',e=>{ e.preventDefault(); zoomAt(...pointerScreen(e),e.deltaY<0?1.15:1/1.15); },{passive:false});

/* 兼容只触发 MouseEvent 的自动化工具或旧环境：真实浏览器中 PointerEvent 会先触发，以下事件不会重复执行。 */
let lastRealPointerAt=0;
['pointerdown','pointermove','pointerup','pointercancel'].forEach(type=>{
  canvas.addEventListener(type,e=>{ if(!e.synthetic) lastRealPointerAt=performance.now(); },true);
});
function dispatchSyntheticPointer(type,e){
  if(performance.now()-lastRealPointerAt<300) return;
  const ev=new PointerEvent(type,{
    bubbles:true,cancelable:true,composed:true,pointerId:-1,pointerType:'mouse',isPrimary:true,
    clientX:e.clientX,clientY:e.clientY,screenX:e.screenX,screenY:e.screenY,
    button:e.button,buttons:e.buttons,shiftKey:e.shiftKey,altKey:e.altKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey
  });
  Object.defineProperty(ev,'synthetic',{value:true});
  canvas.dispatchEvent(ev);
}
canvas.addEventListener('mousedown',e=>dispatchSyntheticPointer('pointerdown',e));
canvas.addEventListener('mousemove',e=>dispatchSyntheticPointer('pointermove',e));
canvas.addEventListener('mouseup',e=>dispatchSyntheticPointer('pointerup',e));
canvas.addEventListener('click',e=>{
  const now=performance.now();
  if(now-lastCanvasHandledAt>700 && now-lastCanvasPointerUpAt>700) dispatchSyntheticPointer('pointerdown',e);
});

function finishDraft(){
  if(!draft) return;
  if(draft.kind==='sitePolygon') return finishSiteDraft();
  if(draft.kind==='rect'){
    const a=draft.start,b=draft.current;
    const x=Math.min(a[0],b[0]),y=Math.min(a[1],b[1]),w=Math.abs(a[0]-b[0]),h=Math.abs(a[1]-b[1]);
    if(w>=.08&&h>=.08){
      pushHistory();
      const o=baseObject('rect',draft.typeId||$('rectType').value,{x,y,width:w,height:h});
      state.objects.push(o); selectedIds.clear(); selectedIds.add(o.id); commitChange('已添加区域'); switchTab('props');
    }
  }else if(draft.kind==='areaCircle'){
    const r=dist(draft.start,draft.current);
    if(r>=.08){
      pushHistory();
      const o=baseObject('rect',draft.typeId||$('rectType').value,{x:draft.start[0],y:draft.start[1],shape:{type:'circle',r}});
      state.objects.push(o); selectedIds.clear(); selectedIds.add(o.id); commitChange('已添加圆形区域'); switchTab('props');
    }
  }else if(draft.kind==='areaEllipse'){
    const a=draft.start,b=draft.current;
    const w=Math.abs(a[0]-b[0]),h=Math.abs(a[1]-b[1]);
    if(w>=.08&&h>=.08){
      pushHistory();
      const o=baseObject('rect',draft.typeId||$('rectType').value,
        {x:(a[0]+b[0])/2,y:(a[1]+b[1])/2,shape:{type:'ellipse',rx:w/2,ry:h/2}});
      state.objects.push(o); selectedIds.clear(); selectedIds.add(o.id); commitChange('已添加椭圆区域'); switchTab('props');
    }
  }else if(draft.kind==='areaSector'){
    const r=dist(draft.start,draft.current), a0=Number(draft.a0)||0, a1=Number.isFinite(Number(draft.a1))?Number(draft.a1):a0+90;
    if(r>=.08){
      pushHistory();
      const o=baseObject('rect',draft.typeId||$('rectType').value,
        {x:draft.start[0],y:draft.start[1],shape:{type:'sector',r,a0,a1}});
      state.objects.push(o); selectedIds.clear(); selectedIds.add(o.id); commitChange('已添加扇形区域'); switchTab('props');
    }
  }else if(draft.kind==='line'){
    const ps=draft.points.slice();
    while(ps.length>=2 && dist(ps.at(-1),ps.at(-2))<EPS) ps.pop();
    const closed=$('lineClosed').checked;
    if(ps.length<2){ toast('至少需要 2 个点','warn'); return; }
    if(closed&&ps.length<3){ toast('闭合区域至少需要 3 个点','warn'); return; }
    pushHistory();
    const o=baseObject('line',$('lineType').value,{points:ps,closed,x:ps[0][0],y:ps[0][1]});
    state.objects.push(o); selectedIds.clear(); selectedIds.add(o.id); commitChange(closed?'已添加闭合区域':'已添加折线'); switchTab('props');
  }else if(draft.kind==='dimension'){
    const ps=draft.points;
    if((draft.subtype==='distance'&&ps.length>=2)||(draft.subtype==='angle'&&ps.length>=3)||(draft.subtype==='area'&&ps.length>=3)){
      pushHistory();
      const o=baseObject('dimension',null,{subtype:draft.subtype,points:ps,x:ps[0][0],y:ps[0][1],style:{color:'#111827'}});
      o.name='D'+String(state.objects.length+1).padStart(4,'0');
      state.objects.push(o); selectedIds.clear(); selectedIds.add(o.id); commitChange('已添加尺寸标注'); switchTab('props');
    }
  }
  draft=null; requestRender();
}
/* 场地拖画/描边完成（矩形对角、圆心半径、椭圆包围盒、扇形半径+角度、多边形沿边） */
async function finishSiteDraft(){
  const d=draft; draft=null;
  if(!d){ setTool('select'); return; }
  if(d.kind==='siteRect'){
    const shape=rectShapeFromCorners(d.start,d.current);
    if(shape.w<.5||shape.h<.5){ toast('场地过小（不足 0.5m），可在底图弹窗中直接输入尺寸','warn'); setTool('select'); requestRender(); return; }
    applyVectorSite('rect',shape);
  }else if(d.kind==='siteCircle'){
    const r=dist(d.start,d.current);
    if(r<.5){ toast('半径过小（不足 0.5m），可在底图弹窗中直接输入半径','warn'); setTool('select'); requestRender(); return; }
    applyVectorSite('circle',circleShapeFrom(d.start,r));
  }else if(d.kind==='siteEllipse'){
    const shape=ellipseShapeFromCorners(d.start,d.current);
    if(shape.rx*2<.5||shape.ry*2<.5){ toast('场地过小（不足 0.5m），可在底图弹窗中直接输入半径','warn'); setTool('select'); requestRender(); return; }
    applyVectorSite('ellipse',shape);
  }else if(d.kind==='siteSector'){
    const r=dist(d.start,d.current);
    if(r<.5){ toast('半径过小（不足 0.5m），可在底图弹窗中直接输入半径','warn'); setTool('select'); requestRender(); return; }
    const v=await showPrompt({title:'扇形场地角度',label:'起始角, 张角（度，用逗号分隔），例如 0,90',value:'0,90'});
    if(v===null){ setTool('select'); return; }
    const m=v.split(/[,，\s]+/).map(Number);
    const a0=Number.isFinite(m[0])?m[0]:0, sweep=Number.isFinite(m[1])?m[1]:90;
    if(!(sweep>0)||sweep>360){ toast('张角需在 0–360° 之间','error'); setTool('select'); return; }
    applyVectorSite('sector',sectorShapeFrom(d.start,r,a0,a0+sweep));
  }else if(d.kind==='sitePolygon'){
    const ps=d.points.slice();
    while(ps.length>=2&&dist(ps.at(-1),ps.at(-2))<EPS) ps.pop();
    if(ps.length<3){ toast('多边形场地至少需要 3 个顶点','warn'); setTool('select'); requestRender(); return; }
    applyVectorSite('polygon',polygonShapeFromPoints(ps));
  }else{
    setTool('select'); requestRender();
  }
}
async function finishCalibration(){
  const old=dist(calibPoints[0],calibPoints[1]);
  if(old<EPS){ calibPoints=[]; return; }
  const value=await showPrompt({title:'比例尺校准',label:'两点之间的实际距离（米）',value:fmt(old)});
  if(value===null||Number.isNaN(Number(value))||Number(value)<=0){ calibPoints=[]; setTool('select'); return; }
  pushHistory();
  const factor=Number(value)/old, c=calibPoints[0];
  state.background.metersPerPixel*=factor; state.background.calibrated=true;
  scaleWorldAround(c,factor);
  calibPoints=[]; fitView(); commitChange('比例尺已校准'); setTool('select');
}
function scaleWorldAround(center,factor){
  const mapP=p=>[center[0]+(p[0]-center[0])*factor,center[1]+(p[1]-center[1])*factor];
  state.objects.forEach(o=>{
    if(o.points&&o.points.length) o.points=o.points.map(mapP);
    o.x=center[0]+(o.x-center[0])*factor; o.y=center[1]+(o.y-center[1])*factor;
    o.width*=factor; o.height*=factor;
    if(o.shape){
      if(Number.isFinite(Number(o.shape.r))) o.shape.r*=factor;
      if(Number.isFinite(Number(o.shape.rx))) o.shape.rx*=factor;
      if(Number.isFinite(Number(o.shape.ry))) o.shape.ry*=factor;
    }
    if(o.style?.strokeWidth!==undefined) o.style.strokeWidth=Number(o.style.strokeWidth)*factor;
    syncFirstPoint(o);
  });
}

/* -------------------- 对象操作 -------------------- */
function deleteSelected(){
  const deletable=state.objects.filter(o=>selectedIds.has(o.id)&&isEditable(o));
  if(!deletable.length) return toast('没有可删除的选中对象（可能位于锁定图层）','warn');
  showConfirm(`确定删除选中的 ${deletable.length} 个对象吗？`).then(ok=>{
    if(!ok) return;
    const ids=new Set(deletable.map(o=>o.id));
    pushHistory(); state.objects=state.objects.filter(o=>!ids.has(o.id)); deletable.forEach(o=>selectedIds.delete(o.id)); commitChange('已删除对象');
  });
}
function duplicateSelected(){
  const olds=state.objects.filter(o=>selectedIds.has(o.id)); if(!olds.length) return;
  pushHistory();
  const fresh=[];
  olds.forEach(o=>{
    const n=deepClone(o); n.id=uid('OBJ'); n.name=nextObjectId(); n.x+=1;n.y+=1; if(n.points)n.points=n.points.map(p=>[p[0]+1,p[1]+1]); n.z=state.objects.length; state.objects.push(n); fresh.push(n.id);
  });
  selectedIds=new Set(fresh); commitChange('已复制对象');
}
function copySelected(){
  clipboard=state.objects.filter(o=>selectedIds.has(o.id)).map(o=>deepClone(o));
  if(clipboard.length) toast(`已复制 ${clipboard.length} 个对象到剪贴板`);
}
function pasteClipboard(){
  if(!clipboard.length) return;
  pushHistory();
  const fresh=[];
  clipboard.forEach(o=>{
    const n=deepClone(o);
    n.id=uid('OBJ'); n.name=nextObjectId();
    n.x+=1;n.y+=1; if(n.points)n.points=n.points.map(p=>[p[0]+1,p[1]+1]);
    n.createdAt=nowISO(); n.updatedAt=nowISO();
    state.objects.push(n); fresh.push(n.id);
  });
  selectedIds=new Set(fresh); commitChange(`已粘贴 ${fresh.length} 个对象`);
}
function openShortcutsHelp(){
  const rows=[
    ['Ctrl + Z / Y','撤销 / 重做'],['Delete / Backspace','删除选中对象'],
    ['Ctrl + D','原地复制选中对象'],['Ctrl + C / V','复制 / 粘贴对象（偏移 1m）'],
    ['Esc','取消当前绘制 / 清除选择'],['Enter','完成折线或面积标注'],
    ['Backspace（绘制中）','删除上一个录入节点'],
    ['双击线段 / 双击节点（选择工具）','在折线上插入节点 / 删除节点'],['空格 + 拖拽','临时平移画布'],
    ['方向键','移动选中对象（Shift ×10 倍步距）'],['滚轮 / 右键拖拽','缩放 / 平移画布'],
    ['拖拽文件到画布','导入 JSON 工程、CSV/TSV/XLSX 表格或底图图片'],['?','显示本帮助']
  ];
  openModal('快捷键帮助','<div class="help-grid">'+rows.map(r=>'<span class="kbd">'+esc(r[0])+'</span><span>'+esc(r[1])+'</span>').join('')+'</div>',
    [{text:'知道了',class:'primary',click:closeModal}]);
}
function reorderSelected(delta){
  if(selectedIds.size!==1) return;
  const o=state.objects.find(x=>selectedIds.has(x.id)); const i=state.objects.indexOf(o),j=i+delta;
  if(j<0||j>=state.objects.length) return;
  pushHistory(); const [x]=state.objects.splice(i,1); state.objects.splice(j,0,x); commitChange();
}

/* -------------------- 键盘 -------------------- */
window.addEventListener('keydown',e=>{
  const tag=(document.activeElement?.tagName||'').toLowerCase();
  const typing=['input','select','textarea'].includes(tag);
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){ e.preventDefault(); e.shiftKey?redo():undo(); return; }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){ e.preventDefault(); redo(); return; }
  if(typing) return;
  if($('modalBackdrop').classList.contains('show')){ if(e.key==='Escape') closeModal(); return; }
  if(e.key==='?'||(e.key==='/'&&e.shiftKey)){ openShortcutsHelp(); return; }
  if((e.key==='Delete'||e.key==='Backspace')&&selectedIds.size){ deleteSelected(); return; }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){ e.preventDefault(); duplicateSelected(); return; }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){ e.preventDefault(); copySelected(); return; }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'){ e.preventDefault(); pasteClipboard(); return; }
  if(e.key==='Escape'){
    if(cancelActiveDrag()){ requestRender(); return; }   /* 拖拽中 Esc：恢复到按下前，不动选择集 */
    draft=null; selectedIds.clear(); setTool('select'); refreshUI(); return;
  }
  if(e.key==='Enter'&&draft&&draft.points){ finishDraft(); return; }
  if(e.key==='Backspace'&&draft?.points?.length){ draft.points.pop(); requestRender(); return; }
  if(e.code==='Space'){ e.preventDefault(); spaceDown=true; document.body.classList.add('panning'); canvas.style.cursor='grabbing'; return; }
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)&&selectedIds.size){
    const items=state.objects.filter(o=>selectedIds.has(o.id)&&isEditable(o)); if(!items.length) return;
    e.preventDefault(); const step=(state.settings.gridSize||1)*(e.shiftKey?10:1);
    const d={ArrowUp:[0,step],ArrowDown:[0,-step],ArrowLeft:[-step,0],ArrowRight:[step,0]}[e.key];
    pushHistory(); items.forEach(o=>{o.x+=d[0];o.y+=d[1];if(o.points)o.points=o.points.map(p=>[p[0]+d[0],p[1]+d[1]]);}); commitChange();
  }
});
window.addEventListener('keyup',e=>{ if(e.code==='Space'){ spaceDown=false; document.body.classList.remove('panning'); document.body.className='tool-'+currentTool; } });

/* 关闭/刷新页面前强制落盘：IndexedDB 事务尽力触发，localStorage 同步兜底，杜绝最后编辑丢失 */
function flushBeforeUnload(){
  try{
    clearTimeout(saveTimer);
    const snapshot=persistableState();
    try{ localStorage.setItem(LS_KEY,JSON.stringify(snapshot)); }catch(_){}
    idbPut(snapshot).catch(()=>{});
  }catch(e){}
}
window.addEventListener('pagehide',flushBeforeUnload);
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') flushBeforeUnload(); });

/* 拖拽文件到画布：JSON 工程 / CSV·TSV·XLSX 表格 / 图片底图，统一走导入路由 */
let dragDepth=0;
window.addEventListener('dragover',e=>e.preventDefault());
window.addEventListener('drop',e=>e.preventDefault());
wrap.addEventListener('dragenter',e=>{ e.preventDefault(); if([...(e.dataTransfer?.types||[])].includes('Files')){ dragDepth++; wrap.classList.add('dragover'); } });
wrap.addEventListener('dragover',e=>e.preventDefault());
wrap.addEventListener('dragleave',e=>{ e.preventDefault(); if(--dragDepth<=0){ dragDepth=0; wrap.classList.remove('dragover'); } });
wrap.addEventListener('drop',e=>{
  e.preventDefault(); dragDepth=0; wrap.classList.remove('dragover');
  const f=e.dataTransfer?.files?.[0];
  if(f) handleImportFile(f);
});
