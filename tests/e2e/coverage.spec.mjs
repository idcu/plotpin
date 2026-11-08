/* B-09 覆盖率口径 v3：真实浏览器验证缩放无关、隐藏图层、面积同源与报告标注 */
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
}

test('覆盖率口径 v3：4 个缩放级别一致、隐藏图层不计入、面积同源、报告标注口径', async ({ page }) => {
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

  /* 圆/椭圆/扇形区域：覆盖率总面积必须等于统计面板的解析面积，而不是采样多边形面积 */
  const same = await page.evaluate(() => {
    state.objects = [
      baseObject('rect', 'rect.area', { name: 'CIRCLE', x: 0, y: 0, width: 10, height: 10, shape: { type: 'circle', r: 5 } }),
      baseObject('rect', 'rect.area', { name: 'ELLIPSE', x: 40, y: 0, width: 10, height: 10, shape: { type: 'ellipse', rx: 5, ry: 3 } }),
      baseObject('rect', 'rect.area', { name: 'SECTOR', x: 80, y: 0, width: 10, height: 10, shape: { type: 'sector', r: 5, a0: 0, a1: 90 } })
    ];
    const cov = analyzeCoverage(state);
    const stats = state.objects.reduce((s, o) => s + objectArea(o), 0);
    const repo = regionPolygons(state).reduce((s, r) => s + r.area, 0);
    return { covArea: cov.totalArea, stats, repo, version: cov.spec.version, areaSource: cov.spec.areaSource };
  });
  expect(same.covArea).toBeCloseTo(same.stats, 6);
  expect(same.repo).toBeCloseTo(same.stats, 6);
  expect(same.version).toBe(3);
  expect(same.areaSource).toBe('shapeArea/polygonArea');

  await page.locator('#coverageBtn').click();
  const text = await page.locator('#modalBody').innerText();
  expect(text).toContain('统计口径 v3');
  expect(text).toContain('固定目标');
});
