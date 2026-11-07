# 工程纪律：门禁、契约与已知空白

> 这份文档是**权威层**：门禁有哪些、各自守什么、什么**故意不设**门禁。
> 入口（README）只放"怎么跑"，细节在这里维护。
> 判据的取舍标准见 ngm 仓库的 `docs/practice/engineering-discipline.md`
> （工程纪律方法论：什么值得写成判据、成熟度分级、四种失效形态）——
> **任何"我们保证了 X"必须能指向一条会变红的判据；没有判据的，就明说不保证。**
>
> 子文档：[测试体系（浏览器级 e2e）](testing.md) · [性能基线（真实浏览器）](performance.md)。

---

## 1. 命令：`npm run ci`（CI 同一条）

```
node scripts/check.mjs --selftest   语法 → 入口资源 → 离线承诺 → 断言数 → 契约 → API → 分层 → 自测 → i18n
        ├── scripts/badge.mjs --check        断言数三处一致（README 徽章/正文/命令注释）
        ├── scripts/check-contracts.mjs --selftest   契约判据 + 判据自己会红
        ├── scripts/check-plugin-api.mjs --selftest  API 面 + 解析器会红
        ├── scripts/selftest.mjs            逻辑层自测（--selftest 显式执行，退出码纳入门禁）
        └── scripts/i18n-scan.mjs --check   i18n 覆盖率 ≥40% / 缺口 ≤10 / UI 文案硬编码 ≤20（口径见 testing.md）
node scripts/bench.mjs              渲染基准（avg / P95 / 重建 / heapUsed / 裁剪 / 覆盖率阈值）
node scripts/build.mjs --check      源重建 ↔ scripts/dist-manifest.json 登记哈希比对
node scripts/check-gates.mjs        门禁牙齿：5 种人为破坏必须让对应门禁非 0
node scripts/e2e.mjs               浏览器级功能测试（可选，devDependency；**不在 ci 路径**）
node scripts/perf-browser.mjs      真实浏览器性能基线（可选；**不在 ci 路径**，见 [performance.md](performance.md) §5.4）
```

`npm run ci` = 上面四条的顺序执行（含 `check-gates.mjs`），与 `.github/workflows/ci.yml` 的 test job 一致：
CI 的 test job 另外还跑同名四条命令；`vendor-check` / `discipline` / `ngm-verify` 是独立 job，不在 `npm run ci` 里。
`npm run lint` 只跑 `check.mjs`（不带 `--selftest`），用于本地快速自检；CI 必须带 `--selftest`。

单项也可以单独跑：`npm test`（check-ngm + selftest）、`npm run contracts`、`npm run bench`、`npm run gates`、`npm run test:e2e`。

`npm run test:e2e` 需要 `@playwright/test` + Chromium 二进制（仅 devDependency）。缺依赖或缺浏览器时
`scripts/e2e.mjs` 打印 `[SKIP]` 原因并**退 2**（不是 0），避免把「没跑」当成「通过」；`npm run ci`
不调用它，离线门禁与构建不依赖浏览器。

`npm run perf:browser`（`scripts/perf-browser.mjs`）同样需要浏览器，退出码规则相同；它采集真实
Chromium 的帧耗时 / 静态层重建 / heapUsed / 导入耗时并做阈值判定（`--no-gate` 只采数），
报告写入 `test-results/perf-browser-baseline.json`。**它不在 `npm run ci` 路径**，也**不得用
bench 的 Node 桩数据替代**——两者的场景、渲染器与绝对值不可比（见 [performance.md](performance.md) §5.4）。

---

## 2. 契约：`contracts/conventions.json`

一份文件管四件事，每条都写清"违反时会怎样"：

| 约定 | 判据做什么 | 漂移的后果（看不见的那种） |
|---|---|---|
| 版本号三处一致 | `package.json` = `ngm.json` = `PlotPin.version` | 外部插件按错误的 API 版本编程 |
| i18n 键对齐 | `zh`/`en` 同键集；`index.html` 的 `data-i18n*` 键都有译文 | 切到英文直接露出键名 |
| 文件头唯一 | 每个 `js/**/*.js` **恰好一行** `/* 文件名.js —— 职责 */` | 新读者读到两份互相矛盾的职责说明 |
| 枚举同源 | `POINT_SCALE_SHAPES` 的键集 = `TYPE_SHAPES` | 插件注册了渲染器不认识的形状 → 静默当成 `none` |

**判据自己也有判据**：`npm run contracts:selftest` 造一棵必然违约的临时树，
断言四类漂移各被识别一次。没有这一步，契约判据就只是"看起来在检查"——
一条从未红过的判据，与没有判据的区别只在于它更贵。

> 这份契约不是"预防性设计"。它落地时**当场抓到三处真实漂移**：`io.js` 与 `ui-panels.js`
> 各有两行互相矛盾的文件头，且枚举提取的 lookahead 漏掉了数组最后一项。
> 两处文件头已按实际内容合并；漏项是自检抓出来的，不是想出来的。

---

## 3. 生成物与入库

| 产物 | 入库 | 判据 |
|---|---|---|
| `ngm.vendor/` | ✅（`linkMode: copy`，部署机不联网） | `scripts/check-ngm.mjs` 三角对账（vendor ↔ ngm.json ↔ ngm.lock） |
| `ngm.mappings.json` | ✅ | 同上；它是依赖清单的投影，不入库就没有复现依据 |
| `scripts/dist-manifest.json` | ✅（单文件发行包的哈希登记） | `scripts/build.mjs --check` 从源重建并比对 SHA256 / 字节数；改 js/css/index.html 后必须运行 `node scripts/build.mjs` 刷新 |
| `dist/` 实体产物 | ❌（gitignore） | `scripts/build.mjs` 可重建；存在时 `--check` 额外逐字节比对 |
| 新增 `js/**/*.js` | ✅ | 必须被 `index.html` 引用（check.mjs 双向核对） |

**判据问句**：删掉它，`npm run ci` 还能不能从源重建并得出结论？

### 3.1 单文件产物的构建期无损压缩（2026-11 体积专项）

`scripts/minify-core.mjs` 在 `scripts/pack-core.mjs` 内联时压缩 CSS/JS，只做**语义安全**的删减：
JS 删注释、行首缩进、空行与行尾空白（字符串 / 模板字面量 / 正则字面量逐字节保留，跨行块注释保留
一个换行以不改变 ASI），CSS 删注释与 `{ } ; ,` 附近空白（引号字符串与 `url(...)` 原样保留）。
**源文件不压缩**，`index.html` 仍引用可读源码；CSP `sha256` 由 `pack-core.mjs` 按压缩后脚本文本重算。
每个内联脚本压缩后立刻用 `vm.Script` 解析，解析失败直接让构建失败（压缩器缺陷不允许进入产物）。

实测（2026-11-06）：**833,855 → 664,325 B（−169,530 B / −20.33%）**，其中构建期压缩 169,273 B
（JS 168,142 + CSS 1,131）、删除死代码 257 B；gzip **273,289 → 205,465 B（−67,824 B / −24.81%）**；
SHA256 `d1dea4e647bd…`；820 KB 门禁余量 **5,825 → 175,355 B**。口径可复跑：
`node scripts/size-report.mjs`（按产物 `/* path */` 标记切分，输出 Top 10、注释/缩进/空行、
重复字符串、重复代码行与顶层死代码候选）。

---

## 4. 对外 API 面：`contracts/plugin-api.json`

插件的边界不是"能不能调"，而是"**调了算数吗**"。`PlotPin` 对象上每多一个键，
就多一个别人可以依赖、你却不能再改的东西；每少一个键，就是一句承诺落空。

`scripts/check-plugin-api.mjs` 把 `js/features/plugins.js` 里 `const PlotPin = {…}` 的**顶层键**
与清单双向比对：

| 情况 | 后果（都不报错） |
|---|---|
| 代码里有、清单没登记 | **API 泄漏**：插件用了它，你下次改名就静默破坏兼容 |
| 清单有、代码里没有 | **承诺落空**：文档写了、插件调了、运行时 `undefined` |

判据自己带牙齿：`npm run api:selftest` 用一段含内层花括号、方法简写、getter 的对象字面量
验证解析器只取顶层键。落地时做过一次真牙齿测试——往 `PlotPin` 里加一个 `_internalSync()`
立即报"1 处泄漏"，移除即恢复。

### 4.1 插件版本、能力白名单与隔离（C-01）

`PlotPin.apiVersion = "1.1.0"` 是**插件 API 版本**，与 `PlotPin.version`（应用版本，须与
`package.json` 一致）不是一回事。版本规则：

| 声明 | 结果 |
|---|---|
| `apiVersion: "1"` / `"1.0"` / `"1.0.0"` | 兼容（1.0 插件可装 1.1 宿主） |
| `apiVersion: "1.1"` / `"1.1.0"` | 兼容 |
| `apiVersion: "1.x"`（x > 1，如 `1.2`） | 拒绝：次版本高于宿主，`reason` 写明宿主最高版本 |
| `apiVersion: "2.0"` | 拒绝：主版本不兼容，`reason` 写明双方版本 |
| 缺失 / 非法格式 | 拒绝：`reason` 说明合法写法 |

`PlotPin.checkPlugin({id, apiVersion, capabilities})` 是同步预检（不执行代码），
`loadPlugin` 内部先调用它；**任何校验失败都返回 `{ok:false, reason}` 并 toast，不抛异常、不崩溃**。
旧的同源 `<script>` 插件路径（直接调用 `PlotPin.register*`）保留为**受信任兼容入口**，不套版本与能力门；
需要隔离的插件应迁移到：

```js
PlotPin.loadPlugin({ id, apiVersion: '1.0', capabilities: ['state:read', 'export'], code })
```

**清单导入（D-05）**：`PlotPin.validatePluginManifest(raw)` 是纯函数（接受 JSON 字符串或对象），
校验 `schema === 'plotpin.plugin/v1'`、`id`（2–64 位字母/数字/点/下划线/短横线）、`name`（≤80 字符）、
`version`（`x.y.z`）、`apiVersion` 与 `capabilities`（复用 `checkPlugin`），并限制清单 ≤192 KB、
`code` ≤64 KB；通过返回规范化 `spec`（能力去重），失败返回 `{ok:false, reason}` 且**不产生任何副作用**，
再由导入方确认能力后调用 `loadPlugin`。设置 → 插件面板读取 `.json` 清单、逐条卸载，并明确提示
**仅本会话有效、刷新后需重新导入**（不持久化插件代码；持久化需独立安全评审）。

能力白名单（**未声明的能力一律不可用**；未知能力在 `checkPlugin` 阶段即拒绝）：

| 能力 | 允许做的事 |
|---|---|
| `state:read` | `PlotPin.getState()`、导出器/导入器上下文中的 `ctx.state` |
| `state:write` | `PlotPin.addObjects(list, msg)`，经主工程 `sanitizeObjects` 清洗、重新编号后提交 |
| `annotate` | `PlotPin.addAnnotation(spec, msg)`，仅 `text` / `dimension` |
| `types` | `registerObjectType` / `unregisterObjectType` |
| `icons` | 自定义类型允许携带 `symbol` 图元；**未声明时 symbol 一律拒绝** |
| `export` | 注册 / 注销 / 执行导出器 |
| `import` | 注册 / 注销 / 执行导入器 |
| `rules` | **仅声明意图**：沙箱 Worker 调用 `registerRule` 会被明确拒绝；规则在主线程执行，只能经受信任同源路径 `PlotPin.registerRule(def, owner)` 注册，`owner` 用于来源标识 |

**隔离执行**：`loadPlugin` 把插件源码拼进 `Blob`，用 `new Worker(blobURL)` 在独立线程执行；
主线程与 Worker 只通过带随机 token 的 `postMessage` 通信（注册 RPC / 调用 / 下载 / toast）。
Worker 内先做全局硬化：`fetch`、`indexedDB`、`XMLHttpRequest`、`WebSocket`、`EventSource`、
`importScripts`、`caches`、`localStorage`、`sessionStorage`、`navigator`、`location`、
`postMessage`、`addEventListener`、`self`、`Worker`、`SharedWorker` 在**全局对象与原型链**上都置空/删除；
Web Worker 本身没有 DOM / `window` / `parent`，主工程的 `state`、`PlotPin` 内部对象也不可达。
CSP 在 `index.html` 增加 `worker-src 'self' blob:`；Worker 继承父页 `script-src`（无
`'unsafe-inline'` / `'unsafe-eval'`），`new Function` / `eval` 被 CSP 拒绝。

**超时与失败隔离**：初始化与每次调用（含导出/导入）上限 **2000 ms**，超时由主线程
`worker.terminate()` 硬终止；插件抛异常、能力越界、注册冲突都只会让**该插件**进入
`disabled` 状态（`PlotPin.listPlugins()` 可读 `reason`，同时 toast「插件已禁用：…」），
主工程继续可操作。`unloadPlugin` 可主动卸载；已注册导出器/导入器立即撤销，
类型只在**没有对象使用**时移除（既有图纸的 `typeId` 外观不被破坏，与 `typeInUse()` 口径一致）。

**图标仍走 A-02 白名单**：`icon` 无论如何都经 `normalizeIcon`（只认 16 个内置名，其余回落
`custom`）；`symbol` 的 `d` / `fill` 只按几何数据保存，类型名/颜色/id 在渲染处走 `esc`。
沙箱能力门不能绕过这两道清洗，e2e 用带 `"><img onerror=…>` 的类型名/图标做过验证。

**明确限制**：一个插件一个 Worker；`code` 必须是字符串（`file://` 下不允许 `fetch` 插件文件）；
单次 `addObjects` 最多 500 个对象；导入文件大小沿用 `APP_LIMITS.IMPORT_FILE_MAX_BYTES`；
Worker 是**隔离边界**而不是完整语言级沙箱——插件仍可访问 `console`、`Blob`、`crypto` 等
无主工程权限的 Worker 全局，且不设 CPU/内存配额（只靠 2 s 超时 terminate）。

> **旧说明已作废**：此前「同源纯 JS 没有隔离可言、不做沙箱」的边界描述不再成立；
> 受信任的旧路径仍在，但**不可信插件必须走 `loadPlugin`**。

**兼容矩阵与契约演进（D-06）**：`checkPluginApiVersion` 返回 `{ok, reason, major, minor}`，
`checkPlugin` 成功时回传 `major/minor`（旧调用只读 `ok/reason`，函数签名不变）。固定矩阵：
`1.0` / `1.0.0` / `1.1` 通过；`1.2` 拒绝（次版本高于宿主）；`2.0` 拒绝（主版本不兼容）；
缺失或畸形拒绝并说明合法写法；解析失败时 `major/minor` 为 `null`。未知能力**仍拒绝**——
能力集合是封闭白名单，计划中「仅警告」的方案会削弱 D-05 已固化的拒绝用例，故不放宽门禁。
`scripts/check-plugin-api.mjs` 除键集合外，还校验契约描述里的版本号与能力列表必须与
`plugins.js` 的 `PLUGIN_API_VERSION` / `PLUGIN_CAPABILITIES` 同源，任一漂移即判红。
矩阵由 selftest 6 条与 e2e `plugin-compat.spec.mjs` 3 条固化。

### 4.2 几何规则检查的边界与口径（C-05）

规则页签（`js/features/rules.js`）是**几何检查**，不是消防/规范审图。页面与文档都明确写出这一点；**不内置任何规范数值**，所有容差与间距阈值由用户按类型填写。

| 项 | 口径 |
|---|---|
| 重叠 | 同楼层两对象包围盒穿透深度 **> `overlap.tolerance`（默认 0.05m）** 才进入多边形判定；多边形交面积 **> tolerance²** 报违规。相邻贴边（穿透 0）与容差内浅穿透不报。凸多边形直接裁剪，凹多边形耳切三角化后逐块裁剪；自交/退化回退包围盒。纯图标点（无物理尺寸）无面积，跳过重叠。 |
| 最小间距 | 只比较**已配置阈值**的类型两两；两对象阈值取 `max`；净距 **`<` 阈值**才报违规，**恰好等于阈值视为达标**（实现带 1e-9 容差）。点/点、点/区域、线段/线段均用真实几何距离；圆/椭圆按 72 段采样多边形近似。 |
| 越界 | 边界取 `siteOutlinePoints(site)`；容差内视为场内。全部顶点在外且无边横跨 → `full`；部分顶点在外或边横跨边界 → `partial`；文字、尺寸标注、点设备同样参与。未设置矢量场地时规则跳过并记录原因。 |
| 范围 | `state.rules.scope`：`all` 遍历全部楼层，`current` 只查当前楼层；**跨楼层对象不互报重叠/间距**。 |
| 配置 | `state.rules` 随工程保存（`persistableState` 深拷贝、`buildProject` 载入时 `normalizeRuleConfig` 归一）；协作合并**本地非空优先**，缺失侧回退另一侧。容差限定 0–1000m、三位小数；类型阈值最多 200 键。 |
| 违规输出 | 统一字段：规则 id/名、对象 id/名、关联对象 id/名、楼层 id/名、世界坐标 X·Y、说明、实测值、分类（越界 `partial`/`full`）。CSV 经 `csvCell` 做引号与公式注入防护。 |

**性能**：重叠与间距的候选对用 minX 扫描线（窗口取参与类型阈值的最大值），其余对象走全量。2000 对象 / 30 类型阈值 / 场地 2000×1500m 实测：检查 **14.3–15.5ms**（5 次中位数 14.3ms，CI / 收口复跑 15.2–15.5ms；候选对 **7**，理论两两组合 **2,221,111**，占比 0.00%；分项 overlap 9–10ms / spacing 1ms / bounds 1–2ms）；同场景 `mode:'brute'` 全量对照 **15,666.4ms**，扫描线加速约 **1096×**。门禁 `规则检查(2000对象/30类型) ≤ 500ms` 已进 `npm run ci`；`--brute` 仅用于本地记录收益，该模式会物化 2M 候选对，不适用 heap 门禁。

**已知限制**（如实说明，不做"规范合规"承诺）：
- 圆/椭圆/扇形为 72 段采样多边形，凹多边形为三角化近似，边界误差在采样/三角化容差内；
- 重叠判定以**同楼层**为前提，不检查楼层间垂直关系；
- 越界只对照矢量场地边界，不校核红线/用地性质/退线等外部约束；
- 不判断消防间距、疏散、结构、日照等任何规范条文，也不提供规范默认值；
- 规则注册表为运行时内存态，自定义规则不随工程保存；工程只保存规则**配置**。插件经受信任路径注册时传
  `owner`（插件 id），规则页签显示「插件: <id>」；注销后立即从列表与后续检查中消失。

### 4.3 符号库、SVG 导入与 DXF 降级口径（C-04）

符号库（`js/common/symbols.js`）是内置图元与用户自有图元的**唯一数据源**；画布、SVG、PNG、PDF
都通过同一个 `symbolPathsFor(type)` 取路径，不存在第二份图形定义。内置 **36 个**线性图元，
六类各 6 个（视频监控 / 门禁 / 消防 / 网络 / 停车 / 其他），统一 24×24 viewBox、紧凑 path 字符串。

| 项 | 口径 |
|---|---|
| 图元数据 | `{id,name,cat,aliases,views,paths}`；`paths` 为 `{d,fill}` 数组，路径字符集白名单 `MmLlHhVvCcSsQqTtAaZz0-9.,-+eE \t`，非法即抛错。`normalizeSymbolPaths` / `normalizeSymbolViewBox` / `normalizeSymbolAliases` 是唯一归一入口。 |
| 搜索与放置 | `searchSymbols(query, cat)` 对 id / 名称 / 别名做小写包含匹配；别名如「烟感」「NVR」。放置走「点设备」工具；`symbolPlace = {angle, phys}` 为**临时放置选项、不持久化**，落地后写入对象自身的 `angle` / `phys`。 |
| 真实尺寸 | `phys > 0` 时按图元外接宽度（米）缩放到世界尺寸，画布与 SVG 用同一比例因子；`phys = 0` 为屏幕固定图标（`k` 缩放）。DXF 无 `phys` 时用 **0.6m 名义尺寸**。 |
| 自有导入（安全） | 上传 SVG 后走 `assertSafeSvg` + `parseSvgSymbol`：**64 KB** / **200 元素** / **嵌套 16 层** / **200 条路径** / **单条 path 5000 字符**；拒绝 script 标签、`on*` 事件属性、外部 `href` / `xlink:href`、`DOCTYPE`/`ENTITY`、`DOMParser` 危险元素与非法路径字符。所有拒绝均返回**具体原因**，不落库。 |
| 工程命名空间 | 自有符号只写 `state.objectTypes`（随工程 JSON 持久化），JSON 包 `{schema:'plotpin.symbols/v1', symbols, project}` 由 `customSymbolsFromTypes` / `sanitizeSymbolBundle` 生成与校验；导入 id 冲突自动改名为 `sym.import.N`，包内最多 200 个符号。**不写全局存储**，不影响其他工程。 |
| 渲染一致 | `symbolPathsFor` 是唯一 path 源；Canvas 侧 `Path2D` 缓存（`WeakMap`），无 `Path2D` 时回退逐段描边并保留同源路径。属性面板对符号类型开放物理尺寸。 |
| DXF 降级 | DXF 不支持任意填充路径，**保留原始 POINT 锚点**并追加 `LWPOLYLINE` 折线近似（曲线 8–10 段、圆弧 6–48 段采样）。`dxfEntitiesForExport` 返回 `report = {symbolPoints, approxPolylines, degraded, note}`，有符号时导出弹窗列出「N 个符号按 M 条 LWPOLYLINE 近似」；**不静默丢弃**。 |
| 既有工程 | 不使用符号时导出产物**逐字节不变**（golden 基线由 HEAD 代码生成并与新代码比对一致）。 |

**性能**：单页 500 个符号图元（六类混合、部分 1–3m 真实尺寸、带旋转）实测
**重建 3.33–4.01 ms / 缓存帧 0.08–0.10 ms / 直接帧 2.83–3.23 ms**（3 轮实测）；`buildSymbolIndex()`
加载 **0.012–0.014 ms**（36 个图元）。门禁 `符号渲染(500图元直接帧) ≤ 60ms` 与 `符号库索引加载 ≤ 10ms`
已进 `npm run ci`。

**golden**：`tests/golden/` 四份快照，`UPDATE_GOLDEN=1` 生成、`npm run ci` 逐字节比对：
无符号 `plain-scene.svg` 4,730 B / `.dxf` 900 B，符号场景 `symbol-scene.svg` 5,012 B /
`.dxf` 4,753 B（DXF 含折线近似，体现降级而非丢失）。

**已知限制**：
- DXF 只有折线与锚点近似，圆/弧的视觉精度受采样段数限制，不能还原填充；
- SVG 导入只识别 path / circle / rect / polygon / polyline / line 六类图元，其余元素被忽略
  （不报错但不进入图元数据）；
- 符号搜索为小写包含匹配，不做拼音/模糊/分词；
- 内置符号替代了旧版 64 个图标集合，**旧工程**仍按工程 JSON 里的 `objectTypes` 保留原图元。

---

## 5. 故意不设门禁的地方（明说不保证）

| 项 | 为什么不设 | 现在的做法 |
|---|---|---|
| Service Worker 的 `CACHE` 版本号 | "改了 js 就必须 bump"没有可读的事实源：SW 的预缓存清单在运行时从 `index.html` 解析，构建期不知道"上一版是什么" | 靠发布纪律 + `sw.js` 注释；`pwa.test.mjs` 只守下限（版本号格式与 ≥ 基线） |
| 英文文案的**质量** | 判据只能证明"键在、非空"，证明不了译文准确；D-11 覆盖率门禁只守数量与可达性 | selftest 覆盖"全量中英文案"路径；`i18n-scan --check` 守 ≥40% / 缺口 ≤10 / UI 未字典化 ≤20；语义由评审看 |
| 渲染性能的**真实设备基线** | 真机 GPU / 不同 DPI 的组合无法在离线 CI 里稳定复现；绝对阈值只能说明“这台机器上没退化”，证明不了所有用户设备流畅 | Node 桩下已有阻断门禁（§5.1）；真实浏览器基线（[performance.md](performance.md) §5.4）在 Chromium headless + SwiftShader 上可重复采集，但默认不进 `npm run ci`，数据不得与 bench 混用 |
| 插件 API 的**向后兼容** | 版本号与能力集合已有矩阵门禁；键的**语义/行为**兼容仍无法用键集合证明，破坏性变更只能靠评审 | D-06 起：selftest/e2e 固化 1.0→1.1、1.2/2.0/畸形矩阵；`npm run api` 校验契约描述与代码同源；破坏性变更写进 README |

**这一节比上面几节更重要**：把"没有判据"的区域写出来，读者才不会把绿色的
`npm run ci` 当成"全部保证"。

### 5.1 阻断阈值与门禁牙齿（A-13）

阈值是**绝对值**，不是与上一版比对；改阈值必须在 commit body 写明「旧值 → 新值 + 理由 + 连续实测」。
渲染类阻断阈值为实测值的 2–4 倍（本机 2026-11-06 收口复跑：avg 0.37ms / P95 0.48ms / 重建 25.9ms / 直接帧 22.58ms / heapUsed 23.67MB；历史区间 14.48–23.88MB）。

| 指标 | 阻断阈值 | 实测（Node 桩 / 2000 对象 / 1600×900，多次区间） | 说明 |
|---|---|---|---|
| 缓存帧平均 | ≤ 8 ms | 0.34–0.48 ms | 50fps 预算的一半，下限保护 |
| 缓存帧 P95 | ≤ 3 ms | 0.42–0.91 ms | 偶发卡顿不能靠平均帧掩盖 |
| 缓存帧 P99 | ≤ 10 ms（仅告警） | 0.79–1.23 ms | 先积累数据，不阻断 |
| 静态层重建 | ≤ 60 ms | 21.9–31.3 ms（收口 25.9 ms） | 对象增删改时触发 |
| 直接全量帧 | ≤ 60 ms | 20.8–29.32 ms（收口 22.58 ms） | 导出/打印路径 |
| `heapUsed` | ≤ 64 MB | 14.48–23.88 MB（收口 23.67 MB） | bench 结束时读数，不含长跑斜率 |
| 覆盖率分析 | ≤ 300 ms | 7.7–8.3 ms（历史 7.4–14.4 ms） | 1000×1000m + 30 摄像头 |
| 大场地覆盖率分析 | ≤ 300 ms | 14.1–17.4 ms | 5000×5000m + 30 摄像头，173889 格 |
| 规则检查（2000 对象 / 30 类型） | ≤ 500 ms | 14.3–15.5 ms | minX 扫描线；全量两两对照约 15.7s（仅本地 `--brute`） |
| 覆盖率缩放差异 | ≤ 1 个百分点 | 0 pp | 同一图纸 zoom 0.25 / 1 / 4 / 16，均 44.42% |
| 视口裁剪率 | ≥ 60% | 99.4% | 高倍缩放下 |
| 符号渲染（500 图元直接帧） | ≤ 60 ms | 2.83–3.91 ms（收口 3.07 ms） | 六类混合 + 部分真实尺寸 + 旋转 |
| 符号库索引加载 | ≤ 10 ms | 0.012–0.014 ms（36 个图元） | `buildSymbolIndex()` 200 次平均 |
| SVG 导入（可达最坏组合） | ≤ 50 ms | 1.058 ms（199 路径 / 62,154 B；2026-11-07） | 元素上限 200 含根节点，path 有效上限 199；「200×5000」约 1 MB，被 64 KB 上限快速拒绝（不设耗时门禁） |
| 单文件体积 | ≤ 820 KB（839,680 B） | 758.5 KB（776,704 B） | 余量 62,976 B（D-11 字典收敛后；门禁口径 2026-11-06 由 750 KB 提到 820 KB，为后续 C 系列功能留空间） |
| 产物体积（gzip） | 只打印，不阻断 | 235.8 KB（241,484 B） | 对外发布/下载指标；不同 zlib 版本字节可能不同，故不作为门禁 |
| 产物 SHA256 | 必须等于 `scripts/dist-manifest.json` | `1f89ec03e99a…` | 从源重建、二次构建确定性一致 |
| CSP 内联脚本哈希 | 哈希数 = 内联脚本数（剔除 HTML 注释） | 42 = 42 | 单文件包每个内联脚本一条 `sha256` 白名单；`script-src` 不得含 `'unsafe-inline'` |
| 断言数 | ≥ 1870 且 0 失败 | 2706 | 只增不减 |

**自测分区与过滤（D-13，2026-11）**：`scripts/selftest.mjs` 用 `section(name, fn)` 注册 **108 个分区**
（分区边界沿用原注释区块，断言内容未移动）；`--list` 输出分区清单，`--filter=<regex>` 只执行名称匹配的分区
（不区分大小写），失败行与汇总均带 `[分区名]`。默认执行仍按原顺序全量运行：**2706 通过 / 0 失败**；
分区化只改测试脚本，产物 **0 B** 变化。

**覆盖率统计口径 v2（B-09，2026-11）**：栅格改为**固定目标 18000 格**，按可见区域面积分配
（`js/core/config.js` 的 `APP_LIMITS.COVERAGE_TARGET_CELLS`），格边 = √(面积/分得格数) 并夹在
0.03–10m；总格数超过 `COVERAGE_MAX_CELLS`（20 万）时统一放大格边。该口径**与视口缩放、
画布像素和 DPR 完全无关**，同一图纸 4 个缩放级别实测差异 **0.00pp**（selftest 同时断言完全相等）。
分母与覆盖只统计**可见对象与可见图层**，隐藏后重算可复现。镜头口径固定为：张角取类型 `fov`
（默认 90°，10–360°，360° 视为全向），有效距离取点设备 `phys`（m），扇形半径 = phys、
圆/方 = phys/2；未填 `phys` 的图标点不计入。**历史 v1 报告的格数随缩放自适应，数值不可直接
对比**；覆盖率弹窗与盲区输出均标注 v2。布点优化仍使用固定低分辨率规划网格（与缩放无关），
其「当前覆盖率」以报告 v2 口径为准。

**版本快照与对比（B-04，2026-11）**：快照走 IndexedDB 独立命名空间
`snap:<projectId>:<snapshotId>`，键空间与草稿 `current`、工程 `proj:<id>` 独立；
每个工程最多保留 **20 条 / 16 MB**，超出按创建时间淘汰最旧。
资产 GC（A-01）现在把 `snap:<pid>:*` 一并纳入可达集：快照记录是 `{meta,data}` 外壳，
必须解包 `data` 后收集 `background.assetId` / `props.photoId`，否则整条快照链会被漏扫。
快照删除或工程删除后引用消失，相关资产可在下一次 prune 正常回收，不会被永久钉住。
快照保存对象、楼层、场地、底图 `assetId`、照片 `photoId` 与校准参数（`transform` /
`metersPerPixel`），生成前把内嵌照片转成内容寻址资产，**不复制 base64**。
真实 Chromium 实测（`snapshot.spec.mjs`，本机 Windows，5 轮）：1000 对象生成快照
**14.7–35.3 ms**（含 IndexedDB 写入，受机器负载波动），快照数据 **400779 B ≈ 391.4 KB**（约 400 B/对象），
远低于 2s 建议值。A/B 差异按对象 id 跨楼层匹配，固定分类
新增 / 删除 / 属性修改 / 移动 / 换楼层 / 类型变更；忽略 `id/z/createdAt/updatedAt/photoDataUrl`
等运行时字段。构造样本（20 个未变 + 六类各 1 条）实测分类全部正确、**误报 0/20（0%）**；
50 条人工差异样本本轮**未验证**（见 CHANGELOG.internal.md 遗留项）。

**历史栈结构共享（B-10，2026-11）**：撤销栈不再对 `state` 做 20 份 JSON 深拷贝。
`pushHistory / undo / redo` 改用 `snapshotHistoryState`（`js/core/model.js`）：
与上一份**已标记快照**逐层深比较，未变子树直接复用，变化子树新建；字符串（含照片 base64）
按引用共享，不复制字节。快照顶层带不可枚举 `Symbol` 标记，`history.past/future` 仍是
state 形状的普通对象数组（`assetRefsInMemory`、`ContentAssets.collectAssetRefs`、
交互层 `history.past.pop()` 与外部手工 push 的普通条目全部保持兼容）。
`undo/redo` 弹出快照后先 `materializeHistoryState` 物化——容器重新分配、字符串继续共享——
避免 live 编辑污染被其他栈帧共享的子树；落盘时机（`markDirty('restore')`）与 20 条上限不变。
真实 Chromium（`history-increment.spec.mjs`，本机 Windows，CDP `HeapProfiler.collectGarbage`
+ `Runtime.getHeapUsage`，1000 对象 + 10 张 100KB 内嵌照片，每步只改一个对象）：
20 条历史 GC 后堆增量 **28.26 MB → 1.03 MB（下降 96.4%）**；
20 次 push **117.0–159.8 ms → 45.5–48.1 ms**；1000 对象单次 `undo` 同步耗时 **4.0–18.5 ms**
（3 轮 5 次采样；HEAD 基线单轮 2.4–5.0 ms，增量来自物化副本，仍远低于 100 ms 建议值）。
注意：`JSON.stringify(history.past)` 仍为 **26.70 MB**——每条快照逻辑上仍是完整工程，
体积下降来自**内存结构共享**而非序列化格式变更。

**协作易用性与消息层加固（B-06，2026-11）**：先补消息层护栏，再做邀请/状态/冲突 UI。
入站分块缓冲设 **30s TTL / 64 个 key / 16MB 总字节**上限，按 `lastAt` 最旧优先淘汰；
重复 `hello`（同 sender + 同 name，1.5s 窗口）只处理一次；`BroadcastChannel.postMessage`
与 `dc.send` 全部 `try/catch`，失败返回 `false` 并写入 `window.__collabLastError`，
快照发送失败 2s 后重试；DataChannel `bufferedAmount > 2MB` 时跳过并提示「通道拥塞」；
sender/id 长度上限 96 字符，分块 `total * 48000` 预算不超过单消息上限。原「异常即静默」
的断开路径改为可见错误态（`error`）与中文原因。
邀请串为 `PLOTPIN-COLLAB:1:O|A:<base64(清洗后 SDP)>`，同时兼容直接粘贴裸 SDP；
三步建连：主机生成邀请 → 客机粘贴生成应答 → 主机粘贴应答。内置二维码编码器固定
Version 3-M、`Qr.MAX_BYTES=42`，实测邀请串 **767 字节**远超该上限，面板只显示明确提示并
**不渲染二维码**（不伪造不可扫码）；这一验收项（SDP 直接进二维码）**未达成**。
状态机为 `idle / waiting / connecting / connected / disconnected / error`，面板常驻
`#collabPeers`（已连接对端 / 等待对方接入 / 已断开）与 `#collabStatus`（最近事件），
异常断开、发送失败、通道拥塞都可见，不再生吞错误。
冲突在面板常驻显示 `最近一次合并：+a ~u -d · 冲突 N`，存在 LWW 覆盖（更新 / 删除 /
楼层元数据覆盖）时追加「已写入撤销栈，可 Ctrl+Z 回滚」；纯新增不写历史。合并 stats 新增
`floorMetaUpdated` / `floorsDeleted`，`mergeHistoryNeeded(stats)` 是「是否需要为合并写撤销栈」
的唯一判据（`history:'overwrite'` 只在覆盖发生时才 `pushHistory`）。
实测：selftest 1886 → **1914 通过 / 0 失败**（+28，含邀请串往返、QR 容量、TTL/key/字节
上限、hello 去重、合并历史判据）；e2e **39 passed / 1 skipped**（46.8s，5 分钟浸泡默认跳过），
B-06 新增 `collab.spec.mjs` 5 个用例；同机双标签 WebRTC 建连 `open=true`、**73–95ms**（3 次）。
5 分钟离线浸泡实测通过（5.1min 用例，重连后本地新增对象对端可见）；双设备真机 WebRTC
**未验证**（本轮只有同一台机器上的两个标签页）。详见 CHANGELOG.internal.md。

**导出字段表单一来源（B-08，2026-11）**：新增 `js/features/io-fields.js`。`EXPORT_FIELD_DEFS` 是
CSV/TSV/XLSX/PDF 清单/打印报告的唯一字段来源：`TABLE_COLUMNS` 由 `table:true` 条目派生，
`buildExportRow` 是唯一行渲染器，`exportShapeSummary` 统一形状外接盒与形状参数，
`exportParamText` 统一「参数」合成列，`LEDGER_FIELDS` 由字段表 `ledger` 标记派生并与表格导入共用，
`xlsxExportTable` 为纯函数。SVG/DXF 标注读数统一走 `dimensionMeasure`，夹角由
`dimensionAngleDeg`（`js/core/geometry.js`）供画布/SVG/DXF 三处共用；盲区 GeoJSON 属性由
`BLIND_SPOT_FIELDS` + `buildBlindSpotGeoJson` 唯一生成，导出函数只负责提示与下载。
验证口径：固定工程样本（14 类对象 + 场地 + 四种标注 + 形状族）在 HEAD 工作树与改造后的真实 Chromium
分别导出 8 种产物，**8/8 字节级 SHA-256 一致**：CSV 2,227 B、TSV 2,227 B、XLSX 30,762 B、
GeoJSON 249,101 B、PNG 786,440 B、PDF 339,954 B、SVG 17,062 B、DXF 7,249 B。PDF 清单页标题含
`new Date()`，采集时冻结时间；GeoJSON 的 `regionId` 来自对象 id，采集时固定 id；其余无时间/随机量。
单文件体积 **741.3 KB → 744.6 KB（759,056 → 762,500 B，+3,444 B / +0.45%）**：新增字段表模块约 6.5 KB，
删除各格式重复拼装（`objectRows` 内联分支、PDF `param`、GeoJSON 属性、`angleDimDeg`）后净增 3.4 KB；
当时的 ≤750 KB 门禁通过（余量 5,500 B；门禁已于 2026-11-06 提到 820 KB）。

**DXF 实体/版本增强（B-03，2026-11）**：`js/common/dxf.js` 适配层不改 `ngm.vendor`，在公共模块之上补齐
版本审计与公共模块未覆盖的常见实体。`Dxf.inspect(text)` 读取 `$ACADVER` / `$INSUNITS`，扫描 ENTITIES 与
BLOCKS 段，返回 `{version, versionName, knownVersion, insUnits, entityCounts, supplementalTypes,
unsupportedTypes, entityTotal, supportedCount, blocks, r12Bulge, binary}`；二进制 DXF 直接返回空实体，
由 `importDxfFile` 提示「另存为 ASCII DXF」。`Dxf.parseDxf(text)` 在公共模块结果上追加
`SOLID`（按 0,1,3,2 重排闭合顺序）、`3DFACE`（自然顺序）、`LEADER`（开放折线）、`ATTRIB`/`ATTDEF`（文字），
并按 `parsed.unit` 做同样的毫米/厘米/英寸/英尺换算；公共模块原实体、`unit` 字段与 app 侧字段映射保持不变。
暂不支持的类型（DIMENSION / HATCH / MLINE / XLINE / RAY / IMAGE / WIPEOUT / REGION / 3DSOLID 等）不猜测
几何，计数后随导入提示如实列出。R12 `POLYLINE` 的 VERTEX 凸度（42）公共模块会丢弃，`inspect` 单独计数并在
导入后提示「弧段被拉直」。
验收数据：selftest **2016 → 2086 通过 / 0 失败**（B-03 新增 70 项：8 个版本 × 版本号/名称/已知性/实体数/
补充实体数/不支持类型/支持计数 + SOLID 重排、3DFACE 顺序、LEADER 开放、ATTRIB 文字与字高、单位换算、
二进制识别、未知版本、R12 凸度、仅不支持实体）。e2e `dxf-version.spec.mjs` **2 passed（3.7s 单独运行）**，
全量 e2e **39 passed / 1 skipped（46.8s）**：AC1032 混合实体（LINE/SOLID/3DFACE/LEADER/TEXT/ATTRIB/DIMENSION）
导入后 4 线 + 2 文字、2 个闭合区域、图层齐全，提示含「版本 AC1032」与「补充解析」；二进制 DXF 给出明确指引
且不产生对象。体积 **779,096 → 787,499 B（+8,403 B / +1.08%）**，gzip **255,447 → 258,127 B（+2,680 B）**，
820 KB 门禁余量 **52,181 B**。
**真实 CAD 样本矩阵未验证（未验证 + 原因）**：仓库无 AutoCAD/BricsCAD 导出的真实 DXF 样本，当前矩阵使用
按 DXF 组码规范合成的 ASCII 样本；R13/R14 真实文件、带代理对象/外部参照/动态块的文件未覆盖。

**DXF 预检 / 单位确认 / 双落点 + DWG 兼容入口（B-02，2026-11）**：导入链路改为
「读取 → `Dxf.inspect` 预检（二进制直接拒绝）→ `parseDxf(text,{strictUnits:true})` 校验实体与上限 →
预检模态（版本/单位/实体数/块/补充解析/不支持类型 + 单位下拉 + 落点下拉）→ 用户确认 →
`applyDxfImport` 事务化提交」。单位改判经 `parseDxf(...,{forceUnit})` 以完整 `$INSUNITS` 表整体缩放：
`forceUnit` 为空时保持文件口径，指定后按目标米系数与文件已换算系数的比值缩放全部几何与文字字高。
落点两档：`editable` 按原图层建对象（缺层自动补开放层）；`reference` 新建
`DXF参考 · 文件名 · 版本` 图层并 `locked:true`，全部实体落该层。提交前后用
`snapshotHistoryState` / `materializeHistoryState` 兜底：异常时恢复快照、弹出该条历史、清空选择并重绘，
不留下半导入对象。DWG 入口只读文件头 `AC10xx`（`dwgVersionInfo`）识别 R12–2018，弹「转 DXF / 转 PDF / 取消」
指引；选择转换产物走临时 `<input type=file>`（`pickConvertedFile`），不污染主入口 `accept`；不内置 DWG 内核、
不引入依赖、不修改原文件。主入口 `.dwg` 已加入 `accept`，不再报「不支持的文件类型」。
验收数据：selftest **2086 → 2105 通过 / 0 失败**（B-02 新增 19 项：DWG 4 个版本/非 DWG 头识别、参考层命名
去扩展名/缺省名/40 字截断、保真度报告版本/单位/实体/不支持类型/纯文本行、单位改判毫米→米 ×1000、
auto 保持原值、无 `$INSUNITS` 按米）。e2e `dxf-version.spec.mjs` **4 passed（3.9s 单独运行）**，
全量 e2e **41 passed / 1 skipped（46.7s）**：AC1032 混合实体预检确认后导入；单位改判 + 参考层落点后
坐标 ×1000、图层名含 `DXF参考` 且 `locked=true`；DWG 入口显示 AC1032（2018）与转 DXF/PDF 指引、
`accept` 含 `.dwg` 且不产生对象。体积 **787,499 → 796,031 B（+8,532 B / +1.08%）**，gzip
**258,127 → 260,906 B（+2,779 B）**，820 KB 门禁余量 **43,649 B**，SHA256 `6174843d59c8…`。
**未验证（原因）**：DWG 真实文件头之外的字段、真实 DWG→DXF 转换产物与动态块/外部参照/代理对象丢失情况
仓库内无样本，仅按文件头与规范合成用例验证；参考层锁定后的 UI 交互（图层管理器解锁）沿用既有 e2e 覆盖，未另加。

**世界变换统一入口 `applyWorldTransform`（B-12，2026-11）**：`js/core/geometry.js` 新增
`applyWorldTransform(M, opts)`，`M` 为旧世界→新世界的 2x3 仿射（长度 6 数组或 `{a,b,c,d,e,f}`）。
一次调用完成：① 既有对象迁移（复用 `migrateObjectsByAffine`：坐标、角度、设备物理尺寸 `phys`、
文字字高、线宽、圆/椭圆/扇形参数，圆在非等比下升级椭圆）；② 图片底图——有显式 `transform` 时
左乘 `M`（或由 `opts.bgTransform` 直接落新仿射），否则只按面积因子缩放 `metersPerPixel`（默认映射随之变化），
并按新仿射重算等效 m/p；③ 矢量场地默认**不迁移**（沿用「场地优先校准」：场地是真值参考），
需要整体换坐标系时传 `{site:true}`，场地按真实轮廓转换（轴对齐保留类型、圆→椭圆、旋转矩形→多边形）。
退化/非法变换直接返回 `{ok:false}` 且不改动任何状态。`finishCalibration` 与 `finishAffine` 改为调用该入口；
旧签名 `scaleWorldAround(center,factor)` 保留为包装（围绕任意中心等比缩放，迁移对象与底图，场地同样默认不动），
`migrateObjectsByAffine(objects,M)` 原样保留供旧调用方使用。
**数据影响面**：比例尺校准后，已仿射校准的底图 `transform` 会被左乘缩放矩阵（此前只改 `metersPerPixel`，
导致对象与底图错位）；对象 `phys`/文字字高/线宽开始随世界缩放同步变化（此前比例尺路径漏缩放）；
矢量场地坐标不变（与既有文档语义一致）；无 `transform` 的图片底图不写入 `transform`，保持 `null`。
验收数据：selftest **2105 → 2133 通过 / 0 失败**（B-12 新增 28 项：摘要、对象/物理尺寸、场地 opt-in 与默认不动、
底图 transform 复合与 m/p、无 transform 仅缩放 m/p、退化拒绝、场地圆→椭圆/旋转矩形→多边形、旧签名等价）；
e2e `world-transform.spec.mjs` **2 passed（2.9s）**，全量 e2e **43 passed / 1 skipped（47.3s）**；
体积 **796,031 → 800,804 B（+4,773 B / +0.60%）**，gzip **260,906 → 262,303 B（+1,397 B）**，
820 KB 门禁余量 **38,876 B**，SHA256 `3dd0d50d0286…`。
**未验证（原因）**：圆/椭圆/扇形在含**切变**的一般仿射下按两轴长度近似（切变无法用椭圆参数精确表达，
仅中心/外包框保持正确）；真实 CAD 现场的多次交替校准（比例尺↔仿射反复）无样本，仅合成状态验证。

**表格驱动布点与条件批量替换（B-08 原义，2026-11）**：在既有「按编号更新 / 无编号新增」之上扩展
`rowsToObjectsPlan`：表头可含 `操作`（新增 / 更新 / 替换）与 6 个 `匹配…` 条件列（编号、名称、名称包含、
对象类型、业务类型、图层）。条件替换行对**全部匹配列同时满足**的对象批量写回属性（名称、业务类型、图层、
型号、安装高度、IP、责任人、备注、显隐、锁定），几何保持不变；匹配范围可用 `楼层` 列限定，默认跨全部楼层。
**严格模式判据**：存在 `操作` 列才启用——任一行非法（未知编号、未知业务类型/图层、非法台账值、替换缺条件、
新增编号重复、未知楼层、非法操作值）写入 `plan.errors`，预览只显示错误且不提供「合并导入」；
`applyTableImport` 对带 errors 的计划直接拒绝。无 `操作` 列的表头保持旧行为（逐行告警/跳过），
不改变既有模板。所有新增/更新仍复用 `withObjectNameScope` 与 `importLimitErrors`，批量应用前再校验对象数上限；
应用失败时用 `snapshotHistoryState` 快照回滚，`history.past` 弹出本次空帧，避免半批对象落盘。
公式防护改为**导入导出共用一份**：`formulaGuard` / `formulaUnguard` 位于 `io-fields.js`，导出仍对
`= + - @`/Tab/CR 开头且非纯数字的单元格加前导单引号，导入时仅当原值确实会被防护才去掉该引号
（`'123` 保持字面），保证 CSV/XLSX 往返文本不变形。
验收数据：selftest **1994 → 2016 通过 / 0 失败**（B-08 新增 22 项：严格模式识别、替换命中数与属性、
批量落点坐标、非法行整批拒绝、非法台账值/缺条件报错、公式引号还原、500 行全量新增）；500 行表格
（`对象类型,X,Y`）实测**规划 3–5 ms、应用 8–15 ms**（Node 逻辑层，非浏览器渲染耗时）。
`e2e table-batch.spec.mjs` 2 passed（3.6s，含本地服务器启动）：条件替换命中 2 台 + 新增落点 (10,20) 可复算；
非法更新行整批拒绝且现有对象不变。体积 **771,344 → 779,096 B（+7,752 B / +1.01%）**，gzip
**253,036 → 255,447 B（+2,411 B）**，820 KB 门禁余量 **60,584 B**。
新增全局：`TABLE_MATCH_COLUMNS / TABLE_IMPORT_EXTRA_COLUMNS / tableImportColumns / rowMatchesObject /
applyTableCommonCells / formulaUnguard`；`rowsToObjectsPlan` 返回值新增 `replaces / errors / strict` 三个字段
（既有 `updates / creates / warnings` 不变），`applyTableImport` 签名不变但会拒绝带 errors 的计划。

**设备产品库与 BOM 报价（B-05，2026-11）**：新增 `js/features/catalog.js`（层 2，`index.html` 插在
`io-export.js` 之后）。目录 JSON schema 为 `plotpin-catalog/v1`，根为 `{schema, items:[...]}`，
型号项字段 `vendor / model / category? / unit? / price / params?`（`name/updatedAt` 不属于 schema，
导出只回写规范化结果）。`catalogValidate` 的校验规则：根必须是非数组对象；`schema` 必须精确匹配；
`items` 必须非空数组且 ≤2000 项；每项必须是对象；`vendor` / `model` 去空白后非空；
`price` 必须是有限数且在 `0…1e9`；`params` 可省略，出现时必须是非数组对象；`vendor+model` 不得重复。
通过后规范化：`category` 缺省「其他」并截断 40 字符，`unit` 缺省「台」并截断 10 字符，`params` 缺省 `{}`。
存储复用 `persistence.js` 的 `projects` 对象仓，键为 `catalog:current`（不升级 `DB_VERSION`）；
导入走 `importCatalog`：**校验 → `idbPutKey` → 才替换内存目录**，任一步失败 IDB 与内存均保持原值
（selftest 用注入的落盘函数模拟写入失败）。删除/导出走导出下拉的「删除目录 / 导出目录」。
属性面板「型号」输入在载入目录时挂 `list="catModels"`（datalist 列出型号），「数量」写 `props.qty`
（缺省按 1 计）。`quoteAggregate(catalog)` 是 BOM 的唯一聚合器：先 `syncActiveFloor()`，再遍历全部楼层
（含非活动楼层 `f.objects`）按 `厂商+型号` 聚合数量；对象只有型号时，若该型号在目录中唯一则自动绑定
厂商/单价；跨厂商重名时不绑定，记入 `ambiguous` 供面板/导出明确提示，不会静默错绑。`quoteTable` 只负责
按 `QUOTE_FIELD_DEFS` 映射列，与对象字段表同处 `io-fields.js`；CSV 经 `delimitedFromTable`（沿用
`guardFormula` 公式注入防护）、XLSX 经 `Xlsx.build`，两者只消费同一表格，不另写表头/行渲染。
可复算样本（selftest 断言）：F1 海康 `DS-2CD` ×3 @1,200 = 3,600；F1 大华 `DH-1` ×1 @350 = 350；
F2 西门子 `SM-9` ×2 @900 = 1,800；合计数量 **6**、合计金额 **5,750**。e2e 另测 F1 ×5 + F2 ×2
= **7** @1,200 = **8,400**。导出字段为「厂商、名称、数量、单价、小计」+「合计」行；有目录时追加
「目录版本 / 导出时间」两列（仅合计行有值）。`catalogVersion` 为目录 items 的 FNV-1a 32 位内容指纹；
导出同时把当次表格写入 IndexedDB `quote:last`，行集合（厂商/型号/数量）不变时**重导沿用冻结单价**
（替换目录不改写已定稿报价），数量/型号变化才按当前目录重新计价——e2e 实测替换 1,200→2,000 后重导仍
为 1,200，改数量后变 2,000。未载入目录时降级为「名称、数量」两列且不臆造金额。
体积 **767,954 → 771,344 B（+3,390 B / +0.44%；累计相对 762,512 B 基线 +8,832 B）**，820 KB 门禁通过
（余量 68,336 B）；selftest 1982 → **1994 通过 / 0 失败**；e2e `catalog.spec.mjs` 覆盖到快照复用、改数量
重算、跨厂商重名（未填厂商不带价 → 填厂商后按精确键计价）与非法目录回滚。CSV/XLSX 均做解析回读数值
往返；**Excel/WPS 人工打开未验证**（只验证 OOXML 结构与数值往返）。详见 CHANGELOG.internal.md。

**门禁牙齿（`npm run gates`）**：上面这些判据本身也会假绿（只打印不比对、缺文件退 0、
模板缺失空操作）。`scripts/check-gates.mjs` 在系统临时目录的整仓副本里构造 5 种破坏——
P95 超标、`dist` 产物篡改、`ngm.json` 缺失、README 断言数模板缺失、selftest 失败——
断言对应门禁全部非 0 退出。它不碰仓库本身，也不依赖任何第三方包。

### 5.2 浏览器级测试（A-14，可选）

已独立成文：[testing.md](testing.md)（e2e spec 清单、覆盖边界、运行方式与 B-13/B-07/B-14/B-15 技术说明）。门禁阈值与断言数见 §5.1，真实浏览器性能基线见 [performance.md](performance.md) §5.4。

### 5.3 资源上限（`APP_LIMITS` 唯一源）

`js/core/config.js` 的 `APP_LIMITS` 是缩放、图标倍率、底图解码、导入与存储边界的**唯一来源**；
业务代码不得另写魔法数字。导入侧统一由 `importLimitErrors(spec)` 判定（A-09）。

| 常量 | 值 | 作用点 |
|---|---|---|
| `ZOOM_MIN` / `ZOOM_MAX` | 0.02 / 200 | 画布缩放夹取 |
| `ICON_SCALE_MIN` / `ICON_SCALE_MAX` | 0.2 / 8 | 图标全局/单对象倍率 |
| `SEG_LABEL_MIN_PX`（可调区间 10–60） | 26 px | 段长标注最小屏幕像素 |
| `BG_MAX_EDGE` / `BG_JPEG_QUALITY` | 3000 px / 0.85 | 底图最长边降采样与透明图转 JPEG |
| `BG_RECOMPRESS_LIMIT` | 6 MB | 超过该体积的透明底图转 JPEG |
| `BG_MAX_DECODE_PIXELS` | 40 MP | 单张底图解码像素上限（导入前校验） |
| `ASSET_MAX_BYTES` | 16 MB | 单个内容寻址资产（底图/照片） |
| `IMPORT_FILE_MAX_BYTES` | 32 MB | 所有导入文件体积（含工程合并） |
| `IMPORT_TEXT_MAX_CHARS` | 32 MB | JSON/CSV 文本字符数 |
| `IMPORT_ROWS_MAX` | 20000 | CSV/TSV/XLSX 行数 |
| `IMPORT_ENTITIES_MAX` | 100000 | DXF/PDF 实体数 |
| `OBJECTS_MAX` | 100000 | 单工程对象总数（含所有楼层） |
| `HISTORY_MAX` | 20 | 撤销栈深度 |
| `TOMBSTONE_MAX` / `TOMBSTONE_EVICT_BATCH` | 20000 / 2000 | 墓碑硬上限与增量淘汰批量（A-11） |
| `TOMBSTONE_RETENTION_DAYS` | 730 天 | 墓碑保留窗口（超窗才允许按时间淘汰） |
| `COVERAGE_TARGET_CELLS` | 18000 | 覆盖率口径 v2 的固定目标总格数（按可见区域面积分配） |
| `COVERAGE_MAX_CELLS` | 200000 | 单次覆盖率分析的栅格总格数上限（超限统一放大格边） |
| `COVERAGE_CELL_MIN_M` / `COVERAGE_CELL_MAX_M` | 0.03 / 10 | 格边夹取区间（m）；超大场地超格数上限时仍可继续放大 |
| `SNAPSHOT_MAX_PER_PROJECT` | 20 | 每个工程保留的版本快照条数（超出淘汰最旧，至少留 1） |
| `SNAPSHOT_MAX_BYTES_PER_PROJECT` | 16 MB | 每个工程快照数据总量上限（按 `meta.bytes` 累加，超出淘汰最旧） |

### 5.4 真实浏览器性能基线（B-01，可选门禁）

已独立成文：[performance.md](performance.md)（4 档实测、阻断阈值、方法学边界与 B-01/B-09/B-11 结论）。Node 桩阻断门禁见 §5.1。

---

## 6. 怎么加一条新判据

1. **先问三件事**：违反了会怎样？能不能用"读文件 / 跑命令 / 比数据"回答？过去 3 个月违反过吗？
   三个都过才动手。
2. **写成单项**：能单独跑，打印**读数**（扫了多少、比了多少），读数为 0 视为失败（空跑比漏报更糟）。
3. **配一颗牙齿**：构造一份"应当失败"的输入并断言它失败（`--selftest` 是现成的形状）。
4. **挂进 `check.mjs`**，并确认本地与 CI 走同一条命令。
5. **在本文档登记**：守什么、违反的后果、什么情况下可以删。

> 一条判据被**阻断过一次**才算成立。加进来之后三个月没红过、也没人看得懂它在守什么，
> 就应该删掉——它制造的是"查过了"的错觉。

---

## 附：十三问看板（成熟度自评）

> `engineering-discipline.md` §8 的十三问清单，做成了一个脚本：它**不替代**任何判据，
> 只回答"这个仓库现在几档、缺哪一条"。

```bash
npm run discipline
```

结构上不适用的问写在 `docs/discipline-exemptions.json`（理由必须写清为什么结构上不成立；
"暂时没做"不是理由）。不适用项从分母剔除，而不是从分子加分。

当前：**13/13（L4）**。第 11 问已通过按主题拆分满足：`engineering.md` 47.8 KB / 533 行，
测试体系见 [testing.md](testing.md)（13.5 KB / 92 行），性能基线见 [performance.md](performance.md)（10.1 KB / 107 行），
三份文档均低于 60 KB / 600 行；拆分只移动内容、未改判据或阈值。其余 12 问全部有可复跑判据。
最近一次修正：第 13 问的 `scripts/*.js` 正则缺少右边界，会把 `scripts/dist-manifest.json` 误判为不存在的
`.js` 脚本。
