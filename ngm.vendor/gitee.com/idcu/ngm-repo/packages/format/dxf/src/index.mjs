/* @idcu/format-dxf —— ESM 入口（读取 UMD 挂到 globalThis 的实现） */
import './core.js';

const D = globalThis.__idcuDxf;
if (!D) throw new Error('@idcu/format-dxf: core.js 未正确加载');

export const {
  parse, build, parseDxf, buildDxf,
  nearestAci, safeLayer, bulgeSegment, evalBSpline, sampleEllipse, stripMtext,
  UNIT_TO_METER, LIMITS
} = D;
export default D;
