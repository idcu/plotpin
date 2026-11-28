'use strict';
/* @local/format-pdf-vector —— CJS 入口（执行 UMD 实现后转发 globalThis 上的对象） */
require('./core.js');

const G = globalThis.__localPdfVector;
if (!G) throw new Error('@local/format-pdf-vector: core.js 未正确加载');

module.exports = G;
