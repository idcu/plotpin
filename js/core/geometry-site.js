/* geometry-site.js —— 矢量场地几何与图片变换手柄（D-12 自 geometry.js 拆出，全局函数名不变） */

/* -------------------- 矢量场地（矩形/圆形/椭圆/扇形/多边形） -------------------- */
/** 场地世界域（米）：图片=像素×m/px；矢量形状直接以米定义、规整在第一象限。
 *  尺寸唯一取自 siteBounds（A-15），不再按形状各写一套 min/max。 */
function siteDomainOf(bg){
  bg=bg||state.site;
  if(!bg) return {w:100,h:70};
  const b=siteBounds(bg);
  return {w:b.w,h:b.h};
}
function positiveNum(v,fb){ const n=Number(v); return Number.isFinite(n)&&n>0?n:fb; }
/**
 * 矢量场地实际世界包围盒（米，允许负值）：各类形状按真实位置/旋转取轴对齐外接框；
 * 图片底图复用仿射(imageWorldFrame)或像素×m/px。矩形以 shape.x/shape.y 为基点，
 * 圆/椭圆/扇形以 cx/cy 为圆心，多边形取顶点 min/max。
 * 供 worldFrame 取景框使用：节点拖拽到负坐标或超出原范围时取景框随实际形状更新。
 */
function siteBounds(bg){
  bg=bg||state.site;
  if(!bg) return {minX:0,minY:0,maxX:100,maxY:70,w:100,h:70};
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
    const b=pointBounds(pts)||{minX:cx-r,minY:cy-r,maxX:cx+r,maxY:cy+r};
    return mk(b.minX,b.minY,b.maxX,b.maxY);
  }
  if(sh.type==='polygon'&&Array.isArray(sh.points)&&sh.points.length>=3){
    const b=pointBounds(sh.points);
    if(b) return mk(b.minX,b.minY,b.maxX,b.maxY);
  }
  if(sh.type==='parallelogram'){
    const pts=parallelogramPoints(Number(sh.x)||0,Number(sh.y)||0,positiveNum(sh.w,100),positiveNum(sh.h,70),sh.skew);
    const b=pointBounds(pts);
    if(b) return mk(b.minX,b.minY,b.maxX,b.maxY);
  }
  const w=positiveNum(sh.w,100), h=positiveNum(sh.h,70), x=Number(sh.x)||0, y=Number(sh.y)||0;
  return mk(x,y,x+w,y+h);
}
/**
 * 场地统一边界点（世界坐标米，按顺时针/逆时针给出闭合轮廓）：
 * rect/parallelogram 四角、polygon 顶点、circle/ellipse 采样、sector 弧+圆心。
 * 供 SVG/DXF 导出与命中测试复用，避免各导出器各写一套形状分支。
 */
function siteOutlinePoints(site){
  const sh=siteShapeOf(site);
  const pair=p=>[Number(p&&p[0])||0,Number(p&&p[1])||0];
  if(sh.type==='polygon'&&Array.isArray(sh.points)&&sh.points.length>=3) return sh.points.map(pair);
  if(sh.type==='parallelogram'){
    return parallelogramPoints(Number(sh.x)||0,Number(sh.y)||0,positiveNum(sh.w,100),positiveNum(sh.h,70),sh.skew).map(pair);
  }
  if(sh.type==='circle'||sh.type==='ellipse'){
    const cx=Number(sh.cx)||0, cy=Number(sh.cy)||0;
    const rx=sh.type==='circle'?positiveNum(sh.r,50):positiveNum(sh.rx,50);
    const ry=sh.type==='circle'?rx:positiveNum(sh.ry,35);
    const rot=(Number(sh.angle)||0)*Math.PI/180, c=Math.cos(rot), s=Math.sin(rot);
    const n=Math.max(32,Math.ceil(Math.max(rx,ry)*4)), out=[];
    for(let i=0;i<n;i++){
      const a=i/n*Math.PI*2, lx=Math.cos(a)*rx, ly=Math.sin(a)*ry;
      out.push([cx+lx*c-ly*s, cy+lx*s+ly*c]);
    }
    return out;
  }
  if(sh.type==='sector'){
    const cx=Number(sh.cx)||0, cy=Number(sh.cy)||0, r=positiveNum(sh.r,50);
    return sectorArcPoints(cx,cy,r,Number(sh.a0)||0,sectorSweep(sh)).concat([[cx,cy]]).map(pair);
  }
  const x=Number(sh.x)||0, y=Number(sh.y)||0, w=positiveNum(sh.w,100), h=positiveNum(sh.h,70);
  return [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
}
/* -------------------- 矢量场地几何统一（渲染 / 交互 / 导出共用） --------------------
 * 以下函数是场地几何的唯一实现：render.js 只负责画，interaction.js 只负责事件分发，
 * io-export.js 只负责拼装产物。参数既接受 state.site，也接受旧版矢量 background
 * （{kind:'rect',shape:{...}}），旧签名调用保持不变。 */
/** 场地边界折点（世界坐标，Y 向上）：矩形/平行四边形→四角；多边形→顶点；圆/椭圆/扇形无折点返回 null */
function siteBoundaryPoints(site){
  const sh=(site&&site.shape)||{};
  if(sh.type==='polygon') return (sh.points||[]).map(p=>[Number(p&&p[0])||0,Number(p&&p[1])||0]);
  if(sh.type==='parallelogram'){
    return parallelogramPoints(Number(sh.x)||0,Number(sh.y)||0,positiveNum(sh.w,100),positiveNum(sh.h,70),sh.skew);
  }
  if(!sh.type||sh.type==='rect'){
    const b=siteBounds(site);
    return [[b.minX,b.minY],[b.maxX,b.minY],[b.maxX,b.maxY],[b.minX,b.maxY]];
  }
  return null;
}
/** 场地几何中心：圆/椭圆/扇形取圆心，其余取边界折点均值（与区域面积标签同口径） */
function siteShapeCenter(site){
  const sh=(site&&site.shape)||{};
  if(['circle','ellipse','sector'].includes(sh.type)) return [Number(sh.cx)||0,Number(sh.cy)||0];
  const pts=siteBoundaryPoints(site);
  if(pts&&pts.length) return [pts.reduce((s,p)=>s+p[0],0)/pts.length, pts.reduce((s,p)=>s+p[1],0)/pts.length];
  const d=siteDomainOf(site); return [d.w/2,d.h/2];
}
/** 场地基点坐标：圆/椭圆/扇形取圆心；矩形/平行四边形取基点；多边形无基点（返回 null） */
function siteBasePoint(site){
  const sh=(site&&site.shape)||{};
  if(['circle','ellipse','sector'].includes(sh.type)) return [Number(sh.cx)||0,Number(sh.cy)||0];
  if(!sh.type||sh.type==='rect'||sh.type==='parallelogram') return [Number(sh.x)||0,Number(sh.y)||0];
  return null;
}
/** 场地半径文案：圆/扇形→R；椭圆→Rx/Ry；矩形/多边形无半径（返回空串） */
function siteRadiusText(site){
  const sh=(site&&site.shape)||{};
  if(sh.type==='circle'||sh.type==='sector') return fmt(sh.r)+' m';
  if(sh.type==='ellipse') return 'Rx '+fmt(sh.rx)+'  Ry '+fmt(sh.ry);
  return '';
}
/** 场地面积/周长：多边形按顶点精确计算，其余形状复用区域公式（矩形/平行四边形/圆/椭圆/扇形） */
function siteAreaPerimeter(site){
  if(!site) return {area:0,perimeter:0};
  const sh=site.shape||{};
  if(sh.type==='polygon'){
    const ps=(sh.points||[]).map(p=>[Number(p[0])||0,Number(p[1])||0]);
    if(ps.length<3) return {area:0,perimeter:ps.length===2?polylineLength(ps):0};
    return {area:polygonArea(ps), perimeter:polylineLength(ps.concat([ps[0]]))};
  }
  if(sh.type==='parallelogram'){
    const o={shape:{type:'parallelogram',skew:sh.skew},x:Number(sh.x)||0,y:Number(sh.y)||0,
      width:positiveNum(sh.w,100),height:positiveNum(sh.h,70),angle:0};
    return {area:shapeArea(o), perimeter:shapePerimeter(o)};
  }
  const d=siteDomainOf(site);
  const o={shape:Object.assign({type:'rect'},sh), x:Number(sh.cx)||0, y:Number(sh.cy)||0, angle:Number(sh.angle)||0, width:d.w, height:d.h};
  return {area:shapeArea(o), perimeter:shapePerimeter(o)};
}
/** 场地控制点清单（世界坐标，Y 向上）：与渲染手柄、命中、拖拽共用同一基准 */
function siteHandlesOf(site){
  if(!site||site.kind==='image'||site.kind==='empty') return [];
  const sh=site.shape||{}, out=[];
  if(sh.type==='polygon'){
    (sh.points||[]).forEach((p,i)=>out.push({type:'siteNode',mode:'vertex',index:i,x:Number(p[0])||0,y:Number(p[1])||0}));
    return out;
  }
  const cx=Number(sh.cx)||0, cy=Number(sh.cy)||0;
  if(sh.type==='circle'){
    const r=Number(sh.r)||0;
    out.push({type:'siteNode',mode:'center',x:cx,y:cy});
    out.push({type:'siteNode',mode:'radius',x:cx+r,y:cy});
    return out;
  }
  if(sh.type==='ellipse'){
    const rx=Number(sh.rx)||0, ry=Number(sh.ry)||0, a=(Number(sh.angle)||0)*Math.PI/180, b=a+Math.PI/2;
    out.push({type:'siteNode',mode:'center',x:cx,y:cy});
    out.push({type:'siteNode',mode:'rx',x:cx+Math.cos(a)*rx,y:cy+Math.sin(a)*rx});
    out.push({type:'siteNode',mode:'ry',x:cx+Math.cos(b)*ry,y:cy+Math.sin(b)*ry});
    const off=Math.max(.55,30/state.viewport.zoom);
    out.push({type:'siteNode',mode:'rotate',x:cx+Math.cos(b)*off,y:cy+Math.sin(b)*off});
    return out;
  }
  if(sh.type==='sector'){
    const r=Number(sh.r)||0, rg=sectorArcRange(sh), a0=rg.a0, sw=rg.sweep, a1=rg.a1;
    const p=deg=>[cx+r*Math.cos(deg*Math.PI/180),cy+r*Math.sin(deg*Math.PI/180)];
    out.push({type:'siteNode',mode:'center',x:cx,y:cy});
    out.push({type:'siteNode',mode:'edge0',x:p(a0)[0],y:p(a0)[1]});
    out.push({type:'siteNode',mode:'edge1',x:p(a1)[0],y:p(a1)[1]});
    out.push({type:'siteNode',mode:'radius',x:p(a0+sw/2)[0],y:p(a0+sw/2)[1]});
    return out;
  }
  if(sh.type==='parallelogram'){
    const x=Number(sh.x)||0, y=Number(sh.y)||0, w=positiveNum(sh.w,100), hh=positiveNum(sh.h,70);
    const pts=parallelogramPoints(x,y,w,hh,sh.skew);
    pts.forEach((p,i)=>out.push({type:'siteNode',mode:'corner',index:i,x:p[0],y:p[1]}));
    out.push({type:'siteNode',mode:'skew',x:(pts[2][0]+pts[3][0])/2,y:(pts[2][1]+pts[3][1])/2});
    return out;
  }
  const x=Number(sh.x)||0, y=Number(sh.y)||0, w=positiveNum(sh.w,100), hh=positiveNum(sh.h,70);
  [[x,y],[x+w,y],[x+w,y+hh],[x,y+hh]].forEach((p,i)=>out.push({type:'siteNode',mode:'corner',index:i,x:p[0],y:p[1]}));
  return out;
}
/** 场地控制点清单（默认 state.site；显式传旧 background 仍可用） */
function siteHandleList(bg){
  bg=bg===undefined?state.site:bg;
  return siteHandlesOf(bg);
}
/** 拖拽场地控制点：按模式改写给定 site 的 shape 参数（世界坐标米）。不落历史，由调用方负责 */
function siteHandleDragTo(site,h,p){
  if(!site||!h) return;
  const sh=siteShapeOf(site);
  if(h.mode==='vertex'){ sh.points[h.index]=[p[0],p[1]]; return; }
  if(h.mode==='corner'){
    const x=Number(sh.x)||0, y=Number(sh.y)||0, w=positiveNum(sh.w,100), hh=positiveNum(sh.h,70);
    /* 平行四边形：顶边两角含错切位移，先扣回未错切坐标再按对角固定规则反解 */
    const isPara=sh.type==='parallelogram';
    const skew=isPara?parallelogramSkew(sh)*Math.PI/180:0;
    const pull=(v,i)=> i>=2 && isPara ? v-Math.tan(skew)*(p[1]-y) : v;
    const fixed=[[x,y],[x+w,y],[x+w,y+hh],[x,y+hh]][(h.index+2)%4];
    const lx=pull(p[0],h.index);
    sh.x=Math.min(fixed[0],lx); sh.y=Math.min(fixed[1],p[1]);
    sh.w=Math.max(.05,Math.abs(lx-fixed[0])); sh.h=Math.max(.05,Math.abs(p[1]-fixed[1]));
    return;
  }
  if(h.mode==='skew'){
    /* 场地平行四边形顶边中点横向拖拽：只改倾角，底×高不变 */
    const x=Number(sh.x)||0, w=positiveNum(sh.w,100), hh=positiveNum(sh.h,70);
    const off=p[0]-x-w/2;
    sh.skew=Math.max(-PARALLELOGRAM_MAX_SKEW,Math.min(PARALLELOGRAM_MAX_SKEW,Math.atan2(off,hh)*180/Math.PI));
    return;
  }
  if(h.mode==='center'){ sh.cx=p[0]; sh.cy=p[1]; return; }
  if(h.mode==='radius'){ sh.r=Math.max(.05,dist([Number(sh.cx)||0,Number(sh.cy)||0],p)); return; }
  if(h.mode==='rx'||h.mode==='ry'){
    const cx=Number(sh.cx)||0, cy=Number(sh.cy)||0, q=rotatePoint(p,[cx,cy],-(Number(sh.angle)||0));
    if(h.mode==='rx') sh.rx=Math.max(.05,Math.abs(q[0]-cx));
    else sh.ry=Math.max(.05,Math.abs(q[1]-cy));
    return;
  }
  if(h.mode==='rotate'){
    const cx=Number(sh.cx)||0, cy=Number(sh.cy)||0;
    sh.angle=normalizeAngle(Math.round(Math.atan2(p[1]-cy,p[0]-cx)*180/Math.PI-90));
    return;
  }
  if(h.mode==='edge0'||h.mode==='edge1'){
    const cx=Number(sh.cx)||0, cy=Number(sh.cy)||0;
    sh.r=Math.max(.05,dist([cx,cy],p));
    const deg=normalizeAngle(Math.round(Math.atan2(p[1]-cy,p[0]-cx)*180/Math.PI));
    if(h.mode==='edge0') sh.a0=deg; else sh.a1=deg;
    return;
  }
}
/** 屏幕空间控制点命中（对象手柄与场地手柄共用同一阈值/循环；返回命中的手柄或 null） */
function pickScreenHandle(list,screenP,radius){
  const r=Number.isFinite(radius)?radius:9;
  for(const h of list||[]){
    const s=w2s([h.x,h.y]);
    if(Math.hypot(s[0]-screenP[0],s[1]-screenP[1])<=r) return h;
  }
  return null;
}
/** 拖拽当前场地控制点（旧签名薄包装：写 state.site，尊重可见/锁定） */
function resizeSiteByHandle(h,p){
  const site=state.site;
  if(!site||!siteIsVisible(site)||siteIsLocked(site)) return;
  siteHandleDragTo(site,h,p);
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
  bg=bg===undefined?state.site:bg;
  if(!bg) return L('矢量场地：未设置');
  const d=siteDomainOf(bg);
  if(bg.kind==='image') return `${L('图片底图：')}${bg.fileName||L('未命名')} ${bg.width}×${bg.height}px ｜ ${fmt(bg.metersPerPixel)} m/px${bg.calibrated?L('（已校准）'):L('（未校准）')} ｜ ${L('实地')} ${fmt(d.w)}×${fmt(d.h)} m`;
  if(bg.kind==='circle') return `${L('圆形场地：')}${L('半径')} ${fmt(bg.shape.r)} m ｜ ${L('占地')} ${fmt(d.w)}×${fmt(d.h)} m`;
  if(bg.kind==='ellipse'){
    const sh=bg.shape, rot=Number(sh.angle)||0;
    return `${L('椭圆场地：')}${L('半径')} ${fmt(sh.rx)}×${fmt(sh.ry)} m${rot?` ｜ ${L('旋转')} ${Math.round(rot)}°`:''} ｜ ${L('外接')} ${fmt(d.w)}×${fmt(d.h)} m`;
  }
  if(bg.kind==='sector') return `${L('扇形场地：')}${L('半径')} ${fmt(bg.shape.r)} m ｜ ${Math.round(sectorSweep(bg.shape))}° ${L('扇区')} ｜ ${L('外接')} ${fmt(d.w)}×${fmt(d.h)} m`;
  if(bg.kind==='polygon') return `${L('多边形场地：')}${bg.shape.points.length} ${L('条边')} ｜ ${L('外接')} ${fmt(d.w)}×${fmt(d.h)} m`;
  return `${L('矩形场地：')}${fmt(d.w)}×${fmt(d.h)} m${L('（世界坐标，无需比例尺校准）')}`;
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
function normalizeAngle(a){ return __geo.normalizeAngle(a); }

/* -------------------- 图片变换手柄（「图片变换」工具） --------------------
 * 只做平移 / 旋转 / 等比缩放 / 切变四类整体变换，不提供四角自由拖拽（避免图片被拉成任意四边形）。
 * 手柄与几何在同一处定义，渲染、命中、拖拽共用；变换不改动任何业务对象（与场地优先校准一致）。 */
function imageHandleList(bg){
  if(!isImageBackground(bg)) return [];
  const cs=imageCornerWorld(bg);
  const top=[(cs[0][0]+cs[1][0])/2,(cs[0][1]+cs[1][1])/2];
  const bot=[(cs[3][0]+cs[2][0])/2,(cs[3][1]+cs[2][1])/2];
  const ctr=[(cs[0][0]+cs[2][0])/2,(cs[0][1]+cs[2][1])/2];
  let dir=[top[0]-ctr[0],top[1]-ctr[1]], len=Math.hypot(dir[0],dir[1]);
  if(len<1e-9){ dir=[0,1]; len=1; }
  const off=30/state.viewport.zoom, ux=dir[0]/len, uy=dir[1]/len;
  return [
    {mode:'move',x:ctr[0],y:ctr[1]},
    {mode:'rotate',x:top[0]+ux*off,y:top[1]+uy*off},
    {mode:'scale',x:cs[2][0],y:cs[2][1]},
    {mode:'skew',x:top[0],y:top[1]}
  ];
}
/** 世界空间仿射构造：平移 / 绕点旋转 / 绕点等比缩放 / 以水平线为基准的切变 */
function affTranslate(dx,dy){ return [1,0,dx,0,1,dy]; }
function affRotateAbout(deg,cx,cy){
  const r=deg*Math.PI/180, co=Math.cos(r), si=Math.sin(r);
  return [co,-si,cx-co*cx+si*cy,si,co,cy-si*cx-co*cy];
}
function affScaleAbout(k,cx,cy){ return [k,0,cx*(1-k),0,k,cy*(1-k)]; }
function affShearX(k,baseY){ return [1,k,-k*baseY,0,1,0]; }
/** 站点（场地）边角世界坐标：平移/缩放吸附用 */
function siteCornerPoints(site){
  if(!site) return [];
  const bp=siteBoundaryPoints(site);
  if(bp&&bp.length>=3) return bp;
  const sh=siteShapeOf(site);
  if(sh.type==='circle'||sh.type==='ellipse'){
    const rx=sh.type==='circle'?(Number(sh.r)||0):(Number(sh.rx)||0);
    const ry=sh.type==='circle'?(Number(sh.r)||0):(Number(sh.ry)||0);
    return [[sh.cx-rx,sh.cy],[sh.cx+rx,sh.cy],[sh.cx,sh.cy-ry],[sh.cx,sh.cy+ry]];
  }
  return [];
}
/**
 * 拖拽图片手柄：返回新 transform（不写 bg，便于撤销/单测）。
 * drag: {mode,start,origin,originCorners}；wp=当前世界坐标。
 * 平移时若图片角点与场地边角屏幕距离 ≤12px，则吸附加固；返回 {T, snap}。
 */
function imageHandleDragTo(bg,drag,wp){
  const o=drag.origin;
  const T=Array.isArray(o)?o.slice():[o.a,o.b,o.c,o.d,o.e,o.f];
  const cs=drag.originCorners;
  const ctr=[(cs[0][0]+cs[2][0])/2,(cs[0][1]+cs[2][1])/2];
  const top=[(cs[0][0]+cs[1][0])/2,(cs[0][1]+cs[1][1])/2];
  const bot=[(cs[3][0]+cs[2][0])/2,(cs[3][1]+cs[2][1])/2];
  let out=T.slice(), snap=null;
  if(drag.mode==='move'){
    let dx=wp[0]-drag.start[0], dy=wp[1]-drag.start[1];
    const site=state.site, corners=siteCornerPoints(site);
    if(corners.length){
      let best=null;
      cs.forEach(c=>{
        corners.forEach(v=>{
          const sx=w2s([c[0]+dx,c[1]+dy]), sv=w2s(v), dd=Math.hypot(sx[0]-sv[0],sx[1]-sv[1]);
          if(dd<=12 && (!best||dd<best.d)) best={d:dd,dx:v[0]-c[0],dy:v[1]-c[1],v};
        });
      });
      if(best){ dx=best.dx; dy=best.dy; snap=best.v; }
    }
    out=affMul(affTranslate(dx,dy),T);
  }else if(drag.mode==='rotate'){
    const a0=Math.atan2(drag.start[1]-ctr[1],drag.start[0]-ctr[0]);
    const a1=Math.atan2(wp[1]-ctr[1],wp[0]-ctr[0]);
    out=affMul(affRotateAbout((a1-a0)*180/Math.PI,ctr[0],ctr[1]),T);
  }else if(drag.mode==='scale'){
    const anchor=cs[0], base=Math.hypot(cs[2][0]-anchor[0],cs[2][1]-anchor[1])||1;
    let k=Math.max(.05,Math.hypot(wp[0]-anchor[0],wp[1]-anchor[1])/base);
    const site=state.site, corners=siteCornerPoints(site);
    if(corners.length){
      let best=null;
      corners.forEach(v=>{ const sx=w2s(wp), sv=w2s(v), dd=Math.hypot(sx[0]-sv[0],sx[1]-sv[1]);
        if(dd<=12&&(!best||dd<best.d)) best={d:dd,k:Math.max(.05,Math.hypot(v[0]-anchor[0],v[1]-anchor[1])/base),v}; });
      if(best){ k=best.k; snap=best.v; }
    }
    out=affMul(affScaleAbout(k,anchor[0],anchor[1]),T);
  }else if(drag.mode==='skew'){
    const hgt=(top[1]-bot[1])||1;
    const raw=(wp[0]-drag.start[0])/hgt;
    /* 近 90° 时投影高度趋 0，斜率会发散为非有限值：夹取到 SHEAR_MAX，非有限直接归零 */
    const k=Number.isFinite(raw)?Math.max(-APP_LIMITS.SHEAR_MAX,Math.min(APP_LIMITS.SHEAR_MAX,raw)):0;
    out=affMul(affShearX(k,bot[1]),T);
  }
  if(!out.every(Number.isFinite)) out=T.slice();  /* 任何非有限结果都拒绝应用，保持原变换 */
  return {T:{a:out[0],b:out[1],c:out[2],d:out[3],e:out[4],f:out[5]}, snap};
}
