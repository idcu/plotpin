# 📌 图钉 PlotPin

**离线、零依赖、双击即用的通用图纸标注工具**

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](#)
[![offline](https://img.shields.io/badge/offline-100%25-orange.svg)](#)
[![test](https://img.shields.io/badge/selftest-1627%20assertions-brightgreen.svg)](scripts/selftest.mjs)
[![PWA](https://img.shields.io/badge/PWA-installable-7c3aed.svg)](manifest.webmanifest)

在同一层可叠加「图片底图 + 矢量场地」双槽（每层最多 1 图 + 1 场地），在底图上标注设备点位、按真实比例绘制区域与折线、完成尺寸测量与统计，并可离线导出图纸与台账表格。无需安装、无需服务器、无需联网——一个 HTML 入口，双击打开即可工作，数据完全留在本机。

> ⚠️ **跨版本兼容限制**：旧版 App 不认识新增的 `site` 场地槽，打开新工程会忽略场地，回写保存后场地丢失（本项目不做双写兜底）。跨版本协作前请统一升级。

> 🌐 **在线试用（GitHub Pages）**：<https://idcu.github.io/plotpin/>
> 在线版与本地版完全一致，数据仅保存在你自己浏览器的 IndexedDB/localStorage 中，不会上传到任何服务器。

---

## ✨ 能做什么

| 维度 | 一句话 |
| --- | --- |
| **画** | 图片底图（两点定距或仿射校准，另有平移/旋转/等比缩放/切变整体手柄）与矢量场地（矩形 / 圆 / 椭圆 / 扇形 / 平行四边形 / 多边形）**同层共存**，每层最多 1 图 + 1 场地，单位为米，与底图同比例 |
| **标** | 点设备图标（屏幕固定大小、三层倍率、可选物理尺寸覆盖）、区域与折线、测距 / 距离 / 面积 / 角度 / 文字、64 个行业图元与自定义 SVG |
| **算** | 长度、周长、面积、视场覆盖率与盲区、停车位排布与通道净宽检查、多楼层汇总 |
| **改** | 点选 / 框选 / 多选、移动缩放旋转、节点编辑、对齐分布、批量编号与层级、图层与类型、网格吸附、撤销重做 |
| **互通** | JSON 工程、DXF 导入导出、PDF 底图、CSV/XLSX 台账、PNG/SVG/多页 PDF、二维码标签、单文件发行包 |
| **协同** | 多工程库、离线 LWW 合并（删除墓碑可复活）、本机 BroadcastChannel 与跨设备 WebRTC（均无服务器） |
| **可靠** | 零依赖离线运行、分层离屏渲染 + 视口裁剪、解析器输入上限、能力探测与显式降级、中英界面与无障碍 |

> **35 条完整特性**（每条写清了边界与实现口径）见 [docs/features.md](docs/features.md)。
> README 只回答"这是什么、能不能用"；能不能**依赖**它，去那里逐条对。

## 🚀 快速开始

直接双击 `index.html`，或用任意静态服务器打开：

```powershell
# PowerShell，任选其一
python -m http.server 8080
npx serve .
```

无需构建、无需安装依赖。推荐使用最新版 Chrome / Edge / Firefox。

### 三步上手

1. **准备底图**：点顶部「底图/场地」上传图片（再用「比例尺」校准），和/或直接拖画矢量场地；图片与场地可同时存在，替换其中一个不会删除另一个。
2. **添加对象**：左侧选择「点设备 / 区域 / 折线 / 文字 / 标注」，在画布上单击或拖拽；区域工具顶部可切换矩形 / 圆形 / 椭圆 / 扇形 / 平行四边形。
3. **导出成果**：选择 PNG / SVG / JSON / CSV / XLSX 后点「导出」，或「打印/PDF」生成报告。

---

## ⌨️ 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl + Z` / `Ctrl + Y` | 撤销 / 重做 |
| `Delete` / `Backspace` | 删除选中对象 |
| `Ctrl + D` | 原地复制 |
| `Ctrl + C` / `Ctrl + V` | 复制 / 粘贴（偏移 1m） |
| `Esc` / 右键（绘制中） | 取消测距等逐点录入 / 清除选择（无草稿时右键平移） |
| `双击` / `Enter` | 完成测距、折线 / 面积标注录入（双击处不产生重复节点） |
| `Backspace`（绘制中） | 删除上一个录入节点 |
| `Shift`（画线/标注） | 约束水平/垂直（正交） |
| `Shift`（拖矩形/椭圆/扇形） | 正方形 / 正圆 / 45° 方位吸附 |
| `Tab` / `Shift+Tab` | 循环切换捕捉类型（反向）；点击底部捕捉徽标恢复自动 |
| `空格 + 拖拽` / 右键拖拽 | 平移画布 |
| `滚轮` | 以光标为中心缩放 |
| `方向键`（`Shift` ×10） | 微移选中对象 |
| `F` | 适应窗口（显示整张场地） |
| `?` | 快捷键帮助 |

---

## 🧭 设计原则

| | 点设备 | 区域 / 折线 |
| --- | --- | --- |
| 表达 | **设备在哪里**（位置标记） | **实际占了多大范围**（真实几何） |
| 坐标 | 一个锚点 | 世界坐标形状，单位米 |
| 缩放画布 | 图标屏幕大小不变，永远清晰可点 | 跟随底图缩放，保持真实比例 |
| 大小含义 | 显示倍率（为了醒目，无物理意义） | 实际尺寸（米，参与长度 / 面积统计） |

基点即渲染、命中、拖拽移动共用的唯一锚点 `(x, y)`：矩形为第一角点（旋转中心），圆 / 椭圆 / 扇形为圆心。

---

## 📁 目录结构

```
.
├── index.html                # 主入口（双击即用，内联加载下述脚本）
├── sw.js                     # 托管模式 Service Worker（必须在根目录才能接管全站离线缓存）
├── css/
│   └── style.css
├── js/
│   ├── core/                 # 内核：常量 / 模型 / 几何 / 渲染 / 交互 / 持久化 / 视口 / 启动
│   ├── features/             # 功能域：属性面板、清单、UI 外壳、插件注册点、导入导出、停车、协作
│   │   ├── props.js          # 属性面板、场地属性、标注开关、节点编辑、批量属性
│   │   ├── ui-panels.js      # 侧栏页签、清单、图层/类型、统计、覆盖率、统一刷新
│   │   ├── io*.js            # 新建/工程库/楼层、文件导入、表格导入、导出与打印报告
│   │   ├── parking.js        # 停车规划：双面车位/通道自动排布与净宽检查
│   │   ├── collab.js         # 实时协作：本机 BroadcastChannel + 跨设备 WebRTC 手动信令
│   │   ├── ui-shell.js       # UI 外壳组装
│   │   └── plugins.js        # 插件注册点（对外 API 面见 contracts/plugin-api.json）
│   └── common/               # 项目专有库：i18n、LWW 合并、符号库；XML/ZIP/XLSX/DSV/DXF/PDF/PDF-image/QR/资产/几何走 ngm.vendor
├── contracts/
│   ├── conventions.json      # 机器可读契约：版本号 / i18n 键 / 文件头 / 枚举同源
│   └── plugin-api.json       # PlotPin 对外承诺的 13 个键（双向比对）
├── scripts/                  # check（门禁总闸）/ check-contracts（契约判据）/ selftest / badge / bench / build
├── package.json              # 仅提供 npm 入口，无任何依赖
└── docs/
    ├── engineering.md        # 门禁与契约的权威说明（含"故意不设门禁"的清单）
    ├── features.md           # 35 条完整特性（含边界与实现口径）
    ├── modules.md            # 模块分层：谁可以依赖谁（由 check.mjs 第 9 步守着）
    └── deletions.md          # 结构性删除 / 出库的账本（判据校验：字段齐全、无假删除）
```

---

## 🧪 自测

无需安装任何依赖，Node 18+：

```powershell
node scripts/selftest.mjs
# 或
npm test
```

门禁与依赖自检（语法 / 入口资源 / 离线承诺 / 断言数 / 契约 / 分层 / 自测）走另一条：

```powershell
npm run ci        # check --selftest → bench → build --check，与 CI 同一条命令
npm run gates     # 门禁牙齿：5 种人为破坏必须让对应门禁非 0（临时副本内构造）
```

**契约判据**（`contracts/conventions.json`）守四件看不见的事：版本号三处一致、
中英文案键对齐、每个脚本恰好一行文件头、枚举同源。判据自己也有牙齿：
`npm run contracts:selftest` 会用一棵必然违约的临时树证明它真的会红。

**插件 API 面**（`contracts/plugin-api.json`）是另一条：`PlotPin.*` 的每个键都必须在清单里登记，
清单里的每个键也必须真的存在——`npm run api` 双向比对，`npm run api:selftest` 验证解析器。
「代码有、清单没有」是 API 泄漏：插件一旦依赖，你改名就是静默破坏兼容。
刻意**不设**门禁的项（Service Worker 缓存换代、译文质量、真实浏览器渲染基线）逐一写在
[docs/engineering.md](docs/engineering.md) 里——不设不是忘了，是明说不保证。

覆盖几何计算、统一参数形状（矩 / 圆 / 椭圆 / 扇形 / 平行四边形）、形状互换换算、点设备图标倍率与物理尺寸命中、
CRC32/ZIP 往返、XLSX 双向往返、CSV/TSV 解析、表格导入规划、矢量场地规整、旧工程迁移清洗、
底图资产哈希与全库命名空间可达性回收（草稿/撤销重做/剪贴板/拖拽原件/全部工程库记录，禁止跨工程误删）、节点增删改与排序、绘图辅助开关迁移、Shift 正交/极轴/正方形约束、七类对象捕捉（端点/中点/圆心/象限/垂足/交点/切点）与优先级及 Tab 类型锁定（含包围盒粗筛性能）、校准围绕世界原点同比缩放、框选包围盒相交、区域/扇形周长公式、测距链模型与迁移清洗、表格导入导出往返（节点坐标/闭合/形状/标注类型新列、基点平移、CSV 引号与 XLSX OOXML 双向往返、长度/面积/节点数几何核对与取整容差）、SVG 与画布语义一致（扇形弧/闭合边/面积角度文字/设备图标）、DXF 生成解析往返（七类实体/单位换算/图层颜色/凸度弧/椭圆/样条/INSERT 块/MTEXT）、PDF 读取（内容流算子/文本/Flate 与 JPEG 内嵌栅格重组）、多页 PDF 结构、**视场覆盖率分析（扇形/圆形覆盖判定、区域栅格覆盖率与盲区面积）**、**底图仿射校准（像素↔世界映射、2 点相似与 ≥3 点最小二乘完整仿射、四角包围框、旧对象随映射迁移）**、**离线协作 LWW 合并（对象/楼层增删改、删除墓碑与复活、图层类型并集、幂等与确定性）**、**全量中英文案（动态短语/正则模板/内置类型名/载入工程兼容）**、**弹窗焦点管理、页签方向键与画布键盘策略**、**SVG 视觉快照与真实 DOM 焦点桩**、**停车规划布局（车位数/通道数/旋转排列/边界与净宽检查）**、**实时协作传输辅助（48KB 分块、SDP 清洗、本地提交防抖）**、**多楼层汇总（逐层分类/面积/长度与合计）**、**资源上限与底图降采样策略（长边限制/透明保留/HTML 转义）**、**对象对齐与分布（包围盒边界/中线/等间距）**、**批量编号与层级（跨层避让/置顶置底）**、**多楼层台账导出与按楼层导入路由**、静态资源引用完整性等纯逻辑模块，当前共 **1627 项断言全部通过**。

---

## 🗺️ 路线图（方向草案）

- ✅ 多楼层多底图、设备台账二维码、照片附件（已交付）。
- ✅ 顶栏「清空」：一键清空当前楼层双槽/对象/标注/校准/选中态并恢复默认取景框，二次确认且可 `Ctrl+Z` 整体撤销（已交付）。
- ✅ PWA/Service Worker 离线缓存、64 个行业符号库与自定义 SVG 图元（已交付）。
- ✅ 单文件发行包、插件注册点（导出器 / 导入器 / 自定义设备类型）、中英界面与无障碍补强（已交付）。
- ✅ 停车场规划模式：双面垂直车位 + 通道净距检查、横/纵排列、实时预览与独立图层（已交付）。
- ✅ 离线协作（CRDT 家族 LWW）：对象/楼层级 Last-Writer-Wins + 删除墓碑 + 工程 JSON 合并（已交付，工程库「合并他人工程」）。
- ✅ 实时协作：本机 BroadcastChannel 多标签 + 跨设备 WebRTC 手动信令（无服务器、零依赖，已交付）。
- ✅ 多楼层汇总：统计页签按层统计对象数/分类/总长/总面积并支持点击切换，打印报告附楼层汇总表（已交付）。
- ✅ 多楼层导出：打印报告与 PDF 逐层输出图纸页与对象清单，导出后恢复原楼层/视口/选择（已交付）。
- ✅ 多楼层台账：CSV/XLSX 覆盖全部楼层并带楼层列，导入按楼层列路由并防跨层重号（已交付）。
- ✅ 资源上限收口：缩放/图标/段长阈值集中为 `APP_LIMITS`、段长标注阈值可在设置调整、底图解码尺寸硬上限（已交付）。
- ✅ 对象对齐与分布：多选按包围盒六向对齐，水平/垂直等间距分布且首末不动（已交付）。
- ✅ 批量编号与层级：前缀/起始/步长重排编号（跨楼层避让），置顶/置底调整叠放顺序（已交付）。

> 触屏已支持：Pointer Events 单指绘制/移动，**双指捏合缩放、双指平移**（缩放锚定双指中点），≤860px 窄屏侧栏自动变覆盖层（☰ 面板开关）。

---

## 📄 许可证

[MIT](LICENSE)

---
---

# PlotPin — Offline Drawing Annotation Tool

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](#)
[![offline](https://img.shields.io/badge/offline-100%25-orange.svg)](#)

**A general-purpose drawing annotation tool that runs fully offline, with zero dependencies — just double-click and use.**

Place device markers on any base map (image or vector site), draw true-to-scale areas and polylines, take measurements, and export drawings and asset spreadsheets — all locally in the browser. No install, no server, no network, no runtime dependency.

### Features

- **Offline & zero-dependency**: no npm, no CDN, no backend; works from `file://` on intranets, air-gapped and field environments.
- **Base maps**: image files with two-point scale calibration (meters/pixel), or vector sites in meters — rectangle, circle, ellipse, sector and polygon.
- **Point devices (position semantics)**: screen-fixed icons that stay crisp at any zoom; icon size is adjustable on three levels (global × type default × per-object). Optional physical-size overlays render at real scale (coverage circle, square, camera FOV sector, barrier-gate bar).
- **Areas & polylines (geometry semantics)**: always in world coordinates (meters), true-to-scale. Areas support rectangle / circle / ellipse / sector with parameter handles and on-the-fly shape conversion (center-preserving, equal-area); triangles and arbitrary polygons come from closed polylines.
- **Dimensions & text**: distance, area and angle annotations; scalable/rotatable world-size text.
- **Editing**: single/rubber/multi select, move, resize, rotate, node editing, layers, custom types, grid snapping, undo/redo.
- **Persistence**: auto-save to IndexedDB with content-addressed map assets, localStorage fallback with explicit capability detection; network-first Service Worker with offline cache for hosted deployments.
- **Engineering**: layered offscreen rendering cache + viewport culling, parser input limits for ZIP/XLSX/DXF/PDF, zero-dependency CI gate and render benchmark.
- **Distribution**: `npm run build` produces a fully inlined single-file HTML with SHA256 checksum; plugin registration API for custom object types, importers and exporters.
- **Internationalization & a11y**: Chinese/English switch covering chrome, property panels, dialogs, notifications, built-in type names, reports and QR labels (custom type names preserved); ARIA roles/states, modal focus trap, live region for toasts and visible keyboard focus rings.
- **Import / export**: JSON project (embedded map), hi-res PNG, vector SVG, CSV/TSV and real `.xlsx` (hand-written minimal OOXML + ZIP), print-to-PDF report; drag-and-drop import supported.

### Quick start

Double-click `index.html` — or serve the folder with any static file server. Modern Chrome/Edge/Firefox recommended.

### Build (single-file distribution)

```bash
npm run build
# dist/plotpin-standalone.html  +  dist/SHA256SUMS.txt
```

### Plugins

```html
<script src="js/core/plugins.js"></script>
<script>
/* 自定义设备类型：进入类型下拉，新建/载入工程都会带上；被对象使用时注销会被拒绝 */
PlotPin.registerObjectType({
  id: 'plugin.ptz', kind: 'point', name: '全景相机', color: '#0ea5e9', icon: 'custom',
  scaleShape: 'sector', fov: 360,
  symbol: [{ d: 'M0 0h24v24H0z' }], symbolViewBox: { x: 0, y: 0, w: 24, h: 24 }
});

PlotPin.registerExporter({
  id: 'my.csv', label: '我的导出', ext: 'csv',
  run(ctx) { ctx.download(new Blob(['a,b']), 'out.csv'); }   /* ctx.state 为可持久化快照 */
});

PlotPin.registerImporter({
  ext: 'mydata',
  run(ctx) { /* ctx.file / ctx.state（实时） / ctx.commitChange */ }
});

/* 诊断：PlotPin.state、PlotPin.listPluginTypes() */
</script>
```

### Test

```bash
node scripts/selftest.mjs   # 1627 assertions, no dependencies
node scripts/check.mjs      # 语法 / 入口完整性 / 离线引用 / 断言数门禁（CI 用 --selftest）
node scripts/bench.mjs      # 渲染基准（avg/P95/重建/heapUsed 超阈值则退出码 1）
node scripts/build.mjs --check   # 单文件发行包：源重建 ↔ dist-manifest 哈希比对 + 无外链 + 体积上限
node scripts/check-gates.mjs     # 门禁牙齿：5 种人为破坏必须非 0
```

### License

[MIT](LICENSE)
