# 图钉 PlotPin

**离线、零依赖、双击即用的通用图纸标注工具**

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![offline](https://img.shields.io/badge/offline-100%25-orange.svg)](#)
[![test](https://img.shields.io/badge/selftest-2914%20assertions-brightgreen.svg)](scripts/selftest.mjs)

PlotPin 是一个在浏览器里运行的图纸标注工具：在一张图片底图或矢量场地上放置设备点位、按真实比例绘制区域与折线、测量与标注尺寸，并把图纸和台账导出为常见格式。运行时不需要安装、服务器或网络；入口是仓库根目录的 `index.html`，托管到静态服务器时由 `sw.js` 提供离线缓存。

当前共 **2914 项断言全部通过**。

> 文档口径：行为以代码为准。本文只做入口索引，不重复实现细节；易漂移的数字统一指向单一来源（见[数字口径](#数字口径)），不在此处复制多个版本。最后核对日期：2026-11-08。

## 这是什么

- **点位与范围分开表达**：点设备回答"设备在哪里"，图标屏幕大小固定；区域/折线回答"实际占多大范围"，始终按世界坐标（米）绘制，缩放时与底图同比例。
- **双槽位**：每个楼层可同时保存 1 张图片底图和 1 个矢量场地，两者独立替换、互不覆盖；场地不进入对象列表，不占对象编号，也不出现在 CSV/XLSX 行中。
- **数据留在本机**：工程写入 IndexedDB（不可用时降级 localStorage），底图与照片按内容哈希存入资产库。默认不上传任何数据；实时协作只在手动建连时通过浏览器通道传输工程快照。
- **运行时零外部依赖**：不引用 npm、CDN 或后端。第三方能力以 `@idcu/*` 源码放在 `ngm.vendor/`，版本由 `ngm.lock` 与 `.ngm-version` 锁定；`node scripts/check.mjs` 会校验入口没有任何远程资源。

`index.html` 是唯一入口：35 个项目脚本（`js/common` → `js/core` → `js/features`）加 10 个 vendor 脚本，共 45 个 classic `<script>`，按顺序加载并共享全局作用域，不使用 ES Module；`js/core/app.js` 最后加载并完成启动。

## 快速开始

### 方式一：直接双击

双击 `index.html` 即可使用，不需要构建或安装依赖。

浏览器在 `file://` 下可能禁用 IndexedDB 与 Service Worker。PlotPin 会探测能力并显式降级（IndexedDB 不可用时回退 localStorage，Service Worker 不注册），不是静默失败。

### 方式二：本地静态服务器

需要完整持久化能力、离线缓存或跑浏览器测试时，使用仓库自带的零依赖服务器：

```powershell
node scripts/serve.mjs
# 默认 http://127.0.0.1:4173；可用 HOST / PORT 环境变量覆盖
```

### 30 秒上手

1. 顶栏「导入」选择图片底图或 DXF/PDF 文件；有图片时先完成比例尺校准（两点定距）。
2. 左侧选择工具，在画布上放置点设备、绘制区域/折线，或直接编辑矢量场地。
3. 右侧属性面板调整参数；顶栏「导出」选择 JSON / PNG / SVG / PDF / DXF / CSV / XLSX。

完整操作说明见 [用户指南](docs/user-guide.md)。

## 能力概览

| 方向 | 能力 | 细节 |
| --- | --- | --- |
| 图纸底座 | 图片底图（校准/仿射/整体变换）与矢量场地（矩形/圆/椭圆/扇形/平行四边形/多边形）双槽共存 | [features](docs/features.md) |
| 标注对象 | 点设备、区域、折线、文字、距离/面积/角度标注；对象编号与图上标注可逐项开关 | [features](docs/features.md) |
| 编辑辅助 | 选择/框选/多选、节点编辑、对齐分布、批量编号、网格与对象捕捉、极轴追踪、撤销重做 | [user-guide](docs/user-guide.md) |
| 分析 | 视场覆盖率（固定格数口径 v2）、布点优化、停车规划、几何规则检查（重叠/最小间距/越界） | [features](docs/features.md) |
| 数据管理 | 多工程库、楼层、产品目录、版本快照与 A/B 差异、CSV/TSV/XLSX 表格导入 | [features](docs/features.md) |
| 协作 | 同机多标签 BroadcastChannel、跨设备 WebRTC 邀请串；离线 JSON 合并采用 LWW + 墓碑 | [ARCHITECTURE](docs/ARCHITECTURE.md) |
| 安全边界 | CSP、文本/属性转义、类型图标白名单、CSV/XLSX 公式注入防护、插件 Worker 隔离 | [features](docs/features.md) |
| 交付 | JSON / PNG / SVG / PDF / DXF / CSV / TSV / XLSX / GeoJSON；单文件 HTML 发行包 | [user-guide](docs/user-guide.md) |

## 本地开发与门禁

需要 Node.js 运行脚本（仓库未在 `package.json` 中声明 `engines`，最低版本待确认）。浏览器测试使用 Playwright，属开发期可选依赖，不进入发行包。

```powershell
npm run test          # 公共模块接线自检 + 逻辑层自测
npm run lint          # 12 步工程质量门禁（不含 --selftest）
node scripts/check.mjs --selftest
npm run ci            # check --selftest → bench → build --check → gates
npm run test:e2e      # 真实浏览器 e2e（需先装 Playwright）
npm run perf:browser  # 真实 Chromium 性能基线（可选）
npm run discipline    # 方法论自检看板
# 2914 assertions, no dependencies
```

`node scripts/check.mjs` 当前覆盖 12 步：语法、入口资源完整性、脚本被入口引用、离线承诺、断言数一致、契约判据、对外 API 面、删除账本、模块分层、`--selftest`、i18n 覆盖率、Service Worker 缓存版本。CI 另外串行执行 `bench`、`build --check`、`check-gates`、`check-ngm` 与 `check-discipline`。

- **性能门禁必须有数据**：`scripts/bench.mjs` 的 P95 / heapUsed / 静态重建阈值不达标即红；涉及渲染或历史栈的改动需同时跑对应基准。
- **门禁不达标不提交**：不得放宽阈值、删除断言或跳过用例来"转绿"。
- **文档与代码同步**：改动业务逻辑的同一个提交内更新对应文档与 `CHANGELOG.internal.md`。

## 目录结构

```text
index.html                 唯一入口（页面 + 45 个脚本加载顺序）
sw.js                      离线缓存（仅 http/https 注册；file:// 不注册）
manifest.webmanifest       PWA 清单
icon.svg                   应用图标
js/common/                 公共层：零 DOM 的纯逻辑与 vendor 适配器（8 个）
js/core/                   核心层：状态、几何、渲染、交互、持久化、启动（13 个）
js/features/               特性层：UI、导入导出、规则、协作、插件等（14 个）
ngm.vendor/                @idcu/* 源码形式的第三方能力（10 个模块）
ngm.json / ngm.lock / .ngm-version
                           第三方依赖声明、字节锁与工具链版本
scripts/                   零依赖工程脚本（19 个 .mjs + dist-manifest.json）
tests/                     e2e / fixtures / golden / perf（45 个文件）
contracts/                 可机器校验的约定（插件 API、适配器、工程约定）
docs/                      架构、模块、特性、用户、工程、测试、性能、已知问题
audit-out/                 本轮审计报告（过程材料，不是产品文档）
CHANGELOG.internal.md      内部追溯：提交、改动点、实测数据、遗留风险
```

逐文件职责、接口、依赖与已知坑见 [模块目录](docs/modules.md)。

## 文档地图

| 文档 | 回答什么问题 |
| --- | --- |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | 分层与数据流、坐标系、双槽位、历史栈、渲染缓存、持久化、协作合并、扩展点 |
| [modules](docs/modules.md) | 每个 JS/脚本/测试文件的职责、接口、依赖、不变量与坑 |
| [features](docs/features.md) | 21 节特性的完整边界与实现口径 |
| [user-guide](docs/user-guide.md) | 面向使用者的操作说明 |
| [engineering](docs/engineering.md) | 工程结构、构建/门禁/测试矩阵、改动检查表 |
| [testing](docs/testing.md) | 自测与 e2e 的覆盖范围、运行方式、证据口径 |
| [performance](docs/performance.md) | Node 桩基准与真实浏览器基线的口径、阈值、数据 |
| [known-issues](docs/known-issues.md) | 未关闭限制、待确认项与外部条件依赖 |
| [deletions](docs/deletions.md) | 结构性删除账本 |
| [manual-acceptance](docs/manual-acceptance.md) | 发布前人工验收清单与 [2026-11-07 报告](docs/manual-acceptance-report-2026-11-07.md) |
| [plans](docs/plans/README.md) | 阶段计划索引与 [下一阶段任务](docs/plans/next-phase-2026-11.md) |
| [contracts](contracts) | 插件 API、适配器、工程约定的机器可读版本 |

## 仓库红线

- **单文件产物上限 839,680 B（820 KiB）**。超出必须压缩或回收，不得提高上限。
- **只允许本地提交，禁止 `git push`**，除非当前任务被明确授权。
- **禁止读取或修改仓库根目录的 `camera-*` 文件**。
- **门禁不达标不得提交**：不伪造日志、不伪造测试数据、不为转绿放宽阈值。
- **不新增运行时依赖**；Playwright 仅限开发期。
- **公共 API 与调用方签名保持兼容**；行为变更必须显式说明影响范围。

## 已知限制

- **PDF 导出是整页位图**，不是矢量 PDF；需要矢量交付时使用 SVG 或 DXF。
- **DXF 中符号按折线近似**；画布/SVG/PNG/PDF 使用同一路径源，DXF 属明确的降级表达。
- **旧版兼容未实测**：当前版本可读 v1、写入 v2；旧版 App 是否拒绝 v2、忽略 `site` 后回写丢失场地，未在本次复核中验证。
- **几何规则检查不是消防/规范审图**：不内置任何规范数值，阈值由用户填写。
- **覆盖率是栅格法估算**：报告口径为 v2（固定目标格数、与视口缩放无关）；v1 历史报告数值不可直接对比。
- **真机与双设备 WebRTC 未验证**：现有 e2e 覆盖双标签通道，不等同于真实双设备验证。
- 其他未关闭项与外部条件依赖见 [known-issues](docs/known-issues.md)。

## 数字口径

| 指标 | 单一来源 | 采集/校验方式 |
| --- | --- | --- |
| 自测断言数 | `scripts/selftest.mjs` + `scripts/badge.mjs` | `node scripts/badge.mjs --check`；当前 2914，README 徽章/正文由脚本注入校验 |
| 单文件产物体积 | `scripts/dist-manifest.json` | `node scripts/build.mjs --check`；2026-11-08 读取为 804,838 B（gzip 250,254 B），上限 839,680 B |
| e2e 用例 | `tests/e2e/*.spec.mjs` | `node node_modules/@playwright/test/cli.js test --list`；2026-11-08 实测 35 个 spec / 106 个用例（105 通过，1 个条件跳过），以当次 `--list` 为准 |
| i18n 覆盖率 | `scripts/i18n-scan.mjs` | `node scripts/i18n-scan.mjs --check` |
| Service Worker 缓存版本 | `sw.js` 的 `VERSION` | 预缓存输入的内容指纹必须与提交入库的 `scripts/sw-inputs.sha256` 一致；输入变更未递增 `VERSION` 即失败，干净检出下同样有效（bump 后运行 `node scripts/check-sw.mjs --update`） |
| 第三方模块版本 | `ngm.lock` / `.ngm-version` | `node scripts/check-ngm.mjs` |

## 许可证

[MIT](LICENSE)
