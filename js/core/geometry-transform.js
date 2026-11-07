/* geometry-transform.js —— 仿射校准与世界变换（D-12 自 geometry-coverage.js 拆出，全局函数名不变） */

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
function affApply(T,p){ return __geo.affineApply(T,p); }
function affMul(A,B){ return __geo.affineMultiply(A,B); }
function affInv(T){ return __geo.affineInvert(T); }
/**
 * 由像素点(u,v y-down)/世界点(x,y y-up)对应求图片仿射。
 * 2 对点 → 精确相似（旋转+等比缩放+平移，复数解）；≥3 → 六点最小二乘完整仿射。
 * 返回 {T:{a,b,c,d,e,f}, scale, rotationDeg, isSimilarity}
 */
function solveImageAffine(pairs){ return __geo.solveAffine(pairs); }
/** 校验图片仿射系数：6 个有限数且行列式非退化才采用，否则返回 null */
function validImageTransform(t){ return __geo.validAffine(t); }
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
/* ==================== 一般仿射下的形状变换（N-12 公共实现） ====================
 * 圆/椭圆按精确主轴成像（正交共轭直径优先，否则 SVD）；平行四边形按映射后的两条边向量
 * 重算 w/h/skew/angle；扇形仅在正向相似变换下精确，其余情况按面积保真降级并标记。
 * 对象与场地共用本段数学，各自只做「参数结构 ↔ 规范形状」适配。 */
/** 2×2 线性部分摘要：s1≥s2 奇异值、最大奇异方向 axisDeg、极分解旋转角 rotationDeg、是否相似 */
function affineLinearSummary(M){
  const a=M[0],b=M[1],d=M[3],e=M[4];
  const E11=a*a+b*b, E22=d*d+e*e, E12=a*d+b*e;
  const tr=E11+E22, dif=E11-E22, disc=Math.sqrt(Math.max(0,dif*dif+4*E12*E12));
  const l1=(tr+disc)/2, l2=(tr-disc)/2;
  const s1=Math.sqrt(Math.max(0,l1)), s2=Math.sqrt(Math.max(0,l2));
  const axis=Math.abs(E12)>1e-12*Math.max(1,E11,E22)?Math.atan2(l1-E11,E12):(E11>=E22?0:Math.PI/2);
  return {s1,s2,det:a*e-b*d,axisDeg:normalizeAngle(axis*180/Math.PI),
    rotationDeg:Math.atan2(d-b,a+e)*180/Math.PI,
    isSimilarity:Math.abs(s1-s2)<=1e-9*Math.max(s1,s2,1e-9)};
}
/** 圆/椭圆（中心在原点、角度 angleDeg）经线性部分 A 的精确像：返回半轴与朝向 */
function affineEllipseImage(M,angleDeg,rx,ry){
  const r=angleDeg*Math.PI/180, co=Math.cos(r), si=Math.sin(r);
  const ux=Math.max(EPS,rx), uy=Math.max(EPS,ry);
  /* B 的两列 = A·(cos,sin)·rx 与 A·(-sin,cos)·ry */
  const X=[(M[0]*co+M[1]*si)*ux,(M[3]*co+M[4]*si)*ux];
  const Y=[(-M[0]*si+M[1]*co)*uy,(-M[3]*si+M[4]*co)*uy];
  const lx=Math.hypot(X[0],X[1]), ly=Math.hypot(Y[0],Y[1]);
  let ax=lx, ay=ly, ang;
  if(Math.abs(X[0]*Y[0]+X[1]*Y[1])<=1e-9*Math.max(lx*ly,EPS)){
    /* 共轭直径正交时即为椭圆主轴：保持 rx/ry 与旋转轴约定，不做大小排序 */
    ang=Math.atan2(X[1],X[0])*180/Math.PI;
  }else{
    const E11=X[0]*X[0]+Y[0]*Y[0], E22=X[1]*X[1]+Y[1]*Y[1], E12=X[0]*X[1]+Y[0]*Y[1];
    const tr=E11+E22, dif=E11-E22, disc=Math.sqrt(Math.max(0,dif*dif+4*E12*E12));
    const l1=(tr+disc)/2;
    ax=Math.sqrt(Math.max(0,l1)); ay=Math.sqrt(Math.max(0,(tr-disc)/2));
    ang=Math.abs(E12)>1e-12*Math.max(1,E11,E22)?Math.atan2(l1-E11,E12)*180/Math.PI:(E11>=E22?0:90);
  }
  return {rx:Math.max(.05,ax),ry:Math.max(.05,ay),angle:normalizeAngle(ang),
    circle:Math.abs(ax-ay)<=1e-9*Math.max(ax,ay,EPS)};
}
/**
 * 规范形状（世界坐标）经仿射 M 的像。type: circle/ellipse(cx,cy[,angle])、sector(cx,cy,r,a0,a1)、
 * polygon(points)、rect/parallelogram(x,y,w,h,skew[,angle])。返回同构形状 + degraded 标记；
 * opts.allowRotatedBox=false（场地）时旋转/切变的矩形退化为精确多边形。
 */
function affineShapeTransform(M,shape,opts){
  const sh=shape||{}, o=Object.assign({allowRotatedBox:true},opts||{});
  const mapP=p=>affApply(M,p), lin=affineLinearSummary(M), type=sh.type||'rect';
  if(type==='circle'||type==='ellipse'){
    const c=mapP([Number(sh.cx)||0,Number(sh.cy)||0]);
    const rx=positiveNum(type==='circle'?sh.r:sh.rx,50), ry=positiveNum(type==='circle'?sh.r:sh.ry,35);
    const im=affineEllipseImage(M,Number(sh.angle)||0,rx,ry);
    if(type==='circle'&&im.circle) return {type:'circle',cx:c[0],cy:c[1],r:im.rx,degraded:null};
    return {type:'ellipse',cx:c[0],cy:c[1],rx:im.rx,ry:im.ry,angle:im.angle,degraded:null};
  }
  if(type==='sector'){
    const c=mapP([Number(sh.cx)||0,Number(sh.cy)||0]), r0=positiveNum(sh.r,50);
    const exact=lin.isSimilarity&&lin.det>0;
    const rr=exact?r0*lin.s1:r0*Math.sqrt(Math.abs(lin.det));
    return {type:'sector',cx:c[0],cy:c[1],r:Math.max(.05,rr),
      a0:normalizeAngle((Number(sh.a0)||0)+lin.rotationDeg),
      a1:normalizeAngle((Number(sh.a1)||0)+lin.rotationDeg),
      degraded:exact?null:'sector-affine'};
  }
  if(type==='polygon') return {type:'polygon',
    points:(Array.isArray(sh.points)?sh.points:[]).map(p=>mapP([Number(p&&p[0])||0,Number(p&&p[1])||0])),degraded:null};
  /* 矩形/平行四边形：底边 U、侧边 V 一起映射，再以 U 单位向量为基准重算高/倾角/朝向 */
  const w=positiveNum(sh.w,100), hh=positiveNum(sh.h,70);
  const skew=type==='parallelogram'?parallelogramSkew(sh):0;
  const a=(Number(sh.angle)||0)*Math.PI/180, co=Math.cos(a), si=Math.sin(a);
  const off=hh*Math.tan(skew*Math.PI/180);
  const lx=co*w, ly=si*w, mx=co*off-si*hh, my=si*off+co*hh;
  const U=[M[0]*lx+M[1]*ly,M[3]*lx+M[4]*ly];
  const V=[M[0]*mx+M[1]*my,M[3]*mx+M[4]*my];
  const base=mapP([Number(sh.x)||0,Number(sh.y)||0]);
  const lenU=Math.hypot(U[0],U[1]), lenV=Math.hypot(V[0],V[1]);
  const corners=[base,[base[0]+U[0],base[1]+U[1]],[base[0]+U[0]+V[0],base[1]+U[1]+V[1]],[base[0]+V[0],base[1]+V[1]]];
  if(lenU<EPS||lenV<EPS) return {type:'polygon',points:corners,degraded:'degenerate'};
  const e1=[U[0]/lenU,U[1]/lenU], n=[-e1[1],e1[0]];
  let hhOut=V[0]*n[0]+V[1]*n[1], offOut=V[0]*e1[0]+V[1]*e1[1], bp=base;
  if(hhOut<0){ bp=[base[0]+V[0],base[1]+V[1]]; offOut=-offOut; hhOut=-hhOut; }  /* 反射：换基点保持高为正 */
  if(hhOut<EPS) return {type:'polygon',points:corners,degraded:'degenerate'};
  const ang=normalizeAngle(Math.atan2(e1[1],e1[0])*180/Math.PI);
  if(o.allowRotatedBox===false&&Math.abs(Math.sin(ang*Math.PI/180))>1e-9)
    return {type:'polygon',points:corners,degraded:null};
  const skewOut=Math.atan2(offOut,hhOut)*180/Math.PI;
  const clamped=Math.max(-PARALLELOGRAM_MAX_SKEW,Math.min(PARALLELOGRAM_MAX_SKEW,skewOut));
  const isRect=type!=='parallelogram'&&Math.abs(skewOut)<1e-9;
  return {type:isRect?'rect':'parallelogram',x:bp[0],y:bp[1],w:lenU,h:hhOut,skew:clamped,angle:ang,
    degraded:Math.abs(clamped-skewOut)>1e-9?'skew-clamped':null};
}
/**
 * 旧世界坐标→新世界坐标仿射 M（2x3 长度 6 数组）下迁移既有对象。
 * 点位精确映射；圆/椭圆/平行四边形/扇形统一走 affineShapeTransform；
 * 矩形保留旋转外接矩形近似（切变无法用旋转矩形表示）；out.degraded 收集降级项。
 */
function migrateObjectsByAffine(objects,M,out){
  const theta=Math.atan2(M[3],M[0])*180/Math.PI;
  const sx=Math.hypot(M[0],M[3]);
  const mapP=p=>affApply(M,p);
  const mapVec=v=>[M[0]*v[0]+M[1]*v[1], M[3]*v[0]+M[4]*v[1]];
  const note=(o,r)=>{ if(r&&r.degraded&&out) (out.degraded=out.degraded||[]).push({id:o.id,code:r.degraded}); };
  objects.forEach(o=>{
    const origAng=Number(o.angle)||0, ox=Number(o.x)||0, oy=Number(o.y)||0;
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
      }else if(o.shape.type==='circle'||o.shape.type==='ellipse'){
        const r=affineShapeTransform(M,{type:o.shape.type,cx:ox,cy:oy,angle:origAng,
          r:o.shape.r,rx:o.shape.rx,ry:o.shape.ry});
        o.x=r.cx; o.y=r.cy;
        if(r.type==='circle') o.shape={type:'circle',r:r.r};
        else { o.shape={type:'ellipse',rx:r.rx,ry:r.ry}; o.angle=r.angle; }
      }else if(o.shape.type==='sector'){
        const r=affineShapeTransform(M,{type:'sector',cx:ox,cy:oy,r:o.shape.r,a0:o.shape.a0,a1:o.shape.a1});
        o.x=r.cx; o.y=r.cy; o.shape={type:'sector',r:r.r,a0:r.a0,a1:r.a1}; note(o,r);
      }else if(o.shape.type==='parallelogram'){
        const r=affineShapeTransform(M,{type:'parallelogram',x:ox,y:oy,w:o.width,h:o.height,
          skew:o.shape.skew,angle:origAng});
        if(r.type==='parallelogram'){
          o.x=r.x; o.y=r.y; o.width=r.w; o.height=r.h; o.angle=r.angle;
          o.shape={type:'parallelogram',skew:r.skew};
        }
        note(o,r);
      }
    }
    if(o.style&&o.style.strokeWidth!==undefined) o.style.strokeWidth=Math.max(.01,Number(o.style.strokeWidth)*sx);
    if(Array.isArray(o.points)&&o.points.length) syncFirstPoint(o);
  });
  return objects;
}

/**
 * 场地形状随世界仿射 M 迁移（纯函数，返回新 shape，不改入参）。
 * 圆/椭圆/扇形走 affineShapeTransform 的同一数学；轴对齐变换保留矩形/平行四边形参数，
 * 含旋转/切变时矩形/平行四边形转为精确多边形轮廓，确保与对象/底图不错位。out.degraded 收集降级项。
 */
function siteShapeByAffine(shape,M,out){
  const sh=shape||{type:'rect',x:0,y:0,w:100,h:70};
  const type=sh.type||'rect';
  const note=r=>{ if(r&&r.degraded&&out) (out.degraded=out.degraded||[]).push({code:r.degraded}); };
  if(type==='circle'||type==='ellipse'){
    const r=affineShapeTransform(M,{type,cx:sh.cx,cy:sh.cy,angle:sh.angle,r:sh.r,rx:sh.rx,ry:sh.ry});
    return r.type==='circle'?{type:'circle',cx:r.cx,cy:r.cy,r:r.r}
      :{type:'ellipse',cx:r.cx,cy:r.cy,rx:r.rx,ry:r.ry,angle:r.angle};
  }
  if(type==='sector'){
    const r=affineShapeTransform(M,{type:'sector',cx:sh.cx,cy:sh.cy,r:sh.r,a0:sh.a0,a1:sh.a1});
    note(r);
    return {type:'sector',cx:r.cx,cy:r.cy,r:r.r,a0:r.a0,a1:r.a1};
  }
  const r=affineShapeTransform(M,{type,x:Number(sh.x)||0,y:Number(sh.y)||0,w:sh.w,h:sh.h,skew:sh.skew,angle:0},
    {allowRotatedBox:false});
  if(r.type==='polygon') return {type:'polygon',points:r.points};
  return r.type==='parallelogram'
    ?{type:'parallelogram',x:r.x,y:r.y,w:r.w,h:r.h,skew:r.skew}
    :{type:'rect',x:r.x,y:r.y,w:r.w,h:r.h};
}

/**
 * 世界坐标统一变换入口（B-12）：对象与图片底图一次迁移，避免只改其一时错位；
 * 矢量场地默认不动（场地是真值参考，见「场地优先校准」），需要时可显式 opt-in。
 * M：旧世界→新世界的 2x3 仿射（长度 6 数组，或 {a,b,c,d,e,f}）。
 * opts.objects / opts.background：分别控制是否迁移（默认开）；
 * opts.site：是否迁移矢量场地（默认**关**，沿用「场地优先校准」：场地是真值参考，图片校准只改图片与对象）。
 * opts.bgTransform：直接指定新的像素→世界仿射（仿射校准用），未给时把 M 左乘到既有 transform；
 * 没有 transform 的图片底图只更新 metersPerPixel（默认映射随之变化）。
 * 返回摘要；非法/退化变换不改动任何状态。
 */
function applyWorldTransform(M,opts){
  const o=Object.assign({objects:true,site:false,background:true,bgTransform:null},opts||{});
  let arr=null;
  if(Array.isArray(M)&&M.length===6) arr=M.map(Number);
  else if(M&&typeof M==='object'&&['a','b','c','d','e','f'].every(k=>Number.isFinite(Number(M[k])))) arr=[M.a,M.b,M.c,M.d,M.e,M.f].map(Number);
  const det=arr?arr[0]*arr[4]-arr[1]*arr[3]:0;
  if(!arr||!Number.isFinite(det)||Math.abs(det)<1e-18) return {ok:false,objects:0,site:false,background:false,metersPerPixel:null};
  const sx=Math.hypot(arr[0],arr[3]);
  let objects=0, site=false, background=false;
  const out={degraded:[]};
  if(o.objects&&Array.isArray(state.objects)){
    migrateObjectsByAffine(state.objects,arr,out);
    objects=state.objects.length;
  }
  if(o.site&&state.site&&state.site.kind!=='image'){
    const next=siteShapeByAffine(siteShapeOf(state.site),arr,out);
    state.site.shape=next; state.site.kind=next.type;
    site=true;
  }
  const bg=state.background;
  if(o.background&&isImageBackground(bg)){
    if(o.bgTransform&&validImageTransform(o.bgTransform)){
      bg.transform=Object.assign({},o.bgTransform);
    }else if(bg.transform&&validImageTransform(bg.transform)){
      const t=bg.transform;
      const m=affMul(arr,[t.a,t.b,t.c,t.d,t.e,t.f]);
      bg.transform={a:m[0],b:m[1],c:m[2],d:m[3],e:m[4],f:m[5]};
    }
    let mpp=positiveNum(bg.metersPerPixel,0.1);
    if(bg.transform&&validImageTransform(bg.transform)){
      const t=bg.transform, d=Math.sqrt(Math.abs(t.a*t.e-t.b*t.d));
      if(d>0) mpp=d;                          /* 有显式 transform：以其等效比例为准 */
    }else if(sx>0) mpp*=Math.sqrt(Math.abs(det));   /* 默认映射：按面积因子缩放 m/p */
    if(mpp>0) bg.metersPerPixel=mpp;
    background=true;
  }
  return {ok:true,objects,site,background,metersPerPixel:background?bg.metersPerPixel:null,degraded:out.degraded};
}
