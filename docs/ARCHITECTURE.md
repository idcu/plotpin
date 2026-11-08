# 架构（ARCHITECTURE）

本文只描述能从代码定位的设计决策：分层、坐标、双槽、历史、渲染、持久化、协作与扩展点。功能边界与操作说明不属于本文，分别见 [features](features.md) 与 [user-guide](user-guide.md)；逐文件接口见 [modules](modules.md)。

> 事实边界：本文每条设计都应能在标注的文件/函数中找到依据。无法由代码确认的内容标「待确认」，不照抄旧文档的历史结论。最后核对：2026-11-08。

## 1. 运行形态

PlotPin 是一个**无构建的单页应用**：`index.html` 用 45 个 classic `<script>` 顺序加载 35 个项目脚本和 10 个 vendor 模块，共享同一个全局词法作用域；不使用 ES Module、打包器或运行时依赖。加载顺序即依赖顺序，`scripts/check.mjs` 的分层检查会拒绝把脚本放到错误目录或提前加载。

- 唯一的可编辑状态是 `js/core/model.js` 里的全局 `let state`。非活动楼层的数据保存在 `state.floors` 中，活动的 `background / site / objects / viewport` 始终提升到 `state` 顶层；切换楼层时由 `syncActiveFloor()` 先回写，再装载目标楼层（[persistence.js](file:///f:/proj/plotpin/js/core/persistence.js) `switchFloorData`）。
- `js/core/app.js` 最后加载：读取设置、恢复工程、建立 Service Worker 之外的启动流程（[app.js](file:///f:/proj/plotpin/js/core/app.js)）。
- 发行时 `scripts/build.mjs` 把入口、脚本与样式内联为一个 HTML；`--check` 会重新构建并逐字节比对。
- Service Worker 只在 `http/https` 注册；`file://` 下探测能力后显式降级，不伪装成功。

## 2. 分层与依赖方向

| 层 | 目录 | 职责 | 允许依赖 |
| --- | --- | --- | --- |
| 公共层 | `js/common/` | 零 DOM、可纯函数测试的算法、协议与 vendor 适配器：内容寻址资产、DXF、i18n、离线合并、PDF 读取、二维码、符号库、PDF 导出适配 | 只依赖同层与 vendor |
| 核心层 | `js/core/` | 常量与内置类型、状态模型、几何、屏幕/世界变换、渲染、交互、持久化、快照、标签租约、启动 | 公共层 + 同层 |
| 特性层 | `js/features/` | 面向用户的功能与面板：导入导出、工程库、产品报价、规则、插件、协作、快照 UI、属性面板、外壳 UI、停车规划 | 公共层 + 核心层（少量同层回调） |
| 启动 | `js/core/app.js` | 组装启动顺序，最后加载 | 全部 |
| 脚本层 | `scripts/` | Node 侧构建、门禁、自测、e2e、基准与报告；不进入浏览器运行时 | Node 内置模块 |
| 测试层 | `tests/` | 自测夹具、golden 基线、Playwright e2e、浏览器性能基线 | 通过页面/脚本驱动，不直接改写产品代码 |

依赖方向为 `common → core → features → app`。`scripts/check.mjs` 的分层步骤按目录与 `index.html` 顺序校验；它**不做静态跨文件引用分析**，因此代码仍可能通过全局函数做运行时回调（例如持久化层调用 UI 的 `refreshUI` / `renderList`）。新增跨层调用时应优先走已有的提交协议，而不是直接互调内部函数。

### 一次编辑的数据流

```
pointer/keyboard
  → interaction.js：解析世界坐标、捕捉、草稿
  → 调用方先 pushHistory()（快照语义见 §5）
  → 修改 state（对象/场地/底图/楼层）
  → commitChange / commitObjectEdit
      → touchFloor() 写楼层 updatedAt
      → state.meta.updatedAt = now
      → z 重排
      → markDirty(kind)
          → coverageResult = null
          → invalidateStatic()
          → scheduleSave()（450ms 防抖）
          → requestRender()（rAF）
          → 按 kind 刷新 UI（full / lists / none）
          → collabOnLocalChange()（按 kind 决定是否广播）
  → render.js：静态层按签名命中缓存，动态层每帧重绘
  → runSave()：IndexedDB 主写 + localStorage 兜底 + 可选工程库副本
```

`MARK_DIRTY_PROFILES` 定义了五种提交粒度：`object`（全量刷新+广播）、`objectEdit`（只刷清单/图层/统计+广播）、`clear`（全量刷新、不广播）、`restore`（不刷 UI、广播）、`floor`（不刷 UI、不广播）。见 [persistence.js](file:///f:/proj/plotpin/js/core/persistence.js) `markDirty`。

### 捕捉候选收集（OSNAP）

[geometry.js](file:///f:/proj/plotpin/js/core/geometry.js) 的 `findOsnap()` 每次解析只做一趟对象扫描：`collectSnap(st, vis, box, parts)` 在同一个循环里同时收集特征点、可垂足边与正圆，`parts` 位掩码（`SNAP_CAND` / `SNAP_EDGE` / `SNAP_CIRCLE`）选择需要的类别；`collectSnapCandidates/Edges/Circles` 是它的薄包装，签名保持不变。

- 指针邻域 `box = [raw ± tol]` 只算一次；每个对象先用 `objectSnapBounds(o, scratch)` 做保守超集 AABB 预筛，远处对象不物化。`objectSnapBounds`/`pointBounds` 支持传入 scratch 复用，避免 O(N) 临时对象分配。
- 场地（不在 `objects`）的边角按逐点 `inBox` 过滤后追加；参考线不参与预筛（无限长，必须全量参与求交/垂足）。
- 语义等价性由 selftest「25b. 捕捉包围盒预筛等价性」守护：对 200 个随机点 × 4 种变体（默认 / `excludeIds` / `endpoint` / `tangent`）与全量扫描 oracle 逐点比对。

## 3. 坐标系与变换

- **世界坐标**：米，Y 轴向上，第一象限习惯但不强制；负坐标合法（场地节点可拖到任意位置）。
- **屏幕坐标**：CSS 像素，Y 轴向下，左上角为原点。画布按 `devicePixelRatio` 放大后统一 `setTransform(dpr,0,0,dpr,0,0)`，所有绘制函数只处理 CSS 像素。
- **映射**（[viewport.js](file:///f:/proj/plotpin/js/core/viewport.js)）：

  ```
  w2s(p) = [panX + (p.x - frame.minX) * zoom, panY + (frame.maxY - p.y) * zoom]
  s2w(p) = [(p.x - panX) / zoom + frame.minX, frame.maxY - (p.y - panY) / zoom]
  ```

  `zoom` 是"每米多少屏幕像素"，上下限来自 `APP_LIMITS.ZOOM_MIN/ZOOM_MAX`（0.02–200）。
- **取景框**：`computeWorldFrame()` 取"图片四角轴对齐包围盒 ∪ 可见场地包围盒"；两者都没有时回退 100×70。结果缓存在 `_frameRef`，场地几何变化后必须 `syncFramePan()`（用 pan 差值补偿）或 `resetFrameRef()`，否则同一帧内坐标映射会漂移。
- **图片像素 → 世界**：`bgPixelToWorld()` 把 y 向下翻转为 y 向上；校准点对经 `solveImageAffine()`（最小二乘）求 2×3 仿射。
- **世界整体变换**：`applyWorldTransform(M, opts)` 默认 `{objects:true, site:false, background:true}`。**场地默认不迁移**，这是"场地优先"的校准基准；需要迁移场地时必须显式传 `site:true`。返回摘要含 `degraded`（降级形状列表）。
- **形状随仿射迁移（N-12）**：`affineShapeTransform(M, shape, opts)` 是对象与场地共用的唯一实现，内部用 `affineLinearSummary()` 做 2×2 SVD/极分解。圆/椭圆按精确主轴成像（共轭直径正交时保留 `rx/ry` 约定，否则取 SVD 主轴）；平行四边形用映射后的两条边向量重算宽/高/倾角/朝向；扇形仅正向相似精确，其余按面积保真近似并返回 `degraded:'sector-affine'`；`opts.allowRotatedBox=false`（场地）把旋转/切变的矩形退化为精确多边形。已存坐标不回溯迁移。
- **图片自身变换**：只支持 2×3 仿射（平移/绕点旋转/等比缩放/切变），由 `affTranslate / affRotateAbout / affScaleAbout / affShearX` 组合。四角自由透视需要 3×3 单应，超出当前数据结构，因此不提供——这是设计取舍，不是遗漏。

## 4. 双槽位：图片底图 + 矢量场地

状态模型见 [model.js](file:///f:/proj/plotpin/js/core/model.js) `createInitialState()`：

| 槽 | 字段 | 形态 | 约束 |
| --- | --- | --- | --- |
| 图片底图 | `state.background` | `kind: 'empty' | 'image'`，含 `assetId / width / height / metersPerPixel / transform` | 栅格图，可为空 |
| 矢量场地 | `state.site` | `type` + 形状字段 + `id/name/layerId/visible/locked/annot/style/updatedAt`，无 `typeId` | 不进入 `objects`，不占 O 编号、不占 CSV/XLSX 行 |

- 每层最多 1 图 + 1 场地；非活动楼层把两槽放在 `floors[i].background / site`，活动楼层放在顶层。
- 新工程默认带一个 100×70 矩形场地（`defaultSiteShape()`），所以"无场地"只出现在清空、导入旧档或手动删除之后。
- 清空当前楼层会把 `site` 置 `null`（`clearCurrentFloor`），因此需要撤销时必须先 `pushHistory()`。
- 旧档迁移（`migrateBackgroundAndSite`，顶层与每个楼层共用）：
  - 已有 `site` 字段：分别清洗 `background` 与 `site`；
  - `background.kind === 'image'`：保留图片，`site = null`；
  - 其他旧背景：迁入 `site`，`background` 置为空图。
- 渲染顺序固定为：图片 → 场地 → 网格 → 覆盖率 → 场地标注 → 坐标轴 → 业务对象 → 交互层。与项目红线一致，场地始终在图片之上、对象之下。
- `sceneStaticKey()` 必须包含 `JSON.stringify(state.site)`；场地形状、标注或可见性变化都会使静态层失效。新增影响场地像素的字段时，必须同时加入该签名。
- 导出规则：JSON 双槽存储；PNG/PDF 走同一渲染顺序；SVG 输出图片与场地两层并补齐场地节点/段长/半径/面积周长；DXF 场地输出到独立 `SITE` 图层的 `LWPOLYLINE`；CSV/XLSX 不增加场地行。

## 5. 历史栈与撤销语义

- `state.history = { past: [], future: [] }`，深度上限 `APP_LIMITS.HISTORY_MAX = 20`。
- 快照不是整份深拷贝：`snapshotHistoryState(src, prev)` 与上一帧比较，未变化的对象/数组按引用共享，只有变化的容器重新分配（[model.js](file:///f:/proj/plotpin/js/core/model.js)）。字符串等原始值天然共享，这是"20 条含照片历史"内存可用达标的基础。
- 快照带不可枚举标记；撤销/重做时 `materializeHistoryState()` 只复制容器，不复制 base64。
- **`pushHistory()` 不会自动发生在每次状态修改里**：交互在拖拽/输入结束时、批量操作开始前、清空楼层前显式调用。漏调用会导致"改了但撤销不回去"；重复调用会产生冗余中间帧。
- `pushHistory()` 会清空 `future`。`undo()` / `redo()` 恢复后调用 `markDirty('restore')`，保证刷新后仍停在撤销后的状态，而不是回滚到旧自动保存。
- 校准过程使用独立的 `calibUndoStack`，不进入工程历史；校准确认后才落为一次工程变更。
- 协作合并落地也走历史栈：`mergeProjectJSON()` 默认"有变化就 `pushHistory()`"；实时通道传 `{history:'overwrite'}`，只有远端覆盖本地内容（updated/deleted/floorMetaUpdated/floorsDeleted）时才入栈，纯新增/纯同步不挤占 20 条上限。见 [persistence.js](file:///f:/proj/plotpin/js/core/persistence.js) `mergeProjectJSON`。

## 6. 渲染管线与静态缓存

[render.js](file:///f:/proj/plotpin/js/core/render.js) `drawScene()` 有两个路径：

- **交互路径**（`opt.interactive === true` 且 `markerScale === 1`）：静态层画到离屏 canvas，动态层画到主 canvas。
- **直接路径**（导出/打印/离屏合成）：不读缓存，按同一顺序全量重绘，保证产物与旧行为一致。

静态层内容：底图、场地、网格、覆盖率、场地标注、坐标轴、**未选中**的可见对象。动态层内容：选中对象、差异叠加、草稿、校准、参考线、选择框、橡皮筋、光标、追踪线、场地/图片手柄、节点焦点、拖拽 HUD、捕捉标记。

- **缓存签名** `sceneStaticKey()` 收敛所有影响静态层像素的输入：视口（zoom/pan）、画布 CSS 尺寸、DPR、`staticRev`、世界取景框、`state.settings`、`state.site`、底图 transform/资产/尺寸/比例、底图层可见性、`selectedIds`、覆盖率结果摘要。
- **失效入口** `invalidateStatic()` 只做 `staticRev++` 与清空 key。对象增删改、载入/撤销/重做、切换楼层、覆盖率重算都必须调用；漏调会留下过期像素。
- 静态层 canvas 尺寸随 CSS 尺寸与 DPR 重建，重建时必须调用 `markSurfaceSize()` 以维持统一的尺寸记账。
- 可见性剔除用 `visibleWorldRect()`（外扩 48 CSS px），避免标签/图标在边界处被裁掉；对象按 `z` 升序绘制。
- 差异叠加 `drawDiffOverlay()` 只在 `interactive` 时绘制，**不进入导出**。
- SVG/DXF 不走 canvas 管线：SVG 由 `io-export` 直接拼节点，DXF 由 `dxf.js` 生成实体；三条路径共享几何源（`outlineOf`、`siteBounds`、符号 path），但渲染实现各自独立。修改几何时必须同时验证 canvas、SVG、DXF 三类产物。

## 7. 持久化、迁移与资产命名空间

### 存储位置

| 数据 | 介质 | 键/命名空间 |
| --- | --- | --- |
| 当前工程 | IndexedDB `offline_drawing_annotation` / store `projects` | `current` |
| 工程库副本 | 同上 | `proj:<projectId>`（`projectKey`） |
| 内容寻址资产 | 同上 / store `assets` | 资产 id（内容哈希） |
| 版本快照 | 同上 | `snap:<projectId>:<snapId>` |
| 产品目录 | IndexedDB | `catalog:current` |
| 最近报价 | IndexedDB | `quote:last` |
| 草稿兜底 | localStorage | `offline-drawing-annotation.project` |
| 界面设置 | localStorage | `offline-drawing-annotation.settings` |

Schema 为 `offline-drawing-annotation/v2`；`v1` 只读兼容，读取时迁移并回写 v2。v1→v2 的关键变化是给每个楼层补 `updatedAt`：旧档缺失时写空串，避免打开旧文件就把该层误判为"最新写入"而在协作中覆盖他人。

### 保存链路

`scheduleSave()` 450ms 防抖 → `runSave()`：

1. 先写当前工程 `current`；
2. 若工程已绑定工程库（`state.meta.projectId`），再写 `proj:*` 副本；副本失败只降级提示，不重试；
3. 设置每次写 localStorage；草稿兜底只在 IndexedDB 写入失败时写；
4. 失败分类：`quota` 不重试并提示导出/清理；`idb` 提示降级；其他瞬时错误按 1s/3s/9s 重试三次。

加载侧 `loadSavedProject()` 先读 IndexedDB，失败再读 localStorage；若读到结构损坏的工程，会进入"救援"模式保留原文并可导出，避免用空工程覆盖用户数据（加载审计由 D-07 交付；相关限制见 [known-issues](known-issues.md)）。

### 资产可达集

资产按内容哈希去重，引用只存 `assetId`，不复制 base64。回收时扫描的命名空间必须并集覆盖：

- 当前草稿；
- `history.past` 与 `history.future`；
- 剪贴板与拖拽原件；
- 自动保存草稿；
- 全部 `proj:*` 工程库记录；
- 全部 `snap:*` 快照。

`ContentAssets.collectAssetRefs()` 只负责"一个工程对象内"的引用；跨帧/跨命名空间由 `persistence.js` 的 `assetRefsInMemory` 汇总。清理失败时**一个资产都不删**（fail-safe），不允许部分成功。

### 快照

`snap:` 命名空间与工程主记录完全隔离，上限 20 条 / 16MB 每工程；超出淘汰最旧并至少保留 1 条。快照存 `assetId` 引用而非图片副本；删除快照或删除工程后对应资产可被正常回收。回滚前必须把当前状态 `pushHistory()`，回滚后仍可继续编辑与撤销。

## 8. 协作合并：LWW 与墓碑

离线合并是 `js/common/merge.js` 的纯函数 `mergeProjectData(currentRaw, incomingRaw)`：

- `A = 本地`，`B = 远端`。对象按 id 取并集，内容签名忽略 `z`（叠放顺序不传播）。
- 冲突判定：内容不同即 `conflicts++`；时间戳较新者胜；时间相同则按稳定 JSON 字典序取较大者，保证两端结果一致。
- 删除墓碑按 `(kind, id)` 保留最晚 `deletedAt`；`deletedAt >= 对象时间` 时删除生效，且会清理已过期的墓碑。
- 楼层墓碑：`deletedAt >= max(两侧楼层写入时间)` 时整层删除，胜过该层所有较早编辑；合并结果至少保留一层。
- 场地 LWW：`site.updatedAt` 优先，缺失时退回楼层 `updatedAt`；时间相同且本地无场地、远端有场地时保留远端。
- 图层与对象类型按 id 并集，同 id 以本地为准；规则配置本地优先；设置项本地覆盖远端；`meta` 本地覆盖远端但 `updatedAt` 取较晚者。
- 对象 `updatedAt` 打点：`persistence.js` 的 `stampObjects(ids)` 是唯一助手，`commitChange(message, ids)` / `commitObjectEdit(ids)` 只对实际变化的 id 打点；批量显隐/图层/对齐/重编号与节点增删都传入变化 id，无变化提交（无 id）不产生新时间戳。几何拖拽在 `interaction.js` 内对单个对象直接更新时间戳（`dragChangedIds` 判定是否真实变化）。同一毫秒内连续提交按 +1ms 单调递增，避免后一次编辑被 LWW 判旧。
- 合并只产出一个工程对象与统计 `{added, updated, deleted, siteDeleted, siteCleared, conflicts, floorsAdded, floorMetaUpdated, floorsDeleted}`；落地由调用方决定是否入撤销栈。

实时通道在 [collab.js](file:///f:/proj/plotpin/js/features/collab.js)：

- 同机多标签用 `BroadcastChannel`（前缀 `plotpin-collab-`），跨设备用 WebRTC DataChannel；**无服务器**。
- 消息按 48,000 字符分片，单条载荷上限 8MB；入站分片有 30s TTL、64 个键与 16MB 上限，防止内存放大。
- 发邀请串 `PLOTPIN-COLLAB:1:...`，SDP 为 ASCII 所以用 base64；超过内置二维码容量（固定 Version 3-M，42 字节）时不渲染假二维码，改为可粘贴文本。
- 收到远端工程后按 §8 合并；本地未同步修改不因断线丢失：`collabOnLocalChange()` 在传输不可用时把最新整工程快照写入 localStorage 待发队列（单条上限 2 MB，超限/写盘失败显式提示），传输就绪后先 `collabFlushPending()` 再握手与全量快照，成功才清队列。
- 自动重连：本机频道异常丢失时 `collabCheckTransport()` 触发指数退避（1s 起翻倍、封顶 5 分钟）重建 `BroadcastChannel`；WebRTC 无信令通道，DataChannel 异常断开只明确提示重新交换邀请串，不做假重连。
- 楼层新增/删除/清空使用 `floor-add` / `floor-delete` / `floor-clear` 显式广播，消息体携带整份可持久化工程，接收端仍走 `mergeProjectJSON()` 的墓碑与场地 LWW，不另写合并逻辑；发送/接收共用 `COLLAB_FLOOR_OPS` / `COLLAB_FLOOR_TYPES` 映射表。
- 跨工程隔离与冲突可见性（N-17）：每条消息附带 `pid`（已绑定工程为 `p:<projectId>`，草稿为空串），双方都有 `pid` 且不一致时丢弃并计数，界面对「已丢弃跨工程消息」告警；合并统计统一走 `collabMergeChanged()` / `collabMergeOverwritten()`，`changed` 计入 `conflicts`，避免「只有冲突、远端没覆盖」时误报「无变化」，且纯冲突不提供撤销回滚。

## 9. 扩展点

### 插件

[plugins.js](file:///f:/proj/plotpin/js/features/plugins.js) 提供两条路径：

1. **受信任同源路径**：直接注册对象类型/导出器/导入器/规则，可访问完整 API。
2. **Worker 沙箱路径**（推荐）：`PlotPin.loadPlugin({id, apiVersion, capabilities, code})`。

沙箱约束：

- 插件 API 版本 `1.1.0`；只接受主版本 1、次版本不高于宿主；不兼容时返回可读原因，不创建 Worker。
- `capabilities` 是白名单，共 8 项：`state:read / state:write / annotate / types / icons / export / import / rules`；未声明能力在 RPC 层直接拒绝。
- Worker 启动时先捕获 `postMessage/addEventListener/setTimeout` 等绑定，再从全局删除 `fetch / indexedDB / XMLHttpRequest / WebSocket / importScripts / caches / localStorage / navigator / location / self / Worker / close` 等入口；插件无 DOM、无网络、无存储、不能直接逃逸到主线程；但浏览器广播通道（`BroadcastChannel` 等）未封堵，可绕过能力白名单读取/伪造协作消息（见 [known-issues](known-issues.md) P0-4）。
- 单次调用/初始化超时 2000ms，超时由主线程 `terminate()`；异常不得影响主工程。
- 清单 schema 为 `plotpin.plugin/v1`，上限 192KB，代码上限 64KB；清单校验是纯函数，失败无副作用。
- 对外 API 面由 `contracts/plugin-api.json` 锁定，`check-plugin-api.mjs` 保证运行时 `PlotPin` 键集合与契约一致。

### 规则

`js/features/rules.js` 维护 `RULE_REGISTRY`，内建三条：对象重叠、最小间距、越界。规则只做几何关系检查，**明确不是消防/规范审图，不内置任何规范数值**；上限 5000 条违规。配置存于 `state.rules` 随工程保存；自定义规则只能由受信任同源路径注册，沙箱插件只能"声明规则意图"。

### 符号库

`js/common/symbols.js` 内置 36 个 24×24 线性图元、6 个分类。画布、SVG、PNG/PDF 共用同一 `path` 源；DXF 用 `symbolPolylinesInWorld()` 做折线近似，属明确降级。自有 SVG 导入走白名单解析：64KB / 200 元素 / 深度 16 / 200 条 path / 单 path 5000 字符，禁止 `script`、事件属性与外部引用。

## 10. 唯一源与改动检查

| 概念 | 唯一源 | 不要另起实现 |
| --- | --- | --- |
| 资源上限/深度 | `APP_LIMITS`（[config.js](file:///f:/proj/plotpin/js/core/config.js)） | 魔法数字 |
| 世界取景框 | `computeWorldFrame()` | 各模块自行求包围盒 |
| 场地几何/手柄/面积 | `geometry-site.js` 的 `siteDomainOf / siteBounds / siteHandleList / siteAreaPerimeter` | 重复几何 |
| 对象轮廓 | `geometry.js` 的 `outlineOf` | 各导出各算 |
| 对象索引 | `model.js` 的 `objectIndexById` | 每次 `find` |
| 导出字段 | `io-fields.js` 的 `EXPORT_FIELD_DEFS` | 各格式自行拼字段 |
| vendor 取用 | `config.js` 的 `ensureVendor` | 直接读全局 vendor |
| 提交协议 | `persistence.js` 的 `commitChange / commitObjectEdit / markDirty` | 散落调用保存/重绘 |
| 插件 API 面 | `contracts/plugin-api.json` | 文档手写清单 |

改动对应的命令矩阵、产物口径与发布检查见 [engineering](engineering.md)；性能阈值与实测数据见 [performance](performance.md)。
