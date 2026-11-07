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

/**
 * 场地形状随世界仿射 M 迁移（纯函数，返回新 shape，不改入参）。
 * 轴对齐变换（b=d=0）保留原类型并精确缩放参数；含旋转/切变时：
 * 圆按两轴伸缩升级为椭圆，矩形/平行四边形按真实外轮廓转为多边形，确保与对象/底图不错位。
 */
function siteShapeByAffine(shape,M){
  const sh=shape||{type:'rect',x:0,y:0,w:100,h:70};
  const theta=Math.atan2(M[3],M[0])*180/Math.PI;
  const sx=Math.hypot(M[0],M[3]), sy=Math.hypot(M[1],M[4]);
  const mapP=p=>affApply(M,p);
  const mapVec=v=>[M[0]*v[0]+M[1]*v[1], M[3]*v[0]+M[4]*v[1]];
  const type=sh.type||'rect';
  if(type==='polygon'){
    return {type:'polygon',points:(Array.isArray(sh.points)?sh.points:[]).map(p=>mapP([Number(p&&p[0])||0,Number(p&&p[1])||0]))};
  }
  if(type==='circle'){
    const c=mapP([Number(sh.cx)||0,Number(sh.cy)||0]), r=positiveNum(sh.r,50);
    if(Math.abs(sx-sy)>1e-7*Math.max(sx,sy,1e-9)){
      return {type:'ellipse',cx:c[0],cy:c[1],rx:Math.max(.05,r*sx),ry:Math.max(.05,r*sy),angle:theta};
    }
    return {type:'circle',cx:c[0],cy:c[1],r:Math.max(.05,r*sx)};
  }
  if(type==='ellipse'){
    const c=mapP([Number(sh.cx)||0,Number(sh.cy)||0]);
    const rx=positiveNum(sh.rx,50), ry=positiveNum(sh.ry,35), rad=(Number(sh.angle)||0)*Math.PI/180;
    const u=mapVec([Math.cos(rad)*rx,Math.sin(rad)*rx]);
    const v=mapVec([-Math.sin(rad)*ry,Math.cos(rad)*ry]);
    return {type:'ellipse',cx:c[0],cy:c[1],
      rx:Math.max(.05,Math.hypot(u[0],u[1])),ry:Math.max(.05,Math.hypot(v[0],v[1])),
      angle:Math.atan2(u[1],u[0])*180/Math.PI};
  }
  if(type==='sector'){
    const c=mapP([Number(sh.cx)||0,Number(sh.cy)||0]);
    return {type:'sector',cx:c[0],cy:c[1],r:Math.max(.05,positiveNum(sh.r,50)*sx),
      a0:(Number(sh.a0)||0)+theta,a1:(Number(sh.a1)||0)+theta};
  }
  if(Math.abs(M[1])<1e-12&&Math.abs(M[3])<1e-12){
    const base=mapP([Number(sh.x)||0,Number(sh.y)||0]);
    const out={type,x:base[0],y:base[1],
      w:Math.max(.05,positiveNum(sh.w,100)*sx),h:Math.max(.05,positiveNum(sh.h,70)*sy)};
    if(type==='parallelogram'){
      /* 错切位移 = 高×tan(倾角)；非等比缩放后重算倾角，保持角点位置一致 */
      out.skew=Math.atan(Math.tan((Number(sh.skew)||0)*Math.PI/180)*sx/sy)*180/Math.PI;
    }
    return out;
  }
  return {type:'polygon',points:siteOutlinePoints({shape:sh}).map(p=>mapP([Number(p&&p[0])||0,Number(p&&p[1])||0]))};
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
  if(o.objects&&Array.isArray(state.objects)){
    migrateObjectsByAffine(state.objects,arr);
    objects=state.objects.length;
  }
  if(o.site&&state.site&&state.site.kind!=='image'){
    const next=siteShapeByAffine(siteShapeOf(state.site),arr);
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
  return {ok:true,objects,site,background,metersPerPixel:background?bg.metersPerPixel:null};
}
