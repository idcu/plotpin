# 开发计划索引（PLANS）

> 这里只做索引与状态，不重复计划正文。每项任务独立实施、独立本地提交；门禁不达标不提交。

## 当前计划

| 文档 | 范围 | 状态 |
|---|---|---|
| [next-phase-2026-11.md](next-phase-2026-11.md) | 2026-11 下一阶段：易学易用 / 持久性 / 扩展性 / 可维护性，D-01 ~ D-13 | 已交付（D-01 ~ D-13） |

计划内的通用门禁：`node scripts/check.mjs --selftest` 0 失败且断言数不减少；`node scripts/e2e.mjs` 不低于既有通过数；`node scripts/build.mjs --check` 通过且产物 ≤ 839,680 B；同一提交更新受影响文档与 [CHANGELOG.internal.md](../../CHANGELOG.internal.md)；禁止 push。

## 任务状态

| 编号 | 任务 | 状态 | 提交 |
|---|---|---|---|
| D-01 | 首次启动引导与示例工程 | ✅ 已交付 | `7515890` |
| D-02 | 校准/底图工具前置状态机 | ✅ 已交付 | `2c33ea6` |
| D-03 | 帮助中心三页签 | ✅ 已交付 | `057aa59` |
| D-07 | 加载完整性审计与救援导出 | ✅ 已交付 | `5fe0bcc` |
| D-08 | 保存失败可见性与有限退避 | ✅ 已交付 | `200c359` |
| D-09 | 同工程多标签编辑租约 | ✅ 已交付 | `3761fa0` |
| D-04 | 规则注册进入公共 API 与插件来源标识 | ✅ 已交付 | `0241e0f` |
| D-05 | 插件清单导入与管理面板 | ✅ 已交付 | `56adff2` |
| D-06 | 插件 API 兼容矩阵与契约演进门禁 | ✅ 已交付 | `edaa9a5` |
| D-10 | 文档入口收口：ARCHITECTURE / user-guide / plans 索引 | ✅ 已交付 | `e7e2716` |
| D-11 | i18n 覆盖率门禁与字典收敛 | ✅ 已交付 | `9c1ecd0` |
| D-12 | geometry.js 按职责拆分（行为不变） | ✅ 已交付 | `6312168` |
| D-13 | 自测分区、列表与过滤 | ✅ 已交付 | `53962ae` |

## 相关入口

- 文档导航与架构：[../ARCHITECTURE.md](../ARCHITECTURE.md)
- 用户手册：[../user-guide.md](../user-guide.md)
- 特性清单：[../features.md](../features.md)
- 门禁与契约：[../engineering.md](../engineering.md)
- 发布前人工验收（M1–M8）：[../manual-acceptance.md](../manual-acceptance.md)
