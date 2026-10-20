# 📌 图钉 PlotPin

**离线、零依赖、双击即用的通用图纸标注工具**

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](#)
[![offline](https://img.shields.io/badge/offline-100%25-orange.svg)](#)
[![test](https://img.shields.io/badge/selftest-942%20assertions-brightgreen.svg)](scripts/selftest.mjs)
[![PWA](https://img.shields.io/badge/PWA-installable-7c3aed.svg)](manifest.webmanifest)

在任意底图（图片 / 矢量场地）上标注设备点位、按真实比例绘制区域与折线、完成尺寸测量与统计，并可离线导出图纸与台账表格。无需安装、无需服务器、无需联网——一个 HTML 入口，双击打开即可工作，数据完全留在本机。

> 🌐 **在线试用（GitHub Pages）**：<https://idcu.github.io/plotpin/>
> 在线版与本地版完全一致，数据仅保存在你自己浏览器的 IndexedDB/localStorage 中，不会上传到任何服务器。

---

## ✨ 特性一览

- **零依赖离线运行**：无 npm、无 CDN、无后端，`index.html` 双击即用；可在内网、涉密、现场无网络环境使用。
- **两类底图**
  - 图片底图（PNG/JPG/WebP/BMP/GIF/SVG）：两点定距完成**米/像素比例尺校准**。
  - 矢量场地：直接以米为世界坐标绘制**矩形 / 圆形 / 椭圆 / 扇形 / 平行四边形 / 多边形**场地，无需校准。
  - 矢量场地可在图上叠加**场地标注**：边界节点世界坐标、相邻节点**段长**、基点/圆心坐标、半径、中心**面积**与**周长**；六项各自可在「工程设置」独立开关（固定字号不随缩放变化），矩形与多边形按真实边界逐点标注。
  - 场地绘制完成后可继续微调：左侧「**⊗ 场地节点**」工具在画布上显示各控制点，拖拽即改形状（多边形顶点 / 矩形与平行四边形四角 / 圆心与半径 / 椭圆两轴与旋转 / 扇形两边与张角 / 平行四边形倾角）；属性面板同步提供**坐标与参数精确输入**，多边形支持顶点增删与 ↑↓ 排序、画布双击边插点 / 双击顶点删点。
- **点设备（位置语义）**：内置通用标记、摄像头、球机、路灯、道闸、充电桩、警示点等图标；图标为**屏幕固定大小**，缩放画布时始终清晰可点。
  - 图标大小三层可调：**全局倍率 × 类型默认大小 × 单个对象覆盖**，底图再大也能让点位醒目。
  - 高级选项：设置物理尺寸（米）后可按真实比例渲染覆盖范围（圆形覆盖、方形区域、摄像头扇形视场、道闸杆）。
- **区域 / 折线（几何语义）**：统一按世界坐标（米）绘制，缩放时与底图保持真实比例。
  - 区域支持**矩形、圆形、椭圆、扇形（饼形）、平行四边形**参数化形状，属性面板可随时**互换形状**（中心不动、等面积换算）；三角形与任意多边形由闭合折线完成。平行四边形按「底边 × 高 + 倾角」定义，**错切不改变面积**，画布上提供专用的倾角手柄（横向拖拽面积恒定）；倾角限 ±80°。
  - 每种形状带专用控制点（角点 / 半径端 / 两轴端 / 扇形两边端与弧中点），并可直接设置**基点 / 圆心**坐标。
  - 线段 / 折线逐点录入，可闭合；实时长度、周长、面积统计；节点支持面板精确改坐标、插入、删除、↑↓/拖拽排序，画布双击线段即可插点。
  - **逐对象「图上标注」开关**：点设备（编号 / 点坐标）、区域（编号 / 基点坐标 / 半径 / 边长 / 顶点坐标 / 周长 / 面积）、折线（编号 / 节点或顶点坐标 / 段长 / 周长 / 面积）均可按对象单独勾选。**逐对象配置完全优先**——全局「显示标签 / 段长度标注 / 图上显示面积」只作为未单独配置对象的缺省值，改选其他对象或切换全局开关都不会覆盖已配置的结果；画布与 SVG 导出同步生效。
  - 区域与闭合折线可在图形中心**常驻显示面积/周长标签**（固定字号不随缩放变化，设置可关；闭合折线绘制过程中实时预览）。
- **标注与文字**：左侧工具栏独立的 **📏 测距**工具（百度地图式：逐点单击、**双击结束、右键/Esc 取消**，双击不产生重复节点；实时显示每段长度+累计总长，节点可编辑）；另有两点距离、折线 / 多边形面积、三点角度标注；文字按世界字高放置、可旋转。
- **编辑能力**：点选 / 框选 / 多选、移动、缩放、旋转、节点编辑、复制粘贴、图层显隐锁定、类型管理、网格吸附、撤销重做。
- **精确绘图辅助（均可开关）**：**对象捕捉（OSNAP）**——端点□、中点△、圆心◎、象限点◇、垂足⊥、跨对象交点×、圆切点，按类型优先级自动吸附（画线、放设备、拖节点/角点均生效，可在设置关闭）；**Tab / Shift+Tab 循环锁定单一捕捉类型**（自动→端点→中点→圆心→象限点→交点→垂足→切点，底部徽标实时显示，点击徽标恢复自动）；画线时沿 45° 极轴或与上一段平行方向显示**橙色追踪虚线**；鼠标**十字准星 + 吸附后世界坐标**实时跟随（无需点击，鼠标一移动即更新，坐标栏同步显示当前捕捉类型）；折线绘制中/选中后显示**每段长度与累计总长**；区域拖画实时显示宽×高/半径；按住 **Shift** 画水平/垂直线（正交）、拖正方形/正圆、扇形 45° 方位吸附；属性面板编辑节点坐标时画布同步高亮；`F` 一键适应窗口。
- **几何检查**：零尺寸、折线自相交、对象越界、物理尺寸异常等自动提示。
- **视场覆盖率分析**：一键统计摄像头（扇形视场）/球机与圆形、方形点设备的视场对**区域与闭合折线**的覆盖率；画布叠加显示**已覆盖（绿）/ 盲区（红）**栅格，弹窗给出逐区域与合计的覆盖面积、盲区面积与覆盖百分比（栅格法估算，零依赖）。
- **底图仿射校准**：图片底图上依次点击已知点并输入其实地坐标 X,Y——2 点求**旋转 + 等比缩放**相似变换，≥3 点求**最小二乘完整仿射**（纠正底图倾斜与不等比缩放）；求解后底图按新映射旋转/缩放（含轻切变）渲染，既有标注随映射迁移并保持贴合底图同一像素点，SVG/PDF 导出同步对齐。
- **本地自动保存**：工程存于 IndexedDB（底图按内容哈希去重），localStorage 兜底；刷新不丢。**多工程库**：顶栏「📁 工程库」可把当前图纸另存命名工程，随时打开/重命名/复制/删除，绑定后编辑自动同步到对应工程。
- **导入导出**
  - 工程：JSON 导入导出（底图内嵌，单文件可移植）。
  - **CAD 互通：DXF 导入/导出**（零依赖 R12 ASCII，自动毫米/厘米/英寸→米；LINE/多段线（含凸度弧）/圆/弧/椭圆/样条/INSERT 块/点/文字/MTEXT 与图层，AutoCAD/LibreCAD 可直接打开）。
  - **PDF 底图导入**（零依赖）：矢量 PDF 提取路径/矩形/贝塞尔曲线与标准字体文字转为可编辑对象；扫描件自动取最大内嵌图（JPEG 直通、Flate 原始像素重组 PNG）作底图。
  - 图纸：高清 PNG、矢量 SVG、**多页 PDF**（图纸页 + 完整对象清单分页，不截断）。
  - 台账：CSV / TSV（UTF-8 BOM，Excel 直接打开）与**真 .xlsx**（自研最小 OOXML + ZIP，零依赖）；表格可再导入更新对象。
  - 台账列覆盖完整几何：**基点 X/Y、形状（矩形/圆/椭圆/扇形及扇形起止角）、闭合标志、各节点坐标（`x,y;x,y;…`）、标注类型（测距/距离/面积/角度）**——折线、闭合区域、测距链均可由表格无损重建；仅改基点列时整条线按基点平移。
  - 导入逐行核对：**长度/面积/节点数按几何重算比对**（含坐标取整传播误差界，避免误报），手改不一致或负值在预览中告警、不阻断导入、一律以图形几何为准；旧版表头与缺列自动跳过核对。
  - 打印报告：浏览器打印另存 PDF。
  - 支持把 JSON / 表格 / 图片直接拖进画布导入。

---

## 🚀 快速开始

直接双击 `index.html`，或用任意静态服务器打开：

```powershell
# PowerShell，任选其一
python -m http.server 8080
npx serve .
```

无需构建、无需安装依赖。推荐使用最新版 Chrome / Edge / Firefox。

### 三步上手

1. **准备底图**：点顶部「底图/场地」上传图片（再用「比例尺」校准），或直接拖画矢量场地。
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
├── css/
│   └── style.css
├── js/
│   ├── app/                  # 应用逻辑：配置 / 模型 / 几何 / 渲染 / 交互 / 导入导出 / 持久化 / UI
│   └── common/               # 零依赖基础库：XML 解析、ZIP、OOXML(XLSX)、DSV、内容寻址资产库
├── scripts/
│   └── selftest.mjs          # 逻辑层零依赖自测
├── package.json              # 仅提供 npm test 入口，无任何依赖
└── docs（后续补充）
```

---

## 🧪 自测

无需安装任何依赖，Node 18+：

```powershell
node scripts/selftest.mjs
# 或
npm test
```

覆盖几何计算、统一参数形状（矩 / 圆 / 椭圆 / 扇形 / 平行四边形）、形状互换换算、点设备图标倍率与物理尺寸命中、
CRC32/ZIP 往返、XLSX 双向往返、CSV/TSV 解析、表格导入规划、矢量场地规整、旧工程迁移清洗、
底图资产哈希与撤销栈可达性回收、节点增删改与排序、绘图辅助开关迁移、Shift 正交/极轴/正方形约束、七类对象捕捉（端点/中点/圆心/象限/垂足/交点/切点）与优先级及 Tab 类型锁定（含包围盒粗筛性能）、校准围绕世界原点同比缩放、框选包围盒相交、区域/扇形周长公式、测距链模型与迁移清洗、表格导入导出往返（节点坐标/闭合/形状/标注类型新列、基点平移、CSV 引号与 XLSX OOXML 双向往返、长度/面积/节点数几何核对与取整容差）、SVG 与画布语义一致（扇形弧/闭合边/面积角度文字/设备图标）、DXF 生成解析往返（七类实体/单位换算/图层颜色/凸度弧/椭圆/样条/INSERT 块/MTEXT）、PDF 读取（内容流算子/文本/Flate 与 JPEG 内嵌栅格重组）、多页 PDF 结构、**视场覆盖率分析（扇形/圆形覆盖判定、区域栅格覆盖率与盲区面积）**、**底图仿射校准（像素↔世界映射、2 点相似与 ≥3 点最小二乘完整仿射、四角包围框、旧对象随映射迁移）**、静态资源引用完整性等纯逻辑模块，当前共 **942 项断言全部通过**。

---

## 🗺️ 路线图（方向草案）

- 多楼层多底图、设备台账二维码、照片附件。
- PWA 离线缓存与行业符号库（安防 / 弱电 / 消防 / 仓储）。
- 停车场规划模式（自动排布、通道净距）作为独立模式回归。

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
- **Persistence**: auto-save to IndexedDB with content-addressed map assets, localStorage fallback.
- **Import / export**: JSON project (embedded map), hi-res PNG, vector SVG, CSV/TSV and real `.xlsx` (hand-written minimal OOXML + ZIP), print-to-PDF report; drag-and-drop import supported.

### Quick start

Double-click `index.html` — or serve the folder with any static file server. Modern Chrome/Edge/Firefox recommended.

### Test

```bash
node scripts/selftest.mjs   # 942 assertions, no dependencies
```

### License

[MIT](LICENSE)
