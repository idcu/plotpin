# PlotPin 全维度代码审计 · 竞品对标 · ngm 模块化方案

> **审计日期**：2026-11-28
> **代码基线**：`a2d5341`（`docs(changelog): 回填 5528182 清单多选筛选基线`）
> **审计性质**：只读静态审计。未修改任何业务代码，未运行仓库内脚本（工作区处于不受信任状态），未执行构建、selftest、e2e、bench 或 ngm 校验。
> **数字来源**：`docs/facts.md`（2026-11-28 快照）、`scripts/dist-manifest.json`、`git log`、文件行数统计；凡本文新给出的推理数字均标「推算/未实测」。
> **读者**：维护者、产品负责人、准备做模块化拆分或竞品决策的人。
> **后续状态（2026-11-28）**：P0-2 已由 `d250a18` 修复（claim 后补落盘 + e2e）；P0-1 图片变换 `.slice()` 仍待修。

---

## 0. 结论摘要

1. **工程成熟度高，产品完成度高，但存在 2 个 P0 与约 29 个 P1。** 2 个 P0 分别是：图片变换工具 pointerdown 必崩（`interaction.js:343`）；多标签租约冲突期间点「仍以本页为准」后不补落盘，关闭页面会永久丢失编辑（`tab-lease.js:72` + `persistence.js:970`）。
2. **测试与门禁设计在全行业属于上游水平**：4,576 条 selftest 断言、52 个 Playwright spec、13 步总闸、10 条正面基线 + 20 种人为破坏、vendor 字节锚定、CSP 双向哈希。但仍有 5 处「门禁给出错误结论」的盲区：`check-deletions` 只认 `##`，账本只解析到 1 条占位记录（`## 建立账本`），所有 `###` 真实条目被当作正文；`REQUIRED_HOOKS` 解析失败会静默跳过；i18n 扫描不识别正则字面量与模板 `${}` 内字符串；适配层清单漏登记 `pdf-read.js` / `geometry.js`；删断言没有机器门禁。
3. **全维度工程评分约 3.7/5（未加权）**。强项是文档、交付、功能广度、测试设计；弱项是核心正确性、数据可靠性、性能最坏情况、国际化与生态能力。若把正确性/可靠性权重加倍，约 3.4/5。
4. **竞品定位清晰但不在主战场**：PlotPin 是「离线、零安装、免费、通用图纸标注 + CCTV 覆盖辅助」；CCTVplanner / CCTV Design Tool / IPVM / JVSG 的主战场是「真实镜头参数 + DORI 分区 + 相机库 + 3D + 自动布线 + 品牌化提案」。PlotPin 在离线与数据主权上领先，在相机库、3D、DORI 分区、自动布线、云端团队协作、移动端与多语言上明显落后。
5. **ngm 提取可行，但本轮不能执行**：已识别 12 个候选包，其中 5 个 Tier-1 低风险候选（`core-lease`、`format-pdf-vector`、`core-svg-sanitize`、`core-history`、`format-sheet`）。硬阻塞是：本机没有 `ngm` CLI（`ngm --version` 不存在）；新包必须在 `gitee:idcu/ngm-repo` 打 tag 后重新 lock/vendor/digest；单文件产物只剩 **11,902 B** 余量，提取会净增字节；工作区不受信任，无法跑五道门禁做闭环验证。
6. **建议顺序**：先修 2 个 P0 与数据/只读类 P1 → 补门禁盲区与弱断言 → 回收体积余量 → 再做 Tier-1 ngm 提取 → 最后做相机库/DORI 分区/3D 等竞品能力。**不要在未修 P0、未回收体积、无 ngm 工具链的情况下先做模块拆分。**

---

## 1. 审计方法与严重度

### 1.1 方法

- 8 路并行只读审计，按层拆分：common+vendor、core 几何、core 运行时、导入导出、UI/插件/协作、scripts/门禁、selftest、e2e+性能。
- 每个文件完整阅读；结论必须带 `file:line` 与代码证据；无法运行验证的标「未验证」。
- 主审计对 2 个 P0、多个 P1 做了二次代码复核；对 1 条 P1（「仅导出已交付未覆盖 PNG/SVG/DXF」）复核后降级为 P2，因为 `exportScope` 实际已作用于三类导出，缺的是 `deliveryGuard` 的空产物拦截。

### 1.2 严重度定义

| 级别 | 定义 |
|---|---|
| P0 | 必现崩溃、永久数据丢失、或安全边界可被普通用户路径突破 |
| P1 | 用户可见的数据错误/丢失窗口、核心功能不可用、门禁/测试给出错误结论、资源上限可被绕过 |
| P2 | 边界错误、性能退化、口径不一致、文档与实现冲突，但有可用的绕行路径 |
| P3 | 可维护性、命名、死代码、文档漂移、测试风格问题 |

### 1.3 验证边界

- 未运行 `node scripts/*`、`npm`、Playwright、`ngm`，因此所有「耗时/内存/通过率」数字均来自仓库既有文档或静态推算，不是本次实测。
- 未用真实 CAD/PDF/XLSX/Excel 样本验证；未做真机、Safari、Firefox、双设备 WebRTC 验证。
- 竞品信息来自公开官网/公开文章，核对日期 2026-11-28；价格与功能会变化，未做商务询价。

---

## 2. 代码规模与结构

### 2.1 规模

| 区域 | 文件数 | 行数 | 说明 |
|---|---:|---:|---|
| `js/common` | 9 | 3,388 | 零 DOM 算法/协议/适配器 |
| `js/core` | 14 | 8,561 | 状态、几何、渲染、交互、持久化 |
| `js/features` | 15 | 8,768 | UI、导入导出、规则、协作、插件 |
| **浏览器业务代码合计** | **38** | **20,717** | 不含 vendor |
| `ngm.vendor` | 10 个模块 | 约 2,300 | `@idcu/*` 源码 + 测试 |
| `scripts` | 21 + lib 4 | 15,252 | 含 10,638 行 selftest |
| `tests` | 64+ | 约 11,400 | 52 spec + 8 perf + fixtures |
| `index.html` 加载 | — | 48 个脚本 | 38 项目 + 10 vendor |
| `docs` | 18 篇（含本报告） | 约 3,300 | 另有 `contracts/` 4 份 JSON |
| Git | 542 commits | 1 位作者 | 单一作者，提交规范执行度高 |

### 2.2 分层与依赖

```
vendor(10) → common(9) → core(14) → features(15) → app.js
```

- 名义方向受 `scripts/check.mjs` 三类静态核对：状态写入口、跨层耦合计数（`contracts/coupling.json`）、钩子配对。
- 实际仍有 `core → features` 21 条（合计 91 次）、`common → core` 3 条、软调用 13 条。这是历史反向调用基线，只减不增。
- 状态唯一写入口是 `replaceState()`；提交协议是 `commitChange / commitObjectEdit / markDirty`；渲染静态层靠 `sceneStaticKey` 缓存。

### 2.3 一次编辑的数据流

```
pointer/keyboard
  → interaction.js：坐标/捕捉/草稿/命令
  → pushHistory()（调用方显式）
  → 修改 state
  → commitChange / commitObjectEdit
      → touchFloor / meta.updatedAt / z 重排
      → markDirty(kind)
          → coverage 清空、静态层失效、scheduleSave(450ms)、requestRender、UI 刷新、协作广播
  → render.js：静态层缓存 + 动态层每帧
  → runSave()：IndexedDB 主写 + localStorage 兜底
```

---

## 3. 全维度评分

> 评分是工程判断，不是市场测量。1=不可用，3=可用但有明显短板，5=同类最佳。

| 维度 | 分数 | 依据 | 主要扣分项 |
|---|---:|---|---|
| 功能广度 | 4.5 | 25 个功能域、8 种导出、双槽位、覆盖率、规则、快照、插件 | 无相机型号库、无 3D、无自动布线 |
| 核心正确性 | 3.0 | 2 个 P0、20+ 个 P1 | 图片变换崩溃、租约丢编辑、只读绕过、导入丢名称 |
| 数据可靠性 | 3.2 | 四类候选加载、救援副本、墓碑、LWW、快照 | 撤销不推进时间戳、`flushPendingSave` 清定时器、未绑定草稿互锁 |
| 安全/隐私 | 3.3 | CSP、转义、公式防护、SVG 清洗、Worker 沙箱 | 只读不是权限、沙箱是黑名单、协作无认证 |
| 性能/规模 | 3.4 | 10k 对象静态层优化、P95 门禁 | 布点优化最坏约 5e8 次判定、隐藏时全量克隆、万点面板 DOM |
| 架构/可维护性 | 3.8 | 分层、单一源、钩子、契约、模块文档 | 单文件最大 1,803 行、common→core 反向依赖、适配层漏登记 |
| 测试/门禁 | 3.9 | 4,576 断言、52 spec、20 破坏场景 | 删断言无门禁、缓存签名弱断言、ghost 零覆盖、deletions 门禁失效 |
| 文档/可运维 | 4.6 | 18 篇文档、事实源、控制面、发布清单 | 多处数字漂移（钩子 26/43、停车 5/5.5、打印单页/多页） |
| 扩展性/生态 | 3.2 | 插件 API 31 键、规则/符号注册 | 插件导入器不可用、无插件市场、无云 API |
| 交付/部署 | 4.6 | 单文件、零依赖、离线、`file://` | 余量仅 11,902 B、dist 无独立回归、跨浏览器无证据 |
| 国际化/可访问性 | 3.0 | 中英切换、44px、安全区 | i18n 覆盖率 47.54%、英文语义未评审、18 处 UI 硬编码 |
| 竞品竞争力 | 3.4 | 离线/免费/通用标注差异化 | 相机库、DORI 分区、3D、布线、提案、团队协作缺失 |

**未加权均值：3.7/5。**

---

## 4. 缺陷清单

### 4.1 P0（2 条，均已二次复核）

#### P0-1 图片变换工具一点手柄就抛 TypeError，功能完全不可用

- **位置**：`js/core/interaction.js:343`，契约根因 `js/core/geometry-transform.js:10`。
- **证据**：

```js
origin: imageTransformOf(state.background).slice(),
```

`imageTransformOf(bg)` 返回 `bg.transform || defaultImageTransform(bg)`，两条分支都是 `{a,b,c,d,e,f}` **对象**；对象没有 `.slice()`。同一文件的 `imageHandleDragTo`（`geometry-site.js:403-405`）反而兼容对象和数组，说明对象才是现行契约。
- **影响**：`currentTool==='image-transform'` 且命中手柄时，在 `drag` 赋值表达式内抛错；pointerdown 无 try/catch，工具完全不可用。用户唯一能做的动作就是点手柄。
- **为何没被发现**：selftest 直接传对象（`selftest.mjs:4540`、`:5044`）；e2e 只测前置禁用文案（`calibration-precheck.spec.mjs:12-58`），无拖拽用例。
- **修复**：`origin: Object.assign({}, imageTransformOf(state.background))`，并让 `imageHandleDragTo` 只接受对象；补「对象 origin + 四种拖动模式」selftest 与 e2e。

#### P0-2 租约冲突后「仍以本页为准」不补落盘，关闭页面永久丢编辑

- **位置**：`js/core/tab-lease.js:72`、`js/core/persistence.js:970`、`js/core/interaction.js:1667`、`js/features/ui-shell.js:383`。
- **证据链**：
  - `leaseClaim()` 只做 `leaseConfirmed=true; leaseConflict=false; leaseEmit(false); leaseSend(...,1)`，不调用 `scheduleSave()`。
  - 冲突期间每次 `markDirty → scheduleSave()` 在 `block==='lease'` 分支直接 `return`，不创建任何重试定时器。
  - 关闭时 `flushBeforeUnload()` 先算 `pending = !!saveTimer || !!saveRetryTimer || saveInFlight>0`；claim 后 `saveBlockState()` 返回 `ok`，但 `pending=false`，于是 `if(!pending) return false`，既不写 IndexedDB 也不写 localStorage 兜底。
- **影响**：多标签协作的「官方恢复动作」反而制造数据丢失窗口；刷新后回到冲突前旧内容。
- **修复**：`leaseClaim()` 成功后 `scheduleSave()`；`flushBeforeUnload` 在 `pending=false` 时也比较 `state.meta.updatedAt` 与 `lastSavedSeq`，不能只依赖定时器存在。

### 4.2 P1（29 条，按主题）

> 表中「代码可证」= 本轮已读代码确认；「审计静态结论」= 子审计报告给出、本轮未逐行复跑；「推算」= 未实测。

#### A. 数据丢失与状态一致性

| ID | 位置 | 问题与影响 | 证据 | 修复 |
|---|---|---|---|---|
| A1 | `persistence.js:174-196`、`snapshot.js:167-171` | undo/redo/快照回滚不推进 `meta.updatedAt`、不写墓碑；多标签可能被 `projectFreshness` 拒绝，协作远端 LWW 会忽略撤销或让已删对象复活 | 代码可证：`markDirty('restore')` 广播，但时间戳未推进 | 把撤销/回滚视为一次新编辑：推进工程/楼层时间，删除/恢复写墓碑 |
| A2 | `persistence.js:488-499` | `flushPendingSave` 先清 `saveTimer/saveRetryTimer` 再检查救援/租约；抛错后待保存内容没有任何定时器 | 代码可证 | 先做 block 判断再清定时器；或抛错前恢复重试 |
| A3 | `tab-lease.js:14,29,96` | 未绑定草稿 `projectId=''` 被当成同一工程，双击同一文件两个标签互相锁死自动保存 | 代码可证；`docs/modules.md:50` 也标「待确认」 | 未绑定工程用 `sessionStorage`/`meta.id` 区分；或对无 pid 禁用互斥并提示 |
| A4 | `interaction.js:587-591`、`viewport.js:30-45`、`io-export.js:434,477,881,999` | 图片变换提交不 `resetFrameRef`，PNG/SVG/PDF 按过期 `worldDims()` 裁切；屏幕显示正常所以难察觉 | 代码可证；P0-1 修复后立即暴露 | 图片/场地几何变更时统一失效 `_frameRef`；补导出四角覆盖 e2e |
| A6 | `interaction.js:1664-1692` | 每次 `visibilitychange→hidden` 先 `persistableState()` 全量 `structuredClone` 再判断 pending；10k 对象 P95 64.3 ms / 6.3 MB（文档既有数据） | 代码可证 | pending 判断提到克隆之前；隐藏只记标记，交给 pagehide/防抖链 |

#### B. 只读与权限边界

| ID | 位置 | 问题与影响 | 证据 | 修复 |
|---|---|---|---|---|
| B1 | `ui-panels.js:232,242,246-248,252-277,299-307,340-356,478-488,504-516,529-530,554-564,872-880`；`props.js:321-339,508-557,589-628,630-645,761-780`；`plugins.js:552-556` | 只读态下大量批量/属性/图层/类型/照片/节点/插件入口先改 `state`，再调用被拒绝的 `pushHistory/commitChange`，返回值被忽略；之后任一次正常提交会把只读期间修改一并落盘，且无撤销帧 | 代码可证（已复核 `ui-panels.js:232`、`props.js:618`） | 修改前统一 `guardWrite`，或 `withWriteGuard(fn)`；只读时禁用面板控件；补 e2e |
| B2 | `snapshot-ui.js:86-93`、`snapshot.js:167-170`、`io.js:126-142`、`persistence.js:1401` | 只读下快照回滚与「合并他人工程」仍 `replaceState` + `markDirty('restore')`（广播），突破本端锁且不可撤销 | 代码可证 | 两个入口提交前 `guardWrite`；远端协作走 `remote:true` 旁路 |
| B3 | `rules.js:724-730`、`collab.js:929-932` | 只读下改规则仍替换 `state.rules` 并 `collab.sendRules`，对端会应用 | 代码可证 | 定时器内先 `guardWrite`；只在 `commitChange` 成功后发送 |
| B4 | `contracts/adapters.json`、`check-ngm.mjs:363-376` | `pdf-read.js`、`geometry.js` 实际是 vendor 适配层但未登记；vendor 导出改名不会变红 | 代码可证 | 补登记 `modules/keeps`；扩展 ADAPTER_MARK 识别「委托 @idcu/」 |

#### C. 导入/导出与格式

| ID | 位置 | 问题与影响 | 证据 | 修复 |
|---|---|---|---|---|
| C1 | `pdf-read.js:250-271` | Flate 内嵌图重组的 PNG 把裸 filter+RGB 直接写进 IDAT，没有 zlib 头/adler32，生成非法 PNG；导入后底图静默缺失 | 代码可证 | 用 `CompressionStream('deflate')` 或 vendor zlib 封装 IDAT；补真实 Flate 图样本 |
| C2 | `pdf-read.js` 解析循环（约 `:350-435`） | 解码全部页全部内嵌图，只有单图上限，没有总张数/总像素/总字节预算；大 PDF 可内存暴增 | 审计静态结论 | 加总预算，按页/按需解码；超限计数并提示 |
| C3 | `xlsx-read/src/core.js:90-116` | 单元格 `r` 的列索引无界；仅检查 `cells.length > maxCols`，不检查 `idx`。`r="A1000000"` 可撑出百万长度稀疏数组 | 代码可证 | 检查 `idx < maxCols`，越界拒绝或截断并计数 |
| C4 | `io-import.js:212,251,630` | DXF 与单页 PDF 只校验 entities，不校验「现有对象 + 新增」是否超过 `OBJECTS_MAX`；多页 PDF/表格有校验；可把 10 万上限推到 20 万 | 代码可证（DXF）；单页 PDF 路径审计结论 | 提交前统一 `ensureObjectCapacity(新增数)` |
| C5 | `io-table.js:508-531` vs `:449` | 表格「新增」行不写 `o.text`；点/矩形/折线/尺寸/引线新增后名称丢失（只有 text 对象写） | 代码可证 | 新增路径补 `const name=c('名称'); if(name!=='') o.text=name;` |
| C6 | `xlsx-read/src/core.js:219-238`、`io-table.js:230` | 多工作表无差别拼接，第二张表表头变成数据行；严格模式整批失败，非严格模式产生噪声 | 代码可证 | 逐表保留表头并校验一致；或只取首表并提示 |
| C7 | `io-export.js:229-236`、`io-table.js:239` | XLSX 导出写 `inlineStr` 不加公式引号，导入却无条件 `formulaUnguard`；合法前导单引号被剥一层 | 代码可证 | XLSX 导入不 unguard，或导出时同样双层引号 |
| C8 | `io-table.js:447-495` | 严格模式创建行校验非法 X/Y/宽高，更新行却静默忽略 `X='abc'`、`宽度='0'`、`角度='x'` | 代码可证 | 更新行同样 `problem()`，整批不生效 |

#### D. 性能与规模

| ID | 位置 | 问题与影响 | 证据 | 修复 |
|---|---|---|---|---|
| D1 | `geometry-coverage.js:283-338` | 布点优化候选 = `(gridN+1)²×角度`，逐候选扫半径内全部格子；默认参数静态推算约 1e8 次/轮、5 轮约 5e8 次，主线程秒级~十秒级阻塞；bench 只测 `analyzeCoverage` | 推算，未实测 | 先选点后扫角、按已覆盖边界裁剪、网格桶/积分图；bench 增加该函数 P95 |

#### E. 插件、测试与门禁

| ID | 位置 | 问题与影响 | 证据 | 修复 |
|---|---|---|---|---|
| E1 | `plugins.js:449`、`:917-923` | `importViaPlugin` 发送 `input.bytes`，Worker `ctx` 只注入 `state/projectName/site/file`，没有 `bytes`，`file` 也不是 `File`；沙箱导入器读不到任何内容 | 代码可证 | `ctx` 注入 `bytes`，校验 `byteLength` 上限；补 e2e 真实字节导入 |
| E2 | `check-deletions.mjs:82` | 只识别 `## ` 标题，`docs/deletions.md` 真实条目全是 `###`；账本只解析到 1 条占位记录（`## 建立账本`），真实条目被当作正文 | 代码可证；`check-deletions` 实跑输出 1 条记录 | 同时识别 `##/###`，或统一账本标题层级 |
| E3 | `check.mjs:363-370` | `REQUIRED_HOOKS` 正则解析失败时 `requiredHooks=[]`，循环静默跳过，必需钩子校验形同虚设 | 代码可证 | 解析为空直接报错；断言 `requiredHooks.length===8` |
| E4 | `i18n-scan.mjs` | 不识别正则字面量，丢弃模板 `${...}` 内字符串；新增硬编码可绕过 | 审计静态结论 | 用轻量词法器/正则状态机；或把规则写成负例门禁 |
| E5 | `check-gates.mjs:350` | ICE 破坏场景只跑 `--filter=ICE-1`，ICE-2 的零泄露断言不被该场景执行 | 审计静态结论 | 场景覆盖 ICE-1+ICE-2，或拆两条破坏 |
| E6 | `selftest.mjs:5691`、`render.js:193-207` | 缓存签名断言用不存在的 id `'X1'`，`lodSelectedSig()` 恒空；真回归测不到 | 代码可证 | 用真实对象 id，并断言「选中即豁免 LOD」 |
| E7 | `ghost.js` 全部、`render.js` 的 `drawScene/ensureStaticLayer` | ghost/参照版零 selftest 覆盖；`ghostSig/refSig` 是否进静态签名无断言 | 审计静态结论 | 补 ghost 静态签名、清除后回原值、A/B 闪烁断言 |
| E8 | `tests/perf/speed.perf.mjs:33-48`、`perf-nightly.yml:28` | 硬编码跨机基线算「下降 30%」，快机假绿、慢机假红 | 代码可证 | 改为同机同 harness 的 A/B，或只用绝对阈值 |
| E9 | `tests/perf/p2-render.perf.mjs:154-183` | 形状密集场景永远 2000 对象，却按 `size`（2000/5000/10000）记录，5000/10000 阈值与负载不匹配 | 代码可证 | 按真实 size 构造负载，或固定只在 2000 判定 |
| E10 | `tests/e2e/perf-render.spec.mjs:110-115` | 性能阈值与像素门槛放进功能 e2e；README 已记录 runner 多次红 | 代码可证 | 性能断言迁到 perf harness；e2e 只留功能正确性 |
| E11 | `badge.mjs:33-38,96-109`、`check-gates.mjs` | 「断言数不得减少」没有机器门禁：badge 只做等值校验，20 个破坏场景没有「删断言」；删高价值断言 + 加便宜断言可全绿 | 审计静态结论 | 增加「删除一条断言必须变红」的破坏场景，或按 git diff 锁断言数 |

> 计数说明：原始子审计报告合计 30 条 P1，其中「仅导出已交付未覆盖 PNG/SVG/DXF」经复核降级为 P2（见 C9），故本表 29 条。

### 4.3 P2/P3 主题（去重后约 88 条 P2、110+ 条 P3）

| 主题 | 代表问题 | 影响 |
|---|---|---|
| 性能 | 每次提交全量刷新 + 全量 localStorage 扫描；筛选逐键 O(N)；万点节点编辑器 DOM 爆炸；断线逐 commit 整工程写盘；`renderLayers` O(L×N) | 大数据集卡顿，低端设备更明显 |
| 正确性 | 场地轮廓 4 份实现、椭圆采样无上限；7 套数值兜底导致渲染/包围盒不一致；扇形仿射仅正向相似精确；PDF Form 未解释、嵌套字典截断；DXF 多遍扫描/单位 NaN | 边界几何与导入保真度 |
| 一致性 | 导出可见性三套口径并存（CSV/XLSX=table、图纸=draw、打印报告摘要直接数 `state.objects`）；`spec.version=3` 与注释 v2 漂移；停车阈值代码 5 m/文档 5.5 m；打印报告多页/文档单页 | 同一份报告可能三个数 |
| 边界 | 精确 180° 旋转/镜像被判「轴对齐」，rect/平行四边形丢弃 angle（`geometry-transform.js:141-148,227-232`）；局部补绘把 LOD 隐藏标签画回来（`render.js:324-353,974`）；「仅导出已交付」未拦截 PNG/SVG/DXF 空产物（`io-export.js:450-458,814-817`） | 几何/导出的低频边界错误 |
| 安全 | 沙箱是黑名单而非语言级；原型链删除依赖运行环境；协作无认证/授权/审计；CSP 仅 `self` | 产品取舍已声明，但插件只应加载可信来源 |
| 文档 | 钩子调用 26 vs 43；新增 spec 漏登记；dist skip 5 vs 6；`modules.md` 36 符号/8 种导出/72 tests 漂移 | 文档可信度下降 |
| 测试 | `eq` 的 JSON.stringify 吞 NaN/undefined；只断言不抛错 5 处；20ms/300ms 计时断言易假红；快照式字符串绑定；SVG `<image href>` 未校验 scheme | 假绿/假红 |

---

## 5. 逐文件审计卡

> 行数为实测；「风险」列只列该文件最值得先看的 1–2 条，完整清单见 §4 与子审计报告。

### 5.1 js/common（9 个）

| 文件 | 行数 | 职责 | 对外符号 | 风险/问题 |
|---|---:|---|---|---|
| `content-assets.js` | 105 | 内容寻址资产适配、引用收集、孤儿清理 | `ContentAssets.*` | `prune` 部分失败只 warn，与「整体放弃」文档不一致 |
| `dxf.js` | 349 | DXF 适配：版本/单位、补充实体、ARC 保真 | `Dxf.*` | 同一文本 4–5 遍全文扫描；单位 NaN 边界 |
| `i18n.js` | 1,244 | 中英文案、插值、DOM 替换 | `I18N.* / L` | 107 KB 数据；`apply` 四轮 `querySelectorAll`；缺键回退中文 |
| `merge.js` | 578 | LWW + 墓碑合并、配置差异、覆盖报告 | `mergeProjectData` 等 | 配置报告「已补缺」虚报；`common→core` 反向依赖 |
| `pdf.js` | 8 | `pdf-image` 适配 | `Pdf` | 纯转发，无问题 |
| `pdf-read.js` | 433 | PDF 内容流、文字解码、内嵌图→PNG、页序 | `PdfRead.*` | **P1：非法 PNG、无总量图像预算** |
| `pdf-vector.js` | 265 | 矢量 PDF 写入、Type3 文字层 | `PdfVec.*` | 无外部 PDF 解码器验证；通用性最强 |
| `qr.js` | 18 | 二维码适配 + SVG | `Qr` | `qrSvg` 无单测；容量 42 B 需调用方降级 |
| `symbols.js` | 388 | 37 符号、SVG 清洗、搜索、DXF 折线 | `SYMBOL_*`、`parseSvgSymbol` 等 | 正则白名单解析；每次 flatten 重复 |

### 5.2 js/core（14 个）

| 文件 | 行数 | 职责 | 关键风险 |
|---|---:|---|---|
| `app.js` | 57 | 启动编排 | 启动顺序改动影响 48 脚本断言与首启引导 |
| `config.js` | 193 | 常量、vendor 注册、类型/图标、钩子 | `APP_LIMITS` 唯一源；`ensureVendor` 缺失会抛错 |
| `geometry.js` | 716 | 2D 几何、形状、吸附、对齐 | `polygon` 残留；`collectSnap` 仍用 rectPoints |
| `geometry-site.js` | 459 | 场地/手柄/面积周长/图片仿射 | 场地轮廓 4 份实现；椭圆采样无上限 |
| `geometry-coverage.js` | 336 | 覆盖率、盲区、布点优化、DORI 距离 | **P1：布点优化最坏 5e8 次；注释 v2/spec v3** |
| `geometry-transform.js` | 279 | 图片像素↔世界、仿射、世界变换 | 180° 轴对齐丢 angle |
| `ghost.js` | 186 | 幽灵参考层、参照版 | **零 selftest 覆盖** |
| `interaction.js` | 1,697 | 指针/触摸/键盘、工具、校准、剪贴板 | **P0：图片变换 `.slice()`；隐藏全量克隆** |
| `model.js` | 748 | 状态、编号、注解、历史快照 | 历史快照引用共享，禁止就地修改 |
| `persistence.js` | 1,803 | 保存/恢复/迁移/撤销/资产 GC/合并 | **P0 租约、P1 撤销时间戳、flush 清定时器** |
| `render.js` | 1,489 | Canvas 渲染、静态层、补绘 | 补绘 LOD 标签回来；缓存签名需完整 |
| `snapshot.js` | 355 | 快照存取/淘汰/差异/叠加 | 回滚不推进时间戳 |
| `tab-lease.js` | 136 | 多标签编辑租约 | **P0 claim 不落盘；未绑定草稿互锁** |
| `viewport.js` | 107 | 世界↔屏幕、取景框、缩放 | `_frameRef` 失效点易漏 |

### 5.3 js/features（15 个）

| 文件 | 行数 | 职责 | 关键风险 |
|---|---:|---|---|
| `catalog.js` | 70 | 产品目录校验/存取 | 事务化导入，正常 |
| `collab.js` | 1,452 | 同机/WebRTC 协作、冲突账本 | 无认证；断线补发整工程写盘；大片逻辑 |
| `comments.js` | 98 | 本机批注 | 不参与协作/导出，正常 |
| `io.js` | 185 | 新建/工程库/楼层/导入入口 | 只读合并未守；资产回收吞错 |
| `io-export.js` | 1,239 | 8 种导出、标题栏、PDF | **P1：空产物 guard；C7 引号不对称** |
| `io-fields.js` | 234 | 字段表、DSV/XLSX、报价 | 字段表唯一源；`formulaUnguard` 无条件 |
| `io-import.js` | 868 | 图片/DXF/PDF/表格导入 | **P1：OBJECTS_MAX 未校验；多页 PDF 复杂** |
| `io-table.js` | 545 | 表格预览/批量布点/替换 | **P1：新增丢名称；严格更新不校验** |
| `parking.js` | 161 | 停车位规划 | 通道阈值 5 m 与文档 5.5 m 不一致 |
| `plugins.js` | 921 | 插件 API/清单/沙箱/面板 | **P1：导入器无字节；沙箱黑名单** |
| `props.js` | 781 | 属性面板、节点编辑 | **P1：只读绕过；万点 DOM** |
| `rules.js` | 748 | 几何规则检查 | **P1：只读广播规则** |
| `snapshot-ui.js` | 131 | 快照面板/对比/回滚 | **P1：只读回滚** |
| `ui-panels.js` | 894 | 页签/清单/图层/类型/统计 | **P1：只读绕过；全量刷新** |
| `ui-shell.js` | 441 | 弹窗/toast/转义/引导/横幅 | `esc/xmlEscape` 不可互换；租约横幅不补存 |

### 5.4 scripts 与 tests

| 区域 | 规模 | 结论 |
|---|---|---|
| `scripts/check*.mjs` | 11 个 | 设计强，但 deletions/REQUIRED_HOOKS/i18n/ICE/adapters 有盲区 |
| `scripts/build/minify/pack` | 3 个 | terser `unsafe`/`pure_getters`/`passes:6` 需 golden 保底；体积余量 11,902 B |
| `scripts/selftest.mjs` | 10,638 行 | 分区 176 个；断言数无法离线复核；ghost/缓存签名/LOD 有缺口 |
| `scripts/bench.mjs` | 477 行 | 只测 `analyzeCoverage`，未测布点优化、万点面板、隐藏克隆 |
| `tests/e2e` | 52 spec / 7,775 行 | 真实 Playwright Chromium；dist 无独立回归；36 处固定 sleep |
| `tests/perf` | 8 个 / 1,937 行 | 存在跨机硬编码基线、负载/阈值不匹配、perf 断言混入 e2e |

---

## 6. 竞品全维度对比

> 公开资料核对日期 2026-11-28。价格均为官网公开价，未含税/折扣；「未逐项核对」表示只看了公开页面摘要。

### 6.1 市场分层

| 层 | 代表产品 | 与 PlotPin 的关系 |
|---|---|---|
| CCTV 覆盖设计 SaaS | CCTVplanner、CCTV Design Tool、IPVM Calculator | **直接竞品**：抢「点位规划 + 覆盖分析」预算 |
| CCTV 设计桌面软件 | JVSG IP Video System Design Tool | 直接竞品：离线、专业、3D |
| 厂商设计工具 | 海康云商/Hik-Partner Pro、Dahua DHTools/Project Design、Hanwha DesignPro、Axis Site Designer | 生态绑定，免费；抢「配单/方案」入口 |
| CAD/电气设计 | 天正电气、浩辰 CAD、AutoCAD | 上游工具：PlotPin 可做其标注/覆盖补充 |
| PDF 标注/审阅 | Bluebeam Revu、Drawboard PDF | 邻近竞品：抢「图纸批注/测量」预算 |
| 施工图纸管理 | Fieldwire、Autodesk Build/Docs | 邻近竞品：抢「现场标注 + 协作」预算 |
| 通用图表/白板 | draw.io、Excalidraw、Visio | 非直接竞品：无图纸校准与 CCTV 覆盖 |

### 6.2 能力矩阵

图例：✅ 具备；◐ 部分/需特定版本/未逐项核对；❌ 不具备。

| 能力 | PlotPin | CCTVplanner | CCTV Design Tool | IPVM | JVSG | 海康/大华 | 天正 | Bluebeam | Fieldwire | 浩辰 |
|---|---|---|---|---|---|---|---|---|---|---|
| 完全离线 | ✅ | ❌ | ❌ | ❌ | ✅/◐ | ❌ | ✅ | ◐ | ◐ | ✅ |
| 零安装 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ◐ |
| 免费/开源 | ✅ MIT | ◐ 免费层 | ◐ 免费层 | ◐ 限 4 相机 | ❌ | ✅ 生态免费 | ❌ | ❌ | ◐ 免费层 | ◐ 免费层 |
| 图片/PDF 底图 | ✅ | ✅ | ✅ | ◐ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DXF/DWG 导入 | ✅ DXF | ◐ | ◐ | ❌ | ✅ DWG Pro | ◐ | ✅ DWG | ❌ | ◐ | ✅ DWG |
| 相机型号库 | ❌ | ✅ 66,611 | ✅ 32,000+ | ◐ | ✅ 23,000+ | ✅ 厂商库 | ❌ | ❌ | ❌ | ❌ |
| 真实镜头/FOV | ◐ 类型级 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| DORI 分区 | ◐ 距离表 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 3D/遮挡 | ❌ | ✅ | ◐ | ◐ | ✅ | ✅ | ❌ | ❌ | ❌ | ◐ 查看 |
| 自动布线 | ❌ 仅统计 | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| BOM/报价 | ✅ 基础 | ✅ | ✅ | ❌ | ◐ | ✅ | ✅ 材料表 | ✅ takeoff | ❌ | ◐ |
| 品牌化提案 | ◐ 图框/标题栏 | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ◐ | ❌ |
| 云/团队协作 | ❌ P2P/本机 | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ◐ |
| 移动端 | ◐ 响应式 | ✅ 浏览器 | ✅ 浏览器 | ✅ 浏览器 | ❌ Windows | ✅ | ❌ | ◐ | ✅ App | ✅ App |
| 插件/API | ✅ Worker 沙箱 | ❌ | ❌ | ❌ | ❌ | ❌ | ◐ | ✅ | ✅ | ❌ |
| 多语言 | ◐ 47.54% | ✅ 33 语言 | ◐ | ◐ | ✅ 20 语言 | ◐ | ❌ | ✅ | ✅ | ❌ |
| 数据主权 | ✅ 本机 | ◐ EU 云 | ◐ 云/零知识 | ❌ 云 | ✅ 离线版 | ❌ 云 | ✅ 本机 | ◐ | ◐ | ✅ 本机 |
| 通用标注深度 | ✅ | ❌ 相机为主 | ❌ | ❌ | ◐ | ❌ | ◐ 电气 | ✅ PDF | ◐ | ◐ |
| 规则/快照/差异 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ◐ | ◐ | ❌ |

### 6.3 关键产品事实

#### CCTVplanner（最直接竞品）

- 浏览器 SaaS，免费层 2 项目 / 6 相机；Installer €5/月、Business €10/月、Studio €19/月、Enterprise €150/月。
- 66,611 个相机型号 / 113 厂商；真实焦距/传感器/分辨率计算 FOV，DORI 按 EN 62676-4；2D + 3D + 热成像 + 日夜光照。
- 卫星图/平面图、自动布线、PDF/DXF/报价/电子签名、33 语言、EU 托管。
- 对 PlotPin 的威胁：功能完整度与「提案成交」闭环；PlotPin 的差异化只剩离线、免费、零安装、通用标注。

#### CCTV Design Tool

- 浏览器 SaaS，免费层 3 相机 / 3 设备 / 3 页报告；Premium $9/月（$108/年）。
- 32,000+ 相机、30,000+ 网络设备；FOV/DORI/PPM/夜视；自动布线、BOM、利润/税、品牌 PDF。
- 团队/分享链接/2FA/零知识模式。
- 对 PlotPin 的威胁：中低价位 + 完整安装商工作流；PlotPin 无法在「相机库 + 报价 + 提案」上正面竞争。

#### IPVM Calculator

- 浏览器，免费限 4 相机 + 1 分钟会话；完整 $199/年（二手来源，未在 IPVM 官网逐项核对）。
- Google Street View 实景、像素密度、实时预览。
- 对 PlotPin 的威胁：轻量快速验证；但功能窄、付费墙硬。

#### JVSG IP Video System Design Tool

- Windows 桌面，Basic €319 / Pro €799 / Expert €1,599，一次性买断；有 Offline 版。
- 23,000+ 相机、DWG 导入（Pro+）、3D 模型、DORI EN 62676-4、布线长度、带宽/存储、PDF/DOC/ODT/XLS/DWG/DXF。
- 对 PlotPin 的威胁：专业离线市场的标杆；PlotPin 胜在零安装/跨平台/免费/通用标注，输在 3D、DWG、相机库、布线。

#### 厂商设计工具（海康/大华/Hanwha/Axis）

- 免费或随生态提供；AI 识图、设备仿真、自动布线、配单/报价、方案输出。
- 对 PlotPin 的威胁：生态绑定与「配单即报价」；PlotPin 胜在厂商中立、离线、通用标注。

#### 天正电气

- AutoCAD 插件，17 个模块，电气/弱电平面、导线/桥架、材料表、碰撞检查、照度计算。
- 对 PlotPin 的威胁：专业电气设计深度；PlotPin 不与之正面竞争，可做其前后端补充。

#### Bluebeam Revu / Drawboard PDF

- Bluebeam：$260–$590/用户/年（2026 公开价），PDF 标注/测量/takeoff/Studio 协作。
- Drawboard：免费基础版；Pro Lite $4.19/月、Pro Plus $6.99/月、Pro Unlimited $13.33/月；手写/测量/OCR/密文/实时协作。
- 对 PlotPin 的威胁：PDF 批注成熟度与生态；PlotPin 胜在 CCTV 覆盖/BOM/矢量场地/离线单文件。

#### Fieldwire / Autodesk Build

- Fieldwire：免费 5 用户/3 项目/100 图纸；Pro $39、Business $64、Business Plus $89/用户/月（年付）。
- 施工图纸管理、任务/检查/离线；Autodesk Build/Docs 为云施工管理。
- 对 PlotPin 的威胁：现场协作与项目管理；PlotPin 胜在独立、免费、CCTV 分析。

#### 浩辰 CAD 看图王

- DWG/DXF/RVT 查看、3D 浏览、标注测量、轻量编辑；免费 + 会员。
- 对 PlotPin 的威胁：DWG 生态与移动端；PlotPin 胜在覆盖分析、规则、快照、插件。

### 6.4 PlotPin 的定位与 SWOT

| | 内容 |
|---|---|
| **优势** | 完全离线、零安装、零运行时依赖、MIT 免费；通用标注深度（场地/区域/折线/尺寸/圆弧/样条）；DXF/PDF/表格导入；8 种导出；规则/快照/差异/插件；数据本机；单文件可交付 |
| **劣势** | 无相机库、无真实镜头/DORI 分区、无 3D、无自动布线、无品牌化提案、无云端团队、移动端仅响应式、i18n 47.54%、英文语义未评审 |
| **机会** | 中小集成商/物业/自用市场的「离线 + 免费 + 厂商中立」；作为 CAD/安防厂商工具的前后处理；插件生态；私有化/内网部署 |
| **威胁** | CCTVplanner/CCTV Design Tool 的免费层持续下探；厂商工具免费绑定；Bluebeam/Fieldwire 的协作生态；PDF/CAD 巨头的 AI 功能 |

**定位建议**：不要把自己包装成「CCTV 设计 SaaS 的替代品」。更准确的定位是：

> 「离线、零安装、厂商中立的图纸标注与点位规划工作台；需要真实镜头参数/3D/自动布线时，导出到专业工具或通过插件扩展。」

这样既保留差异化，又避免在相机库/3D/云协作上被正面碾压。

### 6.5 竞品差距与优先级

| 差距 | 竞品现状 | PlotPin 现状 | 建议优先级 | 说明 |
|---|---|---|---|---|
| 相机型号库 | 23k–66k 型号 | 无 | **高** | 以可导入 JSON 目录实现，放工程命名空间，不进主包；复用现有产品目录与 BOM |
| 真实镜头/FOV | 焦距/传感器/分辨率 | 类型级 FOV/半径 | **高** | 在相机库中存 focal/sensor/res，运行时换算 FOV；不引入运行时依赖 |
| DORI 分区 | 画布分区 + 标准 | 仅距离表 | **高** | 复用 `doriMaxDistance`，在画布画 D/O/R/I 环；保持「非规范审图」提示 |
| 3D/遮挡 | 3D 场景/热成像 | 无 | 中 | 成本高；可先做 2.5D 高度/俯仰/遮挡近似，不承诺 3D |
| 自动布线 | 自动路径 + 线长 | 沿折线统计 | 中 | 先做 Manhattan/避障近似与线槽统计，导出线缆表 |
| 品牌化提案 | 品牌 PDF/电子签 | 图框/标题栏 | 中 | 复用 PDF 矢量文字层与标题栏，做模板化提案 |
| 云/团队 | 账号/权限/共享 | 本机/P2P | 低（产品取舍） | 与「无服务器/离线」冲突；可做可选自托管同步 |
| 移动端 | 原生 App/浏览器 | 响应式 | 中 | 先做真机 PWA 验证与手势，不新增原生 App |
| 多语言 | 20–33 语言 | 47.54% | 中 | 先补齐英文语义与 UI 硬编码，再扩语言 |
| 相机库/插件生态 | 厂商库/API | 插件沙箱 | 低-中 | 插件市场可后置；先把导入器修好 |

---

## 7. ngm 模块化提取方案

### 7.1 现有 ngm 模块格式（从 vendor 反推）

每个模块目录：

```
packages/<domain>/<name>/
  ngm.json            # schemaVersion:3, name:"@idcu/<domain>-<name>", version, runtime:"node", main:"./src/index.mjs", dependencies:[]
  README.md
  src/core.js         # UMD/IIFE，挂 globalThis.__idcu<Name>，供 classic <script> 加载
  src/index.mjs       # ESM 包装：import './core.js'，解构 globalThis.__idcu<Name> 后 export
  src/index.cjs       # CJS 包装
  test/<name>.test.mjs
```

消费方接线：

1. `ngm.json` 声明 `gitee:idcu/ngm-repo` + `path` + `ref: <path>/v<semver>`。
2. `ngm.lock` 记录 commit / moduleDigest / subtreeOid / requiredBy。
3. `ngm.vendor/gitee.com/idcu/ngm-repo/<path>` 放源码；`.ngm-version` 钉住工具链（当前 0.103.0）。
4. `index.html` 在 vendor 组加载 `src/core.js`。
5. `js/common/*.js` 或 `js/core/*.js` 做适配层，保留旧全局名；`contracts/adapters.json` 登记 `modules/keeps`。
6. `scripts/check-ngm.mjs` 校验清单/锁/字节摘要/适配层；`scripts/ngm-vendor-digest.json` 是离线字节兜底。

### 7.2 提取原则（与仓库红线一致）

1. **不新增运行时依赖**；模块必须是零依赖纯函数或注入式。
2. **公共 API 兼容**：旧全局名、旧签名、旧 golden 不变；适配层保留承诺名。
3. **单一源**：提取后删除应用内重复实现，不得留下第二份。
4. **门禁闭环**：selftest 断言数不减、e2e 全绿、8 种导出 golden 字节不变、`build --check` 不超 860,160 B。
5. **同 commit 文档**：`docs/modules.md`、`docs/ARCHITECTURE.md`（如架构变化）、`CHANGELOG.internal.md`、`contracts/adapters.json` 同步。
6. **SW 版本递增**：改 `js/**` 或 `index.html` 后 `check-sw --update`。

### 7.3 候选包矩阵

| 候选包 | 来源 | 导出面（建议） | 规模 | 依赖 | 调用方 | 风险 | 优先级 |
|---|---|---|---|---:|---|---|---|---|
| `@idcu/core-lease` | `js/core/tab-lease.js` | `createLease({channel,key,ttl,heartbeat,now,storage})`、`leaseStatus` | 136 | BroadcastChannel/localStorage | app、保存链 | **低** | **Tier-1** |
| `@idcu/format-pdf-vector` | `js/common/pdf-vector.js` | `stream/docPages/fit/mapPt/path/image/flate/textBitmap` | 265 | TextEncoder/CompressionStream/Canvas 注入 | io-export | **低-中**（golden 字节） | **Tier-1** |
| `@idcu/core-svg-sanitize` | `js/common/symbols.js:89-293` | `parseSvgSymbol/sanitizeSymbolBundle/normalizeSymbol*` | ~205 | 无 | 符号库、类型面板 | **低**（安全收益高） | **Tier-1** |
| `@idcu/core-history` | `js/core/model.js:395-480` | `snapshotHistoryState/materializeHistoryState/createHistory` | ~100 | 无（纯对象） | persistence、snapshot | **中**（引用共享语义） | **Tier-1** |
| `@idcu/format-sheet` | `js/features/io-fields.js:4-16` + DSV | `formulaGuard/formulaUnguard/buildTable/exportTable` | ~150 | `@idcu/format-dsv` | io-table/io-export/报价 | **中**（字段表产品化） | **Tier-1** |
| `@idcu/core-merge` | `js/common/merge.js` | `mergeProject(current,incoming,{adapters,now})` | 578 | 无（需注入常量） | persistence/collab | **中-高**（1:1 语义） | Tier-2 |
| `@idcu/core-coverage` | `js/core/geometry-coverage.js` | `analyzeCoverage/blindSpots/optimizePlacement/dori` | 336 | 注入几何/形状适配器 | ui-panels/导出/规则 | **中-高**（性能/口径） | Tier-2 |
| `@idcu/core-plugin-host` | `js/features/plugins.js:41-835` | `createSandboxHost({workerSource,caps,apiVersion,limits,handlers})` | ~600 | Worker/Blob/URL | plugins | **高**（安全） | Tier-2 |
| `@idcu/core-asset-index` | `js/common/content-assets.js` + `persistence.reachable*` | `collectRefs/reachable/prune` | ~150 | `@idcu/core-assets` | 资产 GC | 中 | Tier-2 |
| `@idcu/core-shape` | `geometry-site.js` + `geometry-transform.js` 形状段 | `shapeOutline/shapeArea/shapeHandles/affineShapeTransform` | ~400 | `@idcu/core-geometry` | 渲染/导出/规则 | **高**（golden） | Tier-3 |
| `@idcu/core-store` | `persistence.js` IDB/保存队列段 | `createStore({idb,ls,debounce,retry})` | ~300 | IndexedDB/localStorage | 保存链 | **高**（数据完整性） | Tier-3 |
| `@idcu/tool-gates` | `scripts/lib/*` + check 助手 | `walkFiles/readJson/budgetStatus/goldenWritable` | ~200 | Node 内置 | scripts | 低（工具链） | Tier-2（独立仓） |
| `@idcu/test-fixtures` | `tests/perf/fixture.mjs` + e2e helpers + selftest builders | `installScene/openApp/waitBootSettled/buildPdf` | ~300 | Playwright（开发期） | tests | 低（工具链） | Tier-2（独立仓） |

### 7.4 Tier-1 包的最小规格示例（core-lease）

`ngm.json`：

```json
{
  "schemaVersion": 3,
  "name": "@idcu/core-lease",
  "version": "0.1.0",
  "runtime": "node",
  "main": "./src/index.mjs",
  "dependencies": []
}
```

`src/index.mjs`：

```js
import './core.js';
const G = globalThis.__idcuLease;
if (!G) throw new Error('@idcu/core-lease: core.js 未正确加载');
export const { createLease, LEASE_TTL_MS, LEASE_HEARTBEAT_MS } = G;
export default G;
```

`src/core.js` 的 API 边界：

```js
globalThis.__idcuLease = (function () {
  'use strict';
  function createLease(opts) {
    // opts: { channel, projectId, tabId, now, ttl, heartbeat, storage, onChange }
    // 返回：{ start, stop, claim, status, saveBlocked, tick, destroy }
  }
  return { createLease, LEASE_TTL_MS: 15000, LEASE_HEARTBEAT_MS: 5000 };
})();
```

适配层 `js/core/tab-lease.js` 只保留旧全局名与业务绑定：

```js
const lease = __idcuLease.createLease({ /* 注入 state/projectId/storage */ });
function acquireEditorLease(){ return lease.start(); }
function leaseClaim(now){ return lease.claim(now); }
// 旧函数名与签名全部保留
```

> 注意：上面是**方案示意**，不是已实现代码。真正提交时必须补 `test/`、`README.md`、`contracts/adapters.json`、`ngm.lock`、`ngm-vendor-digest.json` 与 `index.html` 加载行。

### 7.5 「本地模块」方案（备选，不推荐默认采用）

如果 `gitee:idcu/ngm-repo` 暂时不可写，可选两条路：

| 方案 | 做法 | 代价 | 建议 |
|---|---|---|---|
| A. 私有 tag | 在 ngm-repo 建 `packages/local/<name>`，打 `local-v0.x` tag，按正式流程 vendor | 仍需 ngm CLI 与仓库权限 | **推荐**（不破坏供应链） |
| B. 仓内本地模块 | 新建 `local_modules/<name>/`，仿 ngm 目录，但由 `index.html` 直接加载 | 需要改 `check-ngm`/`check.mjs`/目录白名单；供应链门禁被削弱；dist 增大 | 不推荐；除非明确接受「本仓私有扩展」定位 |

**不要同时维护两套模块加载器**。如果必须本地化，至少保持同一 `ngm.json` 形状与 UMD 入口，未来可无痛提升为正式包。

### 7.6 迁移顺序（建议）

| 步骤 | 动作 | 验收 |
|---|---|---|
| 0 | 修 P0-1/P0-2，补 e2e；再修 A1–A6、B1–B4 | 五道门禁全绿；新增断言；无 golden 变化 |
| 1 | 体积回收：重复文案、i18n 死条目、死代码；目标余量 ≥ 20,000 B | `build --check` 记录前后字节；golden 不变 |
| 2 | 上游 `@idcu/core-lease`，写 test/README；打 tag | 包测试通过；ngm lock 生成 |
| 3 | vendor + 适配层 + `contracts/adapters.json` + `index.html` | `check-ngm` 通过；旧全局名断言不变 |
| 4 | 删除旧实现；跑全量门禁 | selftest 不减；e2e 全绿；8 种 golden 字节不变；dist 仍 < 860,160 B |
| 5 | 同批更新 `docs/modules.md`、`ARCHITECTURE.md`、`CHANGELOG.internal.md`、SW 版本 | `check-sw --update`；文档命令可解析 |
| 6 | 重复 2–5 做 `format-pdf-vector`、`core-svg-sanitize`、`core-history`、`format-sheet` | 每个包独立 commit；每个 commit 可回滚 |
| 7 | Tier-2 评估：`core-merge` → `core-coverage` → `core-plugin-host` | 先做行为等价测试，再做提取 |

### 7.7 硬阻塞与体积预算

| 阻塞 | 现状 | 解除条件 |
|---|---|---|
| ngm CLI 缺失 | `ngm --version` 返回「无法识别」 | 安装 ngm 0.103.0 并确认可 `ngm verify --content` |
| 仓库/网络 | 新包需在 `gitee:idcu/ngm-repo` 打 tag；本轮未验证网络与权限 | 可推送 tag 的凭据/网络 |
| 工作区不受信任 | 不能运行 `node scripts/*`，无法做门禁闭环 | 在受信任环境执行，或用户明确授权运行 |
| 体积余量 | 848,258 / 860,160 B，余量 11,902 B | 先回收 ≥ 10,000 B，再按包逐个测量 |
| 公共 API/golden | 适配层、8 种导出 golden、selftest 断言 | 每步 `build --check` + golden 字节比对 |
| SW 版本 | 当前 329 | 任何 `js/**`/`index.html` 改动后递增并更新指纹 |

**体积判断**：提取到 vendor 不会让 dist 变小，通常净增（UMD + ESM/CJS 包装 + 适配层）。只有在「删除重复实现 + minifier 更好的死代码消除」时可能持平或略降。以当前 11,902 B 余量，**先回收再提取**是硬前提。

### 7.8 本次新增/调整的公共抽象清单（候选，未落代码）

> 按用户规则列出；本轮只识别，不实现。

| 抽象 | 现状 | 建议 | 影响范围 |
|---|---|---|---|
| `createLease` | `tab-lease.js` 全局函数 + 模块级变量 | 提取为注入式 lease 实例 | app、保存链、selftest |
| `snapshotHistoryState/materializeHistoryState` | `model.js` 全局 | 提取为 `createHistory`，保留旧函数包装 | persistence、snapshot、selftest |
| `parseSvgSymbol/sanitizeSymbolBundle` | `symbols.js` 全局 | 提取为 SVG 净化包 | 符号库、类型面板、插件 |
| `PdfVec.*` | `pdf-vector.js` 全局 | 提取为 PDF 矢量写入包 | io-export、golden |
| `formulaGuard/formulaUnguard` | `io-fields.js` 全局 | 提取为表格防护包 | io-table、io-export、报价 |
| `mergeProjectData` | `merge.js` 全局 | 提取为注入 schema 适配器的合并引擎 | persistence、collab、snapshot |
| `analyzeCoverage/optimizeCameraPlacement` | `geometry-coverage.js` 全局 | 提取为覆盖分析包（注入几何） | ui-panels、导出、规则 |
| `createSandboxHost` | `plugins.js` 内部 | 提取为插件宿主包 | plugins、契约 |
| `collectAssetRefs/reachable` | `content-assets.js` + persistence | 提取为资产索引包 | 资产 GC、快照 |

---

## 8. 建议路线图

### Phase 0：止血（先做，不新增功能）

1. 修 P0-1 图片变换 `.slice()`；补四种拖动模式 e2e。
2. 修 P0-2 租约 claim 补落盘；补「冲突→claim→关闭→重开」e2e。
3. 修 A1/A2/A3/A4/B1/B2/B3/C5/C6/C7/C8/E1/E2/E3。
4. 补 E6/E7 的 ghost 与缓存签名断言；修 E8/E9 性能门禁。
5. 验收：五道门禁全绿；selftest 只增不减；e2e 全绿；golden 字节不变。

### Phase 1：正确性与数据可靠性

- 统一只读写入口：`guardWrite` 前置 + `withWriteGuard`；补批量/属性/插件/规则 e2e。
- 统一导入容量校验：DXF/PDF/表格/插件全部走 `ensureObjectCapacity`。
- 统一导入/导出表格语义：名称、公式引号、多工作表、严格更新校验。
- 修 PDF 非法 PNG 与图像总预算；修 XLSX 列索引上限。
- 验收：每项一个原子 commit，body 带实测/断言数据；文档与 CHANGELOG 同步。

### Phase 2：性能与体积

- 布点优化：先选点后扫角、已覆盖裁剪、网格桶；bench 增加 P95/heap。
- 隐藏卸载：pending 判断前置；减少全量克隆。
- 面板刷新：增量渲染/虚拟列表；筛选索引。
- 体积回收：重复文案、i18n 死条目、死代码；目标余量 ≥ 20,000 B。
- 验收：bench 数据达标；dist 不超上限；8 种 golden 不变。

### Phase 3：ngm Tier-1 提取

- `core-lease` → `format-pdf-vector` → `core-svg-sanitize` → `core-history` → `format-sheet`。
- 每个包独立 tag、独立 commit、独立门禁；适配层保留旧全局名。
- 验收：`check-ngm` 10/10；`ngm verify --content`；selftest 不减；e2e 全绿；dist 仍 < 860,160 B。

### Phase 4：竞品能力补齐（按 ROI）

1. 相机型号库（JSON 导入，工程命名空间）+ 真实镜头 FOV + DORI 画布分区。
2. 自动布线近似 + 线缆表；品牌化提案 PDF。
3. 2.5D 高度/俯仰/遮挡近似；移动端 PWA 真机验证。
4. i18n 补齐与英文语义评审。
5. 云端/团队协作（产品取舍，最后做）。

### Phase 5：生态与长期

- 插件市场/模板市场；自托管同步；多语言；公开 API 文档。

---

## 9. 验证边界与未验证项

| 项 | 状态 | 原因 |
|---|---|---|
| 本轮 selftest/e2e/bench 实跑 | **未运行** | 工作区不受信任，禁止执行仓库脚本 |
| 4,576 断言 / 176 分区 | 引用文档 | 未能离线复核；静态调用点约 4,005，其余靠循环展开 |
| 214 e2e 用例 | 引用文档 | 未运行；子审计确认 spec 与报告一致，但未复跑 |
| 布点优化 5e8 次判定 | 静态推算 | 未实测；需 bench |
| PDF 非法 PNG 的真实解码结果 | 代码可证 | 未用真实 Flutter/PDF 样本跑浏览器解码 |
| XLSX 稀疏数组 OOM | 代码可证 | 未构造恶意样本实测 |
| 只读绕过 | 代码可证 | 未跑两标签/两设备实测 |
| 竞品价格/功能 | 公开资料 | 未商务询价；厂商工具未逐项核对 |
| 真机/Safari/Firefox/双设备 WebRTC | **未验证** | 缺设备/环境，沿用 `docs/known-issues.md` 口径 |
| ngm 提取 | **未执行** | 缺 ngm CLI、tag 权限、门禁环境 |

---

## 附录 A：门禁命令（提取/修复后必须全跑）

```powershell
node scripts/check.mjs --selftest
node scripts/check-ngm.mjs
node scripts/check-sw.mjs
node scripts/check-contracts.mjs
node scripts/check-plugin-api.mjs
node scripts/i18n-scan.mjs --check
node scripts/check-discipline.mjs --strict
node scripts/check-deletions.mjs
node scripts/bench.mjs
node scripts/build.mjs --check
node scripts/check-gates.mjs
node scripts/e2e.mjs
```

## 附录 B：公开资料来源

- JVSG IP Video System Design Tool：<https://www.jvsg.com/ip-video-system-design-tool/>
- JVSG Pricing：<https://www.jvsg.com/pricing-plans/>
- CCTV Design Tool：<https://www.cctvdesigntool.com/>
- CCTV Design Tool Pricing：<https://www.cctvdesigntool.com/pricing>
- CCTVplanner：<https://cctvplanner.io/>
- CCTVplanner vs IPVM（价格/功能对照，二手来源）：<https://cctvplanner.io/ipvm-alternative>
- CCTV Design Tool vs IPVM（IPVM 价格/免费限制，二手来源）：<https://www.cctvdesigntool.com/tr/blog/cctv-design-tool-vs-ipvm-calculator/>
- Bluebeam Pricing：<https://www.bluebeam.com/pricing/>
- Drawboard Pricing：<https://www.drawboard.com/pricing>
- Fieldwire Pricing（公开文章）：<https://www.fieldwire.com/blog/construction-drawing-management-software/>
- 浩辰 CAD 看图王：<https://www.gstarcad.com/>
- 天正电气 TR30：<https://tangent.com.cn/tztr30dq>
- Dahua Project Design Tool：<https://www.dahuasecurity.com/ph/products/key-technologies/5e/dahua-project-design-tool>
- Dahua DHTools Designer：<https://support.dahuasecurity.com/en/DHToolsDesigner>
- Hikvision 海康云商勘测设计：<https://partners.hikvision.com/tools/tooldetail?id=cloudCommerce>
- Hikvision Hik-Partner Pro Designer（公开文章）：<https://pro-av.hikvision.com/sa/newsroom/hiksnap/how-ai-powered-design-tools-transform-smb-security-project-delivery/>
- Axis Site Designer：<https://help.axis.com/zh-cn/axis-site-designer>

---

> **一句话总结**：PlotPin 的工程质量与文档纪律明显高于同类开源项目，但「主路径 2 个 P0 + 只读/导入/租约类 P1 + 门禁盲区」必须先收口；模块化提取在工具链与体积余量解除前不应开工。
