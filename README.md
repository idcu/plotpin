# 图钉 PlotPin

**离线、零依赖、双击即用的通用图纸标注工具**

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![offline](https://img.shields.io/badge/offline-100%25-orange.svg)](#)
[![test](https://img.shields.io/badge/selftest-4048%20assertions-brightgreen.svg)](scripts/selftest.mjs)

PlotPin 是一个在浏览器里运行的图纸标注工具：在图片底图或矢量场地上放置设备点位、按真实比例绘制区域与折线、测量与标注尺寸，并把图纸和台账导出为常见格式。运行时不安装、不连服务器、不依赖网络；入口是根目录的 `index.html`，托管到静态服务器时由 `sw.js` 提供离线缓存。

当前共 **4048 项断言全部通过**。

> 文档口径：行为以代码为准。本文只做入口索引；易漂移的数字统一放 [docs/facts.md](docs/facts.md)，正文只给命令或带日期的快照。最后核对：2026-11-13（基线 `2123a46` + 工作区 M1/M2 修复）。

## 这是什么

- **点位与范围分开表达**：点设备回答“设备在哪里”，图标屏幕大小固定；区域/折线回答“实际占多大范围”，始终按世界坐标（米）绘制，缩放时与底图同比例。
- **双槽位**：每个楼层可同时保存 1 张图片底图和 1 个矢量场地，两者独立替换、互不覆盖；场地不进入对象列表，不占对象编号，也不出现在 CSV/XLSX 行中。
- **数据留在本机**：工程写入 IndexedDB（不可用时降级 localStorage），底图与照片按内容哈希存入资产库。默认不上传任何数据；实时协作只在手动建连时通过浏览器通道传输工程快照。
- **运行时零外部依赖**：不引用 npm、CDN 或后端。第三方能力以 `@idcu/*` 源码放在 `ngm.vendor/`，版本由 `ngm.lock` 与 `.ngm-version` 锁定；门禁会校验入口没有远程资源。

`index.html` 是唯一入口：37 个项目脚本（`js/common` → `js/core` → `js/features`）加 10 个 vendor 脚本，共 47 个 classic `<script>`，按顺序加载并共享全局作用域，不使用 ES Module；`js/core/app.js` 最后加载并完成启动。

## 快速开始

### 方式一：直接双击

双击 `index.html` 即可使用，不需要构建或安装依赖。

浏览器在 `file://` 下可能禁用 IndexedDB 与 Service Worker。PlotPin 会探测能力并显式降级（IndexedDB 不可用时回退 localStorage，Service Worker 不注册），不是静默失败。

### 方式二：本地静态服务器

需要完整持久化、离线缓存或跑浏览器测试时，使用仓库自带的零依赖服务器：

```powershell
node scripts/serve.mjs
# 默认 http://127.0.0.1:4173；可用 HOST / PORT 环境变量覆盖
```

### 30 秒上手

1. 顶栏「导入」选择图片底图或 DXF/PDF 文件；有图片时先完成比例尺校准（两点定距）。
2. 左侧选择工具，在画布上放置点设备、绘制区域/折线，或直接编辑矢量场地。
3. 右侧属性面板调整参数；顶栏「导出」选择 JSON / PNG / SVG / PDF / DXF / CSV / XLSX。

完整操作见 [用户指南](docs/user-guide.md)。

## 能力概览

| 方向 | 能力 | 细节 |
| --- | --- | --- |
| 图纸底座 | 图片底图（校准/仿射/整体变换）与矢量场地（矩形/圆/椭圆/扇形/平行四边形/多边形）双槽共存 | [features](docs/features.md) |
| 标注对象 | 点设备、区域、折线、文字、距离/面积/角度标注；对象编号与图上标注可逐项开关 | [features](docs/features.md) |
| 编辑辅助 | 选择/框选/多选、节点编辑、对齐分布、批量编号、网格与对象捕捉、极轴追踪、撤销重做 | [user-guide](docs/user-guide.md) |
| 分析 | 视场覆盖率（解析面积 + 栅格覆盖，口径 v3）、布点优化、停车规划、几何规则检查（重叠/最小间距/越界） | [features](docs/features.md) |
| 数据管理 | 多工程库、楼层、产品目录、版本快照与 A/B 差异、CSV/TSV/XLSX 表格导入 | [features](docs/features.md) |
| 协作 | 同机多标签 BroadcastChannel、跨设备 WebRTC 邀请串；离线 JSON 合并采用 LWW + 墓碑 | [ARCHITECTURE](docs/ARCHITECTURE.md) |
| 安全边界 | CSP、文本/属性转义、类型图标白名单、CSV/XLSX 公式注入防护、插件 Worker 隔离 | [ARCHITECTURE](docs/ARCHITECTURE.md)§10 |
| 交付 | JSON / PNG / SVG / PDF / DXF / CSV / TSV / XLSX / GeoJSON；单文件 HTML 发行包 | [user-guide](docs/user-guide.md) |

## 本地开发与门禁

需要 Node.js 运行脚本（仓库未在 `package.json` 声明 `engines`，最低版本以实际运行环境为准）。浏览器测试使用 Playwright，属开发期可选依赖，不进入发行包。

```powershell
npm run test          # 公共模块接线自检 + 逻辑层自测
npm run lint          # 13 步工程质量门禁（不含 --selftest）
node scripts/check.mjs --selftest
npm run ci            # check --selftest → bench → build --check → gates
npm run test:e2e      # 真实 Chromium e2e（需先装 Playwright）
npm run perf:browser  # 真实 Chromium 性能基线（可选）
npm run discipline    # 方法论自检看板
# 4048 assertions, no dependencies
```

`node scripts/check.mjs` 当前覆盖 13 步：语法、入口资源完整性、脚本被入口引用、离线承诺、断言数一致、契约判据、对外 API 面、删除账本、状态写入口 / 跨层耦合计数 / 必需钩子配对 / 软调用登记（第 9 步拆为 9.1～9.4）、`--selftest`、i18n 覆盖率、Service Worker 缓存版本、CSS 结构。

- **状态只有一个写入口**：`replaceState(next, opts)` 统一完成赋值、活动层重别名、叠放缓存失效、静态层重建、取景复位、UI 与底图更新；`quiet` 只用于启动装载与纯迁移。门禁 9.1 扫描 `state` 直接赋值，只放行 `model.js` 的声明与 `replaceState()` 内部。
- **依赖是显式的**：6 个必需钩子缺注册时，`assertHooksReady()` 在 `init()` 首行直接抛错，而不是静默 no-op——起不来比悄悄不保存好。耦合与软调用基线见 `contracts/coupling.json`，按文件+符号+次数严格相等，只减不增。

> **CI 现状（2026-11-13 核查）**：`.github/workflows/ci.yml` 与 `perf-nightly.yml` 已挂载到 GitHub Actions 并实际运行——CI 运行 60 次、全部失败（`test` 与两个 `e2e` job 为红），`Perf Nightly` 0 次，`pages-build-deployment` 87 次。**Actions 在跑但全红，不作发布门禁**：门禁以本地为准，逐条命令与期望值见 [release-checklist](docs/release-checklist.md)。

- **性能门禁必须有数据**：`scripts/bench.mjs` 的 P95 / heapUsed / 静态重建阈值不达标即红；涉及渲染或历史栈的改动需同时跑对应基准。
- **门禁不达标不提交**：不得放宽阈值、删除断言或跳过用例来“转绿”。
- **文档与代码同步**：改业务逻辑的同一批改动内更新对应文档与 `CHANGELOG.internal.md`。

## 目录结构

```text
index.html                 唯一入口（页面 + 47 个脚本加载顺序）
sw.js                      离线缓存（仅 http/https 注册；file:// 不注册）
manifest.webmanifest       PWA 清单
icon.svg                   应用图标
js/common/                 公共层：零 DOM 的纯逻辑与 vendor 适配器（9 个）
js/core/                   核心层：状态、几何、渲染、交互、持久化、启动（14 个）
js/features/               特性层：UI、导入导出、规则、协作、插件等（14 个）
ngm.vendor/                @idcu/* 源码形式的第三方能力（10 个直接加载，另有 1 个间接依赖）
ngm.json / ngm.lock / .ngm-version
                           第三方依赖声明、字节锁与工具链版本
scripts/                   零依赖工程脚本（19 个 .mjs + lib/ 3 个 + dist-manifest.json）
tests/                     e2e / fixtures / golden / perf（65 个文件）
contracts/                 可机器校验的约定（插件 API、适配器、工程约定）
docs/                      架构、数据模型、模块、特性、用户、工程、测试、性能、问题、验收、运维与计划
CHANGELOG.internal.md      内部追溯：提交、改动点、实测数据、遗留风险
```

逐文件职责、接口、依赖与已知坑见 [模块目录](docs/modules.md)。

## 文档地图

| 文档 | 回答什么问题 |
| --- | --- |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | 分层与真实依赖、坐标系、双槽位、历史栈、渲染缓存、协作与安全边界、扩展点 |
| [DATA-MODEL](docs/DATA-MODEL.md) | 状态结构、schema 兼容、存储键位、写入/读取链、迁移、资产 GC、合并、导入导出 |
| [modules](docs/modules.md) | 每个 JS / 脚本 / 测试文件的职责、接口、依赖、不变量与坑 |
| [features](docs/features.md) | 功能边界与行为口径 |
| [user-guide](docs/user-guide.md) | 面向使用者的操作说明 |
| [engineering](docs/engineering.md) | 构建、门禁逐条约束、体积预算、发布、CI 现状 |
| [testing](docs/testing.md) | 自测与 e2e 的覆盖范围、运行方式、证据口径、未覆盖项 |
| [performance](docs/performance.md) | Node 桩基准与浏览器基线的口径、阈值、测量命令 |
| [known-issues](docs/known-issues.md) | 未关闭限制、待确认项与外部条件依赖 |
| [known-issues-archive](docs/known-issues-archive.md) | 历史修复的可检索归档（按模块/主题索引 + 一句话结论） |
| [manual-acceptance](docs/manual-acceptance.md) | 发布前人工验收清单与历史结论 |
| [release-checklist](docs/release-checklist.md) | 发布、验证、回滚清单 |
| [control-plane](docs/control-plane.md) | 不依赖转述判断状态：读数字的命令、决策边界、如何反向验证门禁 |
| [deletions](docs/deletions.md) | 结构性删除账本 |
| [facts](docs/facts.md) | 所有易变数字的唯一快照与取数命令 |
| [plans](docs/plans/README.md) | 计划索引、推进约定与 [下一阶段路线图](docs/plans/next-phase-2026-11.md) |
| [contracts](contracts) | 插件 API、适配器、工程约定的机器可读版本 |

## 仓库红线

- **单文件产物上限 839,680 B（820 KiB）**。超出必须压缩或回收，不得提高上限；余量低于 8,000 B 时先停功能开发做回收。
- **只允许本地提交，禁止 `git push`**，除非当前任务被明确授权。
- **禁止读取或修改仓库根目录的 `camera-*` 文件**。
- **门禁不达标不得提交**：不伪造日志、不伪造测试数据、不为转绿放宽阈值。
- **不新增运行时依赖**；Playwright 仅限开发期。
- **公共 API 与调用方签名保持兼容**；行为变更必须显式说明影响范围。

## 已知限制

- **PDF 默认导出是整页位图**（图纸位图 + 清单）；另有显式矢量选项 `PDF（矢量·文字为位图）`：对象轮廓与尺寸线为矢量，底图/文字/点位/标题栏为位图，文字不可选不可搜、放大发虚，>300 标签自动降 150 DPI。纯矢量交付建议 SVG 或 DXF。
- **DXF 中符号按折线近似**；画布/SVG/PNG/PDF 使用同一路径源，DXF 属明确的降级表达。
- **旧版兼容未实测**：当前版本可读 v1、写入 v2；旧版 App 是否拒绝 v2、忽略 `site` 后回写丢失场地，未在本次复核中验证。
- **几何规则检查不是消防/规范审图**：不内置任何规范数值，阈值由用户填写。
- **覆盖率是栅格法估算**：当前报告口径为 v3（解析区域面积 × 栅格覆盖比例，与视口缩放无关）；v1/v2 历史报告数值不可直接对比。
- **跨浏览器未验证**：当前自动化入口与证据只有 Chromium；Firefox/WebKit/Safari 未在本次复核中运行，不写成“已支持”。
- **真机与双设备 WebRTC 未验证**：现有 e2e 覆盖双标签通道，不等同于真实双设备验证。
- 其他未关闭项见 [known-issues](docs/known-issues.md)。

## 数字口径

所有易变数字以 [docs/facts.md](docs/facts.md) 为准；核心命令：

```powershell
node scripts/badge.mjs --check          # 断言数 + 文档计数锚点
node scripts/build.mjs --check          # 产物字节/gzip（读 scripts/dist-manifest.json）
node scripts/check-sw.mjs               # SW VERSION 与预缓存指纹
node scripts/selftest.mjs --list        # 分区数/分区名
node scripts/i18n-scan.mjs --check      # i18n 覆盖率
```

## 许可证

[MIT](LICENSE)
