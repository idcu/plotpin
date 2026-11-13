# 发布门禁清单（本地为准）

> **当前没有 CI 在运行。** `.github/workflows/ci.yml` 与 `perf-nightly.yml` 是已就绪的**定义存档**：
> 仓库唯一 remote 是 `git@gitee.com:idcu/plotpin.git`，没有 GitHub 仓库与 Actions 运行条件（2026-11-13 决策 D2）。
> 因此每次发布/合并前，必须在本机按本清单逐条执行并**核对数字**，不能只看退出码。
> 期望值基线日期：**2026-11-13**；数字来自 [facts.md](facts.md)，变化时同一次提交内更新两处。

## 1. 必跑（缺一不可）

| # | 命令 | 期望结果（2026-11-13 基线） |
|---|---|---|
| 1 | `npm run ci` | exit 0。内含：`check.mjs --selftest`（**3,979 通过 / 0 失败**，加载 47 个脚本）、`bench.mjs`（各阈值全绿）、`build.mjs --check`（**745,081 B ≤ 839,680 B**，gzip 242,155 B ≤ 286,720 B，余量 94,599 B，SHA256 与 `scripts/dist-manifest.json` 一致，二次构建一致）、`check-gates.mjs`（正面基线 **6/6** + 人为破坏 **13/13**） |
| 2 | `node scripts/check-contracts.mjs` | `contracts: 11 项核对，0 处违约` |
| 3 | `node scripts/check-plugin-api.mjs` | `24 个键，清单 24 条，0 处泄漏，0 处落空`；API 1.1.0 / 8 项能力 |
| 4 | `node scripts/check-sw.mjs` | `VERSION=183`，52 个预缓存输入与 `scripts/sw-inputs.sha256` 一致；改了 `js/**` 等预缓存输入必须先 bump `VERSION` 再 `--update` |
| 5 | `node scripts/e2e.mjs`（源码入口 4173） | **150 passed / 0 failed / 1 skipped，exit 0**（跳过项为 `COLLAB_SOAK=1` 才跑的协作 soak） |
| 6 | `$env:E2E_ENTRY='dist'; $env:E2E_PORT='4174'; node scripts/e2e.mjs`（dist 入口） | **149 passed / 0 failed / 2 skipped，exit 0**（另 1 条跳过为 `sw.spec` 单文件版豁免）；执行后清理这两个环境变量 |
| 7 | `node scripts/badge.mjs --check` | exit 0：README 三处断言数锚点一致（当前 3979） |
| 8 | `node scripts/check-discipline.mjs --strict` | **13/13 → L4**，exit 0 |
| 9 | `node scripts/size-report.mjs` | 打印 dist raw / gzip / 余量；与第 1 条数字一致（当前 745,081 B / 242,155 B / 94,599 B） |

`node scripts/check-ngm.mjs`（vendor ↔ `ngm.json` ↔ `ngm.lock` ↔ 实际字节）不在 `npm run ci` 内，
但改动 `ngm.vendor/**` 或锁文件时必须单独跑，期望 `0 error(s)`。

## 2. 按改动类型追加

| 改动 | 追加命令 | 期望 |
|---|---|---|
| `js/**`、`css/**`、`index.html` | 先 `node scripts/build.mjs` 刷新登记，再跑第 1 条 | 第 1 条全绿；构建后重算 CSP 哈希由脚本完成 |
| 预缓存输入（`js/**`、`css/**`、`sw.js`、`index.html` 等） | `node scripts/check-sw.mjs --update` 后跑第 1 条 | 清单与当前输入一致 |
| 渲染 / 历史栈 / 覆盖率 / 规则 | `node scripts/bench.mjs` | 缓存帧 P95 ≤3 ms、avg ≤8 ms、重建 ≤60 ms、heapUsed ≤64 MB、裁剪 ≥60%、覆盖率 ≤300 ms |
| 跨浏览器声明 | `node scripts/e2e.mjs --browser=firefox` 与 dist 入口同参数 | 源码 149/0/2、dist 148/0/3，均 exit 0（2026-11-13 实测；dist 曾有 1 项偶发，复跑通过） |
| 导出/打印/图框 | 人工打开产物核对（PDF 页数/页序、CSV/XLSX 可打开） | 见 [manual-acceptance.md](manual-acceptance.md) |

## 3. 失败处理

- **红了不发**：不得放宽阈值、删除断言、跳过用例来"转绿"；先修因，再复跑整条清单。
- **跳过 ≠ 通过**：`scripts/e2e.mjs` 缺 Playwright/Chromium 时退 **2**（不是 0），必须补依赖重跑。
- **数字对不上也发**：退出码 0 但产物字节、断言数、gzip、余量与上表不符时，视为未通过——先确认是否同一次提交内的合法变化，并把新基线写进 [facts.md](facts.md)。
- 记录方式：在发布说明里贴每条命令的退出码与关键数字（至少第 1、5、6、8 条）。
