/* 曲线工具（三点圆弧/样条）与顶点角度标注 */
import { clickTool } from './toolbar.mjs';
import { test, expect } from '@playwright/test';

async function openApp(page){
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
}
async function canvasCenter(page){
  const box = await page.locator('#canvas').boundingBox();
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

test('三点圆弧：三点生成经过中间点的圆弧，共线时拒绝', async ({ page }) => {
  await openApp(page);
  const { cx, cy } = await canvasCenter(page);
  await clickTool(page, 'arc');
  await page.selectOption('#arcMode', 'arc3');
  await page.mouse.click(cx - 70, cy);
  await page.mouse.click(cx, cy - 70);
  await page.mouse.click(cx + 70, cy);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);
  const arc = await page.evaluate(() => {
    const o = state.objects[0];
    return { kind: o.kind, r: o.shape.r, sweep: arcSweep(o.shape) };
  });
  expect(arc.kind).toBe('arc');
  expect(arc.r).toBeGreaterThan(0);
  expect(arc.sweep).toBeGreaterThan(1);
  expect(arc.sweep).toBeLessThan(359);

  /* 共线三点：不产生对象 */
  await page.mouse.click(cx - 40, cy + 120);
  await page.mouse.click(cx, cy + 120);
  await page.mouse.click(cx + 40, cy + 120);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);
});

test('样条曲线：控制点落笔，Enter 完成后保存 smooth 标记', async ({ page }) => {
  await openApp(page);
  const { cx, cy } = await canvasCenter(page);
  await clickTool(page, 'line');
  await page.selectOption('#lineMode', 'spline');
  await page.mouse.click(cx - 120, cy);
  await page.mouse.click(cx - 40, cy - 80);
  await page.mouse.click(cx + 40, cy + 60);
  await page.mouse.click(cx + 120, cy - 20);
  await page.locator('#canvas').focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);
  const o = await page.evaluate(() => {
    const x = state.objects[0];
    const sampled = outlineOf(x);
    return { kind: x.kind, smooth: x.smooth, closed: x.closed, n: x.points.length, sampled: sampled.length, len: objectLength(x) };
  });
  expect(o).toMatchObject({ kind: 'line', smooth: true, closed: false, n: 4 });
  expect(o.sampled).toBeGreaterThan(3 * 12);
  expect(o.len).toBeGreaterThan(0);
});

test('顶点角度：折线/矩形/场地按内角输出，样条不提供段长/角度开关', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    const open = vertexAngles([[0, 0], [4, 0], [4, 4]], false);
    const closed = vertexAngles([[0, 0], [4, 0], [4, 4], [0, 4]], true);
    const line = baseObject('line', 'line.boundary', { points: [[0, 0], [4, 0], [4, 4], [0, 4]], closed: true });
    line.annot = { angle: true };
    const rect = baseObject('rect', 'rect.area', { x: 0, y: 0, width: 4, height: 3 });
    rect.annot = { angle: true };
    state.settings.siteAngles = true;
    return {
      openN: open.length, openDeg: open[0] && open[0].deg,
      closedN: closed.length, closedDegs: closed.map(v => Math.round(v.deg)),
      lineLabels: annotationItems(line).filter(it => it.text.endsWith('°')).length,
      rectLabels: annotationItems(rect).filter(it => it.text.endsWith('°')).length,
      sitePts: siteBoundaryPoints(state.site).length,
      siteOn: siteAnnotSettingOn('siteAngles'),
      smoothKeys: annotToggleKeys({ kind: 'line', smooth: true, closed: false })
    };
  });
  expect(r.openN).toBe(1);
  expect(Math.round(r.openDeg)).toBe(90);
  expect(r.closedN).toBe(4);
  expect(r.closedDegs).toEqual([90, 90, 90, 90]);
  expect(r.lineLabels).toBe(4);
  expect(r.rectLabels).toBe(4);
  expect(r.sitePts).toBe(4);
  expect(r.siteOn).toBe(true);
  expect(r.smoothKeys).not.toContain('edge');
  expect(r.smoothKeys).not.toContain('angle');
});
