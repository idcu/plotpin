/* D-04 规则注册进入公共 API：来源标识、违规产出、注销后消失（受信任同源路径） */
import { test, expect } from '@playwright/test';

test('D-04 受信任插件注册规则：来源可见、产出违规、注销后消失', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  const reg = await page.evaluate(() => PlotPin.registerRule({
    id: 'demo.floor-warn',
    name: '示例插件规则',
    description: '演示：每层返回一条违规',
    check: ctx => ({ violations: [{ objectName: '示例对象', message: '示例违规', x: 0, y: 0 }] })
  }, 'demo.plugin'));
  expect(reg.ok).toBe(true);
  expect(await page.evaluate(() => PlotPin.listRules().find(r => r.id === 'demo.floor-warn').owner)).toBe('demo.plugin');
  await page.locator('#tabBtn-rules').click();
  await expect(page.locator('#ruleConfig')).toContainText('插件: demo.plugin');
  await page.locator('#runRulesBtn').click();
  await expect(page.locator('#ruleResults')).toContainText('示例插件规则');
  /* 注销：规则列表与检查结果都不再出现 */
  expect(await page.evaluate(() => PlotPin.unregisterRule('demo.floor-warn').ok)).toBe(true);
  await page.locator('#tabBtn-rules').click();
  await expect(page.locator('#ruleConfig')).not.toContainText('插件: demo.plugin');
  await page.locator('#runRulesBtn').click();
  await expect(page.locator('#ruleResults')).not.toContainText('示例插件规则');
});
