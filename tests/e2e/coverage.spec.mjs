/* B-09 覆盖率口径 v2：真实浏览器验证缩放无关、隐藏图层与报告标注 */
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
}

test('覆盖率口径 v2：4 个缩放级别一致、隐藏图层不计入、报告标注口径', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    state.objects = [
      baseObject('rect', 'rect.area', { name: 'R', x: 0, y: 0, width: 100, height: 100 }),
      baseObject('point', 'point.camera', { name: 'C', x: 10, y: 10, phys: 80, angle: 30 })
    ];
  });

  const ratios = await page.evaluate(() => [0.25, 1, 4, 16].map(z => {
    state.viewport.zoom = z;
    return analyzeCoverage(state).ratio;
  }));
  const spread = (Math.max(...ratios) - Math.min(...ratios)) * 100;
  expect(spread).toBeLessThanOrEqual(1);

  const hidden = await page.evaluate(() => {
    state.layers.push({ id: 'layer.test', name: '测试隐藏层', visible: false, locked: false });
    state.objects.push(baseObject('rect', 'rect.area', { name: 'H', x: 200, y: 0, width: 100, height: 100, layerId: 'layer.test' }));
    const r = analyzeCoverage(state);
    return { area: r.totalArea, regions: r.regions.length, cams: r.cameraCount, grid: r.gridCells };
  });
  expect(hidden.area).toBe(10000);
  expect(hidden.regions).toBe(1);
  expect(hidden.cams).toBe(1);

  await page.locator('#coverageBtn').click();
  const text = await page.locator('#modalBody').innerText();
  expect(text).toContain('统计口径 v2');
  expect(text).toContain('固定目标');
});
