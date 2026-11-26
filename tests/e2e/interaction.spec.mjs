/* A-06 浏览器验证：单击对象不落盘/不清覆盖率、拖拽 Esc 回滚 */
import { test, expect } from '@playwright/test';
import { DB, idb } from './helpers.mjs';

async function openApp(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
}

async function drawPointAtCenter(page) {
  await page.locator('.tool-btn[data-tool="point"]').click();
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

  await page.locator('.tool-btn[data-tool="select"]').click();
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
  await page.locator('.tool-btn[data-tool="select"]').click();

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
  await page.locator('.tool-btn[data-tool="select"]').click();
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
  await page.locator('.tool-btn[data-tool="segment"]').click();
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
  expect(seg).toEqual({ kind: 'line', points: 2, closed: false, tool: 'segment', draft: null });
  /* 完成后第三点不会追加到上一段：先起新草稿，第二次落点才产生第二条 */
  await page.mouse.click(cx + 150, cy - 80);
  expect(await page.evaluate(() => ({ n: state.objects.length, draftPoints: draft && draft.points.length }))).toEqual({ n: 1, draftPoints: 1 });
});

test('线段类型与折线类型互不影响；选择模式可直接拖场地顶点', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    state.objectTypes.push({ id: 'line.customseg', kind: 'line', name: '自定义线段', color: '#ff0000', builtin: false });
    populateSelects();
    $('lineType').value = 'line.customseg';
  });
  await page.locator('.tool-btn[data-tool="segment"]').click();
  expect(await page.evaluate(() => ({ seg: $('segmentType').value, line: $('lineType').value })))
    .toEqual({ seg: 'line.boundary', line: 'line.customseg' });

  /* 切回工具恢复默认类型：折线与线段都不记忆上次选择 */
  await page.evaluate(() => { $('segmentType').value = 'line.customseg'; });
  await page.locator('.tool-btn[data-tool="line"]').click();
  expect(await page.evaluate(() => ({ seg: $('segmentType').value, line: $('lineType').value })))
    .toEqual({ seg: 'line.customseg', line: 'line.boundary' });
  await page.locator('.tool-btn[data-tool="segment"]').click();
  expect(await page.evaluate(() => ({ seg: $('segmentType').value, line: $('lineType').value })))
    .toEqual({ seg: 'line.boundary', line: 'line.boundary' });

  /* 选择模式：指针靠近场地顶点时出现手柄，按下拖动即可改形（无需切「场地节点」） */
  await page.evaluate(() => {
    state.site = createSiteSlot({ type: 'polygon', points: [[0, 0], [20, 0], [20, 10], [0, 10]] });
    commitChange();
    fitView();
  });
  await page.locator('.tool-btn[data-tool="select"]').click();
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
  await page.locator('.tool-btn[data-tool="arc"]').click();
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
