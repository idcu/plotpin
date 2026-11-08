# 图钉 PlotPin 已知问题

> 核对于 `2df8b3c`（2026-11-08，M2 验收后 HEAD）。本表来自只读代码审计与仓库内夹具/脚本；标注「可复跑」的条目均已用仓库内命令验证过，未标注「实测」的条目未做运行期复现。数量类指标以 [facts.md](facts.md) 为准。
> 分类口径：**已修复**=有可复跑判据；**仍存在**=代码路径确证但未修；**已降级为限制**=产品边界或质量取舍，不是缺陷。
> 新问题的编号与审计报告一一对应，便于后续计划映射：`IO-*`、`CORE-*`、`RT-*` 分别见本地过程材料 `audit-out/audit-io.md`、`audit-out/audit-core.md`、`audit-out/audit-runtime.md`（该目录不入库，不随仓库分发）。

## 1. 已修复（34 条）

| 编号 | 原问题 | 修复依据（仓库内可复跑 / 可核对） | 复核结论 |
|---|---|---|---|
| A1 | 旧工程 64 图标到新内置 36 符号的逐图标视觉回归未比对 | `tests/fixtures/legacy-symbols.json` 逐图标路径 SHA-256 + 可折线化断言；`tests/golden/legacy-symbols.svg` 逐字节；`scripts/selftest.mjs` | 已关闭；旧工程靠自身类型表保留图标 |
| A2 | PDF 输出没有字节级 golden，回归只能靠人看 | `tests/golden/fixed-pages.pdf` 逐字节 + 同输入两次 SHA-256 一致；仅覆盖 PDF 容器层，Canvas JPEG 编码不在判据内 | 已关闭；图纸页仍为位图（见 K3） |
| A3 | SVG 导入“200 路径 × 单条 5000 字符”最坏组合未做耗时打点 | `scripts/bench.mjs` 最坏可达组合耗时门禁 ≤50 ms；历史上限内实测约 1.058 ms；“200×5000”约 1 MB，被 64 KB 上限快速拒绝 | 已关闭；199 路径是有效上限（元素上限含根节点） |
| A5 | 规则检查的圆/椭圆/凹多边形采样误差没有 golden 对照 | `scripts/selftest.mjs` 固定期望与容差：圆面积 <2%（40 段）、旋转方形 =100（1e-6）、扇形 <1%、净距 0.01、凹多边形三角化 2500（1e-6） | 已关闭（仅规则页判定；统计页口径另见 RT-P2-14） |
| A6 | DXF 折线近似与 SVG 图形缺少几何一致性断言 | `symbol-scene` 三符号 DXF 折线逐点/顶点数/闭合与同一轮廓源一致；`scripts/selftest.mjs` | 已关闭；DXF 近似限制见 K4 |
| P0-4 | 插件沙箱可绕过：Worker 内 `BroadcastChannel` 可加入协作频道、`MessageChannel`/`MessagePort` 可自建端口、`onmessage`/`onerror` 可旁路 token 校验 | `tests/e2e/plugin-sandbox.spec.mjs`：插件内 `BroadcastChannel`/`MessageChannel`/`MessagePort`/`onmessage`/`onerror` 均为 `undefined`，向 `plotpin-collab-*` 发送 0 条，覆写 `onerror` 后异常仍走禁用路径 | 已关闭（N-02）；合法插件契约未承诺端口通道，一律封堵 |
| P0-1 | PDF 导入的内嵌底图在自动保存后刷新/重开即丢失 | `tests/e2e/pdf-multipage.spec.mjs`「PDF 内嵌底图走资产入库，自动保存 + 刷新后仍在」：导入当场 `assetId=bg…`、无 dataUrl，重开后 `bgImageState=ready`；`scripts/selftest.mjs` 7.1 覆盖 dataUrl 兜底与非当前楼层；解压炸弹用例断言累计阶段即取消 | 已关闭（N-03） |
| K1 | 离线缓存版本无门禁，旧缓存可能残留 | `scripts/check-sw.mjs` 以提交入库的 `scripts/sw-inputs.sha256`（预缓存输入指纹 + 清单 version）为基线，`scripts/check.mjs` 第 12 步纳入；`check-gates` 场景 6/9 证明会红 | 已关闭（N-01）；不再依赖 `git diff HEAD`，干净检出同样有效 |
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
| RT-P1-04 | 协作消息不带工程标识，不同工程误用同频道会串数据 | `tests/e2e/collab.spec.mjs:409` 同一 N-17 用例：跨工程消息被丢弃并计数 | 已关闭（N-17 `877deec`）；消息体携带 `pid`，无 `pid` 的旧消息按旧行为兼容 |
| RT-P1-05 | 插件添加的对象/标注不进撤销栈，用户无法撤销插件写入 | `tests/e2e/plugin-sandbox.spec.mjs:322`「插件写入进入撤销栈：undo 后对象完全移除、redo 恢复」 | 已关闭（N-18 `9cbc25c`）；与手动绘制共用撤销栈 |
| RT-P1-06 | 插件 2 秒超时只覆盖初始化/单次调用；初始化后的定时器可长期占用 | `tests/e2e/plugin-sandbox.spec.mjs:346`「定时器逃逸：载入后 setInterval 与初始化期捕获的 setTimeout 均失效，主线程仍可用」 | 已关闭（N-18 `9cbc25c`）；loaded 后置 `frozen` 并清空定时器 |
| RT-P1-07 | 属性面板每次 focusin 都压入历史，输入框来回切换会快速耗尽 20 步撤销栈 | `tests/e2e/history.spec.mjs:202`「N-19：属性面板切换 5 个字段不入栈，拖动后一次撤销回原位；场地面板一致」 | 已关闭（N-19 `3c4e522`）；容器级事件委托，字段首次 `input`/`change` 前压一次快照 |
| RT-P1-10 | 楼层写入不更新场地时间戳，场地合并使用过旧时间，导致场地“复活”与覆盖顺序错误 | `tests/e2e/collab.spec.mjs:171`「N-04：对端清空场地可见可撤销；场地拖点实时同步；旧快照不复活已清空场地」；`js/features/props.js` 场地编辑走 `commitObjectEdit`（touchFloor） | 已关闭（N-04 `973c83c`）；`mergeFloorWrite` 读取 `site.updatedAt` |

## 2. 仍存在

### 2.1 P1：功能/数据一致性缺陷（3 条，其中 2 条为部分修复）

| 编号 | 问题与影响面 | 未修复部分（不得降级为限制） | 证据 |
|---|---|---|---|
| CSS-P1-1 | `css/style.css:213` 的 `@media print{` 没有闭合（文件内 `{` 比 `}` 多 1）。CSS 解析器会把其后所有规则吞进打印媒体查询，导致符号库面板等样式在屏幕上不生效；打印时反而生效。这是 2026-11-08 为 N-26 增加 CSS 结构判据时发现的，**本段未修**（改它会影响可见样式，需产品拍板）。 | 需要补齐 `}` 并逐项核对被吞掉的规则在屏幕上的预期样式；修复后应截图对比屏幕与打印。 | 静态可判定：对 `style.css` 去注释/字符串后统计花括号得到 `{` 比 `}` 多 1；`@media print{` 位于 213 行，其后无配对 `}`。未做运行时样式对比（未验证）。 |
| CORE-P1-8 | 图片切变手柄在旋转 90° 附近方向余弦退化，拖动跳变或无效。非有限变换已由 N-14 拒绝，但交互退化仍存在。 | 旋转 90° 附近的切变拖拽仍不稳定；需要手柄求解改用退化保护/正交化，属业务逻辑改动，本段未做。 | audit-core P1-8；`scripts/selftest.mjs` 39.11 节只覆盖非有限值拒绝 |
| RT-P1-09 | 版本快照差异原先只比较对象；场地/底图/楼层结构变化显示“没有差异”。N-21 已补场景级差异。 | 图层名称、类型表结构变化仍不单独成项，只能间接体现在对象的 `layerId`/`typeId` 变更中。 | audit-runtime P1-09；`tests/e2e/snapshot.spec.mjs` 的 N-21 用例只覆盖场地/底图/楼层名 |

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

### 2.3 P2：改进项（66 条，按主题归并为 14 组）

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
