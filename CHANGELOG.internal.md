# PlotPin 内部变更日志（不对外发布）

记录每次提交的核心改动、实测验证数据与遗留风险，便于复盘。数据均为本机实测，未达标不提交。

## 2026-11-05 · Phase 1：双槽模型（图片底图 + 矢量场地）

- **Commit Hash**：`86b1dc9953fccc308ace0e18111113fecb7bbe95`（feat(background): 图片底图与矢量场地双槽共存（Phase 1））。
- **核心改动点**
  - `state.background` 收敛为图片栅格槽（`kind:'empty'|'image'`）；新增独立 `state.site` 矢量场地槽，每层最多 1 图 + 1 场地。
  - 场地不进 `state.objects`，不参与选择/框选/对象计数/O 编号/CSV/XLSX 行；新增 `id/name/layerId/visible/locked/annot/style/updatedAt`，不设 `typeId`。
  - 旧档迁移：`background.kind==='image'` 原样保留且 `site=null`；`kind!=='image'` 整体迁入 `site` 并把图片槽置空；顶层与每个楼层都迁移。
  - 取景框改为 `imageWorldFrame ∪ siteBounds`；渲染顺序固定为「图片 → 场地 → 网格/覆盖 → 场地标注 → 业务对象 → 工具手柄」；`sceneStaticKey` 纳入 `site`。
  - 场地优先校准：有场地时校准/仿射只改图片与业务对象，场地坐标不迁移；无场地保持旧行为。
  - 导入：图片与场地互不覆盖；矢量导入/PDF/DXF 写 `site`。属性面板同时展示图片摘要与场地属性。
  - 导出：JSON 双槽；PNG/PDF 同序；SVG 同时输出两层并补场地节点/段长/半径/面积周长；DXF 场地写独立 `SITE` 图层闭合 `LWPOLYLINE`；CSV/XLSX 不加场地行。
  - 协作合并：`site` 增加楼层级 LWW（优先 `site.updatedAt`，否则楼层 `updatedAt`）。
- **公共抽象**
  - `model.js`：`createEmptyBackground / createSiteSlot / defaultSiteShape / isImageBackground / siteShapeOf / siteIsVisible / siteIsLocked / isSiteLike`。
  - `geometry.js`：`siteOutlinePoints`（rect/parallelogram/polygon/circle/ellipse/sector 统一边界点，SVG/DXF 共用）；`siteDomainOf/siteBounds/siteDescription` 默认参数切到 `state.site`，保留显式旧 background 重载。
  - `io-export.js`：`siteDxfEntities`。
  - 影响范围：`siteHandleList/siteAreaPerimeter/siteDomainOf/siteBounds` 旧签名（显式传旧 `kind` 矢量 background）仍可用；`drawBackground` 仅处理图片，矢量绘制迁至 `drawSite`；所有直接读 `state.background.shape` 的内部调用已改为 `state.site`。
- **实测验证数据**
  - `node scripts/check.mjs`：通过（分层/契约/API/删除账本/徽章）。
  - `node scripts/selftest.mjs`：1544 条断言全部通过。
  - `node scripts/bench.mjs`（2000 对象 / 1600×900，场地 2000×1500m 全量可见，提交前最后一次实测）：静态层重建 21.79 ms/帧；缓存命中 0.34 ms/帧、P95 0.42 ms（目标 < 8 ms）；直接全量 21.10 ms/帧；heapUsed 16.78 MB；视口裁剪 99.4%；覆盖率分析 7.8 ms（目标 < 300 ms）。
- **遗留 TODO / 风险**
  - 旧版 App 忽略 `site`，回写后场地丢失；已写入 `README.md` 与 `docs/features.md`，不做双写。
  - Phase 2A 待办：场地几何内核仍分散在 `render.js/interaction.js/geometry.js`，需统一并删除 `siteBoundaryPoints/siteShapeCenter` 重复实现；`siteDomainOf` 多边形负坐标已在本提交修复，但需补负坐标断言。
  - Phase 2B/3A/3B 待办：节点编辑复用、校准点拖拽/增删/撤销、图片变换手柄与场地吸附、SVG 标注进一步对齐。

## 2026-11-05 · Phase 2A：场地几何统一 + schema 对象化 + 负坐标修复

- **Commit Hash**：`bbf7862`（refactor(site): 场地几何内核收口到 geometry.js（Phase 2A））。
- **核心改动点**
  - 场地几何内核收口到 `js/core/geometry.js`：`siteBoundaryPoints / siteShapeCenter / siteBasePoint / siteRadiusText / siteAreaPerimeter` 从 `render.js` 迁出；`siteHandlesOf / siteHandleList / siteHandleDragTo / resizeSiteByHandle` 从 `interaction.js` 迁出，`render.js` 与 `interaction.js` 不再声明同名函数（各删一份重复实现）。
  - 新增纯内核 `siteHandleDragTo(site,h,p)`：只改传入 site，不读全局，便于单测；旧 `resizeSiteByHandle(h,p)` 保留为写 `state.site` 的薄包装，并保持可见/锁定守卫。
  - `state.site` 新增 `type:'site'` schema 标记（`createSiteSlot` 统一下发，`sanitizeSite` 经工厂自动继承），`kind=shape.type` 继续兼容旧断言。
  - `siteDomainOf` 多边形负坐标改用 `max−min`（Phase 1 已修，本提交补断言锁定：`[[-10,-10],[10,-10],[10,10],[-10,10]]` → 20×20）。
  - 旧签名重载全部保留：`siteDomainOf / siteBounds / siteHandleList / siteAreaPerimeter / siteBoundaryPoints / siteShapeCenter` 仍可直接传旧 `kind` 矢量 background 对象。
- **公共抽象**
  - 新增 `siteHandlesOf`（纯清单，不读全局）、`siteHandleDragTo`（纯写入手柄几何）。
  - 删除重复：`render.js` 的 `siteBoundaryPoints/siteShapeCenter/siteBasePoint/siteRadiusText/siteAreaPerimeter`；`interaction.js` 的 `siteHandleList/resizeSiteByHandle`。
  - 影响范围：渲染标注、SVG 导出、属性面板、场地节点拖拽全部改为调用 `geometry.js` 同名函数，调用点签名不变；`scripts/selftest.mjs` 新增 7 条断言（负坐标域、type 标记、同源手柄、纯内核写入、锁定/隐藏不可拖拽）。
- **实测验证数据（本机实测）**
  - `node scripts/check.mjs`：通过（26 脚本语法/入口资源/离线/契约/API/分层）。
  - `node scripts/selftest.mjs`：1551 通过 / 0 失败（Phase 1 为 1544，净增 7）。
  - `node scripts/bench.mjs`（2000 对象 / 1600×900）：静态层重建 21.45 ms；缓存命中 0.34 ms、P95 0.40 ms（< 8 ms）；直接全量 21.02 ms；heapUsed 17.05 MB；视口裁剪 99.4%；覆盖率分析 7.5 ms（< 300 ms）。
- **遗留 TODO / 风险**
  - `siteHandleAt` 仍由 `interaction.js` 独立实现（命中阈值 9px），Phase 2B 合并到通用手柄分发。
  - 场地属性面板的多边形节点编辑仍是手写一套，Phase 2B 复用 `renderNodeEditor`。

## 2026-11-05 · Phase 2B：手柄/节点/属性/图层/锁定复用

- **Commit Hash**：`4744cf2`（feat(site): 场地手柄/节点/属性/图层/锁定复用通用实现（Phase 2B））。
- **核心改动点**
  - 场地多边形顶点编辑改用 `renderNodeEditor(o, opts)`：与折线/闭合区域共用同一套 `data-node-*` DOM（坐标输入、＋/×、↑↓、抓手列），`props.js` 不再维护 `data-site-node-*` 这一套平行实现；提示文案按「个顶点 / 场地多边形」口径传入。
  - 抽出 `bindNodeEditorEvents(box, spec)` 统一接管节点坐标输入与增删/排序按钮，业务对象与场地只提供各自提交回调（对象走 `setNodeCoord/insertLineNode/removeLineNode/moveNodeStep`，场地走 `siteInsertNode/siteRemoveNode/siteMoveNode`）。
  - 抽出 `layerOptionsHTML(id)`，对象属性面板与场地属性面板共用图层下拉 option 来源。
  - 抽出 `pickScreenHandle(list, screenP, radius)`：`handleAt`（对象手柄）与 `siteHandleAt`（场地手柄）共用 9px 屏幕命中循环，删除场地侧独立实现。
  - `siteIsVisible/siteIsLocked` 叠加 `siteLayerOf(site)`：场地与业务对象同语义——图层隐藏→场地不渲染且不计入取景框；图层锁定→场地控制点不可拖拽/编辑。
  - 删除 CSS 中不再使用的 `.node-row.vtx` 专用列模板。
- **公共抽象**
  - `renderNodeEditor(o, opts)` 新增可选第二参数（`points/canEdit/min/nodeLabel/hintUnit/shapeName/hint`），省略时与旧行为完全一致。
  - 新增 `bindNodeEditorEvents / layerOptionsHTML / pickScreenHandle / siteLayerOf`。
  - 影响范围：对象属性面板节点绑定改为共享 binder（行为等价）；场地多边形属性 DOM 从 `data-site-node-*` 变为 `data-node-*`（无外部依赖，仅自测断言同步）；`siteIsVisible/siteIsLocked` 语义增强会影响取景框、渲染、手柄/拖拽守卫（预期行为，已写文档）。
- **实测验证数据（本机实测）**
  - `node scripts/check.mjs`：通过（26 脚本语法/入口资源/离线/契约/API/分层）。
  - `node scripts/selftest.mjs`：1558 通过 / 0 失败（Phase 2A 为 1551，净增 7）。
  - `node scripts/bench.mjs`（2000 对象 / 1600×900）：静态层重建 21.63 ms；缓存命中 0.35 ms、P95 0.48 ms（< 8 ms）；直接全量 20.58 ms；heapUsed 13.15 MB；视口裁剪 99.4%；覆盖率分析 8.4 ms（< 300 ms）。
- **遗留 TODO / 风险**
  - 场地多边形节点行仍不支持抓手拖拽排序（沿用 ↑↓），与旧场地实现一致；Phase 3B 再评估是否开启。
  - 图层隐藏导致取景框收缩属于行为变化，需在下一轮回归中关注用户习惯（已在 features.md 写明）。

## 2026-11-05 · Phase 3A：校准控制点可拖拽/增删/撤销，提交时才求解

- **Commit Hash**：`d37724f`（feat(calibrate): 校准控制点可拖拽/增删/撤销，提交时才求解仿射（Phase 3A））。
- **核心改动点**
  - 比例尺校准不再在第二次点击时立刻弹距离输入：落点只记录控制点，`Enter` / 左侧 ✓ / 双击才提交；提交时才 `finishCalibration` 换算出 `metersPerPixel` 并 `scaleWorldAround`。
  - 校准控制点统一可编辑：`calibHitAt(sp)` 按屏幕 9px 命中；比例尺点拖拽改世界坐标；仿射红点拖拽改图上像素 `(u,v)`、绿点拖拽改实地坐标 `(x,y)`；选中点画橙色环。
  - `Delete/Backspace` 删除选中控制点；`Ctrl+Z` 在校准工具下优先回退控制点专用栈（`calibUndoStack`），不影响工程撤销；右键/Esc 取消整组校准并清空控制点。
  - 仿射仍只在 `finishAffine` 提交时调用 `solveImageAffine` 与 `migrateObjectsByAffine`，拖拽/增删过程不迁移任何对象。
  - 载入/撤销/重做（`afterStateLoaded`）与工具切换同步清空 `calibSelection/calibUndoStack`。
  - 工具提示与中英文案同步更新（i18n 键成对改动）。
- **公共抽象**
  - 新增 `calibSnapshot / calibPushUndo / calibUndo / calibHitAt`（`interaction.js`），状态 `calibSelection / calibUndoStack` 收口在 `model.js`。
  - 未改动 `solveImageAffine / migrateObjectsByAffine / finishAffine / finishCalibration` 的对外签名。
- **实测验证数据（本机实测）**
  - `node scripts/check.mjs`：通过（26 脚本语法/入口资源/离线/契约/API/分层，含中英键对齐）。
  - `node scripts/selftest.mjs`：1558 通过 / 0 失败。
  - `node scripts/bench.mjs`（2000 对象 / 1600×900）：静态层重建 21.54 ms；缓存命中 0.35 ms、P95 0.48 ms（< 8 ms）；直接全量 20.70 ms；heapUsed 13.13 MB；视口裁剪 99.4%；覆盖率分析 7.3 ms（< 300 ms）。
- **遗留 TODO / 风险**
  - 自测框架不模拟画布指针事件，控制点拖拽/Delete/Ctrl+Z 目前只有静态逻辑覆盖，需在浏览器中人工回归一次（校准工具：落点→拖动→Delete→Ctrl+Z→Enter）。
  - 比例尺校准由「第二点自动提交」改为「显式提交」，属于交互行为变化，老用户可能找不到提交入口；已把工具提示与 features.md 写清楚，并保留双击提交。

## 2026-11-05 · Phase 3B：图片变换手柄 + 场地边角吸附 + SVG 标注补齐

- **Commit Hash**：`a6dfab6`（feat(image): 图片变换手柄与场地边角吸附，SVG 场地标注补齐（Phase 3B））。
- **核心改动点**
  - 新增左侧「🖼 图片变换」工具：`imageHandleList` 输出四类手柄——橙色中心=平移、蓝色圆点=旋转、右下角=等比缩放（锚点左上角）、顶边中点=切变；**不提供四角自由拖拽**。
  - 新增 `imageHandleDragTo(bg,drag,wp)` 纯函数：返回新 `transform` 与吸附目标，不直接写状态；`affTranslate / affRotateAbout / affScaleAbout / affShearX` 为世界空间仿射构造，渲染/命中/拖拽共用。
  - 图片变换只改 `state.background.transform`，不迁移任何业务对象；首次拖动才 `pushHistory`，Esc 还原并弹出快照，抬手 `commitChange`。
  - 场地边角吸附：平移/缩放时图片角点与场地边角屏幕距离 ≤12px 自动对齐；场地折点/圆心同时加入 `collectSnapCandidates`，绘制/移动业务对象可直接吸附到场地角点（图层隐藏时不参与）。
  - SVG 场地标注补齐：新增基点坐标文本、段长按画布同阈值（`segLabelMinPx`）跳过过短段、节点坐标格式与画布对齐（`P1 (x, y)`）。
  - 新增 UI 按钮、工具提示与中英词条（`imageXform` / 图片变换长提示成对更新）。
- **公共抽象**
  - 新增 `imageHandleList / imageHandleDragTo / affTranslate / affRotateAbout / affScaleAbout / affShearX / siteCornerPoints`（`geometry.js`），`imageHandleAt`（`interaction.js`，复用 `pickScreenHandle`）。
  - 影响范围：`collectSnapCandidates` 现在会追加场地候选，**所有依赖候选总数的测试/调用方都会多出「场地折点 4 个 + 圆心 1 个」**；已同步更新自测期望（11→15、端点 4→8、隐藏点断言改为按对象 id 过滤）。SVG 文本格式变化会改变视觉快照哈希，已更新为实测值。
- **实测验证数据（本机实测）**
  - `node scripts/check.mjs`：通过（26 脚本语法/入口资源/离线/契约/API/分层）。
  - `node scripts/selftest.mjs`：1569 通过 / 0 失败（Phase 3A 为 1558，净增 11）。
  - `node scripts/bench.mjs`（2000 对象 / 1600×900）：静态层重建 21.32 ms；缓存命中 0.35 ms、P95 0.48 ms（< 8 ms）；直接全量 20.37 ms；heapUsed 13.21 MB；视口裁剪 99.4%；覆盖率分析 8 ms（< 300 ms）。
- **遗留 TODO / 风险**
  - 旋转未做角度吸附（仅场地角点吸附），后续如需正交/15° 吸附再补。
  - 图片变换与比例尺/仿射校准共用 `background.transform`，变换后如需重新校准，建议先「重置校准」再打点，避免旧映射叠加；已在工具提示中不承诺自动合并。
  - 自测仍未模拟画布指针，图片手柄拖拽的浏览器手测需补一次。

## 2026-11-05 · 标注显示开关从全局设置搬进属性面板

- **Commit Hash**：`4f5ac02`（feat(props): 标注显示开关迁入场地/对象属性面板）。
- **核心改动点**
  - 场地六项标注开关（节点坐标 / 段长 / 基点坐标 / 半径 / 面积 / 周长）从「工程设置」弹窗搬进**场地属性面板**；按形状只显示有效项（圆/椭圆/扇形无节点与段长，多边形/圆/椭圆/扇形无基点，矩形/平行四边形/多边形无半径），无场地时不渲染开关组，锁定（含所属图层锁定）时 `disabled`。
  - 点设备 / 区域 / 折线的「图上标注」开关原本就在各自属性面板内，本提交仅把全局重复入口移除：设置弹窗的「显示标签 / 段长度标注 / 图上显示面积」与顶部工具栏「标签」复选框一并删除，**避免同一开关出现两处**。
  - 存储不变：六个场地开关仍写 `state.settings.siteNodes / siteSegLen / siteBase / siteRadius / siteArea / sitePerimeter`；对象开关仍写对象 `annot`；`showLabels / showSegLen / showAreaTag` 保留为旧工程与未单独配置对象的缺省值。无 schema 变更、无迁移、旧工程读取不受影响。
  - 渲染/导出读取路径未改，仍与 `drawSiteAnnotations`、SVG 场地标注同口径。
- **公共抽象**
  - 新增 `annotToggleGroupHTML(items, opts)`（标注开关组 HTML 唯一模板，`attr` 区分 `data-annot` / `data-site-annot`）与 `bindAnnotToggleInputs(box, spec)`（事件绑定唯一实现，`apply` 负责回写）。
  - 新增 `siteAnnotToggleKeys(site)` / `renderSiteAnnotToggles(site)`（`props.js`）与 `SITE_ANNOT_SETTING_KEYS / siteAnnotSettingOn / setSiteAnnotSetting`（`model.js`）。
  - 影响范围：`renderAnnotToggles(o)` 改为复用模板，输出 DOM 键与文案不变；对象/场地属性面板的开关绑定统一走 `bindAnnotToggleInputs`，后续新增开关只传 `items`，禁止复制循环。设置弹窗与工具栏旧入口删除后，`state.settings` 上述键不再有 UI，但读取逻辑全部保留。
- **实测验证数据（本机实测）**
  - `node scripts/check.mjs`：通过（26 脚本语法/入口资源/离线/契约/API/分层，含中英键对齐）。
  - `node scripts/selftest.mjs`：1584 通过 / 0 失败（Phase 3B 为 1569，净增 15）。
  - `node scripts/badge.mjs`：README 断言数已同步为 1584。
  - `node scripts/bench.mjs`：**本次未跑**。改动仅涉及属性面板 DOM 渲染与设置弹窗删减，不触碰画布逐帧渲染、缓存键、几何或导出路径；按口径不强制。若后续改动 `drawSiteAnnotations` 或 `renderSiteProps` 的每帧调用链，需补跑。
- **遗留 TODO / 风险**
  - 顶部工具栏全局「标签」移除后，不再有一键全局隐藏编号的入口；用户需在对象属性面板逐对象关闭。`showLabels` 缺省值仍为 `true`，旧工程中该值为 `false` 的对象无显式 `annot.name` 时仍按缺省隐藏（行为兼容），但新 UI 无法再修改这个缺省。
  - 自测仅校验生成的 HTML 与 settings 写入，未模拟真实点击 `change` 事件；场地开关在浏览器中的勾选/禁用需人工回归一次（选中场地 → 切换六项 → 隐藏/锁定图层再切换）。
  - 设置弹窗删掉三行后布局更紧凑，未做 320px 窄屏截图回归；文案沿用现有中英字典，无新增硬编码。

## 2026-11-05 · 顶栏「清空当前楼层」

- **Commit Hash**：`占位（本提交后回填）`（feat(clear): 顶栏清空当前楼层双槽/对象/标注并支持撤销）。
- **核心改动点**
  - `clearCurrentFloor()`（`persistence.js`）一次清空：图片底图槽、`state.site`、`state.objects`（含标注/测量/文字/照片引用）、校准点与仿射配对、`calibSelection/calibUndoStack`、`selectedIds`、草稿/拖拽/橡皮筋、捕捉与参考线运行时状态、覆盖率结果、运行时 `bgImage/bgDataUrl`；随后 `syncActiveFloor()`、`invalidateStatic()`、`resetFrameRef()`、`fitView()`，取景框回到默认空工程。
  - 清空对象逐个写入删除墓碑（协作合并不会复活）；楼层结构、图层、自定义类型、工程元数据名称不重置。
  - 顶栏新增 `#clearFloorBtn`（中英 `clearAll` / `clearAllTitle`），点击先 `showConfirm` 二次确认（列出图片/场地/对象数量与不可逆范围，说明可 Ctrl+Z），确认后 `pushHistory()` → `clearCurrentFloor()` → `commitChange('已清空当前楼层')`。
  - 文案全部走 i18n：`DICT` 新增按钮/标题键，`PHRASES` 新增确认正文与完成提示。
- **公共抽象 / 复用**
  - 复用现有 `pushHistory / commitChange / markTombstone / syncActiveFloor / fitView / resetFrameRef / invalidateStatic`，未新增第二套撤销/保存逻辑。
  - 影响范围：`clearCurrentFloor` 会清空 `interaction.js` 的运行时校准变量与参考线，因此所有依赖这些状态的面板/工具在下一次 `refreshUI()` 后回到空态；楼层切换逻辑不变。
- **实测验证数据（本机实测）**
  - `node scripts/check.mjs`：通过。
  - `node scripts/selftest.mjs`：1614 通过 / 0 失败（前值 1584，净增 30，含导出双槽证据）。
  - `node scripts/badge.mjs`：README 同步 1614。
  - 浏览器回归：待执行（本轮统一回归后回填结果）。
  - `node scripts/bench.mjs`：清空为一次性操作，不在逐帧渲染路径；性能数据待统一 bench 后回填。
- **遗留 TODO / 风险**
  - 清空会写入 2000 级对象墓碑（受 `TOMBSTONE_LIMIT` 限制），大工程合并时墓碑可能挤掉更早记录；这是既有墓碑策略，不在本次扩展。
  - 清空不可恢复除撤销外的备份；图片资产本体保留在 IndexedDB（供撤销重载），不会立即回收空间。

## 2026-11-05 · 导出双槽与场地标注实测核验

- **Commit Hash**：`占位（本提交后回填）`（test(export): 双槽与场地标注导出证据断言）。
- **核心改动点**
  - 未发现导出缺场地：JSON 走 `persistableState()`，顶层同时序列化 `background` 与 `site`；PNG/PDF 图纸页共用 `drawScene()`（含 `drawSite`）；SVG 的场地圆/多边形、节点、段长、半径、面积周长由 `buildSceneSvg` 输出；DXF 场地走 `siteDxfEntities()` 写入独立 `SITE` 图层闭合 `LWPOLYLINE`；CSV/XLSX 只遍历 `state.objects`，场地不产生行。
  - 新增 12 条真实产物断言：JSON 双槽键、SVG 圆半径 `10.00 m`、面积 `314.16 ㎡` / 周长 `62.83 m`、基点坐标、场地标注先于业务对象、DXF `SITE` 层与闭合折线、场地不进对象台账。
  - 文档无需改行为描述（`docs/features.md` 双槽导出口径已存在），本提交只补实测证据与变更日志。
- **实测验证数据（本机实测）**
  - `node scripts/selftest.mjs`：1614 通过 / 0 失败（前值 1602，净增 12）。
  - `node scripts/check.mjs` / `node scripts/badge.mjs`：通过，徽章 1614。
  - PNG/PDF 的实际触发以浏览器回归为准（本轮回归后回填）。
- **遗留 TODO / 风险**
  - PNG/PDF 为位图产物，自测不比对像素；依赖 `drawScene` 与 SVG/画布共用绘制链。浏览器回归只验证导出成功提示与画布可见场地，不做像素级比对。



