/* p2-render.perf.mjs —— P2 批次 12–16 渲染热路径性能打点（先测后改）
 *
 * 只采集真实 Chromium 数据，不改业务代码。每条用例在改动前后用**同一命令**复测：
 *   node scripts/perf-browser.mjs --no-gate tests/perf/p2-render.perf.mjs
 * 数据写入 test-results/perf-render.json。
 *
 * 环境：1920x1080 CSS 视口 @DPR1，Chromium headless（本机 SwiftShader）。
 * 堆读数经 CDP HeapProfiler.collectGarbage 强制 GC 两次后取 Runtime.getHeapUsage usedSize。
 * 注意：SwiftShader 光栅化读数不代表真实 GPU 表现，只用于同机前后对比。
 */
import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installScene } from './fixture.mjs';

const OUT_DIR = join(process.cwd(), 'test-results');
const REPORT_FILE = join(OUT_DIR, 'perf-render.json');
const SIZES = [2000, 5000, 10000];
const results = [];

function round(v, n = 2) { return v === null || v === undefined ? null : Number(v.toFixed(n)); }
function pct(arr, p) {
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * p))];
}
function stat(arr) {
  return {
    n: arr.length,
    p50: round(pct(arr, 0.5)),
    p95: round(pct(arr, 0.95)),
    max: round(Math.max(...arr)),
    avg: round(arr.reduce((s, v) => s + v, 0) / arr.length)
  };
}
function record(name, size, arr, extra) {
  const data = Object.assign({ case: name, objects: size, ms: stat(arr) }, extra || {});
  results.push(data);
  console.log('[render] ' + JSON.stringify(data));
}
function save() {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT_FILE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    node: process.version,
    env: { viewport: '1920x1080', dpr: 1, headless: true, raster: 'SwiftShader', forcedGC: 'CDP HeapProfiler.collectGarbage ×2' },
    cases: results
  }, null, 2), 'utf8');
  console.log('\n[render] 报告已写入 ' + REPORT_FILE + '（' + results.length + ' 组用例）');
}

async function openApp(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state === 'object');
  if (await page.locator('#modalBackdrop').evaluate(el => el.classList.contains('show'))) {
    await page.click('#modalFooter button');
    await page.waitForFunction(() => !document.getElementById('modalBackdrop').classList.contains('show'));
  }
}
function heapProbe(cdp) {
  return async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    await new Promise(r => setTimeout(r, 60));
    await cdp.send('HeapProfiler.collectGarbage');
    return (await cdp.send('Runtime.getHeapUsage')).usedSize;
  };
}

test.describe('P2 批次 12–16 · 渲染热路径基线', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  test.afterAll(() => save());

  for (const size of SIZES) {
    test('对象数 ' + size, async ({ page }) => {
      test.setTimeout(300000);
      await openApp(page);
      const cdp = await page.context().newCDPSession(page);
      const gcUsed = heapProbe(cdp);
      await page.evaluate(installScene, size);
      await page.evaluate(() => { syncActiveFloor(); fitView(); requestRender(); });
      await page.waitForTimeout(400);
      const heapBase = await gcUsed();
      const meta = await page.evaluate(() => ({
        objects: state.objects.length,
        zoom: state.viewport.zoom,
        w: wrap.clientWidth,
        h: wrap.clientHeight,
        dpr
      }));

      /* 1) 静态层重建：作废后同一视口重绘（对象裁剪 + 光栅化） */
      const rebuild = await page.evaluate(() => {
        const out = [];
        for (let i = 0; i < 30; i++) {
          invalidateStatic();
          const t0 = performance.now();
          drawScene(ctx, state.viewport, wrap.clientWidth, wrap.clientHeight, { interactive: true, markerScale: 1 });
          out.push(performance.now() - t0);
        }
        return out;
      });
      record('staticRebuild', size, rebuild);

      /* 2) 平移帧：每帧改 pan 触发静态层重建（现状），60 帧 */
      const pan = await page.evaluate(() => {
        const v = state.viewport, base = v.panX, out = [];
        for (let i = 0; i < 60; i++) {
          v.panX = base + (i % 2 ? 40 : -40);
          const t0 = performance.now();
          drawScene(ctx, v, wrap.clientWidth, wrap.clientHeight, { interactive: true, markerScale: 1 });
          out.push(performance.now() - t0);
        }
        v.panX = base;
        return out;
      });
      record('panFrame', size, pan);

      /* 3) 缩放帧：每帧改 zoom（必然重建），30 帧 */
      const zoom = await page.evaluate(() => {
        const v = state.viewport, base = v.zoom, out = [];
        for (let i = 0; i < 30; i++) {
          v.zoom = base * (i % 2 ? 1.01 : 0.99);
          const t0 = performance.now();
          drawScene(ctx, v, wrap.clientWidth, wrap.clientHeight, { interactive: true, markerScale: 1 });
          out.push(performance.now() - t0);
        }
        v.zoom = base;
        return out;
      });
      record('zoomFrame', size, zoom);

      /* 4) 缓存签名成本：每帧都会执行（与是否重建无关） */
      const keyCost = await page.evaluate(() => {
        const d = worldDims(), out = [];
        for (let i = 0; i < 200; i++) {
          const t0 = performance.now();
          sceneStaticKey(state.viewport, wrap.clientWidth, wrap.clientHeight, d);
          out.push(performance.now() - t0);
        }
        return out;
      });
      record('staticKeyCost', size, keyCost);

      /* 5) pointermove 索引重建成本（P2-5） */
      const idxCost = await page.evaluate(() => {
        const out = [];
        for (let i = 0; i < 100; i++) {
          const t0 = performance.now();
          objectIndexById();
          out.push(performance.now() - t0);
        }
        return out;
      });
      record('objectIndexById', size, idxCost);

      /* 6) 强制 GC 后堆占用 */
      const heapAfter = await gcUsed();
      results.push({ case: 'heapUsed', objects: size, bytes: heapAfter, baseBytes: heapBase, deltaBytes: heapAfter - heapBase });
      console.log('[render] ' + JSON.stringify({ case: 'heapUsed', objects: size, bytes: heapAfter, deltaBytes: heapAfter - heapBase }));
      void meta;
    });
  }
});
