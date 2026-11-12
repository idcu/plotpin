/* G-1/G-2 幽灵参考层：会话级导入/透明度/清除，且不进入工程数据与导出 */
import { test, expect } from '@playwright/test';

/* 1×1 红色 PNG：只验证管线，不做像素比对 */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('幽灵参考层：导入 → 透明度 → 清除，不落 state/JSON', async ({ page }) => {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
  await page.evaluate(() => { try { closeModal(); } catch (e) {} });

  /* 1. 设置面板提供入口；导入前后静态层签名变化 */
  /* V-5 起签名末尾多了 refSig 一段：幽灵层取倒数第二段 */
  const ghostPart = () => page.evaluate(() => sceneStaticContentKey(wrap.clientWidth, wrap.clientHeight, worldDims()).split('|').slice(0, -1).pop());
  await page.click('#settingsBtn');
  await expect(page.locator('#ghostPick')).toBeVisible();
  expect(await ghostPart()).toBe('0');
  await page.setInputFiles('#ghostFile', { name: 'ref.png', mimeType: 'image/png', buffer: PNG });
  await expect.poll(() => page.evaluate(() => !!ghostLayer)).toBe(true);
  expect(await ghostPart()).not.toBe('0');

  /* 2. 参考层只活在运行时：state/persistableState 里没有 ghost 字段 */
  expect(await page.evaluate(() => JSON.stringify(persistableState()).toLowerCase().includes('ghost'))).toBe(false);
  expect(await page.evaluate(() => Object.keys(state).filter(k => /ghost/i.test(k)).length)).toBe(0);

  /* 3. 透明度即时生效并进入静态层签名 */
  await page.locator('#ghostOpacity').fill('80');
  await expect.poll(() => page.evaluate(() => Math.round(ghostLayer.opacity * 100))).toBe(80);

  /* 4. 清除后参考层为空，静态层回到无参考图状态 */
  await page.click('#ghostClear');
  await expect.poll(() => page.evaluate(() => ghostLayer === null)).toBe(true);
  expect(await ghostPart()).toBe('0');
});
