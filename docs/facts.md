# 事实源（FACTS）

> **用途**：易变数字的唯一集中快照。正文只写“以命令输出为准”，不复制本表的旧值。
> **取数时间**：2026-11-27；代码基线：`7562045`（双击引线文字编辑；SW 302）。本表随文档批次提交，产品代码以上述提交为准。
> **规则**：本表每一行必须能在当前仓库复跑；数字变化后同批更新本表，禁止估算。

## 1. 构建产物

| 指标 | 2026-11-26 快照 | 取数命令 | 说明 |
|---|---|---|---|
| 单文件产物字节 | 839,501 B（819.8 KB） | `node scripts/build.mjs --check`；精确值见 `scripts/dist-manifest.json` 的 `bytes` | 48 段脚本内联为 1 个 HTML；terser `ecma:2020` + `unsafe`/`unsafe_arrows`/`pure_getters` + `passes:6` + 标记层去引号/省略可选闭合标签 + i18n 默认文案去重 + 空 title/aria-label/placeholder 删除 + `data-x*` 属性缩写；工具栏改为运行时生成的分组按钮（HTML 只留空容器） |
| gzip 字节 | 274,164 B（267.7 KB） | 同上（`gzipBytes`） | 上限 286,720 B；260 KiB 预警 |
| 体积上限 | 839,680 B（820 KiB） | `Select-String -Path scripts/lib/budget.mjs -Pattern 'MAX_BYTES'` | 唯一来源；`dist-manifest.json` 的 `maxBytes` 必须一致 |
| 体积余量 | 179 B（gzip 余量 12,556 B） | 上限 − 当前字节 | <8,000 B 警告、<6,000 B 强警告 |
| Service Worker 版本 | `VERSION=302` | `node scripts/check-sw.mjs` | 预缓存输入与 `scripts/sw-inputs.sha256` 一致 |

## 2. 测试与门禁

| 指标 | 2026-11-26 快照 | 取数命令 | 说明 |
|---|---|---|---|
| selftest 断言 | 4,576 通过 / 0 失败 | `node scripts/check.mjs --selftest` | 断言数不得减少；2026-11-26 在 4,567 上补场地顶点 9 条（抓手排序生效 / 锁定后几何入口拒绝且锁定开关可用） |
| selftest 分区 | 176 个 | `node scripts/selftest.mjs --list` | 输出 177 行（含 1 行标题） |
| 加载脚本 | 48 个（38 项目 + 10 vendor） | `node scripts/check.mjs --selftest` 输出「加载 48 个脚本」 | `js/` 下 38 个 `.js` |
| e2e spec 文件 | 49 个 | `Get-ChildItem tests/e2e -Filter *.spec.mjs` | `tests/e2e/` 顶层共 51 个 `.mjs`（49 spec + `helpers.mjs` + `toolbar.mjs`） |
| e2e 用例 | 203 个（源码 200 通过 + 0 失败 + 3 条件跳过；dist 197 通过 + 6 跳过） | `node scripts/e2e.mjs`；`$env:E2E_ENTRY='dist'; node scripts/e2e.mjs` | 2026-11-27 双入口全量实跑：源码 3.9m、dist 3.7m，均 exit 0；跳过为协作 soak（需 `COLLAB_SOAK=1`）与 V-6/V-6b（缺 `pdftotext`）；dist 额外跳过 3 条依赖源码结构的用例。默认 Chromium；Firefox 5 条核心为非门禁证据（[testing](testing.md)§3.4），不构成支持承诺 |
| 契约判据 | 11 项核对 / 0 违约 | `node scripts/check-contracts.mjs` | 规则删空即红 |
| 插件 API 面 | 31 键 / 31 条清单 / 0 泄漏 / 0 落空 | `node scripts/check-plugin-api.mjs` | 词法器 + fail-closed；API 1.1.0 / 8 项能力 |
| 耦合基线 | `core→features` 21 条（合计 89 次）/ `common→core` 3 条 / 软调用 13 条（5+2+5+1） | `node -e "const c=require('./contracts/coupling.json');…"`；以文件为准 | 按文件+符号+次数严格相等，只减不增 |
| 必需钩子 | 13 个提供方 / 13 个被调钩子 / 29 处调用 / 8 个必需 | `node scripts/check.mjs`（9.3） | 缺注册时 `assertHooksReady()` 启动即抛错 |
| 门禁牙齿 | 正面基线 10/10 + 人为破坏 20/20 | `node scripts/check-gates.mjs` | 只断言非 0 且命中目标关键字；i18n 探针数按当前覆盖率动态计算 |
| 方法论纪律 | 13/13（L4） | `node scripts/check-discipline.mjs --strict` | 含文档命令可解析、单文件 ≤60KB/600 行 |
| i18n 扫描 | 覆盖率 47.82% = 887 / 1,855 / 缺口 1 / UI 硬编码 18（全仓未走入口 967，未字典化 579，UI 已字典待接入 76，阈值 76） | `node scripts/i18n-scan.mjs --check` 或 `--json` | 口径见 [engineering](engineering.md)§4.6：分母是含 CJK 的出现次数，18 只是 964 的 UI 子集；缺口 1 是 `collab.js` 的拼接片段 `' 等 {n} 项'`，非整句文案；阈值 ≥40%、缺口 ≤10、UI 硬编码 ≤20、已字典待接入 ≤76、模板内 =0 |
| Node bench（桩） | 以命令为准 | `node scripts/bench.mjs` | Node 桩数据，不能替代浏览器性能结论 |

## 3. 文档规模

| 指标 | 2026-11-15 快照 | 取数命令 | 说明 |
|---|---|---|---|
| `docs/` 根目录 Markdown | 15 篇 | `Get-ChildItem docs -Filter *.md` | 含本文件、`release-checklist.md`、`control-plane.md`、`known-issues-archive.md` |
| 递归 Markdown | 17 篇 | `Get-ChildItem docs -Recurse -Filter *.md` | 含 `docs/plans/` 2 篇；上限 18 |

## 4. Golden 基线

文件清单与字节以命令输出为准，不在此表复制：

```powershell
Get-ChildItem tests/golden | Select-Object Name, Length
```

selftest 对固定 golden 做逐字节或语义比对；PNG 使用 `.meta.json` 记录签名与宽高，不锁编码字节。

## 5. 维护约定

1. 新增/修改数量类指标时，只改本文件，并把其他文档里的具体数字替换为命令或指向本文件的链接。
2. 每行都必须有可复跑命令；无法复跑的历史值不写入本表。
3. 数字变化必须由同一次运行输出支撑；不同批次的数据不得拼在一张表里。
4. 断言数、分区数、加载脚本数、e2e spec 数、`check.mjs` 步数由 `badge.mjs` 自动校验，改文档时保持锚点句式。
