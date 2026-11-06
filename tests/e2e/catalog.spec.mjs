/* B-05 产品目录 → 型号绑定 → 跨楼层 BOM → CSV/XLSX 报价 全链路 */
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

test('导入目录 → 绑定型号/数量 → 跨楼层 BOM → 导出 CSV/XLSX → 刷新持久化', async ({ page }) => {
  await openApp(page);

  /* 1. 画一个点并导入厂商目录（2 个型号） */
  await page.locator('.tool-btn[data-tool="point"]').click();
  await clickCanvasCenter(page);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);

  await importCatalog(page, CATALOG);
  await expect.poll(() => page.evaluate(() => currentCatalog && currentCatalog.items.length)).toBe(2);

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

  /* 4. 导出 CSV 报价：表头 + 型号行 + 合计（数量 7，小计 8400） */
  const csvWait = page.waitForEvent('download');
  await page.selectOption('#exportKind', 'quote-csv');
  await page.click('#exportBtn');
  const csvDownload = await csvWait;
  expect(csvDownload.suggestedFilename()).toMatch(/产品报价\.csv$/);
  const csvText = readFileSync(await csvDownload.path(), 'utf8');
  const rows = await page.evaluate((t) => DSV.parseRows(t, ','), csvText);
  expect(rows[0]).toEqual(['厂商', '名称', '数量', '单价', '小计']);
  const rowA = rows.find(r => r[1] === 'DS-2CD');
  expect([rowA[0], Number(rowA[2]), Number(rowA[3]), Number(rowA[4])]).toEqual(['海康', 7, 1200, 8400]);
  const total = rows[rows.length - 1];
  expect([total[1], Number(total[2]), Number(total[4])]).toEqual(['合计', 7, 8400]);

  /* 5. 导出 XLSX 报价：可下载且非空（Excel 人工打开未验证，数值往返见 selftest） */
  const xlsxWait = page.waitForEvent('download');
  await page.selectOption('#exportKind', 'quote-xlsx');
  await page.click('#exportBtn');
  const xlsxDownload = await xlsxWait;
  expect(xlsxDownload.suggestedFilename()).toMatch(/产品报价\.xlsx$/);
  expect(statSync(await xlsxDownload.path()).size).toBeGreaterThan(0);

  /* 6. 非法目录导入（schema 正确、单价非法）：事务化失败，现有目录与 IndexedDB 记录不变 */
  await importCatalog(page, { schema: 'plotpin-catalog/v1', items: [{ vendor: 'X', model: 'Y', price: -1 }] });
  await expect.poll(() => page.evaluate(() => currentCatalog.items.length)).toBe(2);
  const persisted = await idb(page, { store: DB.projects, op: 'get', key: 'catalog:current' });
  expect(persisted.items.length).toBe(2);
  expect(persisted.items[0].model).toBe('DS-2CD');

  /* 7. 刷新：目录从 IndexedDB 恢复，BOM 数量仍为 7 */
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
  })).toBe(7);
});
