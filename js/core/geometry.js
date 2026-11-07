/* geometry.js —— 世界坐标几何：纯数学委托 @idcu/core-geometry，业务部分留在本文件 */
/* 模块由 index.html 在本脚本之前加载（globalThis.__idcuGeometry）；以下保留原导出名，调用点不改 */
const __geo = globalThis.__idcuGeometry;
if (!__geo) throw new Error('geometry.js：缺少 @idcu/core-geometry，请检查 index.html 脚本顺序');
/* -------------------- 几何工具（委托模块） -------------------- */
const add=(a,b)=>__geo.vecAdd(a,b);
const sub=(a,b)=>__geo.vecSub(a,b);
const mul=(a,s)=>__geo.vecScale(a,s);
const dist=(a,b)=>__geo.distance(a,b);
function rotatePoint(p,c,angDeg){ return __geo.rotatePoint(p,c,angDeg); }
function polygonArea(points){ return __geo.polygonArea(points); }
function polylineLength(points){ return __geo.polylineLength(points); }
/** 三点夹角（度），顶点为 points[0]：画布/SVG/DXF 共用唯一实现 */
function dimensionAngleDeg(points){
  const v0=points[0],v1=points[1],v2=points[2];
  const a1=Math.atan2(v1[1]-v0[1],v1[0]-v0[0]),a2=Math.atan2(v2[1]-v0[1],v2[0]-v0[0]);
  const deg=Math.abs((a2-a1)*180/Math.PI);
  return deg>180?360-deg:deg;
}
function pointInPolygon(p,poly){ return __geo.pointInPolygon(p,poly); }
function distanceToSegment(p,a,b){ return __geo.distanceToSegment(p,a,b); }
/* -------------------- 对象捕捉 OSNAP（纯数据，屏幕阈值由调用方换算为世界米） -------------------- */
const OSNAP_LABELS={
  endpoint:'端点', midpoint:'中点', center:'圆心', quadrant:'象限点',
  perpendicular:'垂足', intersection:'交点', tangent:'切点'
};
/**
 * 收集当前工程全部"特征点"候选（离散点）。
 * endpoint 节点/角点；midpoint 边中点；center 中心或圆心；quadrant 圆/椭圆四象限点。
 */
function collectSnapCandidates(st,vis){
  const out=[];
  const push=(id,p,type)=>out.push({p:[p[0],p[1]],type,id});
  (st.objects||[]).forEach(o=>{
    if(vis && !vis(o)) return;
    if(o.kind==='point'||o.kind==='text'){
      push(o.id,[o.x,o.y],'endpoint');
    }else if(o.kind==='line'||o.kind==='dimension'){
      const ps=o.points||[];
      ps.forEach(p=>push(o.id,p,'endpoint'));
      const segN=o.closed?ps.length:ps.length-1;
      for(let k=0;k<segN;k++) push(o.id,[(ps[k][0]+ps[(k+1)%ps.length][0])/2,(ps[k][1]+ps[(k+1)%ps.length][1])/2],'midpoint');
    }else if(o.kind==='rect'){
      const tt=areaShapeType(o);
      if(tt==='rect'){
        const cs=rectPoints(o);
        cs.forEach(p=>push(o.id,p,'endpoint'));
        for(let k=0;k<4;k++) push(o.id,[(cs[k][0]+cs[(k+1)%4][0])/2,(cs[k][1]+cs[(k+1)%4][1])/2],'midpoint');
        push(o.id,[(cs[0][0]+cs[2][0])/2,(cs[0][1]+cs[2][1])/2],'center');
      }else{
        const sh=o.shape;
        push(o.id,[o.x,o.y],'center');
        if(tt==='circle'||tt==='ellipse'){
          const rx=tt==='circle'?sh.r:sh.rx, ry=tt==='circle'?sh.r:sh.ry;
          const a=(o.angle||0)*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a);
          /* 象限点独立标记（椭圆旋转按其角度） */
          [[rx,0],[-rx,0],[0,ry],[0,-ry]].forEach(q=>{
            push(o.id,[o.x+q[0]*ca-q[1]*sa, o.y+q[0]*sa+q[1]*ca],'quadrant');
          });
        }
      }
    }
  });
  /* 矢量场地边角也参与捕捉（场地不在 objects，需单独追加）：
     折点→端点；圆/椭圆/扇形→圆心（center）。图层隐藏时不参与。 */
  const site=st.site;
  if(site){
    const layer=(st.layers||[]).find(l=>l.id===site.layerId)||{visible:true};
    if(site.visible!==false && layer.visible!==false){
      const bp=siteBoundaryPoints(site);
      if(bp) bp.forEach(p=>push('site',p,'endpoint'));
      const sh=siteShapeOf(site);
      if(sh.type==='circle'||sh.type==='ellipse'||sh.type==='sector') push('site',[Number(sh.cx)||0,Number(sh.cy)||0],'center');
    }
  }
  return out;
}
/** 收集"可垂足/可交点"的线段边：折线含闭合边；非矩形区域以采样多边形近似；
 *  末尾附加运行时临时参考线（无限长，按 ±1e6 扩展用于求交/垂足） */
function collectSnapEdges(st,vis){
  const out=[];
  const add=(id,a,b)=>out.push({id,a:a.slice(),b:b.slice()});
  (st.objects||[]).forEach(o=>{
    if(vis && !vis(o)) return;
    if(o.kind==='line'||o.kind==='dimension'){
      const ps=o.points||[];
      const n=o.closed?ps.length:ps.length-1;
      for(let k=0;k<n;k++) add(o.id,ps[k],ps[(k+1)%ps.length]);
    }else if(o.kind==='rect'&&areaShapeType(o)==='rect'){
      /* 垂足/交点仅取矩形四条直边；圆/椭圆/扇形由切点/圆心/象限点捕捉覆盖，
         采样边会抢占切点，故不纳入 edges */
      const ps=shapeWorldPoints(o);
      for(let k=0;k<4;k++) add(o.id,ps[k],ps[(k+1)%4]);
    }
  });
  return out.concat(guideEdges());
}
/* -------------------- 临时参考线（运行时，不持久化） -------------------- */
let guideLines=[];   /* [{a:[x,y], b:[x,y]}]：两点定义方向，按无限长参与捕捉 */
function addGuideLine(a,b){
  if(!a||!b||dist(a,b)<EPS) return false;
  guideLines.push({a:[a[0],a[1]],b:[b[0],b[1]]});
  return true;
}
function removeLastGuideLine(){ return guideLines.pop()||null; }
function clearGuideLines(){ guideLines=[]; }
function guideLineList(){ return guideLines.map(g=>({a:g.a.slice(),b:g.b.slice()})); }
/** 参考线 → 捕捉边（±1e6 延展，使其与任意对象边可求交/求垂足） */
function guideEdges(){
  return guideLines.map((g,i)=>{
    const dx=g.b[0]-g.a[0], dy=g.b[1]-g.a[1], L=Math.hypot(dx,dy)||1;
    const ux=dx/L*1e6, uy=dy/L*1e6;
    return {id:'__guide'+i, guide:true, a:[g.a[0]-ux,g.a[1]-uy], b:[g.a[0]+ux,g.a[1]+uy]};
  });
}
/**
 * 方向约束（纯函数）：在「平行 / 垂直 / 等距 / 极轴」容差内把 wp 钳到对应方向。
 * 优先级：参考边平行 > 参考边垂直 > 上一段等距 > 极轴；返回 {p, mode}。
 * opt: {refDir(弧度), prevDir(弧度), prevLen, polarStep(度, 0=关闭), tolDeg=4, polarTolDeg=3}
 */
function directionalSnap(last,wp,opt){ return __geo.constrainDirectional(last,wp,opt); }
/** 收集正圆（支持精确切点；椭圆切点不启用）@returns [{id,c,r}] */
function collectSnapCircles(st,vis){
  const out=[];
  (st.objects||[]).forEach(o=>{
    if(vis && !vis(o)) return;
    if(o.kind==='rect'&&areaShapeType(o)==='circle') out.push({id:o.id,c:[o.x,o.y],r:o.shape.r});
  });
  return out;
}
function _segSegInt(a,b,c,d){ return __geo.segmentIntersection(a,b,c,d); }
/* 捕捉类型优先级（数值越小越优先）：精确点 > 交点 > 垂足 > 切点。
   同优先级再按到鼠标的屏幕距离取最近；不同优先级时即使稍远也优先精确类型。 */
const OSNAP_PRIORITY={endpoint:0,midpoint:1,quadrant:1,center:1,intersection:2,perpendicular:3,tangent:4};
function findOsnap(st,raw,tol,excludeIds,vis,typeFilter){
  let best=null, bd=tol;
  const consider=(p,type,id)=>{
    if(typeFilter && type!==typeFilter) return;   /* Tab 锁定单一捕捉类型时过滤其余候选 */
    const dd=Math.hypot(p[0]-raw[0],p[1]-raw[1]);
    if(dd>tol) return;
    if(!best
       || (OSNAP_PRIORITY[type]??9)<(OSNAP_PRIORITY[best.type]??9)
       || ((OSNAP_PRIORITY[type]??9)===(OSNAP_PRIORITY[best.type]??9)&&dd<bd)){
      bd=dd; best={p:[p[0],p[1]],type,id};
    }
  };
  for(const c of collectSnapCandidates(st,vis)){
    if(excludeIds && c.id && excludeIds.has(c.id)) continue;
    consider(c.p,c.type,c.id);
  }
  /* 交点：仅跨对象的线段相交（同一对象相邻/闭合边共享端点，跳过）。
     性能：先按鼠标 tol 邻域做包围盒粗筛，只有包围盒与 [raw±tol] 方块相交的边
     才可能产生 tol 内的垂足/交点，把 O(E²) 压缩到鼠标附近少数边之间 */
  const edges=collectSnapEdges(st,vis);
  const box={minX:raw[0]-tol,maxX:raw[0]+tol,minY:raw[1]-tol,maxY:raw[1]+tol};
  const nearEdges=edges.filter(e=>!(
    Math.max(e.a[0],e.b[0])<box.minX||Math.min(e.a[0],e.b[0])>box.maxX||
    Math.max(e.a[1],e.b[1])<box.minY||Math.min(e.a[1],e.b[1])>box.maxY));
  for(let i=0;i<nearEdges.length;i++) for(let j=i+1;j<nearEdges.length;j++){
    const e1=nearEdges[i], e2=nearEdges[j];
    if(e1.id===e2.id) continue;
    if(excludeIds && excludeIds.has(e1.id) && excludeIds.has(e2.id)) continue;
    const sh=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1])<EPS;
    if(sh(e1.a,e2.a)||sh(e1.a,e2.b)||sh(e1.b,e2.a)||sh(e1.b,e2.b)) continue;
    const ip=_segSegInt(e1.a,e1.b,e2.a,e2.b);
    if(ip) consider(ip,'intersection',e1.id+'|'+e2.id);
  }
  /* 垂足：raw 到各邻域线段的最近点 */
  for(const e of nearEdges){
    if(excludeIds && excludeIds.has(e.id)) continue;
    consider(nearestPointOnSegment(raw,e.a,e.b),'perpendicular',e.id);
  }
  /* 切点：鼠标贴近圆周时，取圆心→鼠标方向与圆周的交点（径向上正对的圆上点）。
     这是无"切线起点"上下文时最直观的切点语义；完整"从 P 引切线"在画线时由上一点判定 */
  for(const c of collectSnapCircles(st,vis)){
    if(excludeIds && excludeIds.has(c.id)) continue;
    const dx=raw[0]-c.c[0], dy=raw[1]-c.c[1], D=Math.hypot(dx,dy);
    if(D<EPS) continue;
    consider([c.c[0]+c.r*dx/D, c.c[1]+c.r*dy/D],'tangent',c.id);
  }
  return best;
}

/* -------------------- Shift 精确约束（预览与落点共用） -------------------- */
/**
 * 正交（ORTHO）：按住 Shift 时，把 p 钳到相对基点 base 的水平/垂直方向。
 * 主轴取位移分量绝对值较大者；不按 Shift 或无基点时原样返回。
 */
function orthoPoint(base,p,shift){ return __geo.constrainOrtho(base,p,shift); }
/** 极轴吸附：按住 Shift 时把 p 相对 center 的方位角钳到 45° 的整数倍（0/45/90/…），半径不变 */
function polarSnap45(center,p,shift,stepDeg){ return __geo.constrainPolar(center,p,shift,stepDeg); }
/**
 * 正方形/正圆拖画：以 a 为固定角点（圆心式拖画时 a 为包围盒第一角），
 * Shift 时把另一角 p 拉成边长等于主导位移的正方形，保留各轴方向符号。
 */
function squareCorner(a,p,shift){ return __geo.constrainSquareCorner(a,p,shift); }

/** p 到线段 ab 的最近点（垂足夹到线段内）；双击插入节点时保证新点落在线段上 */
function nearestPointOnSegment(p,a,b){ return __geo.nearestPointOnSegment(p,a,b); }
function segmentsIntersect(a,b,c,d){ return __geo.segmentsIntersect(a,b,c,d); }
function rectPoints(o){
  if(o.shape&&o.shape.type==='parallelogram'){
    return parallelogramPoints(o.x,o.y,o.width,o.height,o.shape.skew)
      .map(p=>rotatePoint(p,[o.x,o.y],o.angle));
  }
  const c0=[o.x,o.y], c1=[o.x+o.width,o.y], c2=[o.x+o.width,o.y+o.height], c3=[o.x,o.y+o.height];
  return [c0,c1,c2,c3].map(p=>rotatePoint(p,[o.x,o.y],o.angle));
}
function textCorners(o){
  const h=o.height || .7, w=Math.max(.8,(o.text||'文字').length*h*.62);
  const c=[[o.x-w/2,o.y-h*.55],[o.x+w/2,o.y-h*.55],[o.x+w/2,o.y+h*.55],[o.x-w/2,o.y+h*.55]];
  return c.map(p=>rotatePoint(p,[o.x,o.y],o.angle));
}
function objectPoints(o){
  if(o.kind==='rect') return shapeWorldPoints(o);
  if(o.kind==='text') return textCorners(o);
  return o.points && o.points.length ? o.points : [[o.x,o.y]];
}
function objectCenter(o){
  const ps=objectPoints(o);
  return [ps.reduce((s,p)=>s+p[0],0)/ps.length, ps.reduce((s,p)=>s+p[1],0)/ps.length];
}
function objectBounds(o){
  const ps=objectPoints(o);
  return {minX:Math.min(...ps.map(p=>p[0])),maxX:Math.max(...ps.map(p=>p[0])),minY:Math.min(...ps.map(p=>p[1])),maxY:Math.max(...ps.map(p=>p[1]))};
}
/** 平移单个对象（点/区域移动锚点，折线与标注同步平移全部节点） */
function translateObject(o,dx,dy){
  if(!o||!(dx||dy)) return;
  o.x=(Number(o.x)||0)+dx; o.y=(Number(o.y)||0)+dy;
  if(o.points&&o.points.length) o.points=o.points.map(p=>[p[0]+dx,p[1]+dy]);
  o.updatedAt=nowISO();
}
/** 多对象对齐：left/centerX/right/top/centerY/bottom，按各自包围盒对齐到选区外边界或中线 */
function alignObjects(objs,mode){
  const items=(objs||[]).filter(o=>o&&typeof o==='object');
  if(items.length<2) return 0;
  const boxes=items.map(objectBounds);
  const minX=Math.min(...boxes.map(b=>b.minX)), maxX=Math.max(...boxes.map(b=>b.maxX));
  const minY=Math.min(...boxes.map(b=>b.minY)), maxY=Math.max(...boxes.map(b=>b.maxY));
  items.forEach((o,i)=>{
    const b=boxes[i];
    let dx=0, dy=0;
    if(mode==='left') dx=minX-b.minX;
    else if(mode==='centerX') dx=(minX+maxX)/2-(b.minX+b.maxX)/2;
    else if(mode==='right') dx=maxX-b.maxX;
    else if(mode==='top') dy=maxY-b.maxY;
    else if(mode==='centerY') dy=(minY+maxY)/2-(b.minY+b.maxY)/2;
    else if(mode==='bottom') dy=minY-b.minY;
    translateObject(o,dx,dy);
  });
  return items.length;
}
/** 多对象等间距分布（按包围盒中心，首末保持不动）；axis=x 水平、y 垂直 */
function distributeObjects(objs,axis='x'){
  const items=(objs||[]).filter(o=>o&&typeof o==='object');
  if(items.length<3) return 0;
  const useY=axis==='y';
  const list=items.map(o=>{
    const b=objectBounds(o);
    return {o, c:useY?(b.minY+b.maxY)/2:(b.minX+b.maxX)/2};
  }).sort((a,b)=>a.c-b.c);
  const first=list[0].c, last=list[list.length-1].c, step=(last-first)/(list.length-1);
  list.forEach((it,i)=>{
    const d=first+step*i-it.c;
    translateObject(it.o, useY?0:d, useY?d:0);
  });
  return list.length;
}
function boundsIntersect(a,b){ return __geo.boundsIntersect(a,b); }

/* -------------------- 统一参数形状（区域与矢量场地共用） -------------------- */
/* 区域对象：shape=null 为矩形（width/height/angle）；否则 circle/ellipse/sector/parallelogram，锚点 (x,y) */
const AREA_SHAPE_TYPES=['rect','circle','ellipse','sector','parallelogram'];
const SHAPE_SEGMENTS=72;
/* 平行四边形倾角（°）：0=矩形，正值上边向右错切；限制 ±80° 避免退化为无限长边 */
const PARALLELOGRAM_DEFAULT_SKEW=30;
const PARALLELOGRAM_MAX_SKEW=80;
function parallelogramSkew(sh){ return __geo.clampSkew(sh&&sh.skew,PARALLELOGRAM_MAX_SKEW); }
/** 平行四边形四角（世界坐标，未旋转）：基点=左下角，错切位移 off=高×tan(倾角) */
function parallelogramPoints(x,y,w,h,skew){ return __geo.parallelogramPoints(x,y,w,h,skew); }
function areaShapeType(o){
  const t=o&&o.shape&&o.shape.type;
  return (t==='circle'||t==='ellipse'||t==='sector'||t==='parallelogram')?t:'rect';
}
/** 扇形有效张角（0–360°）；a0/a1 为世界系绝对角度（Y 向上），相等时视为整圆 */
function sectorSweep(sh){ return __geo.sectorSweep(sh&&sh.a0,sh&&sh.a1); }
/** 扇形弧采样（seg 等分），世界坐标，圆心由调用方给定 */
function sectorArcPoints(cx,cy,r,a0,sweep,seg=SHAPE_SEGMENTS){ return __geo.sectorArcPoints(cx,cy,r,a0,sweep,seg); }
/** 区域形状 → 闭合世界多边形顶点（扇形首点为圆心）；渲染/包围盒/框选/SVG 共用 */
function shapeWorldPoints(o,seg=SHAPE_SEGMENTS){
  const tt=areaShapeType(o);
  if(tt==='rect'||tt==='parallelogram') return rectPoints(o);
  const sh=o.shape;
  if(tt==='circle'){
    const r=Math.max(EPS,Number(sh.r)||0), pts=[];
    for(let i=0;i<seg;i++){ const a=2*Math.PI*i/seg; pts.push([o.x+r*Math.cos(a),o.y+r*Math.sin(a)]); }
    return pts;
  }
  if(tt==='ellipse'){
    const rx=Math.max(EPS,Number(sh.rx)||0), ry=Math.max(EPS,Number(sh.ry)||0);
    const pts=[], ang=(o.angle||0)*Math.PI/180, c=Math.cos(ang), s=Math.sin(ang);
    for(let i=0;i<seg;i++){
      const a=2*Math.PI*i/seg, lx=rx*Math.cos(a), ly=ry*Math.sin(a);
      pts.push([o.x+lx*c-ly*s, o.y+lx*s+ly*c]);
    }
    return pts;
  }
  return [[o.x,o.y]].concat(sectorArcPoints(o.x,o.y,Math.max(EPS,Number(sh.r)||0),Number(sh.a0)||0,sectorSweep(sh),seg));
}
/**
 * 对象轮廓顶点（世界坐标米）——SVG / DXF 导出的唯一顶点源（A-15）。
 * rect（含圆/椭圆/扇形/平行四边形参数化形状）→ 采样闭合多边形；line/dimension → 节点序列；
 * point/text 无轮廓返回 []。**返回新数组**，调用方可安全修改/序列化（DXF 构造器会就地消费）。
 * 闭合语义由调用方决定：区域恒闭合、折线看 o.closed、面积标注看 subtype。
 */
function outlineOf(o){
  if(!o||typeof o!=='object') return [];
  if(o.kind==='rect') return shapeWorldPoints(o);
  if(o.kind==='line'||o.kind==='dimension') return (o.points||[]).map(p=>[Number(p&&p[0])||0,Number(p&&p[1])||0]);
  return [];
}
/** 世界坐标命中（米） */
function shapeHit(o,p){
  const tt=areaShapeType(o);
  if(tt==='rect'||tt==='parallelogram') return pointInPolygon(p,rectPoints(o));
  const sh=o.shape, dx=p[0]-o.x, dy=p[1]-o.y;
  if(tt==='circle') return Math.hypot(dx,dy)<=(Number(sh.r)||0);
  if(tt==='ellipse'){
    const q=rotatePoint(p,[o.x,o.y],-(o.angle||0));
    const rx=Math.max(EPS,Number(sh.rx)||0), ry=Math.max(EPS,Number(sh.ry)||0);
    const vx=(q[0]-o.x)/rx, vy=(q[1]-o.y)/ry;
    return vx*vx+vy*vy<=1;
  }
  const r=Number(sh.r)||0, d=Math.hypot(dx,dy);
  if(d>r) return false;
  if(d<EPS) return true;
  let bearing=Math.atan2(dy,dx)*180/Math.PI-(Number(sh.a0)||0);
  bearing=((bearing%360)+360)%360;
  return bearing<=sectorSweep(sh)+EPS;
}
/** 面积（㎡），各形状精确公式 */
function shapeArea(o){
  const tt=areaShapeType(o);
  if(tt==='rect'||tt==='parallelogram') return Math.max(0,o.width)*Math.max(0,o.height);
  const sh=o.shape;
  if(tt==='circle'){ const r=Number(sh.r)||0; return Math.PI*r*r; }
  if(tt==='ellipse') return __geo.ellipseArea(sh.rx,sh.ry);
  const r=Number(sh.r)||0;
  return __geo.sectorArea(r,sectorSweep(sh));
}
/** 周长（米）：矩形 2(w+h)；圆 2πr；椭圆 Ramanujan 近似；扇形 2r+弧长（整圆扇=圆） */
function shapePerimeter(o){
  const tt=areaShapeType(o);
  if(tt==='rect') return Math.max(0,o.width)*2+Math.max(0,o.height)*2;
  if(tt==='parallelogram'){
    /* 错切不改变面积，但斜边长为 h/cos(倾角)：周长 = 2(w + h/cosθ) */
    const w=Math.max(0,o.width), hh=Math.max(0,o.height);
    const cs=Math.cos(parallelogramSkew(o.shape)*Math.PI/180);
    return 2*(w+(cs<1e-6?0:hh/cs));
  }
  const sh=o.shape;
  if(tt==='circle') return 2*Math.PI*sh.r;
  if(tt==='ellipse') return __geo.ellipsePerimeter(sh.rx,sh.ry);
  const r=Math.max(0,sh.r);
  let sweep=sectorSweep(sh); if(!sh.a0&&!sh.a1) sweep=360;
  /* 整圆扇（360°）两条半径重合，周长仅取弧长 */
  return __geo.sectorPerimeter(r,sweep);
}
/** 标签/变换中心：矩形取四角中心；圆/椭圆/扇形锚点即圆心 (x,y) */
function shapeLabelCenter(o){
  const tt=areaShapeType(o);
  if(tt==='rect'||tt==='parallelogram') return objectCenter(o);
  return [o.x,o.y];
}
/**
 * 区域形状互换：保持中心（质心）不动，按等面积（矩形/平行四边形/圆/扇形）或外接轴（椭圆）换算参数。
 * 矩形⇄椭圆/平行四边形沿用原角度；圆/扇形无整体朝向（扇形角度在 a0/a1 中）。
 */
function convertAreaShape(o,newType){
  const old=areaShapeType(o);
  if(old===newType||!AREA_SHAPE_TYPES.includes(newType)) return;
  const A=Math.max(shapeArea(o),.01), c=shapeLabelCenter(o), oldAngle=o.angle||0;
  const oldW=o.width, oldH=o.height, oldShape=o.shape;
  if(newType==='rect'){
    let bw,bh;
    if(old==='ellipse'){ bw=2*Math.max(.05,Number(oldShape.rx)); bh=2*Math.max(.05,Number(oldShape.ry)); }
    else if(old==='parallelogram'){ bw=Math.max(.05,oldW); bh=Math.max(.05,oldH); }
    else { bw=bh=Math.sqrt(A); }
    o.x=c[0]-bw/2; o.y=c[1]-bh/2; o.width=bw; o.height=bh;
    o.angle=old==='parallelogram'?oldAngle:0; o.shape=null;
    return;
  }
  if(newType==='parallelogram'){
    let bw,bh,ang=oldAngle;
    if(old==='rect'||old==='parallelogram'){ bw=Math.max(.05,oldW); bh=Math.max(.05,oldH); }
    else if(old==='ellipse'){ bw=2*Math.max(.05,Number(oldShape.rx)); bh=2*Math.max(.05,Number(oldShape.ry)); }
    else { bw=bh=Math.sqrt(A); ang=0; }
    const skew=old==='parallelogram'?parallelogramSkew(oldShape):PARALLELOGRAM_DEFAULT_SKEW;
    const off=bh*Math.tan(skew*Math.PI/180);
    /* 质心相对基点偏移 (w+off)/2, h/2：反推基点使质心落在原中心 */
    o.x=c[0]-(bw+off)/2; o.y=c[1]-bh/2;
    o.width=bw; o.height=bh; o.angle=ang; o.shape={type:'parallelogram',skew};
    return;
  }
  if(newType==='circle'){
    o.shape={type:'circle',r:Math.sqrt(A/Math.PI)};
  }else if(newType==='ellipse'){
    let rx,ry,ang=0;
    if(old==='rect'||old==='parallelogram'){ rx=oldW/2; ry=oldH/2; ang=oldAngle; }
    else if(old==='circle'){ rx=ry=Number(oldShape.r); }
    else { rx=ry=Number(oldShape.r); }
    o.angle=ang; o.shape={type:'ellipse',rx:Math.max(.05,rx),ry:Math.max(.05,ry)};
  }else{ /* sector：默认 90° 饼形，半径按等面积反推，圆心不动 */
    const sweep=90;
    o.angle=0; o.shape={type:'sector',r:Math.sqrt(A/(Math.PI*sweep/360)),a0:0,a1:sweep};
  }
  o.x=c[0]; o.y=c[1]; o.width=0; o.height=0;
}

