# 性能与基线（performance）

> **读者**：做渲染/数据重构、判断“这次改动有没有变慢”的开发者。
> **回答**：性能怎么测、阈值在哪、历史读数是多少、哪些结论不能外推。
> **不回答**：门禁整体结构见 [engineering](engineering.md)§4，测试分层见 [testing](testing.md)。
> **口径**：本文读数是**带日期的快照**，不是当前承诺；复跑命令见 §2。阈值唯一来源是 `scripts/bench.mjs`、`tests/perf/browser-baseline.perf.mjs` 的常量，本文只摘录。
> **铁律**：Node 数据不得冒充浏览器数据；SwiftShader 数据不得冒充真实 GPU；同机双标签不得冒充双设备。

## 1. 三种口径，互不替代

| 口径 | 工具 | 测什么 | 不能证明什么 |
|---|---|---|---|
| Node 基准 | `scripts/bench.mjs` | 纯算法/逻辑耗时、相对退化、绝对阈值 | 真实 Canvas2D 光栅、真实 GPU、真机帧率 |
| 真实浏览器代理 | `scripts/perf-browser.mjs` | Chromium 中真实 Canvas2D 帧耗时、静态层重建、heap、导入 | 真实 GPU（本机为 SwiftShader）、真机温控/功耗 |
| 人工/真机 | 见 [manual-acceptance](manual-acceptance.md) | 目标设备连续平移、低端机插件体验 | 可回归性（不可自动重跑） |

## 2. 采集方法与产物

```text
node scripts/bench.mjs              # 人类可读 + 阈值结论
node scripts/bench.mjs --json       # 机器可读
node scripts/perf-browser.mjs       # 浏览器采数 + 门禁
node scripts/perf-browser.mjs --no-gate
node scripts/perf-browser.mjs --no-gate tests/perf/p2-perf.perf.mjs
```

- **Node**：Canvas 为桩，同一机器连续多轮取中位数；阈值是绝对值，跨机器不可直接比较，只看是否越线。
- **浏览器**：配置在 `playwright.perf.config.mjs`，CSS 视口 1920×1080、DPR1/DPR2；世界域 2000×1500 m；对象构成为 1/3 `point.marker` + 1/3 `rect.area` + 1/3 三节点 `line.custom`，全在视野内（静态层重建最坏情况）。
- **指标**：逐帧主线程耗时 P50/P95/P99（含强制光栅）、静态层重建 P50/P95、导入耗时、`performance.memory.usedJSHeapSize` 峰值、画布/静态层字节、WebGL renderer 字符串。
- **产物**：`test-results/perf-browser-baseline.json` 等；`test-results/` 被 `.gitignore` 忽略且会被 Playwright 清空，**不作为长期证据**，需要留档复制到 `acceptance-evidence/`。
- 缺 Playwright/Chromium 时 `[SKIP]` 并退 2，不得当通过。
- 报告中的「画布可视区 1472×1028」是页面内 `canvasWrap` 实际尺寸，不是视口尺寸。

## 3. 阈值

### 3.1 Node 基准（摘录，完整表以 `bench.mjs` 输出为准）

2026-11-14 起 `bench.mjs` 跑 **3 轮独立进程**，计时类指标逐轮取最小值后再判定（压抖动，不降阈值）；`CI=true` 时 `--no-gate` / `PERF_NO_GATE` 直接报错退出。

| 指标 | 阈值 |
|---|---|
| 缓存帧 avg / P95 | ≤8 ms / ≤3 ms（P99 ≤10 ms 仅告警） |
| 静态层重建（2000 对象） | ≤60 ms |
| 直接全量帧 | ≤60 ms |
| `heapUsed` | ≤64 MB |
| 覆盖率 1000×1000 m / 5000×5000 m | ≤300 ms / ≤300 ms |
| 规则检查（2000 对象 / 30 类型） | ≤500 ms |
| 覆盖率缩放差异 | ≤1 个百分点 |
| 视口裁剪率 | ≥60% |
| 符号渲染 500 图元 / 索引加载 | ≤60 ms / ≤10 ms |
| SVG 导入（可达最坏组合 62 KB） | ≤50 ms |

### 3.2 浏览器门禁（`tests/perf/browser-baseline.perf.mjs` 的 `GATES`）

| 场景 | 帧 P95 | 重建 P95 | heap 峰值 | 空工程导入 | 已有工程导入 | 静态层字节 |
|---|---|---|---|---|---|---|
| 2000 @ DPR1 | 16.7 ms | 100 ms | 64 MB | 300 ms | 250 ms | 8 MB |
| 5000 @ DPR1 | 16.7 ms | 250 ms | 128 MB | 500 ms | 400 ms | 8 MB |
| 10000 @ DPR1 | 16.7 ms | 450 ms | 200 MB | 900 ms | 900 ms | 8 MB |
| 5000 @ DPR2 | 33.3 ms | 500 ms | 128 MB | 600 ms | 600 ms | 32 MB |

DPR2 组帧 P99 >16.7 ms 只告警不阻断。门禁仅在显式 `npm run perf:browser` 时生效，**不在 `npm run ci`、不在 CI**。

**运行前置条件（2026-11-14 起）**：浏览器门禁只在**宿主空闲**时执行——同一台机器上不要并行跑其它构建、测试或 IDE 重任务。
判据是既有的绝对阈值 + 同机多轮取最小值，不随机器放宽；**宿主并发负载下可能红，但不等于产品回归**。
实测证据（同一台机器、同一份代码、阈值未改）：4 次连跑 2 绿 2 红；两次红分别出现
5000 档重建 P95 162→275 ms、10000 档导入 419→958 ms；同期 CPU 占用 52%–58%，且存在本仓库之外的 node 进程
（其它项目的 `npm run verify`、测试任务）。门禁失败时用例会打印主机快照（逻辑核 / 可用并行度 / CPU 型号 /
空闲内存 / Node 版本），先看快照再判断是否代码退化。

## 4. 历史读数（引用时必须带日期与命令）

### 4.1 Node 基准

**2026-11-08 本机**：Windows 10 19045 / i5-13400 / 15.8 GB / Node v24.14.0；`node scripts/bench.mjs --json`，独立进程复跑两次取后一次，主要读数抖动约 ±5%。

| 指标 | 实测 | 阈值 | 结论 |
|---|---|---|---|
| 缓存帧 avg / P50 / P95 / P99 | 0.38 / 0.36 / 0.46 / 0.63 ms | 8 / 3 / — / 10 | 通过 |
| 静态层重建（2000 对象） | 23.46 ms | 60 ms | 通过 |
| 直接全量帧 | 21.41 ms | 60 ms | 通过 |
| 视口裁剪率 | 99.4%（绘制 13 / 2000） | ≥60% | 通过 |
| `heapUsed` | 30.19 MB | 64 MB | 通过 |
| 覆盖率 1000×1000 m（30 摄像头） | 7.7 ms（44.3%） | 300 ms | 通过 |
| 大场地覆盖率 5000×5000 m | 14.7 ms / 173,889 格 / 44.3% | 300 ms | 通过 |
| 覆盖率缩放差异 | 0 pp（4 级均 44.42%） | ≤1 pp | 通过 |
| 规则检查（2000 对象 / 30 类型） | 13.3 ms | 500 ms | 通过 |
| 符号渲染（500 图元） | 重建 3.51 / 缓存帧 0.09 / 直接 2.88 ms | 60 ms | 通过 |
| 符号库索引加载（36 图元） | 0.018 ms | 10 ms | 通过 |
| SVG 导入（199 path / 62,154 B） | 1.124 ms | 50 ms | 通过 |

**覆盖率口径 v3（2026-11-08，N-20）**：`node scripts/selftest.mjs --filter="覆盖率口径"`；5000×5000 m 单次 `analyzeCoverage` 6 ms（Node 桩），优化器搜索 427 ms（仅记录），统计/面板/导出面积严格相等。v3 与 v2 数值不可直接比较。

**快照列表/淘汰（2026-11-08，N-21）**：20 条 × 1000 对象，`listSnapshots` 0.6 ms vs 全量 `snapshotRecords` 41.4 ms；单条快照生成 16.8 ms；20 条 170.8 ms（仅记录）。

**2026-11-14 本机复跑（i5-11400 / 12 逻辑核 / Node v26.13.0，与 2026-11-08 的 i5-13400 不是同一台，数字不可横比）**：`node scripts/bench.mjs` 连跑 5 次（单轮采数，未取多轮最小），
静态层重建 31.33 / 29.43 / 31.14 / 35.41 / 30.22 ms（最大值 ÷ 最小值 = 1.20），
heapUsed 25.17–28.05 MB，缓存帧 P95 0.11–0.14 ms；5 次均未越过 60 ms / 64 MB / 3 ms，判定一致。

**2026-11-14 起 bench 的「3 轮取最小」实测（同一台 i5-11400）**：连跑 5 次采用值 33.41 / 26.90 / 24.90 / 26.84 / 26.36 ms，5/5 判绿；
机器型号与每轮原始值由 `node scripts/bench.mjs` 直接打印，失败时另打主机快照。

### 4.2 真实浏览器代理（Chromium + SwiftShader）

**采集环境（2026-11-07/08 两轮）**：CSS 视口 1920×1080（`canvasWrap` 1472×1028），DPR1 三组 + DPR2 一组，headless，SwiftShader（ANGLE Vulkan 1.3.0），世界域 2000×1500 m。命令 `node scripts/perf-browser.mjs --repeat-each=2`（2026-11-08 为 20 passed / 1.2 min）。**这是代理值，不能判断 M5 真机通过。**

**2026-11-07 历史对照**（当日 `npm run perf:browser`，4 passed / 19.1 s；原报告已并入 [manual-acceptance](manual-acceptance.md)，git 历史可查）：

| 场景 | 帧 P50 / P95 / P99 / max (ms) | 静态层重建 P50 / P95 (ms) | heap 峰值 |
|---|---|---|---|
| 2000 对象 DPR1 | 0.8 / 3.0 / 4.8 / 4.9 | 45.5 / 51.6 | 16.85 MB |
| 5000 对象 DPR1 | 1.6 / 6.3 / 7.2 / 8.8 | 104.9 / 126.2 | 36.98 MB |
| 10000 对象 DPR1 | 2.9 / 6.9 / 11.7 / 13.4 | 219.4 / 235.7 | 68.88 MB |
| 5000 对象 DPR2 | 11.0 / 17.1 / 19.5 / 23.1 | 210.8 / 224.4 | 37.18 MB |

**2026-11-08 复跑（两轮并列；历史快照，其中 10000 档 P95 182.3 ms 属旧机代理值，当前表征以下一节 2026-11-14 实测为准）**：

| 场景 | 帧 P50 / P95 / P99 / max (ms) | 静态层重建 P50 / P95 (ms) | heap 峰值 |
|---|---|---|---|
| 2000 对象 DPR1 | 0.6 / 2.0 / 2.4 / 2.5；0.6 / 2.4 / 4.0 / 4.9 | 37.6 / 42.4；38.1 / 40.1 | 23.55；23.64 MB |
| 5000 对象 DPR1 | 0.7 / 2.1 / 3.4 / 4.6；0.7 / 2.3 / 3.6 / 4.5 | 86.6 / 90.9；87.5 / 100.9 | 26.57；33.92 MB |
| 10000 对象 DPR1 | 0.9 / 3.1 / 4.9 / 5.2；1.0 / 3.7 / 4.6 / 4.7 | 175.6 / 182.3；181.8 / 199.4 | 65.92；62.10 MB |
| 5000 对象 DPR2 | 7.9 / 11.6 / 14.5 / 15.1；8.2 / 12.3 / 16.2 / 16.3 | 167.6 / 175.1；190.6 / 301.6 | 56.32；26.57 MB |

**2026-11-14 本机复跑（3 轮取最小值，阈值未改）**：DPR1 2000/5000/10000 帧 P95 2.0–3.2 ms，
重建 P95 56–60 / 156–162 / 276–322 ms，heap 峰值 21–59 MB；DPR2 5000 帧 6.7–7.2 ms、重建 258–280 ms。
本机 10000 对象空闲态重建 P95 另有三轮实测 294.6 / 343.8 / 336.4 ms（`p2-render`）。
**本机当前表征以这组实测为准，不沿用 2026-11-08 的 182.3 ms**：那是历史快照，换机或换负载后不可直接比较。

**结论**：四组均通过门禁，未出现超阈值回退；DPR2 重建 P95 轮2 301.6 ms（阈值 500），同用例两轮相差 72%，属 SwiftShader 抖动；heap 峰值受导入路径与 GC 时机影响，两轮可相差一倍，均远低于阈值，未做逐版本归因。

### 4.3 专项打点（都有可复跑命令）

| 主题 | 命令 | 关键结果 |
|---|---|---|
| 10k 拖动捕捉（N-22） | `node scripts/perf-browser.mjs tests/perf/speed.perf.mjs -g "N-22"` | 捕捉解析 P95 18.5/14.1 → 3.1~4.0 ms；拖动帧 P95 −34%~−36%；heap 增量 ≤0.63% |
| 10k 连续点选（N-23） | `node scripts/perf-browser.mjs tests/perf/speed.perf.mjs -g "N-23"` | 点选帧 P95 661.1/710.2 → 20.0/20.9/22.1 ms；30 次点选静态重建 30 → 0；静态层单次重建未回退 |
| 场地手柄拖拽（R-07） | `node scripts/perf-browser.mjs tests/perf/p2-perf.perf.mjs -g "R-07"` | 40 次拖动重建 40 → 0；整帧 P95 224.8 → 18.2 ms |
| 历史快照别名（CORE-P2-3） | `node scripts/perf-browser.mjs --no-gate tests/perf/p2-perf.perf.mjs -g "CORE-P2-3" --repeat-each=2` | 20 条历史堆增量 19.657 → 8.912 MB（−54.7%）；`pushHistory` 826/840 → 505/488 ms |
| 快照列表 IDB 读取（CORE-P2-4） | 同上 `-g "CORE-P2-4"` | 列表/淘汰各 1 次 `idbGetKey`（P95 0.9/0.6、0.3/0.3 ms）；全量读 20 次（P95 360/350 ms） |
| 导出字段去重（IO-P2-11） | 同上 `-g "IO-P2-11"` | `objectLength`/`objectArea` 13,333 → 10,000 次（−25%）；墙钟差异在抖动内，不宣称提速 |
| 历史含照片内存（N-24） | `node scripts/perf-browser.mjs tests/perf/speed.perf.mjs -g "N-24"` | 20 条含照片历史堆增量 28.01 → 1.00 MB（−96.43%）；undo max 11.3 ms |
| 10k 快照列表（N-21/N-24） | 同上 | `listSnapshots` P95 0.8 ms vs 逐条读 384.2 ms（约 1855×） |
| 保存路径快照（F1） | `node scripts/perf-browser.mjs tests/perf/f1-save.perf.mjs` | 10k 对象 `persistableState` P95 89.6 → 64.3 ms（−28%）；单次保存分配 27.7 → 6.3 MB（−77%）；快照 JSON 与旧实现逐字节一致 |
| 静态层重建排序与参照层空转（F2） | `node scripts/perf-browser.mjs tests/perf/f2-render.perf.mjs` | 10k 对象每次重建的大数组排序 1 → 0 次（冷排序本身仅 0.2 ms，整层 P95 差分落在宿主噪声内）；参照版不可见时 1.5 s 内 `invalidateStatic` 3 → 0 次（10k 工程约每 300 ms 一次整层重建被省掉）；缓存键 3.8 µs/次，未替换 |
| 20k/50k 线性裁剪占比（F4 前置基准） | `node scripts/perf-browser.mjs --no-gate tests/perf/f4-scale.perf.mjs` | 裁剪占整层重建 0.22%–0.36%（10k 1.2 ms / 20k 1.8 ms / 50k 3.9 ms），`drawObject` 占 82%–95%；结论：空间索引收益上限约 4 ms/次重建，**F4 不开工** |

口径：拖动/点选帧耗时用 `PointerEvent.timeStamp` 到 rAF 完成；拖动每轮 96 个真实 `pointermove`，点选 30 个样本、前 6 次预热；重建耗时用 `invalidateStatic()` + `drawScene()` + `getImageData()` 强制光栅，2 次预热后取 3 个稳态样本 P95；堆读数经 CDP `HeapProfiler.collectGarbage` 强制 GC 两次后取 `Runtime.getHeapUsage`。

### 4.4 静态层局部补绘（M6，2026-11-13）

**改了什么**：`patchStaticObjects` 不再只用旧 `staticBounds` 推导补绘矩形，而是对每个受影响 id 取**旧包围盒 ∪ 新 `objectSnapBounds`**（`patchUnionRect`，96 px pad、60% 面积阈值）；`clip`/`clearRect` 恒等于并集矩形，重绘 `view` 再按 pad 外扩（`applyPatchRect`），把矩形外 96 px 内的邻居一起重画。旧盒缺失或对象已删除时回退整层重建。

**证据**：`tests/e2e/perf-render.spec.mjs` 新增 3 条像素采样用例——对象位移、放大、编辑 A 后 B 的标签仍在。改前分别红在 `atNew`、`inside1`、`after=0`，且 `patched=true`（`staticRev` 未变，证明缺陷在局部补绘路径而非被整层重建掩盖）；改后 4 passed。selftest 第 47 分区同步新增 21 条纯函数/Canvas 桩断言。源码入口全量 e2e 2026-11-13 记录 154 passed / 1 skipped / 0 failed。

**未验证 / 残留**（不得写成“已解决”）：

- 标签溢出超出 96 px pad（宽度约 >192 px）仍可能被擦；`objectSnapBounds` 对 point 只返回锚点，未做 `measureText` 精确外扩。
- 只在 **dpr=1 的 headless Chromium** 下测过；采样换算按 dpr 归一，但 dpr=2 的设备像素对齐未实测，真实 GPU/真机也未验证。
- 只覆盖属性面板 `commitObjectEdit` 路径；鼠标拖拽期间 `drag` 非空，走整层重建，未在同一用例覆盖。
- 这是渲染路径优化，不改变落盘数据、图层顺序或绘制内容；最坏情况回退整层重建，同一画面、仅成本退化。

## 5. 已知瓶颈与风险

| 风险 | 证据 | 影响 |
|---|---|---|
| 静态层重建随对象数近似线性 | 2026-11-07 P50：45.5 → 104.9 → 219.4 ms（2000/5000/10000）；2026-11-08 轮1 37.6 → 86.6 → 175.6 ms | 10k 每次全量重绘约 0.2 s；平移/缩放依赖缓存帧 |
| 高 DPR 光栅成本 | DPR2 帧 P95 17.1（11-07）、11.6/12.3（11-08） | 高分屏低端设备可能掉到 50 fps 附近 |
| heap 随对象数增长 | 11-07 16.85 → 36.98 → 68.88 MB；11-08 轮1 23.55 → 26.57 → 65.92 MB | 仍在门禁内，长时编辑斜率未测 |
| Node 桩与真实 Canvas 差异 | 2000 对象重建 23.46 ms（Node）vs 51.6 ms（浏览器 P95） | 两套阈值必须分别维护；Node 绿不代表浏览器绿 |
| SwiftShader 与真实 GPU 差异 | 本机无独立 GPU | 绝对值不可外推 |
| 大底图首次解码 | `APP_LIMITS.BG_MAX_DECODE_PIXELS = 40 MP` | 可能一次性卡顿，未量化 |
| 性能门禁不在主 CI | `.github/workflows/ci.yml` 只跑 Node bench；`perf-nightly.yml` 已挂载但 0 次运行 | 合并前不拦截浏览器回归 |
| 机器差异 | 绝对阈值 | 共享机器负载高时可能误报；记录必须带机器信息 |

## 6. 未实测 / 未验证（不得当作通过）

| 项 | 状态 |
|---|---|
| 真实 GPU 帧率与长跑 | 未验证：本机 Chromium 走 SwiftShader |
| 低端 Android/iOS 真机 | 未验证：无真机、无 HTTPS 站点 |
| 真实双设备 WebRTC 性能 | 未验证：仅同机双标签；`iceServers: []` |
| 10000 对象以上 | 未实测：导入上限 100000，性能只测到 10000 |
| 长事务/soak 内存曲线 | 未实测：只有单次 heap 峰值 |
| 5000×5000 m 覆盖率在真实浏览器 | 未实测：只有 Node v3 的 6 ms |
| 真实 5 万行 XLSX 解析 | 未实测：只有构造样本断言 |

## 7. 采数与提交规范

1. 先跑 `node scripts/bench.mjs --json`；涉及渲染改动再加 `node scripts/perf-browser.mjs`。
2. commit body 写「机器、日期、命令、关键读数、阈值、结论」；不达标不提交，禁止改阈值或删断言。
3. 只引用本文格式的数据（日期 + 命令 + 环境）；无法核对来源的旧数字不再引用。
4. 浏览器数据留档复制到 `acceptance-evidence/`，不要依赖 `test-results/`。
5. 调整阈值必须写「旧值 → 新值、理由、连续 N 轮实测」，且不得放宽到无法拦住已知退化。
