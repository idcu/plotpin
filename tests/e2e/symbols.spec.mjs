/* C-04 符号库：别名搜索、预览、放置、旋转/真实尺寸、恶意 SVG 拒绝、自有符号 JSON 往返 */
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
}

test('C-04 符号库：别名搜索、分类筛选、放置与旋转/尺寸', async ({ page }) => {
  await openApp(page);
  await page.locator('#tabBtn-symbols').click();
  await expect(page.locator('#tab-symbols')).toHaveClass(/active/);
  await expect(page.locator('#symbolCount')).toContainText('36');
  await expect(page.locator('#symbolCat option')).toHaveCount(7);

  /* 名称/别名搜索 */
  await page.locator('#symbolSearch').fill('烟感');
  await expect(page.locator('.symbol-tile')).toHaveCount(1);
  await expect(page.locator('.symbol-tile')).toContainText('烟感探测器');

  /* 分类筛选：消防 6 个 */
  await page.locator('#symbolSearch').fill('');
  await page.locator('#symbolCat').selectOption('消防');
  await expect(page.locator('.symbol-tile')).toHaveCount(6);
  await expect(page.locator('.symbol-tile').first()).toContainText('烟感探测器');

  /* 放置：设置旋转角与真实尺寸，点击符号 → 点工具 → 画布单击 */
  await page.locator('#symbolCat').selectOption('');
  await page.locator('#symbolSearch').fill('枪机');
  await page.locator('#symbolAngle').fill('30');
  await page.locator('#symbolPhys').fill('2');
  await page.locator('.symbol-tile[data-symbol-id="sym.camera_gun"]').click();
  await expect.poll(() => page.evaluate(() => currentTool)).toBe('point');
  await expect.poll(() => page.evaluate(() => document.getElementById('pointType').value)).toBe('sym.camera_gun');
  const before = await page.evaluate(() => state.objects.length);
  await page.locator('#canvas').click({ position: { x: 320, y: 240 } });
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(before + 1);
  const placed = await page.evaluate(() => {
    const o = state.objects[state.objects.length - 1];
    return { typeId: o.typeId, angle: o.angle, phys: o.phys, symbol: !!getType(o.typeId).symbol };
  });
  expect(placed.typeId).toBe('sym.camera_gun');
  expect(placed.symbol).toBe(true);
  expect(placed.angle).toBe(30);
  expect(placed.phys).toBe(2);
});

test('C-04 符号库：恶意 SVG 逐条拒绝且不写入类型', async ({ page }) => {
  await openApp(page);
  const before = await page.evaluate(() => state.objectTypes.length);
  const cases = [
    { name: 'evil-script.svg', body: '<svg><script>alert(1)</script><path d="M0 0L10 10"/></svg>', reason: '脚本' },
    { name: 'evil-onload.svg', body: '<svg><path d="M0 0L10 10" onload="alert(1)"/></svg>', reason: 'on* 事件' },
    { name: 'evil-href.svg', body: '<svg><path d="M0 0L10 10" href="https://evil.example/x.svg"/></svg>', reason: '外部资源' },
    { name: 'evil-deep.svg', body: '<svg>' + '<g>'.repeat(20) + '<path d="M0 0L10 10"/>' + '</g>'.repeat(20) + '</svg>', reason: '嵌套过深' },
    { name: 'evil-big.svg', body: '<svg><path d="M0 0L10 10"/>' + ' '.repeat(70000) + '</svg>', reason: '64 KB' }
  ];
  for (const c of cases) {
    await page.locator('#symFileInput').setInputFiles({ name: c.name, mimeType: 'image/svg+xml', buffer: Buffer.from(c.body) });
    await expect(page.locator('#toastWrap')).toContainText(c.reason);
    expect(await page.evaluate(() => state.objectTypes.length)).toBe(before);
  }
});

test('C-04 自有符号：JSON 仅导出当前工程，导入只写入当前工程', async ({ page }) => {
  await openApp(page);
  await page.locator('#tabBtn-symbols').click();
  const valid = '<svg viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/><circle cx="12" cy="12" r="4"/></svg>';
  await page.locator('#symFileInput').setInputFiles({ name: 'custom-shape.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(valid) });
  await expect.poll(() => page.evaluate(() => state.objectTypes.filter(t => t.symbol && !SYMBOL_LIBRARY.some(s => s.id === t.id)).length)).toBe(1);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#symbolExportJsonBtn').click()
  ]);
  const path = await download.path();
  const bundle = JSON.parse(await (await import('node:fs/promises')).readFile(path, 'utf8'));
  expect(bundle.schema).toBe('plotpin.symbols/v1');
  expect(bundle.symbols.length).toBe(1);

  /* 模拟另一个工程：内存重置后导入，只增加当前工程类型 */
  await page.evaluate(() => { state = createInitialState(); resetFrameRef(); refreshUI(); });
  expect(await page.evaluate(() => state.objectTypes.filter(t => t.symbol && !SYMBOL_LIBRARY.some(s => s.id === t.id)).length)).toBe(0);
  await page.locator('#symbolJsonInput').setInputFiles({ name: 'bundle.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle)) });
  await expect.poll(() => page.evaluate(() => state.objectTypes.filter(t => t.symbol && !SYMBOL_LIBRARY.some(s => s.id === t.id)).length)).toBe(1);
  expect(await page.evaluate(() => state.objectTypes.some(t => t.name.includes('custom-shape')))).toBe(true);
});
