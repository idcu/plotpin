/* pdf-vector.js —— 矢量 PDF 写入器：本地 ngm 包入口（实现位于 ngm.local/format/pdf-vector） */
/* 适配层：实现已抽到 @local/format-pdf-vector（本地 ngm 包，待上游化）。
 * 本文件只负责把 UMD 全局 __localPdfVector 接回旧全局名 PdfVec，调用方不改。
 * 升级本地包时若导出名变化，check-ngm 的 localAdapters.keeps 会红。 */
(function (global) {
  'use strict';
  const G = global.__localPdfVector;
  if (!G) throw new Error('pdf-vector.js：缺少 @local/format-pdf-vector，请检查 index.html 脚本顺序');
  global.PdfVec = G;
})(typeof window !== 'undefined' ? window : globalThis);
