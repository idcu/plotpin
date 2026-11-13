# 图钉 PlotPin 已知问题 · 历史修复归档

> 本文件收录从 [known-issues.md](known-issues.md) §1.2 迁移的历史修复条目（2026-11-13），保留 46 条编号与原有修复依据、复核结论，便于检索与追溯；内容未改写。
> 新问题、仍存在项与限制仍登记在 [known-issues.md](known-issues.md)。

## 1.2 历史修复（37 条）

> 条数按表内实际行数标注：原 `known-issues.md` 小节标题写「46 条」，但表内实际为 37 条（历史合并后标题未回填）。本次迁移只搬移与更正条数，未改写任何条目结论。

| 编号 | 原问题 | 修复依据（仓库内可复跑 / 可核对） | 复核结论 |
|---|---|---|---|
| A1 | 旧工程 64 图标到新内置 36 符号的逐图标视觉回归未比对 | `tests/fixtures/legacy-symbols.json` 逐图标路径 SHA-256 + 可折线化断言；`tests/golden/legacy-symbols.svg` 逐字节；`scripts/selftest.mjs` | 已关闭；旧工程靠自身类型表保留图标 |
| A2 | PDF 输出没有字节级 golden，回归只能靠人看 | `tests/golden/fixed-pages.pdf` 逐字节 + 同输入两次 SHA-256 一致；仅覆盖 PDF 容器层，Canvas JPEG 编码不在判据内 | 已关闭；图纸页仍为位图（见 K3） |
| A3 | SVG 导入“200 路径 × 单条 5000 字符”最坏组合未做耗时打点 | `scripts/bench.mjs` 最坏可达组合耗时门禁 ≤50 ms；历史上限内实测约 1.058 ms；“200×5000”约 1 MB，被 64 KB 上限快速拒绝 | 已关闭；199 路径是有效上限（元素上限含根节点） |
| A5 | 规则检查的圆/椭圆/凹多边形采样误差没有 golden 对照 | `scripts/selftest.mjs` 固定期望与容差：圆面积 <2%（40 段）、旋转方形 =100（1e-6）、扇形 <1%、净距 0.01、凹多边形三角化 2500（1e-6） | 已关闭（仅规则页判定；统计页口径另见 RT-P2-14） |
| A6 | DXF 折线近似与 SVG 图形缺少几何一致性断言 | `symbol-scene` 三符号 DXF 折线逐点/顶点数/闭合与同一轮廓源一致；`scripts/selftest.mjs` | 已关闭；DXF 近似限制见 K4 |
| P0-4 | 插件沙箱可绕过：Worker 内 `BroadcastChannel` 可加入协作频道、`MessageChannel`/`MessagePort` 可自建端口、`onmessage`/`onerror` 可旁路 token 校验 | `tests/e2e/plugin-sandbox.spec.mjs`：插件内 `BroadcastChannel`/`MessageChannel`/`MessagePort`/`onmessage`/`onerror` 均为 `undefined`，向 `plotpin-collab-*` 发送 0 条，覆写 `onerror` 后异常仍走禁用路径 | 已关闭（N-02）；合法插件契约未承诺端口通道，一律封堵 |
| P0-1 | PDF 导入的内嵌底图在自动保存后刷新/重开即丢失 | `tests/e2e/pdf-multipage.spec.mjs`「PDF 内嵌底图走资产入库，自动保存 + 刷新后仍在」：导入当场 `assetId=bg…`、无 dataUrl，重开后 `bgImageState=ready`；`scripts/selftest.mjs` 7.1 覆盖 dataUrl 兜底与非当前楼层；解压炸弹用例断言累计阶段即取消 | 已关闭（N-03） |
| K1 | 离线缓存版本无门禁，旧缓存可能残留 | `scripts/check-sw.mjs` 以提交入库的 `scripts/sw-inputs.sha256`（预缓存输入指纹 + 清单 version）为基线，`scripts/check.mjs` 第 12 步纳入；`check-gates` 场景 6/9 证明会红（场景 10 为 CSS 结构） | 已关闭（N-01）；不再依赖 `git diff HEAD`，干净检出同样有效 |
| K11 | 文档超出团队自设篇幅 | `scripts/check-discipline.mjs` 13/13 通过；工程文档已拆分 | 已关闭；余量偏小，新增内容需控制 |
| P0-2 | 协作方“清空场地”被静默应用：不计入变更、不进撤销栈、无提示 | `tests/e2e/collab.spec.mjs`「N-04」：对端清空后 `__collabLastMerge.siteCleared≥1`、撤销栈 +1、状态栏含“对端清空了场地/Ctrl+Z”，Ctrl+Z 恢复场地 | 已关闭（N-04）；双标签真实通道复现 |
| P0-3 | 场地编辑不进提交/不广播，较旧场地会在合并时复活 | `tests/e2e/collab.spec.mjs`「N-04」：拖点与属性面板输入均实时同步到对端；本地较新清空不被旧快照复活；`scripts/selftest.mjs` 覆盖 null 胜出与同时间戳保留 | 已关闭（N-04） |
| IO-P1-1 | 导出口径分裂：CSV/XLSX/PDF 含隐藏对象且“显示”列失真；PNG/PDF 烘入草稿/校准 | `tests/e2e/export-scope.spec.mjs`：台账全量 +「显示」列=有效可见，SVG/DXF/PDF 只含可见对象；草稿/校准下 PNG 与 PDF 图纸页字节不变；`scripts/selftest.mjs` 28.4 节 | 已关闭（N-05）；台账表头与字段集不变 |
| CORE-P1-1 | 批量/属性/显隐/节点增删不更新对象 `updatedAt`，协作合并可能丢弃新修改 | `scripts/selftest.mjs` 28.5 节：指定 id 严格递增、未列出对象不变、无变化幂等；`tests/e2e/collab.spec.mjs`「N-06」拖动+对端属性编辑合并后都保留 | 已关闭（N-06）；几何拖拽原先已直接打点，本轮补齐其余路径 |
| CORE-P1-2 | PNG/PDF 导出把未完成的绘制草稿、测距/校准线烘入成品图 | `tests/e2e/export-scope.spec.mjs`：设置矩形草稿与两点校准后，PNG dataURL 与 PDF 图纸页 base64 与无瞬态时逐字节一致 | 已关闭（N-05）；导出默认 `includeDraft/includeCalibration=false` |
| CORE-P1-3 | DXF/PDF/JSON 导入产生重复对象标识或重复编号 | `scripts/selftest.mjs` 28.6 节：同批次重复 id 追加稳定后缀、`a:b`/`a?b` 归并后仍唯一、重名走编号作用域、字段与数量不变；`sanitizeObjects` 跨楼层共享去重集合 | 已关闭（N-07）；审计计数见 `sanitizeReport()` |
| IO-P1-2 | 表格导入按楼层名匹配，重名时后者覆盖前者，所有行静默落到最后一层，造成错层 | `scripts/selftest.mjs` 28.7 节：重名楼层导入返回 errors 且更新/新增均为空；`tests/e2e/table-batch.spec.mjs`「N-08」弹窗整批拒绝且现有对象与楼层数不变；新增/重命名重名被拒 | 已关闭（N-08）；导入按归一楼层名做唯一精确匹配 |
| RT-P1-08 | 删除图层/类型只检查当前楼层引用，其它楼层留下悬空引用 | `scripts/selftest.mjs` 28.7 节 `floorRefs` 跨楼层统计；`js/features/ui-panels.js` 删除前检查全部楼层，有引用时确认后迁移到默认图层 / 同类内置类型 | 已关闭（N-08）；拒绝/取消时不做任何修改 |
| IO-P1-5 | 含 `/cm` 变换的 PDF，文字坐标与贝塞尔曲线未乘变换矩阵，导入后错位/压扁 | `scripts/selftest.mjs` 37c 节：`q 2 0 0 2 0 0 cm` 下曲线中点/终点与文本坐标均为恒等 CTM 的 2 倍；不含 `/cm` 的既有坐标不变 | 已关闭（N-09）；字号未随 CTM 缩放，已在 `docs/features.md` 标注限制 |
| IO-P1-3 | SVG 导出的对象颜色未做属性转义，非法颜色可逃逸属性 | `scripts/selftest.mjs` 28.8 节：`normalizeExportColor` 白名单与非法值回退；`buildSceneSvg` 注入 `red" onload="alert(1)` 后不含 `onload=` / `red"`；DXF 图层名同步清洗 CR/LF 并保证唯一 | 已关闭（N-10）；符号 path 限定 `M/m` 起始 |
| IO-P1-4 | JSON 导入先回收“不可达资产”再等待资产转换，转换失败回滚后旧工程资产已被删除 | `scripts/selftest.mjs` 28.9 节：注入 `afterStateLoaded` 抛错后状态/草稿/选中集/旧 `assetId` 均保留且 `assetPrune` 调用 0 次；成功导入后回收恰好 1 次且 keep 集不含旧资产 | 已关闭（N-11）；`openProjectById` 同类路径已由 IO-P1-6 关闭 |
| IO-P1-6 | 工程库打开 `openProjectById` 先回收再 `afterStateLoaded`，打开阶段失败会误删旧工程资产 | `scripts/selftest.mjs` 28.10 节：注入 `afterStateLoaded` 抛错后状态/草稿/选中集/旧 `assetId` 均保留且 `assetPrune` 调用 0 次；成功打开先加载后回收、回收 1 次且 keep 集不含旧资产 | 已关闭；与 N-11（`627471a`）同一事务语义 |
| CORE-P1-6 | 一般仿射下圆/椭圆/平行四边形用两条基向量近似，形状失真 | `scripts/selftest.mjs` 39.9 节 34 项断言：SVD 主轴与朝向、剪切面积保真、平行四边形四角一致、对象/场地同参数一致 | 已关闭（N-12）；非相似扇形按面积保真近似并返回 `degraded` |
| CORE-P1-7 | 扇形跨 0°（或 >180°）时角度归一化不一致，画布/PNG/PDF 与 SVG/DXF 画成补角 | `scripts/selftest.mjs` 39.10 节 10 项断言：350→20 为 30°、20→350 为 330°、起止相等为 360°、SVG 大弧标志为 0 | 已关闭（N-13）；画布/PNG/PDF/SVG/DXF 共用 `sectorArcRange` |
| CORE-P1-9 | 单对象顶点数无上限；超大折线在多边形面积/包围盒计算中可能抛错，拖垮画布 | `scripts/selftest.mjs` 39.11 节：`SHAPE_POINTS_MAX=10000` 拒绝追加、12 万点列包围盒不爆栈（`pointBounds`） | 已关闭（N-14）；保守上限，极端合法超大点列会被拒绝 |
| CORE-P1-4 | 捕捉拾取在移动事件里全量扫描对象，无空间索引；万级对象可能明显卡顿 | `scripts/selftest.mjs` 分区 `25b. 捕捉包围盒预筛等价性`（200 个随机指针点 × 4 种对象变体，预筛前后候选集 diffs=0）；`node scripts/perf-browser.mjs tests/perf/speed.perf.mjs -g "N-22"` 捕捉解析 P95 18.5/14.1 → 3.1~4.0 ms（读数见 [performance.md](performance.md) §4.1.3） | 已关闭（N-22 `556c205`）；单趟 `collectSnap` + AABB 预筛，候选集与全量扫描等价 |
| CORE-P1-5 | 单击选中会触发静态层重建；大场景连续选择可能掉帧 | `tests/e2e/smoke.spec.mjs:80-89`：画布点选后对象清单行高亮与勾选同步；`node scripts/perf-browser.mjs tests/perf/speed.perf.mjs -g "N-23"`：30 次点选静态重建 30 → 0，点选 P95 661.1/710.2 → 20.0/20.9/22.1 ms（见 [performance.md](performance.md) §4.1.4） | 已关闭（N-23 `d44a8e1`）；选中/悬停只叠加动态层；拖拽起止各重建一次静态层（10k 约 0.2 s） |
| RT-P1-01 | 断线期间修改不排队、不补发，断线后不自动重连 | `tests/e2e/collab.spec.mjs:308`「N-16：断线自动重连补发与楼层增删清空广播」、`:369`「N-16：断线待发队列刷新页面后仍补发」 | 已关闭（N-16 `d093071`）；待发队列落盘 + 本机频道指数退避重连；**WebRTC 无信令通道仍只能手动重连**（产品限制，见 §3 K10 语境） |
| RT-P1-02 | 楼层新增/删除/清空不广播 | `tests/e2e/collab.spec.mjs:308` 同一 N-16 用例：`floor-add/delete/clear` 显式广播并走 LWW 合并 | 已关闭（N-16 `d093071`）；活动楼层切换仍是每个客户端独立状态（非缺陷） |
| RT-P1-03 | 冲突提示依赖“新增数量”；无新增时即使覆盖了修改也不显示冲突条数 | `tests/e2e/collab.spec.mjs:409`「N-17：跨工程消息隔离与纯冲突可见」，冲突文案断言在 `:447-454`（`conflicts>0`、含「冲突」、不含「无变化/Ctrl+Z」） | 已关闭（N-17 `877deec`）；`changed` 计入 `conflicts`，纯冲突不会被标成可回滚 |
| RT-P1-04 | 协作消息不带工程标识，不同工程误用同频道会串数据 | `tests/e2e/collab.spec.mjs:409` 同一 N-17 用例：跨工程消息被丢弃并计数 | 已关闭（N-17 `877deec`）；消息体携带 `pid`。B6 收紧：业务消息必须双方都有 `pid` 且一致，草稿/空 `projectId` 不再放行，仅 `hello`/`hello-ack`/`bye` 兼容旧版 |
| RT-P1-05 | 插件添加的对象/标注不进撤销栈，用户无法撤销插件写入 | `tests/e2e/plugin-sandbox.spec.mjs:322`「插件写入进入撤销栈：undo 后对象完全移除、redo 恢复」 | 已关闭（N-18 `9cbc25c`）；与手动绘制共用撤销栈 |
| RT-P1-06 | 插件 2 秒超时只覆盖初始化/单次调用；初始化后的定时器可长期占用 | `tests/e2e/plugin-sandbox.spec.mjs:346`「定时器逃逸：载入后 setInterval 与初始化期捕获的 setTimeout 均失效，主线程仍可用」 | 已关闭（N-18 `9cbc25c`）；loaded 后置 `frozen` 并清空定时器 |
| RT-P1-07 | 属性面板每次 focusin 都压入历史，输入框来回切换会快速耗尽 20 步撤销栈 | `tests/e2e/history.spec.mjs:202`「N-19：属性面板切换 5 个字段不入栈，拖动后一次撤销回原位；场地面板一致」 | 已关闭（N-19 `3c4e522`）；容器级事件委托，字段首次 `input`/`change` 前压一次快照 |
| RT-P1-10 | 楼层写入不更新场地时间戳，场地合并使用过旧时间，导致场地“复活”与覆盖顺序错误 | `tests/e2e/collab.spec.mjs:171`「N-04：对端清空场地可见可撤销；场地拖点实时同步；旧快照不复活已清空场地」；`js/features/props.js` 场地编辑走 `commitObjectEdit`（touchFloor） | 已关闭（N-04 `973c83c`）；`mergeFloorWrite` 读取 `site.updatedAt` |
| CSS-P1-1 | `css/style.css:213` 的 `@media print{` 未闭合（`{` 比 `}` 多 1），其后所有规则被吞进打印媒体查询 | `node scripts/check.mjs --selftest` 第 13 步 CSS 结构：去注释/字符串后花括号配平（修复前差 1，修复后 0）；`node scripts/check-gates.mjs` 场景 10：追加未闭合 `@media` 后 `check.mjs` 退出 1 且命中「CSS 结构未配平」 | 已关闭（`6cdb093`）；打印块于 217 行闭合，块内规则未改；打印版式无 e2e 截图对比（与修复前相同，非本次引入） |
| CORE-P1-8 | 图片切变手柄在旋转 90° 附近跳变/退化 | `scripts/selftest.mjs` CORE-P1-8 19 条断言：89°/90°/91° 变换有限、顶边沿自身方向位移恰 1 m、底边中点不动、四角点位移 ≤1 m；退化高度返回原变换 | 已关闭（`d58af8b`）；切变改用图片自身底边/法向，分母为图片高度；无指针级 e2e 轨迹断言 |
| RT-P1-09 | 快照差异不含图层名称与类型表结构变化 | `scripts/selftest.mjs` RT-P1-09 13 条断言：图层/类型增删改、未变不报、场景项后置、旧快照缺表零误报；`tests/e2e/snapshot.spec.mjs` N-21 覆盖 5 类场景项 | 已关闭（`f9a5843`）；旧快照缺 `objectTypes` 时保守跳过类型表对比 |
