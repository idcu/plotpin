# @idcu/core-geometry

平面几何纯函数集合：向量、多边形、线段、方向约束、平行四边形/扇区/椭圆度量、2×3 仿射。零依赖。

入口：

- ESM：`src/index.mjs`
- CJS：`src/index.cjs`（同一份 `src/core.js` 实现）

```js
import { distance, pointInPolygon, constrainOrtho, solveAffine } from '@idcu/core-geometry';

pointInPolygon([1, 1], [[0, 0], [2, 0], [2, 2], [0, 2]]); // true
solveAffine([
  { u: 0, v: 0, x: 0, y: 0 },
  { u: 10, v: 0, x: 20, y: 0 }
]).T; // { a: 2, b: 0, c: 0, d: 0, e: -2, f: 0 }
```

## API

| 分组 | 函数 |
|---|---|
| 向量 | `vecAdd` / `vecSub` / `vecScale` / `distance` / `rotatePoint` / `normalizeAngle` |
| 多边形 | `polygonArea` / `polylineLength` / `pointInPolygon` / `polygonBBox` / `boundsIntersect` |
| 线段 | `nearestPointOnSegment` / `distanceToSegment` / `segmentIntersection` / `segmentsIntersect` / `polygonSelfIntersects` / `segmentBlocked` |
| 方向约束 | `constrainDirectional` / `constrainOrtho` / `constrainPolar` / `constrainSquareCorner` |
| 形状度量 | `clampSkew` / `parallelogramPoints` / `sectorSweep` / `sectorArcPoints` / `sectorArea` / `sectorPerimeter` / `ellipseArea` / `ellipsePerimeter` |
| 仿射 | `affineApply` / `affineMultiply` / `affineInvert` / `solveAffine` / `validAffine` |

约定：

- 坐标一律为 `[x, y]` 数组；角度单位为度，弧度入参在函数名/注释中显式标注（`refDir`、`prevDir`）。
- `EPS = 1e-8` 是退化判定阈值（零长度向量、平行线），与上游实现一致。
- `solveAffine(pairs)` 的 `pairs` 每项为 `{u,v,x,y}`：源坐标 → 目标坐标；2 对点求精确相似，≥3 对点用最小二乘求完整仿射。
- `affineInvert` 对奇异矩阵返回单位矩阵，不抛错。
- 0.2.0 新增 `polygonSelfIntersects(points)`（网格分桶的闭合多边形自相交检测）与
  `segmentBlocked(a, b, polygons)`（线段是否被多边形边界遮挡，`polygons` 为坐标点数组的数组）。

来源：plotpin `js/app/geometry.js` 的纯数学部分（MIT），业务对象/捕捉/覆盖率/底图语义保留在上游。
