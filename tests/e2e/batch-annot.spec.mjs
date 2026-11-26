/* 清单页批量标注显隐：三态主复选框 + 按标识类型逐项勾选（不适用类型不渲染） */
import { test, expect } from '@playwright/test';

async function openApp(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  /* afterStateLoaded 会递增 bgLoadSeq；等启动加载完成后再种对象，避免被随后载入覆盖 */
  await page.waitForFunction(() => typeof bgLoadSeq === 'number' && bgLoadSeq > 0);
  return errors;
}

async function seedTwoPoints(page) {
  await page.evaluate(() => {
    state.objects.length = 0;
    for (const [name, x] of [['ANN-A', 0], ['ANN-B', 4]]) {
      const o = baseObject('point', 'point.marker');
      o.name = name; o.x = x; o.y = 0;
      state.objects.push(o);
    }
    selectedIds.clear();
    requestRender();
    refreshUI();
  });
}

async function seedRectAndPoint(page) {
  await page.evaluate(() => {
    state.objects.length = 0;
    const r = baseObject('rect', 'rect.area', { x: 0, y: 0, width: 4, height: 3 });
    r.name = 'AREA-A';
    const p = baseObject('point', 'point.marker', { x: 10, y: 0 });
    p.name = 'PT-A';
    state.objects.push(r, p);
    selectedIds.clear();
    requestRender();
    refreshUI();
  });
}

async function annotStates(page) {
  return page.evaluate(() => state.objects.map(o => ({
    kind: o.kind,
    name: annotOn(o, 'name'), coord: annotOn(o, 'coord'), base: annotOn(o, 'base'),
    area: annotOn(o, 'area'), perimeter: annotOn(o, 'perimeter')
  })));
}

async function selectRows(page) {
  await page.locator('#tabBtn-list').click();
  const rows = page.locator('[data-row-select]');
  const n = await rows.count();
  for (let i = 0; i < n; i++) await rows.nth(i).check();
}

test('批次标注：主复选框三态（混合→全开→全关）→撤销恢复，SVG 随状态变化', async ({ page }) => {
  const errors = await openApp(page);
  await seedTwoPoints(page);
  await selectRows(page);

  const master = page.locator('#batchAnnotAll');
  /* 初始 name=on / coord=off → 混合态 */
  await expect(master).toHaveJSProperty('indeterminate', true);
  await master.click();
  expect(await annotStates(page)).toEqual([
    { kind: 'point', name: true, coord: true, base: false, area: false, perimeter: false },
    { kind: 'point', name: true, coord: true, base: false, area: false, perimeter: false }
  ]);
  await master.click();
  expect(await annotStates(page)).toEqual([
    { kind: 'point', name: false, coord: false, base: false, area: false, perimeter: false },
    { kind: 'point', name: false, coord: false, base: false, area: false, perimeter: false }
  ]);
  expect(await page.evaluate(() => buildSceneSvg())).not.toContain('ANN-A');

  await page.locator('#undoBtn').click();
  const restored = await annotStates(page);
  expect(restored.map(s => [s.name, s.coord])).toEqual([[true, true], [true, true]]);
  expect(await page.evaluate(() => buildSceneSvg())).toContain('ANN-A');
  expect(errors).toEqual([]);
});

test('批次标注：只显示基点（其余逐项关闭），不适用类型不渲染', async ({ page }) => {
  const errors = await openApp(page);
  await seedRectAndPoint(page);
  await selectRows(page);

  const box = page.locator('#batchAnnotChks');
  await expect(box.locator('[data-batch-annot="base"]')).toHaveCount(1);
  await expect(box.locator('[data-batch-annot="edge"]')).toHaveCount(1);
  /* 点设备没有折线节点/面积概念：不适用的类型不渲染，而不是显示成未勾选 */
  await expect(box.locator('[data-batch-annot="node"]')).toHaveCount(0);

  await box.locator('[data-batch-annot="name"]').uncheck();
  await box.locator('[data-batch-annot="perimeter"]').uncheck();
  await box.locator('[data-batch-annot="area"]').uncheck();
  await box.locator('[data-batch-annot="base"]').check();

  expect(await annotStates(page)).toEqual([
    { kind: 'rect', name: false, coord: false, base: true, area: false, perimeter: false },
    { kind: 'point', name: false, coord: false, base: false, area: false, perimeter: false }
  ]);
  const svg = await page.evaluate(() => buildSceneSvg());
  expect(svg).not.toContain('AREA-A');
  expect(svg).not.toContain('PT-A');
  expect(svg).toContain('(0.00, 0.00)');
  expect(errors).toEqual([]);
});

test('批次标注：无选中或锁定对象时不写入历史', async ({ page }) => {
  const errors = await openApp(page);
  await seedTwoPoints(page);
  await page.locator('#tabBtn-list').click();
  const historyBefore = await page.evaluate(() => history.past.length);

  /* 无选中：主复选框禁用，只显示提示，不发历史 */
  await page.evaluate(() => { selectedIds.clear(); refreshUI(); });
  await expect(page.locator('#batchAnnotAll')).toBeDisabled();
  await expect(page.locator('#batchAnnotChks')).toContainText('先勾选对象');
  expect(await page.evaluate(() => history.past.length)).toBe(historyBefore);

  /* 图层锁定：选中也不可批量改标注 */
  await page.evaluate(() => { state.layers.forEach(l => { l.locked = true; }); refreshUI(); });
  await page.locator('[data-row-select]').nth(0).check();
  await expect(page.locator('#batchAnnotAll')).toBeDisabled();
  expect(await page.evaluate(() => state.objects.map(o => annotOn(o, 'name')))).toEqual([true, true]);
  expect(await page.evaluate(() => history.past.length)).toBe(historyBefore);
  expect(errors).toEqual([]);
});
