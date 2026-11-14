# 数据模型与持久化（DATA-MODEL）

> **读者**：要改状态结构、存档、迁移、合并、导入导出或协作同步的开发者。
> **回答**：状态长什么样、存在哪、怎么写、怎么读、怎么迁移、怎么合并、哪些兼容性不能破。
> **不回答**：画面怎么画（见 [ARCHITECTURE](ARCHITECTURE.md)§7）、逐文件接口（见 [modules](modules.md)）、门禁命令（见 [engineering](engineering.md)）。
> **事实边界**：以当前代码为准，核对 2026-11-13（基线 `2123a46` + M1/M2 工作区修复）。

## 1. 状态总览

唯一可编辑状态是 [model.js](file:///d:/os/proj/js/plotpin/js/core/model.js) 的全局 `state`；撤销栈是独立的 `history`，不放进 `state`。

**整体替换只走 `replaceState(next, opts)`**：载入工程、撤销/重做、切换楼层、快照回滚、协作合并、导入 JSON 等“换现场”操作都调用它，而不是直接 `state = ...`。入口统一承担：赋值、活动层重新别名、`zVersion` 递增（命中缓存失效）、静态层重建、取景基准复位、瞬态清理、`refreshUI()` 与底图加载。

- `quiet: true` 只有两处：启动装载（`loadSavedProject`）与纯迁移重建（`buildProject(p)` 后换现场）。此模式只换内存现场，不碰 DOM/底图，调用方随后自行完成 UI 与底图。
- 门禁 `check.mjs` 9.1 扫描 `state = ...` 直接赋值；只允许 `model.js` 的 `let state` 声明、`replaceState()` 函数体与 `scripts/**` 明确登记的测试夹具。新增换现场路径必须走入口，否则门禁红。

```js
state = {
  schema: 'offline-drawing-annotation/v2',
  meta: { id, projectId, name, createdAt, updatedAt, titleBlock },
  settings: { /* 白名单键，见 createInitialState().settings */ },
  rules: { version, scope, overlap:{enabled,tolerance}, spacing:{enabled,types}, bounds:{enabled,tolerance} },
  viewport: { zoom, panX, panY },          // 活动楼层视口
  background: { kind:'empty'|'image', ... }, // 活动楼层图片槽
  site: { id, name, type, ...形状, layerId, visible, locked, annot, style, updatedAt } | null,
  layers: [{ id, name, visible, locked, color? }],
  objectTypes: [{ id, name, prefix, builtin, defaultStyle, ... }],
  objects: [ /* 活动楼层对象 */ ],
  floors: [{ id, name, updatedAt, background?, site?, viewport?, objects? }],
  activeFloorId,
  tombstones: [{ id, kind:'object'|'floor'|'layer'|'type', deletedAt }]
}
```

### 1.1 活动楼层提升

- 活动楼层的 `background / site / objects / viewport` 始终在 `state` 顶层；`floors[i]` 里不再重复保存这些字段（`persistableState()` 会删除活动层重复字段）。
- 非活动楼层的数据完整存在 `floors[i]`。
- 切换楼层：`syncActiveFloor()` 先回写当前层 → 装载目标层到顶层 → `activeFloorId` 更新。
- **任何工程级遍历都必须用 `projectObjectLists(state)`**，不能只扫 `state.objects`，否则非活动楼层会被静默漏掉。

### 1.2 对象

对象是 `{ id, kind, name, typeId, layerId, updatedAt, createdAt, ... }`。`kind` 固定五类：`point / rect / line / text / dimension`。形状细节：

- 普通矩形/圆/扇形等用 `kind:'rect'` + `shape`（`rect / circle / sector / parallelogram`）。
- 线段/多段线用 `kind:'line'` + `points`。
- 文本用 `kind:'text'` + `x/y/text/rotation/height`。
- 尺寸标注用 `kind:'dimension'` + `points/subtype`。
- **多边形状**：`shape.type==='polygon'`，顶点存世界坐标；面积/周长/命中/标签中心/捕捉包围盒都按点集处理（M1 修复）。旋转手柄对 polygon 无定义；`sanitizeAreaShape` 不接受 polygon，因此只能来自异常或外部写入。

对象编号 `name`（如 `O0001`）由编号作用域分配；导入时重名走重编号，不覆盖现有对象。

### 1.3 双槽位：`background` 与 `site`

| 槽 | 允许内容 | 关键约束 |
|---|---|---|
| `background` | `kind:'empty'` 或 `kind:'image'` + `assetId/width/height/metersPerPixel/origin/calibrated/transform` | 栅格图；`dataUrl` 只在旧档/导入/IDB 不可用时出现，保存前尽量资产化 |
| `site` | 矢量场地：`type` + 形状字段 + `id/name/layerId/visible/locked/annot/style/updatedAt` | 不进 `objects`，不占 O 编号、不占 CSV/XLSX 行 |

- 每层最多 1 图 + 1 场地；新工程默认 100×70 矩形场地。
- 旧档迁移：有 `site` 按新档清洗；否则 `background.kind==='image'` 保留图片、`site=null`；其他旧背景迁入 `site`，`background` 置空图。

### 1.4 图层、类型、规则、设置

- `layers`：内置 `layer.default` 不可删；删除图层时调用 `migrateRefsAndDelete('layer', from, to)` 把全楼层引用迁走并写墓碑。
- `objectTypes`：内置类型的 `builtin` 标记不参与合并删除；删除类型同样迁移引用并写墓碑。
- `rules`：工程级配置，随工程保存；内建三条规则，不含规范数值。
- `settings`：本机/工程共用白名单，`SETTINGS_KEYS` 由 `createInitialState().settings` 派生；`sanitizeSettings()` 只读自有键，挡住 `__proto__` 等原型键。

## 2. Schema 与兼容底线

- 当前 `SCHEMA = 'offline-drawing-annotation/v2'`；可读 `v1`。
- **不得改 schema 版本**。v1 读取时迁移为 v2，下一次保存写回 v2；迁移不丢数据。
- 键布局变化必须一次性迁移 + 双读兼容；禁止“只写新键、不读旧键”。
- 迁移入口是 `buildProject(p)`：清洗 → 迁移 → 返回新状态；`migrateProject(p)` 只是“迁移并替换 `state`”的便捷包装。需要失败回滚的路径必须用 `buildProject`，不要直接替换现场。
- 迁移/清洗会输出 `lastSanitizeReport`（重复 id、重命名、丢弃、截断），并追加到加载审计，不允许静默丢对象。

## 3. 存储拓扑

### 3.1 IndexedDB

| 项 | 值 | 说明 |
|---|---|---|
| 数据库 | `offline_drawing_annotation` | 不是 `plotpin`（审计报告旧键名已过时） |
| 版本 | `2` | 升级时补建缺失 store |
| `projects` store | 工程记录 | 键：`current`（自动保存）、`proj:<id>`（工程库）、`snap:<pid>:<sid>`（版本快照）、`snapidx:<pid>`（快照索引） |
| `assets` store | 内容寻址资产 | 键 `as…`，由 `ContentAssets` 管理；底图/照片按内容哈希去重 |

工程记录就是 `persistableState()` 的结果；快照记录是 `{meta, data}` 外壳，资产引用在 `data` 里。

### 3.2 localStorage

| 键 | 用途 | 失败/上限行为 |
|---|---|---|
| `offline-drawing-annotation.project` | 自动保存的兜底草稿 | IDB 不可用或写失败时保留；容量有限 |
| `offline-drawing-annotation.settings` | 本机设置 | 与工程设置同一白名单 |
| `plotpin.rescue.draft` | 救援副本 `{v:1,at,snapshot}` | 损坏候选原样保留，供导出；不覆盖主记录 |
| `plotpin-collab-pending:*`（以及旧单键/备份键） | 协作断线待发快照 | 单条上限 2MB；恢复后先 flush 再握手 |

### 3.3 资产

- 内容寻址：同一字节内容 → 同一 `assetId`；底图与设备照片共用资产库。
- 保存前 `ensureProjectBackgroundAssets()` / `ensureObjectPhotoAssets()` 把内嵌 `dataUrl` 转成 `assetId`；IDB 不可用时保留 `dataUrl` 照常运行。
- 超过单张资产上限的照片不会进资产库；持久化副本会剥离 `photoDataUrl`，实时状态仍保留供当前会话查看。

## 4. 写入链

```
状态修改
  → markDirty(kind)                       // 清覆盖率、invalidateStatic、按 kind 刷 UI、协作广播
  → scheduleSave()                         // 450ms 防抖；救援/租约模式直接暂停
  → runSave() → saveChain 串行
      → ensureProjectBackgroundAssets(state)
      → snapshot = persistableState()
          syncActiveFloor()
          deepClone(state)
          scrubBackgroundForSave()         // dataUrl/超限照片只在副本上剥离
          删除活动楼层在 floors[] 中的重复字段
      → idbPutCurrentAndProjectGuarded(snapshot, projectId)
          // 租约过期/另一标签写入 → stale：不覆盖，写 localStorage 草稿并提示
      → localStorage.setItem(SETTINGS_KEY, settingsForStorage(snapshot.settings))
```

- 保存序号 `saveSeq / lastSavedSeq` 防止旧状态覆盖新状态；`await` 期间状态变化不会写错序号。
- 失败分类：`quota / idb / 瞬时`。瞬时错误按 `SAVE_RETRY_MS = [1000, 3000, 9000]` 重试三次；最终失败显示横幅，`saveHealth` 记录状态。
- 切工程前 `flushPendingSave()` 强制落盘旧现场；失败则取消切换。
- 卸载/隐藏页面前 `flushBeforeUnload()` 尽力同步落盘。
- **保存不是“写完就完”**：`persistableState()` 是唯一序列化入口；不要在别处拼工程对象。

## 5. 读取链

`loadSavedProject()` 收集最多四类候选：

1. IndexedDB `current`；
2. localStorage 草稿 `LS_KEY`；
3. 救援副本 `RESCUE_KEY`；
4. 协作待发快照（`collabPendingCandidates()`）。

规则：

- 每个候选先 `auditProject()`：schema 不可读/JSON 损坏/结构非法为 `error`；楼层空、活动层无效、id 重复、未知图层、资产缺失、场地损坏为 `warn`。
- 只在“可读 + schema 兼容”的候选里按 `meta.updatedAt` 选最新；时间相同优先 IndexedDB。
- 采用较新的本地草稿时**不删除** IndexedDB 原记录，避免“选新反而丢旧”。
- 损坏候选原样转为救援副本，由横幅提供导出入口；**绝不用空工程覆盖用户数据**。
- 选中后 `migrateProject()` → `ensureBackgroundAsset()` 把内嵌底图资产化。
- 无 pid 的协作待发记录只与无 pid 草稿同权；存在任何带 pid 的候选时不参选。

## 6. 迁移与清洗

`buildProject(p)` 的固定顺序（不要跳步）：

1. `createInitialState()` 作为基线；
2. `meta` 归一，补 `titleBlock` 默认模板（旧档 `enabled:false`，不改变既有导出）；
3. `sanitizeSettings()` 白名单；
4. `sanitizeLayers()`；
5. `migrateBackgroundAndSite()` 拆双槽；
6. `sanitizeViewport()`、`mergeTypes()`；
7. 建立 `nameSeed` 编号作用域（当前工程 + 待导入工程的全部编号），避免导入 1 万对象时 O(N²)；
8. `sanitizeObjects()`：重复 id/重名/缺失字段/超限点与 props 统一修正并计数；
9. `sanitizeTombstones()`；
10. 楼层逐层清洗；活动层数据取顶层；
11. 回填 `schema:SCHEMA`，返回新状态。

兼容规则：

- v1 可读，读后写回 v2；**不升 schema 版本号**。
- 楼层 `updatedAt` 缺失写空串（LWW 最旧），未来/非法时间归一为空串。
- 楼层重名只告警不改名，避免静默改数据。
- 墓碑按 `(kind,id)` 去重取最晚删除时间；只有超过保留窗口（730 天）或硬上限（100000）才淘汰，防止离线合并复活已删对象。

## 7. 资产 GC

`pruneBgAssets()` 的唯一判据是“任一命名空间仍引用就保留”：

- 内存：`state`、`history.past/future` 每一帧、`clipboard`、`drag.originals`；
- IndexedDB：`current`、每个 `proj:<id>`、每个 `snap:<pid>:<sid>`（解包 `data`）；
- localStorage：草稿、救援副本、协作待发（含旧单键/备份/分片）。

任何扫描失败（IDB 不可用、本地副本解析失败、单键读取失败）都**整体放弃回收**并提示，宁可晚回收也不误删。删除快照/历史后延迟 800ms 触发，避免与保存抢同一事件循环。

## 8. 版本快照

- 键空间：`snap:<projectId>:<snapshotId>`，索引 `snapidx:<projectId>`；与草稿、工程库隔离。
- 只保存可序列化工程数据；底图/照片只存 `assetId / photoId` 引用，不复制 base64。
- 上限：每工程 20 条、16MB；超出淘汰最旧；单条超限仍保留。
- 快照资产保活：GC 必须解包 `{meta,data}` 再收集引用，否则快照回滚时底图/照片会失效。
- 差异对比按对象 id 跨楼层匹配，分类为新增/删除/属性修改/移动/换楼层/类型变更；忽略 `id/createdAt/updatedAt/z`。

## 9. 合并（离线与协作共用）

`mergeProjectData(currentRaw, incomingRaw)` 是纯函数，返回 `{project, stats, config}`；无 DOM、无 IO。

### 9.1 对象

- 按 `id` 取并集；冲突按 `updatedAt` 较新者胜。
- 同一时间戳用稳定 JSON 字典序兜底，保证结果确定。
- 删除用墓碑传播：删除时间 **不早于** 对象更新时间即生效（平局删除胜）；删除时间早于对象更新时间时墓碑失效，较新编辑可让对象复活。

### 9.2 楼层

- 按 `id` 合并；新增楼层追加。
- 楼层最后写入时间 = `max(楼层 updatedAt, 场地 updatedAt, 该层全部对象 updatedAt)`；场地单独编辑只写 `site.updatedAt`，必须纳入判定。
- 楼层墓碑晚于最后写入时整层删除；否则墓碑失效。
- 至少保留一层，不产出空工程。

### 9.3 图层/类型/场地

- 图层、对象类型按 id 取并集，**本地优先**；墓碑直接删除定义（内置类型与 `layer.default` 除外）。
- 悬空引用由调用方的 `migrateProject()` 统一迁移，合并函数本身不重复实现清洗。
- 场地：本地优先；远端独有且本地缺失时补缺；删除/清空用墓碑与 `siteDeleted/siteCleared` 统计。

### 9.4 配置差异报告（M2）

- 合并结果不变：`meta/settings/rules/titleBlock/layers/objectTypes` 仍“本地优先，远端仅补缺”。
- `config` 统计：
  - `kept`：双侧都有且不同，本地胜，远端配置未采纳；
  - `adopted`：仅远端有，已补缺；
  - `items`：最多 40 条明细；
  - `error`：报告生成失败，不阻断合并。
- 空报告不写入 `stats`；`mergeProjectJSON()` 仅在非空时挂 `stats.config`，保持既有 stats 深比较不变。
- 界面通过 `mergeConfigText(stats)` 显示“配置未采纳 N 项 / 配置已补缺 N 项”；协作状态栏、冲突提示、手动合并 toast 共用同一拼装。
- 明确边界：报告只增加可见性，**不代表远端配置已经生效**。

### 9.5 时间戳与限额

- 入站 `updatedAt/deletedAt` 无法解析或晚于本机 `now + 5s` 视为异常，置空（LWW 必输给本地），返回 `clockClamped` 计数。
- 合并前后都跑 `assertProjectWithinLimits()`：两侧各自未超限，并集仍可能超限。
- 实时协作传 `{history:'overwrite'}`：只有远端覆盖本地内容时才入撤销栈；纯新增/同步不占 20 条历史上限。

## 10. 导入/导出

- **JSON**：工程导出的就是 `persistableState()` 结构；导入走 `buildProject()`，与加载同一套清洗/迁移。schema 不符明确拒绝。
- **CSV/XLSX**：对象表；不新增场地行，不占 O 编号；字段定义唯一源是 `io-fields.js` 的 `EXPORT_FIELD_DEFS`。
- **DXF**：对象实体；场地输出到独立 `SITE` 图层的 `LWPOLYLINE`。
- **SVG**：直接拼节点，包含图片与场地两层，以及节点/段长/半径/面积周长。
- **PNG/PDF**：走 canvas 渲染同一顺序；PDF 默认位图 + 清单，矢量 PDF 是显式选项，>300 标签自动降 150 DPI。
- 导入上限与清洗规则与加载一致；异常结构不覆盖当前工程。

## 11. 不能破的兼容底线

1. 不改 `schema` 版本号；v1 必须继续可读。
2. 键布局变化必须一次性迁移 + 双读兼容。
3. 活动楼层提升结构不变：顶层是活动层，`floors[]` 是非活动层。
4. `persistableState()` 是唯一序列化入口；新增字段必须同步清洗、迁移、导出与合并。
5. 资产 GC 必须覆盖所有命名空间；扫描不全就放弃回收。
6. 墓碑不能被“按时间截断”淘汰；只能按保留窗口或硬上限淘汰。
7. 合并结果必须确定：同一输入得到同一输出，冲突有稳定兜底。
8. 配置类字段仍本地优先；M2 报告只增加可见性，不改变结果。
9. 修改任何影响像素的字段，必须同步 `sceneStaticKey()`。
10. 新增导出字段必须走 `EXPORT_FIELD_DEFS`，并验证 canvas/SVG/DXF/CSV 四类产物。

## 12. 已知限制

- 协作无认证、无授权、无审计；只适合可信网络内的临时交换。
- `BroadcastChannel` 只限同源；跨设备靠手工邀请串，无信令服务器。
- 合并信任本地时钟；远端时间戳只做“未来 5 秒”夹取，不能解决时钟漂移。
- 多边形状的捕捉候选仍按 `rectPoints` 生成；`sanitizeAreaShape` 不接受 polygon。
- 图片自身变换只支持 2×3 仿射，不支持四角透视。
- 保存失败时 localStorage 容量有限；大工程/大照片可能降级失败，必须导出 JSON 备份。

## 13. 带宽/存储估算（G3，无 schema 变更）

- 估算输入（编码/分辨率/帧率/码流/路数/天数/写入小时/冗余）只存在于弹窗会话内，不写入 `state`、`settings`、工程记录、撤销栈、协作载荷或 JSON 导出。
- 不改 `SCHEMA`、不改 IndexedDB 数据库版本与对象存储键布局；刷新/重开工程后估算输入不保留，属预期行为。
- 码率与容量由 `js/features/io-fields.js` 的字段表与纯函数 `bwEst()` 推导；G3 不新增导出产物，工程导出链路零改动。

## 14. 布线/线缆统计（G4，无 schema 变更）

- 统计输入（模式/端点预留/弯曲余量）只存在于弹窗会话内，不写入 `state`、`settings`、工程记录、撤销栈、协作载荷或 JSON 导出。
- 不新增对象类型、不改 `SCHEMA`、不改 IndexedDB 数据库版本与对象存储键布局；只读取当前楼层的 `line`/`point` 对象已有几何。
- 长度由 `js/features/io-fields.js` 的纯函数 `wireStats()` 推导（复用 `objectLength()`/`dist()`）；G4 不新增导出产物，工程导出链路零改动。

## 15. 本地只读（G5，无 schema 变更）

- 只读是**运行时会话状态**（`js/core/persistence.js` 的模块变量 `readOnly`，经 `isReadOnly()/setReadOnly()` 读写），不是工程属性、不是权限位，也不代表访问控制。
- 不写入 `state`、`settings`、工程 JSON、IndexedDB、撤销栈或协作载荷；不改 `SCHEMA`、数据库版本与存储键布局。若后续把开关持久化到 `localStorage` 作本机偏好，也必须与工程无关。
- 刷新或重开页面后默认**可编辑**（`readOnly=false`）；只读只锁本端写入入口，协作对端仍可修改本工程并经远端应用落盘。

## 16. 评论/批注（G6，无 schema 变更）

- 独立存储：`localStorage['plotpin.comments.v1.<owner>']`，记录 `{v:1,comments:[{id,objectId,floorId,text,createdAt,updatedAt}]}`；**不写入工程 JSON、`proj:<id>`、`current` 或 IDB 资产库**，不改 `SCHEMA`、`DB_VERSION` 与键布局。
- 归属：`owner = state.meta.projectId || state.meta.id`。`projectId` 优先，保证工程库副本隔离；草稿尚无 `projectId` 时回退 `meta.id`。`saveProjectAs()` 成功后按评论 id 去重迁移旧键并删除。
- 锚点：`objectId + floorId`，不存坐标；对象删除后评论保留为孤儿，不做级联删除。
- 生命周期：`deleteProjectById(id)` 删除 `comments.<projectId>`；新建工程只清未入库草稿的评论；`clearCurrentFloor()` 不动评论。
- 同步边界：不参与 `mergeProjectData`、不进协作载荷、不导出 JSON；只读时写入被 `guardWrite()` 拒绝，读取不受限。
- 上限：单 owner 200 条、单条 2,000 字；解析失败按空列表处理，配额失败返回失败且不修改已存内容。

## 17. 台账模板（G7，无 schema 变更）

- 不新增任何存储：模板是 `js/features/io-export.js` 的 `TPL_BUILTIN` 常量表；**不写入 `state`、工程 JSON、`proj:<id>`、`current`、IDB 或 localStorage**，不改 `SCHEMA`、`DB_VERSION` 与键布局，不参与协作合并。
- `cols` 的合法值 = `EXPORT_FIELD_DEFS[].key`；数组顺序即列顺序，列标题直接取字段 key，不存第二份标题。
- 内置模板只读、不可被用户覆盖；弹窗里临时改列只作用于本次导出。
- 默认导出（`TABLE_COLUMNS` / `delimitedText` / `xlsxExportTable`）零改动，模板只走独立 `tplTable` / `tplExport` 分支。
