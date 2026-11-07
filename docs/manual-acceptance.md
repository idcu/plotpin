# 人工验收矩阵（Manual Acceptance Matrix）

> 面向执行人工验收的人：不要求熟悉代码库，按行照做即可。
> **事实来源**：[docs/known-issues.md](known-issues.md)。编号、事项描述与状态以该文件为准；本文只补充"怎么验、怎么记、失败怎么办"。
> 本文不新增功能、不新增门禁阈值、不修改任何自动化判据；**人工验收结果不能替代 `npm run ci`、`selftest`、`bench`、`check-gates`**。

- 适用范围：M 类需人工/真机验证项、需人工确认的导出兼容项、以及已自动化项的**可选抽检**。
- 条目数：**10 条**（M1–M8 共 8 条 + 补充项 1 条 + A1 抽检 1 条）。
- 记录原则：**没做过的验证不得写 PASS**；条件不满足写 `BLOCKED`，不适用写 `N/A`，并写明原因。

---

## 1. 验收矩阵（逐行勾选）

> 勾选标记：`☐` 未执行 → `☑` 已执行。结论只允许 `PASS` / `FAIL` / `BLOCKED` / `N/A`。
> "当前可执行性"一列说明在本仓库 + 当前 Windows 环境下的真实状态，执行前先看这一列。

| 勾选 | 编号 | 验收目标 | 所需设备 / 软件（版本与最低配置） | 前置条件 | 具体操作步骤（可照做） | 通过判据 | 记录方式 | 失败时的降级说明 | 当前可执行性 |
|---|---|---|---|---|---|---|---|---|---|
| ☐ | **M1** | 真机移动端 PWA：安装、离线重开、手势与侧栏可用 | Android 10+ 手机 + Chrome 120+；或 iPhone（iOS 16+）+ Safari 17+。桌面仅用于对照，不作为真机结果 | **HTTPS 安全上下文**（或设备上的 `localhost`）；已构建产物；设备可访问该地址 | 1) `node scripts/build.mjs` 生成 `dist/plotpin-standalone.html`；2) 部署到 HTTPS 静态托管，或在本机 `node scripts/serve.mjs` 后用 `http://127.0.0.1:4173/index.html`（仅桌面 localhost 满足安全上下文）；3) Android Chrome 菜单「安装应用 / 添加到主屏幕」；iOS Safari 分享 →「添加到主屏幕」；4) 从主屏幕图标启动；5) 新建工程、放 2 个对象、切一次楼层；6) 开飞行模式，杀进程后从图标重开；7) 平移/缩放、打开 `☰` 侧栏、点 5 个主要按钮 | 安装后主屏幕出现图标且以独立窗口启动；断网重开 **5 秒内**显示上次工程、无白屏/无错误 toast；平移缩放与侧栏可用；主要触控目标 **≥44×44 CSS px**；无未处理控制台异常 | 在 `test-results/manual-acceptance/M1/` 存：安装提示截图、主屏幕图标截图、断网重开截图、控制台截图/日志；回填 §3 表格 | 若拿不到 HTTPS / 安装入口，记 `BLOCKED`（写明"HTTP 非安全上下文"或"无安装提示"）；若只是"浏览器快捷方式"而非独立窗口，记 `FAIL` 或 `BLOCKED`，**不得记 PASS** | Android 需自备手机 + HTTPS；iOS 需自备 iPhone + HTTPS。当前 Windows 环境**无法**完成 iOS 部分 |
| ☐ | **M2** | 桌面 Firefox / Safari 的 SVG 导入、下载、Worker 沙箱、PDF 打印 | Firefox ESR **128+**；Safari **17+**（需 macOS 13+）。Windows/macOS 桌面；无需真机 | 页面经 `localhost` 或 HTTPS 加载；准备一个只含 2 条 `<path>` 的 `sample-symbol.svg`；准备 `plugins/sample-sandboxed.js` | 1) 打开页面；2) 侧栏「符号」页签 →「导入 SVG…」选择 `sample-symbol.svg`；3) 画布放置该符号；4) 顶栏「导出」依次选 SVG / DXF / PDF 各导出一次；5) 控制台执行：`var s=document.createElement('script');s.src='plugins/sample-sandboxed.js';document.body.appendChild(s);`，等待提示"示例沙箱插件已就绪"；6) 「导出」下拉确认出现「沙箱 Markdown 清单」并导出一次；7) 点「打印/PDF」看预览 | SVG 导入成功且符号可见；三种下载均有文件名/扩展名且字节数 >0；沙箱插件能注册并导出 `.md`；打印预览页数正确、无空白页；控制台无阻断性异常 | `test-results/manual-acceptance/M2/firefox/` 与 `.../safari/`：每个浏览器一张导入结果截图、下载文件、控制台截图、打印预览截图；回填 §3 | 任一浏览器某项失败记 `FAIL` 并写清 API/报错；**Safari 无 Mac 时整项记 BLOCKED**，不得用 Firefox 结果代替 Safari | Firefox：可在当前 Windows 完成；**Safari：当前无 macOS，无法验收 → BLOCKED** |
| ☐ | **M3** | 真实双设备 WebRTC 协作（同局域网 / 跨网络） | 两台设备（手机/电脑均可）+ 各自浏览器 120+；同一局域网 Wi-Fi；跨网络测试另需公网出口 | 两台设备都能打开同一 HTTPS 页面；`js/features/collab.js` 固定 `iceServers: []`（无 STUN/TURN）；工程已建好 | 1) A 打开工程 → 顶栏「协作」→ 生成邀请（二维码或文本）；2) B 用另一台设备打开邀请并连入；3) A 移动/新增对象，观察 B 画面；4) B 断网 10s，本地改一个对象，再联网；5) 双方同时改同一对象的不同字段，观察 LWW 结果；6) 跨网络：A/B 分别接不同网络，重复 1–3 | **同局域网**：B 在 **2 秒内**看到 A 的增删改；断网重连后能重新同步；无崩溃；冲突按 LWW（后写覆盖）且非目标字段不丢 | `test-results/manual-acceptance/M3/`：两设备截图、连接状态截图、断网前后对比、冲突前后对象 JSON 截图；回填 §3 | 同局域网失败记 `FAIL` 并保留双方控制台；**跨网络因 `iceServers: []` 无 TURN，记 `BLOCKED`**（明确写"缺 TURN/STUN，非产品缺陷结论"） | 同局域网需两台真实设备；**跨网络在当前条件下无法验收 → BLOCKED** |
| ☐ | **M4** | 英文译文的语义质量人工评审 | 桌面 Chrome/Edge/Firefox 120+；一名中英双语评审人 | 页面可正常打开；准备主要流程清单（新建、导入、导出、楼层、规则、快照、插件、打印） | 1) 右上「设置」→「界面语言」→ English；2) 按清单逐页走一遍；3) 记录所有仍为中文、占位符 `{…}` 未替换、截断、术语不一致的文案；4) 切回中文复核对应位置 | **0 条未翻译**、**0 条残留占位符**；主要流程文案语义可理解、术语一致；截断不遮挡操作；语义争议逐条记录并给出建议译法 | `test-results/manual-acceptance/M4/`：英文界面截图（≥8 张覆盖主要面板）、问题清单（位置/原文/建议）；回填 §3 | 发现未翻译先记 `FAIL` 并列出位置；语义争议单独列"待产品确认"，不阻断其余流程；不得以"键存在/非空"代替语义通过 | 当前 Windows 桌面即可执行 |
| ☐ | **M5** | 真实 GPU / 低端设备的渲染绝对性能基线 | 一台目标真机（Android 10+ / iPhone iOS 16+）；桌面 Chrome 120+ 仅作对照；`npm run perf:browser` 结果 | 至少一个 **≥2000 对象**的工程（或按 `bench.mjs` 同规模导入）；设备开启开发者工具/远程调试 | 1) 记录设备型号、SoC/GPU、系统、浏览器版本；2) 打开工程，100% 缩放连续平移 10 秒；3) Chrome DevTools Performance 或 Android `chrome://inspect` 录制；4) 统计缓存帧 P50/P95/P99 与最长帧；5) 桌面执行 `npm run perf:browser`，保存 `test-results/perf-browser-baseline.json` 仅作**对照** | 完成 10 秒录制且**无单帧 >50 ms**；记录 P50/P95/P99 与对象数；若出现 >50ms 长帧则 `FAIL` 并附截图/火焰图。**不得**用 SwiftShader 桌面值推断真机通过 | `test-results/manual-acceptance/M5/`：设备信息、Performance 导出文件（`.json`/截图）、P50/P95/P99 表；回填 §3 | 无真机记 `BLOCKED`；桌面 CPU 节流只能标 `PROXY（代理数据）`，不得记 PASS；不得与 bench Node 桩数值混用 | 需自备真机；当前仓库/CI 无真实 GPU → 未执行时 `BLOCKED` |
| ☐ | **M6** | 低端设备上的插件 **2s 超时**行为与体验 | 低端 Android（2019–2021 中低端，RAM ≤4GB）或同级设备；Chrome 120+；远程调试 | 页面可打开；可执行控制台脚本；无需安装依赖 | 1) 打开页面并保持画布可交互；2) 控制台执行：`PlotPin.loadPlugin({id:'manual-timeout',apiVersion:'1.0',capabilities:[],code:'var t=Date.now();while(Date.now()<t+3000){}'})`；3) 用秒表/控制台 `performance.now()` 记录从调用到返回的时间；4) 同时尝试平移画布；5) 检查插件是否被禁用、导出列表是否无该插件 | 主线程不冻结；Promise 在约 **2–3 秒**内返回 `{ok:false}`，reason 含"超时"；插件未出现在导出格式中；无崩溃 | `test-results/manual-acceptance/M6/`：设备信息、返回对象截图、耗时数值、画布响应截图；回填 §3 | 无低端机记 `BLOCKED`；桌面 6× CPU 节流结果只能标 `PROXY`，不得记 PASS；若超时后仍可继续操作，按"UI 未冻结"记录 | 需自备低端真机；当前仅有桌面 Chromium → 未执行时 `BLOCKED` |
| ☐ | **M7** | 大尺寸符号在真实 DXF 查看器中的观感 | AutoCAD 2020+ 或 LibreCAD 2.2+；Windows/macOS 桌面 | 已有基线 `tests/golden/symbol-scene.dxf`（ASCII DXF，单位 mm）；另从应用导出一份含 2.5m 球机符号的 DXF | 1) 用 CAD 打开 `tests/golden/symbol-scene.dxf`，`ZOOM EXTENTS`；2) 检查 S1/S2/S3 三个符号位置、旋转、图层；3) 打开应用导出的 DXF，用标注工具量 2.5m 球机外接尺寸；4) 放大到 1:1 检查曲线是否呈明显折线锯齿；5) 与 `tests/golden/symbol-scene.svg` 并排比对形状 | 符号无明显断裂/自交/错位；旋转方向与 SVG 一致；2.5m 符号实测尺寸误差 **≤1%**；图层名可读；折线近似可接受（K8 明确不还原填充） | `test-results/manual-acceptance/M7/`：CAD 截图（含尺寸标注）、SVG 并排截图、所用 CAD 版本；回填 §3 | 若查看器打不开 ASCII DXF，记 `BLOCKED` 并写查看器版本；填充缺失不算失败（known-issues K8 已声明） | 需自备 CAD；未安装时 `BLOCKED` |
| ☐ | **M8** | **50 条真实图纸快照**的差异分类人工核对 | 桌面 Chrome/Edge 120+；两名熟悉图纸的评审人；50 组真实工程的前后版本 | 50 条真实语料（**不得用构造样本冒充**）；每条有 A/B 两个版本；人工基准在查看应用输出**之前**独立完成；语料匿名化 | 1) 对每条语料，两名评审人先各自列出六类差异（新增/删除/属性修改/移动/换楼层/类型变更），分歧由第三人裁定，形成人工基准；2) 在应用「工程库」打开工程 →「快照」→ 选 A/B →「对比 A→B」；3) 逐类别比对应用输出与人工基准，记 TP/FP/FN；4) 汇总 50 条 | **建议判据（执行前由验收负责人确认并记录）**：六类逐类一致率（precision/recall）均 **≥95%**；「删除」「换楼层」不得出现漏报；50 条中任一条出现崩溃/无法对比即 `FAIL`。判据不得与 known-issues 冲突 | `test-results/manual-acceptance/M8/`：50 条 CSV（编号/各类人工数/应用数/TP/FP/FN/一致率）、双方原始清单、争议裁定记录；回填 §3 | 语料不足 50 条或无人基准 → **整项 `BLOCKED`**；**禁止**用构造样本补足后记 PASS；部分完成只能记"部分执行，未通过" | **当前仓库无真实语料/人工基准 → 无法验收 → BLOCKED** |
| ☐ | **补充-01** | Excel / WPS 打开导出文件（含公式注入防护） | Excel 2019+ 或 Microsoft 365；WPS Office 11+；桌面系统 | 页面可打开；准备一个含中文名、引号、逗号、前导 `=` 的对象名（如 `=1+1`） | 1) 创建对象并把名称改为 `=1+1`；2) 「导出」选 `Excel (.xlsx)` 导出；3) 「导出」选 `CSV` 导出；4) 分别用 Excel 与 WPS 打开；5) 检查单元格：名称是否按文本显示、是否被当公式计算、是否有 `#NAME?`、中文/引号/逗号是否完整；6) 核对行数与对象数 | 名称按**文本**显示、不执行公式、无 `#NAME?`；中文与特殊字符完整；数据行数与对象数一致；两种软件均能打开且无崩溃 | `test-results/manual-acceptance/EXCEL/`：导出文件、Excel 截图、WPS 截图、软件版本；回填 §3 | 未安装 Excel/WPS 记 `BLOCKED`；只验证了其中一种软件时，结论写"部分通过"，不得记为双软件 PASS；不得用文件头魔数代替真实打开 | 需自备 Excel/WPS；未安装时 `BLOCKED` |
| ☐ | **A1（抽检）** | 旧工程 64 图标视觉回归的**可选人工抽检** | 桌面 Chrome/Edge 120+；可选：一份 C-04 之前导出的旧工程 JSON | A1 已由自动化判据关闭（`tests/fixtures/legacy-symbols.json` + `tests/golden/legacy-symbols.svg`）；本行只在有旧工程语料时抽检 | 1) 运行 `node scripts/selftest.mjs`，确认 A1 相关断言通过（这是权威判据）；2) 若手头有旧工程 JSON：导入后逐类看图标是否非空、可辨认、无错位；3) 与 `tests/golden/legacy-symbols.svg` 对照 | 自动化：selftest **0 失败**且 golden 逐字节一致；人工抽检：旧工程图标非空、可辨认、无错位。**人工抽检不构成新门禁** | `test-results/manual-acceptance/A1/`：selftest 输出、旧工程导入截图（如有）；回填 §3 | 无旧工程语料 → 人工部分记 `N/A`，自动化结果照常记录；**不得**因人工抽检通过就声称替代 golden/selftest | 自动化随时可跑；人工部分需旧工程语料，当前仓库未提供 → 无则 `N/A` |

---

## 2. 环境准备

### 2.1 HTTPS / 安全上下文

PWA 安装、Service Worker、IndexedDB 在**非安全上下文**下会被浏览器禁用。判定标准：

- `http://localhost` / `http://127.0.0.1` 视为安全上下文，**仅适用于桌面本机**。
- 通过局域网 IP（如 `http://192.168.1.10:4173`）访问手机，**不是**安全上下文，不能用于 M1 的 PWA 验收。
- 真机验收必须使用 **HTTPS**：把 `dist/plotpin-standalone.html` 部署到组织内 HTTPS 静态站点，或使用 HTTPS 隧道/反向代理。
- Chrome 的 `chrome://flags/#unsafely-treat-insecure-origin-as-secure` 只能作为临时调试；**不得**据此记 M1 PASS。iOS Safari 没有等价开关，必须真 HTTPS。
- 本仓库的 `node scripts/serve.mjs` 只提供 HTTP，默认 `127.0.0.1:4173`，用于桌面 e2e/手工调试；它不能直接给真机提供安全上下文。

### 2.2 WebRTC 与 `iceServers` 为空

- 代码固定 `new RTCPeerConnection({ iceServers: [] })`（见 `js/features/collab.js`），即**没有 STUN/TURN**。
- 后果：同一局域网内可借助 host candidate 建连；**跨网络/跨 NAT 通常无法建连**。
- 因此 M3 的"跨网络"部分在当前条件下只能记 `BLOCKED`，并写明"缺 TURN/STUN"；不得据此得出"协作不可用"的产品结论，也不得把同机双标签或同局域网结果当成跨网络通过。

### 2.3 所需浏览器与桌面软件（建议最低版本）

| 用途 | 软件 | 建议最低版本 | 备注 |
|---|---|---|---|
| 仓库命令 | Node.js | 18+ | `node scripts/*.mjs` 零依赖；e2e/性能需要 Playwright 开发依赖 |
| 桌面 Chromium 系 | Chrome / Edge | 120+ | 基线验证与对照 |
| 桌面 Firefox | Firefox ESR | 128+ | M2 |
| 桌面 Safari | Safari | 17+（macOS 13+） | M2；无 Mac 则 BLOCKED |
| Android 真机 | Chrome | 120+，Android 10+ | M1/M3/M5/M6 |
| iOS 真机 | Safari | 17+，iOS 16+ | M1/M3；需 HTTPS |
| DXF 查看 | AutoCAD / LibreCAD | 2020+ / 2.2+ | M7 |
| 表格软件 | Excel / WPS Office | 2019+ / 11+ | 补充-01 |

### 2.4 图纸语料与人工判定基准（M8）

- 语料：**50 组真实工程**的前后版本，匿名化后放仓库外或 `test-results/manual-acceptance/M8/corpus/`；不得提交进仓库。
- 人工基准：两名评审人**先独立**给出六类差异清单，再比对；分歧由第三人裁定。必须**先完成人工基准，再看应用输出**，避免锚定偏倚。
- 构造样本只能用于功能演示，**不能**用于统计学通过率；不得用构造样本补足 50 条。
- 结果 CSV 字段至少包含：语料编号、类别、人工数量、应用数量、TP、FP、FN、一致率。

### 2.5 证据与目录约定

- 结果汇总：`test-results/manual-acceptance/results.md`（§3 模板）。
- 分项证据：`test-results/manual-acceptance/<编号>/`，文件名含日期与设备，例如 `M1-20261107-pixel7.png`。
- 每个结论必须能追溯到：截图、控制台日志、导出文件、Performance 导出或 CAD 截图至少一项。
- 证据目录与语料默认不进 Git；如需归档，由验收负责人另行决定。

---

## 3. 结果回填模板（可直接复制）

### 3.1 逐项结果表

| 日期 | 执行人 | 编号 | 设备型号 | 操作系统 | 浏览器/软件版本 | 实测值 | 结论 | 证据路径 | 备注（含阻塞原因） |
|---|---|---|---|---|---|---|---|---|---|
|  |  | M1 |  |  |  |  |  |  |  |
|  |  | M2 |  |  |  |  |  |  |  |
|  |  | M3 |  |  |  |  |  |  |  |
|  |  | M4 |  |  |  |  |  |  |  |
|  |  | M5 |  |  |  |  |  |  |  |
|  |  | M6 |  |  |  |  |  |  |  |
|  |  | M7 |  |  |  |  |  |  |  |
|  |  | M8 |  |  |  |  |  |  |  |
|  |  | 补充-01 |  |  |  |  |  |  |  |
|  |  | A1（抽检） |  |  |  |  |  |  |  |

### 3.2 汇总勾选表

| 编号 | PASS | FAIL | BLOCKED | N/A | 已完成日期 | 结论摘要 |
|---|---|---|---|---|---|---|
| M1 真机 PWA | ☐ | ☐ | ☐ | ☐ |  |  |
| M2 跨浏览器 | ☐ | ☐ | ☐ | ☐ |  |  |
| M3 双设备 WebRTC | ☐ | ☐ | ☐ | ☐ |  |  |
| M4 英文译文 | ☐ | ☐ | ☐ | ☐ |  |  |
| M5 真实 GPU 性能 | ☐ | ☐ | ☐ | ☐ |  |  |
| M6 低端机插件超时 | ☐ | ☐ | ☐ | ☐ |  |  |
| M7 DXF 观感 | ☐ | ☐ | ☐ | ☐ |  |  |
| M8 50 条真实快照 | ☐ | ☐ | ☐ | ☐ |  |  |
| 补充-01 Excel/WPS | ☐ | ☐ | ☐ | ☐ |  |  |
| A1 图标抽检 | ☐ | ☐ | ☐ | ☐ |  |  |

---

## 4. 与自动化门禁的边界

### 4.1 即使全部通过，也不能替代自动化门禁

以下人工项全部通过，也只说明"这些场景在当次设备/语料上可用"，**不能**替代：

- `npm run ci`：`check.mjs --selftest`、`bench.mjs`、`build.mjs --check`、`check-gates.mjs`；
- `node scripts/selftest.mjs`（当前 **2678** 条断言）与 `tests/golden/*` 逐字节比对；
- `node scripts/e2e.mjs`（Chromium 自动化 e2e）；
- `node scripts/perf-browser.mjs` 的既有基线（默认不在 `ci` 内，但仍是可重复数据保留）；
- A1 的路径哈希与 `legacy-symbols.svg` golden（人工抽检不能替代）。

未跑上述命令或跑失败时，**不得**用人工验收表声称"全部通过"。

### 4.2 当前条件下无法验收（必须记 BLOCKED，不得暗示已通过）

| 编号 / 子项 | 无法验收的原因 | 需要补什么才能验收 |
|---|---|---|
| M1（iOS 部分） | 当前为 Windows 环境，无 iPhone/iOS 真机；且必须 HTTPS | iPhone + iOS 16+/Safari 17+ + HTTPS 站点 |
| M2（Safari 部分） | 无 macOS，无法运行 Safari 17+ | Mac（macOS 13+）+ Safari 17+ |
| M3（跨网络部分） | `iceServers: []`，无 STUN/TURN，跨 NAT 无法建立 | 可用的 STUN/TURN 服务配置与两台不同网络设备 |
| M5 | 仓库/CI 只有 Chromium + SwiftShader，无真实 GPU | 目标真机 + 远程调试/Performance 录制 |
| M6 | 无低端真机；桌面节流只是代理数据 | 低端 Android 真机 + 远程调试 |
| M8 | 仓库无 50 条真实图纸语料，也无人工作为基准 | 50 组真实工程 + 两名评审人 + 裁定流程 |
| 补充-01 | 未确认执行机安装 Excel/WPS | Excel 2019+/Microsoft 365 或 WPS 11+ |
| M7 | 未确认执行机安装 AutoCAD/LibreCAD | AutoCAD 2020+ 或 LibreCAD 2.2+ |
| A1 人工部分 | 仓库未提供 C-04 前的旧工程 JSON | 旧工程 JSON；否则该项人工部分记 N/A |

> 以上项在条件满足前一律 `BLOCKED` / `N/A`。**不得**用"构造样本""模拟器""CPU 节流""同机双标签"冒充真机、真语料、跨网络或真实 GPU 结果。

---

## 5. 与 known-issues 的映射（以 known-issues 为准）

| 本矩阵编号 | known-issues 编号 | known-issues 状态 | 本文关系 |
|---|---|---|---|
| M1 | M1 | 需人工/真机验证 | 补充操作步骤、判据与记录方式 |
| M2 | M2 | 需人工/真机验证 | 同上；Safari 部分当前 BLOCKED |
| M3 | M3 | 需人工/真机验证 | 同局域网可执行；跨网络 BLOCKED（无 TURN） |
| M4 | M4 | 需人工/真机验证 | 同上 |
| M5 | M5 | 需人工/真机验证 | 只记录真机数据，不设绝对性能通过线 |
| M6 | M6 | 需人工/真机验证 | 同上；桌面节流只作 PROXY |
| M7 | M7 | 需人工/真机验证 | 同上 |
| M8 | M8（原 A4 降级） | 需人工/真机验证 | 同上；无真实语料则 BLOCKED |
| 补充-01 | **未单列**（known-issues 无对应编号） | — | 本文补充的人工确认项，**不占用 M/K 编号**；不改变 known-issues 内容 |
| A1（抽检） | A1 | **已关闭（自动化）** | 人工仅作可选抽检，自动化判据才是权威 |

如本文与 `docs/known-issues.md` 出现冲突，**以 known-issues 为准**，并在验收记录中注明冲突点，不得自行改号或改状态。
