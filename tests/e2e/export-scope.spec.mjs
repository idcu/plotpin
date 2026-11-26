import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { goldenWritable, refusalReason, writeGolden } from '../../scripts/lib/golden.mjs';

/* N-05：导出口径统一。
   1) 台账（CSV/XLSX）保留全量对象，「显示」列反映有效可见；图纸类（SVG/DXF/PDF）只含有效可见。
   2) 草稿/校准属于交互瞬态，不得烘进 PNG/PDF 产物（像素一致）。 */

test('N-05：台账全量 + 显示列=有效可见，图纸类导出只含可见对象', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();

  const r = await page.evaluate(() => {
    state.layers.push({ id: 'layer.n05', name: '隐藏层', visible: false, locked: false });
    state.objects.push(baseObject('point', 'point.marker', { name: 'N05H', layerId: 'layer.n05', x: 123.45, y: 67.89 }));
    state.objects.push(baseObject('point', 'point.marker', { name: 'N05V', x: 5, y: 5 }));
    commitChange('N-05 导出口径测试');
    return {
      rowH: objectRowsAll().find(x => x['编号'] === 'N05H'),
      csv: delimitedText(','),
      xlsx: xlsxExportTable().flat(),
      svg: buildSceneSvg(),
      dxfHasHidden: dxfEntitiesForExport().entities.some(e => e.type === 'POINT' && e.x === 123.45),
      listPages: pdfPagePlan().filter(p => p.kind === 'list').length
    };
  });

  /* 台账：全量保留，隐藏对象仍在，但「显示」列按有效可见标「否」 */
  expect(r.rowH).toBeTruthy();
  expect(r.rowH['显示']).toBe('否');
  expect(r.csv).toContain('N05H');
  expect(r.xlsx).toContain('N05H');

  /* 图纸：隐藏对象不进入 SVG / DXF；PDF 清单按可见数分页 */
  expect(r.svg).not.toContain('N05H');
  expect(r.svg).toContain('N05V');
  expect(r.dxfHasHidden).toBe(false);
  expect(r.listPages).toBe(1);
});

test('N-05：矩形草稿/两点校准不进入 PNG 与 PDF 图纸页', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();

  await page.evaluate(() => {
    state.objects.push(baseObject('rect', 'rect.area', { name: 'E1', x: 0, y: 0, width: 10, height: 8 }));
    commitChange('N-05 瞬态隔离测试');
  });

  const png = await page.evaluate(() => {
    const before = renderToDataURL(1);
    draft = { kind: 'rect', start: [0, 0], current: [10, 8] };
    const after = renderToDataURL(1);
    draft = null;
    return { equal: before === after };
  });
  expect(png.equal).toBe(true);

  const pdf = await page.evaluate(async () => {
    const before = await renderPdfDrawingPage(null, 1, 1);
    currentTool = 'calibrate';
    calibPoints = [[2, 2], [8, 8]];
    const after = await renderPdfDrawingPage(null, 1, 1);
    calibPoints = [];
    currentTool = 'select';
    return { equal: before.b64 === after.b64, len: before.b64.length };
  });
  expect(pdf.len).toBeGreaterThan(1000);
  expect(pdf.equal).toBe(true);
});

/* N-26：补齐此前只有 selftest/golden、没有 e2e 的两条导出链路（DXF / TSV），
   并给 PNG 建立语义 golden（编码字节随浏览器变化，不锁字节）。 */
test('N-26：DXF/TSV 导出端到端可用，图纸与台账口径不串', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();

  await page.evaluate(() => {
    state.layers.push({ id: 'layer.n26', name: '隐藏层', visible: false, locked: false });
    state.objects.push(baseObject('point', 'point.marker', { name: 'N26H', layerId: 'layer.n26', x: 123.45, y: 67.89 }));
    state.objects.push(baseObject('rect', 'rect.area', { name: 'N26V', x: 5, y: 5, width: 10, height: 8 }));
    commitChange('N-26 导出 e2e');
  });

  const tsvHeader = await page.evaluate(() => TABLE_COLUMNS.join('\t'));
  const tsvEvent = page.waitForEvent('download');
  await page.selectOption('#exportKind', 'tsv');
  await page.click('#exportBtn');
  const tsv = readFileSync(await (await tsvEvent).path(), 'utf8');
  expect(tsv.replace(/^\ufeff/, '').split(/\r?\n/)[0]).toBe(tsvHeader);
  expect(tsv).toContain('N26H');
  expect(tsv).toContain('N26V');

  const dxfEvent = page.waitForEvent('download');
  await page.selectOption('#exportKind', 'dxf');
  await page.click('#exportBtn');
  const dxf = readFileSync(await (await dxfEvent).path(), 'utf8');
  expect(dxf).toContain('SECTION');
  expect(dxf).toContain('ENTITIES');
  expect(dxf).toContain('LWPOLYLINE');
  expect(dxf.trim().endsWith('EOF')).toBe(true);
  expect(dxf).not.toContain('123.45');
});

test('N-26：PNG 导出语义 golden（签名 + 尺寸，不锁编码字节）', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();

  const info = await page.evaluate(() => {
    state.objects = [baseObject('point', 'point.marker', { name: 'P1', x: 12, y: 14 })];
    const url = renderToDataURL(1);
    const bin = atob(url.split(',')[1]);
    const b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    const u32 = o => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
    return { sig: [...b.slice(0, 8)], width: u32(16), height: u32(20) };
  });
  expect(info.sig).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

  const metaPath = fileURLToPath(new URL('../../tests/golden/plain-scene.png.meta.json', import.meta.url));
  const refuse = refusalReason();
  if (goldenWritable()) {
    writeGolden(metaPath, JSON.stringify({ width: info.width, height: info.height }, null, 1) + '\n',
      'plain-scene.png.meta.json');
  } else {
    /* UPDATE_GOLDEN 单独设置不再生效：必须显式 ALLOW_GOLDEN=1（CI 下永不可写） */
    expect(refuse, refuse).toBe('');
  }
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  expect({ width: info.width, height: info.height }).toEqual({ width: meta.width, height: meta.height });
});
