/* @local/format-pdf-vector —— ESM 入口（读取 UMD 挂到 globalThis 的实现） */
import './core.js';

const G = globalThis.__localPdfVector;
if (!G) throw new Error('@local/format-pdf-vector: core.js 未正确加载');

export const {
  stream,
  docPages,
  fit,
  mapPt,
  path,
  image,
  flate,
  textBitmap
} = G;

export default G;
