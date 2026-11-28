/* @local/core-svg-sanitize —— ESM 入口（读取 UMD 挂到 globalThis 的实现） */
import './core.js';

const G = globalThis.__localSvgSanitize;
if (!G) throw new Error('@local/core-svg-sanitize: core.js 未正确加载');

export const { createSymbolSanitizer, DEFAULT_LIMITS } = G;
export default G;
