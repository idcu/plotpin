/* 渲染测试共用场景：B-11 桌面基线与 B-15 移动端实测使用同一份构造，避免两套样本口径漂移。 */
/* 场景 A：与 scripts/bench.mjs 同口径 —— 点位/区域/折线 2000 个，不显示名称标注 */
export const SCENE_A = `(N => {
  state = createInitialState(); resetFrameRef();
  state.background = { kind: 'empty', fileName: '', assetId: '', width: 0, height: 0, origin: [0, 0],
    metersPerPixel: 0.1, calibrated: false, transform: null };
  state.site = { id: 'site.bench', name: '基准场地', layerId: 'layer.default', visible: true, locked: false,
    annot: {}, style: {}, updatedAt: '', kind: 'rect', shape: { type: 'rect', x: 0, y: 0, w: 2000, h: 1500 } };
  state.viewport = { zoom: 0.6, panX: 20, panY: 20 };
  const objs = [];
  for (let i = 0; i < N; i++) {
    const x = (i * 37) % 1900 + 20, y = (i * 53) % 1400 + 20;
    if (i % 3 === 0) objs.push(baseObject('point', 'point.marker', { x, y, name: 'P' + i }));
    else if (i % 3 === 1) objs.push(baseObject('rect', 'rect.area', { x, y, width: 4 + (i % 7), height: 3 + (i % 5), name: 'R' + i }));
    else objs.push(baseObject('line', 'line.custom', { x, y, points: [[x, y], [x + 6, y], [x + 6, y + 4]], name: 'L' + i }));
  }
  objs.forEach((o, i) => { o.z = i; });
  state.objects = objs;
  selectedIds.clear(); selectedIds.add(objs[1].id);
  return objs.length;
})`;

/* 场景 B：显示名称标注 + 行业 SVG 图元（真实图纸更接近此形态，用于评估 measureText / Path2D 成本） */
export const SCENE_B = `(N => {
  state = createInitialState(); resetFrameRef();
  state.background = { kind: 'empty', fileName: '', assetId: '', width: 0, height: 0, origin: [0, 0],
    metersPerPixel: 0.1, calibrated: false, transform: null };
  state.site = { id: 'site.bench', name: '基准场地', layerId: 'layer.default', visible: true, locked: false,
    annot: {}, style: {}, updatedAt: '', kind: 'rect', shape: { type: 'rect', x: 0, y: 0, w: 2000, h: 1500 } };
  state.viewport = { zoom: 0.6, panX: 20, panY: 20 };
  const symType = (typeof SYMBOL_LIBRARY !== 'undefined' && SYMBOL_LIBRARY[0] && SYMBOL_LIBRARY[0].id) || 'point.camera';
  const objs = [];
  for (let i = 0; i < N; i++) {
    const x = (i * 37) % 1900 + 20, y = (i * 53) % 1400 + 20;
    objs.push(baseObject('point', symType, { x, y, name: 'C' + i, annot: { name: true } }));
  }
  objs.forEach((o, i) => { o.z = i; });
  state.objects = objs;
  selectedIds.clear(); selectedIds.add(objs[1].id);
  return objs.length;
})`;
