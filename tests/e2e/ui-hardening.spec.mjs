/* RT-P2-15：对象清单类型色白名单转义；RT-P2-16：确认/输入弹窗非按钮关闭路径可返回 */
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
}

test('对象清单类型色经白名单校验，脏色值不逃逸 style 属性', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const o = baseObject('point', 'point.marker', { name: 'C1', x: 5, y: 5 });
    state.objects.push(o);
    getType(o.typeId).color = '#ff0000;background-image:url(javascript:alert(1))';
    switchTab('list');
    renderList();
  });
  const dirty = await page.locator('#objectTbody .dot').first().getAttribute('style');
  expect(dirty).toBe('background:#666');
  expect(await page.evaluate(() => document.querySelector('#objectTbody .dot').style.backgroundImage)).toBe('initial');
  await page.evaluate(() => { getType(state.objects[0].typeId).color = '#00ff00'; renderList(); });
  expect(await page.locator('#objectTbody .dot').first().getAttribute('style')).toContain('#00ff00');
});

test('确认/输入弹窗 Esc 与遮罩关闭均返回结果，按钮路径语义不变', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { window.__confirm = 'pending'; showConfirm('测试确认').then(v => { window.__confirm = v; }); });
  await expect(page.locator('#modalBackdrop')).toHaveClass(/show/);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__confirm)).toBe(false);
  await expect(page.locator('#modalBackdrop')).not.toHaveClass(/show/);

  await page.evaluate(() => { window.__prompt = 'pending'; showPrompt({ title: '测试输入', label: '名称', value: 'abc' }).then(v => { window.__prompt = v; }); });
  await expect(page.locator('#modalBackdrop')).toHaveClass(/show/);
  await page.locator('#modalBackdrop').click({ position: { x: 4, y: 4 } });
  await expect.poll(() => page.evaluate(() => window.__prompt)).toBe(null);

  await page.evaluate(() => { window.__confirm2 = 'pending'; showConfirm('按钮路径').then(v => { window.__confirm2 = v; }); });
  await page.locator('#modalFooter button.primary').click();
  await expect.poll(() => page.evaluate(() => window.__confirm2)).toBe(true);

  await page.evaluate(() => { window.__prompt2 = 'pending'; showPrompt({ title: '重命名', label: '名称', value: '旧名' }).then(v => { window.__prompt2 = v; }); });
  await page.fill('#promptInput', ' 新名 ');
  await page.locator('#modalFooter button.primary').click();
  await expect.poll(() => page.evaluate(() => window.__prompt2)).toBe('新名');
});
