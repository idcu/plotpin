# @idcu/format-zip

零依赖 ZIP 读写。入口：

- `src/index.mjs`（ESM）
- `src/index.cjs`（CommonJS，同一份 vendor 实现）

```js
import { build, readEntries, readText, decodeUtf8 } from '@idcu/format-zip';
const buf = build([{ name: 'a.txt', text: 'hello' }]);
const entries = await readEntries(buf);
console.log(readText(entries, 'a.txt')); // hello
```

能力与边界：

- 写：默认 stored（不压缩）+ CRC32；可用 `build(entries, { compress })` 注入压缩器走 method 8
  （Node 传 `zlib.deflateRawSync` 即可，模块不 import 任何压缩库）。
- 读：method 0（stored）与 method 8（deflate-raw，依赖宿主 `DecompressionStream`，Node 22+ 可用）。
- `readEntries(buffer, opt)` 的上限可逐次覆盖：`maxBytes` / `maxEntries` / `maxEntryBytes` / `maxTotalBytes`，
  默认值见 `LIMITS`（防解压炸弹）；`verifyCrc: true` 时逐条校验 CRC32（默认关闭）。
- 0.2.1：method 8 改为**流式累计**，`maxEntryBytes` 在解压过程中超限即 `cancel()` 并中止；
  即使中央目录声明的解压后大小偏小，也不会先完整展开再复核（防解压炸弹的内存峰值）。
- `readText(entries, name)` 按条目名解码，缺失返回 `null`。
- 不支持 ZIP64、加密、多卷。

来源：plotpin `js/common/zip.js` @ `e9fcfb3`（MIT），见仓库根 `NOTICE.md`。
