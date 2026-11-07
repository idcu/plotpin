/* 清单页批量标注显隐：勾选多对象 → 统一开/关 → 撤销恢复；并校验 SVG 导出随 annot 变化 */
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

async function annotStates(page) {
  return page.evaluate(() => state.objects.map(o => ({
    name: annotOn(o, 'name'), coord: annotOn(o, 'coord')
  })));
}

test('批次标注：勾选两对象统一隐藏→撤销→统一显示，SVG 随状态变化', async ({ page }) => {
  const errors = await openApp(page);
  await seedTwoPoints(page);
  await page.locator('#tabBtn-list').click();
  await expect(page.locator('#objectTbody tr[data-id]')).toHaveCount(2);

  const checks = page.locator('[data-row-select]');
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.locator('#batchHideAnnotBtn').click();

  expect(await annotStates(page)).toEqual([
    { name: false, coord: false },
    { name: false, coord: false }
  ]);
  expect(await page.evaluate(() => buildSceneSvg())).not.toContain('ANN-A');
  expect(await page.evaluate(() => buildSceneSvg())).not.toContain('ANN-B');

  await page.locator('#undoBtn').click();
  expect(await annotStates(page)).toEqual([
    { name: true, coord: false },
    { name: true, coord: false }
  ]);
  expect(await page.evaluate(() => buildSceneSvg())).toContain('ANN-A');

  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.locator('#batchShowAnnotBtn').click();
  expect(await annotStates(page)).toEqual([
    { name: true, coord: true },
    { name: true, coord: true }
  ]);
  const svg = await page.evaluate(() => buildSceneSvg());
  expect(svg).toContain('ANN-A');
  expect(svg).toContain('ANN-B');
  expect(errors).toEqual([]);
});

test('批次标注：无选中或锁定对象时不写入历史', async ({ page }) => {
  const errors = await openApp(page);
  await seedTwoPoints(page);
  await page.locator('#tabBtn-list').click();
  const historyBefore = await page.evaluate(() => history.past.length);
  await page.evaluate(() => { selectedIds.clear(); refreshUI(); });
  await page.locator('#batchHideAnnotBtn').click();
  const before = await page.evaluate(() => state.objects.map(o => annotOn(o, 'name')));
  expect(before).toEqual([true, true]);
  expect(await page.evaluate(() => history.past.length)).toBe(historyBefore);
  expect(errors).toEqual([]);
});
