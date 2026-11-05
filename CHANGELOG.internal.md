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

- **Commit Hash**：`见紧随其后的 docs(changelog) 提交（本条提交哈希无法在自身内容中自引用）`
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

