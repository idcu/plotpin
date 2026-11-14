/* comments.js —— 本地评论线程（独立 localStorage，不进工程 JSON、不同步协作） */
const CPFX='plotpin.comments.v1.',CMAX=200,CTEXT=2000;
const cOw=()=>String(state.meta.projectId||state.meta.id||''),cKy=o=>CPFX+(o||cOw());
const cTx=t=>String(t||'').trim().slice(0,CTEXT);
function cLd(o){
  try{
    const r=JSON.parse(localStorage.getItem(cKy(o))||'null'),a=(r&&(r.comments||r))||[];
    return a.filter(c=>c&&c.id&&c.objectId&&cTx(c.text));
  }catch(e){ return []; }
}
function cSv(a,o){ try{ localStorage.setItem(cKy(o),JSON.stringify({v:1,comments:a})); return 1; }catch(e){ return 0; } }
function cRm(o){ try{ localStorage.removeItem(cKy(o)); return 1; }catch(e){ return 0; } }
/** 草稿 meta.id → 工程 projectId，合并去重；成功才删旧键 */
function cMv(f,t){
  if(!f||!t||f===t) return 0;
  const d=cLd(t),s=new Set(d.map(c=>c.id));
  cLd(f).forEach(c=>{ if(!s.has(c.id)){ d.push(c); s.add(c.id); } });
  return cSv(d,t)?(cRm(f),1):0;
}
/** 找锚定对象：活动层在顶层，其余层在 floors[].objects */
function cOb(c){
  const f=c.floorId&&c.floorId!==state.activeFloorId?(state.floors||[]).find(x=>x&&x.id===c.floorId):0;
  return ((f?f.objects:state.objects)||[]).find(o=>o&&o.id===c.objectId)||0;
}
function cAdd(s){
  if(!guardWrite(L('评论'))) return {ok:0,r:'ro'};
  const o=String(s&&s.objectId||''),f=String(s&&s.floorId||state.activeFloorId||''),t=cTx(s&&s.text);
  if(!o||!cOb({objectId:o,floorId:f})) return {ok:0,r:'no'};
  if(!t) return {ok:0,r:'empty'};
  const w=cOw(),a=cLd(w);
  if(a.length>=CMAX) return {ok:0,r:'limit'};
  const n=nowISO(),c={id:uid('CMT'),objectId:o,floorId:f,text:t,createdAt:n,updatedAt:n};
  a.push(c);
  return cSv(a,w)?{ok:1,c}:{ok:0,r:'store'};
}
function cUp(id,t){
  if(!guardWrite(L('评论'))) return {ok:0,r:'ro'};
  const w=cOw(),a=cLd(w),c=a.find(x=>x.id===id),v=cTx(t);
  if(!c) return {ok:0,r:'missing'};
  if(!v) return {ok:0,r:'empty'};
  c.text=v; c.updatedAt=nowISO();
  return cSv(a,w)?{ok:1}:{ok:0,r:'store'};
}
function cDel(id){
  if(!guardWrite(L('评论'))) return {ok:0,r:'ro'};
  const w=cOw(),a=cLd(w),n=a.filter(x=>x.id!==id);
  if(n.length===a.length) return {ok:0,r:'missing'};
  return cSv(n,w)?{ok:1}:{ok:0,r:'store'};
}
function cFail(r){
  if(!r||r==='ro') return;
  if(r==='empty') toast(L('评论不能为空'),'warn');
  else if(r==='limit') toast(L('评论上限 {max} 条',{max:CMAX}),'warn');
  else if(r==='no') toast(L('先选中一个对象'),'warn');
  else if(r==='missing') toast(L('评论不存在'),'warn');
  else toast(L('评论保存失败'),'warn');
}
function cRender(){
  const b=$('commentList'); if(!b) return;
  const ro=isReadOnly(),tip=$('commentsReadOnly'),i=$('commentText'),add=$('addCommentBtn');
  if(tip){ tip.hidden=!ro; tip.textContent=ro?L('只读：可看评论，不能写'):''; }
  if(i) i.disabled=ro;
  if(add) add.disabled=ro;
  const a=cLd().sort((x,y)=>String(y.updatedAt).localeCompare(String(x.updatedAt)));
  b.innerHTML=a.length?a.map(c=>{
    const o=cOb(c);
    return `<div class="proj-row" data-ci="${esc(c.id)}"><div class="proj-info"><div style="white-space:pre-wrap">${esc(c.text)}</div><span class="hint-text">${esc(o?(o.name||o.id):L('对象已删除'))}</span></div><div class="proj-ops"><button class="mini" data-ca="e" ${ro?'disabled':''}>${esc(L('编辑'))}</button><button class="mini danger" data-ca="d" ${ro?'disabled':''}>${esc(L('删除'))}</button></div></div>`;
  }).join(''):`<div class="hint-text">${esc(L('暂无评论'))}</div>`;
}
function cEdit(id){
  const c=cLd().find(x=>x.id===id); if(!c) return;
  const t=prompt(L('编辑评论'),c.text); if(t==null) return;
  const r=cUp(id,t); if(!r.ok) return cFail(r.r);
  cRender();
}
$('addCommentBtn').addEventListener('click',()=>{
  const s=Array.from(selectedIds);
  if(s.length!==1) return cFail('no');
  const r=cAdd({objectId:s[0],floorId:state.activeFloorId,text:$('commentText').value});
  if(!r.ok) return cFail(r.r);
  $('commentText').value=''; cRender();
});
$('commentList').addEventListener('click',e=>{
  const b=e.target.closest&&e.target.closest('[data-ca]'),w=b&&b.closest('[data-ci]');
  if(!w) return;
  if(b.dataset.ca==='e') return cEdit(w.dataset.ci);
  showConfirm(L('删除这条评论？')).then(k=>{
    if(!k) return;
    const r=cDel(w.dataset.ci); if(!r.ok) return cFail(r.r);
    cRender();
  });
});
registerHook('comments.migrateOwner',cMv);
registerHook('comments.removeOwner',cRm);
registerHook('ui.readOnlyChanged',cRender);
