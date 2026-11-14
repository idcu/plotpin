/* pdf-vector.js —— 矢量 PDF 写入器（V-1 容器 / V-2 几何映射 / V-3a 图片·SMask·文字位图 / V-6 文字层）
 *
 * 与位图 PDF（`Pdf`，整页 Canvas 转图）并存，不接管现有导出路径：
 * 顶点由调用方经 `outlineOf` 取（与画布/SVG/DXF 同源）。文字视觉仍走透明位图
 * （RGB + DeviceGray SMask）；页面可另带不可见文字层（Type3 空字形 + ToUnicode），
 * 只为选中/搜索/复制服务，内容流仍只接受 ASCII（文字串写成十六进制）。
 *
 * 用法：PdfVec.docPages(595, 842, [{body: PdfVec.image('Im0',…), images:[img],
 *        texts:[{t,x,y,s}]}])   // 每条文字可选 a:'l' 左对齐、b:1 表示 y 已是基线
 *   → Uint8Array，可直接 new Blob([bytes], {type:'application/pdf'})。
 */
(function (global) {
  'use strict';
  const enc = new TextEncoder();
  const OPS = new Set(['w', 'rg', 'RG', 'm', 'l', 'c', 're', 'h', 'S', 'f', 'B']);
  /* 文字层容量：每字体最多 200 个单字节码位，全文档最多 64 个字体 */
  const FONT_MAX = 200, FONT_LIMIT = 64;
  const n = v => { const t = Math.round(v * 100) / 100; return Object.is(t, -0) ? '0' : String(t); };
  const hx = v => (v < 16 ? '0' : '') + v.toString(16).toUpperCase();

  function stream(cmds) {
    const out = [];
    for (const c of cmds) {
      if (!OPS.has(c[0])) throw new Error('pdf-vector: 未知运算符 ' + c[0]);
      out.push(c.slice(1).map(n).join(' ') + (c.length > 1 ? ' ' : '') + c[0]);
    }
    return out.join('\n');
  }

  /* ---- 不可见文字层：Type3 空字形 + ToUnicode ----
     只为选中/搜索/复制服务；字形不画任何路径，像素仍全部来自位图。
     码位单字节（1..200），文字串一律十六进制，内容流保持 ASCII。 */
  const cps = t => Array.from(String(t == null ? '' : t).replace(/[\r\n\t]+/g, ' '));

  /* 默认度量：字体栈与 textBitmap 完全一致；字宽按 100px 归一到 em，
     纵向 Ascent/Descent 取字体框，缺失或非法时回退 0.88/0.12。 */
  function defaultMeasure() {
    const c = document.createElement('canvas'), g = c.getContext('2d');
    g.font = '100px "Microsoft YaHei", sans-serif';
    const m = g.measureText('国');
    const A = Number(m.fontBoundingBoxAscent), D = Number(m.fontBoundingBoxDescent);
    return {
      width: ch => g.measureText(ch).width / 100,
      ascent: Number.isFinite(A) && A > 0 ? A / 100 : 0.88,
      descent: Number.isFinite(D) && D > 0 ? D / 100 : 0.12
    };
  }

  /* 文档级注册表：按首次出现顺序分配码位，每 200 个字符一个字体 */
  function glyphRegistry(pages, measure) {
    const chars = [], index = new Map();
    for (const p of pages) for (const t of p.texts || []) for (const ch of cps(t.t)) {
      if (index.has(ch)) continue;
      index.set(ch, chars.length);
      const w = Number(measure.width(ch));
      chars.push({ ch: ch, w: Math.max(1, Math.round(Number.isFinite(w) ? w * 1000 : 1000)) });
    }
    const fonts = [];
    for (let i = 0; i < chars.length; i += FONT_MAX) fonts.push({ start: i, count: Math.min(FONT_MAX, chars.length - i) });
    return { chars: chars, fonts: fonts, index: index };
  }

  /* UTF-16BE 十六进制：非 BMP 字符按代理对写 4 字节 */
  function utf16be(ch) {
    let out = '';
    for (let i = 0; i < ch.length; i++) { const u = ch.charCodeAt(i); out += hx(u >> 8) + hx(u & 255); }
    return out;
  }

  /* ToUnicode CMap：单字节码空间；bfchar 每块最多 100 条 */
  function toUnicodeCMap(chars) {
    const out = ['/CIDInit /ProcSet findresource begin', '12 dict begin', 'begincmap',
      '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
      '/CMapName /Adobe-Identity-UCS def', '/CMapType 2 def',
      '1 begincodespacerange', '<01> <FF>', 'endcodespacerange'];
    for (let i = 0; i < chars.length; i += 100) {
      const chunk = chars.slice(i, i + 100);
      out.push(chunk.length + ' beginbfchar');
      chunk.forEach((c, j) => out.push('<' + hx(i + j + 1) + '> <' + utf16be(c.ch) + '>'));
      out.push('endbfchar');
    }
    out.push('endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end');
    return out.join('\n') + '\n';
  }

  /* 单页文字流：BT 3 Tr（不可见）→ 每条文字一次 Tm + Tf + 十六进制 Tj → ET。
     默认水平居中口径与位图一致（宽度和的一半左移），基线由 middle 基线换算。
     `a:'l'` 改为左对齐（x 即文字左缘，清单页单元格用）；`b:1` 表示 y 已经是基线
     （清单页按画布基线落位，不再做 middle→baseline 换算）。两者缺省时行为不变。 */
  function textStream(texts, reg, measure) {
    const A = Number(measure.ascent) > 0 ? Number(measure.ascent) : 0.88;
    const D = Number(measure.descent) > 0 ? Number(measure.descent) : 0.12;
    const used = new Set(), out = ['BT', '3 Tr'];
    let lines = 0;
    for (const t of texts || []) {
      const list = cps(t.t);
      if (!list.length) continue;
      const s = Number(t.s) > 0 ? Number(t.s) : 10;
      let wsum = 0, cur = -1, hex = '', segs = [];
      for (const ch of list) {
        const gi = reg.index.get(ch);
        if (gi === undefined) continue;
        const fi = Math.floor(gi / FONT_MAX);
        if (fi !== cur) { if (hex) segs.push([cur, hex]); cur = fi; hex = ''; }
        hex += hx(gi % FONT_MAX + 1);
        wsum += reg.chars[gi].w;
        used.add(fi);
      }
      if (hex) segs.push([cur, hex]);
      if (!segs.length) continue;
      /* 字宽为千分之一 em：总宽 pt = Σw/1000×s；与位图「按文字宽度居中」同口径 */
      const x0 = t.a === 'l' ? Number(t.x) : Number(t.x) - wsum / 1000 * s / 2;
      const y0 = t.b ? Number(t.y) : Number(t.y) - (A - D) / 2 * s;
      out.push('1 0 0 1 ' + n(x0) + ' ' + n(y0) + ' Tm');
      for (const seg of segs) out.push('/T' + seg[0] + ' ' + n(s) + ' Tf <' + seg[1] + '> Tj');
      lines++;
    }
    out.push('ET');
    return lines ? { body: out.join('\n'), fonts: Array.from(used).sort((a, b) => a - b) } : { body: '', fonts: [] };
  }

  /* 多页版：pages = [{body, images, texts?, w?, h?}]；images 项为 {w,h,rgb,alpha}（Flate+SMask）
     或 {w,h,jpeg}（DCTDecode 整页图）。页级 w/h 覆盖本次调用的默认页面尺寸
     （图纸页 842×595 与清单页 1240×1748 混排时，MediaBox 必须逐页取真实宽高，
     否则整页图会被非等比拉伸）。texts 为页面 pt 坐标 [{t,x,y,s,a?,b?}]（a:'l' 左对齐、
     b:1 表示 y 已是基线），写成独立文字流；
     全文档共用一套 Type3 字体（每 200 码一个）。opt.measure 可注入度量函数（自测用），
     opt.report 回填 {chars, fonts, skipped}。对象编号：1 Catalog / 2 Pages，
     其后每页占 Page、Contents、文字流（有文字时），图片与 SMask 紧随该页，
     字体与 ToUnicode 排在末尾（编号两遍分配）。 */
  function docPages(wPt, hPt, pages, opt) {
    const list = pages || [], o = opt || {}, measure = o.measure || defaultMeasure();
    let reg = glyphRegistry(list, measure), skip = '';
    if (reg.fonts.length > FONT_LIMIT) {
      skip = '唯一字符 ' + reg.chars.length + ' 个，超过 ' + (FONT_LIMIT * FONT_MAX) + ' 上限';
      reg = { chars: [], fonts: [], index: new Map() };
    }
    const metas = [];
    let next = 3;
    for (const p of list) {
      const m = { page: next++, contents: next++, imgs: [], masks: [], text: 0, fonts: [], body: '' };
      for (const im of p.images || []) { m.imgs.push(next++); m.masks.push(im.alpha && !im.jpeg ? next++ : 0); }
      if (!skip) {
        const ts = textStream(p.texts, reg, measure);
        if (ts.body) { m.text = next++; m.body = ts.body; m.fonts = ts.fonts; }
      }
      metas.push(m);
    }
    const fontObjs = reg.fonts.map(f => {
      const fo = { font: next++, toUnicode: next++, procs: [] };
      for (let i = 0; i < f.count; i++) fo.procs.push(next++);
      return fo;
    });
    const objs = new Array(next), set = (i, head, data) => { objs[i] = { head: head, data: data }; };
    set(1, '<< /Type /Catalog /Pages 2 0 R >>');
    set(2, '<< /Type /Pages /Kids [ ' + metas.map(m => m.page + ' 0 R').join(' ') + ' ] /Count ' + list.length + ' >>');
    list.forEach((p, j) => {
      const m = metas[j], body = typeof p.body === 'string' ? p.body : stream(p.body);
      if (/[^\x00-\x7f]/.test(body)) throw new Error('pdf-vector: 内容流必须为 ASCII（文字走位图/十六进制文字层）');
      const ims = p.images || [];
      /* 逐页尺寸：缺省回落到调用参数，非法值同样回落（不允许 NaN 进 MediaBox） */
      const pw = Number(p.w) > 0 ? Number(p.w) : wPt, ph = Number(p.h) > 0 ? Number(p.h) : hPt;
      const res = ims.length ? ' /XObject << ' + ims.map((_, i) => '/Im' + i + ' ' + m.imgs[i] + ' 0 R').join(' ') + ' >>' : '';
      const fontRes = m.fonts.length ? ' /Font << ' + m.fonts.map(fi => '/T' + fi + ' ' + fontObjs[fi].font + ' 0 R').join(' ') + ' >>' : '';
      const contents = m.text ? '[ ' + m.contents + ' 0 R ' + m.text + ' 0 R ]' : m.contents + ' 0 R';
      set(m.page, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + n(pw) + ' ' + n(ph) + ']'
        + ' /Resources <<' + res + fontRes + ' >> /Contents ' + contents + ' >>');
      set(m.contents, '<< /Length ' + body.length + ' >>', enc.encode(body));
      if (m.text) set(m.text, '<< /Length ' + m.body.length + ' >>', enc.encode(m.body));
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
    /* 字体对象：空字形只声明宽度（d0），不画任何内容；ToUnicode 负责可提取文字 */
    reg.fonts.forEach((f, fi) => {
      const fo = fontObjs[fi], chars = reg.chars.slice(f.start, f.start + f.count);
      const cmap = toUnicodeCMap(chars), cmapBytes = enc.encode(cmap);
      set(fo.font, '<< /Type /Font /Subtype /Type3 /FontBBox [0 -200 1000 800] /FontMatrix [0.001 0 0 0.001 0 0]'
        + ' /CharProcs << ' + fo.procs.map((id, i) => '/g' + (i + 1) + ' ' + id + ' 0 R').join(' ') + ' >>'
        + ' /Encoding << /Type /Encoding /Differences [' + fo.procs.map((_, i) => (i + 1) + ' /g' + (i + 1)).join(' ') + ' ] >>'
        + ' /FirstChar 1 /LastChar ' + f.count + ' /Widths [' + chars.map(c => c.w).join(' ') + ']'
        + ' /Resources << >> /ToUnicode ' + fo.toUnicode + ' 0 R >>');
      set(fo.toUnicode, '<< /Length ' + cmapBytes.length + ' >>', cmapBytes);
      chars.forEach((c, i) => {
        const d = c.w + ' 0 d0';
        set(fo.procs[i], '<< /Length ' + d.length + ' >>', enc.encode(d));
      });
    });
    if (o.report) { o.report.chars = reg.chars.length; o.report.fonts = reg.fonts.length; o.report.skipped = skip; }
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
