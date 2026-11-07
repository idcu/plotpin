# M 类发布前验收报告（2026-11-07）

> 本报告只记录本次在**当前这台 Windows 机器**上真实执行的结果。
> 未修改业务逻辑、未新增依赖、未改动任何门禁阈值。
> 结论只使用 `通过 / 不通过 / 未验证`；`未验证` 包含环境不满足（原矩阵中的 `BLOCKED`）与需人工评审两类，均写明原因与后续条件。

## 1. 环境信息

| 项 | 实测值 | 来源 |
|---|---|---|
| 操作系统 | Microsoft Windows 10 专业版 10.0.19045（build 19045） | `Get-CimInstance Win32_OperatingSystem` |
| CPU / 内存 | Intel Core i5-13400 / 15.8 GB | `Get-CimInstance Win32_Processor` / `Win32_ComputerSystem` |
| Node.js | v24.14.0 | `node -v` |
| Chromium | 158.0.8127.18（Playwright 自带） | M4 `result.json`、perf 输出 |
| Firefox | 159.0（Playwright 自带，本轮安装成功） | M2 `summary.json` |
| WebKit | 27.2（Playwright 自带，本轮安装成功） | M2 `summary.json` |
| 页面加载地址 | `http://127.0.0.1:4173/index.html`（`scripts/serve.mjs`） | 端口监听确认 PID 16316 |
| 手工脚本视口 / DPR | 1280×800 / 1 | M2、M4、M6 脚本 |
| perf 视口 / DPR | 1472×1028，DPR1 与 DPR2 两组 | `npm run perf:browser` 输出 |
| 渲染器（perf） | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver) | perf 输出 |

证据目录：`test-results/manual-acceptance/`（M2、M4、M6），该目录不进 Git。

> 说明：`npm run perf:browser` 使用 Playwright Test runner，启动时会清空 `test-results/`。
> 本次因此丢失过一次早期 M2/M4 证据，已在 perf 之后**重新生成**；最终证据以本报告引用的文件为准。

## 2. 条目盘点与可执行性判定

| 编号 | 条目 | 本机可执行性 | 判定依据 |
|---|---|---|---|
| M1 | 真机移动端 PWA 安装 / 离线 / 手势 | **不可执行** | `adb: NOT_FOUND`；无 Android/iOS 真机；仅 `http://127.0.0.1:4173`，无 HTTPS 站点；本机桌面模拟不能替代真机 |
| M2 | Firefox / Safari 的 SVG 导入、下载、沙箱、PDF | **部分可执行** | Firefox 159.0、WebKit 27.2 为真实引擎可跑；Safari 17+ 需 macOS，本机为 Windows |
| M3 | 真实双设备 WebRTC（局域网 / 跨网络） | **不可执行** | 仅一台设备；按要求未使用同机双标签替代；跨网络还需 STUN/TURN（代码固定 `iceServers: []`） |
| M4 | 英文译文语义质量 + 未翻译/占位符检查 | **部分可执行** | 未翻译与占位符可用真实浏览器自动扫描；语义质量需中英双语评审人，本机无 |
| M5 | 真实 GPU / 低端设备渲染绝对性能 | **不可执行** | 无真机、无真实 GPU；`perf:browser` 为 SwiftShader 软件光栅，只能作代理对照 |
| M6 | 低端设备插件 2s 超时体验 | **不可执行** | 无低端真机；桌面 CPU 节流只能作 `PROXY` |
| M7 | 真实 CAD 查看器中的 DXF 观感 | **不可执行** | `NO_CAD_INSTALLED`（未发现 AutoCAD / LibreCAD / DraftSight） |
| M8 | 50 条真实图纸快照差异核对 | **不可执行** | `M8_NO_CORPUS`；无 50 组真实语料，也无两名评审人及裁定流程 |
| 补充-01 | Excel / WPS 打开导出文件 | **不可执行** | `NO_EXCEL_OR_WPS_EXE`（未找到 Excel / WPS 可执行文件） |
| A1（抽检） | 旧工程图标视觉回归 | **自动化可执行** | `selftest` 可跑；人工抽检需旧工程 JSON，仓库未提供 |

## 3. 逐条结果

### M1 真机移动端 PWA —— 未验证

- 原因：无 Android/iOS 真机，`adb` 不存在；本机只有 HTTP `127.0.0.1`，不构成手机可访问的 HTTPS 安全上下文。按矩阵要求，桌面模拟、Chrome 不安全源开关都不能记为通过。
- 后续条件：Android 10+ / iOS 16+ 真机 + 可访问的 HTTPS 静态站点；在设备上完成安装、断网重开、`☰` 侧栏与 44×44 px 触控目标检查。
- 证据：无（未执行）。

### M2 Firefox / Safari 跨浏览器 —— 部分通过（Firefox、WebKit 通过；Safari 未验证）

真实引擎手工脚本，逐个引擎完成：SVG 导入 → 放置符号 → 导出 SVG/DXF/PDF → 加载 `plugins/sample-sandboxed.js` → 导出沙箱 Markdown。

| 检查项 | Firefox 159.0 | WebKit 27.2 |
|---|---|---|
| SVG 导入 | 成功，2 条 path | 成功，2 条 path |
| 符号放置 | 成功（`hasSymbol=true`） | 成功（`hasSymbol=true`） |
| SVG 下载 | 2,979 B | 2,979 B |
| DXF 下载 | 880 B（导出后出现「DXF 导出报告」弹窗，属预期） | 880 B（同上） |
| PDF 下载 | 2 页，404,667 B | 2 页，230,778 B |
| 沙箱插件 | `sandbox-markdown` active；`.md` 67 B | 同左 |
| 控制台错误 | 0 | 0 |
| 总耗时 | 29.8 s | 37.4 s |

- 结论：Firefox 子项通过；WebKit 作为 Safari 引擎的替代覆盖通过。
- **Safari 原生未验证**：本机无 macOS，不能用 WebKit 结果替代 Safari 17+ 的最终结论。
- 证据：`test-results/manual-acceptance/M2/firefox/`、`.../M2/webkit/`（result.json、截图、SVG/DXF/PDF、sandbox-markdown.md）。

### M4 英文界面 —— 不通过（未翻译项）+ 语义未验证

按真实用户路径切换：设置 → 界面语言 English → 保存（保存后 `I18N.lang=en`、`state.settings.lang=en`）。随后扫描 7 个区域，统计可见文本中的 CJK 与 `{占位符}`。

| 区域 | 可见文本条数 | 含中文条数 | 占位符条数 |
|---|---|---|---|
| 主界面 | — | 见下 | 0 |
| 符号库页签 | 46 | 42 | 0 |
| 图层/类型页签 | 233 | 77 | 0 |
| 统计页签 | 32 | 1 | 0 |
| 规则页签 | 123 | 66 | 0 |
| 快捷键帮助 | 45 | 0 | 0 |
| 设置弹窗 | 23 | 6 | 0 |
| 图框/标题栏弹窗 | 16 | 1 | 0 |

- 汇总：7 个区域中 6 个含中文；中文实例 **193** 条、去重 **89** 条；残留占位符 **0** 条；控制台错误 0。
- 结论：按矩阵判据「0 条未翻译」→ **不通过**。语义可理解性、术语一致性需双语评审人 → **未验证**。
- 主要位置（均为实测可见文案，不是推测）：
  - `index.html:135`：`#tabBtn-symbols` 没有 `data-i18n`，页签仍是「符号库」。
  - `index.html:216-238`：符号库面板标题、`旋转角 (°)`、`真实尺寸 (m)`、提示语、`导入 SVG… / 导出 JSON / 导入 JSON` 等为硬编码中文。
  - `index.html:247-258`：规则面板 `几何规则检查`、`违规清单`、`运行检查 / 导出 CSV / 清空结果` 等为硬编码中文。
  - `js/features/ui-shell.js:18/20`：设置弹窗「插件（仅本会话）」「底图/场地」提示为硬编码中文。
  - `js/features/io-export.js` 的图框弹窗用 `L('保存')`，但 `js/common/i18n.js` 的 `PHRASES` 未收录「保存」（只有 `DICT.save`），实测按钮仍是「保存」。
  - 36 个内置类型名：`typeDisplayName()` 会走 `L(name)`，但 `PHRASES` 未收录这些中文名，符号库与图层页签仍显示中文名；图层副标题 `仅位置图标 / 扇形视场 / 圆形覆盖 / 杆/线段` 同样未收录。
- 处理：按任务要求「发现缺陷先停止该条并报告，等确认后再处理」，本轮**未修改任何业务代码**。
- 证据：`test-results/manual-acceptance/M4/result.json` 与 8 张英文界面截图（main / symbols / layers / stats / rules / help / settings / titleblock）。

### M5 真实 GPU 渲染性能 —— 未验证

- 本机无真实 GPU，`perf:browser` 的 Chromium 使用 **SwiftShader 软件光栅**；按矩阵不得用其推断真机通过。
- 真实浏览器实测（代理数据，仅作对照）：

| 场景 | 帧 P50 / P95 / P99 / max (ms) | 静态层重建 P50 / P95 (ms) | heap 峰值 |
|---|---|---|---|
| 2000 对象 DPR1 | 0.8 / 3.0 / 4.8 / 4.9 | 45.5 / 51.6 | 16.85 MB |
| 5000 对象 DPR1 | 1.6 / 6.3 / 7.2 / 8.8 | 104.9 / 126.2 | 36.98 MB |
| 10000 对象 DPR1 | 2.9 / 6.9 / 11.7 / 13.4 | 219.4 / 235.7 | 68.88 MB |
| 5000 对象 DPR2 | 11.0 / 17.1 / 19.5 / 23.1 | 210.8 / 224.4 | 37.18 MB |

- `npm run perf:browser`：4 passed（19.1 s）；DPR2 组 P99 19.5 ms 触发「>16.7 ms」告警。数据文件：`test-results/perf-browser-baseline.json`。
- 结论：**未验证**。矩阵要求的目标真机 10 秒连续平移录制（无单帧 >50 ms）没有条件执行；上述数据不得当作 M5 通过值。
- 后续条件：目标 Android/iOS 真机 + 远程调试/Performance 录制，记录 P50/P95/P99 与最长帧。

### M6 低端设备插件 2s 超时 —— 未验证（附桌面节流代理差异）

同一真实 Chromium，分别在不节流与 6× CPU 节流下加载 3 秒忙循环插件：

| 条件 | 返回耗时 | 返回结果 | 插件状态 | 导出列表含插件 | 点击工具处理耗时 |
|---|---|---|---|---|---|
| 无节流 | 2,006 ms | `{ok:false}`，reason「插件初始化超时（>2000ms）」 | disabled | 否 | 18 ms |
| 6× CPU 节流 | 3,094 ms | `{ok:true}` | active | 否 | 65 ms |

- 解读：6× 节流下主线程定时器被延后，插件忙循环先结束并返回 `ok:true`；这是**节流代理的计时偏差**，不能据此判定真机缺陷。无节流结果与自动化 e2e 的 ≤2.5 s 判据一致。
- 结论：**未验证**。低端真机上的超时触发时间、主线程是否冻结、UI 是否可继续操作仍需实机复核。
- 证据：`test-results/manual-acceptance/M6/result.json`（节流）、`.../result-unthrottled.json`（对照）、`plugin-timeout.png`。

### M7 真实 CAD 查看器 DXF 观感 —— 未验证

- 环境探测：`NO_CAD_INSTALLED`（Program Files 下未发现 AutoCAD / LibreCAD / DraftSight）。
- 本轮仅证明应用内 DXF 导出可用（M2：880 B），未在 CAD 中打开、未量 2.5 m 符号尺寸、未做 SVG 并排比对。
- 后续条件：AutoCAD 2020+ 或 LibreCAD 2.2+，打开 `tests/golden/symbol-scene.dxf` 与应用导出的 DXF，量尺寸并检查折线观感。

### M8 50 条真实图纸快照核对 —— 未验证

- 环境探测：`M8_NO_CORPUS`；无 50 组真实工程 A/B 版本，无两名评审人与第三人裁定流程。
- 本轮未使用构造样本补足，也不把构造样本的一致率当作真实误报率。
- 后续条件：50 组匿名化真实语料 + 先独立完成人工基准 + 结果 CSV（TP/FP/FN/一致率）。

### 补充-01 Excel / WPS —— 未验证

- 环境探测：`NO_EXCEL_OR_WPS_EXE`。
- 未打开本轮导出的 xlsx/CSV，未验证公式注入防护的真实表现。
- 后续条件：Excel 2019+ / Microsoft 365 或 WPS 11+。

### A1（自动化抽检） —— 通过（仅自动化部分）

- `node scripts/selftest.mjs --filter "中英界面|符号库"`：**327 通过 / 0 失败**（加载 44 个脚本）。
- 该结果同时覆盖：符号库 36 图元与 A1/A6 golden、i18n 键与模板自洽。
- 注意：这不能证明 M4 的文案已翻译；本轮 M4 实测仍发现中文残留。A1 人工抽检因无旧工程 JSON 记 `N/A`。

## 4. K 类已知限制盘点

> K 类是**明确不承诺**的产品/技术边界，不是验收条目。以下逐条给出本轮的处理方式，避免把「已知限制」误当缺陷。

| 编号 | 本轮状态 | 依据 / 说明 |
|---|---|---|
| K1 | 未验证（发布纪律项） | Service Worker `CACHE` 版本无构建期自动门禁，本轮不重复验证 |
| K2 | 未验证（不引入项） | 通用 LRU / Path2D 缓存 / 索引等明确不引入；本轮未改代码 |
| K3 | 已观察到限制表现 | M2 导出的 PDF 为 2 页位图页（404,667 B / 230,778 B），与「PDF 位图页、回读不能还原矢量坐标」一致 |
| K4 | 未验证（格式边界） | `.dwg` 不支持、DXF 需 ASCII 等边界未在本轮实测；仅确认 ASCII DXF 可导出 |
| K5 | 未重测 | 二维码 42 字节上限为既有文档声明；本轮未构造超限二维码 |
| K6 | 未重测 | 覆盖率 v1/v2 不可比、72 段采样为既有声明；本轮未跑覆盖率专项 |
| K7 | 已观察 | M4 规则页签可见「这是几何检查，不是消防/规范审图；不内置任何规范数值」 |
| K8 | 部分观察 | 符号 DXF 为折线近似（M2 880 B）；填充不还原、SVG 导入 6 类元素等边界未逐项重测 |
| K9 | 部分观察 | M2 示例沙箱插件可加载并导出；「隔离边界非完整语言级沙箱、无 CPU/内存配额」未重测 |
| K10 | 未验证 | LWW 合并、无服务端/冲突 UI；M3 双设备未执行 |
| K11 | 已关闭 | `docs/engineering.md`、`docs/testing.md`、`docs/performance.md` 三份拆分文件均存在 |
| K12 | 未重测 | 32 MB 导入、10 万对象等硬上限为既有设计边界；本轮未做超限压测 |

## 5. 缺陷与过程风险

1. **M4 英文界面未翻译（缺陷，已停止该条）**：193 条中文实例 / 89 条去重；静态页签、符号库面板、规则面板、设置插件提示、内置类型名等未接入 i18n。证据见 §3 M4。未修改代码，等待确认后再处理。
2. **证据目录被 Playwright runner 清空（过程风险）**：`npm run perf:browser` 会清空 `test-results/`，导致早期 M2/M4 截图与 JSON 被删除。本轮已在 perf 之后重新生成；后续建议把人工验收证据放到 Playwright `outputDir` 之外，或在跑 runner 前先归档。
3. 其余已执行项未发现阻断性异常；M2/M6 控制台错误均为 0。

## 6. 命令来源

```text
# 静态服务器（已在后台运行）
node scripts/serve.mjs                       # http://127.0.0.1:4173

# M2 跨引擎（Firefox / WebKit 真实引擎，直接 Playwright API）
node c:\Users\Administrator\AppData\Local\Temp\plotpin-m2.mjs

# M4 英文界面扫描（真实 Chromium，设置弹窗切语言后扫描）
node c:\Users\Administrator\AppData\Local\Temp\plotpin-m4.mjs

# M5 真实浏览器性能（Chromium + SwiftShader，仅代理数据）
npm run perf:browser

# M6 插件超时（6× CPU 节流 / 无节流对照）
node c:\Users\Administrator\AppData\Local\Temp\plotpin-m6.mjs
$env:CPU_RATE='1'; node c:\Users\Administrator\AppData\Local\Temp\plotpin-m6.mjs

# A1 自动化抽检
node scripts/selftest.mjs --filter "中英界面|符号库"

# 环境探测
Get-Command adb
Get-ChildItem 'C:\Program Files','C:\Program Files (x86)' -Directory | Where-Object Name -match 'AutoCAD|LibreCAD|DraftSight'
Test-Path 'test-results/manual-acceptance/M8/corpus'
Get-ChildItem 'C:\Program Files\...\EXCEL.EXE', 'C:\Program Files\WPS Office\*\office6\et.exe'
```

> 临时验收脚本位于系统临时目录，不属于业务代码；本轮未修改仓库内任何 `.js` / `.mjs` 业务逻辑。

## 7. 结论汇总

| 编号 | 结论 | 摘要 |
|---|---|---|
| M1 | 未验证 | 无真机、无 HTTPS；`adb` 不存在 |
| M2 | 部分通过 | Firefox 159.0 / WebKit 27.2 全流程通过；Safari 原生未验证 |
| M3 | 未验证 | 无双设备；未用双标签替代 |
| M4 | **不通过** + 语义未验证 | 6/7 区域含中文，193 实例 / 89 去重；占位符 0；语义需人工 |
| M5 | 未验证 | 无真实 GPU；SwiftShader 数据仅代理（P95 3.0 ms @2000 对象） |
| M6 | 未验证 | 无低端真机；6× 节流出现 `ok:true` 计时偏差，无节流 2,006 ms `ok:false` |
| M7 | 未验证 | 未安装 AutoCAD / LibreCAD |
| M8 | 未验证 | 无 50 条真实语料与人工基准 |
| 补充-01 | 未验证 | 未找到 Excel / WPS 可执行文件 |
| A1 | 通过（自动化） | `selftest` 327/0；人工部分 `N/A` |

**总判定：本次 M 类验收不能判定为「全部通过」。** 可执行的跨浏览器与英文界面客观检查已完成，其中英文界面存在未翻译缺陷；真机、真实 GPU、双设备、真实语料、CAD 观感与表格软件项均因环境不满足而未验证。
