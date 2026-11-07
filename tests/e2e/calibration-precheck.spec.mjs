/* D-02 校准前置状态机：入口禁用/原因/步骤指示与图片就绪后恢复 */
import { test, expect } from '@playwright/test';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function boot(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state === 'object' && typeof afterStateLoaded === 'function');
  await page.waitForTimeout(300);
}
const calib = (page) => page.locator('#calibBtn');
const affine = (page) => page.locator('#affineBtn');
const xform = (page) => page.locator('.tool-btn[data-tool="image-transform"]');
const status = (page) => page.locator('#calibStatus');

test('D-02 无底图无场地：三个入口禁用且无点击路径', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    state.site = null;
    state.background = { kind: 'empty' };
    state.objects = [];
    bgImage = null;
    await afterStateLoaded(false);
  });
  await expect(calib(page)).toBeDisabled();
  await expect(affine(page)).toBeDisabled();
  await expect(xform(page)).toBeDisabled();
  for (const l of [calib(page), affine(page), xform(page)]) {
    await expect(l).toHaveAttribute('aria-describedby', 'calibStatus');
  }
  await expect(status(page)).toBeVisible();
  await expect(status(page)).toContainText('请先导入图片底图');
  const tool = await page.evaluate(() => {
    $('calibBtn').click();
    $('affineBtn').click();
    document.querySelector('.tool-btn[data-tool="image-transform"]').click();
    return currentTool;
  });
  expect(tool).toBe('select');
});

test('D-02 仅矢量场地：提示场地按米绘制，无需校准', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    state = buildDemoProject();
    bgImage = null;
    await afterStateLoaded(false);
  });
  await expect(calib(page)).toBeDisabled();
  await expect(affine(page)).toBeDisabled();
  await expect(xform(page)).toBeDisabled();
  await expect(status(page)).toContainText('场地按米绘制，无需校准');
  await expect(status(page)).toContainText('图片变换仅适用于图片底图');
  const r = await page.evaluate(() => ({ started: startCalibTool('calibrate'), tool: currentTool }));
  expect(r.started).toBe(false);
  expect(r.tool).toBe('select');
});

test('D-02 图片资产缺失：禁用并提示原因，重新导入后自动恢复步骤指示', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    state.site = null;
    state.background = { kind: 'image', width: 10, height: 10, metersPerPixel: 0.05, assetId: '', dataUrl: '' };
    bgImage = null;
    await afterStateLoaded(false);
  });
  await expect(calib(page)).toBeDisabled();
  await expect(status(page)).toContainText('资产缺失');
  /* D-07 状态区分：解码中与资产缺失不混淆，均保持禁用但文案不同 */
  await page.evaluate(() => { bgImageState = 'decoding'; refreshCalibStatus(); });
  await expect(calib(page)).toBeDisabled();
  await expect(status(page)).toContainText('解码');

  await page.setInputFiles('#bgInput', { name: 'tiny.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect(calib(page)).toBeEnabled();
  await expect(affine(page)).toBeEnabled();
  await expect(xform(page)).toBeEnabled();
  await expect(status(page)).toBeHidden();

  await calib(page).click();
  expect(await page.evaluate(() => currentTool)).toBe('calibrate');
  await expect(status(page)).toContainText('比例尺 1/2');

  const box = await page.locator('#canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(status(page)).toContainText('比例尺 2/2');
  await page.mouse.click(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40);
  await expect(status(page)).toContainText('应用');
});
