/* C-05 几何规则检查：浏览器级验证（运行/改配置重查/定位/CSV 导出/免责提示） */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function openApp(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
}

test('C-05 规则检查：重叠/越界到间距改配置重查、点击定位与 CSV 导出', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    state.objects = [
      baseObject('rect', 'rect.area', { name: 'A', x: 10, y: 10, width: 10, height: 10 }),
      baseObject('rect', 'rect.area', { name: 'B', x: 15, y: 15, width: 10, height: 10 }),
      baseObject('point', 'point.marker', { name: 'P1', x: 40, y: 10 }),
      baseObject('point', 'point.marker', { name: 'P2', x: 40.5, y: 10 }),
      baseObject('rect', 'rect.area', { name: 'OUT', x: 150, y: 10, width: 10, height: 10 })
    ];
    state.rules.spacing.types = {};
  });

  await page.locator('#tabBtn-rules').click();
  await expect(page.locator('#tab-rules')).toHaveClass(/active/);
  await expect(page.locator('#ruleConfig')).toContainText('这是几何检查，不是消防/规范审图');
  await expect(page.locator('#ruleConfig')).toContainText('不内置任何规范数值');

  /* 首轮：重叠 1 + 越界 1，间距未配置 */
  await page.locator('#runRulesBtn').click();
  await expect(page.locator('#ruleCount')).toContainText('2 条');
  await expect(page.locator('#ruleResults')).toContainText('对象重叠');
  await expect(page.locator('#ruleResults')).toContainText('越界');
  await expect(page.locator('#ruleResults')).toContainText('完全越出场地边界');
  await expect(page.locator('#ruleResults')).toContainText('未配置阈值类型 2 个');

  /* 改配置 → 重查：给点类型配置 1m 阈值，违规数应变 3 */
  const minInput = page.locator('[data-rule-type-min="point.marker"]');
  await minInput.fill('1');
  await minInput.blur(); /* 失焦触发 change，写入 state.rules 并清空旧结果 */
  await expect.poll(() => page.evaluate(() => state.rules.spacing.types['point.marker'])).toBe(1);
  await page.locator('#runRulesBtn').click();
  await expect(page.locator('#ruleCount')).toContainText('3 条');
  await expect(page.locator('#ruleResults')).toContainText('最小间距');
  await expect(page.locator('#ruleResults')).toContainText('低于阈值');
  await expect(page.locator('#ruleResults')).toContainText('未配置阈值类型 1 个');

  /* 点击违规行：定位到对象并切到属性页签 */
  const first = page.locator('[data-rule-hit]').first();
  await first.click();
  await expect(page.locator('#tab-props')).toHaveClass(/active/);
  const sel = await page.evaluate(() => ({ ids: Array.from(selectedIds), size: selectedIds.size }));
  expect(sel.size).toBeGreaterThanOrEqual(1);
  expect(sel.size).toBeLessThanOrEqual(2);

  /* 导出违规清单：文件名 + 行数 = 表头 + 违规数（先切回规则页签，按钮可见） */
  await page.locator('#tabBtn-rules').click();
  await expect(page.locator('#tab-rules')).toHaveClass(/active/);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#exportRulesBtn').click()
  ]);
  expect(download.suggestedFilename()).toMatch(/^rule-violations-\d{8}-\d{4}\.csv$/);
  const text = readFileSync(await download.path(), 'utf8');
  expect(text.startsWith('\uFEFF规则,对象编号,对象名称,关联对象,楼层,X,Y,说明,值')).toBeTruthy();
  expect(text.trimEnd().split('\r\n').length).toBe(4);
});
