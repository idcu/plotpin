/* geometry.js —— 世界坐标几何纯函数 */
/* -------------------- 几何工具 -------------------- */
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const mul=(a,s)=>[a[0]*s,a[1]*s];
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function rotatePoint(p,c,angDeg){
  const a=angDeg*Math.PI/180, x=p[0]-c[0], y=p[1]-c[1];
  return [c[0]+x*Math.cos(a)-y*Math.sin(a), c[1]+x*Math.sin(a)+y*Math.cos(a)];
}
function polygonArea(points){
  let a=0;
  for(let i=0;i<points.length;i++){
    const p=points[i], q=points[(i+1)%points.length];
    a += p[0]*q[1]-q[0]*p[1];
  }
  return Math.abs(a/2);
}
function polylineLength(points){
  let s=0; for(let i=1;i<points.length;i++) s += dist(points[i-1],points[i]); return s;
}
function pointInPolygon(p, poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];
    const hit=((yi>p[1])!==(yj>p[1])) && (p[0] < (xj-xi)*(p[1]-yi)/(yj-yi)+xi);
    if(hit) inside=!inside;
  }
  return inside;
}
function distanceToSegment(p,a,b){
  const v=sub(b,a), w=sub(p,a), l2=v[0]*v[0]+v[1]*v[1];
  if(l2<EPS) return dist(p,a);
  let t=(w[0]*v[0]+w[1]*v[1])/l2; t=Math.max(0,Math.min(1,t));
  return dist(p,[a[0]+t*v[0],a[1]+t*v[1]]);
}
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
  return out;
}
/** 收集"可垂足/可交点"的线段边：折线含闭合边；非矩形区域以采样多边形近似 */
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
  return out;
}
/** 收集正圆（支持精确切点；椭圆切点不启用）@returns [{id,c,r}] */
function collectSnapCircles(st,vis){
  const out=[];
  (st.objects||[]).forEach(o=>{
    if(vis && !vis(o)) return;
    if(o.kind==='rect'&&areaShapeType(o)==='circle') out.push({id:o.id,c:[o.x,o.y],r:o.shape.r});
  });
  return out;
}
function _segSegInt(a,b,c,d){
  const r=sub(b,a), s=sub(d,c), den=r[0]*s[1]-r[1]*s[0];
  if(Math.abs(den)<EPS) return null;
  const t=((c[0]-a[0])*s[1]-(c[1]-a[1])*s[0])/den;
  const u=((c[0]-a[0])*r[1]-(c[1]-a[1])*r[0])/den;
  if(t<0||t>1||u<0||u>1) return null;
  return [a[0]+t*r[0], a[1]+t*r[1]];
}
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
function orthoPoint(base,p,shift){
  if(!shift||!base) return p;
  const dx=p[0]-base[0], dy=p[1]-base[1];
  if(Math.abs(dx)>=Math.abs(dy)) return [p[0],base[1]];
  return [base[0],p[1]];
}
/** 极轴吸附：按住 Shift 时把 p 相对 center 的方位角钳到 45° 的整数倍（0/45/90/…），半径不变 */
function polarSnap45(center,p,shift,stepDeg){
  if(!shift||!center) return p;
  const r=Math.hypot(p[0]-center[0],p[1]-center[1]);
  if(r<EPS) return p;
  const step=stepDeg||45;
  const deg=Math.atan2(p[1]-center[1],p[0]-center[0])*180/Math.PI;
  const a=Math.round(deg/step)*step*Math.PI/180;
  return [center[0]+r*Math.cos(a),center[1]+r*Math.sin(a)];
}
/**
 * 正方形/正圆拖画：以 a 为固定角点（圆心式拖画时 a 为包围盒第一角），
 * Shift 时把另一角 p 拉成边长等于主导位移的正方形，保留各轴方向符号。
 */
function squareCorner(a,p,shift){
  if(!shift) return p;
  const dx=p[0]-a[0], dy=p[1]-a[1];
  const s=Math.max(Math.abs(dx),Math.abs(dy));
  if(s<EPS) return p;
  return [a[0]+(dx===0?0:Math.sign(dx))*s, a[1]+(dy===0?0:Math.sign(dy))*s];
}

/** p 到线段 ab 的最近点（垂足夹到线段内）；双击插入节点时保证新点落在线段上 */
function nearestPointOnSegment(p,a,b){
  const v=sub(b,a), w=sub(p,a), l2=v[0]*v[0]+v[1]*v[1];
  if(l2<EPS) return a.slice();
  let t=(w[0]*v[0]+w[1]*v[1])/l2; t=Math.max(0,Math.min(1,t));
  return [a[0]+t*v[0],a[1]+t*v[1]];
}
function segmentsIntersect(a,b,c,d){
  function ccw(p1,p2,p3){return (p3[1]-p1[1])*(p2[0]-p1[0]) > (p2[1]-p1[1])*(p3[0]-p1[0]);}
  return ccw(a,c,d)!==ccw(b,c,d) && ccw(a,b,c)!==ccw(a,b,d);
}
function rectPoints(o){
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
function boundsIntersect(a,b){ return !(a.maxX<b.minX||b.maxX<a.minX||a.maxY<b.minY||b.maxY<a.minY); }

/* -------------------- 统一参数形状（区域与矢量场地共用） -------------------- */
/* 区域对象：shape=null 为矩形（width/height/angle）；否则 circle/ellipse/sector，锚点 (x,y) */
const AREA_SHAPE_TYPES=['rect','circle','ellipse','sector'];
const SHAPE_SEGMENTS=72;
function areaShapeType(o){
  const t=o&&o.shape&&o.shape.type;
  return (t==='circle'||t==='ellipse'||t==='sector')?t:'rect';
}
/** 扇形有效张角（0–360°）；a0/a1 为世界系绝对角度（Y 向上），相等时视为整圆 */
function sectorSweep(sh){
  let s=(Number(sh.a1)||0)-(Number(sh.a0)||0);
  s=((s%360)+360)%360;
  return s===0?360:s;
}
/** 扇形弧采样（seg 等分），世界坐标，圆心由调用方给定 */
function sectorArcPoints(cx,cy,r,a0,sweep,seg=SHAPE_SEGMENTS){
  const pts=[];
  for(let i=0;i<=seg;i++){
    const a=(a0+sweep*i/seg)*Math.PI/180;
    pts.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]);
  }
  return pts;
}
/** 区域形状 → 闭合世界多边形顶点（扇形首点为圆心）；渲染/包围盒/框选/SVG 共用 */
function shapeWorldPoints(o,seg=SHAPE_SEGMENTS){
  const tt=areaShapeType(o);
  if(tt==='rect') return rectPoints(o);
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
/** 世界坐标命中（米） */
function shapeHit(o,p){
  const tt=areaShapeType(o);
  if(tt==='rect') return pointInPolygon(p,rectPoints(o));
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
  if(tt==='rect') return Math.max(0,o.width)*Math.max(0,o.height);
  const sh=o.shape;
  if(tt==='circle'){ const r=Number(sh.r)||0; return Math.PI*r*r; }
  if(tt==='ellipse') return Math.PI*(Number(sh.rx)||0)*(Number(sh.ry)||0);
  const r=Number(sh.r)||0;
  return sectorSweep(sh)/360*Math.PI*r*r;
}
/** 周长（米）：矩形 2(w+h)；圆 2πr；椭圆 Ramanujan 近似；扇形 2r+弧长（整圆扇=圆） */
function shapePerimeter(o){
  const tt=areaShapeType(o);
  if(tt==='rect') return Math.max(0,o.width)*2+Math.max(0,o.height)*2;
  const sh=o.shape;
  if(tt==='circle') return 2*Math.PI*sh.r;
  if(tt==='ellipse'){
    const a=Math.max(0,sh.rx), b=Math.max(0,sh.ry);
    if(a+b<EPS) return 0;
    const h=((a-b)*(a-b))/((a+b)*(a+b));
    return Math.PI*(a+b)*(1+3*h/(10+Math.sqrt(4-3*h)));
  }
  const r=Math.max(0,sh.r);
  let sweep=sectorSweep(sh); if(!sh.a0&&!sh.a1) sweep=360;
  /* 整圆扇（360°）两条半径重合，周长仅取弧长 */
  return (sweep>=360?0:2*r)+r*sweep*Math.PI/180;
}
/** 标签/变换中心：矩形取四角中心；圆/椭圆/扇形锚点即圆心 (x,y) */
function shapeLabelCenter(o){
  if(areaShapeType(o)==='rect') return objectCenter(o);
  return [o.x,o.y];
}
/**
 * 区域形状互换：保持中心不动，按等面积（矩形/圆/扇形）或外接轴（椭圆）换算参数。
 * 矩形⇄椭圆沿用原角度；圆/扇形无整体朝向（扇形角度在 a0/a1 中）。
 */
function convertAreaShape(o,newType){
  const old=areaShapeType(o);
  if(old===newType||!AREA_SHAPE_TYPES.includes(newType)) return;
  const A=Math.max(shapeArea(o),.01), c=shapeLabelCenter(o), oldAngle=o.angle||0;
  const oldW=o.width, oldH=o.height, oldShape=o.shape;
  if(newType==='rect'){
    let bw,bh;
    if(old==='ellipse'){ bw=2*Math.max(.05,Number(oldShape.rx)); bh=2*Math.max(.05,Number(oldShape.ry)); }
    else { bw=bh=Math.sqrt(A); }
    o.x=c[0]-bw/2; o.y=c[1]-bh/2; o.width=bw; o.height=bh; o.angle=0; o.shape=null;
    return;
  }
  if(newType==='circle'){
    o.shape={type:'circle',r:Math.sqrt(A/Math.PI)};
  }else if(newType==='ellipse'){
    let rx,ry,ang=0;
    if(old==='rect'){ rx=oldW/2; ry=oldH/2; ang=oldAngle; }
    else if(old==='circle'){ rx=ry=Number(oldShape.r); }
    else { rx=ry=Number(oldShape.r); }
    o.angle=ang; o.shape={type:'ellipse',rx:Math.max(.05,rx),ry:Math.max(.05,ry)};
  }else{ /* sector：默认 90° 饼形，半径按等面积反推，圆心不动 */
    const sweep=90;
    o.angle=0; o.shape={type:'sector',r:Math.sqrt(A/(Math.PI*sweep/360)),a0:0,a1:sweep};
  }
  o.x=c[0]; o.y=c[1]; o.width=0; o.height=0;
}

/* -------------------- 矢量场地（矩形/圆形/椭圆/扇形/多边形） -------------------- */
/** 场地世界域（米）：图片=像素×m/px；矢量形状直接以米定义、规整在第一象限 */
function siteDomainOf(bg){
  bg=bg||state.background;
  if(bg.kind==='image') return {w:Math.max(.01,bg.width*bg.metersPerPixel),h:Math.max(.01,bg.height*bg.metersPerPixel)};
  const sh=bg.shape||{type:'rect',w:100,h:70};
  if(sh.type==='circle'){ const r=positiveNum(sh.r,50); return {w:r*2,h:r*2}; }
  if(sh.type==='ellipse'){
    const rx=positiveNum(sh.rx,50), ry=positiveNum(sh.ry,35);
    return {w:Math.max(.01,rx*2),h:Math.max(.01,ry*2)};
  }
  if(sh.type==='sector'){
    const r=positiveNum(sh.r,50), cx=positiveNum(sh.cx,r), cy=positiveNum(sh.cy,r);
    const pts=sectorArcPoints(cx,cy,r,Number(sh.a0)||0,sectorSweep(sh)).concat([[cx,cy]]);
    const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
    return {w:Math.max(.01,Math.max(...xs)-Math.min(...xs)),h:Math.max(.01,Math.max(...ys)-Math.min(...ys))};
  }
  if(sh.type==='polygon'&&Array.isArray(sh.points)&&sh.points.length>=3){
    const xs=sh.points.map(p=>p[0]),ys=sh.points.map(p=>p[1]);
    return {w:Math.max(.01,Math.max(...xs,0)),h:Math.max(.01,Math.max(...ys,0))};
  }
  return {w:Math.max(.01,positiveNum(sh.w,100)),h:Math.max(.01,positiveNum(sh.h,70))};
}
function positiveNum(v,fb){ const n=Number(v); return Number.isFinite(n)&&n>0?n:fb; }
/** 把任意位置的两个角点规整为原点矩形 {type:'rect',w,h} */
function rectShapeFromCorners(a,b){
  return {type:'rect',w:Math.max(.05,Math.abs(a[0]-b[0])),h:Math.max(.05,Math.abs(a[1]-b[1]))};
}
/** 圆形场地：圆心固定在世界域中心 (r,r)，世界域恰为 2r×2r（拖点仅决定半径） */
function circleShapeFrom(c,r){ const rr=Math.max(.05,Number(r)||0); return {type:'circle',cx:rr,cy:rr,r:rr}; }
/** 椭圆场地：由包围盒两角点生成，中心置域中心，世界域=包围盒 */
function ellipseShapeFromCorners(a,b){
  const w=Math.max(.05,Math.abs(a[0]-b[0])), h=Math.max(.05,Math.abs(a[1]-b[1]));
  return {type:'ellipse',cx:w/2,cy:h/2,rx:w/2,ry:h/2,angle:0};
}
/** 扇形场地：圆心/半径/起止角确定后整体平移到第一象限（与多边形同一规整规则） */
function sectorShapeFrom(c,r,a0=0,a1){
  const rr=Math.max(.05,Number(r)||0);
  let s0=Number(a0); if(!Number.isFinite(s0)) s0=0;
  let s1=Number(a1); if(!Number.isFinite(s1)) s1=s0+90;
  const cx=Number(c[0])||0, cy=Number(c[1])||0;
  const pts=sectorArcPoints(cx,cy,rr,s0,s1-s0).concat([[cx,cy]]);
  const minX=Math.min(...pts.map(p=>p[0])), minY=Math.min(...pts.map(p=>p[1]));
  return {type:'sector',cx:cx-minX,cy:cy-minY,r:rr,a0:s0,a1:s1};
}
/** 多边形平移到第一象限（minX=minY=0），返回规整后的 shape */
function polygonShapeFromPoints(points){
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const minX=Math.min(...xs),minY=Math.min(...ys);
  return {type:'polygon',points:points.map(p=>[p[0]-minX,p[1]-minY])};
}
function siteKindName(k){ return ({image:'图片底图',rect:'矩形场地',circle:'圆形场地',ellipse:'椭圆场地',sector:'扇形场地',polygon:'多边形场地'})[k]||k; }
function siteDescription(bg){
  bg=bg||state.background;
  const d=siteDomainOf(bg);
  if(bg.kind==='image') return `图片底图：${bg.fileName||'未命名'} ${bg.width}×${bg.height}px ｜ ${fmt(bg.metersPerPixel)} m/px${bg.calibrated?'（已校准）':'（未校准）'} ｜ 实地 ${fmt(d.w)}×${fmt(d.h)} m`;
  if(bg.kind==='circle') return `圆形场地：半径 ${fmt(bg.shape.r)} m ｜ 占地 ${fmt(d.w)}×${fmt(d.h)} m`;
  if(bg.kind==='ellipse'){
    const sh=bg.shape, rot=Number(sh.angle)||0;
    return `椭圆场地：半径 ${fmt(sh.rx)}×${fmt(sh.ry)} m${rot?` ｜ 旋转 ${Math.round(rot)}°`:''} ｜ 外接 ${fmt(d.w)}×${fmt(d.h)} m`;
  }
  if(bg.kind==='sector') return `扇形场地：半径 ${fmt(bg.shape.r)} m ｜ ${Math.round(sectorSweep(bg.shape))}° 扇区 ｜ 外接 ${fmt(d.w)}×${fmt(d.h)} m`;
  if(bg.kind==='polygon') return `多边形场地：${bg.shape.points.length} 条边 ｜ 外接 ${fmt(d.w)}×${fmt(d.h)} m`;
  return `矩形场地：${fmt(d.w)}×${fmt(d.h)} m（世界坐标，无需比例尺校准）`;
}

/* -------------------- 点设备物理尺寸命中（世界坐标） -------------------- */
/**
 * @param o 点对象（phys>0 时生效）
 * @param shape 类型的 scaleShape：circle/square/sector/bar
 * @param p 世界坐标测试点
 */
function hitPhysicalPoint(o,shape,p){
  const size=Number(o.phys);
  if(!(size>0)) return false;
  const dxy=[p[0]-o.x,p[1]-o.y];
  if(shape==='circle') return Math.hypot(dxy[0],dxy[1])<=size/2;
  if(shape==='square'){
    const q=rotatePoint(p,[o.x,o.y],-o.angle);
    return Math.abs(q[0]-o.x)<=size/2 && Math.abs(q[1]-o.y)<=size/2;
  }
  if(shape==='bar'){
    const a=o.angle*Math.PI/180, half=size/2;
    const e1=[o.x+Math.cos(a)*half,o.y+Math.sin(a)*half], e2=[o.x-Math.cos(a)*half,o.y-Math.sin(a)*half];
    return distanceToSegment(p,e1,e2)<=Math.max(.12,8/(state.viewport.zoom||1));
  }
  if(shape==='sector'){
    const r=Math.hypot(dxy[0],dxy[1]);
    if(r>size) return false;
    if(r<EPS) return true;
    const fov=Math.min(360,Math.max(10,Number(getType(o.typeId).fov)||90));
    /* 朝向角 0°=+X；世界系 Y 向上，屏幕朝向已取反，这里在世界系内比较即可 */
    let bearing=Math.atan2(dxy[1],dxy[0])*180/Math.PI-o.angle;
    bearing=((bearing%360)+360)%360;
    const half=fov/2;
    return bearing<=half || bearing>=360-half;
  }
  return false;
}
function normalizeAngle(a){ a=((a%360)+360)%360; return a; }
function fmt(n){ const p=state.settings.precision ?? 2; return (Math.round(n*Math.pow(10,p))/Math.pow(10,p)).toFixed(p); }
