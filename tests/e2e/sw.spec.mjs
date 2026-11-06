/* B-15：Service Worker 离线链路 —— 注册 → 版本化缓存 → 旧缓存清理 → 离线可打开
   在一个不加载业务脚本的同源空页面里注册，避免 app.js 的自动注册与测试安装互相竞态。 */
import { test, expect } from '@playwright/test';

test('SW：注册后缓存名带版本，旧缓存被清理，断网仍能打开页面', async ({ page, context }) => {
  await page.goto('/tests/fixtures/sw-test.html');

  /* 预置旧版本缓存，再走一次全新安装（install → activate 清理非当前版本 → claim） */
  await page.evaluate(async () => {
    const old = await caches.open('plotpin-v1');
    await old.put('/legacy.txt', new Response('stale'));
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  });

  await page.waitForFunction(async () => {
    const names = await caches.keys();
    const current = names.find(n => /^plotpin-v\d+$/.test(n) && n !== 'plotpin-v1');
    if (!current || names.includes('plotpin-v1')) return false;
    return (await (await caches.open(current)).keys()).length > 10;
  }, null, { timeout: 15000 });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 5000 });

  const cacheInfo = await page.evaluate(async () => {
    const names = await caches.keys();
    const current = names.find(n => /^plotpin-v\d+$/.test(n) && n !== 'plotpin-v1') || null;
    let entries = 0;
    if (current) entries = (await (await caches.open(current)).keys()).length;
    return { names, current, entries, controlled: !!navigator.serviceWorker.controller };
  });
  console.log('[B-15][sw] ' + JSON.stringify(cacheInfo));
  expect(cacheInfo.controlled).toBe(true);
  expect(cacheInfo.current).toBeTruthy();
  expect(cacheInfo.names).not.toContain('plotpin-v1');
  expect(cacheInfo.entries).toBeGreaterThan(10);

  /* 断网后打开业务页：由 SW 缓存回退，页面不白屏 */
  await context.setOffline(true);
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  expect(await page.evaluate(() => state.objects.length)).toBe(0);
  await context.setOffline(false);
});
