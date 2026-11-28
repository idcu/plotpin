# @local/core-lease

同工程多标签编辑租约（本地 ngm 包先；后续可提升到 `@idcu/core-lease`）。

- 来源：`js/core/tab-lease.js`。
- 入口：浏览器 `src/core.js`（UMD，挂 `globalThis.__localLease`）；ESM `src/index.mjs`；CJS `src/index.cjs`。
- 适配层：`js/core/tab-lease.js`，保留 `LEASE_*` 常量、`acquireEditorLease / releaseEditorLease / leaseIngest / leaseConflictAt / leaseClaim / leaseSyncProject / leaseSaveBlocked / leaseStatus / onLeaseConflict` 与 `leaseActive`。
- 测试：`node ngm.local/core/lease/test/lease.test.mjs`。
- 依赖：零运行时依赖；`BroadcastChannel`、`localStorage`、`setInterval`、`addEventListener` 全部由调用方注入，不支持时降级为 storage 或 none。
- 行为边界：只做「同工程另一标签正在编辑」的提示与保存前拦截；不做实时互斥，不改合并逻辑；心跳 5s、租约 15s，pagehide 广播 release。
- 提升路径：在 `gitee:idcu/ngm-repo` 建 `packages/core/lease`，按 vendor 流程重锁；本仓删除 `ngm.local` 对应目录并更新适配层声明。
