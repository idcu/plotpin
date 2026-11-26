/* G-01 比例预设与标定误差可见：图纸比例 + 扫描 DPI 直接换算 m/px */
import { test, expect } from '@playwright/test';

async function boot(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state === 'object' && typeof afterStateLoaded === 'function');
  await page.waitForTimeout(200);
  return errors;
}

async function seedImage(page) {
  await page.evaluate(async () => {
    state.background = { kind: 'image', width: 1600, height: 1200, metersPerPixel: 0.05, calibrated: false, transform: null, assetId: '' };
    state.site = null;
    state.objects = [];
    bgImage = null;
    await afterStateLoaded(false);
  });
}

test('G-01 应用 1:100@300dpi：m/px 精确、1000px→8.47m、清空仿射', async ({ page }) => {
  const errors = await boot(page);
  await seedImage(page);
  await page.click('#bgBtn');
  await expect(page.locator('#presetScale')).toBeVisible();
  await expect(page.locator('#presetChip')).toContainText('1 px = 0.008467 m（1:100 @ 300dpi）');
  await page.selectOption('#presetScale', '100');
  await page.selectOption('#presetDpi', '300');
  await page.click('#presetApply');
  await expect(page.locator('#modalFooter button', { hasText: '确定' })).toBeVisible();
  await page.locator('#modalFooter button', { hasText: '确定' }).click();
  const r = await page.evaluate(() => {
    const bg = state.background;
    const mpp = bg.metersPerPixel;
    const len = objectLength(baseObject('line', 'line.polyline', { points: [[0, 0], [1000 * mpp, 0]] }));
    return { mpp, calibrated: bg.calibrated, transform: bg.transform, len, text: fmt(len) };
  });
  expect(r.mpp).toBeCloseTo(100 * 0.0254 / 300, 12);
  expect(r.calibrated).toBe(true);
  expect(r.transform).toBe(null);
  expect(r.len).toBeCloseTo(8.4666667, 6);
  expect(r.text).toBe('8.47');
  expect(errors).toEqual([]);
});

/* 生成只含一行文本的最小 PDF（xref 偏移按实际字节计算） */
function buildPdf(text) {
  const content = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(o => { pdf += String(o).padStart(10, '0') + ' 00000 n \n'; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

test('G-01 PDF 文本层检测 1:100：仅提示，不改标定', async ({ page }) => {
  const errors = await boot(page);
  const before = await page.evaluate(async () => {
    state.background = { kind: 'empty', metersPerPixel: 0.05 };
    state.objects = [];
    await afterStateLoaded(false);
    return state.background.metersPerPixel;
  });
  await page.setInputFiles('#fileInput', { name: 'plan.pdf', mimeType: 'application/pdf', buffer: buildPdf('SITE PLAN 1:100') });
  await expect(page.locator('#toastWrap')).toContainText('检测到图纸比例 1:100');
  const after = await page.evaluate(() => ({
    mpp: state.background.metersPerPixel,
    texts: state.objects.filter(o => o.kind === 'text').length
  }));
  expect(after.mpp).toBe(before);
  expect(after.texts).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('G-01 取消确认不改状态；矢量场地不出现比例预设', async ({ page }) => {
  const errors = await boot(page);
  await seedImage(page);
  await page.click('#bgBtn');
  await page.selectOption('#presetScale', '500');
  await page.selectOption('#presetDpi', '150');
  await page.click('#presetApply');
  await page.locator('#modalFooter button', { hasText: '取消' }).click();
  expect(await page.evaluate(() => state.background.metersPerPixel)).toBe(0.05);

  await page.evaluate(async () => {
    state.background = { kind: 'empty' };
    state.site = { kind: 'rect', shape: { type: 'rect', x: 0, y: 0, w: 100, h: 70 } };
    await afterStateLoaded(false);
  });
  await page.click('#bgBtn');
  await expect(page.locator('#presetScale')).toHaveCount(0);
  await expect(page.locator('#presetApply')).toHaveCount(0);
  expect(errors).toEqual([]);
});
