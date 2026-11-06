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
| `siteDomainOf / siteBounds / siteOutlinePoints / imageWorldFrame` | `js/core/geometry.js`（`siteDomainOf` 的宽高直接取自 `siteBounds`，包围盒只有一个源） | 视口、渲染、导出、交互 |
| `siteBoundaryPoints / siteShapeCenter / siteBasePoint / siteRadiusText / siteAreaPerimeter` | `js/core/geometry.js`（场地几何唯一实现） | `render.js` 标注、`io-export.js` SVG、属性面板 |
| `siteHandlesOf / siteHandleList / siteHandleDragTo / resizeSiteByHandle` | `js/core/geometry.js`（手柄几何唯一实现；交互层只做命中与事件分发） | `render.js` 手柄绘制、`interaction.js` 拖拽 |
| `pickScreenHandle` | `js/core/geometry.js`（屏幕阈值唯一实现） | `render.js` 对象手柄命中、`interaction.js` 场地手柄命中（半径 9px 同源） |
| `siteLayerOf / siteIsVisible / siteIsLocked` | `js/core/model.js`（场地与业务对象共用图层可见/锁定语义） | 视口取景、渲染、交互守卫、属性面板 |
| `renderNodeEditor(o, opts) / bindNodeEditorEvents(box, spec) / layerOptionsHTML(id)` | `js/features/props.js` | 折线/闭合区域节点编辑与场地多边形顶点编辑共用同一套 DOM 与事件契约 |
| `calibPoints / calibSelection / calibUndoStack` 及 `calibHitAt / calibPushUndo / calibUndo` | `js/core/model.js`（状态） / `js/core/interaction.js`（控制点编辑） | 比例尺与仿射校准：拖拽/增删/撤销只改临时控制点，`Enter`/✓ 提交时才 `solveImageAffine + migrateObjectsByAffine` |
| `imageHandleList / imageHandleDragTo / affTranslate / affRotateAbout / affScaleAbout / affShearX / siteCornerPoints` | `js/core/geometry.js`（图片整体变换唯一实现） | `render.js` 手柄绘制、`interaction.js` 拖拽、`selftest.mjs` 变换断言 |
| `collectSnapCandidates` 内的场地角点追加 | `js/core/geometry.js` | 场地不在 objects，单独追加折点→端点 / 圆心→center；图层隐藏时不参与 |
| `applyVectorSite / siteDxfEntities` | `js/features/io-import.js` / `js/features/io-export.js` | 仅功能域内部 |
| `annotToggleGroupHTML(items, opts) / bindAnnotToggleInputs(box, spec)` | `js/features/props.js`（标注开关渲染与事件绑定的唯一实现） | 点设备/区域/折线的属性面板与场地属性面板共用；新增开关组只需传 `items` 与 `attr` |
| `outlineOf(o)` | `js/core/geometry.js`（对象轮廓顶点唯一源：rect 形状族 → `shapeWorldPoints` 采样多边形，line/dimension → 节点副本，point/text → `[]`；每次返回新数组） | `io-export.js` 的 SVG 区域/折线/标注与 DXF `LWPOLYLINE`；顶点数与坐标由 `selftest` §72 golden 断言锁定 |
| `dxfEntitiesForExport()` | `js/features/io-export.js`（纯函数：按当前工程组装 DXF 实体+图层，不触发下载） | `exportDXF()` 与 `selftest`（DXF golden：实体序列与顶点数） |
| `objectIndexById(list?)` | `js/core/model.js`（id → 对象索引；缺省索引当前楼层 `state.objects`，重复 id 保留首个） | `interaction.js` 拖拽起点、批量移动、位移判定、Esc 回滚：把 N 次 `find` 收敛为一次建索引 |
| `ensureVendor(name)` | `js/core/config.js`（第三方公共模块可用性唯一检查点；缺失抛「公共模块未加载：<中文名>」） | `io-export.js`（Dxf/Xlsx/Pdf/Qr）、`io-import.js`（Xlsx/Dxf/PdfRead） |
| `siteAnnotToggleKeys(site) / renderSiteAnnotToggles(site)` | `js/features/props.js`（按场地形状筛选有效开关） | 场地属性面板；无场地返回空串，锁定（含图层锁定）时 `disabled` |
| `SITE_ANNOT_SETTING_KEYS / siteAnnotSettingOn / setSiteAnnotSetting` | `js/core/model.js`（仍写 `state.settings` 原键，不改 schema） | 场地属性面板、`drawSiteAnnotations`、SVG 导出、`selftest.mjs` |
| `clearCurrentFloor()` | `js/core/persistence.js`（当前楼层全清并恢复默认取景框，返回清理摘要） | 顶栏「清空」按钮（先 `pushHistory` 再调用）；自测直接调用。影响：清空写入对象墓碑、同步当前楼层条目、清空校准运行时状态，不重置图层/类型/楼层结构 |
| `markDirty(kind)` | `js/core/persistence.js`（变更提交协议唯一实现：清覆盖率 → 重建静态层 → 落盘 → 广播 → 按 kind 刷 UI/重绘） | `commitChange`（object）、`commitObjectEdit`（objectEdit）、`clearCurrentFloor`（clear，不广播）、`undo/redo`（restore）、`deleteFloor`（floor，不广播）；`switchFloorData` 仍只清覆盖率/静态层，落盘由 `switchFloor` 负责，避免载入资产前提前写盘 |
| `sameSerializable / objectMovedFrom / dragChanged / cancelActiveDrag` | `js/core/interaction.js`（拖拽提交判定与取消的唯一实现：深比较剔除 `updatedAt`，未变更不落盘、不留空快照） | `pointerup` 的 move/手柄/图片/场地提交判定；`pointerdown` 第二指、`pointercancel`、`lostpointercapture`、Escape 统一走 `cancelActiveDrag` |
| `xmlEscape(s)` | `js/features/ui-shell.js`（与 `esc` 共用同一替换表，按 XML/SVG 用途命名） | `io-export.js` 的底图 `href`、场地 `fill/stroke`；任何新增 XML 文本/属性写入必须复用它 |
| ``modalBody`…` / safeHTML(html)`` | `js/features/ui-shell.js`（模态正文模板：插值默认转义；`safeHTML` 仅用于内部已逐项转义的片段） | `openProjectLibrary`、`openCollabPanel`；新增模态优先用 `modalBody`，禁止拼接未转义的用户数据 |
| `sanitizeSiteStyle(raw)` | `js/core/persistence.js`（场地样式白名单唯一实现：`fill/stroke` 颜色、`fillAlpha`、`strokeWidth`） | `sanitizeSite`（载入/导入/合并）；导出层 `xmlEscape` 为第二道防线 |
| `buildProject(p) / countProjectObjects(p)` | `js/core/persistence.js`（JSON→工程候选对象；不写全局 `state` / 对象总数统计） | `importJsonFile`、`openProjectById`、`duplicateProjectById` 的“先校验后替换”事务；`migrateProject` 仍 = `buildProject` + 立即替换 |
| `projectObjectLists(st)` | `js/core/persistence.js`（工程级遍历对象的唯一入口：当前楼层 + 其余楼层） | `ensureObjectPhotoAssets`（全楼层照片转存）、`countProjectObjects`、JSON 导出（全楼层照片内嵌）；禁止工程级逻辑只扫 `state.objects` |
| `importLimitErrors(spec) / importLimitMessage(errs)` | `js/core/config.js`（导入限值唯一校验入口与中文提示） | JSON/CSV/TSV/XLSX/DXF/PDF/图片/合并导入；限值来自 `APP_LIMITS` |
| `sanitizeTombstones(arr, nowMs)` | `js/core/persistence.js`（删除墓碑清洗唯一实现：按 `(kind,id)` 去重取最晚删除时间；**按对象 id 长期保留**，仅在超出 `TOMBSTONE_RETENTION_DAYS` 窗口或 `TOMBSTONE_MAX` 上限时淘汰） | `buildProject`（载入/导入/合并）、`markTombstone` 的增量淘汰；`nowMs` 供自测注入固定时间，缺省 `Date.now()` |
| `markTombstone(id, kind)` | `js/core/persistence.js`（记录删除墓碑；攒够 `TOMBSTONE_EVICT_BATCH` 条才压缩一次，避免删除密集时每次删除都全量排序） | 对象删除、清空楼层、删除楼层、停车场重建；合并侧 `merge.js` 只读墓碑写结果 |
| `markSurfaceSize(canvas, cssW, cssH) / surfaceCssSize(ctx)` | `js/core/render.js`（绘图表面逻辑尺寸的唯一来源） | `drawScreenTag` 的夹边、离屏静态层、PNG/PDF 导出画布。离屏 canvas 的 `clientWidth` 恒为 0，必须用登记尺寸，否则屏幕标签被压到 (2,2) |

影响范围：`siteHandleList/siteAreaPerimeter/siteBoundaryPoints/siteShapeCenter` 保留旧签名（可直接传旧 `kind` 矢量 background 对象），`scripts/selftest.mjs` 的既有断言不需要改写调用方式；`resizeSiteByHandle(h,p)` 是写 `state.site` 的薄包装，新代码应优先用 `siteHandleDragTo(site,h,p)`，它不读全局、便于单测。删除重复后 `render.js` 不再声明 `siteBoundaryPoints/siteShapeCenter/siteAreaPerimeter/siteBasePoint/siteRadiusText`，`interaction.js` 不再声明 `siteHandleList/resizeSiteByHandle`——同名函数只保留 `geometry.js` 一份，避免两份实现漂移。

Phase 2B 影响范围：`renderNodeEditor(o, opts)` 新增可选第二参数，省略时行为与旧实现一致（对象节点行 DOM 不变）；场地多边形改用它生成 `data-node-*` 行，`props.js` 内不再有 `data-site-node-*` 这一套。`bindNodeEditorEvents(box, spec)` 统一接管节点坐标输入与增删/排序按钮，业务对象与场地只提供各自的提交回调。`pickScreenHandle` 统一对象/场地手柄的屏幕命中阈值（9px），`handleAt` 与 `siteHandleAt` 不再各写一份循环。`siteIsVisible/siteIsLocked` 现在叠加所属图层的可见/锁定状态，**会影响所有依赖这两个判定的调用点**（取景框、渲染、手柄守卫、拖拽守卫）：图层隐藏时场地不出现在取景框，图层锁定时场地不可编辑，这是与业务对象一致的预期行为。CSS 中不再使用的 `.node-row.vtx` 模板一并删除。

标注开关搬迁影响范围：`ui-shell.js` 的设置弹窗不再渲染 `setLabels / setSegLen / setAreaTag / setSiteNodes / setSiteSegLen / setSiteBase / setSiteRadius / setSiteArea / setSitePerimeter` 这些控件；`index.html` 顶部工具栏的全局「标签」复选框（`id="showLabels"`）同步移除，`ui-panels.js` 的绑定与 `refreshUI()` 回填一并删除。`state.settings` 的 `showLabels / showSegLen / showAreaTag` 与六个 `site*` 键仍保留：前者继续作为未单独配置对象的缺省值，后者改由场地属性面板写入；旧工程无需迁移，`persistence.js` 的清洗逻辑不变。对象面板的 `renderAnnotToggles` 与场地面板的 `renderSiteAnnotToggles` 共用 `annotToggleGroupHTML` 模板（`data-annot` / `data-site-annot` 区分回写目标），事件绑定统一走 `bindAnnotToggleInputs`，禁止再写第二套循环。

屏幕标签定位影响范围：`drawScreenTag` 的夹边尺寸改由 `surfaceCssSize` 提供——DOM 画布仍读 `clientWidth/clientHeight`，行为不变；离屏静态层与 PNG/PDF 导出画布在创建时用 `markSurfaceSize` 登记逻辑尺寸。离屏 canvas 不在文档中，`clientWidth` 恒为 0，此前会把节点坐标/段长等标签压到画布左上角 (2,2)。**后续新增任何离屏画布并调用 `drawScene` 的代码，必须同样登记尺寸**，否则同类标签会再次堆到原点。

## 加一个新功能时

1. 判断它属于哪一层（多数新功能进 `js/features/`）；
2. 在那一层里建文件，写一行 `/* 文件名.js —— 职责 */` 文件头（`conventions.json` 要求恰好一行）；
3. 按层序插进 `index.html`；
4. 跑 `npm run ci`——层序错了会在这一步红，而不是等功能第一次被用到时 `undefined`。
