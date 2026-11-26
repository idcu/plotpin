/* B-05 产品目录 → 型号绑定 → 跨楼层 BOM → CSV/XLSX 报价 全链路
   追加：报价快照（替换目录后重导仍一致/改数量后重算）、跨厂商重名不静默错绑 */
import { test, expect } from '@playwright/test';
import { readFileSync, statSync } from 'node:fs';
import { DB, idb, clickCanvasCenter } from './helpers.mjs';

const CATALOG = {
  schema: 'plotpin-catalog/v1',
  name: 'e2e 厂商目录',
  items: [
    { vendor: '海康', model: 'DS-2CD', category: '摄像头', unit: '台', price: 1200 },
    { vendor: '大华', model: 'DH-1', category: '摄像头', unit: '台', price: 350 }
  ]
};

async function openApp(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
}

async function importCatalog(page, obj) {
  await page.setInputFiles('#fileInput', {
    name: 'catalog.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(obj))
  });
}

async function exportCsv(page) {
  const wait = page.waitForEvent('download');
  await page.selectOption('#exportKind', 'quote-csv');
  await page.click('#exportBtn');
  const dl = await wait;
  const text = readFileSync(await dl.path(), 'utf8').replace(/^\ufeff/, '').trim();
  return text.split(/\r?\n/).map(l => l.split(','));
}

test('导入目录 → 绑定型号/数量 → 跨楼层 BOM → 导出 CSV/XLSX → 报价快照与重名防护', async ({ page }) => {
  await openApp(page);

  /* 1. 画一个点并导入厂商目录（2 个型号） */
  await page.locator('.tool-btn[data-tool="point"]').click();
  await clickCanvasCenter(page);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);

  await importCatalog(page, CATALOG);
  await expect.poll(() => page.evaluate(() => currentCatalog && currentCatalog.items.length)).toBe(2);
  const v1 = await page.evaluate(() => catalogVersion(currentCatalog));

  /* 2. 属性面板填目录型号（唯一型号自动绑定厂商），数量改为 5（F1 海康 DS-2CD ×5） */
  await page.fill('[data-field="propModel"]', 'DS-2CD');
  await expect.poll(() => page.evaluate(() => state.objects[0].props.model)).toBe('DS-2CD');
  expect(await page.evaluate(() => quoteTable(currentCatalog).find(r => r[1] === 'DS-2CD')[0])).toBe('海康');
  await page.fill('[data-field="propQty"]', '5');
  await expect.poll(() => page.evaluate(() => state.objects[0].props.qty)).toBe(5);

  /* 3. 新增 F2 并放入同型号 ×2，验证跨楼层聚合 */
  await page.evaluate(async () => {
    await addFloor('F2');
    const o = baseObject('point', 'point.marker', { name: 'P2', x: 5, y: 5 });
    o.props = { vendor: '海康', model: 'DS-2CD', qty: 2 };
    state.objects.push(o);
    scheduleSave();
  });

  /* 4. 导出 CSV 报价：5 数据列 + 合计行携带目录版本/导出时间（数量 7，小计 8400） */
  const rows = await exportCsv(page);
  expect(rows[0]).toEqual(['厂商', '名称', '数量', '单价', '小计', '目录版本', '导出时间']);
  const rowA = rows.find(r => r[1] === 'DS-2CD');
  expect([rowA[0], Number(rowA[2]), Number(rowA[3]), Number(rowA[4])]).toEqual(['海康', 7, 1200, 8400]);
  const total = rows[rows.length - 1];
  expect([total[1], Number(total[2]), Number(total[4])]).toEqual(['合计', 7, 8400]);
  expect(total[5]).toBe(v1);
  expect(total[6]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

  /* 5. 导出 XLSX 报价：可下载且非空（Excel 人工打开未验证，数值往返见 selftest） */
  const xlsxWait = page.waitForEvent('download');
  await page.selectOption('#exportKind', 'quote-xlsx');
  await page.click('#exportBtn');
  const xlsxDownload = await xlsxWait;
  expect(xlsxDownload.suggestedFilename()).toMatch(/-\d{8}-\d{4}-产品报价\.xlsx$/);
  expect(statSync(await xlsxDownload.path()).size).toBeGreaterThan(0);

  /* 6. 替换目录（同型号单价 1200 → 2000）：行集合不变，重导沿用快照单价 */
  await importCatalog(page, {
    schema: 'plotpin-catalog/v1',
    items: [
      { vendor: '海康', model: 'DS-2CD', price: 2000 },
      { vendor: '大华', model: 'DH-1', price: 600 }
    ]
  });
  await expect.poll(() => page.evaluate(() => currentCatalog.items[0].price)).toBe(2000);
  const v2 = await page.evaluate(() => catalogVersion(currentCatalog));
  expect(v2).not.toBe(v1);
  const rows2 = await exportCsv(page);
  const rowA2 = rows2.find(r => r[1] === 'DS-2CD');
  expect([Number(rowA2[3]), Number(rowA2[4])]).toEqual([1200, 8400]);
  expect(rows2[rows2.length - 1][5]).toBe(v1);

  /* 7. 改数量（7 → 8）：行集合变化，按当前目录重新计价 2000，快照版本更新 */
  await page.evaluate(() => {
    const f = state.floors[0], o = f.objects[0];
    o.props.qty = 6;
    if (f.id === state.activeFloorId) state.objects[0].props.qty = 6;
    scheduleSave();
  });
  await expect.poll(async () => {
    const rec = await idb(page, { store: DB.projects, op: 'get', key: 'current' });
    const f = rec && rec.floors && rec.floors[0];
    return f && f.objects[0] && f.objects[0].props && f.objects[0].props.qty;
  }, { timeout: 6000 }).toBe(6);
  await expect.poll(() => page.evaluate(() => {
    const t = quoteTable(currentCatalog), i = t[0].indexOf('数量');
    return t.slice(1, -1).find(r => r[1] === 'DS-2CD')[i];
  })).toBe(8);
  const rows3 = await exportCsv(page);
  const rowA3 = rows3.find(r => r[1] === 'DS-2CD');
  expect([Number(rowA3[3]), Number(rowA3[4])]).toEqual([2000, 16000]);
  expect(rows3[rows3.length - 1][5]).toBe(v2);

  /* 8. 非法目录导入（schema 正确、单价非法）：事务化失败，现有目录与 IndexedDB 记录不变 */
  await importCatalog(page, { schema: 'plotpin-catalog/v1', items: [{ vendor: 'X', model: 'Y', price: -1 }] });
  await expect.poll(() => page.evaluate(() => currentCatalog.items[0].price)).toBe(2000);
  const persisted = await idb(page, { store: DB.projects, op: 'get', key: 'catalog:current' });
  expect(persisted.items.length).toBe(2);
  expect(persisted.items[0].price).toBe(2000);

  /* 9. 刷新：目录从 IndexedDB 恢复，BOM 数量仍为 8 */
  await expect.poll(async () => {
    const rec = await idb(page, { store: DB.projects, op: 'get', key: 'catalog:current' });
    return rec && rec.items.length;
  }, { timeout: 6000 }).toBe(2);
  await expect.poll(async () => {
    const rec = await idb(page, { store: DB.projects, op: 'get', key: 'current' });
    return rec && rec.floors.length;
  }, { timeout: 6000 }).toBe(2);
  await page.reload();
  await expect.poll(() => page.evaluate(() => currentCatalog && currentCatalog.items.length)).toBe(2);
  expect(await page.evaluate(() => {
    const t = quoteTable(currentCatalog), h = t[0], i = h.indexOf('数量');
    const row = t.slice(1, -1).find(r => r[1] === 'DS-2CD');
    return row && row[i];
  })).toBe(8);

  /* 10. 跨厂商重名型号：未填厂商不带价，且明确标记；填厂商后按精确键计价 */
  await importCatalog(page, {
    schema: 'plotpin-catalog/v1',
    items: [
      { vendor: '海康', model: 'DUP-M', price: 100 },
      { vendor: '大华', model: 'DUP-M', price: 80 }
    ]
  });
  await expect.poll(() => page.evaluate(() => currentCatalog.items.length)).toBe(2);
  await page.evaluate(() => {
    state.objects[0].props = { model: 'DUP-M', qty: 2 };
    scheduleSave();
  });
  const amb = await page.evaluate(() => ({
    amb: quoteAggregate(currentCatalog).ambiguous,
    row: quoteTable(currentCatalog).slice(1, -1).find(r => r[1] === 'DUP-M')
  }));
  expect(amb.amb).toEqual(['DUP-M']);
  expect([amb.row[0], amb.row[3], amb.row[4]]).toEqual(['', '', '']);
  const rowsDup = await exportCsv(page);
  const rowDup = rowsDup.find(r => r[1] === 'DUP-M');
  expect([rowDup[0], rowDup[3], rowDup[4]]).toEqual(['', '', '']);
  await page.evaluate(() => {
    selectedIds.clear(); selectedIds.add(state.objects[0].id);
    switchTab('props'); renderProps();
  });
  await expect(page.locator('[data-field="propVendor"]')).toHaveValue('');
  await page.fill('[data-field="propVendor"]', '大华');
  await expect.poll(() => page.evaluate(() => quoteTable(currentCatalog).slice(1, -1).find(r => r[1] === 'DUP-M')[3])).toBe(80);
});

test('G1 厂商目录 CSV：识别列 → 确认导入 → 绑定报价；台账表头不命中', async ({ page }) => {
  await openApp(page);
  await page.locator('.tool-btn[data-tool="point"]').click();
  await clickCanvasCenter(page);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);

  /* 台账式表头（无单价）不得被识别为目录 */
  expect(await page.evaluate(() => catalogFromRows([['编号', '名称', '型号'], ['1', 'A', 'B']]))).toBe(null);

  const csv = [
    '厂商,型号,分类,单位,单价',
    '海康,DS-2CD,摄像头,台,"¥1,200.00"',
    '大华,DH-1,摄像头,台,350'
  ].join('\n');
  await page.setInputFiles('#fileInput', {
    name: 'vendors.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv)
  });
  await expect(page.locator('#modalFooter button.primary')).toBeVisible({ timeout: 5000 });
  await page.locator('#modalFooter button.primary').click();

  await expect.poll(() => page.evaluate(() => currentCatalog && currentCatalog.items.length)).toBe(2);
  expect(await page.evaluate(() => currentCatalog.items.map(it => [it.vendor, it.model, it.price]))).toEqual([
    ['海康', 'DS-2CD', 1200],
    ['大华', 'DH-1', 350]
  ]);

  await page.fill('[data-field="propModel"]', 'DS-2CD');
  await page.fill('[data-field="propQty"]', '2');
  await expect.poll(() => page.evaluate(() => {
    const row = quoteTable(currentCatalog).slice(1, -1).find(r => r[1] === 'DS-2CD');
    return row && [row[3], row[4]];
  })).toEqual([1200, 2400]);
});
