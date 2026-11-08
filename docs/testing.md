# 测试体系（Testing）

> 本文描述**当前真实存在**的测试结构、判据与空白；不把「计划要加」写成「已有」。
> 工程门禁与阈值的唯一事实来源是 [engineering.md](engineering.md)，性能数据见 [performance.md](performance.md)。
>
> 本轮核对：2026-11-08，`node scripts/selftest.mjs`、`node scripts/selftest.mjs --list`、
> `node node_modules/@playwright/test/cli.js test --list`。数量类指标汇总于 [facts.md](facts.md)，本文只描述结构与覆盖，不写「大约」。

---

## 1. 四层结构

| 层 | 入口 | 运行环境 | 规模（2026-11-08） | 是否在 CI |
|---|---|---|---|---|
| 逻辑自测 | `scripts/selftest.mjs` | Node（真实 `js/` 源码 + canvas/DOM 桩） | **127 个分区 / 3,456 条断言 / 加载 45 个脚本** | 是（`check.mjs --selftest`） |
| 浏览器 e2e | `scripts/e2e.mjs` → Playwright | 真实 Chromium（headless） | **35 个 spec / 121 个用例**（默认 120 跑 + 1 条件跳过） | 是（独立 `e2e` job；**CI 实际执行未验证**，见 §3.1） |
| 真实浏览器性能 | `scripts/perf-browser.mjs` | Chromium + 真实 Canvas2D（本机为 SwiftShader） | 4 个场景（DPR1 三档 + DPR2 一档） | **否** |
| 门禁自检 | `scripts/check-gates.mjs` | 临时目录整仓副本 | 正面基线 + 12 种人为破坏 | 是 |

三层职责不同，**数据不可互换**：

- selftest 证明「函数/数据/导出字节」正确，但 DOM/Canvas 是桩，不能证明真实渲染；
- e2e 证明「用户路径能走通」，但不能替代逐字节 golden 与大对象性能；
- perf-browser 只采真实浏览器读数，不证明业务正确性；SwiftShader 数据不能当真实 GPU 结论。

缺依赖时的退出码约定：`e2e.mjs` / `perf-browser.mjs` 打印 `[SKIP]` 并 **退 2**（不是 0），因此「跳过」不会伪装成「通过」。

---

## 2. 逻辑自测（selftest）

### 2.1 组织方式

- 单文件 `scripts/selftest.mjs`，按 `section('编号. 主题', async () => { … })` 顺序执行；任一断言失败即计数 + 最后退 1。
- 两种断言原语：`eq(说明, 实际, 期望)`（严格相等/深比较）与 `ok(说明, 条件)`；失败信息包含实际值与期望值。
- 每个分区直接对真实模块调用，不启动浏览器；DOM/Canvas 用最小桩替换，**桩不得改写业务分支**。
- `--list` 只列分区名；`--filter "正则"` 只跑匹配分区；两者都不改变断言语义。
- 分区编号存在复用（实测重复：8、28、32、36、48、53、56、57、63、64、65、66、67、75；其中 57 有 10 个子分区），
  另有未编号的 D-01/D-02 等；**以 `--list` 的输出顺序为准，不要按编号排序**。

新增分区时：先确认没有可复用的既有分区；同一场景的正反例放在同一分区；跨用例公共样本抽到独立辅助模块，避免多份样本漂移。

### 2.2 分区地图（按功能域归组）

| 功能域 | 代表分区（编号） |
|---|---|
| 基础工具/编码 | 0 命名空间、1 几何、2 CRC32、3 ZIP、4 XLSX、5 CSV/TSV、6 XmlLite |
| 资产与导入 | 7 内容寻址、8/8.1 表格批量、28/28.3/29/30/31 台账往返、50 解析器加固、70 导入限值 |
| 场地/几何模型 | 9 场地、11 旧工程迁移、12/17 场地形状、14/15/46 区域形状、19 基点 |
| 编辑与交互 | 20/21 节点、23 精确约束、24/25/33 OSNAP、26 测距、54 方向约束、65 对齐分布、66 编号层级、68 提交判定 |
| 校准与取景 | 39 仿射校准、D-02 校准前置状态机、41 场地节点编辑、47 分层渲染/裁剪 |
| 标注与统计 | 27 面积长度、40/43/44/45 标注开关、63 多楼层汇总 |
| 导出/导入产物 | JSON 往返、导出回导核对、SVG、DXF（含版本审计与高级实体）、PDF（含多页）、单文件发行包、XLSX inlineStr |
| 覆盖率/规则 | 38/48/48.1 覆盖率、57.2–57.9 规则框架与三条规则、57.7 违规 CSV |
| 插件 | 57/57.1 注册点、API 版本化与能力白名单 |
| 协作/存储 | 离线 LWW/墓碑、长消息分块、墓碑增量淘汰、存储 v2 + 楼层 updatedAt、`markDirty`/`dragChanged` 提交协议、版本快照、历史栈共享 |
| 运行环境/安全 | 49 能力探测、56.1 注入路径、69 转义白名单、70 导入事务 |
| UI 语义 | 58 中英切换与无障碍标记、60 焦点管理、D-01 引导、D-03 帮助中心、D-07 加载审计、D-08 保存失败、D-09 标签租约 |
| 领域功能 | 51 布点优化、52 台账 + 二维码编码器、61 停车规划、75/BOM、75.10 图框标题栏、75.11 i18n 模板 |

> 完整分区名单以 `node scripts/selftest.mjs --list` 为准；本表只做导航，不作为清单。

---

## 3. 浏览器 e2e

### 3.1 运行形态

- `playwright.config.mjs`：仅 **Chromium**、`workers: 1`、`fullyParallel: false`、`timeout: 30s`、`expect: 5s`、`retries: 0`、
  headless、`screenshot: only-on-failure`；`webServer` 用 `node scripts/serve.mjs` 起 `http://127.0.0.1:4173`。
- 全局预置 `firstRunSeenStorage`（跳过首次引导），需要引导的用例自行覆盖存储。
- `tests/e2e/helpers/scenes.mjs` 统一构造测试场景，禁止各 spec 各写一份状态样本。
- 1 个条件跳过：协作 soak 用例需 `COLLAB_SOAK=1` 才执行，默认 skip（计入「1 skipped」，不算失败）。
- 仅本机双标签页验证协作链路；**真实双设备 WebRTC 没有自动化覆盖**。
- CI 侧新增 `e2e` job（`npm ci` → `npx playwright install --with-deps chromium` → `node scripts/e2e.mjs`，Node 20 / `ubuntu-latest`）。
  **CI 实际执行未验证**：本机只验证了同一命令在本地 Chromium 下 121 用例通过，无法复现 runner 的网络、系统库与浏览器下载；
  首次接入后的耗时、稳定性与 runner 专属失败以 CI 运行记录为准。所需条件：runner 可访问 npm registry 与 Playwright 浏览器下载源。

### 3.2 用例矩阵（功能域 → spec，数字为 Playwright `--list` 实测）

| 功能域 | spec（用例数） |
|---|---|
| 冒烟/基础交互/加载 | smoke(4)、interaction(2)、load-audit(3)、world-transform(2) |
| 持久化/历史/保存 | persistence(4)、history(6)、history-increment(4)、save-failure(2)、tab-lease(2)、snapshot(7) |
| 协作 | collab(11)（含 1 个 soak 条件跳过） |
| 导出与图面 | pdf-multipage(3)、title-block(1)、export-scope(4)、perf-render(1)、coverage(1) |
| 符号与目录 | symbols(3)、catalog(1) |
| 批量与表格 | batch-annot(2)、batch-layout(2)、table-batch(3) |
| 插件 | plugin-sandbox(15)、plugin-compat(3)、plugin-manifest(2)、rule-plugin(1) |
| 规则 | rules(1) |
| 校准前置 | calibration-precheck(3)（只验入口可用性与提示，不拖手柄） |
| 移动端/离线 | mobile(2)、sw(1) |
| i18n/帮助/引导 | i18n-template(1)、help-center(1)、onboarding(3) |
| 安全 | csp(5) |
| DXF 导入 | dxf-version(4) |

合计 **110** 个用例、**34** 个 spec（逐 spec 计数来自 `playwright test --list`，总计见 [facts.md](facts.md)）。新增 spec 必须更新本表；只增用例不更新表格视为文档债。

### 3.3 常用命令

```text
node scripts/e2e.mjs                       # 全量
node scripts/e2e.mjs tests/e2e/smoke.spec.mjs
node scripts/e2e.mjs --grep "导出"
$env:COLLAB_SOAK='1'; node scripts/e2e.mjs tests/e2e/collab.spec.mjs
```

e2e 产物默认写入 `test-results/`（已被 `.gitignore` 忽略）；**人工验收证据不要放这里**，见 [manual-acceptance.md](manual-acceptance.md)。

---

## 4. Golden 基线

逐字节基线位于 `tests/golden/`，由 selftest 读取比较：

| 文件 | 字节（2026-11-08） | 锁定的内容 |
|---|---|---|
| `fixed-pages.pdf` | 1,128 | PDF 容器/页对象结构（画布 JPEG 由浏览器编码，不在此判据内） |
| `plain-scene.svg` | 4,730 | 无符号工程的 SVG 全量字节 |
| `plain-scene.dxf` | 900 | 无符号工程的 DXF 全量字节 |
| `symbol-scene.svg` | 5,012 | 含符号工程的 SVG 全量字节 |
| `symbol-scene.dxf` | 4,753 | 含符号工程的 DXF 全量字节（折线近似） |
| `legacy-symbols.svg` | 56,839 | 旧符号逐图标 path 几何哈希的汇总输出 |
| `plain-scene.csv` | 619 | 台账 CSV 全量字节（N-26；含 BOM 与表头） |
| `plain-scene.tsv` | 617 | 台账 TSV 全量字节（N-26；含 BOM 与表头） |
| `plain-scene.xlsx` | 9,795 | XLSX 容器字节（N-26；stored ZIP，同输入两次构建一致后才比 golden） |
| `blindspots.geojson` | 769 | 盲区 GeoJSON 全量文本（N-26；含 coverageSpec.version） |
| `plain-scene.png.meta.json` | 36 | PNG 语义基线：签名与 2631×1860 尺寸（N-26；编码字节随浏览器变化，不锁字节） |

- `UPDATE_GOLDEN=1` 可重建 PDF/SVG/DXF/CSV/TSV/XLSX/GeoJSON golden；PNG 语义基线（`plain-scene.png.meta.json`）在 e2e 下用同一环境变量重建。
- **重建 golden 只能用于「确认改动是有意的」**：提交必须说明为什么输出变了、影响哪些导出格式；禁止为了让测试变绿而盲目重建。
- 字节 golden 覆盖 SVG/DXF/PDF/CSV/TSV/XLSX/GeoJSON；PNG 只锁签名与尺寸（浏览器编码字节不稳定），JSON 由 selftest 结构断言覆盖，见 §2.2 的「导出/导入产物」组。
- 无符号工程「导出字节不变」是硬回归项：不新增符号功能时不得改动既有 golden。

---

## 5. 门禁自检（破坏性验证）

`node scripts/check-gates.mjs` 在临时目录复制整仓，先跑正面基线（未破坏副本必须全绿），再构造 12 种「应当失败」的改动，
断言对应门禁非 0 退出且输出命中目标错误关键字：

| # | 破坏 | 期望变红 |
|---|---|---|
| 0 | （正面基线）未破坏副本 | `check.mjs --selftest` / `check-sw.mjs` / `check-plugin-api.mjs` / `check-ngm.mjs` / `badge.mjs --check` / `i18n-scan.mjs --check` 全 0 |
| 1 | 渲染入口注入 4 ms 忙等（平均帧仍达标） | `bench.mjs` P95 |
| 2 | 向 `dist` 产物追加一行 | `build.mjs --check` |
| 3 | 删除 `ngm.json` | `check-ngm.mjs` |
| 4 | 删除 README 断言数锚点 | `badge.mjs --check` |
| 5 | selftest 注入必然失败断言 | `check.mjs --selftest` |
| 6 | 预缓存输入变更但不递增 `sw.js` VERSION | `check-sw.mjs` |
| 7 | UI 模板新增硬编码中文 | `i18n-scan.mjs --check` |
| 8 | `PlotPin` 新增未登记私有键 | `check.mjs --selftest`（API 面真实判据） |
| 9 | `sw.js` VERSION 回退 | `check-sw.mjs` |
| 10 | `css/*.css` 追加未闭合的 `@media`（花括号不配平） | `check.mjs --selftest`（CSS 结构判据） |
| 11 | `contracts/conventions.json` 规则数组清空 | `check-contracts.mjs`（契约结构校验：规则删空即红） |
| 12 | 预缓存输入变更但未 bump `VERSION` 就执行 `--update` | `check-sw.mjs --update`（拒绝生成，需先 bump） |

场景 6/9 的基线是**提交入库**的 `scripts/sw-inputs.sha256`（预缓存输入内容指纹），与 git 工作区状态无关，
干净检出同样生效；bump `VERSION` 后必须运行 `node scripts/check-sw.mjs --update` 刷新清单（未 bump 时 `--update` 会拒绝写入）
（详见 [engineering.md](engineering.md) §3.4 / §3.5）。

---

## 6. 怎么新增一个用例

### 6.1 逻辑自测

1. 在 `scripts/selftest.mjs` 找到对应功能域的分区；没有合适分区时新建 `section('编号. 主题', …)`，编号接在末尾。
2. 用 `eq` / `ok` 写断言；失败信息要能直接看出「实际 vs 期望」。
3. 同时写反例（非法输入、越界、缺字段），只写正例的判据不算完成。
4. `node scripts/selftest.mjs` 全绿后，断言数会变化 → 跑 `node scripts/badge.mjs --check`，按提示同步 README 三处计数锚点。
5. 若改了业务输出，先建/更新 golden，并在 commit body 说明输出差异。

### 6.2 浏览器 e2e

1. 在 `tests/e2e/` 新建或追加 `*.spec.mjs`，场景状态放 `helpers/scenes.mjs`。
2. 只断言用户可见结果（DOM 文本、下载字节、弹窗、错误提示），不要断言内部变量名。
3. 需要固定数据的用例用 `page.route` 拦截外部请求，禁止真实联网。
4. `node scripts/e2e.mjs <spec>` 本地全绿；CI 的 `e2e` job 只跑默认全量，且**实际执行未验证**，所以**不能只依赖 CI 绿**。
5. 更新本文 §3.2 矩阵。

### 6.3 新增判据

见 [engineering.md](engineering.md) §8：必须能单独跑、有读数、配负例、进总闸、写明守什么。

---

## 7. 当前明确空白（已核对，未覆盖不等于已通过）

以下条目在本轮逐项检索 `tests/` 与 `scripts/`，确认**没有对应 e2e 覆盖**；有的由 selftest 部分覆盖，已在括号中标明：

| 空白 | 现状 |
|---|---|
| 停车规划 | 只有 selftest 分区 61（布局/净宽/旋转）；**无 e2e**，无真实图纸样本 |
| 打印 / 二维码 | 无 `window.print` 打印链路 e2e；二维码只有 selftest 编码器与协作邀请串容量提示，**导出二维码图片未被 e2e 校验** |
| 无障碍 | 无 axe/可访问性扫描；只有 selftest 58 的 `aria-*` 标记断言与 e2e 零散 `toHaveAttribute('aria-…')` |
| 多工程库 | `persistence.spec` 覆盖单工程保存/载入；**工程列表的批量管理、跨工程资产隔离无 e2e**（隔离由 selftest 32.1 覆盖） |
| 图片变换手柄 | `calibration-precheck.spec` 只验入口禁用/提示；**拖拽平移/旋转/缩放/切变手柄没有 e2e** |
| TSV / DXF 导入 | 导出链路已由 `export-scope.spec` 的 N-26 用例覆盖（下载内容、隐藏层不进图纸类导出）；**导入**仍只覆盖 DXF（`dxf-version.spec`），TSV 导入无 e2e |
| Firefox / WebKit / Safari | Playwright 仅配 Chromium；Firefox 159 / WebKit 27 只做过 2026-11-07 的人工脚本验证，无回归自动化；Safari 原生未验证 |
| 真实双设备 WebRTC | 只有同机双标签 e2e；跨设备/跨网络未验证（代码固定 `iceServers: []`） |
| 真实 GPU / 低端真机 | perf-browser 在本机为 SwiftShader；真机帧率、长跑内存未验证 |
| 真实图纸语料 | 无 50 组真实工程 A/B 样本，快照差异误报率未完成人工验证 |
| 英文语义质量 | 只有 i18n 覆盖率与「无中文残留」自动扫描，语义正确性需人工审校 |

上表任一空白被补上时，必须同时更新本节、§3.2 矩阵与 [performance.md](performance.md)（如涉及性能读数）。

---

## 8. 测试纪律

- 失败就报失败：禁止放宽断言、删用例、改阈值来变绿；确需调整阈值时按 [engineering.md](engineering.md) §3.3 写旧值/新值/理由/实测。
- 禁止用 mock / 构造数据冒充真实浏览器或真实语料结果；无法执行的项写「未验证」并说明所需条件。
- 新功能必须同时有 selftest 与 e2e 覆盖；只有一处覆盖时在本文 §7 明确登记。
- 测试样本跨用例共享，禁止每个 spec 各造一份不一致的工程状态。
- 断言数量变化必须同步 README 计数锚点与 `scripts/dist-manifest.json`（若产物受影响）。

---

## 9. 功能域 × 层覆盖矩阵（N-26）

> 每一行回答「这个功能域在四层里分别有没有覆盖」。`无覆盖`是明确结论，不等于已通过；分区名以 `selftest.mjs --list` 为准，spec 名以 `tests/e2e/` 文件名为准。

| 功能域 | selftest 分区 | e2e spec | golden |
|---|---|---|---|
| 基础编码 / 文件容器 | 0 命名空间、1 几何、2 CRC32、3 ZIP、4 XLSX、5 CSV/TSV、6 XmlLite | 无覆盖（由 golden + selftest 兜底） | CSV / TSV / XLSX |
| 资产与导入限值 | 7 内容寻址、8/8.1 表格批量、28/28.3/29/30/31 台账往返、50 解析器加固、70 导入限值 | table-batch、load-audit | 无覆盖 |
| 场地 / 几何模型 | 9 场地、11 旧工程迁移、12/17 场地形状、14/15/46 区域形状、19 基点 | interaction、world-transform | 无覆盖 |
| 编辑 / 捕捉 / 撤销 | 20/21 节点、23 精确约束、24/25/33 OSNAP、26 测距、54 方向约束、65 对齐分布、66 编号层级、68 提交判定 | history、history-increment、smoke | 无覆盖 |
| 校准 / 底图 / 取景 | 39 仿射校准、D-02 校准前置状态机、41 场地节点编辑、47 分层渲染/裁剪 | calibration-precheck、world-transform、perf-render | 无覆盖 |
| 标注 / 统计 / 覆盖率 | 27 面积长度、38/48 覆盖率、40/43/44/45 标注开关、63 多楼层汇总 | coverage | GeoJSON |
| 台账 / 批量表格 | 32.1 台账往返、55 导出 | table-batch、batch-annot、batch-layout、catalog | CSV / TSV / XLSX |
| 图纸导出（SVG/DXF/PDF/PNG） | 55 导出、57.7 违规 CSV | export-scope、pdf-multipage、title-block | SVG / DXF / PDF / CSV / TSV / XLSX / GeoJSON / PNG（语义） |
| 持久化 / 历史 / 快照 / 多标签 | 32 存储 v2、57.x 版本快照、历史栈共享 | persistence、snapshot、save-failure、tab-lease | 无覆盖 |
| 协作 / 合并 | 离线 LWW/墓碑、长消息分块、墓碑增量淘汰 | collab（含 1 个 soak 条件跳过） | 无覆盖 |
| 插件 / 规则 | 57/57.1 注册点、57.2–57.9 规则框架、API 版本化 | plugin-sandbox、plugin-compat、plugin-manifest、rule-plugin、rules | 无覆盖 |
| 安全 / 离线 / 移动端 | 49 能力探测、56.1 注入路径、69 转义白名单、70 导入事务 | csp、sw、mobile | 无覆盖 |
| i18n / 帮助 / 引导 | 58 中英切换与无障碍标记、60 焦点管理、D-01 引导、D-03 帮助中心 | i18n-template、help-center、onboarding | 无覆盖 |
| 符号库 | 符号库分区（见 `--list`） | symbols | legacy-symbols.svg |
| 停车 / 布点 / 二维码 | 51 布点优化、52 台账 + 二维码编码器、61 停车规划 | 无覆盖 | 无覆盖 |

新增功能时必须在本表对应行补上覆盖层；新增一行为空时，必须写明「无覆盖」而不是留白。
