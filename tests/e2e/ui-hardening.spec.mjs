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
  /* CSSOM 对「清空/初始值」的序列化因内核而异：Chromium 回报 initial，Firefox 回报 none */
  expect(['initial', 'none']).toContain(await page.evaluate(() => document.querySelector('#objectTbody .dot').style.backgroundImage));
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

/* C1：X/Y 清空或非法输入曾被写成 0，把对象静默打到原点；空输入也不该消耗撤销帧。 */
test('C1：属性面板 X/Y 空值或非法输入不写 state、不涨历史，失焦恢复旧值', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const o = baseObject('point', 'point.marker', { name: 'C1', x: 5, y: 5 });
    state.objects.push(o);
    selectedIds.clear();
    selectedIds.add(o.id);
    renderProps();
  });
  const x = page.locator('#propPanel input[data-field="x"]');
  await expect(x).toHaveValue(/^5/);
  const before = await page.evaluate(() => ({ x: state.objects[0].x, hist: history.past.length }));

  await x.fill('');
  await expect(x).not.toHaveValue('');
  await expect(x).toHaveClass(/field-invalid/);
  expect(await page.evaluate(() => ({ x: state.objects[0].x, hist: history.past.length }))).toEqual(before);

  /* 半成品 "-" 只能模拟真实键入：Playwright fill 拒绝给 number 输入非数字 */
  await x.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('-');
  expect(await page.evaluate(() => ({ x: state.objects[0].x, hist: history.past.length }))).toEqual(before);
  await x.blur();
  await expect(x).not.toHaveValue('');
  expect(await page.evaluate(() => ({ x: state.objects[0].x, hist: history.past.length }))).toEqual(before);

  await x.fill('12.5');
  await expect.poll(() => page.evaluate(() => state.objects[0].x)).toBe(12.5);
  await expect(x).not.toHaveClass(/field-invalid/);
  expect(await page.evaluate(() => history.past.length)).toBe(before.hist + 1);
});

/* C1/L-29：#propPanel 在多次渲染间复用，dragend 曾按 {once:true} 逐次累积监听器。 */
test('C1：属性面板连续渲染 20 次，dragend 监听器净增不超过 1 个', async ({ page }) => {
  await openApp(page);
  const d = await page.evaluate(() => {
    const o = baseObject('line', 'line.custom', { name: 'D', points: [[0, 0], [6, 0], [6, 4]] });
    state.objects.push(o);
    selectedIds.clear();
    selectedIds.add(o.id);
    const panel = document.getElementById('propPanel');
    window.__drag = { add: 0, remove: 0 };
    const add = panel.addEventListener.bind(panel);
    const remove = panel.removeEventListener.bind(panel);
    panel.addEventListener = (t, f, opts) => { if (t === 'dragend') window.__drag.add++; return add(t, f, opts); };
    panel.removeEventListener = (t, f, opts) => { if (t === 'dragend') window.__drag.remove++; return remove(t, f, opts); };
    for (let i = 0; i < 20; i++) renderProps();
    return window.__drag;
  });
  expect(d.add).toBe(20);
  expect(d.add - d.remove).toBe(1);
});
