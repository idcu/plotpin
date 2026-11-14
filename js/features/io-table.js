/* io-table.js —— 表格导入：CSV/TSV/XLSX 规划、几何核对与合并应用 */
/* -------------------- 表格导入（CSV/TSV/XLSX → 对象更新/新增） -------------------- */
const TABLE_KIND_BY_NAME={'点设备':'point','矩形/区域':'rect','线段/折线':'line','文字':'text','尺寸标注':'dimension'};
/* 批量操作模式（B-08 原义）：显式「操作」列 + 条件「匹配」列；无「操作」列时保持旧的自动路由行为 */
const TABLE_OP_BY_LABEL={'新增':'create','创建':'create','更新':'update','替换':'replace'};
const TABLE_MATCH_COLUMNS=['匹配编号','匹配名称','匹配名称包含','匹配对象类型','匹配业务类型','匹配图层'];
const TABLE_IMPORT_EXTRA_COLUMNS=['操作'].concat(TABLE_MATCH_COLUMNS);
/** 导入可识别表头 = 导出列 + 批量操作/条件列（导出表头本身不变，保持既有 golden） */
function tableImportColumns(){ return TABLE_COLUMNS.concat(TABLE_IMPORT_EXTRA_COLUMNS); }
/* 区域形状 / 标注子类型：表格中文 ↔ 模型枚举（导出导入共用同一映射） */
const AREA_SHAPE_LABELS={rect:'矩形',circle:'圆形',ellipse:'椭圆',sector:'扇形',parallelogram:'平行四边形'};
const AREA_SHAPE_BY_LABEL={'矩形':'rect','圆形':CIR,'椭圆':ELL,'扇形':SEC,'平行四边形':PARA};
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
/** 按表格行数据设置区域形状（基点为矩形左下角/圆·椭圆·扇形圆心）；先校验后写入，失败不留部分修改 */
function applyRowShape(o,label,v){
  const tt=AREA_SHAPE_BY_LABEL[label];
  if(!tt||!Number.isFinite(v.x)||!Number.isFinite(v.y)) return false;
  if(tt==='rect'){
    if(!(v.w>0)||!(v.h>0)) return false;
    o.shape=null; o.width=v.w; o.height=v.h; o.x=v.x; o.y=v.y; o.angle=normalizeAngle(v.angle);
    return true;
  }
  if(tt===CIR){
    if(!(v.w>0)) return false;
    o.shape={type:CIR,r:v.w/2}; o.width=0; o.height=0; o.angle=0; o.x=v.x; o.y=v.y; return true;
  }
  if(tt===ELL){
    if(!(v.w>0)||!(v.h>0)) return false;
    o.shape={type:ELL,rx:v.w/2,ry:v.h/2}; o.width=0; o.height=0; o.angle=normalizeAngle(v.angle); o.x=v.x; o.y=v.y; return true;
  }
  if(tt===SEC){
    if(!(v.w>0)) return false;
    const a0=Number.isFinite(v.params[0])?v.params[0]:(Number.isFinite(v.angle)?v.angle:0);
    const a1=Number.isFinite(v.params[1])?v.params[1]:a0+90;
    let sweep=((a1-a0)%360+360)%360; if(sweep===0) sweep=360;
    o.shape={type:SEC,r:v.w/2,a0,a1:a0+sweep}; o.width=0; o.height=0; o.angle=0; o.x=v.x; o.y=v.y; return true;
  }
  if(tt===PARA){
    if(!(v.w>0)||!(v.h>0)) return false;
    /* 形状参数 = 倾角（度）；缺省 30° */
    const skew=Number.isFinite(v.params[0])?v.params[0]:(Number.isFinite(v.angle)?v.angle:PARALLELOGRAM_DEFAULT_SKEW);
    o.shape={type:PARA,skew:clampSkewDeg(skew)};
    o.width=v.w; o.height=v.h; o.x=v.x; o.y=v.y;
    o.angle=normalizeAngle(Number.isFinite(v.angle)?v.angle:0);
    return true;
  }
  return false;
}
function tableNum(v){ const n=Number(String(v??'').trim()); return Number.isFinite(n)&&String(v??'').trim()!==''?n:NaN; }
/** 设备台账扩展字段（型号/安装高度/IP/责任人）→ o.props：映射唯一定义在 io-fields.js 的字段表（ledger 标记） */
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
/** 三态布尔：true / false / undefined（无法识别或空）。导入时未知值保留原值并告警（IO-P2-7） */
function tableBoolValue(v){
  const t=String(v??'').trim();
  if(!t) return undefined;
  if(/^(是|true|1|y|yes)$/i.test(t)) return true;
  if(/^(否|false|0|n|no)$/i.test(t)) return false;
  return undefined;
}
function tableBool(v){ const b=tableBoolValue(v); return b===undefined?false:b; }
/* 严格模式布尔列合法取值（是/否/true/false/1/0/y/n/yes/no） */
const TABLE_BOOL_RE=/^(是|否|true|false|1|0|y|n|yes|no)$/i;
/** 条件列命中数：批量替换行至少要有一个非空匹配条件，避免误改全部对象 */
function rowConditionCount(c){ return TABLE_MATCH_COLUMNS.reduce((n,k)=>n+(c(k)!==''?1:0),0); }
/** 按「匹配」列判定对象是否命中（空条件不参与；全部为空返回 false） */
function rowMatchesObject(o,c){
  const id=c('匹配编号');
  if(id&&String(o.name||'')!==id) return false;
  const name=c('匹配名称');
  if(name&&String(o.text||'').trim()!==name) return false;
  const inc=c('匹配名称包含');
  if(inc&&!String(o.text||'').includes(inc)) return false;
  const kind=c('匹配对象类型');
  if(kind&&kindName(o.kind)!==kind) return false;
  const tn=c('匹配业务类型');
  if(tn&&getType(o.typeId).name!==tn) return false;
  const ln=c('匹配图层');
  if(ln&&layerOf(o).name!==ln) return false;
  return rowConditionCount(c)>0;
}
/** 更新 / 替换 / 新增共用：业务类型、图层、显隐、锁定、备注、设备台账（几何与名称由各路径负责） */
function applyTableCommonCells(o,c){
  const tn=c('业务类型');
  if(tn){ const t=state.objectTypes.find(x=>x.kind===o.kind&&x.name===tn); if(t) o.typeId=t.id; }
  const ln=c('图层');
  if(ln){ const l=state.layers.find(x=>x.name===ln); if(l) o.layerId=l.id; }
  const vis=tableBoolValue(c('显示')); if(vis!==undefined) o.visible=vis;
  const lk=tableBoolValue(c('锁定')); if(lk!==undefined) o.locked=lk;
  const note=c('备注'); if(note!==''){ o.props=o.props||{}; o.props.note=note; }
  applyLedgerCells(o,c);
}
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
    }else if(tt===PARA){
      /* 面积=底×高（同矩形）；周长含斜边 h/cosθ，倾角取整带来额外误差，放宽到 5ulp */
      areaTol=0.5*ulp*(Math.abs(cnd.width)+Math.abs(cnd.height))+ulp;
      lenTol=5*ulp;
    }else if(tt===CIR){
      const r=sh.r||0;
      areaTol=Math.PI*(r*ulp+ulp*ulp)+ulp;   /* πr²，|Δr|≤ulp/2 */
      lenTol=4*ulp;                            /* 2πr */
    }else if(tt===ELL){
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
  const warnings=[],errors=[];
  if(!rows||!rows.length) return {updates:[],creates:[],replaces:[],warnings:['文件内容为空，未导入任何行'],errors,strict:false};
  const header=rows[0].map(h=>String(h||'').trim().replace(/^\ufeff/,''));
  const idx={},known=tableImportColumns();
  header.forEach((h,i)=>{ if(known.includes(h)&&idx[h]===undefined) idx[h]=i; });
  const strict=idx['操作']!==undefined;
  if(idx['编号']===undefined&&idx['对象类型']===undefined&&idx['操作']===undefined&&
     !TABLE_MATCH_COLUMNS.some(k=>idx[k]!==undefined)){
    return {updates:[],creates:[],replaces:[],warnings:['首行未找到「编号/对象类型」表头，请使用本工具导出的 CSV/TSV/XLSX 模板'],errors,strict};
  }
  /* 公式防护的导引号在导入侧还原，保证「导出→再导入」名称/备注等文本不变形 */
  const cell=(r,name)=>idx[name]!==undefined?formulaUnguard(String(r[idx[name]]??'').trim()):'';
  syncActiveFloor();
  const floors=(state.floors||[]).map(f=>({id:f.id,name:f.name,active:f.id===state.activeFloorId,objects:Array.isArray(f.objects)?f.objects:null}));
  const current=floors.find(f=>f.active);
  if(!current) floors.push({id:state.activeFloorId||'',name:currentFloorName(),active:true,objects:state.objects});
  /* N-08：楼层名重复则「楼层」列无法定位目标，整批拒绝（errors 通道 → 预览不提供合并导入） */
  const floorNameSeen=new Set(), floorNameDup=new Set();
  floors.forEach(f=>{
    const nm=normalizeFloorName(f.name);
    if(nm) (floorNameSeen.has(nm)?floorNameDup:floorNameSeen).add(nm);
  });
  if(floorNameDup.size){
    floorNameDup.forEach(nm=>errors.push('楼层名称「'+nm+'」重复，无法确定导入目标楼层；请先重命名楼层后重新导入（本批未生效）'));
    return {updates:[],creates:[],replaces:[],warnings,errors,strict};
  }
  const floorByName=new Map(floors.map(f=>[normalizeFloorName(f.name),f]));
  const codeMaps=new Map(floors.map(f=>[f.id,Array.isArray(f.objects)?new Map(f.objects.map(o=>[o.name,o])):null]));
  const updates=[],creates=[],replaces=[];
  const problem=msg=>{ (strict?errors:warnings).push(msg); };
  const check=(where,c,cnd)=>checkRowGeom(where,c,cnd).forEach(w=>warnings.push(w));
  /* 非严格模式：布尔列未知值不再静默当“否”，保留原值并告警（严格模式由 checkLedger 报错） */
  const checkBool=(where,c)=>{
    if(strict) return;
    [['显示'],['锁定'],['闭合']].forEach(([k])=>{
      const v=c(k);
      if(v!==''&&tableBoolValue(v)===undefined)
        warnings.push(where+'：'+k+'「'+v+'」无法识别（可用 是/否），已保留原值');
    });
  };
  const objectsOf=f=>f.id===state.activeFloorId?state.objects:(f.objects||[]);
  /* 严格模式（存在「操作」列）才校验目标字段，旧表头行为保持只告警/静默忽略 */
  const checkLedger=(where,c)=>{
    if(!strict) return;
    const mh=c('安装高度');
    if(mh!==''&&!(tableNum(mh)>=0)) problem(where+'：安装高度「'+mh+'」非法（需为非负数字）');
    const vis=c('显示'); if(vis!==''&&!TABLE_BOOL_RE.test(vis)) problem(where+'：显示「'+vis+'」非法（需为是/否）');
    const lk=c('锁定'); if(lk!==''&&!TABLE_BOOL_RE.test(lk)) problem(where+'：锁定「'+lk+'」非法（需为是/否）');
  };
  const checkTargets=(where,c,objs)=>{
    if(!strict) return;
    const tn=c('业务类型');
    if(tn){
      const bad=objs.find(o=>!state.objectTypes.some(x=>x.kind===o.kind&&x.name===tn));
      if(bad) problem(where+'：业务类型「'+tn+'」不适用于'+kindName(bad.kind)+'（可用「匹配对象类型」缩小范围）');
    }
    const ln=c('图层');
    if(ln&&!state.layers.some(x=>x.name===ln)) problem(where+'：未知图层「'+ln+'」');
    checkLedger(where,c);
  };
  const seenCreateCodes=new Set();
  rows.slice(1).forEach((r,i)=>{
    const lineNo=i+2;
    if(!r.some(v=>String(v??'').trim()!=='')) return;
    const c=name=>cell(r,name);
    const code=c('编号');
    const opRaw=c('操作');
    const rowFloor=c('楼层');
    let ctx=current;
    if(rowFloor){
      const f=floorByName.get(rowFloor);
      if(!f){ problem('第 '+lineNo+' 行'+(code?'（编号 '+code+'）':'')+'：未知楼层「'+rowFloor+'」，已跳过'); return; }
      ctx=f;
    }
    const where='第 '+lineNo+' 行'+(code?'（编号 '+code+'）':'')+(rowFloor?'［楼层 '+rowFloor+'］':'');
    checkBool(where,c);
    const floorCodes=codeMaps.get(ctx.id);
    /* IO-P2-9：目标楼层 objects 不是数组时拒绝该行，绝不回退到当前楼层写入 */
    if(floorCodes===null){ problem(where+'：目标楼层「'+ctx.name+'」的对象数据异常（objects 不是数组），已跳过该行'); return; }
    let op=TABLE_OP_BY_LABEL[opRaw]||'';
    if(opRaw&&!op){ problem(where+'：操作「'+opRaw+'」无法识别（可用：新增 / 更新 / 替换）'); return; }
    if(!op){
      /* 无「操作」列时保持旧行为：编号命中→更新，否则→新增；出现匹配条件列则视为替换 */
      if(rowConditionCount(c)>0) op='replace';
      else if(code&&floorCodes&&floorCodes.has(code)) op='update';
      else op='create';
    }
    if(op==='replace'){
      if(!rowConditionCount(c)){ problem(where+'：替换行缺少匹配条件（至少填一项「匹配…」列）'); return; }
      const scope=rowFloor?[ctx]:floors;
      const matched=scope.flatMap(objectsOf).filter(o=>rowMatchesObject(o,c));
      if(!matched.length) warnings.push(where+'：没有匹配到任何对象，已跳过');
      else{
        checkTargets(where,c,matched);
        replaces.push({objs:matched,cell:c,floorId:ctx.id});
      }
      return;
    }
    if(op==='update'){
      if(!code){ problem(where+'：更新行缺少「编号」'); return; }
      if(!floorCodes||!floorCodes.has(code)){
        const other=floors.find(f=>f.id!==ctx.id&&codeMaps.get(f.id)&&codeMaps.get(f.id).has(code));
        problem(other?where+'：编号「'+code+'」只存在于楼层「'+other.name+'」，请把「楼层」写成该层'
                    :where+'：编号「'+code+'」在当前'+(rowFloor?'楼层「'+rowFloor+'」':'楼层')+'不存在');
        return;
      }
      const obj=floorCodes.get(code);
      /* IO-P2-8：形状列参数非法时提前告警；applyRowShape 先校验后写入，失败不会留下半套几何 */
      const shapeLabel=c('形状');
      if(obj.kind==='rect'&&shapeLabel){
        const sx=tableNum(c('X')), sy=tableNum(c('Y')), sa=tableNum(c('角度'));
        const probe=deepClone(obj);
        if(!applyRowShape(probe,shapeLabel,{x:Number.isFinite(sx)?sx:obj.x,y:Number.isFinite(sy)?sy:obj.y,
            w:tableNum(c('宽度')),h:tableNum(c('高度')),angle:Number.isFinite(sa)?sa:obj.angle,params:parseShapeParams(c('形状参数'))}))
          warnings.push(where+'：形状「'+shapeLabel+'」参数非法（宽度/高度需>0），已保留原几何');
      }
      check(where,c,previewGeomCandidate(obj,c));
      checkTargets(where,c,[obj]);
      updates.push({obj,cell:c,floorId:ctx.id});
      return;
    }
    /* 新增：编号只用于防重（对象名仍由统一编号作用域生成，与旧导出模板一致） */
    if(code){
      const conflict=floors.find(f=>codeMaps.get(f.id)&&codeMaps.get(f.id).has(code));
      if(conflict){ problem(where+'：新增行编号「'+code+'」已存在于楼层「'+conflict.name+'」'); return; }
      const key=ctx.id+'|'+code;
      if(seenCreateCodes.has(key)){ problem(where+'：本批新增行编号「'+code+'」重复'); return; }
      seenCreateCodes.add(key);
    }
    const kind=TABLE_KIND_BY_NAME[cell(r,'对象类型')];
    if(!kind){ problem(where+'：对象类型「'+(cell(r,'对象类型')||'空')+'」无法识别，已跳过'); return; }
    const x=tableNum(c('X')), y=tableNum(c('Y'));
    /* 折线/尺寸标注：从「节点坐标」列重建（基点 X/Y 取首节点）；无坐标列无法新建 */
    if(kind==='line'||kind==='dimension'){
      const pts=parseNodeCoords(c('节点坐标'));
      const subtype=kind==='dimension'?(DIM_SUB_BY_LABEL[c('标注类型')]||'distance'):'';
      const minPts=(kind==='dimension'&&subtype!=='ruler'&&subtype!=='distance')?3:2;
      if(pts.length<minPts){
        problem(where+'：缺少有效「节点坐标」（格式 x,y;x,y;…，'+kindName(kind)+'至少 '+minPts+' 点），无法新建，已跳过');
        return;
      }
      const closed=kind==='line'&&tableBool(c('闭合'));
      if(closed&&pts.length<3){ warnings.push(where+'：闭合折线至少需要 3 个节点，已按开放折线处理'); }
      const cr={kind,x,y,closed:closed&&pts.length>=3,subtype,points:pts,cell:c,floorId:ctx.id};
      const cnd=baseObject(kind,null,{name:'__表格校验__'});
      cnd.points=pts;
      if(kind==='line') cnd.closed=cr.closed; else cnd.subtype=subtype;
      syncFirstPoint(cnd);
      check(where,c,cnd);
      checkTargets(where,c,[cnd]);
      creates.push(cr);
      return;
    }
    if(!Number.isFinite(x)||!Number.isFinite(y)){ problem(where+'：缺少有效 X/Y 坐标，已跳过'); return; }
    if(kind==='rect'){
      /* 形状列决定尺寸校验：矩形/椭圆要宽+高；圆/扇形只要直径（宽度列） */
      const shape=AREA_SHAPE_BY_LABEL[c('形状')]||'rect';
      const w=tableNum(c('宽度')), h=tableNum(c('高度'));
      const needH=shape==='rect'||shape===ELL;
      if(!(w>0)||(needH&&!(h>0))){
        problem(where+'：'+AREA_SHAPE_LABELS[shape]+'缺少有效宽度'+(needH?'/高度':'')+'，已跳过');
        return;
      }
      const cnd=baseObject(kind,null,{name:'__表格校验__'});
      applyRowShape(cnd,AREA_SHAPE_LABELS[shape],{x,y,w,h,angle:tableNum(c('角度')),params:parseShapeParams(c('形状参数'))});
      check(where,c,cnd);
      checkTargets(where,c,[cnd]);
      creates.push({kind,x,y,shape,cell:c,floorId:ctx.id});
      return;
    }
    check(where,c,baseObject(kind,null,{name:'__表格校验__'}));   /* 点设备/文字：长度面积应为空或 0 */
    checkTargets(where,c,[{kind}]);
    creates.push({kind,x,y,cell:c,floorId:ctx.id});
  });
  return {updates,creates,replaces,warnings,errors,strict};
}
function showTableImportPreview(fileName,plan){
  /* 严格模式（含「操作」列）出现非法行时整批不生效，预览不提供「合并导入」 */
  if(plan.errors&&plan.errors.length){
    openModal(L('无法导入（整批未生效）：{name}',{name:fileName}),
      '<div style="max-height:240px;overflow:auto;margin:10px 0">'.concat(
        plan.errors.slice(0,50).map(w=>'<div class="issue">'+esc(w)+'</div>').join(''),
        plan.errors.length>50?'<p class="hint-text">'+esc(L('其余错误略 {n}',{n:plan.errors.length-50}))+'</p>':'',
        '</div><p class="hint-text">'+esc(L('存在非法行，整批取消导入；修正后重新导入即可，现有对象未被修改。'))+'</p>'),
      [{text:L('知道了'),class:'primary',click:closeModal}]);
    return;
  }
  const replaceCount=(plan.replaces||[]).reduce((n,r)=>n+r.objs.length,0);
  if(!plan.updates.length&&!plan.creates.length&&!replaceCount&&plan.warnings.length){
    openModal(L('无法导入：{name}',{name:fileName}),'<div class="issue">'+plan.warnings.slice(0,10).map(esc).join('</div><div class="issue">')+'</div>',
      [{text:L('知道了'),class:'primary',click:closeModal}]);
    return;
  }
  const warnHtml=plan.warnings.length
    ? '<div style="max-height:190px;overflow:auto;margin:10px 0">'+plan.warnings.slice(0,50).map(w=>'<div class="issue">'+esc(w)+'</div>').join('')+
      (plan.warnings.length>50?'<p class="hint-text">'+esc(L('其余提示略 {n}',{n:plan.warnings.length-50}))+'</p>':'')+'</div>'
    : `<div class="ok-banner">${esc(L('全部行均可导入。'))}</div>`;
  const countLine='<p style="line-height:1.7">'+esc(L('按「编号」更新 / 「匹配…」条件批量替换 / 无编号行新增：'))+
    '<b>'+plan.updates.length+'</b> '+esc(L('项更新、'))+
    '<b>'+replaceCount+'</b> '+esc(L('个对象替换（'))+'<b>'+(plan.replaces||[]).length+'</b> '+esc(L('行条件）、'))+
    '<b>'+plan.creates.length+'</b> '+esc(L('项新增。'))+'</p>';
  openModal(L('表格导入预览：{name}',{name:fileName}),
    countLine+
    '<p class="hint-text">'+esc(L(TXT_TABLE_IMPORT_HINT))+'<b>'+esc(L(TXT_TABLE_AUTO_HINT))+'</b>'+esc(L('建议导入前先导出 JSON 备份。'))+'</p>'+warnHtml,
    [{text:L('取消'),click:closeModal},
     {text:L('合并导入'),class:'primary',click:()=>{closeModal();applyTableImport(plan);}}]);
}
function applyTableImport(plan){
  if(!guardWrite(L('导入'))) return;
  if(plan.errors&&plan.errors.length){ toast(L('表格导入失败：存在非法行，已整批取消'),'error'); return; }
  const limitErrs=importLimitErrors({objects:countProjectObjects(state)+(plan.creates||[]).length});
  if(limitErrs.length){ toast(L('表格导入失败：{msg}',{msg:importLimitMessage(limitErrs)}),'error'); return; }
  /* 事务化：先留快照；任何意外异常都回到导入前现场，不留半批对象/属性 */
  const backup=snapshotHistoryState(state), prevFuture=history.future;
  pushHistory();
  try{
    syncActiveFloor();
    const floorObjects=new Map((state.floors||[]).map(f=>[f.id,Array.isArray(f.objects)?f.objects:null]));
    let updated=0,created=0,replaced=0;
    plan.updates.forEach(u=>{
      const o=u.obj,c=u.cell;
      const name=c('名称'); if(name!=='') o.text=name;
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
      applyTableCommonCells(o,c);
      o.updatedAt=nowISO(); updated++;
    });
    /* 条件批量替换：只改属性，几何保持不变；每条条件行命中的对象都已写入 updatedAt */
    (plan.replaces||[]).forEach(rp=>{
      const c=rp.cell;
      rp.objs.forEach(o=>{
        const name=c('名称'); if(name!=='') o.text=name;
        applyTableCommonCells(o,c);
        o.updatedAt=nowISO(); replaced++;
      });
    });
    /* 批量新增行统一建立编号作用域，避免逐行 baseObject → nextObjectId 全量扫描（O(N²)） */
    withObjectNameScope(allObjectNames(), () => plan.creates.forEach(cr=>{
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
      applyTableCommonCells(o,c);
      const target=cr.floorId&&cr.floorId!==state.activeFloorId?floorObjects.get(cr.floorId):null;
      const list=target||state.objects;
      o.z=list.length;
      list.push(o); created++;
    }));
    selectedIds.clear();
    commitChange(L('表格导入完成：更新 {updated} 项，替换 {replaced} 个对象，新增 {created} 项',
      {updated,replaced,created}));
  }catch(err){
    /* 导入异常回滚：走统一入口补上叠放缓存/静态层/取景基准与 UI 刷新 */
    replaceState(materializeHistoryState(backup),{fit:false});
    if(history.past.length) history.past.pop();
    history.future=prevFuture;
    selectedIds.clear();
    requestRender(); updateHistoryButtons();
    toast('表格导入失败（已回滚）：'+(err&&err.message||err),'error');
  }
}
