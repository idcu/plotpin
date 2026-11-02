/* pdf.js —— 多页图像 PDF 生成（适配 @idcu/format-pdf-image）
 * 保留原有 Pdf 全局导出名；页面仍由 Canvas 预渲染后传入 {width,height,b64}。 */
(function (global) {
  'use strict';
  const P = global.__idcuPdfImage;
  if (!P) throw new Error('pdf: @idcu/format-pdf-image 未加载');
  global.Pdf = P;
})(typeof window !== 'undefined' ? window : globalThis);
