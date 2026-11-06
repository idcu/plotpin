# 工程纪律：门禁、契约与已知空白

> 这份文档是**权威层**：门禁有哪些、各自守什么、什么**故意不设**门禁。
> 入口（README）只放"怎么跑"，细节在这里维护。
> 判据的取舍标准见 ngm 仓库的 `docs/practice/engineering-discipline.md`
> （工程纪律方法论：什么值得写成判据、成熟度分级、四种失效形态）——
> **任何"我们保证了 X"必须能指向一条会变红的判据；没有判据的，就明说不保证。**

---

## 1. 命令：`npm run ci`（CI 同一条）

```
node scripts/check.mjs --selftest   语法 → 入口资源 → 离线承诺 → 断言数 → 契约 → API → 分层 → 自测
        ├── scripts/badge.mjs --check        断言数三处一致（README 徽章/正文/命令注释）
        ├── scripts/check-contracts.mjs --selftest   契约判据 + 判据自己会红
        ├── scripts/check-plugin-api.mjs --selftest  API 面 + 解析器会红
        └── scripts/selftest.mjs            逻辑层自测（--selftest 显式执行，退出码纳入门禁）
node scripts/bench.mjs              渲染基准（avg / P95 / 重建 / heapUsed / 裁剪 / 覆盖率阈值）
node scripts/build.mjs --check      源重建 ↔ scripts/dist-manifest.json 登记哈希比对
node scripts/check-gates.mjs        门禁牙齿：5 种人为破坏必须让对应门禁非 0
node scripts/e2e.mjs               浏览器级功能测试（可选，devDependency；**不在 ci 路径**）
node scripts/perf-browser.mjs      真实浏览器性能基线（可选；**不在 ci 路径**，见 §5.4）
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
bench 的 Node 桩数据替代**——两者的场景、渲染器与绝对值不可比（见 §5.4）。

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

> **为什么不给插件做沙箱**：同源纯 JS 没有隔离可言。这里的边界是**评审与签名**，
> 写"我们打算做沙箱"比不做更危险。清单能保证的只有一件事：**哪些名字是你公开承诺过的**。

---

## 5. 故意不设门禁的地方（明说不保证）

| 项 | 为什么不设 | 现在的做法 |
|---|---|---|
| Service Worker 的 `CACHE` 版本号 | "改了 js 就必须 bump"没有可读的事实源：SW 的预缓存清单在运行时从 `index.html` 解析，构建期不知道"上一版是什么" | 靠发布纪律 + `sw.js` 注释；`pwa.test.mjs` 只守下限（版本号格式与 ≥ 基线） |
| 英文文案的**质量** | 判据只能证明"键在、非空"，证明不了译文准确 | selftest 覆盖"全量中英文案"路径；语义由评审看 |
| 渲染性能的**真实设备基线** | 真机 GPU / 不同 DPI 的组合无法在离线 CI 里稳定复现；绝对阈值只能说明“这台机器上没退化”，证明不了所有用户设备流畅 | Node 桩下已有阻断门禁（§5.1）；真实浏览器基线（§5.4）在 Chromium headless + SwiftShader 上可重复采集，但默认不进 `npm run ci`，数据不得与 bench 混用 |
| 插件 API 的**向后兼容** | 需要契约测试 + 历史版本矩阵，成本高于当前收益 | 版本号三处一致由契约守；破坏性变更写进 README |

**这一节比上面几节更重要**：把"没有判据"的区域写出来，读者才不会把绿色的
`npm run ci` 当成"全部保证"。

### 5.1 阻断阈值与门禁牙齿（A-13）

阈值是**绝对值**，不是与上一版比对；改阈值必须在 commit body 写明「旧值 → 新值 + 理由 + 连续实测」。
当前余量为实测值的 2–4 倍（本机 2026-11-06 实测区间：A-06 连续 3 次 + A-09/A-11/A-15/A-16 单次；avg 0.34–0.48ms / P95 0.42–0.91ms / 重建 22.1–31.3ms / heapUsed 14.48–19.41MB / 覆盖率 7.4–14.4ms）。

| 指标 | 阻断阈值 | 实测（Node 桩 / 2000 对象 / 1600×900，多次区间） | 说明 |
|---|---|---|---|
| 缓存帧平均 | ≤ 8 ms | 0.34–0.48 ms | 50fps 预算的一半，下限保护 |
| 缓存帧 P95 | ≤ 3 ms | 0.42–0.91 ms | 偶发卡顿不能靠平均帧掩盖 |
| 缓存帧 P99 | ≤ 10 ms（仅告警） | 0.79–1.23 ms | 先积累数据，不阻断 |
| 静态层重建 | ≤ 60 ms | 22.1–31.3 ms | 对象增删改时触发 |
| 直接全量帧 | ≤ 60 ms | 21.4–29.32 ms | 导出/打印路径 |
| `heapUsed` | ≤ 64 MB | 14.48–19.41 MB | bench 结束时读数，不含长跑斜率 |
| 覆盖率分析 | ≤ 300 ms | 7.4–14.4 ms | 1000×1000m + 30 摄像头 |
| 视口裁剪率 | ≥ 60% | 99.4% | 高倍缩放下 |
| 单文件体积 | ≤ 750 KB | 689.9 KB | 留约 8% 余量 |
| 产物 SHA256 | 必须等于 `scripts/dist-manifest.json` | `70b36e39…` | 从源重建、二次构建确定性一致 |
| CSP 内联脚本哈希 | 哈希数 = 内联脚本数（剔除 HTML 注释） | 36 = 36 | 单文件包每个内联脚本一条 `sha256` 白名单；`script-src` 不得含 `'unsafe-inline'` |
| 断言数 | ≥ 1806 且 0 失败 | 1806 | 只增不减 |

**门禁牙齿（`npm run gates`）**：上面这些判据本身也会假绿（只打印不比对、缺文件退 0、
模板缺失空操作）。`scripts/check-gates.mjs` 在系统临时目录的整仓副本里构造 5 种破坏——
P95 超标、`dist` 产物篡改、`ngm.json` 缺失、README 断言数模板缺失、selftest 失败——
断言对应门禁全部非 0 退出。它不碰仓库本身，也不依赖任何第三方包。

### 5.2 浏览器级测试（A-14，可选）

`tests/e2e/*.spec.mjs` 经本地静态服务器（`scripts/serve.mjs`，零依赖）在真实 Chromium 中执行，
覆盖 Node 桩无法证明的部分：

| 文件 | 守什么 |
|---|---|
| `smoke.spec.mjs` | 页面加载无脚本错误 / 入口无远程引用 / CSP 声明；点工具落点与选择命中；JSON 导出真实下载可解析 |
| `persistence.spec.mjs` | IndexedDB 真实 v1→v2 回写；资产回收按命名空间并集（跨工程不误删）；非法 JSON 导入失败后现场不变；跨楼层照片导出/导入不丢 |
| `csp.spec.mjs` | 4 条注入路径（导入 JSON / 旧存档 / 插件注册 / 类型列表渲染）在浏览器中确实无法执行 JS |
| `history.spec.mjs` | 撤销/重做、新增楼层、删除当前楼层、切换楼层后刷新与操作后状态一致 |
| `interaction.spec.mjs` | 单击对象不落盘/不清覆盖率/不留空撤销快照；拖拽中 Esc 回滚到原位 |

**性能基线单独一套**：`tests/perf/*.perf.mjs` 由 `playwright.perf.config.mjs` 驱动、`npm run perf:browser`
执行，不混进上面的功能 e2e；指标与阈值见 §5.4。

**边界**：`@playwright/test` 只允许出现在 `devDependencies`；`build.mjs` 的单文件产物不引用
`tests/` 与 `node_modules/`。`npm run ci` 不含 e2e——无浏览器环境不会因此变红，但显式运行
`npm run test:e2e` 时缺依赖/缺浏览器会以 `[SKIP]` + 退出码 2 明确失败，而不是假绿。

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

### 5.4 真实浏览器性能基线（B-01，可选门禁）

`tests/perf/browser-baseline.perf.mjs` 经 `npm run perf:browser` 在真实 Chromium 中跑，
**不在 `npm run ci` 路径**（浏览器/机器差异大，不能把某台机器的绝对值当成全量承诺）：

| 项 | 取值 |
|---|---|
| 运行命令 | `npm run perf:browser`（门禁默认开）/ `node scripts/perf-browser.mjs --no-gate`（只采数） |
| 浏览器 | Chromium（Playwright devDependency），headless，1920×1080 CSS 视口，DPR1；另加 5000 对象 @DPR2 采样 |
| 画布 | 实际 `#canvasWrap` = **1472×1028** CSS 像素（顶栏/侧栏占位后）；静态层位图 DPR1 **5.77MB** / DPR2 **23.09MB** |
| 场景 | 世界域 2000×1500m，对象构成 1/3 `point.marker` + 1/3 `rect.area` + 1/3 `line.custom`（3 节点），全部在视野内（最坏重建） |
| 指标口径 | 每帧 = `drawScene` + `getImageData(0,0,1,1)` **强制同步光栅**；heap 用 `performance.memory.usedJSHeapSize`（`--enable-precise-memory-info`），逐帧抽样取峰值 |
| 报告 | `test-results/perf-browser-baseline.json`（gitignore，含原始样本汇总与阈值） |

**实测（修复导入 O(N²) 后 4 轮区间，2026-11-06，本机 Windows；渲染器为 ANGLE/SwiftShader 软件光栅）**

> 修复前「已有工程内导入」实测：2000 → 158–200ms；5000 → 946–1215ms；10000 → 4068–4848ms；
> 5000@DPR2 → 950–1144ms。修复后如下，导入数据为同机复测。

| 规模 | 缓存帧 P95 | 缓存帧 P99 | 静态层重建 P95 | heapUsed 峰值 | 空工程导入 | 已有工程内导入 | 导入后首帧 |
|---|---|---|---|---|---|---|---|
| 2000 对象 DPR1 | 3.0–4.2 ms | 4.0–6.0 ms | 39–53.7 ms | 16.34–16.43 MB | 57.4–70 ms | 81.1–85 ms | 40.2–52 ms |
| 5000 对象 DPR1 | 3.5–4.6 ms | 5.5–6.1 ms | 101.3–135.7 ms | 36.5–43.02 MB | 117.1–161 ms | 147.7–169 ms | 107.3–111 ms |
| 10000 对象 DPR1 | 4.2–6.2 ms | 5.7–7.9 ms | 216.9–296.6 ms | 60.37–78.77 MB | 275.8–384.1 ms | 306.3–384.8 ms | 186.4–264.1 ms |
| 5000 对象 DPR2 | 12.8–18.4 ms | 15.8–23.3 ms | 190.1–277.4 ms | 42.91–43.02 MB | 136.2–188 ms | 159.8–200 ms | 185.5–303 ms |

**阻断阈值（实测值约 2 倍余量；改阈值须在 commit body 写明旧值 → 新值 + 理由 + 连续实测）**

| 规模 | 缓存帧 P95 | 重建 P95 | heap 峰值 | 空工程导入 | 已有工程内导入 | 静态层字节 |
|---|---|---|---|---|---|---|
| 2000@DPR1 | ≤ 16.7 ms | ≤ 100 ms | ≤ 64 MB | ≤ 300 ms | ≤ 250 ms | ≤ 8 MB |
| 5000@DPR1 | ≤ 16.7 ms | ≤ 250 ms | ≤ 128 MB | ≤ 500 ms | ≤ 400 ms | ≤ 8 MB |
| 10000@DPR1 | ≤ 16.7 ms | ≤ 450 ms | ≤ 200 MB | ≤ 900 ms | ≤ 900 ms | ≤ 8 MB |
| 5000@DPR2 | ≤ 33.3 ms | ≤ 500 ms | ≤ 128 MB | ≤ 600 ms | ≤ 600 ms | ≤ 32 MB |

- 16.7ms = 60fps 单帧预算；DPR2 的 33.3ms = 30fps 下限，因为软件光栅下 DPR2 接近 60fps 上限（P99 最高 23.3ms）。
- 导入 O(N²) 已修，「已有工程内导入」阈值由 450/2200/10000/2500ms 收紧为 250/400/900/600ms
  （4 轮实测 81.1–85 / 147.7–169 / 306.3–384.8 / 159.8–200ms），不再是“松阈值放行”。
- 门禁牙齿：临时把 `2000@DPR1` 的 `frameP95` 改成 0.1ms，用例如期失败并以退出码 1 结束；随后已还原。
- **与 `bench.mjs` 的关系**：bench 是 Node + canvas 桩，只证明相对退化、进 `npm run ci`；
  本套件是真实 Canvas2D 光栅，证明这台机器上的绝对体验。两者数据不可互换，也不得互相冒充。

**方法学边界（不许拿这些数当全量结论）**

- headless Chromium 使用 **SwiftShader 软件光栅**，没有真机 GPU 上屏；缓存帧里包含强制 `getImageData`
  同步开销（draw 本身 P50 仅 0.2–1.0ms），因此缓存帧数值偏保守，不能直接当“真机 FPS”。
- 只测一台 Windows 机器 / 一个分辨率 / 两种 DPR；未测 Safari/Firefox、未测低端移动设备。
- heap 是 `performance.memory` 抽样峰值（无 GC 强制），会随 GC 时机波动（DPR2 峰值 36–66MB 即为例证）。

**B-01 结论：分块渲染 / 静态层 LRU / Worker**

| 方案 | 结论 | 数据依据 |
|---|---|---|
| 静态层重建分块（逐帧画一批对象） | **后续再做（B-09 优先）** | 缓存帧 P95 4.2–6.2ms（10k）已满足 60fps，瓶颈只在重建：10k 一帧阻塞 199–297ms（>3 帧预算）。分块能把长任务切短，但需要 generation token 处理中途失效与部分静态层，属于渲染架构改动，本轮不做 |
| 静态层 LRU（缓存多个视口位图） | **不做** | 签名含 zoom/pan，平移/缩放必然重建；每层 5.77MB（DPR2 23.09MB），LRU=3 即 17–69MB，只在“回到同一视口”时命中。当前无命中率数据支撑，收益不明、内存代价确定 |
| Worker + OffscreenCanvas | **后续再做（前置条件未满足）** | 缓存帧主线程成本仅 1–6ms，没有“渲染占满主线程”的证据；Worker 化要把 `state` 快照、类型/样式/字体/标签几何整体迁走，并且失去同步命中测试与 `getImageData` 导出一致性，零依赖与导出路径风险远大于当前收益 |

**B-09 前置结论（导入 O(N²) 已修，渲染侧仍待决策）**

- **已修**：同一份 10000 对象 JSON，“当前工程已有 10000 个对象时导入”从 **4068–4848ms** 降到
  **306.3–384.8ms**（约 11–16 倍），与“空工程导入” 275.8–384.1ms 的比值由约 16 倍降到
  **0.95–1.41 倍**（4 轮区间，已基本持平）。
  根因是 `buildProject → sanitizeObjects → baseObject → nextObjectId()` 每创建一个对象都扫一遍全量
  `state.objects`；修法见 `docs/modules.md` 的 `objectNameScopeFor / beginObjectNameScope /
  withObjectNameScope`：批量路径一次聚集已占用编号，作用域内 O(1) 取号；`baseObject` 对显式
  `name` 不再触发取号。编号语义（唯一、稳定、从“已占用数量+1”跳号）保持不变。
- **同类路径排查结果**：DXF/PDF 批量导入、表格预览与落行、复制/粘贴、覆盖率建议批量落点已一并收敛；
  合并（`mergeProject`）按 id 合并不分配新编号，无需改动。单次交互创建仍是 O(N) 一次全量扫描
  （实测 10k 对象下单次 < 1ms），不属于需要修的热路径；未发现其它随对象数平方增长的分配/查找路径。
- **仍需 B-09 决策**：10k 全视野静态层重建 199–297ms、导入后首帧 212–222ms，分块重建仍是主要候选；
  本轮不直接改渲染架构。

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

当前：**13/13 → L4**。缺口出现在哪一问，就是下一轮要补的判据（最近一次修正：第 13 问的
`scripts/*.js` 正则缺少右边界，会把 `scripts/dist-manifest.json` 误判为不存在的 `.js` 脚本）。
