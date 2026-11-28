/* tab-lease.js —— 同工程多标签编辑租约：本地 ngm 包入口（实现位于 ngm.local/core/lease） */
/* 适配层：实现已抽到 @local/core-lease（本地 ngm 包，待上游化）。
 * 本文件只负责注入浏览器/应用依赖，并保留原全局常量、函数名与 leaseActive 观测值。
 * 升级本地包时若导出名变化，check-ngm 的 localAdapters.keeps 会红。 */
const __leasePkg = globalThis.__localLease;
if (!__leasePkg) throw new Error('tab-lease.js：缺少 @local/core-lease，请检查 index.html 脚本顺序');

const {
  LEASE_CHANNEL,
  LEASE_STORAGE_KEY,
  LEASE_TTL_MS,
  LEASE_HEARTBEAT_MS,
  LEASE_FUTURE_SKEW_MS
} = __leasePkg;

let leaseActive = false;
const __lease = __leasePkg.createLease({
  projectId: () => String((state && state.meta && state.meta.projectId) || ''),
  now: () => Date.now(),
  storage: (() => {
    try { return localStorage; } catch (_) { return null; }
  })(),
  broadcastChannel: typeof BroadcastChannel === 'function'
    ? (name) => new BroadcastChannel(name) : null,
  addEventListener: (type, fn) => addEventListener(type, fn),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
  warn: (msg) => toast(L(msg), 'warn'),
  onActive: (v) => { leaseActive = v; }
});

function leaseCurProject() { return String((state && state.meta && state.meta.projectId) || ''); }
function leaseSend(now, force, flag) { return __lease.send(now, force, flag); }
function leaseFreshTs(now) { return __lease.freshTs(now); }
function leaseEmit(active, lastBeat) { return __lease.emit(active, lastBeat); }
function leaseApply(now) { return __lease.apply(now); }
function leaseIngest(msg, now) { return __lease.ingest(msg, now); }
function leaseConflictAt(now) { return __lease.conflictAt(now); }
function leaseClaim(now) {
  const r = __lease.claim(now);
  /* P0-2：claim 后补一次被租约阻断的保存；无待保存编辑时为空操作。 */
  resumeLeasePendingSave();
  return r;
}
function leaseSyncProject(now) { return __lease.syncProject(now); }
function leaseSaveBlocked() { return __lease.saveBlocked(); }
function leaseStatus() { return __lease.status(); }
function onLeaseConflict(fn) {
  const handler = typeof fn === 'function' ? fn : null;
  if (!handler) { __lease.setOnChange(null); return; }
  __lease.setOnChange((info) => {
    /* 冲突自然解除（对端离开/切工程）时也补一次保存，不只依赖 claim。 */
    if (!info.active) resumeLeasePendingSave();
    handler(info);
  });
}
function leaseTick() { return __lease.tick(); }

function acquireEditorLease() {
  const r = __lease.acquire();
  leaseActive = __lease.isActive();
  return r;
}

function releaseEditorLease() {
  __lease.release();
  leaseActive = false;
}
