# 📌 图钉 PlotPin

**离线、零依赖、双击即用的通用图纸标注工具**

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](#)
[![offline](https://img.shields.io/badge/offline-100%25-orange.svg)](#)
[![test](https://img.shields.io/badge/selftest-314%20assertions-brightgreen.svg)](scripts/selftest.mjs)
[![PWA](https://img.shields.io/badge/PWA-installable-7c3aed.svg)](manifest.webmanifest)

在任意底图（图片 / 矢量场地）上标注设备点位、按真实比例绘制区域与折线、完成尺寸测量与统计，并可离线导出图纸与台账表格。无需安装、无需服务器、无需联网——一个 HTML 入口，双击打开即可工作，数据完全留在本机。

> 🌐 **在线试用（GitHub Pages）**：<https://idcu.github.io/plotpin/>
> 在线版与本地版完全一致，数据仅保存在你自己浏览器的 IndexedDB/localStorage 中，不会上传到任何服务器。

---

## ✨ 特性一览

- **零依赖离线运行**：无 npm、无 CDN、无后端，`index.html` 双击即用；可在内网、涉密、现场无网络环境使用。
- **两类底图**
  - 图片底图（PNG/JPG/WebP/BMP/GIF/SVG）：两点定距完成**米/像素比例尺校准**。
  - 矢量场地：直接以米为世界坐标绘制**矩形 / 圆形 / 椭圆 / 扇形 / 多边形**场地，无需校准。
- **点设备（位置语义）**：内置通用标记、摄像头、球机、路灯、道闸、充电桩、警示点等图标；图标为**屏幕固定大小**，缩放画布时始终清晰可点。
  - 图标大小三层可调：**全局倍率 × 类型默认大小 × 单个对象覆盖**，底图再大也能让点位醒目。
  - 高级选项：设置物理尺寸（米）后可按真实比例渲染覆盖范围（圆形覆盖、方形区域、摄像头扇形视场、道闸杆）。
- **区域 / 折线（几何语义）**：统一按世界坐标（米）绘制，缩放时与底图保持真实比例。
  - 区域支持**矩形、圆形、椭圆、扇形（饼形）**参数化形状，属性面板可随时**互换形状**（中心不动、等面积换算）；三角形与任意多边形由闭合折线完成。
  - 每种形状带专用控制点（角点 / 半径端 / 两轴端 / 扇形两边端与弧中点），并可直接设置**基点 / 圆心**坐标。
  - 线段 / 折线逐点录入，可闭合；实时长度、周长、面积统计；节点支持面板精确改坐标、插入、删除、↑↓/拖拽排序，画布双击线段即可插点。
- **标注与文字**：两点距离、折线 / 多边形面积、三点角度标注；文字按世界字高放置、可旋转。
- **编辑能力**：点选 / 框选 / 多选、移动、缩放、旋转、节点编辑、复制粘贴、图层显隐锁定、类型管理、网格吸附、撤销重做。
- **精确绘图辅助（均可开关）**：鼠标**十字准星 + 吸附后世界坐标**实时跟随；折线绘制中/选中后显示**每段长度与累计总长**；区域拖画实时显示宽×高/半径；按住 **Shift** 画水平/垂直线（正交）、拖正方形/正圆、扇形 45° 方位吸附；`F` 一键适应窗口。
- **几何检查**：零尺寸、折线自相交、对象越界、物理尺寸异常等自动提示。
- **本地自动保存**：工程存于 IndexedDB（底图按内容哈希去重），localStorage 兜底；刷新不丢。
- **导入导出**
  - 工程：JSON 导入导出（底图内嵌，单文件可移植）。
  - 图纸：高清 PNG、矢量 SVG。
  - 台账：CSV / TSV（UTF-8 BOM，Excel 直接打开）与**真 .xlsx**（自研最小 OOXML + ZIP，零依赖）；表格可再导入更新对象。
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
2. **添加对象**：左侧选择「点设备 / 区域 / 折线 / 文字 / 标注」，在画布上单击或拖拽；区域工具顶部可切换矩形 / 圆形 / 椭圆 / 扇形。
3. **导出成果**：选择 PNG / SVG / JSON / CSV / XLSX 后点「导出」，或「打印/PDF」生成报告。

---

## ⌨️ 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl + Z` / `Ctrl + Y` | 撤销 / 重做 |
| `Delete` / `Backspace` | 删除选中对象 |
| `Ctrl + D` | 原地复制 |
| `Ctrl + C` / `Ctrl + V` | 复制 / 粘贴（偏移 1m） |
| `Esc` | 取消绘制 / 清除选择 |
| `Enter` | 完成折线 / 面积标注录入 |
| `Backspace`（绘制中） | 删除上一个录入节点 |
| `Shift`（画线/标注） | 约束水平/垂直（正交） |
| `Shift`（拖矩形/椭圆/扇形） | 正方形 / 正圆 / 45° 方位吸附 |
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

覆盖几何计算、统一参数形状（矩 / 圆 / 椭圆 / 扇形）、形状互换换算、点设备图标倍率与物理尺寸命中、
CRC32/ZIP 往返、XLSX 双向往返、CSV/TSV 解析、表格导入规划、矢量场地规整、旧工程迁移清洗、
底图资产哈希、节点增删改与排序、绘图辅助开关迁移、Shift 正交/极轴/正方形约束、静态资源引用完整性等纯逻辑模块，当前共 **314 项断言全部通过**。

---

## 🗺️ 路线图（方向草案）

- 摄像头**视场覆盖率 / 盲区分析**（复用现有扇形视场模型）。
- DXF 导入导出（自研最小子集，继续零依赖）、旋转 / 多点仿射校准。
- 多楼层多底图、设备台账二维码、照片附件。
- PWA 与平板触摸、行业符号库（安防 / 弱电 / 消防 / 仓储）。
- 停车场规划模式（自动排布、通道净距）作为独立模式回归。

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
node scripts/selftest.mjs   # 242 assertions, no dependencies
```

### License

[MIT](LICENSE)
