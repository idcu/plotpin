/* playwright.config.mjs —— 浏览器级测试（开发期依赖 @playwright/test，不进发行包） */
import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 4173);
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.mjs',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE,
    browserName: 'chromium',
    headless: true,
    trace: 'off',
    screenshot: 'only-on-failure'
  },
  /* 浏览器 IndexedDB 仅在同源 http 下可用：先起本地静态服务器 */
  webServer: {
    command: 'node scripts/serve.mjs',
    url: `${BASE}/index.html`,
    reuseExistingServer: true,
    timeout: 20000,
    stdout: 'ignore'
  }
});
