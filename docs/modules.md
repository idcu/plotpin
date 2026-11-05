# 模块分层（MODULES）

> 这份文件回答「谁可以依赖谁」。判据：`scripts/check.mjs` 第 9 步 + `index.html` 的加载顺序。

## 为什么是分目录，不是可插拔模块

PlotPin 是**双击 `index.html` 即用**的离线单页工具：36 个 classic `<script>` 共享同一个全局词法作用域，
`const SCHEMA`、`state`、`I18N` 都是裸标识符，文件之间直接引用。改 `<script type="module">`
在 `file://` 下会被 CORS 拦掉，等于放弃核心产品承诺。

而且它没有「请求边界」：DOM 事件监听、canvas 离屏缓存、已注册的导出器，尤其是**工程文件里
已经写入的 `typeId`**，都和模块绑在一起。`plugins.js` 的 `typeInUse()` 会在对象仍在使用某个类型时
拒绝注销——连一个插件类型都停不掉。所以这里**不做运行时启停**（pivoise 那套 `module.json`
+ 拓扑排序 + 热启停属于服务端模型，不照抄）。

能搬、也已经搬的是：**把目录边界写清楚，并由判据守住**。

## 三层 + 一个入口

| 层 | 目录 | 允许依赖 | 职责 |
|---|---|---|---|
| 0 · 公共库 | `js/common/` | 仅 `ngm.vendor/` | i18n、LWW 合并、符号库、DXF/PDF/QR 适配；与具体业务无关 |
| 1 · 内核 | `js/core/` | 0 + vendor | 常量与内置类型、模型、几何、渲染、交互、持久化、视口、启动 |
| 2 · 功能域 | `js/features/` | 0 + 1 + vendor | 属性面板、侧栏清单、UI 外壳、插件注册点、文件/表格导入导出、停车规划、实时协作 |
| 3 · 入口 | `js/core/app.js` | 全部 | 能力探测、恢复工程、首屏适配、Service Worker 注册；**必须最后加载** |

`ngm.vendor/` 是随仓库分发的公共模块，按 `ngm.lock` 钉住，不属于本项目的任何一层。

> **分类是以加载顺序为准，不是按名字猜的**。第一版把 `ui-shell.js` 与 `plugins.js` 归进内核，
> 判据立刻报「层序倒退：第 1 层排在第 2 层之后」——它们实际依赖功能域。已按代码事实移到
> `js/features/`。这正是分层需要判据的理由：目录名可以随便起，顺序不会撒谎。

## 判据

`scripts/check.mjs` 第 9 步守三件事：

1. `js/` 下只允许 `common/`、`core/`、`features/` 三个子目录——再出现 `js/app/` 或新造一层就红；
2. `index.html` 的脚本加载顺序按上表**层号非递减**（`core/app.js` 视为 3）；
3. 每个脚本恰好属于一层，且文件存在。

## 双槽底图的公共抽象（避免重复实现）

图片栅格与矢量场地拆成两个槽位后，以下公共能力只在 `js/core/` 维护一份，`render.js` / `io-export.js` / `interaction.js` 不得各自复制：

| 能力 | 归属 | 调用方 |
|---|---|---|
| `createEmptyBackground / createSiteSlot / isImageBackground / siteShapeOf` | `js/core/model.js` | 全仓 |
| `siteDomainOf / siteBounds / siteOutlinePoints / imageWorldFrame` | `js/core/geometry.js` | 视口、渲染、导出、交互 |
| `siteBoundaryPoints / siteShapeCenter / siteBasePoint / siteRadiusText / siteAreaPerimeter` | `js/core/geometry.js`（场地几何唯一实现） | `render.js` 标注、`io-export.js` SVG、属性面板 |
| `siteHandlesOf / siteHandleList / siteHandleDragTo / resizeSiteByHandle` | `js/core/geometry.js`（手柄几何唯一实现；交互层只做命中与事件分发） | `render.js` 手柄绘制、`interaction.js` 拖拽 |
| `pickScreenHandle` | `js/core/geometry.js`（屏幕阈值唯一实现） | `render.js` 对象手柄命中、`interaction.js` 场地手柄命中（半径 9px 同源） |
| `siteLayerOf / siteIsVisible / siteIsLocked` | `js/core/model.js`（场地与业务对象共用图层可见/锁定语义） | 视口取景、渲染、交互守卫、属性面板 |
| `renderNodeEditor(o, opts) / bindNodeEditorEvents(box, spec) / layerOptionsHTML(id)` | `js/features/props.js` | 折线/闭合区域节点编辑与场地多边形顶点编辑共用同一套 DOM 与事件契约 |
| `calibPoints / calibSelection / calibUndoStack` 及 `calibHitAt / calibPushUndo / calibUndo` | `js/core/model.js`（状态） / `js/core/interaction.js`（控制点编辑） | 比例尺与仿射校准：拖拽/增删/撤销只改临时控制点，`Enter`/✓ 提交时才 `solveImageAffine + migrateObjectsByAffine` |
| `applyVectorSite / siteDxfEntities` | `js/features/io-import.js` / `js/features/io-export.js` | 仅功能域内部 |

影响范围：`siteHandleList/siteAreaPerimeter/siteBoundaryPoints/siteShapeCenter` 保留旧签名（可直接传旧 `kind` 矢量 background 对象），`scripts/selftest.mjs` 的既有断言不需要改写调用方式；`resizeSiteByHandle(h,p)` 是写 `state.site` 的薄包装，新代码应优先用 `siteHandleDragTo(site,h,p)`，它不读全局、便于单测。删除重复后 `render.js` 不再声明 `siteBoundaryPoints/siteShapeCenter/siteAreaPerimeter/siteBasePoint/siteRadiusText`，`interaction.js` 不再声明 `siteHandleList/resizeSiteByHandle`——同名函数只保留 `geometry.js` 一份，避免两份实现漂移。

Phase 2B 影响范围：`renderNodeEditor(o, opts)` 新增可选第二参数，省略时行为与旧实现一致（对象节点行 DOM 不变）；场地多边形改用它生成 `data-node-*` 行，`props.js` 内不再有 `data-site-node-*` 这一套。`bindNodeEditorEvents(box, spec)` 统一接管节点坐标输入与增删/排序按钮，业务对象与场地只提供各自的提交回调。`pickScreenHandle` 统一对象/场地手柄的屏幕命中阈值（9px），`handleAt` 与 `siteHandleAt` 不再各写一份循环。`siteIsVisible/siteIsLocked` 现在叠加所属图层的可见/锁定状态，**会影响所有依赖这两个判定的调用点**（取景框、渲染、手柄守卫、拖拽守卫）：图层隐藏时场地不出现在取景框，图层锁定时场地不可编辑，这是与业务对象一致的预期行为。CSS 中不再使用的 `.node-row.vtx` 模板一并删除。

## 加一个新功能时

1. 判断它属于哪一层（多数新功能进 `js/features/`）；
2. 在那一层里建文件，写一行 `/* 文件名.js —— 职责 */` 文件头（`conventions.json` 要求恰好一行）；
3. 按层序插进 `index.html`；
4. 跑 `npm run ci`——层序错了会在这一步红，而不是等功能第一次被用到时 `undefined`。
