/* playwright.perf.config.mjs —— 真实浏览器性能基线（独立于功能 e2e，不在 npm run ci 路径）
 *
 * 与 playwright.config.mjs 的区别：更大的超时、固定 1920×1080 视口、独立的端口，
 * 用例目录 tests/perf（testMatch 只收 *.perf.mjs），不会混进 npm run test:e2e。
 * 采集结果写入 test-results/perf-browser-baseline.json（已 gitignore）。
 */
import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.PERF_PORT || 4174);
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/perf',
  testMatch: '**/*.perf.mjs',
  timeout: 180000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE,
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    trace: 'off',
    screenshot: 'only-on-failure',
    /* heapUsed 走 performance.memory：精确内存信息需显式开启 */
    launchOptions: { args: ['--enable-precise-memory-info'] }
  },
  /* 浏览器 IndexedDB 仅在同源 http 下可用：先起本地静态服务器（独立端口，避免与功能 e2e 冲突） */
  webServer: {
    command: 'node scripts/serve.mjs',
    url: `${BASE}/index.html`,
    reuseExistingServer: true,
    timeout: 20000,
    stdout: 'ignore',
    env: { PORT: String(PORT) }
  }
});
