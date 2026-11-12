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
  /* R-06：localStorage 里的兜底草稿、救援副本、协作待发队列同样可能引用资产；
     漏扫会在 GC 时误删"只在副本里存活"的底图/照片。读取或解析失败即整体放弃回收（fail-safe）。 */
  assetRefsFromLocalStorage(ns);
  /* 读不到工程库就不动资产：宁可晚回收，也不能删掉看不见的工程 */
  const keys=await idbAllKeys();
  for(const key of keys){
    const k=String(key);
    const isSnapshot=k.startsWith(SNAPSHOT_PREFIX);
    if(k!=='current'&&!k.startsWith(PROJECT_PREFIX)&&!isSnapshot) continue;
    let rec=null;
    /* M-01：单键读取失败不能当作"无引用"跳过，否则该记录引用的资产会被误删 */
    try{ rec=await idbGetKey(key); }
    catch(e){ throw new Error('资产引用扫描失败：'+k+(e&&e.message?'（'+e.message+'）':'')); }
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
 * localStorage 命名空间资产引用（R-06）：草稿、救援副本、协作待发（含旧单键与备份）。
 * 任一记录解析失败抛错，由 pruneBgAssets 捕获后整体跳过回收，避免"扫不全就误删"。
 * @param {Map<string,string[]>} ns 原地写入
 */
function assetRefsFromLocalStorage(ns){
  const read=(key,label,wrap)=>{
    let raw=null;
    try{ raw=localStorage.getItem(key); }
    catch(e){ throw new Error('读取本地副本失败：'+(e&&e.message||e)); }
    if(!raw) return;
    let rec=null;
    try{ rec=JSON.parse(raw); }
    catch(e){ throw new Error('本地副本 '+label+' 解析失败，已取消资产回收'); }
    const snapshot=wrap?wrap(rec):rec;
    if(!snapshot) return;
    const ids=ContentAssets.collectAssetRefs(snapshot);
    if(ids.length) ns.set(label,ids);
  };
  read(LS_KEY,'ls:draft',r=>r);
  read(RESCUE_KEY,'rescue:draft',r=>r&&r.snapshot);
  if(typeof COLLAB_PENDING_KEY==='string') read(COLLAB_PENDING_KEY,'collab:legacy',r=>r&&r.project);
  if(typeof COLLAB_PENDING_BAK_KEY==='string') read(COLLAB_PENDING_BAK_KEY,'collab:backup',r=>r&&r.project);
  if(typeof COLLAB_PENDING_PREFIX==='string'){
    let keys=[];
    try{
      for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k&&k.startsWith(COLLAB_PENDING_PREFIX)) keys.push(k); }
    }catch(e){ throw new Error('枚举协作待发队列失败，已取消资产回收'); }
    keys.forEach(k=>read(k,'collab:'+k.slice(COLLAB_PENDING_PREFIX.length),r=>r&&r.project));
  }
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
/** 资产 GC：失败（含 IndexedDB 不可用 / 本地副本不可解析）时**不删除任何资产** */
let assetGcLastSkip='',assetGcSkipNotified=false;
async function pruneBgAssets(){
  try{
    const keep=await reachableAssetIds();
    assetGcLastSkip='';
    return await assetPrune(keep);
  }catch(e){
    /* M-01：扫描不完整就整体放弃回收，并让用户知道"为什么没清理" */
    assetGcLastSkip=String(e&&e.message||e||'资产引用扫描失败');
    if(!assetGcSkipNotified&&typeof toast==='function'){
      assetGcSkipNotified=true;
      toast(L('资产回收已跳过：{msg}，未删除任何文件',{msg:assetGcLastSkip}),'warn');
    }
    return [];
  }
}
/** 删除快照/历史后延迟回收资产，避免与保存、快照索引写入抢同一事件循环 */
let assetGcTimer=null;
function scheduleAssetGc(delay){
  clearTimeout(assetGcTimer);
  assetGcTimer=setTimeout(()=>{ assetGcTimer=null; pruneBgAssets(); },Number.isFinite(delay)?delay:800);
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
  toast(L('已撤销'));
}
function redo(){
  if(!history.future.length) return;
  const prevPast=history.past.length?history.past[history.past.length-1]:null;
  history.past.push(snapshotHistoryState(state,prevPast));
  state=materializeHistoryState(history.future.pop());
  selectedIds.clear();
  afterStateLoaded(false); pruneBgAssets();
  markDirty('restore');            /* 重做同样落盘，避免刷新后回滚（审计 P0-4） */
  toast(L('已重做'));
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
  floor:Object.freeze({ui:'none',broadcast:false}),
  settings:Object.freeze({ui:'full',broadcast:true})
});
function markDirty(kind, ids){
  const p=MARK_DIRTY_PROFILES[kind]||MARK_DIRTY_PROFILES.object;
  const hadCoverage=!!coverageResult;
  clearCoverageResult();               /* 对象/楼层变更后覆盖率叠加层失效，需重新分析 */
  /* R-09：属性面板逐键编辑优先局部修补静态层；任一前提不成立才整层重建 */
  const patched=kind==='objectEdit'&&!hadCoverage&&typeof patchStaticObjects==='function'&&patchStaticObjects(ids);
  if(!patched) invalidateStatic();     /* 静态层（非选中对象）需要重建 */
  scheduleSave();
  requestRender();
  if(p.ui==='full') refreshUI();
  else if(p.ui==='lists'){
    /* R-09：逐键编辑的对象表/统计重绘合并为一次，避免 5k 行表格阻塞输入 */
    if(kind==='objectEdit'&&typeof scheduleListsRefresh==='function') scheduleListsRefresh();
    else { renderList(); renderLayers(); renderStats(); }
  }
  if(p.broadcast&&typeof collabOnLocalChange==='function') collabOnLocalChange();
}
/** 单个对象单调打点：新时间必须严格大于旧值（同一毫秒连续提交也递增）。 */
function stampObject(o){
  if(!o||typeof o!=='object') return false;
  const prev=typeof o.updatedAt==='string'?o.updatedAt:'';
  let ts=new Date().toISOString();
  if(prev && ts<=prev) ts=new Date(new Date(prev).getTime()+1).toISOString();
  o.updatedAt=ts; return true;
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
  for(const id of list){ if(stampObject(idx.get(id))) n++; }
  return n;
}
/** 对给定对象引用集合单调打点（F17）：objectIndexById() 只覆盖当前楼层，
 *  跨楼层迁移必须按受影响对象引用直接打点，否则非当前楼层对象的 updatedAt 不更新，
 *  协作合并会保留对端旧引用。 */
function stampObjectsIn(objs){
  if(!objs) return 0;
  let n=0;
  for(const o of objs) if(stampObject(o)) n++;
  return n;
}
/** @param {string} [floorId] 需要打点的楼层；缺省当前楼层（CORE-P2-8：重命名非当前楼层时也要刷新该层） */
function commitChange(message, ids, floorId){
  stampObjects(ids);
  touchFloor(floorId);
  state.meta.updatedAt=nowISO();
  state.objects.forEach((o,i)=>o.z=i);
  bumpZVersion();
  markDirty('object');
  if(message) toast(message,'success');
}
function commitObjectEdit(ids){
  stampObjects(ids);
  touchFloor();
  state.meta.updatedAt=nowISO();
  state.objects.forEach((o,i)=>o.z=i);
  markDirty('objectEdit', ids);
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
/** 工程库键只接受清洗后的 id（H-02）：trim、仅 [A-Za-z0-9_-]、1–64 字符；非法返回空串 */
function normalizeProjectId(id){
  const s=String(id==null?'':id).trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(s)?s:'';
}
const projectKey=id=>PROJECT_PREFIX+id;
/** 以工程库记录键为准修正内层 meta.projectId（H-02）：返回 'filled' | 'fixed' | '' */
function reconcileProjectId(raw,id){
  const pid=normalizeProjectId(id);
  if(!pid||!raw||typeof raw!=='object') return '';
  raw.meta=raw.meta||{};
  const inner=String(raw.meta.projectId||'').trim();
  if(inner===pid) return '';
  raw.meta.projectId=pid;
  return inner?'fixed':'filled';
}
function idbReq(store,method,arg){
  return idbTx(DB_STORE,store,s=>new Promise((resolve,reject)=>{
    const r=s[method](arg); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); r.onblocked=()=>reject(new Error('IndexedDB 被占用'));
  }));
}
async function idbPutKey(key,project){ return idbTx(DB_STORE,'readwrite',s=>s.put(project,key)); }
/** R-05：current 与工程库副本同属一个 object store，放进同一事务写入，避免半写。
 *  projectId 为空时只写 current（草稿工程不占工程库键）。 */
async function idbPutCurrentAndProject(project,projectId){
  const pid=normalizeProjectId(projectId);
  return idbTx(DB_STORE,'readwrite',s=>{
    s.put(project,'current');
    if(pid) s.put(project,projectKey(pid));
  });
}
/** 同工程时间比较：只比较同一 projectId（或都未绑定）的记录，时间相同不判冲突。
 *  跨工程共用一个 current 时不能互相阻断。 */
function isStaleSnapshot(stored,next){
  if(!stored||typeof stored!=='object') return false;
  const a=String((stored.meta&&stored.meta.projectId)||'');
  const b=String((next&&next.meta&&next.meta.projectId)||'');
  if(a!==b) return false;
  return projectFreshness(stored)>projectFreshness(next);
}
/** H-01：同一事务内先读同工程副本，只有不比本页新才写 current + proj，避免整工程快照覆盖。 */
async function idbPutCurrentAndProjectGuarded(project,projectId){
  const pid=normalizeProjectId(projectId);
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    let out=null;
    const tx=db.transaction(DB_STORE,'readwrite');
    const s=tx.objectStore(DB_STORE);
    const r=pid?s.get(projectKey(pid)):s.get('current');
    r.onerror=()=>reject(r.error||new Error('IndexedDB 读取失败'));
    r.onsuccess=()=>{
      try{
        if(isStaleSnapshot(r.result,project)){ out={stale:true}; return; }
        s.put(project,'current');
        if(pid) s.put(project,projectKey(pid));
        out={stale:false};
      }catch(e){          /* 同步抛错（如配额）必须回传，否则保存会静默挂起 */
        reject(e); tx.abort();
      }
    };
    tx.oncomplete=()=>resolve(out||{stale:false});
    tx.onerror=()=>reject(tx.error||new Error('IndexedDB 写入失败'));
    tx.onabort=()=>reject(tx.error||new Error('IndexedDB 写入已中止'));
  });
}
async function idbGetKey(key){ return idbReq('readonly','get',key); }
async function idbDeleteKey(key){ return idbReq('readwrite','delete',key); }
async function idbAllKeys(){
  const keys=await idbReq('readonly','getAllKeys',undefined);
  return Array.from(keys||[]).filter(k=>typeof k==='string');
}
/** R-29：按前缀枚举键（openKeyCursor 区间扫描），避免先把全库键物化再过滤；
 *  当前工程库与资产共用同一 DB 但不同 object store，仍限定在 DB_STORE 内。 */
async function idbKeysByPrefix(prefix){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const out=[];
    const tx=db.transaction(DB_STORE,'readonly');
    const r=tx.objectStore(DB_STORE).openKeyCursor(IDBKeyRange.bound(prefix,prefix+'\uffff'));
    r.onsuccess=()=>{ const c=r.result; if(!c) return; out.push(String(c.key)); c.continue(); };
    r.onerror=()=>reject(r.error||new Error('IndexedDB 读取失败'));
    tx.onerror=()=>reject(tx.error||new Error('IndexedDB 读取失败'));
    tx.oncomplete=()=>resolve(out);
    tx.onabort=()=>reject(tx.error||new Error('IndexedDB 读取已中止'));
  });
}
/** 工程库摘要列表（不装载底图），按更新时间倒序；R-29 只枚举 proj: 前缀键 */
async function listProjects(){
  let keys=[];
  try{ keys=await idbKeysByPrefix(PROJECT_PREFIX); }catch(e){ return []; }
  const out=[];
  for(const key of keys){
    let p=null; try{ p=await idbGetKey(key); }catch(e){}
    if(p&&isReadableSchema(p.schema)){
      out.push({key,id:key.slice(PROJECT_PREFIX.length),
        name:p.meta?.name||L('未命名工程'),updatedAt:p.meta?.updatedAt||'',
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
/** 工程对象数上限守卫：打开工程库、导入、协作合并共用同一判据（CORE-P2-20） */
function assertProjectWithinLimits(raw,label){
  const errs=importLimitErrors({objects:countProjectObjects(raw)});
  if(errs.length) throw new Error(label+'超出上限：'+importLimitMessage(errs));
}
/** M-13：交互式新增前容量校验（变更前调用，失败不产生半成品/历史）；批量按数量一次校验 */
function ensureObjectCapacity(add=1){
  if(countProjectObjects(state)+add<=APP_LIMITS.OBJECTS_MAX) return true;
  toast(L('对象数量已达上限（{max}），请先删除部分对象',{max:APP_LIMITS.OBJECTS_MAX}),'warn');
  return false;
}
/** 切工程前强制落盘：清掉 450ms 防抖/重试定时器并立即保存旧现场。
 *  租约被另一标签占用或落盘失败时抛错，由调用方取消切换并提示，不再静默丢弃最后一次编辑。 */
async function flushPendingSave(){
  /* R-05：在途写也算 pending，否则切换工程会与上一条保存并发，旧快照可能后落盘 */
  const pending=!!saveTimer||!!saveRetryTimer||saveInFlight>0;
  clearTimeout(saveTimer); saveTimer=null;
  clearTimeout(saveRetryTimer); saveRetryTimer=null;
  if(!pending) return;
  /* P0-04：救援模式下不做静默返回——有未落盘编辑时必须让调用方停下并要用户确认 */
  if(rescueHold) throw new Error('救援模式：未落盘编辑尚未导出，已取消切换');
  if(leaseSaveBlocked()) throw new Error('另一标签页正在编辑，已取消切换以保护草稿');
  try{ await runSave(); }
  catch(e){ reportSaveFailure(e,'idb'); throw new Error('旧工程保存失败，已取消切换'); }
  if(saveHealth.state==='failed') throw new Error('旧工程保存失败，已取消切换');
}
/** 打开工程库中的工程：先构建候选 → 准备资产 → 原子替换；任何失败保持当前现场（审计 P1-9） */
async function openProjectById(id){
  const pid=normalizeProjectId(id);
  if(!pid) throw new Error('工程标识非法');
  await flushPendingSave();
  const raw=await idbGetKey(projectKey(pid));
  if(!raw||!isReadableSchema(raw.schema)) throw new Error('工程不存在或已损坏');
  assertProjectWithinLimits(raw,'工程');
  /* H-02：内层 projectId 以记录键为准；缺失补齐、冲突一次性修正，只写回 proj:<pid> */
  if(reconcileProjectId(raw,pid)==='fixed') toast(L('工程标识不一致，已按工程库记录修正'),'warn');
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
  raw.meta=raw.meta||{}; raw.meta.name=String(name||L('未命名工程')).trim().slice(0,80)||L('未命名工程');
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
  p.meta.name=(p.meta.name||L('未命名工程'))+L(' 副本');
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
/** 单张照片 base64 是否超过资产上限（超限资产库必拒收）。
 *  先按字符长度快速排除：合法 base64 解码后一定不长于源串，短串无需解码。 */
function oversizePhotoDataUrl(du){
  if(typeof du!=='string'||du.length<=APP_LIMITS.ASSET_MAX_BYTES) return false;
  try{ return dataUrlToBytes(du).bytes.length>APP_LIMITS.ASSET_MAX_BYTES; }
  catch(_){ return false; }
}

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
  /* P2-05：超过单张资产上限的照片无法进资产库，写进工程记录/自动保存只会长期
     持有必失败的大字符串；只在副本上剥离，实时 state 保留供当前会话查看。 */
  projectObjectLists(copy).forEach(list=>list.forEach(o=>{
    if(o&&o.props&&oversizePhotoDataUrl(o.props.photoDataUrl)) delete o.props.photoDataUrl;
  }));
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
/** 删除图层/类型并把全楼层引用迁移到 toId（F17）。调用方负责确认与 pushHistory。
 *  先写回当前楼层，再遍历所有楼层收集受影响对象；objectIndexById() 只覆盖当前楼层，
 *  因此用 stampObjectsIn 按引用打点，非当前楼层对象的 updatedAt 也单调递增，
 *  协作合并不会保留对端旧引用。
 *  @param {'layer'|'type'} kind
 *  @returns {number} 受影响对象数 */
function migrateRefsAndDelete(kind, fromId, toId){
  const field=kind==='layer'?'layerId':'typeId';
  const moved=[];
  syncActiveFloor();
  (state.floors||[]).forEach(f=>(f.objects||[]).forEach(o=>{ if(o&&o[field]===fromId){ o[field]=toId; moved.push(o); } }));
  if(kind==='layer') state.layers=state.layers.filter(x=>x.id!==fromId);
  else state.objectTypes=state.objectTypes.filter(x=>x.id!==fromId);
  markTombstone(fromId,kind);      /* MERGE-10：删除随墓碑传播到离线副本 */
  stampObjectsIn(moved);
  commitChange(kind==='layer'?'已删除图层':'已删除类型');
  return moved.length;
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
/** M-14：工程内容实质变化（用户切层/设置提交）时推进 meta.updatedAt，供工程库排序与协作新鲜度。
 *  只读路径（导出临时切层、定位违规对象）必须传 silent，不得污染更新时间。 */
function touchProjectUpdated(){ state.meta.updatedAt=nowISO(); }
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
/** 切换楼层（含底图加载、视图适配、面板刷新）；silent=只读临时切层，不推进工程更新时间（M-14） */
async function switchFloor(id, silent){
  if(!switchFloorData(id)) return false;
  if(!silent) touchProjectUpdated();
  await afterStateLoaded(false);
  fitView(); requestRender(); renderProps();
  scheduleSave();                  /* 切换也是一次状态变更：刷新后回到上次活动楼层（审计 P0-4 补口） */
  return true;
}
/** 在指定楼层内执行异步任务（如逐层导出/打印），结束后恢复原楼层、视口与选择集。
 *  P1-6：必须 await switchFloor 并校验返回值，且等待底图就绪后才执行 fn；
 *  旧实现不 await（`!switchFloor(id)` 对 Promise 恒为 false），底图仍在解码/未加载就取像素，
 *  导出的多楼层 PDF 会缺底图；切层失败则中止，绝不导出错楼层的内容。 */
async function withFloor(id, fn){
  if(!id||id===state.activeFloorId){
    if(!(await waitBackgroundReady())) throw new Error('楼层底图未就绪，已中止导出');
    return fn();
  }
  const prevId=state.activeFloorId;
  const prevViewport=deepClone(state.viewport);
  const prevSelection=new Set(selectedIds);
  if(!(await switchFloor(id, true))) throw new Error('楼层切换失败，已中止导出');
  try{
    if(!(await waitBackgroundReady())) throw new Error('楼层底图未就绪，已中止导出');
    return await fn();
  }finally{
    if(await switchFloor(prevId, true)){
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
/* R-03：救援模式专用同步副本。pagehide 里无法可靠 await IndexedDB，救援场景只允许写这个键，
   绝不能写 'current' / LS_KEY，否则会用半可信现场覆盖原记录。 */
const RESCUE_KEY='plotpin.rescue.draft';
/** 统一保存闸门：三个写入入口（scheduleSave / flushPendingSave / flushBeforeUnload）共用同一判据 */
function saveBlockState(){
  if(rescueHold) return 'rescue';
  if(leaseSaveBlocked()) return 'lease';
  return 'ok';
}
function writeRescueDraft(snapshot){
  try{ localStorage.setItem(RESCUE_KEY,JSON.stringify({v:1,at:nowISO(),snapshot})); return true; }catch(_){ return false; }
}
function readRescueDraft(){
  let raw='';
  try{ raw=localStorage.getItem(RESCUE_KEY)||''; }catch(_){ return null; }
  if(!raw) return null;
  try{
    const rec=JSON.parse(raw);
    if(!rec||rec.v!==1||!rec.snapshot||!isReadableSchema(rec.snapshot.schema)) return null;
    return rec;
  }catch(_){ return null; }
}
function clearRescueDraft(){ try{ localStorage.removeItem(RESCUE_KEY); }catch(_){} }
/** 草稿 localStorage 兜底唯一写法；返回是否写入成功 */
function writeLocalDraft(s){
  try{ localStorage.setItem(LS_KEY,JSON.stringify(s)); return true; }catch(_){ return false; }
}
/* -------------------- 保存健康：错误分类与有限退避（D-08） -------------------- */
/** 仅瞬时错误重试；1s/3s/9s 三次后停止。配额错误不重试，直接给导出/清理入口 */
const SAVE_RETRY_MS=[1000,3000,9000];
let saveHealth={state:'ok',errorCode:'',lastOkAt:'',retry:0};
let saveRetry=0,saveRetryTimer=null;
/* H-01：落盘时发现库内同工程副本比本页快照更新，置位表示已拒绝覆盖 */
let staleWrite=false;
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
/* R-05：保存串行化。同一时刻只允许一条写链路（saveChain），并用递增序号丢弃过期结果，
   防止两次保存并发时"旧快照后落盘"覆盖新数据。flushPendingSave 依据 saveInFlight 判断是否有在途写。 */
let saveSeq=0,lastSavedSeq=0,saveInFlight=0,saveChain=Promise.resolve();
async function runSave(){
  const seq=++saveSeq;
  saveInFlight++;
  const task=saveChain.then(()=>saveOnce(seq));
  saveChain=task.catch(()=>{}).then(()=>{ saveInFlight=Math.max(0,saveInFlight-1); });
  return task;
}
async function saveOnce(seq){
  clearTimeout(saveRetryTimer); saveRetryTimer=null;
  /* 定时器已触发/已被本函数接管，必须置空，否则 flushPendingSave 会永久误判"还有待保存" */
  saveTimer=null;
  /* 落盘前统一资产化：内嵌 dataUrl（PDF 导入 / JSON 导入 / 旧草稿）必须先拿到 assetId，
     否则 persistableState 会剥离 dataUrl，重开即永久丢图（N-03） */
  await ensureProjectBackgroundAssets(state);
  /* 快照一旦取出就不再读 state，避免 await 期间状态变化导致"写新状态、记旧序号"的错配 */
  const snapshot=persistableState();
  if(seq<lastSavedSeq) return false;
  try{
    const write=await idbPutCurrentAndProjectGuarded(snapshot,snapshot.meta&&snapshot.meta.projectId||'');
    if(write&&write.stale){
      /* 不覆盖库内更新副本；本地草稿留底，等待用户导出或重载 */
      writeLocalDraft(snapshot);
      staleWrite=true;
      saveStatus(L('另一标签页正在编辑，已暂停自动保存'));
      if(typeof showStaleWriteBanner==='function') showStaleWriteBanner();
      return false;
    }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsForStorage(snapshot.settings)));
    if(seq<lastSavedSeq) return false;
    lastSavedSeq=seq;
    saveRetry=0; saveHealth={state:'ok',errorCode:'',lastOkAt:nowISO(),retry:0}; hideSaveFailureBanner();
    const pid=snapshot.meta&&snapshot.meta.projectId;
    saveStatus((pid?'📁 '+L('已保存')+' ':L('已自动保存')+' ')+new Date().toLocaleTimeString());
    return true;
  }catch(e){
    if(seq<lastSavedSeq) return false;
    const ok=writeLocalDraft(snapshot);
    const delay=reportSaveFailure(e,'idb');
    saveHealth.state=ok?'degraded':'failed';
    if(delay>0) saveRetryTimer=setTimeout(runSave,delay);
    return false;
  }
}
function scheduleSave(){
  const block=saveBlockState();
  if(block==='rescue'){ saveStatus('救援模式：原记录未被覆盖'); return; }
  if(block==='lease'){ saveStatus(L('另一标签页正在编辑，已暂停自动保存')); return; }
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
  if(layerIds.size) objs.forEach(o=>{ if(o&&typeof o==='object'&&o.layerId&&!layerIds.has(o.layerId)) badLayer++; });
  if(badLayer) warnings.push('未知图层 '+badLayer);
  const bg=p.background;
  if(bg!==undefined&&(!bg||typeof bg!=='object'||Array.isArray(bg))) warnings.push('底图损坏');
  else if(bg&&bg.kind==='image'&&!bg.assetId&&!bg.dataUrl) warnings.push('资产缺失');
  const site=p.site;
  if(site!==undefined&&(!site||typeof site!=='object'||Array.isArray(site))) warnings.push('场地损坏');
  return {level:errors.length?'error':(warnings.length?'warn':'ok'),errors,warnings};
}
/** 工程新鲜度：meta.updatedAt 的毫秒值；缺失/非法按 0 处理，旧档不会因此抢赢新档 */
function projectFreshness(p){
  const t=p&&p.meta&&p.meta.updatedAt;
  const n=Date.parse(t||'');
  return Number.isFinite(n)?n:0;
}
/**
 * 加载工程：R-04 —— IndexedDB current、localStorage 兜底草稿、救援副本三处候选统一比较新鲜度，
 * 采用「可读 + schema 兼容 + meta.updatedAt 最大」的一份；时间相同优先 IndexedDB（主存储）。
 * 采用较新草稿时绝不删除 IndexedDB 记录，原自动保存保留在本地，避免"选新反而丢旧"。
 * 不可读候选原样转为救援副本（rescue），由横幅提供导出入口。
 * @returns {Promise<{state:object|null,audit:object,rescue:{source:string,text:string}|null,fallback:boolean,source:string,newerThanIdb:boolean}>}
 */
async function loadSavedProject(){
  const emptyAudit={level:'ok',errors:[],warnings:[]};
  const candidates=[];
  try{
    const p=await idbGet();
    if(p!==undefined&&p!==null) candidates.push({source:'IndexedDB',raw:p});
  }catch(e){ /* 读取失败按无候选处理，继续看本地副本 */ }
  try{
    const raw=localStorage.getItem(LS_KEY);
    if(raw) candidates.push({source:'localStorage',raw});
  }catch(e){}
  const rescueRec=readRescueDraft();
  if(rescueRec) candidates.push({source:'rescue',raw:rescueRec.snapshot});
  /* P0-05：离线协作待发快照作为第四候选；只读采用，绝不删除待发记录 */
  if(typeof collabPendingCandidates==='function') collabPendingCandidates().forEach(c=>candidates.push(c));
  if(!candidates.length) return {state:null,audit:emptyAudit,rescue:null,fallback:false,source:'',newerThanIdb:false};
  const audited=candidates.map(c=>{
    let p=c.raw;
    const tag={nopid:!!c.nopid};
    if(typeof p==='string'){
      try{ p=JSON.parse(p); }
      catch(_){ return {source:c.source,raw:c.raw,p:null,audit:{level:'error',errors:['JSON 损坏'],warnings:[]},...tag}; }
    }
    return {source:c.source,raw:c.raw,p,audit:auditProject(p),...tag};
  });
  /* 不可读候选保留为救援副本；IndexedDB 优先作为原始文本来源 */
  let rescue=null;
  audited.forEach(c=>{
    if(c.audit.level!=='error'||rescue) return;
    const text=typeof c.raw==='string'?c.raw:(c.p==null?'':JSON.stringify(c.p));
    rescue={source:c.source,text};
  });
  const usable=audited.filter(c=>c.p&&c.audit.level!=='error'&&isReadableSchema(c.p.schema));
  /* __nopid__ 待发记录只与无 pid 草稿同权：存在任何带 pid 的候选时不得参选 */
  const hasPid=usable.some(c=>c.p&&c.p.meta&&String(c.p.meta.projectId||''));
  const currentPid=state&&state.meta&&String(state.meta.projectId||'');
  const pool=usable.filter(c=>c.source!=='collabPending'||!c.nopid||(!hasPid&&!currentPid));
  let chosen=null;
  pool.forEach(c=>{
    const at=projectFreshness(c.p);
    if(!chosen||at>chosen.at||(at===chosen.at&&c.source==='IndexedDB')) chosen={source:c.source,p:c.p,audit:c.audit,at};
  });
  if(!chosen){
    const bad=audited.find(c=>c.audit.level==='error')||audited[0];
    return {state:null,audit:bad.audit,rescue,fallback:false,source:'',newerThanIdb:false};
  }
  const idbCand=usable.find(c=>c.source==='IndexedDB');
  const newerThanIdb=chosen.source!=='IndexedDB'&&(!idbCand||projectFreshness(chosen.p)>projectFreshness(idbCand.p));
  const st=migrateProject(chosen.p);
  noteDroppedObjects(chosen.audit);
  state=st;
  await ensureBackgroundAsset(st);
  return {state:st,audit:chosen.audit,rescue,fallback:chosen.source!=='IndexedDB',source:chosen.source,newerThanIdb};
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
  let oversize=0;
  for(const list of projectObjectLists(st)) for(const o of list){
    const du=o&&o.props&&o.props.photoDataUrl;
    if(!du) continue;
    if(oversizePhotoDataUrl(du)){ oversize++; continue; }
    try{
      const bin=dataUrlToBytes(du);
      const id=assetIdFor(bin.bytes);
      if(!done.has(id)){ await assetPut(id,{bytes:bin.bytes,mime:bin.mime||'image/jpeg'}); done.add(id); }
      o.props.photoId=id;
      delete o.props.photoDataUrl;
    }catch(_){ /* 保留 dataUrl，照片仍可在当前会话查看 */ }
  }
  return oversize;
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
let lastSanitizeReport={duplicateIds:0,normalizedIds:0,duplicateNames:0,dropped:0};
function sanitizeReport(){ return lastSanitizeReport; }
/** 把「结构非法而丢弃的对象数」追加到加载审计，确保丢对象不静默（P2-A4）。 */
function noteDroppedObjects(audit){
  const n=sanitizeReport().dropped||0;
  if(n) audit.warnings.push('对象丢弃 '+n);
}
/** 设置清洗（唯一真源）：工程载入与启动本机设置共用同一套规则。
 *  只读取 SETTINGS_KEYS 白名单内的自有键，`__proto__` 等原型键不会进入 Object.assign（CORE-P2-1）。 */
function sanitizeSettings(raw){
  const settings=Object.assign({},createInitialState().settings);
  if(raw&&typeof raw==='object'&&!Array.isArray(raw)){
    SETTINGS_KEYS.forEach(k=>{ if(Object.prototype.hasOwnProperty.call(raw,k)) settings[k]=raw[k]; });
  }
  settings.unit='m';
  settings.precision=Math.min(6,Math.max(0,Math.round(finiteNumber(settings.precision,2))));
  settings.gridSize=positiveNum(settings.gridSize,1);
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
  settings.exportOnlyDelivered=!!settings.exportOnlyDelivered;   /* 旧档缺省=全量导出 */
  settings.pdfDpi=PDF_DPI_OPTIONS.includes(settings.pdfDpi)?settings.pdfDpi:PDF_DPI_DEFAULT;
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
  const report={duplicateIds:0,normalizedIds:0,duplicateNames:0,dropped:0};
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
      /* v1→v2：保留已有楼层时间；旧档缺失时写空串，避免迁移瞬间把旧楼层当成最新写入。
         M-04：未来/非法时间归一为空串（LWW 视作最旧），与对象同一 normalizeTimestamp 口径 */
      const updatedAt=normalizeTimestamp(f.updatedAt);
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
    /* floors 非空时 activeFloorId 必然命中：匹配则保留，否则回退首层（首层由上面的补默认层保证存在） */
    const activeFloorId=floors.some(f=>f.id===p.activeFloorId)?p.activeFloorId:floors[0].id;
    if(report.duplicateIds||report.normalizedIds||report.duplicateNames||report.dropped){
      if(typeof console!=='undefined'&&console.warn) console.warn('[sanitize] 对象清洗修正',report);
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
  const site=createSiteSlot(defaultSiteShape());
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
    const kind=TOMBSTONE_KINDS.includes(raw.kind)?raw.kind:'object';
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
/** 记录一次删除（对象/楼层/图层/类型）；重复删除同一目标时刷新删除时间。
 *  增量淘汰：攒够 TOMBSTONE_EVICT_BATCH 条才压缩一次（而非每次删除都全量排序）。 */
function markTombstone(id,kind='object'){
  if(!id) return null;
  state.tombstones=Array.isArray(state.tombstones)?state.tombstones:[];
  const k=TOMBSTONE_KINDS.includes(kind)?kind:'object';
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
  return ((s.updated||0)+(s.deleted||0)+(s.floorMetaUpdated||0)+(s.floorsDeleted||0)+(s.siteDeleted||0)+(s.siteCleared||0)+(s.layersDeleted||0)+(s.typesDeleted||0))>0;
}
/** 合并他人工程 JSON（离线 LWW）：读取→清洗→按 id/更新时间合并→替换现场。
 *  schema 不符或结构损坏时抛错，由调用方提示；合并无变化时不写历史栈。 */
async function mergeProjectJSON(raw,opts={}){
  if(!raw||typeof raw!=='object') throw new Error('不是有效的工程 JSON');
  if(!isReadableSchema(raw.schema)) throw new Error('schema 不匹配，不是本工具的工程文件');
  assertProjectWithinLimits(raw,'合并工程');          /* CORE-P2-20：协作/离线合并复用导入限额 */
  syncActiveFloor();
  const currentRaw=persistableState();
  const cur=state;
  const incomingRaw=mergeBlankMissingTimestamps(deepClone(raw));
  /* B8：入站时间戳校验/钳制，未来时间戳不得永久压制本地编辑 */
  const clockClamped=mergeClampTimestamps(incomingRaw);
  let incoming;
  try{ incoming=migrateProject(incomingRaw); }
  finally{ state=cur; }
  const {project,stats}=mergeProjectData(currentRaw,deepClone(incoming));
  if(clockClamped) stats.clockClamped=clockClamped;
  if(clockClamped) console.warn(`合并：${clockClamped} 个时间戳非法或超前，已置空`);
  assertProjectWithinLimits(project,'合并结果');      /* 两侧各自未超限、并集仍可能超限 */
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
    width:positiveNum(rawBg.width,1000),
    height:positiveNum(rawBg.height,700),
    metersPerPixel:positiveNum(rawBg.metersPerPixel,0.1),
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
/** 场地标注清洗：只保留已知布尔键；annot 为兼容字段，不参与当前渲染（CORE-P2-12） */
function sanitizeSiteAnnot(raw){
  const out={};
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return out;
  SITE_ANNOT_SETTING_KEYS.forEach(k=>{ if(typeof raw[k]==='boolean') out[k]=raw[k]; });
  return out;
}
/** 时间戳清洗：不可解析或超前本机 now+5s 一律置空（与 mergeClampTimestamps 同口径，
 *  防止清洗环节把已被夹取的空值“还原”为未来时间）。 */
function normalizeTimestamp(v,nowMs){
  if(typeof v!=='string'||!v) return '';
  const t=Date.parse(v);
  const tol=typeof MERGE_FUTURE_TOLERANCE_MS==='number'?MERGE_FUTURE_TOLERANCE_MS:5000;
  const max=(Number.isFinite(nowMs)?nowMs:Date.now())+tol;
  return (!Number.isFinite(t)||t>max)?'':v;
}
function sanitizeSite(rawSite,layers){
  if(!rawSite||typeof rawSite!=='object') return null;
  const allowed=['rect',CIR,ELL,SEC,PARA,'polygon'];
  const shapeKind=rawSite.shape&&rawSite.shape.type;
  const kind=allowed.includes(rawSite.kind)?rawSite.kind:(allowed.includes(shapeKind)?shapeKind:'rect');
  const legacyW=positiveNum(rawSite.width,1000)*positiveNum(rawSite.metersPerPixel,0.1);
  const legacyH=positiveNum(rawSite.height,700)*positiveNum(rawSite.metersPerPixel,0.1);
  const shape=sanitizeShape(rawSite.shape,kind,legacyW,legacyH);
  const site=createSiteSlot(shape);
  site.id=safeId(rawSite.id||site.id,'SITE');
  site.name=String(rawSite.name||L('场地')).slice(0,40);
  site.layerId=Array.isArray(layers)&&layers.some(l=>l.id===rawSite.layerId)?rawSite.layerId:'layer.default';
  site.visible=rawSite.visible!==false;
  site.locked=!!rawSite.locked;
  site.annot=sanitizeSiteAnnot(rawSite.annot);
  site.style=sanitizeSiteStyle(rawSite.style);
  site.updatedAt=normalizeTimestamp(rawSite.updatedAt);
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
  v.zoom=Math.min(APP_LIMITS.ZOOM_MAX,Math.max(APP_LIMITS.ZOOM_MIN,positiveNum(v.zoom,1)));
  v.panX=finiteNumber(v.panX,0); v.panY=finiteNumber(v.panY,0);
  return v;
}
function finiteNumber(v,fallback){ const n=Number(v); return Number.isFinite(n)?n:fallback; }
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
  if(kind===CIR){
    const r=positiveNum(sh.r,50);
    return {type:CIR,cx:finiteNumber(sh.cx,r),cy:finiteNumber(sh.cy,r),r};
  }
  if(kind===ELL){
    const rx=positiveNum(sh.rx,NaN), ry=positiveNum(sh.ry,NaN);
    if(Number.isFinite(rx)&&Number.isFinite(ry)) return {type:ELL,cx:finiteNumber(sh.cx,rx),cy:finiteNumber(sh.cy,ry),rx,ry,angle:finiteNumber(sh.angle,0)};
    return {type:'rect',x:0,y:0,w:positiveNum(legacyW,100),h:positiveNum(legacyH,70)};
  }
  if(kind===SEC){
    const r=positiveNum(sh.r,NaN);
    if(Number.isFinite(r)){
      const a0=finiteNumber(sh.a0,0);
      const a1=finiteNumber(sh.a1,finiteNumber(sh.a0,0)+90);
      return {type:SEC,cx:finiteNumber(sh.cx,0),cy:finiteNumber(sh.cy,0),r,a0,a1};
    }
    return {type:'rect',x:0,y:0,w:positiveNum(legacyW,100),h:positiveNum(legacyH,70)};
  }
  if(kind==='polygon'){
    const pts=pointArray(sh.points);
    if(pts.length>=3) return {type:'polygon',points:pts.map(p=>[p[0],p[1]])};
    return {type:'rect',x:0,y:0,w:positiveNum(legacyW,100),h:positiveNum(legacyH,70)};
  }
  if(kind===PARA){
    return {type:PARA,x:finiteNumber(sh.x,0),y:finiteNumber(sh.y,0),
      w:positiveNum(sh.w,positiveNum(legacyW,100)),h:positiveNum(sh.h,positiveNum(legacyH,70)),
      skew:clampSkewDeg(finiteNumber(sh.skew,PARALLELOGRAM_DEFAULT_SKEW))};
  }
  if(kind==='rect') return {type:'rect',x:finiteNumber(sh.x,0),y:finiteNumber(sh.y,0),w:positiveNum(sh.w,positiveNum(legacyW,100)),h:positiveNum(sh.h,positiveNum(legacyH,70))};
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
    out.push({id,name:String(raw.name||L('图层')).slice(0,40),visible:raw.visible!==false,locked:!!raw.locked});
  });
  if(!out.some(l=>l.id==='layer.default')) out.unshift({id:'layer.default',name:L('默认图层'),visible:true,locked:false});
  return out;
}
function mergeTypes(saved){
  const map=new Map();
  deepClone(BUILTIN_TYPES).forEach(t=>map.set(t.id,t));
  (Array.isArray(saved)?saved:[]).forEach(t=>{
    if(!t||typeof t!=='object'||!['point','rect','line'].includes(t.kind)) return;
    const id=safeId(t.id,'type'), name=String(t.name||L('自定义类型')).slice(0,30);
    const color=/^#[0-9a-fA-F]{6}$/.test(t.color)?t.color:'#7c3aed';
    const savedType={id,name,kind:t.kind,color,icon:normalizeIcon(t.icon,t.kind),builtin:false};
    if(t.kind==='point'){
      const iconSize=finiteNumber(t.iconSize,NaN);
      if(iconSize>=.5&&iconSize<=5) savedType.iconSize=iconSize;
      if(['none',CIR,'square',SEC,'bar'].includes(t.scaleShape)){
        savedType.scaleShape=t.scaleShape;
        const fov=finiteNumber(t.fov,NaN);
        if(t.scaleShape===SEC&&fov>=10&&fov<=360) savedType.fov=Math.round(fov);
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
  if(raw.type===CIR){
    const r=positiveNum(raw.r,NaN);
    return Number.isFinite(r)?{type:CIR,r}:null;
  }
  if(raw.type===ELL){
    const rx=positiveNum(raw.rx,NaN), ry=positiveNum(raw.ry,NaN);
    return Number.isFinite(rx)&&Number.isFinite(ry)?{type:ELL,rx,ry}:null;
  }
  if(raw.type===SEC){
    const r=positiveNum(raw.r,NaN);
    if(!Number.isFinite(r)) return null;
    const a0=finiteNumber(raw.a0,0);
    let a1=finiteNumber(raw.a1,finiteNumber(raw.a0,0)+90);
    /* 张角钳到 (0,360] */
    let sweep=((a1-a0)%360+360)%360; if(sweep===0) sweep=360;
    return {type:SEC,r,a0,a1:a0+sweep};
  }
  if(raw.type===PARA){
    return {type:PARA,skew:clampSkewDeg(finiteNumber(raw.skew,PARALLELOGRAM_DEFAULT_SKEW))};
  }
  return null;
}
function sanitizeObjects(arr,layers,types,seenIds,seenNames,report){
  const out=[]; if(!Array.isArray(arr)) return out;
  seenIds=seenIds||new Set(); seenNames=seenNames||new Set();
  const audit=report||{duplicateIds:0,normalizedIds:0,duplicateNames:0,dropped:0};
  arr.forEach(raw=>{
    if(!raw||typeof raw!=='object'||!['point','rect','line','text','dimension'].includes(raw.kind)){ audit.dropped=(audit.dropped||0)+1; return; }
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
      createdAt:typeof raw.createdAt==='string'?raw.createdAt:nowISO(),
      /* M-04：未来/非法 updatedAt 归一为空串（LWW 视作最旧，不得借机压制对端）；
         本就没有该字段的旧对象仍按载入时间补，与历史行为一致。createdAt 不参与 LWW 不夹取 */
      updatedAt:typeof raw.updatedAt==='string'?normalizeTimestamp(raw.updatedAt):nowISO()
    });
    if(kind==='rect'){
      const s=sanitizeAreaShape(raw.shape);
      if(s){
        o.shape=s;
        if(s.type===PARA){
          /* 平行四边形的底/高仍存在 width/height（shape 只存倾角），不能清零 */
          o.width=positiveNum(raw.width,0); o.height=positiveNum(raw.height,0);
          if(o.width<=0||o.height<=0){ audit.dropped=(audit.dropped||0)+1; return; }
        }else{
          o.width=0; o.height=0;
        }
      }else{
        o.shape=null;
        o.width=positiveNum(raw.width,0); o.height=positiveNum(raw.height,0);
        if(o.width<=0||o.height<=0){ audit.dropped=(audit.dropped||0)+1; return; }
      }
    }
    if(kind==='point'){ o.iconSize=Math.min(3,Math.max(.5,finiteNumber(raw.iconSize,1))); }
    if(kind==='text'){ o.height=positiveNum(raw.height,2.2); }
    if(kind==='line'){ o.points=points; if(points.length<2||(o.closed&&points.length<3)){ audit.dropped=(audit.dropped||0)+1; return; } syncFirstPoint(o); }
    if(kind==='dimension'){
      o.points=points;
      const minPts=(o.subtype==='distance'||o.subtype==='ruler')?2:3;
      if(points.length<minPts){ audit.dropped=(audit.dropped||0)+1; return; }
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
/* 底图就绪信号：afterStateLoaded 每次重建底图都会重建一个信号，导出/切层前可 await；
   新一轮加载开始时会让上一轮等待者 resolve(false)，避免悬挂（审计 P1-6）。 */
let bgReadyPromise=Promise.resolve(true), bgReadyResolve=null;
/** 等待当前楼层底图就绪：非图片底图/已 ready 立即 true；资产缺失 false；加载中等待本轮信号。 */
function waitBackgroundReady(){
  if(!isImageBackground(state.background)) return Promise.resolve(true);
  if(bgImageState==='ready'&&bgImage) return Promise.resolve(true);
  if(bgImageState==='missing') return Promise.resolve(false);
  return bgReadyPromise;
}

async function afterStateLoaded(fit=true,opts={}){
  const seq=++bgLoadSeq;
  if(bgReadyResolve){ const r=bgReadyResolve; bgReadyResolve=null; r(false); }
  let resolveMine=null;
  bgReadyPromise=new Promise(res=>{ bgReadyResolve=res; resolveMine=res; });
  bgImage=null; bgImageState='none'; bgDataUrl='';
  try{
    if(fit) revClear();                      /* 切换/载入工程：参照版是运行时状态，随工程清空，避免跨工程残留 */
    resetTransientInteractionState(opts);   /* 草稿/拖拽/捕捉/参考线/覆盖层统一复位；校准语义见函数注释 */
    bumpZVersion();                          /* 整状态替换（载入/撤销/重做）：命中缓存失效 */
    invalidateStatic();                       /* 状态整体替换：静态层必须重建 */
    resetFrameRef();                        /* 状态整体替换后重算取景框基准，避免 pan 补偿错位 */
    const oversizePhotos=await ensureObjectPhotoAssets(state);   /* JSON 内嵌照片转存资产库（失败静默，不影响工程载入） */
    await ensureFloorBackgroundAssets(state); /* 非当前楼层的底图 dataUrl 同样转存资产库 */
    if(oversizePhotos) toast(oversizePhotos+' 张设备照片超过单张 16MB 上限，不会写入工程保存，仅当前会话可见','warn');
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
        }else{
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
  }finally{
    /* 只结算本轮自己的信号：并发加载时 bgReadyResolve 可能已被新加载替换 */
    if(resolveMine){
      resolveMine(seq===bgLoadSeq&&(!isImageBackground(state.background)||(bgImageState==='ready'&&!!bgImage)));
      if(bgReadyResolve===resolveMine) bgReadyResolve=null;
    }
  }
}
