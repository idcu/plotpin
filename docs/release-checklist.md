# 发布门禁清单（本地为准）

> **Actions 在跑但全红，不作发布门禁。** `.github/workflows/ci.yml` 与 `perf-nightly.yml` 已挂载并实际运行
> （2026-11-13 核查：CI 60 次全部失败、`Perf Nightly` 0 次、`pages-build-deployment` 87 次），**不能**当作自动校验。
> 每次发布/合并前必须在本机逐条执行并**核对数字**，不能只看退出码。
> **基线与快照日期：2026-11-13**（提交 `2123a46` + 工作树 M1/M2 修复）。数字以命令现场输出为准；本文快照只用于判断“是否同一次合法变化”。

## 1. 必跑（缺一不可）

| # | 命令 | 期望（2026-11-13 快照） |
|---|---|---|
| 1 | `npm run ci` | exit 0。内含 `check.mjs --selftest`（**4,048 通过 / 0 失败**，加载 **47** 个脚本）、`bench.mjs`（阈值全绿）、`build.mjs --check`（**756,594 B / 738.9 KB ≤ 839,680 B**，gzip **245,937 B / 240.2 KB ≤ 286,720 B**，余量 **83,086 B（gzip 40,783 B）**，SHA256 与 `scripts/dist-manifest.json` 一致，二次构建同哈希）、`check-gates.mjs`（正面基线全 ✓ + **17 种**破坏全 ✓） |
| 2 | `node scripts/check-contracts.mjs` | `contracts: 11 项核对，0 处违约` |
| 3 | `node scripts/check-plugin-api.mjs` | `24 个键，清单 24 条，0 处泄漏，0 处落空`；API 1.1.0 / 8 项能力 |
| 4 | `node scripts/check-sw.mjs` | `VERSION=200`，52 个预缓存输入与 `scripts/sw-inputs.sha256` 一致；`VERSION` 支持单/双/无引号三种写法；改预缓存输入必须先 bump `VERSION` 再 `--update` |
| 5 | `node scripts/e2e.mjs`（源码入口 4173） | 2026-11-13 实跑 **154 passed / 0 failed / 1 skipped，exit 0**（跳过的 1 条为需 `COLLAB_SOAK=1` 的协作 soak）；本次文档同步未复跑，发布前必须重跑并保留日志 |
| 6 | `$env:E2E_ENTRY='dist'; $env:E2E_PORT='4174'; node scripts/e2e.mjs`（dist 入口） | 2026-11-13 本次只跑渲染专项：`perf-render` **4 passed**；全量 dist 套件未复跑，发布前必须补跑（含 `sw.spec` 单文件版豁免）；执行后清理两个环境变量 |
| 7 | `node scripts/badge.mjs --check` | exit 0：README 三处断言锚点一致（当前 4048），且 facts/testing/engineering/modules 计数锚点全部等于实测 |
| 8 | `node scripts/check-discipline.mjs --strict` | **13/13 → L4**，exit 0；文档 17 篇，命令全部可解析 |
| 9 | `node scripts/size-report.mjs` | 打印 raw / gzip / 余量；必须与第 1 条同一次构建的数字一致 |
| 10 | `node scripts/check-deletions.mjs` | exit 0；`docs/deletions.md` 记录完整，且记录路径不在 `git ls-files` 中 |
| 11 | `node scripts/i18n-scan.mjs --check` | 覆盖率 **44.09% = 731 / 1,658**（按出现次数）≥40%，缺口 **0** ≤10，UI 硬编码 **18** ≤20（全仓未走入口 **927**，UI 18 只是其子集；已字典待接入 **81** ≤81），模板内 =0。口径见 [engineering](engineering.md)§4.6；旧 46.7% 去重口径不再使用 |

`node scripts/check-ngm.mjs`（vendor ↔ `ngm.json` ↔ `ngm.lock` ↔ 实际字节）不在 `npm run ci` 内，
但改动 `ngm.vendor/**` 或锁文件时必须单独跑，期望 `0 error(s)`。

## 2. 按改动类型追加

| 改动 | 追加命令 | 期望 |
|---|---|---|
| `js/**`、`css/**`、`index.html` | 先 `node scripts/build.mjs` 刷新登记，再跑第 1 条 | 第 1 条全绿；CSP 哈希由脚本重算 |
| 预缓存输入（`js/**`、`css/**`、`sw.js`、`index.html` 等） | `node scripts/check-sw.mjs --update` 后跑第 1 条 | 清单与当前输入一致 |
| 渲染 / 历史栈 / 覆盖率 / 规则 | `node scripts/bench.mjs`；渲染改动再加 `node scripts/perf-browser.mjs` | Node 阈值全绿；浏览器基线四组均过门禁 |
| 导出/打印/图框 | 人工打开产物核对（PDF 页数/页序、CSV/XLSX 可打开、DXF 在 CAD 中可读） | 见 [manual-acceptance](manual-acceptance.md) |
| 文档 | `node scripts/check-discipline.mjs --strict` + `node scripts/badge.mjs --check` | 13/13；计数锚点一致 |
| 跨浏览器声明 | **没有可复跑的非 Chromium 入口**：`scripts/e2e.mjs` 只校验 Chromium，`playwright.config.mjs` 固定 `chromium` | 不得用 `--browser=firefox` 宣称通过；只能按 [manual-acceptance](manual-acceptance.md) M2 记录“未验证/历史手工记录” |

## 3. 失败处理

- **红了不发**：不得放宽阈值、删除断言、跳过用例来“转绿”；先修因，再复跑整条清单。
- **跳过 ≠ 通过**：`scripts/e2e.mjs` 缺 Playwright/Chromium 时退 **2**（不是 0），必须补依赖重跑。
- **数字对不上也不发**：退出码 0 但产物字节、断言数、gzip、余量与上表不符时，先确认是否同一次提交内的合法变化，并把新基线同批写进 [facts](facts.md)。
- 记录方式：发布说明里贴每条命令的退出码与关键数字（至少第 1、5、6、8 条），不要只贴结论句。

## 4. GitHub Pages 发布（线上站点 https://idcu.github.io/plotpin/）

线上是 `main` 根目录的 legacy Pages 构建（`build_type: legacy`、`source: {branch: main, path: /}`、根目录有 `.nojekyll`），
**推 `main` 即自动发布**（可能本机推，也可能 Gitee 推送镜像代推，见 4.6），不需要 gh-pages 分支、不需要 Pages workflow、不需要手工上传。

### 4.1 前置条件

| 项 | 检查命令 | 期望 |
|---|---|---|
| gh 已登录 | `gh auth status` | exit 0；scope 含 `repo`、`workflow` |
| `github` remote | `git remote -v` | `github https://github.com/idcu/plotpin.git (fetch/push)` |
| `origin` 仍是 Gitee | `git remote -v` | `origin git@gitee.com:idcu/plotpin.git (fetch/push)`，未被替换 |
| 工作区干净 | `git status -sb` | 无未提交改动；`dist/` 不在版本控制内 |

缺 `github` remote 时补：`git remote add github https://github.com/idcu/plotpin.git`（只加 remote，不改 `origin`）。

### 4.2 发布命令

```powershell
git fetch github
git log --oneline HEAD..github/main   # 远端领先本地？应为空
git log --oneline github/main..HEAD   # 本地领先远端的提交，即本次要发布的范围
git -c credential.helper= -c credential.helper="!gh auth git-credential" push github main
```

- 带 `-c credential.helper=...` 是为了用 gh keyring 里的 token 完成 https 认证，避免全局 Git Credential Manager 弹窗卡住；`-c` 只作用于这一条命令，**不写 `.git/config`、不动全局配置**。
- 不使用 `--force`、不 amend、不 push 标签。
- 返回 **`Everything up-to-date`**（exit 0）说明远端 `main` 已是该 SHA——常见原因是 Gitee 镜像先行同步（见 4.6），**不是失败**；以 `git rev-parse HEAD github/main` 与 4.4 的 Pages `commit` 为准，不为“有输出”造空提交。

### 4.3 无新提交时（no-op）

先 `git fetch github`，比对 `git rev-parse HEAD github/main`：

- 两个 SHA 相同 → 如实记录「无新提交可发布」，不推送、不造空提交、不改写历史，直接做 4.4 复核。
- 本地领先 → 按 4.2 推送；远端领先 → 停止，先查明来源再决定，不 force。

### 4.4 发布后验证

| # | 检查 | 期望 |
|---|---|---|
| 1 | `Invoke-WebRequest https://idcu.github.io/plotpin/` | HTTP 200；页面为源码入口 `index.html`，标题「图钉 PlotPin · 离线图纸标注工具」 |
| 2 | 线上 `sw.js` 的 `VERSION` | 以本地 `node scripts/check-sw.mjs` 输出为基准（2026-11-13 本地快照为 `193`）；线上若仍是旧值，说明本次推送尚未生效，不是本地数字错 |
| 3 | 关键文件哈希 | 逐一下载 `index.html`、`sw.js`、`js/core/persistence.js` 与本地同名文件比 SHA256，应全部一致 |
| 4 | 本次改动文件哈希（只改文档时必做） | 例如 `docs/release-checklist.md` 的线上哈希应等于本地；否则说明构建仍是上一版 |
| 5 | `gh api repos/idcu/plotpin/pages/builds/latest` | `status: "built"`、`commit` 等于本次推送的 SHA、`error.message` 为 null；`duration` 单位是毫秒 |
| 6 | `gh api repos/idcu/plotpin/pages` | `status: "built"`、`build_type: "legacy"`、`source.branch: "main"`、`source.path: "/"` |

注意：`builds/latest` 在新构建排队期间可能仍返回**上一个**构建（旧 `commit`）。等 `commit` 变成目标 SHA 再看 `status`，不要看到旧构建就判失败。

### 4.5 生效时间与失败处理

- 推送后通常 **20～40 秒**生效；CDN 另有 `Cache-Control: max-age=600`，刚推送时可能读到旧缓存，用 `?v=<sha>` 或 `-Headers @{'Cache-Control'='no-cache'}` 复读；优先看 `ETag`/`Last-Modified`，再看文件哈希。
- 只改文档时页面内容与 `sw.js` `VERSION` 可能本就不变，用第 4 行的「本次改动文件哈希」证明新构建已上线，不要因“页面看起来没变”判失败。
- 超过 2 分钟仍是旧版本：先查构建状态——`status` 非 `built` 或 `error.message` 非空按错误信息修；已 `built` 且 `commit` 正确则是 CDN 缓存，等 `max-age` 或强刷，不要重推/force。
- 构建失败不回滚 git 历史：修好内容后正常提交再推（不 force、不 amend）。
- `git push github` 连不上（`Failed to connect to github.com port 443`，exit 128）：先用 `gh api repos/idcu/plotpin/commits/main --jq .sha` 查远端是否已有该 SHA（可能已被镜像同步）；已有就不再推，直接做 4.4；没有才排查网络，不要 force 或换协议绕过。

### 4.6 与 Gitee 的关系

- 两个远端各有自己的 `main` 指针，但**不要假设“互不影响”**：2026-11-13 实测到外部同步。
- **判定（置信度 0.9）**：Gitee 仓库的「推送镜像（push mirror）」使用 huyuyue 的 GitHub 凭据，每次 push 后自动推 `github.com/idcu/plotpin`。依据：Gitee 推送后 GitHub 秒级出现同一 SHA（`e614d8e` ≈4 s、`efcd555` ≈5 s、`799a85d` ≈12–14 s）；三次 push 的 actor 全为 `huyuyue`；GitHub 侧 hooks 0、keys 0、非镜像仓库、workflow 无 `git push`；本机无 `insteadOf`/自定义 hooks。
- **未核实**：Gitee 后台镜像配置与 token 名称/权限（需登录 Gitee，本机无凭据）；`gh api repos/idcu/plotpin/commits/main` 可能滞后约 1 分钟，判断以 Actions run 的 `head_sha` 或 Pages 构建的 `commit` 交叉确认。
- **可写 `main` 的主体（均需知情）**：

  | 主体 | 依据 |
  |---|---|
  | `huyuyue`（admin） | `gh api repos/idcu/plotpin/collaborators`（唯一 collaborator） |
  | 组织 owner | 仓库属于 `idcu` 组织，owner 默认可管理 |
  | `trae-ai-cn` GitHub App | 组织安装了该 App（`repository_selection=all`，含 `contents:write`、`workflows:write`） |
  | 镜像所用 huyuyue token | 由同步现象推断，权限未核实 |

- 每次发布前**必须**用 `gh api repos/idcu/plotpin/commits/main --jq .sha` 或 `git fetch github` + `git rev-parse` 实测，再决定推不推；不假设顺序、不假设“必须推两次”。
- Gitee 仍按原流程 `git push origin main`；需要显式更新 GitHub 时按 4.2 推送（可能 no-op 或因网络 exit 128，属正常）。
- 只推其中一边都可能造成两边版本不一致，发布说明里要写明两边各自停在哪个 SHA。
