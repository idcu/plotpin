/* dxf.js —— DXF 解析/生成（适配 @idcu/format-dxf）
 * 保留原有 Dxf 全局导出名与函数名，实现由公共模块提供。
 * B-03 在适配层补齐版本审计与公共模块未覆盖的常见实体，不修改 ngm.vendor：
 *   - inspect(text)：读取 $ACADVER/$INSUNITS、统计实体类型、识别二进制 DXF、标出未支持类型；
 *   - parseDxf：在公共模块解析结果上追加 SOLID / 3DFACE / LEADER / ATTRIB / ATTDEF。 */
(function (global) {
  'use strict';
  const D = global.__idcuDxf;
  if (!D) throw new Error('dxf: @idcu/format-dxf 未加载');

  const VERSION_NAMES={
    AC1009:'R12', AC1012:'R13', AC1014:'R14', AC1015:'2000', AC1018:'2004',
    AC1021:'2007', AC1024:'2010', AC1027:'2013', AC1032:'2018'
  };
  /* AutoCAD $INSUNITS → 中文名与米换算（与公共模块 strictUnits 的完整表一致；0=无单位按米） */
  const UNITS=[
    {code:0,label:'无单位',meter:1},
    {code:1,label:'英寸',meter:0.0254},
    {code:2,label:'英尺',meter:0.3048},
    {code:3,label:'英里',meter:1609.344},
    {code:4,label:'毫米',meter:0.001},
    {code:5,label:'厘米',meter:0.01},
    {code:6,label:'米',meter:1},
    {code:7,label:'公里',meter:1000},
    {code:8,label:'微英寸',meter:2.54e-8},
    {code:9,label:'密尔',meter:2.54e-5},
    {code:10,label:'码',meter:0.9144},
    {code:11,label:'埃',meter:1e-10},
    {code:12,label:'纳米',meter:1e-9},
    {code:13,label:'微米',meter:1e-6},
    {code:14,label:'分米',meter:0.1}
  ];
  const UNIT_MAP=Object.fromEntries(UNITS.map(u=>[u.code,u]));
  /* 公共模块能直接落地的实体（含块定义结构） */
  const CORE_TYPES=new Set(['LINE','LWPOLYLINE','POLYLINE','VERTEX','SEQEND','CIRCLE','ARC','POINT',
    'TEXT','MTEXT','ELLIPSE','SPLINE','INSERT','BLOCK','ENDBLK','SECTION','ENDSEC','EOF']);
  /* 本适配层补充解析的实体 */
  const SUPPLEMENT_TYPES=new Set(['SOLID','3DFACE','LEADER','ATTRIB','ATTDEF']);

  /** 严格两行一组：DXF ASCII 的组码/值固定成对出现（与公共模块同一读取模型） */
  function dxfPairs(text){
    const lines=String(text||'').split(/\r?\n/), out=[];
    for(let i=0;i+1<lines.length;i+=2){
      const code=parseInt(lines[i],10), raw=lines[i+1]===undefined?'':lines[i+1];
      /* E4：组码行不是数字时丢弃该对，避免错位把后续值当组码继续污染结构 */
      if(!Number.isFinite(code)) continue;
      /* IO-P2-19：组码 1 为文本原值，保留首尾空格；其余组码仍 trim 以便结构比较 */
      out.push([code, code===1?raw:raw.trim()]);
    }
    return out;
  }
  function sectionScan(pairs,onEntity,onSection){
    let section='';
    for(let i=0;i<pairs.length;i++){
      const [c,v]=pairs[i];
      if(c===0&&v.toUpperCase()==='SECTION'){
        const nx=pairs[i+1];
        section=nx&&nx[0]===2?nx[1].toUpperCase():'';
        if(onSection) onSection(section);
        continue;
      }
      if(c===0&&v.toUpperCase()==='ENDSEC'){ section=''; continue; }
      if(c===0&&section==='ENTITIES') onEntity(v.toUpperCase(),i);
    }
  }
  /** 版本/单位/实体矩阵审计（纯函数，不解析几何） */
  function inspectDxf(text){
    const src=String(text||'');
    const binary=/^AutoCAD Binary DXF/i.test(src)||src.includes('\u0000\u0000');
    const pairs=dxfPairs(src);
    let version='', insUnits=null;
    for(let i=0;i+1<pairs.length;i++){
      const [c,v]=pairs[i];
      if(c===9&&v.toUpperCase()==='$ACADVER'){ const n=pairs[i+1]; if(n&&n[0]===1) version=n[1].toUpperCase(); }
      if(c===9&&v.toUpperCase()==='$INSUNITS'){ const n=pairs[i+1]; if(n&&n[0]===70) insUnits=parseInt(n[1],10); }
    }
    const entityCounts={}, unsupportedTypes={}, supplementalTypes={};
    let blocks=0, r12Bulge=0, entityTotal=0;
    let blockSection=false;
    for(let i=0;i+1<pairs.length;i++){
      const [c,v]=pairs[i];
      if(c===0&&v.toUpperCase()==='SECTION'){
        const nx=pairs[i+1];
        blockSection=nx&&nx[0]===2&&nx[1].toUpperCase()==='BLOCKS';
      }else if(c===0&&v.toUpperCase()==='ENDSEC') blockSection=false;
      else if(blockSection&&c===0&&v.toUpperCase()==='BLOCK') blocks++;
    }
    sectionScan(pairs,(typ,p)=>{
      if(typ==='BLOCK'){ return; }
      if(!typ) return;
      entityCounts[typ]=(entityCounts[typ]||0)+1;
      entityTotal++;
      if(SUPPLEMENT_TYPES.has(typ)) supplementalTypes[typ]=(supplementalTypes[typ]||0)+1;
      else if(!CORE_TYPES.has(typ)) unsupportedTypes[typ]=(unsupportedTypes[typ]||0)+1;
      if(typ==='POLYLINE'||typ==='VERTEX'){
        /* 公共模块只在 LWPOLYLINE 读凸度；R12 的 VERTEX 42 会被丢弃，这里如实计数 */
        let j=p+1;
        while(j+1<pairs.length&&pairs[j][0]!==0){
          if(pairs[j][0]===42&&parseFloat(pairs[j][1])!==0) r12Bulge++;
          j++;
        }
      }
    });
    return {
      binary, version, versionName:VERSION_NAMES[version]||'', knownVersion:!!VERSION_NAMES[version],
      insUnits, entityCounts, supplementalTypes, unsupportedTypes,
      entityTotal, supportedCount:entityTotal-objectCount(unsupportedTypes),
      blocks, r12Bulge
    };
  }
  function objectCount(o){ return Object.values(o).reduce((n,v)=>n+v,0); }

  function nextZero(pairs,start){ let j=start+1; while(j+1<pairs.length&&pairs[j][0]!==0) j++; return j; }
  function supplementalFromRecord(typ,pairs){
    const layer=(pairs.find(p=>p[0]===8)||[8,'0'])[1]||'0';
    if(typ==='SOLID'||typ==='3DFACE'){
      let cx=null,x=NaN;
      const pts=[];
      for(const [c,v] of pairs){
        if(c>=10&&c<=13){ cx=c; x=parseFloat(v); }
        else if(cx!==null&&c>=20&&c<=23&&c===cx+10){
          const y=parseFloat(v);
          if(Number.isFinite(x)&&Number.isFinite(y)) pts.push([x,y]);
          cx=null;
        }
      }
      if(pts.length<3) return null;
      let quad=pts.slice(0,4);
      if(typ==='SOLID'&&quad.length===4) quad=[quad[0],quad[1],quad[3],quad[2]];
      if(quad.length===4&&quad[3][0]===quad[2][0]&&quad[3][1]===quad[2][1]) quad=quad.slice(0,3);
      return {type:'LWPOLYLINE',layer,closed:true,points:quad,source:typ};
    }
    if(typ==='LEADER'){
      const pts=[];
      let x=NaN;
      for(const [c,v] of pairs){
        if(c===10) x=parseFloat(v);
        else if(c===20&&Number.isFinite(x)){ pts.push([x,parseFloat(v)]); x=NaN; }
      }
      return pts.length>=2?{type:'LWPOLYLINE',layer,closed:false,points:pts,source:typ}:null;
    }
    if(typ==='ATTRIB'||typ==='ATTDEF'){
      const textVal=(pairs.find(p=>p[0]===1)||[1,''])[1];
      const x=(pairs.find(p=>p[0]===10)||[10,'NaN'])[1];
      const y=(pairs.find(p=>p[0]===20)||[20,'NaN'])[1];
      const h=(pairs.find(p=>p[0]===40)||[40,'1'])[1];
      const hx=parseFloat(h), px=parseFloat(x), py=parseFloat(y);
      if(!textVal||!Number.isFinite(px)||!Number.isFinite(py)) return null;
      return {type:'TEXT',layer,x:px,y:py,text:textVal,height:Number.isFinite(hx)&&hx>0?hx:1,source:typ};
    }
    return null;
  }
  function collectSupplemental(text){
    const pairs=dxfPairs(text), out=[];
    sectionScan(pairs,(typ,p)=>{
      if(!SUPPLEMENT_TYPES.has(typ)) return;
      const e=supplementalFromRecord(typ,pairs.slice(p+1,nextZero(pairs,p)));
      if(e) out.push(e);
    });
    return out;
  }
  function scaleRaw(e,f){
    if(!e||f===1) return e;
    if(e.points) e.points=e.points.map(q=>[q[0]*f,q[1]*f]);
    if(Number.isFinite(e.x)) e.x*=f;
    if(Number.isFinite(e.y)) e.y*=f;
    if(Number.isFinite(e.height)) e.height*=f;
    return e;
  }

  function scaleParsedEntities(entities,f){
    if(f===1) return entities;
    for(const e of entities||[]){
      if(Array.isArray(e.points)) e.points=e.points.map(q=>[q[0]*f,q[1]*f]);
      if(Number.isFinite(e.x)) e.x*=f;
      if(Number.isFinite(e.y)) e.y*=f;
      if(Number.isFinite(e.r)) e.r*=f;
      if(Number.isFinite(e.height)) e.height*=f;
    }
    return entities;
  }
  const baseParse=D.parseDxf;
  /** E4：缺码/错位会让公共模块用默认 0 补齐（如 LINE 缺 11/21 → 零长线、圆缺 40 → r=0），
   *  这里按落地类型校验坐标与必需参数，非法实体丢弃并计数，绝不进入 state。 */
  function entityOk(e){
    if(!e||typeof e!=='object') return false;
    if(Array.isArray(e.points)){
      if(!e.points.every(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]))) return false;
      return e.points.some((p,i)=>i>0&&(p[0]!==e.points[0][0]||p[1]!==e.points[0][1]));
    }
    if(e.type==='CIRCLE') return Number.isFinite(e.x)&&Number.isFinite(e.y)&&Number.isFinite(e.r)&&e.r>0;
    if(e.type==='POINT'||e.type==='TEXT') return Number.isFinite(e.x)&&Number.isFinite(e.y);
    return true;   /* 其它类型交给上层分类，不在适配层判死 */
  }
  function parseDxf(text,opt){
    const src=String(text||'');
    const meta=inspectDxf(src);
    if(meta.binary) return {entities:[],unit:1,insUnits:meta.insUnits??0,blockCount:0,inspect:meta,supplemental:0,droppedEntities:0};
    const parsed=baseParse(src,opt);
    const detected=parsed.unit||1;
    const raw=parsed.entities||[];
    const kept=raw.filter(entityOk);
    parsed.droppedEntities=raw.length-kept.length;
    parsed.entities=kept;
    /* 单位确认：forceUnit 用 $INSUNITS 的完整米换算表把公共模块结果整体缩放到目标单位；
       E4：未知 forceUnit 不再静默，记录代码交由导入提示按文件单位处理 */
    const forced=opt&&opt.forceUnit!=null?UNIT_MAP[opt.forceUnit]:null;
    parsed.unitFallback=opt&&opt.forceUnit!=null&&!forced?opt.forceUnit:null;
    const target=forced?forced.meter:detected;
    const f=target/detected;
    if(f!==1) scaleParsedEntities(parsed.entities,f);
    parsed.unit=target;
    const extra=collectSupplemental(src).map(e=>scaleRaw(e,target));
    if(extra.length) parsed.entities=extra.concat(parsed.entities);
    parsed.inspect=meta;
    parsed.supplemental=extra.length;
    return parsed;
  }

  /* E5：保真导出的 ELLIPSE 写出（公共模块只写 LWPOLYLINE/CIRCLE/POINT/LINE/TEXT），
     仅在显式选项下插入；默认路径不做任何改写，保证与旧版本逐字节一致 */
  const baseBuild=D.buildDxf;
  function buildDxfFid(ents,layers,opt){
    const ell=ents.filter(e=>e.type==='ELLIPSE');
    if(!ell.length) return baseBuild(ents,layers,opt);
    /* 10/20/11/21 写 mm；40(短长轴比)/41/42(参数) 无量纲，不能乘 1000 */
    const pr=(c,v)=>c+'\r\n'+v+'\r\n', n=v=>(Math.round(Number(v)*1e6)/1e6).toString();
    let add='';
    for(const e of ell){
      const rx=Number(e.rx),ry=Number(e.ry),mj=Math.max(rx,ry),mn=Math.min(rx,ry);
      if(!(mj>0)) continue;   /* 退化椭圆不写 NaN 组码 */
      /* 对象 angle 以度存储；DXF 主轴向量按弧度计算，ry>rx 时主轴换向 +90° */
      const a=(Number(e.angle)||0)*Math.PI/180+(ry>rx?Math.PI/2:0);
      add+=pr(0,'ELLIPSE')+pr(8,D.safeLayer(e.layer))+pr(10,n(e.x*1000))+pr(20,n(e.y*1000))+pr(11,n(mj*Math.cos(a)*1000))+pr(21,n(mj*Math.sin(a)*1000))+pr(40,n(mn/mj))+pr(41,0)+pr(42,6.283185);
    }
    /* 记录插在 ENTITIES 段末尾：前缀 \r\n 补回被替换串吃掉的分行，add 自身以 \r\n 结尾 */
    const tail='0\r\nENDSEC\r\n0\r\nEOF';
    return baseBuild(ents.filter(e=>e.type!=='ELLIPSE'),layers,opt).replace('\r\n'+tail,'\r\n'+add+tail);
  }
  global.Dxf=Object.assign({},D,{
    buildDxf:buildDxfFid, build:buildDxfFid,
    parseDxf, parse:parseDxf,
    inspect:inspectDxf, supplementalEntities:collectSupplemental, scaleParsedEntities,
    unitLabel:code=>(UNIT_MAP[code]||{}).label||('未知单位 '+code),
    unitFactor:code=>(UNIT_MAP[code]||{}).meter||1,
    VERSION_NAMES, CORE_TYPES, SUPPLEMENT_TYPES, UNITS
  });
})(typeof window !== 'undefined' ? window : globalThis);
