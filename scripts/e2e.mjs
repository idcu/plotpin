/**
 * e2e.mjs —— 浏览器级测试入口（开发期可选）
 *
 * 先确认 @playwright/test 与目标浏览器二进制存在，再交给 Playwright。
 * 缺依赖/缺浏览器时**明确跳过并退 2**（不是 0），避免 CI 把「没跑」当「通过」。
 * 本脚本不在 `npm run ci` 路径里：离线门禁不依赖浏览器。
 *
 * 用法：node scripts/e2e.mjs [--browser=chromium|firefox] [playwright test 参数...]
 * 默认 Chromium；Firefox 只是可复跑入口，不升格为门禁，也不代表支持承诺。
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

/* 解析 --browser=<name> / --browser <name>，其余参数原样透传 */
const args = process.argv.slice(2);
let browserName = 'chromium';
const bi = args.findIndex(a => a === '--browser' || a.startsWith('--browser='));
if (bi !== -1) {
  const raw = args[bi] === '--browser' ? args[bi + 1] : args[bi].split('=')[1];
  args.splice(bi, args[bi] === '--browser' ? 2 : 1);
  browserName = String(raw || '').toLowerCase();
}
if (browserName !== 'chromium' && browserName !== 'firefox') {
  console.error('[SKIP] 仅支持 --browser=chromium|firefox，收到：' + browserName);
  process.exit(2);
}

let engine = null;
try {
  ({ [browserName]: engine } = await import('@playwright/test'));
} catch (e) {
  console.error('[SKIP] @playwright/test 加载失败：' + e.message);
  process.exit(2);
}

let browserPath = '';
try { browserPath = engine.executablePath(); } catch (_) {}
if (!browserPath || !existsSync(browserPath)) {
  console.error(`[SKIP] 未找到 ${browserName} 浏览器二进制（${browserPath || '未知路径'}）：请先执行 npx playwright install ${browserName}`);
  process.exit(2);
}

const r = spawnSync(process.execPath, [cli, 'test', ...args], {
  stdio: 'inherit',
  cwd: root,
  env: { ...process.env, E2E_BROWSER: browserName }
});
process.exit(r.status === null ? 1 : r.status);
