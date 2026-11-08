/* p2-perf.perf.mjs —— P2 批次 11 性能打点（CORE-P2-3 / CORE-P2-4 / IO-P2-11）
 *
 * 只采集真实 Chromium 数据，不修改业务代码；每条用例先测「当前实现」，
 * 再用同一 harness 跑「对照实现」（仅测试内临时构造，不进入生产代码），
 * 用于量化差距。数据写入 test-results/perf-p2.json。
 *
 * 环境：1920x1080 CSS 视口 @DPR1，Chromium headless（本机 SwiftShader），
 * 堆读数经 CDP HeapProfiler.collectGarbage 强制 GC 两次后在 Runtime.getHeapUsage 取 usedSize。
 *
 * 运行：node scripts/perf-browser.mjs tests/perf/p2-perf.perf.mjs
 *   或   node scripts/perf-browser.mjs --no-gate tests/perf/p2-perf.perf.mjs（只采数）
 */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installScene } from './fixture.mjs';

const OUT_DIR = join(process.cwd(), 'test-results');
const REPORT_FILE = join(OUT_DIR, 'perf-p2.json');
const NO_GATE = process.env.PERF_NO_GATE === '1';

const results = [];

function round(v, n = 2) { return v === null || v === undefined ? null : Number(v.toFixed(n)); }
function pct(arr, p) {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * p))];
}
function stat(arr) {
  return {
    n: arr.length,
    p50: round(pct(arr, 0.5)),
    p95: round(pct(arr, 0.95)),
    max: round(arr.length ? Math.max(...arr) : null),
    avg: round(arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null)
  };
}
function record(data) {
  results.push(data);
  console.log('\n[p2] ' + data.case);
  console.log('  ' + JSON.stringify(data));
}
function save() {
  if (!results.length) return;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT_FILE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    node: process.version,
    env: { viewport: '1920x1080', dpr: 1, headless: true, forcedGC: 'CDP HeapProfiler.collectGarbage ×2' },
    gateEnabled: !NO_GATE,
    cases: results
  }, null, 2), 'utf8');
  console.log('\n[p2] 报告已写入 ' + REPORT_FILE + '（' + results.length + ' 组用例）');
}

async function openApp(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
  if (await page.locator('#modalBackdrop').evaluate(el => el.classList.contains('show'))) {
    await page.click('#modalFooter button');
    await expect(page.locator('#modalBackdrop')).not.toHaveClass(/show/);
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

test.describe('P2 批次 11 · 真实 Chromium 性能打点', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

  test('CORE-P2-3 历史快照活动楼层别名复制的堆占用', async ({ page }) => {
    test.setTimeout(240000);
    await openApp(page);
    const cdp = await page.context().newCDPSession(page);
    const gcUsed = heapProbe(cdp);
    const CFG = { scale: 10000, steps: 20 };

    /* ---- 当前实现：state.objects 与 floors[active].objects 指向同一数组，快照按两条路径各复制一次 ---- */
    await page.evaluate(installScene, CFG.scale);
    await page.evaluate(() => { syncActiveFloor(); history = { past: [], future: [] }; });
    const curBase = await gcUsed();
    const curMs = await page.evaluate(cfg => {
      const t0 = performance.now();
      for (let s = 0; s < cfg.steps; s++) { state.objects[s].x += 1; pushHistory(); }
      return performance.now() - t0;
    }, CFG);
    const curHeap = await gcUsed();
    const curProbe = await page.evaluate(() => {
      const active = state.activeFloorId;
      let dual = 0, distinct = 0, instances = 0;
      history.past.forEach(snap => {
        const top = snap.objects;
        const f = (snap.floors || []).find(x => x.id === active);
        const flo = f && Array.isArray(f.objects);
        if (flo) { dual++; if (f.objects !== top) distinct++; instances += top.length + f.objects.length; }
        else instances += top.length;
      });
      return { snapshots: history.past.length, dual, distinct, instances };
    });

    /* ---- 对照实现：快照前临时移除活动楼层别名（仅测试内构造，生产代码未改） ---- */
    await page.evaluate(installScene, CFG.scale);
    await page.evaluate(() => { syncActiveFloor(); history = { past: [], future: [] }; });
    const ctlBase = await gcUsed();
    const ctlMs = await page.evaluate(cfg => {
      const t0 = performance.now();
      const f = state.floors.find(x => x.id === state.activeFloorId);
      for (let s = 0; s < cfg.steps; s++) {
        state.objects[s].x += 1;
        const keep = f.objects;
        delete f.objects;
        pushHistory();
        f.objects = keep;
      }
      return performance.now() - t0;
    }, CFG);
    const ctlHeap = await gcUsed();
    const ctlProbe = await page.evaluate(() => {
      const active = state.activeFloorId;
      let dual = 0, instances = 0;
      history.past.forEach(snap => {
        const top = snap.objects;
        const f = (snap.floors || []).find(x => x.id === active);
        if (f && Array.isArray(f.objects)) { dual++; instances += top.length + f.objects.length; }
        else instances += top.length;
      });
      return { snapshots: history.past.length, dual, instances };
    });

    const curDelta = curHeap - curBase, ctlDelta = ctlHeap - ctlBase;
    const data = {
      case: 'CORE-P2-3 历史快照活动楼层别名',
      fixture: CFG,
      current: {
        heapDeltaB: curDelta, heapDeltaMB: round(curDelta / 1048576, 3),
        push20Ms: round(curMs), snapshots: curProbe.snapshots,
        dualPathSnapshots: curProbe.dual, distinctArrays: curProbe.distinct,
        objectInstances: curProbe.instances
      },
      control: {
        heapDeltaB: ctlDelta, heapDeltaMB: round(ctlDelta / 1048576, 3),
        push20Ms: round(ctlMs), snapshots: ctlProbe.snapshots,
        dualPathSnapshots: ctlProbe.dual, objectInstances: ctlProbe.instances
      },
      ratio: ctlDelta > 0 ? round(curDelta / ctlDelta) : null,
      perSnapshotKB: curProbe.snapshots ? round(curDelta / curProbe.snapshots / 1024) : null
    };
    record(data);
    expect(curProbe.snapshots, '历史上限 20 条').toBe(20);
    expect(ctlProbe.snapshots, '对照组历史上限 20 条').toBe(20);
    expect(data.current.heapDeltaB, '当前实现堆增量必须为正').toBeGreaterThan(0);
    expect(data.control.heapDeltaB, '对照组堆增量必须为正').toBeGreaterThan(0);
    /* 打点目标：确认两条路径确实各存一份对象（改造前缺陷可见），不是断言它“正确” */
    expect(data.current.dualPathSnapshots, '当前实现每条快照都含活动楼层别名').toBe(20);
    expect(data.current.distinctArrays, '两条路径是不同数组实例').toBe(20);
    expect(data.control.dualPathSnapshots, '对照组不复制第二份活动楼层对象').toBe(0);
  });
});

test.afterAll(save);
