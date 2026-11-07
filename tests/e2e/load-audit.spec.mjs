/* D-07 加载完整性审计：损坏草稿救援、IDB 降级备份恢复、双坏空工程 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const LS = 'offline-drawing-annotation.project';
const V2 = 'offline-drawing-annotation/v2';

test('D-07 损坏 current：横幅 + 救援期间不覆盖 + 救援导出原文', async ({ page }) => {
  const broken = '{"schema":"' + V2 + '","objects":[';
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [LS, broken]);
  await page.goto('/index.html');
  await expect(page.locator('#loadBanner')).toBeVisible();
  await expect(page.locator('#loadBanner')).toContainText('工程加载异常');
  /* 救援保持期间即使发生变更也不落盘：2 秒后原文必须未被覆盖 */
  await page.evaluate(() => { markDirty('object'); });
  await page.waitForTimeout(2000);
  expect(await page.evaluate(k => localStorage.getItem(k), LS)).toBe(broken);
  await expect(page.locator('#loadBanner')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#loadRescueBtn').click()
  ]);
  const saved = fs.readFileSync(await download.path(), 'utf8');
  expect(saved).toBe(broken);
  /* 导出即确认救援：横幅移除、保持解除 */
  await expect(page.locator('#loadBanner')).toHaveCount(0);
});

test('D-07 IDB 不可用但 localStorage 正常：从备份恢复并提示来源', async ({ page }) => {
  const minimal = {
    schema: V2,
    floors: [{ id: 'F1', name: '1F', updatedAt: '' }],
    activeFloorId: 'F1',
    objects: [],
    layers: [{ id: 'L1' }]
  };
  await page.addInitScript(([k, v]) => {
    localStorage.setItem(k, v);
    try { IDBFactory.prototype.open = function(){ throw new Error('idb disabled'); }; } catch (_) {}
  }, [LS, JSON.stringify(minimal)]);
  await page.goto('/index.html');
  await expect(page.locator('#loadBanner')).toBeVisible();
  await expect(page.locator('#loadBanner')).toContainText('已从本地备份恢复');
  await expect(page.locator('#loadRescueBtn')).toHaveCount(0);
  expect(await page.evaluate(() => state.schema)).toBe(V2);
  expect(await page.evaluate(() => state.floors.length)).toBe(1);
});

test('D-07 双坏：空工程 + 错误横幅，且不弹首启引导', async ({ page }) => {
  await page.addInitScript(([k, v]) => {
    localStorage.setItem(k, v);
    try { IDBFactory.prototype.open = function(){ throw new Error('idb disabled'); }; } catch (_) {}
  }, [LS, '{broken']);
  await page.goto('/index.html');
  await expect(page.locator('#loadBanner')).toBeVisible();
  await expect(page.locator('#loadBanner')).toHaveClass(/error/);
  await expect(page.locator('#loadRescueBtn')).toBeVisible();
  await expect(page.locator('#modalBackdrop')).not.toHaveClass(/show/);
  expect(await page.evaluate(() => state.objects.length)).toBe(0);
});
