# PlotPin 内部变更日志（不对外发布）

记录每次提交的核心改动、实测验证数据与遗留风险，便于复盘。数据均为本机实测，未达标不提交。

## 2026-11-06 · A-15 公共抽象第一批（outlineOf / objectIndexById / siteBounds / ensureVendor）

- **Commit Hash**：`4a11133`（refactor(core): 收敛对象轮廓/对象索引/场地包围盒/第三方模块守卫四个公共抽象）。
- **核心改动点**
  - `js/core/geometry.js`：新增 `outlineOf(o)`（rect 形状族 → `shapeWorldPoints` 采样多边形；line/dimension → 节点副本；point/text → `[]`，每次返回新数组）；`siteDomainOf` 宽高改为直接取自 `siteBounds`，删除按形状各写一套 min/max 的分支。
  - `js/features/io-export.js`：SVG 区域/折线/标注与 DXF `LWPOLYLINE` 统一走 `outlineOf`；抽出纯函数 `dxfEntitiesForExport()`，`exportDXF` 仅负责下载与提示。
  - `js/core/model.js` + `js/core/interaction.js`：新增 `objectIndexById(list?)`；拖拽起点、批量移动、位移判定、Esc 回滚 4 处由 N 次 `find` 改为一次建索引。
  - `js/core/config.js`：新增 `ensureVendor(name)`；`io-export.js`（Dxf/Xlsx/Pdf/Qr）与 `io-import.js`（Xlsx/Dxf/PdfRead）调用前统一守卫。
  - `scripts/selftest.mjs` §72：21 条断言，含替换前捕获的 golden 基线。
- **golden 基线（先锁后换）**
  - rect 4 顶点坐标 `[[3,3],[11,3],[11,8],[3,8]]`；圆 72 采样点；折线 3、标注 2、点/文字 0。
  - SVG `polygon` 4 个坐标对、`polyline` 3/2；既有场景哈希 `e6ba5542…` 仍通过。
  - DXF 实体序列 `LWPOLYLINE×5 + CIRCLE + TEXT + POINT + TEXT`，LWPOLYLINE 顶点数 `4,4,4,3,2`（首位为默认 100×70 场地）。
  - 替换后同一断言全部通过 → **导出顶点数与坐标零变化**（提交前先跑基线、替换后再跑，两次均绿）。
- **实测验证数据（本机 Windows / 2026-11-06）**
  - `node scripts/check.mjs --selftest`：**1799 通过 / 0 失败**（加载 36 脚本）。
  - `node scripts/e2e.mjs`：**18 passed / 0 failed（24.5s）**。
  - `node scripts/bench.mjs`：缓存帧 avg **0.39 ms** / P95 **0.54 ms** / P99 0.89 ms；重建 **27.01 ms**；直接全量帧 26.38 ms；heapUsed **18.85 MB**；覆盖率 **10.1 ms**；裁剪 **99.4%**。
  - `node scripts/build.mjs --check`：**687.1 KB**，SHA256 `31d8d69f51f8acd5ce35675a2cdc2c4dbd3d5f7610e08b9eee4f1416d216ed59`。
- **公共抽象 / 影响面**
  - 新增 `outlineOf`、`dxfEntitiesForExport`、`objectIndexById`、`ensureVendor`；`siteDomainOf` 收敛到 `siteBounds`（均登记在 `docs/modules.md`）。
  - 唯一可见行为变化：**旋转椭圆场地**的域尺寸从固定 `2rx×2ry` 改为真实轴对齐包围盒；其余形状逐值等价，导出顶点零变化。
  - `ensureVendor` 仅改变“模块缺失”失败路径的报错文案；无新增脚本/依赖，无 schema 变更。
- **遗留 TODO / 风险**
  - `instanceof`/引用相等未受保护：`ensureVendor` 只判存在，不校验版本与 API 面（版本一致性仍由 `check-ngm.mjs` 负责）。
  - `objectIndexById` 每次调用重建索引（O(N)），仅在单次操作内多次查找时划算；单次查找仍直接用 `find`。

## 2026-11-06 · A-11 墓碑按对象 id 保留 + 增量淘汰

- **Commit Hash**：`5e47a03`（fix(collab): 墓碑按对象 id 长期保留并改为增量淘汰）。
- **核心改动点**
  - `js/core/config.js`：`TOMBSTONE_MAX` 2000 → **20000**；新增 `TOMBSTONE_EVICT_BATCH=2000`（增量淘汰批量）、`TOMBSTONE_RETENTION_DAYS=730`（保留窗口）。
  - `js/core/persistence.js`：`sanitizeTombstones(arr, nowMs)` 新增保留窗口裁切（仅淘汰超过 730 天的旧墓碑，`nowMs` 可注入以便自测）；`markTombstone` 从「每次删除都全量排序」改为「攒够 2000 条才压缩一次」。
  - `js/common/merge.js`：远端对象被墓碑删除时计入 `stats.deleted`（此前漏计）；文件头注释明确「删除时间不早于对象更新时间即生效（平局删除胜）」，与 A-04 LWW 语义一致。
  - `scripts/selftest.mjs` §71：13 条断言覆盖保留窗口、硬上限、增量淘汰触发时机，以及「旧端 3000 个已删对象合并后全部被压制」。
- **实测验证数据（本机 Windows / 2026-11-06）**
  - `node scripts/check.mjs --selftest`：**1778 通过 / 0 失败**（加载 36 脚本）。
  - `node scripts/e2e.mjs`：**18 passed / 0 failed（19.8s）**。
  - `node scripts/bench.mjs`：缓存帧 avg **0.37 ms** / P95 **0.5 ms**；重建 **22.18 ms**；heapUsed **18.64 MB**；覆盖率 **7.8 ms**。
  - `node scripts/build.mjs --check`：**686.0 KB**，SHA256 `5d989f8e269d79f331ba256e2eacbe63097ed1387681c045a509fa1c2891c43a`，二次构建一致。
- **公共抽象 / 影响面**
  - 墓碑体积上限由 2000 条提升到 20000 条（最坏约 +1.4MB，仍受导入 32MB 上限约束），换取「旧端合并不复活」。
  - `sanitizeTombstones` 签名新增可选 `nowMs`，现有调用方（`buildProject`）不传则等价于 `Date.now()`。
  - `markTombstone` 压缩频率下降，删除路径 CPU 成本随之下降；无 schema 变更、无新依赖。
- **遗留 TODO / 风险**
  - 超过 730 天的墓碑仍会按时间淘汰：离线超过 2 年的旧端合并时，其持有的已删对象仍可能复活（已在 `docs/features.md` 写明）。
  - 极端工程（墓碑 2 万条）会使工程 JSON 明显变大；未做压缩编码。

## 2026-11-06 · A-10 照片资产全楼层化与 JSON 内嵌统一

- **Commit Hash**：`6d7df54`（feat(export): 照片资产全楼层化并统一 JSON 内嵌策略）。
- **核心改动点**
  - `js/core/persistence.js`：新增 `projectObjectLists(st)` 作为「工程级对象列表」唯一入口（当前楼层 `state.objects` + 其余楼层 `f.objects`），`ensureObjectPhotoAssets` 与 `countProjectObjects` 复用；照片按内容哈希去重写入资产库，全楼层 `photoDataUrl → photoId`。
  - `js/features/io-export.js`：`exportJSON` 遍历全楼层对象内嵌 `photoDataUrl`，同一 `photoId` 只读一次资产；**修复真实缺陷**——照片与非当前楼层底图的 `bytesToDataUrl` 原本未 `await`，导出 JSON 里是序列化后的 `{}`。
  - `js/features/io-import.js`：提交阶段 `await afterStateLoaded()`，全楼层照片转换完成才判定导入成功。
  - `tests/e2e/persistence.spec.mjs`：新增「1F/F2 各一张照片 → 切回 1F → 真实 UI 导出 → 两层 `photoDataUrl` 等于原图 → 再导入 → 两层 `photoId` 存在且 `photoDataUrl` 清空」。
- **实测验证数据（本机 Windows / Chromium 1254 / 2026-11-06）**
  - `node scripts/check.mjs --selftest`：**1765 通过 / 0 失败**（加载 36 脚本）。
  - `node scripts/e2e.mjs`：**18 passed / 0 failed（21.4s）**（新增跨楼层照片用例 15 号）。
  - `node scripts/build.mjs --check`：**684.6 KB ≤ 750 KB**，SHA256 `1926f0b704adec1c7a5299ecfbcf91ed1268b605c253a1aafe7e7535fe0208e6`，二次构建一致。
  - 反向验证：临时让 `projectObjectLists` 只返回当前楼层，新用例 **1 failed**（F2 `photoDataUrl` undefined）；恢复后 18/18。
  - 未重跑 bench：本项只改导出/导入的数据遍历与 await，不进入渲染热路径。
- **公共抽象 / 影响面**
  - 新增 `projectObjectLists`（`docs/modules.md` 已登记）；`countProjectObjects` 内部改用它，返回值等价、签名不变。
  - `ensureObjectPhotoAssets` 处理范围由「当前楼层」扩为「全楼层」，属本次修复；导出体积随楼层数增长（同图按 id 去重只内嵌一份）。
  - 未新增运行时依赖，未改存储 schema。
- **遗留 TODO / 风险**
  - 照片内嵌使 JSON 体积与楼层数/照片数成正比，受 `APP_LIMITS.IMPORT_FILE_MAX_BYTES`（32MB）反压；极端工程仍可能导出后无法回导。
  - `ensureObjectPhotoAssets` 的 `catch` 分支保留 `photoDataUrl` 以便当前会话可见，这类对象下次导出会再内嵌一次（不丢数据，仅体积冗余）。

## 2026-11-06 · A-09 导入事务化与统一限值

- **Commit Hash**：`2fc7606`（feat(import): 导入事务化与统一 APP_LIMITS 限值校验）。
- **核心改动点**
  - `buildProject(p)`：从 `migrateProject` 拆出，构建候选工程**不写全局 `state`**；`migrateProject` = 构建 + 立即替换（旧语义不变）。
  - `importJsonFile` / `openProjectById`：候选构建 → 限值校验 → 资产准备 → **原子替换**；提交阶段（`pruneBgAssets`）失败时回滚工程、撤销栈、选择与草稿。
  - `duplicateProjectById`：直接用 `buildProject`，删除原来“先存 `state` 再还原”的 hack。
  - `APP_LIMITS`：文件 32MB、文本 32M 字符、表格 2 万行、实体 10 万、对象 10 万、单图 40MP、单资产 16MB、历史栈 20、墓碑 2000；新增 `importLimitErrors / importLimitMessage` 统一校验与中文提示，覆盖 JSON/CSV/TSV/XLSX/DXF/PDF/图片/合并导入。
  - 底图导入：像素校验、dataUrl 生成、解码全部在改现场之前完成；`assetPut` 增加单资产字节上限。
  - `scripts/selftest.mjs` §70（13 断言）；`tests/e2e/persistence.spec.mjs` 新增“非法 JSON 导入后现场不变”。
- **实测验证数据（本机 Windows / Chromium 1254 / 2026-11-06）**
  - `node scripts/check.mjs --selftest`：**1765 通过 / 0 失败**（1756 + 13，含 9 条新断言前序合计）。
  - `node scripts/e2e.mjs`：**17 passed / 0 failed（20.2s）**。
  - `node scripts/bench.mjs`：avg **0.41 ms** / P95 **0.65 ms** / P99 1.23 ms / 重建 **30.3 ms** / 直接全量 27.54 ms / heapUsed **19.52 MB** / 覆盖率 **9.7 ms** / 裁剪 99.4%，全部达标。
  - `node scripts/build.mjs --check`：**683.7 KB ≤ 750 KB**，SHA256 `bbb731d3049eda50d2c9bb99a7cc02268c8a2ec3f6a1ef44c52d27f73e76d048`。
- **公共抽象 / 影响面**
  - `buildProject / countProjectObjects`、`importLimitErrors / importLimitMessage` 登记到 `docs/modules.md`。
  - 行为变化：导入失败不再静默“半导入”；超限文件/表格/图形/对象数在入口即被拒绝并给出中文原因。正常工程的导入语义与方法不变（仍清空撤销栈、不接管 `projectId`）。
  - `pushHistory` 与墓碑截断改用 `APP_LIMITS.HISTORY_MAX / TOMBSTONE_MAX`，数值未变。
  - 未新增运行时依赖，未改 schema。
- **遗留 TODO / 风险**
  - 提交阶段只有 `pruneBgAssets` 可能抛错；其余失败都在替换前发生。若 IDB 在替换后失败，回滚会重新装载旧底图，极端情况下会短暂闪回一次旧画面。
  - XLSX 在解析后才做行数校验（解析本身已受文件 32MB 上限约束）；如需更早拦截可在解压前校验条目数。

## 2026-11-06 · A-08 转义与场地样式白名单

- **Commit Hash**：`3532fa5`（fix(security): SVG/模态统一转义并白名单清洗场地样式）。
- **核心改动点**
  - `js/features/ui-shell.js`：新增 `xmlEscape`（复用 `esc` 替换表，不复制第二份）；新增 `modalBody` 模板（插值默认转义）与 `safeHTML`（仅标记内部已转义片段）。
  - `js/features/io-export.js`：底图 `href`/`xlink:href` 与场地 `fill`/`stroke` 全部 `xmlEscape`。
  - `js/core/persistence.js`：新增 `sanitizeSiteStyle`，`sanitizeSite` 改用它；只保留颜色（hex/rgb/hsl/命名色）、`fillAlpha`、`strokeWidth`，其余键丢弃，`url()`/引号/尖括号无法通过。
  - `js/features/io.js` / `collab.js`：工程库与实时协作弹窗改用 `modalBody`（动态片段 `safeHTML(rows)`）。
  - `js/features/props.js`：颜色输入框的 `value` 补 `esc`（插件类型 `color` 也会进入属性面板）。
  - `scripts/selftest.mjs` §69（13 断言，含恶意场地样式 SVG 导出）。
- **实测验证数据（本机 Windows / Chromium 1254 / 2026-11-06）**
  - `node scripts/check.mjs --selftest`：**1756 通过 / 0 失败**（1743 + 13）。
  - `node scripts/e2e.mjs`：**16 passed / 0 failed（18.8s）**，CSP 5 条与其余 11 条全绿。
  - `node scripts/build.mjs --check`：**677.4 KB ≤ 750 KB**，SHA256 `2e6b302bcebf6a1963eff862fe23128331ef0df17b2276716f90bb1dd93c3eae`，二次构建一致。
  - 未重跑 bench：本项只改导出/弹窗/属性面板的转义与清洗，不进入渲染热路径；沿用 A-06 后 3 次实测区间（avg 0.34–0.45ms / P95 0.42–0.70ms）。
- **公共抽象 / 影响面**
  - `xmlEscape`、`modalBody/safeHTML`、`sanitizeSiteStyle` 登记到 `docs/modules.md`。影响：① 导入含非法场地样式的工程不再原样保留颜色键，画面回退默认色；② 模态动态文案由模板统一转义，已逐项 `esc` 的调用点保持等价。
  - `sanitizeSiteStyle` 只作用于 `site.style`；对象样式原本已按 `#rrggbb`/数值白名单清洗，未改。
  - 未新增运行时依赖，未改存储 schema。
- **遗留 TODO / 风险**
  - 其余模态仍为字符串拼接（调用点当前都已 `esc`），后续新增/改造模态应使用 `modalBody`；建议在 A-15/A-16 中把剩余弹窗一并迁移。
  - `site.annot` 仍为传入对象（仅按布尔键读取，不进 HTML/SVG 属性）；如需严格白名单可在 A-11 合并清洗时一并处理。

## 2026-11-06 · A-06 交互提交判定与手势取消

- **Commit Hash**：`942583e`（fix(interaction): 拖拽提交走深比较并统一手势取消）。
- **核心改动点**
  - `js/core/interaction.js`：新增 `sameSerializable / objectMovedFrom / dragChanged`；`pointerup` 的 move/手柄/图片/场地提交判定改用深比较（剔除 `updatedAt` 噪声），`move` 首次越过 **2px 屏幕阈值**才 `pushHistory`；未产生实际变更时弹出快照、不 `commitChange`。
  - `cancelActiveDrag` 统一接管 `pointercancel`、`lostpointercapture`、第二指落下、Escape；新增 `calibPoint` 回滚分支（拖动过走 `calibUndo`，仅点选弹空快照）。`touchArm` 收尾期间 `pointerup` 提前返回，不落点、不推进草稿。
  - 修饰键：`Ctrl/Meta` 点击与框选均增量选择；`f/F` 不再劫持 `Ctrl+F`。方向键连按/长按只在首次 `keydown` 压栈，`keyup` 复位，合并为一次撤销。
  - `scripts/selftest.mjs` §68（15 断言）；`tests/e2e/interaction.spec.mjs`（2 条浏览器用例）。
- **实测验证数据（本机 Windows / Chromium 1254 / 2026-11-06）**
  - `node scripts/check.mjs --selftest`：**1743 通过 / 0 失败**（1728 + 15）。
  - `node scripts/e2e.mjs`：**16 passed / 0 failed（19.3s）**（新增 2 条：单击不落盘/不清覆盖率；拖拽 Esc 回滚）。
  - 反向验证：把 `pointerup` 提交判定临时改为恒 `true`，单击用例 **1 failed**（`saves` 期望 0 实得 1）；恢复 `dragChanged` 后 2/2。
  - `node scripts/bench.mjs` 连续 3 次：avg **0.34–0.45 ms** / P95 **0.42–0.70 ms** / 重建 **22.2–29.5 ms** / heapUsed **14.48–16.57 MB** / 覆盖率 **7.4–14.4 ms**，全部达标。
  - `node scripts/build.mjs --check`：**676.0 KB ≤ 750 KB**，SHA256 `178275a8f684d98e2843f66f9bb1a8e86d93e2acf9a76f1a6f8cde9671af328a`，二次构建一致。
- **公共抽象 / 影响面**
  - 新增 `dragChanged` 作为拖拽提交判定的唯一入口，所有指针提交路径复用；深比较只发生在 `pointerup`（单个对象/形状），`pointermove` 仅多一次 `Math.hypot` 阈值判断。
  - 行为变化（预期）：① 单击/手柄点选不再落盘与清覆盖率；② 双指捏合中止拖拽由「遗留半途修改」改为「回滚到按下前」；③ 方向键连续移动只留 1 个撤销快照。其余交互语义不变。
  - `docs/modules.md` 登记抽象与调用方；`docs/features.md` 补充选择/撤销说明；`docs/engineering.md` 刷新断言数、体积、SHA 与 bench 3 次区间。
- **遗留 TODO / 风险**
  - 拖拽中切换工具（`setTool`）仍直接 `drag=null`，理论上可绕过回滚；工具按钮需先完成 pointerup 才可点击，暂未观察到可复现路径，下一批公共抽象再统一。
  - `lostpointercapture` 在部分旧浏览器可能在正常 `pointerup` 后触发；此时 `drag` 已空，实现按空操作处理。

## 2026-11-06 · A-05 统一变更提交协议 markDirty

- **Commit Hash**：`257e58d`（refactor(core): 统一 markDirty(kind) 变更提交协议）。
- **核心改动点**
  - `js/core/persistence.js`：`MARK_DIRTY_PROFILES` + `markDirty(kind)`，一次完成清覆盖率 → 重建静态层 → 落盘 → 广播 → 按 kind 刷 UI/重绘。
  - 收敛 `commitChange/commitObjectEdit/clearCurrentFloor/undo/redo/deleteFloor` 五类提交点；`switchFloorData` 保持只清覆盖率/静态层，落盘由 `switchFloor` 负责。
  - `scripts/selftest.mjs`：新增 18 项断言（落盘次数、覆盖率清空、广播矩阵、未知 kind 回退、两个 commit 函数走同一协议）。
  - `docs/modules.md` 登记 `markDirty(kind)` 唯一实现与调用方约束；`scripts/dist-manifest.json` 重建（含 A-03 变更）。
- **实测验证数据（Windows / 2026-11-06）**
  - `node scripts/check.mjs --selftest`：**1728 通过 / 0 失败**。
  - `node scripts/build.mjs --check`：672.7 KB ≤ 750 KB，SHA256 `4a23ebfe…`，二次构建一致。
  - `node scripts/e2e.mjs`：**14 passed / 0 failed（18.1s）**。
  - 首跑 selftest 6 失败：`__api` 后置同名属性把 `collabOnLocalChange` 的 getter/setter 覆盖成数据属性，spy 未生效；删除重复属性后 1728/0（未放宽断言）。
- **公共抽象 / 影响面**
  - 新增 `markDirty` / `MARK_DIRTY_PROFILES`；`commitChange`、`commitObjectEdit`、`undo/redo`、`clearCurrentFloor`、`deleteFloor` 改为调用它。
  - 等价性：object/objectEdit 的 UI 粒度与广播不变；clear/floor 仍不广播；restore 仅补落盘+广播；switchFloorData 行为不变。
- **遗留 TODO / 风险**
  - `props.js` 的场地参数微调仍自行组合 `coverageResult/scheduleSave/requestRender`，未纳入协议（下一批公共抽象再评估）。
  - `markDirty('restore')` 会重复一次幂等 invalidate/requestRender（无观察差异，轻微冗余）。

## 2026-11-06 · A-03 补口：切换楼层落盘

- **Commit Hash**：`d2b5d52`（fix(persist): 切换楼层也安排落盘，刷新后回到上次活动楼层）。
- **核心改动点**
  - `js/core/persistence.js`：`switchFloor()` 成功后 `scheduleSave()`，与 `addFloor/deleteFloor` 策略一致。
  - `tests/e2e/history.spec.mjs`：新增「切换→刷新→活动楼层保持」用例（1F→F-SWITCH→1F，双向切换均回读 `current` 并 reload）。
  - `docs/features.md`：本地自动保存条目补充切换楼层说明。
- **实测验证数据（本机 Windows / Chromium 1254 / 2026-11-06）**
  - `node scripts/e2e.mjs tests/e2e/history.spec.mjs`：**4 passed / 0 failed（10.9s）**，首跑通过。
  - 反向验证：临时注释 `switchFloor` 内 `scheduleSave`，切换用例 **1 failed**（7.3s，reload 后仍为 `floor.default`）；恢复后 4/4。
  - `node scripts/check.mjs --selftest`：1710 通过 / 0 失败（加载 36 脚本）。
- **公共抽象 / 影响面**
  - 无新增抽象。`withFloor` 逐层导出会复用 `switchFloor` 并顺带安排保存；450ms 防抖合并写入，导出结束仍以最后一次调用落盘。
- **遗留 TODO / 风险**
  - e2e 依赖防抖时序（7s 轮询）；CI 极慢时可能抖动（失败会红，不假绿）。

## 2026-11-06 · A-14 撤销/重做 + 楼层操作后刷新一致

- **Commit Hash**：`d35852a`（test(persist): 浏览器验证撤销/重做、新增楼层、删除当前楼层后刷新一致）。
- **核心改动点**
  - `tests/e2e/history.spec.mjs`：真实 UI 驱动（`#undoBtn/#redoBtn`、`#floorBtn`/`#floorAdd`/`#promptInput`/`#modalFooter`），每步都回读 IndexedDB `projects/current` 再 reload 复验。
    - 撤销/重做：2→撤销 1→reload 仍 1；再画→撤销→重做 2→reload 仍 2；刷新后历史栈清空，按钮禁用。
    - 新增楼层：新层 `F2-E2E` 画点 → current 与 reload 后均 floors=2 / active=新层 / objects=1 / 首层 0。
    - 删除当前楼层：删除后 state 与 current 均 floors=1 / active=`floor.default` / objects=0 / 被删层不存在 → reload 不复活。
- **实测验证数据（本机 Windows / Chromium 1254 / 2026-11-06）**
  - `node scripts/e2e.mjs tests/e2e/history.spec.mjs`：**3 passed / 0 failed（8.2s）**，首跑即通过。
  - 全量 `node scripts/e2e.mjs`：**13 passed / 0 failed（14.9s）**（smoke 3 + persistence 2 + csp 5 + history 3）。
  - `node scripts/check.mjs`：通过。
- **公共抽象 / 影响面**
  - 复用 `tests/e2e/helpers.mjs` 的 `idb`；运行时代码零改动。
- **遗留 TODO / 风险**
  - 未覆盖「切换楼层后刷新」与「非当前楼层删除后刷新」；审计已知风险「切换楼层不落盘」仍未在本轮修复/验证范围内。
  - 依赖 450ms 防抖落盘，用 7s 轮询断言；极慢 CI 仍可能抖动（失败会红，不会假绿）。

## 2026-11-06 · A-14 CSP 浏览器 PoC：4 条注入路径 + 内联兜底

- **Commit Hash**：`2330ab7`（test(security): 浏览器 PoC 验证 4 条注入路径与 CSP 兜底均无法执行 JS）。
- **核心改动点**
  - `tests/e2e/csp.spec.mjs`：以 `window.__pwned` 哨兵 + DOM `#typeList img` 计数为判据，覆盖：
    1. 导入 JSON 的恶意 `type.name/icon`；2. IndexedDB 旧存档 v1 `current`；3. `PlotPin.registerObjectType`；4. 绕过上游直接 `state.objectTypes.push` + `renderTypes()`。
  - 额外 CSP 兜底：运行时注入内联 `<script>`、`onclick` 属性、`img onerror`，断言均未执行且捕获到 CSP 违规日志。
- **实测验证数据（本机 Windows / Chromium 1254 / 2026-11-06）**
  - `node scripts/e2e.mjs tests/e2e/csp.spec.mjs`：**5 passed / 0 failed（3.9s）**。
  - 首次运行 3 失败：断言未考虑 `mergeTypes`/插件按约定把类型名截断到 30 字符（非安全问题）；改为 `PAYLOAD.slice(0,30)` 后 5/5，未放宽安全断言。
  - 关键断言：哨兵未定义；`#typeList img` = 0；`violations.length > 0`；导入/插件路径 `icon === 'custom'`。
- **公共抽象 / 影响面**
  - 复用 `tests/e2e/helpers.mjs` 的 IndexedDB 工具；运行时代码零改动。
- **遗留 TODO / 风险**
  - 未覆盖 `javascript:` 伪协议与 SVG `<use>` 等更冷门载荷；当前仅覆盖审计列出的 4 条路径 + 3 种内联兜底。
  - CSP 违规依赖 Chromium 控制台文案匹配（`Content Security Policy|Refused to`），文案若变动会误报失败（不会假绿）。

## 2026-11-06 · A-14 真实 IndexedDB：v1→v2 回写 + 资产六命名空间保活

- **Commit Hash**：`e6507a2`（test(e2e): 真实 IndexedDB 验证 v1→v2 回写与六命名空间资产保活）。
- **核心改动点**
  - `tests/e2e/helpers.mjs`：公共测试工具 `idb(page,{store,mode,op,key,value})`、`clickCanvasCenter`、`savedObjectCount`。
  - `tests/e2e/persistence.spec.mjs`：
    - 写入 v1 记录到 `projects/current` → reload → 断言 `state.schema` 升为 v2、两楼层 `updatedAt` 均为 `''`（旧档不伪装成最新写入）。
    - 用点工具真实单击画布触发 `scheduleSave`，回读 `current`：schema=v2、活动楼层 `updatedAt` 非空、非活动楼层保持 `''`、活动对象 2 / F2 对象 1 不丢。
    - 6 条命名空间各写一个独立资产（草稿 / history.past / history.future / clipboard / drag.originals / `proj:PRJ_E2E`），另加 1 个未引用资产；断言 `assetRefsByNamespace()` 恰好 6 个标签、`pruneBgAssets()` 只删未引用项。
- **实测验证数据（本机 Windows / Chromium 1254 / 2026-11-06）**
  - `node scripts/e2e.mjs tests/e2e/persistence.spec.mjs`：**2 passed / 0 failed（2.9s）**。
  - 关键断言：`namespaces` 恰为 6 项且包含 6 个预期标签；`pruned = ['as_e2e_gone']`；资产库余键 6 个。
- **公共抽象 / 影响面**
  - 新增测试侧公共工具 `tests/e2e/helpers.mjs`（仅开发期，运行时代码零改动）。
- **遗留 TODO / 风险**
  - 该测试只覆盖 IndexedDB 数据层与真实落盘时序，不覆盖底图字节解码渲染（需真实图片资产）。
  - 工程库记录为手工构造的最小结构，未覆盖真实「另存到工程库」UI 流程。

## 2026-11-06 · A-14 Playwright 冒烟骨架（3 条用例）

- **Commit Hash**：`600a915`（test(e2e): 引入 Playwright 冒烟骨架）。
- **核心改动点**
  - `package.json` / `package-lock.json`：新增 **devDependency** `@playwright/test@^1.65.0`；`npm run test:e2e`；`npm run ci` 路径未改动。
  - `scripts/serve.mjs`：零依赖静态服务器（仅 e2e），同源 http 下 IndexedDB 可用（file:// 被浏览器禁用）。
  - `playwright.config.mjs`：`tests/e2e/*.spec.mjs`、Chromium、workers=1，自动拉起本地服务器。
  - `scripts/e2e.mjs`：缺 `@playwright/test` 或 Chromium 二进制时打印 `[SKIP]` 并**退 2**，不假绿。
  - `tests/e2e/smoke.spec.mjs`：页面加载（无 pageerror/console error、入口无跨源引用、CSP 无 unsafe-inline）、点工具落点与选择命中+属性面板、JSON 导出真实下载并解析。
  - `.gitignore`：忽略 `test-results/`、`playwright-report/`、`blob-report/`。
- **实测验证数据（本机 Windows / Chromium 1254 / 2026-11-06）**
  - `node scripts/e2e.mjs`：**3 passed / 0 failed（2.4s）**；首次运行 1 失败（测试自身把同源绝对 URL 误判为远程引用），改为 `origin` 比对后复跑 3/3。
  - `node scripts/check.mjs`：通过（26 个脚本语法正确、入口资源完整、离线引用合规）。
  - `node scripts/build.mjs --check`：671.6 KB ≤ 750 KB，SHA256 `f9b54ef2…` 与登记值一致。
- **公共抽象 / 影响面**
  - 新增 `scripts/serve.mjs`（仅开发期）；运行时代码零改动，单文件产物不引用 `tests/` 与依赖。
  - 依赖变更：仅 devDependency，`package-lock.json` 入库；无运行时依赖增加。
- **遗留 TODO / 风险**
  - Chromium 二进制由 `npx playwright install chromium` 下载到用户目录，不随仓库分发；CI 若接入需单独安装。
  - `[SKIP]` 退 2 的路径已实现，但本机未构造「缺浏览器」场景验证（需临时移走二进制，未执行）。
  - 真实浏览器渲染性能基线仍未采集（本项只做功能 e2e）。

## 2026-11-06 · A-04 存储 v2 + 楼层 updatedAt + touchFloor 统一 LWW（审计 P0-3）

- **Commit Hash**：`b423dbd`（feat(schema): 存储 v2 + 楼层 updatedAt + touchFloor 统一 LWW）。
- **核心改动点**
  - `config.js`：`SCHEMA` → `offline-drawing-annotation/v2`；新增 `SCHEMA_V1`、`SCHEMA_READABLE`、`isReadableSchema()`（v1/v2 可读，未知版本拒绝）。
  - `model.createInitialState`：默认楼层带 `updatedAt`（ISO）。
  - `persistence`：新增 `touchFloor(id)`（楼层级 LWW 唯一时间来源）；`commitChange` / `commitObjectEdit` / `clearCurrentFloor` 统一调用；`addFloor` 创建即写时间；`migrateProject` 保留已有时间、缺失写空串、并把 schema 升级为 v2。
  - schema 校验全部改为 `isReadableSchema`：`listProjects` / `openProjectById` / `loadSavedProject` / `mergeProjectJSON` / JSON 导入 / 实时协作快照。
  - `merge.js`：合并输出的**活动与非活动楼层都保留 `updatedAt`**（旧实现输出时丢弃，导致下一次合并丢楼层级 LWW 时间）；`mergeBlankMissingTimestamps` 同时为楼层本身补空串时间。
- **实测验证数据（本机 Windows / Node 18，2026-11-06）**
  - `node scripts/selftest.mjs`：**1710 通过 / 0 失败**（新增 16 项：schema 兼容 5、v1 迁移 3、touchFloor/commitChange/快照 4、合并 LWW 2、旧档入站时间 2）。
  - **门禁牙齿（可逆破坏）**：去掉合并输出活动楼层的 `updatedAt` → 3 项红：`合并-楼层时间保留较新（期望 2026-02-01…，实际 undefined）`、`合并入口-无变化不写历史栈（0 vs 1）`、`合并入口-历史栈增加（1 vs 2）`（1707/3）；恢复后 1710/0。顺带证明输出丢时间会使幂等合并被误判为有变化。
  - `node scripts/check.mjs --selftest`：通过。
  - `node scripts/build.mjs --check`：**671.6KB ≤ 750KB**，SHA256 `f9b54ef2…`，二次构建确定性一致。
  - `node scripts/bench.mjs`：avg 0.34ms（≤8）/ P95 0.38ms（≤3）/ 重建 21.77ms（≤60）/ heapUsed 14.67MB（≤64）/ 裁剪 99.4% / 覆盖率 7.5ms（≤300）。
  - README 断言数经 `badge.mjs` 同步为 1710。
- **公共抽象 / 影响面**
  - 新增：`touchFloor`、`isReadableSchema`、`SCHEMA_V1`、`SCHEMA_READABLE`；合并输出楼层对象新增 `updatedAt` 字段。
  - **BREAKING（计划要求）**：存储升 v2，旧版 App 只认 v1，会拒绝加载/导入 v2 工程；新版本可读 v1 并自动迁移（不丢数据）。README/features 已显式标注。
- **遗留 TODO / 风险**
  - 楼层级 `updatedAt` 是整层粒度：同层底图/场地/对象仍按整层时间整体取舍，字段级合并（后续系列）未做。
  - 旧档缺失楼层时间保留 `''`；双方均无对象时间时仍退回内容签名兜底。
  - 未在真实 IndexedDB 验证「v1 记录读取 → v2 回写」（A-14 暂缓）。

## 2026-11-06 · A-12 快赢包：椭圆圆心 / 图标尺寸 / 统计场地类型 / 文件 accept

- **Commit Hash**：`629449a`（fix(ui): 椭圆数值输入圆心 / 图标尺寸编辑 / 统计场地类型 / 文件 accept 四连修）。
- **核心改动点**
  - **P1-5 椭圆**：`io-import` 新增纯函数 `ellipseShapeFromInput(text)`，只解析长/短轴半径，`cx/cy` 固定为 `0`（旧实现 `cx=m[0],cy=m[1]` 让椭圆偏移 (rx,ry)）。
  - **P1-10 图标尺寸**：`ui-panels` 将 `data-type-iconsize` 的读取由 `i.dataset.iconsize` 修正为 `i.dataset.typeIconsize`，类型面板修改图标尺寸不再静默失效。
  - **P1-11 统计场地类型**：`renderStats` 改读 `state.site?.kind || state.background.kind`（旧实现只看 background.kind，有矢量场地时恒显示 empty/image）。
  - **P2-24 文件 accept**：`index.html` 的 `fileInput accept` 增加 `.dxf,.pdf`，与导入分支支持范围一致。
  - **测试框架**：`asyncSuites` 允许 push 函数，统一在结果汇总阶段执行，修复 §63 await 与 §65 同步 `resetState` 的并发竞态（该竞态在本次新增用例时真实触发并被发现）。
- **实测验证数据（本机 Windows / Node 18，2026-11-06）**
  - `node scripts/selftest.mjs`：**1694 通过 / 0 失败**（新增 14 项）。
  - **门禁牙齿（可逆破坏）**：临时把 `cx:m[0],cy:m[1]` 改回旧实现 → 3 项变红（`椭圆-中心在原点` 期望 [0,0] 实际 [40,25]、左/上边界各 1 项，1691/3）；恢复后 1694/0。
  - `node scripts/check.mjs --selftest`：通过。
  - `node scripts/build.mjs --check`：**669.8KB ≤ 750KB**，SHA256 `ce781c8d…`，二次构建确定性一致。
  - `node scripts/bench.mjs`：avg 0.35ms（≤8）/ P95 0.42ms（≤3）/ 重建 21.74ms（≤60）/ heapUsed 14.67MB（≤64）/ 裁剪 99.4% / 覆盖率 7.7ms（≤300）。
  - README 断言数经 `badge.mjs` 同步为 1694。
- **公共抽象 / 影响面**
  - 新增全局纯函数 `ellipseShapeFromInput`（导入分支与自测共用）；数值输入不再接受圆心坐标，只接受两个正半径。
  - 无对外 API 删除/改名；`applyVectorSite(kind,shape)` 签名不变。
  - 测试框架：`asyncSuites` 元素允许为函数（结果阶段调用）；既有 Promise 元素行为不变。
- **遗留 TODO / 风险**
  - 统计面板 `siteDescription` 的 `split('：')` 英文界面解析问题**未修**（不在本期用户清单内）。
  - 文件 accept 仅过滤选择器；拖拽导入仍按扩展名运行时校验，两处规则需长期保持一致。
  - 四项修复均未做真实浏览器交互验证（A-14 暂缓）。

## 2026-11-06 · A-07 CSV/TSV/XLSX 公式注入防护（审计 P1-3）

- **Commit Hash**：`7f5cb70`（fix(export): CSV/TSV 公式注入防护 + XLSX 单元格全文本，封堵导出侧公式执行）。
- **核心改动点**
  - 新增 `formulaGuard(s)`（`js/features/io-export.js`）：`= + - @`、Tab/CR 开头**且非纯数字**时命中，交给 DSV 加前导单引号，Excel/WPS 按文本显示。
  - 纯数字豁免规则 `NUMERIC_CELL_RE`：负数、科学计数、坐标/角度列表（`-1.00,-2.00;3.00,4.00`）原样输出，避免负坐标与 CSV 再导入被文本化。
  - 新增纯函数 `delimitedText(delim)`：真实导出路径的数据行统一 `DSV.formatRows(...,{guardFormula:formulaGuard})`，`exportDelimited` 仅负责下载，便于自测直接断言产物。
  - `csvCell()` 默认带 `guardFormula:formulaGuard`，旧调用方（插件/自测）自动获得防护。
  - `exportXlsx()` 补充说明与断言：单元格一律 `t="inlineStr"`（文本），OOXML 中不存在 `<f>` 公式节点，`=cmd|calc`/`@SUM(1)` 按原文保存。
  - 未修改 vendored DSV 代码，只使用其既有 `guardFormula` 选项（boolean/RegExp/Function）。
- **实测验证数据（本机 Windows / Node 18，2026-11-06）**
  - `node scripts/selftest.mjs`：**1680 通过 / 0 失败**（新增 17 项：9 项单格/整表、3 项真实导出路径、5 项 XLSX）。
  - **门禁牙齿（可逆破坏）**：`delimitedText` 的 `guardFormula` 临时置空 → `✗ 公式-导出路径给编号加前缀`、`✗ 公式-导出路径给备注加前缀`（1678/2）；恢复后 1680/0。
  - `node scripts/check.mjs --selftest`：通过。
  - `node scripts/build.mjs --check`：**669.4KB ≤ 750KB**，SHA256 `71ea6afac9d3…`，二次构建确定性一致。
  - `node scripts/bench.mjs`：avg 0.35ms（≤8）/ P95 0.46ms（≤3）/ 重建 21.68ms（≤60）/ heapUsed 15.13MB（≤64）/ 裁剪 99.4% / 覆盖率 11ms（≤300）。
  - README 断言数经 `badge.mjs` 同步为 1680。
- **公共抽象 / 影响面**
  - 新增全局抽象：`formulaGuard`、`delimitedText`（导出与自测/后续 BOM 导出共用）。
  - `csvCell()` 语义变化：危险前缀单元格默认多一个前导单引号；纯数字不变。插件直接调用即获防护。
  - `exportDelimited` 对外行为不变（除新增防护外）。
- **遗留 TODO / 风险**
  - 未在 Excel/WPS 中人工打开 `=cmd|...`、`=HYPERLINK(...)`、`@SUM(...)` 的导出文件确认「显示为文本且无安全警告」（计划 V-4 要求人工；本机无 Office 自动化环境）。
  - 导出的前导单引号在本工具再导入时会成为普通字符；纯数字/坐标已豁免，危险前缀文本字段会多一个 `'`（是否在导入侧剥除待人工确认）。
  - CSV/TSV 表头为应用常量，不参与防护；自定义表头插件需自行调用 `formulaGuard`。

## 2026-11-06 · A-03 撤销/重做/增删楼层统一落盘（审计 P0-4）

- **Commit Hash**：`9428089`（fix(persist): 撤销/重做/新增楼层/删除当前楼层统一落盘）。
- **核心改动点**
  - `persistence.undo()` / `redo()`：状态整体替换后补 `scheduleSave()`——刷新页面前保持撤销/重做结果（旧实现只在后续编辑时才存）。
  - `persistence.addFloor()`：`switchFloor(id)` 成功后 `scheduleSave()`——新增楼层刷新后不再消失。
  - `persistence.deleteFloor()` 删除**当前**楼层分支：`afterStateLoaded(false)+fitView()` 后 `scheduleSave()`——被删楼层刷新后不复活；非当前楼层仍走 `commitChange()`（原本已落盘）。
  - 未改动 `pushHistory` / `commitChange` / `switchFloorData` 语义；`scheduleSave` 仍是 450ms 防抖。
- **实测验证数据（本机 Windows / Node 18，2026-11-06）**
  - `node scripts/selftest.mjs`：**1663 通过 / 0 失败**（新增 §63 共 11 项断言；首次编写时漏了 IIFE 调用括号 `()`，套件从未执行、计数仍为 1652，已修正并复测）。
  - **门禁牙齿（可逆破坏）**：临时移除 `undo()` 的 `scheduleSave()` → selftest 立即红（`✗ 落盘-撤销调用保存`，随后 `saved` 为 null 抛错）；恢复后 1663/0。
  - `node scripts/check.mjs --selftest`：通过。
  - `node scripts/build.mjs --check`：**668.6KB ≤ 750KB**，SHA256 `f4e5445a…`，二次构建确定性一致。
  - `node scripts/bench.mjs`：avg 0.34ms（≤8）/ P95 0.39ms（≤3）/ 重建 21.37ms（≤60）/ heapUsed 18.53MB（≤64）/ 裁剪 99.4% / 覆盖率 9.1ms（≤300）。
  - README 断言数经 `badge.mjs` 同步为 1663。
- **公共抽象 / 影响面**
  - 无新增公共抽象；`scheduleSave()` 调用点新增 4 处（undo / redo / addFloor / deleteFloor 当前层分支）。
  - 落盘时机：从「下一次编辑顺带保存」变为「操作后 450ms 内保存」；IndexedDB 写入次数最多 +1 次/操作。
- **遗留 TODO / 风险**
  - 仅**切换楼层**仍不立即落盘（`activeFloorId` 跟随上次保存），刷新后回上次保存的活动层；不在 A-03 范围，待 A-04 一并处理。
  - 历史栈仍为 20 条整状态深拷贝（B-10），撤销后快照大小随工程增长。
  - selftest 用 spy 替换 `scheduleSave` 验证「是否调用 + 快照内容」，未在真实 IndexedDB 中端到端验证刷新行为（需 A-14 浏览器用例）。

## 2026-11-06 · A-02 类型图标白名单 + 全量转义 + CSP

- **Commit Hash**：`3279460`（fix(security): type.icon 白名单 + 全量转义 + CSP 哈希白名单，封堵 4 条注入路径）。
- **核心改动点**
  - `js/core/config.js`：新增 `TYPE_ICONS`（与 `render.js` 的 `drawPoint` 分支一一对应，`Object.freeze`）、`DEFAULT_ICON_BY_KIND`、`normalizeIcon(icon, kind)`——未知值按 kind 回退，绝不回传调用方原始字符串。
  - 两条持久化写入路径统一走白名单：`persistence.mergeTypes`（导入 JSON / 旧存档）与 `plugins.normalizeObjectType`（`PlotPin.registerObjectType`）。
  - `js/features/ui-panels.js` `renderTypes`：icon、color、type id、类型名进入 `innerHTML` 前全部 `esc()`；`data-type-*` 属性同样转义。
  - `index.html` 新增 CSP meta：`script-src 'self' file:`（**不含** `'unsafe-inline'`）、`style-src` 保留 `'unsafe-inline'`、`object-src/base-uri/form-action` 全 `'none'`、无远程源。
  - `scripts/pack-core.mjs`：单文件打包时按每个内联脚本文本计算 sha256 并追加到 `script-src`；入口缺 CSP 或 `script-src` 缺 `'self'` 直接拒绝构建。
  - `scripts/build.mjs --check`：新增 CSP 断言（无 `'unsafe-inline'`、哈希数 = 内联脚本数）；统计内联脚本时先剔除 HTML 注释里的文档性 `<script>` 字样。
  - `scripts/selftest.mjs` §56/§56.1：新增 25 项断言（白名单回退、存档清洗、插件注册清洗、renderTypes 转义、CSP 声明、打包哈希覆盖、无 CSP 拒绝构建）。
- **实测验证数据（本机 Windows / Node 18，2026-11-06）**
  - `node scripts/selftest.mjs`：**1652 通过 / 0 失败**（A-02 +25）。
  - `node scripts/check.mjs --selftest`：通过（`--selftest 已执行：1652 通过 / 0 失败`）。
  - `node scripts/bench.mjs`：avg 0.41ms（≤8）/ **P95 0.72ms（≤3）** / 重建 30.27ms（≤60）/ **heapUsed 19.38MB（≤64）** / 裁剪 99.4%（≥60）/ 覆盖率 9.9ms（≤300）。
  - `node scripts/build.mjs --check`：**668.1KB ≤ 750KB**，SHA256 `3b50dea4…` 与登记值一致；**36 个内联脚本 = 36 条 sha256 白名单**；二次构建确定性一致。
  - README 断言数经 `badge.mjs` 同步为 1652。
- **公共抽象 / 影响面**
  - 新增：`TYPE_ICONS`、`DEFAULT_ICON_BY_KIND`、`normalizeIcon`（core/config.js，供 persistence / plugins / selftest / ui 共用）。
  - **语义收紧**：`mergeTypes` / `normalizeObjectType` 输出的 `icon` 由「调用方任意字符串（仅截断 30 字符）」变为「白名单值或 kind 默认值」。旧存档中的非法图标迁移为默认图标（不报错、不丢类型）。
  - 无 `PlotPin.*` 对外 API 变更（`contracts/plugin-api.json` 未动）。
- **遗留 TODO / 风险**
  - 真实浏览器下 CSP 阻断行为尚未用 Playwright 验证（A-14 需用户批准 devDependency）。
  - `file:` scheme 写入 `script-src` 是为兼容双击打开的 dev 入口；托管部署按 origin 判定，file: 不放宽远程源。
  - `index.html` 的 CSP 写死策略，未来新增第三方内联样式/脚本需同步调整并重跑 `build.mjs`。

## 2026-11-06 · A-01 资产可达集 + 工程命名空间（禁止跨工程 prune）

- **Commit Hash**：`9424b26`（fix(assets): 资产回收按命名空间取可达集，禁止跨工程误删底图/照片）。
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




