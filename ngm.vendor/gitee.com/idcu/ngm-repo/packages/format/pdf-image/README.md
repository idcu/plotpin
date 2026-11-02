# @idcu/format-pdf-image

零依赖多页 PDF 生成（每页为 JPEG 图像 XObject，`DCTDecode`）。入口：`src/index.mjs` / `src/index.cjs`。

```js
import { buildImagePdf } from '@idcu/format-pdf-image';
const bytes = buildImagePdf([{ width: 842, height: 595, b64: jpegBase64 }]); // Uint8Array
```

- 页面图像由调用方预渲染（Canvas/截图/服务端），本模块只做 PDF 封装，不依赖 Canvas 或字体。
- 输入：`[{ width, height, b64 }]`；按顺序生成多页，空数组抛错。
- 每页 JPEG 直接作为 `DCTDecode` 图像流嵌入，中文/图形与预渲染结果一致，无需嵌入字体。
- 输出为单字节流（`%PDF-1.4` + xref + `%%EOF`）。

来源：plotpin `js/common/pdf.js` @ `e9fcfb3`（MIT），见仓库根 `NOTICE.md`。
