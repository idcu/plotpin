import { test, expect } from '@playwright/test';

/* E3：导入异常面 —— 坏文件必须给出可读错误，且不得污染现有工程（对象数 / 撤销栈） */
async function seedProject(page){
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  return page.evaluate(() => {
    state.objects.push(baseObject('line','line.custom',{points:[[0,0],[1,1]],x:0,y:0}));
    pushHistory();
    return { n: state.objects.length, h: history.past.length };
  });
}
async function readCounts(page){
  return page.evaluate(() => ({ n: state.objects.length, h: history.past.length }));
}
async function importBuffer(page, name, mimeType, buffer){
  await page.setInputFiles('#fileInput', { name, mimeType, buffer });
}

test('E3：截断 PDF 给出可读错误且不污染工程', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const base = await seedProject(page);
  const truncated = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog', 'latin1');
  await importBuffer(page, 'broken.pdf', 'application/pdf', truncated);
  await expect(page.locator('#toastWrap')).toContainText(/PDF 解析失败|第 1 页未提取到可用图形/);
  const now = await readCounts(page);
  expect(now).toEqual(base);
  expect(errors).toEqual([]);
});

test('E3：损坏 XLSX（ZIP 头后接垃圾）给出可读错误且不污染工程', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const base = await seedProject(page);
  const broken = Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.alloc(64, 0x7f)]);
  await importBuffer(page, 'broken.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', broken);
  await expect(page.locator('#toastWrap')).toContainText(/XLSX 解析失败|XLSX 中没有可导入的工作表/);
  const now = await readCounts(page);
  expect(now).toEqual(base);
  expect(errors).toEqual([]);
});

test('E3：超过 32 MB 的文件在读取前被拒且不污染工程', async ({ page }) => {
  test.setTimeout(120000);
  const base = await seedProject(page);
  const huge = Buffer.alloc(32 * 1024 * 1024 + 1, 0x20);
  await importBuffer(page, 'huge.json', 'application/json', huge);
  await expect(page.locator('#toastWrap')).toContainText('导入失败：文件过大');
  const now = await readCounts(page);
  expect(now).toEqual(base);
});

test('E3：MIME 伪装成 JSON 的二进制给出可读错误且不污染工程', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const base = await seedProject(page);
  const fake = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]);
  await importBuffer(page, 'fake.json', 'application/json', fake);
  await expect(page.locator('#toastWrap')).toContainText(/JSON 工程格式不正确|工程导入失败/);
  const now = await readCounts(page);
  expect(now).toEqual(base);
  expect(errors).toEqual([]);
});
