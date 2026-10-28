/* io.js —— 新建工程、多工程库、楼层管理 */
/* io.js —— 文件导入路由、底图导入压缩、表格导入预览、全部导出器、打印报告 */
/* -------------------- 文件：新建 / 底图 / 导入 -------------------- */
$('newBtn').onclick=()=>showConfirm(L('新建将清空当前工程。已自动保存的草稿会被覆盖，是否先导出 JSON 或另存到工程库？')).then(ok=>{
  if(!ok)return;
  state=createInitialState(); selectedIds.clear(); history={past:[],future:[]};
  assetPrune([]).catch(()=>{});
  afterStateLoaded(); scheduleSave(); toast('已新建工程','success');
});
$('importBtn').onclick=()=>$('fileInput').click();
/* -------------------- 多工程库 -------------------- */
const BG_KIND_LABELS={image:'图片底图',rect:'矩形场地',circle:'圆形场地',ellipse:'椭圆场地',sector:'扇形场地',parallelogram:'平行四边形场地',polygon:'多边形场地'};
$('projBtn').onclick=openProjectLibrary;
$('floorBtn').onclick=openFloorManager;
/**
 * 楼层管理：列出全部楼层（当前层标记、对象数、底图类型），支持新增/切换/重命名/删除。
 * 每层独立底图与对象；图层与对象类型全局共用。
 */
function openFloorManager(){
  syncActiveFloor();
  const floors=state.floors||[];
  const rows=floors.map(f=>{
    const active=f.id===state.activeFloorId;
    const n=floorObjectCount(f);
    const kind=active?state.background.kind:(f.background&&f.background.kind);
    const label=BG_KIND_LABELS[kind]||'矩形场地';
    return `<div class="proj-row${active?' bound':''}" data-floor="${esc(f.id)}">
      <div class="proj-info"><b>${esc(f.name)}</b>${active?`<span class="proj-tag">${esc(L('当前楼层'))}</span>`:''}
        <span class="hint-text">${n} ${esc(L('个对象'))} · ${esc(L(label))}</span></div>
      <div class="proj-ops">
        <button data-fop="switch" ${active?'disabled':''}>${esc(L('切换'))}</button>
        <button data-fop="rename">${esc(L('重命名'))}</button>
        <button data-fop="del" class="danger" ${floors.length<=1?'disabled':''}>${esc(L('删除'))}</button>
      </div></div>`;
  }).join('');
  const total=floors.reduce((s,f)=>s+floorObjectCount(f),0);
  openModal(L('楼层 / 多底图'),
    `<div class="proj-current">${esc(L('当前楼层：'))}<b>${esc(currentFloorName())}</b>　${esc(L('共'))} ${floors.length} ${esc(L('层'))} · ${total} ${esc(L('个对象'))}</div>
     <div style="margin:8px 0"><button class="primary" id="floorAdd">＋ ${esc(L('新增楼层（空白场地）'))}</button></div>
     <div class="proj-list">${rows}</div>
     <p class="hint-text">${esc(L('每层可独立设置底图/场地与对象；切换后画布只显示当前楼层。楼层共用图层与对象类型，工程库与 JSON 会保存全部楼层。'))}</p>`,
    [{text:L('关闭'),click:closeModal}]);
  $('floorAdd').onclick=async()=>{
    const v=await showPrompt({title:L('新增楼层'),label:L('楼层名称'),value:'F'+(floors.length+1)});
    if(v===null) return;
    const id=await addFloor(v);
    if(id){ closeModal(); openFloorManager(); toast(L('已新增楼层：')+currentFloorName(),'success'); }
  };
  document.querySelectorAll('.proj-row[data-floor]').forEach(row=>{
    row.querySelectorAll('button[data-fop]').forEach(btn=>btn.onclick=async()=>{
      const id=row.dataset.floor, op=btn.dataset.fop;
      try{
        if(op==='switch'){
          closeModal();
          if(await switchFloor(id)) toast(L('已切换到楼层：')+currentFloorName(),'success');
        }else if(op==='rename'){
          const f=floors.find(x=>x.id===id);
          const v=await showPrompt({title:L('重命名楼层'),label:L('楼层名称'),value:f?f.name:''});
          if(v===null) return;
          if(renameFloor(id,v)){ closeModal(); openFloorManager(); }
        }else if(op==='del'){
          const f=floors.find(x=>x.id===id);
          const ok=await showConfirm(L('确定删除楼层「')+(f?f.name:id)+L('」及其全部对象？此操作可撤销。'));
          if(!ok) return;
          if(await deleteFloor(id)){ closeModal(); openFloorManager(); toast(L('楼层已删除')); }
        }
      }catch(e){ toast(L('楼层操作失败：')+e.message,'error'); }
    });
  });
}
async function openProjectLibrary(){
  const projects=await listProjects();
  const rows=projects.map(p=>{
    const dt=p.updatedAt?new Date(p.updatedAt).toLocaleString():'';
    const bg=BG_KIND_LABELS[p.bgKind]||p.bgKind;
    return `<div class="proj-row${p.bound?' bound':''}" data-id="${esc(p.id)}">
      <div class="proj-info"><b>${esc(p.name)}</b>${p.bound?`<span class="proj-tag">${esc(L('当前打开'))}</span>`:''}
        <span class="hint-text">${p.objectCount} ${esc(L('个对象'))} · ${esc(L(bg))} · ${esc(dt)}</span></div>
      <div class="proj-ops">
        <button data-op="open" ${p.bound?'disabled':''}>${esc(L('打开'))}</button>
        <button data-op="rename">${esc(L('重命名'))}</button>
        <button data-op="copy">${esc(L('复制'))}</button>
        <button data-op="del" class="danger">${esc(L('删除'))}</button>
      </div></div>`;
  }).join('')||`<p class="hint-text">${esc(L('工程库还是空的。先把当前图纸「另存到工程库」，以后可在多个工程间快速切换。'))}</p>`;
  const boundName=state.meta.projectId?(state.meta.name||L('当前工程')):'';
  openModal(L('工程库（保存在本机浏览器）'),
    `<div class="proj-current">${esc(L('当前草稿：'))}<b>${esc(state.meta.name)}</b>${boundName?` · ${esc(L('已绑定工程库'))}`:''}　${esc(L('对象'))} ${state.objects.length} ${esc(L('个'))}</div>
     <div style="margin:8px 0;display:flex;gap:8px;flex-wrap:wrap">
       <button class="primary" id="projSaveAs">💾 ${esc(L('把当前图纸另存到工程库'))}</button>
       <button id="projMerge">⇄ ${esc(L('合并他人工程…'))}</button>
     </div>
     <div class="proj-list">${rows}</div>
     <p class="hint-text">${esc(L('工程自动保存：绑定后每次修改都会同步到工程库；删除工程不影响已导出的 JSON 文件。'))}<br>
       ${esc(L('离线协作：双方各自编辑后，用「合并他人工程」选择对方导出的 JSON，按对象更新时间合并（较新者胜出），删除操作也会同步。'))}</p>`,
    [{text:L('关闭'),click:closeModal}]);
  $('projSaveAs').onclick=async()=>{
    const v=await showPrompt({title:L('另存到工程库'),label:L('工程名称'),value:state.meta.name||L('未命名图纸工程')});
    if(v===null) return;
    await saveProjectAs(v); toast(L('已存入工程库'),'success'); closeModal(); openProjectLibrary();
  };
  $('projMerge').onclick=()=>{
    const input=document.createElement('input');
    input.type='file'; input.accept='.json,application/json';
    input.onchange=async()=>{
      const f=input.files&&input.files[0];
      if(!f) return;
      try{
        const stats=await mergeProjectJSON(JSON.parse(await f.text()));
        closeModal();
        const changed=stats.added||stats.updated||stats.deleted||stats.floorsAdded;
        const conflict=stats.conflicts?`；${L('冲突')} ${stats.conflicts} ${L('项按较新版本保留')}`:'';
        toast(`${L('合并完成：')}${L('新增')} ${stats.added} · ${L('更新')} ${stats.updated} · ${L('删除')} ${stats.deleted} · ${L('新增楼层')} ${stats.floorsAdded}${conflict}`,
          changed?'success':'warn');
      }catch(e){ toast(L('合并失败：')+e.message,'error'); }
    };
    input.click();
  };
  document.querySelectorAll('.proj-row').forEach(row=>{
    row.querySelectorAll('button[data-op]').forEach(btn=>btn.addEventListener('click',async()=>{
      const id=row.dataset.id, op=btn.dataset.op;
      try{
        if(op==='open'){
          closeModal(); await openProjectById(id); toast(L('已打开工程：')+(state.meta.name||''),'success');
        }else if(op==='rename'){
          const cur=projects.find(p=>p.id===id);
          const v=await showPrompt({title:L('重命名工程'),label:L('工程名称'),value:cur?.name||''});
          if(v===null) return;
          await renameProjectById(id,v); toast(L('已重命名'),'success'); openProjectLibrary();
        }else if(op==='copy'){
          await duplicateProjectById(id); toast(L('已复制一份到工程库'),'success'); openProjectLibrary();
        }else if(op==='del'){
          const cur=projects.find(p=>p.id===id);
          const ok=await showConfirm(L('确定删除工程「')+(cur?.name||id)+L('」？此操作不可撤销（不影响已导出的文件）。'));
          if(!ok) return;
          await deleteProjectById(id); toast(L('工程已删除')); openProjectLibrary();
        }
      }catch(e){ toast(L('操作失败：')+e.message,'error'); }
    }));
  });
}
