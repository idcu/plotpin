/* A-14 浏览器真实验证：撤销/重做、新增楼层、删除当前楼层后刷新一致 */
import { test, expect } from '@playwright/test';
import { DB, idb } from './helpers.mjs';

async function openApp(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
}

async function clickCanvas(page, dx = 0, dy = 0) {
  const box = await page.locator('#canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

async function drawPoint(page, dx = 0, dy = 0) {
  await page.locator('.tool-btn[data-tool="point"]').click();
  await clickCanvas(page, dx, dy);
}

async function waitSaved(page, pick, expected) {
  await expect.poll(async () => {
    const rec = await idb(page, { store: DB.projects, op: 'get', key: 'current' });
    return rec ? pick(rec) : null;
  }, { timeout: 7000 }).toEqual(expected);
}

async function closeModalIfOpen(page) {
  if (await page.locator('#modalBackdrop').evaluate(el => el.classList.contains('show'))) {
    await page.click('#modalFooter button');
    await expect(page.locator('#modalBackdrop')).not.toHaveClass(/show/);
  }
}

test('撤销/重做持久化：撤销后刷新保持 1，重做后刷新保持 2', async ({ page }) => {
  await openApp(page);

  await drawPoint(page, 0, 0);
  await drawPoint(page, 40, 30);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(2);

  await page.click('#undoBtn');
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);
  await waitSaved(page, r => r.objects.length, 1);

  await page.reload();
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);
  /* 历史栈不随刷新持久化：撤销/重做按钮必须回到禁用态 */
  expect(await page.locator('#undoBtn').isDisabled()).toBe(true);
  expect(await page.locator('#redoBtn').isDisabled()).toBe(true);

  /* 第二阶段：再画 1 个 → 撤销 → 重做 → 刷新 */
  await drawPoint(page, -35, 20);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(2);
  await page.click('#undoBtn');
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);
  await page.click('#redoBtn');
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(2);
  await waitSaved(page, r => r.objects.length, 2);

  await page.reload();
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(2);
});

test('新增楼层：新层绘制对象后刷新，楼层/活动层/对象都保持', async ({ page }) => {
  await openApp(page);
  const before = await page.evaluate(() => state.floors.map(f => f.id));

  await page.click('#floorBtn');
  await page.click('#floorAdd');
  await page.fill('#promptInput', 'F2-E2E');
  await page.click('#modalFooter .primary');
  await expect.poll(() => page.evaluate(() => state.floors.length)).toBe(2);

  const added = await page.evaluate(() => ({
    id: state.activeFloorId,
    name: state.floors.find(f => f.id === state.activeFloorId).name,
    ids: state.floors.map(f => f.id)
  }));
  expect(added.ids).toEqual([...before, added.id]);
  expect(added.name).toBe('F2-E2E');

  await closeModalIfOpen(page);

  await drawPoint(page, 25, -20);
  await waitSaved(page, r => ({
    floors: r.floors.length,
    active: r.activeFloorId,
    objects: r.objects.length,
    firstObjects: ((r.floors[0] && r.floors[0].objects) || []).length
  }), { floors: 2, active: added.id, objects: 1, firstObjects: 0 });

  await page.reload();
  await expect.poll(() => page.evaluate(() => ({
    floors: state.floors.length,
    active: state.activeFloorId,
    objects: state.objects.length,
    name: state.floors.find(f => f.id === state.activeFloorId).name,
    firstObjects: state.floors[0].objects.length
  }))).toEqual({ floors: 2, active: added.id, objects: 1, name: 'F2-E2E', firstObjects: 0 });
});

test('删除当前楼层：删除后刷新不复活，活动层回到 1F', async ({ page }) => {
  await openApp(page);

  await page.click('#floorBtn');
  await page.click('#floorAdd');
  await page.fill('#promptInput', 'F-TEMP');
  await page.click('#modalFooter .primary');
  await expect.poll(() => page.evaluate(() => state.floors.length)).toBe(2);
  const tempId = await page.evaluate(() => state.activeFloorId);
  await closeModalIfOpen(page);

  await drawPoint(page);
  await waitSaved(page, r => ({ floors: r.floors.length, active: r.activeFloorId, objects: r.objects.length }),
    { floors: 2, active: tempId, objects: 1 });

  /* 删除当前楼层（带确认弹窗） */
  await page.click('#floorBtn');
  await page.locator(`.proj-row[data-floor="${tempId}"] button[data-fop="del"]`).click();
  await page.click('#modalFooter .primary');
  await expect.poll(() => page.evaluate(id => ({
    floors: state.floors.length,
    active: state.activeFloorId,
    objects: state.objects.length,
    hasTemp: state.floors.some(f => f.id === id)
  }), tempId)).toEqual({ floors: 1, active: 'floor.default', objects: 0, hasTemp: false });

  await waitSaved(page, r => ({
    floors: r.floors.length,
    active: r.activeFloorId,
    objects: r.objects.length,
    hasTemp: r.floors.some(f => f.id === tempId)
  }), { floors: 1, active: 'floor.default', objects: 0, hasTemp: false });

  await closeModalIfOpen(page);
  await page.reload();
  await expect.poll(() => page.evaluate(id => ({
    floors: state.floors.length,
    active: state.activeFloorId,
    objects: state.objects.length,
    hasTemp: state.floors.some(f => f.id === id)
  }), tempId)).toEqual({ floors: 1, active: 'floor.default', objects: 0, hasTemp: false });
});
