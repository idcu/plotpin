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
