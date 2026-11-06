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

test('资产保活：快照引用阻止 prune 回收；回滚底图/照片可读；删除快照后可回收', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    const PNG_BG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
    const PNG_PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const bgBin = ContentAssets.dataUrlToBytes(PNG_BG);
    const photoBin = ContentAssets.dataUrlToBytes(PNG_PHOTO);
    const bgId = assetIdFor(bgBin.bytes);
    const photoId = assetIdFor(photoBin.bytes);
    await assetPut(bgId, { bytes: bgBin.bytes, mime: 'image/png' });
    await assetPut(photoId, { bytes: photoBin.bytes, mime: 'image/png' });

    state = createInitialState();
    state.background = Object.assign(createEmptyBackground(), {
      kind: 'image', fileName: 'keepalive-bg.png', assetId: bgId, width: 1, height: 1, metersPerPixel: 1
    });
    state.objects = [baseObject('point', 'point.camera', { id: 'P1', name: 'P1', x: 1, y: 1 })];
    state.objects[0].props = { photoId };
    await saveProjectAs('E2E 资产保活');
    const pid = state.meta.projectId;
    const snap = await createSnapshot({ label: '含底图+照片' });

    /* 当前工程移除底图/照片引用，并确保草稿与工程主记录都不再引用；历史清空 */
    history = { past: [], future: [] };
    state.background = createEmptyBackground();
    state.objects[0].props = {};
    await saveProjectAs('E2E 资产保活');
    await idbPut(persistableState());
    const reach = await reachableAssetIds();
    const prunedBefore = await pruneBgAssets();
    const keptBySnapshot = !!(await assetGet(bgId)) && !!(await assetGet(photoId));
    const snapshotNs = Array.from((await assetRefsByNamespace()).keys()).filter(k => k.startsWith('snapshot:')).length;

    /* 回滚：底图与照片必须仍可读 */
    await restoreSnapshotById(pid, snap.snapshotId);
    const restoredBgRef = state.background.assetId === bgId;
    const restoredPhotoRef = state.objects[0].props.photoId === photoId;
    const bgReadable = !!(await assetGet(bgId));
    const photoReadable = !!(await assetGet(photoId));
    const bgLoaded = !!bgDataUrl;

    /* 再次移除引用 → 删除快照 → prune：资产应可回收 */
    history = { past: [], future: [] };
    state.background = createEmptyBackground();
    state.objects[0].props = {};
    await new Promise(res => setTimeout(res, 600));   /* 等 restore 触发的自动保存落盘 */
    await saveProjectAs('E2E 资产保活');
    await idbPut(persistableState());
    history = { past: [], future: [] };
    await deleteSnapshot(pid, snap.snapshotId);
    const prunedAfterDelete = await pruneBgAssets();
    const prunedSet = Array.isArray(prunedAfterDelete) ? prunedAfterDelete : [];
    const bgGone = !(await assetGet(bgId));
    const photoGone = !(await assetGet(photoId));
    return {
      bgId, photoId, keptBySnapshot, prunedBefore, snapshotNs, restoredBgRef, restoredPhotoRef,
      bgReadable, photoReadable, bgLoaded, bgGone, photoGone, prunedSet, reachHasBoth:
        reach.includes(bgId) && reach.includes(photoId)
    };
  });
  console.log(`[B-04] 资产保活 snapshotNs=${r.snapshotNs} prunedBefore=${JSON.stringify(r.prunedBefore)} prunedAfterDelete=${JSON.stringify(r.prunedSet)}`);
  expect(r.reachHasBoth).toBe(true);         /* 可达集已包含快照引用 */
  expect(r.snapshotNs).toBe(1);               /* 快照命名空间参与扫描 */
  expect(r.prunedBefore).toEqual([]);         /* 快照引用保活：prune 不删 */
  expect(r.keptBySnapshot).toBe(true);
  expect(r.restoredBgRef).toBe(true);
  expect(r.restoredPhotoRef).toBe(true);
  expect(r.bgReadable).toBe(true);
  expect(r.photoReadable).toBe(true);
  expect(r.bgLoaded).toBe(true);               /* 底图 assetId 能真正解码回 dataURL */
  expect(r.bgGone).toBe(true);                 /* 删除快照后资产可回收 */
  expect(r.photoGone).toBe(true);
  expect(r.prunedSet.slice().sort()).toEqual([r.bgId, r.photoId].sort());
});

test('资产可达集性能：快照 1 条 vs 20 条（各 1000 对象）的全库扫描耗时', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    state = createInitialState();
    const objs = [];
    for (let i = 0; i < 1000; i++) {
      objs.push(baseObject('point', 'point.camera', { id: 'OBJ' + i, name: 'O' + i, x: i * 2, y: i }));
    }
    state.objects = objs;
    /* 最坏情况：每条快照都带底图 + 照片引用，命名空间条目完整参与扫描 */
    state.objects[0].props = { photoId: 'as_perf_photo' };
    state.background = Object.assign(createEmptyBackground(), { kind: 'image', assetId: 'bg_perf_bg', width: 1, height: 1 });
    await saveProjectAs('E2E 快照扫描性能');
    const pid = state.meta.projectId;
    const t1 = performance.now();
    await createSnapshot({ label: 'S1' });
    const create1 = performance.now() - t1;
    const t2 = performance.now();
    const refs1 = await assetRefsByNamespace();
    const scan1 = performance.now() - t2;
    const snapNs1 = Array.from(refs1.keys()).filter(k => k.startsWith('snapshot:')).length;
    const t3 = performance.now();
    for (let i = 2; i <= APP_LIMITS.SNAPSHOT_MAX_PER_PROJECT; i++) await createSnapshot({ label: 'S' + i });
    const createAll = performance.now() - t3;
    const t4 = performance.now();
    const refs20 = await assetRefsByNamespace();
    const scan20 = performance.now() - t4;
    const metas = await listSnapshots(pid);
    const snapNs = Array.from(refs20.keys()).filter(k => k.startsWith('snapshot:')).length;
    const totalBytes = metas.reduce((s, m) => s + (Number(m.bytes) || 0), 0);
    return { create1, createAll, scan1, scan20, snapNs1, snapCount: metas.length, snapNs, totalBytes };
  });
  console.log(`[B-04] 可达集扫描 1条=${r.scan1.toFixed(1)}ms(${r.snapNs1} ns) / 20条=${r.scan20.toFixed(1)}ms(${r.snapNs} ns); 快照 ${r.snapCount} 条 ${(r.totalBytes / 1048576).toFixed(2)}MB; 生成首条=${r.create1.toFixed(1)}ms 其余19条=${r.createAll.toFixed(1)}ms`);
  expect(r.snapCount).toBe(20);
  expect(r.snapNs).toBe(20);
  expect(r.snapNs1).toBe(1);
  expect(r.scan20).toBeLessThan(1000);   /* 记录实测；超过 1s 才需要索引优化 */
});
