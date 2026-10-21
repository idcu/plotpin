/* dxf.js —— DXF（Drawing Exchange Format）ASCII 子集解析与生成（零依赖）
 * 支持实体：LINE / LWPOLYLINE(含 42 凸度圆弧段) / POLYLINE+VERTEX / CIRCLE / ARC /
 *           ELLIPSE / SPLINE(De Boor) / INSERT 块引用 / POINT / TEXT / MTEXT
 * 坐标：内部统一米（Y 轴向上，与 DXF 一致）；按 $INSUNITS 自动换算，生成时输出毫米 */
(function (global) {
  'use strict';

/* $INSUNITS → 米换算系数（AutoCAD 规范常用值） */
const UNIT_TO_METER={0:1,1:0.0254,2:0.3048,4:0.001,5:0.01,6:1,8:0.0254/100,9:1,10:1,13:1000,14:0.1};

/* 标准 ACI 颜色前 9 号（图层/实体用），超出取最近 */
const ACI_RGB={
  1:[255,0,0],2:[255,255,0],3:[0,255,0],4:[0,255,255],5:[0,0,255],6:[255,0,255],
  7:[255,255,255],8:[128,128,128],9:[192,192,192]
};
function nearestAci(hex){
  const m=/^#?([0-9a-f]{6})$/i.exec(String(hex||''));
  if(!m) return 7;
  const r=parseInt(m[1].slice(0,2),16),g=parseInt(m[1].slice(2,4),16),b=parseInt(m[1].slice(4,6),16);
  let best=7,bd=1e12;
  for(const [i,rgb] of Object.entries(ACI_RGB)){
    const d=(r-rgb[0])**2+(g-rgb[1])**2+(b-rgb[2])**2;
    if(d<bd){bd=d;best=Number(i);}
  }
  return best;
}
function safeLayer(name){ return String(name||'0').replace(/[<>/\\":;?*|=`]/g,'_').slice(0,60)||'0'; }

/* ---------------- 几何：凸度弧段 / B 样条 / 椭圆 ---------------- */
/** 凸度 b=tan(夹角/4)：把 p1→p2 的弧段采样为中间点+终点（不含起点，由调用方衔接） */
function bulgeSegment(p1,p2,b,seg){
  if(!Number.isFinite(b)||Math.abs(b)<1e-9) return [p2];
  const vx=p2[0]-p1[0], vy=p2[1]-p1[1], L=Math.hypot(vx,vy);
  if(L<1e-12) return [p2];
  const mx=(p1[0]+p2[0])/2, my=(p1[1]+p2[1])/2;
  const off=L*(1-b*b)/(4*b);
  /* b>0 弧在弦的左侧（CAD Y 向上约定），圆心在右侧 */
  const cx=mx+vy/L*off, cy=my-vx/L*off;
  let a0=Math.atan2(p1[1]-cy,p1[0]-cx), a1=Math.atan2(p2[1]-cy,p2[0]-cx);
  let sweep=a1-a0;
  if(b>0){ while(sweep<=1e-12) sweep+=2*Math.PI; }
  else { while(sweep>=-1e-12) sweep-=2*Math.PI; }
  /* 半径=圆心到 p1；采样中间点（最后一点用原始 p2，消除浮点缝隙） */
  const R=Math.hypot(p1[0]-cx,p1[1]-cy), out=[];
  for(let k=1;k<=seg;k++){
    if(k===seg){ out.push(p2); continue; }
    const a=a0+sweep*k/seg;
    out.push([cx+R*Math.cos(a),cy+R*Math.sin(a)]);
  }
  return out;
}
function knotSpanIndex(knots,t){
  const n=knots.length-1;
  let i=0; while(i<n-1&&!(t<knots[i+1])) i++;
  return i;
}
/** De Boor 求值 B 样条；无节点向量时按钳制均匀节点 */
function evalBSpline(controls,degree,knotsInput,segPerPoint){
  if(controls.length<2) return controls.map(p=>p.slice());
  const n=controls.length-1, p=Math.max(1,Math.min(degree||3,n));
  let U=knotsInput&&knotsInput.length===n+p+2?knotsInput.slice():null;
  if(!U){
    U=[];
    for(let i=0;i<=p;i++) U.push(0);
    const inner=n-p;
    for(let i=1;i<=inner;i++) U.push(i/(inner+1));
    for(let i=0;i<=p;i++) U.push(1);
  }
  const t0=U[p], t1=U[n+1], range=t1-t0||1;
  const steps=Math.max(16,controls.length*(segPerPoint||12));
  const at=t=>{
    let k=knotSpanIndex(U,t);
    if(k<n) {/* clamp */}
    k=Math.min(n,Math.max(p,k));
    const d=[];
    for(let j=0;j<=p;j++) d[j]=controls[j+k-p].slice();
    for(let r=1;r<=p;r++){
      for(let j=p;j>=r;j--){
        const denom=U[j+1+k-r]-U[j+k-p];
        const a=denom===0?0:(t-U[j+k-p])/denom;
        d[j]=[(1-a)*d[j-1][0]+a*d[j][0],(1-a)*d[j-1][1]+a*d[j][1]];
      }
    }
    return d[p];
  };
  const out=[];
  for(let i=0;i<=steps;i++) out.push(at(t0+range*i/steps));
  return out;
}
/** 椭圆（含椭圆弧）采样：c 圆心，m 长半轴向量，ratio 短/长比，t0/t1 弧度 */
function sampleEllipse(c,m,ratio,t0,t1,seg){
  const rx=Math.hypot(m[0],m[1]), rot=Math.atan2(m[1],m[0]), ry=rx*ratio, co=Math.cos(rot), si=Math.sin(rot);
  const full=(t1-t0)>=2*Math.PI-1e-6, N=seg||(full?64:24);
  const pts=[];
  for(let k=0;k<=N;k++){
    const t=t0+(t1-t0)*k/N;
    const ex=rx*Math.cos(t), ey=ry*Math.sin(t);
    pts.push([c[0]+ex*co-ey*si,c[1]+ex*si+ey*co]);
  }
  return {points:pts,closed:full};
}
/** MTEXT 控制码清洗：去字体/字高开关，\P 转换行，去花括号分组 */
function stripMtext(s){
  return String(s??'')
    .replace(/\\[A-Za-z]+[^;\\]*;/g,'')
    .replace(/[{}]/g,'')
    .replace(/\\P/g,'\n').replace(/\\~/g,' ')
    .replace(/\\(.)/g,'$1')
    .replace(/\r?\n/g,' ').trim();
}

/* ---------------- 解析 ---------------- */
const ENTITY_TYPES=['LINE','LWPOLYLINE','POLYLINE','VERTEX','SEQEND','CIRCLE','ARC','POINT','TEXT','MTEXT','ELLIPSE','SPLINE','INSERT','BLOCK','ENDBLK'];
/* ---- 读取上限：文本长度与实体数（防止畸形/超大地形图拖垮页面） ---- */
const DXF_LIMITS={maxChars:20*1024*1024,maxEntities:50000};
function parseDxf(text,opt){
  const L=Object.assign({},DXF_LIMITS,opt||{});
  const src=String(text||'');
  if(src.length>L.maxChars) throw new Error('DXF 文件过大（超过 '+(L.maxChars/1048576)+'MB 文本上限），请拆分或简化后导入');
  const lines=src.split(/\r?\n/);
  let section='', insUnits=0;
  const entities=[];
  const blocks=new Map();
  let blockName=null;
  let poly=null;
  let i=0;
  const readSectionName=()=>{ if(parseInt(lines[i],10)===2){ section=(lines[i+1]||'').trim().toUpperCase(); } };
  while(i+1<lines.length){
    const code=parseInt(lines[i],10), val=(lines[i+1]!==undefined?lines[i+1]:'').trim();
    if(code===0 && val==='SECTION'){ section='(pending)'; i+=2; readSectionName(); i+=2; continue; }
    if(code===0 && val==='ENDSEC'){ section=''; blockName=null; i+=2; continue; }
    if(section==='HEADER' && code===9 && val.toUpperCase()==='$INSUNITS'){
      const c=parseInt(lines[i+2],10), v=parseInt((lines[i+3]||'').trim(),10);
      if(c===70){ insUnits=v||0; i+=4; continue; }
    }
    if(section!=='ENTITIES' && section!=='BLOCKS' && section!=='(pending)'){ i+=2; continue; }
    if(section==='(pending)' && code===2){ section=val.toUpperCase(); i+=2; continue; }
    if(section!=='ENTITIES' && section!=='BLOCKS'){ i+=2; continue; }
    /* BLOCK 头：名字在紧随的 code 2 */
    if(code===0 && val==='BLOCK'){
      let j=i+2, name='';
      while(j+1<lines.length && parseInt(lines[j],10)!==0){ if(parseInt(lines[j],10)===2) name=(lines[j+1]||'').trim(); j+=2; }
      blockName=name; if(!blocks.has(blockName)) blocks.set(blockName,[]);
      i=j; continue;
    }
    if(code===0 && val==='ENDBLK'){ blockName=null; i+=2; continue; }
    /* POLYLINE 头闭合标志（R12 老式多段线） */
    if(poly && code===70){ poly.closed=(parseInt(val,10)&1)===1; i+=2; continue; }
    if(code===0){
      const typ=val.toUpperCase();
      if(typ==='POLYLINE'){
        if(entities.length>=L.maxEntities) throw new Error('DXF 实体数超过上限 '+L.maxEntities+'，请拆分或简化后导入');
        poly={kind:'LWPOLYLINE',layer:'0',closed:false,vertices:[],points:[]}; entities.push(poly); i+=2; continue;
      }
      if(typ==='SEQEND'){ poly=null; i+=2; continue; }
      if(!ENTITY_TYPES.includes(typ)){ i+=2; continue; }
      const rec=readRecord(lines,i,typ);
      i=rec.next;
      if(typ==='VERTEX'){ if(poly) poly.vertices.push({x:rec.r.x,y:rec.r.y,bulge:rec.r.bulge||0}); continue; }
      if(section==='BLOCKS' && blockName!==null){ blocks.get(blockName).push(rec.r); continue; }
      if(typ==='POLYLINE') continue;
      if(entities.length>=L.maxEntities) throw new Error('DXF 实体数超过上限 '+L.maxEntities+'，请拆分或简化后导入');
      entities.push(rec.r);
    }else i+=2;
  }
  /* R12 POLYLINE 顶点合并到 points 并保留凸度 */
  entities.forEach(e=>{
    if(e.kind==='LWPOLYLINE' && e.vertices?.length){
      e.points=e.vertices.map(v=>[v.x,v.y]);
      e.bulges=e.vertices.map(v=>v.bulge||0);
      delete e.vertices;
    }
  });
  /* 展开 INSERT 块引用，再统一几何落地与单位换算 */
  const factor=UNIT_TO_METER[insUnits]??1;
  const expanded=[];
  const pushExpanded=(rec,ins)=>{
    for(const out of finalizeRecord(rec,blocks,ins)) expanded.push(out);
  };
  entities.forEach(rec=>{
    if(rec.kind==='INSERT'){
      const blk=blocks.get(rec.block);
      if(!blk) return;
      blk.forEach(b=>{
        const copy=JSON.parse(JSON.stringify(b));
        if(copy.layer==='0') copy.layer=rec.layer||'0';
        pushExpanded(copy,rec);
      });
    }else pushExpanded(rec,null);
  });
  return {entities:expanded.filter(Boolean).map(e=>scaleEntity(e,factor)), unit:factor, insUnits, blockCount:blocks.size};
}

/* 读取一个实体的全部组码（到下一个 code 0） */
function readRecord(lines,i,typ){
  const r={kind:typ,layer:'0',closed:false,points:[],bulges:[],x:0,y:0,x2:0,y2:0,r:0,a0:0,a1:360,
    text:'',height:1,block:'',sx:1,sy:1,rot:0,cx:0,cy:0,mx:0,my:0,ratio:1,t0:0,t1:2*Math.PI,
    degree:3,knots:[],ctrl:[],fit:[]};
  let cx=0,cy=0;            /* 当前 10/20（控制点/顶点复用） */
  let expectBlockName=false;
  let j=i+2;
  while(j+1<lines.length){
    const c=parseInt(lines[j],10);
    if(c===0) break;
    const raw=lines[j+1], v=raw!==undefined?raw.trim():'';
    if(c===8) r.layer=v;
    else if(c===70) r.closed=(parseInt(v,10)&1)===1;
    else if(c===75) r.fitCount=parseInt(v,10)||0;
    else if(c===42){
      if(typ==='LWPOLYLINE') r.bulges.push(parseFloat(raw)||0);
      else if(typ==='INSERT') r.sy=parseFloat(raw)||1;
      else if(typ==='ELLIPSE') r.t1=parseFloat(raw);
    }
    else if(c===10){ cx=parseFloat(raw); }
    else if(c===20){
      cy=parseFloat(raw);
      if(typ==='LWPOLYLINE'){ r.points.push([cx,cy]); if(r.bulges.length<r.points.length-1) r.bulges.push(0); }
      else if(typ==='SPLINE') r.ctrl.push([cx,cy]);
      else { r.x=cx; r.y=cy; }
    }
    else if(c===11){
      const u=parseFloat(raw);
      if(typ==='SPLINE'){ r._fitX=u; }
      else if(typ==='LINE'){ r.x2=u; }
      else if(typ==='ELLIPSE'){ r.mx=u; }
    }
    else if(c===21){
      const u=parseFloat(raw);
      if(typ==='SPLINE' && Number.isFinite(r._fitX) && (r.fitCount>0)){ r.fit.push([r._fitX,u]); r._fitX=undefined; }
      else if(typ==='LINE'){ r.y2=u; }
      else if(typ==='ELLIPSE'){ r.my=u; }
    }
    else if(c===40){
      if(typ==='CIRCLE'||typ==='ARC') r.r=parseFloat(raw);
      else if(typ==='TEXT'||typ==='MTEXT') r.height=parseFloat(raw);
      else if(typ==='SPLINE') r.knots.push(parseFloat(raw));
      else if(typ==='ELLIPSE') r.ratio=parseFloat(raw);
    }
    else if(c===50){ if(typ==='ARC') r.a0=parseFloat(raw); else if(typ==='INSERT') r.rot=parseFloat(raw); }
    else if(c===51){ if(typ==='ARC') r.a1=parseFloat(raw); }
    else if(c===71) r.degree=parseInt(v,10)||3;
    else if(c===2){ if(typ==='INSERT') r.block=v; }
    else if(c===3){ if(typ==='MTEXT') r.text+=raw!==undefined?raw:''; }
    else if(c===1){
      if(typ==='MTEXT') r.text+=(raw!==undefined?raw:'');
      else r.text=raw!==undefined?raw.replace(/\s+$/,''):'';
    }
    else if(c===41){ if(typ==='INSERT') r.sx=parseFloat(raw)||1; else if(typ==='ELLIPSE') r.t0=parseFloat(raw); }
    j+=2;
  }
  /* LWPOLYLINE 凸度数组与顶点对齐（缺省补 0） */
  if(typ==='LWPOLYLINE'){ while(r.bulges.length<r.points.length) r.bulges.push(0); }
  return {r,next:j};
}

/* 把原始记录转成输出实体（已是米前的原始单位，INSERT 变换在此完成） */
function finalizeRecord(rec,blocks,ins){
  const out=[];
  const kind=rec.kind;
  if(kind==='LINE'){
    out.push({type:'LWPOLYLINE',layer:rec.layer,closed:false,points:[[rec.x,rec.y],[rec.x2,rec.y2]]});
  }else if(kind==='LWPOLYLINE'){
    /* 凸度弧段展开为密集折线；闭合由 closed 标志表达，闭合段不再重复首点 */
    const pts=[rec.points[0]];
    const n=rec.points.length;
    const segs=rec.closed?n:n-1;
    for(let k=0;k<segs;k++){
      const p1=rec.points[k], p2=rec.points[(k+1)%n];
      const arc=bulgeSegment(p1,p2,rec.bulges[k]||0,12);
      if(k===n-1 && rec.closed) arc.pop();   /* 闭合段终点=已有首点，丢弃 */
      pts.push(...arc);
    }
    /* 闭合但不足 3 点（退化）按开放线保留 */
    const forceOpen=pts.length<3;
    if(!rec.closed && pts.length>=2) out.push({type:'LWPOLYLINE',layer:rec.layer,closed:false,points:pts});
    else if(rec.closed && pts.length>=3) out.push({type:'LWPOLYLINE',layer:rec.layer,closed:true,points:pts});
    else if(forceOpen) out.push({type:'LWPOLYLINE',layer:rec.layer,closed:false,points:pts});
  }else if(kind==='CIRCLE'){
    if(ins&&Math.abs((ins.sx||1)-(ins.sy??1))>1e-9){
      /* INSERT 非均匀缩放：圆退化为椭圆折线 */
      const e=sampleEllipse([rec.x,rec.y],[rec.r,0],1,0,2*Math.PI,48);
      out.push({type:'LWPOLYLINE',layer:rec.layer,closed:true,points:e.points});
    }else out.push({type:'CIRCLE',layer:rec.layer,x:rec.x,y:rec.y,r:rec.r});
  }else if(kind==='ARC'){
    const N=24, pts=[];
    for(let k=0;k<=N;k++){ const a=(rec.a0+(rec.a1-rec.a0)*k/N)*Math.PI/180; pts.push([rec.x+rec.r*Math.cos(a),rec.y+rec.r*Math.sin(a)]); }
    out.push({type:'LWPOLYLINE',layer:rec.layer,closed:false,points:pts});
  }else if(kind==='POINT'){
    out.push({type:'POINT',layer:rec.layer,x:rec.x,y:rec.y});
  }else if(kind==='TEXT'){
    if(rec.text) out.push({type:'TEXT',layer:rec.layer,x:rec.x,y:rec.y,text:rec.text,height:rec.height});
  }else if(kind==='MTEXT'){
    const t=stripMtext(rec.text);
    if(t) out.push({type:'TEXT',layer:rec.layer,x:rec.x,y:rec.y,text:t,height:rec.height});
  }else if(kind==='ELLIPSE'){
    const e=sampleEllipse([rec.x,rec.y],[rec.mx,rec.my],rec.ratio,rec.t0,rec.t1,undefined);
    out.push({type:'LWPOLYLINE',layer:rec.layer,closed:e.closed,points:e.points});
  }else if(kind==='SPLINE'){
    const src=rec.ctrl.length>=2?rec.ctrl:rec.fit;
    if(src.length>=2){
      out.push({type:'LWPOLYLINE',layer:rec.layer,closed:!!rec.closed,
        points:rec.ctrl.length>=2?evalBSpline(rec.ctrl,rec.degree,rec.knots):rec.fit});
    }
  }
  if(ins) out.forEach(e=>applyInsertTransform(e,ins));
  return out;
}
/** INSERT：平移+旋转+XYZ 缩放（图层 0 继承已在展开前处理） */
function applyInsertTransform(e,ins){
  const sx=ins.sx||1, sy=ins.sy===undefined?1:ins.sy, th=(ins.rot||0)*Math.PI/180;
  const co=Math.cos(th), si=Math.sin(th);
  const map=p=>{ const x=p[0]*sx, y=p[1]*sy; return [ins.x+x*co-y*si, ins.y+x*si+y*co]; };
  if(e.points) e.points=e.points.map(map);
  if(e.type==='CIRCLE'){
    const nx=ins.x+e.x*sx*co-e.y*sy*si, ny=ins.y+e.x*sx*si+e.y*sy*co;
    e.x=nx; e.y=ny; e.r*=Math.abs(sx);
  }else{
    e.x=ins.x+e.x*sx*co-e.y*sy*si;
    e.y=ins.y+e.x*sx*si+e.y*sy*co;
  }
}
/** $INSUNITS 线性量统一换算到米 */
function scaleEntity(e,f){
  if(f===1) return e;
  if(e.points) e.points=e.points.map(p=>[p[0]*f,p[1]*f]);
  e.x*=f; e.y*=f; e.r*=f; e.height*=f;
  return e;
}

/* ---------------- 生成 R12 ASCII DXF（坐标米→毫米） ---------------- */
function buildDxf(entities,layers,opt={}){
  const factor=opt.factor??1000;
  const f=v=>{ const n=Number(v)*factor; return (Math.round(n*1e6)/1e6).toString(); };
  const layerList=[]; const layerColor=new Map();
  const addLayer=(name,color)=>{ const n=safeLayer(name); if(!layerList.includes(n)){layerList.push(n);layerColor.set(n,nearestAci(color));} };
  addLayer('0','#ffffff');
  layers.forEach(l=>addLayer(l.name,l.color));
  entities.forEach(e=>addLayer(e.layer,e.color));

  const pair=(c,v)=>c+'\r\n'+v+'\r\n';
  let out='';
  out+=pair(0,'SECTION')+pair(2,'HEADER')+pair(9,'$ACADVER')+pair(1,'AC1009')
      + pair(9,'$INSUNITS')+pair(70,4)+pair(0,'ENDSEC');
  out+=pair(0,'SECTION')+pair(2,'TABLES');
  out+=pair(0,'TABLE')+pair(2,'LTYPE')+pair(70,1)+pair(0,'LTYPE')+pair(2,'CONTINUOUS')+pair(70,0)+pair(3,'CONTINUOUS')+pair(72,65)+pair(73,0)+pair(40,0)+pair(0,'ENDTAB');
  out+=pair(0,'TABLE')+pair(2,'LAYER')+pair(70,layerList.length);
  layerList.forEach(n=>{
    out+=pair(0,'LAYER')+pair(2,n)+pair(70,0)+pair(62,layerColor.get(n)||7)+pair(6,'CONTINUOUS');
  });
  out+=pair(0,'ENDTAB')+pair(0,'ENDSEC');
  out+=pair(0,'SECTION')+pair(2,'ENTITIES');
  entities.forEach(e=>{
    const head=pair(8,safeLayer(e.layer));
    if(e.type==='LWPOLYLINE'){
      out+=pair(0,'LWPOLYLINE')+head+pair(70,e.closed?1:0)+pair(90,e.points.length);
      e.points.forEach(p=>{ out+=pair(10,f(p[0]))+pair(20,f(p[1])); });
    }else if(e.type==='CIRCLE'){
      out+=pair(0,'CIRCLE')+head+pair(10,f(e.x))+pair(20,f(e.y))+pair(40,f(e.r));
    }else if(e.type==='POINT'){
      out+=pair(0,'POINT')+head+pair(10,f(e.x))+pair(20,f(e.y));
    }else if(e.type==='LINE'){
      out+=pair(0,'LINE')+head+pair(10,f(e.points[0][0]))+pair(20,f(e.points[0][1]))
          +pair(11,f(e.points[1][0]))+pair(21,f(e.points[1][1]));
    }else if(e.type==='TEXT'){
      out+=pair(0,'TEXT')+head+pair(10,f(e.x))+pair(20,f(e.y))+pair(40,f(e.height||1))+pair(1,escapeText(e.text));
    }
  });
  out+=pair(0,'ENDSEC')+pair(0,'EOF');
  return out;
}
function escapeText(s){ return String(s??'').replace(/\r?\n/g,' '); }

global.Dxf={ parseDxf, buildDxf, nearestAci, safeLayer, bulgeSegment, evalBSpline, sampleEllipse, stripMtext, UNIT_TO_METER, LIMITS: DXF_LIMITS };
})(typeof window !== 'undefined' ? window : globalThis);
