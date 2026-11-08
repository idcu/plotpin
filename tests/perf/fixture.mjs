/* fixture.mjs —— 真实浏览器性能用例共享夹具（页面内执行，只能引用页面全局）
 *
 * 与 tests/perf/browser-baseline.perf.mjs 原内联夹具逐字段一致：
 * 2000×1500m 场地、1/3 point.marker + 1/3 rect.area + 1/3 line.custom，
 * 全部落在视野内（最坏情况的静态层重建）。修改本文件会让两组基线同时变化，
 * 必须两侧一起复测，不得只改一侧。
 */
export function installScene(scale) {
  state.background = createEmptyBackground();
  state.site = createSiteSlot({ type: 'rect', w: 2000, h: 1500 });
  state.layers = [{ id: 'layer.default', name: '默认图层', visible: true, locked: false }];
  state.settings = Object.assign({}, state.settings, {
    gridVisible: true, showLabels: true, showAreaTag: true, showSegLen: true,
    showCursor: true, snap: true, markerScale: 1,
    siteNodes: true, siteSegLen: true, siteArea: true, sitePerimeter: true
  });
  state.floors = [{ id: 'floor.default', name: '1F', updatedAt: nowISO() }];
  state.activeFloorId = 'floor.default';
  state.tombstones = [];

  const pTpl = baseObject('point', 'point.marker', {});
  const rTpl = baseObject('rect', 'rect.area', {});
  const lTpl = baseObject('line', 'line.custom', {});
  const objs = [];
  for (let i = 0; i < scale; i++) {
    const x = (i * 37) % 1900 + 20, y = (i * 53) % 1400 + 20;
    let o;
    if (i % 3 === 0) o = Object.assign({}, pTpl, { x, y });
    else if (i % 3 === 1) o = Object.assign({}, rTpl, { x, y, width: 4 + (i % 7), height: 3 + (i % 5) });
    else o = Object.assign({}, lTpl, { x, y, points: [[x, y], [x + 6, y], [x + 6, y + 4]] });
    o.id = 'OBJ_PERF_' + i;
    o.name = 'P' + i;
    o.z = i;
    objs.push(o);
  }
  state.objects = objs;
  selectedIds.clear();
  resetFrameRef();
  resizeCanvas();
  fitView();
}
