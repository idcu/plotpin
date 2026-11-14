/* f1-save.perf.mjs —— F1 保存路径（persistableState）性能夹具
 *
 * 只采集真实 Chromium 数据，用于 F1「保存路径减拷贝」改动前后的同夹具对照：
 *   node scripts/perf-browser.mjs --no-gate tests/perf/f1-save.perf.mjs   # 采数
 *   node scripts/perf-browser.mjs tests/perf/f1-save.perf.mjs             # 带门禁
 * 数据写入 test-results/perf-f1-save.json。
 *
 * 环境：1920x1080 CSS 视口 @DPR1，Chromium headless（本机 SwiftShader）。
 * 堆峰值用页面内 performance.memory.usedJSHeapSize（每次保存后立即取，不强制 GC），
 * 另用 CDP 强制 GC 后取一次基线，报告两者差值。
 * 口径限制：这里测的是自动保存的同步段（persistableState + JSON.stringify），
 * 不含 IndexedDB 事务等待；IDB 写入耗时不属于 F1 的改动面。
 */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installScene, hostSnapshot } from './fixture.mjs';

const OUT_DIR = join(process.cwd(), 'test-results');
const REPORT_FILE = join(OUT_DIR, 'perf-f1-save.json');
const SIZE = 10000;
const NO_GATE = process.env.PERF_NO_GATE === '1';

/* 门禁阈值：2026-11-14 改动后同夹具实测（三次）P95 中位数 64.3ms / 97.2ms / 分配 6.3MB，
 * 留约 1.3 倍余量；旧实现的 89.6ms / 27.7MB 均会被拦下。明细见 backup/F1/CHANGES.md。 */
const GATES = {
  cloneP95: 85,
  totalP95: 120,
  allocMB: 9
};

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
const results = [];
function record(name, data) { results.push(Object.assign({ case: name, objects: SIZE }, data)); }
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
  console.log('\n[f1-save] 报告已写入 ' + REPORT_FILE);
}
async function openApp(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state === 'object');
  if (await page.locator('#modalBackdrop').evaluate(el => el.classList.contains('show'))) {
    await page.click('#modalFooter button');
    await page.waitForFunction(() => !document.getElementById('modalBackdrop').classList.contains('show'));
  }
}

test.describe('F1 · 保存路径同步段（10k 对象）', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  test.afterAll(() => save());

  test('persistableState 耗时与堆峰值', async ({ page }) => {
    test.setTimeout(180000);
    await openApp(page);
    const cdp = await page.context().newCDPSession(page);
    await page.evaluate(installScene, SIZE);
    await page.evaluate(() => { syncActiveFloor(); });

    const before = await (async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      await new Promise(r => setTimeout(r, 60));
      await cdp.send('HeapProfiler.collectGarbage');
      return (await cdp.send('Runtime.getHeapUsage')).usedSize;
    })();

    const data = await page.evaluate(async () => {
      const clone = [], total = [];
      /* 预热：JIT 与首轮分配不计入样本 */
      for (let i = 0; i < 3; i++) { JSON.stringify(persistableState()); }
      for (let i = 0; i < 30; i++) {
        const t0 = performance.now();
        persistableState();
        clone.push(performance.now() - t0);
      }
      for (let i = 0; i < 10; i++) {
        const t0 = performance.now();
        JSON.stringify(persistableState());
        total.push(performance.now() - t0);
      }
      const jsonBytes = JSON.stringify(persistableState()).length;
      return { clone, total, jsonBytes, objects: state.objects.length, floors: (state.floors || []).length };
    });

    /* 单次保存的分配量：V8 采样堆分析（includeObjectsCollected*），统计一次 persistableState
       期间的总分配字节，比 usedSize 差值更稳定，且不受 GC 时机影响。 */
    const alloc = [];
    await cdp.send('HeapProfiler.enable');
    for (let i = 0; i < 5; i++) {
      await cdp.send('HeapProfiler.collectGarbage');
      await cdp.send('HeapProfiler.startSampling', {
        samplingInterval: 1024, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true
      });
      await page.evaluate(() => { persistableState(); });
      const { profile } = await cdp.send('HeapProfiler.stopSampling');
      let total = 0;
      const walk = n => { total += n.selfSize; (n.children || []).forEach(walk); };
      walk(profile.head);
      alloc.push(total / 1048576);
    }
    await cdp.send('HeapProfiler.disable');

    const cloneStat = stat(data.clone);
    const totalStat = stat(data.total);
    const allocStat = stat(alloc);
    record('persistableState', { ms: cloneStat, jsonBytes: data.jsonBytes, objects: data.objects, floors: data.floors });
    record('persistableState+stringify', { ms: totalStat });
    record('allocPerSave', { mb: allocStat });
    console.log('[f1-save] ' + JSON.stringify({
      clone: cloneStat, total: totalStat, jsonBytes: data.jsonBytes,
      allocMBPerSave: allocStat, heapBaseBytes: before
    }));

    if (!NO_GATE) {
      const fails = [];
      if (cloneStat.p95 > GATES.cloneP95) fails.push(`persistableState：P95 ${cloneStat.p95}ms > 阈值 ${GATES.cloneP95}ms`);
      if (totalStat.p95 > GATES.totalP95) fails.push(`persistableState+stringify：P95 ${totalStat.p95}ms > 阈值 ${GATES.totalP95}ms`);
      if (allocStat.p95 > GATES.allocMB) fails.push(`单次保存分配量：P95 ${allocStat.p95}MB > 阈值 ${GATES.allocMB}MB`);
      if (data.objects !== SIZE) fails.push(`夹具对象数：${data.objects} ≠ ${SIZE}`);
      if (fails.length) console.error('[f1-save] 门禁失败，主机快照：' + hostSnapshot());
      expect(fails, 'F1 保存路径性能门禁').toEqual([]);
    }
  });
});
