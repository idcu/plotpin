/* A-14 真实 IndexedDB：v1→v2 回写 + 资产回收命名空间（A-01 六条路径） */
import { test, expect } from '@playwright/test';
import { DB, idb, clickCanvasCenter } from './helpers.mjs';

const now = '2026-01-01T00:00:00.000Z';
const point = id => ({
  id, name: 'P-' + id, kind: 'point', typeId: 'point.marker', layerId: 'layer.default',
  x: 10, y: 20, points: [], width: 0, height: 0, angle: 0, phys: 0, iconSize: 1,
  style: {}, props: {}, annot: {}, visible: true, locked: false, z: 0,
  createdAt: now, updatedAt: now
});
const V1_PROJECT = {
  schema: 'offline-drawing-annotation/v1',
  meta: { name: 'v1 迁移工程', createdAt: now, updatedAt: now },
  settings: {},
  viewport: { zoom: 1, panX: 0, panY: 0 },
  background: { kind: 'empty' },
  objects: [point('OBJ_V1_A')],
  layers: [],
  objectTypes: [],
  floors: [
    { id: 'floor.default', name: '1F' },
    { id: 'floor.f2', name: 'F2', background: { kind: 'empty' }, objects: [point('OBJ_V1_B')] }
  ],
  activeFloorId: 'floor.default',
  tombstones: []
};

async function openApp(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
}

test('IndexedDB v1→v2：迁移后写回 v2，楼层补 updatedAt 且不丢楼层/对象', async ({ page }) => {
  await openApp(page);
  await idb(page, { store: DB.projects, mode: 'readwrite', op: 'put', key: 'current', value: V1_PROJECT });

  await page.reload();
  await expect.poll(() => page.evaluate(() => state.schema)).toBe('offline-drawing-annotation/v2');

  const migrated = await page.evaluate(() => ({
    floorCount: state.floors.length,
    objectCount: state.objects.length,
    floors: state.floors.map(f => ({ id: f.id, updatedAt: f.updatedAt }))
  }));
  expect(migrated.floorCount).toBe(2);
  expect(migrated.objectCount).toBe(1);
  expect(migrated.floors[0].updatedAt).toBe('');
  expect(migrated.floors[1]).toEqual({ id: 'floor.f2', updatedAt: '' });

  /* 真实交互触发 scheduleSave（450ms 防抖） */
  await page.locator('.tool-btn[data-tool="point"]').click();
  await clickCanvasCenter(page);
  await expect.poll(async () => {
    const rec = await idb(page, { store: DB.projects, op: 'get', key: 'current' });
    return rec && rec.schema;
  }, { timeout: 6000 }).toBe('offline-drawing-annotation/v2');

  const saved = await idb(page, { store: DB.projects, op: 'get', key: 'current' });
  expect(saved.floors.length).toBe(2);
  expect(saved.floors.every(f => typeof f.updatedAt === 'string')).toBe(true);
  expect(saved.floors[0].updatedAt).not.toBe('');
  expect(saved.floors[1].updatedAt).toBe('');
  /* 活动楼层对象（v1 迁移 1 + 新绘制 1）+ F2 楼层对象 1 */
  expect(saved.objects.length).toBe(2);
  expect(saved.floors.find(f => f.id === 'floor.f2').objects.length).toBe(1);
});

test('导入事务化：非法 JSON 失败后当前工程、撤销栈与选择不变', async ({ page }) => {
  await openApp(page);
  await page.locator('.tool-btn[data-tool="point"]').click();
  await clickCanvasCenter(page);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);

  const before = await page.evaluate(() => ({
    name: state.meta.name, objects: state.objects.length,
    hist: history.past.length, selected: selectedIds.size
  }));
  const after = await page.evaluate(async () => {
    const f = new File(['{"schema":"not-plotpin"}'], 'bad.json', { type: 'application/json' });
    await importJsonFile(f);
    return {
      name: state.meta.name, objects: state.objects.length,
      hist: history.past.length, selected: selectedIds.size
    };
  });
  expect(after).toEqual(before);
});

test('资产回收：草稿/历史两栈/剪贴板/拖拽/工程库六条命名空间全部保活', async ({ page }) => {
  await openApp(page);
  await expect.poll(() => page.evaluate(() => typeof pruneBgAssets)).toBe('function');

  const ids = {
    draft: 'as_e2e_draft',
    past: 'as_e2e_past',
    future: 'as_e2e_future',
    clipboard: 'as_e2e_clip',
    drag: 'as_e2e_drag',
    project: 'as_e2e_proj',
    unreferenced: 'as_e2e_gone'
  };
  for (const id of Object.values(ids)) {
    await idb(page, { store: DB.assets, mode: 'readwrite', op: 'put', key: id, value: { bytes: [1, 2, 3], meta: { mime: 'image/png' } } });
  }
  /* 工程库中的另一个工程：只被 proj:<id> 记录引用 */
  await idb(page, {
    store: DB.projects, mode: 'readwrite', op: 'put', key: 'proj:PRJ_E2E',
    value: {
      schema: 'offline-drawing-annotation/v2',
      meta: { projectId: 'PRJ_E2E', name: '另一工程', createdAt: now, updatedAt: now },
      floors: [{ id: 'floor.default', name: '1F', updatedAt: now, background: { kind: 'image', assetId: ids.project }, objects: [] }],
      background: { kind: 'empty' }, site: null, objects: [], layers: [], objectTypes: [],
      viewport: { zoom: 1, panX: 0, panY: 0 }, activeFloorId: 'floor.default', tombstones: []
    }
  });

  const namespaces = await page.evaluate(async ({ draft, past, future, clip, dragId }) => {
    state.background.assetId = draft;
    history.past = [{ objects: [{ props: { photoId: past } }] }];
    history.future = [{ objects: [{ props: { photoId: future } }] }];
    clipboard = [{ props: { photoId: clip } }];
    drag = { originals: new Map([['OBJ_DRAG', { props: { photoId: dragId } }]]) };
    return Array.from((await assetRefsByNamespace()).keys());
  }, { draft: ids.draft, past: ids.past, future: ids.future, clip: ids.clipboard, dragId: ids.drag });

  expect(namespaces).toEqual(expect.arrayContaining([
    'draft', 'history.past[0]', 'history.future[0]', 'clipboard', 'drag.originals', 'project:PRJ_E2E'
  ]));
  expect(namespaces).toHaveLength(6);

  const pruned = await page.evaluate(() => pruneBgAssets());
  expect(pruned).toEqual([ids.unreferenced]);

  const keys = await idb(page, { store: DB.assets, op: 'keys' });
  for (const id of [ids.draft, ids.past, ids.future, ids.clipboard, ids.drag, ids.project]) {
    expect(keys).toContain(id);
  }
  expect(keys).not.toContain(ids.unreferenced);
});
