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

  test('CORE-P2-3 历史快照活动楼层别名归一化的堆占用', async ({ page }) => {
    test.setTimeout(240000);
    await openApp(page);
    const cdp = await page.context().newCDPSession(page);
    const gcUsed = heapProbe(cdp);
    const CFG = { scale: 10000, steps: 20 };

    /* ---- 当前实现：快照内 objects 与 floors[active].objects 必须指向同一数组（别名归一化） ---- */
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
        if (flo) { dual++; if (f.objects !== top) distinct++; instances += top.length + (f.objects === top ? 0 : f.objects.length); }
        else instances += top.length;
      });
      return { snapshots: history.past.length, dual, distinct, instances };
    });

    /* ---- 对照布局：快照前临时移除活动楼层别名（等价旧行为的内存上限，仅测试内构造） ---- */
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
        if (f && Array.isArray(f.objects)) { dual++; instances += top.length; }
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
    /* 归一化判据：两条路径共用同一数组，每条快照只保留一份对象实例 */
    expect(data.current.dualPathSnapshots, '每条快照都保留活动楼层别名键').toBe(20);
    expect(data.current.distinctArrays, '活动楼层别名必须与顶层 objects 同数组').toBe(0);
    expect(data.current.objectInstances, '20 条快照只保留 20×10k 个对象实例').toBe(200000);
    /* 内存与耗时不得高于“去掉别名”的对照布局（允许 15% 抖动，不是阈值放宽） */
    expect(curDelta, '堆增量不得高于对照布局 15%').toBeLessThan(ctlDelta * 1.15);
    expect(curMs, '20 次 pushHistory 不得高于对照布局 50%').toBeLessThan(ctlMs * 1.5);
  });

  test('CORE-P2-4 快照列表/淘汰的 IDB 读取次数与耗时', async ({ page }) => {
    test.setTimeout(240000);
    await openApp(page);
    const CFG = { objCount: 10000, snapshots: 20, bytes: 1000 };
    const pid = 'PERF_P2_4_' + Date.now();

    await page.evaluate(async cfg => {
      const objs = [];
      for (let i = 0; i < cfg.objCount; i++) {
        objs.push(baseObject('point', 'point.marker', { id: 'S' + i, name: 'S' + i, x: i % 1000, y: Math.floor(i / 1000) }));
      }
      const data = { schema: 1, floors: [{ id: 'f', name: '1F', objects: objs }] };
      const metas = [];
      for (let i = 0; i < cfg.snapshots; i++) {
        const sid = 'SNAP' + i;
        const meta = {
          snapshotId: sid, projectId: cfg.pid, projectName: 'perf', createdAt: new Date(2026, 0, 1, 0, i).toISOString(),
          label: 'auto', floorId: 'f', floorName: '1F', objectCount: objs.length, bytes: cfg.bytes, schema: 1
        };
        metas.push(meta);
        await idbPutKey(snapshotKey(cfg.pid, sid), { meta, data });
      }
      await snapshotIndexSave(cfg.pid, metas);
    }, { ...CFG, pid });

    /* 只统计 idbGetKey：列表/淘汰若走元数据索引应各 1 次；全量读为 1 次键扫描 + N 条记录 */
    await page.evaluate(() => {
      window.__idbReads = 0;
      const orig = idbGetKey;
      window.idbGetKey = async function (key) { window.__idbReads++; return orig(key); };
    });

    const list = await page.evaluate(async pid => {
      const time = async (fn, n) => {
        const arr = [], reads = [];
        for (let i = 0; i < n; i++) {
          window.__idbReads = 0;
          const t0 = performance.now();
          await fn();
          arr.push(performance.now() - t0);
          reads.push(window.__idbReads);
        }
        return { ms: arr, reads };
      };
      const listRun = await time(() => listSnapshots(pid), 10);
      const pruneRun = await time(() => pruneSnapshots(pid), 10);
      const fullRun = await time(() => snapshotRecords(pid), 3);
      return {
        list: listRun, prune: pruneRun, full: fullRun,
        listLen: (await listSnapshots(pid)).length,
        fullLen: (await snapshotRecords(pid)).length
      };
    }, pid);

    const cleanup = await page.evaluate(async pid => {
      const keys = (await idbAllKeys()).filter(k => k.startsWith(snapshotProjectPrefix(pid)));
      for (const k of keys) await idbDeleteKey(k);
      await idbDeleteKey(snapshotIndexKey(pid));
      return keys.length;
    }, pid);

    const data = {
      case: 'CORE-P2-4 快照列表/淘汰读取',
      fixture: CFG,
      list: { ...stat(list.list.ms), readsPerCall: list.list.reads },
      prune: { ...stat(list.prune.ms), readsPerCall: list.prune.reads },
      full: { ...stat(list.full.ms), readsPerCall: list.full.reads },
      listLen: list.listLen, fullLen: list.fullLen, cleanedKeys: cleanup
    };
    record(data);
    expect(data.listLen, '快照列表条数').toBe(20);
    expect(data.fullLen, '全量读条数').toBe(20);
    expect(data.cleanedKeys, '清理快照键数').toBe(20);
    expect(Math.max(...data.list.readsPerCall), '列表每次 IDB get 次数（只读索引）').toBeLessThanOrEqual(2);
    expect(Math.max(...data.prune.readsPerCall), '淘汰每次 IDB get 次数（只读索引）').toBeLessThanOrEqual(2);
    expect(Math.min(...data.full.readsPerCall), '全量读每次 IDB get 次数（逐条读 data）').toBeGreaterThanOrEqual(20);
  });

  test('IO-P2-11 导出字段「长度/面积」逐行重复计算', async ({ page }) => {
    test.setTimeout(240000);
    await openApp(page);
    await page.evaluate(installScene, 10000);
    const CFG = { rows: 10000, reps: 3 };

    /* ---- 当前实现：直接按字段表构建全部行（无探针） ---- */
    const base = await page.evaluate(cfg => {
      const time = () => {
        const t0 = performance.now();
        let n = 0;
        for (const o of state.objects) { buildExportRow(o, '1F'); n++; }
        return { ms: performance.now() - t0, rows: n };
      };
      time();
      const samples = [];
      for (let i = 0; i < cfg.reps; i++) samples.push(time());
      return { samples: samples.map(x => x.ms), rows: samples[0].rows };
    }, CFG);

    /* ---- 探针：包装 objectLength / objectArea 统计每行调用次数与总耗时 ---- */
    const probe = await page.evaluate(cfg => {
      const origLen = objectLength, origArea = objectArea;
      let lenCalls = 0, areaCalls = 0;
      window.objectLength = function (o) { lenCalls++; return origLen(o); };
      window.objectArea = function (o) { areaCalls++; return origArea(o); };
      const t0 = performance.now();
      let rows = 0;
      for (const o of state.objects) { buildExportRow(o, '1F'); rows++; }
      const buildMs = performance.now() - t0;
      window.objectLength = origLen;
      window.objectArea = origArea;

      /* 同一批量下单独计时：实际调用次数 vs 每对象一次（理论去重后的一半） */
      const measure = (fn, n) => {
        const t = performance.now();
        for (let i = 0; i < n; i++) fn(state.objects[i % state.objects.length]);
        return performance.now() - t;
      };
      const len2 = measure(origLen, cfg.rows * 2), len1 = measure(origLen, cfg.rows);
      const area2 = measure(origArea, cfg.rows * 2), area1 = measure(origArea, cfg.rows);
      return {
        rows, buildMs, lenCalls, areaCalls,
        lenMs: { twice: len2, once: len1 }, areaMs: { twice: area2, once: area1 }
      };
    }, CFG);

    const data = {
      case: 'IO-P2-11 导出字段长度/面积重复计算',
      fixture: CFG,
      baseline: { total: stat(base.samples), rows: base.rows, msPerRow: round(pct(base.samples, 0.5) / base.rows * 1000, 2) },
      probe: {
        rows: probe.rows, buildMs: round(probe.buildMs),
        lenCalls: probe.lenCalls, areaCalls: probe.areaCalls,
        lenCallsPerRow: round(probe.lenCalls / probe.rows, 2),
        areaCallsPerRow: round(probe.areaCalls / probe.rows, 2),
        lenMsTwice: round(probe.lenMs.twice), lenMsOnce: round(probe.lenMs.once),
        areaMsTwice: round(probe.areaMs.twice), areaMsOnce: round(probe.areaMs.once)
      },
      reclaimableMs: round(probe.lenMs.once + probe.areaMs.once)
    };
    record(data);
    expect(data.baseline.rows, '构建行数').toBe(10000);
    expect(data.probe.rows, '探针构建行数').toBe(10000);
    /* 打点目标：证明非零长度/面积的对象每行被计算两次（字段表 41/42 行的 `x?fmt(x):''` 短路）
       installScene 10k = 3334 point + 3333 rect + 3333 line；line 长度非零、rect 面积非零，
       故 objectLength / objectArea 各被调用 3333×2 + 6667×1 = 13333 次。 */
    expect(data.probe.lenCalls, 'objectLength 调用次数').toBe(13333);
    expect(data.probe.areaCalls, 'objectArea 调用次数').toBe(13333);
    expect(data.baseline.total.p50, '10k 行构建耗时必须可测').toBeGreaterThan(0);
  });
});

test.afterAll(save);
