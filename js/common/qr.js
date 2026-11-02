/* qr.js —— 二维码编码器（适配 @idcu/format-qr）
 * 保留原有 Qr 全局导出名与 encodeText/byteLength/_internals，实现由公共模块提供。 */
(function (global) {
  'use strict';
  const Q = global.__idcuQr;
  if (!Q) throw new Error('qr: @idcu/format-qr 未加载');
  global.Qr = Q;
})(typeof window !== 'undefined' ? window : globalThis);
