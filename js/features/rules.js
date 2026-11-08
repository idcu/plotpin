/* rules.js —— C-05 几何规则检查：可注册规则、重叠/最小间距/越界、定位与 CSV 导出
 *
 * 口径：只做几何关系检查，不是消防/规范审图；不内置任何规范数值。
 * 配置存于 state.rules（随工程保存）；重叠/间距只比较同楼层可见对象，越界逐层检查。
 */
/* -------------------- 规则框架 -------------------- */
const RULE_MAX_VIOLATIONS=5000;
const RULE_EPS=1e-9;
const RULE_REGISTRY=new Map();
let ruleLastResult=null;

function ruleNow(){ return (typeof performance!=='undefined'&&performance.now)?performance.now():Date.now(); }
function ruleRound(v,d=1){ const n=Number(v); if(!Number.isFinite(n)) return 0; const p=Math.pow(10,d); return Math.round(n*p)/p; }

/** 注册规则：返回 {ok,id} 或 {ok:false,reason}，不抛异常；owner 为插件 id（受信任同源路径） */
function registerRule(def,owner){
  const id=String(def&&def.id||'').trim();
  if(!/^[A-Za-z][A-Za-z0-9_.-]{1,39}$/.test(id)) return {ok:false,reason:'规则 id 非法（2–40 位，首字母开头）'};
  if(!def||typeof def.check!=='function') return {ok:false,reason:'规则缺少 check(ctx) 函数'};
  if(RULE_REGISTRY.has(id)) return {ok:false,reason:'规则已存在：'+id};
  RULE_REGISTRY.set(id,{
    id,
    name:String(def.name||id).slice(0,60),
    description:String(def.description||'').slice(0,200),
    builtin:false,
    owner:String(owner||'').slice(0,64),
    check:def.check
  });
  return {ok:true,id};
}
/** 注销自定义规则；内建规则受保护 */
function unregisterRule(id){
  const key=String(id||'');
  const rec=RULE_REGISTRY.get(key);
  if(!rec) return {ok:false,reason:'规则不存在：'+key};
  if(rec.builtin) return {ok:false,reason:'内建规则不可注销'};
  RULE_REGISTRY.delete(key);
  return {ok:true,id:key};
}
function listRules(){
  return Array.from(RULE_REGISTRY.values()).map(r=>({id:r.id,name:r.name,description:r.description,builtin:r.builtin,owner:r.owner||''}));
}

/* -------------------- 基础几何（纯函数，便于自测） -------------------- */
function ruleCross(ax,ay,bx,by){ return ax*by-ay*bx; }
function ruleCleanPolygon(points){
  const out=[];
  (Array.isArray(points)?points:[]).forEach(p=>{
    if(!Array.isArray(p)||!Number.isFinite(Number(p[0]))||!Number.isFinite(Number(p[1]))) return;
    const q=[Number(p[0]),Number(p[1])];
    const last=out[out.length-1];
    if(last&&Math.hypot(q[0]-last[0],q[1]-last[1])<1e-8) return;
    out.push(q);
  });
  if(out.length>1){
    const first=out[0], last=out[out.length-1];
    if(Math.hypot(first[0]-last[0],first[1]-last[1])<1e-8) out.pop();
  }
  let changed=true;
  while(changed&&out.length>=3){
    changed=false;
    for(let i=0;i<out.length;i++){
      const a=out[(i-1+out.length)%out.length], b=out[i], c=out[(i+1)%out.length];
      const cross=ruleCross(b[0]-a[0],b[1]-a[1],c[0]-b[0],c[1]-b[1]);
      if(Math.abs(cross)<1e-8&&Math.hypot(c[0]-a[0],c[1]-a[1])>1e-8){
        out.splice(i,1); changed=true; break;
      }
    }
  }
  return out;
}
function rulePolygonArea(points){ return Math.abs(polygonArea(ruleCleanPolygon(points))); }
function rulePolygonSelfIntersects(points){
  if(typeof __geo!=='undefined'&&typeof __geo.polygonSelfIntersects==='function') return !!__geo.polygonSelfIntersects(points);
  return false;
}
function ruleEnsureCCW(points){
  const poly=ruleCleanPolygon(points);
  if(polygonArea(poly)<0) poly.reverse();
  return poly;
}
function ruleIsConvex(points){
  const poly=ruleEnsureCCW(points);
  if(poly.length<3) return false;
  for(let i=0;i<poly.length;i++){
    const a=poly[(i-1+poly.length)%poly.length], b=poly[i], c=poly[(i+1)%poly.length];
    if(ruleCross(b[0]-a[0],b[1]-a[1],c[0]-b[0],c[1]-b[1])<=RULE_EPS) return false;
  }
  return true;
}
function rulePointInTriangle(p,a,b,c){
  const d1=ruleCross(b[0]-a[0],b[1]-a[1],p[0]-a[0],p[1]-a[1]);
  const d2=ruleCross(c[0]-b[0],c[1]-b[1],p[0]-b[0],p[1]-b[1]);
  const d3=ruleCross(a[0]-c[0],a[1]-c[1],p[0]-c[0],p[1]-c[1]);
  return d1>=-RULE_EPS&&d2>=-RULE_EPS&&d3>=-RULE_EPS;
}
/** 耳切三角化（凹多边形）；失败返回 null，由调用方回退包围盒 */
function ruleTriangulate(points){
  const poly=ruleEnsureCCW(points);
  if(poly.length<3) return null;
  const idx=poly.map((_,i)=>i);
  const tris=[];
  let guard=poly.length*poly.length*2+8;
  while(idx.length>3&&guard-->0){
    let ear=false;
    for(let i=0;i<idx.length;i++){
      const i0=idx[(i-1+idx.length)%idx.length], i1=idx[i], i2=idx[(i+1)%idx.length];
      const a=poly[i0], b=poly[i1], c=poly[i2];
      if(ruleCross(b[0]-a[0],b[1]-a[1],c[0]-b[0],c[1]-b[1])<=RULE_EPS) continue;
      let blocked=false;
      for(const k of idx){
        if(k===i0||k===i1||k===i2) continue;
        if(rulePointInTriangle(poly[k],a,b,c)){ blocked=true; break; }
      }
      if(blocked) continue;
      tris.push([a,b,c]); idx.splice(i,1); ear=true; break;
    }
    if(!ear) return null;
  }
  if(idx.length!==3) return null;
  tris.push([poly[idx[0]],poly[idx[1]],poly[idx[2]]]);
  return tris;
}
function ruleLineIntersect(p1,p2,p3,p4){
  const rx=p2[0]-p1[0], ry=p2[1]-p1[1], sx=p4[0]-p3[0], sy=p4[1]-p3[1];
  const den=ruleCross(rx,ry,sx,sy);
  if(Math.abs(den)<1e-12) return null;
  const qx=p3[0]-p1[0], qy=p3[1]-p1[1];
  const t=ruleCross(qx,qy,sx,sy)/den;
  return [p1[0]+t*rx,p1[1]+t*ry];
}
/** 凸多边形裁剪（clip 必须为凸且逆时针） */
function ruleClipConvex(subject,clip){
  let out=ruleCleanPolygon(subject);
  const cp=ruleEnsureCCW(clip);
  if(out.length<3||cp.length<3) return [];
  for(let i=0;i<cp.length;i++){
    const a=cp[i], b=cp[(i+1)%cp.length];
    const input=out; out=[];
    for(let j=0;j<input.length;j++){
      const cur=input[j], prev=input[(j-1+input.length)%input.length];
      const curIn=ruleCross(b[0]-a[0],b[1]-a[1],cur[0]-a[0],cur[1]-a[1])>=-RULE_EPS;
      const prevIn=ruleCross(b[0]-a[0],b[1]-a[1],prev[0]-a[0],prev[1]-a[1])>=-RULE_EPS;
      if(curIn){
        if(!prevIn){ const p=ruleLineIntersect(prev,cur,a,b); if(p) out.push(p); }
        out.push(cur);
      }else if(prevIn){
        const p=ruleLineIntersect(prev,cur,a,b); if(p) out.push(p);
      }
    }
    if(out.length<3) return [];
  }
  return out;
}
function ruleBBoxOfPoints(points){
  const ps=(points||[]).filter(p=>Array.isArray(p)&&Number.isFinite(Number(p[0]))&&Number.isFinite(Number(p[1])));
  if(!ps.length) return null;
  const xs=ps.map(p=>Number(p[0])), ys=ps.map(p=>Number(p[1]));
  return {minX:Math.min(...xs),minY:Math.min(...ys),maxX:Math.max(...xs),maxY:Math.max(...ys)};
}
function ruleBBoxAreaOverlap(a,b){
  const ox=Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX);
  const oy=Math.min(a.maxY,b.maxY)-Math.max(a.minY,b.minY);
  return ox>0&&oy>0?ox*oy:0;
}
/** 多边形交面积：{area,degenerate}；凹多边形先三角化，自交/失败回退包围盒 */
function rulePolygonIntersection(a,b){
  const ca=ruleCleanPolygon(a), cb=ruleCleanPolygon(b);
  if(ca.length<3||cb.length<3) return {area:0,degenerate:false};
  const ba=ruleBBoxOfPoints(ca), bb=ruleBBoxOfPoints(cb);
  const bboxArea=ba&&bb?ruleBBoxAreaOverlap(ba,bb):0;
  if(rulePolygonSelfIntersects(ca)||rulePolygonSelfIntersects(cb)) return {area:bboxArea,degenerate:true};
  const pa=ruleIsConvex(ca)?[ca]:ruleTriangulate(ca);
  const pb=ruleIsConvex(cb)?[cb]:ruleTriangulate(cb);
  if(!pa||!pb) return {area:bboxArea,degenerate:true};
  let area=0;
  for(const ta of pa){
    for(const tb of pb){
      const hit=ruleClipConvex(ta,tb);
      if(hit.length>=3) area+=Math.abs(polygonArea(hit));
    }
  }
  return {area,degenerate:false};
}
function rulePolygonIntersectionArea(a,b){ return rulePolygonIntersection(a,b).area; }

/** 严格内点相交（忽略端点/共线贴合），用于区分“贴边”与“真正穿过” */
function ruleProperCross(a,b,c,d){
  const rx=b[0]-a[0], ry=b[1]-a[1], sx=d[0]-c[0], sy=d[1]-c[1];
  const den=ruleCross(rx,ry,sx,sy);
  if(Math.abs(den)<1e-12) return null;
  const qx=c[0]-a[0], qy=c[1]-a[1];
  const t=ruleCross(qx,qy,sx,sy)/den, u=ruleCross(qx,qy,rx,ry)/den;
  if(t>RULE_EPS&&t<1-RULE_EPS&&u>RULE_EPS&&u<1-RULE_EPS) return [a[0]+t*rx,a[1]+t*ry];
  return null;
}
function rulePointToSegments(p,segments){
  let min=Infinity;
  for(const s of segments){
    const d=distanceToSegment(p,s[0],s[1]);
    if(d<min) min=d;
  }
  return min;
}
function rulePointToPolygon(p,poly){
  if(!poly||poly.length<3) return Infinity;
  return rulePointToSegments(p,rulePolygonSegments(poly));
}
function rulePolygonSegments(poly){
  const out=[], n=poly.length;
  for(let i=0;i<n;i++) out.push([poly[i],poly[(i+1)%n]]);
  return out;
}
function ruleGeomSegments(g){
  const out=[];
  (g.polygons||[]).forEach(p=>rulePolygonSegments(p).forEach(s=>out.push(s)));
  (g.segments||[]).forEach(s=>out.push(s));
  return out;
}
function ruleGeomPoints(g){
  const out=[];
  (g.polygons||[]).forEach(p=>p.forEach(q=>out.push(q)));
  (g.segments||[]).forEach(s=>{ out.push(s[0],s[1]); });
  if(g.point) out.push(g.point);
  return out;
}
/** 几何最近净距（边界距离；覆盖/包含/相交为 0） */
function ruleGapGeometry(g1,g2){
  const polys1=g1.polygons||[], polys2=g2.polygons||[];
  if(polys1.length&&polys2.length){
    for(const a of polys1){
      for(const b of polys2){
        if(rulePolygonsOverlap(a,b)) return 0;
      }
    }
    let min=Infinity;
    for(const a of polys1) for(const b of polys2){
      for(const s of rulePolygonSegments(a)) for(const t of rulePolygonSegments(b)){
        const d=ruleSegSegDistance(s,t);
        if(d<min) min=d;
      }
    }
    return min;
  }
  if(polys1.length) return ruleGapPolygonOther(polys1,g2);
  if(polys2.length) return ruleGapPolygonOther(polys2,g1);
  const s1=g1.segments||[], s2=g2.segments||[];
  if(s1.length&&s2.length){
    let min=Infinity;
    for(const a of s1) for(const b of s2){ const d=ruleSegSegDistance(a,b); if(d<min) min=d; }
    return min;
  }
  if(s1.length&&g2.point) return rulePointToSegments(g2.point,s1);
  if(s2.length&&g1.point) return rulePointToSegments(g1.point,s2);
  if(g1.point&&g2.point) return Math.hypot(g1.point[0]-g2.point[0],g1.point[1]-g2.point[1]);
  return Infinity;
}
function rulePolygonsOverlap(a,b){
  if(ruleCleanPolygon(a).length<3||ruleCleanPolygon(b).length<3) return false;
  const ca=ruleCleanPolygon(a), cb=ruleCleanPolygon(b);
  if(ca.some(p=>pointInPolygon(p,cb))||cb.some(p=>pointInPolygon(p,ca))) return true;
  for(const s of rulePolygonSegments(ca)) for(const t of rulePolygonSegments(cb)){
    if(__geo.segmentsIntersect(s[0],s[1],t[0],t[1])) return true;
  }
  return false;
}
function ruleGapPolygonOther(polys,other){
  let min=Infinity;
  for(const poly of polys){
    const edges=rulePolygonSegments(poly);
    for(const seg of (other.segments||[])){
      if(pointInPolygon(seg[0],poly)||pointInPolygon(seg[1],poly)) return 0;
      for(const e of edges){
        const d=ruleSegSegDistance(seg,e);
        if(d===0) return 0;
        if(d<min) min=d;
      }
    }
    if(other.point){
      if(pointInPolygon(other.point,poly)) return 0;
      const d=rulePointToPolygon(other.point,poly);
      if(d<min) min=d;
    }
  }
  return min;
}
function ruleSegSegDistance(a,b){
  if(__geo.segmentsIntersect(a[0],a[1],b[0],b[1])) return 0;
  return Math.min(
    distanceToSegment(a[0],b[0],b[1]), distanceToSegment(a[1],b[0],b[1]),
    distanceToSegment(b[0],a[0],a[1]), distanceToSegment(b[1],a[0],a[1])
  );
}

/* -------------------- 对象 footprint -------------------- */
function ruleCirclePoints(cx,cy,r,seg=32){
  const out=[];
  for(let i=0;i<seg;i++){ const a=Math.PI*2*i/seg; out.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]); }
  return out;
}
function ruleRotatedRectPoints(cx,cy,w,h,angleDeg){
  const a=(Number(angleDeg)||0)*Math.PI/180, c=Math.cos(a), s=Math.sin(a);
  const hw=w/2, hh=h/2;
  return [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(p=>[cx+p[0]*c-p[1]*s,cy+p[0]*s+p[1]*c]);
}
/** 统一 footprint：{point, polygons, segments, area, bbox}；无面积对象 polygons 为空 */
function ruleObjectFootprint(o){
  const out={point:null,polygons:[],segments:[],area:0,bbox:null};
  if(!o||typeof o!=='object') return out;
  const pushPoly=p=>{
    const poly=ruleCleanPolygon(p);
    if(poly.length>=3){
      out.polygons.push(poly);
      out.area+=Math.abs(polygonArea(poly));
    }
  };
  if(o.kind==='rect'){
    pushPoly(shapeWorldPoints(o));
  }else if(o.kind==='text'){
    pushPoly(textCorners(o));
  }else if(o.kind==='line'||o.kind==='dimension'){
    const pts=outlineOf(o);
    const closed=o.kind==='line'?!!o.closed:(o.subtype==='area');
    if(closed&&pts.length>=3) pushPoly(pts);
    else for(let i=0;i+1<pts.length;i++) out.segments.push([pts[i],pts[i+1]]);
  }else if(o.kind==='point'){
    const phys=Number(o.phys)||0;
    const type=getType(o.typeId)||{};
    const shape=type.scaleShape;
    const ang=Number(o.angle)||0;
    if(phys>0&&shape==='circle'){
      const r=phys/2, seg=Math.max(16,Math.min(48,Math.ceil(r*8)));
      pushPoly(ruleCirclePoints(Number(o.x)||0,Number(o.y)||0,r,seg));
    }else if(phys>0&&shape==='square'){
      pushPoly(ruleRotatedRectPoints(Number(o.x)||0,Number(o.y)||0,phys,phys,ang));
    }else if(phys>0&&shape==='sector'){
      const fov=Math.min(360,Math.max(10,Number(type.fov)||90));
      const pts=[[Number(o.x)||0,Number(o.y)||0]].concat(sectorArcPoints(Number(o.x)||0,Number(o.y)||0,phys,ang-fov/2,fov));
      pushPoly(pts);
    }else if(phys>0&&shape==='bar'){
      const half=phys/2, a=ang*Math.PI/180;
      const c=Math.cos(a)*half, s=Math.sin(a)*half;
      out.segments.push([[o.x-c,o.y-s],[o.x+c,o.y+s]]);
    }else{
      out.point=[Number(o.x)||0,Number(o.y)||0];
    }
  }
  out.bbox=ruleBBoxOfPoints(ruleGeomPoints(out));
  return out;
}

/* -------------------- 候选对：minX 扫描线 -------------------- */
function ruleCandidatePairs(items,windowLimit,mode){
  const out=[];
  const theoretical=items.length*(items.length-1)/2;
  if(mode==='brute'){
    for(let i=0;i<items.length;i++) for(let j=i+1;j<items.length;j++) out.push([items[i],items[j]]);
    return {pairs:out,theoretical};
  }
  const sorted=items.slice().sort((a,b)=>a.bbox.minX-b.bbox.minX);
  for(let i=0;i<sorted.length;i++){
    const a=sorted[i];
    for(let j=i+1;j<sorted.length;j++){
      const b=sorted[j];
      if(b.bbox.minX>a.bbox.maxX+windowLimit) break;
      if(b.bbox.maxX<a.bbox.minX-windowLimit) continue;
      if(b.bbox.minY>a.bbox.maxY+windowLimit||b.bbox.maxY<a.bbox.minY-windowLimit) continue;
      out.push([a,b]);
    }
  }
  return {pairs:out,theoretical};
}
/* -------------------- 三条内建规则 -------------------- */
/** RT-P2-13：重叠取全部轮廓对的最大交面积，避免只看 polygons[0] 漏掉多轮廓对象 */
function ruleMaxPolygonIntersection(polyA,polyB){
  let best={area:0,degenerate:false};
  for(const a of polyA||[]) for(const b of polyB||[]){
    const hit=rulePolygonIntersection(a,b);
    if(hit.area>best.area) best=hit;
  }
  return best;
}
function ruleOverlapCheck(ctx){
  const tol=ctx.config.tolerance;
  const items=[];
  for(const o of ctx.objects){
    const g=ctx.footprint(o);
    if(!g.bbox||!g.polygons.length||g.area<=RULE_EPS) continue;
    items.push({o,g,bbox:g.bbox});
  }
  const pairRes=ruleCandidatePairs(items,tol,ctx.mode);
  const minArea=tol*tol;
  const violations=[];
  for(const [a,b] of pairRes.pairs){
    const ox=Math.min(a.bbox.maxX,b.bbox.maxX)-Math.max(a.bbox.minX,b.bbox.minX);
    const oy=Math.min(a.bbox.maxY,b.bbox.maxY)-Math.max(a.bbox.minY,b.bbox.minY);
    if(ox<=tol||oy<=tol) continue;
    const hit=ruleMaxPolygonIntersection(a.g.polygons,b.g.polygons);
    if(!(hit.area>minArea)) continue;
    const c=objectCenter(a.o);
    violations.push({
      ruleId:'overlap', ruleName:'对象重叠', objectId:a.o.id, objectName:a.o.name||'', peerId:b.o.id, peerName:b.o.name||'',
      floorId:ctx.floor.id, floorName:ctx.floor.name, x:c[0], y:c[1], kind:'overlap',
      value:ruleRound(hit.area,3),
      message:'与 '+b.o.name+' 实质重叠 '+fmt(hit.area)+' m²'+(hit.degenerate?'（轮廓自相交，按包围盒估算）':'')
    });
  }
  return {violations,pairs:pairRes.pairs.length,theoretical:pairRes.theoretical,objects:items.length};
}
function ruleSpacingCheck(ctx){
  const thresholds=ctx.config.types||{};
  const ids=Object.keys(thresholds);
  if(!ids.length) return {violations:[],pairs:0,theoretical:0,objects:0};
  const maxT=Math.max(...ids.map(k=>Number(thresholds[k])||0));
  const items=[];
  for(const o of ctx.objects){
    if(!Object.prototype.hasOwnProperty.call(thresholds,o.typeId)) continue;
    const g=ctx.footprint(o);
    if(!g.bbox) continue;
    items.push({o,g,bbox:g.bbox});
  }
  const pairRes=ruleCandidatePairs(items,Math.max(0,maxT),ctx.mode);
  const violations=[];
  for(const [a,b] of pairRes.pairs){
    const t=Math.max(Number(thresholds[a.o.typeId])||0,Number(thresholds[b.o.typeId])||0);
    const gap=ruleGapGeometry(a.g,b.g);
    if(!Number.isFinite(gap)||gap+1e-9>=t) continue;
    const c=objectCenter(a.o);
    violations.push({
      ruleId:'spacing', ruleName:'最小间距', objectId:a.o.id, objectName:a.o.name||'', peerId:b.o.id, peerName:b.o.name||'',
      floorId:ctx.floor.id, floorName:ctx.floor.name, x:c[0], y:c[1], kind:'spacing',
      value:ruleRound(gap,3), threshold:t,
      message:'与 '+b.o.name+' 净距 '+fmt(gap)+' m，低于阈值 '+fmt(t)+' m'
    });
  }
  return {violations,pairs:pairRes.pairs.length,theoretical:pairRes.theoretical,objects:items.length};
}
function rulePointOutsideSite(p,poly,tol){
  if(pointInPolygon(p,poly)) return false;
  return rulePointToPolygon(p,poly)>tol;
}
function ruleBoundsCheck(ctx){
  const site=ctx.site;
  if(!site||site.kind==='empty'||!site.shape) return {violations:[],skipped:'未设置矢量场地'};
  const sitePoly=ruleCleanPolygon(siteOutlinePoints(site));
  if(sitePoly.length<3) return {violations:[],skipped:'场地边界无效'};
  const siteSegs=rulePolygonSegments(sitePoly);
  const tol=ctx.config.tolerance;
  const violations=[];
  for(const o of ctx.objects){
    const g=ctx.footprint(o);
    const pts=ruleGeomPoints(g);
    if(!pts.length) continue;
    let outside=0, inside=0;
    pts.forEach(p=>{ if(rulePointOutsideSite(p,sitePoly,tol)) outside++; else inside++; });
    if(!outside) continue;
    let partial=inside>0;
    if(!partial){
      if(ruleGeomSegments(g).some(s=>siteSegs.some(t=>ruleProperCross(s[0],s[1],t[0],t[1]))) ) partial=true;
      if(!partial&&g.polygons.length&&sitePoly.some(p=>pointInPolygon(p,g.polygons[0]))) partial=true;
    }
    const c=objectCenter(o);
    violations.push({
      ruleId:'bounds', ruleName:'越界', objectId:o.id, objectName:o.name||'', peerId:'', peerName:'',
      floorId:ctx.floor.id, floorName:ctx.floor.name, x:c[0], y:c[1], kind:partial?'partial':'full',
      value:outside,
      message:partial?'部分越出场地边界':'完全越出场地边界'
    });
  }
  return {violations,pairs:0,theoretical:0,objects:ctx.objects.length};
}

registerRule({id:'overlap',name:'对象重叠',description:'同楼层对象 footprint 实质重叠；容差内贴合不报',builtin:true,check:ruleOverlapCheck});
registerRule({id:'spacing',name:'最小间距',description:'按类型配置阈值，两对象净距小于阈值时报告',builtin:true,check:ruleSpacingCheck});
registerRule({id:'bounds',name:'越界',description:'对象完全或部分越出矢量场地边界',builtin:true,check:ruleBoundsCheck});
/* 内建标记后置：registerRule 默认 builtin=false，这里补标记，保持注册入口可复用 */
['overlap','spacing','bounds'].forEach(id=>{ const r=RULE_REGISTRY.get(id); if(r) r.builtin=true; });

/* -------------------- 运行检查 -------------------- */
function ruleFloorContexts(scope){
  const activeId=state.activeFloorId;
  const active=Array.isArray(state.floors)?state.floors.find(f=>f.id===activeId):null;
  const out=[{id:activeId, name:(active&&active.name)||'1F', objects:state.objects||[], site:state.site}];
  if(scope!=='current'&&Array.isArray(state.floors)){
    state.floors.forEach(f=>{
      if(!f||f.id===activeId) return;
      out.push({id:f.id, name:f.name||f.id, objects:Array.isArray(f.objects)?f.objects:[], site:f.site||null});
    });
  }
  return out;
}
function runRuleCheck(opts={}){
  const cfg=normalizeRuleConfig(state.rules);
  const scope=opts.scope==='current'||opts.scope==='all'?opts.scope:(cfg.scope||'all');
  const mode=opts.mode==='brute'?'brute':'sweep';
  const rules=Array.from(RULE_REGISTRY.values());
  const t0=ruleNow();
  const result={ranAt:new Date().toISOString(),ms:0,scope,ruleOrder:rules.map(r=>r.id),violations:[],perRule:{},skipped:[],stats:{objects:0,floors:0,pairs:0,theoretical:0,truncated:0,brute:mode==='brute'}};
  const floors=ruleFloorContexts(scope);
  result.stats.floors=floors.length;
  const geomCache=new Map();
  const footprint=o=>{ if(!geomCache.has(o)) geomCache.set(o,ruleObjectFootprint(o)); return geomCache.get(o); };
  for(const floor of floors){
    const objects=(floor.objects||[]).filter(o=>o&&typeof o==='object'&&isVisible(o));
    result.stats.objects+=objects.length;
    for(const rule of rules){
      const rc=cfg[rule.id]||{};
      if(rc.enabled===false) continue;
      const per=result.perRule[rule.id]||(result.perRule[rule.id]={name:rule.name,count:0,pairs:0,theoretical:0,ms:0});
      const t=ruleNow();
      try{
        const ctx={objects,site:floor.site,floor,state,config:rc,mode,footprint,helpers:{objectCenter,objectBounds,pointInPolygon,segmentsIntersect,distanceToSegment}};
        const res=rule.check(ctx);
        const arr=Array.isArray(res)?res:(res&&Array.isArray(res.violations)?res.violations:[]);
        arr.forEach(v=>{
          if(!v||typeof v!=='object') return;
          result.violations.push(Object.assign({
            ruleId:rule.id, ruleName:rule.name, objectId:'', objectName:'', peerId:'', peerName:'',
            floorId:floor.id, floorName:floor.name, x:0, y:0, kind:'', value:0, message:''
          },v,{ruleId:rule.id,ruleName:rule.name,floorId:floor.id,floorName:floor.name}));
        });
        if(res&&!Array.isArray(res)){
          const pairs=Number(res.pairs)||0, theoretical=Number(res.theoretical)||0;
          per.pairs+=pairs; per.theoretical+=theoretical;
          result.stats.pairs+=pairs; result.stats.theoretical+=theoretical;
          if(res.skipped) result.skipped.push({ruleId:rule.id,ruleName:rule.name,floorId:floor.id,floorName:floor.name,reason:res.skipped});
        }
      }catch(err){
        result.skipped.push({ruleId:rule.id,ruleName:rule.name,floorId:floor.id,floorName:floor.name,reason:'规则异常：'+(err&&err.message||err)});
      }
      per.ms+=ruleNow()-t;
    }
  }
  const order=new Map(result.ruleOrder.map((id,i)=>[id,i]));
  result.violations.sort((a,b)=>
    (order.get(a.ruleId)??99)-(order.get(b.ruleId)??99) ||
    String(a.floorId).localeCompare(String(b.floorId)) ||
    String(a.objectId).localeCompare(String(b.objectId)) ||
    String(a.peerId).localeCompare(String(b.peerId))
  );
  const total=result.violations.length;
  if(total>RULE_MAX_VIOLATIONS){
    result.violations.length=RULE_MAX_VIOLATIONS;
    result.stats.truncated=total-RULE_MAX_VIOLATIONS;
  }
  for(const id of Object.keys(result.perRule)){
    result.perRule[id].count=result.violations.filter(v=>v.ruleId===id).length;
    result.perRule[id].ms=ruleRound(result.perRule[id].ms,1);
  }
  result.ms=ruleRound(ruleNow()-t0,1);
  return result;
}
/** 便于 UI 与测试复用：只返回违规数组 */
function ruleViolations(opts){ return runRuleCheck(opts).violations; }

/* -------------------- CSV 导出 -------------------- */
function ruleViolationsCsv(result){
  const rows=[['规则','对象编号','对象名称','关联对象','楼层','X','Y','说明','值']];
  const list=(result&&Array.isArray(result.violations)?result.violations:[]);
  list.forEach(v=>{
    rows.push([
      v.ruleName||v.ruleId||'', v.objectId||'', v.objectName||'',
      v.peerId?(v.peerName||v.peerId):'', v.floorName||'', Number(v.x)||0, Number(v.y)||0,
      v.message||'', Number.isFinite(Number(v.value))?Number(v.value):''
    ]);
  });
  return '\uFEFF'+rows.map(r=>r.map(c=>csvCell(c,',')).join(',')).join('\r\n')+'\r\n';
}
function ruleExportName(){
  const d=new Date(), p=n=>String(n).padStart(2,'0');
  return 'rule-violations-'+d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes())+'.csv';
}

/* -------------------- 定位 -------------------- */
async function locateRuleViolation(v){
  if(!v) return false;
  if(v.floorId&&v.floorId!==state.activeFloorId){
    const ok=await switchFloor(v.floorId);
    if(!ok){ toast(L('定位失败：无法切换到目标楼层'),'error'); return false; }
  }
  const obj=state.objects.find(o=>o.id===v.objectId);
  if(!obj){ toast(L('定位失败：对象已不存在'),'error'); return false; }
  selectedIds.clear();
  selectedIds.add(obj.id);
  if(v.peerId&&state.objects.some(o=>o.id===v.peerId)) selectedIds.add(v.peerId);
  switchTab('props');
  const c=objectCenter(obj);
  const r=wrap.getBoundingClientRect();
  const f=worldFrame(), z=state.viewport.zoom||1;
  state.viewport.panX=r.width/2-(c[0]-f.minX)*z;
  state.viewport.panY=r.height/2-(f.maxY-c[1])*z;
  renderProps(); requestRender();
  return true;
}

/* -------------------- UI -------------------- */
function ruleTypes(){
  return (Array.isArray(state.objectTypes)?state.objectTypes:[]).filter(t=>t&&t.id);
}
function ruleConfigFromState(){
  state.rules=normalizeRuleConfig(state.rules);
  return state.rules;
}
function renderRuleConfig(){
  const box=$('ruleConfig'); if(!box) return;
  const cfg=ruleConfigFromState();
  const types=ruleTypes();
  const rows=types.map(t=>{
    const on=Object.prototype.hasOwnProperty.call(cfg.spacing.types,t.id);
    return '<div style="display:flex;gap:6px;align-items:center;margin:3px 0">'+
      '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(t.id)+'">'+esc(typeDisplayName(t))+'</span>'+
      '<input type="number" min="0" max="1000" step="0.1" data-rule-type-min="'+esc(t.id)+'" value="'+(on?esc(cfg.spacing.types[t.id]):'')+'" placeholder="'+esc(L('未配置'))+'" style="width:86px">'+
      '<span class="hint-text">m</span></div>';
  }).join('');
  const custom=listRules().filter(r=>!r.builtin);
  const customRows=custom.length?'<div class="hint-text" style="margin:8px 0 2px">'+esc(L('已注册规则（{n}）',{n:custom.length}))+'</div>'+
    custom.map(r=>'<div class="hint-text" style="margin:2px 0">'+esc(r.name)+' · '+esc(L('来源'))+' '+esc(r.owner?L('插件')+': '+r.owner:L('页面脚本'))+'</div>').join(''):'';
  box.innerHTML=
    '<p class="hint-text" style="margin:0 0 8px">'+esc(L('这是几何检查，不是消防/规范审图；不内置任何规范数值。'))+'</p>'+customRows+
    '<label style="display:block;margin:6px 0"><input type="checkbox" id="ruleOverlapOn"'+(cfg.overlap.enabled?' checked':'')+'> '+esc(L('对象重叠，贴合容差'))+' '+
      '<input type="number" min="0" max="1000" step="0.01" id="ruleOverlapTol" value="'+esc(cfg.overlap.tolerance)+'" style="width:74px"> m</label>'+
    '<label style="display:block;margin:6px 0"><input type="checkbox" id="ruleSpacingOn"'+(cfg.spacing.enabled?' checked':'')+'> '+esc(L('最小间距（按类型填写阈值；留空=不检查该类型）'))+'</label>'+
    '<div style="max-height:220px;overflow:auto;border:1px solid #e2e8f0;border-radius:6px;padding:5px 8px">'+(rows||'<span class="hint-text">'+esc(L('暂无对象类型'))+'</span>')+'</div>'+
    '<label style="display:block;margin:8px 0 2px"><input type="checkbox" id="ruleBoundsOn"'+(cfg.bounds.enabled?' checked':'')+'> '+esc(L('越界，容差'))+' '+
      '<input type="number" min="0" max="1000" step="0.01" id="ruleBoundsTol" value="'+esc(cfg.bounds.tolerance)+'" style="width:74px"> m</label>'+
    '<label style="display:block;margin:6px 0"><input type="checkbox" id="ruleScopeAll"'+(cfg.scope==='all'?' checked':'')+'> '+esc(L('检查全部楼层'))+'</label>';
}
function readRuleConfigFromUI(){
  const out=createRuleConfig();
  const scopeAll=$('ruleScopeAll');
  out.scope=scopeAll&&scopeAll.checked?'all':'current';
  const overlapOn=$('ruleOverlapOn'), spacingOn=$('ruleSpacingOn'), boundsOn=$('ruleBoundsOn');
  if(overlapOn) out.overlap.enabled=!!overlapOn.checked;
  if(spacingOn) out.spacing.enabled=!!spacingOn.checked;
  if(boundsOn) out.bounds.enabled=!!boundsOn.checked;
  const ot=$('ruleOverlapTol'), bt=$('ruleBoundsTol');
  if(ot&&ot.value!=='') out.overlap.tolerance=Number(ot.value);
  if(bt&&bt.value!=='') out.bounds.tolerance=Number(bt.value);
  let list=[];
  try{ list=Array.from(document.querySelectorAll('[data-rule-type-min]')); }catch(_){ list=[]; }
  list.forEach(el=>{
    const id=el.getAttribute('data-rule-type-min'), raw=String(el.value||'').trim();
    if(!id||!raw) return;
    const n=Number(raw);
    if(Number.isFinite(n)&&n>=0&&n<=RULE_TOLERANCE_MAX){
      out.spacing.types[id]=Math.round(n*1000)/1000;
    }
  });
  return normalizeRuleConfig(out);
}
function renderRuleResults(){
  const box=$('ruleResults'); const count=$('ruleCount');
  if(!box) return;
  if(count) count.textContent=ruleLastResult?L(' · {n} 条',{n:ruleLastResult.violations.length}):'';
  if(!ruleLastResult){
    box.innerHTML='<p class="hint-text">'+esc(L('尚未运行检查。配置修改后请重新运行。'))+'</p>';
    return;
  }
  const r=ruleLastResult;
  const stats=L('耗时 {ms} ms｜对象 {objects}｜候选对 {pairs} / 理论 {theoretical}',
    {ms:r.ms,objects:r.stats.objects,pairs:r.stats.pairs,theoretical:r.stats.theoretical})+
    (r.stats.truncated?'｜'+L('已截断 {n} 条',{n:r.stats.truncated}):'');
  if(!r.violations.length){
    box.innerHTML='<div class="ok-banner">'+esc(L('未发现违规。'))+'</div><p class="hint-text">'+esc(stats)+'</p>';
    return;
  }
  const rows=r.violations.map((v,i)=>{
    const where=(v.floorName||'')+' ('+fmt(Number(v.x)||0)+', '+fmt(Number(v.y)||0)+')';
    return '<div class="issue" role="button" tabindex="0" data-rule-hit="'+i+'" title="'+esc(L('点击定位'))+'" style="cursor:pointer;margin:5px 0">'+
      '<b>'+esc(v.ruleName)+'</b> · '+esc(v.objectName||v.objectId)+(v.peerName?' ⇄ '+esc(v.peerName):'')+
      ' <span class="hint-text">['+esc(where)+']</span><div class="hint-text">'+esc(v.message)+'</div></div>';
  }).join('');
  const skipped=r.skipped&&r.skipped.length?'<p class="hint-text">'+esc(L('未执行：'))+esc(r.skipped.map(s=>s.ruleName+'@'+s.floorName+'：'+s.reason).join('；'))+'</p>':'';
  box.innerHTML='<p class="hint-text" style="margin:0 0 6px">'+esc(stats)+'</p>'+rows+skipped;
}
function ruleRunAndRender(){
  ruleLastResult=runRuleCheck();
  renderRuleResults();
  const n=ruleLastResult.violations.length;
  toast(n?L('检查完成：{n} 条违规',{n}):L('检查完成：未发现违规'),n?'warn':'');
}
function ruleExport(){
  const result=ruleLastResult||runRuleCheck();
  ruleLastResult=result;
  renderRuleResults();
  downloadBlob(new Blob([ruleViolationsCsv(result)],{type:'text/csv;charset=utf-8'}),ruleExportName());
  toast(L('已导出 {n} 条违规',{n:result.violations.length}), '');
}
function initRuleUI(){
  if(!$('ruleConfig')) return;
  renderRuleConfig();
  renderRuleResults();
  const cfg=$('ruleConfig');
  if(cfg&&typeof cfg.addEventListener==='function'){
    cfg.addEventListener('change',()=>{
      state.rules=readRuleConfigFromUI();
      scheduleSave();
      ruleLastResult=null;
      renderRuleResults();
    });
  }
  const runBtn=$('runRulesBtn'), expBtn=$('exportRulesBtn'), clrBtn=$('clearRulesBtn');
  if(runBtn&&typeof runBtn.addEventListener==='function') runBtn.addEventListener('click',ruleRunAndRender);
  if(expBtn&&typeof expBtn.addEventListener==='function') expBtn.addEventListener('click',ruleExport);
  if(clrBtn&&typeof clrBtn.addEventListener==='function') clrBtn.addEventListener('click',()=>{ ruleLastResult=null; renderRuleResults(); });
  const box=$('ruleResults');
  if(box&&typeof box.addEventListener==='function'){
    box.addEventListener('click',e=>{
      const el=e.target&&e.target.closest?e.target.closest('[data-rule-hit]'):null;
      if(!el||!ruleLastResult) return;
      const i=Number(el.getAttribute('data-rule-hit'));
      const v=ruleLastResult.violations[i];
      if(v) locateRuleViolation(v);
    });
    box.addEventListener('keydown',e=>{
      if(e.key!=='Enter'&&e.key!==' ') return;
      const el=e.target&&e.target.closest?e.target.closest('[data-rule-hit]'):null;
      if(!el||!ruleLastResult) return;
      e.preventDefault();
      const i=Number(el.getAttribute('data-rule-hit'));
      const v=ruleLastResult.violations[i];
      if(v) locateRuleViolation(v);
    });
  }
  const tab=$('tabBtn-rules');
  if(tab&&typeof tab.addEventListener==='function') tab.addEventListener('click',()=>{ renderRuleConfig(); renderRuleResults(); });
}
initRuleUI();
