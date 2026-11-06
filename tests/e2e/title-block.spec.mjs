import { test, expect } from '@playwright/test';
import { readFileSync, statSync } from 'node:fs';

test('B-07：配置标题栏 → 导出 SVG 回读文字 → PNG/PDF 同链路可用', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();

  /* 放一个可见对象：图例按实际类型/图层生成，导出里应出现「图例」与类型计数 */
  await page.evaluate(() => {
    state.objects.push(baseObject('point', 'point.marker', { name: 'TB1', x: 5, y: 5 }));
    commitChange('B-07 测试对象');
  });

  await page.selectOption('#exportKind', 'title-block');
  await page.click('#exportBtn');
  await expect(page.locator('#modalBackdrop')).toHaveClass(/show/);
  await expect(page.locator('#modalTitle')).toContainText('图框');

  await page.check('#tb_enabled');
  await page.fill('#tb_projectName', 'B-07 工程');
  await page.fill('#tb_drawingNo', 'T-101');
  await page.fill('#tb_scale', '1:100');
  await page.fill('#tb_date', '2026-11-06');
  await page.fill('#tb_version', 'V1.0');
  await page.fill('#tb_designer', '设计甲');
  await page.fill('#tb_checker', '审核乙');
  await page.fill('#tb_unitName', '某单位');
  await page.click('#modalFooter button:has-text("保存")');
  await expect(page.locator('#modalBackdrop')).not.toHaveClass(/show/);

  const saved = await page.evaluate(() => ({
    enabled: state.meta.titleBlock.enabled,
    fields: state.meta.titleBlock.fields
  }));
  expect(saved.enabled).toBe(true);
  expect(saved.fields.drawingNo).toBe('T-101');

  /* SVG：标题栏文字必须原样回读，且走统一转义 */
  const svgWait = page.waitForEvent('download');
  await page.selectOption('#exportKind', 'svg');
  await page.click('#exportBtn');
  const svgDl = await svgWait;
  const svg = readFileSync(await svgDl.path(), 'utf8');
  expect(svg).toContain('工程名');
  expect(svg).toContain('B-07 工程');
  expect(svg).toContain('T-101');
  expect(svg).toContain('1:100');
  expect(svg).toContain('2026-11-06');
  expect(svg).toContain('>图例<');
  expect(svg).not.toContain('<script>');

  /* PNG / PDF：同一条导出链路上必须成功产出（PDF 为位图页，文字不可检索） */
  const pngWait = page.waitForEvent('download');
  await page.selectOption('#exportKind', 'png');
  await page.click('#exportBtn');
  const pngDl = await pngWait;
  const pngPath = await pngDl.path();
  const pngHead = readFileSync(pngPath).subarray(0, 8);
  expect([...pngHead]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(statSync(pngPath).size).toBeGreaterThan(10000);

  const pdfWait = page.waitForEvent('download');
  await page.selectOption('#exportKind', 'pdf');
  await page.click('#exportBtn');
  const pdfDl = await pdfWait;
  const pdfPath = await pdfDl.path();
  expect(readFileSync(pdfPath).subarray(0, 5).toString()).toBe('%PDF-');
  expect(statSync(pdfPath).size).toBeGreaterThan(10000);

  expect(errors).toEqual([]);
});
