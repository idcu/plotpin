/* @idcu/core-geometry —— ESM 入口（读取 UMD 挂到 globalThis 的实现） */
import './core.js';

const G = globalThis.__idcuGeometry;
if (!G) throw new Error('@idcu/core-geometry: core.js 未正确加载');

export const {
  EPS,
  vecAdd, vecSub, vecScale, distance, rotatePoint, normalizeAngle,
  polygonArea, polylineLength, pointInPolygon, polygonBBox, boundsIntersect,
  nearestPointOnSegment, distanceToSegment, segmentIntersection, segmentsIntersect,
  polygonSelfIntersects, segmentBlocked,
  constrainDirectional, constrainOrtho, constrainPolar, constrainSquareCorner,
  clampSkew, parallelogramPoints, sectorSweep, sectorArcPoints,
  sectorArea, sectorPerimeter, ellipseArea, ellipsePerimeter,
  affineApply, affineMultiply, affineInvert, solveAffine, validAffine
} = G;

export default G;
