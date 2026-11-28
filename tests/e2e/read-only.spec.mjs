import { test, expect } from '@playwright/test';

/* P1-B1/B2/B3 回归：本地只读必须在本端写入入口前置拒绝，不能先改 state 再靠 commitChange 报错。 */

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
});

test('只读：批量移动与清单可见性开关不改 state', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.evaluate(() => {
    state.site = null;
    state.layers = [{ id: 'layer.default', name: '默认', visible: true, locked: false }];
    activeLayerId = 'layer.default';
    state.objects = [baseObject('point', 'point.marker', { x: 1, y: 2 })];
    selectedIds = new Set([state.objects[0].id]);
    refreshUI(); requestRender();
  });
  await page.evaluate(() => setReadOnly(true));
  const before = await page.evaluate(() => ({ v: state.objects[0].visible, x: state.objects[0].x }));

  await page.evaluate(() => {
    $('batchDx').value = '5';
    $('batchMoveBtn').click();
    document.querySelector('[data-toggle-visible]').click();
  });
  await page.waitForTimeout(150);

  const after = await page.evaluate(() => ({ v: state.objects[0].visible, x: state.objects[0].x }));
  expect(after).toEqual(before);
  expect(errors).toEqual([]);
});

test('只读：改规则配置不改 state.rules', async ({ page }) => {
  expect(await page.locator('#ruleConfig').count()).toBe(1);
  expect(await page.locator('[data-rule-type-min]').count()).toBeGreaterThan(0);
  await page.evaluate(() => setReadOnly(true));
  const before = await page.evaluate(() => JSON.stringify(state.rules || {}));

  await page.evaluate(() => {
    const el = document.querySelector('[data-rule-type-min]');
    el.value = String((Number(el.value) || 0) + 1);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(450);

  const after = await page.evaluate(() => JSON.stringify(state.rules || {}));
  expect(after).toBe(before);
});

test('只读：mergeProjectJSON 直接返回 read-only 且不改现场', async ({ page }) => {
  const r = await page.evaluate(async () => {
    setReadOnly(true);
    const before = { name: state.meta.name, n: state.objects.length, site: !!state.site };
    const out = await mergeProjectJSON({}, {});
    return { out, before, after: { name: state.meta.name, n: state.objects.length, site: !!state.site } };
  });
  expect(r.out).toEqual({ ignored: 'read-only' });
  expect(r.after).toEqual(r.before);
});
