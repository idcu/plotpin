/* ui-panels.js —— 侧栏页签、下拉、对象清单、图层/类型、统计、覆盖率与统一刷新 */
/* ui-panels.js —— 标签页、属性面板、对象清单、图层/类型管理、统计与存储占用 */
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
function renderList(){
  const q=$('filterText').value.trim().toLowerCase(), kf=$('filterKind').value, lf=$('filterLayer').value;
  const rows=state.objects.filter(o=>(!kf||o.kind===kf)&&(!lf||o.layerId===lf)&&(!q||[o.name,o.text,JSON.stringify(o.props),getType(o.typeId).name].join(' ').toLowerCase().includes(q)));
  $('headSelectChk').checked=rows.length>0&&rows.every(o=>selectedIds.has(o.id));
  $('objectTbody').innerHTML=rows.map(o=>{
    const t=getType(o.typeId), l=layerOf(o);
    const param=o.kind==='rect'?areaParamText(o):
      o.kind==='point'?`${Math.round(o.angle)}°${(o.phys||0)>0?' / '+fmt(o.phys)+'m':''}`:
      o.kind==='line'?`${o.points.length} ${L('点')} / ${fmt(objectLength(o))}m${o.closed&&o.points.length>=3?' / '+fmt(polygonArea(o.points))+'㎡':''}`:
      o.kind==='text'?esc(o.text):(o.kind==='dimension'&&o.subtype==='ruler'?`${o.points.length} ${L('点')} / Σ ${fmt(objectLength(o))}m`:o.subtype||'');
    return `<tr data-id="${esc(o.id)}" class="${selectedIds.has(o.id)?'selected':''} ${o.locked?'locked':''} ${!o.visible?'hidden-row':''}">
      <td><input type="checkbox" data-row-select="${esc(o.id)}" ${selectedIds.has(o.id)?'checked':''}></td>
      <td>${esc(o.name)}</td><td>${esc(o.text||o.props.note||'')}</td><td><span class="dot" style="background:${t.color}"></span>${esc(typeDisplayName(t))}</td>
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
      <div class="meta"><div class="name">${esc(l.name)}</div><div class="sub">${count} ${esc(I18N.t('objectsUnit'))}</div></div>
      <button class="icon-btn" data-layer-visible="${l.id}" title="显隐" aria-label="${esc(I18N.t('ariaLayerVisible')+'：'+l.name)}">${l.visible?'👁':'–'}</button>
      <button class="icon-btn" data-layer-lock="${l.id}" title="锁定" aria-label="${esc(I18N.t('ariaLayerLock')+'：'+l.name)}">${l.locked?'🔒':'○'}</button>
      <button class="icon-btn" data-layer-rename="${l.id}" title="重命名" aria-label="${esc(I18N.t('ariaLayerRename')+'：'+l.name)}">✎</button>
      <button class="icon-btn danger" data-layer-delete="${l.id}" title="删除" aria-label="${esc(I18N.t('ariaLayerDelete')+'：'+l.name)}">×</button>
    </div>`;
  }).join('');
  $('layerList').querySelectorAll('[data-layer-visible]').forEach(b=>b.onclick=()=>{ const l=getLayer(b.dataset.layerVisible); pushHistory(); l.visible=!l.visible; commitChange(); });
  $('layerList').querySelectorAll('[data-layer-lock]').forEach(b=>b.onclick=()=>{ const l=getLayer(b.dataset.layerLock); pushHistory(); l.locked=!l.locked; commitChange(); });
  $('layerList').querySelectorAll('[data-layer-rename]').forEach(b=>b.onclick=async()=>{
    const l=getLayer(b.dataset.layerRename); const v=await showPrompt({title:L('重命名图层'),label:L('名称'),value:l.name}); if(v){ pushHistory(); l.name=v; commitChange(); }
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
  const groups={point:I18N.t('point'),rect:I18N.t('filterArea'),line:I18N.t('filterLine')};
  $('typeList').innerHTML=Object.entries(groups).map(([kind,label])=>`
    <h3>${label}</h3>
    ${typesOfKind(kind).map(t=>`<div class="type-row">
      <div class="meta"><div class="name"><span class="dot" style="background:${t.color}"></span>${esc(typeDisplayName(t))}</div><div class="sub">${esc(I18N.t(t.builtin?'builtinType':'customType'))} · ${t.icon||''}${kind==='point'?' · '+esc(L(POINT_SCALE_SHAPES[t.scaleShape]||POINT_SCALE_SHAPES.none))+' · '+esc(L('图标'))+' '+(Number(t.iconSize)||1).toFixed(2)+'×':''}</div></div>
      ${kind==='point'&&!t.builtin?`<input type="number" min=".5" max="5" step=".1" title="默认图标大小（屏幕倍率）" value="${Number(t.iconSize)||1}" data-type-iconsize="${t.id}" style="width:52px" aria-label="${esc(I18N.t('iconSizeLabel')+'：'+t.name)}">`:''}
      <input type="color" value="${t.color}" data-type-color="${t.id}" ${t.builtin?'disabled':''} aria-label="${esc(I18N.t('ariaTypeColor')+'：'+typeDisplayName(t))}">
      <button class="icon-btn" data-type-rename="${t.id}" ${t.builtin?'disabled':''} aria-label="${esc(I18N.t('ariaTypeRename')+'：'+typeDisplayName(t))}">✎</button>
      <button class="icon-btn danger" data-type-delete="${t.id}" ${t.builtin?'disabled':''} aria-label="${esc(I18N.t('ariaTypeDelete')+'：'+typeDisplayName(t))}">×</button>
    </div>`).join('')}`).join('');
  $('typeList').querySelectorAll('[data-type-color]').forEach(i=>i.onchange=()=>{ const t=state.objectTypes.find(x=>x.id===i.dataset.typeColor); pushHistory(); t.color=i.value; commitChange(); });
  $('typeList').querySelectorAll('[data-type-iconsize]').forEach(i=>i.onchange=()=>{ const t=state.objectTypes.find(x=>x.id===i.dataset.iconsize); const v=Math.min(5,Math.max(.5,Number(i.value)||1)); pushHistory(); t.iconSize=v; commitChange(); });
  $('typeList').querySelectorAll('[data-type-rename]').forEach(b=>b.onclick=async()=>{
    const t=state.objectTypes.find(x=>x.id===b.dataset.typeRename); const v=await showPrompt({title:L('重命名类型'),label:L('名称'),value:t.name}); if(v){ pushHistory(); t.name=v; commitChange(); }
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
    commitChange('已导入 SVG 图元：'+name);
    populateSelects(); renderTypes();
  }catch(err){ toast('SVG 导入失败：'+err.message,'error'); }
});

/* -------------------- 统计 / 校验 -------------------- */
/** 清单/报告中区域形状的参数摘要 */
function areaParamText(o){
  const tt=areaShapeType(o), sh=o.shape||{};
  if(tt==='circle') return `圆形 r=${fmt(sh.r)}m`;
  if(tt==='ellipse') return `椭圆 ${fmt(sh.rx*2)}×${fmt(sh.ry*2)}m / ${Math.round(o.angle)}°`;
  if(tt==='sector') return `扇形 r=${fmt(sh.r)}m / ${Math.round(sectorSweep(sh))}°`;
  if(tt==='parallelogram') return `平行四边形 ${fmt(o.width)}×${fmt(o.height)}m / 倾角 ${Math.round(parallelogramSkew(sh))}°`;
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
      if(small) issues.push(`${o.name} ${L('尺寸过小')}`);
    }
    if(o.kind==='line'&&o.points.length<2) issues.push(`${o.name} ${L('折线节点不足')}`);
    if(o.closed&&o.points.length>=3){
      for(let i=0;i<o.points.length;i++) for(let j=i+1;j<o.points.length;j++){
        const a=o.points[i],b=o.points[(i+1)%o.points.length],c=o.points[j],dd=o.points[(j+1)%o.points.length];
        if(j!==i&&(j+1)%o.points.length!==i&&segmentsIntersect(a,b,c,dd)) issues.push(`${o.name} ${L('存在自相交')}`);
      }
    }
    if(o.kind==='point'&&(o.phys||0)>0&&o.phys>Math.max(d.w,d.h))
      issues.push(`${o.name} ${L('物理尺寸')} ${fmt(o.phys)}m ${L('超过场地长边')} ${fmt(Math.max(d.w,d.h))}m`);
    const b=objectBounds(o);
    if(b.maxX<-.2||b.minX>d.w+.2||b.maxY<-.2||b.minY>d.h+.2) issues.push(`${o.name} ${L('超出场地范围')}`);
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
      <span>${esc(L('工程名称'))}</span><b>${esc(state.meta.name)}</b><span>${esc(L('场地'))}</span><b>${esc(L(siteKindName(state.background.kind)))}</b>
      <span>${esc(L('场地参数'))}</span><b>${esc(siteDescription().split('：').slice(1).join('：'))}</b>
      <span>${esc(L('对象总数'))}</span><b>${state.objects.length}</b><span>${esc(L('最近更新'))}</span><b>${new Date(state.meta.updatedAt).toLocaleString()}</b>
    </div></div>
    <div class="section"><h3>${esc(L('几何检查'))}</h3>${issues.length?issues.map(x=>`<div class="issue">${esc(x)}</div>`).join(''):`<div class="ok-banner">${esc(L('未发现明显的零尺寸、自相交或越界问题。'))}</div>`}</div>
    <div class="section"><h3>${esc(L('本地存储'))}</h3><div id="storageBox"><div class="hint-text">${esc(L('统计中…'))}</div></div></div>`;
  $('statsPanel').querySelectorAll('tr[data-floor-sum]').forEach(tr=>{
    tr.onclick=async()=>{
      const id=tr.dataset.floorSum;
      if(!id||id===state.activeFloorId) return;
      try{ if(await switchFloor(id)) toast(L('已切换到楼层：')+currentFloorName(),'success'); }
      catch(e){ toast(L('楼层操作失败：')+e.message,'error'); }
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
  /* 栅格分辨率随缩放自适应：放大时提高精度、缩小时降低开销；限制在 6000–36000 格/区域 */
  const z=Number(state.viewport.zoom)||1;
  const targetCells=Math.max(6000,Math.min(36000,Math.round(18000*Math.max(.5,Math.min(2,z/4)))));
  const res=analyzeCoverage(state,{targetCells});
  coverageResult=res;
  invalidateStatic();               /* 覆盖率叠加层属于静态层 */
  requestRender();
  const pct=x=>(x*100).toFixed(1)+'%';
  const head=`<div style="font-size:13px;line-height:1.9;margin-bottom:10px">
    <div>${esc(L('参与统计的点设备：'))}<b>${res.cameraCount}</b> ${esc(L('个'))}${esc(L('（含物理尺寸的圆/球机、扇形/摄像头、方形覆盖）'))}${res.ignoredPoints?`；${esc(L('仅标识位置的图标点'))} <b>${res.ignoredPoints}</b> ${esc(L('个未计入'))}`:''}</div>
    <div>${esc(L('区域/闭合折线：'))}<b>${res.regions.length}</b> ${esc(L('个'))} ｜ ${esc(L('合计覆盖'))} <b>${pct(res.ratio)}</b></div>
    <div>${esc(L('覆盖面积'))} <b>${fmt(res.totalCovered)}</b> m² ｜ ${esc(L('盲区'))} <b>${fmt(res.totalBlind)}</b> m² ｜ ${esc(L('总面积'))} <b>${fmt(res.totalArea)}</b> m²</div>
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
    {text:L('清除叠加层'),class:'',click:()=>{ coverageResult=null; invalidateStatic(); closeModal(); requestRender(); }},
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
    buttons.unshift({text:L('应用建议（新增')+` ${res.suggestions.length} ${L('台）')}`,class:'primary',click:()=>{
      pushHistory();
      const typeId=defaultTypeId('point')==='point.marker'?'point.camera':defaultTypeId('point');
      res.suggestions.forEach(s=>{
        const o=baseObject('point',state.objectTypes.some(t=>t.id==='point.camera')?'point.camera':typeId,
          {x:Math.round(s.x*100)/100,y:Math.round(s.y*100)/100,angle:s.angle,phys:s.phys});
        state.objects.push(o);
      });
      closeModal(); commitChange(L('已按建议新增')+' '+res.suggestions.length+' '+L('台摄像头'));
      runCoverageAnalysis();
    }});
  }
  openModal(L('布点优化（贪心覆盖最大化）'),body,buttons);
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
