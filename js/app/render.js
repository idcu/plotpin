/* render.js —— 命中测试与 Canvas 全量渲染 */
/* 鼠标屏幕位置（由 interaction 的 pointermove 写入）；inside=false 时不画十字 */
let cursorScreen=null;
function setCursorScreen(p,inside,wp,snap){ cursorScreen=p?{x:p[0],y:p[1],inside:inside!==false,wp:wp||null,snap:snap||null}:null; }
/* 属性面板聚焦的折线节点 {id,index}，在画布上高亮 */
let focusNode=null;
function setFocusNode(v){ focusNode=v; requestRender(); }
/* -------------------- 命中测试 / 选择 -------------------- */
function isVisible(o){ const l=layerOf(o); return o.visible!==false && l.visible!==false; }
function isEditable(o){ const l=layerOf(o); return !o.locked && !l.locked; }
function hitObject(p,screenP){
  const tol=8/state.viewport.zoom;
  for(let i=state.objects.length-1;i>=0;i--){
    const o=state.objects[i];
    if(!isVisible(o)) continue;
    if(o.kind==='point'){
      const shape=getType(o.typeId).scaleShape||'none';
      if((o.phys||0)>0 && shape!=='none' && hitPhysicalPoint(o,shape,p)) return o;
      const s=w2s([o.x,o.y]);
      if(Math.hypot(s[0]-screenP[0],s[1]-screenP[1])<=11*pointIconScale(o)) return o;
    }else if(o.kind==='rect'){
      if(shapeHit(o,p)) return o;
    }else if(o.kind==='text'){
      if(pointInPolygon(p,textCorners(o))) return o;
    }else if(o.closed && o.points.length>=3){
      if(pointInPolygon(p,o.points)) return o;
    }else if(o.kind==='dimension' && o.subtype==='area' && o.points.length>=3){
      if(pointInPolygon(p,o.points)) return o;
    }else{
      const ps=o.points;
      for(let k=1;k<ps.length;k++) if(distanceToSegment(p,ps[k-1],ps[k])<=tol) return o;
      if(o.kind==='dimension' && o.subtype==='angle' && ps.length>=3){
        if(dist(p,ps[0])<=tol) return o;
      }
    }
  }
  return null;
}
function getHandles(o){
  if(!o || o.locked || layerOf(o).locked) return [];
  const handles=[];
  if(o.kind==='point'){
    const a=o.angle*Math.PI/180, off=28*pointIconScale(o)/state.viewport.zoom;
    handles.push({type:'rotate',kind:'pointRotate',x:o.x+Math.cos(a)*off,y:o.y+Math.sin(a)*off});
  }else if(o.kind==='text'){
    const a=(o.angle+90)*Math.PI/180, off=28/state.viewport.zoom;
    handles.push({type:'rotate',x:o.x+Math.cos(a)*off,y:o.y+Math.sin(a)*off});
  }else if(o.kind==='rect'){
    areaShapeHandles(o,handles);
  }else if(o.points){
    o.points.forEach((p,i)=>handles.push({type:'node',index:i,x:p[0],y:p[1]}));
  }
  return handles;
}
/** 区域形状控制点：矩形=4角+旋转；圆=半径端；椭圆=两轴端+旋转；扇形=两边端（半径+角度）+弧中点（半径） */
function areaShapeHandles(o,handles){
  const tt=areaShapeType(o);
  if(tt==='rect'){
    rectPoints(o).forEach((p,i)=>handles.push({type:'rect',index:i,x:p[0],y:p[1]}));
    const c=objectCenter(o), a=(o.angle+90)*Math.PI/180, off=Math.max(.55,30/state.viewport.zoom);
    handles.push({type:'rotate',x:c[0]+Math.cos(a)*off,y:c[1]+Math.sin(a)*off});
    return;
  }
  const sh=o.shape;
  if(tt==='circle'){
    handles.push({type:'shapeHandle',mode:'arcR',x:o.x+sh.r,y:o.y});
  }else if(tt==='ellipse'){
    const a=o.angle*Math.PI/180, b=a+Math.PI/2;
    handles.push({type:'shapeHandle',mode:'rx',x:o.x+Math.cos(a)*sh.rx,y:o.y+Math.sin(a)*sh.rx});
    handles.push({type:'shapeHandle',mode:'ry',x:o.x+Math.cos(b)*sh.ry,y:o.y+Math.sin(b)*sh.ry});
    const off=Math.max(.55,30/state.viewport.zoom);
    handles.push({type:'rotate',x:o.x+Math.cos(b)*off,y:o.y+Math.sin(b)*off});
  }else if(tt==='sector'){
    const p=a=>[o.x+sh.r*Math.cos(a*Math.PI/180),o.y+sh.r*Math.sin(a*Math.PI/180)];
    const a0=Number(sh.a0)||0, mid=a0+sectorSweep(sh)/2;
    handles.push({type:'shapeHandle',mode:'edge0',x:p(a0)[0],y:p(a0)[1]});
    handles.push({type:'shapeHandle',mode:'edge1',x:p(a0+sectorSweep(sh))[0],y:p(a0+sectorSweep(sh))[1]});
    handles.push({type:'shapeHandle',mode:'arcR',x:p(mid)[0],y:p(mid)[1]});
  }
}
function handleAt(p,screenP){
  if(selectedIds.size!==1) return null;
  const o=state.objects.find(x=>x.id===Array.from(selectedIds)[0]);
  if(!o) return null;
  const hs=getHandles(o);
  for(const h of hs){
    const s=w2s([h.x,h.y]);
    if(Math.hypot(s[0]-screenP[0],s[1]-screenP[1])<=9) return {object:o,...h};
  }
  return null;
}

/* -------------------- 渲染 -------------------- */
let renderQueued=false;
function requestRender(){
  if(renderQueued) return;
  renderQueued=true;
  requestAnimationFrame(()=>{ renderQueued=false; drawScene(ctx,state.viewport,wrap.clientWidth,wrap.clientHeight,{interactive:true,markerScale:1}); });
}
function drawScene(c,v,cssW,cssH,opt={}){
  const d=worldDims();
  const toS=p=>w2s(p,v,d);
  c.clearRect(0,0,cssW,cssH);
  c.fillStyle='#ffffff'; c.fillRect(0,0,cssW,cssH);
  drawBackground(c,v,d,cssW,cssH,toS);
  drawGrid(c,v,d,cssW,cssH,toS);
  drawCoverage(c,v,d);
  drawAxes(c,v,toS,cssH);
  const visible=state.objects.filter(isVisible).sort((a,b)=>a.z-b.z);
  /* exportGain=导出清晰度增益(交互为1)；iconBoost 再乘用户全局点大小倍率，仅作用于点设备图标 */
  const exportGain=opt.markerScale||1;
  const iconBoost=exportGain*(Number(state.settings.markerScale)||1);
  visible.forEach(o=>drawObject(c,o,v,toS,iconBoost,exportGain));
  drawDraft(c,v,d,toS);
  drawCalibration(c,toS);
  if(opt.interactive){
    drawSelection(c,v,toS);
    drawRubber(c);
    drawCursorCross(c,v,d,cssW,cssH);
    drawTrackLine(c,v,d,cssW,cssH,toS);
    drawNodeFocus(c,toS);
    drawDragHud(c,toS);
    drawOsnapMarker(c,toS);
  }
}
/** 深色胶囊小标签（屏幕固定字号），(x,y) 为标签左上角；段长度/十字坐标共用 */
function drawScreenTag(c,x,y,text){
  c.save();
  c.font='11px Consolas,Menlo,monospace';
  const padX=5, padY=3, m=c.measureText(text);
  const w=m.width+padX*2, h=15+padY;
  x=Math.max(2,Math.min(x,c.canvas.clientWidth-w-2));
  y=Math.max(2,Math.min(y,c.canvas.clientHeight-h-2));
  c.fillStyle='rgba(15,23,42,.82)';
  c.beginPath(); c.roundRect?c.roundRect(x,y,w,h,4):c.rect(x,y,w,h); c.fill();
  c.fillStyle='#e2e8f0'; c.textBaseline='middle'; c.textAlign='left';
  c.fillText(text,x+padX,y+h/2+0.5);
  c.restore();
}
/** 鼠标十字准星：贯穿画布的虚线 + 中心方框 + 吸附后世界坐标；平移/校准工具下隐藏 */
function drawCursorCross(c,v,d,cssW,cssH){
  if(!state.settings.showCursor || !cursorScreen || cursorScreen.inside===false) return;
  if(['pan','calibrate'].includes(currentTool)) return;
  const x=cursorScreen.x, y=cursorScreen.y;
  /* 坐标直接取交互层算好的最终落点（已含网格吸附与 Shift 正交/极轴），所见即所点 */
  const wp=cursorScreen.wp || snapPoint(s2w([x,y],v,d),{shiftKey:false});
  c.save();
  c.strokeStyle='rgba(37,99,235,.55)'; c.lineWidth=1; c.setLineDash([5,5]);
  c.beginPath(); c.moveTo(0,y); c.lineTo(cssW,y); c.moveTo(x,0); c.lineTo(x,cssH); c.stroke();
  c.setLineDash([]); c.strokeStyle='#2563eb';
  c.strokeRect(x-5,y-5,10,10);
  c.restore();
  drawScreenTag(c,x+12,y+12,`X ${fmt(wp[0])}  Y ${fmt(wp[1])} ${state.settings.unit}`);
}
/* 极轴/平行追踪虚线：从上一已接受点沿参考方向贯穿画布（橙色点划线） */
function drawTrackLine(c,v,d,cssW,cssH,toS){
  if(!trackLine) return;
  const o=toS(trackLine.from);
  /* 世界方向(屏幕 Y 翻转)，按屏幕斜率取与画布边界的两个交点 */
  const sx=trackLine.dir[0]*v.zoom, sy=-trackLine.dir[1]*v.zoom;
  if(Math.hypot(sx,sy)<1e-9) return;
  let tmin=-1e9,tmax=1e9;
  if(Math.abs(sx)>1e-9){ const t1=-o.x/sx, t2=(cssW-o.x)/sx; tmin=Math.max(tmin,Math.min(t1,t2)); tmax=Math.min(tmax,Math.max(t1,t2)); }
  if(Math.abs(sy)>1e-9){ const t1=-o.y/sy, t2=(cssH-o.y)/sy; tmin=Math.max(tmin,Math.min(t1,t2)); tmax=Math.min(tmax,Math.max(t1,t2)); }
  c.save(); c.strokeStyle='rgba(217,119,6,.7)'; c.lineWidth=1; c.setLineDash([7,4,2,4]);
  c.beginPath();
  c.moveTo(o.x+sx*tmin,o.y+sy*tmin); c.lineTo(o.x+sx*tmax,o.y+sy*tmax); c.stroke();
  c.restore();
}
/* 属性面板正在编辑的节点：黄色脉冲方框提示对应画布位置 */
function drawNodeFocus(c,toS){
  if(!focusNode) return;
  const o=state.objects.find(x=>x.id===focusNode.id);
  if(!o||!o.points||focusNode.index>=o.points.length){ focusNode=null; return; }
  const s=toS(o.points[focusNode.index]);
  c.save(); c.strokeStyle='#d97706'; c.lineWidth=2;
  c.beginPath(); c.rect(s[0]-7,s[1]-7,14,14); c.stroke();
  c.beginPath(); c.arc(s[0],s[1],2.5,0,Math.PI*2); c.fillStyle='#d97706'; c.fill();
  c.restore();
}
/* 拖折线节点时的实时数值：当前坐标 + 与相邻节点的段长（闭合折线首尾按闭合边环绕） */
function drawDragHud(c,toS){
  if(!drag||drag.type!=='node') return;
  const o=state.objects.find(x=>x.id===drag.id);
  if(!o||!o.points) return;
  const n=o.points.length, i=drag.handle.index, p=o.points[i], s=toS(p);
  const parts=[`#${i+1}  X ${fmt(p[0])}  Y ${fmt(p[1])}`];
  const prev=i>0?i-1:(o.closed?n-1:-1);
  const next=i<n-1?i+1:(o.closed?0:-1);
  if(prev>=0 && prev!==i) parts.push('↩ '+fmt(dist(p,o.points[prev]))+' m');
  if(next>=0 && next!==i && next!==prev) parts.push('↪ '+fmt(dist(p,o.points[next]))+' m');
  drawScreenTag(c,s[0]+12,s[1]-28,parts.join('   '));
}
/* OSNAP 命中标记：端点□ 中点△ 圆心◎ 象限◇ 垂足⊥ 交点× 切点(圆+切线)；附类型文字 */
function drawOsnapMarker(c,toS){
  if(!cursorScreen||!cursorScreen.snap) return;
  const snap=cursorScreen.snap, s=toS(snap.p);
  c.save(); c.strokeStyle='#d97706'; c.fillStyle='#d97706'; c.lineWidth=1.6; c.lineCap='round';
  const k=5;
  if(snap.type==='endpoint'){
    c.strokeRect(s[0]-k,s[1]-k,k*2,k*2);
  }else if(snap.type==='midpoint'){
    c.beginPath(); c.moveTo(s[0],s[1]-k-0.5); c.lineTo(s[0]+k,s[1]+k-1); c.lineTo(s[0]-k,s[1]+k-1); c.closePath(); c.stroke();
  }else if(snap.type==='center'){
    c.beginPath(); c.arc(s[0],s[1],k,0,Math.PI*2); c.stroke();
    c.beginPath(); c.moveTo(s[0]-k-3,s[1]); c.lineTo(s[0]+k+3,s[1]); c.moveTo(s[0],s[1]-k-3); c.lineTo(s[0],s[1]+k+3); c.stroke();
  }else if(snap.type==='quadrant'){
    c.beginPath(); c.moveTo(s[0],s[1]-k); c.lineTo(s[0]+k,s[1]); c.lineTo(s[0],s[1]+k); c.lineTo(s[0]-k,s[1]); c.closePath(); c.stroke();
  }else if(snap.type==='perpendicular'){
    c.beginPath(); c.moveTo(s[0]-k,s[1]+k); c.lineTo(s[0]-k,s[1]-k); c.lineTo(s[0]+k,s[1]+k); c.stroke();
  }else if(snap.type==='intersection'){
    c.beginPath(); c.moveTo(s[0]-k,s[1]-k); c.lineTo(s[0]+k,s[1]+k); c.moveTo(s[0]+k,s[1]-k); c.lineTo(s[0]-k,s[1]+k); c.stroke();
  }else if(snap.type==='tangent'){
    c.beginPath(); c.arc(s[0],s[1],2.5,0,Math.PI*2); c.fill();
    c.beginPath(); c.moveTo(s[0]-k,s[1]+k); c.lineTo(s[0]+k,s[1]-k); c.stroke();
  }
  c.restore();
  drawScreenTag(c,s[0]+10,s[1]-26,'◈ '+(OSNAP_LABELS[snap.type]||snap.type));
}
function drawBackground(c,v,d,cssW,cssH,toS){
  const bg=state.background;
  if(bg.kind==='image' && bgImage && bgDataUrl){
    drawImageBackground(c,v,d,bg);
    return;
  }
  /* 矢量场地域矩形（左下(0,0)→右上(d.w,d.h)）的屏幕范围；用 min/abs 规避 Y 轴翻转导致的负尺寸 */
  const a=toS([0,0]), b=toS([d.w,d.h]);
  const x=Math.min(a[0],b[0]), y=Math.min(a[1],b[1]), w=Math.abs(b[0]-a[0]), h=Math.abs(b[1]-a[1]);
  /* 矢量场地：域外白色，域内浅色；形状边界用蓝色实线 */
  c.fillStyle='#ffffff'; c.fillRect(0,0,cssW,cssH);
  c.save();
  if((bg.kind==='circle'||bg.shape?.type==='circle') && bg.shape){
    const sh=bg.shape, ce=toS([sh.cx,sh.cy]);
    c.fillStyle='#eef2f7';
    c.beginPath(); c.arc(ce[0],ce[1],sh.r*v.zoom,0,Math.PI*2); c.fill();
    c.strokeStyle='#3b82f6'; c.lineWidth=2; c.stroke();
  }else if((bg.kind==='ellipse'||bg.shape?.type==='ellipse') && bg.shape){
    const sh=bg.shape, ce=toS([sh.cx,sh.cy]);
    c.fillStyle='#eef2f7';
    c.beginPath(); c.ellipse(ce[0],ce[1],sh.rx*v.zoom,sh.ry*v.zoom,screenAngle({angle:sh.angle||0}),0,Math.PI*2); c.fill();
    c.strokeStyle='#3b82f6'; c.lineWidth=2; c.stroke();
  }else if((bg.kind==='sector'||bg.shape?.type==='sector') && bg.shape){
    const sh=bg.shape, ce=toS([sh.cx,sh.cy]), R=sh.r*v.zoom;
    /* 世界角(Y上)映射屏幕角(Y下)：从 a1 端顺时针画到 a0 端 */
    c.fillStyle='#eef2f7';
    c.beginPath(); c.moveTo(ce[0],ce[1]);
    c.arc(ce[0],ce[1],R,-Number(sh.a1||0)*Math.PI/180,-Number(sh.a0||0)*Math.PI/180,false); c.closePath(); c.fill();
    c.strokeStyle='#3b82f6'; c.lineWidth=2; c.stroke();
  }else if((bg.kind==='polygon'||bg.shape?.type==='polygon') && bg.shape?.points?.length>=3){
    const pts=bg.shape.points.map(toS);
    c.beginPath(); pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1])); c.closePath();
    c.fillStyle='#eef2f7'; c.fill();
    c.strokeStyle='#3b82f6'; c.lineWidth=2; c.stroke();
  }else{
    c.fillStyle='#f8fafc'; c.fillRect(x,y,w,h);
    c.strokeStyle='#94a3b8'; c.lineWidth=1.5; c.strokeRect(x,y,w,h);
  }
  c.restore();
}
/**
 * 图片底图渲染：像素(u,v y-down) → 世界(x,y y-up) → 屏幕在 render 层用一次 canvas 变换完成，
 * 支持仿射校准后的旋转 / 不等比缩放 / 轻微切变（直线仍保持直线）。缺省无 transform 时退化为轴对齐矩形。
 */
function drawImageBackground(c,v,d,bg){
  if(!(bgImage&&bgDataUrl)) return;
  const t=validImageTransform(bg.transform)||defaultImageTransform(bg);
  /* canvas 变换矩阵列 [u 的像, v 的像, 平移]；世界 Y 向上、屏幕 Y 向下，故 d/e 分量取负 */
  c.save();
  c.transform(t.a*v.zoom, -t.d*v.zoom, t.b*v.zoom, -t.e*v.zoom,
    v.panX+(t.c-d.minX)*v.zoom, v.panY+(d.maxY-t.f)*v.zoom);
  try{ c.drawImage(bgImage,0,0); }catch(_){}
  c.restore();
  /* 四角按世界点独立描边，保证旋转后包围轮廓正确 */
  const corners=imageCornerWorld(bg).map(p=>w2s(p,v,d));
  c.save(); c.strokeStyle='#94a3b8'; c.lineWidth=1.5;
  c.beginPath(); corners.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1])); c.closePath(); c.stroke();
  c.restore();
}
/**
 * 视场覆盖率叠加层：按 analyzeCoverage 的逐区域栅格着色（绿=已覆盖 / 红=盲区），
 * 格心在区域外不绘制。叠加层数据由「覆盖率分析」写入 coverageResult，任何对象/底图变更后自动失效。
 */
function drawCoverage(c,v,d){
  const res=coverageResult;
  if(!res||!res.regions||!res.regions.length) return;
  const toS=p=>w2s(p,v,d);
  c.save();
  for(const r of res.regions){
    for(let j=0;j<r.ny;j++){
      for(let i=0;i<r.nx;i++){
        const g=r.grid[j*r.nx+i];
        if(g===2) continue;                       /* 2=区域外，不绘制 */
        const s=toS([r.minX+i*r.cell, r.minY+(j+1)*r.cell]);   /* 世界格左上角 → 屏幕 */
        c.fillStyle = g===1?'rgba(34,197,94,.26)':'rgba(239,68,68,.28)';
        c.fillRect(s[0],s[1],r.cell*v.zoom+.6,r.cell*v.zoom+.6); /* +0.6 消除相邻格的细缝 */
      }
    }
  }
  c.restore();
}
function drawGrid(c,v,d,cssW,cssH,toS){
  if(!state.settings.gridVisible) return;
  const step=niceStep(45/v.zoom);
  const a=s2w([0,cssH],v,d), b=s2w([cssW,0],v,d);
  const x0=Math.floor(Math.min(a[0],b[0])/step)*step, x1=Math.ceil(Math.max(a[0],b[0])/step)*step;
  const y0=Math.floor(Math.min(a[1],b[1])/step)*step, y1=Math.ceil(Math.max(a[1],b[1])/step)*step;
  c.save(); c.strokeStyle='rgba(100,116,139,.22)'; c.lineWidth=1;
  for(let x=x0;x<=x1+EPS;x+=step){
    const s=toS([x,0],); c.beginPath(); c.moveTo(s[0],0); c.lineTo(s[0],cssH); c.stroke();
  }
  for(let y=y0;y<=y1+EPS;y+=step){
    const s=toS([0,y]); c.beginPath(); c.moveTo(0,s[1]); c.lineTo(cssW,s[1]); c.stroke();
  }
  c.restore();
}
function drawAxes(c,v,toS,cssH){
  const o=toS([0,0]), x=toS([3,0]), y=toS([0,3]);
  c.save(); c.lineWidth=2;
  c.strokeStyle='#ef4444'; c.beginPath(); c.moveTo(o[0],o[1]); c.lineTo(x[0],x[1]); c.stroke();
  c.strokeStyle='#22c55e'; c.beginPath(); c.moveTo(o[0],o[1]); c.lineTo(y[0],y[1]); c.stroke();
  c.fillStyle='#ef4444'; c.font='bold 12px sans-serif'; c.fillText('X',x[0]+5,x[1]+4);
  c.fillStyle='#16a34a'; c.fillText('Y',y[0]-10,y[1]-6);
  drawScaleBar(c,v,cssH);
  c.restore();
}
function drawScaleBar(c,v,height){
  const target=110/v.zoom; const step=niceStep(target);
  const len=step*v.zoom, x=18, y=height-44;
  c.strokeStyle='#111827'; c.lineWidth=2;
  c.beginPath(); c.moveTo(x,y); c.lineTo(x+len,y); c.moveTo(x,y-5); c.lineTo(x,y+5); c.moveTo(x+len,y-5); c.lineTo(x+len,y+5); c.stroke();
  c.fillStyle='#111827'; c.font='12px sans-serif'; c.fillText(fmt(step)+' '+state.settings.unit,x+len/2-14,y-9);
}
function drawObject(c,o,v,toS,iconBoost,exportGain){
  const g=exportGain===undefined?iconBoost:exportGain;
  const type=getType(o.typeId), color=o.style.color||type.color||'#2563eb';
  if(o.kind==='point') drawPoint(c,o,color,type,toS,iconBoost,v);
  else if(o.kind==='rect') drawRect(c,o,color,toS,v,g);
  else if(o.kind==='line') drawLine(c,o,color,toS,v);
  else if(o.kind==='text') drawText(c,o,color,toS,v,g);
  else if(o.kind==='dimension') drawDimension(c,o,toS);
}
function screenAngle(o){ return -o.angle*Math.PI/180; }
/** 有物理尺寸的点设备：按世界坐标（米）渲染，缩放时与场地保持真实比例 */
function drawPhysicalPoint(c,o,color,type,toS,v,markerScale){
  const s=toS([o.x,o.y]), z=v.zoom, shape=type.scaleShape;
  const size=o.phys, R=size*z;                       // 尺寸基准（屏幕 px）
  c.save(); c.translate(s[0],s[1]);
  c.strokeStyle=color; c.lineWidth=Math.max(1.5,.06*z); c.fillStyle=color; c.globalAlpha=1;
  c.beginPath();
  if(shape==='circle'){
    c.arc(0,0,R/2,0,Math.PI*2);
  }else if(shape==='square'){
    const h=R/2; c.rotate(screenAngle(o)); c.rect(-h,-h,R,R);
  }else if(shape==='bar'){
    const h=R/2, lw=Math.max(2,.1*z);
    c.lineWidth=lw; c.lineCap='round'; c.moveTo(-h,0); c.lineTo(h,0);
  }else if(shape==='sector'){
    const fov=(Math.min(360,Math.max(10,Number(type.fov)||90)))*Math.PI/180, half=fov/2;
    const a=screenAngle(o);                        // 世界朝向映射到屏幕（Y 翻转）
    c.moveTo(0,0); c.arc(0,0,R,a-half,a+half); c.closePath();
  }
  c.globalAlpha=.12; c.fill(); c.globalAlpha=1; c.stroke();
  /* 中心定位点 + 朝向指示（物理图形的锚点始终清晰可点） */
  c.globalAlpha=1; c.fillStyle=color;
  if(shape==='sector'){
    c.rotate(screenAngle(o));
    c.beginPath(); c.moveTo(10,0); c.lineTo(2,-4.5); c.lineTo(2,4.5); c.closePath(); c.fill();
  }
  c.beginPath(); c.arc(0,0,3.2*markerScale,0,Math.PI*2); c.fill();
  c.restore();
  drawLabel(c,o,s[0],s[1]-Math.max(13,R/2+6),color,toS,12*markerScale);
}
function drawPoint(c,o,color,type,toS,markerScale,v){
  if((o.phys||0)>0 && (type.scaleShape&&type.scaleShape!=='none')) return drawPhysicalPoint(c,o,color,type,toS,v,markerScale);
  /* 屏幕固定图标：导出增益 × 全局倍率 × 类型默认 × 对象覆盖；缩放画布不改变图标视觉大小 */
  const k=markerScale*(Number(type.iconSize)||1)*(Number(o.iconSize)||1);
  const s=toS([o.x,o.y]), r=11*k, a=screenAngle(o);
  c.save(); c.translate(s[0],s[1]); c.rotate(a); c.scale(k,k);
  c.lineWidth=2; c.strokeStyle=color; c.fillStyle=color;
  const icon=type.icon||o.style.icon||'marker';
  if(icon==='camera'){
    c.fillStyle='#fff'; c.fillRect(-6,-5,12,10); c.strokeRect(-6,-5,12,10);
    c.fillStyle=color; c.beginPath(); c.arc(0,0,3.2,0,Math.PI*2); c.fill();
    c.beginPath(); c.moveTo(6,0); c.lineTo(16,-5); c.lineTo(16,5); c.closePath(); c.fill();
  }else if(icon==='dome'){
    c.fillStyle='#fff'; c.beginPath(); c.arc(0,0,8,Math.PI,0); c.fill(); c.stroke();
    c.beginPath(); c.arc(0,0,3,0,Math.PI*2); c.fill();
  }else if(icon==='light'){
    c.beginPath(); c.arc(0,0,7,0,Math.PI*2); c.fill(); c.strokeStyle='#fde68a'; c.lineWidth=2;
    for(let i=0;i<8;i++){ const aa=i*Math.PI/4; c.beginPath(); c.moveTo(Math.cos(aa)*9,Math.sin(aa)*9); c.lineTo(Math.cos(aa)*13,Math.sin(aa)*13); c.stroke(); }
  }else if(icon==='gate'){
    c.strokeStyle=color; c.lineWidth=3; c.beginPath(); c.moveTo(-10,0); c.lineTo(12,0); c.stroke();
    c.fillStyle=color; c.fillRect(-12,-7,5,14); c.beginPath(); c.arc(12,0,3,0,Math.PI*2); c.fill();
  }else if(icon==='charger'){
    c.fillStyle='#fff'; c.fillRect(-7,-8,14,16); c.strokeRect(-7,-8,14,16);
    c.strokeStyle=color; c.lineWidth=2; c.beginPath(); c.moveTo(1,-5); c.lineTo(-3,2); c.lineTo(2,2); c.lineTo(-1,8); c.stroke();
  }else if(icon==='warning'){
    c.fillStyle=color; c.beginPath(); c.moveTo(0,-11); c.lineTo(11,9); c.lineTo(-11,9); c.closePath(); c.fill();
    c.fillStyle='#fff'; c.font='bold 13px sans-serif'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('!',0,2);
  }else if(icon==='custom'){
    c.fillStyle=color; c.beginPath(); c.moveTo(0,-10); c.lineTo(10,0); c.lineTo(0,10); c.lineTo(-10,0); c.closePath(); c.fill();
  }else{
    c.fillStyle='#fff'; c.beginPath(); c.arc(0,0,7,0,Math.PI*2); c.fill(); c.strokeStyle=color; c.stroke();
    c.fillStyle=color; c.beginPath(); c.arc(0,0,3.5,0,Math.PI*2); c.fill();
  }
  c.restore();
  drawLabel(c,o,s[0],s[1]-r-8,color,toS,12*k);
}
/** 区域统一渲染：矩形/圆/椭圆/扇形都走 shapeWorldPoints 同一条世界坐标路径 */
function drawRect(c,o,color,toS,v,markerScale){
  const pts=shapeWorldPoints(o).map(toS);
  c.beginPath(); pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1])); c.closePath();
  c.fillStyle=color; c.globalAlpha=styleVal(o,'fillAlpha',.15); c.fill(); c.globalAlpha=1;
  c.strokeStyle=color; c.lineWidth=Math.max(1,(styleVal(o,'strokeWidth',.1))*v.zoom); c.lineJoin='round'; c.stroke();
  const ce=shapeLabelCenter(o), s=toS(ce);
  if(o.name) drawLabel(c,o,s[0],s[1],color,toS,12*markerScale);
  if(state.settings.showAreaTag) drawAreaTag(c,s[0],s[1],shapeArea(o),shapePerimeter(o));
}
/** 图形中心的面积/周长胶囊（屏幕固定字号，世界图形缩放不影响可读性） */
function drawAreaTag(c,cx,cy,area,perimeter){
  c.save();
  c.font='12px Consolas,Menlo,monospace'; c.textAlign='center'; c.textBaseline='middle';
  const t1=`面积 ${fmt(area)} ㎡`, t2=`周长 ${fmt(perimeter)} m`;
  const w=Math.max(c.measureText(t1).width,c.measureText(t2).width)+16, h=33;
  c.fillStyle='rgba(255,255,255,.82)';
  c.beginPath(); c.roundRect?c.roundRect(cx-w/2,cy-h/2,w,h,5):c.rect(cx-w/2,cy-h/2,w,h); c.fill();
  c.strokeStyle='rgba(37,99,235,.35)'; c.lineWidth=1; c.stroke();
  c.fillStyle='#1e3a8a'; c.fillText(t1,cx,cy-8); c.fillText(t2,cx,cy+8);
  c.restore();
}
function drawLine(c,o,color,toS,v){
  if(!o.points.length) return;
  const pts=o.points.map(toS);
  c.save(); c.strokeStyle=color; c.lineWidth=Math.max(1,(styleVal(o,'strokeWidth',.1))*v.zoom); c.lineJoin='round'; c.lineCap='round';
  c.beginPath(); pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));
  if(o.closed){ c.closePath(); c.fillStyle=color; c.globalAlpha=.08; c.fill(); c.globalAlpha=1; }
  c.stroke(); c.restore();
  const mid=pts[Math.floor((pts.length-1)/2)];
  if(o.name && !o.closed) drawLabel(c,o,mid[0],mid[1]-8,color,toS);
  /* 选中且开启“段长度”：每段中点标段长，末节点旁标总长（屏幕固定字号，不随缩放变） */
  if(state.settings.showSegLen && selectedIds.has(o.id)) drawLineSegTags(c,o,toS);
  /* 闭合区域：中心显示面积/周长（可开关） */
  if(o.closed && state.settings.showAreaTag && o.points.length>=3){
    const gx=o.points.reduce((s,p)=>s+p[0],0)/o.points.length, gy=o.points.reduce((s,p)=>s+p[1],0)/o.points.length;
    const s=toS([gx,gy]);
    drawAreaTag(c,s[0],s[1],polygonArea(o.points),objectLength(o));
  }
}
/** 折线/闭合区域段长度标注（屏幕像素坐标下绘制） */
function drawLineSegTags(c,o,toS){
  const ps=o.points, n=ps.length;
  if(n<2) return;
  const segN=o.closed?n:n-1, total=objectLength(o);
  for(let k=0;k<segN;k++){
    const a=ps[k], b=ps[(k+1)%n], len=dist(a,b);
    if(len*state.viewport.zoom<26) continue;   // 屏幕上过短的段不标，避免拥挤
    const s=toS([(a[0]+b[0])/2,(a[1]+b[1])/2]);
    drawScreenTag(c,s[0]+3,s[1]-19,fmt(len)+' m');
  }
  const end=toS(ps[n-1]);
  drawScreenTag(c,end[0]+9,end[1]-9,'Σ '+fmt(total)+' m');
}
function drawText(c,o,color,toS,v,markerScale){
  const s=toS([o.x,o.y]);
  c.save(); c.translate(s[0],s[1]); c.rotate(screenAngle(o));
  const fs=Math.max(8*markerScale,(o.height||2.2)*v.zoom);
  c.font='bold '+fs+'px "Microsoft YaHei",sans-serif'; c.textAlign='center'; c.textBaseline='middle';
  c.lineWidth=4; c.strokeStyle='rgba(255,255,255,.85)'; c.strokeText(o.text||'文字',0,0);
  c.fillStyle=color; c.fillText(o.text||'文字',0,0); c.restore();
}
function drawDimension(c,o,toS){
  const ps=o.points.map(toS), color=o.style.color||'#111827';
  c.save(); c.strokeStyle=color; c.fillStyle=color; c.lineWidth=1.6; c.font='12px sans-serif';
  if(o.subtype==='ruler' && ps.length>=2){
    /* 测距链：青色虚线 + 端点圆记 + 每段长度 + 末端总长 */
    c.setLineDash([7,4]); c.lineWidth=1.8;
    c.beginPath(); ps.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1])); c.stroke();
    c.setLineDash([]);
    ps.forEach(p=>{ c.beginPath(); c.arc(p[0],p[1],3,0,Math.PI*2); c.stroke(); });
    let total=0;
    for(let k=1;k<o.points.length;k++){
      const len=dist(o.points[k-1],o.points[k]); total+=len;
      const mx=(ps[k-1][0]+ps[k][0])/2, my=(ps[k-1][1]+ps[k][1])/2;
      drawScreenTag(c,mx+3,my-19,fmt(len)+' m');
    }
    drawScreenTag(c,ps[ps.length-1][0]+9,ps[ps.length-1][1]-9,'Σ '+fmt(total)+' m');
  }else if(o.subtype==='distance' && ps.length>=2){
    arrowLine(c,ps[0],ps[1]); tick(c,ps[0],ps[1]); tick(c,ps[1],ps[0]);
    labelAtMid(c,ps[0],ps[1],fmt(dist(o.points[0],o.points[1]))+' '+state.settings.unit);
  }else if(o.subtype==='area' && o.points.length>=3){
    c.beginPath(); ps.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1])); c.closePath();
    c.setLineDash([6,4]); c.stroke(); c.setLineDash([]);
    const cen=centroidScreen(ps); c.fillText('面积 '+fmt(polygonArea(o.points))+' ㎡',cen[0]+8,cen[1]);
    c.fillText('周长 '+fmt(polylineLength(o.points.concat([o.points[0]])))+' m',cen[0]+8,cen[1]+16);
  }else if(o.subtype==='angle' && ps.length>=3){
    const v0=o.points[0], v1=o.points[1], v2=o.points[2];
    c.beginPath(); ps.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1])); c.stroke();
    const a1=Math.atan2(v1[1]-v0[1],v1[0]-v0[0]), a2=Math.atan2(v2[1]-v0[1],v2[0]-v0[0]);
    let deg=Math.abs((a2-a1)*180/Math.PI); if(deg>180) deg=360-deg;
    const r=24; c.beginPath(); c.arc(ps[0][0],ps[0][1],r,-a1,-a2,true); c.stroke();
    c.fillText(fmt(deg)+'°',ps[0][0]+30,ps[0][1]-8);
  }
  c.restore();
}
function arrowLine(c,a,b){
  const ang=Math.atan2(b[1]-a[1],b[0]-a[0]), size=8;
  c.beginPath(); c.moveTo(a[0],a[1]); c.lineTo(b[0],b[1]); c.stroke();
  [[a,ang],[b,ang+Math.PI]].forEach(([p,aa])=>{
    c.beginPath(); c.moveTo(p[0],p[1]); c.lineTo(p[0]-size*Math.cos(aa-.42),p[1]-size*Math.sin(aa-.42));
    c.lineTo(p[0]-size*Math.cos(aa+.42),p[1]-size*Math.sin(aa+.42)); c.closePath(); c.fill();
  });
}
function tick(c,p,to){ const a=Math.atan2(to[1]-p[1],to[0]-p[0])+Math.PI/2; c.beginPath(); c.moveTo(p[0]-6*Math.cos(a),p[1]-6*Math.sin(a)); c.lineTo(p[0]+6*Math.cos(a),p[1]+6*Math.sin(a)); c.stroke(); }
function labelAtMid(c,a,b,text){
  const x=(a[0]+b[0])/2,y=(a[1]+b[1])/2;
  const tw=c.measureText(text).width; c.fillStyle='rgba(255,255,255,.9)'; c.fillRect(x-tw/2-4,y-18,tw+8,18);
  c.fillStyle='#111827'; c.textAlign='center'; c.fillText(text,x,y-6); c.textAlign='left';
}
function centroidScreen(ps){ return [ps.reduce((s,p)=>s+p[0],0)/ps.length,ps.reduce((s,p)=>s+p[1],0)/ps.length]; }
function drawLabel(c,o,x,y,color,toS,fontSize=12){
  if(!state.settings.showLabels || !o.name) return;
  c.save(); c.font='bold '+fontSize+'px "Microsoft YaHei",sans-serif'; c.textAlign='center'; c.textBaseline='middle';
  const tw=c.measureText(o.name).width;
  c.fillStyle='rgba(255,255,255,.82)'; c.fillRect(x-tw/2-4,y-9,tw+8,18);
  c.fillStyle=color; c.fillText(o.name,x,y); c.restore();
}
function drawSelection(c,v,toS){
  state.objects.filter(o=>selectedIds.has(o.id)&&isVisible(o)).forEach(o=>{
    const pts=objectPoints(o).map(toS);
    if(o.kind==='point'){
      const s=toS([o.x,o.y]); c.save(); c.strokeStyle='#2563eb'; c.lineWidth=1.5; c.beginPath(); c.arc(s[0],s[1],15*pointIconScale(o),0,Math.PI*2); c.stroke(); c.restore();
    }else{
      let b=objectBounds(o), p0=toS([b.minX,b.maxY]), p1=toS([b.maxX,b.minY]);
      c.save(); c.strokeStyle='#2563eb'; c.setLineDash([5,3]); c.lineWidth=1.4;
      c.strokeRect(p0[0],p1[1],p1[0]-p0[0],p0[1]-p1[1]); c.restore();
      /* 圆/椭圆/扇形：基点=圆心，单独以 ⊕ 标出（矩形基点即角手柄，无需另画） */
      if(o.kind==='rect'&&areaShapeType(o)!=='rect'){
        const bs=toS([o.x,o.y]);
        c.save(); c.strokeStyle='#2563eb'; c.lineWidth=1.6;
        c.beginPath(); c.rect(bs[0]-4,bs[1]-4,8,8); c.stroke();
        c.beginPath(); c.moveTo(bs[0]-8,bs[1]); c.lineTo(bs[0]+8,bs[1]); c.moveTo(bs[0],bs[1]-8); c.lineTo(bs[0],bs[1]+8); c.stroke();
        c.restore();
      }
    }
    if(selectedIds.size===1){
      c.fillStyle='#fff'; c.strokeStyle='#2563eb'; c.lineWidth=1.5;
      getHandles(o).forEach(h=>{ const s=toS([h.x,h.y]); c.beginPath(); c.rect(s[0]-5,s[1]-5,10,10); c.fill(); c.stroke(); });
    }
  });
}
function drawDraft(c,v,d,toS){
  if(!draft) return;
  c.save(); c.strokeStyle='#2563eb'; c.fillStyle='#2563eb'; c.lineWidth=2;
  if((draft.kind==='rect'||draft.kind==='siteRect') && draft.start && draft.current){
    const a=toS(draft.start), b=toS(draft.current);
    c.globalAlpha=.25; c.fillRect(a[0],a[1],b[0]-a[0],b[1]-a[1]); c.globalAlpha=1; c.strokeRect(a[0],a[1],b[0]-a[0],b[1]-a[1]);
  }else if((draft.kind==='siteCircle'||draft.kind==='areaCircle') && draft.start && draft.current){
    const ce=toS(draft.start), r=dist(draft.start,draft.current)*v.zoom;
    c.globalAlpha=.15; c.beginPath(); c.arc(ce[0],ce[1],r,0,Math.PI*2); c.fill(); c.globalAlpha=1; c.stroke();
  }else if((draft.kind==='siteEllipse'||draft.kind==='areaEllipse') && draft.start && draft.current){
    const a=toS(draft.start), b=toS(draft.current);
    c.globalAlpha=.15; c.beginPath(); c.ellipse((a[0]+b[0])/2,(a[1]+b[1])/2,Math.abs(b[0]-a[0])/2,Math.abs(b[1]-a[1])/2,0,0,Math.PI*2); c.fill(); c.globalAlpha=1; c.stroke();
  }else if((draft.kind==='siteSector'||draft.kind==='areaSector') && draft.start && draft.current){
    const ce=toS(draft.start), R=dist(draft.start,draft.current)*v.zoom;
    const a0=Number(draft.a0)||0, a1=Number(draft.a1);
    const e1=Number.isFinite(a1)?a1:a0+90;
    c.globalAlpha=.15; c.beginPath(); c.moveTo(ce[0],ce[1]); c.arc(ce[0],ce[1],R,-e1*Math.PI/180,-a0*Math.PI/180,false); c.closePath(); c.fill(); c.globalAlpha=1; c.stroke();
  }else if(draft.points){
    const ps=draft.points.map(toS);
    const draftClosed=draft.kind==='sitePolygon'
      ||(draft.kind==='line'&&$('lineClosed')&&$('lineClosed').checked)
      ||(draft.kind==='dimension'&&draft.subtype==='area');
    c.beginPath(); ps.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));
    if(draft.current && !draftClosed){ c.lineTo(toS(draft.current)[0],toS(draft.current)[1]); }
    if(draftClosed){ c.setLineDash([5,4]); c.lineTo(ps[0][0],ps[0][1]); c.setLineDash([]); }
    if(draftClosed){ c.globalAlpha=.07; c.fillStyle='#2563eb'; c.fill(); c.globalAlpha=1; }
    c.stroke();
    ps.forEach(p=>{ c.beginPath(); c.arc(p[0],p[1],4,0,Math.PI*2); c.fill(); });
    c.restore();
    drawDraftSegTags(c,v,toS,draft);
    return;
  }
  /* 区域/场地拖画尺寸预览（标签在拖点旁） */
  if(state.settings.showSegLen && draft.start && draft.current){
    const a=draft.start,b=draft.current, s=toS(b);
    if(draft.kind==='rect'||draft.kind==='siteRect') drawScreenTag(c,s[0]+10,s[1]-26,fmt(Math.abs(a[0]-b[0]))+' × '+fmt(Math.abs(a[1]-b[1]))+' m');
    else if(draft.kind==='siteCircle'||draft.kind==='areaCircle') drawScreenTag(c,s[0]+10,s[1]-26,'r '+fmt(dist(a,b))+' m');
    else if(draft.kind==='siteEllipse'||draft.kind==='areaEllipse') drawScreenTag(c,s[0]+10,s[1]-26,fmt(Math.abs(a[0]-b[0]))+' × '+fmt(Math.abs(a[1]-b[1]))+' m（外接盒）');
    else if(draft.kind==='siteSector'||draft.kind==='areaSector') drawScreenTag(c,s[0]+10,s[1]-26,'r '+fmt(dist(a,b))+' m');
  }
  c.restore();
}
/** 折线/标注录入中：已录段标段长，橡皮筋段与总长实时更新；闭合录入显示面积 */
function drawDraftSegTags(c,v,toS,d){
  if(!state.settings.showSegLen || !d.points || d.points.length<1) return;
  const closed=!!(d.points.length>=2 && (
    d.kind==='sitePolygon' ||
    (d.kind==='dimension'&&d.subtype==='area') ||
    (d.kind==='line'&&$('lineClosed')&&$('lineClosed').checked)));
  const wps=d.points.slice();
  if(d.current && !closed) wps.push(d.current);
  let total=0;
  for(let k=1;k<wps.length;k++){
    const len=dist(wps[k-1],wps[k]); total+=len;
    if(len*v.zoom<26) continue;
    const s=toS([(wps[k-1][0]+wps[k][0])/2,(wps[k-1][1]+wps[k][1])/2]);
    drawScreenTag(c,s[0]+3,s[1]-19,fmt(len)+' m');
  }
  if(closed) total+=dist(wps[wps.length-1],wps[0]);
  const last=toS(wps[wps.length-1]);
  drawScreenTag(c,last[0]+9,last[1]-9,'Σ '+fmt(total)+' m');
  /* 闭合录入且 ≥3 点：重心处实时面积 */
  if(closed && state.settings.showAreaTag && wps.length>=3){
    const gx=wps.reduce((s,p)=>s+p[0],0)/wps.length, gy=wps.reduce((s,p)=>s+p[1],0)/wps.length;
    const gs=toS([gx,gy]);
    drawAreaTag(c,gs[0],gs[1],polygonArea(wps),total);
  }
}
function drawRubber(c){
  if(!rubber) return;
  c.save(); c.strokeStyle='#2563eb'; c.fillStyle='rgba(37,99,235,.08)'; c.setLineDash([4,3]);
  const x=Math.min(rubber.a[0],rubber.b[0]),y=Math.min(rubber.a[1],rubber.b[1]);
  c.fillRect(x,y,Math.abs(rubber.b[0]-rubber.a[0]),Math.abs(rubber.b[1]-rubber.a[1]));
  c.strokeRect(x,y,Math.abs(rubber.b[0]-rubber.a[0]),Math.abs(rubber.b[1]-rubber.a[1]));
  c.restore();
}
function drawCalibration(c,toS){
  if(currentTool==='affine'){
    /* 仿射校准：红点=图上已记录的像素位置，绿点=用户输入的实地坐标，虚线示意两者偏差 */
    affinePairs.forEach((p,i)=>{
      const src=toS(bgPixelToWorld(state.background,[p.u,p.v])), dst=toS([p.x,p.y]);
      c.save();
      c.strokeStyle='#94a3b8'; c.lineWidth=1; c.setLineDash([5,4]);
      c.beginPath(); c.moveTo(src[0],src[1]); c.lineTo(dst[0],dst[1]); c.stroke(); c.setLineDash([]);
      c.fillStyle='#dc2626'; c.beginPath(); c.arc(src[0],src[1],5,0,Math.PI*2); c.fill();
      c.fillStyle='#16a34a'; c.beginPath(); c.arc(dst[0],dst[1],5,0,Math.PI*2); c.fill();
      c.fillStyle='#111827'; c.font='11px Consolas,Menlo,monospace'; c.fillText('A'+(i+1),src[0]+8,src[1]-8);
      c.restore();
    });
    return;
  }
  if(currentTool!=='calibrate') return;
  calibPoints.forEach((p,i)=>{
    const s=toS(p); c.fillStyle=i?'#16a34a':'#dc2626'; c.beginPath(); c.arc(s[0],s[1],6,0,Math.PI*2); c.fill();
    c.fillStyle='#111827'; c.fillText('P'+(i+1),s[0]+9,s[1]-9);
  });
  if(calibPoints.length===2){
    const a=toS(calibPoints[0]),b=toS(calibPoints[1]);
    c.strokeStyle='#7c3aed'; c.setLineDash([6,4]); c.beginPath(); c.moveTo(a[0],a[1]); c.lineTo(b[0],b[1]); c.stroke(); c.setLineDash([]);
  }
}
