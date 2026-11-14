/* f4-scale.perf.mjs —— F4 前置基准：20k/50k 规模下「线性裁剪」到底占多少
 *
 * 只采数、不改产品代码。目的是回答一个问题：
 *   10k→50k 时，静态层重建的时间里，O(N) 视口裁剪占多大比例？绘制占多大比例？
 * 若裁剪占比很小（绘制才是大头），网格索引换来的收益不足以抵渲染主路径的风险，F4 不开工。
 *
 * 口径：
 *   cullMs      —— 与 drawStaticContent 同口径的裁剪循环（isVisible + objectSnapBounds + boundsIntersect），
 *                  用页面内副本计时（不改产品代码）；副本与产品代码逐表达式一致，见下。
 *   rebuildMs   —— invalidateStatic + drawScene + getImageData(强制光栅)。
 *   drawCalls   —— 通过裁剪真正进入 drawObject 的对象数（拦截 window.drawObject 统计）。
 *   drawMs      —— drawObject 累计耗时。
 *   cullShare   —— cullMs / rebuildMs。
 *
 *   node scripts/perf-browser.mjs --no-gate tests/perf/f4-scale.perf.mjs
 * 报告写入 test-results/perf-f4-scale.json（本片不带门禁，只作决策依据）。
 */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installScene, hostSnapshot } from './fixture.mjs';

const OUT_DIR = join(process.cwd(), 'test-results');
const REPORT_FILE = join(OUT_DIR, 'perf-f4-scale.json');
const SIZES = [10000, 20000, 50000];

const round = (v, n = 2) => (v === null || v === undefined ? null : Number(v.toFixed(n)));
function pct(arr, p) {
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * p))];
}
const stat = arr => ({
  n: arr.length,
  p50: round(pct(arr, 0.5)),
  p95: round(pct(arr, 0.95)),
  max: round(Math.max(...arr)),
  avg: round(arr.reduce((s, v) => s + v, 0) / arr.length)
});

const results = [];
function save() {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT_FILE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    node: process.version,
    env: { viewport: '1920x1080', dpr: 1, headless: true, raster: 'SwiftShader' },
    note: 'F4 前置基准，只采数、无门禁；宿主负载见各用例 host',
    host: hostSnapshot(),
    cases: results
  }, null, 2), 'utf8');
  console.log('\n[f4-scale] 报告已写入 ' + REPORT_FILE);
}

async function openApp(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state === 'object');
  if (await page.locator('#modalBackdrop').evaluate(el => el.classList.contains('show'))) {
    await page.click('#modalFooter button');
    await page.waitForFunction(() => !document.getElementById('modalBackdrop').classList.contains('show'));
  }
}

test.describe('F4 · 20k/50k 线性裁剪占比基准', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  test.afterAll(() => save());

  test('10k / 20k / 50k：裁剪 vs 绘制', async ({ page }) => {
    test.setTimeout(600000);
    await openApp(page);

    for (const size of SIZES) {
      await page.evaluate(installScene, size);
      const data = await page.evaluate((n) => {
        const w = wrap.clientWidth, h = wrap.clientHeight, d = worldDims();
        const view = visibleWorldRect(state.viewport, d, w, h);
        const bnd = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        /* 与 drawStaticContent 的裁剪循环同口径（F2 之后 z 序来自 hitOrderObjects 缓存） */
        const cull = () => {
          let c = 0;
          const list = hitOrderObjects();
          for (let i = 0; i < list.length; i++) {
            const o = list[i];
            if (!isVisible(o)) continue;
            if (!boundsIntersect(objectSnapBounds(o, bnd), view)) continue;
            c++;
          }
          return c;
        };
        const cullMs = [], rebuildMs = [];
        let drawCalls = 0, drawMs = 0;
        const od = window.drawObject;
        window.drawObject = function () {
          const t0 = performance.now();
          const r = od.apply(this, arguments);
          drawMs += performance.now() - t0; drawCalls++;
          return r;
        };
        const rebuild = () => {
          invalidateStatic();
          drawScene(ctx, state.viewport, w, h, { interactive: true, markerScale: 1 });
          ctx.getImageData(0, 0, 8, 8);
        };
        rebuild();                                  /* 预热 */
        const hit = cull();
        for (let i = 0; i < 10; i++) {
          const t0 = performance.now();
          cull();
          cullMs.push(performance.now() - t0);
        }
        const samples = n >= 50000 ? 3 : 5;
        drawCalls = 0; drawMs = 0;
        for (let i = 0; i < samples; i++) {
          const t0 = performance.now();
          rebuild();
          rebuildMs.push(performance.now() - t0);
        }
        window.drawObject = od;
        return {
          objects: state.objects.length, culled: hit,
          cullMs, rebuildMs, drawCalls: drawCalls / samples, drawMs: drawMs / samples
        };
      }, size);

      const cullStat = stat(data.cullMs), rbStat = stat(data.rebuildMs);
      const rec = {
        size,
        objects: data.objects,
        culled: data.culled,
        cullMs: cullStat,
        rebuildMs: rbStat,
        drawCallsPerRebuild: round(data.drawCalls, 1),
        drawMsPerRebuild: round(data.drawMs, 2),
        cullShareOfRebuild: round(cullStat.p50 / rbStat.p50, 4),
        drawShareOfRebuild: round(data.drawMs / rbStat.p50, 4),
        host: hostSnapshot()
      };
      results.push(rec);
      console.log('[f4-scale] ' + JSON.stringify({
        size, cullP50: cullStat.p50, rebuildP50: rbStat.p50, rebuildP95: rbStat.p95,
        drawCalls: rec.drawCallsPerRebuild, drawMs: rec.drawMsPerRebuild,
        cullShare: rec.cullShareOfRebuild, drawShare: rec.drawShareOfRebuild
      }));
      expect(data.objects).toBe(size);
    }
  });
});
