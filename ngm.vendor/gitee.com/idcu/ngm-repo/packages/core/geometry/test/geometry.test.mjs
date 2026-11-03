import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as G from '../src/index.mjs';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const nearPoint = (a, b, eps = 1e-9) => { near(a[0], b[0], eps); near(a[1], b[1], eps); };

test('vector helpers', () => {
  assert.deepEqual(G.vecAdd([1, 2], [3, 4]), [4, 6]);
  assert.deepEqual(G.vecSub([1, 2], [3, 4]), [-2, -2]);
  assert.deepEqual(G.vecScale([1, 2], 3), [3, 6]);
  near(G.distance([0, 0], [3, 4]), 5);
});

test('rotatePoint / normalizeAngle', () => {
  const p = G.rotatePoint([1, 0], [0, 0], 90);
  nearPoint(p, [0, 1], 1e-12);
  near(G.normalizeAngle(-30), 330);
  near(G.normalizeAngle(725), 5);
  near(G.normalizeAngle(360), 0);
});

test('polygon area / length / containment / bbox', () => {
  const square = [[0, 0], [2, 0], [2, 2], [0, 2]];
  near(G.polygonArea(square), 4);
  near(G.polylineLength([[0, 0], [3, 4]]), 5);
  assert.equal(G.pointInPolygon([1, 1], square), true);
  assert.equal(G.pointInPolygon([3, 1], square), false);
  assert.deepEqual(G.polygonBBox([[-1, 2], [3, 5], [0, -2]]), { minX: -1, minY: -2, maxX: 3, maxY: 5, w: 4, h: 7 });
  assert.equal(G.polygonBBox([]), null);
});

test('boundsIntersect', () => {
  const a = { minX: 0, minY: 0, maxX: 2, maxY: 2 };
  assert.equal(G.boundsIntersect(a, { minX: 3, minY: 3, maxX: 4, maxY: 4 }), false);
  assert.equal(G.boundsIntersect(a, { minX: 1, minY: 1, maxX: 3, maxY: 3 }), true);
  assert.equal(G.boundsIntersect(a, { minX: 2, minY: 0, maxX: 4, maxY: 2 }), true);
});

test('segment distance / nearest point', () => {
  near(G.distanceToSegment([0, 2], [0, 0], [2, 0]), 2);
  assert.deepEqual(G.nearestPointOnSegment([1, 3], [0, 0], [2, 0]), [1, 0]);
  assert.deepEqual(G.nearestPointOnSegment([3, 3], [0, 0], [2, 0]), [2, 0]);
  assert.deepEqual(G.nearestPointOnSegment([5, 5], [1, 1], [1, 1]), [1, 1]);
});

test('segment intersection', () => {
  nearPoint(G.segmentIntersection([0, 0], [2, 2], [0, 2], [2, 0]), [1, 1], 1e-12);
  assert.equal(G.segmentIntersection([0, 0], [1, 1], [2, 2], [3, 3]), null);
  assert.equal(G.segmentIntersection([0, 0], [1, 0], [2, 0], [3, 0]), null);
  assert.equal(G.segmentsIntersect([0, 0], [2, 0], [1, -1], [1, 1]), true);
  assert.equal(G.segmentsIntersect([0, 0], [1, 0], [2, 0], [3, 0]), false);
});

test('constrainDirectional: parallel / perpendicular / equal / polar / none', () => {
  const parallel = G.constrainDirectional([0, 0], [10, 0.5], { refDir: 0 });
  assert.equal(parallel.mode, 'parallel');
  nearPoint(parallel.p, [10, 0]);
  const perpendicular = G.constrainDirectional([0, 0], [0.5, 10], { refDir: 0 });
  assert.equal(perpendicular.mode, 'perpendicular');
  nearPoint(perpendicular.p, [0, 10]);
  const equal = G.constrainDirectional([0, 0], [10, 10], { prevDir: Math.PI / 4, prevLen: 20 });
  assert.equal(equal.mode, 'equal');
  nearPoint(equal.p, [Math.cos(Math.PI / 4) * 20, Math.sin(Math.PI / 4) * 20]);
  const polar = G.constrainDirectional([0, 0], [9, 9], { polarStep: 45 });
  assert.equal(polar.mode, 'polar');
  nearPoint(polar.p, [9, 9], 1e-9);
  const none = G.constrainDirectional([0, 0], [10, 1], { refDir: 0 });
  assert.equal(none.mode, 'none');
  assert.deepEqual(none.p, [10, 1]);
  assert.deepEqual(G.constrainDirectional([0, 0], [0, 0], { refDir: 0 }).p, [0, 0]);
});

test('constrainOrtho / constrainPolar / constrainSquareCorner', () => {
  assert.deepEqual(G.constrainOrtho([1, 2], [5, 3], true), [5, 2]);
  assert.deepEqual(G.constrainOrtho([1, 2], [2, 9], true), [1, 9]);
  assert.deepEqual(G.constrainOrtho([1, 2], [5, 3], false), [5, 3]);
  const r = Math.hypot(10, 1);
  nearPoint(G.constrainPolar([0, 0], [10, 1], true, 45), [r, 0]);
  assert.deepEqual(G.constrainPolar([0, 0], [10, 1], false, 45), [10, 1]);
  assert.deepEqual(G.constrainSquareCorner([0, 0], [3, 4], true), [4, 4]);
  assert.deepEqual(G.constrainSquareCorner([0, 0], [3, 4], false), [3, 4]);
});

test('clampSkew / parallelogramPoints', () => {
  near(G.clampSkew(90), 80);
  near(G.clampSkew(-100), -80);
  near(G.clampSkew(30), 30);
  const pts = G.parallelogramPoints(0, 0, 10, 5, 30);
  assert.deepEqual(pts[0], [0, 0]);
  assert.deepEqual(pts[1], [10, 0]);
  nearPoint(pts[2], [10 + 5 * Math.tan(30 * Math.PI / 180), 5]);
  nearPoint(pts[3], [5 * Math.tan(30 * Math.PI / 180), 5]);
});

test('sector helpers', () => {
  near(G.sectorSweep(0, 0), 360);
  near(G.sectorSweep(350, 10), 20);
  near(G.sectorSweep(0, 90), 90);
  const pts = G.sectorArcPoints(0, 0, 1, 0, 90, 4);
  assert.equal(pts.length, 5);
  nearPoint(pts[0], [1, 0], 1e-12);
  nearPoint(pts[4], [0, 1], 1e-12);
  near(G.sectorArea(2, 90), Math.PI);
  near(G.sectorPerimeter(2, 90), 4 + Math.PI);
  near(G.sectorPerimeter(2, 360), 4 * Math.PI);
});

test('ellipse helpers', () => {
  near(G.ellipseArea(3, 2), 6 * Math.PI);
  near(G.ellipsePerimeter(5, 5), 2 * Math.PI * 5);
  assert.equal(G.ellipsePerimeter(0, 0), 0);
  const p = G.ellipsePerimeter(10, 5);
  assert.ok(p > 2 * Math.PI * 5 && p < 2 * Math.PI * 10);
});

test('affine apply / multiply / invert', () => {
  assert.deepEqual(G.affineApply([1, 0, 2, 0, 1, 3], [1, 1]), [3, 4]);
  assert.deepEqual(G.affineMultiply([1, 0, 0, 0, 1, 0], [2, 3, 4, 5, 6, 7]), [2, 3, 4, 5, 6, 7]);
  const inv = G.affineInvert([2, 0, 1, 0, 2, 3]);
  [0.5, 0, -0.5, 0, 0.5, -1.5].forEach((v, i) => near(inv[i], v));
  const roundTrip = G.affineMultiply([2, 0, 1, 0, 2, 3], inv);
  near(roundTrip[0], 1); near(roundTrip[1], 0); near(roundTrip[2], 0);
  near(roundTrip[3], 0); near(roundTrip[4], 1); near(roundTrip[5], 0);
  assert.deepEqual(G.affineInvert([0, 0, 0, 0, 0, 0]), [1, 0, 0, 0, 1, 0]);
});

test('solveAffine: two-point similarity', () => {
  const sol = G.solveAffine([{ u: 0, v: 0, x: 0, y: 0 }, { u: 10, v: 0, x: 20, y: 0 }]);
  assert.deepEqual(sol.T, { a: 2, b: 0, c: 0, d: 0, e: -2, f: 0 });
  near(sol.scale, 2);
  assert.equal(sol.isSimilarity, true);
  assert.throws(() => G.solveAffine([{ u: 1, v: 1, x: 0, y: 0 }]), /至少需要 2 个对应点/);
  assert.throws(() => G.solveAffine([{ u: 1, v: 1, x: 0, y: 0 }, { u: 1, v: 1, x: 2, y: 3 }]), /重合/);
});

test('solveAffine: least squares for 3+ correspondences', () => {
  const truth = { a: 2, b: 0.5, c: 1, d: -0.5, e: 2, f: 3 };
  const src = [[0, 0], [10, 0], [0, 10]];
  const pairs = src.map(([u, v]) => ({
    u, v,
    x: truth.a * u + truth.b * v + truth.c,
    y: truth.d * u + truth.e * v + truth.f
  }));
  const sol = G.solveAffine(pairs);
  for (const k of ['a', 'b', 'c', 'd', 'e', 'f']) near(sol.T[k], truth[k], 1e-9);
  assert.equal(sol.isSimilarity, false);
});

test('validAffine', () => {
  assert.deepEqual(G.validAffine({ a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }), { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 });
  assert.equal(G.validAffine(null), null);
  assert.equal(G.validAffine({ a: 1, b: 2, c: 0, d: 2, e: 4, f: 0 }), null);
  assert.equal(G.validAffine({ a: 1, b: 0, c: 0, d: 0, e: NaN, f: 0 }), null);
});

test('polygonSelfIntersects', () => {
  assert.equal(G.polygonSelfIntersects([[0, 0], [2, 2], [2, 0], [0, 2]]), true);   // 蝴蝶结
  assert.equal(G.polygonSelfIntersects([[0, 0], [2, 0], [2, 2], [0, 2]]), false);   // 正方形
  assert.equal(G.polygonSelfIntersects([[0, 0], [4, 0], [4, 4], [2, 2], [0, 4]]), false);
  assert.equal(G.polygonSelfIntersects([[0, 0], [4, 0], [0, 2], [4, 2]]), true);
  assert.equal(G.polygonSelfIntersects([[0, 0], [2, 0], [4, 0], [4, 2], [0, 2]]), false);
  assert.equal(G.polygonSelfIntersects([[0, 0], [1, 0], [1, 1]]), false);
  assert.equal(G.polygonSelfIntersects([]), false);
});

test('segmentBlocked', () => {
  const square = [[1, 1], [3, 1], [3, 3], [1, 3]];
  assert.equal(G.segmentBlocked([0, 0], [4, 4], [square]), true);
  assert.equal(G.segmentBlocked([1.5, 1.5], [2.5, 2.5], [square]), false);
  assert.equal(G.segmentBlocked([0, 0], [0.5, 0.5], [square]), false);
  assert.equal(G.segmentBlocked([0, 0], [4, 4], []), false);
  assert.equal(G.segmentBlocked([0, 0], [4, 4], [[[5, 5], [6, 5], [6, 6]]]), false);
  assert.equal(G.segmentBlocked([0, 4], [4, 0], [square, [[5, 0], [6, 0], [6, 6], [5, 6]]]), true);
});

test('cjs entry loads and shares the same implementation', () => {
  const require = createRequire(import.meta.url);
  const C = require('../src/index.cjs');
  assert.equal(typeof C.distance, 'function');
  assert.deepEqual(C.vecAdd([1, 2], [3, 4]), [4, 6]);
  assert.equal(typeof G.default.constrainDirectional, 'function');
});
