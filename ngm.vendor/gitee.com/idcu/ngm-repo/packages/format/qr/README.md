# @idcu/format-qr

零依赖二维码编码器（字节模式，固定 Version 3 / 纠错等级 M，29×29，≤42 字节）。
入口：`src/index.mjs` / `src/index.cjs`。

```js
import { encodeText, byteLength } from '@idcu/format-qr';
const { size, modules, mask } = encodeText('PLOTPIN:P0001'); // 29×29，模块为 0/1
```

能力：GF(256) Reed-Solomon（44 数据码字 + 26 纠错码字）、8 种掩码与惩罚规则、BCH 格式信息。
超过 42 字节抛错（该版本容量上限）；需要更长载荷时应换更高版本实现，本模块刻意保持最小。

来源：plotpin `js/common/qr.js` @ `e9fcfb3`（MIT），见仓库根 `NOTICE.md`。
