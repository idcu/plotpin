/* B-14 i18n 插值模板：英文界面整句 + 用户数据不注入 DOM */
import { test, expect } from '@playwright/test';

test('英文界面：模板插值整句生效，用户输入只作文本不注入 DOM', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();

  const applied = await page.evaluate(() => {
    I18N.setLang('en');
    I18N.apply(document);
    return { exportBtn: document.getElementById('exportBtn').textContent.trim(), lang: I18N.lang };
  });
  expect(applied.lang).toBe('en');
  expect(applied.exportBtn).toBe('Export');

  const toastText = await page.evaluate(() => {
    toast(L('已粘贴 {n} 个对象', { n: 3 }));
    return document.querySelector('.toast:last-child').textContent;
  });
  expect(toastText).toBe('Pasted 3 objects');

  const tableText = await page.evaluate(() => {
    toast(L('表格导入完成：更新 {updated} 项，替换 {replaced} 个对象，新增 {created} 项',
      { updated: 2, replaced: 1, created: 4 }));
    return document.querySelector('.toast:last-child').textContent;
  });
  expect(tableText).toBe('Table import complete: 2 updated, 1 replaced, 4 created');

  const injected = await page.evaluate(() => {
    const raw = '<img src=x onerror="window.__xss=1">';
    toast(L('已导入 SVG 图元：{name}', { name: raw }));
    const el = document.querySelector('.toast:last-child');
    return {
      text: el.textContent,
      childTags: el.querySelectorAll('*').length,
      xss: !!window.__xss
    };
  });
  expect(injected.text).toBe('SVG symbol imported: ' + '<img src=x onerror="window.__xss=1">');
  expect(injected.childTags).toBe(0);
  expect(injected.xss).toBe(false);

  await page.evaluate(() => { I18N.setLang('zh'); I18N.apply(document); });
  expect(errors).toEqual([]);
});
