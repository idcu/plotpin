import { test, expect } from '@playwright/test';
import { deflateSync } from 'node:zlib';

const PT_M = 0.0254 / 72;

/* 带 FlateDecode 内嵌图的单页 PDF：2×2 RGB 像素。用于验证底图走资产库，
   而不是只写运行时 dataUrl（旧实现自动保存后刷新即永久丢图）。 */
function pdfWithFlateImage() {
  const raw = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
  const flate = deflateSync(raw);
  const content = 'q 2 0 0 2 0 0 cm /Im0 Do Q\n';
  const obj = (n, body) => n + ' 0 obj\n' + body + '\nendobj\n';
  let s = '%PDF-1.4\n';
  s += obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  s += obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  s += obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 5 0 R /Resources << /XObject << /Im0 4 0 R >> >> >>');
  /* 图像对象含二进制流，不能走 obj()（它会在流数据前追加 endobj） */
  s += '4 0 obj\n<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ' + flate.length + ' >>\nstream\n';
  return Buffer.concat([
    Buffer.from(s, 'latin1'),
    flate,
    /* 紧贴 endstream：容器按 /Length 精确切片，多一个换行会被算进二进制流导致解压失败 */
    Buffer.from('endstream\nendobj\n', 'latin1'),
    Buffer.from(obj(5, '<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream'), 'latin1'),
    Buffer.from('%%EOF', 'latin1')
  ]);
}

/* 两页矢量 PDF：/Kids 顺序与对象编号相反（对象 5 是第一页 200×100，对象 3 是第二页 300×200）。
   每页一条 190/160 点的横线（>0.05m 去噪阈值）+ 一段文本，用于验证页序与各页独立原点。 */
function multiPagePdf() {
  const obj = (n, body) => n + ' 0 obj\n' + body + '\nendobj\n';
  const c1 = '0 0 m 190 0 l S\nBT /F1 10 Tf 50 80 Td (P1) Tj ET\n';
  const c2 = '0 0 m 160 0 l S\nBT /F1 10 Tf 30 80 Td (P2) Tj ET\n';
  let s = '%PDF-1.4\n';
  s += obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  s += obj(2, '<< /Type /Pages /Kids [5 0 R 3 0 R] /Count 2 >>');
  s += obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [10 20 310 220] /Contents 4 0 R >>');
  s += obj(4, '<< /Length ' + c2.length + ' >>\nstream\n' + c2 + 'endstream');
  s += obj(5, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 6 0 R >>');
  s += obj(6, '<< /Length ' + c1.length + ' >>\nstream\n' + c1 + 'endstream');
  return Buffer.from(s, 'utf8');
}

function singlePagePdf() {
  const obj = (n, body) => n + ' 0 obj\n' + body + '\nendobj\n';
  const c = '0 0 m 190 0 l S\nBT /F1 10 Tf 50 80 Td (ONLY) Tj ET\n';
  let s = '%PDF-1.4\n';
  s += obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  s += obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  s += obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R >>');
  s += obj(4, '<< /Length ' + c.length + ' >>\nstream\n' + c + 'endstream');
  return Buffer.from(s, 'utf8');
}

test('B-13：多页 PDF 按页序独立原点落位，不再同原点叠加', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();

  await page.setInputFiles('#fileInput', {
    name: 'two-pages.pdf', mimeType: 'application/pdf', buffer: multiPagePdf()
  });
  await expect(page.locator('#toastWrap')).toContainText(/2 页（独立原点）/);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(4);

  const r = await page.evaluate(() => ({
    lines: state.objects.filter(o => o.kind === 'line')
      .map(o => ({ min: Math.min(...o.points.map(p => p[0])), max: Math.max(...o.points.map(p => p[0])) })),
    texts: state.objects.filter(o => o.kind === 'text').map(o => ({ text: o.text, x: o.x })),
    siteW: state.site && state.site.shape ? state.site.shape.w : 0
  }));
  expect(r.lines.length).toBe(2);
  /* 页序：第一页（190 点线）在前；若按对象编号扫描会先拿到 300 点宽的第二页（150 点线） */
  expect(r.lines[0].max).toBeCloseTo(190 * PT_M, 6);
  /* 各页独立原点：第二页整体右移，两页水平区间不重叠 */
  expect(r.lines[1].min).toBeGreaterThan(r.lines[0].max);
  expect(r.texts.map(t => t.text)).toEqual(['P1', 'P2']);
  expect(r.texts[1].x).toBeGreaterThan(r.texts[0].x);
  /* 场地只扩不缩：布局总宽 200 + gap 24 + 300 = 524 点，必须被场地覆盖 */
  expect(r.siteW).toBeGreaterThanOrEqual(524 * PT_M);
  expect(errors).toEqual([]);
});

test('B-13：单页 PDF 保持旧行为（原点归零、无多页提示）', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  await page.setInputFiles('#fileInput', {
    name: 'one-page.pdf', mimeType: 'application/pdf', buffer: singlePagePdf()
  });
  await expect(page.locator('#toastWrap')).toContainText(/PDF 已导入：1 线/);
  await expect(page.locator('#toastWrap')).not.toContainText('独立原点');
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(2);

  const r = await page.evaluate(() => {
    const line = state.objects.find(o => o.kind === 'line');
    return { min: Math.min(...line.points.map(p => p[0])), text: state.objects.find(o => o.kind === 'text').x };
  });
  expect(r.min).toBeCloseTo(0, 6);
  expect(r.text).toBeCloseTo(50 * PT_M, 6);
});

test('N-03：PDF 内嵌底图走资产入库，自动保存 + 刷新后仍在', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();

  await page.setInputFiles('#fileInput', {
    name: 'scan.pdf', mimeType: 'application/pdf', buffer: pdfWithFlateImage()
  });
  await expect(page.locator('#toastWrap')).toContainText(/底图 2×2/);
  /* 导入当场就必须是资产引用：等自动保存兜底会掩盖「导入只写运行时 dataUrl」的缺陷 */
  const imported = await page.evaluate(() => ({ id: state.background.assetId, dataUrl: !!state.background.dataUrl }));
  expect(imported.id).toMatch(/^bg/);
  expect(imported.dataUrl).toBe(false);
  const id = imported.id;
  expect(await page.evaluate(async () => !!(await assetGet(state.background.assetId)))).toBe(true);

  await expect.poll(() => page.locator('#saveState').innerText(), { timeout: 15000 }).toContain('已自动保存');
  await page.reload();
  await expect(page.locator('#canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => state.background.assetId), { timeout: 15000 }).toBe(id);
  await expect.poll(() => page.evaluate(() => bgImageState), { timeout: 15000 }).toBe('ready');
  expect(await page.evaluate(() => !!bgImage)).toBe(true);
});
