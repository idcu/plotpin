/* ui-panels.js —— 侧栏页签、下拉、对象清单、图层/类型、统计、覆盖率与统一刷新 */
/* -------------------- UI：标签页 / 工具栏 -------------------- */
function switchTab(tab){
  document.querySelectorAll('.side-tab').forEach(b=>{
    const on=b.dataset.tab===tab;
    b.classList.toggle('active',on);
    if(b.hasAttribute('role')) b.setAttribute('aria-selected',on?'true':'false');
    b.tabIndex=on?0:-1;
  });
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.toggle('active',p.id==='tab-'+tab));
  /* 窄屏切换属性/清单等标签时自动展开覆盖侧栏 */
  if(window.matchMedia('(max-width:860px)').matches) document.body.classList.add('sidebar-open');
}
/** ARIA tablist 方向键：返回目标页签下标，非导航键返回 -1（纯函数便于自测） */
function tabTargetIndex(current,total,key){
  if(current<0||!total) return -1;
  if(key==='ArrowLeft') return (current+total-1)%total;
  if(key==='ArrowRight') return (current+1)%total;
  if(key==='Home') return 0;
  if(key==='End') return total-1;
  return -1;
}
document.querySelectorAll('.side-tab').forEach(b=>b.addEventListener('click',()=>{ switchTab(b.dataset.tab); b.focus(); }));
document.querySelectorAll('.side-tabs').forEach(list=>list.addEventListener('keydown',e=>{
  const tabs=Array.from(list.querySelectorAll('.side-tab'));
  const from=tabs.indexOf(document.activeElement);
  const to=tabTargetIndex(from,tabs.length,e.key);
  if(to<0) return;
  e.preventDefault();
  tabs[to].focus(); switchTab(tabs[to].dataset.tab);
}));
/* 窄屏侧栏覆盖层：☰ 开关；点画布/遮罩/顶栏空白区域关闭（触屏没有 hover，必须有点击关闭路径） */
$('sidebarToggle').addEventListener('click',()=>document.body.classList.toggle('sidebar-open'));
document.addEventListener('pointerdown',e=>{
  if(!document.body.classList.contains('sidebar-open')||!window.matchMedia('(max-width:860px)').matches) return;
  if(e.target.closest&&e.target.closest('.sidebar,#sidebarToggle')) return;
  document.body.classList.remove('sidebar-open');
},true);
wrap.addEventListener('pointerdown',()=>{ if(document.body.classList.contains('sidebar-open')&&window.matchMedia('(max-width:860px)').matches) document.body.classList.remove('sidebar-open'); });
document.querySelectorAll('.tool-btn[data-tool]').forEach(b=>b.addEventListener('click',()=>{
  const tool=b.dataset.tool;
  if(isCalibTool(tool)) startCalibTool(tool); else setTool(tool);
}));
/* 顶部下拉在 测距/其他标注 间切换时，同步左侧「测距」「标注」按钮互斥高亮 */
$('dimensionType').addEventListener('change',()=>{ if(currentTool==='dimension') syncToolButtons('dimension'); });
$('finishDraftBtn').addEventListener('click',finishDraft);
$('undoBtn').addEventListener('click',undo);
$('redoBtn').addEventListener('click',redo);
/* 依赖图片底图的工具统一走状态机：不可用时不切换工具，原因由 #calibStatus 与 toast 同步给出 */
function startCalibTool(tool){
  const pre=calibPrecheck(tool);
  if(!pre.ok){ if(pre.reason) toast(pre.reason,'warn'); refreshCalibStatus(); return false; }
  setTool(tool);
  return true;
}
$('affineBtn').addEventListener('click',()=>startCalibTool('affine'));
$('coverageBtn').addEventListener('click',runCoverageAnalysis);
$('zoomInBtn').addEventListener('click',()=>zoomAt(wrap.clientWidth/2,wrap.clientHeight/2,1.2));
$('zoomOutBtn').addEventListener('click',()=>zoomAt(wrap.clientWidth/2,wrap.clientHeight/2,1/1.2));
$('zoomFitBtn').addEventListener('click',fitView);
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
    sel.innerHTML=(include?`<option value="">${include}</option>`:'')+items.map(x=>`<option value="${esc(x.id)}">${esc(typeDisplayName(x))}</option>`).join('');
    sel.value=old && items.some(x=>x.id===old) ? old : fallback;
  };
  fill($('pointType'),typesOfKind('point'),'','point.marker');
  fill($('rectType'),typesOfKind('rect'),'','rect.area');
  fill($('lineType'),typesOfKind('line'),'','line.boundary');
  fill($('filterLayer'),state.layers,I18N.t('allLayers'),'');
  fill($('batchLayer'),state.layers,'',state.layers[0]?.id||'');
  const oldKind=$('filterKind').value;
  const kindLabels=[I18N.t('allObjects'),I18N.t('filterPoint'),I18N.t('filterArea'),I18N.t('filterLine'),I18N.t('filterText'),I18N.t('filterDimension')];
  $('filterKind').innerHTML=kindLabels.map((x,i)=>`<option value="${i?['','point','rect','line','text','dimension'][i]:''}">${esc(x)}</option>`).join('');
  $('filterKind').value=oldKind;
}

/* -------------------- 对象清单 -------------------- */
/**
 * 只同步列表的选中高亮/勾选，不重建行（N-23：画布点选热路径）。
 * 10k 对象时重建 tbody 约 240ms/次，而选中变化只影响 class 与 checkbox。
 */
function syncListSelection(){
  const body=$('objectTbody');
  if(!body) return;
  const rows=body.querySelectorAll('tr[data-id]');
  let all=rows.length>0;
  rows.forEach(tr=>{
    const on=selectedIds.has(tr.dataset.id);
    tr.classList.toggle('selected',on);
    const chk=tr.querySelector('input[data-row-select]');
    if(chk) chk.checked=on;
    if(!on) all=false;
  });
  const head=$('headSelectChk'); if(head) head.checked=all;
}
/** 选中集变化的最小 UI 刷新：属性面板 + 列表高亮（不重建 10k 行、不刷图层/统计） */
function refreshSelectionUI(){ renderProps(); syncListSelection(); }
function renderList(){
  const q=$('filterText').value.trim().toLowerCase(), kf=$('filterKind').value, lf=$('filterLayer').value;
  const rows=state.objects.filter(o=>(!kf||o.kind===kf)&&(!lf||o.layerId===lf)&&(!q||[o.name,o.text,JSON.stringify(o.props),getType(o.typeId).name].join(' ').toLowerCase().includes(q)));
  $('headSelectChk').checked=rows.length>0&&rows.every(o=>selectedIds.has(o.id));
  $('objectTbody').innerHTML=rows.map(o=>{
    const t=getType(o.typeId), l=layerOf(o);
    /* RT-P2-15：类型色与类型管理页同源，统一走导出层颜色白名单再转义，避免脏色值逃逸 style 属性 */
    const dotColor=esc(normalizeExportColor(t.color,'#666'));
    const param=o.kind==='rect'?areaParamText(o):
      o.kind==='point'?`${Math.round(o.angle)}°${(o.phys||0)>0?' / '+fmt(o.phys)+'m':''}`:
      o.kind==='line'?`${o.points.length} ${L('点')} / ${fmt(objectLength(o))}m${o.closed&&o.points.length>=3?' / '+fmt(polygonArea(o.points))+'㎡':''}`:
      o.kind==='text'?esc(o.text):(o.kind==='dimension'&&o.subtype==='ruler'?`${o.points.length} ${L('点')} / Σ ${fmt(objectLength(o))}m`:o.subtype||'');
    return `<tr data-id="${esc(o.id)}" class="${selectedIds.has(o.id)?'selected':''} ${o.locked?'locked':''} ${!o.visible?'hidden-row':''}">
      <td><input type="checkbox" data-row-select="${esc(o.id)}" ${selectedIds.has(o.id)?'checked':''}></td>
      <td>${esc(o.name)}</td><td>${esc(o.text||o.props.note||'')}</td><td><span class="dot" style="background:${dotColor}"></span>${esc(typeDisplayName(t))}</td>
      <td>${esc(l.name)}</td><td>${fmt(o.x)}</td><td>${fmt(o.y)}</td><td>${param}</td>
      <td><button class="icon-btn" data-toggle-visible="${o.id}" aria-label="${esc(I18N.t('ariaObjVisible')+'：'+o.name)}">${o.visible?'👁':'–'}</button></td>
      <td><button class="icon-btn" data-toggle-lock="${o.id}" aria-label="${esc(I18N.t('ariaObjLock')+'：'+o.name)}">${o.locked?'🔒':'○'}</button></td>
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
  $('objectTbody').querySelectorAll('[data-toggle-visible]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); const o=state.objects.find(x=>x.id===b.dataset.toggleVisible); if(!isEditable(o)) return toast('对象或图层已锁定','warn'); pushHistory(); o.visible=!o.visible; commitChange(undefined,[o.id]); });
  $('objectTbody').querySelectorAll('[data-toggle-lock]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); const o=state.objects.find(x=>x.id===b.dataset.toggleLock); if(layerOf(o).locked) return toast('图层已锁定','warn'); pushHistory(); o.locked=!o.locked; commitChange(undefined,[o.id]); });
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
$('batchLayerBtn').onclick=()=>{ const lid=$('batchLayer').value; if(!lid) return; const items=state.objects.filter(o=>selectedIds.has(o.id)&&isEditable(o)); if(!items.length) return toast('没有可修改的选中对象','warn'); pushHistory(); items.forEach(o=>o.layerId=lid); commitChange('已批量修改图层', items.map(o=>o.id)); };
$('batchMoveBtn').onclick=()=>{
  const dx=Number($('batchDx').value)||0,dy=Number($('batchDy').value)||0; if(!dx&&!dy) return;
  const items=state.objects.filter(o=>selectedIds.has(o.id)&&isEditable(o)); if(!items.length) return toast('没有可移动的选中对象','warn');
  pushHistory(); items.forEach(o=>{
    o.x+=dx;o.y+=dy;if(o.points)o.points=o.points.map(p=>[p[0]+dx,p[1]+dy]);
  }); commitChange('已批量平移', items.map(o=>o.id));
};
$('batchRotateBtn').onclick=()=>rotateSelected(Number($('batchAngle').value)||0);
$('batchDeleteBtn').onclick=deleteSelected;
/* 批量标注显隐：复用 annotToggleKeys / annotOn / setAnnot，与属性面板单对象语义一致 */
function setSelectedAnnot(on){
  const items=state.objects.filter(o=>selectedIds.has(o.id)&&isEditable(o));
  if(!items.length) return toast('没有可修改标注的选中对象','warn');
  const plan=[];
  items.forEach(o=>annotToggleKeys(o).forEach(k=>{ if(annotOn(o,k)!==on) plan.push([o,k]); }));
  if(!plan.length) return toast('选中对象标注状态未变化','warn');
  pushHistory();
  plan.forEach(([o,k])=>setAnnot(o,k,on));
  commitChange(on?'已批量显示标注':'已批量隐藏标注', Array.from(new Set(plan.map(([o])=>o.id))));
}
$('batchShowAnnotBtn').onclick=()=>setSelectedAnnot(true);
$('batchHideAnnotBtn').onclick=()=>setSelectedAnnot(false);

/* -------------------- 图层 / 类型管理 -------------------- */
function renderLayers(){
  $('layerList').innerHTML=state.layers.map(l=>{
    const count=state.objects.filter(o=>o.layerId===l.id).length;
    return `<div class="layer-row">
      <div class="meta"><div class="name">${esc(l.name)}</div><div class="sub">${count} ${esc(I18N.t('objectsUnit'))}</div></div>
      <button class="icon-btn" data-layer-visible="${l.id}" title="${esc(L('显隐'))}" aria-label="${esc(I18N.t('ariaLayerVisible')+'：'+l.name)}">${l.visible?'👁':'–'}</button>
      <button class="icon-btn" data-layer-lock="${l.id}" title="${esc(L('锁定'))}" aria-label="${esc(I18N.t('ariaLayerLock')+'：'+l.name)}">${l.locked?'🔒':'○'}</button>
      <button class="icon-btn" data-layer-rename="${l.id}" title="${esc(L('重命名'))}" aria-label="${esc(I18N.t('ariaLayerRename')+'：'+l.name)}">✎</button>
      <button class="icon-btn danger" data-layer-delete="${l.id}" title="${esc(L('删除'))}" aria-label="${esc(I18N.t('ariaLayerDelete')+'：'+l.name)}">×</button>
    </div>`;
  }).join('');
  $('layerList').querySelectorAll('[data-layer-visible]').forEach(b=>b.onclick=()=>{ const l=getLayer(b.dataset.layerVisible); pushHistory(); l.visible=!l.visible; commitChange(); });
  $('layerList').querySelectorAll('[data-layer-lock]').forEach(b=>b.onclick=()=>{ const l=getLayer(b.dataset.layerLock); pushHistory(); l.locked=!l.locked; commitChange(); });
  $('layerList').querySelectorAll('[data-layer-rename]').forEach(b=>b.onclick=async()=>{
    const l=getLayer(b.dataset.layerRename); const v=await showPrompt({title:L('重命名图层'),label:L('名称'),value:l.name}); if(v){ pushHistory(); l.name=v; commitChange(); }
  });
  $('layerList').querySelectorAll('[data-layer-delete]').forEach(b=>b.onclick=async()=>{
    const l=getLayer(b.dataset.layerDelete);
    if(!l) return;
    if(state.layers.length===1) return toast('至少保留一个图层','warn');
    /* N-08：跨楼层检查引用；有引用时显式确认并迁移到默认图层，避免其他楼层悬空 */
    const refs=floorRefs(o=>o.layerId===l.id);
    const target=state.layers.find(x=>x.id!==l.id&&x.id==='layer.default')||state.layers.find(x=>x.id!==l.id);
    if(refs.length){
      const total=refs.reduce((n,r)=>n+r.count,0);
      const ok=await showConfirm(L('图层「{layer}」在 {floors} 个楼层被 {count} 个对象使用；删除后将迁移到「{target}」。是否继续？',
        {layer:l.name,floors:refs.length,count:total,target:target.name}));
      if(!ok) return;
    }
    pushHistory();
    if(refs.length) state.floors.forEach(f=>(f.objects||[]).forEach(o=>{ if(o&&o.layerId===l.id) o.layerId=target.id; }));
    state.layers=state.layers.filter(x=>x.id!==l.id); commitChange('已删除图层');
  });
}
function getLayer(id){ return state.layers.find(l=>l.id===id); }
$('addLayerBtn').onclick=()=>{
  const name=$('newLayerName').value.trim()||'新图层';
  pushHistory(); state.layers.push({id:uid('layer'),name,visible:true,locked:false}); $('newLayerName').value=''; commitChange('已新增图层');
};
function renderTypes(){
  const groups={point:I18N.t('point'),rect:I18N.t('filterArea'),line:I18N.t('filterLine')};
  $('typeList').innerHTML=Object.entries(groups).map(([kind,label])=>`
    <h3>${label}</h3>
    ${typesOfKind(kind).map(t=>`<div class="type-row">
      <div class="meta"><div class="name"><span class="dot" style="background:${esc(normalizeExportColor(t.color,'#666'))}"></span>${esc(typeDisplayName(t))}</div><div class="sub">${esc(I18N.t(t.builtin?'builtinType':'customType'))} · ${esc(normalizeIcon(t.icon,t.kind))}${kind==='point'?' · '+esc(L(POINT_SCALE_SHAPES[t.scaleShape]||POINT_SCALE_SHAPES.none))+' · '+esc(L('图标'))+' '+(Number(t.iconSize)||1).toFixed(2)+'×':''}</div></div>
      ${kind==='point'&&!t.builtin?`<input type="number" min=".5" max="5" step=".1" title="${esc(L('默认图标大小（屏幕倍率）'))}" value="${Number(t.iconSize)||1}" data-type-iconsize="${esc(t.id)}" style="width:52px" aria-label="${esc(I18N.t('iconSizeLabel')+'：'+t.name)}">`:''}
      <input type="color" value="${esc(t.color)}" data-type-color="${esc(t.id)}" ${t.builtin?'disabled':''} aria-label="${esc(I18N.t('ariaTypeColor')+'：'+typeDisplayName(t))}">
      <button class="icon-btn" data-type-rename="${esc(t.id)}" ${t.builtin?'disabled':''} aria-label="${esc(I18N.t('ariaTypeRename')+'：'+typeDisplayName(t))}">✎</button>
      <button class="icon-btn danger" data-type-delete="${esc(t.id)}" ${t.builtin?'disabled':''} aria-label="${esc(I18N.t('ariaTypeDelete')+'：'+typeDisplayName(t))}">×</button>
    </div>`).join('')}`).join('');
  $('typeList').querySelectorAll('[data-type-color]').forEach(i=>i.onchange=()=>{ const t=state.objectTypes.find(x=>x.id===i.dataset.typeColor); pushHistory(); t.color=i.value; commitChange(); });
  $('typeList').querySelectorAll('[data-type-iconsize]').forEach(i=>i.onchange=()=>{ const t=state.objectTypes.find(x=>x.id===i.dataset.typeIconsize); const v=Math.min(5,Math.max(.5,Number(i.value)||1)); pushHistory(); t.iconSize=v; commitChange(); });
  $('typeList').querySelectorAll('[data-type-rename]').forEach(b=>b.onclick=async()=>{
    const t=state.objectTypes.find(x=>x.id===b.dataset.typeRename); const v=await showPrompt({title:L('重命名类型'),label:L('名称'),value:t.name}); if(v){ pushHistory(); t.name=v; commitChange(); }
  });
  $('typeList').querySelectorAll('[data-type-delete]').forEach(b=>b.onclick=async()=>{
    const t=state.objectTypes.find(x=>x.id===b.dataset.typeDelete);
    if(!t) return;
    /* N-08：跨楼层检查引用；有引用时显式确认并迁移到同类内置类型，避免其他楼层悬空 */
    const refs=floorRefs(o=>o.typeId===t.id);
    const target=state.objectTypes.find(x=>x.id===defaultTypeId(t.kind)&&x.id!==t.id);
    if(refs.length&&!target) return toast('该类型仍被对象使用，且没有可迁移的同类内置类型','warn');
    if(refs.length){
      const total=refs.reduce((n,r)=>n+r.count,0);
      const ok=await showConfirm(L('类型「{type}」在 {floors} 个楼层被 {count} 个对象使用；删除后将迁移到「{target}」。是否继续？',
        {type:typeDisplayName(t),floors:refs.length,count:total,target:typeDisplayName(target)}));
      if(!ok) return;
    }
    pushHistory();
    if(refs.length) state.floors.forEach(f=>(f.objects||[]).forEach(o=>{ if(o&&o.typeId===t.id) o.typeId=target.id; }));
    state.objectTypes=state.objectTypes.filter(x=>x.id!==t.id); commitChange('已删除类型');
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

$('importSymBtn').onclick=()=>$('symFileInput').click();
$('symFileInput').addEventListener('change',async e=>{
  const f=e.target.files[0]; e.target.value='';
  if(!f) return;
  try{
    const parsed=parseSvgSymbol(await f.text());
    const name=(f.name||'SVG 图元').replace(/\.svg$/i,'').slice(0,30)||'SVG 图元';
    pushHistory();
    state.objectTypes.push({id:uid('sym'),kind:'point',name,color:'#7c3aed',icon:'symbol',
      scaleShape:'none',builtin:false,symbol:parsed.paths,symbolViewBox:parsed.vb});
    commitChange(L('已导入 SVG 图元：{name}',{name}));
    populateSelects(); renderTypes(); renderSymbolPanel();
  }catch(err){ toast(L('SVG 导入失败：{msg}',{msg:err.message}),'error'); }
});

/* -------------------- 符号库面板（C-04） -------------------- */
function symbolAliasText(t){
  const lib=SYMBOL_LIBRARY.find(x=>x.id===t.id);
  return (lib&&lib.aliases)||t.symbolAliases||[];
}
function symbolCategory(t){
  const lib=SYMBOL_LIBRARY.find(x=>x.id===t.id);
  return (lib&&lib.cat)||t.category||'其他';
}
/** 预览与画布/SVG 共用 symbolPathsFor 的 path 源，避免三套图形不一致 */
function symbolPreviewSvg(t,size){
  const vb=normalizeSymbolViewBox(t.symbolViewBox);
  const paths=symbolPathsFor(t).map(p=>`<path d="${esc(p.d)}" fill="${p.fill?esc(t.color||'#7c3aed'):'none'}" stroke="${p.fill?'none':esc(t.color||'#7c3aed')}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  const px=size||34;
  return `<svg viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" width="${px}" height="${px}" aria-hidden="true" focusable="false">${paths}</svg>`;
}
function renderSymbolPanel(){
  const grid=$('symbolGrid');
  if(!grid) return;
  const catSel=$('symbolCat');
  if(catSel&&catSel.options.length<=1){
    SYMBOL_CATEGORIES.forEach(c=>{ const o=document.createElement('option'); o.value=c; o.textContent=L(c); catSel.appendChild(o); });
  }else if(catSel){
    Array.from(catSel.options).forEach(o=>{ if(o.value) o.textContent=L(o.value); });
  }
  const q=String(($('symbolSearch')&&$('symbolSearch').value)||'').trim().toLowerCase();
  const cat=(catSel&&catSel.value)||'';
  const list=state.objectTypes.filter(t=>t&&t.kind==='point'&&Array.isArray(t.symbol)&&t.symbol.length)
    .filter(t=>{
      if(cat&&symbolCategory(t)!==cat) return false;
      if(!q) return true;
      const text=[t.id,t.name,typeDisplayName(t)].concat(symbolAliasText(t)).join(' ').toLowerCase();
      return text.includes(q);
    });
  grid.innerHTML=list.length?list.map(t=>`
    <button type="button" class="symbol-tile" data-symbol-id="${esc(t.id)}" title="${esc(symbolAliasText(t).join(' / ')||typeDisplayName(t))}">
      ${symbolPreviewSvg(t)}
      <span>${esc(typeDisplayName(t))}</span>
    </button>`).join(''):`<div class="hint-text">${esc(L('没有匹配的符号'))}</div>`;
  grid.querySelectorAll('[data-symbol-id]').forEach(b=>b.onclick=()=>{
    const t=state.objectTypes.find(x=>x.id===b.dataset.symbolId);
    if(!t) return;
    symbolPlace.angle=Number($('symbolAngle')&&$('symbolAngle').value)||0;
    symbolPlace.phys=Math.max(0,Number($('symbolPhys')&&$('symbolPhys').value)||0);
    const sel=$('pointType'); if(sel) sel.value=t.id;
    setTool('point');
    toast(L('已选择符号「{name}」，点击画布放置',{name:typeDisplayName(t)}),'success');
  });
  const count=$('symbolCount');
  if(count) count.textContent=L('共 {n} 个符号（六类内置 + 自有导入）',{n:list.length});
}
function exportSymbolBundle(){
  const bundle=customSymbolsFromTypes(state.objectTypes,state.meta);
  if(!bundle.symbols.length) return toast(L('当前工程没有自定义符号可导出'),'warn');
  downloadBlob(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}),safeName()+'-symbols.json');
  toast(L('已导出 {n} 个自定义符号（仅当前工程）',{n:bundle.symbols.length}),'success');
}
async function importSymbolBundleFile(file){
  try{
    const raw=JSON.parse(await file.text());
    const types=sanitizeSymbolBundle(raw,state.objectTypes.map(t=>t.id));
    if(!types.length) return toast(L('JSON 中没有可导入的符号'),'warn');
    pushHistory();
    state.objectTypes.push(...types);
    commitChange(L('已导入自定义符号：{n} 个',{n:types.length}));
    populateSelects(); renderTypes(); renderSymbolPanel();
    toast(L('已导入 {n} 个符号（仅写入当前工程）',{n:types.length}),'success');
  }catch(err){ toast(L('符号 JSON 导入失败：{msg}',{msg:err.message}),'error'); }
}
if($('symbolSearch')) $('symbolSearch').addEventListener('input',renderSymbolPanel);
if($('symbolCat')) $('symbolCat').addEventListener('change',renderSymbolPanel);
if($('symbolImportSvgBtn')) $('symbolImportSvgBtn').onclick=()=>$('symFileInput').click();
if($('symbolExportJsonBtn')) $('symbolExportJsonBtn').onclick=exportSymbolBundle;
if($('symbolImportJsonBtn')) $('symbolImportJsonBtn').onclick=()=>$('symbolJsonInput').click();
if($('symbolJsonInput')) $('symbolJsonInput').addEventListener('change',async e=>{
  const f=e.target.files[0]; e.target.value='';
  if(f) await importSymbolBundleFile(f);
});

/* -------------------- 统计 / 校验 -------------------- */
/** 清单/报告中区域形状的参数摘要 */
function areaParamText(o){
  const tt=areaShapeType(o), sh=o.shape||{};
  if(tt==='circle') return `${L('圆形')} r=${fmt(sh.r)}m`;
  if(tt==='ellipse') return `${L('椭圆')} ${fmt(sh.rx*2)}×${fmt(sh.ry*2)}m / ${Math.round(o.angle)}°`;
  if(tt==='sector') return `${L('扇形')} r=${fmt(sh.r)}m / ${Math.round(sectorSweep(sh))}°`;
  if(tt==='parallelogram') return `${L('平行四边形')} ${fmt(o.width)}×${fmt(o.height)}m / ${L('倾角')} ${Math.round(parallelogramSkew(sh))}°`;
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
/** RT-P2-14：统计页越界与规则页共用场地包围盒和容差；无可见场地时退回图片/世界取景框 */
function issueBoundsFrame(){
  const site=state.site;
  if(site&&site.shape&&siteIsVisible(site)) return siteBounds(site);
  return worldDims();
}
function issueBoundsTolerance(){
  const raw=state.rules&&state.rules.bounds?state.rules.bounds.tolerance:undefined;
  return ruleTolerance(raw,0.05);
}
/**
 * 闭合轮廓自交检测（F16）：线段按 minX 排序后只比较 x 区间重叠的对，
 * 并对 y 区间做廉价预筛；相邻边（首尾相接）跳过。O(n log n + 候选对)。
 */
function polygonSelfIntersects(pts){
  const n=pts.length, segs=new Array(n);
  for(let i=0;i<n;i++){
    const a=pts[i], b=pts[(i+1)%n];
    segs[i]={i,minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0]),
      minY:Math.min(a[1],b[1]),maxY:Math.max(a[1],b[1])};
  }
  segs.sort((p,q)=>p.minX-q.minX);
  for(let s=0;s<n;s++){
    const A=segs[s];
    for(let t=s+1;t<n&&segs[t].minX<=A.maxX;t++){
      const B=segs[t];
      if(B.i===A.i||B.minY>A.maxY||B.maxY<A.minY) continue;
      const gi=(A.i-B.i+n)%n, gj=(B.i-A.i+n)%n;
      if(gi===1||gj===1) continue;                    /* 相邻边共享端点，不算自交 */
      if(segmentsIntersect(pts[A.i],pts[(A.i+1)%n],pts[B.i],pts[(B.i+1)%n])) return true;
    }
  }
  return false;
}
function findIssues(){
  const issues=[]; const d=issueBoundsFrame(); const tol=issueBoundsTolerance();
  state.objects.forEach(o=>{
    /* F16：统计检查只统计可见对象，与规则页口径一致（CORE-P2-11 既有说明） */
    if(!isVisible(o)) return;
    if(o.kind==='rect'){
      const tt=areaShapeType(o), sh=o.shape||{};
      const small=tt==='rect'?(o.width<.05||o.height<.05)
        :tt==='circle'?sh.r<.05
        :tt==='ellipse'?((sh.rx||0)<.05||(sh.ry||0)<.05)
        :(sh.r||0)<.05;
      if(small) issues.push(`${o.name} ${L('尺寸过小')}`);
    }
    if(o.kind==='line'&&o.points.length<2) issues.push(`${o.name} ${L('折线节点不足')}`);
    if(o.closed&&o.points.length>=3&&polygonSelfIntersects(o.points)) issues.push(`${o.name} ${L('存在自相交')}`);
    if(o.kind==='point'&&(o.phys||0)>0&&o.phys>Math.max(d.w,d.h))
      issues.push(`${o.name} ${L('物理尺寸')} ${fmt(o.phys)}m ${L('超过场地长边')} ${fmt(Math.max(d.w,d.h))}m`);
    const b=objectBounds(o);
    if(b.maxX<d.minX-tol||b.minX>d.maxX+tol||b.maxY<d.minY-tol||b.minY>d.maxY+tol) issues.push(`${o.name} ${L('超出场地范围')}`);
  });
  return issues;
}
function renderStats(){
  const counts={point:0,rect:0,line:0,text:0,dimension:0};
  state.objects.forEach(o=>counts[o.kind]++);
  const area=state.objects.reduce((s,o)=>s+objectArea(o),0);
  const len=state.objects.reduce((s,o)=>s+objectLength(o),0);
  const issues=findIssues();
  const fs=floorSummaries();
  $('statsPanel').innerHTML=`
    <div class="stat-grid">
      <div class="stat-card">${esc(L('点设备'))}<b>${counts.point}</b></div>
      <div class="stat-card">${esc(L('矩形/区域'))}<b>${counts.rect}</b></div>
      <div class="stat-card">${esc(L('线段/折线'))}<b>${counts.line}</b></div>
      <div class="stat-card">${esc(L('文字'))}<b>${counts.text}</b></div>
      <div class="stat-card">${esc(L('标注总长'))}<b>${fmt(len)} m</b></div>
      <div class="stat-card">${esc(L('区域总面积'))}<b>${fmt(area)} ㎡</b></div>
    </div>
    ${fs.rows.length>1?`<div class="section" style="margin-top:10px"><h3>${esc(L('楼层汇总'))}</h3>
      <table class="floor-sum-table"><thead><tr>
        <th>${esc(L('楼层'))}</th><th>${esc(L('对象'))}</th><th>${esc(L('点设备'))}</th><th>${esc(L('区域'))}</th><th>${esc(L('折线'))}</th><th>${esc(L('总长'))}</th><th>${esc(L('总面积'))}</th>
      </tr></thead><tbody>
        ${fs.rows.map(r=>`<tr data-floor-sum="${esc(r.id)}" class="${r.active?'active':''}" title="${esc(L('点击切换到该楼层'))}">
          <td>${esc(r.name)}${r.active?' ★':''}</td><td>${r.count}</td><td>${r.counts.point}</td><td>${r.counts.rect}</td><td>${r.counts.line}</td><td>${fmt(r.len)} m</td><td>${fmt(r.area)} ㎡</td></tr>`).join('')}
        <tr class="total"><td>${esc(L('全楼合计'))}</td><td>${fs.total.count}</td><td>${fs.total.counts.point}</td><td>${fs.total.counts.rect}</td><td>${fs.total.counts.line}</td><td>${fmt(fs.total.len)} m</td><td>${fmt(fs.total.area)} ㎡</td></tr>
      </tbody></table>
      <p class="hint-text">${esc(L('点击楼层行可切换；汇总覆盖全部楼层。'))}</p></div>`:''}
    <div class="section" style="margin-top:10px"><h3>${esc(L('工程信息'))}</h3><div class="kv-list">
      <span>${esc(L('工程名称'))}</span><b>${esc(state.meta.name)}</b><span>${esc(L('场地'))}</span><b>${esc(L(siteKindName(state.site?.kind||state.background.kind)))}</b>
      <span>${esc(L('场地参数'))}</span><b>${esc(siteDescriptionParts().detail)}</b>
      <span>${esc(L('对象总数'))}</span><b>${state.objects.length}</b><span>${esc(L('最近更新'))}</span><b>${new Date(state.meta.updatedAt).toLocaleString()}</b>
    </div></div>
    <div class="section"><h3>${esc(L('几何检查'))} v${STATS_ISSUE_VERSION}</h3>${issues.length?issues.map(x=>`<div class="issue">${esc(x)}</div>`).join(''):`<div class="ok-banner">${esc(L('未发现明显的零尺寸、自相交或越界问题。'))}</div>`}</div>
    <div class="section"><h3>${esc(L('本地存储'))}</h3><div id="storageBox"><div class="hint-text">${esc(L('统计中…'))}</div></div></div>`;
  $('statsPanel').querySelectorAll('tr[data-floor-sum]').forEach(tr=>{
    tr.onclick=async()=>{
      const id=tr.dataset.floorSum;
      if(!id||id===state.activeFloorId) return;
      try{ if(await switchFloor(id)) toast(L('已切换到楼层：{name}',{name:currentFloorName()}),'success'); }
      catch(e){ toast(L('楼层操作失败：{msg}',{msg:e.message}),'error'); }
    };
  });
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
      '<div class="kv-list"><span>'+esc(L('占用'))+'（'+esc(L(sourceLabel))+'）</span><b>'+formatBytes(used)+'</b>'+
      (quota?'<span>'+esc(L('浏览器配额'))+'</span><b>'+formatBytes(quota)+'</b><span>'+esc(L('使用率'))+'</span><b>'+pct.toFixed(1)+'%</b>':'')+
      '</div>'+
      (pct>=85
        ? '<div class="issue">'+esc(L('存储使用率较高：可移除不用的底图，或导出 JSON 备份后清理本站数据。'))+'</div>'
        : '<p class="hint-text">'+esc(L('工程与底图存于 IndexedDB（底图按内容哈希去重），设置存于 localStorage。'))+'</p>');
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
  /* 口径 v2：固定目标格数（按可见区域面积分配），与视口缩放/画布像素无关 */
  const res=analyzeCoverage(state);
  coverageResult=res;
  invalidateStatic();               /* 覆盖率叠加层属于静态层 */
  requestRender();
  const pct=x=>(x*100).toFixed(1)+'%';
  const cells=res.regions.map(r=>r.cell);
  const cellMin=cells.length?Math.min(...cells):0, cellMax=cells.length?Math.max(...cells):0;
  const head=`<div style="font-size:13px;line-height:1.9;margin-bottom:10px">
    <div>${esc(L('参与统计的点设备：'))}<b>${res.cameraCount}</b> ${esc(L('个'))}${esc(L('（含物理尺寸的圆/球机、扇形/摄像头、方形覆盖）'))}${res.ignoredPoints?`；${esc(L('仅标识位置的图标点'))} <b>${res.ignoredPoints}</b> ${esc(L('个未计入'))}`:''}</div>
    <div>${esc(L('区域/闭合折线：'))}<b>${res.regions.length}</b> ${esc(L('个'))} ｜ ${esc(L('合计覆盖'))} <b>${pct(res.ratio)}</b></div>
    <div>${esc(L('覆盖面积'))} <b>${fmt(res.totalCovered)}</b> m² ｜ ${esc(L('盲区'))} <b>${fmt(res.totalBlind)}</b> m² ｜ ${esc(L('总面积'))} <b>${fmt(res.totalArea)}</b> m²</div>
    <div style="margin-top:6px"><b>${esc(L('统计口径 v3'))}</b>：${esc(L('固定目标'))} <b>${res.targetCells}</b> ${esc(L('格，按可见区域面积分配（实际'))} <b>${res.gridCells}</b> ${esc(L('格），格边'))} <b>${fmt(cellMin)}–${fmt(cellMax)}</b> m</div>
    <div class="hint-text">${esc(L('统计与画布缩放/像素/DPR 无关；区域面积用解析公式（圆/椭圆/扇形不再按采样多边形近似），与统计面板、报告同源。历史 v1/v2 报告数值不可直接对比。'))}</div>
    <div class="hint-text">${esc(L('镜头口径：张角取类型 fov（默认 90°，限制 10–360°，360° 视为全向）；有效距离取点设备「物理尺寸」phys(m)：扇形半径=phys，圆/方=phys/2；未填 phys 的图标点不计入。隐藏对象与隐藏图层不进入分母。'))}</div>
  </div>`;
  const rows=res.regions.map(r=>`<div style="display:flex;justify-content:space-between;gap:14px;padding:6px 0;border-top:1px solid #eef2f7">
    <span style="font-weight:600">${esc(r.name)}</span>
    <span>${esc(L('覆盖'))} <b>${pct(r.ratio)}</b> ｜ ${fmt(r.coveredArea)}/${fmt(r.area)} m² ｜ ${esc(L('盲区'))} ${fmt(r.blindArea)} m²</span></div>`).join('');
  const legend=`<div style="display:flex;gap:16px;font-size:12px;color:#475569;margin-top:12px">
    <span><i style="display:inline-block;width:11px;height:11px;background:rgba(34,197,94,.5);border:1px solid #16a34a;border-radius:2px;vertical-align:-1px"></i> ${esc(L('已覆盖'))}</span>
    <span><i style="display:inline-block;width:11px;height:11px;background:rgba(239,68,68,.5);border:1px solid #dc2626;border-radius:2px;vertical-align:-1px"></i> ${esc(L('盲区'))}</span>
    <span style="color:#94a3b8">${esc(L('栅格法估算，覆盖率＝区域内被任一视场覆盖的采样格占比'))}</span></div>`;
  const body=res.regions.length? head+rows+legend
    : head+`<div class="hint-text" style="padding:8px 0">${esc(L('当前没有可用于统计的区域：请先绘制「区域」或勾选闭合的「折线」。'))}</div>`;
  openModal(L('视场覆盖率分析'), body, [
    {text:L('布点优化…'),class:'',click:()=>{ closeModal(); runPlacementOptimization(); }},
    {text:L('导出盲区 GeoJSON'),class:'',click:exportBlindSpotsGeoJson},
    {text:L('清除叠加层'),class:'',click:()=>{ clearCoverageResult(); invalidateStatic(); closeModal(); requestRender(); }},
    {text:L('关闭'),class:'primary',click:closeModal}
  ]);
}
/**
 * 布点优化：输入视场参数与目标覆盖率，贪心给出新增点位建议及「加一台能提升多少」。
 * 应用建议后自动重跑覆盖率分析，形成闭环。
 */
async function runPlacementOptimization(){
  const v=await showPrompt({title:L('布点优化'),label:L('视场半径(m), 张角(°), 目标覆盖率(%), 最多新增台数（如 120,90,90,5）'),value:'120,90,90,5'});
  if(v===null) return;
  const m=v.split(/[,，\s]+/).map(Number);
  const phys=m[0]>0?m[0]:120, fov=m[1]>0?m[1]:90;
  const targetRatio=Math.max(.1,Math.min(1,(m[2]>0?m[2]:90)/100));
  const maxAdd=Math.max(1,Math.min(50,m[3]>0?m[3]:5));
  const res=optimizeCameraPlacement(state,{phys,fov,targetRatio,maxAdd});
  if(res.empty){ toast(L('没有可用于布点的区域：请先绘制区域或闭合折线'),'warn'); return; }
  const pct=x=>(x*100).toFixed(1)+'%';
  const rows=res.suggestions.map((s,i)=>`<tr>
    <td>${i+1}</td><td>${fmt(s.x)}, ${fmt(s.y)}</td><td>${Math.round(s.angle)}°</td>
    <td>${fmt(s.gain)} ㎡（${pct(s.gainRatio)}）</td><td>${pct(s.ratioAfter)}</td></tr>`).join('');
  const body=`<div style="font-size:13px;line-height:1.9;margin-bottom:10px">
      ${esc(L('当前覆盖'))} <b>${pct(res.beforeRatio)}</b> → ${esc(L('预计'))} <b>${pct(res.afterRatio)}</b>（${esc(L('目标'))} ${pct(res.targetRatio)}）${res.reached?`，<b style="color:#16a34a">${esc(L('已达标'))}</b>`:`，${esc(L('仍未达标'))}`}
      <br><span class="hint-text">${esc(L('视场半径'))} ${fmt(res.phys)} m ｜ ${esc(L('张角'))} ${res.fov}° ｜ ${esc(L('仅在「区域/闭合折线」内统计；建议点位可位于场地边界外（立杆/壁挂）'))}</span></div>
    ${rows?`<div class="scroll"><table><thead><tr><th>#</th><th>${esc(L('建议位置 X, Y (m)'))}</th><th>${esc(L('朝向'))}</th><th>${esc(L('新增覆盖'))}</th><th>${esc(L('累计覆盖'))}</th></tr></thead><tbody>${rows}</tbody></table></div>`
      :`<p class="hint-text">${esc(L('当前已达标，无需新增点位。'))}</p>`}`;
  const buttons=[{text:L('关闭'),class:'',click:closeModal}];
  if(res.suggestions.length){
    buttons.unshift({text:L('应用建议（新增 {n} 台）',{n:res.suggestions.length}),class:'primary',click:()=>{
      pushHistory();
      const typeId=defaultTypeId('point')==='point.marker'?'point.camera':defaultTypeId('point');
      withObjectNameScope(allObjectNames(), () => res.suggestions.forEach(s=>{
        const o=baseObject('point',state.objectTypes.some(t=>t.id==='point.camera')?'point.camera':typeId,
          {x:Math.round(s.x*100)/100,y:Math.round(s.y*100)/100,angle:s.angle,phys:s.phys});
        state.objects.push(o);
      }));
      closeModal(); commitChange(L('已按建议新增 {n} 台摄像头',{n:res.suggestions.length}));
      runCoverageAnalysis();
    }});
  }
  openModal(L('布点优化（贪心覆盖最大化）'),body,buttons);
}

/* -------------------- 统一刷新 -------------------- */
function refreshUI(){
  populateSelects();
  const msEl=$('markerScaleInput');
  if(msEl) msEl.value=String(Number(state.settings.markerScale)||1);
  const msLbl=$('markerScaleLabel');
  if(msLbl) msLbl.textContent=(Number(state.settings.markerScale)||1).toFixed(1)+'×';
  renderProps(); renderList(); renderLayers(); renderTypes(); renderSymbolPanel(); renderStats(); updateZoomLabel();
  updateHistoryButtons();
  refreshCalibStatus();
}
