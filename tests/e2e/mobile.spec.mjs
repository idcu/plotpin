/* B-15：移动端（真实 Chromium 移动模拟）—— 触控目标/安全区/基本操作 + 首屏与帧实测 */
import { test, expect } from '@playwright/test';
import { SCENE_A } from './helpers/scenes.mjs';
import { firstRunSeenStorage } from './helpers.mjs';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
test.describe('移动视口基本操作', () => {
  test('安全区/触控目标/点选落点与侧栏开合', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#canvas')).toBeVisible();

    const meta = await page.evaluate(() => ({
      viewport: document.querySelector('meta[name="viewport"]')?.content || '',
      touchAction: getComputedStyle(document.getElementById('canvas')).touchAction,
      envSupported: CSS.supports('padding-bottom', 'env(safe-area-inset-bottom)')
    }));
    expect(meta.viewport).toContain('viewport-fit=cover');
    expect(meta.touchAction).toBe('none');       /* 画布手势由 Pointer Events 接管，浏览器不滚动 */
    expect(meta.envSupported).toBe(true);        /* 安全区表达式被解析（模拟器内取值为 0） */

    /* 触控目标：工具栏图标不小于 44×44 CSS px */
    const box = await page.locator('.tool-btn[data-tool="point"]').boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);

    /* 侧栏开关：☰ 打开 → 点画布关闭 */
    await page.locator('#sidebarToggle').tap();
    await expect(page.locator('body')).toHaveClass(/sidebar-open/);
    await page.touchscreen.tap(30, 500);
    await expect(page.locator('body')).not.toHaveClass(/sidebar-open/);

    /* 触屏点选工具 + 轻触画布落点 */
    await page.locator('.tool-btn[data-tool="point"]').tap();
    const cbox = await page.locator('#canvas').boundingBox();
    await page.touchscreen.tap(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2);
    await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);
    const pos = await page.evaluate(() => {
      const o = state.objects[0];
      return { x: +o.x.toFixed(2), y: +o.y.toFixed(2) };
    });
    console.log('[B-15][touch] firstObject=' + JSON.stringify(pos));
  });
});

test('移动端首屏与 2000 对象帧实测（同机桌面/移动两份数据）', async ({ browser, baseURL }) => {
  const configs = [
    { name: 'desktop', viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
    { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  ];
  const out = {};
  for (const cfg of configs) {
    const ctx = await browser.newContext({ ...cfg, storageState: firstRunSeenStorage(baseURL) });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('/index.html');
    await expect(page.locator('#canvas')).toBeVisible();
    const m = await page.evaluate(async ({ sceneSrc }) => {
      const N = eval(sceneSrc)(2000);
      const cv = document.getElementById('canvas');
      const rect = cv.getBoundingClientRect();
      const cssW = Math.round(rect.width), cssH = Math.round(rect.height);
      const dpr = window.devicePixelRatio || 1;
      const off = document.createElement('canvas');
      off.width = Math.round(cssW * dpr); off.height = Math.round(cssH * dpr);
      const c = off.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const now = () => performance.now();
      for (let i = 0; i < 3; i++) { invalidateStatic(); drawScene(c, state.viewport, cssW, cssH, { interactive: true, markerScale: 1 }); }
      const rebuild = [];
      for (let i = 0; i < 10; i++) {
        const t0 = now(); invalidateStatic();
        drawScene(c, state.viewport, cssW, cssH, { interactive: true, markerScale: 1 });
        rebuild.push(now() - t0);
      }
      const cached = [];
      for (let i = 0; i < 120; i++) {
        const t0 = now();
        drawScene(c, state.viewport, cssW, cssH, { interactive: true, markerScale: 1 });
        cached.push(now() - t0);
      }
      /* rAF 采样：移动模拟下的事件循环节拍（非绘制耗时，含浏览器合成/调度） */
      const raf = await new Promise(resolve => {
        const arr = []; let last = performance.now();
        const loop = () => {
          const t = performance.now(); arr.push(t - last); last = t;
          if (arr.length < 90) requestAnimationFrame(loop); else resolve(arr);
        };
        requestAnimationFrame(loop);
      });
      const paint = performance.getEntriesByType('paint');
      const fcp = (paint.find(p => p.name === 'first-contentful-paint') || {}).startTime ?? null;
      const stat = arr => {
        const a = arr.slice().sort((x, y) => x - y);
        const avg = a.reduce((s, v) => s + v, 0) / a.length;
        return { avg: +avg.toFixed(2), p50: +a[Math.floor(a.length * 0.5)].toFixed(2),
          p95: +a[Math.floor(a.length * 0.95)].toFixed(2) };
      };
      return { objects: N, cssW, cssH, dpr, fcp: fcp === null ? null : +fcp.toFixed(1),
        rebuild: stat(rebuild), cached: stat(cached), raf: stat(raf.slice(1)) };
    }, { sceneSrc: SCENE_A });
    await ctx.close();
    m.pageErrors = errors;
    out[cfg.name] = m;
  }
  console.log('[B-15][render] ' + JSON.stringify(out));

  for (const name of ['desktop', 'mobile']) {
    expect(out[name].objects).toBe(2000);
    expect(out[name].cached.p95).toBeLessThan(30);
    expect(out[name].rebuild.p95).toBeLessThan(400);
    expect(out[name].pageErrors.length).toBe(0);
  }
  if (out.mobile.fcp !== null) expect(out.mobile.fcp).toBeLessThan(3000);
});
