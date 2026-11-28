'use strict';
/* @local/core-lease —— CJS 入口（执行 UMD 实现后转发 globalThis 上的对象） */
require('./core.js');

const G = globalThis.__localLease;
if (!G) throw new Error('@local/core-lease: core.js 未正确加载');

module.exports = G;
