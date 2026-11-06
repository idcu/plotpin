/* B-04 版本快照 + 图纸对比/叠加：真实浏览器验证存储、回滚、差异分类与叠加开关 */
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
}

test('快照：1000 对象生成 <2s、照片只存引用、删除快照不影响工程', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    state = createInitialState();
    const objs = [];
    for (let i = 0; i < 1000; i++) {
      objs.push(baseObject('point', 'point.camera', { id: 'OBJ' + i, name: 'O' + i, x: i * 2, y: i }));
    }
    /* 故意塞入 50KB 内嵌照片：快照必须转为 photoId 引用，不能把 base64 复制进快照 */
    const photo = 'data:image/png;base64,' + 'A'.repeat(50000);
    objs[0].props = { photoDataUrl: photo };
    state.objects = objs;
    await saveProjectAs('E2E 快照工程');
    const before = performance.now();
    const meta = await createSnapshot({ label: '1000 对象' });
    const wall = performance.now() - before;
    const pid = state.meta.projectId;
    const rec = await getSnapshot(pid, meta.snapshotId);
    const snapKeys = (await idbAllKeys()).filter(k => k.startsWith('snap:' + pid + ':'));
    const projKeys = (await idbAllKeys()).filter(k => k.startsWith('proj:' + pid));
    const json = JSON.stringify(rec.data);
    /* 列表：可读到刚生成的快照 */
    const listed = await listSnapshots(pid);
    /* 删除：只删快照键，工程主记录与当前 state 不变 */
    await deleteSnapshot(pid, meta.snapshotId);
    const afterDel = (await idbAllKeys()).filter(k => k.startsWith('snap:' + pid + ':'));
    const projAfter = await idbGetKey('proj:' + pid);
    return {
      wall, elapsed: meta.elapsedMs, bytes: meta.bytes, objectCount: rec.data.objects.length,
      hasBase64: json.includes('data:image'), photoId: rec.data.objects[0].props && rec.data.objects[0].props.photoId,
      snapCount: snapKeys.length, projCount: projKeys.length, listed: listed.length,
      afterDel: afterDel.length, stateCount: state.objects.length,
      projAfterCount: projAfter && projAfter.objects ? projAfter.objects.length : -1
    };
  });
  console.log(`[B-04] 1000对象快照 wall=${r.wall.toFixed(1)}ms meta=${r.elapsed}ms bytes=${r.bytes} (${(r.bytes / 1024).toFixed(1)}KB)`);
  expect(r.wall).toBeLessThan(2000);
  expect(r.elapsed).toBeLessThan(2000);
  expect(r.objectCount).toBe(1000);
  expect(r.hasBase64).toBe(false);
  expect(r.photoId).toBeTruthy();
  expect(r.snapCount).toBe(1);
  expect(r.projCount).toBe(1);
  expect(r.listed).toBe(1);
  expect(r.afterDel).toBe(0);
  expect(r.stateCount).toBe(1000);
  expect(r.projAfterCount).toBe(1000);
});

test('回滚：确认提示存在；回滚进入撤销栈（可撤销/重做），回滚后可继续编辑', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    state = createInitialState();
    state.objects = [
      baseObject('point', 'point.camera', { id: 'A', name: 'A', x: 1, y: 1 }),
      baseObject('point', 'point.camera', { id: 'B', name: 'B', x: 2, y: 2 })
    ];
    await saveProjectAs('E2E 回滚工程');
    const snap = await createSnapshot({ label: '基线 2 个对象' });
    pushHistory();
    state.objects.push(baseObject('point', 'point.camera', { id: 'C', name: 'C', x: 3, y: 3 }));
    commitChange('add C');
    const beforeRestore = state.objects.length;          /* 3 */
    await restoreSnapshotById(state.meta.projectId, snap.snapshotId);
    const afterRestore = state.objects.length;           /* 2 */
    const pastAfterRestore = history.past.length;
    undo();
    const afterUndo = state.objects.length;              /* 3 */
    redo();
    const afterRedo = state.objects.length;              /* 2 */
    pushHistory();
    state.objects.push(baseObject('point', 'point.camera', { id: 'D', name: 'D', x: 4, y: 4 }));
    commitChange('add D');
    const afterEdit = state.objects.length;              /* 3：回滚后仍可继续编辑 */
    const undoBtnDisabled = $('undoBtn') ? $('undoBtn').disabled : null;
    return { beforeRestore, afterRestore, pastAfterRestore, afterUndo, afterRedo, afterEdit, undoBtnDisabled };
  });
  expect(r.beforeRestore).toBe(3);
  expect(r.afterRestore).toBe(2);
  expect(r.pastAfterRestore).toBeGreaterThan(0);   /* 回滚前现场已进入撤销栈 */
  expect(r.afterUndo).toBe(3);                     /* Ctrl+Z 可回到回滚前 */
  expect(r.afterRedo).toBe(2);                     /* 重做回到快照状态 */
  expect(r.afterEdit).toBe(3);                     /* 回滚后继续编辑成功 */
  expect(r.undoBtnDisabled).toBe(false);

  /* UI：回滚按钮会先弹确认框，文案明确与撤销栈/未保存状态的关系 */
  const pid = await page.evaluate(() => state.meta.projectId);
  await page.evaluate(async p => { await openSnapshotManager(p, 'E2E 回滚工程'); }, pid);
  await expect(page.locator('#modalBody [data-sop="restore"]').first()).toBeVisible();
  await page.locator('#modalBody [data-sop="restore"]').first().click();
  await expect(page.locator('#modalBody')).toContainText('撤销栈');
  await expect(page.locator('#modalBody')).toContainText('Ctrl+Z');
  await page.locator('#modalFooter button', { hasText: '取消' }).click();
});

test('对比：构造样本六类分类正确、未变对象零误报、叠加开关与关闭清理', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    state = createInitialState();
    const now = nowISO();
    state.floors = [
      { id: 'floor.1', name: '1F', updatedAt: now },
      { id: 'floor.2', name: 'F2', updatedAt: now, objects: [] }
    ];
    state.activeFloorId = 'floor.1';
    const ob = (id, patch) => baseObject('point', 'point.marker', Object.assign({ id, name: id, x: 0, y: 0 }, patch || {}));
    const unchanged = Array.from({ length: 20 }, (_, i) => ob('U' + i));
    const removedObj = ob('E_REMOVE');
    const modifiedA = ob('E_MODIFY', { name: '改属性-旧' });
    const moveA = ob('E_MOVE', { x: 0, y: 5 });
    const typeA = ob('E_TYPE', { typeId: 'point.marker' });
    const floorObj = ob('E_FLOOR', { x: 30, y: 30 });
    state.objects = unchanged.concat([removedObj, modifiedA, moveA, typeA, floorObj]);
    await saveProjectAs('E2E 对比工程');
    const aSnap = await createSnapshot({ label: 'A 基线' });

    const modifiedB = ob('E_MODIFY', { name: '改属性-新' });
    const moveB = ob('E_MOVE', { x: 12, y: 5 });
    const typeB = ob('E_TYPE', { typeId: 'point.camera' });
    const addedObj = ob('E_ADDED', { name: '新增' });
    /* 未变对象只改运行时字段（updatedAt/z）：必须被忽略，不得误报为属性修改。
       照片引用变化是真变更，不放进误报样本（1000 对象用例已单独验证 base64→photoId）。 */
    const unchangedB = unchanged.map((o, i) => i === 0
      ? Object.assign({}, o, { updatedAt: '2026-02-01T00:00:00.000Z', z: 99 })
      : o);
    state.objects = unchangedB.concat([modifiedB, moveB, typeB, addedObj]);
    state.floors.find(f => f.id === 'floor.2').objects = [floorObj];
    const bSnap = await createSnapshot({ label: 'B 变更' });

    const recA = await getSnapshot(state.meta.projectId, aSnap.snapshotId);
    const recB = await getSnapshot(state.meta.projectId, bSnap.snapshotId);
    const diff = diffSnapshots(recA.data, recB.data);
    const byId = {};
    diff.items.forEach(it => { byId[it.id] = it.category; });
    const falsePositives = diff.items.filter(it => it.id.startsWith('U')).length;
    return {
      pid: state.meta.projectId, aId: aSnap.snapshotId, bId: bSnap.snapshotId,
      counts: diff.counts, unchanged: diff.unchanged, byId,
      falsePositives, falsePositiveRate: falsePositives / 20 * 100,
      fields: {
        modify: (diff.items.find(x => x.id === 'E_MODIFY') || {}).fields,
        move: (diff.items.find(x => x.id === 'E_MOVE') || {}).fields,
        type: (diff.items.find(x => x.id === 'E_TYPE') || {}).fields,
        floor: (diff.items.find(x => x.id === 'E_FLOOR') || {}).fields
      }
    };
  });
  console.log(`[B-04] 构造样本 counts=${JSON.stringify(r.counts)} unchanged=${r.unchanged} FP=${r.falsePositives}/20 (${r.falsePositiveRate}%)`);
  expect(r.counts).toEqual({ added: 1, removed: 1, modified: 1, moved: 1, floorChanged: 1, typeChanged: 1, total: 6 });
  expect(r.unchanged).toBe(20);
  expect(r.byId).toEqual({
    E_ADDED: 'added', E_REMOVE: 'removed', E_MODIFY: 'modified',
    E_MOVE: 'moved', E_FLOOR: 'floorChanged', E_TYPE: 'typeChanged'
  });
  expect(r.falsePositives).toBe(0);
  expect(r.falsePositiveRate).toBe(0);
  expect(r.fields.modify).toEqual(['name']);
  expect(r.fields.move).toEqual(['x']);
  expect(r.fields.type).toEqual(['typeId']);
  expect(r.fields.floor).toEqual(['floorId']);

  /* 工程库入口：每个工程行有「版本」按钮 */
  await page.evaluate(async () => { await openProjectLibrary(); });
  await expect(page.locator('#modalBody button[data-op="snap"]').first()).toBeVisible();

  /* 快照管理 → A/B 对比 → 叠加高亮开关 */
  await page.evaluate(async p => { await openSnapshotManager(p, 'E2E 对比工程'); }, r.pid);
  await expect(page.locator('#snapCompare')).toBeVisible();
  await page.locator('#snapCompare').click();
  await expect(page.locator('#snapOverlayChk')).toBeVisible();
  await expect(page.locator('#snapOverlayChk')).toBeChecked();
  await expect(page.locator('#modalBody')).toContainText('新增 1');
  await expect(page.locator('#modalBody')).toContainText('换楼层 1');
  expect(await page.evaluate(() => diffOverlay.on)).toBe(true);
  expect(await page.evaluate(() => diffOverlay.items.length)).toBe(6);

  await page.locator('#snapOverlayChk').uncheck();
  expect(await page.evaluate(() => diffOverlay.on)).toBe(false);
  await page.locator('#snapOverlayChk').check();
  expect(await page.evaluate(() => diffOverlay.on)).toBe(true);

  /* Esc/关闭/遮罩统一走 closeModal：叠加态必须被清理，避免无入口的高亮悬挂 */
  await page.evaluate(() => closeModal());
  expect(await page.evaluate(() => diffOverlay.on)).toBe(false);
  expect(await page.evaluate(() => diffOverlay.items.length)).toBe(0);
});
