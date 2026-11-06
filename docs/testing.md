# 测试体系（浏览器级 e2e）

> 本文承接原 `engineering.md` §5.2 的浏览器级测试内容；门禁阈值、断言数、golden 与 Node 桩 bench 见 [engineering.md](engineering.md) §5.1，真实浏览器性能基线见 [performance.md](performance.md) §5.4。

## 5.2 浏览器级测试（A-14，可选）

`tests/e2e/*.spec.mjs` 经本地静态服务器（`scripts/serve.mjs`，零依赖）在真实 Chromium 中执行，
覆盖 Node 桩无法证明的部分：

| 文件 | 守什么 |
|---|---|
| `smoke.spec.mjs` | 页面加载无脚本错误 / 入口无远程引用 / CSP 声明；点工具落点与选择命中；JSON 导出真实下载可解析；CSV/XLSX 表头与行值来自同一字段表，台账列与公式防护不回退 |
| `persistence.spec.mjs` | IndexedDB 真实 v1→v2 回写；资产回收按命名空间并集（跨工程不误删）；非法 JSON 导入失败后现场不变；跨楼层照片导出/导入不丢 |
| `csp.spec.mjs` | 4 条注入路径（导入 JSON / 旧存档 / 插件注册 / 类型列表渲染）在浏览器中确实无法执行 JS |
| `history.spec.mjs` | 撤销/重做、新增楼层、删除当前楼层、切换楼层后刷新与操作后状态一致 |
| `history-increment.spec.mjs` | B-10：CDP 实测 20 条含照片历史堆增量（基线 28.26MB vs 1.03MB，下降 96.4%）；共享快照不被 live 编辑污染、undo/redo 语义与 20 条上限不变、普通条目兼容；历史引用的底图/照片保活与清空历史后可回收；1000 对象单次 undo <100ms |
| `interaction.spec.mjs` | 单击对象不落盘/不清覆盖率/不留空撤销快照；拖拽中 Esc 回滚到原位 |
| `snapshot.spec.mjs` | 1000 对象快照 < 2s、体积实测；内嵌照片转为 `photoId` 引用；删除快照不影响工程；回滚进入撤销栈且可撤销/重做、回滚后可继续编辑；构造样本六类差异分类与 0 误报；叠加开关与关闭清理；**快照资产保活/删除后可回收**；20 快照（7.64MB）可达集扫描 41.5–42.6ms |
| `collab.spec.mjs` | B-06：双标签等待→已连接→对端断开可见；消息层 TTL/key 上限/重复 hello 去重/`send` 抛错不冒泡/异常断开进 `error`；LWW 覆盖写撤销栈且 `Ctrl+Z` 恢复本地值、冲突行可见；离线短间隔重连不丢本地修改；邀请串三步建连 + 邀请串超 42 字节时只提示不渲染二维码（**同机双标签，不代表双设备 WebRTC**）；`COLLAB_SOAK=1` 时额外跑 5 分钟离线浸泡 |
| `catalog.spec.mjs` | B-05：目录 JSON 导入 → 型号/数量绑定 → F2 同型号 → CSV/XLSX 报价导出（7 列表头、数值、合计、目录版本/导出时间）→ 替换目录后重导仍为冻结单价、改数量后按新目录重算 → 非法目录导入事务化失败且现有目录与 IndexedDB 不变 → 刷新后目录恢复、BOM 跨楼层数量正确 → 跨厂商重名未填厂商不带价、填厂商后按精确键计价 |
| `table-batch.spec.mjs` | B-08 原义：CSV 条件替换命中 2 台并改写业务类型/台账、批量新增落点 (10,20) 可复算；严格模式下非法更新行整批拒绝（无「合并导入」按钮），现有对象数量与文本不变 |
| `world-transform.spec.mjs` | B-12：已仿射校准底图 + 矩形场地 + 点位做 2× 世界缩放后，对象世界坐标 ×2、与底图同一像素屏幕偏差 < 0.5 px，`metersPerPixel` 0.05→0.1、`transform.a` 同步 ×2，设备物理尺寸 ×2；场地默认保持 100×70（场地优先校准）。退化变换 `ok=false` 且对象/mp 不变；`scaleWorldAround` 旧签名可用、无 transform 时只缩放 m/p；显式 `{site:true}` 时圆场地等比放大仍为圆 |
| `perf-render.spec.mjs` | B-11：真实 Chromium 1600×900 离屏渲染基线（A 基础场景 / B 标注+图元，均 2000 对象）。输出重建 / 缓存命中 / 直接全量的 avg·P50·P95·P99、`staticKey`、`filter+sort`、`measureText` 与 `Path2D` 单帧调用、heapDelta、zoom=6 裁剪率；断言为宽松上限（重建 P95 <160ms、缓存帧 P50 <8ms / P95 <12ms、直接 P95 <160ms、裁剪 >60%）只作防回归，不作为性能承诺 |
| `pdf-multipage.spec.mjs` | B-13：两页矢量 PDF（`/Kids` 顺序与对象编号相反，页宽 200/300）导入后按页序生成 2 线 + 2 文字，第一页线尾 190pt 可复算、第二页整体右移且与第一页水平区间不重叠（独立原点）、场地覆盖 524pt 总宽、提示含「2 页（独立原点）」；单页 PDF 保持旧行为（原点归零、无多页提示） |
| `title-block.spec.mjs` | B-07：导出下拉「图框模板…」配置 8 字段并启用 → `state.meta.titleBlock` 落值 → SVG 导出回读工程名/图号/比例/日期与 `>图例<`、且不含 `<script>`（统一转义）→ PNG 校验 PNG 签名与体积 >10KB → PDF 校验 `%PDF-` 与体积 >10KB，同一配置贯通三格式 |
| `i18n-template.spec.mjs` | B-14：切换英文后顶栏导出按钮为 `Export`；`L('已粘贴 {n} 个对象',{n:3})` 经 `toast` 输出 `Pasted 3 objects`、表格导入整句输出英文；把 `<img src=x onerror=...>` 作为文件名参数注入，toast 内 `childTags=0` 且 `window.__xss` 未触发（`textContent` 边界不引入注入面） |
| `sw.spec.mjs` | B-15：在不加载业务脚本的同源空页注册 SW → 当前缓存名 `plotpin-v3` 且预缓存 46 条 → 预置的 `plotpin-v1` 在 activate 时被清理 → `context.setOffline(true)` 后直接打开 `index.html` 仍渲染画布（缓存回退，非白屏） |
| `mobile.spec.mjs` | B-15：390×844 / DPR3 / touch 移动模拟下 `viewport-fit=cover`、画布 `touch-action:none`、工具栏命中区 ≥44px、☰ 侧栏开合并可点空白关闭、点工具轻触画布落点；同一次运行输出 2000 对象的移动与桌面重建/缓存帧/首屏数据，断言仅作宽松防回归 |
| `dxf-version.spec.mjs` | B-03：AC1032 混合 DXF（LINE/SOLID/3DFACE/LEADER/TEXT/ATTRIB/DIMENSION）导入后 4 线 + 2 文字、2 个闭合区域、图层齐全，提示含版本与补充解析；二进制 DXF 明确提示另存 ASCII 且不产生对象。B-02：预检模态确认后导入；单位改判「按米」+ 只读参考层落点后坐标 ×1000、图层名含 `DXF参考` 且 `locked=true`、提示含「只读参考层」；`.dwg` 入口显示 AC1032（2018）与转 DXF/PDF 指引、`accept` 含 `.dwg`、不产生对象且不报「不支持的文件类型」 |
| `coverage.spec.mjs` | A-11：覆盖率 v2 固定格数口径跨 zoom 0.25/1/4/16 差异 ≤1pp、隐藏对象/图层退出分母、盲区 GeoJSON 下载、布点优化应用后重跑闭环 |
| `plugin-sandbox.spec.mjs` | C-01：Worker 隔离执行、`capabilities` 未声明能力拒绝、超时 2s 由主线程 terminate、插件异常只禁用该插件；`symbol` 未声明 `icons` 被拒；带 `"><img onerror=…>` 的类型名/图标经 `esc` 后不产生 DOM 注入 |
| `rules.spec.mjs` | C-05：规则页签配置容差与类型阈值 → 重叠/间距/越界违规清单（规则名/对象/关联对象/楼层/坐标/实测值）→ 单击行跨楼层定位并选中主/关联对象 → CSV 导出含表头与转义；恰好等于阈值不报违规 |
| `symbols.spec.mjs` | C-04：别名搜索（烟感 / NVR）与分类筛选、放置后角度与物理尺寸写回对象、5 例恶意 SVG（script / onload / 外部 href / 超深嵌套 / 超大字节）逐条 toast 原因且类型数不变、自有符号 JSON 导出仅含当前工程符号且内存重置后导入只写入当前工程 |

**B-13 多页 PDF（2026-11）**：容器层按对象编号扫描页对象，编号≠页序；适配层 `pageTreeOrder` 从
`/Catalog → /Pages → /Kids` 递归恢复文档页序（缺失/损坏时退回扫描顺序并追加未覆盖页，不静默丢内容）。
每页内容先归零到自身 MediaBox，再由 `PdfRead.layoutPdfPages` 沿 +X 依次落位（gap=最大页宽 8%）——
修复旧行为「所有页叠在同一原点」。导出侧 `pdfPagePlan()` 以楼层顺序生成「图纸页 + 清单页」计划，
页码全局连续并写入页脚；清单分页数与渲染共用 `pdfListRowsPerPage()`。往返校验覆盖页数、页序、页宽/页高
（`selftest` §37b，用 `Pdf.buildImagePdf` 生成两页后 `parsePdf` 回读），矢量坐标回读仍受「PDF 导出为位图」限制（见风险）。

**图框 / 标题栏 / 比例尺 / 图例（B-07，2026-11）**：字段 schema 只有 `js/core/model.js` 一处
（`TITLE_BLOCK_FIELDS` / `createTitleBlock` / `normalizeTitleBlock`），默认 `enabled:false`，
`frame/scaleBar/legend` 默认开、版本默认 `V1.0`，文本清洗控制字符并截断到 80 字符。
导出侧 `titleBlockSpec(W,H,ppu,format)` 是**唯一布局源**，未启用返回 `null`，三处调用点（PNG
`renderToDataURL` / PDF `renderPdfDrawingPage` / SVG `buildSceneSvg`）直接跳过——默认产物零字节差异，
`selftest` 以 `buildSceneSvg` 视觉快照哈希 `e6ba5542…` 断言。启用后 PNG/PDF 共用
`drawTitleBlockOnCanvas`、SVG 用 `exportTitleBlockSvg`，两者读同一 spec（几何/文案不各写一套）；
SVG 所有文本走既有 `esc()`，与底图 `href`、场地 `fill/stroke` 同一道转义防线。
比例尺取 1/2/5×10ⁿ 米的整齐长度（目标 140px），比例 `1:N` 中 N = dpi /(每米像素 × 0.0254)，
PNG/SVG 按 96dpi、PDF 按 150dpi 图纸页换算（同一缩放导出 PNG 与 PDF 的比例数不同属预期）。
图例只统计**可见对象**，按类型聚合名称/颜色/数量，上限 8 类 / 6 层，超出显示 `+N`。
持久化：字段存 `state.meta.titleBlock`，`buildProject` 归一后随 `meta` 进入撤销/重做快照（B-10 结构共享
不改语义）；协作/合并走 `mergeProjectData` 的 `meta` **整体本地优先**（`Object.assign(B.meta, A.meta)`），
不做字段级 LWW，也不单独统计标题栏冲突；旧工程缺 `meta.titleBlock` 时 `normalizeTitleBlock`
整体降级为「关闭 + 默认字段」，不阻塞载入。

**i18n 插值模板（B-14，2026-11）**：动态整句不再用 `L('前缀：') + 值` 拼接。`js/common/i18n.js`
新增 `TEMPLATES`（中文整句 → 英文整句，含 `{name}` 占位）与 `fillTemplate`：`p(text, params)`
在英文下先查 `TEMPLATES`、再查 `PHRASES`，未收录回退中文；最后统一按 `/\{(\w+)\}/g` 替换占位，
**中文模式直接填充原文模板**，语义不变。对外暴露 `I18N.templates` / `I18N.fmt`（只做占位替换、
**不转义**），调用方在 DOM/SVG 边界仍走 `textContent` / `esc()` / `xmlEscape`，A-02 注入面不扩大。
新增可复跑统计 `scripts/i18n-scan.mjs`：逐字符状态机跳过注释与字典文件，收集单/双/反引号字符串字面量
并去重；识别 `L / I18N.p / I18N.t / I18N.fmt / I18N.tpl / toast / commitChange / openModal /
showConfirm / collabNotifyThrottled` 为翻译入口；「硬编码」＝含 CJK 且未走入口，「缺口」＝走了入口
但字典无对应英文，「覆盖率」＝ 已字典化 ÷（已字典化 + 缺口 + 硬编码）。同一脚本对 `HEAD` 基线
（`git worktree` 旧版本）与改造后各跑一次，**25.64% → 33.79%**（已字典化 269 → 347，缺口 125 → 49，
硬编码 655 → 631）。未迁移项集中在 `js/common` 适配层内部错误串、DXF 单位名、DWG 入口整段 HTML
指引与多行组合提示（见 `CHANGELOG.internal.md` 的 B-14 条目）。

**移动端与 PWA（B-15，2026-11）**：`sw.js` 缓存名 `plotpin-v{version}`（当前 `plotpin-v3`），
`activate` 删除所有非当前版本缓存后 `clients.claim()`；脚本清单从 `index.html` 解析，新增脚本无需手工维护。
安装用 `Promise.allSettled` 逐项 `cache.add`，单个 404 不会让新版本永远装不上；安装/激活失败时旧版本继续
服务。`fetch` 网络优先（在线始终取最新，避免旧缓存卡住升级），离线回退缓存，导航请求 `ignoreSearch` 回退
`./index.html`，缓存也没有时返回内置离线提示页（503，非浏览器白屏错误页）。`js/core/app.js` 监听
`updatefound → installed`，已有控制器时 `toast('新版本可用：刷新页面后生效')` 并暴露同一 i18n 文案；
`visibilitychange` 可见时 `reg.update()`，离线失败静默保持旧版本。移动端：`viewport-fit=cover`，
`.topbar/.hud-bottom/.sidebar` 使用 `env(safe-area-inset-*)`（桌面解析为 0，不改变旧布局），
`@media(pointer:coarse)` 保证按钮/工具栏 ≥44px，手机横屏压缩顶栏并收窄侧栏，`.tool-rail` 允许纵向滚动；
窄屏侧栏改为「文档级 pointerdown 关闭 + 遮罩 z-index 19 低于顶栏」——修掉此前遮罩盖住 ☰ 导致触屏无法
关闭侧栏的问题。手势取消沿用 A-06：`pointercancel / lostpointercapture / Escape` 统一走 `cancelActiveDrag`，
本轮未新增手势状态。渲染样本提取到 `tests/e2e/helpers/scenes.mjs`（B-11/B-15 共用，避免两套样本漂移）。
覆盖率为 `viewport-fit`/安全区/触控目标/CSS 横竖屏的检查，另有 `mobile.spec.mjs` 与桌面同机输出的首屏与
2000 对象帧数据；**真机（iOS Safari / Android 低端机）未测**。

**性能基线单独一套**：`tests/perf/*.perf.mjs` 由 `playwright.perf.config.mjs` 驱动、`npm run perf:browser`
执行，不混进上面的功能 e2e；指标与阈值见 [performance.md](performance.md) §5.4。

**边界**：`@playwright/test` 只允许出现在 `devDependencies`；`build.mjs` 的单文件产物不引用
`tests/` 与 `node_modules/`。`npm run ci` 不含 e2e——无浏览器环境不会因此变红，但显式运行
`npm run test:e2e` 时缺依赖/缺浏览器会以 `[SKIP]` + 退出码 2 明确失败，而不是假绿。

