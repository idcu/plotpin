# PlotPin 下一阶段开发计划（2026-11）

> 范围：只读勘察 + 计划文档。本轮不改业务代码、不执行 commit/push。
> 口径：现状数字均来自本轮实际命令输出；历史性能数据标注来源；无法核实的项标「未验证」。
> 目标值（体积增量、覆盖率、耗时）是验收预算，不是实测值，完成后必须回填真实数据。

## 0. 结论摘要

- 现状：功能密度已很高（`docs/features.md` 29 个顶层特性 / 71 个子项），质量门禁全绿（selftest 2584/0、e2e 65 passed / 1 skipped、build 确定性一致、gates 5/5、discipline 13/13 L4）。下一阶段不追新功能，转向「上手成本、数据信任、扩展边界、结构可维护」。
- 方向排序：易学易用 → 持久性 → 扩展性 → 可维护性。理由见 §4。
- 任务：13 个（D-01 ~ D-13），每个任务按单会话、单原子提交设计；新增/调整的公共抽象集中在 §6。
- 体积预算：当前产物 736,298 B，上限 839,680 B，余量 103,382 B。本计划总增量预算 ≤ 65,000 B，留 ≥38,000 B 缓冲；每阶段结束用 `scripts/dist-manifest.json` 复核。

## 1. 实测基线（本轮命令输出）

| 项 | 命令 | 实测结果 |
|---|---|---|
| 仓库 | `git status --porcelain` / `git rev-parse HEAD` | 分支 `main`，HEAD `c99eac5`；工作区仅有既存未跟踪文件 `docs/manual-acceptance.md`（21,192 B），非本轮产生 |
| 逻辑自测 | `node scripts/check.mjs --selftest` | 2584 通过 / 0 失败；加载 41 个脚本（js 31 + vendor 10）；31 个脚本语法、分层、契约、插件 API 面均通过 |
| 浏览器 e2e | `node scripts/e2e.mjs` | 运行 66 个，65 passed / 1 skipped / 0 failed，59.8s；skip 为「WebRTC 离线 5 分钟真实浸泡」（需 `COLLAB_SOAK=1`） |
| Node bench | `node scripts/bench.mjs` | 退出码 0，全部场景通过；阈值未改，读数见 [performance.md](../performance.md) |
| 单文件构建 | `node scripts/build.mjs --check` | 产物 `plotpin-standalone.html` 736,298 B（719.0 KB），gzip 226,912 B（221.6 KB），SHA256 `977a7478…`；上限 839,680 B，余量 103,382 B |
| 门禁总闸 | `node scripts/check-gates.mjs` | 5/5 实际执行并通过 |
| 方法论看板 | `node scripts/check-discipline.mjs` | 13/13 项具备 → L4；最大文档 `engineering.md` 47.8 KB / 533 行 |
| i18n 扫描 | `node scripts/i18n-scan.mjs` | 30 个业务脚本；1167 条字面量，407 条进模板（348 命中 + 59 缺口），760 条硬编码；覆盖率 29.82% |
| 体积组成 | `node scripts/size-report.mjs` | JS 693,337 B（94.2%）；注释 132,765 B；缩进 47,350 B；重复字符串 31,621 B；重复代码行 23,803 B |
| 契约 | `contracts/` 目录 | 3 份 JSON；`plugin-api.json` 登记 19 个 PlotPin 键；插件能力 7 项，单次调用上限 2000 ms |
| 缺失文档 | 目录检查 | 无 `docs/ARCHITECTURE.md`、无 `docs/user-guide.md`、无 `docs/plans/`；README 33,159 B 承担用户指南 |
| 未实现路线 | 代码检索 | `js/**` 与 `index.html` 无「中继/relay/计费/billing/license」命中，C-02、C-03 均未落地 |

体量最大的业务脚本（按行数）：`geometry.js` 1309 行 / 66,934 B、`interaction.js` 1088 / 60,928、`render.js` 1073 / 56,379、`persistence.js` 1044 / 52,862、`io-export.js` 832 / 53,796、`i18n.js` 759 / 75,759、`rules.js` 703 / 32,043、`plugins.js` 686 / 35,829。

## 2. 四方向现状与证据

### 2.1 易学易用

- 首次启动无引导：`js/core/app.js:3-18` 只在 `loadSavedProject()` 成功后恢复，否则直接进入默认空画布；页面仅有一行 `hintText` 提示，无示例工程、无分步引导。
- 帮助入口偏薄：`js/core/interaction.js:974` 的 `openShortcutsHelp()` 只有 20 行快捷键表；没有「场地 / 图片底图 / 楼层 / 比例尺 / 仿射」概念解释，也没有按导出格式的检查清单。
- 校准前置条件只在点击后才提示：`js/core/interaction.js:236-249` 与 `js/features/ui-panels.js:47-49` 用 toast 拦截「无图片底图」，按钮本身不禁用、不说明原因；仿射「2 点相似 / ≥3 点完整仿射」也只在长提示文案里。
- 英文可用性受文案覆盖拖累：实测覆盖率 29.82%，760 条硬编码，英文用户会看到中文错误与面板文案。

### 2.2 扩展性

- 插件 API 面已成型但不完整：`js/features/plugins.js:34-47` 定义 `apiVersion 1.0.0`、7 项能力、2000 ms 超时；`PlotPin` 暴露 19 个键（`contracts/plugin-api.json`）。
- 规则注册已有实现却不在公共面：`js/features/rules.js:16` 的 `registerRule(def)` 未进入 `PlotPin`，契约也没有登记；插件无法稳定声明规则，规则来源也无法识别。
- 没有插件安装形态与管理界面：`js/features/plugins.js:529` 的 `loadPlugin(spec)` 只接受调用方直接传入代码；`ui-panels.js` / `index.html` 无「插件」入口，用户无法导入、查看禁用原因或卸载。
- 兼容性只靠单点判断：`checkPluginApiVersion()` 只校验 1.x 次版本，没有「1.0 插件装到 1.1 宿主」的矩阵用例；`docs/engineering.md` §5 明确「插件 API 向后兼容未设门禁」。

### 2.3 持久性

- 保存失败不可见且无重试：`js/core/persistence.js:500-517` 的 `scheduleSave()` 450 ms 防抖；失败时只尝试一次 `localStorage`、调用 `notifyIdbFallback()`、把状态文字改成「请手动导出」，不区分配额/IO/IDB 不可用，不重试。
- 工程库写入静默失败：同文件 `:507-508` 对 `proj:<id>` 的写入显式 `.catch(()=>{})`，工程库可能落后于草稿而无人知晓。
- 加载损坏会静默退化：`js/core/persistence.js:518-535` 吞掉 IDB 与 localStorage 的异常；两者都不可读时 `app.js` 以默认空工程启动，不给恢复提示，也不保留原始数据。
- 多标签同工程无冲突检测：草稿写入固定键，IDB 语义为最后写者覆盖；`js/features/collab.js` 的 `BroadcastChannel` 只服务协作通道，编辑态没有 lease/心跳或 `storage` 事件保护。
- 已有基础不错：容量估算在 `js/features/ui-panels.js:406`；快照 20 条/16 MB；资产可达集覆盖草稿/历史/剪贴板/工程库/快照。

### 2.4 可维护性

- 大文件集中：见 §1 体量表；`geometry.js` 1309 行混合场地几何、覆盖率网格、轮廓与变换。
- 文档事实漂移：`docs/testing.md` 记录 i18n 33.79%，本轮实测 29.82%（新增 C-04/C-05 文案未回填），说明文档缺少「可复算锚点」。
- 追溯文件过大：`CHANGELOG.internal.md` 214,476 B / 1390 行，无索引；`scripts/selftest.mjs` 383,395 B 单文件，2584 条断言无分区/过滤入口。
- 文档入口缺失：无 `ARCHITECTURE.md`、`user-guide.md`；README 同时承担介绍、安装、操作手册与命令参考。
- 体积仍有回收线索：重复字符串 31,621 B、重复代码行 23,803 B，但当前余量足够，暂不启动二次压缩。

## 3. 任务清单

通用验收门禁（每个任务都必须满足）：`node scripts/check.mjs --selftest` 0 失败且断言数不减少；`node scripts/e2e.mjs` 不低于 65 passed / 1 skipped；`node scripts/build.mjs --check` 通过且产物 ≤ 839,680 B；同一 commit 更新受影响文档与 `CHANGELOG.internal.md`；禁止 push。

### D-01 首次启动引导与可复现示例工程

| 项 | 内容 |
|---|---|
| 现状与证据 | `app.js:3-18` 无首次引导；页面仅 `hintText`；仓库无示例工程生成器（检索 `demo`/`sample` 无业务命中） |
| 目标与验收 | 首次访问显示 3 步引导（底图/场地 → 放置对象 → 导出）；提供「打开示例工程 / 空白开始」；选择结果写入 `localStorage`，刷新后不再弹。示例含 100×70 m 矩形场地 + 6 个对象（点×2、矩形×1、折线×1、文字×1、尺寸×1），无需图片资产。e2e 新增 2 例：首次显示且可关闭、示例对象数与场地可导出；产物增量 ≤ 8,000 B |
| 技术方案 | 在 `persistence.js` 增加纯函数 `buildDemoProject()`（复用 `buildProject`、`baseObject`，不新增脚本）；`ui-shell.js` 用现有 modal 渲染引导卡；`app.js` 读取引导标记并决定是否展示 |
| 影响面 | 新增 `buildDemoProject()`、`firstRunGuideState()`；调用方 `app.js`、`ui-shell.js`、selftest/e2e。不改既有 API 与默认空工程行为 |
| 依赖与并行 | 无依赖；与 D-02 可并行（文件不重叠）；与 D-03 共享 `ui-shell.js`，需串行 |
| 预估工作量 | 1 个会话；改动约 4 文件、+250 行 |
| 风险与降级 | 新文案进入 i18n 字典会增大产物；若超预算，引导文案复用现有句柄。示例对象类型不存在时降级为空白工程 + 明确 toast |
| 公共抽象 | 新增 `buildDemoProject()`（示例唯一源，e2e/selftest 复用）；新增 `firstRunGuideState()` |

### D-02 校准/底图工具的前置状态机

| 项 | 内容 |
|---|---|
| 现状与证据 | `interaction.js:236-249`、`ui-panels.js:47-49` 均为点击后 toast；按钮不禁用，无原因说明；仿射 2 点/≥3 点差异只在 `interaction.js:20` 长文案 |
| 目标与验收 | 按 `background.kind`、`bgImage`、场地是否存在、工具模式生成状态矩阵：不可用按钮 `disabled` 且带 `aria-describedby` 原因；可用时显示步骤指示（比例尺 1/2；仿射 1/2/≥3）。e2e 覆盖：无底图时比例尺/仿射/图片变换禁用且无可点击路径；有场地无图片时提示「场地按米绘制，无需校准」；8 种导出 golden 字节不变 |
| 技术方案 | 在 `interaction.js` 增加 `calibPrecheck(tool)` 返回 `{ok, reason, step}`；`ui-panels.js` 与属性面板统一消费；复用 `isImageBackground()` 与现有 i18n 模板 |
| 影响面 | 新增 `calibPrecheck()`；调用方 `ui-panels.js`、`props.js`、工具栏状态刷新、selftest。不改校准算法与输出 |
| 依赖与并行 | 无依赖；与 D-01 并行；与 D-03 共用 `interaction.js`，需串行 |
| 预估工作量 | 1 个会话；约 3 文件、+180 行、+5,000 B |
| 风险与降级 | 禁用按钮可能挡住「先点按钮再导入底图」的旧习惯；降级为按钮可点但显示原因徽标，并保留原 toast |
| 公共抽象 | 新增 `calibPrecheck(tool)`（UI 与测试的唯一判断源） |

### D-03 帮助中心：快捷键 + 概念词典 + 导出检查清单

| 项 | 内容 |
|---|---|
| 现状与证据 | `interaction.js:974` 的 `openShortcutsHelp()` 仅 20 行快捷键；README 表格未进应用；无「场地/图片/楼层/校准」概念解释 |
| 目标与验收 | `?` 打开三页签：快捷键（保留 20 行）、概念词典（6 条：图片底图、矢量场地、楼层、比例尺、仿射、覆盖率口径）、导出检查清单（8 种格式，标注 PDF 位图页、DXF 场地 SITE 层、CSV/TSV/XLSX 公式防护）。e2e：`?` 打开、页签切换、Esc 关闭后焦点回到画布；新增文案 i18n 100% 入字典；增量 ≤ 6,000 B |
| 技术方案 | 扩展现有 modal；内容常量集中在 `ui-shell.js`/`interaction.js`，复用 `modalBody` 与 `L()` 模板；不新增脚本 |
| 影响面 | 仅扩展 `openShortcutsHelp()`；无公共 API 变更 |
| 依赖与并行 | 依赖 D-01 的 modal 样式；与 D-02 串行（同文件） |
| 预估工作量 | 1 个会话；约 2 文件、+200 行 |
| 风险与降级 | 文案增长快；若超预算，概念词典压缩为 4 条、导出清单只保留差异项 |
| 公共抽象 | 无新增；复用现有 modal 与 i18n |

### D-04 规则注册进入公共 API 与插件来源标识

| 项 | 内容 |
|---|---|
| 现状与证据 | `rules.js:16` 已有 `registerRule(def)`，`rules.js:39` 有 `listRules()`；`plugins.js:607` 的 `PlotPin` 未暴露规则；`contracts/plugin-api.json` 仅 19 键；7 项能力无 `rules` |
| 目标与验收 | 新增能力 `rules` 与 `PlotPin.registerRule / unregisterRule / listRules`（契约 19 → 22 键）；`apiVersion` 升到 1.1.0，1.0 插件仍可加载；规则列表显示来源「插件: <id>」；e2e：示例插件注册规则 → 出现在规则页签 → 检查产出违规 → 卸载后规则消失；8 种导出 golden 不变 |
| 技术方案 | `registerRule(def, owner)` 增加可选第二参（向后兼容）；规则定义统一走现有 `normalizeRuleDef`；插件侧只允许受信任同源路径调用（沙箱 Worker 不能直接注册规则，原因写入能力说明） |
| 影响面 | `PlotPin` 新增 3 键；`registerRule` 增加可选参数；调用方 `rules.js`、`plugins.js`、`check-plugin-api.mjs`、规则 UI。既有调用签名不变 |
| 依赖与并行 | 与 D-05/D-06 共用 `plugins.js`/契约，需串行；与持久性任务可并行 |
| 预估工作量 | 1–2 个会话；约 5 文件、+300 行、+6,000 B |
| 风险与降级 | 暴露主线程规则会削弱沙箱边界；降级为「仅 legacy 受信任路径」并在契约与文档显著标注，沙箱不承诺规则能力（延续 K9） |
| 公共抽象 | 调整 `registerRule(def, owner?)`；新增 `PLUGIN_CAPABILITIES['rules']`；契约新增 3 键 |

### D-05 插件清单导入与管理面板（会话内）

| 项 | 内容 |
|---|---|
| 现状与证据 | `plugins.js:529` 只接受代码串；`ui-panels.js`/`index.html` 无「插件」入口；无清单 schema 与体积/字段校验 |
| 目标与验收 | 设置区新增插件面板：列表（id、版本、能力、状态、禁用原因）、导入 `.json` 清单、卸载。清单 `plotpin.plugin/v1` 必填 `id/name/version/apiVersion/capabilities/code`；`code` ≤ 64 KB、清单 ≤ 192 KB；校验失败事务化（不注册、不改现有插件）。导入前展示能力确认。e2e：合法清单导入后导出器可用；缺字段/超限/恶意清单被拒且原状态不变；卸载后注册项消失；增量 ≤ 8,000 B |
| 技术方案 | `plugins.js` 增加 `validatePluginManifest(raw)` 纯函数，复用 `checkPluginApiVersion`；UI 复用现有文件选择与 modal；本轮不持久化插件代码，刷新需重新导入（在面板说明） |
| 影响面 | 新增 `validatePluginManifest()`；`loadPlugin(spec)` 签名不变；调用方 插件面板、selftest。无存储 schema 变更 |
| 依赖与并行 | 依赖 D-04（能力集合与 API 版本）；与 D-06 串行（同文件/契约） |
| 预估工作量 | 1 个会话；约 4 文件、+350 行、+8,000 B |
| 风险与降级 | 不持久化会被认为「装了又没装」；降级为仅会话内，并在面板显著提示；持久化留待后续独立任务（需安全评审） |
| 公共抽象 | 新增 `validatePluginManifest(raw)`（UI 与测试共用） |

### D-06 插件 API 兼容矩阵与契约演进门禁

| 项 | 内容 |
|---|---|
| 现状与证据 | `plugins.js:34-47` 版本 1.0.0/次版本比较；`check-plugin-api.mjs` 只比对键集合；`docs/engineering.md` §5 明确向后兼容未设门禁 |
| 目标与验收 | `checkPluginApiVersion` 返回 `{ok, reason, major, minor}`；矩阵用例固化：1.0 插件装 1.1 宿主通过、1.2 拒绝、2.0 拒绝、缺失/畸形拒绝且给原因、未知能力保留并降级。selftest 新增 6 例、e2e 新增 3 例；契约与文档同步 1.1.0 演进说明；增量 ≤ 3,000 B |
| 技术方案 | 只在 `check-plugin-api.mjs` 与 `plugins.js` 扩展现有函数，不新增抽象层；未知能力只警告不拒绝，避免破坏旧插件 |
| 影响面 | `checkPluginApiVersion` 返回值增加字段（旧调用只读 `ok/reason`，兼容）；调用方 `plugins.js`、selftest、e2e |
| 依赖与并行 | 依赖 D-04 的 1.1.0 版本；与 D-05 串行 |
| 预估工作量 | 1 个会话；约 4 文件、+150 行 |
| 风险与降级 | 矩阵用例过度绑定实现细节；降级为只守「主版本 + 次版本 + 能力集合」三条不变量 |
| 公共抽象 | 扩展 `checkPluginApiVersion` 返回结构；无新键 |

### D-07 加载完整性审计与救援导出

| 项 | 内容 |
|---|---|
| 现状与证据 | `persistence.js:518-535` 吞掉 IDB 与 localStorage 异常；两者损坏时 `app.js` 静默进入空工程，无提示、无原始数据保留 |
| 目标与验收 | 新增 `auditProject(raw)` 纯函数：校验 schema 可读、`floors` 非空、`activeFloorId` 存在、对象 id 唯一、图层引用有效、`background/site` 形状合法、资产缺失只告警。加载失败时保留原始文本（不落盘覆盖），横幅提示原因并提供「导出救援 JSON」。e2e：损坏 `current` → 横幅 + 救援导出字节等于注入内容 + 2 秒内不覆盖原记录；IDB 坏但 localStorage 好 → 从备份恢复并提示来源；两者皆坏 → 空工程 + 横幅；selftest 8 例；增量 ≤ 4,000 B |
| 技术方案 | `loadSavedProject()` 返回 `{state, audit}`；`app.js` 根据 `audit.level` 渲染横幅；救援数据只驻内存，首次保存前需用户确认；不修改既有 v1→v2 迁移 |
| 影响面 | 新增 `auditProject(raw)`；`loadSavedProject()` 返回值内部结构变化（调用方仅 `app.js` 与 selftest，需同步）；不改导出与存储 schema |
| 依赖与并行 | 与 D-08/D-09 共用 `persistence.js`，需串行；是 D-08/D-09 的前置 |
| 预估工作量 | 1 个会话；约 4 文件、+300 行 |
| 风险与降级 | 审计误判会挡住正常工程；只把结构性错误设为阻断，其余降级为告警 |
| 公共抽象 | 新增 `auditProject(raw)`（加载、selftest、救援导出共用） |

### D-08 保存失败可见化、错误分类与有限重试

| 项 | 内容 |
|---|---|
| 现状与证据 | `persistence.js:500-517` 失败仅改文字 + 一次性 fallback；`:507-508` 工程库写入静默失败；无配额/IO 区分、无重试 |
| 目标与验收 | `saveHealth = {state: ok/degraded/failed, errorCode, lastOkAt}`；区分 `QuotaExceededError`、IDB 不可用、其它 IO；仅瞬时错误重试 3 次（1s/3s/9s），配额错误不重试并给「导出 JSON / 清理空间」入口；状态栏文字与实际一致，不再出现「已保存」假象。e2e：注入 `IDBObjectStore.put` 抛 `QuotaExceededError` → 2 秒内横幅与「保存失败」、重试计数 3、内存编辑不丢、可手动导出；恢复注入后下一次保存清除横幅；selftest 6 例；增量 ≤ 5,000 B |
| 技术方案 | `classifySaveError(err)` + `reportSaveFailure(err, phase)` 统一出口；复用 `notifyIdbFallback()` 避免重复 toast；`ui-shell.js` 渲染常驻横幅；不新增存储键 |
| 影响面 | `scheduleSave()` 内部重写；新增两个纯函数；调用方 `ui-shell.js`。存储 schema 与工程库键不变 |
| 依赖与并行 | 依赖 D-07（审计/加载状态结构）；与 D-09 串行（同文件 + 横幅） |
| 预估工作量 | 1 个会话；约 3 文件、+280 行 |
| 风险与降级 | 重试造成写放大；仅对瞬时错误重试且上限 3 次；配额错误立即降级 |
| 公共抽象 | 新增 `classifySaveError()`、`saveHealth`；复用 `notifyIdbFallback()` |

### D-09 多标签页写冲突检测（同工程 lease）

| 项 | 内容 |
|---|---|
| 现状与证据 | 草稿/工程库写入为最后写者覆盖（`persistence.js:211-227`）；无 `storage` 事件或编辑 lease；`collab.js` 的 BroadcastChannel 独立通道，不覆盖同机双标签 |
| 目标与验收 | 新增 `js/core/tab-lease.js`：`BroadcastChannel('plotpin:editor-lease')`，心跳 5 s、租约 15 s；第二个标签打开同工程 6 s 内出现横幅「另一标签页正在编辑（最后心跳 HH:MM:SS）」+「重新载入 / 仍以本页为准」；选择后者需确认后才取得租约；不同工程不触发；`pagehide` 释放；BC 不可用降级 `storage` 事件，两者都不可用则明确提示「无法检测多标签」并继续可编辑。e2e 双页面 1 例 + 不同工程 1 例；selftest 假时钟 4 例；增量 ≤ 6,000 B |
| 技术方案 | 新增独立脚本（layer 1，index.html 顺序加入），只做 lease/心跳；`app.js` 启动时获取，`scheduleSave()` 保存前检查；横幅复用 D-08 的状态区 |
| 影响面 | 新增 3 个全局函数与 1 个脚本（41 → 42，需同步 `modules.md`/README 计数）；调用方 `app.js`、`scheduleSave`、`ui-shell.js`；不改协作通道与合并逻辑 |
| 依赖与并行 | 依赖 D-08 的状态横幅；与 D-07/D-08 串行；与扩展性任务可并行（文件不同） |
| 预估工作量 | 1–2 个会话；约 5 文件、+400 行 |
| 风险与降级 | 多标签测试耗时；降级为仅在保存前检测，不做实时互斥。BC/storage 均不可用时不阻塞编辑，如实提示限制 |
| 公共抽象 | 新增 `acquireEditorLease/releaseEditorLease/onLeaseConflict`（`tab-lease.js`） |

### D-10 文档入口收口：ARCHITECTURE / user-guide / plans 索引

| 项 | 内容 |
|---|---|
| 现状与证据 | 无 `docs/ARCHITECTURE.md`、无 `docs/user-guide.md`、无 `docs/plans/`；README 33,159 B 同时承担介绍与操作手册；`docs/manual-acceptance.md` 21,192 B 未跟踪 |
| 目标与验收 | 新增 `ARCHITECTURE.md`（≤10 KB：分层图、唯一源清单、链接 modules/engineering/contracts）与 `user-guide.md`（≤30 KB：快速上手、导入导出、校准、协作、插件，内容迁自 README 不重复）；新增 `plans/README.md` 索引；`manual-acceptance.md` 入册，作为 M1–M8 发布前清单。验收：README 保留快速开始与链接；标题清单前后对比无丢失；所有相对链接可达；`node scripts/check-discipline.mjs` 仍 13/13；单文件 ≤60 KB / 600 行 |
| 技术方案 | 只移动/重组文档，不新建业务说明；ARCHITECTURE 只做「入口 + 权威链接 + 唯一源表」，避免与 modules.md 重复 |
| 影响面 | 无代码与 API 影响；README 结构变化 |
| 依赖与并行 | 建议在 Phase 3 初执行；与 D-11/D-13 可并行 |
| 预估工作量 | 1 个会话；文档 +约 35 KB，产物 0 B |
| 风险与降级 | 拆分造成双份维护；降级为 README 增加目录 + 仅新建 ARCHITECTURE 索引 |
| 公共抽象 | 无 |

### D-11 i18n 覆盖率门禁与字典收敛

| 项 | 内容 |
|---|---|
| 现状与证据 | 实测 29.82%（407/1167 进模板，348 命中、59 缺口，760 硬编码）；`docs/testing.md` 仍写 33.79%，属事实漂移 |
| 目标与验收 | `i18n-scan.mjs` 输出按文件明细并支持 `--check`：总体覆盖率 ≥40%、缺口 ≤10、`js/features/*.js` 与 `js/core/{app,interaction,props}.js` 的 UI 文案硬编码 ≤20，否则退出 1；接入 `node scripts/check.mjs --selftest`。补齐 59 条缺口 + 高优 UI 文案；文档回填实测值。验收：改造前后 `i18n-scan` 输出对照表；英文 e2e 通过；产物增量 ≤ 12,000 B |
| 技术方案 | 复用现有 `L()`/字典与 `I18N.setLang`；阈值常量化在扫描脚本；不引入翻译文件拆分或运行时加载 |
| 影响面 | `i18n-scan.mjs` 新退出码与统计口径；`check.mjs` 聚合；`i18n.js` 字典增长。业务 API 不变 |
| 依赖与并行 | 依赖 D-01/D-03 文案落地后执行；与 D-10/D-13 可并行 |
| 预估工作量 | 1–2 个会话；约 5 文件、+600 行 |
| 风险与降级 | 覆盖率门禁可能逼出低质量机翻；只守「键存在 + 模板可用」，语义质量仍列为 M4；超预算则先补 UI 路径，非 UI 适配器明确豁免并记录 |
| 公共抽象 | 新增扫描阈值常量（脚本内）；无运行时公共 API |

### D-12 geometry.js 按职责拆分（行为不变）

| 项 | 内容 |
|---|---|
| 现状与证据 | `geometry.js` 1309 行 / 66,934 B，混合场地几何、覆盖率网格、轮廓/变换、命中判定；是最大业务脚本 |
| 目标与验收 | 拆为 3 个脚本（场地几何、覆盖率网格、轮廓/变换），单文件 ≤500 行，全局函数名与调用方式不变；`index.html` 顺序调整；selftest 2584/0 不变；e2e 65/1；8 种导出 golden 字节不变；产物增量 ≤ 2,000 B；脚本数 42 → 44（相对 Phase 2 结束态），同步文档计数 |
| 技术方案 | 纯移动 + 保留原有注释；不做重命名、不引入模块加载；先建立导出 golden 基线再移动，按「移动 → 跑 selftest/e2e/golden」两批提交确保可回滚 |
| 影响面 | 无公共 API 变更；影响 `index.html`、`check.mjs` 分层列表、`docs/modules.md`、README 脚本计数 |
| 依赖与并行 | 必须在 Phase 3 后段、其余代码任务完成后执行；不可与其他改动并行 |
| 预估工作量 | 1–2 个会话；约 4 文件移动 |
| 风险与降级 | 经典脚本共享全局作用域，拆分顺序错误会导致初始化顺序问题；任一回归则回滚为单文件，仅补分区注释 |
| 公共抽象 | 无新增；`outlineOf`、`siteBounds`、`coverageGridPlan` 等唯一源与签名保持不变 |

### D-13 自测分区、列表与过滤

| 项 | 内容 |
|---|---|
| 现状与证据 | `scripts/selftest.mjs` 383,395 B 单文件、2584 条断言；无分区名与过滤入口，失败定位靠行号 |
| 目标与验收 | 在脚本内建立分区注册（几何/持久化/导出/协作/插件/规则等）；新增 `--list` 与 `--filter=<regex>`；失败输出带分区名；断言总数仍 2584、0 失败；默认执行与 `--selftest` 聚合行为不变；产物 0 B 变化 |
| 技术方案 | 只改测试脚本：把现有断言块包进 `section(name, fn)`，不移动断言内容；`runAll()` 保持顺序；过滤只跳过不改变统计口径 |
| 影响面 | 仅 `scripts/selftest.mjs`；`check.mjs --selftest` 调用方式不变 |
| 依赖与并行 | 与 D-10/D-11 可并行；在 D-12 之前完成，便于拆分回归时按分区定位 |
| 预估工作量 | 1 个会话；脚本 +约 80 行 |
| 风险与降级 | 包装可能改变异步顺序；降级为只加分区注释与失败时打印最近分区，不做过滤 |
| 公共抽象 | 测试脚本内 `section(name, fn)`；无业务代码影响 |

## 4. 优先级排序与阶段排期

### 4.1 四方向排序

1. **易学易用（最高）**：每个新用户都会遇到，当前只有一行提示与 20 行快捷键；3 个任务都不动公共 API、可快速交付，能直接降低试用流失。
2. **持久性（次高）**：数据丢失不可逆，且已有「工程库写入静默失败」「损坏静默空工程」「多标签覆盖」三处代码证据；范围是条件触发（配额/坏数据/双标签），所以排在易用之后，但必须先于扩展性。
3. **扩展性（第三）**：插件生态需要稳定契约；当前 19 键、规则未入册、无安装形态。放在持久性之后，避免插件放大写入风险；兼容矩阵必须在 1.1.0 发布前落地。
4. **可维护性（最后）**：geometry 拆分、i18n 门禁、文档重组都会产生跨文件大 diff，必须等文案与 API 稳定后再做，否则反复返工；但 D-10 文档索引可提前并行。

### 4.2 阶段划分

| 阶段 | 任务与波次 | 出口判据 | 体积预算 |
|---|---|---|---|
| Phase 1 易用止血 | 波次 A：D-01 ∥ D-02；波次 B：D-03 | 首次引导/示例、校准状态矩阵、帮助中心三项 e2e 通过；无 API 变更 | ≤ 19,000 B |
| Phase 2A 持久 | D-07 → D-08 → D-09（共用 `persistence.js`，串行） | 损坏加载、配额失败、双标签三类 e2e 通过；救援导出字节可比对 | ≤ 15,000 B |
| Phase 2B 扩展 | D-04 → D-05 → D-06（共用 `plugins.js`/契约，串行） | 契约 22 键；1.0 插件在 1.1 宿主可用；清单导入事务化 | ≤ 17,000 B |
| Phase 3 维护收口 | 波次 A：D-10 ∥ D-11 ∥ D-13；波次 B：D-12 | i18n ≥40%；文档 13/13；selftest 2584/0 且可分区分过滤；拆分后 golden 不变 | ≤ 14,000 B |

合计预算 65,000 B；每阶段结束记录 `scripts/dist-manifest.json` 的 bytes 增量，超预算在本阶段内回收，不挪用 839,680 B 上限。预计 14–19 个原子提交会话。

### 4.3 关键依赖

- D-07 → D-08 → D-09：共享加载/保存状态结构，后一项复用前一项的横幅与健康状态。
- D-04 → D-05 → D-06：能力集合 → 清单校验 → 版本矩阵；三者都改契约与 `plugins.js`。
- D-01 → D-03：帮助中心复用引导卡 modal；D-02 与 D-03 共用 `interaction.js`，串行。
- D-13 先于 D-12：拆分 `geometry.js` 时可按 selftest 分区快速定位回归。
- D-11 在 Phase 1/2 文案冻结后执行，避免覆盖率反复波动。

## 5. 遗留项处置

| 遗留项 | 处置 | 理由 |
|---|---|---|
| C-02 自托管中继 | **排除** | 需长期运行的中继服务、运维、安全与成本，破坏零依赖/离线单文件定位；当前协作仅承诺同机/局域网（K10、M3）。触发条件：外部客户明确需要跨公网协作并接受部署成本，另立阶段 |
| C-03 计费 | **排除** | 无定价与授权口径，需要后端许可校验、密钥管理与激活服务，与离线单文件形态冲突；待商业模式确定后单独立项 |
| M1–M8 | **纳入发布门禁，不作为编码任务** | 均为人工/真机/真实语料项：M1 移动真机、M2 Firefox/Safari、M3 双设备 WebRTC、M4 英文语义、M5 真实 GPU、M6 低端机插件超时、M7 DXF 查看器、M8 50 条真实快照。D-10 将现有 `docs/manual-acceptance.md` 入册，发布前逐条执行并记录，CI 不伪造绿 |
| A1–A6 | 已关闭，不重复 | 本轮 selftest 2584/0、e2e、build 全绿；保持回归即可 |
| K1–K12 | **排除，保持已知限制** | K11 已关闭；其余为明确不承诺边界：SW 版本无构建期门禁、缓存策略、PDF 位图、DWG、二维码 42 B、覆盖率采样、规则非规范审图、符号上限、插件无 CPU/内存配额、协作 LWW、硬上限。D-04/D-05 在文档中重申 K9（只保证 2 s 超时，不承诺内存配额） |
| 体积二次回收 | 暂不排期 | 重复字符串 31,621 B + 重复代码行 23,803 B 有回收空间，但当前余量 103,382 B 足够覆盖本计划；若阶段超预算再启动，避免为压缩牺牲行为 |
| `docs/manual-acceptance.md` | 纳入 D-10 提交 | 21,192 B 既有未跟踪文件，作为 M 类清单入册；本轮只读不改 |

## 6. 新增/调整的公共抽象

| 抽象 | 归属 | 调用方 | 任务 | 影响面 |
|---|---|---|---|---|
| `buildDemoProject()` | `js/core/persistence.js` | `app.js`、`ui-shell.js`、selftest/e2e | D-01 | 新增，不改 `buildProject` |
| `firstRunGuideState()` | `js/features/ui-shell.js` | `app.js`、selftest/e2e | D-01 | 新增 |
| `calibPrecheck(tool)` | `js/core/interaction.js` | `ui-panels.js`、`props.js`、selftest | D-02 | 新增；校准算法不变 |
| `registerRule(def, owner?)` | `js/features/rules.js` | 规则 UI、`PlotPin`、selftest | D-04 | 参数可选，旧调用兼容 |
| `PlotPin.registerRule/unregisterRule/listRules` | `js/features/plugins.js` + `contracts/plugin-api.json` | 插件、`check-plugin-api.mjs` | D-04 | 契约 19 → 22 键，`apiVersion` 1.0.0 → 1.1.0 |
| `validatePluginManifest(raw)` | `js/features/plugins.js` | 插件面板、selftest | D-05 | 新增；`loadPlugin` 签名不变 |
| `checkPluginApiVersion()` 返回扩展 | `js/features/plugins.js` | 插件加载、兼容矩阵 | D-06 | 增加 `major/minor` 字段，旧字段保留 |
| `auditProject(raw)` | `js/core/persistence.js` | `loadSavedProject`、`app.js`、selftest | D-07 | 新增；`loadSavedProject` 内部返回结构变化，调用方仅 `app.js`/selftest |
| `classifySaveError(err)` / `saveHealth` | `js/core/persistence.js` | `scheduleSave`、`ui-shell.js` | D-08 | 新增；存储 schema 不变 |
| `acquireEditorLease/releaseEditorLease/onLeaseConflict` | `js/core/tab-lease.js`（新脚本） | `app.js`、`scheduleSave`、`ui-shell.js` | D-09 | 新增；脚本数 41 → 42，需同步文档计数 |
| i18n 阈值常量 | `scripts/i18n-scan.mjs` | `check.mjs` | D-11 | 仅脚本，无运行时影响 |
| `section(name, fn)` | `scripts/selftest.mjs` | 测试脚本 | D-13 | 仅测试，断言数不变 |

拆分 `geometry.js`（D-12）不新增抽象，`outlineOf`、`siteBounds`、`coverageGridPlan`、`objectIndexById` 等唯一源与签名保持不变；脚本数 42 → 44（Phase 2 后基线）需同步 `docs/modules.md` 与 README。

## 7. 执行纪律与验收

- 每个任务一个原子提交，遵循约定式：`feat(ux):`、`fix(persist):`、`feat(plugin):`、`perf(...)`、`test(...)`、`docs(...)`；Body 必须带实测数据（体积增量、断言数、e2e 数、耗时）。
- 同一 commit 同步更新受影响文档与 `CHANGELOG.internal.md`（Commit Hash、改动点、验证数据、遗留风险）。
- 禁止新增运行时依赖；Playwright 仅开发期依赖，不进入产物。
- 禁止 push；禁止读取/修改仓库根目录 `camera-*`。
- 每个任务提交前运行：
```bash
node scripts/check.mjs --selftest
node scripts/e2e.mjs
node scripts/build.mjs --check
node scripts/check-gates.mjs
node scripts/check-discipline.mjs
```
- 性能相关任务（D-07/D-08/D-09/D-12）额外运行 `node scripts/bench.mjs`，并以真实 Chromium e2e 数据为准，不用 Node 桩数据替代。
- 失败即如实报告：门禁不绿不得提交；若目标未达成，记录「未通过/未验证」与原因，不调低阈值。

## 8. 未验证与口径声明

- `npm run perf:browser` 本轮未复跑；[performance.md](../performance.md) 中的帧/堆/导入数据为 2026-11-07 收口记录，本计划按「未验证（本轮）」引用，不作为新基线。
- M1–M8 全部未验证：真机、跨浏览器、双设备 WebRTC、英文语义、真实 GPU、低端机插件、DXF 查看器、50 条真实快照语料。
- i18n 29.82% 为机器扫描口径（键存在 + 模板可用），翻译语义质量未评审（M4）。
- 本计划的目标体积、覆盖率、耗时均为预算值；完成后必须用真实命令输出回填，禁止估算回填。
