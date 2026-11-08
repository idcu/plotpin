/* snapshot.js —— 版本快照存储、A/B 差异分类与叠加态 */
/**
 * 版本快照：
 * - 独立命名空间 `snap:<projectId>:<snapshotId>`（与草稿 `current`、工程 `proj:<id>` 隔离）；
 * - 只保存可序列化工程数据（底图 assetId / 设备 photoId 引用，不复制 base64）；
 * - 每个工程按数量与字节上限淘汰最旧，删除快照不影响工程主记录。
 * 差异对比：
 * - 按对象 id 跨楼层匹配，分类固定为 新增/删除/属性修改/移动/换楼层/类型变更；
 * - 对比忽略运行时字段（id/createdAt/updatedAt/z），避免误报。
 */
const SNAPSHOT_PREFIX='snap:';
const snapshotKey=(pid,sid)=>SNAPSHOT_PREFIX+pid+':'+sid;
const snapshotIdOfKey=key=>{ const i=key.lastIndexOf(':'); return i>=0?key.slice(i+1):''; };

/** 快照数据：当前楼层写回后深拷贝；剥离照片内嵌 dataUrl，保留 photoId / 底图 assetId 引用 */
function snapshotProjectData(){
  syncActiveFloor();
  const data=persistableState();
  projectObjectLists(data).forEach(list=>{
    list.forEach(o=>{ if(o&&o.props&&o.props.photoDataUrl) delete o.props.photoDataUrl; });
  });
  return data;
}
/**
 * 快照记录（`{meta,data}`）引用的资产 id。
 * `ContentAssets.collectAssetRefs` 只认工程结构（background/objects/floors），
 * 快照把工程放在 `data` 字段，必须先解包再收集，否则资产保活会漏掉整个快照链。
 */
function snapshotAssetRefs(rec){
  return rec&&rec.data?ContentAssets.collectAssetRefs(rec.data):[];
}
function utf8Length(str){
  try{ return new TextEncoder().encode(str).length; }catch(_){ return str.length; }
}
/** 读取某工程的全部快照记录（含 data），按创建时间升序 */
async function snapshotRecords(pid){
  let keys=[];
  try{ keys=(await idbAllKeys()).filter(k=>k.startsWith(SNAPSHOT_PREFIX+pid+':')); }catch(_){ return []; }
  const recs=[];
  for(const key of keys){
    try{ const r=await idbGetKey(key); if(r&&r.meta){ r.meta.snapshotId=r.meta.snapshotId||snapshotIdOfKey(key); recs.push(r); } }catch(_){}
  }
  return recs.sort((a,b)=>String(a.meta.createdAt).localeCompare(String(b.meta.createdAt))||String(a.meta.snapshotId).localeCompare(String(b.meta.snapshotId)));
}
/** 快照摘要列表（新→旧），供 UI 展示 */
async function listSnapshots(pid){
  return (await snapshotRecords(pid)).map(r=>r.meta).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
}
async function getSnapshot(pid,sid){ return idbGetKey(snapshotKey(pid,sid)); }
/** 按数量与总字节上限淘汰最旧（至少保留最新一条） */
async function pruneSnapshots(pid){
  const recs=await snapshotRecords(pid);
  const maxCount=APP_LIMITS.SNAPSHOT_MAX_PER_PROJECT, maxBytes=APP_LIMITS.SNAPSHOT_MAX_BYTES_PER_PROJECT;
  let total=recs.reduce((s,r)=>s+(Number(r.meta.bytes)||0),0);
  while(recs.length>1&&(recs.length>maxCount||total>maxBytes)){
    const old=recs.shift();
    await idbDeleteKey(snapshotKey(pid,old.meta.snapshotId));
    total-=Number(old.meta.bytes)||0;
  }
  return recs.length;
}
/**
 * 生成当前工程快照。未绑定工程库时抛错（快照链必须有稳定的工程归属）。
 * @returns {Promise<object>} 快照摘要（含 bytes / elapsedMs）
 */
async function createSnapshot(opts={}){
  const pid=opts.projectId||state.meta.projectId;
  if(!pid) throw new Error('请先把当前图纸另存到工程库，再生成版本快照');
  if(opts.projectId&&state.meta.projectId!==opts.projectId) throw new Error('只能为当前打开的工程生成快照');
  const t0=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
  await ensureObjectPhotoAssets(state);        /* 任何内嵌照片先转为资产引用，避免快照体积膨胀 */
  const data=snapshotProjectData();
  const json=JSON.stringify(data);
  const meta={
    snapshotId:uid('SNAP'), projectId:pid, projectName:state.meta.name||'未命名工程',
    createdAt:nowISO(), label:String(opts.label||'').trim().slice(0,80)||'自动快照',
    floorId:state.activeFloorId||'', floorName:currentFloorName(),
    objectCount:countProjectObjects(data), bytes:utf8Length(json), schema:data.schema
  };
  await idbPutKey(snapshotKey(pid,meta.snapshotId),{meta,data});
  await pruneSnapshots(pid);
  meta.elapsedMs=+((typeof performance!=='undefined'&&performance.now?performance.now():Date.now())-t0).toFixed(1);
  return meta;
}
/** 删除单个快照（只删 `snap:` 键，不动工程主记录） */
async function deleteSnapshot(pid,sid){
  await idbDeleteKey(snapshotKey(pid,sid));
  return true;
}
/** 删除某工程的全部快照（删除工程时清理孤儿记录；只扫 `snap:<pid>:`，不影响其它工程） */
async function deleteSnapshotsForProject(pid){
  let keys=[];
  try{ keys=(await idbAllKeys()).filter(k=>k.startsWith(SNAPSHOT_PREFIX+pid+':')); }catch(_){ return 0; }
  for(const k of keys){ try{ await idbDeleteKey(k); }catch(_){} }
  return keys.length;
}
/**
 * 回滚到快照：先 pushHistory（Ctrl+Z 可回到回滚前现场，且 future 清空），
 * 再用 buildProject 原子替换；恢复后仍可继续编辑并自动落盘。
 */
async function restoreSnapshotById(pid,sid){
  const rec=await getSnapshot(pid,sid);
  if(!rec||!rec.data) throw new Error('快照不存在或已损坏');
  const errs=importLimitErrors({objects:countProjectObjects(rec.data)});
  if(errs.length) throw new Error('快照超出上限：'+importLimitMessage(errs));
  const next=buildProject(rec.data);
  next.meta=Object.assign({},next.meta||{},{projectId:pid,name:rec.meta.projectName||next.meta.name});
  await ensureBackgroundAsset(next);
  if(typeof ensureFloorBackgroundAssets==='function') await ensureFloorBackgroundAssets(next);
  pushHistory();                               /* 回滚前的当前状态进入撤销栈 */
  state=next; selectedIds.clear();
  await afterStateLoaded(false,{keepCalib:true});  /* 瞬态统一清理；比例尺校准点保留，仿射草稿清空 */
  markDirty('restore');                        /* 立即落盘，刷新后保持回滚结果 */
  return true;
}

/* -------------------- A/B 差异 -------------------- */
const DIFF_MOVE_KEYS=['x','y','width','height','angle','points','shape'];
const DIFF_IGNORE_KEYS=['id','z','createdAt','updatedAt','photoDataUrl'];
const DIFF_FIELD_LABELS={
  name:'名称', kind:'对象类别', typeId:'类型', layerId:'图层', visible:'可见', locked:'锁定',
  x:'X', y:'Y', width:'宽', height:'高', angle:'旋转', points:'节点', shape:'形状',
  phys:'物理尺寸', text:'文字', props:'属性', style:'样式', annot:'标注', iconSize:'图标倍率',
  closed:'闭合', subtype:'子类型', floorId:'楼层'
};
function diffFieldLabel(key){ return DIFF_FIELD_LABELS[key]||key; }
function diffValueText(v){
  if(v===undefined) return '—';
  if(v===null) return 'null';
  if(typeof v==='number') return String(Math.round(v*1000)/1000);
  if(typeof v==='string') return v.length>40?v.slice(0,40)+'…':v;
  if(typeof v==='boolean') return v?'是':'否';
  try{ const s=JSON.stringify(v); return s&&s.length>60?s.slice(0,60)+'…':String(s); }catch(_){ return String(v); }
}
function snapshotObjectIndex(p){
  const out=new Map();
  const floors=Array.isArray(p&&p.floors)?p.floors:[];
  if(!floors.length){
    (Array.isArray(p.objects)?p.objects:[]).forEach(o=>{ if(o&&o.id) out.set(o.id,{obj:o,floorId:p.activeFloorId||'floor.default',floorName:'1F'}); });
    return out;
  }
  for(const f of floors){
    const list=f.id===p.activeFloorId?(Array.isArray(p.objects)?p.objects:[]):(Array.isArray(f.objects)?f.objects:[]);
    list.forEach(o=>{ if(o&&o.id) out.set(o.id,{obj:o,floorId:f.id,floorName:f.name||f.id}); });
  }
  return out;
}
function sameJson(a,b){
  if(a===b) return true;
  if(typeof a!==typeof b||a===null||b===null) return false;
  if(typeof a!=='object') return false;
  try{ return JSON.stringify(a)===JSON.stringify(b); }catch(_){ return false; }
}
/**
 * 对比用对象副本：剥掉 props 内嵌的 photoDataUrl。
 * 照片资产化后只应保留 photoId，若内嵌 base64 参与逐字段比较会把「照片写回」误报成属性修改。
 */
function diffComparableObject(o){
  if(!o||typeof o!=='object'||!o.props||!o.props.photoDataUrl) return o;
  const props=Object.assign({},o.props); delete props.photoDataUrl;
  return Object.assign({},o,{props});
}
/** 对象差异字段（忽略运行时字段），含换楼层的 floorId */
function objectDiffFields(a,b,fa,fb){
  const changed=[];
  const ca=diffComparableObject(a), cb=diffComparableObject(b);
  const keys=new Set([].concat(Object.keys(ca||{}),Object.keys(cb||{})));
  /* 新增/删除时另一侧为 null：逐键读取必须容缺，否则对比会抛 TypeError */
  keys.forEach(k=>{ if(DIFF_IGNORE_KEYS.includes(k)) return; if(!sameJson((ca||{})[k],(cb||{})[k])) changed.push(k); });
  if(fa!==fb) changed.push('floorId');
  return changed;
}
function diffCategoryOf(a,b,fa,fb,fields){
  if(!a) return 'added';
  if(!b) return 'removed';
  if(fa!==fb) return 'floorChanged';
  if(a.kind!==b.kind||a.typeId!==b.typeId) return 'typeChanged';
  if(fields.some(k=>DIFF_MOVE_KEYS.includes(k))) return 'moved';
  return fields.length?'modified':'same';
}
/**
 * 对比两个快照的工程数据（纯函数，便于自测）。
 * @returns {{items:Array,counts:object,unchanged:number}}
 */
function diffSnapshots(a,b){
  const ia=snapshotObjectIndex(a||{}), ib=snapshotObjectIndex(b||{});
  const items=[]; let unchanged=0;
  const ids=new Set([].concat(Array.from(ia.keys()),Array.from(ib.keys())));
  ids.forEach(id=>{
    const ea=ia.get(id), eb=ib.get(id);
    const ao=ea?ea.obj:null, bo=eb?eb.obj:null;
    const fields=objectDiffFields(ao,bo,ea?ea.floorId:null,eb?eb.floorId:null);
    const category=diffCategoryOf(ao,bo,ea?ea.floorId:null,eb?eb.floorId:null,fields);
    if(category==='same'){ unchanged++; return; }
    const floorId=eb?eb.floorId:(ea?ea.floorId:''), floorName=eb?eb.floorName:(ea?ea.floorName:'');
    const floorIds=[];
    if(ea) floorIds.push(ea.floorId);
    if(eb&&!floorIds.includes(eb.floorId)) floorIds.push(eb.floorId);
    items.push({
      id, category, fields, floorId, floorName, floorIds,
      name:(bo&&bo.name)||(ao&&ao.name)||id, a:ao, b:bo,
      aFloorId:ea?ea.floorId:'', bFloorId:eb?eb.floorId:''
    });
  });
  const counts={added:0,removed:0,modified:0,moved:0,floorChanged:0,typeChanged:0};
  items.forEach(it=>{ counts[it.category]++; });
  counts.total=items.length;
  return {items,counts,unchanged};
}
/** 差异叠加态（渲染层读取；仅预览期间开启，关闭弹窗时清除） */
let diffOverlay={on:false,items:[],aId:'',bId:''};
function setDiffOverlay(on,items,ids){
  diffOverlay={on:!!on,items:on&&Array.isArray(items)?items:[],aId:ids&&ids.aId||'',bId:ids&&ids.bId||''};
  if(typeof requestRender==='function') requestRender();
}
function clearDiffOverlay(){ setDiffOverlay(false,[]); }
