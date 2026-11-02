/* geometry.js —— 零依赖平面几何纯函数（向量 / 多边形 / 线段 / 方向约束 / 扇区 / 仿射）
 * 只接收坐标、标量与选项对象，不依赖任何项目状态、对象模型或 DOM。
 * UMD-lite：Node CJS 走 module.exports，浏览器/ESM 走 globalThis.__idcuGeometry。 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.__idcuGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EPS = 1e-8;

  /* ---------------- 向量与点 ---------------- */
  const vecAdd = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const vecSub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const vecScale = (a, s) => [a[0] * s, a[1] * s];
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  /** 绕 center 旋转 angleDeg 度 */
  function rotatePoint(p, center, angleDeg) {
    const a = angleDeg * Math.PI / 180, x = p[0] - center[0], y = p[1] - center[1];
    return [center[0] + x * Math.cos(a) - y * Math.sin(a), center[1] + x * Math.sin(a) + y * Math.cos(a)];
  }

  /** 角度规整到 [0,360) */
  function normalizeAngle(a) { a = ((a % 360) + 360) % 360; return a; }

  /* ---------------- 多边形 ---------------- */
  /** 多边形面积（绝对值） */
  function polygonArea(points) {
    let a = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i], q = points[(i + 1) % points.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a / 2);
  }

  /** 折线总长 */
  function polylineLength(points) {
    let s = 0;
    for (let i = 1; i < points.length; i++) s += distance(points[i - 1], points[i]);
    return s;
  }

  /** 射线法：点是否在多边形内 */
  function pointInPolygon(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      const hit = ((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi);
      if (hit) inside = !inside;
    }
    return inside;
  }

  /** 轴对齐包围盒；空数组返回 null */
  function polygonBBox(poly) {
    if (!poly || !poly.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of poly) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  /** 两个轴对齐包围盒是否相交 */
  function boundsIntersect(a, b) {
    return !(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY);
  }

  /* ---------------- 线段 ---------------- */
  /** 线段 ab 上距 p 最近的点（参数钳到 [0,1]） */
  function nearestPointOnSegment(p, a, b) {
    const v = vecSub(b, a), w = vecSub(p, a), l2 = v[0] * v[0] + v[1] * v[1];
    if (l2 < EPS) return a.slice();
    let t = (w[0] * v[0] + w[1] * v[1]) / l2;
    t = Math.max(0, Math.min(1, t));
    return [a[0] + t * v[0], a[1] + t * v[1]];
  }

  /** 点到线段的最短距离 */
  function distanceToSegment(p, a, b) {
    const v = vecSub(b, a), w = vecSub(p, a), l2 = v[0] * v[0] + v[1] * v[1];
    if (l2 < EPS) return distance(p, a);
    let t = (w[0] * v[0] + w[1] * v[1]) / l2;
    t = Math.max(0, Math.min(1, t));
    return distance(p, [a[0] + t * v[0], a[1] + t * v[1]]);
  }

  /** 两条线段求交；平行/无交点返回 null（端点相交也算交点） */
  function segmentIntersection(a, b, c, d) {
    const r = vecSub(b, a), s = vecSub(d, c), den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < EPS) return null;
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
    const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return [a[0] + t * r[0], a[1] + t * r[1]];
  }

  /** 两条线段是否相交（严格转向判定，端点共线返回 false） */
  function segmentsIntersect(a, b, c, d) {
    function ccw(p1, p2, p3) { return (p3[1] - p1[1]) * (p2[0] - p1[0]) > (p2[1] - p1[1]) * (p3[0] - p1[0]); }
    return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
  }

  /* ---------------- 方向约束（正交 / 极轴 / 等距 / 平行垂直 / 正方形） ---------------- */
  /**
   * 方向约束：在「平行 / 垂直 / 等距 / 极轴」容差内把 point 钳到对应方向。
   * 优先级：参考方向平行 > 参考方向垂直 > 上一段等距 > 极轴；返回 {p, mode}。
   * opt: {refDir(弧度), prevDir(弧度), prevLen, polarStep(度, 0=关闭), tolDeg=4, polarTolDeg=3}
   */
  function constrainDirectional(last, point, opt) {
    opt = opt || {};
    const v = [point[0] - last[0], point[1] - last[1]], len = Math.hypot(v[0], v[1]);
    if (len < EPS) return { p: [point[0], point[1]], mode: 'none' };
    const ang = Math.atan2(v[1], v[0]);
    const tol = (opt.tolDeg === undefined ? 4 : Number(opt.tolDeg)) * Math.PI / 180;
    const near = (a, b, t) => {
      let d = a - b;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      return Math.min(Math.abs(d), Math.abs(Math.abs(d) - Math.PI)) <= t;
    };
    const project = (dir) => {
      const u = [Math.cos(dir), Math.sin(dir)], dot = v[0] * u[0] + v[1] * u[1];
      return [last[0] + u[0] * dot, last[1] + u[1] * dot];
    };
    if (Number.isFinite(opt.refDir)) {
      if (near(ang, opt.refDir, tol)) return { p: project(opt.refDir), mode: 'parallel' };
      if (near(ang, opt.refDir + Math.PI / 2, tol)) return { p: project(opt.refDir + Math.PI / 2), mode: 'perpendicular' };
    }
    if (Number.isFinite(opt.prevDir) && Number(opt.prevLen) > EPS && near(ang, opt.prevDir, tol)) {
      return { p: [last[0] + Math.cos(ang) * opt.prevLen, last[1] + Math.sin(ang) * opt.prevLen], mode: 'equal' };
    }
    if (Number(opt.polarStep) > 0) {
      const step = Number(opt.polarStep), deg = ang * 180 / Math.PI;
      const nearest = Math.round(deg / step) * step;
      const pTol = (opt.polarTolDeg === undefined ? 3 : Number(opt.polarTolDeg)) * Math.PI / 180;
      if (near(ang, nearest * Math.PI / 180, pTol)) return { p: project(nearest * Math.PI / 180), mode: 'polar' };
    }
    return { p: [point[0], point[1]], mode: 'none' };
  }

  /** 正交约束：把 p 钳到相对 base 的水平/垂直方向（位移分量绝对值较大者为主轴） */
  function constrainOrtho(base, p, enabled) {
    if (!enabled || !base) return p;
    const dx = p[0] - base[0], dy = p[1] - base[1];
    if (Math.abs(dx) >= Math.abs(dy)) return [p[0], base[1]];
    return [base[0], p[1]];
  }

  /** 极轴约束：把 p 相对 center 的方位角钳到 stepDeg 的整数倍，半径不变 */
  function constrainPolar(center, p, enabled, stepDeg) {
    if (!enabled || !center) return p;
    const r = Math.hypot(p[0] - center[0], p[1] - center[1]);
    if (r < EPS) return p;
    const step = stepDeg || 45;
    const deg = Math.atan2(p[1] - center[1], p[0] - center[0]) * 180 / Math.PI;
    const a = Math.round(deg / step) * step * Math.PI / 180;
    return [center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)];
  }

  /** 正方形约束：以 base 为固定角点，把 p 拉成边长等于主导位移的正方形 */
  function constrainSquareCorner(base, p, enabled) {
    if (!enabled) return p;
    const dx = p[0] - base[0], dy = p[1] - base[1];
    const s = Math.max(Math.abs(dx), Math.abs(dy));
    if (s < EPS) return p;
    return [base[0] + (dx === 0 ? 0 : Math.sign(dx)) * s, base[1] + (dy === 0 ? 0 : Math.sign(dy)) * s];
  }

  /* ---------------- 平行四边形 / 扇区 ---------------- */
  /** 倾角钳到 ±limitDeg（默认 80°，避免退化为无限长边） */
  function clampSkew(skewDeg, limitDeg) {
    const v = Number(skewDeg) || 0;
    const lim = Number(limitDeg) > 0 ? Number(limitDeg) : 80;
    return Math.max(-lim, Math.min(lim, v));
  }

  /** 平行四边形四角：基点=左下角，错切位移 off=高×tan(倾角) */
  function parallelogramPoints(x, y, width, height, skewDeg) {
    const off = Math.max(0, height) * Math.tan(clampSkew(skewDeg) * Math.PI / 180);
    return [[x, y], [x + width, y], [x + width + off, y + height], [x + off, y + height]];
  }

  /** 扇区有效张角（0–360°）；起止角相等时视为整圆 */
  function sectorSweep(startAngle, endAngle) {
    let s = (Number(endAngle) || 0) - (Number(startAngle) || 0);
    s = ((s % 360) + 360) % 360;
    return s === 0 ? 360 : s;
  }

  /** 扇区弧采样（segments 等分，含首末点） */
  function sectorArcPoints(cx, cy, radius, startAngle, sweepDeg, segments) {
    const seg = segments === undefined ? 72 : segments;
    const pts = [];
    for (let i = 0; i <= seg; i++) {
      const a = (startAngle + sweepDeg * i / seg) * Math.PI / 180;
      pts.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
    }
    return pts;
  }

  /** 圆扇区面积 */
  function sectorArea(radius, sweepDeg) {
    return sweepDeg / 360 * Math.PI * radius * radius;
  }

  /** 圆扇区周长：两条半径（整圆时重合，只取弧长）+ 弧长 */
  function sectorPerimeter(radius, sweepDeg) {
    return (sweepDeg >= 360 ? 0 : 2 * radius) + radius * sweepDeg * Math.PI / 180;
  }

  /** 椭圆面积 */
  function ellipseArea(rx, ry) {
    return Math.PI * (Number(rx) || 0) * (Number(ry) || 0);
  }

  /** 椭圆周长（Ramanujan 近似） */
  function ellipsePerimeter(rx, ry) {
    const a = Math.max(0, Number(rx) || 0), b = Math.max(0, Number(ry) || 0);
    if (a + b < EPS) return 0;
    const h = ((a - b) * (a - b)) / ((a + b) * (a + b));
    return Math.PI * (a + b) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h)));
  }

  /* ---------------- 2x3 仿射（[a,b,c; d,e,f] 行优先） ---------------- */
  function affineApply(T, p) {
    return [T[0] * p[0] + T[1] * p[1] + T[2], T[3] * p[0] + T[4] * p[1] + T[5]];
  }

  function affineMultiply(A, B) {
    return [
      A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2],
      A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5]];
  }

  function affineInvert(T) {
    const det = T[0] * T[4] - T[1] * T[3];
    if (Math.abs(det) < 1e-18) return [1, 0, 0, 0, 1, 0];
    const ia = T[4] / det, ib = -T[1] / det, id = -T[3] / det, ie = T[0] / det;
    return [ia, ib, -(ia * T[2] + ib * T[5]), id, ie, -(id * T[2] + ie * T[5])];
  }

  /** 最小二乘解 3 列 A·coef=z（高斯消元） */
  function _leastSquares3(U, z) {
    let ATA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], ATz = [0, 0, 0];
    U.forEach((u, i) => {
      const row = [u[0], u[1], 1], zi = z[i];
      for (let r = 0; r < 3; r++) { ATz[r] += row[r] * zi; for (let c2 = 0; c2 < 3; c2++) ATA[r][c2] += row[r] * row[c2]; }
    });
    const M = ATA.map((row, r) => row.concat([ATz[r]]));
    for (let i = 0; i < 3; i++) {
      let p = i;
      for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
      const tmp = M[i]; M[i] = M[p]; M[p] = tmp;
      if (Math.abs(M[i][i]) < 1e-18) return null;
      for (let k = 0; k < 3; k++) {
        if (k === i) continue;
        const f = M[k][i] / M[i][i];
        for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j];
      }
    }
    return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
  }

  /**
   * 由对应点对求仿射：pairs 每项为 {u,v,x,y}（源坐标 → 目标坐标）。
   * 2 对点 → 精确相似（旋转+等比缩放+平移，复数解）；≥3 → 六点最小二乘完整仿射。
   * 返回 {T:{a,b,c,d,e,f}, scale, rotationDeg, isSimilarity}
   */
  function solveAffine(pairs) {
    if (pairs.length < 2) throw new Error('仿射校准至少需要 2 个对应点');
    if (pairs.length === 2) {
      const [p0, p1] = pairs;
      const du = p1.u - p0.u, dv = p1.v - p0.v;
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      /* 目标系 y 向上、源系 y 向下：复数 z=u-i·v，W=α z+β */
      const den = du * du + dv * dv;
      if (den < 1e-18) throw new Error('两个校准点重合，无法求解');
      const ar = (dx * du + dy * dv) / den, ai = (-dx * dv + dy * du) / den;
      const c = p0.x - (ar * p0.u + ai * p0.v), f = p0.y - (ai * p0.u - ar * p0.v);
      const T = { a: ar, b: ai, c, d: ai, e: -ar, f };
      return { T, scale: Math.hypot(ar, ai), rotationDeg: Math.atan2(ai, ar) * 180 / Math.PI, isSimilarity: true };
    }
    const cx = _leastSquares3(pairs.map(p => [p.u, p.v]), pairs.map(p => p.x));
    const cy = _leastSquares3(pairs.map(p => [p.u, p.v]), pairs.map(p => p.y));
    if (!cx || !cy) throw new Error('校准点退化（共线或重合），无法求解仿射');
    const T = { a: cx[0], b: cx[1], c: cx[2], d: cy[0], e: cy[1], f: cy[2] };
    const scale = Math.sqrt(Math.abs(T.a * T.e - T.b * T.d));
    /* 相似判定：y-down 源系下相似形满足 a≈-e 且 b≈d */
    const ref = Math.max(1, Math.hypot(T.a, T.b));
    const isSimilarity = Math.abs(T.a + T.e) < ref * 1e-6 && Math.abs(T.b - T.d) < ref * 1e-6;
    const rotationDeg = Math.atan2(T.b, T.a) * 180 / Math.PI;
    return { T, scale, rotationDeg, isSimilarity };
  }

  /** 校验仿射系数：6 个有限数且行列式非退化才返回规范对象，否则 null */
  function validAffine(t) {
    if (!t || typeof t !== 'object') return null;
    const c = ['a', 'b', 'c', 'd', 'e', 'f'].map(k => Number(t[k]));
    if (!c.every(Number.isFinite)) return null;
    if (Math.abs(c[0] * c[4] - c[1] * c[3]) < 1e-18) return null;
    return { a: c[0], b: c[1], c: c[2], d: c[3], e: c[4], f: c[5] };
  }

  return {
    EPS,
    vecAdd, vecSub, vecScale, distance, rotatePoint, normalizeAngle,
    polygonArea, polylineLength, pointInPolygon, polygonBBox, boundsIntersect,
    nearestPointOnSegment, distanceToSegment, segmentIntersection, segmentsIntersect,
    constrainDirectional, constrainOrtho, constrainPolar, constrainSquareCorner,
    clampSkew, parallelogramPoints, sectorSweep, sectorArcPoints,
    sectorArea, sectorPerimeter, ellipseArea, ellipsePerimeter,
    affineApply, affineMultiply, affineInvert, solveAffine, validAffine
  };
});
