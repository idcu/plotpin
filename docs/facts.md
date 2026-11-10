# 事实源（FACTS）

> 本文件是仓库内**数量类指标的唯一事实源**。其他文档只引用本文件，不复制具体数字；历史文档中的旧值一律标注「历史值」。
> 采集日期：2026-11-08；代码基线：`8a9314b`（C 类 IO-P2-20 多页 PDF 单页化、RT-P2-12 未配置阈值计数的代码 HEAD）；N-25～N-27 收口段与 P2 批次 1~11（B 类文档、表格往返、DXF/PNG 一致性、核心瞬态边界、核心 schema/安全、快照/协作、插件沙箱、规则/统计、目录/停车/UI、代码卫生/i18n、性能打点）、批次 11 修复（CORE-P2-3 历史内存、IO-P2-11 导出去重）在其上增量修订，数值以最近一次门禁实测为准。
> 采集环境：本机 Windows + Node（selftest/门禁）+ Playwright Chromium（e2e）。
> 边界：性能读数（P95 / heapUsed）以 [performance.md](performance.md) 为准；`CHANGELOG.internal.md` 与本地未跟踪的 `audit-out/` 是历史/过程材料，其中数字不代表当前状态。

## 1. 构建产物

| 指标 | 当前值 | 采集命令 | 说明 |
|---|---|---|---|
| 单文件产物字节 | 834,593 B | `node scripts/build.mjs --check`；精确值见 `scripts/dist-manifest.json` 的 `bytes` | 二次构建确定性一致 |
| gzip 字节 | 259,923 B | 同上（`gzipBytes`） | 硬上限 286,720 B，>266,240 B 预警 |
| 体积上限 | 839,680 B（820 KiB） | `scripts/lib/budget.mjs` 的 `MAX_BYTES` / `scripts/dist-manifest.json` 的 `maxBytes` | 不得放宽；两处必须一致 |
| 体积余量 | 5,087 B | 上限 − 当前值（<8,000 警告、<6,000 强警告） | 任何提交后复测 |
| Service Worker 版本 | `VERSION=128` | `node scripts/check-sw.mjs`（经 `check.mjs` 总闸） | 49 个预缓存输入与 `scripts/sw-inputs.sha256` 一致 |

## 2. 测试与门禁

| 指标 | 当前值 | 采集命令 | 说明 |
|---|---|---|---|
| selftest 断言 | 3641 通过 / 0 失败 | `node scripts/check.mjs --selftest` | 断言数不得减少 |
| selftest 分区 | 136 个 | `node scripts/selftest.mjs --list` | 输出 137 行（含 1 行标题） |
| 加载脚本 | 45 个（35 项目 + 10 vendor） | `check.mjs` 输出「加载 45 个脚本」 | `js/` 下 35 个 `.js` |
| e2e 用例 | 124 个（123 通过 + 1 条件跳过） | `node scripts/e2e.mjs`；`node node_modules/@playwright/test/cli.js test --list` | 跳过项为 `COLLAB_SOAK=1` 才执行的协作 soak |
| e2e spec 文件 | 35 个 | `Get-ChildItem tests/e2e -Filter *.spec.mjs` | `tests/e2e/` 下共 37 个 `.mjs`（35 个 spec + 2 个 helper） |
| 契约判据 | 11 项核对 / 0 违约 | `node scripts/check.mjs --selftest` | `contracts/`；含 4 项结构校验（规则删空即红） |
| 插件 API 面 | 23 键 / 清单 23 条 / 0 泄漏 / 0 落空 | `node scripts/check.mjs --selftest` | API 1.1.0 / 8 项能力 |
| i18n 覆盖率 | 45.97% / 缺口 10 / UI 硬编码 1 / 模板内 0 | `node scripts/i18n-scan.mjs --check` | 阈值 ≥40%、缺口 ≤10、UI ≤20、模板内 =0 |
| i18n 字典规模 | PHRASES 1007 / TEMPLATES 112 / DICT.zh 193 | 同上 | |
| 门禁牙齿 | 正面基线 6/6 + 人为破坏 12/12 | `node scripts/check-gates.mjs` | 场景只断言非 0 且命中目标关键字；第 10/11 场景为契约清空 / 未 bump 就 `--update` |
| 方法论纪律 | 13/13（`--strict` L4） | `node scripts/check-discipline.mjs --strict` | |
| Node bench（桩） | heapUsed 31.43 MB；缓存帧 P95 0.12 ms；静态重建 26.68 ms；覆盖率 9.2 ms；规则 15.5 ms | `node scripts/bench.mjs` | **Node 桩数据，不能作为浏览器性能结论** |

## 3. Golden 基线

| 文件 | 字节 | 采集命令 |
|---|---|---|
| `tests/golden/fixed-pages.pdf` | 1,128 | `Get-ChildItem tests/golden`；selftest 逐字节比对 |
| `tests/golden/plain-scene.csv` | 631 | 同上（N-26 新增；P2 批次 2 改为 CRLF 行尾） |
| `tests/golden/plain-scene.tsv` | 629 | 同上（N-26 新增；P2 批次 2 改为 CRLF 行尾） |
| `tests/golden/plain-scene.xlsx` | 9,804 | 同上（N-26 新增，ZIP 容器；P2 批次 2 角度列按精度格式化） |
| `tests/golden/blindspots.geojson` | 769 | 同上（N-26 新增） |
| `tests/golden/plain-scene.png.meta.json` | 36 | e2e 语义 golden（PNG 签名 + 宽 2631 / 高 1860；不锁编码字节） |
| `tests/golden/legacy-symbols.svg` | 56,839 | 同上 |
| `tests/golden/plain-scene.dxf` | 900 | 同上 |
| `tests/golden/plain-scene.svg` | 4,730 | 同上 |
| `tests/golden/symbol-scene.dxf` | 4,753 | 同上 |
| `tests/golden/symbol-scene.svg` | 5,012 | 同上 |

## 4. 文档规模

| 指标 | 当前值 | 采集命令 | 说明 |
|---|---|---|---|
| `docs/` 根目录 Markdown | 12 篇（含本文件） | `Get-ChildItem docs -Filter *.md` | 递归含 `docs/plans/` 共 14 篇 |

## 5. 维护约定

- 新增/修改数量类指标时，只改本文件，并把其他文档里的具体数字替换为指向本文件的链接。
- 本表每一行必须能在当前仓库复跑；无法复跑的历史值不写入本文件。
- 数字变化必须由同一次提交内的命令输出支撑；禁止估算或沿用旧值。
