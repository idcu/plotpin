# 人工验收手册（Manual Acceptance）

> 面向执行人：不需要熟悉代码库，按条目照做即可。
> **事实来源**：[known-issues.md](known-issues.md)。编号、事项与状态以该文件为准；本文只回答「怎么验、怎么记、失败怎么办」。
> 人工验收**不能替代** `npm run ci`、`selftest`、`bench`、`check-gates`；未执行项不得写 PASS。
>
> 条目共 **10 条**：M1–M8 + 补充-01 + A1（可选抽检）。编号不得改动，其它文档按 M1–M8 引用。
> 最近一次归档执行：2026-11-07，见 [manual-acceptance-report-2026-11-07.md](manual-acceptance-report-2026-11-07.md)（历史结论不作现状依据）。

---

## 1. 判定口径

| 结论 | 含义 |
|---|---|
| `PASS` | 本次设备/语料上所有判据均满足，且有证据 |
| `FAIL` | 执行过，至少一条判据不满足（必须写清现象与证据） |
| `BLOCKED` | 条件不满足未能执行（设备/软件/网络/语料缺失），必须写明缺什么 |
| `N/A` | 该项在本次范围不适用（例如 A1 人工抽检无旧工程语料） |

硬规则：

- **没做过的不写 PASS**；`PROXY`（代理数据）单独标注，不得并入 PASS。
- 构造样本、模拟器、CPU 节流、同机双标签、SwiftShader，都不得冒充真机/真语料/跨网络/真实 GPU。
- 每项结论至少能追溯到一项证据：截图、控制台日志、导出文件、Performance 导出或 CAD 截图。
- 结果与 known-issues 冲突时，以 known-issues 为准，并在记录里注明冲突点。

---

## 2. 环境准备

### 2.1 安全上下文（PWA / SW / IndexedDB）

- `http://localhost` / `http://127.0.0.1` 视为安全上下文，**只适用于桌面本机**。
- 手机通过局域网 IP 访问不是安全上下文，不能用于 M1 的 PWA 验收。
- 真机验收必须 HTTPS：把 `dist/plotpin-standalone.html` 部署到 HTTPS 静态站点，或使用 HTTPS 隧道。
- Chrome 的 `chrome://flags/#unsafely-treat-insecure-origin-as-secure` 仅限临时调试，**不得据此记 PASS**；iOS Safari 无等价开关。
- `node scripts/serve.mjs` 只提供 HTTP（默认 `127.0.0.1:4173`），用于桌面调试与 e2e，不能给真机安全上下文。

### 2.2 协作与 `iceServers`

代码固定 `new RTCPeerConnection({ iceServers: [] })`（`js/features/collab.js`），即无 STUN/TURN：

- 同局域网可借助 host candidate 建连；
- 跨网络/跨 NAT 通常无法建连，M3 跨网络部分记 `BLOCKED`，并写明「缺 TURN/STUN」；
- 不得把同机双标签或同局域网结果当成跨网络通过。

### 2.3 软件与语料

| 用途 | 软件 / 语料 | 最低版本 | 备注 |
|---|---|---|---|
| 仓库命令 | Node.js | 18+ | `node scripts/*.mjs` 零依赖；e2e/性能需 Playwright 开发依赖 |
| 桌面 Chromium 系 | Chrome / Edge | 120+ | 基线验证与对照 |
| 桌面 Firefox | Firefox ESR | 128+ | M2 |
| 桌面 Safari | Safari | 17+（macOS 13+） | M2；无 Mac 则 BLOCKED |
| Android 真机 | Chrome | 120+，Android 10+ | M1/M3/M5/M6 |
| iOS 真机 | Safari | 17+，iOS 16+ | M1/M3；需 HTTPS |
| DXF 查看 | AutoCAD / LibreCAD | 2020+ / 2.2+ | M7 |
| 表格软件 | Excel / WPS Office | 2019+ / 11+ | 补充-01 |
| 语料 | 50 组真实工程 A/B 版本 | — | M8；匿名化，禁止提交进仓库 |

### 2.4 证据目录

- 统一放 **`acceptance-evidence/<编号>/`**（已在 `.gitignore` 中，位于 Playwright `outputDir` 之外）。
- 文件名含日期与设备，例如 `acceptance-evidence/M1/M1-20261107-pixel7.png`。
- **不要放 `test-results/`**：Playwright runner 启动时会清空该目录，曾因此丢失人工证据。
- 汇总表可放 `acceptance-evidence/results.md`；证据与语料默认不进 Git。

---

## 3. 逐项验收卡

### M1 真机移动端 PWA（安装 / 离线 / 手势 / 侧栏）

- 设备：Android 10+ + Chrome 120+；或 iPhone iOS 16+ + Safari 17+。桌面仅作对照。
- 前置：HTTPS 安全上下文；已生成 `dist/plotpin-standalone.html`。
- 步骤：
  1. `node scripts/build.mjs` 生成单文件产物并部署到 HTTPS 静态站点；
  2. Android Chrome「安装应用 / 添加到主屏幕」；iOS Safari 分享 →「添加到主屏幕」；
  3. 从主屏幕图标启动；新建工程、放 2 个对象、切一次楼层；
  4. 开飞行模式，杀进程后从图标重开；
  5. 平移/缩放、打开 `☰` 侧栏、点 5 个主要按钮。
- 判据：独立窗口启动；断网重开 **5 秒内**恢复上次工程，无白屏/错误 toast；平移缩放与侧栏可用；主要触控目标 **≥44×44 CSS px**；无未处理控制台异常。
- 证据：安装提示、主屏幕图标、断网重开、控制台截图/日志。
- 失败处理：拿不到 HTTPS/安装入口 → `BLOCKED`；只是浏览器快捷方式而非独立窗口 → `FAIL` 或 `BLOCKED`，不得 PASS。

### M2 桌面 Firefox / Safari 的 SVG 导入、下载、沙箱、PDF

- 设备：Firefox ESR 128+；Safari 17+（macOS 13+）。
- 前置：`localhost` 或 HTTPS；准备含 2 条 `<path>` 的 `sample-symbol.svg`；`plugins/sample-sandboxed.js` 可用。
- 步骤：
  1. 侧栏「符号」→「导入 SVG…」选择文件；在画布放置该符号；
  2. 顶栏「导出」依次导出 SVG / DXF / PDF；
  3. 控制台加载示例沙箱插件：`var s=document.createElement('script');s.src='plugins/sample-sandboxed.js';document.body.appendChild(s);`；
  4. 「导出」下拉确认出现「沙箱 Markdown 清单」并导出；
  5. 点「打印/PDF」看预览。
- 判据：SVG 导入成功且符号可见；三种下载扩展名/文件名正确且字节 >0；沙箱插件注册并导出 `.md`；打印预览页数正确、无空白页；控制台无阻断性异常。
- 证据：每个浏览器一张导入截图、下载文件、控制台截图、打印预览截图。
- 失败处理：Firefox 失败记 `FAIL` 并写错误；**无 macOS 时 Safari 部分记 `BLOCKED`**，不得用 Firefox 或 WebKit 结果代替 Safari 原生结论。

### M3 真实双设备 WebRTC 协作

- 设备：两台设备 + 浏览器 120+；同局域网；跨网络需公网出口与 TURN。
- 前置：两台设备都能打开同一 HTTPS 页面；工程已建好。
- 步骤：
  1. A「协作」→ 生成邀请（二维码或文本）；
  2. B 在另一台设备打开邀请并连入；
  3. A 移动/新增对象，观察 B；
  4. B 断网 10 s，本地改一个对象，再联网；
  5. 双方同时改同一对象的不同字段，观察 LWW；
  6. 跨网络：A/B 接不同网络，重复 1–3。
- 判据（同局域网）：B 在 **2 秒内**看到 A 的增删改；断网重连后能重新同步；无崩溃；冲突按 LWW 且非目标字段不丢。
- 证据：两设备截图、连接状态、断网前后对比、冲突前后对象 JSON。
- 失败处理：同局域网失败记 `FAIL` 并保留双方控制台；**跨网络因无 TURN 记 `BLOCKED`**，写明「缺 TURN/STUN，非产品缺陷结论」。

### M4 英文译文的语义质量

- 设备：桌面 Chrome/Edge/Firefox 120+；一名中英双语评审人。
- 步骤：
  1. 设置 → 界面语言 → English；保存；
  2. 按清单逐页走：新建、导入、导出、楼层、规则、快照、插件、打印；
  3. 记录仍为中文、`{…}` 占位符未替换、截断、术语不一致；
  4. 切回中文复核对应位置。
- 判据：**0 条未翻译**、**0 条残留占位符**；主要流程语义可理解、术语一致；截断不遮挡操作；语义争议逐条记录并给建议译法。
- 说明：自动化只能证明「没有中文残留/缺口」，不能证明语义正确；不得以「键存在/非空」代替语义通过。
- 证据：≥8 张英文界面截图（覆盖主要面板）+ 问题清单（位置/原文/建议）。

### M5 真实 GPU / 低端设备渲染绝对性能

- 设备：目标真机（Android 10+ / iOS 16+）；桌面 Chromium 仅对照。
- 前置：≥2000 对象的工程；设备开启远程调试。
- 步骤：
  1. 记录设备型号、SoC/GPU、系统、浏览器版本；
  2. 100% 缩放连续平移 10 秒；
  3. DevTools Performance / `chrome://inspect` 录制；
  4. 统计缓存帧 P50/P95/P99 与最长帧；
  5. 桌面跑 `npm run perf:browser`，保存 JSON 仅作对照。
- 判据：完成 10 秒录制且**无单帧 >50 ms**；记录 P50/P95/P99 与对象数；出现 >50 ms 长帧即 `FAIL` 并附截图/火焰图。
- 禁止：用 SwiftShader 桌面值或 Node bench 值推断真机通过。
- 证据：设备信息、Performance 导出、P50/P95/P99 表。

### M6 低端设备上的插件 2 s 超时体验

- 设备：低端 Android（2019–2021 中低端，RAM ≤4 GB）或同级设备；Chrome 120+；远程调试。
- 步骤：
  1. 打开页面并保持画布可交互；
  2. 控制台执行：`PlotPin.loadPlugin({id:'manual-timeout',apiVersion:'1.0',capabilities:[],code:'var t=Date.now();while(Date.now()<t+3000){}'})`；
  3. 用 `performance.now()` 记录调用到返回的时间；
  4. 同时尝试平移画布；
  5. 检查插件是否被禁用、导出列表是否已无该插件。
- 判据：主线程不冻结；Promise 约 **2–3 秒**内返回 `{ok:false}`，reason 含「超时」；插件不出现在导出格式；无崩溃。
- 失败处理：无低端机记 `BLOCKED`；桌面 6× CPU 节流结果标 `PROXY`，不得 PASS；若超时后仍可操作，按「UI 未冻结」记录。

### M7 大尺寸符号在真实 DXF 查看器中的观感

- 设备：AutoCAD 2020+ 或 LibreCAD 2.2+。
- 前置：`tests/golden/symbol-scene.dxf`；另从应用导出一份含 2.5 m 球机符号的 DXF。
- 步骤：
  1. CAD 打开 `symbol-scene.dxf`，`ZOOM EXTENTS`；
  2. 检查 S1/S2/S3 位置、旋转、图层；
  3. 打开应用导出的 DXF，用标注工具量 2.5 m 球机外接尺寸；
  4. 放大到 1:1 检查曲线是否明显折线锯齿；
  5. 与 `tests/golden/symbol-scene.svg` 并排比对。
- 判据：无明显断裂/自交/错位；旋转方向与 SVG 一致；2.5 m 符号尺寸误差 **≤1%**；图层名可读；折线近似可接受（K8 明确不还原填充）。
- 失败处理：查看器打不开 ASCII DXF → `BLOCKED` 并写版本；填充缺失不算失败。

### M8 50 条真实图纸快照差异核对

- 设备：桌面 Chrome/Edge 120+；两名熟悉图纸的评审人。
- 前置：50 组真实工程前后版本（不得用构造样本）；匿名化；人工基准在查看应用输出**之前**独立完成。
- 步骤：
  1. 两名评审人各自列出六类差异（新增/删除/属性修改/移动/换楼层/类型变更），分歧由第三人裁定；
  2. 应用内「快照」→ 选 A/B →「对比 A→B」；
  3. 逐类比对应用输出与人工基准，记 TP/FP/FN；
  4. 汇总 50 条。
- 判据（执行前由验收负责人确认并记录）：六类逐类一致率均 **≥95%**；「删除」「换楼层」不得漏报；任一条崩溃/无法对比即 `FAIL`；判据不得与 known-issues 冲突。
- 失败处理：语料不足或无人基准 → **整项 `BLOCKED`**；禁止构造样本补足；部分完成只能记「部分执行，未通过」。

### 补充-01 Excel / WPS 打开导出文件

- 设备：Excel 2019+ / Microsoft 365；WPS 11+。
- 前置：准备含中文、引号、逗号、前导 `=` 的对象名（如 `=1+1`）。
- 步骤：
  1. 把对象名改为 `=1+1`；
  2. 分别导出 `.xlsx` 与 `CSV`；
  3. 用 Excel 与 WPS 打开；
  4. 检查名称是否按文本显示、是否被计算、有无 `#NAME?`、中文/引号/逗号是否完整；
  5. 核对行数与对象数。
- 判据：名称按文本显示、不执行公式、无 `#NAME?`；特殊字符完整；行数一致；两种软件均可打开无崩溃。
- 失败处理：只验证一种软件时结论写「部分通过」；不得用文件头魔数代替真实打开。

### A1 旧工程图标视觉回归（可选抽检）

- 前置：可选一份 C-04 之前导出的旧工程 JSON。
- 步骤：
  1. `node scripts/selftest.mjs --filter "中英界面|符号库"`，确认 A1 相关断言通过（权威判据）；
  2. 若有旧工程 JSON：导入后逐类检查图标非空、可辨认、无错位；
  3. 与 `tests/golden/legacy-symbols.svg` 对照。
- 判据：自动化 0 失败且 golden 逐字节一致；人工部分图标非空、可辨认、无错位。**人工抽检不构成新门禁**。
- 失败处理：无旧工程语料 → 人工部分记 `N/A`，自动化结果照常记录。

---

## 4. 结果回填模板

### 4.1 逐项结果

| 日期 | 执行人 | 编号 | 设备型号 | 操作系统 | 浏览器/软件版本 | 实测值 | 结论 | 证据路径 | 备注（阻塞原因） |
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

### 4.2 汇总

| 编号 | PASS | FAIL | BLOCKED | N/A | 完成日期 | 结论摘要 |
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

## 5. 与自动化门禁的边界

即使 10 条全部 PASS，也只说明「当次设备/语料可用」，不能替代：

- `npm run ci`：`check.mjs --selftest` → `bench.mjs` → `build.mjs --check` → `check-gates.mjs`；
- `node scripts/selftest.mjs`（断言数以当前输出为准）与 `tests/golden/*` 逐字节比对；
- `node scripts/e2e.mjs`（Chromium 自动化）；
- `node scripts/perf-browser.mjs` 的基线（不进 ci，但仍是可重复数据）；
- A1 的 path 哈希与 `legacy-symbols.svg` golden。

### 5.1 当前条件下无法验收（必须 BLOCKED / N/A）

| 项 | 原因 | 补什么 |
|---|---|---|
| M1（iOS） | Windows 环境无 iPhone；且必须 HTTPS | iPhone + iOS 16+ / Safari 17+ + HTTPS |
| M2（Safari） | 无 macOS | Mac（macOS 13+）+ Safari 17+ |
| M3（跨网络） | `iceServers: []`，无 STUN/TURN | STUN/TURN 配置 + 两台不同网络设备 |
| M5 | 只有 Chromium + SwiftShader，无真实 GPU | 目标真机 + Performance 录制 |
| M6 | 无低端真机 | 低端 Android 真机 + 远程调试 |
| M7 | 未安装 CAD | AutoCAD 2020+ / LibreCAD 2.2+ |
| M8 | 无 50 条真实语料与人工基准 | 50 组真实工程 + 两名评审人 + 裁定流程 |
| 补充-01 | 未安装 Excel/WPS | Excel 2019+ / WPS 11+ |
| A1 人工部分 | 无旧工程 JSON | 旧工程 JSON；否则 `N/A` |

### 5.2 与 known-issues 的映射

| 本文编号 | known-issues | 关系 |
|---|---|---|
| M1–M8 | M1–M8 | 本文补充步骤、判据与记录方式；状态以 known-issues 为准 |
| 补充-01 | 未单列 | 本文补充项，不占 M/K 编号，不改变 known-issues |
| A1（抽检） | A1（已关闭/自动化） | 人工仅可选抽检，自动化判据才是权威 |

冲突时以 `docs/known-issues.md` 为准，并在记录中注明，不得自行改号或改状态。
