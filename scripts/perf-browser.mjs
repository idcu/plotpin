/**
 * perf-browser.mjs —— 真实浏览器性能基线入口（开发期可选，不在 npm run ci 路径）
 *
 * 与 scripts/bench.mjs 的区别：bench 跑在 Node + canvas 桩上，只能守“相对退化”；
 * 本入口在真实 Chromium 中用真实 Canvas2D 光栅化采集帧耗时 / 静态层重建 / heapUsed / 导入耗时。
 * 数据写入 test-results/perf-browser-baseline.json，不与 bench 数据混用。
 *
 * 用法：node scripts/perf-browser.mjs [--no-gate] [playwright test 参数...]
 *   缺 @playwright/test 或 Chromium 时打印 [SKIP] 并退 2（不是 0），避免把“没跑”当“通过”。
 *   门禁默认开启；--no-gate 只采数不判定（用于先取基线再定阈值）。
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const cli = join(root, 'node_modules', '@playwright', 'test', 'cli.js');

if (!existsSync(cli)) {
  console.error('[SKIP] 未安装 @playwright/test：请先执行 npm install -D @playwright/test');
  process.exit(2);
}

let chromium = null;
try {
  ({ chromium } = await import('@playwright/test'));
} catch (e) {
  console.error('[SKIP] @playwright/test 加载失败：' + e.message);
  process.exit(2);
}

let browserPath = '';
try { browserPath = chromium.executablePath(); } catch (_) {}
if (!browserPath || !existsSync(browserPath)) {
  console.error('[SKIP] 未找到 Chromium 浏览器二进制（' + (browserPath || '未知路径') + '）：请先执行 npx playwright install chromium');
  process.exit(2);
}

const args = process.argv.slice(2);
const noGate = args.includes('--no-gate');
const pass = args.filter(a => a !== '--no-gate');

const r = spawnSync(process.execPath, [cli, 'test', '--config', 'playwright.perf.config.mjs', ...pass], {
  stdio: 'inherit',
  cwd: root,
  env: { ...process.env, PERF_NO_GATE: noGate ? '1' : '' }
});
process.exit(r.status === null ? 1 : r.status);
