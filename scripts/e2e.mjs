/**
 * e2e.mjs —— 浏览器级测试入口（开发期可选）
 *
 * 先确认 @playwright/test 与 Chromium 二进制存在，再交给 Playwright。
 * 缺依赖/缺浏览器时**明确跳过并退 2**（不是 0），避免 CI 把「没跑」当「通过」。
 * 本脚本不在 `npm run ci` 路径里：离线门禁不依赖浏览器。
 *
 * 用法：node scripts/e2e.mjs [playwright test 参数...]
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

const r = spawnSync(process.execPath, [cli, 'test', ...process.argv.slice(2)], { stdio: 'inherit', cwd: root });
process.exit(r.status === null ? 1 : r.status);
