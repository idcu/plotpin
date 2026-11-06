/* qr.js —— 二维码编码器（适配 @idcu/format-qr）
 * 保留原有 Qr 全局导出名与 encodeText/byteLength/_internals，实现由公共模块提供。 */
(function (global) {
  'use strict';
  const Q = global.__idcuQr;
  if (!Q) throw new Error('qr: @idcu/format-qr 未加载');
  global.Qr = Q;
})(typeof window !== 'undefined' ? window : globalThis);

/** 二维码 SVG：一个 path 画全部暗模块（v3 版式 29×29，crispEdges 保证打印锐利）。
 *  导出标签与协作邀请共用这一份实现；调用方负责先判断 Qr.byteLength <= Qr.MAX_BYTES。 */
function qrSvg(text,px=96){
  const qr=ensureVendor('Qr').encodeText(text);
  let d='';
  for(let r=0;r<qr.size;r++) for(let c=0;c<qr.size;c++){
    if(qr.modules[r][c]) d+=`M${c} ${r}h1v1h-1z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${qr.size} ${qr.size}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${qr.size}" height="${qr.size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
