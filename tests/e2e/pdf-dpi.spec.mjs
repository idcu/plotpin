import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* P2-02（L-04）：PDF 图纸页分辨率自适应。默认 220dpi，300dpi 封顶 3000px；
   只放大位图不改版式（逻辑坐标仍 1748×1240），清单页尺寸不变。 */

test('P2-02：图纸页 DPI 档位与封顶，导出 PDF 可打开', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();

  const p220 = await page.evaluate(async () => {
    state.objects.push(baseObject('point', 'point.marker', { name: 'DPI-1', x: 10, y: 10 }));
    commitChange('P2-02 图纸 DPI');
    const r = await renderPdfDrawingPage(null, 1, 2);
    return { w: r.width, h: r.height, b64len: r.b64.length };
  });
  expect([p220.w, p220.h]).toEqual([2572, 1819]);
  expect(p220.b64len).toBeGreaterThan(1000);

  const p300 = await page.evaluate(async () => {
    state.settings.pdfDpi = 300;
    const r = await renderPdfDrawingPage(null, 1, 2);
    return { w: r.width, h: r.height };
  });
  expect([p300.w, p300.h]).toEqual([3000, 2121]);

  /* 清单页不随 DPI 改变 */
  const list = await page.evaluate(() => ({ w: PDF_LIST_PAGE.W, h: PDF_LIST_PAGE.H }));
  expect([list.w, list.h]).toEqual([1240, 1748]);

  /* 真实导出：文件头合法且不是空壳 */
  const dl = page.waitForEvent('download');
  await page.selectOption('#exportKind', 'pdf');
  await page.click('#exportBtn');
  const buf = readFileSync(await (await dl).path());
  expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(buf.length).toBeGreaterThan(10000);
});
