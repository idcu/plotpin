# PlotPin 下一阶段开发计划（N 系列，2026-11）

> 状态：**当前执行计划**（共 27 条任务：止血 4 / 纠错 17 / 提速 3 / 文档与测试 3）。本文件是后续「推进 N-xx」的唯一入口。
> 输入：`audit-out/audit-core.md`、`audit-io.md`、`audit-runtime.md`、`audit-gates.md`、`audit-docs.md`（五路只读审计，基线 `ebe0f85`），以及旧计划 `next-phase-2026-11.md`（仅作对照，其数字已过期，不再引用）。
> 本文件只做计划，不改代码/测试/scripts/contracts；不执行任何 git 写操作。
> 数字纪律：本文每个数字都标注来源与采集日期；未运行过的项一律写「未实测/待验证」，不把审计的静态推断写成实测结论。

## 0. 阅读顺序与执行约定

1. 先读 §1 基线，再读 §2 阶段纪律，然后按 §3 对应阶段逐条执行。
2. 每条任务只有一个提交粒度；标题即提交主题，编号用于「推进 N-xx」驱动。
3. 任务完成必须同时满足：本条验收 + §2 全局硬门禁 + 同 commit 更新受影响文档与 `CHANGELOG.internal.md`。
4. 同一缺陷被多份审计重复发现的，只保留一条任务，证据位置合并列出（见 §4 去重表）。
5. 顺序原则：**先止血（安全/数据丢失/假绿门禁），再纠错，再提速，最后补文档与测试**。任何性能项都排在安全与数据丢失项之后。

## 1. 实测基线（采集日期 2026-11-07～08）

| 项 | 值 | 来源 | 备注 |
|---|---|---|---|
| 代码基线 | `ebe0f85` | `git rev-parse HEAD`，2026-11-08 | 同批文档重写（`README.md` + `docs/` 下 13 份 Markdown，含本目录 2 份计划）一并提交，不改变代码基线；`audit-out/` 保持未跟踪 |
| 单文件产物 | 783,226 B（764.9 KB），gzip 243,688 B | `scripts/dist-manifest.json`，读取于 2026-11-08 | `maxBytes=839,680`，余量 **56,454 B** |
| selftest | 2706 通过 / 0 失败 | `audit-docs.md` 本机实测，2026-11-07；2026-11-08 收口复跑一致 | 执行时以当次输出为准 |
| e2e | 90 条用例 / 1 skipped（soak） | `audit-docs.md` Playwright `--list`，2026-11-07 | 本计划未复跑；soak 需 `COLLAB_SOAK=1` |
| selftest 分区 | 108 个 | `audit-docs.md` `--list`，2026-11-07 | 109 行含标题 |
| e2e spec 文件 | 33 个 | `audit-docs.md`，2026-11-07 | 44 个测试文件含 helpers/golden/fixtures/perf |
| 门禁总闸 | `check.mjs` 12 步 | `scripts/check.mjs` 源码 + `audit-gates.md` | 第 10 步 selftest、11 i18n、12 SW |
| 门禁牙齿 | 7 个场景 | `scripts/check-gates.mjs:2-13` | 场景只断言非 0，无正面基线 |
| i18n 覆盖率 | 46.16%，缺口 0，UI 硬编码 1 | `audit-gates.md` 实跑 `i18n-scan --check`，2026-11-07 | 门禁阈值 ≥40% |
| Node bench | heapUsed 29.51 MB，静态重建 34.1 ms，缓存帧 P95 0.78 ms | `audit-gates.md` 实跑 `bench.mjs`，2026-11-07 | Node 桩，非浏览器实测 |
| 浏览器性能 | 未重跑 | — | 既有阈值在 `tests/perf/browser-baseline.perf.mjs`；本计划不引用历史数字 |
| 脚本数量 | 45 个 classic script（35 项目 + 10 vendor） | `audit-docs.md` + `index.html`，2026-11-07 | |
| 插件 API | 23 键 | `check-plugin-api.mjs` 实跑，2026-11-07 | `contracts/plugin-api.json` |
| SW 缓存版本 | `plotpin-v6` | `sw.js` + `audit-docs.md` | |
| 已知问题口径 | K1 已关闭、SW 门禁存在 | `known-issues.md` 的 K1 条目 + `check-sw.mjs` | 但 CI 中恒绿，见 N-01 |

## 2. 阶段纪律与硬门禁

### 2.1 硬门禁（每个任务提交前必须全绿，沿用现状）

```bash
node scripts/check.mjs --selftest      # 2706 断言基线不得减少，作为 N-01 之前的暂定基线
node scripts/e2e.mjs                   # 不低于 90 条 / 1 skipped；跳过项不得增加
node scripts/build.mjs --check         # 产物 ≤ 839,680 B，当前 783,226 B
node scripts/check-gates.mjs           # 7/7
node scripts/check-discipline.mjs --strict  # 13/13 L4
```

- 性能任务额外跑 `node scripts/bench.mjs` 和真实 Chromium 基线（Playwright），不得用 Node 桩替代浏览器结论。
- 断言数、e2e 数、体积、门禁数一律以当次命令输出回填；本文基线只是起点，不是完成值。
- 禁止新增运行时依赖；Playwright 仅开发期；禁止 push；禁止读取/修改仓库根目录 `camera-*`。
- 失败即停：门禁不绿不得提交；不得为通过而放宽阈值、删断言、加跳过。

### 2.2 里程碑

| 里程碑 | 任务 | 退出条件 |
|---|---|---|
| M0 止血 | N-01 ～ N-04 | 假绿门禁可被真实破坏并变红；沙箱逃逸恶意用例全被阻断；PDF 底图自动保存后 reload 仍在；场地删除/清空可见、可撤销；以上均有 selftest 或 e2e 证据 |
| M1 纠错 | N-05 ～ N-21 | 导出/导入口径一致，重复 id/楼层名/CTM/仿射/扇形/边界防护均有断言；协作断线与冲突可见；瞬时态不残留；快照差异覆盖场景级；覆盖率口径统一 |
| M2 提速 | N-22 ～ N-24 | 真实 Chromium 采集 before/after：拖动/选中/快照内存 P95 与 heapUsed 达标，数据写入 commit body 与 CHANGELOG |
| M3 收口 | N-25 ～ N-27 | 文档同一事实只有一个权威源；modules 45 文件全覆盖；写测试矩阵；缺失 golden 补齐；公共抽象收敛且体积只减不增 |

## 3. 任务清单

> 每条任务的「数据属性」只有两种：**静态可判定**（可由 selftest/脚本/静态断言证明）或**必须实测**（必须真实浏览器/真实命令输出，且写明采集方法）。
> 工作量单位：人时（1 人时≈1 个连续工作小时）；按单会话 4～6 小时折算。

### Phase 0 · 止血（4 条，必须最先做）

#### N-01 修复假绿门禁：CI 契约/插件 API 真实判据 + SW 版本门禁脱离 `git diff HEAD`

- 问题与证据：`check.mjs` 把 `--selftest` 透传给契约/API 脚本（`scripts/check.mjs:74-82`），二者在该模式下只跑解析器自检并退出（`scripts/check-contracts.mjs:228-229`、`scripts/check-plugin-api.mjs:114-133`），汇总行却打印「契约守约、插件 API 面守约」（`scripts/check.mjs:145`）；CI 唯一总检就是 `check --selftest`（`.github/workflows/ci.yml:16-17`）。SW 门禁以 `git diff HEAD` 取变更集（`scripts/check-sw.mjs:50`），CI 干净 checkout 恒为空；非 git 直接 `exit 0`（`:33-37,42-45`）。`check-gates` 只断言退出码非 0，没有「未破坏副本必须全绿」的正面基线（`scripts/check-gates.mjs:55-60,160-165`）。来源：audit-gates P0-1/P0-2/P1-5、audit-docs S1/D03/D22。
- 目标：CI 必须执行真实契约与 API 判据；SW 版本门禁以**提交进仓库的预缓存输入哈希清单**为基线，不再依赖工作区 diff；`check-gates` 增加正面基线 + 两个负向场景（加私有键必红、版本漂移必红）。
- 涉及文件：`scripts/check.mjs`、`scripts/check-contracts.mjs`、`scripts/check-plugin-api.mjs`、`scripts/check-sw.mjs`、`scripts/check-gates.mjs`、`scripts/sw-inputs.sha256`（新增）、`.github/workflows/ci.yml`、`contracts/conventions.json`、`docs/engineering.md`、`docs/testing.md`。
- 验收：① 给 `PlotPin` 加一个私有键，`check.mjs --selftest` 必须 exit 1；② 改一处预缓存输入但不升 `sw.js` VERSION，门禁必须 exit 1；③ CI 显式列出 `check-contracts` / `check-plugin-api` 真实步骤；④ `check-gates` 在未破坏副本上先要求 0，再要求目标场景非 0 且输出含目标错误关键字；⑤ 7→9 场景，文档同步。
- 依赖：无。是本计划所有后续任务的前置门禁修复。
- 风险：哈希清单会在协作/合并时产生冲突；备选是构建期由内容哈希生成清单，但需保持 `sw.js` 运行时版本号可读。此取舍需拍板（见 §6）。
- 预估：4～6 人时。数据属性：静态可判定（脚本退出码 + 人为破坏场景）。

#### N-02 封堵插件沙箱逃逸：`BroadcastChannel` / `MessageChannel` / `MessagePort` 与 `onmessage`/`onerror`

- 问题与证据：沙箱硬化列表只删 `fetch/indexedDB/.../close`（`js/features/plugins.js:338-340`），`BroadcastChannel`、`MessageChannel`、`MessagePort` 均未删除且原型链未清；`onmessage`/`onerror` 未冻结；协作频道名为 `plotpin-collab-<name>`（`js/features/collab.js:2`），插件可绕过 token/能力门直接收发协作消息。来源：audit-runtime P0-02/P2-20、audit-runtime §3/§6.1。
- 目标：从全局与原型链删除 BC/MC/MP；冻结 `onmessage`/`onerror`；Worker RPC 校验 `event.source` 与 token；插件加入协作频道后既收不到也发不出消息；恶意插件被禁用并显示原因，主工程仍可操作。
- 涉及文件：`js/features/plugins.js`、`tests/e2e/plugin-sandbox.spec.mjs`、`docs/features.md`、`docs/known-issues.md`。
- 验收：① e2e 恶意插件 `new BroadcastChannel('plotpin-collab-<pid>')` 收不到消息、发送被主工程拒绝；② `MessageChannel`/`MessagePort` 构造被阻断；③ 覆写 `onerror` 后仍能走禁用路径；④ 主工程后续操作正常；⑤ 插件列表显示禁用原因；⑥ 现有 10 条沙箱用例不回退。
- 依赖：N-01（门禁修复后，e2e/门禁证据可信）。
- 风险：`MessageChannel` 被部分合法插件用于内部并发；本产品契约未承诺该能力，一律封堵并在文档说明。
- 预估：4～6 人时。数据属性：静态可判定 + 真实 Chromium e2e（必须运行）。

#### N-03 修复 PDF 导入底图在自动保存后永久丢失

- 问题与证据：PDF 分支把底图写成 `kind:'image'`、`assetId=''`、只写 `dataUrl`（`js/features/io-import.js:300-308`）；`persistableState()` 无条件删除 `dataUrl`（`js/core/persistence.js:325-334`）；`runSave()` 直接写该副本且未调用 `ensureBackgroundAsset()`（`js/core/persistence.js:538-550`）；reload 后判定既无资产也无内嵌数据，底图永久消失。非当前楼层底图走同一删除逻辑。另外解压炸弹上限在 `arrayBuffer()` 完成后才检查（`js/common/pdf-read.js:24-27`），大流会先完整展开再拒绝。来源：audit-core P0-1、audit-io P0-1、audit-core T-1、audit-gates P1-3。
- 目标：PDF 底图与普通图片导入同路径入库（`dataUrlToBytes → assetIdFor → assetPut → bg.assetId`）；保存前统一资产化；无 assetId 但有 dataUrl 时**禁止静默删除最后一份数据**；解压上限前移到流式累计阶段。
- 涉及文件：`js/features/io-import.js`、`js/core/persistence.js`、`js/common/pdf-read.js`、`tests/e2e/pdf-multipage.spec.mjs` 或新增 PDF 底图 e2e、`tests/fixtures/`（如需最小 PDF 夹具）、`docs/features.md`。
- 验收：① e2e：导入含内嵌图 PDF → 等自动保存 → `page.reload()` → `background.assetId` 非空且渲染非 missing；② selftest：`persistableState()` 对无 assetId 且无 dataUrl 的底图不得产出空底图，且对 dataUrl 兜底路径有断言；③ 非当前楼层 PDF 导入同样不丢；④ 8 种导出 golden 字节不变（除新增 PDF 夹具场景）；⑤ 伪造超限解压流在累计阶段被拒，不出现「先完整展开再报错」。
- 依赖：无（可与 N-02 并行，文件不重叠）。
- 风险：保存改成 async 资产化会改变 `runSave` 时序；资产写入失败必须保留 dataUrl 并显式告警，不能回退为静默删除。
- 预估：4～5 人时。数据属性：静态可判定 + 真实 Chromium e2e（必须运行）。

#### N-04 修复场地静默删除与本地清空失效

- 问题与证据：`mergeFloorMeta` 的 `siteWon` 要求远端仍有 site 才计数（`js/common/merge.js:255`），输出 `site: siteNewer ? fb.site : (fa.site || fb.site)`（`:262`）会把较新的 `null` 应用掉但统计为 0；`mergeHistoryNeeded` 与 `collabQueueApply.changed` 不含场地删除（`js/core/persistence.js:825-855`、`js/features/collab.js:299-303`），因此不入撤销栈且显示「无变化」；`mergeFloorWrite` 不读 `site.updatedAt`（`js/common/merge.js:224-232`）；场地节点/属性编辑只改时间戳并 `scheduleSave`，没有 `pushHistory`/`touchFloor`/`markDirty`/`collabOnLocalChange`（`js/features/props.js:229-245`）。来源：audit-runtime P0-01/P0-03/P1-10。
- 目标：场地「存在→不存在」独立计数（`siteDeleted`/`siteCleared`）；较新 `null` 获胜；场地编辑进入提交/广播/撤销/落盘链路；远端清空显示明确横幅且 Ctrl+Z 可恢复；楼层墓碑判定纳入 `site.updatedAt`。
- 涉及文件：`js/common/merge.js`、`js/core/persistence.js`、`js/features/collab.js`、`js/features/props.js`、`scripts/selftest.mjs`、`tests/e2e/collab.spec.mjs`、`docs/features.md`、`docs/user-guide.md`。
- 验收：① selftest：`mergeFloorMeta(fb.site=null)` 计数与输出均为清空，且 `siteNewer` 时本地 null 获胜；② e2e 双页面：对端清空场地 → 本地横幅提示 → Ctrl+Z 恢复；③ 本地清空后合并不复活；④ 场地拖点后对端可收到并合并；⑤ 楼层墓碑不吞掉较新场地编辑。
- 依赖：N-01（证据可信）；与 N-03 可并行。
- 风险：`site:null` 与旧档 `mergeSiteFromBackground` 兼容路径冲突；需保留旧档迁移语义并补 selftest。
- 预估：6～8 人时。数据属性：静态可判定 + 真实 Chromium 双页面 e2e（必须运行）。

### Phase 1 · 纠错（17 条）

#### N-05 统一导出可见性口径，并将草稿/校准状态隔离出 PNG/PDF

- 问题与证据：SVG/DXF/图例/标签页走 `isVisible(o)`（`js/features/io-export.js:57,227,472,593`），CSV/TSV/XLSX 走 `objectRowsAll()` 不过滤（`io-export.js:135-146`、`io-fields.js:83-86`），台账「显示」列只反映 `o.visible`（`io-fields.js:35`），PDF 清单与图纸页口径不一致（`io-export.js:682-686,728-736`）。同时 `render.js:193-201` 在 `interactive===false` 时仍无条件执行 `drawDraft/drawCalibration`，导出 PNG/PDF 会把草稿线/校准点烘进产物。来源：audit-io P1-1、audit-core P1-2、audit-core T-3。
- 目标：新增单一 `exportScope(o, mode)` / `effectiveVisible(o)` 判断源；明确「台账是否含隐藏图层」的产品口径并写入文档；PNG/PDF 默认不绘制草稿与校准（新增显式 `includeDraft/includeCalibration`，默认 false）。
- 涉及文件：`js/features/io-export.js`、`js/core/render.js`、`js/features/io-fields.js`、`tests/e2e/*export*`、`scripts/selftest.mjs`、`docs/features.md`、`docs/user-guide.md`。
- 验收：① 同一工程隐藏图层后，CSV/XLSX/PDF 清单与画布/PNG/SVG/DXF 的可见性结论有单一断言源；② 处于矩形工具第一落点/两点校准态导出 PNG/PDF，产物不含草稿线或校准标记（e2e 像素采样或渲染调用计数断言）；③ 8 种导出 golden 字节不变（未进入草稿/校准/隐藏图层场景时）；④ 台账表头不变（若确需新增列，先停下走 §6 拍板）。
- 依赖：N-01。
- 风险：产品口径需决定「台账全量 + 有效显示列」还是「台账过滤」；不得静默改表头。
- 预估：5～7 人时。数据属性：静态可判定 + 真实 Chromium e2e（必须运行）。

#### N-06 统一对象变更时间戳，修复拖动/旋转/批量属性在协作 LWW 中被旧值覆盖

- 问题与证据：节点拖动、旋转手柄只改几何，`pointerup` 只 `commitChange()`（`js/core/interaction.js:386-397,466-480`）；`commitChange` 只 touch 楼层/工程，不回写对象 `updatedAt`（`js/core/persistence.js:147-158`）；协作按对象 `updatedAt` 做 LWW（`js/common/merge.js:262-280`）。来源：audit-core P1-1、audit-core T-6。
- 目标：新增 `stampObjects(ids)` 单一助手，`commitChange/commitObjectEdit` 与所有几何/批量属性写入路径共用；只对实际变化的 id 打点。
- 涉及文件：`js/core/persistence.js`、`js/core/interaction.js`、`js/features/props.js`、`js/common/merge.js`（只读校验）、`scripts/selftest.mjs`、`tests/e2e/collab.spec.mjs`。
- 验收：① selftest：节点拖动/旋转/批量显隐后对象 `updatedAt` 严格递增；② e2e：A 拖节点、B 改属性，合并后两者都保留；③ 无变化提交不产生新时间戳（幂等）；④ 现有 LWW/墓碑用例不回退。
- 依赖：N-04（场地链路先接好，避免重复改 props/commit）。
- 风险：批量路径多，遗漏会导致同类缺陷；需在 selftest 按写入入口逐条覆盖。
- 预估：5～7 人时。数据属性：静态可判定 + 真实 Chromium e2e（必须运行）。

#### N-07 导入唯一性硬化：重复对象 id、`safeId` 归并冲突与重名

- 问题与证据：`sanitizeObjects` 对 `raw.id` 只做 `safeId()`，不检查同楼层是否已存在；`safeId` 会把 `a:b` 与 `a?b` 归并成 `a_b`；名称只判空不判重（`js/core/persistence.js:1058-1068`）。后果：重复 id 无法独立选中、按 id 删除一次删两个、协作 LWW/墓碑互相覆盖、快照 diff 出现假差异。来源：audit-core P1-3、audit-core T-2。
- 目标：清洗阶段建 `seenIds`，冲突时重新分配稳定 id 并记录审计告警；名称冲突走现有 `beginObjectNameScope` 统一重编号。
- 涉及文件：`js/core/persistence.js`、`js/core/model.js`、`scripts/selftest.mjs`、`docs/features.md`。
- 验收：① selftest：同 id 两对象、`a:b`/`a?b` 冲突、重名对象导入后 id/编号唯一且可独立删除；② 导入不因去重改变对象数量之外的既有字段；③ 重复 id 不再进入协作/快照测试样本。
- 依赖：无（可与 N-06 并行，文件不重叠）。
- 风险：重新分配 id 会改变旧工程引用；只对新导入冲突生效，不迁移已存工程。
- 预估：4～5 人时。数据属性：静态可判定。

#### N-08 楼层名唯一化与图层/类型跨楼层引用检查

- 问题与证据：`addFloor`/`renameFloor` 无唯一性校验（`js/core/persistence.js:456-498`）；导入用 `floorByName` 同名后者覆盖（`js/features/io-table.js:237,272`）；删除图层/类型只检查当前楼层（`js/features/ui-panels.js:170-202`、`js/core/model.js:473`），其他楼层留下悬空 `layerId/typeId`。来源：audit-io P1-2、audit-runtime P1-08。
- 目标：新增/重命名楼层拒绝重名（或自动加后缀）；导入预览对同名楼层直接报歧义；删除图层/类型前检查全部楼层并提供「迁移到默认/拒绝」明确路径。
- 涉及文件：`js/core/persistence.js`、`js/features/io-table.js`、`js/features/ui-panels.js`、`js/core/model.js`、`scripts/selftest.mjs`、`tests/e2e/table-batch.spec.mjs`。
- 验收：① 新建/重命名同名楼层被拒且提示；② 导入含同名楼层的表格在预览阶段整体拒绝（事务化，不污染现有数据）；③ 删除被其他楼层引用的图层/类型时给出引用楼层数与确认；④ 拒绝后无悬空引用。
- 依赖：N-07（同属导入清洗；可串行合并证据）。
- 风险：旧工程已存在重名楼层，加载时不能直接报错；只对新操作拒绝，加载时告警。
- 预估：4～6 人时。数据属性：静态可判定 + 真实 Chromium e2e（导入拒绝路径）。

#### N-09 修正 PDF 导入 CTM：曲线采样与文本坐标统一到设备空间

- 问题与证据：贝塞尔采样把未变换控制点与已变换 `cur` 混合后再 `tx`（`js/common/pdf-read.js:92-105`）；文本定位只取 `Tm/Td`，不乘 CTM（`:135-165`，第 162 行 `x:mat[4]+dx`）。含 `/cm` 的 CAD 打印 PDF 导入后曲线与文字错位。来源：audit-io P1-5、audit-io §6.2。
- 目标：曲线采样全程在设备空间（先 `tx` 控制点再插值）；文本定位把当前 CTM 与文本矩阵相乘；补含 `/cm` 的最小 PDF 夹具。
- 涉及文件：`js/common/pdf-read.js`、`tests/fixtures/`、`scripts/selftest.mjs`、`docs/features.md`。
- 验收：① selftest：构造 `q 2 0 0 2 0 0 cm …` 最小 PDF，断言端点与文字坐标均为恒等 CTM 情形的 2 倍；② 不含 `/cm` 的既有样例坐标不变；③ PDF 导出/导入现有 golden 不回退。
- 依赖：N-03（同一 PDF 链路，先修数据丢失再修坐标）。
- 风险：PDF 语义近似解析可能仍有别的偏差；本条只承诺 `/cm` 场景，其他压缩/旋转在文档标注限制。
- 预估：6～8 人时。数据属性：静态可判定（构造夹具 + 断言）。

#### N-10 导出层转义与结构注入加固：SVG 颜色、DXF 图层名、符号 `A` 路径

- 问题与证据：SVG 直接把 `o.style.color` 插入 `fill/stroke`（`js/features/io-export.js:477,485,492,525,532,536,595`），靠持久化白名单兜底；DXF `safeLayer` 未过滤 CR/LF（`ngm.vendor/.../dxf/src/core.js:52`、`js/core/persistence.js:1010-1030`）；符号路径白名单允许 `A` 开头，`pathToPolylines` 的 `A` 分支无 `cur` 空值保护，DXF 导出可抛 `TypeError`（`js/common/symbols.js:97,291,354,378`）。来源：audit-io P1-3/P2-26、audit-gates P1-4。
- 目标：新增 `normalizeExportColor`（白名单）与 `dxfSanitizeName`（CR/LF 清洗）；符号规范化要求首命令 `M/m`，`A/S/Q/T` 分支加空值保护；所有恶意输入在导出层被拒绝而非靠上游兜底。
- 涉及文件：`js/features/io-export.js`、`js/common/symbols.js`、`ngm.vendor/.../dxf/src/core.js`（仅适配层，不改 vendor 语义时优先在调用侧清洗）、`scripts/selftest.mjs`。
- 验收：① selftest：恶意颜色 `" onload=…` 导出 SVG 属性被中和；② 含 CR/LF 图层名导出 DXF 结构完整；③ `<path d="A …">` 导入后被拒或安全降级，DXF 导出不抛异常；④ 正常 SVG/DXF golden 字节不变。
- 依赖：N-05（同属导出层，先定口径再加固）。
- 风险：改 vendor 会违反“不改 vendor”惯例；优先在调用侧清洗并同步 `docs/engineering.md`。
- 预估：4～6 人时。数据属性：静态可判定（构造恶意输入断言）。

#### N-11 修正 JSON 导入事务顺序：先提交成功再回收资产

- 问题与证据：`importJsonFile` 顺序为「替换 state → `pruneBgAssets()` → `afterStateLoaded()`」，异常时只还原 state/history（`js/features/io-import.js:7-46`，第 34-41 行）；旧工程资产可能在回滚前已被判不可达删除，回滚后 `assetId` 指向已删资产。来源：audit-io P1-4、audit-io §4.3。
- 目标：回收移到 `afterStateLoaded()` 成功之后，或把 `prevState` 可达资产并入本次 prune 白名单；失败回滚后旧工程资产必须完整。
- 涉及文件：`js/features/io-import.js`、`js/common/content-assets.js`、`scripts/selftest.mjs`、`tests/e2e/persistence.spec.mjs`。
- 验收：① selftest：注入 `afterStateLoaded` 抛错，回滚后旧底图 assetId 仍可读；② 成功导入后不可达旧资产正常回收；③ 导入失败不覆盖草稿/工程库。
- 依赖：N-03（资产写入路径先统一）。
- 风险：资产回收延后可能短暂增加存储占用；需在文档说明「事务成功后才回收」。
- 预估：3～4 人时。数据属性：静态可判定 + e2e 失败注入。

#### N-12 修复一般仿射下圆/椭圆/平行四边形/扇形的系统性失真

- 问题与证据：圆直接取 `rx=r*sx, ry=r*sy, angle=theta`（`js/core/geometry-transform.js:83-86`），仅“旋转×轴向缩放”成立；椭圆丢弃剪切分量（`:87-93`）；平行四边形不重算 `skew`（`:98-105`），而场地分支重算（`:156`）；扇形只按 `sx` 缩放半径（`:94-97`）。来源：audit-core P1-6。
- 目标：抽出公共 `affineShapeTransform(M, shape)`（含 SVD/极分解），对象与场地共用；不可表达形状给出显式降级标记。
- 涉及文件：`js/core/geometry-transform.js`、`js/core/geometry-site.js`、`scripts/selftest.mjs`、`docs/features.md`、`docs/engineering.md`。
- 验收：① selftest：旋转 30° + `sx=2,sy=1` 下圆/平行四边形/椭圆断言轴长、朝向、`skew` 与解析值一致；② 场地与对象同一变换规则一致；③ 未使用仿射的既有 golden 不变；④ 降级形状在导出报告/文档明确标注。
- 依赖：N-09（PDF 坐标先正确，避免混淆来源）。
- 风险：几何行为改变会影响已校准工程；只对“新应用变换”生效，不迁移已存坐标，并在文档说明。
- 预估：8～10 人时。数据属性：静态可判定（数学断言 + golden）。

#### N-13 修复跨 0° 扇形：画布与 SVG 外圈方向不一致

- 问题与证据：画布按 `start,end,ccw` 归一后取 `a0>=a1 ? a0-a1 : a0+2π-a1`（`js/core/render.js:406-411`）；SVG 固定 `a0=start,a1=end`（`js/core/geometry-site.js:165-172`）。`start=350° end=20°` 时画面约 30°、SVG 约 330°，导出与屏幕不一致。来源：audit-core P1-7。
- 目标：抽出公共 `sectorArcRange(shape)` 单一源，画布/SVG 共用；补跨 0° golden。
- 涉及文件：`js/core/render.js`、`js/core/geometry-site.js`、`scripts/selftest.mjs`、`tests/golden/`（新增跨 0° SVG）、`docs/features.md`。
- 验收：① selftest 对 `350°→20°` CW/CCW 两种方向断言起止角与扫角一致；② SVG golden 与画布几何断言同步；③ 不跨 0° 的既有 golden 字节不变。
- 依赖：N-12（同属几何渲染口径）。
- 风险：SVG `A` 命令的 sweep 标志与角度方向耦合，需按同一 `ccw` 语义映射。
- 预估：3～4 人时。数据属性：静态可判定（golden + 角度断言）。

#### N-14 边界防护三合一：图片切变退化、`fitView` 缩放夹取、顶点上限与包围盒循环

- 问题与证据：`applySiteSnap` 在 θ=90° 写 `Infinity` 进 `background.transform`（`js/core/geometry-site.js:413-416`）；`fitView` 算出的 zoom 可能超出 `[ZOOM_MIN, ZOOM_MAX]`（`js/core/viewport.js:60-73`）；`MAX_SHAPE_POINTS` 未使用（`js/core/geometry.js:223-229`），单对象可无限加点；`siteBounds` 无重入保护，未受控点列可无限递归（`js/core/geometry-site.js:40-52`）。来源：audit-core P1-8/P1-9/P2-3/P2-4。
- 目标：切变退化前夹取/拒绝；`fitView` 结果按统一常量夹取；顶点上限在模型层生效（超限拒绝并提示）；包围盒循环检测给出安全回退值。
- 涉及文件：`js/core/geometry-site.js`、`js/core/viewport.js`、`js/core/geometry.js`、`js/core/persistence.js`、`js/features/props.js`、`scripts/selftest.mjs`、`docs/features.md`。
- 验收：① selftest：θ=90° 切变不产生非有限值；② `fitView` 极端缩放下 `zoom` 落在常量区间；③ 第 `MAX_SHAPE_POINTS+1` 个点被拒且提示；④ 自交/循环点列返回安全值不无限递归；⑤ 正常工程行为与 golden 不变。
- 依赖：N-12（同一几何内核改造）。
- 风险：上限值改变既有超限工程的可编辑性；超限工程只读提示，不静默截断。
- 预估：5～6 人时。数据属性：静态可判定。

#### N-15 交互瞬态统一清理：载入、切层、撤销/重做、快照回滚、协作合并

- 问题与证据：`afterStateLoaded` 清 `draft`/`calib`/`trackingDrag`/`diffView`，但不清 `affineDrag`/`historyValueCache`（`js/core/persistence.js:1118-1124`）；快照回滚清 `layeringDiff`/`diffView` 但不清 `affineDrag`（`js/core/snapshot.js:111-118`）；`geometry.js:329-331` 注释要求切换 `calib` 时复位 `trackingDrag`，`afterStateLoaded` 未做。来源：audit-runtime P2-11/P2-12、audit-core T-8。
- 目标：新增 `resetTransientInteractionState({keepCalib:true})`，上述入口统一调用；`beforeSnapshotRestore` 不得清空校准。
- 涉及文件：`js/core/persistence.js`、`js/core/snapshot.js`、`js/features/collab.js`、`js/core/geometry.js`、`scripts/selftest.mjs`、`tests/e2e/undo.spec.mjs`。
- 验收：① selftest：注入 `affineDrag`/`trackingDrag` 后载入工程，二者均为空；② 快照回滚不清校准；③ 快照回滚清 affine；④ 切换楼层后草稿/捕捉热键状态复位；⑤ e2e 撤销/重做后无残留 overlay。
- 依赖：N-04（撤销链路先修）。
- 风险：不同入口需要保留的瞬态不同；`keepCalib` 必须显式，不允许“一刀切清空”。
- 预估：4～5 人时。数据属性：静态可判定 + e2e。

#### N-16 协作断线补发与自动重连，并把楼层增删/清空纳入广播

- 问题与证据：断线时本地修改只置 `pending=true`，重连只 `ensure()` 不重发（`js/features/collab.js:335-342`），文档承诺的「5 分钟后自动重连」实现不可见（`:388-430`）；楼层增删/清空/撤销不广播，中继端无 `floor-add/floor-delete/floor-clear` 分支（`js/core/persistence.js:130-136,456-490`、`collab.js:388-430`）。来源：audit-runtime P1-01/P1-02。
- 目标：待发修改持久化队列 + 指数退避自动重连（含 5 分钟上限）+ 重连后合并结果可验证；楼层操作新增消息类型并走 merge 助手。
- 涉及文件：`js/features/collab.js`、`js/core/persistence.js`、`js/common/merge.js`、`tests/e2e/collab.spec.mjs`、`docs/features.md`。
- 验收：① e2e：A 断网改对象 → 恢复 → 修改自动补发到 B，且 A 的本地修改未丢；② 离线 ≥5 分钟后恢复仍自动重连并补发；③ 楼层新增/删除/清空后 B 在超时内一致；④ 断线期间刷新页面后待发修改不丢（落盘队列）；⑤ 双设备 WebRTC 真机仍标「未验证」。
- 依赖：N-04（楼层/场地合并先正确）。
- 风险：离线队列可能膨胀；需设上限并显式提示，不得静默丢弃。
- 预估：8～10 人时。数据属性：静态可判定（merge/队列）+ 真实 Chromium 双页面 e2e（必须运行）；真机项未实测。

#### N-17 协作冲突可见性与跨工程隔离

- 问题与证据：`changed=0` 时冲突横幅不显示、撤销按钮不启用（`js/features/collab.js:145-160,292-322`）；频道名只有工程名，无 projectId，同名工程会串线；消息无 projectId 校验（`collab.js:2,537-543,256-291`）。来源：audit-runtime P1-03/P1-04、audit-io §4.3。
- 目标：冲突计数包含元数据/场地删除；频道名与消息体带 `projectId`，不匹配直接丢弃并计数；跨工程串线有 e2e 断言。
- 涉及文件：`js/features/collab.js`、`js/common/merge.js`、`tests/e2e/collab.spec.mjs`、`docs/features.md`。
- 验收：① 远端覆盖但 `changed=0` 时仍出现「已覆盖 N 项」横幅且可回滚；② 两个同名工程各自打开，互不收到消息；③ 伪造 projectId 消息被丢弃并计入冲突；④ 现有协作用例不回退。
- 依赖：N-04、N-16。
- 风险：`projectId` 进入频道名会改变邀请串兼容性；旧邀请串需明确迁移说明，不静默失效。
- 预估：6～8 人时。数据属性：静态可判定 + 真实 Chromium 双页面 e2e（必须运行）。

#### N-18 插件写入可撤销，并封堵载入后定时器逃逸

- 问题与证据：`api.addObjects` 直接 `appendObjects` 不 `pushHistory`（`js/features/plugins.js:363-393`）；`installSandboxGlobals` 删除定时器但样例插件在 `loaded` 回调恢复 `setInterval`（`plugins.js:304,481-489,546-560`）。来源：audit-runtime P1-05/P1-06。
- 目标：插件写入统一走 `pushHistory` + 事务提交；载入后再清一次定时器并冻结 `loaded` 后的全局逃逸面；恶意插件测试覆盖定时器/BC 组合。
- 涉及文件：`js/features/plugins.js`、`tests/e2e/plugin-sandbox.spec.mjs`、`docs/features.md`。
- 验收：① 插件 `addObjects` 后 Ctrl+Z 可完全移除且工程状态一致；② 载入后 `setInterval` 逃逸无效；③ 恶意用例不阻塞主线程；④ 现有插件用例不回退。
- 依赖：N-02（沙箱逃逸先封堵）。
- 风险：无。
- 预估：4～5 人时。数据属性：静态可判定 + 真实 Chromium e2e。

#### N-19 属性面板 `focusin` 历史累积改为事件委托

- 问题与证据：每次重建属性面板都 `addEventListener('focusin', pushHistory, {once:true})`（`js/features/props.js:230` 场地与其他字段），历史最多 20 条会被焦点事件挤满，撤销粒度失真。来源：audit-runtime P1-07、audit-core P2-11。
- 目标：容器一次委托，按「字段获得焦点→首次输入」只入栈一次；场地与对象共用同一实现。
- 涉及文件：`js/features/props.js`、`js/core/persistence.js`（复用 pushHistory 助手）、`scripts/selftest.mjs`、`tests/e2e/undo.spec.mjs`。
- 验收：① selftest/e2e：连续切换 5 个字段后一次拖动仍可一次 Ctrl+Z 回到拖动前；② 历史条数不随焦点事件线性增长；③ 对象与场地面板行为一致。
- 依赖：N-04（场地提交链路先修）。
- 风险：用户可能期望每次字段编辑都可撤销；保留“每次提交一次撤销”，只在字段首次聚焦时入栈。
- 预估：3～4 人时。数据属性：静态可判定 + e2e。

#### N-20 统一覆盖率口径：统计积、区域包围盒、优化器分母与盲区面积

- 问题与证据：统计用等经纬网格面积，图表用多边形面积分配（`js/core/geometry-coverage.js:155-160` vs `:181-186`）；覆盖率与优化器两套区域判定/分箱（`:206-250`、`js/features/rules.js:433-459`）；`stats.bounds` 排出 0 面积矩形但 `regionPi` 仍算入（`geometry-coverage.js:65-76,90-97`）；面板区域面积用视口包围盒（`js/features/ui-panels.js:357`）。来源：audit-core P2-5/P2-6/P2-7、audit-io §6.5。
- 目标：单一 `coverageCellPlan`/`regionMetric` 口径；统计与图表共用多边形面积分配；`regionPi` 与 `stats.bounds` 同源；面板面积随缩放不变。
- 涉及文件：`js/core/geometry-coverage.js`、`js/features/rules.js`、`js/features/ui-panels.js`、`docs/performance.md`、`scripts/selftest.mjs`。
- 验收：① selftest：同一工程统计、图表、覆盖率面板三处覆盖率数值一致（容差 ≤0.01%）；② 5000×5000m <300ms 阈值不回退（当次 benchmark 输出）；③ 历史报告数值不改写，文档新增口径版本说明；④ 优化器搜索耗时实测并写入报告（未实测则标「未实测」）。
- 依赖：N-10（导出报表字段先稳定）。
- 风险：口径变更会影响历史报告可比性；仅在文档显式标注版本差异，不得静默改历史数值。
- 预估：6～8 人时。数据属性：静态可判定 + 覆盖率 benchmark 实测（5000×5000）。

#### N-21 快照差异覆盖场景级、恢复守卫与命名空间/字节口径

- 问题与证据：`diffSnapshots` 只比较 `f.objects`（`js/core/snapshot.js:185-209`），场地、底图、名称变化显示「无差异」；恢复只校验 `projectId`（`:101-115`），数据来自同命名空间任意记录；字节统计用 `JSON.stringify().length`（`:11-13`），UTF-8 上限失真；快照键 `snap:<工程>:<快照>` 冒号拼接可能与协作场景冲突（`:51-61`）；`persistableState` 的压缩副本键序变化导致 `mergeStable` 误判（`js/core/persistence.js:958-1015`）；列表每次全量 JSON.parse（`snapshot-ui.js:106-116`）。来源：audit-runtime P1-09/P2-01～P2-05、audit-core P2-8。
- 目标：差异覆盖场地/底图/楼层元数据；恢复前校验快照归属与版本并二次确认；字节上限按 UTF-8 实际体积并给出截断提示；命名空间编码不可歧义；列表用元数据索引避免全量解析。
- 涉及文件：`js/core/snapshot.js`、`js/features/snapshot-ui.js`、`js/core/persistence.js`、`scripts/selftest.mjs`、`tests/e2e/snapshot.spec.mjs`、`docs/features.md`。
- 验收：① selftest：仅改场地顶点/底图/楼层名时差异分类正确（新增/删除/移动/属性修改）；② 跨工程快照 ID 恢复被拒；③ 20 条快照仍受 16 MB 上限，超限淘汰最旧并至少留 1 条；④ 列表 20 条打开耗时不随对象数线性增长（实测写入报告，未实测则标「未实测」）；⑤ 现有快照 golden/回滚用例不回退。
- 依赖：N-04（场地合并先正确，差异才可信）。
- 风险：差异分类顺序是既有契约，新增场景级项必须排在「属性修改」之后并文档化。
- 预估：6～8 人时。数据属性：静态可判定 + e2e；列表性能项必须实测。

### Phase 2 · 提速（3 条，必须真实 Chromium 实测）

> 通用采集方法：Playwright Chromium（非 Node 桩），同一机器、同一夹具、冷启动后预热 3 次、采样 ≥30 次取 P95；内存用 CDP `Runtime.getHeapUsage`/`performance.memory` 前后对比；每次记录夹具规模、视口、commit、命令与原始输出，写入 commit body 与 `CHANGELOG.internal.md`。没有 before/after 数据不得提交。

#### N-22 捕捉热路径：空间预筛、一次包围盒、手势期短路

- 问题与证据：`buildSnapCandidates` 对全量对象扫描并合并 `siteHandleList`，未按指针附近过滤（`js/core/geometry.js:31-97`）；`nearestEdge` 先分配全部边数组再按 bbox 过滤（`:143-190`）；每个候选最多尝试 10 条边、每条两边，10k 对象拖动呈 O(N×10)（`js/core/interaction.js:126-166,360-374`）。来源：audit-core P1-4、audit-core §7。
- 目标：按指针视口/包围盒先建候选集（复用现有索引能力或按层缓存），一次计算所选对象 bbox，拖动期跳过全量重算；不改变捕捉结果（同输入同输出）。
- 涉及文件：`js/core/geometry.js`、`js/core/interaction.js`、`js/core/render.js`（仅缓存失效）、`scripts/bench.mjs`、`tests/perf/browser-baseline.perf.mjs`、`docs/performance.md`。
- 验收：① 同夹具下捕捉结果与改造前逐点一致（selftest/golden）；② 真实 Chromium 10k 对象拖动 P95 帧时间较基线下降 ≥30%，heapUsed 增幅 ≤5%（实测值写入 commit）；③ 现有 bench 的 heapUsed/静态重建/P95 阈值不回退；④ 未实测项不得写成已达成。
- 依赖：N-14（几何边界先稳定，避免测到错误路径）。
- 风险：空间预筛若与渲染缓存不同步会漏捕捉；必须先做“候选集与全量结果等价”的 selftest。
- 预估：10～14 人时。数据属性：**必须实测**（真实 Chromium P95/heapUsed）+ 静态等价断言。

#### N-23 选中与悬停不再重建静态层

- 问题与证据：`drawSceneStatic` 每次把选中/活动对象从静态层剔除再绘制，选中变化触发 `markDirty`（`js/core/render.js:110-121,146-183`）；10k 对象下每次点选都完整重建静态层。来源：audit-core P1-5、audit-core §7。
- 目标：静态层保留全部可见对象，选中/悬停仅叠加绘制；补充独立脏标 `staticDirty`，选中变化不再置脏。
- 涉及文件：`js/core/render.js`、`js/core/interaction.js`、`scripts/bench.mjs`、`tests/perf/browser-baseline.perf.mjs`、`docs/performance.md`。
- 验收：① 选中/悬停变化时静态层重建次数为 0（可注入计数断言）；② 真实 Chromium 10k 对象连续点选 P95 较基线下降 ≥30%，且静态重建耗时不回退；③ 视觉 golden（PNG/SVG）不变；④ 现有 bench 阈值不回退。
- 依赖：N-22（同一渲染路径，避免重复测量噪声）。
- 风险：叠加层与静态层叠放顺序需与既有渲染顺序一致（图片→场地→网格→覆盖率→场地标注→坐标轴→对象→手柄）。
- 预估：6～8 人时。数据属性：**必须实测**（真实 Chromium）+ golden 断言。

#### N-24 历史与快照内存：帧共享、列表索引、避免二次归档

- 问题与证据：`pushHistory` 两次深克隆（`js/core/model.js:362-392`、`js/core/persistence.js:403-410`）；20 条含照片历史导致堆显著上涨；快照列表每次全量读（`snapshot.js:36-49`）。来源：audit-core P1-10、audit-runtime P2-02、audit-core §7。
- 目标：历史帧共享不可变子树/资产引用，去掉重复克隆；快照列表用轻量元数据索引；保持 20 条上限、撤销/重做语义、`history.past/future` 消费方式不变。
- 涉及文件：`js/core/model.js`、`js/core/persistence.js`、`js/core/snapshot.js`、`js/features/snapshot-ui.js`、`scripts/bench.mjs`、`tests/perf/browser-baseline.perf.mjs`、`docs/performance.md`。
- 验收：① 真实 Chromium 20 条含照片历史，heapUsed 较基线下降 ≥50%（沿用既有硬标准），单次撤销 <100 ms；② 10k 对象工程快照列表打开耗时较基线下降；③ selftest 撤销/重做/资产可达集断言不减少；④ 20 帧上限与语义不变；⑤ 原始 before/after 数据写入 commit 与 CHANGELOG。
- 依赖：N-21（快照元数据先加索引）。
- 风险：共享不可变结构若被就地修改会污染历史；必须先做写时复制断言。
- 预估：12～16 人时。数据属性：**必须实测**（真实 Chromium heap/撤销耗时）。

### Phase 3 · 文档与测试收口（3 条）

#### N-25 文档单一事实源与过期数字清理

- 问题与证据：当前值与旧值冲突：selftest 2706 vs 文档 2584；e2e 90 vs 65；体积 783,226 vs 784,371；DXF 已实现 vs「未验证」；plans 写 D01-D15 但旧 README 只列 D01-D13；报告写「10,000 对象 / 7,453 B > 10 KB」自相矛盾；`known-issues.md` 的 K1 条目把 SW 门禁写成已修复而 CI 恒绿。来源：audit-docs S1-S6、D01-D26。
- 目标：建立 `docs/facts.md` 作为唯一事实源（数值 + 采集命令 + 采集日期），其余文档只引用不复制；旧数字加「历史」标注或删除；计划索引与状态对齐。
- 涉及文件：`docs/facts.md`（新增）、`README.md`、`docs/testing.md`、`docs/performance.md`、`docs/known-issues.md`、`docs/plans/README.md`、相关功能文档；`CHANGELOG.internal.md` 仅追加。
- 验收：① 全仓 `rg "2584|65 个 e2e|784,371|784,371 B"` 仅命中历史区且显式标注；② `facts.md` 每个数字有采集命令与日期；③ plans 索引覆盖 D01-D15 与 N-01～N-27；④ known-issues 对 SW 门禁的描述与 CI 实际一致（N-01 结果）；⑤ 链接/锚点校验零断链。
- 依赖：N-01（门禁结论确定后才能写事实）。
- 风险：批量替换可能误伤历史 CHANGELOG；历史文件只加标注不重写。
- 预估：6～8 人时。数据属性：静态可判定（文本检索 + 链接校验）。

#### N-26 补齐 modules 文件目录、写测试功能域矩阵、补缺失 golden

- 问题与证据：7 个文件无模块文档（`features/import-ui.js`、`io-import.js`、`io-table.js`、`plugins.js`、`common/plugins-sandbox.js`、`common/pdf-read.js`、`common/symbols.js`，`docs/modules.md:203-344` 仅 26 个）；testing 只有计数与明细，无功能域覆盖矩阵（`docs/testing.md`）；CSV/TSV/XLSX/GeoJSON/PNG 无 golden 回归（`scripts/check.mjs`/测试目录）；DXF 无直接 e2e、TSV 无独立用例；`@media print` 未闭合无门禁（`css/style.css:213-224`，audit-gates P1-1）；Playwright 清空 `test-results` 会删人工验收证据（audit-docs D08/D18）。
- 目标：`modules.md` 覆盖全部 45 个 classic script；`testing.md` 增加「功能域 × 层（selftest/e2e/golden）」矩阵；补 5 类缺失 golden 与 DXF/TSV e2e；`check-gates` 增加 CSS 结构场景；人工验收证据移出 Playwright `outputDir`。
- 涉及文件：`docs/modules.md`、`docs/testing.md`、`tests/golden/`、`tests/e2e/*`、`scripts/check-gates.mjs`、`playwright.config.mjs`、`docs/acceptance/`。
- 验收：① modules 逐文件表 45 行、`script` 类 35 行全覆盖；② 测试矩阵列出 108 个 selftest 分区与 90 条 e2e 的功能域归属，空白格显式标「无覆盖」；③ 新增 ≥5 类 golden 且 8 种导出各有字节/semantic 对比；④ DXF/TSV 有独立 e2e 通过；⑤ CSS 门禁场景 7→8（N-01 后为 9→10）；⑥ 人工证据目录不被测试清空。
- 依赖：N-25（事实源先统一；测试计数以 facts.md 为准）。
- 风险：golden 新增可能暴露既有差异；发现即先报告差异，不擅自改 golden 基线。
- 预估：10～14 人时。数据属性：静态可判定 + e2e 实跑。

#### N-27 公共抽象收敛（审计高置信项）与剩余 P2 归档

- 问题与证据：审计列出的高置信重复/死代码：`historyValueEqual` 双重序列化（`js/core/geometry.js:374-401`）；`mergeStable` 仅此处使用（`js/common/merge.js:127-136`）；`buildSnapCandidates` 双重分配（`geometry.js:31-97`）；`drawSelection` 无用分配（`render.js:159-166`）；`normalizeColor` 分散；覆盖率口径常量未收敛；门禁脚本 CSS/MJS 解析器两套（`check-discipline.mjs`、`check-ngm.mjs`）；`sanitizeLayers` 多份；`objectIndexById` 调用点未统一。来源：audit-core §6（A-1～A-8）、audit-gates P2。
- 目标：按审计清单收敛公共抽象，删除确认死代码，不改变任何行为；门禁脚本公共库抽到 `scripts/lib/`。
- 涉及文件：`js/core/geometry.js`、`js/common/merge.js`、`js/core/render.js`、`js/core/geometry-coverage.js`、`js/features/io-export.js`、`scripts/lib/*`、`scripts/check-discipline.mjs`、`scripts/check-ngm.mjs`、`docs/engineering.md`。
- 验收：① 公共抽象清单在 commit body 与 §5 更新；② 8 种导出 golden 字节不变；③ selftest 断言数不减少、e2e 全绿；④ 产物体积只减不增（实测体积写入 commit）；⑤ 每条抽象标注影响调用方。
- 依赖：N-22～N-24（性能重构先落地，避免重复抽象）。
- 风险：抽公共层可能引入隐式行为变化；必须“纯搬移”提交并保持全局函数名/签名。
- 预估：8～10 人时。数据属性：静态可判定 + 体积实测。

## 4. 跨审计去重映射

| 缺陷 | 审计来源（重复发现合并） | 任务 |
|---|---|---|
| PDF 导入底图丢失 | audit-core P0-1 / T-1；audit-io P0-1 | N-03 |
| 导出可见性口径 | audit-io P1-1；audit-core P1-2 / T-3 | N-05 |
| 草稿/校准烘进导出 | audit-core P1-2 / T-3；audit-io P1-1 | N-05 |
| 场地静默删除 / 本地清空失效 / 楼层墓碑 | audit-runtime P0-01、P0-03、P1-10 | N-04 |
| 快照差异与恢复 | audit-runtime P1-09、P2-01～P2-05；audit-core P2-8 | N-21 |
| 协作断线 / 楼层广播 | audit-runtime P1-01、P1-02 | N-16 |
| 协作冲突不可见 / 跨工程串线 | audit-runtime P1-03、P1-04 | N-17 |
| 插件沙箱逃逸 | audit-runtime P0-02、P2-20 | N-02 |
| 插件写入不可撤销 / 定时器逃逸 | audit-runtime P1-05、P1-06 | N-18 |
| 导出注入（颜色/DXF 图层/符号 A） | audit-io P1-3、P2-26；audit-gates P1-4 | N-10 |
| 仿射/扇形几何失真 | audit-core P1-6、P1-7 | N-12、N-13 |
| 边界防护（切变/zoom/顶点/循环） | audit-core P1-8、P1-9、P2-3、P2-4 | N-14 |
| 覆盖率高口径分裂 | audit-core P2-5～P2-7；audit-io §6.5 | N-20 |
| 瞬时态泄漏 / focusin 历史累积 | audit-runtime P1-07、P2-11、P2-12；audit-core T-8 | N-15、N-19 |
| 文档数字冲突 | audit-docs S1-S6、D01-D26 | N-25 |
| 门禁假绿 | audit-gates P0-1、P0-2、P1-5；audit-docs S1/D03/D22 | N-01 |
| SW 更新失败删旧缓存 / PDF inflate 炸弹 / CSS 未闭合 | audit-gates P1-2、P1-3、P1-1 | N-01（SW）、N-03（PDF）、N-26（CSS 门禁） |

## 5. 本计划新增/调整的公共抽象（执行时必须在 commit body 标注影响面）

| 抽象 | 归属任务 | 说明 |
|---|---|---|
| `stampObjects(ids)` | N-06 | 统一对象 `updatedAt` 打点，覆盖拖动/旋转/批量属性 |
| `effectiveVisible(o)` / `exportScope(o, mode)` | N-05 | 画布与 8 种导出的唯一可见性判断源 |
| `normalizeExportColor` / `dxfSanitizeName` | N-10 | 导出层颜色白名单与 DXF 名称清洗 |
| `affineShapeTransform(M, shape)` | N-12 | 对象与场地共用的仿射形状求解（SVD/极分解） |
| `sectorArcRange(shape)` | N-13 | 画布/SVG 共用的扇形扫角归一 |
| `coverageCellPlan` / `regionMetric` | N-20 | 覆盖率统计、图表、优化器共用的格数与面积口径 |
| `resetTransientInteractionState(opts)` | N-15 | 载入/切层/撤销/回滚/合并统一瞬态复位 |
| `mergeFloorMeta` 扩充字段 | N-04 | `siteDeleted`/`siteCleared` 计入冲突统计与历史判定 |
| `scripts/lib/*` | N-27 | CSS/MJS 结构解析、facts 校验、golden 对比的公共门禁库 |

约束：新增抽象前先检索现有实现（`objectIndexById`、`outlineOf`、`siteBounds`、`ensureVendor`、`esc/xmlEscape`、`objectNameScopeFor`、`coverageGridPlan` 等），禁止复制粘贴；改变签名必须保留旧重载或显式列出受影响调用方。

## 6. 待拍板取舍（执行到对应任务时必须先停下列出选项，不得自行决定）

1. **N-01 SW 版本基线形式**：提交入库的 `sw-inputs.sha256`（实现简单、合并易冲突）还是构建期生成（无冲突、但需保持运行时版本号可读）。默认建议前者，需确认。
2. **N-05 台账隐藏图层口径**：保留全量台账并让「显示」列反映有效可见（不动表头），还是过滤台账（会改变行数语义）。默认建议保留全量、不新增列，需确认。
3. **N-17 频道隔离位置**：`projectId` 只进消息体（不破坏旧邀请串）还是同时进频道名（隔离更强、旧邀请串失效）。默认建议只进消息体 + 旧串迁移提示，需确认。
4. **N-24/既有硬标准的适用性**：20 条含照片历史 heapUsed 下降 ≥50%、单次撤销 <100 ms 是否继续作为本期门禁。默认沿用，需确认无异议。

## 7. 未实测 / 未验证与本期不纳入项

### 7.1 必须明确标注「未实测/待验证」的项

| 项 | 状态 | 原因与所需条件 |
|---|---|---|
| 浏览器性能基线（拖动/选中/快照） | 未实测 | 本轮未跑 Playwright Chromium；须按 §Phase 2 采集方法执行后回填 |
| 双设备 WebRTC 真机 | 未实测 | 无第二台真机/同网条件；不得用双标签页结果冒充 |
| 快照差异人工误报率（50 条人工样本） | 未验证 | 无人工标注语料；不得用构造样本冒充 |
| 真实工程 PDF/大图导入回归 | 未验证 | 仓库内无脱敏真实工程；需用户提供样例 |
| 低端移动设备真机帧率/首屏 | 未实测 | 仅有 Chromium 移动模拟数据，真机未测 |
| 英文术语语义质量 | 未验证 | 需母语/业务方评审 |
| 覆盖率优化器搜索耗时（5000×5000） | 未实测 | 审计为估算（约 90M 次判定）；N-20 必须实测 |
| 门禁 i18n 46.16% | 审计实测（2026-11-07） | 本计划未复跑；执行时以当次输出为准 |

### 7.2 本期不纳入的 P2 清单（记录归属，避免丢失；不得写成已完成）

- 安全/健壮性：`loadProject` 的 settings 原型键未过滤（`persistence.js:922`）、图片 readback 失败静默（`persistence.js:270-272`）、模态 Promise 挂起（`common.js:474-489`）、`t.color` 直接 innerHTML（`io-import.js:47-115`）、调试全局 `window.PlotPin` 可写。
- 表格/导出低频项：CSV 表头未按引号规则转义、CSV 换行、TSV 在 Excel 前导零、`guardFormula` 撤销入口、角度格式、`bool`/`trim` 特殊值、PDF 列宽固定、GeoJSON 忽略旋转、PNG 页脚角标、DXF 图层色索引、SITE 碰撞、DXF 单位、bulge 圆判定、DXF trim、XLSX >50,000 行静默截断、JSON 导出中途置 `state.exporting`。
- 规则/覆盖率高阶项：未配置间距阈值、多边形仅 OBB、边界容差两套、覆盖率画布缓存 OOM。
- 尺寸/性能上限：单对象合并无上限、XLSX/JSON 大文件上限、`settle` 上限未实测。

以上各条只作为 backlog 登记；排期在 N-27 完成后按「安全 > 数据正确 > 性能 > 体验」重新评估，未经实测不得写进任何完成报告。

