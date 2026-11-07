# 模块分层（MODULES）

> 这份文件回答「谁可以依赖谁」。判据：`scripts/check.mjs` 第 9 步 + `index.html` 的加载顺序。

## 为什么是分目录，不是可插拔模块

PlotPin 是**双击 `index.html` 即用**的离线单页工具：41 个 classic `<script>`（`js/` 31 个 + `ngm.vendor/` 10 个）共享同一个全局词法作用域，
`const SCHEMA`、`state`、`I18N` 都是裸标识符，文件之间直接引用。改 `<script type="module">`
在 `file://` 下会被 CORS 拦掉，等于放弃核心产品承诺。

而且它没有「请求边界」：DOM 事件监听、canvas 离屏缓存、已注册的导出器，尤其是**工程文件里
已经写入的 `typeId`**，都和模块绑在一起。`plugins.js` 的 `typeInUse()` 会在对象仍在使用某个类型时
拒绝注销，避免既有图纸丢失外观。所以**内置模块不做运行时启停**（pivoise 那套 `module.json`
+ 拓扑排序 + 热启停属于服务端模型，不照抄）；只有 C-01 的**隔离 Worker 插件**支持
`loadPlugin / unloadPlugin`：导出器/导入器立即撤销，类型只在未被对象使用时移除。

能搬、也已经搬的是：**把目录边界写清楚，并由判据守住**。

## 三层 + 一个入口

| 层 | 目录 | 允许依赖 | 职责 |
|---|---|---|---|
| 0 · 公共库 | `js/common/` | 仅 `ngm.vendor/` | i18n、LWW 合并、符号库（36 六类图元、别名搜索、SVG 安全清洗、JSON 往返、DXF 折线近似）、DXF/PDF/QR 适配；与具体业务无关 |
| 1 · 内核 | `js/core/` | 0 + vendor | 常量与内置类型、模型、几何、渲染、交互、持久化、视口、启动 |
| 2 · 功能域 | `js/features/` | 0 + 1 + vendor | 属性面板、侧栏清单、UI 外壳、插件注册点与 Worker 隔离沙箱、文件/表格导入导出、停车规划、实时协作 |
| 3 · 入口 | `js/core/app.js` | 全部 | 能力探测、恢复工程、首屏适配、Service Worker 注册；**必须最后加载** |

`ngm.vendor/` 是随仓库分发的公共模块，按 `ngm.lock` 钉住，不属于本项目的任何一层。

> **分类是以加载顺序为准，不是按名字猜的**。第一版把 `ui-shell.js` 与 `plugins.js` 归进内核，
> 判据立刻报「层序倒退：第 1 层排在第 2 层之后」——它们实际依赖功能域。已按代码事实移到
> `js/features/`。这正是分层需要判据的理由：目录名可以随便起，顺序不会撒谎。

## 判据

`scripts/check.mjs` 第 9 步守三件事：

1. `js/` 下只允许 `common/`、`core/`、`features/` 三个子目录——再出现 `js/app/` 或新造一层就红；
2. `index.html` 的脚本加载顺序按上表**层号非递减**（`core/app.js` 视为 3）；
3. 每个脚本恰好属于一层（按路径，`core/app.js` 视为 3）；**文件存在性不在这里查**，由第 2/3 步（入口引用与资源存在性）负责。

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
| `calibPoints / calibSelection / calibUndoStack` 及 `calibHitAt / calibPushUndo / calibUndo` | `js/core/model.js`（状态） / `js/core/interaction.js`（控制点编辑） | 比例尺与仿射校准：拖拽/增删/撤销只改临时控制点，`Enter`/✓ 提交时才 `applyWorldTransform`（内部复用 `solveImageAffine` + `migrateObjectsByAffine`） |
| `applyWorldTransform(M, opts) / siteShapeByAffine(shape, M) / scaleWorldAround(center, factor)` | `js/core/geometry.js`（世界变换唯一入口；对象、底图仿射/米每像素一次迁移，场地默认不动、可 `{site:true}` 显式迁移；`scaleWorldAround` 为兼容旧签名的包装） | `interaction.js` 的比例尺/仿射校准提交；任何「整体缩放/纠偏」不得再直接遍历对象，必须走该入口 |
| `imageHandleList / imageHandleDragTo / affTranslate / affRotateAbout / affScaleAbout / affShearX / siteCornerPoints` | `js/core/geometry.js`（图片整体变换唯一实现） | `render.js` 手柄绘制、`interaction.js` 拖拽、`selftest.mjs` 变换断言 |
| `collectSnapCandidates` 内的场地角点追加 | `js/core/geometry.js` | 场地不在 objects，单独追加折点→端点 / 圆心→center；图层隐藏时不参与 |
| `applyVectorSite / siteDxfEntities` | `js/features/io-import.js` / `js/features/io-export.js` | 仅功能域内部 |
| `annotToggleGroupHTML(items, opts) / bindAnnotToggleInputs(box, spec)` | `js/features/props.js`（标注开关渲染与事件绑定的唯一实现） | 点设备/区域/折线的属性面板与场地属性面板共用；新增开关组只需传 `items` 与 `attr` |
| `outlineOf(o)` | `js/core/geometry.js`（对象轮廓顶点唯一源：rect 形状族 → `shapeWorldPoints` 采样多边形，line/dimension → 节点副本，point/text → `[]`；每次返回新数组） | `io-export.js` 的 SVG 区域/折线/标注与 DXF `LWPOLYLINE`；顶点数与坐标由 `selftest` §72 golden 断言锁定 |
| `dxfEntitiesForExport()` | `js/features/io-export.js`（纯函数：按当前工程组装 DXF 实体+图层，不触发下载） | `exportDXF()` 与 `selftest`（DXF golden：实体序列与顶点数） |
| `PdfRead.layoutPdfPages(pages,opt)` | `js/common/pdf-read.js`（多页落点唯一实现：按文档页序沿 +X 排布，页间 gap 默认最大页宽 8%；返回每页 `{pageNo,x,y,width,height,sourceOrigin}`） | `io-import.js`（多页 PDF 独立原点落位）、`selftest` §37b、`e2e pdf-multipage`；单页走同一函数（x=0），不另写分支 |
| `pdfPagePlan()` | `js/features/io-export.js`（整套 PDF 页序/页码计划：楼层顺序→每层「图纸页+清单页」，全局连续页码；与 `pdfListRowsPerPage()` 同源，清单分页数只算一处） | `exportPDF()`（图纸页/清单页页码渲染）、`selftest` 可独立复算 |
| `createTitleBlock / normalizeTitleBlock / titleBlockText / TITLE_BLOCK_FIELDS` | `js/core/model.js`（图框字段唯一 schema：默认关闭、`frame/scaleBar/legend` 子项默认开、版本默认 `V1.0`；`titleBlockText` 清洗控制字符并截断到 80 字符；`normalizeTitleBlock` 缺字段回退默认，旧工程无 `meta.titleBlock` 时整体降级为默认关闭） | `createInitialState`、`buildProject`（JSON 载入/导入/合并）、`io-export` 的 `titleBlockEffective`、`selftest` §75.10；新增字段只改 `TITLE_BLOCK_FIELDS` 一处 |
| `titleBlockSpec(W,H,ppu,format) / titleBlockEffective / titleBlockRatio / niceScaleBarMeters / titleBlockLegendData / exportTitleBlockSvg / drawTitleBlockOnCanvas` | `js/features/io-export.js`（图框叠加层唯一布局源：未启用返回 `null`，调用方直接跳过以保证默认产物零字节差异；标题栏 4×2 单元格、比例尺 1/2/5×10ⁿ 米、图例按可见对象类型聚合；SVG 全部文本走 `esc()`，Canvas 版供 PNG/PDF 位图页共用） | `renderToDataURL`（PNG）、`renderPdfDrawingPage`（PDF）、`buildSceneSvg`（SVG）、`openTitleBlockDialog`、`selftest` §75.10、`e2e title-block`；三种格式几何/文案不得各自复制 |
| `Dxf.inspect(text) / Dxf.parseDxf(text,opt)` | `js/common/dxf.js`（DXF 适配层，不改 `ngm.vendor`：版本/单位审计与公共模块未覆盖的 SOLID / 3DFACE / LEADER / ATTRIB(ATTDEF) 补充解析；`parseDxf` 返回公共模块结果 + `inspect/supplemental`，`opt.forceUnit` 支持单位改判，原实体、`unit` 与字段映射不变） | `io-import.js`（DXF 预检、单位确认、二进制拦截）、`selftest` 的 8 版本矩阵、`e2e dxf-version`；任何 DXF 导入必须走该适配层，禁止在功能域另写组码解析 |
| `objectIndexById(list?)` | `js/core/model.js`（id → 对象索引；缺省索引当前楼层 `state.objects`，重复 id 保留首个） | `interaction.js` 拖拽起点、批量移动、位移判定、Esc 回滚：把 N 次 `find` 收敛为一次建索引 |
| `coverageGridPlan(items,opt) / analyzeCoverage(st,opt) / regionPolygons(st)` | `js/core/geometry.js`（覆盖率口径 v2 唯一实现：固定目标格数按可见区域面积分配、格边夹取与总格数上限；`regionPolygons` 过滤隐藏对象/隐藏图层；`spec` 元数据随结果返回） | `runCoverageAnalysis`（弹窗报告）、`exportBlindSpotsGeoJson`（报告内置 `coverageSpec`）、`optimizeCameraPlacement`（固定低分辨率规划网格）、`selftest.mjs`；影响：报告数值与 v1 不再可比，分母只含可见区域 |
| `objectNameScopeFor / beginObjectNameScope / withObjectNameScope` | `js/core/model.js`（批量取号作用域：一次聚集已占用编号，作用域内 `reserve()` 为集合查找；起点与旧 `nextObjectId` 一致＝“已占用数量+1”后跳号） | `buildProject`（JSON 导入/打开工程）、`importDxfFile`、`importPdfFile`、`rowsToObjectsPlan`/`applyTableImport`、`duplicateSelected`/`pasteClipboard`、覆盖率建议批量落点；影响：编号唯一性与起始号语义不变，已有工程内导入从 O(N²) 降为线性；单次交互创建仍走一次全量扫描（O(N)，可接受） |
| `ensureVendor(name)` | `js/core/config.js`（第三方公共模块可用性唯一检查点；缺失抛「公共模块未加载：<中文名>」） | `io-export.js`（Dxf/Xlsx/Pdf/Qr）、`io-import.js`（Xlsx/Dxf/PdfRead） |
| `siteAnnotToggleKeys(site) / renderSiteAnnotToggles(site)` | `js/features/props.js`（按场地形状筛选有效开关） | 场地属性面板；无场地返回空串，锁定（含图层锁定）时 `disabled` |
| `SITE_ANNOT_SETTING_KEYS / siteAnnotSettingOn / setSiteAnnotSetting` | `js/core/model.js`（仍写 `state.settings` 原键，不改 schema） | 场地属性面板、`drawSiteAnnotations`、SVG 导出、`selftest.mjs` |
| `clearCurrentFloor()` | `js/core/persistence.js`（当前楼层全清并恢复默认取景框，返回清理摘要） | 顶栏「清空」按钮（先 `pushHistory` 再调用）；自测直接调用。影响：清空写入对象墓碑、同步当前楼层条目、清空校准运行时状态，不重置图层/类型/楼层结构 |
| `markDirty(kind)` | `js/core/persistence.js`（变更提交协议唯一实现：清覆盖率 → 重建静态层 → 落盘 → 广播 → 按 kind 刷 UI/重绘） | `commitChange`（object）、`commitObjectEdit`（objectEdit）、`clearCurrentFloor`（clear，不广播）、`undo/redo`（restore）、`deleteFloor`（floor，不广播）；`switchFloorData` 仍只清覆盖率/静态层，落盘由 `switchFloor` 负责，避免载入资产前提前写盘 |
| `sameSerializable / objectMovedFrom / dragChanged / cancelActiveDrag` | `js/core/interaction.js`（拖拽提交判定与取消的唯一实现：深比较剔除 `updatedAt`，未变更不落盘、不留空快照） | `pointerup` 的 move/手柄/图片/场地提交判定；`pointerdown` 第二指、`pointercancel`、`lostpointercapture`、Escape 统一走 `cancelActiveDrag` |
| `snapshotHistoryState / materializeHistoryState / historyValueEqual / isHistorySnapshot` | `js/core/model.js`（撤销栈结构共享唯一实现：与上一份已标记快照逐层深比较复用未变子树，字符串（含照片 base64）按引用共享；物化仅复制容器、字符串继续共享） | `persistence.js` 的 `pushHistory / undo / redo`；`history.past/future` 仍是 state 形状的普通对象数组，`assetRefsInMemory`、`ContentAssets.collectAssetRefs`、交互层 `history.past.pop()` 与外部手工 push 的普通条目**行为不变**。影响：`undo/redo` 不再直接 `state = pop()`，而是物化一份可编辑副本，避免 live 编辑污染其他栈帧共享的子树；落盘时机与 20 条上限不变 |
| `xmlEscape(s)` | `js/features/ui-shell.js`（与 `esc` 共用同一替换表，按 XML/SVG 用途命名） | `io-export.js` 的底图 `href`、场地 `fill/stroke`；任何新增 XML 文本/属性写入必须复用它 |
| ``modalBody`…` / safeHTML(html)`` | `js/features/ui-shell.js`（模态正文模板：插值默认转义；`safeHTML` 仅用于内部已逐项转义的片段） | `openProjectLibrary`、`openCollabPanel`；新增模态优先用 `modalBody`，禁止拼接未转义的用户数据 |
| `L(text, params) / I18N.p`、`TEMPLATES`、`I18N.fmt` | `js/common/i18n.js`（动态文案唯一入口：`{name}` 占位插值；英文先查 `TEMPLATES` 整句、再查 `PHRASES`，未收录回退中文；`fmt` 只做占位替换、不转义） | 剪贴板/导入/楼层/快照/协作/报价/PDF 页脚等动态句；用户输入只作参数，DOM 走 `textContent`/`esc`，SVG 走 `xmlEscape`。新增动态句必须用模板，禁止 `前缀 + 数值 + 后缀` 拼接 |
| `scripts/i18n-scan.mjs` | i18n 覆盖率可复跑统计（扫描 `js/**/*.js` 字符串字面量；识别 `L/I18N.*` 与 `toast/commitChange/openModal/showConfirm` 等翻译 sink；输出硬编码/已字典化/缺口/覆盖率） | B-14 验收与后续回归；口径写在脚本头，禁止用估算替代 |
| `scripts/minify-core.mjs` | 构建期无损压缩（`minifyJs` / `minifyCss`）：只删注释/缩进/空行/尾部空白，字符串、模板字面量、正则与 `url(...)` 原样保留；跨行块注释保留一个换行以不改变 ASI | `scripts/pack-core.mjs` 内联 CSS/JS 时调用；源文件与运行时 API 不变。改压缩规则必须同时跑 selftest/e2e 与体积对比 |
| `scripts/size-report.mjs` | 单文件产物体积实测：按 `/* path */` 标记切分，输出 Top 10、注释/缩进/空行、重复字符串、重复代码行、顶层死代码候选 | 体积专项验收与后续预算评估；口径写在脚本头，禁止目测替代 |
| `sanitizeSiteStyle(raw)` | `js/core/persistence.js`（场地样式白名单唯一实现：`fill/stroke` 颜色、`fillAlpha`、`strokeWidth`） | `sanitizeSite`（载入/导入/合并）；导出层 `xmlEscape` 为第二道防线 |
| `buildProject(p) / countProjectObjects(p)` | `js/core/persistence.js`（JSON→工程候选对象；不写全局 `state` / 对象总数统计） | `importJsonFile`、`openProjectById`、`duplicateProjectById` 的“先校验后替换”事务；`migrateProject` 仍 = `buildProject` + 立即替换 |
| `buildDemoProject()` | `js/core/persistence.js`（D-01 示例工程唯一构造：100×70m 矩形场地 + 6 个对象（2 点设备 / 1 区域 / 1 折线 / 1 文字 / 1 标注），背景空槽、**不引用任何图片/照片资产**；返回候选工程，不写全局 `state`） | `ui-shell.js` 的「打开示例工程」、`selftest.mjs` D-01；示例新增对象必须避免资产引用，防止孤儿资产 |
| `firstRunGuideState(hasContent, storage?) / markFirstRunGuide(status, choice, storage?) / savedProjectHasContent(saved)` | `js/features/ui-shell.js`（D-01 首次启动引导资格与状态唯一实现：localStorage `plotpin:firstRunGuide:v1`，仅 `v===1 && status==='completed'` 永久抑制；`skipped` 下次仍展示，未知版本/损坏记录按未完成；`savedProjectHasContent` 只认项目 id / 对象 / 图片底图 / 多楼层 / 非默认场地，纯净空白自动保存不算老工程） | `app.js` 启动判定、引导弹窗、`selftest.mjs` D-01、`e2e onboarding`；老工程不得触发引导，存储写入失败仅本次会话生效 |
| `projectObjectLists(st)` | `js/core/persistence.js`（工程级遍历对象的唯一入口：当前楼层 + 其余楼层） | `ensureObjectPhotoAssets`（全楼层照片转存）、`countProjectObjects`、JSON 导出（全楼层照片内嵌）；禁止工程级逻辑只扫 `state.objects` |
| `importLimitErrors(spec) / importLimitMessage(errs)` | `js/core/config.js`（导入限值唯一校验入口与中文提示） | JSON/CSV/TSV/XLSX/DXF/PDF/图片/合并导入；限值来自 `APP_LIMITS` |
| `sanitizeTombstones(arr, nowMs)` | `js/core/persistence.js`（删除墓碑清洗唯一实现：按 `(kind,id)` 去重取最晚删除时间；**按对象 id 长期保留**，仅在超出 `TOMBSTONE_RETENTION_DAYS` 窗口或 `TOMBSTONE_MAX` 上限时淘汰） | `buildProject`（载入/导入/合并）、`markTombstone` 的增量淘汰；`nowMs` 供自测注入固定时间，缺省 `Date.now()` |
| `markTombstone(id, kind)` | `js/core/persistence.js`（记录删除墓碑；攒够 `TOMBSTONE_EVICT_BATCH` 条才压缩一次，避免删除密集时每次删除都全量排序） | 对象删除、清空楼层、删除楼层、停车场重建；合并侧 `merge.js` 只读墓碑写结果 |
| `markSurfaceSize(canvas, cssW, cssH) / surfaceCssSize(ctx)` | `js/core/render.js`（绘图表面逻辑尺寸的唯一来源） | `drawScreenTag` 的夹边、离屏静态层、PNG/PDF 导出画布。离屏 canvas 的 `clientWidth` 恒为 0，必须用登记尺寸，否则屏幕标签被压到 (2,2) |
| `snapshotProjectData / createSnapshot / listSnapshots / deleteSnapshot / restoreSnapshotById / deleteSnapshotsForProject` | `js/core/snapshot.js`（版本快照唯一实现：独立 `snap:<工程>:<快照>` 命名空间、生成前照片转资产引用、20 条/16MB 淘汰；回滚先 `pushHistory()` 再 `buildProject` 原子替换并 `markDirty('restore')` 落盘） | 工程库「版本」入口、快照管理 UI、删除工程时的孤儿快照清理；`snapshotAssetRefs(rec)` 解包 `{meta,data}` 的 `data`，供 A-01 资产可达集扫描 `snap:<pid>:*` 时收集底图/照片引用（快照删除后引用消失，资产可回收） |
| `snapshotObjectIndex / objectDiffFields / diffCategoryOf / diffSnapshots / setDiffOverlay / clearDiffOverlay` | `js/core/snapshot.js`（A/B 差异唯一实现：按对象 id 跨楼层匹配；忽略 `id/z/createdAt/updatedAt/photoDataUrl`；分类新增/删除/属性修改/移动/换楼层/类型变更） | `snapshot-ui.js` 差异清单、`render.js` 的 `drawDiffOverlay`、`selftest.mjs`；叠加层只画当前楼层且只进屏幕预览（导出不包含） |
| `qrSvg(text, px?)` | `js/common/qr.js`（二维码 SVG 唯一实现，内部 `ensureVendor('Qr')`；无内置编码器时抛中文错误） | `io-export.js` 二维码标签、`collab.js` 邀请码（超 42 字节不渲染）；禁止各功能域再复制一份 `qrSvg` |
| `collabInviteEncode(kind, sdp) / collabInviteDecode(text) / collabQrFit(text)` | `js/features/collab.js`（邀请串编解码与二维码容量判定唯一实现：`PLOTPIN-COLLAB:1:O|A:<base64(cleanSDP)>`，兼容裸 SDP；`collabQrFit` 读 `Qr.MAX_BYTES`，不写死 42） | 协作面板生成/应用邀请、`selftest.mjs`（往返/非法输入/容量断言） |
| `collabSweepInbound(now?) / collabInboundBytes() / collabHelloDup(sender, name, now?)` | `js/features/collab.js`（入站分块缓冲与 hello 去重唯一实现：30s TTL、64 key、16MB 字节上限，最旧优先淘汰；同 sender+name 1.5s 窗口去重） | `collabReceiveRaw`（每包收尾清扫）、`collabHandleMessage` 的 hello/hello-ack 分支、`selftest.mjs`（注入 `now` 做确定性断言） |
| `mergeHistoryNeeded(stats)` | `js/core/persistence.js`（「合并是否需要写撤销栈」唯一判据：`updated + deleted + floorMetaUpdated + floorsDeleted > 0`） | `mergeProjectJSON({history:'overwrite'})`（协作实时合并路径）；`history` 缺省/`false`/`true` 语义不变 |
| `stats.floorMetaUpdated / stats.floorsDeleted` | `js/common/merge.js`（合并统计新增字段：前者只在远端确实覆盖本地不同的楼层元数据时 +1，后者统计整层墓碑删除） | `collabQueueApply` 的冲突行与覆盖提示、`mergeHistoryNeeded`；`mergeProjectData` 既有字段不变，调用方按新字段可选读取 |
| `EXPORT_FIELD_DEFS / buildExportRow / exportShapeSummary / exportParamText / xlsxExportTable / TABLE_COLUMNS / PDF_COLS / REPORT_LIST_COLS / LEDGER_FIELDS` | `js/features/io-fields.js`（导出字段描述表与行渲染器唯一实现：列名、取值、台账映射、形状外接盒/参数与「参数」合成列都在此；CSV/TSV/XLSX/PDF 清单/打印报告只保留列布局，不得再各自拼装对象字段） | `io-export.js` 的 `objectRows / delimitedText / exportXlsx / renderPdfListPages / reportListPageHtml`；`io-table.js` 的 `applyLedgerCells`（`LEDGER_FIELDS` 由字段表 `ledger` 标记派生，导入导出同一映射） |
| `dimensionMeasure(o) / dimensionAngleDeg(points)` | `js/features/io-fields.js` / `js/core/geometry.js`（尺寸标注读数唯一源：测距链总长、两点距离、面积+周长、三点夹角；文本模板仍由各格式决定） | `io-export.js` 的 SVG 标注与 DXF 文字、`render.js` 的 `drawDimension` 角度；禁止再各自算一份 |
| `quoteAggregate(catalog) / quoteColumns(agg, catalog) / quoteTable(catalog) / QUOTE_FIELD_DEFS` | `js/features/io-fields.js`（报价表唯一字段源与跨楼层 BOM 聚合：按 `厂商+型号` 聚合数量，仅填型号且目录内唯一时自动绑定；无法唯一确定时记入 `ambiguous` 明确提示；无目录降级为「名称、数量」） | `io-export.js` 的 `exportQuote`（CSV/XLSX 共用，并用 `ambiguous` 决定提示）、`selftest.mjs`；CSV 经 `delimitedFromTable`（`guardFormula`），XLSX 经 `Xlsx.build` |
| `catalogValidate(raw) / importCatalog(raw, save?) / catalogLoad() / catalogVersion(cat) / exportCatalogJSON() / deleteCatalog()` | `js/features/catalog.js`（产品目录 schema 校验、事务化导入与目录版本指纹唯一实现：校验 → `idbPutKey('catalog:current')` → 才替换内存；任一步失败 IDB 与内存均保持原值；`save` 供自测注入失败；`catalogVersion` 为 items 的 FNV-1a 32 位内容指纹） | `io-import.js` 的 JSON 导入路由（按 schema 分流）、`app.js` 首屏恢复、导出下拉的目录导出/删除/报价快照版本、`selftest.mjs` |
| `quoteSignature(t) / quoteSnapshotTable(fresh, snap) / quoteMetaTable(t, meta)` | `js/features/io-fields.js`（报价快照唯一实现：签名只含列数 + 厂商/型号/数量，行集合不变才复用冻结单价；`quoteMetaTable` 追加「目录版本 / 导出时间」两列并只写在合计行） | `io-export.js` 的 `exportQuote`（读写 IndexedDB `quote:last`）、`selftest.mjs` |
| `TABLE_MATCH_COLUMNS / TABLE_IMPORT_EXTRA_COLUMNS / tableImportColumns() / rowMatchesObject(o,c) / applyTableCommonCells(o,c)` | `js/features/io-table.js`（B-08 原义：导入可识别表头 = 导出列 + 操作/匹配列；`rowMatchesObject` 是条件替换的唯一匹配实现；`applyTableCommonCells` 是更新/替换/新增共用的业务属性写回，几何与名称仍由各路径负责） | `rowsToObjectsPlan`、`applyTableImport`、`showTableImportPreview`、`selftest.mjs`；影响：导出表头 `TABLE_COLUMNS` 不变，导入额外接受「操作」与 6 个「匹配…」列 |
| `formulaGuard(s) / formulaUnguard(s)` | `js/features/io-fields.js`（公式注入防护唯一实现：导出加前导单引号，导入仅在原值会被防护时去引号；`'123` 等纯数字/非公式文本保持字面） | `delimitedFromTable`（CSV/TSV/XLSX 导出）、`rowsToObjectsPlan` 的单元格读取、`selftest.mjs`；不再在 `io-export.js` 另存一份 |
| `BLIND_SPOT_FIELDS / buildBlindSpotGeoJson(cov)` | `js/features/io-fields.js`（盲区 GeoJSON 属性与 `coverageSpec` 的唯一生成器；纯函数，无盲区返回 `null`） | `exportBlindSpotsGeoJson()`（只负责提示与下载）、`selftest.mjs` |
| `createRuleConfig / normalizeRuleConfig / normalizeRuleTypes / ruleTolerance / RULE_CONFIG_VERSION` | `js/core/model.js`（规则配置 schema 唯一源：三条内建规则默认启用、容差 0–1000m 三位小数、类型阈值最多 200 键；`state.rules` 随工程保存，`buildProject` 载入时显式归一） | `createInitialState`、`buildProject`（JSON 载入/导入/合并）、规则页签、`selftest.mjs`；新增规则配置只改这一处 |
| `mergeRuleSide(local, incoming)` | `js/common/merge.js`（规则配置合并唯一判据：本地非空优先，缺失侧回退另一侧；`mergeNormalizeSide` 会把缺失侧归一为空对象，不能只看真值） | `mergeProjectData`、`selftest.mjs`；既有多楼层/墓碑合并语义不变 |
| `registerRule / unregisterRule / listRules / runRuleCheck / ruleViolationsCsv / locateRuleViolation` | `js/features/rules.js`（规则注册与执行唯一入口：内建规则不可注销；逐规则异常隔离为 `skipped`；违规统一含规则名/对象/关联对象/楼层/位置/说明；CSV 经 `csvCell` 做引号与公式防护；定位跨楼层选中主/关联对象） | 规则页签（`index.html` 第 5 页签）、`selftest.mjs` §57.2–57.7、`e2e rules`；插件/后续规则只走 `registerRule`，不得在 UI 层另写检查循环 |
| `ruleObjectFootprint / ruleOverlapCheck / ruleSpacingCheck / ruleBoundsCheck / ruleCandidatePairs` | `js/features/rules.js`（几何口径唯一实现：bbox 穿透容差 → 多边形交面积；间距净距 `<` 两类型阈值的 `max`；越界以 `siteOutlinePoints` 为界并分 `partial`/`full`；minX 扫描线候选对，`mode:'brute'` 仅供基准对照） | `runRuleCheck`；`scripts/bench.mjs` 的 2000 对象/30 类型场景与 `--brute` 收益对照 |
| `SYMBOL_LIBRARY / SYMBOL_CATEGORIES / symbolPathsFor(type)` | `js/common/symbols.js`（内置 36 个六类图元与符号路径的**唯一来源**；`symbolPathsFor` 返回 `[{d,fill}]`，坏数据返回 `[]`，不抛异常） | `render.js` 画布（`Path2D` 窄缓存）、`io-export.js` 的 SVG/PNG/PDF 与 DXF 折线近似、符号库页签预览；**任何格式不得另存一份符号图形** |
| `normalizeSymbolPaths / normalizeSymbolViewBox / normalizeSymbolAliases` | `js/common/symbols.js`（符号数据归一唯一入口：路径字符白名单、24×24 默认 viewBox、别名数量/长度上限；非法路径抛错） | `persistence.js` 自定义类型载入/合并、`sanitizeSymbolBundle`、`selftest.mjs`；新增字段只改这一处 |
| `assertSafeSvg / parseSvgSymbol(text)` | `js/common/symbols.js`（SVG 导入安全清洗唯一实现：64 KB / 200 元素 / 16 层嵌套 / 200 路径 / 单条 5000 字符；拒绝 script、`on*`、外部 `href`/`xlink:href`、DOCTYPE/ENTITY 与非法路径字符；只提取 path/circle/rect/polygon/polyline/line） | `symbols.js` 的导入 UI、`selftest.mjs` 10 条安全用例、`e2e symbols`；不得在 UI 层另写解析 |
| `buildSymbolIndex(lib) / searchSymbols(query, cat)` | `js/common/symbols.js`（符号检索唯一实现：id/名称/别名小写包含匹配 + 分类筛选；索引构建供 bench 加载耗时门禁） | 符号库页签搜索与分类下拉、`scripts/bench.mjs`（`symbolLoadMs`）、`selftest.mjs` |
| `customSymbolsFromTypes(types, meta) / sanitizeSymbolBundle(raw, usedIds)` | `js/common/symbols.js`（工程命名空间 JSON 包唯一实现：`plotpin.symbols/v1`；只导出非内置符号，导入时逐符号清洗、id 冲突改名 `sym.import.N`、最多 200 个） | 符号库页签「导出 JSON / 导入 JSON」、`selftest.mjs`；**不写全局存储，不影响其他工程** |
| `symbolPolylinesInWorld(type,x,y,sizeMeters,angleDeg,viewBox) / pathToPolylines(d)` | `js/common/symbols.js`（DXF 折线近似唯一实现：支持 M/L/H/V/C/S/Q/T/A/Z 与相对命令，曲线 8–10 段、圆弧 6–48 段采样；返回世界坐标折线） | `io-export.js` 的 `dxfEntitiesForExport`（POINT 锚点 + LWPOLYLINE 近似与 `report` 降级说明）、`selftest.mjs` |

B-08 原义影响范围：`rowsToObjectsPlan(rows)` 的返回值新增 `replaces / errors / strict`，既有 `updates / creates / warnings`
字段与含义不变；无「操作」列的旧表头行为保持逐行告警/跳过。`applyTableImport(plan)` 签名不变，但带 `plan.errors`
的计划会被直接拒绝（整批不生效），并在应用前按 `importLimitErrors` 复核对象数上限、失败时用快照回滚。
替换行只写属性、不改几何；`匹配…` 列可跨楼层命中，`楼层` 列可把范围收窄到单层。导出表头 `TABLE_COLUMNS`
与 8 种导出产物不变。`formulaGuard` 从 `io-export.js` 迁到 `io-fields.js`，全局名与行为不变，新增 `formulaUnguard`。


B-06 影响范围：`mergeProjectJSON(raw, opts)` 新增 `opts.history:'overwrite'`——只有 `mergeHistoryNeeded(stats)` 为真（发生 LWW 覆盖）才 `pushHistory()`，纯新增合并不再占用撤销栈；既有调用不传 `history` 时行为不变。`mergeProjectData` 的 `stats` 新增 `floorMetaUpdated / floorsDeleted` 两个字段，既有字段与返回值结构不变，旧调用方忽略新字段即可。`qrSvg` 从 `io-export.js` 上移到 `js/common/qr.js`，唯一调用方签名不变（新增可选像素宽度）；`collab.js` 不再各自实现二维码渲染。

B-08 影响范围：`objectRows(objs, floorName)`、`objectRowsAll()`、`delimitedText(delim)`、`exportDelimited`、`exportXlsx`、`exportSVG/PDF/DXF/PNG`、`exportBlindSpotsGeoJson` 的签名与下载行为不变。`TABLE_COLUMNS` 的 27 个表头及顺序原样保留；`PDF_COLS` 与 `REPORT_LIST_COLS` 从 `io-export.js` 移到 `io-fields.js`，名称/取值/顺序不变。`LEDGER_FIELDS` 从 `io-table.js` 移到 `io-fields.js`，改为由字段表派生（值仍为 `[['型号','model'],['安装高度','mountHeight'],['IP','ip'],['责任人','owner']]`）。**唯一可观察行为变化**：打印报告清单的「参数」列此前因 `objectRows` 未提供该键而恒为空白，现在改用与 PDF 清单同一合成值（矩形/圆形/闭合/标注类型），属于补齐列语义而非删字段；8 种导出产物 golden 对比不受影响（报告不在 8 种内）。新文件位于 `js/features/`（层 2），`index.html` 插在 `io-table.js` 与 `io-export.js` 之间。

B-05 影响范围：新增 `js/features/catalog.js`（层 2，`index.html` 插在 `io-export.js` 之后，全局 classic 脚本 39→40）。`delimitedText(delim)` 与既有 CSV/TSV 台账导出的行为不变，DSV 写出改由新增 `delimitedFromTable(table, delim)` 统一承担（CSV 报价复用 `guardFormula`）。属性面板新增「厂商」输入（`data-field="propVendor"`，载入目录时挂 `list="catVendors"`）与可选「数量」（`props.qty`，缺省按 1 计）；「型号」输入挂 `list="catModels"`，`applyField('propModel')` 在型号变化时删除旧的 `props.vendor`。跨厂商重名且未填厂商时，面板显示提示、报价行单价留空、导出提示，不会静默错绑。未载入目录时面板仅多「厂商/数量」输入（两者均可手填），导出下拉新增 4 项（CSV 报价 / Excel 报价 / 导出目录 / 删除目录），既有导出项不变。报价 CSV/XLSX 从 5 列扩为 7 列（末两列「目录版本 / 导出时间」，仅合计行有值；数据行后两格为空）；导出同时写 IndexedDB `quote:last` 快照，行集合不变时复用冻结单价。`bomGroups` 未作为独立 API 暴露：BOM 聚合由 `quoteAggregate` 完成、`quoteTable` 只做列映射，避免第二套聚合/字段路径。

影响范围：`siteHandleList/siteAreaPerimeter/siteBoundaryPoints/siteShapeCenter` 保留旧签名（可直接传旧 `kind` 矢量 background 对象），`scripts/selftest.mjs` 的既有断言不需要改写调用方式；`resizeSiteByHandle(h,p)` 是写 `state.site` 的薄包装，新代码应优先用 `siteHandleDragTo(site,h,p)`，它不读全局、便于单测。删除重复后 `render.js` 不再声明 `siteBoundaryPoints/siteShapeCenter/siteAreaPerimeter/siteBasePoint/siteRadiusText`，`interaction.js` 不再声明 `siteHandleList/resizeSiteByHandle`——同名函数只保留 `geometry.js` 一份，避免两份实现漂移。

Phase 2B 影响范围：`renderNodeEditor(o, opts)` 新增可选第二参数，省略时行为与旧实现一致（对象节点行 DOM 不变）；场地多边形改用它生成 `data-node-*` 行，`props.js` 内不再有 `data-site-node-*` 这一套。`bindNodeEditorEvents(box, spec)` 统一接管节点坐标输入与增删/排序按钮，业务对象与场地只提供各自的提交回调。`pickScreenHandle` 统一对象/场地手柄的屏幕命中阈值（9px），`handleAt` 与 `siteHandleAt` 不再各写一份循环。`siteIsVisible/siteIsLocked` 现在叠加所属图层的可见/锁定状态，**会影响所有依赖这两个判定的调用点**（取景框、渲染、手柄守卫、拖拽守卫）：图层隐藏时场地不出现在取景框，图层锁定时场地不可编辑，这是与业务对象一致的预期行为。CSS 中不再使用的 `.node-row.vtx` 模板一并删除。

标注开关搬迁影响范围：`ui-shell.js` 的设置弹窗不再渲染 `setLabels / setSegLen / setAreaTag / setSiteNodes / setSiteSegLen / setSiteBase / setSiteRadius / setSiteArea / setSitePerimeter` 这些控件；`index.html` 顶部工具栏的全局「标签」复选框（`id="showLabels"`）同步移除，`ui-panels.js` 的绑定与 `refreshUI()` 回填一并删除。`state.settings` 的 `showLabels / showSegLen / showAreaTag` 与六个 `site*` 键仍保留：前者继续作为未单独配置对象的缺省值，后者改由场地属性面板写入；旧工程无需迁移，`persistence.js` 的清洗逻辑不变。对象面板的 `renderAnnotToggles` 与场地面板的 `renderSiteAnnotToggles` 共用 `annotToggleGroupHTML` 模板（`data-annot` / `data-site-annot` 区分回写目标），事件绑定统一走 `bindAnnotToggleInputs`，禁止再写第二套循环。

`openModal(title, body, buttons, opts)` 新增可选第四参数 `opts.onClose`（Esc / 遮罩 / 页脚按钮统一走 `closeModal` 时回调），既有三参调用行为不变；快照对比用它确保叠加高亮不会在弹窗关闭后悬挂。`deleteProjectById` 现在额外调用 `deleteSnapshotsForProject(id)`（快照键独立命名空间，只删该工程记录，不影响其它工程与工程主记录）。

屏幕标签定位影响范围：`drawScreenTag` 的夹边尺寸改由 `surfaceCssSize` 提供——DOM 画布仍读 `clientWidth/clientHeight`，行为不变；离屏静态层与 PNG/PDF 导出画布在创建时用 `markSurfaceSize` 登记逻辑尺寸。离屏 canvas 不在文档中，`clientWidth` 恒为 0，此前会把节点坐标/段长等标签压到画布左上角 (2,2)。**后续新增任何离屏画布并调用 `drawScene` 的代码，必须同样登记尺寸**，否则同类标签会再次堆到原点。

## 加一个新功能时

1. 判断它属于哪一层（多数新功能进 `js/features/`）；
2. 在那一层里建文件，写一行 `/* 文件名.js —— 职责 */` 文件头（`conventions.json` 要求恰好一行）；
3. 按层序插进 `index.html`；
4. 跑 `npm run ci`——层序错了会在这一步红，而不是等功能第一次被用到时 `undefined`。
