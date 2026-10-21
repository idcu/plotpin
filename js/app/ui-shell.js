/* ui-shell.js —— 通用弹窗/确认/输入/Toast、工程设置 */
/* -------------------- 设置弹窗 -------------------- */
$('settingsBtn').onclick=()=>{
  openModal('工程设置',`
    <div class="form-grid">
      <label>工程名称</label><input id="setName" value="${esc(state.meta.name)}">
      <label>网格间距</label><input id="setGrid" type="number" min="0.1" step="0.1" value="${state.settings.gridSize}">
      <label>启用捕捉</label><input id="setSnap" type="checkbox" ${state.settings.snap?'checked':''}>
      <label>显示网格</label><input id="setGridVisible" type="checkbox" ${state.settings.gridVisible?'checked':''}>
      <label>显示标签</label><input id="setLabels" type="checkbox" ${state.settings.showLabels?'checked':''} title="未单独设置「编号」开关的对象默认显示编号；已单独设置的对象始终按自身配置">
      <label>十字准星/坐标</label><input id="setCursor" type="checkbox" ${state.settings.showCursor?'checked':''}>
      <label>段长度标注</label><input id="setSegLen" type="checkbox" ${state.settings.showSegLen?'checked':''} title="未单独设置「段长/周长」的折线默认显示；已单独设置的对象始终按自身配置">
      <label>图上显示面积</label><input id="setAreaTag" type="checkbox" ${state.settings.showAreaTag?'checked':''} title="未单独设置「面积/周长」的区域与闭合折线默认显示；已单独设置的对象始终按自身配置">
      <label>场地节点坐标</label><input id="setSiteNodes" type="checkbox" ${state.settings.siteNodes?'checked':''} title="矢量场地边界各节点显示世界坐标（矩形/多边形）">
      <label>场地段长</label><input id="setSiteSegLen" type="checkbox" ${state.settings.siteSegLen?'checked':''} title="矢量场地相邻节点之间显示边长">
      <label>场地基点坐标</label><input id="setSiteBase" type="checkbox" ${state.settings.siteBase?'checked':''} title="矢量场地显示基点/圆心坐标">
      <label>场地半径</label><input id="setSiteRadius" type="checkbox" ${state.settings.siteRadius?'checked':''} title="圆/椭圆/扇形场地显示半径">
      <label>场地面积</label><input id="setSiteArea" type="checkbox" ${state.settings.siteArea?'checked':''} title="矢量场地中心显示面积">
      <label>场地周长</label><input id="setSitePerimeter" type="checkbox" ${state.settings.sitePerimeter?'checked':''} title="矢量场地中心显示周长">
      <label>对象捕捉</label><input id="setOsnap" type="checkbox" ${state.settings.osnap?'checked':''} title="自动吸附端点、中点、圆心、垂足、交点等（Tab 切换类型）">
      <label>坐标精度</label><input id="setPrecision" type="number" min="0" max="6" step="1" value="${state.settings.precision}">
      <label>运行环境</label><div class="hint-text">${esc(capabilitySummary())}</div>
      <label>场地/底图</label><div class="hint-text">${esc(siteDescription())}<br>可点顶部「底图/场地」上传图片或改画矩形/圆形/椭圆/扇形/平行四边形/多边形</div>
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
      if(!state.settings.osnap) osnapMode=null;
      updateOsnapChip();
      state.settings.showAreaTag=$('setAreaTag').checked;
      state.settings.siteNodes=$('setSiteNodes').checked;
      state.settings.siteSegLen=$('setSiteSegLen').checked;
      state.settings.siteBase=$('setSiteBase').checked;
      state.settings.siteRadius=$('setSiteRadius').checked;
      state.settings.siteArea=$('setSiteArea').checked;
      state.settings.sitePerimeter=$('setSitePerimeter').checked;
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
