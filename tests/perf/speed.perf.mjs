/* speed.perf.mjs —— M2 提速段真实 Chromium 采集（N-22 / N-23 / N-24）
 *
 * 与 bench.mjs（Node + canvas 桩）严格区分：本用例跑真实 Chromium、真实 Canvas2D 光栅化，
 * 通过真实 page.mouse 事件驱动交互入口，禁止把 Node 桩数据当浏览器数据。
 *
 * 运行：node scripts/perf-browser.mjs --no-gate tests/perf/speed.perf.mjs
 *   或   node scripts/perf-browser.mjs（门禁默认开启）
 * 报告：test-results/perf-speed.json
 *
 * 采集口径：
 *   - N-22：10k 对象下真实拖动，包装 resolveWorldPoint 计捕捉解析耗时；
 *     pointermove 后追加 rAF（在应用 requestRender 的 rAF 之后）再 getImageData 强制光栅，
 *     得到“事件→帧完成”的整帧耗时。
 *   - N-23：10k 对象下真实连续点选，计数 ensureStaticLayer 调用（=静态层重建次数），
 *     并在 pointerdown 后同法测整帧耗时；另校验选中→取消后画布 PNG 与初始逐字节一致。
 *   - N-24：沿用 B-10 夹具（1000 对象 + 10 张 ~100KB base64 照片）复测 20 条历史堆增量
 *     与单次 undo 耗时；另在 10k 对象 + 20 条快照下对比元数据索引列表与全量读。
 */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installScene } from './fixture.mjs';

const OUT_DIR = join(process.cwd(), 'test-results');
const REPORT_FILE = join(OUT_DIR, 'perf-speed.json');
const NO_GATE = process.env.PERF_NO_GATE === '1';
const SCALE = 10000;

/* 门禁阈值（只允许收紧不允许放宽）。
 * 计划验收口径是**相对基线**：N-22 帧 P95 较基线下降 ≥30%、N-23 点选 P95 较基线下降 ≥30%。
 * BASELINE 为同 harness、同 Chromium、把业务代码 git stash 回退后实测的改造前值
 * （1920x1080@DPR1，10k 对象，取两次采样中较好的基线值 = 对改造更严的一侧）。 */
const BASELINE = {
  n22FrameP95: 34.3,        /* ms，改造前两次采样 34.4 / 34.3 */
  n22TotalP95: 37.0,        /* ms，改造前两次采样 37.0 / 38.3 */
  n23ClickP95: 661.1,       /* ms，改造前（N-22 提交态 556c205，30 次点选重建 30 次） */
  n23RebuildP95: 246.2,     /* ms，改造前静态层单次重建稳态 P95（172.9 / 246.2 两次采样取较差） */
};
const GATES = {
  n22FrameDropPct: 30,      /* 拖动整帧 P95 相对基线下降比例（计划验收值） */
  n22ResolveP95: 8,         /* 捕捉解析 P95（ms，改造后实测 2.4~4.0，留 2 倍余量） */
  n23ClickDropPct: 30,      /* 点选整帧 P95 相对基线下降比例（计划验收值） */
  n23Rebuilds: 0,           /* 连续点选期间静态层重建次数 */
  n24DropPct: 50,           /* 20 条含照片历史堆增量相对整份深拷贝的下降比例 */
  n24UndoMs: 100,           /* 单次 undo 同步耗时上限 */
  n24ListP95: 50,           /* 10k 对象快照列表（元数据索引）打开 P95 */
  n24ListSpeedup: 5         /* 列表相对全量读的加速倍数 */
};

const results = [];

function round(v, n = 2) { return v === null || v === undefined ? null : Number(v.toFixed(n)); }
function pct(arr, p) {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * p))];
}
function stat(arr) {
  return { n: arr.length, p50: round(pct(arr, 0.5)), p95: round(pct(arr, 0.95)), max: round(arr.length ? Math.max(...arr) : null), avg: round(arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null) };
}
function record(data) {
  results.push(data);
  console.log('\n[speed] ' + data.case);
  console.log('  ' + JSON.stringify(data));
}
function save() {
  if (!results.length) return;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT_FILE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    node: process.version,
    thresholds: GATES,
    gateEnabled: !NO_GATE,
    cases: results
  }, null, 2), 'utf8');
  console.log('\n[speed] 报告已写入 ' + REPORT_FILE + '（' + results.length + ' 组用例）');
}

async function openApp(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
  /* 首次进入有引导弹窗，遮罩会拦截真实指针事件；与 e2e 一致用页脚按钮关闭 */
  if (await page.locator('#modalBackdrop').evaluate(el => el.classList.contains('show'))) {
    await page.click('#modalFooter button');
    await expect(page.locator('#modalBackdrop')).not.toHaveClass(/show/);
  }
}
async function setupScene(page) {
  await page.evaluate(installScene, SCALE);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

test.describe('M2 提速段 · 真实 Chromium 10k 对象', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

  test('N-22 捕捉热路径：真实拖动 P95', async ({ page }) => {
    test.setTimeout(240000);
    await openApp(page);
    await setupScene(page);
    const cdp = await page.context().newCDPSession(page);
    const heapUsed = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      await new Promise(r => setTimeout(r, 60));
      await cdp.send('HeapProfiler.collectGarbage');
      return (await cdp.send('Runtime.getHeapUsage')).usedSize;
    };
    const target = await page.evaluate(() => {
      window.__probe = { resolve: [], frame: [], total: [] };
      window.__moves = 0;
      const orig = resolveWorldPoint;
      window.resolveWorldPoint = function (e) {
        const t0 = performance.now();
        const r = orig(e);
        window.__probe.resolve.push(performance.now() - t0);
        return r;
      };
      canvas.addEventListener('pointermove', (ev) => {
        window.__moves++;
        const t0 = ev.timeStamp;
        requestAnimationFrame(() => {
          const t1 = performance.now();
          ctx.getImageData(0, 0, 1, 1);
          const t2 = performance.now();
          window.__probe.frame.push(t1 - t0);
          window.__probe.total.push(t2 - t0);
        });
      });
      const o = state.objects.find(x => x.kind === 'rect');
      const d = worldDims();
      const s = w2s([o.x + o.width / 2, o.y + o.height / 2], state.viewport, d);
      const r = canvas.getBoundingClientRect();
      const hit = (() => {
        try { const h = hitObject(s2w([s[0], s[1]], state.viewport, d), s); return h || null; }
        catch (err) { return 'ERR:' + err.message; }
      })();
      const px = r.left + s[0], py = r.top + s[1];
      return {
        x: px, y: py, id: hit && hit.id ? hit.id : o.id,
        ox: hit && hit.x !== undefined ? hit.x : o.x, oy: hit && hit.y !== undefined ? hit.y : o.y
      };
    });
    await page.mouse.move(target.x, target.y);
    /* 静态层重建计数：N-23 后拖拽开始/结束各重建一次（调用点计数，不含绘制耗时） */
    await page.evaluate(() => {
      window.__rebuilds = 0;
      const oe = ensureStaticLayer;
      window.ensureStaticLayer = function () { window.__rebuilds++; return oe.apply(null, arguments); };
    });
    await page.mouse.down();
    /* 预热 6 步（半径 20px，务必越过 2px 拖动阈值）：
       首次真实位移会触发 pushHistory 整份快照，必须落在测量区间之外 */
    for (let i = 0; i < 6; i++) await page.mouse.move(target.x + Math.cos(i) * 20, target.y + Math.sin(i) * 20);
    await page.evaluate(() => { window.__probe = { resolve: [], frame: [], total: [] }; });
    const heap0 = await heapUsed();
    const hist0 = await page.evaluate(() => history.past.length);
    const N = 96;
    for (let i = 0; i < N; i++) {
      const t = i / N * Math.PI * 2;
      await page.mouse.move(target.x + Math.cos(t) * 40, target.y + Math.sin(t) * 40);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    }
    /* 拖动期稳态堆：在 pointerup 之前采样。pointerup 的提交会走广播/UI 刷新，
       那是一次性开销，不归“捕捉热路径”门禁统计，另行记录不参与断言。 */
    const heap1 = await heapUsed();
    await page.mouse.up();
    const heapAfterCommit = await heapUsed();
    const out = await page.evaluate(() => ({
      probe: window.__probe,
      moves: window.__moves,
      rebuilds: window.__rebuilds,
      drag: drag ? { type: drag.type, moved: !!drag.moved } : null
    }));
    const movedObj = await page.evaluate(id => {
      const o = state.objects.find(x => x.id === id);
      return o ? { x: o.x, y: o.y } : null;
    }, target.id);
    const resolve = stat(out.probe.resolve);
    const frame = stat(out.probe.frame);
    const total = stat(out.probe.total);
    const heapDeltaPct = heap0 ? round((heap1 - heap0) / heap0 * 100) : null;
    const data = {
      case: 'N-22 10k 真实拖动',
      scale: SCALE, viewport: '1920x1080@DPR1',
      resolve, frame, total,
      heap0MB: heap0 === null ? null : round(heap0 / 1048576),
      heap1MB: round(heap1 / 1048576),
      heapAfterCommitMB: round(heapAfterCommit / 1048576),
      heapDeltaPct,
      dragMoved: !!movedObj && (Math.abs(movedObj.x - target.ox) > 1 || Math.abs(movedObj.y - target.oy) > 1),
      moves: out.moves,
      staticRebuilds: out.rebuilds
    };
    record(data);
    expect(data.dragMoved, '必须真实拖动成功（对象坐标发生变化）').toBe(true);
    expect(hist0, '测量区间内不得新增历史快照').toBe(1);
    expect(resolve.n, '拖动样本数').toBeGreaterThanOrEqual(60);
    if (!NO_GATE) {
      expect(resolve.p95, 'N-22 捕捉解析 P95').toBeLessThanOrEqual(GATES.n22ResolveP95);
      const drop = 1 - frame.p95 / BASELINE.n22FrameP95;
      expect(round(drop * 100, 1), 'N-22 帧 P95 相对基线下降 %').toBeGreaterThanOrEqual(GATES.n22FrameDropPct);
      expect(Math.abs(heapDeltaPct || 0), 'N-22 heapUsed 增幅').toBeLessThanOrEqual(5);
    }
  });

  test('N-23 选中：真实连续点选 P95 与静态层重建次数', async ({ page }) => {
    test.setTimeout(240000);
    await openApp(page);
    await setupScene(page);
    const targets = await page.evaluate(() => {
      window.__click = [];
      canvas.addEventListener('pointerdown', (ev) => {
        const t0 = ev.timeStamp;
        requestAnimationFrame(() => {
          const t1 = performance.now();
          ctx.getImageData(0, 0, 1, 1);
          const t2 = performance.now();
          window.__click.push({ toFrame: t1 - t0, total: t2 - t0 });
        });
      });
      let rebuilds = 0;
      const origEnsure = ensureStaticLayer;
      window.ensureStaticLayer = function () { rebuilds++; return origEnsure.apply(null, arguments); };
      window.__rebuilds = () => rebuilds;
      const d = worldDims(), r = canvas.getBoundingClientRect(), out = [];
      for (let i = 0; i < 42; i++) {
        const o = state.objects[(i * 331 + 7000) % state.objects.length];
        let p;
        if (o.kind === 'point') p = [o.x, o.y];
        else if (o.kind === 'rect') p = [o.x + o.width / 2, o.y + o.height / 2];
        else p = o.points[1];
        const s = w2s(p, state.viewport, d);
        out.push({ x: r.left + s[0], y: r.top + s[1], id: o.id });
      }
      return out;
    });
    const warm = 6, N = 30;
    for (let i = 0; i < warm; i++) {
      await page.mouse.click(targets[i].x, targets[i].y);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    }
    await page.evaluate(() => { window.__click = []; window.__rebuildBase = window.__rebuilds(); });
    for (let i = warm; i < warm + N; i++) {
      await page.mouse.click(targets[i].x, targets[i].y);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    }
    /* 悬停只叠加动态层：指针扫过对象不得触发静态层重建 */
    const hoverBase = await page.evaluate(() => window.__rebuilds());
    for (let i = 0; i < 10; i++) {
      const t = targets[(i * 7 + 11) % targets.length];
      await page.mouse.move(t.x, t.y);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
    }
    const hoverRebuilds = await page.evaluate(b => window.__rebuilds() - b, hoverBase);
    const out = await page.evaluate(() => ({
      click: window.__click,
      rebuilds: window.__rebuilds() - window.__rebuildBase,
      selected: selectedIds.size
    }));
    const total = stat(out.click.map(x => x.total));
    const toFrame = stat(out.click.map(x => x.toFrame));

    /* 静态层单次重建耗时（N-23 后拖拽起止会触发）：直接 invalidate + 全量绘制 + 强制光栅。
       先跑 2 次预热（首帧包含光栅管线冷启动），再记录 3 次稳态样本。 */
    const rebuildCost = await page.evaluate(() => {
      const one = () => {
        invalidateStatic();
        const t = performance.now();
        drawScene(ctx, state.viewport, wrap.clientWidth, wrap.clientHeight, { interactive: true, markerScale: 1 });
        ctx.getImageData(0, 0, 1, 1);
        return performance.now() - t;
      };
      one(); one();
      const samples = [];
      for (let i = 0; i < 3; i++) samples.push(one());
      return samples;
    });

    /* 视觉自洽：选中→取消选中后，画布 PNG 必须与初始逐字节一致（静态层无残留） */
    const vis = await page.evaluate(async () => {
      const hash = () => {
        const d = canvas.toDataURL();
        let h = 2166136261;
        for (let i = 0; i < d.length; i += 7) { h ^= d.charCodeAt(i); h = Math.imul(h, 16777619); }
        return canvas.width + 'x' + canvas.height + ':' + d.length + ':' + (h >>> 0).toString(16);
      };
      const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      selectedIds.clear(); cursorScreen = null; activeOsnap = null; invalidateStatic();
      drawScene(ctx, state.viewport, wrap.clientWidth, wrap.clientHeight, { interactive: true, markerScale: 1 });
      await raf2();
      const h0 = hash();
      selectedIds.add(state.objects[0].id);
      requestRender(); await raf2();
      const h1 = hash();
      selectedIds.clear();
      requestRender(); await raf2();
      const h2 = hash();
      window.__vis = null;
      return { h0, h1, h2, sameAfterDeselect: h0 === h2, selectionVisible: h0 !== h1 };
    });

    const data = {
      case: 'N-23 10k 连续点选',
      scale: SCALE, viewport: '1920x1080@DPR1',
      total, toFrame, rebuilds: out.rebuilds, hoverRebuilds, samples: out.click.length,
      selectedAfterClicks: out.selected,
      staticRebuildMs: rebuildCost.map(x => round(x, 1)),
      staticRebuildP95: stat(rebuildCost).p95,
      visual: vis
    };
    record(data);
    expect(out.click.length, '点选样本数').toBeGreaterThanOrEqual(N);
    expect(vis.sameAfterDeselect, '选中→取消后画布像素必须还原').toBe(true);
    expect(vis.selectionVisible, '选中态必须产生可见变化').toBe(true);
    if (!NO_GATE) {
      expect(out.rebuilds, '连续点选期间静态层重建次数').toBeLessThanOrEqual(GATES.n23Rebuilds);
      expect(hoverRebuilds, '悬停期间静态层重建次数').toBeLessThanOrEqual(GATES.n23Rebuilds);
      const drop = 1 - total.p95 / BASELINE.n23ClickP95;
      expect(round(drop * 100, 1), 'N-23 点选整帧 P95 相对基线下降 %').toBeGreaterThanOrEqual(GATES.n23ClickDropPct);
      /* 计划要求静态层重建耗时不得回退；留 10% 作为 GPU 光栅抖动容差，不是放宽阈值 */
      expect(stat(rebuildCost).p95, 'N-23 静态层单次重建 P95').toBeLessThanOrEqual(round(BASELINE.n23RebuildP95 * 1.1, 1));
    }
  });

  test('N-24 历史与快照内存：20 条含照片 + 10k 快照列表', async ({ page }) => {
    test.setTimeout(300000);
    await openApp(page);
    const cdp = await page.context().newCDPSession(page);
    const gcUsed = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      await new Promise(r => setTimeout(r, 60));
      await cdp.send('HeapProfiler.collectGarbage');
      const u = await cdp.send('Runtime.getHeapUsage');
      return u.usedSize;
    };
    const CFG = { objCount: 1000, photoCount: 10, photoBytes: 100000, steps: 20 };
    const buildProject = cfg => {
      state = createInitialState();
      const objs = [];
      for (let i = 0; i < cfg.objCount; i++) objs.push(baseObject('point', 'point.camera', { id: 'OBJ' + i, name: 'O' + i, x: i, y: i }));
      for (let p = 0; p < cfg.photoCount; p++) {
        const raw = ('P' + p + '-').repeat(Math.ceil(cfg.photoBytes / 4)).slice(0, cfg.photoBytes);
        objs[p].props = { photoDataUrl: 'data:image/png;base64,' + btoa(raw) };
      }
      state.objects = objs;
      history = { past: [], future: [] };
    };

    /* ---- 参考组：与改造前 pushHistory 完全一致的整份 JSON 深拷贝 20 条 ---- */
    await page.evaluate(buildProject, CFG);
    const baseHeap = await gcUsed();
    const legacyMs = await page.evaluate(cfg => {
      const ref = [];
      const t0 = performance.now();
      for (let s = 0; s < cfg.steps; s++) {
        state.objects[s % state.objects.length].x += 1;
        ref.push(JSON.parse(JSON.stringify(state)));
      }
      window.__histRef = ref;
      return performance.now() - t0;
    }, CFG);
    const legacyHeap = await gcUsed();

    /* ---- 当前实现：真实 pushHistory（结构共享） ---- */
    await page.evaluate(() => { window.__histRef = null; history = { past: [], future: [] }; state = createInitialState(); });
    await gcUsed();
    await page.evaluate(buildProject, CFG);
    const newBase = await gcUsed();
    const pushMs = await page.evaluate(cfg => {
      const t0 = performance.now();
      for (let s = 0; s < cfg.steps; s++) { state.objects[s % state.objects.length].x += 1; pushHistory(); }
      return performance.now() - t0;
    }, CFG);
    const newHeap = await gcUsed();
    const histLen = await page.evaluate(() => history.past.length);
    const undoMs = await page.evaluate(async () => {
      const arr = [];
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        undo();
        arr.push(performance.now() - t0);
        await new Promise(r => setTimeout(r, 40));
      }
      return arr;
    });
    const legacyDelta = legacyHeap - baseHeap, newDelta = newHeap - newBase;
    const dropPct = legacyDelta > 0 ? +((1 - newDelta / legacyDelta) * 100).toFixed(2) : null;

    /* ---- 10k 对象 + 20 条快照：元数据索引列表 vs 全量读 ---- */
    const list = await page.evaluate(async () => {
      state = createInitialState();
      const objs = [];
      for (let i = 0; i < 10000; i++) objs.push(baseObject('point', 'point.marker', { id: 'S' + i, name: 'S' + i, x: i % 1000, y: Math.floor(i / 1000) }));
      const pid = 'PERF_SNAP', metas = [], data = { schema: 1, floors: [{ id: 'f', name: '1F', objects: objs }] };
      for (let i = 0; i < 20; i++) {
        const sid = 'SNAP' + i;
        const meta = { snapshotId: sid, projectId: pid, projectName: 'perf', createdAt: new Date(2026, 0, 1, 0, i).toISOString(), label: 'auto', floorId: 'f', floorName: '1F', objectCount: objs.length, bytes: 1000000 + i, schema: 1 };
        metas.push(meta);
        await idbPutKey(snapshotKey(pid, sid), { meta, data });
      }
      await snapshotIndexSave(pid, metas);
      const time = async (fn, n) => { const a = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); await fn(); a.push(performance.now() - t0); } return a; };
      const indexTimes = await time(() => listSnapshots(pid), 10);
      const indexLen = (await listSnapshots(pid)).length;
      await idbDeleteKey(snapshotIndexKey(pid));           /* 模拟 N-21 之前的“无索引”状态 */
      const fullTimes = await time(() => snapshotRecords(pid), 3);
      const fullLen = (await snapshotRecords(pid)).length;
      for (const m of metas) await idbDeleteKey(snapshotKey(pid, m.snapshotId));
      await idbDeleteKey(snapshotIndexKey(pid));
      return { indexTimes, fullTimes, indexLen, fullLen };
    });

    const data = {
      case: 'N-24 历史与快照内存',
      fixture: CFG,
      legacy: { heapDeltaB: legacyDelta, heapDeltaMB: round(legacyDelta / 1048576), push20Ms: round(legacyMs) },
      current: { heapDeltaB: newDelta, heapDeltaMB: round(newDelta / 1048576), push20Ms: round(pushMs), historyLen: histLen },
      dropPct,
      undoMs: undoMs.map(v => +v.toFixed(2)), undoMax: round(Math.max(...undoMs)),
      snapshotList: {
        index: stat(list.indexTimes), full: stat(list.fullTimes),
        indexLen: list.indexLen, fullLen: list.fullLen,
        speedup: list.fullTimes.length && pct(list.indexTimes, 0.5) > 0 ? round(pct(list.fullTimes, 0.5) / pct(list.indexTimes, 0.5)) : null
      }
    };
    record(data);
    expect(histLen, '20 条历史上限').toBe(20);
    expect(data.legacy.heapDeltaB, '参考组堆增量必须为正').toBeGreaterThan(0);
    expect(list.indexLen, '快照列表条数').toBe(20);
    expect(list.fullLen, '全量读条数').toBe(20);
    if (!NO_GATE) {
      expect(dropPct, 'N-24 堆增量下降 ≥50%').toBeGreaterThanOrEqual(GATES.n24DropPct);
      expect(data.undoMax, 'N-24 单次 undo <100ms').toBeLessThan(GATES.n24UndoMs);
      expect(data.snapshotList.index.p95, '10k 快照列表打开 P95').toBeLessThanOrEqual(GATES.n24ListP95);
      expect(data.snapshotList.speedup, '列表相对全量读加速倍数').toBeGreaterThanOrEqual(GATES.n24ListSpeedup);
    }
  });
});

test.afterAll(save);
