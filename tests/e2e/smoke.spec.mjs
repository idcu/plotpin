/* A-14 冒烟：页面加载 / 基础绘制与选择 / 导出入口 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function openApp(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  return errors;
}

async function drawPointAtCanvasCenter(page) {
  await page.locator('.tool-btn[data-tool="point"]').click();
  const box = await page.locator('#canvas').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.click(cx, cy);
  return { cx, cy, box };
}

test('页面加载：无脚本错误、CSP 生效、画布就绪', async ({ page }) => {
  const errors = await openApp(page);
  const info = await page.evaluate(() => {
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    const canvas = document.getElementById('canvas');
    return {
      schema: state.schema,
      csp: meta ? meta.content : '',
      canvasW: canvas.width,
      canvasH: canvas.height,
      scriptCount: document.querySelectorAll('script[src]').length,
      remoteRefs: Array.from(document.querySelectorAll('script[src],link[href],img[src]'))
        .map(el => el.src || el.href || '')
        .filter(u => {
          try { return new URL(u, location.origin).origin !== location.origin; }
          catch (_) { return false; }
        })
    };
  });
  expect(info.schema).toBe('offline-drawing-annotation/v2');
  expect(info.canvasW).toBeGreaterThan(0);
  expect(info.canvasH).toBeGreaterThan(0);
  expect(info.scriptCount).toBeGreaterThan(10);
  expect(info.remoteRefs).toEqual([]);
  expect(info.csp).toContain("script-src 'self'");
  expect(info.csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(errors).toEqual([]);
});

test('基础绘制/选择：点工具落点、选择工具命中并打开属性面板', async ({ page }) => {
  const errors = await openApp(page);
  const { cx, cy } = await drawPointAtCanvasCenter(page);

  const afterDraw = await page.evaluate(() => ({
    count: state.objects.length,
    kind: state.objects[0] && state.objects[0].kind,
    selected: selectedIds.size
  }));
  expect(afterDraw.count).toBe(1);
  expect(afterDraw.kind).toBe('point');
  expect(afterDraw.selected).toBe(1);

  await page.locator('.tool-btn[data-tool="select"]').click();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => selectedIds.size)).toBe(0);

  await page.mouse.click(cx, cy);
  const afterSelect = await page.evaluate(() => {
    const o = state.objects[0];
    return {
      selected: Array.from(selectedIds),
      id: o.id,
      panelLen: document.getElementById('propPanel').textContent.trim().length
    };
  });
  expect(afterSelect.selected).toEqual([afterSelect.id]);
  expect(afterSelect.panelLen).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('导出入口可用：JSON 导出真实下载并可解析', async ({ page }) => {
  const errors = await openApp(page);
  await drawPointAtCanvasCenter(page);

  const downloadPromise = page.waitForEvent('download');
  await page.selectOption('#exportKind', 'json');
  await page.click('#exportBtn');
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const file = await download.path();
  expect(file).toBeTruthy();
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  expect(parsed.schema).toBe('offline-drawing-annotation/v2');
  expect(Array.isArray(parsed.objects)).toBe(true);
  expect(parsed.objects.length).toBe(1);
  expect(parsed.objects[0].kind).toBe('point');
  expect(errors).toEqual([]);
});
