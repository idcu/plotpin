/* P1-04 锁定对象不可选；命中按 z 序（视觉最上层优先） */
import { test, expect } from '@playwright/test';

async function boot(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state === 'object' && typeof w2s === 'function');
  await page.waitForTimeout(150);
  return errors;
}

async function place(page, spec) {
  return page.evaluate(async (spec) => {
    state.site = null;
    state.background = { kind: 'empty' };
    state.objects = spec.map(s => {
      const o = baseObject('point', 'point.marker', { x: s.x, y: s.y });
      o.name = s.name; o.z = s.z; o.locked = !!s.locked;
      return o;
    });
    bumpZVersion();
    await afterStateLoaded(false);
    fitView();
    const r = document.getElementById('canvas').getBoundingClientRect();
    const at = (x, y) => { const s = w2s([x, y]); return { x: r.left + s[0], y: r.top + s[1] }; };
    return { center: at(spec[0].x, spec[0].y), a: at(2, 2), b: at(8, 8) };
  }, spec);
}

test('P1-04 命中按 z 序取视觉上层；锁定对象点击不选中', async ({ page }) => {
  const errors = await boot(page);
  const pts = await place(page, [
    { name: 'ZTOP', x: 5, y: 5, z: 1 },
    { name: 'LOCKED', x: 5, y: 5, z: 2, locked: true },
    { name: 'ZBOT', x: 5, y: 5, z: 0 }
  ]);
  await page.mouse.click(pts.center.x, pts.center.y);
  expect(await page.evaluate(() => selectedIds.size && state.objects.find(o => o.id === [...selectedIds][0]).name)).toBe('ZTOP');

  await page.evaluate(() => {
    state.objects.find(o => o.name === 'ZTOP').locked = true;
    bumpZVersion();
  });
  await page.mouse.click(pts.center.x, pts.center.y);
  expect(await page.evaluate(() => selectedIds.size && state.objects.find(o => o.id === [...selectedIds][0]).name)).toBe('ZBOT');
  expect(errors).toEqual([]);
});

test('P1-04 框选排除锁定对象', async ({ page }) => {
  const errors = await boot(page);
  const pts = await place(page, [
    { name: 'FREE', x: 2, y: 2, z: 0 },
    { name: 'LOCKED', x: 8, y: 8, z: 1, locked: true }
  ]);
  await page.mouse.move(pts.a.x, pts.a.y);
  await page.mouse.down();
  await page.mouse.move(pts.b.x, pts.b.y, { steps: 6 });
  await page.mouse.up();
  const names = await page.evaluate(() => [...selectedIds].map(id => state.objects.find(o => o.id === id).name).sort());
  expect(names).toEqual(['FREE']);
  expect(errors).toEqual([]);
});
