/* persistence.js —— 历史栈、IndexedDB 工程库、底图资产桥接、自动保存、迁移清洗、底图装载 */
/* -------------------- 历史 / 保存 -------------------- */
/**
 * 资产可达集按**命名空间**分组：草稿、撤销/重做栈每一帧、剪贴板、拖拽原件，
 * 自动保存草稿（IndexedDB `current`）、工程库每个 `proj:<id>` 记录，
 * 以及版本快照 `snap:<pid>:<sid>`（B-04 资产保活口子）。
 * prune 只删「并集之外」的资产：任一命名空间仍引用就绝不删。
 * 只扫当前 state + history 会永久删除其他工程的底图/照片（审计 P0-1）；
 * 漏扫快照会在工程不再引用后回收资产，导致快照回滚时底图/照片失效（B-04 补丁）。
 * @returns {Promise<Map<string,string[]>>}
 */
async function assetRefsByNamespace(){
  const ns=assetRefsInMemory();
  /* 读不到工程库就不动资产：宁可晚回收，也不能删掉看不见的工程 */
  const keys=await idbAllKeys();
  for(const key of keys){
    const k=String(key);
    const isSnapshot=k.startsWith(SNAPSHOT_PREFIX);
    if(k!=='current'&&!k.startsWith(PROJECT_PREFIX)&&!isSnapshot) continue;
    let rec=null;
    try{ rec=await idbGetKey(key); }catch(_){ continue; }
    /* 快照记录是 {meta,data} 外壳；资产引用在 data 的工程结构里 */
    const ids=isSnapshot?snapshotAssetRefs(rec):ContentAssets.collectAssetRefs(rec);
    if(!ids.length) continue;
    if(k==='current') ns.set('autosave',ids);
    else if(isSnapshot) ns.set(`snapshot:${k.slice(SNAPSHOT_PREFIX.length)}`,ids);
    else ns.set(`project:${k.slice(PROJECT_PREFIX.length)}`,ids);
  }
  return ns;
}
/**
 * 内存内可达集（同步、纯函数）：当前草稿 + 撤销/重做栈 + 剪贴板 + 拖拽原件。
 * 覆盖 `history.past/future`、`clipboard`、`drag.originals` 三类易漏命名空间。
 * @returns {Map<string,string[]>}
 */
function assetRefsInMemory(){
  const ns=new Map();
  const put=(name,snapshot)=>{
    const ids=ContentAssets.collectAssetRefs(snapshot);
    if(ids.length) ns.set(name,ids);
  };
  put('draft',state);
  (history.past||[]).forEach((s,i)=>put(`history.past[${i}]`,s));
  (history.future||[]).forEach((s,i)=>put(`history.future[${i}]`,s));
  if(Array.isArray(clipboard)&&clipboard.length) put('clipboard',{objects:clipboard});
  if(drag&&drag.originals instanceof Map) put('drag.originals',{objects:Array.from(drag.originals.values())});
  return ns;
}
/** 内存命名空间可达并集（同步；自测与诊断用） */
function reachableBgAssetIds(){
  return unionAssetRefs(assetRefsInMemory());
}
/** 命名空间并集：prune 的唯一判据。纯函数，工程库记录由调用方读入后一并传入。 */
function unionAssetRefs(namespaces){
  const all=new Set();
  if(namespaces) namespaces.forEach(list=>list.forEach(id=>all.add(id)));
  return Array.from(all);
}
/** 全库可达并集（内存命名空间 ∪ 工程库记录；prune 的唯一输入） */
async function reachableAssetIds(){
  return unionAssetRefs(await assetRefsByNamespace());
}
/** 资产 GC：失败（含 IndexedDB 不可用）时**不删除任何资产** */
async function pruneBgAssets(){
  try{
    const keep=await reachableAssetIds();
    return await assetPrune(keep);
  }catch(_){ return []; }
}
/** 撤销/重做按钮可用态：空栈即置灰（禁用），避免点击后无反馈 */
function updateHistoryButtons(){
  const u=$('undoBtn'), r=$('redoBtn');
  if(u) u.disabled=!history.past.length;
  if(r) r.disabled=!history.future.length;
}
function pushHistory(){
  /* 结构共享快照：与上一帧比较，未变子树/字符串（照片 base64）直接复用 */
  const prev=history.past.length?history.past[history.past.length-1]:null;
  history.past.push(snapshotHistoryState(state,prev));
  if(history.past.length>APP_LIMITS.HISTORY_MAX){ history.past.shift(); pruneBgAssets(); }
  history.future=[];
  updateHistoryButtons();
}
function undo(){
  if(!history.past.length) return;
  const prevFuture=history.future.length?history.future[history.future.length-1]:null;
  history.future.push(snapshotHistoryState(state,prevFuture));
  /* 快照不可变：弹出后物化一份可编辑副本，避免 live 编辑污染共享子树（普通条目原样返回） */
  state=materializeHistoryState(history.past.pop());
  selectedIds.clear();
  afterStateLoaded(false); pruneBgAssets();
  markDirty('restore');            /* 撤销后立刻落盘：刷新页面必须保持撤销结果（审计 P0-4） */
  toast('已撤销');
}
function redo(){
  if(!history.future.length) return;
  const prevPast=history.past.length?history.past[history.past.length-1]:null;
  history.past.push(snapshotHistoryState(state,prevPast));
  state=materializeHistoryState(history.future.pop());
  selectedIds.clear();
  afterStateLoaded(false); pruneBgAssets();
  markDirty('restore');            /* 重做同样落盘，避免刷新后回滚（审计 P0-4） */
  toast('已重做');
}
/**
 * 记录楼层最后写入时间（协作 LWW 的**楼层级**时间戳）。
 * 对象/场地/底图/楼层名等一律经 commitChange/commitObjectEdit 汇总，
 * 这两处统一调用本函数，避免「只在部分路径写 updatedAt」导致合并时楼层级字段永远输。
 * @param {string} [id] 楼层 id，缺省为当前活动楼层
 * @returns {string} 写入后的时间；楼层不存在时返回 ''
 */
function touchFloor(id){
  const fid=id||state.activeFloorId;
  const f=(state.floors||[]).find(x=>x&&x.id===fid);
  if(!f) return '';
  f.updatedAt=nowISO();
  return f.updatedAt;
}
/**
 * 统一变更提交协议（审计 A-05）。
 * 一次完成：清覆盖率叠加层 → 重建静态层 → 落盘 → 广播 → 刷 UI/重绘。
 * 各调用点用 kind 选择差异化的 UI 刷新粒度，避免改变既有行为：
 *  - object      ：新增/删除/移动后全量刷新（refreshUI）
 *  - objectEdit  ：属性编辑中只刷清单/图层/统计，避免重建正在编辑的属性面板
 *  - clear       ：清空楼层后全量刷新（楼层同步由 clearCurrentFloor 显式 collabBroadcastFloor('clear')）
 *  - restore     ：载入/撤销/重做后由 afterStateLoaded 负责静态层与 UI，这里只补落盘+广播
 *  - floor       ：删除楼层分支只补落盘（楼层同步由 deleteFloor 显式 collabBroadcastFloor('delete')）
 * 所有 kind 都会清覆盖率并重新安排保存；差异仅在 UI 刷新与广播范围内。
 */
const MARK_DIRTY_PROFILES=Object.freeze({
  object:Object.freeze({ui:'full',broadcast:true}),
  objectEdit:Object.freeze({ui:'lists',broadcast:true}),
  clear:Object.freeze({ui:'full',broadcast:false}),
  restore:Object.freeze({ui:'none',broadcast:true}),
  floor:Object.freeze({ui:'none',broadcast:false})
});
function markDirty(kind){
  const p=MARK_DIRTY_PROFILES[kind]||MARK_DIRTY_PROFILES.object;
  clearCoverageResult();               /* 对象/楼层变更后覆盖率叠加层失效，需重新分析 */
  invalidateStatic();                /* 静态层（非选中对象）需要重建 */
  scheduleSave();
  requestRender();
  if(p.ui==='full') refreshUI();
  else if(p.ui==='lists'){ renderList(); renderLayers(); renderStats(); }
  if(p.broadcast&&typeof collabOnLocalChange==='function') collabOnLocalChange();
}
/** 对象变更打点（N-06）：只对实际变化的 id 写 updatedAt，供协作 LWW 判定。
 *  ids 支持数组 / Set / Map；省略或为空时不遍历对象（无变化不产生新时间戳）。
 *  同一毫秒内连续提交也对每个对象严格递增，避免后一次编辑被合并判旧。 */
function stampObjects(ids){
  if(!ids) return 0;
  const list=ids instanceof Map?Array.from(ids.keys()):Array.from(ids);
  if(!list.length) return 0;
  const idx=objectIndexById();
  let n=0;
  for(const id of list){
    const o=idx.get(id); if(!o) continue;
    const prev=typeof o.updatedAt==='string'?o.updatedAt:'';
    let ts=new Date().toISOString();
    if(prev && ts<=prev) ts=new Date(new Date(prev).getTime()+1).toISOString();
    o.updatedAt=ts; n++;
  }
  return n;
}
/** @param {string} [floorId] 需要打点的楼层；缺省当前楼层（CORE-P2-8：重命名非当前楼层时也要刷新该层） */
function commitChange(message, ids, floorId){
  stampObjects(ids);
  touchFloor(floorId);
  state.meta.updatedAt=nowISO();
  state.objects.forEach((o,i)=>o.z=i);
  markDirty('object');
  if(message) toast(message,'success');
}
function commitObjectEdit(ids){
  stampObjects(ids);
  touchFloor();
  state.meta.updatedAt=nowISO();
  state.objects.forEach((o,i)=>o.z=i);
  markDirty('objectEdit');
}
/**
 * 清空当前楼层全部内容：图片底图槽、矢量场地槽、业务对象与标注、校准草稿/选中态、
 * 覆盖率、参考线与运行时底图缓存，并把取景框恢复到默认空工程。
 * 调用方必须先用 pushHistory()，才能用 Ctrl+Z 撤销（本函数不负责快照）。
 * 返回清理前的摘要，供二次确认文案与自测使用。
 */
function clearCurrentFloor(){
  const summary={objects:(state.objects||[]).length,background:isImageBackground(state.background),site:!!state.site};
  (state.objects||[]).forEach(o=>{ if(o&&o.id) markTombstone(o.id,'object'); });
  state.background=createEmptyBackground();
  state.site=null;
  state.objects=[];
  touchFloor();                     /* 清空楼层也是楼层级写入，供协作 LWW 判定 */
  state.meta.updatedAt=nowISO();
  bgLoadSeq++;
  bgImage=null; bgImageState='none'; bgDataUrl='';
  selectedIds.clear();
  resetTransientInteractionState();
  syncActiveFloor();
  resetFrameRef(); fitView();
  markDirty('clear');               /* 覆盖率/静态层/落盘/UI 统一走提交协议 */
  if(typeof collabBroadcastFloor==='function') collabBroadcastFloor('clear');
  return summary;
}
let dbPromise=null;
function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    if(!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const d=req.result;
      if(!d.objectStoreNames.contains(DB_STORE)) d.createObjectStore(DB_STORE);
      if(!d.objectStoreNames.contains(DB_ASSETS)) d.createObjectStore(DB_ASSETS);
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(new Error('IndexedDB 被其他标签页占用'));
  });
  dbPromise.catch(()=>{ dbPromise=null; });
  return dbPromise;
}
function idbTx(storeName,mode,fn){
  return openDB().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(storeName,mode);
    let result;
    try{ result=fn(tx.objectStore(storeName)); }catch(e){ return reject(e); }
    tx.oncomplete=()=>resolve(result); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error);
  }));
}
async function idbPut(project){
  return idbTx(DB_STORE,'readwrite',s=>s.put(project,'current'));
}
async function idbGet(){
  return idbTx(DB_STORE,'readonly',s=>new Promise((resolve,reject)=>{
    const r=s.get('current'); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
  }));
}
/* -------------------- 多工程库：除当前草稿外，工程以 proj:<id> 为键独立存取 -------------------- */
const PROJECT_PREFIX='proj:';
const projectKey=id=>PROJECT_PREFIX+id;
function idbReq(store,method,arg){
  return idbTx(DB_STORE,store,s=>new Promise((resolve,reject)=>{
    const r=s[method](arg); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); r.onblocked=()=>reject(new Error('IndexedDB 被占用'));
  }));
}
async function idbPutKey(key,project){ return idbTx(DB_STORE,'readwrite',s=>s.put(project,key)); }
async function idbGetKey(key){ return idbReq('readonly','get',key); }
async function idbDeleteKey(key){ return idbReq('readwrite','delete',key); }
async function idbAllKeys(){
  const keys=await idbReq('readonly','getAllKeys',undefined);
  return Array.from(keys||[]).filter(k=>typeof k==='string');
}
/** 工程库摘要列表（不装载底图），按更新时间倒序 */
async function listProjects(){
  let keys=[];
  try{ keys=(await idbAllKeys()).filter(k=>k.startsWith(PROJECT_PREFIX)); }catch(e){ return []; }
  const out=[];
  for(const key of keys){
    let p=null; try{ p=await idbGetKey(key); }catch(e){}
    if(p&&isReadableSchema(p.schema)){
      out.push({key,id:key.slice(PROJECT_PREFIX.length),
        name:p.meta?.name||'未命名工程',updatedAt:p.meta?.updatedAt||'',
        objectCount:Array.isArray(p.objects)?p.objects.length:0,
        bgKind:p.site?.kind||p.background?.kind||'rect', bound:state.meta?.projectId===p.meta?.projectId});
    }
  }
  return out.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
/** 当前草稿绑定/另存为工程库中的命名工程，返回 projectId */
async function saveProjectAs(name){
  if(name&&String(name).trim()) state.meta.name=String(name).trim().slice(0,80);
  state.meta.projectId=state.meta.projectId||uid('PRJ');
  state.meta.updatedAt=nowISO();
  await idbPutKey(projectKey(state.meta.projectId),persistableState());
  return state.meta.projectId;
}
/** 工程对象总数（顶层当前楼层 + 其余楼层），用于导入/打开的 OBJECTS_MAX 校验 */
function countProjectObjects(p){
  return projectObjectLists(p).reduce((n,list)=>n+list.length,0);
}
/** 打开工程库中的工程：先构建候选 → 准备资产 → 原子替换；任何失败保持当前现场（审计 P1-9） */
async function openProjectById(id){
  const raw=await idbGetKey(projectKey(id));
  if(!raw||!isReadableSchema(raw.schema)) throw new Error('工程不存在或已损坏');
  const errs=importLimitErrors({objects:countProjectObjects(raw)});
  if(errs.length) throw new Error('工程超出上限：'+importLimitMessage(errs));
  const next=buildProject(raw);
  await ensureBackgroundAsset(next);          /* 在候选状态上转存资产，不动当前 state */
  const prevState=state, prevHistory=history, prevSelected=new Set(selectedIds), prevDraft=draft;
  state=next;
  history={past:[],future:[]};
  selectedIds.clear(); draft=null;
  try{
    await afterStateLoaded();           /* 先等全楼层照片 dataUrl→资产转换完成，打开才算提交 */
    await pruneBgAssets();              /* IO-P1-6：提交成功后才回收；失败回滚不误删旧工程资产 */
    scheduleSave();
  }catch(e){
    state=prevState; history=prevHistory;           /* 提交阶段失败：回滚到打开前 */
    selectedIds.clear(); prevSelected.forEach(x=>selectedIds.add(x)); draft=prevDraft;
    afterStateLoaded(false); requestRender();
    throw e;
  }
  return state;
}
async function renameProjectById(id,name){
  const raw=await idbGetKey(projectKey(id));
  if(!raw) throw new Error('工程不存在');
  raw.meta=raw.meta||{}; raw.meta.name=String(name||'未命名工程').trim().slice(0,80)||'未命名工程';
  raw.meta.updatedAt=nowISO();
  await idbPutKey(projectKey(id),raw);
  if(state.meta?.projectId===id){ state.meta.name=raw.meta.name; refreshUI(); scheduleSave(); }
}
async function duplicateProjectById(id){
  const raw=await idbGetKey(projectKey(id));
  if(!raw) throw new Error('工程不存在');
  /* 非当前楼层的副本：只构建候选对象，不触碰当前 state */
  const p=buildProject(raw);
  p.meta.projectId=uid('PRJ');
  p.meta.name=(p.meta.name||'未命名工程')+' 副本';
  p.meta.createdAt=nowISO(); p.meta.updatedAt=nowISO();
  await idbPutKey(projectKey(p.meta.projectId),deepClone(p));
  return p.meta.projectId;
}
async function deleteProjectById(id){
  await idbDeleteKey(projectKey(id));
  /* 工程删除后其快照链不再有归属：一并清理（snapshot.js 定义，独立命名空间，不影响其它工程） */
  if(typeof deleteSnapshotsForProject==='function') await deleteSnapshotsForProject(id);
  if(state.meta?.projectId===id){ state.meta.projectId=''; refreshUI(); scheduleSave(); }
  await pruneBgAssets();
}

/* -------------------- 底图资产：通用内容寻址库实例（实现见 common/content-assets.js） -------------------- */
const bgAssetsReady = ContentAssets.open({ dbName: DB_NAME, storeName: DB_ASSETS, version: DB_VERSION, alsoCreate: [DB_STORE] });
function assetIdFor(bytes){ return ContentAssets.idFor(bytes, 'bg'); }
async function assetPut(id, rec){
  if(rec&&rec.bytes&&rec.bytes.length>APP_LIMITS.ASSET_MAX_BYTES) throw new Error('资产超过单个大小上限');
  return (await bgAssetsReady).putId(id, rec);
}
async function assetGet(id){ return (await bgAssetsReady).getId(id); }
async function assetPrune(keepIds){ return (await bgAssetsReady).prune(keepIds); }
const dataUrlToBytes = ContentAssets.dataUrlToBytes;
const bytesToDataUrl = ContentAssets.bytesToDataUrl;

/** 底图落盘清洗（N-03）：
 *  - 有 assetId：剥离 dataUrl（字节已在 assets 库，重开按 assetId 取回）；
 *  - 无 assetId 但有 dataUrl：保留 dataUrl —— 这是最后一份数据，静默删除等于永久丢图；
 *  - 两者都没有：不再落一份必然读不出的 image 槽（避免每次打开都报「底图缺失」）。 */
function scrubBackgroundForSave(bg){
  if(!bg||bg.kind!=='image') return;
  if(bg.assetId){ delete bg.dataUrl; return; }
  if(bg.dataUrl) return;
  bg.kind='none'; bg.fileName=''; bg.width=0; bg.height=0; bg.metersPerPixel=0;
}
/** 工程落盘副本：底图字节在 assets 库，dataUrl 仅运行时存在，绝不写回工程记录；
 *  当前楼层数据保留在顶层，其余楼层携带各自 background/objects（均为已清洗的可序列化结构）。 */
function persistableState(){
  syncActiveFloor();
  const copy=deepClone(state);
  scrubBackgroundForSave(copy.background);
  (copy.floors||[]).forEach(f=>{
    if(f.id===copy.activeFloorId){ delete f.background; delete f.site; delete f.objects; delete f.viewport; return; }
    scrubBackgroundForSave(f.background);
  });
  return copy;
}
/** 启动能力探测：file:// 下的 IndexedDB / Service Worker / Blob 可用性差异显式化（纯函数，便于自测） */
function detectCapabilities(env){
  env=env||{};
  const file=env.protocol==='file:';
  const idb=!!env.indexedDB;
  const sw=!!env.serviceWorker&&!file;
  const blob=!!env.Blob&&env.createObjectURL!==false;
  const warnings=[];
  if(!idb) warnings.push('IndexedDB 不可用：自动保存将降级为 localStorage（容量有限，建议定期导出 JSON 备份）');
  if(file) warnings.push('file:// 模式：PWA 安装与 Service Worker 不可用，但双击打开即可完全离线使用');
  if(!blob) warnings.push('Blob / URL.createObjectURL 不可用：图片导入与导出可能受限');
  return {file,idb,sw,blob,warnings,level:idb?'ok':'degraded'};
}
/** 读取真实运行环境的能力 */
function detectRuntimeCapabilities(){
  return detectCapabilities({
    protocol:(typeof location!=='undefined'&&location.protocol)||'',
    indexedDB:(typeof indexedDB!=='undefined')?indexedDB:null,
    serviceWorker:(typeof navigator!=='undefined'&&navigator.serviceWorker)||null,
    Blob:(typeof Blob==='function')?Blob:null,
    createObjectURL:typeof URL!=='undefined'&&typeof URL.createObjectURL==='function'
  });
}
/** 设置面板中的一行环境摘要 */
function capabilitySummary(){
  const c=detectRuntimeCapabilities();
  const idbText=c.idb?'IndexedDB 可用（自动保存 / 工程库 / 底图资产）':'IndexedDB 不可用（已降级 localStorage，容量有限）';
  const mode=c.file?'file:// 双击离线模式':'托管模式'+(c.sw?'（Service Worker 离线缓存已启用）':'（Service Worker 不可用）');
  return idbText+' ｜ '+mode;
}
let idbFallbackNotified=false;
/** 首次真正降级到 localStorage 时提示一次，避免「静默失效」 */
function notifyIdbFallback(){
  if(idbFallbackNotified) return;
  idbFallbackNotified=true;
  try{ toast('IndexedDB 不可用：已降级为 localStorage 自动保存（容量有限，建议定期导出 JSON）','warn'); }catch(_){}
}
/* -------------------- 多楼层 / 多底图 -------------------- */
/** 当前楼层元数据 */
function currentFloor(){
  return (state.floors||[]).find(f=>f.id===state.activeFloorId)||null;
}
function currentFloorName(){ const f=currentFloor(); return f?f.name:'1F'; }
/** 楼层名归一：增删改、重命名与表格导入共用同一口径（去首尾空白、截断 40 字符） */
function normalizeFloorName(name){ return String(name==null?'':name).trim().slice(0,40); }
/** 楼层名是否已被占用（exceptId 用于重命名自身）；精确比较，与导入首行匹配口径一致 */
function floorNameTaken(name, exceptId){
  const nm=normalizeFloorName(name);
  if(!nm) return false;
  return (state.floors||[]).some(f=>f&&f.id!==exceptId&&normalizeFloorName(f.name)===nm);
}
/** 全楼层引用统计：返回 [{id,name,count}]（仅 count>0），供删除图层/类型前的跨楼层检查 */
function floorRefs(pred){
  syncActiveFloor();
  const out=[];
  (state.floors||[]).forEach(f=>{
    const objs=Array.isArray(f.objects)?f.objects:[];
    const count=objs.filter(o=>o&&pred(o)).length;
    if(count) out.push({id:f.id,name:f.name,count});
  });
  return out;
}
function floorObjectCount(f){
  return f&&f.id===state.activeFloorId?state.objects.length:(f&&Array.isArray(f.objects)?f.objects.length:0);
}
/** 全楼层汇总（纯数据）：当前层先写回楼层条目，再逐层统计对象数/分类/面积/长度，
 *  返回 {rows,total}。供统计页签与打印报告共用，避免两处口径漂移。 */
function floorSummaries(){
  syncActiveFloor();
  const rows=(state.floors||[]).map(f=>{
    const objs=Array.isArray(f.objects)?f.objects:[];
    const counts={point:0,rect:0,line:0,text:0,dimension:0};
    let area=0, len=0;
    objs.forEach(o=>{
      if(o&&o.kind) counts[o.kind]=(counts[o.kind]||0)+1;
      area+=objectArea(o); len+=objectLength(o);
    });
    return {id:f.id,name:f.name,active:f.id===state.activeFloorId,count:objs.length,counts,area,len};
  });
  const total={count:0,counts:{point:0,rect:0,line:0,text:0,dimension:0},area:0,len:0};
  rows.forEach(r=>{
    total.count+=r.count;
    Object.keys(total.counts).forEach(k=>{ total.counts[k]+=r.counts[k]||0; });
    total.area+=r.area; total.len+=r.len;
  });
  return {rows,total};
}
/** 把当前可编辑数据写回当前楼层条目（切换/保存/统计前调用） */
function syncActiveFloor(){
  const f=currentFloor();
  if(!f) return;
  f.background=state.background;
  f.site=state.site;
  f.objects=state.objects;
  f.viewport=state.viewport;
}
/** 纯数据切换（不触达 DOM/底图加载，便于自测）：成功返回 true */
function switchFloorData(id){
  if(!Array.isArray(state.floors)||id===state.activeFloorId) return false;
  const target=state.floors.find(f=>f.id===id);
  if(!target||(!target.background&&!target.site)||!Array.isArray(target.objects)) return false;
  syncActiveFloor();
  state.background=target.background||createEmptyBackground();
  state.site=target.site||null;
  state.objects=target.objects;
  state.viewport=target.viewport||state.viewport;
  state.activeFloorId=id;
  selectedIds.clear();
  clearCoverageResult();
  invalidateStatic();
  resetFrameRef();
  return true;
}
/** 切换楼层（含底图加载、视图适配、面板刷新） */
async function switchFloor(id){
  if(!switchFloorData(id)) return false;
  await afterStateLoaded(false);
  fitView(); requestRender(); renderProps();
  scheduleSave();                  /* 切换也是一次状态变更：刷新后回到上次活动楼层（审计 P0-4 补口） */
  return true;
}
/** 在指定楼层内执行异步任务（如逐层导出/打印），结束后恢复原楼层、视口与选择集 */
async function withFloor(id, fn){
  if(!id||id===state.activeFloorId) return fn();
  const prevId=state.activeFloorId;
  const prevViewport=deepClone(state.viewport);
  const prevSelection=new Set(selectedIds);
  if(!switchFloor(id)) throw new Error('楼层切换失败');
  try{
    return await fn();
  }finally{
    if(switchFloor(prevId)){
      state.viewport=prevViewport;
      selectedIds.clear(); prevSelection.forEach(x=>selectedIds.add(x));
      invalidateStatic(); resetFrameRef();
      renderProps(); refreshUI(); requestRender();
    }
  }
}
/** 新增楼层：空白矢量场地；当前楼层数据先写回再创建 */
async function addFloor(name){
  syncActiveFloor();
  const n=(state.floors||[]).length+1;
  const nm=normalizeFloorName(name)||('F'+n);
  /* N-08：楼层名必须唯一（导入按名称定位楼层）；查重先于 pushHistory，重复尝试不污染撤销栈 */
  if(floorNameTaken(nm)) return null;
  pushHistory();
  const init=createInitialState();
  const id='floor_'+uid('F');
  state.floors.push({id,name:nm,updatedAt:nowISO(),background:init.background,site:init.site,objects:[],viewport:init.viewport});
  const ok=await switchFloor(id);
  if(ok) scheduleSave();           /* 新增楼层必须立刻落盘，刷新后不能消失（审计 P0-4） */
  if(ok&&typeof collabBroadcastFloor==='function') collabBroadcastFloor('add');
  return ok?id:null;
}
/** 删除楼层：至少保留一层；删除当前楼层时自动切到第一层 */
async function deleteFloor(id){
  if((state.floors||[]).length<=1) return false;
  const idx=state.floors.findIndex(f=>f.id===id);
  if(idx<0) return false;
  syncActiveFloor(); pushHistory();
  const doomed=state.floors[idx];
  markTombstone(id,'floor');
  (doomed.objects||[]).forEach(o=>{ if(o&&o.id) markTombstone(o.id,'object'); });
  state.floors.splice(idx,1);
  if(id===state.activeFloorId){
    const target=state.floors[0];
    state.background=target.background||createEmptyBackground();
    state.site=target.site||null;
    state.objects=target.objects;
    state.viewport=target.viewport||state.viewport;
    state.activeFloorId=target.id;
    selectedIds.clear(); resetFrameRef();
    await afterStateLoaded(false); fitView();
    markDirty('floor');            /* 删除当前楼层后落盘，刷新不能复活（审计 P0-4） */
  }else commitChange('已删除楼层');
  if(typeof collabBroadcastFloor==='function') collabBroadcastFloor('delete');
  return true;
}
/** 重命名楼层：空名/同名不生效，与既有楼层重名时拒绝（N-08） */
function renameFloor(id,name){
  const f=(state.floors||[]).find(x=>x.id===id);
  const nm=normalizeFloorName(name);
  if(!f||!nm||nm===f.name) return false;
  if(floorNameTaken(nm,id)) return false;
  pushHistory(); f.name=nm; commitChange('楼层已重命名',null,id);
  return true;
}

let rescueHold=false;
/** 加载审计为 error 时阻止自动保存覆盖原记录；用户确认后解除 */
function setRescueHold(v){ rescueHold=!!v; }
/** 草稿 localStorage 兜底唯一写法；返回是否写入成功 */
function writeLocalDraft(s){
  try{ localStorage.setItem(LS_KEY,JSON.stringify(s)); return true; }catch(_){ return false; }
}
/* -------------------- 保存健康：错误分类与有限退避（D-08） -------------------- */
/** 仅瞬时错误重试；1s/3s/9s 三次后停止。配额错误不重试，直接给导出/清理入口 */
const SAVE_RETRY_MS=[1000,3000,9000];
let saveHealth={state:'ok',errorCode:'',lastOkAt:'',retry:0};
let saveRetry=0,saveRetryTimer=null;
function saveStatus(t){ const e=$('saveState'); if(e) e.textContent=t; }
/** 错误归类：quota=配额耗尽（不可自动恢复）；idb=IndexedDB 不可用；io=其它瞬时写入异常 */
function classifySaveError(e){
  const n=String(e&&e.name||''),m=String(e&&e.message||'');
  if(n==='QuotaExceededError'||/quota/i.test(n+m)) return 'quota';
  if(/IndexedDB|标签页占用|被占用/.test(n+m)) return 'idb';
  return 'io';
}
/**
 * 保存失败统一出口。返回下一次重试延迟（0=不再重试）。
 * phase='project' 表示工程库副本写入失败：草稿已保存，只降级提示，不计入重试。
 */
function reportSaveFailure(e,phase){
  const code=classifySaveError(e);
  if(phase==='project'){ saveHealth.state='degraded'; saveHealth.errorCode=code; showSaveFailureBanner(code); return 0; }
  if(code==='idb') notifyIdbFallback();
  saveHealth.state='failed'; saveHealth.errorCode=code;
  let delay=0;
  if(code==='quota'){ saveRetry=0; saveStatus('保存失败：存储空间不足'); showSaveFailureBanner(code); }
  else if(saveRetry<SAVE_RETRY_MS.length){
    delay=SAVE_RETRY_MS[saveRetry++];
    saveStatus('保存失败：'+(delay/1000)+' 秒后自动重试（'+saveRetry+'/3）');
  }else{ saveStatus(L('请手动导出')); showSaveFailureBanner(code); }
  saveHealth.retry=saveRetry;
  return delay;
}
async function runSave(){
  clearTimeout(saveRetryTimer); saveRetryTimer=null;
  /* 落盘前统一资产化：内嵌 dataUrl（PDF 导入 / JSON 导入 / 旧草稿）必须先拿到 assetId，
     否则 persistableState 会剥离 dataUrl，重开即永久丢图（N-03） */
  await ensureProjectBackgroundAssets(state);
  const snapshot=persistableState();
  let warn=0;
  try{
    await idbPut(snapshot);
    if(state.meta.projectId) await idbPutKey(projectKey(state.meta.projectId),snapshot).catch(e=>{ warn=1; reportSaveFailure(e,'project'); });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsForStorage(state.settings)));
    if(!warn){ saveRetry=0; saveHealth={state:'ok',errorCode:'',lastOkAt:nowISO(),retry:0}; hideSaveFailureBanner(); }
    saveStatus((state.meta.projectId?'📁 '+L('已保存')+' ':L('已自动保存')+' ')+new Date().toLocaleTimeString());
  }catch(e){
    const ok=writeLocalDraft(snapshot);
    const delay=reportSaveFailure(e,'idb');
    saveHealth.state=ok?'degraded':'failed';
    if(delay>0) saveRetryTimer=setTimeout(runSave,delay);
  }
}
function scheduleSave(){
  if(rescueHold){ saveStatus('救援模式：原记录未被覆盖'); return; }
  if(leaseSaveBlocked()){ saveStatus(L('另一标签页正在编辑，已暂停自动保存')); return; }
  saveStatus(L('待保存…'));
  clearTimeout(saveTimer);
  clearTimeout(saveRetryTimer); saveRetryTimer=null;
  saveTimer=setTimeout(runSave,450);
}
function auditProject(raw){
  const errors=[],warnings=[];
  let p=raw;
  if(typeof p==='string'){
    try{ p=JSON.parse(p); }catch(_){ return {level:'error',errors:['JSON 损坏'],warnings}; }
  }
  if(!p||typeof p!=='object'||Array.isArray(p)) return {level:'error',errors:['非对象'],warnings};
  if(!isReadableSchema(p.schema)) errors.push('schema 不可读');
  if(p.floors!==undefined&&!Array.isArray(p.floors)) errors.push('楼层损坏');
  const floors=Array.isArray(p.floors)?p.floors:[];
  if(!floors.length) warnings.push('楼层为空');
  if(!p.activeFloorId||!floors.some(f=>f&&f.id===p.activeFloorId)) warnings.push('活动楼层');
  if(p.objects!==undefined&&!Array.isArray(p.objects)) errors.push('对象列表损坏');
  const objs=Array.isArray(p.objects)?p.objects:[];
  const ids=new Set(); let dup=0;
  objs.forEach(o=>{ if(!o||typeof o!=='object'||!o.id){ dup++; return; } if(ids.has(o.id)) dup++; else ids.add(o.id); });
  if(dup) warnings.push('id 重复 '+dup);
  const layerIds=new Set((Array.isArray(p.layers)?p.layers:[]).map(l=>l&&l.id).filter(Boolean));
  let badLayer=0;
  if(layerIds.size) objs.forEach(o=>{ if(o&&typeof o==='object'&&o.layer&&!layerIds.has(o.layer)) badLayer++; });
  if(badLayer) warnings.push('未知图层 '+badLayer);
  const bg=p.background;
  if(bg!==undefined&&(!bg||typeof bg!=='object'||Array.isArray(bg))) warnings.push('底图损坏');
  else if(bg&&bg.kind==='image'&&!bg.assetId&&!bg.dataUrl) warnings.push('资产缺失');
  const site=p.site;
  if(site!==undefined&&(!site||typeof site!=='object'||Array.isArray(site))) warnings.push('场地损坏');
  return {level:errors.length?'error':(warnings.length?'warn':'ok'),errors,warnings};
}
async function loadSavedProject(){
  const ok={level:'ok',errors:[],warnings:[]};
  let st=null,audit=ok,rescue=null,idbFailed=false,lsHit=false;
  try{
    const p=await idbGet();
    if(p&&typeof p==='object'){
      audit=auditProject(p);
      if(audit.level==='error'){ rescue={source:'IndexedDB',text:JSON.stringify(p)}; idbFailed=true; }
      else if(isReadableSchema(p.schema)) st=migrateProject(p);
    }
  }catch(e){ idbFailed=true; }
  if(!st){
    try{
      const raw=localStorage.getItem(LS_KEY);
      if(raw){
        lsHit=true;
        const a=auditProject(raw);
        if(a.level==='error'){ if(!rescue) rescue={source:'localStorage',text:raw}; audit=a; }
        else{
          const p=JSON.parse(raw);
          if(isReadableSchema(p.schema)){ st=migrateProject(p); audit=a; }
        }
      }
    }catch(e){}
  }
  if(st){
    state=st;
    await ensureBackgroundAsset(state);
  }
  return {state:st,audit,rescue,fallback:!!st&&lsHit&&idbFailed};
}
/**
 * 若工程携带内嵌 dataUrl（旧版草稿 / 跨设备导入的 JSON），转存为内容寻址资产。
 * 内容相同则 id 相同；IDB 不可用时保留 dataUrl 照常运行。
 */
async function ensureBackgroundAsset(st){
  const bg=st.background;
  if(!bg || !bg.dataUrl) return;
  try{
    const bin=dataUrlToBytes(bg.dataUrl);
    bg.assetId=assetIdFor(bin.bytes);
    await assetPut(bg.assetId,{bytes:bin.bytes,mime:bin.mime});
    delete bg.dataUrl;
  }catch(e){ /* 保留 dataUrl，渲染层兼容该退化形态 */ }
}
/**
 * 工程内全部对象列表（当前楼层 + 其余楼层）。
 * 凡是“遍历对象”的工程级逻辑都必须用它，不能只扫 state.objects，否则非当前楼层会被静默漏掉（A-10）。
 * @returns {Array<Array<object>>}
 */
function projectObjectLists(st){
  const out=[];
  if(st&&Array.isArray(st.objects)) out.push(st.objects);
  (st&&st.floors||[]).forEach(f=>{ if(f&&f.id!==st.activeFloorId&&Array.isArray(f.objects)) out.push(f.objects); });
  return out;
}
/**
 * JSON 工程内嵌的设备照片（dataUrl）→ 内容寻址资产库，并记录 photoId。
 * 与底图同样策略：IDB 不可用时保留 dataUrl（面板仍可显示），导入不失败。
 * 全楼层处理并按内容哈希去重，避免同一张照片在多个楼层重复入库（A-10）。
 */
async function ensureObjectPhotoAssets(st){
  const done=new Set();
  for(const list of projectObjectLists(st)) for(const o of list){
    const du=o&&o.props&&o.props.photoDataUrl;
    if(!du) continue;
    try{
      const bin=dataUrlToBytes(du);
      const id=assetIdFor(bin.bytes);
      if(!done.has(id)){ await assetPut(id,{bytes:bin.bytes,mime:bin.mime||'image/jpeg'}); done.add(id); }
      o.props.photoId=id;
      delete o.props.photoDataUrl;
    }catch(_){ /* 保留 dataUrl，照片仍可在当前会话查看 */ }
  }
}
/** 多楼层：非当前楼层背景的内嵌 dataUrl → 资产库 */
async function ensureFloorBackgroundAssets(st){
  for(const f of (st&&st.floors)||[]){
    if(!f||f.id===st.activeFloorId) continue;
    const bg=f.background;
    if(!bg||!isImageBackground(bg)||!bg.dataUrl) continue;
    try{
      const bin=dataUrlToBytes(bg.dataUrl);
      bg.assetId=assetIdFor(bin.bytes);
      await assetPut(bg.assetId,{bytes:bin.bytes,mime:bin.mime});
      delete bg.dataUrl;
    }catch(_){}
  }
}
/** 保存前统一资产化（N-03）：当前楼层 + 其余楼层的内嵌底图 dataUrl 都转成 assetId。
 *  写入失败由 ensure* 内部保留 dataUrl，随后 scrubBackgroundForSave 的兜底分支不会删掉它。 */
async function ensureProjectBackgroundAssets(st){
  await ensureBackgroundAsset(st);
  await ensureFloorBackgroundAssets(st);
}
/** 最近一次 buildProject 的对象唯一性修正计数（审计用；不写入工程状态） */
let lastSanitizeReport={duplicateIds:0,normalizedIds:0,duplicateNames:0};
function sanitizeReport(){ return lastSanitizeReport; }
/** 设置清洗（唯一真源）：工程载入与启动本机设置共用同一套规则。
 *  只读取 SETTINGS_KEYS 白名单内的自有键，`__proto__` 等原型键不会进入 Object.assign（CORE-P2-1）。 */
function sanitizeSettings(raw){
  const settings=Object.assign({},createInitialState().settings);
  if(raw&&typeof raw==='object'&&!Array.isArray(raw)){
    SETTINGS_KEYS.forEach(k=>{ if(Object.prototype.hasOwnProperty.call(raw,k)) settings[k]=raw[k]; });
  }
  settings.unit='m';
  settings.precision=Math.min(6,Math.max(0,Math.round(finiteNumber(settings.precision,2))));
  settings.gridSize=positiveNumber(settings.gridSize,1);
  settings.gridVisible=!!settings.gridVisible; settings.snap=!!settings.snap; settings.showLabels=!!settings.showLabels;
  settings.markerScale=Math.min(2.5,Math.max(.5,finiteNumber(settings.markerScale,1)));
  settings.showCursor=settings.showCursor!==false;
  settings.showSegLen=settings.showSegLen!==false;
  settings.osnap=settings.osnap!==false;
  settings.showAreaTag=settings.showAreaTag!==false;
  settings.siteNodes=settings.siteNodes!==false;    /* 旧档缺省：场地标注开关默认开启 */
  settings.siteSegLen=settings.siteSegLen!==false;
  settings.siteArea=settings.siteArea!==false;
  /* 场地周长自「场地周长面积」拆出：旧档缺省继承原面积开关；基点/半径为新增项，默认关 */
  settings.sitePerimeter=(raw&&typeof raw.sitePerimeter==='boolean')?raw.sitePerimeter:settings.siteArea;
  settings.siteBase=!!settings.siteBase;
  settings.siteRadius=!!settings.siteRadius;
  settings.polar=!!settings.polar;
  settings.polarStep=[15,30,45,90].includes(Number(settings.polarStep))?Number(settings.polarStep):45;
  settings.segLabelMinPx=Math.min(APP_LIMITS.SEG_LABEL_MIN_PX_MAX,Math.max(APP_LIMITS.SEG_LABEL_MIN_PX_MIN,
    Math.round(finiteNumber(settings.segLabelMinPx,APP_LIMITS.SEG_LABEL_MIN_PX))));
  settings.lang=settings.lang==='en'?'en':'zh';
  return settings;
}
/** 本机设置存储视图：只取白名单键，新增设置项不会因忘记改字面量而漏存。 */
function settingsForStorage(s){
  const out={};
  SETTINGS_KEYS.forEach(k=>{ if(s&&Object.prototype.hasOwnProperty.call(s,k)) out[k]=s[k]; });
  return out;
}
/** 启动兜底：仅当没有已保存工程时用本机设置初始化；工程记录始终是设置唯一真源。 */
function applyLocalSettings(){
  let raw={};
  try{ raw=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}'); }catch(_){ raw={}; }
  state.settings=sanitizeSettings(raw);
  return state.settings;
}
/** 由原始 JSON 构建清洗后的工程对象；不写全局 state，供导入/打开工程做“先校验后替换”的事务 */
function buildProject(p){
  const base=createInitialState();
  const meta=Object.assign(base.meta,typeof p.meta==='object'&&p.meta?p.meta:{});
  meta.name=typeof meta.name==='string'&&meta.name.trim()?meta.name:base.meta.name;
  /* B-07：图框/标题栏随 meta 持久化；旧档缺字段 → 默认模板（enabled:false，不改变既有导出） */
  meta.titleBlock=normalizeTitleBlock(meta.titleBlock);
  const settings=sanitizeSettings(p.settings);
  const layers=sanitizeLayers(p.layers);
  /* 双槽迁移：有 site 字段按新档清洗；旧档按 background.kind 拆分（image 保留，矢量迁入 site） */
  const slots=migrateBackgroundAndSite(p,layers);
  const background=slots.background;
  const site=slots.site;
  const viewport=sanitizeViewport(p.viewport);
  const objectTypes=mergeTypes(p.objectTypes);
  /* 编号作用域：先聚一次「当前工程 + 待导入工程」的全部编号，清洗过程中缺编号的对象 O(1) 取号；
     否则每个对象都会扫描全量 state.objects，已有 1 万对象时导入 1 万对象退化为 O(N²)。 */
  const nameSeed=allObjectNames();
  const addRawNames=list=>{
    if(!Array.isArray(list)) return;
    list.forEach(o=>{ if(o&&typeof o.name==='string'&&o.name) nameSeed.add(o.name.slice(0,80)); });
  };
  addRawNames(p.objects);
  (Array.isArray(p.floors)?p.floors:[]).forEach(f=>addRawNames(f&&f.objects));
  const restoreNames=beginObjectNameScope(nameSeed);
  /* 导入唯一性（N-07）：同一份待读工程内跨楼层共享 seenIds/seenNames，
     重复 id 或 safeId 归并冲突时追加稳定后缀，重名对象走编号作用域重编号。
     不把当前工程 id 灌入 seenIds——合并他人工程时同 id 代表同一对象，不能改名换姓。 */
  const seenIds=new Set(), seenNames=new Set();
  const report={duplicateIds:0,normalizedIds:0,duplicateNames:0};
  lastSanitizeReport=report;
  try{
    const objects=sanitizeObjects(p.objects,layers,objectTypes,seenIds,seenNames,report);
    const tombstones=sanitizeTombstones(p.tombstones);
    /* 楼层：当前楼层数据取顶层 background/site/objects；其余楼层各自清洗并保留 */
    const rawFloors=Array.isArray(p.floors)?p.floors.filter(f=>f&&typeof f==='object'):[];
    const floors=[]; const seenFloor=new Set(); const seenFloorNames=new Set(); let dupFloorName=0;
    rawFloors.forEach((f,i)=>{
      const id=safeId(f.id||('FLOOR'+(i+1)),'FLOOR');
      if(seenFloor.has(id)) return;
      seenFloor.add(id);
      const name=normalizeFloorName(f.name||('F'+(i+1)))||('F'+(i+1));
      /* N-08：旧工程可能已有重名楼层，加载只告警不阻断、不改名（不静默改数据） */
      if(seenFloorNames.has(name)) dupFloorName++; else seenFloorNames.add(name);
      /* v1→v2：保留已有楼层时间；旧档缺失时写空串，避免迁移瞬间把旧楼层当成最新写入 */
      const updatedAt=typeof f.updatedAt==='string'?f.updatedAt:'';
      const entry={id,name,updatedAt};
      if(f.id!==p.activeFloorId){
        const fslots=migrateBackgroundAndSite(f,layers);
        entry.background=fslots.background;
        entry.site=fslots.site;
        entry.objects=sanitizeObjects(f.objects||[],layers,objectTypes,seenIds,seenNames,report);
        entry.viewport=sanitizeViewport(f.viewport);
      }
      floors.push(entry);
    });
    if(!floors.length) floors.push({id:'floor.default',name:'1F',updatedAt:''});
    let activeFloorId=floors.some(f=>f.id===p.activeFloorId)?p.activeFloorId:floors[0].id;
    if(!floors.some(f=>f.id===activeFloorId)) floors.push({id:activeFloorId,name:'1F',updatedAt:''});
    if(report.duplicateIds||report.normalizedIds||report.duplicateNames){
      if(typeof console!=='undefined'&&console.warn) console.warn('[sanitize] 对象唯一性修正',report);
    }
    if(dupFloorName&&typeof console!=='undefined'&&console.warn){
      console.warn('[sanitize] 楼层重名 '+dupFloorName+' 个，已保留原名；导入前请先重命名');
    }
    /* 读完即升级为当前 schema（v1 → v2），下一次保存写回 v2，不丢任何数据 */
    return Object.assign(base,p,{schema:SCHEMA,meta,settings,rules:normalizeRuleConfig(p.rules),background,site,viewport,layers,objectTypes,objects,floors,activeFloorId,tombstones});
  }finally{ restoreNames(); }
}
/** 迁移并立即替换当前状态（旧调用方语义）；需要失败回滚的路径请用 buildProject */
function migrateProject(p){
  state=buildProject(p);
  return state;
}
/** 首次引导示例工程：空图片槽 + 100×70 矢量场地 + 6 个业务对象。
 *  不引用任何图片/照片资产，因此不会向资产库写入数据，也不会产生孤儿资产。 */
function buildDemoProject(){
  const site=createSiteSlot({type:'rect',w:100,h:70});
  site.name=L('示例场地');
  /* 示范对象在数组里连续创建，若不建立编号作用域，baseObject 每次都扫描未写入 state 的编号而重名 */
  const objects=withObjectNameScope(allObjectNames(),()=>[
    baseObject('point',null,{x:20,y:20}),
    baseObject('point',null,{x:70,y:50}),
    baseObject('rect',null,{x:10,y:10,width:30,height:20}),
    baseObject('line',null,{points:[[35,15],[90,55]]}),
    baseObject('text','text.builtin',{x:32,y:38,text:L('示例文字')}),
    baseObject('dimension',null,{points:[[10,63],[90,63]],subtype:'distance'})
  ]);
  return buildProject({
    meta:{name:L('示例工程')},
    settings:deepClone(state.settings),
    background:createEmptyBackground(),
    site,
    objects
  });
}
/** 删除墓碑清洗：按 (kind,id) 去重取最晚删除时间；非法/无时间的条目丢弃。
 *  淘汰策略（A-11）：**按对象 id 长期保留**，不再按删除时间倒序整段截断——
 *  截断会丢掉较早的墓碑，与仍持有旧对象的离线端合并时已删对象会复活（审计 P1-4）。
 *  只有超过保留窗口（TOMBSTONE_RETENTION_DAYS）或硬上限（TOMBSTONE_MAX）时才淘汰。
 *  @param {any[]} arr 原始墓碑数组
 *  @param {number} [nowMs] 保留窗口基准时间（缺省 Date.now；自测可注入固定值） */
const TOMBSTONE_LIMIT=APP_LIMITS.TOMBSTONE_MAX;
function sanitizeTombstones(arr,nowMs){
  const now=Number.isFinite(nowMs)?nowMs:Date.now();
  const cutoff=now-APP_LIMITS.TOMBSTONE_RETENTION_DAYS*86400000;
  const latest=new Map();
  (Array.isArray(arr)?arr:[]).forEach(raw=>{
    if(!raw||typeof raw!=='object'||!raw.id) return;
    const kind=raw.kind==='floor'?'floor':'object';
    const id=safeId(raw.id,'DEL');
    const deletedAt=typeof raw.deletedAt==='string'?raw.deletedAt.trim():'';
    if(!deletedAt||!Number.isFinite(Date.parse(deletedAt))) return;
    if(Date.parse(deletedAt)<cutoff) return;              /* 仅超过保留窗口的旧墓碑才淘汰 */
    const key=kind+':'+id;
    if(!latest.has(key)||deletedAt>latest.get(key).deletedAt) latest.set(key,{id,kind,deletedAt});
  });
  return Array.from(latest.values())
    .sort((a,b)=>a.deletedAt===b.deletedAt?String(a.kind+a.id).localeCompare(String(b.kind+b.id)):b.deletedAt.localeCompare(a.deletedAt))
    .slice(0,TOMBSTONE_LIMIT);
}
/** 记录一次删除（对象或楼层）；重复删除同一目标时刷新删除时间。
 *  增量淘汰：攒够 TOMBSTONE_EVICT_BATCH 条才压缩一次（而非每次删除都全量排序）。 */
function markTombstone(id,kind='object'){
  if(!id) return null;
  state.tombstones=Array.isArray(state.tombstones)?state.tombstones:[];
  const k=kind==='floor'?'floor':'object';
  const at=nowISO();
  const hit=state.tombstones.find(t=>t&&t.id===String(id)&&(t.kind||'object')===k);
  if(hit) hit.deletedAt=at;
  else state.tombstones.push({id:String(id),deletedAt:at,kind:k});
  if(state.tombstones.length>TOMBSTONE_LIMIT+APP_LIMITS.TOMBSTONE_EVICT_BATCH){
    state.tombstones=sanitizeTombstones(state.tombstones);
  }
  return at;
}
/** 合并是否发生了「远端覆盖本地」：协作条件写历史的唯一判据（纯函数）。 */
function mergeHistoryNeeded(stats){
  const s=stats||{};
  return ((s.updated||0)+(s.deleted||0)+(s.floorMetaUpdated||0)+(s.floorsDeleted||0)+(s.siteDeleted||0)+(s.siteCleared||0))>0;
}
/** 合并他人工程 JSON（离线 LWW）：读取→清洗→按 id/更新时间合并→替换现场。
 *  schema 不符或结构损坏时抛错，由调用方提示；合并无变化时不写历史栈。 */
async function mergeProjectJSON(raw,opts={}){
  if(!raw||typeof raw!=='object') throw new Error('不是有效的工程 JSON');
  if(!isReadableSchema(raw.schema)) throw new Error('schema 不匹配，不是本工具的工程文件');
  syncActiveFloor();
  const currentRaw=persistableState();
  const cur=state;
  const incomingRaw=mergeBlankMissingTimestamps(deepClone(raw));
  let incoming;
  try{ incoming=migrateProject(incomingRaw); }
  finally{ state=cur; }
  const {project,stats}=mergeProjectData(currentRaw,deepClone(incoming));
  /* 对象/楼层之外（图层、类型、墓碑）也可能有变化：用规范化序列化判断是否需要落盘 */
  if(mergeStable(project)===mergeStable(currentRaw)) return stats;
  /* history:'overwrite' 供实时协作：只有远端覆盖本地内容时才入撤销栈，
   * 纯新增/纯同步不挤占 20 条历史上限；默认行为仍是「有变化就写历史」。 */
  if(opts.history==='overwrite' ? mergeHistoryNeeded(stats) : opts.history!==false) pushHistory();
  state=migrateProject(project);
  /* 合并不接管对方的工程库绑定：只有本地已绑定才继续绑定 */
  state.meta.projectId=(currentRaw.meta&&currentRaw.meta.projectId)||'';
  selectedIds.clear(); draft=null;
  await afterStateLoaded(false);
  scheduleSave();
  refreshUI(); requestRender();
  return stats;
}
/** 图片槽清洗：只接受 kind:'image'；其余一律空槽（矢量数据由 site 承载） */
function sanitizeImageBackground(rawBg){
  rawBg=typeof rawBg==='object'&&rawBg?rawBg:{};
  const hasImageRef=!!(rawBg.assetId||rawBg.dataUrl||rawBg.fileName);
  if(rawBg.kind!=='image'&&!(rawBg.kind===undefined&&hasImageRef)) return createEmptyBackground();
  return {
    kind:'image',
    width:positiveNumber(rawBg.width,1000),
    height:positiveNumber(rawBg.height,700),
    metersPerPixel:positiveNumber(rawBg.metersPerPixel,0.1),
    origin:pointArray(rawBg.origin).length?pointArray(rawBg.origin)[0]:[0,0],
    assetId:typeof rawBg.assetId==='string'?rawBg.assetId:'',
    dataUrl:typeof rawBg.dataUrl==='string'?rawBg.dataUrl:'',
    fileName:typeof rawBg.fileName==='string'?rawBg.fileName:'',
    calibrated:!!rawBg.calibrated,
    transform:validImageTransform(rawBg.transform)
  };
}
/** 场地样式白名单：仅保留可安全写入 SVG 的填充/描边/透明度/线宽（审计 P1-8） */
const SITE_COLOR_RE=/^(#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\(\s*[0-9.,%\s/+-]+\)|transparent|[a-zA-Z]{3,20})$/i;
function sanitizeSiteStyle(raw){
  const out={};
  if(!raw||typeof raw!=='object') return out;
  const color=v=>typeof v==='string'&&SITE_COLOR_RE.test(v.trim())?v.trim():'';
  const fill=color(raw.fill), stroke=color(raw.stroke);
  if(fill) out.fill=fill;
  if(stroke) out.stroke=stroke;
  if(raw.fillAlpha!==undefined) out.fillAlpha=Math.min(1,Math.max(0,finiteNumber(raw.fillAlpha,.15)));
  if(raw.strokeWidth!==undefined) out.strokeWidth=Math.min(20,Math.max(.01,finiteNumber(raw.strokeWidth,2)));
  return out;
}
/**
 * 矢量场地槽清洗：复用 sanitizeShape 的形状规则，补独立元数据（id/name/layerId/visible/locked/annot/style）。
 * 场地不进 objects，不设 typeId；kind 始终等于 shape.type。
 */
function sanitizeSite(rawSite,layers){
  if(!rawSite||typeof rawSite!=='object') return null;
  const allowed=['rect','circle','ellipse','sector','parallelogram','polygon'];
  const shapeKind=rawSite.shape&&rawSite.shape.type;
  const kind=allowed.includes(rawSite.kind)?rawSite.kind:(allowed.includes(shapeKind)?shapeKind:'rect');
  const legacyW=positiveNumber(rawSite.width,1000)*positiveNumber(rawSite.metersPerPixel,0.1);
  const legacyH=positiveNumber(rawSite.height,700)*positiveNumber(rawSite.metersPerPixel,0.1);
  const shape=sanitizeShape(rawSite.shape,kind,legacyW,legacyH);
  const site=createSiteSlot(shape);
  site.id=typeof rawSite.id==='string'&&rawSite.id?rawSite.id:site.id;
  site.name=String(rawSite.name||'场地').slice(0,40);
  site.layerId=Array.isArray(layers)&&layers.some(l=>l.id===rawSite.layerId)?rawSite.layerId:'layer.default';
  site.visible=rawSite.visible!==false;
  site.locked=!!rawSite.locked;
  site.annot=typeof rawSite.annot==='object'&&rawSite.annot?rawSite.annot:{};
  site.style=sanitizeSiteStyle(rawSite.style);
  site.updatedAt=typeof rawSite.updatedAt==='string'?rawSite.updatedAt:'';
  site.kind=shape.type;
  return site;
}
/**
 * 双槽迁移（顶层与每个楼层共用）：
 * - 已是新档（存在 site 字段）：background/site 分别清洗；
 * - 旧档 background.kind==='image'：图片原样保留，site=null；
 * - 旧档 background.kind!=='image'：旧 background 迁入 site，background 置空图。
 */
function migrateBackgroundAndSite(raw,layers){
  raw=typeof raw==='object'&&raw?raw:{};
  if(Object.prototype.hasOwnProperty.call(raw,'site')){
    return { background:sanitizeImageBackground(raw.background||{}), site:sanitizeSite(raw.site,layers) };
  }
  const rawBg=typeof raw.background==='object'&&raw.background?raw.background:{};
  const hasImageRef=!!(rawBg.assetId||rawBg.dataUrl||rawBg.fileName);
  if(rawBg.kind==='image'||(rawBg.kind===undefined&&hasImageRef)){
    return { background:sanitizeImageBackground(rawBg), site:null };
  }
  return { background:createEmptyBackground(), site:sanitizeSite(rawBg,layers) };
}
function sanitizeViewport(raw){
  const v=Object.assign(createInitialState().viewport,raw&&typeof raw==='object'?raw:{});
  v.zoom=Math.min(APP_LIMITS.ZOOM_MAX,Math.max(APP_LIMITS.ZOOM_MIN,positiveNumber(v.zoom,1)));
  v.panX=finiteNumber(v.panX,0); v.panY=finiteNumber(v.panY,0);
  return v;
}
function finiteNumber(v,fallback){ const n=Number(v); return Number.isFinite(n)?n:fallback; }
function positiveNumber(v,fallback){ const n=Number(v); return Number.isFinite(n)&&n>0?n:fallback; }
function safeId(v,prefix){ const s=String(v??'').replace(/[^A-Za-z0-9_.-]/g,'_'); return s||prefix+uid('ID'); }
function pointArray(v){
  return Array.isArray(v) ? v.filter(Array.isArray).map(p=>[finiteNumber(p[0],NaN),finiteNumber(p[1],NaN)])
    .filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])) : [];
}
/**
 * 矢量场地形状清洗；image 不需要形状但仍保留一个合法默认。
 * 保留绝对坐标（矩形基点 x,y；圆/椭圆/扇形圆心 cx,cy；多边形顶点原值），
 * 使「场地节点」编辑后的负坐标/越界位置在保存→重载后不被打回原点。
 * 新建场地本就规整在第一象限，故既有工程数据清洗结果与旧版一致。
 */
function sanitizeShape(raw,kind,legacyW,legacyH){
  const sh=raw&&typeof raw==='object'?raw:{};
  if(kind==='circle'){
    const r=positiveNumber(sh.r,50);
    return {type:'circle',cx:finiteNumber(sh.cx,r),cy:finiteNumber(sh.cy,r),r};
  }
  if(kind==='ellipse'){
    const rx=positiveNumber(sh.rx,NaN), ry=positiveNumber(sh.ry,NaN);
    if(Number.isFinite(rx)&&Number.isFinite(ry)) return {type:'ellipse',cx:finiteNumber(sh.cx,rx),cy:finiteNumber(sh.cy,ry),rx,ry,angle:finiteNumber(sh.angle,0)};
    return {type:'rect',x:0,y:0,w:positiveNum(legacyW,100),h:positiveNum(legacyH,70)};
  }
  if(kind==='sector'){
    const r=positiveNumber(sh.r,NaN);
    if(Number.isFinite(r)){
      const a0=finiteNumber(sh.a0,0);
      const a1=finiteNumber(sh.a1,finiteNumber(sh.a0,0)+90);
      return {type:'sector',cx:finiteNumber(sh.cx,0),cy:finiteNumber(sh.cy,0),r,a0,a1};
    }
    return {type:'rect',x:0,y:0,w:positiveNum(legacyW,100),h:positiveNum(legacyH,70)};
  }
  if(kind==='polygon'){
    const pts=pointArray(sh.points);
    if(pts.length>=3) return {type:'polygon',points:pts.map(p=>[p[0],p[1]])};
    return {type:'rect',x:0,y:0,w:positiveNum(legacyW,100),h:positiveNum(legacyH,70)};
  }
  if(kind==='parallelogram'){
    return {type:'parallelogram',x:finiteNumber(sh.x,0),y:finiteNumber(sh.y,0),
      w:positiveNumber(sh.w,positiveNum(legacyW,100)),h:positiveNumber(sh.h,positiveNum(legacyH,70)),
      skew:Math.max(-PARALLELOGRAM_MAX_SKEW,Math.min(PARALLELOGRAM_MAX_SKEW,finiteNumber(sh.skew,PARALLELOGRAM_DEFAULT_SKEW)))};
  }
  if(kind==='rect') return {type:'rect',x:finiteNumber(sh.x,0),y:finiteNumber(sh.y,0),w:positiveNumber(sh.w,positiveNum(legacyW,100)),h:positiveNumber(sh.h,positiveNum(legacyH,70))};
  return {type:'rect',x:0,y:0,w:100,h:70};
}
function sanitizeLayers(arr){
  const out=[], seen=new Set();
  if(Array.isArray(arr)) arr.forEach(raw=>{
    if(!raw||typeof raw!=='object') return;
    const id=safeId(raw.id,'layer');
    /* CORE-P2-11：重复 id 保留首个，避免图层面板重复与对象归属二义；对象引用同一 id 不受影响 */
    if(seen.has(id)) return;
    seen.add(id);
    out.push({id,name:String(raw.name||'图层').slice(0,40),visible:raw.visible!==false,locked:!!raw.locked});
  });
  if(!out.some(l=>l.id==='layer.default')) out.unshift({id:'layer.default',name:'默认图层',visible:true,locked:false});
  return out;
}
function mergeTypes(saved){
  const map=new Map();
  deepClone(BUILTIN_TYPES).forEach(t=>map.set(t.id,t));
  (Array.isArray(saved)?saved:[]).forEach(t=>{
    if(!t||typeof t!=='object'||!['point','rect','line'].includes(t.kind)) return;
    const id=safeId(t.id,'type'), name=String(t.name||'自定义类型').slice(0,30);
    const color=/^#[0-9a-fA-F]{6}$/.test(t.color)?t.color:'#7c3aed';
    const savedType={id,name,kind:t.kind,color,icon:normalizeIcon(t.icon,t.kind),builtin:false};
    if(t.kind==='point'){
      const iconSize=finiteNumber(t.iconSize,NaN);
      if(iconSize>=.5&&iconSize<=5) savedType.iconSize=iconSize;
      if(['none','circle','square','sector','bar'].includes(t.scaleShape)){
        savedType.scaleShape=t.scaleShape;
        const fov=finiteNumber(t.fov,NaN);
        if(t.scaleShape==='sector'&&fov>=10&&fov<=360) savedType.fov=Math.round(fov);
      }
      /* 自定义 SVG 图元：与导入共用同一校验（路径数/长度/字符白名单），坏数据直接丢弃 */
      let paths=[];
      try{ paths=normalizeSymbolPaths(t.symbol); }catch(_){ paths=[]; }
      if(paths.length){
        savedType.symbol=paths;
        savedType.symbolViewBox=normalizeSymbolViewBox(t.symbolViewBox);
      }
      if(typeof SYMBOL_CATEGORIES!=='undefined'&&SYMBOL_CATEGORIES.includes(t.category)) savedType.category=t.category;
      const aliases=normalizeSymbolAliases(t.symbolAliases);
      if(aliases.length) savedType.symbolAliases=aliases;
    }
    if(t.defaultStyle&&typeof t.defaultStyle==='object') savedType.defaultStyle={
      fillAlpha:Math.min(1,Math.max(0,finiteNumber(t.defaultStyle.fillAlpha,.15))),
      strokeWidth:Math.max(.01,finiteNumber(t.defaultStyle.strokeWidth,.1))
    };
    map.set(id,savedType);
  });
  return Array.from(map.values());
}
/** 区域对象参数形状清洗；非法/缺省返回 null（调用方按矩形 width/height 处理） */
function sanitizeAreaShape(raw){
  if(!raw||typeof raw!=='object') return null;
  if(raw.type==='circle'){
    const r=positiveNumber(raw.r,NaN);
    return Number.isFinite(r)?{type:'circle',r}:null;
  }
  if(raw.type==='ellipse'){
    const rx=positiveNumber(raw.rx,NaN), ry=positiveNumber(raw.ry,NaN);
    return Number.isFinite(rx)&&Number.isFinite(ry)?{type:'ellipse',rx,ry}:null;
  }
  if(raw.type==='sector'){
    const r=positiveNumber(raw.r,NaN);
    if(!Number.isFinite(r)) return null;
    const a0=finiteNumber(raw.a0,0);
    let a1=finiteNumber(raw.a1,finiteNumber(raw.a0,0)+90);
    /* 张角钳到 (0,360] */
    let sweep=((a1-a0)%360+360)%360; if(sweep===0) sweep=360;
    return {type:'sector',r,a0,a1:a0+sweep};
  }
  if(raw.type==='parallelogram'){
    return {type:'parallelogram',skew:Math.max(-PARALLELOGRAM_MAX_SKEW,Math.min(PARALLELOGRAM_MAX_SKEW,finiteNumber(raw.skew,PARALLELOGRAM_DEFAULT_SKEW)))};
  }
  return null;
}
function sanitizeObjects(arr,layers,types,seenIds,seenNames,report){
  const out=[]; if(!Array.isArray(arr)) return out;
  seenIds=seenIds||new Set(); seenNames=seenNames||new Set();
  const audit=report||{duplicateIds:0,normalizedIds:0,duplicateNames:0};
  arr.forEach(raw=>{
    if(!raw||typeof raw!=='object'||!['point','rect','line','text','dimension'].includes(raw.kind)) return;
    const kind=raw.kind, layerId=layers.some(l=>l.id===String(raw.layerId))?String(raw.layerId):'layer.default';
    const hasType=typeId=>types.some(t=>t.id===typeId&&t.kind===kind);
    const typeId=hasType(String(raw.typeId))?String(raw.typeId):defaultTypeId(kind);
    const points=pointArray(raw.points);
    const x=finiteNumber(raw.x,0), y=finiteNumber(raw.y,0);
    const angle=normalizeAngle(finiteNumber(raw.angle,0));
    const rawId=String(raw.id??'');
    const baseId=safeId(raw.id,'OBJ');
    const rawName=String(raw.name??'').slice(0,80);
    const name=rawName||nextObjectId();
    const o=Object.assign(baseObject(kind,typeId,{name}),{
      id:baseId, name,
      layerId, x, y, angle,
      text:String(raw.text??'').slice(0,500), closed:!!raw.closed,
      subtype:['ruler','distance','area','angle'].includes(raw.subtype)?raw.subtype:'distance',
      phys:Math.max(0,finiteNumber(raw.phys,0)),
      visible:raw.visible!==false, locked:!!raw.locked, z:finiteNumber(raw.z,out.length),
      createdAt:typeof raw.createdAt==='string'?raw.createdAt:nowISO(), updatedAt:typeof raw.updatedAt==='string'?raw.updatedAt:nowISO()
    });
    if(kind==='rect'){
      const s=sanitizeAreaShape(raw.shape);
      if(s){
        o.shape=s;
        if(s.type==='parallelogram'){
          /* 平行四边形的底/高仍存在 width/height（shape 只存倾角），不能清零 */
          o.width=positiveNumber(raw.width,0); o.height=positiveNumber(raw.height,0);
          if(o.width<=0||o.height<=0) return;
        }else{
          o.width=0; o.height=0;
        }
      }else{
        o.shape=null;
        o.width=positiveNumber(raw.width,0); o.height=positiveNumber(raw.height,0);
        if(o.width<=0||o.height<=0) return;
      }
    }
    if(kind==='point'){ o.iconSize=Math.min(3,Math.max(.5,finiteNumber(raw.iconSize,1))); }
    if(kind==='text'){ o.height=positiveNumber(raw.height,2.2); }
    if(kind==='line'){ o.points=points; if(points.length<2||(o.closed&&points.length<3)) return; syncFirstPoint(o); }
    if(kind==='dimension'){
      o.points=points;
      const minPts=(o.subtype==='distance'||o.subtype==='ruler')?2:3;
      if(points.length<minPts) return;
      syncFirstPoint(o);
    }
    if(raw.style&&typeof raw.style==='object'){
      ['color'].forEach(k=>{ if(/^#[0-9a-fA-F]{6}$/.test(raw.style[k])) o.style[k]=raw.style[k]; });
      if(raw.style.fillAlpha!==undefined) o.style.fillAlpha=Math.min(1,Math.max(0,finiteNumber(raw.style.fillAlpha,.15)));
      if(raw.style.strokeWidth!==undefined) o.style.strokeWidth=Math.max(.01,finiteNumber(raw.style.strokeWidth,.1));
    }
    if(raw.props&&typeof raw.props==='object') Object.entries(raw.props).forEach(([k,v])=>{ if(['string','number','boolean'].includes(typeof v)) o.props[String(k).slice(0,40)]=v; });
    /* 逐对象标注开关：仅保留该 kind 支持键的布尔值；非法/缺失时按类型默认（不写回） */
    if(raw.annot&&typeof raw.annot==='object'){
      const keys=annotKeys(kind), clean={};
      keys.forEach(k=>{ if(typeof raw.annot[k]==='boolean') clean[k]=raw.annot[k]; });
      o.annot=clean;
    }
    /* 唯一性放在确认对象有效之后：丢弃的非法对象不占用 id/名称。
       重复 id 追加稳定后缀（同输入同结果），safeId 归一冲突也在此解决；重名走编号作用域。 */
    let id=o.id;
    if(seenIds.has(id)){
      let n=2;
      while(seenIds.has(id+'_'+n)) n++;
      id=id+'_'+n; audit.duplicateIds++;
    }
    if(rawId&&baseId!==rawId) audit.normalizedIds++;
    o.id=id; seenIds.add(id);
    if(seenNames.has(o.name)){ o.name=nextObjectId(); audit.duplicateNames++; }
    seenNames.add(o.name);
    out.push(o);
  });
  return out;
}
function loadImageSrc(src){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('图片解码失败'));
    img.src=src;
  });
}
async function afterStateLoaded(fit=true,opts={}){
  const seq=++bgLoadSeq;
  bgImage=null; bgImageState='none'; bgDataUrl='';
  resetTransientInteractionState(opts);   /* 草稿/拖拽/捕捉/参考线/覆盖层统一复位；校准语义见函数注释 */
  invalidateStatic();                       /* 状态整体替换：静态层必须重建 */
  resetFrameRef();                        /* 状态整体替换后重算取景框基准，避免 pan 补偿错位 */
  await ensureObjectPhotoAssets(state);   /* JSON 内嵌照片转存资产库（失败静默，不影响工程载入） */
  await ensureFloorBackgroundAssets(state); /* 非当前楼层的底图 dataUrl 同样转存资产库 */
  /* 旧版底图资产 */refreshUI();
  if(fit) fitView();
  requestRender();
  const bg=state.background;
  if(!isImageBackground(bg)) return;   /* 空槽（含仅场地）无需加载图片 */
  bgImageState='decoding';
  try{
    let url='';
    if(bg.assetId){
      const rec=await assetGet(bg.assetId);
      if(rec){
        url=await bytesToDataUrl(rec.bytes,rec.mime);
      }else if(bg.dataUrl){
        url=bg.dataUrl;            // 资产缺失（如跨设备清理过）退回内嵌图
      }else if(bg.assetId){
        throw new Error('资产缺失');
      }
    }else if(bg.dataUrl){
      url=bg.dataUrl;              // IDB 不可用的退化环境
    }
    if(!url){ bgImageState='missing'; refreshCalibStatus(); return; }
    bgDataUrl=url;
    const img=await loadImageSrc(url);
    if(seq===bgLoadSeq){ bgImage=img; bgImageState='ready'; refreshCalibStatus(); requestRender(); }
  }catch(e){
    if(seq===bgLoadSeq){ bgImageState='missing'; refreshCalibStatus(); toast('底图读取失败，请重新导入底图','warn'); }
  }
}
