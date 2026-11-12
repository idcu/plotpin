import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* P2-01（G-03）：交付状态 + 「仅导出已交付」。
   1) 单对象标记 → 按钮文案与清单徽标变化；开启过滤后 CSV/XLSX/图纸/PDF 清单同口径只含已交付；
   2) 全无已交付时导出中止，不产生下载。 */

test('P2-01：标记交付后台账/图纸/PDF 清单只含已交付', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();

  await page.evaluate(() => {
    const a = baseObject('point', 'point.marker', { name: 'DELIV-A', x: 10, y: 10 });
    const b = baseObject('point', 'point.marker', { name: 'DELIV-B', x: 60, y: 30 });
    state.objects.push(a, b);
    commitChange('P2-01 交付测试');
    selectedIds.clear(); selectedIds.add(a.id);
    switchTab('props'); renderProps();
  });

  const pngAll = await page.evaluate(() => renderToDataURL(1));

  /* 单对象按钮：标记交付 → 文案切换；清单出现「已交付」徽标 */
  await page.click('[data-action="publish"]');
  await expect(page.locator('[data-action="publish"]')).toContainText('取消交付');
  await expect(page.locator('#objectTbody')).toContainText('已交付');

  /* 设置里开启「仅导出已交付对象」 */
  await page.click('#settingsBtn');
  await page.check('#setExportOnlyDelivered');
  await page.locator('#modalFooter button.primary').click();

  const r = await page.evaluate(() => ({
    csv: delimitedText(','),
    xlsx: xlsxExportTable().flat(),
    svg: buildSceneSvg(),
    listNames: pdfDrawObjectsFor(null).map(o => o.name),
    rows: objectRowsAll().map(x => x['编号']),
    pngFiltered: renderToDataURL(1)
  }));
  expect(r.rows).toEqual(['DELIV-A']);
  expect(r.csv).toContain('DELIV-A');
  expect(r.csv).not.toContain('DELIV-B');
  expect(r.xlsx).toContain('DELIV-A');
  expect(r.xlsx).not.toContain('DELIV-B');
  expect(r.svg).toContain('DELIV-A');
  expect(r.svg).not.toContain('DELIV-B');
  expect(r.listNames).toEqual(['DELIV-A']);
  /* 图纸像素确实少了未交付对象 */
  expect(r.pngFiltered).not.toBe(pngAll);

  /* UI 真导出 CSV */
  const dl = page.waitForEvent('download');
  await page.selectOption('#exportKind', 'csv');
  await page.click('#exportBtn');
  const csv = readFileSync(await (await dl).path(), 'utf8');
  expect(csv).toContain('DELIV-A');
  expect(csv).not.toContain('DELIV-B');
});

test('P2-01：全无已交付对象时导出中止且不生成文件', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();

  await page.evaluate(() => {
    state.objects.push(baseObject('point', 'point.marker', { name: 'RAW-1', x: 10, y: 10 }));
    state.settings.exportOnlyDelivered = true;
    commitChange('P2-01 空集拦截');
  });

  const downloads = [];
  page.on('download', d => downloads.push(d));
  await page.selectOption('#exportKind', 'csv');
  await page.click('#exportBtn');
  await expect(page.locator('#toastWrap')).toContainText('没有已交付对象');
  expect(downloads.length).toBe(0);
});
