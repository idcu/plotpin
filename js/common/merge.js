/* merge.js —— 离线协作：工程级 Last-Writer-Wins 合并（CRDT 家族，纯函数）
 *
 * 不做网络传输：两个离线编辑的工程各导出一份 JSON，任一方「合并他人工程」即可取回对方的增删改。
 * 合并单位是对象（按 id），冲突按 updatedAt 较新者胜出；同一时间戳用内容字典序兜底，保证结果确定。
 * 删除通过墓碑（tombstones）传播：删除时间晚于对象更新时间才生效，较新的编辑可以让对象「复活」。
 * 楼层按 id 合并：新增楼层追加；楼层墓碑晚于该层最后写入时整层删除。图层/对象类型按 id 取并集，本地优先。
 */
function mergeProjectData(currentRaw, incomingRaw){
  const A = mergeNormalizeSide(currentRaw);
  const B = mergeNormalizeSide(incomingRaw);
  const stats = { added:0, updated:0, deleted:0, conflicts:0, floorsAdded:0 };
  const tombs = mergeTombstoneMaps(A.tombstones, B.tombstones);
  const floors = new Map();
  const order = [];

  const processFloor = id => {
    const fa = A.floors.get(id) || null;
    const fb = B.floors.get(id) || null;
    if (!fa && !fb) return;
    const tomb = tombs.floor.get(id);
    const lastWrite = mergeFloorWrite(fa, fb);
    if (tomb && tomb.deletedAt >= lastWrite) {
      /* 整层删除胜过该层所有较早的编辑；只统计当前工程里确实存在的对象 */
      if (fa) stats.deleted += fa.objects.size;
      return;
    }
    if (tomb) tombs.floor.delete(id);
    if (!fa) stats.floorsAdded++;
    const meta = mergeFloorMeta(fa, fb);
    const set = mergeFloorObjects(fa, fb, tombs, stats);
    floors.set(id, {
      id, name:meta.name, updatedAt:meta.updatedAt,
      background:meta.background, viewport:meta.viewport,
      objects:set.objects, order:set.order
    });
    order.push(id);
  };
  A.order.forEach(processFloor);
  B.order.forEach(id => { if (!A.floors.has(id)) processFloor(id); });

  /* 至少保留一层：工程删除最后一层本就受 UI 约束，合并也不产出空工程 */
  if (!order.length) {
    const fallback = A.floors.get(A.activeFloorId) || A.floors.get(A.order[0]);
    if (fallback) {
      floors.set(fallback.id, fallback);
      order.push(fallback.id);
    } else {
      const id = 'floor.default';
      floors.set(id, { id, name:'1F', updatedAt:'', background:null, viewport:null, objects:new Map(), order:[] });
      order.push(id);
    }
  }

  const activeFloorId = floors.has(A.activeFloorId) ? A.activeFloorId : order[0];
  const active = floors.get(activeFloorId);
  const outFloors = order.map(id => {
    const f = floors.get(id);
    const objs = mergeCloneObjects(f);
    if (id === activeFloorId) return { id, name:f.name };
    return { id, name:f.name, background:mergeClone(f.background || {}), viewport:mergeClone(f.viewport || {}), objects:objs };
  });

  const meta = Object.assign({}, mergeClone(B.meta || {}), mergeClone(A.meta || {}));
  const metaTs = mergeLater(A.meta, B.meta);
  if (metaTs) meta.updatedAt = metaTs;
  const settings = Object.assign({}, mergeClone(B.settings || {}), mergeClone(A.settings || {}));
  const tombstones = Array.from(tombs.object.values()).concat(Array.from(tombs.floor.values()))
    .sort((x, y) => {
      const kx = x.kind + ':' + x.id, ky = y.kind + ':' + y.id;
      return kx < ky ? -1 : (kx > ky ? 1 : 0);
    });

  const project = {
    schema: (currentRaw && currentRaw.schema) || (incomingRaw && incomingRaw.schema) || '',
    meta, settings,
    viewport: mergeClone(active.viewport || {}),
    background: mergeClone(active.background || {}),
    layers: mergeListById(A.layers, B.layers),
    objectTypes: mergeListById(A.objectTypes, B.objectTypes),
    objects: mergeCloneObjects(active),
    floors: outFloors,
    activeFloorId,
    tombstones
  };
  return { project, stats };
}

/** 某一侧工程 → 统一的楼层视图；当前楼层数据取顶层 background/objects（与持久化格式一致） */
function mergeNormalizeSide(raw){
  raw = (raw && typeof raw === 'object') ? raw : {};
  const activeFloorId = typeof raw.activeFloorId === 'string' && raw.activeFloorId ? raw.activeFloorId : 'floor.default';
  const floors = new Map();
  const order = [];
  const put = (f, top) => {
    const id = f && f.id !== undefined && f.id !== null ? String(f.id) : '';
    if (!id || floors.has(id)) return;
    const useTop = !!top;
    const objs = mergeObjectMap(useTop && Array.isArray(raw.objects) ? raw.objects : (Array.isArray(f.objects) ? f.objects : []));
    const bg = useTop
      ? (raw.background && typeof raw.background === 'object' ? raw.background : null)
      : (f.background && typeof f.background === 'object' ? f.background : null);
    floors.set(id, {
      id,
      name: typeof f.name === 'string' ? f.name : '',
      updatedAt: typeof f.updatedAt === 'string' ? f.updatedAt : '',
      background: bg,
      viewport: useTop ? (raw.viewport || null) : (f.viewport || null),
      objects: objs.map,
      order: objs.order
    });
    order.push(id);
  };
  (Array.isArray(raw.floors) ? raw.floors : []).forEach(f => {
    if (f && typeof f === 'object') put(f, f.id === activeFloorId);
  });
  if (!floors.has(activeFloorId)) put({ id:activeFloorId, name:'1F' }, true);
  return {
    activeFloorId,
    meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : {},
    settings: raw.settings && typeof raw.settings === 'object' ? raw.settings : {},
    layers: mergeIdList(raw.layers),
    objectTypes: mergeIdList(raw.objectTypes),
    tombstones: mergeTombstoneMap(raw),
    floors, order
  };
}

function mergeObjectMap(arr){
  const map = new Map();
  const order = [];
  (Array.isArray(arr) ? arr : []).forEach(o => {
    if (!o || typeof o !== 'object' || o.id === undefined || o.id === null) return;
    const id = String(o.id);
    if (!id || map.has(id)) return;
    map.set(id, o);
    order.push(id);
  });
  return { map, order };
}

function mergeIdList(arr){
  const out = [];
  const seen = new Set();
  (Array.isArray(arr) ? arr : []).forEach(x => {
    if (!x || typeof x !== 'object' || x.id === undefined || x.id === null) return;
    const id = String(x.id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(x);
  });
  return out;
}

/** 原始 tombstone 数组 → 按 (kind,id) 去重、保留最晚删除时间 */
function mergeTombstoneMap(raw){
  const out = { object:new Map(), floor:new Map() };
  (raw && Array.isArray(raw.tombstones) ? raw.tombstones : []).forEach(t => {
    if (!t || typeof t !== 'object' || t.id === undefined || t.id === null) return;
    const kind = t.kind === 'floor' ? 'floor' : 'object';
    const deletedAt = typeof t.deletedAt === 'string' ? t.deletedAt.trim() : '';
    if (!deletedAt || !Number.isFinite(Date.parse(deletedAt))) return;
    const id = String(t.id);
    const cur = out[kind].get(id);
    if (!cur || deletedAt > cur.deletedAt) out[kind].set(id, { id, kind, deletedAt });
  });
  return out;
}
/** 两侧墓碑取并集，同一 (kind,id) 保留最晚删除时间 */
function mergeTombstoneMaps(a, b){
  const out = { object:new Map(), floor:new Map() };
  [a, b].forEach(src => {
    if (!src) return;
    ['object', 'floor'].forEach(kind => {
      const m = src[kind];
      if (!m || typeof m.forEach !== 'function') return;
      m.forEach((t, id) => {
        if (!t || !t.deletedAt) return;
        const cur = out[kind].get(id);
        if (!cur || t.deletedAt > cur.deletedAt) out[kind].set(id, { id, kind, deletedAt:t.deletedAt });
      });
    });
  });
  return out;
}

/** 入站工程在迁移清洗前补齐「缺失的更新时间」为 ''：
 *  migrateProject 会给缺失时间补 now，若直接合并会让旧文件凭空变成「最新」而覆盖本地编辑。
 *  这里显式写成空串，LWW 比较时自然输给任何带时间的本地版本。 */
function mergeBlankMissingTimestamps(raw){
  const stamp = o => {
    if (o && typeof o === 'object' && typeof o.updatedAt !== 'string') o.updatedAt = '';
  };
  (raw && Array.isArray(raw.objects) ? raw.objects : []).forEach(stamp);
  (raw && Array.isArray(raw.floors) ? raw.floors : []).forEach(f => {
    if (f && Array.isArray(f.objects)) f.objects.forEach(stamp);
  });
  return raw;
}

function mergeTime(v){ return v && typeof v.updatedAt === 'string' ? v.updatedAt : ''; }
function mergeLater(a, b){ const x = mergeTime(a), y = mergeTime(b); return x > y ? x : y; }

/** 楼层最后写入时间：楼层自身 updatedAt 与该层全部对象 updatedAt 的最大值 */
function mergeFloorWrite(fa, fb){
  let t = '';
  [fa, fb].forEach(f => {
    if (!f) return;
    if (f.updatedAt > t) t = f.updatedAt;
    f.order.forEach(id => { const ts = mergeTime(f.objects.get(id)); if (ts > t) t = ts; });
  });
  return t;
}

/** 同名楼层元数据：名称/底图按最后写入较新的一方，视口保持本地 */
function mergeFloorMeta(fa, fb){
  if (!fa) return fb;
  if (!fb) return fa;
  const newer = mergeTime(fb) > mergeTime(fa);
  return {
    id: fa.id,
    name: newer ? fb.name : (fa.name || fb.name),
    updatedAt: newer ? fb.updatedAt : fa.updatedAt,
    background: newer ? (fb.background || fa.background) : (fa.background || fb.background),
    viewport: fa.viewport || fb.viewport
  };
}

/** 对象集合合并：并集 + LWW；返回 {objects:Map, order:string[]}，同步累计统计与墓碑剪枝 */
function mergeFloorObjects(fa, fb, tombs, stats){
  const objects = new Map();
  const order = [];
  const add = (id, o) => { if (!objects.has(id)) { objects.set(id, o); order.push(id); } };
  const a = fa ? fa.objects : new Map();
  const b = fb ? fb.objects : new Map();

  (fa ? fa.order : []).forEach(id => {
    const oa = a.get(id);
    const ob = b.get(id);
    const tomb = tombs.object.get(id);
    if (!oa) return;
    if (!ob) {
      if (tomb && tomb.deletedAt >= mergeTime(oa)) { stats.deleted++; return; }
      if (tomb) tombs.object.delete(id);
      add(id, oa);
      return;
    }
    /* z 只是本地叠放顺序（合并不传播重排），不参与冲突判定与时间戳平局 */
    const ja = mergeObjectSig(oa), jb = mergeObjectSig(ob);
    const conflict = ja !== jb;
    if (conflict) stats.conflicts++;
    let pick = oa;
    if (conflict) {
      const ta = mergeTime(oa), tb = mergeTime(ob);
      if (tb > ta) pick = ob;
      else if (tb === ta && jb > ja) pick = ob;
      if (pick === ob) stats.updated++;
    }
    if (tomb && tomb.deletedAt >= mergeTime(pick)) { stats.deleted++; return; }
    if (tomb) tombs.object.delete(id);
    add(id, pick);
  });

  (fb ? fb.order : []).forEach(id => {
    if (a.has(id)) return;
    const ob = b.get(id);
    const tomb = tombs.object.get(id);
    if (tomb && tomb.deletedAt >= mergeTime(ob)) return;
    if (tomb) tombs.object.delete(id);
    stats.added++;
    add(id, ob);
  });
  return { objects, order };
}

function mergeListById(local, incoming){
  const out = mergeIdList(local).map(mergeClone);
  const seen = new Set(out.map(x => String(x.id)));
  mergeIdList(incoming).forEach(x => {
    const id = String(x.id);
    if (seen.has(id)) return;   /* 同 id 以本地为准，不做隐式覆盖 */
    seen.add(id);
    out.push(mergeClone(x));
  });
  return out;
}

function mergeCloneObjects(f){
  return (f ? f.order : []).map((id, i) => {
    const o = mergeClone(f.objects.get(id));
    o.z = i;
    return o;
  });
}
function mergeClone(v){ return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
/** 对象内容签名：键序稳定化并忽略 z（本地叠放顺序），避免等价对象误判冲突 */
function mergeObjectSig(o){
  if (!o || typeof o !== 'object' || Array.isArray(o)) return mergeStable(o);
  const copy = {};
  Object.keys(o).forEach(k => { if (k !== 'z') copy[k] = o[k]; });
  return mergeStable(copy);
}
/** 内容比较用：键序稳定化，避免等价对象因键序不同被误判为冲突 */
function mergeStable(v){
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(mergeStable).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + mergeStable(v[k])).join(',') + '}';
}
