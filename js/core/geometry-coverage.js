/* geometry-coverage.js —— 视场覆盖率栅格与仿射/世界变换（D-12 自 geometry.js 拆出，全局函数名不变） */

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
/** 参与覆盖率统计的闭合区域：区域对象 + 闭合折线；隐藏对象与隐藏图层不计入分母 */
function regionPolygons(st){
  const out=[];
  for(const o of st.objects){
    if(!isVisible(o)) continue;
    if(o.kind==='rect'){ const pts=shapeWorldPoints(o); if(pts.length>=3) out.push({id:o.id,name:o.name||'未命名区域',points:pts}); }
    else if(o.kind==='line'&&o.closed&&Array.isArray(o.points)&&o.points.length>=3){
      out.push({id:o.id,name:o.name||'未命名闭合折线',points:o.points.map(p=>p.slice())});
    }
  }
  return out;
}
function polygonBBox(poly){ return __geo.polygonBBox(poly); }
/**
 * 覆盖率栅格规划（口径 v2）：固定目标格数，与视口缩放、画布像素和 DPR 无关。
 * 按可见区域面积分配目标格数 → 格边 = sqrt(面积/分得格数)，夹在 [CELL_MIN_M, CELL_MAX_M]；
 * 总格数超过 MAX_CELLS 时统一放大格边（结果仍确定，保证大场地单次分析耗时可控）。
 * 修改此口径等同于改变历史报告数值，必须在文档中标注版本变化。
 */
function coverageGridPlan(items,opt){
  opt=opt||{};
  const targetCells=Math.max(400,Number(opt.targetCells)||APP_LIMITS.COVERAGE_TARGET_CELLS);
  const maxCells=Math.max(targetCells,Number(opt.maxCells)||APP_LIMITS.COVERAGE_MAX_CELLS);
  const totalArea=items.reduce((s,r)=>s+(r.area>0?r.area:0),0);
  const plan=items.map(r=>{
    const share=totalArea>0?targetCells*(r.area>0?r.area:0)/totalArea:0;
    const cell=Math.max(APP_LIMITS.COVERAGE_CELL_MIN_M,
      Math.min(APP_LIMITS.COVERAGE_CELL_MAX_M,
        Math.sqrt(Math.max(r.area,1e-6)/Math.max(1,share))));
    return {bb:r.bb,cell,nx:Math.max(1,Math.ceil(r.bb.w/cell)),ny:Math.max(1,Math.ceil(r.bb.h/cell))};
  });
  const totalCells=()=>plan.reduce((s,p)=>s+p.nx*p.ny,0);
  let guard=0;
  while(totalCells()>maxCells&&guard++<40){
    for(const p of plan){
      p.cell*=1.2;
      p.nx=Math.max(1,Math.ceil(p.bb.w/p.cell));
      p.ny=Math.max(1,Math.ceil(p.bb.h/p.cell));
    }
  }
  return {targetCells,maxCells,plan,totalCells:totalCells()};
}
/**
 * 栅格覆盖率：固定格数按区域面积分配（v2，与缩放无关），
 * 格心在区域内且被任一摄像机覆盖即计入。返回每区域网格，供画布叠加层逐格渲染。
 * 口径元数据随结果返回（spec），报告必须显式标注，避免把新旧数值混为一谈。
 */
function analyzeCoverage(st,opt){
  opt=opt||{};
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
  const raw=regionPolygons(st).map(r=>{
    const bb=polygonBBox(r.points);
    return {id:r.id,name:r.name,points:r.points,area:polygonArea(r.points),bb};
  });
  const layout=coverageGridPlan(raw,opt);
  const regions=raw.map((r,idx)=>{
    const cell=layout.plan[idx].cell, nx=layout.plan[idx].nx, ny=layout.plan[idx].ny;
    const bb=r.bb, area=r.area;
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
  /* 口径元数据：报告与文档必须引用同一份，避免“同一图纸换缩放得到不同结果”再次发生 */
  const spec=Object.freeze({
    version:2,
    targetCells:layout.targetCells, maxCells:layout.maxCells,
    cellMinM:APP_LIMITS.COVERAGE_CELL_MIN_M, cellMaxM:APP_LIMITS.COVERAGE_CELL_MAX_M,
    fovSource:'point-type.fov', rangeSource:'object.phys',
    sectorRadius:'phys', circleRadius:'phys/2', squareHalfSide:'phys/2',
    zoomIndependent:true
  });
  return {regions,cameraCount:cameras.length,ignoredPoints:ignored,
    totalArea,totalCovered,totalBlind:totalArea-totalCovered,
    ratio:totalArea?totalCovered/totalArea:0,
    gridCells:layout.totalCells,targetCells:layout.targetCells,maxCells:layout.maxCells,spec};
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

function fmt(n){ const p=state.settings.precision ?? 2; return (Math.round(n*Math.pow(10,p))/Math.pow(10,p)).toFixed(p); }
