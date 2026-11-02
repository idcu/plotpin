# @idcu/format-dxf

零依赖 DXF（R12 ASCII 子集）解析与生成。入口：`src/index.mjs` / `src/index.cjs`。

```js
import { parse, build } from '@idcu/format-dxf';
const { entities, unit, insUnits } = parse(dxfText);
const text = build(entities, [{ name: '围墙', color: '#334155' }], { factor: 1000 });
```

支持：

- 解析：LINE / LWPOLYLINE（含 42 凸度圆弧段）/ POLYLINE+VERTEX / CIRCLE / ARC / ELLIPSE /
  SPLINE（De Boor）/ INSERT 块引用 / POINT / TEXT / MTEXT。
- 生成：LWPOLYLINE / CIRCLE / POINT / LINE / TEXT，输出毫米（`factor=1000`，可用选项覆盖）。
- 实体中间模型：`{ type, layer, points?, x?, y?, r?, text?, height?, closed? }`；
  解析结果统一把 LINE/ARC/ELLIPSE/SPLINE 落地为 LWPOLYLINE，便于调用方统一处理。
- `$INSUNITS` 自动换算到米；`parse(text, { maxChars, maxEntities })` 可覆盖默认上限。
- 辅助函数：`nearestAci` / `safeLayer` / `bulgeSegment` / `evalBSpline` / `sampleEllipse` / `stripMtext`。
- 不支持：ZIP 内嵌、二进制 DXF、完整 DIMENSION/HATCH 等实体。

来源：plotpin `js/common/dxf.js` @ `e9fcfb3`（MIT），见仓库根 `NOTICE.md`。
