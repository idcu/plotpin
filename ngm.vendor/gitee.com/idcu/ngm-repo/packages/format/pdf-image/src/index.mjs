/* @idcu/format-pdf-image —— ESM 入口（读取 UMD 挂到 globalThis 的实现） */
import './core.js';

const P = globalThis.__idcuPdfImage;
if (!P) throw new Error('@idcu/format-pdf-image: core.js 未正确加载');

export const { buildImagePdf } = P;
export default P;
