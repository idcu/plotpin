# 图钉 PlotPin 已知问题

> 核对于 `8a9314b`（2026-11-08，C 类两项决策落地后的代码 HEAD）。本表来自只读代码审计与仓库内夹具/脚本；标注「可复跑」的条目均已用仓库内命令验证过，未标注「实测」的条目未做运行期复现。数量类指标以 [facts.md](facts.md) 为准。
> 分类口径：**已修复**=有可复跑判据；**仍存在**=代码路径确证但未修；**已降级为限制**=产品边界或质量取舍，不是缺陷。
> 新问题的编号与审计报告一一对应，便于后续计划映射：`IO-*`、`CORE-*`、`RT-*` 分别见本地过程材料 `audit-out/audit-io.md`、`audit-out/audit-core.md`、`audit-out/audit-runtime.md`（该目录不入库，不随仓库分发）。

## 1. 已修复（46 条）

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

## 2. 仍存在

### 2.1 P1：功能/数据一致性缺陷（0 条）

原 CSS-P1-1、CORE-P1-8、RT-P1-09 已于 2026-11-08 修复并移入 §1（`6cdb093` / `d58af8b` / `f9a5843`），复跑依据见对应行；本轮无遗留 P1。

### 2.2.1 需人工 / 真机验证（8 条，未验证）

| 编号 | 项目 | 未验证原因 |
|---|---|---|
| M1 | 移动端 iOS/Android 安装、离线、手势 | 无真机环境 |
| M2 | Firefox / Safari 的导入、下载、沙箱、打印 | 仅 Chromium 验证 |
| M3 | 双设备 WebRTC 直连 | 无双设备环境；未用双标签页冒充 |
| M4 | 英文译文语义质量 | 未做人工语言评审 |
| M5 | 低端设备帧率/首屏 | 未做真机或限速实测 |
| M6 | 插件在低端设备上的 2 秒超时体验 | 只在桌面 Chromium 验证，低端机可能更早触发 |
| M7 | 大尺寸符号在真实绘图仪/CAD 查看器中的 DXF 观感 | 需用 AutoCAD/LibreCAD 人眼检查，未做 |
| M8 | 真实图纸的版本差异误报率（含 A4） | 无 50 条人工标注样本 |

### 2.3 P2：改进项（57 条，按主题归并为 14 组）

| 组 | 覆盖审计编号 | 内容摘要 |
|---|---|---|
| IO-A | IO-P2-6/7/8/10/11 | 表格往返有损：去空格、布尔误判、形状非法丢几何、按精度量化坐标；长度/面积每行重复计算 |
| IO-B | IO-P2-1/2/3/4/5/12/13/20 | CSV/TSV 口径：表头未加引号、换行不一致、TSV 引号在 Excel 错列、公式反转义改写 `'=`、角度精度、GeoJSON 绕向、PDF 清单缺列；多页 PDF 取“全文档最大内嵌图”作底图，可能与矢量内容不同页 |
| IO-C | IO-P2-9/21 | 目标楼层对象数组异常时回退到当前层（静默错层）；XLSX 单表 >5 万行整份导入失败 |
| IO-D | IO-P2-14/15/16/17/18/19/25/26 | 导出产物边界：PNG 无页脚、DXF 表色忽略、SITE 图层同名冲突、DXF 毫米/文字米制、R12 凸度预检恒为 0、TEXT 去空格、图层名 CR/LF、导出副作用 |
| IO-E | IO-P2-22/23/24 | 目录损坏被静默吞掉；停车按“图片∪场地”取景；停车生成自写编号，未走编号作用域 |
| CORE-A | CORE-P2-1/2 | 启动时本机设置无白名单覆盖工程设置（含原型污染风险）；适应窗口未夹取缩放上下限 |
| CORE-B | CORE-P2-3/4/19 | 活动楼层对象在历史中双份拷贝；快照列表/淘汰全量读入；清空覆盖率后离屏画布不释放 |
| CORE-C | CORE-P2-5/6/7 | 盲区面积按格统计与多边形面积口径不一致；布点优化前后百分比分母不同；椭圆转矩形丢旋转角 |
| CORE-D | CORE-P2-8/9/10/11/12 | 重命名非当前楼层不更新时间戳；载入/回滚残留校准点与草稿；重复图层标识不合并；场地标识/标注未按对象规则清洗 |
| CORE-E | CORE-P2-13/14/15/16/17/18/20 | 选中每帧多算点数组（N-27 已删，见 §2.4）、历史比较函数未用于生产（N-27 保留并归档，见 §2.4）、死分支、核心层硬编码中文、多标签心跳时间未钳制、底图解码静默失败、协作合并无上限 |
| RT-A | RT-P2-01~06 | 快照键分隔符可被工程名污染、字节按 UTF-8 估算偏低、恢复未校验工程、键序敏感 diff 误报、差异截断 2000 条但文案称“完整”、创建快照的资产化副作用 |
| RT-B | RT-P2-07~11/20 | 插件清单按字符数而非 UTF-8 字节、直调代码无上限、卸载未清理类型注册、导出器无 read 时的 site 传递待确认、下载无 pending/大小校验、消息/错误处理器未硬化 |
| RT-C | RT-P2-12~14 | 未配置阈值的类型对漏报间距、多轮廓重叠漏检、统计页与规则页容差口径不同 |
| RT-D | RT-P2-15~19 | 清单颜色未转义、模态 Esc/遮罩未 resolve、楼层广播注释失真、协作调试全局常驻、入站分块仅接收驱动淘汰 |

#### 2.3.1 P2 三分类 triage（2026-11-08）

口径：**A 真实缺陷可修**=代码路径确证、仓库内可复现/可加断言；**B 仅文档口径**=行为可接受或已在 N-27 收敛，只改文档/文案/注释；**C 需外部条件**=需 Excel/CAD/GIS 实机、真实样本或产品拍板。  
统计：**A 49 / B 13 / C 4**（合计 66）。本轮只做分类，未改任何 P2 业务代码。

| 分类 | 条目 |
|---|---|
| A（49） | IO-P2-1/2/4/5/7/8/9/11/13/14/15/16/18/19/21/22/23/24/25/26；CORE-P2-1/2/3/4/7/8/9/10/11/12/15/16/17/18/19/20；RT-P2-01/03/04/05/07/08/09/11/13/14/15/16/18 |
| B（13） | IO-P2-6/10/12；CORE-P2-5/6/13/14；RT-P2-02/06/10/17/19/20 |
| C（4） | IO-P2-3/17/20；RT-P2-12 |

分组计数：

| 组 | A | B | C | 合计 |
|---|---|---|---|---|
| IO-A | 3 | 2 | 0 | 5 |
| IO-B | 5 | 1 | 2 | 8 |
| IO-C | 2 | 0 | 0 | 2 |
| IO-D | 7 | 0 | 1 | 8 |
| IO-E | 3 | 0 | 0 | 3 |
| CORE-A | 2 | 0 | 0 | 2 |
| CORE-B | 3 | 0 | 0 | 3 |
| CORE-C | 1 | 2 | 0 | 3 |
| CORE-D | 5 | 0 | 0 | 5 |
| CORE-E | 5 | 2 | 0 | 7 |
| RT-A | 4 | 2 | 0 | 6 |
| RT-B | 4 | 2 | 0 | 6 |
| RT-C | 2 | 0 | 1 | 3 |
| RT-D | 3 | 2 | 0 | 5 |

建议批次（按风险从低到高；影响面为预估，未实测）：

| 批次 | 主题 | 覆盖条目 | 改动面（审计已指出的文件） | 预估影响 / 验证成本 | 风险与前置 |
|---|---|---|---|---|---|
| 1 | 文档口径清零 | B 全部 13 条 | `docs/features.md`、`docs/user-guide.md`、`known-issues.md`、代码注释 | 0 运行时代码、0 新断言、产物 0 B | 低；逐条核对措辞，不改行为 |
| 2 | 表格/CSV 往返与静默数据丢失 | IO-1/2/4/5/7/8/9/13/21 | `io-fields.js`、`io-table.js`、`io-import.js`、`io-export.js` | 4 文件；CSV/TSV/GeoJSON golden 需同步；表格 e2e + selftest | 中高；直接改数据路径，8 类导出 golden 必须全量复跑 |
| 3 | DXF / PNG 产物一致性 | IO-14/15/16/18/19/26 | `io-export.js`、`js/common/dxf.js`、`persistence.js` 图层名清洗 | 2-3 文件；DXF golden + PNG 语义 golden；预检断言 | 中；DXF 输出变化需 CAD 侧观感仍属 M7 未验证 |
| 4 | 核心瞬态与边界 | CORE-2/7/9/10/18/19 | `viewport.js`、`geometry.js`、`persistence.js`、`snapshot.js`、`render.js` | 5 文件；纯逻辑断言为主，少量 e2e | 中低；`resetTransientInteractionState` 为新增公共收敛点，需列影响调用方 |
| 5 | 核心 schema 与安全 | CORE-1/8/11/12/17 | `app.js`、`persistence.js`、`tab-lease.js` | 3 文件；设置白名单/站点清洗/心跳钳制断言 | 中；原型污染与跨工程设置属安全项，需负向用例 |
| 6 | 快照与协作边界 | RT-01/03/04/05、CORE-20 | `snapshot.js`、`collab.js`、`persistence.js`、`merge.js` | 4 文件；键命名空间、恢复工程校验、稳定序列化断言 | 中高；RT-05 稳定序列化会改变 diff 口径，需同步 golden |
| 7 | 插件沙箱收口 | RT-07/08/09/11 | `plugins.js` | 1 文件；清单字节数、直调上限、卸载清理、下载校验断言 | 中；安全相关，需 sandbox e2e 复跑 |
| 8 | 规则/统计口径一致 | RT-13/14 | `rules.js`、`ui-panels.js` | 2 文件；多轮廓重叠与越界容差断言 | 中；会改变规则页结果，需更新既有 e2e 期望 |
| 9 | 目录/停车/UI 小修 | IO-22/23/24/25、RT-15/16 | `catalog.js`、`parking.js`、`io-export.js`、`ui-panels.js`、`ui-shell.js` | 5 文件；toast/编号作用域/模态 resolve 断言 | 低；范围小但分散 |
| 10 | 代码卫生与 i18n | CORE-15/16、RT-18 | `geometry.js`、`persistence.js`、核心默认文案、`collab.js` | 4 文件；删死分支、核心中文走 `L()`、调试全局开关 | 中；CORE-16 会变动 i18n 覆盖率基线，需同步 facts |
| 11 | 性能（无打点不提交） | CORE-3/4、IO-11 | `model.js`、`snapshot.js`、`io-fields.js` | 3 文件；必须补 heapUsed / 帧时打点与 perf-browser 复跑 | 高；历史结构共享与快照索引改动面大，单独成批 |

**批次状态（2026-11-08）**：批次 1（B 全部 13 条）、批次 2（表格/CSV 往返 9 条）、批次 3（DXF/PNG 一致性 6 条）、批次 4（核心瞬态边界 6 条）、批次 5/6（核心 schema/安全与快照/协作 10 条）、批次 7/8（插件沙箱 4 条 + 规则/统计 2 条）、批次 9/10（目录/停车/UI 6 条 + 代码卫生/i18n 3 条）、批次 11（性能打点 3 条）已交付；批次 1 为纯文档口径，结论见 §2.5；批次 2 见 §2.6；批次 3/4 见 §2.7；批次 5/6 见 §2.8；批次 7/8 见 §2.9；批次 9/10 见 §2.10；批次 11 见 §2.11。A 类 49 条至此全部落地。

**C 类（4 条）最终状态（2026-11-08）**：

| 编号 | 状态 | 结论 | 提交 / 所需条件 |
|---|---|---|---|
| IO-P2-20 | 已决策落地 | 多页 PDF 只导入第 1 页，导入后提示「共 N 页，已导入第 1 页」；底图只取第 1 页实际绘制的内嵌图；不提供多页合并开关 | `dd5f3cb` |
| RT-P2-12 | 已决策落地 | 未配置间距阈值的类型跳过间距比较，结果面板显示「未配置阈值类型 N 个」；不回退全局阈值、不静默跳过 | `8a9314b` |
| IO-P2-3 | 未验证 | 需 Windows Excel 实机把含 `=`、引号、换行的单元格导出 CSV/TSV 再打开，核对引号与列数；不得用模拟或推断值替代 | 条件：Excel 实机 + 原始样本文件 |
| IO-P2-17 | 未验证 | 需 AutoCAD/LibreCAD 打开含 SITE 图层的 DXF，核对 mm 单位与文字米制读数；不得用解析器推断替代 | 条件：CAD 查看器 + 样本文件 |

两条未验证项保持「未验证」，不因长期未验证降级为「已知限制」。

**B 类补充**：CORE-P2-13/14 已在 N-27 收敛（§2.4），RT-P2-20 的 `onmessage/onerror` 已在 N-02 沙箱硬化中封堵；这三条只需在文档/归档口径中标注，不再改代码。

### 2.4 N-27 公共抽象审计归档（9 项）

> 结论只记录当前代码事实；「已收敛」项均可用对应文件行号复跑核对，未收敛项不得改写成「已知限制」。

| 审计项 | 结论 | 依据 / 影响调用方 |
|---|---|---|
| `historyValueEqual` 两套比较语义 | 保留（仅自测入口） | 生产路径无调用；`scripts/selftest.mjs:7095-7096` 两条断言直接覆盖，删除即删断言（本段硬边界禁止）。生产快照仍用 `sharedHistoryValue` 的「引用相等 + 变更即复制」 |
| `mergeStable` 仅此处使用 | 无重复，不改 | `js/common/merge.js:352` 单一定义；调用方 `merge.js:260/346/349`、`js/core/persistence.js:925` |
| `buildSnapCandidates` 双重分配 | 已收敛（N-22） | `js/core/geometry.js:32` 单趟 `collectSnap`；`collectSnapCandidates`（`:107`）与 `collectSnapEdges`（`:110`）只是按位掩码的薄包装 |
| `drawSelection` 无用分配 | 已删除 | `js/core/render.js:947` 的 `drawSelection` 原先每帧执行 `objectPoints(o).map(toS)` 且结果未被任何分支使用；现已删除，产物 −36 B，画布像素不变（e2e 109 通过） |
| `normalizeColor` 分散 | 已收敛（N-10） | 唯一实现 `normalizeExportColor`（`js/features/io-export.js:371`），SVG 图例/对象/文字/标记 4 处调用同源 |
| 覆盖率口径常量未收敛 | 已收敛（N-20） | `APP_LIMITS.COVERAGE_TARGET_CELLS/MAX_CELLS/CELL_MIN_M/CELL_MAX_M`（`js/core/config.js:42-45`）；`geometry-coverage.js` 全部引用，无重复字面量 |
| 门禁脚本 CSS/MJS 解析器两套 | 前提不成立，不抽取 | `check-discipline.mjs` 不含 CSS/MJS 解析器；`check-ngm.mjs` 的 `walkFiles`/`readJson` 与前者遍历范围、容错语义不同，抽到 `scripts/lib/` 会改变行为且无断言覆盖 |
| `sanitizeLayers` 多份 | 无重复，不改 | `js/core/persistence.js:1063` 单一定义，`:778` 单一调用 |
| `objectIndexById` 调用点未统一 | 已统一 | `js/core/model.js:523` 单一定义；5 处调用（`js/core/interaction.js:306/393/681/706`、`js/core/persistence.js:154`） |

### 2.5 B 类文档口径归档（13 条）

> 本表只记录「已收敛/已降级为限制/已确认」的口径结论，不把任何一条写成「已修复」。  
> 「已降级为限制」表示行为按现状保留并在产品文档写明；「已收敛」表示代码已符合审计建议但本轮未改代码；「未验证」原样保留。

| 编号 | 结论 | 文档落点 / 依据 |
|---|---|---|
| IO-P2-6 | 已降级为限制：导入对所有单元格 `trim()`，名称/备注首尾空格不保留；表格往返不是逐字节无损 | [features.md](features.md) §8、[user-guide.md](user-guide.md) 9.2 |
| IO-P2-10 | 已降级为限制：坐标/宽高按 `settings.precision` 量化（默认 2 位，即 1 cm）；首次往返漂移上界 0.5×10⁻ᵖ | [features.md](features.md) §8/§20、[user-guide.md](user-guide.md) 9.2 |
| IO-P2-12 | 已降级为限制：PDF 清单列是台账子集（无楼层/备注/更新时间）；多楼层按层分页；打印报告单页不标楼层 | [features.md](features.md) §6、[user-guide.md](user-guide.md) §12 |
| CORE-P2-5 | 已降级为限制：面板盲区面积=多边形面积×(1-ratio)；GeoJSON 面面积=盲格数×cell²；两者差异上界约 周长×格宽/2，均为栅格口径 | [features.md](features.md) §6、[user-guide.md](user-guide.md) 10.2 |
| CORE-P2-6 | 已收敛（归档）：`optimizeCameraPlacement` 的 before/after 已与 `analyzeCoverage` 同分母（`res.totalArea`），未改代码 | [geometry-coverage.js](../js/core/geometry-coverage.js) 优化分支 |
| CORE-P2-13 | 已收敛（归档）：`drawSelection` 的无用 `alloc` 已在 N-27 删除，见 §2.4 对应条目 | [known-issues.md](known-issues.md) §2.4 |
| CORE-P2-14 | 已归档（仅自测入口）：`historyValueEqual` 生产代码不使用，保留供自测；断言未删除 | [known-issues.md](known-issues.md) §2.4 |
| RT-P2-02 | 已降级为限制：快照每工程 20 条 / 约 16 MB 是 UTF-8 字节估算的软上限；单条超限仍保留 | [features.md](features.md) §11、[ARCHITECTURE.md](ARCHITECTURE.md) 快照节、[user-guide.md](user-guide.md) §14 |
| RT-P2-06 | 已降级为限制：对比列表最多展示 2000 条差异；弹窗「完整数据见快照记录」不提供差异导出入口，UI 文案本轮未改 | [features.md](features.md) §11、[user-guide.md](user-guide.md) §14 |
| RT-P2-10 | 已确认（静态核对）：未声明 `state:read` 时沙箱导出器收到空 `input`，且不传 `site`；运行期用例未覆盖 | [ARCHITECTURE.md](ARCHITECTURE.md) 插件节、[features.md](features.md) §12 |
| RT-P2-17 | 已说明：`MARK_DIRTY_PROFILES` 五种粒度中 `clear`/`floor` 不广播，其余广播；ARCHITECTURE 已列明，代码注释本轮未改 | [ARCHITECTURE.md](ARCHITECTURE.md) §一次编辑的数据流 |
| RT-P2-19 | 已降级为限制：协作入站分片 TTL 淘汰仅由“收到新消息”驱动，无空闲定时器，最长残留 30 s | [ARCHITECTURE.md](ARCHITECTURE.md) §协作合并 |
| RT-P2-20 | 已收敛（归档）：沙箱 Worker 的 `onmessage`/`onerror` 已在 N-02 封堵，见 §1 P0-4；端口通道不在契约内 | [known-issues.md](known-issues.md) §1 P0-4 |

### 2.6 A 类表格/CSV 往返批次（9 条已修复）

> 本表只覆盖批次 2 的 9 条；其余 A 类条目仍在各自批次排期，状态不变；C 类 4 条未动。
> 「已修复」= 代码已改且断言可复跑；条目内的「未验证」保留在 commit body 与 §2.6 末行，不因修复而降级为已验证。

| 编号 | 状态 | 修复要点 | 提交 | 验证依据 |
|---|---|---|---|---|
| IO-P2-1 | 已修复 | CSV/TSV 表头改走 `DSV.formatRows/quoteCell`，与数据行共用分隔符/引号/公式前缀策略 | `3d936f8` | selftest +1 表头转义断言（3024 通过）；字段表/表头未变 |
| IO-P2-2 | 已修复 | 台账 CSV/TSV 行尾统一 CRLF；`.gitattributes` 对 golden 标记 `-text` 保字节 | `94bff73`、`75b040c` | selftest +1（3025）；golden csv/tsv 各 +12 B，仅 LF→CRLF，`--ignore-cr-at-eol` 为空 |
| IO-P2-4 | 已修复 | 公式防护对字面单引号可逆：`''`→`'`，仅危险前缀去引号 | `292dffe` | selftest +2（3027）；`'=SUM(A1)` 往返保持原文；XLSX inlineStr 仍会丢一层（未变） |
| IO-P2-5 | 已修复 | 角度列改用 `fmt(shape.angle)`，与 X/Y/宽高/长度/面积同精度 | `605d65b` | selftest +1（3028）；golden 仅 3 格 `30/15/0`→`30.00/15.00/0.00`，字段/列序未变 |
| IO-P2-7 | 已修复 | 布尔改三态：未知「显示/锁定」保留原值并告警，「闭合」仍按否；严格模式行为不变 | `79a8d7e` | selftest +2（3030） |
| IO-P2-8 | 已修复 | `applyRowShape` 先校验后写入；参数非法时保留原几何并在规划阶段告警 | `bbbfc22` | selftest +2（3032）；B-08 500 行规划 3 ms/应用 8 ms |
| IO-P2-9 | 已修复 | 目标楼层 `objects` 非数组时规划阶段拒绝该行，不再静默回退当前层 | `a6264b3` | selftest +2（3034） |
| IO-P2-13 | 已修复 | 盲区 GeoJSON 按 `settings.precision` 取整、去相邻重复点、退化面跳过、外环统一逆时针、index 连续 | `560259c` | selftest +3（3037）；golden 未变（原值已为整数且逆时针） |
| IO-P2-21 | 已修复 | XLSX 逐表 try/catch，单表超 5 万行只跳过并计数（`skippedSheets`），全部超限仍报错 | `3ea90f8` | selftest +2（3039，多工作表构造）；真实 5 万行解析耗时未测 |

> 真实往返（不只静态断言）：`4d439dc` 新增 selftest 分区「P2 表格真实往返：列集/列序/取值一致」，固定 1F 点/矩形/折线 + 2F 圆走「导出 → `DSV.parseRows` → `rowsToObjectsPlan` → apply」全链路；e2e 新增浏览器内 `delimitedText(',')` → `#fileInput` → 合并回灌并断言字段不漂移。最终 selftest 3048 通过 / 0 失败，e2e 111 用例（110 通过 + 1 条件跳过）。
> 仍保留的「未验证」：Excel 实机打开/另存往返、GIS 软件绕向校验、真实 5 万行 XLSX 解析耗时、损坏工程 IndexedDB 恢复路径、预览面板非法形状的视觉提示。

### 2.7 批次 3/4：DXF/PNG 一致性与核心瞬态边界（12 条）

> 「已修复」= 本批改了业务代码并有可复跑断言；「已收敛」= 实现早于本批（N-10/N-14/N-15/B-03），本批补齐专项断言或文档口径，不重复改代码。

| 编号 | 状态 | 修复/收敛要点 | 提交 | 验证依据 |
|---|---|---|---|---|
| IO-P2-14 | 已修复 | PNG 补「工程名 · 场地描述」页脚，与 SVG/PDF 共用 `exportFooterText()`；可见性仍走 `drawScene`→`isVisible` | `8c8d7ad` | selftest +2；PNG golden 仅语义（宽高），无逐字节基线 |
| IO-P2-15 | 已修复 | DXF LAYER 表色改为该层首个导出对象色（最近 ACI），空层回退 `#7c3aed`，SITE 保留 `#16a34a`；实体色不变 | `90ed3ae` | selftest +4；`plain-scene.dxf` 仅 1 字节（62: 8→5），`symbol-scene.dxf` 不变 |
| IO-P2-16 | 已收敛 | N-10 已实现保留层 SITE 与重名 `_2` 改名；本批补 4 条冲突断言 | `02cf1d4` | selftest +4；业务实体落 SITE_2、场地实体仍在 SITE |
| IO-P2-18 | 已收敛 | B-03 已统计 VERTEX 42 凸度并在预检文案标注；本批补「有/无凸度」文案断言 | `21f7185` | selftest +2；R12 仍按折线拉直（明确降级） |
| IO-P2-19 | 已修复 | 组码 1 保留原值（不再 trim），vendor TEXT 去掉尾部 `\s+$` 截断；TEXT/ATTRIB 首尾空格往返保留 | `11d66fa` | selftest +3；文本断言直接读取解析结果 |
| IO-P2-26 | 已收敛 | N-10 的 `dxfSanitizeName` 已清洗 CR/LF；本批补单独 LF 与 C0 控制字符断言 | `b807efb` | selftest +2；图层名无控制字符 |
| CORE-P2-2 | 已收敛 | N-14 已把 `fitView()` 夹到 `ZOOM_MIN~ZOOM_MAX`；本批补超大场地下限侧断言 | `fd74f74` | selftest +2；1e9 m 场地 zoom=ZOOM_MIN 且 pan 有限 |
| CORE-P2-7 | 已修复 | `convertAreaShape` 的 ellipse→rect 保留 `oldAngle`（本地框 2rx×2ry），circle 仍归零 | `7a5d82a` | selftest +4；角度/尺寸/圆归零/平行四边形 |
| CORE-P2-9 | 已修复 | 新增 `escapeInterrupt()` 与 `handleWindowBlur()`，统一走 `resetTransientInteractionState()`；新增 `keepCoverage/keepGuides` 选项（默认不变） | `64351c5` | selftest +11；中断/切层/撤销/失焦四类退出各自独立断言 |
| CORE-P2-10 | 已收敛 | N-15 已让快照回滚走 `keepCalib` 复位；本批补覆盖率/框选/仿射草稿清空断言 | `0152823` | selftest +5 |
| CORE-P2-18 | 已修复 | `drawImage` 抛错置 `bgImageState='error'` 并只 toast 一次，替换底图后可再次提示 | `40542b1` | selftest +3；抛错 ctx 真实触发，toast 计数 1→1 |
| CORE-P2-19 | 已修复 | 新增 `clearCoverageResult()`，清结果同时 `releaseCoverageLayers()`；替换 5 处直接置 null | `bc59bca` | selftest +7；构建/命中/清空/markDirty 均释放缓存 |

> 本批统一验证：selftest 3097 通过 / 0 失败；e2e 111 用例（110 通过 + 1 条件跳过）；check-gates 6/6 + 10/10；check-discipline 13/13；i18n 45.3%（缺口 8）；dist 816,632 B / 余量 23,048 B；SW `VERSION=53`。
> 仍保留的「未验证/限制」：PNG 页脚无逐字节 golden；DXF 多色图层表色只代表首对象；R12 凸度未做圆弧保真；快照不持久化校准点；`visibilitychange` 未单独处理（由 blur 兜底）；覆盖率缓存无 LRU；椭圆→圆仍按面积近似。

### 2.8 批次 5/6：核心 schema/安全与快照/协作（10 条）

| 编号 | 状态 | 修复/收敛要点 | 提交 | 验证依据 |
|---|---|---|---|---|
| CORE-P2-1 | 已修复 | 新增 `SETTINGS_KEYS`（从默认设置派生）、`sanitizeSettings`、`settingsForStorage`；`buildProject` 与启动兜底共用同一清洗；仅无已保存工程时应用本机设置，`__proto__` 等非白名单键不入设置 | `a72318a` | selftest +13；原型污染、白名单、越界夹取、存储视图、启动兜底 |
| CORE-P2-8 | 已修复 | `commitChange` 增加可选 `floorId`，`renameFloor` 传入被重命名楼层，刷新该层 `updatedAt` | `fc9f04c` | selftest +5；非当前楼层刷新、当前层不误触 |
| CORE-P2-11 | 已修复 | `sanitizeLayers` 按 id 去重保留首个定义；默认图层补插不变 | `8f2867b` | selftest +3；重复 id 折叠、首个名称生效、默认层唯一 |
| CORE-P2-12 | 已修复 | `site.id` 统一走 `safeId`；新增 `sanitizeSiteAnnot` 复用 `SITE_ANNOT_SETTING_KEYS`，只保留布尔已知键 | `ee61281` | selftest +5；特殊字符 id、未知键/非布尔丢弃、缺失回落 |
| CORE-P2-17 | 已修复 | `leaseIngest` 校验 tabId 为非空字符串并截断 64 字符；对端 ts 钳制 `[now−TTL, now+5s]`，非法值回落 now | `309d199` | selftest +5；伪造未来心跳、非字符串 tabId、非法/过期 ts |
| RT-P2-01 | 已修复 | `snapshotKey`/`snapshotIndexKey` 两段 `encodeURIComponent`；新增 `snapshotProjectPrefix` 统一过滤；`snapshotIdOfKey` 解码 | `7fcabbf` | selftest +6；普通 id 不变、冒号隔离、索引键、后缀还原 |
| RT-P2-03 | 已修复 | `snapshotProjectData` 改为异步：先深拷贝再在副本上 `ensureObjectPhotoAssets` 并剥离 dataUrl；不再改写实时 state | `c413ea8` | selftest +4；实时对象保留内嵌照片、快照无 dataUrl、B-04 改 await |
| RT-P2-04 | 已修复 | `restoreSnapshotById` 在归属/schema 校验后增加 `state.meta.projectId===pid` 守卫 | `57c1488` | selftest +1；非当前工程恢复被拒；N-15/CORE-P2-10 补工程绑定 |
| RT-P2-05 | 已修复 | 快照 `sameJson` 与拖拽 `sameSerializable` 改用 `mergeStable` 稳定序列化 | `b1f7c2f` | selftest +4；键序不同判定相等、真差异仍不等 |
| CORE-P2-20 | 已修复 | 新增 `assertProjectWithinLimits`，打开工程复用；`mergeProjectJSON` 在输入与合并结果两处复用导入限额 | `2459b59` | selftest +3；超限输入/结果拒绝、拒绝后现场未替换 |

> 本批统一验证：selftest 3146 通过 / 0 失败；e2e 111 用例（110 通过 + 1 条件跳过）；check-gates 6/6 + 10/10；check-discipline 13/13；i18n 45.15%（缺口 8）；dist 817,873 B / 余量 21,807 B；SW `VERSION=63`；8 种 golden 均未变化。
> 仍保留的「未验证/限制」：含特殊字符工程 id 的历史快照不迁移（不可见但不误删）；协作合并超限只报错不做部分合并；租约时间钳制依赖本机时钟单调性；合并结果上限校验在构造并集后执行，极端超限输入仍有一次深拷贝开销。

### 2.9 批次 7/8：插件沙箱与规则/统计（6 条）

| 编号 | 状态 | 修复/收敛要点 | 提交 | 验证依据 |
|---|---|---|---|---|
| RT-P2-07 | 已修复 | 清单与源码上限由字符数改为 UTF-8 字节，复用 `utf8Length`；`PLUGIN_MANIFEST_MAX_BYTES`/`PLUGIN_CODE_MAX_BYTES` 抽常量，清单导入与直调共用 | `0395043` | selftest +3；70000 中文字符（210000 B）清单被拒、22000 中文字符（66000 B）code 被拒、65536 单字节通过 |
| RT-P2-08 | 已修复 | `loadPlugin` 直调路径补 64 KB 字节校验，位于任何 Worker/URL 创建之前，旧插件不兼容仍返回原因 | `2920db5` | e2e +1；66008 B code 被拒且 `listPlugins` 为空 |
| RT-P2-09 | 已修复 | 仍被对象引用的类型在卸载时保留注册；`addType` 允许同 owner 覆盖旧定义，`installType` 同 id 替换；其它插件与可信调用仍不可抢占 | `30ade59` | e2e +1；卸载→同 id 重载成功，类型 1 份、对象引用保留、名称更新 |
| RT-P2-11 | 已修复 | 下载必须命中调用期 `pending`，否则禁用并给原因；下载字节复用 `APP_LIMITS.IMPORT_FILE_MAX_BYTES`（文本按 `utf8Length`、二进制按视图 `byteLength`），Blob 不再取整个底层 buffer；N-02 逃逸矩阵扩到 10 项（含 onmessageerror/DOM/parent/indexedDB/fetch） | `3199958` | e2e +3；旧 callId 复用下载被拒且 `__dlCount=0`、33 MB 下载被拒、10 项逃逸面 undefined |
| RT-P2-13 | 已修复 | 新增 `ruleMaxPolygonIntersection`，重叠判定遍历全部轮廓对取最大交面积；贴合容差与 `minArea` 阈值不变 | `bd7d55f` | selftest +2；多轮廓 100 m² 命中、首轮廓无交时旧口径为 0；rules.spec 通过 |
| RT-P2-14 | 已修复 | 统计越界改与规则页共用 `siteBounds`（无可见场地退回 `worldDims`）与 `ruleTolerance(state.rules.bounds.tolerance,0.05)`；`STATS_ISSUE_VERSION=2`，统计页标题与 PDF 报告标注 v2 | `f746b2f` | selftest +6；0.1 m 越界命中、0.5 容差不报、图片大于场地按场地判、场地隐藏退回、版本=2 |

> 本批统一验证：selftest 3157 通过 / 0 失败；e2e 115 用例（114 通过 + 1 条件跳过）；check-gates 6/6 + 10/10；check-discipline 13/13；i18n 45.15%（缺口 8）；dist 819,766 B / 余量 19,914 B；SW `VERSION=69`；8 种 golden 均未变化，导出字段未改。
> 仍保留的「未验证/限制」：下载上限在大消息克隆之后才校验，峰值内存仍受 32 MB 级入站消息影响；同 owner 重载会更新仍在使用中的类型外观；统计 v2 与旧报告数值不可直接比较（仅标注版本，不迁移历史报告）；重叠仍把任一边小于贴合容差的浅交视为贴合，极细长重叠按该语义不报；插件引用 `utf8Length` 依赖脚本加载顺序（`snapshot.js` 在 `plugins.js` 之前）。

### 2.10 批次 9/10：目录/停车/UI 与代码卫生/i18n（9 条）

| 编号 | 状态 | 修复/收敛要点 | 提交 | 验证依据 |
|---|---|---|---|---|
| IO-P2-22 | 已修复 | `catalogLoad` 分离 IDB 读取与 schema 校验：损坏记录保留已载入目录、记录 `catalogLoadError` 并在启动后 toast 原因；IDB 不可用不误报损坏 | `4ec211f` | selftest +9（脏 schema/空 items/空记录/IDB 抛错四路径，目录均不被清空） |
| IO-P2-23 | 已修复 | `parkingSite` 优先 `siteBounds`（场地可见）；仅场地隐藏/缺失时回退 `worldDims`，图片大于场地不再把车位排到场地外 | `d02e8f8` | selftest +3（图片 200×140 vs 场地 100×70、场地隐藏回退、场地偏移 20,30/40×25） |
| IO-P2-24 | 已修复 | 停车编号改用 `objectNameScopeFor(used,'P'/'A',3,1)` 共享作用域；`used` 在清除前聚合，避开本批墓碑名 | `c994f5b` | selftest +6（P+三位、唯一、P001/A001、清除再生成 P313、总数 312） |
| IO-P2-25 | 已修复 | `exportJSON` 只改副本时间戳，不再写 `state.meta.updatedAt`；导出键集与取值语义不变 | `1719ce6` | selftest +3（实时时间戳不变、副本为导出时刻、键集与 `persistableState` 一致） |
| RT-P2-15 | 已修复 | 对象清单类型色 dot 统一走 `normalizeExportColor` + `esc`，脏色值回退 `#666` | `cafc822` | e2e +1（脏色不逃逸 style、`backgroundImage` 为空、合法色保留） |
| RT-P2-16 | 已修复 | `showConfirm`/`showPrompt` 通过 `openModal` 的 `onClose` 统一结算；Esc/遮罩按取消语义返回，按钮路径不变 | `7afeb45`（e2e/清单）+`61932b2`（源码） | e2e +1（Esc→false、遮罩→null、按钮→true/输入值） |
| CORE-P2-15 | 已修复 | 删除 3 处恒不可达分支（扇形角度覆盖、活动层补楼层、affine 的 `site.kind!=='image'`）；`geometry-site` 图片/空场地分支保留并说明 | `b33a89a` | selftest +3（缺省角度扇形=整圆、活动层缺失回退首层且不新增楼层）；图片底图无手柄断言仍覆盖保留分支 |
| CORE-P2-16 | 已修复 | 核心层默认名、撤销提示、面积/周长前缀、快照默认标签与 A/B 差异字段统一走 `L()`，补 23 条 en 词条 | `48fcaf4` | i18n 46.2%（+1.05pp）；selftest +5（英文默认工程名/图层名/场地名/字段名/布尔值） |
| RT-P2-18 | 已修复 | 5 个 `__collab*` 观测全局仅在 `?debug=1` 下暴露；e2e 统一走调试 URL，原 13 处断言保留 | `73a1b33` | e2e +1（生产 URL 三全局 undefined、调试 URL 可读）；collab 11 passed / 1 skip |

> 本批统一验证：selftest 3186 通过 / 0 失败；e2e 118 用例（117 通过 + 1 条件跳过）；check-gates 6/6 + 10/10；check-discipline 13/13；i18n 46.2%（缺口 8 / UI 1 / 模板 0，PHRASES 1001 / TEMPLATES 112 / DICT.zh 193）；dist 820,884 B / gzip 255,006 B / 余量 18,796 B；SW `VERSION=78`；8 种 golden 均未变化，导出字段未改。
> 仍保留的「未验证/限制」：墓碑只持久化 id、不存名称，跨会话无法回填历史墓碑名（未改 schema）；场地隐藏时停车仍有意回退取景框；新工程/图层的默认名在创建时按当时语言落盘，切换语言不会重译历史数据；`features` 层与 `ui-shell.js` 仍有审计未列出的硬编码中文（UI 硬编码门禁 1/20）；协作嵌套弹窗未改（既有行为）。

### 2.11 批次 11：性能打点 3 条 + 修复 2 条

> 批次 11 最初只补真实 Chromium 采集与采样设施（生产代码未改）；随后按内存硬规矩追加修复：CORE-P2-3 `4b800e8`、IO-P2-11 `5eec209`。数据见 [performance.md](performance.md) §4.1.6~§4.1.8，采集环境统一为 1920×1080@DPR1、headless Chromium（SwiftShader）、CDP 强制 GC ×2、`--repeat-each=2`。

| 编号 | 状态 | 结论 | 提交 | 验证依据 |
|---|---|---|---|---|
| CORE-P2-3 | **已修复** | `WeakMap` 记忆使 `objects` 与 `floors[active].objects` 共用一个快照容器：10k 对象 × 20 条历史堆增量 19.657 MB → **8.912 MB（−54.7%）**，`pushHistory` 826.1/840.5 ms → **505.2/488.3 ms**，快照对象实例 400,000 → **200,000**；别名结构与切层后撤销/重做保持 | `15bd54f`（打点）、`4b800e8`（修复） | `node scripts/perf-browser.mjs --no-gate tests/perf/p2-perf.perf.mjs -g "CORE-P2-3" --repeat-each=2`；selftest 74b 21 断言 |
| CORE-P2-4 | 已收敛（N-21 修复，本批补证） | `listSnapshots` / `pruneSnapshots` 每次仅 1 次 IDB get（P95 0.9/0.6、0.3/0.3 ms），`snapshotRecords` 20 次 get（P95 360.1/349.8 ms）；列表/淘汰不再解析快照 data | `60736c5` | 同上；`idbGetKey` 计数包装，20 条 × 10k 对象 |
| IO-P2-11 | **已修复** | `buildExportRow` 每行各算一次长度/面积：调用 13,333 → **10,000 次（−25%）**；10k 行构建 P50 18.9/17.4 → 15.6/18.4 ms（差异在机器抖动内）；导出字段与 8 种 golden 逐字节不变 | `987f594`（打点）、`5eec209`（修复） | 同上；`objectLength`/`objectArea` 计数包装；e2e 117 通过 + 1 条件跳过 |

> 批次 11 修复后统一验证：selftest **3207** 通过 / 0 失败（+21 断言）；e2e 118 用例（117 通过 + 1 条件跳过）；check-gates 6/6 + 10/10；check-discipline 13/13；i18n 46.2%（缺口 8 / UI 1 / 模板 0）；dist **821,325 B** / gzip 255,136 B / 余量 **18,355 B**（较批次 11 起点 +441 B）；SW `VERSION=80`；8 种 golden 与导出字段均未变化。
> 性能用例：`tests/perf/p2-perf.perf.mjs` 3 用例 × 2 次复跑 = 6 passed（13.6 s），数据写入 `test-results/perf-p2.json`（该目录不入库）。
> 剩余风险：历史 >20 步的长时编辑内存斜率未单独采集；IO-P2-11 的墙钟收益小于本机抖动，保留依据是调用数下降且输出逐字节一致。

## 3. 已降级为限制（10 条，不是缺陷）

| 编号 | 限制 | 为什么按限制处理 |
|---|---|---|
| K2 | 未引入通用文本测量缓存、通用 Path2D 缓存、图层/对象索引、拾取索引 | A/B 实测收益低于运行噪声，未纳入；仅符号路径按类型有窄缓存例外。性能上限未承诺，大场景卡顿已在 CORE-P1-4/5 单列 |
| K3 | PDF 图纸页为位图 | PDF 写出器只做栅格页；清单独立分页。界面选项名含“矢量”属文案问题，改名由 UI 任务处理，不影响数据 |
| K4 | DXF 仅近似：场地独立图层、圆/扇形折线化、不还原填充 | 兼容目标为 CAD 可编辑，不承诺视觉 1:1；已有降级报告 |
| K5 | 协作二维码约 42 字节 | 内置编码器容量边界；超长改用可粘贴文本，不渲染假二维码 |
| K6 | 覆盖率是栅格估算，v1/v2/v3 数值不可直接对比 | 口径变更以保证可复现；历史报告需标注口径版本。v3（N-20）起区域面积统一用解析公式，统计/图表/面板/导出同源 |
| K7 | 规则检查只判几何，不内置规范数值 | 产品明确“不是消防/规范审图”，避免误导 |
| K8 | 符号 DXF 折线近似；内置 36 个；搜索不支持拼音 | 体积与安全取舍；旧工程靠自身类型表保留图标（A1） |
| K9 | 插件隔离不是语言级安全沙箱 | 仅承诺能力白名单与超时；已知逃逸单列 P0-4，需按 P0 修复后再收紧 |
| K10 | 协作按对象/楼层时间取较新，无服务端权威 | 无服务器是产品约束；冲突可见性缺陷单列 RT-P1-03 |
| K12 | 文件/对象/表格/快照/目录等容量上限 | 浏览器与本机存储的现实边界；数值见 [features.md](features.md) 第 20 节 |

> 说明：A4 已并入 M8（真实误报率未验证），不再单列；K1、K11 已修复，不再列为限制。
