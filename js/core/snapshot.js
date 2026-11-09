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
const SNAPSHOT_INDEX_PREFIX='snapidx:';
/* RT-P2-01：工程/快照 id 两段各自 encode，命名空间仍是 `snap:<工程>:<快照>`；
   含冒号的 id 不再与「前一段+后一段」的另一种组合撞键。普通字母数字 id 结果不变。 */
const snapshotKey=(pid,sid)=>SNAPSHOT_PREFIX+encodeURIComponent(String(pid))+':'+encodeURIComponent(String(sid));
const snapshotProjectPrefix=pid=>SNAPSHOT_PREFIX+encodeURIComponent(String(pid))+':';
const snapshotIndexKey=pid=>SNAPSHOT_INDEX_PREFIX+encodeURIComponent(String(pid));
function snapshotIdOfKey(key){
  const i=key.lastIndexOf(':'), raw=i>=0?key.slice(i+1):'';
  try{ return decodeURIComponent(raw); }catch(_){ return raw; }
}

/** 快照数据：先深拷贝实时 state，再在副本上完成照片资产化（RT-P2-03）。
 *  资产化只写副本，不会静默改动正在编辑的工程；快照仍只保留 photoId 引用。
 *  P1-4：资产化失败的对象必须保留 photoDataUrl（宁可快照变大，也不能让照片不可逆丢失），
 *  并给出可见提示；成功时 ensureObjectPhotoAssets 已自行删除 base64，无需再无条件删。 */
async function snapshotProjectData(){
  syncActiveFloor();
  const data=persistableState();
  await ensureObjectPhotoAssets(data);
  let keptPhotos=0;
  projectObjectLists(data).forEach(list=>{
    list.forEach(o=>{ if(o&&o.props&&o.props.photoDataUrl) keptPhotos++; });
  });
  if(keptPhotos) toast(keptPhotos+' 张设备照片未能存入资产库，已保留在快照中（快照体积会偏大）','warn');
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
  try{ keys=(await idbAllKeys()).filter(k=>k.startsWith(snapshotProjectPrefix(pid))); }catch(_){ return []; }
  const recs=[];
  for(const key of keys){
    try{ const r=await idbGetKey(key); if(r&&r.meta){ r.meta.snapshotId=r.meta.snapshotId||snapshotIdOfKey(key); recs.push(r); } }catch(_){}
  }
  return recs.sort((a,b)=>String(a.meta.createdAt).localeCompare(String(b.meta.createdAt))||String(a.meta.snapshotId).localeCompare(String(b.meta.snapshotId)));
}
/** 快照摘要列表（新→旧），供 UI 展示。只读元数据索引，避免为列表面板逐条反序列化 data。 */
async function listSnapshots(pid){
  return (await snapshotIndexLoad(pid)).slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
}
/**
 * 快照元数据索引 `snapidx:<pid>`：列表/淘汰只依赖 meta，不解析快照 data。
 * P2-15：索引与真实记录集合核对——缺失项或幽灵项（写一半中断）一律按记录重建，
 * 保证任何时刻中断都不会留下半索引；重建写失败只告警，列表仍按记录实时可用。
 */
async function snapshotIndexRebuild(pid){
  const metas=(await snapshotRecords(pid)).map(r=>r.meta);
  try{ await idbPutKey(snapshotIndexKey(pid),{metas}); }catch(_){ toast('快照索引写入失败，列表改为按记录实时重建','warn'); }
  return metas;
}
async function snapshotIndexLoad(pid){
  let metas=null;
  try{
    const idx=await idbGetKey(snapshotIndexKey(pid));
    if(idx&&Array.isArray(idx.metas)) metas=idx.metas;
  }catch(_){}
  let keys=[];
  try{ keys=(await idbAllKeys()).filter(k=>k.startsWith(snapshotProjectPrefix(pid))); }catch(_){ return metas||[]; }
  if(metas&&metas.length===keys.length&&metas.every(m=>keys.indexOf(snapshotKey(pid,m&&m.snapshotId))>=0)) return metas;
  return snapshotIndexRebuild(pid);
}
async function snapshotIndexSave(pid,metas){
  try{ await idbPutKey(snapshotIndexKey(pid),{metas}); }
  catch(_){ await snapshotIndexRebuild(pid); }
}
async function getSnapshot(pid,sid){ return idbGetKey(snapshotKey(pid,sid)); }
/** 按数量与总字节上限淘汰最旧（至少保留最新一条）；基于元数据索引，不读快照 data */
async function pruneSnapshots(pid){
  const metas=await snapshotIndexLoad(pid);
  const maxCount=APP_LIMITS.SNAPSHOT_MAX_PER_PROJECT, maxBytes=APP_LIMITS.SNAPSHOT_MAX_BYTES_PER_PROJECT;
  let total=metas.reduce((s,m)=>s+(Number(m.bytes)||0),0);
  let changed=false;
  while(metas.length>1&&(metas.length>maxCount||total>maxBytes)){
    const old=metas.shift();
    await idbDeleteKey(snapshotKey(pid,old.snapshotId));
    total-=Number(old.bytes)||0;
    changed=true;
  }
  if(changed) await snapshotIndexSave(pid,metas);
  return metas.length;
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
  const data=await snapshotProjectData();        /* RT-P2-03：资产化与剥离都只作用于副本 */
  const json=JSON.stringify(data);
  const meta={
    snapshotId:uid('SNAP'), projectId:pid, projectName:state.meta.name||L('未命名工程'),
    createdAt:nowISO(), label:String(opts.label||'').trim().slice(0,80)||L('自动快照'),
    floorId:state.activeFloorId||'', floorName:currentFloorName(),
    objectCount:countProjectObjects(data), bytes:utf8Length(json), schema:data.schema
  };
  const metas=await snapshotIndexLoad(pid);      /* 先取旧索引，避免把刚写入的新记录重复入索引 */
  await idbPutKey(snapshotKey(pid,meta.snapshotId),{meta,data});
  metas.push(meta);
  await snapshotIndexSave(pid,metas);
  await pruneSnapshots(pid);
  meta.elapsedMs=+((typeof performance!=='undefined'&&performance.now?performance.now():Date.now())-t0).toFixed(1);
  return meta;
}
/** 删除单个快照（只删 `snap:` 键，不动工程主记录） */
async function deleteSnapshot(pid,sid){
  await idbDeleteKey(snapshotKey(pid,sid));
  const metas=(await snapshotIndexLoad(pid)).filter(m=>m&&m.snapshotId!==sid);
  await snapshotIndexSave(pid,metas);
  return true;
}
/** 删除某工程的全部快照（删除工程时清理孤儿记录；只扫 `snap:<pid>:`，不影响其它工程） */
async function deleteSnapshotsForProject(pid){
  let keys=[];
  try{ keys=(await idbAllKeys()).filter(k=>k.startsWith(snapshotProjectPrefix(pid))); }catch(_){ return 0; }
  for(const k of keys){ try{ await idbDeleteKey(k); }catch(_){} }
  try{ await idbDeleteKey(snapshotIndexKey(pid)); }catch(_){}
  return keys.length;
}
/**
 * 回滚到快照：先 pushHistory（Ctrl+Z 可回到回滚前现场，且 future 清空），
 * 再用 buildProject 原子替换；恢复后仍可继续编辑并自动落盘。
 */
async function restoreSnapshotById(pid,sid){
  const rec=await getSnapshot(pid,sid);
  if(!rec||!rec.data) throw new Error('快照不存在或已损坏');
  /* 归属守卫：键里带 pid，但记录本身可能被移动/伪造；以 meta.projectId 为准二次校验 */
  if(rec.meta&&rec.meta.projectId&&rec.meta.projectId!==pid) throw new Error('快照不属于当前工程，已拒绝恢复');
  if(!rec.data.schema) throw new Error('快照缺少 schema 版本，已拒绝恢复');
  /* RT-P2-04：即使记录归属校验通过，也只允许恢复当前打开的工程，防止跨工程把现场换成 B 工程 */
  if(state.meta.projectId!==pid) throw new Error('只能恢复当前打开工程的快照');
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
  closed:'闭合', subtype:'子类型', floorId:'楼层',
  siteShape:'场地形状', siteName:'场地名称', background:'底图', floorName:'楼层名',
  layerName:'图层名', typeDef:'类型定义'
};
function diffFieldLabel(key){ return L(DIFF_FIELD_LABELS[key]||key); }
function diffValueText(v){
  if(v===undefined) return '—';
  if(v===null) return 'null';
  if(typeof v==='number') return String(Math.round(v*1000)/1000);
  if(typeof v==='string') return v.length>40?v.slice(0,40)+'…':v;
  if(typeof v==='boolean') return L(v?'是':'否');
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
  /* RT-P2-05：稳定序列化比较，键顺序不同但内容相同的对象不再误报差异 */
  try{ return mergeStable(a)===mergeStable(b); }catch(_){ return false; }
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
/** 楼层元数据（只取 id/name）：对象归属变化已由 floorChanged 覆盖，这里只比场景元数据 */
function snapshotFloorMetas(p){
  const floors=Array.isArray(p&&p.floors)?p.floors:[];
  return floors.map(f=>({id:String(f&&f.id||''),name:String(f&&f.name||'')}));
}
/** 图层元数据（只取 id/name）：对象换层已由对象项的 layerId 字段覆盖，这里只比图层名称 */
function snapshotLayerMetas(p){
  const layers=Array.isArray(p&&p.layers)?p.layers:[];
  return layers.map(l=>({id:String(l&&l.id||''),name:String(l&&l.name||'')}));
}
/**
 * 类型表（id → 完整定义）。任一侧不是数组（旧快照没有 objectTypes）时返回 null：
 * 缺表是快照 schema 差异，不是用户改动，整表对比会把全部内置类型误报成「新增」。
 */
function snapshotTypeDefs(p){
  const list=p&&p.objectTypes;
  if(!Array.isArray(list)) return null;
  const out=new Map();
  list.forEach(t=>{ if(t&&t.id) out.set(String(t.id),t); });
  return out;
}
/**
 * 场景级差异：场地（顶点/尺寸/名称）、底图、楼层名、图层名、类型表结构。
 * 追加在对象差异之后；单项分类沿用对象项的优先级：
 * 新增 > 删除 > 换楼层 > 类型变更 > 移动 > 属性修改（场景项无楼层/类型/移动维度，落到 新增/删除/属性修改）。
 */
function diffSceneItems(a,b,items){
  const add=(id,sceneKind,name,category,fields)=>{
    items.push({id,scope:'scene',sceneKind,category,fields,name,
      floorId:'',floorName:'',a:null,b:null,aFloorId:'',bFloorId:''});
  };
  const sa=a&&a.site, sb=b&&b.site;
  if(sa||sb){
    if(!sa||!sb) add('scene:site','site','场地',sa?'removed':'added',[]);
    else{
      const shapeSame=sameJson(sa.shape||null,sb.shape||null);
      const nameSame=(sa.name||'')===(sb.name||'');
      if(!shapeSame||!nameSame){
        add('scene:site','site','场地',shapeSame?'modified':'moved',
          [].concat(shapeSame?[]:['siteShape'],nameSame?[]:['siteName']));
      }
    }
  }
  const ba=a&&a.background, bb=b&&b.background;
  if(ba||bb){
    if(!ba||!bb) add('scene:background','background','底图',ba?'removed':'added',[]);
    else if(!sameJson(ba,bb)) add('scene:background','background','底图','modified',['background']);
  }
  const ma=new Map(snapshotFloorMetas(a).map(f=>[f.id,f]));
  const mb=new Map(snapshotFloorMetas(b).map(f=>[f.id,f]));
  new Set([].concat(Array.from(ma.keys()),Array.from(mb.keys()))).forEach(id=>{
    const x=ma.get(id), y=mb.get(id);
    if(x&&!y) add('scene:floor:'+id,'floor',x.name||id,'removed',['floorName']);
    else if(!x&&y) add('scene:floor:'+id,'floor',y.name||id,'added',['floorName']);
    else if(x&&y&&x.name!==y.name) add('scene:floor:'+id,'floor',y.name||id,'modified',['floorName']);
  });
  /* 图层名称：对象的 layerId 变化仍归对象项；这里只补「图层本体」的增删改名 */
  if(Array.isArray(a&&a.layers)&&Array.isArray(b&&b.layers)){
    const la=new Map(snapshotLayerMetas(a).map(l=>[l.id,l]));
    const lb=new Map(snapshotLayerMetas(b).map(l=>[l.id,l]));
    new Set([].concat(Array.from(la.keys()),Array.from(lb.keys()))).forEach(id=>{
      const x=la.get(id), y=lb.get(id);
      if(x&&!y) add('scene:layer:'+id,'layer',x.name||id,'removed',['layerName']);
      else if(!x&&y) add('scene:layer:'+id,'layer',y.name||id,'added',['layerName']);
      else if(x&&y&&x.name!==y.name) add('scene:layer:'+id,'layer',y.name||id,'modified',['layerName']);
    });
  }
  /* 类型表结构：新增/删除类型或类型定义变化（名称、图标、默认尺寸等）都单独成项 */
  const ta=snapshotTypeDefs(a), tb=snapshotTypeDefs(b);
  if(ta&&tb){
    new Set([].concat(Array.from(ta.keys()),Array.from(tb.keys()))).forEach(id=>{
      const x=ta.get(id), y=tb.get(id);
      if(x&&!y) add('scene:type:'+id,'type',x.name||id,'removed',['typeDef']);
      else if(!x&&y) add('scene:type:'+id,'type',y.name||id,'added',['typeDef']);
      else if(x&&y&&!sameJson(x,y)) add('scene:type:'+id,'type',y.name||id,'modified',['typeDef']);
    });
  }
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
  diffSceneItems(a||{},b||{},items);   /* 场景级项排在对象级之后 */
  const counts={added:0,removed:0,modified:0,moved:0,floorChanged:0,typeChanged:0};
  items.forEach(it=>{ counts[it.category]++; });
  counts.total=items.length;
  return {items,counts,unchanged};
}
/** 差异叠加态（渲染层读取；仅预览期间开启，关闭弹窗时清除） */
let diffOverlay={on:false,items:[],aId:'',bId:''};
/* F22：列表与画布叠加共用同一上限；差异数万时每帧只遍历前 N 条 */
const DIFF_ITEM_MAX=2000;
function setDiffOverlay(on,items,ids){
  diffOverlay={on:!!on,items:on&&Array.isArray(items)?items.slice(0,DIFF_ITEM_MAX):[],aId:ids&&ids.aId||'',bId:ids&&ids.bId||''};
  if(typeof requestRender==='function') requestRender();
}
function clearDiffOverlay(){ setDiffOverlay(false,[]); }
