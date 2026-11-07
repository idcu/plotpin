/* D-05 插件清单导入与管理面板（会话内）：合法导入 / 拒绝不改状态 / 卸载撤销注册 */
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
}

async function openSettings(page) {
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#pluginPanel')).toBeVisible();
}

function manifest(over) {
  return Object.assign({
    schema: 'plotpin.plugin/v1',
    id: 'manifest.demo',
    name: '清单示例插件',
    version: '1.0.0',
    apiVersion: '1.0',
    capabilities: ['export'],
    code: 'PlotPin.registerExporter({id:"manifest.demo",label:"清单导出",ext:".txt",mime:"text/plain",run:function(ctx){ctx.download("hello","manifest-demo.txt");}});'
  }, over || {});
}

async function feed(page, value) {
  await page.setInputFiles('#pluginFile', {
    name: 'plugin.json',
    mimeType: 'application/json',
    buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))
  });
}

test('D-05 合法清单：导入后导出器可用，面板可见，卸载后撤销', async ({ page }) => {
  await openApp(page);
  await openSettings(page);
  page.on('dialog', d => d.accept());
  await expect.poll(() => page.evaluate(() => window.PlotPin.listPlugins().length)).toBe(0);
  await feed(page, manifest());

  await expect.poll(() => page.evaluate(() => window.PlotPin.listPlugins().length)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window.PlotPin.listPlugins()[0] || {}).status)).toBe('active');
  await expect(page.locator('#toastWrap')).toContainText('插件已加载：manifest.demo');
  await expect.poll(() => page.evaluate(() => window.PlotPin.listExporters().some(e => e.id === 'manifest.demo'))).toBe(true);
  await expect(page.locator('#pluginPanel')).toContainText('manifest.demo');
  await expect.poll(() => page.evaluate(() => Array.from(document.querySelectorAll('#exportKind option')).some(o => o.value === 'plugin:manifest.demo'))).toBe(true);

  const ran = await page.evaluate(() => window.exportViaPlugin('manifest.demo'));
  expect(ran.ok).toBe(true);

  await page.locator('[data-plugin-unload="manifest.demo"]').click();
  await expect.poll(() => page.evaluate(() => window.PlotPin.listPlugins().length)).toBe(0);
  expect(await page.evaluate(() => window.PlotPin.listExporters().some(e => e.id === 'manifest.demo'))).toBe(false);
  await expect.poll(() => page.evaluate(() => Array.from(document.querySelectorAll('#exportKind option')).some(o => o.value === 'plugin:manifest.demo'))).toBe(false);
  await expect(page.locator('#pluginPanel')).not.toContainText('manifest.demo');
});

test('D-05 非法清单：缺字段 / 超限 / 未知能力被拒，注册表与导出器不变', async ({ page }) => {
  await openApp(page);
  await openSettings(page);
  let confirms = 0;
  page.on('dialog', d => { confirms++; d.accept(); });
  const before = await page.evaluate(() => ({
    plugins: window.PlotPin.listPlugins().length,
    exporters: window.PlotPin.listExporters().map(e => e.id)
  }));

  const bad = [
    '{',
    manifest({ name: ' ' }),
    manifest({ schema: 'plotpin.plugin/v2' }),
    manifest({ version: '1.0' }),
    manifest({ capabilities: ['network'] }),
    manifest({ code: 'x'.repeat(65537) }),
    manifest({ filler: 'x'.repeat(200000) })
  ];
  for (const b of bad) {
    await feed(page, b);
    await expect(page.locator('#toastWrap')).toContainText('插件清单被拒');
  }
  expect(confirms).toBe(0);
  const after = await page.evaluate(() => ({
    plugins: window.PlotPin.listPlugins().length,
    exporters: window.PlotPin.listExporters().map(e => e.id)
  }));
  expect(after).toEqual(before);
  await expect(page.locator('#pluginPanel')).toContainText('尚未导入插件');
});
