/**
 * 离线通用图纸标注工具 —— 逻辑层零依赖自测（多文件版）
 *
 * 解析 index.html 中按顺序声明的 <script src>，按同样顺序拼接后注入最小
 * 浏览器桩在 vm 中执行（经典脚本共享全局作用域，拼接等价于浏览器按序加载），
 * 对几何、CRC32/ZIP、OOXML(XLSX) 双向往返、CSV、表格导入规划、迁移清洗、
 * 底图资产哈希、矢量场地（矩形/圆形/多边形域与形状规整）、点设备物理尺寸
 * （圆/方/扇形视场/杆的世界坐标命中）等纯逻辑做断言。无需 npm install，Node 18+：
 *
 *   node scripts/selftest.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { buildStandalone } from './pack-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

/* 按 index.html 中声明的真实顺序加载脚本 */
const srcs = [...html.matchAll(/<script\s+src="([^"]+)"><\/script>/g)].map(m => m[1]);
if (srcs.length < 5) { console.error('index.html 中未找到拆分后的 <script src> 列表'); process.exit(1); }
let code = srcs.map(s => `/* ===== ${s} ===== */\n` + readFileSync(join(root, s), 'utf8')).join('\n');

/* ---------------- 最小 DOM / 浏览器桩 ---------------- */
function makeUniversal() {
  const target = function () {};
  return new Proxy(target, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => '';
      if (p === 'then') return undefined;
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (p === 'getContext') return () => ctxStub;
      if (p === 'getBoundingClientRect') return () => ({ width: 900, height: 600, top: 0, left: 0, right: 900, bottom: 600 });
      if (p in t) return t[p];
      return makeUniversal();
    },
    set(t, p, v) { t[p] = v; return true; },
    apply() { return makeUniversal(); },
    construct() { return makeUniversal(); }
  });
}
const ctxStub = makeUniversal();
const elMap = new Map();
const elStub = id => { if (!elMap.has(id)) elMap.set(id, makeUniversal()); return elMap.get(id); };
/* N-16：此前 localStorage 桩引用了未声明的 lsMap，任何真实读写都会抛错并被调用方吞掉；
   补上底层 Map，断线待发队列的落盘/读回断言才有意义。 */
const lsMap = new Map();
const localStorageStub = {
  getItem: k => (lsMap.has(k) ? lsMap.get(k) : null),
  setItem: (k, v) => lsMap.set(k, String(v)),
  removeItem: k => lsMap.delete(k),
  clear: () => lsMap.clear(),
  key: i => Array.from(lsMap.keys())[i] ?? null,
  get length() { return lsMap.size; }
};
const documentStub = {
  getElementById: id => elStub(id),
  createElement: () => makeUniversal(),
  querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  activeElement: null,
  body: elStub('body'), documentElement: elStub('documentElement')
};
const setTimeoutStub = (fn, ms, ...args) => { const h = setTimeout(fn, ms, ...args); h.unref?.(); return h; };
const sandbox = {
  console, Math, JSON, Date, RegExp, Map, Set, Promise, Proxy, Reflect, Symbol,
  ArrayBuffer, DataView, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray,
  Float32Array, Float64Array, Int8Array, Int32Array, Array, Object, String, Number,
  Boolean, Error, TypeError, isFinite, isNaN, parseInt, parseFloat, encodeURIComponent,
  decodeURIComponent, escape, unescape, TextEncoder, TextDecoder, Blob, atob, btoa,
  setTimeout: setTimeoutStub, clearTimeout, setInterval: setTimeoutStub, clearInterval,
  CompressionStream:globalThis.CompressionStream, DecompressionStream:globalThis.DecompressionStream, Response:globalThis.Response,
  ReadableStream:globalThis.ReadableStream,
  document: documentStub,
  localStorage: localStorageStub,
  navigator: {},
  URL: { createObjectURL: () => 'blob:stub', revokeObjectURL() {} },
  Image: function () { return makeUniversal(); },
  devicePixelRatio: 1,
  requestAnimationFrame: () => 0,
  cancelAnimationFrame() {},
  matchMedia: () => ({ matches: false }),
  addEventListener() {}, removeEventListener() {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

/* 暴露内部函数给断言 */
code += `\n;globalThis.__api = {
  get state(){ return state; },
  get draft(){ return draft; }, set draft(v){ draft=v; },
  resetState(){ state = createInitialState(); resetFrameRef(); return state; },
  importJsonFile, openProjectById,
  createInitialState, migrateProject, buildProject, buildDemoProject, firstRunGuideState, markFirstRunGuide, savedProjectHasContent, countProjectObjects, assertProjectWithinLimits, baseObject,
  SETTINGS_KEYS, sanitizeSettings, settingsForStorage, applyLocalSettings,
  importLimitErrors, importLimitMessage,
  polygonArea, polylineLength, dimensionAngleDeg, pointInPolygon, distanceToSegment, nearestPointOnSegment,
  orthoPoint, polarSnap45, squareCorner, segmentsIntersect,
  boundsIntersect, scaleWorldAround, reachableBgAssetIds, assetRefsInMemory, unionAssetRefs,
  translateObject, alignObjects, distributeObjects, objectBounds, objectSnapBounds,
  renumberObjects, restackObjects, allObjectNames, nextObjectId, objectNameScopeFor, beginObjectNameScope, withObjectNameScope,
  get history(){ return history; },
  get clipboard(){ return clipboard; }, setClipboard(v){ clipboard=v; },
  get drag(){ return drag; }, setDrag(v){ drag=v; },
  resetTransientInteractionState, escapeInterrupt, handleWindowBlur,
  drawImageBackground,
  get bgImageState(){ return bgImageState; }, setBgImage(v){ bgImage=v; }, setBgDataUrl(v){ bgDataUrl=v; },
  clearCoverageResult, buildCoverageLayers,
  coverageLayerCache(){ return [coverageLayers,coverageLayersFor]; },
  get transient(){ return {draft,drag,rubber,affinePairs,calibPoints,trackLine,refEdge,osnapMode,coverageResult}; },
  setTransient(v){ ['draft','drag','rubber','affinePairs','calibPoints','trackLine','refEdge','osnapMode','coverageResult'].forEach(k=>{ if(Object.prototype.hasOwnProperty.call(v,k)) eval(k+'=v[k]'); }); },
  switchFloor,
  normalizeAngle, rotatePoint,
  XmlLite, Zip, Xlsx, DSV, ContentAssets,
  parseRowsStub: DSV.parseRows,
  rowsToObjectsPlan, applyTableImport, applyTableCommonCells, rowMatchesObject,
  TABLE_MATCH_COLUMNS, tableImportColumns, formulaUnguard,
  siteDomainOf, rectShapeFromCorners, circleShapeFrom, polygonShapeFromPoints,
  ellipseShapeFromCorners, sectorShapeFrom, ellipseShapeFromInput, applyVectorSite,
  siteDescription, worldDims, findIssues, STATS_ISSUE_VERSION,
  hitPhysicalPoint, siteKindName,
  areaShapeType, shapeWorldPoints, shapeHit, shapeArea, shapeLabelCenter, shapePerimeter,
  convertAreaShape, parallelogramPoints, parallelogramSkew, AREA_SHAPE_TYPES,
  PARALLELOGRAM_DEFAULT_SKEW, PARALLELOGRAM_MAX_SKEW, AREA_SHAPE_LABELS, applyRowShape,
  sectorSweep, sectorArcPoints, sectorArcRange, pointIconScale, areaParamText,
  collectSnapCandidates, collectSnapEdges, collectSnapCircles, findOsnap, OSNAP_LABELS,
  applyField,
  lineMinNodes, setNodeCoord, insertLineNode, removeLineNode, moveNode, moveNodeStep,
  isPolylineEditable, objectArea, objectLength, renderNodeEditor,
  annotKeys, annotOn, annotLabel, annotDefault, setAnnot, annotationItems, renderAnnotToggles,
  annotToggleGroupHTML, bindAnnotToggleInputs, siteAnnotToggleKeys, renderSiteAnnotToggles,
  SITE_ANNOT_SETTING_KEYS, siteAnnotSettingOn, setSiteAnnotSetting,
  typeDisplayName, populateSelects,
  normalizeIcon, TYPE_ICONS, mergeTypes,
  SCHEMA, SCHEMA_V1, isReadableSchema, touchFloor, commitChange, commitObjectEdit,
  markDirty, MARK_DIRTY_PROFILES,
  dragChanged, dragChangedIds, sameSerializable, objectMovedFrom, cancelActiveDrag, stampObjects,
  sanitizeObjects, sanitizeReport, safeId,
  normalizeFloorName, floorNameTaken, floorRefs, addFloor, renameFloor,
  get coverageResult(){ return coverageResult; }, set coverageResult(v){ coverageResult=v; },
  get collabOnLocalChange(){ return collabOnLocalChange; }, set collabOnLocalChange(fn){ collabOnLocalChange=fn; },
  esc, segLabelMinPx, APP_LIMITS, backgroundScalePlan,
  createTitleBlock, normalizeTitleBlock, TITLE_BLOCK_FIELDS, TITLE_BLOCK_TEXT_MAX,
  titleBlockEffective, titleBlockSpec, titleBlockRatio, niceScaleBarMeters, titleBlockLegendData,
  exportTitleBlockSvg, drawTitleBlockOnCanvas,
  xmlEscape, modalBody, safeHTML, sanitizeSiteStyle,
  $, renderTypes, renderProps, renderStats, tabTargetIndex, isCanvasShortcutTarget, modalKeydown, openModal, closeModal,
  get selectedIds(){ return selectedIds; },
  objectRows, objectRowsAll, buildExportRow, exportShapeSummary, exportParamText, xlsxExportTable,
  effectiveVisible, isVisible, exportScope, pdfDrawObjectsFor, pdfPagePlan,
  EXPORT_FIELD_DEFS, PDF_COLS, REPORT_LIST_COLS,
  formatNodeCoords, parseNodeCoords,
  previewGeomCandidate, checkRowGeom, geomRoundingTol,
  buildSceneSvg, exportFooterText, siteDxfEntities, siteOutlinePoints, dxfEntitiesForExport,
  normalizeExportColor, dxfSanitizeName,
  outlineOf, objectIndexById, ensureVendor, siteDomainOf,
  Dxf: globalThis.Dxf, Pdf: globalThis.Pdf,
  dwgVersionInfo, dxfFidelityLines, dxfRefLayerName,
  PdfRead: globalThis.PdfRead, Qr: globalThis.Qr,
  SYMBOL_LIBRARY: globalThis.SYMBOL_LIBRARY, parseSvgSymbol: globalThis.parseSvgSymbol, BUILTIN_TYPES,
  SYMBOL_CATEGORIES: globalThis.SYMBOL_CATEGORIES, SYMBOL_LIMITS: globalThis.SYMBOL_LIMITS,
  searchSymbols: globalThis.searchSymbols, buildSymbolIndex: globalThis.buildSymbolIndex,
  symbolPathsFor: globalThis.symbolPathsFor, normalizeSymbolPaths: globalThis.normalizeSymbolPaths,
  normalizeSymbolViewBox: globalThis.normalizeSymbolViewBox, normalizeSymbolAliases: globalThis.normalizeSymbolAliases,
  symbolPolylinesInWorld: globalThis.symbolPolylinesInWorld, pathToPolylines: globalThis.pathToPolylines,
  customSymbolsFromTypes: globalThis.customSymbolsFromTypes, sanitizeSymbolBundle: globalThis.sanitizeSymbolBundle,
  PlotPin: globalThis.PlotPin, I18N: globalThis.I18N,
  exportViaPlugin: globalThis.exportViaPlugin, importViaPlugin: globalThis.importViaPlugin,
  parkingLayout, parkingWarningText, parkingSite, applyParkingLayout,
  collabChunkText, collabCleanSDP,
  collabInviteEncode, collabInviteDecode, collabQrFit, collabSweepInbound,
  collabInboundBytes, collabHelloDup, mergeHistoryNeeded,
  collabBackoffDelay, collabPendingStore, collabPendingLoad, collabPendingClear,
  collabFlushPending, collabCheckTransport, collabBroadcastFloor,
  collabHandleMessage, collabProjectToken, collabMergeChanged, collabMergeOverwritten,
  COLLAB_FLOOR_OPS, COLLAB_FLOOR_TYPES, COLLAB_PENDING_KEY,
  get collabMode(){ return collabMode; }, set collabMode(v){ collabMode=v; },
  get collabReconnectAttempt(){ return collabReconnectAttempt; },
  get collabForeignDropped(){ return collabForeignDropped; },
  get collabPeerCount(){ return collabPeers.size; },
  get collabInbound(){ return collabInbound; },
  get collabHelloSeen(){ return collabHelloSeen; },
  get collabState(){ return collabState; },
  undo, redo, pushHistory, get history(){ return history; },
  snapshotHistoryState, materializeHistoryState, isHistorySnapshot, historyValueEqual,
  applyLedgerCells, LEDGER_FIELDS,
  dimensionMeasure, BLIND_SPOT_FIELDS, buildBlindSpotGeoJson,
  csvCell: (v,d)=>csvCell(v,d),
  formulaGuard, delimitedText, exportJSON,
  TABLE_COLUMNS,
  cameraFootprint, pointInFootprint, regionPolygons, polygonBBox, analyzeCoverage, blindSpotRects, blindSpotArea,
  optimizeCameraPlacement,
  defaultImageTransform, imageTransformOf, bgPixelToWorld, bgWorldToPixel,
  imageCornerWorld, imageWorldFrame, validImageTransform, imageHandleList, imageHandleDragTo,
  solveImageAffine, affApply, affMul, affInv, migrateObjectsByAffine,
  applyWorldTransform, siteShapeByAffine, scaleWorldAround,
  affineLinearSummary, affineEllipseImage, affineShapeTransform,
  siteBoundaryPoints, siteShapeCenter, siteBasePoint, siteRadiusText, siteAreaPerimeter,
  worldFrame, computeWorldFrame, resetFrameRef, syncFramePan, siteBounds, w2s, fitView, pointBounds,
  siteHandleList, siteHandleAt, resizeSiteByHandle, siteHandlesOf, siteHandleDragTo, pickScreenHandle,
  siteLayerOf, siteIsVisible, siteIsLocked, renderNodeEditor, layerOptionsHTML,
  sitePropsHTML, imagePropsHTML,
  drawObject, drawLabel, drawAreaTag, drawScreenTag, surfaceCssSize, markSurfaceSize,
  invalidateStatic, visibleWorldRect, sceneStaticKey, detectCapabilities, detectRuntimeCapabilities,
  syncActiveFloor, switchFloorData, currentFloorName, currentFloor, floorObjectCount, floorSummaries, persistableState,
  addFloor, deleteFloor,
  snapshotKey, snapshotIdOfKey, snapshotProjectData, snapshotAssetRefs, utf8Length, snapshotObjectIndex,
  snapshotIndexKey, snapshotIndexLoad, listSnapshots, pruneSnapshots, restoreSnapshotById, createSnapshot, sameJson,
  snapshotFloorMetas, diffSceneItems,
  objectDiffFields, diffCategoryOf, diffSnapshots, diffFieldLabel, diffValueText,
  DIFF_MOVE_KEYS, DIFF_IGNORE_KEYS, DIFF_FIELD_LABELS,
  get diffOverlay(){ return diffOverlay; }, setDiffOverlay, clearDiffOverlay,
  get scheduleSave(){ return scheduleSave; }, set scheduleSave(fn){ scheduleSave=fn; },
  clearCurrentFloor,
  get calibPoints(){ return calibPoints; }, set calibPoints(v){ calibPoints=v; },
  get affinePairs(){ return affinePairs; }, set affinePairs(v){ affinePairs=v; },
  get calibSelection(){ return calibSelection; }, set calibSelection(v){ calibSelection=v; },
  get calibUndoStack(){ return calibUndoStack; }, set calibUndoStack(v){ calibUndoStack=v; },
  calibPrecheck, isCalibTool, CALIB_TOOL_KEYS,
  helpShortcutRows, helpGlossaryRows, helpExportRows, helpTabDefs,
  auditProject,
  classifySaveError, reportSaveFailure, writeLocalDraft, SAVE_RETRY_MS,
  get saveHealth(){ return saveHealth; },
  resetSaveHealth(){ saveRetry=0; saveHealth={state:'ok',errorCode:'',lastOkAt:'',retry:0}; },
  LEASE_CHANNEL, LEASE_TTL_MS, LEASE_HEARTBEAT_MS, LEASE_FUTURE_SKEW_MS, acquireEditorLease, releaseEditorLease, leaseIngest,
  leaseConflictAt, leaseClaim, leaseSyncProject, leaseStatus, onLeaseConflict,
  directionalSnap, addGuideLine, removeLastGuideLine, clearGuideLines, guideLineList, guideEdges,
  mergeProjectData, mergeTombstoneMap, sanitizeTombstones, markTombstone, TOMBSTONE_LIMIT, mergeProjectJSON, mergeBlankMissingTimestamps,
  CATALOG_SCHEMA, CATALOG_KEY, catalogValidate, importCatalog, catalogLoad,
  get catalogLoadError(){ return catalogLoadError; },
  quoteTable, quoteAggregate, quoteColumns, QUOTE_FIELD_DEFS, delimitedFromTable, roundMoney, exportQuote,
  catalogVersion, QUOTE_SNAPSHOT_KEY, quoteSignature, quoteSnapshotTable, quoteMetaTable,
  get currentCatalog(){ return currentCatalog; }, setCurrentCatalog(v){ currentCatalog=v; },
  createRuleConfig, normalizeRuleConfig, RULE_MAX_VIOLATIONS,
  registerRule, unregisterRule, listRules, runRuleCheck, ruleViolations,
  ruleObjectFootprint, ruleGapGeometry, rulePolygonIntersectionArea, ruleMaxPolygonIntersection,
  rulePointOutsideSite, ruleViolationsCsv, ruleFloorContexts,
  locateRuleViolation, normalizeRuleTypes, mergeRuleSide, ruleExportName,
};`;
vm.runInContext(code, sandbox, { filename: 'index.html<scripts>', displayErrors: true });

/* ---------------- 微型测试框架（D-13：分区注册 / --list / --filter） ---------------- */
let pass = 0, fail = 0;
const asyncSuites=[];
const failures = [];
/* 分区：默认按原顺序全跑；--list 只列分区；--filter=<regex> 只跑名称匹配的分区，
   未匹配分区的断言不执行、也不计入统计（默认口径不变）。分段名随失败输出。 */
const sectionNames=[];
const sectionCtx=new AsyncLocalStorage();
const cliArgs=process.argv.slice(2);
const listOnly=cliArgs.includes('--list');
function parseFilter() {
  const i=cliArgs.findIndex(a=>a==='--filter'||a.startsWith('--filter='));
  if (i<0) return null;
  const raw=cliArgs[i].startsWith('--filter=')?cliArgs[i].slice('--filter='.length):cliArgs[i+1];
  if (!raw) { console.error('--filter 需要正则表达式'); process.exit(2); }
  try { return new RegExp(raw, 'i'); } catch { console.error('--filter 正则无效：' + raw); process.exit(2); }
}
const filterRe=listOnly?null:parseFilter();
async function section(name, fn) {
  sectionNames.push(name);
  if (listOnly) return;
  if (filterRe && !filterRe.test(name)) return;
  await sectionCtx.run(name, fn);
}
function currentSection() { return sectionCtx.getStore() || '（未分区）'; }
function ok(name, cond) {
  if (cond) { pass++; } else { fail++; const tag='['+currentSection()+'] '+name; failures.push(tag); console.error('  ✗ ' + tag); }
}
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  ok(name + (a === e ? '' : `（期望 ${e}，实际 ${a}）`), a === e);
}
function approx(name, actual, expected, eps = 1e-9) {
  ok(name + `（期望 ${expected}，实际 ${actual}）`, Math.abs(actual - expected) <= eps);
}

const api = sandbox.__api;
await section('0. 公共命名空间', async () => {
  ok('公共命名空间 Zip/XmlLite/Xlsx/DSV/ContentAssets 已挂载',
    !!api.Zip && !!api.XmlLite && !!api.Xlsx && !!api.DSV && !!api.ContentAssets);
});

/* 1. 几何 ---------------------------------------------------------------- */
await section("1. 几何", async () => {
eq('多边形面积-正方形100', api.polygonArea([[0,0],[10,0],[10,10],[0,10]]), 100);
eq('多边形面积-三角形50', api.polygonArea([[0,0],[10,0],[0,10]]), 50);
eq('折线长度 3+4+5', api.polylineLength([[0,0],[3,0],[3,4],[3,9]]), 12);
eq('点在多边形内', api.pointInPolygon([1,1],[[0,0],[10,0],[10,10],[0,10]]), true);
eq('点在多边形外', api.pointInPolygon([11,1],[[0,0],[10,0],[10,10],[0,10]]), false);
approx('点到线段距离-在线上', api.distanceToSegment([5,0],[0,0],[10,0]), 0);
approx('点到线段距离-垂直3', api.distanceToSegment([0,3],[0,0],[10,0]), 3);
approx('点到线段距离-端点外', api.distanceToSegment([12,0],[0,0],[10,0]), 2);
eq('线段最近点-中点垂足', api.nearestPointOnSegment([5,3],[0,0],[10,0]), [5,0]);
eq('线段最近点-斜线段投影', api.nearestPointOnSegment([0,0],[10,0],[10,10]), [10,0]);
eq('线段最近点-端点外夹回端点', api.nearestPointOnSegment([12,0],[0,0],[10,0]), [10,0]);
eq('线段最近点-反向延长同样夹回', api.nearestPointOnSegment([-2,5],[0,0],[10,0]), [0,0]);
eq('线段最近点-退化线段取端点', api.nearestPointOnSegment([3,4],[7,7],[7,7]), [7,7]);
eq('线段相交', api.segmentsIntersect([0,0],[10,10],[0,10],[10,0]), true);
eq('线段不相交', api.segmentsIntersect([0,0],[1,0],[5,5],[6,5]), false);
eq('角度归一化', [api.normalizeAngle(-90), api.normalizeAngle(370)], [270, 10]);
approx('绕原点旋转90°', api.rotatePoint([1,0],[0,0],90)[1], 1, 1e-9);

});

/* 2. CRC32 标准向量 ------------------------------------------------------- */
await section("2. CRC32 标准向量", async () => {
eq('CRC32("123456789")=0xCBF43926', api.Zip.crc32(api.Zip.encodeUtf8('123456789')), 0xCBF43926);

});

/* 3. ZIP 往返 ------------------------------------------------------------- */
await section("3. ZIP 往返", async () => {
{
  const bin = new Uint8Array([0, 1, 2, 250, 255, 10, 31]);
  const buf = api.Zip.build([
    { name: '中文/文件.txt', text: '你好，世界\nHELLO' },
    { name: 'a/b.bin', bytes: bin }
  ]);
  const entries = await api.Zip.readEntries(buf);
  eq('ZIP 中文文件名条目', api.Zip.decodeUtf8(entries['中文/文件.txt']), '你好，世界\nHELLO');
  eq('ZIP 二进制条目保真', Array.from(entries['a/b.bin']), Array.from(bin));
  ok('ZIP 魔数头', new Uint8Array(buf)[0] === 0x50 && new Uint8Array(buf)[1] === 0x4b);
}

});

/* 4. XLSX 构建→读取双向往返 ---------------------------------------------- */
await section("4. XLSX 构建→读取双向往返", async () => {
{
  const C4=api.TABLE_COLUMNS;
  const r4=(m)=>C4.map((_,i)=>m[i]??'');
  const table = [
    C4,
    r4(['O0001', '监控,一号', '点设备', '摄像头', '默认图层', '1.5', '-2.25', '90', '', '', '', '', '', '', '', '0', '', '', '是', '否', '含"引号"\n换行', '2026-10-14T00:00:00Z']),
    r4(['O0002', '区域A', '矩形/区域', '普通区域', '默认图层', '0', '0', '0', '12.5', '3.5', '矩形', '', '', '', '', '0', '', '43.75', '是', '否', '', '2026-10-14T00:00:00Z']),
    r4(['O0003', '', '尺寸标注', '两点距离', '默认图层', '', '', '', '', '', '', '', '', '测距', '0,0;3,4;3,14', '3', '15', '', '是', '否', '', '2026-10-14T00:00:00Z'])
  ];
  const buf = api.Xlsx.build(table, '图纸标注');
  ok('XLSX 是 ZIP（PK 头）', new Uint8Array(buf)[0] === 0x50);
  const rows = await api.Xlsx.readRows(buf);
  eq('XLSX 往返行数', rows.length, 4);
  eq('XLSX 表头往返', rows[0], C4);
  eq('XLSX 含逗号/引号/换行单元格往返', rows[1][1], '监控,一号');
  eq('XLSX 备注引号换行往返', rows[1][20], '含"引号"\n换行');
  eq('XLSX 数字以文本往返', rows[2][9], '3.5');
  eq('XLSX 面积往返', rows[2][17], '43.75');
  eq('XLSX 测距类型往返', rows[3][13], '测距');
  eq('XLSX 节点坐标单元格往返', rows[3][14], '0,0;3,4;3,14');
  eq('XLSX 节点坐标解析3点', api.parseNodeCoords(rows[3][14]).length, 3);
  eq('列字母 A/Z/AA', [api.Xlsx.colLetter(0), api.Xlsx.colLetter(25), api.Xlsx.colLetter(26)], ['A', 'Z', 'AA']);
}

});

/* 5. CSV / TSV 解析 ------------------------------------------------------- */
await section("5. CSV / TSV 解析", async () => {
{
  const csv = '\ufeff编号,名称\nO0001,"含,逗号"\nO0002,"引号""内"\nO0003,"换行\n字段"\r\nO0004,普通';
  const rows = api.DSV.parseRows(csv, ',');
  eq('CSV BOM 去除', rows[0][0], '编号');
  eq('CSV 行数（含引号内换行）', rows.length, 5);
  eq('CSV 引号内逗号', rows[1][1], '含,逗号');
  eq('CSV 双引号转义', rows[2][1], '引号"内');
  eq('CSV 引号内换行', rows[3][1], '换行\n字段');
  eq('CSV CRLF 正常', rows[4], ['O0004', '普通']);
  eq('TSV 制表符分隔', api.DSV.parseRows('a\tb\n1\t2', '\t'), [['a', 'b'], ['1', '2']]);
  eq('分隔符自动探测-逗号', api.DSV.detectDelimiter('a,b,c\n1,2,3'), ',');
  eq('分隔符自动探测-制表', api.DSV.detectDelimiter('a\tb\tc\n'), '\t');
}

});

/* 6. XmlLite 直接断言 ----------------------------------------------------- */
await section("6. XmlLite 直接断言", async () => {
{
  const doc = api.XmlLite.parse('<root xmlns:r="http://x"><a r:id="r1" q="v&amp;w">文&amp;本</a><b><c>1</c><c>2</c></b></root>');
  const a = doc.getElementsByTagName('a')[0];
  eq('XmlLite 属性', a.getAttribute('q'), 'v&w');
  eq('XmlLite 命名空间属性', a.getAttribute('r:id'), 'r1');
  eq('XmlLite 文本实体', a.textContent, '文&本');
  eq('XmlLite 深度查询数量', doc.getElementsByTagName('c').length, 2);
  let threw = false;
  try { api.XmlLite.parse('<a><b></a></b>'); } catch (e) { threw = true; }
  eq('XmlLite 畸形标签报错', threw, true);
}

});

/* 7. 底图资产：内容寻址哈希 + dataURL 解码 -------------------------------- */
await section("7. 底图资产：内容寻址哈希 + dataURL 解码", async () => {
{
  const a = api.ContentAssets.idFor(new Uint8Array([1, 2, 3, 4]), 'bg');
  const b = api.ContentAssets.idFor(new Uint8Array([1, 2, 3, 4]), 'bg');
  const c = api.ContentAssets.idFor(new Uint8Array([1, 2, 3, 5]), 'bg');
  eq('资产哈希确定性', a, b);
  ok('资产哈希抗差异', a !== c);
  ok('资产 id 带前缀与长度', a.startsWith('bg') && a.endsWith('-4'));
  const png = btoa(String.fromCharCode(...Array.from({ length: 255 }, (_, i) => i % 256)));
  const bin = api.ContentAssets.dataUrlToBytes('data:image/png;base64,' + png);
  eq('dataURL mime 解析', bin.mime, 'image/png');
  eq('dataURL 字节长度', bin.bytes.length, 255);
  eq('dataURL 首尾字节', [bin.bytes[0], bin.bytes[254]], [0, 254]);
  eq('dataURL→哈希可重入', api.ContentAssets.idFor(bin.bytes, 'bg') === api.ContentAssets.idFor(bin.bytes, 'bg'), true);
}

});

/* 7.1 底图落盘不静默丢图（N-03） ------------------------------------------ */
await section("7.1 底图落盘：dataUrl 兜底与空底图", async () => {
{
  const st = api.resetState();
  st.background.kind = 'image';
  st.background.assetId = '';
  st.background.dataUrl = 'data:image/png;base64,AAAA';
  let out = api.persistableState();
  eq('N-03 无资产时保留 dataUrl 兜底', out.background.dataUrl, 'data:image/png;base64,AAAA');

  st.background.assetId = 'bg-abc-4';
  out = api.persistableState();
  eq('N-03 有资产时剥离 dataUrl', out.background.dataUrl === undefined, true);
  eq('N-03 有资产时保留 assetId', out.background.assetId, 'bg-abc-4');

  st.background = { kind: 'image', assetId: '', dataUrl: '', fileName: 'lost.png', width: 10, height: 10, metersPerPixel: 0.05 };
  out = api.persistableState();
  ok('N-03 既无资产也无数据不落空 image 底图', out.background.kind !== 'image');

  const st2 = api.resetState();
  st2.floors.push({ id: 'F2', name: '2F', background: { kind: 'image', assetId: '', dataUrl: 'data:image/png;base64,BBBB', width: 1, height: 1 }, objects: [] });
  const out2 = api.persistableState();
  eq('N-03 非当前楼层无资产时同样保留 dataUrl', out2.floors.find(f => f.id === 'F2').background.dataUrl, 'data:image/png;base64,BBBB');
}
});

/* 8. 表格导入规划与应用 --------------------------------------------------- */
await section("8. 表格导入规划与应用", async () => {
{
  const st = api.resetState();
  const p0 = api.baseObject('point');
  p0.name = 'O0001'; p0.x = 0; p0.y = 0;
  st.objects.push(p0);
  const C = api.TABLE_COLUMNS;
  const row = obj => C.map(k => obj[k] ?? '');
  const header = C.slice();
  const updateRow = row({ 编号: 'O0001', 对象类型: '点设备', 业务类型: '摄像头', 图层: '默认图层', X: '8.5', Y: '9.2', 角度: '45', 显示: '是', 锁定: '否' });
  const newPoint = row({ 编号: 'O0009', 对象类型: '点设备', 业务类型: '通用标记', X: '1', Y: '2' });
  const newRect = row({ 编号: 'O0010', 对象类型: '矩形/区域', X: '0', Y: '0', 宽度: '3', 高度: '4' });
  const badRect = row({ 编号: 'O0011', 对象类型: '矩形/区域', X: '0', Y: '0', 宽度: '0', 高度: '4' });
  const lineRow = row({ 编号: 'O0012', 对象类型: '线段/折线', X: '0', Y: '0' });
  const weirdRow = row({ 编号: 'O0013', 对象类型: '飞船', X: '0', Y: '0' });
  const emptyRow = C.map(() => '');
  const plan = api.rowsToObjectsPlan([header, updateRow, newPoint, newRect, badRect, lineRow, weirdRow, emptyRow]);
  eq('表格规划-更新数', plan.updates.length, 1);
  eq('表格规划-新建数', plan.creates.length, 2);
  ok('表格规划-零高矩形告警', plan.warnings.some(w => w.includes('O0011')));
  ok('表格规划-折线不可重建告警', plan.warnings.some(w => w.includes('O0012')));
  ok('表格规划-未知类型告警', plan.warnings.some(w => w.includes('飞船')));
  /* IO-P2-7：非严格模式布尔列未知值保留原值并告警，不再静默当“否” */
  const boolRow = row({ 编号: 'O0001', 对象类型: '点设备', X: '0', Y: '0', 显示: 'maybe', 锁定: '??? ' });
  const boolPlan = api.rowsToObjectsPlan([header, boolRow]);
  eq('布尔未知值-两条告警', boolPlan.warnings.filter(w => w.includes('无法识别')).length, 2);
  const visBefore = api.state.objects.find(o => o.name === 'O0001').visible;
  api.applyTableImport(boolPlan);
  eq('布尔未知值-显示保留原值', api.state.objects.find(o => o.name === 'O0001').visible, visBefore);
  api.applyTableImport(plan);
  const after = api.state;
  eq('应用后对象总数（原1+新增2）', after.objects.length, 3);
  const o1 = after.objects.find(o => o.name === 'O0001');
  approx('更新 X 生效', o1.x, 8.5);
  approx('更新 Y 生效', o1.y, 9.2);
  eq('更新业务类型生效', o1.typeId, 'point.camera');
  const o10 = after.objects.find(o => o.name !== 'O0001' && o.kind === 'rect');
  ok('矩形新建成功', !!o10 && o10.width === 3 && o10.height === 4);
  const allEmpty = api.rowsToObjectsPlan([header, emptyRow]);
  eq('全空数据行跳过且不告警', [allEmpty.updates.length, allEmpty.creates.length, allEmpty.warnings.length], [0, 0, 0]);
  const noHeader = api.rowsToObjectsPlan([['foo', 'bar'], ['1', '2']]);
  ok('无有效表头报错', noHeader.warnings.length === 1 && noHeader.updates.length === 0);
}

});

/* 8.1 B-08 原义：批量布点 + 条件批量替换（严格模式全有或全无） -------------------- */
await section("8.1 B-08 原义：批量布点 + 条件批量替换（严格模式全有或全无）", async () => {
{
  const st = api.resetState();
  const mk = (name, text, x, y) => {
    const o = api.baseObject('point', 'point.marker');
    o.name = name; o.text = text; o.x = x; o.y = y;
    st.objects.push(o); return o;
  };
  const A = mk('O0001', '旧A', 0, 0), B = mk('O0002', '旧B', 2, 0);
  const H = ['操作','编号','名称','对象类型','业务类型','图层','型号','安装高度','IP','责任人','X','Y','显示','锁定','备注','匹配编号','匹配名称','匹配名称包含','匹配对象类型','匹配业务类型','匹配图层'];
  const row = map => H.map(k => String(map[k] ?? ''));
  const plan = api.rowsToObjectsPlan([
    H,
    row({ 操作:'替换', 匹配业务类型:'通用标记', 名称:'新名称', 业务类型:'摄像头', 备注:'批量', 安装高度:'3' }),
    row({ 操作:'新增', 对象类型:'点设备', 业务类型:'摄像头', X:'10', Y:'20' }),
    row({ 操作:'更新', 编号:'O0001', X:'5', Y:'6' })
  ]);
  eq('B-08-严格模式识别', plan.strict, true);
  eq('B-08-替换命中对象数', plan.replaces.reduce((n,r)=>n+r.objs.length,0), 2);
  eq('B-08-新增行数', plan.creates.length, 1);
  eq('B-08-更新行数', plan.updates.length, 1);
  eq('B-08-严格模式无错误', plan.errors.length, 0);
  api.applyTableImport(plan);
  const objs = api.state.objects;
  eq('B-08-应用后对象数', objs.length, 3);
  ok('B-08-替换命中两台并改业务类型', A.typeId === 'point.camera' && B.typeId === 'point.camera');
  ok('B-08-替换名称生效', A.text === '新名称' && B.text === '新名称');
  ok('B-08-替换台账生效', A.props.mountHeight === 3 && A.props.note === '批量');
  approx('B-08-更新坐标X', A.x, 5);
  approx('B-08-更新坐标Y', A.y, 6);
  const created = objs.find(o => o.name !== 'O0001' && o.name !== 'O0002');
  ok('B-08-批量布点坐标可复算', !!created && created.x === 10 && created.y === 20);
  eq('B-08-新增业务类型', created && created.typeId, 'point.camera');

  /* 非法行：严格模式整批拒绝，apply 不改现有对象 */
  api.resetState();
  const st2 = api.state, keep = api.baseObject('point', 'point.marker');
  keep.name = 'O0100'; keep.x = 0; keep.y = 0; st2.objects.push(keep);
  const bad = api.rowsToObjectsPlan([H, row({ 操作:'更新', 编号:'O9999', X:'1', Y:'1' })]);
  ok('B-08-非法更新行报错', bad.errors.length >= 1);
  eq('B-08-非法计划无待更新', bad.updates.length, 0);
  api.applyTableImport(bad);
  eq('B-08-非法计划不修改对象', api.state.objects.length, 1);
  const badLedger = api.rowsToObjectsPlan([H, row({ 操作:'替换', 匹配图层:'默认图层', 安装高度:'abc' })]);
  ok('B-08-非法台账值报错', badLedger.errors.length >= 1);
  const noCond = api.rowsToObjectsPlan([H, row({ 操作:'替换', 名称:'X' })]);
  ok('B-08-替换缺少条件报错', noCond.errors.length >= 1);

  /* 公式防护引号往返：导出加引号 → 导入还原，不留字面单引号 */
  eq('B-08-公式引号还原', api.formulaUnguard("'=SUM(A1)"), '=SUM(A1)');
  eq('B-08-非公式引号保留', api.formulaUnguard("'123"), "'123");
  api.resetState();
  const st3 = api.state, p3 = api.baseObject('point', 'point.marker');
  p3.name = 'O0200'; p3.x = 0; p3.y = 0; st3.objects.push(p3);
  api.applyTableImport(api.rowsToObjectsPlan([['操作','匹配编号','名称'], ['替换','O0200',"'=cmd|calc"]]));
  eq('B-08-公式文本往返不变形', api.state.objects[0].text, '=cmd|calc');

  /* IO-P2-8：形状参数非法时保留原几何（X/Y/宽高都不动），不再半套更新 */
  api.resetState();
  api.state.objects.push(api.baseObject('rect', 'rect.area', { name: 'O0300', x: 1, y: 2, width: 5, height: 6, angle: 0 }));
  const badShapeRow = api.TABLE_COLUMNS.map(k => ({ 编号: 'O0300', 对象类型: '矩形/区域', 形状: '圆形', X: '99', Y: '98', 宽度: '0' }[k] ?? ''));
  const badShapePlan = api.rowsToObjectsPlan([api.TABLE_COLUMNS.slice(), badShapeRow]);
  ok('非法形状-规划告警', badShapePlan.warnings.some(w => w.includes('O0300') && w.includes('保留原几何')));
  api.applyTableImport(badShapePlan);
  const keepGeom = api.state.objects.find(o => o.name === 'O0300');
  eq('非法形状-几何不变', [keepGeom.x, keepGeom.y, keepGeom.width, keepGeom.height], [1, 2, 5, 6]);

  /* IO-P2-9：目标楼层 objects 非数组时拒绝该行，不回退当前层 */
  api.resetState();
  api.state.floors.push({ id: 'bad-floor', name: '异常层', objects: null });
  const badFloorPlan = api.rowsToObjectsPlan([['编号', '对象类型', 'X', 'Y', '楼层'], ['O0900', '点设备', '1', '1', '异常层']]);
  ok('异常楼层-规划告警', badFloorPlan.warnings.some(w => w.includes('对象数据异常')));
  eq('异常楼层-不新增', badFloorPlan.creates.length, 0);

  /* 大表（≥500 行）实测 */
  api.resetState();
  const big = [['对象类型','X','Y']];
  for (let i = 0; i < 500; i++) big.push(['点设备', String(i), String(i % 97)]);
  const t0 = Date.now();
  const bigPlan = api.rowsToObjectsPlan(big);
  const t1 = Date.now();
  api.applyTableImport(bigPlan);
  const t2 = Date.now();
  eq('B-08-500行全量新增', api.state.objects.length, 500);
  console.log('  [B-08] 500 行表格：规划 ' + (t1 - t0) + ' ms，应用 ' + (t2 - t1) + ' ms');
}

});

/* 9. 矢量场地模型 --------------------------------------------------------- */
await section("9. 矢量场地模型", async () => {
{
  eq('域-image 像素×mpp', api.siteDomainOf({kind:'image',width:1000,height:700,metersPerPixel:0.1}), {w:100,h:70});
  eq('域-rect 直接米', api.siteDomainOf({kind:'rect',shape:{type:'rect',w:12,h:8}}), {w:12,h:8});
  eq('域-circle 2r', api.siteDomainOf({kind:'circle',shape:{type:'circle',cx:30,cy:30,r:30}}), {w:60,h:60});
  eq('域-polygon 外接盒', api.siteDomainOf({kind:'polygon',shape:{type:'polygon',points:[[0,0],[20,0],[20,10],[0,10]]}}), {w:20,h:10});
  eq('域-缺省 rect 兜底', api.siteDomainOf({kind:'rect'}), {w:100,h:70});
  eq('矩形形状-对角规整', api.rectShapeFromCorners([2,3],[12,8]), {type:'rect',w:10,h:5});
  eq('圆形形状-圆心置于域中心', api.circleShapeFrom([100,100],25), {type:'circle',cx:25,cy:25,r:25});
  eq('多边形形状-平移到原点', api.polygonShapeFromPoints([[5,5],[25,5],[25,15]]), {type:'polygon',points:[[0,0],[20,0],[20,10]]});
  eq('场地中文名', [api.siteKindName('image'),api.siteKindName('circle')], ['图片底图','圆形场地']);
}

});

/* 10. 物理尺寸点设备命中（世界坐标） --------------------------------------- */
await section("10. 物理尺寸点设备命中（世界坐标）", async () => {
{
  api.resetState();
  api.state.viewport.zoom = 1;   // 经 getter 改闭包内 state（hitPhysicalPoint 读同一引用）
  const cam = {x:0,y:0,angle:0,phys:10,typeId:'point.camera'};
  const dome = {x:0,y:0,angle:0,phys:10,typeId:'point.dome'};
  const chg = {x:0,y:0,angle:0,phys:10,typeId:'point.charger'};
  const gate = {x:0,y:0,angle:0,phys:10,typeId:'point.gate'};
  /* sector fov=90 朝 +X */
  eq('扇形-内点(5,5)边界内', api.hitPhysicalPoint(cam,'sector',[5,5]), true);
  eq('扇形-背面点(-5,5)不在', api.hitPhysicalPoint(cam,'sector',[-5,5]), false);
  eq('扇形-超半径不在', api.hitPhysicalPoint(cam,'sector',[11,0]), false);
  eq('扇形-中心点在', api.hitPhysicalPoint(cam,'sector',[0,0]), true);
  const cam90 = Object.assign({}, cam, {angle:90});
  eq('扇形-旋转90后 +Y 在', api.hitPhysicalPoint(cam90,'sector',[0,5]), true);
  eq('扇形-旋转90后 +X 不在', api.hitPhysicalPoint(cam90,'sector',[5,0]), false);
  /* circle */
  eq('圆-半径内', api.hitPhysicalPoint(dome,'circle',[5,0]), true);
  eq('圆-半径外', api.hitPhysicalPoint(dome,'circle',[6,0]), false);
  /* square */
  eq('方-角点内', api.hitPhysicalPoint(chg,'square',[5,5]), true);
  eq('方-超出不在', api.hitPhysicalPoint(chg,'square',[5,6]), false);
  const chg90 = Object.assign({}, chg, {angle:90});
  eq('方-旋转后世界点在', api.hitPhysicalPoint(chg90,'square',[5,0]), true);
  /* bar */
  eq('杆-端点内', api.hitPhysicalPoint(gate,'bar',[5,0]), true);
  eq('杆-垂直方向近线在', api.hitPhysicalPoint(gate,'bar',[0,1]), true);
  eq('杆-过远不在', api.hitPhysicalPoint(gate,'bar',[0,9]), false);
  /* phys=0 不生效 */
  eq('零尺寸不命中物理', api.hitPhysicalPoint(Object.assign({},cam,{phys:0}),'sector',[5,5]), false);
}

});

/* 11. 旧工程迁移与清洗 ----------------------------------------------------- */
await section("11. 旧工程迁移与清洗", async () => {
{
  const legacy = {
    schema: 'offline-drawing-annotation/v1',
    meta: { name: '旧工程' },
    settings: { precision: 9, gridSize: -3 },
    background: { fileName: 'old.png', dataUrl: 'data:image/png;base64,' + btoa('PNG'), width: 500, height: 400, metersPerPixel: 0.2, calibrated: true },
    layers: [{ id: 'layer.default', name: '默认图层' }],
    objects: [
      { id: 'x1', kind: 'point', typeId: 'point.marker', name: 'P1', x: 1, y: 2 },
      { id: 'x2', kind: 'rect', typeId: 'rect.area', name: 'R1', x: 0, y: 0, width: 0, height: 5 },
      { id: 'x3', kind: 'line', typeId: 'line.custom', name: 'L1', points: [[0, 0]] },
      { kind: 'unknown', x: 0 }
    ]
  };
  const st = api.migrateProject(legacy);
  eq('迁移-精度钳制到6', st.settings.precision, 6);
  eq('迁移-网格间距回退默认', st.settings.gridSize, 1);
  eq('迁移-有图片引用判为 image', st.background.kind, 'image');
  eq('迁移-旧图片档不生成场地槽', st.site, null);
  eq('迁移-保留内嵌 dataUrl（待入资产库）', st.background.dataUrl.startsWith('data:image/png'), true);
  eq('迁移-合法点保留', st.objects.filter(o => o.name === 'P1').length, 1);
  eq('迁移-零宽矩形丢弃', st.objects.some(o => o.name === 'R1'), false);
  eq('迁移-单节点折线丢弃', st.objects.some(o => o.name === 'L1'), false);
  eq('迁移-未知类型丢弃', st.objects.length, 1);
  eq('迁移-点对象默认 phys=0', st.objects[0].phys, 0);
  eq('迁移-默认图层兜底', st.layers[0].id, 'layer.default');

  /* 无图片引用的旧空白档 → 矩形矢量场地（迁入独立 site 槽，图片槽置空） */
  const blank = api.migrateProject({ schema:'offline-drawing-annotation/v1',
    background: { width:1000, height:700, metersPerPixel:0.1 } });
  eq('迁移-空白档图片槽置空', blank.background.kind, 'empty');
  eq('迁移-空白档判为 rect', blank.site.kind, 'rect');
  eq('迁移-空白档形状域 100×70', [blank.site.shape.w, blank.site.shape.h], [100, 70]);

  /* 圆形场地清洗：保留实际圆心坐标（不再强制拉回域中心，便于「场地节点」编辑后重载还原） */
  const circ = api.migrateProject({ schema:'offline-drawing-annotation/v1',
    background: { kind:'circle', shape:{ type:'circle', r:20, cx:0, cy:0 } } });
  eq('迁移-圆形形状保留圆心', circ.site.shape, { type:'circle', cx:0, cy:0, r:20 });
  /* 缺省 cx/cy 时回退到域中心 r,r，与新建场地一致 */
  const circ2 = api.migrateProject({ schema:'offline-drawing-annotation/v1',
    background: { kind:'circle', shape:{ type:'circle', r:20 } } });
  eq('迁移-圆形缺省圆心回退域中心', [circ2.site.shape.cx, circ2.site.shape.cy], [20, 20]);

  /* 损坏的多边形（不足3点）回退矩形域 */
  const badPoly = api.migrateProject({ schema:'offline-drawing-annotation/v1',
    background: { kind:'polygon', shape:{ type:'polygon', points:[[0,0],[1,1]] }, width:2000, height:1000, metersPerPixel:0.1 } });
  eq('迁移-坏多边形回退矩形', badPoly.site.shape.type, 'rect');
  eq('迁移-回退域取像素推导 200×100', [badPoly.site.shape.w, badPoly.site.shape.h], [200, 100]);

  /* phys 清洗 + 自定义点类型 scaleShape/fov 保留 */
  const withPhys = api.migrateProject({ schema:'offline-drawing-annotation/v1',
    objectTypes: [{ id:'t1', kind:'point', name:'自定摄像', color:'#123456', scaleShape:'sector', fov:120 }],
    objects: [
      { id:'p1', kind:'point', typeId:'t1', name:'C1', x:1, y:1, phys:8.5 },
      { id:'p2', kind:'point', typeId:'t1', name:'C2', x:1, y:1, phys:-3 }
    ] });
  const t1 = withPhys.objectTypes.find(t => t.id === 't1');
  eq('迁移-自定义类型保留 scaleShape', t1.scaleShape, 'sector');
  eq('迁移-自定义类型保留 fov', t1.fov, 120);
  eq('迁移-正数 phys 保留', withPhys.objects.find(o=>o.name==='C1').phys, 8.5);
  eq('迁移-负 phys 归零', withPhys.objects.find(o=>o.name==='C2').phys, 0);
  eq('迁移-非法 scaleShape 丢弃', api.migrateProject({ schema:'offline-drawing-annotation/v1',
    objectTypes: [{ id:'t2', kind:'point', name:'X', color:'#123456', scaleShape:'weird' }] }).objectTypes.find(t=>t.id==='t2').scaleShape, undefined);
}

});

/* 12. 场地形状：默认值、规整、健壮性与描述文案 ----------------------------- */
await section("12. 场地形状：默认值、规整、健壮性与描述文案", async () => {
{
  /* 新建工程默认就是 100×70 的矩形矢量场地（独立 site 槽），图片槽为空 */
  const init = api.createInitialState();
  eq('初始图片槽为空', init.background.kind, 'empty');
  eq('初始场地 kind=rect', init.site.kind, 'rect');
  eq('初始场地形状', init.site.shape, { type:'rect', w:100, h:70 });
  api.resetState();
  eq('worldDims 取初始矩形域', api.worldDims(), { minX:0, minY:0, maxX:100, maxY:70, w:100, h:70 });

  /* 非法/非正尺寸一律回退默认（100×70）或最小下限，不能产生 NaN/0/负域 */
  eq('rect 域 w=0 回退100', api.siteDomainOf({kind:'rect',shape:{type:'rect',w:0,h:8}}), {w:100,h:8});
  eq('rect 域 负宽回退100', api.siteDomainOf({kind:'rect',shape:{type:'rect',w:-5,h:8}}), {w:100,h:8});
  eq('rect 域 字符串回退100', api.siteDomainOf({kind:'rect',shape:{type:'rect',w:'abc',h:8}}), {w:100,h:8});
  eq('rect 域 NaN 回退', api.siteDomainOf({kind:'rect',shape:{type:'rect',w:NaN,h:NaN}}), {w:100,h:70});
  eq('rect 域 缺 shape 回退默认', api.siteDomainOf({kind:'rect',shape:null}), {w:100,h:70});
  eq('rect 域 空背景默认', api.siteDomainOf({}), {w:100,h:70});
  eq('image 域 非正像素不塌缩', api.siteDomainOf({kind:'image',width:0,height:0,metersPerPixel:0.1}), {w:0.01,h:0.01});

  /* 对角拖拽：反向（右上→左下）与重合点（最小 0.05 下限） */
  eq('矩形规整-反向拖拽', api.rectShapeFromCorners([12,8],[2,3]), {type:'rect',w:10,h:5});
  eq('矩形规整-重合点保最小宽', api.rectShapeFromCorners([3,3],[3,3]), {type:'rect',w:0.05,h:0.05});

  /* 圆形：非法半径回退 0.05；域始终以 r 为边长、圆心在域中心 */
  eq('圆形规整-零半径下限', api.circleShapeFrom([0,0],0), {type:'circle',cx:0.05,cy:0.05,r:0.05});
  eq('圆形规整-负半径下限', api.circleShapeFrom([0,0],-10), {type:'circle',cx:0.05,cy:0.05,r:0.05});
  eq('圆形域-非法 r 回退50（域100）', api.siteDomainOf({kind:'circle',shape:{type:'circle',r:0}}), {w:100,h:100});

  /* 多边形：含负坐标点集先平移到第一象限，域随外接盒；不规则凹多边形也成立 */
  const shifted = api.polygonShapeFromPoints([[-5,-5],[5,-5],[5,5],[-5,5]]);
  eq('多边形规整-平移到原点', shifted, {type:'polygon',points:[[0,0],[10,0],[10,10],[0,10]]});
  eq('多边形域-平移后外接10×10', api.siteDomainOf({kind:'polygon',shape:shifted}), {w:10,h:10});
  const concave = api.polygonShapeFromPoints([[10,0],[0,0],[0,10],[5,5],[10,10]]);
  eq('凹多边形-首点即最小X', concave.points[0], [10,0]);
  eq('凹多边形-点数保留', concave.points.length, 5);

  /* 场地描述文案（统计/弹窗/报告共用），精度 2 位 */
  ok('描述-矩形含尺寸', api.siteDescription({kind:'rect',shape:{type:'rect',w:120,h:80}}).includes('矩形场地')
    && api.siteDescription({kind:'rect',shape:{type:'rect',w:120,h:80}}).includes('120.00×80.00'));
  ok('描述-图片含 m/px 与校准态', /图片底图[\s\S]*0\.20 m\/px[\s\S]*已校准/.test(
    api.siteDescription({kind:'image',fileName:'a.png',width:500,height:400,metersPerPixel:0.2,calibrated:true})));
  ok('描述-圆形含半径', api.siteDescription({kind:'circle',shape:{type:'circle',cx:30,cy:30,r:30}}).includes('半径 30.00'));
  ok('描述-多边形含边数', api.siteDescription({kind:'polygon',shape:{type:'polygon',points:[[0,0],[1,0],[1,1],[0,1]]}}).includes('4 条边'));
  eq('场地中文名覆盖四种', ['image','rect','circle','polygon'].map(api.siteKindName), ['图片底图','矩形场地','圆形场地','多边形场地']);
}

});

/* 13. 物理尺寸：缩放不变性、朝向覆盖、自定义视场、默认值 --------------------- */
await section("13. 物理尺寸：缩放不变性、朝向覆盖、自定义视场、默认值", async () => {
{
  api.resetState();
  /* 新建点对象默认纯位置（phys=0） */
  eq('baseObject 点 phys 默认 0', api.baseObject('point').phys, 0);

  /* 世界坐标命中与 zoom 无关：圆形覆盖在任何缩放级别同一世界点结果一致 */
  const dome = {x:0,y:0,angle:0,phys:10,typeId:'point.dome'};
  api.state.viewport.zoom = 1;
  eq('圆形 zoom=1 命中', api.hitPhysicalPoint(dome,'circle',[5,0]), true);
  api.state.viewport.zoom = 20;
  eq('圆形 zoom=20 同点仍命中（真实比例）', api.hitPhysicalPoint(dome,'circle',[5,0]), true);
  eq('圆形 zoom=20 域外仍不命中', api.hitPhysicalPoint(dome,'circle',[6,0]), false);

  /* 杆：zoom 越大，世界坐标拾取容差越小（视觉越精确），但杆本身长度不随 zoom 变 */
  const gate = {x:0,y:0,angle:0,phys:10,typeId:'point.gate'};
  api.state.viewport.zoom = 1;
  eq('杆 zoom=1 近线 1m 在（容差 8m）', api.hitPhysicalPoint(gate,'bar',[0,1]), true);
  api.state.viewport.zoom = 100;
  eq('杆 zoom=100 近线 1m 不在（容差 0.12m）', api.hitPhysicalPoint(gate,'bar',[0,1]), false);
  eq('杆 zoom=100 端点仍在（长度是世界值）', api.hitPhysicalPoint(gate,'bar',[5,0]), true);
  const gate90 = Object.assign({}, gate, {angle:90});
  api.state.viewport.zoom = 100;   // 收紧拾取容差到 0.12m，才能判定杆的轴向
  eq('杆旋转90°沿 Y 轴', api.hitPhysicalPoint(gate90,'bar',[0,5]), true);
  eq('杆旋转90°X 向无杆', api.hitPhysicalPoint(gate90,'bar',[5,0]), false);

  /* 扇形：朝向角周期性（450°≡90°）、视场边界对称性、fov=360 全覆盖 */
  const cam = {x:0,y:0,angle:0,phys:10,typeId:'point.camera'};
  eq('扇形 450°≡90° +Y 在', api.hitPhysicalPoint(Object.assign({},cam,{angle:450}),'sector',[0,5]), true);
  eq('扇形 450°≡90° +X 不在', api.hitPhysicalPoint(Object.assign({},cam,{angle:450}),'sector',[5,0]), false);
  eq('扇形 180°朝 -X 背面点在', api.hitPhysicalPoint(Object.assign({},cam,{angle:180}),'sector',[-5,0]), true);
  eq('扇形 180°朝 -X 正向点不在', api.hitPhysicalPoint(Object.assign({},cam,{angle:180}),'sector',[5,0]), false);
  eq('扇形 fov90 另一侧对称点在', api.hitPhysicalPoint(cam,'sector',[5,-5]), true);
  eq('扇形 恰在半径边界在（含等号）', api.hitPhysicalPoint(cam,'sector',[10,0]), true);
  eq('扇形 超半径 1 像素不在', api.hitPhysicalPoint(cam,'sector',[10.001,0]), false);

  /* 非法 phys：负数/NaN 一律退回纯位置 */
  eq('负 phys 不生效', api.hitPhysicalPoint(Object.assign({},cam,{phys:-5}),'sector',[5,5]), false);
  eq('NaN phys 不生效', api.hitPhysicalPoint(Object.assign({},cam,{phys:NaN}),'sector',[5,5]), false);

  /* 自定义类型 fov：360° 全向覆盖，背面点也在；非法 fov 回退 90° */
  api.state.objectTypes.push({id:'t.omni',kind:'point',name:'全向',color:'#123456',scaleShape:'sector',fov:360});
  const omni = {x:0,y:0,angle:0,phys:10,typeId:'t.omni'};
  eq('自定义 fov=360 背面点在', api.hitPhysicalPoint(omni,'sector',[-5,0]), true);
  eq('自定义 fov=360 超半径不在', api.hitPhysicalPoint(omni,'sector',[11,0]), false);
  api.state.objectTypes.push({id:'t.bad',kind:'point',name:'坏张角',color:'#123456',scaleShape:'sector',fov:'abc'});
  const badFov = {x:0,y:0,angle:0,phys:10,typeId:'t.bad'};
  eq('非法 fov 回退90° 背面不在', api.hitPhysicalPoint(badFov,'sector',[-5,5]), false);
  eq('非法 fov 回退90° 正面在', api.hitPhysicalPoint(badFov,'sector',[5,5]), true);

  /* 方形：45° 旋转后轴点按旋转框判定 */
  const chg45 = {x:0,y:0,angle:45,phys:10,typeId:'point.charger'};
  eq('方旋转45° 轴上5m 在', api.hitPhysicalPoint(chg45,'square',[5,0]), true);
  eq('方旋转45° 轴上8m 不在', api.hitPhysicalPoint(chg45,'square',[8,0]), false);
}

});

/* 14. 区域参数形状：面积/命中/采样/标签中心 ------------------------------- */
await section("14. 区域参数形状：面积/命中/采样/标签中心", async () => {
{
  const rect={kind:'rect',x:0,y:0,width:10,height:10,angle:0,shape:null};
  const circle={kind:'rect',x:0,y:0,shape:{type:'circle',r:10}};
  const ellipse={kind:'rect',x:0,y:0,angle:0,shape:{type:'ellipse',rx:10,ry:5}};
  const sector={kind:'rect',x:0,y:0,shape:{type:'sector',r:10,a0:0,a1:90}};
  eq('形状类型-缺省 rect', api.areaShapeType({shape:null}), 'rect');
  eq('形状类型-circle', api.areaShapeType(circle), 'circle');
  approx('面积-矩形 100', api.shapeArea(rect), 100);
  approx('面积-圆 r10=100π', api.shapeArea(circle), 100*Math.PI, 1e-9);
  approx('面积-椭圆 10×5=50π', api.shapeArea(ellipse), 50*Math.PI, 1e-9);
  approx('面积-90°扇形=25π', api.shapeArea(sector), 25*Math.PI, 1e-9);
  approx('面积-整圆扇形=100π', api.shapeArea({shape:{type:'sector',r:10,a0:0,a1:360}}), 100*Math.PI, 1e-9);

  /* 周长：矩形 2(w+h)；圆 2πr；椭圆退化为圆时=2πr；扇形=2r+弧长；整圆扇=圆周 */
  approx('周长-矩形 40', api.shapePerimeter(rect), 40, 1e-9);
  approx('周长-圆 20π', api.shapePerimeter(circle), 20*Math.PI, 1e-9);
  approx('周长-椭圆(a=b=10)退化圆', api.shapePerimeter({kind:'rect',x:0,y:0,shape:{type:'ellipse',rx:10,ry:10}}), 20*Math.PI, 1e-6);
  approx('周长-90°扇形 20+5π', api.shapePerimeter(sector), 20+5*Math.PI, 1e-9);
  approx('周长-整圆扇=20π', api.shapePerimeter({kind:'rect',x:0,y:0,shape:{type:'sector',r:10,a0:0,a1:360}}), 20*Math.PI, 1e-9);
  approx('周长-缺省角度扇形=整圆', api.shapePerimeter({kind:'rect',x:0,y:0,shape:{type:'sector',r:10}}), 20*Math.PI, 1e-9);
  approx('周长-零尺寸矩形为0', api.shapePerimeter({kind:'rect',x:0,y:0,width:0,height:0,shape:null}), 0, 1e-9);

  eq('扇形张角-普通 90', api.sectorSweep({a0:0,a1:90}), 90);
  eq('扇形张角-反向取模 270', api.sectorSweep({a0:90,a1:0}), 270);
  eq('扇形张角-零张角视为 360', api.sectorSweep({a0:30,a1:30}), 360);
  eq('扇形弧采样点数 seg+1', api.sectorArcPoints(0,0,10,0,90,12).length, 13);

  eq('圆形采样 72 顶点', api.shapeWorldPoints(circle).length, 72);
  eq('扇形首点为圆心', api.shapeWorldPoints(sector)[0], [0,0]);

  eq('命中-圆边界在', api.shapeHit(circle,[10,0]), true);
  eq('命中-圆外不在', api.shapeHit(circle,[10.01,0]), false);
  eq('命中-椭圆轴端在', api.shapeHit(ellipse,[0,-5]), true);
  eq('命中-椭圆短轴外不在', api.shapeHit(ellipse,[0,5.01]), false);
  eq('命中-椭圆内点(7,4)换算不在', api.shapeHit(ellipse,[7,4]), false);
  const ellipse90=Object.assign({},ellipse,{angle:90});
  eq('命中-椭圆旋转90后短轴到X', api.shapeHit(ellipse90,[5,0]), true);
  eq('命中-扇形内侧点', api.shapeHit(sector,[5,5]), true);
  eq('命中-扇形背面不在', api.shapeHit(sector,[-5,5]), false);
  eq('命中-扇形圆心在', api.shapeHit(sector,[0,0]), true);
  eq('命中-扇形超半径不在', api.shapeHit(sector,[10.01,0]), false);

  eq('标签中心-圆取锚点', api.shapeLabelCenter(circle), [0,0]);
  ok('参数文案-圆形含半径', api.areaParamText(circle).includes('圆形'));
  ok('参数文案-扇形含张角', api.areaParamText(sector).includes('90'));
}

});

/* 15. 区域形状互换：中心保持、等面积换算、角度保留 -------------------------- */
await section("15. 区域形状互换：中心保持、等面积换算、角度保留", async () => {
{
  /* 10×10 矩形（左下原点）→ 圆：面积 100 不变，圆心移到矩形中心 (5,5) */
  const o1={kind:'rect',x:0,y:0,width:10,height:10,angle:0,shape:null};
  api.convertAreaShape(o1,'circle');
  eq('换形-rect→circle 类型', o1.shape.type, 'circle');
  approx('换形-rect→circle 面积守恒', api.shapeArea(o1), 100, 1e-9);
  eq('换形-rect→circle 圆心居中', [Math.round(o1.x*1e6)/1e6,Math.round(o1.y*1e6)/1e6], [5,5]);

  /* 圆 r=10（面积 100π，中心 0,0）→ 矩形：边长 sqrt(100π)≈17.725，中心仍 (0,0) */
  const o2={kind:'rect',x:0,y:0,shape:{type:'circle',r:10}};
  const area2=api.shapeArea(o2);
  api.convertAreaShape(o2,'rect');
  eq('换形-circle→rect 清空 shape', o2.shape, null);
  approx('换形-circle→rect 面积守恒', api.shapeArea(o2), area2, 1e-9);
  approx('换形-circle→rect 中心 X 不变', o2.x+o2.width/2, 0, 1e-9);

  /* 圆 r=10 → 90°扇形：等面积 r=20；再回圆面积仍一致 */
  const o3={kind:'rect',x:0,y:0,shape:{type:'circle',r:10}};
  const area3=api.shapeArea(o3);
  api.convertAreaShape(o3,'sector');
  eq('换形-circle→sector 类型', o3.shape.type, 'sector');
  approx('换形-sector r=20', o3.shape.r, 20, 1e-9);
  approx('换形-circle→sector 面积守恒', api.shapeArea(o3), area3, 1e-9);
  api.convertAreaShape(o3,'circle');
  approx('换形-sector→circle 面积守恒', api.shapeArea(o3), area3, 1e-9);

  /* 椭圆 20×10 → 矩形：外接盒宽高 20×10 */
  const o4={kind:'rect',x:0,y:0,angle:0,shape:{type:'ellipse',rx:10,ry:5}};
  api.convertAreaShape(o4,'rect');
  approx('换形-ellipse→rect 取外接宽', o4.width, 20, 1e-9);
  approx('换形-ellipse→rect 取外接高', o4.height, 10, 1e-9);

  /* 矩形旋转 30° → 椭圆保留角度；未知形状忽略 */
  const o5={kind:'rect',x:0,y:0,width:12,height:6,angle:30,shape:null};
  api.convertAreaShape(o5,'ellipse');
  approx('换形-rect30→ellipse 保留角度', o5.angle, 30, 1e-9);
  approx('换形-ellipse 半轴 rx=6', o5.shape.rx, 6, 1e-9);
  const before=JSON.stringify(o5);
  api.convertAreaShape(o5,'star');
  eq('换形-未知形状忽略', JSON.stringify(o5), before);
}

});

/* 16. 点设备图标倍率：三层连乘与钳制（屏幕语义，与 zoom 无关） ------------- */
await section("16. 点设备图标倍率：三层连乘与钳制（屏幕语义，与 zoom 无关）", async () => {
{
  api.resetState();
  const st=api.state;
  st.settings.markerScale=1;
  const p=api.baseObject('point','point.marker',{x:0,y:0});
  eq('倍率-默认 1', api.pointIconScale(p), 1);
  st.settings.markerScale=1.5; p.iconSize=2;
  approx('倍率-全局1.5×对象2', api.pointIconScale(p), 3, 1e-9);
  st.objectTypes.find(t=>t.id==='point.marker').iconSize=1.5;
  approx('倍率-三层连乘 4.5', api.pointIconScale(p), 4.5, 1e-9);
  st.settings.markerScale=10; p.iconSize=10;
  eq('倍率-上限钳制 8', api.pointIconScale(p), 8);
  st.settings.markerScale=0.1; p.iconSize=0.1;
  st.objectTypes.find(t=>t.id==='point.marker').iconSize=1;
  eq('倍率-下限钳制 .2', api.pointIconScale(p), .2);
  st.settings.markerScale=1;
}

});

/* 17. 椭圆/扇形矢量场地：构造、域、描述、迁移清洗 -------------------------- */
await section("17. 椭圆/扇形矢量场地：构造、域、描述、迁移清洗", async () => {
{
  /* 包围盒两角点 → 中心在域中心 */
  eq('椭圆场地-角点规整', api.ellipseShapeFromCorners([0,0],[20,10]),
    {type:'ellipse',cx:10,cy:5,rx:10,ry:5,angle:0});
  eq('椭圆场地-反向角点', api.ellipseShapeFromCorners([20,10],[0,0]),
    {type:'ellipse',cx:10,cy:5,rx:10,ry:5,angle:0});
  eq('椭圆域-2rx×2ry', api.siteDomainOf({kind:'ellipse',shape:{type:'ellipse',cx:10,cy:5,rx:10,ry:5}}), {w:20,h:10});

  /* 第一象限扇形（0–90°，圆心原点）：弧点 x,y∈[0,10]，域 10×10，不平移 */
  const s1=api.sectorShapeFrom([0,0],10,0,90);
  eq('扇形场地-第一象限圆心', [s1.cx,s1.cy], [0,0]);
  eq('扇形场地-域 10×10', api.siteDomainOf({kind:'sector',shape:s1}), {w:10,h:10});

  /* 圆心 (5,5) 同扇形：整体平移到第一象限，圆心归 0，域不变 */
  const s2=api.sectorShapeFrom([5,5],10,0,90);
  eq('扇形场地-圆心平移归零', [s2.cx,s2.cy], [0,0]);
  eq('扇形场地-平移后域 10×10', api.siteDomainOf({kind:'sector',shape:s2}), {w:10,h:10});

  /* 180–270°（左下象限）圆心原点：弧点 x,y∈[-10,0]，平移后圆心到 (10,10) */
  const s3=api.sectorShapeFrom([0,0],10,180,270);
  approx('扇形场地-负象限平移后圆心X', s3.cx, 10, 1e-9);
  approx('扇形场地-负象限平移后圆心Y', s3.cy, 10, 1e-9);
  const d3=api.siteDomainOf({kind:'sector',shape:s3});
  approx('扇形场地-负象限域宽', d3.w, 10, 1e-9);
  approx('扇形场地-负象限域高', d3.h, 10, 1e-9);

  /* 非法半径/角度兜底 */
  eq('扇形场地-零半径下限', api.sectorShapeFrom([0,0],0,0,90).r, 0.05);
  eq('扇形场地-缺省张角 90', api.sectorSweep(api.sectorShapeFrom([0,0],10)), 90);

  eq('场地中文名-六种', ['image','rect','circle','ellipse','sector','polygon'].map(api.siteKindName),
    ['图片底图','矩形场地','圆形场地','椭圆场地','扇形场地','多边形场地']);
  ok('描述-椭圆含两半径', api.siteDescription({kind:'ellipse',shape:{type:'ellipse',cx:10,cy:5,rx:10,ry:5,angle:0}}).includes('10.00×5.00'));
  ok('描述-扇形含半径张角', /扇形场地[\s\S]*半径 10\.00[\s\S]*90°/.test(
    api.siteDescription({kind:'sector',shape:s1})));
}

});

/* 18. 迁移：区域参数形状、点 iconSize、全局倍率、自定义类型图标大小 --------- */
await section("18. 迁移：区域参数形状、点 iconSize、全局倍率、自定义类型图标大小", async () => {
{
  /* 圆形/椭圆/扇形区域对象往返 */
  const m1=api.migrateProject({ schema:'offline-drawing-annotation/v1',
    objects:[
      { id:'c1', kind:'rect', typeId:'rect.area', name:'C1', x:5, y:5, shape:{type:'circle',r:12} },
      { id:'e1', kind:'rect', typeId:'rect.area', name:'E1', x:0, y:0, shape:{type:'ellipse',rx:8,ry:4} },
      { id:'s1', kind:'rect', typeId:'rect.area', name:'S1', x:0, y:0, shape:{type:'sector',r:10,a0:0,a1:270} },
      { id:'bad', kind:'rect', typeId:'rect.area', name:'BAD', x:0, y:0, shape:{type:'circle',r:0}, width:4, height:5 }
    ]});
  const C1=m1.objects.find(o=>o.name==='C1');
  eq('迁移-圆形区域保留', C1.shape, {type:'circle',r:12});
  eq('迁移-圆形区域清空宽高', [C1.width,C1.height], [0,0]);
  const E1=m1.objects.find(o=>o.name==='E1');
  eq('迁移-椭圆区域保留', E1.shape, {type:'ellipse',rx:8,ry:4});
  const S1=m1.objects.find(o=>o.name==='S1');
  eq('迁移-扇形区域保留张角', [S1.shape.type,S1.shape.a0,S1.shape.a1], ['sector',0,270]);
  ok('迁移-非法圆形不残留 shape', m1.objects.every(o=>o.name!=='BAD' || !o.shape));

  /* 点对象 iconSize 钳制 .5–3 */
  const m2=api.migrateProject({ schema:'offline-drawing-annotation/v1',
    objects:[
      { id:'i1', kind:'point', typeId:'point.marker', name:'I1', x:0, y:0, iconSize:2 },
      { id:'i2', kind:'point', typeId:'point.marker', name:'I2', x:0, y:0, iconSize:99 },
      { id:'i3', kind:'point', typeId:'point.marker', name:'I3', x:0, y:0, iconSize:-4 }
    ]});
  eq('迁移-iconSize 合法保留', m2.objects.find(o=>o.name==='I1').iconSize, 2);
  eq('迁移-iconSize 上限 3', m2.objects.find(o=>o.name==='I2').iconSize, 3);
  eq('迁移-iconSize 下限 .5', m2.objects.find(o=>o.name==='I3').iconSize, .5);

  /* 全局点大小倍率钳制 .5–2.5，缺省 1 */
  eq('迁移-markerScale 缺省 1', api.migrateProject({schema:'offline-drawing-annotation/v1'}).settings.markerScale, 1);
  eq('迁移-markerScale 过大钳 2.5', api.migrateProject({schema:'offline-drawing-annotation/v1',settings:{markerScale:9}}).settings.markerScale, 2.5);
  eq('迁移-markerScale 过小钳 .5', api.migrateProject({schema:'offline-drawing-annotation/v1',settings:{markerScale:0}}).settings.markerScale, .5);

  /* 十字准星/段长度开关：旧档缺省为 true，显式 false 保留 */
  const dflt=api.migrateProject({schema:'offline-drawing-annotation/v1'}).settings;
  eq('迁移-十字开关缺省开', dflt.showCursor, true);
  eq('迁移-段长开关缺省开', dflt.showSegLen, true);
  const off=api.migrateProject({schema:'offline-drawing-annotation/v1',settings:{showCursor:false,showSegLen:false}}).settings;
  eq('迁移-十字关闭保留', off.showCursor, false);
  eq('迁移-段长关闭保留', off.showSegLen, false);

  /* 自定义点类型 iconSize 保留，越界丢弃 */
  const m3=api.migrateProject({ schema:'offline-drawing-annotation/v1',
    objectTypes:[
      { id:'big', kind:'point', name:'大点', color:'#123456', iconSize:2.5 },
      { id:'huge', kind:'point', name:'超大点', color:'#123456', iconSize:99 }
    ]});
  eq('迁移-类型 iconSize 保留', m3.objectTypes.find(t=>t.id==='big').iconSize, 2.5);
  eq('迁移-类型非法 iconSize 丢弃', m3.objectTypes.find(t=>t.id==='huge').iconSize, undefined);

  /* 椭圆/扇形场地迁移 */
  const m4=api.migrateProject({ schema:'offline-drawing-annotation/v1',
    background:{ kind:'ellipse', shape:{type:'ellipse',rx:30,ry:15} } });
  eq('迁移-椭圆场地 kind', m4.site.kind, 'ellipse');
  eq('迁移-椭圆场地形状', [m4.site.shape.rx,m4.site.shape.ry,m4.site.shape.cx,m4.site.shape.cy], [30,15,30,15]);
  const m5=api.migrateProject({ schema:'offline-drawing-annotation/v1',
    background:{ kind:'sector', shape:{type:'sector',cx:0,cy:0,r:20,a0:0,a1:90} } });
  eq('迁移-扇形场地 kind', m5.site.kind, 'sector');
  eq('迁移-扇形场地半径', m5.site.shape.r, 20);
  eq('迁移-扇形场地域', [api.siteDomainOf(m5.site).w,api.siteDomainOf(m5.site).h], [20,20]);

  /* 坏椭圆场地回退矩形（不产生非法域） */
  const m6=api.migrateProject({ schema:'offline-drawing-annotation/v1',
    background:{ kind:'ellipse', shape:{type:'ellipse',rx:0,ry:0} } });
  eq('迁移-坏椭圆回退矩形形状', m6.site.shape.type, 'rect');

  /* 测距链：subtype=ruler 保留；非法 subtype 回退 distance；ruler 至少 2 点，单点丢弃 */
  const m7=api.migrateProject({ schema:'offline-drawing-annotation/v1',
    objects:[
      { id:'r1', kind:'dimension', typeId:'dim.custom', name:'R1', x:0, y:0, subtype:'ruler',
        points:[[0,0],[3,4],[3,14]] },
      { id:'r2', kind:'dimension', typeId:'dim.custom', name:'R2', x:0, y:0, subtype:'bogus',
        points:[[0,0],[1,1]] },
      { id:'r3', kind:'dimension', typeId:'dim.custom', name:'R3', x:0, y:0, subtype:'ruler',
        points:[[0,0]] }
    ]});
  const R1=m7.objects.find(o=>o.name==='R1');
  eq('迁移-测距链子类型保留', R1.subtype, 'ruler');
  eq('迁移-测距链3点保留', R1.points.length, 3);
  eq('迁移-测距链首点同步锚点', [R1.x,R1.y], [0,0]);
  eq('迁移-非法子类型回退 distance', m7.objects.find(o=>o.name==='R2').subtype, 'distance');
  eq('迁移-单点测距链丢弃', m7.objects.some(o=>o.name==='R3'), false);

  /* 面积图签开关：旧档缺省开，显式关闭保留 */
  eq('迁移-面积图签缺省开', api.migrateProject({schema:'offline-drawing-annotation/v1'}).settings.showAreaTag, true);
  eq('迁移-面积图签关闭保留', api.migrateProject({schema:'offline-drawing-annotation/v1',settings:{showAreaTag:false}}).settings.showAreaTag, false);
}

});

/* 19. 区域基点：面板设置 (o.x,o.y) 与渲染/命中同基准，允许负值 ---------------- */
await section("19. 区域基点：面板设置 (o.x,o.y) 与渲染/命中同基准，允许负值", async () => {
{
  api.resetState();
  const field=(k,v)=>({dataset:{field:k}, value:String(v), type:'number', checked:false});
  const noop=()=>{};

  /* 圆形：基点=圆心，改基点后命中判定立刻跟随同一基准 */
  const c=api.baseObject('rect','rect.area',{x:10,y:10,shape:{type:'circle',r:5}});
  eq('基点-初始圆心在圆内', api.shapeHit(c,[10,10]), true);
  api.applyField(field('x',20),c,noop);
  api.applyField(field('y',20),c,noop);
  eq('基点-设置圆心 X', c.x, 20);
  eq('基点-设置圆心 Y', c.y, 20);
  eq('基点-旧圆心已在圆外', api.shapeHit(c,[10,10]), false);
  eq('基点-新圆心在圆内', api.shapeHit(c,[20,20]), true);
  eq('基点-半径不随移动改变', c.shape.r, 5);

  /* 基点允许负值（可在场地外，与拖拽移动一致），非法输入归零 */
  api.applyField(field('x',-12.5),c,noop);
  eq('基点-负坐标保留', c.x, -12.5);
  api.applyField(field('y','abc'),c,noop);
  eq('基点-非法输入归零', c.y, 0);

  /* 矩形：基点=第一角点；尺寸字段仍被钳为非负 */
  const r=api.baseObject('rect','rect.area',{x:0,y:0,width:8,height:4});
  api.applyField(field('x',-3),r,noop);
  eq('基点-矩形负基点保留', r.x, -3);
  api.applyField(field('width',-9),r,noop);
  eq('基点-矩形宽度仍非负', r.width, 0);

  /* 基点修改不破坏形状对象引用（圆仍可正常换算面积） */
  approx('基点-移动后圆面积不变', api.shapeArea(c), 25*Math.PI, 1e-9);
}

});

/* 20. 折线节点编辑：坐标修改、插入、删除、最小点数与锚点同步 ----------------- */
await section("20. 折线节点编辑：坐标修改、插入、删除、最小点数与锚点同步", async () => {
{
  const mk=closed=>api.baseObject('line','line.custom',{points:[[0,0],[10,0],[10,10]],closed:!!closed,x:0,y:0});

  /* 最小节点数：开放 2 / 闭合 3 */
  eq('节点-开放折线最小2点', api.lineMinNodes(mk(false)), 2);
  eq('节点-闭合区域最小3点', api.lineMinNodes(mk(true)), 3);

  /* 修改坐标：允许负值；首点修改同步锚点；非法值拒绝 */
  const l1=mk(false);
  eq('节点-改节点1 Y', api.setNodeCoord(l1,1,'y',-5), true);
  eq('节点-负值写入', l1.points[1][1], -5);
  eq('节点-非节点对象拒改', api.setNodeCoord({},0,'x',1), false);
  eq('节点-越界索引拒改', api.setNodeCoord(l1,9,'x',1), false);
  eq('节点-非法数字拒改', api.setNodeCoord(l1,0,'x','abc'), false);
  eq('节点-非法时原值保留', l1.points[0][0], 0);
  api.setNodeCoord(l1,0,'x',3);
  eq('节点-首点同步锚点 X', l1.x, 3);

  /* 中间插入：在 #1 后插中点 (10,5)，点数 4，位置索引 2 */
  const l2=mk(false);
  eq('节点-插入返回成功', api.insertLineNode(l2,1,[10,5]), true);
  eq('节点-插入后点数', l2.points.length, 4);
  eq('节点-插入点坐标', l2.points[2], [10,5]);
  /* 末尾节点后插入=追加 */
  eq('节点-末点后追加', api.insertLineNode(l2,3,[20,20]), true);
  eq('节点-追加在末尾', l2.points[4], [20,20]);
  /* 非折线对象不能插 */
  eq('节点-非折线拒插', api.insertLineNode({kind:'rect'},0,[1,1]), false);

  /* 删除：开放折线 3 点可删 1 个；2 点时再删被拒 */
  const l3=mk(false);
  eq('节点-删除成功', api.removeLineNode(l3,1), true);
  eq('节点-删除后点数', l3.points.length, 2);
  eq('节点-删除后剩余点正确', l3.points[1], [10,10]);
  eq('节点-2点拒绝再删', api.removeLineNode(l3,0), false);
  eq('节点-拒绝后点数不变', l3.points.length, 2);

  /* 闭合 3 点不允许删除；插入后可删；删首点后锚点跟随新首点 */
  const l4=mk(true);
  eq('节点-闭合3点拒删', api.removeLineNode(l4,2), false);
  api.insertLineNode(l4,0,[0,5]);           // #1 后插入，新点成 #2
  eq('节点-闭合插入后4点', l4.points.length, 4);
  eq('节点-闭合插入位置', l4.points[1], [0,5]);
  eq('节点-闭合4点可删', api.removeLineNode(l4,0), true);
  eq('节点-删首点后锚点同步 X', l4.x, l4.points[0][0]);
  eq('节点-删首点后锚点同步 Y', l4.y, l4.points[0][1]);
  eq('节点-闭合态保持', l4.closed, true);

  /* 节点编辑器 HTML：列表需跨满属性面板两列（否则坐标输入框被压进标签列只剩几十像素） */
  const eh=api.renderNodeEditor(mk(false));
  ok('节点编辑器-列表跨满整行', eh.includes('class="node-list span2"'));
  ok('节点编辑器-含坐标输入框', eh.includes('data-node-axis="x"') && eh.includes('data-node-axis="y"'));
}

});

/* 21. 节点排序：move/step 语义、越界保护、锚点同步 -------------------------- */
await section("21. 节点排序：move/step 语义、越界保护、锚点同步", async () => {
{
  const mk=()=>api.baseObject('line','line.custom',{points:[[0,0],[1,1],[2,2],[3,3]],x:0,y:0});

  /* #0 与 #1 交换（上移到头被拒）；下移同理 */
  const l1=mk();
  eq('排序-首节点不能上移', api.moveNodeStep(l1,0,-1), false);
  eq('排序-拒绝后顺序不变', l1.points.map(p=>p[0]).join(','), '0,1,2,3');
  eq('排序-#1 上移', api.moveNodeStep(l1,1,-1), true);
  eq('排序-#1 上移后顺序', l1.points.map(p=>p[0]).join(','), '1,0,2,3');
  eq('排序-末节点不能下移', api.moveNodeStep(l1,3,1), false);

  /* move：#0 移到 #2 位置（1,0,2,3 → 1,2,0,3），其余相对顺序保持 */
  const l2=mk();
  eq('排序-move 成功', api.moveNode(l2,0,2), true);
  eq('排序-move 后序列', l2.points.map(p=>p[0]).join(','), '1,2,0,3');
  eq('排序-move 非法参数拒绝', api.moveNode(l2,1,9), false);
  eq('排序-move 同位拒绝', api.moveNode(l2,1,1), false);
  eq('排序-move 拒绝后序列不变', l2.points.map(p=>p[0]).join(','), '1,2,0,3');

  /* 排序后首点变化同步锚点 */
  const l3=mk();
  api.moveNode(l3,2,0);
  eq('排序-新首点同步锚点', [l3.x,l3.y], [2,2]);
  eq('排序-新首点位于首位', l3.points[0], [2,2]);

  /* 非折线对象不能排序 */
  eq('排序-非折线拒绝', api.moveNode({kind:'rect'},0,1), false);
}

});

/* 22. 静态资源引用完整性：index.html 引用的本地文件都必须真实存在 ------------- */
await section("22. 静态资源引用完整性：index.html 引用的本地文件都必须真实存在", async () => {
{
  const exists = rel => { try { readFileSync(join(root, rel)); return true; } catch { return false; } };
  const referenced = [...html.matchAll(/(?:src|href)="(?!https?:|data:|#)([^"]+)"/g)].map(m => m[1]);
  ok('静态-存在本地引用（脚本/样式/图标/manifest）', referenced.length >= 16);
  const missing = referenced.filter(r => !exists(r.split('?')[0]));
  eq('静态-全部本地引用可达', missing, []);
  ok('静态-icon.svg 存在', exists('icon.svg'));
  ok('静态-manifest.webmanifest 存在', exists('manifest.webmanifest'));
  ok('静态-标题含图钉品牌', /图钉 PlotPin/.test(html));
}

});

/* 23. Shift 精确约束：正交/极轴/正方形（预览与落点共用纯函数） ---------------- */
await section("23. Shift 精确约束：正交/极轴/正方形（预览与落点共用纯函数）", async () => {
{
  /* 正交：主导分量为 X 时钳为水平（Y 回到基点）；主导为 Y 时钳为垂直 */
  eq('正交-水平(右)', api.orthoPoint([0,0],[8,2],true), [8,0]);
  eq('正交-水平(左)', api.orthoPoint([0,0],[-8,-2],true), [-8,0]);
  eq('正交-垂直(上)', api.orthoPoint([5,5],[6,12],true), [5,12]);
  eq('正交-垂直(下)', api.orthoPoint([5,5],[4,-9],true), [5,-9]);
  eq('正交-45°等分量取水平(含等号)', api.orthoPoint([0,0],[5,5],true), [5,0]);
  eq('正交-不按Shift透传', api.orthoPoint([0,0],[8,2],false), [8,2]);
  eq('正交-无基点透传', api.orthoPoint(null,[8,2],true), [8,2]);

  /* 极轴 45° 吸附：半径保持，角度钳到最近的 45° 倍 */
  eq('极轴-20°→0°', api.polarSnap45([0,0],[10*Math.cos(20*Math.PI/180),10*Math.sin(20*Math.PI/180)],true).map(v=>Math.round(v*1e6)), [10000000,0]);
  const p90=api.polarSnap45([0,0],[0,10],true);
  approx('极轴-70°→90° X≈0', p90[0], 0, 1e-9);
  approx('极轴-70°→90° Y=10', p90[1], 10, 1e-9);
  eq('极轴-120°→135°', (()=>{const p=api.polarSnap45([0,0],[10*Math.cos(120*Math.PI/180),10*Math.sin(120*Math.PI/180)],true);return [Math.round(p[0]*1e6),Math.round(p[1]*1e6)];})(),
    [Math.round(10*Math.cos(135*Math.PI/180)*1e6),Math.round(10*Math.sin(135*Math.PI/180)*1e6)]);
  const c=[3,4], snapped=api.polarSnap45(c,[13,9],true);
  approx('极轴-吸附后到圆心半径不变', Math.hypot(snapped[0]-c[0],snapped[1]-c[1]), Math.hypot(10,5), 1e-9);
  eq('极轴-不按Shift透传', api.polarSnap45([0,0],[3,1],false), [3,1]);

  /* 正方形角点：边长=主导位移，方向符号保留 */
  eq('正方形-右下拉正', api.squareCorner([0,0],[8,3],true), [8,8]);
  eq('正方形-右下拉正(Y主导)', api.squareCorner([0,0],[3,8],true), [8,8]);
  eq('正方形-左上符号保留', api.squareCorner([10,10],[2,4],true), [2,2]);
  eq('正方形-不按Shift透传', api.squareCorner([0,0],[8,3],false), [8,3]);
  eq('正方形-零位移透传', api.squareCorner([0,0],[0,0],true), [0,0]);
}

});

/* 24. 对象捕捉 OSNAP：候选收集、阈值命中、自身排除、类型齐全 ------------------ */
await section("24. 对象捕捉 OSNAP：候选收集、阈值命中、自身排除、类型齐全", async () => {
{
  api.resetState();
  const st=api.state;
  /* 开放折线 3 点：3 个端点 + 2 个中点 */
  const line=api.baseObject('line','line.custom',{points:[[0,0],[10,0],[10,10]],x:0,y:0});
  /* 圆形区域：1 圆心 + 4 象限点 */
  const circ=api.baseObject('rect','rect.area',{x:30,y:30,shape:{type:'circle',r:5}});
  /* 点设备：1 端点 */
  const pt=api.baseObject('point','point.marker',{x:50,y:50});
  st.objects.push(line,circ,pt);

  const cands=api.collectSnapCandidates(st);
  eq('捕捉-候选总数 3+2+1+4+1=11 + 场地4角=15', cands.length, 15);
  eq('捕捉-类型标签中文', api.OSNAP_LABELS.midpoint, '中点');

  const byType=t=>cands.filter(c=>c.type===t).length;
  eq('捕捉-端点数 折线3+点1+场地4角=8', byType('endpoint'), 8);
  eq('捕捉-中点数 2', byType('midpoint'), 2);
  eq('捕捉-圆心率 1', byType('center'), 1);
  eq('捕捉-象限点数 4', byType('quadrant'), 4);

  /* 线段中点 (5,0) 与 (10,5) */
  ok('捕捉-含第一段中点', cands.some(c=>c.type==='midpoint'&&c.p[0]===5&&c.p[1]===0));
  ok('捕捉-含第二段中点', cands.some(c=>c.type==='midpoint'&&c.p[0]===10&&c.p[1]===5));
  /* 圆象限点 (35,30)/(25,30)/(30,35)/(30,25) */
  [[35,30],[25,30],[30,35],[30,25]].forEach(q=>{
    ok('捕捉-圆象限点 '+q.join(), cands.some(c=>c.type==='quadrant'&&Math.abs(c.p[0]-q[0])<1e-9&&Math.abs(c.p[1]-q[1])<1e-9));
  });
  ok('捕捉-圆心(30,30)', cands.some(c=>c.type==='center'&&c.p[0]===30&&c.p[1]===30));

  /* 阈值命中：鼠标世界点在阈值内被吸到候选；阈值外返回 null */
  const hit1=api.findOsnap(st,[10.3,0.2],0.5);
  ok('捕捉-近端点击中端点', hit1&&hit1.type==='endpoint'&&hit1.p[0]===10&&hit1.p[1]===0);
  eq('捕捉-空旷处无命中', api.findOsnap(st,[80,80],0.5), null);
  /* 同时靠近端点与中点时取更近者 */
  const hit2=api.findOsnap(st,[10,0.2],0.5);
  ok('捕捉-取最近候选', hit2&&hit2.p[0]===10&&hit2.p[1]===0);

  /* 排除自身：拖折线节点时不吸到自己的特征点（避免抖动），但能吸到别的对象 */
  const excl=new Set([line.id]);
  eq('捕捉-排除自身后原端点不命中', api.findOsnap(st,[10.3,0.2],0.5,excl), null);
  const hit3=api.findOsnap(st,[30,30.2],0.5,excl);
  ok('捕捉-排除自身仍可吸其他对象(圆心)', hit3&&hit3.type==='center'&&hit3.p[0]===30);

  /* 闭合多边形：n 个节点产生 n 个中点（含闭合边） */
  const poly=api.baseObject('line','line.custom',{closed:true,points:[[0,0],[10,0],[10,10],[0,10]],x:0,y:0});
  const st2=api.createInitialState(); st2.objects.push(poly);
  eq('捕捉-闭合区域中点含闭合边=4', api.collectSnapCandidates(st2).filter(c=>c.type==='midpoint').length, 4);

  /* 不可见对象不提供候选 */
  const st3=api.createInitialState();
  const hidden=api.baseObject('point','point.marker',{x:0,y:0,visible:false});
  st3.objects.push(hidden);
  eq('捕捉-隐藏点无候选', api.collectSnapCandidates(st3,o=>o.visible!==false).filter(c=>c.id===hidden.id).length, 0);

  /* Tab 类型锁定：仅命中指定类型，其余类型即使更近也被过滤 */
  const hitF1=api.findOsnap(st,[5.1,0.1],0.5,null,null,'midpoint');
  ok('锁定中点-命中第一段中点', hitF1&&hitF1.type==='midpoint'&&hitF1.p[0]===5&&hitF1.p[1]===0);
  eq('锁定端点-中点位置不命中', api.findOsnap(st,[5.1,0.1],0.5,null,null,'endpoint'), null);
  /* 锁定圆心：(30,30.2) 只命中圆心；锁定端点时同位置无端点候选 → null */
  const hitF2=api.findOsnap(st,[30,30.2],0.5,null,null,'center');
  ok('锁定圆心-命中', hitF2&&hitF2.type==='center'&&hitF2.p[0]===30);
  eq('锁定端点-圆心位置不命中', api.findOsnap(st,[30,30.2],0.5,null,null,'endpoint'), null);
  /* 锁定类型不放宽阈值：远处无该类型候选时返回 null */
  eq('锁定象限-空旷处无命中', api.findOsnap(st,[80,80],0.5,null,null,'quadrant'), null);
}

});

/* 25. 捕捉扩展：象限点/垂足/跨对象交点/切点 ------------------------------- */
await section("25. 捕捉扩展：象限点/垂足/跨对象交点/切点", async () => {
{
  api.resetState();
  const st=api.state;
  /* 两条跨对象相交的水平线/竖直线：y=10 与 x=15 交于 (15,10)；
     两线都取不对称长度，使中点不落在交点，保证交点被独立识别 */
  const hLine=api.baseObject('line','line.custom',{points:[[0,10],[40,10]],x:0,y:10});
  const vLine=api.baseObject('line','line.custom',{points:[[15,0],[15,40]],x:15,y:0});
  /* 圆心 (40,10) r=5；点 (40,20) 在圆外，其切线切点之一在圆上 */
  const circ=api.baseObject('rect','rect.area',{x:40,y:10,shape:{type:'circle',r:5}});
  st.objects.push(hLine,vLine,circ);

  /* 象限点：圆上 0/90/180/270 四个方向点单独成类 */
  const quads=api.collectSnapCandidates(st).filter(c=>c.type==='quadrant');
  eq('象限-圆4个象限点', quads.length, 4);
  [[45,10],[35,10],[40,15],[40,5]].forEach(q=>{
    ok('象限-含 '+q.join(), quads.some(c=>Math.hypot(c.p[0]-q[0],c.p[1]-q[1])<1e-9));
  });
  const hitQ=api.findOsnap(st,[45.15,10.1],0.3);
  ok('象限-右点被捕捉', hitQ&&hitQ.type==='quadrant'&&Math.abs(hitQ.p[0]-45)<1e-9);

  /* 垂足：取 (25,14) 到水平线 y=10 的垂足 (25,10)，垂距 4 < tol 5；
     避开中点(20,10)与交点(15,10)，保证独立命中垂足 */
  const hitP=api.findOsnap(st,[25,14],5);
  ok('垂足-命中线段', hitP&&hitP.type==='perpendicular'&&hitP.p[0]===25&&hitP.p[1]===10);
  /* 垂足夹到线段端点内：x=-5 超出水平线起点，垂足夹回端点 (0,10)，归为端点类型（端点优先） */
  const hitP2=api.findOsnap(st,[-5,10.2],6);
  ok('垂足-超出夹回端点', hitP2&&hitP2.type==='endpoint'&&hitP2.p[0]===0);

  /* 跨对象交点：(15,10)，交点优先级高于垂足（鼠标偏离 0.17 仍命中交点而非线上垂足） */
  const allEdges=api.collectSnapEdges(st);
  eq('交点-两条线各1边共2', allEdges.length, 2);
  const hitI=api.findOsnap(st,[15.12,10.12],0.3);
  ok('交点-跨对象命中 '+JSON.stringify(hitI), hitI&&hitI.type==='intersection'&&hitI.p[0]===15&&hitI.p[1]===10);
  /* 同对象线段交点不算：单独一条 V 形折线自身节点不产生交点候选 */
  const st2=api.createInitialState();
  st2.objects.push(api.baseObject('line','line.custom',{points:[[0,0],[10,10],[0,20]],x:0,y:0}));
  eq('交点-同对象自身不产交点', api.collectSnapCandidates(st2).filter(c=>c.type==='intersection').length, 0);

  /* 切点（径向语义）：鼠标在圆周外侧贴近时，捕捉到圆心→鼠标方向与圆周交点。
     取 30° 方向、半径外 0.3 的查询点 (40+5.3cos30°, 10+5.3sin30°)，
     切点应为 (40+5cos30°, 10+5sin30°)，距查询点恰为 0.3 */
  const tAng=30*Math.PI/180;
  const tangentPoint=[40+5*Math.cos(tAng),10+5*Math.sin(tAng)];
  const nearOutside=[40+5.3*Math.cos(tAng),10+5.3*Math.sin(tAng)];
  const hitT=api.findOsnap(st,nearOutside,0.6);
  ok('切点-贴近圆周命中 tangent', hitT&&hitT.type==='tangent');
  approx('切点-径向圆周点 X', hitT&&hitT.p[0], tangentPoint[0], 1e-9);
  approx('切点-径向圆周点 Y', hitT&&hitT.p[1], tangentPoint[1], 1e-9);
  approx('切点-在圆周上', hitT&&Math.hypot(hitT.p[0]-40,hitT.p[1]-10), 5, 1e-9);
  /* 切线方向（圆在该点的切线⊥半径）：切点与圆心连线斜率已知，切线点积为 0 */
  approx('切点-半径⊥切线方向', hitT&&((hitT.p[0]-40)*(-Math.sin(tAng))+(hitT.p[1]-10)*Math.cos(tAng)), 0, 1e-9);
  /* 圆内靠近中心的点不产生切点（径向圆上点距离≈r，超出小容差） */
  const st3=api.createInitialState();
  st3.objects.push(circ);
  const none=api.findOsnap(st3,[40,11],0.5);
  ok('切点-圆心附近无切点', !none||none.type!=='tangent');

  /* 边收集：每条开放折线 1 边，两条共 2；圆不产生采样边（由切点/圆心/象限覆盖） */
  eq('边-两条折线共2边', api.collectSnapEdges(st).filter(e=>hLine.id===e.id||vLine.id===e.id).length, 2);
  eq('边-圆不产生采样边', api.collectSnapEdges(st).filter(e=>e.id===circ.id).length, 0);
  eq('边-矩形4直边', (function(){
    const s=api.createInitialState();
    s.objects.push(api.baseObject('rect','rect.area',{x:0,y:0,width:10,height:10}));
    return api.collectSnapEdges(s).length;
  })(), 4);
  eq('边-圆曲线收集1个', api.collectSnapCircles(st).length, 1);
}

});

/* 25b. 捕捉包围盒预筛等价性（N-22） ----------------------------------------- */
await section("25b. 捕捉包围盒预筛等价性", async () => {
{
  api.resetState();
  const st=api.state;
  const mk=(kind,typeId,props)=>api.baseObject(kind,typeId,props);
  st.objects.push(
    mk('point','point.marker',{x:5,y:5}),
    mk('text','text.label',{x:9,y:7,text:'A'}),
    mk('line','line.custom',{x:0,y:12,points:[[0,12],[20,12],[20,24]]}),
    mk('line','line.custom',{x:30,y:2,points:[[30,2],[40,2],[36,9]],closed:true}),
    mk('rect','rect.area',{x:50,y:5,width:8,height:6}),
    mk('rect','rect.area',{x:60,y:20,width:10,height:4,angle:31}),
    mk('rect','rect.area',{x:70,y:30,width:12,height:9,shape:{type:'parallelogram',skew:0.5}}),
    mk('rect','rect.area',{x:20,y:40,shape:{type:'circle',r:6}}),
    mk('rect','rect.area',{x:45,y:45,shape:{type:'ellipse',rx:7,ry:3},angle:20}),
    mk('rect','rect.area',{x:70,y:55,shape:{type:'sector',r:9,a0:10,sweep:120}})
  );
  api.applyVectorSite('polygon', api.polygonShapeFromPoints([[0,0],[30,0],[30,25],[0,25]]));
  api.clearGuideLines();
  api.addGuideLine([2,28],[28,32]);
  const vis=o=>o.visible!==false;
  const inP=(p,b)=>p[0]>=b.minX&&p[0]<=b.maxX&&p[1]>=b.minY&&p[1]<=b.maxY;
  const hitId=(id,b)=>{
    if(id==='site') return null;
    const o=st.objects.find(x=>x.id===id);
    return o?api.boundsIntersect(api.objectSnapBounds(o),b):false;
  };
  const boxes=[
    {minX:44,minY:4,maxX:56,maxY:10},{minX:18,minY:38,maxX:26,maxY:46},
    {minX:58,minY:18,maxX:68,maxY:26},{minX:28,minY:0,maxX:42,maxY:12},
    {minX:66,minY:52,maxX:76,maxY:60},{minX:0,minY:10,maxX:25,maxY:26},
    {minX:100,minY:100,maxX:110,maxY:110}
  ];
  const fullC=api.collectSnapCandidates(st,vis);
  const fullE=api.collectSnapEdges(st,vis);
  const fullO=api.collectSnapCircles(st,vis);
  boxes.forEach((b,i)=>{
    eq('预筛-候选集等价 box'+i, api.collectSnapCandidates(st,vis,b),
       fullC.filter(c=>c.id==='site'?inP(c.p,b):hitId(c.id,b)));
    eq('预筛-边集等价 box'+i, api.collectSnapEdges(st,vis,b),
       fullE.filter(e=>e.guide||hitId(e.id,b)));
    eq('预筛-圆集等价 box'+i, api.collectSnapCircles(st,vis,b),
       fullO.filter(c=>hitId(c.id,b)));
  });

  /* 端到端：测试内保留一份“不过滤”的全量实现作为 oracle，逐点比对新版 findOsnap */
  const PRIO={endpoint:0,midpoint:1,quadrant:1,center:1,intersection:2,perpendicular:3,tangent:4};
  const cr=(ax,ay,bx,by)=>ax*by-ay*bx;
  const segInt=(a,b,c,d)=>{
    const rx=b[0]-a[0], ry=b[1]-a[1], sx=d[0]-c[0], sy=d[1]-c[1];
    const den=cr(rx,ry,sx,sy);
    if(Math.abs(den)<1e-12) return null;
    const t=cr(c[0]-a[0],c[1]-a[1],sx,sy)/den, u=cr(c[0]-a[0],c[1]-a[1],rx,ry)/den;
    if(t<0||t>1||u<0||u>1) return null;
    return [a[0]+t*rx,a[1]+t*ry];
  };
  const brute=(raw,tol,excludeIds,typeFilter)=>{
    let best=null,bd=tol;
    const consider=(p,type,id)=>{
      if(typeFilter&&type!==typeFilter) return;
      const dd=Math.hypot(p[0]-raw[0],p[1]-raw[1]);
      if(dd>tol) return;
      if(!best||(PRIO[type]??9)<(PRIO[best.type]??9)||((PRIO[type]??9)===(PRIO[best.type]??9)&&dd<bd)){
        bd=dd; best={p:[p[0],p[1]],type,id};
      }
    };
    fullC.forEach(c=>{ if(excludeIds&&c.id&&excludeIds.has(c.id)) return; consider(c.p,c.type,c.id); });
    const box={minX:raw[0]-tol,maxX:raw[0]+tol,minY:raw[1]-tol,maxY:raw[1]+tol};
    const near=fullE.filter(e=>!(
      Math.max(e.a[0],e.b[0])<box.minX||Math.min(e.a[0],e.b[0])>box.maxX||
      Math.max(e.a[1],e.b[1])<box.minY||Math.min(e.a[1],e.b[1])>box.maxY));
    for(let i=0;i<near.length;i++) for(let j=i+1;j<near.length;j++){
      const e1=near[i],e2=near[j];
      if(e1.id===e2.id) continue;
      if(excludeIds&&excludeIds.has(e1.id)&&excludeIds.has(e2.id)) continue;
      const sh=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1])<1e-9;
      if(sh(e1.a,e2.a)||sh(e1.a,e2.b)||sh(e1.b,e2.a)||sh(e1.b,e2.b)) continue;
      const ip=segInt(e1.a,e1.b,e2.a,e2.b);
      if(ip) consider(ip,'intersection',e1.id+'|'+e2.id);
    }
    near.forEach(e=>{ if(excludeIds&&excludeIds.has(e.id)) return; consider(api.nearestPointOnSegment(raw,e.a,e.b),'perpendicular',e.id); });
    fullO.forEach(c=>{
      if(excludeIds&&excludeIds.has(c.id)) return;
      const dx=raw[0]-c.c[0], dy=raw[1]-c.c[1], D=Math.hypot(dx,dy);
      if(D<1e-9) return;
      consider([c.c[0]+c.r*dx/D,c.c[1]+c.r*dy/D],'tangent',c.id);
    });
    return best;
  };
  const sameHit=(a,b)=>{
    if(!a||!b) return !a&&!b;
    return a.type===b.type&&a.id===b.id&&Math.abs(a.p[0]-b.p[0])<1e-9&&Math.abs(a.p[1]-b.p[1])<1e-9;
  };
  const excl=new Set([st.objects[2].id,st.objects[4].id]);
  let seed=1234567;
  const rnd=()=>((seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff);
  let diffs=0;
  for(let i=0;i<200;i++){
    const raw=[-10+rnd()*110,-10+rnd()*110];
    const tol=[0.4,2,6][i%3];
    if(!sameHit(api.findOsnap(st,raw,tol),brute(raw,tol))) diffs++;
    if(!sameHit(api.findOsnap(st,raw,tol,excl,vis),brute(raw,tol,excl))) diffs++;
    if(!sameHit(api.findOsnap(st,raw,tol,null,vis,'endpoint'),brute(raw,tol,null,'endpoint'))) diffs++;
    if(!sameHit(api.findOsnap(st,raw,tol,null,vis,'tangent'),brute(raw,tol,null,'tangent'))) diffs++;
  }
  eq('预筛-findOsnap 200点×4变体逐点一致', diffs, 0);
  api.clearGuideLines();
}

});

/* 26. 测距链(ruler)：可编辑性、节点操作、长度/面积语义 ---------------------- */
await section("26. 测距链(ruler)：可编辑性、节点操作、长度/面积语义", async () => {
{
  api.resetState();
  const ruler=api.baseObject('dimension','dimension.distance',{subtype:'ruler',points:[[0,0],[3,4],[3,14]],x:0,y:0});
  const distDim=api.baseObject('dimension','dimension.distance',{subtype:'distance',points:[[0,0],[6,8]]});
  const areaDim=api.baseObject('dimension','dimension.distance',{subtype:'area',points:[[0,0],[10,0],[0,10]]});
  const angleDim=api.baseObject('dimension','dimension.distance',{subtype:'angle',points:[[0,0],[10,0],[0,10]]});
  const line=api.baseObject('line','line.custom',{points:[[0,0],[1,1]]});

  /* 仅开放折线与测距链可增删拖拽节点；其余标注类型不可 */
  eq('测距-链可编辑', api.isPolylineEditable(ruler), true);
  eq('测距-折线可编辑', api.isPolylineEditable(line), true);
  eq('测距-两点距离不可编辑', api.isPolylineEditable(distDim), false);
  eq('测距-面积标注不可编辑', api.isPolylineEditable(areaDim), false);
  eq('测距-角度标注不可编辑', api.isPolylineEditable(angleDim), false);
  eq('测距-点设备不可编辑', api.isPolylineEditable({kind:'point'}), false);
  eq('测距-最小2点', api.lineMinNodes(ruler), 2);

  /* 测距链节点操作与折线完全同一套，且首点变更同步基点 */
  eq('测距-中段插入', api.insertLineNode(ruler,1,[10,10]), true);
  eq('测距-插入后4点', ruler.points.length, 4);
  eq('测距-插入后锚点不变', [ruler.x,ruler.y], [0,0]);
  eq('测距-末点不可再删(2点下限)', (function(){
    const r2=api.baseObject('dimension','dimension.distance',{subtype:'ruler',points:[[0,0],[3,4]],x:0,y:0});
    return api.removeLineNode(r2,0);
  })(), false);
  eq('测距-重排节点', api.moveNode(ruler,0,2), true);
  approx('测距-重排后锚点跟随新首点X', ruler.x, ruler.points[0][0]);
  approx('测距-重排后锚点跟随新首点Y', ruler.y, ruler.points[0][1]);

  /* 长度：3-4-5 链 = 5+10=15，开放不闭合；面积恒 0 */
  const r3=api.baseObject('dimension','dimension.distance',{subtype:'ruler',points:[[0,0],[3,4],[3,14]],x:0,y:0});
  approx('测距-总长15', api.objectLength(r3), 15, 1e-9);
  eq('测距-面积恒0', api.objectArea(r3), 0);
  /* 面积标注的面积取自其节点多边形 */
  approx('测距-面积标注=50', api.objectArea(areaDim), 50, 1e-9);
  eq('测距-两点距离无面积', api.objectArea(distDim), 0);
}

});

/* 27. 面积/长度统计：区域四形状、闭合折线、开放折线、点设备 ------------------- */
await section("27. 面积/长度统计：区域四形状、闭合折线、开放折线、点设备", async () => {
{
  const rect={kind:'rect',x:0,y:0,width:10,height:10,shape:null};
  const circle={kind:'rect',x:0,y:0,shape:{type:'circle',r:5}};
  const square={kind:'line',closed:true,points:[[0,0],[10,0],[10,10],[0,10]]};
  const tri={kind:'line',closed:true,points:[[0,0],[10,0],[0,10]]};
  const open={kind:'line',closed:false,points:[[0,0],[3,4],[3,14]]};
  approx('统计-矩形面积100', api.objectArea(rect), 100);
  approx('统计-圆面积25π', api.objectArea(circle), 25*Math.PI, 1e-9);
  approx('统计-闭合方形100', api.objectArea(square), 100);
  approx('统计-闭合三角50', api.objectArea(tri), 50);
  eq('统计-开放折线无面积', api.objectArea(open), 0);
  eq('统计-点设备无面积', api.objectArea({kind:'point',x:0,y:0,phys:5}), 0);
  /* 长度：开放链 15；闭合方形含闭合边 40；三角 10+10+10√2；无节点对象 0 */
  approx('统计-开放链长15', api.objectLength(open), 15, 1e-9);
  approx('统计-闭合周长40', api.objectLength(square), 40, 1e-9);
  approx('统计-三角周长', api.objectLength(tri), 20+10*Math.SQRT2, 1e-9);
  eq('统计-点设备长度0', api.objectLength({kind:'point'}), 0);
}

});

/* 28. 表格导入导出往返：节点坐标/闭合/形状/标注类型新列 + CSV 引号往返 -------- */
await section("28. 表格导入导出往返：节点坐标/闭合/形状/标注类型新列 + CSV 引号往返", async () => {
{
  /* 28.1 节点坐标编解码：负坐标、空白/分号、容错 */
  eq('节点码-编码', api.formatNodeCoords([[0,0],[3.5,-2],[10,4]]), '0.00,0.00;3.50,-2.00;10.00,4.00');
  const parsed=api.parseNodeCoords('0,0; 3.5, -2 ;10/4');
  eq('节点码-解析3点', parsed.length, 3);
  approx('节点码-负值解析', parsed[1][1], -2);
  approx('节点码-斜杠分隔', parsed[2][0], 10);
  eq('节点码-空文本', api.parseNodeCoords('').length, 0);
  eq('节点码-坏段跳过', api.parseNodeCoords('0,0;a,b;5,6').length, 2);
  eq('节点码-单点丢弃', api.parseNodeCoords('1,2;3').length, 1);
  /* CSV 中含逗号的整格被引号包裹后可无损往返 */
  const cell=api.csvCell('0,0;3,4;10,4',',');
  ok('节点码-CSV自动加引号', cell.startsWith('"')&&cell.endsWith('"'));
  const reparsed=api.parseRowsStub(['a,b',cell+',x'].join('\n'),',');
  eq('节点码-CSV引号往返字段数', reparsed[1].length, 2);
  eq('节点码-CSV引号内容保持', reparsed[1][0].trim(), '0,0;3,4;10,4');

  /* 28.1b CSV/TSV 公式注入防护（审计 P1-3）：危险前缀加单引号，纯数字原样 */
  eq('公式-等号加前缀', api.csvCell('=1+2',','), "'=1+2");
  eq('公式-加号加前缀', api.csvCell('+cmd|calc',','), "'+cmd|calc");
  eq('公式-减号非数字加前缀', api.csvCell('-cmd|calc',','), "'-cmd|calc");
  eq('公式-At 加前缀', api.csvCell('@SUM(A1)',','), "'@SUM(A1)");
  eq('公式-制表符加前缀', api.csvCell('\tX',','), "'\tX");
  eq('公式-HYPERLINK 加前缀并成对转义', api.csvCell('=HYPERLINK("http://x","y")',','), '"\'=HYPERLINK(""http://x"",""y"")"');
  eq('公式-负数保持数值', api.csvCell('-12.5',','), '-12.5');
  ok('公式-坐标列表不被加前缀', !api.csvCell('-1.00,-2.00;3.00,4.00',',').includes("'"));
  eq('公式-整表写出同样防护', api.DSV.formatRows([['=cmd|calc','-2']],{delimiter:',',eol:'\n',bom:false,guardFormula:api.formulaGuard}), "'=cmd|calc,-2");
  /* IO-P2-1：表头与数据行共用 quoteCell，列名含分隔符/引号/危险前缀时同样转义 */
  const hdrText=api.delimitedFromTable([['a,b','c"d','=x'],['1','2','3']],',').replace(/^\ufeff/,'');
  eq('CSV 表头与数据行同一转义', api.DSV.parseRows(hdrText,',')[0], ['a,b','c"d',"'=x"]);
  /* IO-P2-2：台账 CSV/TSV 统一 CRLF */
  eq('CSV/TSV 换行统一 CRLF', api.delimitedFromTable([['a','b'],['1','2']],',').replace(/^\ufeff/,''), 'a,b\r\n1,2');
  /* IO-P2-4：字面单引号 + 公式前缀可逆，导出加一层、导入剥一层 */
  const litFormula="'=SUM(A1)";
  const litBack=api.formulaUnguard(api.DSV.parseRows(api.delimitedFromTable([['名称'],[litFormula]],',').replace(/^\ufeff/,''),',')[1][0]);
  eq('字面单引号公式文本往返不变', litBack, litFormula);
  eq('危险前缀仍按公式去引号', api.formulaUnguard("'=SUM(A1)"), '=SUM(A1)');
  /* 真实导出路径：编号/备注危险前缀被加引号，负坐标保持数值语义 */
  const fst=api.resetState();
  fst.objects.push(api.baseObject('point','point.marker',{name:'=cmd|calc',x:-12.5,y:3,props:{note:'@SUM(1)'}}));
  const csvText=api.delimitedText(',');
  ok('公式-导出路径给编号加前缀', csvText.includes("'=cmd|calc"));
  ok('公式-导出路径给备注加前缀', csvText.includes("'@SUM(1)"));
  ok('公式-导出路径负坐标不加前缀', csvText.includes('-12.5'));

  /* 28.2 导出行包含全部新列 */
  const st=api.resetState();
  st.objects.push(
    api.baseObject('line','line.custom',{name:'L1',closed:true,points:[[0,0],[10,0],[10,10],[0,10]],x:0,y:0}),
    api.baseObject('dimension','dimension.distance',{name:'R1',subtype:'ruler',points:[[1,1],[4,5]],x:1,y:1}),
    api.baseObject('rect','rect.area',{name:'C1',x:30,y:30,shape:{type:'circle',r:5}}),
    api.baseObject('rect','rect.area',{name:'S1',x:0,y:0,shape:{type:'sector',r:10,a0:30,a1:120}}),
    api.baseObject('point','point.marker',{name:'P1',x:1,y:2})
  );
  const rows=api.objectRows(); const byCode=Object.fromEntries(rows.map(r=>[r.编号,r]));
  eq('导出-闭合列', byCode['L1']['闭合'], '是');
  ok('导出-闭合折线节点坐标', byCode['L1']['节点坐标'].startsWith('0.00,0.00;10.00,0.00'));
  eq('导出-测距标注类型', byCode['R1']['标注类型'], '测距');
  ok('导出-测距节点坐标', byCode['R1']['节点坐标'].includes('4.00,5.00'));
  eq('导出-圆形形状列', byCode['C1']['形状'], '圆形');
  eq('导出-圆形直径列', byCode['C1']['宽度'], '10.00');
  eq('导出-扇形形状列', byCode['S1']['形状'], '扇形');
  eq('导出-扇形起止角', byCode['S1']['形状参数'], '30,120');
  eq('导出-点设备无闭合列', byCode['P1']['闭合'], '');
  eq('导出-点设备无节点坐标列', byCode['P1']['节点坐标'], '');
  ok('导出-列头含全部新列', ['形状','形状参数','闭合','标注类型','节点坐标'].every(k=>api.TABLE_COLUMNS.includes(k)));
}

});

/* 28.3 导出字段表 + 行渲染器单一来源（B-08）：列/台账/参数/读数/盲区属性同源 */
await section("28.3 导出字段表 + 行渲染器单一来源（B-08）：列/台账/参数/读数/盲区属性同源", async () => {
{
  const D=api.EXPORT_FIELD_DEFS;
  eq('字段表-表格列与字段表一致', api.TABLE_COLUMNS.join(','), D.filter(f=>f.table).map(f=>f.key).join(','));
  eq('字段表-台账映射唯一来源', JSON.stringify(api.LEDGER_FIELDS), JSON.stringify([['型号','model'],['安装高度','mountHeight'],['IP','ip'],['责任人','owner']]));
  const keys=new Set(D.map(f=>f.key));
  ok('字段表-PDF列均来自字段表', api.PDF_COLS.every(([k])=>keys.has(k)));
  ok('字段表-报告列均来自字段表', api.REPORT_LIST_COLS.every(k=>keys.has(k)));
  eq('字段表-PDF列序保持', api.PDF_COLS.map(([k])=>k).join(','), '编号,名称,对象类型,业务类型,图层,X,Y,参数,长度,面积');
  eq('字段表-报告列序保持', api.REPORT_LIST_COLS.join(','), '编号,对象类型,业务类型,图层,X,Y,参数');

  const st=api.resetState();
  const mk=(kind,type,name)=>{ const o=api.baseObject(kind,type,{name}); o.updatedAt='2026-01-01T00:00:00.000Z'; return o; };
  const rect=mk('rect','rect.area','R1'); api.applyRowShape(rect,'矩形',{x:0,y:0,w:10,h:6,angle:0,params:[]});
  const circle=mk('rect','rect.area','C1'); api.applyRowShape(circle,'圆形',{x:0,y:0,w:10,h:0,angle:0,params:[]});
  const sector=mk('rect','rect.area','S1'); api.applyRowShape(sector,'扇形',{x:0,y:0,w:10,h:0,angle:0,params:[30,120]});
  const para=mk('rect','rect.area','G1'); api.applyRowShape(para,'平行四边形',{x:0,y:0,w:8,h:4,angle:0,params:[30]});
  const closed=mk('line','line.custom','L1'); Object.assign(closed,{points:[[0,0],[10,0],[10,10],[0,10]],closed:true});
  const open=mk('line','line.custom','L2'); Object.assign(open,{points:[[0,0],[10,0],[10,10]],closed:false});
  const ruler=mk('dimension','dimension.distance','D1'); Object.assign(ruler,{subtype:'ruler',points:[[0,0],[3,4],[3,9]]});
  const distDim=mk('dimension','dimension.distance','D2'); Object.assign(distDim,{subtype:'distance',points:[[0,0],[6,8]]});
  const areaDim=mk('dimension','dimension.distance','D3'); Object.assign(areaDim,{subtype:'area',points:[[0,0],[10,0],[10,10],[0,10]]});
  const angDim=mk('dimension','dimension.distance','D4'); Object.assign(angDim,{subtype:'angle',points:[[0,0],[10,0],[0,10]]});
  st.objects.push(rect,circle,sector,para,closed,open,ruler,distDim,areaDim,angDim);
  const rows=Object.fromEntries(api.objectRows().map(r=>[r['编号'],r]));

  ok('字段表-行含全部键', D.every(f=>f.key in rows['R1']));
  eq('字段表-矩形参数', rows['R1']['参数'], '矩形');
  eq('字段表-圆形参数', rows['C1']['参数'], '圆形');
  eq('字段表-圆形宽度取外接盒', rows['C1']['宽度'], '10.00');
  eq('字段表-扇形参数', rows['S1']['参数'], '扇形 30,120');
  eq('字段表-平行四边形参数', rows['G1']['参数'], '平行四边形 30');
  eq('字段表-闭合折线参数', rows['L1']['参数'], '闭合');
  eq('字段表-开放折线参数', rows['L2']['参数'], '');
  eq('字段表-测距参数', rows['D1']['参数'], ' 测距');
  eq('字段表-面积标注参数', rows['D3']['参数'], ' 面积');

  eq('字段表-XLSX表头同源', api.xlsxExportTable()[0].join(','), api.TABLE_COLUMNS.join(','));
  ok('字段表-XLSX单元格均为字符串', api.xlsxExportTable().slice(1).every(r=>r.every(v=>typeof v==='string')));

  approx('字段表-测距读数', api.dimensionMeasure(ruler).length, 10, 1e-9);
  approx('字段表-两点距离读数', api.dimensionMeasure(distDim).length, 10, 1e-9);
  approx('字段表-面积读数', api.dimensionMeasure(areaDim).area, 100, 1e-9);
  approx('字段表-周长读数', api.dimensionMeasure(areaDim).perimeter, 40, 1e-9);
  approx('字段表-夹角读数', api.dimensionMeasure(angDim).deg, 90, 1e-9);

  const cov={targetCells:4,gridCells:4,spec:{version:2},
    regions:[{id:'R-01',name:'R-01',minX:0,minY:0,nx:2,ny:2,cell:1,grid:new Uint8Array([1,1,1,0])}]};
  const fc=api.buildBlindSpotGeoJson(cov);
  eq('盲区GeoJSON-无盲区返回null', api.buildBlindSpotGeoJson({regions:[]}), null);
  eq('盲区GeoJSON-面数', fc.features.length, 1);
  eq('盲区GeoJSON-属性表顺序', Object.keys(fc.features[0].properties).join(','), 'region,regionId,index');
  eq('盲区GeoJSON-属性值', fc.features[0].properties.regionId, 'R-01');
  eq('盲区GeoJSON-序号从1开始', fc.features[0].properties.index, 1);
  ok('盲区GeoJSON-多边形闭合', fc.features[0].geometry.coordinates[0].length===5);
  eq('盲区GeoJSON-口径版本', fc.coverageSpec.version, 2);
  /* IO-P2-13：坐标按 precision 取整，外环逆时针且闭合 */
  const covDec={targetCells:2,gridCells:2,spec:{version:2},
    regions:[{id:'R-02',name:'R-02',minX:0.333,minY:0.333,nx:2,ny:1,cell:0.333,grid:new Uint8Array([0,1])}]};
  const ringDec=api.buildBlindSpotGeoJson(covDec).features[0].geometry.coordinates[0];
  ok('盲区GeoJSON-坐标按精度取整', ringDec.every(pt=>pt.every(v=>Number.isFinite(v)&&Math.abs(v*100-Math.round(v*100))<1e-9)));
  let twice=0;
  for(let i=0;i<ringDec.length-1;i++) twice+=ringDec[i][0]*ringDec[i+1][1]-ringDec[i+1][0]*ringDec[i][1];
  ok('盲区GeoJSON-外环逆时针', twice>0);
  eq('盲区GeoJSON-取整后仍闭合', ringDec[0], ringDec[ringDec.length-1]);
}

});

/* 28.4 N-05 导出口径统一：全量台账「显示」列=有效可见，图纸类导出只含可见对象 ---- */
await section("28.4 N-05 导出口径统一：全量台账「显示」列=有效可见，图纸类导出只含可见对象", async () => {
{
  api.resetState();
  api.state.layers.push({id:'layer.n05',name:'隐藏层',visible:false,locked:false});
  const ho=api.baseObject('point','point.marker',{name:'N05H',layerId:'layer.n05',x:123.45,y:67.89});
  const vo=api.baseObject('point','point.marker',{name:'N05V',x:5,y:5});
  api.state.objects.push(ho,vo);

  ok('N05-有效可见-隐藏图层对象不可见', api.effectiveVisible(ho)===false);
  ok('N05-有效可见-普通对象可见', api.effectiveVisible(vo)===true);
  ok('N05-旧名 isVisible 与 effectiveVisible 同源', api.isVisible(ho)===api.effectiveVisible(ho));
  ok('N05-台账口径含隐藏对象', api.exportScope(ho,'table')===true);
  ok('N05-图纸口径排除隐藏对象', api.exportScope(ho,'draw')===false);

  const all=api.objectRowsAll();
  const rowH=all.find(r=>r['编号']==='N05H');
  ok('N05-台账保留全量隐藏对象', !!rowH);
  eq('N05-台账显示列反映有效可见', rowH&&rowH['显示'], '否');
  eq('N05-台账可见对象显示是', api.objectRows().find(r=>r['编号']==='N05V')['显示'], '是');
  ok('N05-CSV 全量含隐藏编号', api.delimitedText(',').includes('N05H'));
  ok('N05-XLSX 全量含隐藏编号', api.xlsxExportTable().flat().includes('N05H'));

  const svg=api.buildSceneSvg();
  ok('N05-SVG 排除隐藏对象', !svg.includes('N05H')&&svg.includes('N05V'));
  const dxf=api.dxfEntitiesForExport();
  ok('N05-DXF 排除隐藏对象坐标', !dxf.entities.some(e=>e.type==='POINT'&&e.x===123.45));
  ok('N05-PDF 清单页按有效可见计数', api.pdfPagePlan().filter(p=>p.kind==='list').length===1);

  vo.visible=false;
  ok('N05-对象自身隐藏时图纸排除', api.exportScope(vo,'draw')===false);
  eq('N05-对象自身隐藏时台账显示否', api.objectRows().find(r=>r['编号']==='N05V')['显示'], '否');
  api.resetState();
}

});

/* 28.5 N-06 对象变更时间戳：只对实际变化 id 打点，同毫秒严格递增 ---- */
await section("28.5 N-06 对象变更时间戳：只对实际变化 id 打点，同毫秒严格递增", async () => {
{
  api.resetState();
  const a=api.baseObject('point','point.marker',{name:'N06A',x:1,y:1});
  const b=api.baseObject('point','point.marker',{name:'N06B',x:2,y:2});
  api.state.objects.push(a,b);
  const t0=a.updatedAt, b0=b.updatedAt;

  api.commitChange(undefined,[a.id]);
  ok('N06-指定 id 打点严格递增', a.updatedAt>t0);
  eq('N06-未列出的对象不被打点', b.updatedAt, b0);
  const t1=a.updatedAt;

  api.commitChange();
  eq('N06-无 id 提交不产生新时间戳', a.updatedAt, t1);
  api.commitChange(undefined,[]);
  eq('N06-空 id 列表不产生新时间戳', a.updatedAt, t1);

  api.stampObjects([a.id]);
  ok('N06-同毫秒内连续打点仍严格递增', a.updatedAt>t1);
  eq('N06-不存在的 id 不计数', api.stampObjects(['missing.n06']), 0);
  eq('N06-Map 形式 id 可打点', api.stampObjects(new Map([[a.id,1]])), 1);

  const orig=JSON.parse(JSON.stringify(a));
  a.x=orig.x+3;
  eq('N06-dragChangedIds 只返回真实位移对象', api.dragChangedIds({type:'move',originals:new Map([[a.id,orig]])}), [a.id]);
  a.x=orig.x;
  eq('N06-dragChangedIds 拖回原位为空', api.dragChangedIds({type:'move',originals:new Map([[a.id,orig]])}).length, 0);
  const rotOrig=JSON.parse(JSON.stringify(b));
  b.angle=(b.angle||0)+15;
  eq('N06-dragChangedIds 旋转返回自身 id', api.dragChangedIds({type:'rotate',id:b.id,original:rotOrig}), [b.id]);

  api.commitObjectEdit([b.id]);
  ok('N06-commitObjectEdit 走同一打点助手', b.updatedAt>b0);
  api.resetState();
}

});

/* 28.6 N-07 导入对象唯一性：重复 id / safeId 归并 / 重名 ---- */
await section("28.6 N-07 导入对象唯一性：重复 id / safeId 归并 / 重名", async () => {
{
  api.resetState();
  const layers=[{id:'layer.default',name:'默认图层',visible:true,locked:false}];
  const report={duplicateIds:0,normalizedIds:0,duplicateNames:0};
  const seenIds=new Set(), seenNames=new Set();
  const raw=[
    {kind:'point',id:'OBJ1',name:'同名',x:1,y:1},
    {kind:'point',id:'OBJ1',name:'同名',x:2,y:2},
    {kind:'point',id:'a:b',name:'B',x:3,y:3},
    {kind:'point',id:'a?b',name:'C',x:4,y:4}
  ];
  const out=api.sanitizeObjects(raw,layers,api.BUILTIN_TYPES,seenIds,seenNames,report);

  eq('N07-对象数量不变', out.length, 4);
  eq('N07-id 批次内唯一', new Set(out.map(o=>o.id)).size, 4);
  eq('N07-重复 id 追加稳定后缀', out[1].id, 'OBJ1_2');
  eq('N07-首个对象 id 不变', out[0].id, 'OBJ1');
  eq('N07-safeId 归并项仍唯一', new Set([out[2].id,out[3].id]).size, 2);
  ok('N07-safeId 归并项基于 a_b', out[2].id.startsWith('a_b')&&out[3].id.startsWith('a_b'));
  eq('N07-重名对象走编号重命名', /^O\d{4,}$/.test(out[1].name), true);
  eq('N07-首个重名保留原名', out[0].name, '同名');
  eq('N07-去重不改变既有字段', out[1].x, 2);
  eq('N07-重复 id 审计计数', report.duplicateIds, 2);
  ok('N07-safeId 归一审计计数', report.normalizedIds>=2);
  eq('N07-重名审计计数', report.duplicateNames, 1);

  api.state.objects.push(out[0],out[1]);
  const idx=api.objectIndexById();
  ok('N07-重复 id 两项可独立索引', idx.get('OBJ1')===out[0]&&idx.get('OBJ1_2')===out[1]);
  eq('N07-缺省 id 也能生成唯一值', api.safeId('', 'OBJ').startsWith('OBJ'), true);
  ok('N07-审计报告可读取', typeof api.sanitizeReport()==='object');
  api.resetState();
}

});

/* 28.7 N-08 楼层名唯一化与跨楼层引用检查 ---- */
await section("28.7 N-08 楼层名唯一化与跨楼层引用检查", async () => {
{
  const st=api.resetState();
  eq('N08-楼层名归一（去空白/截断）', api.normalizeFloorName('  A  '), 'A');
  eq('N08-已存在名称判定', api.floorNameTaken('1F'), true);
  eq('N08-空名不算占用', api.floorNameTaken('   '), false);
  eq('N08-重命名自身豁免', api.floorNameTaken('1F','floor.default'), false);
  const n=st.floors.length;
  eq('N08-新增重名楼层被拒', await api.addFloor('1F'), null);
  eq('N08-新增重名不改楼层数', st.floors.length, n);
  st.floors.push({id:'floor.b',name:'2F',objects:[],updatedAt:''});
  eq('N08-重命名为已存在名称被拒', api.renameFloor('floor.b','1F'), false);
  eq('N08-重命名被拒后名称不变', st.floors[1].name, '2F');
  ok('N08-重命名为新名称成功', api.renameFloor('floor.b',' 3F '));
  eq('N08-重命名按归一值落库', st.floors[1].name, '3F');
  /* 跨楼层引用统计：当前楼层 + 非当前楼层各 1 个对象 */
  const a=api.baseObject('point','point.marker',{name:'A'});
  st.objects.push(a);
  const b=api.baseObject('point','point.marker',{name:'B'});
  b.layerId='layer.other'; st.floors[1].objects.push(b);
  eq('N08-跨楼层图层引用楼层数', api.floorRefs(o=>o.layerId==='layer.default').length, 1);
  const trefs=api.floorRefs(o=>o.typeId==='point.marker');
  eq('N08-跨楼层类型引用楼层数', trefs.length, 2);
  eq('N08-跨楼层引用对象计数', trefs.reduce((s,r)=>s+r.count,0), 2);
  /* 导入：楼层重名 → errors 且计划为空（事务化不落库） */
  st.floors.push({id:'floor.c',name:'3F',objects:[],updatedAt:''});
  const plan=api.rowsToObjectsPlan([['编号','对象类型','X','Y','楼层'],['','点设备','1','2','1F']]);
  ok('N08-导入重名楼层整批拒绝', plan.errors.some(e=>e.includes('楼层名称')&&e.includes('重复')));
  eq('N08-拒绝时无更新', plan.updates.length, 0);
  eq('N08-拒绝时无新增', plan.creates.length, 0);
  api.resetState();
}
});

/* 28.8 N-10 导出层转义与结构注入加固 ---- */
await section("28.8 N-10 导出层转义与结构注入加固", async () => {
{
  const st=api.resetState();
  eq('N10-颜色白名单-非法回退', api.normalizeExportColor('red" onload="alert(1)','#111827'), '#111827');
  eq('N10-颜色白名单-十六进制', api.normalizeExportColor('#abc','#000'), '#abc');
  eq('N10-颜色白名单-rgba', api.normalizeExportColor('rgba(1,2,3,.5)','#000'), 'rgba(1,2,3,.5)');
  eq('N10-颜色白名单-关键字', api.normalizeExportColor('red','#000'), 'red');
  st.site=null;
  st.layers[0].name='A\r\nB\tC';
  const o=api.baseObject('rect','rect.area',{name:'X'});
  o.style.color='red" onload="alert(1)';
  st.objects.push(o);
  const svg=api.buildSceneSvg();
  ok('N10-SVG 颜色属性被中和', svg.includes('fill="#111827"')&&!svg.includes('onload=')&&!svg.includes('red"'));
  const dx=api.dxfEntitiesForExport();
  eq('N10-DXF 图层名无 CR/LF', /[\r\n\t]/.test(dx.layers[0].name), false);
  eq('N10-DXF 图层名清洗值', dx.layers[0].name, 'A B C');
  eq('N10-DXF 实体图层与图层表一致', dx.entities[0].layer, dx.layers[0].name);
  const dxf=api.Dxf.buildDxf(dx.entities,dx.layers);
  ok('N10-DXF 结构完整（EOF 结尾）', /EOF\s*$/.test(dxf));
  ok('N10-DXF 图层名按组码单行写入', dxf.includes('A B C'));
  /* 符号路径：A 起始被拒；裸 A 路径不抛异常；合法 M+A 正常离散 */
  eq('N10-符号路径 A 起始被拒', api.symbolPathsFor({symbol:[{d:'A10,10 0 0 0 20,20'}]}).length, 0);
  let threw=false;
  try{ api.pathToPolylines('A10,10 0 0 0 20,20'); }catch(e){ threw=true; }
  eq('N10-A 起始裸路径不抛异常', threw, false);
  eq('N10-合法 M+A 路径可离散', api.pathToPolylines('M0,0 A5,5 0 0 1 10,0').length, 1);
  api.resetState();
}
});

/* 28.9 N-11 JSON 导入事务顺序：提交成功后才回收资产 ---- */
await section("28.9 N-11 JSON 导入事务顺序：成功后才回收资产", async () => {
{
  const origPrune=sandbox.assetPrune, origAfter=sandbox.afterStateLoaded,
        origToast=sandbox.toast, origSave=sandbox.scheduleSave, origReach=sandbox.reachableAssetIds;
  const payload=JSON.stringify({schema:api.SCHEMA,meta:{name:'IMPORTED'},objects:[]});
  const file=()=>({size:payload.length,text:async()=>payload});
  try{
    /* ① 提交阶段失败（afterStateLoaded 抛错）：回滚且不回收到旧资产 */
    api.resetState();
    api.state.background.assetId='OLD_ASSET';
    api.draft={probe:1};
    api.selectedIds.clear(); api.selectedIds.add('S1');
    let pruneCalls=0, keeps=[], errToasts=0;
    sandbox.assetPrune=async keep=>{ pruneCalls++; keeps.push(keep.slice()); return []; };
    sandbox.reachableAssetIds=async()=>[];
    sandbox.afterStateLoaded=async flag=>{ if(flag===false) return; throw new Error('资产转换失败'); };
    sandbox.scheduleSave=()=>{};
    sandbox.toast=(m,t)=>{ if(t==='error') errToasts++; };
    const beforeState=api.state, beforeDraft=api.draft;
    await api.importJsonFile(file());
    eq('N11-失败后状态回滚', api.state, beforeState);
    eq('N11-失败后旧底图 assetId 保留', api.state.background.assetId, 'OLD_ASSET');
    eq('N11-失败路径未回收资产', pruneCalls, 0);
    eq('N11-失败后草稿保留', api.draft, beforeDraft);
    ok('N11-失败后选中集恢复', api.selectedIds.has('S1'));
    ok('N11-失败后有错误提示', errToasts>0);
    /* ② 成功导入：提交完成后再回收，旧资产进入不可达集合 */
    sandbox.afterStateLoaded=async()=>{};
    sandbox.toast=()=>{};
    pruneCalls=0; keeps=[];
    await api.importJsonFile(file());
    eq('N11-成功导入替换工程', api.state.meta.name, 'IMPORTED');
    eq('N11-成功路径回收一次', pruneCalls, 1);
    ok('N11-成功回收 keep 不含旧资产', keeps.length===1&&!keeps[0].includes('OLD_ASSET'));
  } finally {
    sandbox.assetPrune=origPrune; sandbox.afterStateLoaded=origAfter;
    sandbox.toast=origToast; sandbox.scheduleSave=origSave; sandbox.reachableAssetIds=origReach;
    api.resetState();
  }
}
});

/* 28.10 IO-P1-6 工程库打开：加载成功后才回收资产 ---- */
await section("28.10 IO-P1-6 工程库打开顺序：afterStateLoaded 成功后才回收资产", async () => {
{
  const orig={get:sandbox.idbGetKey,ensure:sandbox.ensureBackgroundAsset,prune:sandbox.assetPrune,
              after:sandbox.afterStateLoaded,save:sandbox.scheduleSave,render:sandbox.requestRender,
              reach:sandbox.reachableAssetIds};
  const PID='PRJ_OPEN_IO_P1_6';
  /* 候选工程记录：复用真实持久化结构，确保 isReadableSchema/buildProject 走生产路径 */
  api.resetState();
  api.state.meta.name='OPENED';
  api.state.meta.projectId=PID;
  const raw=api.persistableState();
  try{
    /* ① 加载阶段失败：回滚到打开前，且不回收任何资产 */
    api.resetState();
    api.state.meta.projectId='PRJ_CURRENT';
    api.state.background.assetId='OLD_ASSET';
    api.draft={probe:1};
    api.selectedIds.clear(); api.selectedIds.add('S1');
    const order=[]; let pruneCalls=0, keeps=[];
    sandbox.idbGetKey=async k=>k==='proj:'+PID?JSON.parse(JSON.stringify(raw)):null;
    sandbox.ensureBackgroundAsset=async()=>{ order.push('ensure'); };
    sandbox.reachableAssetIds=async()=>[];
    sandbox.assetPrune=async keep=>{ pruneCalls++; keeps.push(keep.slice()); order.push('prune'); return []; };
    sandbox.afterStateLoaded=async flag=>{ if(flag===false){ order.push('after-rollback'); return; } order.push('after'); throw new Error('资产转换失败'); };
    sandbox.scheduleSave=()=>{ order.push('save'); };
    sandbox.requestRender=()=>{ order.push('render'); };
    const beforeState=api.state, beforeDraft=api.draft;
    let threw=false; try{ await api.openProjectById(PID); }catch(e){ threw=true; }
    ok('IO-P1-6-失败向上抛出', threw);
    eq('IO-P1-6-失败后状态回滚', api.state, beforeState);
    eq('IO-P1-6-失败后旧底图 assetId 保留', api.state.background.assetId, 'OLD_ASSET');
    eq('IO-P1-6-失败路径未回收资产', pruneCalls, 0);
    eq('IO-P1-6-失败后草稿保留', api.draft, beforeDraft);
    ok('IO-P1-6-失败后选中集恢复', api.selectedIds.has('S1'));
    ok('IO-P1-6-失败后回滚 UI 且重绘', order.includes('after-rollback')&&order.includes('render'));
    /* ② 成功打开：afterStateLoaded 完成资产转换后才回收 */
    order.length=0; pruneCalls=0; keeps=[];
    sandbox.afterStateLoaded=async flag=>{ order.push(flag===false?'after-rollback':'after'); };
    await api.openProjectById(PID);
    eq('IO-P1-6-成功打开替换工程', api.state.meta.name, 'OPENED');
    ok('IO-P1-6-成功后先加载后回收', order.indexOf('after')>=0&&order.indexOf('after')<order.indexOf('prune'));
    eq('IO-P1-6-成功路径回收一次', pruneCalls, 1);
    ok('IO-P1-6-成功回收 keep 不含旧资产', keeps.length===1&&!keeps[0].includes('OLD_ASSET'));
  } finally {
    sandbox.idbGetKey=orig.get; sandbox.ensureBackgroundAsset=orig.ensure;
    sandbox.assetPrune=orig.prune; sandbox.afterStateLoaded=orig.after;
    sandbox.scheduleSave=orig.save; sandbox.requestRender=orig.render; sandbox.reachableAssetIds=orig.reach;
    api.resetState();
  }
}
});

/* 29. 表格规划与应用：折线/测距/形状重建、基点平移、非法行告警 -------------- */
await section("29. 表格规划与应用：折线/测距/形状重建、基点平移、非法行告警", async () => {
{
  const st=api.resetState();
  const L1=api.baseObject('line','line.custom',{name:'L1',points:[[0,0],[10,0],[10,10]],x:0,y:0});
  const L2=api.baseObject('line','line.custom',{name:'L2',points:[[5,5],[15,5]],x:5,y:5});
  const D1=api.baseObject('dimension','dimension.distance',{name:'D1',subtype:'distance',points:[[0,0],[5,0]],x:0,y:0});
  st.objects.push(L1,L2,D1);
  const C=api.TABLE_COLUMNS;
  /* 台账新增的 4 列（型号/安装高度/IP/责任人）插在「图层」之后；旧用例按旧列序书写，这里自动补空位 */
  const row=m=>{ const cells=m.slice(); cells.splice(5,0,'','','',''); const o={}; cells.forEach((v,i)=>{ if(v!=='')o[C[i]]=v; }); return C.map(k=>o[k]??''); };
  const H=C.slice();
  const rL1=row(['L1','','线段/折线','','','','','','','','','','是','','0,0;20,0;20,10;0,10']);
  const rL2=row(['L2','','线段/折线','','','25','35']);                       /* 仅改基点：整体平移 */
  const rD1=row(['D1','','尺寸标注','','','','','','','','','','','测距']);  /* distance→ruler */
  const rNewRuler=row(['','','尺寸标注','','','','','','','','','','','测距','0,0;6,8;6,18']);
  const rNewLine=row(['','','线段/折线','','','','','','','','','','是','','0,0;10,0;10,10;0,10']);
  const rCircle=row(['','','矩形/区域','','','30','30','','10','','圆形']);
  const rSector=row(['','','矩形/区域','','','0','0','','20','','扇形','30,120']);
  const rEllipse=row(['','','矩形/区域','','','1','2','30','10','6','椭圆']);
  const rBadRuler=row(['','','尺寸标注','','','','','','','','','','','测距','0,0']);
  const rBadClosed=row(['','','线段/折线','','','','','','','','','','是','','0,0;10,0']);
  const rBadCircle=row(['','','矩形/区域','','','0','0','','0','','圆形']);
  const plan=api.rowsToObjectsPlan([H,rL1,rL2,rD1,rNewRuler,rNewLine,rCircle,rSector,rEllipse,rBadRuler,rBadClosed,rBadCircle]);
  eq('表格29-更新3项', plan.updates.length, 3);
  eq('表格29-新建6项（含闭合2点降级的开放折线）', plan.creates.length, 6);
  ok('表格29-测距单点告警', plan.warnings.some(w=>w.includes('尺寸标注')&&w.includes('2 点')));
  ok('表格29-闭合2点降级告警', plan.warnings.some(w=>w.includes('闭合折线至少需要 3')));
  ok('表格29-圆缺直径告警', plan.warnings.some(w=>w.includes('圆形')));
  const degraded=plan.creates.find(cr=>cr.kind==='line'&&cr.points.length===2);
  ok('表格29-闭合2点降级为开放', degraded&&degraded.closed===false);
  api.applyTableImport(plan);

  const aL1=st.objects.find(o=>o.name==='L1');
  eq('表格29-L1闭合生效', aL1.closed, true);
  eq('表格29-L1四点替换', aL1.points.length, 4);
  approx('表格29-L1周长60', api.objectLength(aL1), 60, 1e-9);
  approx('表格29-L1面积200', api.objectArea(aL1), 200, 1e-9);
  const aL2=st.objects.find(o=>o.name==='L2');
  eq('表格29-L2基点平移', [aL2.x,aL2.y,aL2.points[0][0],aL2.points[0][1],aL2.points[1][0],aL2.points[1][1]],
    [25,35,25,35,35,35]);
  const aD1=st.objects.find(o=>o.name==='D1');
  eq('表格29-D1变测距', aD1.subtype, 'ruler');
  eq('表格29-D1节点保留', aD1.points.length, 2);

  const nr=st.objects.find(o=>o.kind==='dimension'&&o.name!=='D1');
  eq('表格29-新测距3点', nr.points.length, 3);
  eq('表格29-新测距基点取首点', [nr.x,nr.y], [0,0]);
  approx('表格29-新测距总长20', api.objectLength(nr), 20, 1e-9);
  const nl=st.objects.find(o=>o.kind==='line'&&o.closed&&o.points.length===4);
  eq('表格29-新折线闭合', nl.closed, true);
  const nd=st.objects.find(o=>o.kind==='line'&&!o.closed&&o.name!=='L2');
  ok('表格29-降级折线落地为开放2点', nd&&nd.points.length===2);
  const nc=st.objects.find(o=>o.kind==='rect'&&o.shape?.type==='circle');
  eq('表格29-圆重建半径', nc.shape.r, 5);
  eq('表格29-圆基点即圆心', [nc.x,nc.y], [30,30]);
  eq('表格29-圆清空宽高', [nc.width,nc.height], [0,0]);
  const ns=st.objects.find(o=>o.shape?.type==='sector');
  eq('表格29-扇形重建', [ns.shape.r,ns.shape.a0,ns.shape.a1], [10,30,120]);
  const ne=st.objects.find(o=>o.shape?.type==='ellipse');
  eq('表格29-椭圆半轴', [ne.shape.rx,ne.shape.ry], [5,3]);
  approx('表格29-椭圆角度', ne.angle, 30, 1e-9);

  /* 29.2 旧版表头（无新列）仍可规划：折线行无法新建但不报错阻断 */
  const oldH=['编号','名称','对象类型','X','Y','宽度','高度'];
  const oldPlan=api.rowsToObjectsPlan([oldH,
    ['O100','','点设备','1','2','',''],
    ['O101','','线段/折线','0','0','','']]);
  eq('表格29-旧表头点设备可新建', oldPlan.creates.length, 1);
  ok('表格29-旧表头折线缺坐标告警', oldPlan.warnings.some(w=>w.includes('O101')&&w.includes('节点坐标')));
}

});

/* 30. JSON 工程往返：基点(含负值)/节点/闭合/测距子类型/形状全保留 ----------- */
await section("30. JSON 工程往返：基点(含负值)/节点/闭合/测距子类型/形状全保留", async () => {
{
  const m=api.migrateProject({ schema:'offline-drawing-annotation/v1',
    objects:[
      { id:'l1', kind:'line', typeId:'line.custom', name:'L1', x:-12.5, y:-8.25, closed:true,
        points:[[-12.5,-8.25],[20,-8.25],[20,30],[-12.5,30]] },
      { id:'r1', kind:'dimension', typeId:'dimension.distance', name:'R1', x:-3, y:4, subtype:'ruler',
        points:[[-3,4],[0,8],[0,0],[9,0]] },
      { id:'c1', kind:'rect', typeId:'rect.area', name:'C1', x:-50, y:-50, shape:{type:'circle',r:12} }
    ]});
  const L1=m.objects.find(o=>o.name==='L1');
  eq('JSON-闭合保留', L1.closed, true);
  eq('JSON-节点数保留', L1.points.length, 4);
  approx('JSON-负基点X', L1.x, -12.5, 1e-9);
  approx('JSON-负基点Y', L1.y, -8.25, 1e-9);
  approx('JSON-负节点坐标', L1.points[3][0], -12.5, 1e-9);
  const R1=m.objects.find(o=>o.name==='R1');
  eq('JSON-测距子类型保留', R1.subtype, 'ruler');
  eq('JSON-测距4点保留', R1.points.length, 4);
  eq('JSON-测距首点同步基点', [R1.x,R1.y], [-3,4]);
  approx('JSON-测距总长', api.objectLength(R1), 5+8+9, 1e-9);
  const C1=m.objects.find(o=>o.name==='C1');
  eq('JSON-圆形形状保留', C1.shape.type, 'circle');
  eq('JSON-圆形负圆心保留', [C1.x,C1.y,C1.shape.r], [-50,-50,12]);
}

});

/* 31. 导入面积/长度/节点数核对：导出回导零告警、篡改告警非阻断、取整容差、非法值 ---- */
await section("31. 导入面积/长度/节点数核对：导出回导零告警、篡改告警非阻断、取整容差、非法值", async () => {
{
  /* 31.1 全类型工程导出后原样回导：长度/面积/节点数必须零告警（含大坐标多小数的取整传播） */
  const st=api.resetState();
  st.objects.push(
    api.baseObject('line','line.custom',{name:'K1',points:[[0,0],[3,4],[3,14]],x:0,y:0}),
    api.baseObject('line','line.custom',{name:'K2',closed:true,points:[[1000.333,500.777],[1234.567,512.123],[1230.9,777.456],[990.1,760.0]],x:1000.333,y:500.777}),
    api.baseObject('dimension','dimension.distance',{name:'K3',subtype:'ruler',points:[[0,0],[6,8],[6,18]],x:0,y:0}),
    api.baseObject('dimension','dimension.distance',{name:'K4',subtype:'distance',points:[[0,0],[9,12]],x:0,y:0}),
    api.baseObject('dimension','dimension.distance',{name:'K5',subtype:'area',points:[[0,0],[10,0],[0,10]],x:0,y:0}),
    api.baseObject('rect','rect.area',{name:'K6',x:0,y:0,width:12.5,height:8.25}),
    api.baseObject('rect','rect.area',{name:'K7',x:500.1,y:500.2,shape:{type:'circle',r:33.333}}),
    api.baseObject('rect','rect.area',{name:'K8',x:0,y:0,shape:{type:'ellipse',rx:40.5,ry:12.25}}),
    api.baseObject('rect','rect.area',{name:'K9',x:0,y:0,shape:{type:'sector',r:25.5,a0:15,a1:195}}),
    api.baseObject('point','point.marker',{name:'K10',x:1,y:2}),
    api.baseObject('text',undefined,{name:'K11',x:3,y:4,text:'注'})
  );
  const cols=api.TABLE_COLUMNS;
  const dataRows=api.objectRows().map(r=>cols.map(c=>String(r[c]??'')));
  const rt=api.rowsToObjectsPlan([cols,...dataRows]);
  eq('核对-全类型导出回导零告警', rt.warnings.length, 0);
  eq('核对-回导全部走更新(11项)', rt.updates.length, 11);

  /* 31.2 直接核对函数：候选长度/面积推算 */
  {
    const o=api.baseObject('line','line.custom',{points:[[0,0],[3,4],[3,14]],x:0,y:0});
    eq('核对-空列不校验', api.checkRowGeom('行X',()=> '',o).length, 0);
    const get=n=>({'长度':'15','节点数':'3'})[n]??'';
    eq('核对-长度一致无告警', api.checkRowGeom('行X',get,o).length, 0);
  }

  /* 31.3 规划层篡改：长度/面积/节点数错误要告警但仍新建（非阻断） */
  const H=cols.slice();
  const row=m=>{ const o={}; m.forEach(([k,v])=>o[k]=v); return cols.map(k=>o[k]??''); };
  const tamperedLen=row([['对象类型','线段/折线'],['闭合','否'],['节点坐标','0,0;3,4;3,14'],['节点数','3'],['长度','99'],['面积','']]);
  const tamperedArea=row([['对象类型','矩形/区域'],['X','0'],['Y','0'],['宽度','10'],['高度','10'],['形状','矩形'],['面积','999']]);
  const tamperedN=row([['对象类型','尺寸标注'],['标注类型','测距'],['节点坐标','0,0;6,8;6,18'],['节点数','5'],['长度','20']]);
  const negLen=row([['对象类型','线段/折线'],['节点坐标','0,0;3,4'],['长度','-1']]);
  const badAreaTxt=row([['对象类型','矩形/区域'],['X','0'],['Y','0'],['宽度','2'],['高度','2'],['形状','矩形'],['面积','abc']]);
  const p2=api.rowsToObjectsPlan([H,tamperedLen,tamperedArea,tamperedN,negLen,badAreaTxt]);
  eq('核对-篡改后仍全部新建5项', p2.creates.length, 5);
  ok('核对-长度不一致告警', p2.warnings.some(w=>w.includes('长度列')&&w.includes('不一致')));
  ok('核对-面积不一致告警', p2.warnings.some(w=>w.includes('面积列')&&w.includes('999')));
  ok('核对-节点数不一致告警', p2.warnings.some(w=>w.includes('节点数列')));
  ok('核对-负长度非法告警', p2.warnings.some(w=>w.includes('长度列')&&w.includes('非法')));
  ok('核对-非数字面积非法告警', p2.warnings.some(w=>w.includes('面积列')&&w.includes('非法')));
  /* 告警文本带推算值与差值 */
  ok('核对-告警含推算值15', p2.warnings.some(w=>w.includes('15.00')));

  /* 31.4 取整容差内不告警：闭合4边周长60，容差 4*1.5*.01+.005=.065，60.01 通过 */
  const near=row([['对象类型','线段/折线'],['闭合','是'],['节点坐标','0,0;20,0;20,10;0,10'],['节点数','4'],['长度','60.01'],['面积','199.98']]);
  const p3=api.rowsToObjectsPlan([H,near]);
  eq('核对-容差内零告警', p3.warnings.filter(w=>w.includes('不一致')).length, 0);
  const far=row([['对象类型','线段/折线'],['闭合','是'],['节点坐标','0,0;20,0;20,10;0,10'],['长度','60.5']]);
  const p4=api.rowsToObjectsPlan([H,far]);
  ok('核对-超出容差告警', p4.warnings.some(w=>w.includes('长度列')));

  /* 31.5 更新行：节点坐标已改但长度列还是旧值 → 告警（防止台账与图脱节） */
  const uo=api.baseObject('line','line.custom',{name:'U1',points:[[0,0],[10,0]],x:0,y:0});
  st.objects.push(uo);
  const upd=row([['编号','U1'],['节点坐标','0,0;30,0'],['长度','10']]);
  const p5=api.rowsToObjectsPlan([H,upd]);
  eq('核对-更新1项', p5.updates.length, 1);
  ok('核对-更新行旧长度告警', p5.warnings.some(w=>w.includes('U1')&&w.includes('长度列')));
  /* 节点改成 30m 后长度列同步改为 30 → 不告警 */
  const upd2=row([['编号','U1'],['节点坐标','0,0;30,0'],['长度','30']]);
  const p6=api.rowsToObjectsPlan([H,upd2]);
  eq('核对-更新行一致零告警', p6.warnings.length, 0);

  /* 31.6 点设备填长度/面积无效列 → 告警；留空不告警 */
  const p7=api.rowsToObjectsPlan([H,
    row([['对象类型','点设备'],['X','1'],['Y','2'],['长度','5']]),
    row([['对象类型','点设备'],['X','1'],['Y','2']])]);
  eq('核对-点设备2项新建', p7.creates.length, 2);
  ok('核对-点设备长度无效告警', p7.warnings.some(w=>w.includes('长度列')&&w.includes('不一致')));
  eq('核对-点设备留空零告警', p7.warnings.length, 1);

  /* 31.7 圆形面积篡改：πr² 推算 25π≈78.54，填 100 必告警 */
  const p8=api.rowsToObjectsPlan([H,
    row([['对象类型','矩形/区域'],['X','0'],['Y','0'],['宽度','10'],['形状','圆形'],['面积','100']])]);
  ok('核对-圆形面积不一致告警', p8.warnings.some(w=>w.includes('面积列')));

  /* 31.8 旧版表头（无长度/面积列）不产生任何核对告警 */
  const oldH=['编号','名称','对象类型','X','Y','宽度','高度'];
  const p9=api.rowsToObjectsPlan([oldH,['U9','','点设备','1','2','','']]);
  eq('核对-旧表头无核对告警', p9.warnings.length, 0);
}

});

/* 32. 评估报告高优先缺陷回归：框选错轴 / 校准漂移 / 资产可达集合 / 捕捉粗筛 -------- */
await section("32. 评估报告高优先缺陷回归：框选错轴 / 校准漂移 / 资产可达集合 / 捕捉粗筛", async () => {
{
  /* 5.3 boundsIntersect：报告中的两个反例（原实现 b.maxY<a.minX 错轴） */
  const A={minX:10,maxX:20,minY:0,maxY:5};
  const inside={minX:12,maxX:14,minY:1,maxY:3};
  const aside={minX:0,maxX:5,minY:100,maxY:110};
  eq('框选-内含判定相交', api.boundsIntersect(A,inside), true);
  eq('框选-X 与 Y 都分离不相交', api.boundsIntersect(A,aside), false);
  eq('框选-对角不相交(25,0)-(30,5)', api.boundsIntersect(A,{minX:25,maxX:30,minY:0,maxY:5}), false);
  eq('框选-Y 分离不相交', api.boundsIntersect(A,{minX:12,maxX:14,minY:10,maxY:12}), false);
  eq('框选-边界接触算相交', api.boundsIntersect(A,{minX:20,maxX:30,minY:0,maxY:5}), true);

  /* 5.1 校准围绕世界原点缩放：对象像素位置保持、校准两点新距离=输入值 */
  const st=api.resetState();
  st.objects.push(
    api.baseObject('point','point.marker',{x:20,y:20}),
    api.baseObject('line','line.custom',{points:[[10,10],[20,10]],x:10,y:10}),
    api.baseObject('rect','rect.area',{x:0,y:0,width:10,height:10,shape:null})
  );
  api.scaleWorldAround([0,0],2);
  const p=st.objects[0], l=st.objects[1], rc=st.objects[2];
  /* 世界坐标×2；新 mpp=0.2 时像素 = world/mpp = 原 (200,200) 不变 */
  eq('校准-点世界坐标×2', [p.x,p.y], [40,40]);
  eq('校准-折线节点×2', l.points[1], [40,20]);
  approx('校准-校准两点新距离=20', api.polylineLength(l.points), 20);
  eq('校准-矩形宽高×2', [rc.width,rc.height], [20,20]);
  /* 圆形/椭圆区域半径、圆心也围绕原点同比 */
  api.resetState();
  api.state.objects.push(
    api.baseObject('rect','rect.area',{x:50,y:50,shape:{type:'circle',r:5}}),
    api.baseObject('rect','rect.area',{x:0,y:0,shape:{type:'ellipse',rx:8,ry:4}})
  );
  api.scaleWorldAround([0,0],0.5);
  const cc=api.state.objects[0], ce=api.state.objects[1];
  eq('校准-圆半径同比缩放', cc.shape.r, 2.5);
  eq('校准-圆心同比缩放', [cc.x,cc.y], [25,25]);
  eq('校准-椭圆半轴同比', [ce.shape.rx,ce.shape.ry], [4,2]);

  /* 5.2 底图资产可达集合：当前 + past + future 任一引用都不得回收 */
  api.resetState();
  api.history.past.length=0; api.history.future.length=0;
  api.state.background.assetId='CUR';
  api.history.past.push({background:{assetId:'A'}},{background:{assetId:'B'}},{background:{}});
  api.history.future.push({background:{assetId:'C'}});
  const reach=new Set(api.reachableBgAssetIds());
  eq('资产-可达集合数量4', reach.size, 4);
  ok('资产-含当前', reach.has('CUR'));
  ok('资产-含历史A/B', reach.has('A')&&reach.has('B'));
  ok('资产-含重做C', reach.has('C'));
  /* 栈清空后只剩当前（新建/导入新工程场景） */
  api.history.past.length=0; api.history.future.length=0;
  eq('资产-无栈时仅当前', api.reachableBgAssetIds(), ['CUR']);
  api.state.background.assetId='';
  eq('资产-无引用空集合', api.reachableBgAssetIds().length, 0);
}

});

/* 32.1 资产可达集：命名空间覆盖历史/剪贴板/拖拽/多个工程记录（审计 P0-1） --- */
await section("32.1 资产可达集：命名空间覆盖历史/剪贴板/拖拽/多个工程记录（审计 P0-1）", async () => {
{
  api.resetState();
  api.history.past.length=0; api.history.future.length=0;
  api.setClipboard([]); api.setDrag(null);

  const refs=api.ContentAssets.collectAssetRefs({
    background:{assetId:'bg_top'},
    objects:[{props:{photoId:'as_top_photo'}},{props:{}},{}],
    floors:[{id:'f1',background:{assetId:'bg_floor'},objects:[{props:{photoId:'as_floor_photo'}}]}]
  });
  eq('可达-快照含顶层/楼层底图与照片', refs.slice().sort(), ['as_floor_photo','as_top_photo','bg_floor','bg_top'].sort());
  eq('可达-无快照返回空', api.ContentAssets.collectAssetRefs(null), []);

  api.state.background.assetId='CUR';
  api.setClipboard([{props:{photoId:'clip_photo'},kind:'point',name:'C'}]);
  api.setDrag({originals:new Map([['x',{props:{photoId:'drag_photo'}}]])});
  const sets=api.assetRefsInMemory();
  ok('可达-草稿命名空间', (sets.get('draft')||[]).includes('CUR'));
  ok('可达-剪贴板命名空间', (sets.get('clipboard')||[]).includes('clip_photo'));
  ok('可达-拖拽命名空间', (sets.get('drag.originals')||[]).includes('drag_photo'));

  /* 双工程保活：A/B 各带底图与照片 → 并集全部保留；删除 B 的记录后只剩 A。
     并集正是 prune 的 keepIds 输入，跨工程误删由此杜绝。 */
  const ns=api.assetRefsInMemory();
  ns.set('project:A', api.ContentAssets.collectAssetRefs({background:{assetId:'bg_A'},objects:[{props:{photoId:'as_A_photo'}}]}));
  ns.set('project:B', api.ContentAssets.collectAssetRefs({background:{assetId:'bg_B'},objects:[{props:{photoId:'as_B_photo'}}]}));
  const keepBoth=api.unionAssetRefs(ns);
  ok('双工程-并集保留A底图/照片', keepBoth.includes('bg_A')&&keepBoth.includes('as_A_photo'));
  ok('双工程-并集保留B底图/照片', keepBoth.includes('bg_B')&&keepBoth.includes('as_B_photo'));
  ns.delete('project:B');
  const keepA=api.unionAssetRefs(ns);
  ok('双工程-删除B记录后只回收B资产', keepA.includes('bg_A')&&keepA.includes('as_A_photo')&&!keepA.includes('bg_B')&&!keepA.includes('as_B_photo'));

  api.setClipboard([]); api.setDrag(null); api.resetState();
}

});

/* 33. 捕捉包围盒粗筛：500 个远处矩形不影响 tol 内交点/垂足命中（性能优化不改变结果） --- */
await section("33. 捕捉包围盒粗筛：500 个远处矩形不影响 tol 内交点/垂足命中（性能优化不改变结果）", async () => {
{
  const st=api.createInitialState();
  /* 远处铺满 500 个矩形（2000 条边），距鼠标邻域极远 */
  for(let i=0;i<500;i++){
    const x=1000+(i%25)*60, y=1000+Math.floor(i/25)*60;
    st.objects.push(api.baseObject('rect','rect.area',{x,y,width:40,height:40}));
  }
  /* 近处两条跨对象相交线：y=10 与 x=15 */
  st.objects.push(
    api.baseObject('line','line.custom',{points:[[0,10],[40,10]],x:0,y:10}),
    api.baseObject('line','line.custom',{points:[[15,0],[15,40]],x:15,y:0})
  );
  const edges=api.collectSnapEdges(st);
  eq('性能-500矩形共2002边', edges.length, 2002);
  const hitI=api.findOsnap(st,[15.12,10.12],0.3);
  ok('性能-粗筛后交点仍命中', hitI&&hitI.type==='intersection'&&hitI.p[0]===15&&hitI.p[1]===10);
  const hitP=api.findOsnap(st,[25,14],5);
  ok('性能-粗筛后垂足仍命中', hitP&&hitP.type==='perpendicular'&&hitP.p[0]===25&&hitP.p[1]===10);
  /* 鼠标在远处矩形群中：邻域粗筛不丢边/中点（竖边中点 (1040,1020) 距 0.14，优先于垂足） */
  const hitFar=api.findOsnap(st,[1040.1,1020.1],0.3);
  ok('性能-远处矩形邻域不被漏筛', hitFar&&['midpoint','perpendicular'].includes(hitFar.type)&&Math.abs(hitFar.p[0]-1040)<1e-9);
  /* 空旷处无命中（粗筛不误造候选） */
  eq('性能-空旷处无命中', api.findOsnap(st,[500,500],0.3), null);
}

});

/* 34. SVG 导出与画布语义一致：扇形弧/闭合边/面积角度文字/设备图标 ------------- */
await section("34. SVG 导出与画布语义一致：扇形弧/闭合边/面积角度文字/设备图标", async () => {
{
  /* 扇形场地 a0=30,a1=120：圆弧两端点必须不同（原 a0||0+sweep 优先级 bug 会退化为同点） */
  const st=api.resetState();
  st.site={id:'site.test',name:'场地',layerId:'layer.default',visible:true,locked:false,annot:{},style:{},updatedAt:'',
    kind:'sector',shape:{type:'sector',cx:0,cy:0,r:20,a0:30,a1:120}};
  st.objects.push(
    api.baseObject('line','line.custom',{name:'BOX',closed:true,points:[[0,0],[10,0],[10,10],[0,10]],x:0,y:0}),
    api.baseObject('dimension','dimension.distance',{name:'AR',subtype:'area',points:[[30,0],[40,0],[30,10]],x:30,y:0}),
    api.baseObject('dimension','dimension.distance',{name:'AN',subtype:'angle',points:[[60,0],[70,0],[60,10]],x:60,y:0}),
    api.baseObject('point','point.camera',{name:'CAM',x:80,y:80}),
    api.baseObject('rect','rect.area',{name:'RC',x:90,y:90,width:8,height:6})
  );
  const svg=api.buildSceneSvg();
  /* 扇形路径：L 终点(弧起始角端) 与 arc 终点必须不同（原 a0||0+sweep 优先级 bug 会退化为同点） */
  const sectorPath=svg.match(/<path d="M[\d.\- ,eLA]+Z" fill="#eef2f7"[^>]*>/);
  ok('SVG-扇形路径存在', !!sectorPath);
  const lEnd=(sectorPath?.[0]||'').match(/L(-?[\d.]+),(-?[\d.]+) A/);
  const aEnd=(sectorPath?.[0]||'').match(/1 (-?[\d.]+),(-?[\d.]+) Z"/);
  ok('SVG-扇形弧两端坐标均解析', !!(lEnd&&aEnd));
  ok('SVG-30°扇形弧两端不同', lEnd&&aEnd&&(Math.abs(+lEnd[1]-+aEnd[1])>1||Math.abs(+lEnd[2]-+aEnd[2])>1));
  /* 闭合折线：polyline 坐标点数量 = 节点数+1（首点回补，闭合边有描边） */
  const closedLine=svg.match(/<polyline points="([^"]+)"[^>]*>/g)?.find(s=>s.includes('fill="#'));
  const closedPts=closedLine?.match(/([-\d.]+),([-\d.]+)/g)||[];
  eq('SVG-闭合折线补回首点(5点串)', closedPts.length, 5);
  ok('SVG-面积标注文字', svg.includes('面积')&&svg.includes('周长'));
  ok('SVG-90°角度数值文字', svg.includes('90.00°'));
  /* 摄像头专有图标：机身+支架三角路径，不再是统一圆点 */
  ok('SVG-摄像头支架三角', svg.includes('L16,-5 L16,5'));
  ok('SVG-区域面积标签', svg.includes('㎡'));
  /* 球机图标分支 */
  st.objects.push(api.baseObject('point','point.dome',{name:'DOME',x:70,y:70}));
  ok('SVG-球机半圆图标', api.buildSceneSvg().includes('A8,8 0 0 1 8,0'));
  /* 逐对象「编号」开关：关闭后 SVG 不再输出该对象的名称标签（与画布所见一致） */
  const rcObj=st.objects.find(o=>o.name==='RC');
  api.setAnnot(rcObj,'name',false);
  ok('SVG-关闭编号后区域标签消失', !api.buildSceneSvg().includes('>RC<'));
  api.setAnnot(rcObj,'name',true);
  ok('SVG-编号开启时区域标签存在', api.buildSceneSvg().includes('>RC<'));
  const camObj=st.objects.find(o=>o.name==='CAM');
  api.setAnnot(camObj,'name',false);
  ok('SVG-关闭编号后点设备标签消失', !api.buildSceneSvg().includes('>CAM<'));
  /* 折线编号：开放与闭合折线都应输出（修复闭合折线不显示编号的缺陷） */
  const lnOpen=api.baseObject('line','line.custom',{name:'LOPEN',x:10,y:10,points:[[10,10],[30,10]]});
  const lnClosed=api.baseObject('line','line.custom',{name:'LCLOSED',x:40,y:40,points:[[40,40],[60,40],[60,60]],closed:true});
  st.objects.push(lnOpen,lnClosed);
  ok('SVG-开放折线输出编号', api.buildSceneSvg().includes('>LOPEN<'));
  ok('SVG-闭合折线输出编号', api.buildSceneSvg().includes('>LCLOSED<'));
  api.setAnnot(lnClosed,'name',false);
  ok('SVG-关闭编号后闭合折线标签消失', !api.buildSceneSvg().includes('>LCLOSED<'));
  ok('SVG-同组开放折线编号不受影响', api.buildSceneSvg().includes('>LOPEN<'));
}

});

/* 35. DXF 解析/生成往返 + 多页 PDF 结构 --------------------------------------- */
await section("35. DXF 解析/生成往返 + 多页 PDF 结构", async () => {
{
  /* 35.1 生成一段含 7 类实体的 R12 DXF 再解析回来 */
  const ents=[
    {type:'LWPOLYLINE',layer:'围墙',color:'#334155',points:[[0,0],[10,0],[10,10],[0,10]],closed:true},
    {type:'LINE',layer:'0',color:'#2563eb',points:[[1,1],[5,6]]},
    {type:'CIRCLE',layer:'设备',color:'#dc2626',x:20,y:20,r:5},
    {type:'POINT',layer:'设备',color:'#16a34a',x:30,y:30},
    {type:'TEXT',layer:'0',color:'#111111',x:0,y:15,text:'O0001 camera-01',height:.8}
  ];
  const dxf=api.Dxf.buildDxf(ents,[{name:'围墙',color:'#334155'},{name:'设备',color:'#dc2626'}]);
  ok('DXF-头AC1009', dxf.includes('$ACADVER')&&dxf.includes('AC1009'));
  ok('DXF-单位毫米INSUNITS=4', dxf.includes('$INSUNITS')&&dxf.includes('\r\n70\r\n4\r\n'));
  ok('DXF-含EOF', dxf.endsWith('EOF\r\n')||dxf.trimEnd().endsWith('EOF'));
  ok('DXF-图层表含围墙', dxf.includes('\r\n围墙\r\n'));
  const back=api.Dxf.parseDxf(dxf);
  eq('DXF-往返实体数5', back.entities.length, 5);
  const poly=back.entities.find(e=>e.type==='LWPOLYLINE'&&e.layer==='围墙');
  eq('DXF-闭合多段线4点', poly.points.length, 4);
  eq('DXF-闭合标志', poly.closed, true);
  /* 生成时米→毫米 ×1000，解析 INSUNITS=4 时毫米→米 /1000，回到原值 */
  approx('DXF-坐标往返0点', poly.points[0][0], 0, 1e-6);
  approx('DXF-坐标往返10m', poly.points[1][0], 10, 1e-6);
  /* LINE 在解析器中统一落地为开放 2 点 LWPOLYLINE（与 ARC/ELLIPSE 一致，方便同一套编辑） */
  const line=back.entities.find(e=>e.type==='LWPOLYLINE'&&!e.closed&&e.points.length===2);
  approx('DXF-LINE终点', line.points[1][0], 5, 1e-6);
  const circle=back.entities.find(e=>e.type==='CIRCLE');
  approx('DXF-圆半径5m', circle.r, 5, 1e-6);
  approx('DXF-圆心20m', circle.x, 20, 1e-6);
  const txt=back.entities.find(e=>e.type==='TEXT');
  eq('DXF-文本往返', txt.text, 'O0001 camera-01');
  approx('DXF-字高往返', txt.height, .8, 1e-6);
  const pt=back.entities.find(e=>e.type==='POINT');
  approx('DXF-点坐标', pt.y, 30, 1e-6);

  /* 35.2 解析外部常见形态：POLYLINE+VERTEX、$INSUNITS=1（英寸→米）、CRLF、多余段 */
  const sample=[
    '0','SECTION','2','HEADER','9','$INSUNITS','70','1','0','ENDSEC',
    '0','SECTION','2','ENTITIES',
    '0','POLYLINE','8','PIPE','70','1',
    '0','VERTEX','8','PIPE','10','0.0','20','0.0',
    '0','VERTEX','8','PIPE','10','39.370079','20','0.0',
    '0','SEQEND',
    '0','ENDSEC','0','EOF'
  ].join('\r\n');
  const imp=api.Dxf.parseDxf(sample);
  eq('DXF-英寸系数', Math.abs(imp.unit-0.0254)<1e-12, true);
  eq('DXF-POLYLINE解析1条', imp.entities.length, 1);
  const pl=imp.entities[0];
  eq('DXF-VERTEX累积2点', pl.points.length, 2);
  approx('DXF-39.37英寸≈1m', pl.points[1][0], 1, 1e-4);
  /* 仅 2 个顶点的闭合多段线是退化图形，降级为开放线（首尾边为零长度） */
  eq('DXF-2点闭合降级开放', pl.closed, false);

  /* 35.3 图层名清洗与颜色索引 */
  eq('DXF-非法图层名清洗', api.Dxf.safeLayer('a/b:c*'), 'a_b_c_');
  eq('DXF-红色ACI=1', api.Dxf.nearestAci('#ff0000'), 1);
  eq('DXF-绿色ACI=3', api.Dxf.nearestAci('#00ff00'), 3);

  /* 35.4 多页 PDF：xref/页对象/图片流结构正确 */
  const pdf=api.Pdf.buildImagePdf([
    {width:100,height:80,b64:''/*空JPEG仅验结构*/},
    {width:100,height:80,b64:''}
  ]);
  const head=String.fromCharCode(...pdf.slice(0,5));
  eq('PDF-魔数%PDF-', head, '%PDF-');
  const tail=String.fromCharCode(...pdf.slice(-5));
  eq('PDF-尾%%EOF', tail, '%%EOF');
  const all=String.fromCharCode(...pdf);
  eq('PDF-页数Count=2', /\/Count 2/.test(all), true);
  eq('PDF-两个DCT图片', (all.match(/\/Filter \/DCTDecode/g)||[]).length, 2);
  ok('PDF-两个页面对象', (all.match(/\/Type \/Page /g)||[]).length===2);
  ok('PDF-含startxref', all.includes('startxref'));
  /* xref 表每对象一行 10 位偏移 */
  ok('PDF-xref段存在', /xref\n0 \d+\n0000000000 65535 f /.test(all));
  /* 空页面列表抛错 */
  let threw=false; try{ api.Pdf.buildImagePdf([]); }catch(e){ threw=true; }
  eq('PDF-空页面拒绝', threw, true);

  /* A2：PDF 字节级 golden（只覆盖容器层；画布 JPEG 由浏览器编码，不在本判据内）
   * 输入固定 → 输出必须逐字节确定；基线文件用 UPDATE_GOLDEN=1 重建。 */
  const pdfPages=[
    {width:120,height:90,b64:'AAECAwQFBgcICQ=='},
    {width:64,height:48,b64:'CgsMDQ4PEA=='}
  ];
  const pdfA=api.Pdf.buildImagePdf(pdfPages);
  const pdfB=api.Pdf.buildImagePdf(pdfPages);
  const shaA=createHash('sha256').update(Buffer.from(pdfA)).digest('hex');
  const shaB=createHash('sha256').update(Buffer.from(pdfB)).digest('hex');
  eq('A2-PDF 同输入两次字节一致', shaA, shaB);
  const pdfGolden=join(root,'tests','golden','fixed-pages.pdf');
  if(process.env.UPDATE_GOLDEN==='1'){
    writeFileSync(pdfGolden,Buffer.from(pdfA));
  }else{
    ok('A2-PDF 容器逐字节 golden', Buffer.compare(Buffer.from(pdfA),readFileSync(pdfGolden))===0);
  }
  eq('A2-PDF golden SHA-256', shaA, createHash('sha256').update(readFileSync(pdfGolden)).digest('hex'));
}

});

/* 36. DXF 高级实体：凸度弧 / ELLIPSE / SPLINE / INSERT 块 / MTEXT ---------------- */
await section("36. DXF 高级实体：凸度弧 / ELLIPSE / SPLINE / INSERT 块 / MTEXT", async () => {
{
  const P=(c,v)=>c+'\n'+v+'\n';
  let s=P(0,'SECTION')+P(2,'HEADER')+P(9,'$INSUNITS')+P(70,0)+P(0,'ENDSEC');
  s+=P(0,'SECTION')+P(2,'BLOCKS');
  s+=P(0,'BLOCK')+P(8,'0')+P(2,'MK')+P(70,0)+P(10,0)+P(20,0)+P(30,0)+P(3,'MK');
  s+=P(0,'CIRCLE')+P(8,'0')+P(10,0)+P(20,0)+P(30,0)+P(40,2);
  s+=P(0,'LINE')+P(8,'PIPE')+P(10,0)+P(20,0)+P(30,0)+P(11,10)+P(21,0)+P(31,0);
  s+=P(0,'ENDBLK')+P(8,'0')+P(0,'ENDSEC');
  s+=P(0,'SECTION')+P(2,'ENTITIES');
  /* 凸度半圆：(0,0)→(10,0) b=1；AutoCAD 约定正凸度逆时针，+X 弦弧经过 (5,-5) */
  s+=P(0,'LWPOLYLINE')+P(8,'0')+P(90,2)+P(70,0)+P(10,0)+P(20,0)+P(42,1)+P(10,10)+P(20,0)+P(42,0);
  /* 圆角矩形闭合：10×10 方形、R=2，8 个相切点；4 条直边凸度 0，4 个内角弧凸度 -tan(22.5°) */
  const bb=(-Math.tan(Math.PI/8)).toFixed(10), z='0';
  const rv=(x,y,b)=>P(10,x)+P(20,y)+P(42,b);
  s+=P(0,'LWPOLYLINE')+P(8,'0')+P(90,8)+P(70,1)
    +rv(2,0,z)+rv(8,0,bb)+rv(10,2,z)+rv(10,8,bb)+rv(8,10,z)+rv(2,10,bb)+rv(0,8,z)+rv(0,2,bb);
  /* 椭圆：中心(20,20)，长轴 (10,0)，ratio .5，完整 */
  s+=P(0,'ELLIPSE')+P(8,'0')+P(10,20)+P(20,20)+P(30,0)+P(11,10)+P(21,0)+P(31,0)+P(40,.5)+P(41,0)+P(42,6.283185307179586);
  /* 椭圆弧：90°~270°（左半椭圆） */
  s+=P(0,'ELLIPSE')+P(8,'0')+P(10,60)+P(20,20)+P(30,0)+P(11,5)+P(21,0)+P(31,0)+P(40,1)+P(41,Math.PI/2)+P(42,3*Math.PI/2);
  /* 二次 B 样条：3 控制点，首末必通过 */
  s+=P(0,'SPLINE')+P(8,'0')+P(70,8)+P(71,2)+P(74,0)+P(73,3)+P(75,0)
    +P(10,40)+P(20,0)+P(10,50)+P(20,10)+P(10,60)+P(20,0);
  /* INSERT：块 MK（layer0 圆+PIPE 线）放到(100,100) 缩放2 */
  s+=P(0,'INSERT')+P(8,'TOP')+P(2,'MK')+P(10,100)+P(20,100)+P(30,0)+P(41,2)+P(42,2)+P(50,0);
  /* MTEXT 格式清洗 */
  s+=P(0,'MTEXT')+P(8,'0')+P(10,0)+P(20,30)+P(30,0)+P(40,2.5)+P(1,'{\\fArial;Hello}\\PWorld');
  s+=P(0,'ENDSEC')+P(0,'EOF');
  const r=api.Dxf.parseDxf(s);
  eq('高级-块定义被识别', r.blockCount, 1);
  const polylines=r.entities.filter(e=>e.type==='LWPOLYLINE');
  /* 凸度半圆：采样点密集，首(0,0) 末(10,0)，弧顶≈(5,-5) */
  const semi=polylines.find(p=>!p.closed&&p.points.length>2&&p.points[0][0]===0&&p.points.at(-1)[0]===10);
  ok('高级-半圆采样>10点', semi.points.length>10);
  const apex=semi.points.reduce((m,p)=>p[1]<m[1]?p:m,semi.points[0]);
  approx('高级-凸度弧顶(5,-5)x', apex[0], 5, 1e-6);
  approx('高级-凸度弧顶(5,-5)y', apex[1], -5, 1e-6);
  eq('高级-半圆首尾精确', Math.abs(semi.points.at(-1)[0]-10)<1e-9&&semi.points.at(-1)[1]===0, true);
  /* 圆角矩形：闭合、4 个角点保留且边中点在原 10×10 包络附近 */
  const rounded=polylines.find(p=>p.closed);
  ok('高级-圆角矩形闭合', rounded.closed);
  const rx=rounded.points.map(p=>p[0]), ry=rounded.points.map(p=>p[1]);
  approx('高级-圆角矩形包络x0', Math.min(...rx), 0, 1e-6);
  approx('高级-圆角矩形包络x10', Math.max(...rx), 10, 1e-6);
  approx('高级-圆角矩形包络y10', Math.max(...ry), 10, 1e-6);
  /* 圆角把尖角(10,0)切掉：所有点在包络内且不存在尖角顶点 */
  ok('高级-圆角不越界', rounded.points.every(q=>q[0]>=-1e-9&&q[0]<=10+1e-9&&q[1]>=-1e-9&&q[1]<=10+1e-9));
  ok('高级-角弧切点光滑(无10,0尖角)', !rounded.points.some(q=>Math.abs(q[0]-10)<1e-6&&Math.abs(q[1])<1e-6));
  /* 完整椭圆：x[10,30] y[15,25] 闭合 */
  const fullEll=polylines.find(p=>p.closed&&p.points.some(q=>q[0]>15&&q[0]<25));
  approx('高级-椭圆x左界', Math.min(...fullEll.points.map(q=>q[0])), 10, 1e-6);
  approx('高级-椭圆x右界', Math.max(...fullEll.points.map(q=>q[0])), 30, 1e-6);
  approx('高级-椭圆短轴半高', Math.max(...fullEll.points.map(q=>q[1]))-20, 5, 1e-6);
  /* 椭圆弧不闭合，起止点在 (60,20) 两端（左半圆上下端） */
  const arcEll=polylines.find(p=>!p.closed&&p.points.length>2&&p.points[0][0]===60);
  eq('高级-椭圆弧开放', arcEll.closed, false);
  approx('高级-椭圆弧端点x=60', arcEll.points.at(-1)[0], 60, 1e-6);
  ok('高级-椭圆弧全部在左半(x≤60)', arcEll.points.every(q=>q[0]<=60+1e-9));
  /* 样条首末通过控制点 */
  const sp=polylines.find(p=>!p.closed&&p.points[0][0]===40);
  approx('高级-样条起点', sp.points[0][0], 40, 1e-9);
  approx('高级-样条终点', sp.points.at(-1)[0], 60, 1e-9);
  approx('高级-二次样条中点(50,5)', sp.points[Math.floor(sp.points.length/2)][1], 5, 1e-6);
  /* INSERT 展开：layer0 圆继承 TOP、r=4 中心(100,100)；PIPE 线保持图层、终点(120,100) */
  const ic=r.entities.find(e=>e.type==='CIRCLE');
  eq('高级-INSERT圆继承图层', ic.layer, 'TOP');
  approx('高级-INSERT圆中心', ic.x, 100, 1e-9);
  approx('高级-INSERT圆缩放r=4', ic.r, 4, 1e-9);
  const il=polylines.find(p=>p.layer==='PIPE');
  approx('高级-INSERT线终点', il.points[1][0], 120, 1e-9);
  /* MTEXT */
  const mt=r.entities.find(e=>e.type==='TEXT'&&e.text.includes('Hello'));
  eq('高级-MTEXT清洗', mt.text, 'Hello World');
  approx('高级-MTEXT字高', mt.height, 2.5, 1e-9);
}

});

/* 36.1 B-03：DXF 版本审计 + SOLID/3DFACE/LEADER/ATTRIB 补充解析矩阵 --------------- */
await section("36.1 B-03：DXF 版本审计 + SOLID/3DFACE/LEADER/ATTRIB 补充解析矩阵", async () => {
{
  const P=(c,v)=>c+'\n'+v+'\n';
  const head=ver=>P(0,'SECTION')+P(2,'HEADER')+P(9,'$ACADVER')+P(1,ver)+P(9,'$INSUNITS')+P(70,4)+P(0,'ENDSEC');
  const sample=ver=>head(ver)+P(0,'SECTION')+P(2,'ENTITIES')
    +P(0,'LINE')+P(8,'WALL')+P(10,0)+P(20,0)+P(11,10)+P(21,0)
    +P(0,'CIRCLE')+P(8,'0')+P(10,20)+P(20,20)+P(40,5)
    /* SOLID：DXF 约定 12/13 与视觉顺序相反，适配层重排为 0,1,3,2 */
    +P(0,'SOLID')+P(8,'FLOOR')+P(10,0)+P(20,0)+P(11,10)+P(21,0)+P(12,0)+P(22,10)+P(13,10)+P(23,10)
    /* 3DFACE：按自然顺序 0,1,2,3 */
    +P(0,'3DFACE')+P(8,'WALL')+P(10,30)+P(20,0)+P(11,40)+P(21,0)+P(12,40)+P(22,10)+P(13,30)+P(23,10)
    +P(0,'LEADER')+P(8,'TAG')+P(10,0)+P(20,30)+P(10,5)+P(20,30)+P(10,5)+P(20,35)
    +P(0,'ATTRIB')+P(8,'TEXT')+P(10,30)+P(20,40)+P(40,2)+P(1,'门牌 A')
    +P(0,'DIMENSION')+P(8,'0')+P(10,0)+P(20,0)
    +P(0,'ENDSEC')+P(0,'EOF');
  const versions={AC1009:'R12',AC1014:'R14',AC1015:'2000',AC1018:'2004',AC1021:'2007',AC1024:'2010',AC1027:'2013',AC1032:'2018'};
  for(const [ver,name] of Object.entries(versions)){
    const meta=api.Dxf.inspect(sample(ver));
    eq('B-03-版本识别 '+ver, meta.version, ver);
    eq('B-03-版本名称 '+ver, meta.versionName, name);
    eq('B-03-已知版本 '+ver, meta.knownVersion, true);
    const r=api.Dxf.parseDxf(sample(ver));
    eq('B-03-可解析实体数 '+ver, r.entities.length, 6);   /* LINE/SOLID/3DFACE/LEADER→折线 + 圆 + ATTRIB→文字 */
    eq('B-03-补充实体数 '+ver, r.supplemental, 4);
    eq('B-03-不支持的 DIMENSION '+ver, r.inspect.unsupportedTypes.DIMENSION, 1);
    eq('B-03-支持计数 '+ver, r.inspect.supportedCount, 6);
  }
  const r=api.Dxf.parseDxf(sample('AC1032'));
  const solid=r.entities.find(e=>e.source==='SOLID');
  eq('B-03-SOLID 闭合', solid.closed, true);
  eq('B-03-SOLID 顺序重排', JSON.stringify(solid.points), JSON.stringify([[0,0],[0.01,0],[0.01,0.01],[0,0.01]]));
  const face=r.entities.find(e=>e.source==='3DFACE');
  eq('B-03-3DFACE 顺序保持', JSON.stringify(face.points), JSON.stringify([[0.03,0],[0.04,0],[0.04,0.01],[0.03,0.01]]));
  const lead=r.entities.find(e=>e.source==='LEADER');
  eq('B-03-LEADER 三点开放', lead.points.length===3&&!lead.closed, true);
  eq('B-03-ATTRIB 转文字', r.entities.find(e=>e.source==='ATTRIB').text, '门牌 A');
  approx('B-03-ATTRIB 字高', r.entities.find(e=>e.source==='ATTRIB').height, 0.002, 1e-9);
  /* 单位换算同样作用到补充实体：INSUNITS=4（毫米）→ 米 */
  const mm=api.Dxf.parseDxf(head('AC1032')+P(0,'SECTION')+P(2,'ENTITIES')
    +P(0,'3DFACE')+P(8,'0')+P(10,0)+P(20,0)+P(11,1000)+P(21,0)+P(12,1000)+P(22,1000)+P(13,0)+P(23,1000)
    +P(0,'ENDSEC')+P(0,'EOF'));
  approx('B-03-补充实体单位换算', mm.entities[0].points[1][0], 1, 1e-9);
  /* 二进制 DXF 明确拒绝；未知版本如实标记 */
  const bin=api.Dxf.inspect('AutoCAD Binary DXF\r\n\u0000\u0000more');
  eq('B-03-二进制识别', bin.binary, true);
  eq('B-03-二进制不产出实体', api.Dxf.parseDxf('AutoCAD Binary DXF\r\n\u0000\u0000more').entities.length, 0);
  const unk=api.Dxf.inspect(head('AC1099'));
  eq('B-03-未知版本保留代码', unk.version, 'AC1099');
  eq('B-03-未知版本不标已知', unk.knownVersion, false);
  /* R12 POLYLINE 的 VERTEX 42 凸度：如实计数（当前按折线导入，弧段拉直） */
  const r12=api.Dxf.inspect(head('AC1009')+P(0,'SECTION')+P(2,'ENTITIES')
    +P(0,'POLYLINE')+P(8,'0')+P(70,0)+P(0,'VERTEX')+P(8,'0')+P(10,0)+P(20,0)+P(42,0.5)
    +P(0,'VERTEX')+P(8,'0')+P(10,10)+P(20,0)+P(0,'SEQEND')+P(0,'ENDSEC')+P(0,'EOF'));
  eq('B-03-R12 凸度丢失计数', r12.r12Bulge, 1);
  const onlyDim=api.Dxf.parseDxf(head('AC1032')+P(0,'SECTION')+P(2,'ENTITIES')
    +P(0,'DIMENSION')+P(8,'0')+P(10,0)+P(20,0)+P(0,'HATCH')+P(8,'0')+P(10,0)+P(20,0)
    +P(0,'ENDSEC')+P(0,'EOF'));
  eq('B-03-仅不支持实体不产出对象', onlyDim.entities.length, 0);
  eq('B-03-不支持类型如实记录', Object.keys(onlyDim.inspect.unsupportedTypes).sort().join(','), 'DIMENSION,HATCH');
}

});

/* 36.2 B-02：DWG 版本识别 + DXF 预检保真度/单位确认/参考层命名 ---------------------- */
await section("36.2 B-02：DWG 版本识别 + DXF 预检保真度/单位确认/参考层命名", async () => {
{
  const P=(c,v)=>c+'\n'+v+'\n';
  const head=ver=>P(0,'SECTION')+P(2,'HEADER')+P(9,'$ACADVER')+P(1,ver)+P(9,'$INSUNITS')+P(70,4)+P(0,'ENDSEC');
  const mk=head('AC1032')+P(0,'SECTION')+P(2,'ENTITIES')
    +P(0,'LINE')+P(8,'WALL')+P(10,0)+P(20,0)+P(11,1000)+P(21,0)
    +P(0,'DIMENSION')+P(8,'0')+P(10,0)+P(20,0)
    +P(0,'ENDSEC')+P(0,'EOF');
  /* DWG 文件头：AC10xx 版本码 */
  eq('B-02-DWG-2018 版本码', api.dwgVersionInfo('AC1032xxxx').code, 'AC1032');
  eq('B-02-DWG-2018 别名', api.dwgVersionInfo('AC1032xxxx').name, '2018');
  eq('B-02-DWG-R12 别名', api.dwgVersionInfo('AC1009abcd').name, 'R12');
  eq('B-02-DWG-未知版本保留码', api.dwgVersionInfo('AC1099abcd').name, '');
  ok('B-02-DWG-未知版本显式提示', api.dwgVersionInfo('AC1099abcd').label.includes('未知版本'));
  ok('B-02-DWG-非 DWG 头如实提示', api.dwgVersionInfo('PK\u0003\u0004zipfile').label.includes('无法识别'));
  /* 参考层命名：去扩展名、限长、带版本 */
  eq('B-02-参考层去扩展名', api.dxfRefLayerName('floor-1.dxf','AC1024'), 'DXF参考 · floor-1 · AC1024');
  eq('B-02-参考层缺省名', api.dxfRefLayerName('', ''), 'DXF参考 · 未命名');
  ok('B-02-参考层名截断 40 字', api.dxfRefLayerName('x'.repeat(80)+'.dxf','').length <= 'DXF参考 · '.length+40);
  /* 保真度报告：版本 / 单位 / 实体 / 不支持类型全部可读 */
  const meta=api.Dxf.inspect(mk), parsed=api.Dxf.parseDxf(mk,{strictUnits:true});
  const lines=api.dxfFidelityLines(meta,parsed);
  ok('B-02-保真度含版本行', lines.some(l=>l.startsWith('版本：AC1032')));
  ok('B-02-保真度含单位行', lines.some(l=>l.includes('毫米')&&l.includes('$INSUNITS=4')));
  ok('B-02-保真度含实体数', lines.some(l=>l.startsWith('可导入实体：')));
  ok('B-02-保真度如实列出 DIMENSION', lines.some(l=>l.includes('DIMENSION')));
  eq('B-02-保真度为纯文本行数组', Array.isArray(lines)&&lines.every(l=>typeof l==='string'), true);
  /* 单位确认：文件声明毫米，用户改按米 → 几何整体 ×1000 */
  const asMeter=api.Dxf.parseDxf(mk,{strictUnits:true,forceUnit:6});
  approx('B-02-单位确认毫米改米', asMeter.entities.find(e=>e.type==='LWPOLYLINE').points[1][0], 1000, 1e-6);
  eq('B-02-单位确认写回 unit', asMeter.unit, 1);
  /* auto 保持文件单位，不改几何 */
  const auto=api.Dxf.parseDxf(mk,{strictUnits:true,forceUnit:null});
  approx('B-02-单位 auto 保持原值', auto.entities.find(e=>e.type==='LWPOLYLINE').points[1][0], 1, 1e-9);
  approx('B-02-单位 auto 写回 unit', auto.unit, 0.001, 1e-12);
  /* 无 $INSUNITS 时按米处理，不因 forceUnit 缺失而漂移 */
  const noUnit=api.Dxf.parseDxf(P(0,'SECTION')+P(2,'ENTITIES')+P(0,'LINE')+P(8,'0')
    +P(10,0)+P(20,0)+P(11,5)+P(21,0)+P(0,'ENDSEC')+P(0,'EOF'),{strictUnits:true});
  approx('B-02-未声明单位按米', noUnit.entities[0].points[1][0], 5, 1e-9);
}


});

/* 37. PDF 读取器：矢量路径/文本（未压缩流）+ Flate 栅格重组 PNG + DCT JPEG ------ */
await section("37. PDF 读取器：矢量路径/文本（未压缩流）+ Flate 栅格重组 PNG + DCT JPEG", async () => {
asyncSuites.push((async()=>{
  const toLatin=bytes=>{ let s=''; for(let i=0;i<bytes.length;i++) s+=String.fromCharCode(bytes[i]); return s; };
  /* 内容流：描边矩形、直线、填充矩形 + 一段标准字体文本 */
  const content='1 0 0 1 0 0 cm\n10 10 100 50 re S\n50 50 m 150 60 l S\n20 20 30 30 re f\nBT /F1 12 Tf 50 80 Td (Hello World) Tj ET\n';
  /* 2×1 RGB 原始像素 → Flate（/Predictor 1），验证解压后重组 PNG */
  const rgb=new Uint8Array([255,0,0, 0,255,0]);
  const z=deflateSync(rgb);
  const obj=(n,body)=>n+' 0 obj\n'+body+'\nendobj\n';
  let pdf='%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n';
  pdf+=obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  pdf+=obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  pdf+=obj(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R >>');
  pdf+=obj(4,'<< /Length '+content.length+' >>\nstream\n'+content+'endstream');
  pdf+=obj(5,'<< /Type /XObject /Subtype /Image /Width 2 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 '+
        '/Filter /FlateDecode /DecodeParms << /Predictor 1 /Columns 2 /Colors 3 >> /Length '+z.length+' >>\nstream\n'+toLatin(z)+'endstream');
  pdf+=obj(6,'<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length 4 >>\nstream\n'+toLatin(new Uint8Array([0xFF,0xD8,0xFF,0xE0]))+'endstream');
  const r=await api.PdfRead.parsePdf(pdf);
  approx('PDF-页宽200点', r.pageWidth, 200, 1e-9);
  approx('PDF-页高100点', r.pageHeight, 100, 1e-9);
  eq('PDF-路径3条', r.paths.length, 3);
  const rect=r.paths.find(p=>p.closed&&!p.filled);
  const fill=r.paths.find(p=>p.filled);
  const line=r.paths.find(p=>!p.closed);
  eq('PDF-矩形闭合4点', rect.points.length, 4);
  approx('PDF-矩形角点(110,60)', rect.points[2][0], 110, 1e-9);
  eq('PDF-直线开放2点', line.points.length, 2);
  approx('PDF-直线终点', line.points[1][0], 150, 1e-9);
  eq('PDF-填充矩形识别', fill.closed, true);
  eq('PDF-文本1段', r.texts.length, 1);
  eq('PDF-文本内容', r.texts[0].text, 'Hello World');
  approx('PDF-文本定位(50,80)', r.texts[0].x, 50, 1e-9);
  approx('PDF-字号12点', r.texts[0].size, 12, 1e-9);
  eq('PDF-内嵌图2张', r.images.length, 2);
  /* 最大者为 2×1 的 Flate 图，已重组为 PNG */
  const png=r.images[0];
  eq('PDF-Flate图选最大', png.width*png.height, 2);
  eq('PDF-PNG魔数', png.bytes[0]===0x89&&png.bytes[1]===0x50&&png.bytes[2]===0x4e&&png.bytes[3]===0x47, true);
  /* IHDR：宽在偏移16、高在偏移20（大端） */
  const dv=new DataView(png.bytes.buffer,png.bytes.byteOffset,png.bytes.byteLength);
  eq('PDF-PNG宽2', dv.getUint32(16), 2);
  eq('PDF-PNG高1', dv.getUint32(20), 1);
  /* 像素保真：重组后 IDAT 前的扫描行 filter=0 + 原 6 像素字节（取首个 IDAT 之外不便定位，验证长度=2行*(1+6)） */
  ok('PDF-PNG含像素字节', png.bytes.length>14+14);
  /* 次大图为 DCT JPEG */
  const jpg=r.images[1];
  eq('PDF-JPEG魔数', jpg.bytes[0]===0xFF&&jpg.bytes[1]===0xD8, true);
  eq('PDF-JPEG类型', jpg.mime, 'image/jpeg');
  /* 空/坏 PDF */
  let threw=0;
  try{ await api.PdfRead.parsePdf('not a pdf at all'); }catch(e){ threw++; }
  eq('PDF-坏文件拒绝', threw, 1);
  /* CID 乱码文本过滤 */
  eq('PDF-CID乱码丢弃', api.PdfRead.looksLikeCidGarbage('\u0001\u0002\u0003'), true);
  eq('PDF-拉丁文本保留', api.PdfRead.looksLikeCidGarbage('Building A-101'), false);
})());

});

/* 37b. B-13 多页 PDF：页序 / 每页独立原点 / 导出回读往返 -------------------- */
await section("37b. B-13 多页 PDF：页序 / 每页独立原点 / 导出回读往返", async () => {
asyncSuites.push((async()=>{
  const obj=(n,body)=>n+' 0 obj\n'+body+'\nendobj\n';
  /* /Kids 顺序故意与对象编号相反：对象 3 是第二页（宽 300），对象 5 是第一页（宽 200） */
  const c1='0 0 m 100 0 l S\n', c2='0 0 m 160 0 l S\n';
  let s='%PDF-1.4\n';
  s+=obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  s+=obj(2,'<< /Type /Pages /Kids [5 0 R 3 0 R] /Count 2 >>');
  s+=obj(3,'<< /Type /Page /Parent 2 0 R /MediaBox [10 20 310 220] /Contents 4 0 R >>');
  s+=obj(4,'<< /Length '+c2.length+' >>\nstream\n'+c2+'endstream');
  s+=obj(5,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 6 0 R >>');
  s+=obj(6,'<< /Length '+c1.length+' >>\nstream\n'+c1+'endstream');
  const r=await api.PdfRead.parsePdf(s);
  eq('B-13-页数2', r.pageCount, 2);
  eq('B-13-页序按Kids', r.pages.map(p=>p.pageNo).join(','), '1,2');
  approx('B-13-第一页宽200', r.pages[0].width, 200, 1e-9);
  approx('B-13-第二页宽300', r.pages[1].width, 300, 1e-9);
  approx('B-13-第二页源原点x=10', r.pages[1].origin[0], 10, 1e-9);
  /* 每页局部坐标各自归零：第一页尾 100，第二页尾 160-10=150 */
  approx('B-13-页1线尾100', r.pages[0].paths[0].points[1][0], 100, 1e-9);
  approx('B-13-页2线尾150', r.pages[1].paths[0].points[1][0], 150, 1e-9);
  /* 落点：maxW=300 → gap=24；第二页 x=200+24，页间不重叠 */
  const plan=api.PdfRead.layoutPdfPages(r.pages);
  eq('B-13-页1原点0', plan[0].x, 0);
  approx('B-13-页2原点224', plan[1].x, 224, 1e-9);
  ok('B-13-页面不重叠', plan[0].x+plan[0].width < plan[1].x);
  /* 导出→回读：页数/页序/尺寸保持，落点仍独立 */
  const out=api.Pdf.buildImagePdf([
    {width:200,height:100,b64:''},
    {width:100,height:200,b64:''}
  ]);
  const back=await api.PdfRead.parsePdf(new Uint8Array(out));
  eq('B-13-往返页数', back.pageCount, 2);
  eq('B-13-往返页序宽', back.pages.map(p=>Math.round(p.width)).join(','), '200,100');
  eq('B-13-往返页高', back.pages.map(p=>Math.round(p.height)).join(','), '100,200');
  approx('B-13-往返第二页独立原点', api.PdfRead.layoutPdfPages(back.pages)[1].x, 216, 1e-9);
})());

});

/* 37c. N-09 PDF 导入 CTM：曲线采样与文本坐标统一到设备空间 --------------- */
await section("37c. N-09 PDF 导入 CTM：曲线与文本随 /cm 变换", async () => {
asyncSuites.push((async()=>{
  const obj=(n,body)=>n+' 0 obj\n'+body+'\nendobj\n';
  /* 起点(10,10)、控制点(20,20)(30,30)(40,40)：t=0.5 采样在中点 25，终点 40 */
  const base='10 10 m 20 20 30 30 40 40 c S\nBT /F1 12 Tf 5 7 Td (CTM) Tj ET\n';
  const build=body=>{
    let s='%PDF-1.4\n';
    s+=obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
    s+=obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    s+=obj(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R >>');
    s+=obj(4,'<< /Length '+body.length+' >>\nstream\n'+body+'endstream');
    return s;
  };
  const plain=await api.PdfRead.parsePdf(build(base));
  const scaled=await api.PdfRead.parsePdf(build('q 2 0 0 2 0 0 cm\n'+base+'Q\n'));
  const op=plain.paths[0].points, sp=scaled.paths[0].points;
  approx('N09-无CTM曲线中点25', op[4][0], 25, 1e-9);
  approx('N09-无CTM曲线终点40', op[8][0], 40, 1e-9);
  approx('N09-CTM曲线中点50', sp[4][0], 50, 1e-9);
  approx('N09-CTM曲线终点80', sp[8][0], 80, 1e-9);
  approx('N09-无CTM文本x5', plain.texts[0].x, 5, 1e-9);
  approx('N09-无CTM文本y7', plain.texts[0].y, 7, 1e-9);
  approx('N09-CTM文本x10', scaled.texts[0].x, 10, 1e-9);
  approx('N09-CTM文本y14', scaled.texts[0].y, 14, 1e-9);
  eq('N09-文本内容不变', scaled.texts[0].text, 'CTM');
})());

});

/* 38. 视场覆盖率分析：扇形/圆形覆盖判定 + 栅格覆盖率与盲区 ------------------- */
await section("38. 视场覆盖率分析：扇形/圆形覆盖判定 + 栅格覆盖率与盲区", async () => {
{
  api.resetState();
  /* 20×20 区域（面积400），先不放点设备 → 全盲 */
  api.state.objects.push(api.baseObject('rect','rect.area',{name:'P1',x:0,y:0,width:20,height:20}));
  let r=api.analyzeCoverage(api.state);
  eq('覆盖-区域数1', r.regions.length, 1);
  eq('覆盖-无设备相机数0', r.cameraCount, 0);
  approx('覆盖-无设备覆盖率0', r.ratio, 0, 1e-9);
  approx('覆盖-无设备盲区=总面积', r.totalBlind, 400, 1e-6);

  /* 球机（圆形覆盖）phys=1000→半径500，完全覆盖 */
  api.state.objects.push(api.baseObject('point','point.dome',{name:'D1',x:10,y:10,phys:1000}));
  r=api.analyzeCoverage(api.state);
  eq('覆盖-球机计数1', r.cameraCount, 1);
  approx('覆盖-全圆覆盖率≈1', r.ratio, 1, 1e-6);
  approx('覆盖-全圆盲区≈0', r.totalBlind, 0, 1e-3);

  /* 换成摄像头（扇形90°，0°朝 +X）：仅右半锥覆盖，覆盖率≈0.25 */
  api.state.objects[1]=api.baseObject('point','point.camera',{name:'C1',x:10,y:10,phys:1000,angle:0});
  r=api.analyzeCoverage(api.state);
  eq('覆盖-扇形计数1', r.cameraCount, 1);
  ok('覆盖-扇形部分覆盖(0<ratio<1)', r.ratio>0.15&&r.ratio<0.45);
  ok('覆盖-扇形盲区>0', r.totalBlind>0);

  /* footprint 判定单测：0°=+X，半径=phys（扇形）/ phys/2（圆） */
  const cam=api.cameraFootprint(api.baseObject('point','point.camera',{x:0,y:0,phys:10,angle:0}));
  eq('覆盖-footprint扇形类型', cam.kind, 'sector');
  eq('覆盖-扇形半径=phys', cam.r, 10);
  eq('覆盖-锥内点命中', api.pointInFootprint([5,0],cam), true);
  eq('覆盖-反方向点不命中', api.pointInFootprint([-5,0],cam), false);
  eq('覆盖-超半径点不命中', api.pointInFootprint([20,0],cam), false);
  const dome=api.cameraFootprint(api.baseObject('point','point.dome',{x:0,y:0,phys:10}));
  eq('覆盖-circle半径=phys/2', dome.r, 5);
  eq('覆盖-圆内点命中', api.pointInFootprint([4,0],dome), true);
  /* fov=360 扇形退化为整圆，不再受朝向限制 */
  const ctype=api.state.objectTypes.find(t=>t.id==='point.camera');
  const oldFov=ctype.fov; ctype.fov=360;
  const cam360=api.cameraFootprint(api.baseObject('point','point.camera',{x:0,y:0,phys:10,angle:0}));
  eq('覆盖-360视场=圆', cam360.kind, 'circle');
  eq('覆盖-360背后点也命中', api.pointInFootprint([-5,0],cam360), true);
  ctype.fov=oldFov;
  /* 纯位置图标点（phys=0）不计入覆盖 */
  eq('覆盖-图标点无footprint', api.cameraFootprint(api.baseObject('point','point.marker',{x:0,y:0,phys:0})), null);

  /* 统计区域来源：闭合折线计入，开放折线不计入 */
  api.resetState();
  api.state.objects.push(
    api.baseObject('line','line.custom',{name:'Z1',closed:true,points:[[0,0],[10,0],[10,10],[0,10]],x:0,y:0}),
    api.baseObject('line','line.custom',{name:'Z2',closed:false,points:[[0,0],[10,0]],x:0,y:0}),
    api.baseObject('point','point.marker',{x:1,y:1,phys:0})
  );
  const rg=api.regionPolygons(api.state);
  eq('覆盖-仅闭合折线计入', rg.length, 1);
  eq('覆盖-闭合折线名', rg[0].name, 'Z1');
  eq('覆盖-图标点计入忽略数', api.analyzeCoverage(api.state).ignoredPoints, 1);
  eq('覆盖-多边形包围盒', (()=>{const bb=api.polygonBBox(rg[0].points);return [bb.minX,bb.minY,bb.maxX,bb.maxY];})(), [0,0,10,10]);
}

});

/* 39. 仿射校准：像素↔世界映射 / 相似与完整仿射求解 / 旧对象随映射迁移 ---------- */
await section("39. 仿射校准：像素↔世界映射 / 相似与完整仿射求解 / 旧对象随映射迁移", async () => {
{
  /* 39.1 缺省（轴对齐）映射与往返：像素 v 向下、世界 y 向上 */
  const bg={kind:'image',width:100,height:10,metersPerPixel:0.1,transform:null};
  approx('仿射-缺省a项=mpp', api.defaultImageTransform(bg).a, 0.1, 1e-12);
  approx('仿射-缺省e项=-mpp', api.defaultImageTransform(bg).e, -0.1, 1e-12);
  approx('仿射-缺省f项=高×mpp', api.defaultImageTransform(bg).f, 1, 1e-12);
  eq('仿射-像素(30,4)→世界', api.bgPixelToWorld(bg,[30,4]), [3,0.6]);
  eq('仿射-世界(3,0.6)→像素', api.bgWorldToPixel(bg,[3,0.6]), [30,4]);
  eq('仿射-四角世界坐标', api.imageCornerWorld(bg), [[0,1],[10,1],[10,0],[0,0]]);

  /* 39.2 2 点求相似（纯放大 2×、无旋转）：像素(0,0)(10,0) → 世界(0,0)(20,0) */
  const s2=api.solveImageAffine([{u:0,v:0,x:0,y:0},{u:10,v:0,x:20,y:0}]);
  approx('仿射-相似a=2', s2.T.a, 2, 1e-9);
  approx('仿射-相似e=-2', s2.T.e, -2, 1e-9);
  approx('仿射-相似b=0', s2.T.b, 0, 1e-9);
  approx('仿射-相似d=0', s2.T.d, 0, 1e-9);
  approx('仿射-相似缩放=2', s2.scale, 2, 1e-9);
  eq('仿射-相似标志', s2.isSimilarity, true);
  /* 2 点含 45° 旋转：像素(0,0)(1,0) → 世界(0,0)(0,1)（世界 +Y） */
  const rot=api.solveImageAffine([{u:0,v:0,x:0,y:0},{u:1,v:0,x:0,y:1}]);
  approx('仿射-45旋转scale=1', rot.scale, 1, 1e-9);
  approx('仿射-45旋转角', rot.rotationDeg, 90, 1e-9);   /* y-down 像素系中 +90° */
  /* 两点退化（重合像素）应抛错 */
  let threw=0; try{ api.solveImageAffine([{u:1,v:1,x:0,y:0},{u:1,v:1,x:5,y:5}]); }catch(e){ threw++; }
  eq('仿射-重合点拒绝', threw, 1);

  /* 39.3 3 点最小二乘完整仿射：精确还原已知系数 */
  const pairs=[
    {u:0,v:0,x:10,y:5},
    {u:100,v:0,x:210,y:-25},
    {u:0,v:100,x:60,y:155}
  ];
  const f3=api.solveImageAffine(pairs);
  approx('仿射-完整a', f3.T.a, 2, 1e-6);
  approx('仿射-完整b', f3.T.b, 0.5, 1e-6);
  approx('仿射-完整c', f3.T.c, 10, 1e-6);
  approx('仿射-完整d', f3.T.d, -0.3, 1e-6);
  approx('仿射-完整e', f3.T.e, 1.5, 1e-6);
  approx('仿射-完整f', f3.T.f, 5, 1e-6);
  eq('仿射-非相似标志', f3.isSimilarity, false);
  /* 6 系数全有限且行列式非退化的才判有效 */
  ok('仿射-有效性校验通过', !!api.validImageTransform(f3.T));
  eq('仿射-全零transform无效', api.validImageTransform({a:0,b:0,c:0,d:0,e:0,f:0}), null);
  eq('仿射-缺字段无效', api.validImageTransform({a:1,b:0}), null);

  /* 39.4 图片四角世界包围框：含负 min 的旋转+缩放 */
  const rotBg={kind:'image',width:10,height:20,transform:{a:0,b:-2,c:0,d:2,e:0,f:0}};
  const fr=api.imageWorldFrame(rotBg);
  eq('仿射-旋转框minX', fr.minX, -40);
  eq('仿射-旋转框maxY', fr.maxY, 20);
  approx('仿射-旋转框w', fr.w, 40, 1e-9);
  approx('仿射-旋转框h', fr.h, 20, 1e-9);

  /* 39.5 仿射矩阵基本运算：逆 × 原 = 单位阵；组合映射等价逐步映射 */
  const T=[2,0.5,10,-0.3,1.5,5];
  const Ti=api.affInv(T);
  const I=api.affMul(Ti,T);
  approx('仿射-逆×原≈单位a', I[0], 1, 1e-9);
  approx('仿射-逆×原≈单位e', I[4], 1, 1e-9);
  approx('仿射-逆×原≈单位c', I[2], 0, 1e-9);
  approx('仿射-逆×原≈单位f', I[5], 0, 1e-9);
  eq('仿射-单点映射', api.affApply(T,[100,0]), [210,-25]);
  eq('仿射-复合映射=逐步', api.affApply(api.affMul(T,[2,0,0,0,2,0]),[3,4]), api.affApply(T,api.affApply([2,0,0,0,2,0],[3,4])));

  /* 39.6 旧对象迁移：相似缩放（点/线/圆/矩形精确同步） */
  const objs=[
    api.baseObject('point','point.marker',{x:5,y:7,angle:0,phys:4}),
    api.baseObject('line','line.custom',{points:[[0,0],[3,4]],x:0,y:0}),
    api.baseObject('rect','rect.area',{x:5,y:7,shape:{type:'circle',r:3}}),
    api.baseObject('rect','rect.area',{x:0,y:0,width:4,height:2,angle:0,shape:null})
  ];
  api.migrateObjectsByAffine(objs,[2,0,0,0,2,0]);   /* 纯放大 2× */
  eq('迁移-点坐标×2', [objs[0].x,objs[0].y], [10,14]);
  approx('迁移-点物理尺寸×2', objs[0].phys, 8, 1e-9);
  eq('迁移-折线节点×2', objs[1].points[1], [6,8]);
  approx('迁移-圆半径×2', objs[2].shape.r, 6, 1e-9);
  eq('迁移-圆仍为圆', objs[2].shape.type, 'circle');
  approx('迁移-矩形宽×2', objs[3].width, 8, 1e-9);
  approx('迁移-矩形高×2', objs[3].height, 4, 1e-9);

  /* 39.7 一般仿射（不等比）：圆升级为椭圆，矩形按主轴伸缩 */
  const objs2=[
    api.baseObject('rect','rect.area',{x:5,y:7,shape:{type:'circle',r:3}}),
    api.baseObject('rect','rect.area',{x:0,y:0,width:4,height:2,angle:0,shape:null})
  ];
  api.migrateObjectsByAffine(objs2,[2,0,0,0,3,0]);   /* x×2, y×3 */
  eq('迁移-非等比圆→椭圆', objs2[0].shape.type, 'ellipse');
  approx('迁移-椭圆rx', objs2[0].shape.rx, 6, 1e-9);
  approx('迁移-椭圆ry', objs2[0].shape.ry, 9, 1e-9);
  approx('迁移-非等比矩形宽', objs2[1].width, 8, 1e-9);
  approx('迁移-非等比矩形高', objs2[1].height, 6, 1e-9);

  /* 39.8 B-12：applyWorldTransform 统一迁移对象 + 场地 + 底图（含已有仿射 transform） */
  {
    const st=api.resetState();
    st.objects.push(api.baseObject('point','point.marker',{x:10,y:10,angle:0,phys:2}));
    st.site={kind:'rect',shape:{type:'rect',x:-5,y:-2,w:100,h:70}};
    st.background={kind:'image',width:800,height:600,metersPerPixel:1,calibrated:true,
      transform:{a:1,b:0,c:0,d:0,e:-1,f:600}};
    const r=api.applyWorldTransform([2,0,0,0,2,0],{site:true});
    eq('B-12-返回摘要', {ok:r.ok,objects:r.objects,site:r.site,background:r.background}, {ok:true,objects:1,site:true,background:true});
    eq('B-12-对象坐标×2', [st.objects[0].x,st.objects[0].y], [20,20]);
    approx('B-12-设备物理尺寸×2', st.objects[0].phys, 4, 1e-9);
    eq('B-12-场地基点×2', [st.site.shape.x,st.site.shape.y], [-10,-4]);
    approx('B-12-场地宽×2', st.site.shape.w, 200, 1e-9);
    approx('B-12-场地高×2', st.site.shape.h, 140, 1e-9);
    eq('B-12-场地类型保持', st.site.kind, 'rect');
    /* 底图：S∘T，且 m/p 与显式 transform 的等效比例一致 */
    approx('B-12-底图 transform a', st.background.transform.a, 2, 1e-9);
    approx('B-12-底图 transform e', st.background.transform.e, -2, 1e-9);
    approx('B-12-底图 transform f', st.background.transform.f, 1200, 1e-9);
    approx('B-12-底图 m/p=等效比例', st.background.metersPerPixel, 2, 1e-9);
    /* 默认遵守「场地优先校准」：场地是真值参考，世界变换默认不迁移场地 */
    const stSite=api.resetState();
    stSite.site={kind:'rect',shape:{type:'rect',x:0,y:0,w:100,h:70}};
    const rSite=api.applyWorldTransform([2,0,0,0,2,0]);
    eq('B-12-默认摘要 site=false', rSite.site, false);
    eq('B-12-默认不迁移场地宽', stSite.site.shape.w, 100);
    eq('B-12-默认不迁移场地类型', stSite.site.kind, 'rect');
    /* 无 transform 的底图只按面积因子缩放 m/p，保持默认映射 */
    const st2=api.resetState();
    st2.background={kind:'image',width:800,height:600,metersPerPixel:0.1,transform:null};
    api.applyWorldTransform([3,0,0,0,3,0]);
    approx('B-12-无 transform 仅缩放 m/p', st2.background.metersPerPixel, 0.3, 1e-9);
    eq('B-12-无 transform 不写 transform', st2.background.transform, null);
    /* 非法/退化变换：不改动任何状态 */
    const st3=api.resetState();
    st3.objects.push(api.baseObject('point','point.marker',{x:3,y:4,angle:0,phys:2}));
    const bad=api.applyWorldTransform([0,0,0,0,0,0]);
    eq('B-12-退化变换 ok=false', bad.ok, false);
    eq('B-12-退化变换不改坐标', [st3.objects[0].x,st3.objects[0].y], [3,4]);
    /* 场地纯函数：轴对齐圆→圆、非等比圆→椭圆、旋转矩形→多边形轮廓 */
    approx('B-12-场地等比圆半径×2', api.siteShapeByAffine({type:'circle',cx:10,cy:5,r:3},[2,0,0,0,2,0]).r, 6, 1e-9);
    { const e=api.siteShapeByAffine({type:'circle',cx:10,cy:5,r:3},[2,0,0,0,3,0]);
      eq('B-12-场地非等比圆→椭圆', e.type, 'ellipse');
      eq('B-12-场地椭圆中心', [e.cx,e.cy], [20,15]);
      approx('B-12-场地椭圆 rx', e.rx, 6, 1e-9);
      approx('B-12-场地椭圆 ry', e.ry, 9, 1e-9); }
    { const p=api.siteShapeByAffine({type:'rect',x:0,y:0,w:10,h:5},[0,1,0,-1,0,0]);
      eq('B-12-旋转矩形转多边形', p.type, 'polygon');
      eq('B-12-旋转矩形顶点映射', p.points[0], [0,0]);
      eq('B-12-旋转矩形第二顶点', p.points[1].map(n=>Math.round(n)), [0,-10]); }
    /* 旧签名 scaleWorldAround 与统一入口结果一致 */
    const a1=api.baseObject('point','point.marker',{x:6,y:6,angle:0,phys:1});
    const a2=api.baseObject('point','point.marker',{x:6,y:6,angle:0,phys:1});
    const st4=api.resetState(); st4.objects.push(a1);
    api.scaleWorldAround([5,5],2);
    approx('B-12-旧签名围绕中心缩放', a1.x, 7, 1e-9);
    api.migrateObjectsByAffine([a2],[2,0,-5,0,2,-5]);
    approx('B-12-旧签名等价于统一仿射', a2.x, 7, 1e-9);
  }

  /* 39.9 N-12：一般仿射下圆/椭圆/平行四边形/扇形（SVD/极分解公共实现） */
  {
    const C=Math.cos(Math.PI/6), S=Math.sin(Math.PI/6);
    const M=[2*C,-S,0,2*S,C,0];          /* R(30°)·diag(2,1) */
    const lin=api.affineLinearSummary(M);
    approx('N-12-奇异值s1', lin.s1, 2, 1e-9);
    approx('N-12-奇异值s2', lin.s2, 1, 1e-9);
    approx('N-12-极分解旋转角', lin.rotationDeg, 30, 1e-9);
    ok('N-12-非相似判定', !lin.isSimilarity);
    /* 圆：精确主轴（2,1）+ 朝向 30°，对象与场地同参数 */
    const im=api.affineEllipseImage(M,0,3,3);
    approx('N-12-圆→椭圆rx', im.rx, 6, 1e-9);
    approx('N-12-圆→椭圆ry', im.ry, 3, 1e-9);
    approx('N-12-圆→椭圆朝向', im.angle, 30, 1e-9);
    const oc=api.baseObject('rect','rect.area',{x:10,y:5,shape:{type:'circle',r:3}});
    api.migrateObjectsByAffine([oc],M);
    eq('N-12-对象圆升级椭圆', oc.shape.type, 'ellipse');
    approx('N-12-对象椭圆rx', oc.shape.rx, 6, 1e-9);
    approx('N-12-对象椭圆ry', oc.shape.ry, 3, 1e-9);
    approx('N-12-对象椭圆角度', oc.angle, 30, 1e-9);
    approx('N-12-对象圆中心x映射', oc.x, M[0]*10+M[1]*5, 1e-9);
    approx('N-12-对象圆中心y映射', oc.y, M[3]*10+M[4]*5, 1e-9);
    const sc=api.siteShapeByAffine({type:'circle',cx:10,cy:5,r:3},M);
    eq('N-12-场地与对象形状类型一致', sc.type, oc.shape.type);
    approx('N-12-场地椭圆rx与对象一致', sc.rx, oc.shape.rx, 1e-9);
    approx('N-12-场地椭圆ry与对象一致', sc.ry, oc.shape.ry, 1e-9);
    approx('N-12-场地椭圆角度与对象一致', sc.angle, oc.angle, 1e-9);
    /* 椭圆：0°+4×2 → 8×2 朝向 30° */
    const ie=api.affineEllipseImage(M,0,4,2);
    approx('N-12-椭圆rx', ie.rx, 8, 1e-9);
    approx('N-12-椭圆ry', ie.ry, 2, 1e-9);
    approx('N-12-椭圆朝向', ie.angle, 30, 1e-9);
    /* 剪切下椭圆仍按 SVD 精确：面积=rx·ry 保持 |det| 倍 */
    const sh=api.affineEllipseImage([1,0.5,0,0,1,0],0,1,1);
    approx('N-12-剪切椭圆面积保真', sh.rx*sh.ry, 1, 1e-9);
    /* 平行四边形：迁移后四角与逐点映射完全一致（含 skew 重算） */
    const po=api.baseObject('rect','rect.area',{x:0,y:0,width:10,height:5,angle:0,shape:{type:'parallelogram',skew:30}});
    const want=api.parallelogramPoints(0,0,10,5,30).map(p=>api.affApply(M,p));
    api.migrateObjectsByAffine([po],M);
    eq('N-12-平行四边形仍为平行四边形', po.shape.type, 'parallelogram');
    ok('N-12-平行四边形重算倾角', Math.abs(po.shape.skew-30)>1e-6);
    {
      const got=api.shapeWorldPoints(po).map(p=>p.map(n=>Math.round(n*1e6)/1e6));
      const exp=want.map(p=>p.map(n=>Math.round(n*1e6)/1e6));
      const key=p=>p[0]+','+p[1];
      const gs=got.map(key).sort(), es=exp.map(key).sort();
      eq('N-12-平行四边形四角与映射一致', gs, es);
    }
    /* 场地平行四边形：轴对齐非等比 sx=2,sy=3 下重算 skew=atan(tan30×2/3) */
    {
      const r=api.siteShapeByAffine({type:'parallelogram',x:0,y:0,w:10,h:5,skew:30},[2,0,0,0,3,0]);
      eq('N-12-场地平行四边形类型保持', r.type, 'parallelogram');
      approx('N-12-场地平行四边形skew', r.skew, Math.atan(Math.tan(Math.PI/6)*2/3)*180/Math.PI, 1e-9);
      const got=api.parallelogramPoints(r.x,r.y,r.w,r.h,r.skew).map(p=>p.map(n=>Math.round(n*1e6)/1e6));
      const exp=api.parallelogramPoints(0,0,10,5,30).map(p=>[p[0]*2,p[1]*3]).map(p=>p.map(n=>Math.round(n*1e6)/1e6));
      const key=p=>p[0]+','+p[1];
      eq('N-12-场地平行四边形四角一致', got.map(key).sort(), exp.map(key).sort());
    }
    /* 扇形：正向相似精确；非相似按面积保真降级并标记 */
    const sim=[2*C,-2*S,0,2*S,2*C,0];
    const ss=api.affineShapeTransform(sim,{type:'sector',cx:0,cy:0,r:4,a0:10,a1:80});
    eq('N-12-相似扇形无降级', ss.degraded, null);
    approx('N-12-相似扇形半径×2', ss.r, 8, 1e-9);
    approx('N-12-相似扇形a0+30', ss.a0, 40, 1e-9);
    approx('N-12-相似扇形a1+30', ss.a1, 110, 1e-9);
    const so=api.baseObject('rect','rect.area',{x:0,y:0,shape:{type:'sector',r:4,a0:10,a1:80}});
    const out={degraded:[]};
    api.migrateObjectsByAffine([so],[2,0,0,0,3,0],out);
    approx('N-12-非相似扇形面积保真半径', so.shape.r, 4*Math.sqrt(6), 1e-9);
    eq('N-12-非相似扇形降级标记', out.degraded.length===1?out.degraded[0].code:null, 'sector-affine');
    const stDeg=api.resetState();
    stDeg.objects.push(api.baseObject('rect','rect.area',{x:0,y:0,shape:{type:'sector',r:4,a0:10,a1:80}}));
    const sumDeg=api.applyWorldTransform([2,0,0,0,3,0]);
    eq('N-12-变换摘要暴露降级项', sumDeg.degraded.length===1?sumDeg.degraded[0].code:null, 'sector-affine');
  }

  /* 39.10 N-13：跨 0° 扇形画布/SVG/控制点共用同一归一化区间 */
  {
    const r1=api.sectorArcRange({a0:350,a1:20});
    approx('N-13-跨0始角', r1.a0, 350, 1e-9);
    approx('N-13-跨0终点角归一', r1.a1, 380, 1e-9);
    approx('N-13-跨0扫角', r1.sweep, 30, 1e-9);
    const r2=api.sectorArcRange({a0:20,a1:350});
    approx('N-13-反向跨0扫角', r2.sweep, 330, 1e-9);
    const r3=api.sectorArcRange({a0:0,a1:90});
    eq('N-13-不跨0区间', [r3.a0,r3.a1,r3.sweep], [0,90,90]);
    const r4=api.sectorArcRange({a0:350,a1:350});
    eq('N-13-起止相等视为整圆', [r4.a0,r4.a1,r4.sweep], [350,710,360]);
    /* 几何采样沿 a0→a0+sweep 递增，跨 0° 不回绕 */
    const pts=api.sectorArcPoints(0,0,10,350,30,3);
    approx('N-13-采样首点角', Math.atan2(pts[0][1],pts[0][0])*180/Math.PI, -10, 1e-9);
    approx('N-13-采样末点角', Math.atan2(pts[3][1],pts[3][0])*180/Math.PI, 20, 1e-9);
    /* SVG 同一区间：30° 弧的 large-arc 标志必须为 0，不能画成 330° */
    const st=api.resetState();
    st.site={kind:'sector',shape:{type:'sector',cx:0,cy:0,r:10,a0:350,a1:20},style:{},visible:true};
    const svg=api.buildSceneSvg();
    const m=svg.match(/A[-\d.]+,[-\d.]+ 0 (\d) 1 /);
    ok('N-13-SVG 扇形弧存在', !!m);
    eq('N-13-SVG 弧跨0不反向', m?m[1]:null, '0');
    api.resetState();
  }

  /* 39.11 N-14：边界防护（切变退化 / fitView 夹取 / 顶点上限 / 大点列包围盒） */
  {
    /* 切变退化：图片旋转 90° 后顶/底边投影高度趋 0，斜率不得产生非有限变换 */
    api.resetState(); api.resetFrameRef();
    const bg={kind:'image',fileName:'t.png',assetId:'a',width:100,height:50,origin:[0,0],metersPerPixel:0.1,calibrated:true,transform:null};
    const bc=api.imageCornerWorld(bg), bo=api.imageTransformOf(bg);
    const rot=api.imageHandleDragTo(bg,{mode:'rotate',start:[10,2.5],origin:bo,originCorners:bc},[5,10]);
    const bg2=Object.assign({},bg,{transform:rot.T});
    const sk=api.imageHandleDragTo(bg2,{mode:'skew',start:[0,0],origin:api.imageTransformOf(bg2),originCorners:api.imageCornerWorld(bg2)},[10,0]);
    ok('N-14-近90°切变仍为有限变换', ['a','b','c','d','e','f'].every(k=>Number.isFinite(sk.T[k])));
    /* CORE-P1-8：89°/90°/91° 三角度都必须沿图片自身底边方向切变。
       旧实现除以世界竖直投影高度 top.y-bot.y，90° 附近趋 0 → 夹到 SHEAR_MAX，整幅图被巨量错切。
       新实现的判据：顶边沿自身方向精确位移 1 m、底边不动、任一角点位移 ≤1 m（旧实现可达数百米）。 */
    [89,90,91].forEach(deg=>{
      const r=deg*Math.PI/180, co=Math.cos(r), si=Math.sin(r), cx=5, cy=2.5;
      const R=[co,-si,cx-co*cx+si*cy,si,co,cy-si*cx-co*cy];
      const Tm=api.affMul(R,[bo.a,bo.b,bo.c,bo.d,bo.e,bo.f]);
      const T={a:Tm[0],b:Tm[1],c:Tm[2],d:Tm[3],e:Tm[4],f:Tm[5]};
      const bgR=Object.assign({},bg,{transform:T});
      const cs=api.imageCornerWorld(bgR);
      const top=[(cs[0][0]+cs[1][0])/2,(cs[0][1]+cs[1][1])/2];
      const bot=[(cs[3][0]+cs[2][0])/2,(cs[3][1]+cs[2][1])/2];
      const e0=[cs[1][0]-cs[0][0],cs[1][1]-cs[0][1]], el=Math.hypot(e0[0],e0[1]);
      const ex=[e0[0]/el,e0[1]/el];
      const res=api.imageHandleDragTo(bgR,{mode:'skew',start:top,origin:T,originCorners:cs},[top[0]+ex[0],top[1]+ex[1]]);
      ok(`CORE-P1-8-${deg}° 切变变换有限`, ['a','b','c','d','e','f'].every(k=>Number.isFinite(res.T[k])));
      const after=Object.assign({},bgR,{transform:res.T});
      const topA=api.bgPixelToWorld(after,[50,0]), botA=api.bgPixelToWorld(after,[50,50]);
      approx(`CORE-P1-8-${deg}° 顶边沿自身方向位移 X`, topA[0], top[0]+ex[0], 1e-9);
      approx(`CORE-P1-8-${deg}° 顶边沿自身方向位移 Y`, topA[1], top[1]+ex[1], 1e-9);
      approx(`CORE-P1-8-${deg}° 底边不动 X`, botA[0], bot[0], 1e-9);
      approx(`CORE-P1-8-${deg}° 底边不动 Y`, botA[1], bot[1], 1e-9);
      const maxMove=Math.max(...[[0,0],[100,0],[100,50],[0,50]].map(px=>{
        const p0=api.bgPixelToWorld(bgR,px), p1=api.bgPixelToWorld(after,px);
        return Math.hypot(p1[0]-p0[0],p1[1]-p0[1]);
      }));
      ok(`CORE-P1-8-${deg}° 角点位移有界(≤1m)`, maxMove<=1+1e-9);
    });
    /* 确定性降级：图片高度退化为 0 时不做切变，原变换原样返回（不产生非有限值） */
    const bgZero=Object.assign({},bg,{height:0});
    const zeroT=api.imageTransformOf(bgZero);
    const zeroRes=api.imageHandleDragTo(bgZero,{mode:'skew',start:[0,0],origin:zeroT,originCorners:api.imageCornerWorld(bgZero)},[10,0]);
    eq('CORE-P1-8-退化高度保持原变换', zeroRes.T, zeroT);
    /* fitView：极小场地时缩放夹取到 ZOOM_MAX，不出现超大/非有限值 */
    api.resetState();
    api.state.site={kind:'rect',layerId:'layer.default',visible:true,locked:false,shape:{type:'rect',x:0,y:0,w:0.001,h:0.001}};
    api.resetFrameRef(); api.fitView();
    ok('N-14-fitView缩放夹取', api.state.viewport.zoom<=api.APP_LIMITS.ZOOM_MAX&&api.state.viewport.zoom>=api.APP_LIMITS.ZOOM_MIN);
    api.fitView();
    ok('N-14-fitView结果有限', Number.isFinite(api.state.viewport.zoom));
    /* 顶点上限：模型层拒绝越界插入，点列长度不变 */
    const line=api.baseObject('line','line.line',{points:[[0,0],[1,0]]});
    while(line.points.length<api.APP_LIMITS.SHAPE_POINTS_MAX) line.points.push([line.points.length,0]);
    const before=line.points.length;
    eq('N-14-顶点上限拒绝', api.insertLineNode(line,before-1,[9,9]), false);
    eq('N-14-顶点上限点列不变', line.points.length, before);
    /* 大点列包围盒：不展开参数、不爆栈，返回有限值 */
    const big=[]; for(let i=0;i<120000;i++) big.push([i%1000,-(i%777)]);
    const bb=api.pointBounds(big);
    eq('N-14-大点列包围盒', [bb.minX,bb.maxX,bb.minY,bb.maxY], [0,999,-776,0]);
    const sb=api.siteBounds({type:'polygon',points:big});
    ok('N-14-大点列场地包围盒有限', [sb.minX,sb.minY,sb.maxX,sb.maxY].every(Number.isFinite));
    const ob=api.objectBounds(api.baseObject('line','line.line',{points:big}));
    ok('N-14-大点列对象包围盒有限', [ob.minX,ob.minY,ob.maxX,ob.maxY].every(Number.isFinite));
    api.resetState();
  }

  /* 39.12 N-15：交互瞬态统一清理（载入 / 快照回滚 / 切层） */
  {
    /* ① 载入工程：仿射草稿、跟踪线、草稿、捕捉热键、校准点全部复位 */
    api.resetState();
    api.setTransient({affinePairs:[{u:0,v:0,x:0,y:0}],trackLine:{from:[0,0],dir:[1,0]},
      draft:{kind:'line',points:[[0,0]]},osnapMode:'endpoint',calibPoints:[[0,0],[10,0]]});
    await sandbox.afterStateLoaded(false);
    let tr=api.transient;
    eq('N-15-载入清空仿射草稿', tr.affinePairs.length, 0);
    eq('N-15-载入清空跟踪线', tr.trackLine, null);
    eq('N-15-载入清空草稿', tr.draft, null);
    eq('N-15-载入复位捕捉热键', tr.osnapMode, null);
    eq('N-15-载入清空校准点', tr.calibPoints.length, 0);
    /* ②③ 快照回滚：保留比例尺校准点，清空仿射草稿/草稿/跟踪线 */
    api.resetState();
    api.state.meta.projectId='proj-test';
    api.state.objects.push(api.baseObject('point','point.marker',{name:'S',x:1,y:1}));
    api.syncActiveFloor();
    const raw=api.persistableState();
    api.setTransient({calibPoints:[[0,0],[10,0]],affinePairs:[{u:0,v:0,x:0,y:0}],
      draft:{kind:'line',points:[[0,0]]},trackLine:{from:[0,0],dir:[1,0]}});
    const prevSnap=sandbox.getSnapshot;
    sandbox.getSnapshot=async()=>({data:JSON.parse(JSON.stringify(raw)),meta:{projectName:'S'}});
    ok('N-15-快照回滚成功', await sandbox.restoreSnapshotById('proj-test','snap-test'));
    sandbox.getSnapshot=prevSnap;
    tr=api.transient;
    eq('N-15-快照保留校准点', tr.calibPoints.length, 2);
    eq('N-15-快照清空仿射草稿', tr.affinePairs.length, 0);
    eq('N-15-快照清空草稿', tr.draft, null);
    eq('N-15-快照清空跟踪线', tr.trackLine, null);
    /* ④ 切换楼层：草稿与捕捉热键复位 */
    const init=api.createInitialState();
    api.state.floors.push({id:'floor.N15',name:'N15',background:init.background,objects:[],viewport:{zoom:1,panX:0,panY:0}});
    api.setTransient({draft:{kind:'line',points:[[0,0]]},osnapMode:'endpoint',trackLine:{from:[0,0],dir:[1,0]}});
    ok('N-15-切层成功', await api.switchFloor('floor.N15'));
    tr=api.transient;
    eq('N-15-切层清空草稿', tr.draft, null);
    eq('N-15-切层复位捕捉热键', tr.osnapMode, null);
    eq('N-15-切层清空跟踪线', tr.trackLine, null);
    api.resetState();
  }

  /* 39.13 N-16：断线待发队列 / 指数退避 / 楼层同步消息类型 */
  {
    eq('N-16-退避首次', api.collabBackoffDelay(0), 1000);
    eq('N-16-退避翻倍', api.collabBackoffDelay(1), 2000);
    ok('N-16-退避单调不减', [0,1,2,3,4,5,6,7].every(i=>api.collabBackoffDelay(i)<=api.collabBackoffDelay(i+1)));
    eq('N-16-退避封顶5分钟', api.collabBackoffDelay(20), 300000);
    eq('N-16-退避非法输入按0', api.collabBackoffDelay(-5), 1000);
    /* 待发队列：最新一份可落盘、可读回、可清除 */
    api.resetState();
    api.state.meta.name='N16';
    const proj=api.persistableState();
    ok('N-16-待发快照落盘', api.collabPendingStore(proj));
    const rec=api.collabPendingLoad();
    ok('N-16-待发快照可读回', !!rec&&rec.v===1);
    eq('N-16-待发快照内容一致', rec.project.meta.name, 'N16');
    ok('N-16-无传输不补发', api.collabFlushPending()===false);
    ok('N-16-无传输仍保留待发', !!api.collabPendingLoad());
    api.collabPendingClear();
    eq('N-16-待发快照清除', api.collabPendingLoad(), null);
    /* 超限显式拒绝且不写坏数据 */
    const huge={schema:api.SCHEMA,meta:{name:'x'.repeat(2*1024*1024)}};
    eq('N-16-待发超限拒绝', api.collabPendingStore(huge), false);
    eq('N-16-待发超限不落盘', api.collabPendingLoad(), null);
    /* 坏记录不当作待发 */
    sandbox.localStorage.setItem(api.COLLAB_PENDING_KEY,'{bad');
    eq('N-16-坏待发记录忽略', api.collabPendingLoad(), null);
    sandbox.localStorage.removeItem(api.COLLAB_PENDING_KEY);
    /* 楼层消息类型：发送表与接收表互逆 */
    ok('N-16-楼层消息add', api.COLLAB_FLOOR_OPS.add==='floor-add'&&api.COLLAB_FLOOR_TYPES['floor-add']==='add');
    ok('N-16-楼层消息delete', api.COLLAB_FLOOR_OPS.delete==='floor-delete'&&api.COLLAB_FLOOR_TYPES['floor-delete']==='delete');
    ok('N-16-楼层消息clear', api.COLLAB_FLOOR_OPS.clear==='floor-clear'&&api.COLLAB_FLOOR_TYPES['floor-clear']==='clear');
    /* 未启用协作：楼层广播不排队、不发消息 */
    api.collabMode=null;
    eq('N-16-未协作不广播楼层', api.collabBroadcastFloor('add'), false);
    eq('N-16-未协作不产生待发', api.collabPendingLoad(), null);
    api.resetState();
  }

  /* 39.14 N-17：冲突统计口径与跨工程消息隔离 */
  {
    api.resetState();
    api.state.meta.projectId='P-A';
    eq('N-17-工程令牌', api.collabProjectToken(), 'p:P-A');
    api.state.meta.projectId='';
    eq('N-17-草稿令牌为空', api.collabProjectToken(), '');
    api.state.meta.projectId='P-A';
    const before=api.collabPeerCount;
    api.collabHandleMessage({t:'hello',name:'PEER-X',pid:'p:P-B'},'PEER-X');
    eq('N-17-跨工程消息丢弃并计数', api.collabForeignDropped, 1);
    eq('N-17-跨工程不进在线表', api.collabPeerCount, before);
    api.collabHandleMessage({t:'hello',name:'PEER-Y',pid:'p:P-A'},'PEER-Y');
    eq('N-17-同工程消息正常接收', api.collabPeerCount, before+1);
    api.collabHandleMessage({t:'hello',name:'PEER-Z'},'PEER-Z');
    eq('N-17-旧版无工程标识兼容', api.collabPeerCount, before+2);
    ok('N-17-纯冲突算作有变化', api.collabMergeChanged({conflicts:1}));
    ok('N-17-空统计无变化', !api.collabMergeChanged({}));
    ok('N-17-纯冲突不算覆盖', !api.collabMergeOverwritten({conflicts:1}));
    ok('N-17-更新算覆盖', api.collabMergeOverwritten({updated:1}));
    api.resetState();
  }
}

});

/* D-02：校准前置状态机（S0a 空槽无场地 / S0b 仅场地 / S1 图片未就绪 / S2 图片就绪） */
await section("D-02：校准前置状态机（S0a 空槽无场地 / S0b 仅场地 / S1 图片未就绪 / S2 图片就绪）", async () => {
{
  const emptyBg={kind:'empty'};
  const imageBg={kind:'image',width:100,height:80,metersPerPixel:0.1};
  const site={kind:'rect',shape:{type:'rect',w:100,h:70}};
  /* S0a：无图无场地 → 三个入口禁用，比例尺/仿射提示导入 */
  eq('校准前置-S0a 比例尺禁用', api.calibPrecheck('calibrate',{background:emptyBg,site:null,imageReady:false,calibPoints:[]}).ok, false);
  eq('校准前置-S0a 仿射禁用', api.calibPrecheck('affine',{background:emptyBg,site:null,imageReady:false,affinePairs:[]}).ok, false);
  eq('校准前置-S0a 图片变换禁用', api.calibPrecheck('image-transform',{background:emptyBg,site:null,imageReady:false}).ok, false);
  ok('校准前置-S0a 比例尺原因提示导入', api.calibPrecheck('calibrate',{background:emptyBg,site:null,imageReady:false}).reason.includes('导入'));
  eq('校准前置-S0a 步骤为空', api.calibPrecheck('calibrate',{background:emptyBg,site:null,imageReady:false}).step, null);
  /* S0b：仅矢量场地 → 提示场地按米绘制，无需校准；图片变换文案单独 */
  eq('校准前置-S0b 比例尺原因', api.calibPrecheck('calibrate',{background:emptyBg,site,imageReady:false}).reason, '场地按米绘制，无需校准');
  eq('校准前置-S0b 仿射原因', api.calibPrecheck('affine',{background:emptyBg,site,imageReady:false}).reason, '场地按米绘制，无需校准');
  eq('校准前置-S0b 图片变换原因', api.calibPrecheck('image-transform',{background:emptyBg,site,imageReady:false}).reason, '图片变换仅适用于图片底图');
  /* S1：图片槽存在但尚未解码 → 统一禁用且区分「解码中 / 资产缺失」 */
  eq('校准前置-S1 比例尺禁用', api.calibPrecheck('calibrate',{background:imageBg,site,imageReady:false}).ok, false);
  ok('校准前置-S1 原因提示解码中', api.calibPrecheck('calibrate',{background:imageBg,site,imageReady:false}).reason.includes('解码'));
  ok('校准前置-S1 资产缺失单独提示', api.calibPrecheck('calibrate',{background:imageBg,site,imageReady:false,imageState:'missing'}).reason.includes('资产缺失'));
  eq('校准前置-S1 仿射禁用', api.calibPrecheck('affine',{background:imageBg,imageReady:false}).ok, false);
  eq('校准前置-S1 图片变换禁用', api.calibPrecheck('image-transform',{background:imageBg,imageReady:false}).ok, false);
  /* S2：图片就绪 → 比例尺 1/2 → 2/2，仿射 1/2 → ≥3 */
  eq('校准前置-S2 比例尺可用', api.calibPrecheck('calibrate',{background:imageBg,imageReady:true,calibPoints:[]}).ok, true);
  eq('校准前置-S2 比例尺 0 点步骤 n', api.calibPrecheck('calibrate',{background:imageBg,imageReady:true,calibPoints:[]}).step.n, 0);
  eq('校准前置-S2 比例尺 0 点总数', api.calibPrecheck('calibrate',{background:imageBg,imageReady:true,calibPoints:[]}).step.total, 2);
  ok('校准前置-S2 比例尺 0 点文案 1/2', api.calibPrecheck('calibrate',{background:imageBg,imageReady:true,calibPoints:[]}).step.label.includes('比例尺 1/2'));
  eq('校准前置-S2 比例尺 1 点步骤 n', api.calibPrecheck('calibrate',{background:imageBg,imageReady:true,calibPoints:[[0,0]]}).step.n, 1);
  ok('校准前置-S2 比例尺 1 点文案 2/2', api.calibPrecheck('calibrate',{background:imageBg,imageReady:true,calibPoints:[[0,0]]}).step.label.includes('比例尺 2/2'));
  eq('校准前置-S2 比例尺 2 点步骤 n', api.calibPrecheck('calibrate',{background:imageBg,imageReady:true,calibPoints:[[0,0],[1,0]]}).step.n, 2);
  ok('校准前置-S2 比例尺 2 点提示应用', api.calibPrecheck('calibrate',{background:imageBg,imageReady:true,calibPoints:[[0,0],[1,0]]}).step.label.includes('应用'));
  eq('校准前置-S2 仿射可用', api.calibPrecheck('affine',{background:imageBg,imageReady:true,affinePairs:[]}).ok, true);
  eq('校准前置-S2 仿射 0 点步骤 n', api.calibPrecheck('affine',{background:imageBg,imageReady:true,affinePairs:[]}).step.n, 0);
  ok('校准前置-S2 仿射 0 点文案 1/2', api.calibPrecheck('affine',{background:imageBg,imageReady:true,affinePairs:[]}).step.label.includes('仿射 1/2'));
  ok('校准前置-S2 仿射 1 点文案 2/2', api.calibPrecheck('affine',{background:imageBg,imageReady:true,affinePairs:[{}]}).step.label.includes('仿射 2/2'));
  eq('校准前置-S2 仿射 1 点步骤 n', api.calibPrecheck('affine',{background:imageBg,imageReady:true,affinePairs:[{}]}).step.n, 1);
  ok('校准前置-S2 仿射 2 点提示完整仿射', api.calibPrecheck('affine',{background:imageBg,imageReady:true,affinePairs:[{},{}]}).step.label.includes('完整仿射'));
  eq('校准前置-S2 仿射 3 点步骤 n', api.calibPrecheck('affine',{background:imageBg,imageReady:true,affinePairs:[{}, {}, {}]}).step.n, 3);
  ok('校准前置-S2 仿射 3 点文案 ≥3', api.calibPrecheck('affine',{background:imageBg,imageReady:true,affinePairs:[{}, {}, {}]}).step.label.includes('≥3'));
  eq('校准前置-S2 图片变换可用且无步骤', api.calibPrecheck('image-transform',{background:imageBg,imageReady:true}).step, null);
  eq('校准前置-S2 图片变换可用', api.calibPrecheck('image-transform',{background:imageBg,imageReady:true}).ok, true);
  eq('校准前置-未知工具拒绝', api.calibPrecheck('other',{}).ok, false);
  eq('校准前置-工具清单', api.CALIB_TOOL_KEYS, ['calibrate','affine','image-transform']);
  ok('校准前置-isCalibTool', api.isCalibTool('affine')&&!api.isCalibTool('select'));
}

});

/* 40. 矢量场地标注：边界折点 / 几何中心 / 面积周长（三开关默认值与旧档迁移） -------- */
await section("40. 矢量场地标注：边界折点 / 几何中心 / 面积周长（三开关默认值与旧档迁移）", async () => {
{
  api.resetState();
  /* 缺省矩形场地（域 100×70，基点原点）：四角折点、中心均值、面积周长 */
  eq('场地标注-默认矩形折点', api.siteBoundaryPoints(api.state.background), [[0,0],[100,0],[100,70],[0,70]]);
  eq('场地标注-默认矩形中心', api.siteShapeCenter(api.state.background), [50,35]);
  { const ap=api.siteAreaPerimeter(api.state.background);
    approx('场地标注-默认矩形面积', ap.area, 7000, 1e-6);
    approx('场地标注-默认矩形周长', ap.perimeter, 340, 1e-6); }

  /* 多边形场地：顶点即折点，面积用鞋带公式、周长为闭合边长和，中心为顶点均值 */
  api.state.background={kind:'polygon',shape:{type:'polygon',points:[[0,0],[10,0],[10,10],[0,10]]}};
  eq('场地标注-多边形折点', api.siteBoundaryPoints(api.state.background), [[0,0],[10,0],[10,10],[0,10]]);
  eq('场地标注-多边形中心', api.siteShapeCenter(api.state.background), [5,5]);
  { const ap=api.siteAreaPerimeter(api.state.background);
    approx('场地标注-多边形面积', ap.area, 100, 1e-9);
    approx('场地标注-多边形周长', ap.perimeter, 40, 1e-9); }
  /* 退化多边形（两点）不构成面：无折点标注可闭合，面积 0、周长为线段长 */
  api.state.background={kind:'polygon',shape:{type:'polygon',points:[[0,0],[3,4]]}};
  { const ap=api.siteAreaPerimeter(api.state.background);
    approx('场地标注-两点多边形面积0', ap.area, 0, 1e-9);
    approx('场地标注-两点多边形周长=线段长', ap.perimeter, 5, 1e-9); }

  /* 圆形：无折点（不逐点标坐标），中心取圆心，面积 πr²、周长 2πr */
  api.state.background={kind:'circle',shape:{type:'circle',cx:0,cy:0,r:10}};
  eq('场地标注-圆形无折点', api.siteBoundaryPoints(api.state.background), null);
  eq('场地标注-圆形中心', api.siteShapeCenter(api.state.background), [0,0]);
  { const ap=api.siteAreaPerimeter(api.state.background);
    approx('场地标注-圆面积', ap.area, Math.PI*100, 1e-9);
    approx('场地标注-圆周长', ap.perimeter, Math.PI*20, 1e-9); }

  /* 扇形：无折点，中心取圆心，面积 πr²·sweep/360、周长 2r+弧长 */
  api.state.background={kind:'sector',shape:{type:'sector',cx:0,cy:0,r:10,a0:0,a1:90}};
  eq('场地标注-扇形无折点', api.siteBoundaryPoints(api.state.background), null);
  eq('场地标注-扇形中心', api.siteShapeCenter(api.state.background), [0,0]);
  { const ap=api.siteAreaPerimeter(api.state.background);
    approx('场地标注-扇形面积', ap.area, Math.PI*100/4, 1e-9);
    approx('场地标注-扇形周长', ap.perimeter, 20+10*Math.PI/2, 1e-9); }

  /* 椭圆：无折点，中心取圆心，面积 πrx·ry，周长取 Ramanujan（界于两轴圆周之间） */
  api.state.background={kind:'ellipse',shape:{type:'ellipse',cx:0,cy:0,rx:20,ry:10,angle:0}};
  eq('场地标注-椭圆无折点', api.siteBoundaryPoints(api.state.background), null);
  eq('场地标注-椭圆中心', api.siteShapeCenter(api.state.background), [0,0]);
  { const ap=api.siteAreaPerimeter(api.state.background);
    approx('场地标注-椭圆面积', ap.area, Math.PI*200, 1e-9);
    ok('场地标注-椭圆周长界于两轴周长之间', ap.perimeter>2*Math.PI*10 && ap.perimeter<2*Math.PI*20); }

  /* 三开关：新建工程默认全开；旧档缺省补齐为 true；显式 false 被保留 */
  const fresh=api.createInitialState();
  eq('场地标注-默认开关(坐标)', fresh.settings.siteNodes, true);
  eq('场地标注-默认开关(段长)', fresh.settings.siteSegLen, true);
  eq('场地标注-默认开关(面积)', fresh.settings.siteArea, true);
  { const m=api.migrateProject({});
    eq('场地标注-旧档缺省补齐(坐标)', m.settings.siteNodes, true);
    eq('场地标注-旧档缺省补齐(段长)', m.settings.siteSegLen, true);
    eq('场地标注-旧档缺省补齐(面积)', m.settings.siteArea, true); }
  { const m=api.migrateProject({settings:{siteNodes:false,siteSegLen:false,siteArea:false}});
    eq('场地标注-显式关闭保留(坐标)', m.settings.siteNodes, false);
    eq('场地标注-显式关闭保留(段长)', m.settings.siteSegLen, false);
    eq('场地标注-显式关闭保留(面积)', m.settings.siteArea, false); }
  api.resetState();
}

});

/* 41. 场地节点编辑：实际包围盒取景框 / pan 补偿 / 控制点拖拽改写 ------------------ */
await section("41. 场地节点编辑：实际包围盒取景框 / pan 补偿 / 控制点拖拽改写", async () => {
{
  api.resetState();
  /* siteBounds：默认矩形（基点原点）与实际取景框一致 */
  eq('场地节点-默认矩形包围盒', api.siteBounds(api.state.site), {minX:0,minY:0,maxX:100,maxY:70,w:100,h:70});
  eq('场地节点-默认取景框=包围盒', api.computeWorldFrame(), {minX:0,minY:0,maxX:100,maxY:70,w:100,h:70});
  /* 偏移矩形：基点 x,y 生效，包围盒随基点平移 */
  eq('场地节点-偏移矩形包围盒', api.siteBounds({kind:'rect',shape:{type:'rect',x:-5,y:-2,w:100,h:70}}), {minX:-5,minY:-2,maxX:95,maxY:68,w:100,h:70});
  /* 负坐标多边形：包围盒取实际 min/max（不裁剪到 0） */
  eq('场地节点-负坐标多边形包围盒', api.siteBounds({kind:'polygon',shape:{type:'polygon',points:[[-10,-10],[10,-10],[10,10],[-10,10]]}}), {minX:-10,minY:-10,maxX:10,maxY:10,w:20,h:20});
  /* 偏心圆 / 旋转椭圆 / 扇形包围盒 */
  eq('场地节点-偏心圆包围盒', api.siteBounds({kind:'circle',shape:{type:'circle',cx:30,cy:20,r:10}}), {minX:20,minY:10,maxX:40,maxY:30,w:20,h:20});
  { const b=api.siteBounds({kind:'ellipse',shape:{type:'ellipse',cx:0,cy:0,rx:20,ry:10,angle:90}});
    approx('场地节点-旋转椭圆包围盒宽', b.w, 20, 1e-9);
    approx('场地节点-旋转椭圆包围盒高', b.h, 40, 1e-9); }
  { const b=api.siteBounds({kind:'sector',shape:{type:'sector',cx:0,cy:0,r:10,a0:0,a1:90}});
    approx('场地节点-扇形包围盒宽', b.w, 10, 1e-6);
    approx('场地节点-扇形包围盒高', b.h, 10, 1e-6); }

  /* syncFramePan：形状变更时按取景框差值补偿 pan，使未变内容保持屏幕位置 */
  api.resetState();
  api.state.viewport.panX=10; api.state.viewport.panY=20; api.state.viewport.zoom=2;
  api.state.site={kind:'rect',shape:{type:'rect',x:-5,y:0,w:100,h:70}};
  const nf=api.syncFramePan();
  approx('场地节点-补偿后 panX（minX −5×zoom2）', api.state.viewport.panX, 0, 1e-9);
  approx('场地节点-补偿后 panY 不变', api.state.viewport.panY, 20, 1e-9);
  eq('场地节点-取景框刷新为新包围盒', [nf.minX,nf.maxX], [-5,95]);
  eq('场地节点-worldFrame 缓存同步', [api.worldFrame().minX,api.worldFrame().maxX], [-5,95]);

  /* 控制点清单：各形状手柄数量与位置 */
  api.resetState();
  api.state.site={kind:'polygon',shape:{type:'polygon',points:[[0,0],[10,0],[10,10],[0,10]]}};
  eq('场地节点-多边形手柄数', api.siteHandleList().length, 4);
  eq('场地节点-多边形手柄0', [api.siteHandleList()[0].mode,api.siteHandleList()[0].x,api.siteHandleList()[0].y], ['vertex',0,0]);
  { const hs=api.siteHandleList({kind:'circle',shape:{type:'circle',cx:5,cy:5,r:10}});
    eq('场地节点-圆手柄数', hs.length, 2);
    eq('场地节点-圆圆心手柄', [hs[0].mode,hs[0].x,hs[0].y], ['center',5,5]);
    eq('场地节点-圆半径手柄', [hs[1].mode,hs[1].x,hs[1].y], ['radius',15,5]); }
  eq('场地节点-矩形手柄数', api.siteHandleList({kind:'rect',shape:{type:'rect',x:0,y:0,w:10,h:20}}).length, 4);
  { const hs=api.siteHandleList({kind:'ellipse',shape:{type:'ellipse',cx:0,cy:0,rx:20,ry:10,angle:0}});
    eq('场地节点-椭圆手柄数', hs.length, 4);
    eq('场地节点-椭圆模式', hs.map(h=>h.mode), ['center','rx','ry','rotate']); }
  { const hs=api.siteHandleList({kind:'sector',shape:{type:'sector',cx:0,cy:0,r:10,a0:0,a1:90}});
    eq('场地节点-扇形手柄数', hs.length, 4);
    eq('场地节点-扇形模式', hs.map(h=>h.mode), ['center','edge0','edge1','radius']); }
  eq('场地节点-图片底图无手柄', api.siteHandleList({kind:'image',shape:{}}), []);
  /* 负坐标多边形：域尺寸与包围盒同口径（max−min，不钳到 0） */
  eq('场地节点-负坐标多边形域 20×20', api.siteDomainOf({kind:'polygon',shape:{type:'polygon',points:[[-10,-10],[10,-10],[10,10],[-10,10]]}}), {w:20,h:20});
  /* schema 标记与统一手柄内核 */
  eq('场地节点-场地槽 type 标记', api.createInitialState().site.type, 'site');
  eq('场地节点-迁移后 type 标记', api.migrateProject({}).site.type, 'site');
  eq('场地节点-siteHandlesOf=siteHandleList 同源', api.siteHandlesOf(api.state.site).length, api.siteHandleList().length);

  /* resizeSiteByHandle：按模式改写规格参数 */
  api.resetState();
  api.state.site={kind:'polygon',shape:{type:'polygon',points:[[0,0],[10,0],[10,10],[0,10]]}};
  api.resizeSiteByHandle({mode:'vertex',index:1},[20,3]);
  eq('场地节点-拖拽多边形顶点', api.state.site.shape.points[1], [20,3]);

  api.state.site={kind:'rect',shape:{type:'rect',x:0,y:0,w:10,h:20}};
  api.resizeSiteByHandle({mode:'corner',index:2},[14,30]);
  eq('场地节点-拖拽矩形角(对角固定)', [api.state.site.shape.x,api.state.site.shape.y,api.state.site.shape.w,api.state.site.shape.h], [0,0,14,30]);

  api.state.site={kind:'circle',shape:{type:'circle',cx:5,cy:5,r:10}};
  api.resizeSiteByHandle({mode:'center'},[7,8]);
  eq('场地节点-拖拽圆心(半径不变)', [api.state.site.shape.cx,api.state.site.shape.cy,api.state.site.shape.r], [7,8,10]);
  api.resizeSiteByHandle({mode:'radius'},[7,18]);
  approx('场地节点-拖拽圆半径', api.state.site.shape.r, 10, 1e-9);

  api.state.site={kind:'ellipse',shape:{type:'ellipse',cx:0,cy:0,rx:20,ry:10,angle:0}};
  api.resizeSiteByHandle({mode:'rx'},[30,0]);
  approx('场地节点-拖拽椭圆长轴', api.state.site.shape.rx, 30, 1e-9);
  api.resizeSiteByHandle({mode:'ry'},[0,4]);
  approx('场地节点-拖拽椭圆短轴', api.state.site.shape.ry, 4, 1e-9);

  api.state.site={kind:'sector',shape:{type:'sector',cx:0,cy:0,r:10,a0:0,a1:90}};
  api.resizeSiteByHandle({mode:'edge0'},[0,20]);
  approx('场地节点-拖拽扇形边0半径', api.state.site.shape.r, 20, 1e-9);
  approx('场地节点-拖拽扇形边0角度', api.state.site.shape.a0, 90, 1e-9);
  api.resizeSiteByHandle({mode:'edge1'},[-30,0]);
  approx('场地节点-拖拽扇形边1角度', api.state.site.shape.a1, 180, 1e-9);

  /* 统一内核 siteHandleDragTo：只改传入 site，不读全局；resizeSiteByHandle 为写 state.site 的薄包装 */
  { const site={type:'site',kind:'polygon',locked:false,visible:true,shape:{type:'polygon',points:[[0,0],[10,0],[10,10]]}};
    api.siteHandleDragTo(site,{mode:'vertex',index:0},[-2,-4]);
    eq('场地节点-内核改写传入 site', site.shape.points[0], [-2,-4]); }
  api.state.site={kind:'polygon',locked:true,shape:{type:'polygon',points:[[0,0],[10,0],[10,10]]}};
  api.resizeSiteByHandle({mode:'vertex',index:0},[9,9]);
  eq('场地节点-锁定场地不可拖拽', api.state.site.shape.points[0], [0,0]);
  api.state.site={kind:'polygon',visible:false,shape:{type:'polygon',points:[[0,0],[10,0],[10,10]]}};
  api.resizeSiteByHandle({mode:'vertex',index:0},[9,9]);
  eq('场地节点-隐藏场地不可拖拽', api.state.site.shape.points[0], [0,0]);

  /* 图层语义复用：场地与业务对象同一套「图层可见/锁定」；手柄命中与对象手柄共用 pickScreenHandle */
  api.state.layers=[{id:'layer.default',name:'默认',visible:true,locked:false},{id:'L.lock',name:'锁定层',visible:true,locked:true},{id:'L.hide',name:'隐藏层',visible:false,locked:false}];
  api.state.site={kind:'polygon',layerId:'L.lock',visible:true,locked:false,shape:{type:'polygon',points:[[0,0],[10,0],[10,10],[0,10]]}};
  ok('场地节点-图层锁定即场地锁定', api.siteIsLocked(api.state.site));
  api.resizeSiteByHandle({mode:'vertex',index:0},[-3,-3]);
  eq('场地节点-图层锁定不可拖拽', api.state.site.shape.points[0], [0,0]);
  api.state.site.layerId='L.hide';
  ok('场地节点-图层隐藏即场地不可见', !api.siteIsVisible(api.state.site));
  api.state.site.layerId='layer.default';
  ok('场地节点-默认图层可见且未锁', api.siteIsVisible(api.state.site) && !api.siteIsLocked(api.state.site));
  /* 手柄命中：同一世界点换算到屏幕后必中，偏移 20px 必不中 */
  { const hs=api.siteHandleList(), sp=api.w2s([hs[0].x,hs[0].y]);
    eq('场地节点-手柄命中(共用 pickScreenHandle)', api.pickScreenHandle(hs,sp,9).mode, 'vertex');
    eq('场地节点-手柄命中阈值外为空', api.pickScreenHandle(hs,[sp[0]+20,sp[1]+20],9), null); }

  /* 图片变换手柄：平移/旋转/等比缩放/切变；平移角点吸附场地边角（只改图片，不动对象） */
  { api.resetState(); api.resetFrameRef();
    const bg={kind:'image',fileName:'t.png',assetId:'a',width:100,height:50,origin:[0,0],metersPerPixel:0.1,calibrated:true,transform:null};
    api.state.background=bg;
    api.state.site={kind:'rect',layerId:'layer.default',visible:true,locked:false,shape:{type:'rect',x:10,y:5,w:20,h:10}};
    api.resetFrameRef();
    eq('图片手柄-四类手柄', api.imageHandleList(bg).map(h=>h.mode), ['move','rotate','scale','skew']);
    const corners=api.imageCornerWorld(bg), origin=api.imageTransformOf(bg);
    /* 平移 +0.3m：右上角 (10,5) 与场地左上角重合 → 精确吸附 */
    const mv=api.imageHandleDragTo(bg,{mode:'move',start:[0,0],origin,originCorners:corners},[0.3,0.3]);
    eq('图片手柄-平移吸附场地边角', api.bgPixelToWorld(Object.assign({},bg,{transform:mv.T}),[100,0]), [10,5]);
    ok('图片手柄-吸附返回场地角点', Array.isArray(mv.snap));
    /* 旋转 +90°：右上角绕中心 (5,2.5) → (2.5,7.5) */
    const rt=api.imageHandleDragTo(bg,{mode:'rotate',start:[10,2.5],origin,originCorners:corners},[5,10]);
    const rp=api.bgPixelToWorld(Object.assign({},bg,{transform:rt.T}),[100,0]);
    approx('图片手柄-旋转90° X', rp[0], 2.5, 1e-9);
    approx('图片手柄-旋转90° Y', rp[1], 7.5, 1e-9);
    /* 等比缩放 2×（锚点左上角）：右下角 (10,0) → (20,-5) */
    const sc=api.imageHandleDragTo(bg,{mode:'scale',start:[10,0],origin,originCorners:corners},[20,-5]);
    const sp2=api.bgPixelToWorld(Object.assign({},bg,{transform:sc.T}),[100,50]);
    approx('图片手柄-等比缩放 2x', sp2[0], 20, 1e-9);
    approx('图片手柄-等比缩放 2x Y', sp2[1], -5, 1e-9);
    /* 切变：顶边中点右移 1m，底边不动 */
    const sk=api.imageHandleDragTo(bg,{mode:'skew',start:[5,5],origin,originCorners:corners},[6,5]);
    approx('图片手柄-切变顶边位移', api.bgPixelToWorld(Object.assign({},bg,{transform:sk.T}),[50,0])[0], 6, 1e-9);
    approx('图片手柄-切变底边不动', api.bgPixelToWorld(Object.assign({},bg,{transform:sk.T}),[50,50])[0], 5, 1e-9);
    /* 场地边角参与对象捕捉 */
    const cand=api.collectSnapCandidates(api.state,o=>true).filter(c=>c.id==='site');
    eq('场地捕捉-四角进入捕捉候选', cand.length, 4);
    ok('场地捕捉-类型为端点', cand.every(c=>c.type==='endpoint')); }

  /* sanitizeShape：编辑后的负坐标/偏移在保存→重载后保留（不被打回原点） */
  const mp=api.migrateProject({schema:'offline-drawing-annotation/v1',background:{kind:'polygon',shape:{type:'polygon',points:[[-10,-10],[10,-10],[10,10]]}}});
  eq('场地节点-负坐标多边形重载保留', mp.site.shape.points, [[-10,-10],[10,-10],[10,10]]);
  const mrx=api.migrateProject({schema:'offline-drawing-annotation/v1',background:{kind:'rect',shape:{type:'rect',x:-5,y:-3,w:20,h:10}}});
  eq('场地节点-偏移矩形重载保留', [mrx.site.shape.x,mrx.site.shape.y,mrx.site.shape.w,mrx.site.shape.h], [-5,-3,20,10]);
  const mc=api.migrateProject({schema:'offline-drawing-annotation/v1',background:{kind:'circle',shape:{type:'circle',cx:30,cy:20,r:10}}});
  eq('场地节点-偏心圆重载保留', [mc.site.shape.cx,mc.site.shape.cy,mc.site.shape.r], [30,20,10]);
  api.resetState();
}

});

/* 42. 场地属性面板：未选中对象时的可编辑场地属性 / 图片底图摘要 ------------------------ */
await section("42. 场地属性面板：未选中对象时的可编辑场地属性 / 图片底图摘要", async () => {
{
  api.resetState();
  /* 矢量场地（默认模式 = 未选中对象时显示，可编辑） */
  const rectBG={kind:'rect',shape:{type:'rect',x:-5,y:-2,w:112,h:74}};
  const h1=api.sitePropsHTML(rectBG,'default');
  ok('场地属性-默认模式含标题', h1.includes('场地属性'));
  ok('场地属性-含场地类型', h1.includes('矩形场地'));
  ok('场地属性-含可编辑基点X（负坐标）', h1.includes('data-site-field="x"') && h1.includes('value="-5.00"'));
  ok('场地属性-含宽高可编辑', h1.includes('data-site-field="w"') && h1.includes('data-site-field="h"'));
  ok('场地属性-含面积周长', h1.includes('id="siteAreaVal"') && h1.includes('id="sitePerimVal"'));
  ok('场地属性-面积值', h1.includes('8288.00'));
  ok('场地属性-周长值', h1.includes('372.00'));
  ok('场地属性-未选中对象操作提示', h1.includes('单击对象可在此编辑其属性'));
  /* 工具模式（场地节点）：标题与提示切换，且不再出现未选中对象的操作提示 */
  const h2=api.sitePropsHTML(rectBG,'tool');
  ok('场地节点-工具模式标题', h2.includes('场地节点') && !h2.includes('场地属性'));
  ok('场地节点-工具模式含画布拖拽提示', h2.includes('拖拽画布上的控制点'));
  ok('场地节点-工具模式无未选中提示', !h2.includes('单击对象可在此编辑其属性'));
  /* 各矢量形状的参数入口 */
  const hc=api.sitePropsHTML({kind:'circle',shape:{type:'circle',cx:30,cy:20,r:10}},'default');
  ok('场地属性-圆形含半径与圆心', hc.includes('data-site-field="r"') && hc.includes('data-site-field="cx"') && hc.includes('314.16'));
  const hp=api.sitePropsHTML({kind:'polygon',shape:{type:'polygon',points:[[0,0],[10,0],[10,10],[0,10]]}},'default');
  ok('场地属性-多边形顶点行数', (hp.match(/data-node-row=/g)||[]).length===4);
  ok('场地属性-多边形含插入/删除顶点', hp.includes('data-node-add=') && hp.includes('data-node-del='));
  ok('场地属性-多边形复用对象节点编辑器', hp.includes('data-node-axis="x"') && !hp.includes('data-site-node'));
  /* 布局回归：节点列表需跨满 form-grid 两列；复用对象节点行（含抓手）后不再需要独立 vtx 模板 */
  ok('场地属性-多边形列表跨满整行', hp.includes('class="node-list span2"'));
  ok('场地属性-多边形提示为顶点口径', hp.includes('个顶点') && hp.includes('至少'));
  /* 场地标注开关已从工程设置搬进场地属性面板：仍写 state.settings 原键，按形状只列有效项 */
  ok('场地属性-矩形含节点/段长/基点/面积/周长开关',
    ['siteNodes','siteSegLen','siteBase','siteArea','sitePerimeter'].every(k=>h1.includes(`data-site-annot="${k}"`)) && !h1.includes('data-site-annot="siteRadius"'));
  ok('场地属性-圆形含基点/半径不含节点/段长',
    hc.includes('data-site-annot="siteBase"') && hc.includes('data-site-annot="siteRadius"') &&
    !hc.includes('data-site-annot="siteNodes"') && !hc.includes('data-site-annot="siteSegLen"'));
  ok('场地属性-多边形无基点/半径',
    !hp.includes('data-site-annot="siteBase"') && !hp.includes('data-site-annot="siteRadius"') && hp.includes('data-site-annot="siteNodes"'));
  ok('场地属性-开关组复用对象面板模板跨满两列', h1.includes('class="annot-chks span2"'));
  eq('场地标注开关-矩形键集合', api.siteAnnotToggleKeys(rectBG).map(x=>x[0]), ['siteNodes','siteSegLen','siteBase','siteArea','sitePerimeter']);
  eq('场地标注开关-圆形键集合', api.siteAnnotToggleKeys({kind:'circle',shape:{type:'circle',cx:0,cy:0,r:5}}).map(x=>x[0]), ['siteBase','siteRadius','siteArea','sitePerimeter']);
  eq('场地标注开关-无场地无开关组', api.renderSiteAnnotToggles(null), '');
  ok('场地标注开关-锁定禁用', api.renderSiteAnnotToggles({kind:'rect',shape:{type:'rect',x:0,y:0,w:10,h:10},locked:true}).includes('disabled'));
  ok('场地标注开关-未锁定可用', !api.renderSiteAnnotToggles(rectBG).includes('disabled'));
  eq('场地标注开关-默认六键', api.SITE_ANNOT_SETTING_KEYS.map(k=>api.siteAnnotSettingOn(k)), [true,true,false,false,true,true]);
  ok('场地标注开关-写入生效', api.setSiteAnnotSetting('siteBase',true) && api.siteAnnotSettingOn('siteBase')===true);
  ok('场地标注开关-非法键拒绝', api.setSiteAnnotSetting('showLabels',false)===false && api.state.settings.siteNodes===true);
  api.setSiteAnnotSetting('siteBase',false);
  ok('场地标注开关-关闭后不勾选', !/data-site-annot="siteBase"[^>]*checked/.test(api.renderSiteAnnotToggles(rectBG)));
  /* 屏幕标签定位回归：离屏静态层/导出画布不在文档中，clientWidth 恒为 0，必须按登记的逻辑尺寸夹边 */
  eq('离屏画布-登记尺寸可读', api.surfaceCssSize({canvas:api.markSurfaceSize({},900,600)}), [900,600]);
  eq('DOM 画布-clientWidth 优先', api.surfaceCssSize({canvas:{clientWidth:1200,clientHeight:800,__cssW:900,__cssH:600}}), [1200,800]);
  const tagLog=[];
  const tagCtx={canvas:api.markSurfaceSize({},400,300),save(){},restore(){},measureText:()=>({width:40}),
    beginPath(){},rect(){},roundRect(){},fill(){},fillText(t,x,y){tagLog.push([t,Math.round(x),Math.round(y)]);}};
  api.drawScreenTag(tagCtx,1000,1000,'T');
  /* 记录的是 fillText 落点：x+padX(5)、y+h/2(9.5→取整 290)，即标签盒夹到 (348,280) */
  eq('离屏画布-标签按登记尺寸夹边', tagLog[0], ['T',353,290]);
  const freeLog=[];
  const freeCtx={canvas:{},save(){},restore(){},measureText:()=>({width:40}),
    beginPath(){},rect(){},roundRect(){},fill(){},fillText(t,x,y){freeLog.push([Math.round(x),Math.round(y)]);}};
  api.drawScreenTag(freeCtx,123,77,'T');
  eq('尺寸未知-标签不压到原点', freeLog[0], [128,87]);
  /* 六项场地标注开关都必须进入静态层缓存签名，否则关闭后静态层不重建＝「切了没反应」 */
  const prevSite=api.state.site;
  api.state.site={kind:'rect',shape:{type:'rect',x:0,y:0,w:100,h:70},updatedAt:'t'};
  const dims=api.worldDims();
  const keyOf=()=>api.sceneStaticKey(api.state.viewport,900,600,dims);
  const keyChanged=api.SITE_ANNOT_SETTING_KEYS.map(k=>{
    const before=api.siteAnnotSettingOn(k);
    const k1=keyOf();
    api.setSiteAnnotSetting(k,!before);
    const diff=keyOf()!==k1;
    api.setSiteAnnotSetting(k,before);
    return diff;
  });
  eq('静态层缓存键-六项场地标注开关均参与签名', keyChanged, [true,true,true,true,true,true]);
  api.state.site=prevSite;
  /* 旧入口已移除：设置弹窗不再渲染场地/标签/段长/面积开关，工具栏不再有全局「标签」 */
  ok('旧入口-设置弹窗已无场地与全局标注开关', !code.includes('id="setSiteNodes"') && !code.includes('id="setLabels"') && !code.includes('id="setSegLen"') && !code.includes('id="setAreaTag"'));
  ok('旧入口-工具栏已无全局标签复选框', !html.includes('id="showLabels"'));
  ok('场地属性-扇形含张角', api.sitePropsHTML({kind:'sector',shape:{type:'sector',cx:0,cy:0,r:10,a0:0,a1:90}},'default').includes('data-site-field="sweep"'));
  ok('场地属性-椭圆含两半径与旋转', (()=>{ const e=api.sitePropsHTML({kind:'ellipse',shape:{type:'ellipse',cx:0,cy:0,rx:20,ry:10,angle:0}},'default'); return e.includes('data-site-field="rx"') && e.includes('data-site-field="ry"') && e.includes('data-site-field="angle"'); })());
  /* 图片底图：显示摘要 + 校准入口按钮；工具模式下给引导语 */
  const hi=api.sitePropsHTML({kind:'image',fileName:'plan.png',width:500,height:400,metersPerPixel:0.2,calibrated:true,transform:null},'default');
  ok('底图属性-图片含名称像素比例', hi.includes('plan.png') && hi.includes('500×400 px') && hi.includes('0.20 m/px'));
  ok('底图属性-图片含校准状态', hi.includes('已校准') && hi.includes('轴对齐'));
  ok('底图属性-图片含校准入口按钮', hi.includes('id="siteOpenBtn"') && hi.includes('id="siteCalibBtn"') && hi.includes('id="siteAffineBtn"'));
  ok('场地节点-图片底图给图片属性', api.sitePropsHTML({kind:'image',fileName:'x.png'},'tool').includes('仿射校准'));
  /* 无场地 */
  const saved=api.state.background; api.state.background=null;
  ok('场地属性-无场地提示', api.sitePropsHTML(null,'default').includes('尚未设置矢量场地'));
  api.state.background=saved;
  api.resetState();
}

});

/* 43. 逐对象标注开关：默认值 / setAnnot / annotationItems / 面板 HTML / 迁移清洗 ---- */
await section("43. 逐对象标注开关：默认值 / setAnnot / annotationItems / 面板 HTML / 迁移清洗", async () => {
{
  api.resetState();
  /* 支持键与类型默认值（保持既有观感） */
  eq('标注-点支持键', api.annotKeys('point'), ['name','coord']);
  eq('标注-区域支持键', api.annotKeys('rect'), ['name','base','radius','edge','vertex','perimeter','area']);
  eq('标注-折线支持键', api.annotKeys('line'), ['name','node','edge','perimeter','area']);
  eq('标注-文字无键', api.annotKeys('text'), []);
  eq('标注-尺寸标注无键', api.annotKeys('dimension'), []);

  const pt=api.baseObject('point','point.marker',{x:3,y:4});
  eq('标注-点坐标默认关', api.annotOn(pt,'coord'), false);
  const rc=api.baseObject('rect','rect.area',{x:0,y:0,width:10,height:6});
  eq('标注-区域面积默认开', api.annotOn(rc,'area'), true);
  eq('标注-区域周长默认开', api.annotOn(rc,'perimeter'), true);
  eq('标注-区域基点默认关', api.annotOn(rc,'base'), false);
  eq('标注-区域半径默认关', api.annotOn(rc,'radius'), false);
  eq('标注-区域边长默认关', api.annotOn(rc,'edge'), false);
  const ln=api.baseObject('line','line.custom',{points:[[0,0],[10,0],[10,10]],x:0,y:0});
  eq('标注-折线节点默认关', api.annotOn(ln,'node'), false);
  eq('标注-折线边长默认开', api.annotOn(ln,'edge'), true);

  /* setAnnot：写入、同值无变化、非法键拒绝、显式关覆盖默认 */
  eq('标注-写入返回变化', api.setAnnot(pt,'coord',true), true);
  eq('标注-再写同值无变化', api.setAnnot(pt,'coord',true), false);
  eq('标注-写入生效', api.annotOn(pt,'coord'), true);
  eq('标注-非法键拒绝', api.setAnnot(pt,'base',true), false);
  eq('标注-非法键未写入', api.annotOn(pt,'base'), false);
  api.setAnnot(rc,'area',false);
  eq('标注-显式关覆盖默认', api.annotOn(rc,'area'), false);

  /* annotationItems：世界坐标锚点的逐对象标注条目 */
  api.resetState();
  const p2=api.baseObject('point','point.marker',{x:5,y:6});
  eq('标注项-点坐标关时0条', api.annotationItems(p2).length, 0);
  api.setAnnot(p2,'coord',true);
  const pi=api.annotationItems(p2);
  eq('标注项-点坐标开时1条', pi.length, 1);
  ok('标注项-点坐标文本含 X/Y', pi[0].text.includes('X')&&pi[0].text.includes('Y'));

  const r2=api.baseObject('rect','rect.area',{x:2,y:3,width:8,height:5});
  eq('标注项-矩形默认0条(面积/周长为胶囊)', api.annotationItems(r2).length, 0);
  api.setAnnot(r2,'base',true);
  eq('标注项-矩形基点1条', api.annotationItems(r2).length, 1);
  ok('标注项-矩形基点文本含坐标', api.annotationItems(r2)[0].text.includes('2.00'));
  api.setAnnot(r2,'edge',true);
  eq('标注项-矩形四边+基点=5条', api.annotationItems(r2).length, 5);

  const c2=api.baseObject('rect','rect.area',{x:0,y:0,shape:{type:'circle',r:7}});
  api.setAnnot(c2,'radius',true);
  eq('标注项-圆形半径1条', api.annotationItems(c2).length, 1);
  ok('标注项-半径文本以 R 开头', api.annotationItems(c2)[0].text.startsWith('R '));
  eq('标注项-圆形无边长项', api.annotationItems(c2).filter(it=>it.lenWorld).length, 0);

  const l2=api.baseObject('line','line.custom',{points:[[0,0],[4,0],[4,3]],x:0,y:0});
  /* 折线段长/周长标注按对象自身配置显示，与是否被选中无关（修复「改选其他对象后消失」） */
  eq('标注项-折线未选中也含2段长+总长', api.annotationItems(l2).length, 3);
  eq('标注项-折线选中与否条目一致', api.annotationItems(l2,{selected:true}).length, 3);
  api.setAnnot(l2,'edge',false);
  eq('标注项-关段长后仅总长(未选中仍生效)', api.annotationItems(l2).length, 1);
  api.setAnnot(l2,'perimeter',false);
  eq('标注项-关总长后0条', api.annotationItems(l2).length, 0);
  api.setAnnot(l2,'node',true);
  eq('标注项-节点坐标3条', api.annotationItems(l2).length, 3);

  /* 属性面板「图上标注」开关组 HTML */
  ok('标注UI-点含点坐标开关', api.renderAnnotToggles(api.baseObject('point','point.marker',{})).includes('data-annot="coord"'));
  const hRc=api.renderAnnotToggles(api.baseObject('rect','rect.area',{x:0,y:0,width:1,height:1}));
  ok('标注UI-矩形含编号/基点/边长/顶点/周长/面积无半径', ['name','base','edge','vertex','perimeter','area'].every(k=>hRc.includes(`data-annot="${k}"`)) && !hRc.includes('data-annot="radius"'));
  const hCir=api.renderAnnotToggles(api.baseObject('rect','rect.area',{x:0,y:0,shape:{type:'circle',r:5}}));
  ok('标注UI-圆形含半径不含边长', hCir.includes('data-annot="radius"') && !hCir.includes('data-annot="edge"'));
  ok('标注UI-开关组跨满两列', hRc.includes('class="annot-chks span2"'));
  const hLn=api.renderAnnotToggles(api.baseObject('line','line.custom',{points:[[0,0],[1,0]]}));
  ok('标注UI-开放折线含编号/节点/段长/周长无面积', ['name','node','edge','perimeter'].every(k=>hLn.includes(`data-annot="${k}"`)) && !hLn.includes('data-annot="area"'));
  eq('标注UI-文字无开关组', api.renderAnnotToggles(api.baseObject('text','text.custom',{})), '');

  /* 持久化迁移：仅保留该 kind 支持的布尔键，丢弃非法键/非本类型键 */
  const m=api.migrateProject({schema:'offline-drawing-annotation/v1',objects:[
    {kind:'point',name:'PT',x:1,y:2,annot:{coord:true,bogus:true,area:true}},
    {kind:'rect',name:'RC',width:10,height:5,annot:{area:false,base:'yes'}},
    {kind:'line',name:'LN',points:[[0,0],[1,0]],annot:{node:true,edge:false}}
  ]});
  const M=n=>m.objects.find(o=>o.name===n);
  eq('标注迁移-点仅保留 coord', M('PT').annot, {coord:true});
  eq('标注迁移-区域丢弃非布尔 base', M('RC').annot, {area:false});
  eq('标注迁移-折线保留布尔键', M('LN').annot, {node:true,edge:false});
  eq('标注迁移-点坐标生效', api.annotOn(M('PT'),'coord'), true);
  eq('标注迁移-区域面积关生效', api.annotOn(M('RC'),'area'), false);

  /* 41. 标注开关扩展：编号 / 顶点坐标 / 键名随类型变化 / 场地分级开关 ------- */
  api.resetState();
  api.state.settings.precision=2;
  eq('标注-编号默认开(点)', api.annotOn(api.baseObject('point','point.marker',{}),'name'), true);
  eq('标注-编号默认开(区域)', api.annotOn(api.baseObject('rect','rect.area',{x:0,y:0,width:1,height:1}),'name'), true);
  eq('标注-编号默认开(折线)', api.annotOn(api.baseObject('line','line.custom',{points:[[0,0],[1,0]]}),'name'), true);
  eq('标注-区域顶点坐标默认关', api.annotOn(api.baseObject('rect','rect.area',{x:0,y:0,width:1,height:1}),'vertex'), false);

  /* 键名随类型/形态变化：折线=段长、区域=边长；闭合折线节点即顶点坐标 */
  eq('标注-键名:折线边长即段长', api.annotLabel(api.baseObject('line','line.custom',{points:[[0,0],[1,0]]}),'edge'), '段长');
  eq('标注-键名:区域边长', api.annotLabel(api.baseObject('rect','rect.area',{x:0,y:0,width:1,height:1}),'edge'), '边长');
  eq('标注-键名:闭合折线节点即顶点', api.annotLabel(api.baseObject('line','line.custom',{points:[[0,0],[1,0],[1,1]],closed:true}),'node'), '顶点坐标');
  eq('标注-键名:开放折线节点', api.annotLabel(api.baseObject('line','line.custom',{points:[[0,0],[1,0]]}),'node'), '节点坐标');

  /* 区域顶点坐标标注：矩形四角各 1 条；圆/椭圆/扇形无顶点 */
  const rv=api.baseObject('rect','rect.area',{x:0,y:0,width:4,height:3});
  eq('标注项-矩形顶点默认0条', api.annotationItems(rv).length, 0);
  api.setAnnot(rv,'vertex',true);
  eq('标注项-矩形顶点坐标4条', api.annotationItems(rv).length, 4);
  ok('标注项-顶点坐标文本为括号坐标', api.annotationItems(rv)[0].text.startsWith('('));
  const rvCircle=api.baseObject('rect','rect.area',{x:0,y:0,shape:{type:'circle',r:5}});
  api.setAnnot(rvCircle,'vertex',true);
  eq('标注项-圆形无顶点项', api.annotationItems(rvCircle).length, 0);

  /* 编号由 drawLabel/SVG 文本层渲染，不计入 annotationItems；显式关可覆盖默认 */
  const pn=api.baseObject('point','point.marker',{name:'P',x:1,y:1});
  eq('标注项-编号不计入条目', api.annotationItems(pn).length, 0);
  api.setAnnot(pn,'name',false);
  eq('标注-显式关编号', api.annotOn(pn,'name'), false);

  /* 面板按键过滤：圆形不含边长/顶点；矩形不含半径 */
  const hRc2=api.renderAnnotToggles(api.baseObject('rect','rect.area',{x:0,y:0,width:1,height:1}));
  ok('标注UI-矩形含编号与顶点', hRc2.includes('data-annot="name"') && hRc2.includes('data-annot="vertex"'));
  const hCir2=api.renderAnnotToggles(api.baseObject('rect','rect.area',{x:0,y:0,shape:{type:'circle',r:5}}));
  ok('标注UI-圆形无顶点与边长', !hCir2.includes('data-annot="vertex"') && !hCir2.includes('data-annot="edge"'));
  ok('标注UI-折线开关显示为段长', api.renderAnnotToggles(api.baseObject('line','line.custom',{points:[[0,0],[1,0]]})).includes('段长'));
  ok('标注UI-闭合折线含面积开关', api.renderAnnotToggles(api.baseObject('line','line.custom',{points:[[0,0],[1,0],[1,1]],closed:true})).includes('data-annot="area"'));

  /* 折线段长/周长：SVG 与画布同源输出，按逐对象配置显隐、与是否选中无关 */
  api.resetState();
  api.state.settings.precision=2;
  const lnSvg=api.baseObject('line','line.custom',{name:'LS',x:0,y:0,points:[[0,0],[7,0],[7,24]]});
  api.state.objects.push(lnSvg);
  const lnS1=api.buildSceneSvg();
  ok('SVG-折线按配置输出段长(7/24)', lnS1.includes('7.00 m')&&lnS1.includes('24.00 m'));
  ok('SVG-折线按配置输出总长(Σ31)', lnS1.includes('Σ 31.00 m'));
  api.setAnnot(lnSvg,'edge',false);
  const lnS2=api.buildSceneSvg();
  ok('SVG-关段长后段长文字消失', !lnS2.includes('7.00 m')&&!lnS2.includes('24.00 m'));
  ok('SVG-关段长后总长仍在', lnS2.includes('Σ 31.00 m'));
  api.setAnnot(lnSvg,'perimeter',false);
  ok('SVG-关总长后总长消失', !api.buildSceneSvg().includes('Σ 31.00 m'));

  /* 场地标注分级开关：迁移默认与继承（周长自原「周长面积」拆出） */
  eq('迁移-场地周长缺省继承面积(开)', api.migrateProject({schema:'offline-drawing-annotation/v1'}).settings.sitePerimeter, true);
  eq('迁移-场地基点默认关', api.migrateProject({schema:'offline-drawing-annotation/v1'}).settings.siteBase, false);
  eq('迁移-场地半径默认关', api.migrateProject({schema:'offline-drawing-annotation/v1'}).settings.siteRadius, false);
  eq('迁移-场地周长继承面积(关)', api.migrateProject({schema:'offline-drawing-annotation/v1',settings:{siteArea:false}}).settings.sitePerimeter, false);
  const sm=api.migrateProject({schema:'offline-drawing-annotation/v1',settings:{sitePerimeter:true,siteBase:true,siteRadius:true}}).settings;
  eq('迁移-场地分级开关保留', [sm.sitePerimeter,sm.siteBase,sm.siteRadius], [true,true,true]);

  /* 场地基点/半径取值的形状差异 */
  eq('场地-圆基点即圆心', api.siteBasePoint({shape:{type:'circle',cx:3,cy:4,r:5}}), [3,4]);
  eq('场地-矩形基点', api.siteBasePoint({shape:{type:'rect',x:1,y:2,w:5,h:5}}), [1,2]);
  eq('场地-多边形无基点', api.siteBasePoint({shape:{type:'polygon',points:[[0,0],[1,0],[1,1]]}}), null);
  eq('场地-圆半径文案', api.siteRadiusText({shape:{type:'circle',cx:0,cy:0,r:7}}), '7.00 m');
  eq('场地-椭圆半径文案', api.siteRadiusText({shape:{type:'ellipse',rx:4,ry:3}}), 'Rx 4.00  Ry 3.00');
  eq('场地-矩形无半径', api.siteRadiusText({shape:{type:'rect',x:0,y:0,w:1,h:1}}), '');

  /* 属性面板接线：单选各类型对象时「图上标注」组按类型/形状正确呈现 */
  api.resetState();
  const selR=api.baseObject('rect','rect.area',{name:'R1',x:0,y:0,width:4,height:3});
  api.state.objects=[selR]; api.selectedIds.add(selR.id);
  api.renderProps();
  const panelR=api.$('propPanel').innerHTML;
  ok('属性面板-区域标注组含编号与顶点坐标', panelR.includes('data-annot="name"') && panelR.includes('data-annot="vertex"'));
  ok('属性面板-区域无半径开关', !panelR.includes('data-annot="radius"') && panelR.includes('data-annot="edge"'));
  const selC=api.baseObject('rect','rect.area',{name:'R2',x:0,y:0,shape:{type:'circle',r:5}});
  api.state.objects=[selC]; api.selectedIds.clear(); api.selectedIds.add(selC.id);
  api.renderProps();
  const panelC=api.$('propPanel').innerHTML;
  ok('属性面板-圆形含半径不含顶点/边长', panelC.includes('data-annot="radius"') && !panelC.includes('data-annot="vertex"') && !panelC.includes('data-annot="edge"'));
  const selP=api.baseObject('point','point.marker',{name:'P1',x:1,y:1});
  api.state.objects=[selP]; api.selectedIds.clear(); api.selectedIds.add(selP.id);
  api.renderProps();
  ok('属性面板-点设备含编号开关', api.$('propPanel').innerHTML.includes('data-annot="name"'));
  api.selectedIds.clear();
  api.resetState();
}

});

/* 44. 逐对象标注开关完全优先：全局总开关仅作未显式配置对象的缺省值 --------- */
await section("44. 逐对象标注开关完全优先：全局总开关仅作未显式配置对象的缺省值", async () => {
{
  /* 编号：全局关 → 未配置对象隐藏；显式开 → 全局关也显示；显式关 → 全局开也隐藏 */
  api.resetState();
  api.state.settings.precision=2;
  const ptQ=api.baseObject('point','point.marker',{name:'PQ',x:1,y:1});
  const ptE=api.baseObject('point','point.marker',{name:'PE',x:2,y:2});
  api.state.objects.push(ptQ,ptE);
  api.state.settings.showLabels=false;
  ok('优先-全局关标签时未配置对象编号隐藏', !api.buildSceneSvg().includes('>PQ<'));
  api.setAnnot(ptQ,'name',true);
  ok('优先-全局关标签但逐对象开编号仍显示', api.buildSceneSvg().includes('>PQ<'));
  api.setAnnot(ptE,'name',false);
  api.state.settings.showLabels=true;
  ok('优先-全局开标签但逐对象关编号仍隐藏', !api.buildSceneSvg().includes('>PE<'));

  /* 折线段长/总长：全局关 → 未配置对象隐藏；显式开 → 仍显示 */
  const lnQ=api.baseObject('line','line.custom',{name:'LQ',x:0,y:0,points:[[0,0],[6,0],[6,8]]});
  api.state.objects.push(lnQ);
  api.state.settings.showSegLen=false;
  const svgL0=api.buildSceneSvg();
  ok('优先-全局关段长时未配置折线无段长/总长', !svgL0.includes('6.00 m')&&!svgL0.includes('8.00 m')&&!svgL0.includes('Σ 14.00 m'));
  api.setAnnot(lnQ,'edge',true); api.setAnnot(lnQ,'perimeter',true);
  const svgL1=api.buildSceneSvg();
  ok('优先-全局关段长但逐对象开仍显示分段', svgL1.includes('6.00 m')&&svgL1.includes('8.00 m'));
  ok('优先-全局关段长但逐对象开总长仍显示', svgL1.includes('Σ 14.00 m'));
  api.state.settings.showSegLen=true;
  api.setAnnot(lnQ,'edge',false); api.setAnnot(lnQ,'perimeter',false);
  const svgL2=api.buildSceneSvg();
  ok('优先-全局开段长但逐对象关仍隐藏段长/总长', !svgL2.includes('6.00 m')&&!svgL2.includes('Σ 14.00 m'));

  /* 区域面积/周长：全局关 → 未配置无胶囊；显式开 → 显示；显式关面积只留周长 */
  api.resetState();
  api.state.settings.precision=2;
  const rcQ=api.baseObject('rect','rect.area',{name:'RQ',x:0,y:0,width:10,height:6});
  api.state.objects.push(rcQ);
  api.state.settings.showAreaTag=false;
  ok('优先-全局关面积时未配置区域无胶囊', !api.buildSceneSvg().includes('面积 60.00 ㎡'));
  api.setAnnot(rcQ,'area',true);
  ok('优先-全局关面积但逐对象开面积仍显示', api.buildSceneSvg().includes('面积 60.00 ㎡'));
  api.setAnnot(rcQ,'perimeter',true);
  api.setAnnot(rcQ,'area',false);
  const svgR=api.buildSceneSvg();
  ok('优先-逐对象关面积仅留周长', !svgR.includes('面积 60.00 ㎡')&&svgR.includes('周长 32.00 m'));
  api.state.settings.showAreaTag=true;
  ok('优先-全局开面积但逐对象关面积仍隐藏', !api.buildSceneSvg().includes('面积 60.00 ㎡'));

  /* 闭合折线：面积/周长同样只按逐对象配置；与全局开关、选中状态均无关 */
  api.resetState();
  api.state.settings.precision=2;
  const cl=api.baseObject('line','line.custom',{name:'CL',x:0,y:0,points:[[0,0],[10,0],[10,10],[0,10]],closed:true});
  api.state.objects.push(cl);
  api.state.settings.showAreaTag=false;
  ok('优先-全局关面积时未配置闭合折线无胶囊', !api.buildSceneSvg().includes('面积 100.00 ㎡'));
  api.setAnnot(cl,'area',true);
  ok('优先-全局关面积但逐对象开闭合折线面积仍显示', api.buildSceneSvg().includes('面积 100.00 ㎡'));
  api.setAnnot(cl,'area',false);
  ok('优先-逐对象关面积后闭合折线面积隐藏', !api.buildSceneSvg().includes('面积 100.00 ㎡'));
  api.state.settings.showAreaTag=true;
  ok('优先-全局开面积仍按逐对象关隐藏', !api.buildSceneSvg().includes('面积 100.00 ㎡'));
  api.setAnnot(cl,'perimeter',false);
  ok('优先-面积周长均关后胶囊消失', !api.buildSceneSvg().includes('周长 40.00 m'));
  api.resetState();
}

});

/* 45. 画布渲染链路：逐对象标注显隐与 SVG 一致（非选中态、受全局开关影响时仍按对象配置） ---- */
await section("45. 画布渲染链路：逐对象标注显隐与 SVG 一致（非选中态、受全局开关影响时仍按对象配置）", async () => {
{
  /* 记录型 2D 上下文：只关心 fillText 文本，其余绘制调用一律吞掉 */
  const recCtx=()=>{
    const texts=[];
    return new Proxy({}, {
      get(t,p){
        if(p==='then') return undefined;
        if(p==='fillText') return s=>{ texts.push(String(s)); };
        if(p==='measureText') return s=>({width:String(s).length*7});
        if(p==='canvas') return {clientWidth:900,clientHeight:600};
        if(p==='texts') return texts;
        if(p in t) return t[p];
        return ()=>{};
      },
      set(t,p,v){ t[p]=v; return true; }
    });
  };
  const toS=p=>[p[0]*10,-p[1]*10];

  api.resetState();
  api.state.settings.precision=2;
  const lnC=api.baseObject('line','line.custom',{name:'LC',x:0,y:0,points:[[0,0],[50,0],[50,120]]});
  api.state.objects=[lnC];
  const c1=recCtx(); api.drawObject(c1,lnC,{zoom:1},toS,1,1);
  ok('画布-折线未选中仍显示编号', c1.texts.includes('LC'));
  ok('画布-折线未选中仍显示分段长', c1.texts.includes('50.00 m')&&c1.texts.includes('120.00 m'));
  ok('画布-折线未选中仍显示总长', c1.texts.includes('Σ 170.00 m'));
  api.setAnnot(lnC,'edge',false);
  const c2=recCtx(); api.drawObject(c2,lnC,{zoom:1},toS,1,1);
  ok('画布-逐对象关段长后无分段文字', !c2.texts.includes('50.00 m')&&!c2.texts.includes('120.00 m'));
  ok('画布-逐对象关段长后总长仍在', c2.texts.includes('Σ 170.00 m'));
  api.setAnnot(lnC,'perimeter',false);
  api.state.settings.showSegLen=false;
  const c3=recCtx(); api.drawObject(c3,lnC,{zoom:1},toS,1,1);
  ok('画布-全局关段长且逐对象关总长后无总长', !c3.texts.includes('Σ 170.00 m'));
  api.setAnnot(lnC,'perimeter',true);
  const c4=recCtx(); api.drawObject(c4,lnC,{zoom:1},toS,1,1);
  ok('画布-全局关段长但逐对象开总长仍显示', c4.texts.includes('Σ 170.00 m'));

  /* 区域面积/周长：逐对象开关独立于全局「图上显示面积」 */
  api.resetState();
  api.state.settings.precision=2;
  const rcC=api.baseObject('rect','rect.area',{name:'RC',x:0,y:0,width:10,height:6});
  api.state.objects=[rcC];
  const c5=recCtx(); api.drawObject(c5,rcC,{zoom:1},toS,1,1);
  ok('画布-区域默认显示面积+周长', c5.texts.includes('面积 60.00 ㎡')&&c5.texts.includes('周长 32.00 m'));
  api.setAnnot(rcC,'area',false);
  const c6=recCtx(); api.drawObject(c6,rcC,{zoom:1},toS,1,1);
  ok('画布-逐对象关面积后仅剩周长', !c6.texts.includes('面积 60.00 ㎡')&&c6.texts.includes('周长 32.00 m'));
  api.setAnnot(rcC,'perimeter',true);
  api.state.settings.showAreaTag=false;
  const c7=recCtx(); api.drawObject(c7,rcC,{zoom:1},toS,1,1);
  ok('画布-全局关面积不影响逐对象开周长', c7.texts.includes('周长 32.00 m'));

  /* 闭合折线：全局关面积时，逐对象仍开则照常显示 */
  api.resetState();
  api.state.settings.precision=2;
  const clC=api.baseObject('line','line.custom',{name:'CLC',x:0,y:0,points:[[0,0],[10,0],[10,10],[0,10]],closed:true});
  api.state.objects=[clC];
  api.setAnnot(clC,'area',true); api.setAnnot(clC,'perimeter',true);
  api.state.settings.showAreaTag=false;
  const c8=recCtx(); api.drawObject(c8,clC,{zoom:1},toS,1,1);
  ok('画布-闭合折线全局关面积仍按逐对象显示', c8.texts.includes('面积 100.00 ㎡')&&c8.texts.includes('周长 40.00 m'));
  api.setAnnot(clC,'area',false); api.setAnnot(clC,'perimeter',false);
  const c9=recCtx(); api.drawObject(c9,clC,{zoom:1},toS,1,1);
  ok('画布-闭合折线面积周长关后胶囊消失', !c9.texts.includes('面积 100.00 ㎡')&&!c9.texts.includes('周长 40.00 m'));
  ok('画布-闭合折线胶囊消失后编号回到中心', c9.texts.includes('CLC'));
  api.resetState();
}

});

/* 46. 平行四边形：区域与矢量场地共用的参数形状 ------------------------------ */
await section("46. 平行四边形：区域与矢量场地共用的参数形状", async () => {
{
  api.resetState();
  api.state.settings.precision=2;
  ok('平行四边形-已注册为区域形状', api.AREA_SHAPE_TYPES.includes('parallelogram'));
  eq('平行四边形-默认倾角30°', api.PARALLELOGRAM_DEFAULT_SKEW, 30);
  eq('平行四边形-倾角上限80°', api.PARALLELOGRAM_MAX_SKEW, 80);
  eq('平行四边形-表格中文名', api.AREA_SHAPE_LABELS.parallelogram, '平行四边形');

  /* 顶点：基点=左下角，上边右移 h·tanθ（错切不改变底与高） */
  const pts=api.parallelogramPoints(0,0,10,6,30);
  eq('平行四边形-四顶点', pts.length, 4);
  eq('平行四边形-下边右角', pts[1], [10,0]);
  approx('平行四边形-左上角X=h·tanθ', pts[3][0], 6*Math.tan(Math.PI/6), 1e-9);
  approx('平行四边形-右上角X=w+h·tanθ', pts[2][0], 10+6*Math.tan(Math.PI/6), 1e-9);
  approx('平行四边形-上下边等长', Math.hypot(pts[2][0]-pts[3][0],pts[2][1]-pts[3][1]), 10, 1e-9);

  const o=api.baseObject('rect','rect.area',{x:0,y:0,width:10,height:6,shape:{type:'parallelogram',skew:30}});
  eq('平行四边形-形状类型', api.areaShapeType(o), 'parallelogram');
  eq('平行四边形-面积=底×高', api.shapeArea(o), 60);
  approx('平行四边形-周长=2(w+h/cosθ)', api.shapePerimeter(o), 2*(10+6/Math.cos(Math.PI/6)), 1e-9);
  eq('平行四边形-渲染四顶点', api.shapeWorldPoints(o).length, 4);
  approx('平行四边形-质心X含错切', api.shapeLabelCenter(o)[0], (2*10+2*6*Math.tan(Math.PI/6))/4, 1e-9);
  ok('平行四边形-内部命中', api.shapeHit(o,[7,3]));
  ok('平行四边形-左上外接盒角落不命中', !api.shapeHit(o,[0.2,5.5]));

  const oRot=api.baseObject('rect','rect.area',{x:0,y:0,width:10,height:6,angle:90,shape:{type:'parallelogram',skew:30}});
  const pr=api.shapeWorldPoints(oRot);
  approx('平行四边形-旋转后基点不动', Math.hypot(pr[0][0],pr[0][1]), 0, 1e-9);
  approx('平行四边形-旋转90°后下边沿Y轴', pr[1][1], 10, 1e-9);

  /* 形状互换：质心与面积保持不变（错切面积不变） */
  const cv=api.baseObject('rect','rect.area',{x:0,y:0,width:10,height:6});
  const c0=api.shapeLabelCenter(cv), a0=api.shapeArea(cv);
  api.convertAreaShape(cv,'parallelogram');
  eq('互换-矩形→平行四边形', api.areaShapeType(cv), 'parallelogram');
  eq('互换-面积不变', api.shapeArea(cv), a0);
  approx('互换-质心X不变', api.shapeLabelCenter(cv)[0], c0[0], 1e-9);
  approx('互换-质心Y不变', api.shapeLabelCenter(cv)[1], c0[1], 1e-9);
  api.convertAreaShape(cv,'rect');
  eq('互换-回矩形类型', api.areaShapeType(cv), 'rect');
  approx('互换-回矩形宽度不变', cv.width, 10, 1e-9);
  approx('互换-回矩形质心不变', api.shapeLabelCenter(cv)[1], c0[1], 1e-9);

  const c2=api.baseObject('rect','rect.area',{x:0,y:0,shape:{type:'circle',r:5}});
  const ac=api.shapeArea(c2);
  api.convertAreaShape(c2,'parallelogram');
  approx('互换-圆形→平行四边形等面积', api.shapeArea(c2), ac, 1e-6);

  /* 逐对象标注：四边+四顶点，无半径开关 */
  api.resetState(); api.state.settings.precision=2;
  const sv=api.baseObject('rect','rect.area',{name:'PAR',x:0,y:0,width:10,height:6,shape:{type:'parallelogram',skew:30}});
  api.state.objects=[sv];
  api.setAnnot(sv,'edge',true); api.setAnnot(sv,'vertex',true);
  eq('标注项-平行四边形四边', api.annotationItems(sv).filter(it=>it.lenWorld).length, 4);
  eq('标注项-平行四边形四顶点', api.annotationItems(sv).filter(it=>!it.lenWorld).length, 4);
  const hP=api.renderAnnotToggles(sv);
  ok('标注UI-平行四边形含边长/顶点无半径', hP.includes('data-annot="edge"')&&hP.includes('data-annot="vertex"')&&!hP.includes('data-annot="radius"'));
  api.selectedIds.add(sv.id); api.renderProps();
  ok('属性面板-平行四边形倾角输入', api.$('propPanel').innerHTML.includes('data-field="shapeSkew"'));
  ok('属性面板-形状下拉含平行四边形', api.$('propPanel').innerHTML.includes('>平行四边形</option>'));

  /* 属性面板接线：切换形状与倾角写入走 applyField（与真实输入事件同一入口） */
  const pf=(f,v)=>({dataset:{field:f},value:v,checked:false});
  const pv=api.baseObject('rect','rect.area',{x:0,y:0,width:8,height:4});
  api.applyField(pf('shapeType','parallelogram'),pv,()=>{});
  eq('面板接线-矩形切换为平行四边形', api.areaShapeType(pv),'parallelogram');
  api.applyField(pf('shapeSkew',-45),pv,()=>{});
  approx('面板接线-倾角写入-45°', api.parallelogramSkew(pv.shape), -45, 1e-9);
  api.applyField(pf('shapeSkew',200),pv,()=>{});
  approx('面板接线-倾角超限钳到80°', api.parallelogramSkew(pv.shape), 80, 1e-9);
  api.applyField(pf('shapeType','rect'),pv,()=>{});
  eq('面板接线-切回矩形', api.areaShapeType(pv),'rect');

  /* SVG 导出：按四顶点多边形绘制（首个 polygon 现在可能是场地层，取四角 X 互不相同的对象多边形） */
  const svg=api.buildSceneSvg();
  const poly=(()=>{ for(const m of svg.matchAll(/<polygon points="([^"]+)"/g)){
    const pts=m[1].trim().split(/\s+/);
    if(new Set(pts.map(s=>s.split(',')[0])).size===4) return [m[0],m[1]];
  } return null; })();
  eq('SVG-平行四边形四顶点', poly?poly[1].trim().split(/\s+/).length:0, 4);
  ok('SVG-平行四边形四角X互不相同（含错切）', !!poly&&new Set(poly[1].trim().split(/\s+/).map(s=>s.split(',')[0])).size===4);

  /* 表格导出/导入：形状列 + 倾角参数往返 */
  const row=api.objectRows().find(r=>r['编号']==='PAR');
  eq('表格-平行四边形形状列', row['形状'], '平行四边形');
  eq('表格-平行四边形倾角参数', row['形状参数'], '30');
  eq('表格-平行四边形宽度', row['宽度'], '10.00');
  const imp=api.baseObject('rect','rect.area',{x:0,y:0});
  ok('表格导入-平行四边形成功', api.applyRowShape(imp,'平行四边形',{x:2,y:3,w:8,h:4,angle:45,params:[20]}));
  eq('表格导入-类型', api.areaShapeType(imp), 'parallelogram');
  approx('表格导入-倾角20°', api.parallelogramSkew(imp.shape), 20, 1e-9);
  eq('表格导入-面积32', api.shapeArea(imp), 32);
  approx('表格导入-旋转角45°', imp.angle, 45, 1e-9);

  /* 工程迁移：尺寸保留（平行四边形尺寸存于 width/height）、倾角钳制 */
  const m=api.migrateProject({schema:'offline-drawing-annotation/v1',objects:[
    {kind:'rect',name:'PM',x:1,y:2,width:10,height:6,angle:15,shape:{type:'parallelogram',skew:120}}
  ]});
  const pm=m.objects.find(x=>x.name==='PM');
  ok('迁移-平行四边形保留宽高', !!pm&&pm.width===10&&pm.height===6);
  eq('迁移-倾角钳到80°', pm&&pm.shape&&pm.shape.skew, 80);
  approx('迁移-保留旋转角', pm&&pm.angle, 15, 1e-9);

  /* 矢量场地：边界/面积周长/基点/控制点/属性面板/SVG */
  api.resetState();
  const bg={kind:'parallelogram',shape:{type:'parallelogram',x:0,y:0,w:10,h:6,skew:30}};
  const bp=api.siteBoundaryPoints(bg);
  eq('场地-四界点', bp.length, 4);
  approx('场地-左上界点X', bp[3][0], 6*Math.tan(Math.PI/6), 1e-9);
  const sap=api.siteAreaPerimeter(bg);
  eq('场地-面积=底×高', sap.area, 60);
  approx('场地-周长公式', sap.perimeter, 2*(10+6/Math.cos(Math.PI/6)), 1e-9);
  eq('场地-基点=左下角', api.siteBasePoint(bg), [0,0]);
  eq('场地-无半径文案', api.siteRadiusText(bg), '');
  const hs=api.siteHandleList(bg);
  eq('场地-控制点=4角+倾角', hs.length, 5);
  ok('场地-含倾角控制点', hs.some(h=>h.mode==='skew'));
  ok('场地-属性含倾角输入', api.sitePropsHTML(bg).includes('data-site-field="skew"'));
  ok('场地-属性显示种类', api.sitePropsHTML(bg).includes('平行四边形场地'));
  const gb=api.siteBounds(bg);
  approx('场地-包围盒宽含错切', gb.w, 10+6*Math.tan(Math.PI/6), 1e-9);
  approx('场地-包围盒高', gb.h, 6, 1e-9);

  api.state.site=bg; api.resetFrameRef(); api.state.objects=[];
  const svgSite=api.buildSceneSvg();
  ok('SVG-场地平行四边形多边形', /<polygon points="[^"]+" fill="#eef2f7"/.test(svgSite));

  const m2=api.migrateProject({schema:'offline-drawing-annotation/v1',background:{kind:'parallelogram',shape:{type:'parallelogram',x:1,y:2,w:10,h:6,skew:200}}});
  eq('迁移-场地种类', m2.site.kind, 'parallelogram');
  eq('迁移-场地倾角钳到80°', m2.site.shape.skew, 80);
  approx('迁移-场地宽保留', m2.site.shape.w, 10, 1e-9);
  api.resetState();
}

});

/* 47. 分层渲染：视口裁剪矩形与静态层缓存签名 -------------------------------- */
await section("47. 分层渲染：视口裁剪矩形与静态层缓存签名", async () => {
{
  api.resetState();
  api.state.background={kind:'rect',fileName:'',assetId:'',width:0,height:0,origin:[0,0],metersPerPixel:1,calibrated:false,
    shape:{type:'rect',x:0,y:0,w:100,h:70}};
  api.resetFrameRef();
  const v={zoom:1,panX:0,panY:0}, dims=api.worldDims();
  const r=api.visibleWorldRect(v,dims,800,600,0);
  eq('裁剪-视口左边界', r.minX, 0);
  eq('裁剪-视口右边界', r.maxX, 800);
  eq('裁剪-视口下边界', r.minY, -530);
  eq('裁剪-视口上边界', r.maxY, 70);
  const rPad=api.visibleWorldRect(v,dims,800,600,48);
  eq('裁剪-外扩像素换算为世界', rPad.minX, -48);

  const k1=api.sceneStaticKey(v,dims,800,600);
  eq('缓存-同输入签名稳定', api.sceneStaticKey(v,dims,800,600), k1);
  ok('缓存-视口变化使签名失效', api.sceneStaticKey({zoom:2,panX:0,panY:0},dims,800,600)!==k1);
  api.invalidateStatic();
  ok('缓存-显式作废使签名失效', api.sceneStaticKey(v,dims,800,600)!==k1);
  const k2=api.sceneStaticKey(v,dims,800,600);
  api.selectedIds.add('X1');
  eq('缓存-选择集变化不再使签名失效（N-23）', api.sceneStaticKey(v,dims,800,600), k2);
  api.setDrag({type:'move',moved:false,originals:new Map([['X1',{}]])});
  eq('缓存-拖动未越2px阈值不排除静态层', api.sceneStaticKey(v,dims,800,600), k2);
  api.setDrag({type:'move',moved:true,originals:new Map([['X1',{}]])});
  ok('缓存-拖动越阈值后排除对象使签名失效', api.sceneStaticKey(v,dims,800,600)!==k2);
  ok('缓存-拖拽集合稳定时签名稳定', api.sceneStaticKey(v,dims,800,600)===api.sceneStaticKey(v,dims,800,600));
  api.setDrag({type:'node',id:'X1',handle:{index:0},dirty:false});
  eq('缓存-控制点未改形不排除静态层', api.sceneStaticKey(v,dims,800,600), k2);
  api.setDrag({type:'node',id:'X1',handle:{index:0},dirty:true});
  ok('缓存-控制点改形后排除对象使签名失效', api.sceneStaticKey(v,dims,800,600)!==k2);
  api.setDrag(null);
  eq('缓存-结束拖拽后恢复包含全部对象', api.sceneStaticKey(v,dims,800,600), k2);
  api.resetState();
}

});

/* 48. 覆盖率：分辨率参数与盲区多边形导出数据 -------------------------------- */
await section("48. 覆盖率：分辨率参数与盲区多边形导出数据", async () => {
{
  api.resetState();
  api.state.objects.push(api.baseObject('rect','rect.area',{name:'B1',x:0,y:0,width:20,height:20}));
  const coarse=api.analyzeCoverage(api.state,{targetCells:400});
  const fine=api.analyzeCoverage(api.state,{targetCells:9000});
  ok('覆盖精度-目标格数越大步长越小', fine.regions[0].cell < coarse.regions[0].cell);
  ok('覆盖精度-步长下限0.03m', coarse.regions[0].cell >= .03);

  const rects=api.blindSpotRects(coarse);
  eq('盲区-全盲时每行合并为一个矩形', rects.length, coarse.regions[0].ny);
  eq('盲区-矩形为四个顶点', rects[0].points.length, 4);
  approx('盲区-多边形总面积=区域面积', api.blindSpotArea(coarse), 400, 1e-6);

  api.state.objects.push(api.baseObject('point','point.dome',{name:'D',x:10,y:10,phys:1000}));
  const full=api.analyzeCoverage(api.state,{targetCells:400});
  eq('盲区-全覆盖时无盲区面', api.blindSpotRects(full).length, 0);
  approx('盲区-全覆盖面积为0', api.blindSpotArea(full), 0, 1e-9);

  api.state.objects[1]=api.baseObject('point','point.camera',{name:'C',x:10,y:10,phys:1000,angle:0});
  const part=api.analyzeCoverage(api.state,{targetCells:4000});
  const pr=part.regions[0];
  const blindCells=pr.grid.reduce((s,g)=>s+(g===0?1:0),0);
  approx('盲区-多边形面积=盲格数×格面积', api.blindSpotArea(part), blindCells*pr.cell*pr.cell, 1e-6);
  ok('盲区-多边形面积与栅格盲区接近(<2%)', Math.abs(api.blindSpotArea(part)-part.totalBlind)<=part.totalBlind*.02);
  ok('盲区-部分覆盖存在面', api.blindSpotRects(part).length>0);
  api.resetState();
}

});

/* 48.1 覆盖率口径 v3：与缩放无关、面积同源、隐藏图层与退化区域不计入 -------- */
await section("48.1 覆盖率口径 v3：与缩放无关、面积同源、隐藏图层与退化区域不计入", async () => {
{
  api.resetState();
  api.state.objects.push(api.baseObject('rect','rect.area',{name:'R2',x:0,y:0,width:50,height:40}));
  api.state.objects.push(api.baseObject('point','point.camera',{name:'C2',x:10,y:10,phys:40,angle:45}));
  const zooms=[0.2,4,20,80];
  const runs=zooms.map(z=>{
    api.state.viewport=Object.assign({},api.state.viewport,{zoom:z});
    return api.analyzeCoverage(api.state);
  });
  const ratios=runs.map(r=>r.ratio), cells=runs.map(r=>r.regions[0].cell);
  const span=Math.max(...ratios)-Math.min(...ratios);
  eq('覆盖口径v2-4个缩放级别覆盖率完全一致', span, 0);
  ok('覆盖口径v2-缩放差异≤1个百分点', span<=0.01);
  approx('覆盖口径v2-格边不随缩放变化', Math.max(...cells)-Math.min(...cells), 0, 1e-12);
  const fixed=runs[0];
  eq('覆盖口径v3-固定目标格数', fixed.targetCells, api.APP_LIMITS.COVERAGE_TARGET_CELLS);
  eq('覆盖口径v3-口径版本', fixed.spec.version, 3);
  eq('覆盖口径v3-面积源标记', fixed.spec.areaSource, 'shapeArea/polygonArea');
  eq('覆盖口径v3-标记与缩放无关', fixed.spec.zoomIndependent, true);
  ok('覆盖口径v2-总格数受上限护栏约束', fixed.gridCells<=api.APP_LIMITS.COVERAGE_MAX_CELLS);
  ok('覆盖口径v2-格边不低于下限', fixed.regions[0].cell>=api.APP_LIMITS.COVERAGE_CELL_MIN_M);

  const two=api.analyzeCoverage({objects:[
    api.baseObject('rect','rect.area',{name:'A',x:0,y:0,width:20,height:20}),
    api.baseObject('rect','rect.area',{name:'B',x:100,y:0,width:40,height:40})
  ]});
  approx('覆盖口径v2-按面积分配（同形等比区域格边一致）', two.regions[0].cell, two.regions[1].cell, 1e-9);

  api.resetState();
  const hiddenLayer={id:'layer.hidden',name:'隐藏图层',visible:false,locked:false};
  api.state.layers.push(hiddenLayer);
  api.state.objects.push(api.baseObject('rect','rect.area',{name:'HR',x:0,y:0,width:20,height:20,layerId:'layer.hidden'}));
  api.state.objects.push(api.baseObject('rect','rect.area',{name:'VR',x:100,y:0,width:20,height:20}));
  api.state.objects.push(api.baseObject('point','point.dome',{name:'HC',x:10,y:10,phys:30,layerId:'layer.hidden'}));
  hiddenLayer.visible=true;
  const baseline=api.analyzeCoverage(api.state);
  eq('覆盖口径v2-可见时两个区域参与统计', baseline.regions.length, 2);
  hiddenLayer.visible=false;
  const hidden=api.analyzeCoverage(api.state);
  eq('覆盖口径v2-隐藏图层区域不计入分母', hidden.totalArea, 400);
  eq('覆盖口径v2-隐藏图层设备不计入摄像头', hidden.cameraCount, 0);
  eq('覆盖口径v2-只统计可见区域', hidden.regions.length, 1);
  hiddenLayer.visible=true;
  const shown=api.analyzeCoverage(api.state);
  eq('覆盖口径v2-图层恢复可见后区域重新计入', shown.regions.length, 2);
  eq('覆盖口径v2-图层恢复后格数可复现', shown.gridCells, baseline.gridCells);
  eq('覆盖口径v2-图层恢复后覆盖率可复现', shown.ratio, baseline.ratio);
  hiddenLayer.visible=false;
  const again=api.analyzeCoverage(api.state);
  eq('覆盖口径v2-再次隐藏结果可复现', again.totalArea, hidden.totalArea);
  eq('覆盖口径v2-再次隐藏格数可复现', again.gridCells, hidden.gridCells);

  api.state.objects[1].visible=false;
  const invisible=api.analyzeCoverage(api.state);
  eq('覆盖口径v2-隐藏对象区域不计入分母', invisible.totalArea, 0);

  api.resetState();
  api.state.objects.push(api.baseObject('rect','rect.area',{name:'HUGE',x:0,y:0,width:5000,height:5000}));
  const hugeT0=Date.now();
  const huge=api.analyzeCoverage(api.state);
  const hugeMs=Date.now()-hugeT0;
  ok('覆盖口径v3-5000×5000m 格数不超上限', huge.gridCells<=api.APP_LIMITS.COVERAGE_MAX_CELLS);
  approx('覆盖口径v3-5000×5000m 无设备覆盖率为0', huge.ratio, 0, 1e-9);
  ok('覆盖口径v3-5000×5000m 单次分析 <300ms（实测 '+hugeMs+'ms）', hugeMs<300);

  /* N-20：统计面板、覆盖率面板、导出区域三处面积同源（圆/椭圆/扇形用解析公式） */
  api.resetState();
  api.state.objects.push(
    api.baseObject('rect','rect.area',{name:'C',x:0,y:0,width:10,height:10,shape:{type:'circle',r:5}}),
    api.baseObject('rect','rect.area',{name:'E',x:40,y:0,width:10,height:10,shape:{type:'ellipse',rx:5,ry:3}}),
    api.baseObject('rect','rect.area',{name:'S',x:80,y:0,width:10,height:10,shape:{type:'sector',r:5,a0:0,a1:90}})
  );
  const covArea=api.analyzeCoverage(api.state).totalArea;
  const statArea=api.state.objects.reduce((s,o)=>s+api.objectArea(o),0);
  const repoArea=api.regionPolygons(api.state).reduce((s,r)=>s+r.area,0);
  approx('覆盖口径v3-面板总面积=统计解析面积', covArea, statArea, 1e-9);
  approx('覆盖口径v3-导出区域面积=统计解析面积', repoArea, statArea, 1e-9);

  /* 0 面积退化区域：统计分母与区域列表同时排除 */
  api.state.objects.push(api.baseObject('rect','rect.area',{name:'ZERO',x:200,y:0,width:0,height:10}));
  eq('覆盖口径v3-0面积区域不进入分母', api.analyzeCoverage(api.state).regions.length, 3);
  approx('覆盖口径v3-0面积区域不改变总面积', api.analyzeCoverage(api.state).totalArea, statArea, 1e-9);

  /* 优化器基准覆盖率与面板同口径（同一 targetCells） */
  api.resetState();
  api.state.objects.push(
    api.baseObject('rect','rect.area',{name:'A',x:0,y:0,width:20,height:20}),
    api.baseObject('point','point.camera',{name:'C',x:10,y:10,phys:10,angle:45})
  );
  const sameCov=api.analyzeCoverage(api.state,{targetCells:6000});
  const optBase=api.optimizeCameraPlacement(api.state,{phys:20,fov:90,targetRatio:.99,maxAdd:1,grid:6,targetCells:6000});
  approx('覆盖口径v3-优化器基准覆盖率=面板覆盖率', optBase.beforeRatio, sameCov.ratio, 1e-12);
  ok('覆盖口径v3-优化器提升不降低', optBase.afterRatio>=optBase.beforeRatio-1e-12);

  /* 优化器搜索耗时实测（记录用，不设硬阈值） */
  api.resetState();
  api.state.objects.push(api.baseObject('rect','rect.area',{name:'OPT',x:0,y:0,width:100,height:100}));
  const optT0=Date.now();
  api.optimizeCameraPlacement(api.state,{phys:30,fov:90,targetRatio:.9,maxAdd:2,grid:10,targetCells:2500});
  const optMs=Date.now()-optT0;
  ok('覆盖口径v3-优化器搜索耗时实测 '+optMs+'ms（Node 桩，仅记录）', optMs>=0);
  console.log('  [N-20] 5000×5000m 覆盖率分析 ' + hugeMs + ' ms；优化器搜索 ' + optMs + ' ms（Node 桩）');
  api.resetState();
}

});

/* 49. 运行环境能力探测：file:// 与 IDB/SW/Blob 缺失时的显式降级 ---------------- */
await section("49. 运行环境能力探测：file:// 与 IDB/SW/Blob 缺失时的显式降级", async () => {
{
  const fileEnv=api.detectCapabilities({protocol:'file:',indexedDB:{},serviceWorker:{},Blob:function(){},createObjectURL:true});
  eq('能力-file模式识别', fileEnv.file, true);
  eq('能力-file下SW不可用', fileEnv.sw, false);
  eq('能力-file下IDB可用为ok', fileEnv.level, 'ok');
  ok('能力-file给出离线模式说明', fileEnv.warnings.some(w=>w.includes('file://')));

  const hosted=api.detectCapabilities({protocol:'https:',indexedDB:{},serviceWorker:{},Blob:function(){},createObjectURL:true});
  eq('能力-托管模式SW可用', hosted.sw, true);
  eq('能力-托管模式无file提示', hosted.warnings.some(w=>w.includes('file://')), false);

  const degraded=api.detectCapabilities({protocol:'https:',indexedDB:null,serviceWorker:{}});
  eq('能力-无IDB降级标记', degraded.level, 'degraded');
  ok('能力-无IDB给出localStorage降级提示', degraded.warnings.some(w=>w.includes('localStorage')));

  const noBlob=api.detectCapabilities({protocol:'file:',indexedDB:{},Blob:null,createObjectURL:true});
  eq('能力-无Blob识别', noBlob.blob, false);
  ok('能力-无Blob给出导入导出提示', noBlob.warnings.some(w=>w.includes('Blob')));

  /* Service Worker 必须在站点根目录：/js/ 下的默认 scope 只能接管 /js/，无法缓存 index.html */
  ok('PWA-Service Worker 位于根目录', existsSync(join(root,'sw.js')));
  ok('PWA-旧 js/sw.js 已移除', !existsSync(join(root,'js','sw.js')));
  const appSrc=readFileSync(join(root,'js','core','app.js'),'utf8');
  ok('PWA-注册路径指向根 sw.js', /serviceWorker\.register\(\s*['"]sw\.js['"]\s*\)/.test(appSrc));
}

});

/* 50. 解析器加固：ZIP/XLSX/DXF/PDF 的输入上限与畸形样例 ---------------------- */
await section("50. 解析器加固：ZIP/XLSX/DXF/PDF 的输入上限与畸形样例", async () => {
asyncSuites.push((async()=>{
  const rejects=async(name,promise,re)=>{
    try{ await promise; ok(name+'（未抛错）',false); }
    catch(e){ ok(name+(re?`（${e.message}）`:''),re?re.test(e.message):true); }
  };

  /* ---- ZIP ---- */
  const zipOk=api.Zip.build([{name:'a.txt',text:'hello',},{name:'b/d.bin',bytes:new Uint8Array([1,2,3])}]);
  ok('加固ZIP-正常包可读', Object.keys(await api.Zip.readEntries(zipOk)).length===2);
  await rejects('加固ZIP-超过字节上限', api.Zip.readEntries(zipOk,{maxBytes:10}), /过大/);
  await rejects('加固ZIP-条目数超限', api.Zip.readEntries(zipOk,{maxEntries:1}), /条目数/);
  await rejects('加固ZIP-单文件解压上限', api.Zip.readEntries(zipOk,{maxEntryBytes:2}), /单文件/);
  await rejects('加固ZIP-解压总量上限', api.Zip.readEntries(zipOk,{maxTotalBytes:3}), /总量/);
  await rejects('加固ZIP-空缓冲', api.Zip.readEntries(new ArrayBuffer(0)), /ZIP 结构缺失|截断/);
  await rejects('加固ZIP-随机字节', api.Zip.readEntries(new Uint8Array([1,2,3,4,5,6,7,8]).buffer), /ZIP 结构缺失|截断/);
  /* ZIP64 标记（EOCD 条目数 0xFFFF） */
  const zip64=zipOk.slice(0);
  const z64=new Uint8Array(zip64);
  for(let i=z64.length-22;i>=0;i--){
    if(z64[i]===0x50&&z64[i+1]===0x4b&&z64[i+2]===0x05&&z64[i+3]===0x06){
      new DataView(zip64).setUint16(i+10,0xFFFF,true); break;
    }
  }
  await rejects('加固ZIP-ZIP64拒绝', api.Zip.readEntries(zip64), /ZIP64/);
  /* 不支持的压缩方式（中央目录 method 改为 99） */
  const badMethod=zipOk.slice(0), bm=new Uint8Array(badMethod);
  for(let i=0;i<bm.length-4;i++){
    if(bm[i]===0x50&&bm[i+1]===0x4b&&bm[i+2]===0x01&&bm[i+3]===0x02){ new DataView(badMethod).setUint16(i+10,99,true); break; }
  }
  await rejects('加固ZIP-不支持的压缩方式', api.Zip.readEntries(badMethod), /压缩方式/);
  /* 中央目录偏移越界 → 统一转为「损坏或截断」 */
  const badOffset=zipOk.slice(0), bo=new Uint8Array(badOffset);
  for(let i=bo.length-22;i>=0;i--){
    if(bo[i]===0x50&&bo[i+1]===0x4b&&bo[i+2]===0x05&&bo[i+3]===0x06){ new DataView(badOffset).setUint32(i+16,0xFFFFF000,true); break; }
  }
  await rejects('加固ZIP-中央目录越界', api.Zip.readEntries(badOffset), /损坏|截断/);
  const zipDir=api.Zip.build([{name:'dir/',text:''},{name:'f.txt',text:'x'}]);
  eq('加固ZIP-目录条目不计入文件', Object.keys(await api.Zip.readEntries(zipDir)).length, 1);

  /* ---- XLSX ---- */
  const table=[['编号','对象类型','X','Y'],['O1','点设备','1','2'],['O2','点设备','3','4'],['O3','点设备','5','6']];
  const xlsxOk=api.Xlsx.build(table,'S');
  eq('加固XLSX-正常读取行数', (await api.Xlsx.readRows(xlsxOk)).length, 4);
  await rejects('加固XLSX-行数超限', api.Xlsx.readRows(xlsxOk,{maxRows:2}), /行数/);
  await rejects('加固XLSX-列数超限', api.Xlsx.readRows(xlsxOk,{maxCols:2}), /列数/);
  await rejects('加固XLSX-非ZIP输入', api.Xlsx.readRows(new Uint8Array([1,2,3,4])), /ZIP|XLSX/);
  const zipNoSheet=api.Zip.build([{name:'hello.txt',text:'x'}]);
  await rejects('加固XLSX-无工作表', api.Xlsx.readRows(zipNoSheet), /工作表/);
  const badXml=api.Zip.build([{name:'xl/worksheets/sheet1.xml',text:'<worksheet><row><c r="A1"><v>1</v></c>'}]);
  await rejects('加固XLSX-畸形XML', api.Xlsx.readRows(badXml), /./);
  await rejects('加固XLSX-空缓冲', api.Xlsx.readRows(new ArrayBuffer(0)), /ZIP/);
  const emptySheet=api.Zip.build([{name:'xl/worksheets/sheet1.xml',text:'<worksheet></worksheet>'}]);
  eq('加固XLSX-空工作表返回空表', (await api.Xlsx.readRows(emptySheet)).length, 0);
  /* IO-P2-21：单表超限只跳过该表，主表仍可导入 */
  const sheetXml=rows=>'<worksheet><sheetData>'+rows.map((cells,ri)=>'<row>'+cells.map((v,ci)=>
    '<c r="'+(ci?'B':'A')+(ri+1)+'" t="inlineStr"><is><t>'+v+'</t></is></c>').join('')+'</row>').join('')+'</sheetData></worksheet>';
  const multiSheet=api.Zip.build([
    {name:'xl/workbook.xml',text:'<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="主表" sheetId="1" r:id="rId1"/><sheet name="附表" sheetId="2" r:id="rId2"/></sheets></workbook>'},
    {name:'xl/_rels/workbook.xml.rels',text:'<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>'},
    {name:'xl/worksheets/sheet1.xml',text:sheetXml([['编号','对象类型'],['O1','点设备']])},
    {name:'xl/worksheets/sheet2.xml',text:sheetXml([['编号','对象类型'],['A','点设备'],['B','点设备'],['C','点设备']])}
  ]);
  const skipRows=await api.Xlsx.readRows(multiSheet,{maxRows:3});
  eq('加固XLSX-超限附表跳过', [skipRows.length,skipRows.skippedSheets], [2,1]);
  const onlyBig=api.Zip.build([{name:'xl/worksheets/sheet1.xml',text:sheetXml([['编号'],['1'],['2'],['3']])}]);
  await rejects('加固XLSX-全部超限仍报错', api.Xlsx.readRows(onlyBig,{maxRows:3}), /行数/);

  /* ---- DXF ---- */
  eq('加固DXF-空文本返回空实体', api.Dxf.parseDxf('').entities.length, 0);
  eq('加固DXF-null返回空实体', api.Dxf.parseDxf(null).entities.length, 0);
  eq('加固DXF-随机文本返回空实体', api.Dxf.parseDxf('not a dxf at all\n1\n2\n3').entities.length, 0);
  const dxfLines=['0','SECTION','2','ENTITIES'];
  for(let i=0;i<5;i++) dxfLines.push('0','LINE','8','0','10',''+i,'20','0','11',''+(i+1),'21','0');
  dxfLines.push('0','ENDSEC','0','EOF');
  const dxfOk=dxfLines.join('\n');
  eq('加固DXF-正常解析5条线', api.Dxf.parseDxf(dxfOk).entities.length, 5);
  let dxfErr=null; try{ api.Dxf.parseDxf(dxfOk,{maxChars:20}); }catch(e){ dxfErr=e; }
  ok('加固DXF-文本长度超限', !!dxfErr&&/过大/.test(dxfErr.message));
  dxfErr=null; try{ api.Dxf.parseDxf(dxfOk,{maxEntities:2}); }catch(e){ dxfErr=e; }
  ok('加固DXF-实体数超限', !!dxfErr&&/实体数/.test(dxfErr.message));
  eq('加固DXF-实体数恰好等于上限可通过', api.Dxf.parseDxf(dxfOk,{maxEntities:5}).entities.length, 5);
  let truncatedOk=true; try{ api.Dxf.parseDxf(dxfOk.slice(0,Math.floor(dxfOk.length/2))); }catch(e){ truncatedOk=false; }
  ok('加固DXF-截断文件友好降级', truncatedOk);

  /* ---- PDF ---- */
  const content='10 10 100 50 re S\n';
  const obj=(n,body)=>n+' 0 obj\n'+body+'\nendobj\n';
  let pdf='%PDF-1.4\n';
  pdf+=obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  pdf+=obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  pdf+=obj(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R >>');
  pdf+=obj(4,'<< /Length '+content.length+' >>\nstream\n'+content+'endstream');
  pdf+='%%EOF';
  eq('加固PDF-正常页数', (await api.PdfRead.parsePdf(pdf)).paths.length>=1, true);
  await rejects('加固PDF-非PDF输入', api.PdfRead.parsePdf('not a pdf'), /不是有效的 PDF/);
  await rejects('加固PDF-空输入', api.PdfRead.parsePdf(new Uint8Array(0)), /不是有效的 PDF/);
  await rejects('加固PDF-字节上限', api.PdfRead.parsePdf(pdf,{maxBytes:8}), /过大/);
  await rejects('加固PDF-页数上限', api.PdfRead.parsePdf(pdf,{maxPages:0}), /页数/);
  await rejects('加固PDF-对象数上限', api.PdfRead.parsePdf(pdf,{maxObjects:1}), /对象数/);
  await rejects('加固PDF-无页面结构', api.PdfRead.parsePdf('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'), /未找到页面/);
  await rejects('加固PDF-截断内容流', api.PdfRead.parsePdf(pdf.slice(0,60)), /未找到页面|不是有效/);
  /* 两页 PDF：页数上限 1 应拒绝；对象数恰好等于上限应通过 */
  const two=pdf.replace('%%EOF',obj(5,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>')+'%%EOF');
  await rejects('加固PDF-两页超过上限1', api.PdfRead.parsePdf(two,{maxPages:1}), /页数/);
  eq('加固PDF-对象数恰好等于上限可通过', (await api.PdfRead.parsePdf(two,{maxObjects:5})).paths.length, 1);

  /* N-03：解压上限必须落在累计阶段，不能先完整展开再报错 */
  {
    let pulled = 0, cancelled = false;
    const endless = new ReadableStream({
      pull(c) {
        if (cancelled) return new Promise(() => {});   /* 取消后不再拉取，避免向已关闭的 controller enqueue */
        pulled++; c.enqueue(new Uint8Array(1024 * 1024));
      },
      cancel() { cancelled = true; }
    });
    await rejects('N-03 解压炸弹-无限流累计超限即拒绝', api.PdfRead.readStreamCapped(endless, 2 * 1024 * 1024 + 1), /解压炸弹/);
    ok('N-03 解压炸弹-未完整展开（拉取块数 ≤ 4）', pulled <= 4);
    const small = await api.PdfRead.readStreamCapped(new Response(new Uint8Array([1, 2, 3])).body, 1024);
    eq('N-03 限内流按序拼接', Array.from(small), [1, 2, 3]);
    const bombSrc = new Uint8Array(4 * 1024 * 1024);
    const packed = new Uint8Array(await new Response(new Blob([bombSrc]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
    ok('N-03 压缩炸弹样本足够小', packed.length < 64 * 1024);
    await rejects('N-03 解压炸弹-真实压缩流超限被拒', api.PdfRead.inflate(packed, { maxInflateBytes: 1024 * 1024 }), /解压炸弹|上限/);
  }
})());

});

/* 51. 布点优化：贪心覆盖最大化、增益递减、目标/台数上限 ---------------------- */
await section("51. 布点优化：贪心覆盖最大化、增益递减、目标/台数上限", async () => {
{
  api.resetState();
  api.state.objects.push(api.baseObject('rect','rect.area',{name:'A',x:0,y:0,width:100,height:100}));
  const opt=api.optimizeCameraPlacement(api.state,{phys:40,fov:360,targetRatio:.9,maxAdd:3,grid:8,targetCells:2500});
  eq('布点-初始覆盖率为0', opt.beforeRatio, 0);
  ok('布点-给出至少一台建议', opt.suggestions.length>=1);
  ok('布点-单台增益大于0', opt.suggestions[0].gain>0);
  ok('布点-不超过最大新增台数', opt.suggestions.length<=3);
  ok('布点-覆盖率单调不降', opt.suggestions.every((s,i)=>i===0||s.ratioAfter>=opt.suggestions[i-1].ratioAfter));
  ok('布点-最终覆盖率提升', opt.afterRatio>opt.beforeRatio);
  eq('布点-全向视场朝向为0', opt.suggestions[0].angle, 0);
  ok('布点-建议点位为有限坐标', Number.isFinite(opt.suggestions[0].x)&&Number.isFinite(opt.suggestions[0].y));

  const one=api.optimizeCameraPlacement(api.state,{phys:40,fov:360,targetRatio:.99,maxAdd:1,grid:6,targetCells:1500});
  eq('布点-最多新增1台生效', one.suggestions.length, 1);

  /* 已全覆盖：不再给建议且标记达标 */
  api.resetState();
  api.state.objects.push(
    api.baseObject('rect','rect.area',{name:'B',x:0,y:0,width:10,height:10}),
    api.baseObject('point','point.dome',{name:'D',x:5,y:5,phys:1000})
  );
  const full=api.optimizeCameraPlacement(api.state,{phys:40,fov:360,targetRatio:.9,maxAdd:3});
  eq('布点-已达标不再建议', full.suggestions.length, 0);
  eq('布点-已达标标记', full.reached, true);
  approx('布点-已全覆盖比例≈1', full.beforeRatio, 1, 1e-6);

  /* 扇形：朝向在 [0,360) 内 */
  const sec=api.optimizeCameraPlacement(api.state,{phys:60,fov:90,targetRatio:.5,maxAdd:1,grid:6,targetCells:1500});
  ok('布点-扇形朝向合法', sec.suggestions.length===0||(sec.suggestions[0].angle>=0&&sec.suggestions[0].angle<360));

  api.resetState();
  const none=api.optimizeCameraPlacement(api.state,{});
  eq('布点-无区域返回空结果', none.empty, true);
  eq('布点-无区域无建议', none.suggestions.length, 0);
}

});

/* 52. 设备台账扩展字段 + 零依赖二维码编码器 -------------------------------- */
await section("52. 设备台账扩展字段 + 零依赖二维码编码器", async () => {
{
  const q=api.Qr;
  eq('QR-矩阵尺寸29', q.SIZE, 29);
  eq('QR-最大载荷42字节', q.MAX_BYTES, 42);
  eq('QR-格式信息M掩码0=0x5412', q._internals.formatBits(0), 0x5412);
  const data=Array.from({length:44},(_,i)=>(i*7)&255);
  const ec=q._internals.rsEc(data);
  eq('QR-纠错码字26个', ec.length, 26);
  let synOk=true;
  for(let i=0;i<26;i++){
    let s=0;
    for(const b of data.concat(ec)) s=q._internals.gfMul(s,q._internals.EXP[i])^b;
    if(s!==0){ synOk=false; break; }
  }
  ok('QR-Reed-Solomon 26个综合式全为0', synOk);

  const r=q.encodeText('PLOTPIN:P0001');
  eq('QR-编码尺寸', r.size, 29);
  ok('QR-掩码在0..7', r.mask>=0&&r.mask<=7);
  const corner=(r0,c0)=>{ for(let i=0;i<7;i++){ if(!r.modules[r0][c0+i]||!r.modules[r0+6][c0+i]||!r.modules[r0+i][c0]||!r.modules[r0+i][c0+6]) return false; } return true; };
  ok('QR-左上定位图形', corner(0,0));
  ok('QR-右上定位图形', corner(0,22));
  ok('QR-左下定位图形', corner(22,0));
  ok('QR-定时图形交替', r.modules[6][8]===1&&r.modules[6][9]===0&&r.modules[8][6]===1&&r.modules[9][6]===0);
  ok('QR-固定暗模块为黑', r.modules[21][8]===1);
  let tooLong=false;
  try{ q.encodeText('x'.repeat(43)); }catch(e){ tooLong=/过长/.test(e.message); }
  ok('QR-超过42字节拒绝', tooLong);
  eq('QR-UTF8字节长度', q.byteLength('P0001'), 5);
  ok('QR-中文按UTF8多字节计', q.byteLength('设备')>2);

  /* 台账字段：props 写入 / 导出列 / 空单元格不覆盖 / 照片资产可达 */
  api.resetState();
  const pt=api.baseObject('point','point.marker',{name:'L1',x:1,y:2});
  api.state.objects=[pt];
  const baseRow=api.objectRows().find(x=>x['编号']==='L1');
  ok('台账-包含型号/安装高度/IP/责任人列', ['型号','安装高度','IP','责任人'].every(k=>Object.prototype.hasOwnProperty.call(baseRow,k)));
  api.applyLedgerCells(pt,col=>({型号:'CAM-2',安装高度:'3.5',IP:'10.0.0.8',责任人:'张三'}[col]??''));
  eq('台账-型号写入props', pt.props.model, 'CAM-2');
  eq('台账-安装高度数值化', pt.props.mountHeight, 3.5);
  eq('台账-IP写入props', pt.props.ip, '10.0.0.8');
  eq('台账-责任人写入props', pt.props.owner, '张三');
  const row2=api.objectRows().find(x=>x['编号']==='L1');
  eq('台账-导出型号', row2['型号'], 'CAM-2');
  eq('台账-导出安装高度', row2['安装高度'], 3.5);
  eq('台账-导出IP', row2['IP'], '10.0.0.8');
  api.applyLedgerCells(pt,()=> '');
  eq('台账-空单元格不覆盖既有值', pt.props.model, 'CAM-2');

  pt.props.photoId='bg_photo';
  ok('台账-照片资产纳入可达集合', api.reachableBgAssetIds().includes('bg_photo'));
  api.selectedIds.add(pt.id); api.renderProps();
  const panel=api.$('propPanel').innerHTML;
  ok('台账-面板含型号/IP/责任人输入', panel.includes('data-field="propModel"')&&panel.includes('data-field="propIp"')&&panel.includes('data-field="propOwner"'));
  ok('台账-面板含照片上传控件', panel.includes('data-photo-input'));
  api.resetState();
}

});

/* 53. 多楼层 / 多底图：数据切换、持久化裁剪、迁移与资产可达 ------------------ */
await section("53. 多楼层 / 多底图：数据切换、持久化裁剪、迁移与资产可达", async () => {
{
  const st=api.resetState();
  eq('楼层-默认一层', st.floors.length, 1);
  eq('楼层-默认活动层', st.activeFloorId, 'floor.default');
  eq('楼层-默认名称', api.currentFloorName(), '1F');
  /* CORE-P2-15：活动楼层缺失只回退首层，不得再注入同名楼层条目（原分支恒不可达） */
  const noActive=api.buildProject({schema:api.SCHEMA,meta:{},settings:{},viewport:{},background:{kind:'empty'},site:null,
    layers:[],objectTypes:[],objects:[],floors:[{id:'F1',name:'1F'}],activeFloorId:'NOPE',tombstones:[]});
  eq('楼层-活动层缺失回退首层', noActive.activeFloorId, 'F1');
  eq('楼层-活动层缺失不新增楼层', noActive.floors.length, 1);

  st.objects.push(api.baseObject('point','point.marker',{name:'A',x:1,y:1}));
  api.syncActiveFloor();
  eq('楼层-同步对象到当前层条目', st.floors[0].objects.length, 1);
  eq('楼层-当前层对象计数', api.floorObjectCount(st.floors[0]), 1);

  const init=api.createInitialState();
  st.floors.push({id:'floor.F2',name:'2F',background:init.background,
    objects:[api.baseObject('point','point.marker',{name:'B',x:2,y:2})],viewport:{zoom:2,panX:10,panY:20}});
  ok('楼层-切换成功', api.switchFloorData('floor.F2'));
  eq('楼层-切换后活动层', st.activeFloorId, 'floor.F2');
  eq('楼层-切换后对象属于目标层', st.objects[0].name, 'B');
  eq('楼层-切换后名称', api.currentFloorName(), '2F');
  eq('楼层-切换后视口恢复', st.viewport.zoom, 2);
  ok('楼层-切回成功', api.switchFloorData('floor.default'));
  eq('楼层-切回对象完好', st.objects[0].name, 'A');
  eq('楼层-切回名称', api.currentFloorName(), '1F');
  ok('楼层-切到当前层返回false', !api.switchFloorData('floor.default'));
  ok('楼层-切到不存在层返回false', !api.switchFloorData('missing'));

  /* 持久化：当前层数据在顶层，楼层条目里不重复；非当前层保留完整数据 */
  api.syncActiveFloor();
  const snap=api.persistableState();
  const activeEntry=snap.floors.find(f=>f.id===snap.activeFloorId);
  ok('持久化-当前层条目不重复存数据', activeEntry&&activeEntry.background===undefined&&activeEntry.objects===undefined);
  const otherEntry=snap.floors.find(f=>f.id==='floor.F2');
  ok('持久化-非当前层保留对象', !!otherEntry&&Array.isArray(otherEntry.objects)&&otherEntry.objects.length===1);
  eq('持久化-顶层对象为当前层', snap.objects.length, 1);

  /* 迁移：多楼层工程；活动层取顶层，非活动层各自清洗 */
  const m=api.migrateProject({schema:'offline-drawing-annotation/v1',
    background:{kind:'rect',shape:{type:'rect',x:0,y:0,w:100,h:70}},
    objects:[{kind:'point',name:'A',x:1,y:1}],
    activeFloorId:'f2',
    floors:[
      {id:'f1',name:'1F',background:{kind:'circle',shape:{type:'circle',cx:0,cy:0,r:5}},objects:[{kind:'point',name:'B',x:2,y:2}]},
      {id:'f2',name:'2F'}
    ]});
  eq('迁移-楼层数', m.floors.length, 2);
  eq('迁移-活动层', m.activeFloorId, 'f2');
  eq('迁移-顶层对象属于活动层', m.objects[0].name, 'A');
  const f1=m.floors.find(f=>f.id==='f1');
  ok('迁移-非活动层保留对象', !!f1&&f1.objects[0].name==='B');
  eq('迁移-非活动层背景槽置空', f1&&f1.background.kind, 'empty');
  eq('迁移-非活动层场地类型', f1&&f1.site.kind, 'circle');
  const legacy=api.migrateProject({schema:'offline-drawing-annotation/v1',objects:[]});
  eq('迁移-旧档补默认楼层', legacy.floors.length, 1);
  eq('迁移-旧档默认层名', legacy.floors[0].name, '1F');

  /* 资产可达：非当前楼层底图与照片都纳入保留集合（migrateProject 已替换全局 state） */
  api.state.floors.push({id:'floor.F3',name:'3F',background:{kind:'image',assetId:'bg_floor3',shape:{type:'rect',w:1,h:1}},
    objects:[{props:{photoId:'bg_photo3'}}]});
  const ids=api.reachableBgAssetIds();
  ok('楼层-可达集合含非当前层底图', ids.includes('bg_floor3'));
  ok('楼层-可达集合含非当前层照片', ids.includes('bg_photo3'));

  /* 双槽：持久化 / SVG / DXF / 静态缓存签名 */
  api.resetState();
  Object.assign(api.state.settings,{siteNodes:true,siteSegLen:true,siteArea:true,sitePerimeter:true,siteRadius:true});
  api.state.site={id:'site.dual',name:'双槽场地',layerId:'layer.default',visible:true,locked:false,annot:{},style:{},
    updatedAt:'2026-01-01T00:00:00.000Z',kind:'polygon',
    shape:{type:'polygon',points:[[-5,-5],[15,-5],[15,10],[-5,10]]}};
  api.syncActiveFloor();
  const ps=api.persistableState();
  eq('双槽-顶层持久化含场地', ps.site&&ps.site.shape.type, 'polygon');
  eq('双槽-活动层不重复存场地', ps.floors.find(f=>f.id===ps.activeFloorId).site, undefined);
  eq('双槽-图片槽仍为空', ps.background.kind, 'empty');
  const svgDual=api.buildSceneSvg();
  ok('双槽-SVG 含场地多边形', svgDual.includes('<polygon points='));
  ok('双槽-SVG 含场地节点标注', svgDual.includes('P1 (-5.00, -5.00)'));
  ok('双槽-SVG 含场地段长标注', svgDual.includes(' m'));
  const dxfEnts=api.siteDxfEntities();
  eq('双槽-DXF 场地实体数', dxfEnts.length, 1);
  eq('双槽-DXF 场地独立图层', dxfEnts[0].layer, 'SITE');
  eq('双槽-DXF 场地闭合', dxfEnts[0].closed, true);
  eq('双槽-DXF 场地顶点数', dxfEnts[0].points.length, 4);
  api.invalidateStatic(); const sk1=api.sceneStaticKey({zoom:1,panX:0,panY:0},api.worldDims(),800,600);
  api.state.site.shape.points[0]=[0,0];
  ok('双槽-场地变化使静态签名失效', api.sceneStaticKey({zoom:1,panX:0,panY:0},api.worldDims(),800,600)!==sk1);
  api.state.site.visible=false;
  eq('双槽-隐藏场地不导出 DXF', api.siteDxfEntities().length, 0);
  ok('双槽-隐藏场地不渲染 SVG', !api.buildSceneSvg().includes('<polygon points='));
  api.resetState();
}

});

/* 导出双槽与场地标注证据：JSON / SVG / DXF 真实产物断言（PNG/PDF 共用 drawScene，浏览器回归触发） */
await section("导出双槽与场地标注证据：JSON / SVG / DXF 真实产物断言（PNG/PDF 共用 drawScene，浏览器回归触发）", async () => {
{
  api.resetState();
  Object.assign(api.state.settings,{siteNodes:true,siteSegLen:true,siteBase:true,siteRadius:true,siteArea:true,sitePerimeter:true});
  api.state.background={kind:'image',fileName:'export.png',assetId:'bg.export',width:100,height:80,origin:[0,0],
    metersPerPixel:1,calibrated:true,transform:{a:1,b:0,c:0,d:1,e:0,f:0}};
  api.state.site={type:'site',id:'site.export',name:'导出场地',layerId:'layer.default',visible:true,locked:false,
    annot:{},style:{},updatedAt:'2026-01-01T00:00:00.000Z',kind:'circle',
    shape:{type:'circle',cx:0,cy:0,r:10}};
  const eo=api.baseObject('point','point.marker',{id:'O_EXP',name:'EXP',x:5,y:5});
  api.state.objects=[eo];
  api.syncActiveFloor();
  const ejson=api.persistableState();
  eq('导出JSON-图片槽保留', ejson.background.kind, 'image');
  eq('导出JSON-场地槽保留半径', ejson.site.shape.r, 10);
  ok('导出JSON-序列化同时含双槽键', JSON.stringify(ejson).includes('"background"')&&JSON.stringify(ejson).includes('"site"'));
  const esvg=api.buildSceneSvg();
  ok('导出SVG-含场地半径文本', esvg.includes('10.00 m'));
  ok('导出SVG-含场地面积与周长', esvg.includes('面积 314.16 ㎡')&&esvg.includes('周长 62.83 m'));
  ok('导出SVG-含场地基点坐标', esvg.includes('(0.00, 0.00)'));
  ok('导出SVG-场地与业务对象同图输出', esvg.includes('>EXP<'));
  ok('导出SVG-场地标注先于业务对象', esvg.indexOf('10.00 m')<esvg.indexOf('>EXP<'));
  const edxf=api.siteDxfEntities();
  eq('导出DXF-场地图层', edxf.length===1&&edxf[0].layer, 'SITE');
  eq('导出DXF-场地闭合折线', edxf[0].closed, true);
  ok('导出DXF-场地顶点由圆轮廓采样', edxf[0].points.length>=8);
  eq('导出DXF-不进对象台账', api.objectRowsAll().filter(r=>r['编号']==='SITE').length, 0);

  /* IO-P2-25：exportJSON 纯函数化——只改副本时间戳，不改写实时 state（导出字段不变） */
  api.state.meta.updatedAt='2000-01-01T00:00:00.000Z';
  const realBlob=sandbox.Blob, realDl=sandbox.downloadBlob, realToast=sandbox.toast;
  let exported=null;
  sandbox.Blob=function(parts){ this.parts=parts; };
  sandbox.downloadBlob=blob=>{ exported=JSON.parse(blob.parts.join('')); };
  sandbox.toast=()=>{};
  await api.exportJSON();
  eq('导出JSON-不改实时更新时间', api.state.meta.updatedAt, '2000-01-01T00:00:00.000Z');
  ok('导出JSON-副本时间戳为导出时刻', typeof exported.meta.updatedAt==='string'&&exported.meta.updatedAt!=='2000-01-01T00:00:00.000Z');
  eq('导出JSON-字段结构不变', Object.keys(exported).sort(), Object.keys(api.persistableState()).sort());
  sandbox.Blob=realBlob; sandbox.downloadBlob=realDl; sandbox.toast=realToast;
  api.resetState();
}

});

/* 54. 方向约束（平行/垂直/等距/极轴）与临时参考线 ---------------------------- */
await section("54. 方向约束（平行/垂直/等距/极轴）与临时参考线", async () => {
{
  const p=(wp,opt)=>api.directionalSnap([0,0],wp,opt);
  let r=p([10,0.5],{refDir:0});
  eq('约束-参考边平行模式', r.mode, 'parallel');
  approx('约束-平行投影Y=0', r.p[1], 0, 1e-9);
  approx('约束-平行投影X=10', r.p[0], 10, 1e-9);
  r=p([0.5,10],{refDir:0});
  eq('约束-参考边垂直模式', r.mode, 'perpendicular');
  approx('约束-垂直投影X=0', r.p[0], 0, 1e-9);
  approx('约束-垂直投影Y=10', r.p[1], 10, 1e-9);
  r=p([-10,0.1],{refDir:0});
  eq('约束-反向平行也吸附', r.mode, 'parallel');
  approx('约束-反向平行X=-10', r.p[0], -10, 1e-9);
  r=p([7,0.2],{prevDir:0,prevLen:5});
  eq('约束-等距模式', r.mode, 'equal');
  approx('约束-等距长度沿用上一段', Math.hypot(r.p[0],r.p[1]), 5, 1e-9);
  r=p([10,0.4],{polarStep:45});
  eq('约束-极轴模式', r.mode, 'polar');
  approx('约束-极轴吸附到0°', r.p[1], 0, 1e-9);
  r=p([10,10],{});
  eq('约束-超出容差不吸附', r.mode, 'none');
  r=p([0.1,10],{refDir:0,tolDeg:0.5});
  eq('约束-容差可配置', r.mode, 'none');
  r=p([0,10],{refDir:0,tolDeg:0.5});
  eq('约束-垂直在严格容差内吸附', r.mode, 'perpendicular');

  /* 临时参考线：添加/延展/参与捕捉/删除/清除 */
  api.clearGuideLines();
  ok('参考线-添加成功', api.addGuideLine([0,0],[0,10]));
  eq('参考线-列表1条', api.guideLineList().length, 1);
  ok('参考线-零长度拒绝', !api.addGuideLine([1,1],[1,1]));
  const ge=api.guideEdges();
  eq('参考线-生成1条捕捉边', ge.length, 1);
  ok('参考线-按无限长延展', Math.hypot(ge[0].b[0]-ge[0].a[0],ge[0].b[1]-ge[0].a[1])>1e5);

  api.resetState();
  api.state.objects.push(api.baseObject('line','line.custom',{points:[[0,0],[10,0]],x:0,y:0}));
  api.clearGuideLines(); api.addGuideLine([7,-5],[7,5]);
  const edges=api.collectSnapEdges(api.state,()=>true);
  ok('参考线-纳入捕捉边集合', edges.some(e=>e.guide));
  const hit=api.findOsnap(api.state,[7,0.2],1,new Set(),()=>true,null);
  ok('参考线-与对象边交点可捕捉', !!hit&&hit.type==='intersection'&&Math.hypot(hit.p[0]-7,hit.p[1])<1e-6);
  ok('参考线-删除上一条', !!api.removeLastGuideLine());
  eq('参考线-删除后为空', api.guideLineList().length, 0);

  /* 设置默认与迁移 */
  eq('设置-极轴追踪默认关', api.migrateProject({schema:'offline-drawing-annotation/v1'}).settings.polar, false);
  eq('设置-极轴步长默认45', api.migrateProject({schema:'offline-drawing-annotation/v1'}).settings.polarStep, 45);
  eq('设置-非法极轴步长回退45', api.migrateProject({schema:'offline-drawing-annotation/v1',settings:{polarStep:37}}).settings.polarStep, 45);
  eq('设置-合法极轴步长保留', api.migrateProject({schema:'offline-drawing-annotation/v1',settings:{polar:true,polarStep:15}}).settings.polarStep, 15);
  api.clearGuideLines();
  api.resetState();
}

});

/* 55. 符号库（C-04）：36 个六类图元、别名搜索、安全清洗、统一路径、DXF 降级、JSON、golden */
await section("55. 符号库（C-04）：36 个六类图元、别名搜索、安全清洗、统一路径、DXF 降级、JSON、golden", async () => {
{
  const lib=api.SYMBOL_LIBRARY;
  eq('符号库-总数36', lib.length, 36);
  eq('符号库-分类固定六类', api.SYMBOL_CATEGORIES, ['视频监控','门禁','消防','网络','停车','其他']);
  api.SYMBOL_CATEGORIES.forEach(cat=>eq('符号库-分类数量 '+cat, lib.filter(s=>s.cat===cat).length, 6));
  eq('符号库-id唯一', new Set(lib.map(s=>s.id)).size, lib.length);
  eq('符号库-名称唯一', new Set(lib.map(s=>s.name)).size, lib.length);
  ok('符号库-每条都有别名与路径', lib.every(s=>Array.isArray(s.aliases)&&s.aliases.length&&Array.isArray(s.paths)&&s.paths.length));
  eq('符号库-全部注册为内置点类型', api.BUILTIN_TYPES.filter(t=>t.kind==='point'&&t.symbol&&t.symbol.length).length, lib.length);
  ok('符号库-别名搜索烟感', api.searchSymbols('烟感').some(s=>s.id==='sym.smoke'));
  ok('符号库-别名搜索NVR', api.searchSymbols('nvr').some(s=>s.id==='sym.nvr'));
  eq('符号库-分类筛选消防', api.searchSymbols('','消防').length, 6);
  ok('符号库-引擎索引构建', api.buildSymbolIndex().length===36);

  /* SVG 导入：path/circle/rect/polygon/line + viewBox */
  const parsed=api.parseSvgSymbol('<svg viewBox="0 0 48 32"><path d="M0 0L10 10" fill="none"/><circle cx="5" cy="6" r="2"/><rect x="1" y="2" width="3" height="4"/><polygon points="0,0 1,0 1,1"/><line x1="0" y1="0" x2="2" y2="2"/></svg>');
  eq('SVG导入-viewBox解析', parsed.vb, {x:0,y:0,w:48,h:32});
  eq('SVG导入-五类图元路径数', parsed.paths.length, 5);
  ok('SVG导入-圆形转路径', parsed.paths[1].d.includes('a2 2'));
  ok('SVG导入-矩形转路径', parsed.paths[2].d.includes('h3v4'));
  ok('SVG导入-多边形闭合', parsed.paths[3].d.endsWith('Z'));

  /* 安全：逐条断言拒绝并给出原因 */
  const bad=[
    ['无图形','<svg></svg>',/未找到/],
    ['script','<svg><script>alert(1)</script><path d="M0 0L1 1"/></svg>',/脚本/],
    ['onload 事件','<svg><path d="M0 0L1 1" onload="alert(1)"/></svg>',/on\* 事件/],
    ['外部 href','<svg><path d="M0 0L1 1" href="https://evil.example/x.svg"/></svg>',/外部资源/],
    ['外部 xlink:href','<svg><path d="M0 0L1 1" xlink:href="//evil.example/x.svg"/></svg>',/外部资源/],
    ['超深嵌套','<svg>'+'<g>'.repeat(20)+'<path d="M0 0L1 1"/>'+'</g>'.repeat(20)+'</svg>',/嵌套过深/],
    ['超大字节','<svg><path d="M0 0L1 1"/>'+' '.repeat(70000)+'</svg>',/64 KB/],
    ['元素超限','<svg>'+'<path d="M0 0L1 1"/>'.repeat(210)+'</svg>',/元素过多/],
    ['DOCTYPE','<!DOCTYPE svg><svg><path d="M0 0L1 1"/></svg>',/DOCTYPE/],
    ['危险元素 style','<svg><style>*{fill:red}</style><path d="M0 0L1 1"/></svg>',/<style>/],
    ['非法 path 字符','<svg><path d="M0 0%1 1"/></svg>',/非法字符/]
  ];
  bad.forEach(([name,text,re])=>{
    let err=null; try{ api.parseSvgSymbol(text); }catch(e){ err=e; }
    ok('SVG安全-'+name+'被拒并给原因', !!err&&re.test(err.message));
  });

  /* 迁移保留自定义图元几何；跑到非法 path 直接丢弃 */
  const m=api.migrateProject({schema:'offline-drawing-annotation/v1',
    objectTypes:[{id:'sym.test',kind:'point',name:'测试图元',color:'#123456',icon:'symbol',
      symbol:[{d:'M0 0L10 10',fill:false}],symbolViewBox:{x:0,y:0,w:48,h:32},
      category:'其他',symbolAliases:['测试别名']}],objects:[]});
  const tt=m.objectTypes.find(t=>t.id==='sym.test');
  ok('图元-迁移保留路径', !!tt&&tt.symbol.length===1&&tt.symbol[0].d==='M0 0L10 10');
  eq('图元-迁移保留viewBox', tt&&tt.symbolViewBox.w, 48);
  ok('图元-迁移保留分类与别名', tt&&tt.category==='其他'&&tt.symbolAliases.includes('测试别名'));

  /* 属性面板、同一 path 源、真实尺寸 SVG、无 Path2D 降级 */
  api.resetState();
  const pt=api.baseObject('point',lib[0].id,{name:'SYM',x:1,y:1,angle:30,phys:2});
  api.state.objects=[pt]; api.selectedIds.add(pt.id); api.renderProps();
  ok('图元-属性面板类型下拉含行业图元', api.$('propPanel').innerHTML.includes('枪机摄像头'));
  ok('图元-属性面板显示真实尺寸', api.$('propPanel').innerHTML.includes('物理尺寸(m)'));
  const symType=api.state.objectTypes.find(t=>t.id===lib[0].id);
  ok('图元-统一 path 源', JSON.stringify(api.symbolPathsFor(symType))===JSON.stringify(lib[0].paths.map(p=>({d:p,fill:false}))));
  const svg=api.buildSceneSvg();
  ok('图元-SVG导出包含图元路径', svg.includes('M3 9h11v6H3z')&&svg.includes('stroke-linecap="round"'));
  ok('图元-真实尺寸按米缩放', /rotate\(-30\)"><g transform=/.test(svg));
  const rec=new Proxy({},{get(t,p){
    if(p==='then') return undefined;
    if(p==='measureText') return ()=>({width:10});
    if(p==='canvas') return {clientWidth:900,clientHeight:600};
    if(p in t) return t[p];
    return ()=>{};
  },set(t,p,v){ t[p]=v; return true; }});
  let threw=false; try{ api.drawObject(rec,pt,{zoom:1},p=>p,1,1); }catch(e){ threw=true; }
  ok('图元-无Path2D环境降级不抛错', !threw);

  /* DXF：明确降级为折线近似，保留锚点，不静默丢失 */
  api.resetState();
  api.state.objects=[api.baseObject('point',lib[0].id,{name:'S1',x:10,y:20,angle:45,phys:2})];
  const dxf=api.dxfEntitiesForExport();
  eq('DXF降级-符号点数', dxf.report.symbolPoints, 1);
  ok('DXF降级-生成折线', dxf.report.approxPolylines>0&&dxf.entities.some(e=>e.type==='LWPOLYLINE'));
  ok('DXF降级-保留POINT锚点', dxf.entities.some(e=>e.type==='POINT'));
  ok('DXF降级-报告标注说明', dxf.report.degraded&&/折线近似/.test(dxf.report.note));
  const poly=api.pathToPolylines(lib[0].paths[1]);
  ok('DXF降级-圆弧离散', poly.length>0&&poly[0].points.length>3);
  const world=api.symbolPolylinesInWorld({symbol:lib[0].paths,symbolViewBox:lib[0].views},10,20,2,45);
  ok('DXF降级-世界尺寸与旋转', world.length>0&&Math.abs(world[0].points[0][0]-10)<2&&Math.abs(world[0].points[0][1]-20)<2);

  /* 自定义符号 JSON：导出仅当前工程、导入生成新 id、换工程不串数据 */
  api.resetState();
  api.state.objectTypes.push({id:'sym.custom.1',kind:'point',name:'自有图元',color:'#123456',icon:'symbol',
    builtin:false,scaleShape:'none',category:'其他',symbolAliases:['自定'],
    symbol:[{d:'M0 0L10 10',fill:false}],symbolViewBox:{x:0,y:0,w:24,h:24}});
  const bundle=api.customSymbolsFromTypes(api.state.objectTypes,api.state.meta);
  eq('符号JSON-仅导出自定义', bundle.symbols.length, 1);
  eq('符号JSON-schema', bundle.schema, 'plotpin.symbols/v1');
  const imported=api.sanitizeSymbolBundle(bundle,api.state.objectTypes.map(t=>t.id));
  eq('符号JSON-导入数量', imported.length, 1);
  ok('符号JSON-id冲突自动改新名', imported[0].id!=='sym.custom.1');
  api.state.objectTypes.push(...imported);
  let jsonErr=null; try{ api.sanitizeSymbolBundle({symbols:[{name:'坏',paths:[{d:'<script>alert(1)</script>'}]}]},[]); }catch(e){ jsonErr=e; }
  ok('符号JSON-非法路径拒绝', !!jsonErr&&/非法字符/.test(jsonErr.message));
  const beforeCount=api.state.objectTypes.length;
  api.resetState();
  eq('符号JSON-工程隔离', api.state.objectTypes.filter(t=>t.id==='sym.custom.1').length, 0);
  ok('符号JSON-新工程不含导入符号', api.state.objectTypes.length<beforeCount);

  /* golden：无符号工程逐字节不变；符号工程采集 SVG/DXF */
  const goldenRoot=join(root,'tests','golden');
  function plainFixture(){
    api.resetState();
    api.state.meta.name='C-04 基线工程';
    api.state.site={id:'site.golden',name:'基准场地',layerId:'layer.default',visible:true,locked:false,annot:{},style:{},updatedAt:'',kind:'rect',shape:{type:'rect',x:0,y:0,w:100,h:80}};
    api.state.background={kind:'empty',fileName:'',assetId:'',width:0,height:0,origin:[0,0],metersPerPixel:0.1,calibrated:false,transform:null};
    const a=api.baseObject('point','point.marker',{name:'P1',x:12,y:14,angle:30});
    const b=api.baseObject('rect','rect.area',{name:'R1',x:30,y:22,width:18,height:12,angle:15});
    const c=api.baseObject('line','line.boundary',{name:'L1',points:[[55,10],[72,14],[68,40]],closed:false});
    api.state.objects=[a,b,c];
  }
  function symbolFixture(){
    api.resetState();
    api.state.meta.name='C-04 符号工程';
    api.state.site={id:'site.golden',name:'基准场地',layerId:'layer.default',visible:true,locked:false,annot:{},style:{},updatedAt:'',kind:'rect',shape:{type:'rect',x:0,y:0,w:100,h:80}};
    api.state.background={kind:'empty',fileName:'',assetId:'',width:0,height:0,origin:[0,0],metersPerPixel:0.1,calibrated:false,transform:null};
    api.state.objects=[
      api.baseObject('point','sym.camera_gun',{name:'S1',x:12,y:14,angle:0,phys:0}),
      api.baseObject('point','sym.smoke',{name:'S2',x:40,y:30,angle:45,phys:0}),
      api.baseObject('point','sym.dome',{name:'S3',x:60,y:50,angle:30,phys:2.5})
    ];
  }
  function goldenCase(name,build){
    build();
    const svg=api.buildSceneSvg();
    const dxf=api.Dxf.buildDxf(api.dxfEntitiesForExport().entities,api.dxfEntitiesForExport().layers);
    if(process.env.UPDATE_GOLDEN==='1'){
      writeFileSync(join(goldenRoot,name+'.svg'),svg,'utf8');
      writeFileSync(join(goldenRoot,name+'.dxf'),dxf,'utf8');
      return;
    }
    const wantSvg=readFileSync(join(goldenRoot,name+'.svg'),'utf8');
    const wantDxf=readFileSync(join(goldenRoot,name+'.dxf'),'utf8');
    eq('golden-'+name+'.svg 逐字节一致', svg, wantSvg);
    eq('golden-'+name+'.dxf 逐字节一致', dxf, wantDxf);
  }
  function goldenSvgOnly(name,build){
    build();
    const svg=api.buildSceneSvg();
    if(process.env.UPDATE_GOLDEN==='1'){ writeFileSync(join(goldenRoot,name+'.svg'),svg,'utf8'); return; }
    eq('golden-'+name+'.svg 逐字节一致', svg, readFileSync(join(goldenRoot,name+'.svg'),'utf8'));
  }
  goldenCase('plain-scene',plainFixture);
  goldenCase('symbol-scene',symbolFixture);

  /* A1：旧工程 64 图元逐图标视觉回归
   * fixture 来自 a0aecf0:js/common/symbols.js（旧工程 objectTypes 会持久化 symbol paths）；
   * 逐图标 path 哈希锁定几何未被新归一化改写，再用全量 SVG golden 锁定渲染管线。 */
  const legacy=JSON.parse(readFileSync(join(root,'tests','fixtures','legacy-symbols.json'),'utf8'));
  const legacyCanon=paths=>paths.map(p=>(p.fill?'F':'S')+p.d).join('\u0001');
  eq('A1-旧图元数量=64', legacy.symbols.length, 64);
  eq('A1-旧图元 id 唯一', new Set(legacy.symbols.map(s=>s.id)).size, 64);
  for(const sym of legacy.symbols){
    const got=api.symbolPathsFor({symbol:sym.paths});
    eq('A1-'+sym.id+' 路径条数未变', got.length, sym.paths.length);
    eq('A1-'+sym.id+' 路径哈希未变', createHash('sha256').update(legacyCanon(got.map(p=>({d:p.d,fill:!!p.fill})))).digest('hex'), sym.pathsSha256);
    const polys=api.symbolPolylinesInWorld({symbol:sym.paths,symbolViewBox:{x:0,y:0,w:24,h:24}},10,10,4,30,{x:0,y:0,w:24,h:24});
    const polysOk=polys.length>0&&polys.every(p=>p.points.every(q=>Number.isFinite(q[0])&&Number.isFinite(q[1])));
    ok('A1-'+sym.id+' 可折线化且坐标有限', polysOk);
  }
  goldenSvgOnly('legacy-symbols',()=>{
    api.resetState();
    api.state.meta.name='旧工程 64 图元基线';
    api.state.site={id:'site.legacy',name:'基准场地',layerId:'layer.default',visible:true,locked:false,annot:{},style:{},updatedAt:'',kind:'rect',shape:{type:'rect',x:0,y:0,w:100,h:80}};
    api.state.background={kind:'empty',fileName:'',assetId:'',width:0,height:0,origin:[0,0],metersPerPixel:0.1,calibrated:false,transform:null};
    api.state.objectTypes=legacy.symbols.map(sym=>({id:sym.id,kind:'point',name:sym.name,color:'#1e293b',icon:'symbol',scaleShape:'none',builtin:true,symbol:sym.paths,symbolViewBox:{x:0,y:0,w:24,h:24},category:sym.cat}));
    api.state.objects=legacy.symbols.map((sym,i)=>api.baseObject('point',sym.id,{name:sym.name,x:12+(i%8)*12,y:10+Math.floor(i/8)*9,angle:(i*15)%360,phys:0}));
  });
  ok('A1-SVG 含 64 个旧符号组', (api.buildSceneSvg().match(/scale\(/g)||[]).length>=64);
  api.resetState();
}

});

/* 56. 单文件发行包：内联、去外链、图标 data URI、CSP 哈希白名单 ---------------- */
await section("56. 单文件发行包：内联、去外链、图标 data URI、CSP 哈希白名单", async () => {
{
  const sample='<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; img-src \'self\' data:"><link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon.svg" type="image/svg+xml"><link rel="stylesheet" href="a.css"></head><body><script src="a.js"></script><script src="b.js"></script></body></html>';
  const files={'a.css':'body{color:red}','a.js':'console.log("a")','b.js':'const x="</script>";','icon.svg':'<svg/>','manifest.webmanifest':'{}'};
  const out=buildStandalone(sample,p=>files[p]);
  ok('打包-样式内联', out.includes('<style>')&&out.includes('body{color:red}'));
  ok('打包-脚本顺序保留', out.indexOf('/* a.js */')<out.indexOf('/* b.js */'));
  ok('打包-无脚本外链', !/<script\s+src=/.test(out));
  ok('打包-manifest移除', !out.includes('manifest.webmanifest'));
  ok('打包-图标转dataURI', out.includes('data:image/svg+xml;base64,'));
  ok('打包-转义script闭合', out.includes('<\\/script'));
  /* CSP：两个内联脚本 → 两条 sha256；不得出现 unsafe-inline */
  const scriptSrc=(out.match(/script-src[^;]*/)||[''])[0];
  eq('打包-CSP哈希数与内联脚本数一致', (scriptSrc.match(/'sha256-/g)||[]).length, 2);
  ok('打包-CSP无unsafe-inline', !scriptSrc.includes('unsafe-inline'));
  ok('打包-CSP保留原策略', out.includes("default-src 'self'")&&out.includes("img-src 'self'"));

  let cspErr=null;
  try{ buildStandalone('<html><head></head><body><script src="a.js"></script></body></html>',p=>files[p]||''); }catch(e){ cspErr=e; }
  ok('打包-无CSP时拒绝构建', !!cspErr&&/Content-Security-Policy/.test(cspErr.message));

  const real=buildStandalone(readFileSync(join(root,'index.html'),'utf8'),p=>readFileSync(join(root,p),'utf8'));
  ok('打包-真实入口无外链脚本', !/<script\s+src=/.test(real));
  ok('打包-真实入口无外链样式', !/<link\s+rel="stylesheet"/.test(real));
  ok('打包-真实入口无manifest', !/rel="manifest"/.test(real));
  ok('打包-真实入口包含核心脚本', real.includes('buildSceneSvg')&&real.includes('openFloorManager'));
  ok('打包-体积合理(>100KB)', real.length>100000);
  /* 统计内联脚本时先剔除 HTML 注释（注释里也会出现文档性的 <script> 字样） */
  const realInline=(real.replace(/<!--[\s\S]*?-->/g,'').match(/<script>/g)||[]).length;
  const realHashes=(real.match(/'sha256-[A-Za-z0-9+/=]+'/g)||[]).length;
  ok('打包-真实入口CSP哈希全覆盖', realInline>10&&realInline===realHashes);
}

});

/* 56.1 type.icon 白名单 + esc：4 条注入路径（审计 A-02） -------------------- */
await section("56.1 type.icon 白名单 + esc：4 条注入路径（审计 A-02）", async () => {
{
  /* 1) normalizeIcon：任意字符串不得原样回传 */
  eq('图标-白名单内保留', api.normalizeIcon('camera','point'), 'camera');
  eq('图标-未知值按 kind 回退', api.normalizeIcon('evil"><img src=x>','point'), 'custom');
  eq('图标-未知 rect 回退 rect', api.normalizeIcon('<script>','rect'), 'rect');
  eq('图标-空值按 kind 回退', api.normalizeIcon('', 'line'), 'line');
  eq('图标-非 point/rect/line 回退 marker', api.normalizeIcon('x','unknown'), 'marker');
  ok('图标-白名单冻结', Object.isFrozen(api.TYPE_ICONS));

  /* 2) 存档清洗（mergeTypes）：保存后再读，icon 已白名单化 */
  const merged=api.mergeTypes([
    {id:'type.evil', kind:'point', name:'注入', icon:'"><script>alert(1)</script>'},
    {id:'type.ok', kind:'point', name:'正常', icon:'camera'}
  ]);
  const evil=merged.find(t=>t.id==='type.evil'), okType=merged.find(t=>t.id==='type.ok');
  eq('图标-存档清洗后为白名单值', evil.icon, 'custom');
  ok('图标-存档清洗不残留尖括号', !/<|>/.test(evil.icon));
  eq('图标-合法存档值保持不变', okType.icon, 'camera');

  /* 3) UI 渲染：renderTypes 生成的 HTML 中 raw 注入串必须被白名单/转义拦下 */
  api.state.objectTypes.push({id:'type.evil2',kind:'point',name:'<b>pwn</b>',color:'#7c3aed',icon:'"><script>alert(1)</script>',builtin:false});
  api.state.objectTypes.push({id:'type.evil3',kind:'point',name:'注入id',color:'#7c3aed',icon:'camera',builtin:false});
  api.renderTypes();
  const rendered=api.$('typeList').innerHTML||'';
  ok('图标-类型列表已渲染', rendered.length>0);
  ok('图标-列表不渲染原始注入串', !rendered.includes('<b>pwn</b>')&&!rendered.includes('<script>'));
  ok('图标-列表名称已转义', rendered.includes('&lt;b&gt;pwn&lt;/b&gt;'));
  ok('图标-列表图标为白名单值', rendered.includes('custom'));
  api.state.objectTypes=api.state.objectTypes.filter(t=>t.id!=='type.evil2'&&t.id!=='type.evil3');

  /* 4) 插件注册路径：PlotPin.registerObjectType 也要走同一套白名单清洗 */
  const PP=api.PlotPin;
  ok('插件-注册对象类型', PP.registerObjectType({id:'plugin.icon',kind:'point',name:'插件点',icon:'onerror=alert(1)'}));
  const pluginType=(PP.state.objectTypes||[]).find(t=>t.id==='plugin.icon');
  eq('图标-插件类型走白名单回退', pluginType&&pluginType.icon, 'custom');
  ok('图标-插件类型不残留注入串', !/<|>|=alert/.test(String(pluginType&&pluginType.icon)));
  PP.unregisterObjectType('plugin.icon');

  /* 5) CSP 声明存在且不允许脚本内联 */
  const indexHtml=readFileSync(join(root,'index.html'),'utf8');
  ok('CSP-入口声明存在', /http-equiv="Content-Security-Policy"/i.test(indexHtml));
  const csp=(indexHtml.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/i)||[])[1]||'';
  ok('CSP-script-src不允许unsafe-inline', /script-src[^;]*/.test(csp)&&!/script-src[^;]*'unsafe-inline'/.test(csp));
  ok('CSP-禁止object/base/form', /object-src 'none'/.test(csp)&&/base-uri 'none'/.test(csp)&&/form-action 'none'/.test(csp));
  ok('CSP-不允许远程源', !/https?:/.test(csp));
}

});

/* 57. 插件注册点：导出器 / 导入器注册、校验、查找与注销 -------------------- */
await section("57. 插件注册点：导出器 / 导入器注册、校验、查找与注销", async () => {
{
  const PP=api.PlotPin;
  ok('插件-暴露全局 API 与版本', !!PP&&typeof PP.version==='string'&&PP.version.length>0);
  eq('插件-初始无导出器', PP.listExporters().length, 0);
  ok('插件-注册导出器', PP.registerExporter({id:'demo',label:'演示导出',ext:'.txt',mime:'text/plain',run(){}}));
  eq('插件-导出器列表', PP.listExporters()[0].label, '演示导出');
  eq('插件-导出扩展名规范化', PP.listExporters()[0].ext, 'txt');
  ok('插件-按 id 查找导出器', !!PP.findExporter('demo'));
  let e1=null; try{ PP.registerExporter({id:'demo',run(){}}); }catch(e){ e1=e; }
  ok('插件-重复 id 拒绝', !!e1&&/已存在/.test(e1.message));
  let e2=null; try{ PP.registerExporter({id:'x'}); }catch(e){ e2=e; }
  ok('插件-缺少 run 拒绝', !!e2&&/run/.test(e2.message));

  ok('插件-注册导入器', PP.registerImporter({ext:'.foo',label:'FOO',run(){}}));
  ok('插件-按扩展名查找(大小写不敏感)', !!PP.findImporter('FOO'));
  eq('插件-导入器扩展名规范化', PP.listImporters()[0].ext, 'foo');
  let e3=null; try{ PP.registerImporter({ext:'foo',run(){}}); }catch(e){ e3=e; }
  ok('插件-重复扩展名拒绝', !!e3&&/已存在/.test(e3.message));

  ok('插件-注销导出器', PP.unregisterExporter('demo'));
  eq('插件-导出器注销后为空', PP.listExporters().length, 0);
  ok('插件-注销导入器', PP.unregisterImporter('FOO'));
  eq('插件-导入器注销后为空', PP.listImporters().length, 0);

  /* 自定义设备类型注册（P2-3 插件化补齐） */
  const typeBase=api.BUILTIN_TYPES.length;
  eq('插件-初始无插件类型', PP.listPluginTypes().length, 0);
  ok('插件-注册自定义设备类型', PP.registerObjectType({
    id:'plugin.ptz', kind:'point', name:'全景相机', color:'#0ea5e9', icon:'custom',
    scaleShape:'sector', fov:360, iconSize:1.5,
    symbol:[{d:'M0 0h24v24H0z', fill:false}], symbolViewBox:{x:0,y:0,w:24,h:24},
    defaultStyle:{fillAlpha:.2,strokeWidth:.08}
  }));
  const pt=PP.listPluginTypes()[0];
  eq('插件-类型写入内置表', api.BUILTIN_TYPES.filter(t=>t.id==='plugin.ptz').length, 1);
  eq('插件-类型写入当前工程', api.state.objectTypes.filter(t=>t.id==='plugin.ptz').length, 1);
  ok('插件-类型标记为非内置', pt&&pt.builtin===false&&pt.plugin===true);
  eq('插件-扇形视场规范化', pt.fov, 360);
  eq('插件-图元路径保留', pt.symbol.length, 1);
  eq('插件-图元 viewBox 保留', pt.symbolViewBox.w, 24);
  approx('插件-默认样式填充', pt.defaultStyle.fillAlpha, .2, 1e-9);
  ok('插件-新工程自带插件类型', api.createInitialState().objectTypes.some(t=>t.id==='plugin.ptz'));
  const withPlugin=api.migrateProject({schema:'offline-drawing-annotation/v1'});
  ok('插件-载入工程自带插件类型', withPlugin.objectTypes.some(t=>t.id==='plugin.ptz'));
  api.resetState();

  const throws=f=>{ try{ f(); return false; }catch(e){ return true; } };
  ok('插件-拒绝缺少 kind', throws(()=>PP.registerObjectType({id:'plugin.bad1',name:'X'})));
  ok('插件-拒绝非法类型 id', throws(()=>PP.registerObjectType({id:'bad id!',kind:'point',name:'X'})));
  ok('插件-拒绝非法 scaleShape', throws(()=>PP.registerObjectType({id:'plugin.bad2',kind:'point',name:'X',scaleShape:'cone'})));
  ok('插件-拒绝非法 fov', throws(()=>PP.registerObjectType({id:'plugin.bad3',kind:'point',name:'X',scaleShape:'sector',fov:5})));
  ok('插件-拒绝超量图元路径', throws(()=>PP.registerObjectType({id:'plugin.bad4',kind:'point',name:'X',symbol:Array.from({length:201},()=>({d:'M0 0'}))})));
  ok('插件-拒绝重复类型 id', throws(()=>PP.registerObjectType({id:'plugin.ptz',kind:'point',name:'重复'})));

  ok('插件-注册自定义区域类型', PP.registerObjectType({id:'plugin.zone',kind:'rect',name:'警戒区域',color:'#f97316'}));
  const zt=PP.listPluginTypes().find(t=>t.id==='plugin.zone');
  ok('插件-区域类型带默认样式', !!zt&&zt.defaultStyle.fillAlpha===.15&&zt.defaultStyle.strokeWidth===.1);
  ok('插件-区域类型进入当前工程', api.state.objectTypes.some(t=>t.id==='plugin.zone'));

  api.resetState();
  ok('插件-可读取实时工程状态', PP.state===api.state);
  let exportCtx=null;
  PP.registerExporter({id:'ctx',label:'上下文',ext:'txt',run(ctx){ exportCtx=ctx; }});
  api.exportViaPlugin('ctx');
  ok('插件-导出上下文有状态快照', !!exportCtx&&Array.isArray(exportCtx.state.objects));
  ok('插件-导出上下文有实时状态', !!exportCtx&&exportCtx.liveState===api.state);
  eq('插件-导出上下文工程名', exportCtx&&exportCtx.projectName, api.state.meta.name);
  PP.unregisterExporter('ctx');
  let importCtx=null;
  PP.registerImporter({ext:'ctx',label:'CTX',run(ctx){ importCtx=ctx; }});
  api.importViaPlugin(PP.findImporter('CTX'),{name:'x.ctx'});
  ok('插件-导入上下文含实时状态', !!importCtx&&importCtx.state===api.state);
  ok('插件-导入上下文含提交函数', !!importCtx&&typeof importCtx.commitChange==='function');
  PP.unregisterImporter('ctx');

  api.resetState();
  api.state.objects=[api.baseObject('point','plugin.ptz',{name:'P',x:1,y:1})];
  ok('插件-使用中的类型拒绝注销', !PP.unregisterObjectType('plugin.ptz'));
  ok('插件-使用中的类型仍保留', api.state.objectTypes.some(t=>t.id==='plugin.ptz'));
  api.resetState();
  ok('插件-未使用时可注销类型', PP.unregisterObjectType('plugin.ptz'));
  eq('插件-注销后内置表移除', api.BUILTIN_TYPES.filter(t=>t.id==='plugin.ptz').length, 0);
  eq('插件-注销后当前工程移除', api.state.objectTypes.filter(t=>t.id==='plugin.ptz').length, 0);
  ok('插件-内置类型不可注销', !PP.unregisterObjectType('point.marker'));
  ok('插件-注销第二个插件类型', PP.unregisterObjectType('plugin.zone'));
  eq('插件-内置类型表恢复原长度', api.BUILTIN_TYPES.length, typeBase);
  eq('插件-插件类型表清空', PP.listPluginTypes().length, 0);
  api.resetState();
}

});

/* 57.1 插件 API 版本化与能力白名单（C-01） -------------------------------- */
await section("57.1 插件 API 版本化与能力白名单（C-01）", async () => {
{
  const PP=api.PlotPin;
  ok('插件-API 版本常量', PP.apiVersion==='1.1.0');
  ok('插件-能力表冻结且八项', Object.isFrozen(PP.capabilities)&&Object.keys(PP.capabilities).length===8);
  ok('插件-能力表含五类核心能力', ['state:read','state:write','annotate','types','icons'].every(c=>!!PP.capabilities[c]));
  ok('插件-rules 能力已声明（仅受信任路径）', !!PP.capabilities.rules);
  ok('插件-兼容声明 1.0', PP.checkPlugin({apiVersion:'1.0',capabilities:[]}).ok);
  ok('插件-拒绝主版本不兼容并给原因', (()=>{const r=PP.checkPlugin({apiVersion:'2.0',capabilities:[]});return !r.ok&&/主版本/.test(r.reason);})());
  ok('插件-拒绝缺失 apiVersion', (()=>{const r=PP.checkPlugin({capabilities:[]});return !r.ok&&/apiVersion/.test(r.reason);})());
  ok('插件-拒绝未知能力', (()=>{const r=PP.checkPlugin({apiVersion:'1.0',capabilities:['network']});return !r.ok&&/未知能力/.test(r.reason);})());
  ok('插件-拒绝缺失能力声明', (()=>{const r=PP.checkPlugin({apiVersion:'1.0'});return !r.ok&&/capabilities/.test(r.reason);})());
  ok('插件-拒绝非法 id', !PP.checkPlugin({id:'bad id!',apiVersion:'1.0',capabilities:[]}).ok);
  /* D-06 兼容矩阵：返回值带 major/minor，旧调用只读 ok/reason 不受影响 */
  const V=v=>PP.checkPlugin({apiVersion:v,capabilities:[]});
  ok('插件-1.0.0 兼容并回传 major/minor', (()=>{const r=V('1.0.0');return r.ok&&r.major===1&&r.minor===0;})());
  ok('插件-1.1 兼容并回传 major/minor', (()=>{const r=V('1.1');return r.ok&&r.major===1&&r.minor===1;})());
  ok('插件-1.2 拒绝次版本并回传声明版本', (()=>{const r=V('1.2');return !r.ok&&/次版本/.test(r.reason)&&r.major===1&&r.minor===2;})());
  ok('插件-2.0 拒绝主版本并回传声明版本', (()=>{const r=V('2.0');return !r.ok&&/主版本/.test(r.reason)&&r.major===2&&r.minor===0;})());
  ok('插件-畸形版本拒绝且不回传版本', (()=>{const r=V('1.x');return !r.ok&&/格式非法/.test(r.reason)&&r.major===null&&r.minor===null;})());
  ok('插件-缺失版本拒绝且不回传版本', (()=>{const r=V('');return !r.ok&&/apiVersion/.test(r.reason)&&r.major===null&&r.minor===null;})());
  eq('插件-初始沙箱插件列表为空', PP.listPlugins().length, 0);

  /* D-05 清单校验：纯函数、事务化（失败不改注册表） */
  const mo = { schema:'plotpin.plugin/v1', id:'demo.manifest', name:'示例清单', version:'1.0.0',
    apiVersion:'1.0', capabilities:['export','export'], code:'PlotPin.registerExporter({id:"m"});' };
  const vm = PP.validatePluginManifest(JSON.stringify(mo));
  ok('清单-合法字符串通过', vm.ok===true);
  eq('清单-能力规范化去重', vm.spec.capabilities.join(','), 'export');
  eq('清单-规范化 id/name/version', vm.spec.id+'|'+vm.spec.name+'|'+vm.spec.version, 'demo.manifest|示例清单|1.0.0');
  eq('清单-校验不产生插件', PP.listPlugins().length, 0);
  ok('清单-非 JSON 拒绝', (()=>{const r=PP.validatePluginManifest('{');return !r.ok&&/JSON/.test(r.reason);})());
  ok('清单-非对象拒绝', !PP.validatePluginManifest([]).ok);
  ok('清单-schema 错误拒绝', (()=>{const r=PP.validatePluginManifest(Object.assign({},mo,{schema:'v2'}));return !r.ok&&/schema/.test(r.reason);})());
  ok('清单-缺 name 拒绝', (()=>{const r=PP.validatePluginManifest(Object.assign({},mo,{name:' '}));return !r.ok&&/name/.test(r.reason);})());
  ok('清单-version 非 x.y.z 拒绝', (()=>{const r=PP.validatePluginManifest(Object.assign({},mo,{version:'1.0'}));return !r.ok&&/version/.test(r.reason);})());
  ok('清单-未知能力拒绝', (()=>{const r=PP.validatePluginManifest(Object.assign({},mo,{capabilities:['network']}));return !r.ok&&/未知能力/.test(r.reason);})());
  ok('清单-code 空拒绝', (()=>{const r=PP.validatePluginManifest(Object.assign({},mo,{code:'  '}));return !r.ok&&/code/.test(r.reason);})());
  ok('清单-code 超 64 KB 拒绝', (()=>{const r=PP.validatePluginManifest(Object.assign({},mo,{code:'x'.repeat(65537)}));return !r.ok&&/64 KB/.test(r.reason);})());
  ok('清单-超过 192 KB 拒绝', (()=>{const r=PP.validatePluginManifest(Object.assign({},mo,{filler:'x'.repeat(200000)}));return !r.ok&&/192 KB/.test(r.reason);})());
}

});

/* 57.1b RT-P2-07 插件清单/源码上限按 UTF-8 字节而非字符数 ---------------- */
await section("57.1b RT-P2-07 插件清单/源码上限按 UTF-8 字节", async () => {
{
  const PP=api.PlotPin;
  const mo = { schema:'plotpin.plugin/v1', id:'demo.bytes', name:'字节上限', version:'1.0.0',
    apiVersion:'1.0', capabilities:[], code:'1' };
  /* 70000 个中文字符 = 70000 字符 / 210000 字节：字符数未超 192 KB，字节数已超 */
  const rb = PP.validatePluginManifest(Object.assign({}, mo, { filler:'中'.repeat(70000) }));
  ok('RT-P2-07 清单多字节内容按字节拒绝', !rb.ok && /192 KB/.test(rb.reason));
  /* 22000 个中文字符 = 22000 字符 / 66000 字节：字符数未超 64 KB，字节数已超 */
  const rc = PP.validatePluginManifest(Object.assign({}, mo, { code:'中'.repeat(22000) }));
  ok('RT-P2-07 code 多字节内容按字节拒绝', !rc.ok && /64 KB/.test(rc.reason));
  const okc = PP.validatePluginManifest(Object.assign({}, mo, { code:'x'.repeat(65536) }));
  ok('RT-P2-07 code 恰好 64 KB（单字节）通过', okc.ok === true);
}
});

/* 57.1c RT-P2-14 统计越界与规则页共用场地包围盒/容差 -------------------- */
await section("57.1c RT-P2-14 统计越界与规则页共用场地包围盒/容差", async () => {
{
  api.resetState(); api.resetFrameRef();
  const st=api.state;
  /* 100.1 超出场地 0.1 m：旧口径 ±0.2 不报，新口径沿用规则容差 0.05 应报 */
  st.objects=[{ id:'o1', kind:'rect', typeId:'rect.area', name:'R1', x:100.1, y:10, width:5, height:5, angle:0, shape:null, visible:true }];
  ok('RT-P2-14 越界按规则容差 0.05 命中', api.findIssues().some(x=>x.includes('R1')&&x.includes('超出')));
  st.rules=api.normalizeRuleConfig({ bounds:{ tolerance:0.5 } });
  ok('RT-P2-14 规则容差 0.5 时不命中', !api.findIssues().some(x=>x.includes('R1')&&x.includes('超出')));
  st.rules=api.normalizeRuleConfig({});
  /* 图片 200m 宽、场地 100m 宽：旧口径用 worldDims(200) 不报，新口径按场地包围盒应报 */
  st.background={ kind:'image', fileName:'x.png', assetId:'', width:200, height:70, origin:[0,0],
    metersPerPixel:1, calibrated:false, transform:null };
  st.objects=[{ id:'o2', kind:'rect', typeId:'rect.area', name:'R2', x:150, y:10, width:5, height:5, angle:0, shape:null, visible:true }];
  api.resetFrameRef();
  ok('RT-P2-14 图片大于场地时按场地判越界', api.findIssues().some(x=>x.includes('R2')&&x.includes('超出')));
  eq('RT-P2-14 取景框仍覆盖图片（worldDims 不变）', api.worldDims().maxX, 200);
  st.site.visible=false; api.resetFrameRef();
  ok('RT-P2-14 场地隐藏时退回取景框不误报', !api.findIssues().some(x=>x.includes('R2')&&x.includes('超出')));
  eq('RT-P2-14 统计口径版本', api.STATS_ISSUE_VERSION, 2);
  api.resetState(); api.resetFrameRef();
}
});

/* 57.2 C-05 几何规则检查：配置 / 框架 / 三条规则 / CSV / 定位 --------------- */
await section("57.2 C-05 几何规则检查：配置 / 框架 / 三条规则 / CSV / 定位", async () => {
{
  eq('规则-默认版本', api.createRuleConfig().version, 1);
  eq('规则-默认范围', api.createRuleConfig().scope, 'all');
  eq('规则-默认重叠容差', api.createRuleConfig().overlap.tolerance, 0.05);
  eq('规则-默认间距阈值表为空', api.createRuleConfig().spacing.types, {});
  eq('规则-默认越界容差', api.createRuleConfig().bounds.tolerance, 0.05);
  ok('规则-默认三条全部启用', (()=>{const c=api.createRuleConfig();return c.overlap.enabled&&c.spacing.enabled&&c.bounds.enabled;})());
  eq('规则-state 默认配置与工厂一致', api.state.rules, api.createRuleConfig());

  const n = raw => api.normalizeRuleConfig(raw);
  eq('规则-归一空配置回默认', n(null).overlap.tolerance, 0.05);
  eq('规则-负数容差回默认', n({overlap:{tolerance:-1}}).overlap.tolerance, 0.05);
  eq('规则-超上限容差回默认', n({overlap:{tolerance:5000}}).overlap.tolerance, 0.05);
  eq('规则-字符串容差转数值', n({overlap:{tolerance:'2'}}).overlap.tolerance, 2);
  eq('规则-容差保留三位小数', n({overlap:{tolerance:1.2345}}).overlap.tolerance, 1.235);
  eq('规则-范围只接受枚举', n({scope:'weird'}).scope, 'all');
  eq('规则-范围 current 保留', n({scope:'current'}).scope, 'current');
  eq('规则-关闭标记保留', n({spacing:{enabled:false}}).spacing.enabled, false);
  eq('规则-类型阈值过滤非法键', n({spacing:{types:{'bad key!':1,'ok.type':2}}}).spacing.types, {'ok.type':2});
  eq('规则-类型阈值过滤负数', n({spacing:{types:{'a.b':-1,'c.d':0}}}).spacing.types, {'c.d':0});
  eq('规则-类型阈值过滤超上限', n({spacing:{types:{'a.b':5000}}}).spacing.types, {});
  const manyTypes = {};
  for(let i=0;i<250;i++) manyTypes['t.'+i]=1;
  eq('规则-类型阈值上限 200', Object.keys(n({spacing:{types:manyTypes}}).spacing.types).length, 200);
  eq('规则-未知字段剔除', Object.keys(n({bogus:1})).sort().join(','), 'bounds,overlap,scope,spacing,version');

  /* 配置随工程保存：persistableState 深拷贝 / buildProject 显式归一 / 合并保留 */
  api.resetState();
  api.state.rules.spacing.types['point.marker'] = 1.5;
  const persisted = api.persistableState();
  eq('规则-自动保存带出配置', persisted.rules.spacing.types['point.marker'], 1.5);
  persisted.rules.spacing.types['point.marker'] = 9;
  eq('规则-自动保存为深拷贝', api.state.rules.spacing.types['point.marker'], 1.5);
  const proj = api.buildProject({ rules:{ scope:'current', overlap:{tolerance:0.2}, spacing:{types:{'point.marker':1.5}} } });
  eq('规则-载入工程保留范围', proj.rules.scope, 'current');
  eq('规则-载入工程保留容差', proj.rules.overlap.tolerance, 0.2);
  eq('规则-载入工程保留阈值', proj.rules.spacing.types['point.marker'], 1.5);
  eq('规则-载入工程剔除脏阈值', api.buildProject({ rules:{ spacing:{types:{'bad key!':1}} } }).rules.spacing.types, {});
  const baseProj = rules => ({ schema:api.SCHEMA, meta:{}, settings:{}, viewport:{}, background:{kind:'empty'}, site:null,
    layers:[], objectTypes:[], objects:[], floors:[{id:'floor.default',name:'1F'}], activeFloorId:'floor.default', tombstones:[], rules });
  const localRules = { version:1, scope:'all', overlap:{enabled:true,tolerance:0.1}, spacing:{enabled:true,types:{'point.marker':1}}, bounds:{enabled:true,tolerance:0.1} };
  const remoteRules = { version:1, scope:'current', overlap:{enabled:true,tolerance:0.5}, spacing:{enabled:true,types:{'point.marker':4}}, bounds:{enabled:false,tolerance:0.5} };
  eq('规则-合并保留本地配置', api.mergeProjectData(baseProj(localRules), baseProj(remoteRules)).project.rules.overlap.tolerance, 0.1);
  eq('规则-合并缺失侧取另一侧', api.mergeProjectData(baseProj(null), baseProj(remoteRules)).project.rules.spacing.types['point.marker'], 4);
  eq('规则-合并缺失侧逻辑直接判定', api.mergeRuleSide({}, remoteRules).spacing.types['point.marker'], 4);
}

});

/* 57.3 规则注册框架 -------------------------------------------------------- */
await section("57.3 规则注册框架", async () => {
{
  api.resetState();
  const st = api.state;
  const builtin = api.listRules().filter(r=>r.builtin).map(r=>r.id).sort().join(',');
  eq('规则框架-内建三条已注册', builtin, 'bounds,overlap,spacing');
  ok('规则框架-内建三条均有名称与说明', ['overlap','spacing','bounds'].every(id=>{
    const r = api.listRules().find(x=>x.id===id);
    return r && r.name && r.description;
  }));
  eq('规则框架-重复 id 被拒绝', api.registerRule({id:'overlap',check(){return [];}}).ok, false);
  eq('规则框架-非法 id 被拒绝', api.registerRule({id:'bad id!',check(){return [];}}).ok, false);
  eq('规则框架-缺少 check 被拒绝', api.registerRule({id:'test.nocheck'}).ok, false);
  ok('规则框架-内建规则不可注销', !api.unregisterRule('overlap').ok);
  ok('规则框架-注销不存在规则失败', !api.unregisterRule('nope').ok);

  const reg = api.registerRule({id:'test.flag',name:'测试标记',check:ctx=>({violations:ctx.objects.map(o=>({
    objectId:o.id, objectName:o.name, x:o.x, y:o.y, message:'自定义规则命中'
  }))})});
  ok('规则框架-注册自定义规则成功', reg.ok && reg.id==='test.flag');
  const obj = api.baseObject('point','point.marker',{x:5,y:5,name:'P1'});
  st.objects = [obj];
  const run1 = api.runRuleCheck({scope:'current'});
  eq('规则框架-自定义规则参与运行', run1.violations.filter(v=>v.ruleId==='test.flag').length, 1);
  const hit = run1.violations.find(v=>v.ruleId==='test.flag');
  ok('规则框架-违规含规则名/对象/楼层/位置/说明', !!hit && hit.ruleName==='测试标记' && hit.objectId===obj.id &&
    hit.floorId===st.activeFloorId && hit.floorName==='1F' && hit.x===5 && hit.y===5 && hit.message==='自定义规则命中');
  api.registerRule({id:'test.throw',name:'异常规则',check(){ throw new Error('boom'); }});
  const run2 = api.runRuleCheck({scope:'current'});
  ok('规则框架-规则异常被隔离并记录', run2.skipped.some(s=>s.ruleId==='test.throw'&&/规则异常/.test(s.reason)));
  eq('规则框架-异常不影响其他规则', run2.violations.filter(v=>v.ruleId==='test.flag').length, 1);
  ok('规则框架-注销自定义规则成功', api.unregisterRule('test.flag').ok && api.unregisterRule('test.throw').ok);
  eq('规则框架-注销后恢复三条内建', api.listRules().length, 3);
  eq('规则框架-内建规则 owner 为空', api.listRules().find(r=>r.id==='overlap').owner, '');
  ok('规则框架-注册 owner 来源可见', (()=>{
    const r=api.registerRule({id:'test.owned',name:'插件规则',check(){return [];}}, 'demo.plugin');
    return r.ok&&api.listRules().find(x=>x.id==='test.owned').owner==='demo.plugin';
  })());
  ok('规则框架-插件规则可注销', api.unregisterRule('test.owned').ok&&!api.listRules().some(r=>r.id==='test.owned'));
}

});

/* 57.4 对象重叠：相交 / 贴合 / 容差 / 凹多边形 / 跨楼层 --------------------- */
await section("57.4 对象重叠：相交 / 贴合 / 容差 / 凹多边形 / 跨楼层", async () => {
{
  const rect = (x,y,w=10,h=10,name='R') => api.baseObject('rect','rect.area',{x,y,width:w,height:h,name});
  const run = objs => { api.resetState(); api.state.objects = objs; return api.runRuleCheck({scope:'current'}); };
  const cnt = (r,id) => r.violations.filter(v=>v.ruleId===id).length;

  let r1 = run([rect(0,0),rect(5,5)]);
  eq('重叠-实质相交报 1 条', cnt(r1,'overlap'), 1);
  approx('重叠-交面积数值', r1.violations.find(v=>v.ruleId==='overlap').value, 25);
  eq('重叠-相邻贴合不报', cnt(run([rect(0,0),rect(10,0)]),'overlap'), 0);
  eq('重叠-0.02m 贴合容差内不报', cnt(run([rect(0,0),rect(10.02,0)]),'overlap'), 0);
  eq('重叠-0.10m 有间隙不报', cnt(run([rect(0,0),rect(10.10,0)]),'overlap'), 0);
  eq('重叠-0.04m 微交在容差内不报', cnt(run([rect(0,0),rect(9.96,0)]),'overlap'), 0);

  api.resetState();
  api.state.rules.overlap.tolerance = 0.5;
  api.state.objects = [rect(0,0),rect(9.6,0)];
  eq('重叠-调大容差后浅穿透不报', cnt(api.runRuleCheck({scope:'current'}),'overlap'), 0);
  api.state.objects = [rect(0,0),rect(9.4,0)];
  eq('重叠-超出容差的实质重叠仍报', cnt(api.runRuleCheck({scope:'current'}),'overlap'), 1);

  const L = api.baseObject('line','line.custom',{closed:true,name:'L',points:[[0,0],[10,0],[10,4],[4,4],[4,10],[0,10]]});
  const rc = run([L,rect(2,2,6,6)]);
  eq('重叠-凹多边形与矩形相交报 1 条', cnt(rc,'overlap'), 1);
  approx('重叠-凹多边形交面积 20m²', rc.violations.find(v=>v.ruleId==='overlap').value, 20);
  approx('重叠-凹多边形交面积直接计算', api.rulePolygonIntersectionArea(L.points,[[2,2],[8,2],[8,8],[2,8]]), 20, 1e-6);
  /* RT-P2-13：多轮廓对象取全部轮廓对的最大交面积，不再只看 polygons[0] */
  const multiA=[[[0,0],[10,0],[10,10],[0,10]],[[20,20],[30,20],[30,30],[20,30]]];
  const multiB=[[[20,20],[30,20],[30,30],[20,30]]];
  approx('重叠-多轮廓取最大交面积 100m²', api.ruleMaxPolygonIntersection(multiA,multiB).area, 100, 1e-6);
  eq('重叠-首轮廓无交时旧算法为 0', api.rulePolygonIntersectionArea(multiA[0],multiB[0]), 0);
  eq('重叠-纯图标点无面积跳过', cnt(run([
    api.baseObject('point','point.marker',{x:5,y:5}),api.baseObject('point','point.marker',{x:5,y:5})
  ]),'overlap'), 0);

  api.resetState();
  const st = api.state;
  st.objects = [rect(0,0)];
  st.floors.push({id:'floor.F2',name:'2F',objects:[rect(0,0)],site:null});
  const allFloors = api.runRuleCheck({scope:'all'});
  eq('重叠-跨楼层同位置不互报', cnt(allFloors,'overlap'), 0);
  eq('重叠-全部楼层对象计数', allFloors.stats.objects, 2);
  eq('重叠-全部楼层楼层计数', allFloors.stats.floors, 2);
  eq('重叠-当前楼层范围仅统计本层', api.runRuleCheck({scope:'current'}).stats.objects, 1);
}

});

/* 57.5 最小间距：不足 / 刚好达标 / 改配置重查 / 双类型取 max / 点-区域 ------- */
await section("57.5 最小间距：不足 / 刚好达标 / 改配置重查 / 双类型取 max / 点-区域", async () => {
{
  const pt = (x,y,name='P') => api.baseObject('point','point.marker',{x,y,name});
  const run = objs => { api.resetState(); api.state.objects = objs; return api.runRuleCheck({scope:'current'}); };
  const cnt = r => r.violations.filter(v=>v.ruleId==='spacing').length;

  api.resetState();
  api.state.rules.spacing.types = {'point.marker':1};
  api.state.objects = [pt(10,10,'P1'),pt(10.5,10,'P2'),pt(12,10,'P3')];
  const r1 = api.runRuleCheck({scope:'current'});
  eq('间距-不足 1m 报 1 对', cnt(r1), 1);
  eq('间距-净距数值', r1.violations.find(v=>v.ruleId==='spacing').value, 0.5);
  eq('间距-阈值随违规带出', r1.violations.find(v=>v.ruleId==='spacing').threshold, 1);

  const run2 = objs => { api.resetState(); api.state.rules.spacing.types = {'point.marker':1}; api.state.objects = objs; return api.runRuleCheck({scope:'current'}); };
  eq('间距-刚好达标 1m 不报', cnt(run2([pt(10,10),pt(11,10)])), 0);
  eq('间距-略超阈值不报', cnt(run2([pt(10,10),pt(11.0001,10)])), 0);

  api.resetState();
  api.state.rules.spacing.types = {'point.marker':3};
  api.state.objects = [pt(10,10,'P1'),pt(10.5,10,'P2'),pt(12,10,'P3')];
  eq('间距-改阈值 1→3 后违规数变化', cnt(api.runRuleCheck({scope:'current'})), 3);

  api.resetState();
  const st = api.state;
  st.objectTypes.push({id:'type.a',kind:'point',name:'A 类',color:'#111111',icon:'custom',builtin:false,scaleShape:'none'});
  st.rules.spacing.types = {'type.a':1,'point.marker':3};
  st.objects = [api.baseObject('point','type.a',{x:10,y:10,name:'A'}),pt(12.5,10,'B')];
  const rm = api.runRuleCheck({scope:'current'});
  eq('间距-两类对象取最大阈值报 1 对', cnt(rm), 1);
  eq('间距-阈值取 max=3', rm.violations.find(v=>v.ruleId==='spacing').threshold, 3);

  api.resetState();
  api.state.rules.spacing.types = {'point.marker':4,'rect.area':4};
  api.state.objects = [
    api.baseObject('rect','rect.area',{x:20,y:5,width:4,height:4,shape:{type:'circle',r:2},name:'C'}),
    pt(25,5,'P')
  ];
  const rp = api.runRuleCheck({scope:'current'});
  eq('间距-点到圆区域报 1 对', cnt(rp), 1);
  approx('间距-点到圆净距 3m', rp.violations.find(v=>v.ruleId==='spacing').value, 3, 1e-6);

  api.resetState();
  api.state.rules.spacing.types = {'point.marker':4};
  api.state.objects = [
    api.baseObject('rect','rect.area',{x:20,y:5,width:4,height:4,shape:{type:'circle',r:2},name:'C'}),
    pt(25,5,'P')
  ];
  eq('间距-未配置类型不参与比较', cnt(api.runRuleCheck({scope:'current'})), 0);

  api.resetState();
  api.state.rules.spacing.types = {'line.custom':1};
  api.state.objects = [
    api.baseObject('line','line.custom',{points:[[10,10],[20,10]],name:'L1'}),
    api.baseObject('line','line.custom',{points:[[10,10.5],[20,10.5]],name:'L2'})
  ];
  const rl = api.runRuleCheck({scope:'current'});
  eq('间距-平行线间距不足报 1 对', cnt(rl), 1);
  eq('间距-平行线净距 0.5m', rl.violations.find(v=>v.ruleId==='spacing').value, 0.5);
}

});

/* 57.6 越界：场内 / 贴边 / 部分 / 完全 / 文字 / 尺寸 / 隐藏 / 无场地 --------- */
await section("57.6 越界：场内 / 贴边 / 部分 / 完全 / 文字 / 尺寸 / 隐藏 / 无场地", async () => {
{
  const rect = (x,y,w=10,h=10,name='R') => api.baseObject('rect','rect.area',{x,y,width:w,height:h,name});
  const run = objs => { api.resetState(); api.state.objects = objs; return api.runRuleCheck({scope:'current'}); };
  const cnt = r => r.violations.filter(v=>v.ruleId==='bounds').length;
  const one = r => r.violations.find(v=>v.ruleId==='bounds');

  eq('越界-场地内不报', cnt(run([rect(10,10)])), 0);
  eq('越界-贴边不报', cnt(run([rect(90,10)])), 0);
  const part = run([rect(95,10)]);
  eq('越界-部分越出报 1 条', cnt(part), 1);
  eq('越界-部分越界标记', one(part).kind, 'partial');
  const full = run([rect(150,10)]);
  eq('越界-完全越出报 1 条', cnt(full), 1);
  eq('越界-完全越界标记', one(full).kind, 'full');
  const cross = run([api.baseObject('line','line.custom',{points:[[-10,30],[110,30]],name:'X'})]);
  eq('越界-线段横跨边界记为部分', cnt(cross), 1);
  eq('越界-横跨边界标记', one(cross).kind, 'partial');
  const txt = run([api.baseObject('text','text.builtin',{x:99,y:35,text:'文字ABC',name:'T'})]);
  eq('越界-文字越界参与检查', cnt(txt), 1);
  eq('越界-场内尺寸标注不报', cnt(run([api.baseObject('dimension','dimension.distance',{subtype:'ruler',points:[[5,5],[10,5]],x:5,y:5,name:'D'})])), 0);
  eq('越界-隐藏对象不检查', cnt(run([api.baseObject('point','point.marker',{x:200,y:30,visible:false,name:'H'})])), 0);

  api.resetState();
  api.state.site = null;
  api.state.objects = [rect(150,10)];
  const noSite = api.runRuleCheck({scope:'current'});
  eq('越界-无场地不产生违规', cnt(noSite), 0);
  ok('越界-无场地记录跳过原因', noSite.skipped.some(s=>s.ruleId==='bounds'&&/未设置/.test(s.reason)));
}

});

/* 57.7 违规清单 CSV 导出与点击定位 ------------------------------------------ */
await section("57.7 违规清单 CSV 导出与点击定位", async () => {
{
  api.resetState();
  api.state.objects = [
    api.baseObject('rect','rect.area',{x:0,y:0,width:10,height:10,name:'A'}),
    api.baseObject('rect','rect.area',{x:5,y:5,width:10,height:10,name:'B'})
  ];
  const r = api.runRuleCheck({scope:'current'});
  const csv = api.ruleViolationsCsv(r);
  ok('CSV-含 BOM 与表头', csv.startsWith('\uFEFF规则,对象编号,对象名称,关联对象,楼层,X,Y,说明,值'));
  eq('CSV-行数=表头+违规数', csv.trimEnd().split('\r\n').length, 1+r.violations.length);
  ok('CSV-行尾 CRLF', csv.endsWith('\r\n'));
  const fake = { violations:[{ruleId:'x',ruleName:'规则,名',objectId:'O1',objectName:'=SUM(1)',peerId:'',peerName:'',
    floorName:'1F',x:1,y:2,message:'a,b',value:3}] };
  const fc = api.ruleViolationsCsv(fake);
  ok('CSV-逗号字段加引号', fc.includes('"规则,名"'));
  ok('CSV-公式注入加前导单引号', fc.includes("'=SUM(1)"));
  ok('CSV-文件名带日期与 .csv', /^rule-violations-\d{8}-\d{4}\.csv$/.test(api.ruleExportName()));

  const v = r.violations.find(x=>x.ruleId==='overlap');
  const located = await api.locateRuleViolation(v);
  ok('定位-返回成功', located);
  ok('定位-选中主对象与关联对象', api.selectedIds.has(v.objectId) && (!v.peerId || api.selectedIds.has(v.peerId)));
  ok('定位-异常对象安全返回', (await api.locateRuleViolation({objectId:'missing',floorId:api.state.activeFloorId})) === false);
}

});

/* 57.8 规则采样误差 golden（A5）：固定几何 + 容差断言 ---------------------- */
await section("57.8 规则采样误差 golden（A5）：固定几何 + 容差断言", async () => {
{
  api.resetState();
  api.state.objectTypes.push(
    {id:'test.rule.circle',kind:'point',name:'测试圆',color:'#111827',icon:'custom',scaleShape:'circle',builtin:false},
    {id:'test.rule.square',kind:'point',name:'测试方',color:'#111827',icon:'custom',scaleShape:'square',builtin:false},
    {id:'test.rule.sector',kind:'point',name:'测试扇形',color:'#111827',icon:'custom',scaleShape:'sector',fov:90,builtin:false}
  );
  const fp=(id,x,y,phys,angle)=>api.ruleObjectFootprint({kind:'point',typeId:id,x,y,phys,angle:angle||0});
  const relErr=(a,b)=>Math.abs(a-b)/b;

  /* 圆 r=5：采样段 seg=max(16,min(48,ceil(r*8)))=40，内接多边形理论误差约 0.41% */
  const circle=fp('test.rule.circle',0,0,10,0);
  eq('A5-圆采样段数=40', circle.polygons[0].length, 40);
  ok('A5-圆面积误差 <2%', relErr(circle.area,Math.PI*25)<0.02);
  ok('A5-圆内接多边形面积略小于真圆', circle.area<Math.PI*25);

  /* 方形 10×10 旋转 30°：面积应严格保持 100 */
  const square=fp('test.rule.square',0,0,10,30);
  approx('A5-旋转方形面积=100', square.area, 100, 1e-6);

  /* 扇形 fov 90 / r=10：面积 ≈ πr²/4（72 段采样误差 <1%） */
  const sector=fp('test.rule.sector',0,0,10,0);
  ok('A5-扇形面积误差 <1%', relErr(sector.area,Math.PI*100/4)<0.01);
  ok('A5-扇形面积略小于真值', sector.area<Math.PI*100/4);

  /* 净距：两圆 r=2、中心距 10 → 6；圆与方（4×4，中心距 8）→ 4 */
  const c1=fp('test.rule.circle',0,0,4,0), c2=fp('test.rule.circle',10,0,4,0);
  approx('A5-两圆净距=6', api.ruleGapGeometry(c1,c2), 6, 0.01);
  api.state.objectTypes.push({id:'test.rule.rect',kind:'point',name:'测试方形域',color:'#111827',icon:'custom',scaleShape:'square',builtin:false});
  const sq=fp('test.rule.rect',8,0,4,0);
  approx('A5-圆与方净距=4', api.ruleGapGeometry(c1,sq), 4, 0.01);
  approx('A5-净距对称', api.ruleGapGeometry(sq,c1), api.ruleGapGeometry(c1,sq), 1e-9);

  /* 重叠面积：两个 100×100 方、偏移 50 → 5000 */
  const r1=api.baseObject('rect','rect.area',{x:0,y:0,width:100,height:100,angle:0});
  const r2=api.baseObject('rect','rect.area',{x:50,y:0,width:100,height:100,angle:0});
  const f1=api.ruleObjectFootprint(r1), f2=api.ruleObjectFootprint(r2);
  approx('A5-两方重叠面积=5000', api.rulePolygonIntersectionArea(f1.polygons[0],f2.polygons[0]), 5000, 1e-6);

  /* 凹多边形三角化：L 形 7500 ∩ 方形 2500 = 2500（走 ruleTriangulate 而非包围盒回退） */
  const L=[[0,0],[100,0],[100,50],[50,50],[50,100],[0,100]];
  const half=[[0,0],[50,0],[50,50],[0,50]];
  approx('A5-凹多边形交面积=2500', api.rulePolygonIntersectionArea(L,half), 2500, 1e-6);
  approx('A5-凹多边形与自身交面积=7500', api.rulePolygonIntersectionArea(L,L), 7500, 1e-6);
}

});

/* 57.9 DXF 折线与 SVG 几何一致性（A6） ------------------------------------- */
await section("57.9 DXF 折线与 SVG 几何一致性（A6）", async () => {
{
  /* 1) 合成非对称符号：viewBox 24、size 24、对象在 (100,100)、angle 0。
   * 按「中心缩放 + 局部 Y 翻转」规格独立推导：x∈[88,100]，y∈[100,112]。 */
  api.resetState();
  api.state.site=null;
  api.state.objectTypes.push({id:'test.sym.box',kind:'point',name:'测试符号',color:'#111827',icon:'symbol',scaleShape:'none',builtin:false,symbol:[{d:'M0 0h12v12H0z',fill:false}],symbolViewBox:{x:0,y:0,w:24,h:24}});
  api.state.objects=[api.baseObject('point','test.sym.box',{x:100,y:100,phys:24,angle:0,name:'BOX'})];
  const boxExp=api.dxfEntitiesForExport();
  eq('A6-合成符号折线数=1', boxExp.entities.filter(e=>e.type==='LWPOLYLINE').length, 1);
  eq('A6-合成符号保留 POINT 锚点', boxExp.entities.filter(e=>e.type==='POINT').length, 1);
  const box=boxExp.entities.find(e=>e.type==='LWPOLYLINE');
  eq('A6-合成符号顶点数=4', box.points.length, 4);
  eq('A6-合成符号闭合标记', box.closed, true);
  const bxs=box.points.map(p=>p[0]), bys=box.points.map(p=>p[1]);
  approx('A6-合成符号 bbox.minX', Math.min(...bxs), 88, 1e-6);
  approx('A6-合成符号 bbox.maxX', Math.max(...bxs), 100, 1e-6);
  approx('A6-合成符号 bbox.minY', Math.min(...bys), 100, 1e-6);
  approx('A6-合成符号 bbox.maxY', Math.max(...bys), 112, 1e-6);

  /* 2) symbol-scene 三个真实符号：DXF 折线逐点等于 symbolPolylinesInWorld（同一几何源），
   *    且 SVG 中确实使用 symbolPathsFor 的 path 数据。 */
  api.resetState();
  api.state.site=null;
  const scene=[
    api.baseObject('point','sym.camera_gun',{name:'S1',x:12,y:14,angle:0,phys:0}),
    api.baseObject('point','sym.smoke',{name:'S2',x:40,y:30,angle:45,phys:0}),
    api.baseObject('point','sym.dome',{name:'S3',x:60,y:50,angle:30,phys:2.5})
  ];
  api.state.objects=scene;
  const expected=[];
  for(const o of scene){
    const t=api.state.objectTypes.find(x=>x.id===o.typeId);
    const size=(o.phys||0)>0?o.phys:0.6;
    for(const poly of api.symbolPolylinesInWorld(t,o.x,o.y,size,o.angle,t.symbolViewBox)) expected.push(poly);
  }
  const expEnt=api.dxfEntitiesForExport();
  const lines=expEnt.entities.filter(e=>e.type==='LWPOLYLINE');
  eq('A6-三符号折线数一致', lines.length, expected.length);
  eq('A6-降级报告符号数=3', expEnt.report.symbolPoints, 3);
  for(let i=0;i<expected.length;i++){
    eq('A6-折线'+i+'顶点数一致', lines[i].points.length, expected[i].points.length);
    let same=lines[i].points.every((p,j)=>Math.abs(p[0]-expected[i].points[j][0])<=1e-9&&Math.abs(p[1]-expected[i].points[j][1])<=1e-9);
    ok('A6-折线'+i+'逐点一致', same&&lines[i].closed===expected[i].closed);
  }
  const svg=api.buildSceneSvg();
  for(const o of scene){
    const t=api.state.objectTypes.find(x=>x.id===o.typeId);
    for(const p of api.symbolPathsFor(t)) ok('A6-'+t.id+' SVG 使用同一 path 源', svg.includes(p.d));
  }
}

});

/* 58. 中英界面切换与无障碍标记 --------------------------------------------- */
await section("58. 中英界面切换与无障碍标记", async () => {
{
  const I=api.I18N;
  eq('i18n-默认中文', I.lang, 'zh');
  eq('i18n-中文文案', I.t('new'), '新建');
  eq('i18n-切换英文', I.setLang('en'), 'en');
  eq('i18n-英文文案', I.t('new'), 'New');
  eq('i18n-未知键回退键名', I.t('__missing__'), '__missing__');
  eq('i18n-非法语言回退中文', I.setLang('fr'), 'zh');
  ok('i18n-中英键集合一致', Object.keys(I.dict.zh).sort().join(',')===Object.keys(I.dict.en).sort().join(','));
  ok('i18n-关键键英文齐全', ['new','projects','floors','import','export','settings','select','guide','exportLabels'].every(k=>I.dict.en[k]));
  let applyOk=true; try{ I.apply(); }catch(e){ applyOk=false; }
  ok('i18n-apply在最小DOM下不抛错', applyOk);

  eq('i18n-迁移默认中文', api.migrateProject({schema:'offline-drawing-annotation/v1'}).settings.lang, 'zh');
  eq('i18n-迁移保留英文', api.migrateProject({schema:'offline-drawing-annotation/v1',settings:{lang:'en'}}).settings.lang, 'en');
  eq('i18n-迁移非法语言回退中文', api.migrateProject({schema:'offline-drawing-annotation/v1',settings:{lang:'fr'}}).settings.lang, 'zh');

  ok('无障碍-画布 role=application', /<canvas[^>]*role="application"/.test(html));
  ok('无障碍-工具栏 role=toolbar', /role="toolbar"/.test(html));
  ok('无障碍-页签 role=tablist', /role="tablist"/.test(html));
  ok('无障碍-toast aria-live', /aria-live="polite"/.test(html));
  ok('i18n-入口 data-i18n 标记≥20', (html.match(/data-i18n="/g)||[]).length>=20);
  ok('i18n-入口 ARIA 翻译标记≥5', (html.match(/data-i18n-aria-label="/g)||[]).length>=5);
  ok('i18n-入口占位符翻译标记≥2', (html.match(/data-i18n-placeholder="/g)||[]).length>=2);
  ok('i18n-新增 ARIA 文案中文', I.dict.zh.ariaTools === '绘图工具' && I.dict.zh.ariaCanvas.includes('绘图画布'));
  ok('i18n-新增 ARIA 文案英文', I.dict.en.ariaTools === 'Drawing tools' && I.dict.en.ariaExport === 'Choose export format');
  ok('i18n-顶栏功能按钮中英齐全', ['baseSite','scaleBtn','affineBtn','coverageBtn','panelToggle','fitBtn'].every(k => I.dict.zh[k] && I.dict.en[k]));
  ok('i18n-类型面板选项中英齐全', ['iconCamera','scaleNone','scaleSector','typeNamePlaceholder'].every(k => I.dict.zh[k] && I.dict.en[k]));
  ok('i18n-入口顶栏按钮已标记翻译', /id="bgBtn"[^>]*data-i18n="baseSite"/.test(html) && /id="coverageBtn"[^>]*data-i18n="coverageBtn"/.test(html));
  ok('i18n-入口类型形状选项已标记翻译', /value="sector"[^>]*data-i18n="scaleSector"/.test(html));
  ok('i18n-通用按钮中英齐全', ['cancel','ok','close','save'].every(k => I.dict.zh[k] && I.dict.en[k]));
  ok('i18n-设置面板标签中英齐全', ['settingsTitle','projectName','gridSpacing','languageLabel','runtimeSetting'].every(k => I.dict.zh[k] && I.dict.en[k]));
  eq('i18n-英文确定按钮', I.setLang('en') && I.t('ok'), 'OK');
  I.setLang('zh');
  eq('i18n-中文取消按钮', I.t('cancel'), '取消');

  /* 动态业务文案：中文原文键 + 英文短语表 */
  ok('i18n-动态短语表规模', Object.keys(I.phrases).length >= 180);
  ok('i18n-动态短语英文无中文残留', Object.values(I.phrases).every(v => typeof v === 'string' && !/[\u4e00-\u9fff]/.test(v)));
  I.setLang('en');
  eq('i18n-动态词组宽度', I.p('宽度'), 'Width');
  eq('i18n-动态词组关闭', I.p('关闭'), 'Close');
  eq('i18n-动态词组未收录回退原文', I.p('__未收录词组__'), '__未收录词组__');
  eq('i18n-动态模板粘贴', I.p('已粘贴 {n} 个对象', { n: 3 }), 'Pasted 3 objects');
  eq('i18n-动态模板表格导入', I.p('表格导入完成：更新 {updated} 项，替换 {replaced} 个对象，新增 {created} 项',
    { updated: 2, replaced: 0, created: 1 }), 'Table import complete: 2 updated, 0 replaced, 1 created');
  eq('i18n-捕捉类型英文', I.p('端点') + ' / ' + I.p('切点'), 'endpoint / tangent');
  eq('i18n-捕捉提示英文', I.p('捕捉：自动（全部类型）'), 'Snap: Auto (all types)');
  api.resetState();
  const rectForI18n=api.baseObject('rect','rect.area',{x:1,y:2,width:10,height:5});
  api.state.objects=[rectForI18n]; api.selectedIds.add(rectForI18n.id); api.renderProps();
  const propEn=api.$('propPanel').innerHTML;
  ok('i18n-英文属性面板标题', propEn.includes('Object properties'));
  ok('i18n-英文属性面板字段', propEn.includes('Width') && propEn.includes('Height') && propEn.includes('Shape'));
  ok('i18n-英文属性面板无核心中文', !propEn.includes('对象属性') && !propEn.includes('宽度') && !propEn.includes('填充色'));
  const pointForI18n=api.baseObject('point','point.marker',{x:1,y:2});
  api.state.objects=[pointForI18n]; api.selectedIds.clear(); api.selectedIds.add(pointForI18n.id); api.renderProps();
  const pointEn=api.$('propPanel').innerHTML;
  ok('i18n-英文点设备面板', pointEn.includes('Object properties') && pointEn.includes('Heading') && pointEn.includes('Model') && pointEn.includes('Owner') && pointEn.includes('Custom properties'));
  ok('i18n-英文点设备面板无核心中文', !pointEn.includes('对象属性') && !pointEn.includes('朝向角') && !pointEn.includes('责任人'));
  ok('i18n-内置类型名英文显示', api.typeDisplayName(api.state.objectTypes.find(t=>t.id==='point.camera')) === 'Camera' || api.typeDisplayName(api.state.objectTypes.find(t=>t.id==='point.marker')) === 'Generic marker');
  const savedBuiltin=Object.assign({},api.state.objectTypes.find(t=>t.id==='point.camera'),{builtin:false});
  eq('i18n-载入后内置类型仍按英文显示', api.typeDisplayName(savedBuiltin), 'Camera');
  eq('i18n-用户自定义同名类型保持原名', api.typeDisplayName({id:'custom.mine',kind:'point',name:'摄像头',builtin:false}), '摄像头');
  /* 下拉框直接用 typeDisplayName，避免载入工程 builtin:false 时回退中文 */
  api.state.objectTypes=[savedBuiltin,{id:'point.marker',kind:'point',name:'通用标记',builtin:false}];
  api.populateSelects();
  const opts=api.$('pointType').innerHTML;
  ok('i18n-点类型下拉英文', opts.includes('Camera') && opts.includes('Generic marker') && !opts.includes('摄像头'));
  const siteEn=api.sitePropsHTML(api.state.background,'default');
  ok('i18n-英文场地面板', siteEn.includes('Site properties') && siteEn.includes('Area') && siteEn.includes('Perimeter') && siteEn.includes('Width (m)') && siteEn.includes('Height (m)'));
  api.renderStats();
  const statsEn=api.$('statsPanel').innerHTML;
  ok('i18n-英文统计面板', statsEn.includes('Project info') && statsEn.includes('Geometry check') && statsEn.includes('Local storage'));
  I.setLang('zh');
  api.resetState();

  /* 模态框语义：dialog + aria-modal + 标题关联 + Tab 焦点容器 */
  ok('无障碍-模态框 role=dialog', /id="modalBox"[^>]*role="dialog"/.test(html));
  ok('无障碍-模态框 aria-modal', /id="modalBox"[^>]*aria-modal="true"/.test(html));
  ok('无障碍-模态框标题关联', /id="modalBox"[^>]*aria-labelledby="modalTitle"/.test(html));
  ok('无障碍-模态框可编程聚焦', /id="modalBox"[^>]*tabindex="-1"/.test(html));

  /* ARIA tablist：每个页签有关联面板，每个面板有标签来源 */
  const tabBtns=[...html.matchAll(/<button[^>]*class="side-tab[^"]*"[^>]*>/g)].map(m=>m[0]);
  eq('无障碍-页签按钮数', tabBtns.length, 6);
  ok('无障碍-页签均有 aria-controls', tabBtns.every(s=>/aria-controls="tab-/.test(s)));
  ok('无障碍-页签均有 roving tabindex', tabBtns.every(s=>/tabindex="(?:0|-1)"/.test(s)));
  const tabPanels=[...html.matchAll(/<section[^>]*class="tab-pane[^"]*"[^>]*>/g)].map(m=>m[0]);
  eq('无障碍-页签面板数', tabPanels.length, 6);
  ok('无障碍-面板均为 tabpanel', tabPanels.every(s=>/role="tabpanel"/.test(s)));
  ok('无障碍-面板均有 aria-labelledby', tabPanels.every(s=>/aria-labelledby="tabBtn-/.test(s)));

  eq('页签键盘-右移', api.tabTargetIndex(0,4,'ArrowRight'), 1);
  eq('页签键盘-右移循环', api.tabTargetIndex(3,4,'ArrowRight'), 0);
  eq('页签键盘-左移循环', api.tabTargetIndex(0,4,'ArrowLeft'), 3);
  eq('页签键盘-Home', api.tabTargetIndex(2,4,'Home'), 0);
  eq('页签键盘-End', api.tabTargetIndex(1,4,'End'), 3);
  eq('页签键盘-非导航键', api.tabTargetIndex(1,4,'Enter'), -1);
  eq('页签键盘-无页签', api.tabTargetIndex(-1,0,'ArrowRight'), -1);

  /* 画布快捷键只在画布/文档体聚焦时生效，避免劫持按钮与表单 */
  eq('键盘策略-空标签视为画布', api.isCanvasShortcutTarget(''), true);
  eq('键盘策略-canvas', api.isCanvasShortcutTarget('canvas'), true);
  eq('键盘策略-body', api.isCanvasShortcutTarget('body'), true);
  eq('键盘策略-input 不劫持', api.isCanvasShortcutTarget('input'), false);
  eq('键盘策略-button 不劫持', api.isCanvasShortcutTarget('button'), false);
  eq('键盘策略-select 不劫持', api.isCanvasShortcutTarget('select'), false);

  /* 弹窗键盘策略：Escape 返回已处理且不抛错（DOM 桩环境） */
  let modalEsc=false;
  try{ modalEsc=api.modalKeydown({key:'Escape',preventDefault(){}}); }catch(e){ modalEsc=false; }
  ok('弹窗键盘-Escape 可关闭', modalEsc === true);
  I.setLang('zh');
}

});

/* 59. 离线协作：工程级 LWW 合并与删除墓碑 -------------------------------- */
await section("59. 离线协作：工程级 LWW 合并与删除墓碑", async () => {
{
  const T1 = '2026-10-01T01:00:00.000Z';
  const T2 = '2026-10-01T02:00:00.000Z';
  const T3 = '2026-10-01T03:00:00.000Z';
  const P = (objects, extra = {}) => Object.assign({
    schema: 'offline-drawing-annotation/v1',
    meta: { name: '本地工程', projectId: 'PRJ_LOCAL', createdAt: T1, updatedAt: T1 },
    settings: { unit: 'm', snap: true },
    background: { kind: 'rect', shape: { type: 'rect', w: 10, h: 10 } },
    viewport: { zoom: 1, panX: 0, panY: 0 },
    layers: [{ id: 'layer.default', name: '默认图层', visible: true, locked: false }],
    objectTypes: [{ id: 'custom.type', kind: 'point', name: '本地类型', color: '#123456', icon: 'custom' }],
    objects,
    floors: [{ id: 'floor.default', name: '1F' }],
    activeFloorId: 'floor.default',
    tombstones: []
  }, extra);
  const O = (id, ts, x = 1) => ({
    id, name: String(id), kind: 'point', typeId: 'point.marker', layerId: 'layer.default',
    x, y: 0, updatedAt: ts, createdAt: ts, style: {}, props: {}, visible: true, locked: false, z: 0
  });
  const M = (a, b) => api.mergeProjectData(a, b);
  const ids = p => (p.objects || []).map(o => o.id).join(',');
  const zero = { added: 0, updated: 0, deleted: 0, conflicts: 0, floorsAdded: 0, floorMetaUpdated: 0, floorsDeleted: 0, siteDeleted: 0, siteCleared: 0 };

  const m1 = M(P([]), P([O('A', T1)]));
  eq('合并-新增对象数量', m1.project.objects.length, 1);
  eq('合并-新增统计', m1.stats.added, 1);
  eq('合并-新增顺序', ids(m1.project), 'A');
  eq('合并-新增不记更新', m1.stats.updated, 0);

  const m2 = M(P([O('A', T1)]), P([]));
  eq('合并-仅本地对象保留', ids(m2.project), 'A');
  eq('合并-仅本地无新增统计', m2.stats.added, 0);

  const m3 = M(P([O('A', T1, 1)]), P([O('A', T2, 2)]));
  eq('合并-较新编辑胜出', m3.project.objects[0].x, 2);
  eq('合并-更新统计', m3.stats.updated, 1);
  eq('合并-冲突统计', m3.stats.conflicts, 1);
  eq('合并-删除统计为零', m3.stats.deleted, 0);

  const m4 = M(P([O('A', T2, 2)]), P([O('A', T1, 1)]));
  eq('合并-旧版本不覆盖新版本', m4.project.objects[0].x, 2);
  eq('合并-本地胜出不计更新', m4.stats.updated, 0);
  eq('合并-仍计一次冲突', m4.stats.conflicts, 1);

  const m5 = M(P([O('A', T1, 1)]), P([O('A', T1, 1)]));
  eq('合并-相同内容零统计', m5.stats, zero);
  eq('合并-相同内容保留对象', ids(m5.project), 'A');
  const m5z = M(P([O('A', T1, 1)]), P([Object.assign(O('A', T1, 1), { z: 5 })]));
  eq('合并-仅叠放顺序不同不算冲突', m5z.stats.conflicts, 0);
  eq('合并-仅叠放顺序不同保留本地', m5z.project.objects[0].z, 0);

  const floorMetaA=P([],{floors:[{id:'floor.default',name:'1F',updatedAt:T1}],background:{kind:'rect',shape:{type:'rect',w:10,h:10}}});
  const floorMetaB=P([],{floors:[{id:'floor.default',name:'2F',updatedAt:T2}],background:{kind:'rect',shape:{type:'rect',w:20,h:10}}});
  const floorMetaM=M(floorMetaA,floorMetaB);
  eq('合并-楼层元数据覆盖统计', floorMetaM.stats.floorMetaUpdated, 1);
  eq('合并-楼层名较新胜出', floorMetaM.project.floors[0].name, '2F');
  eq('合并-楼层元数据无覆盖为零', M(floorMetaA,floorMetaA).stats.floorMetaUpdated, 0);

  const m6 = M(P([O('A', T1, 1)]), P([O('A', T1, 2)]));
  const m6r = M(P([O('A', T1, 2)]), P([O('A', T1, 1)]));
  eq('合并-同时间戳字典序兜底', m6.project.objects[0].x, 2);
  eq('合并-同时间戳双向一致', m6r.project.objects[0].x, 2);
  eq('合并-同时间戳记更新', m6.stats.updated, 1);

  /* 双槽合并：site 楼层级 LWW，不能被图片槽合并覆盖/丢失 */
  const siteA={id:'site.merge',name:'A',layerId:'layer.default',visible:true,locked:false,annot:{},style:{},
    updatedAt:T1,kind:'rect',shape:{type:'rect',x:0,y:0,w:20,h:10}};
  const siteB=Object.assign({},siteA,{updatedAt:T2,shape:{type:'rect',x:0,y:0,w:30,h:10}});
  const msN=M(P([], {site:siteA}), P([], {site:siteB}));
  eq('合并-较新场地胜出', msN.project.site.shape.w, 30);
  const msO=M(P([], {site:siteB}), P([], {site:siteA}));
  eq('合并-较旧场地不覆盖', msO.project.site.shape.w, 30);
  eq('合并-场地独立保留', !!msO.project.site, true);
  eq('合并-图片槽与场地共存', msO.project.background.kind, 'rect');

  /* N-04：场地「存在→不存在」独立计数；较新 null 必须获胜且不能被旧值复活 */
  const siteFloorA=P([], {site:siteA, floors:[{id:'floor.default',name:'1F',updatedAt:T1,site:siteA}]});
  const siteFloorNullNewer=P([], {site:null, floors:[{id:'floor.default',name:'1F',updatedAt:T2,site:null}]});
  const mClear=M(siteFloorA, siteFloorNullNewer);
  eq('合并-较新清空场地生效', mClear.project.site, null);
  eq('合并-场地清空计数', mClear.stats.siteCleared, 1);
  eq('合并-场地删除计数', mClear.stats.siteDeleted, 1);
  eq('合并-场地清空计入楼层元数据覆盖', mClear.stats.floorMetaUpdated, 1);
  ok('合并-场地清空触发写栈', api.mergeHistoryNeeded(mClear.stats) === true);

  const mLocalNull=M(siteFloorNullNewer, siteFloorA);
  eq('合并-本地较新清空不被旧场地复活', mLocalNull.project.site, null);
  eq('合并-本地清空不产生远端清空计数', mLocalNull.stats.siteCleared, 0);
  eq('合并-本地清空不产生删除计数', mLocalNull.stats.siteDeleted, 0);

  const mTie=M(P([], {site:siteA, floors:[{id:'floor.default',name:'1F',updatedAt:T1,site:siteA}]}),
    P([], {site:null, floors:[{id:'floor.default',name:'1F',updatedAt:T1,site:null}]}));
  eq('合并-同时间戳保留本地场地', mTie.project.site && mTie.project.site.id, 'site.merge');
  eq('合并-同时间戳不误报清空', mTie.stats.siteCleared, 0);

  const m7 = M(P([O('A', T1)]), P([], { tombstones: [{ id: 'A', deletedAt: T2, kind: 'object' }] }));
  eq('合并-删除墓碑胜过旧对象', m7.project.objects.length, 0);
  eq('合并-删除统计', m7.stats.deleted, 1);
  eq('合并-删除不记冲突', m7.stats.conflicts, 0);

  const m8 = M(P([], { tombstones: [{ id: 'A', deletedAt: T2, kind: 'object' }] }), P([O('A', T1)]));
  eq('合并-入站旧对象被本地墓碑压制', m8.project.objects.length, 0);
  eq('合并-入站压制不计新增', m8.stats.added, 0);

  const m9 = M(P([O('A', T2)]), P([], { tombstones: [{ id: 'A', deletedAt: T1, kind: 'object' }] }));
  eq('合并-较新编辑可复活对象', ids(m9.project), 'A');
  ok('合并-复活后清理过期墓碑', !(m9.project.tombstones || []).some(t => t.id === 'A'));

  const m10 = M(P([O('A', T1)]), P([], { tombstones: [{ id: 'A', deletedAt: T2, kind: 'object' }] }));
  ok('合并-删除墓碑写入结果', (m10.project.tombstones || []).some(t => t.id === 'A' && t.kind === 'object'));

  const srcA = P([O('A', T1)]);
  const srcB = P([O('A', T2, 5), O('B', T2)]);
  const m11 = M(srcA, srcB);
  const m11b = M(m11.project, srcB);
  eq('合并-幂等统计归零', m11b.stats, zero);
  eq('合并-幂等工程一致', JSON.stringify(m11b.project), JSON.stringify(m11.project));
  eq('合并-重复合并顺序不变', ids(m11.project), 'A,B');

  const d1 = M(P([O('A', T1)]), P([O('A', T2, 9), O('B', T2)]));
  const d2 = M(P([O('A', T1)]), P([O('A', T2, 9), O('B', T2)]));
  eq('合并-确定性输出一致', JSON.stringify(d1.project), JSON.stringify(d2.project));
  const dRev = M(P([O('A', T2, 9), O('B', T2)]), P([O('A', T1)]));
  eq('合并-双向对象内容一致', JSON.stringify(dRev.project.objects), JSON.stringify(d1.project.objects));

  const fB = P([], {
    floors: [
      { id: 'floor.default', name: '1F' },
      { id: 'floor.F2', name: '2F', background: { kind: 'circle', shape: { type: 'circle', cx: 0, cy: 0, r: 3 } }, viewport: { zoom: 2, panX: 1, panY: 2 }, objects: [O('F2OBJ', T1)] }
    ]
  });
  const mf = M(P([]), fB);
  eq('合并-新增楼层数量', mf.project.floors.length, 2);
  eq('合并-新增楼层统计', mf.stats.floorsAdded, 1);
  eq('合并-新增楼层对象统计', mf.stats.added, 1);
  eq('合并-新楼层对象随楼层保存', mf.project.floors[1].objects.length, 1);
  eq('合并-新楼层底图保留', mf.project.floors[1].background.kind, 'circle');

  const fMetaA = P([], {
    floors: [
      { id: 'floor.default', name: '1F' },
      { id: 'floor.F2', name: '二层', updatedAt: T1, background: { kind: 'circle', shape: { type: 'circle', cx: 0, cy: 0, r: 1 } }, objects: [] }
    ]
  });
  const fMetaB = P([], {
    floors: [
      { id: 'floor.default', name: '1F' },
      { id: 'floor.F2', name: '二号层', updatedAt: T2, background: { kind: 'polygon', shape: { type: 'polygon', points: [[0, 0], [1, 0], [0, 1]] } }, objects: [] }
    ]
  });
  const mf2 = M(fMetaA, fMetaB);
  eq('合并-楼层名称较新者胜', mf2.project.floors[1].name, '二号层');
  eq('合并-楼层底图随较新者', mf2.project.floors[1].background.kind, 'polygon');
  eq('合并-既有楼层不计新增', mf2.stats.floorsAdded, 0);

  const fObjA = P([], { floors: [{ id: 'floor.default', name: '1F' }, { id: 'floor.F2', name: '2F', objects: [O('X1', T1)] }] });
  const fObjB = P([], { floors: [{ id: 'floor.default', name: '1F' }, { id: 'floor.F2', name: '2F', objects: [O('X2', T2)] }] });
  const mf3 = M(fObjA, fObjB);
  eq('合并-楼层内对象并集', mf3.project.floors[1].objects.map(o => o.id).join(','), 'X1,X2');

  const fDelA = P([], {
    floors: [
      { id: 'floor.default', name: '1F' },
      { id: 'floor.F2', name: '2F', objects: [O('X1', T1), O('X2', T1)] }
    ]
  });
  const fDelB = P([], { tombstones: [{ id: 'floor.F2', deletedAt: T2, kind: 'floor' }] });
  const mf4 = M(fDelA, fDelB);
  eq('合并-楼层墓碑删除整层', mf4.project.floors.length, 1);
  eq('合并-楼层删除统计对象数', mf4.stats.deleted, 2);
  ok('合并-楼层墓碑写入结果', (mf4.project.tombstones || []).some(t => t.id === 'floor.F2' && t.kind === 'floor'));

  const fRevA = P([], { floors: [{ id: 'floor.default', name: '1F' }, { id: 'floor.F2', name: '2F', objects: [O('X1', T3)] }] });
  const fRevB = P([], { tombstones: [{ id: 'floor.F2', deletedAt: T2, kind: 'floor' }] });
  const mf5 = M(fRevA, fRevB);
  eq('合并-较新楼层编辑胜过删除', mf5.project.floors.length, 2);
  ok('合并-楼层复活后清理过期墓碑', !(mf5.project.tombstones || []).some(t => t.id === 'floor.F2'));

  /* N-04：场地独立编辑只写 site.updatedAt；楼层墓碑判定必须纳入它，否则较新场地会被整层删除吞掉 */
  const siteF2Newer = Object.assign({}, siteA, { updatedAt: T3 });
  const fSiteNewerA = P([], { floors: [
    { id: 'floor.default', name: '1F' },
    { id: 'floor.F2', name: '2F', updatedAt: T1, site: siteF2Newer, objects: [] }
  ] });
  const mfSite = M(fSiteNewerA, P([], { tombstones: [{ id: 'floor.F2', deletedAt: T2, kind: 'floor' }] }));
  eq('合并-较新场地编辑不被楼层墓碑吞掉', mfSite.project.floors.length, 2);
  eq('合并-较新场地编辑保留内容', mfSite.project.floors[1].site.updatedAt, T3);
  eq('合并-较新场地不误报整层删除', mfSite.stats.floorsDeleted, 0);

  const fNewB = P([], {
    floors: [
      { id: 'floor.default', name: '1F' },
      { id: 'floor.F3', name: '3F', background: { kind: 'rect', shape: { type: 'rect', w: 5, h: 5 } }, objects: [O('X3', T1)] }
    ],
    tombstones: [{ id: 'floor.F3', deletedAt: T2, kind: 'floor' }]
  });
  const mf6 = M(P([]), fNewB);
  eq('合并-入站楼层先删后不新增', mf6.project.floors.length, 1);
  eq('合并-被墓碑楼层不计新增', mf6.stats.floorsAdded, 0);
  eq('合并-被墓碑楼层对象不计新增', mf6.stats.added, 0);

  const actA = P([O('A', T1)], {
    floors: [{ id: 'floor.default', name: '1F' }, { id: 'floor.F2', name: '2F', objects: [] }],
    activeFloorId: 'floor.F2'
  });
  const actB = P([O('B', T2)], {
    floors: [{ id: 'floor.default', name: '1F' }, { id: 'floor.F2', name: '2F', objects: [] }],
    activeFloorId: 'floor.F2'
  });
  const ma = M(actA, actB);
  eq('合并-本地活动楼层保留', ma.project.activeFloorId, 'floor.F2');
  eq('合并-活动楼层对象进入顶层', ids(ma.project), 'A,B');
  eq('合并-活动楼层顶层底图来自本地', ma.project.background.kind, 'rect');
  eq('合并-非活动楼层仅存元数据', ma.project.floors[1].objects, undefined);

  const actDelB = P([], { tombstones: [{ id: 'floor.F2', deletedAt: T2, kind: 'floor' }] });
  const ma2 = M(actA, actDelB);
  eq('合并-活动楼层被删回退首层', ma2.project.activeFloorId, 'floor.default');
  eq('合并-活动楼层删除统计', ma2.stats.deleted, 1);

  const ord = M(P([O('A1', T1), O('A2', T1)]), P([O('A2', T2, 9), O('B3', T2)]));
  eq('合并-本地对象顺序在前', ids(ord.project), 'A1,A2,B3');
  eq('合并-z按顺序重排', ord.project.objects.map(o => o.z), [0, 1, 2]);
  eq('合并-更新对象位置保留', ord.project.objects[1].x, 9);

  const layA = P([], { layers: [{ id: 'layer.default', name: '默认图层' }, { id: 'layerA', name: 'A层' }] });
  const layB = P([], { layers: [{ id: 'layer.default', name: '默认图层' }, { id: 'layerA', name: 'B层' }, { id: 'layerC', name: 'C层' }] });
  const ml = M(layA, layB);
  eq('合并-图层并集数量', ml.project.layers.length, 3);
  eq('合并-同 id 图层本地优先', ml.project.layers.find(l => l.id === 'layerA').name, 'A层');
  ok('合并-新图层追加', ml.project.layers.some(l => l.id === 'layerC'));

  const typA = P([], { objectTypes: [{ id: 'custom.type', kind: 'point', name: '本地类型' }] });
  const typB = P([], { objectTypes: [{ id: 'custom.type', kind: 'point', name: '他人类型' }, { id: 'other.type', kind: 'line', name: '新增类型' }] });
  const mt = M(typA, typB);
  eq('合并-类型并集数量', mt.project.objectTypes.length, 2);
  eq('合并-同 id 类型本地优先', mt.project.objectTypes.find(t => t.id === 'custom.type').name, '本地类型');
  ok('合并-新类型追加', mt.project.objectTypes.some(t => t.id === 'other.type'));

  const metaA = P([], { meta: { name: '本地工程', projectId: 'PRJ_LOCAL', updatedAt: T2 }, settings: { unit: 'm', gridSize: 2 } });
  const metaB = P([], { meta: { name: '他人工程', projectId: 'PRJ_OTHER', updatedAt: T1 }, settings: { unit: 'm', gridSize: 9 } });
  const mm2 = M(metaA, metaB);
  eq('合并-工程名保留本地', mm2.project.meta.name, '本地工程');
  eq('合并-工程绑定保留本地', mm2.project.meta.projectId, 'PRJ_LOCAL');
  eq('合并-工程更新时间取较新', mm2.project.meta.updatedAt, T2);
  eq('合并-设置保留本地', mm2.project.settings.gridSize, 2);

  const mEmpty = M(P([]), P([], { tombstones: [{ id: 'floor.default', deletedAt: T2, kind: 'floor' }] }));
  eq('合并-至少保留一个楼层', mEmpty.project.floors.length, 1);
  eq('合并-回退楼层为默认层', mEmpty.project.activeFloorId, 'floor.default');

  const mBad = M({ objects: 'x', floors: [null, {}, { id: 'f', objects: [null, { foo: 1 }] }], tombstones: 'bad' }, null);
  eq('合并-非法对象数组忽略', mBad.project.objects.length, 0);
  eq('合并-非法楼层数据仍可合并', mBad.project.floors.length >= 1, true);
  const mNull = M(null, null);
  eq('合并-空输入不抛错且保留一层', mNull.project.floors.length, 1);

  const mNum = M(P([O(123, T1)]), P([]));
  eq('合并-数字 id 归一为字符串', String(mNum.project.objects[0].id), '123');

  const mTombOrder = M(P([], { tombstones: [{ id: 'Z', deletedAt: T1, kind: 'object' }, { id: 'A', deletedAt: T1, kind: 'object' }] }), P([]));
  eq('合并-墓碑按 kind+id 排序', mTombOrder.project.tombstones.map(t => t.id).join(','), 'A,Z');
  const mTombLatest = M(P([], { tombstones: [{ id: 'A', deletedAt: T1, kind: 'object' }, { id: 'A', deletedAt: T3, kind: 'object' }] }), P([], { tombstones: [{ id: 'A', deletedAt: T2, kind: 'object' }] }));
  eq('合并-重复墓碑取最晚', mTombLatest.project.tombstones.length, 1);
  eq('合并-墓碑最晚时间', mTombLatest.project.tombstones[0].deletedAt, T3);
  const mTombBad = M(P([], { tombstones: [{ id: 'A', deletedAt: '' }, { id: 'B', deletedAt: 'not-a-date' }, { id: 'C' }, null] }), P([]));
  eq('合并-非法墓碑忽略', (mTombBad.project.tombstones || []).length, 0);

  /* 状态字段 / 墓碑清洗 / 迁移 / 持久化 */
  eq('墓碑-初始工程为空', api.createInitialState().tombstones, []);
  api.resetState();
  const tRec = api.markTombstone('OBJ_A', 'object');
  eq('墓碑-记录对象删除', api.state.tombstones.length, 1);
  eq('墓碑-记录对象 id', api.state.tombstones[0].id, 'OBJ_A');
  const tRec2 = api.markTombstone('OBJ_A', 'object');
  eq('墓碑-重复删除仍一条', api.state.tombstones.length, 1);
  ok('墓碑-重复删除刷新时间', tRec2 >= tRec);
  api.markTombstone('floor.F2', 'floor');
  eq('墓碑-楼层类型独立计数', api.state.tombstones.filter(t => t.kind === 'floor').length, 1);
  api.markTombstone('');
  eq('墓碑-忽略空 id', api.state.tombstones.length, 2);

  const cleaned = api.sanitizeTombstones([
    { id: 'A', deletedAt: T1, kind: 'object' },
    { id: 'A', deletedAt: T3, kind: 'object' },
    { id: 'F', deletedAt: T2, kind: 'floor' },
    { id: 'X', deletedAt: '' },
    { id: 'Y', deletedAt: 'not-a-date' },
    null, { foo: 1 }
  ]);
  eq('墓碑清洗-去重与过滤', cleaned.length, 2);
  eq('墓碑清洗-取最晚删除时间', cleaned[0].id, 'A');
  eq('墓碑清洗-楼层墓碑保留', cleaned.some(t => t.id === 'F' && t.kind === 'floor'), true);
  const huge = api.sanitizeTombstones(Array.from({ length: api.TOMBSTONE_LIMIT + 100 }, (_, i) => ({ id: 'T' + i, deletedAt: T1 })));
  eq('墓碑清洗-总量上限', huge.length, api.TOMBSTONE_LIMIT);

  const migT = api.migrateProject({ schema: 'offline-drawing-annotation/v1', tombstones: [{ id: 'A', deletedAt: T2, kind: 'object' }] });
  eq('迁移-保留删除墓碑', migT.tombstones.length, 1);
  eq('迁移-缺省墓碑为空', api.migrateProject({ schema: 'offline-drawing-annotation/v1' }).tombstones.length, 0);
  api.resetState();
  api.state.tombstones = [{ id: 'A', deletedAt: T1, kind: 'object' }];
  eq('持久化-携带删除墓碑', api.persistableState().tombstones.length, 1);

  /* 应用层入口：schema 校验、无可合并变化、实际合并与删除传播 */
  api.resetState();
  api.state.meta.projectId = 'PRJ_LOCAL';
  let errNull = null;
  try { await api.mergeProjectJSON(null); } catch (e) { errNull = e; }
  ok('合并入口-空输入拒绝', !!errNull);
  let errSchema = null;
  try { await api.mergeProjectJSON({ schema: 'wrong' }); } catch (e) { errSchema = e; }
  ok('合并入口-schema 校验', !!errSchema && /schema/.test(errSchema.message));
  const histBefore = api.history.past.length;
  const noStats = await api.mergeProjectJSON(api.persistableState());
  eq('合并入口-自身工程无变化', noStats, zero);
  eq('合并入口-无变化不写历史栈', api.history.past.length, histBefore);

  const incoming = P([O('OBJ_MERGE', T2)], {
    meta: { name: '他人工程', projectId: 'PRJ_OTHER', createdAt: T1, updatedAt: T2 }
  });
  const yesStats = await api.mergeProjectJSON(incoming);
  eq('合并入口-新增统计', yesStats.added, 1);
  eq('合并入口-新对象进入现场', api.state.objects.length, 1);
  eq('合并入口-新对象 id', api.state.objects[0].id, 'OBJ_MERGE');
  eq('合并入口-历史栈增加', api.history.past.length, histBefore + 1);
  eq('合并入口-不接管他人工程绑定', api.state.meta.projectId, 'PRJ_LOCAL');
  eq('合并入口-工程名保持本地', api.state.meta.name, '未命名图纸工程');

  const legacyObj = O('OBJ_MERGE', T1, 99);
  delete legacyObj.updatedAt;
  const legacyStats = await api.mergeProjectJSON(P([legacyObj], { meta: { name: '他人工程', updatedAt: T1 } }));
  eq('合并入口-缺失更新时间的旧对象不覆盖本地', api.state.objects[0].x, 1);
  eq('合并入口-旧对象不计更新', legacyStats.updated, 0);
  eq('合并入口-旧对象计冲突', legacyStats.conflicts, 1);

  const delStats = await api.mergeProjectJSON(P([], {
    meta: { name: '他人工程', updatedAt: T1 },
    tombstones: [{ id: 'OBJ_MERGE', deletedAt: T3, kind: 'object' }]
  }));
  eq('合并入口-删除墓碑生效', api.state.objects.length, 0);
  eq('合并入口-删除统计', delStats.deleted, 1);
  ok('合并入口-墓碑写入现场', api.state.tombstones.some(t => t.id === 'OBJ_MERGE' && t.kind === 'object'));

  const floorStats = await api.mergeProjectJSON(P([], {
    meta: { name: '他人工程', updatedAt: T1 },
    floors: [
      { id: 'floor.default', name: '1F' },
      { id: 'floor.F9', name: '9F', background: { kind: 'rect', shape: { type: 'rect', w: 20, h: 20 } }, viewport: { zoom: 1, panX: 0, panY: 0 }, objects: [O('OBJ_F9', T2)] }
    ]
  }));
  eq('合并入口-新增楼层', api.state.floors.length, 2);
  eq('合并入口-楼层统计', floorStats.floorsAdded, 1);
  eq('合并入口-楼层对象已装载', api.state.floors.find(f => f.id === 'floor.F9').objects.length, 1);
  eq('合并入口-当前层不变', api.state.activeFloorId, 'floor.default');
  api.resetState();
}

});

/* 60. 测试盲区补强：SVG 视觉快照 + 弹窗焦点管理（真实 DOM 语义桩） ---------- */
await section("60. 测试盲区补强：SVG 视觉快照 + 弹窗焦点管理（真实 DOM 语义桩）", async () => {
{
  api.resetState();
  const push=(kind,typeId,patch)=>api.state.objects.push(api.baseObject(kind,typeId,patch));
  push('rect','rect.area',{id:'G_RECT',name:'R1',x:3,y:3,width:8,height:5,angle:15});
  push('rect','rect.area',{id:'G_PARA',name:'P1',x:16,y:4,width:6,height:4,shape:{type:'parallelogram',x:16,y:4,w:6,h:4,skew:25}});
  push('point','point.camera',{id:'G_CAM',name:'C1',x:7,y:13,angle:35,phys:10,fov:90,scaleShape:'sector'});
  push('line','line.boundary',{id:'G_LINE',name:'L1',closed:true,points:[[2,2],[10,2],[10,8]]});
  push('dimension','dimension.distance',{id:'G_DIM',name:'D1',points:[[3,11],[13,11]],subtype:'distance'});
  push('text','text.label',{id:'G_TXT',name:'T1',x:14,y:13,text:'SITE A',width:8,height:1.6});
  Object.assign(api.state.settings,{precision:2,showLabels:true,showSegLen:true,showAreaTag:true,markerScale:1,unit:'m'});
  const scene=api.buildSceneSvg();
  const sceneHash=createHash('sha256').update(scene).digest('hex');
  eq('视觉快照-SVG 场景哈希', sceneHash, 'e6ba5542046cb68f42e8cf9639dbb3e2061914e4a3f79bebf2513fde308b97bf');
  ok('视觉快照-SVG 输出非空', typeof scene==='string' && scene.length>1000);
  ok('视觉快照-平行四边形与扇形路径存在', scene.includes('<polygon') && scene.includes(' A'));
  eq('视觉快照-重复导出稳定', createHash('sha256').update(api.buildSceneSvg()).digest('hex'), sceneHash);

  /* 真实 DOM 语义桩：验证弹窗打开聚焦、Tab 首尾循环、Esc 关闭与焦点还原 */
  const makeEl=id=>{
    const el={
      id, textContent:'', innerHTML:'', className:'', onclick:null, offsetParent:{}, _focusable:[],
      classList:(()=>{ const s=new Set(); return {add:c=>s.add(c),remove:c=>s.delete(c),contains:c=>s.has(c),toggle:(c,on)=>on?s.add(c):s.delete(c)}; })(),
      appendChild(c){ this.children=this.children||[]; this.children.push(c); return c; },
      setAttribute(){}, getAttribute(){ return null; }, hasAttribute(){ return false; },
      querySelectorAll(){ return this._focusable; },
      focus(){ fakeDoc.activeElement=this; }, remove(){}
    };
    return el;
  };
  const fakeDoc={activeElement:null,_els:new Map(),getElementById(id){ if(!this._els.has(id)) this._els.set(id,makeEl(id)); return this._els.get(id); },createElement(){ return makeEl(''); },querySelectorAll(){ return []; },addEventListener(){},removeEventListener(){},body:makeEl('body'),documentElement:makeEl('html')};
  const f1=makeEl('f1'), f2=makeEl('f2'), trigger=makeEl('trigger');
  fakeDoc.getElementById('modalBox')._focusable=[f1,f2];
  fakeDoc.activeElement=trigger;
  const oldDoc=sandbox.document;
  sandbox.document=fakeDoc;
  try{
    api.openModal('测试','<p>x</p>',[{text:'OK',click(){}}]);
    eq('焦点管理-打开后聚焦首个控件', fakeDoc.activeElement, f1);
    fakeDoc.activeElement=f2;
    api.modalKeydown({key:'Tab',shiftKey:false,preventDefault(){}});
    eq('焦点管理-Tab 末位回到首位', fakeDoc.activeElement, f1);
    api.modalKeydown({key:'Tab',shiftKey:true,preventDefault(){}});
    eq('焦点管理-Shift+Tab 首位回到末位', fakeDoc.activeElement, f2);
    api.modalKeydown({key:'Escape',preventDefault(){}});
    eq('焦点管理-Esc 关闭并还原焦点', fakeDoc.activeElement, trigger);
    eq('焦点管理-关闭后弹窗隐藏', fakeDoc.getElementById('modalBackdrop').classList.contains('show'), false);
  }finally{
    sandbox.document=oldDoc;
  }
  api.resetState();
}

});

/* 61. 停车规划：双面垂直车位/通道布局、净宽检查与旋转排列 ---------- */
await section("61. 停车规划：双面垂直车位/通道布局、净宽检查与旋转排列", async () => {
{
  const base={siteX:0,siteY:0,siteW:100,siteH:70,stallWidth:2.5,stallDepth:5.3,aisleWidth:6,margin:1,orientation:'x'};
  const r=api.parkingLayout(base);
  eq('停车-默认布局可生成', r.error, null);
  eq('停车-每排车位数', r.stats.perRow, 39);
  eq('停车-排数（模块）', r.stats.modules, 4);
  eq('停车-车位总数', r.stats.stallCount, 312);
  eq('停车-通道总数', r.stats.aisleCount, 4);
  approx('停车-车位面积', r.stats.stallArea, 4134, 1e-6);
  approx('停车-车位占比', r.stats.stallRatio, 4134/7000, 1e-6);
  approx('停车-含通道利用率', r.stats.totalRatio, 6474/7000, 1e-6);
  approx('停车-首个车位 X', r.stalls[0].x, 1.25, 1e-9);
  approx('停车-首个车位 Y', r.stalls[0].y, 1.8, 1e-9);
  eq('停车-首个车位角度', r.stalls[0].angle, 0);
  approx('停车-首个通道 Y', r.aisles[0].y, 7.1, 1e-9);
  eq('停车-首个通道宽度', r.aisles[0].width, 97.5);
  eq('停车-通道净宽', r.aisles[0].height, 6);
  eq('停车-无规范提示', r.warnings.length, 0);

  const y=api.parkingLayout(Object.assign({},base,{orientation:'y'}));
  eq('停车-纵向排列可生成', y.error, null);
  eq('停车-纵向每排车位', y.stats.perRow, 27);
  eq('停车-纵向排数', y.stats.modules, 5);
  eq('停车-纵向车位总数', y.stats.stallCount, 270);
  eq('停车-纵向通道数', y.stats.aisleCount, 5);
  eq('停车-纵向车位角度', y.stalls[0].angle, 90);
  approx('停车-纵向首个车位 X', y.stalls[0].x, 8.5, 1e-9);
  approx('停车-纵向首个车位 Y', y.stalls[0].y, 66.25, 1e-9);

  const inside=(rect2,site)=>rect2.angle===90
    ?rect2.x-rect2.height>=-1e-9&&rect2.x<=site.siteW+1e-9&&rect2.y>=-1e-9&&rect2.y+rect2.width<=site.siteH+1e-9
    :rect2.x>=-1e-9&&rect2.x+rect2.width<=site.siteW+1e-9&&rect2.y>=-1e-9&&rect2.y+rect2.height<=site.siteH+1e-9;
  ok('停车-横向车位均在场地内', r.stalls.every(s=>inside(s,base)) && r.aisles.every(a=>inside(a,base)));
  ok('停车-纵向车位均在场地内', y.stalls.every(s=>inside(s,base)) && y.aisles.every(a=>inside(a,base)));

  eq('停车-通道过窄拒绝生成', api.parkingLayout(Object.assign({},base,{aisleWidth:2})).error, 'aisleTooSmall');
  eq('停车-场地过小拒绝生成', api.parkingLayout(Object.assign({},base,{siteW:3,siteH:3})).error, 'siteTooSmall');
  eq('停车-非法尺寸拒绝生成', api.parkingLayout(Object.assign({},base,{stallWidth:0})).error, 'invalid');
  ok('停车-通道偏窄给出提示', api.parkingLayout(Object.assign({},base,{aisleWidth:4})).warnings.includes('aisleNarrow'));
  ok('停车-车位偏窄给出提示', api.parkingLayout(Object.assign({},base,{stallWidth:2.2})).warnings.includes('stallWidthSmall'));
  ok('停车-车位偏浅给出提示', api.parkingLayout(Object.assign({},base,{stallDepth:4.8})).warnings.includes('stallDepthSmall'));
  ok('停车-边距过小给出提示', api.parkingLayout(Object.assign({},base,{margin:0})).warnings.includes('marginSmall'));

  /* IO-P2-23：场地可见时只取场地包围盒；图片底图更大也不得扩大排布范围 */
  const pst=api.resetState();
  pst.background={ kind:'image', width:2000, height:1400, metersPerPixel:0.1, xform:null };
  api.resetFrameRef();
  eq('停车-取场地包围盒', api.parkingSite(), { x:0, y:0, w:100, h:70 });
  pst.site.visible=false;
  api.resetFrameRef();
  eq('停车-场地隐藏才回退取景框', api.parkingSite(), { x:0, y:0, w:200, h:140 });
  pst.site.visible=true;
  pst.site.shape={ type:'rect', x:20, y:30, w:40, h:25 };
  api.resetFrameRef();
  eq('停车-跟随场地实际位置', api.parkingSite(), { x:20, y:30, w:40, h:25 });
  api.resetState();
  api.I18N.setLang('en');
  ok('停车-规范提示可翻译', api.parkingWarningText('aisleNarrow').includes('Aisle'));
  api.I18N.setLang('zh');
  eq('停车-中文规范提示', api.parkingWarningText('siteTooSmall'), '当前场地不足以排下完整车位与通道');

  /* 应用 / 撤销 / 重做：验证写入停车场图层、墓碑与历史栈 */
  api.resetState();
  api.history.past=[]; api.history.future=[];
  api.$('parkingStallW').value='2.5'; api.$('parkingStallD').value='5.3';
  api.$('parkingAisle').value='6'; api.$('parkingMargin').value='1';
  api.$('parkingOrient').value='x'; api.$('parkingClear').checked=true;
  api.applyParkingLayout();
  eq('停车-应用生成车位', api.state.objects.filter(o=>o.typeId==='rect.parking').length, 312);
  eq('停车-应用生成通道', api.state.objects.filter(o=>o.typeId==='rect.aisle').length, 4);
  eq('停车-应用创建图层', api.state.layers.some(l=>l.id==='layer.parking'), true);
  eq('停车-应用进入历史栈', api.history.past.length, 1);
  api.undo();
  eq('停车-撤销移除车位', api.state.objects.filter(o=>o.typeId==='rect.parking').length, 0);
  api.redo();
  eq('停车-重做恢复车位', api.state.objects.filter(o=>o.typeId==='rect.parking').length, 312);
  /* IO-P2-24：编号复用统一作用域，P/A 前缀三位定宽且全局唯一；清除再生成须避开墓碑名 */
  const pNames=api.state.objects.filter(o=>o.typeId==='rect.parking').map(o=>o.name);
  ok('停车-车位编号 P+三位', pNames.every(n=>/^P\d{3}$/.test(n)));
  eq('停车-车位编号唯一', new Set(pNames).size, pNames.length);
  eq('停车-首个车位编号', pNames[0], 'P001');
  eq('停车-首条通道编号', api.state.objects.find(o=>o.typeId==='rect.aisle').name, 'A001');
  api.applyParkingLayout();
  const p2=api.state.objects.filter(o=>o.typeId==='rect.parking').map(o=>o.name);
  eq('停车-清除再生成避开墓碑名', p2[0], 'P313');
  eq('停车-清除再生成总数不变', api.state.objects.filter(o=>o.typeId==='rect.parking').length, 312);
  api.history.past=[]; api.history.future=[];
  api.resetState();
}

});

/* 62. 实时协作：长消息分块与本地提交防抖（WebRTC/BC 传输层为浏览器环境） ---------- */
await section("62. 实时协作：长消息分块与本地提交防抖（WebRTC/BC 传输层为浏览器环境）", async () => {
{
  const text='A'.repeat(100);
  const parts=api.collabChunkText(text,30);
  eq('协作分块-块数', parts.length, 4);
  eq('协作分块-首块长度', parts[0].length, 30);
  eq('协作分块-末块长度', parts[3].length, 10);
  eq('协作分块-拼接还原', parts.join(''), text);
  eq('协作分块-空文本', api.collabChunkText('').join(''), '');
  const big='测'.repeat(100000);
  const bigParts=api.collabChunkText(big,48000);
  eq('协作分块-大文本块数', bigParts.length, 3);
  eq('协作分块-大文本还原', bigParts.join(''), big);
  ok('协作分块-非字符串安全', api.collabChunkText(null).join('') === '');
  const sdpClean=api.collabCleanSDP('v=0\r\na=mid:0\r\na=max-message-size:262144\r\na=sctp-port:5000\r\n');
  ok('协作-SDP 清洗移除不兼容属性', !sdpClean.includes('max-message-size'));
  ok('协作-SDP 清洗保留关键行', sdpClean.includes('a=mid:0') && sdpClean.includes('a=sctp-port:5000'));
  const sdpMedia=api.collabCleanSDP('v=0\na=group:BUNDLE 0\na=mid:0\n\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\na=sctp-port:5000\n');
  ok('协作-SDP 移除空行（Chromium 解析器不接受空行）', !sdpMedia.includes('\r\n\r\n'));
  ok('协作-SDP 媒体段紧接会话段', sdpMedia.includes('a=mid:0\r\nm=application'));
  ok('协作-SDP 以换行结尾', sdpMedia.endsWith('\r\n'));
  let threw=false;
  try{ api.collabOnLocalChange(); }catch(_){ threw=true; }
  ok('协作-未连接时本地提交不抛错', !threw);

  /* B-06：邀请串编解码、二维码容量、入站缓冲护栏、hello 去重、条件写历史 */
  const inviteSdp='v=0\r\na=group:BUNDLE 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=mid:0\r\na=sctp-port:5000\r\n';
  const invite=api.collabInviteEncode('offer',inviteSdp);
  ok('邀请串-前缀与类型标记', invite.startsWith('PLOTPIN-COLLAB:1:O:'));
  const inviteDec=api.collabInviteDecode(invite);
  eq('邀请串-解码类型 offer', inviteDec.kind, 'offer');
  ok('邀请串-还原 SDP', inviteDec.sdp.startsWith('v=0') && inviteDec.sdp.includes('m=application'));
  ok('邀请串-tagged 标记', inviteDec.tagged === true);
  const answerDec=api.collabInviteDecode(api.collabInviteEncode('answer',inviteSdp));
  eq('邀请串-解码类型 answer', answerDec.kind, 'answer');
  const rawDec=api.collabInviteDecode(inviteSdp);
  eq('邀请串-裸 SDP 兼容', rawDec.kind, 'offer');
  ok('邀请串-裸 SDP 未标记', rawDec.tagged === false);
  let inviteBad=false;
  try{ api.collabInviteDecode('PLOTPIN-COLLAB:1:X:abc'); }catch(_){ inviteBad=true; }
  ok('邀请串-非法类型拒绝', inviteBad);
  let inviteEmpty=false;
  try{ api.collabInviteEncode('offer',''); }catch(_){ inviteEmpty=true; }
  ok('邀请串-空内容拒绝', inviteEmpty);
  const qrSmall=api.collabQrFit('PLOTPIN:DEV-1');
  ok('二维码-短标签可放', qrSmall.fits === true && qrSmall.limit === 42);
  const qrInvite=api.collabQrFit(invite);
  ok('二维码-邀请串超限（不伪造）', qrInvite.fits === false && qrInvite.bytes > 42);

  api.collabInbound.clear();
  const tn=1000000;
  api.collabInbound.set('old',{total:2,parts:['a'],size:1,lastAt:tn-31000});
  api.collabInbound.set('fresh',{total:2,parts:['a'],size:1,lastAt:tn-1000});
  eq('入站缓冲-TTL 清理过期', api.collabSweepInbound(tn), 1);
  api.collabInbound.clear();
  for(let i=0;i<70;i++) api.collabInbound.set('k'+i,{total:1,parts:['x'],size:1,lastAt:tn+i});
  eq('入站缓冲-key 上限', api.collabSweepInbound(tn+100), 64);
  ok('入站缓冲-淘汰最旧 key', !api.collabInbound.has('k0') && api.collabInbound.has('k69'));
  api.collabInbound.clear();
  for(let i=0;i<18;i++) api.collabInbound.set('b'+i,{total:1,parts:['x'],size:1024*1024,lastAt:tn+i});
  api.collabSweepInbound(tn+100);
  ok('入站缓冲-总字节上限', api.collabInboundBytes() <= 16*1024*1024);
  ok('入站缓冲-字节超限淘汰最旧', !api.collabInbound.has('b0'));
  api.collabInbound.clear();

  api.collabHelloSeen.clear();
  const ht=5000;
  ok('hello 去重-首见处理', api.collabHelloDup('P-TEST','N',ht) === false);
  ok('hello 去重-窗口内忽略', api.collabHelloDup('P-TEST','N',ht+100) === true);
  ok('hello 去重-窗口外重处理', api.collabHelloDup('P-TEST','N',ht+2000) === false);
  ok('hello 去重-换名重处理', api.collabHelloDup('P-TEST','M',ht+2100) === false);
  api.collabHelloSeen.clear();

  ok('合并历史-纯新增不写栈', api.mergeHistoryNeeded({added:5,floorsAdded:1}) === false);
  ok('合并历史-对象覆盖写栈', api.mergeHistoryNeeded({updated:1}) === true);
  ok('合并历史-删除写栈', api.mergeHistoryNeeded({deleted:1}) === true);
  ok('合并历史-楼层元数据覆盖写栈', api.mergeHistoryNeeded({floorMetaUpdated:1}) === true);
  ok('合并历史-整层删除写栈', api.mergeHistoryNeeded({floorsDeleted:1}) === true);
  ok('合并历史-场地删除写栈', api.mergeHistoryNeeded({siteDeleted:1}) === true);
  ok('合并历史-场地清空写栈', api.mergeHistoryNeeded({siteCleared:1}) === true);
}

});

/* 63. 多楼层汇总：逐层对象数/分类/面积/长度与合计 ---------------------------- */
await section("63. 多楼层汇总：逐层对象数/分类/面积/长度与合计", async () => {
{
  const st=api.resetState();
  st.objects.push(api.baseObject('point','point.marker',{name:'A',x:1,y:1}));
  st.objects.push(api.baseObject('rect','rect.area',{name:'R1',x:0,y:0,width:10,height:10}));
  st.objects.push(api.baseObject('line','line.boundary',{name:'L1',points:[[0,0],[3,0],[3,4]]}));
  api.syncActiveFloor();
  const init=api.createInitialState();
  st.floors.push({id:'floor.F2',name:'2F',background:init.background,objects:[
    api.baseObject('point','point.marker',{name:'B',x:2,y:2}),
    api.baseObject('rect','rect.area',{name:'R2',x:0,y:0,width:5,height:4})
  ],viewport:init.viewport});
  const s1=api.floorSummaries();
  eq('楼层汇总-层数', s1.rows.length, 2);
  eq('楼层汇总-当前层对象数', s1.rows[0].count, 3);
  eq('楼层汇总-当前层点设备', s1.rows[0].counts.point, 1);
  eq('楼层汇总-当前层区域', s1.rows[0].counts.rect, 1);
  eq('楼层汇总-当前层折线', s1.rows[0].counts.line, 1);
  approx('楼层汇总-当前层面积', s1.rows[0].area, 100);
  approx('楼层汇总-当前层长度', s1.rows[0].len, 7);
  ok('楼层汇总-活动层标记', s1.rows[0].active===true&&s1.rows[1].active===false);
  eq('楼层汇总-非活动层取楼层条目对象', s1.rows[1].count, 2);
  approx('楼层汇总-非活动层面积', s1.rows[1].area, 20);
  eq('楼层汇总-合计对象数', s1.total.count, 5);
  eq('楼层汇总-合计分类', [s1.total.counts.point,s1.total.counts.rect,s1.total.counts.line], [2,2,1]);
  approx('楼层汇总-合计面积', s1.total.area, 120);
  approx('楼层汇总-合计长度', s1.total.len, 7);
  ok('楼层汇总-切换二层', api.switchFloorData('floor.F2'));
  const s2=api.floorSummaries();
  ok('楼层汇总-切换后活动层变更', s2.rows.find(r=>r.id==='floor.F2').active===true);
  eq('楼层汇总-切换后合计不变', s2.total.count, 5);
  api.resetState();
}

});

/* 64. 资源上限：缩放/图标/段长阈值、底图降采样策略、设置迁移与 HTML 转义 ---------- */
await section("64. 资源上限：缩放/图标/段长阈值、底图降采样策略、设置迁移与 HTML 转义", async () => {
{
  eq('资源上限-缩放范围', [api.APP_LIMITS.ZOOM_MIN, api.APP_LIMITS.ZOOM_MAX], [0.02, 200]);
  eq('资源上限-图标倍率范围', [api.APP_LIMITS.ICON_SCALE_MIN, api.APP_LIMITS.ICON_SCALE_MAX], [0.2, 8]);
  eq('资源上限-段长标注阈值范围', [api.APP_LIMITS.SEG_LABEL_MIN_PX_MIN, api.APP_LIMITS.SEG_LABEL_MIN_PX_MAX], [10, 60]);

  eq('底图策略-小图不缩放', api.backgroundScalePlan(2000, 1000, 'image/png', 1024 * 1024), null);
  const wide = api.backgroundScalePlan(5000, 1000, 'image/png', 1024 * 1024);
  eq('底图策略-长边限制到 3000', [wide.width, wide.height], [3000, 600]);
  eq('底图策略-透明格式保留 PNG', wide.format, 'image/png');
  const square = api.backgroundScalePlan(4000, 4000, 'image/jpeg', 2 * 1024 * 1024);
  eq('底图策略-方形等比缩放', [square.width, square.height], [3000, 3000]);
  eq('底图策略-不透明格式转 JPEG', square.format, 'image/jpeg');
  approx('底图策略-JPEG 质量', square.quality, 0.85);
  const hugePng = api.backgroundScalePlan(5000, 5000, 'image/png', 7 * 1024 * 1024);
  eq('底图策略-超大透明图转 JPEG', hugePng.format, 'image/jpeg');
  eq('底图策略-SVG 不降采样', api.backgroundScalePlan(5000, 5000, 'image/svg+xml', 1024), null);
  const thin = api.backgroundScalePlan(9000, 1, 'image/jpeg', 1024);
  eq('底图策略-极窄图最小边仍为 1', [thin.width, thin.height], [3000, 1]);

  const m1 = api.migrateProject({schema:'offline-drawing-annotation/v1', objects:[], settings:{segLabelMinPx:5}});
  eq('设置迁移-段长阈值下限', m1.settings.segLabelMinPx, 10);
  const m2 = api.migrateProject({schema:'offline-drawing-annotation/v1', objects:[], settings:{segLabelMinPx:999}});
  eq('设置迁移-段长阈值上限', m2.settings.segLabelMinPx, 60);
  const m3 = api.migrateProject({schema:'offline-drawing-annotation/v1', objects:[], settings:{segLabelMinPx:'abc'}});
  eq('设置迁移-段长阈值缺省', m3.settings.segLabelMinPx, 26);
  const mv = api.migrateProject({schema:'offline-drawing-annotation/v1', objects:[], viewport:{zoom:0.001}});
  eq('设置迁移-缩放下限', mv.viewport.zoom, 0.02);
  const mv2 = api.migrateProject({schema:'offline-drawing-annotation/v1', objects:[], viewport:{zoom:500}});
  eq('设置迁移-缩放上限', mv2.viewport.zoom, 200);
  ok('段长阈值-读取下限', (()=>{ api.state.settings.segLabelMinPx=5; return api.segLabelMinPx()===10; })());
  ok('段长阈值-读取上限', (()=>{ api.state.settings.segLabelMinPx=999; return api.segLabelMinPx()===60; })());
  ok('段长阈值-非法值回退默认', (()=>{ api.state.settings.segLabelMinPx='abc'; return api.segLabelMinPx()===26; })());

  ok('HTML 转义-不保留未转义标签', !api.esc('<img src=x onerror=alert(1)>').includes('<'));
  eq('HTML 转义-引号与尖括号', api.esc('a"b\'c<d>&'), 'a&quot;b&#39;c&lt;d&gt;&amp;');
  api.resetState();
}

});

/* 65. 对象对齐与分布：包围盒边界/中线、等间距、少于阈值不动 -------------------- */
await section("65. 对象对齐与分布：包围盒边界/中线、等间距、少于阈值不动", async () => {
{
  const mk=(patch)=>api.baseObject('rect','rect.area',Object.assign({x:0,y:0,width:10,height:10},patch));
  const boxes=objs=>objs.map(o=>api.objectBounds(o));

  let a=mk({x:0,y:0}), b=mk({x:20,y:5}), c=mk({x:40,y:2});
  api.alignObjects([a,b,c],'left');
  eq('对齐-左边界一致', boxes([a,b,c]).map(x=>x.minX), [0,0,0]);
  eq('对齐-左对齐不改变 Y', [a.y,b.y,c.y], [0,5,2]);

  a=mk({x:0,y:0}); b=mk({x:20,y:5}); c=mk({x:40,y:2});
  api.alignObjects([a,b,c],'centerX');
  eq('对齐-水平居中中心一致', boxes([a,b,c]).map(x=>(x.minX+x.maxX)/2), [25,25,25]);

  a=mk({x:0,y:0}); b=mk({x:20,y:5}); c=mk({x:40,y:2});
  api.alignObjects([a,b,c],'right');
  eq('对齐-右边界一致', boxes([a,b,c]).map(x=>x.maxX), [50,50,50]);

  a=mk({x:0,y:0}); b=mk({x:20,y:5}); c=mk({x:40,y:2});
  api.alignObjects([a,b,c],'top');
  eq('对齐-上边界一致', boxes([a,b,c]).map(x=>x.maxY), [15,15,15]);

  a=mk({x:0,y:0}); b=mk({x:20,y:5}); c=mk({x:40,y:2});
  api.alignObjects([a,b,c],'centerY');
  approx('对齐-垂直居中 A', boxes([a])[0].minY+boxes([a])[0].maxY, 15);
  approx('对齐-垂直居中 B', boxes([b])[0].minY+boxes([b])[0].maxY, 15);
  approx('对齐-垂直居中 C', boxes([c])[0].minY+boxes([c])[0].maxY, 15);

  a=mk({x:0,y:0}); b=mk({x:20,y:5}); c=mk({x:40,y:2});
  api.alignObjects([a,b,c],'bottom');
  eq('对齐-下边界一致', boxes([a,b,c]).map(x=>x.minY), [0,0,0]);
  eq('对齐-返回对象数', api.alignObjects([a,b,c],'left'), 3);
  const solo=mk({x:7,y:7});
  eq('对齐-少于两个对象不移动', api.alignObjects([solo],'left'), 0);
  eq('对齐-单对象坐标不变', [solo.x,solo.y], [7,7]);

  const line=api.baseObject('line','line.boundary',{x:10,y:5,points:[[0,0],[10,0]]});
  api.translateObject(line,5,-3);
  eq('平移-折线锚点同步', [line.x,line.y], [15,2]);
  eq('平移-折线节点同步', line.points, [[5,-3],[15,-3]]);

  const p1=mk({x:0,y:0}), p2=mk({x:10,y:0}), p3=mk({x:40,y:0});
  api.distributeObjects([p3,p1,p2],'x');
  eq('分布-水平等间距', boxes([p1,p2,p3]).map(x=>(x.minX+x.maxX)/2), [5,25,45]);
  eq('分布-首末保持不动', [p1.x,p3.x], [0,40]);

  const q1=mk({x:0,y:0}), q2=mk({x:0,y:10}), q3=mk({x:0,y:40});
  api.distributeObjects([q3,q1,q2],'y');
  eq('分布-垂直等间距', boxes([q1,q2,q3]).map(x=>(x.minY+x.maxY)/2), [5,25,45]);
  eq('分布-少于三个对象不移动', api.distributeObjects([p1,p2],'x'), 0);
  api.resetState();
}

});

/* 66. 批量编号与层级：跨层避让、步长/空前缀/非法参数、置顶置底 ------------------ */
await section("66. 批量编号与层级：跨层避让、步长/空前缀/非法参数、置顶置底", async () => {
{
  const st=api.resetState();
  const mk=(name,z)=>api.baseObject('point','point.marker',{name,x:1,y:1,z});
  const a=mk('A',0), b=mk('B',1), c=mk('C',2);
  const used=new Set(['P001','P003']);
  eq('编号-处理数量', api.renumberObjects([a,b,c],'P',1,1,used), 3);
  eq('编号-自动跳过已占用', [a.name,b.name,c.name], ['P002','P004','P005']);
  eq('编号-新编号写回 used', used.has('P005'), true);

  const d=mk('D',3), e=mk('E',4);
  api.renumberObjects([d,e],'CAM',10,2,new Set());
  eq('编号-步长递增', [d.name,e.name], ['CAM010','CAM012']);
  const f=mk('F',5), g=mk('G',6);
  api.renumberObjects([f,g],'',1,1,new Set());
  eq('编号-空前缀为纯序号', [f.name,g.name], ['001','002']);
  const h=mk('H',7), i=mk('I',8);
  api.renumberObjects([h,i],'Q',NaN,0,new Set());
  eq('编号-非法起始与步长回退', [h.name,i.name], ['Q001','Q002']);

  st.objects.push(mk('A',0), mk('B',1));
  st.floors.push({id:'floor.F2',name:'2F',background:st.background,objects:[mk('C2',0)],viewport:st.viewport});
  const names=api.allObjectNames();
  ok('编号-全工程编号含非当前层', names.has('A')&&names.has('B')&&names.has('C2'));

  const o1=mk('o1',0), o2=mk('o2',1), o3=mk('o3',2), o4=mk('o4',3);
  const all=[o1,o2,o3,o4];
  const reset=()=>{ all.length=0; all.push(o1,o2,o3,o4); all.forEach((o,i)=>o.z=i); };
  eq('层级-置顶数量', api.restackObjects(all,new Set([o1.id,o3.id]),'front'), 2);
  eq('层级-置顶后数组顺序', all.map(o=>o.name), ['o2','o4','o1','o3']);
  eq('层级-置顶后 z 归一', all.map(o=>o.z), [0,1,2,3]);

  reset();
  eq('层级-置底数量', api.restackObjects(all,new Set([o1.id,o3.id]),'back'), 2);
  eq('层级-置底后数组顺序', all.map(o=>o.name), ['o1','o3','o2','o4']);
  eq('层级-置底后 z 归一', all.map(o=>o.z), [0,1,2,3]);
  eq('层级-空选择不处理', api.restackObjects(all,new Set(),'front'), 0);

  reset();
  api.restackObjects(all,new Set([o4.id,o1.id]),'front');
  eq('层级-多选保持相对视觉顺序', all.map(o=>o.name), ['o2','o3','o1','o4']);

  /* 编号作用域：批量取号与旧 nextObjectId 语义一致，且不重复扫描全量 state（B-01 导入 O(N²) 护栏） */
  api.resetState();
  const seed=new Set(['O0001','O0003','A001']);
  const scope=api.objectNameScopeFor(seed);
  eq('编号作用域-起点沿用数量+1并跳过占用', [scope.reserve(),scope.reserve()], ['O0004','O0005']);
  eq('编号作用域-新编号回写占用集合', seed.has('O0005'), true);

  const guardArr=[];
  const guard=new Proxy(guardArr,{ get(t,p,r){ if(p==='map') throw new Error('扫描全量 state.objects'); return Reflect.get(t,p,r); } });
  api.state.objects=guard;
  let named=null, scanErr=null;
  try{ named=api.baseObject('point','point.marker',{name:'KEEP'}); }catch(e){ scanErr=e.message; }
  api.state.objects=guardArr;
  eq('编号-显式 name 不触发全量扫描', scanErr, null);
  eq('编号-显式 name 保持原值', named&&named.name, 'KEEP');

  /* buildProject：缺编号对象跨楼层唯一，且不与已有/载荷编号冲突 */
  api.resetState();
  const init=api.createInitialState();
  api.state.objects.push(api.baseObject('point','point.marker',{name:'O0002',x:0,y:0}));
  api.syncActiveFloor();
  const payload=Object.assign({},init,{
    schema:init.schema,
    objects:[{kind:'point',name:'O0009',x:1,y:1},{kind:'point',x:2,y:2},{kind:'line',points:[[0,0],[1,0]]}],
    floors:[{id:'floor.default',name:'1F',updatedAt:''},
      {id:'floor.F2',name:'2F',updatedAt:'',objects:[{kind:'point',x:3,y:3}]}],
    activeFloorId:'floor.default', tombstones:[]
  });
  const built=api.buildProject(payload);
  const names1=built.objects.map(o=>o.name);
  const names2=built.floors.find(f=>f.id==='floor.F2').objects.map(o=>o.name);
  ok('编号-导入缺编号对象跨层唯一', new Set([...names1,...names2]).size===names1.length+names2.length);
  ok('编号-导入保留载荷已有编号', names1.includes('O0009'));
  ok('编号-导入缺编号对象避开已有与载荷编号', !names1.includes('O0001') && !names1.includes('O0002'));
  api.resetState();
}

});

/* 67. 多楼层台账：导出楼层列、导入按楼层路由、未知楼层与跨层重号 ------------ */
await section("67. 多楼层台账：导出楼层列、导入按楼层路由、未知楼层与跨层重号", async () => {
{
  const st=api.resetState();
  st.objects.push(api.baseObject('point','point.marker',{name:'A',x:1,y:1}));
  api.syncActiveFloor();
  const init=api.createInitialState();
  st.floors.push({id:'floor.F2',name:'2F',background:init.background,
    objects:[api.baseObject('point','point.marker',{name:'B',x:2,y:2})],viewport:init.viewport});

  const rows=api.objectRowsAll();
  eq('台账-全楼层行数', rows.length, 2);
  eq('台账-楼层列', rows.map(r=>r.楼层), ['1F','2F']);

  const C=api.TABLE_COLUMNS;
  const header=C.slice();
  const rowFor=o=>C.map(k=>o[k]??'');
  const bRow=rows.find(r=>r.编号==='B');
  const upd=rowFor(Object.assign({},bRow,{X:'9.50',Y:'8.50',楼层:'2F'}));
  const p1=api.rowsToObjectsPlan([header,upd]);
  eq('台账-跨层更新命中', p1.updates.length, 1);
  eq('台账-跨层更新目标楼层', p1.updates[0].floorId, 'floor.F2');
  api.applyTableImport(p1);
  const f2=api.state.floors.find(f=>f.id==='floor.F2');
  const b=f2.objects.find(o=>o.name==='B');
  approx('台账-跨层更新 X', b.x, 9.5);
  approx('台账-跨层更新 Y', b.y, 8.5);
  eq('台账-活动层对象数不变', api.state.objects.length, 1);

  const newRow=C.map(k=>({'编号':'C2','对象类型':'点设备','业务类型':'通用标记','X':'5','Y':'6','楼层':'2F'}[k]??''));
  const p2=api.rowsToObjectsPlan([header,newRow]);
  eq('台账-跨层新建数', p2.creates.length, 1);
  eq('台账-跨层新建目标楼层', p2.creates[0].floorId, 'floor.F2');
  api.applyTableImport(p2);
  eq('台账-2F 新增对象', f2.objects.length, 2);
  eq('台账-当前层仍 1 个', api.state.objects.length, 1);

  const bad=C.map(k=>({'编号':'X9','对象类型':'点设备','X':'1','Y':'2','楼层':'9F'}[k]??''));
  const p3=api.rowsToObjectsPlan([header,bad]);
  ok('台账-未知楼层告警且不新建', p3.creates.length===0&&p3.warnings.some(w=>w.includes('9F')));

  const dup=C.map(k=>({'编号':'A','对象类型':'点设备','X':'1','Y':'2','楼层':'2F'}[k]??''));
  const p4=api.rowsToObjectsPlan([header,dup]);
  ok('台账-跨层重号跳过', p4.creates.length===0&&p4.warnings.some(w=>w.includes('已存在于楼层')));
  api.resetState();
}

});

/* 53. 清空当前楼层：双槽/对象/标注/校准/选中/取景框全清，可整体撤销 ---------- */
await section("53. 清空当前楼层：双槽/对象/标注/校准/选中/取景框全清，可整体撤销", async () => {
{
  api.resetState();
  api.state.background={kind:'image',fileName:'p.png',assetId:'bg.test',width:100,height:80,origin:[0,0],
    metersPerPixel:1,calibrated:true,transform:{a:1,b:0,c:0,d:1,e:0,f:0}};
  api.state.site={type:'site',id:'site.t',name:'场地',layerId:'layer.default',visible:true,locked:false,
    kind:'circle',shape:{type:'circle',cx:5,cy:5,r:3}};
  const cO1=api.baseObject('point','point.marker',{name:'CA',x:1,y:1});
  const cO2=api.baseObject('line','line.custom',{name:'CL',x:0,y:0,points:[[0,0],[3,4]]});
  api.state.objects=[cO1,cO2];
  api.selectedIds.add(cO1.id); api.selectedIds.add(cO2.id);
  api.calibPoints=[[1,1],[5,1]];
  api.affinePairs=[{src:[0,0],dst:[0,0],u:0,v:0,px:0,py:0}];
  api.calibSelection={kind:'scale',index:0};
  api.calibUndoStack=[{calib:[[0,0]],affine:[]}];
  api.state.viewport.zoom=3; api.state.viewport.panX=120; api.state.viewport.panY=90;
  api.pushHistory();
  const csum=api.clearCurrentFloor();
  eq('清空-返回统计', csum, {objects:2,background:true,site:true});
  eq('清空-对象归零', api.state.objects.length, 0);
  eq('清空-背景为空图槽', api.state.background.kind, 'empty');
  eq('清空-场地为 null', api.state.site, null);
  eq('清空-选中态清空', api.selectedIds.size, 0);
  eq('清空-校准点与仿射清空', [api.calibPoints.length,api.affinePairs.length], [0,0]);
  ok('清空-校准选择与撤销栈清空', api.calibSelection===null&&api.calibUndoStack.length===0);
  ok('清空-对象墓碑写入', api.state.tombstones.some(t=>t.id===cO1.id)&&api.state.tombstones.some(t=>t.id===cO2.id));
  eq('清空-台账无残留行', api.objectRowsAll().length, 0);
  eq('清空-当前楼层对象同步归零', api.currentFloor().objects.length, 0);
  eq('清空-当前楼层背景同步为空', api.currentFloor().background.kind, 'empty');
  eq('清空-当前楼层场地同步为 null', api.currentFloor().site, null);
  const cdim=api.worldDims();
  approx('清空-取景框恢复默认真实比例', api.state.viewport.zoom, Math.min((900-44)/cdim.w,(600-44)/cdim.h), 1e-9);
  approx('清空-取景框水平居中', api.state.viewport.panX, (900-cdim.w*api.state.viewport.zoom)/2, 1e-9);
  ok('清空-静态缓存签名含空场地', api.sceneStaticKey(api.state.viewport,cdim,900,600).includes('null'));
  api.undo();
  eq('清空撤销-对象恢复', api.state.objects.length, 2);
  ok('清空撤销-双槽恢复', api.state.background.kind==='image'&&!!api.state.site);
  eq('清空撤销-背景资产仍可重载', api.state.background.assetId, 'bg.test');
  api.resetState();
}

});

/* 63. 撤销/重做/增删楼层统一落盘（A-03 / 审计 P0-4） ---------------------------- */
await section("63. 撤销/重做/增删楼层统一落盘（A-03 / 审计 P0-4）", async () => {
asyncSuites.push(async()=>{
  const origSave=api.scheduleSave;
  let calls=0, saved=null;
  api.scheduleSave=()=>{ calls++; saved=api.persistableState(); };
  try{
    /* 撤销：落盘快照必须包含被恢复的对象 */
    api.resetState(); api.history.past=[]; api.history.future=[];
    const obj=api.baseObject('point','point.marker',{name:'P1',x:1,y:1});
    api.state.objects=[obj]; api.pushHistory();
    api.state.objects=[];
    calls=0; saved=null; api.undo();
    ok('落盘-撤销调用保存', calls>=1);
    eq('落盘-撤销快照恢复对象', saved&&saved.objects.length, 1);
    /* 重做：落盘快照必须反映重做后的空对象列表 */
    calls=0; saved=null; api.redo();
    ok('落盘-重做调用保存', calls>=1);
    eq('落盘-重做快照对象归零', saved&&saved.objects.length, 0);
    /* 新增楼层：刷新后楼层不能消失 */
    api.resetState(); api.history.past=[]; api.history.future=[];
    calls=0; saved=null;
    const newId=await api.addFloor('F2');
    ok('落盘-新增楼层返回 id', !!newId);
    ok('落盘-新增楼层调用保存', calls>=1);
    eq('落盘-新增楼层快照两层', saved&&saved.floors.length, 2);
    eq('落盘-新增楼层活动层正确', saved&&saved.activeFloorId, newId);
    /* 删除当前楼层：刷新后不能复活，活动层切到第一层 */
    calls=0; saved=null;
    await api.deleteFloor(newId);
    ok('落盘-删除当前楼层调用保存', calls>=1);
    eq('落盘-删除当前楼层快照一层', saved&&saved.floors.length, 1);
    ok('落盘-删除当前楼层活动层不复活', !!saved&&saved.activeFloorId!==newId);
  } finally {
    api.scheduleSave=origSave;
    api.history.past=[]; api.history.future=[]; api.resetState();
  }
});

});

/* 64. XLSX 导出：单元格一律 inlineStr（文本），不存在公式节点（A-07 的另一半） ---- */
await section("64. XLSX 导出：单元格一律 inlineStr（文本），不存在公式节点（A-07 的另一半）", async () => {
asyncSuites.push(async()=>{
  const bytes=api.Xlsx.build([['=cmd|calc','@SUM(1)'],['-1','普通文本']],'T');
  const entries=await api.Zip.readEntries(bytes);
  const sheet=api.Zip.readText(entries,'xl/worksheets/sheet1.xml')||'';
  ok('XLSX-工作表存在', sheet.length>0);
  ok('XLSX-单元格为 inlineStr 文本', sheet.includes('t="inlineStr"'));
  ok('XLSX-无公式节点', !/<f[ >]/.test(sheet));
  const rows=await api.Xlsx.readRows(bytes);
  eq('XLSX-注入串按原文保存', rows[0][0], '=cmd|calc');
  eq('XLSX-At 串按原文保存', rows[0][1], '@SUM(1)');
});

});

/* 65. A-12 快赢包：椭圆圆心 / 图标尺寸编辑 / 统计场地类型 / 文件 accept ---------- */
await section("65. A-12 快赢包：椭圆圆心 / 图标尺寸编辑 / 统计场地类型 / 文件 accept", async () => {
{
  /* 65.1 椭圆数值输入：半径不得兼作圆心（审计 P1-5） */
  const es=api.ellipseShapeFromInput('40,25');
  eq('椭圆-形状类型', es&&es.type, 'ellipse');
  eq('椭圆-中心在原点', es&&[es.cx,es.cy], [0,0]);
  eq('椭圆-半径正确', es&&[es.rx,es.ry], [40,25]);
  eq('椭圆-非法输入返回 null', api.ellipseShapeFromInput('0,25'), null);
  api.resetState();
  api.applyVectorSite('ellipse',es);
  const sb=api.siteBounds(api.state.site);
  approx('椭圆-应用后左边界 -40', sb.minX, -40, 1e-6);
  approx('椭圆-应用后上边界 -25', sb.minY, -25, 1e-6);
  approx('椭圆-应用后宽度 80', sb.maxX-sb.minX, 80, 1e-6);
  approx('椭圆-应用后高度 50', sb.maxY-sb.minY, 50, 1e-6);

  /* 65.2 类型面板图标尺寸编辑：data-type-iconsize → dataset.typeIconsize（审计 P1-10） */
  api.resetState();
  api.state.objectTypes.push({id:'type.size',kind:'point',name:'尺寸测试',color:'#333333',icon:'custom',builtin:false,iconSize:1});
  const iconInput={value:'2.5',dataset:{typeIconsize:'type.size'},onchange:null};
  const typeEl={innerHTML:'',querySelectorAll:sel=>sel==='[data-type-iconsize]'?[iconInput]:[]};
  const prevGet=documentStub.getElementById;
  documentStub.getElementById=id=>id==='typeList'?typeEl:prevGet(id);
  api.renderTypes();
  ok('类型面板-已渲染图标尺寸输入', typeEl.innerHTML.includes('data-type-iconsize="type.size"'));
  iconInput.onchange();
  approx('类型面板-图标尺寸写入生效', api.state.objectTypes.find(t=>t.id==='type.size').iconSize, 2.5);
  documentStub.getElementById=prevGet;

  /* 65.3 统计面板场地类型：读 state.site.kind，而不是 background.kind（审计 P1-11） */
  api.resetState();
  api.applyVectorSite('ellipse',api.ellipseShapeFromInput('40,25'));
  const statsEl={innerHTML:'',querySelectorAll:()=>[]};
  documentStub.getElementById=id=>id==='statsPanel'?statsEl:prevGet(id);
  api.renderStats();
  documentStub.getElementById=prevGet;
  ok('统计面板-显示椭圆场地', statsEl.innerHTML.includes('椭圆场地'));
  ok('统计面板-不再误显示 empty', !statsEl.innerHTML.includes('empty'));

  /* 65.4 文件选择 accept：DXF/PDF 可直接选择（审计 P2-24） */
  const fileInputTag=(html.match(/id="fileInput"[^>]*accept="([^"]+)"/)||[])[1]||'';
  ok('入口文件选择-含 .dxf', fileInputTag.includes('.dxf'));
  ok('入口文件选择-含 .pdf', fileInputTag.includes('.pdf'));
  api.resetState();
}

});

/* 66. A-04 存储 v2 + 楼层 updatedAt + 统一 LWW ---------------------------------- */
await section("66. A-04 存储 v2 + 楼层 updatedAt + 统一 LWW", async () => {
{
  /* 66.1 schema v2 与 v1 兼容读取 */
  eq('存储-当前 schema v2', api.SCHEMA, 'offline-drawing-annotation/v2');
  ok('存储-v1 可读', api.isReadableSchema(api.SCHEMA_V1));
  ok('存储-v2 可读', api.isReadableSchema(api.SCHEMA));
  ok('存储-未知版本拒绝', !api.isReadableSchema('offline-drawing-annotation/v0'));
  const fresh=api.createInitialState();
  ok('存储-初始楼层带 ISO 时间', Number.isFinite(Date.parse(fresh.floors[0].updatedAt||'')));

  /* 66.2 v1 迁移：升级 schema，保留/补空楼层时间 */
  const m1=api.migrateProject({schema:api.SCHEMA_V1,floors:[{id:'floor.default',name:'1F'}]});
  eq('迁移-v1 升级为 v2', m1.schema, api.SCHEMA);
  eq('迁移-旧档缺失楼层时间置空', m1.floors[0].updatedAt, '');
  const m2=api.migrateProject({schema:api.SCHEMA_V1,floors:[{id:'floor.default',name:'1F',updatedAt:'2026-01-01T00:00:00.000Z'}]});
  eq('迁移-已有楼层时间保留', m2.floors[0].updatedAt, '2026-01-01T00:00:00.000Z');

  /* 66.3 touchFloor：所有 commit 路径统一写楼层时间 */
  api.resetState();
  api.state.floors[0].updatedAt='2000-01-01T00:00:00.000Z';
  const touched=api.touchFloor();
  ok('楼层时间-返回 ISO', Number.isFinite(Date.parse(touched)));
  ok('楼层时间-覆盖旧值', api.state.floors[0].updatedAt!=='2000-01-01T00:00:00.000Z');
  api.state.floors[0].updatedAt='2000-01-01T00:00:00.000Z';
  api.commitChange();
  ok('楼层时间-commitChange 统一写入', api.state.floors[0].updatedAt!=='2000-01-01T00:00:00.000Z');
  eq('楼层时间-保存快照保留', api.persistableState().floors[0].updatedAt, api.state.floors[0].updatedAt);

  /* 66.4 合并 LWW：楼层名/时间取较新一方，且输出不丢 updatedAt */
  const mkProj=(upd,name)=>({schema:api.SCHEMA,meta:{updatedAt:'2026-01-01T00:00:00.000Z'},activeFloorId:'f1',objects:[],
    floors:[{id:'f1',name,updatedAt:upd}]});
  const merged=api.mergeProjectData(mkProj('2026-01-01T00:00:00.000Z','A层'),mkProj('2026-02-01T00:00:00.000Z','B层')).project;
  eq('合并-楼层名取较新', merged.floors[0].name, 'B层');
  eq('合并-楼层时间保留较新', merged.floors[0].updatedAt, '2026-02-01T00:00:00.000Z');

  /* 66.5 旧档入站时间补齐：楼层与对象都按空串，避免旧文件覆盖本地 */
  const blank={floors:[{id:'f1',objects:[{}]}]};
  api.mergeBlankMissingTimestamps(blank);
  eq('合并-旧档楼层时间置空', blank.floors[0].updatedAt, '');
  eq('合并-旧档对象时间置空', blank.floors[0].objects[0].updatedAt, '');
  api.resetState();
}

});

/* 67. 变更提交协议 markDirty：清覆盖率/落盘/广播按 kind 差异化 --------------- */
await section("67. 变更提交协议 markDirty：清覆盖率/落盘/广播按 kind 差异化", async () => {
{
  api.resetState();
  const realSave=api.scheduleSave;
  const realBroadcast=api.collabOnLocalChange;
  let saves=0, broadcasts=0;
  api.scheduleSave=()=>{saves++;};
  api.collabOnLocalChange=()=>{broadcasts++;};

  api.coverageResult={stale:true};
  api.markDirty('object');
  eq('markDirty-object 落盘一次', saves, 1);
  ok('markDirty-object 清覆盖率', api.coverageResult===null);
  eq('markDirty-object 广播一次', broadcasts, 1);

  api.coverageResult={stale:true};
  api.markDirty('objectEdit');
  eq('markDirty-objectEdit 落盘累加', saves, 2);
  eq('markDirty-objectEdit 广播累加', broadcasts, 2);

  api.markDirty('clear');
  eq('markDirty-clear 落盘', saves, 3);
  eq('markDirty-clear 不广播（保持既有行为）', broadcasts, 2);

  api.markDirty('floor');
  eq('markDirty-floor 落盘', saves, 4);
  eq('markDirty-floor 不广播', broadcasts, 2);

  api.markDirty('restore');
  eq('markDirty-restore 落盘', saves, 5);
  eq('markDirty-restore 广播', broadcasts, 3);

  api.markDirty('unknown');
  eq('markDirty-未知 kind 回退 object 并广播', broadcasts, 4);
  eq('markDirty-profile 表冻结', Object.isFrozen(api.MARK_DIRTY_PROFILES), true);
  eq('markDirty-profile objectEdit UI', api.MARK_DIRTY_PROFILES.objectEdit.ui, 'lists');

  /* commitChange/commitObjectEdit 必须走同一协议 */
  api.resetState();
  api.state.objects=[api.baseObject('point','point.marker',{x:1,y:2})];
  const before=saves;
  api.commitChange();
  eq('commitChange 统一落盘一次', saves, before+1);
  ok('commitChange 清覆盖率', api.coverageResult===null);
  api.commitObjectEdit();
  eq('commitObjectEdit 统一落盘一次', saves, before+2);
  ok('commitObjectEdit 清覆盖率', api.coverageResult===null);

  api.scheduleSave=realSave;
  api.collabOnLocalChange=realBroadcast;
  api.coverageResult=null;
  api.resetState();
}

});

/* 68. 交互提交判定 dragChanged / cancelActiveDrag：单击不写保存、不留空快照 --------------- */
await section("68. 交互提交判定 dragChanged / cancelActiveDrag：单击不写保存、不留空快照", async () => {
{
  api.resetState();
  const realSave=api.scheduleSave;
  let saves=0;
  api.scheduleSave=()=>{saves++;};

  const clone=o=>JSON.parse(JSON.stringify(o));
  const mkPoint=(x,y)=>{ const o=api.baseObject('point','point.marker',{x,y}); api.state.objects=[o]; return o; };

  /* 8.1 move：只有 updatedAt 变化不算改动；位置变化才算 */
  let o=mkPoint(1,2), orig=clone(o);
  api.setDrag({type:'move',start:[1,2],originals:new Map([[o.id,orig]]),moved:false});
  eq('dragChanged-move 单击未移动', api.dragChanged(api.drag), false);
  o.updatedAt='2026-01-01T00:00:00.000Z';
  eq('dragChanged-move 仅 updatedAt 变化仍判未改', api.dragChanged(api.drag), false);
  o.x=5;
  eq('dragChanged-move 位置变化', api.dragChanged(api.drag), true);
  o.x=1; o.updatedAt='2026-01-01T00:00:01.000Z';
  eq('dragChanged-move 拖回原位（updatedAt 不同）', api.dragChanged(api.drag), false);
  api.setDrag(null);

  /* 8.2 手柄拖拽：几何不变/变化 */
  o=mkPoint(1,2), orig=clone(o);
  api.setDrag({type:'node',id:o.id,handle:{index:0},original:orig});
  eq('dragChanged-node 未改', api.dragChanged(api.drag), false);
  o.points=[[9,9]]; o.updatedAt='2026-01-01T00:00:02.000Z';
  eq('dragChanged-node 改点', true===api.dragChanged(api.drag), true);
  api.setDrag(null);

  /* 8.3 场地形状深比较 */
  api.state.site={id:'site',shape:{type:'rect',x:0,y:0,width:10,height:10}};
  api.setDrag({type:'siteHandle',handle:{},originalShape:clone(api.state.site.shape)});
  eq('dragChanged-siteHandle 未改', api.dragChanged(api.drag), false);
  api.state.site.shape.width=12;
  eq('dragChanged-siteHandle 改宽', api.dragChanged(api.drag), true);
  api.setDrag(null);

  /* 8.4 图片变换：transform 深比较 */
  api.state.background={kind:'image',transform:[0,0,0,1,1,0]};
  api.setDrag({type:'imageHandle',origin:[0,0,0,1,1,0],moved:true});
  eq('dragChanged-imageHandle 未改', api.dragChanged(api.drag), false);
  api.state.background.transform=[3,4,0,1,1,0];
  eq('dragChanged-imageHandle 已改', api.dragChanged(api.drag), true);
  api.setDrag(null);

  /* 8.5 cancelActiveDrag：未移动不压栈/不落盘；已移动回滚并弹快照 */
  o=mkPoint(1,2), orig=clone(o);
  api.history.past=[];
  api.setDrag({type:'move',start:[1,2],originals:new Map([[o.id,orig]]),moved:false});
  const before=saves;
  api.cancelActiveDrag();
  eq('cancelActiveDrag 未移动不落盘', saves, before);
  eq('cancelActiveDrag 未移动不动历史', api.history.past.length, 0);

  o=mkPoint(1,2), orig=clone(o);
  api.history.past=[{label:'drag'}];
  api.setDrag({type:'move',start:[1,2],originals:new Map([[o.id,orig]]),moved:true});
  o.x=9;
  api.cancelActiveDrag();
  eq('cancelActiveDrag 已移动回滚位置', o.x, 1);
  eq('cancelActiveDrag 已移动弹出快照', api.history.past.length, 0);
  eq('cancelActiveDrag 已移动只落盘一次（恢复后的状态）', saves, 1);

  api.scheduleSave=realSave;
  api.setDrag(null);
  api.state.site=null;
  api.resetState();
}

});

/* 69. A-08 转义与场地样式白名单 ------------------------------------------------------------ */
await section("69. A-08 转义与场地样式白名单", async () => {
{
  eq('xmlEscape 转义五类字符', api.xmlEscape(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
  eq('xmlEscape 空值', api.xmlEscape(null), '');
  const style=api.sanitizeSiteStyle({fill:'#abc',stroke:'rgb(1,2,3)',fillAlpha:2,strokeWidth:0,evil:'x'});
  eq('sanitizeSiteStyle 保留合法 fill', style.fill, '#abc');
  eq('sanitizeSiteStyle 保留合法 stroke', style.stroke, 'rgb(1,2,3)');
  eq('sanitizeSiteStyle 透明度夹紧', style.fillAlpha, 1);
  eq('sanitizeSiteStyle 线宽下限', style.strokeWidth, .01);
  eq('sanitizeSiteStyle 丢弃未知键', 'evil' in style, false);
  const bad=api.sanitizeSiteStyle({fill:'"><script>',stroke:'url(x)'});
  eq('sanitizeSiteStyle 丢弃属性注入 fill', 'fill' in bad, false);
  eq('sanitizeSiteStyle 丢弃 url() stroke', 'stroke' in bad, false);

  /* 防御纵深：即使运行时样式绕过清洗（插件直接写 state.site.style），SVG 也不得出现原始引号/尖括号 */
  api.state.site={id:'S',kind:'rect',name:'s',layerId:'layer.default',visible:true,locked:false,
    style:{fill:'"><x',stroke:'red'},shape:{type:'rect',x:0,y:0,width:10,height:10},annot:{},updatedAt:''};
  const svg=api.buildSceneSvg();
  ok('SVG 场地 fill 已转义', svg.includes('fill="&quot;&gt;&lt;x"'));
  ok('SVG 不包含原始注入串', !svg.includes('"><x'));
  api.state.site=null;

  eq('modalBody 默认转义插值', api.modalBody(['<b>','</b>'],'<x>'), '<b>&lt;x&gt;</b>');
  eq('modalBody safeHTML 保留片段', api.modalBody(['<div>','</div>'], api.safeHTML('<i>ok</i>')), '<div><i>ok</i></div>');
}

});

/* 70. A-09 导入限值与事务化原语 ------------------------------------------------------------- */
await section("70. A-09 导入限值与事务化原语", async () => {
{
  eq('APP_LIMITS 已冻结', Object.isFrozen(api.APP_LIMITS), true);
  eq('APP_LIMITS 历史栈上限', api.APP_LIMITS.HISTORY_MAX, 20);
  eq('importLimitErrors 全通过', api.importLimitErrors({bytes:1,chars:1,rows:1,entities:1,objects:1,pixels:1}), []);
  const L=api.APP_LIMITS;
  eq('importLimitErrors 逐项识别',
    api.importLimitErrors({bytes:L.IMPORT_FILE_MAX_BYTES+1,chars:L.IMPORT_TEXT_MAX_CHARS+1,
      rows:L.IMPORT_ROWS_MAX+1,entities:L.IMPORT_ENTITIES_MAX+1,objects:L.OBJECTS_MAX+1,
      pixels:L.BG_MAX_DECODE_PIXELS+1}),
    ['file','text','rows','entities','objects','pixels']);
  eq('importLimitMessage 中文提示', api.importLimitMessage(['file','objects']), '文件过大、对象数量过多');

  eq('countProjectObjects 顶层+非活动楼层',
    api.countProjectObjects({activeFloorId:'f1',objects:[{},{}],
      floors:[{id:'f1',objects:[{},{}]},{id:'f2',objects:[{},{},{}]}]}), 5);

  api.resetState();
  const kept=api.state.meta.name;
  const built=api.buildProject({schema:'offline-drawing-annotation/v1',meta:{name:'BUILT'}});
  ok('buildProject 不修改当前 state', api.state.meta.name===kept);
  eq('buildProject 返回候选工程', built.meta.name, 'BUILT');
  eq('migrateProject 仍替换当前 state', api.migrateProject({schema:'offline-drawing-annotation/v1',meta:{name:'MIG'}}).meta.name, 'MIG');
  api.resetState();
}

});

/* 71. A-11 墓碑按对象 id 保留 + 增量淘汰（离线旧端合并不复活） ------------------------ */
await section("71. A-11 墓碑按对象 id 保留 + 增量淘汰（离线旧端合并不复活）", async () => {
{
  const L = api.APP_LIMITS;
  eq('A-11 墓碑硬上限 2 万', L.TOMBSTONE_MAX, 20000);
  eq('A-11 增量淘汰批量', L.TOMBSTONE_EVICT_BATCH, 2000);
  eq('A-11 保留窗口 730 天', L.TOMBSTONE_RETENTION_DAYS, 730);

  const NOW = Date.parse('2026-11-06T00:00:00.000Z');
  const RECENT = '2026-10-01T01:00:00.000Z';
  const EXPIRED = '2023-01-01T00:00:00.000Z';

  /* 旧实现按 deletedAt 倒序截断到 2000：5000 条会被砍掉，最早的删除丢失 → 旧端复活 */
  const many = Array.from({ length: 5000 }, (_, i) => ({ id: 'D' + i, kind: 'object', deletedAt: RECENT }));
  const kept = api.sanitizeTombstones(many, NOW);
  eq('A-11 未超上限按 id 全量保留', kept.length, 5000);
  ok('A-11 最早的删除仍在', kept.some(t => t.id === 'D0'));

  const mixed = api.sanitizeTombstones([
    { id: 'OLD', kind: 'object', deletedAt: EXPIRED },
    { id: 'NEW', kind: 'object', deletedAt: RECENT }
  ], NOW);
  eq('A-11 仅超保留窗口的旧墓碑被淘汰', mixed.map(t => t.id).join(','), 'NEW');

  const huge = api.sanitizeTombstones(
    Array.from({ length: L.TOMBSTONE_MAX + 100 }, (_, i) => ({ id: 'H' + i, kind: 'object', deletedAt: RECENT })), NOW);
  eq('A-11 超硬上限才截断', huge.length, L.TOMBSTONE_MAX);

  /* 增量淘汰：攒够一批才压缩一次，单次删除不触发全量排序 */
  api.resetState();
  api.state.tombstones = Array.from({ length: L.TOMBSTONE_MAX + L.TOMBSTONE_EVICT_BATCH - 1 },
    (_, i) => ({ id: 'S' + i, kind: 'object', deletedAt: RECENT }));
  api.markTombstone('S-NEW', 'object');
  eq('A-11 未攒够一批不压缩', api.state.tombstones.length, L.TOMBSTONE_MAX + L.TOMBSTONE_EVICT_BATCH);
  api.markTombstone('S-NEW2', 'object');
  eq('A-11 攒够一批压缩回硬上限', api.state.tombstones.length, L.TOMBSTONE_MAX);
  ok('A-11 压缩后保留最新删除', api.state.tombstones.some(t => t.id === 'S-NEW2'));

  /* 离线旧端：本地删了 3000 个对象（超过旧上限 2000），旧端仍持有全部对象 */
  const objs = Array.from({ length: 3000 }, (_, i) => ({
    id: 'G' + i, name: 'G' + i, kind: 'point', typeId: 'point.marker', layerId: 'layer.default',
    x: i, y: 0, points: [], width: 0, height: 0, angle: 0, phys: 0, iconSize: 1,
    style: {}, props: {}, annot: {}, visible: true, locked: false, z: i,
    createdAt: RECENT, updatedAt: RECENT
  }));
  const base = extra => Object.assign({
    schema: 'offline-drawing-annotation/v1', meta: { name: '离线工程', updatedAt: RECENT },
    settings: {}, background: { kind: 'empty' }, viewport: { zoom: 1, panX: 0, panY: 0 },
    layers: [{ id: 'layer.default', name: '默认图层' }], objectTypes: [],
    objects: [], floors: [{ id: 'floor.default', name: '1F', updatedAt: RECENT }],
    activeFloorId: 'floor.default', tombstones: []
  }, extra);
  const localRaw = base({
    tombstones: Array.from({ length: 3000 }, (_, i) => ({ id: 'G' + i, kind: 'object', deletedAt: '2026-10-02T00:00:00.000Z' }))
  });
  /* 清洗是加载/保存必经环节：旧实现这里会砍到 2000 条 */
  localRaw.tombstones = api.sanitizeTombstones(localRaw.tombstones, NOW);
  const res = api.mergeProjectData(localRaw, base({ objects: objs }));
  eq('A-11 旧端 3000 个已删对象全部被压制', (res.project.objects || []).length, 0);
  ok('A-11 合并后墓碑仍保留可继续传播', (res.project.tombstones || []).some(t => t.id === 'G0'));
  eq('A-11 远端被墓碑删除计入统计', res.stats.deleted, 3000);
  api.resetState();
}

});

/* 72. A-15 公共抽象：outlineOf golden / objectIndexById / siteBounds 唯一源 / ensureVendor */
await section("72. A-15 公共抽象：outlineOf golden / objectIndexById / siteBounds 唯一源 / ensureVendor", async () => {
{
  api.resetState();
  const push=(kind,typeId,patch)=>api.state.objects.push(api.baseObject(kind,typeId,patch));
  push('rect','rect.area',{id:'A15_RECT',name:'R',x:3,y:3,width:8,height:5,angle:0});
  push('rect','rect.area',{id:'A15_CIRCLE',name:'C',x:20,y:3,width:0,height:0,shape:{type:'circle',r:4}});
  push('rect','rect.area',{id:'A15_PARA',name:'P',x:30,y:3,width:6,height:4,shape:{type:'parallelogram',skew:25}});
  push('line','line.boundary',{id:'A15_LINE',name:'L',points:[[2,2],[10,2],[10,8]]});
  push('dimension','dimension.distance',{id:'A15_DIM',name:'D',points:[[3,11],[13,11]],subtype:'distance'});
  push('point','point.camera',{id:'A15_CAM',name:'K',x:7,y:13});
  push('text','text.label',{id:'A15_TXT',name:'T',x:14,y:13,text:'X'});
  const O=api.state.objects, rectO=O[0];
  /* golden 基线（替换前捕获）：区域 4 顶点、顺序左上→右上→右下→左下；圆按 SHAPE_SEGMENTS=72 采样 */
  eq('A-15 区域轮廓顶点数', api.outlineOf(rectO).length, 4);
  eq('A-15 区域轮廓坐标', JSON.stringify(api.outlineOf(rectO)), JSON.stringify([[3,3],[11,3],[11,8],[3,8]]));
  eq('A-15 圆轮廓采样数', api.outlineOf(O[1]).length, 72);
  eq('A-15 折线轮廓顶点数', api.outlineOf(O[3]).length, 3);
  eq('A-15 标注轮廓顶点数', api.outlineOf(O[4]).length, 2);
  eq('A-15 点/文字无轮廓', api.outlineOf(O[5]).length+api.outlineOf(O[6]).length, 0);
  const oc=api.outlineOf(O[3]); oc[0][0]=999;
  eq('A-15 轮廓返回副本不污染对象', O[3].points[0][0], 2);

  /* golden：SVG 区域 polygon 4 个坐标对、折线/标注 polyline 3/2 个坐标对（与替换前一致） */
  const svg=api.buildSceneSvg();
  const poly=svg.match(/<polygon points="([^"]+)"/);
  eq('A-15 SVG 区域顶点数', poly?poly[1].trim().split(/\s+/).length:0, 4);
  const pls=[...svg.matchAll(/<polyline points="([^"]+)"/g)].map(m=>m[1].trim().split(/\s+/).length);
  eq('A-15 SVG 折线/标注顶点数', JSON.stringify(pls), JSON.stringify([3,2]));

  /* golden：DXF 实体序列与顶点数（新增纯函数 dxfEntitiesForExport 后可断言，不触发下载）
     注：resetState 默认带 100×70 矩形场地，其 SITE LWPOLYLINE 恒排在对象之前 */
  const dx=api.dxfEntitiesForExport();
  eq('A-15 DXF 实体序列', dx.entities.map(e=>e.type).join(','), 'LWPOLYLINE,LWPOLYLINE,CIRCLE,LWPOLYLINE,LWPOLYLINE,LWPOLYLINE,TEXT,POINT,TEXT');
  eq('A-15 DXF 顶点数（场地/区域/平行四边形/折线/标注）',
    dx.entities.filter(e=>e.type==='LWPOLYLINE').map(e=>e.points.length).join(','), '4,4,4,3,2');
  eq('A-15 DXF 与 outlineOf 顶点一致', JSON.stringify(dx.entities[1].points), JSON.stringify(api.outlineOf(rectO)));

  /* siteBounds 唯一源：域尺寸直接取自包围盒；旋转椭圆不再固定 2rx×2ry */
  api.state.site={id:'site.a15',name:'S',kind:'polygon',visible:true,locked:false,annot:{},style:{},
    shape:{type:'polygon',points:[[-5,-3],[15,2],[8,20]]}};
  const sb=api.siteBounds(api.state.site), sd=api.siteDomainOf(api.state.site);
  eq('A-15 场地域尺寸取自 siteBounds', JSON.stringify(sd), JSON.stringify({w:sb.w,h:sb.h}));
  const ell={id:'site.e15',name:'E',kind:'ellipse',visible:true,locked:false,annot:{},style:{},
    shape:{type:'ellipse',cx:0,cy:0,rx:10,ry:2,angle:90}};
  eq('A-15 旋转椭圆域宽=2·ry', api.siteDomainOf(ell).w, 4);
  eq('A-15 旋转椭圆域高=2·rx', api.siteDomainOf(ell).h, 20);

  /* ensureVendor：已加载模块原样返回；缺失/未知给出可读中文错误 */
  ok('A-15 ensureVendor 返回已加载模块', api.ensureVendor('Dxf')===api.Dxf);
  let vmsg='';
  try{ api.ensureVendor('NotAVendor'); }catch(e){ vmsg=e.message; }
  eq('A-15 ensureVendor 缺失中文提示', vmsg, '公共模块未加载：NotAVendor');
  let dmsg='';
  try{ api.ensureVendor('__idcuNotExists'); }catch(e){ dmsg=e.message; }
  ok('A-15 ensureVendor 未知模块含名称', dmsg.includes('__idcuNotExists'));

  /* objectIndexById：一次建索引替代多次 find；重复 id 以首个为准 */
  api.resetState();
  api.state.objects.push(
    api.baseObject('point','point.marker',{id:'IDX_A'}),
    api.baseObject('point','point.marker',{id:'IDX_B'})
  );
  const idx=api.objectIndexById();
  eq('A-15 索引命中', idx.get('IDX_A')===api.state.objects[0], true);
  eq('A-15 索引大小', idx.size, 2);
  eq('A-15 索引缺失返回 undefined', idx.get('NOPE'), undefined);
  api.resetState();
}

});

/* 73. B-04 版本快照：独立命名空间、照片引用化、A/B 差异分类与误报 --------------- */
await section("73. B-04 版本快照：独立命名空间、照片引用化、A/B 差异分类与误报", async () => {
{
  eq('B-04 快照命名空间独立', api.snapshotKey('PRJ4321','SNAP1'), 'snap:PRJ4321:SNAP1');
  eq('B-04 快照键解析', api.snapshotIdOfKey('snap:PRJ4321:SNAP1'), 'SNAP1');
  eq('B-04 快照条数上限', api.APP_LIMITS.SNAPSHOT_MAX_PER_PROJECT, 20);
  eq('B-04 快照字节上限 16MB', api.APP_LIMITS.SNAPSHOT_MAX_BYTES_PER_PROJECT, 16*1048576);
  eq('B-04 utf8 体积', api.utf8Length('快照'), 6);

  /* 快照数据：剥离照片 base64、保留 photoId；深拷贝不回写当前 state */
  api.resetState();
  api.state.meta.projectId='PRJ_B04';
  const p=api.baseObject('point','point.marker',{id:'PH1',name:'PH1',x:1,y:1});
  p.props={photoDataUrl:'data:image/png;base64,AAAA',photoId:'as_photo_1'};
  api.state.objects=[p];
  const snapData=await api.snapshotProjectData();
  eq('B-04 快照剥离 photoDataUrl', 'photoDataUrl' in (snapData.objects[0].props||{}), false);
  eq('B-04 快照保留 photoId 引用', snapData.objects[0].props.photoId, 'as_photo_1');
  eq('B-04 快照深拷贝不回写当前状态', api.state.objects[0].props.photoDataUrl, 'data:image/png;base64,AAAA');
  eq('B-04 快照对象总数', api.countProjectObjects(snapData), 1);

  /* 资产保活：快照记录是 {meta,data} 外壳，必须解包 data 才能收集资产引用 */
  const snapRec={meta:{snapshotId:'S1'},data:{
    background:{assetId:'bg_top'},
    objects:[{props:{photoId:'as_top_photo'}},{props:{}}],
    floors:[{id:'f2',background:{assetId:'bg_floor'},objects:[{props:{photoId:'as_floor_photo'}}]}]
  }};
  eq('B-04 快照记录资产引用解包', api.snapshotAssetRefs(snapRec).slice().sort(), ['as_floor_photo','as_top_photo','bg_floor','bg_top'].sort());
  eq('B-04 裸 collectAssetRefs 不识别外壳（必须解包）', api.ContentAssets.collectAssetRefs(snapRec), []);
  const keepSet=api.unionAssetRefs(new Map([['snapshot:P:S1',api.snapshotAssetRefs(snapRec)]]));
  ok('B-04 快照命名空间纳入可达并集', ['bg_top','as_top_photo','bg_floor','as_floor_photo'].every(id=>keepSet.includes(id)));

  /* 构造样本：20 个未变对象 + 新增/删除/属性修改/移动/换楼层/类型变更各 1 条 */
  const NOW='2026-01-01T00:00:00.000Z';
  const ob=(id,patch)=>Object.assign({
    id, name:id, kind:'point', typeId:'point.marker', layerId:'layer.default',
    x:0, y:0, points:[], width:0, height:0, angle:0, phys:0, iconSize:1,
    style:{}, props:{}, annot:{}, visible:true, locked:false, z:0, createdAt:NOW, updatedAt:NOW
  }, patch||{});
  const unchanged=Array.from({length:20},(_,i)=>ob('U'+i));
  const removedObj=ob('E_REMOVE');
  const modifiedA=ob('E_MODIFY',{name:'改属性-旧'});
  const moveA=ob('E_MOVE',{x:0,y:5});
  const typeA=ob('E_TYPE',{typeId:'point.marker'});
  const floorObj=ob('E_FLOOR',{x:30,y:30});
  const A={
    activeFloorId:'floor.1', objects:[].concat(unchanged,[removedObj,modifiedA,moveA,typeA,floorObj]),
    floors:[{id:'floor.1',name:'1F',updatedAt:NOW},{id:'floor.2',name:'F2',updatedAt:NOW,objects:[]}]
  };
  const modifiedB=ob('E_MODIFY',{name:'改属性-新'});
  const moveB=ob('E_MOVE',{x:12,y:5});
  const typeB=ob('E_TYPE',{typeId:'point.camera'});
  const addedObj=ob('E_ADDED',{name:'新增'});
  /* 未变对象同步改运行时字段（updatedAt/z/photoDataUrl）：必须被忽略，不产生差异 */
  const unchangedB=unchanged.map((o,i)=>i===0?Object.assign({},o,{
    updatedAt:'2026-02-01T00:00:00.000Z', z:99, props:{photoDataUrl:'data:image/png;base64,BBBB'}
  }):o);
  const B={
    activeFloorId:'floor.1', objects:[].concat(unchangedB,[modifiedB,moveB,typeB,addedObj]),
    floors:[{id:'floor.1',name:'1F',updatedAt:NOW},{id:'floor.2',name:'F2',updatedAt:NOW,objects:[floorObj]}]
  };
  const diff=api.diffSnapshots(A,B);
  eq('B-04 差异总数', diff.counts.total, 6);
  eq('B-04 分类-新增', diff.counts.added, 1);
  eq('B-04 分类-删除', diff.counts.removed, 1);
  eq('B-04 分类-属性修改', diff.counts.modified, 1);
  eq('B-04 分类-移动', diff.counts.moved, 1);
  eq('B-04 分类-换楼层', diff.counts.floorChanged, 1);
  eq('B-04 分类-类型变更', diff.counts.typeChanged, 1);
  eq('B-04 未变对象数', diff.unchanged, 20);
  const byId=Object.fromEntries(diff.items.map(it=>[it.id,it]));
  eq('B-04 新增对象归类', byId.E_ADDED && byId.E_ADDED.category, 'added');
  eq('B-04 删除对象归类', byId.E_REMOVE && byId.E_REMOVE.category, 'removed');
  eq('B-04 属性修改归类', byId.E_MODIFY && byId.E_MODIFY.category, 'modified');
  eq('B-04 移动归类', byId.E_MOVE && byId.E_MOVE.category, 'moved');
  eq('B-04 换楼层归类', byId.E_FLOOR && byId.E_FLOOR.category, 'floorChanged');
  eq('B-04 类型变更归类', byId.E_TYPE && byId.E_TYPE.category, 'typeChanged');
  eq('B-04 属性修改字段', byId.E_MODIFY.fields, ['name']);
  eq('B-04 移动字段', byId.E_MOVE.fields, ['x']);
  eq('B-04 类型变更字段', byId.E_TYPE.fields, ['typeId']);
  eq('B-04 换楼层字段', byId.E_FLOOR.fields, ['floorId']);
  eq('B-04 换楼层来源/目标', [byId.E_FLOOR.aFloorId,byId.E_FLOOR.bFloorId], ['floor.1','floor.2']);
  eq('B-04 新增对象可读字段', api.diffFieldLabel('typeId')+'='+api.diffValueText(byId.E_ADDED.b.typeId), '类型=point.marker');
  /* 误报统计（构造样本）：20 个未变对象中 0 个被判为差异；6 条变更全部命中正确分类 */
  const falsePositives=diff.items.filter(it=>it.id.startsWith('U')).length;
  eq('B-04 构造样本误报数', falsePositives, 0);
  eq('B-04 构造样本误报率(%)', falsePositives/20*100, 0);
  eq('B-04 构造样本分类准确率', diff.items.filter(it=>['E_ADDED','E_REMOVE','E_MODIFY','E_MOVE','E_FLOOR','E_TYPE'].includes(it.id)).length, 6);
  eq('B-04 忽略运行时字段', api.DIFF_IGNORE_KEYS.includes('updatedAt')&&api.DIFF_IGNORE_KEYS.includes('photoDataUrl')&&api.DIFF_IGNORE_KEYS.includes('z'), true);
  eq('B-04 移动字段集合', api.DIFF_MOVE_KEYS.includes('x')&&api.DIFF_MOVE_KEYS.includes('points')&&api.DIFF_MOVE_KEYS.includes('shape'), true);

  /* 跨楼层索引：同一活动楼层用顶层 objects，其余楼层用 f.objects */
  const idx=api.snapshotObjectIndex(B);
  eq('B-04 跨楼层索引总数', idx.size, 25);
  eq('B-04 跨楼层索引楼层', idx.get('E_FLOOR').floorId, 'floor.2');

  /* 叠加态：开启/关闭，关闭后不残留条目 */
  api.setDiffOverlay(true,diff.items,{aId:'A1',bId:'B1'});
  eq('B-04 叠加开启', api.diffOverlay.on, true);
  eq('B-04 叠加条目', api.diffOverlay.items.length, 6);
  eq('B-04 叠加 A/B 标记', [api.diffOverlay.aId,api.diffOverlay.bId], ['A1','B1']);
  api.clearDiffOverlay();
  eq('B-04 叠加关闭后条目清空', [api.diffOverlay.on,api.diffOverlay.items.length], [false,0]);

  /* N-21：场景级差异——场地顶点/底图/楼层名必须可见，且排在对象差异之后 */
  const S1={site:{name:'S',shape:{type:'rect',w:100,h:50,points:[[0,0],[100,0],[100,50],[0,50]]}},background:{type:'blank'},floors:[{id:'f1',name:'1F'}]};
  const S2={site:{name:'S',shape:{type:'rect',w:100,h:50,points:[[0,0],[100,0],[100,60],[0,50]]}},background:{type:'image',assetId:'bg_new'},floors:[{id:'f1',name:'一层'}]};
  const sd=api.diffSnapshots(S1,S2);
  const scene=Object.fromEntries(sd.items.filter(it=>it.scope==='scene').map(it=>[it.id,it]));
  eq('N-21-场景差异总数', sd.counts.total, 3);
  eq('N-21-场地顶点变化归为移动', scene['scene:site']&&scene['scene:site'].category, 'moved');
  eq('N-21-场地变化字段', scene['scene:site']&&scene['scene:site'].fields, ['siteShape']);
  eq('N-21-底图变化归为属性修改', scene['scene:background']&&scene['scene:background'].category, 'modified');
  eq('N-21-楼层名变化归为属性修改', scene['scene:floor:f1']&&scene['scene:floor:f1'].category, 'modified');
  eq('N-21-楼层名变化字段', scene['scene:floor:f1']&&scene['scene:floor:f1'].fields, ['floorName']);
  eq('N-21-场景新增/删除', [api.diffSnapshots({},{site:{name:'S'}}).counts.added, api.diffSnapshots({site:{name:'S'}},{}).counts.removed], [1,1]);
  const ord=api.diffSnapshots(
    {objects:[{id:'O',kind:'point',typeId:'point.marker',x:0,y:0}],site:{shape:{type:'rect'}}},
    {objects:[{id:'O',kind:'point',typeId:'point.marker',x:9,y:0}],site:{shape:{type:'circle'}}});
  eq('N-21-对象差异在前场景在后', [ord.items[0].scope||'object', ord.items[ord.items.length-1].scope], ['object','scene']);
  eq('N-21-场景项不计入未变对象', sd.unchanged, 0);

  /* RT-P1-09：图层名与类型表结构变化必须单独成场景项，分类沿用对象优先级（新增>删除>…>属性修改） */
  const L1={layers:[{id:'L1',name:'结构'},{id:'L3',name:'旧名'},{id:'L5',name:'仅A层'}],
    objectTypes:[{id:'t.a',name:'A'},{id:'t.b',name:'B'},{id:'t.c',name:'C'}]};
  const L2={layers:[{id:'L1',name:'结构'},{id:'L3',name:'新名'},{id:'L4',name:'仅B层'}],
    objectTypes:[{id:'t.a',name:'A'},{id:'t.b',name:'B2'},{id:'t.d',name:'D'}]};
  const ld=api.diffSnapshots(L1,L2);
  const ls=Object.fromEntries(ld.items.map(it=>[it.id,it]));
  eq('RT-P1-09 场景差异总数', ld.counts.total, 6);
  eq('RT-P1-09 新增/删除/修改计数', [ld.counts.added,ld.counts.removed,ld.counts.modified], [2,2,2]);
  eq('RT-P1-09 图层新增', ls['scene:layer:L4']&&ls['scene:layer:L4'].category, 'added');
  eq('RT-P1-09 图层删除', ls['scene:layer:L5']&&ls['scene:layer:L5'].category, 'removed');
  eq('RT-P1-09 图层改名', ls['scene:layer:L3']&&[ls['scene:layer:L3'].category,ls['scene:layer:L3'].fields.join()], ['modified','layerName']);
  eq('RT-P1-09 未变图层不报', !!ls['scene:layer:L1'], false);
  eq('RT-P1-09 类型新增', ls['scene:type:t.d']&&ls['scene:type:t.d'].category, 'added');
  eq('RT-P1-09 类型删除', ls['scene:type:t.c']&&ls['scene:type:t.c'].category, 'removed');
  eq('RT-P1-09 类型定义变更', ls['scene:type:t.b']&&[ls['scene:type:t.b'].category,ls['scene:type:t.b'].fields.join()], ['modified','typeDef']);
  eq('RT-P1-09 未变类型不报', !!ls['scene:type:t.a'], false);
  eq('RT-P1-09 字段可读名', [api.diffFieldLabel('layerName'),api.diffFieldLabel('typeDef')], ['图层名','类型定义']);
  eq('RT-P1-09 场景项仍后置', ld.items[0]&&ld.items[0].scope, 'scene');
  /* 旧快照没有 objectTypes：缺表是 schema 差异，不当作整表新增，避免全量误报 */
  const legacy=api.diffSnapshots({layers:[{id:'L1',name:'x'}]},
    {layers:[{id:'L1',name:'x'}],objectTypes:[{id:'t.a',name:'A'}]});
  eq('RT-P1-09 旧快照缺类型表不误报', legacy.counts.total, 0);

  /* N-21：元数据索引只读 meta；数量/字节淘汰至少保留 1 条（临时内存 IDB 桩） */
  const store=new Map();
  const prevIdb={get:sandbox.idbGetKey,put:sandbox.idbPutKey,del:sandbox.idbDeleteKey,keys:sandbox.idbAllKeys};
  sandbox.idbGetKey=async k=>store.get(k);
  sandbox.idbPutKey=async(k,v)=>{store.set(k,v);};
  sandbox.idbDeleteKey=async k=>{store.delete(k);};
  sandbox.idbAllKeys=async()=>Array.from(store.keys());
  const PID='PRJ_N21';
  for(let i=0;i<21;i++){
    const meta={snapshotId:'SNAP-'+i,projectId:PID,createdAt:new Date(2026,0,1,0,i).toISOString(),bytes:1024,objectCount:1};
    store.set(api.snapshotKey(PID,meta.snapshotId),{meta,data:{schema:'1',objects:[]}});
  }
  eq('N-21-淘汰后数量', await api.pruneSnapshots(PID), 20);
  eq('N-21-淘汰最旧', store.has(api.snapshotKey(PID,'SNAP-0')), false);
  eq('N-21-保留最新', store.has(api.snapshotKey(PID,'SNAP-20')), true);
  ok('N-21-索引已写入', store.has(api.snapshotIndexKey(PID)));
  const listed=await api.listSnapshots(PID);
  eq('N-21-列表 20 条', listed.length, 20);
  eq('N-21-列表新到旧', listed[0].snapshotId, 'SNAP-20');
  store.delete(api.snapshotIndexKey(PID));
  ok('N-21-索引缺失时回退重建', (await api.snapshotIndexLoad(PID)).length===20&&store.has(api.snapshotIndexKey(PID)));
  store.clear();
  for(let i=0;i<3;i++){
    const meta={snapshotId:'BIG-'+i,projectId:PID,createdAt:new Date(2026,0,1,0,i).toISOString(),bytes:15*1048576,objectCount:1};
    store.set(api.snapshotKey(PID,meta.snapshotId),{meta,data:{schema:'1',objects:[]}});
  }
  eq('N-21-字节超限只留 1 条', await api.pruneSnapshots(PID), 1);
  eq('N-21-字节超限保留最新', Array.from(store.keys()).filter(k=>k.startsWith('snap:'+PID+':')), [api.snapshotKey(PID,'BIG-2')]);
  const prevGet=sandbox.getSnapshot;
  sandbox.getSnapshot=async()=>({data:{schema:'1',objects:[]},meta:{projectId:'OTHER',projectName:'X'}});
  let denied='';
  try{ await api.restoreSnapshotById(PID,'BIG-2'); }catch(e){ denied=e.message; }
  ok('N-21-跨工程快照恢复被拒', /不属于当前工程/.test(denied));
  sandbox.getSnapshot=async()=>({data:{objects:[]},meta:{projectName:'X'}});
  let noSchema='';
  try{ await api.restoreSnapshotById(PID,'BIG-2'); }catch(e){ noSchema=e.message; }
  sandbox.getSnapshot=prevGet;
  ok('N-21-缺少 schema 快照恢复被拒', /缺少 schema/.test(noSchema));
  sandbox.idbGetKey=prevIdb.get; sandbox.idbPutKey=prevIdb.put;
  sandbox.idbDeleteKey=prevIdb.del; sandbox.idbAllKeys=prevIdb.keys;

  api.resetState();
}

});

/* 74. B-10 历史栈结构共享/增量：未变子树与 base64 字符串复用、物化隔离、普通条目兼容 --- */
await section("74. B-10 历史栈结构共享/增量：未变子树与 base64 字符串复用、物化隔离、普通条目兼容", async () => {
{
  api.resetState();
  const huge = 'data:image/png;base64,' + 'A'.repeat(1 << 20);   /* 1MB 内嵌照片 */
  const o1 = api.baseObject('point','point.marker',{id:'H1',name:'H1',x:1,y:1});
  o1.props = { photoDataUrl: huge };
  const o2 = api.baseObject('point','point.marker',{id:'H2',name:'H2',x:2,y:2});
  api.state.objects = [o1, o2];
  api.history.past = []; api.history.future = [];

  api.pushHistory();
  const s0 = api.history.past[0];
  eq('B-10 快照带不可枚举标记', api.isHistorySnapshot(s0), true);
  eq('B-10 标记不进入序列化', Object.keys(s0).includes('historySnapshot'), false);

  api.state.objects[1].x = 99;          /* 只改一个对象，其余应共享 */
  api.pushHistory();
  const s1 = api.history.past[1];
  eq('B-10 未变对象复用同一引用', s1.objects[0] === s0.objects[0], true);
  eq('B-10 照片 base64 复用同一字符串', s1.objects[0].props.photoDataUrl === huge, true);
  eq('B-10 变化对象未被共享', s1.objects[1] === s0.objects[1], false);
  eq('B-10 快照 JSON 仍是完整工程', JSON.stringify(s1.objects[1].x), '99');

  /* 物化：容器全部分离，字符串共享；live 编辑不污染共享快照 */
  const live = api.materializeHistoryState(s1);
  eq('B-10 物化后顶层容器分离', live !== s1 && live.objects !== s1.objects, true);
  eq('B-10 物化后对象容器分离', live.objects[0] !== s1.objects[0], true);
  eq('B-10 物化后 base64 仍共享', live.objects[0].props.photoDataUrl === huge, true);
  live.objects[1].x = 123456;
  eq('B-10 物化副本编辑不污染快照', s1.objects[1].x, 99);

  /* 普通条目（外部手工 push / 旧代码）原样返回，保持旧语义 */
  const plain = { objects: [], background: { assetId: 'A' } };
  eq('B-10 普通条目原样返回', api.materializeHistoryState(plain) === plain, true);
  eq('B-10 普通条目不是快照', api.isHistorySnapshot(plain), false);
  const snapPlain = api.snapshotHistoryState(plain, plain);
  eq('B-10 普通 prev 不被复用', snapPlain !== plain && snapPlain.objects !== plain.objects, true);

  eq('B-10 深比较相等', api.historyValueEqual({ a: [1, 2] }, { a: [1, 2] }), true);
  eq('B-10 深比较识别差异', api.historyValueEqual({ a: 1 }, { a: 2 }), false);

  /* A-01 资产可达集：历史快照形状不变，底图/照片引用仍被识别 */
  api.history.past = [{ background: { assetId: 'HIST_BG' }, objects: [{ props: { photoId: 'HIST_PHOTO' } }] }];
  api.history.future = [];
  const refs = api.reachableBgAssetIds();
  ok('B-10 历史资产仍在可达集', refs.includes('HIST_BG') && refs.includes('HIST_PHOTO'));

  api.resetState(); api.history.past = []; api.history.future = [];
}

});

/* 75. B-05 产品目录校验 / BOM 聚合 / 报价字段表与数值往返 ---------------- */
await section("75. B-05 产品目录校验 / BOM 聚合 / 报价字段表与数值往返", async () => {
{
  /* 75.1 合法目录规范化：去空白、缺省类别/单位、params 白名单 */
  const raw = { schema:'plotpin-catalog/v1', items:[
    { vendor:' 海康 ', model:'DS-2CD', price:'1200', params:{ 像素:'400万' } },
    { vendor:'大华', model:'DH-1', price:350, unit:'个', category:'摄像机' },
    { vendor:'西门子', model:'SM-9', price:900 }
  ] };
  const cat = api.catalogValidate(raw);
  eq('目录-schema 保留', cat.schema, api.CATALOG_SCHEMA);
  eq('目录-型号数', cat.items.length, 3);
  eq('目录-去空白+默认类别/单位', [cat.items[0].vendor, cat.items[0].category, cat.items[0].unit, cat.items[0].price], ['海康','其他','台',1200]);
  eq('目录-显式单位/类别保留', [cat.items[1].unit, cat.items[1].category], ['个','摄像机']);
  eq('目录-params 白名单保留', cat.items[0].params, { 像素:'400万' });

  /* 75.2 非法目录逐项拒绝（校验必须在写入前整体失败） */
  const bad = (r, part) => { try { api.catalogValidate(r); return false; } catch(e) { return String(e.message).includes(part); } };
  ok('目录-拒绝 schema 错误', bad({ schema:'x', items:[{ vendor:'A', model:'B', price:1 }] }, 'schema'));
  ok('目录-拒绝空 items', bad({ schema:'plotpin-catalog/v1', items:[] }, 'items'));
  ok('目录-拒绝超上限', bad({ schema:'plotpin-catalog/v1', items:Array.from({ length:2001 }, ()=>({ vendor:'A', model:'B', price:1 })) }, '上限'));
  ok('目录-拒绝厂商为空', bad({ schema:'plotpin-catalog/v1', items:[{ vendor:' ', model:'B', price:1 }] }, '厂商'));
  ok('目录-拒绝负单价', bad({ schema:'plotpin-catalog/v1', items:[{ vendor:'A', model:'B', price:-1 }] }, '单价'));
  ok('目录-拒绝非数单价', bad({ schema:'plotpin-catalog/v1', items:[{ vendor:'A', model:'B', price:'abc' }] }, '单价'));
  ok('目录-拒绝 params 非对象', bad({ schema:'plotpin-catalog/v1', items:[{ vendor:'A', model:'B', price:1, params:'x' }] }, 'params'));
  ok('目录-拒绝重复厂商+型号', bad({ schema:'plotpin-catalog/v1', items:[{ vendor:'A', model:'B', price:1 }, { vendor:'A', model:'B', price:2 }] }, '重复'));

  /* 75.3 BOM 跨楼层聚合：F1 两对象（A×3 + B×1），F2 一对象（C×2） */
  api.setCurrentCatalog(cat);
  const st = api.resetState();
  st.objects.push(
    api.baseObject('point','point.marker',{ name:'P1', x:1, y:1 }),
    api.baseObject('point','point.marker',{ name:'P2', x:2, y:2 })
  );
  st.objects[0].props = { vendor:'海康', model:'DS-2CD', qty:3 };
  st.objects[1].props = { vendor:'大华', model:'DH-1', qty:1 };
  const p3 = api.baseObject('point','point.marker',{ name:'P3', x:3, y:3 });
  p3.props = { vendor:'西门子', model:'SM-9', qty:2 };
  st.floors.push({ id:'f2', name:'F2', objects:[p3] });

  const table = api.quoteTable(cat);
  eq('报价-有目录表头', table[0], ['厂商','名称','数量','单价','小计']);
  eq('报价-行数(3型号+合计)', table.length, 5);
  const rowOf = m => table.slice(1,-1).find(r=>r[1]===m);
  const rA = rowOf('DS-2CD'), rB = rowOf('DH-1'), rC = rowOf('SM-9');
  eq('BOM-跨楼层数量(3+1/2)', [rA[2],rB[2],rC[2]], [3,1,2]);
  eq('BOM-A 单价/小计', [rA[3],rA[4]], [1200,3600]);
  eq('BOM-B 单价/小计', [rB[3],rB[4]], [350,350]);
  eq('BOM-C 单价/小计', [rC[3],rC[4]], [900,1800]);
  eq('BOM-数量合计6', table[4][2], 6);
  eq('BOM-金额合计5750', table[4][4], 5750);

  /* 75.4 CSV 写出后解析回来：数量/单价/小计数值完全一致 */
  const text = api.delimitedFromTable(table, ',');
  const parsed = api.DSV.parseRows(text, ',');
  const pA = parsed.find(r=>r[1]==='DS-2CD');
  eq('报价-CSV 数值往返', [Number(pA[2]),Number(pA[3]),Number(pA[4])], [3,1200,3600]);
  const pT = parsed[parsed.length-1];
  eq('报价-CSV 合计往返', [Number(pT[2]),Number(pT[4])], [6,5750]);

  /* 75.4b 目录版本指纹与报价快照（单价冻结 / 行集合变化才重新计价） */
  const ver1 = api.catalogVersion(cat);
  const ver2 = api.catalogVersion({ schema:'plotpin-catalog/v1', items:[{ vendor:'海康', model:'DS-2CD', price:1300 }] });
  ok('版本-稳定且非空', ver1 === api.catalogVersion(cat) && ver1 !== 'none');
  ok('版本-单价变化即变化', ver1 !== ver2);
  eq('版本-无目录为 none', api.catalogVersion(null), 'none');
  const snap = { v:1, cols:5, rows:table.map(r=>r.slice()), catalogVersion:ver1, exportedAt:'2026-01-01T00:00:00.000Z' };
  ok('快照-同签名命中', !!api.quoteSnapshotTable(table, snap));
  ok('快照-行数变化不命中', !api.quoteSnapshotTable(table.slice(0, 4), snap));
  const qtyChanged = api.quoteTable(cat).map(r=>r.slice());
  qtyChanged[1][2] = 9;
  ok('快照-数量变化不命中', !api.quoteSnapshotTable(qtyChanged, snap));
  const mtable = api.quoteMetaTable(table, { catalogVersion:ver1, exportedAt:'T' });
  eq('元数据-表头追加', mtable[0], ['厂商','名称','数量','单价','小计','目录版本','导出时间']);
  eq('元数据-数据行数值不变', [mtable[1][3], mtable[1][4], mtable[1][5], mtable[1][6]], [rA[3], rA[4], '', '']);
  eq('元数据-合计行记录版本/时间', [mtable[4][5], mtable[4][6]], [ver1, 'T']);

  /* 75.5 无目录降级：仅名称/数量，金额不臆造 */
  const t2 = api.quoteTable(null);
  eq('降级-表头仅名称数量', t2[0], ['名称','数量']);
  eq('降级-行数(3型号+合计)', t2.length, 5);
  eq('降级-合计行', t2[4], ['合计',6]);

  /* 75.6 公式注入：目录厂商写成 =SUM(A1) 时 CSV 单元格加前导单引号 */
  const evil = api.catalogValidate({ schema:'plotpin-catalog/v1', items:[{ vendor:'=SUM(A1)', model:'EVIL', price:10 }] });
  const pe = api.baseObject('point','point.marker',{ name:'PE', x:4, y:4 });
  pe.props = { vendor:'=SUM(A1)', model:'EVIL', qty:1 };
  st.objects.push(pe);
  const evilText = api.delimitedFromTable(api.quoteTable(evil), ',');
  ok('报价-CSV 公式防护', evilText.includes("'=SUM(A1)"));

  /* 75.7 跨厂商重名：未填厂商不得静默错绑；填厂商后按精确键计价 */
  const dup = api.catalogValidate({ schema:'plotpin-catalog/v1', items:[
    { vendor:'海康', model:'DUP-M', price:100 },
    { vendor:'大华', model:'DUP-M', price:80 }
  ] });
  const st2 = api.resetState();
  const od = api.baseObject('point','point.marker',{ name:'PD', x:5, y:5 });
  od.props = { model:'DUP-M', qty:2 };
  st2.objects.push(od);
  const t3 = api.quoteTable(dup);
  eq('重名-未填厂商不带价', [t3[1][0], t3[1][3], t3[1][4]], ['', '', '']);
  eq('重名-明确标记重复型号', api.quoteAggregate(dup).ambiguous, ['DUP-M']);
  od.props.vendor = '大华';
  const t4 = api.quoteTable(dup);
  eq('重名-填厂商后精确绑定', [t4[1][0], t4[1][3], t4[1][4]], ['大华', 80, 160]);
  api.setCurrentCatalog(null);
  api.resetState();
}

asyncSuites.push((async()=>{
  /* 75.8 事务回滚：校验失败/落盘失败都不能替换当前目录 */
  const oldCat = api.catalogValidate({ schema:'plotpin-catalog/v1', items:[{ vendor:'OLD', model:'OLD', price:5 }] });
  api.setCurrentCatalog(oldCat);
  let threw = false;
  try { await api.importCatalog({ schema:'plotpin-catalog/v1', items:[{ vendor:'A', model:'B', price:-1 }] }); }
  catch(_) { threw = true; }
  ok('回滚-校验失败抛错', threw);
  eq('回滚-校验失败目录不变', api.currentCatalog.items[0].vendor, 'OLD');
  let threw2 = false;
  try { await api.importCatalog({ schema:'plotpin-catalog/v1', items:[{ vendor:'NEW', model:'N', price:1 }] }, async()=>{ throw new Error('磁盘失败'); }); }
  catch(_) { threw2 = true; }
  ok('回滚-落盘失败抛错', threw2);
  eq('回滚-落盘失败目录不变', api.currentCatalog.items[0].vendor, 'OLD');
  await api.importCatalog({ schema:'plotpin-catalog/v1', items:[{ vendor:'NEW', model:'N', price:1 }] }, async()=>{});
  eq('目录-成功导入替换', api.currentCatalog.items[0].vendor, 'NEW');

  /* 75.8b IO-P2-22：启动读取损坏目录须保留原因且不改写已载入目录；IDB 不可用不算损坏 */
  const prevLoadGet = sandbox.idbGetKey;
  sandbox.idbGetKey = async()=>({ schema:'wrong', items:[] });
  eq('载入-损坏记录返回旧目录', await api.catalogLoad(), api.currentCatalog);
  ok('载入-损坏记录给出原因', /schema/.test(api.catalogLoadError));
  eq('载入-损坏记录不污染目录', api.currentCatalog.items[0].vendor, 'NEW');
  sandbox.idbGetKey = async()=>({ schema:'plotpin-catalog/v1', items:[] });
  await api.catalogLoad();
  ok('载入-校验失败同样给原因', /items/.test(api.catalogLoadError));
  eq('载入-校验失败仍不污染目录', api.currentCatalog.items[0].vendor, 'NEW');
  sandbox.idbGetKey = async()=>null;
  eq('载入-空记录不改目录', await api.catalogLoad(), api.currentCatalog);
  eq('载入-空记录清除原因', api.catalogLoadError, '');
  sandbox.idbGetKey = async()=>{ throw new Error('idb down'); };
  await api.catalogLoad();
  eq('载入-IDB 不可用不改目录', api.currentCatalog.items[0].vendor, 'NEW');
  eq('载入-IDB 不可用不误报损坏', api.catalogLoadError, '');
  sandbox.idbGetKey = prevLoadGet;

  /* 75.9 XLSX 数值往返：同一 quoteTable → Xlsx.build → Xlsx.readRows */
  const cat = api.catalogValidate({ schema:'plotpin-catalog/v1', items:[{ vendor:'海康', model:'DS-2CD', price:1200 }] });
  api.setCurrentCatalog(cat);
  const st = api.resetState();
  const o = api.baseObject('point','point.marker',{ name:'X1', x:0, y:0 });
  o.props = { vendor:'海康', model:'DS-2CD', qty:3 };
  st.objects.push(o);
  const table = api.quoteTable(cat);
  const rows = await api.Xlsx.readRows(api.Xlsx.build(table, '产品报价'));
  eq('XLSX-行数一致', rows.length, table.length);
  eq('XLSX-表头一致', rows[0], table[0]);
  const iQty = table[0].indexOf('数量'), iPrice = table[0].indexOf('单价'), iAmt = table[0].indexOf('小计');
  eq('XLSX-数量往返', String(rows[1][iQty]), String(table[1][iQty]));
  eq('XLSX-单价往返', String(rows[1][iPrice]), String(table[1][iPrice]));
  eq('XLSX-小计往返', String(rows[1][iAmt]), String(table[1][iAmt]));
  eq('XLSX-合计往返', [String(rows[2][iQty]),String(rows[2][iAmt])], [String(table[2][iQty]),String(table[2][iAmt])]);
  api.setCurrentCatalog(null);
  api.resetState();
})());

});

/* 75.10 B-07 图框/标题栏：默认模板、旧档降级、持久化、导出叠加与默认不变 --- */
await section("75.10 B-07 图框/标题栏：默认模板、旧档降级、持久化、导出叠加与默认不变", async () => {
{
  api.resetState();
  const d = api.createTitleBlock();
  eq('B-07 默认关闭', d.enabled, false);
  eq('B-07 默认子项', [d.frame, d.scaleBar, d.legend], [true, true, true]);
  eq('B-07 默认版本', d.fields.version, 'V1.0');
  eq('B-07 默认比例留空', d.fields.scale, '');
  const legacy = api.normalizeTitleBlock({ fields: { projectName: '旧工程', drawingNo: 'A-01' } });
  eq('B-07 旧档降级关闭', legacy.enabled, false);
  eq('B-07 旧档保留字段', [legacy.fields.projectName, legacy.fields.drawingNo], ['旧工程', 'A-01']);
  eq('B-07 旧档补默认', [legacy.fields.version, legacy.frame, legacy.scaleBar, legacy.legend], ['V1.0', true, true, true]);
  const dirty = api.normalizeTitleBlock({ enabled: true, fields: { projectName: '\u0000A\nB' + 'x'.repeat(100) } });
  eq('B-07 控制字符清洗', /\u0000|\n/.test(dirty.fields.projectName), false);
  eq('B-07 超长截断', dirty.fields.projectName.length, api.TITLE_BLOCK_TEXT_MAX);
  /* 持久化：buildProject 归一 titleBlock；缺字段旧档不报错、按默认降级 */
  const built = api.buildProject({ schema: api.SCHEMA, meta: { name: 'TB', titleBlock: { enabled: true,
    fields: { projectName: 'P', drawingNo: 'D-1', scale: '1:100', date: '2026-11-06', version: 'V2', designer: '设计甲', checker: '审核乙', unitName: '某单位' } } }, objects: [] });
  eq('B-07 持久化启用', built.meta.titleBlock.enabled, true);
  eq('B-07 持久化字段', built.meta.titleBlock.fields.scale, '1:100');
  const builtOld = api.buildProject({ schema: api.SCHEMA, meta: { name: 'OLD' }, objects: [] });
  eq('B-07 旧档 buildProject 默认降级', builtOld.meta.titleBlock.enabled, false);
  /* 默认（未启用）不改变既有 SVG 导出 */
  eq('B-07 默认 SVG 不叠加图例', api.buildSceneSvg().includes('图例'), false);
  eq('B-07 默认 spec 为 null', api.titleBlockSpec(1200, 800, 10, 'png'), null);
  eq('B-07 默认叠加 SVG 为空', api.exportTitleBlockSvg(null), '');
  /* 启用后：8 字段 / 自动比例 / 比例尺取整齐长度 / SVG 统一转义 */
  api.state.meta.titleBlock = api.normalizeTitleBlock({ enabled: true,
    fields: { projectName: 'P<&>"', scale: '', date: '2026-11-06' } });
  const spec = api.titleBlockSpec(1200, 800, 10, 'png');
  ok('B-07 启用后 spec 存在', !!spec);
  eq('B-07 8 字段单元', spec.block.cells.length, 8);
  eq('B-07 自动比例', spec.block.cells.find(c => c.key === 'scale').value, '1:378');
  ok('B-07 比例尺存在', !!spec.scaleBar);
  eq('B-07 比例尺整齐长度', [spec.scaleBar.meters, Math.round(spec.scaleBar.w)], [10, 100]);
  eq('B-07 比例尺 1:N (96dpi)', api.titleBlockRatio(10, 'png'), 378);
  eq('B-07 比例尺 1:N (150dpi PDF)', api.titleBlockRatio(10, 'pdf'), 591);
  const svgTB = api.exportTitleBlockSvg(spec);
  ok('B-07 SVG 转义注入面', !svgTB.includes('<script>') && svgTB.includes('&lt;') && svgTB.includes('&amp;'));
  const svgOn = api.buildSceneSvg();
  ok('B-07 启用后 SVG 叠加标题栏', svgOn.includes('>图例<') && svgOn.includes('工程名'));
  api.resetState();
}

});

/* 75.11 B-14 i18n 插值模板：中文语义不变、英文整句命中、缺参回退、转义边界 --- */
await section("75.11 B-14 i18n 插值模板：中文语义不变、英文整句命中、缺参回退、转义边界", async () => {
{
  const I = api.I18N;
  const orig = I.lang;
  I.setLang('zh');
  eq('B-14 中文模板插值', I.p('已粘贴 {n} 个对象', { n: 3 }), '已粘贴 3 个对象');
  eq('B-14 中文模板多参数', I.p('表格导入完成：更新 {updated} 项，替换 {replaced} 个对象，新增 {created} 项',
    { updated: 3, replaced: 2, created: 5 }), '表格导入完成：更新 3 项，替换 2 个对象，新增 5 项');
  eq('B-14 中文报告页脚', I.p('共 {n} 个对象 · 第 {page} / {total} 页 · {time}',
    { n: 10, page: 2, total: 5, time: 'T' }), '共 10 个对象 · 第 2 / 5 页 · T');
  eq('B-14 中文无占位短语', I.p('已保存'), '已保存');
  I.setLang('en');
  eq('B-14 英文模板插值', I.p('已粘贴 {n} 个对象', { n: 3 }), 'Pasted 3 objects');
  eq('B-14 英文 DXF 整句', I.p('DXF 已导入：{line} 线 / {rect} 圆 / {point} 点 / {text} 文字{extra}',
    { line: 2, rect: 1, point: 3, text: 4, extra: '' }), 'DXF imported: 2 lines / 1 circles / 3 points / 4 texts');
  eq('B-14 英文表格导入整句', I.p('表格导入完成：更新 {updated} 项，替换 {replaced} 个对象，新增 {created} 项',
    { updated: 3, replaced: 2, created: 5 }), 'Table import complete: 3 updated, 2 replaced, 5 created');
  eq('B-14 英文导出页脚', I.p('共 {n} 个对象 · 第 {page} / {total} 页 · {time}',
    { n: 10, page: 2, total: 5, time: 'T' }), 'Objects: 10 · Page 2 / 5 · T');
  eq('B-14 未知中文回退', I.p('未收录的中文'), '未收录的中文');
  eq('B-14 缺参数保留占位', I.p('已粘贴 {n} 个对象', {}), 'Pasted {n} objects');
  eq('B-14 模板不走 HTML 转义', I.fmt('{x}', { x: '<img>' }), '<img>');
  eq('B-14 DOM 边界统一转义', api.esc(I.p('已导入 SVG 图元：{name}', { name: '<img>' })), 'SVG symbol imported: &lt;img&gt;');
  ok('B-14 模板键不进短语表', Object.keys(I.templates).every(k => I.phrases[k] === undefined));
  I.setLang(orig);
}

});

/* ---------------- D-01 首次引导与示例工程 ---------------- */
await section("D-01 首次引导与示例工程", async () => {
{
  const demo = api.buildDemoProject();
  eq('D-01 示例对象数', demo.objects.length, 6);
  eq('D-01 示例对象类型分布', demo.objects.map(o => o.kind).sort().join(','), 'dimension,line,point,point,rect,text');
  eq('D-01 场地尺寸', JSON.stringify(demo.site.shape), JSON.stringify({ type: 'rect', x: 0, y: 0, w: 100, h: 70 }));
  eq('D-01 图片槽为空', demo.background.kind, 'empty');
  eq('D-01 不引用图片资产', demo.background.assetId, '');

  const mem = v => ({ getItem: () => v, setItem: (_, x) => { v = x; } });
  const fresh = mem(null);
  eq('D-01 无工程且无记录时展示', api.firstRunGuideState(false, fresh).shouldShow, true);
  eq('D-01 老工程不展示', api.firstRunGuideState(true, fresh).shouldShow, false);
  api.markFirstRunGuide('completed', 'blank', fresh);
  eq('D-01 完成态抑制引导', api.firstRunGuideState(false, fresh).shouldShow, false);
  eq('D-01 记录版本', JSON.parse(fresh.getItem()).v, 1);
  eq('D-01 记录状态', JSON.parse(fresh.getItem()).status, 'completed');

  const skipped = mem(null);
  api.markFirstRunGuide('skipped', 'later', skipped);
  eq('D-01 跳过不抑制引导', api.firstRunGuideState(false, skipped).shouldShow, true);
  eq('D-01 跳过仍老工程不展示', api.firstRunGuideState(true, skipped).shouldShow, false);
  eq('D-01 损坏记录按未完成', api.firstRunGuideState(false, mem('{bad')).shouldShow, true);
  eq('D-01 未知版本按未完成', api.firstRunGuideState(false, mem('{"v":2,"status":"completed"}')).shouldShow, true);

  eq('D-01 空默认工程不算老工程', api.savedProjectHasContent(api.createInitialState()), false);
  eq('D-01 有对象算老工程', api.savedProjectHasContent({ meta: {}, objects: [{}] }), true);
  eq('D-01 绑定工程算老工程', api.savedProjectHasContent({ meta: { projectId: 'PRJ1' }, objects: [] }), true);
  eq('D-01 图片底图算老工程', api.savedProjectHasContent({ meta: {}, objects: [], background: { kind: 'image' } }), true);
}

});

/* ---------------- D-07 加载完整性审计与资产状态区分 ---------------- */
await section("D-07 加载完整性审计与资产状态区分", async () => {
{
  const v2='offline-drawing-annotation/v2';
  const base={schema:v2,floors:[{id:'F1'}],activeFloorId:'F1',objects:[],layers:[{id:'L1'}],
    background:{kind:'empty'},site:{shape:{type:'rect',w:100,h:70}}};
  eq('D-07 正常工程 ok', api.auditProject(base).level, 'ok');
  const broken=api.auditProject('{"schema":"'+v2+'","objects":[');
  eq('D-07 非法 JSON 为 error', broken.level, 'error');
  ok('D-07 非法 JSON 原因', broken.errors[0].includes('损坏'));
  eq('D-07 非对象为 error', api.auditProject('"x"').level, 'error');
  eq('D-07 schema 不可读为 error', api.auditProject(Object.assign({},base,{schema:'x'})).level, 'error');
  eq('D-07 楼层结构损坏为 error', api.auditProject(Object.assign({},base,{floors:'x'})).level, 'error');
  eq('D-07 对象列表损坏为 error', api.auditProject(Object.assign({},base,{objects:'x'})).level, 'error');
  const noFloor=api.auditProject(Object.assign({},base,{floors:[],activeFloorId:''}));
  eq('D-07 楼层为空为 warn', noFloor.level, 'warn');
  ok('D-07 楼层为空原因', noFloor.warnings.some(w=>w.includes('楼层为空')));
  ok('D-07 活动楼层缺失告警',
    api.auditProject(Object.assign({},base,{activeFloorId:'NOPE'})).warnings.some(w=>w.includes('活动楼层')));
  const dup=api.auditProject(Object.assign({},base,{objects:[{id:'A',layer:'L1'},{id:'A',layer:'L1'}]}));
  ok('D-07 重复对象 id 告警', dup.warnings.some(w=>w.includes('重复')));
  const badLayer=api.auditProject(Object.assign({},base,{objects:[{id:'A',layer:'LX'}]}));
  ok('D-07 未知图层告警', badLayer.warnings.some(w=>w.includes('未知图层')));
  const noAsset=api.auditProject(Object.assign({},base,{background:{kind:'image',assetId:'',dataUrl:''}}));
  ok('D-07 底图资产缺失只告警', noAsset.level==='warn'&&noAsset.warnings.some(w=>w.includes('资产缺失')));
  ok('D-07 场地结构损坏告警',
    api.auditProject(Object.assign({},base,{site:'x'})).warnings.some(w=>w.includes('场地')));
  const miss=api.calibPrecheck('calibrate',{background:{kind:'image',assetId:'a1'},site:null,imageReady:false,imageState:'missing'});
  ok('D-07 资产缺失与解码中区分', !miss.ok&&miss.assetMissing===true&&miss.reason.includes('资产缺失'));
  const dec=api.calibPrecheck('calibrate',{background:{kind:'image',assetId:'a1'},site:null,imageReady:false,imageState:'decoding'});
  ok('D-07 解码中提示不误报缺失', !dec.ok&&!dec.assetMissing&&dec.reason.includes('解码'));
}

});

/* ---------------- D-08 保存失败分类与有限退避 ---------------- */
await section("D-08 保存失败分类与有限退避", async () => {
{
  api.resetSaveHealth();
  eq('D-08 配额错误分类', api.classifySaveError({name:'QuotaExceededError'}), 'quota');
  eq('D-08 IDB 不可用分类', api.classifySaveError(new Error('IndexedDB unavailable')), 'idb');
  eq('D-08 瞬时 IO 分类', api.classifySaveError(new Error('disk write failed')), 'io');
  eq('D-08 配额不重试', api.reportSaveFailure({name:'QuotaExceededError'},'idb'), 0);
  eq('D-08 配额重试计数 0', api.saveHealth.retry, 0);
  eq('D-08 配额错误码', api.saveHealth.errorCode, 'quota');
  api.resetSaveHealth();
  eq('D-08 首次退避 1s', api.reportSaveFailure(new Error('x'),'idb'), 1000);
  eq('D-08 第二次退避 3s', api.reportSaveFailure(new Error('x'),'idb'), 3000);
  eq('D-08 第三次退避 9s', api.reportSaveFailure(new Error('x'),'idb'), 9000);
  eq('D-08 三次后停止', api.reportSaveFailure(new Error('x'),'idb'), 0);
  eq('D-08 重试上限 3', api.saveHealth.retry, 3);
  eq('D-08 瞬时最终状态 failed', api.saveHealth.state, 'failed');
  api.resetSaveHealth();
}

});

/* ---------------- D-09 多标签同工程编辑租约（假时钟） ---------------- */
await section("D-09 多标签同工程编辑租约（假时钟）", async () => {
{
  const prevId=api.state.meta.projectId, P='D09-P';
  api.state.meta.projectId=P;
  api.acquireEditorLease();
  api.leaseSyncProject(1000);
  eq('D-09 心跳 5s / 租约 15s', [api.LEASE_HEARTBEAT_MS,api.LEASE_TTL_MS], [5000,15000]);
  eq('D-09 同工程新鲜心跳视为冲突',
    api.leaseIngest({type:'lease',tabId:'PEER1',projectId:P,ts:1000},1000), true);
  api.leaseIngest({type:'release',tabId:'PEER1'},1000);
  eq('D-09 不同工程互不触发',
    api.leaseIngest({type:'lease',tabId:'PEER2',projectId:'OTHER',ts:1000},1000), false);
  api.leaseIngest({type:'lease',tabId:'PEER3',projectId:P,ts:1000},1000);
  eq('D-09 心跳超过 15s 失效', api.leaseConflictAt(16000), false);
  api.leaseIngest({type:'release',tabId:'PEER3'},16000);
  api.leaseIngest({type:'lease',tabId:'PEER4',projectId:P,ts:20000},20000);
  eq('D-09 确认后取得租约并解除冲突',
    api.leaseClaim(20000)&&api.leaseStatus().confirmed&&!api.leaseStatus().conflict, true);
  api.releaseEditorLease();
  api.state.meta.projectId=prevId;
}

});

/* ---------------- D-03 帮助中心：三页签与 i18n ---------------- */
await section("D-03 帮助中心：三页签与 i18n", async () => {
{
  const orig = api.I18N.lang;
  api.I18N.setLang('zh');
  eq('D-03 快捷键保留 20 行', api.helpShortcutRows().length, 20);
  const tabs = api.helpTabDefs();
  eq('D-03 帮助页签数', tabs.length, 3);
  eq('D-03 页签顺序', tabs.map(t => t.label).join('|'), '快捷键|概念词典|导出检查清单');
  const gloss = api.helpGlossaryRows();
  eq('D-03 概念词典 6 条', gloss.length, 6);
  eq('D-03 概念词典主题', gloss.map(r => r[0]).join('|'), '图片底图|矢量场地|楼层|比例尺|仿射|覆盖率口径');
  const exp = api.helpExportRows();
  eq('D-03 导出清单 8 种', exp.length, 8);
  eq('D-03 导出格式顺序', exp.map(r => r[0]).join('|'),
    'JSON 工程|PNG 高清图|SVG 矢量图|PDF 矢量（图纸+清单）|DXF（CAD 互通）|CSV 表格|TSV 表格|Excel (.xlsx)');
  ok('D-03 导出清单标注 PDF 位图页', exp.some(r => r[1].includes('位图页')));
  ok('D-03 导出清单标注 DXF SITE 图层', exp.some(r => r[1].includes('SITE 图层')));
  ok('D-03 导出清单标注表格公式防护',
    exp.filter(r => r[0].includes('表格') || r[0].includes('Excel')).every(r => r[1].includes('公式')));
  const keys = ['帮助中心', ...tabs.map(t => t.label), ...gloss.flat(), ...exp.flat()];
  const missing = keys.filter(k => api.I18N.phrases[k] === undefined);
  ok('D-03 新增文案 100% 入字典', missing.length === 0);
  api.I18N.setLang('en');
  eq('D-03 英文页签', api.helpTabDefs().map(t => t.label).join('|'), 'Keyboard shortcuts|Glossary|Export checklist');
  eq('D-03 英文概念词典首条', api.helpGlossaryRows()[0][0], 'Image base map');
  ok('D-03 英文导出清单无中文回退', api.helpExportRows().every(r => !/[\u4e00-\u9fff]/.test(r[0] + r[1])));
  api.I18N.setLang(orig);
}

});

/* N-26 导出 golden：CSV/TSV/XLSX/GeoJSON 逐字节锁基线 ----------------------
 * 与既有 SVG/DXF/PDF golden 同口径：固定场景 → 纯序列化函数 → 逐字节比对。
 * XLSX 为 ZIP 容器（stored），先断言同一输入两次构建字节一致，再比 golden。
 * PNG 由浏览器 Canvas 编码，不锁字节；在 e2e 做尺寸/签名语义 golden（tests/golden/plain-scene.png.meta.json）。 */
await section("N-26 导出 golden：CSV/TSV/XLSX/GeoJSON 逐字节基线", async () => {
{
  const goldenRoot = join(root, 'tests', 'golden');
  function fixture() {
    api.resetState();
    api.state.meta.name = 'N-26 导出基线';
    api.state.site = { id: 'site.golden', name: '基准场地', layerId: 'layer.default', visible: true, locked: false, annot: {}, style: {}, updatedAt: '', kind: 'rect', shape: { type: 'rect', x: 0, y: 0, w: 100, h: 80 } };
    api.state.background = { kind: 'empty', fileName: '', assetId: '', width: 0, height: 0, origin: [0, 0], metersPerPixel: 0.1, calibrated: false, transform: null };
    api.state.objects = [
      api.baseObject('point', 'point.marker', { name: 'P1', x: 12, y: 14, angle: 30 }),
      api.baseObject('rect', 'rect.area', { name: 'R1', x: 30, y: 22, width: 18, height: 12, angle: 15 }),
      api.baseObject('line', 'line.boundary', { name: 'L1', points: [[55, 10], [72, 14], [68, 40]], closed: false })
    ];
    /* 台账含「更新时间」列：必须固定，否则 golden 每次运行都不同 */
    const fixed = '2026-01-01T00:00:00.000Z';
    api.state.site.updatedAt = fixed;
    for (const o of api.state.objects) o.updatedAt = fixed;
  }
  fixture();
  const csv = api.delimitedText(',');
  /* IO-P2-5：角度列与 X/Y 同精度（fmt），不再输出裸整数 */
  const csvRows = api.DSV.parseRows(csv.replace(/^\ufeff/, ''), ',');
  const angleIdx = csvRows[0].indexOf('角度');
  eq('角度列按精度格式化', csvRows.slice(1).map(r => r[angleIdx]).join('|'), '30.00|15.00|0.00');
  const tsv = api.delimitedText('\t');
  const xlsxTable = api.xlsxExportTable();
  const xlsx = api.Xlsx.build(xlsxTable, '图纸标注');
  const xlsxAgain = api.Xlsx.build(xlsxTable, '图纸标注');
  ok('N-26-XLSX 同输入两次构建字节一致', Buffer.compare(Buffer.from(xlsx), Buffer.from(xlsxAgain)) === 0);

  const cov = { targetCells: 4, gridCells: 4, spec: { version: 2 },
    regions: [{ id: 'R-01', name: 'R-01', minX: 0, minY: 0, nx: 2, ny: 2, cell: 1, grid: new Uint8Array([1, 1, 1, 0]) }] };
  const geo = JSON.stringify(api.buildBlindSpotGeoJson(cov), null, 2);

  const cases = [
    ['plain-scene.csv', Buffer.from(csv, 'utf8')],
    ['plain-scene.tsv', Buffer.from(tsv, 'utf8')],
    ['plain-scene.xlsx', Buffer.from(xlsx)],
    ['blindspots.geojson', Buffer.from(geo, 'utf8')]
  ];
  for (const [name, buf] of cases) {
    const p = join(goldenRoot, name);
    if (process.env.UPDATE_GOLDEN === '1') { writeFileSync(p, buf); continue; }
    eq('golden-' + name + ' 逐字节一致', Buffer.compare(buf, readFileSync(p)), 0);
  }

  /* 语义前置：golden 之外再锁关键口径，避免「字节一致但语义错」 */
  ok('N-26-CSV 含 BOM 且表头与 TABLE_COLUMNS 同源', csv.startsWith('\ufeff' + api.TABLE_COLUMNS.join(',')));
  ok('N-26-TSV 用制表符分隔且不含逗号表头', tsv.startsWith('\ufeff' + api.TABLE_COLUMNS.join('\t')));
  eq('N-26-GeoJSON 面数', JSON.parse(geo).features.length, 1);
  eq('N-26-GeoJSON 口径版本', JSON.parse(geo).coverageSpec.version, 2);
  api.resetState();
}
});

/* P2 表格真实往返：导出 → DSV 回读 → 规划 → 应用，锁列集/列序/取值 ---------- */
await section("P2 表格真实往返：列集/列序/取值一致", async () => {
{
  api.resetState();
  const p1 = api.baseObject('point', 'point.marker', { name: 'P1', x: 12, y: 14, angle: 30 });
  p1.text = '入口';
  const r1 = api.baseObject('rect', 'rect.area', { name: 'R1', x: 30, y: 22, width: 18, height: 12, angle: 15 });
  const l1 = api.baseObject('line', 'line.boundary', { name: 'L1', points: [[55, 10], [72, 14], [68, 40]], closed: false });
  api.state.objects = [p1, r1, l1];
  api.syncActiveFloor();
  const c1 = api.baseObject('rect', 'rect.area', { name: 'C1', x: 5, y: 6, shape: { type: 'circle', r: 3 }, width: 0, height: 0, angle: 0 });
  api.state.floors.push({ id: 'floor.F2', name: '2F', objects: [c1], background: api.state.background,
    viewport: { zoom: 1, panX: 0, panY: 0 } });

  const exported = api.objectRowsAll();
  const expected = exported.map(row => api.TABLE_COLUMNS.map(c => String(row[c] ?? '')));
  const rows = api.DSV.parseRows(api.delimitedText(',').replace(/^\ufeff/, ''), ',');
  eq('往返-列集列序与 TABLE_COLUMNS 一致', rows[0], api.TABLE_COLUMNS.slice());
  eq('往返-行数与对象数一致', rows.length - 1, exported.length);
  eq('往返-逐格取值一致', rows.slice(1), expected);

  const plan = api.rowsToObjectsPlan(rows);
  eq('往返-规划无错误', plan.errors.length, 0);
  eq('往返-全部命中更新', plan.updates.length, exported.length);
  api.applyTableImport(plan);
  const pAfter = api.state.objects.find(o => o.name === 'P1');
  const rAfter = api.state.objects.find(o => o.name === 'R1');
  const lAfter = api.state.objects.find(o => o.name === 'L1');
  const cAfter = api.state.floors.find(f => f.id === 'floor.F2').objects.find(o => o.name === 'C1');
  eq('往返-点几何不变', [pAfter.x, pAfter.y, pAfter.angle], [12, 14, 30]);
  eq('往返-矩形几何不变', [rAfter.x, rAfter.y, rAfter.width, rAfter.height, rAfter.angle], [30, 22, 18, 12, 15]);
  eq('往返-折线节点不变', lAfter.points, [[55, 10], [72, 14], [68, 40]]);
  eq('往返-圆半径不变', [cAfter.x, cAfter.y, cAfter.shape.r], [5, 6, 3]);
  api.resetState();
}
});

/* ---------------- P2 批次 3：DXF/PNG 一致性 ---------------- */
await section("P2-IO 批次 3：DXF/PNG 一致性", async () => {
{
  api.resetState();
  api.state.meta.name='批三工程';
  api.state.site={shape:{type:'rect',w:40,h:20}};
  const footer=api.exportFooterText();
  ok('IO-P2-14 页脚=工程名·场地描述', footer.startsWith('批三工程 · ')&&footer.includes('·'));
  ok('IO-P2-14 SVG 与 PNG 共用同一页脚表达式', api.buildSceneSvg().includes(footer.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')));

  /* IO-P2-15：图层表色取该层首个导出对象颜色，不再全部 #7c3aed */
  api.resetState();
  const dp=api.baseObject('point','point.marker',{name:'D1',x:1,y:1});
  dp.style.color='#ff0000';
  const dr=api.baseObject('rect','rect.area',{name:'D2',x:5,y:5,width:2,height:2});
  api.state.layers.push({id:'layer.empty',name:'空图层',visible:true,locked:false});
  api.state.objects=[dp,dr];
  api.syncActiveFloor();
  const dx=api.dxfEntitiesForExport();
  const dl=dx.layers.find(l=>l.name==='默认图层')||dx.layers[0];
  eq('IO-P2-15 图层表色=首个导出对象色', dl.color, '#ff0000');
  ok('IO-P2-15 实体自身颜色未被改写', dx.entities.some(e=>e.type==='POINT'&&e.color==='#ff0000'));
  eq('IO-P2-15 无对象图层回退默认色', (dx.layers.find(l=>l.name==='空图层')||{}).color, '#7c3aed');
  /* 场地 SITE 层颜色保持独立，不被首个业务对象覆盖 */
  api.state.site={id:'site.t3',name:'',layerId:'layer.default',visible:true,locked:false,annot:{},style:{},updatedAt:'',kind:'rect',shape:{type:'rect',x:0,y:0,w:40,h:20}};
  const dxSite=api.dxfEntitiesForExport();
  eq('IO-P2-15 SITE 层保持场地色', dxSite.layers.find(l=>l.name==='SITE').color, '#16a34a');

  /* IO-P2-16：用户层与保留层 SITE 重名时改名，场地层不被业务实体侵占 */
  api.resetState();
  api.state.layers[0].name='SITE';
  const sp=api.baseObject('point','point.marker',{name:'S1',x:1,y:1});
  api.state.objects=[sp];
  api.syncActiveFloor();
  api.state.site={id:'site.t4',name:'',layerId:'layer.default',visible:true,locked:false,annot:{},style:{},updatedAt:'',kind:'rect',shape:{type:'rect',x:0,y:0,w:40,h:20}};
  const dxs=api.dxfEntitiesForExport();
  eq('IO-P2-16 重名用户层改名 SITE_2', dxs.layers.filter(l=>l.name==='SITE_2').length, 1);
  eq('IO-P2-16 场地层 SITE 唯一', dxs.layers.filter(l=>l.name==='SITE').length, 1);
  ok('IO-P2-16 业务实体落在 SITE_2', dxs.entities.some(e=>e.layer==='SITE_2'&&e.type==='POINT'));
  ok('IO-P2-16 场地实体仍在 SITE', dxs.entities.some(e=>e.layer==='SITE'&&e.type==='LWPOLYLINE'));

  /* IO-P2-18：R12 凸度拉直属明确降级，导入预检必须标注段数，无凸度不得误报 */
  const fl=api.dxfFidelityLines({version:'AC1009',versionName:'R12',knownVersion:true,r12Bulge:2,supportedCount:5,blocks:0},null);
  ok('IO-P2-18 R12 凸度降级在预检文案', fl.some(l=>l.includes('R12 凸度')&&l.includes('2')));
  const fl0=api.dxfFidelityLines({version:'AC1009',versionName:'R12',knownVersion:true,r12Bulge:0,supportedCount:5,blocks:0},null);
  ok('IO-P2-18 无凸度不误报降级', !fl0.some(l=>l.includes('R12 凸度')));

  /* IO-P2-19：TEXT/ATTRIB 首尾空格原样保留（不得 trim 文本值） */
  const dxfSrc=['0','SECTION','2','HEADER','9','$ACADVER','1','AC1009','9','$INSUNITS','70','6','0','ENDSEC',
    '0','SECTION','2','ENTITIES',
    '0','TEXT','8','0','10','1','20','2','40','1','1','  门牌 A  ',
    '0','ATTRIB','8','0','10','3','20','4','40','1','1','  属性 B  ',
    '0','ENDSEC','0','EOF'].join('\n');
  const pT=api.Dxf.parseDxf(dxfSrc);
  const texts=pT.entities.filter(e=>e.type==='TEXT').map(e=>e.text);
  ok('IO-P2-19 TEXT 文本不 trim', texts.includes('  门牌 A  '));
  ok('IO-P2-19 ATTRIB 文本不 trim', texts.includes('  属性 B  '));
  const pp=api.Dxf.inspect(dxfSrc);
  ok('IO-P2-19 预检仍可识别版本', !!pp.version);

  /* IO-P2-26：单独 LF/控制字符也不得进入图层名（N-10 只覆盖 CRLF+Tab 组合） */
  eq('IO-P2-26 单独 LF 压成空格', api.dxfSanitizeName('X\nY'), 'X Y');
  eq('IO-P2-26 控制字符被剔除', /[\x00-\x1f]/.test(api.dxfSanitizeName('a\u0001b')), false);
}

});

/* ---------------- P2 批次 4：核心瞬态边界 ---------------- */
await section("P2-CORE 批次 4：核心瞬态边界", async () => {
{
  /* CORE-P2-2：超大场地 fitView 也必须夹到 ZOOM_MIN，且 pan/zoom 有限 */
  api.resetState();
  api.state.site={kind:'rect',layerId:'layer.default',visible:true,locked:false,shape:{type:'rect',x:0,y:0,w:1e9,h:1e9}};
  api.resetFrameRef(); api.fitView();
  eq('CORE-P2-2 超大场地缩放夹到 ZOOM_MIN', api.state.viewport.zoom, api.APP_LIMITS.ZOOM_MIN);
  ok('CORE-P2-2 缩放/平移均为有限值', [api.state.viewport.zoom,api.state.viewport.panX,api.state.viewport.panY].every(Number.isFinite));

  /* CORE-P2-7：椭圆→矩形保留旋转角；圆（角度无意义）仍归零 */
  api.resetState();
  const el=api.baseObject('rect','rect.area',{x:0,y:0,width:0,height:0,angle:30,shape:{type:'ellipse',rx:4,ry:2}});
  api.convertAreaShape(el,'rect');
  eq('CORE-P2-7 椭圆转矩形保留角度', el.angle, 30);
  ok('CORE-P2-7 椭圆转矩形尺寸=2rx×2ry', Math.abs(el.width-8)<1e-9&&Math.abs(el.height-4)<1e-9);
  const ci=api.baseObject('rect','rect.area',{x:0,y:0,width:0,height:0,angle:0,shape:{type:'circle',r:3}});
  api.convertAreaShape(ci,'rect'); eq('CORE-P2-7 圆转矩形角度为 0', ci.angle, 0);
  const pa=api.baseObject('rect','rect.area',{x:0,y:0,width:6,height:4,angle:25,shape:{type:'parallelogram',skew:12}});
  api.convertAreaShape(pa,'rect'); eq('CORE-P2-7 平行四边形转矩形保留角度', pa.angle, 25);

  /* CORE-P2-9：四类退出路径（中断 / 切层 / 撤销 / 失焦）逐一独立断言 */
  const seedTransients=()=>api.setTransient({
    draft:{kind:'line',points:[[0,0]]}, rubber:{x0:0,y0:0,x1:5,y1:5},
    trackLine:{from:[0,0],dir:[1,0]}, refEdge:{a:[0,0],b:[1,1]},
    osnapMode:'endpoint', affinePairs:[{u:0,v:0,x:0,y:0}], calibPoints:[[0,0],[10,0]],
    coverageResult:{probe:1}
  });
  const emptyInteraction=()=>{
    const t=api.transient;
    return t.draft===null&&t.rubber===null&&t.trackLine===null&&t.refEdge===null&&
      t.affinePairs.length===0&&t.osnapMode===null;
  };
  /* ① 中断（Esc）：交互瞬态全清，覆盖率叠加保留 */
  api.resetState(); seedTransients();
  eq('CORE-P2-9 中断返回 reset', api.escapeInterrupt(), 'reset');
  ok('CORE-P2-9 中断清空交互瞬态', emptyInteraction());
  ok('CORE-P2-9 中断保留覆盖率叠加', !!api.transient.coverageResult);
  eq('CORE-P2-9 中断清空校准草稿', api.transient.calibPoints.length, 0);
  /* ② 切层 */
  api.resetState();
  const floorInit=api.createInitialState();
  api.state.floors.push({id:'floor.P2C9',name:'P2C9',background:floorInit.background,objects:[],viewport:{zoom:1,panX:0,panY:0}});
  seedTransients();
  ok('CORE-P2-9 切层成功', await api.switchFloor('floor.P2C9'));
  ok('CORE-P2-9 切层清空交互瞬态', emptyInteraction());
  eq('CORE-P2-9 切层清空覆盖率', api.transient.coverageResult, null);
  /* ③ 撤销 */
  api.resetState(); api.pushHistory(); seedTransients();
  api.undo(); ok('CORE-P2-9 撤销清空交互瞬态', emptyInteraction());
  /* ④ 窗口失焦：只结束进行中的交互，校准点/覆盖率保留 */
  api.resetState(); seedTransients();
  api.handleWindowBlur();
  ok('CORE-P2-9 失焦清空交互瞬态', emptyInteraction());
  eq('CORE-P2-9 失焦保留校准点', api.transient.calibPoints.length, 2);
  ok('CORE-P2-9 失焦保留覆盖率叠加', !!api.transient.coverageResult);
  api.resetState();

  /* CORE-P2-10：快照回滚清空覆盖率/框选，但保留比例尺校准点 */
  api.resetState();
  api.state.meta.projectId='proj-p2c10';
  api.state.objects.push(api.baseObject('point','point.marker',{name:'S2',x:1,y:1}));
  api.syncActiveFloor();
  const snapRaw=api.persistableState();
  seedTransients();
  const prevGet=sandbox.getSnapshot;
  sandbox.getSnapshot=async()=>({data:JSON.parse(JSON.stringify(snapRaw)),meta:{projectName:'P2C10'}});
  ok('CORE-P2-10 快照回滚成功', await sandbox.restoreSnapshotById('proj-p2c10','snap-p2c10'));
  sandbox.getSnapshot=prevGet;
  eq('CORE-P2-10 回滚清空覆盖率', api.transient.coverageResult, null);
  eq('CORE-P2-10 回滚清空框选', api.transient.rubber, null);
  eq('CORE-P2-10 回滚清空仿射草稿', api.transient.affinePairs.length, 0);
  eq('CORE-P2-10 回滚保留校准点', api.transient.calibPoints.length, 2);
  api.resetState();

  /* CORE-P2-18：底图绘制抛错不再静默；置 error 且只提示一次 */
  const badBg={x:0,y:0,width:10,height:10,transform:null};
  const badDim={minX:0,minY:0,maxX:10,maxY:10,w:10,h:10};
  const badCtx={save(){},restore(){},transform(){},drawImage(){throw new Error('boom');},
    beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){}};
  let toastCount=0; const prevToast=sandbox.toast; sandbox.toast=()=>{ toastCount++; };
  api.setBgImage({width:10,height:10}); api.setBgDataUrl('data:image/png;base64,AA==');
  api.drawImageBackground(badCtx,{zoom:1,panX:0,panY:0},badDim,badBg);
  eq('CORE-P2-18 绘制失败置 error', api.bgImageState, 'error');
  eq('CORE-P2-18 首次失败提示一次', toastCount, 1);
  api.drawImageBackground(badCtx,{zoom:1,panX:0,panY:0},badDim,badBg);
  eq('CORE-P2-18 连续失败不刷屏', toastCount, 1);
  sandbox.toast=prevToast; api.setBgImage(null); api.setBgDataUrl(''); api.resetState();

  /* CORE-P2-19：清空覆盖率结果必须同步释放离屏图层缓存 */
  const covRes={regions:[{nx:2,ny:1,grid:[1,0]}]};
  const covLayers=api.buildCoverageLayers(covRes);
  eq('CORE-P2-19 离屏图层已构建', covLayers.length, 1);
  ok('CORE-P2-19 同结果命中缓存', api.buildCoverageLayers(covRes)===covLayers);
  eq('CORE-P2-19 清空前缓存驻留', api.coverageLayerCache()[0].length, 1);
  api.clearCoverageResult();
  eq('CORE-P2-19 清空结果置 null', api.transient.coverageResult, null);
  eq('CORE-P2-19 离屏缓存同步释放', api.coverageLayerCache()[0], null);
  eq('CORE-P2-19 缓存键同步释放', api.coverageLayerCache()[1], null);
  api.buildCoverageLayers(covRes);
  api.markDirty('object');
  eq('CORE-P2-19 变更路径同样释放缓存', api.coverageLayerCache()[0], null);
}

});

/* ---------------- P2 批次 5：核心 schema 与安全 ---------------- */
await section("P2-CORE 批次 5：schema 与安全", async () => {
{
  /* CORE-P2-1：启动设置只接受白名单键，__proto__ 不得污染，越界值按既有规则收敛 */
  const polluted=JSON.parse('{"__proto__":{"polluted":"yes"},"gridVisible":false,"segLabelMinPx":33,"precision":9,"lang":"en"}');
  const st=api.sanitizeSettings(polluted);
  eq('CORE-P2-1 __proto__ 不污染原型', ({}).polluted, undefined);
  eq('CORE-P2-1 gridVisible 白名单生效', st.gridVisible, false);
  eq('CORE-P2-1 segLabelMinPx 白名单生效', st.segLabelMinPx, 33);
  eq('CORE-P2-1 precision 上限夹取', st.precision, 6);
  eq('CORE-P2-1 lang 仅接受 zh/en', api.sanitizeSettings({lang:'xx'}).lang, 'zh');
  eq('CORE-P2-1 未知键不进入设置', 'evil' in api.sanitizeSettings({evil:1}), false);
  ok('CORE-P2-1 白名单覆盖全部默认设置键', api.SETTINGS_KEYS.includes('gridVisible')&&api.SETTINGS_KEYS.includes('segLabelMinPx')&&api.SETTINGS_KEYS.includes('precision'));
  const stored=api.settingsForStorage(Object.assign({},api.createInitialState().settings,{gridVisible:false,segLabelMinPx:30,evil:1}));
  eq('CORE-P2-1 存储视图含 gridVisible', stored.gridVisible, false);
  eq('CORE-P2-1 存储视图含 segLabelMinPx', stored.segLabelMinPx, 30);
  ok('CORE-P2-1 存储视图无未登记键', !('evil' in stored));
  eq('CORE-P2-1 buildProject 复用同一清洗', api.buildProject({schema:api.SCHEMA,settings:{precision:99,gridVisible:false}}).settings.precision, 6);
  /* 启动兜底：无已保存工程时从本机设置恢复；清理后不得残留 */
  sandbox.localStorage.setItem('offline-drawing-annotation.settings', JSON.stringify({gridVisible:false,segLabelMinPx:31}));
  api.resetState(); api.applyLocalSettings();
  eq('CORE-P2-1 启动兜底读取本机设置', api.state.settings.gridVisible, false);
  eq('CORE-P2-1 启动兜底 segLabelMinPx', api.state.settings.segLabelMinPx, 31);
  sandbox.localStorage.removeItem('offline-drawing-annotation.settings'); api.resetState();

  /* CORE-P2-8：重命名非当前楼层必须刷新该层 updatedAt，否则 LWW 合并会丢重命名 */
  api.resetState();
  const floorInit2=api.createInitialState();
  const curUpdated=api.state.floors[0].updatedAt;
  api.state.floors.push({id:'floor.rename2',name:'2F',background:floorInit2.background,objects:[],viewport:{zoom:1,panX:0,panY:0},updatedAt:'2000-01-01T00:00:00.000Z'});
  ok('CORE-P2-8 重命名非当前楼层成功', api.renameFloor('floor.rename2','二号层'));
  ok('CORE-P2-8 被重命名楼层 updatedAt 已刷新', api.state.floors.find(f=>f.id==='floor.rename2').updatedAt>'2000-01-01T00:00:00.000Z');
  eq('CORE-P2-8 未误触当前楼层 updatedAt', api.state.floors[0].updatedAt, curUpdated);
  /* 重命名当前楼层仍走默认路径 */
  ok('CORE-P2-8 重命名当前楼层成功', api.renameFloor('floor.default','首层'));
  ok('CORE-P2-8 当前楼层 updatedAt 已刷新', api.state.floors[0].updatedAt>=curUpdated);
  api.resetState();

  /* CORE-P2-11：重复图层 id 保留首个，图层面板不重复、对象归属不二义 */
  const bpLayers=api.buildProject({schema:api.SCHEMA,layers:[
    {id:'layer.default',name:'默认图层',visible:true,locked:false},
    {id:'layer.dup',name:'甲层',visible:true,locked:false},
    {id:'layer.dup',name:'乙层',visible:false,locked:true}
  ]});
  eq('CORE-P2-11 重复图层 id 去重', bpLayers.layers.filter(l=>l.id==='layer.dup').length, 1);
  eq('CORE-P2-11 保留首个图层定义', bpLayers.layers.find(l=>l.id==='layer.dup').name, '甲层');
  ok('CORE-P2-11 默认图层仍唯一', bpLayers.layers.filter(l=>l.id==='layer.default').length===1);

  /* CORE-P2-12：site.id 走 safeId，annot 只保留已知布尔键 */
  const bpSite=api.buildProject({schema:api.SCHEMA,site:{id:'site:<x>/../../',shape:{type:'rect',x:0,y:0,w:10,h:5},annot:{siteNodes:false,siteArea:'yes',evil:true}}});
  ok('CORE-P2-12 site.id 经 safeId 清洗', !/[<>:/]/.test(bpSite.site.id));
  eq('CORE-P2-12 场地标注保留已知布尔', bpSite.site.annot.siteNodes, false);
  ok('CORE-P2-12 场地标注丢弃未知键', !('evil' in bpSite.site.annot));
  ok('CORE-P2-12 场地标注丢弃非布尔值', !('siteArea' in bpSite.site.annot));
  eq('CORE-P2-12 缺失 id 回落默认槽', api.buildProject({schema:api.SCHEMA,site:{shape:{type:'rect',w:1,h:1}}}).site.id, 'site.default');

  /* CORE-P2-17：对端心跳结构校验 + ts 钳制，伪造未来时间不能长期占租约 */
  const leaseFresh=(pid,now)=>{ api.state.meta.projectId=pid; api.leaseSyncProject(now); };
  api.resetState();
  leaseFresh('PRJ_LEASE_A',1000);
  api.leaseIngest({type:'lease',tabId:'PEER_FUT',projectId:'PRJ_LEASE_A',ts:99999999},1000);
  ok('CORE-P2-17 伪造未来心跳仍计入冲突', api.leaseConflictAt(1000)===true);
  ok('CORE-P2-17 未来 ts 钳制到 now+5s 后过期', api.leaseConflictAt(1000+api.LEASE_FUTURE_SKEW_MS+api.LEASE_TTL_MS+1)===false);
  leaseFresh('PRJ_LEASE_B',1000);
  api.leaseIngest({type:'lease',tabId:42,projectId:'PRJ_LEASE_B',ts:1000},1000);
  ok('CORE-P2-17 非字符串 tabId 被拒绝', api.leaseConflictAt(1000)===false);
  leaseFresh('PRJ_LEASE_C',1000);
  api.leaseIngest({type:'lease',tabId:'PEER_STR',projectId:'PRJ_LEASE_C',ts:'not-a-number'},1000);
  ok('CORE-P2-17 非法 ts 回落本地 now', api.leaseConflictAt(1000)===true);
  leaseFresh('PRJ_LEASE_D',1000);
  api.leaseIngest({type:'lease',tabId:'PEER_PAST',projectId:'PRJ_LEASE_D',ts:-999999},1000);
  ok('CORE-P2-17 过期 ts 不产生新鲜心跳', api.leaseConflictAt(1000)===false);
  api.resetState();
}
});

/* ---------------- P2 批次 6：快照与协作 ---------------- */
await section("P2-RT 批次 6：快照与协作", async () => {
{
  /* RT-P2-01：快照键两段编码，普通 id 不变，含冒号的组合不再撞键 */
  eq('RT-P2-01 普通 id 键格式不变', api.snapshotKey('PRJ4321','SNAP1'), 'snap:PRJ4321:SNAP1');
  eq('RT-P2-01 冒号两段各自编码', api.snapshotKey('A:B','S:1'), 'snap:A%3AB:S%3A1');
  ok('RT-P2-01 不同组合不再撞键', api.snapshotKey('A:B','X')!==api.snapshotKey('A','B:X'));
  ok('RT-P2-01 前缀只匹配本工程', api.snapshotKey('A:B','X').startsWith('snap:A%3AB:')&&!api.snapshotKey('A','B:X').startsWith('snap:A%3AB:'));
  eq('RT-P2-01 索引键同样编码', api.snapshotIndexKey('A:B'), 'snapidx:A%3AB');
  eq('RT-P2-01 键后缀还原原始快照 id', api.snapshotIdOfKey(api.snapshotKey('P','S:1')), 'S:1');

  /* RT-P2-03：快照的照片资产化只作用于深拷贝副本，不改实时工程 */
  const storeRt03=new Map();
  const savedIdb={get:sandbox.idbGetKey,put:sandbox.idbPutKey,del:sandbox.idbDeleteKey,keys:sandbox.idbAllKeys};
  sandbox.idbGetKey=async k=>storeRt03.get(k);
  sandbox.idbPutKey=async(k,v)=>{ storeRt03.set(k,v); };
  sandbox.idbDeleteKey=async k=>{ storeRt03.delete(k); };
  sandbox.idbAllKeys=async()=>Array.from(storeRt03.keys());
  api.resetState(); api.state.meta.projectId='PRJ_RT03';
  const ph3=api.baseObject('point','point.marker',{id:'PH3',name:'PH3',x:1,y:1});
  ph3.props={photoDataUrl:'data:image/png;base64,AAAA'};
  api.state.objects=[ph3];
  const meta3=await api.createSnapshot({label:'RT03'});
  eq('RT-P2-03 快照生成成功', typeof meta3.snapshotId, 'string');
  eq('RT-P2-03 实时对象仍保留内嵌照片', api.state.objects[0].props.photoDataUrl, 'data:image/png;base64,AAAA');
  eq('RT-P2-03 实时对象未被写入 photoId', 'photoId' in api.state.objects[0].props, false);
  const rec3=storeRt03.get(api.snapshotKey('PRJ_RT03',meta3.snapshotId));
  ok('RT-P2-03 快照数据已剥离 photoDataUrl', !!rec3&&!('photoDataUrl' in (rec3.data.objects[0].props||{})));
  sandbox.idbGetKey=savedIdb.get; sandbox.idbPutKey=savedIdb.put;
  sandbox.idbDeleteKey=savedIdb.del; sandbox.idbAllKeys=savedIdb.keys;
  api.resetState();

  /* RT-P2-04：记录归属通过后，仍需与当前打开工程一致 */
  api.resetState(); api.state.meta.projectId='PRJ_CUR';
  const prevGetRt04=sandbox.getSnapshot;
  sandbox.getSnapshot=async()=>({data:{schema:'1',objects:[]},meta:{projectId:'PRJ_OTHER',projectName:'他人工程'}});
  let rt04='';
  try{ await api.restoreSnapshotById('PRJ_OTHER','S1'); }catch(e){ rt04=e.message; }
  sandbox.getSnapshot=prevGetRt04;
  ok('RT-P2-04 非当前工程快照恢复被拒', /只能恢复当前打开工程/.test(rt04));
  api.resetState();

  /* RT-P2-05：键序无关的稳定序列化比较（快照差异 + 拖拽提交共用） */
  ok('RT-P2-05 拖拽比较忽略键顺序', api.sameSerializable({a:1,b:{x:1,y:[2,3]}},{b:{y:[2,3],x:1},a:1}));
  ok('RT-P2-05 拖拽比较识别真差异', api.sameSerializable({a:1,b:{x:1,y:2}},{a:1,b:{x:1,y:3}})===false);
  ok('RT-P2-05 快照比较忽略键顺序', api.sameJson({props:{color:'red',width:2}},{props:{width:2,color:'red'}}));
  ok('RT-P2-05 快照比较识别真差异', api.sameJson({props:{color:'red'}},{props:{color:'blue'}})===false);

  /* CORE-P2-20：协作/离线合并入口复用导入对象上限，拒绝时不替换现场 */
  let limitMsg='';
  try{ api.assertProjectWithinLimits({objects:new Array(api.APP_LIMITS.OBJECTS_MAX+1)},'合并'); }catch(e){ limitMsg=e.message; }
  ok('CORE-P2-20 超限工程被统一守卫拒绝', /合并超出上限/.test(limitMsg));
  api.resetState();
  let mergeMsg='';
  try{ await api.mergeProjectJSON({schema:api.SCHEMA,objects:new Array(api.APP_LIMITS.OBJECTS_MAX+1)}); }catch(e){ mergeMsg=e.message; }
  ok('CORE-P2-20 mergeProjectJSON 拒绝超限输入', /合并工程超出上限/.test(mergeMsg));
  eq('CORE-P2-20 拒绝后现场未替换', api.state.objects.length, 0);
}
});

/* ---------------- 结果汇总 ---------------- */
if (listOnly) {
  console.log(`共 ${sectionNames.length} 个分区（--filter=<regex> 选择执行）：`);
  sectionNames.forEach((n, i) => console.log(`  ${String(i + 1).padStart(3, ' ')}. ${n}`));
  process.exit(0);
}
await Promise.all(asyncSuites.map(s=>typeof s==='function'?s():s));
console.log(`\n${fail === 0 ? '✅' : '❌'} 逻辑层自测：${pass} 通过 / ${fail} 失败，共 ${pass + fail} 项断言（加载 ${srcs.length} 个脚本）`);
if (filterRe) console.log(`（已过滤：${filterRe}，仅统计匹配分区）`);
if (fail) { failures.forEach(f => console.error('  - ' + f)); process.exit(1); }
