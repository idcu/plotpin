# 人的控制面（HUMAN CONTROL PLANE）

> **目的**：让不依赖 AI 转述的开发者，用**命令与读数**判断「项目现在绿不绿、体积余量还剩多少、下一个要拍板的是什么」。
> **只写四件事**：状态读取、边界、证据可信、人的动作；末尾是验收标准。
> **不记录会过期的具体数值**：任何数字以命令现场输出为准；文档里的旧数字一律视为过期。
> 数字汇总归 [facts](facts.md)，发布清单归 [release-checklist](release-checklist.md)，阈值与判据归 [engineering](engineering.md)，状态与持久化归 [DATA-MODEL](DATA-MODEL.md)。

## 0. 三句话

1. **命令 > 文档数字；退出码 + 读数 > 任何人的转述。**
2. **没被反向验证过的门禁，只能算提示。**
3. **提交、放宽判据、改契约或 schema、发布——这四件事只能由人拍板。**

## 1. 状态读取

### 1.1 最小三命令

```bash
git status -sb
npm run ci
node scripts/check-discipline.mjs --strict
```

`npm run ci` 是离线总闸（`check.mjs --selftest` → `bench.mjs` → `build.mjs --check` → `check-gates.mjs`），**不等于全部门禁**：e2e、`check-ngm`、`check-discipline` 不在里面。全量以 [release-checklist](release-checklist.md)§1 为准。

**Actions 现状**：`ci.yml` 与 `perf-nightly.yml` 已挂载并实际运行，但 CI 长期全红、Perf Nightly 0 次（2026-11-13 核查）。**不作发布门禁**，本地命令才是判据。

### 1.2 哪个命令产出哪个数字

| 问题 | 命令 | 数字/结论的出处 | 可信依据与判读 |
|---|---|---|---|
| 工作区是否干净 | `git status -sb` | Git 索引与工作树本身 | 除首行分支信息外应为空；`??` 未跟踪、` M` 已改未暂存、`M ` 已暂存。“已提交”这句话不是证据，输出才是 |
| 当前基线 | `git rev-parse --short HEAD`；`git log --oneline -5` | 提交历史 | 与上一切片的收尾提交对上，才能开工 |
| 离线门禁绿不绿 | `npm run ci` | 四个脚本的退出码与逐段读数 | 必须 exit 0，且每段读数形状正确（见 §1.3） |
| 全量门禁绿不绿 | 按 [release-checklist](release-checklist.md)§1 逐条跑 | 每条命令的退出码 + 关键数字 | `npm run ci` 绿 ≠ 全量绿 |
| 断言数 / 失败数 | `node scripts/badge.mjs --check`（内含 selftest）；`node scripts/check.mjs --selftest` | `scripts/selftest.mjs` 实际结果 | 断言数不得减少；失败数必须为 0 |
| selftest 分区数 | `node scripts/selftest.mjs --list` | 脚本输出的分区清单 | 只列名称，不改断言语义 |
| 加载脚本数 | `node scripts/check.mjs --selftest` 输出「加载 N 个脚本」 | `index.html` 的脚本引用 | 数字变化意味着入口结构变了，要看 reason |
| 浏览器 e2e | `node scripts/e2e.mjs`；dist 入口见下 | Playwright 的 passed/failed/skipped | 缺依赖时脚本**退 2**（不是 0）：那是“没跑”，不是“通过” |
| 产物字节 / gzip / 余量 | `node scripts/build.mjs --check` | 从源码内存重建 + `scripts/dist-manifest.json` | 两者必须一致、二次构建同哈希；余量 = 上限 − 当前字节，三者可互相验算 |
| 体积上限与预警线 | `Select-String -Path scripts/lib/budget.mjs -Pattern 'MAX_BYTES\|GZIP_\|MARGIN_'` | `scripts/lib/budget.mjs` 常量 | **唯一来源**；`dist-manifest.json` 的 `maxBytes` 必须与它一致（`build.mjs --check` 守这条） |
| Service Worker 版本 | `node scripts/check-sw.mjs` | `sw.js` 的 `VERSION` + `scripts/sw-inputs.sha256` | 预缓存输入变了而版本没升，此命令必红 |
| 契约违约数 | `node scripts/check-contracts.mjs` | `contracts/conventions.json` | 看「N 项核对」与「0 违约」，N 不能是 0（空跑曾是假绿） |
| 耦合 / 钩子基线 | `node scripts/check.mjs`（9.2～9.4） | `contracts/coupling.json` + `REQUIRED_HOOKS` | 计数必须**严格相等**：`core→features` 21、`common→core` 3、软调用 12、必需钩子 6/6；只减不增，新增即红 |
| 状态写入口 | `node scripts/check.mjs`（9.1） | `state = ...` 扫描 | 只允许 `model.js` 声明与 `persistence.js` 的 `replaceState()`；绕过入口即红 |
| 插件 API 面 | `node scripts/check-plugin-api.mjs` | `contracts/plugin-api.json` ↔ `PlotPin` 顶层键 | 泄漏数、落空数都必须为 0 |
| 第三方依赖锁 | `node scripts/check-ngm.mjs` | `ngm.vendor/**` 实际字节 + `ngm.lock` | 改过 vendor 或重新 lock 后必跑 |
| 文档纪律档位 | `node scripts/check-discipline.mjs --strict` | 13 问逐条读数 | 低于 L3 退 1；看的是缺口编号，不是档位字母 |
| 门禁自身可信度 | `node scripts/check-gates.mjs` | 临时副本里的正面基线 + 人为破坏场景 | 只有它能回答“门禁会不会红”（见 §3） |
| 当前 known-issue 状态 | 读 `docs/known-issues.md` 的 §2～§3 | 未验证 / 限制 / 技术债三张表 | **没有门禁守**，只能人工核对；不得把“AI 说没问题”当核对 |
| 下一个待决策点 | 读 `docs/plans/README.md` 状态 + `next-phase-2026-11.md`§5 | 计划索引与路线图 | **没有门禁守**；若计划已收口，下一个决策就是“选下一阶段” |

dist 入口的 e2e：

```powershell
$env:E2E_ENTRY='dist'; $env:E2E_PORT='4174'; node scripts/e2e.mjs
Remove-Item Env:E2E_ENTRY; Remove-Item Env:E2E_PORT
```

### 1.3 判读规则（防止假绿）

- **退出码 2 = 没跑**：`e2e.mjs` / `perf-browser.mjs` 缺 Playwright 或缺 Chromium 时退 2，不得当通过。
- **skipped ≠ passed**：跳过项必须逐条有名有因；跳过数悄悄增加就是失败。
- **0 违约必须伴随 N 项核对且 N > 0**：契约规则被清空时，旧实现输出「0 项核对，0 违约」并退 0——那叫门禁被合法关掉。
- **数字必须同一次运行内自洽**：`build.mjs --check` 的字节、gzip、余量、上限必须能互相验算；对不上就是不同批次的数据。
- **文档数字只覆盖部分锚点**：`badge.mjs` 守 README 三处 + facts/testing/engineering/modules 的计数，不守产物字节、SW 版本与 known-issue 条数。发现漂移就同批修正并在提交说明里记录。
- **跨浏览器只认证据**：仓库只有 Chromium 入口；Firefox/WebKit/Safari 的“通过”若没有可复跑产物与当前命令，按未验证处理。

## 2. 边界

### 2.1 模块职责与依赖方向

| 项 | 记录在哪 | 谁来守 |
|---|---|---|
| 分层与依赖方向 | [ARCHITECTURE](ARCHITECTURE.md)§2：`common → core → features → app` | `node scripts/check.mjs` 第 9 步：目录白名单 + `index.html` 加载顺序按层非递减；9.1 状态直赋值、9.2 跨层耦合计数、9.3 钩子配对、9.4 软调用登记 |
| 逐文件职责 / 接口 / 不变量 | [modules](modules.md) | 同上；新增文件必须登记 |
| 状态、持久化与合并 | [DATA-MODEL](DATA-MODEL.md) | selftest 存储/合并分区；`check.mjs` 9.1 扫描 `state` 直赋值只放行 `replaceState()` 内部 |
| 已知盲区 | 9.2～9.4 只统计全仓唯一的顶层声明/调用；局部同名、对象键、1–2 字符标识符与 `globalThis[…]` 动态访问会漏，字段级 `state.x = …` 也不在 9.1 扫描范围 | 剩余部分靠评审。不得声称“依赖方向完全受控” |

### 2.2 对外契约

| 契约 | 内容 | 判据 |
|---|---|---|
| `contracts/conventions.json` | 版本号三处一致 / i18n 键对齐 / 文件头唯一 / 枚举同源 | `check-contracts.mjs`：先结构校验（规则被清空即红），再逐条真实核对 |
| `contracts/coupling.json` | `文件+符号+次数` 的跨层引用、软调用分类、common→core 已知违规 | `check.mjs` 9.2～9.4：严格相等、只减不增；改基线只能先减代码 |
| `contracts/plugin-api.json` | `PlotPin` 顶层键清单（唯一来源） | `check-plugin-api.mjs` 双向比对；弃用走「标记 → 保留 ≥2 个 minor → 移除并登记」三步（[engineering](engineering.md)§5.3） |
| `contracts/adapters.json` | vendor 适配器声明 | `check-ngm.mjs` 与契约核对 |

契约是**公共 API 面**：改键、删键、改语义都要先停下说明，不得自行决定（[plans/README](plans/README.md)§3.1、[engineering](engineering.md)§9）。

### 2.3 schema 冻结

- **唯一声明**：`js/core/config.js` 的 `SCHEMA` / `SCHEMA_READABLE`；文档口径见 [DATA-MODEL](DATA-MODEL.md)§3。
- **冻结的是**：schema 版本号与键布局（当前 v2，v1 只读兼容，读取时迁移并回写 v2）。
- **允许的**：读兼容、一次性迁移、在既有可选键内扩展（例如 `props` 的可选字段）。
- **禁止的**：改版本号、删改既有键、以新键替代旧键却不迁移。
- **必须变更时**：一次性迁移 + 双读兼容 + 人拍板；做不到就停，不得为省事重建库。

### 2.4 不许改的尺子

| 尺子 | 位置 | 谁能改 |
|---|---|---|
| 体积上限 / gzip 阈值 / 余量预警线 | `scripts/lib/budget.mjs`（`dist-manifest.json` 必须一致） | 人；且不得以提高上限代替回收 |
| 性能阻断阈值 | `scripts/bench.mjs`（改要写旧值、新值、理由、连续实测，见 [engineering](engineering.md)§4.3） | 人 |
| 断言数 / 跳过项 | selftest 与 e2e 实际输出 | 不得减少、不得无名跳过 |
| 禁止事项总表 | [engineering](engineering.md)§10 | 人 |

### 2.5 谁拍板

| 事项 | 约定记录在哪 | 拍板人 |
|---|---|---|
| 新增运行时依赖、破坏公共 API、放宽门禁阈值、改导出字段 | [plans/README](plans/README.md)§3.1 | 人（执行者必须先停下列选项） |
| schema 变更 / 键布局变化 | `js/core/config.js` + [DATA-MODEL](DATA-MODEL.md) | 人（且必须一次性迁移 + 双读） |
| 体积超预算、余量逼近冻结线 | `scripts/lib/budget.mjs`、[engineering](engineering.md)§2.3 | 人（执行者只能停手上报方案） |
| 进入下一阶段 / 任务顺序调整 | [plans/README](plans/README.md)、[next-phase](plans/next-phase-2026-11.md)§5 | 人 |
| 发布与推送 | [release-checklist](release-checklist.md) | 人（默认只允许本地提交） |
| 计划范围内的日常实现取舍 | 路线图正文 | 已授权给执行者，但必须留下命令与读数 |

## 3. 证据可信

### 3.1 现成的反向验证：`check-gates.mjs`

它做的事：

1. 在系统临时目录复制整仓，先要求**未破坏副本**上的同批判据全绿（正面基线）；
2. 再对 17 种人为破坏各复制一份副本、破坏、跑对应门禁，断言**退出码非 0 且输出命中目标关键字**；
3. 仓库本身一字节不动。

这正是“门禁可信”的样板：**先构造反例，再证明它会红**；没有正面基线，“变红”可能只是环境坏了。

```bash
node scripts/check-gates.mjs
```

读数含义：正面基线必须全部 ✓，17 种破坏必须全部 ✓（退出码非 0 + 命中关键字）；任一 ✗ 即失败。
局限：只覆盖已登记的破坏类型；**新增判据不会自动获得牙齿**——[engineering](engineering.md)§9 要求每条新判据配一颗牙齿。

### 3.2 人自己做一次（约 10 分钟）

不要在工作区做破坏性试验；在临时副本里做，做完直接丢弃。

```powershell
$repo = (Get-Location).Path
$tmp = Join-Path $env:TEMP ("plotpin-probe-" + [guid]::NewGuid().ToString('N'))
robocopy $repo $tmp /E /XD node_modules dist test-results .trae-html-share-packages
# robocopy 退出码 0–7 都算复制成功
Set-Location $tmp
Add-Content js/core/render.js "`n/* 探针：验证门禁会红 */"
node scripts/check-sw.mjs; "exit=$LASTEXITCODE"
Set-Location $repo
Remove-Item -Recurse -Force $tmp
```

期望：`exit` 非 0，错误行指出预缓存输入指纹/`VERSION` 不匹配。若仍为 0，**立即停止并上报**：这条判据已经失效。

其它可照此验证的组合：

| 门禁 | 破坏方式（副本内） | 期望 |
|---|---|---|
| `check-sw.mjs` | 改任一预缓存输入（如 `js/core/render.js`） | 非 0，提示指纹/`VERSION` |
| `build.mjs --check` | 先 `node scripts/build.mjs`，再改 `dist/plotpin-standalone.html` 一个字节 | 非 0，提示产物与登记值不一致 |
| `check-contracts.mjs` | 清空 `contracts/conventions.json` 的 `versionSources` | 非 0，提示契约结构非法 |
| `check.mjs --selftest` | 在 `scripts/selftest.mjs` 结果汇总前加一条必失败断言 | 非 0，失败数 +1 |
| `badge.mjs --check` | 删掉 `README.md` 里断言的徽章锚点 | 非 0，提示模板缺失 |
| `i18n-scan.mjs --check` | 在 UI 模板里写死一句中文 | 非 0，提示硬编码/模板内文案 |
| `check-ngm.mjs` | 改 `ngm.vendor/**` 任一文件一个字节 | 非 0，指出文件名 |
| `check-discipline.mjs --strict` | 在文档代码块里写一个不存在的 `scripts/nope.mjs` | 第 13 问红，退出码 1 |

**最需要反向验证的**，是那些“失效时产品照常能用”的门禁：离线承诺、SW 缓存版本、契约与插件 API 面、产物登记、文档命令可解析。格式类错误肉眼可见，承诺类失效不会有人察觉。

### 3.3 验证后怎么记录

一次一条，写清事实，不写结论句：

```text
日期 | 门禁命令 | 破坏方式 | 期望 | 实际退出码 | 关键错误行 | 还原/丢弃后复跑结果
```

记录位置：当次 `CHANGELOG.internal.md` 或发布说明；不要只留在对话里。
**发现“破坏后仍绿”时先停手**——那是判据失效，不是可以绕过的障碍。

### 3.4 为什么“AI 自己写测试、自己跑、自己宣布通过”不算证据

- 同一主体定义期望、构造输入、执行、解释结果，四步可以互相自洽；无法排除“断言恰好没覆盖真实风险”。
- 它可以用看起来合法的方式转绿：放宽阈值、加 `skip`、改断言、把失败改写成“待确认”。这些在退出码上与真通过无法区分。
- 它无法区分“没发现问题”与“没检查”：空跑也会退 0。本仓库因此要求「读数为 0 视为失败」、e2e 缺依赖退 2。
- 可复核的证据必须同时满足三条：**别人能复跑同一条命令**；**能构造反例让它变红**；**数字来自 stdout 或产物文件，而不是转述**。

因此，AI 的产出应被当作“待验假设”：人看命令、退出码与关键读数，不看结论句。

## 4. 人的动作

### 4.1 三个时点

| 时点 | 人做什么 | 只看哪几样 | 必须由人拍板 |
|---|---|---|---|
| **开工前** | `git status -sb`、`git rev-parse --short HEAD`；确认上一切片已收尾；跑 `npm run ci`；`node scripts/build.mjs --check` 看余量；读 [plans/README](plans/README.md) 当前任务 | 工作区干净、基线提交、ci 退出码、余量与预警线关系、任务状态 | 是否开工；是否允许依赖/契约/schema 变更（默认禁止）；体积预算是否够 |
| **切片收尾** | 核对 `backup/<日期>-<任务>/` 是否在改代码前建立；跑受影响门禁与定向验证；`git diff --stat` | 备份与改动清单、门禁读数、断言/e2e 通过数是否减少、本切片体积增量 | 是否提交（提交由人执行或明确授权） |
| **阶段收口** | 按 [release-checklist](release-checklist.md)§1 跑全量（含 e2e 双入口、discipline、ngm）；逐条核对 skipped 名称与原因；按维度拆分体积增量 | 全量证据表、skipped 清单、体积增量、未验证项清单 | 是否进入下一阶段；是否发布；是否接受未验证项 |

### 4.2 三个“必须停”的信号

1. **某条门禁必须放宽才能过**——不许改尺子。
2. **体积余量低于冻结线且没有实测回收来源**——不许先写功能再想办法。
3. **语义不等价，只能靠改测试通过**——停下说明，不许改断言换绿。

## 5. 验收标准

任何人（包括几个月后的维护者）应能在**半小时内**回答下面三件事：

| # | 问题 | 用什么回答 | 通过标准 |
|---|---|---|---|
| 1 | 项目现在绿不绿 | `npm run ci` + `node scripts/e2e.mjs`（dist 入口另跑一次） | 能说出每条命令的退出码与关键读数，并知道 `npm run ci` 不覆盖 e2e/ngm/discipline |
| 2 | 体积余量还剩多少 | `node scripts/build.mjs --check`，再用 `scripts/lib/budget.mjs` 的阈值判读 | 能说出当前字节、gzip、余量，以及余量与预警线/冻结线的关系（而不是背旧数字） |
| 3 | 下一个要拍板的是什么 | [plans/README](plans/README.md) 状态 + [next-phase](plans/next-phase-2026-11.md)§5 + [release-checklist](release-checklist.md) | 能指出具体待决策项；若计划已收口，能说出“下一步是选阶段”这个决策本身 |

**答不上来任一条，就说明掌控还停在 AI 的叙述里。**

可以接受的“不知道”：known-issues 条数与待决策项这类**没有门禁守**的数字——但必须知道它没有门禁，并知道去哪里人工核对。

## 6. 与其它文档的分工

| 文档 | 负责 |
|---|---|
| [facts](facts.md) | 数字汇总（可过期，以命令为准） |
| [ARCHITECTURE](ARCHITECTURE.md) | 分层、启动链、真实依赖方向 |
| [DATA-MODEL](DATA-MODEL.md) | 状态、持久化、合并、迁移 |
| [release-checklist](release-checklist.md) | 全量发布命令、期望值与失败处理 |
| [engineering](engineering.md) | 阈值、判据、体积预算、禁止事项 |
| [testing](testing.md) | 测试层次、证据口径与空白 |
| [plans/README](plans/README.md) | 任务状态、推进约定、硬门禁 |
| 本文 | 人怎么用上面这些做判断；不重复它们的正文 |
