/* ui-panels.js —— 标签页、属性面板、对象清单、图层/类型管理、统计与存储占用 */
/* -------------------- UI：标签页 / 工具栏 -------------------- */
function switchTab(tab){
  document.querySelectorAll('.side-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.toggle('active',p.id==='tab-'+tab));
  /* 窄屏切换属性/清单等标签时自动展开覆盖侧栏 */
  if(window.matchMedia('(max-width:860px)').matches) document.body.classList.add('sidebar-open');
}
document.querySelectorAll('.side-tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
/* 窄屏侧栏覆盖层：☰ 开关；点画布遮罩区域关闭 */
$('sidebarToggle').addEventListener('click',()=>document.body.classList.toggle('sidebar-open'));
wrap.addEventListener('pointerdown',()=>{ if(document.body.classList.contains('sidebar-open')&&window.matchMedia('(max-width:860px)').matches) document.body.classList.remove('sidebar-open'); });
document.querySelectorAll('.tool-btn[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
/* 顶部下拉在 测距/其他标注 间切换时，同步左侧「测距」「标注」按钮互斥高亮 */
$('dimensionType').addEventListener('change',()=>{ if(currentTool==='dimension') syncToolButtons('dimension'); });
$('finishDraftBtn').addEventListener('click',finishDraft);
$('undoBtn').addEventListener('click',undo);
$('redoBtn').addEventListener('click',redo);
/* 仿射校准：仅图片底图可用（矢量场地本就以米绘制，无需校准） */
$('affineBtn').addEventListener('click',()=>{
  if(state.background.kind!=='image'){ toast('仿射校准仅适用于图片底图；矢量场地已按米绘制无需校准','warn'); return; }
  if(!bgImage){ toast('请先导入图片底图','warn'); return; }
  setTool('affine');
});
$('coverageBtn').addEventListener('click',runCoverageAnalysis);
$('zoomInBtn').addEventListener('click',()=>zoomAt(wrap.clientWidth/2,wrap.clientHeight/2,1.2));
$('zoomOutBtn').addEventListener('click',()=>zoomAt(wrap.clientWidth/2,wrap.clientHeight/2,1/1.2));
$('zoomFitBtn').addEventListener('click',fitView);
$('showLabels').addEventListener('change',e=>{ state.settings.showLabels=e.target.checked; scheduleSave(); requestRender(); });
$('markerScaleInput')?.addEventListener('input',e=>{
  state.settings.markerScale=Math.min(2.5,Math.max(.5,Number(e.target.value)||1));
  $('markerScaleLabel').textContent=Number(state.settings.markerScale).toFixed(1)+'×';
  scheduleSave(); requestRender();
});
$('filterText').addEventListener('input',renderList);
$('filterKind').addEventListener('change',renderList);
$('filterLayer').addEventListener('change',renderList);

function populateSelects(){
  const fill=(sel,items,include='',fallback='')=>{
    const old=sel.value;
    sel.innerHTML=(include?`<option value="">${include}</option>`:'')+items.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
    sel.value=old && items.some(x=>x.id===old) ? old : fallback;
  };
  fill($('pointType'),typesOfKind('point'),'','point.marker');
  fill($('rectType'),typesOfKind('rect'),'','rect.area');
  fill($('lineType'),typesOfKind('line'),'','line.boundary');
  fill($('filterLayer'),state.layers,'全部图层','');
  fill($('batchLayer'),state.layers,'',state.layers[0]?.id||'');
  const oldKind=$('filterKind').value;
  $('filterKind').innerHTML=['全部对象','点设备','矩形/区域','线段/折线','文字','尺寸标注'].map((x,i)=>`<option value="${i?['','point','rect','line','text','dimension'][i]:''}">${x}</option>`).join('');
  $('filterKind').value=oldKind;
}

/* -------------------- 属性面板 -------------------- */
/** 折线/标注节点编辑器：坐标精确输入；折线可逐节点插入(＋)/删除(×)/↑↓排序，或拖抓手排序 */
function renderNodeEditor(o){
  const canEdit=isPolylineEditable(o);
  const min=canEdit?lineMinNodes(o):0;
  const n=(o.points||[]).length;
  const rows=(o.points||[]).map((p,i)=>`
    <div class="node-row" data-node-row="${i}" ${canEdit?'':''}>
      ${canEdit?`<span class="node-grip" draggable="true" data-node-grip="${i}" title="拖拽调整节点顺序">⠿</span>`:'<span class="node-idx">#</span>'}
      <span class="node-idx">${i+1}</span>
      <input type="number" step="0.1" title="节点 X（米，可为负）" data-node-axis="x" data-node-index="${i}" value="${fmt(p[0])}">
      <input type="number" step="0.1" title="节点 Y（米，可为负）" data-node-axis="y" data-node-index="${i}" value="${fmt(p[1])}">
      ${canEdit?`<button type="button" class="icon-btn" data-node-up="${i}" title="上移节点" ${i===0?'disabled':''}>↑</button>
      <button type="button" class="icon-btn" data-node-down="${i}" title="下移节点" ${i===n-1?'disabled':''}>↓</button>
      <button type="button" class="icon-btn" data-node-add="${i}" title="在此节点后插入一个节点">＋</button>
      <button type="button" class="icon-btn danger" data-node-del="${i}" title="删除该节点" ${n<=min?'disabled':''}>×</button>`:''}
    </div>`).join('');
  const shapeName=o.kind==='dimension'?'测距链':(o.closed?'闭合区域':'开放折线');
  const hint=canEdit
    ? `<div class="hint-text">共 ${n} 点（${shapeName}至少 ${min} 点）；拖 ⠿ 或 ↑↓ 调整顺序；画布上双击线段插入节点、双击节点删除</div>`
    : `<div class="hint-text">共 ${n} 点；可在画布上拖节点手柄调整位置</div>`;
  /* span2：节点列表需跨满 form-grid 两列，否则会被压进 78px 的标签列导致坐标输入框仅剩几十像素 */
  return `<div class="node-list span2">${rows}${hint}</div>`;
}
/**
 * 逐对象「图上标注」开关组（跨满两列）：点设备=编号/点坐标；区域=编号/基点/半径/边长/顶点/周长/面积；
 * 折线=编号/节点(闭合即顶点)/段长/周长/面积（开放折线去掉面积）。未显式设置的键按类型默认值；与全局总开关（段长度/图上面积）叠加生效。
 * 区域按形状过滤无意义的开关：矩形给「边长/顶点坐标」不给「半径」；圆/椭圆/扇形给「半径」不给「边长/顶点坐标」。
 */
function annotToggleKeys(o){
  const keys=annotKeys(o.kind);
  if(o.kind==='rect'){
    return areaShapeType(o)==='rect' ? keys.filter(k=>k!=='radius') : keys.filter(k=>k!=='edge'&&k!=='vertex');
  }
  /* 开放折线无面积概念：不提供「面积」开关，避免出现勾选后无任何效果的无效配置 */
  if(o.kind==='line' && !o.closed) return keys.filter(k=>k!=='area');
  return keys;
}
function renderAnnotToggles(o){
  const keys=annotToggleKeys(o);
  if(!keys.length) return '';
  const chks=keys.map(k=>`<label class="annot-chk" title="在图上显示「${annotLabel(o,k)}」"><input type="checkbox" data-annot="${k}" ${annotOn(o,k)?'checked':''}> ${annotLabel(o,k)}</label>`).join('');
  return `<label class="span2">图上标注</label><div class="annot-chks span2">${chks}</div>`;
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
  if(!bg) return `<div class="section"><h3>${esc(heading)}</h3><div class="prop-empty">尚未设置底图/场地，请点顶部「底图/场地」上传图片或绘制矢量场地。</div></div>`;
  if(bg.kind==='image'){
    if(tool) return `<div class="section"><h3>场地节点 <span class="hint-text">图片底图</span></h3><div class="prop-empty">当前为图片底图，暂无场地节点可编辑。<br><br>请先在「底图」弹窗中切换为矩形/圆形/椭圆/扇形/多边形矢量场地；图片底图请改用「仿射校准」。</div></div>`;
    return imagePropsHTML(bg, heading);
  }
  const sh=bg.shape||{};
  const fv=(v,fb=0)=>{ const n=Number(v); return fmt(Number.isFinite(n)?n:fb); };
  const num=(field,val,step=.1)=>`<input type="number" step="${step}" data-site-field="${field}" value="${val}">`;
  const row=(label,inner)=>`<label>${label}</label><div>${inner}</div>`;
  let params='';
  if(sh.type==='polygon'){
    const pts=sh.points||[];
    /* span2：节点列表需跨满 form-grid 两列（否则会被压进 78px 的标签列） */
    params=`<div class="node-list span2">${pts.map((p,i)=>`
      <div class="node-row vtx" data-site-node-row="${i}">
        <span class="node-idx">${i+1}</span>
        <input type="number" step="0.1" title="顶点 X（米，可为负）" data-site-node-axis="x" data-site-node-index="${i}" value="${fv(p[0])}">
        <input type="number" step="0.1" title="顶点 Y（米，可为负）" data-site-node-axis="y" data-site-node-index="${i}" value="${fv(p[1])}">
        <button type="button" class="icon-btn" data-site-node-up="${i}" title="上移顶点" ${i===0?'disabled':''}>↑</button>
        <button type="button" class="icon-btn" data-site-node-down="${i}" title="下移顶点" ${i===pts.length-1?'disabled':''}>↓</button>
        <button type="button" class="icon-btn" data-site-node-add="${i}" title="在此顶点后插入一个顶点">＋</button>
        <button type="button" class="icon-btn danger" data-site-node-del="${i}" title="删除该顶点" ${pts.length<=3?'disabled':''}>×</button>
      </div>`).join('')}
      <div class="hint-text">共 ${pts.length} 个顶点（至少 3）；画布上双击边插入顶点、双击顶点删除</div>
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
  }else{
    params=`${row('基点 X',num('x',fv(sh.x)))}${row('基点 Y',num('y',fv(sh.y)))}
      ${row('宽度 (m)',num('w',fv(sh.w,100)))}${row('高度 (m)',num('h',fv(sh.h,70)))}`;
  }
  const ap=siteAreaPerimeter(bg);
  const hint=tool
    ?'拖拽画布上的控制点即可调整场地；也可在此输入精确坐标/参数。坐标按世界坐标（米），可为负；场地随底图保持真实比例。'
    :'直接修改下方坐标/参数即可调整场地；点左侧「⊗ 场地节点」工具可在画布上拖拽控制点。坐标按世界坐标（米），可为负。';
  return `<div class="section"><h3>${esc(heading)} <span class="hint-text">${esc(siteKindName(bg.kind))}</span></h3>
    <div class="form-grid">${params}</div>
    <div class="form-grid">
      <label>面积</label><div><b id="siteAreaVal">${fmt(ap.area)}</b> ㎡</div>
      <label>周长</label><div><b id="sitePerimVal">${fmt(ap.perimeter)}</b> m</div>
    </div>
    <div class="hint-text">${hint}</div>
    ${tool?'':`<div class="hint-text">提示：单击对象可在此编辑其属性；框选可批量选择；Delete 删除；Ctrl+Z 撤销。</div>`}
  </div>`;
}
/** 图片底图属性摘要（含比例尺/仿射校准入口）；实测范围为其外接矩形 */
function imagePropsHTML(bg, heading){
  const d=siteDomainOf(bg);
  const cal=bg.calibrated?'已校准':'未校准';
  const rot=bg.transform?'已校正倾斜':'轴对齐';
  return `<div class="section"><h3>${esc(heading)} <span class="hint-text">图片底图</span></h3>
    <div class="form-grid">
      <label>名称</label><div>${esc(bg.fileName||'未命名')}</div>
      <label>像素</label><div>${bg.width}×${bg.height} px</div>
      <label>比例</label><div>${fmt(bg.metersPerPixel)} m/px</div>
      <label>校准</label><div>${cal} ｜ ${rot}</div>
      <label>实测范围</label><div>${fmt(d.w)}×${fmt(d.h)} m（外接矩形）</div>
    </div>
    <div class="form-grid">
      <button class="primary" id="siteOpenBtn" title="上传图片底图，或改画矢量场地">底图/场地…</button>
      <button id="siteCalibBtn" title="仅图片底图需要：指定两点实际距离校准米/像素">比例尺校准</button>
      <button id="siteAffineBtn" title="在图上依次点击已知点并输入实地坐标，纠正倾斜与不等比缩放">仿射校准</button>
    </div>
    <div class="hint-text">图片以像素×比例尺映射到世界坐标；如需精确贴合请用「比例尺校准」或「仿射校准」。</div>
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
  const row=(label,inner)=>`<label>${label}</label><div>${inner}</div>`;
  const num=(field,val,step=.1)=>`<input type="number" step="${step}" data-field="${field}" value="${val}">`;
  const txt=(field,val)=>`<input type="text" data-field="${field}" value="${esc(val||'')}">`;
  const layerSel=`<select data-field="layerId">${state.layers.map(l=>`<option value="${esc(l.id)}" ${l.id===o.layerId?'selected':''}>${esc(l.name)}</option>`).join('')}</select>`;
  let typeSel='';
  if(['point','rect','line'].includes(o.kind)){
    typeSel=`<select data-field="typeId">${typesOfKind(o.kind).map(x=>`<option value="${esc(x.id)}" ${x.id===o.typeId?'selected':''}>${esc(x.name)}</option>`).join('')}</select>`;
  }else typeSel=`<input value="${kindName(o.kind)}" disabled>`;
  let specific='';
  if(o.kind==='rect'){
    const stt=areaShapeType(o), sh=o.shape||{};
    const shapeSel=`<select data-field="shapeType">${AREA_SHAPE_TYPES.map(x=>`<option value="${x}" ${x===stt?'selected':''}>${({rect:'矩形',circle:'圆形',ellipse:'椭圆',sector:'扇形（饼形）'})[x]}</option>`).join('')}</select>`;
    /* 基点即渲染/命中/拖拽共用的锚点 (o.x,o.y)：矩形=第一角点(旋转中心)，圆/椭圆/扇形=圆心 */
    const baseName=({rect:'基点',circle:'圆心',ellipse:'中心',sector:'圆心'})[stt];
    const baseRows=`${row(baseName+' X',num('x',fmt(o.x)))}${row(baseName+' Y',num('y',fmt(o.y)))}`;
    let params='';
    if(stt==='rect'){
      params=`${baseRows}
        ${row('宽度',num('width',fmt(o.width)))}${row('高度',num('height',fmt(o.height)))}
        ${row('旋转角',num('angle',Math.round(o.angle),1))}`;
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
      ${row('填充色',`<input type="color" data-style="color" value="${o.style.color||t.color}"> <label style="display:inline"><input type="checkbox" data-style="noFill" ${styleVal(o,'fillAlpha',.15)==0?'checked':''}>透明</label>`)}
      ${row('透明度',`<input type="range" min="0" max="1" step=".01" data-style="fillAlpha" value="${styleVal(o,'fillAlpha',.15)}">`)}
      ${row('线宽',`<input type="number" step=".01" data-style="strokeWidth" value="${fmt(styleVal(o,'strokeWidth',.1))}">`)}
      ${renderAnnotToggles(o)}
      <div class="hint-text span2" style="grid-column:1/-1">${stt==='rect'?'基点为矩形第一角点，也是旋转中心；':'圆心/中心即形状基点（画布上以 ⊕ 标出），移动图形即移动基点；'}坐标按世界坐标（米），可为负；区域随底图保持真实比例。三角形/任意多边形请用「折线」工具勾选「闭合区域」。</div>`;
  }else if(o.kind==='line'||o.kind==='dimension'){
    specific=`
      ${o.kind==='line'?row('闭合',`<input type="checkbox" data-field="closed" ${o.closed?'checked':''}>`):''}
      ${row('颜色',`<input type="color" data-style="color" value="${o.style.color||(o.kind==='dimension'?'#111827':t.color)}">`)}
      ${o.kind==='line'?row('线宽',`<input type="number" step=".01" data-style="strokeWidth" value="${fmt(styleVal(o,'strokeWidth',.1))}">`):''}
      ${o.closed?row('面积',`<b>${fmt(polygonArea(o.points))}</b> ㎡`):''}
      ${o.closed?row('周长',`<b>${fmt(objectLength(o))}</b> m（含闭合边）`):''}
      ${renderAnnotToggles(o)}
      <label class="span2">节点</label>${renderNodeEditor(o)}`;
  }else if(o.kind==='point'){
    const psh=t.scaleShape||'none';
    const canScale=psh!=='none';
    const physHint=canScale
      ? `<div class="hint-text span2" style="grid-column:1/-1">该类型按「${POINT_SCALE_SHAPES[psh]}」渲染：填 0 为纯位置图标；填${psh==='bar'?'杆长':psh==='sector'?'视场半径':'直径'}（米）后随底图真实比例缩放${psh==='sector'?'，张角 '+(''+(t.fov||90))+'°，朝向随朝向角':''}</div>`
      : `<div class="hint-text span2" style="grid-column:1/-1">该类型仅标识位置（屏幕固定图标）。如需与底图成比例的覆盖范围，请在「图层/类型」中改用圆/方/扇形/杆型点类型。</div>`;
    specific=`${row('X 坐标',num('x',fmt(o.x)))}${row('Y 坐标',num('y',fmt(o.y)))}${row('朝向角',num('angle',Math.round(o.angle),1))}
      ${row('图标大小',`<input type="range" min=".5" max="3" step=".05" data-field="iconSize" value="${Number(o.iconSize)||1}"><span class="hint-text">${(Number(o.iconSize)||1).toFixed(2)}×（顶栏还有全局点大小）</span>`)}
      ${canScale?row('物理尺寸(m)',`<input type="number" min="0" step=".1" data-field="phys" value="${fmt(o.phys||0)}">`):''}${physHint}
      ${renderAnnotToggles(o)}`;
  }else if(o.kind==='text'){
    specific=`${row('文字',`<input type="text" data-field="text" value="${esc(o.text||'')}">`)}
      ${row('X 坐标',num('x',fmt(o.x)))}${row('Y 坐标',num('y',fmt(o.y)))}
      ${row('字高(m)',num('height',fmt(o.height),.05))}${row('旋转角',num('angle',Math.round(o.angle),1))}
      ${row('颜色',`<input type="color" data-style="color" value="${o.style.color||t.color}">`)}`;
  }
  const props=Object.entries(o.props||{}).map(([k,v],i)=>`<div class="custom-prop"><input value="${esc(k)}" data-prop-key="${i}"><input value="${esc(v)}" data-prop-val="${i}"><button class="icon-btn" data-prop-del="${i}">×</button></div>`).join('');
  box.innerHTML=`
    <div class="section"><h3>对象属性 <span class="hint-text">${esc(o.name)}</span></h3>
      <div class="form-grid">
        ${row('编号',txt('name',o.name))}${row('类型',typeSel)}${row('图层',layerSel)}${specific}
      </div>
      <div class="form-actions">
        <button class="mini" data-action="duplicate">复制</button>
        <button class="mini" data-action="raise">上移一层</button>
        <button class="mini" data-action="lower">下移一层</button>
        <button class="mini" data-action="visibility">${o.visible?'隐藏':'显示'}</button>
        <button class="mini" data-action="lock">${o.locked?'解锁':'锁定'}</button>
        <button class="mini danger" data-action="delete">删除</button>
      </div>
    </div>
    <div class="section"><h3>自定义属性</h3>
      ${props||'<div class="hint-text">暂无自定义属性</div>'}
      <div class="custom-prop" style="margin-top:7px"><input id="propKey" placeholder="键"><input id="propValue" placeholder="值"><button class="icon-btn" id="propAdd">＋</button></div>
    </div>`;
  bindPropEvents(box,o);
}
function renderMultiProps(box,objs){
  box.innerHTML=`<div class="section"><h3>批量属性 <span>${objs.length} 个对象</span></h3>
    <div class="form-grid">
      <label>移动到</label><select id="multiLayer">${state.layers.map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select>
      <label>旋转角</label><input type="number" id="multiAngle" step="1" value="0">
    </div>
    <div class="form-actions">
      <button class="mini" id="multiLayerBtn">应用图层</button>
      <button class="mini" id="multiRotateBtn">批量旋转</button>
      <button class="mini" id="multiHideBtn">隐藏</button>
      <button class="mini" id="multiLockBtn">锁定</button>
      <button class="mini danger" id="multiDeleteBtn">全部删除</button>
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

/* -------------------- 对象清单 -------------------- */
function renderList(){
  const q=$('filterText').value.trim().toLowerCase(), kf=$('filterKind').value, lf=$('filterLayer').value;
  const rows=state.objects.filter(o=>(!kf||o.kind===kf)&&(!lf||o.layerId===lf)&&(!q||[o.name,o.text,JSON.stringify(o.props),getType(o.typeId).name].join(' ').toLowerCase().includes(q)));
  $('headSelectChk').checked=rows.length>0&&rows.every(o=>selectedIds.has(o.id));
  $('objectTbody').innerHTML=rows.map(o=>{
    const t=getType(o.typeId), l=layerOf(o);
    const param=o.kind==='rect'?areaParamText(o):
      o.kind==='point'?`${Math.round(o.angle)}°${(o.phys||0)>0?' / '+fmt(o.phys)+'m':''}`:
      o.kind==='line'?`${o.points.length}点 / ${fmt(objectLength(o))}m${o.closed&&o.points.length>=3?' / '+fmt(polygonArea(o.points))+'㎡':''}`:
      o.kind==='text'?esc(o.text):(o.kind==='dimension'&&o.subtype==='ruler'?`${o.points.length}点 / Σ ${fmt(objectLength(o))}m`:o.subtype||'');
    return `<tr data-id="${esc(o.id)}" class="${selectedIds.has(o.id)?'selected':''} ${o.locked?'locked':''} ${!o.visible?'hidden-row':''}">
      <td><input type="checkbox" data-row-select="${esc(o.id)}" ${selectedIds.has(o.id)?'checked':''}></td>
      <td>${esc(o.name)}</td><td>${esc(o.text||o.props.note||'')}</td><td><span class="dot" style="background:${t.color}"></span>${esc(t.name)}</td>
      <td>${esc(l.name)}</td><td>${fmt(o.x)}</td><td>${fmt(o.y)}</td><td>${param}</td>
      <td><button class="icon-btn" data-toggle-visible="${o.id}">${o.visible?'👁':'–'}</button></td>
      <td><button class="icon-btn" data-toggle-lock="${o.id}">${o.locked?'🔒':'○'}</button></td>
    </tr>`;
  }).join('');
  $('objectTbody').querySelectorAll('tr[data-id]').forEach(tr=>tr.addEventListener('click',e=>{
    if(e.target.closest('input,button')) return;
    const id=tr.dataset.id;
    if(e.shiftKey) selectedIds.has(id)?selectedIds.delete(id):selectedIds.add(id);
    else { selectedIds.clear(); selectedIds.add(id); switchTab('props'); }
    refreshUI();
  }));
  $('objectTbody').querySelectorAll('[data-row-select]').forEach(chk=>chk.addEventListener('click',e=>{
    e.stopPropagation(); const id=chk.dataset.rowSelect; chk.checked?selectedIds.add(id):selectedIds.delete(id); refreshUI();
  }));
  $('objectTbody').querySelectorAll('[data-toggle-visible]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); const o=state.objects.find(x=>x.id===b.dataset.toggleVisible); if(!isEditable(o)) return toast('对象或图层已锁定','warn'); pushHistory(); o.visible=!o.visible; commitChange(); });
  $('objectTbody').querySelectorAll('[data-toggle-lock]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); const o=state.objects.find(x=>x.id===b.dataset.toggleLock); if(layerOf(o).locked) return toast('图层已锁定','warn'); pushHistory(); o.locked=!o.locked; commitChange(); });
}
$('headSelectChk').addEventListener('change',e=>{
  const q=$('filterText').value.trim().toLowerCase(), kf=$('filterKind').value, lf=$('filterLayer').value;
  const rows=state.objects.filter(o=>(!kf||o.kind===kf)&&(!lf||o.layerId===lf)&&(!q||[o.name,o.text,JSON.stringify(o.props),getType(o.typeId).name].join(' ').toLowerCase().includes(q)));
  rows.forEach(o=>e.target.checked?selectedIds.add(o.id):selectedIds.delete(o.id)); refreshUI();
});
$('selectAllChk').addEventListener('change',e=>{
  const q=$('filterText').value.trim().toLowerCase(), kf=$('filterKind').value, lf=$('filterLayer').value;
  const rows=state.objects.filter(o=>(!kf||o.kind===kf)&&(!lf||o.layerId===lf)&&(!q||[o.name,o.text,JSON.stringify(o.props),getType(o.typeId).name].join(' ').toLowerCase().includes(q)));
  rows.forEach(o=>e.target.checked?selectedIds.add(o.id):selectedIds.delete(o.id)); refreshUI();
});
$('batchLayerBtn').onclick=()=>{ const lid=$('batchLayer').value; if(!lid) return; const items=state.objects.filter(o=>selectedIds.has(o.id)&&isEditable(o)); if(!items.length) return toast('没有可修改的选中对象','warn'); pushHistory(); items.forEach(o=>o.layerId=lid); commitChange('已批量修改图层'); };
$('batchMoveBtn').onclick=()=>{
  const dx=Number($('batchDx').value)||0,dy=Number($('batchDy').value)||0; if(!dx&&!dy) return;
  const items=state.objects.filter(o=>selectedIds.has(o.id)&&isEditable(o)); if(!items.length) return toast('没有可移动的选中对象','warn');
  pushHistory(); items.forEach(o=>{
    o.x+=dx;o.y+=dy;if(o.points)o.points=o.points.map(p=>[p[0]+dx,p[1]+dy]);
  }); commitChange('已批量平移');
};
$('batchRotateBtn').onclick=()=>rotateSelected(Number($('batchAngle').value)||0);
$('batchDeleteBtn').onclick=deleteSelected;

/* -------------------- 图层 / 类型管理 -------------------- */
function renderLayers(){
  $('layerList').innerHTML=state.layers.map(l=>{
    const count=state.objects.filter(o=>o.layerId===l.id).length;
    return `<div class="layer-row">
      <div class="meta"><div class="name">${esc(l.name)}</div><div class="sub">${count} 个对象</div></div>
      <button class="icon-btn" data-layer-visible="${l.id}" title="显隐">${l.visible?'👁':'–'}</button>
      <button class="icon-btn" data-layer-lock="${l.id}" title="锁定">${l.locked?'🔒':'○'}</button>
      <button class="icon-btn" data-layer-rename="${l.id}" title="重命名">✎</button>
      <button class="icon-btn danger" data-layer-delete="${l.id}" title="删除">×</button>
    </div>`;
  }).join('');
  $('layerList').querySelectorAll('[data-layer-visible]').forEach(b=>b.onclick=()=>{ const l=getLayer(b.dataset.layerVisible); pushHistory(); l.visible=!l.visible; commitChange(); });
  $('layerList').querySelectorAll('[data-layer-lock]').forEach(b=>b.onclick=()=>{ const l=getLayer(b.dataset.layerLock); pushHistory(); l.locked=!l.locked; commitChange(); });
  $('layerList').querySelectorAll('[data-layer-rename]').forEach(b=>b.onclick=async()=>{
    const l=getLayer(b.dataset.layerRename); const v=await showPrompt({title:'重命名图层',label:'名称',value:l.name}); if(v){ pushHistory(); l.name=v; commitChange(); }
  });
  $('layerList').querySelectorAll('[data-layer-delete]').forEach(b=>b.onclick=()=>{
    const l=getLayer(b.dataset.layerDelete);
    if(state.layers.length===1) return toast('至少保留一个图层','warn');
    if(state.objects.some(o=>o.layerId===l.id)) return toast('请先移走该图层下的对象','warn');
    pushHistory(); state.layers=state.layers.filter(x=>x.id!==l.id); commitChange('已删除图层');
  });
}
function getLayer(id){ return state.layers.find(l=>l.id===id); }
$('addLayerBtn').onclick=()=>{
  const name=$('newLayerName').value.trim()||'新图层';
  pushHistory(); state.layers.push({id:uid('layer'),name,visible:true,locked:false}); $('newLayerName').value=''; commitChange('已新增图层');
};
function renderTypes(){
  const groups={point:'点设备',rect:'矩形/区域',line:'线段/折线'};
  $('typeList').innerHTML=Object.entries(groups).map(([kind,label])=>`
    <h3>${label}</h3>
    ${typesOfKind(kind).map(t=>`<div class="type-row">
      <div class="meta"><div class="name"><span class="dot" style="background:${t.color}"></span>${esc(t.name)}</div><div class="sub">${t.builtin?'内置':'自定义'} · ${t.icon||''}${kind==='point'?' · '+(POINT_SCALE_SHAPES[t.scaleShape]||POINT_SCALE_SHAPES.none)+' · 图标 '+(Number(t.iconSize)||1).toFixed(2)+'×':''}</div></div>
      ${kind==='point'&&!t.builtin?`<input type="number" min=".5" max="5" step=".1" title="默认图标大小（屏幕倍率）" value="${Number(t.iconSize)||1}" data-type-iconsize="${t.id}" style="width:52px">`:''}
      <input type="color" value="${t.color}" data-type-color="${t.id}" ${t.builtin?'disabled':''}>
      <button class="icon-btn" data-type-rename="${t.id}" ${t.builtin?'disabled':''}>✎</button>
      <button class="icon-btn danger" data-type-delete="${t.id}" ${t.builtin?'disabled':''}>×</button>
    </div>`).join('')}`).join('');
  $('typeList').querySelectorAll('[data-type-color]').forEach(i=>i.onchange=()=>{ const t=state.objectTypes.find(x=>x.id===i.dataset.typeColor); pushHistory(); t.color=i.value; commitChange(); });
  $('typeList').querySelectorAll('[data-type-iconsize]').forEach(i=>i.onchange=()=>{ const t=state.objectTypes.find(x=>x.id===i.dataset.iconsize); const v=Math.min(5,Math.max(.5,Number(i.value)||1)); pushHistory(); t.iconSize=v; commitChange(); });
  $('typeList').querySelectorAll('[data-type-rename]').forEach(b=>b.onclick=async()=>{
    const t=state.objectTypes.find(x=>x.id===b.dataset.typeRename); const v=await showPrompt({title:'重命名类型',label:'名称',value:t.name}); if(v){ pushHistory(); t.name=v; commitChange(); }
  });
  $('typeList').querySelectorAll('[data-type-delete]').forEach(b=>b.onclick=()=>{
    const t=state.objectTypes.find(x=>x.id===b.dataset.typeDelete);
    if(state.objects.some(o=>o.typeId===t.id)) return toast('该类型仍被对象使用','warn');
    pushHistory(); state.objectTypes=state.objectTypes.filter(x=>x.id!==t.id); commitChange('已删除类型');
  });
}
$('addTypeBtn').onclick=async()=>{
  const kind=$('newTypeKind').value,name=$('newTypeName').value.trim(),color=$('newTypeColor').value,icon=$('newTypeIcon').value;
  if(!name) return toast('请填写类型名称','warn');
  pushHistory();
  const saved={id:uid('type'),kind,name,color,icon:kind==='point'?icon:(kind==='rect'?'rect':'line'),defaultStyle:kind==='rect'?{fillAlpha:.16,strokeWidth:.12}:{strokeWidth:.1}};
  if(kind==='point'){
    const psh=$('newTypeShape').value;
    if(['none','circle','square','sector','bar'].includes(psh)) saved.scaleShape=psh;
    if(psh==='sector') saved.fov=90;
    const iconSize=Math.min(5,Math.max(.5,Number($('newTypeIconSize')?.value)||1));
    if(iconSize!==1) saved.iconSize=iconSize;
  }
  state.objectTypes.push(saved);
  $('newTypeName').value=''; commitChange('已新增类型'); populateSelects();
};

/* -------------------- 统计 / 校验 -------------------- */
/** 清单/报告中区域形状的参数摘要 */
function areaParamText(o){
  const tt=areaShapeType(o), sh=o.shape||{};
  if(tt==='circle') return `圆形 r=${fmt(sh.r)}m`;
  if(tt==='ellipse') return `椭圆 ${fmt(sh.rx*2)}×${fmt(sh.ry*2)}m / ${Math.round(o.angle)}°`;
  if(tt==='sector') return `扇形 r=${fmt(sh.r)}m / ${Math.round(sectorSweep(sh))}°`;
  return `${fmt(o.width)}×${fmt(o.height)} / ${Math.round(o.angle)}°`;
}
function objectArea(o){
  if(o.kind==='rect') return shapeArea(o);
  if(o.closed&&o.points.length>=3) return polygonArea(o.points);
  if(o.kind==='dimension'&&o.subtype==='area') return polygonArea(o.points);
  return 0;
}
function objectLength(o){
  if(!o.points||o.points.length<2) return 0;
  let l=polylineLength(o.points);
  if(o.closed) l+=dist(o.points.at(-1),o.points[0]);
  return l;
}
function findIssues(){
  const issues=[]; const d=worldDims();
  state.objects.forEach(o=>{
    if(o.kind==='rect'){
      const tt=areaShapeType(o), sh=o.shape||{};
      const small=tt==='rect'?(o.width<.05||o.height<.05)
        :tt==='circle'?sh.r<.05
        :tt==='ellipse'?((sh.rx||0)<.05||(sh.ry||0)<.05)
        :(sh.r||0)<.05;
      if(small) issues.push(`${o.name} 尺寸过小`);
    }
    if(o.kind==='line'&&o.points.length<2) issues.push(`${o.name} 折线节点不足`);
    if(o.closed&&o.points.length>=3){
      for(let i=0;i<o.points.length;i++) for(let j=i+1;j<o.points.length;j++){
        const a=o.points[i],b=o.points[(i+1)%o.points.length],c=o.points[j],dd=o.points[(j+1)%o.points.length];
        if(j!==i&&(j+1)%o.points.length!==i&&segmentsIntersect(a,b,c,dd)) issues.push(`${o.name} 存在自相交`);
      }
    }
    if(o.kind==='point'&&(o.phys||0)>0&&o.phys>Math.max(d.w,d.h))
      issues.push(`${o.name} 物理尺寸 ${fmt(o.phys)}m 超过场地长边 ${fmt(Math.max(d.w,d.h))}m，请确认`);
    const b=objectBounds(o);
    if(b.maxX<-.2||b.minX>d.w+.2||b.maxY<-.2||b.minY>d.h+.2) issues.push(`${o.name} 超出场地范围`);
  });
  return issues;
}
function renderStats(){
  const counts={point:0,rect:0,line:0,text:0,dimension:0};
  state.objects.forEach(o=>counts[o.kind]++);
  const area=state.objects.reduce((s,o)=>s+objectArea(o),0);
  const len=state.objects.reduce((s,o)=>s+objectLength(o),0);
  const issues=findIssues();
  $('statsPanel').innerHTML=`
    <div class="stat-grid">
      <div class="stat-card">点设备<b>${counts.point}</b></div>
      <div class="stat-card">矩形/区域<b>${counts.rect}</b></div>
      <div class="stat-card">线段/折线<b>${counts.line}</b></div>
      <div class="stat-card">文字<b>${counts.text}</b></div>
      <div class="stat-card">标注总长<b>${fmt(len)} m</b></div>
      <div class="stat-card">区域总面积<b>${fmt(area)} ㎡</b></div>
    </div>
    <div class="section" style="margin-top:10px"><h3>工程信息</h3><div class="kv-list">
      <span>工程名称</span><b>${esc(state.meta.name)}</b><span>场地</span><b>${esc(siteKindName(state.background.kind))}</b>
      <span>场地参数</span><b>${esc(siteDescription().split('：').slice(1).join('：'))}</b>
      <span>对象总数</span><b>${state.objects.length}</b><span>最近更新</span><b>${new Date(state.meta.updatedAt).toLocaleString()}</b>
    </div></div>
    <div class="section"><h3>几何检查</h3>${issues.length?issues.map(x=>`<div class="issue">${esc(x)}</div>`).join(''):'<div class="ok-banner">未发现明显的零尺寸、自相交或越界问题。</div>'}</div>
    <div class="section"><h3>本地存储</h3><div id="storageBox"><div class="hint-text">统计中…</div></div></div>`;
  refreshStorageUsage();
}
function formatBytes(n){
  if(!Number.isFinite(n)||n<0) return '-';
  if(n<1024) return n+' B';
  if(n<1024*1024) return (n/1024).toFixed(1)+' KB';
  if(n<1024*1024*1024) return (n/1024/1024).toFixed(2)+' MB';
  return (n/1024/1024/1024).toFixed(2)+' GB';
}
function refreshStorageUsage(){
  const box=$('storageBox'); if(!box) return;
  let lsBytes=0;
  try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i)||''; lsBytes+=(k.length+(localStorage.getItem(k)||'').length)*2; } }catch(e){}
  const render=(used,quota,sourceLabel)=>{
    const pct=quota&&used?Math.min(100,used/quota*100):0;
    const cls=pct>=85?'danger':pct>=70?'warn':'';
    box.innerHTML=
      '<div class="storage-bar"><i class="'+cls+'" style="width:'+Math.max(pct,2)+'%"></i></div>'+
      '<div class="kv-list"><span>占用（'+sourceLabel+'）</span><b>'+formatBytes(used)+'</b>'+
      (quota?'<span>浏览器配额</span><b>'+formatBytes(quota)+'</b><span>使用率</span><b>'+pct.toFixed(1)+'%</b>':'')+
      '</div>'+
      (pct>=85
        ? '<div class="issue">存储使用率较高：可移除不用的底图，或导出 JSON 备份后清理本站数据。</div>'
        : '<p class="hint-text">工程与底图存于 IndexedDB（底图按内容哈希去重），设置存于 localStorage。</p>');
  };
  if(navigator.storage&&navigator.storage.estimate){
    navigator.storage.estimate()
      .then(est=>render(est.usage||lsBytes,est.quota||0,'IndexedDB 含底图'))
      .catch(()=>render(lsBytes,0,'localStorage'));
  }else render(lsBytes,0,'localStorage');
}

/* -------------------- 视场覆盖率分析 -------------------- */
/** 分析摄像头/球机等点设备视场对区域与闭合折线的覆盖率，写入叠加层数据并弹出报告 */
function runCoverageAnalysis(){
  const res=analyzeCoverage(state);
  coverageResult=res;
  requestRender();
  const pct=x=>(x*100).toFixed(1)+'%';
  const head=`<div style="font-size:13px;line-height:1.9;margin-bottom:10px">
    <div>参与统计的点设备：<b>${res.cameraCount}</b> 个（含物理尺寸的圆/球机、扇形/摄像头、方形覆盖）${res.ignoredPoints?`；仅标识位置的图标点 <b>${res.ignoredPoints}</b> 个未计入`:''}</div>
    <div>区域/闭合折线：<b>${res.regions.length}</b> 个 ｜ 合计覆盖 <b>${pct(res.ratio)}</b></div>
    <div>覆盖面积 <b>${fmt(res.totalCovered)}</b> m² ｜ 盲区 <b>${fmt(res.totalBlind)}</b> m² ｜ 总面积 <b>${fmt(res.totalArea)}</b> m²</div>
  </div>`;
  const rows=res.regions.map(r=>`<div style="display:flex;justify-content:space-between;gap:14px;padding:6px 0;border-top:1px solid #eef2f7">
    <span style="font-weight:600">${esc(r.name)}</span>
    <span>覆盖 <b>${pct(r.ratio)}</b> ｜ ${fmt(r.coveredArea)}/${fmt(r.area)} m² ｜ 盲区 ${fmt(r.blindArea)} m²</span></div>`).join('');
  const legend=`<div style="display:flex;gap:16px;font-size:12px;color:#475569;margin-top:12px">
    <span><i style="display:inline-block;width:11px;height:11px;background:rgba(34,197,94,.5);border:1px solid #16a34a;border-radius:2px;vertical-align:-1px"></i> 已覆盖</span>
    <span><i style="display:inline-block;width:11px;height:11px;background:rgba(239,68,68,.5);border:1px solid #dc2626;border-radius:2px;vertical-align:-1px"></i> 盲区</span>
    <span style="color:#94a3b8">栅格法估算，覆盖率＝区域内被任一视场覆盖的采样格占比</span></div>`;
  const body=res.regions.length? head+rows+legend
    : head+`<div class="hint-text" style="padding:8px 0">当前没有可用于统计的区域：请先绘制「区域」或勾选闭合的「折线」。</div>`;
  openModal('视场覆盖率分析', body, [
    {text:'清除叠加层',class:'',click:()=>{ coverageResult=null; closeModal(); requestRender(); }},
    {text:'关闭',class:'primary',click:closeModal}
  ]);
}

/* -------------------- 统一刷新 -------------------- */
function refreshUI(){
  populateSelects();
  $('showLabels').checked=!!state.settings.showLabels;
  const msEl=$('markerScaleInput');
  if(msEl) msEl.value=String(Number(state.settings.markerScale)||1);
  const msLbl=$('markerScaleLabel');
  if(msLbl) msLbl.textContent=(Number(state.settings.markerScale)||1).toFixed(1)+'×';
  renderProps(); renderList(); renderLayers(); renderTypes(); renderStats(); updateZoomLabel();
  updateHistoryButtons();
}
