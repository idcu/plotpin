/* V-5 图纸修订双版对比：导入参照版 / 三类差异标识 / 闪烁开关 / 标定不一致提示 / 关闭无痕
   参照版只作运行时状态：不进 state、不进 persistableState、不进导出；关闭即释放。 */
import { test, expect } from '@playwright/test';

/* 三类差异标记的颜色（与 render.js 的 DIFF_OVERLAY_COLORS 同源） */
const MARK = { added: [22, 163, 74], removed: [220, 38, 38], moved: [37, 99, 235] };

test('V-5 参照版：导入 → 三类差异 → 闪烁 → 标定提示 → 清除无痕', async ({ page }) => {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
  await page.evaluate(() => { try { closeModal(); } catch (e) {} });

  /* 1. 准备当前工程：三个点放在当前视口中心附近；参照版删一个、加一个、移一个 */
  const refJson = await page.evaluate(() => {
    const R = visibleWorldRect(state.viewport, worldDims(), wrap.clientWidth, wrap.clientHeight, 0);
    const cx = (R.minX + R.maxX) / 2, cy = (R.minY + R.maxY) / 2;
    const u = Math.min(R.maxX - R.minX, R.maxY - R.minY) * 0.08;
    const a = baseObject('point', 'point.marker', { name: 'E2E-A', x: cx - u, y: cy });
    const b = baseObject('point', 'point.marker', { name: 'E2E-B', x: cx, y: cy - u });
    state.objects.push(a, b);
    invalidateStatic(); requestRender();
    const ref = JSON.parse(JSON.stringify(buildProject(persistableState())));
    ref.objects = ref.objects.filter(o => o.id !== b.id);                                        /* 参照没有 → 删除 */
    ref.objects.push(Object.assign(baseObject('point', 'point.marker', { name: 'E2E-C', x: cx + u, y: cy + u }), { id: 'OBJ.E2EC' })); /* 参照多出 → 新增 */
    ref.objects.find(o => o.id === a.id).x += u * 0.5;                                            /* 位置变化 → 移动 */
    ref.background = { kind: 'image', width: 1000, height: 800, metersPerPixel: 0.05, assetId: 'bg.e2e' };
    return JSON.stringify(ref);
  });

  /* 只取静态层签名里的参照版片段（refSig）：staticRev 会随渲染次数变化，不可用于比较 */
  const key = () => page.evaluate(() => sceneStaticContentKey(wrap.clientWidth, wrap.clientHeight, worldDims()).split('|').pop());
  const baseKey = await key();
  const baseCount = await page.evaluate(() => state.objects.length);

  /* 2. 导入参照版：运行时存在，当前工程不被替换 */
  await page.click('#settingsBtn');
  await expect(page.locator('#revPick')).toBeVisible();
  await page.setInputFiles('#revFile', { name: 'ref.json', mimeType: 'application/json', buffer: Buffer.from(refJson, 'utf8') });
  await expect.poll(() => page.evaluate(() => !!rRef)).toBe(true);
  expect(await page.evaluate(() => state.objects.length)).toBe(baseCount);
  expect(await key()).not.toBe(baseKey);

  /* 3. 三类差异都有：分类计数 + 画布上确实出现三种标记色 */
  const counts = await page.evaluate(() => rRef.diff.counts);
  expect(counts.added).toBeGreaterThanOrEqual(1);
  expect(counts.removed).toBeGreaterThanOrEqual(1);
  expect(counts.moved + counts.modified).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => diffOverlay.on)).toBe(true);
  const markerPixels = () => page.evaluate(colors => {
    const c = document.querySelector('#canvas'), g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data, out = { added: 0, removed: 0, moved: 0 };
    for (let i = 0; i < d.length; i += 4) {
      for (const k in colors) {
        const t = colors[k];
        if (Math.abs(d[i] - t[0]) < 40 && Math.abs(d[i + 1] - t[1]) < 40 && Math.abs(d[i + 2] - t[2]) < 40) out[k]++;
      }
    }
    return out;
  }, MARK);
  await expect.poll(async () => { const p = await markerPixels(); return Math.min(p.added, p.removed, p.moved); },
    { timeout: 8000 }).toBeGreaterThan(15);

  /* 4. 标定不一致必须可见：当前无图片底图、参照有 → canvas 不一致 */
  expect(await page.evaluate(() => rRef.calib.mode)).toBe('canvas');
  await expect(page.locator('#revInfo')).toContainText('画布不一致');

  /* 5. 不透明度可调，且进入静态层签名 */
  const sigRef = await key();
  await page.locator('#revOpacity').fill('70');
  await expect.poll(() => page.evaluate(() => Math.round(rOp * 100))).toBe(70);
  expect(await key()).not.toBe(sigRef);
  await page.locator('#revOpacity').fill('45');
  expect(await key()).toBe(sigRef);

  /* 6. 闪烁开关生效：1 Hz 自动交替；关闭后相位不再变化 */
  await page.locator('#revBlinkChk').check();
  await expect.poll(() => page.evaluate(() => rBl.on)).toBe(true);
  await expect.poll(() => page.evaluate(() => rBl.phase), { timeout: 5000 }).toBe(true);
  await page.locator('#revBlinkChk').uncheck();
  expect(await page.evaluate(() => rBl.on)).toBe(false);
  const phaseOff = await page.evaluate(() => rBl.phase);
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => rBl.phase)).toBe(phaseOff);

  /* 7. 关闭后不留痕迹：运行时释放、签名回原值、差异标记撤除、可持久化状态无参照字段 */
  await page.click('#revClearBtn');
  await expect.poll(() => page.evaluate(() => rRef === null)).toBe(true);
  expect(await key()).toBe(baseKey);
  expect(await page.evaluate(() => diffOverlay.on)).toBe(false);
  const persisted = await page.evaluate(() => JSON.stringify(persistableState()));
  expect(persisted).not.toContain('rRef');
  expect(persisted).not.toContain('"rev');
  expect(await page.evaluate(() => JSON.stringify(buildProject(persistableState())).includes('E2E-C'))).toBe(false);

  /* 8. 切换工程同样释放：新建工程后参照版不跨工程残留（设置弹窗仍开着，直接复用） */
  await page.setInputFiles('#revFile', { name: 'ref.json', mimeType: 'application/json', buffer: Buffer.from(refJson, 'utf8') });
  await expect.poll(() => page.evaluate(() => !!rRef)).toBe(true);
  await page.evaluate(() => closeModal());
  await page.click('#newBtn');
  await page.locator('#modalFooter button', { hasText: '确定' }).click();
  await expect.poll(() => page.evaluate(() => rRef === null)).toBe(true);
  expect(await page.evaluate(() => diffOverlay.on)).toBe(false);
  expect(await page.evaluate(() => state.objects.length)).toBe(0);
});
