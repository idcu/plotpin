/* interaction.js —— 工具/指针交互、对象操作、快捷键、关闭落盘、拖拽导入 */
/* -------------------- 工具与指针交互 -------------------- */
/* 左侧按钮高亮：测距是标注工具的独立入口(ruler)，二者互斥点亮；切换下拉时也要同步 */
function syncToolButtons(tool){
  document.querySelectorAll('.tool-btn[data-tool]').forEach(b=>{
    let on=b.dataset.tool===tool;
    if(tool==='dimension'){
      if(b.dataset.tool==='ruler') on=$('dimensionType').value==='ruler';
      if(b.dataset.tool==='dimension') on=$('dimensionType').value!=='ruler';
    }
    b.classList.toggle('active',on);
    if(b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed',on?'true':'false');
  });
}
const TOOL_TITLES={
  select:'选择：点击对象，框选多个对象；画线/拖点会自动捕捉端点、中点、圆心（设置可关）',pan:'平移：拖拽移动画布',point:'点设备：单击放置（自动捕捉特征点，设置可关）',
  rect:'区域：上方选形状后按住左键拖画；按住 Shift 矩形=正方形、椭圆=正圆、扇形=45°吸附，Esc 取消',line:'折线：逐点单击，双击完成；按住 Shift 画水平/垂直线，右键/Esc 取消（勾选闭合画三角形/多边形）',
  text:'文字：单击输入文字内容',dimension:'尺寸标注：测距逐点单击、双击结束（右键/Esc 取消）；其他类型按提示逐点单击',calibrate:'比例尺：依次点击图上两个已知点',
  affine:'仿射校准：在图上依次点击已知点并输入其实地坐标 X,Y（2 点=旋转+等比相似，≥3 点=完整仿射）；按 Enter 或左侧 ✓ 求解，右键/Esc 取消',
  'site-rect':'绘制矩形场地：按住左键拖出对角（Shift=正方形），松开完成，Esc 取消',
  'site-circle':'绘制圆形场地：按住左键从圆心拖出半径，松开完成，Esc 取消',
  'site-ellipse':'绘制椭圆场地：拖包围盒（Shift=正圆），松开完成，Esc 取消',
  'site-sector':'绘制扇形场地：拖半径时 Shift 吸附 45°，松开后输入起止角，Esc 取消',
  'site-parallelogram':'绘制平行四边形场地：拖出底边×高，松开后按默认倾角 30° 生成（可在场地属性改倾角/尺寸）',
  'site-polygon':'绘制多边形场地：沿边界逐点单击，双击/Enter 或点左侧✓闭合，Esc 取消',
  'site-node':'场地节点：拖拽画布上的控制点调整矢量场地形状；属性面板可精确输入坐标/参数，多边形支持双击边插入、双击节点删除',
  'guide':'参考线：两次点击定义一条无限长参考线（参与交点/垂足/平行/垂直捕捉）；Backspace 删除上一条，Shift+G 清除全部，Esc 退出'
};
/** 语言切换或工具切换时刷新画布顶部提示（不重置草稿/选择） */
function updateToolTitle(){ $('toolTitle').textContent=L(TOOL_TITLES[currentTool]||''); }
function setTool(tool){
  /* 独立「测距」按钮 = 标注工具的 ruler 子模式：复用 dimension 全部交互，仅入口更醒目；
     点「标注」按钮时若上次停在测距则切回两点距离，保证两个入口高亮与语义一致 */
  if(tool==='ruler'){ $('dimensionType').value='ruler'; tool='dimension'; }
  else if(tool==='dimension'&&$('dimensionType').value==='ruler'){ $('dimensionType').value='distance'; }
  currentTool=tool; draft=null; calibPoints=[]; affinePairs=[]; rubber=null; drag=null;
  lastCanvasHandledAt=0; lastCanvasPointerUpAt=0;
  document.body.className='tool-'+tool+(spaceDown?' panning':'');
  syncToolButtons(tool);
  updateToolTitle();
  refreshUI();
  requestRender();
}
let lastCanvasHandledAt=0, lastCanvasPointerUpAt=0;
/**
 * 输入点的精确约束（网格吸附之后调用）。预览(move)与落点(down)共用，保证所见即所点：
 *  - 折线/测距逐点录入：Shift=相对上一点正交；否则 参考边平行/垂直 → 上一段等距 → 极轴
 *  - 拖折线节点：Shift=相对相邻节点正交
 *  - 矩形/椭圆包围盒拖画：Shift=正方形（椭圆即正圆）
 *  - 扇形拖画：Shift=方位角吸附 45° 整数倍
 */
function constrainWorldPoint(wp,e){
  const shift=!!e.shiftKey;
  if(drag?.type==='node'){
    if(!shift) return wp;
    const o=state.objects.find(x=>x.id===drag.id);
    if(o && o.points && o.points.length>1){
      const i=drag.handle.index;
      const base=i>0?o.points[i-1]:o.points[i+1];
      return orthoPoint(base,wp,true);
    }
    return wp;
  }
  if(!draft) return wp;
  if(draft.points && ['line','dimension'].includes(currentTool) && draft.points.length){
    /* 测距链(ruler)与普通折线一样约束；角度/面积/两点距离标注不约束 */
    if(currentTool==='dimension' && draft.subtype!=='ruler') return wp;
    const last=draft.points[draft.points.length-1];
    if(shift) return orthoPoint(last,wp,true);
    const prev=draft.points.length>=2?draft.points[draft.points.length-2]:null;
    const pv=prev?[last[0]-prev[0],last[1]-prev[1]]:null;
    const prevLen=pv?Math.hypot(pv[0],pv[1]):0;
    const refDir=refEdge?Math.atan2(refEdge.b[1]-refEdge.a[1],refEdge.b[0]-refEdge.a[0]):undefined;
    const r=directionalSnap(last,wp,{
      refDir,
      prevDir:prevLen?Math.atan2(pv[1],pv[0]):undefined,
      prevLen,
      polarStep:state.settings.polar?(Number(state.settings.polarStep)||45):0
    });
    return r.p;
  }
  if(!shift) return wp;
  if(draft.start && ['rect','siteRect','areaEllipse','siteEllipse','areaParallelogram','siteParallelogram'].includes(draft.kind)){
    return squareCorner(draft.start,wp,true);
  }
  if(draft.start && ['areaSector','siteSector'].includes(draft.kind)){
    return polarSnap45(draft.start,wp,true,45);
  }
  return wp;
}
const OSNAP_PX=11;   // 捕捉吸附半径（屏幕像素）
let activeOsnap=null; // 当前帧命中的捕捉点（渲染标记用）
/* Tab 循环锁定的捕捉类型：null=自动（全部类型按优先级），其余为仅吸附该类型。
   循环顺序：自动 → 端点 → 中点 → 圆心 → 象限点 → 交点 → 垂足 → 切点 → 自动 */
const OSNAP_CYCLE=[null,'endpoint','midpoint','center','quadrant','intersection','perpendicular','tangent'];
let osnapMode=null;
function cycleOsnapMode(back){
  if(!state.settings.osnap) return;
  const i=OSNAP_CYCLE.indexOf(osnapMode);
  osnapMode=OSNAP_CYCLE[(i+(back?-1:1)+OSNAP_CYCLE.length)%OSNAP_CYCLE.length];
  updateOsnapChip();
  toast(osnapMode?(L('捕捉已锁定：')+L(OSNAP_LABELS[osnapMode])+L('（Tab 切换，循环回自动）')):L('捕捉：自动（全部类型）'));
  requestRender();
}
function updateOsnapChip(){
  const chip=$('osnapChip');
  if(!chip) return;
  if(!state.settings.osnap){ chip.hidden=true; return; }
  chip.hidden=false;
  chip.textContent=osnapMode?(L('◈ 捕捉：')+L(OSNAP_LABELS[osnapMode])+' ✕'):L('◈ 捕捉：自动');
  chip.classList.toggle('locked',!!osnapMode);
}
$('osnapChip').addEventListener('click',()=>{ if(osnapMode){ osnapMode=null; updateOsnapChip(); toast(L('捕捉：自动（全部类型）')); requestRender(); } });
/* 极轴/平行追踪提示：{from:[x,y], dir:[dx,dy]}（单位向量，世界坐标），render 画虚线 */
let trackLine=null;
let refEdge=null;      /* 鼠标附近的参考边（用于平行/垂直约束） */
let guideDraft=null;   /* 参考线工具：两次点击定义一条无限长参考线 */
function clearGuides(){ clearGuideLines(); guideDraft=null; }
/**
 * 鼠标附近可作为平行/垂直基准的边（折线/矩形边 + 临时参考线）；只在逐点录入时启用。
 * 使用 tol 屏幕像素换算世界距离，按距离取最近。
 */
function nearestReferenceEdge(raw,excl){
  if(!draft||!draft.points||!draft.points.length) return null;
  if(!(currentTool==='line'||(currentTool==='dimension'&&draft.subtype==='ruler'))) return null;
  const tol=14/state.viewport.zoom;
  let best=null,bd=tol;
  const box={minX:raw[0]-tol,maxX:raw[0]+tol,minY:raw[1]-tol,maxY:raw[1]+tol};
  for(const e of collectSnapEdges(state,isVisible)){
    if(excl&&excl.has(e.id)) continue;
    if(!e.guide && (
      Math.max(e.a[0],e.b[0])<box.minX||Math.min(e.a[0],e.b[0])>box.maxX||
      Math.max(e.a[1],e.b[1])<box.minY||Math.min(e.a[1],e.b[1])>box.maxY)) continue;
    const q=nearestPointOnSegment(raw,e.a,e.b);
    const d=Math.hypot(raw[0]-q[0],raw[1]-q[1]);
    if(d<bd){ bd=d; best=e; }
  }
  return best;
}
/**
 * 唯一的屏幕→最终世界落点解析：对象捕捉优先 → 其次网格吸附 → 最后方向约束
 * （Shift 正交 / 参考边平行·垂直 / 上一段等距 / 极轴追踪）。
 * pointerdown 与 pointermove 必须共用本函数，保证预览与落点完全一致。
 */
function resolveWorldPoint(e){
  const raw=pointerWorld(e);
  let excl=null;
  if(drag){
    excl=new Set();
    if(drag.originals) drag.originals.forEach((_,id)=>excl.add(id));
    if(drag.id) excl.add(drag.id);
  }
  refEdge=nearestReferenceEdge(raw,excl);
  if(state.settings.osnap){
    const hit=findOsnap(state,raw,OSNAP_PX/state.viewport.zoom,excl,isVisible,osnapMode);
    if(hit){ activeOsnap=hit; trackLine=null; return hit.p; }
  }
  activeOsnap=null;
  const p=constrainWorldPoint(snapPoint(raw,e),e);
  /* 画线录入中：极轴/参考边平行·垂直/等距的方向追踪虚线 */
  trackLine=buildTrackLine(raw,p,e);
  return p;
}
/** 极轴/参考边/等距追踪：返回从 from 沿参考方向单位向量，供 render 画虚线 */
function buildTrackLine(raw,accepted,e){
  if(!draft) return null;
  if(currentTool==='dimension' && draft.subtype!=='ruler') return null;
  const from=(draft&&draft.points&&draft.points.length)?draft.points[draft.points.length-1]:null;
  if(!from) return null;
  const v=[raw[0]-from[0],raw[1]-from[1]], len=Math.hypot(v[0],v[1]);
  if(len<EPS) return null;
  const ang=Math.atan2(v[1],v[0]);
  const cands=[];
  if(refEdge){
    const ea=Math.atan2(refEdge.b[1]-refEdge.a[1],refEdge.b[0]-refEdge.a[0]);
    cands.push([ea,5],[ea+Math.PI/2,5]);
  }
  if(draft.points.length>=2){
    const prev=draft.points[draft.points.length-2];
    const pv=[from[0]-prev[0],from[1]-prev[1]];
    if(Math.hypot(pv[0],pv[1])>EPS) cands.push([Math.atan2(pv[1],pv[0]),5]);
  }
  if(state.settings.polar){
    const step=Number(state.settings.polarStep)||45;
    cands.push([Math.round((ang*180/Math.PI)/step)*step*Math.PI/180,4]);
  }else{
    cands.push([Math.round((ang*180/Math.PI)/45)*45*Math.PI/180,5]);
  }
  for(const [dir,tolDeg] of cands){
    let d=ang-dir; d=Math.atan2(Math.sin(d),Math.cos(d));
    if(Math.min(Math.abs(d),Math.abs(Math.abs(d)-Math.PI))<=tolDeg*Math.PI/180)
      return {from, dir:[Math.cos(dir),Math.sin(dir)]};
  }
  return null;
}
/* -------------------- 触屏多指手势（捏合缩放 + 双指平移） -------------------- */
const activePointers=new Map();
let pinch=null;          /* {d0,z0,mx0,my0,panX0,panY0} */
let touchArm=false;      /* 多指刚结束，抑制剩余手指的误绘，直到全部抬起 */
canvas.addEventListener('pointerdown',e=>{
  lastCanvasHandledAt=performance.now();
  /* 合成事件/失活指针调用 setPointerCapture 会抛 NotFoundError，不能让它中断后续手势处理 */
  try{ if(e.pointerId!==undefined && e.pointerId>=0) canvas.setPointerCapture(e.pointerId); }catch(_){}
  const sp=pointerScreen(e);
  activePointers.set(e.pointerId,sp);
  /* 第二根手指落下：进入捏合手势，中止当前拖拽但保留绘制草稿（不丢已录节点） */
  if(activePointers.size===2 && !pinch){
    drag=null;
    const [a,b]=[...activePointers.values()];
    const [mx,my]=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    pinch={d0:Math.max(8,Math.hypot(a[0]-b[0],a[1]-b[1])),z0:state.viewport.zoom,mx0:mx,my0:my,
      panX0:state.viewport.panX,panY0:state.viewport.panY};
    touchArm=true;
    e.preventDefault();
    return;
  }
  if(pinch||touchArm) return;   /* 手势进行中/收尾中：后续手指不再触发放置或框选 */
  const wp=resolveWorldPoint(e);
  /* 逐点录入中（测距/折线/标注/多边形场地）右键=取消当前草稿（百度地图式），已完成的测量不受影响；无草稿时右键仍平移 */
  if(e.button===2 && (draft?.points?.length || (currentTool==='affine'&&affinePairs.length))){
    if(currentTool==='affine'&&affinePairs.length){ affinePairs=[]; e.preventDefault(); requestRender(); toast('已取消仿射校准'); return; }
    const wasRuler=draft.kind==='dimension'&&draft.subtype==='ruler';
    draft=null; e.preventDefault(); requestRender();
    toast(wasRuler?'已取消测距':'已取消当前绘制');
    return;
  }
  if(e.button===1||e.button===2||spaceDown||currentTool==='pan'){
    drag={type:'pan',start:sp,pan:deepClone(state.viewport)}; document.body.classList.add('panning'); e.preventDefault(); return;
  }
  if(currentTool==='calibrate'){
    if(calibPoints.length>=2) return;
    calibPoints.push(pointerWorld(e));
    if(calibPoints.length===2) finishCalibration();
    requestRender(); return;
  }
  if(currentTool==='affine'){ pickAffinePoint(e); return; }
  if(['site-rect','site-circle','site-ellipse','site-sector','site-parallelogram'].includes(currentTool)){
    const kindMap={'site-rect':'siteRect','site-circle':'siteCircle','site-ellipse':'siteEllipse','site-sector':'siteSector','site-parallelogram':'siteParallelogram'};
    draft={kind:kindMap[currentTool],start:wp,current:wp,pending:true};
    requestRender(); return;
  }
  if(currentTool==='site-polygon'){
    if(!draft) draft={kind:'sitePolygon',points:[wp],current:wp};
    else draft.points.push(wp);
    requestRender(); return;
  }
  if(currentTool==='site-node'){
    const h=siteHandleAt(wp,sp);
    if(h){
      pushHistory();
      drag={type:'siteHandle',handle:h,start:wp,originalShape:deepClone(state.background.shape)};
    }
    return;
  }
  if(currentTool==='guide'){
    if(!guideDraft){ guideDraft=[wp,wp]; toast('已记录参考线起点，再点一次确定方向'); }
    else{
      guideDraft[1]=wp;
      if(addGuideLine(guideDraft[0],guideDraft[1])) toast('已添加参考线','success');
      guideDraft=null;
    }
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
    const draftKind={rect:'rect',circle:'areaCircle',ellipse:'areaEllipse',sector:'areaSector',parallelogram:'areaParallelogram'}[shape]||'rect';
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
    /* distance/angle 点数够了自动结束；ruler（测距链）与 area 手动 Enter/双击结束 */
    if((subtype==='distance'&&draft.points.length>=2)||(subtype==='angle'&&draft.points.length>=3)) finishDraft();
    else requestRender();
    return;
  }
  if(currentTool==='text'){
    showPrompt({title:L('添加文字'),label:L('文字内容'),value:L('标注文字')}).then(text=>{
      if(text===null) return;
      pushHistory();
      const o=baseObject('text',null,{x:wp[0],y:wp[1],text,height:2.2,style:{color:'#111827'}});
      o.typeId='text.builtin'; if(!state.objectTypes.some(t=>t.id===o.typeId)) state.objectTypes.push({id:'text.builtin',kind:'text',name:'文字',color:'#111827',icon:'text',builtin:true});
      state.objects.push(o); selectedIds.clear(); selectedIds.add(o.id); commitChange(L('已添加文字')); switchTab('props');
    });
  }
});
canvas.addEventListener('pointermove',e=>{
  const sp=pointerScreen(e);
  if(activePointers.has(e.pointerId)) activePointers.set(e.pointerId,sp);
  /* 捏合中：以两指距离比缩放、中点位移平移；缩放围绕初始中点保持锚定 */
  if(pinch&&activePointers.size>=2){
    const [a,b]=[...activePointers.values()];
    const dNow=Math.max(8,Math.hypot(a[0]-b[0],a[1]-b[1]));
    const [mx,my]=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    const nz=Math.max(APP_LIMITS.ZOOM_MIN,Math.min(APP_LIMITS.ZOOM_MAX,pinch.z0*dNow/pinch.d0));
    /* 保持双指中点下的世界点不动：sx=panX+x·z；sy=panY+(h-y)·z（Y 翻转） */
    const kx=(pinch.mx0-pinch.panX0)/pinch.z0, ky=(pinch.my0-pinch.panY0)/pinch.z0;
    state.viewport.zoom=nz; state.viewport.panX=mx-kx*nz; state.viewport.panY=my-ky*nz;
    requestRender(); updateZoomLabel();
    return;
  }
  const wp=resolveWorldPoint(e);
  setCursorScreen(sp,true,wp,activeOsnap);
  if(currentTool==='guide'&&guideDraft){ guideDraft[1]=wp; }
  $('coordText').textContent=L('鼠标：')+fmt(wp[0])+', '+fmt(wp[1])+' '+state.settings.unit+(activeOsnap?'  ◈ '+OSNAP_LABELS[activeOsnap.type]:'');
  /* 空闲移动（无拖拽/草稿）也必须重绘：十字准星、世界坐标、捕捉标记随鼠标实时显示，
     不必等到点击；requestRender 内部按帧合并，重复调用无额外开销 */
  requestRender();
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
  if(drag?.type==='siteHandle'){
    resizeSiteByHandle(drag.handle,wp);
    syncFramePan();               /* 形状变更后取景框随实际包围盒更新，pan 补偿使其它内容保持不动 */
    requestRender(); return;
  }
  if(draft && draft.points){ draft.current=wp; requestRender(); }
  if(draft && ['rect','siteRect','siteCircle','siteEllipse','siteSector','siteParallelogram','areaCircle','areaEllipse','areaSector','areaParallelogram'].includes(draft.kind)){
    draft.current=wp; if(['rect','areaParallelogram'].includes(draft.kind)&&e.buttons===1) draft.pending=false; requestRender();
  }
  if(rubber){ rubber.b=sp; requestRender(); }
});
canvas.addEventListener('pointerup',e=>{
  if(!e.synthetic) lastCanvasPointerUpAt=performance.now();
  activePointers.delete(e.pointerId);
  if(pinch){
    /* 双指中先抬起一根：结束手势但继续抑制，直到剩余手指也抬起，避免松手瞬间误点 */
    pinch=null;
    if(activePointers.size===0){ touchArm=false; }
    drag=null; document.body.classList.remove('panning');
    scheduleSave(); requestRender();
    return;
  }
  if(activePointers.size===0) touchArm=false;
  if(drag?.type==='pan'){ drag=null; document.body.classList.remove('panning'); return; }
  if(drag && ['move','node','rotate','rect','shapeHandle','siteHandle'].includes(drag.type)){
    const isSite=drag.type==='siteHandle';
    const changed=isSite
      ? JSON.stringify(drag.originalShape)!==JSON.stringify(state.background.shape)
      : state.objects.some(o=>drag.originals?.has(o.id) || o.id===drag.id);
    if(isSite && !changed) history.past.pop();      /* 仅点击未拖动：弹出未变更的撤销快照 */
    drag=null;
    if(changed) commitChange(); else { updateHistoryButtons(); refreshUI(); }
    return;
  }
  if(draft && ['rect','areaParallelogram'].includes(draft.kind) && draft.pending===false){ finishDraft(); return; }
  if(draft && ['areaCircle','areaEllipse','areaSector'].includes(draft.kind)){ finishDraft(); return; }
  if(draft && ['siteRect','siteCircle','siteEllipse','siteSector','siteParallelogram'].includes(draft.kind)){ finishSiteDraft(); return; }
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
canvas.addEventListener('pointercancel',e=>{ activePointers.delete(e.pointerId); if(activePointers.size===0){ pinch=null; touchArm=false; } drag=null; rubber=null; document.body.classList.remove('panning'); setCursorScreen(null); requestRender(); });
canvas.addEventListener('pointerleave',()=>{ setCursorScreen(null); requestRender(); });
canvas.addEventListener('contextmenu',e=>e.preventDefault());
/** 双击结束录入：双击的两次 click 已各追加一个点（末两点位置几乎相同），按 8px 屏幕阈值去掉重复末点，
 *  避免测距/折线尾部留下零长度段。返回去除后是否满足最少点数 */
function dedupeDblClickPoint(){
  if(!draft?.points||draft.points.length<2) return draft?.points?.length>=1;
  const ps=draft.points, last=ps[ps.length-1], prev=ps[ps.length-2];
  if(dist(last,prev) < 8/state.viewport.zoom) ps.pop();
  return true;
}
canvas.addEventListener('dblclick',e=>{
  if(draft&&draft.kind==='sitePolygon'){ dedupeDblClickPoint(); finishSiteDraft(); }
  else if(draft && draft.points && draft.points.length>1){
    dedupeDblClickPoint();
    const minPts=(draft.kind==='dimension'&&draft.subtype!=='ruler'&&draft.subtype!=='distance')?3:2;
    /* 双击处只点过 1 个有效点：视为放弃，不落地也不弹点数不足 */
    if(draft.points.length<minPts){ draft=null; requestRender(); return; }
    finishDraft();
  }
  else if(currentTool==='site-node') editSiteNodeByDoubleClick(e);
  else editLineNodeByDoubleClick(e);
});
/** 「场地节点」工具下双击多边形场地：点中顶点→删除；点中边→在该处插入顶点（吸附生效） */
function editSiteNodeByDoubleClick(e){
  const bg=state.background;
  if(!bg||bg.kind==='image') return;
  const sh=bg.shape||{};
  if(sh.type!=='polygon'||!(sh.points||[]).length) return;
  const wp=resolveWorldPoint(e), tol=9/state.viewport.zoom, pts=sh.points, n=pts.length;
  let ni=-1;
  pts.forEach((p,i)=>{ if(dist(p,wp)<=tol) ni=i; });
  if(ni>=0){
    if(n<=3){ toast('多边形场地至少保留 3 个顶点','warn'); return; }
    pushHistory(); pts.splice(ni,1);
  }else{
    let best=null;
    for(let k=0;k<n;k++){
      const dd=distanceToSegment(wp,pts[k],pts[(k+1)%n]);
      if(dd<=tol&&(!best||dd<best.d)) best={k,d:dd};
    }
    if(!best) return;
    const foot=nearestPointOnSegment(wp,pts[best.k],pts[(best.k+1)%n]);
    pushHistory(); pts.splice(best.k+1,0,[foot[0],foot[1]]);
  }
  syncFramePan(); commitChange('场地节点已更新');
}
/** 选择工具下双击折线：点中节点→删除；点中线段→在该处插入节点（吸附生效） */
function editLineNodeByDoubleClick(e){
  if(currentTool!=='select'||selectedIds.size!==1) return;
  const o=state.objects.find(x=>x.id===Array.from(selectedIds)[0]);
  if(!o||!isPolylineEditable(o)||!isEditable(o)||o.points.length<2) return;
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
  if(o.shape&&o.shape.type==='parallelogram') return resizeParallelogramByHandle(o,drag,p);
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
/**
 * 平行四边形角点拖拽：保持倾角不变，先把顶边两角的错切位移扣回未错切坐标系，
 * 再按与矩形相同的「对角固定」规则反解底/高（面积恒为底×高）。
 */
function resizeParallelogramByHandle(o,drag,p){
  const orig=drag.original, idx=drag.handle.index;
  const skew=parallelogramSkew(orig.shape)*Math.PI/180;
  const q=rotatePoint(p,[orig.x,orig.y],-orig.angle);
  let lx=q[0]-orig.x, ly=q[1]-orig.y;
  const corners=[[0,0],[orig.width,0],[orig.width,orig.height],[0,orig.height]];
  const fixed=corners[(idx+2)%4];
  if(idx>=2) lx-=Math.tan(skew)*ly;      /* 顶边角点含错切位移 */
  o.width=Math.max(.08,Math.abs(lx-fixed[0]));
  o.height=Math.max(.08,Math.abs(ly-fixed[1]));
  const origin=[Math.min(fixed[0],lx),Math.min(fixed[1],ly)];
  const worldOrigin=add([orig.x,orig.y],rotatePoint(origin,[0,0],orig.angle));
  o.x=worldOrigin[0]; o.y=worldOrigin[1]; o.updatedAt=nowISO();
}
/** 圆/椭圆/扇形/平行四边形控制点拖拽（世界坐标米） */
function resizeShapeByHandle(o,h,p){
  if(!o||!o.shape) return;
  const sh=o.shape, mode=h.mode;
  if(mode==='arcR'){
    sh.r=Math.max(.05,dist([o.x,o.y],p));
  }else if(mode==='skew'){
    /* 顶边中点横向拖拽：只改倾角，底×高不变，故面积不变 */
    const w=Math.max(.05,o.width), hh=Math.max(.05,o.height);
    const q=rotatePoint(p,[o.x,o.y],-(o.angle||0));
    const off=(q[0]-o.x)-w/2;
    sh.skew=Math.max(-PARALLELOGRAM_MAX_SKEW,Math.min(PARALLELOGRAM_MAX_SKEW,Math.atan2(off,hh)*180/Math.PI));
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

/* -------------------- 矢量场地控制点编辑（「场地节点」工具） -------------------- */
/** 场地控制点清单（世界坐标，Y 向上）：与渲染手柄、命中、拖拽共用同一基准 */
function siteHandleList(bg){
  bg=bg||state.background;
  if(!bg||bg.kind==='image') return [];
  const sh=bg.shape||{}, out=[];
  if(sh.type==='polygon'){
    (sh.points||[]).forEach((p,i)=>out.push({type:'siteNode',mode:'vertex',index:i,x:Number(p[0])||0,y:Number(p[1])||0}));
    return out;
  }
  const cx=Number(sh.cx)||0, cy=Number(sh.cy)||0;
  if(sh.type==='circle'){
    const r=Number(sh.r)||0;
    out.push({type:'siteNode',mode:'center',x:cx,y:cy});
    out.push({type:'siteNode',mode:'radius',x:cx+r,y:cy});
    return out;
  }
  if(sh.type==='ellipse'){
    const rx=Number(sh.rx)||0, ry=Number(sh.ry)||0, a=(Number(sh.angle)||0)*Math.PI/180, b=a+Math.PI/2;
    out.push({type:'siteNode',mode:'center',x:cx,y:cy});
    out.push({type:'siteNode',mode:'rx',x:cx+Math.cos(a)*rx,y:cy+Math.sin(a)*rx});
    out.push({type:'siteNode',mode:'ry',x:cx+Math.cos(b)*ry,y:cy+Math.sin(b)*ry});
    const off=Math.max(.55,30/state.viewport.zoom);
    out.push({type:'siteNode',mode:'rotate',x:cx+Math.cos(b)*off,y:cy+Math.sin(b)*off});
    return out;
  }
  if(sh.type==='sector'){
    const r=Number(sh.r)||0, a0=Number(sh.a0)||0, sw=sectorSweep(sh), a1=a0+sw;
    const p=deg=>[cx+r*Math.cos(deg*Math.PI/180),cy+r*Math.sin(deg*Math.PI/180)];
    out.push({type:'siteNode',mode:'center',x:cx,y:cy});
    out.push({type:'siteNode',mode:'edge0',x:p(a0)[0],y:p(a0)[1]});
    out.push({type:'siteNode',mode:'edge1',x:p(a1)[0],y:p(a1)[1]});
    out.push({type:'siteNode',mode:'radius',x:p(a0+sw/2)[0],y:p(a0+sw/2)[1]});
    return out;
  }
  if(sh.type==='parallelogram'){
    const x=Number(sh.x)||0, y=Number(sh.y)||0, w=positiveNum(sh.w,100), hh=positiveNum(sh.h,70);
    const pts=parallelogramPoints(x,y,w,hh,sh.skew);
    pts.forEach((p,i)=>out.push({type:'siteNode',mode:'corner',index:i,x:p[0],y:p[1]}));
    out.push({type:'siteNode',mode:'skew',x:(pts[2][0]+pts[3][0])/2,y:(pts[2][1]+pts[3][1])/2});
    return out;
  }
  const x=Number(sh.x)||0, y=Number(sh.y)||0, w=positiveNum(sh.w,100), h=positiveNum(sh.h,70);
  [[x,y],[x+w,y],[x+w,y+h],[x,y+h]].forEach((p,i)=>out.push({type:'siteNode',mode:'corner',index:i,x:p[0],y:p[1]}));
  return out;
}
/** 命中场地控制点（屏幕阈值，与对象手柄一致） */
function siteHandleAt(wp,sp){
  for(const h of siteHandleList()){
    const s=w2s([h.x,h.y]);
    if(Math.hypot(s[0]-sp[0],s[1]-sp[1])<=9) return h;
  }
  return null;
}
/** 拖拽场地控制点：按模式改写场地 shape 参数（世界坐标米） */
function resizeSiteByHandle(h,p){
  const bg=state.background; if(!bg||bg.kind==='image') return;
  const sh=bg.shape||{};
  if(h.mode==='vertex'){ sh.points[h.index]=[p[0],p[1]]; return; }
  if(h.mode==='corner'){
    const x=Number(sh.x)||0, y=Number(sh.y)||0, w=positiveNum(sh.w,100), hh=positiveNum(sh.h,70);
    /* 平行四边形：顶边两角含错切位移，先扣回未错切坐标再按对角固定规则反解 */
    const isPara=sh.type==='parallelogram';
    const skew=isPara?parallelogramSkew(sh)*Math.PI/180:0;
    const pull=(v,i)=> i>=2 && isPara ? v-Math.tan(skew)*(p[1]-y) : v;
    const fixed=[[x,y],[x+w,y],[x+w,y+hh],[x,y+hh]][(h.index+2)%4];
    const lx=pull(p[0],h.index);
    sh.x=Math.min(fixed[0],lx); sh.y=Math.min(fixed[1],p[1]);
    sh.w=Math.max(.05,Math.abs(lx-fixed[0])); sh.h=Math.max(.05,Math.abs(p[1]-fixed[1]));
    return;
  }
  if(h.mode==='skew'){
    /* 场地平行四边形顶边中点横向拖拽：只改倾角，底×高不变 */
    const x=Number(sh.x)||0, w=positiveNum(sh.w,100), hh=positiveNum(sh.h,70);
    const off=p[0]-x-w/2;
    sh.skew=Math.max(-PARALLELOGRAM_MAX_SKEW,Math.min(PARALLELOGRAM_MAX_SKEW,Math.atan2(off,hh)*180/Math.PI));
    return;
  }
  if(h.mode==='center'){ sh.cx=p[0]; sh.cy=p[1]; return; }
  if(h.mode==='radius'){ sh.r=Math.max(.05,dist([Number(sh.cx)||0,Number(sh.cy)||0],p)); return; }
  if(h.mode==='rx'||h.mode==='ry'){
    const cx=Number(sh.cx)||0, cy=Number(sh.cy)||0, q=rotatePoint(p,[cx,cy],-(Number(sh.angle)||0));
    if(h.mode==='rx') sh.rx=Math.max(.05,Math.abs(q[0]-cx));
    else sh.ry=Math.max(.05,Math.abs(q[1]-cy));
    return;
  }
  if(h.mode==='rotate'){
    const cx=Number(sh.cx)||0, cy=Number(sh.cy)||0;
    sh.angle=normalizeAngle(Math.round(Math.atan2(p[1]-cy,p[0]-cx)*180/Math.PI-90));
    return;
  }
  if(h.mode==='edge0'||h.mode==='edge1'){
    const cx=Number(sh.cx)||0, cy=Number(sh.cy)||0;
    sh.r=Math.max(.05,dist([cx,cy],p));
    const deg=normalizeAngle(Math.round(Math.atan2(p[1]-cy,p[0]-cx)*180/Math.PI));
    if(h.mode==='edge0') sh.a0=deg; else sh.a1=deg;
    return;
  }
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
  }else if(d.type==='siteHandle'){
    if(state.background) state.background.shape=deepClone(d.originalShape);
    syncFramePan();                 /* 形状还原后同步取景框，视野回到拖拽前 */
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
  if(currentTool==='affine'){ finishAffine(); return; }
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
  }else if(draft.kind==='areaParallelogram'){
    const a=draft.start,b=draft.current;
    const x=Math.min(a[0],b[0]),y=Math.min(a[1],b[1]),w=Math.abs(a[0]-b[0]),hh=Math.abs(a[1]-b[1]);
    if(w>=.08&&hh>=.08){
      pushHistory();
      const o=baseObject('rect',draft.typeId||$('rectType').value,
        {x,y,width:w,height:hh,shape:{type:'parallelogram',skew:PARALLELOGRAM_DEFAULT_SKEW}});
      state.objects.push(o); selectedIds.clear(); selectedIds.add(o.id); commitChange('已添加平行四边形区域'); switchTab('props');
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
    const okCount=(draft.subtype==='distance'&&ps.length>=2)
      ||(draft.subtype==='angle'&&ps.length>=3)
      ||(draft.subtype==='area'&&ps.length>=3)
      ||(draft.subtype==='ruler'&&ps.length>=2);
    if(okCount){
      pushHistory();
      const o=baseObject('dimension',null,{subtype:draft.subtype,points:ps,x:ps[0][0],y:ps[0][1],
        style:{color:draft.subtype==='ruler'?'#0d9488':'#111827'}});
      o.name=(draft.subtype==='ruler'?'测':'D')+String(state.objects.length+1).padStart(4,'0');
      state.objects.push(o); selectedIds.clear(); selectedIds.add(o.id);
      commitChange(draft.subtype==='ruler'?'已添加测距':'已添加尺寸标注'); switchTab('props');
    }else toast('点数不足','warn');
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
  }else if(d.kind==='siteParallelogram'){
    const a=d.start,b=d.current;
    const x=Math.min(a[0],b[0]),y=Math.min(a[1],b[1]),w=Math.abs(a[0]-b[0]),hh=Math.abs(a[1]-b[1]);
    if(w<.5||hh<.5){ toast('场地过小（不足 0.5m），可在底图弹窗中直接输入尺寸','warn'); setTool('select'); requestRender(); return; }
    applyVectorSite('parallelogram',{type:'parallelogram',x,y,w,h:hh,skew:PARALLELOGRAM_DEFAULT_SKEW});
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
    const v=await showPrompt({title:L('扇形场地角度'),label:L('起始角, 张角（度，用逗号分隔），例如 0,90'),value:'0,90'});
    if(v===null){ setTool('select'); return; }
    const m=v.split(/[,，\s]+/).map(Number);
    const a0=Number.isFinite(m[0])?m[0]:0, sweep=Number.isFinite(m[1])?m[1]:90;
    if(!(sweep>0)||sweep>360){ toast(L('张角需在 0–360° 之间'),'error'); setTool('select'); return; }
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
  const value=await showPrompt({title:L('比例尺校准'),label:L('两点之间的实际距离（米）'),value:fmt(old)});
  if(value===null||Number.isNaN(Number(value))||Number(value)<=0){ calibPoints=[]; setTool('select'); return; }
  pushHistory();
  const factor=Number(value)/old;
  /* 米/像素改变后，世界坐标(0,0) 仍对应图片左上角，已有对象必须围绕世界原点同比缩放，
     才能保持其在底图上的像素位置不变（围绕校准点缩放会让点位相对底图漂移，见评估报告 5.1）。
     校准两点间的新世界距离 = 旧距离×factor = 输入值，校准语义同时成立。 */
  state.background.metersPerPixel*=factor; state.background.calibrated=true;
  scaleWorldAround([0,0],factor);
  calibPoints=[]; fitView(); commitChange(L('比例尺已校准')); setTool('select');
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

/* ==================== 多点仿射校准（旋转 / 不等比缩放 / 纠偏） ==================== */
/** 记录一个校准点：图上点击位置反解为原图像素 (u,v)，再让用户输入该点的实地坐标 (x,y) */
async function pickAffinePoint(e){
  const bg=state.background;
  if(bg.kind!=='image'){ toast('仿射校准仅适用于图片底图','warn'); return; }
  const wp=pointerWorld(e);
  const px=bgWorldToPixel(bg,wp);
  const v=await showPrompt({title:L('仿射校准 · 第 ')+(affinePairs.length+1)+L(' 点'),
    label:L('该点的实地坐标 X,Y（米，逗号分隔）。已记录图上像素 ')+`(${px[0].toFixed(1)}, ${px[1].toFixed(1)})`,
    value:fmt(wp[0])+','+fmt(wp[1])});
  if(v===null) return;
  const m=String(v).split(/[,，\s]+/).map(Number);
  if(!Number.isFinite(m[0])||!Number.isFinite(m[1])){ toast(L('坐标无效，请输入 X,Y'),'error'); return; }
  affinePairs.push({u:px[0],v:px[1],x:m[0],y:m[1]});
  requestRender();
  toast(affinePairs.length>=2?(L('已记录')+' '+affinePairs.length+' '+L('个点，Enter/✓ 求解')):L('已记录 1 个点，继续点击下一已知点'));
}
/** 求解仿射并把「旧世界→新世界」映射迁移到所有既有对象，再落地新的 bg.transform */
async function finishAffine(){
  const bg=state.background;
  if(bg.kind!=='image'){ affinePairs=[]; setTool('select'); return; }
  if(affinePairs.length<2){ toast('仿射校准至少需要 2 个对应点','warn'); return; }
  let sol;
  try{ sol=solveImageAffine(affinePairs); }catch(err){ toast(err.message||'校准点退化（共线/重合），无法求解','error'); return; }
  pushHistory();
  const tNew=sol.T, tOld=imageTransformOf(bg);
  /* M = 新(像素→世界) ∘ 旧(世界→像素)：把既有对象从旧世界坐标搬到新世界坐标 */
  const M=affMul([tNew.a,tNew.b,tNew.c,tNew.d,tNew.e,tNew.f], affInv([tOld.a,tOld.b,tOld.c,tOld.d,tOld.e,tOld.f]));
  migrateObjectsByAffine(state.objects,M);
  bg.transform=tNew;
  bg.calibrated=true;
  const nom=Math.sqrt(Math.abs(tNew.a*tNew.e-tNew.b*tNew.d));
  if(nom>0) bg.metersPerPixel=nom;   /* 等效米/像素（供描述显示；真实映射以 transform 为准） */
  affinePairs=[]; fitView();
  commitChange('已完成仿射校准');
  setTool('select');
}

/* -------------------- 对象操作 -------------------- */
function deleteSelected(){
  const deletable=state.objects.filter(o=>selectedIds.has(o.id)&&isEditable(o));
  if(!deletable.length) return toast('没有可删除的选中对象（可能位于锁定图层）','warn');
  showConfirm(`${L('确定删除选中的')} ${deletable.length} ${L('个对象吗？')}`).then(ok=>{
    if(!ok) return;
    pushHistory();
    const ids=new Set(deletable.map(o=>o.id));
    deletable.forEach(o=>markTombstone(o.id,'object'));
    state.objects=state.objects.filter(o=>!ids.has(o.id));
    deletable.forEach(o=>selectedIds.delete(o.id));
    commitChange('已删除对象');
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
    ['Esc / 右键（绘制中）','取消当前绘制 / 清除选择（右键取消测距等逐点录入，无草稿时平移）'],['双击 / Enter','完成测距、折线或面积标注（双击处不会产生重复节点）'],
    ['Backspace（绘制中）','删除上一个录入节点'],
    ['双击线段 / 双击节点（选择工具）','在折线上插入节点 / 删除节点'],
    ['Shift（画线/标注/拖节点时）','约束为水平/垂直线（正交）'],
    ['Shift（拖矩形/椭圆/扇形时）','正方形 / 正圆 / 45°方位吸附'],
    ['对象捕捉','自动吸附端点□ 中点△ 圆心◎ 象限◇ 垂足⊥ 交点× 切点；画线时橙色虚线=45°极轴/平行追踪'],
    ['Tab / Shift+Tab','画布聚焦时循环切换捕捉类型（自动→端点→中点→圆心→象限点→交点→垂足→切点）；点击底部捕捉徽标恢复自动'],
    ['F6','在顶栏 / 左侧工具栏 / 侧栏页签之间循环焦点（画布内 Tab 用于捕捉，需离开画布时按 F6）'],
    ['空格 + 拖拽','临时平移画布'],
    ['方向键','移动选中对象（Shift ×10 倍步距）'],['F','适应窗口（显示整张场地）'],
    ['滚轮 / 右键拖拽','缩放 / 平移画布'],
    ['触屏单指 / 双指','单指绘制与移动；双指捏合缩放、双指拖动平移'],
    ['拖拽文件到画布','导入 JSON / DXF / CSV·TSV·XLSX 表格或底图图片'],['?','显示本帮助']
  ];
  openModal(L('快捷键帮助'),'<div class="help-grid">'+rows.map(r=>'<span class="kbd">'+esc(r[0])+'</span><span>'+esc(L(r[1]))+'</span>').join('')+'</div>',
    [{text:L('知道了'),class:'primary',click:closeModal}]);
}
function reorderSelected(delta){
  if(selectedIds.size!==1) return;
  const o=state.objects.find(x=>selectedIds.has(x.id)); const i=state.objects.indexOf(o),j=i+delta;
  if(j<0||j>=state.objects.length) return;
  pushHistory(); const [x]=state.objects.splice(i,1); state.objects.splice(j,0,x); commitChange();
}

/* -------------------- 键盘 -------------------- */
/** 画布级快捷键（Tab 捕捉、空格平移、方向键移动）仅在画布/文档体聚焦时生效，
 *  避免抢走顶栏、工具栏、页签等控件的标准键盘操作 */
function isCanvasShortcutTarget(tag){
  return !tag||tag==='canvas'||tag==='body'||tag==='html';
}
let keyboardRegion=-1;
/** F6：在顶栏 / 左侧工具栏 / 侧栏页签之间循环焦点，提供离开画布 Tab 捕捉的键盘通道 */
function cycleKeyboardRegion(){
  const regions=[
    () => document.querySelector('.topbar button'),
    () => document.querySelector('.tool-rail .tool-btn'),
    () => document.querySelector('.side-tabs .side-tab')
  ];
  keyboardRegion=(keyboardRegion+1)%regions.length;
  const el=regions[keyboardRegion]();
  if(el&&typeof el.focus==='function') el.focus();
}
window.addEventListener('keydown',e=>{
  if(e.defaultPrevented) return;
  const tag=(document.activeElement?.tagName||'').toLowerCase();
  const typing=['input','select','textarea'].includes(tag);
  const onCanvas=isCanvasShortcutTarget(tag);
  /* 弹窗优先：Esc 在输入框内也能关闭；Tab 在弹窗内循环；其余快捷键不穿透遮罩 */
  if($('modalBackdrop').classList.contains('show')){ modalKeydown(e); return; }
  if(typing) return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){ e.preventDefault(); e.shiftKey?redo():undo(); return; }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){ e.preventDefault(); redo(); return; }
  if(e.key==='F6'){ e.preventDefault(); cycleKeyboardRegion(); return; }
  if(e.key==='Tab'&&onCanvas){ e.preventDefault(); cycleOsnapMode(e.shiftKey); return; }
  if(e.key==='?'||(e.key==='/'&&e.shiftKey)){ openShortcutsHelp(); return; }
  if(e.key==='f'||e.key==='F'){ fitView(); return; }
  /* 参考线：Shift+G 清除全部；Backspace 删除上一条（无草稿时） */
  if(currentTool==='guide'||guideLines.length){
    if(e.shiftKey&&e.key.toLowerCase()==='g'){ clearGuides(); toast('参考线已清除'); requestRender(); return; }
    if(e.key==='Backspace'&&!draft){
      if(removeLastGuideLine()){ toast('已删除上一条参考线'); e.preventDefault(); requestRender(); return; }
    }
  }
  if((e.key==='Delete'||e.key==='Backspace')&&selectedIds.size){ deleteSelected(); return; }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){ e.preventDefault(); duplicateSelected(); return; }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){ e.preventDefault(); copySelected(); return; }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'){ e.preventDefault(); pasteClipboard(); return; }
  if(e.key==='Escape'){
    if(cancelActiveDrag()){ requestRender(); return; }   /* 拖拽中 Esc：恢复到按下前，不动选择集 */
    draft=null; selectedIds.clear(); setTool('select'); refreshUI(); return;
  }
  if(e.key==='Enter'&&onCanvas&&(currentTool==='affine'||(draft&&draft.points))){ finishDraft(); return; }
  if(e.key==='Backspace'&&onCanvas&&draft?.points?.length){ draft.points.pop(); requestRender(); return; }
  if(e.code==='Space'&&onCanvas){ e.preventDefault(); spaceDown=true; document.body.classList.add('panning'); canvas.style.cursor='grabbing'; return; }
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)&&selectedIds.size&&onCanvas){
    const items=state.objects.filter(o=>selectedIds.has(o.id)&&isEditable(o)); if(!items.length) return;
    e.preventDefault(); const step=(state.settings.gridSize||1)*(e.shiftKey?10:1);
    const d={ArrowUp:[0,step],ArrowDown:[0,-step],ArrowLeft:[-step,0],ArrowRight:[step,0]}[e.key];
    pushHistory(); items.forEach(o=>{o.x+=d[0];o.y+=d[1];if(o.points)o.points=o.points.map(p=>[p[0]+d[0],p[1]+d[1]]);}); commitChange();
  }
});
window.addEventListener('keyup',e=>{ if(e.code==='Space'&&spaceDown){ spaceDown=false; document.body.classList.remove('panning'); document.body.className='tool-'+currentTool; } });

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
