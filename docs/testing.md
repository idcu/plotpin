# 测试体系（testing）

> **读者**：要加测试、判断“绿了保证什么”、准备发布验收的开发者。
> **回答**：测试分几层、selftest 与 e2e 各覆盖什么、golden 锁什么、哪些空白明确未覆盖。
> **不回答**：门禁命令与阈值见 [engineering](engineering.md)，性能读数见 [performance](performance.md)，人工验收见 [manual-acceptance](manual-acceptance.md)。
> **原则**：不把“计划要加”写成“已有”；不把“跳过”写成“通过”；不把未跑过的浏览器写成“已支持”。
> **数量口径**：本文只保留结构锚点，当前计数以 [facts](facts.md) 与命令输出为准。最后核对：2026-11-14。

## 1. 四层结构

| 层 | 入口 | 运行环境 | 规模（2026-11-14 记录） | `ci.yml` 定义中的归属（Actions 已运行但红，不作门禁） |
|---|---|---|---|---|
| 逻辑自测 | `scripts/selftest.mjs` | Node（真实 `js/` 源码 + canvas/DOM 桩） | **164 个分区 / 4,254 条断言 / 加载 48 个脚本** | 是（`check.mjs --selftest`） |
| 浏览器 e2e | `scripts/e2e.mjs` → Playwright | 真实 Chromium（headless）；Firefox 5 条核心为非门禁 | **47 个 spec / 176 个用例**（源码入口 175 跑 + 1 条件跳过；dist 172 跑 + 4 跳过） | 本地双入口 2026-11-14 收口全量通过；远端 `e2e` job 仍为 2026-11-13 双入口 matrix 全红，以本地命令为准，见 §3 |
| 真实浏览器性能 | `scripts/perf-browser.mjs` | Chromium + 真实 Canvas2D（本机为 SwiftShader） | 4 个场景（DPR1 三档 + DPR2 一档） | 否（`perf-nightly.yml` schedule 已挂载但 0 次运行；需要时本地手动 `node scripts/perf-browser.mjs`） |
| 门禁自检 | `scripts/check-gates.mjs` | 临时目录整仓副本 | 正面基线 10 条 + 19 种人为破坏 | 是 |

> **Actions 现状（2026-11-13 核查，来源 `gh api`）**：`ci.yml`/`perf-nightly.yml` 已挂载并实际运行——CI 60 次全部失败（`test` 与两个 `e2e` job 为红）、`Perf Nightly` 0 次、`pages-build-deployment` 87 次；**Actions 在跑但全红，不作发布门禁**。发布以本地门禁为准，逐条清单见 [release-checklist](release-checklist.md)。2026-11-14 已修掉 `test` job 缺 `npm ci` 的结构性全红根因（详见 `ci.yml` 注释），但修复后的 Actions 尚未复跑核对，在拿到新的运行记录前不改变「以本地为准」的结论。

四层职责不同，**数据不可互换**：

- selftest 证明“函数/数据/导出字节”正确，但 DOM/Canvas 是桩，不能证明真实渲染；
- e2e 证明“用户路径能走通”，但不能替代逐字节 golden 与大对象性能；
- perf-browser 只采真实浏览器读数，不证明业务正确性；SwiftShader 数据不能当真实 GPU 结论；
- check-gates 证明“判据本身会红”，不证明产品功能。

缺依赖时的退出码约定：`e2e.mjs` / `perf-browser.mjs` 打印 `[SKIP]` 并**退 2**（不是 0），因此“跳过”不会伪装成“通过”。

## 2. 逻辑自测（selftest）

### 2.1 组织方式

- 单文件 `scripts/selftest.mjs`，按 `section('编号. 主题', async () => { … })` 顺序执行；任一断言失败即计数 + 最后退 1。
- 两种断言原语：`eq(说明, 实际, 期望)`（严格相等/深比较）与 `ok(说明, 条件)`；失败信息包含实际值与期望值。
- 每个分区直接对真实模块调用，不启动浏览器；DOM/Canvas 用最小桩替换，**桩不得改写业务分支**。
- `--list` 只列分区名；`--filter "正则"` 只跑匹配分区；两者都不改变断言语义。
- 分区编号存在复用（历史实测重复：8、28、32、36、48、53、56、57、63、64、65、66、67、75；其中 57 有 10 个子分区），另有未编号的 D-01/D-02 等；**以 `--list` 的输出顺序为准，不要按编号排序**。
- 新增分区时：先确认没有可复用的既有分区；同一场景的正反例放在同一分区；跨用例公共样本抽到独立辅助模块，避免多份样本漂移。

### 2.2 分区地图（按功能域归组）

| 功能域 | 代表分区（编号） |
|---|---|
| 基础工具/编码 | 0 命名空间、1 几何、2 CRC32、3 ZIP、4 XLSX、5 CSV/TSV、6 XmlLite |
| 资产与导入 | 7 内容寻址、8/8.1 表格批量、28/28.3/29/30/31 台账往返、50 解析器加固、70 导入限值 |
| 场地/几何模型 | 9 场地、11 旧工程迁移、12/17 场地形状、14/15/46 区域形状、19 基点 |
| 编辑与交互 | 20/21 节点、23 精确约束、24/25/33 OSNAP、26 测距、54 方向约束、65 对齐分布、66 编号层级、68 提交判定 |
| 校准与取景 | 39 仿射校准、D-02 校准前置状态机、41 场地节点编辑、47 分层渲染/裁剪/局部补绘（`patchUnionRect`、`applyPatchRect`） |
| 标注与统计 | 27 面积长度、40/43/44/45 标注开关、63 多楼层汇总 |
| 导出/导入产物 | JSON 往返、导出回导核对、SVG、DXF（含版本审计与高级实体）、PDF（含多页）、单文件发行包、XLSX inlineStr |
| 覆盖率/规则 | 38/48/48.1 覆盖率、57.2–57.9 规则框架与三条规则、57.7 违规 CSV |
| 插件 | 57/57.1 注册点、API 版本化与能力白名单 |
| 协作/存储 | 离线 LWW/墓碑、长消息分块、墓碑增量淘汰、存储 v2 + 楼层 updatedAt、`markDirty`/`dragChanged` 提交协议、版本快照、历史栈共享、M2 配置差异统计、协作安全默认（39.13b：权限告知 / 跨设备首快照确认 / 200ms 接收节流 / 撤销栈隔离） |
| 运行环境/安全 | 49 能力探测、56.1 注入路径、69 转义白名单、70 导入事务 |
| UI 语义 | 58 中英切换与无障碍标记、60 焦点管理、D-01 引导、D-03 帮助中心、D-07 加载审计、D-08 保存失败、D-09 标签租约 |
| 领域功能 | 51 布点优化、52 台账 + 二维码编码器、61 停车规划、75/BOM、75.10 图框标题栏、75.11 i18n 模板、V-5 参照版（标定判定/三类差异/清除无痕）、M1 polygon 面积/命中/边界 |

> 完整分区名单以 `node scripts/selftest.mjs --list` 为准；本表只做导航，不作为清单。

## 3. 浏览器 e2e

### 3.1 运行形态与浏览器边界

- `playwright.config.mjs`：默认仅 **Chromium**、`workers: 1`、`fullyParallel: false`、`timeout: 30s`、`expect: 5s`、`retries: 0`、headless、`screenshot: only-on-failure`；`webServer` 用 `node scripts/serve.mjs` 起 `http://127.0.0.1:4173`。`projects` 由 `E2E_BROWSER` 决定（默认 `chromium`，可选 `firefox`），不会默认双跑。
- `scripts/e2e.mjs` 校验目标浏览器二进制：`node scripts/e2e.mjs --browser=firefox …` 缺二进制时打印 `[SKIP]` 并**退 2**，不会退 0。Firefox 只是可复跑入口，**不进 `npm run ci`、不进默认 e2e、不构成支持承诺**；三态证据见 §3.4。
- 全局预置 `firstRunSeenStorage`（跳过首次引导），需要引导的用例自行覆盖存储。
- `tests/e2e/helpers/scenes.mjs` 统一构造测试场景，禁止各 spec 各写一份状态样本。
- 1 个条件跳过：协作 soak 用例需 `COLLAB_SOAK=1` 才执行，默认 skip（计入“1 skipped”，不算失败）；已按开关单独跑过（1 passed / 5.1m）。dist 入口共 4 条 skip：协作 soak 1 条 + `sw.spec` 1 条 + `sw-atomic.spec` 2 条（单文件发行版无 SW 预缓存输入）。
- **三条跑法，全量 47 个 spec**：
  - 源码入口：`node scripts/e2e.mjs`（webServer 直接服务仓库根，`http://127.0.0.1:4173/index.html`）。
  - dist 入口：`E2E_PORT=4174 E2E_ENTRY=dist node scripts/e2e.mjs`。`serve.mjs` 在该模式下把 `/` 与 `/index.html` 映射到 `dist/plotpin-standalone.html`（其余路径仍按仓库解析，残留外链会 404 暴露）；`E2E_PORT` 同时决定 Playwright `baseURL` 与静态服务器端口，避免复用 4173 上的源码服务器。
  - `file://` 入口：`file-dist.spec` 不经过 webServer，直接 `page.goto(file:///…/dist/plotpin-standalone.html)`，覆盖导入图片/PDF 底图、比例预设、新增点位与画区域、导出 PDF 与 CSV 清单；它同时出现在上面两套里（与入口无关），不额外增加门禁命令。
- 2026-11-14 收口全量实跑：源码入口 **175 passed / 0 failed / 1 skipped**，exit 0（4.4m / 266s）；dist 入口 **172 passed / 0 failed / 4 skipped**，exit 0（3.5m / 208s）；`COLLAB_SOAK=1` 单独跑协作浸泡 **1 passed / 0 failed（5.1m / 305s，exit 0）**。跳过项与原因见 [release-checklist](release-checklist.md) 第 5/6 条，日志在 `2026-11-14/final-closure/work/e2e-source-full.log`、`e2e-dist-full.log`、`e2e-soak.log`。
- **M6 局部补绘的 3 条像素采样用例**（`tests/e2e/perf-render.spec.mjs`）：对象位移、放大、编辑 A 后 B 的标签仍在。改前分别红在 `atNew`、`inside1`、`after=0`（且 `patched=true`，证明缺陷发生在局部补绘路径而非被整层重建掩盖），改后绿。覆盖只到属性面板 `commitObjectEdit` 路径；拖拽期走整层重建，未覆盖。
- `file://` 与 http 的历史实测差异（Chromium）：
  - **IndexedDB 可用**（`readwrite-ok`），`localStorage` 可用，自动保存与工程恢复与 http 一致；
  - **下载可触发**：PDF 与 CSV 都能拿到 `download` 事件与完整文件；
  - **CSP 内联哈希生效**：dist 只有 1 条 `sha256`，注入的第二段内联脚本被拦；
  - **Service Worker 不注册**：产品按协议显式关闭（`detectCapabilities` 的 `sw=false`），不尝试注册、无报错；PWA 安装与预缓存只对源码多入口成立，这是设计边界而非缺陷。
  - 唯一环境差异是 SW/PWA，其余能力与 http 相同；未发现 `file://` 专属产品缺陷。
- e2e 只用同机双标签页验证协作链路；**真实双设备/跨网络 WebRTC 仍无 e2e**。协作安全默认（连接时告知完整编辑权、跨设备首快照确认、200ms 接收节流、撤销栈隔离）由 selftest 39.13b 常驻断言覆盖，但它是 Node 桩，不等于真实 DataChannel 行为。
- **跨浏览器口径**：当前只有 Chromium 入口与证据。旧文档曾记录 Firefox 全量通过及一组测试侧判定调整（CSP 文案、`backgroundImage` 的 `initial|none`、CDP 堆测量 skip 等），这些记录**未在本次重写中复跑，仓库内也没有留存运行产物**，因此按“历史记录、未验证”处理；WebKit on Windows 旧记录为进程级崩溃，不作支持目标；Safari 未验证。

### 3.2 用例矩阵（功能域 → spec，数字为历史 `--list` 记录）

| 功能域 | spec（用例数） |
|---|---|
| 冒烟/基础交互/加载 | smoke(4)、interaction(3)、load-audit(6)、world-transform(2) |
| 持久化/历史/保存 | persistence(4)、history(7)、history-increment(4)、save-failure(2)、tab-lease(4)、snapshot(7)、project-copy(4)、undo-coverage(3) |
| 协作 | collab(16)（含 1 个 soak 条件跳过） |
| 导出与图面 | pdf-multipage(7)、pdf-dpi(1)、pdf-vector-option(1)、title-block(1)、export-scope(4)、perf-render(4：基线 + 位移/放大/编辑 A 后 B 标签)、coverage(3)、publish-state(2) |
| 符号与目录 | symbols(3)、catalog(2) |
| 批量与表格 | batch-annot(3)、batch-layout(2)、table-batch(4) |
| 导入加固 | import-errors(4) |
| 插件 | plugin-sandbox(23)、plugin-compat(3)、plugin-manifest(3)、rule-plugin(1) |
| 规则 | rules(3) |
| 校准/比例/命中 | calibration-precheck(3)、scale-preset(3)、hit-lock(2) |
| 移动端/离线/file:// | mobile(2)、sw(1)、sw-atomic(2)、file-dist(3) |
| i18n/帮助/引导 | i18n-template(1)、help-center(1)、onboarding(3) |
| 安全 | csp(5) |
| DXF 导入 | dxf-version(4) |
| 界面加固 | ui-hardening(4)、ghost(1)（幽灵参考层：会话级、不进 state/JSON） |
| 修订对比 | rev-compare(1)（参照版导入、三类差异标识、闪烁开关、标定不一致提示、清除/切工程无痕） |

合计 **176** 个用例、**47** 个 spec（源码入口默认 175 跑 + 1 条件跳过；dist 入口 172 跑 + 4 跳过）。逐 spec 计数以 `playwright test --list` 为准；新增 spec 必须更新本表，只增用例不更新表格视为文档债。

### 3.3 常用命令

```text
node scripts/e2e.mjs                       # 全量（默认 Chromium）
node scripts/e2e.mjs tests/e2e/smoke.spec.mjs
node scripts/e2e.mjs --grep "导出"
node scripts/e2e.mjs --browser=firefox tests/e2e/smoke.spec.mjs -g "页面加载"   # 非门禁
$env:COLLAB_SOAK='1'; node scripts/e2e.mjs tests/e2e/collab.spec.mjs
```

e2e 产物默认写入 `test-results/`（已被 `.gitignore` 忽略）；**人工验收证据不要放这里**，见 [manual-acceptance](manual-acceptance.md)。

### 3.4 Firefox 三态矩阵（2026-11-14，非门禁）

> 结论只覆盖本机跑过的那几条；未跑的写“未验证”，不写“应该支持”。Firefox 入口不升格为门禁，也不构成支持承诺。

命令模板（5 条核心）：

```text
node scripts/e2e.mjs --browser=firefox tests/e2e/smoke.spec.mjs tests/e2e/symbols.spec.mjs tests/e2e/export-scope.spec.mjs tests/e2e/collab.spec.mjs tests/e2e/onboarding.spec.mjs -g "页面加载：无脚本错误|JSON 仅导出当前工程|PNG 导出语义 golden|双标签建连与状态|首次访问展示三步引导"
```

| 场景 | 状态 | 日期 | 证据 |
|---|---|---|---|
| 页面启动（无脚本错误 / CSP / 画布就绪） | 实测通过 | 2026-11-14 | firefox 997ms（`backup/D3/firefox-run.log`） |
| 导入 JSON（符号包只写入当前工程） | 实测通过 | 2026-11-14 | firefox 1.4s |
| 导出 PNG（签名 + 尺寸语义 golden） | 实测通过 | 2026-11-14 | firefox 1.0s |
| 同机双标签协作（等待 → 已连接 → 对端断开） | 实测通过 | 2026-11-14 | firefox 4.4s |
| 首次引导（三步引导 + 持久化） | 实测通过 | 2026-11-14 | firefox 1.0s |
| 其余 163 条用例（含 WebRTC 跨 context、PDF/DXF、插件沙箱、SW） | 未验证 | 2026-11-14 | 本轮只跑 5 条核心，未跑不等于通过 |
| 真实文件保存到磁盘、打印、Safari/WebKit | 未验证 | 2026-11-14 | 缺真机/外部软件；WebKit on Windows 旧记录为进程级崩溃 |
| 已知不可用 | 无（本机 5 条未暴露） | 2026-11-14 | 仅说明这 5 条没踩到，不代表全量可用 |

## 4. Golden 基线

逐字节基线位于 `tests/golden/`，由 selftest 读取比较：

| 文件 | 锁定的内容 |
|---|---|
| `fixed-pages.pdf` | PDF 容器/页对象结构（画布 JPEG 由浏览器编码，不在此判据内） |
| `plain-scene.svg` | 无符号工程的 SVG 全量字节 |
| `plain-scene.dxf` | 无符号工程的 DXF 全量字节 |
| `symbol-scene.svg` | 含符号工程的 SVG 全量字节 |
| `symbol-scene.dxf` | 含符号工程的 DXF 全量字节（折线近似） |
| `legacy-symbols.svg` | 旧符号逐图标 path 几何哈希的汇总输出 |
| `plain-scene.csv` | 台账 CSV 全量字节（含 BOM 与表头） |
| `plain-scene.tsv` | 台账 TSV 全量字节（含 BOM 与表头） |
| `plain-scene.xlsx` | XLSX 容器字节（stored ZIP，同输入两次构建一致后才比 golden） |
| `blindspots.geojson` | 盲区 GeoJSON 全量文本（含 `coverageSpec.version`） |
| `plain-scene.png.meta.json` | PNG 语义基线：签名与尺寸（编码字节随浏览器变化，不锁字节） |

字节数不在此复制，用命令查看：

```powershell
Get-ChildItem tests/golden | Select-Object Name, Length
```

- 重建需要**两个变量同时为 1**：`UPDATE_GOLDEN=1`（明确要重建）+ `ALLOW_GOLDEN=1`（确认已审阅差异）；`CI` 环境下一律不可写。判定集中在 `scripts/lib/golden.mjs`，缺任一条件时 selftest / e2e 会以「拒绝更新基线（原因）」判红，而不是静默写盘。
- 重建覆盖 PDF/SVG/DXF/CSV/TSV/XLSX/GeoJSON；PNG 语义基线在 e2e 下用同一组变量重建。每次写入会打印差异摘要并追加到 `test-results/golden-change.log`，便于追查基线变更。
- **重建 golden 只能用于“确认改动是有意的”**：提交必须说明为什么输出变了、影响哪些导出格式；禁止为了让测试变绿而盲目重建。
- 字节 golden 覆盖 SVG/DXF/PDF/CSV/TSV/XLSX/GeoJSON；PNG 只锁签名与尺寸（浏览器编码字节不稳定），JSON 由 selftest 结构断言覆盖。
- 无符号工程“导出字节不变”是硬回归项：不新增符号功能时不得改动既有 golden。

## 5. 门禁自检（破坏性验证）

`node scripts/check-gates.mjs` 在临时目录复制整仓，先跑正面基线（10 条，未破坏副本必须全绿），再构造 19 种“应当失败”的改动，断言对应门禁非 0 退出且输出命中目标错误关键字。完整表见 [engineering](engineering.md)§4.4；关键点：

- 场景 14～17 专测新增结构判据：`replaceState` 外直赋值、未登记跨层调用、未分类软调用、缺失必需钩子；任何一条“破坏后仍绿”都说明判据失效。
- 场景 6/9 的基线是**提交入库**的 `scripts/sw-inputs.sha256`（预缓存输入内容指纹），与 git 工作区状态无关，干净检出同样生效；
- bump `VERSION` 后必须运行 `node scripts/check-sw.mjs --update` 刷新清单（未 bump 时 `--update` 会拒绝写入）；
- 一条从未红过的判据不算成立；新增判据必须配可构造的负例。

## 6. 怎么新增一个用例

### 6.1 逻辑自测

1. 在 `scripts/selftest.mjs` 找到对应功能域的分区；没有合适分区时新建 `section('编号. 主题', …)`，编号接在末尾。
2. 用 `eq` / `ok` 写断言；失败信息要能直接看出“实际 vs 期望”。
3. 同时写反例（非法输入、越界、缺字段），只写正例的判据不算完成。
4. `node scripts/selftest.mjs` 全绿后，断言数会变化 → 跑 `node scripts/badge.mjs` 同步 README 三处计数锚点，并核对 facts/testing/engineering/modules 锚点。
5. 若改了业务输出，先建/更新 golden，并在 commit body 说明输出差异。

### 6.2 浏览器 e2e

1. 在 `tests/e2e/` 新建或追加 `*.spec.mjs`，场景状态放 `helpers/scenes.mjs`。
2. 只断言用户可见结果（DOM 文本、下载字节、弹窗、错误提示），不要断言内部变量名。
3. 需要固定数据的用例用 `page.route` 拦截外部请求，禁止真实联网。
4. `node scripts/e2e.mjs <spec>` 本地全绿；**没有可依赖的 CI 兜底**，所以必须本地双入口各跑一遍，不能只跑单 spec。
5. 更新本文 §3.2 矩阵与 [facts](facts.md) 的 spec 计数。

### 6.3 新增判据

见 [engineering](engineering.md)§9：必须能单独跑、有读数、配负例、进总闸、写明守什么。

## 7. 当前明确空白（未覆盖不等于已通过）

以下条目在本轮逐项检索 `tests/` 与 `scripts/`，确认**没有对应 e2e 覆盖**；有的由 selftest 部分覆盖，已在括号中标明：

| 空白 | 现状 |
|---|---|
| 停车规划 | 只有 selftest 分区 61（布局/净宽/旋转）；**无 e2e**，无真实图纸样本 |
| 打印 / 二维码 | 无 `window.print` 打印链路 e2e；二维码只有 selftest 编码器与协作邀请串容量提示，**导出二维码图片未被 e2e 校验** |
| 无障碍 | 无 axe/可访问性扫描；只有 selftest 58 的 `aria-*` 标记断言与 e2e 零散 `toHaveAttribute('aria-…')` |
| 多工程库 | `persistence.spec` 覆盖单工程保存/载入；**工程列表的批量管理、跨工程资产隔离无 e2e**（隔离由 selftest 32.1 覆盖） |
| 图片变换手柄 | `calibration-precheck.spec` 只验入口禁用/提示；**拖拽平移/旋转/缩放/切变手柄没有 e2e** |
| TSV / DXF 导入 | 导出链路已由 `export-scope.spec` 覆盖；**TSV 导入无 e2e**，DXF 导入只有 `dxf-version.spec` |
| Firefox / WebKit / Safari | **部分验证**。Firefox 2026-11-14 用本机 Playwright Firefox 复跑 5 条核心用例，**5 passed / 11.3s**（命令与逐条读数见 §3.4）；其余 163 条未跑，仍为未验证。WebKit on Windows 旧记录为进程级崩溃，不作支持目标；Safari 原生需 macOS，未验证。Firefox 入口不是门禁，也不是支持承诺 |
| 真实双设备 WebRTC | 只有同机双标签 e2e；跨设备/跨网络未验证（代码固定 `iceServers: []`） |
| 真实 GPU / 低端真机 | perf-browser 在本机为 SwiftShader；真机帧率、长跑内存未验证 |
| 真实图纸语料 | 无 50 组真实工程 A/B 样本，快照差异误报率未完成人工验证 |
| 英文语义质量 | 只有 i18n 覆盖率（按出现次数，2026-11-13 为 44.09% = 731 / 1,658，缺口 0）与“无中文残留”自动扫描；`UI 硬编码 18` 只是全仓未走入口 927 的 UI 子集，语义正确性需人工审校 |
| 静态层局部补绘的边界 | 3 条像素采样只覆盖 **dpr=1 的 headless Chromium** 与**属性面板提交**路径；标签溢出超出 96 px pad 仍可能被擦，dpr=2、拖拽（走整层重建）与真实设备未实测 |
| 状态写入口 / 耦合 / 钩子 | 由 `check.mjs` 9.1～9.4 静态判据与 `check-gates` 场景 14～17 反向验证；**无运行时 e2e**，动态别名、`globalThis[…]` 访问仍可能漏 |
| 插件沙箱导出器权限 | 导出器未声明 `state:read` 时只收到空 `input`，目前是静态核对；无运行期 e2e |

上表任一空白被补上时，必须同时更新本节、§3.2 矩阵与 [performance](performance.md)（如涉及性能读数）。

## 8. 测试纪律

- 失败就报失败：禁止放宽断言、删用例、改阈值来变绿；确需调整阈值时按 [engineering](engineering.md)§4.3 写旧值/新值/理由/实测。
- 禁止用 mock / 构造数据冒充真实浏览器或真实语料结果；无法执行的项写“未验证”并说明所需条件。
- 新功能必须同时有 selftest 与 e2e 覆盖；只有一处覆盖时在本文 §7 明确登记。
- 测试样本跨用例共享，禁止每个 spec 各造一份不一致的工程状态。
- 断言数量变化必须同步 README 计数锚点与相关文档计数锚点。

## 9. 功能域 × 层覆盖矩阵

> 每一行回答“这个功能域在四层里分别有没有覆盖”。`无覆盖`是明确结论，不等于已通过；分区名以 `selftest.mjs --list` 为准，spec 名以 `tests/e2e/` 文件名为准。

| 功能域 | selftest 分区 | e2e spec | golden |
|---|---|---|---|
| 基础编码 / 文件容器 | 0 命名空间、1 几何、2 CRC32、3 ZIP、4 XLSX、5 CSV/TSV、6 XmlLite | 无覆盖（由 golden + selftest 兜底） | CSV / TSV / XLSX |
| 资产与导入限值 | 7 内容寻址、8/8.1 表格批量、28/28.3/29/30/31 台账往返、50 解析器加固、70 导入限值 | table-batch、load-audit | 无覆盖 |
| 场地 / 几何模型 | 9 场地、11 旧工程迁移、12/17 场地形状、14/15/46 区域形状、19 基点 | interaction、world-transform | 无覆盖 |
| 编辑 / 捕捉 / 撤销 | 20/21 节点、23 精确约束、24/25/33 OSNAP、26 测距、54 方向约束、65 对齐分布、66 编号层级、68 提交判定 | history、history-increment、smoke | 无覆盖 |
| 校准 / 底图 / 取景 | 39 仿射校准、D-02 校准前置状态机、41 场地节点编辑、47 分层渲染/裁剪/局部补绘（M6） | calibration-precheck、world-transform、perf-render（M6 像素采样） | 无覆盖 |
| 标注 / 统计 / 覆盖率 | 27 面积长度、38/48 覆盖率、40/43/44/45 标注开关、63 多楼层汇总 | coverage | GeoJSON |
| 台账 / 批量表格 | 32.1 台账往返、55 导出 | table-batch、batch-annot、batch-layout、catalog | CSV / TSV / XLSX |
| 图纸导出（SVG/DXF/PDF/PNG） | 55 导出、57.7 违规 CSV | export-scope、pdf-multipage、title-block | SVG / DXF / PDF / CSV / TSV / XLSX / GeoJSON / PNG（语义） |
| 持久化 / 历史 / 快照 / 多标签 | 32 存储 v2、57.x 版本快照、历史栈共享 | persistence、snapshot、save-failure、tab-lease | 无覆盖 |
| 协作 / 合并 | 离线 LWW/墓碑、长消息分块、墓碑增量淘汰、M2 配置差异、39.13b 协作安全默认（权限告知 / 首快照确认 / 接收节流 / 撤销栈隔离） | collab（含 1 个 soak 条件跳过） | 无覆盖（协作行为由 selftest 39.13b 断言） |
| 插件 / 规则 | 57/57.1 注册点、57.2–57.9 规则框架、API 版本化 | plugin-sandbox、plugin-compat、plugin-manifest、rule-plugin、rules | 无覆盖 |
| 安全 / 离线 / 移动端 | 49 能力探测、56.1 注入路径、69 转义白名单、70 导入事务 | csp、sw、mobile | 无覆盖 |
| i18n / 帮助 / 引导 | 58 中英切换与无障碍标记、60 焦点管理、D-01 引导、D-03 帮助中心 | i18n-template、help-center、onboarding | 无覆盖 |
| 符号库 | 符号库分区（见 `--list`） | symbols | legacy-symbols.svg |
| 停车 / 布点 / 二维码 | 51 布点优化、52 台账 + 二维码编码器、61 停车规划 | 无覆盖 | 无覆盖 |

新增功能时必须在本表对应行补上覆盖层；新增一行为空时，必须写明“无覆盖”而不是留白。
