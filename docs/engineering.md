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

**PDF 出图的两条路径**：默认 `pdf` 是整页位图（JPEG）+ 清单页，字节与旧版灯片基线可比；显式 `pdf-vector` 为混合模式——底图/场地/网格为整页 JPEG（DCTDecode），对象轮廓与尺寸线为矢量内容流，文字/名称/面积/周长/尺寸、点位图标、标题栏与页脚为透明位图（Flate RGB + SMask），清单页仍为整页 JPEG。文字层不可选不可搜、放大发虚；标签数 >300 自动降到 150 DPI；`CompressionStream` 不可用时回退为整页位图，不产出坏文件。

---

## 2. 构建与打包

### 2.1 两种使用形态

| 形态 | 入口 | 说明 |
|---|---|---|
| 源码直开 | `index.html` | 双击即可用；脚本逐文件加载，便于调试 |
| 单文件发行包 | `dist/plotpin-standalone.html` | `node scripts/build.mjs` 生成：内联全部 CSS/JS，**47 段脚本合并为 1 段、CSP 只签 1 条 sha256**，可离线分发 |

`scripts/pack-core.mjs` 负责内联（先删 HTML 注释，再折叠标签行首缩进），`scripts/minify-core.mjs` 只做**语义安全**的压缩：删注释、行首缩进、空行与行尾空白；
字符串 / 模板字面量 / 正则逐字节保留；标点相邻的空格、自终止词法单位后的换行可省（连续正负号之间例外），
`}` 前的语句分号可省（`{a();}`→`{a()}`，`}` 前由 ASI 补分号；删除后若变成语法错误由构建期解析拦下），
`return`/`throw`/`typeof` 等关键字与紧随的 `(`/`[`/`{`/字面量引号之间无空格，
`0.5`→`.5`，`}` 后换行接标识符时可省（块结束或同表达式的 `in`/`instanceof`；接 `(`/`[` 等仍保留换行）；
**源文件不压缩**，`index.html` 仍引用可读源码。
脚本按 `index.html` 的声明顺序压缩后合并为 **1 段**（`;` + 换行分隔，显式终止上一条语句，防尾注释/ASI 粘连），
CSP 只对合并体签 **1 条** `sha256`；合并后整体交给 `vm.Script` 解析，顶层 `let/const` 重名等词法冲突会直接让构建失败。
产物不再嵌来源标记：`size-report` 按声明顺序切分，JS 组成整体显示为一个 bundle 项。

### 2.2 `build.mjs --check` 的真实判据

| 判据 | 失败条件 |
|---|---|
| 体积上限 | 产物 > **820 KB（839,680 B）** |
| 构建确定性 | 同一份源连续两次构建的 SHA256 或字节数不同 |
| CSP 存在 | 发行包缺少 `Content-Security-Policy` |
| CSP 脚本策略 | `script-src` 含 `'unsafe-inline'` |
| CSP 哈希数 | 内联脚本数（剔除 HTML 注释）≠ `sha256-…` 白名单条数 |
| 登记哈希 | 构建结果的 SHA256 / 字节数 / gzip 字节数与 `scripts/dist-manifest.json` 不一致 |
| 登记缺失 | `scripts/dist-manifest.json` 不存在或不是合法 JSON |
| 本地产物 | `dist/` 存在时，其字节或哈希与源重建不一致 |
| gzip 体积 | gzip > **280 KiB（286,720 B）**；> 260 KiB（266,240 B）只预警 |
| 预算常量 | `dist-manifest.json` 的 `maxBytes` / `gzipMaxBytes` 与 `scripts/lib/budget.mjs` 不一致 |

改 `js/**`、`css/`、`index.html` 后必须运行 `node scripts/build.mjs` 刷新登记值，否则门禁必红（本地 `node scripts/build.mjs --check`）。
`dist/` 与 gzip 体积都会打印；gzip 设硬上限 280 KiB（不同 zlib 版本字节可能不同，阈值留了余量）。
体积余量分级预警（不阻断）：余量 < 8,000 B 警告，< 6,000 B 强警告。阈值常量只在 `scripts/lib/budget.mjs` 维护。

### 2.3 体积预算（易漂移，指向单一来源）

- 硬上限：**839,680 B**（代码常量 `MAX_BYTES = 820 * 1024`，`scripts/lib/budget.mjs`；`dist-manifest.json.maxBytes` 必须一致）。
- gzip 硬上限：**286,720 B（280 KiB）**；`GZIP_WARN_BYTES = 266,240` 只预警（同上，`lib/budget.mjs` 单一来源）。
- 分级预警：余量 < `MARGIN_WARN_BYTES = 8,000 B` 警告；< `MARGIN_CRITICAL_BYTES = 6,000 B` 强警告（不阻断构建）。
- 当前值：以 `scripts/dist-manifest.json` 的 `bytes / gzipBytes / sha256` 为准，汇总与采集命令见 [facts.md](facts.md)。
  2026-11-12 实测（V-5 收口后）：`bytes = 831,617`、gzip `262,795`、余量 `8,063 B`（`node scripts/build.mjs --check` 复算一致）。
  2026-11-13 实测（B-01 terser 落地后）：`bytes = 744,042`、gzip `241,842`、余量 `95,638 B`（gzip 余量 `44,878 B`）。
  2026-11-13 实测（C-01/C-02 后）：`bytes = 745,081`、gzip `242,155`、余量 `94,599 B`（gzip 余量 `44,565 B`），本轮净增 **+1,039 raw / +313 gzip**。
- V-5 图纸修订参照版增量拆分（入口 827,476 / 261,624 → 出口 831,617 / 262,795，总 **+4,141 raw / +1,171 gzip**，以整包实测为准）：
  1. `ghost.js` 参照版运行时 + 标定判定 + 闪烁：+2,393 raw；
  2. `ui-shell.js` 设置面板信息行与绑定：+1,378 raw；
  3. `i18n.js` 新增 9 键与 1 模板：+331 raw；
  4. `render.js` 签名接入 + 垫底调用：+21 raw；
  5. `persistence.js` 工程切换清空参照版（`afterStateLoaded` 内 `if(fit) revClear()`）：+18 raw；
  6. `snapshot.js` / `snapshot-ui.js`：0（差异叠加复用现有 `setDiffOverlay`，快照来源已按体积口径砍掉）。
- V-5 回收结论（2026-11-12，防止把账面值当预算；上表 gzip 增量为整包实测）：
  1. 「dist 注释可回收 2,192 B」**误报**：`size-report` 的扫描器把正则字面量 `/^\//`、`/^image\//` 里的 `\/` 当成 `//`；修复后 dist 实测**注释 0 B、行首缩进 0 B、空行 0 B**（模板内换行 75,950 B 不可删）。
  2. 「缩进可回收 155 B」**误报**：剩余行首空白全在（含嵌套的）模板字符串内部，删除会改变生成内容。
  3. 「重复字符串池化省 37,979 B」**负收益**：实测 raw −4,081 / gzip **+5,552**，且改写后 `vm.Script` 解析失败 → **不采用**。
  4. 真实节省来自**缩口径**：删快照来源、固定 1 Hz 闪烁、去差异计数行与冗余文案，把首版 +7,671 压到 +4,141。`size-report` 的重复字符串/重复行是**压缩前账面值**，只能当线索，不得直接当预算来源（其自带的"可回收"为 0 才可与预算对照）。
- V-4a 收益拆分（入口 830,743 / 263,479 → 出口 827,476 / 261,624，总 **−3,267 raw / −1,855 gzip**，供复核）：
  1. **CSP 哈希 47→1**：−2,484 raw / −1,776 gzip（把 46 条同格式随机 hash 注回现产物实测，随机分布下 1,765～1,776 B）；
  2. **内联标记**：0 / 0（V-3R 已删来源标记，本期未新增）；
  3. **合并本身**（46 组 `<script>` 包装 → 1 组、46 处 `;`+换行分隔）：−783 raw / −79 gzip（总降幅减 CSP 项的残差）。
  gzip 三项为实测 + 残差，不严格可加；raw 三项严格可核对。
- 改造期红线（逐任务执行，任一触发即停并上报）：**单任务 raw ≤ 3,000 B、单阶段 ≤ 5,000 B、单任务 gzip ≤ 1,200 B**；**当前基线为 C-01/C-02 后的余量 94,599 B**（8,000 B 冻结线不变）；低于 8,000 B 不得开新功能，必须先用实测（raw 与 gzip 各自降幅）证明有可兑现的回收来源，或先砍口径；不得放宽上限，也不得把 `size-report` 的账面值当回收承诺。
- 预算分配：任何新功能提交都必须在 commit body 写「体积增量 + 剩余余量 + 相对 94,599 B 基线的关系」。逼近上限时只能做无损回收，**不得调高上限**。

#### 2.3.1 已采用：terser 局部 mangle（2026-11-13 落地）

- **定位：已接入构建链（阶段 B-01）。** `pack-core.mjs` 合并出单脚本后交给 terser，`compress: true` + `mangle: { toplevel: false }`（顶层名全保留），再按压缩后内容重算 CSP 哈希；精确锁定 `terser@5.51.2`（devDependency，发行包仍零运行时依赖）。
- 测法：`buildStandalone` 真实构建一次 + `gzipSync` 量字节；基线复测 831,617 / 262,795，与现 dist 逐字节一致。探针阶段装在仓库外临时目录，未改动 `package.json` / lock。

| 变体 | 配置 | raw | gzip | 相对基线（raw / gzip） | `vm.Script` 解析 |
|---|---|---|---|---|---|
| A | 仅 compress | 813,204 | 260,607 | −18,413 / −2,188 | 通过 |
| **C** | compress + 局部 mangle | **744,042** | **241,842** | **−87,575 / −20,953** | 通过 |
| B / F | compress + toplevel mangle | 675,640 / 697,771 | 229,688 / 233,131 | −155,977～−133,846 / −33,107～−29,664 | 通过，但**不可用** |

- **B / F 排除理由**：全量改名会抹掉 861 个顶层全局名。浏览器实测 `typeof state` 直接抛错，`window.toast / scheduleSave / populateSelects / renderTypes / requestRender / markDirty / commitChange / pushHistory / sanitizeObjects / downloadBlob` 全部 undefined——这是 `plugins.js` 按名探测的产品路径失效，不是测试依赖名字。F 用 350 个保留名（对 1,991 个测试标识符在 baseline 页面运行时探测生成）换回大部分语义，但名单取自测试内部实现，易碎且需随测试演进重新生成。
- **C 的代价**：
  1. 新增构建期 devDependency `terser`（实测 5.51.2），**必须精确锁版本**；否则压缩结果变化会让产物 SHA256 漂移，`build.mjs --check` 失败、SW 版本抖动；
  2. 构建耗时 **+2.5～3 s**（792 KB 合并体的 compress + 局部 mangle）；
  3. 生产栈帧全部变短名，降低可调试性（含 `Function.prototype.name` 一类依赖）；
  4. 对未文档化全局名的隐式依赖（第三方插件、调试脚本）会静默失效。
- **验证状态（2026-11-13 落地实测）**：C 已接入并完成 `npm ci`、`build --check`（二次构建 SHA256 一致）与**双入口全量 e2e**——源码 **150 passed / 1 skipped**、dist **149 passed / 2 skipped**，均 exit 0；`npm run ci` exit 0。实测 726.6 KB（744,042 B）/ gzip 236.2 KB（241,842 B），相对基线 **−87,575 raw / −20,953 gzip**；构建耗时 +1～2 s（本机单次约 2.9 s）。A 的 dist 冒烟子集（9/9）与 F 的不完整结论仅作为选型历史保留，不再作为当前门禁。
- 本节数字不改变任何预算常数；上限、预警阈值与当前余量仍以 `scripts/lib/budget.mjs` / `dist-manifest.json` 为准。

### 2.4 单文件发行版与 Service Worker 的边界

- **源码多文件入口**（`index.html`，经 http(s) 打开）：根目录 `sw.js` 负责 PWA 预缓存与版本升级，预缓存输入 52 个（含 `sw.js` 自身）；`file://` 下不注册。
- **单文件发行版**（`dist/plotpin-standalone.html`）：**不含 Service Worker**，也不含 `js/`、`css/`、`sw.js`；CSS/JS/图标全部内联，离线由文件自身保证。
- PWA 安装、预缓存与版本升级**只对源码多文件入口成立**；dist 既不承诺也不需要。
- 因此浏览器 e2e 的 `sw.spec` 在 dist 入口下显式跳过（带原因），不改造该用例去测服务器 harness；其余 spec 两个入口都全量执行（45 个 spec：源码入口 45、dist 入口 44，见 [testing.md](testing.md) §3.1）。
- `file://` 实测（Chromium，2026-11-12）：IndexedDB 读写、`localStorage`、Blob 下载、CSP 内联哈希都正常——导入图片/PDF 底图、比例预设、点位与区域、PDF/CSV 导出全部通过；唯一差异是 SW/PWA（`detectCapabilities` 按协议置 `sw=false`，不注册、不报错）。这是浏览器安全模型与产品设计的边界，不是缺陷。

### 2.5 浏览器支持矩阵（2026-11-12 首测，2026-11-13 Chromium/Firefox 复测）

实测方式：同一套 Playwright e2e（45 spec / 151 用例）在三个内核上跑，双入口（源码 4173 / dist 4174），
命令 `node scripts/e2e.mjs --browser=<firefox|webkit>`；Playwright 1.65.0（chromium-1254 / firefox-1572 / webkit-2388）。

| 内核 | 源码入口 | dist 入口 | 定位 |
|---|---|---|---|
| Chromium 1254 | 150 passed / 0 failed / 1 skipped，exit 0（2026-11-13 复测） | 149 / 0 / 2，exit 0（2026-11-13 复测） | **支持目标**，全量实测通过 |
| Firefox 1572 | 149 / 0 / 2，exit 0（2026-11-13 复测） | 148 / 0 / 3，exit 0（2026-11-13 复测） | **支持**，全量实测通过；差异见下 |
| WebKit 2388（Windows） | 97 / 53 / 1，exit 1 | 112 / 37 / 2，exit 1 | **不作支持目标**，仅当内核参考 |
| Safari 17+ | 未验证 | 未验证 | 需 macOS，本机无法验证 |

跳过项：协作 soak（需 `COLLAB_SOAK=1`）、dist 入口的 `sw.spec`（单文件发行版无 SW）、非 Chromium 下的 B-10 真实堆用例（CDP 通道）。

**Firefox 已知差异（均为内核行为或测试通道，不是产品缺陷）**

1. **CSP 控制台文案**：Chromium 为 `Content Security Policy` / `Refused to`；Firefox 为 `Content-Security-Policy: The page's settings blocked an inline script (script-src-elem)…`。拦截结果一致，仅文案不同；测试正则同时认两种文案，未放宽拦截断言。
2. **CSSOM 序列化**：清空/初始 `backgroundImage`，Chromium 返回 `initial`，Firefox 返回 `none`。实际绘制一致；该条断言放宽为 `initial|none` 二选一（本表唯一放宽断言处，原断言仍对 Chromium 生效）。
3. **CDP 通道缺失**：真实堆测量走 `browserContext.newCDPSession`，Firefox/WebKit 无对应通道；B-10 在非 Chromium 显式 skip，Chromium 仍真实测量，不用估算值冒充。
4. **启动落定晚一拍**：`app.js` 启动末尾对空工程 `fitView()`，同一时刻 `state.viewport.zoom` 在 Firefox 仍为 `1`、Chromium 已是适应值。产品侧两边都会 fit，差异只在测试取景时机；测试侧等启动落定，产品不加守卫（见 [known-issues.md](known-issues.md) K14）。
5. **偶发进程崩溃**：全量跑中出现过 `Page crashed` / `Target crashed`，失败在不同轮次落到不同 spec（collab、i18n-template 等），单跑即过 → 内核/环境不稳，不是功能缺陷。最终计数以上表为准（该轮无崩溃）。2026-11-13 dist 首轮另见 1 项偶发失败：`plugin-manifest.spec.mjs:34`（D-05，`#pluginPanel` 5 s 内未可见），单 spec 复跑 2/2、dist 全量复跑 148 passed / 0 failed / 3 skipped 均通过，未复现；不据此改产品代码。
6. **`file://` 四项与 Chromium 完全一致**，实测值见下表。

**`file://` 实测值（Chromium / Firefox / WebKit 三内核一致）**

| 项 | 实测值 |
|---|---|
| IndexedDB | `readwrite-ok`（`appCaps.idb=true`） |
| 下载 | 可用：PDF（约 293 KB）与 CSV（含表头与数据行）均触发 `download` 并落盘 |
| CSP 内联哈希 | dist 仅 1 条 `sha256`；注入内联脚本被拦，`securitypolicyviolation` 记录 `script-src-elem` |
| Service Worker | `typeof navigator.serviceWorker === 'object'`，但产品按协议置 `sw=false`、不注册、不报错 |

**WebKit（Windows）不作支持目标的依据**

- 崩溃码固定：源码入口 `code=134`（SIGABRT）；dist 入口 `code=3221226505`（`0xC0000409`，STATUS_STACK_BUFFER_OVERRUN）。是进程级崩溃，不是断言失败。
- **失败不跟 spec 走**：`batch-layout`、`save-failure` 在全量跑里落入崩溃级联，但单独跑 3/3 全过；反向地，`smoke`、`ui-hardening`、`plugin-sandbox`、`history` 单跑 3 次稳定复现同一处失败。同一 spec 跨轮结论不一致，判为内核/环境不稳。
- 全量跑约 40/53（源码）、21/37（dist）条失败是崩溃后的 `Target page, context or browser has been closed` 级联，不是独立缺陷。
- 官方范围：Playwright 文档（playwright.dev/docs/browsers）写明 "Playwright's WebKit is derived from the latest WebKit main branch sources"，并说明 "availability of certain features may vary between operating systems… for the closest-to-Safari experience you should run WebKit on mac"。Windows 上的 WebKit 不是 Safari 等价物，官方也不承诺等同体验。
- 因此不为 WebKit 改产品代码，也不把它计入通过项；Safari 原生体验仍需 macOS 真机或真机 CI 验证。

---

## 3. 门禁清单与真实边界

### 3.1 总闸与命令

```
npm run ci  =  node scripts/check.mjs --selftest
            && node scripts/bench.mjs
            && node scripts/build.mjs --check
            && node scripts/check-gates.mjs
```

> **Actions 现状（2026-11-13 核查）**：`.github/workflows/ci.yml` 与 `perf-nightly.yml` 已挂载并在 GitHub Actions 上**实际运行**——
> CI **60 次运行全部失败**（`test` 与两个 `e2e` job 为红）、`Perf Nightly` **0 次**、`pages-build-deployment` **87 次**。
> 因此 Actions **在跑但全红，不作发布门禁**；下表「`ci.yml` 定义中的归属」只表示该判据由哪个 job 承担，**不代表它已绿或可依赖**。
> 发布以**本地门禁**为准，逐条命令与期望值见 [release-checklist.md](release-checklist.md)。

| 命令 | 作用 | 在 `npm run ci` | `ci.yml` 定义中的归属 |
|---|---|---|---|
| `npm run lint` / `node scripts/check.mjs` | 不带 `--selftest` 的快速自检 | 否 | 否 |
| `node scripts/check.mjs --selftest` | 13 步总闸（见 3.2），契约与插件 API 面总是真实核对 | 是 | `test` job |
| `node scripts/check-contracts.mjs` | 契约结构校验 + 四条真实核对（规则删空即红；`--selftest` 额外验证判据自己会红） | 经总闸 | `test` job（独立步骤） |
| `node scripts/check-plugin-api.mjs` | `PlotPin` 顶层键 ↔ `contracts/plugin-api.json` 双向真实比对 | 经总闸 | `test` job（独立步骤） |
| `node scripts/check-sw.mjs` | 预缓存输入指纹 ↔ 提交入库的 `scripts/sw-inputs.sha256` | 经总闸 | `test` job（独立步骤） |
| `node scripts/bench.mjs` | Node 桩渲染/覆盖率/规则/符号阈值 | 是 | `test` job |
| `node scripts/build.mjs --check` | 单文件产物重建与登记比对 | 是 | `test` job |
| `node scripts/check-gates.mjs` | 正面基线 + 13 种人为破坏 | 是 | `test` job |
| `node scripts/check-ngm.mjs` / `npm test` | vendor ↔ `ngm.json` ↔ `ngm.lock` 三角对账 | **否** | 独立 `vendor-check` job |
| `node scripts/check-discipline.mjs --strict` | 文档纪律 13 问（低于 L3 退出 1） | 否 | 独立 `discipline` job |
| `node scripts/e2e.mjs` | Chromium 功能 e2e（45 spec / 151 用例，含 `file://` 发行版路径） | 否 | 独立 `e2e` job（`npm ci` + `playwright install --with-deps chromium`），matrix 双入口并行（源码 4173 / dist 4174），各自全量；**已运行且失败（2026-11-13），不作发布门禁** |
| `node scripts/perf-browser.mjs` | 真实浏览器性能采集与阈值 | 否 | 不进主 CI（SwiftShader 读数不能当真实 GPU 结论）；`perf-nightly.yml` 夜间定时 + 手动触发，读数上传为 artifact；**schedule 已挂载但尚未触发（0 次）** |
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

**DORI 200 相机实测（2026-11-13，`node scripts/bench.mjs --json`，Node + canvas 桩）**：2000×2000 m 场地 + 200 个相机点，`analyzeCoverage(state, { targetCells: 36000 })`。A 组仅 `phys/angle`、B 组追加 `props.camResPx=1920`/`props.camFov=90`，交替顺序各 5 次取中位数：A **18.6 ms** / B **18.6 ms**，差异 **−0.4%**；同机连续 4 次运行的差异区间为 −6.5%～+7.4%，均在 ±10% 内。`doriRows()` 对 200 个对象单次遍历中位数 **0.38 ms**（200/200 行四级齐全）。口径说明：**DORI 不进入 `analyzeCoverage` 的栅格路径**，两组覆盖率差异只是测量噪声；面板渲染才是 DORI 的增量成本，由 `doriRows` 度量。第一轮只记录，不设阻断阈值。

### 3.4 门禁牙齿（`check-gates.mjs`）

在系统临时目录整仓副本里先跑**正面基线**（未破坏副本必须全绿），再构造 **13 种**破坏，断言对应门禁非 0 退出
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
| 13 | `css/style.css` 注入远程 `url(https://…)` | `check.mjs --selftest`（离线承诺判据） |

一条从未红过的判据不算成立；新增判据必须同时准备可构造的负例（`--selftest` 或本脚本）。

### 3.5 Actions 在跑但全红，不作门禁：没有可靠自动校验的部分（必须知情）

> **Actions 在跑，但不作发布门禁。** `ci.yml`/`perf-nightly.yml` 已挂载并实际执行（2026-11-13 核查：CI 60 次全部失败、
> `Perf Nightly` 0 次、Pages 87 次），因此下列判据**没有可依赖的自动校验**：自动任务跑过却从未绿过，不能作为「干净检出上的回归」。
> 发布前的实际执行靠 [release-checklist.md](release-checklist.md) 的人工纪律。

| 判据 | 真实边界 |
|---|---|
| `check-sw.mjs` | 基线是**提交入库**的 `scripts/sw-inputs.sha256`（预缓存输入内容指纹 + 清单 `version`），不依赖 git 工作区或 `git diff HEAD`，干净检出同样生效。清单需在 bump `VERSION` 后执行 `node scripts/check-sw.mjs --update` 重新生成；`--update` 自身会拒绝「输入已变更但版本未递增」，不能用刷新清单掩盖漏 bump；合并冲突时不得手工合并哈希行，取合并后的工作树重新 `--update` |
| `bench.mjs` | 绝对阈值在本机负载/Node 版本变化时会漂移；不同机器结果不可直接比较，只能看是否越过阈值 |
| `build.mjs --check` | 不校验「产物可双击打开/运行正确」，只校验可复现、哈希、体积、CSP 结构与登记一致 |
| `badge.mjs --check` | 只校验「断言数三处一致」，不校验断言本身是否有效 |
| `i18n-scan.mjs` | 只按静态字面量扫描，不证明译文语义正确；JSON/HTML 内的动态拼接可能漏扫 |
| `e2e` | **GitHub Actions 上已执行且失败**（2026-11-13：源码与 dist 两个 job 均为红），不能作为回归依据。本地门禁命令：源码 `node scripts/e2e.mjs`（45 spec / 151 用例：150 通过 + 1 条件跳过）、dist `E2E_ENTRY=dist E2E_PORT=4174 node scripts/e2e.mjs`（149 通过 + 2 跳过），两套均 exit 0（2026-11-13 实测）。`ci.yml` 里的 matrix 双入口 job 与本地命令等价，但当前红。缺 Playwright/Chromium 时 `scripts/e2e.mjs` 打印 `[SKIP]` 并**退 2**（不是 0），跳过不会伪装成通过 |
| `perf:browser` | 不在 `npm run ci`；`perf-nightly.yml` 的 `schedule` 已挂载但**尚未触发（0 次）**，目前没有夜间数据在跑；本机为 SwiftShader，数据不能当真实 GPU 结论。需要时手动执行 `node scripts/perf-browser.mjs` |
| `npm run ci` | 不含 `check-ngm`、`check-discipline`、e2e、perf；不要用「本地 ci 绿」代替全部门禁，按发布清单逐条执行 |
| 本地纪律的局限 | Actions 在跑但全红，等于没有「干净检出上的强制回归」：漏跑、跑一半、看到红仍合并都只能靠人工约束。这是 D2「以本地门禁为准」的现状代价；要在 GitHub 侧显式停用这两个 workflow 或把它们修绿 |

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

### 4.2 `contracts/plugin-api.json`（24 个顶层键）

`check-plugin-api.mjs` 双向比对 `js/features/plugins.js` 的 `PlotPin` **顶层键**与清单：

- 代码有、清单无 → API 泄漏（插件可依赖、下次改名即静默破坏兼容）；
- 清单有、代码无 → 承诺落空（运行时 `undefined`）。

`--selftest` 用含内层花括号、方法简写、ES6 简写属性与 getter 的对象字面量验证解析器只取顶层键。
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
  `addEventListener`、`self`、`Worker`、`SharedWorker`、`BroadcastChannel`、`MessageChannel`、`MessagePort`（全局与原型链）。
- 超时：初始化与每次调用（含导出/导入）上限 **2000 ms**，超时由主线程 `worker.terminate()` 硬终止；
  失败只让该插件进入 `disabled` 并 toast，主工程继续可操作。
- 明确限制：一个插件一个 Worker；`code` 必须为字符串（`file://` 下不能 `fetch` 插件文件）；
  `addObjects` 单次 ≤ 500；`getState` / `addObjects` / `addAnnotation` 按固定 60s 窗口限流（60 / 30 / 60 次），超限只回本次调用错误而不禁用插件；清单原文超过 192 KB 在 `JSON.parse` 前按 UTF-8 字节拒绝；Worker 是**隔离边界而非完整语言级沙箱**，仍可访问 `console`/`Blob`/`crypto` 等
  无主工程权限的 Worker 全局，且不设 CPU/内存配额（只靠 2 s 超时 terminate）。
- `getState` 快照 **16 MB** 与写入类 RPC 参数 **2 MB 字符**是**资源保护线**（防单次快照/参数拖垮主线程），不是沙箱可承载载荷的设计值；大工程真实存在，故不按插件清单 192 KB 收紧。`props` 键数与 `points` 顶点数上限未做，见 C-02。
- 受信任兼容入口：同源 `<script>` 直接调用 `PlotPin.register*` 保留，不套版本与能力门；不可信插件必须走 `loadPlugin`。
- **弃用策略（D-05）**：`contracts/plugin-api.json` 是唯一键清单，**不得为临时需求改键**。旧键退出统一走三步：
  1. 标记：在契约描述里写 `deprecated since <minor>，替代键 <key>`，代码实现保留；
  2. 保留期：至少跨越 **2 个次版本**（minor）的 `PLUGIN_API_VERSION`，期间新旧键并存且行为一致；
  3. 移除：先在 `check-plugin-api.mjs` 增加「旧键不再被示例/文档引用」的断言，再在 `docs/deletions.md` 登记删除，并在同一次变更内 bump minor。
  参考实现：受信任同源 `plugins/sample-exporter.js`；隔离沙箱 `plugins/sample-sandboxed.js`、`plugins/sample-delivered.js`（后者只读 `props.publishState` 生成已交付清单，只声明 `state:read`/`export`）。
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
| `DORI_LEVELS`（独立常量，不在 `APP_LIMITS`） | 25 / 62.5 / 125 / 250 px/m | 侦测/观察/识别/辨认的最远判读距离阈值；出处 IEC 62676-4 表 1（Johnson 判据），改值即改报告口径 |

导入侧统一由 `importLimitErrors(spec)` 判定（`js/core/config.js`）；业务代码不得另写魔法数字。

覆盖率报告的 DORI 列由 `js/core/geometry-coverage.js` 的 `doriMaxDistance()` 计算：`d = resPx / (2·T·tan(fov/2))`，`T` 取 `DORI_LEVELS`。水平像素与张角存可选字段 `props.camResPx` / `props.camFov`（缺失时该行显示「未填」，不进 schema 必填项）。

### 5.2 产物体积预算

- 硬上限 839,680 B；当前值与余量以 `scripts/dist-manifest.json` 为准（见 2.3）。
- CSP：单文件包全部脚本合并为 1 段，只签 1 条 `sha256` 白名单；`script-src` 不得含 `'unsafe-inline'`，哈希数必须等于内联脚本数（当前 1 = 1）。
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

当前 **13/13（L4）**（2026-11-13 实测）。关键硬约束：

| # | 判据 |
|---|---|
| 7 | README 有文档入口，`docs/` 有权威分层 |
| 10 | 判据自己带牙齿：`check-contracts` / `check-plugin-api` / `check-deletions` 等支持 `--selftest` |
| 11 | 单文档 ≤ **60 KB 且 ≤ 600 行**（超限按主题拆分，不删内容） |
| 12 | 每条判据都在总闸里（没有「写了但从不跑」） |
| 13 | 文档里的命令必须指向真实存在的脚本：`node scripts/*.mjs` 文件必须存在，`npm run <name>` 必须是 `package.json` 中的脚本 |

> 第 2 问（判据在 CI 上跑）只核对 **workflow 定义里是否调用了判据/总闸**；Actions 虽有运行但全红且不作门禁（见 §3.5），
> 该问**不代表判据已被可靠执行**——真实执行证据只能来自本地发布清单的日志。

写文档时：不要复制易漂移数字；命令必须可执行；引用旧结论前先核对代码。

---

## 8. 怎么加一条新判据

1. **先问三件事**：违反了会怎样？能不能用「读文件 / 跑命令 / 比数据」回答？过去 3 个月违反过吗？
2. **写成单项**：能单独跑，打印读数（扫了多少、比了多少）；读数为 0 视为失败（空跑比漏报更糟）。
3. **配一颗牙齿**：构造一份「应当失败」的输入并断言它失败（`--selftest` 是现成形状）。
4. **挂进 `check.mjs`**，确认本地与 CI 走同一条命令（CI 仅作参考，不作合并阻断）。
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
| 未备份就改代码 | 每个任务开工前先建 `2026-11-12/dev-plan/backup/<任务>/` 存原件，并在改动清单登记一行；无登记不得开工 |
