/* props.js —— 属性面板：逐对象参数、场地属性、标注开关、节点编辑器与批量属性 */
/* -------------------- 属性面板 -------------------- */
/** 折线/标注节点编辑器：坐标精确输入；折线可逐节点插入(＋)/删除(×)/↑↓排序，或拖抓手排序 */
function renderNodeEditor(o){
  const canEdit=isPolylineEditable(o);
  const min=canEdit?lineMinNodes(o):0;
  const n=(o.points||[]).length;
  const rows=(o.points||[]).map((p,i)=>`
    <div class="node-row" data-node-row="${i}" ${canEdit?'':''}>
      ${canEdit?`<span class="node-grip" draggable="true" data-node-grip="${i}" title="${esc(L('拖拽调整节点顺序'))}">⠿</span>`:'<span class="node-idx">#</span>'}
      <span class="node-idx">${i+1}</span>
      <input type="number" step="0.1" title="${esc(L('节点 X（米，可为负）'))}" data-node-axis="x" data-node-index="${i}" value="${fmt(p[0])}">
      <input type="number" step="0.1" title="${esc(L('节点 Y（米，可为负）'))}" data-node-axis="y" data-node-index="${i}" value="${fmt(p[1])}">
      ${canEdit?`<button type="button" class="icon-btn" data-node-up="${i}" title="${esc(L('上移节点'))}" aria-label="${esc(L('上移节点'))}" ${i===0?'disabled':''}>↑</button>
      <button type="button" class="icon-btn" data-node-down="${i}" title="${esc(L('下移节点'))}" aria-label="${esc(L('下移节点'))}" ${i===n-1?'disabled':''}>↓</button>
      <button type="button" class="icon-btn" data-node-add="${i}" title="${esc(L('在此节点后插入一个节点'))}" aria-label="${esc(L('在此节点后插入一个节点'))}">＋</button>
      <button type="button" class="icon-btn danger" data-node-del="${i}" title="${esc(L('删除该节点'))}" aria-label="${esc(L('删除该节点'))}" ${n<=min?'disabled':''}>×</button>`:''}
    </div>`).join('');
  const shapeName=o.kind==='dimension'?'测距链':(o.closed?'闭合区域':'开放折线');
  const hint=canEdit
    ? `<div class="hint-text">${esc(L('共'))} ${n} ${esc(L('点'))}（${esc(L(shapeName))} ${esc(L('至少'))} ${min} ${esc(L('点'))}）；${esc(L('拖 ⠿ 或 ↑↓ 调整顺序；画布上双击线段插入节点、双击节点删除'))}</div>`
    : `<div class="hint-text">${esc(L('共'))} ${n} ${esc(L('点'))}；${esc(L('可在画布上拖节点手柄调整位置'))}</div>`;
  /* span2：节点列表需跨满 form-grid 两列，否则会被压进 78px 的标签列导致坐标输入框仅剩几十像素 */
  return `<div class="node-list span2">${rows}${hint}</div>`;
}
/**
 * 逐对象「图上标注」开关组（跨满两列）：点设备=编号/点坐标；区域=编号/基点/半径/边长/顶点/周长/面积；
 * 折线=编号/节点(闭合即顶点)/段长/周长/面积（开放折线去掉面积）。未显式设置的键按类型默认值；与全局总开关（段长度/图上面积）叠加生效。
 * 区域按形状过滤无意义的开关：矩形/平行四边形给「边长/顶点坐标」不给「半径」；圆/椭圆/扇形给「半径」不给「边长/顶点坐标」。
 */
function annotToggleKeys(o){
  const keys=annotKeys(o.kind);
  if(o.kind==='rect'){
    const tt=areaShapeType(o);
    /* 矩形/平行四边形：有边长与顶点坐标、无半径；圆/椭圆/扇形反之 */
    return (tt==='rect'||tt==='parallelogram') ? keys.filter(k=>k!=='radius') : keys.filter(k=>k!=='edge'&&k!=='vertex');
  }
  /* 开放折线无面积概念：不提供「面积」开关，避免出现勾选后无任何效果的无效配置 */
  if(o.kind==='line' && !o.closed) return keys.filter(k=>k!=='area');
  return keys;
}
function renderAnnotToggles(o){
  const keys=annotToggleKeys(o);
  if(!keys.length) return '';
  const chks=keys.map(k=>`<label class="annot-chk" title="${esc(L('在图上显示'))} ${esc(L(annotLabel(o,k)))}"><input type="checkbox" data-annot="${k}" ${annotOn(o,k)?'checked':''}> ${esc(L(annotLabel(o,k)))}</label>`).join('');
  return `<label class="span2">${esc(L('图上标注'))}</label><div class="annot-chks span2">${chks}</div>`;
}
/* -------------------- 场地属性 / 场地节点编辑 -------------------- */
/**
 * 场地/底图属性面板 HTML（纯函数，便于逻辑层自测）。
 * mode='default'：未选中任何对象时显示「场地属性」；mode='tool'：「场地节点」工具下显示并给出画布拖拽提示。
 * 矢量场地按形状提供可编辑坐标/参数（世界坐标米，可为负）；图片底图给出底图摘要与比例尺/仿射校准入口。
 */
function sitePropsHTML(bg, mode){
  bg=bg||state.background;
  const tool=mode==='tool';
  const heading=tool?'场地节点':'场地属性';
  if(!bg) return `<div class="section"><h3>${esc(L(heading))}</h3><div class="prop-empty">${esc(L('尚未设置底图/场地，请点顶部「底图/场地」上传图片或绘制矢量场地。'))}</div></div>`;
  if(bg.kind==='image'){
    if(tool) return `<div class="section"><h3>${esc(L('场地节点'))} <span class="hint-text">${esc(L('图片底图'))}</span></h3><div class="prop-empty">${esc(L('当前为图片底图，暂无场地节点可编辑。'))}<br><br>${esc(L('请先在「底图」弹窗中切换为矩形/圆形/椭圆/扇形/平行四边形/多边形矢量场地；图片底图请改用「仿射校准」。'))}</div></div>`;
    return imagePropsHTML(bg, heading);
  }
  const sh=bg.shape||{};
  const fv=(v,fb=0)=>{ const n=Number(v); return fmt(Number.isFinite(n)?n:fb); };
  const num=(field,val,step=.1)=>`<input type="number" step="${step}" data-site-field="${field}" value="${val}">`;
  const row=(label,inner)=>`<label>${esc(L(label))}</label><div>${inner}</div>`;
  let params='';
  if(sh.type==='polygon'){
    const pts=sh.points||[];
    /* span2：节点列表需跨满 form-grid 两列（否则会被压进 78px 的标签列） */
    params=`<div class="node-list span2">${pts.map((p,i)=>`
      <div class="node-row vtx" data-site-node-row="${i}">
        <span class="node-idx">${i+1}</span>
        <input type="number" step="0.1" title="${esc(L('顶点 X（米，可为负）'))}" data-site-node-axis="x" data-site-node-index="${i}" value="${fv(p[0])}">
        <input type="number" step="0.1" title="${esc(L('顶点 Y（米，可为负）'))}" data-site-node-axis="y" data-site-node-index="${i}" value="${fv(p[1])}">
        <button type="button" class="icon-btn" data-site-node-up="${i}" title="${esc(L('上移顶点'))}" ${i===0?'disabled':''}>↑</button>
        <button type="button" class="icon-btn" data-site-node-down="${i}" title="${esc(L('下移顶点'))}" ${i===pts.length-1?'disabled':''}>↓</button>
        <button type="button" class="icon-btn" data-site-node-add="${i}" title="${esc(L('在此顶点后插入一个顶点'))}">＋</button>
        <button type="button" class="icon-btn danger" data-site-node-del="${i}" title="${esc(L('删除该顶点'))}" ${pts.length<=3?'disabled':''}>×</button>
      </div>`).join('')}
      <div class="hint-text">${esc(L('共'))} ${pts.length} ${esc(L('个顶点'))}（${esc(L('至少'))} 3）；${esc(L('画布上双击边插入顶点、双击顶点删除'))}</div>
    </div>`;
  }else if(sh.type==='circle'){
    params=`${row('圆心 X',num('cx',fv(sh.cx)))}${row('圆心 Y',num('cy',fv(sh.cy)))}${row('半径 (m)',num('r',fv(sh.r,50)))}`;
  }else if(sh.type==='ellipse'){
    params=`${row('中心 X',num('cx',fv(sh.cx)))}${row('中心 Y',num('cy',fv(sh.cy)))}
      ${row('半径X (m)',num('rx',fv(sh.rx,50)))}${row('半径Y (m)',num('ry',fv(sh.ry,35)))}
      ${row('旋转角',num('angle',Math.round(Number(sh.angle)||0),1))}`;
  }else if(sh.type==='sector'){
    params=`${row('圆心 X',num('cx',fv(sh.cx)))}${row('圆心 Y',num('cy',fv(sh.cy)))}${row('半径 (m)',num('r',fv(sh.r,50)))}
      ${row('起始角',num('a0',Math.round(Number(sh.a0)||0),1))}${row('张角 (0–360)',num('sweep',Math.round(sectorSweep(sh)),1))}`;
  }else if(sh.type==='parallelogram'){
    params=`${row('基点 X',num('x',fv(sh.x)))}${row('基点 Y',num('y',fv(sh.y)))}
      ${row('宽度 (m)',num('w',fv(sh.w,100)))}${row('高度 (m)',num('h',fv(sh.h,70)))}
      ${row('倾角 (°)',num('skew',Math.round(Number(sh.skew)||0),1))}`;
  }else{
    params=`${row('基点 X',num('x',fv(sh.x)))}${row('基点 Y',num('y',fv(sh.y)))}
      ${row('宽度 (m)',num('w',fv(sh.w,100)))}${row('高度 (m)',num('h',fv(sh.h,70)))}`;
  }
  const ap=siteAreaPerimeter(bg);
  const hint=tool
    ?'拖拽画布上的控制点即可调整场地；也可在此输入精确坐标/参数。坐标按世界坐标（米），可为负；场地随底图保持真实比例。'
    :'直接修改下方坐标/参数即可调整场地；点左侧「⊗ 场地节点」工具可在画布上拖拽控制点。坐标按世界坐标（米），可为负。';
  return `<div class="section"><h3>${esc(L(heading))} <span class="hint-text">${esc(L(siteKindName(bg.kind)))}</span></h3>
    <div class="form-grid">${params}</div>
    <div class="form-grid">
      <label>${esc(L('面积'))}</label><div><b id="siteAreaVal">${fmt(ap.area)}</b> ㎡</div>
      <label>${esc(L('周长'))}</label><div><b id="sitePerimVal">${fmt(ap.perimeter)}</b> m</div>
    </div>
    <div class="hint-text">${esc(L(hint))}</div>
    ${tool?'':`<div class="hint-text">${esc(L('提示：单击对象可在此编辑其属性；框选可批量选择；Delete 删除；Ctrl+Z 撤销。'))}</div>`}
  </div>`;
}
/** 图片底图属性摘要（含比例尺/仿射校准入口）；实测范围为其外接矩形 */
function imagePropsHTML(bg, heading){
  const d=siteDomainOf(bg);
  const cal=L(bg.calibrated?'已校准':'未校准');
  const rot=L(bg.transform?'已校正倾斜':'轴对齐');
  return `<div class="section"><h3>${esc(L(heading))} <span class="hint-text">${esc(L('图片底图'))}</span></h3>
    <div class="form-grid">
      <label>${esc(L('名称'))}</label><div>${esc(bg.fileName||L('未命名'))}</div>
      <label>${esc(L('像素'))}</label><div>${bg.width}×${bg.height} px</div>
      <label>${esc(L('比例'))}</label><div>${fmt(bg.metersPerPixel)} m/px</div>
      <label>${esc(L('校准'))}</label><div>${cal} ｜ ${rot}</div>
      <label>${esc(L('实测范围'))}</label><div>${fmt(d.w)}×${fmt(d.h)} m${esc(L('（外接矩形）'))}</div>
    </div>
    <div class="form-grid">
      <button class="primary" id="siteOpenBtn" title="${esc(L('上传图片底图，或改画矢量场地'))}">${esc(L('底图/场地…'))}</button>
      <button id="siteCalibBtn" title="${esc(L('仅图片底图需要：指定两点实际距离校准米/像素'))}">${esc(L('比例尺校准'))}</button>
      <button id="siteAffineBtn" title="${esc(L('在图上依次点击已知点并输入实地坐标，纠正倾斜与不等比缩放'))}">${esc(L('仿射校准'))}</button>
    </div>
    <div class="hint-text">${esc(L('图片以像素×比例尺映射到世界坐标；如需精确贴合请用「比例尺校准」或「仿射校准」。'))}</div>
  </div>`;
}
/** 渲染场地/底图属性面板并按 mode 绑定事件（default=未选中对象时的场地属性；tool=场地节点工具） */
function renderSiteProps(box, mode){
  box.innerHTML=sitePropsHTML(state.background, mode||'default');
  bindSiteNodeEvents(box);
}
function updateSiteStats(box){
  const ap=siteAreaPerimeter(state.background);
  const a=box.querySelector('#siteAreaVal'), p=box.querySelector('#sitePerimVal');
  if(a) a.textContent=fmt(ap.area);
  if(p) p.textContent=fmt(ap.perimeter);
}
function bindSiteNodeEvents(box){
  box.addEventListener('focusin',()=>pushHistory(),{once:true});
  const changed=()=>{ state.meta.updatedAt=nowISO(); coverageResult=null; syncFramePan(); updateSiteStats(box); scheduleSave(); requestRender(); };
  box.querySelectorAll('[data-site-field]').forEach(el=>el.addEventListener('input',()=>{
    if(applySiteField(el.dataset.siteField,el.value)) changed();
  }));
  box.querySelectorAll('[data-site-node-axis]').forEach(el=>el.addEventListener('input',()=>{
    const pts=state.background.shape?.points, i=Number(el.dataset.siteNodeIndex), n=Number(el.value);
    if(!pts||i<0||i>=pts.length||!Number.isFinite(n)) return;
    pts[i][el.dataset.siteNodeAxis==='y'?1:0]=n; changed();
  }));
  box.querySelectorAll('[data-site-node-add]').forEach(b=>b.onclick=()=>siteInsertNode(Number(b.dataset.siteNodeAdd)));
  box.querySelectorAll('[data-site-node-del]').forEach(b=>b.onclick=()=>siteRemoveNode(Number(b.dataset.siteNodeDel)));
  box.querySelectorAll('[data-site-node-up]').forEach(b=>b.onclick=()=>siteMoveNode(Number(b.dataset.siteNodeUp),-1));
  box.querySelectorAll('[data-site-node-down]').forEach(b=>b.onclick=()=>siteMoveNode(Number(b.dataset.siteNodeDown),1));
  /* 图片底图属性面板的入口按钮：复用顶部同名按钮的处理逻辑 */
  const openB=box.querySelector('#siteOpenBtn'); if(openB) openB.onclick=()=>openSitePicker();
  const calB=box.querySelector('#siteCalibBtn'); if(calB) calB.onclick=()=>$('calibBtn').click();
  const affB=box.querySelector('#siteAffineBtn'); if(affB) affB.onclick=()=>$('affineBtn').click();
}
function applySiteField(field,v){
  const sh=state.background.shape; if(!sh) return false;
  const n=Number(v); if(!Number.isFinite(n)) return false;
  if(field==='a0') sh.a0=normalizeAngle(n);
  else if(field==='angle') sh.angle=normalizeAngle(n);
  else if(field==='sweep') sh.a1=(Number(sh.a0)||0)+Math.min(360,Math.max(1,n));
  else if(field==='skew') sh.skew=Math.max(-PARALLELOGRAM_MAX_SKEW,Math.min(PARALLELOGRAM_MAX_SKEW,n));
  else if(['w','h','r','rx','ry'].includes(field)) sh[field]=Math.max(.05,n);
  else if(['x','y','cx','cy'].includes(field)) sh[field]=n;
  return true;
}
/* 场地多边形顶点增删排序（闭合环；操作后同步取景框并提交） */
function siteInsertNode(at){
  const pts=state.background.shape?.points; if(!pts) return;
  const a=pts[at], c=pts[(at+1)%pts.length];
  pushHistory();
  pts.splice(Math.min(at+1,pts.length),0,[(a[0]+c[0])/2,(a[1]+c[1])/2]);
  syncFramePan(); commitChange('已插入场地顶点');
}
function siteRemoveNode(i){
  const pts=state.background.shape?.points; if(!pts) return;
  if(pts.length<=3) return toast('多边形场地至少保留 3 个顶点','warn');
  pushHistory(); pts.splice(i,1); syncFramePan(); commitChange('已删除场地顶点');
}
function siteMoveNode(i,dir){
  const pts=state.background.shape?.points; if(!pts) return;
  const to=i+(dir<0?-1:1);
  if(to<0||to>=pts.length) return;
  pushHistory();
  const p=pts.splice(i,1)[0]; pts.splice(to,0,p);
  syncFramePan(); commitChange('场地顶点顺序已调整');
}
function renderProps(){
  const box=$('propPanel');
  if(currentTool==='site-node'){ renderSiteProps(box,'tool'); return; }
  const objs=state.objects.filter(o=>selectedIds.has(o.id));
  if(!objs.length){ renderSiteProps(box,'default'); return; }
  if(objs.length>1){ renderMultiProps(box,objs); return; }
  const o=objs[0], t=getType(o.typeId);
  const row=(label,inner)=>`<label>${esc(L(label))}</label><div>${inner}</div>`;
  const num=(field,val,step=.1)=>`<input type="number" step="${step}" data-field="${field}" value="${val}">`;
  const txt=(field,val)=>`<input type="text" data-field="${field}" value="${esc(val||'')}">`;
  const layerSel=`<select data-field="layerId">${state.layers.map(l=>`<option value="${esc(l.id)}" ${l.id===o.layerId?'selected':''}>${esc(l.name)}</option>`).join('')}</select>`;
  let typeSel='';
  if(['point','rect','line'].includes(o.kind)){
    typeSel=`<select data-field="typeId">${typesOfKind(o.kind).map(x=>`<option value="${esc(x.id)}" ${x.id===o.typeId?'selected':''}>${esc(typeDisplayName(x))}</option>`).join('')}</select>`;
  }else typeSel=`<input value="${esc(L(kindName(o.kind)))}" disabled>`;
  let specific='';
  if(o.kind==='rect'){
    const stt=areaShapeType(o), sh=o.shape||{};
    const shapeSel=`<select data-field="shapeType">${AREA_SHAPE_TYPES.map(x=>`<option value="${x}" ${x===stt?'selected':''}>${esc(L(({rect:'矩形',circle:'圆形',ellipse:'椭圆',sector:'扇形（饼形）',parallelogram:'平行四边形'})[x]))}</option>`).join('')}</select>`;
    /* 基点即渲染/命中/拖拽共用的锚点 (o.x,o.y)：矩形/平行四边形=基点(左下角，旋转中心)，圆/椭圆/扇形=圆心 */
    const baseName=({rect:'基点',circle:'圆心',ellipse:'中心',sector:'圆心',parallelogram:'基点'})[stt];
    const baseRows=`${row(baseName+' X',num('x',fmt(o.x)))}${row(baseName+' Y',num('y',fmt(o.y)))}`;
    let params='';
    if(stt==='rect'||stt==='parallelogram'){
      params=`${baseRows}
        ${row('宽度',num('width',fmt(o.width)))}${row('高度',num('height',fmt(o.height)))}
        ${row('旋转角',num('angle',Math.round(o.angle),1))}
        ${stt==='parallelogram'?row('倾角 (°)',num('shapeSkew',Math.round(parallelogramSkew(sh)),1)):''}`;
    }else if(stt==='circle'){
      params=`${baseRows}${row('半径 (m)',num('shapeR',fmt(sh.r)))}`;
    }else if(stt==='ellipse'){
      params=`${baseRows}${row('半径X (m)',num('shapeRx',fmt(sh.rx)))}${row('半径Y (m)',num('shapeRy',fmt(sh.ry)))}
        ${row('旋转角',num('angle',Math.round(o.angle),1))}`;
    }else{
      params=`${baseRows}${row('半径 (m)',num('shapeR',fmt(sh.r)))}
        ${row('起始角',num('shapeA0',Math.round(Number(sh.a0)||0),1))}
        ${row('张角 (0–360)',num('shapeSweep',Math.round(sectorSweep(sh)),1))}`;
    }
    specific=`
      ${row('形状',shapeSel)}${params}
      ${row('面积',`<b>${fmt(shapeArea(o))}</b> ㎡`)}${row('周长',`<b>${fmt(shapePerimeter(o))}</b> m`)}
      ${row('填充色',`<input type="color" data-style="color" value="${o.style.color||t.color}"> <label style="display:inline"><input type="checkbox" data-style="noFill" ${styleVal(o,'fillAlpha',.15)==0?'checked':''}>${esc(L('透明'))}</label>`)}
      ${row('透明度',`<input type="range" min="0" max="1" step=".01" data-style="fillAlpha" value="${styleVal(o,'fillAlpha',.15)}">`)}
      ${row('线宽',`<input type="number" step=".01" data-style="strokeWidth" value="${fmt(styleVal(o,'strokeWidth',.1))}">`)}
      ${renderAnnotToggles(o)}
      <div class="hint-text span2" style="grid-column:1/-1">${esc(L(stt==='rect'||stt==='parallelogram'?'基点为图形左下角，也是旋转中心；平行四边形面积=底×高，倾角只改变斜边不改变面积；':'圆心/中心即形状基点（画布上以 ⊕ 标出），移动图形即移动基点；'))}${esc(L('坐标按世界坐标（米），可为负；区域随底图保持真实比例。三角形/任意多边形请用「折线」工具勾选「闭合区域」。'))}</div>`;
  }else if(o.kind==='line'||o.kind==='dimension'){
    specific=`
      ${o.kind==='line'?row('闭合',`<input type="checkbox" data-field="closed" ${o.closed?'checked':''}>`):''}
      ${row('颜色',`<input type="color" data-style="color" value="${o.style.color||(o.kind==='dimension'?'#111827':t.color)}">`)}
      ${o.kind==='line'?row('线宽',`<input type="number" step=".01" data-style="strokeWidth" value="${fmt(styleVal(o,'strokeWidth',.1))}">`):''}
      ${o.closed?row('面积',`<b>${fmt(polygonArea(o.points))}</b> ㎡`):''}
      ${o.closed?row('周长',`<b>${fmt(objectLength(o))}</b> m${esc(L('（含闭合边）'))}`):''}
      ${renderAnnotToggles(o)}
      <label class="span2">${esc(L('节点'))}</label>${renderNodeEditor(o)}`;
  }else if(o.kind==='point'){
    const psh=t.scaleShape||'none';
    const canScale=psh!=='none';
    const physHint=canScale
      ? `<div class="hint-text span2" style="grid-column:1/-1">${esc(L('该类型按「'))}${esc(L(POINT_SCALE_SHAPES[psh]))}${esc(L('」渲染：填 0 为纯位置图标；填'))}${esc(L(psh==='bar'?'杆长':psh==='sector'?'视场半径':'直径'))}${esc(L('（米）后随底图真实比例缩放'))}${psh==='sector'?esc(L('，张角 '))+(''+(t.fov||90))+esc(L('°，朝向随朝向角')):''}</div>`
      : `<div class="hint-text span2" style="grid-column:1/-1">${esc(L('该类型仅标识位置（屏幕固定图标）。如需与底图成比例的覆盖范围，请在「图层/类型」中改用圆/方/扇形/杆型点类型。'))}</div>`;
    specific=`${row('X 坐标',num('x',fmt(o.x)))}${row('Y 坐标',num('y',fmt(o.y)))}${row('朝向角',num('angle',Math.round(o.angle),1))}
      ${row('型号',txt('propModel',o.props.model))}${row('安装高度 (m)',num('propMountHeight',o.props.mountHeight===undefined?'':o.props.mountHeight))}
      ${row('IP',txt('propIp',o.props.ip))}${row('责任人',txt('propOwner',o.props.owner))}
      ${row('照片',`<input type="file" accept="image/*" data-photo-input><button type="button" class="icon-btn danger" data-photo-clear title="${esc(L('移除照片'))}" ${o.props.photoId?'':'disabled'}>×</button>`)}
      ${o.props.photoId?`<div class="span2" style="grid-column:1/-1"><img data-photo-img="${esc(o.props.photoId)}" alt="${esc(L('设备照片'))}" style="max-width:100%;max-height:160px;border-radius:4px;border:1px solid #334155"></div>`:''}
      ${row('图标大小',`<input type="range" min=".5" max="3" step=".05" data-field="iconSize" value="${Number(o.iconSize)||1}"><span class="hint-text">${(Number(o.iconSize)||1).toFixed(2)}×（${esc(L('顶栏还有全局点大小'))}）</span>`)}
      ${canScale?row('物理尺寸(m)',`<input type="number" min="0" step=".1" data-field="phys" value="${fmt(o.phys||0)}">`):''}${physHint}
      ${renderAnnotToggles(o)}`;
  }else if(o.kind==='text'){
    specific=`${row('文字',`<input type="text" data-field="text" value="${esc(o.text||'')}">`)}
      ${row('X 坐标',num('x',fmt(o.x)))}${row('Y 坐标',num('y',fmt(o.y)))}
      ${row('字高(m)',num('height',fmt(o.height),.05))}${row('旋转角',num('angle',Math.round(o.angle),1))}
      ${row('颜色',`<input type="color" data-style="color" value="${o.style.color||t.color}">`)}`;
  }
  const props=Object.entries(o.props||{}).map(([k,v],i)=>`<div class="custom-prop"><input value="${esc(k)}" data-prop-key="${i}"><input value="${esc(v)}" data-prop-val="${i}"><button class="icon-btn" data-prop-del="${i}" aria-label="${esc(L('删除'))}">×</button></div>`).join('');
  box.innerHTML=`
    <div class="section"><h3>${esc(L('对象属性'))} <span class="hint-text">${esc(o.name)}</span></h3>
      <div class="form-grid">
        ${row('编号',txt('name',o.name))}${row('类型',typeSel)}${row('图层',layerSel)}${specific}
      </div>
      <div class="form-actions">
        <button class="mini" data-action="duplicate">${esc(L('复制'))}</button>
        <button class="mini" data-action="raise">${esc(L('上移一层'))}</button>
        <button class="mini" data-action="lower">${esc(L('下移一层'))}</button>
        <button class="mini" data-action="visibility">${esc(L(o.visible?'隐藏':'显示'))}</button>
        <button class="mini" data-action="lock">${esc(L(o.locked?'解锁':'锁定'))}</button>
        <button class="mini danger" data-action="delete">${esc(L('删除'))}</button>
      </div>
    </div>
    <div class="section"><h3>${esc(L('自定义属性'))}</h3>
      ${props||`<div class="hint-text">${esc(L('暂无自定义属性'))}</div>`}
      <div class="custom-prop" style="margin-top:7px"><input id="propKey" placeholder="${esc(L('键'))}"><input id="propValue" placeholder="${esc(L('值'))}"><button class="icon-btn" id="propAdd">＋</button></div>
    </div>`;
  bindPropEvents(box,o);
}
function renderMultiProps(box,objs){
  box.innerHTML=`<div class="section"><h3>${esc(L('批量属性'))} <span>${objs.length} ${esc(L('个对象'))}</span></h3>
    <div class="form-grid">
      <label>${esc(L('移动到'))}</label><select id="multiLayer">${state.layers.map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select>
      <label>${esc(L('旋转角'))}</label><input type="number" id="multiAngle" step="1" value="0">
    </div>
    <div class="form-actions">
      <button class="mini" id="multiLayerBtn">${esc(L('应用图层'))}</button>
      <button class="mini" id="multiRotateBtn">${esc(L('批量旋转'))}</button>
      <button class="mini" id="multiHideBtn">${esc(L('隐藏'))}</button>
      <button class="mini" id="multiLockBtn">${esc(L('锁定'))}</button>
      <button class="mini danger" id="multiDeleteBtn">${esc(L('全部删除'))}</button>
    </div></div>`;
  $('multiLayerBtn').onclick=()=>{ const items=objs.filter(isEditable); if(!items.length) return toast('选中对象位于锁定图层','warn'); pushHistory(); items.forEach(o=>o.layerId=$('multiLayer').value); commitChange('已修改图层'); };
  $('multiRotateBtn').onclick=()=>{ rotateSelected(Number($('multiAngle').value)||0); };
  $('multiHideBtn').onclick=()=>{ const items=objs.filter(isEditable); if(!items.length) return toast('选中对象位于锁定图层','warn'); pushHistory(); items.forEach(o=>o.visible=false); commitChange('已隐藏对象'); };
  $('multiLockBtn').onclick=()=>{ const items=objs.filter(isEditable); if(!items.length) return toast('选中对象位于锁定图层','warn'); pushHistory(); items.forEach(o=>o.locked=true); commitChange('已锁定对象'); };
  $('multiDeleteBtn').onclick=deleteSelected;
}
function bindPropEvents(box,o){
  box.addEventListener('focusin',()=>pushHistory(),{once:true});
  const changed=()=>{ o.updatedAt=nowISO(); commitObjectEdit(); };
  box.querySelectorAll('[data-field]').forEach(el=>el.addEventListener('input',()=>applyField(el,o,changed)));
  /* 逐对象「图上标注」开关：勾选即写入对象 annot 并重绘 */
  box.querySelectorAll('[data-annot]').forEach(el=>el.addEventListener('change',()=>{ if(setAnnot(o,el.dataset.annot,el.checked)) changed(); }));
  box.querySelectorAll('[data-style]').forEach(el=>el.addEventListener('input',()=>{
    const k=el.dataset.style; o.style=o.style||{};
    if(k==='noFill'){ o.style.fillAlpha=el.checked?0:.15; }
    else o.style[k]=el.type==='checkbox'?el.checked:(el.type==='number'?Number(el.value):el.value);
    changed();
  }));
  box.querySelectorAll('[data-prop-key]').forEach(el=>el.addEventListener('change',()=>{
    const entries=Object.entries(o.props||{}), idx=Number(el.dataset.propKey), newKey=el.value.trim();
    if(!entries[idx]||!newKey) return;
    const next={}; entries.forEach(([k,v],i)=>{ next[i===idx?newKey:k]=v; }); o.props=next; changed();
  }));
  box.querySelectorAll('[data-prop-val]').forEach(el=>el.addEventListener('change',()=>{
    const key=Object.keys(o.props||{})[Number(el.dataset.propVal)];
    if(key!==undefined){ o.props[key]=el.value; changed(); }
  }));
  box.querySelectorAll('[data-node-axis]').forEach(el=>{
    el.addEventListener('input',()=>{
      if(setNodeCoord(o,Number(el.dataset.nodeIndex),el.dataset.axis,el.value)) changed();
    });
    el.addEventListener('focus',()=>setFocusNode({id:o.id,index:Number(el.dataset.nodeIndex)}));
    el.addEventListener('blur',()=>setFocusNode(null));
  });
  box.querySelectorAll('[data-node-add]').forEach(b=>b.onclick=()=>{
    const i=Number(b.dataset.nodeAdd), a=o.points[i], c=o.points[i+1];
    const p=c?[(a[0]+c[0])/2,(a[1]+c[1])/2]:[a[0]+1,a[1]];
    pushHistory(); insertLineNode(o,i,p); commitChange('已插入节点');
  });
  box.querySelectorAll('[data-node-del]').forEach(b=>b.onclick=()=>{
    if(o.points.length<=lineMinNodes(o)) return toast(`至少保留 ${lineMinNodes(o)} 个节点`,'warn');
    pushHistory(); removeLineNode(o,Number(b.dataset.nodeDel)); commitChange('已删除节点');
  });
  box.querySelectorAll('[data-node-up]').forEach(b=>b.onclick=()=>{
    if(moveNodeStep(o,Number(b.dataset.nodeUp),-1)){ pushHistory(); commitChange('节点已上移'); }
  });
  box.querySelectorAll('[data-node-down]').forEach(b=>b.onclick=()=>{
    if(moveNodeStep(o,Number(b.dataset.nodeDown),1)){ pushHistory(); commitChange('节点已下移'); }
  });
  bindNodeRowDrag(box,o);
  box.querySelector('[data-action="duplicate"]').onclick=()=>duplicateSelected();
  box.querySelector('[data-action="delete"]').onclick=()=>deleteSelected();
  box.querySelector('[data-action="raise"]').onclick=()=>reorderSelected(1);
  box.querySelector('[data-action="lower"]').onclick=()=>reorderSelected(-1);
  box.querySelector('[data-action="visibility"]').onclick=()=>{ if(!isEditable(o)) return toast('对象或图层已锁定','warn'); pushHistory(); o.visible=!o.visible; commitChange(); };
  box.querySelector('[data-action="lock"]').onclick=()=>{ if(layerOf(o).locked) return toast('图层已锁定','warn'); pushHistory(); o.locked=!o.locked; commitChange(); };
  $('propAdd')?.addEventListener('click',()=>{
    const k=$('propKey').value.trim(),v=$('propValue').value.trim(); if(!k) return;
    o.props[k]=v; commitChange();
  });
  box.querySelectorAll('[data-prop-del]').forEach(btn=>btn.onclick=()=>{
    const k=Object.keys(o.props)[Number(btn.dataset.propDel)]; delete o.props[k]; commitChange();
  });
  /* 设备照片：复用内容寻址资产库（与底图同一 storage），照片随撤销栈可达集合保留 */
  box.querySelectorAll('[data-photo-input]').forEach(inp=>inp.addEventListener('change',async()=>{
    const f=inp.files&&inp.files[0]; if(!f) return;
    if(!isEditable(o)) return toast('对象或图层已锁定','warn');
    try{
      const bytes=new Uint8Array(await f.arrayBuffer());
      const id=assetIdFor(bytes);
      await assetPut(id,{bytes,mime:f.type||'image/jpeg'});
      pushHistory(); o.props=o.props||{}; o.props.photoId=id; commitObjectEdit(); renderProps();
      toast('照片已附加','success');
    }catch(e){ toast('照片保存失败：'+e.message,'error'); }
  }));
  box.querySelectorAll('[data-photo-clear]').forEach(btn=>btn.onclick=()=>{
    if(!isEditable(o)) return toast('对象或图层已锁定','warn');
    if(!o.props.photoId) return;
    pushHistory(); delete o.props.photoId; commitObjectEdit(); renderProps();
  });
  box.querySelectorAll('[data-photo-img]').forEach(async img=>{
    try{
      const rec=await assetGet(img.dataset.photoImg);
      if(rec) img.src=bytesToDataUrl(rec.bytes,rec.mime||'image/jpeg');
    }catch(_){}
  });
  if(!isEditable(o)) box.querySelectorAll('input,select,textarea,button:not(.danger)').forEach(el=>{ el.disabled=true; });
}
/** 节点行 HTML5 拖拽排序：仅抓手可拖，落到目标行=移动到该位置 */
function bindNodeRowDrag(box,o){
  if(o.kind!=='line') return;
  let dragFrom=-1;
  box.querySelectorAll('.node-row').forEach(row=>{
    row.addEventListener('dragover',e=>{ e.preventDefault(); row.classList.add('drag-over'); });
    row.addEventListener('dragleave',()=>row.classList.remove('drag-over'));
    row.addEventListener('drop',e=>{
      e.preventDefault(); row.classList.remove('drag-over');
      const to=Number(row.dataset.nodeRow);
      if(dragFrom<0||to===dragFrom) return;
      pushHistory();
      moveNode(o,dragFrom,to); commitChange('节点顺序已调整');
    });
  });
  box.querySelectorAll('[data-node-grip]').forEach(g=>g.addEventListener('dragstart',()=>{
    dragFrom=Number(g.dataset.nodeGrip);
    g.closest('.node-row')?.classList.add('drag-source');
  }));
  box.addEventListener('dragend',()=>{ dragFrom=-1; box.querySelectorAll('.node-row').forEach(r=>r.classList.remove('drag-over','drag-source')); },{once:true});
}
function applyField(el,o,changed){
  const k=el.dataset.field;
  /* 基点坐标允许负值（可在场地外，与拖拽移动同一基准）；尺寸类字段仍非负 */
  if(k==='x'||k==='y'){ const n=Number(el.value); o[k]=Number.isFinite(n)?n:0; }
  else if(['width','height','angle','strokeWidth','phys'].includes(k)) o[k]=Math.max(0,Number(el.value)||0);
  else if(k==='closed'){
    if(el.checked && o.points.length<3){ el.checked=false; toast('闭合区域至少需要 3 个节点，请先插入节点','warn'); return; }
    o.closed=el.checked;
  }
  else if(k==='visible'||k==='locked') o[k]=el.checked;
  else if(k==='iconSize') o.iconSize=Math.min(3,Math.max(.5,Number(el.value)||1));
  else if(k==='shapeType'){
    convertAreaShape(o,el.value); changed(); renderProps(); return;
  }
  else if(k==='shapeR'&&o.shape){ o.shape.r=Math.max(.05,Number(el.value)||0); }
  else if(k==='shapeRx'&&o.shape){ o.shape.rx=Math.max(.05,Number(el.value)||0); }
  else if(k==='shapeRy'&&o.shape){ o.shape.ry=Math.max(.05,Number(el.value)||0); }
  else if(k==='shapeA0'&&o.shape){
    const sweep=sectorSweep(o.shape);
    o.shape.a0=normalizeAngle(Number(el.value)||0); o.shape.a1=o.shape.a0+sweep;
  }
  else if(k==='shapeSweep'&&o.shape){
    const sweep=Math.min(360,Math.max(1,Number(el.value)||90));
    o.shape.a1=(Number(o.shape.a0)||0)+sweep;
  }
  else if(k==='shapeSkew'&&o.shape){
    o.shape.skew=Math.max(-PARALLELOGRAM_MAX_SKEW,Math.min(PARALLELOGRAM_MAX_SKEW,Number(el.value)||0));
  }
  else if(k==='propModel'||k==='propIp'||k==='propOwner'){
    o.props=o.props||{};
    const key=k.slice(4).toLowerCase(), v=String(el.value||'').trim();
    if(v) o.props[key]=v; else delete o.props[key];
  }
  else if(k==='propMountHeight'){
    o.props=o.props||{};
    const n=Number(el.value);
    if(el.value!==''&&Number.isFinite(n)) o.props.mountHeight=Math.max(0,n); else delete o.props.mountHeight;
  }
  else o[k]=el.value;
  if(k==='typeId'){ const t=getType(o.typeId); if(!o.style.color) o.style.color=t.color; }
  changed();
}
function rotateSelected(delta){
  if(!delta) return;
  const objs=state.objects.filter(o=>selectedIds.has(o.id)&&isEditable(o));
  if(!objs.length) return toast('没有可旋转的选中对象','warn');
  pushHistory();
  objs.forEach(o=>{
    if(o.kind==='dimension') return;
    if(o.kind==='rect'&&areaShapeType(o)==='sector'&&o.shape){
      o.shape.a0=normalizeAngle((Number(o.shape.a0)||0)+delta);
      o.shape.a1=(Number(o.shape.a1)||0)+delta;
    }else if(o.points&&o.points.length){
      const c=objectCenter(o); o.points=o.points.map(p=>rotatePoint(p,c,delta)); syncFirstPoint(o);
    }else o.angle=normalizeAngle((o.angle||0)+delta);
    o.updatedAt=nowISO();
  });
  commitChange('已旋转选中对象');
}
