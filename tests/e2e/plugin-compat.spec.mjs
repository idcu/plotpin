/* D-06 插件 API 兼容矩阵：1.0 装 1.1 通过、1.2/2.0/畸形拒绝、未知能力拒绝 */
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
    id: 'compat.demo',
    name: '兼容矩阵示例',
    version: '1.0.0',
    apiVersion: '1.0',
    capabilities: ['export'],
    code: 'PlotPin.registerExporter({id:"compat.demo",label:"矩阵导出",ext:".txt",mime:"text/plain",run:function(ctx){ctx.download("ok","compat-demo.txt");}});'
  }, over || {});
}

async function feed(page, value) {
  await page.setInputFiles('#pluginFile', {
    name: 'plugin.json',
    mimeType: 'application/json',
    buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))
  });
}

test('D-06 版本矩阵：公开预检回传 major/minor，越界与畸形给可读原因', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    const P = window.PlotPin;
    const v = s => P.checkPlugin({ apiVersion: s, capabilities: [] });
    return {
      host: P.apiVersion,
      one0: v('1.0'),
      one00: v('1.0.0'),
      one1: v('1.1'),
      one2: v('1.2'),
      two0: v('2.0'),
      bad: v('1.x'),
      missing: v(undefined),
      unknown: P.checkPlugin({ apiVersion: '1.0', capabilities: ['network'] })
    };
  });
  expect(r.host).toBe('1.1.0');
  expect(r.one0.ok).toBe(true);
  expect(r.one0.major).toBe(1);
  expect(r.one0.minor).toBe(0);
  expect(r.one00.ok).toBe(true);
  expect(r.one1.ok).toBe(true);
  expect(r.one1.major).toBe(1);
  expect(r.one1.minor).toBe(1);
  expect(r.one2.ok).toBe(false);
  expect(r.one2.reason).toContain('次版本');
  expect(r.one2.major).toBe(1);
  expect(r.one2.minor).toBe(2);
  expect(r.two0.ok).toBe(false);
  expect(r.two0.reason).toContain('主版本');
  expect(r.two0.major).toBe(2);
  expect(r.bad.ok).toBe(false);
  expect(r.bad.reason).toContain('格式非法');
  expect(r.bad.major).toBeNull();
  expect(r.missing.ok).toBe(false);
  expect(r.missing.reason).toContain('apiVersion');
  expect(r.missing.major).toBeNull();
  expect(r.unknown.ok).toBe(false);
  expect(r.unknown.reason).toContain('未知能力');
});

test('D-06 1.0 清单装 1.1 宿主：导入可用、导出可执行、卸载撤销', async ({ page }) => {
  await openApp(page);
  await openSettings(page);
  page.on('dialog', d => d.accept());
  await feed(page, manifest());
  await expect.poll(() => page.evaluate(() => window.PlotPin.listPlugins().length)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window.PlotPin.listPlugins()[0] || {}).status)).toBe('active');
  const active = await page.evaluate(() => window.PlotPin.listPlugins()[0]);
  expect(active.apiVersion).toBe('1.0');
  await expect.poll(() => page.evaluate(() => window.PlotPin.listExporters().some(e => e.id === 'compat.demo'))).toBe(true);
  const ran = await page.evaluate(() => window.exportViaPlugin('compat.demo'));
  expect(ran.ok).toBe(true);

  await page.locator('[data-plugin-unload="compat.demo"]').click();
  await expect.poll(() => page.evaluate(() => window.PlotPin.listPlugins().length)).toBe(0);
  expect(await page.evaluate(() => window.PlotPin.listExporters().some(e => e.id === 'compat.demo'))).toBe(false);
});

test('D-06 越界清单：1.2 / 2.0 / 畸形 / 缺失版本均被拒且注册表不变', async ({ page }) => {
  await openApp(page);
  await openSettings(page);
  let confirms = 0;
  page.on('dialog', d => { confirms++; d.accept(); });
  const before = await page.evaluate(() => window.PlotPin.listExporters().map(e => e.id));

  await feed(page, manifest({ apiVersion: '1.2' }));
  await expect(page.locator('#toastWrap')).toContainText('次版本高于宿主');
  await feed(page, manifest({ apiVersion: '2.0' }));
  await expect(page.locator('#toastWrap')).toContainText('主版本不兼容');
  await feed(page, manifest({ apiVersion: '1.x' }));
  await expect(page.locator('#toastWrap')).toContainText('格式非法');
  const noVersion = manifest();
  delete noVersion.apiVersion;
  await feed(page, noVersion);
  await expect(page.locator('#toastWrap')).toContainText('未声明 apiVersion');

  expect(confirms).toBe(0);
  expect(await page.evaluate(() => window.PlotPin.listPlugins().length)).toBe(0);
  expect(await page.evaluate(() => window.PlotPin.listExporters().map(e => e.id))).toEqual(before);
  await expect(page.locator('#pluginPanel')).toContainText('尚未导入插件');

  await feed(page, manifest({ apiVersion: '1.1' }));
  await expect.poll(() => page.evaluate(() => window.PlotPin.listPlugins().length)).toBe(1);
  await expect(page.locator('#pluginPanel')).toContainText('compat.demo');
});
