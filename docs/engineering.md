# 工程规范与门禁（engineering）

> **读者**：要改代码、跑门禁、判断“绿了到底保证什么”、准备发布的开发者。
> **回答**：分层与构建、每条门禁的真实判据与盲区、体积/性能预算、契约、提交与文档同步。
> **不回答**：测试用例清单见 [testing](testing.md)，性能读数见 [performance](performance.md)，人工验收见 [manual-acceptance](manual-acceptance.md)。
> **原则**：任何“我们保证了 X”都必须能指向一条会变红的判据；没有判据的，就明说不保证。
> **数字口径**：本文不复制易漂移数字；当前值统一看 [facts](facts.md)。最后核对：2026-11-13。

## 1. 目录与分层

```text
index.html            唯一入口（classic <script> 顺序加载）
sw.js                 Service Worker（必须在站点根目录）
js/common/            第 0 层：纯数据/算法/适配器，不依赖 core/features
js/core/              第 1 层：状态、模型、渲染、交互、持久化
js/features/          第 2 层：页面级功能（导出、面板、规则、插件…）
js/core/app.js        第 3 层：入口装配（最后加载）
scripts/              开发期工具与门禁（零运行时依赖）
scripts/lib/          门禁共享工具（walkFiles / readJson / budget）
tests/e2e/            Playwright 功能用例（devDependency）
tests/perf/           Playwright 真实浏览器性能采集
tests/golden/         逐字节 golden 基线
tests/fixtures/       测试夹具（旧工程、SW 测试页等）
contracts/            机器可读契约（约定 / 插件 API 面）
ngm.json / ngm.lock   第三方依赖清单与锁（vendor 接线）
```

分层判据（`scripts/check.mjs` 第 9 步）：

- `js/` 下只允许 `common / core / features` 三个目录；
- `index.html` 的脚本加载顺序必须按层**非递减**（0 → 1 → 2 → 3），不允许层序倒退；
- 新增 `js/**/*.js` 必须被 `index.html` 引用（第 3 步双向核对）；
- 每个 `js/**/*.js` 必须有且仅有一行文件头 `/* 文件名.js —— 职责 */`（`contracts/conventions.json` 的 `headers`）。

classic `<script>` 共享全局作用域，**目录边界是唯一还能被机器核对的模块边界**；跨层直接读取下层数据是允许的，反向依赖不允许新增。门禁现在按 `contracts/coupling.json` 对 `core → features` / `common → core` 做“文件+符号+次数”静态计数（9.2），并配对必需钩子（9.3）、登记软调用（9.4）；但只统计全仓唯一的顶层声明/调用，局部同名、对象键、1–2 字符标识符与 `globalThis[…]` 动态访问仍会漏，运行时反向回调（persistence→UI 等）也依然存在（见 [ARCHITECTURE](ARCHITECTURE.md)§2）。

PDF 出图两条路径：默认 `pdf` 是整页位图（JPEG）+ 清单页；显式 `pdf-vector` 为混合模式——底图/场地/网格为整页 JPEG（DCTDecode），对象轮廓与尺寸线为矢量内容流，文字/名称/面积/周长/尺寸、点位图标、标题栏与页脚为透明位图（Flate RGB + SMask），清单页仍为整页 JPEG。文字层不可选不可搜、放大发虚；标签数 >300 自动降到 150 DPI；`CompressionStream` 不可用时回退整页位图，不产出坏文件。

## 2. 构建与打包

### 2.1 两种使用形态

| 形态 | 入口 | 说明 |
|---|---|---|
| 源码直开 | `index.html` | 双击即可用；脚本逐文件加载，便于调试 |
| 单文件发行包 | `dist/plotpin-standalone.html` | `node scripts/build.mjs` 生成：内联全部 CSS/JS，47 段脚本合并为 1 段、CSP 只签 1 条 sha256，可离线分发 |

`scripts/pack-core.mjs` 负责内联（先删 HTML 注释，再折叠标签行首缩进），`scripts/minify-core.mjs` 只做**语义安全**的压缩：删注释、行首缩进、空行与行尾空白；字符串/模板字面量/正则逐字节保留；标点相邻空格、自终止词法单位后的换行可省（连续正负号之间例外）；`}` 前的语句分号可省；`return/throw/typeof` 等关键字与紧随的 `(`/`[`/`{`/字面量引号之间无空格；`0.5→.5`；`}` 后换行接标识符时可省（块结束或同表达式的 `in/instanceof`；接 `(`/`[` 仍保留换行）。**源文件不压缩**。

脚本按 `index.html` 声明顺序压缩后合并为 1 段（`;` + 换行分隔，显式终止上一条语句，防尾注释/ASI 粘连），CSP 只对合并体签 1 条 `sha256`；合并后整体交给 `vm.Script` 解析，顶层 `let/const` 重名等词法冲突直接让构建失败。

### 2.2 `build.mjs --check` 的真实判据

| 判据 | 失败条件 |
|---|---|
| 体积上限 | 产物 > 839,680 B（820 KiB，`scripts/lib/budget.mjs`） |
| 构建确定性 | 同一份源连续两次构建的 SHA256 或字节数不同 |
| CSP 存在 | 发行包缺少 `Content-Security-Policy` |
| CSP 脚本策略 | `script-src` 含 `'unsafe-inline'` |
| CSP 哈希数 | 内联脚本数（剔除 HTML 注释）≠ `sha256-…` 白名单条数 |
| 登记哈希 | 构建结果的 SHA256 / 字节数 / gzip 字节数与 `scripts/dist-manifest.json` 不一致 |
| 登记缺失 | `scripts/dist-manifest.json` 不存在或不是合法 JSON |
| 本地产物 | `dist/` 存在时，其字节或哈希与源重建不一致 |
| gzip 体积 | gzip > 286,720 B（280 KiB）；> 266,240 B（260 KiB）只预警 |
| 预算常量 | `dist-manifest.json` 的 `maxBytes / gzipMaxBytes` 与 `scripts/lib/budget.mjs` 不一致 |

改 `js/**`、`css/**`、`index.html` 后必须运行 `node scripts/build.mjs` 刷新登记值，否则门禁必红。`dist/` 与 gzip 体积都会打印；gzip 阈值留了 zlib 版本差异余量。体积余量分级预警（不阻断）：<8,000 B 警告，<6,000 B 强警告。阈值常量只在 `scripts/lib/budget.mjs` 维护。

### 2.3 体积预算与红线

- 硬上限 **839,680 B**；gzip 硬上限 **286,720 B**；分级预警常量见 `scripts/lib/budget.mjs`。
- 当前字节/gzip/余量以 `scripts/dist-manifest.json` 与 `node scripts/build.mjs --check` 为准，汇总见 [facts](facts.md)。
- 改造期红线（逐任务执行，任一触发即停并上报）：单任务 raw ≤3,000 B、单阶段 ≤5,000 B、单任务 gzip ≤1,200 B；余量 <8,000 B 时不得开新功能，必须先用实测（raw 与 gzip 各自降幅）证明有可兑现的回收来源，或先砍口径。
- **不得调高上限、不得改预算常数、不得把 `size-report` 的账面值当回收承诺**。`size-report` 的重复字符串/重复行是压缩前账面值，只能当线索；dist 可回收应为 0。
- 已证伪的回收手段不得重复列入计划：dist 注释、行首缩进、重复字符串池化、i18n 英文包、terser 全量改名。

### 2.4 terser 局部 mangle（已接入）

`pack-core.mjs` 合并出单脚本后交给 terser：`compress: true` + `mangle: { toplevel: false }`（顶层名全保留），再按压缩后内容重算 CSP 哈希；版本精确锁定（devDependency），发行包仍零运行时依赖。

- 保留顶层名是产品约束：`plugins.js` 按名探测 `state / toast / scheduleSave / commitChange` 等全局；全量改名会让插件路径失效。
- 代价：构建耗时增加、生产栈帧变短名、对未文档化全局名的隐式依赖会静默失效。
- 变更 terser 版本或配置会让产物 SHA256 漂移，进而使 `build --check` 与 SW 版本抖动；升级必须同批重跑构建、双入口 e2e 与 SW 校验。

### 2.5 单文件发行版与 Service Worker

- 源码多文件入口（`index.html`，经 http(s) 打开）：根目录 `sw.js` 负责 PWA 预缓存与版本升级，预缓存输入 52 个（含 `sw.js` 自身）；`file://` 下不注册。
- 单文件发行版（`dist/plotpin-standalone.html`）：**不含 Service Worker**，也不含 `js/`、`css/`、`sw.js`；CSS/JS/图标全部内联，离线由文件自身保证。
- PWA 安装、预缓存与版本升级只对源码多文件入口成立；dist 既不承诺也不需要。因此 `sw.spec` 在 dist 入口显式跳过（带原因）。
- `file://` 实测（历史记录，Chromium）：IndexedDB 读写、`localStorage`、Blob 下载、CSP 内联哈希正常；导入图片/PDF 底图、比例预设、点位与区域、PDF/CSV 导出通过；唯一差异是 SW/PWA（按协议置 `sw=false`，不注册、不报错）。这是浏览器安全模型与产品设计的边界。

## 3. 浏览器支持与证据口径

**结论：默认门禁与全量证据只有 Chromium。** Firefox 只保留 5 条核心的可复跑证据（非门禁、非支持承诺），不要写成“Firefox 已通过”或“现代浏览器均支持”。

| 内核 | 当前证据 | 口径 |
|---|---|---|
| Chromium | `playwright.config.mjs` 默认 `browserName:'chromium'`；`scripts/e2e.mjs` 默认校验 Chromium 二进制；2026-11-14 全量实跑源码 167 passed / 1 skipped、dist 164 passed / 4 skipped（跳过项均为显式条件） | **支持目标**；发布前以本地实跑日志为准 |
| Firefox | 2026-11-14 用本机 Playwright Firefox 实跑 5 条核心：5 passed / 11.3s，命令与逐条读数见 [testing](testing.md)§3.4；其余 163 条未跑 | **非门禁证据，不构成支持承诺**；未跑的不得写成已支持 |
| WebKit（Windows） | 旧文档记录过进程级崩溃（`code=134` / `0xC0000409`），失败不跟 spec 走 | **不作支持目标**；Windows WebKit 不是 Safari 等价物 |
| Safari 17+ | 未验证 | 需 macOS 真机或真机 CI；仓库内无证据 |

跳过项（历史记录）：协作 soak（需 `COLLAB_SOAK=1`）、dist 入口的 `sw.spec` / `sw-atomic.spec`（单文件发行版无 SW）、非 Chromium 下的 B-10 真实堆用例（CDP 通道）。

`file://` 历史实测值（Chromium）：IndexedDB `readwrite-ok`；PDF/CSV 下载可用；dist 仅 1 条 `sha256`，注入内联脚本被拦；`navigator.serviceWorker` 存在但产品按协议置 `sw=false`。这些是历史记录，不是本次重跑结果。

## 4. 门禁清单与真实边界

### 4.1 总闸与命令

```text
npm run ci       =  node scripts/check.mjs --selftest
                  && node scripts/check-ngm.mjs
                  && node scripts/check-sw.mjs
                  && node scripts/check-contracts.mjs
                  && node scripts/check-plugin-api.mjs
                  && node scripts/i18n-scan.mjs --check
                  && node scripts/check-discipline.mjs --strict
                  && node scripts/check-deletions.mjs
                  && node scripts/bench.mjs
                  && node scripts/build.mjs --check
                  && node scripts/check-gates.mjs

npm run ci:full  =  npm run ci && npm run test:e2e
```

> **Actions 现状（2026-11-15 核查，来源 `gh api` / `gh run view`）**：`.github/workflows/ci.yml` 与 `perf-nightly.yml` 已挂载并实际运行。2026-11-13 的 60 次全红中，`test` job 的根因（缺 `npm ci` → 无 terser / 无 node_modules）已于 2026-11-14 修复，并在 2026-11-15 的 run `43626940476` 转绿。
> 两个 `e2e` job 的根因是 `dist/` 不入库且 job 内不构建（源码入口 3 条 `file-dist` 用例 `net::ERR_FILE_NOT_FOUND`；dist 入口 `serve.mjs` 把 `/index.html` 映射到缺失产物，404 使 webServer 20 s 超时）；2026-11-15 在 `e2e` job 内补 `node scripts/build.mjs`，只补构建前提，未改用例、判定与常量。复跑：源码入口全绿（175 passed / 1 skipped），dist 入口 171 passed / 4 skipped / 1 failed（`perf-render.spec.mjs:198` 像素采样 `inside1` false；本地同一 spec 全绿，原因未定位）。
> 因此 Actions **仍不作发布门禁**；下表的“ci.yml 定义中的归属”只表示判据由哪个 job 承担，不代表已绿或可依赖。发布以本地门禁为准。

| 命令 | 作用 | 在 `npm run ci` | `ci.yml` 定义中的归属 |
|---|---|---|---|
| `npm run lint` / `node scripts/check.mjs` | 不带 `--selftest` 的快速自检 | 否 | 否 |
| `node scripts/check.mjs --selftest` | 13 步总闸（见 4.2），契约与插件 API 面总是真实核对 | 是 | `test` job |
| `node scripts/check-contracts.mjs` | 契约结构校验 + 真实核对（规则删空即红） | 经总闸 | `test` job（独立步骤） |
| `node scripts/check-plugin-api.mjs` | 词法器抽取 `PlotPin` 顶层键 ↔ `contracts/plugin-api.json` 双向比对；无法静态确认即 fail-closed | 经总闸 | `test` job（独立步骤） |
| `node scripts/check-sw.mjs` | 预缓存输入指纹 ↔ 提交入库的 `scripts/sw-inputs.sha256` | 经总闸 | `test` job（独立步骤） |
| `node scripts/bench.mjs` | Node 桩渲染/覆盖率/规则/符号阈值 | 是 | `test` job |
| `node scripts/build.mjs --check` | 单文件产物重建与登记比对 | 是 | `test` job |
| `node scripts/check-gates.mjs` | 正面基线 10 条 + 20 种人为破坏 | 是 | `test` job |
| `node scripts/check-ngm.mjs` / `npm test` | vendor ↔ `ngm.json` ↔ `ngm.lock` 三角对账 | **是（2026-11-14 起并入 `npm run ci`）** | 独立 `vendor-check` job（Actions 侧） |
| `node scripts/check-discipline.mjs --strict` | 文档纪律 13 问（低于 L3 退出 1） | 是（2026-11-14 起） | 独立 `discipline` job（Actions 侧） |
| `node scripts/e2e.mjs` | Chromium 功能 e2e（46 spec / 166 用例；2026-11-14 本地双入口全量已复跑） | 否（`npm run ci:full` 才含） | 独立 `e2e` job，matrix 双入口，job 内先构建 `dist/`；**远端 2026-11-15：源码入口绿、dist 入口 1 条像素采样红，不作发布门禁** |
| `node scripts/perf-browser.mjs` | 真实浏览器性能采集与阈值 | 否 | 不进主 CI；`perf-nightly.yml` 夜间定时 + 手动，读数上传 artifact；**schedule 已挂载但尚未触发（0 次）** |
| `node scripts/i18n-scan.mjs --check` | i18n 覆盖率 44.12%（按出现次数）/缺口/硬编码 | 是（`npm run ci` 独立步骤；Actions 侧经 `check.mjs` 第 11 步） | 随 `test` job |

vendor 摘要口径：`check-ngm.mjs` 对 `ngm.vendor/**` 实际字节逐文件算 sha256，与 `scripts/ngm-vendor-digest.json` 比对；任何 vendor 文件被改动/增删都会本地红。修改 vendor 后必须运行 `node scripts/check-ngm.mjs --update-vendor-digest` 重写清单。`moduleDigest` 由 ngm 二进制生成、算法未公开，本机无 ngm 工具链，**无法重算**；相关模块的 `moduleDigest` 仍未刷新，启用 `ngm verify --deep` 前需先重新锁定。

### 4.2 `check.mjs` 的 13 步

| # | 检查 | 执行条件 | 判据要点 |
|---|---|---|---|
| 1 | 语法 | 总是 | `node --check` 覆盖 `js/**`、`scripts/*.mjs`、`sw.js`；并校验 `app.js` 注册路径指向根目录 `sw.js` |
| 2 | 入口资源存在 | 总是 | `index.html` 引用的本地脚本/样式/manifest 必须存在 |
| 3 | 入口引用完整 | 总是 | `js/**` 每个脚本都必须被 `index.html` 引用 |
| 4 | 离线承诺 | 总是 | 入口不得出现 `http(s)://` 远程脚本/样式/资源 |
| 5 | 断言数一致 | 总是 | `scripts/badge.mjs --check`：README 三处锚点存在且等于 selftest 实际断言数；同时校验 facts/testing/engineering/modules 计数 |
| 6 | 契约 | 总是 | `check-contracts.mjs` 先校验契约结构（规则被删空即红），再真实核对四类约定 |
| 7 | 插件 API 面 | 总是 | `check-plugin-api.mjs`：`PlotPin` 顶层键 ↔ 契约双向一致 |
| 8 | 删除账本 | 总是 | `check-deletions.mjs`：`docs/deletions.md` 字段齐全、能抓假删除 |
| 9.1 | 状态写入口 | 总是 | `state = ...` 只允许出现在 `model.js` 的 `let state` 声明与 `persistence.js` 的 `replaceState()` 内；`scripts/**` 仅放行显式夹具 |
| 9.2 | 跨层耦合计数 | 总是 | `contracts/coupling.json` 按“文件+符号+次数”严格相等；`core → features` 25 条、`common → core` 3 条，只减不增 |
| 9.3 | 钩子配对 | 总是 | `callHook ↔ registerHook` 一一配对；6 个 `REQUIRED_HOOKS` 必须同时有提供方与调用点；重复/非函数注册也算违约 |
| 9.4 | 软调用登记 | 总是 | `typeof X==='function'` 形式必须按 `required / host / optional / param` 分类登记；当前 13 条（5/2/5/1），次数严格相等、只减不增 |
| 10 | 逻辑层自测 | 仅 `--selftest` | 执行 `scripts/selftest.mjs`，退出码纳入门禁 |
| 11 | i18n | 仅 `--selftest` | 覆盖率 ≥40%（2026-11-13 实测 44.09%，按出现次数逐次判定）、缺口 ≤10（当前 0）、UI 硬编码 ≤20、已字典待接入 ≤81、模板内 UI 文案 =0 |
| 12 | SW 缓存版本 | 总是 | 预缓存输入内容指纹必须与 `scripts/sw-inputs.sha256` 一致，清单 `version` 等于 `sw.js` 的 `VERSION` |
| 13 | CSS 结构 | 总是 | 去注释/字符串后花括号必须配平（未闭合的 `@media` 会静默吞掉其后所有规则） |

注意：第 5 步 `badge.mjs --check` 内部会先跑一次 selftest，第 10 步再跑一次；`--selftest` 下 selftest 实际执行两次。这是刻意保留的“README 断言数必须与真实断言数同源”判据，不是重复浪费。

**9.1～9.4 各抓什么、盲区剩什么**：

- **9.1 状态直赋值**：抓“绕过 `replaceState` 改现场”。盲区：`state.x = ...` 的字段级写、`Object.assign(state, …)`、通过别名持有 `state` 再赋值；这些仍靠评审。
- **9.2 耦合计数**：抓“新增跨层调用”。只统计全仓唯一的顶层声明/函数调用，跳过同文件局部同名、对象字面量键与 1–2 字符标识符；按“文件+符号+次数”而不是行号，注释/格式化不会误报，但宏式动态调用、`globalThis[… ]` 访问会漏。`common → core` 的 3 条是已知违规，数量只能下调。
- **9.3 钩子配对**：抓“调用了但没人注册/注册了但没人调用”。必需 6 项；`assertHooksReady()` 在 `init()` 首行兜底。盲区：钩子实现体内部再引其他层符号不在本规则范围（由 9.2 看）。
- **9.4 软调用**：抓“用 `typeof` 猜能力”的隐式依赖。分类后 `required` 仍是真实依赖，只是登记而非消除；新增必须说明为什么不能改成钩子。
- 所有计数的唯一基线是 `contracts/coupling.json`；审计报告里的旧行号已漂移，引用时以代码与契约文件为准。

单项命令：`npm run contracts[:selftest]`、`npm run api[:selftest]`、`npm test`、`npm run bench`、`npm run gates`、`npm run test:e2e`、`npm run perf:browser`。

### 4.3 `bench.mjs` 阻断阈值

Node + canvas 桩，**只证明相对退化，不代表真机体验**。阈值为绝对值，改阈值必须在 commit body 写“旧值 → 新值 + 理由 + 连续实测”。

| 指标 | 阈值 | 说明 |
|---|---|---|
| 缓存帧平均 | ≤8 ms | 50fps 预算的一半 |
| 缓存帧 P95 | ≤3 ms | 偶发卡顿不能被平均掩盖 |
| 缓存帧 P99 | ≤10 ms | 仅告警，不阻断 |
| 静态层重建 | ≤60 ms | 2000 对象 |
| 直接全量帧 | ≤60 ms | 导出/打印路径 |
| `heapUsed` | ≤64 MB | bench 结束时读数，不含长跑斜率 |
| 覆盖率分析（1000×1000m） | ≤300 ms | 30 摄像头 |
| 大场地覆盖率（5000×5000m） | ≤300 ms | 173,889 格 |
| 规则检查（2000 对象 / 30 类型） | ≤500 ms | minX 扫描线；`--brute` 仅本地对照 |
| 覆盖率缩放差异 | ≤1 个百分点 | 同一图纸 4 个缩放级别 |
| 视口裁剪率 | ≥60% | 高倍缩放 |
| 符号渲染（500 图元直接帧） | ≤60 ms | 六类混合 + 真实尺寸 + 旋转 |
| 符号库索引加载 | ≤10 ms | `buildSymbolIndex()` |
| SVG 导入（最坏组合） | ≤50 ms | 199 路径 / 62 KB；「200×5000」被 64 KB 上限快速拒绝，不设耗时门禁 |

`bench.mjs --json` 输出机器可读结果。DORI 200 相机实测（2026-11-13，Node 桩）：A 组仅 `phys/angle`、B 组追加 `props.camResPx=1920` / `props.camFov=90`，交替各 5 次取中位数，A 18.6 ms / B 18.6 ms，差异 −0.4%；`doriRows()` 200 对象中位数 0.38 ms。口径：**DORI 不进入 `analyzeCoverage` 的栅格路径**，面板渲染才是 DORI 的增量成本；第一轮只记录，不设阻断阈值。

### 4.4 门禁牙齿（`check-gates.mjs`）

在系统临时目录整仓副本里先跑**正面基线**（10 条，未破坏副本必须全绿），再构造 **20 种**破坏，断言对应门禁非 0 退出且输出命中目标错误关键字；仓库本身一个字节不改。脚本头注释与 `scenarios` 数组长度一致（20）；全量本机约 4–5 分钟，可用 `--only` 分批跑。

| # | 破坏 | 期望变红的门禁 |
|---|---|---|
| 0 | （正面基线）未破坏副本 | `check.mjs --selftest`、`check-sw.mjs`、`check-plugin-api.mjs`、`check-ngm.mjs`、`badge.mjs --check`、`i18n-scan.mjs --check`、`build.mjs --check`、`check-deletions.mjs`、`check-discipline.mjs --strict`、`i18n-scan.mjs --json --check` 必须全 0 |
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
| 13 | `css/style.css` 注入远程 `url(https://…)` | `check.mjs --selftest`（离线承诺判据） |
| 14 | 在 `replaceState()` 之外新增 `state = …` | `check.mjs`（9.1 状态写入口） |
| 15 | 新增一条未登记的 `core → features` 调用 | `check.mjs`（9.2 耦合计数严格相等） |
| 16 | 新增一条未分类的 `typeof … === 'function'` 软调用 | `check.mjs`（9.4 软调用登记） |
| 17 | 删除一个必需钩子的注册 | `check.mjs`（9.3 钩子配对） |
| 18 | CSP 内联脚本哈希与脚本体错位（条数不变） | `build.mjs --check`（`CSP 哈希值与脚本体不匹配`） |
| 19 | i18n 覆盖率跌破阈值（按当前覆盖率动态追加未字典化中文） | `i18n-scan.mjs --json --check`（同时验证 JSON 模式退出码） |
| 20 | `collabIceRedact` 把凭据拼回错误/状态出口（模拟顺手带上 credential） | `selftest.mjs --filter=ICE-1`（零泄露断言：错误信息与脱敏出口两处变红） |

一条从未红过的判据不算成立；新增判据必须同时准备可构造的负例（`--selftest` 或本脚本）。

### 4.5 门禁的盲区（必须知情）

| 判据 | 真实边界 |
|---|---|
| `check-sw.mjs` | 基线是提交入库的 `scripts/sw-inputs.sha256`（预缓存输入指纹 + 清单 `version`），不依赖 git 工作区或 `git diff HEAD`，干净检出同样生效；`--update` 会拒绝“输入已变更但版本未递增” |
| `bench.mjs` | 绝对阈值在本机负载/Node 版本变化时会漂移；不同机器结果不可直接比较，只能看是否越线 |
| `build.mjs --check` | 不校验“产物可双击打开/运行正确”，只校验可复现、哈希、体积、CSP 结构与登记一致 |
| `badge.mjs --check` | 只校验“断言数/计数锚点一致”，不校验断言本身是否有效 |
| `i18n-scan.mjs` | 覆盖率 **44.09% = 731 / 1,658**（按出现次数）；全仓未走翻译入口 **927**，`UI 硬编码 18` 只是其中子集（三个数的范围与分母见 §4.6）。旧口径按唯一 value 去重曾报 46.7%，偏高；只扫静态字面量，不证明译文语义正确，动态拼接可能漏扫 |
| 状态写入口（9.1） | 只抓 `state = …`；`state.x = …`、`Object.assign(state, …)`、别名赋值不在判据内 |
| 耦合计数（9.2/9.4） | 只认全仓唯一顶层声明；局部同名、对象键、1–2 字符标识符、`globalThis[…]` 动态访问会漏；`required` 软调用仍是真实依赖 |
| 钩子配对（9.3） | 保证“提供方/调用点成对”，不保证钩子实现体不反向依赖其他层 |
| `e2e` | GitHub Actions 上已执行且失败，不能作为回归依据。本地命令：`node scripts/e2e.mjs`（源码）与 `E2E_ENTRY=dist E2E_PORT=4174 node scripts/e2e.mjs`（dist）；缺 Playwright/Chromium 时打印 `[SKIP]` 并退 2，不伪装通过 |
| `perf:browser` | 不在 `npm run ci`；`perf-nightly.yml` 的 `schedule` 已挂载但尚未触发（0 次）；本机为 SwiftShader，数据不能当真实 GPU 结论 |
| `npm run ci` | 11 步：selftest → check-ngm → check-sw → check-contracts → check-plugin-api → i18n-scan → check-discipline --strict → check-deletions → bench → build --check → check-gates；不含 e2e、perf-browser；`ci:full` 才加 e2e。不要用“本地 ci 绿”代替浏览器 e2e 与真机结论 |
| 本地纪律 | Actions 已运行但未全绿（2026-11-15：`test` 绿，`e2e` 源码入口绿、dist 入口 1 条像素采样红），仍等于没有完整的“干净检出上的强制回归”；漏跑、跑一半、看到红仍合并都只能靠人工约束 |

### 4.6 i18n 数字口径：三个数不是同一个分母

`node scripts/i18n-scan.mjs --check`（或 `--json`）一次输出多组数。它们的扫描范围或判定条件不同，不是互相矛盾，也不能把 `UI 硬编码 18` 当成全部硬编码。以下数值为 2026-11-13 实测，取数命令均为该脚本。

#### 覆盖率与缺口（翻译入口口径）

- 扫描 36 个业务脚本（`js/**/*.js`，排除字典文件 `js/common/i18n.js`）；注释与标识符不计，同一句中文在 N 处出现就计 N 次。
- `字面量出现次数` **1,658**：含 CJK 的全部出现次数，即覆盖率的分母。
- `走翻译入口` **731**：字面量位于 `L(...)` / `I18N.p/fmt(...)` 第一实参，或 `toast / commitChange / openModal / showConfirm / collabNotifyThrottled` 的文案实参；逐次判定，不做“同值取或”。
  - `已字典化` **731**：走入口且 key 在 `I18N.phrases` 或 `I18N.templates`，即覆盖率的分子。
  - `缺口` **0**：走入口但字典未收录（英文界面会回退中文）。含 `${...}` 的复合模板壳不计缺口，其静态片段已单独统计；当前没有此类条目。
- **覆盖率 = 731 / 1,658 = 44.09%**；分母 = 已字典化 731 + 缺口 0 + 未走入口硬编码 927，三者按出现次数互斥。门槛 ≥40%，缺口 ≤10（当前 0）。

#### UI 硬编码 18 vs 全部硬编码 927（范围不同）

- `未走翻译入口的硬编码中文` **927** = 1,658 − 731：覆盖全部 36 个业务脚本，包含数据标签/诊断信息、6 个适配器文件（`io-import` / `io-export` / `io-table` / `io-fields` / `plugins` / `rules`）以及 HTML 标记与复合模板壳；其中未字典化 540。
- `UI 文案硬编码` **18**：927 的**子集**。只统计 UI 文件（`js/core/app.js`、`js/core/interaction.js`、`js/features/*` 去掉上述 6 个适配器），且同时满足“未走翻译入口、未字典化、非 HTML/CSS 标记模板、非 `${...}` 复合壳”。2026-11-13 分布：`js/features/ui-shell.js` 15、`js/core/interaction.js` 2、`js/features/catalog.js` 1。门槛 ≤20。
- `已字典待接入` **81**（脚本内部字段 `uiInDict`）：与 18 同一范围（UI 文件、未走入口、非标记/非复合），但 key 已在字典中——文案已写好，只是没接入 `L()`。它与 18 互斥，两者共同构成“UI 层未走入口”的存量。门槛 ≤81，只允许下降。
- 关系：18 ⊆ 927，81 ⊆ 927，18 与 81 互斥；三者都不是“全部硬编码”。汇报时必须带范围词（全仓 / UI 未字典化 / UI 已字典待接入），不能只写“硬编码 18 条”。

## 5. 契约与对外 API 面

### 5.1 `contracts/conventions.json`（四条静默漂移）

| 约定 | 判据 |
|---|---|
| 版本号三处一致 | `package.json.version` = `ngm.json.version` = `PlotPin.version` |
| i18n 键对齐 | `zh`/`en` 同键集；`index.html` 的 `data-i18n*` 键都有译文 |
| 文件头唯一 | 每个 `js/**/*.js` 恰好一行 `/* 文件名.js —— 职责 */` |
| 枚举同源 | `POINT_SCALE_SHAPES` 的键集 = `TYPE_SHAPES` |

`check-contracts.mjs --selftest` 造一棵必然违约的临时树，断言四类漂移各被识别一次，并断言“规则清空”会被拒绝（不是 0 项核对退 0）。契约文件既是判据来源又是被检查对象，因此逐条核对前先做结构校验：`versionSources` 至少 3 条、`i18n`（`source` + `html`）、`headers.root`、`enums` 至少 1 条缺一即报违约；全部核对完成后读数还须 ≥6，低于基线同样报违约。

### 5.2 `contracts/plugin-api.json`（24 个顶层键）

`check-plugin-api.mjs` 用词法器（不是正则）抽取 `js/features/plugins.js` 的 `PlotPin` **顶层键**，与清单双向比对；遇到无法静态确认的结构（动态赋值、计算属性、非字面量对象）直接 **fail-closed** 报错退出，不猜、不跳过。

- 代码有、清单无 → API 泄漏（插件可依赖、下次改名即静默破坏兼容）；
- 清单有、代码无 → 承诺落空（运行时 `undefined`）。

`--selftest` 用含内层花括号、方法简写、ES6 简写属性与 getter 的对象字面量验证解析器只取顶层键；同时校验契约描述的 API 版本与能力列表必须与 `PLUGIN_API_VERSION` / `PLUGIN_CAPABILITIES` 同源。

### 5.3 插件 API 版本与能力白名单

- `PlotPin.apiVersion`（插件 API 版本）≠ `PlotPin.version`（应用版本，须与 `package.json` 一致）。
- 兼容矩阵：`1.0 / 1.0.0 / 1.1` 通过；`1.2` 拒绝（次版本高于宿主）；`2.0` 拒绝（主版本不兼容）；缺失/畸形拒绝并说明合法写法。
- 能力白名单（封闭集合，未知能力直接拒绝）：`state:read`、`state:write`、`annotate`、`types`、`icons`、`export`、`import`、`rules`。`rules` 在沙箱 Worker 内注册会被明确拒绝，规则只能经受信任同源路径 `PlotPin.registerRule(def, owner)` 注册。
- 隔离：`loadPlugin` 把插件源码放进 `Blob`，用 `new Worker(blobURL)` 执行；主线程与 Worker 只通过带随机 token 的 `postMessage` 通信。Worker 内硬化 `fetch`、`indexedDB`、`XMLHttpRequest`、`WebSocket`、`EventSource`、`importScripts`、`caches`、`localStorage`、`sessionStorage`、`navigator`、`location`、`postMessage`、`addEventListener`、`self`、`Worker`、`SharedWorker`、`BroadcastChannel`、`MessageChannel`、`MessagePort`（全局与原型链）。
- 超时：初始化与每次调用（含导出/导入）上限 2000 ms，超时由主线程 `worker.terminate()` 硬终止；失败只让该插件进入 `disabled` 并 toast。
- 明确限制：一个插件一个 Worker；`code` 必须为字符串（`file://` 下不能 `fetch` 插件文件）；`addObjects` 单次 ≤500；`getState / addObjects / addAnnotation` 按固定 60s 窗口限流（60 / 30 / 60 次）；清单原文超过 192 KB 在 `JSON.parse` 前按 UTF-8 字节拒绝；Worker 是**隔离边界而非完整语言级沙箱**，仍可访问 `console/Blob/crypto` 等无主工程权限的 Worker 全局，且不设 CPU/内存配额（只靠 2s 超时 terminate）。
- `getState` 快照 16 MB 与写入类 RPC 参数 2 MB 字符是资源保护线，不是沙箱可承载载荷的设计值。
- 受信任兼容入口：同源 `<script>` 直接调用 `PlotPin.register*` 保留，不套版本与能力门；不可信插件必须走 `loadPlugin`。
- 弃用策略：`contracts/plugin-api.json` 是唯一键清单，不得为临时需求改键。旧键退出统一走三步：契约标记 `deprecated since <minor>，替代键 <key>` → 至少跨 2 个次版本保持新旧并存 → 增加“旧键不再被示例/文档引用”断言、登记 `docs/deletions.md`、同批 bump minor。

### 5.4 `contracts/coupling.json`（耦合计数基线）

`check.mjs` 9.2～9.4 的唯一基线文件，按 `文件 + 符号 + 次数` 记录，不做位置断言：

| 字段 | 当前基线（2026-11-13） | 规则 |
|---|---|---|
| `coreToFeatures` | 25 条 | 实际计数必须与登记**严格相等**；只允许删除或下调次数，不允许新增/上调 |
| `commonToCore` | 3 条 | 已知违规（`merge.js` 读设置键、`qr.js` 取 vendor），同样只减不增 |
| `softCalls` | 13 条 | 按 `required(5) / host(2) / optional(5) / param(1)` 分类；新增必须带理由 |
| 必需钩子 | 11 个提供方 / 11 个调用点 / 6 个必需 | 定义在 `js/core/config.js` 的 `REQUIRED_HOOKS`；9.3 校验提供方与调用点各 11、必需项 6 |

**为什么不用行号**：行号随注释、空行、格式化漂移，会导致基线频繁失效并被“顺手放宽”；次数只在真实增删调用时变化。**审计报告里的软调用表行号已漂移，不要沿用**；要定位实现，按 `coupling.json` 的文件+符号在代码里搜。

改基线的唯一合法方向是减少：先改代码，再同步 `coupling.json` 的计数；新增条目必须在提交说明里写“为什么不能复用提交协议/钩子”。`check-gates` 会构造“新增未登记调用 / 删除必需钩子”让门禁变红。

## 6. 资源上限（`APP_LIMITS`，唯一来源 `js/core/config.js`）

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
| `TOMBSTONE_MAX` / `TOMBSTONE_EVICT_BATCH` | 100000 / 2000 | 墓碑硬上限与增量淘汰批量 |
| `TOMBSTONE_RETENTION_DAYS` | 730 天 | 墓碑保留窗口 |
| `COVERAGE_TARGET_CELLS` | 18000 | 覆盖率 v2 固定目标总格数 |
| `COVERAGE_MAX_CELLS` | 200000 | 单次分析栅格总格数上限 |
| `COVERAGE_CELL_MIN_M` / `COVERAGE_CELL_MAX_M` | 0.03 / 10 | 格边夹取区间（m） |
| `SNAPSHOT_MAX_PER_PROJECT` | 20 | 每工程版本快照条数 |
| `SNAPSHOT_MAX_BYTES_PER_PROJECT` | 16 MB | 每工程快照数据总量 |
| `DORI_LEVELS`（独立常量，不在 `APP_LIMITS`） | 25 / 62.5 / 125 / 250 px/m | 侦测/观察/识别/辨认最远判读距离阈值；出处 IEC 62676-4 表 1（Johnson 判据），改值即改报告口径 |

导入侧统一由 `importLimitErrors(spec)` 判定；业务代码不得另写魔法数字。覆盖率报告 DORI 列由 `doriMaxDistance()` 计算：`d = resPx / (2·T·tan(fov/2))`，`T` 取 `DORI_LEVELS`；水平像素与张角存可选字段 `props.camResPx` / `props.camFov`（缺失时显示“未填”，不进 schema 必填项）。

## 7. 提交规范与文档同步

- 约定式提交：`feat(scope): …` / `fix(scope): …` / `perf(scope): …` / `test(scope): …` / `docs(scope): …`。
- Body 必须带实测数据（如 `heapUsed +2.20MB`、`P95 < 3ms`、`产物 -30%`、`体积 -36 B / 余量 28,695 B`）。
- 禁止 `fix bug` / `update` / `optimize` 之类无信息提交。
- 禁止私自 `git push`：除非明确授权，只能本地 `git commit`。
- `CHANGELOG.internal.md`（不对外发布）每次提交记录：Commit Hash、核心改动、验证数据、遗留 TODO/风险。

修改 `js/**` 业务逻辑或 `scripts/**` 行为时，同一批改动内必须同步：

| 变化 | 必须更新 |
|---|---|
| 公共 API / 函数签名 | `docs/modules.md` / `docs/features.md` |
| 架构策略、缓存、几何内核 | `docs/ARCHITECTURE.md` |
| 数据模型、持久化、合并 | `docs/DATA-MODEL.md` |
| CLI / 门禁 / 使用行为 | `docs/user-guide.md` / 本文 |
| 测试用例增删 | `docs/testing.md` |
| 阈值或基线 | `docs/performance.md` |
| 删除系统性能力 | `docs/deletions.md` |

公共抽象：新增代码必须主动识别可复用的公共类型、函数、常量，禁止复制粘贴式实现；提取公共逻辑若影响现有调用方，必须在 commit body 列明受影响调用方与影响范围。门禁脚本共用 `scripts/lib/fs-utils.mjs`（`walkFiles` / `readJson`）与 `scripts/lib/budget.mjs`；新增门禁不得再各写一份目录遍历 / JSON 解析 / 体积阈值。

## 8. 文档纪律（13 问）

`npm run discipline` 运行 `scripts/check-discipline.mjs`，回答“这个仓库现在几档、缺哪一条”，不替代任何判据。结构上不适用的问写在 `docs/discipline-exemptions.json`（必须写清为什么结构上不成立；“暂时没做”不是理由）。

当前 13/13（L4），以命令输出为准。关键硬约束：

| # | 判据 |
|---|---|
| 7 | README 有文档入口，`docs/` 有权威分层 |
| 10 | 判据自己带牙齿：`check-contracts` / `check-plugin-api` / `check-deletions` 等支持 `--selftest` |
| 11 | 单文档 ≤60 KB 且 ≤600 行（超限按主题拆分，不删内容） |
| 12 | 每条判据都在总闸里（没有“写了但从不跑”） |
| 13 | 文档里的命令必须指向真实存在的脚本：`node scripts/*.mjs` 文件必须存在，`npm run <name>` 必须是 `package.json` 中的脚本 |

> 第 2 问（判据在 CI 上跑）只核对 workflow 定义里是否调用了判据/总闸；Actions 虽有运行但未全绿且不作门禁，该问不代表判据已被可靠执行——真实执行证据只能来自本地发布清单的日志。

写文档时：不要复制易漂移数字；命令必须可执行；引用旧结论前先核对代码。

## 9. 怎么加一条新判据

1. **先问三件事**：违反了会怎样？能不能用“读文件 / 跑命令 / 比数据”回答？过去 3 个月违反过吗？
2. **写成单项**：能单独跑，打印读数（扫了多少、比了多少）；读数为 0 视为失败（空跑比漏报更糟）。
3. **配一颗牙齿**：构造一份“应当失败”的输入并断言它失败（`--selftest` 是现成形状）。
4. **挂进 `check.mjs`**，确认本地与 CI 走同一条命令（CI 仅作参考，不作合并阻断）。
5. **在本文档登记**：守什么、违反的后果、什么情况下可以删。

一条判据被阻断过一次才算成立。加进来三个月没红过、也没人看得懂它在守什么，就应该删掉。

## 10. 禁止事项

| 禁止 | 原因 |
|---|---|
| 新增运行时依赖 | 产品承诺离线、零依赖、双击即用；Playwright 仅限 devDependency，不得进入发行包 |
| 调高 839,680 B 体积上限 / 放宽门禁阈值 / 删断言 | 门禁不达标必须改代码，不得改尺子 |
| 伪造日志、测试数据、性能指标 | 未跑就写“未验证”，失败就写失败 |
| 修改或读取仓库根目录 `camera-*` 文件 | 与产品无关的外部文件 |
| 未授权 `git push` / 强制推送 | 只允许本地提交；远端分叉时停止并报告 |
| 静默破坏公共 API 签名 | 必须保留兼容入口或明确迁移说明与受影响调用方 |
| 跨工程清理资产 | 资产必须按工程命名空间隔离，禁止跨工程 prune |
| 在导出中绕过公式注入防护 | CSV/TSV/XLSX 必须沿用统一 `guardFormula` |
| 用人工验收替代自动化门禁 | 人工结果只说明当次设备/语料可用，不能替代 `ci`/`selftest`/`bench`/`gates` |
| 未备份就改代码 | 每个任务开工前先建备份目录存原件，并在改动清单登记一行；无登记不得开工 |
