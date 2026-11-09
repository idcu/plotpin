/* snapshot-ui.js —— 版本快照管理、A/B 差异对比与叠加开关 */
const DIFF_CATEGORY_LABELS=Object.freeze({added:'新增',removed:'删除',modified:'属性修改',moved:'移动',floorChanged:'换楼层',typeChanged:'类型变更'});
function snapSizeText(bytes){
  const n=Number(bytes)||0;
  if(n<1024) return n+' B';
  if(n<1048576) return (n/1024).toFixed(1)+' KB';
  return (n/1048576).toFixed(2)+' MB';
}
function snapTimeText(iso){
  try{ return iso?new Date(iso).toLocaleString():''; }catch(_){ return String(iso||''); }
}
function snapLabel(meta){ return (meta&&meta.label)||'自动快照'; }
function snapDiffFieldText(it){
  if(it.scope==='scene') return it.fields.map(k=>diffFieldLabel(k)).join('；')||'—';
  if(it.category==='added') return L('新增于 {floor}',{floor:it.bFloorId});
  if(it.category==='removed') return L('删除于 {floor}',{floor:it.aFloorId});
  const parts=it.fields.filter(k=>k!=='floorId').map(k=>{
    const label=diffFieldLabel(k);
    return label+'：'+diffValueText(it.a?it.a[k]:undefined)+' → '+diffValueText(it.b?it.b[k]:undefined);
  });
  if(it.category==='floorChanged') parts.unshift(L('楼层：{a} → {b}',{a:it.aFloorId,b:it.bFloorId}));
  return parts.join('；')||'—';
}
/** 快照下拉选项：A 默认最旧、B 默认最新，便于从旧到新看演进 */
function snapSelectOptions(metas,olderFirst){
  const list=olderFirst?metas.slice().reverse():metas;
  return list.map((m,i)=>`<option value="${esc(m.snapshotId)}" ${i===0?'selected':''}>${esc(snapTimeText(m.createdAt))} · ${esc(snapLabel(m))}</option>`).join('');
}
async function openSnapshotManager(pid,pname){
  let metas=[];
  try{ metas=await listSnapshots(pid); }catch(e){ toast(L('读取快照失败：{msg}',{msg:e.message}),'error'); return; }
  const bound=state.meta.projectId===pid;
  const rows=metas.map(m=>`<div class="proj-row" data-snap="${esc(m.snapshotId)}">
      <div class="proj-info"><b>${esc(snapLabel(m))}</b>
        <span class="hint-text">${esc(snapTimeText(m.createdAt))} · ${esc(m.floorName||'')} · ${m.objectCount} ${esc(L('个对象'))} · ${esc(snapSizeText(m.bytes))}${Number.isFinite(m.elapsedMs)?' · '+esc(L('生成'))+' '+esc(m.elapsedMs)+'ms':''}</span></div>
      <div class="proj-ops">
        <button data-sop="restore" ${bound?'':'disabled'} title="${esc(bound?'':L('请先打开该工程再回滚'))}">${esc(L('回滚'))}</button>
        <button data-sop="del" class="danger">${esc(L('删除'))}</button>
      </div></div>`).join('')
    ||`<p class="hint-text">${esc(L('暂无版本快照。快照只保存底图/照片引用，不复制 base64，体积不会随照片线性膨胀。'))}</p>`;
  const compare=metas.length>=2?`<div style="margin:10px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <label>${esc(L('基准 A'))} <select id="snapA">${snapSelectOptions(metas,true)}</select></label>
      <label>${esc(L('对比 B'))} <select id="snapB">${snapSelectOptions(metas,false)}</select></label>
      <button id="snapCompare" class="primary">${esc(L('对比 A→B'))}</button>
    </div>`:'';
  const limitText=L('上限 {n} 个 / {mb} MB，超出自动淘汰最旧',
    {n:APP_LIMITS.SNAPSHOT_MAX_PER_PROJECT,mb:APP_LIMITS.SNAPSHOT_MAX_BYTES_PER_PROJECT/1048576});
  openModal(L('版本快照与对比'),
    `<div class="proj-current">${esc(pname||state.meta.name||'')}　${metas.length} ${esc(L('个快照'))}${bound?' · '+esc(L('当前工程')):''}</div>
     <div style="margin:8px 0;display:flex;gap:8px;flex-wrap:wrap">
       <button class="primary" id="snapGen" ${bound?'':'disabled'} title="${esc(bound?'':L('请先把当前图纸另存到工程库'))}">＋ ${esc(L('生成快照'))}</button>
     </div>
     ${compare}
     <div class="proj-list" style="max-height:360px;overflow:auto">${rows}</div>
     <p class="hint-text">${esc(L('快照使用独立命名空间 snap:<工程>:<快照>，不影响工程主记录与资产回收；删除快照不改动当前工程。'))}<br>
       ${esc(L('每个快照保存对象、楼层、场地、底图引用与校准参数；照片/底图只存引用。'))}<br>
       ${esc(limitText)}</p>`,
    [{text:L('关闭'),click:closeModal}]);
  $('snapGen').onclick=async()=>{
    const v=await showPrompt({title:L('生成版本快照'),label:L('版本备注（可留空）'),value:''});
    if(v===null) return;
    try{
      const meta=await createSnapshot({projectId:pid,label:v});
      toast(L('快照已生成：{n} 个对象 · {size} · {ms}ms',{n:meta.objectCount,size:snapSizeText(meta.bytes),ms:meta.elapsedMs}),'success');
      await openSnapshotManager(pid,meta.projectName||pname);
    }catch(e){ toast(L('生成快照失败：{msg}',{msg:e.message}),'error'); }
  };
  if(metas.length>=2){
    $('snapCompare').onclick=()=>{
      const aId=$('snapA').value, bId=$('snapB').value;
      if(!aId||!bId) return;
      openSnapshotCompare(pid,aId,bId,pname);
    };
  }
  document.querySelectorAll('.proj-row[data-snap]').forEach(row=>{
    row.querySelectorAll('button[data-sop]').forEach(btn=>btn.onclick=async()=>{
      const sid=row.dataset.snap, op=btn.dataset.sop;
      const meta=metas.find(x=>x.snapshotId===sid);
      try{
        if(op==='del'){
          const ok=await showConfirm(L('删除快照「{name}」？只删除该版本记录，不影响当前工程与其它快照。',{name:snapLabel(meta)}));
          if(!ok) return;
          await deleteSnapshot(pid,sid);
          toast(L('快照已删除'));
          await openSnapshotManager(pid,pname);
        }else if(op==='restore'){
          if(state.meta.projectId!==pid){ toast(L('请先打开该工程再回滚'),'warn'); return; }
          const ok=await showConfirm(L(TXT_SNAPSHOT_RESTORE_CONFIRM,{name:snapLabel(meta)}));
          if(!ok) return;
          clearDiffOverlay();
          await restoreSnapshotById(pid,sid);
          closeModal();
          toast(L('已回滚到快照：{time}',{time:snapTimeText(meta&&meta.createdAt)}),'success');
        }
      }catch(e){ toast(L('快照操作失败：{msg}',{msg:e.message}),'error'); }
    });
  });
}
async function openSnapshotCompare(pid,aId,bId,pname){
  let a=null,b=null;
  try{ [a,b]=await Promise.all([getSnapshot(pid,aId),getSnapshot(pid,bId)]); }catch(e){}
  if(!a||!a.data||!b||!b.data){ toast(L('快照读取失败或已损坏'),'error'); return; }
  const diff=diffSnapshots(a.data,b.data);
  const counts=Object.keys(DIFF_CATEGORY_LABELS).map(k=>
    `<span style="color:${DIFF_OVERLAY_COLORS[k]};font-weight:600">${esc(L(DIFF_CATEGORY_LABELS[k]))} ${diff.counts[k]}</span>`).join('　')
    +`　<span style="color:#475569">${esc(L('未变'))} ${diff.unchanged}</span>`;
  const shown=diff.items.slice(0,DIFF_ITEM_MAX);
  const items=shown.map(it=>{
    const color=DIFF_OVERLAY_COLORS[it.category]||'#f59e0b';
    return `<div class="proj-row" style="align-items:flex-start">
      <div class="proj-info"><b><span style="color:${color}">●</span> ${esc(L(DIFF_CATEGORY_LABELS[it.category]||it.category))} · ${esc(it.name||it.id)}</b>
        <span class="hint-text">${esc(it.id)}${it.floorName?' · '+esc(it.floorName):''}</span>
        <span class="hint-text">${esc(snapDiffFieldText(it))}</span></div>
    </div>`;
  }).join('')||`<p class="hint-text">${esc(L('两个快照没有差异。'))}</p>`;
  const more=diff.items.length>shown.length
    ?`<p class="hint-text">${esc(L('差异较多，仅列出前'))} ${shown.length} / ${diff.items.length} ${esc(L('条；完整数据见快照记录。'))}</p>`:'';
  openModal(L('快照对比'),
    `<div class="proj-current">${esc(pname||'')}　${esc(L('基准 A'))}：${esc(snapTimeText(a.meta&&a.meta.createdAt))} → ${esc(L('对比 B'))}：${esc(snapTimeText(b.meta&&b.meta.createdAt))}</div>
     <div style="margin:8px 0;font-size:13px">${counts}</div>
     <label style="display:flex;gap:6px;align-items:center;margin:8px 0">
       <input type="checkbox" id="snapOverlayChk" checked> ${esc(L('在画布高亮差异（仅当前楼层）'))}</label>
     <div class="proj-list" style="max-height:340px;overflow:auto">${items}</div>
     ${more}
     <p class="hint-text">${esc(L('按对象 id 跨楼层匹配；忽略 id/z/createdAt/updatedAt/photoDataUrl 等运行时字段，避免误报。'))}</p>`,
    [{text:L('返回快照列表'),click:()=>{ closeModal(); openSnapshotManager(pid,pname); }},
     {text:L('关闭'),class:'primary',click:closeModal}],
    {onClose:clearDiffOverlay});
  $('snapOverlayChk').onchange=e=>setDiffOverlay(e.target.checked,shown,{aId,bId});
  setDiffOverlay(true,shown,{aId,bId});
}
