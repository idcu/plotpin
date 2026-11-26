/* B-14 i18n 插值模板：英文界面整句 + 用户数据不注入 DOM */
import { test, expect } from '@playwright/test';

/* 启动是异步的：loadSavedProject / applyLocalSettings 会把 state.settings 整体替换一次。
   在替换完成前改设置会被静默丢弃（表现为用例偶发取到旧语言/旧开关）。
   等 state.settings 句柄被替换（或 1.2s 内没有替换，说明启动早已完成）再动手。 */
async function waitBootSettled(page) {
  await page.waitForFunction(() => typeof state === 'object' && !!state.settings);
  const prev = await page.evaluateHandle(() => state.settings);
  try {
    await page.waitForFunction(p => state.settings !== p, prev, { timeout: 1200 });
  } catch (_) { /* 启动已完成，settings 不会再被替换 */ }
}

test('英文界面：模板插值整句生效，用户输入只作文本不注入 DOM', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  await waitBootSettled(page);

  /* 启动是异步的（恢复工程会整体替换 state 并重设语言），跨多次 evaluate 改语言会被启动流程覆盖；
     这里在同一同步块内完成「切语言 → 渲染 → 读取」，避免与启动竞态。
     语言唯一真源是 state.settings.lang，与设置面板的处理路径一致。 */
  const r = await page.evaluate(() => {
    state.settings.lang = 'en';
    I18N.setLang('en');
    I18N.apply(document);
    const out = {
      lang: I18N.lang,
      exportBtn: document.getElementById('exportBtn').textContent.trim(),
      texts: []
    };
    toast(L('已粘贴 {n} 个对象', { n: 3 }));
    out.texts.push(document.querySelector('.toast:last-child').textContent);
    toast(L('表格导入完成：更新 {updated} 项，替换 {replaced} 个对象，新增 {created} 项',
      { updated: 2, replaced: 1, created: 4 }));
    out.texts.push(document.querySelector('.toast:last-child').textContent);
    const raw = '<img src=x onerror="window.__xss=1">';
    toast(L('已导入 SVG 图元：{name}', { name: raw }));
    const el = document.querySelector('.toast:last-child');
    out.texts.push(el.textContent);
    out.childTags = el.querySelectorAll('*').length;
    out.xss = !!window.__xss;
    state.settings.lang = 'zh';
    I18N.setLang('zh');
    I18N.apply(document);
    return out;
  });

  expect(r.lang).toBe('en');
  expect(r.exportBtn).toBe('Export');
  expect(r.texts[0]).toBe('Pasted 3 objects');
  expect(r.texts[1]).toBe('Table import complete: 2 updated, 1 replaced, 4 created');
  expect(r.texts[2]).toBe('SVG symbol imported: ' + '<img src=x onerror="window.__xss=1">');
  expect(r.childTags).toBe(0);
  expect(r.xss).toBe(false);
  expect(errors).toEqual([]);
});
