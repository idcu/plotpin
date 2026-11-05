/* A-06 浏览器验证：单击对象不落盘/不清覆盖率、拖拽 Esc 回滚 */
import { test, expect } from '@playwright/test';
import { DB, idb } from './helpers.mjs';

async function openApp(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
}

async function drawPointAtCenter(page) {
  await page.locator('.tool-btn[data-tool="point"]').click();
  const box = await page.locator('#canvas').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.click(cx, cy);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);
  return { cx, cy };
}

async function waitSaved(page, pick, expected) {
  await expect.poll(async () => {
    const rec = await idb(page, { store: DB.projects, op: 'get', key: 'current' });
    return rec ? pick(rec) : null;
  }, { timeout: 7000 }).toEqual(expected);
}

test('单击选中对象：不落盘、不清覆盖率、不留空撤销快照', async ({ page }) => {
  await openApp(page);
  const { cx, cy } = await drawPointAtCenter(page);
  await waitSaved(page, r => r.objects.length, 1);

  /* 记录落盘调用次数：单击期间不得新增 scheduleSave */
  await page.evaluate(() => {
    window.__saveCalls = 0;
    const real = scheduleSave;
    scheduleSave = function () { window.__saveCalls++; return real.apply(this, arguments); };
  });

  await page.locator('.tool-btn[data-tool="select"]').click();
  const before = await page.evaluate(() => {
    coverageResult = { regions: [], cameraCount: 0, ratio: 0 };
    return { updated: state.meta.updatedAt, hist: history.past.length };
  });

  await page.mouse.click(cx, cy);

  const after = await page.evaluate(() => ({
    selected: selectedIds.size,
    saves: window.__saveCalls,
    updated: state.meta.updatedAt,
    hist: history.past.length,
    coverage: coverageResult
  }));
  expect(after.selected).toBe(1);
  expect(after.saves).toBe(0);
  expect(after.updated).toBe(before.updated);
  expect(after.hist).toBe(before.hist);
  expect(after.coverage).not.toBeNull();
});

test('拖拽中 Esc：对象回到原位，撤销栈不留空快照', async ({ page }) => {
  await openApp(page);
  const { cx, cy } = await drawPointAtCenter(page);
  await page.locator('.tool-btn[data-tool="select"]').click();

  const before = await page.evaluate(() => {
    const o = state.objects[0];
    return { x: o.x, y: o.y, hist: history.past.length };
  });

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 40, { steps: 5 });
  const during = await page.evaluate(() => {
    const o = state.objects[0];
    return { x: o.x, y: o.y, hist: history.past.length };
  });
  expect(during.x).not.toBe(before.x);

  await page.keyboard.press('Escape');
  const after = await page.evaluate(() => {
    const o = state.objects[0];
    return { x: o.x, y: o.y, hist: history.past.length, dragging: drag === null };
  });
  expect(after.x).toBe(before.x);
  expect(after.y).toBe(before.y);
  expect(after.hist).toBe(before.hist);
  expect(after.dragging).toBe(true);

  await page.mouse.up();
  const settled = await page.evaluate(() => {
    const o = state.objects[0];
    return { x: o.x, y: o.y, hist: history.past.length };
  });
  expect(settled).toEqual({ x: before.x, y: before.y, hist: before.hist });
});
