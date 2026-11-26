/* B1：Service Worker 更新原子性
   失败样本：已有一个 active 旧版本时，新版本预缓存有一项 404 → 新 SW 停在 waiting、旧缓存保留、
             STATUS 报告失败项数；正向样本：全部 200 → 正常升级并删除旧缓存。
   用 route 把首次注册的 sw.js 内容换成旧 VERSION，制造「已有旧版本 active」的真实升级场景。 */
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const SW_SRC = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
const SW_OLD = SW_SRC.replace(/const VERSION = '\d+';/, "const VERSION = '200';");

test.skip(process.env.E2E_ENTRY === 'dist', '单文件发行版无 SW 预缓存输入，SW 用例仅覆盖源码入口');

test('SW 原子性：预缓存有失败时新版本不激活，旧缓存保留且 STATUS 报告失败项', async ({ page, context }) => {
  await context.route('**/sw.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: SW_OLD }));
  await page.goto('/tests/fixtures/sw-test.html');
  await page.evaluate(() => navigator.serviceWorker.register('/sw.js', { scope: '/' }));
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
  const oldInfo = await page.evaluate(() => caches.keys());
  console.log('[B1][old] ' + JSON.stringify(oldInfo));
  expect(oldInfo).toContain('plotpin-v200');

  /* 切回真实 SW（VERSION 更高）+ 拦截一个预缓存输入，触发一次“会失败”的升级 */
  await context.unroute('**/sw.js');
  await context.route('**/js/core/render.js', r => r.fulfill({ status: 404, body: 'missing' }));
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));

  /* waitForFunction 不保证 await 异步谓词，这里用 expect.poll 轮询安装完成 */
  await expect.poll(async () => page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(reg && reg.waiting && reg.waiting.state === 'installed');
  }), { timeout: 30000 }).toBe(true);

  const info = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const names = await caches.keys();
    const entries = {};
    for (const n of names.filter(x => /^plotpin-v\d+$/.test(x))) {
      entries[n] = (await (await caches.open(n)).keys()).length;
    }
    return {
      names,
      entries,
      installing: !!reg.installing,
      waiting: !!reg.waiting,
      active: !!reg.active,
      controlled: !!navigator.serviceWorker.controller
    };
  });
  console.log('[B1][negative] ' + JSON.stringify(info));

  const status = await page.evaluate(() => new Promise(resolve => {
    navigator.serviceWorker.addEventListener('message', ev => {
      if (ev.data && ev.data.type === 'STATUS') resolve(ev.data);
    });
    navigator.serviceWorker.getRegistration().then(r => (r.waiting || r.active || r.installing).postMessage({ type: 'STATUS' }));
    setTimeout(() => resolve(null), 3000);
  }));
  console.log('[B1][negative][status] ' + JSON.stringify(status));
  expect(info.waiting).toBe(true);
  expect(info.active).toBe(true);
  expect(info.controlled).toBe(true);
  expect(info.names).toContain('plotpin-v200');
  expect(status).toBeTruthy();
  expect(status.failed).toBeGreaterThan(0);
  expect(status.total).toBeGreaterThan(10);
});

test('SW 原子性：全部成功时正常升级并删除旧缓存', async ({ page }) => {
  await page.goto('/tests/fixtures/sw-test.html');
  await page.evaluate(async () => {
    const old = await caches.open('plotpin-v1');
    await old.put('/legacy.txt', new Response('stale'));
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  });
  await expect.poll(async () => page.evaluate(async () => {
    const names = await caches.keys();
    const current = names.find(n => /^plotpin-v\d+$/.test(n) && n !== 'plotpin-v1');
    if (!current || names.includes('plotpin-v1')) return false;
    return (await (await caches.open(current)).keys()).length > 10;
  }), { timeout: 20000 }).toBe(true);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 5000 });

  const info = await page.evaluate(async () => ({
    names: await caches.keys(),
    controlled: !!navigator.serviceWorker.controller
  }));
  console.log('[B1][positive] ' + JSON.stringify(info));
  expect(info.controlled).toBe(true);
  expect(info.names).not.toContain('plotpin-v1');
});
