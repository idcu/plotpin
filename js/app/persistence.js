/* persistence.js —— 历史栈、IndexedDB 工程库、底图资产桥接、自动保存、迁移清洗、底图装载 */
/* -------------------- 历史 / 保存 -------------------- */
/** 当前工程与撤销/重做栈中所有仍被引用的底图与设备照片资产 ID（快照可达集合）。
 *  资产垃圾回收只能删这个集合之外的资产，否则撤销到旧背景时二进制已丢失（评估报告 5.2） */
function reachableBgAssetIds(){
  const ids=new Set();
  const addPhoto=o=>{ const pid=o&&o.props&&o.props.photoId; if(pid) ids.add(pid); };
  const add=s=>{
    if(!s) return;
    const id=s.background&&s.background.assetId; if(id) ids.add(id);
    (s.floors||[]).forEach(f=>{
      const fid=f&&f.background&&f.background.assetId; if(fid) ids.add(fid);
      (f&&f.objects||[]).forEach(addPhoto);
    });
    (s.objects||[]).forEach(addPhoto);
  };
  add(state);
  (history.past||[]).forEach(add);
  (history.future||[]).forEach(add);
  return Array.from(ids);
}
function pruneBgAssets(){ assetPrune(reachableBgAssetIds()).catch(()=>{}); }
/** 撤销/重做按钮可用态：空栈即置灰（禁用），避免点击后无反馈 */
function updateHistoryButtons(){
  const u=$('undoBtn'), r=$('redoBtn');
  if(u) u.disabled=!history.past.length;
  if(r) r.disabled=!history.future.length;
}
function pushHistory(){
  history.past.push(deepClone(state));
  if(history.past.length>20){ history.past.shift(); pruneBgAssets(); }
  history.future=[];
  updateHistoryButtons();
}
function undo(){
  if(!history.past.length) return;
  history.future.push(deepClone(state));
  state=history.past.pop();
  selectedIds.clear();
  afterStateLoaded(false); pruneBgAssets(); requestRender();
  if(typeof collabOnLocalChange==='function') collabOnLocalChange();
  toast('已撤销');
}
function redo(){
  if(!history.future.length) return;
  history.past.push(deepClone(state));
  state=history.future.pop();
  selectedIds.clear();
  afterStateLoaded(false); pruneBgAssets(); requestRender();
  if(typeof collabOnLocalChange==='function') collabOnLocalChange();
  toast('已重做');
}
function commitChange(message){
  state.meta.updatedAt=nowISO();
  state.objects.forEach((o,i)=>o.z=i);
  coverageResult=null;               /* 对象变更后覆盖率叠加层失效，需重新分析 */
  invalidateStatic();                /* 静态层（非选中对象）需要重建 */
  refreshUI(); scheduleSave(); requestRender();
  if(typeof collabOnLocalChange==='function') collabOnLocalChange();
  if(message) toast(message,'success');
}
function commitObjectEdit(){
  state.meta.updatedAt=nowISO();
  state.objects.forEach((o,i)=>o.z=i);
  coverageResult=null;
  invalidateStatic();
  renderList(); renderLayers(); renderStats(); scheduleSave(); requestRender();
  if(typeof collabOnLocalChange==='function') collabOnLocalChange();
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
    if(p&&p.schema===SCHEMA){
      out.push({key,id:key.slice(PROJECT_PREFIX.length),
        name:p.meta?.name||'未命名工程',updatedAt:p.meta?.updatedAt||'',
        objectCount:Array.isArray(p.objects)?p.objects.length:0,
        bgKind:p.background?.kind||'rect', bound:state.meta?.projectId===p.meta?.projectId});
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
/** 打开工程库中的工程：迁移、清空撤销栈（避免撤回到别的工程）、装载底图资产 */
async function openProjectById(id){
  const raw=await idbGetKey(projectKey(id));
  if(!raw||raw.schema!==SCHEMA) throw new Error('工程不存在或已损坏');
  const p=migrateProject(raw);
  state=p;
  history={past:[],future:[]};
  selectedIds.clear(); draft=null;
  const keepAsset=state.background.assetId;
  await ensureBackgroundAsset(state);
  if(keepAsset) assetPrune(reachableBgAssetIds()).catch(()=>{});
  afterStateLoaded(); scheduleSave();
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
  /* migrateProject 有写全局 state 的副作用，复制不切换现场，先存后还原 */
  const cur=state;
  const p=migrateProject(raw);
  state=cur;
  p.meta.projectId=uid('PRJ');
  p.meta.name=(p.meta.name||'未命名工程')+' 副本';
  p.meta.createdAt=nowISO(); p.meta.updatedAt=nowISO();
  await idbPutKey(projectKey(p.meta.projectId),deepClone(p));
  return p.meta.projectId;
}
async function deleteProjectById(id){
  await idbDeleteKey(projectKey(id));
  if(state.meta?.projectId===id){ state.meta.projectId=''; refreshUI(); scheduleSave(); }
  pruneBgAssets();
}

/* -------------------- 底图资产：通用内容寻址库实例（实现见 common/content-assets.js） -------------------- */
const bgAssetsReady = ContentAssets.open({ dbName: DB_NAME, storeName: DB_ASSETS, version: DB_VERSION, alsoCreate: [DB_STORE] });
function assetIdFor(bytes){ return ContentAssets.idFor(bytes, 'bg'); }
async function assetPut(id, rec){ return (await bgAssetsReady).putId(id, rec); }
async function assetGet(id){ return (await bgAssetsReady).getId(id); }
async function assetRemove(id){ return (await bgAssetsReady).removeId(id); }
async function assetPrune(keepIds){ return (await bgAssetsReady).prune(keepIds); }
const dataUrlToBytes = ContentAssets.dataUrlToBytes;
const bytesToDataUrl = ContentAssets.bytesToDataUrl;

/** 工程落盘副本：底图字节在 assets 库，dataUrl 仅运行时存在，绝不写回工程记录；
 *  当前楼层数据保留在顶层，其余楼层携带各自 background/objects（均为已清洗的可序列化结构）。 */
function persistableState(){
  syncActiveFloor();
  const copy=deepClone(state);
  if(copy.background && copy.background.dataUrl) delete copy.background.dataUrl;
  (copy.floors||[]).forEach(f=>{
    if(f.id===copy.activeFloorId){ delete f.background; delete f.objects; delete f.viewport; return; }
    if(f.background&&f.background.dataUrl) delete f.background.dataUrl;
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
  f.objects=state.objects;
  f.viewport=state.viewport;
}
/** 纯数据切换（不触达 DOM/底图加载，便于自测）：成功返回 true */
function switchFloorData(id){
  if(!Array.isArray(state.floors)||id===state.activeFloorId) return false;
  const target=state.floors.find(f=>f.id===id);
  if(!target||!target.background||!Array.isArray(target.objects)) return false;
  syncActiveFloor();
  state.background=target.background;
  state.objects=target.objects;
  state.viewport=target.viewport||state.viewport;
  state.activeFloorId=id;
  selectedIds.clear();
  coverageResult=null;
  invalidateStatic();
  resetFrameRef();
  return true;
}
/** 切换楼层（含底图加载、视图适配、面板刷新） */
async function switchFloor(id){
  if(!switchFloorData(id)) return false;
  await afterStateLoaded(false);
  fitView(); requestRender(); renderProps();
  return true;
}
/** 新增楼层：空白矢量场地；当前楼层数据先写回再创建 */
async function addFloor(name){
  syncActiveFloor();
  pushHistory();
  const n=(state.floors||[]).length+1;
  const nm=(String(name||'').trim()||('F'+n)).slice(0,40);
  const init=createInitialState();
  const id='floor_'+uid('F');
  state.floors.push({id,name:nm,background:init.background,objects:[],viewport:init.viewport});
  const ok=await switchFloor(id);
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
    state.background=target.background;
    state.objects=target.objects;
    state.viewport=target.viewport||state.viewport;
    state.activeFloorId=target.id;
    selectedIds.clear(); coverageResult=null; invalidateStatic(); resetFrameRef();
    await afterStateLoaded(false); fitView();
  }else commitChange('已删除楼层');
  return true;
}
/** 重命名楼层 */
function renameFloor(id,name){
  const f=(state.floors||[]).find(x=>x.id===id);
  const nm=String(name||'').trim().slice(0,40);
  if(!f||!nm||nm===f.name) return false;
  pushHistory(); f.name=nm; commitChange('楼层已重命名');
  return true;
}

function scheduleSave(){
  $('saveState').textContent=L('待保存…');
  clearTimeout(saveTimer);
  saveTimer=setTimeout(async()=>{
    try{
      const snapshot=persistableState();
      await idbPut(snapshot);
      /* 绑定到工程库的工程：同名键同步更新，工程库内容即最新（失败静默，不影响草稿） */
      if(state.meta.projectId) await idbPutKey(projectKey(state.meta.projectId),snapshot).catch(()=>{});
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({showLabels:state.settings.showLabels,gridSize:state.settings.gridSize,snap:state.settings.snap,markerScale:state.settings.markerScale,showCursor:state.settings.showCursor,showSegLen:state.settings.showSegLen,osnap:state.settings.osnap,showAreaTag:state.settings.showAreaTag,siteNodes:state.settings.siteNodes,siteSegLen:state.settings.siteSegLen,siteBase:state.settings.siteBase,siteRadius:state.settings.siteRadius,siteArea:state.settings.siteArea,sitePerimeter:state.settings.sitePerimeter,polar:state.settings.polar,polarStep:state.settings.polarStep,lang:state.settings.lang}));
      $('saveState').textContent=(state.meta.projectId?'📁 '+L('已保存')+' ':L('已自动保存')+' ')+new Date().toLocaleTimeString();
    }catch(e){
      try{ localStorage.setItem(LS_KEY, JSON.stringify(persistableState())); }catch(_){}
      notifyIdbFallback();
      $('saveState').textContent=L('请手动导出');
    }
  },450);
}
async function loadSavedProject(){
  let st=null;
  try{
    const p=await idbGet();
    if(p && p.schema===SCHEMA) st=migrateProject(p);
  }catch(e){ /* file:// 或浏览器限制时退回 localStorage */ }
  if(!st){
    try{
      const raw=localStorage.getItem(LS_KEY);
      if(raw){ const p=JSON.parse(raw); if(p.schema===SCHEMA) st=migrateProject(p); }
    }catch(e){}
  }
  if(st){
    state=st;
    await ensureBackgroundAsset(state);   // 旧版 dataUrl 底图迁入资产库
  }
  return st;
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
 * JSON 工程内嵌的设备照片（dataUrl）→ 内容寻址资产库，并记录 photoId。
 * 与底图同样策略：IDB 不可用时保留 dataUrl（面板仍可显示），导入不失败。
 */
async function ensureObjectPhotoAssets(st){
  for(const o of (st&&st.objects)||[]){
    const du=o&&o.props&&o.props.photoDataUrl;
    if(!du) continue;
    try{
      const bin=dataUrlToBytes(du);
      const id=assetIdFor(bin.bytes);
      await assetPut(id,{bytes:bin.bytes,mime:bin.mime||'image/jpeg'});
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
    if(!bg||!bg.dataUrl) continue;
    try{
      const bin=dataUrlToBytes(bg.dataUrl);
      bg.assetId=assetIdFor(bin.bytes);
      await assetPut(bg.assetId,{bytes:bin.bytes,mime:bin.mime});
      delete bg.dataUrl;
    }catch(_){}
  }
}
function migrateProject(p){
  const base=createInitialState();
  const meta=Object.assign(base.meta,typeof p.meta==='object'&&p.meta?p.meta:{});
  meta.name=typeof meta.name==='string'&&meta.name.trim()?meta.name:base.meta.name;
  const settings=Object.assign(base.settings,typeof p.settings==='object'&&p.settings?p.settings:{});
  settings.unit='m';
  // 注意：base.settings 已被上面的 Object.assign 就地合并，兜底值必须用字面量，不能再引用 base
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
  settings.sitePerimeter=(p.settings&&typeof p.settings.sitePerimeter==='boolean')?p.settings.sitePerimeter:settings.siteArea;
  settings.siteBase=!!settings.siteBase;
  settings.siteRadius=!!settings.siteRadius;
  settings.polar=!!settings.polar;
  settings.polarStep=[15,30,45,90].includes(Number(settings.polarStep))?Number(settings.polarStep):45;
  settings.segLabelMinPx=Math.min(APP_LIMITS.SEG_LABEL_MIN_PX_MAX,Math.max(APP_LIMITS.SEG_LABEL_MIN_PX_MIN,
    Math.round(finiteNumber(settings.segLabelMinPx,APP_LIMITS.SEG_LABEL_MIN_PX))));
  settings.lang=settings.lang==='en'?'en':'zh';
  const rawBg=typeof p.background==='object'&&p.background?p.background:{};
  const background=sanitizeBackground(rawBg);
  const viewport=sanitizeViewport(p.viewport);
  const layers=sanitizeLayers(p.layers);
  const objectTypes=mergeTypes(p.objectTypes);
  const objects=sanitizeObjects(p.objects,layers,objectTypes);
  const tombstones=sanitizeTombstones(p.tombstones);
  /* 楼层：当前楼层数据取顶层 background/objects；其余楼层各自清洗并保留 */
  const rawFloors=Array.isArray(p.floors)?p.floors.filter(f=>f&&typeof f==='object'):[];
  const floors=[]; const seenFloor=new Set();
  rawFloors.forEach((f,i)=>{
    const id=safeId(f.id||('FLOOR'+(i+1)),'FLOOR');
    if(seenFloor.has(id)) return;
    seenFloor.add(id);
    const name=(String(f.name||('F'+(i+1))).trim()||('F'+(i+1))).slice(0,40);
    const entry={id,name};
    if(f.id!==p.activeFloorId){
      entry.background=sanitizeBackground(f.background||{});
      entry.objects=sanitizeObjects(f.objects||[],layers,objectTypes);
      entry.viewport=sanitizeViewport(f.viewport);
    }
    floors.push(entry);
  });
  if(!floors.length) floors.push({id:'floor.default',name:'1F'});
  let activeFloorId=floors.some(f=>f.id===p.activeFloorId)?p.activeFloorId:floors[0].id;
  if(!floors.some(f=>f.id===activeFloorId)) floors.push({id:activeFloorId,name:'1F'});
  state=Object.assign(base,p,{meta,settings,background,viewport,layers,objectTypes,objects,floors,activeFloorId,tombstones});
  return state;
}
/** 删除墓碑清洗：按 (kind,id) 去重取最晚删除时间；非法/无时间的条目丢弃，并限制总量 */
const TOMBSTONE_LIMIT=2000;
function sanitizeTombstones(arr){
  const latest=new Map();
  (Array.isArray(arr)?arr:[]).forEach(raw=>{
    if(!raw||typeof raw!=='object'||!raw.id) return;
    const kind=raw.kind==='floor'?'floor':'object';
    const id=safeId(raw.id,'DEL');
    const deletedAt=typeof raw.deletedAt==='string'?raw.deletedAt.trim():'';
    if(!deletedAt||!Number.isFinite(Date.parse(deletedAt))) return;
    const key=kind+':'+id;
    if(!latest.has(key)||deletedAt>latest.get(key).deletedAt) latest.set(key,{id,kind,deletedAt});
  });
  return Array.from(latest.values())
    .sort((a,b)=>a.deletedAt===b.deletedAt?String(a.kind+a.id).localeCompare(String(b.kind+b.id)):b.deletedAt.localeCompare(a.deletedAt))
    .slice(0,TOMBSTONE_LIMIT);
}
/** 记录一次删除（对象或楼层）；重复删除同一目标时刷新删除时间 */
function markTombstone(id,kind='object'){
  if(!id) return null;
  state.tombstones=Array.isArray(state.tombstones)?state.tombstones:[];
  const k=kind==='floor'?'floor':'object';
  const at=nowISO();
  const hit=state.tombstones.find(t=>t&&t.id===String(id)&&(t.kind||'object')===k);
  if(hit) hit.deletedAt=at;
  else state.tombstones.push({id:String(id),deletedAt:at,kind:k});
  if(state.tombstones.length>TOMBSTONE_LIMIT){
    state.tombstones=sanitizeTombstones(state.tombstones);
  }
  return at;
}
/** 合并他人工程 JSON（离线 LWW）：读取→清洗→按 id/更新时间合并→替换现场。
 *  schema 不符或结构损坏时抛错，由调用方提示；合并无变化时不写历史栈。 */
async function mergeProjectJSON(raw,opts={}){
  if(!raw||typeof raw!=='object') throw new Error('不是有效的工程 JSON');
  if(raw.schema!==SCHEMA) throw new Error('schema 不匹配，不是本工具的工程文件');
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
  if(opts.history!==false) pushHistory();
  state=migrateProject(project);
  /* 合并不接管对方的工程库绑定：只有本地已绑定才继续绑定 */
  state.meta.projectId=(currentRaw.meta&&currentRaw.meta.projectId)||'';
  selectedIds.clear(); draft=null;
  await afterStateLoaded(false);
  scheduleSave();
  refreshUI(); requestRender();
  return stats;
}
/** 背景清洗（顶层与多楼层共用同一规则） */
function sanitizeBackground(rawBg){
  rawBg=typeof rawBg==='object'&&rawBg?rawBg:{};
  // 兼容旧档（无 kind）：有图片引用判为 image，否则按像素域推导为矩形矢量场地
  const hasImage=!!(rawBg.assetId||rawBg.dataUrl||rawBg.fileName);
  const shapeKind=rawBg.shape?.type;
  const inferred=['image','rect','circle','ellipse','sector','parallelogram','polygon'].includes(shapeKind)?shapeKind:'rect';
  const kind=['image','rect','circle','ellipse','sector','parallelogram','polygon'].includes(rawBg.kind)
    ?rawBg.kind
    :(hasImage?'image':(inferred!=='rect'?inferred:'rect'));
  const legacyW=positiveNumber(rawBg.width,1000)*positiveNumber(rawBg.metersPerPixel,0.1);
  const legacyH=positiveNumber(rawBg.height,700)*positiveNumber(rawBg.metersPerPixel,0.1);
  const base=createInitialState().background;
  return Object.assign(base,rawBg,{
    kind,
    shape:sanitizeShape(rawBg.shape,kind,legacyW,legacyH),
    width:positiveNumber(rawBg.width,1000),
    height:positiveNumber(rawBg.height,700),
    metersPerPixel:positiveNumber(rawBg.metersPerPixel,0.1),
    origin:pointArray(rawBg.origin).length?pointArray(rawBg.origin)[0]:[0,0],
    assetId:typeof rawBg.assetId==='string'?rawBg.assetId:'',
    dataUrl:typeof rawBg.dataUrl==='string'?rawBg.dataUrl:'',
    fileName:typeof rawBg.fileName==='string'?rawBg.fileName:'',
    calibrated:!!rawBg.calibrated,
    transform:validImageTransform(rawBg.transform)
  });
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
  const out=[];
  if(Array.isArray(arr)) arr.forEach(raw=>{
    if(!raw||typeof raw!=='object') return;
    out.push({id:safeId(raw.id,'layer'),name:String(raw.name||'图层').slice(0,40),visible:raw.visible!==false,locked:!!raw.locked});
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
    const savedType={id,name,kind:t.kind,color,icon:String(t.icon||(t.kind==='point'?'custom':t.kind)).slice(0,30),builtin:false};
    if(t.kind==='point'){
      const iconSize=finiteNumber(t.iconSize,NaN);
      if(iconSize>=.5&&iconSize<=5) savedType.iconSize=iconSize;
      if(['none','circle','square','sector','bar'].includes(t.scaleShape)){
        savedType.scaleShape=t.scaleShape;
        const fov=finiteNumber(t.fov,NaN);
        if(t.scaleShape==='sector'&&fov>=10&&fov<=360) savedType.fov=Math.round(fov);
      }
      /* 自定义 SVG 图元：仅保留几何路径与 viewBox（已去掉脚本/样式） */
      const paths=(Array.isArray(t.symbol)?t.symbol:[])
        .filter(p=>p&&typeof p.d==='string'&&p.d.length<=5000)
        .slice(0,200)
        .map(p=>({d:p.d,fill:!!p.fill}));
      if(paths.length){
        savedType.symbol=paths;
        const vb=t.symbolViewBox;
        if(vb&&['x','y','w','h'].every(k=>Number.isFinite(Number(vb[k])))&&Number(vb.w)>0&&Number(vb.h)>0)
          savedType.symbolViewBox={x:Number(vb.x),y:Number(vb.y),w:Number(vb.w),h:Number(vb.h)};
      }
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
function sanitizeObjects(arr,layers,types){
  const out=[]; if(!Array.isArray(arr)) return out;
  arr.forEach(raw=>{
    if(!raw||typeof raw!=='object'||!['point','rect','line','text','dimension'].includes(raw.kind)) return;
    const kind=raw.kind, layerId=layers.some(l=>l.id===String(raw.layerId))?String(raw.layerId):'layer.default';
    const hasType=typeId=>types.some(t=>t.id===typeId&&t.kind===kind);
    const typeId=hasType(String(raw.typeId))?String(raw.typeId):defaultTypeId(kind);
    const points=pointArray(raw.points);
    const x=finiteNumber(raw.x,0), y=finiteNumber(raw.y,0);
    const angle=normalizeAngle(finiteNumber(raw.angle,0));
    const o=Object.assign(baseObject(kind,typeId),{
      id:safeId(raw.id,'OBJ'), name:String(raw.name??'').slice(0,80)||nextObjectId(),
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
async function afterStateLoaded(fit=true){
  const seq=++bgLoadSeq;
  bgImage=null; bgDataUrl='';coverageResult=null; affinePairs=[];   /* 载入/撤销/重做后清空覆盖率叠加层与仿射校准草稿 */
  invalidateStatic();                       /* 状态整体替换：静态层必须重建 */
  resetFrameRef();                        /* 状态整体替换后重算取景框基准，避免 pan 补偿错位 */
  if(typeof clearGuides==='function') clearGuides();   /* 临时参考线随工程载入/撤销清空，避免坐标错位 */
  await ensureObjectPhotoAssets(state);   /* JSON 内嵌照片转存资产库（失败静默，不影响工程载入） */
  await ensureFloorBackgroundAssets(state); /* 非当前楼层的底图 dataUrl 同样转存资产库 */
  /* 旧版底图资产 */refreshUI();
  if(fit) fitView();
  requestRender();
  const bg=state.background;
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
    if(!url) return;
    bgDataUrl=url;
    const img=await loadImageSrc(url);
    if(seq===bgLoadSeq){ bgImage=img; requestRender(); }
  }catch(e){
    if(seq===bgLoadSeq) toast('底图读取失败，请重新导入底图','warn');
  }
}
