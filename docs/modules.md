# 模块目录（MODULES）

本文件逐文件回答：**它负责什么、对外暴露什么、依赖谁、被谁调用、必须守住什么、哪里容易踩坑**。设计层面的取舍见 [ARCHITECTURE](ARCHITECTURE.md)，功能边界见 [features](features.md)。

> 口径：45 个浏览器脚本（`js/` 35 + `ngm.vendor/` 10）+ 19 个 `.mjs` 脚本 + 1 个构建清单 + 44 个测试文件。除插件外没有模块系统，脚本按 `index.html` 顺序加载，顶层 `function/const/let` 都是全局符号；下表的"接口"即这些全局符号。最后核对：2026-11-08。

## 分层与加载顺序

| 顺序 | 层 | 目录 | 文件数 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | vendor | `ngm.vendor/` | 10 | `@idcu/*` 源码，挂到 `__idcu*` 全局；只许经 `ensureVendor` 取用 |
| 2 | 公共 | `js/common/` | 8 | 零 DOM 的算法、协议与适配器 |
| 3 | 核心 | `js/core/` | 12 | 常量、状态、几何、渲染、交互、持久化 |
| 4 | 特性 | `js/features/` | 14 | UI 与业务流程 |
| 5 | 启动 | `js/core/app.js` | 1 | 最后加载，组装并启动 |

`scripts/check.mjs` 的分层步骤校验目录归属与入口顺序；它不做静态跨文件引用分析。特性层可以回调核心层提供的提交协议，核心层不应主动依赖特性层的内部实现。

## js/common（8 个）

| 文件 | 职责 | 对外接口 | 依赖 → 被依赖 | 关键不变量 / 已知坑 |
| --- | --- | --- | --- | --- |
| `content-assets.js` | 内容寻址资产：IndexedDB 存取、引用收集、孤儿清理 | `ContentAssets.idFor / dataUrlToBytes / bytesToDataUrl / collectAssetRefs / open`（返回 `put/get/putId/getId/removeId/allKeys/prune/put`） | 浏览器 IndexedDB → 持久化、导入、快照、导出 | `collectAssetRefs` 只扫**单个工程对象**里的 `background.assetId`；历史帧、剪贴板、拖拽原件、快照必须由调用方并集补充，否则会误删可达资产。`prune` 只删不在 `keepIds` 的键，失败时调用方必须整体放弃清理。 |
| `dxf.js` | DXF 文本解析/生成、版本与单位、补充实体、可导入性检查 | `Dxf.parseDxf / parse / inspect / supplementalEntities / scaleParsedEntities / unitLabel / unitFactor / VERSION_NAMES / CORE_TYPES / SUPPLEMENT_TYPES / UNITS` | 纯文本算法 → `io-import`、`io-export`、selftest | 解析有实体数与嵌套深度上限；AC1032 的补充实体只做"可见性保留"，不保证完整语义。未知单位返回 `unitFactor=1`，导入时必须提示而不是静默按米处理。 |
| `i18n.js` | 中英文案、插值、运行时替换 | `I18N.t / p / fmt / setLang / apply / dict / phrases / templates / lang`；全局简写 `L` | 纯数据 → 全仓 UI | `L` 只做文本插值，**不转义 HTML**；插入 `innerHTML` 前必须过 `esc` / `xmlEscape`。缺键时回退原文，可能把中文带到英文界面，i18n 扫描门禁负责拦截新增硬编码。 |
| `merge.js` | 离线工程合并：对象/楼层/场地/图层/类型的 LWW + 墓碑 | `mergeProjectData(currentRaw, incomingRaw)`，内部 `mergeFloorMeta / mergeFloorObjects / mergeObjectSig / mergeStable` | 纯函数 → `mergeProjectJSON`、协作 | `A=当前`、`B=导入/远端`；对象签名忽略 `z`（叠放顺序不传播）；不修改入参。楼层墓碑 `deletedAt >= 两侧最后写入` 时整层删除，且合并结果至少保留一层。 |
| `pdf-read.js` | PDF 解析、页序恢复、逐页内嵌图映射（像素流） | `PdfRead.parsePdf / layoutPdfPages / PT_TO_METER / tokenizeContent / looksLikeCidGarbage / LIMITS` | `ngm.vendor` PDF 核心 + `Zip` → `io-import` | CID 字体可能解出乱码，`looksLikeCidGarbage` 只做判定与告警；导入只取第 1 页（`pages[0].imageNums` 供底图定位），`layoutPdfPages` 保留为通用工具但导入不再使用。 |
| `pdf.js` | 将 vendor PDF 图像能力适配为 `global.Pdf` | `Pdf` | vendor `pdf-image` → `io-export` 的位图 PDF | 薄适配层，本身不含逻辑。旧文档未登记此文件，但它**不是死文件**：`io-export` 经 `ensureVendor('Pdf')` 调用。PDF 导出是整页位图。 |
| `qr.js` | 二维码编码与 SVG 渲染（协作邀请、导出标签复用） | `Qr`（含 `MAX_BYTES`、`byteLength`） | 纯算法 → 协作、导出 | 容量按固定 Version 3-M，`MAX_BYTES=42`；超出时必须由调用方改用可粘贴文本，禁止渲染不可扫描的假二维码。 |
| `symbols.js` | 内置 36 个线性符号、分类/别名搜索、自定义 SVG 清洗、DXF 折线近似 | `SYMBOL_LIBRARY / SYMBOL_CATEGORIES / SYMBOL_LIMITS / parseSvgSymbol / buildSymbolIndex / searchSymbols / symbolPathsFor / symbolPolylinesInWorld / customSymbolsFromTypes / sanitizeSymbolBundle` | 纯函数 + SVG 解析 → 渲染、导出、类型面板 | 自有 SVG 上限 64KB / 200 元素 / 深度 16 / 200 path / 单 path 5000 字符；禁止 `script`、事件属性、外部引用。DXF 用 `symbolPolylinesInWorld` 做折线降级，必须在导出报告中说明。 |

## js/core（13 个）

| 文件 | 职责 | 对外接口 | 依赖 → 被依赖 | 关键不变量 / 已知坑 |
| --- | --- | --- | --- | --- |
| `config.js` | Schema/存储名/资源上限、vendor 注册表、内置类型与图标白名单 | `SCHEMA / SCHEMA_READABLE / LS_KEY / SETTINGS_KEY / DB_NAME / DB_VERSION / APP_LIMITS / ensureVendor / VENDOR_LABELS / TYPE_ICONS / BUILTIN_TYPES / normalizeIcon / importLimitErrors / importLimitMessage` | 无 → 全仓 | 先于其他核心脚本加载；`APP_LIMITS` 是唯一阈值源，新增限制先加这里。`ensureVendor` 找不到模块时返回明确错误，不允许静默 undefined。 |
| `model.js` | 全局状态、内置类型、对象编号、注解开关、历史快照、标题栏/规则默认值 | `state / history / clipboard / draft / selectedIds / currentTool`；`createInitialState / uid / objectIndexById / objectNameScopeFor / beginObjectNameScope / withObjectNameScope / snapshotHistoryState / materializeHistoryState / baseObject / getType / layerOf / styleVal / annotOn / setAnnot` | `config`、`geometry` → 几乎所有模块 | `state` 是单一可变源；整体替换（载入/新建）后必须 `afterStateLoaded()`。`objectIndexById` 对重复 id 保留第一个，不覆盖。编号作用域必须 `try/finally` 恢复，否则后续编号会串。历史快照按引用共享未变化容器，禁止对快照做就地修改。 |
| `viewport.js` | 世界↔屏幕映射、取景框、缩放/平移、画布尺寸、指针换算 | `computeWorldFrame / worldFrame / worldDims / resetFrameRef / syncFramePan / view / w2s / s2w / resizeCanvas / fitView / zoomAt / niceStep / gridDisplayStep / snapPoint / pointerWorld / pointerScreen` | `model`、`geometry-site`、`geometry-transform` → 渲染、交互、导出 | 取景框缓存 `_frameRef`：场地/底图变化后不 `syncFramePan` / `resetFrameRef` 会导致映射漂移。`zoom` 是"像素/米"而非倍率。`gridDisplayStep` 必须是 `gridSize` 的整数倍，`niceStep` 只用于比例尺。旧文档未登记此文件，但它**不是死文件**，全仓高频调用。 |
| `geometry.js` | 二维几何、形状参数、轮廓、吸附/参考线、对齐分布、格式 | `__geo`（`add/sub/mul/dist/rotatePoint/polygonArea/...`）、`collectSnapCandidates / findOsnap / directionalSnap / shapeWorldPoints / outlineOf / shapeArea / shapePerimeter / translateObject / alignObjects / distributeObjects / convertAreaShape / fmt` | 纯函数 → 交互、渲染、属性、导出、规则 | `outlineOf` 是画布/SVG/DXF 的共同几何源，改动会改变导出顶点数，必须先建 golden。吸附优先级由 `OSNAP_PRIORITY` 统一，新增捕捉类型要同时补图例与 selftest。 |
| `geometry-site.js` | 场地域/包围盒/节点/手柄/面积周长；图片手柄与仿射构造 | `siteDomainOf / siteBounds / siteOutlinePoints / siteShapeCenter / siteAreaPerimeter / siteHandlesOf / siteHandleList / siteHandleDragTo / resizeSiteByHandle / rectShapeFromCorners / circleShapeFrom / ellipseShapeFromCorners / sectorShapeFrom / polygonShapeFromPoints / imageHandleList / affTranslate / affRotateAbout / affScaleAbout / affShearAlong / imageHandleDragTo` | `geometry` → 渲染、交互、属性、导出、裁剪 | `siteBounds` 是场地唯一包围盒源；增删形状类型必须同时补 `siteDomainOf`、手柄、面积周长与导出。旧签名重载必须保留，selftest 直接断言这些函数。场地优先：校准不自动迁移场地。 |
| `geometry-coverage.js` | 视场覆盖、栅格计划、盲区、布点优化 | `cameraFootprint / coverageGridPlan / analyzeCoverage / blindSpotRects / blindSpotRectArea / blindSpotArea / optimizeCameraPlacement` | `APP_LIMITS`、`geometry` → 面板、导出、规则 | 格数来自 `APP_LIMITS.COVERAGE_TARGET_CELLS` 的 `coverageGridPlan`，**不能按视口实时分配**，否则缩放会改变覆盖率结果。隐藏图层不计入统计。5000×5000m 单次分析有 <300ms 的自测阈值。 |
| `geometry-transform.js` | 图片像素↔世界、仿射求解/组合/求逆、世界整体变换与对象迁移 | `defaultImageTransform / imageTransformOf / bgPixelToWorld / bgWorldToPixel / imageCornerWorld / affApply / affMul / affInv / solveImageAffine / validImageTransform / imageWorldFrame / migrateObjectsByAffine / applyWorldTransform` | `geometry`、`geometry-site` → 导入、交互、导出 | `applyWorldTransform` 默认 `site:false`，这是"场地不随图片校准迁移"的实现点；显式 `site:true` 才迁移。2×3 仿射无法表达四角透视，图片只提供平移/旋转/等比缩放/切变。 |
| `interaction.js` | 指针/触摸/键盘、工具切换、捕捉、草稿、校准、剪贴板、帮助面板 | `setTool / resolveWorldPoint / calibPrecheck / refreshCalibStatus / cancelActiveDrag / deleteSelected / duplicateSelected / copySelected / pasteClipboard / keyboardRegion / flushBeforeUnload / openShortcutsHelp` | 状态、几何、渲染、持久化 → 启动 | `calibPrecheck` 是所有校准入口的唯一判定源，三处入口不得各写一套条件。拖拽必须在 `pointercancel / lostcapture / Esc` 走 `cancelActiveDrag`，否则会残留并污染下一次历史。`sameSerializable` 忽略 `updatedAt`，用于拖拽起止比较，误改会导致"没动也落盘"。 |
| `persistence.js` | 保存/恢复、迁移、楼层、资产回收、历史、墓碑、工程库副本、合并落盘、自测注入 | `pushHistory / undo / redo / markDirty / sanitizeReport / stampObjects / commitChange / commitObjectEdit / scheduleSave / auditProject / buildProject / migrateProject / buildDemoProject / mergeProjectJSON / switchFloorData / markTombstone / sanitizeObjects / sanitizeSite / reachableBgAssetIds` | `model`、`config`、`content-assets`、几何 → 启动、特性层 | `pushHistory()` 由调用方在变更前显式调用，不是自动钩子。`markDirty` 的 profile 决定"刷新 UI / 广播 / 入历史"，选错会导致过度重绘或协作漏发。保存失败必须分类：配额不重试，瞬时错误 1/3/9s 重试。资产回收的命名空间必须并集覆盖，漏一个就会删掉仍在用的图。 |
| `render.js` | Canvas 渲染、静态层缓存、覆盖率/标注/手柄/差异叠加 | `drawScene / requestRender / invalidateStatic / sceneStaticKey / ensureStaticLayer / visibleWorldRect / markSurfaceSize / surfaceCssSize / drawBackground / drawSite / drawCoverage / drawSiteAnnotations / drawObject / drawDimension / drawDiffOverlay / drawCalibration` | 状态、视口、几何、符号、i18n → 启动、交互、导出 | `sceneStaticKey` 必须包含 `site`、底图 transform、设置、选中态与覆盖率摘要；漏字段会留下过期像素。导出走 `interactive=false` 的全量路径，不读缓存；`markerScale!=1` 也强制全量。静态层重建后必须 `markSurfaceSize()`。 |
| `snapshot.js` | 版本快照的序列化/存取/淘汰/差异分类/叠加数据 | `SNAPSHOT_PREFIX / snapshotKey / snapshotProjectData / snapshotAssetRefs / diffSnapshots / diffOverlay / setDiffOverlay / diffCategoryOf / objectDiffFields` | `persistence`、`model` → 快照面板、导出 | 快照存 `assetId` 引用，不能复制 base64。上限 20 条 / 16MB，超出淘汰最旧且至少留 1 条。差异按对象 id 匹配，分类优先级为新增 > 删除 > 换楼层 > 类型变更 > 移动 > 属性修改；场景级追加场地/底图/楼层名/图层名/类型表结构，旧快照缺 `objectTypes` 时跳过类型表对比；内部不可变字段必须忽略。 |
| `tab-lease.js` | 同工程多标签的编辑租约（BroadcastChannel + localStorage 心跳） | `acquireEditorLease / releaseEditorLease / leaseSaveBlocked / leaseStatus / onLeaseConflict / LEASE_TTL_MS / LEASE_HEARTBEAT_MS` | `model`、持久化 → 启动、保存 | 租约按 `state.meta.projectId`（工程库绑定 id）归组；未绑定工程为空串，多个未绑定标签会被视为同一工程——是否符合预期**待确认**。租约冲突时只暂缓保存，不丢内存编辑。 |
| `app.js` | 启动编排：设置、恢复工程、首启引导、能力探测、SW、租约、卸载前落盘 | 无对外函数（`DOMContentLoaded` 执行） | 全部 | 必须最后加载。启动顺序改变会影响 `afterStateLoaded`、首启引导与 SW 注册；新增启动步骤要同步 selftest/e2e 的"加载 45 个脚本"断言。 |

## js/features（14 个）

| 文件 | 职责 | 对外接口 | 依赖 → 被依赖 | 关键不变量 / 已知坑 |
| --- | --- | --- | --- | --- |
| `catalog.js` | 产品目录 schema 校验、IndexedDB 存储、版本指纹、JSON 导入导出 | `CATALOG_SCHEMA / currentCatalog / catalogValidate / catalogVersion / importCatalog / catalogLoad / deleteCatalog / exportCatalogJSON` | `idbGetKey/idbPutKey`、`toast/safeName/downloadBlob` → 报价、面板 | 导入必须**先校验后写库**，失败不得污染现有目录；厂商+型号唯一，单价 0–1e9，型号上限 2000。目录版本用 FNV-1a 指纹，供报价快照追溯。 |
| `collab.js` | 同机标签 BroadcastChannel、跨设备 WebRTC、分片/去重/TTL、邀请串与二维码、冲突提示 | `collabStartLocal / collabSendObject / collabHandleMessage / collabOnLocalChange / collabInviteEncode / collabInviteDecode / collabQrFit / openCollabPanel`；常量 `COLLAB_CHUNK / COLLAB_INVITE_PREFIX / COLLAB_INBOUND_*` | `mergeProjectJSON`、`Qr`、持久化、`toast` → 面板、启动 | 分片 48,000 字符，入站 TTL 30s、64 键 / 16MB；SDP 只含 ASCII 用 base64。邀请串超出 QR 容量时必须降级为文本。收到远端工程先合并再落盘；本地未同步修改不能因断线丢失。当前**没有自动重连**（已确认为产品缺口 RT-P1-01，由计划 N-16 修复）。 |
| `io.js` | 新建工程、工程库、楼层管理、底图/文件导入入口 | `openFloorManager / openProjectLibrary / BG_KIND_LABELS`；按钮绑定 `newBtn / clearFloorBtn / importBtn / projBtn / floorBtn` | `io-import`、持久化、`ui-shell` | 新建工程会重置 `state/history`，只能回收"任何命名空间都不再引用"的资产。清空楼层必须先 `pushHistory`（Ctrl+Z 可整体撤销），不得留幽灵数据。 |
| `io-export.js` | 8 种导出、标题栏/比例尺/图例、PDF 报告分页、SVG/DXF 生成 | `downloadBlob / exportDelimited / exportXlsx / exportPNG / exportSVG / exportDXF / exportPDF / exportLabelSheet / exportBlindSpotsGeoJson / titleBlockSpec / drawTitleBlockOnCanvas / exportTitleBlockSvg / buildSceneSvg / dxfEntitiesForExport / pdfPagePlan` | `io-fields`、`dxf`、`pdf`、`qr`、`symbols`、`render`、`content-assets` → 顶栏、报价、规则 | 所有导出必须复用 `guardFormula` 与 `EXPORT_FIELD_DEFS`，不得另起表头。标题栏/图例默认关闭，关闭时产物必须与旧 golden 字节一致。PDF 是整页位图；DXF 符号折线降级。新增格式必须补 golden 与"不增体积"验证。 |
| `io-fields.js` | 导出字段描述表、CSV/TSV/XLSX 渲染、报价与盲区字段、尺寸测量 | `EXPORT_FIELD_DEFS / EXPORT_FIELD_BY_KEY / TABLE_COLUMNS / LEDGER_FIELDS / buildExportRow / exportParamText / xlsxExportTable / dimensionMeasure / QUOTE_FIELD_DEFS / quoteTable / buildBlindSpotGeoJson` | `geometry`（角度/面积）→ 导出、表格、报价；自身提供 `guardFormula` | 字段表是 CSV/TSV/XLSX/PDF/SVG/DXF 的共同源；改字段名会同时改变所有产物，必须说明影响面。`guardFormula` 对 `= + - @` 前缀做防注入，导出格式不得绕过。 |
| `io-import.js` | 图片/DXF/DWG/PDF/SVG 导入、单位与保真提示、场地选择与底图缩放 | `extOfFile / dwgVersionInfo / pickConvertedFile / applyDxfImport / applyVectorSite / backgroundScalePlan / openSitePicker` | `pdf-read`、`dxf`、`geometry-transform`、`model`、`ui-shell` | DWG 需要外部转换器，缺转换器必须给明确原因而不是当作 DXF。DXF 保真度要列出"保留/降级/丢弃"；PDF 只导入第 1 页并在多页时提示页数。导入失败必须事务化回滚。 |
| `io-table.js` | CSV/TSV/XLSX 表格预览、批量布点、条件批量替换 | `showTableImportPreview / applyTableImport / rowsToObjectsPlan / applyRowShape / applyLedgerCells / rowMatchesObject / checkRowGeom` | `io-fields`、`model`、几何、`ui-shell` | 严格模式整批事务化：任一行非法则整体失败，不允许半量写入。坐标/楼层/类型/编号解析规则必须与清单展示一致；布尔与数字解析不得用 `parseInt` 近似。 |
| `parking.js` | 停车位规划：沿边布置、角度/间距、预览与落图 | `PARKING_LAYER / parkingLayout / parkingSite / parkingOptionsFromInputs / openParkingPlanner / ensureParkingLayer / applyParkingLayout` | `geometry-site`、`model`、`render`、`ui-shell` | 自动创建 `PARKING_LAYER` 但不得覆盖同名业务图层；落图必须一次性 `commitChange`，不能逐位保存。旧文档未登记此文件，但它**不是死文件**：`index.html` 的 `parkingBtn` 在文件末尾绑定。 |
| `plugins.js` | 插件 API、清单校验、类型/导出器/导入器/规则注册表、Worker 沙箱、插件面板 | `PlotPin`（23 个契约键）、`exportViaPlugin / importViaPlugin`；内部 `PLUGIN_API_VERSION / PLUGIN_CAPABILITIES / loadPlugin / validatePluginManifest` | `model`（类型/对象清洗）、`rules`、`io-export`、`ui-shell` → 启动、面板 | API 1.1.0，只接受主机兼容版本；能力 8 项白名单。沙箱 Worker 删除网络/存储/Worker/self 等入口，单次 2000ms 超时并 `terminate`。清单 192KB、代码 64KB。注销被对象使用的类型必须拒绝。 |
| `props.js` | 属性面板：单对象/多选、场地与图片属性、节点编辑、标注开关 | `renderProps / renderMultiProps / renderSiteProps / imagePropsHTML / renderNodeEditor / bindNodeEditorEvents / applyField / rotateSelected / renderAnnotToggles / renderSiteAnnotToggles` | `model`、几何、`persistence`、`ui-panels` | 所有写回必须走 `commitObjectEdit` 并先 `pushHistory`；批量标注开关复用单对象字段，不得新增平行状态。旋转/位移输入要保留数值宽度与 44px 触控目标。 |
| `rules.js` | 几何规则检查：重叠/最小间距/越界、配置 UI、违规列表/定位/CSV | `RULE_REGISTRY / registerRule / unregisterRule / listRules / runRuleCheck / ruleOverlapCheck / ruleSpacingCheck / ruleBoundsCheck / ruleViolationsCsv / renderRuleConfig / ruleRunAndRender` | `model`、几何、`io-fields`、`ui-shell` → 面板、插件 | 只做几何检查，**不是消防/规范审图**，阈值由用户填写。违规上限 5000；对象重叠要排除相邻贴合容差；越界区分完全/部分。配置存 `state.rules` 随工程保存，旧配置按 `RULE_CONFIG_VERSION` 归一。 |
| `snapshot-ui.js` | 快照面板、差异分类文案、叠加开关、回滚确认 | `DIFF_CATEGORY_LABELS / snapSizeText / snapTimeText / snapLabel / snapDiffFieldText / snapSelectOptions / openSnapshotManager / openSnapshotCompare` | `snapshot`、持久化、`ui-shell` → 面板 | 叠加只在当前楼层绘制，不参与静态缓存、不进入导出。回滚前必须二次确认并 `pushHistory`；快照删除不得影响工程。 |
| `ui-panels.js` | 页签、对象清单、图层、类型、符号面板、统计、覆盖率入口、总刷新 | `switchTab / renderList / renderLayers / renderTypes / renderSymbolPanel / renderStats / runCoverageAnalysis / refreshUI / populateSelects` | 状态、渲染、几何覆盖、符号、属性、规则 → 启动、全仓 | `refreshUI` 是提交后的统一刷新入口；新增面板状态要在此接入，否则撤销/切层后不刷新。选中态不能在刷新中丢失。大批量清单渲染不得阻塞主线程超过既有基准。 |
| `ui-shell.js` | 弹窗/toast/转义、i18n 运行时替换、首启引导、加载救援与保存失败横幅、示例工程 | `openModal / closeModal / showConfirm / showPrompt / toast / esc / xmlEscape / modalBody / safeHTML / showFirstRunGuide / openDemoProject / showLoadAuditBanner / showSaveFailureBanner / showLeaseConflictBanner / refreshI18nRuntimeText` | `model`、持久化、i18n → 全仓 | `esc` 用于 HTML 文本/属性，`xmlEscape` 用于 SVG；两者不可互换。首启状态键 `plotpin:firstRunGuide:v1`，仅 completed 永久抑制、skip 下次仍展示。示例工程不得引用图片资产。 |

### 文档盲区核对

- `js/common/pdf.js`、`js/core/viewport.js`、`js/features/parking.js` 在旧文档中没有独立条目，但三者都被入口加载且存在真实调用：`pdf.js` 经 `ensureVendor('Pdf')` 被 `io-export` 使用；`viewport.js` 的 `w2s/s2w/computeWorldFrame` 被渲染/交互/导出高频调用；`parking.js` 绑定 `#parkingBtn` 并在 selftest 中有停车布局断言。它们不是死文件。

## scripts（20 个）

| 文件 | 作用 | 输入/输出 | 调用位置 |
| --- | --- | --- | --- |
| `check.mjs` | 零依赖工程质量门禁（13 步） | 读仓库 → 退出码；`--selftest` 追加逻辑自测 | CI、`npm run lint` |
| `selftest.mjs` | 逻辑层自测（3,631 断言 / 136 分区，覆盖几何/迁移/导出/合并/安全等；数字见 `docs/facts.md`） | 读源码/构造状态 → PASS/FAIL | `check --selftest`、`npm test` |
| `bench.mjs` | 渲染性能基准（Node 桩 + P95/heapUsed/静态重建阈值） | 2000 对象场景 → 指标与门禁 | CI、`npm run ci` |
| `build.mjs` | 单文件 HTML 打包、体积上限、`--check` 字节比对、SHA256、dist-manifest | `index.html` → `plotpin.html` + manifest | CI、`npm run build` |
| `check-gates.mjs` | 门禁的牙齿：先跑正面基线（未破坏副本必须全绿），再构造 10 种人为破坏并断言对应门禁变红 | 仓库副本 → 通过/失败 | CI |
| `check-ngm.mjs` | vendor 接线自检：清单/锁/版本文件/模块存在性、消费方导出，以及 vendor 实际字节 ↔ `scripts/ngm-vendor-digest.json` 逐文件 sha256；`--update-vendor-digest` 重写清单 | `ngm.json / ngm.lock / .ngm-version / ngm.vendor` → 报告 | CI、`npm test` |
| `check-contracts.mjs` | 契约判据：版本源、i18n 键、文件头、枚举与 `contracts/conventions.json` 一致 | 仓库 → 报告 | `check.mjs` |
| `check-plugin-api.mjs` | 运行时 `PlotPin` 键集合与 `contracts/plugin-api.json` 一致 | 源码/契约 → 报告 | `check.mjs` |
| `check-deletions.mjs` | 结构性删除账本：`docs/deletions.md` 与代码中删除标记一致 | 文档+代码 → 报告 | `check.mjs` |
| `check-sw.mjs` | SW 缓存版本门禁：预缓存输入相对 HEAD 变化必须递增 `VERSION` | git 索引 + `sw.js` → 报告 | CI |
| `badge.mjs` | 断言数注入/校验 README 三处锚点 | `selftest` → README | `check.mjs`、CI、`npm run badge` |
| `i18n-scan.mjs` | 中英文案覆盖率扫描与 `--check` 基线 | `js/`、`index.html` → 报告 | `check.mjs`、CI、`npm run i18n:scan` |
| `check-discipline.mjs` | 方法论自检看板（13 问；`--strict` 要求 L3/L4） | 仓库+git → 看板 | CI、`npm run discipline` |
| `e2e.mjs` | Playwright 入口；依赖缺失时以明确原因跳过（退出码 2） | 参数 → 浏览器测试 | `npm run test:e2e` |
| `perf-browser.mjs` | 真实 Chromium 性能基线入口（不在 `npm run ci` 路径） | 页面 → 基线数据 | `npm run perf:browser` |
| `serve.mjs` | 零依赖静态服务器 | `HOST/PORT` → `127.0.0.1:4173` | 本地/e2e |
| `pack-core.mjs` | 单文件打包纯函数（便于自测） | 输入文件 → HTML 文本 | `build.mjs`、selftest |
| `minify-core.mjs` | 构建期无损压缩纯函数 | 文本 → 压缩文本 | `build.mjs`、selftest |
| `size-report.mjs` | 发行包体积组成/重复/死代码统计（基于 dist 分块实测，源文件潜在值仅作参考）；输出体积余量与 gzip 阈值判断 | `plotpin.html` → 报告 | 体积专项 |
| `lib/budget.mjs` | 体积预算单一来源：`MAX_BYTES` / gzip 阈值 / 余量分级预警 | 字节 + gzip → `ok/warn/error` | `build.mjs`、`size-report.mjs` |
| `lib/fs-utils.mjs` | 门禁共享工具：递归遍历（`ext` / `exts` / `skip` / `skipDir`）与 JSON 读取 | 目录 → 文件列表；文件 → 对象 | `check*.mjs`、`build.mjs`、`badge.mjs` |
| `dist-manifest.json` | 构建产物清单：入口、字节、gzip、sha256、上限 | `build.mjs` 写入 | README 体积口径、CI 比对 |

> 脚本层没有"20 个 .mjs"；实际是 `scripts/*.mjs` 19 个 + `scripts/lib/*.mjs` 2 个 + `dist-manifest.json` 共 22 个文件。新增脚本要同步 `package.json`、`check.mjs` 或 CI，并避免把开发期依赖带进发行包。

## tests（55 个）

### e2e 用例（35 个 spec）

| 文件 | 覆盖场景 |
| --- | --- |
| `batch-annot.spec.mjs` | 批次标注显隐：勾选两对象统一隐藏→撤销→统一显示，SVG 同步变化 |
| `batch-layout.spec.mjs` | 1280×800 桌面布局：控件不挤压、数值输入可读 |
| `calibration-precheck.spec.mjs` | D-02：无底图无场地时三个校准入口禁用且无点击路径 |
| `catalog.spec.mjs` | 目录导入→绑定型号/数量→跨楼层 BOM→CSV/XLSX→报价快照与重名防护 |
| `collab.spec.mjs` | 双标签建连、状态从等待→已连接→对端断开可见 |
| `coverage.spec.mjs` | 覆盖率 v2：4 个缩放级别一致、隐藏图层不计入、报告标注口径 |
| `csp.spec.mjs` | 注入路径 1/4：恶意 `type.name/icon` 不执行 |
| `dxf-version.spec.mjs` | B-03：AC1032 混合实体导入、版本与补充实体可见 |
| `export-scope.spec.mjs` | N-05：台账全量+「显示」列=有效可见，图纸类只含可见对象；草稿/校准不进 PNG/PDF |
| `help-center.spec.mjs` | D-03：帮助中心三页签与焦点回归 |
| `history-increment.spec.mjs` | B-10：20 条含照片历史相对整份深拷贝 heap 下降 ≥50%（真实 Chromium） |
| `history.spec.mjs` | 撤销/重做后刷新仍保持正确状态（落盘语义） |
| `i18n-template.spec.mjs` | 英文界面整句插值生效；用户输入只作文本、不注入 DOM |
| `interaction.spec.mjs` | 单击选中不落盘、不清覆盖率、不留空撤销快照 |
| `load-audit.spec.mjs` | D-07：损坏 current 时横幅、救援期间不覆盖、可导出原文 |
| `mobile.spec.mjs` | 移动视口基本操作 |
| `onboarding.spec.mjs` | 首访三步引导；空白开始后持久化、刷新不再打扰 |
| `pdf-multipage.spec.mjs` | B-13：多页 PDF 只导入第 1 页、页数与单页提示、底图入库 |
| `perf-render.spec.mjs` | B-11：真实 Chromium 渲染基线（2000 对象 / 1600×900） |
| `persistence.spec.mjs` | IndexedDB v1→v2：迁移写回 v2、楼层补 `updatedAt`、不丢楼层/对象 |
| `plugin-compat.spec.mjs` | D-06：版本矩阵，预检回传 major/minor，越界/畸形给可读原因 |
| `plugin-manifest.spec.mjs` | D-05：合法清单导入、导出器可用、面板可见、卸载后撤销 |
| `plugin-sandbox.spec.mjs` | 恶意插件：主版本不兼容/缺失 apiVersion 均不创建 Worker；逃逸与死循环被阻断 |
| `rule-plugin.spec.mjs` | D-04：受信任插件注册规则，来源可见、产出违规、注销后消失 |
| `rules.spec.mjs` | C-05：重叠/越界/间距，改配置→重查→违规数变化，点击定位与 CSV |
| `save-failure.spec.mjs` | D-08：配额错误不重试、横幅与手动导出可用、内存编辑不丢 |
| `smoke.spec.mjs` | 页面加载无脚本错误、CSP 生效、画布就绪 |
| `snapshot.spec.mjs` | 快照：1000 对象生成 <2s、照片只存引用、删除快照不影响工程 |
| `sw.spec.mjs` | SW 注册、缓存名带版本、旧缓存清理、断网仍可打开 |
| `symbols.spec.mjs` | C-04：别名搜索、分类筛选、放置与旋转/尺寸 |
| `tab-lease.spec.mjs` | D-09：同工程双标签 6s 内横幅、暂缓保存、确认租约与释放 |
| `table-batch.spec.mjs` | B-08：表格批量布点 + 条件批量替换，严格模式整批事务化 |
| `title-block.spec.mjs` | B-07：配置标题栏→导出 SVG 回读文字→PNG/PDF 同链路可用 |
| `world-transform.spec.mjs` | B-12：缩放世界后对象与底图像素同屏不动，场地保持真值参考 |

### 支撑文件（11 个）

| 文件 | 作用 |
| --- | --- |
| `e2e/helpers.mjs` | 浏览器测试公共工具：IndexedDB 预置、首启引导键、画布落点 |
| `e2e/helpers/scenes.mjs` | 渲染/移动端共用的 2000 对象场景，避免两套样本口径漂移 |
| `fixtures/legacy-symbols.json` | 旧版符号包兼容夹具 |
| `fixtures/sw-test.html` | SW 离线/缓存版本测试页 |
| `golden/fixed-pages.pdf` | 多页 PDF 固定页序基线 |
| `golden/legacy-symbols.svg` | 旧版符号渲染基线 |
| `golden/plain-scene.svg` | 无符号场景 SVG golden |
| `golden/plain-scene.dxf` | 无符号场景 DXF golden |
| `golden/symbol-scene.svg` | 含符号场景 SVG golden |
| `golden/symbol-scene.dxf` | 含符号场景 DXF golden（折线近似） |
| `perf/browser-baseline.perf.mjs` | 真实浏览器性能基线用例（与 `perf-browser.mjs` 配合） |

> golden 只应随**有意的行为变更**更新；更新时必须在同一个提交里说明差异原因，禁止为了让用例变绿而重写基线。

## 新增模块的登记规则

1. 放进正确层：零 DOM 放 `common`，状态/几何/渲染/持久化放 `core`，UI/业务流程放 `features`。
2. 在 `index.html` 的对应位置插入 `<script>`，`check.mjs` 会校验入口引用与分层。
3. 复用既有公共抽象（`APP_LIMITS`、`siteBounds`、`outlineOf`、`EXPORT_FIELD_DEFS`、`objectIndexById`、`ensureVendor`），不得复制粘贴第二份。
4. 在本文件补一行；若改变公共 API 或行为，同时在 [ARCHITECTURE](ARCHITECTURE.md) 与 [CHANGELOG.internal.md](../CHANGELOG.internal.md) 记录影响范围。
