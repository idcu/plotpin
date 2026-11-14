/* pdf-vector.js —— 矢量 PDF 写入器（V-1 容器 / V-2 几何映射 / V-3a 图片·SMask·文字位图）
 *
 * 与位图 PDF（`Pdf`，整页 Canvas 转图）并存，不接管现有导出路径：
 * 顶点由调用方经 `outlineOf` 取（与画布/SVG/DXF 同源）；中文等文字走透明位图
 * （RGB + DeviceGray SMask），因此内容流仍只接受 ASCII 数字与运算符。
 *
 * 用法：PdfVec.docPages(595, 842, [{body: PdfVec.image('Im0',…), images:[img]}])
 *   → Uint8Array，可直接 new Blob([bytes], {type:'application/pdf'})。
 */
(function (global) {
  'use strict';
  const enc = new TextEncoder();
  const OPS = new Set(['w', 'rg', 'RG', 'm', 'l', 'c', 're', 'h', 'S', 'f', 'B']);
  const n = v => { const t = Math.round(v * 100) / 100; return Object.is(t, -0) ? '0' : String(t); };

  function stream(cmds) {
    const out = [];
    for (const c of cmds) {
      if (!OPS.has(c[0])) throw new Error('pdf-vector: 未知运算符 ' + c[0]);
      out.push(c.slice(1).map(n).join(' ') + (c.length > 1 ? ' ' : '') + c[0]);
    }
    return out.join('\n');
  }

  /* 多页版：pages = [{body, images, w?, h?}]；images 项为 {w,h,rgb,alpha}（Flate+SMask）
     或 {w,h,jpeg}（DCTDecode 整页图）。页级 w/h 覆盖本次调用的默认页面尺寸
     （图纸页 842×595 与清单页 1240×1748 混排时，MediaBox 必须逐页取真实宽高，
     否则整页图会被非等比拉伸）。对象编号：1 Catalog / 2 Pages，
     其后每页占 Page、Contents，图片与 SMask 紧随该页（编号两遍分配）。 */
  function docPages(wPt, hPt, pages) {
    const list = pages || [], metas = [];
    let next = 3;
    for (const p of list) {
      const m = { page: next++, contents: next++, imgs: [], masks: [] };
      for (const im of p.images || []) { m.imgs.push(next++); m.masks.push(im.alpha && !im.jpeg ? next++ : 0); }
      metas.push(m);
    }
    const objs = new Array(next), set = (i, head, data) => { objs[i] = { head: head, data: data }; };
    set(1, '<< /Type /Catalog /Pages 2 0 R >>');
    set(2, '<< /Type /Pages /Kids [ ' + metas.map(m => m.page + ' 0 R').join(' ') + ' ] /Count ' + list.length + ' >>');
    list.forEach((p, j) => {
      const m = metas[j], body = typeof p.body === 'string' ? p.body : stream(p.body);
      if (/[^\x00-\x7f]/.test(body)) throw new Error('pdf-vector: 内容流必须为 ASCII（文字走位图）');
      const ims = p.images || [];
      /* 逐页尺寸：缺省回落到调用参数，非法值同样回落（不允许 NaN 进 MediaBox） */
      const pw = Number(p.w) > 0 ? Number(p.w) : wPt, ph = Number(p.h) > 0 ? Number(p.h) : hPt;
      const res = ims.length ? ' /XObject << ' + ims.map((_, i) => '/Im' + i + ' ' + m.imgs[i] + ' 0 R').join(' ') + ' >>' : '';
      set(m.page, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + n(pw) + ' ' + n(ph) + ']'
        + ' /Resources <<' + res + ' >> /Contents ' + m.contents + ' 0 R >>');
      set(m.contents, '<< /Length ' + body.length + ' >>', enc.encode(body));
      ims.forEach((im, i) => {
        if (im.jpeg) {
          set(m.imgs[i], '<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h
            + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + im.jpeg.length + ' >>', im.jpeg);
        } else {
          /* SMask 只在确有 alpha 时引用：无 alpha 时写 `/SMask 0 0 R` 是非法对象引用 */
          const sm = m.masks[i] ? ' /SMask ' + m.masks[i] + ' 0 R' : '';
          set(m.imgs[i], '<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h
            + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode' + sm + ' /Length ' + im.rgb.length + ' >>', im.rgb);
          if (m.masks[i]) set(m.masks[i], '<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h
            + ' /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ' + im.alpha.length + ' >>', im.alpha);
        }
      });
    });
    const chunks = [enc.encode('%PDF-1.4\n')], offs = new Array(next).fill(0);
    let pos = chunks[0].length;
    const put = x => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); pos += b.length; };
    for (let i = 1; i < next; i++) {
      const o = objs[i];
      offs[i] = pos;
      put(i + ' 0 obj\n' + o.head);
      if (o.data) { put('\nstream\n'); put(o.data); put('\nendstream'); }
      put('\nendobj\n');
    }
    const xref = pos;
    put('xref\n0 ' + next + '\n0000000000 65535 f \n');
    for (let i = 1; i < next; i++) put(String(offs[i]).padStart(10, '0') + ' 00000 n \n');
    put('trailer\n<< /Size ' + next + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    const total = chunks.reduce((s, c) => s + c.length, 0), out = new Uint8Array(total);
    let p = 0;
    for (const c of chunks) { out.set(c, p); p += c.length; }
    return out;
  }

  /* 图片落位（pt）：q w 0 0 h x y cm /ImN Do Q，拼在内容流字符串后面 */
  function image(name, x, y, w, h) {
    return 'q ' + n(w) + ' 0 0 ' + n(h) + ' ' + n(x) + ' ' + n(y) + ' cm /' + name + ' Do Q';
  }

  /* Flate 压缩（PDF 的 zlib 封装）；环境不支持时抛错，调用方必须回退位图而不是产出坏文件 */
  async function flate(bytes) {
    if (typeof CompressionStream !== 'function') throw new Error('pdf-vector: 环境不支持 CompressionStream');
    const st = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(st).arrayBuffer());
  }

  /* 文字栅格化：默认 200 DPI；标签数 >300 由调用方降到 150（pdfVectorPlan 决定档位） */
  function textBitmap(text, sizePt, dpi, color, font) {
    const em = Math.max(1, Number(sizePt) * (Number(dpi) || 200) / 72);
    const c = document.createElement('canvas');
    const f = em + 'px ' + (font || '"Microsoft YaHei", sans-serif');
    const g = c.getContext('2d');
    g.font = f;
    const w = Math.max(1, Math.ceil(g.measureText(text).width) + 2), h = Math.ceil(em * 1.35);
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.font = f; ctx.textBaseline = 'middle'; ctx.fillStyle = color || '#111827';
    ctx.fillText(text, 1, h / 2);
    const d = ctx.getImageData(0, 0, w, h).data;
    const rgb = new Uint8Array(w * h * 3), alpha = new Uint8Array(w * h);
    for (let i = 0, p = 0, q = 0; i < d.length; i += 4, p += 3, q++) {
      rgb[p] = d[i]; rgb[p + 1] = d[i + 1]; rgb[p + 2] = d[i + 2]; alpha[q] = d[i + 3];
    }
    return { w: w, h: h, rgb: rgb, alpha: alpha };
  }

  /* 世界(米)→页面 pt：等比适配并居中。世界与 PDF 同为 Y 向上，只做缩放+平移，不翻转；
     pad 为页面四周留白（pt）。frame 取 computeWorldFrame() 的 {minX,minY,w,h}。 */
  function fit(frame, wPt, hPt, pad) {
    const f = frame || { minX: 0, minY: 0, w: 100, h: 70 };
    const p = Math.max(0, Number(pad) || 0);
    const k = Math.min((wPt - 2 * p) / Math.max(1e-9, Number(f.w) || 0),
                       (hPt - 2 * p) / Math.max(1e-9, Number(f.h) || 0));
    return {
      k: k,
      ox: (wPt - (Number(f.w) || 0) * k) / 2 - (Number(f.minX) || 0) * k,
      oy: (hPt - (Number(f.h) || 0) * k) / 2 - (Number(f.minY) || 0) * k
    };
  }
  function mapPt(f, x, y) { return [f.ox + x * f.k, f.oy + y * f.k]; }
  /* 世界点列 → 路径命令（m + l…，closed 追加 h）。坐标交给 stream 统一保留两位小数。 */
  function path(f, pts, closed) {
    const list = (pts || []).filter(p => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])));
    if (!list.length) return [];
    const cmds = [['m'].concat(mapPt(f, Number(list[0][0]), Number(list[0][1])))];
    for (let i = 1; i < list.length; i++) cmds.push(['l'].concat(mapPt(f, Number(list[i][0]), Number(list[i][1]))));
    if (closed) cmds.push(['h']);
    return cmds;
  }

  global.PdfVec = { stream: stream, docPages: docPages, fit: fit, mapPt: mapPt, path: path,
    image: image, flate: flate, textBitmap: textBitmap };
})(typeof window !== 'undefined' ? window : globalThis);
