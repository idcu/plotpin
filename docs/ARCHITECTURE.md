# 架构（ARCHITECTURE）

> 入口层文档：只回答「代码怎么分层、事实的唯一源在哪、改哪里会触发哪条判据」。
> 细节以权威文档为准：[模块分层](modules.md) · [工程纪律与门禁](engineering.md) · [契约清单](../contracts/conventions.json) · [用户手册](user-guide.md) · [特性清单](features.md)。

## 1. 运行形态

- 单页离线工具：双击 `index.html` 即用；无构建、无运行时依赖、无后端。
- **45 个 classic `<script>`**（`js/` 35 个 + `ngm.vendor/` 10 个）共享同一个全局词法作用域，文件之间直接引用裸标识符。改 `<script type="module">` 在 `file://` 下会被 CORS 拦掉，等于放弃核心产品承诺。
- 单文件发行包由 [pack-core.mjs](../scripts/pack-core.mjs) 内联、[minify-core.mjs](../scripts/minify-core.mjs) 构建期无损压缩；源码本身不压缩，`index.html` 仍按层序加载可读源码。
- 外部能力以 `ngm.vendor/` 随仓库分发，版本由 `ngm.lock` 钉住；本仓库不引入 npm 运行时依赖。

## 2. 分层图

```
index.html（按层序加载脚本）
├── ngm.vendor/            外部公共模块（XML / ZIP / XLSX / DSV / DXF / PDF / QR / 资产 / 几何）
├── js/common/    层 0     项目专有公共库：i18n、LWW 合并、符号库、DXF/PDF 适配、二维码、资产可达集
├── js/core/      层 1     内核：config（常量/限额）、model、geometry（轮廓/捕捉）、geometry-site（场地/图片手柄）、geometry-coverage（覆盖率/布点）、geometry-transform（仿射/世界变换）、render、interaction、persistence、viewport、snapshot、tab-lease
├── js/features/  层 2     功能域：props、ui-panels、ui-shell、plugins（Worker 沙箱）、io*、rules、parking、collab、snapshot-ui、catalog
└── js/core/app.js 层 3    入口：能力探测、恢复工程、首屏适配、Service Worker 注册；必须最后加载
```

依赖方向只能是「高编号层依赖低编号层 + `ngm.vendor/`」；`js/core/app.js` 按路径在 core，层号视为 3。

| 判据 | 守什么 |
|---|---|
| [check.mjs](../scripts/check.mjs) 第 9 步 | `js/` 只允许 `common/`、`core/`、`features/`；`index.html` 加载顺序层号非递减；每个脚本恰好属于一层 |
| [modules.md](modules.md) | 公共抽象的归属与调用方逐条登记（新增公共函数必须补表） |

**没有运行时模块启停**：DOM 监听、离屏缓存、已注册导出器，尤其工程文件里已写入的 `typeId`，都和代码绑在一起。只有插件 Worker 支持 `loadPlugin / unloadPlugin`。

## 3. 唯一源清单

改一个事实只能改一处；其余位置要么是投影，要么由判据比对。

| 事实 | 唯一源 | 判据 / 消费方 |
|---|---|---|
| 应用版本 | `package.json` = `ngm.json` = `PlotPin.version` | [check-contracts.mjs](../scripts/check-contracts.mjs)、[badge.mjs](../scripts/badge.mjs) |
| 插件 API 版本、能力白名单、对外键集 | [plugins.js](../js/features/plugins.js) + [plugin-api.json](../contracts/plugin-api.json) | [check-plugin-api.mjs](../scripts/check-plugin-api.mjs)（双向比对 + 契约描述同源） |
| 机器可读约定（文件头 / i18n 键 / 枚举同源） | [conventions.json](../contracts/conventions.json) | [check-contracts.mjs](../scripts/check-contracts.mjs) |
| 中英字典与整句模板 | [i18n.js](../js/common/i18n.js)（`PHRASES` / `TEMPLATES`） | [i18n-scan.mjs](../scripts/i18n-scan.mjs)、selftest、契约判据 |
| 导出字段与行渲染 | [io-fields.js](../js/features/io-fields.js) | `io-export.js` / `io-table.js` / SVG / DXF / PDF / 打印报告 / selftest golden |
| 几何与覆盖率口径 | [geometry.js](../js/core/geometry.js)（轮廓/捕捉）+ [geometry-site.js](../js/core/geometry-site.js)（`siteBounds` / 场地手柄）+ [geometry-coverage.js](../js/core/geometry-coverage.js)（`analyzeCoverage`）+ [geometry-transform.js](../js/core/geometry-transform.js)（`applyWorldTransform`） | `render.js` / `io-export.js` / `interaction.js` / bench / selftest |
| 持久化协议 | [persistence.js](../js/core/persistence.js)（`markDirty` / `runSave` / `auditProject` / `buildProject`） | `app.js` / `ui-shell.js` / `scheduleSave` / selftest |
| 多标签租约 | [tab-lease.js](../js/core/tab-lease.js) | `app.js` / `scheduleSave` / `ui-shell.js` 横幅 |
| 符号路径 | [symbols.js](../js/common/symbols.js) | 画布 / SVG / PNG / PDF / DXF 折线近似 |
| 导入限额 | [config.js](../js/core/config.js)（`APP_LIMITS` / `importLimitErrors`） | 所有导入路径与解析器 |
| 发行包哈希 | [dist-manifest.json](../scripts/dist-manifest.json) | [build.mjs](../scripts/build.mjs) `--check` |
| 脚本清单与计数 | `index.html`（唯一加载清单） | `check.mjs` 入口/资源步、[modules.md](modules.md)、README |
| 人工验收项 | [manual-acceptance.md](manual-acceptance.md)（M1–M8） | 发布前逐条执行并回填；CI 不伪造绿 |
| 开发计划与任务状态 | [plans/README.md](plans/README.md) | 索引 `next-phase-2026-11.md` |

## 4. 数据与命名空间

IndexedDB `offline_drawing_annotation`（DB_VERSION 2）有两个 store：

| 键 / store | 内容 | 说明 |
|---|---|---|
| `projects` → `current` | 自动保存草稿 | 每次落盘覆盖；加载前经 `auditProject` 审计 |
| `projects` → `proj:<id>` | 工程库记录 | 顶栏「📁 工程库」绑定后自动同步 |
| `projects` → `snap:<pid>:<sid>` | 版本快照 | 每工程 20 条 / 16 MB 上限，超限淘汰最旧 |
| `projects` → `catalog:current` | 设备产品目录 | 事务化导入：校验 → 落盘 → 才替换内存 |
| `projects` → `quote:last` | 报价快照 | 行集合不变时重导沿用冻结单价 |
| `assets` | 内容寻址底图 / 照片 | 按命名空间可达集回收，禁止跨工程误删 |

localStorage 只承担兜底与小状态：`offline-drawing-annotation.project`（IDB 不可用时的草稿）、`offline-drawing-annotation.settings`（界面设置）、`plotpin:firstRunGuide:v1`（首次引导记录）。

存储 schema 为 **v2**，每个楼层带 `updatedAt`；旧 v1 读取时自动迁移，不双写。旧版 App 只认 v1，遇到 v2 会拒绝载入。

## 5. 改动该跑什么

| 改动 | 必须跑 | 备注 |
|---|---|---|
| `js/**/*.js`、`index.html`、`css/**` | `npm run ci`（selftest → bench → build `--check` → gates） | 改完先 `node scripts/build.mjs` 刷新 `dist-manifest.json` |
| 导出实现 / 字段表 | selftest（8 种 golden 逐字节）+ `e2e` | 不得只看截图 |
| i18n 文案 / 字典 | `node scripts/i18n-scan.mjs` + contracts + selftest | 新增动态句必须用 `L()` / 模板 |
| 插件 API 键 / 能力 | `npm run api` + `npm run api:selftest` | 同时更新 `plugin-api.json` 与 README |
| `scripts/**` 判据 | `node scripts/check.mjs --selftest` + `npm run gates` | 新判据必须能被总闸跑到 |
| 仅文档 | `node scripts/check-discipline.mjs` + `node scripts/check.mjs` | 代码块里的命令必须真实存在 |
| 发布前 | `node scripts/check-discipline.mjs` + [manual-acceptance.md](manual-acceptance.md) | M1–M8 人工项不得用自动化结果顶替 |

## 6. 文档地图

| 想知道 | 去哪 |
|---|---|
| 怎么用（底图/校准/导入导出/协作/插件） | [user-guide.md](user-guide.md) |
| 有什么能力、边界在哪 | [features.md](features.md) |
| 谁可以依赖谁 | [modules.md](modules.md)（本文 §2 是摘要） |
| 门禁守什么、什么故意不设 | [engineering.md](engineering.md) |
| 浏览器级 e2e 覆盖 | [testing.md](testing.md) |
| 真实浏览器性能基线 | [performance.md](performance.md) |
| 已知问题与无法自动化的项 | [known-issues.md](known-issues.md) |
| 结构性删除 / 出库账本 | [deletions.md](deletions.md) |
| 发布前人工验收（M1–M8） | [manual-acceptance.md](manual-acceptance.md) |
| 下一阶段任务与状态 | [plans/README.md](plans/README.md) |
