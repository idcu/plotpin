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

test('P0-05 协作待发作为启动候选：恢复较新改动、提示来源且不删除待发记录', async ({ page }) => {
  const pid = 'P05E2E';
  const key = 'plotpin.collab.pending.v2.p:' + pid;
  const older = { schema: V2, meta: { name: 'IDB-OLD', projectId: pid, updatedAt: '2026-01-01T00:00:00.000Z' },
    floors: [{ id: 'F1', name: '1F', updatedAt: '' }], activeFloorId: 'F1', objects: [], layers: [{ id: 'L1' }] };
  const newer = { schema: V2, meta: { name: 'PEND-NEW', projectId: pid, updatedAt: '2026-01-02T00:00:00.000Z' },
    floors: [{ id: 'F1', name: '1F', updatedAt: '' }], activeFloorId: 'F1', objects: [], layers: [{ id: 'L1' }] };
  await page.addInitScript(([db, store, older, key, rec]) => {
    localStorage.setItem(key, JSON.stringify(rec));
    const req = indexedDB.open(db, 2);
    req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains(store)) d.createObjectStore(store); };
    req.onsuccess = () => { req.result.transaction(store, 'readwrite').objectStore(store).put(older, 'current'); };
  }, ['offline_drawing_annotation', 'projects', older, key, { v: 2, at: '2026-01-02T00:00:00.000Z', pid: 'p:' + pid, project: newer }]);
  await page.goto('/index.html');
  await expect(page.locator('#loadBanner')).toBeVisible();
  await expect(page.locator('#loadBanner')).toContainText('已恢复离线协作待发的最新改动；重连后会补发');
  expect(await page.evaluate(() => state.meta.name)).toBe('PEND-NEW');
  /* 采用待发不删除队列：自动保存后记录仍在，重连仍可补发 */
  await page.waitForTimeout(1500);
  expect(await page.evaluate(k => !!localStorage.getItem(k), key)).toBe(true);
});

test('P0-04 救援模式新建需显式确认：取消保持现场，确认解除救援', async ({ page }) => {
  const broken = '{"schema":"' + V2 + '","objects":[';
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [LS, broken]);
  await page.goto('/index.html');
  await expect(page.locator('#loadBanner')).toBeVisible();
  const before = await page.evaluate(() => ({ name: state.meta.name, objects: state.objects.length }));

  await page.click('#newBtn');
  await expect(page.locator('#modalBody')).toContainText('当前处于救援模式');
  await page.locator('#modalFooter button', { hasText: '取消' }).click();
  await expect(page.locator('#modalBackdrop')).not.toHaveClass(/show/);
  expect(await page.evaluate(() => ({ name: state.meta.name, objects: state.objects.length }))).toEqual(before);
  await expect(page.locator('#loadBanner')).toBeVisible();

  /* 确认后解除救援，继续走既有新建确认 */
  await page.click('#newBtn');
  await page.locator('#modalFooter button', { hasText: '确定' }).click();
  await expect(page.locator('#modalBody')).toContainText('新建将清空当前工程');
  await page.locator('#modalFooter button', { hasText: '确定' }).click();
  await expect(page.locator('#loadBanner')).toHaveCount(0);
  expect(await page.evaluate(() => state.objects.length)).toBe(0);
});

/* C4：合并工程与新建/打开走同一救援守卫；取消后现场与救援保持均不变 */
test('C4 救援模式下合并工程需显式确认：取消保持现场', async ({ page }) => {
  const broken = '{"schema":"' + V2 + '","objects":[';
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [LS, broken]);
  await page.goto('/index.html');
  await expect(page.locator('#loadBanner')).toBeVisible();
  const before = await page.evaluate(() => ({ name: state.meta.name, objects: state.objects.length }));

  await page.click('#projBtn');
  const chooser = page.waitForEvent('filechooser');
  await page.click('#projMerge');
  const fc = await chooser;
  await fc.setFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"schema":"' + V2 + '","objects":[]}') });
  await expect(page.locator('#modalBody')).toContainText('当前处于救援模式');
  await page.locator('#modalFooter button', { hasText: '取消' }).click();
  expect(await page.evaluate(() => ({ name: state.meta.name, objects: state.objects.length }))).toEqual(before);
  await expect(page.locator('#loadBanner')).toBeVisible();
});
