import { test, expect } from '@playwright/test';

/* P2-03（M-12）：撤销覆盖 markerScale / 自定义属性增删 / 节点排序。
   历史必须压「变更前」快照：Ctrl+Z 回到改前，且一次编辑只回退一步。 */

const blur = page => page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });

test('P2-03：markerScale 修改可撤销且一次只回退一步', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  expect(await page.evaluate(() => state.settings.markerScale)).toBe(1);

  await page.evaluate(() => {
    const el = $('markerScaleInput');
    el.value = '1.5';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(await page.evaluate(() => state.settings.markerScale)).toBe(1.5);
  expect(await page.evaluate(() => history.past.length)).toBe(1);

  await blur(page);
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => state.settings.markerScale)).toBe(1);
  /* 只回退一步：再按一次不应把设置改坏 */
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => state.settings.markerScale)).toBe(1);
});

test('P2-03：自定义属性新增/删除可撤销', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  await page.evaluate(() => {
    state.objects.push(baseObject('point', 'point.marker', { name: 'P2-03', x: 5, y: 5 }));
    commitChange('P2-03 建对象');
    selectedIds.clear(); selectedIds.add(state.objects[0].id);
    switchTab('props'); renderProps();
  });

  await page.fill('#propKey', 'P2K');
  await page.fill('#propValue', 'V1');
  await page.click('#propAdd');
  expect(await page.evaluate(() => state.objects[0].props.P2K)).toBe('V1');

  await blur(page);
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => 'P2K' in state.objects[0].props)).toBe(false);

  /* 再新增后删除，撤销应恢复键值 */
  await page.evaluate(() => {
    selectedIds.clear(); selectedIds.add(state.objects[0].id);
    switchTab('props'); renderProps();
  });
  await page.fill('#propKey', 'P2K');
  await page.fill('#propValue', 'V2');
  await page.click('#propAdd');
  await page.evaluate(() => {
    const idx = Object.keys(state.objects[0].props).indexOf('P2K');
    document.querySelector(`[data-prop-del="${idx}"]`).click();
  });
  expect(await page.evaluate(() => 'P2K' in state.objects[0].props)).toBe(false);

  await blur(page);
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => state.objects[0].props.P2K)).toBe('V2');
});

test('P2-03：节点下移可撤销，不可移动时不产生历史', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  await page.evaluate(() => {
    state.objects.push(baseObject('line', 'line.boundary', { name: 'NODE', points: [[0, 0], [10, 0], [10, 10]] }));
    commitChange('P2-03 折线');
    selectedIds.clear(); selectedIds.add(state.objects[0].id);
    switchTab('props'); renderProps();
  });
  const before = await page.evaluate(() => state.objects[0].points.map(p => p.slice()));

  await page.click('[data-node-down="0"]');
  expect(await page.evaluate(() => state.objects[0].points[0])).toEqual(before[1]);
  await blur(page);
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => state.objects[0].points)).toEqual(before);

  /* 首节点上移按钮禁用 → 点击不产生历史 */
  await page.evaluate(() => {
    selectedIds.clear(); selectedIds.add(state.objects[0].id);
    switchTab('props'); renderProps();
  });
  const h0 = await page.evaluate(() => history.past.length);
  await page.evaluate(() => document.querySelector('[data-node-up="0"]').click());
  expect(await page.evaluate(() => history.past.length)).toBe(h0);
});
