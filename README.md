# 📌 图钉 PlotPin

**离线、零依赖、双击即用的通用图纸标注工具**

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![offline](https://img.shields.io/badge/offline-100%25-orange.svg)](#)
[![test](https://img.shields.io/badge/selftest-2706%20assertions-brightgreen.svg)](scripts/selftest.mjs)

PlotPin 是一个在浏览器里运行的图纸标注工具：在一张图片底图或矢量场地上放置设备点位、按真实比例绘制区域与折线、测量尺寸，并把图纸与台账导出为常见格式。运行时不需要安装、服务器或网络，入口是仓库根目录的 `index.html`；托管到静态服务器时由 `sw.js` 提供离线缓存。

> 本文按仓库当前代码、配置与命令实测重写。无法从代码或命令验证的内容不写入；旧版 README 中不可核实的表述已舍弃。

---

## 这是什么

- **两种对象、两套语义**：点设备表示"设备在哪里"，图标屏幕大小固定；区域/折线表示"实际占多大范围"，始终按世界坐标（米）绘制，缩放时与底图同比例。
- **双槽底图**：每个楼层可同时保存 1 张图片底图和 1 个矢量场地，两者独立替换、互不覆盖。
- **数据留在本机**：工程写入 IndexedDB（不可用时降级 localStorage），底图与照片按内容哈希存资产库；默认不向任何服务器上传数据，实时协作仅在手动建连时传输对象。
- **运行时零外部依赖**：不引用 npm、CDN 或后端；第三方能力以 `@idcu/*` 模块源码形式放在 `ngm.vendor/`，版本由 `ngm.lock` 与 `.ngm-version` 锁定。`node scripts/check.mjs` 会校验入口没有任何 `http(s)` 远程资源。
- **一个 HTML 入口，44 个脚本**：34 个项目脚本（`js/common` → `js/core` → `js/features` 三层）加 10 个 vendor 脚本，按 `index.html` 中的 classic `<script>` 顺序加载，共享全局作用域，不使用 ES Module。

---

## 快速开始

### 方式一：直接双击

双击 `index.html` 即可使用，不需要构建或安装依赖。

浏览器在 `file://` 下可能禁用 IndexedDB 与 Service Worker；PlotPin 会探测能力并显式降级（IndexedDB 不可用时回退 localStorage，Service Worker 不注册），不是静默失败。

### 方式二：本地静态服务器

需要完整持久化能力、PWA 安装或跑浏览器测试时，用仓库自带的零依赖服务器：

```powershell
node scripts/serve.mjs
# 默认 http://127.0.0.1:4173；可用 HOST / PORT 环境变量覆盖
```

任何静态文件服务器也可以，例如 `python -m http.server 8080`。

### 三步上手

1. **准备底图**：点顶部「底图/场地」，导入图片并用「比例尺」（两点定距）或「仿射校准」（≥3 点最小二乘）校准；也可以直接用矩形/圆形/椭圆/扇形/平行四边形/多边形绘制以米为单位的矢量场地。没有图片时，比例尺、仿射校准、图片变换入口会禁用并说明原因。
2. **添加对象**：左侧选择「点设备 / 区域 / 折线 / 文字 / 测距 / 标注」，在画布上单击或拖拽；区域工具可切换形状，点设备可从「符号库」页签选图元。
3. **导出成果**：顶部「导出」可选 JSON / PNG / SVG / PDF / DXF / CSV / TSV / XLSX 等格式；「打印/PDF」生成含对象清单的报告。

应用内按 `?` 打开帮助中心（快捷键、概念词典、导出检查清单）；完整操作说明见 [docs/user-guide.md](docs/user-guide.md)。

---

## 核心能力

本节只保留上手所需的能力概览；完整功能边界、阈值与实现口径以 [docs/features.md](docs/features.md) 为准，不复述。

### 底图、场地与校准

- 图片底图支持 PNG / JPG / WebP / BMP / GIF / SVG；降采样与透明图处理口径见 features.md。
- 两点定距求旋转 + 等比缩放，≥3 点求完整仿射（最小二乘），校准点可继续拖拽修改。
- 图片整体变换只提供平移、旋转、等比缩放、切变四类手柄，不提供四角自由拖拽。
- 矢量场地独立于对象列表，按米绘制，支持矩形、圆形、椭圆、扇形、平行四边形、多边形；场地标注可显示节点坐标、段长、半径、面积、周长。
- 场地存在时，图片校准只迁移图片与业务对象，场地坐标不自动迁移（"场地优先校准"）。

### 标注、测量与编辑

- 点设备：内置通用标记、摄像头、球机、路灯、道闸、充电桩、警示点等类型；图标大小按「全局倍率 × 类型默认 × 单对象覆盖」三级调整；可填物理尺寸（米）渲染圆形覆盖、方形区域、扇形视场、杆/线段。
- 区域与折线：参数化形状可互换（中心不动、等面积换算），节点可增删改与排序，折线可闭合；实时统计长度、周长、面积。
- 标注：两点距离、多点测距链、面积、三点角度、文字（世界字高、可旋转）。
- 编辑：点选 / 框选 / 多选、移动、缩放、旋转、节点编辑、图层显隐与锁定、自定义类型、网格吸附、撤销重做（20 条）、对齐与等间距分布、批量重排编号、置顶置底。
- 绘图辅助：七类对象捕捉（端点/中点/圆心/象限/垂足/交点/切点）、Tab 循环锁定捕捉类型、极轴追踪、平行/垂直/等距参考、Shift 正交与正方形/正圆约束、段长标注最小像素可调。

### 分析与规划

- **视场覆盖率**：按摄像头类型 `fov` 与点设备 `phys` 计算扇形/圆形/方形覆盖，栅格统计覆盖率与盲区面积；口径与视图缩放无关，隐藏对象不计入分母，盲区可导出 GeoJSON。
- **规则检查**：内建对象重叠、最小间距、越界三条几何规则；违规清单支持跨楼层定位与 CSV 导出。页面明确提示这是几何检查，不是消防/规范审图。
- **停车规划**：按场地范围排布双面垂直车位与通道，支持横/纵排列与实时预览，内置通道净宽和车位尺寸检查。
- **多楼层汇总**：统计页签按楼层汇总对象数/分类/总长/总面积；PDF/打印报告逐层输出图纸页与清单页。
- **布点优化**：基于覆盖率栅格枚举候选位置与朝向，给出新增覆盖面积与累计覆盖率。

### 导入导出

| 方向 | 格式 | 说明 |
|---|---|---|
| 工程 | JSON | 底图、照片、全部楼层内嵌，单文件可移植；导入为事务，失败保留原工程 |
| CAD | DXF | 导入/导出 ASCII DXF（R12–2018）；支持 LINE、多段线含凸度弧、圆、弧、椭圆、样条、INSERT、点、文字、MTEXT、图层 |
| DWG | 仅识别 | 读取 `AC10xx` 版本并给出「转 DXF / 转 PDF」指引，不内置 DWG 内核、不修改原文件 |
| PDF | 导入/导出 | 导入矢量 PDF 可提取路径与文字，扫描件取最大内嵌图作底图；多页按页树 `/Kids` 独立排布；导出为位图页 |
| 图纸 | PNG / SVG / 多页 PDF | SVG 为矢量；PDF 按楼层顺序生成图纸页 + 清单页，页码全局连续 |
| 台账 | CSV / TSV / XLSX | UTF-8 BOM，真 OOXML `.xlsx`；表头、PDF 清单与 SVG/DXF 读数共用 `js/features/io-fields.js` 字段表 |
| 其他 | 产品目录 JSON / BOM 报价 CSV·XLSX / 二维码标签 HTML / 盲区 GeoJSON | 目录存 IndexedDB，报价按厂商+型号跨楼层聚合 |

CSV/TSV/XLSX 导出对 `= + - @`、Tab/CR 开头且非纯数字的单元格加前导单引号；XLSX 一律写文本，不含公式节点。

### 存储、协作与可靠性

- 自动保存到 IndexedDB（库名 `offline_drawing_annotation`，v2，含 `projects` / `assets`），localStorage 兜底；支持多工程库、楼层、版本快照（每工程 20 条 / 16MB）。
- 工程 schema 为 `offline-drawing-annotation/v2`；读取 v1 旧档时自动补楼层 `updatedAt` 并回写。**旧版 App 只认 v1，遇到 v2 会拒绝加载/导入；本项目不做双写兜底。**
- 离线协作：导入他人 JSON 按对象 `updatedAt` 做 LWW 合并，删除用墓碑传播；楼层、图层、自定义类型按 id 取并集。
- 实时协作：同浏览器多标签用 `BroadcastChannel`，跨设备用 WebRTC DataChannel 手动三步信令，无服务器；只同步矢量对象、场地与楼层，底图与照片不走实时通道。
- 多标签租约：`BroadcastChannel` 5s 心跳、15s 租约，同工程另一标签页会在 6s 内提示；冲突期间暂缓自动保存但不丢内存编辑。
- 保存失败分级处理：配额耗尽直接提示导出 JSON/清理空间；瞬时错误按 1s/3s/9s 退避重试 3 次；状态栏只在真实成功时显示已保存。

### 符号库与插件

- **符号库**：内置 36 个 24×24 线性图元，分视频监控、门禁、消防、网络、停车、其他六类；支持名称/别名搜索、分类筛选、旋转角与真实尺寸放置。
- 自定义 SVG 图元经安全清洗（拒绝 `script`、`on*`、外部 `href`、DOCTYPE，限 64KB / 200 元素 / 16 层嵌套 / 200 条路径 / 单条 5000 字符）后存入当前工程命名空间，可 JSON 往返。
- 画布、SVG、PNG/PDF 共用同一 path 源；DXF 将符号降级为 `LWPOLYLINE` 折线近似并在导出报告标注。
- **插件 API**：全局 `PlotPin` 共 23 个承诺键（见 `contracts/plugin-api.json`），`PlotPin.apiVersion = "1.1.0"`，`PlotPin.version` 为应用版本。
- 隔离加载：`PlotPin.loadPlugin({id, apiVersion, capabilities, code})` 在独立 Worker 执行，无 DOM / `window` / `parent` / IndexedDB / 网络；能力白名单为 `state:read` / `state:write` / `annotate` / `types` / `icons` / `export` / `import` / `rules`，未声明即拒绝；初始化与单次调用 2s 超时即 terminate。
- 清单导入：设置 → 插件面板可导入 `plotpin.plugin/v1` 清单，仅本会话有效，刷新后需重新导入；清单与代码大小上限见 [docs/engineering.md](docs/engineering.md) 的插件章节。
- 旧同源 `<script>` 路径保留为受信任兼容入口，不做能力门。可运行示例见 [plugins/sample-sandboxed.js](plugins/sample-sandboxed.js) 与 [plugins/sample-exporter.js](plugins/sample-exporter.js)。

### 界面与性能

- 中英界面切换覆盖顶栏、工具栏、页签、属性面板、弹窗、清单、设置、工程库、覆盖率、帮助中心、报告与二维码标签；用户自定义类型名保持原名。
- 无障碍：画布 `role=application`、页签方向键与 Home/End、弹窗焦点陷阱与 Esc 还原、Toast `aria-live`、图标按钮可读标签。
- 渲染：分层离屏缓存 + 视口裁剪；拖拽时只重绘选中对象与交互层。
- 两套性能数据不混用：`node scripts/bench.mjs` 是 Node + canvas 桩的阻断门禁；`npm run perf:browser` 是真实 Chromium 的可选基线。

---

## 用法要点

### 校准

- 无图片底图时，比例尺/仿射/图片变换入口禁用并说明原因；只有矢量场地时提示"场地按米绘制，无需校准"。
- 校准点落点后可拖拽、`Delete` 删除、`Ctrl+Z` 撤销；按 `Enter` 或左侧 ✓ 才提交。
- 比例尺与仿射提交统一走 `applyWorldTransform`，对象与图片仿射一次迁移；已仿射校准的底图二次改比例尺不会再与对象错位。

### 导入

- 顶部「导入」接受 `.json`、`.csv`、`.tsv`、`.txt`、`.xlsx`、`.dxf`、`.dwg`、`.pdf`，也可直接把文件拖到画布。
- JSON、表格、DXF、PDF 导入前均校验限值并事务化提交；失败不覆盖当前工程。
- 表格导入支持「操作」列（新增/更新/替换）与条件列；存在「操作」列时严格整批事务，非法行整批拒绝。
- 表格中的长度/面积/节点数会按图形几何重算核对，不一致只告警并以图形为准。

### 导出

- 图框/标题栏/比例尺/图例模板默认关闭；关闭时 PNG/PDF/SVG 与旧版逐字节一致。开启后三格式共用同一布局源。
- 报价导出记录目录版本与导出时间，并写入 `quote:last` 快照；行集合不变时重导沿用冻结单价。
- 导出字段表是单一来源：CSV/TSV/XLSX 表头、PDF/打印清单、SVG/DXF 标注读数不再各自拼装。

### 保存与兼容

- 工程默认自动保存；手动可导出 JSON 或使用工程库副本。
- 工程库、草稿、快照、资产各自使用独立命名空间；资产回收按可达集并集计算，禁止跨工程误删。
- 从 v1 升级到 v2 后，旧版打开会拒绝；跨版本协作前请统一版本。

### 插件

推荐用隔离路径（`loadPlugin`）；需要完整页面权限时再用同源 `<script>` 兼容入口。版本协商、能力表、隔离边界与迁移规则见 [docs/engineering.md](docs/engineering.md) 的插件章节。

---

## 开发与验证

需要 Node 18+。运行与自测不需要 `npm install`；浏览器级测试才需要安装 Playwright。命令参数与阈值口径分别见 [docs/testing.md](docs/testing.md) 与 [docs/performance.md](docs/performance.md)。

### 直接运行脚本

```powershell
# 2706 assertions, no dependencies
node scripts/selftest.mjs
node scripts/selftest.mjs --list                 # 只列分区，不执行断言
node scripts/selftest.mjs --filter="几何"         # 只跑名称匹配的分区（正则，忽略大小写）

# 工程门禁：语法 / 入口资源 / 离线引用 / 断言数 / 契约 / 插件 API / 删除账本 / 分层
node scripts/check.mjs
node scripts/check.mjs --selftest                 # 追加执行 selftest 与 i18n 覆盖率门禁

# 单项判据
node scripts/check-contracts.mjs [--selftest]     # 版本三处一致 / i18n 键对齐 / 文件头 / 枚举
node scripts/check-plugin-api.mjs [--selftest]    # PlotPin.* ↔ contracts/plugin-api.json 双向比对
node scripts/check-gates.mjs                      # 在临时副本构造 5 种破坏，证明门禁会红
node scripts/check-discipline.mjs                 # 文档纪律
node scripts/check-deletions.mjs                  # 结构性删除账本
node scripts/i18n-scan.mjs                        # 中英文覆盖率统计；--check 不达标退 1

# 性能与构建
node scripts/bench.mjs                            # Node 桩渲染门禁（超阈值退 1）
node scripts/build.mjs                            # 生成 dist/plotpin-standalone.html + SHA256SUMS.txt
node scripts/build.mjs --check                    # 从源重建并比对哈希/字节数/体积上限/二次构建确定性
node scripts/badge.mjs                            # 按 selftest 实际断言数刷新 README；--check 只校验

# 浏览器级（可选，开发期依赖）
npm install -D @playwright/test
npx playwright install chromium
node scripts/e2e.mjs                              # 透传 playwright test 参数
node scripts/perf-browser.mjs [--no-gate]         # 真实 Chromium 性能基线；--no-gate 只采数
```

当前共 **2706 项断言全部通过**。缺 Playwright 或浏览器时，`e2e.mjs` / `perf-browser.mjs` 会打印 `[SKIP]` 原因并退出码 2，不会把"没跑"当成"通过"。

### npm 入口

| 命令 | 实际执行 |
|---|---|
| `npm test` | `check-ngm.mjs` → `selftest.mjs` |
| `npm run lint` | `check.mjs`（含 11 步静态与契约判据，不含 selftest） |
| `npm run ci` | `check.mjs --selftest` → `bench.mjs` → `build.mjs --check` → `check-gates.mjs` |
| `npm run gates` | `check-gates.mjs` |
| `npm run contracts` / `contracts:selftest` | `check-contracts.mjs` / `--selftest` |
| `npm run api` / `api:selftest` | `check-plugin-api.mjs` / `--selftest` |
| `npm run badge` | `badge.mjs` |
| `npm run bench` | `bench.mjs` |
| `npm run build` | `build.mjs` |
| `npm run discipline` | `check-discipline.mjs` |
| `npm run test:e2e` | `e2e.mjs` |
| `npm run perf:browser` | `perf-browser.mjs` |

### 发行包

`node scripts/build.mjs` 把所有 JS/CSS/图标内联为 `dist/plotpin-standalone.html`，同时写 `dist/SHA256SUMS.txt` 与 `scripts/dist-manifest.json`。

- 体积门禁：**820 KB（839,680 B）**
- 当前产物：**784,371 B（766.0 KB）**，gzip **243,809 B（238.1 KB）**
- `--check` 同时校验：无外链、CSP 不含 `'unsafe-inline'`、每个内联脚本有 sha256 白名单、产物哈希与登记值一致、连续两次构建字节一致。

---

## 目录结构

```
.
├── index.html                 # 主入口；按层序加载 44 个 classic <script>
├── sw.js                      # 托管模式的 Service Worker（必须在根目录才能接管全站）
├── manifest.webmanifest       # PWA 清单
├── icon.svg
├── css/style.css
├── js/
│   ├── common/                # 第 0 层：i18n、合并、符号库、DXF/PDF/QR/资产适配
│   ├── core/                  # 第 1 层：常量、模型、几何（含 site/coverage）、持久化、快照、渲染、交互
│   ├── features/              # 第 2 层：属性、侧栏、外壳、导入导出、表格、停车、协作、插件、规则
│   └── core/app.js            # 第 3 层：启动入口（必须最后加载）
├── ngm.vendor/                # 随仓库分发的 @idcu/* 第三方模块源码（不是 npm 依赖）
├── contracts/
│   ├── conventions.json       # 版本 / i18n 键 / 文件头 / 枚举同源
│   ├── plugin-api.json        # PlotPin 对外 23 个承诺键
│   └── adapters.json          # vendor 适配层登记
├── plugins/                   # 可运行插件示例（隔离沙箱 / 旧同源路径）
├── scripts/                   # 自测、门禁、构建、性能、扫描等开发脚本
├── tests/
│   ├── e2e/                   # Playwright 用例
│   ├── fixtures/              # 旧版符号等测试输入
│   ├── golden/                # SVG/DXF/PDF 逐字节基线
│   └── perf/                  # 真实浏览器性能用例
├── docs/                      # 架构、用户手册、特性、门禁、测试、性能、已知问题
├── dist/                      # 构建产物（build.mjs 生成）
├── ngm.json / ngm.lock / .ngm-version / ngm.mappings.json
├── package.json               # 仅命令入口；运行时无依赖，Playwright 为可选开发依赖
└── LICENSE
```

---

## 已知限制

以下为代码与文档中明确记录的边界（来源：`docs/known-issues.md` K 类）。

| # | 限制 |
|---|---|
| K1 | Service Worker 缓存版本号无自动门禁，靠发布纪律与测试守下限 |
| K2 | 不引入通用 `measureText` LRU、通用 Path2D 缓存、图层/对象索引；仅符号路径按类型做窄缓存 |
| K3 | PDF 导出为位图页，回读不能还原矢量坐标 |
| K4 | 不支持 `.dwg`；DXF 二进制需另存 ASCII；R12 凸度可能丢失 |
| K5 | 内置二维码编码器上限 42 字节；WebRTC 邀请串通常超出，只提示字节数、不渲染不可扫的二维码 |
| K6 | 覆盖率报告 v1/v2 数值不可比；圆/椭圆/扇形按 72 段采样，栅格法估算 |
| K7 | 规则检查是几何检查，不判断消防间距/疏散/结构/日照，不内置规范数值，不检查楼层间垂直关系 |
| K8 | 符号 DXF 只做折线近似不还原填充；SVG 导入只识别 6 类元素；搜索无拼音/分词；`symbolPlace` 不持久化；新工程默认类型集 64→36 |
| K9 | 插件 Worker 是隔离边界而非完整语言级沙箱，无 CPU/内存配额，只靠 2s 超时 terminate |
| K10 | 协作仅 LWW 合并、无服务端、无冲突解决 UI；跨设备可靠同步不在承诺范围 |
| K12 | 硬上限：导入文件 32MB、对象 10 万、撤销 20 条、墓碑 2 万、快照 20 条/16MB、底图解码 40MP；超限明确报错或淘汰 |

K11 已随文档拆分关闭，不再列为限制。

跨版本兼容是另一条硬边界：当前 schema 为 v2，旧版 App 只认 v1，遇到 v2 工程会拒绝加载/导入；本项目不做双写兜底。

以下项目在当前仓库中**未验证**，不应视为已承诺能力：

- 真机移动端（iOS/Android）PWA 安装、离线与手势（仅同机 Chromium 390×844/DPR3 模拟）。
- Firefox / Safari 下的 SVG 导入、下载、Worker 沙箱、PDF 打印（自动化仅覆盖 Chromium）。
- 真实双设备 WebRTC 协作（现有 e2e 为同机双标签）。
- 英文译文语义质量（判据只证明键存在、非空、整句模板可用）。
- 真实 GPU / 低端设备的渲染绝对性能。
- 低端设备上的插件 2s 超时体验。
- 大尺寸符号在 AutoCAD / LibreCAD 等查看器中的观感。
- 50 条真实图纸快照的差异分类误报/漏报率。

---

## 文档

| 想知道 | 去哪 |
|---|---|
| 怎么用：底图、校准、导入导出、协作、插件、故障处理 | [docs/user-guide.md](docs/user-guide.md) |
| 代码怎么分层、唯一源在哪 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| 完整特性清单与实现边界 | [docs/features.md](docs/features.md) |
| 模块依赖与公共抽象 | [docs/modules.md](docs/modules.md) |
| 门禁、契约、构建与插件隔离的权威说明 | [docs/engineering.md](docs/engineering.md) |
| 浏览器级 e2e 体系 | [docs/testing.md](docs/testing.md) |
| 真实浏览器性能基线与口径 | [docs/performance.md](docs/performance.md) |
| 已知问题与结构性删除记录 | [docs/known-issues.md](docs/known-issues.md) · [docs/deletions.md](docs/deletions.md) |
| 发布前人工验收矩阵与报告 | [docs/manual-acceptance.md](docs/manual-acceptance.md) · [docs/manual-acceptance-report-2026-11-07.md](docs/manual-acceptance-report-2026-11-07.md) |
| 开发计划索引 | [docs/plans/README.md](docs/plans/README.md) |

---

## 许可证

[MIT](LICENSE)
