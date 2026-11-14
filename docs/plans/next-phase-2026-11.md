# 下一阶段路线图（2026-11）

> **读者**：接手的开发者、发布负责人。
> **回答**：N 系列之后还剩什么风险、按什么顺序推进、每项的进入条件与完成证据。
> **不回答**：已交付明细见 [known-issues-archive](../known-issues-archive.md)；门禁结构见 [engineering](../engineering.md)；未验证项状态见 [known-issues](../known-issues.md)。
> **性质**：这是**风险路线图**，不是已完成任务账本。文中“候选”均未开工；只有写进提交并在 `CHANGELOG.internal.md` 留有读数，才算交付。
> **基线**：2026-11-13，提交 `2123a46` 之上含 M1 polygon NaN、M2 合并配置差异两处未提交修复。数字用命令取，本文只写口径。

## 0. 怎么用这份路线图

1. 先读 [known-issues](../known-issues.md) 的“未验证 / 限制 / 缺陷”三分，确认要做的属于哪一类。
2. 只在“有可复跑证据、且不碰 schema/契约/阈值”的范围内自主推进；其余先停下列选项（§5）。
3. 一次只做一条；提交前跑 §2 的硬门禁；commit body 写命令、读数与影响面。
4. 做完后把结论写进 [known-issues-archive](../known-issues-archive.md) 对应主题，不新增第二套计数。

## 1. 当前基线（用命令复核，不背数字）

```text
git rev-parse --short HEAD
git status -sb
node scripts/badge.mjs --check
node scripts/build.mjs --check
node scripts/check-sw.mjs
node scripts/check-contracts.mjs
node scripts/check-plugin-api.mjs
node scripts/check-discipline.mjs --strict
```

判读：

- `badge.mjs --check` 同时校验 README 三处断言锚点与 facts/testing/engineering/modules 的计数锚点；不绿就是文档/测试数字漂移。
- `build.mjs --check` 同时给产物字节、gzip、余量与 SHA256；与 `scripts/dist-manifest.json` 必须一致，二次构建必须同哈希。
- `check-sw.mjs` 给 `VERSION` 与预缓存输入指纹；改了预缓存输入必须 bump 再 `--update`。
- 契约 11 项 / 0 违约、插件 API 31 键 / 0 泄漏 / 0 落空是结构下限，不是“功能全对”。
- 状态直赋值、跨层耦合、必需钩子、软调用由 `check.mjs` 第 9 步（9.1～9.4）核对，`check-gates.mjs` 用 20 种人为破坏反向验证；计数基线以 `contracts/coupling.json` 为准。
- `check-discipline --strict` 13/13 才算文档侧收口；当前余量偏小，新增文档内容要算体积。

**Actions 现状**：`ci.yml` 与 `perf-nightly.yml` 已挂载并实际运行，但 CI 长期全红、Perf Nightly 0 次（2026-11-13 核查）。发布以本地门禁为准，见 [release-checklist](../release-checklist.md)。

## 2. 每项任务都必须满足的硬门禁

```text
node scripts/check.mjs --selftest
node scripts/e2e.mjs
node scripts/build.mjs --check
node scripts/check-gates.mjs
node scripts/check-discipline.mjs --strict
```

- selftest 断言数不得减少；e2e 通过数不得减少、跳过项不得无名增加；产物不得超上限。
- 涉及渲染/历史/覆盖率/规则：另跑 `node scripts/perf-browser.mjs`，附 before/after P95 与命令；Node 桩数据不能当浏览器结论。
- 涉及预缓存输入：bump `sw.js` `VERSION` 后 `node scripts/check-sw.mjs --update`。
- 涉及文档计数：跑 `node scripts/badge.mjs` 写入并复核。

## 3. 已收口边界（不要再当待办）

| 范围 | 状态 | 去哪查 |
|---|---|---|
| N-01～N-27（止血 4 / 纠错 17 / 提速 3 / 文档测试 3） | 已交付 | [known-issues-archive](../known-issues-archive.md)§3、`CHANGELOG.internal.md` |
| P1 收口（CSS-P1-1、CORE-P1-8、RT-P1-09） | 已交付 | 同上 §1 |
| P2 第 1～11 批与 C 类决策 | 已交付/已决策；IO-P2-3、IO-P2-17 仍未验证 | 同上 §3 |
| M1 polygon NaN | 已在工作树修复，待提交 | `backup/2026-11-13-M1-polygon-nan/CHANGES.md` |
| M2 合并配置差异报告 | 已在工作树修复，待提交 | `backup/2026-11-13-M2-merge-config/CHANGES.md` |
| 本轮文档重写 | 已完成，待提交 | `backup/2026-11-13-docs-rewrite/CHANGES.md` |

## 4. 剩余风险与候选顺序

### R1 外部条件验证（最高优先，因为没有证据就无法承诺）

| 候选 | 内容 | 进入条件 | 完成证据 |
|---|---|---|---|
| X-01 | 真机 PWA：Android/iOS 安装、离线、手势 | HTTPS 站点 + 真机 | [manual-acceptance](../manual-acceptance.md) M1 全 PASS + 截图 |
| X-02 | Safari 原生与 Firefox 现代版手工回归 | macOS/Safari 17+、Firefox ESR 128+ | M2 记录；**自动化仍只认 Chromium**，不得用 `--browser` 参数替代 |
| X-03 | 真实双设备 WebRTC（同局域网/跨网络） | 两台设备；跨网络需 STUN/TURN | M3 记录；跨网络缺 TURN 只能记 `BLOCKED` |
| X-04 | 真实 GPU / 低端机性能 | 目标真机 + Performance 录制 | M5 记录；SwiftShader 只能标 `PROXY` |
| X-05 | 真实图纸 50 组快照差异 | 匿名语料 + 两人独立基准 | M8 记录；一致率阈值执行前由人确认 |
| X-06 | Excel/WPS、CAD、GIS 实机打开导出物 | 对应软件 | E1/E2/M7 记录 |

不要做：用构造样本补 50 组语料；用同机双标签代替双设备；用 WebKit 代替 Safari；用文件头魔数代替真实打开。

### R2 冻结/延后的技术债（改动小、边界清楚，适合穿插）

| 候选 | 内容 | 约束 | 完成证据 |
|---|---|---|---|
| X-07 | R-14 收口：`meta`/`viewport` 也走自有键白名单 | 不得改 schema 版本与键布局；需补反例 | selftest 新增“未知键被丢弃”断言 + 旧工程往返 |
| X-08 | R-24 收口：沙箱 `props` 键数 / `points` 顶点数上限 | 上限值必须来自 `APP_LIMITS` 或契约，不写散落常量 | 插件沙箱 e2e + selftest 超限拒绝 |
| X-09 | CORE-18：`interaction.js` 不再经 `render.js` 取 `isVisible` | 只改为 `model.effectiveVisible`，不改语义 | selftest 可见性断言 + 静态核对 |
| X-10 | NGM-01：重新用 ngm 锁定三处 vendor 补丁 | 需改 `ngm.lock`/摘要，属依赖面变更，先停下说明 | `node scripts/check-ngm.mjs` 0 error，且 `ngm verify --deep` 通过 |

不要做：为 R-14 放宽导入校验；为 R-24 把上限写成注释；为 NGM-01 手改 `moduleDigest` 伪造一致。

### R3 门禁与文档维护（每次提交顺手做）

| 候选 | 内容 | 判据 |
|---|---|---|
| X-11 | 文档余量治理：当前最大文档逼近 60 KB/600 行上限 | `check-discipline --strict` 13/13，且新增内容不推高最大值 |
| X-12 | badge 锚点扩展：把仍靠人工核对的计数纳入 `badge.mjs` | 新增锚点必须能失败；改脚本属工具面，先说明 |
| X-13 | Actions 转绿或明确降级 | 要么修 workflow，要么在 README/engineering/release 统一写“红且不作门禁”；不得两边说法不一 |
| X-14 | 文档命令可解析数保持全绿 | `check-discipline --strict` 第 13 问；当前 61 条全解析 |

不要做：调高 60 KB/600 行；为过门禁删命令；把“Actions 红”写成“CI 通过”。

### R4 容量与性能未知（需要真实数据才立项）

| 候选 | 内容 | 前置 |
|---|---|---|
| X-15 | 10k 以上对象与长事务 heap 曲线 | 先有真实语料与目标设备；当前只测到 10k |
| X-16 | 大底图（接近 40 MP）首次解码卡顿量化 | 需真实大图；先测再决定是否优化 |
| X-17 | 覆盖率高分辨率真实浏览器读数 | 当前只有 Node 桩的 5000×5000 m 数据 |

不要做：把 Node 桩数据写成浏览器结论；为“看起来快”调低断言。

### R5 协作与安全（产品边界，先决策再动手）

| 候选 | 内容 | 现状 |
|---|---|---|
| X-18 | 协作认证/授权/审计 | 当前无；3～5 人局域网临时协作是明确边界 |
| X-19 | WebRTC 信令与自动重连 | 当前无信令、`iceServers: []`、断开需重换邀请串 |
| X-20 | 插件隔离升级为语言级沙箱 | 当前是能力白名单 + 2 s 超时，仅承诺加载可信插件 |

不要做：在未决策前引入服务端、账号体系或 CRDT；这些都会改产品边界与 schema。

## 5. 需要人拍板的事项（执行到就停）

| 事项 | 现状/默认 | 必须先给出什么 |
|---|---|---|
| schema 版本或键布局变更 | v2 冻结，v1 只读兼容 | 一次性迁移方案 + 双读兼容 + 回滚路径 |
| 新增运行时依赖 | 零依赖是产品卖点 | 体积预算来源 + 离线可用性 + 供应链锁定方案 |
| 放宽门禁阈值 | 禁止为提高上限而放宽 | 旧值→新值、理由、连续实测、影响面 |
| 改导出字段/格式 | golden 逐字节锁定 | 差异说明 + 所有受影响格式 + 重建 golden 的理由 |
| 跨浏览器支持承诺 | 只有 Chromium 有自动化证据 | 可复跑入口 + 证据产物；否则保持“未验证” |
| 发布/推送 | 默认只允许本地提交 | 人明确授权；按 [release-checklist](../release-checklist.md) 执行 |

## 6. 未验证与本期不纳入

### 6.1 必须标注未验证

- M1 真机 PWA、M2 Safari、M2-Fx Firefox 现代版、M3 跨网络 WebRTC、M4 英文语义、M5 真实 GPU、M6 低端机插件、M7 CAD 观感、M8 真实语料误报率。
- E1 Excel/WPS 实机、E2 GIS 绕向接受度、E3 5 万行 XLSX。
- 详细条件与口径见 [known-issues](../known-issues.md)§2 与 [manual-acceptance](../manual-acceptance.md)§6。

### 6.2 明确不纳入（保持现状）

- CRDT/服务端权威协作（R-18 已决策关闭）。
- 协作认证/授权/审计（R-19 已决策关闭）。
- SVG 与 canvas 两套绘制口径统一（R-20 已决策关闭）。
- 多页 PDF 合并导入（产品决策只导第 1 页）。
- 任意透视的四角自由变换（2×3 仿射表达不了）。

### 6.3 记录归属

- 历史修复一句话结论 → [known-issues-archive](../known-issues-archive.md)。
- 当前缺陷/限制/未验证 → [known-issues](../known-issues.md)。
- 性能读数与采集命令 → [performance](../performance.md)。
- 门禁阈值与破坏性验证 → [engineering](../engineering.md)、[testing](../testing.md)。
- 人工验收步骤与历史结果 → [manual-acceptance](../manual-acceptance.md)。
