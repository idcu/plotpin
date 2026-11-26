# 开发计划索引（PLANS）

> **读者**：接手的开发者与发布负责人。
> **回答**：当前计划是什么、历史任务去哪查、一次任务怎么开工/收尾、哪些事必须停下拍板。
> **不回答**：计划正文见 [next-phase-2026-11](next-phase-2026-11.md)；历史修复明细见 [known-issues-archive](../known-issues-archive.md)。
> **原则**：本目录只做索引、状态与约定，不复制正文；数字以命令与 [facts](../facts.md) 为准，不在索引里维护第二套。

## 1. 当前计划

| 文档 | 范围 | 状态 |
|---|---|---|
| [next-phase-2026-11.md](next-phase-2026-11.md) | 风险路线图 X-01～X-20：外部验证 / 冻结技术债 / 门禁文档 / 容量性能 / 协作安全 | 活跃；候选均未开工 |

N 系列（N-01～N-27，止血 4 / 纠错 17 / 提速 3 / 文档测试 3）已全部交付，不再作为执行清单；逐条结论与提交见 [known-issues-archive](../known-issues-archive.md)§3 与 `CHANGELOG.internal.md`。

## 2. 历史计划索引

### 2.1 D 系列（已交付，仅作对照）

| 编号 | 标题 | 提交 |
|---|---|---|
| D-01 | 首次启动引导与示例工程 | `7515890` |
| D-02 | 校准/底图工具前置状态机 | `2c33ea6` |
| D-03 | 帮助中心三页签 | `057aa59` |
| D-04 | 规则注册进入公共 API 与来源标识 | `0241e0f` |
| D-05 | 插件清单导入与管理面板 | `56adff2` |
| D-06 | 插件 API 兼容矩阵与契约演进门禁 | `edaa9a5` |
| D-07 | 加载完整性审计与救援导出 | `5fe0bcc` |
| D-08 | 保存失败可见性与有限退避 | `200c359` |
| D-09 | 同工程多标签编辑租约 | `3761fa0` |
| D-10 | 文档入口收口 | `e7e2716` |
| D-11 | i18n 覆盖率门禁与字典收敛 | `9c1ecd0` |
| D-12 | 几何按职责拆为三个脚本 | `6312168`（配套 `a875255`） |
| D-13 | selftest 分区注册与 `--list`/`--filter` | `53962ae` |
| D-14 | 英文界面补词并接入字典驱动 | `9cfeb04` |
| D-15 | 模板内中文纳入扫描并新增零硬编码门禁 | `4ca57b7` |

### 2.2 N 系列与 P 系列（已收口）

| 范围 | 状态 | 去哪查 |
|---|---|---|
| N-01～N-27 | 已交付（N-26 ⑤ 随 CSS-P1-1 `6cdb093` 落地） | [known-issues-archive](../known-issues-archive.md)§3 |
| P1 收口 | CSS-P1-1 `6cdb093`、CORE-P1-8 `d58af8b`、RT-P1-09 `f9a5843` | 同上 §1 |
| P2 第 1～11 批 | 已交付或已决策；IO-P2-3、IO-P2-17 仍未验证 | 同上 §3 |
| M1 polygon NaN / M2 合并配置差异 | 工作树修复，待提交 | `backup/2026-11-13-M1-polygon-nan/CHANGES.md`、`backup/2026-11-13-M2-merge-config/CHANGES.md` |

状态取值固定为：`待开始` / `进行中` / `已交付` / `阻塞（原因）` / `未验证（原因）`。已交付必须填提交哈希；更新本表与 `CHANGELOG.internal.md` 在同一个提交内完成。

## 3. 推进约定

### 3.1 指令与范围

- 执行指令：`推进 X-xx`；一次只推进一条，完成、提交、汇报后停止，不自动开始下一条。
- 任务边界以路线图正文为准；不顺手扩大范围、不重构无关文件、不读取或修改仓库根目录 `camera-*` 文件。
- 必须新增运行时依赖、破坏公共 API、放宽门禁阈值、改变既有导出字段时，先停止说明，不得自行决定。

### 3.2 开工前检查（只读）

```text
git status --porcelain
git rev-parse HEAD
git log --oneline -5
```

- 工作区必须干净（允许仅未跟踪 `audit-out/`）。存在上一轮未提交半成品时：能补全到可提交则补全，否则还原到指定提交点；禁止带脏工作区开工。
- 确认基线提交与路线图 §1 一致；不一致时先记录差异，不假设数字。

### 3.3 执行闭环

1. 读任务条目，确认证据位置仍成立；行号漂移时以当前代码为准并在汇报中注明。
2. 实现最小改动；新增逻辑先检索现有公共实现，禁止复制粘贴。
3. 补验收要求的断言/用例，逐条对应；不得用“看起来正常”替代。
4. 跑 §4 硬门禁；性能任务额外跑真实 Chromium before/after。
5. 同一提交更新受影响文档与 `CHANGELOG.internal.md`（提交哈希、改动点、实测数据、遗留风险）。
6. 本地 `git commit`；**禁止 push**。汇报提交、实测数据、未完成项与风险。

### 3.4 硬门禁（提交前全绿）

```text
node scripts/check.mjs --selftest
node scripts/e2e.mjs
node scripts/build.mjs --check
node scripts/check-gates.mjs
node scripts/check-discipline.mjs --strict
```

- selftest 断言数不得减少；e2e 通过数不得减少、跳过项不得增加；产物不得超 `scripts/lib/budget.mjs` 的上限。
- 性能任务附真实 Chromium 的 before/after P95、heapUsed 与命令；Node 桩数据不能作为浏览器结论。
- 门禁不绿不得提交；禁止为通过而删断言、加 `skip`、放宽阈值或跳过场景。
- `check.mjs` 第 9 步已拆为 9.1～9.4（状态直赋值 / 跨层耦合 / 钩子配对 / 软调用）；耦合与软调用基线是 `contracts/coupling.json`，严格相等、只减不增，新增条目须说明为何不能改用钩子或提交协议。

### 3.5 失败与未验证处理

- 发现缺陷先报告现象与证据，等确认后再修；不得静默改业务逻辑。
- 当前环境无法覆盖的项（真机、双设备 WebRTC、真实语料、人工标注）写「未实测/未验证」并说明所需条件，不得用构造样本或估算值顶替。
- 任务间存在技术依赖冲突时，先说明理由再调整顺序；需要拍板的取舍见路线图 §5。

### 3.6 提交规范

- 约定式提交：`fix(gate):` / `fix(io):` / `fix(collab):` / `perf(render):` / `test(e2e):` / `docs(plans):` 等。
- Body 必须含实测数据（断言数、e2e 数、体积、P95、heapUsed）与影响面（公共抽象/调用方）。
- 禁止 `fix bug`、`update`、`optimize` 等无信息提交；禁止水提交与多任务合并提交。

## 4. 文档与门禁分工

| 文档 | 负责 |
|---|---|
| [ARCHITECTURE](../ARCHITECTURE.md) | 分层、启动链、真实依赖方向 |
| [DATA-MODEL](../DATA-MODEL.md) | 状态、持久化、合并、迁移 |
| [modules](../modules.md) | 逐文件职责与接口 |
| [engineering](../engineering.md) | 构建、阈值、13 步门禁、禁止事项 |
| [testing](../testing.md) | 测试层次、golden、空白 |
| [release-checklist](../release-checklist.md) | 发布命令、期望、失败处理 |
| [known-issues](../known-issues.md) | 当前问题、限制、未验证 |
| [known-issues-archive](../known-issues-archive.md) | 历史修复一句话结论与编号索引 |
| 本目录 | 计划状态、推进约定、硬门禁 |
