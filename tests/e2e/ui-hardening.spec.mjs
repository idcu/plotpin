/* RT-P2-15：对象清单类型色白名单转义（RT-P2-16 弹窗关闭路径断言见后续提交追加） */
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
