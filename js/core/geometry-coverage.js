/* geometry-coverage.js —— 视场覆盖率栅格与仿射/世界变换（D-12 自 geometry.js 拆出，全局函数名不变） */

/* ==================== 视场覆盖率分析（栅格法，零依赖） ==================== */
/** 点设备的有效覆盖 footprint：扇形摄像机/全向圆点；无物理半径或仅图标设备返回 null */
function cameraFootprint(o){
  const r=Number(o.phys);
  if(!(r>0)) return null;
  const type=getType(o.typeId), shape=type.scaleShape;
  if(shape===SEC){
    const fov=Math.min(360,Math.max(10,Number(type.fov)||90));
    return {kind:fov>=360?CIR:SEC,id:o.id,name:o.name||'',x:o.x,y:o.y,r,fov,angle:Number(o.angle)||0};
  }
  if(shape===CIR) return {kind:CIR,id:o.id,name:o.name||'',x:o.x,y:o.y,r:r/2};
  if(shape==='square') return {kind:'square',id:o.id,name:o.name||'',x:o.x,y:o.y,r:r/2,angle:Number(o.angle)||0};
  return null;
}
/** 覆盖率预筛包围盒：方形按旋转后的真实外接范围（半边长 r 的正方形旋转后
 *  半宽 = r·(|cos|+|sin|)），扇形/圆形仍为半径 r。预筛只允许偏大，不允许偏小。 */
function cameraPrefilterBox(c,cosA,sinA){
  const ca=cosA===undefined?Math.cos((Number(c.angle)||0)*Math.PI/180):cosA;
  const sa=sinA===undefined?Math.sin((Number(c.angle)||0)*Math.PI/180):sinA;
  const ext=c.kind==='square'?c.r*(Math.abs(ca)+Math.abs(sa)):c.r;
  return {minX:c.x-ext-EPS, maxX:c.x+ext+EPS, minY:c.y-ext-EPS, maxY:c.y+ext+EPS};
}
/** 世界点是否落在覆盖域内（角度约定与 hitPhysicalPoint 一致：0°=+X，Y 向上） */
function pointInFootprint(p,cam){
  const dx=p[0]-cam.x, dy=p[1]-cam.y, d=Math.hypot(dx,dy);
  if(cam.kind==='square'){
    const q=rotatePoint(p,[cam.x,cam.y],-cam.angle);
    return Math.abs(q[0]-cam.x)<=cam.r+EPS && Math.abs(q[1]-cam.y)<=cam.r+EPS;
  }
  if(d>cam.r+EPS) return false;
  if(cam.kind===CIR||d<EPS) return true;
  let bearing=Math.atan2(dy,dx)*180/Math.PI-cam.angle;
  bearing=((bearing%360)+360)%360;
  const half=cam.fov/2;
  return bearing<=half||bearing>=360-half;
}
/** 参与覆盖率统计的闭合区域：区域对象 + 闭合折线；隐藏对象与隐藏图层不计入分母。
 *  面积一律用解析公式（shapeArea / polygonArea），与统计面板、报告同源；
 *  0 面积退化区域与 shapeArea 的排除口径一致，不进入分母也不生成空网格。 */
function regionPolygons(st){
  const out=[];
  for(const o of st.objects){
    if(!effectiveVisible(o)) continue;
    if(o.kind==='rect'){
      const pts=shapeWorldPoints(o), area=shapeArea(o);
      if(pts.length>=3&&area>0) out.push({id:o.id,name:o.name||'未命名区域',points:pts,area});
    }
    else if(o.kind==='line'&&o.closed&&Array.isArray(o.points)&&o.points.length>=3){
      const pts=o.points.map(p=>p.slice()), area=polygonArea(pts);
      if(area>0) out.push({id:o.id,name:o.name||'未命名闭合折线',points:pts,area});
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
  const cameras=st.objects.filter(o=>effectiveVisible(o)).map(cameraFootprint).filter(Boolean);
  /* 摄像机参数预计算：半径平方 / 朝向单位向量 / half 角余弦平方；
     包围盒用于廉价预筛，绝大多数格心离所有设备都很远 */
  const cams=cameras.map(c=>{
    const ang=(Number(c.angle)||0)*Math.PI/180, half=(c.fov?c.fov/2:0)*Math.PI/180;
    const cosA=Math.cos(ang), sinA=Math.sin(ang);
    return {cam:c, r2:c.r*c.r, cosA, sinA,
      cosHalf:Math.cos(half), cosHalf2:Math.cos(half)*Math.cos(half),
      half:c.fov?c.fov/2:180,
      ...cameraPrefilterBox(c,cosA,sinA)};
  });
  const ignored=st.objects.filter(o=>o.kind==='point'&&effectiveVisible(o)&&!(Number(o.phys)>0)).length;
  const raw=regionPolygons(st).map(r=>{
    const bb=polygonBBox(r.points);
    return {id:r.id,name:r.name,points:r.points,area:r.area,bb};
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
        if(c.cam.kind===CIR||d2<=EPS){ hit=true; break; }
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
    version:3,
    targetCells:layout.targetCells, maxCells:layout.maxCells,
    cellMinM:APP_LIMITS.COVERAGE_CELL_MIN_M, cellMaxM:APP_LIMITS.COVERAGE_CELL_MAX_M,
    fovSource:'point-type.fov', rangeSource:'object.phys',
    sectorRadius:'phys', circleRadius:'phys/2', squareHalfSide:'phys/2',
    areaSource:'shapeArea/polygonArea',
    zoomIndependent:true
  });
  return {regions,cameraCount:cameras.length,ignoredPoints:ignored,
    totalArea,totalCovered,totalBlind:totalArea-totalCovered,
    ratio:totalArea?totalCovered/totalArea:0,
    gridCells:layout.totalCells,targetCells:layout.targetCells,maxCells:layout.maxCells,spec};
}
/**
 * 盲区多边形：逐行合并连续盲格为矩形面（世界坐标，闭合环）。
 * 供 GeoJSON 导出；矩形并集面积是栅格几何近似，用 blindSpotRectArea 汇总。
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
/** 盲格矩形并集面积（栅格几何近似）：盲格数×格面积，用于 GeoJSON 导出面自检 */
function blindSpotRectArea(res){
  return blindSpotRects(res).reduce((s,r)=>{
    const a=r.points;
    return s+Math.abs((a[1][0]-a[0][0])*(a[2][1]-a[1][1]));
  },0);
}
/** 盲区面积（与主覆盖率同口径）：逐区域 area·(1−ratio) 求和，严格等于 totalBlind */
function blindSpotArea(res){
  return res&&res.regions?res.regions.reduce((s,r)=>s+r.blindArea,0):0;
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

  /* 与 analyzeCoverage 同一口径：每格代表的真实面积 = 区域面积 / 区内格数，
     基准覆盖率直接取 res.ratio（面板/统计/报告同源），增益按同一折算累加。 */
  const insideCounts=regions.map(r=>r.grid.reduce((n,g)=>n+(g!==2?1:0),0));
  const cellReal=regions.map((r,i)=>insideCounts[i]>0?r.area/insideCounts[i]:0);
  const insideArea=regions.reduce((s,r,i)=>s+insideCounts[i]*r.cell*r.cell,0);
  if(insideArea<=0||!(res.totalArea>0)) return {beforeRatio:0,afterRatio:0,suggestions:[],reached:false,empty:true};
  /* 每区域的「已覆盖」掩码（只区分 1/0）；2=区域外保持 0 且不参与增益 */
  const covered=regions.map(r=>{
    const c=new Uint8Array(r.grid.length);
    for(let i=0;i<r.grid.length;i++) c[i]=r.grid[i]===1?1:0;
    return c;
  });
  const baseCovered=res.totalCovered;
  let addedArea=0;
  const ratioNow=()=>res.totalArea?(baseCovered+addedArea)/res.totalArea:0;

  /* 候选位置：所有区域并集包围盒上的规则网格（允许略在区域外，符合壁挂/立杆布点） */
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  regions.forEach(r=>{ minX=Math.min(minX,r.minX); minY=Math.min(minY,r.minY);
    maxX=Math.max(maxX,r.minX+r.nx*r.cell); maxY=Math.max(maxY,r.minY+r.ny*r.cell); });
  const positions=[];
  for(let j=0;j<=gridN;j++) for(let i=0;i<=gridN;i++){
    positions.push([minX+(maxX-minX)*i/gridN,minY+(maxY-minY)*j/gridN]);
  }
  const angles=fov>=360?[0]:Array.from({length:Math.round(360/angleStep)},(_,i)=>Math.round(i*angleStep));
  const mkCam=(x,y,angle)=>({kind:fov>=360?CIR:SEC,x,y,r:phys,fov,angle});

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
        if(pointInFootprint([px,py],cam)) gain+=cellReal[ri];
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
    addedArea+=best.gain;
    suggestions.push({x:best.x,y:best.y,angle:best.angle,phys,fov,
      gain:best.gain,gainRatio:best.gain/insideArea,ratioAfter:ratioNow()});
  }
  return {beforeRatio,afterRatio:ratioNow(),suggestions,reached:ratioNow()>=targetRatio-1e-9,
    targetRatio,phys,fov,insideArea};
}
