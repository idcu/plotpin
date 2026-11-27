/* 清单筛选：对象类别/对象类型/图层三项多选，类型选项随类别联动 */
import { test, expect } from '@playwright/test';

async function openList(page){
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
  await page.evaluate(() => {
    state.layers.push({ id: 'layer.b', name: 'B层', visible: true, locked: false });
    state.objects.push(
      baseObject('point', 'point.marker', { x: 0, y: 0 }),
      baseObject('point', 'point.marker', { x: 1, y: 0 }),
      baseObject('rect', 'rect.area', { x: 0, y: 0, width: 2, height: 2 }),
      baseObject('line', 'line.boundary', { points: [[0, 0], [2, 0]], x: 0, y: 0 })
    );
    state.objects[0].layerId = 'layer.b';
    switchTab('list');
    populateSelects();
    renderList();
  });
  await page.locator('#tabBtn-list').click();
  await expect(page.locator('#objectTbody tr[data-id]')).toHaveCount(4);
}
async function openMs(page, id){
  if(await page.locator(`#${id} .ms-pop`).evaluate(el => el.hidden)) await page.click(`#${id} [data-ms-btn]`);
}

test('清单筛选：类别/类型/图层多选，类型随类别联动并可清空', async ({ page }) => {
  await openList(page);

  /* 类别多选：点设备 + 区域 */
  await openMs(page, 'filterKindMs');
  await page.check('#filterKindMs input[value="point"]');
  await expect(page.locator('#objectTbody tr[data-id]')).toHaveCount(2);
  await expect(page.locator('#filterKindMs [data-ms-label]')).toHaveText('点设备');
  await page.check('#filterKindMs input[value="rect"]');
  await expect(page.locator('#objectTbody tr[data-id]')).toHaveCount(3);
  await expect(page.locator('#filterKindMs [data-ms-label]')).toHaveText('已选 2 项');

  /* 类型选项只包含所选类别的类型；选中 rect.area 后只剩 1 行 */
  await expect(page.locator('#filterTypeMs .ms-pop input[value="rect.area"]')).toHaveCount(1);
  await expect(page.locator('#filterTypeMs .ms-pop input[value="line.boundary"]')).toHaveCount(0);
  await openMs(page, 'filterTypeMs');
  await page.check('#filterTypeMs input[value="rect.area"]');
  await expect(page.locator('#objectTbody tr[data-id]')).toHaveCount(1);

  /* 取消区域类别：已选类型被剔除，回到点设备 2 行 */
  await openMs(page, 'filterKindMs');
  await page.uncheck('#filterKindMs input[value="rect"]');
  await expect(page.locator('#filterTypeMs .ms-pop input[value="rect.area"]')).toHaveCount(0);
  await expect(page.locator('#objectTbody tr[data-id]')).toHaveCount(2);

  /* 清空类别，图层多选：B层 只有 1 个对象 */
  await page.click('#filterKindMs [data-ms-clear]');
  await expect(page.locator('#objectTbody tr[data-id]')).toHaveCount(4);
  await openMs(page, 'filterLayerMs');
  await page.check('#filterLayerMs input[value="layer.b"]');
  await expect(page.locator('#objectTbody tr[data-id]')).toHaveCount(1);
  await expect(page.locator('#filterLayerMs [data-ms-label]')).toHaveText('B层');

  /* 类别 + 图层组合，再清空图层恢复全部 */
  await openMs(page, 'filterKindMs');
  await page.check('#filterKindMs input[value="point"]');
  await expect(page.locator('#objectTbody tr[data-id]')).toHaveCount(1);
  await openMs(page, 'filterLayerMs');
  await page.click('#filterLayerMs [data-ms-clear]');
  await expect(page.locator('#objectTbody tr[data-id]')).toHaveCount(2);
});
