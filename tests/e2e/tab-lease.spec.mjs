/* D-09 多标签编辑租约：同工程冲突可见、保存前拦截、确认取得租约、pagehide 释放 */
import { test, expect } from '@playwright/test';
import { idb, DB } from './helpers.mjs';

async function boot(page, projectId) {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  await page.evaluate(pid => { state.meta.projectId = pid; leaseSyncProject(); }, projectId);
}

test('D-09 同工程双标签：6s 内横幅、暂缓保存、确认租约与释放', async ({ page, context }) => {
  await boot(page, 'D09-P1');
  const p2 = await context.newPage();
  await boot(p2, 'D09-P1');
  await expect(page.locator('#leaseBanner')).toBeVisible({ timeout: 6000 });
  await expect(p2.locator('#leaseBanner')).toBeVisible({ timeout: 6000 });
  await expect(p2.locator('#leaseBanner')).toContainText('另一标签页正在编辑');
  await expect(p2.locator('#leaseBanner')).toContainText(/最后心跳 \d{1,2}:\d{2}:\d{2}/);
  /* 冲突期间自动保存被暂缓：状态栏提示，且不进入保存流程 */
  await p2.evaluate(() => { state.meta.name = 'D09-blocked'; markDirty('object'); });
  await expect(p2.locator('#saveState')).toContainText('已暂停自动保存');
  expect(await p2.evaluate(() => saveHealth.state)).toBe('ok');
  /* 确认后取得租约：本页横幅消失，对端继续显示冲突 */
  p2.once('dialog', d => d.accept());
  await p2.locator('#leaseClaimBtn').click();
  await expect(p2.locator('#leaseBanner')).toHaveCount(0);
  expect(await p2.evaluate(() => leaseStatus().confirmed)).toBe(true);
  await expect(page.locator('#leaseBanner')).toBeVisible();
  /* pagehide 释放：离开页面后对端冲突解除 */
  await p2.goto('about:blank');
  await expect(page.locator('#leaseBanner')).toHaveCount(0, { timeout: 6000 });
  expect(await page.evaluate(() => leaseStatus().conflict)).toBe(false);
});

test('D-09 不同工程双标签：互不触发冲突', async ({ page, context }) => {
  await boot(page, 'D09-A');
  const p2 = await context.newPage();
  await boot(p2, 'D09-B');
  await page.waitForTimeout(6000);
  await expect(page.locator('#leaseBanner')).toHaveCount(0);
  await expect(p2.locator('#leaseBanner')).toHaveCount(0);
  expect(await page.evaluate(() => leaseStatus().conflict)).toBe(false);
  expect(await p2.evaluate(() => leaseStatus().conflict)).toBe(false);
});

test('H-01 bfcache 返回后重新取得租约并进入心跳确认窗口', async ({ page }) => {
  await boot(page, 'H01-BFCACHE');
  expect(await page.evaluate(() => leaseStatus().confirmed)).toBe(false);
  /* 模拟 pagehide 释放 → pageshow(persisted) 返回 */
  await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); });
  expect(await page.evaluate(() => leaseActive)).toBe(false);
  await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
  expect(await page.evaluate(() => leaseActive)).toBe(true);
  /* 心跳确认窗口内禁止落盘，避免旧标签抢写 */
  expect(await page.evaluate(() => leaseSaveBlocked())).toBe(true);
});

test('H-01 库内同工程更新时拒绝整工程覆盖并显示横幅', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  const result = await page.evaluate(async () => {
    state.meta.projectId = 'H01-GUARD';
    state.meta.name = 'A';
    state.meta.updatedAt = '2026-01-01T00:00:00.000Z';
    await idbPutCurrentAndProject(persistableState(), 'H01-GUARD');
    state.meta.name = 'B';
    state.meta.updatedAt = '2000-01-01T00:00:00.000Z';
    markDirty('object');
    state.meta.updatedAt = '2000-01-01T00:00:00.000Z';
    await saveOnce(saveSeq + 1);
    return { stale: staleWrite };
  });
  expect(result.stale).toBe(true);
  await expect(page.locator('#staleWriteBanner')).toBeVisible();
  const rec = await idb(page, { store: DB.projects, op: 'get', key: 'proj:H01-GUARD' });
  expect(rec.meta.name).toBe('A');
  expect(rec.meta.updatedAt).toBe('2026-01-01T00:00:00.000Z');
});
