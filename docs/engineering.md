# 工程纪律：门禁、契约与已知空白

> 这份文档是**权威层**：门禁有哪些、各自守什么、什么**故意不设**门禁。
> 入口（README）只放"怎么跑"，细节在这里维护。
> 判据的取舍标准见 ngm 仓库的 `docs/practice/engineering-discipline.md`
> （工程纪律方法论：什么值得写成判据、成熟度分级、四种失效形态）——
> **任何"我们保证了 X"必须能指向一条会变红的判据；没有判据的，就明说不保证。**

---

## 1. 命令：`npm run ci`（CI 同一条）

```
node scripts/check.mjs --selftest   语法 → 入口资源 → 离线承诺 → 断言数 → 契约 → API → 分层 → 自测
        ├── scripts/badge.mjs --check        断言数三处一致（README 徽章/正文/命令注释）
        ├── scripts/check-contracts.mjs --selftest   契约判据 + 判据自己会红
        ├── scripts/check-plugin-api.mjs --selftest  API 面 + 解析器会红
        └── scripts/selftest.mjs            逻辑层自测（--selftest 显式执行，退出码纳入门禁）
node scripts/bench.mjs              渲染基准（avg / P95 / 重建 / heapUsed / 裁剪 / 覆盖率阈值）
node scripts/build.mjs --check      源重建 ↔ scripts/dist-manifest.json 登记哈希比对
node scripts/check-gates.mjs        门禁牙齿：5 种人为破坏必须让对应门禁非 0
```

`npm run ci` = 上面四条的顺序执行，与 `.github/workflows/ci.yml` 的 test job 一致。
`npm run lint` 只跑 `check.mjs`（不带 `--selftest`），用于本地快速自检；CI 必须带 `--selftest`。

单项也可以单独跑：`npm test`（check-ngm + selftest）、`npm run contracts`、`npm run bench`、`npm run gates`。

---

## 2. 契约：`contracts/conventions.json`

一份文件管四件事，每条都写清"违反时会怎样"：

| 约定 | 判据做什么 | 漂移的后果（看不见的那种） |
|---|---|---|
| 版本号三处一致 | `package.json` = `ngm.json` = `PlotPin.version` | 外部插件按错误的 API 版本编程 |
| i18n 键对齐 | `zh`/`en` 同键集；`index.html` 的 `data-i18n*` 键都有译文 | 切到英文直接露出键名 |
| 文件头唯一 | 每个 `js/**/*.js` **恰好一行** `/* 文件名.js —— 职责 */` | 新读者读到两份互相矛盾的职责说明 |
| 枚举同源 | `POINT_SCALE_SHAPES` 的键集 = `TYPE_SHAPES` | 插件注册了渲染器不认识的形状 → 静默当成 `none` |

**判据自己也有判据**：`npm run contracts:selftest` 造一棵必然违约的临时树，
断言四类漂移各被识别一次。没有这一步，契约判据就只是"看起来在检查"——
一条从未红过的判据，与没有判据的区别只在于它更贵。

> 这份契约不是"预防性设计"。它落地时**当场抓到三处真实漂移**：`io.js` 与 `ui-panels.js`
> 各有两行互相矛盾的文件头，且枚举提取的 lookahead 漏掉了数组最后一项。
> 两处文件头已按实际内容合并；漏项是自检抓出来的，不是想出来的。

---

## 3. 生成物与入库

| 产物 | 入库 | 判据 |
|---|---|---|
| `ngm.vendor/` | ✅（`linkMode: copy`，部署机不联网） | `scripts/check-ngm.mjs` 三角对账（vendor ↔ ngm.json ↔ ngm.lock） |
| `ngm.mappings.json` | ✅ | 同上；它是依赖清单的投影，不入库就没有复现依据 |
| `scripts/dist-manifest.json` | ✅（单文件发行包的哈希登记） | `scripts/build.mjs --check` 从源重建并比对 SHA256 / 字节数；改 js/css/index.html 后必须运行 `node scripts/build.mjs` 刷新 |
| `dist/` 实体产物 | ❌（gitignore） | `scripts/build.mjs` 可重建；存在时 `--check` 额外逐字节比对 |
| 新增 `js/**/*.js` | ✅ | 必须被 `index.html` 引用（check.mjs 双向核对） |

**判据问句**：删掉它，`npm run ci` 还能不能从源重建并得出结论？

---

## 4. 对外 API 面：`contracts/plugin-api.json`

插件的边界不是"能不能调"，而是"**调了算数吗**"。`PlotPin` 对象上每多一个键，
就多一个别人可以依赖、你却不能再改的东西；每少一个键，就是一句承诺落空。

`scripts/check-plugin-api.mjs` 把 `js/features/plugins.js` 里 `const PlotPin = {…}` 的**顶层键**
与清单双向比对：

| 情况 | 后果（都不报错） |
|---|---|
| 代码里有、清单没登记 | **API 泄漏**：插件用了它，你下次改名就静默破坏兼容 |
| 清单有、代码里没有 | **承诺落空**：文档写了、插件调了、运行时 `undefined` |

判据自己带牙齿：`npm run api:selftest` 用一段含内层花括号、方法简写、getter 的对象字面量
验证解析器只取顶层键。落地时做过一次真牙齿测试——往 `PlotPin` 里加一个 `_internalSync()`
立即报"1 处泄漏"，移除即恢复。

> **为什么不给插件做沙箱**：同源纯 JS 没有隔离可言。这里的边界是**评审与签名**，
> 写"我们打算做沙箱"比不做更危险。清单能保证的只有一件事：**哪些名字是你公开承诺过的**。

---

## 5. 故意不设门禁的地方（明说不保证）

| 项 | 为什么不设 | 现在的做法 |
|---|---|---|
| Service Worker 的 `CACHE` 版本号 | "改了 js 就必须 bump"没有可读的事实源：SW 的预缓存清单在运行时从 `index.html` 解析，构建期不知道"上一版是什么" | 靠发布纪律 + `sw.js` 注释；`pwa.test.mjs` 只守下限（版本号格式与 ≥ 基线） |
| 英文文案的**质量** | 判据只能证明"键在、非空"，证明不了译文准确 | selftest 覆盖"全量中英文案"路径；语义由评审看 |
| 渲染性能的**真实浏览器基线** | `bench.mjs` 跑在 Node + canvas 桩上，没有 GPU / 真实 Canvas；绝对值阈值只能守住"明显退化"，证明不了真机流畅 | Node 桩下已有阻断门禁（见 §5.1）；真实浏览器 P50/P95/heap 基线待 A-14（Playwright 需用户批准 devDependency） |
| 插件 API 的**向后兼容** | 需要契约测试 + 历史版本矩阵，成本高于当前收益 | 版本号三处一致由契约守；破坏性变更写进 README |

**这一节比上面几节更重要**：把"没有判据"的区域写出来，读者才不会把绿色的
`npm run ci` 当成"全部保证"。

### 5.1 阻断阈值与门禁牙齿（A-13）

阈值是**绝对值**，不是与上一版比对；改阈值必须在 commit body 写明「旧值 → 新值 + 理由 + 连续实测」。
当前余量为实测值的 2–4 倍（本机 2026-11-06 连续 3 次实测：avg 0.33–0.41ms / P95 0.43–0.66ms / 重建 21.7–39.3ms / heapUsed 12.09–19.09MB）。

| 指标 | 阻断阈值 | 实测（Node 桩 / 2000 对象 / 1600×900，3 次区间） | 说明 |
|---|---|---|---|
| 缓存帧平均 | ≤ 8 ms | 0.33–0.41 ms | 50fps 预算的一半，下限保护 |
| 缓存帧 P95 | ≤ 3 ms | 0.43–0.66 ms | 偶发卡顿不能靠平均帧掩盖 |
| 缓存帧 P99 | ≤ 10 ms（仅告警） | 0.68–1.12 ms | 先积累数据，不阻断 |
| 静态层重建 | ≤ 60 ms | 21.7–39.3 ms | 对象增删改时触发 |
| 直接全量帧 | ≤ 60 ms | 21.0–27.3 ms | 导出/打印路径 |
| `heapUsed` | ≤ 64 MB | 12.09–19.09 MB | bench 结束时读数，不含长跑斜率 |
| 覆盖率分析 | ≤ 300 ms | 7.6–10.6 ms | 1000×1000m + 30 摄像头 |
| 视口裁剪率 | ≥ 60% | 99.4% | 高倍缩放下 |
| 单文件体积 | ≤ 750 KB | 669.4 KB | 留约 11% 余量 |
| 产物 SHA256 | 必须等于 `scripts/dist-manifest.json` | `71ea6af…` | 从源重建、二次构建确定性一致 |
| CSP 内联脚本哈希 | 哈希数 = 内联脚本数（剔除 HTML 注释） | 36 = 36 | 单文件包每个内联脚本一条 `sha256` 白名单；`script-src` 不得含 `'unsafe-inline'` |
| 断言数 | ≥ 1680 且 0 失败 | 1680 | 只增不减 |

**门禁牙齿（`npm run gates`）**：上面这些判据本身也会假绿（只打印不比对、缺文件退 0、
模板缺失空操作）。`scripts/check-gates.mjs` 在系统临时目录的整仓副本里构造 5 种破坏——
P95 超标、`dist` 产物篡改、`ngm.json` 缺失、README 断言数模板缺失、selftest 失败——
断言对应门禁全部非 0 退出。它不碰仓库本身，也不依赖任何第三方包。

---

## 6. 怎么加一条新判据

1. **先问三件事**：违反了会怎样？能不能用"读文件 / 跑命令 / 比数据"回答？过去 3 个月违反过吗？
   三个都过才动手。
2. **写成单项**：能单独跑，打印**读数**（扫了多少、比了多少），读数为 0 视为失败（空跑比漏报更糟）。
3. **配一颗牙齿**：构造一份"应当失败"的输入并断言它失败（`--selftest` 是现成的形状）。
4. **挂进 `check.mjs`**，并确认本地与 CI 走同一条命令。
5. **在本文档登记**：守什么、违反的后果、什么情况下可以删。

> 一条判据被**阻断过一次**才算成立。加进来之后三个月没红过、也没人看得懂它在守什么，
> 就应该删掉——它制造的是"查过了"的错觉。

---

## 附：十问看板（成熟度自评）

> `engineering-discipline.md` §8 的十问清单，做成了一个脚本：它**不替代**任何判据，
> 只回答"这个仓库现在几档、缺哪一条"。

```bash
npm run discipline
```

结构上不适用的问写在 `docs/discipline-exemptions.json`（理由必须写清为什么结构上不成立；
"暂时没做"不是理由）。不适用项从分母剔除，而不是从分子加分。

当前：**10/10 → L4**。缺口出现在哪一问，就是下一轮要补的判据。
