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
  select:L('选择：点击对象，框选多个对象；画线/拖点会自动捕捉端点、中点、圆心（设置可关）'),pan:L('平移：拖拽移动画布'),point:L('点设备：单击放置（自动捕捉特征点，设置可关）'),
  rect:L('区域：上方选形状后按住左键拖画；按住 Shift 矩形=正方形、椭圆=正圆、扇形=45°吸附，Esc 取消'),line:L('折线：逐点单击，双击完成；按住 Shift 画水平/垂直线，右键/Esc 取消（勾选闭合画三角形/多边形）'),
  text:L('文字：单击输入文字内容'),dimension:L('尺寸标注：测距逐点单击、双击结束（右键/Esc 取消）；其他类型按提示逐点单击'),
  calibrate:L('比例尺：依次点击图上两个已知点，可拖拽调整／Delete 删除／Ctrl+Z 撤销，按 Enter 或左侧 ✓ 应用'),
  affine:L('仿射校准：在图上依次点击已知点并输入其实地坐标 X,Y（2 点=旋转+等比相似，≥3 点=完整仿射）；红/绿控制点可拖拽、Delete 删除、Ctrl+Z 撤销，按 Enter 或左侧 ✓ 求解，右键/Esc 取消'),
  'site-rect':L('绘制矩形场地：按住左键拖出对角（Shift=正方形），松开完成，Esc 取消'),
  'site-circle':L('绘制圆形场地：按住左键从圆心拖出半径，松开完成，Esc 取消'),
  'site-ellipse':L('绘制椭圆场地：拖包围盒（Shift=正圆），松开完成，Esc 取消'),
  'site-sector':L('绘制扇形场地：拖半径时 Shift 吸附 45°，松开后输入起止角，Esc 取消'),
  'site-parallelogram':L('绘制平行四边形场地：拖出底边×高，松开后按默认倾角 30° 生成（可在场地属性改倾角/尺寸）'),
  'site-polygon':L('绘制多边形场地：沿边界逐点单击，双击/Enter 或点左侧✓闭合，Esc 取消'),
  'site-node':L('场地节点：拖拽画布上的控制点调整矢量场地形状；属性面板可精确输入坐标/参数，多边形支持双击边插入、双击节点删除'),
  'image-transform':L('图片变换：橙色中心=平移，蓝点=旋转，右下角=等比缩放，顶边中点=切变；只改图片，不动任何标注对象；图片角点靠近场地边角时自动吸附'),
  'guide':L('参考线：两次点击定义一条无限长参考线（参与交点/垂足/平行/垂直捕捉）；Backspace 删除上一条，Shift+G 清除全部，Esc 退出')
};
/** 语言切换或工具切换时刷新画布顶部提示（不重置草稿/选择） */
function updateToolTitle(){ $('toolTitle').textContent=L(TOOL_TITLES[currentTool]||''); }
/** 草稿顶点入列：达到 SHAPE_POINTS_MAX 后拒绝并提示，避免病态点列拖垮包围盒/渲染 */
function pushDraftPoint(points,wp){
  if(points.length>=APP_LIMITS.SHAPE_POINTS_MAX){
    toast(L('顶点数已达上限 {n}',{n:APP_LIMITS.SHAPE_POINTS_MAX}),'error');
    return false;
  }
  points.push(wp); return true;
}
function setTool(tool){
  /* 独立「测距」按钮 = 标注工具的 ruler 子模式：复用 dimension 全部交互，仅入口更醒目；
     点「标注」按钮时若上次停在测距则切回两点距离，保证两个入口高亮与语义一致 */
  if(tool==='ruler'){ $('dimensionType').value='ruler'; tool='dimension'; }
  else if(tool==='dimension'&&$('dimensionType').value==='ruler'){ $('dimensionType').value='distance'; }
  currentTool=tool; draft=null; calibPoints=[]; affinePairs=[]; rubber=null; drag=null;
  calibSelection=null; calibUndoStack=[];
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
  toast(osnapMode?L('捕捉已锁定：{label}（Tab 切换，循环回自动）',{label:L(OSNAP_LABELS[osnapMode])}):L('捕捉：自动（全部类型）'));
  requestRender();
}
function updateOsnapChip(){
  const chip=$('osnapChip');
  if(!chip) return;
  if(!state.settings.osnap){ chip.hidden=true; return; }
  chip.hidden=false;
  chip.textContent=osnapMode?L('◈ 捕捉：{label} ✕',{label:L(OSNAP_LABELS[osnapMode])}):L('◈ 捕捉：自动');
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
  for(const e of collectSnapEdges(state,isVisible,box)){
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
  /* 第二根手指落下：进入捏合手势，中止当前拖拽但保留绘制草稿（不丢已录节点）；
     中止必须走 cancelActiveDrag 回滚，不能只把 drag 置空，否则已移动的对象会留在半途且无撤销快照（审计 P1-2） */
  if(activePointers.size===2 && !pinch){
    cancelActiveDrag();
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
  if(e.button===2 && (draft?.points?.length || (currentTool==='affine'&&affinePairs.length) || (currentTool==='calibrate'&&calibPoints.length))){
    if(currentTool==='affine'&&affinePairs.length){ affinePairs=[]; calibSelection=null; calibUndoStack=[]; e.preventDefault(); refreshCalibStatus(); requestRender(); toast('已取消仿射校准'); return; }
    if(currentTool==='calibrate'&&calibPoints.length){ calibPoints=[]; calibSelection=null; calibUndoStack=[]; e.preventDefault(); refreshCalibStatus(); requestRender(); toast('已取消比例尺校准'); return; }
    const wasRuler=draft.kind==='dimension'&&draft.subtype==='ruler';
    draft=null; e.preventDefault(); requestRender();
    toast(wasRuler?'已取消测距':'已取消当前绘制');
    return;
  }
  if(e.button===1||e.button===2||spaceDown||currentTool==='pan'){
    drag={type:'pan',start:sp,pan:deepClone(state.viewport)}; document.body.classList.add('panning'); e.preventDefault(); return;
  }
  if(currentTool==='calibrate'){
    const pre=calibPrecheck('calibrate');
    if(!pre.ok){ toast(pre.reason,'warn'); return; }
    const hit=calibHitAt(sp);
    if(hit){ calibPushUndo(); calibSelection=hit; drag={type:'calibPoint',hit,moved:false}; requestRender(); return; }
    if(calibPoints.length>=2){ toast('已有 2 个校准点：拖动调整，Enter 应用，Delete 删除选中点','warn'); return; }
    calibPushUndo(); calibPoints.push(pointerWorld(e)); calibSelection=null; refreshCalibStatus(); requestRender(); return;
  }
  if(currentTool==='affine'){
    const pre=calibPrecheck('affine');
    if(!pre.ok){ toast(pre.reason,'warn'); return; }
    const hit=calibHitAt(sp);
    if(hit){ calibPushUndo(); calibSelection=hit; drag={type:'calibPoint',hit,moved:false}; requestRender(); return; }
    pickAffinePoint(e); return;
  }
  if(currentTool==='image-transform'){
    const pre=calibPrecheck('image-transform');
    if(!pre.ok){ toast(pre.reason,'warn'); return; }
    const h=imageHandleAt(sp);
    if(h) drag={type:'imageHandle',mode:h.mode,start:wp,moved:false,snap:null,
      origin:imageTransformOf(state.background).slice(),originCorners:imageCornerWorld(state.background)};
    return;
  }
  if(['site-rect','site-circle','site-ellipse','site-sector','site-parallelogram'].includes(currentTool)){
    const kindMap={'site-rect':'siteRect','site-circle':'siteCircle','site-ellipse':'siteEllipse','site-sector':'siteSector','site-parallelogram':'siteParallelogram'};
    draft={kind:kindMap[currentTool],start:wp,current:wp,pending:true};
    requestRender(); return;
  }
  if(currentTool==='site-polygon'){
    if(!draft) draft={kind:'sitePolygon',points:[wp],current:wp};
    else if(!pushDraftPoint(draft.points,wp)) return;
    requestRender(); return;
  }
  if(currentTool==='site-node'){
    const h=siteHandleAt(wp,sp);
    if(h){
      pushHistory();
      drag={type:'siteHandle',handle:h,start:wp,originalShape:deepClone(state.site?.shape)};
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
        if(e.shiftKey||e.ctrlKey||e.metaKey){ selectedIds.has(o.id)?selectedIds.delete(o.id):selectedIds.add(o.id); }
        else if(!selectedIds.has(o.id)){ selectedIds.clear(); selectedIds.add(o.id); }
        drag={type:'move',start:wp,originals:new Map(),moved:false};
        const idx=objectIndexById();
        selectedIds.forEach(id=>{ const obj=idx.get(id); if(obj&&isEditable(obj)) drag.originals.set(id,deepClone(obj)); });
      }else{
        selectedIds.clear(); selectedIds.add(o.id);
      }
      refreshSelectionUI(); requestRender(); return;
    }
    if(!(e.shiftKey||e.ctrlKey||e.metaKey)) selectedIds.clear();
    rubber={a:sp,b:sp}; refreshSelectionUI(); requestRender(); return;
  }
  if(currentTool==='point'){
    pushHistory();
    const typeId=$('pointType').value || 'point.marker';
    const ptType=getType(typeId);
    const isSym=ptType&&Array.isArray(ptType.symbol)&&ptType.symbol.length;
    const o=baseObject('point',typeId,{x:wp[0],y:wp[1],angle:isSym?(Number(symbolPlace.angle)||0):0,phys:isSym?(Number(symbolPlace.phys)||0):0});
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
    else if(!pushDraftPoint(draft.points,wp)) return;
    requestRender(); return;
  }
  if(currentTool==='dimension'){
    const subtype=$('dimensionType').value;
    if(!draft){ draft={kind:'dimension',subtype,points:[wp],current:wp}; }
    else if(!pushDraftPoint(draft.points,wp)) return;
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
  $('coordText').textContent=L('鼠标：{x}, {y} {unit}{osnap}',{x:fmt(wp[0]),y:fmt(wp[1]),unit:state.settings.unit,osnap:activeOsnap?'  ◈ '+L(OSNAP_LABELS[activeOsnap.type]):''});
  /* 空闲移动（无拖拽/草稿）也必须重绘：十字准星、世界坐标、捕捉标记随鼠标实时显示，
     不必等到点击；requestRender 内部按帧合并，重复调用无额外开销 */
  requestRender();
  if(drag?.type==='pan'){
    state.viewport.panX=drag.pan.panX+sp[0]-drag.start[0];
    state.viewport.panY=drag.pan.panY+sp[1]-drag.start[1];
    requestRender(); updateZoomLabel(); return;
  }
  if(drag?.type==='move'){
    const delta=[wp[0]-drag.start[0],wp[1]-drag.start[1]];
    /* 屏幕位移阈值 2px：指针微抖/单击不进入拖拽，避免留下空撤销快照（审计 P1-1） */
    if(!drag.moved){
      if(Math.hypot(delta[0],delta[1])*state.viewport.zoom<2) return;
      pushHistory(); drag.moved=true;
    }
    const moveIdx=objectIndexById();
    drag.originals.forEach((orig,id)=>{ moveObjectBy(moveIdx.get(id),orig,delta); });
    requestRender(); return;
  }
  if(drag?.type==='node'){
    drag.dirty=true;
    const o=state.objects.find(x=>x.id===drag.id); if(o){ o.points[drag.handle.index]=wp; syncFirstPoint(o); requestRender(); } return;
  }
  if(drag?.type==='rotate'){
    drag.dirty=true;
    const o=state.objects.find(x=>x.id===drag.id); if(!o) return;
    rotateShapeByHandle(o,wp,drag.handle.kind==='pointRotate');
    requestRender(); return;
  }
  if(drag?.type==='rect'){
    drag.dirty=true;
    resizeRectByHandle(state.objects.find(x=>x.id===drag.id),drag,wp);
    requestRender(); return;
  }
  if(drag?.type==='shapeHandle'){
    drag.dirty=true;
    resizeShapeByHandle(state.objects.find(x=>x.id===drag.id),drag.handle,wp);
    requestRender(); return;
  }
  if(drag?.type==='siteHandle'){
    resizeSiteByHandle(drag.handle,wp);
    syncFramePan();               /* 形状变更后取景框随实际包围盒更新，pan 补偿使其它内容保持不动 */
    requestRender(); return;
  }
  if(drag?.type==='calibPoint'){
    const hit=drag.hit;
    if(hit.kind==='calibrate'){ calibPoints[hit.index]=wp.slice(); }
    else{
      const p=affinePairs[hit.index];
      if(p){
        if(hit.part==='src'){ const px=bgWorldToPixel(state.background,wp); p.u=px[0]; p.v=px[1]; }
        else { p.x=wp[0]; p.y=wp[1]; }
      }
    }
    drag.moved=true; requestRender(); return;
  }
  if(drag?.type==='imageHandle'){
    if(!drag.moved){ pushHistory(); drag.moved=true; }
    const r=imageHandleDragTo(state.background,drag,wp);
    state.background.transform=r.T; drag.snap=r.snap;
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
  if(touchArm){
    /* 多指手势收尾：剩余手指抬起不落点、不提交，也不推进绘制草稿（审计 P1-2） */
    if(activePointers.size===0) touchArm=false;
    drag=null; document.body.classList.remove('panning');
    return;
  }
  if(activePointers.size===0) touchArm=false;
  if(drag?.type==='pan'){ drag=null; document.body.classList.remove('panning'); return; }
  if(drag?.type==='calibPoint'){
    if(!drag.moved) calibUndoStack.pop();   /* 仅点选未拖动：弹出未变更的撤销快照 */
    drag=null; requestRender(); return;
  }
  if(drag?.type==='imageHandle'){
    const changed=dragChanged(drag);
    if(drag.moved && !changed) history.past.pop();   /* 拖回原位：不落盘、不留空快照 */
    drag=null;
    if(changed) commitChange('图片已变换'); else { updateHistoryButtons(); refreshSelectionUI(); requestRender(); }
    return;
  }
  if(drag && ['move','node','rotate','rect','shapeHandle','siteHandle'].includes(drag.type)){
    const isSite=drag.type==='siteHandle';
    /* 提交判定统一走 dragChanged 深比较；任何 pointermove 都不再等同于“已修改”（审计 P1-1） */
    const changed=dragChanged(drag);
    /* 撤销快照在 pointerdown（手柄/场地）或首次越过位移阈值（move/imageHandle）时压入；
       未产生实际变更就弹出，避免单击留下空快照 */
    const pushed=isSite||['node','rotate','rect','shapeHandle'].includes(drag.type)||!!drag.moved;
    if(!changed && pushed) history.past.pop();
    if(isSite && changed && state.site) state.site.updatedAt=nowISO();
    const changedIds=dragChangedIds(drag);
    drag=null;
    if(changed) commitChange(undefined, changedIds); else { updateHistoryButtons(); refreshSelectionUI(); requestRender(); }
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
      if(!(e.shiftKey||e.ctrlKey||e.metaKey)) selectedIds.clear();
      state.objects.forEach(o=>{ if(isVisible(o)&&boundsIntersect(objectBounds(o),rb)) selectedIds.add(o.id); });
    }
    rubber=null; refreshSelectionUI(); requestRender();
  }
});
canvas.addEventListener('pointercancel',e=>{
  activePointers.delete(e.pointerId);
  if(activePointers.size===0){ pinch=null; touchArm=false; }
  cancelActiveDrag();          /* 系统取消：回滚到按下前，不留半拖拽对象（审计 P1-2） */
  rubber=null; document.body.classList.remove('panning'); setCursorScreen(null); requestRender();
});
/* 指针捕获意外丢失（元素被移除、系统抢占等）：等价于 pointercancel，必须回滚而不是静默丢弃状态 */
canvas.addEventListener('lostpointercapture',()=>{
  if(!drag) return;
  cancelActiveDrag();
  rubber=null; document.body.classList.remove('panning');
  requestRender();
});
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
  if(currentTool==='calibrate'){ finishDraft(); return; }
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
  const site=state.site;
  if(!site||!siteIsVisible(site)||siteIsLocked(site)) return;
  const sh=siteShapeOf(site);
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
  syncFramePan(); state.site.updatedAt=nowISO(); commitChange('场地节点已更新');
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
    if(o.points.length<=lineMinNodes(o)){ toast(L('至少保留 {n} 个节点',{n:lineMinNodes(o)}),'warn'); return; }
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
    pushHistory(); insertLineNode(o,best.k,snapPoint(foot,e)); commitChange('已插入节点',[o.id]);
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

/* -------------------- 矢量场地控制点编辑（「场地节点」工具） --------------------
 * 控制点清单与拖拽改写统一由 geometry.js 提供（siteHandlesOf / siteHandleList / siteHandleDragTo /
 * resizeSiteByHandle），本文件只负责事件分发与命中。 */
/** 命中场地控制点（屏幕阈值，与对象手柄一致） */
function siteHandleAt(wp,sp){
  const site=state.site;
  if(!site||!siteIsVisible(site)||siteIsLocked(site)) return null;
  return pickScreenHandle(siteHandleList(),sp,9);
}
/** 图片变换手柄命中：与对象/场地手柄共用 pickScreenHandle 的 9px 阈值 */
function imageHandleAt(sp){
  return pickScreenHandle(imageHandleList(state.background),sp,9);
}
/** 拖拽场地控制点：实现见 geometry.js 的 siteHandleDragTo / resizeSiteByHandle（薄包装） */
/** 稳定序列化比较：键顺序不同但内容相同视为未变（RT-P2-05，复用 mergeStable）。 */
function sameSerializable(a,b){
  if(a===b) return true;
  try{ return mergeStable(a)===mergeStable(b); }catch(_){ return false; }
}
/** 对象是否发生业务变更：updatedAt 在拖拽过程中必变，不能当作变更证据，比较前剔除（审计 P1-1） */
function objectMovedFrom(orig,o){
  if(!orig||!o) return false;
  const a=Object.assign({},orig), b=Object.assign({},o);
  delete a.updatedAt; delete b.updatedAt;
  return !sameSerializable(a,b);
}
/** 拖拽实际变更的对象 id（N-06）：只给真正变化的对象打点，拖回原位/微抖不计 */
function dragChangedIds(d){
  if(!d) return [];
  if(d.type==='move'){
    const idx=objectIndexById();
    const ids=[];
    d.originals.forEach((orig,id)=>{ if(objectMovedFrom(orig,idx.get(id))) ids.push(id); });
    return ids;
  }
  if(['node','rotate','rect','shapeHandle'].includes(d.type)) return objectMovedFrom(d.original,state.objects.find(x=>x.id===d.id))?[d.id]:[];
  return [];
}
/** 当前拖拽是否产生实际变更：click/pointermove 抖动、拖回原位都不算（审计 P1-1） */
function dragChanged(d){
  if(!d) return false;
  if(['move','node','rotate','rect','shapeHandle'].includes(d.type)) return dragChangedIds(d).length>0;
  if(d.type==='siteHandle') return !sameSerializable(d.originalShape,state.site?.shape);
  if(d.type==='imageHandle') return !!d.origin&&!sameSerializable(state.background?.transform,d.origin);
  if(d.type==='calibPoint') return !!d.moved;
  return false;
}
/** Esc/系统取消中指拖拽：把对象恢复到 pointerdown 前，并弹出当时压入的撤销快照（审计 P2-16） */
function cancelActiveDrag(){
  if(!drag) return false;
  const d=drag; drag=null;
  document.body.classList.remove('panning');
  if(d.type==='pan') return true;
  const changed=dragChanged(d);
  if(d.type==='move'){
    const idx=objectIndexById();
    d.originals.forEach((orig,id)=>{ const o=idx.get(id); if(o) Object.assign(o,deepClone(orig)); });
    if(d.moved) history.past.pop();
  }else if(['node','rotate','rect','shapeHandle'].includes(d.type)){
    const o=state.objects.find(x=>x.id===d.id);
    if(o && d.original) Object.assign(o,deepClone(d.original));
    history.past.pop();
  }else if(d.type==='siteHandle'){
    if(state.site) state.site.shape=deepClone(d.originalShape);
    syncFramePan();                 /* 形状还原后同步取景框，视野回到拖拽前 */
    history.past.pop();
  }else if(d.type==='imageHandle'){
    if(d.moved){ state.background.transform=deepClone(d.origin); history.past.pop(); }
  }else if(d.type==='calibPoint'){
    /* 校准控制点走独立撤销栈（不进工程历史）：拖动过就回滚快照，仅点选则弹出未变更快照 */
    if(d.moved) calibUndo(); else calibUndoStack.pop();
    requestRender(); return true;
  }else return true;
  if(changed) commitChange(undefined, dragChangedIds(d)); else { updateHistoryButtons(); refreshUI(); requestRender(); }
  return true;
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
  if(currentTool==='calibrate'){ finishCalibration(); return; }
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
/* -------------------- 校准控制点：快照 / 撤销 / 命中 --------------------
 * 校准点属于「未提交的临时输入」，不进工程撤销历史：增/删/拖拽前压入独立栈，
 * Ctrl+Z 在校准工具下优先回退控制点，提交（Enter/✓）后才真正求解并迁移对象。 */
function calibSnapshot(){ return {calib:calibPoints.map(p=>p.slice()), affine:affinePairs.map(p=>({...p}))}; }
function calibPushUndo(){
  calibUndoStack.push(calibSnapshot());
  if(calibUndoStack.length>50) calibUndoStack.shift();
}
function calibUndo(){
  const s=calibUndoStack.pop();
  if(!s) return false;
  calibPoints=s.calib; affinePairs=s.affine; calibSelection=null; refreshCalibStatus(); requestRender(); return true;
}
/* -------------------- 校准前置状态机 -------------------- */
/* 三个依赖图片底图的入口共用一份判断：UI 禁用/原因/步骤与自测、e2e 都读这里，避免再次出现
   「比例尺只看 kind、仿射还看 bgImage、图片变换直到画布才拦」的三套口径。 */
const CALIB_TOOL_KEYS=['calibrate','affine','image-transform'];
/** 工具是否需要图片底图；用于通用工具栏绑定与自测过滤 */
function isCalibTool(tool){ return CALIB_TOOL_KEYS.includes(tool); }
/**
 * 校准前置状态机（唯一判断源）。状态：
 *  S0a 无图片槽无场地 / S0b 仅矢量场地 / S1 图片槽存在但未解码 / S2 图片就绪。
 * 场地优先：矢量场地以米绘制，任何情况都不提供「以影像为基准迁移场地」的入口。
 * @param {'calibrate'|'affine'|'image-transform'} tool
 * @param {{background?:Object,site?:Object,imageReady?:boolean,calibPoints?:Array,affinePairs?:Array}} [ctx]
 *        仅自测注入用；缺省读取真实 state/bgImage/草稿。
 * @returns {{ok:boolean,reason:string,step:(null|{n:number,total?:number,min?:number,full?:number,label:string})}}
 */
function calibPrecheck(tool,ctx){
  const c=ctx||{};
  const bg=c.background!==undefined?c.background:state.background;
  const site=c.site!==undefined?c.site:state.site;
  const imageReady=c.imageReady!==undefined?!!c.imageReady:!!bgImage;
  const imageState=c.imageState!==undefined?String(c.imageState):(bgImage?'ready':bgImageState);
  const calibratePts=c.calibPoints||calibPoints;
  const affinePts=c.affinePairs||affinePairs;
  const hasImage=isImageBackground(bg), hasSite=!!site;
  if(!isCalibTool(tool)) return {ok:false,reason:L('未知的校准工具'),step:null};
  if(!hasImage){
    if(tool==='image-transform')
      return {ok:false,reason:hasSite?L('图片变换仅适用于图片底图'):L('请先导入图片底图'),step:null};
    return {ok:false,reason:hasSite?L('场地按米绘制，无需校准'):L('请先导入图片底图'),step:null};
  }
  if(!imageReady){
    if(imageState==='missing')
      return {ok:false,reason:L('底图资产缺失，请重新导入底图'),step:null,assetMissing:true};
    return {ok:false,reason:L('图片底图正在解码，请稍后重试'),step:null};
  }
  if(tool==='calibrate'){
    const n=Math.min(2,Math.max(0,(calibratePts||[]).length));
    const label=n>=2
      ?L('比例尺 2/2：拖动调整控制点，Enter/✓ 应用')
      :L('比例尺 {n}/2：点击第 {k} 个已知点',{n:n+1,k:n+1});
    return {ok:true,reason:'',step:{n,total:2,label}};
  }
  if(tool==='affine'){
    const n=Math.max(0,(affinePts||[]).length);
    const label=n>=3
      ?L('仿射 ≥3：已记录 {n} 点，Enter/✓ 求解（≥3 点为完整仿射）',{n})
      :n===2
        ?L('仿射 2/2：再记录 1 点即完整仿射；当前 2 点可按相似求解')
        :L('仿射 {n}/2：点击第 {k} 个已知点并输入实地坐标',{n:n+1,k:n+1});
    return {ok:true,reason:'',step:{n,min:2,full:3,label}};
  }
  return {ok:true,reason:'',step:null};
}
/** 顶栏/工具栏按钮与步骤 chip 的唯一刷新入口（载入、导入、切层、撤销、点增删后调用） */
function refreshCalibStatus(){
  const status=$('calibStatus');
  const xformBtn=(typeof document!=='undefined'&&typeof document.querySelector==='function')
    ?document.querySelector('.tool-btn[data-tool="image-transform"]'):null;
  const items=[[$('calibBtn'),'calibrate'],[$('affineBtn'),'affine'],
    [xformBtn,'image-transform']];
  const reasons=[];
  items.forEach(([btn,tool])=>{
    if(!btn) return;
    const p=calibPrecheck(tool);
    if(!btn.dataset.baseTitle) btn.dataset.baseTitle=btn.title||'';
    btn.disabled=!p.ok;
    btn.setAttribute('aria-describedby','calibStatus');
    btn.title=p.ok?(btn.dataset.baseTitle||''):p.reason;
    if(!p.ok&&p.reason&&!reasons.includes(p.reason)) reasons.push(p.reason);
  });
  if(!status) return;
  let text=reasons.join('；');
  if(!text&&isCalibTool(currentTool)){
    const p=calibPrecheck(currentTool);
    if(p.ok&&p.step) text=p.step.label;
  }
  status.textContent=text;
  status.hidden=!text;
}
/** 命中校准控制点（屏幕 9px，与对象/场地手柄同阈值）：比例尺点；仿射的红点(源)与绿点(目标) */
function calibHitAt(sp){
  if(currentTool==='calibrate'){
    for(let i=0;i<calibPoints.length;i++){
      const s=w2s(calibPoints[i]);
      if(Math.hypot(s[0]-sp[0],s[1]-sp[1])<=9) return {kind:'calibrate',index:i};
    }
    return null;
  }
  if(currentTool==='affine'&&isImageBackground(state.background)){
    for(let i=0;i<affinePairs.length;i++){
      const p=affinePairs[i];
      const src=w2s(bgPixelToWorld(state.background,[p.u,p.v]));
      if(Math.hypot(src[0]-sp[0],src[1]-sp[1])<=9) return {kind:'affine',part:'src',index:i};
      const dst=w2s([p.x,p.y]);
      if(Math.hypot(dst[0]-sp[0],dst[1]-sp[1])<=9) return {kind:'affine',part:'dst',index:i};
    }
  }
  return null;
}
async function finishCalibration(){
  if(!isImageBackground(state.background)){ calibPoints=[]; setTool('select'); toast('比例尺校准仅适用于图片底图','warn'); return; }
  if(calibPoints.length<2){ toast(L('比例尺校准需要 2 个控制点（当前 {n} 个）',{n:calibPoints.length}),'warn'); return; }
  const old=dist(calibPoints[0],calibPoints[1]);
  if(old<EPS){ calibPoints=[]; return; }
  const value=await showPrompt({title:L('比例尺校准'),label:L('两点之间的实际距离（米）'),value:fmt(old)});
  if(value===null||Number.isNaN(Number(value))||Number(value)<=0){ calibPoints=[]; setTool('select'); return; }
  pushHistory();
  const factor=Number(value)/old;
  /* 米/像素改变后，世界坐标(0,0) 仍对应图片左上角，已有对象必须围绕世界原点同比缩放，
     才能保持其在底图上的像素位置不变（围绕校准点缩放会让点位相对底图漂移，见评估报告 5.1）。
     校准两点间的新世界距离 = 旧距离×factor = 输入值，校准语义同时成立。
     B-12：统一走 applyWorldTransform，对象/场地/底图（含已有仿射 transform）一起迁移，避免只改其一时错位。 */
  state.background.calibrated=true;
  applyWorldTransform([factor,0,0,0,factor,0]);
  calibPoints=[]; fitView(); commitChange(L('比例尺已校准')); setTool('select');
}
/** 兼容旧签名：围绕 center 等比缩放（B-12 起转为 applyWorldTransform 的包装，场地与底图同步迁移） */
function scaleWorldAround(center,factor){
  const c=center||[0,0], k=Number(factor);
  return applyWorldTransform([k,0,c[0]*(1-k),0,k,c[1]*(1-k)]);
}

/* ==================== 多点仿射校准（旋转 / 不等比缩放 / 纠偏） ==================== */
/** 记录一个校准点：图上点击位置反解为原图像素 (u,v)，再让用户输入该点的实地坐标 (x,y) */
async function pickAffinePoint(e){
  const bg=state.background;
  if(bg.kind!=='image'){ toast('仿射校准仅适用于图片底图','warn'); return; }
  const wp=pointerWorld(e);
  const px=bgWorldToPixel(bg,wp);
  const v=await showPrompt({title:L('仿射校准 · 第 {n} 点',{n:affinePairs.length+1}),
    label:L('该点的实地坐标 X,Y（米，逗号分隔）。已记录图上像素 ({x}, {y})',{x:px[0].toFixed(1),y:px[1].toFixed(1)}),
    value:fmt(wp[0])+','+fmt(wp[1])});
  if(v===null) return;
  const m=String(v).split(/[,，\s]+/).map(Number);
  if(!Number.isFinite(m[0])||!Number.isFinite(m[1])){ toast(L('坐标无效，请输入 X,Y'),'error'); return; }
  affinePairs.push({u:px[0],v:px[1],x:m[0],y:m[1]});
  refreshCalibStatus();
  requestRender();
  toast(affinePairs.length>=2?L('已记录 {n} 个点，Enter/✓ 求解',{n:affinePairs.length}):L('已记录 1 个点，继续点击下一已知点'));
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
  /* M = 新(像素→世界) ∘ 旧(世界→像素)：把既有对象/场地从旧世界坐标搬到新世界坐标，
     底图直接落新 transform（B-12 统一入口，避免只迁移对象导致场地/底图错位） */
  const M=affMul([tNew.a,tNew.b,tNew.c,tNew.d,tNew.e,tNew.f], affInv([tOld.a,tOld.b,tOld.c,tOld.d,tOld.e,tOld.f]));
  applyWorldTransform(M,{bgTransform:tNew});
  bg.calibrated=true;
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
  /* 批量复制：编号作用域一次建立，避免每个副本都全量扫描 state.objects */
  withObjectNameScope(allObjectNames(), () => olds.forEach(o=>{
    const n=deepClone(o); n.id=uid('OBJ'); n.name=nextObjectId(); n.x+=1;n.y+=1; if(n.points)n.points=n.points.map(p=>[p[0]+1,p[1]+1]); n.z=state.objects.length; state.objects.push(n); fresh.push(n.id);
  }));
  selectedIds=new Set(fresh); commitChange('已复制对象', fresh);
}
function copySelected(){
  clipboard=state.objects.filter(o=>selectedIds.has(o.id)).map(o=>deepClone(o));
  if(clipboard.length) toast(L('已复制 {n} 个对象到剪贴板',{n:clipboard.length}));
}
function pasteClipboard(){
  if(!clipboard.length) return;
  pushHistory();
  const fresh=[];
  withObjectNameScope(allObjectNames(), () => clipboard.forEach(o=>{
    const n=deepClone(o);
    n.id=uid('OBJ'); n.name=nextObjectId();
    n.x+=1;n.y+=1; if(n.points)n.points=n.points.map(p=>[p[0]+1,p[1]+1]);
    n.createdAt=nowISO(); n.updatedAt=nowISO();
    state.objects.push(n); fresh.push(n.id);
  }));
  selectedIds=new Set(fresh); commitChange(L('已粘贴 {n} 个对象',{n:fresh.length}));
}
/* -------------------- 帮助中心（D-03）：快捷键 / 概念词典 / 导出检查清单 -------------------- */
/* 三页签共用现有 modal；新增文案在渲染时经 L()，英文条目集中于 i18n PHRASES */
function helpShortcutRows(){
  return [
    ['Ctrl + Z / Y',L('撤销 / 重做')],['Delete / Backspace',L('删除选中对象')],
    ['Ctrl + D',L('原地复制选中对象')],['Ctrl + C / V',L('复制 / 粘贴对象（偏移 1m）')],
    [L('Esc / 右键（绘制中）'),L('取消当前绘制 / 清除选择（右键取消测距等逐点录入，无草稿时平移）')],[L('双击 / Enter'),L('完成测距、折线或面积标注（双击处不会产生重复节点）')],
    [L('Backspace（绘制中）'),L('删除上一个录入节点')],
    [L('双击线段 / 双击节点（选择工具）'),L('在折线上插入节点 / 删除节点')],
    [L('Shift（画线/标注/拖节点时）'),L('约束为水平/垂直线（正交）')],
    [L('Shift（拖矩形/椭圆/扇形时）'),L('正方形 / 正圆 / 45°方位吸附')],
    [L('对象捕捉'),L('自动吸附端点□ 中点△ 圆心◎ 象限◇ 垂足⊥ 交点× 切点；画线时橙色虚线=45°极轴/平行追踪')],
    ['Tab / Shift+Tab',L('画布聚焦时循环切换捕捉类型（自动→端点→中点→圆心→象限点→交点→垂足→切点）；点击底部捕捉徽标恢复自动')],
    ['F6',L('在顶栏 / 左侧工具栏 / 侧栏页签之间循环焦点（画布内 Tab 用于捕捉，需离开画布时按 F6）')],
    [L('空格 + 拖拽'),L('临时平移画布')],
    [L('方向键'),L('移动选中对象（Shift ×10 倍步距）')],['F',L('适应窗口（显示整张场地）')],
    [L('滚轮 / 右键拖拽'),L('缩放 / 平移画布')],
    [L('触屏单指 / 双指'),L('单指绘制与移动；双指捏合缩放、双指拖动平移')],
    [L('拖拽文件到画布'),L('导入 JSON / DXF / CSV·TSV·XLSX 表格或底图图片')],['?',L('显示本帮助')]
  ];
}
function helpGlossaryRows(){
  return [
    [L('图片底图'), L('栅格图片（PNG/JPG/WebP）。先校准像素→米；只影响图片与业务对象，不改场地坐标。')],
    [L('矢量场地'), L('按米制绘制的矩形/圆形/椭圆/扇形/平行四边形/多边形边界；无需校准。')],
    [L('楼层'), L('每层独立底图/场地与对象；图层、类型、工程库与 JSON 跨层共享。')],
    [L('比例尺'), L('用两点及其实距求像素→米比例与旋转；仅作用于图片底图。')],
    [L('仿射'), L('用已知点及真实 X,Y 求图片到世界的变换；2 点=相似，≥3 点=完整仿射。')],
    [L('覆盖率口径'), L('按摄像头视场角与安装高度投影，统计可见设备覆盖率与盲区。')]
  ];
}
function helpExportRows(){
  return [
    [L('JSON 工程'), L('全部楼层、底图与照片，可回导。')],
    [L('PNG 高清图'), L('当前楼层位图快照，放大不保真。')],
    [L('SVG 矢量图'), L('当前楼层矢量图，底图嵌入，可无损缩放。')],
    [L('PDF 矢量（图纸+清单）'), L('图纸页为位图页；清单独立分页。')],
    [L('DXF（CAD 互通）'), L('场地为独立 SITE 图层；毫米坐标可在 CAD 编辑。')],
    [L('CSV 表格'), L('全楼层台账；= + - @ 开头加单引号防公式注入。')],
    [L('TSV 表格'), L('同 CSV，制表符分隔；同一公式防护。')],
    [L('Excel (.xlsx)'), L('全楼层台账；单元格按文本写入，无公式。')]
  ];
}
function helpRowsHTML(rows,cls='kbd'){
  return '<div class="help-grid">'+rows.map(r=>'<span class="'+cls+'">'+esc(r[0])+'</span><span>'+esc(r[1])+'</span>').join('')+'</div>';
}
function helpTabDefs(){
  return [
    {key:'shortcuts', label:L('快捷键')},
    {key:'glossary', label:L('概念词典')},
    {key:'exports', label:L('导出检查清单')}
  ];
}
function helpPanelHTML(key){
  if(key==='glossary') return helpRowsHTML(helpGlossaryRows(),'help-term');
  if(key==='exports') return helpRowsHTML(helpExportRows(),'help-term');
  return helpRowsHTML(helpShortcutRows());
}
function switchHelpTab(key){
  const body=$('modalBody');
  body.querySelectorAll('[data-help-tab]').forEach(btn=>{
    const on=btn.dataset.helpTab===key;
    btn.classList.toggle('active',on);
    btn.setAttribute('aria-selected',on?'true':'false');
  });
  body.querySelectorAll('[data-help-panel]').forEach(panel=>{ panel.hidden=panel.dataset.helpPanel!==key; });
}
function openShortcutsHelp(){
  /* 先聚焦画布：openModal 记录当前焦点，Esc 关闭后焦点回到画布可继续绘图 */
  try{ $('canvas').focus(); }catch(_){}
  const tabs=helpTabDefs();
  const body='<div class="help-tabs" role="tablist">'+
    tabs.map((t,i)=>'<button type="button" class="help-tab'+(i?'':' active')+'" data-help-tab="'+t.key+'" role="tab" aria-selected="'+(i?'false':'true')+'">'+esc(t.label)+'</button>').join('')+
    '</div>'+
    tabs.map((t,i)=>'<section class="help-panel" data-help-panel="'+t.key+'" role="tabpanel"'+(i?' hidden':'')+'>'+helpPanelHTML(t.key)+'</section>').join('');
  openModal(L('帮助中心'),body,[{text:L('知道了'),class:'primary',click:closeModal}]);
  $('modalBody').querySelectorAll('[data-help-tab]').forEach(btn=>btn.addEventListener('click',()=>switchHelpTab(btn.dataset.helpTab)));
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
/* 方向键连按/长按合并为一次撤销快照：首次 keydown 压栈，keyup 复位（审计 P1-13） */
let arrowHistoryArmed=false;
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
/* CORE-P2-9：Esc 中断统一复位（拖拽先回滚，再清草稿/框选/捕捉/校准草稿；保留覆盖率叠加） */
function escapeInterrupt(){
  if(cancelActiveDrag()) return 'drag';
  resetTransientInteractionState({keepCoverage:true});
  selectedIds.clear(); setTool('select'); refreshUI(); return 'reset';
}
/* CORE-P2-9：窗口失焦只结束进行中的交互，保留校准点、参考线与覆盖率叠加 */
function handleWindowBlur(){
  if(drag) cancelActiveDrag();
  resetTransientInteractionState({keepCalib:true,keepGuides:true,keepCoverage:true});
  spaceDown=false;
  if(typeof document!=='undefined'&&document.body&&document.body.classList) document.body.classList.remove('panning');
  requestRender();
}
window.addEventListener('blur',handleWindowBlur);
window.addEventListener('keydown',e=>{
  if(e.defaultPrevented) return;
  const tag=(document.activeElement?.tagName||'').toLowerCase();
  const typing=['input','select','textarea'].includes(tag);
  const onCanvas=isCanvasShortcutTarget(tag);
  /* 弹窗优先：Esc 在输入框内也能关闭；Tab 在弹窗内循环；其余快捷键不穿透遮罩 */
  if($('modalBackdrop').classList.contains('show')){ modalKeydown(e); return; }
  if(typing) return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){ e.preventDefault(); if(!e.shiftKey&&(currentTool==='calibrate'||currentTool==='affine')&&calibUndo()) return; e.shiftKey?redo():undo(); return; }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){ e.preventDefault(); redo(); return; }
  if(e.key==='F6'){ e.preventDefault(); cycleKeyboardRegion(); return; }
  if(e.key==='Tab'&&onCanvas){ e.preventDefault(); cycleOsnapMode(e.shiftKey); return; }
  if(e.key==='?'||(e.key==='/'&&e.shiftKey)){ openShortcutsHelp(); return; }
  if(e.key==='f'||e.key==='F'){ if(e.ctrlKey||e.metaKey) return; fitView(); return; }
  /* 参考线：Shift+G 清除全部；Backspace 删除上一条（无草稿时） */
  if(currentTool==='guide'||guideLines.length){
    if(e.shiftKey&&e.key.toLowerCase()==='g'){ clearGuides(); toast('参考线已清除'); requestRender(); return; }
    if(e.key==='Backspace'&&!draft){
      if(removeLastGuideLine()){ toast('已删除上一条参考线'); e.preventDefault(); requestRender(); return; }
    }
  }
  if((e.key==='Delete'||e.key==='Backspace')&&calibSelection&&(currentTool==='calibrate'||currentTool==='affine')){
    calibPushUndo();
    if(calibSelection.kind==='calibrate') calibPoints.splice(calibSelection.index,1);
    else affinePairs.splice(calibSelection.index,1);
    calibSelection=null; refreshCalibStatus(); requestRender(); return;
  }
  if((e.key==='Delete'||e.key==='Backspace')&&selectedIds.size){ deleteSelected(); return; }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){ e.preventDefault(); duplicateSelected(); return; }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){ e.preventDefault(); copySelected(); return; }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'){ e.preventDefault(); pasteClipboard(); return; }
  if(e.key==='Escape'){
    if(escapeInterrupt()==='drag') requestRender();
    return;
  }
  if(e.key==='Enter'&&onCanvas&&(currentTool==='affine'||currentTool==='calibrate'||(draft&&draft.points))){ finishDraft(); return; }
  if(e.key==='Backspace'&&onCanvas&&draft?.points?.length){ draft.points.pop(); requestRender(); return; }
  if(e.code==='Space'&&onCanvas){ e.preventDefault(); spaceDown=true; document.body.classList.add('panning'); canvas.style.cursor='grabbing'; return; }
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)&&selectedIds.size&&onCanvas){
    const items=state.objects.filter(o=>selectedIds.has(o.id)&&isEditable(o)); if(!items.length) return;
    e.preventDefault(); const step=(state.settings.gridSize||1)*(e.shiftKey?10:1);
    const d={ArrowUp:[0,step],ArrowDown:[0,-step],ArrowLeft:[-step,0],ArrowRight:[step,0]}[e.key];
    if(!arrowHistoryArmed){ pushHistory(); arrowHistoryArmed=true; }
    items.forEach(o=>{o.x+=d[0];o.y+=d[1];if(o.points)o.points=o.points.map(p=>[p[0]+d[0],p[1]+d[1]]);}); commitChange(undefined, items.map(o=>o.id));
  }
});
window.addEventListener('keyup',e=>{
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) arrowHistoryArmed=false;
  if(e.code==='Space'&&spaceDown){ spaceDown=false; document.body.classList.remove('panning'); document.body.className='tool-'+currentTool; }
});

/* 关闭/刷新页面前强制落盘：IndexedDB 事务尽力触发，localStorage 同步兜底，杜绝最后编辑丢失 */
function flushBeforeUnload(){
  try{
    clearTimeout(saveTimer);
    const snapshot=persistableState();
    writeLocalDraft(snapshot);
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
