/* ui-shell.js —— 通用弹窗/确认/输入/Toast、工程设置 */
/** V-5 参照版信息：标定不一致必须显示（一致/无底图不额外占行） */
function revInfoText(){
  if(!rRef) return '';
  const c=rRef.calib||{};
  return rRef.label+(c.mode==='scale'?'\n'+L('标定不一致')+' '+c.am+' → '+c.bm
    :c.mode==='canvas'?'\n'+L('画布不一致'):'');
}
function revInfoHTML(){ return esc(revInfoText()).replace(/\n/g,'<br>'); }
function revInfoSync(){ const el=$('revInfo'); if(el) el.innerHTML=revInfoHTML(); }
/* -------------------- 设置弹窗 -------------------- */
$('settingsBtn').onclick=()=>{
  const T=I18N.t;
  revDiff();   /* 打开的瞬间按当前工程重算，不沿用旧结论 */
  openModal(T('settingsTitle'),`
    <div class="form-grid">
      <label>${esc(T('projectName'))}</label><input id="setName" value="${esc(state.meta.name)}">
      <label>${esc(T('gridSpacing'))}</label><input id="setGrid" type="number" min="0.1" step="0.1" value="${state.settings.gridSize}">
      <label>${esc(T('enableSnap'))}</label><input id="setSnap" type="checkbox" ${state.settings.snap?'checked':''}>
      <label>${esc(T('showGrid'))}</label><input id="setGridVisible" type="checkbox" ${state.settings.gridVisible?'checked':''}>
      <label>${esc(T('crosshair'))}</label><input id="setCursor" type="checkbox" ${state.settings.showCursor?'checked':''}>
      <label>${esc(T('exportOnlyDelivered'))}</label><input id="setExportOnlyDelivered" type="checkbox" ${state.settings.exportOnlyDelivered?'checked':''}>
      <label>${esc(T('pdfDpi'))}</label><select id="setPdfDpi">${PDF_DPI_OPTIONS.map(d=>`<option value="${d}"${state.settings.pdfDpi===d?' selected':''}>${d} dpi</option>`).join('')}</select>
      <label>${esc(T('segLabelMinPxSetting'))}</label><input id="setSegLabelMinPx" type="number" min="${APP_LIMITS.SEG_LABEL_MIN_PX_MIN}" max="${APP_LIMITS.SEG_LABEL_MIN_PX_MAX}" step="1" value="${state.settings.segLabelMinPx}" title="${esc(L('屏幕上短于该像素长度的线段不显示段长标注，避免拥挤'))}">
      <label>${esc(T('osnapSetting'))}</label><input id="setOsnap" type="checkbox" ${state.settings.osnap?'checked':''} title="${esc(L('自动吸附端点、中点、圆心、垂足、交点等（Tab 切换类型）'))}">
      <label>${esc(T('polarSetting'))}</label><input id="setPolar" type="checkbox" ${state.settings.polar?'checked':''} title="${esc(L('逐点录入时自动吸附到极轴角整数倍（参考边平行/垂直与等距约束始终可用）'))}">
      <label>${esc(T('polarStepSetting'))}</label><select id="setPolarStep" title="${esc(L('极轴追踪的角度步长'))}">${[15,30,45,90].map(x=>`<option value="${x}" ${Number(state.settings.polarStep)===x?'selected':''}>${x}°</option>`).join('')}</select>
      <label>${esc(T('precisionSetting'))}</label><input id="setPrecision" type="number" min="0" max="6" step="1" value="${state.settings.precision}">
      <label>${esc(T('languageLabel'))}</label><select id="setLang"><option value="zh" ${state.settings.lang!=='en'?'selected':''}>中文</option><option value="en" ${state.settings.lang==='en'?'selected':''}>English</option></select>
      <label>${esc(T('pluginSessionOnly'))}</label><div id="pluginPanel">${pluginPanelHTML()}</div>
      <label>${esc(T('ghostLayer'))}</label><div class="hint-text" id="ghostPanel">
        <input type="file" id="ghostFile" accept="image/*,application/pdf" style="display:none">
        <button type="button" id="ghostPick">${esc(T('ghostPick'))}</button>
        <button type="button" id="ghostClear">${esc(T('ghostClear'))}</button>
        <span style="margin-left:8px">${esc(T('ghostOpacity'))}</span>
        <input type="range" id="ghostOpacity" min="10" max="100" step="5" value="${Math.round((ghostLayer?ghostLayer.opacity:.5)*100)}" style="width:120px">
      </div>
      <label>${esc(L('参照版'))}</label><div class="hint-text">
        <input type="file" id="revFile" accept=".json" hidden>
        <button type="button" id="revPick">${esc(L('选择 JSON…'))}</button>
        <button type="button" id="revClearBtn">${esc(L('清除参照版'))}</button>
        <div id="revInfo">${revInfoHTML()}</div>
        <div>${esc(T('ghostOpacity'))}
          <input type="range" id="revOpacity" min="10" max="90" step="5" value="${Math.round(rOp*100)}" style="width:120px"></div>
        <div><label><input type="checkbox" id="revBlinkChk" ${rBl.on?'checked':''}> ${esc(L('闪烁'))}</label></div>
      </div>
      <label>${esc(T('runtimeSetting'))}</label><div class="hint-text">${esc(capabilitySummary())}</div>
      <label>${esc(T('siteBgSetting'))}</label><div class="hint-text">${esc(siteDescription())}<br>${esc(T('siteBgHint'))}</div>
    </div>`,[
    {text:T('cancel'),class:'',click:closeModal},{text:T('save'),class:'primary',click:()=>{
      pushHistory();
      state.meta.name=$('setName').value.trim()||'未命名图纸工程';
      state.settings.gridSize=Math.max(.01,Number($('setGrid').value)||1);
      state.settings.snap=$('setSnap').checked; state.settings.gridVisible=$('setGridVisible').checked;
      state.settings.showCursor=$('setCursor').checked;
      state.settings.exportOnlyDelivered=$('setExportOnlyDelivered').checked;
      state.settings.pdfDpi=Number($('setPdfDpi').value)||PDF_DPI_DEFAULT;
      const segMin=Number($('setSegLabelMinPx').value);
      state.settings.segLabelMinPx=Math.min(APP_LIMITS.SEG_LABEL_MIN_PX_MAX,Math.max(APP_LIMITS.SEG_LABEL_MIN_PX_MIN,
        Math.round(Number.isFinite(segMin)?segMin:APP_LIMITS.SEG_LABEL_MIN_PX)));
      state.settings.osnap=$('setOsnap').checked;
      state.settings.polar=$('setPolar').checked;
      state.settings.polarStep=Number($('setPolarStep').value)||45;
      state.settings.lang=$('setLang').value==='en'?'en':'zh';
      I18N.setLang(state.settings.lang); I18N.apply(document); refreshUI(); refreshI18nRuntimeText();
      if(!state.settings.osnap) osnapMode=null;
      updateOsnapChip();
      state.settings.precision=Math.max(0,Math.min(6,Number($('setPrecision').value)||2));
      closeModal(); commitChange('设置已保存');
    }}
  ]);
  bindPluginPanel();
  /* G-2：幽灵参考层控件——即时生效，不进入 settings/工程/撤销栈 */
  $('ghostPick').onclick=()=>$('ghostFile').click();
  $('ghostFile').onchange=async e=>{
    const f=e.target.files&&e.target.files[0];
    if(f) await ghostLoadFile(f);
    e.target.value='';
  };
  $('ghostClear').onclick=()=>ghostClear();
  /* V-5 参照版控件：即时生效，只改运行时变量（不写 settings/工程/撤销栈） */
  $('revPick').onclick=()=>$('revFile').click();
  $('revFile').onchange=async e=>{
    const f=e.target.files&&e.target.files[0];
    if(f) await revFile(f);
    e.target.value='';
    revInfoSync();
  };
  $('revClearBtn').onclick=()=>{ revClear(); revInfoSync(); };
  $('revOpacity').oninput=e=>{ rOp=e.target.value/100; invalidateStatic(); requestRender(); };
  $('revBlinkChk').onchange=e=>revBlinkSet(e.target.checked);
  $('ghostOpacity').oninput=e=>{
    if(!ghostLayer) return;
    ghostLayer.opacity=Math.max(.1,Math.min(1,Number(e.target.value)/100));
    invalidateStatic(); requestRender();
  };
};

/** D-05 插件面板：列表（id/版本/能力/状态/原因）+ 清单导入 + 卸载；仅会话内，不持久化 */
function pluginPanelHTML(){
  const T=I18N.t;
  const st={active:T('pluginStatusActive'),loading:T('pluginStatusLoading'),disabled:T('pluginStatusDisabled'),unloaded:T('pluginStatusUnloaded')};
  const list=PlotPin.listPlugins();
  return (list.length?list.map(p=>'<div class="hint-text" style="margin:4px 0">'+esc(p.id)+' · v'+esc(p.apiVersion)+' · '+esc(st[p.status]||p.status)+' · '+esc(p.capabilities.join(', ')||T('pluginNoCapabilities'))+(p.reason?' · '+esc(p.reason):'')+' <button type="button" data-plugin-unload="'+esc(p.id)+'">'+esc(T('pluginUnload'))+'</button></div>').join(''):'<div class="hint-text">'+esc(T('pluginNoneImported'))+'</div>')+
    '<button type="button" id="pluginImportBtn">'+esc(T('pluginImportManifest'))+'</button><input type="file" id="pluginFile" accept=".json,application/json" hidden>'+
    '<div class="hint-text">'+esc(T('pluginManifestHint'))+'</div>';
}
function bindPluginPanel(){
  const panel=$('pluginPanel'); if(!panel) return;
  const refresh=()=>{ panel.innerHTML=pluginPanelHTML(); bindPluginPanel(); };
  const btn=$('pluginImportBtn'), file=$('pluginFile');
  if(btn&&file) btn.onclick=()=>file.click();
  if(file) file.onchange=async()=>{
    const f=file.files&&file.files[0]; if(!f) return;
    let raw='';
    try{ raw=await f.text(); }catch(_){ toast('插件清单读取失败','error'); return; }
    const r=PlotPin.validatePluginManifest(raw);
    if(!r.ok){ toast('插件清单被拒：'+r.reason,'error'); file.value=''; return; }
    if(!confirm('加载插件 '+r.spec.id+' ？\n能力：'+(r.spec.capabilities.join(' / ')||'无'))){ file.value=''; return; }
    const res=await PlotPin.loadPlugin(r.spec);
    if(res&&res.ok) toast('插件已加载：'+r.spec.id,'success');
    file.value='';
    refresh();
  };
  Array.from(panel.querySelectorAll('[data-plugin-unload]')).forEach(b=>{
    b.onclick=()=>{
      const id=b.getAttribute('data-plugin-unload');
      if(!confirm('卸载插件 '+id+' ？')) return;
      PlotPin.unloadPlugin(id); toast('插件已卸载：'+id); refresh();
    };
  });
}

/* -------------------- 通用弹窗 / Toast -------------------- */
let modalReturnFocus=null;
/* 弹窗关闭回调（可选）：Esc / 遮罩点击 / 页脚按钮统一走 closeModal，确保叠加层等临时态不会悬挂 */
let modalCloseHook=null;
/** 弹窗内可聚焦控件：Tab 循环只在弹窗内部移动，避免焦点逃到被遮罩的背景界面 */
function modalFocusables(){
  const box=$('modalBox');
  if(!box||typeof box.querySelectorAll!=='function') return [];
  const list=box.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])');
  if(!list||typeof list.length!=='number'||typeof list.forEach!=='function') return [];
  return Array.from(list).filter(el=>{
    try{ return !!(el.offsetParent || (typeof el.getClientRects==='function' && el.getClientRects().length)); }
    catch(_){ return true; }
  });
}
function openModal(title,body,buttons=[],opts={}){
  modalCloseHook=typeof opts.onClose==='function'?opts.onClose:null;
  if(!$('modalBackdrop').classList.contains('show')){
    const active=document.activeElement;
    modalReturnFocus=active&&typeof active.focus==='function'?active:null;
  }
  $('modalTitle').textContent=L(title); $('modalBody').innerHTML=body;
  $('modalFooter').innerHTML='';
  buttons.forEach(b=>{ const btn=document.createElement('button'); btn.textContent=b.text; btn.className=b.class||''; btn.onclick=b.click; $('modalFooter').appendChild(btn); });
  $('modalBackdrop').classList.add('show');
  const target=modalFocusables()[0]||$('modalBox');
  if(target&&typeof target.focus==='function'){ try{ target.focus(); }catch(_){} }
}
function closeModal(){
  const hook=modalCloseHook; modalCloseHook=null;
  $('modalBackdrop').classList.remove('show');
  const back=modalReturnFocus; modalReturnFocus=null;
  if(back&&typeof back.focus==='function'){ try{ back.focus(); }catch(_){} }
  if(hook){ try{ hook(); }catch(_){} }
}
/** 弹窗键盘策略：Esc 关闭、Tab 在弹窗内循环；返回 true 表示事件已由弹窗处理 */
function modalKeydown(e){
  if(!$('modalBackdrop').classList.contains('show')) return false;
  if(e.key==='Escape'){ e.preventDefault(); closeModal(); return true; }
  if(e.key!=='Tab') return false;
  const items=modalFocusables();
  if(!items.length){ e.preventDefault(); const box=$('modalBox'); if(box&&box.focus) box.focus(); return true; }
  const active=document.activeElement;
  const idx=items.indexOf(active);
  if(e.shiftKey && idx<=0){ e.preventDefault(); items[items.length-1].focus(); return true; }
  if(!e.shiftKey && (idx<0||idx===items.length-1)){ e.preventDefault(); items[0].focus(); return true; }
  return true;   /* 其余 Tab 交给浏览器在弹窗内部顺序移动 */
}
$('modalBackdrop').addEventListener('click',e=>{ if(e.target.id==='modalBackdrop') closeModal(); });
function showConfirm(message){
  const T=I18N.t;
  return new Promise(resolve=>{
    /* RT-P2-16：Esc/遮罩关闭也走 onClose → 统一 resolve(false)，避免 await showConfirm 永久挂起 */
    let decided=false;
    openModal(T('confirmTitle'),`<p style="line-height:1.7;margin:0">${esc(L(message))}</p>`,[
      {text:T('cancel'),click:()=>{decided=false;closeModal();}},
      {text:T('ok'),class:'primary',click:()=>{decided=true;closeModal();}}
    ],{onClose:()=>resolve(decided)});
  });
}
function showPrompt({title,label,value=''}){
  const T=I18N.t;
  return new Promise(resolve=>{
    /* RT-P2-16：Esc/遮罩关闭 resolve(null)，与「取消」一致；确认值在关闭前捕获 */
    let decided=false, pending=null;
    openModal(L(title),`<label style="font-weight:600;display:block;margin-bottom:7px">${esc(L(label))}</label><input id="promptInput" style="width:100%" value="${esc(value)}">`,[
      {text:T('cancel'),click:()=>{decided=false;closeModal();}},
      {text:T('ok'),class:'primary',click:()=>{pending=$('promptInput').value.trim();decided=true;closeModal();}}
    ],{onClose:()=>resolve(decided?pending:null)});
    setTimeout(()=>{ $('promptInput')?.focus(); $('promptInput')?.select(); },30);
  });
}
/** 语言切换后刷新坐标前缀与保存状态文案，避免顶栏残留旧语言 */
function refreshI18nRuntimeText(){
  const coord=$('coordText');
  if(coord){
    const old=I18N.lang==='en'?'鼠标：':'Cursor: ';
    const next=L('鼠标：');
    if(coord.textContent.startsWith(old)) coord.textContent=next+coord.textContent.slice(old.length);
  }
  const save=$('saveState');
  if(save){
    let t=save.textContent;
    t=t.replace(/^📁\s*已保存\s*/, '📁 '+L('已保存')+' ')
      .replace(/^📁\s*Saved\s*/, '📁 '+L('已保存')+' ')
      .replace(/^已自动保存\s*/, L('已自动保存')+' ')
      .replace(/^Auto-saved\s*/, L('已自动保存')+' ')
      .replace(/^待保存…$/, L('待保存…'))
      .replace(/^Saving…$/, L('待保存…'))
      .replace(/^未保存$/, L('未保存'))
      .replace(/^Unsaved$/, L('未保存'))
      .replace(/^请手动导出$/, L('请手动导出'))
      .replace(/^Export manually$/, L('请手动导出'));
    save.textContent=t;
  }
  updateToolTitle();
}
/* -------------------- 首次启动引导（D-01） -------------------- */
/** v1 记录：{v:1,status:'completed'|'skipped',choice,at}。只有 completed 才永久抑制引导；
 *  skipped 只代表本次关闭（Esc/点遮罩），下次启动仍会展示。未来 v2 记录按未完成处理。 */
const FIRST_RUN_GUIDE_KEY='plotpin:firstRunGuide:v1';
function firstRunGuideState(hasSavedProject,storage){
  const store=storage||(typeof localStorage!=='undefined'?localStorage:null);
  let rec=null;
  try{ rec=JSON.parse((store&&store.getItem(FIRST_RUN_GUIDE_KEY))||'null'); }catch(_){ rec=null; }
  const known=!!(rec&&rec.v===1);
  const completed=known&&rec.status==='completed';
  return { shouldShow:!hasSavedProject&&!completed, completed,
    status:known?String(rec.status||''):'', choice:known?String(rec.choice||''):'' };
}
function markFirstRunGuide(status,choice,storage){
  const store=storage||(typeof localStorage!=='undefined'?localStorage:null);
  const rec={v:1,status:status==='completed'?'completed':'skipped',choice:String(choice||''),at:nowISO()};
  try{ if(store) store.setItem(FIRST_RUN_GUIDE_KEY,JSON.stringify(rec)); }catch(_){ /* 隐私模式/容量不足时仅本次会话生效 */ }
  return rec;
}
/** 「老工程」判定：只有真正有内容/绑定/多楼层/图片的工程才抑制引导。
 *  空工程自动落盘的单楼层默认状态不算老工程，保证 Esc 跳过后下次仍能看到引导。 */
function savedProjectHasContent(saved){
  if(!saved) return false;
  const m=saved.meta||{};
  if(m.projectId) return true;
  if(Array.isArray(saved.objects)&&saved.objects.length>0) return true;
  if(saved.background&&saved.background.kind==='image') return true;
  if(Array.isArray(saved.floors)&&saved.floors.length>1) return true;
  const shape=(saved.site&&saved.site.shape)||{};
  const x=Number.isFinite(shape.x)?shape.x:0, y=Number.isFinite(shape.y)?shape.y:0;
  return !!(shape.type&&(shape.type!=='rect'||shape.w!==100||shape.h!==70||x!==0||y!==0));
}
function openDemoProject(){
  let next;
  try{ next=buildDemoProject(); }
  catch(e){ toast(L('示例工程生成失败')+'：'+((e&&e.message)||e),'error'); return false; }
  state=next; selectedIds=new Set(); history={past:[],future:[]};
  afterStateLoaded(); fitView(); scheduleSave();
  toast(L('已打开示例工程'),'success');
  return true;
}
let rescueText;
function showLoadAuditBanner(result){
  const pending=!!(result&&result.source==='collabPending');
  const srcLabel=pending?'协作待发':(result&&result.source==='rescue'?'救援副本':(result&&result.source==='localStorage'?'本地备份':''));
  const fallback=pending?L('已恢复离线协作待发的最新改动；重连后会补发')
    :(result.fallback?(srcLabel?'已从'+srcLabel+'恢复':'已从本地备份恢复'):'');
  const newer=(!pending&&result.newerThanIdb?'已采用较新草稿，原自动保存仍在本地':'');
  const err=result.audit.level==='error';
  const msgs=(err?result.audit.errors:result.audit.warnings).slice(0,3);
  if(!err&&!fallback&&!newer&&!msgs.length) return;
  rescueText=result.rescue?result.rescue.text:null;
  setRescueHold(err);
  const text=[err?'工程加载异常':'',fallback,newer,msgs.join('；')].filter(Boolean).join('：');
  const bar=document.createElement('div');
  bar.id='loadBanner'; bar.className='load-banner '+(err?'error':'warn');
  bar.innerHTML='<span>'+esc(text)+'</span>'+(rescueText
    ?'<button id="loadRescueBtn">导出救援 JSON</button>'
    :'<button id="loadBannerClose">关闭</button>');
  document.body.insertBefore(bar,document.body.firstChild);
  bar.querySelector('button').addEventListener('click',()=>{
    if(rescueText) downloadBlob(new Blob([rescueText],{type:'application/json'}),'plotpin-rescue-'+Date.now()+'.json');
    setRescueHold(false); bar.remove();
  });
}
/** P0-04：救援模式下新建/打开/导入前必须显式确认；确认即解除救援（未导出的编辑会丢失） */
async function guardRescueSwitch(){
  if(!rescueHold) return true;
  const ok=await showConfirm(L('当前处于救援模式，未落盘编辑将丢失。请先导出救援 JSON；确定继续？'));
  if(!ok) return false;
  setRescueHold(false);
  const bar=$('loadBanner'); if(bar) bar.remove();
  return true;
}
function hideSaveFailureBanner(){ const bar=$('saveBanner'); if(bar) bar.remove(); }function hideLeaseConflictBanner(){ const bar=$('leaseBanner'); if(bar) bar.remove(); }
/** H-01 写冲突横幅：库内副本更新，本页已拒绝覆盖；可导出本页版本或重载最新 */
function showStaleWriteBanner(){
  let bar=$('staleWriteBanner');
  if(!bar){
    bar=document.createElement('div');
    bar.id='staleWriteBanner'; bar.className='load-banner warn';
    bar.innerHTML='<span>'+esc(L('另一标签页正在编辑，已暂停自动保存'))+'</span><button id="staleExportBtn">'+esc(L('export')+' '+L('exportJson'))+'</button><button id="staleReloadBtn">'+esc(L('重新载入'))+'</button>';
    document.body.insertBefore(bar,document.body.firstChild);
    $('staleExportBtn').addEventListener('click',()=>{ exportJSON().catch(e=>toast(L('导出失败：{msg}',{msg:e.message}),'error')); });
    $('staleReloadBtn').addEventListener('click',()=>location.reload());
  }
}
/** D-09 同工程多标签冲突横幅：最后心跳时刻 + 重新载入 / 确认取得租约 */
function showLeaseConflictBanner(info){
  let bar=$('leaseBanner');
  if(!bar){
    bar=document.createElement('div');
    bar.id='leaseBanner'; bar.className='load-banner warn';
    bar.innerHTML='<span></span><button id="leaseReloadBtn">'+esc(L('重新载入'))+'</button><button id="leaseClaimBtn">'+esc(L('仍以本页为准'))+'</button>';
    document.body.insertBefore(bar,document.body.firstChild);
    $('leaseReloadBtn').addEventListener('click',()=>location.reload());
    $('leaseClaimBtn').addEventListener('click',()=>{
      if(!confirm(L('另一标签页可能正在编辑，仍以本页为准会覆盖对方最近的修改。'))) return;
      leaseClaim(); hideLeaseConflictBanner();
    });
  }
  const t=info&&info.lastBeat?new Date(info.lastBeat).toLocaleTimeString('zh-CN',{hour12:false}):'';
  bar.querySelector('span').textContent=L('另一标签页正在编辑（最后心跳 {time}）',{time:t});
}
const SAVE_FAIL_TEXT={
  quota:'保存失败：存储空间不足，请导出 JSON 并清理空间',
  idb:'保存失败：IndexedDB 不可用，已降级 localStorage（容量有限）',
  io:'保存失败：自动重试 3 次仍未成功，请导出 JSON'
};
/** 保存失败常驻横幅（D-08）：配额给「导出 JSON / 清理空间」，其余给导出与原因 */
function showSaveFailureBanner(code){
  let bar=$('saveBanner');
  if(!bar){
    bar=document.createElement('div');
    bar.id='saveBanner'; bar.className='load-banner error';
    bar.innerHTML='<span></span><button id="saveExportBtn">导出 JSON</button><button id="saveCleanBtn">清理空间</button>';
    document.body.insertBefore(bar,document.body.firstChild);
    $('saveExportBtn').addEventListener('click',()=>{ exportJSON().catch(e=>toast('导出失败：'+e.message,'error')); });
    $('saveCleanBtn').addEventListener('click',()=>{ pruneBgAssets(); toast('已清理未引用资产，正在重试保存','warn'); scheduleSave(); });
  }
  bar.querySelector('span').textContent=SAVE_FAIL_TEXT[code]||SAVE_FAIL_TEXT.io;
  bar.dataset.code=code;
}
function showFirstRunGuide(){
  let chosen=false;
  const body=`<div style="line-height:1.8">
    <ol style="margin:0 0 10px 18px;padding:0">
      <li>${esc(L('载入图片底图，或直接使用默认矢量场地'))}</li>
      <li>${esc(L('用左侧工具放置点设备、区域、折线与标注'))}</li>
      <li>${esc(L('导出 JSON、PNG、SVG、PDF、DXF 或表格'))}</li>
    </ol>
    <p class="hint-text" style="margin:0">${esc(L('示例工程包含 100×70 m 场地与 6 个示例对象，可随意修改或删除'))}</p>
  </div>`;
  openModal(L('欢迎使用图钉'),body,[
    {text:L('空白开始'),class:'',click:()=>{ chosen=true; markFirstRunGuide('completed','blank'); closeModal(); toast(L('已进入空白工程')); }},
    {text:L('打开示例工程'),class:'primary',click:()=>{ chosen=true; closeModal(); if(openDemoProject()) markFirstRunGuide('completed','demo'); }}
  ],{onClose:()=>{ if(!chosen) markFirstRunGuide('skipped','later'); }});
}
function toast(msg,type=''){
  const el=document.createElement('div'); el.className='toast '+type; el.textContent=L(msg);
  $('toastWrap').appendChild(el); setTimeout(()=>el.remove(),2600);
}
function esc(s){
  return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
/** XML 文本/属性转义：与 esc 同一实现，单独命名以表达用途；禁止再写第二份替换表（审计 P1-8） */
function xmlEscape(s){ return esc(s); }
/** 安全模态正文模板：插值默认转义；需要嵌入受控 HTML 片段时用 safeHTML() 显式标记（审计 P2-28） */
function modalBody(strings,...values){
  return strings.reduce((html,chunk,i)=>{
    if(!i) return chunk;
    const v=values[i-1];
    return html+(v&&v.__html?String(v.value):esc(v??''))+chunk;
  },'');
}
/** 标记已受控的 HTML 片段（仅用于内部生成且已逐项转义的片段） */
function safeHTML(value){ return {__html:true,value:String(value??'')}; }
