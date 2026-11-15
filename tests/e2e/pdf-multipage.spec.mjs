import { test, expect } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

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

/* 三页矢量 PDF：用于断言「只导入第 1 页」与页数提示。
   各页线长必须 > 0.05 m 去噪阈值（150 点 ≈ 0.053 m），否则该页只剩文字，多页对象数会少一个。 */
function threePagePdf() {
  const obj = (n, body) => n + ' 0 obj\n' + body + '\nendobj\n';
  const c1 = '0 0 m 190 0 l S\nBT /F1 10 Tf 50 80 Td (P1) Tj ET\n';
  const c2 = '0 0 m 160 0 l S\nBT /F1 10 Tf 30 80 Td (P2) Tj ET\n';
  const c3 = '0 0 m 150 0 l S\nBT /F1 10 Tf 20 80 Td (P3) Tj ET\n';
  let s = '%PDF-1.4\n';
  s += obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  s += obj(2, '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>');
  s += obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R >>');
  s += obj(4, '<< /Length ' + c1.length + ' >>\nstream\n' + c1 + 'endstream');
  s += obj(5, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 6 0 R >>');
  s += obj(6, '<< /Length ' + c2.length + ' >>\nstream\n' + c2 + 'endstream');
  s += obj(7, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Contents 8 0 R >>');
  s += obj(8, '<< /Length ' + c3.length + ' >>\nstream\n' + c3 + 'endstream');
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

/* E1：纯中文（GBK 字节）单页 PDF；用 latin1 落盘，保证字节原样进入解析器 */
function chinesePdf() {
  const obj = (n, body) => n + ' 0 obj\n' + body + '\nendobj\n';
  const gbk = String.fromCharCode(0xC5, 0xE4, 0xB5, 0xE7, 0xCF, 0xE4);
  const c = '0 0 m 190 0 l S\nBT /F1 10 Tf 50 80 Td (' + gbk + ') Tj ET\n';
  let s = '%PDF-1.4\n';
  s += obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  s += obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  s += obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R >>');
  s += obj(4, '<< /Length ' + c.length + ' >>\nstream\n' + c + 'endstream');
  return Buffer.from(s, 'latin1');
}

/* 多页 PDF 现在先弹「PDF 导入预检」：默认「仅第 1 页」，点「导入」沿用既有单页路径。
   这里只加交互步骤，B-13 的断言保持原样。 */
async function confirmPdfPicker(page) {
  await expect(page.locator('#modalBackdrop.show')).toBeVisible();
  await page.click('#pdfPickImport');
  await expect(page.locator('#modalBackdrop.show')).toHaveCount(0);
}

test('E1：纯中文 PDF 文字完整导入（GBK 编码）', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  await page.setInputFiles('#fileInput', {
    name: 'cn.pdf', mimeType: 'application/pdf', buffer: chinesePdf()
  });
  await expect.poll(() => page.evaluate(() =>
    state.objects.filter(o => o.kind === 'text').map(o => o.text))).toEqual(['配电箱']);
  await expect(page.locator('#toastWrap')).not.toContainText('无法解码');
  expect(errors).toEqual([]);
});

test('B-13：多页 PDF 只导入第 1 页并提示页数', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();

  await page.setInputFiles('#fileInput', {
    name: 'two-pages.pdf', mimeType: 'application/pdf', buffer: multiPagePdf()
  });
  await confirmPdfPicker(page);
  await expect(page.locator('#toastWrap')).toContainText(/共 2 页，已导入第 1 页/);
  await expect(page.locator('#toastWrap')).not.toContainText('独立原点');
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(2);

  const r = await page.evaluate(() => ({
    lines: state.objects.filter(o => o.kind === 'line')
      .map(o => ({ min: Math.min(...o.points.map(p => p[0])), max: Math.max(...o.points.map(p => p[0])) })),
    texts: state.objects.filter(o => o.kind === 'text').map(o => ({ text: o.text, x: o.x }))
  }));
  expect(r.lines.length).toBe(1);
  /* 只保留第 1 页的 190 点线；第 2 页的 160 点线不得出现 */
  expect(r.lines[0].max).toBeCloseTo(190 * PT_M, 6);
  expect(r.texts.map(t => t.text)).toEqual(['P1']);
  expect(r.texts[0].x).toBeCloseTo(50 * PT_M, 6);
  expect(errors).toEqual([]);
});

test('B-13：三页 PDF 只导入第 1 页，页数提示正确', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  await page.setInputFiles('#fileInput', {
    name: 'three-pages.pdf', mimeType: 'application/pdf', buffer: threePagePdf()
  });
  await confirmPdfPicker(page);
  await expect(page.locator('#toastWrap')).toContainText(/共 3 页，已导入第 1 页/);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(2);

  const r = await page.evaluate(() => ({
    lines: state.objects.filter(o => o.kind === 'line')
      .map(o => ({ max: Math.max(...o.points.map(p => p[0])) })),
    texts: state.objects.filter(o => o.kind === 'text').map(o => o.text)
  }));
  expect(r.lines.length).toBe(1);
  expect(r.lines[0].max).toBeCloseTo(190 * PT_M, 6);
  expect(r.texts).toEqual(['P1']);
});

test('M1：显式选 1-3 页，三页横向并排且各归其图层', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  await page.setInputFiles('#fileInput', {
    name: 'three-pages.pdf', mimeType: 'application/pdf', buffer: threePagePdf()
  });
  await expect(page.locator('#modalBackdrop.show')).toBeVisible();
  await page.check('input[name="pdfPageMode"][value="range"]');
  await page.fill('#pdfPageRange', '1-3');
  await expect(page.locator('#pdfPickSummary')).toContainText('已选 3 页');
  await page.click('#pdfPickImport');
  await expect(page.locator('#modalBackdrop.show')).toHaveCount(0);
  await expect(page.locator('#toastWrap')).toContainText(/共 3 页，已导入第 1、2、3 页/);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(6);

  const r = await page.evaluate(() => {
    const layerName = id => (state.layers.find(l => l.id === id) || {}).name || '';
    const out = { layers: state.layers.filter(l => /^PDF 第/.test(l.name)).map(l => l.name), pages: {} };
    for (const o of state.objects) {
      const n = layerName(o.layerId);
      const p = out.pages[n] = out.pages[n] || { min: Infinity, max: -Infinity, texts: [] };
      if (o.kind === 'line') {
        p.min = Math.min(p.min, ...o.points.map(q => q[0]));
        p.max = Math.max(p.max, ...o.points.map(q => q[0]));
      } else if (o.kind === 'text') p.texts.push({ text: o.text, x: o.x });
    }
    return out;
  });
  expect(r.layers).toEqual(['PDF 第 1 页', 'PDF 第 2 页', 'PDF 第 3 页']);
  /* 第 1 页锚定原点，第 2/3 页 = 前页 x + 页宽(米) + 1 m 间距 */
  const dx2 = 200 * PT_M + 1, dx3 = dx2 + 300 * PT_M + 1;
  expect(r.pages['PDF 第 1 页'].min).toBeCloseTo(0, 6);
  expect(r.pages['PDF 第 1 页'].max).toBeCloseTo(190 * PT_M, 6);
  expect(r.pages['PDF 第 2 页'].min).toBeCloseTo(dx2, 6);
  expect(r.pages['PDF 第 2 页'].max).toBeCloseTo(dx2 + 160 * PT_M, 6);
  expect(r.pages['PDF 第 3 页'].min).toBeCloseTo(dx3, 6);
  expect(r.pages['PDF 第 3 页'].max).toBeCloseTo(dx3 + 150 * PT_M, 6);
  expect(r.pages['PDF 第 1 页'].texts.map(t => t.text)).toEqual(['P1']);
  expect(r.pages['PDF 第 1 页'].texts[0].x).toBeCloseTo(50 * PT_M, 6);
  expect(r.pages['PDF 第 2 页'].texts[0].text).toBe('P2');
  expect(r.pages['PDF 第 2 页'].texts[0].x).toBeCloseTo(dx2 + 30 * PT_M, 6);
  expect(r.pages['PDF 第 3 页'].texts[0].text).toBe('P3');
  expect(r.pages['PDF 第 3 页'].texts[0].x).toBeCloseTo(dx3 + 20 * PT_M, 6);
  expect(errors).toEqual([]);
});

test('M1：只选 2-3 页时，所选第一页锚定原点，第 1 页不导入', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  await page.setInputFiles('#fileInput', {
    name: 'three-pages.pdf', mimeType: 'application/pdf', buffer: threePagePdf()
  });
  await page.check('input[name="pdfPageMode"][value="range"]');
  await page.fill('#pdfPageRange', '2-3');
  await page.click('#pdfPickImport');
  await expect(page.locator('#toastWrap')).toContainText(/共 3 页，已导入第 2、3 页/);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(4);

  const r = await page.evaluate(() => ({
    layers: state.layers.filter(l => /^PDF 第/.test(l.name)).map(l => l.name),
    texts: state.objects.filter(o => o.kind === 'text').map(o => o.text),
    lines: state.objects.filter(o => o.kind === 'line').map(o => Math.min(...o.points.map(p => p[0])))
  }));
  expect(r.layers).toEqual(['PDF 第 2 页', 'PDF 第 3 页']);
  expect(r.texts).toEqual(['P2', 'P3']);
  expect(r.lines[0]).toBeCloseTo(0, 6);
  expect(r.lines[1]).toBeCloseTo(300 * PT_M + 1, 6);
});

test('M1：非法页范围即时提示且导入按钮禁用，取消则整份不导入', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  await page.setInputFiles('#fileInput', {
    name: 'three-pages.pdf', mimeType: 'application/pdf', buffer: threePagePdf()
  });
  await page.check('input[name="pdfPageMode"][value="range"]');
  await page.fill('#pdfPageRange', '9-2');
  await expect(page.locator('#pdfPickSummary')).toContainText('页码必须在 1–3 内');
  await expect(page.locator('#pdfPickImport')).toBeDisabled();
  await page.fill('#pdfPageRange', '');
  await expect(page.locator('#pdfPickSummary')).toContainText('请输入页范围');
  await expect(page.locator('#pdfPickImport')).toBeDisabled();
  await page.fill('#pdfPageRange', '1-3');
  await expect(page.locator('#pdfPickImport')).toBeEnabled();
  await page.locator('#modalFooter button', { hasText: '取消' }).click();
  await expect(page.locator('#modalBackdrop.show')).toHaveCount(0);
  expect(await page.evaluate(() => state.objects.length)).toBe(0);
});

test('B-13：单页 PDF 保持旧行为（原点归零、无多页提示）', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  await page.setInputFiles('#fileInput', {
    name: 'one-page.pdf', mimeType: 'application/pdf', buffer: singlePagePdf()
  });
  /* 单页 PDF 不进入预检：入口与旧版完全一致 */
  await expect(page.locator('#modalBackdrop.show')).toHaveCount(0);
  await expect(page.locator('#toastWrap')).toContainText(/PDF 已导入：1 线/);
  await expect(page.locator('#toastWrap')).not.toContainText('独立原点');
  await expect(page.locator('#toastWrap')).not.toContainText('已导入第 1 页');
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

/* 两层图片底图：直接构造 state（绕过导入），让 withFloor 走真实的 switchFloor→afterStateLoaded→图片解码路径 */
async function seedTwoImageFloors(page){
  await page.evaluate(async () => {
    const png = rgb => {
      const c = document.createElement('canvas'); c.width = 8; c.height = 8;
      const g = c.getContext('2d'); g.fillStyle = rgb; g.fillRect(0, 0, 8, 8);
      return c.toDataURL('image/png');
    };
    const init = createInitialState();
    const mk = (id, name, rgb) => ({
      id, name, updatedAt: nowISO(),
      background: { kind: 'image', dataUrl: png(rgb) },
      site: init.site, objects: [], viewport: { zoom: 1, panX: 0, panY: 0 }
    });
    state.floors = [mk('floor.default', '1F', 'rgb(255,0,0)'), mk('floor.e2e2', '2F', 'rgb(0,0,255)')];
    state.activeFloorId = 'floor.default';
    state.background = state.floors[0].background;
    state.site = state.floors[0].site;
    state.objects = state.floors[0].objects;
    await afterStateLoaded(false);
  });
}

test('P1-6：多楼层 PDF 导出时每层底图均已就绪并恢复原楼层', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  await seedTwoImageFloors(page);

  const inner = await page.evaluate(async () => {
    const seen = [];
    for (const id of ['floor.e2e2', 'floor.default']){
      await withFloor(id, async () => { seen.push({ id: state.activeFloorId, st: bgImageState, img: !!bgImage }); });
    }
    return { seen, active: state.activeFloorId, bg: bgImageState };
  });
  expect(inner.seen).toEqual([
    { id: 'floor.e2e2', st: 'ready', img: true },
    { id: 'floor.default', st: 'ready', img: true }
  ]);
  expect(inner.active).toBe('floor.default');
  expect(inner.bg).toBe('ready');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => exportPDF())
  ]);
  const buf = readFileSync(await download.path());
  const pages = (buf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
  expect(buf.length).toBeGreaterThan(1000);
  expect(pages).toBeGreaterThanOrEqual(2);   /* 每层一张图纸页；旧实现底图丢失但页数仍≥2，靠上面的 ready 断言区分 */
  expect(errors).toEqual([]);
});

test('P1-6：withFloor 切层失败/底图缺失时中止，不导出错楼层内容', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  await seedTwoImageFloors(page);
  await page.evaluate(() => {
    state.floors.push({ id: 'floor.nobg', name: 'NOBG', updatedAt: nowISO(), background: { kind: 'image' }, objects: [], viewport: { zoom: 1, panX: 0, panY: 0 } });
  });

  const r = await page.evaluate(async () => {
    let ranMissing = false, ranNoBg = false, msgMissing = '', msgNoBg = '';
    try{ await withFloor('missing.floor', async () => { ranMissing = true; }); }
    catch(e){ msgMissing = String(e.message || e); }
    try{ await withFloor('floor.nobg', async () => { ranNoBg = true; }); }
    catch(e){ msgNoBg = String(e.message || e); }
    return { ranMissing, ranNoBg, msgMissing, msgNoBg, active: state.activeFloorId };
  });
  expect(r.ranMissing).toBe(false);
  expect(r.ranNoBg).toBe(false);
  expect(r.msgMissing).toContain('楼层切换失败');
  expect(r.msgNoBg).toContain('底图未就绪');
  expect(r.active).toBe('floor.default');
});
