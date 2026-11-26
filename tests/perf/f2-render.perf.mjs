/* f2-render.perf.mjs —— F2 静态层重建与缓存键夹具
 *
 * 采集三组数据，全部在真实 Chromium 中取：
 *   1) 整层重建耗时（10k 对象）：invalidateStatic + drawScene + getImageData 强制光栅；
 *   2) z 序重排的确定性证据：重建期间「长度≥1000 的 Array.prototype.sort」调用次数；
 *   3) 参照版不可见时闪烁定时器是否空转：1.5s 内 invalidateStatic 调用次数。
 * 另附缓存键单次成本（sceneStaticContentKey），用于判断是否值得替换 JSON.stringify。
 *
 *   node scripts/perf-browser.mjs --no-gate tests/perf/f2-render.perf.mjs   # 采数
 *   node scripts/perf-browser.mjs tests/perf/f2-render.perf.mjs             # 带门禁
 * 报告写入 test-results/perf-f2-render.json。
 */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installScene, hostSnapshot } from './fixture.mjs';

const OUT_DIR = join(process.cwd(), 'test-results');
const REPORT_FILE = join(OUT_DIR, 'perf-f2-render.json');
const SIZE = 10000;
const NO_GATE = process.env.PERF_NO_GATE === '1';

/* 门禁阈值（改动后同夹具实测填，见 backup/F2/CHANGES.md §6）：
 * rebuildP95 用改后读数留余量；sortCalls / blinkInvalidates 是确定性判据，必须为 0。 */
const GATES = {
  rebuildP95: 450,
  sortCalls: 0,
  blinkInvalidates: 0
};

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
const record = (name, data) => results.push(Object.assign({ case: name, objects: SIZE }, data));
function save() {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT_FILE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    node: process.version,
    env: { viewport: '1920x1080', dpr: 1, headless: true, raster: 'SwiftShader', size: SIZE },
    thresholds: GATES,
    gateEnabled: !NO_GATE,
    cases: results
  }, null, 2), 'utf8');
  console.log('\n[f2-render] 报告已写入 ' + REPORT_FILE);
}
async function openApp(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state === 'object');
  if (await page.locator('#modalBackdrop').evaluate(el => el.classList.contains('show'))) {
    await page.click('#modalFooter button');
    await page.waitForFunction(() => !document.getElementById('modalBackdrop').classList.contains('show'));
  }
}

test.describe('F2 · 静态层重建与缓存键（10k 对象）', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  test.afterAll(() => save());

  test('重建耗时 / z 序重排次数 / 参照层空转', async ({ page }) => {
    test.setTimeout(240000);
    await openApp(page);
    await page.evaluate(installScene, SIZE);

    const data = await page.evaluate(() => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      const rebuild = () => {
        invalidateStatic();
        drawScene(ctx, state.viewport, w, h, { interactive: true, markerScale: 1 });
        ctx.getImageData(0, 0, 8, 8);
      };
      const ms = [];
      /* 预热：首轮 JIT、首帧分配不计入 */
      rebuild(); rebuild();

      /* 确定性证据：重建期间 ≥1000 元素的 sort 次数 */
      const origSort = Array.prototype.sort;
      let sortCalls = 0;
      Array.prototype.sort = function (cmp) {
        if (this.length >= 1000) sortCalls++;
        return origSort.call(this, cmp);
      };
      for (let i = 0; i < 10; i++) {
        const t0 = performance.now();
        rebuild();
        ms.push(performance.now() - t0);
      }
      Array.prototype.sort = origSort;
      sortCalls = sortCalls / 10;   /* 每次重建的平均大数组排序次数 */

      /* 缓存键单次成本 */
      const d = worldDims();
      const keyLoops = 2000;
      const k0 = performance.now();
      for (let i = 0; i < keyLoops; i++) sceneStaticContentKey(w, h, d);
      const keyUs = (performance.now() - k0) * 1000 / keyLoops;

      /* z 序成本拆解：冷（置脏后重排）vs 热（命中缓存），解释整层重建里的排序占比 */
      const cold = [], warm = [];
      for (let i = 0; i < 10; i++) {
        bumpZVersion();
        const t0 = performance.now();
        hitOrderObjects();
        cold.push(performance.now() - t0);
      }
      for (let i = 0; i < 100; i++) {
        const t0 = performance.now();
        hitOrderObjects();
        warm.push((performance.now() - t0) * 1000);
      }
      return {
        ms, sortCalls, keyUs, cold: cold.map(v => v * 1000), warm,
        objects: state.objects.length
      };
    });

    /* 参照版不可见（不透明度 0）+ 闪烁开启：1.5s 内不应触发任何整层重建 */
    const blink = await page.evaluate(async () => {
      revLoad(persistableState(), 'perf-ref');
      rOp = 0;
      revBlinkSet(true);
      const orig = window.invalidateStatic;
      let n = 0;
      window.invalidateStatic = function () { n++; return orig.apply(this, arguments); };
      await new Promise(r => setTimeout(r, 1500));
      window.invalidateStatic = orig;
      const ref = { on: rBl.on, opacity: rOp, timer: !!rBl.timer };
      revBlinkSet(false);
      revClear();
      rOp = .45;
      return { invalidates: n, ref };
    });

    const msStat = stat(data.ms);
    record('staticRebuild', { ms: msStat });
    record('zSortPerRebuild', { calls: round(data.sortCalls, 3) });
    record('zOrderCold', { us: stat(data.cold) });
    record('zOrderWarm', { us: stat(data.warm) });
    record('contentKeyCost', { usPerCall: round(data.keyUs, 3) });
    record('refBlinkHidden', { invalidates: blink.invalidates, ref: blink.ref });
    console.log('[f2-render] ' + JSON.stringify({
      rebuild: msStat, sortCallsPerRebuild: round(data.sortCalls, 3),
      zOrderColdUs: stat(data.cold).p50, zOrderWarmUs: stat(data.warm).p50,
      keyUsPerCall: round(data.keyUs, 3), blinkInvalidates: blink.invalidates
    }));

    if (!NO_GATE) {
      const fails = [];
      if (msStat.p95 > GATES.rebuildP95) fails.push(`整层重建：P95 ${msStat.p95}ms > 阈值 ${GATES.rebuildP95}ms`);
      if (round(data.sortCalls, 3) > GATES.sortCalls) fails.push(`每次重建的大数组排序：${round(data.sortCalls, 3)} 次 > 阈值 ${GATES.sortCalls}`);
      if (blink.invalidates > GATES.blinkInvalidates) fails.push(`参照层不可见时闪烁空转：1.5s 内 ${blink.invalidates} 次 > 阈值 ${GATES.blinkInvalidates}`);
      if (data.objects !== SIZE) fails.push(`夹具对象数：${data.objects} ≠ ${SIZE}`);
      if (fails.length) console.error('[f2-render] 门禁失败，主机快照：' + hostSnapshot());
      expect(fails, 'F2 静态层重建门禁').toEqual([]);
    }
  });
});
