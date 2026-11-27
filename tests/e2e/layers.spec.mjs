/* 图层管理器：行布局、当前图层、命名校验、默认层保护、按层选择与删除迁移 */
import { test, expect } from '@playwright/test';

async function openLayers(page){
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
  await page.locator('#tabBtn-layers').click();
  await expect(page.locator('#layerList .layer-row')).toHaveCount(1);
}

test('图层行 5 个控件同排；新建图层成为当前层并决定新对象归属', async ({ page }) => {
  await openLayers(page);
  const row = await page.evaluate(() => {
    const r = document.querySelector('#layerList .layer-row');
    const kids = [...r.children];
    const centers = ['[data-layer-visible]', '[data-layer-lock]', '[data-layer-rename]', '[data-layer-delete]'].map(sel => {
      const b = r.querySelector(sel).getBoundingClientRect();
      return b.top + b.height / 2;
    });
    const del = r.querySelector('[data-layer-delete]').getBoundingClientRect();
    const sb = document.querySelector('.sidebar').getBoundingClientRect();
    return { n: kids.length, spread: Math.max(...centers) - Math.min(...centers), delRight: del.right, sbRight: sb.right };
  });
  expect(row.n).toBe(5);
  expect(row.spread).toBeLessThanOrEqual(2);
  expect(row.delRight).toBeLessThanOrEqual(row.sbRight + 1);
  await expect(page.locator('#layerList .layer-row.current .pill')).toHaveText('当前');

  await page.fill('#newLayerName', '墙体');
  await page.click('#addLayerBtn');
  await expect(page.locator('#layerList .layer-row')).toHaveCount(2);
  await expect(page.locator('#layerList .layer-row.current .name')).toContainText('墙体');
  const ids = await page.evaluate(() => ({
    active: activeLayerId,
    wall: state.layers.find(l => l.name === '墙体').id,
    picked: baseObject('point', 'point.marker', { x: 1, y: 1 }).layerId
  }));
  expect(ids.active).toBe(ids.wall);
  expect(ids.picked).toBe(ids.wall);
});

test('图层命名去重与默认图层保护', async ({ page }) => {
  await openLayers(page);
  await page.fill('#newLayerName', '墙体');
  await page.click('#addLayerBtn');
  const wallId = await page.evaluate(() => state.layers.find(l => l.name === '墙体').id);

  /* 重命名为已有名称：拒绝且保持原名 */
  await page.click(`[data-layer-rename="${wallId}"]`);
  await page.fill('#promptInput', '默认图层');
  await page.click('#modalFooter button.primary');
  await expect.poll(() => page.evaluate(id => state.layers.find(l => l.id === id).name, wallId)).toBe('墙体');

  /* 新增同名图层自动加序号，不产生重名 */
  await page.fill('#newLayerName', '墙体');
  await page.click('#addLayerBtn');
  await expect.poll(() => page.evaluate(() => state.layers.map(l => l.name))).toEqual(['默认图层', '墙体', '墙体 2']);

  /* 默认图层不可删除（可重命名） */
  await page.click('[data-layer-delete="layer.default"]');
  await expect.poll(() => page.evaluate(() => state.layers.map(l => l.name))).toEqual(['默认图层', '墙体', '墙体 2']);
});

test('隐藏当前层自动切换；按层选择跳过隐藏；删层迁移场地引用', async ({ page }) => {
  await openLayers(page);
  await page.fill('#newLayerName', '墙体');
  await page.click('#addLayerBtn');
  const wallId = await page.evaluate(() => state.layers.find(l => l.name === '墙体').id);
  await page.evaluate(wall => {
    state.objects.push(baseObject('point', 'point.marker', { x: 1, y: 1, layerId: wall }));
    state.objects.push(baseObject('point', 'point.marker', { x: 2, y: 2, layerId: wall }));
    requestRender();
  }, wallId);

  await page.click(`[data-layer-select="${wallId}"]`);
  await expect.poll(() => page.evaluate(() => selectedIds.size)).toBe(2);

  /* 隐藏当前层：自动切回可见且解锁的图层，隐藏层不能再设为当前 */
  await page.click(`[data-layer-visible="${wallId}"]`);
  await expect.poll(() => page.evaluate(() => activeLayerId)).toBe('layer.default');
  await page.click(`[data-layer-set="${wallId}"]`);
  await expect.poll(() => page.evaluate(() => activeLayerId)).toBe('layer.default');

  /* 隐藏层的对象不参与“按层选择” */
  await page.click(`[data-layer-select="${wallId}"]`);
  await expect.poll(() => page.evaluate(() => selectedIds.size)).toBe(0);

  /* 删除仅被场地引用的图层：site.layerId 迁移到默认层，不留悬空引用 */
  await page.fill('#newLayerName', '场地层');
  await page.click('#addLayerBtn');
  const siteLayer = await page.evaluate(() => state.layers.find(l => l.name === '场地层').id);
  await page.evaluate(id => { state.site.layerId = id; }, siteLayer);
  await page.click(`[data-layer-delete="${siteLayer}"]`);
  await expect.poll(() => page.evaluate(() => ({ names: state.layers.map(l => l.name), site: state.site.layerId })))
    .toEqual({ names: ['默认图层', '墙体'], site: 'layer.default' });
});
