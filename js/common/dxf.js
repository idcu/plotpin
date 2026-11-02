/* dxf.js —— DXF 解析/生成（适配 @idcu/format-dxf）
 * 保留原有 Dxf 全局导出名与函数名，实现由公共模块提供。 */
(function (global) {
  'use strict';
  const D = global.__idcuDxf;
  if (!D) throw new Error('dxf: @idcu/format-dxf 未加载');
  global.Dxf = D;
})(typeof window !== 'undefined' ? window : globalThis);
