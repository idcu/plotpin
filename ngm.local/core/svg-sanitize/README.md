# @local/core-svg-sanitize

符号 SVG 的安全清洗：路径白名单、viewBox/别名归一、SVG 元素上限与脚本/事件/外链拦截、符号包导入。

- 零依赖、纯函数；由 `createSymbolSanitizer({ limits, viewBox, categories, defaultColor })` 注入业务常量。
- 浏览器入口 `src/core.js`（UMD，挂 `__localSvgSanitize`）；ESM/CJS 入口同目录。
- 适配层 `js/common/symbols.js` 保留 `normalizeSymbolPaths / parseSvgSymbol / sanitizeSymbolBundle` 等旧全局名。

## 约定

- 路径字符白名单与首命令 `M/m` 校验不可放松；新增 SVG 元素支持必须同时更新 `SVG_ELEMENTS` 与测试。
- 错误信息是面向用户的（中文），调用方直接 toast；不要在适配层重复拼接。
