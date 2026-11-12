/* H-02 工程副本一致性：卸载双写 current+proj、内层 projectId 以记录键为准、非法 id 拒绝 */
import { test, expect } from '@playwright/test';
import { DB, idb } from './helpers.mjs';

const now = '2026-01-01T00:00:00.000Z';
const point = id => ({
  id, name: 'P-' + id, kind: 'point', typeId: 'point.marker', layerId: 'layer.default',
  x: 10, y: 20, points: [], width: 0, height: 0, angle: 0, phys: 0, iconSize: 1,
  style: {}, props: {}, annot: {}, visible: true, locked: false, z: 0,
  createdAt: now, updatedAt: now
});
function project(pid, name, opts = {}) {
  const p = {
    schema: 'offline-drawing-annotation/v2',
    meta: { name, createdAt: now, updatedAt: opts.updatedAt || now },
    settings: {},
    viewport: { zoom: 1, panX: 0, panY: 0 },
    background: { kind: 'empty' },
    objects: [point(opts.objId || 'OBJ_H02')],
    layers: [],
    objectTypes: [],
    floors: [{ id: 'floor.default', name: '1F', updatedAt: now, objects: [] }],
    activeFloorId: 'floor.default',
    tombstones: []
  };
  if (pid) p.meta.projectId = pid;
  return p;
}

async function openApp(page) {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
}

test('H-02 卸载写 current 时同步写 proj:<pid>', async ({ page }) => {
  await openApp(page);
  const pending = await page.evaluate(async () => {
    state.meta.projectId = 'P02-H1';
    state.meta.name = 'A';
    state.meta.updatedAt = '2026-01-01T00:00:00.000Z';
    await idbPutCurrentAndProject(persistableState(), 'P02-H1');
    state.meta.name = '卸载写入';
    state.meta.updatedAt = '2026-02-02T00:00:00.000Z';
    markDirty('object');
    const has = !!saveTimer;
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    return has;
  });
  expect(pending).toBe(true);
  await expect.poll(async () => {
    const rec = await idb(page, { store: DB.projects, op: 'get', key: 'proj:P02-H1' });
    return rec && rec.meta && rec.meta.name;
  }, { timeout: 4000 }).toBe('卸载写入');
  const current = await idb(page, { store: DB.projects, op: 'get', key: 'current' });
  const copy = await idb(page, { store: DB.projects, op: 'get', key: 'proj:P02-H1' });
  expect(copy.meta.updatedAt).toBe('2026-02-02T00:00:00.000Z');
  expect(current.meta.updatedAt).toBe(copy.meta.updatedAt);
});

test('H-02 内层 projectId 冲突时按记录键修正，不产生新工程键', async ({ page }) => {
  await openApp(page);
  await idb(page, { store: DB.projects, mode: 'readwrite', op: 'put', key: 'proj:P02-SRC', value: project('OTHER', '来源工程', { objId: 'OBJ_SRC' }) });

  const opened = await page.evaluate(async () => {
    await openProjectById('P02-SRC');
    return { pid: state.meta.projectId, objects: state.objects.length };
  });
  expect(opened.pid).toBe('P02-SRC');
  expect(opened.objects).toBe(1);
  await expect(page.locator('#toastWrap .toast.warn')).toContainText('工程标识不一致');

  /* 保存后：记录键内层已修正，且没有 proj:OTHER */
  await expect.poll(async () => {
    const rec = await idb(page, { store: DB.projects, op: 'get', key: 'proj:P02-SRC' });
    return rec && rec.meta && rec.meta.projectId;
  }, { timeout: 4000 }).toBe('P02-SRC');
  const keys = await idb(page, { store: DB.projects, op: 'keys' });
  expect(keys).not.toContain('proj:OTHER');
  const src = await idb(page, { store: DB.projects, op: 'get', key: 'proj:P02-SRC' });
  expect(src.objects.length).toBe(1);
  expect(src.objects[0].id).toBe('OBJ_SRC');
});

test('H-02 旧档缺少内层 projectId 可正常打开并补齐', async ({ page }) => {
  await openApp(page);
  await idb(page, { store: DB.projects, mode: 'readwrite', op: 'put', key: 'proj:P02-LEGACY', value: project('', '旧档', { objId: 'OBJ_LEGACY' }) });

  const opened = await page.evaluate(async () => {
    await openProjectById('P02-LEGACY');
    return { pid: state.meta.projectId, objects: state.objects.length, id: state.objects[0] && state.objects[0].id };
  });
  expect(opened).toEqual({ pid: 'P02-LEGACY', objects: 1, id: 'OBJ_LEGACY' });
  await expect.poll(async () => {
    const rec = await idb(page, { store: DB.projects, op: 'get', key: 'proj:P02-LEGACY' });
    return rec && rec.meta && rec.meta.projectId;
  }, { timeout: 4000 }).toBe('P02-LEGACY');
});

test('H-02 非法工程 id 拒绝打开', async ({ page }) => {
  await openApp(page);
  const err = await page.evaluate(async () => {
    try { await openProjectById('bad id'); return ''; }
    catch (e) { return e.message; }
  });
  expect(err).toBe('工程标识非法');
});
