/* lease.test.mjs —— @local/core-lease 的零依赖单测
 * 覆盖心跳 TTL、claim、未来时间戳钳制、非法 tabId、工程切换、release 与 onActive。
 * 运行：node ngm.local/core/lease/test/lease.test.mjs
 */
import assert from 'node:assert/strict';
import LeasePkg from '../src/index.mjs';

const { createLease, LEASE_TTL_MS, LEASE_FUTURE_SKEW_MS } = LeasePkg;
let pass = 0;
const eq = (name, actual, expected) => { assert.deepEqual(actual, expected, name); pass++; };
const ok = (name, value) => { assert.ok(value, name); pass++; };

let now = 0;
let pid = 'P1';
const warnings = [];
const activeStates = [];
const lease = createLease({
  now: () => now,
  projectId: () => pid,
  storage: null,
  broadcastChannel: null,
  addEventListener: null,
  setInterval: null,
  clearInterval: null,
  warn: (msg) => warnings.push(msg),
  onActive: (v) => activeStates.push(v)
});

eq('初始状态', lease.status(), { confirmed: false, conflict: false, lastBeat: 0 });
eq('初始未激活', lease.isActive(), false);

const st = lease.acquire();
eq('acquire 返回状态', st, { confirmed: false, conflict: false, lastBeat: 0 });
eq('acquire 后激活', lease.isActive(), true);
eq('无 BC/存储时给出提示', warnings.length, 1);
eq('onActive 记录', activeStates, [true]);

now = 1000;
eq('对端心跳产生冲突', lease.ingest({ type: 'lease', tabId: 'PEER1', projectId: 'P1', ts: 1000 }, 1000), true);
eq('TTL 内仍冲突', lease.conflictAt(1000 + LEASE_TTL_MS - 1), true);
eq('TTL 到期解除', lease.conflictAt(1000 + LEASE_TTL_MS), false);

now = 20000;
eq('claim 成功', lease.claim(20000), true);
eq('claim 后确认', lease.status().confirmed, true);
eq('claim 后不冲突', lease.status().conflict, false);
eq('claim 后保存不阻断', lease.saveBlocked(), false);

now = 30000;
eq('切换工程返回新 id', lease.syncProject(30000), 'P1');
pid = 'P2';
eq('工程切换清空对端', lease.syncProject(30000), 'P2');

now = 40000;
lease.ingest({ type: 'lease', tabId: 'PEER_FUT', projectId: 'P2', ts: 99999999 }, 40000);
eq('未来时间戳仍计入冲突', lease.conflictAt(40000), true);
eq('未来时间戳按 now+skew 钳制后过期', lease.conflictAt(40000 + LEASE_FUTURE_SKEW_MS + LEASE_TTL_MS), false);

/* 换工程清空对端表，避免上一个对端干扰后续单条消息断言 */
now = 60000;
pid = 'P3';
lease.syncProject(60000);
lease.ingest({ type: 'lease', tabId: 42, projectId: 'P3', ts: 60000 }, 60000);
eq('非字符串 tabId 被拒绝', lease.conflictAt(60000), false);

lease.ingest({ type: 'lease', tabId: 'PEER_BAD_TS', projectId: 'P3', ts: 'not-a-number' }, 60000);
eq('非法 ts 回落本地 now', lease.conflictAt(60000), true);
lease.ingest({ type: 'release', tabId: 'PEER_BAD_TS' }, 60000);
eq('release 消息清除对端', lease.conflictAt(60000), false);

lease.release();
eq('release 后未激活', lease.isActive(), false);
eq('onActive 记录释放', activeStates, [true, false]);
eq('release 后状态复位', lease.status(), { confirmed: false, conflict: false, lastBeat: 0 });

console.log(`✅ @local/core-lease：${pass} 项断言通过`);
