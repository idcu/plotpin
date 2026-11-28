# ngm.local —— 本地 ngm 包（先本地，后上游）

本目录存放**尚未进入 `gitee:idcu/ngm-repo` 的本地 ngm 包**。它们不属于 `ngm.vendor`，不写入 `ngm.json` / `ngm.lock` / `ngm-vendor-digest.json`，但保持与 vendor 包相同的目录形状，便于后续原样提升。

## 包格式

```
ngm.local/<domain>/<name>/
  ngm.json
  README.md
  src/core.js        # UMD/IIFE，挂 globalThis.__local<Name>，供 classic <script> 加载
  src/index.mjs      # ESM 包装
  src/index.cjs      # CJS 包装
  test/<name>.test.mjs
```

`ngm.json` 在 vendor 字段之外额外声明：

| 字段 | 含义 |
|---|---|
| `browser` | 浏览器 classic `<script>` 入口，必须被 `index.html` 加载 |
| `global` | 浏览器全局名，必须以 `__local` 开头 |
| `adapter` | 旧全局名适配层路径，必须登记到 `contracts/adapters.json` 的 `localAdapters` |
| `test` | 零依赖 Node 测试入口 |
| `cjs` | CJS 入口 |

## 约束

1. 零运行时依赖；浏览器入口不得直接发起网络请求。
2. 适配层保留旧全局名；`check-ngm` 会核对 `localAdapters.keeps`。
3. 本地包不得出现在 `ngm.json` / `ngm.lock`；`check-ngm` 会拦截。
4. 新增/修改本地包后必须同步：`index.html` 加载顺序、`contracts/adapters.json`、`docs/modules.md`、`CHANGELOG.internal.md`、`sw.js` VERSION 与 `scripts/sw-inputs.sha256`。
5. 提升到上游后删除本地目录，并按 vendor 流程重新 lock / vendor / digest，避免两份实现。

## 校验

```powershell
node scripts/check-ngm.mjs
node scripts/test-local.mjs
```
