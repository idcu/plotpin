# @idcu/format-pdf

零依赖 PDF 结构解析：对象树、页面列表、内容流原文、流解码（FlateDecode 通过注入实现）。只做语法/容器层，不生成绘图对象。
入口：

- ESM：`src/index.mjs`
- CJS：`src/index.cjs`（同一份 `src/core.js` 实现）

```js
import { parse, tokenizeContent } from '@idcu/format-pdf';

const r = await parse(bytes, { inflate: async b => new Uint8Array(require('node:zlib').inflateSync(b)) });
r.pages[0]; // { num, dict, mediaBox, contentRefs, contents, contentText }
r.objects;  // Map<num, { dict, data }>
```

## API

| 分组 | 函数 |
|---|---|
| 字节 | `bytesToBinary` / `binaryToBytes` |
| 字典 | `dictName` / `dictNumber` / `dictArray` / `dictRef` / `dictRawBlock` / `filtersOf` |
| 对象树 | `scanObjects(binary)` → `Map<num,{dict,data}>` |
| 流 | `decodeStream(obj,{inflate,maxInflateBytes})` → `{bytes,binary,text}`；支持 FlateDecode / LZWDecode / DCTDecode |
| 对象流 | `unpackObjectStreams(objects,{inflate})` → 把 `/ObjStm` 内对象补入对象表 |
| 图像颜色 | `cmykToRgb(cmykBytes)` → RGB 像素（4 通道 → 3 通道） |
| 内容流 | `tokenizeContent(str)` → 词法单元（不解释语义） |
| 整文件 | `parse(input,{inflate,limits})` → `{objects, pages}` |

约定：

- `parse` 只返回对象树与页面列表；文字定位、路径、图像取舍等语义留在调用方。
- `inflate` 由调用方注入（浏览器 `DecompressionStream`、Node `zlib` 均可），模块不引入任何解压依赖。
- 页面 `mediaBox` 按 `/Parent` 链继承，缺省 `[0,0,612,792]`；坐标单位 PDF 点（1/72 英寸）。
- 内容流数组按原实现以换行拼接；`contents` 保留每条流解码后的字节与文本。
- 0.2.0 新增：`/ObjStm` 解包（`parse` 自动执行）、`LZWDecode`（EarlyChange 可调，解码器比字典表提前一条扩宽以匹配标准编码器）、`cmykToRgb`。
- 既有字段语义不变：`objects` 仍为 `Map<num,{dict,data}>`，`pages[]` 仍是 `{num,dict,mediaBox,contentRefs,contents,contentText}`。

来源：plotpin `js/common/pdf-read.js` 的解析与流解码部分（MIT），内容流到绘图对象的解释保留在上游。
