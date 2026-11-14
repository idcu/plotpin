/* merge.js —— 离线协作：工程级 Last-Writer-Wins 合并（CRDT 家族，纯函数）
 *
 * 不做网络传输：两个离线编辑的工程各导出一份 JSON，任一方「合并他人工程」即可取回对方的增删改。
 * 合并单位是对象（按 id），冲突按 updatedAt 较新者胜出；同一时间戳用内容字典序兜底，保证结果确定。
 * 删除通过墓碑（tombstones）传播：删除时间**不早于**对象更新时间即生效（平局删除胜，保证「已删除」不会被同毫秒编辑复活）；
 * 删除时间早于对象更新时间时墓碑失效并被清理，较新的编辑可以让对象「复活」。
 * 楼层按 id 合并：新增楼层追加；楼层墓碑晚于该层最后写入时整层删除。图层/对象类型按 id 取并集，
 * 本地优先；两者的墓碑直接删除对应定义（内置类型与结构兜底 layer.default 除外），
 * 被删定义的悬空引用由调用方的 migrateProject 统一迁移（本函数保持纯合并、不重复实现清洗）。
 */
/** 规则配置取非空的一侧（本地优先）；mergeNormalizeSide 会把缺失侧归一为 {}，这里不能只看真值 */
function mergeRuleSide(local, incoming){
  const a=local&&typeof local==='object'?local:null;
  const b=incoming&&typeof incoming==='object'?incoming:null;
  if(a&&Object.keys(a).length) return a;
  if(b&&Object.keys(b).length) return b;
  return {};
}
/* -------------------- 配置差异报告（A3） --------------------
 * 合并结果不变：配置类字段仍「本地优先、远端仅补缺」。本报告只回答「远端哪些配置没有被采纳」，
 * 供界面显示（此前 stats 没有配置类计数，只剩对象/楼层统计 → 配置被丢时界面显示「无变化」）。
 * 报告是 mergeProjectData 的第三个返回值，刻意不塞进 stats：§59 对 stats 做整对象深比较。
 * items 最多保留 MERGE_CONFIG_ITEM_LIMIT 条用于明细，kept/adopted 始终是精确总数。 */
const MERGE_CONFIG_ITEM_LIMIT=40;
/** B4：只拷自有键并跳过原型链危险键——导入/合并不得借 __proto__ 改写对象模型。
 *  这里不引 core 的白名单常量（common→core 依赖只允许下调）；合并结果随后仍经 buildProject 白名单清洗。 */
function assignSafe(target, src){
  if(!src||typeof src!=='object') return target;
  for(const k of Object.keys(src)){
    if(k==='__proto__'||k==='constructor'||k==='prototype') continue;
    target[k]=src[k];
  }
  return target;
}
/** 逐键比较：双侧都有且不同 → kept（本地胜）；仅远端有 → adopted；仅本地有或相同 → 不记。
 *  keys 省略时取两侧键并集；报告里的 items 只留前 N 条明细，kept/adopted 始终精确。 */
function mergeConfigKeys(a,b,scope,id,report,keys,skip){
  a=a&&typeof a==='object'?a:{}; b=b&&typeof b==='object'?b:{};
  for(const k of keys||new Set([...Object.keys(a),...Object.keys(b)])){
    if(skip&&skip.has(k)) continue;   /* 系统标记/落盘归一字段不是用户配置 */
    const inA=k in a, inB=k in b;
    if(!(inA&&inB?JSON.stringify(a[k])!==JSON.stringify(b[k]):inB)) continue;
    if(inA) report.kept++; else report.adopted++;
    if(report.items.length<MERGE_CONFIG_ITEM_LIMIT)
      report.items.push(id?{scope,id,field:k}:{scope,field:k});
  }
}
function mergeConfigReport(A,B){
  const r={kept:0,adopted:0,items:[]};
  /* 身份/时间字段不参与配置差异：createdAt 天然不同，updatedAt 已按较新者收敛 */
  mergeConfigKeys(A.meta,B.meta,'meta',null,r,
    Object.keys(Object.assign({},A.meta,B.meta)).filter(k=>!['id','projectId','createdAt','updatedAt','titleBlock'].includes(k)));
  const ta=A.meta&&A.meta.titleBlock, tb=B.meta&&B.meta.titleBlock;
  if(ta&&typeof ta==='object'&&tb&&typeof tb==='object'){
    mergeConfigKeys(ta,tb,'titleBlock',null,r,['enabled','frame','scaleBar','legend']);
    mergeConfigKeys(ta.fields,tb.fields,'titleBlock',null,r,TITLE_BLOCK_FIELDS.map(d=>d.key));
  }
  mergeConfigKeys(A.settings,B.settings,'settings',null,r,SETTINGS_KEYS);
  const ra=A.rules, rb=B.rules;
  mergeConfigKeys(ra,rb,'rules',null,r,['version','scope']);
  ['overlap','bounds'].forEach(k=>mergeConfigKeys(ra&&ra[k],rb&&rb[k],'rules',null,r,['enabled','tolerance']));
  mergeConfigKeys(ra&&ra.spacing,rb&&rb.spacing,'rules',null,r,['enabled']);
  mergeConfigKeys(ra&&ra.spacing&&ra.spacing.types,rb&&rb.spacing&&rb.spacing.types,'rules.types',null,r);
  const list=(la0,lb0,scope,skip)=>{
    const byId=arr=>new Map((Array.isArray(arr)?arr:[]).filter(x=>x&&x.id!=null).map(x=>[String(x.id),x]));
    const la=byId(la0), lb=byId(lb0);
    lb.forEach((item,id)=>{
      if(la.has(id)){ mergeConfigKeys(la.get(id),item,scope,id,r,null,skip); return; }
      r.adopted++;
      if(r.items.length<MERGE_CONFIG_ITEM_LIMIT) r.items.push({scope,id,field:'*'});
    });
  };
  list(A.layers,B.layers,'layer');
  /* builtin 是系统标记；defaultStyle 每次落盘都被持久化归一（补缺省键），不是用户可编辑配置 */
  list(A.objectTypes,B.objectTypes,'type',new Set(['builtin','defaultStyle']));
  return r;
}
/** 配置差异报告 → 界面附注（含前导「 · 」）；无差异返回空串。协作状态栏与合并提示共用同一拼装。 */
function mergeConfigText(stats){
  const c=stats&&stats.config;
  if(!c) return '';
  if(c.error) return ` · ${L('配置差异检查失败：{msg}',{msg:c.error})}`;
  return (c.kept?` · ${L('配置未采纳 {n} 项（本地优先）',{n:c.kept})}`:'')
    +(c.adopted?` · ${L('配置已补缺 {n} 项',{n:c.adopted})}`:'');
}
function mergeProjectData(currentRaw, incomingRaw){
  const A = mergeNormalizeSide(currentRaw);
  const B = mergeNormalizeSide(incomingRaw);
  const stats = { added:0, updated:0, deleted:0, conflicts:0, floorsAdded:0, floorMetaUpdated:0, floorsDeleted:0, siteDeleted:0, siteCleared:0, layersDeleted:0, typesDeleted:0 };
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
      if (fa) { stats.deleted += fa.objects.size; stats.floorsDeleted++; }
      return;
    }
    if (tomb) tombs.floor.delete(id);
    if (!fa) stats.floorsAdded++;
    const meta = mergeFloorMeta(fa, fb, stats);
    const set = mergeFloorObjects(fa, fb, tombs, stats);
    floors.set(id, {
      id, name:meta.name, updatedAt:meta.updatedAt,
      background:meta.background, site:meta.site, viewport:meta.viewport,
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
      floors.set(id, { id, name:'1F', updatedAt:'', background:null, site:null, viewport:null, objects:new Map(), order:[] });
      order.push(id);
    }
  }

  const activeFloorId = floors.has(A.activeFloorId) ? A.activeFloorId : order[0];
  const active = floors.get(activeFloorId);
  const outFloors = order.map(id => {
    const f = floors.get(id);
    const objs = mergeCloneObjects(f);
    if (id === activeFloorId) return { id, name:f.name, updatedAt:f.updatedAt || '' };
    return { id, name:f.name, updatedAt:f.updatedAt || '', background:mergeClone(f.background || {}), site:mergeClone(f.site || null), viewport:mergeClone(f.viewport || {}), objects:objs };
  });

  const meta = {};
  assignSafe(meta, mergeClone(B.meta || {}));
  assignSafe(meta, mergeClone(A.meta || {}));
  const metaTs = mergeLater(A.meta, B.meta);
  if (metaTs) meta.updatedAt = metaTs;
  const settings = {};
  assignSafe(settings, mergeClone(B.settings || {}));
  assignSafe(settings, mergeClone(A.settings || {}));
  /* MERGE-10：图层/类型墓碑直接删除定义；内置类型与 layer.default 不参与删除（结构与跨工程兜底） */
  const layers = mergePrunedList(A.layers, B.layers, tombs.layer, stats, 'layersDeleted', 'layer.default', false);
  if (!layers.length) {
    const fb = A.layers[0] || B.layers[0];
    layers.push(fb ? mergeClone(fb) : { id:'layer.default', name:'1F', visible:true, locked:false });
  }
  const objectTypes = mergePrunedList(A.objectTypes, B.objectTypes, tombs.type, stats, 'typesDeleted', '', true);
  const tombstones = Array.from(tombs.object.values()).concat(Array.from(tombs.floor.values()), Array.from(tombs.layer.values()), Array.from(tombs.type.values()))
    .sort((x, y) => {
      const kx = x.kind + ':' + x.id, ky = y.kind + ':' + y.id;
      return kx < ky ? -1 : (kx > ky ? 1 : 0);
    });

  const project = {
    schema: (currentRaw && currentRaw.schema) || (incomingRaw && incomingRaw.schema) || '',
    meta, settings,
    /* 规则配置属于工程级设置：本地侧优先，任一侧缺失时保留另一侧，避免协作合并丢配置 */
    rules: mergeClone(mergeRuleSide(A.rules, B.rules)),
    viewport: mergeClone(active.viewport || {}),
    background: mergeClone(active.background || {}),
    site: mergeClone(active.site || null),
    layers,
    objectTypes,
    objects: mergeCloneObjects(active),
    floors: outFloors,
    activeFloorId,
    tombstones
  };
  /* 配置差异报告：只统计「远端未生效/已补缺」，不改变 project；异常时不阻断合并 */
  let config;
  try{ config=mergeConfigReport(A,B); }
  catch(e){ config={kept:0,adopted:0,items:[],error:String(e&&e.message||e)}; }
  return { project, stats, config };
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
    /* 场地槽：新档显式 site；旧档未迁移时从矢量 background 推导，避免合并且丢失场地 */
    const site = useTop
      ? (raw.site !== undefined ? raw.site : mergeSiteFromBackground(raw.background))
      : (f.site !== undefined ? f.site : mergeSiteFromBackground(f.background));
    floors.set(id, {
      id,
      name: typeof f.name === 'string' ? f.name : '',
      updatedAt: typeof f.updatedAt === 'string' ? f.updatedAt : '',
      background: bg,
      site,
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
    rules: raw.rules && typeof raw.rules === 'object' ? mergeClone(raw.rules) : {},
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
const TOMBSTONE_KINDS=['object','floor','layer','type'];
function mergeTombstoneMap(raw){
  const out = { object:new Map(), floor:new Map(), layer:new Map(), type:new Map() };
  (raw && Array.isArray(raw.tombstones) ? raw.tombstones : []).forEach(t => {
    if (!t || typeof t !== 'object' || t.id === undefined || t.id === null) return;
    const kind = TOMBSTONE_KINDS.includes(t.kind) ? t.kind : 'object';
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
  const out = { object:new Map(), floor:new Map(), layer:new Map(), type:new Map() };
  [a, b].forEach(src => {
    if (!src) return;
    TOMBSTONE_KINDS.forEach(kind => {
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
    if (!f || typeof f !== 'object') return;
    stamp(f);                                  /* 楼层级 updatedAt（v2）缺失也按空串处理 */
    if (Array.isArray(f.objects)) f.objects.forEach(stamp);
  });
  return raw;
}

function mergeTime(v){ return v && typeof v.updatedAt === 'string' ? v.updatedAt : ''; }
/** B8：入站时间戳合法性校验。无法解析或晚于本机 now+5s 的视为异常，置空（LWW 中必然输给本地），
 *  防止远端 2999 年时间戳永久压制正常编辑；返回清理数量供合并日志展示。 */
const MERGE_FUTURE_TOLERANCE_MS=5000;
function mergeClampTimestamps(raw,nowMs){
  const now=Number.isFinite(nowMs)?nowMs:Date.now();
  const max=now+MERGE_FUTURE_TOLERANCE_MS;
  let clamped=0;
  const fix=o=>{
    if(!o||typeof o!=='object'||typeof o.updatedAt!=='string') return;
    const t=Date.parse(o.updatedAt);
    if(!Number.isFinite(t)||t>max){ o.updatedAt=''; clamped++; }
  };
  if(raw&&typeof raw==='object'){
    fix(raw.meta);
    /* R-02：顶层 site 是活动楼层场地的权威副本，必须与 floors[].site 一样参与夹取，
       否则远端可用未来时间戳让场地永久压制本地编辑。 */
    fix(raw.site);
    (Array.isArray(raw.objects)?raw.objects:[]).forEach(fix);
    (Array.isArray(raw.floors)?raw.floors:[]).forEach(f=>{
      if(!f||typeof f!=='object') return;
      fix(f); fix(f.site);
      (Array.isArray(f.objects)?f.objects:[]).forEach(fix);
    });
    (Array.isArray(raw.tombstones)?raw.tombstones:[]).forEach(t=>{
      if(!t||typeof t!=='object'||typeof t.deletedAt!=='string') return;
      const ts=Date.parse(t.deletedAt);
      if(!Number.isFinite(ts)||ts>max){ t.deletedAt=''; clamped++; }
    });
  }
  return clamped;
}
function mergeLater(a, b){ const x = mergeTime(a), y = mergeTime(b); return x > y ? x : y; }

/** 楼层最后写入时间：楼层自身、场地、该层全部对象 updatedAt 的最大值。
 *  场地独立编辑只写 site.updatedAt（props 面板/拖点），不写楼层 updatedAt；
 *  墓碑判定若不纳入它，会吞掉晚于墓碑的较新场地编辑（N-04）。 */
function mergeFloorWrite(fa, fb){
  let t = '';
  [fa, fb].forEach(f => {
    if (!f) return;
    if (f.updatedAt > t) t = f.updatedAt;
    if (f.site && typeof f.site.updatedAt === 'string' && f.site.updatedAt > t) t = f.site.updatedAt;
    f.order.forEach(id => { const ts = mergeTime(f.objects.get(id)); if (ts > t) t = ts; });
  });
  return t;
}

/** 旧档兼容：无 site 字段时，非图片 background 即矢量场地 */
function mergeSiteFromBackground(bg){
  if (!bg || typeof bg !== 'object') return null;
  return bg.kind && bg.kind !== 'image' && bg.kind !== 'empty' ? bg : null;
}
/** 场地 LWW 时间：优先 site.updatedAt（场地独立编辑），字段缺失（旧档）时退回楼层 updatedAt。
 *  R-02：site.updatedAt 存在但为空串/非法 = 已被时间戳夹取或清洗，视为"无效时间"，
 *  不得回退到楼层 updatedAt——否则较新的楼层时间会让被判无效的远端场地重新胜出。 */
function mergeSiteTime(f){
  if (!f) return '';
  const t = f.site && f.site.updatedAt;
  if (typeof t === 'string' && t) return t;
  if (f.site && typeof f.site.updatedAt === 'string') return '';
  return f.updatedAt;
}
/** 同名楼层元数据：名称/底图/场地按最后写入较新的一方，视口保持本地。
 *  场地 LWW 的 **null 是有效值**（显式清空）：较新一侧为 null 时必须清空，
 *  不能让 `fa.site || fb.site` 把较旧的场地复活。镜头/场地被远端清空时计入
 *  stats.siteDeleted（存在→不存在）与 stats.siteCleared（远端显式 null 胜出），
 *  供协作撤销栈与横幅判定；stats.floorMetaUpdated 仍只统计「远端覆盖本地」的元数据项。 */
function mergeFloorMeta(fa, fb, stats){
  if (!fa) return fb;
  if (!fb) return fa;
  const newer = mergeTime(fb) > mergeTime(fa);
  const ta = mergeSiteTime(fa), tb = mergeSiteTime(fb);
  const siteNewer = tb > ta || (tb === ta && !!fb.site && !fa.site);
  const nameWon = newer && !!fb.name && fb.name !== fa.name;
  const bgWon = newer && !!fb.background && mergeStable(fb.background) !== mergeStable(fa.background);
  const site = siteNewer ? fb.site : fa.site;
  const siteLost = !!(fa.site && !site);
  if (stats && (nameWon || bgWon || siteLost)) stats.floorMetaUpdated++;
  if (stats && siteLost) stats.siteDeleted++;
  if (stats && siteLost && siteNewer && !fb.site) stats.siteCleared++;
  return {
    id: fa.id,
    /* MERGE-11：空名不是有效覆盖（重建时会被归一化成 F<n>）；较新侧为空时回退旧名 */
    name: (newer && fb.name) || fa.name || fb.name || '',
    updatedAt: newer ? fb.updatedAt : fa.updatedAt,
    background: newer ? (fb.background || fa.background) : (fa.background || fb.background),
    site,
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
    /* 墓碑删掉远端对象也要计入统计（此前漏计，合并提示少报删除数） */
    if (tomb && tomb.deletedAt >= mergeTime(ob)) { stats.deleted++; return; }
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
/** MERGE-10：并集后按墓碑裁剪图层/类型；skipId 与内置类型不参与删除 */
function mergePrunedList(local, incoming, tom, stats, statsKey, skipId, protectBuiltin){
  return mergeListById(local, incoming).filter(x => {
    const id = String(x.id);
    if (!tom || !tom.get(id) || id === skipId || (protectBuiltin && x.builtin)) return true;
    stats[statsKey]++;
    return false;
  });
}
function mergeCloneObjects(f){
  return (f ? f.order : []).map((id, i) => {
    const o = mergeClone(f.objects.get(id));
    o.z = i;
    return o;
  });
}
function mergeClone(v){ return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
/** 对象内容签名：键序稳定化并忽略 z（本地叠放顺序）与 updatedAt（LWW 时间元数据），
 *  避免等价对象误判冲突或把纯时间戳差异算成内容冲突（B6） */
function mergeObjectSig(o){
  if (!o || typeof o !== 'object' || Array.isArray(o)) return mergeStable(o);
  const copy = {};
  Object.keys(o).forEach(k => { if (k !== 'z' && k !== 'updatedAt') copy[k] = o[k]; });
  return mergeStable(copy);
}
/** 内容比较用：键序稳定化，避免等价对象因键序不同被误判为冲突 */
function mergeStable(v){
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(mergeStable).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + mergeStable(v[k])).join(',') + '}';
}
