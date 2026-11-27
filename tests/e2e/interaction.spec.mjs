import { clickTool } from './toolbar.mjs';
/* A-06 浏览器验证：单击对象不落盘/不清覆盖率、拖拽 Esc 回滚 */
import { test, expect } from '@playwright/test';
import { DB, idb } from './helpers.mjs';

async function openApp(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
}

async function drawPointAtCenter(page) {
  await clickTool(page, 'point');
  const box = await page.locator('#canvas').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.click(cx, cy);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);
  return { cx, cy };
}

async function waitSaved(page, pick, expected) {
  await expect.poll(async () => {
    const rec = await idb(page, { store: DB.projects, op: 'get', key: 'current' });
    return rec ? pick(rec) : null;
  }, { timeout: 7000 }).toEqual(expected);
}

test('单击选中对象：不落盘、不清覆盖率、不留空撤销快照', async ({ page }) => {  await openApp(page);
  const { cx, cy } = await drawPointAtCenter(page);
  await waitSaved(page, r => r.objects.length, 1);

  /* 记录落盘调用次数：单击期间不得新增 scheduleSave */
  await page.evaluate(() => {
    window.__saveCalls = 0;
    const real = scheduleSave;
    scheduleSave = function () { window.__saveCalls++; return real.apply(this, arguments); };
  });

  await clickTool(page, 'select');
  const before = await page.evaluate(() => {
    coverageResult = { regions: [], cameraCount: 0, ratio: 0 };
    return { updated: state.meta.updatedAt, hist: history.past.length };
  });

  await page.mouse.click(cx, cy);

  const after = await page.evaluate(() => ({
    selected: selectedIds.size,
    saves: window.__saveCalls,
    updated: state.meta.updatedAt,
    hist: history.past.length,
    coverage: coverageResult
  }));
  expect(after.selected).toBe(1);
  expect(after.saves).toBe(0);
  expect(after.updated).toBe(before.updated);
  expect(after.hist).toBe(before.hist);
  expect(after.coverage).not.toBeNull();
});

test('拖拽中 Esc：对象回到原位，撤销栈不留空快照', async ({ page }) => {
  await openApp(page);
  const { cx, cy } = await drawPointAtCenter(page);
  await clickTool(page, 'select');

  const before = await page.evaluate(() => {
    const o = state.objects[0];
    return { x: o.x, y: o.y, hist: history.past.length };
  });

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 40, { steps: 5 });
  const during = await page.evaluate(() => {
    const o = state.objects[0];
    return { x: o.x, y: o.y, hist: history.past.length };
  });
  expect(during.x).not.toBe(before.x);

  await page.keyboard.press('Escape');
  const after = await page.evaluate(() => {
    const o = state.objects[0];
    return { x: o.x, y: o.y, hist: history.past.length, dragging: drag === null };
  });
  expect(after.x).toBe(before.x);
  expect(after.y).toBe(before.y);
  expect(after.hist).toBe(before.hist);
  expect(after.dragging).toBe(true);

  await page.mouse.up();
  const settled = await page.evaluate(() => {
    const o = state.objects[0];
    return { x: o.x, y: o.y, hist: history.past.length };
  });
  expect(settled).toEqual({ x: before.x, y: before.y, hist: before.hist });
});

test('B7：删除对象后活动楼层条目立即与现场同一数组', async ({ page }) => {
  await openApp(page);
  const { cx, cy } = await drawPointAtCenter(page);
  await clickTool(page, 'select');
  await page.mouse.click(cx, cy);
  await expect.poll(() => page.evaluate(() => selectedIds.size)).toBe(1);

  await page.keyboard.press('Delete');
  await expect(page.locator('#modalBackdrop')).toHaveClass(/show/);
  await page.locator('#modalFooter button.primary').click();
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(0);

  const r = await page.evaluate(() => {
    const f = state.floors.find(x => x.id === state.activeFloorId);
    return { same: !!f && f.objects === state.objects, count: f ? f.objects.length : -1 };
  });
  expect(r).toEqual({ same: true, count: 0 });
});

test('线段工具：两点落笔自动完成，生成 2 点开放折线，第三点另起一段', async ({ page }) => {
  await openApp(page);
  await clickTool(page, 'line');
  await page.selectOption('#lineMode', 'segment');
  const box = await page.locator('#canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.click(cx - 100, cy);
  await page.mouse.move(cx + 100, cy - 50, { steps: 4 });
  await page.mouse.click(cx + 100, cy - 50);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);
  const seg = await page.evaluate(() => ({
    kind: state.objects[0].kind,
    points: state.objects[0].points.length,
    closed: !!state.objects[0].closed,
    tool: currentTool,
    draft: draft
  }));
  expect(seg).toEqual({ kind: 'line', points: 2, closed: false, tool: 'line', draft: null });
  /* 完成后第三点不会追加到上一段：先起新草稿，第二次落点才产生第二条 */
  await page.mouse.click(cx + 150, cy - 80);
  expect(await page.evaluate(() => ({ n: state.objects.length, draftPoints: draft && draft.points.length }))).toEqual({ n: 1, draftPoints: 1 });

  /* 箭头模式：两点自动完成，style.arrow 经对象清洗后仍保留 */
  await clickTool(page, 'line');
  await page.selectOption('#lineMode', 'arrow');
  await page.mouse.click(cx - 150, cy + 80);
  await page.mouse.click(cx - 60, cy + 80);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(2);
  const arrow = await page.evaluate(() => {
    const o = state.objects[1];
    const clean = sanitizeObjects([JSON.parse(JSON.stringify(o))], state.layers, state.objectTypes, new Set(), new Set(), null)[0];
    return { kind: o.kind, points: o.points.length, closed: !!o.closed, arrow: o.style.arrow, kept: clean && clean.style.arrow, draft: draft };
  });
  expect(arrow).toEqual({ kind: 'line', points: 2, closed: false, arrow: 1, kept: 1, draft: null });
});

test('仅描边区域、修订云线、引线标注：落笔即生效且清洗后保留', async ({ page }) => {
  await openApp(page);
  const box = await page.locator('#canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

  /* 区域「仅描边」：落笔 fillAlpha=0（仍可选中与导出） */
  await clickTool(page, 'rect');
  await page.locator('#areaNoFill').check();
  await page.mouse.click(cx - 130, cy - 90);
  await page.mouse.click(cx - 50, cy - 30);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);
  expect(await page.evaluate(() => ({ kind: state.objects[0].kind, fill: state.objects[0].style.fillAlpha })))
    .toEqual({ kind: 'rect', fill: 0 });
  await page.locator('#areaNoFill').uncheck();

  /* 修订云线：折线 + style.cloud；扇贝点串多于原顶点，清洗后标记保留 */
  const box2 = await page.locator('#canvas').boundingBox();
  const cx2 = box2.x + box2.width / 2, cy2 = box2.y + box2.height / 2;
  await clickTool(page, 'line');
  await page.locator('#lineCloud').check();
  await page.locator('#lineClosed').check();
  await page.mouse.click(cx2 + 30, cy2 - 70);
  await page.mouse.click(cx2 + 150, cy2 - 70);
  await page.mouse.dblclick(cx2 + 150, cy2 + 20);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(2);
  const cloud = await page.evaluate(() => {
    const o = state.objects[1];
    const clean = sanitizeObjects([JSON.parse(JSON.stringify(o))], state.layers, state.objectTypes, new Set(), new Set(), null)[0];
    return { kind: o.kind, closed: !!o.closed, cloud: o.style.cloud, kept: clean && clean.style.cloud, pts: cloudPoints(o.points, o.closed).length };
  });
  expect(cloud).toEqual({ kind: 'line', closed: true, cloud: 1, kept: 1, pts: cloud.pts });
  expect(cloud.pts).toBeGreaterThan(3);
  await page.locator('#lineCloud').uncheck();
  await page.locator('#lineClosed').uncheck();

  /* 引线标注：两点自动完成，默认文字可编辑，subtype 经清洗保留 */
  const box3 = await page.locator('#canvas').boundingBox();
  const cx3 = box3.x + box3.width / 2, cy3 = box3.y + box3.height / 2;
  await clickTool(page, 'dimension');
  await page.selectOption('#dimensionType', 'leader');
  await page.mouse.click(cx3 - 170, cy3 + 40);
  await page.mouse.click(cx3 - 60, cy3 + 100);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(3);
  const leader = await page.evaluate(() => {
    const o = state.objects[2];
    const clean = sanitizeObjects([JSON.parse(JSON.stringify(o))], state.layers, state.objectTypes, new Set(), new Set(), null)[0];
    return { kind: o.kind, subtype: o.subtype, points: o.points.length, text: o.text, want: L('标注文字'), kept: clean && clean.subtype, draft: draft };
  });
  expect(leader).toEqual({ kind: 'dimension', subtype: 'leader', points: 2, text: leader.want, want: leader.want, kept: 'leader', draft: null });
});

test('半径标注：点选圆落成带 R 文字的引线', async ({ page }) => {
  await openApp(page);
  const box = await page.locator('#canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await clickTool(page, 'arc');
  await page.selectOption('#arcMode', 'circle');
  await page.mouse.click(cx, cy);
  await page.mouse.click(cx + 70, cy);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);
  await clickTool(page, 'dimension');
  await page.selectOption('#dimensionType', 'radius');
  await page.mouse.click(cx, cy);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(2);
  const r = await page.evaluate(() => {
    const o = state.objects[1];
    return { kind: o.kind, subtype: o.subtype, points: o.points.length, text: o.text, draft: draft };
  });
  expect(r.kind).toBe('dimension');
  expect(r.subtype).toBe('leader');
  expect(r.points).toBe(2);
  expect(r.text.startsWith('R ')).toBe(true);
  expect(r.draft).toBe(null);
});

test('镜像：选中点后两点定轴，生成对称副本且原对象不动', async ({ page }) => {
  await openApp(page);
  const box = await page.locator('#canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await clickTool(page, 'point');
  await page.mouse.click(cx, cy);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);
  await clickTool(page, 'select');
  await page.mouse.click(cx, cy);
  await expect.poll(() => page.evaluate(() => selectedIds.size)).toBe(1);
  await clickTool(page, 'mirror');
  await page.mouse.click(cx - 60, cy - 80);
  await page.mouse.click(cx - 60, cy + 80);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(2);
  const ui = await page.evaluate(() => ({ n: state.objects.length, selected: selectedIds.size, draft: draft }));
  expect(ui).toEqual({ n: 2, selected: 1, draft: null });
  /* 两次点击的落点会被网格吸附，改用已知世界轴直接验证反射公式：x'=-x, y'=y */
  const m = await page.evaluate(() => {
    state.objects.pop();
    selectedIds = new Set([state.objects[0].id]);
    const a = state.objects[0];
    mirrorSelected([0, 0], [0, 10]);
    const b = state.objects[1];
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  });
  expect(m.x1).toBeCloseTo(-m.x0, 6);
  expect(m.y1).toBeCloseTo(m.y0, 6);
});

test('阵列与偏移：批量复制 2×2、折线按 1m 等距偏移', async ({ page }) => {
  await openApp(page);
  const box = await page.locator('#canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await clickTool(page, 'point');
  await page.mouse.click(cx - 60, cy - 40);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);
  await clickTool(page, 'select');
  await page.mouse.click(cx - 60, cy - 40);
  await expect.poll(() => page.evaluate(() => selectedIds.size)).toBe(1);
  await page.evaluate(() => switchTab('list'));
  await page.click('#batchArrayBtn');
  await page.fill('#promptInput', '2,2,10,10');
  await page.locator('#modalFooter button.primary').click();
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(4);
  const arr = await page.evaluate(() => state.objects.map(o => [o.x, o.y].map(v => Math.round(v * 100) / 100)));
  expect(new Set(arr.map(p => p.join(','))).size).toBe(4);

  /* 偏移：先画一条水平线段，选中后偏移 1m；新线应与原线平行且相距 1m */
  await clickTool(page, 'line');
  await page.selectOption('#lineMode', 'segment');
  await page.mouse.click(cx - 100, cy + 60);
  await page.mouse.click(cx + 100, cy + 60);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(5);
  await clickTool(page, 'select');
  await page.mouse.click(cx, cy + 60);
  await expect.poll(() => page.evaluate(() => selectedIds.size)).toBe(1);
  await page.evaluate(() => switchTab('list'));
  await page.click('#batchOffsetBtn');
  await page.fill('#promptInput', '1');
  await page.locator('#modalFooter button.primary').click();
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(6);
  const off = await page.evaluate(() => {
    const lines = state.objects.filter(o => o.kind === 'line');
    const a = lines[0].points, b = lines[1].points;
    return { n: lines.length, dy: Math.abs(b[0][1] - a[0][1]), dx: Math.abs(b[0][0] - a[0][0]) };
  });
  expect(off.n).toBe(2);
  expect(off.dy).toBeCloseTo(1, 6);
  expect(off.dx).toBeCloseTo(0, 6);

  /* 批量颜色：对当前选中的偏移副本写对象级颜色 */
  await page.locator('#batchColor').evaluate(el => { el.value = '#ff0000'; });
  await page.click('#batchColorBtn');
  const cols = await page.evaluate(() => [...selectedIds].map(id => state.objects.find(o => o.id === id).style.color));
  expect(cols.length).toBeGreaterThan(0);
  expect(cols.every(c => c === '#ff0000')).toBe(true);
});

test('批量闭合/反向：折线顶点顺序反转且闭合状态可切换', async ({ page }) => {
  await openApp(page);
  const box = await page.locator('#canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await clickTool(page, 'line');
  await page.mouse.click(cx - 80, cy - 60);
  await page.mouse.click(cx, cy - 100);
  await page.mouse.dblclick(cx + 80, cy - 60);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);
  const before = await page.evaluate(() => state.objects[0].points.map(p => p.slice()));
  expect(before.length).toBeGreaterThanOrEqual(3);
  await clickTool(page, 'select');
  await page.mouse.click(cx, cy - 100);
  await expect.poll(() => page.evaluate(() => selectedIds.size)).toBe(1);
  await page.evaluate(() => switchTab('list'));

  await page.click('#batchReverseBtn');
  const rev = await page.evaluate(() => state.objects[0].points.map(p => p.slice()));
  expect(rev[0]).toEqual(before[before.length - 1]);
  expect(rev[rev.length - 1]).toEqual(before[0]);

  await page.click('#batchCloseBtn');
  expect(await page.evaluate(() => !!state.objects[0].closed)).toBe(true);
  await page.click('#batchCloseBtn');
  expect(await page.evaluate(() => !!state.objects[0].closed)).toBe(false);
});

test('环形阵列：绕指定中心复制；坐标/标高标注单击落文字', async ({ page }) => {
  await openApp(page);
  const box = await page.locator('#canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await clickTool(page, 'point');
  await page.mouse.click(cx - 120, cy);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);
  await clickTool(page, 'select');
  await page.mouse.click(cx - 120, cy);
  await expect.poll(() => page.evaluate(() => selectedIds.size)).toBe(1);
  await page.evaluate(() => switchTab('list'));
  const p = await page.evaluate(() => ({ x: state.objects[0].x, y: state.objects[0].y }));
  const centerX = p.x + 10;
  await page.click('#batchPolarBtn');
  await page.fill('#promptInput', `4,90,${centerX},${p.y}`);
  await page.locator('#modalFooter button.primary').click();
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(4);
  const polar = await page.evaluate(({ centerX, y }) => {
    const pts = state.objects.slice(1).map(o => [o.x, o.y]);
    const radii = pts.map(q => Math.hypot(q[0] - centerX, q[1] - y));
    return { n: pts.length, radii: radii.map(r => Math.round(r * 100) / 100), unique: new Set(pts.map(q => q.join(','))).size };
  }, { centerX, y: p.y });
  expect(polar.n).toBe(3);
  expect(polar.unique).toBe(3);
  expect(polar.radii.every(r => Math.abs(r - 10) < 0.01)).toBe(true);

  await clickTool(page, 'dimension');
  await page.selectOption('#dimensionType', 'coord');
  await page.mouse.click(cx + 40, cy + 80);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(5);
  let txt = await page.evaluate(() => state.objects[state.objects.length - 1].text);
  expect(txt.startsWith('X ')).toBe(true);
  await page.selectOption('#dimensionType', 'elev');
  await page.mouse.click(cx + 120, cy + 80);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(6);
  txt = await page.evaluate(() => state.objects[state.objects.length - 1].text);
  expect(txt.startsWith('▽ ')).toBe(true);
});

test('手绘与双向箭头：拖动生成多点折线；两级箭头经清洗保留', async ({ page }) => {
  await openApp(page);
  const box = await page.locator('#canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await clickTool(page, 'line');
  await page.selectOption('#lineMode', 'freehand');
  await page.mouse.move(cx - 120, cy + 40);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(cx - 120 + i * 8, cy + 40 + Math.sin(i / 2) * 10);
  }
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);
  const fh = await page.evaluate(() => ({
    kind: state.objects[0].kind,
    n: state.objects[0].points.length,
    draft
  }));
  expect(fh.kind).toBe('line');
  expect(fh.n).toBeGreaterThan(5);
  expect(fh.draft).toBe(null);

  await page.selectOption('#lineMode', 'arrow2');
  await page.mouse.click(cx - 100, cy - 80);
  await page.mouse.click(cx + 100, cy - 80);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(2);
  const both = await page.evaluate(() => {
    const o = state.objects[1];
    const clean = sanitizeObjects([JSON.parse(JSON.stringify(o))], state.layers, state.objectTypes, new Set(), new Set(), null)[0];
    return { arrow: o.style.arrow, kept: clean && clean.style.arrow, closed: !!o.closed, n: o.points.length };
  });
  expect(both).toEqual({ arrow: 2, kept: 2, closed: false, n: 2 });
});

test('折线模式与类型互不影响；选择模式可直接拖场地顶点', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    state.objectTypes.push({ id: 'line.customseg', kind: 'line', name: '自定义线段', color: '#ff0000', builtin: false });
    populateSelects();
  });
  await clickTool(page, 'line');
  await page.selectOption('#lineMode', 'segment');
  await page.evaluate(() => { $('lineType').value = 'line.customseg'; });
  expect(await page.evaluate(() => ({ mode: $('lineMode').value, type: $('lineType').value })))
    .toEqual({ mode: 'segment', type: 'line.customseg' });
  /* 切换模式不改写类型 */
  await page.selectOption('#lineMode', 'arrow');
  expect(await page.evaluate(() => ({ mode: $('lineMode').value, type: $('lineType').value })))
    .toEqual({ mode: 'arrow', type: 'line.customseg' });

  /* 切回工具恢复默认：模式与类型都不记忆上次选择 */
  await clickTool(page, 'select');
  await clickTool(page, 'line');
  expect(await page.evaluate(() => ({ mode: $('lineMode').value, type: $('lineType').value })))
    .toEqual({ mode: 'polyline', type: 'line.boundary' });

  /* 选择模式：指针靠近场地顶点时出现手柄，按下拖动即可改形（无需切「场地节点」） */
  await page.evaluate(() => {
    state.site = createSiteSlot({ type: 'polygon', points: [[0, 0], [20, 0], [20, 10], [0, 10]] });
    commitChange();
    fitView();
  });
  await clickTool(page, 'select');
  const pt = await page.evaluate(() => {
    const s = w2s([20, 10]);
    const r = document.getElementById('canvas').getBoundingClientRect();
    return { x: r.left + s[0], y: r.top + s[1] };
  });
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await page.mouse.move(pt.x + 40, pt.y - 20, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => state.site.shape.points[2])).not.toEqual([20, 10]);

  /* 回归：fitView 后右上角落在顶栏下方（顶栏溢出曾吞掉点击，拖不动） */
  await page.evaluate(() => {
    state.site = createSiteSlot({ type: 'rect', x: 0, y: 0, w: 100, h: 70 });
    commitChange();
    fitView();
  });
  const tr = await page.evaluate(() => {
    const s = w2s([100, 70]);
    const r = document.getElementById('canvas').getBoundingClientRect();
    return { x: r.left + s[0], y: r.top + s[1] };
  });
  await page.mouse.move(tr.x, tr.y);
  await page.mouse.down();
  await page.mouse.move(tr.x - 40, tr.y + 30, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => state.site.shape.w)).toBeLessThan(100);

  /* 回归：顶点落在顶部提示条区域时，提示条不吞指针 */
  await page.evaluate(() => {
    state.site = createSiteSlot({ type: 'polygon', points: [[0, 0], [20, 0], [20, 10], [0, 10]] });
    commitChange();
    state.viewport.zoom = 10;
    state.viewport.panX = -100;
    state.viewport.panY = 30;
  });
  const hud = await page.evaluate(() => {
    const s = w2s([20, 10]);
    const r = document.getElementById('canvas').getBoundingClientRect();
    return { x: r.left + s[0], y: r.top + s[1] };
  });
  await page.mouse.move(hud.x, hud.y);
  await page.mouse.down();
  await page.mouse.move(hud.x + 40, hud.y - 30, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => state.site.shape.points[2])).not.toEqual([20, 10]);
});

test('圆/弧工具：圆生成描边圆对象，圆弧生成 arc 对象', async ({ page }) => {
  await openApp(page);
  await clickTool(page, 'arc');
  const box = await page.locator('#canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.click(cx - 120, cy - 60);
  await page.mouse.click(cx - 60, cy - 60);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);
  const circle = await page.evaluate(() => ({
    kind: state.objects[0].kind, type: state.objects[0].shape.type,
    r: state.objects[0].shape.r, fillAlpha: state.objects[0].style.fillAlpha, draft: draft
  }));
  expect(circle.kind).toBe('rect');
  expect(circle.type).toBe('circle');
  expect(circle.r).toBeGreaterThan(0);
  expect(circle.fillAlpha).toBe(0);
  expect(circle.draft).toBe(null);

  await page.selectOption('#arcMode', 'arc');
  await page.mouse.click(cx + 40, cy);
  await page.mouse.click(cx + 100, cy);
  await page.mouse.click(cx + 40, cy + 60);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(2);
  const arc = await page.evaluate(() => ({
    kind: state.objects[1].kind, type: state.objects[1].shape.type,
    r: state.objects[1].shape.r, a0: state.objects[1].shape.a0, a1: state.objects[1].shape.a1,
    sweep: arcSweep(state.objects[1].shape), draft: draft
  }));
  expect(arc.kind).toBe('arc');
  expect(arc.type).toBe('arc');
  expect(arc.r).toBeGreaterThan(0);
  expect(arc.sweep).toBeGreaterThan(0);
  expect(arc.sweep).toBeLessThan(360);
  expect(arc.draft).toBe(null);
});
