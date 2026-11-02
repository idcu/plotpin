/* @idcu/format-pdf —— ESM 入口（读取 UMD 挂到 globalThis 的实现） */
import './core.js';

const P = globalThis.__idcuPdf;
if (!P) throw new Error('@idcu/format-pdf: core.js 未正确加载');

export const {
  PT_TO_METER, PDF_LIMITS,
  bytesToBinary, binaryToBytes,
  dictName, dictNumber, dictArray, dictRef, dictRawBlock,
  scanObjects, filtersOf, decodeStream, tokenizeContent,
  parse
} = P;

export default P;
