/* D-01：首次启动引导 —— 首次展示、完成态持久化、示例工程无孤儿资产、Esc 跳过不抑制 */
import { test, expect } from '@playwright/test';
import { FIRST_RUN_GUIDE_KEY, DB, idb } from './helpers.mjs';

/* 本文件不继承「已完成引导」的默认上下文，确保每次都从首次访问开始 */
test.use({ storageState: { cookies: [], origins: [] } });

async function openFirstRun(page) {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  await expect(page.locator('#modalBackdrop')).toHaveClass(/show/);
  await expect(page.locator('#modalTitle')).toHaveText('欢迎使用图钉');
}

function guideRecord(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), FIRST_RUN_GUIDE_KEY);
}

test('首次访问展示三步引导；选择空白开始后持久化且刷新不再打扰', async ({ page }) => {
  await openFirstRun(page);
  await expect(page.locator('#modalBody li')).toHaveCount(3);
  await expect(page.locator('#modalBody')).toContainText('示例工程包含 100×70 m 场地与 6 个示例对象');

  await page.getByRole('button', { name: '空白开始' }).click();
  await expect(page.locator('#modalBackdrop')).not.toHaveClass(/show/);
  expect(await guideRecord(page)).toMatchObject({ v: 1, status: 'completed', choice: 'blank' });

  await page.reload();
  await expect(page.locator('#canvas')).toBeVisible();
  await expect(page.locator('#modalBackdrop')).not.toHaveClass(/show/);
  expect(await page.evaluate(() => state.objects.length)).toBe(0);
});

test('打开示例工程：100×70 场地 + 6 个对象、无图片资产、刷新后恢复', async ({ page }) => {
  await openFirstRun(page);
  await page.getByRole('button', { name: '打开示例工程' }).click();
  await expect(page.locator('#modalBackdrop')).not.toHaveClass(/show/);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(6);

  const info = await page.evaluate(() => ({
    name: state.meta.name,
    site: state.site && state.site.shape,
    background: state.background && state.background.kind,
    assetId: state.background && state.background.assetId,
    kinds: state.objects.map(o => o.kind).sort()
  }));
  expect(info.name).toBe('示例工程');
  expect(info.site).toEqual({ type: 'rect', x: 0, y: 0, w: 100, h: 70 });
  expect(info.background).toBe('empty');
  expect(info.assetId).toBe('');
  expect(info.kinds).toEqual(['dimension', 'line', 'point', 'point', 'rect', 'text']);
  expect(await idb(page, { store: DB.assets, op: 'keys' })).toEqual([]);

  /* 自动保存落盘后再刷新，验证示例工程不是只在内存里 */
  await expect.poll(async () => {
    const rec = await idb(page, { store: DB.projects, op: 'get', key: 'current' });
    return rec && Array.isArray(rec.objects) ? rec.objects.length : 0;
  }, { timeout: 5000 }).toBe(6);
  await page.reload();
  await expect(page.locator('#modalBackdrop')).not.toHaveClass(/show/);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(6);
  expect(await guideRecord(page)).toMatchObject({ v: 1, status: 'completed', choice: 'demo' });
});

test('Esc 跳过只记 skipped，下次启动仍展示引导', async ({ page }) => {
  await openFirstRun(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#modalBackdrop')).not.toHaveClass(/show/);
  expect(await guideRecord(page)).toMatchObject({ v: 1, status: 'skipped', choice: 'later' });

  await page.reload();
  await expect(page.locator('#modalBackdrop')).toHaveClass(/show/);
  await expect(page.locator('#modalTitle')).toHaveText('欢迎使用图钉');
});
