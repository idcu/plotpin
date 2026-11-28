# @local/format-pdf-vector

矢量 PDF 写入器（本地 ngm 包先；后续可提升到 `@idcu/format-pdf-vector`）。

- 来源：`js/common/pdf-vector.js`（V-1 容器 / V-2 几何映射 / V-3a 图片·SMask·文字位图 / V-6 文字层）。
- 入口：浏览器 `src/core.js`（UMD，挂 `globalThis.__localPdfVector`）；ESM `src/index.mjs`；CJS `src/index.cjs`。
- 适配层：`js/common/pdf-vector.js`，保留旧全局名 `PdfVec`。
- 测试：`node ngm.local/format/pdf-vector/test/pdf-vector.test.mjs`。
- 依赖：零运行时依赖；`flate` 需要 `CompressionStream`，`textBitmap` 需要 Canvas，均由调用方环境提供。
- 提升路径：在 `gitee:idcu/ngm-repo` 建 `packages/format/pdf-vector`，把 `runtime` 改为 Node 包格式，补 `README`/`test`，打 tag 后按 vendor 流程重锁；本仓删除 `ngm.local` 对应目录并更新适配层声明。
