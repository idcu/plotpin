/* D-08 保存失败可见性：配额不重试 + 手动导出；瞬时 IO 三次退避后停止 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

/** 在页面脚本前劫持 IDBObjectStore.put；__saveFail 控制失败类型 */
const patchPut = () => {
  const orig = IDBObjectStore.prototype.put;
  window.__saveFail = '';
  IDBObjectStore.prototype.put = function (...args) {
    if (window.__saveFail === 'quota') throw new DOMException('quota', 'QuotaExceededError');
    if (window.__saveFail === 'io') throw new Error('transient disk io');
    return orig.apply(this, args);
  };
};

async function boot(page) {
  await page.addInitScript(patchPut);
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
}

test('D-08 配额错误：不重试、横幅与手动导出可用、内存编辑不丢', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.__saveFail = 'quota';
    state.meta.name = 'D08-quota';
    markDirty('object');
  });
  await expect(page.locator('#saveBanner')).toBeVisible({ timeout: 2000 });
  await expect(page.locator('#saveBanner')).toContainText('保存失败');
  await expect(page.locator('#saveBanner')).toContainText('存储空间不足');
  await expect(page.locator('#saveExportBtn')).toBeVisible();
  await expect(page.locator('#saveCleanBtn')).toBeVisible();
  const health = await page.evaluate(() => saveHealth);
  expect(health.errorCode).toBe('quota');
  expect(health.retry).toBe(0);
  /* 内存编辑不丢，且手动导出拿到的是当前内存态 */
  expect(await page.evaluate(() => state.meta.name)).toBe('D08-quota');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#saveExportBtn').click()
  ]);
  const json = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  expect(json.meta.name).toBe('D08-quota');
  /* 恢复写入后下一次保存清除横幅并回到 ok */
  await page.evaluate(() => { window.__saveFail = ''; markDirty('object'); });
  await expect(page.locator('#saveBanner')).toHaveCount(0, { timeout: 3000 });
  expect(await page.evaluate(() => saveHealth.state)).toBe('ok');
});

test('D-08 瞬时 IO：1s/3s/9s 三次退避后停止并给导出入口', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.__saveFail = 'io';
    state.meta.name = 'D08-io';
    markDirty('object');
  });
  /* 首次失败立即进入退避，状态栏可见重试计数 */
  await page.waitForFunction(
    () => saveHealth.retry >= 1 && /自动重试/.test(document.getElementById('saveState').textContent),
    null,
    { timeout: 4000 }
  );
  /* 第三次失败后仍有 9s 退避；最终 3 次后停止并显示横幅 */
  await page.waitForFunction(() => saveHealth.retry === 3, null, { timeout: 20000 });
  await expect(page.locator('#saveBanner')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#saveBanner')).toContainText('自动重试 3 次');
  const health = await page.evaluate(() => saveHealth);
  expect(health.errorCode).toBe('io');
  expect(health.retry).toBe(3);
  expect(health.state).toBe('degraded');
  expect(await page.evaluate(() => state.meta.name)).toBe('D08-io');
  /* 恢复后下一次保存清除横幅 */
  await page.evaluate(() => { window.__saveFail = ''; markDirty('object'); });
  await expect(page.locator('#saveBanner')).toHaveCount(0, { timeout: 3000 });
  expect(await page.evaluate(() => saveHealth.state)).toBe('ok');
});
