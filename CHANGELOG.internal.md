# PlotPin 内部变更日志（不对外发布）

记录每次提交的核心改动、实测验证数据与遗留风险，便于复盘。数据均为本机实测，未达标不提交。

## 2026-11-06 · A-01 资产可达集 + 工程命名空间（禁止跨工程 prune）

- **Commit Hash**：`PENDING`（fix(assets): 资产回收按命名空间取可达集，禁止跨工程误删底图/照片）。
- **核心改动点**
  - 新增公共抽象 `ContentAssets.collectAssetRefs(snapshot)`（`js/common/content-assets.js`）：一份工程快照里全部资产引用的**唯一**采集实现，覆盖顶层 `background.assetId`、各楼层 `background.assetId`、顶层与各楼层 `props.photoId`。纯函数、无副作用，GC 与自测共用同一份代码，杜绝「各扫各的」。
  - `js/core/persistence.js`：把只扫 `state + history` 的旧 `reachableBgAssetIds()` 拆成三层——
    - `assetRefsInMemory()`：同步、纯函数，产出**命名空间 → 资产 id 列表**：`draft`、`history.past[i]`、`history.future[i]`、`clipboard`、`drag.originals`；
    - `assetRefsByNamespace()`：在上者基础上读 IndexedDB 全部键，`current` → `autosave`、`proj:<id>` → `project:<id>`，逐个 `collectAssetRefs`；
    - `unionAssetRefs(namespaces)`：并集，**prune 的唯一判据**；`reachableAssetIds()` / `pruneBgAssets()` 基于并集。
    - `pruneBgAssets()` 读不到工程库时（异常）**不删除任何资产**，`assetPrune` 失败也不再吞掉后静默删库。
  - 三处调用方从「清空整库」改为「按全库可达集回收」：`js/features/io.js`（新建工程，原 `assetPrune([])`）、`js/features/io-import.js`（导入工程，原 `assetPrune([keepAsset])`）、`openProjectById` / `deleteProjectById`（原只保留当前底图）。
- **实测验证数据（本机 Windows / Node，2026-11-06）**
  - `node scripts/selftest.mjs`：**1627 通过 / 0 失败**（+8 项，全部为本次新增断言）。
  - 新增断言覆盖（selftest §32.1）：
    - 快照采集：顶层/楼层底图 + 顶层/楼层照片 4 类 id 全部命中；`null` 快照返回空。
    - 命名空间：`draft` / `clipboard` / `drag.originals` 各自命中（旧实现漏掉后两者）。
    - 双工程保活：A/B 各带底图+照片 → 并集 4 个 id 全保留；删除 `project:B` 记录后并集只剩 A 的 2 个 → **B 的资产可回收、A 的不受影响**（跨工程误删的反向证明）。
  - `node scripts/check.mjs --selftest`：通过（`--selftest 已执行：1627 通过 / 0 失败`）。
  - `node scripts/bench.mjs`：avg 0.33–0.41ms / P95 0.43–0.66ms（≤3）/ 重建 21.7–39.3ms（≤60）/ heapUsed 12.09–19.09MB（≤64）/ 裁剪 99.4%，连续 3 次全部通过。
  - `node scripts/build.mjs --check`：665.0KB ≤ 750KB，SHA256 `c4a27f5…` 与登记值一致，二次构建确定性一致。
  - README 断言数经 `node scripts/badge.mjs` 同步为 1627（三处锚点一致）。
- **公共抽象 / 影响面**
  - 新增：`ContentAssets.collectAssetRefs`、`assetRefsInMemory`、`assetRefsByNamespace`、`unionAssetRefs`。
  - 保留：`reachableBgAssetIds()`（语义收窄为「内存命名空间并集」，同步）；`pruneBgAssets()` 变为 async（原为 fire-and-forget 包装）。
  - **影响调用方**：`io.js`、`io-import.js`、`persistence.js` 内部四处；`pruneBgAssets()` 现返回 Promise，调用方均已 `await`/`.catch`。无对外 API（`PlotPin.*`）变化。
- **遗留 TODO / 风险**
  - 回收时机仍是「打开/新建/导入/删除工程」的事件驱动，没有配额上限与 LRU；工程库很多时 `prune` 需遍历全部记录（每次 O(工程数)，当前规模可接受，未做索引）。
  - `drag.originals` 只在拖拽进行中非空；若拖拽中途崩溃，未落盘的资产会在下次启动后被回收（属预期，无数据损失，仅需重导底图）。
  - 照片附件资产（`props.photoId`）此前完全不在可达集内，本次一并纳入；但照片写入路径（`photoId` 生成）未在本轮验证，需在 A-04 的存储 v2 中复核。


## 2026-11-06 · A-13 质量门禁去假绿

- **Commit Hash**：`4605c0d`（test(gates): 门禁去假绿——P95/heap/重建阈值、产物哈希比对、缺文件必失败、门禁牙齿自测）。
- **核心改动点**
  - `scripts/bench.mjs`：新增 P50/P95/P99 采样与 `--gate` 语义（默认启用，`--no-gate` 本地快速跑）。阻断项：缓存帧 avg ≤ 8ms、**P95 ≤ 3ms**、**静态层重建 ≤ 60ms**、直接全量 ≤ 60ms、**heapUsed ≤ 64MB**、覆盖率 ≤ 300ms、裁剪 ≥ 60%；P99 ≤ 10ms 仅告警。失败时打印「实测值 / 阈值 / 超出比例」，不再只打印读数。
  - `scripts/build.mjs`：`--check` 从**源重建**并与 `scripts/dist-manifest.json`（新增，入库）比对 SHA256 + 字节数；断言体积 ≤ 750KB；断言**二次构建确定性**（同源两次构建哈希必须相同）；`dist/` 存在时额外逐字节比对。`node scripts/build.mjs` 同时刷新登记值。
  - `scripts/check-ngm.mjs`：失败汇总从 `if (project && lock)` 块内移到块外——`ngm.json` / `ngm.lock` 缺失时 `readJson` 已 fail，但旧结构会让整个汇总被跳过而**退 0**。缺 manifest 现在必失败。
  - `scripts/badge.mjs`：三处断言数锚点先校验存在性，任一缺失即退出码 1；旧实现锚点缺失时 `replace` 全是空操作、打印「无需更新」并退 0。
  - `scripts/check.mjs`：新增 `--selftest`（同时给 `check-contracts.mjs` / `check-plugin-api.mjs` 传 `--selftest`，并显式执行 `selftest.mjs` 把退出码纳入门禁）；日志打印 `[门禁] --selftest 已执行：<通过数>`。
  - `package.json`：`ci` 改为 `check --selftest && bench && build --check`；新增 `gates`。
  - `.github/workflows/ci.yml`：test job 改为 `check --selftest` → `bench` → `build --check` → `check-gates`，四步任一非 0 即失败。
  - **新增 `scripts/check-gates.mjs`（门禁牙齿）**：在系统临时目录整仓副本里构造 5 种人为破坏，断言对应门禁非 0，并打印**失败原因行**以证明红的是那条门禁而非顺带失败。仓库本身零改动（副本排除 `.git/dist/node_modules/.trae` 等）。
- **实测验证数据（本机 Windows / Node，2026-11-06）**
  - `node scripts/check.mjs --selftest`：通过；日志含 `[门禁] --selftest 已执行：✅ 逻辑层自测：1619 通过 / 0 失败`。
  - `node scripts/selftest.mjs`：1619 通过 / 0 失败（断言数未变，本次只改门禁脚本）。
  - `node scripts/bench.mjs`：avg 0.34ms（≤8）/ P50 0.32 / **P95 0.42ms（≤3）** / P99 1.05ms / **重建 21.49ms（≤60）** / 直接全量 21.02ms / **heapUsed 14.43MB（≤64）** / 裁剪 99.4% / 覆盖率 7.5ms。
  - `node scripts/build.mjs --check`：662.3KB ≤ 750KB，SHA256 `da3cfab20d61379ed9a35fe6fccf6d69cd76fee6a838d9f692311e5bd0bd68ea` 与登记值一致，二次构建确定性一致。
  - `node scripts/check-gates.mjs`：**5/5 破坏被拦截**，且失败原因逐条对上：
    | # | 人为破坏 | 退出码 | 失败原因（实测输出） |
    |---|---|---|---|
    | 1 | 渲染入口注入 4ms 忙等（avg 仍 <8ms） | 1 | `缓存帧 P95：实测 4.53ms ≤ 阈值 3ms（超出 51.0%）` |
    | 2 | `dist` 产物追加注释 | 1 | `单文件打包校验未通过` |
    | 3 | 删除 `ngm.json` | 1 | `check-ngm: FAILED (1 error(s))` |
    | 4 | README 徽章断言数模板改成 `selftest-unknown` | 1 | `README 缺少断言数模板锚点` |
    | 5 | selftest 注入 `eq('门禁牙齿-人为失败',1,2)` | 1 | `工程自检未通过` |
  - 破坏场景全部在临时副本内构造并清理；`git status` 仅含本次预期改动。
- **公共抽象 / 影响面**
  - 新增判据入口 `scripts/check-gates.mjs`（`npm run gates`）与登记文件 `scripts/dist-manifest.json`。
  - **行为变化（需知悉）**：`npm run ci` 不再等价于 `npm run lint`；改 `js/**`、`css/style.css`、`index.html` 后必须运行 `node scripts/build.mjs` 刷新 `dist-manifest.json`，否则 `build --check` 会红。这是「产物可从源复现」的判据，不是提示。
  - `bench.mjs` 阈值从 1 项（avg 8ms）扩到 7 项；本地想跳过门禁用 `--no-gate`。
- **遗留 TODO / 风险**
  - 阈值是 Node + canvas Proxy 桩下的绝对值，与真实浏览器/GPU 不可比；真实浏览器基线依赖 A-14（Playwright，需用户批准 devDependency，本轮未安装）。
  - `heapUsed` 只取 bench 结束时单点，未覆盖「10 分钟长跑增长斜率」；需夜间任务。
  - `check-gates.mjs` 整仓副本 + 5 次全量门禁，本机约 40–60s；CI 时长相应增加。
  - `ci.yml` 的 `ngm-verify` 仍是「变量未配置则跳过」的可选 job（vendor 自检已必跑），未在本轮改为必失败——它依赖外部二进制下载，属需拍板项。


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

- **Commit Hash**：`f5ad7f3`（feat(clear): 顶栏清空当前楼层双槽/对象/标注并支持撤销）。
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
  - 浏览器回归（真实 Chromium，`browser_use` 自动化，`http://127.0.0.1:8765`）：点「清空」弹出二次确认 → 确定后场地消失、属性面板显示「尚未设置矢量场地」、toast「已清空当前楼层」→ `Ctrl+Z` 后场地与 `100 × 70` 属性、对象与校准点全部恢复、toast「已撤销」；PASS。
  - `node scripts/bench.mjs`（2000 对象 / 1600×900，提交前最末一次实测）：静态层重建 22.16 ms/帧；缓存命中 0.35 ms/帧、P95 0.44 ms（< 8 ms）；直接全量 21.19 ms/帧；heapUsed 12.92 MB；视口裁剪 99.4%（13/2000）；覆盖率分析 7.8 ms（< 300 ms，覆盖率 44.3%）。清空本身为一次性操作，不在逐帧渲染路径。
- **遗留 TODO / 风险**
  - 清空会写入 2000 级对象墓碑（受 `TOMBSTONE_LIMIT` 限制），大工程合并时墓碑可能挤掉更早记录；这是既有墓碑策略，不在本次扩展。
  - 清空不可恢复除撤销外的备份；图片资产本体保留在 IndexedDB（供撤销重载），不会立即回收空间。

## 2026-11-05 · 导出双槽与场地标注实测核验

- **Commit Hash**：`136aebf`（test(export): 双槽与场地标注导出证据断言）。
- **核心改动点**
  - 未发现导出缺场地：JSON 走 `persistableState()`，顶层同时序列化 `background` 与 `site`；PNG/PDF 图纸页共用 `drawScene()`（含 `drawSite`）；SVG 的场地圆/多边形、节点、段长、半径、面积周长由 `buildSceneSvg` 输出；DXF 场地走 `siteDxfEntities()` 写入独立 `SITE` 图层闭合 `LWPOLYLINE`；CSV/XLSX 只遍历 `state.objects`，场地不产生行。
  - 新增 12 条真实产物断言：JSON 双槽键、SVG 圆半径 `10.00 m`、面积 `314.16 ㎡` / 周长 `62.83 m`、基点坐标、场地标注先于业务对象、DXF `SITE` 层与闭合折线、场地不进对象台账。
  - 文档无需改行为描述（`docs/features.md` 双槽导出口径已存在），本提交只补实测证据与变更日志。
- **实测验证数据（本机实测）**
  - `node scripts/selftest.mjs`：1614 通过 / 0 失败（前值 1602，净增 12）。
  - `node scripts/check.mjs` / `node scripts/badge.mjs`：通过，徽章 1614。
  - 浏览器回归（真实 Chromium）：JSON / PNG / SVG / PDF 导出均出现成功 toast；场地位于可见图层时 DXF 导出成功（toast「DXF 已导出（坐标单位：毫米，可用 AutoCAD/LibreCAD 打开）」）。首次 DXF 失败系上一轮留下的图层隐藏状态导致 `siteDxfEntities()` 返回空，恢复场地可见后通过，非代码缺陷。
- **遗留 TODO / 风险**
  - PNG/PDF 为位图产物，自测不比对像素；依赖 `drawScene` 与 SVG/画布共用绘制链。浏览器回归只验证导出成功提示与画布可见场地，**未做像素级/文件内容核验**（下载目录中未取回导出的 .png/.pdf/.json/.svg/.dxf 文件）。
  - 场地多边形顶点在画布上的真实拖拽未被浏览器自动化注册（应用侧 300ms 合成事件过滤），本轮以属性面板改顶点坐标（58.00 → 65.00，面积/周长同步变化）判定节点编辑逻辑；画布拖拽路径标记为未验证。

## 2026-11-05 · 修复场地标注开关「切了没反应」

- **Commit Hash**：`753dfce`（fix(site): 离屏画布屏幕标签按登记尺寸定位）。
- **现象**：选中场地后切「节点坐标」「段长」两个开关，场地周围不出现/不消失任何文字；面积/周长正常。真实 Chromium 复现：`state.settings.siteNodes=true`、`siteSegLen=true` 且复选框已勾选，画布上只有面积/周长胶囊，顶点与边中点无标签。
- **根因（代码位置）**
  - `js/core/render.js` 的 `drawScreenTag()` 用 `c.canvas.clientWidth / clientHeight` 做标签夹边。静态层由 `ensureStaticLayer()` 用 `document.createElement('canvas')` 创建且**从不插入文档**，离屏 canvas 的 `clientWidth/clientHeight` 恒为 0，于是 `Math.max(2, Math.min(x, 0-w-2)) = 2`，全部标签被压到静态层左上角 (2,2) 并叠成一团（多数被左上角提示浮层遮住），表现为「在哪里都看不到」。
  - 只有走 `drawScreenTag` 的项受影响：`siteNodes / siteSegLen / siteBase / siteRadius`（后两项默认关闭，所以用户只报前两项）；`siteArea / sitePerimeter` 走 `drawAreaTag`，不做 clientWidth 夹边，所以正常。
  - 开关写回链路本身正常：`setSiteAnnotSetting` 写 `state.settings` 原键 → `changed()` 触发 `requestRender()`；`sceneStaticKey` 含 `JSON.stringify(state.settings)`，本身已纳入六项开关。故不是缓存键漏项。
  - 同一缺陷也影响 PNG/PDF 导出画布（离屏）与未选中对象的图上标注（画在静态层）：导出图里的标签同样会被压到左上角。
- **修复**：新增 `markSurfaceSize(canvas, cssW, cssH)` / `surfaceCssSize(ctx)`（`js/core/render.js`，绘图表面逻辑尺寸唯一来源）。`ensureStaticLayer`、`renderToDataURL`、PDF 图纸页画布在创建时登记逻辑尺寸；`drawScreenTag` 改用 `surfaceCssSize`，尺寸未知时不夹边（不再压到原点）。DOM 画布仍优先读 `clientWidth/clientHeight`，行为不变。六项开关继续共用 `SITE_ANNOT_SETTING_KEYS / siteAnnotSettingOn / setSiteAnnotSetting` 与 `annotToggleGroupHTML / bindAnnotToggleInputs`，未改键名、未做 schema 迁移。
- **实测验证数据（真实 Chromium，`browser_use` 自动化，http://127.0.0.1:8765）**
  - 修复前：12 顶点多边形，`siteNodes=true` 且 `siteSegLen=true` 时画布无任何节点/段长标签（只有面积/周长胶囊）。
  - 修复后逐项「关→开」各一次（矩形 100×70；矩形没有半径项、圆形没有节点/段长项，属形状设计如此）：
    | 开关 | 形状 | 画布实际变化 | 结果 |
    |---|---|---|---|
    | 节点坐标 | 矩形 | 顶点出现 `(100.00, 70.00)`、`(100.00, 0.00)`，关闭后消失 | PASS |
    | 段长 | 矩形 | 上/右/下边中点出现 `100.00 m`、`70.00 m`、`100.00 m`，关闭后消失 | PASS |
    | 基点坐标 | 矩形 | 基点角出现 `(0.00, 0.00)`，关闭后消失 | PASS |
    | 面积 | 矩形 | 中心出现 `面积 7000.00 ㎡`，关闭后消失 | PASS |
    | 周长 | 矩形 | 中心出现 `周长 340.00 m`，关闭后消失 | PASS |
    | 半径 | 圆形 r=50 | 圆心旁出现 `R 50.00 m`，关闭后消失 | PASS |
    | 基点坐标 | 圆形 r=50 | 圆心出现 `(50.00, 50.00)`，关闭后消失 | PASS |
  - `node scripts/selftest.mjs`：**1619 通过 / 0 失败**（前值 1614，净增 5）。新增断言：离屏画布登记尺寸可读、DOM 画布 `clientWidth` 优先、离屏画布标签按登记尺寸夹边（实际落点 353,290）、尺寸未知时不压到原点、六项场地标注开关逐个进入 `sceneStaticKey`。
  - `node scripts/check.mjs`：通过（26 个脚本、入口资源、离线引用、断言数一致 1619、契约、插件 API、模块分层）；`node scripts/badge.mjs` 已同步徽章。
  - `node scripts/bench.mjs`（2000 对象 / 1600×900）：静态层重建 21.79 ms/帧；缓存命中 0.34 ms/帧（P95 0.39 ms < 8 ms）；直接全量 21.19 ms/帧；heapUsed 14.3 MB；视口裁剪 99.4%（13/2000）；覆盖率分析 8 ms < 300 ms。修复仅多两次属性读取，无逐帧开销变化。
- **遗留 TODO / 风险**
  - 任何新增的离屏画布若调用 `drawScene`，必须调用 `markSurfaceSize` 登记尺寸，否则同类标签会再次堆到原点（已写入 `docs/modules.md` 影响范围）。
  - 基点标签位于画布边缘时会被夹边到画布内侧，可能落在左上角提示浮层下方；这是既有夹边策略，不是本次回归。
  - 本轮验证只覆盖画布静态层与导出画布定位逻辑，未对 PNG/PDF 导出文件做像素级核验。




