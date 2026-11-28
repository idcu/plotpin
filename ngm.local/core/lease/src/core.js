/* core.js —— @local/core-lease 的 UMD 实现（源：js/core/tab-lease.js）
 *
 * 同工程多标签编辑租约：BroadcastChannel 心跳优先，storage 事件降级。
 * 只做「同工程另一标签正在编辑」的可见提示与保存前拦截；不做实时互斥，不改合并逻辑。
 * 心跳 5s、租约 15s：对端心跳过期即视为已离开；pagehide 主动广播 release。
 *
 * 与旧实现的唯一结构差异：所有浏览器/应用依赖由 createLease(opts) 注入，
 * 常量与消息格式保持不变，js/core/tab-lease.js 负责接回旧全局名。
 */
(function (global) {
  'use strict';

  const LEASE_CHANNEL = 'plotpin:editor-lease';
  const LEASE_STORAGE_KEY = 'plotpin:editor-lease';
  const LEASE_TTL_MS = 15000;
  const LEASE_HEARTBEAT_MS = 5000;
  /* 对端时钟最多允许超前本地 5s；超出部分按本地 now 钳制，避免伪造未来心跳长期占租约（CORE-P2-17） */
  const LEASE_FUTURE_SKEW_MS = 5000;

  /**
   * @param {object} opts
   * @param {() => string} opts.projectId 当前工程 id（无工程返回空串）
   * @param {() => number} [opts.now]
   * @param {Storage} [opts.storage]
   * @param {(name: string) => any} [opts.broadcastChannel] 返回 BroadcastChannel 的工厂；不支持时传 null
   * @param {(type: string, fn: Function) => void} [opts.addEventListener]
   * @param {(fn: Function, ms: number) => any} [opts.setInterval]
   * @param {(id: any) => void} [opts.clearInterval]
   * @param {(msg: string) => void} [opts.warn]
   * @param {(active: boolean) => void} [opts.onActive]
   * @param {(info: {active: boolean, lastBeat: number, projectId: string}) => void} [opts.onChange]
   * @param {string} [opts.tabId]
   * @param {number} [opts.ttl]
   * @param {number} [opts.heartbeat]
   * @param {number} [opts.futureSkew]
   */
  function createLease(opts) {
    const o = opts || {};
    const nowFn = typeof o.now === 'function' ? o.now : () => Date.now();
    const getProjectId = typeof o.projectId === 'function' ? o.projectId : () => '';
    const storage = o.storage || null;
    const bcFactory = typeof o.broadcastChannel === 'function' ? o.broadcastChannel : null;
    const addEvent = typeof o.addEventListener === 'function' ? o.addEventListener : null;
    const setInt = typeof o.setInterval === 'function' ? o.setInterval : null;
    const clearInt = typeof o.clearInterval === 'function' ? o.clearInterval : null;
    const warn = typeof o.warn === 'function' ? o.warn : () => {};
    const onActive = typeof o.onActive === 'function' ? o.onActive : () => {};
    const channelName = o.channelName || LEASE_CHANNEL;
    const storageKey = o.storageKey || LEASE_STORAGE_KEY;
    const ttl = Number(o.ttl) > 0 ? Number(o.ttl) : LEASE_TTL_MS;
    const heartbeat = Number(o.heartbeat) > 0 ? Number(o.heartbeat) : LEASE_HEARTBEAT_MS;
    const futureSkew = Number(o.futureSkew) >= 0 ? Number(o.futureSkew) : LEASE_FUTURE_SKEW_MS;

    let mode = 'none';
    let tabId = o.tabId || '';
    let projectId = '';
    let active = false;
    let confirmed = false;
    let conflict = false;
    let lastSent = 0;
    let channel = null;
    let timer = null;
    let pagehideBound = false;
    let graceUntil = 0;
    let onChange = typeof o.onChange === 'function' ? o.onChange : null;
    const peers = new Map();

    function currentProject() {
      return String((typeof getProjectId === 'function' ? getProjectId() : '') || '');
    }

    /** 广播心跳；1.5s 内重复发送合并；flag='release' 广播释放，flag=1 附带 claim */
    function send(now, force, flag) {
      if (!active) return;
      const n = now || nowFn();
      if (!force && n - lastSent < 1500) return;
      lastSent = n;
      const msg = { type: flag === 'release' ? 'release' : 'lease', tabId: tabId, projectId: projectId, ts: n };
      if (flag === 1) msg.claim = 1;
      if (channel) {
        try { channel.postMessage(msg); } catch (_) {}
      } else if (mode === 'storage' && storage) {
        try { storage.setItem(storageKey, JSON.stringify(msg)); } catch (_) {}
      }
    }

    /** 当前工程最鲜对端心跳时刻（0=无；超过租约即失效） */
    function freshTs(now) {
      const n = now || nowFn();
      let t = 0;
      peers.forEach((p) => {
        if (p.projectId === projectId && p.tabId !== tabId && n - p.ts < ttl && p.ts > t) t = p.ts;
      });
      return t;
    }

    function conflictAt(now) {
      return !confirmed && freshTs(now) > 0;
    }

    function emit(isActive, lastBeat) {
      if (onChange) onChange({ active: isActive, lastBeat: lastBeat || 0, projectId: projectId });
    }

    /** 工程切换即清空对端快照并广播新工程，避免切换后残留旧冲突 */
    function syncProject(now) {
      const p = currentProject();
      if (p === projectId) return p;
      projectId = p;
      peers.clear();
      confirmed = false;
      if (conflict) { conflict = false; emit(false); }
      send(now, true);
      return p;
    }

    /** 冲突可见性只在此处翻转，避免横幅/状态栏各自判断 */
    function apply(now) {
      const c = conflictAt(now);
      if (c === conflict) return;
      conflict = c;
      emit(c, c ? freshTs(now) : 0);
    }

    /** 收到对端消息（BC onmessage / storage 事件 / 自测注入）：合并快照并复算冲突 */
    function ingest(msg, now) {
      const n = now || nowFn();
      /* CORE-P2-17：结构校验先行；tabId 必须是非空字符串，避免对象键/原型键混入对端表 */
      if (!msg || typeof msg !== 'object' || typeof msg.tabId !== 'string' || !msg.tabId || msg.tabId === tabId) {
        return conflictAt(n);
      }
      const peerTabId = msg.tabId.slice(0, 64);
      if (msg.type === 'release') {
        peers.delete(peerTabId);
      } else if (msg.type === 'lease') {
        const rawTs = Number(msg.ts);
        /* 对端 ts 不可信：钳制到 [now−TTL, now+5s]；非法值回落本地 now */
        const ts = Number.isFinite(rawTs)
          ? Math.min(n + futureSkew, Math.max(n - ttl, rawTs))
          : n;
        peers.set(peerTabId, { projectId: String(msg.projectId || '').slice(0, 80), ts: ts });
        if (msg.claim) confirmed = false;
        send(n);
      }
      peers.forEach((p, k) => { if (n - p.ts >= ttl) peers.delete(k); });
      apply(n);
      return conflictAt(n);
    }

    /** 确认取得本页租约：本页不再提示冲突，并向对端广播 claim */
    function claim(now) {
      const n = now || nowFn();
      confirmed = true;
      conflict = false;
      emit(false);
      send(n, true, 1);
      return true;
    }

    /** 保存前检查：仍有新鲜对端心跳时阻断自动保存（只检测，不做实时互斥） */
    function saveBlocked() {
      if (!active || confirmed) return false;
      syncProject();
      return conflictAt(nowFn()) || nowFn() < graceUntil;
    }

    function status() {
      return { confirmed: confirmed, conflict: conflict, lastBeat: freshTs(nowFn()) };
    }

    function setOnChange(fn) {
      onChange = typeof fn === 'function' ? fn : null;
    }

    function tick() {
      const n = nowFn();
      syncProject(n);
      send(n, true);
      apply(n);
    }

    function acquire() {
      if (active) return status();
      tabId = tabId || ('T' + Math.random().toString(36).slice(2, 10));
      projectId = currentProject();
      if (bcFactory) {
        try {
          channel = bcFactory(channelName);
          channel.onmessage = (e) => ingest(e && e.data, nowFn());
          mode = 'bc';
        } catch (_) {
          channel = null;
        }
      }
      if (!channel) {
        try {
          if (!storage) throw new Error('no storage');
          const old = storage.getItem(storageKey);
          if (old) ingest(JSON.parse(old), nowFn());
          if (addEvent) {
            addEvent('storage', (e) => {
              if (!e || e.key !== storageKey || !e.newValue) return;
              try { ingest(JSON.parse(e.newValue), nowFn()); } catch (_) {}
            });
          }
          mode = 'storage';
        } catch (_) {
          mode = 'none';
        }
      }
      active = true;
      onActive(true);
      if (mode === 'none') warn('无法检测多标签页，编辑仍可用');
      send(nowFn(), true);
      if (setInt) timer = setInt(tick, heartbeat);
      if (!pagehideBound && addEvent) {
        pagehideBound = true;
        addEvent('pagehide', release);
      }
      return status();
    }

    function release() {
      if (!active) return;
      send(nowFn(), true, 'release');
      if (channel) {
        try { channel.close(); } catch (_) {}
        channel = null;
      }
      if (clearInt && timer !== null && timer !== undefined) clearInt(timer);
      timer = null;
      active = false;
      onActive(false);
      peers.clear();
      confirmed = false;
      if (conflict) { conflict = false; emit(false); }
      mode = 'none';
    }

    function isActive() { return active; }

    if (addEvent) {
      addEvent('pageshow', (e) => {
        if (!e || !e.persisted) return;
        const n = nowFn();
        graceUntil = n + heartbeat + 200;
        acquire();
        syncProject(n);
        apply(n);
      });
    }

    return {
      acquire: acquire,
      release: release,
      claim: claim,
      ingest: ingest,
      conflictAt: conflictAt,
      syncProject: syncProject,
      apply: apply,
      send: send,
      freshTs: freshTs,
      emit: emit,
      saveBlocked: saveBlocked,
      status: status,
      setOnChange: setOnChange,
      tick: tick,
      isActive: isActive
    };
  }

  global.__localLease = {
    createLease: createLease,
    LEASE_CHANNEL: LEASE_CHANNEL,
    LEASE_STORAGE_KEY: LEASE_STORAGE_KEY,
    LEASE_TTL_MS: LEASE_TTL_MS,
    LEASE_HEARTBEAT_MS: LEASE_HEARTBEAT_MS,
    LEASE_FUTURE_SKEW_MS: LEASE_FUTURE_SKEW_MS
  };
})(typeof window !== 'undefined' ? window : globalThis);
