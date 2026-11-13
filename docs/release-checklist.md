# 发布门禁清单（本地为准）

> **当前没有 CI 在运行。** `.github/workflows/ci.yml` 与 `perf-nightly.yml` 是已就绪的**定义存档**：
> GitHub 仓库 `idcu/plotpin` 存在但只用于 Pages 的 branch 构建（§4），不跑 Actions（2026-11-13 决策 D2）。
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

## 4. GitHub Pages 发布（线上站点 https://idcu.github.io/plotpin/）

线上是 `main` 根目录的 legacy Pages 构建（`build_type: legacy`、`source: {branch: main, path: /}`、根目录有 `.nojekyll`），
**推 `main` 即自动发布**，不需要 gh-pages 分支、不需要 Pages workflow、不需要手工上传。

### 4.1 前置条件

| 项 | 检查命令 | 期望 |
|---|---|---|
| gh 已登录 | `gh auth status` | exit 0；当前账号 `huyuyue`，scope 含 `repo`、`workflow`（Git operations protocol: https） |
| `github` remote | `git remote -v` | `github https://github.com/idcu/plotpin.git (fetch/push)` |
| `origin` 仍是 Gitee | `git remote -v` | `origin git@gitee.com:idcu/plotpin.git (fetch/push)`，未被替换 |
| 工作区干净 | `git status -sb` | 无未提交改动；`dist/` 不在版本控制内（`.gitignore` 已含 `dist/`） |

缺 `github` remote 时补：`git remote add github https://github.com/idcu/plotpin.git`（只加 remote，不改 `origin`）。

### 4.2 发布命令

```powershell
git fetch github
git log --oneline HEAD..github/main   # 远端领先本地？应为空
git log --oneline github/main..HEAD   # 本地领先远端的提交，即本次要发布的范围
git -c credential.helper= -c credential.helper="!gh auth git-credential" push github main
```

- 为什么带 `-c credential.helper=...`：本机全局 helper 是 Git Credential Manager（可能弹 GUI 或卡住），
  这里用**命令级临时覆盖**借 gh keyring 里的 token 完成 https 认证；`-c` 只作用于这一条命令，
  **不写 `.git/config`、不动全局 git config**。
- 不使用 `--force`、不 amend、不 push 标签。

### 4.3 无新提交时（no-op）

先 `git fetch github`，比对 `git rev-parse HEAD github/main`：

- 两个 SHA 相同 → 如实记录「**无新提交可发布**」，**不推送、不造空提交、不改写历史**，直接做 4.4 的线上复核。
- 本地领先 → 按 4.2 推送；远端领先 → 停止，先查明来源再决定，不 force。

### 4.4 发布后验证

| # | 检查 | 期望（2026-11-13 基线） |
|---|---|---|
| 1 | `Invoke-WebRequest https://idcu.github.io/plotpin/` | **HTTP 200**，页面为源码入口 `index.html`（26,400 B），标题「图钉 PlotPin · 离线图纸标注工具」 |
| 2 | 线上 `sw.js` 的 `VERSION` | `183`（与本地 `sw.js` 同值；这是线上可辨认的版本号） |
| 3 | 关键文件哈希 | 逐一下载 `index.html`、`sw.js`、`js/core/persistence.js` 与本地同名文件比 SHA256，应全部一致 |
| 4 | `gh api repos/idcu/plotpin/pages/builds/latest` | `status: "built"`、`commit` 等于本次推送的 SHA、`error.message` 为 null |
| 5 | `gh api repos/idcu/plotpin/pages` | `status: "built"`、`build_type: "legacy"`、`source.branch: "main"`、`source.path: "/"` |

### 4.5 生效时间与失败处理

- 推送后通常 **20～40 秒**生效（实测一次构建 22.3 s）；CDN 另有 `Cache-Control: max-age=600`，
  刚推送时可能读到旧缓存，用 `?v=<sha>` 或 `Invoke-WebRequest -Headers @{'Cache-Control'='no-cache'}` 复读。
- 超过 2 分钟仍是旧版本：先查构建状态再判断——
  `gh api repos/idcu/plotpin/pages/builds/latest` 若 `status` 非 `built` 或 `error.message` 非空，按错误信息修；
  若已是 `built` 且 `commit` 正确，则是 CDN 缓存，等 `max-age` 或强制刷新，不要因此重推/force。
- 构建失败不回滚 git 历史：修好内容后正常提交再推（仍不 force、不 amend）。

### 4.6 与 Gitee 的关系

- 两个远端**独立推送、互不影响**：`origin`（Gitee）与 `github`（GitHub Pages）各自有自己的 `main` 指针。
- Gitee 仍按原流程 `git push origin main`；GitHub 只在需要更新线上站点时按 4.2 推送。
- 只推 GitHub 不推 Gitee（或反之）会导致两边版本不一致，发布说明里要写明各自推到哪个 SHA。
