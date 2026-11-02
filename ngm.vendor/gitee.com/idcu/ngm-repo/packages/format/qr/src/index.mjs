/* @idcu/format-qr —— ESM 入口（读取 UMD 挂到 globalThis 的实现） */
import './core.js';

const Q = globalThis.__idcuQr;
if (!Q) throw new Error('@idcu/format-qr: core.js 未正确加载');

export const { encodeText, buildCodewords, byteLength, SIZE, MAX_BYTES, _internals } = Q;
export default Q;
