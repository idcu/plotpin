# 工程规范与门禁（Engineering）

> 本文是工程约定的**唯一事实来源**：目录分层、构建打包、每条门禁的真实判据、预算与禁止事项。
> 测试用例组织见 [testing.md](testing.md)，性能数据见 [performance.md](performance.md)，人工验收见 [manual-acceptance.md](manual-acceptance.md)。
>
> 原则：**任何「我们保证了 X」都必须能指向一条会变红的判据；没有判据的，就明说不保证。**
> 本文以脚本与代码为准。易漂移的量（产物体积、断言数、用例数、覆盖率、缓存版本）只写采集日期与命令，
> 单一来源见各节；引用旧文档的数字前必须重新核对。
>
> 本轮核对时间：2026-11-08（Windows 10，Node v24.14.0，HEAD 以 `git rev-parse` 为准）。

---

## 1. 目录与分层

```
index.html            唯一入口（classic <script> 顺序加载）
sw.js                 Service Worker（必须在站点根目录）
js/common/            第 0 层：纯数据/算法/适配器，不依赖 core/features
js/core/              第 1 层：状态、模型、渲染、交互、持久化
js/features/          第 2 层：页面级功能（导出、面板、规则、插件…）
js/core/app.js        第 3 层：入口装配（最后加载）
scripts/              开发期工具与门禁（零运行时依赖）
scripts/lib/          门禁共享工具（walkFiles / readJson）
tests/e2e/            Playwright 功能用例（devDependency）
tests/perf/           Playwright 真实浏览器性能采集
tests/golden/         逐字节 golden 基线
tests/fixtures/       测试夹具（旧工程、SW 测试页等）
contracts/            机器可读契约（约定 / 插件 API 面）
ngm.json / ngm.lock   第三方依赖清单与锁（vendor 接线）
```

**分层判据**（`scripts/check.mjs` 第 9 步）：

- `js/` 下只允许 `common / core / features` 三个目录；
- `index.html` 中的脚本加载顺序必须按层**非递减**（0 → 1 → 2 → 3），不允许层序倒退；
- 新增 `js/**/*.js` 必须被 `index.html` 引用（第 3 步双向核对）；
- 每个 `js/**/*.js` 必须有且仅有一行文件头 `/* 文件名.js —— 职责 */`（`contracts/conventions.json` 的 `headers`）。

classic `<script>` 共享全局作用域，**目录边界是唯一还能被机器核对的模块边界**；跨层直接读取下层数据是允许的，反向依赖不允许新增。

---

## 2. 构建与打包

### 2.1 两种使用形态

| 形态 | 入口 | 说明 |
|---|---|---|
| 源码直开 | `index.html` | 双击即可用；脚本逐文件加载，便于调试 |
| 单文件发行包 | `dist/plotpin-standalone.html` | `node scripts/build.mjs` 生成，内联全部 CSS/JS，可离线分发 |

`scripts/pack-core.mjs` 负责内联，`scripts/minify-core.mjs` 只做**语义安全**的压缩：删注释、行首缩进、空行与行尾空白；
字符串 / 模板字面量 / 正则逐字节保留；**源文件不压缩**，`index.html` 仍引用可读源码。
每个内联脚本压缩后立刻用 `vm.Script` 解析，解析失败直接构建失败。

### 2.2 `build.mjs --check` 的真实判据

| 判据 | 失败条件 |
|---|---|
| 体积上限 | 产物 > **820 KB（839,680 B）** |
| 构建确定性 | 同一份源连续两次构建的 SHA256 或字节数不同 |
| CSP 存在 | 发行包缺少 `Content-Security-Policy` |
| CSP 脚本策略 | `script-src` 含 `'unsafe-inline'` |
| CSP 哈希数 | 内联脚本数（剔除 HTML 注释）≠ `sha256-…` 白名单条数 |
| 登记哈希 | 构建结果的 SHA256 / 字节数与 `scripts/dist-manifest.json` 不一致 |
| 登记缺失 | `scripts/dist-manifest.json` 不存在或不是合法 JSON |
| 本地产物 | `dist/` 存在时，其字节或哈希与源重建不一致 |
| gzip 体积 | gzip > **280 KiB（286,720 B）**；> 260 KiB（266,240 B）只预警 |
| 预算常量 | `dist-manifest.json` 的 `maxBytes` / `gzipMaxBytes` 与 `scripts/lib/budget.mjs` 不一致 |

改 `js/**`、`css/`、`index.html` 后必须运行 `node scripts/build.mjs` 刷新登记值，否则 CI 必红。
`dist/` 与 gzip 体积都会打印；gzip 设硬上限 280 KiB（不同 zlib 版本字节可能不同，阈值留了余量）。
体积余量分级预警（不阻断）：余量 < 8,000 B 警告，< 6,000 B 强警告。阈值常量只在 `scripts/lib/budget.mjs` 维护。

### 2.3 体积预算（易漂移，指向单一来源）

- 硬上限：**839,680 B**（代码常量 `MAX_BYTES = 820 * 1024`，`scripts/lib/budget.mjs`；`dist-manifest.json.maxBytes` 必须一致）。
- gzip 硬上限：**286,720 B（280 KiB）**；`GZIP_WARN_BYTES = 266,240` 只预警（同上，`lib/budget.mjs` 单一来源）。
- 分级预警：余量 < `MARGIN_WARN_BYTES = 8,000 B` 警告；< `MARGIN_CRITICAL_BYTES = 6,000 B` 强警告（不阻断构建）。
- 当前值：以 `scripts/dist-manifest.json` 的 `bytes / gzipBytes / sha256` 为准，汇总与采集命令见 [facts.md](facts.md)。
  2026-11-10 实测：`bytes = 834,125`、gzip `259,816`、余量 `5,555 B`（`node scripts/build.mjs --check` 复算一致）。
- 预算分配：任何新功能提交都必须在 commit body 写「体积增量 + 剩余余量」。逼近上限时只能做无损回收，**不得调高上限**。

---

## 3. 门禁清单与真实边界

### 3.1 总闸与命令

```
npm run ci  =  node scripts/check.mjs --selftest
            && node scripts/bench.mjs
            && node scripts/build.mjs --check
            && node scripts/check-gates.mjs
```

| 命令 | 作用 | 在 `npm run ci` | 在 CI 工作流 |
|---|---|---|---|
| `npm run lint` / `node scripts/check.mjs` | 不带 `--selftest` 的快速自检 | 否 | 否 |
| `node scripts/check.mjs --selftest` | 13 步总闸（见 3.2），契约与插件 API 面总是真实核对 | 是 | `test` job |
| `node scripts/check-contracts.mjs` | 契约结构校验 + 四条真实核对（规则删空即红；`--selftest` 额外验证判据自己会红） | 经总闸 | `test` job（独立步骤） |
| `node scripts/check-plugin-api.mjs` | `PlotPin` 顶层键 ↔ `contracts/plugin-api.json` 双向真实比对 | 经总闸 | `test` job（独立步骤） |
| `node scripts/check-sw.mjs` | 预缓存输入指纹 ↔ 提交入库的 `scripts/sw-inputs.sha256` | 经总闸 | `test` job（独立步骤） |
| `node scripts/bench.mjs` | Node 桩渲染/覆盖率/规则/符号阈值 | 是 | `test` job |
| `node scripts/build.mjs --check` | 单文件产物重建与登记比对 | 是 | `test` job |
| `node scripts/check-gates.mjs` | 正面基线 + 12 种人为破坏 | 是 | `test` job |
| `node scripts/check-ngm.mjs` / `npm test` | vendor ↔ `ngm.json` ↔ `ngm.lock` 三角对账 | **否** | 独立 `vendor-check` job |
| `node scripts/check-discipline.mjs --strict` | 文档纪律 13 问（低于 L3 退出 1） | 否 | 独立 `discipline` job |
| `node scripts/e2e.mjs` | Chromium 功能 e2e | 否 | 独立 `e2e` job（`npm ci` + `playwright install --with-deps chromium`）；**CI 实际执行未验证** |
| `node scripts/perf-browser.mjs` | 真实浏览器性能采集与阈值 | 否 | **不跑**（SwiftShader 读数不能当真实 GPU 结论） |
| `node scripts/i18n-scan.mjs --check` | i18n 覆盖率/缺口/硬编码 | 仅经 `--selftest` 第 11 步 | 随 `test` job |

> **vendor 摘要口径（2026-11-10 更新）**：`check-ngm.mjs` 现在会对 `ngm.vendor/**` 的**实际字节**逐文件计算 sha256，并与仓库内清单 `scripts/ngm-vendor-digest.json` 比对；任何 vendor 文件被改动/增删都会在本地红并指出文件名（`node scripts/check-ngm.mjs`）。修改 vendor 后必须运行 `node scripts/check-ngm.mjs --update-vendor-digest` 重写清单。清单同时记录 `ngm.lock` 的 `moduleDigest`，lock 重新锁定而清单未刷新也会红。
> **仍未解决**：`moduleDigest` 本身由 ngm 二进制生成、算法未公开，本机无 ngm 工具链，**无法重算**；导入健壮性补丁改了 `format/zip` 与 `format/pdf`，DXF 文本清洗又改了 `format/dxf`，这三处 `moduleDigest` 仍未刷新。CI 的 `ngm verify --deep` 仅在配置 `NGM_BIN_URL` 的 job 执行；一旦启用，这三个模块会因摘要不一致而失败，需先用 ngm 重新锁定后再启用。

### 3.2 `check.mjs` 的 13 步

| # | 检查 | 执行条件 | 判据要点 |
|---|---|---|---|
| 1 | 语法 | 总是 | `node --check` 覆盖 `js/**`、`scripts/*.mjs`、`sw.js`；并校验 `app.js` 注册路径指向根目录 `sw.js` |
| 2 | 入口资源存在 | 总是 | `index.html` 引用的本地脚本/样式/manifest 必须存在 |
| 3 | 入口引用完整 | 总是 | `js/**` 每个脚本都必须被 `index.html` 引用 |
| 4 | 离线承诺 | 总是 | 入口不得出现 `http(s)://` 远程脚本/样式/资源 |
| 5 | 断言数一致 | 总是 | `scripts/badge.mjs --check`：README 三处锚点必须存在且等于 selftest 实际断言数 |
| 6 | 契约 | 总是 | `check-contracts.mjs` 先校验契约结构（规则被删空即红），再真实核对四类约定；`--selftest` 额外跑判据自检（证明判据会红），不替代真实核对 |
| 7 | 插件 API 面 | 总是 | `check-plugin-api.mjs`：`PlotPin` 顶层键 ↔ `contracts/plugin-api.json` 双向一致；`--selftest` 额外验证解析器 |
| 8 | 删除账本 | 总是 | `check-deletions.mjs`：`docs/deletions.md` 字段齐全、能抓假删除 |
| 9 | 模块分层 | 总是 | 目录白名单 + 加载顺序按层非递减 |
| 10 | 逻辑层自测 | 仅 `--selftest` | 执行 `scripts/selftest.mjs`，退出码纳入门禁 |
| 11 | i18n | 仅 `--selftest` | `i18n-scan.mjs --check`：覆盖率 ≥40%、缺口 ≤10、UI 硬编码 ≤20、模板内 UI 文案 =0 |
| 12 | SW 缓存版本 | 总是 | `check-sw.mjs`：预缓存输入内容指纹必须与提交入库的 `scripts/sw-inputs.sha256` 一致，且清单 `version` 等于 `sw.js` 的 `VERSION` |
| 13 | CSS 结构 | 总是 | 去注释/字符串后花括号必须配平（未闭合的 `@media` 会静默吞掉其后所有规则） |

注意：第 5 步 `badge.mjs --check` 内部会先跑一次 selftest，第 10 步再跑一次；`--selftest` 下 selftest 实际执行两次，
这是刻意保留的「README 断言数必须与真实断言数同源」判据，不是重复浪费。

单项命令：`npm run contracts[:selftest]`、`npm run api[:selftest]`、`npm test`、`npm run bench`、`npm run gates`、`npm run test:e2e`、`npm run perf:browser`。

### 3.3 `bench.mjs` 阻断阈值

Node + canvas 桩，**只证明相对退化，不代表真机体验**。阈值为绝对值，改阈值必须在 commit body 写「旧值 → 新值 + 理由 + 连续实测」。

| 指标 | 阈值 | 说明 |
|---|---|---|
| 缓存帧平均 | ≤ 8 ms | 50fps 预算的一半 |
| 缓存帧 P95 | ≤ 3 ms | 偶发卡顿不能被平均掩盖 |
| 缓存帧 P99 | ≤ 10 ms | **仅告警**，不阻断 |
| 静态层重建 | ≤ 60 ms | 2000 对象 |
| 直接全量帧 | ≤ 60 ms | 导出/打印路径 |
| `heapUsed` | ≤ 64 MB | bench 结束时读数，不含长跑斜率 |
| 覆盖率分析（1000×1000m） | ≤ 300 ms | 30 摄像头 |
| 大场地覆盖率（5000×5000m） | ≤ 300 ms | 173,889 格 |
| 规则检查（2000 对象 / 30 类型） | ≤ 500 ms | minX 扫描线；`--brute` 仅本地对照 |
| 覆盖率缩放差异 | ≤ 1 个百分点 | 同一图纸 4 个缩放级别 |
| 视口裁剪率 | ≥ 60% | 高倍缩放 |
| 符号渲染（500 图元直接帧） | ≤ 60 ms | 六类混合 + 真实尺寸 + 旋转 |
| 符号库索引加载 | ≤ 10 ms | `buildSymbolIndex()` |
| SVG 导入（可达最坏组合） | ≤ 50 ms | 199 路径 / 62 KB；「200×5000」被 64 KB 上限快速拒绝，不设耗时门禁 |

`bench.mjs --json` 输出机器可读结果；每次提交前必须跑，不达标不得提交。当前实测见 [performance.md](performance.md)。

### 3.4 门禁牙齿（`check-gates.mjs`）

在系统临时目录整仓副本里先跑**正面基线**（未破坏副本必须全绿），再构造 **12 种**破坏，断言对应门禁非 0 退出
且输出命中目标错误关键字；仓库本身一个字节不改：

| # | 破坏 | 期望变红的门禁 |
|---|---|---|
| 0 | （正面基线）未破坏副本 | `check.mjs --selftest`、`check-sw.mjs`、`check-plugin-api.mjs`、`check-ngm.mjs`、`badge.mjs --check`、`i18n-scan.mjs --check` 必须全 0 |
| 1 | 渲染入口注入 4 ms 忙等（平均帧仍达标） | `bench.mjs`（P95） |
| 2 | `dist` 产物追加一行 | `build.mjs --check` |
| 3 | 删除 `ngm.json` | `check-ngm.mjs` |
| 4 | 删除 README 断言数模板锚点 | `badge.mjs --check` |
| 5 | selftest 注入必然失败的断言 | `check.mjs --selftest` |
| 6 | 预缓存输入变更但不递增 `sw.js` 的 `VERSION` | `check-sw.mjs` |
| 7 | UI 模板内新增硬编码中文 | `i18n-scan.mjs --check` |
| 8 | `PlotPin` 新增未登记私有键 | `check.mjs --selftest`（插件 API 面真实判据） |
| 9 | `sw.js` 的 `VERSION` 回退 | `check-sw.mjs` |
| 10 | `contracts/conventions.json` 规则数组清空 | `check-contracts.mjs`（契约结构校验） |
| 11 | 预缓存输入变更但未 bump `VERSION` 就执行 `--update` | `check-sw.mjs --update`（拒绝生成） |
| 12 | `css/*.css` 花括号不配平（未闭合 `@media`） | `check.mjs --selftest`（CSS 结构判据） |

一条从未红过的判据不算成立；新增判据必须同时准备可构造的负例（`--selftest` 或本脚本）。

### 3.5 CI 下不会真正校验的部分（必须知情）

| 判据 | 真实边界 |
|---|---|
| `check-sw.mjs` | 基线是**提交入库**的 `scripts/sw-inputs.sha256`（预缓存输入内容指纹 + 清单 `version`），不依赖 git 工作区或 `git diff HEAD`，干净检出同样生效。清单需在 bump `VERSION` 后执行 `node scripts/check-sw.mjs --update` 重新生成；`--update` 自身会拒绝「输入已变更但版本未递增」，不能用刷新清单掩盖漏 bump；合并冲突时不得手工合并哈希行，取合并后的工作树重新 `--update` |
| `bench.mjs` | 绝对阈值在共享 CI 机器与开发机上会漂移；机器负载/Node 版本不同结果不可直接比较，只能看是否越过阈值 |
| `build.mjs --check` | 不校验「产物可双击打开/运行正确」，只校验可复现、哈希、体积、CSP 结构与登记一致 |
| `badge.mjs --check` | 只校验「断言数三处一致」，不校验断言本身是否有效 |
| `i18n-scan.mjs` | 只按静态字面量扫描，不证明译文语义正确；JSON/HTML 内的动态拼接可能漏扫 |
| `e2e` | 已接入 `.github/workflows/ci.yml` 的 `e2e` job（`npm ci` + `npx playwright install --with-deps chromium` + `node scripts/e2e.mjs`）。**CI 实际执行未验证**：本机只能验证同样的命令在本地 Chromium 下 124 用例（123 通过 + 1 条件跳过）通过，无法复现 GitHub runner 的网络、系统库与浏览器下载；首次接入后的实际耗时、稳定性与是否存在 runner 专属失败，必须以 CI 运行记录为准。所需条件：runner 可访问 npm registry 与 Playwright 浏览器下载源，`ubuntu-latest` 可执行 `apt` 安装系统依赖。缺 Playwright 或缺 Chromium 时本地脚本打印 `[SKIP]` 并**退 2**（不是 0），跳过不会伪装成通过 |
| `perf:browser` | **不在任何 CI job 中**；本机为 SwiftShader，数据不能当真实 GPU 结论 |
| `.github/workflows/ci.yml` | `discipline` job 的步骤名仍写着「十问看板」，实际为 **13 问**；为文案滞后，不影响执行 |
| `npm run ci` | 不含 `check-ngm`、`check-discipline`、e2e、perf；不要用「本地 ci 绿」代替全部门禁 |

---

## 4. 契约与对外 API 面

### 4.1 `contracts/conventions.json`（四条静默漂移）

| 约定 | 判据 |
|---|---|
| 版本号三处一致 | `package.json.version` = `ngm.json.version` = `PlotPin.version` |
| i18n 键对齐 | `zh`/`en` 同键集；`index.html` 的 `data-i18n*` 键都有译文 |
| 文件头唯一 | 每个 `js/**/*.js` 恰好一行 `/* 文件名.js —— 职责 */` |
| 枚举同源 | `POINT_SCALE_SHAPES` 的键集 = `TYPE_SHAPES` |

`check-contracts.mjs --selftest` 造一棵必然违约的临时树，断言四类漂移各被识别一次，并断言「规则清空」会被拒绝（不是 0 项核对退 0）。

契约文件既是判据来源又是被检查对象，因此逐条核对前先做结构校验：`versionSources` 至少 3 条、`i18n`（`source` + `html`）、
`headers.root`、`enums` 至少 1 条缺一即报违约；全部核对完成后读数还须 ≥ 6，低于基线同样报违约。
`check-gates` 场景 11 在临时副本里清空契约并断言 `check-contracts.mjs` 非 0 退出。

### 4.2 `contracts/plugin-api.json`（23 个顶层键）

`check-plugin-api.mjs` 双向比对 `js/features/plugins.js` 的 `PlotPin` **顶层键**与清单：

- 代码有、清单无 → API 泄漏（插件可依赖、下次改名即静默破坏兼容）；
- 清单有、代码无 → 承诺落空（运行时 `undefined`）。

`--selftest` 用含内层花括号、方法简写、getter 的对象字面量验证解析器只取顶层键。
同时校验契约描述中的 API 版本与能力列表必须与 `PLUGIN_API_VERSION` / `PLUGIN_CAPABILITIES` 同源。

### 4.3 插件 API 版本与能力白名单

- `PlotPin.apiVersion`（插件 API 版本）≠ `PlotPin.version`（应用版本，须与 `package.json` 一致）。
- 兼容矩阵：`1.0` / `1.0.0` / `1.1` 通过；`1.2` 拒绝（次版本高于宿主）；`2.0` 拒绝（主版本不兼容）；缺失/畸形拒绝并说明合法写法。
- 能力白名单（封闭集合，未知能力直接拒绝，不降级）：
  `state:read`、`state:write`、`annotate`、`types`、`icons`、`export`、`import`、`rules`。
  `rules` 在沙箱 Worker 内注册会被明确拒绝，规则只能经受信任同源路径 `PlotPin.registerRule(def, owner)` 注册。
- 隔离：`loadPlugin` 把插件源码放进 `Blob`，用 `new Worker(blobURL)` 执行；主线程与 Worker 只通过带随机 token 的
  `postMessage` 通信。Worker 内硬化 `fetch`、`indexedDB`、`XMLHttpRequest`、`WebSocket`、`EventSource`、
  `importScripts`、`caches`、`localStorage`、`sessionStorage`、`navigator`、`location`、`postMessage`、
  `addEventListener`、`self`、`Worker`、`SharedWorker`（全局与原型链）。
- 超时：初始化与每次调用（含导出/导入）上限 **2000 ms**，超时由主线程 `worker.terminate()` 硬终止；
  失败只让该插件进入 `disabled` 并 toast，主工程继续可操作。
- 明确限制：一个插件一个 Worker；`code` 必须为字符串（`file://` 下不能 `fetch` 插件文件）；
  `addObjects` 单次 ≤ 500；`getState` / `addObjects` / `addAnnotation` 按固定 60s 窗口限流（60 / 30 / 60 次），超限只回本次调用错误而不禁用插件；清单原文超过 192 KB 在 `JSON.parse` 前按 UTF-8 字节拒绝；Worker 是**隔离边界而非完整语言级沙箱**，仍可访问 `console`/`Blob`/`crypto` 等
  无主工程权限的 Worker 全局，且不设 CPU/内存配额（只靠 2 s 超时 terminate）。
- 受信任兼容入口：同源 `<script>` 直接调用 `PlotPin.register*` 保留，不套版本与能力门；不可信插件必须走 `loadPlugin`。
- 图标与符号仍走 A-02 白名单：`icon` 经 `normalizeIcon`（只认内置名，其余回落 `custom`）；`symbol` 只保存几何数据，
  类型名/颜色/id 在渲染处转义。

---

## 5. 资源上限与预算

### 5.1 `APP_LIMITS`（`js/core/config.js`，唯一来源）

| 常量 | 值 | 作用 |
|---|---|---|
| `ZOOM_MIN` / `ZOOM_MAX` | 0.02 / 200 | 画布缩放夹取 |
| `ICON_SCALE_MIN` / `ICON_SCALE_MAX` | 0.2 / 8 | 图标倍率 |
| `SEG_LABEL_MIN_PX`（可调 10–60） | 26 px | 段长标注最小屏幕像素 |
| `BG_MAX_EDGE` / `BG_JPEG_QUALITY` | 3000 px / 0.85 | 底图降采样与透明图转 JPEG |
| `BG_RECOMPRESS_LIMIT` | 6 MB | 超过该体积的透明底图转 JPEG |
| `BG_MAX_DECODE_PIXELS` | 40 MP | 单张底图解码像素上限 |
| `ASSET_MAX_BYTES` | 16 MB | 单个内容寻址资产 |
| `IMPORT_FILE_MAX_BYTES` | 32 MB | 所有导入文件（含工程合并） |
| `IMPORT_TEXT_MAX_CHARS` | 32 MB | JSON/CSV 文本字符数 |
| `IMPORT_ROWS_MAX` | 20000 | CSV/TSV/XLSX 行数 |
| `IMPORT_ENTITIES_MAX` | 100000 | DXF/PDF 实体数 |
| `OBJECTS_MAX` | 100000 | 单工程对象总数（含所有楼层） |
| `HISTORY_MAX` | 20 | 撤销栈深度 |
| `TOMBSTONE_MAX` / `TOMBSTONE_EVICT_BATCH` | 100000 / 2000 | 墓碑硬上限（与 `OBJECTS_MAX` 同量级）与增量淘汰批量 |
| `TOMBSTONE_RETENTION_DAYS` | 730 天 | 墓碑保留窗口 |
| `COVERAGE_TARGET_CELLS` | 18000 | 覆盖率 v2 固定目标总格数 |
| `COVERAGE_MAX_CELLS` | 200000 | 单次分析栅格总格数上限 |
| `COVERAGE_CELL_MIN_M` / `COVERAGE_CELL_MAX_M` | 0.03 / 10 | 格边夹取区间（m） |
| `SNAPSHOT_MAX_PER_PROJECT` | 20 | 每工程版本快照条数 |
| `SNAPSHOT_MAX_BYTES_PER_PROJECT` | 16 MB | 每工程快照数据总量 |

导入侧统一由 `importLimitErrors(spec)` 判定（`js/core/config.js`）；业务代码不得另写魔法数字。

### 5.2 产物体积预算

- 硬上限 839,680 B；当前值与余量以 `scripts/dist-manifest.json` 为准（见 2.3）。
- CSP：单文件包每个内联脚本一条 `sha256` 白名单；`script-src` 不得含 `'unsafe-inline'`，哈希数必须等于内联脚本数。
- 体积专项只允许**无损回收**（合并重复文案、复用现有工具函数、删除确认的死代码）；不得删功能凑数、不得调高上限。
  收口必须给出逐项回收量与总回收量，且 8 种导出 golden 与 selftest 断言数不变。

### 5.3 性能预算

- 阻断阈值以 `bench.mjs` 为准（§3.3），改阈值需写旧值、新值、理由与连续实测。
- 真实浏览器绝对性能**不做全量承诺**：见 [performance.md](performance.md) 的方法学边界。
  浏览器基线默认不进 `npm run ci`，Node 桩与浏览器数据**不可互换、不可互相冒充**。

### 5.4 真实浏览器性能基线

已独立成文：[performance.md](performance.md)（采集方法、阈值、实测区间、已知瓶颈与未验证项）。
本节不再复制数字；任何引用都必须带上采集日期与命令。

---

## 6. 提交规范与文档同步

### 6.1 提交信息

- 约定式提交：`feat(scope): …` / `fix(scope): …` / `perf(scope): …` / `test(scope): …` / `docs(scope): …`。
- Body 必须带**实测数据**（例如 `heapUsed +2.20MB`、`P95 < 3ms`、`产物 -30%`、`体积 -36 B / 余量 28,695 B`）。
- 禁止 `fix bug`、`update`、`optimize` 之类无信息提交。
- 禁止私自 `git push`：除非明确授权，只能本地 `git commit`。
- `CHANGELOG.internal.md`（不对外发布）每次提交记录：Commit Hash、核心改动、验证数据、遗留 TODO/风险。

### 6.2 代码与文档必须同 commit

修改 `js/**` 业务逻辑或 `scripts/**` 行为时，同一个 commit 内必须同步更新：

| 变化 | 必须更新 |
|---|---|
| 公共 API / 函数签名 | 对应 API 文档（`docs/modules.md` / `docs/features.md`） |
| 架构策略、缓存、几何内核 | `docs/ARCHITECTURE.md` |
| CLI / 门禁 / 使用行为 | `docs/user-guide.md` / 本文 |
| 测试用例增删 | [testing.md](testing.md) |
| 阈值或基线 | [performance.md](performance.md) |

### 6.3 公共抽象

- 新增代码必须主动识别可复用的公共类型、函数、常量，**禁止复制粘贴式实现**。
- 提取公共逻辑若影响现有调用方，必须在 commit body 显式列出受影响调用方与影响范围，禁止静默修改。
- 已完成的公共工具（如 `esc` / `xmlEscape`、`outlineOf`、`siteBounds`、`objectIndexById`、`ensureVendor`）必须直接复用，
  不得二次实现；公共抽象变更若改变输出（如 SVG/DXF 顶点数），必须先建 golden 基线再替换。
- 门禁脚本共用 `scripts/lib/fs-utils.mjs`（`walkFiles` / `readJson`）与 `scripts/lib/budget.mjs`（体积预算常量）；
  新增门禁不得再各写一份目录遍历 / JSON 解析 / 体积阈值。

### 6.4 门禁与提交的关系

- 提交前必须跑 `node scripts/check.mjs --selftest`；涉及性能路径时跑 `node scripts/bench.mjs`；改源后跑 `node scripts/build.mjs` 并提交 manifest。
- 不达标不提交：内存超阈值、P95 不达标必须继续改，禁止放宽阈值、删断言或跳过用例。
- 结构性删除必须登记 `docs/deletions.md`（`check-deletions.mjs` 会抓「假删除」）。

---

## 7. 文档纪律（13 问）

`npm run discipline` 运行 `scripts/check-discipline.mjs`，回答「这个仓库现在几档、缺哪一条」，不替代任何判据。
结构上不适用的问写在 `docs/discipline-exemptions.json`（必须写清为什么结构上不成立；「暂时没做」不是理由）。

当前 **13/13（L4）**（2026-11-08 实测）。关键硬约束：

| # | 判据 |
|---|---|
| 7 | README 有文档入口，`docs/` 有权威分层 |
| 10 | 判据自己带牙齿：`check-contracts` / `check-plugin-api` / `check-deletions` 等支持 `--selftest` |
| 11 | 单文档 ≤ **60 KB 且 ≤ 600 行**（超限按主题拆分，不删内容） |
| 12 | 每条判据都在总闸里（没有「写了但从不跑」） |
| 13 | 文档里的命令必须指向真实存在的脚本：`node scripts/*.mjs` 文件必须存在，`npm run <name>` 必须是 `package.json` 中的脚本 |

写文档时：不要复制易漂移数字；命令必须可执行；引用旧结论前先核对代码。

---

## 8. 怎么加一条新判据

1. **先问三件事**：违反了会怎样？能不能用「读文件 / 跑命令 / 比数据」回答？过去 3 个月违反过吗？
2. **写成单项**：能单独跑，打印读数（扫了多少、比了多少）；读数为 0 视为失败（空跑比漏报更糟）。
3. **配一颗牙齿**：构造一份「应当失败」的输入并断言它失败（`--selftest` 是现成形状）。
4. **挂进 `check.mjs`**，确认本地与 CI 走同一条命令。
5. **在本文档登记**：守什么、违反的后果、什么情况下可以删。

> 一条判据被**阻断过一次**才算成立。加进来三个月没红过、也没人看得懂它在守什么，就应该删掉。

---

## 9. 禁止事项

| 禁止 | 原因 |
|---|---|
| 新增运行时依赖 | 产品承诺离线、零依赖、双击即用；Playwright 仅限 devDependency，不得进入发行包 |
| 调高 839,680 B 体积上限 / 放宽门禁阈值 / 删断言 | 门禁不达标必须改代码，不得改尺子 |
| 伪造日志、测试数据、性能指标 | 未跑就写「未验证」，失败就写失败 |
| 修改或读取仓库根目录 `camera-*` 文件 | 与产品无关的外部文件 |
| 未授权 `git push` / 强制推送 | 只允许本地提交；远端分叉时停止并报告 |
| 静默破坏公共 API 签名 | 必须保留兼容入口或明确迁移说明与受影响调用方 |
| 跨工程清理资产 | 资产必须按工程命名空间隔离，禁止跨工程 prune |
| 在导出中绕过公式注入防护 | CSV/TSV/XLSX 必须沿用统一 `formulaGuard` |
| 用人工验收替代自动化门禁 | 人工结果只说明当次设备/语料可用，不能替代 `ci`/`selftest`/`bench`/`gates` |
