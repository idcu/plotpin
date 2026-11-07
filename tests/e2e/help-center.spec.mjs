/* D-03 帮助中心：? 打开三页签、页签切换、Esc 关闭后焦点回到画布 */
import { test, expect } from '@playwright/test';

test('D-03 帮助中心三页签与焦点回归', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof openShortcutsHelp === 'function');
  await expect(page.locator('#canvas')).toBeVisible();
  await page.locator('#canvas').focus();

  await page.keyboard.press('Shift+/');
  await expect(page.locator('#modalBackdrop')).toHaveClass(/show/);
  await expect(page.locator('#modalTitle')).toHaveText('帮助中心');
  await expect(page.locator('.help-tab')).toHaveCount(3);
  await expect(page.locator('.help-tab.active')).toHaveText('快捷键');
  await expect(page.locator('.help-panel:not([hidden]) .help-grid span.kbd')).toHaveCount(20);

  await page.locator('.help-tab[data-help-tab="glossary"]').click();
  await expect(page.locator('.help-tab.active')).toHaveText('概念词典');
  await expect(page.locator('.help-tab[data-help-tab="glossary"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.help-panel:not([hidden]) .help-term')).toHaveCount(6);
  await expect(page.locator('.help-panel:not([hidden])')).toContainText('图片底图');
  await expect(page.locator('.help-panel:not([hidden])')).toContainText('覆盖率口径');

  await page.locator('.help-tab[data-help-tab="exports"]').click();
  await expect(page.locator('.help-tab.active')).toHaveText('导出检查清单');
  await expect(page.locator('.help-panel:not([hidden]) .help-term')).toHaveCount(8);
  await expect(page.locator('.help-panel:not([hidden])')).toContainText('SITE 图层');
  await expect(page.locator('.help-panel:not([hidden])')).toContainText('位图页');
  await expect(page.locator('.help-panel:not([hidden])')).toContainText('公式注入');

  await page.keyboard.press('Escape');
  await expect(page.locator('#modalBackdrop')).not.toHaveClass(/show/);
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('canvas');
});
