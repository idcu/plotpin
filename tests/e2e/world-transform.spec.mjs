/* B-12：世界变换统一入口 —— 改比例尺/仿射后，对象、场地与图片底图不得错位 */
import { test, expect } from '@playwright/test';

async function openApp(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  return errors;
}

test('B-12：缩放世界后对象与底图像素同屏不动，场地保持真值参考', async ({ page }) => {
  const errors = await openApp(page);
  const r = await page.evaluate(() => {
    /* 构造「已仿射校准的图片底图 + 矩形场地 + 一个点位」现场 */
    state.background = {
      kind: 'image', width: 800, height: 600, metersPerPixel: 0.05, calibrated: true,
      transform: { a: 0.05, b: 0, c: 0, d: 0, e: -0.05, f: 30 }
    };
    state.site = { kind: 'rect', shape: { type: 'rect', x: 0, y: 0, w: 100, h: 70 } };
    state.objects = [baseObject('point', 'point.marker', { x: 10, y: 10, angle: 0, phys: 2 })];

    const obj = state.objects[0];
    const uv = bgWorldToPixel(state.background, [obj.x, obj.y]);

    const res = applyWorldTransform([2, 0, 0, 0, 2, 0]);

    /* 对象世界坐标 = 底图同一像素的新世界坐标：两者在屏幕上必须重合，才算不错位 */
    const afterScreen = w2s([obj.x, obj.y]);
    const pixelScreen = w2s(bgPixelToWorld(state.background, uv));
    return {
      ok: res.ok,
      objX: obj.x,
      objY: obj.y,
      driftBgPx: Math.hypot(afterScreen[0] - pixelScreen[0], afterScreen[1] - pixelScreen[1]),
      mpp: state.background.metersPerPixel,
      transformA: state.background.transform.a,
      siteW: state.site.shape.w,
      siteH: state.site.shape.h,
      siteKind: state.site.kind,
      phys: obj.phys,
      hasOld: typeof scaleWorldAround === 'function' && typeof migrateObjectsByAffine === 'function'
    };
  });

  expect(r.ok).toBe(true);
  expect(r.objX).toBeCloseTo(20, 9);
  expect(r.objY).toBeCloseTo(20, 9);
  expect(r.driftBgPx).toBeLessThan(0.5);       /* 与底图同一像素不产生错位 */
  expect(r.mpp).toBeCloseTo(0.1, 9);           /* 0.05 ×2 */
  expect(r.transformA).toBeCloseTo(0.1, 9);    /* 既有仿射同步左乘 */
  expect(r.siteW).toBeCloseTo(100, 9);         /* 场地优先校准：坐标是真值，不被自动迁移 */
  expect(r.siteH).toBeCloseTo(70, 9);
  expect(r.siteKind).toBe('rect');
  expect(r.phys).toBeCloseTo(4, 9);            /* 设备物理尺寸随世界缩放 */
  expect(r.hasOld).toBe(true);
  expect(errors).toEqual([]);
});

test('B-12：退化变换被拒绝且不改动现场；等比圆场地保持圆', async ({ page }) => {
  const errors = await openApp(page);
  const r = await page.evaluate(() => {
    state.background = {
      kind: 'image', width: 400, height: 300, metersPerPixel: 0.1, calibrated: false, transform: null
    };
    state.site = { kind: 'circle', shape: { type: 'circle', cx: 50, cy: 35, r: 20 } };
    state.objects = [baseObject('point', 'point.marker', { x: 5, y: 6, angle: 0, phys: 2 })];

    const bad = applyWorldTransform([0, 0, 0, 0, 0, 0]);
    const unchanged = state.objects[0].x === 5 && state.objects[0].y === 6 && state.background.metersPerPixel === 0.1;

    scaleWorldAround([0, 0], 1.5);
    const siteAfterDefault = { r: state.site.shape.r, type: state.site.shape.type, kind: state.site.kind };
    const mppAfterScale = state.background.metersPerPixel;
    const objXAfterScale = state.objects[0].x;
    /* 显式 opt-in 时场地才迁移，用于「整体平移/换坐标系」等场景 */
    applyWorldTransform([2, 0, 0, 0, 2, 0], { site: true });
    return {
      badOk: bad.ok,
      unchanged,
      mpp: mppAfterScale,
      hasTransform: state.background.transform,
      siteType: state.site.shape.type,
      siteR: state.site.shape.r,
      siteKind: state.site.kind,
      siteAfterDefault,
      objX: objXAfterScale
    };
  });

  expect(r.badOk).toBe(false);
  expect(r.unchanged).toBe(true);
  expect(r.mpp).toBeCloseTo(0.15, 9);          /* 无 transform 时只缩放 m/p，仍走默认映射 */
  expect(r.hasTransform).toBe(null);
  expect(r.siteAfterDefault).toEqual({ r: 20, type: 'circle', kind: 'circle' });
  expect(r.siteType).toBe('circle');           /* opt-in 后等比放大仍为圆 */
  expect(r.siteR).toBeCloseTo(40, 9);
  expect(r.siteKind).toBe('circle');
  expect(r.objX).toBeCloseTo(7.5, 9);          /* 旧签名 scaleWorldAround 仍可用 */
  expect(errors).toEqual([]);
});
