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
function directionalSnap(last,wp,opt){
  opt=opt||{};
  const v=[wp[0]-last[0],wp[1]-last[1]], len=Math.hypot(v[0],v[1]);
  if(len<EPS) return {p:[wp[0],wp[1]],mode:'none'};
  const ang=Math.atan2(v[1],v[0]);
  const tol=(opt.tolDeg===undefined?4:Number(opt.tolDeg))*Math.PI/180;
  const near=(a,b,t)=>{
    let d=a-b; d=Math.atan2(Math.sin(d),Math.cos(d));
    return Math.min(Math.abs(d),Math.abs(Math.abs(d)-Math.PI))<=t;
  };
  const project=(dir)=>{
    const u=[Math.cos(dir),Math.sin(dir)], dot=v[0]*u[0]+v[1]*u[1];
    return [last[0]+u[0]*dot,last[1]+u[1]*dot];
  };
  if(Number.isFinite(opt.refDir)){
    if(near(ang,opt.refDir,tol)) return {p:project(opt.refDir),mode:'parallel'};
    if(near(ang,opt.refDir+Math.PI/2,tol)) return {p:project(opt.refDir+Math.PI/2),mode:'perpendicular'};
  }
  if(Number.isFinite(opt.prevDir)&&Number(opt.prevLen)>EPS&&near(ang,opt.prevDir,tol)){
    return {p:[last[0]+Math.cos(ang)*opt.prevLen,last[1]+Math.sin(ang)*opt.prevLen],mode:'equal'};
  }
  if(Number(opt.polarStep)>0){
    const step=Number(opt.polarStep), deg=ang*180/Math.PI;
    const nearest=Math.round(deg/step)*step;
    const pTol=(opt.polarTolDeg===undefined?3:Number(opt.polarTolDeg))*Math.PI/180;
    if(near(ang,nearest*Math.PI/180,pTol)) return {p:project(nearest*Math.PI/180),mode:'polar'};
  }
  return {p:[wp[0],wp[1]],mode:'none'};
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
function boundsIntersect(a,b){ return !(a.maxX<b.minX||b.maxX<a.minX||a.maxY<b.minY||b.maxY<a.minY); }

/* -------------------- 统一参数形状（区域与矢量场地共用） -------------------- */
/* 区域对象：shape=null 为矩形（width/height/angle）；否则 circle/ellipse/sector/parallelogram，锚点 (x,y) */
const AREA_SHAPE_TYPES=['rect','circle','ellipse','sector','parallelogram'];
const SHAPE_SEGMENTS=72;
/* 平行四边形倾角（°）：0=矩形，正值上边向右错切；限制 ±80° 避免退化为无限长边 */
const PARALLELOGRAM_DEFAULT_SKEW=30;
const PARALLELOGRAM_MAX_SKEW=80;
function parallelogramSkew(sh){
  const v=Number(sh&&sh.skew)||0;
  return Math.max(-PARALLELOGRAM_MAX_SKEW,Math.min(PARALLELOGRAM_MAX_SKEW,v));
}
/** 平行四边形四角（世界坐标，未旋转）：基点=左下角，错切位移 off=高×tan(倾角) */
function parallelogramPoints(x,y,w,h,skew){
  const off=Math.max(0,h)*Math.tan(parallelogramSkew({skew})*Math.PI/180);
  return [[x,y],[x+w,y],[x+w+off,y+h],[x+off,y+h]];
}
function areaShapeType(o){
  const t=o&&o.shape&&o.shape.type;
  return (t==='circle'||t==='ellipse'||t==='sector'||t==='parallelogram')?t:'rect';
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
  if(tt==='ellipse') return Math.PI*(Number(sh.rx)||0)*(Number(sh.ry)||0);
  const r=Number(sh.r)||0;
  return sectorSweep(sh)/360*Math.PI*r*r;
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

/* -------------------- 矢量场地（矩形/圆形/椭圆/扇形/多边形） -------------------- */
/** 场地世界域（米）：图片=像素×m/px；矢量形状直接以米定义、规整在第一象限 */
function siteDomainOf(bg){
  bg=bg||state.background;
  if(bg.kind==='image'){
    const f=imageWorldFrame(bg);   /* 仿射校准后取四角轴对齐包围框，保证域尺寸与渲染/网格一致 */
    if(f) return {w:Math.max(.01,f.w),h:Math.max(.01,f.h)};
    return {w:Math.max(.01,bg.width*bg.metersPerPixel),h:Math.max(.01,bg.height*bg.metersPerPixel)};
  }
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
  if(sh.type==='parallelogram'){
    const pts=parallelogramPoints(Number(sh.x)||0,Number(sh.y)||0,positiveNum(sh.w,100),positiveNum(sh.h,70),sh.skew);
    const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]);
    return {w:Math.max(.01,Math.max(...xs)-Math.min(...xs)),h:Math.max(.01,Math.max(...ys)-Math.min(...ys))};
  }
  return {w:Math.max(.01,positiveNum(sh.w,100)),h:Math.max(.01,positiveNum(sh.h,70))};
}
function positiveNum(v,fb){ const n=Number(v); return Number.isFinite(n)&&n>0?n:fb; }
/**
 * 矢量场地实际世界包围盒（米，允许负值）：各类形状按真实位置/旋转取轴对齐外接框；
 * 图片底图复用仿射(imageWorldFrame)或像素×m/px。矩形以 shape.x/shape.y 为基点，
 * 圆/椭圆/扇形以 cx/cy 为圆心，多边形取顶点 min/max。
 * 供 worldFrame 取景框使用：节点拖拽到负坐标或超出原范围时取景框随实际形状更新。
 */
function siteBounds(bg){
  bg=bg||state.background;
  const mk=(minX,minY,maxX,maxY)=>({minX,minY,maxX,maxY,w:Math.max(.01,maxX-minX),h:Math.max(.01,maxY-minY)});
  if(bg.kind==='image'){
    const f=imageWorldFrame(bg);
    if(f) return f;
    const w=Math.max(.01,bg.width*bg.metersPerPixel), h=Math.max(.01,bg.height*bg.metersPerPixel);
    return {minX:0,minY:0,maxX:w,maxY:h,w,h};
  }
  const sh=bg.shape||{type:'rect',w:100,h:70};
  if(sh.type==='circle'){ const r=positiveNum(sh.r,50),cx=Number(sh.cx)||0,cy=Number(sh.cy)||0; return mk(cx-r,cy-r,cx+r,cy+r); }
  if(sh.type==='ellipse'){
    const rx=positiveNum(sh.rx,50), ry=positiveNum(sh.ry,35);
    const cx=Number(sh.cx)||0, cy=Number(sh.cy)||0, a=(Number(sh.angle)||0)*Math.PI/180;
    const c=Math.cos(a), s=Math.sin(a);
    const hw=Math.sqrt(rx*rx*c*c+ry*ry*s*s), hh=Math.sqrt(rx*rx*s*s+ry*ry*c*c);
    return mk(cx-hw,cy-hh,cx+hw,cy+hh);
  }
  if(sh.type==='sector'){
    const r=positiveNum(sh.r,50), cx=Number(sh.cx)||0, cy=Number(sh.cy)||0;
    const pts=sectorArcPoints(cx,cy,r,Number(sh.a0)||0,sectorSweep(sh)).concat([[cx,cy]]);
    const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]);
    return mk(Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys));
  }
  if(sh.type==='polygon'&&Array.isArray(sh.points)&&sh.points.length>=3){
    const xs=sh.points.map(p=>Number(p[0])||0), ys=sh.points.map(p=>Number(p[1])||0);
    return mk(Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys));
  }
  if(sh.type==='parallelogram'){
    const pts=parallelogramPoints(Number(sh.x)||0,Number(sh.y)||0,positiveNum(sh.w,100),positiveNum(sh.h,70),sh.skew);
    const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]);
    return mk(Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys));
  }
  const w=positiveNum(sh.w,100), h=positiveNum(sh.h,70), x=Number(sh.x)||0, y=Number(sh.y)||0;
  return mk(x,y,x+w,y+h);
}
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
function siteKindName(k){ return ({image:'图片底图',rect:'矩形场地',circle:'圆形场地',ellipse:'椭圆场地',sector:'扇形场地',parallelogram:'平行四边形场地',polygon:'多边形场地'})[k]||k; }
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

/* ==================== 视场覆盖率分析（栅格法，零依赖） ==================== */
/** 点设备的有效覆盖 footprint：扇形摄像机/全向圆点；无物理半径或仅图标设备返回 null */
function cameraFootprint(o){
  const r=Number(o.phys);
  if(!(r>0)) return null;
  const type=getType(o.typeId), shape=type.scaleShape;
  if(shape==='sector'){
    const fov=Math.min(360,Math.max(10,Number(type.fov)||90));
    return {kind:fov>=360?'circle':'sector',id:o.id,name:o.name||'',x:o.x,y:o.y,r,fov,angle:Number(o.angle)||0};
  }
  if(shape==='circle') return {kind:'circle',id:o.id,name:o.name||'',x:o.x,y:o.y,r:r/2};
  if(shape==='square') return {kind:'square',id:o.id,name:o.name||'',x:o.x,y:o.y,r:r/2,angle:Number(o.angle)||0};
  return null;
}
/** 世界点是否落在覆盖域内（角度约定与 hitPhysicalPoint 一致：0°=+X，Y 向上） */
function pointInFootprint(p,cam){
  const dx=p[0]-cam.x, dy=p[1]-cam.y, d=Math.hypot(dx,dy);
  if(cam.kind==='square'){
    const q=rotatePoint(p,[cam.x,cam.y],-cam.angle);
    return Math.abs(q[0]-cam.x)<=cam.r+EPS && Math.abs(q[1]-cam.y)<=cam.r+EPS;
  }
  if(d>cam.r+EPS) return false;
  if(cam.kind==='circle'||d<EPS) return true;
  let bearing=Math.atan2(dy,dx)*180/Math.PI-cam.angle;
  bearing=((bearing%360)+360)%360;
  const half=cam.fov/2;
  return bearing<=half||bearing>=360-half;
}
/** 参与覆盖率统计的闭合区域：区域对象 + 闭合折线 */
function regionPolygons(st){
  const out=[];
  for(const o of st.objects){
    if(o.kind==='rect'){ const pts=shapeWorldPoints(o); if(pts.length>=3) out.push({id:o.id,name:o.name||'未命名区域',points:pts}); }
    else if(o.kind==='line'&&o.closed&&Array.isArray(o.points)&&o.points.length>=3){
      out.push({id:o.id,name:o.name||'未命名闭合折线',points:o.points.map(p=>p.slice())});
    }
  }
  return out;
}
function polygonBBox(poly){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const [x,y] of poly){ if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y; }
  return {minX,minY,maxX,maxY,w:maxX-minX,h:maxY-minY};
}
/**
 * 栅格覆盖率：每个区域自适应步长（目标 ~targetCells 个候选格），
 * 格心在区域内且被任一摄像机覆盖即计入。返回每区域网格，供画布叠加层逐格渲染。
 */
function analyzeCoverage(st,opt){
  opt=opt||{};
  const target=Math.max(400,opt.targetCells||18000);
  const cameras=st.objects.filter(o=>isVisible(o)).map(cameraFootprint).filter(Boolean);
  /* 摄像机参数预计算：半径平方 / 朝向单位向量 / half 角余弦平方；
     包围盒用于廉价预筛，绝大多数格心离所有设备都很远 */
  const cams=cameras.map(c=>{
    const ang=(Number(c.angle)||0)*Math.PI/180, half=(c.fov?c.fov/2:0)*Math.PI/180;
    return {cam:c, r2:c.r*c.r, cosA:Math.cos(ang), sinA:Math.sin(ang),
      cosHalf:Math.cos(half), cosHalf2:Math.cos(half)*Math.cos(half),
      half:c.fov?c.fov/2:180,
      minX:c.x-c.r-EPS, maxX:c.x+c.r+EPS, minY:c.y-c.r-EPS, maxY:c.y+c.r+EPS};
  });
  const ignored=st.objects.filter(o=>o.kind==='point'&&isVisible(o)&&!(Number(o.phys)>0)).length;
  const regions=regionPolygons(st).map(r=>{
    const bb=polygonBBox(r.points), area=polygonArea(r.points);
    /* 步长上限 10m：超大场地不因目标格数被硬钳到 2m 而产生数十万格 */
    const cell=Math.max(.03,Math.min(10,Math.sqrt(bb.w*bb.h/target)));
    const nx=Math.max(1,Math.ceil(bb.w/cell)), ny=Math.max(1,Math.ceil(bb.h/cell));
    const poly=r.points, np=poly.length;
    /* 0=区内盲区 1=已覆盖 2=区外 */
    const grid=new Uint8Array(nx*ny);
    let inside=0, covered=0;
    for(let j=0;j<ny;j++) for(let i=0;i<nx;i++){
      const x=bb.minX+(i+.5)*cell, y=bb.minY+(j+.5)*cell;
      /* 内联射线法（不分配数组），与 pointInPolygon 等价 */
      let inPoly=false;
      for(let m=0,mj=np-1;m<np;mj=m++){
        const xi=poly[m][0], yi=poly[m][1], xj=poly[mj][0], yj=poly[mj][1];
        if(((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi)) inPoly=!inPoly;
      }
      if(!inPoly){ grid[j*nx+i]=2; continue; }
      inside++;
      let hit=false;
      for(let k=0;k<cams.length;k++){
        const c=cams[k];
        if(x<c.minX||x>c.maxX||y<c.minY||y>c.maxY) continue;
        const dx=x-c.cam.x, dy=y-c.cam.y;
        if(c.cam.kind==='square'){
          const lx=dx*c.cosA+dy*c.sinA, ly=-dx*c.sinA+dy*c.cosA;
          if(Math.abs(lx)<=c.cam.r+EPS && Math.abs(ly)<=c.cam.r+EPS){ hit=true; break; }
          continue;
        }
        const d2=dx*dx+dy*dy;
        if(d2>c.r2+EPS) continue;
        if(c.cam.kind==='circle'||d2<=EPS){ hit=true; break; }
        /* 扇形：|与朝向夹角| ≤ fov/2。half≤90° 用平方比较免开方；>90° 用点积与半径比较 */
        const dot=dx*c.cosA+dy*c.sinA;
        if(c.half<=90){
          if(dot>=0 && dot*dot>=d2*c.cosHalf2){ hit=true; break; }
        }else{
          if(dot>=Math.sqrt(d2)*c.cosHalf){ hit=true; break; }
        }
      }
      if(hit){ grid[j*nx+i]=1; covered++; }
    }
    const ratio=inside?covered/inside:0;
    return {id:r.id,name:r.name,area,coveredArea:area*ratio,blindArea:area*(1-ratio),
      ratio,cell,minX:bb.minX,minY:bb.minY,nx,ny,grid};
  });
  const totalArea=regions.reduce((s,r)=>s+r.area,0);
  const totalCovered=regions.reduce((s,r)=>s+r.coveredArea,0);
  return {regions,cameraCount:cameras.length,ignoredPoints:ignored,
    totalArea,totalCovered,totalBlind:totalArea-totalCovered,
    ratio:totalArea?totalCovered/totalArea:0};
}
/**
 * 盲区多边形：逐行合并连续盲格为矩形面（世界坐标，闭合环）。
 * 与栅格统计同源，面积求和严格等于 blindArea（到浮点误差），供 GeoJSON 导出。
 */
function blindSpotRects(res){
  const out=[];
  if(!res||!res.regions) return out;
  for(const r of res.regions){
    for(let j=0;j<r.ny;j++){
      let start=-1;
      for(let i=0;i<=r.nx;i++){
        const blind=i<r.nx&&r.grid[j*r.nx+i]===0;
        if(blind&&start<0) start=i;
        if(!blind&&start>=0){
          const x0=r.minX+start*r.cell, x1=r.minX+i*r.cell;
          const y0=r.minY+j*r.cell, y1=y0+r.cell;
          out.push({regionId:r.id,regionName:r.name,
            points:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]});
          start=-1;
        }
      }
    }
  }
  return out;
}
/** 盲区多边形总面积（矩形并集，与栅格盲区面积一致） */
function blindSpotArea(res){
  return blindSpotRects(res).reduce((s,r)=>{
    const a=r.points;
    return s+Math.abs((a[1][0]-a[0][0])*(a[2][1]-a[1][1]));
  },0);
}
/**
 * 布点优化（贪心覆盖最大化）：在区域外接网格上枚举候选位置与朝向，
 * 每轮选择「新增覆盖面积」最大的点，直到达到目标覆盖率 / 新增台数上限 / 无增益。
 * 纯函数，基于 analyzeCoverage 栅格；返回建议点位与前后覆盖率。
 * opt: {phys=120, fov=90, targetRatio=.9, maxAdd=5, grid=14, angles=12, targetCells=6000}
 */
function optimizeCameraPlacement(st,opt){
  opt=opt||{};
  const phys=Math.max(.1,Number(opt.phys)||120);
  const fov=Math.min(360,Math.max(10,Number(opt.fov)||90));
  const targetRatio=Math.max(0,Math.min(1,opt.targetRatio===undefined ? .9 : Number(opt.targetRatio)));
  const maxAdd=Math.max(0,Math.min(50,Number(opt.maxAdd)||5));
  const gridN=Math.max(4,Math.min(40,Number(opt.grid)||14));
  const angleStep=Math.max(10,Math.min(90,360/Math.max(1,Number(opt.angles)||12)));
  const res=analyzeCoverage(st,{targetCells:Math.max(2000,Number(opt.targetCells)||6000)});
  const regions=res.regions;
  if(!regions.length) return {beforeRatio:0,afterRatio:0,suggestions:[],reached:false,empty:true};

  const insideArea=regions.reduce((s,r)=>s+(r.grid.reduce((n,g)=>n+(g!==2?1:0),0))*r.cell*r.cell,0);
  if(insideArea<=0) return {beforeRatio:0,afterRatio:0,suggestions:[],reached:false,empty:true};
  /* 每区域的「已覆盖」掩码（只区分 1/0）；2=区域外保持 0 且不参与增益 */
  const covered=regions.map(r=>{
    const c=new Uint8Array(r.grid.length);
    for(let i=0;i<r.grid.length;i++) c[i]=r.grid[i]===1?1:0;
    return c;
  });
  let coveredArea=regions.reduce((s,r)=>s+(r.grid.reduce((n,g)=>n+(g===1?1:0),0))*r.cell*r.cell,0);
  const ratioNow=()=>insideArea?coveredArea/insideArea:0;

  /* 候选位置：所有区域并集包围盒上的规则网格（允许略在区域外，符合壁挂/立杆布点） */
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  regions.forEach(r=>{ minX=Math.min(minX,r.minX); minY=Math.min(minY,r.minY);
    maxX=Math.max(maxX,r.minX+r.nx*r.cell); maxY=Math.max(maxY,r.minY+r.ny*r.cell); });
  const positions=[];
  for(let j=0;j<=gridN;j++) for(let i=0;i<=gridN;i++){
    positions.push([minX+(maxX-minX)*i/gridN,minY+(maxY-minY)*j/gridN]);
  }
  const angles=fov>=360?[0]:Array.from({length:Math.round(360/angleStep)},(_,i)=>Math.round(i*angleStep));
  const mkCam=(x,y,angle)=>({kind:fov>=360?'circle':'sector',x,y,r:phys,fov,angle});

  /* 单个候选的新增覆盖面积：只遍历其外接圆覆盖到的格子 */
  const gainOf=(x,y,angle)=>{
    const cam=mkCam(x,y,angle), r=phys;
    let gain=0;
    for(let ri=0;ri<regions.length;ri++){
      const reg=regions[ri];
      if(x+r<reg.minX||x-r>reg.minX+reg.nx*reg.cell||y+r<reg.minY||y-r>reg.minY+reg.ny*reg.cell) continue;
      const i0=Math.max(0,Math.floor((x-r-reg.minX)/reg.cell)), i1=Math.min(reg.nx-1,Math.ceil((x+r-reg.minX)/reg.cell));
      const j0=Math.max(0,Math.floor((y-r-reg.minY)/reg.cell)), j1=Math.min(reg.ny-1,Math.ceil((y+r-reg.minY)/reg.cell));
      for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++){
        const idx=j*reg.nx+i;
        if(reg.grid[idx]!==0||covered[ri][idx]) continue;   /* 只对「区内且未覆盖」格计增益 */
        const px=reg.minX+(i+.5)*reg.cell, py=reg.minY+(j+.5)*reg.cell;
        if(pointInFootprint([px,py],cam)) gain+=reg.cell*reg.cell;
      }
    }
    return gain;
  };
  const markCovered=(x,y,angle)=>{
    const cam=mkCam(x,y,angle), r=phys;
    for(let ri=0;ri<regions.length;ri++){
      const reg=regions[ri];
      if(x+r<reg.minX||x-r>reg.minX+reg.nx*reg.cell||y+r<reg.minY||y-r>reg.minY+reg.ny*reg.cell) continue;
      const i0=Math.max(0,Math.floor((x-r-reg.minX)/reg.cell)), i1=Math.min(reg.nx-1,Math.ceil((x+r-reg.minX)/reg.cell));
      const j0=Math.max(0,Math.floor((y-r-reg.minY)/reg.cell)), j1=Math.min(reg.ny-1,Math.ceil((y+r-reg.minY)/reg.cell));
      for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++){
        const idx=j*reg.nx+i;
        if(reg.grid[idx]!==0||covered[ri][idx]) continue;
        const px=reg.minX+(i+.5)*reg.cell, py=reg.minY+(j+.5)*reg.cell;
        if(pointInFootprint([px,py],cam)) covered[ri][idx]=1;
      }
    }
  };

  const beforeRatio=ratioNow();
  const suggestions=[];
  for(let step=0;step<maxAdd;step++){
    if(ratioNow()>=targetRatio-1e-9) break;
    let best=null;
    for(const [x,y] of positions) for(const angle of angles){
      const g=gainOf(x,y,angle);
      if(!best||g>best.gain) best={x,y,angle,gain:g};
    }
    if(!best||best.gain<=0) break;
    markCovered(best.x,best.y,best.angle);
    coveredArea+=best.gain;
    suggestions.push({x:best.x,y:best.y,angle:best.angle,phys,fov,
      gain:best.gain,gainRatio:best.gain/insideArea,ratioAfter:ratioNow()});
  }
  return {beforeRatio,afterRatio:ratioNow(),suggestions,reached:ratioNow()>=targetRatio-1e-9,
    targetRatio,phys,fov,insideArea};
}

/* ==================== 仿射校准：图像像素(y向下) ↔ 世界坐标(米,y向上) ==================== */
/** 图片底图缺省仿射：px→m，X=a u+b v+c，Y=d u+e v+f（像素 v 向下，故 e 为负） */
function defaultImageTransform(bg){
  const m=Number(bg.metersPerPixel)>0?Number(bg.metersPerPixel):0.05;
  const h=Number(bg.height)||0;
  return {a:m,b:0,c:0,d:0,e:-m,f:h*m};
}
function imageTransformOf(bg){ return bg.transform||defaultImageTransform(bg); }
function bgPixelToWorld(bg,p){
  const t=imageTransformOf(bg);
  return [t.a*p[0]+t.b*p[1]+t.c, t.d*p[0]+t.e*p[1]+t.f];
}
function bgWorldToPixel(bg,p){
  const t=imageTransformOf(bg), det=t.a*t.e-t.b*t.d;
  if(Math.abs(det)<1e-18) return [0,0];
  const dx=p[0]-t.c, dy=p[1]-t.f;
  return [(dx*t.e-dy*t.b)/det, (t.a*dy-t.d*dx)/det];
}
/** 图片四角世界坐标（transform 存在时可为任意旋转平行四边形） */
function imageCornerWorld(bg){
  const w=Number(bg.width)||0, h=Number(bg.height)||0;
  return [[0,0],[w,0],[w,h],[0,h]].map(px=>bgPixelToWorld(bg,px));
}
/* 2x3 仿射 [a,b,c;d,e,f] 行优先拼长度 6 */
function affApply(T,p){ return [T[0]*p[0]+T[1]*p[1]+T[2], T[3]*p[0]+T[4]*p[1]+T[5]]; }
function affMul(A,B){
  return [
    A[0]*B[0]+A[1]*B[3], A[0]*B[1]+A[1]*B[4], A[0]*B[2]+A[1]*B[5]+A[2],
    A[3]*B[0]+A[4]*B[3], A[3]*B[1]+A[4]*B[4], A[3]*B[2]+A[4]*B[5]+A[5]];
}
function affInv(T){
  const det=T[0]*T[4]-T[1]*T[3];
  if(Math.abs(det)<1e-18) return [1,0,0,0,1,0];
  const ia=T[4]/det, ib=-T[1]/det, id=-T[3]/det, ie=T[0]/det;
  return [ia,ib,-(ia*T[2]+ib*T[5]), id,ie,-(id*T[2]+ie*T[5])];
}
/** 最小二乘解 A(3列)·coef=z */
function _ls3(U,z){
  let ATA=[[0,0,0],[0,0,0],[0,0,0]], ATz=[0,0,0];
  U.forEach((u,i)=>{
    const row=[u[0],u[1],1], zi=z[i];
    for(let r=0;r<3;r++){ ATz[r]+=row[r]*zi; for(let c2=0;c2<3;c2++) ATA[r][c2]+=row[r]*row[c2]; }
  });
  /* 高斯消元 3x3 */
  const M=ATA.map((row,r)=>row.concat([ATz[r]]));
  for(let i=0;i<3;i++){
    let p=i; for(let k=i+1;k<3;k++) if(Math.abs(M[k][i])>Math.abs(M[p][i])) p=k;
    const tmp=M[i]; M[i]=M[p]; M[p]=tmp;
    if(Math.abs(M[i][i])<1e-18) return null;
    for(let k=0;k<3;k++){ if(k===i) continue; const f=M[k][i]/M[i][i]; for(let j=i;j<4;j++) M[k][j]-=f*M[i][j]; }
  }
  return [M[0][3]/M[0][0],M[1][3]/M[1][1],M[2][3]/M[2][2]];
}
/**
 * 由像素点(u,v y-down)/世界点(x,y y-up)对应求图片仿射。
 * 2 对点 → 精确相似（旋转+等比缩放+平移，复数解）；≥3 → 六点最小二乘完整仿射。
 * 返回 {T:{a,b,c,d,e,f}, scale, rotationDeg, isSimilarity}
 */
function solveImageAffine(pairs){
  if(pairs.length<2) throw new Error('仿射校准至少需要 2 个对应点');
  if(pairs.length===2){
    const [p0,p1]=pairs;
    const du=p1.u-p0.u, dv=p1.v-p0.v;
    const dx=p1.x-p0.x, dy=p1.y-p0.y;
    /* y 向上像素复数 z=u-i·v；W=α z+β */
    const den=du*du+dv*dv;
    if(den<1e-18) throw new Error('两个校准点重合，无法求解');
    const ar=(dx*du+dy*dv)/den, ai=(-dx*dv+dy*du)/den; /* α=(dx+i dy)/(du-i dv) */
    const c=p0.x-(ar*p0.u+ai*p0.v), f=p0.y-(ai*p0.u-ar*p0.v);
    const T={a:ar,b:ai,c,d:ai,e:-ar,f};
    return {T,scale:Math.hypot(ar,ai),rotationDeg:Math.atan2(ai,ar)*180/Math.PI,isSimilarity:true};
  }
  const cx=_ls3(pairs.map(p=>[p.u,p.v]),pairs.map(p=>p.x));
  const cy=_ls3(pairs.map(p=>[p.u,p.v]),pairs.map(p=>p.y));
  if(!cx||!cy) throw new Error('校准点退化（共线或重合），无法求解仿射');
  const T={a:cx[0],b:cx[1],c:cx[2],d:cy[0],e:cy[1],f:cy[2]};
  const scale=Math.sqrt(Math.abs(T.a*T.e-T.b*T.d));
  /* 相似度判定：y-down 像素下相似形满足 a≈-e 且 b≈d */
  const ref=Math.max(1,Math.hypot(T.a,T.b));
  const isSimilarity=Math.abs(T.a+T.e)<ref*1e-6 && Math.abs(T.b-T.d)<ref*1e-6;
  const rotationDeg=Math.atan2(T.b,T.a)*180/Math.PI;
  return {T,scale,rotationDeg,isSimilarity};
}
/** 校验图片仿射系数：6 个有限数且行列式非退化才采用，否则返回 null */
function validImageTransform(t){
  if(!t||typeof t!=='object') return null;
  const c=['a','b','c','d','e','f'].map(k=>Number(t[k]));
  if(!c.every(Number.isFinite)) return null;
  if(Math.abs(c[0]*c[4]-c[1]*c[3])<1e-18) return null;
  return {a:c[0],b:c[1],c:c[2],d:c[3],e:c[4],f:c[5]};
}
/** 仿射校准后图片四角的世界轴对齐包围框；无有效 transform 时返回 null */
function imageWorldFrame(bg){
  if(!bg||bg.kind!=='image') return null;
  const t=validImageTransform(bg.transform);
  if(!t) return null;
  const w=Number(bg.width)||0, h=Number(bg.height)||0, px=[[0,0],[w,0],[w,h],[0,h]];
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const uv of px){
    const x=t.a*uv[0]+t.b*uv[1]+t.c, y=t.d*uv[0]+t.e*uv[1]+t.f;
    if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y;
  }
  return {minX,minY,maxX,maxY,w:maxX-minX,h:maxY-minY};
}
/**
 * 旧世界坐标→新世界坐标仿射 M（2x3 长度 6 数组）下迁移既有对象。
 * 点位精确映射；相似（旋转+等比缩放+平移）时形状参数精确同步；
 * 一般仿射含非等比/切变时：圆按两轴伸缩升级为椭圆，矩形按变换后的两条主边取旋转外接矩形
 * （切变无法用旋转矩形表示，予以舍弃），扇形角度随基矢旋转。
 */
function migrateObjectsByAffine(objects,M){
  const theta=Math.atan2(M[3],M[0])*180/Math.PI;
  const sx=Math.hypot(M[0],M[3]), sy=Math.hypot(M[1],M[4]);
  const mapP=p=>affApply(M,p);
  const mapVec=v=>[M[0]*v[0]+M[1]*v[1], M[3]*v[0]+M[4]*v[1]];
  objects.forEach(o=>{
    const origAng=Number(o.angle)||0;
    if(Array.isArray(o.points)&&o.points.length) o.points=o.points.map(mapP);
    if(Number.isFinite(Number(o.x))&&Number.isFinite(Number(o.y))){
      const q=mapP([o.x,o.y]); o.x=q[0]; o.y=q[1];
    }
    o.angle=normalizeAngle(origAng+theta);
    if(o.kind==='point'){
      o.phys=Math.max(0,(Number(o.phys)||0)*sx);
    }else if(o.kind==='text'){
      o.height=Math.max(.05,(Number(o.height)||2.2)*sx);
    }else if(o.kind==='rect'){
      if(!o.shape){
        const rad=origAng*Math.PI/180;
        const ex=mapVec([Math.cos(rad),Math.sin(rad)]);
        const ey=mapVec([-Math.sin(rad),Math.cos(rad)]);
        o.width=Math.max(.05,(Number(o.width)||0)*Math.hypot(ex[0],ex[1]));
        o.height=Math.max(.05,(Number(o.height)||0)*Math.hypot(ey[0],ey[1]));
        o.angle=normalizeAngle(Math.atan2(ex[1],ex[0])*180/Math.PI);
      }else if(o.shape.type==='circle'){
        const r=Number(o.shape.r)||0;
        if(Math.abs(sx-sy)>1e-7*Math.max(sx,sy,1e-9)){
          o.shape={type:'ellipse',rx:Math.max(.05,r*sx),ry:Math.max(.05,r*sy)};
          o.angle=normalizeAngle(theta);
        }else o.shape.r=Math.max(.05,r*sx);
      }else if(o.shape.type==='ellipse'){
        const rx=Number(o.shape.rx)||0, ry=Number(o.shape.ry)||0, rad=origAng*Math.PI/180;
        const u=mapVec([Math.cos(rad)*rx,Math.sin(rad)*rx]);
        const v=mapVec([-Math.sin(rad)*ry,Math.cos(rad)*ry]);
        o.shape.rx=Math.max(.05,Math.hypot(u[0],u[1]));
        o.shape.ry=Math.max(.05,Math.hypot(v[0],v[1]));
        o.angle=normalizeAngle(Math.atan2(u[1],u[0])*180/Math.PI);
      }else if(o.shape.type==='sector'){
        o.shape.r=Math.max(.05,(Number(o.shape.r)||0)*sx);
        o.shape.a0=(Number(o.shape.a0)||0)+theta;
        o.shape.a1=(Number(o.shape.a1)||0)+theta;
      }else if(o.shape.type==='parallelogram'){
        /* 平行四边形的底/高按变换后的两条主矢长度缩放；相似变换下倾角不变 */
        const rad=origAng*Math.PI/180;
        const ex=mapVec([Math.cos(rad),Math.sin(rad)]);
        const ey=mapVec([-Math.sin(rad),Math.cos(rad)]);
        o.width=Math.max(.05,(Number(o.width)||0)*Math.hypot(ex[0],ex[1]));
        o.height=Math.max(.05,(Number(o.height)||0)*Math.hypot(ey[0],ey[1]));
        o.angle=normalizeAngle(Math.atan2(ex[1],ex[0])*180/Math.PI);
      }
    }
    if(o.style&&o.style.strokeWidth!==undefined) o.style.strokeWidth=Math.max(.01,Number(o.style.strokeWidth)*sx);
    if(Array.isArray(o.points)&&o.points.length) syncFirstPoint(o);
  });
  return objects;
}

function fmt(n){ const p=state.settings.precision ?? 2; return (Math.round(n*Math.pow(10,p))/Math.pow(10,p)).toFixed(p); }
