/* @local/core-lease —— ESM 入口（读取 UMD 挂到 globalThis 的实现） */
import './core.js';

const G = globalThis.__localLease;
if (!G) throw new Error('@local/core-lease: core.js 未正确加载');

export const {
  createLease,
  LEASE_CHANNEL,
  LEASE_STORAGE_KEY,
  LEASE_TTL_MS,
  LEASE_HEARTBEAT_MS,
  LEASE_FUTURE_SKEW_MS
} = G;

export default G;
