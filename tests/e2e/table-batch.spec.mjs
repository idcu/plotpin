/* B-08 原义：表格批量布点 + 条件批量替换（严格模式整批事务化） */
import { test, expect } from '@playwright/test';

async function openApp(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  return errors;
}

function csv(rows) {
  return rows.map(r => r.map(v => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\n');
}

async function seedTwoPoints(page) {
  await page.evaluate(() => {
    state.objects.length = 0;
    for (const [name, text, x] of [['O0001', '旧A', 0], ['O0002', '旧B', 2]]) {
      const o = baseObject('point', 'point.marker');
      o.name = name; o.text = text; o.x = x; o.y = 0;
      state.objects.push(o);
    }
    requestRender();
  });
}

test('B-08：条件替换命中两台 + 批量新增落点可复算', async ({ page }) => {
  const errors = await openApp(page);
  await seedTwoPoints(page);

  const header = ['操作','编号','对象类型','名称','业务类型','图层','安装高度','备注','X','Y','匹配业务类型'];
  const rows = [
    header,
    ['替换','','','新名称','摄像头','默认图层','3','批量','','','通用标记'],
    ['新增','','点设备','','摄像头','默认图层','','','10','20','']
  ];
  await page.setInputFiles('#fileInput', {
    name: 'batch.csv', mimeType: 'text/csv', buffer: Buffer.from(csv(rows), 'utf8')
  });
  await expect(page.locator('#modalBackdrop')).toHaveClass(/show/);
  await expect(page.locator('#modalBody')).toContainText('个对象替换');
  await page.locator('#modalFooter button', { hasText: '合并导入' }).click();
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(3);

  const after = await page.evaluate(() => {
    const a = state.objects.find(o => o.name === 'O0001');
    const b = state.objects.find(o => o.name === 'O0002');
    const c = state.objects.find(o => o.name !== 'O0001' && o.name !== 'O0002');
    return {
      aText: a.text, aType: a.typeId, aMount: a.props && a.props.mountHeight, aNote: a.props && a.props.note,
      bText: b.text, bType: b.typeId,
      cX: c.x, cY: c.y, cType: c.typeId, cLayer: c.layerId
    };
  });
  expect(after.aText).toBe('新名称');
  expect(after.aType).toBe('point.camera');
  expect(after.aMount).toBe(3);
  expect(after.aNote).toBe('批量');
  expect(after.bText).toBe('新名称');
  expect(after.bType).toBe('point.camera');
  expect(after.cX).toBe(10);
  expect(after.cY).toBe(20);
  expect(after.cType).toBe('point.camera');
  expect(after.cLayer).toBe('layer.default');
  expect(errors).toEqual([]);
});

test('B-08：非法行整批拒绝，现有对象不被修改', async ({ page }) => {
  const errors = await openApp(page);
  await seedTwoPoints(page);
  const before = await page.evaluate(() => ({ count: state.objects.length, first: state.objects[0].text }));

  const header = ['操作','编号','对象类型','X','Y'];
  await page.setInputFiles('#fileInput', {
    name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from(csv([header, ['更新','O9999','点设备','1','1']]), 'utf8')
  });
  await expect(page.locator('#modalBackdrop')).toHaveClass(/show/);
  await expect(page.locator('#modalTitle')).toContainText('无法导入');
  await expect(page.locator('#modalBody')).toContainText('整批取消导入');
  await expect(page.locator('#modalFooter button', { hasText: '合并导入' })).toHaveCount(0);
  await page.locator('#modalFooter button', { hasText: '知道了' }).click();

  const after = await page.evaluate(() => ({ count: state.objects.length, first: state.objects[0].text }));
  expect(after).toEqual(before);
  expect(errors).toEqual([]);
});

test('N-08：楼层重名时表格导入整批拒绝，现有数据不变', async ({ page }) => {
  const errors = await openApp(page);
  await seedTwoPoints(page);
  await page.evaluate(() => {
    state.floors.push({ id: 'floor.dup', name: '1F', objects: [], updatedAt: '' });
    refreshUI();
  });
  const before = await page.evaluate(() => ({
    count: state.objects.length, floors: state.floors.length, first: state.objects[0].text
  }));

  const header = ['操作', '编号', '对象类型', 'X', 'Y', '楼层'];
  await page.setInputFiles('#fileInput', {
    name: 'dup-floor.csv', mimeType: 'text/csv',
    buffer: Buffer.from(csv([header, ['新增', '', '点设备', '10', '20', '1F']]), 'utf8')
  });
  await expect(page.locator('#modalBackdrop')).toHaveClass(/show/);
  await expect(page.locator('#modalTitle')).toContainText('无法导入');
  await expect(page.locator('#modalBody')).toContainText('整批取消导入');
  await expect(page.locator('#modalFooter button', { hasText: '合并导入' })).toHaveCount(0);
  await page.locator('#modalFooter button', { hasText: '知道了' }).click();

  const after = await page.evaluate(() => ({
    count: state.objects.length, floors: state.floors.length, first: state.objects[0].text
  }));
  expect(after).toEqual(before);
  expect(errors).toEqual([]);
});

test('P2：导出 CSV 原样回灌不漂移（浏览器内往返）', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    state.objects.length = 0;
    const p = baseObject('point', 'point.marker');
    p.name = 'P1'; p.text = '入口'; p.x = 12.34; p.y = 5.67; p.angle = 30;
    const r = baseObject('rect', 'rect.area');
    r.name = 'R1'; r.x = 1.5; r.y = 2.5; r.width = 6; r.height = 4; r.angle = 15;
    state.objects.push(p, r);
    requestRender();
  });

  const text = await page.evaluate(() => delimitedText(','));
  const header = text.replace(/^\ufeff/, '').split(/\r?\n/)[0].split(',');
  expect(header).toEqual(await page.evaluate(() => TABLE_COLUMNS.slice()));

  await page.setInputFiles('#fileInput', {
    name: 'roundtrip.csv', mimeType: 'text/csv', buffer: Buffer.from(text, 'utf8')
  });
  await expect(page.locator('#modalBackdrop')).toHaveClass(/show/);
  await expect(page.locator('#modalBody')).toContainText('更新');
  await page.locator('#modalFooter button', { hasText: '合并导入' }).click();

  const after = await page.evaluate(() => state.objects.map(o => ({
    name: o.name, x: o.x, y: o.y, angle: o.angle, width: o.width, height: o.height
  })));
  expect(after).toEqual([
    { name: 'P1', x: 12.34, y: 5.67, angle: 30, width: 0, height: 0 },
    { name: 'R1', x: 1.5, y: 2.5, angle: 15, width: 6, height: 4 }
  ]);
  expect(errors).toEqual([]);
});
