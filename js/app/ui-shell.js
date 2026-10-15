/* ui-shell.js —— 通用弹窗/确认/输入/Toast、工程设置 */
/* -------------------- 设置弹窗 -------------------- */
$('settingsBtn').onclick=()=>{
  openModal('工程设置',`
    <div class="form-grid">
      <label>工程名称</label><input id="setName" value="${esc(state.meta.name)}">
      <label>网格间距</label><input id="setGrid" type="number" min="0.1" step="0.1" value="${state.settings.gridSize}">
      <label>启用捕捉</label><input id="setSnap" type="checkbox" ${state.settings.snap?'checked':''}>
      <label>显示网格</label><input id="setGridVisible" type="checkbox" ${state.settings.gridVisible?'checked':''}>
      <label>显示标签</label><input id="setLabels" type="checkbox" ${state.settings.showLabels?'checked':''}>
      <label>十字准星/坐标</label><input id="setCursor" type="checkbox" ${state.settings.showCursor?'checked':''}>
      <label>段长度标注</label><input id="setSegLen" type="checkbox" ${state.settings.showSegLen?'checked':''}>
      <label>对象捕捉</label><input id="setOsnap" type="checkbox" ${state.settings.osnap?'checked':''} title="自动吸附端点、中点、圆心">
      <label>坐标精度</label><input id="setPrecision" type="number" min="0" max="6" step="1" value="${state.settings.precision}">
      <label>场地/底图</label><div class="hint-text">${esc(siteDescription())}<br>可点顶部「底图/场地」上传图片或改画矩形/圆形/椭圆/扇形/多边形</div>
    </div>`,[
    {text:'取消',class:'',click:closeModal},{text:'保存',class:'primary',click:()=>{
      pushHistory();
      state.meta.name=$('setName').value.trim()||'未命名图纸工程';
      state.settings.gridSize=Math.max(.01,Number($('setGrid').value)||1);
      state.settings.snap=$('setSnap').checked; state.settings.gridVisible=$('setGridVisible').checked;
      state.settings.showLabels=$('setLabels').checked;
      state.settings.showCursor=$('setCursor').checked;
      state.settings.showSegLen=$('setSegLen').checked;
      state.settings.osnap=$('setOsnap').checked;
      state.settings.precision=Math.max(0,Math.min(6,Number($('setPrecision').value)||2));
      closeModal(); commitChange('设置已保存');
    }}
  ]);
};

/* -------------------- 通用弹窗 / Toast -------------------- */
function openModal(title,body,buttons=[]){
  $('modalTitle').textContent=title; $('modalBody').innerHTML=body;
  $('modalFooter').innerHTML='';
  buttons.forEach(b=>{ const btn=document.createElement('button'); btn.textContent=b.text; btn.className=b.class||''; btn.onclick=b.click; $('modalFooter').appendChild(btn); });
  $('modalBackdrop').classList.add('show');
}
function closeModal(){ $('modalBackdrop').classList.remove('show'); }
$('modalBackdrop').addEventListener('click',e=>{ if(e.target.id==='modalBackdrop') closeModal(); });
function showConfirm(message){
  return new Promise(resolve=>{
    openModal('确认操作',`<p style="line-height:1.7;margin:0">${esc(message)}</p>`,[
      {text:'取消',click:()=>{closeModal();resolve(false);}},
      {text:'确定',class:'primary',click:()=>{closeModal();resolve(true);}}
    ]);
  });
}
function showPrompt({title,label,value=''}){
  return new Promise(resolve=>{
    openModal(title,`<label style="font-weight:600;display:block;margin-bottom:7px">${esc(label)}</label><input id="promptInput" style="width:100%" value="${esc(value)}">`,[
      {text:'取消',click:()=>{closeModal();resolve(null);}},
      {text:'确定',class:'primary',click:()=>{const v=$('promptInput').value.trim();closeModal();resolve(v);}}
    ]);
    setTimeout(()=>{ $('promptInput')?.focus(); $('promptInput')?.select(); },30);
  });
}
function toast(msg,type=''){
  const el=document.createElement('div'); el.className='toast '+type; el.textContent=msg;
  $('toastWrap').appendChild(el); setTimeout(()=>el.remove(),2600);
}
function esc(s){
  return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
