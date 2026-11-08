/* render.js —— 命中测试与 Canvas 全量渲染 */
/* 鼠标屏幕位置（由 interaction 的 pointermove 写入）；inside=false 时不画十字 */
let cursorScreen=null;
function setCursorScreen(p,inside,wp,snap){ cursorScreen=p?{x:p[0],y:p[1],inside:inside!==false,wp:wp||null,snap:snap||null}:null; }
/* 属性面板聚焦的折线节点 {id,index}，在画布上高亮 */
let focusNode=null;
function setFocusNode(v){ focusNode=v; requestRender(); }
/* -------------------- 命中测试 / 选择 -------------------- */
/** 有效可见：对象自身 visible 且所属图层 visible。画布与所有图纸类导出共用此唯一判断源。 */
function effectiveVisible(o){ const l=layerOf(o); return o.visible!==false && l.visible!==false; }
/** 兼容旧调用名：等价于 effectiveVisible（保留签名，避免改动既有调用方） */
function isVisible(o){ return effectiveVisible(o); }
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
/** 区域形状控制点：矩形/平行四边形=4角(+错切+旋转)；圆=半径端；椭圆=两轴端+旋转；扇形=两边端（半径+角度）+弧中点（半径） */
function areaShapeHandles(o,handles){
  const tt=areaShapeType(o);
  if(tt==='rect'||tt==='parallelogram'){
    const quad=rectPoints(o);
    quad.forEach((p,i)=>handles.push({type:'rect',index:i,x:p[0],y:p[1]}));
    if(tt==='parallelogram'){
      /* 顶边中点：横向拖拽只改倾角，面积（底×高）保持不变 */
      handles.push({type:'shapeHandle',mode:'skew',x:(quad[2][0]+quad[3][0])/2,y:(quad[2][1]+quad[3][1])/2});
    }
    const c=shapeLabelCenter(o), a=(o.angle+90)*Math.PI/180, off=Math.max(.55,30/state.viewport.zoom);
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
  const h=pickScreenHandle(getHandles(o),screenP,9);
  return h?{object:o,...h}:null;
}

/* -------------------- 渲染 -------------------- */
let renderQueued=false;
function requestRender(){
  if(renderQueued) return;
  renderQueued=true;
  requestAnimationFrame(()=>{ renderQueued=false; drawScene(ctx,state.viewport,wrap.clientWidth,wrap.clientHeight,{interactive:true,markerScale:1}); });
}
/* -------------------- 分层离屏缓存 --------------------
 * 静态层：底图 / 网格 / 覆盖率 / 场地标注 / 坐标轴 / 全部可见对象（冻结为位图）。
 * 动态层：正在拖拽改形的对象 / 草稿 / 校准 / 选择框 / 选择装饰 / 光标 / 捕捉标记。
 * 选择集变化**不再**触发静态层重建：选中对象保留在位图里，动态层只叠加选择装饰。
 * 只有开始/结束拖拽时改形集合变化，静态层才重建一次（N-23）。
 * 导出 / 打印走「直接全量绘制」路径，保证产物与旧行为一致。 */
let staticCanvas=null, staticCtx=null, staticKey='', staticRev=0;
/* 内容签名（不含视口缩放/平移）与上一次静态层对应的视口，用于平移时整像素搬移位图 */
let staticSig='', staticPanX=0, staticPanY=0, staticZoom=0, staticScroll=null;
/** 显式作废静态层：对象增删改、载入/撤销/重做、覆盖率结果变化时调用 */
function invalidateStatic(){ staticRev++; staticKey=''; }
/**
 * 当前逐帧改形、必须从静态层排除的对象 id（N-23）。
 * - move：越过 2px 阈值后才排除 originals 里的全部对象；
 * - node/rotate/rect/shapeHandle：`drag.dirty` 置位后排除该对象。
 * 返回 null 表示静态层包含全部可见对象。
 */
function staticDragIds(){
  if(!drag) return null;
  if(drag.type==='move') return drag.moved&&drag.originals?Array.from(drag.originals.keys()):null;
  if(!drag.dirty) return null;
  if(drag.type==='node'||drag.type==='rotate'||drag.type==='rect'||drag.type==='shapeHandle') return [drag.id];
  return null;
}
/** 静态层内容签名：只随“画什么”变化，不含缩放/平移（平移可整像素搬移位图） */
function sceneStaticContentKey(cssW,cssH,d){
  const bg=state.background||{};
  const dyn=staticDragIds();
  return [cssW,cssH,dpr||1,staticRev,
    d.minX,d.minY,d.maxX,d.maxY,
    JSON.stringify(state.settings),
    JSON.stringify(state.site||null),
    bg.transform?JSON.stringify(bg.transform):'',
    bg.kind||'',bg.assetId||'',bg.fileName||'',bg.width||0,bg.height||0,
    bg.metersPerPixel||0,
    bgImage?1:0,(bgDataUrl||'').length,
    (state.layers||[]).map(l=>l.visible===false?'0':'1').join(''),
    dyn?dyn.slice().sort().join(','):'',   /* 只跟“正在拖拽改形”有关，与选中集无关 */
    coverageResult?coverageResult.regions.length+'/'+(coverageResult.cameraCount||0):'0'
  ].join('|');
}
/** 静态层缓存签名：内容签名 + 视口（缩放必须重建；平移可在整数像素时搬移） */
function sceneStaticKey(v,cssW,cssH,d){
  return sceneStaticContentKey(cssW,cssH,d)+'|'+v.zoom+'|'+v.panX+'|'+v.panY;
}
function ensureStaticLayer(cssW,cssH){
  const k=dpr||1;
  if(!staticCanvas){ staticCanvas=document.createElement('canvas'); staticCtx=staticCanvas.getContext('2d'); }
  const w=Math.max(1,Math.round(cssW*k)), h=Math.max(1,Math.round(cssH*k));
  if(staticCanvas.width!==w||staticCanvas.height!==h){ staticCanvas.width=w; staticCanvas.height=h; staticKey=''; }
  markSurfaceSize(staticCanvas,cssW,cssH);
  staticCtx.setTransform(k,0,0,k,0,0);
  return staticCtx;
}
/** 当前屏幕可见的世界矩形（外扩 padPx，避免标签/图标在边界处被裁掉） */
function visibleWorldRect(v,d,cssW,cssH,padPx=48){
  const a=s2w([-padPx,-padPx],v,d), b=s2w([cssW+padPx,cssH+padPx],v,d);
  return {minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0]),minY:Math.min(a[1],b[1]),maxY:Math.max(a[1],b[1])};
}
/** 静态层全部内容（不含动态层）；view/strip 决定对象裁剪范围 */
function drawStaticContent(sc,v,d,cssW,cssH,toS,iconBoost,exportGain,dynSet,view){
  drawBackground(sc,v,d,cssW,cssH,toS);
  drawSite(sc,v,toS);
  drawGrid(sc,v,d,cssW,cssH,toS);
  drawCoverage(sc,v,d);
  drawSiteAnnotations(sc,v,toS);
  drawAxes(sc,v,toS,cssH);
  /* 裁剪预筛用保守 O(1) 包围盒（P2-3）：圆/椭圆/扇形不再逐对象 72 段取样。
     只允许偏大——偏小会漏画；`objectSnapBounds` 的契约正是「绝不偏小」。 */
  const bnd={minX:0,minY:0,maxX:0,maxY:0};
  state.objects.filter(o=>isVisible(o)&&!(dynSet&&dynSet.has(o.id)))
    .sort((a,b)=>a.z-b.z)
    .forEach(o=>{ if(boundsIntersect(objectSnapBounds(o,bnd),view)) drawObject(sc,o,v,toS,iconBoost,exportGain); });
}
/** 动态层待绘对象：按 id 直取、过滤失效引用并按 z 升序（P2-4，取代全量 filter 扫描） */
function dragDrawObjects(ids,idx){
  return ids.map(id=>idx.get(id)).filter(o=>o&&isVisible(o)).sort((a,b)=>a.z-b.z);
}
/**
 * 纯平移帧：把静态位图按整数设备像素搬移，只重绘暴露出来的边缘条带（审计 P2-1）。
 * 缩放未变且平移量为整数设备像素时才可搬移（像素级对齐、不重采样）；
 * 非整数平移（fitView / 触控板小数位移）与缩放变化都整层重建。
 */
function panScrollDelta(v,prevX,prevY,prevZoom,k){
  if(v.zoom!==prevZoom) return null;
  const dx=(v.panX-prevX)*k, dy=(v.panY-prevY)*k, ix=Math.round(dx), iy=Math.round(dy);
  if(Math.abs(dx-ix)>0.01||Math.abs(dy-iy)>0.01) return null;
  return [ix,iy];
}
function scrollStaticLayer(sc,v,d,cssW,cssH,toS,iconBoost,exportGain,dynSet){
  const k=dpr||1, delta=panScrollDelta(v,staticPanX,staticPanY,staticZoom,k);
  if(!delta) return false;
  const ix=delta[0], iy=delta[1];
  if(!ix&&!iy) return true;                       /* 亚像素抖动：位图已是正确内容 */
  const w=staticCanvas.width, h=staticCanvas.height;
  if(Math.abs(ix)>=w||Math.abs(iy)>=h) return false;
  if(!staticScroll||staticScroll.width!==w||staticScroll.height!==h){
    staticScroll=document.createElement('canvas'); staticScroll.width=w; staticScroll.height=h;
  }
  const ss=staticScroll.getContext('2d');
  ss.setTransform(1,0,0,1,0,0); ss.clearRect(0,0,w,h); ss.drawImage(staticCanvas,0,0);
  sc.setTransform(1,0,0,1,0,0); sc.clearRect(0,0,w,h); sc.drawImage(staticScroll,ix,iy);
  sc.setTransform(k,0,0,k,0,0);
  staticPanX+=ix/k; staticPanY+=iy/k;
  /* 暴露区：横向条带（整高）+ 纵向条带（避开已重绘的横向区，避免半透明叠加变深） */
  const ddx=ix/k, ddy=iy/k, rects=[];
  if(ddx) rects.push([ddx>0?0:cssW+ddx,0,Math.abs(ddx),cssH]);
  const x0=ddx>0?ddx:0, x1=ddx>0?cssW:cssW+ddx;
  if(ddy&&x1>x0) rects.push([x0,ddy>0?0:cssH+ddy,x1-x0,Math.abs(ddy)]);
  rects.forEach(r=>{
    const a=s2w([r[0]-48,r[1]-48],v,d), b=s2w([r[0]+r[2]+48,r[1]+r[3]+48],v,d);
    const strip={minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0]),minY:Math.min(a[1],b[1]),maxY:Math.max(a[1],b[1])};
    sc.save(); sc.beginPath(); sc.rect(r[0],r[1],r[2],r[3]); sc.clip();
    drawStaticContent(sc,v,d,cssW,cssH,toS,iconBoost,exportGain,dynSet,strip);
    sc.restore();
  });
  return true;
}
function drawScene(c,v,cssW,cssH,opt={}){
  const d=worldDims();
  const toS=p=>w2s(p,v,d);
  /* 交互帧使用分层缓存；导出/打印（markerScale≠1 或非交互）保持直接全量绘制 */
  const cacheable=!!opt.interactive&&(opt.markerScale===undefined||opt.markerScale===1);
  const exportGain=opt.markerScale||1;
  const iconBoost=exportGain*(Number(state.settings.markerScale)||1);

  if(cacheable){
    /* 只有逐帧改形的对象从静态层排除；选中但静止的对象留在位图里（N-23） */
    const dyn=staticDragIds(), dynSet=dyn?new Set(dyn):null;
    const sig=sceneStaticContentKey(cssW,cssH,d);
    const key=sig+'|'+v.zoom+'|'+v.panX+'|'+v.panY;
    if(key!==staticKey){
      const sc=ensureStaticLayer(cssW,cssH);
      const scrolled=staticSig===sig&&staticZoom===v.zoom
        ?scrollStaticLayer(sc,v,d,cssW,cssH,toS,iconBoost,exportGain,dynSet):false;
      if(!scrolled){
        sc.clearRect(0,0,cssW,cssH);
        drawStaticContent(sc,v,d,cssW,cssH,toS,iconBoost,exportGain,dynSet,visibleWorldRect(v,d,cssW,cssH));
        staticPanX=v.panX; staticPanY=v.panY;
      }
      staticKey=key; staticSig=sig; staticZoom=v.zoom;
    }
    c.clearRect(0,0,cssW,cssH);
    c.drawImage(staticCanvas,0,0,cssW,cssH);
    /* 拖拽中的对象逐帧变化，单独绘制在静态位图之上 */
    if(dynSet){
      /* 动态层只画拖拽中的少数对象（P2-4）：按 id 直取，不再对全量 objects 做 filter 扫描 */
      const idx=drag&&drag.index?drag.index:objectIndexById();
      const view=visibleWorldRect(v,d,cssW,cssH), db={minX:0,minY:0,maxX:0,maxY:0};
      dragDrawObjects(dyn,idx)
        .forEach(o=>{ if(boundsIntersect(objectSnapBounds(o,db),view)) drawObject(c,o,v,toS,iconBoost,exportGain); });
    }
    drawDiffOverlay(c,v,toS);
    drawDraft(c,v,d,toS);
    drawCalibration(c,toS);
    drawGuideLines(c,v,d,cssW,cssH,toS);
    drawSelection(c,v,toS);
    drawRubber(c);
    drawCursorCross(c,v,d,cssW,cssH);
    drawTrackLine(c,v,d,cssW,cssH,toS);
    drawSiteHandles(c,v,toS);
    drawImageHandles(c,v,toS);
    drawNodeFocus(c,toS);
    drawDragHud(c,toS);
    drawOsnapMarker(c,toS);
    return;
  }

  /* 直接绘制（导出 / 打印 / 离屏合成） */
  c.clearRect(0,0,cssW,cssH);
  c.fillStyle='#ffffff'; c.fillRect(0,0,cssW,cssH);
  drawBackground(c,v,d,cssW,cssH,toS);
  drawSite(c,v,toS);
  drawGrid(c,v,d,cssW,cssH,toS);
  drawCoverage(c,v,d);
  drawSiteAnnotations(c,v,toS);
  drawAxes(c,v,toS,cssH);
  const visible=state.objects.filter(isVisible).sort((a,b)=>a.z-b.z);
  const view=visibleWorldRect(v,d,cssW,cssH);
  visible.forEach(o=>{ if(boundsIntersect(objectBounds(o),view)) drawObject(c,o,v,toS,iconBoost,exportGain); });
  if(opt.interactive) drawDiffOverlay(c,v,toS);   /* 差异叠加仅屏幕预览，不进入 PNG/SVG/PDF 导出 */
  /* 草稿与校准属于交互瞬态：导出/打印路径默认不绘制，必须显式 includeDraft/includeCalibration 才叠加 */
  if(opt.includeDraft) drawDraft(c,v,d,toS);
  if(opt.includeCalibration) drawCalibration(c,toS);
  if(opt.interactive){
    drawGuideLines(c,v,d,cssW,cssH,toS);
    drawSelection(c,v,toS);
    drawRubber(c);
    drawCursorCross(c,v,d,cssW,cssH);
    drawTrackLine(c,v,d,cssW,cssH,toS);
    drawSiteHandles(c,v,toS);
    drawImageHandles(c,v,toS);
    drawNodeFocus(c,toS);
    drawDragHud(c,toS);
    drawOsnapMarker(c,toS);
  }
}
/**
 * 矢量场地控制点手柄（「场地节点」工具激活时显示）：多边形=各顶点；矩形=四角；
 * 圆=圆心+半径端；椭圆=中心+两轴端+旋转；扇形=圆心+两弧端+弧中点(半径)。
 * 橙色方块=移动类控制点（圆心/中心），白色蓝边=几何控制点；拖拽时显示实时世界坐标。
 */
function drawSiteHandles(c,v,toS){
  if(currentTool!=='site-node') return;
  const site=state.site;
  if(!site||!siteIsVisible(site)||siteIsLocked(site)) return;
  const hs=siteHandleList();
  if(!hs.length) return;
  c.save();
  hs.forEach(h=>{
    const s=toS([h.x,h.y]), isCenter=h.mode==='center';
    c.fillStyle=isCenter?'#f59e0b':'#ffffff';
    c.strokeStyle=isCenter?'#b45309':'#2563eb';
    c.lineWidth=1.6;
    const r=isCenter?5:4.5;
    c.beginPath(); c.rect(s[0]-r,s[1]-r,r*2,r*2); c.fill(); c.stroke();
  });
  if(drag && drag.type==='siteHandle'){
    const cur=hs.find(x=>x.mode===drag.handle.mode && x.index===drag.handle.index);
    if(cur){ const s=toS([cur.x,cur.y]); drawScreenTag(c,s[0]+12,s[1]-28,`X ${fmt(cur.x)}  Y ${fmt(cur.y)}`); }
  }
  c.restore();
}
/** 图片变换手柄（「图片变换」工具激活时）：橙=平移，蓝=旋转，白方=等比缩放，白菱=切变 */
function drawImageHandles(c,v,toS){
  if(currentTool!=='image-transform') return;
  const bg=state.background;
  if(!isImageBackground(bg)||!(Number(bg.width)>0)||!(Number(bg.height)>0)) return;
  const hs=imageHandleList(bg); if(!hs.length) return;
  c.save();
  hs.forEach(h=>{
    const s=toS([h.x,h.y]);
    if(h.mode==='move'){
      c.fillStyle='#f59e0b'; c.strokeStyle='#b45309'; c.lineWidth=1.5;
      c.beginPath(); c.rect(s[0]-6,s[1]-6,12,12); c.fill(); c.stroke();
    }else if(h.mode==='rotate'){
      c.fillStyle='#2563eb'; c.strokeStyle='#1d4ed8'; c.lineWidth=1.5;
      c.beginPath(); c.arc(s[0],s[1],5.5,0,Math.PI*2); c.fill(); c.stroke();
    }else if(h.mode==='scale'){
      c.fillStyle='#ffffff'; c.strokeStyle='#2563eb'; c.lineWidth=1.6;
      c.beginPath(); c.rect(s[0]-5,s[1]-5,10,10); c.fill(); c.stroke();
    }else{
      c.fillStyle='#ffffff'; c.strokeStyle='#0f766e'; c.lineWidth=1.6;
      c.beginPath(); c.moveTo(s[0],s[1]-6); c.lineTo(s[0]+6,s[1]); c.lineTo(s[0],s[1]+6); c.lineTo(s[0]-6,s[1]); c.closePath(); c.fill(); c.stroke();
    }
  });
  if(drag&&drag.type==='imageHandle'&&drag.snap){
    const s=toS(drag.snap); c.strokeStyle='#16a34a'; c.lineWidth=2;
    c.beginPath(); c.arc(s[0],s[1],8,0,Math.PI*2); c.stroke();
  }
  c.restore();
}
/**
 * 登记离屏画布的逻辑 CSS 尺寸。离屏 canvas 不在文档中，clientWidth/clientHeight 恒为 0，
 * 屏幕标注若按它夹边会被压到 (2,2)；静态层与导出画布在创建时登记真实逻辑尺寸。
 */
function markSurfaceSize(canvas,cssW,cssH){
  if(canvas){ canvas.__cssW=cssW; canvas.__cssH=cssH; }
  return canvas;
}
/** 绘图表面逻辑尺寸：DOM 画布取 clientWidth/Height，离屏画布退回 markSurfaceSize 登记值 */
function surfaceCssSize(c){
  const cv=c&&c.canvas;
  if(!cv) return [0,0];
  return [cv.clientWidth||Number(cv.__cssW)||0, cv.clientHeight||Number(cv.__cssH)||0];
}
/** 深色胶囊小标签（屏幕固定字号），(x,y) 为标签左上角；段长度/十字坐标共用 */
function drawScreenTag(c,x,y,text){
  c.save();
  c.font='11px Consolas,Menlo,monospace';
  const padX=5, padY=3, m=c.measureText(text);
  const w=m.width+padX*2, h=15+padY;
  /* 仅有可信尺寸时才夹边，避免离屏画布尺寸未知时把标签压到原点 */
  const [sw,sh]=surfaceCssSize(c);
  if(sw>0) x=Math.max(2,Math.min(x,sw-w-2));
  if(sh>0) y=Math.max(2,Math.min(y,sh-h-2));
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
  c.fillStyle='#ffffff'; c.fillRect(0,0,cssW,cssH);
  const bg=state.background;
  if(isImageBackground(bg)&&bgImage&&bgDataUrl) drawImageBackground(c,v,d,bg);
}
/**
 * 矢量场地层（独立槽位）：域内浅色、蓝色实线边界。
 * 渲染顺序固定为「图片 → 场地 → 网格/覆盖」，因此场地永远画在图片之上；
 * visible=false 不渲染；locked 仍渲染，仅限制编辑/手柄。
 */
function drawSite(c,v,toS){
  const site=state.site;
  if(!site||!siteIsVisible(site)) return;
  const sh=siteShapeOf(site), st=site.style||{};
  const fill=typeof st.fill==='string'&&st.fill?st.fill:'#eef2f7';
  const stroke=typeof st.stroke==='string'&&st.stroke?st.stroke:'#3b82f6';
  c.save();
  if(sh.type==='circle'){
    const ce=toS([sh.cx,sh.cy]);
    c.fillStyle=fill;
    c.beginPath(); c.arc(ce[0],ce[1],sh.r*v.zoom,0,Math.PI*2); c.fill();
    c.strokeStyle=stroke; c.lineWidth=2; c.stroke();
  }else if(sh.type==='ellipse'){
    const ce=toS([sh.cx,sh.cy]);
    c.fillStyle=fill;
    c.beginPath(); c.ellipse(ce[0],ce[1],sh.rx*v.zoom,sh.ry*v.zoom,screenAngle({angle:sh.angle||0}),0,Math.PI*2); c.fill();
    c.strokeStyle=stroke; c.lineWidth=2; c.stroke();
  }else if(sh.type==='sector'){
    const ce=toS([sh.cx,sh.cy]), R=sh.r*v.zoom, rg=sectorArcRange(sh);
    c.fillStyle=fill;
    c.beginPath(); c.moveTo(ce[0],ce[1]);
    c.arc(ce[0],ce[1],R,-rg.a1*Math.PI/180,-rg.a0*Math.PI/180,false); c.closePath(); c.fill();
    c.strokeStyle=stroke; c.lineWidth=2; c.stroke();
  }else if(sh.type==='parallelogram'){
    const pts=parallelogramPoints(Number(sh.x)||0,Number(sh.y)||0,Number(sh.w)||0,Number(sh.h)||0,sh.skew).map(toS);
    c.fillStyle=fill;
    c.beginPath(); pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1])); c.closePath(); c.fill();
    c.strokeStyle=stroke; c.lineWidth=2; c.stroke();
  }else if(sh.type==='polygon'&&sh.points&&sh.points.length>=3){
    const pts=sh.points.map(toS);
    c.beginPath(); pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1])); c.closePath();
    c.fillStyle=fill; c.fill();
    c.strokeStyle=stroke; c.lineWidth=2; c.stroke();
  }else{
    const sb=siteBounds(site), pa=toS([sb.minX,sb.minY]), pb=toS([sb.maxX,sb.maxY]);
    const x=Math.min(pa[0],pb[0]), y=Math.min(pa[1],pb[1]), w=Math.abs(pb[0]-pa[0]), h=Math.abs(pb[1]-pa[1]);
    c.fillStyle=typeof st.fill==='string'&&st.fill?st.fill:'#f8fafc'; c.fillRect(x,y,w,h);
    c.strokeStyle=typeof st.stroke==='string'&&st.stroke?st.stroke:'#94a3b8'; c.lineWidth=1.5; c.strokeRect(x,y,w,h);
  }
  c.restore();
}
/**
 * 图片底图渲染：像素(u,v y-down) → 世界(x,y y-up) → 屏幕在 render 层用一次 canvas 变换完成，
 * 支持仿射校准后的旋转 / 不等比缩放 / 轻微切变（直线仍保持直线）。缺省无 transform 时退化为轴对齐矩形。
 */
/** CORE-P2-18：底图绘制失败不再静默吞掉，置错误态并只提示一次，避免每帧刷 toast */
function noteBgImageError(){
  if(bgImageState==='error'&&bgImageErrorNotified) return false;
  bgImageState='error'; bgImageErrorNotified=true;
  if(typeof toast==='function') toast('底图绘制失败：图片可能已损坏，请重新导入','warn');
  return true;
}
function drawImageBackground(c,v,d,bg){
  if(!(bgImage&&bgDataUrl)) return;
  const t=validImageTransform(bg.transform)||defaultImageTransform(bg);
  /* canvas 变换矩阵列 [u 的像, v 的像, 平移]；世界 Y 向上、屏幕 Y 向下，故 d/e 分量取负 */
  c.save();
  c.transform(t.a*v.zoom, -t.d*v.zoom, t.b*v.zoom, -t.e*v.zoom,
    v.panX+(t.c-d.minX)*v.zoom, v.panY+(d.maxY-t.f)*v.zoom);
  try{ c.drawImage(bgImage,0,0); }catch(_){ noteBgImageError(); }
  c.restore();
  /* 四角按世界点独立描边，保证旋转后包围轮廓正确 */
  const corners=imageCornerWorld(bg).map(p=>w2s(p,v,d));
  c.save(); c.strokeStyle='#94a3b8'; c.lineWidth=1.5;
  c.beginPath(); corners.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1])); c.closePath(); c.stroke();
  c.restore();
}
/**
 * 视场覆盖率叠加层：按 analyzeCoverage 的逐区域栅格着色（绿=已覆盖 / 红=盲区），
 * 格心在区域外不绘制。栅格一次性写入 nx×ny 的 ImageData，绘制时整块 drawImage——
 * 避免逐格 fillRect 在高分辨率下产生上万次绘制调用。
 */
let coverageLayers=null, coverageLayersFor=null;
/* CORE-P2-19：覆盖率结果清空时必须同步释放离屏图层缓存，否则栅格 canvas 会一直驻留到下次分析 */
function releaseCoverageLayers(){ coverageLayers=null; coverageLayersFor=null; }
function buildCoverageLayers(res){
  if(coverageLayersFor===res&&coverageLayers) return coverageLayers;
  const layers=[];
  for(const r of res.regions){
    const cv=document.createElement('canvas');
    cv.width=r.nx; cv.height=r.ny;
    const cc=cv.getContext('2d');
    const img=cc.createImageData(r.nx,r.ny), data=img.data;
    for(let j=0;j<r.ny;j++){
      /* 世界 Y 向上、画布行 0 在顶部：网格第 j 行（自 minY 起算）对应画布第 ny-1-j 行 */
      const row=(r.ny-1-j)*r.nx;
      for(let i=0;i<r.nx;i++){
        const g=r.grid[j*r.nx+i];
        if(g===2) continue;                       /* 2=区域外，保持透明 */
        const k=(row+i)*4;
        if(g===1){ data[k]=34; data[k+1]=197; data[k+2]=94; data[k+3]=66; }
        else { data[k]=239; data[k+1]=68; data[k+2]=68; data[k+3]=71; }
      }
    }
    cc.putImageData(img,0,0);
    layers.push({canvas:cv,r});
  }
  coverageLayers=layers; coverageLayersFor=res;
  return layers;
}
function drawCoverage(c,v,d){
  const res=coverageResult;
  if(!res||!res.regions||!res.regions.length) return;
  const toS=p=>w2s(p,v,d);
  const layers=buildCoverageLayers(res);
  c.save(); c.imageSmoothingEnabled=false;
  for(const {canvas,r} of layers){
    if(!r.nx||!r.ny) continue;
    const top=toS([r.minX,r.minY+r.ny*r.cell]);
    c.drawImage(canvas,top[0],top[1],r.nx*r.cell*v.zoom,r.ny*r.cell*v.zoom);
  }
  c.restore();
}
/* 临时参考线：品红虚线贯穿画布（运行时状态，不持久化；Shift+G 清除） */
function drawGuideLines(c,v,d,cssW,cssH,toS){
  const segs=guideLineList();
  if(!segs.length&&!guideDraft) return;
  c.save(); c.strokeStyle='rgba(217,70,239,.85)'; c.lineWidth=1.2; c.setLineDash([10,6]);
  const draw=(a,b)=>{
    const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);
    if(L<EPS) return;
    const ux=dx/L*1e6, uy=dy/L*1e6;
    const p0=toS([a[0]-ux,a[1]-uy]), p1=toS([a[0]+ux,a[1]+uy]);
    c.beginPath(); c.moveTo(p0[0],p0[1]); c.lineTo(p1[0],p1[1]); c.stroke();
  };
  segs.forEach(s=>draw(s.a,s.b));
  if(guideDraft&&guideDraft.length===2) draw(guideDraft[0],guideDraft[1]);
  c.restore();
}
/* -------------------- 矢量场地标注（节点坐标 / 段长 / 周长面积，可配置） --------------------
 * 边界折点 / 几何中心 / 基点 / 半径文案 / 面积周长统一由 geometry.js 提供
 * （siteBoundaryPoints / siteShapeCenter / siteBasePoint / siteRadiusText / siteAreaPerimeter），
 * 本文件只负责把它们画到画布与屏幕上。 */
/**
 * 绘制矢量场地标注：边界节点世界坐标、相邻节点段长、基点/半径、周长/面积胶囊。
 * 各项由工程设置中的独立开关控制（场地节点坐标 / 场地段长 / 场地基点坐标 / 场地半径 / 场地面积 / 场地周长）；
 * 屏幕固定字号，缩放不糊。
 */
function drawSiteAnnotations(c,v,toS){
  const site=state.site, S=state.settings;
  if(!site||!siteIsVisible(site)) return;
  if(!(S.siteNodes||S.siteSegLen||S.siteArea||S.sitePerimeter||S.siteBase||S.siteRadius)) return;
  const pts=siteBoundaryPoints(site);
  if(pts&&pts.length>=2){
    const n=pts.length, closed=n>=3;
    if(S.siteSegLen){
      const segN=closed?n:n-1;
      for(let k=0;k<segN;k++){
        const a=pts[k], b=pts[(k+1)%n], len=dist(a,b);
        if(len*v.zoom<segLabelMinPx()) continue;           /* 屏幕上过短的段不标，避免拥挤 */
        const s=toS([(a[0]+b[0])/2,(a[1]+b[1])/2]);
        drawScreenTag(c,s[0]+3,s[1]-19,fmt(len)+' m');
      }
    }
    if(S.siteNodes){
      pts.forEach(p=>{ const s=toS(p); drawScreenTag(c,s[0]+6,s[1]+6,'('+fmt(p[0])+', '+fmt(p[1])+')'); });
    }
  }
  /* 基点坐标与半径分别可开关：圆/椭圆/扇形有半径与圆心，矩形/平行四边形只有基点，多边形两者皆无 */
  const cs=toS(siteShapeCenter(site));
  if(S.siteBase){
    const b=siteBasePoint(site);
    if(b){ const s=toS(b); drawScreenTag(c,s[0]+7,s[1]-16,'('+fmt(b[0])+', '+fmt(b[1])+')'); }
  }
  if(S.siteRadius){
    const rt=siteRadiusText(site);
    if(rt) drawScreenTag(c,cs[0]+7,cs[1]+22,'R '+rt);
  }
  /* 周长与面积分别可开关，胶囊组件同一处渲染 */
  if(S.siteArea||S.sitePerimeter){
    const ap=siteAreaPerimeter(site);
    drawAreaTag(c,cs[0],cs[1],ap.area,ap.perimeter,S.siteArea,S.sitePerimeter);
  }
}
function drawGrid(c,v,d,cssW,cssH,toS){
  if(!state.settings.gridVisible) return;
  const step=gridDisplayStep(v.zoom,state.settings.gridSize,45);
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
/**
 * 逐对象标注条目（世界坐标锚点 + 屏幕偏移，画布与 SVG 导出共用，保证所见即所得）。
 * 覆盖：点设备坐标；区域基点/半径/边长/顶点；折线节点坐标/段长/总长。
 * 显隐完全由逐对象「图上标注」开关决定（全局总开关仅在对象未显式配置时作缺省），与对象是否被选中无关：
 * 配置后即使改选其他对象、切换全局开关，该对象的标注仍按自身配置显示。
 * 面积/周长使用图形中心的胶囊（见 drawAreaTag），不在此列出。
 * opt 仅为调用方签名兼容保留（画布/SVG 均不再依赖选中态）。
 */
function annotationItems(o,opt={}){
  const out=[], S=state.settings;
  const push=(wx,wy,text,dx,dy,lenWorld)=>out.push({wx,wy,text,dx,dy,lenWorld:lenWorld||0});
  if(!o) return out;
  if(o.kind==='point'){
    if(annotOn(o,'coord')) push(o.x,o.y,`X ${fmt(o.x)}  Y ${fmt(o.y)}`,14*pointIconScale(o)+4,-8);
  }else if(o.kind==='rect'){
    const tt=areaShapeType(o), sh=o.shape||{};
    if(annotOn(o,'base')) push(o.x,o.y,`(${fmt(o.x)}, ${fmt(o.y)})`,10,-24);
    if(annotOn(o,'radius')){
      if(tt==='circle'||tt==='sector'){
        const a0=(tt==='sector'?(Number(sh.a0)||0):0)*Math.PI/180, r=Number(sh.r)||0;
        push(o.x+r*Math.cos(a0),o.y+r*Math.sin(a0),'R '+fmt(r)+' m',6,6);
      }else if(tt==='ellipse'){
        push(o.x+(Number(sh.rx)||0),o.y,'Rx '+fmt(sh.rx)+'  Ry '+fmt(sh.ry),6,6);
      }
    }
    if(annotOn(o,'edge') && (tt==='rect'||tt==='parallelogram')){
      const wp=rectPoints(o);
      for(let k=0;k<4;k++){ const a=wp[k],b=wp[(k+1)%4], L=dist(a,b); push((a[0]+b[0])/2,(a[1]+b[1])/2,fmt(L)+' m',3,-19,L); }
    }
    if(annotOn(o,'vertex') && (tt==='rect'||tt==='parallelogram')){
      rectPoints(o).forEach(p=>push(p[0],p[1],`(${fmt(p[0])}, ${fmt(p[1])})`,7,7));
    }
  }else if(o.kind==='line'){
    if(annotOn(o,'node')) o.points.forEach(p=>push(p[0],p[1],`(${fmt(p[0])}, ${fmt(p[1])})`,7,7));
    if(annotOn(o,'edge')){
      const ps=o.points, n=ps.length, segN=o.closed?n:n-1;
      for(let k=0;k<segN;k++){ const a=ps[k],b=ps[(k+1)%n], L=dist(a,b); push((a[0]+b[0])/2,(a[1]+b[1])/2,fmt(L)+' m',3,-19,L); }
    }
    if(!o.closed && annotOn(o,'perimeter') && o.points.length>=2){
      const e=o.points[o.points.length-1]; push(e[0],e[1],'Σ '+fmt(objectLength(o))+' m',9,-9);
    }
  }
  return out;
}
/** 段长标注最小屏幕像素（设置可调，默认 APP_LIMITS.SEG_LABEL_MIN_PX） */
function segLabelMinPx(){
  const v=Number(state.settings&&state.settings.segLabelMinPx);
  return Number.isFinite(v)&&v>0
    ? Math.min(APP_LIMITS.SEG_LABEL_MIN_PX_MAX,Math.max(APP_LIMITS.SEG_LABEL_MIN_PX_MIN,v))
    : APP_LIMITS.SEG_LABEL_MIN_PX;
}
/** 绘制某对象的逐对象标注标签（屏幕固定字号；过短的段自动略去避免拥挤） */
function drawObjectAnnotations(c,o,toS,v){
  annotationItems(o,{selected:selectedIds.has(o.id)}).forEach(it=>{
    if(it.lenWorld && it.lenWorld*v.zoom<segLabelMinPx()) return;
    const s=toS([it.wx,it.wy]);
    drawScreenTag(c,s[0]+it.dx,s[1]+it.dy,it.text);
  });
}
function drawObject(c,o,v,toS,iconBoost,exportGain){
  const g=exportGain===undefined?iconBoost:exportGain;
  const type=getType(o.typeId), color=o.style.color||type.color||'#2563eb';
  if(o.kind==='point') drawPoint(c,o,color,type,toS,iconBoost,v);
  else if(o.kind==='rect') drawRect(c,o,color,toS,v,g);
  else if(o.kind==='line') drawLine(c,o,color,toS,v);
  else if(o.kind==='text') drawText(c,o,color,toS,v,g);
  else if(o.kind==='dimension') drawDimension(c,o,toS);
  drawObjectAnnotations(c,o,toS,v);
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
/** 符号 Path2D 缓存：同一类型在 500 图元/多帧渲染中只构造一次 */
const symbolPathCache=new WeakMap();
function symbolRenderPaths(type){
  if(typeof Path2D!=='function') return null;
  let hit=symbolPathCache.get(type);
  if(!hit){
    hit=symbolPathsFor(type).map(p=>{ try{ return {path:new Path2D(p.d),fill:p.fill}; }catch(_){ return null; } }).filter(Boolean);
    symbolPathCache.set(type,hit);
  }
  return hit;
}
/** 行业图元/SVG 图元：默认屏幕图标尺寸；sizePx 给定时按世界真实尺寸渲染 */
function drawPointSymbol(c,type,color,s,a,k,sizePx){
  const vb=type.symbolViewBox||{x:0,y:0,w:24,h:24};
  const span=Math.max(vb.w,vb.h)||24;
  const fs=sizePx?sizePx/span:k*0.9*24/span;
  c.save(); c.translate(s[0],s[1]); c.rotate(a); c.scale(fs,fs);
  c.translate(-(vb.x+vb.w/2),-(vb.y+vb.h/2));
  c.strokeStyle=color; c.fillStyle=color;
  c.lineWidth=sizePx?Math.max(.06,Math.min(6,1.6/fs)):1.7;
  c.lineJoin='round'; c.lineCap='round';
  const paths=symbolRenderPaths(type);
  if(paths){
    for(const p of paths){ if(p.fill) c.fill(p.path); else c.stroke(p.path); }
  }else if(typeof Path2D!=='function'){
    /* 无 Path2D 的降级环境：画一个菱形占位，避免整帧渲染失败 */
    c.beginPath(); c.moveTo(-9,0); c.lineTo(0,-9); c.lineTo(9,0); c.lineTo(0,9); c.closePath(); c.stroke();
  }
  c.restore();
}
function drawPoint(c,o,color,type,toS,markerScale,v){
  if((o.phys||0)>0 && (type.scaleShape&&type.scaleShape!=='none')) return drawPhysicalPoint(c,o,color,type,toS,v,markerScale);
  /* 屏幕固定图标：导出增益 × 全局倍率 × 类型默认 × 对象覆盖；缩放画布不改变图标视觉大小 */
  const k=markerScale*(Number(type.iconSize)||1)*(Number(o.iconSize)||1);
  const s=toS([o.x,o.y]), a=screenAngle(o);
  if(type.symbol&&type.symbol.length){
    /* 真实尺寸：phys>0 时按米渲染（随缩放变化）；否则固定屏幕图标 */
    const sizePx=(o.phys||0)>0?o.phys*v.zoom:0;
    drawPointSymbol(c,type,color,s,a,k,sizePx);
    const r=sizePx?sizePx/2:11*k;
    drawLabel(c,o,s[0],s[1]-r-8,color,toS,12*k);
    return;
  }
  const r=11*k;
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
/** 区域统一渲染：矩形/平行四边形/圆/椭圆/扇形都走 shapeWorldPoints 同一条世界坐标路径 */
function drawRect(c,o,color,toS,v,markerScale){
  const pts=shapeWorldPoints(o).map(toS);
  c.beginPath(); pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1])); c.closePath();
  c.fillStyle=color; c.globalAlpha=styleVal(o,'fillAlpha',.15); c.fill(); c.globalAlpha=1;
  c.strokeStyle=color; c.lineWidth=Math.max(1,(styleVal(o,'strokeWidth',.1))*v.zoom); c.lineJoin='round'; c.stroke();
  const ce=shapeLabelCenter(o), s=toS(ce);
  if(o.name) drawLabel(c,o,s[0],s[1],color,toS,12*markerScale);
  /* 面积/周长分别由逐对象开关控制（全局「图上显示面积」仅作未配置对象的缺省值） */
  const sa=annotOn(o,'area'), sp=annotOn(o,'perimeter');
  if(sa||sp) drawAreaTag(c,s[0],s[1],shapeArea(o),shapePerimeter(o),sa,sp);
}
/** 图形中心的面积/周长胶囊（屏幕固定字号，世界图形缩放不影响可读性）；面积与周长可分别关闭 */
function drawAreaTag(c,cx,cy,area,perimeter,showArea=true,showPerim=true){
  const lines=[];
  if(showArea) lines.push(`${L('面积')} ${fmt(area)} ㎡`);
  if(showPerim) lines.push(`${L('周长')} ${fmt(perimeter)} m`);
  if(!lines.length) return;
  c.save();
  c.font='12px Consolas,Menlo,monospace'; c.textAlign='center'; c.textBaseline='middle';
  const w=Math.max(...lines.map(t=>c.measureText(t).width))+16, lh=16, h=lines.length===1?24:33;
  c.fillStyle='rgba(255,255,255,.82)';
  c.beginPath(); c.roundRect?c.roundRect(cx-w/2,cy-h/2,w,h,5):c.rect(cx-w/2,cy-h/2,w,h); c.fill();
  c.strokeStyle='rgba(37,99,235,.35)'; c.lineWidth=1; c.stroke();
  c.fillStyle='#1e3a8a';
  lines.forEach((t,i)=>c.fillText(t,cx,cy-(lines.length-1)*8+i*16));
  c.restore();
}
function drawLine(c,o,color,toS,v){
  if(!o.points.length) return;
  const pts=o.points.map(toS);
  c.save(); c.strokeStyle=color; c.lineWidth=Math.max(1,(styleVal(o,'strokeWidth',.1))*v.zoom); c.lineJoin='round'; c.lineCap='round';
  c.beginPath(); pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));
  if(o.closed){ c.closePath(); c.fillStyle=color; c.globalAlpha=.08; c.fill(); c.globalAlpha=1; }
  c.stroke(); c.restore();
  if(!o.closed){
    const mid=pts[Math.floor((pts.length-1)/2)];
    if(o.name) drawLabel(c,o,mid[0],mid[1]-8,color,toS);
  }else{
    /* 闭合折线（多边形区域）：编号与中心面积/周长胶囊同一锚点，胶囊可见时上移避让，避免文字重叠 */
    const gx=o.points.reduce((s,p)=>s+p[0],0)/o.points.length, gy=o.points.reduce((s,p)=>s+p[1],0)/o.points.length;
    const gs=toS([gx,gy]);
    const sa=annotOn(o,'area'), sp=annotOn(o,'perimeter');
    const capShown=o.points.length>=3&&(sa||sp);
    if(o.name) drawLabel(c,o,gs[0],gs[1]-(capShown?30:0),color,toS);
    if(capShown) drawAreaTag(c,gs[0],gs[1],polygonArea(o.points),objectLength(o),sa,sp);
  }
  /* 段长度/总长标注由 annotationItems 统一绘制（逐对象「段长/周长」开关决定，与是否选中无关） */
}
function drawText(c,o,color,toS,v,markerScale){
  const s=toS([o.x,o.y]);
  c.save(); c.translate(s[0],s[1]); c.rotate(screenAngle(o));
  const fs=Math.max(8*markerScale,(o.height||2.2)*v.zoom);
  c.font='bold '+fs+'px "Microsoft YaHei",sans-serif'; c.textAlign='center'; c.textBaseline='middle';
  c.lineWidth=4; c.strokeStyle='rgba(255,255,255,.85)'; c.strokeText(o.text||L('文字'),0,0);
  c.fillStyle=color; c.fillText(o.text||L('文字'),0,0); c.restore();
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
    const cen=centroidScreen(ps); c.fillText(L('面积')+' '+fmt(polygonArea(o.points))+' ㎡',cen[0]+8,cen[1]);
    c.fillText(L('周长')+' '+fmt(polylineLength(o.points.concat([o.points[0]])))+' m',cen[0]+8,cen[1]+16);
  }else if(o.subtype==='angle' && ps.length>=3){
    const v0=o.points[0], v1=o.points[1], v2=o.points[2];
    c.beginPath(); ps.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1])); c.stroke();
    const a1=Math.atan2(v1[1]-v0[1],v1[0]-v0[0]), a2=Math.atan2(v2[1]-v0[1],v2[0]-v0[0]);
    const deg=dimensionAngleDeg(o.points);
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
  /* 编号显隐只由逐对象配置决定（全局「显示标签」仅作未配置对象的缺省值，见 annotOn） */
  if(!o.name || !annotOn(o,'name')) return;
  c.save(); c.font='bold '+fontSize+'px "Microsoft YaHei",sans-serif'; c.textAlign='center'; c.textBaseline='middle';
  const tw=c.measureText(o.name).width;
  c.fillStyle='rgba(255,255,255,.82)'; c.fillRect(x-tw/2-4,y-9,tw+8,18);
  c.fillStyle=color; c.fillText(o.name,x,y); c.restore();
}
/* -------------------- 快照差异叠加 -------------------- */
const DIFF_OVERLAY_COLORS=Object.freeze({added:'#16a34a',removed:'#dc2626',modified:'#f59e0b',moved:'#2563eb',floorChanged:'#7c3aed',typeChanged:'#0891b2'});
/** 差异对象轮廓顶点（point 为屏幕圆，不返回世界点） */
function diffOverlayPoints(o){
  if(!o) return [];
  if(o.kind==='rect') return shapeWorldPoints(o)||[];
  if(o.kind==='text') return textCorners(o)||[];
  if(Array.isArray(o.points)) return o.points;
  return [];
}
/**
 * 差异叠加层（画在动态层，不参与静态层缓存，关闭即消失）：
 * 只绘制当前楼层的差异对象，新增=绿、删除=红虚线、属性修改=琥珀、移动=蓝、换楼层=紫、类型变更=青。
 */
function drawDiffOverlay(c,v,toS){
  if(!diffOverlay.on||!diffOverlay.items.length) return;
  const active=state.activeFloorId;
  c.save();
  diffOverlay.items.forEach(it=>{
    if(active&&it.floorIds&&it.floorIds.length&&!it.floorIds.includes(active)) return;
    const src=(it.bFloorId===active?it.b:null)||(it.aFloorId===active?it.a:null)||it.b||it.a;
    if(!src) return;
    const color=DIFF_OVERLAY_COLORS[it.category]||'#f59e0b';
    c.strokeStyle=color; c.fillStyle=color; c.lineWidth=2.5; c.lineJoin='round';
    if(src.kind==='point'){
      const s=toS([src.x,src.y]);
      c.globalAlpha=.9;
      c.beginPath(); c.arc(s[0],s[1],15*pointIconScale(src),0,Math.PI*2); c.stroke();
      c.globalAlpha=.12; c.fill(); c.globalAlpha=.9;
      c.beginPath(); c.arc(s[0],s[1],3,0,Math.PI*2); c.fill();
      c.globalAlpha=1;
      return;
    }
    const pts=diffOverlayPoints(src);
    if(pts.length){
      const closed=src.kind==='rect'||src.kind==='text'||!!src.closed||(src.kind==='dimension'&&src.subtype==='area');
      c.beginPath();
      pts.map(toS).forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));
      if(closed){ c.closePath(); c.globalAlpha=.10; c.fill(); c.globalAlpha=1; }
      if(it.category==='removed') c.setLineDash([6,4]);
      c.stroke(); c.setLineDash([]);
      return;
    }
    const b=objectBounds(src);
    const p0=toS([b.minX,b.maxY]),p1=toS([b.maxX,b.minY]);
    c.strokeRect(p0[0],p1[1],p1[0]-p0[0],p0[1]-p1[1]);
  });
  c.restore();
}
function drawSelection(c,v,toS){
  state.objects.filter(o=>selectedIds.has(o.id)&&isVisible(o)).forEach(o=>{
    if(o.kind==='point'){
      const s=toS([o.x,o.y]); c.save(); c.strokeStyle='#2563eb'; c.lineWidth=1.5; c.beginPath(); c.arc(s[0],s[1],15*pointIconScale(o),0,Math.PI*2); c.stroke(); c.restore();
    }else{
      let b=objectBounds(o), p0=toS([b.minX,b.maxY]), p1=toS([b.maxX,b.minY]);
      c.save(); c.strokeStyle='#2563eb'; c.setLineDash([5,3]); c.lineWidth=1.4;
      c.strokeRect(p0[0],p1[1],p1[0]-p0[0],p0[1]-p1[1]); c.restore();
      /* 圆/椭圆/扇形：基点=圆心，单独以 ⊕ 标出（矩形/平行四边形基点即角手柄，无需另画） */
      if(o.kind==='rect'&&!['rect','parallelogram'].includes(areaShapeType(o))){
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
  if((draft.kind==='rect'||draft.kind==='siteRect'||draft.kind==='areaParallelogram'||draft.kind==='siteParallelogram') && draft.start && draft.current){
    if(draft.kind==='areaParallelogram'||draft.kind==='siteParallelogram'){
      /* 平行四边形拖画：按默认倾角实时预览错切后的轮廓 */
      const x=Math.min(draft.start[0],draft.current[0]), y=Math.min(draft.start[1],draft.current[1]);
      const w=Math.abs(draft.start[0]-draft.current[0]), hh=Math.abs(draft.start[1]-draft.current[1]);
      const pts=parallelogramPoints(x,y,w,hh,PARALLELOGRAM_DEFAULT_SKEW).map(toS);
      c.globalAlpha=.25; c.beginPath();
      pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1])); c.closePath(); c.fill();
      c.globalAlpha=1; c.stroke();
    }else{
      const a=toS(draft.start), b=toS(draft.current);
      c.globalAlpha=.25; c.fillRect(a[0],a[1],b[0]-a[0],b[1]-a[1]); c.globalAlpha=1; c.strokeRect(a[0],a[1],b[0]-a[0],b[1]-a[1]);
    }
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
    /* 已录入点之间的边：实线（未闭合时再带上指向光标的橡皮筋段） */
    c.beginPath(); ps.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));
    if(draft.current && !draftClosed){ c.lineTo(toS(draft.current)[0],toS(draft.current)[1]); }
    c.stroke();
    /* 闭合预览：末节点→首节点的合拢边单独以虚线描边，与已定边界区分。
       同一条路径无法混用实/虚线型，故必须在 stroke 之后再单独二次描边。 */
    if(draftClosed && ps.length>=2){
      if(ps.length>=3){
        c.globalAlpha=.07; c.fillStyle='#2563eb';
        c.beginPath(); ps.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1])); c.closePath(); c.fill(); c.globalAlpha=1;
      }
      c.save(); c.setLineDash([6,4]);
      c.beginPath(); c.moveTo(ps[ps.length-1][0],ps[ps.length-1][1]); c.lineTo(ps[0][0],ps[0][1]); c.stroke();
      c.restore();
    }
    ps.forEach(p=>{ c.beginPath(); c.arc(p[0],p[1],4,0,Math.PI*2); c.fill(); });
    c.restore();
    drawDraftSegTags(c,v,toS,draft);
    return;
  }
  /* 区域/场地拖画尺寸预览（标签在拖点旁） */
  if(state.settings.showSegLen && draft.start && draft.current){
    const a=draft.start,b=draft.current, s=toS(b);
    if(draft.kind==='rect'||draft.kind==='siteRect'||draft.kind==='areaParallelogram'||draft.kind==='siteParallelogram') drawScreenTag(c,s[0]+10,s[1]-26,fmt(Math.abs(a[0]-b[0]))+' × '+fmt(Math.abs(a[1]-b[1]))+' m'+(draft.kind.includes('Parallelogram')?'（底×高）':''));
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
    if(len*v.zoom<segLabelMinPx()) continue;
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
    /* 仿射校准：红点=图上已记录的像素位置，绿点=用户输入的实地坐标，虚线示意两者偏差；
       选中控制点画橙色环（可拖拽红点改像素、拖拽绿点改实地坐标，Delete 删除） */
    affinePairs.forEach((p,i)=>{
      const src=toS(bgPixelToWorld(state.background,[p.u,p.v])), dst=toS([p.x,p.y]);
      c.save();
      c.strokeStyle='#94a3b8'; c.lineWidth=1; c.setLineDash([5,4]);
      c.beginPath(); c.moveTo(src[0],src[1]); c.lineTo(dst[0],dst[1]); c.stroke(); c.setLineDash([]);
      c.fillStyle='#dc2626'; c.beginPath(); c.arc(src[0],src[1],5,0,Math.PI*2); c.fill();
      c.fillStyle='#16a34a'; c.beginPath(); c.arc(dst[0],dst[1],5,0,Math.PI*2); c.fill();
      if(calibSelection&&calibSelection.kind==='affine'&&calibSelection.index===i){
        const q=calibSelection.part==='dst'?dst:src;
        c.strokeStyle='#f59e0b'; c.lineWidth=2; c.beginPath(); c.arc(q[0],q[1],8,0,Math.PI*2); c.stroke();
      }
      c.fillStyle='#111827'; c.font='11px Consolas,Menlo,monospace'; c.fillText('A'+(i+1),src[0]+8,src[1]-8);
      c.restore();
    });
    return;
  }
  if(currentTool!=='calibrate') return;
  calibPoints.forEach((p,i)=>{
    const s=toS(p); c.fillStyle=i?'#16a34a':'#dc2626'; c.beginPath(); c.arc(s[0],s[1],6,0,Math.PI*2); c.fill();
    if(calibSelection&&calibSelection.kind==='calibrate'&&calibSelection.index===i){
      c.strokeStyle='#f59e0b'; c.lineWidth=2; c.beginPath(); c.arc(s[0],s[1],9,0,Math.PI*2); c.stroke();
    }
    c.fillStyle='#111827'; c.fillText('P'+(i+1),s[0]+9,s[1]-9);
  });
  if(calibPoints.length===2){
    const a=toS(calibPoints[0]),b=toS(calibPoints[1]);
    c.strokeStyle='#7c3aed'; c.setLineDash([6,4]); c.beginPath(); c.moveTo(a[0],a[1]); c.lineTo(b[0],b[1]); c.stroke(); c.setLineDash([]);
  }
}
