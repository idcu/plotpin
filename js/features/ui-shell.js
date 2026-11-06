/* ui-shell.js —— 通用弹窗/确认/输入/Toast、工程设置 */
/* -------------------- 设置弹窗 -------------------- */
$('settingsBtn').onclick=()=>{
  const T=I18N.t;
  openModal(T('settingsTitle'),`
    <div class="form-grid">
      <label>${esc(T('projectName'))}</label><input id="setName" value="${esc(state.meta.name)}">
      <label>${esc(T('gridSpacing'))}</label><input id="setGrid" type="number" min="0.1" step="0.1" value="${state.settings.gridSize}">
      <label>${esc(T('enableSnap'))}</label><input id="setSnap" type="checkbox" ${state.settings.snap?'checked':''}>
      <label>${esc(T('showGrid'))}</label><input id="setGridVisible" type="checkbox" ${state.settings.gridVisible?'checked':''}>
      <label>${esc(T('crosshair'))}</label><input id="setCursor" type="checkbox" ${state.settings.showCursor?'checked':''}>
      <label>${esc(T('segLabelMinPxSetting'))}</label><input id="setSegLabelMinPx" type="number" min="${APP_LIMITS.SEG_LABEL_MIN_PX_MIN}" max="${APP_LIMITS.SEG_LABEL_MIN_PX_MAX}" step="1" value="${state.settings.segLabelMinPx}" title="屏幕上短于该像素长度的线段不显示段长标注，避免拥挤">
      <label>${esc(T('osnapSetting'))}</label><input id="setOsnap" type="checkbox" ${state.settings.osnap?'checked':''} title="自动吸附端点、中点、圆心、垂足、交点等（Tab 切换类型）">
      <label>${esc(T('polarSetting'))}</label><input id="setPolar" type="checkbox" ${state.settings.polar?'checked':''} title="逐点录入时自动吸附到极轴角整数倍（参考边平行/垂直与等距约束始终可用）">
      <label>${esc(T('polarStepSetting'))}</label><select id="setPolarStep" title="极轴追踪的角度步长">${[15,30,45,90].map(x=>`<option value="${x}" ${Number(state.settings.polarStep)===x?'selected':''}>${x}°</option>`).join('')}</select>
      <label>${esc(T('precisionSetting'))}</label><input id="setPrecision" type="number" min="0" max="6" step="1" value="${state.settings.precision}">
      <label>${esc(T('languageLabel'))}</label><select id="setLang"><option value="zh" ${state.settings.lang!=='en'?'selected':''}>中文</option><option value="en" ${state.settings.lang==='en'?'selected':''}>English</option></select>
      <label>${esc(T('runtimeSetting'))}</label><div class="hint-text">${esc(capabilitySummary())}</div>
      <label>${esc(T('siteBgSetting'))}</label><div class="hint-text">${esc(siteDescription())}<br>可点顶部「底图/场地」上传图片或改画矩形/圆形/椭圆/扇形/平行四边形/多边形</div>
    </div>`,[
    {text:T('cancel'),class:'',click:closeModal},{text:T('save'),class:'primary',click:()=>{
      pushHistory();
      state.meta.name=$('setName').value.trim()||'未命名图纸工程';
      state.settings.gridSize=Math.max(.01,Number($('setGrid').value)||1);
      state.settings.snap=$('setSnap').checked; state.settings.gridVisible=$('setGridVisible').checked;
      state.settings.showCursor=$('setCursor').checked;
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
};

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
    openModal(T('confirmTitle'),`<p style="line-height:1.7;margin:0">${esc(L(message))}</p>`,[
      {text:T('cancel'),click:()=>{closeModal();resolve(false);}},
      {text:T('ok'),class:'primary',click:()=>{closeModal();resolve(true);}}
    ]);
  });
}
function showPrompt({title,label,value=''}){
  const T=I18N.t;
  return new Promise(resolve=>{
    openModal(L(title),`<label style="font-weight:600;display:block;margin-bottom:7px">${esc(L(label))}</label><input id="promptInput" style="width:100%" value="${esc(value)}">`,[
      {text:T('cancel'),click:()=>{closeModal();resolve(null);}},
      {text:T('ok'),class:'primary',click:()=>{const v=$('promptInput').value.trim();closeModal();resolve(v);}}
    ]);
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
