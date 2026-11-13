# 架构（ARCHITECTURE）

> **读者**：要改代码、加功能或做重构的开发者。
> **回答**：系统怎么启动、分几层、真实依赖往哪走、状态与渲染如何协作、扩展点与安全边界在哪。
> **不回答**：功能怎么用（见 [user-guide](user-guide.md)）、逐文件接口（见 [modules](modules.md)）、持久化细节（见 [DATA-MODEL](DATA-MODEL.md)）、门禁命令（见 [engineering](engineering.md)）。
> **事实边界**：本文以当前代码为准，最后核对 2026-11-13（基线 `2123a46` + 工作区 M1/M2 修复）。无法由代码或命令确认的内容标「待确认」。

## 1. 运行形态与启动链

PlotPin 是**无构建单页应用**：`index.html` 用 47 个 classic `<script>` 顺序加载 37 个项目脚本和 10 个 vendor 模块，共享同一个全局词法作用域；不使用 ES Module、打包器或运行时依赖。**加载顺序就是依赖顺序**，`scripts/check.mjs` 会校验目录归属和加载顺序。

```
vendor（10）
  → js/common（9）：dxf / pdf / pdf-read / pdf-vector / i18n / content-assets / merge / qr / symbols
  → js/core（14）：config → model → geometry* → persistence → tab-lease → snapshot
                   → viewport → ghost → render → interaction
  → js/features（14）：props / ui-panels / ui-shell / io / snapshot-ui / io-import / io-table
                       / io-fields / io-export / catalog / parking / collab / plugins / rules
  → js/core/app.js（最后）
```

启动流程在 [app.js](file:///d:/os/proj/js/plotpin/js/core/app.js)：

1. 探测运行时能力（IndexedDB、Service Worker）。
2. `loadSavedProject()` 收集三份候选——IndexedDB `current`、localStorage 草稿、`plotpin.rescue.draft` 救援副本——按 `meta.updatedAt` 择优；损坏候选保留原文供导出，不用空工程覆盖。
3. 注册同工程多标签编辑租约（`tab-lease.js`），显示加载审计横幅。
4. 没有已保存工程时才用本机设置兜底；加载产品目录。
5. 设置语言 → `I18N.apply` → `afterStateLoaded()` → `resizeCanvas()` → 首次进入时 `fitView()`。
6. 首次启动引导；IndexedDB 不可用时显式提示降级。
7. 仅在 `http/https` 注册 Service Worker；`file://` 双击本身即离线，不注册。

发行时 `scripts/build.mjs` 把入口、脚本与样式内联成一个 HTML；`--check` 重新构建并逐字节比对。SW 缓存版本由 `check-sw.mjs` 守护。

## 2. 分层与真实依赖方向

| 层 | 目录 | 职责 | 允许依赖 |
|---|---|---|---|
| 公共层 | `js/common/` | 零 DOM、可纯函数测试的算法/协议/vendor 适配：内容寻址资产、DXF、i18n、离线合并、PDF 读写、二维码、符号库 | 同层 + vendor |
| 核心层 | `js/core/` | 常量与类型、运行时状态、几何、坐标变换、渲染、交互、持久化、快照、租约、启动 | common + 同层 |
| 特性层 | `js/features/` | 面向用户的功能与面板：导入导出、工程库、报价、规则、插件、协作、快照 UI、属性、外壳、停车 | common + core（少量同层回调） |
| 启动 | `js/core/app.js` | 组装启动顺序 | 全部 |
| 工程脚本 | `scripts/` | 构建、门禁、自测、e2e、基准；不进入浏览器运行时 | Node 内置 |
| 测试 | `tests/` | 夹具、golden、e2e、浏览器性能 | 通过页面驱动产品代码 |

**名义方向**：`common → core → features → app`。

**门禁现在怎么查**：`check.mjs` 除了检查目录白名单与 `index.html` 加载顺序，还做三件事：

1. **状态写入口**：`state = ...` 只允许出现在 `model.js` 的 `let state` 声明和 `persistence.js` 的 `replaceState()` 函数体内；`scripts/**` 的测试夹具按文件白名单放行。
2. **跨层耦合计数**：按 `contracts/coupling.json` 的 `文件 + 符号 + 次数` 严格相等核对（9.2），覆盖 `core → features` 与 `common → core`。
3. **钩子配对**：`callHook ↔ registerHook` 一一配对，`REQUIRED_HOOKS` 6 个必须同时有提供方与调用点（9.3）；`typeof X==='function'` 形式的软调用必须按 `optional / required / host / param` 分类登记，次数只减不增（9.4）。

**当前基线**（2026-11-13 实测，取数：`node scripts/check.mjs` 与 `node -e "…contracts/coupling.json…"`）：

| 项 | 数量 | 说明 |
|---|---|---|
| `core → features` 引用 | 21 条（文件+符号，合计 86 次） | 历史反向调用，不能新增，只能逐条下调 |
| `common → core` 引用 | 3 条 | `merge.js` 读 `SETTINGS_KEYS` / `TITLE_BLOCK_FIELDS`，`qr.js` 调 `ensureVendor`；已知违规 |
| 软调用 | 12 条 | `required 5 / host 2 / optional 4 / param 1` |
| 必需钩子 | 6 个提供方 / 6 个调用点 / 6 个必需 | 启动首行 `assertHooksReady()` 校验 |

**为什么用次数而不是行号**：行号会随注释、空行、格式化漂移，基线一改就全员重录，最后只能不断放宽；`文件+符号+次数` 只在你真的新增/删除一处跨层调用时变化，能稳定回答“这次有没有加重耦合”。**不要引用审计报告里的旧行号**，以代码和 `contracts/coupling.json` 为准。

**仍然不能声称“依赖方向完全受控”**：静态扫描只认全仓唯一顶层声明，跳过同文件局部同名、对象字面量键与 1–2 字符标识符；软调用里 `required` 类仍是真实依赖，只是被登记而不是被消除。新增跨层调用时，优先复用提交协议（`commitChange` / `commitObjectEdit` / `markDirty`）或注册钩子，不要直接互调内部实现。

### 显式依赖钩子：起不来比悄悄不保存好

- `HOOKS` / `REQUIRED_HOOKS` / `registerHook` / `callHook` / `hookReady` 都定义在 `js/core/config.js`，不新增文件、不改加载顺序。
- `REQUIRED_HOOKS` 固定 6 项：`collab.onLocalChange`、`collab.broadcastFloor`、`collab.pendingCandidates`、`collab.pendingStorageKeys`、`ui.staleWriteBanner`、`ui.toast`。
- `app.js` 的 `init()` 第一行调用 `assertHooksReady()`；缺注册时直接抛错并列出缺失项，**不进入后续初始化**。
- 这是**有意的失败模式**：协作广播或保存横幅缺提供方时，旧实现会静默 no-op，表现为“能画、能导出，但改动不同步/保存失败不提示”；启动即失败能把装配错误暴露在开发与验收阶段，而不是等用户丢数据。
- `callHook` 对未注册的可选钩子仍返回 `undefined`；可选特性用 `hookReady(id)` 判断“未启用”，不要再用 `typeof` 猜“是不是忘了注册”。
- 重复注册、注册非函数都会抛错；门禁 9.3 与启动断言双重拦截，避免“谁提供了什么”失去意义。

### 一次编辑的数据流

```
pointer / keyboard
  → interaction.js：世界坐标、捕捉、草稿、命令分发
  → 调用方先 pushHistory()（或拖拽越过 2px 时补压）
  → 修改 state（对象 / 场地 / 底图 / 楼层）
  → commitChange / commitObjectEdit
      → touchFloor() 写楼层 updatedAt
      → state.meta.updatedAt = now
      → z 重排
      → markDirty(kind)
          → coverageResult = null、invalidateStatic()
          → scheduleSave()（450ms 防抖）
          → requestRender()（rAF）
          → 按 kind 刷新 UI
          → collabOnLocalChange()（按 kind 决定是否广播）
  → render.js：静态层按签名缓存，动态层每帧重绘
  → runSave()：IndexedDB 主写 + localStorage 兜底 + 可选工程库副本
```

`MARK_DIRTY_PROFILES` 定义六种提交粒度：`object`（全量刷新 + 广播）、`objectEdit`（只刷清单/图层/统计 + 广播）、`clear`（全量刷新、不广播）、`restore`（不刷 UI、广播）、`floor`（不刷 UI、不广播）、`settings`（全量刷新 + 广播）。见 [persistence.js](file:///d:/os/proj/js/plotpin/js/core/persistence.js) 的 `markDirty`。

## 3. 状态模型（细节见 DATA-MODEL）

- 唯一可编辑状态是 [model.js](file:///d:/os/proj/js/plotpin/js/core/model.js) 的全局 `let state`；历史栈是独立的 `let history = { past: [], future: [] }`，不塞进 `state`。
- **唯一整体替换入口是 `replaceState(next, opts)`**（[persistence.js](file:///d:/os/proj/js/plotpin/js/core/persistence.js#L679)）：入口内完成 `state = next`、活动层重新别名（`syncActiveFloor`）、叠放缓存/静态层失效、取景基准复位、瞬态清理、UI 刷新与底图加载。调用方不再逐个记得这些步骤。
  - `opts.quiet` 只用于两处：启动装载（`persistence.js` 的 `loadSavedProject`）与纯迁移重建（`buildProject` 后直接换现场）。`quiet` 只换现场、不触碰 DOM/底图，调用方稍后自行触发 UI。
  - 门禁 9.1 扫描 `state = ...` 直接赋值，只允许 `model.js` 的声明与 `replaceState` 函数体；绕过入口会直接变红。
- `state` 的顶层字段：`schema`、`meta`、`settings`、`rules`、`viewport`、`background`、`site`、`layers`、`objectTypes`、`objects`、`floors`、`activeFloorId`、`tombstones`。
- **活动楼层提升**：当前楼层的 `background / site / objects / viewport` 始终在 `state` 顶层；非活动楼层存在 `state.floors[i]`。切换楼层时 `syncActiveFloor()` 先回写、再装载目标楼层。
- `schema` 固定为 `offline-drawing-annotation/v2`；v1 只读兼容，读取时迁移并回写 v2，**不得改 schema 版本**。
- `settings` 的键白名单由 `createInitialState().settings` 派生（`SETTINGS_KEYS`），持久化与启动合并共用同一份清单。

## 4. 坐标系与变换

- **世界坐标**：米，Y 轴向上；负坐标合法。
- **屏幕坐标**：CSS 像素，Y 轴向下，左上角为原点；画布按 `devicePixelRatio` 放大后统一 `setTransform(dpr,0,0,dpr,0,0)`，绘制函数只处理 CSS 像素。
- 映射（[viewport.js](file:///d:/os/proj/js/plotpin/js/core/viewport.js)）：

```
w2s(p) = [panX + (p.x - frame.minX) * zoom, panY + (frame.maxY - p.y) * zoom]
s2w(p) = [(p.x - panX) / zoom + frame.minX, frame.maxY - (p.y - panY) / zoom]
```

`zoom` 是“每米多少屏幕像素”，上下限来自 `APP_LIMITS.ZOOM_MIN/ZOOM_MAX`。

- **取景框**：`computeWorldFrame()` 取“图片四角轴对齐包围盒 ∪ 可见场地包围盒”；都没有时回退 100×70。结果缓存在 `_frameRef`；场地几何变化后必须 `syncFramePan()` 或 `resetFrameRef()`，否则同一帧坐标映射漂移。
- **图片像素 → 世界**：`bgPixelToWorld()` 翻转 Y；校准点对经 `solveImageAffine()` 求 2×3 仿射——2 点走闭式相似解，≥3 点做两轴最小二乘（可含非等比缩放与切变）；点重合或共线报错。
- **整体变换**：`applyWorldTransform(M, opts)` 默认 `{objects:true, site:false, background:true}`；场地默认不迁移，需要时必须显式 `site:true`。返回摘要含 `degraded`。
- **形状随仿射迁移**：`affineShapeTransform()` 是对象与场地共用实现，内部用 `affineLinearSummary()` 做 2×2 SVD/极分解。圆/椭圆按精确主轴；平行四边形重算宽/高/倾角；扇形仅正向相似精确，其余按面积保真近似并返回 `degraded:'sector-affine'`。普通 `kind:'rect'`（无 `shape`）走另一条路径，切变分量被忽略——旋转矩形无法表示切变，这是已知降级。
- **图片自身变换**：只支持 2×3 仿射（平移/绕点旋转/等比缩放/切变）；四角自由透视需要 3×3 单应，超出当前数据结构，不提供。

## 5. 双槽位：图片底图 + 矢量场地

| 槽 | 字段 | 形态 | 约束 |
|---|---|---|---|
| 图片底图 | `state.background` | `kind:'empty'\|'image'`，含 `assetId / width / height / metersPerPixel / transform` | 栅格图，可为空 |
| 矢量场地 | `state.site` | `type` + 形状字段 + `id/name/layerId/visible/locked/annot/style/updatedAt`，无 `typeId` | 不进 `objects`，不占 O 编号、不占 CSV/XLSX 行 |

- 每层最多 1 图 + 1 场地；非活动楼层放在 `floors[i].background / site`。
- 新工程默认带一个 100×70 矩形场地（`defaultSiteShape()`）；“无场地”只出现在清空、导入旧档或手动删除后。
- 清空当前楼层会把 `site` 置 `null`，需要撤销时必须先 `pushHistory()`。
- 旧档迁移 `migrateBackgroundAndSite`：已有 `site` 字段就分别清洗；`background.kind==='image'` 保留图片并 `site=null`；其他旧背景迁入 `site`，`background` 置空图。
- 渲染顺序固定：图片 → 场地 → 网格 → 覆盖率 → 场地标注 → 坐标轴 → 业务对象 → 交互层。
- `sceneStaticKey()` 必须包含 `JSON.stringify(state.site)`；新增影响场地像素的字段时必须同步加入签名。
- 导出：JSON 双槽；PNG/PDF 走同一渲染顺序；SVG 输出图片与场地两层并补节点/段长/半径/面积周长；DXF 场地输出到独立 `SITE` 图层的 `LWPOLYLINE`；CSV/XLSX 不增加场地行。

## 6. 历史栈与撤销语义

- `history = { past: [], future: [] }`，深度上限 `APP_LIMITS.HISTORY_MAX = 20`。
- 快照不是整份深拷贝：`snapshotHistoryState(src, prev)` 与上一帧比较，未变化的对象/数组按引用共享，只重新分配变化的容器；字符串等原始值天然共享。
- 快照带不可枚举标记；`materializeHistoryState()` 只复制容器，不复制 base64。
- **`pushHistory()` 不会自动发生在每次状态修改里**：对象拖拽在 `pointerdown` 压栈，或首次越过 2px 阈值时补压；结束时内容未变或拖回原位则弹出空快照。输入提交、批量操作开始前、清空楼层前仍需显式调用。漏调用导致“改了撤销不回去”，重复调用产生冗余中间帧。
- `pushHistory()` 清空 `future`；`undo()/redo()` 恢复后走 `markDirty('restore')`。
- 校准使用独立的 `calibUndoStack`，不进入工程历史；确认后才落为一次工程变更。
- 协作合并落地也走历史栈：`mergeProjectJSON()` 默认“有变化就 pushHistory”；实时通道**一次连接内最多写一条远端历史**——首条真正覆盖本地内容时传 `{history:'overwrite'}`，之后传 `{history:false}`，纯新增/纯同步不挤占本地 20 条撤销。

## 7. 渲染管线与静态缓存

[render.js](file:///d:/os/proj/js/plotpin/js/core/render.js) 的 `drawScene()` 有两条路径：

- **交互路径**（`opt.interactive === true` 且 `markerScale` 为 `undefined` 或 `1`）：静态层画到离屏 canvas，动态层画到主 canvas。
- **直接路径**（导出/打印/离屏合成）：不读缓存，按同一顺序全量重绘，保证产物与旧行为一致。

静态层：底图、场地、网格、覆盖率、场地标注、坐标轴、全部可见对象（排除正在拖拽改形的对象）。
动态层：拖拽中的对象、差异叠加、草稿、校准、参考线、选择框、橡皮筋、光标、追踪线、场地/图片手柄、节点焦点、拖拽 HUD、捕捉标记、选择装饰。

关键不变量：

- **选择集不进入缓存签名**：选中对象保留在静态位图里，动态层只叠加虚线框/手柄；悬停同样只叠加动态层。
- `staticDragIds()` 返回逐帧改形的对象；拖拽开始与结束各重建一次静态层，选中/悬停为零次。
- 场地手柄与底图缩放手柄拖拽（`staticDragScene()`）不重建静态层：静态位图按 `zoom` 整体搬移，手柄与场地/底图由动态层逐帧绘制。
- 画布点选/框选只走 `refreshSelectionUI()`（`renderProps()` + `syncListSelection()`），不重建 `tbody`；10k 对象下重建列表约 240ms，不能进入点选热路径。
- 拖拽期对象索引 `dragObjectIndex(drag)` 在 pointerdown 建一次 `Map` 并挂在 `drag.index`，pointermove 复用。
- 缓存签名两级：`sceneStaticContentKey()` 只含“画什么”；`sceneStaticKey()` 再拼 `zoom/panX/panY`。
- 纯平移帧走位图搬移（`panScrollDelta()` / `scrollStaticLayer()`）；浮点平移与缩放变化整层重建。
- `invalidateStatic()` 只做 `staticRev++` 与清空 key；对象增删改、载入/撤销/重做、切楼层、覆盖率重算都必须调用。
- 对象编辑后的静态层局部补绘（`patchStaticObjects`，M6）：对每个受影响 id 取**旧 `staticBounds` ∪ 新 `objectSnapBounds`** 求补绘矩形（`patchUnionRect`，96 px pad、60% 面积阈值），`clip`/`clearRect` 恒等于该矩形；重绘 `view` 再按 pad 外扩（`applyPatchRect`），把矩形外 96 px 内的邻居一并重画，避免邻居标签被清掉一块。旧包围盒缺失或对象已删除时返回 false，调用方整层重建。边界：标签宽于 192 px（两侧各 96 px pad）仍可能被擦；拖拽期 `drag` 非空，直接走整层重建。
- 可见性剔除用 `visibleWorldRect()`（外扩 48 CSS px）；裁剪预筛用 `objectSnapBounds()` 的保守 AABB（只允许偏大）。
- 差异叠加只在 `interactive` 时绘制，不进入导出。
- **SVG/DXF 不走 canvas 管线**：SVG 由 `io-export` 直接拼节点，DXF 由 `dxf.js` 生成实体；三条路径共享几何源（`outlineOf`、`siteBounds`、符号 path），但渲染实现各自独立。修改几何必须同时验证 canvas、SVG、DXF 三类产物。

## 8. 持久化与协作概览

详细键位、写入链、迁移、资产 GC、快照与合并规则见 [DATA-MODEL](DATA-MODEL.md)。这里只列架构级事实：

- 主存是 IndexedDB `offline_drawing_annotation`；localStorage 只做草稿兜底与设置。**不是** `plotpin` 数据库（审计报告中的旧键名已过时，以代码为准）。
- 保存是 450ms 防抖 + 串行写链；失败按 `quota / idb / 瞬时` 分类，瞬时错误 1s/3s/9s 重试三次。
- 加载按三候选择优，损坏候选转救援副本，不覆盖用户数据。
- 离线协作无服务器：同机多标签 `BroadcastChannel`（前缀 `plotpin-collab-`），跨设备 WebRTC DataChannel；邀请串 `PLOTPIN-COLLAB:1:...` 手工交换。
- 合并是纯函数 `mergeProjectData(currentRaw, incomingRaw)`：对象按 id 并集，冲突按 `updatedAt` 较新者胜，同刻按稳定 JSON 字典序；删除用墓碑传播；楼层、场地、图层、类型各有独立规则。
- **M2 新增配置差异报告**：`mergeProjectData` 返回 `{project, stats, config}`；`config` 统计本地优先导致“远端配置未采纳（kept）”和“远端独有已补缺（adopted）”，不改变合并结果。`mergeProjectJSON` 仅在报告非空时把它挂到 `stats.config`，空报告不加键，避免破坏既有深比较。界面通过 `mergeConfigText()` 在协作状态栏、冲突提示、手动合并 toast 显示；报告异常只降级为 `config.error`，不阻断合并。
- **M1 多边形状**：`shape.type==='polygon'` 是“顶点即世界坐标”的例外形态，`polygonShapePoints()` 读取并过滤非有限坐标；面积、周长、命中、标签中心、捕捉包围盒都按点集处理，退化（<3 点）返回 0/不命中/退回锚点；旋转手柄对 polygon 无定义，直接早返回。残留：`collectSnap` 仍用 `rectPoints` 为 polygon 生成捕捉候选；`sanitizeAreaShape` 不接受 polygon，因此这类对象只能来自异常或外部写入。

## 9. 扩展点

### 插件

[plugins.js](file:///d:/os/proj/js/plotpin/js/features/plugins.js) 提供两条路径：

1. **受信任同源路径**：页面内 `<script>` 直接调用 `PlotPin.register*`，可访问完整 API；不做沙箱，只给已审查的自有插件。
2. **Worker 沙箱路径（推荐）**：`PlotPin.loadPlugin({id, apiVersion, capabilities, code})`。

沙箱约束（代码可证）：

- API 版本 `1.1.0`；只接受主版本 1、次版本不高于宿主；不兼容时返回可读原因，不创建 Worker。
- `capabilities` 白名单 8 项：`state:read / state:write / annotate / types / icons / export / import / rules`；未声明能力在 RPC 层拒绝。`rules` 只表示声明意图，沙箱内没有注册规则的 RPC 入口。
- Worker 启动时先捕获 `postMessage/addEventListener/setTimeout` 等绑定，再从全局删除 `fetch / indexedDB / XMLHttpRequest / WebSocket / EventSource / importScripts / caches / localStorage / sessionStorage / navigator / location / self / Worker / SharedWorker / close / BroadcastChannel / MessageChannel / MessagePort / onmessage / onerror` 等入口。
- 单次调用/初始化超时 2000ms，超时由主线程 `terminate()`；异常不影响主工程。
- 清单 schema `plotpin.plugin/v1`，上限 192KB（UTF-8 字节）；代码上限 64KB。
- 对外 API 面由 `contracts/plugin-api.json` 锁定，`check-plugin-api.mjs` 保证运行时 `PlotPin` 键集合与契约一致。

**未验证**：沙箱导出器在未声明 `state:read` 时只收到空 `input`，这是静态核对；运行期用例未覆盖（见 known-issues）。

### 规则

`js/features/rules.js` 维护 `RULE_REGISTRY`，内建三条：对象重叠、最小间距、越界。规则只做几何关系检查，**不是消防/规范审图，不内置任何规范数值**；违规上限 5000 条。配置存于 `state.rules` 随工程保存；自定义规则只能由受信任同源路径注册。

### 符号库

`js/common/symbols.js` 内置 36 个 24×24 线性图元、6 个分类。画布、SVG、PNG/PDF 共用同一 `path` 源；DXF 用 `symbolPolylinesInWorld()` 做折线近似。自有 SVG 导入走白名单解析：64KB / 200 元素 / 深度 16 / 200 条 path / 单 path 5000 字符，禁止 `script`、事件属性与外部引用。

## 10. 协作与安全现状

### 10.1 协作

- 同机多标签：`BroadcastChannel`，同源即可加入；不同工程靠消息里的 `pid` 隔离——双方都有 `pid` 且不一致时丢弃并计数；草稿/空 `projectId` 不跨工程放行。
- 跨设备：WebRTC DataChannel，无信令服务器；双方手工交换邀请串，SDP 用 base64。DataChannel 本身有 DTLS 传输加密，但**没有对端身份认证**：拿到邀请串的人就能加入。
- 在线表：每个对端记 `lastSeen`，watchdog 每 15s 发 `ping`，45s 无入站活动移出；`bye` / `stopAll` / `onclose` 同步清理。
- 分片：48,000 字符一片，单条载荷上限 8MB；入站分片 30s TTL、64 键、单缓冲 8MB、跨缓冲 16MB，超限按插入顺序淘汰最旧分片。
- 断线补发：传输不可用时把最新整工程快照写入 localStorage 待发队列（单条上限 2MB），恢复后先 `collabFlushPending()` 再握手与全量快照。
- 楼层操作 `floor-add / floor-delete / floor-clear` 显式广播整份可持久化工程，接收端仍走 `mergeProjectJSON()`，不另写合并逻辑。

### 10.2 安全边界（如实）

| 项 | 现状 | 证据 / 限制 |
|---|---|---|
| 网络 | CSP `default-src 'self' file:; connect-src 'self' file:; object-src 'none'; base-uri 'none'; form-action 'none'` | `index.html`；门禁扫描入口/CSS/JS 的远程引用 |
| 离线 | 无远程资源；SW 仅 http/https 注册；`file://` 直接运行 | `check.mjs` 第 4 步、`offline-scan.mjs` |
| 协作认证 | **无**。定位局域网临时协作，靠邀请串分发，无账号/密钥交换 | 这是产品取舍，不是遗漏；见 known-issues |
| 协作隔离 | 工程 `pid` 隔离 + 跨工程消息丢弃计数；不是安全边界，只是防串工程 | `collab.js` |
| 插件沙箱 | Worker + 能力白名单 + 删除网络/存储/通信全局 + 2s 超时 | 代码可证；沙箱不是浏览器进程级隔离，受信任同源路径仍拥有页面权限 |
| 导入 | JSON/SVG/CSV/DXF/PDF 都有清洗与上限；异常结构不覆盖当前工程 | `persistence.js`、`io-import.js`、`plugins.js` |
| 数据持久性 | 三候选加载、救援副本、保存失败可见、租约防多标签覆盖 | `persistence.js`、`tab-lease.js` |
| 浏览器 | **当前可复跑的自动化证据只有 Chromium**；Firefox/WebKit/Safari 未在本次重写中复跑 | `playwright.config.mjs` 默认 `browserName:'chromium'`；`e2e.mjs` 只校验 Chromium 二进制 |

**不要把“局域网临时协作”写成“安全协作”**：无认证、无授权、无审计；只适合可信网络内的临时交换。

## 11. 唯一源与改动检查

| 概念 | 唯一源 | 不要另起实现 |
|---|---|---|
| 资源上限/深度 | `APP_LIMITS`（[config.js](file:///d:/os/proj/js/plotpin/js/core/config.js)） | 魔法数字 |
| 世界取景框 | `computeWorldFrame()` | 各模块自行求包围盒 |
| 场地几何/手柄/面积 | `geometry-site.js` 的 `siteDomainOf / siteBounds / siteHandleList / siteAreaPerimeter` | 重复几何 |
| 对象轮廓 | `geometry.js` 的 `outlineOf` | 各导出各算 |
| 对象索引 | `model.js` 的 `objectIndexById` | 每次 `find` |
| 导出字段 | `io-fields.js` 的 `EXPORT_FIELD_DEFS` | 各格式自行拼字段 |
| vendor 取用 | `config.js` 的 `ensureVendor` | 直接读全局 vendor |
| 提交协议 | `persistence.js` 的 `commitChange / commitObjectEdit / markDirty` | 散落调用保存/重绘 |
| 插件 API 面 | `contracts/plugin-api.json` | 文档手写清单 |
| 工程 schema | `config.js` 的 `SCHEMA` | 各模块自行判断版本 |

改动前先确认：改的是状态模型（看 DATA-MODEL）、渲染（看 §7）、持久化（看 DATA-MODEL）、还是门禁（看 engineering）。改完至少跑 `node scripts/check.mjs --selftest` 与 `node scripts/build.mjs --check`；涉及 `js/**` 或 `index.html` 还要升 SW 版本并跑 `node scripts/check-sw.mjs --update`。
