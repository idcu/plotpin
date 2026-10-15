/* persistence.js —— 历史栈、IndexedDB 工程库、底图资产桥接、自动保存、迁移清洗、底图装载 */
/* -------------------- 历史 / 保存 -------------------- */
/** 当前工程与撤销/重做栈中所有仍被引用的底图资产 ID（快照可达集合）。
 *  底图垃圾回收只能删这个集合之外的资产，否则撤销到旧背景时二进制已丢失（评估报告 5.2） */
function reachableBgAssetIds(){
  const ids=new Set();
  const add=s=>{ const id=s&&s.background&&s.background.assetId; if(id) ids.add(id); };
  add(state);
  (history.past||[]).forEach(add);
  (history.future||[]).forEach(add);
  return Array.from(ids);
}
function pruneBgAssets(){ assetPrune(reachableBgAssetIds()).catch(()=>{}); }
function pushHistory(){
  history.past.push(deepClone(state));
  if(history.past.length>20){ history.past.shift(); pruneBgAssets(); }
  history.future=[];
}
function undo(){
  if(!history.past.length) return;
  history.future.push(deepClone(state));
  state=history.past.pop();
  selectedIds.clear();
  afterStateLoaded(false); pruneBgAssets(); requestRender(); toast('已撤销');
}
function redo(){
  if(!history.future.length) return;
  history.past.push(deepClone(state));
  state=history.future.pop();
  selectedIds.clear();
  afterStateLoaded(false); pruneBgAssets(); requestRender(); toast('已重做');
}
function commitChange(message){
  state.meta.updatedAt=nowISO();
  state.objects.forEach((o,i)=>o.z=i);
  refreshUI(); scheduleSave(); requestRender();
  if(message) toast(message,'success');
}
function commitObjectEdit(){
  state.meta.updatedAt=nowISO();
  state.objects.forEach((o,i)=>o.z=i);
  renderList(); renderLayers(); renderStats(); scheduleSave(); requestRender();
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

/* -------------------- 底图资产：通用内容寻址库实例（实现见 common/content-assets.js） -------------------- */
const bgAssetsReady = ContentAssets.open({ dbName: DB_NAME, storeName: DB_ASSETS, version: DB_VERSION, alsoCreate: [DB_STORE] });
function assetIdFor(bytes){ return ContentAssets.idFor(bytes, 'bg'); }
async function assetPut(id, rec){ return (await bgAssetsReady).putId(id, rec); }
async function assetGet(id){ return (await bgAssetsReady).getId(id); }
async function assetRemove(id){ return (await bgAssetsReady).removeId(id); }
async function assetPrune(keepIds){ return (await bgAssetsReady).prune(keepIds); }
const dataUrlToBytes = ContentAssets.dataUrlToBytes;
const bytesToDataUrl = ContentAssets.bytesToDataUrl;

/** 工程落盘副本：底图字节在 assets 库，dataUrl 仅运行时存在，绝不写回工程记录 */
function persistableState(){
  const copy=deepClone(state);
  if(copy.background && copy.background.dataUrl) delete copy.background.dataUrl;
  return copy;
}
function scheduleSave(){
  $('saveState').textContent='待保存…';
  clearTimeout(saveTimer);
  saveTimer=setTimeout(async()=>{
    try{
      await idbPut(persistableState());
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({showLabels:state.settings.showLabels,gridSize:state.settings.gridSize,snap:state.settings.snap,markerScale:state.settings.markerScale,showCursor:state.settings.showCursor,showSegLen:state.settings.showSegLen,osnap:state.settings.osnap,showAreaTag:state.settings.showAreaTag}));
      $('saveState').textContent='已自动保存 '+new Date().toLocaleTimeString();
    }catch(e){
      try{ localStorage.setItem(LS_KEY, JSON.stringify(persistableState())); }catch(_){}
      $('saveState').textContent='请手动导出';
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
  const rawBg=typeof p.background==='object'&&p.background?p.background:{};
  // 兼容旧档（无 kind）：有图片引用判为 image，否则按像素域推导为矩形矢量场地
  const hasImage=!!(rawBg.assetId||rawBg.dataUrl||rawBg.fileName);
  const shapeKind=rawBg.shape?.type;
  const inferred=['image','rect','circle','ellipse','sector','polygon'].includes(shapeKind)?shapeKind:'rect';
  const kind=['image','rect','circle','ellipse','sector','polygon'].includes(rawBg.kind)
    ?rawBg.kind
    :(hasImage?'image':(inferred!=='rect'?inferred:'rect'));
  const legacyW=positiveNumber(rawBg.width,1000)*positiveNumber(rawBg.metersPerPixel,0.1);
  const legacyH=positiveNumber(rawBg.height,700)*positiveNumber(rawBg.metersPerPixel,0.1);
  const background=Object.assign(base.background,rawBg,{
    kind,
    shape:sanitizeShape(rawBg.shape,kind,legacyW,legacyH),
    width:positiveNumber(rawBg.width,1000),
    height:positiveNumber(rawBg.height,700),
    metersPerPixel:positiveNumber(rawBg.metersPerPixel,0.1),
    origin:pointArray(rawBg.origin).length?pointArray(rawBg.origin)[0]:[0,0],
    assetId:typeof rawBg.assetId==='string'?rawBg.assetId:'',
    dataUrl:typeof rawBg.dataUrl==='string'?rawBg.dataUrl:'',
    fileName:typeof rawBg.fileName==='string'?rawBg.fileName:'',
    calibrated:!!rawBg.calibrated
  });
  const viewport=Object.assign(base.viewport,typeof p.viewport==='object'&&p.viewport?p.viewport:{});
  viewport.zoom=Math.min(200,Math.max(.02,positiveNumber(viewport.zoom,base.viewport.zoom)));
  viewport.panX=finiteNumber(viewport.panX,0); viewport.panY=finiteNumber(viewport.panY,0);
  const layers=sanitizeLayers(p.layers);
  const objectTypes=mergeTypes(p.objectTypes);
  const objects=sanitizeObjects(p.objects,layers,objectTypes);
  state=Object.assign(base,p,{meta,settings,background,viewport,layers,objectTypes,objects});
  return state;
}
function finiteNumber(v,fallback){ const n=Number(v); return Number.isFinite(n)?n:fallback; }
function positiveNumber(v,fallback){ const n=Number(v); return Number.isFinite(n)&&n>0?n:fallback; }
function safeId(v,prefix){ const s=String(v??'').replace(/[^A-Za-z0-9_.-]/g,'_'); return s||prefix+uid('ID'); }
function pointArray(v){
  return Array.isArray(v) ? v.filter(Array.isArray).map(p=>[finiteNumber(p[0],NaN),finiteNumber(p[1],NaN)])
    .filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])) : [];
}
/** 矢量场地形状清洗；image 不需要形状但仍保留一个合法默认 */
function sanitizeShape(raw,kind,legacyW,legacyH){
  const sh=raw&&typeof raw==='object'?raw:{};
  if(kind==='circle'){
    const r=positiveNumber(sh.r,50);
    return {type:'circle',cx:r,cy:r,r};
  }
  if(kind==='ellipse'){
    const rx=positiveNumber(sh.rx,NaN), ry=positiveNumber(sh.ry,NaN);
    if(Number.isFinite(rx)&&Number.isFinite(ry)) return {type:'ellipse',cx:rx,cy:ry,rx,ry,angle:finiteNumber(sh.angle,0)};
    return {type:'rect',w:positiveNum(legacyW,100),h:positiveNum(legacyH,70)};
  }
  if(kind==='sector'){
    const r=positiveNumber(sh.r,NaN);
    if(Number.isFinite(r)){
      const a0=finiteNumber(sh.a0,0);
      const a1=finiteNumber(sh.a1,finiteNumber(sh.a0,0)+90);
      return sectorShapeFrom([finiteNumber(sh.cx,0),finiteNumber(sh.cy,0)],r,a0,a1);
    }
    return {type:'rect',w:positiveNum(legacyW,100),h:positiveNum(legacyH,70)};
  }
  if(kind==='polygon'){
    const pts=pointArray(sh.points);
    if(pts.length>=3) return polygonShapeFromPoints(pts);
    return {type:'rect',w:positiveNum(legacyW,100),h:positiveNum(legacyH,70)};
  }
  if(kind==='rect') return {type:'rect',w:positiveNumber(sh.w,positiveNum(legacyW,100)),h:positiveNumber(sh.h,positiveNum(legacyH,70))};
  return {type:'rect',w:100,h:70};
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
        o.shape=s; o.width=0; o.height=0;
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
  bgImage=null; bgDataUrl='';
  refreshUI();
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
