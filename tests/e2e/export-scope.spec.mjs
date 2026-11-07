import { test, expect } from '@playwright/test';

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
