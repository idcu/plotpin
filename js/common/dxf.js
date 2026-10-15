/* dxf.js —— DXF（Drawing Exchange Format）ASCII R12 子集解析与生成（零依赖）
 * 支持实体：LINE / LWPOLYLINE / POLYLINE+VERTEX / CIRCLE / ARC / POINT / TEXT
 * 坐标：内部统一米（Y 轴向上，与 DXF 一致）；按 $INSUNITS 自动换算，生成时输出毫米 */
(function (global) {
  'use strict';

/* $INSUNITS → 米换算系数（AutoCAD 规范常用值） */
const UNIT_TO_METER={0:1,1:0.0254,2:0.3048,4:0.001,5:0.01,6:1,8:0.0254/100,9:0.001*1000,10:0.01*100,13:1000,14:0.1};

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

function parseDxf(text){
  const lines=String(text||'').split(/\r?\n/);
  const at=i=>({code:parseInt(lines[i],10),val:lines[i+1]!==undefined?lines[i+1].trim():''});
  let section='', insUnits=0;
  const entities=[];
  let i=0;
  /* POLYLINE 头标志与所属图层；随后的 VERTEX 累积到它，SEQEND 收尾 */
  let poly=null;
  while(i+1<lines.length){
    const code=parseInt(lines[i],10), val=lines[i+1]!==undefined?lines[i+1].trim():'';
    if(code===0 && val==='SECTION'){ section='(pending)'; i+=2;
      if(parseInt(lines[i],10)===2){ section=lines[i+1].trim().toUpperCase(); }
      i+=2; continue;
    }
    if(code===0 && val==='ENDSEC'){ section=''; i+=2; continue; }
    if(section==='HEADER' && code===9 && val.toUpperCase()==='$INSUNITS'){
      const nx=at(i+2);
      if(nx.code===70){ insUnits=parseInt(nx.val,10)||0; i+=4; continue; }
    }
    if(section!=='ENTITIES' && section!=='(pending)'){ i+=2; continue; }
    if(section==='(pending)' && code===2){ section=val.toUpperCase(); i+=2; continue; }
    if(section!=='ENTITIES'){ i+=2; continue; }
    /* POLYLINE 头标志（70 位1=闭合）出现在 POLYLINE 与首个 VERTEX 之间，直接写到累积实体上 */
    if(poly && code===70){ poly.closed=(parseInt(val,10)&1)===1; i+=2; continue; }

    if(code===0){
      const typ=val.toUpperCase();
      if(typ==='POLYLINE'){ poly={type:'LWPOLYLINE',layer:'0',closed:false,points:[]}; entities.push(poly); i+=2; continue; }
      if(typ==='SEQEND'){ poly=null; i+=2; continue; }
      if(['LINE','LWPOLYLINE','CIRCLE','ARC','POINT','TEXT','VERTEX'].includes(typ)){
        const e={type:typ==='VERTEX'?'VERTEX':typ,layer:'0',closed:false,points:[],x:0,y:0,x2:0,y2:0,r:0,a0:0,a1:360,text:'',height:1};
        let j=i+2;
        while(j+1<lines.length){
          const c=parseInt(lines[j],10), v=lines[j+1];
          if(c===0){ break; }
          const vs=v!==undefined?v.trim():'';
          if(c===8) e.layer=vs;
          else if(c===70) e.closed=(parseInt(vs,10)&1)===1;
          else if(c===10){ e.x=parseFloat(v); }
          else if(c===20){ e.y=parseFloat(v); if(e.type==='LWPOLYLINE'||e.type==='VERTEX') e.points.push([e.x,parseFloat(v)]); }
          else if(c===11){ e.x2=parseFloat(v); }
          else if(c===21){ e.y2=parseFloat(v); }
          else if(c===40){ if(e.type==='CIRCLE'||e.type==='ARC') e.r=parseFloat(v); else if(e.type==='TEXT') e.height=parseFloat(v); }
          else if(c===50) e.a0=parseFloat(v);
          else if(c===51) e.a1=parseFloat(v);
          else if(c===1) e.text=v!==undefined?v.replace(/\s+$/,''):'';
          j+=2;
        }
        if(e.type==='VERTEX'){ if(poly) poly.points.push([e.x,e.y]); }
        else if(e.type==='LINE'){ e.points=[[e.x,e.y],[e.x2,e.y2]]; entities.push(e); }
        else entities.push(e);
        i=j; continue;
      }
    }
    i+=2;
  }
  /* 丢弃空 POLYLINE（无 VERTEX）；统一 LINE 也视为开放折线；
     按 $INSUNITS 把所有线性量换算为米（Y 轴向上与内部世界坐标一致），消费方直接使用 */
  const factor=UNIT_TO_METER[insUnits]??1;
  const clean=entities.filter(e=>e.type!=='LWPOLYLINE'||e.points.length>=2).map(e=>{
    if(factor===1) return e;
    e.points=e.points.map(p=>[p[0]*factor,p[1]*factor]);
    e.x*=factor; e.y*=factor; e.x2*=factor; e.y2*=factor; e.r*=factor; e.height*=factor;
    return e;
  });
  return {entities:clean, unit:factor, insUnits};
}

/* 生成 R12 ASCII DXF；entities: {type:'LWPOLYLINE'|'CIRCLE'|'POINT'|'LINE'|'TEXT',
 * layer,color(hex), points[[m,m]],closed,x,y,r,text,height}；坐标米→毫米 */
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
  const lname=e=>safeLayer(e.layer);
  entities.forEach(e=>{
    const head=pair(8,lname(e));
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

global.Dxf={ parseDxf, buildDxf, nearestAci, safeLayer, UNIT_TO_METER };
})(typeof window !== 'undefined' ? window : globalThis);
