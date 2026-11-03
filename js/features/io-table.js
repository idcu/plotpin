/* io-table.js —— 表格导入：CSV/TSV/XLSX 规划、几何核对与合并应用 */
/* -------------------- 表格导入（CSV/TSV/XLSX → 对象更新/新增） -------------------- */
const TABLE_KIND_BY_NAME={'点设备':'point','矩形/区域':'rect','线段/折线':'line','文字':'text','尺寸标注':'dimension'};
/* 区域形状 / 标注子类型：表格中文 ↔ 模型枚举（导出导入共用同一映射） */
const AREA_SHAPE_LABELS={rect:'矩形',circle:'圆形',ellipse:'椭圆',sector:'扇形',parallelogram:'平行四边形'};
const AREA_SHAPE_BY_LABEL={'矩形':'rect','圆形':'circle','椭圆':'ellipse','扇形':'sector','平行四边形':'parallelogram'};
const DIM_SUB_LABELS={ruler:'测距',distance:'两点距离',area:'面积',angle:'角度'};
const DIM_SUB_BY_LABEL={'测距':'ruler','两点距离':'distance','距离':'distance','面积':'area','角度':'angle'};
/* 节点坐标文本：节点间用分号、XY 间用逗号，如 "0,0;3.5,-2;10,4"（CSV 中整格自动加引号）；
   解析宽容逗号/空格/斜杠/竖线等分隔，支持负坐标 */
function formatNodeCoords(points){
  return (points||[]).map(p=>fmt(p[0])+','+fmt(p[1])).join(';');
}
function parseNodeCoords(text){
  if(text===undefined||text===null) return [];
  const out=[];
  String(text).split(';').forEach(seg=>{
    const nums=seg.trim().split(/[,，\s/|xX×]+/).filter(s=>s!=='').map(Number);
    if(nums.length===2&&nums.every(Number.isFinite)) out.push(nums);
  });
  return out;
}
/** 按表格行数据设置区域形状（基点为矩形左下角/圆·椭圆·扇形圆心）；参数不足返回 false */
function applyRowShape(o,label,v){
  const tt=AREA_SHAPE_BY_LABEL[label];
  if(!tt||!Number.isFinite(v.x)||!Number.isFinite(v.y)) return false;
  if(tt==='rect'){
    if(!(v.w>0)||!(v.h>0)) return false;
    o.shape=null; o.width=v.w; o.height=v.h; o.x=v.x; o.y=v.y; o.angle=normalizeAngle(v.angle);
    return true;
  }
  o.x=v.x; o.y=v.y;
  if(tt==='circle'){
    if(!(v.w>0)) return false;
    o.shape={type:'circle',r:v.w/2}; o.width=0; o.height=0; o.angle=0; return true;
  }
  if(tt==='ellipse'){
    if(!(v.w>0)||!(v.h>0)) return false;
    o.shape={type:'ellipse',rx:v.w/2,ry:v.h/2}; o.width=0; o.height=0; o.angle=normalizeAngle(v.angle); return true;
  }
  if(tt==='sector'){
    if(!(v.w>0)) return false;
    let a0=Number.isFinite(v.params[0])?v.params[0]:(Number.isFinite(v.angle)?v.angle:0);
    let a1=Number.isFinite(v.params[1])?v.params[1]:a0+90;
    let sweep=((a1-a0)%360+360)%360; if(sweep===0) sweep=360;
    o.shape={type:'sector',r:v.w/2,a0,a1:a0+sweep}; o.width=0; o.height=0; o.angle=0; return true;
  }
  if(tt==='parallelogram'){
    if(!(v.w>0)||!(v.h>0)) return false;
    /* 形状参数 = 倾角（度）；缺省 30° */
    const skew=Number.isFinite(v.params[0])?v.params[0]:(Number.isFinite(v.angle)?v.angle:PARALLELOGRAM_DEFAULT_SKEW);
    o.shape={type:'parallelogram',skew:Math.max(-PARALLELOGRAM_MAX_SKEW,Math.min(PARALLELOGRAM_MAX_SKEW,skew))};
    o.width=v.w; o.height=v.h; o.x=v.x; o.y=v.y;
    o.angle=normalizeAngle(Number.isFinite(v.angle)?v.angle:0);
    return true;
  }
  return false;
}
function tableNum(v){ const n=Number(String(v??'').trim()); return Number.isFinite(n)&&String(v??'').trim()!==''?n:NaN; }
/** 设备台账扩展字段（型号/安装高度/IP/责任人）→ o.props，导出与导入共用同一映射 */
const LEDGER_FIELDS=[['型号','model'],['安装高度','mountHeight'],['IP','ip'],['责任人','owner']];
function applyLedgerCells(o,c){
  LEDGER_FIELDS.forEach(([col,key])=>{
    const raw=c(col);
    if(raw==='') return;
    o.props=o.props||{};
    if(key==='mountHeight'){
      const n=tableNum(raw);
      if(Number.isFinite(n)) o.props[key]=Math.max(0,n);
    }else o.props[key]=raw;
  });
}
function tableBool(v){ return /^(是|true|1|y|yes)$/i.test(String(v??'').trim()); }
function parseShapeParams(text){
  return String(text??'').split(/[,，\s]+/).filter(s=>s.trim()!=='').map(Number);
}
/**
 * 预览阶段构造「导入后候选对象」（纯内存、不写状态），几何字段应用规则必须与 applyTableImport 一致；
 * 基点平移对长度/面积无影响（刚体平移不变量），故此处只复刻节点/闭合/子类型/形状的变化。
 */
function previewGeomCandidate(base,c){
  const cnd=deepClone(base);
  if(cnd.kind==='line'||cnd.kind==='dimension'){
    const pts=parseNodeCoords(c('节点坐标'));
    if(pts.length){
      const wantClosed=cnd.kind==='line'&&c('闭合')!==''?tableBool(c('闭合')):cnd.closed;
      const wantSub=cnd.kind==='dimension'&&c('标注类型')?DIM_SUB_BY_LABEL[c('标注类型')]:cnd.subtype;
      const subMin=(cnd.kind==='dimension'&&wantSub!=='ruler'&&wantSub!=='distance')?3:2;
      const closedOk=cnd.kind==='line'?(!wantClosed||pts.length>=3):true;
      if(pts.length>=subMin&&closedOk){
        cnd.points=pts;
        if(cnd.kind==='line') cnd.closed=wantClosed;
        if(cnd.kind==='dimension') cnd.subtype=wantSub;
      }
    }else{
      if(cnd.kind==='line'&&c('闭合')!==''&&cnd.points.length>=3) cnd.closed=tableBool(c('闭合'));
      if(cnd.kind==='dimension'&&c('标注类型')){
        const wantSub=DIM_SUB_BY_LABEL[c('标注类型')];
        const subMin=(wantSub!=='ruler'&&wantSub!=='distance')?3:2;
        if(wantSub&&cnd.points.length>=subMin) cnd.subtype=wantSub;
      }
    }
  }else if(cnd.kind==='rect'){
    const label=c('形状'), params=parseShapeParams(c('形状参数'));
    const x=tableNum(c('X')),y=tableNum(c('Y')),ang=tableNum(c('角度'));
    if(label){
      applyRowShape(cnd,label,{x:Number.isFinite(x)?x:cnd.x,y:Number.isFinite(y)?y:cnd.y,
        w:tableNum(c('宽度')),h:tableNum(c('高度')),angle:Number.isFinite(ang)?ang:cnd.angle,params});
    }else if(areaShapeType(cnd)==='rect'){
      const w=tableNum(c('宽度')),h=tableNum(c('高度'));
      if(w>0)cnd.width=w; if(h>0)cnd.height=h;
      if(Number.isFinite(ang))cnd.angle=normalizeAngle(ang);
    }
  }
  return cnd;
}
/**
 * 表格数值是 fmt() 按精度 p 四舍五入的结果（ulp=10^-p）。坐标/宽高取整会传播到长度/面积，
 * 这里给出严格的传播误差界：差异在界内视为取整噪声，超出即判定人工填写不一致。
 */
function geomRoundingTol(cnd,ulp){
  let lenTol=ulp, areaTol=ulp;
  const pts=cnd.points;
  if(pts&&pts.length){
    const segN=cnd.closed?pts.length:Math.max(0,pts.length-1);
    lenTol=segN*1.5*ulp+0.5*ulp;
    /* 鞋带公式：每点坐标误差 ulp/2，面积误差 ≤ ulp/2·Σ(|x|+|y|)，再加面积列自身取整 ulp/2 */
    let s=0; pts.forEach(p=>s+=Math.abs(p[0])+Math.abs(p[1]));
    areaTol=0.5*ulp*s+ulp;
  }
  if(cnd.kind==='rect'){
    const tt=areaShapeType(cnd), sh=cnd.shape||{};
    if(tt==='rect'){
      areaTol=0.5*ulp*(Math.abs(cnd.width)+Math.abs(cnd.height))+ulp;
      lenTol=3*ulp;
    }else if(tt==='parallelogram'){
      /* 面积=底×高（同矩形）；周长含斜边 h/cosθ，倾角取整带来额外误差，放宽到 5ulp */
      areaTol=0.5*ulp*(Math.abs(cnd.width)+Math.abs(cnd.height))+ulp;
      lenTol=5*ulp;
    }else if(tt==='circle'){
      const r=sh.r||0;
      areaTol=Math.PI*(r*ulp+ulp*ulp)+ulp;   /* πr²，|Δr|≤ulp/2 */
      lenTol=4*ulp;                            /* 2πr */
    }else if(tt==='ellipse'){
      const rx=sh.rx||0,ry=sh.ry||0;
      areaTol=1.6*ulp*Math.max(rx,ry)+ulp;    /* πrx·ry，半轴由直径/2 得到 */
      lenTol=4*ulp;
    }else{
      const r=sh.r||0;
      /* 扇形：半径取整 + 起止角（张角）取整两项；周长含弧长 r·sweep·π/180 */
      areaTol=4*ulp*r+Math.PI*r*r*ulp/360+ulp;
      lenTol=0.02*r*ulp+4*ulp;
    }
  }
  return {lenTol,areaTol};
}
/** 核对一行「节点数/长度/面积」与候选几何推算值；列缺失或留空不校验（兼容旧表/外部分表） */
function checkRowGeom(where,c,cnd){
  const warns=[];
  const ulp=Math.pow(10,-(state.settings.precision??2));
  const {lenTol,areaTol}=geomRoundingTol(cnd,ulp);
  const isCurve=cnd.kind==='line'||cnd.kind==='dimension';
  const nCell=c('节点数'),lenCell=c('长度'),areaCell=c('面积');
  if(isCurve&&nCell!==''){
    const n=tableNum(nCell);
    if(!Number.isInteger(n)||n!==cnd.points.length)
      warns.push(where+'：节点数列「'+nCell+'」与节点坐标推算的 '+cnd.points.length+' 个节点不一致，已以坐标为准');
  }
  const expLen=objectLength(cnd), expArea=objectArea(cnd);
  if(lenCell!==''){
    const d=tableNum(lenCell);
    if(!Number.isFinite(d)||d<0) warns.push(where+'：长度列「'+lenCell+'」非法（需为非负数字），已忽略并按几何重算');
    else if(Math.abs(d-expLen)>lenTol)
      warns.push(where+'：长度列 '+fmt(d)+' m 与按几何推算的 '+fmt(expLen)+' m 不一致（差 '+fmt(Math.abs(d-expLen))+' m），已以节点/形状为准');
  }
  if(areaCell!==''){
    const a=tableNum(areaCell);
    if(!Number.isFinite(a)||a<0) warns.push(where+'：面积列「'+areaCell+'」非法（需为非负数字），已忽略并按几何重算');
    else if(Math.abs(a-expArea)>areaTol)
      warns.push(where+'：面积列 '+fmt(a)+' ㎡ 与按几何推算的 '+fmt(expArea)+' ㎡ 不一致（差 '+fmt(Math.abs(a-expArea))+' ㎡），已以节点/形状为准');
  }
  return warns;
}
function rowsToObjectsPlan(rows){
  const warnings=[];
  if(!rows||!rows.length) return {updates:[],creates:[],warnings:['文件内容为空，未导入任何行']};
  const header=rows[0].map(h=>String(h||'').trim().replace(/^\ufeff/,''));
  const idx={};
  header.forEach((h,i)=>{ if(TABLE_COLUMNS.includes(h)&&idx[h]===undefined) idx[h]=i; });
  if(idx['编号']===undefined&&idx['对象类型']===undefined){
    return {updates:[],creates:[],warnings:['首行未找到「编号/对象类型」表头，请使用本工具导出的 CSV/TSV/XLSX 模板']};
  }
  const cell=(r,name)=>idx[name]!==undefined?String(r[idx[name]]??'').trim():'';
  syncActiveFloor();
  const floors=(state.floors||[]).map(f=>({id:f.id,name:f.name,active:f.id===state.activeFloorId,objects:Array.isArray(f.objects)?f.objects:[]}));
  const current=floors.find(f=>f.active);
  if(!current) floors.push({id:state.activeFloorId||'',name:currentFloorName(),active:true,objects:state.objects});
  const floorByName=new Map(floors.map(f=>[String(f.name||'').trim(),f]));
  const codeMaps=new Map(floors.map(f=>[f.id,new Map((f.objects||[]).map(o=>[o.name,o]))]));
  const updates=[],creates=[];
  const check=(where,c,cnd)=>checkRowGeom(where,c,cnd).forEach(w=>warnings.push(w));
  rows.slice(1).forEach((r,i)=>{
    const lineNo=i+2;
    if(!r.some(v=>String(v??'').trim()!=='')) return;
    const code=cell(r,'编号');
    const rowFloor=cell(r,'楼层');
    let ctx=current;
    if(rowFloor){
      const f=floorByName.get(rowFloor);
      if(!f){ warnings.push('第 '+lineNo+' 行'+(code?'（编号 '+code+'）':'')+'：未知楼层「'+rowFloor+'」，已跳过'); return; }
      ctx=f;
    }
    const where='第 '+lineNo+' 行'+(code?'（编号 '+code+'）':'')+(rowFloor?'［楼层 '+rowFloor+'］':'');
    const c=name=>cell(r,name);
    const floorCodes=codeMaps.get(ctx.id);
    if(code&&floorCodes&&floorCodes.has(code)){
      const obj=floorCodes.get(code);
      check(where,c,previewGeomCandidate(obj,c));
      updates.push({obj,cell:c,floorId:ctx.id});
      return;
    }
    if(code){
      const other=floors.find(f=>f.id!==ctx.id&&codeMaps.get(f.id)&&codeMaps.get(f.id).has(code));
      if(other){ warnings.push(where+'：编号「'+code+'」已存在于楼层「'+other.name+'」，为避免重复已跳过'); return; }
    }
    const kind=TABLE_KIND_BY_NAME[cell(r,'对象类型')];
    if(!kind){ warnings.push(where+'：对象类型「'+(cell(r,'对象类型')||'空')+'」无法识别，已跳过'); return; }
    const x=tableNum(c('X')), y=tableNum(c('Y'));
    /* 折线/尺寸标注：从「节点坐标」列重建（基点 X/Y 取首节点）；无坐标列无法新建 */
    if(kind==='line'||kind==='dimension'){
      const pts=parseNodeCoords(c('节点坐标'));
      const subtype=kind==='dimension'?(DIM_SUB_BY_LABEL[c('标注类型')]||'distance'):'';
      const minPts=(kind==='dimension'&&subtype!=='ruler'&&subtype!=='distance')?3:2;
      if(pts.length<minPts){
        warnings.push(where+'：缺少有效「节点坐标」（格式 x,y;x,y;…，'+kindName(kind)+'至少 '+minPts+' 点），无法新建，已跳过');
        return;
      }
      const closed=kind==='line'&&tableBool(c('闭合'));
      if(closed&&pts.length<3){ warnings.push(where+'：闭合折线至少需要 3 个节点，已按开放折线处理'); }
      const cr={kind,x,y,closed:closed&&pts.length>=3,subtype,points:pts,cell:c,floorId:ctx.id};
      const cnd=baseObject(kind);
      cnd.points=pts;
      if(kind==='line') cnd.closed=cr.closed; else cnd.subtype=subtype;
      syncFirstPoint(cnd);
      check(where,c,cnd);
      creates.push(cr);
      return;
    }
    if(!Number.isFinite(x)||!Number.isFinite(y)){ warnings.push(where+'：缺少有效 X/Y 坐标，已跳过'); return; }
    if(kind==='rect'){
      /* 形状列决定尺寸校验：矩形/椭圆要宽+高；圆/扇形只要直径（宽度列） */
      const shape=AREA_SHAPE_BY_LABEL[c('形状')]||'rect';
      const w=tableNum(c('宽度')), h=tableNum(c('高度'));
      const needH=shape==='rect'||shape==='ellipse';
      if(!(w>0)||(needH&&!(h>0))){
        warnings.push(where+'：'+AREA_SHAPE_LABELS[shape]+'缺少有效宽度'+(needH?'/高度':'')+'，已跳过');
        return;
      }
      const cnd=baseObject(kind);
      applyRowShape(cnd,AREA_SHAPE_LABELS[shape],{x,y,w,h,angle:tableNum(c('角度')),params:parseShapeParams(c('形状参数'))});
      check(where,c,cnd);
      creates.push({kind,x,y,shape,cell:c,floorId:ctx.id});
      return;
    }
    check(where,c,baseObject(kind));   /* 点设备/文字：长度面积应为空或 0 */
    creates.push({kind,x,y,cell:c,floorId:ctx.id});
  });
  return {updates,creates,warnings};
}
function showTableImportPreview(fileName,plan){
  if(!plan.updates.length&&!plan.creates.length&&plan.warnings.length){
    openModal(L('无法导入：')+fileName,'<div class="issue">'+plan.warnings.slice(0,10).map(esc).join('</div><div class="issue">')+'</div>',
      [{text:L('知道了'),class:'primary',click:closeModal}]);
    return;
  }
  const warnHtml=plan.warnings.length
    ? '<div style="max-height:190px;overflow:auto;margin:10px 0">'+plan.warnings.slice(0,50).map(w=>'<div class="issue">'+esc(w)+'</div>').join('')+
      (plan.warnings.length>50?'<p class="hint-text">'+esc(L('其余提示略'))+' '+(plan.warnings.length-50)+'</p>':'')+'</div>'
    : `<div class="ok-banner">${esc(L('全部行均可导入。'))}</div>`;
  openModal(L('表格导入预览：')+fileName,
    '<p style="line-height:1.7">'+esc(L('将按「编号」匹配对象并更新属性：'))+'<b>'+plan.updates.length+'</b> '+esc(L('项更新、'))+'<b>'+plan.creates.length+'</b> '+esc(L('项新增。'))+'</p>'+
    '<p class="hint-text">'+esc(L('可更新：名称、业务类型、图层、基点坐标、角度、宽高、形状、闭合、节点坐标、标注类型、显隐、锁定、备注；新对象支持点设备 / 矩形·圆·椭圆·扇形区域 / 折线（含闭合）/ 测距等标注（需「节点坐标」列）。'))+'<b>'+esc(L('长度/面积/节点数为系统按几何自动计算值，导入时会逐行核对，手改不一致只告警不拦截、以几何为准。'))+'</b>'+esc(L('建议导入前先导出 JSON 备份。'))+'</p>'+warnHtml,
    [{text:L('取消'),click:closeModal},
     {text:L('合并导入'),class:'primary',click:()=>{closeModal();applyTableImport(plan);}}]);
}
function applyTableImport(plan){
  pushHistory();
  syncActiveFloor();
  const floorObjects=new Map((state.floors||[]).map(f=>[f.id,Array.isArray(f.objects)?f.objects:null]));
  let updated=0,created=0;
  plan.updates.forEach(u=>{
    const o=u.obj,c=u.cell;
    const name=c('名称'); if(name!=='') o.text=name;
    const tn=c('业务类型');
    if(tn){ const t=state.objectTypes.find(x=>x.kind===o.kind&&x.name===tn); if(t) o.typeId=t.id; }
    const ln=c('图层');
    if(ln){ const l=state.layers.find(x=>x.name===ln); if(l) o.layerId=l.id; }
    const x=tableNum(c('X')),y=tableNum(c('Y')),ang=tableNum(c('角度'));
    if(o.kind==='line'||o.kind==='dimension'){
      /* 折线/标注：「节点坐标」整体替换并同步基点；只改 X/Y 时按基点平移全部节点，杜绝锚点与节点脱节 */
      const pts=parseNodeCoords(c('节点坐标'));
      if(pts.length){
        const wantClosed=o.kind==='line'&&c('闭合')!==''?tableBool(c('闭合')):o.closed;
        const wantSub=o.kind==='dimension'&&c('标注类型')?DIM_SUB_BY_LABEL[c('标注类型')]:o.subtype;
        const subMin=(o.kind==='dimension'&&wantSub!=='ruler'&&wantSub!=='distance')?3:2;
        const closedOk=o.kind==='line'?(!wantClosed||pts.length>=3):true;
        if(pts.length>=subMin&&closedOk){
          o.points=pts;
          if(o.kind==='line') o.closed=wantClosed;
          if(o.kind==='dimension') o.subtype=wantSub;
          syncFirstPoint(o);
        }
      }else{
        const nx=Number.isFinite(x)?x:o.x, ny=Number.isFinite(y)?y:o.y;
        const dx=nx-o.x, dy=ny-o.y;
        if(dx||dy){ o.points=o.points.map(p=>[p[0]+dx,p[1]+dy]); o.x=nx; o.y=ny; }
        if(o.kind==='line'&&c('闭合')!==''&&o.points.length>=3) o.closed=tableBool(c('闭合'));
        /* 仅切换标注类型（不带节点列）：现有节点数满足新类型下限才生效 */
        if(o.kind==='dimension'&&c('标注类型')){
          const wantSub=DIM_SUB_BY_LABEL[c('标注类型')];
          const subMin=(wantSub!=='ruler'&&wantSub!=='distance')?3:2;
          if(wantSub&&o.points.length>=subMin) o.subtype=wantSub;
        }
      }
    }else if(o.kind==='rect'){
      /* 形状列存在时按形状重建（基点/圆心系同一套 X/Y）；否则沿用旧的宽高更新 */
      const shapeLabel=c('形状');
      const params=parseShapeParams(c('形状参数'));
      if(shapeLabel){
        applyRowShape(o,shapeLabel,{x:Number.isFinite(x)?x:o.x,y:Number.isFinite(y)?y:o.y,
          w:tableNum(c('宽度')),h:tableNum(c('高度')),angle:Number.isFinite(ang)?ang:o.angle,params});
      }else{
        if(Number.isFinite(x)) o.x=x;
        if(Number.isFinite(y)) o.y=y;
        if(Number.isFinite(ang)) o.angle=normalizeAngle(ang);
        if(areaShapeType(o)==='rect'){ const w=tableNum(c('宽度')),h=tableNum(c('高度')); if(w>0)o.width=w; if(h>0)o.height=h; }
      }
    }else{
      if(Number.isFinite(x)) o.x=x;
      if(Number.isFinite(y)) o.y=y;
      if(Number.isFinite(ang)) o.angle=normalizeAngle(ang);
    }
    const vis=c('显示'); if(vis!=='') o.visible=tableBool(vis);
    const lk=c('锁定'); if(lk!=='') o.locked=tableBool(lk);
    const note=c('备注'); if(note!==''){ o.props=o.props||{}; o.props.note=note; }
    applyLedgerCells(o,c);
    o.updatedAt=nowISO(); updated++;
  });
  plan.creates.forEach(cr=>{
    const c=cr.cell;
    const type=state.objectTypes.find(x=>x.kind===cr.kind&&x.name===c('业务类型'));
    const o=baseObject(cr.kind,type?type.id:defaultTypeId(cr.kind));
    const ang=tableNum(c('角度'));
    if(cr.kind==='line'||cr.kind==='dimension'){
      o.points=cr.points;
      if(cr.kind==='line') o.closed=!!cr.closed;
      if(cr.kind==='dimension') o.subtype=cr.subtype||'distance';
      syncFirstPoint(o);
    }else if(cr.kind==='rect'){
      const params=parseShapeParams(c('形状参数'));
      applyRowShape(o,AREA_SHAPE_LABELS[cr.shape]||'矩形',
        {x:cr.x,y:cr.y,w:tableNum(c('宽度')),h:tableNum(c('高度')),angle:Number.isFinite(ang)?ang:0,params});
    }else{
      o.x=cr.x; o.y=cr.y;
      if(Number.isFinite(ang)) o.angle=normalizeAngle(ang);
      if(cr.kind==='text'){ o.text=c('名称')||'文字'; o.height=2.2; }
    }
    const ln=c('图层'); const l=state.layers.find(x=>x.name===ln); if(l) o.layerId=l.id;
    const vis=c('显示'); if(vis!=='') o.visible=tableBool(vis);
    const lk=c('锁定'); if(lk!=='') o.locked=tableBool(lk);
    const note=c('备注'); if(note!==''){ o.props=o.props||{}; o.props.note=note; }
    applyLedgerCells(o,c);
    const target=cr.floorId&&cr.floorId!==state.activeFloorId?floorObjects.get(cr.floorId):null;
    const list=target||state.objects;
    o.z=list.length;
    list.push(o); created++;
  });
  selectedIds.clear();
  commitChange('表格导入完成：更新 '+updated+' 项，新增 '+created+' 项');
}
