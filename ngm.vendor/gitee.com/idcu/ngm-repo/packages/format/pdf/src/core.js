/* pdf.js —— 零依赖 PDF 结构解析（对象树 / 页面列表 / 内容流原文 / 流解码）
 * 只负责 PDF 语法与容器层：不生成任何绘图对象，内容流的语义由调用方解释。
 * FlateDecode 通过注入解码器实现（浏览器可用 DecompressionStream，Node 可用 zlib），保持零依赖。
 * UMD-lite：Node CJS 走 module.exports，浏览器/ESM 走 globalThis.__idcuPdf。 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.__idcuPdf = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PT_TO_METER = 0.0254 / 72;
  /* 读取上限：防止畸形/超大 PDF 与解压炸弹耗尽内存（调用方可传入更小的 limits） */
  const PDF_LIMITS = { maxBytes: 50 * 1024 * 1024, maxPages: 300, maxObjects: 20000, maxInflateBytes: 64 * 1024 * 1024 };

  function bytesToBinary(bytes) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) { s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH)); }
    return s;
  }

  function binaryToBytes(s) {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
  }

  /* ---------------- 字典小工具 ---------------- */
  function dictName(dict, name) {
    const m = dict.match(new RegExp('/' + name + '\\s+/([^\\s\\[\\]<>(){}%]+)'));
    return m ? m[1] : null;
  }
  function dictNumber(dict, name) {
    const m = dict.match(new RegExp('/' + name + '\\s+(-?\\d+(?:\\.\\d+)?)'));
    return m ? parseFloat(m[1]) : null;
  }
  function dictArray(dict, name) {
    const m = dict.match(new RegExp('/' + name + '\\s*\\[([^\\]]*)\\]'));
    if (!m) return null;
    const nums = m[1].match(/-?\d+(?:\.\d+)?/g);
    return nums ? nums.map(Number) : null;
  }
  function dictRef(dict, name) {
    const m = dict.match(new RegExp('/' + name + '\\s+(\\d+)\\s+(\\d+)\\s+R'));
    return m ? { num: +m[1], gen: +m[2] } : null;
  }
  /* /Name 后可能是直接字典；只取内联内容字符串（间接引用由调用方自行解析） */
  function dictRawBlock(dict, name) {
    const m = dict.match(new RegExp('/' + name + '\\s*(<<[\\s\\S]*?>>)'));
    return m ? m[1] : null;
  }

  /* ---------------- 对象扫描 ---------------- */
  function scanObjects(bin) {
    const map = new Map();
    const re = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;
    let m;
    while ((m = re.exec(bin))) {
      const num = +m[1], body = m[3];
      const si = body.search(/stream[\r\n]/);
      let dict = body, data = null;
      if (si >= 0) {
        dict = body.slice(0, si);
        const after = body.slice(si);
        const nl = after.startsWith('stream\r\n') ? 8 : (after.startsWith('stream\n') ? 7 : 6);
        let start = si + nl, end = body.indexOf('endstream', si);
        const len = dictNumber(dict, 'Length');
        if (Number.isFinite(len)) {
          let e2 = start + len;
          if (body[e2 - 1] === '\n') e2--;
          if (body[e2 - 1] === '\r') e2--;
          if (body.slice(e2).indexOf('endstream') === 0) end = e2;
        }
        if (end >= start) data = body.slice(start, end);
      }
      map.set(num, { dict, data });
    }
    return map;
  }

  /** 过滤链：/Filter 可能是单个名或数组 */
  function filtersOf(dict) {
    const arr = dict.match(/\/Filter\s*\[([^\]]*)\]/);
    if (arr) return arr[1].match(/\/\w+/g).map(s => s.slice(1));
    const f = dictName(dict, 'Filter');
    return f ? [f] : [];
  }

  /**
   * 解码单个流对象。
   * opt.inflate: async (bytes) => Uint8Array，用于 FlateDecode（必须由调用方注入）；
   * opt.maxInflateBytes: 解压后大小上限（仅在本函数内检查，注入器可自行更早拒绝）。
   * 返回 {bytes, binary, text}：DCTDecode 原样返回二进制；其余给出 text 便于内容流使用。
   */
  async function decodeStream(obj, opt) {
    opt = opt || {};
    if (obj.data === null) return '';
    const filters = filtersOf(obj.dict);
    let bytes = binaryToBytes(obj.data);
    let isBinary = false;
    for (const fl of filters) {
      if (fl === 'FlateDecode') {
        if (typeof opt.inflate !== 'function') throw new Error('PDF FlateDecode 需要注入 inflate 解码器');
        bytes = await opt.inflate(bytes);
        if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
        if (opt.maxInflateBytes && bytes.length > opt.maxInflateBytes) {
          throw new Error('PDF 内嵌流解压后超过 ' + (opt.maxInflateBytes / 1048576) + 'MB 上限，疑似解压炸弹');
        }
        isBinary = true;
      } else if (fl === 'LZWDecode') {
        bytes = lzwDecode(bytes);
        isBinary = true;
      } else if (fl === 'DCTDecode') {
        return { bytes, binary: true };
      } else if (fl === 'ASCIIHexDecode' || fl === 'ASCII85Decode') {
        /* 罕见，忽略 */
      }
    }
    return { bytes, binary: isBinary, text: bytesToBinary(bytes) };
  }

  /**
   * PDF LZW 解码：9–12 位变长码，256=Clear，257=EOD，258 起为字典；earlyChange=1 时提前一位扩宽。
   * 不依赖任何外部库。
   */
  function lzwDecode(bytes, earlyChange) {
    const ec = earlyChange === undefined ? 1 : Number(earlyChange);
    const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    let bitPos = 0, codeLen = 9, next = 258, prev = null, dict = [];
    const reset = () => {
      dict = new Array(4096);
      for (let i = 0; i < 256; i++) dict[i] = [i];
      next = 258; codeLen = 9; prev = null;
    };
    const readCode = () => {
      if (bitPos + codeLen > src.length * 8) return -1;
      let v = 0;
      for (let i = 0; i < codeLen; i++) {
        const bit = (src[bitPos >> 3] >> (7 - (bitPos & 7))) & 1;
        v = (v << 1) | bit;
        bitPos++;
      }
      return v;
    };
    reset();
    const out = [];
    for (;;) {
      const code = readCode();
      if (code < 0) break;
      if (code === 256) { reset(); continue; }
      if (code === 257) break;
      let entry = dict[code];
      if (!entry && code === next && prev) entry = prev.concat(prev[0]);
      if (!entry) break;
      for (const b of entry) out.push(b);
      if (prev && next < 4096) dict[next++] = prev.concat(entry[0]);
      prev = entry;
      /* 解码器字典比编码器晚一条：提前一条判断扩宽，保证与 EarlyChange=1 编码器同步 */
      if (next + 1 + ec >= (1 << codeLen) && codeLen < 12) codeLen++;
    }
    return Uint8Array.from(out);
  }

  /**
   * 解包 /ObjStm（压缩对象流）：流内只含字典对象，头部是 N 组「对象号 偏移」，
   * 正文按偏移切片补进对象表。需要解码器时同样走注入的 inflate。
   */
  async function unpackObjectStreams(objects, opt) {
    opt = opt || {};
    const streams = [];
    for (const o of objects.values()) {
      if (o && o.data !== null && /\/Type\s*\/ObjStm\b/.test(o.dict)) streams.push(o);
    }
    for (const s of streams) {
      let dec;
      try { dec = await decodeStream(s, opt); } catch (_) { continue; }
      const text = dec && typeof dec.text === 'string' ? dec.text : '';
      if (!text) continue;
      const n = dictNumber(s.dict, 'N'), first = dictNumber(s.dict, 'First');
      if (!(n > 0) || !(first >= 0) || first > text.length) continue;
      const header = text.slice(0, Math.floor(first));
      const pairs = [...header.matchAll(/(\d+)\s+(\d+)/g)].slice(0, n).map((m) => ({ num: +m[1], off: +m[2] }));
      if (!pairs.length) continue;
      pairs.forEach((p, i) => {
        const start = Math.floor(first) + p.off;
        const end = i + 1 < pairs.length ? Math.floor(first) + pairs[i + 1].off : text.length;
        if (start < 0 || start >= text.length || end <= start) return;
        if (!objects.has(p.num)) objects.set(p.num, { dict: text.slice(start, end), data: null });
      });
    }
    return objects;
  }

  /** CMYK 原始像素（4 通道）→ RGB（3 通道），用于图像流解码后的颜色空间转换 */
  function cmykToRgb(cmyk) {
    const src = cmyk instanceof Uint8Array ? cmyk : new Uint8Array(cmyk || []);
    const n = Math.floor(src.length / 4);
    const out = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) {
      const c = src[i * 4], m = src[i * 4 + 1], y = src[i * 4 + 2], k = src[i * 4 + 3];
      out[i * 3] = Math.round((255 - c) * (255 - k) / 255);
      out[i * 3 + 1] = Math.round((255 - m) * (255 - k) / 255);
      out[i * 3 + 2] = Math.round((255 - y) * (255 - k) / 255);
    }
    return out;
  }

  /* ---------------- 内容流词法分析（只分词，不解释语义） ---------------- */
  function tokenizeContent(str) {
    const toks = [];
    let i = 0;
    while (i < str.length) {
      const ch = str[i];
      if (ch === ' ' || ch === '\r' || ch === '\n' || ch === '\t') { i++; continue; }
      if (ch === '%') { while (i < str.length && str[i] !== '\n') i++; continue; }
      if (ch === '(') {
        let depth = 1, j = i + 1, out = '';
        while (j < str.length && depth > 0) {
          const c = str[j];
          if (c === '\\') {
            const n = str[j + 1];
            if (n === 'n') out += '\n';
            else if (n === 'r') out += '\r';
            else if (n === 't') out += '\t';
            else if (n === '(' || n === ')' || n === '\\') out += n;
            else if (n >= '0' && n <= '7') {
              let oct = n; let k = j + 2;
              while (k < j + 4 && str[k] >= '0' && str[k] <= '7') { oct += str[k]; k++; }
              out += String.fromCharCode(parseInt(oct, 8) & 0xff); j = k; continue;
            } else out += n === undefined ? '' : n;
            j += 2; continue;
          }
          if (c === '(') { depth++; out += c; }
          else if (c === ')') { depth--; if (depth > 0) out += c; }
          else out += c;
          j++;
        }
        toks.push({ t: 'str', v: out }); i = j + 1; continue;
      }
      if (ch === '<') {
        const j = str.indexOf('>', i + 1);
        toks.push({ t: 'hex', v: str.slice(i + 1, j < 0 ? str.length : j) }); i = (j < 0 ? str.length : j + 1); continue;
      }
      if (ch === '[') { toks.push({ t: '[', v: '[' }); i++; continue; }
      if (ch === ']') { toks.push({ t: ']', v: ']' }); i++; continue; }
      if (ch === '/') {
        let j = i + 1; while (j < str.length && !/[\s\[\]()<>{}%/]/.test(str[j])) j++;
        toks.push({ t: 'name', v: str.slice(i + 1, j) }); i = j; continue;
      }
      const num = /[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?/.exec(str.slice(i));
      if (num && /[-.+\d]/.test(ch)) { toks.push({ t: 'num', v: parseFloat(num[0]) }); i += num[0].length; continue; }
      let j = i; while (j < str.length && /[A-Za-z'"]/.test(str[j])) j++;
      if (j > i) { toks.push({ t: 'op', v: str.slice(i, j) }); i = j; continue; }
      i++;
    }
    return toks;
  }

  /* ---------------- 页面集合 ---------------- */
  /** 取页面 MediaBox：本页直接数组，或沿 /Parent 链继承；缺省 612×792（US Letter） */
  function pageMediaBox(dict, objects) {
    let box = dictArray(dict, 'MediaBox');
    let d = dict, hops = 0;
    while (!box && hops < 8) {
      const p = dictRef(d, 'Parent');
      if (!p) break;
      const po = objects.get(p.num); if (!po) break;
      box = dictArray(po.dict, 'MediaBox'); d = po.dict; hops++;
    }
    box = box || [0, 0, 612, 792];
    return { x: box[0], y: box[1], width: box[2] - box[0], height: box[3] - box[1], raw: box };
  }

  /** 页面内容流引用：单个 /Contents 或数组 */
  function pageContentRefs(dict) {
    const ref = dictRef(dict, 'Contents');
    if (ref) return [ref.num];
    const cm = dict.match(/\/Contents\s*\[([\s\S]*?)\]/);
    if (!cm) return [];
    return [...cm[1].matchAll(/(\d+)\s+\d+\s*R/g)].map(x => +x[1]);
  }

  /**
   * 解析 PDF 结构。返回：
   *   { objects: Map<num,{dict,data}>, pages: [{num, dict, mediaBox, contentRefs, contents, contentText}] }
   * 不解释内容流，不生成任何图形对象。
   */
  async function parse(input, opt) {
    opt = opt || {};
    const L = Object.assign({}, PDF_LIMITS, opt.limits || {});
    const src = input instanceof Uint8Array ? input
      : typeof input === 'string' ? binaryToBytes(input)
      : new Uint8Array(input);
    if (src.length > L.maxBytes) throw new Error('PDF 过大（超过 ' + (L.maxBytes / 1048576) + 'MB 上限），请拆分后导入');
    if (String.fromCharCode(src[0], src[1], src[2], src[3]) !== '%PDF') throw new Error('不是有效的 PDF 文件');
    const bin = bytesToBinary(src);
    const objects = scanObjects(bin);
    await unpackObjectStreams(objects, { inflate: opt.inflate, maxInflateBytes: L.maxInflateBytes });
    if (objects.size > L.maxObjects) throw new Error('PDF 对象数超过上限 ' + L.maxObjects + '，请拆分后导入');

    const pageObjs = [];
    for (const [num, o] of objects) {
      if (/\/Type\s*\/Page(?!s)/.test(o.dict)) pageObjs.push({ num, obj: o });
    }
    if (!pageObjs.length) throw new Error('PDF 中未找到页面');
    if (pageObjs.length > L.maxPages) throw new Error('PDF 页数超过上限 ' + L.maxPages + ' 页，请拆分后导入');

    const pages = [];
    for (const { num, obj } of pageObjs) {
      const mediaBox = pageMediaBox(obj.dict, objects);
      const contentRefs = pageContentRefs(obj.dict);
      const contents = [];
      let contentText = '';
      for (let k = 0; k < contentRefs.length; k++) {
        const co = objects.get(contentRefs[k]);
        if (!co) continue;
        const d = await decodeStream(co, { inflate: opt.inflate, maxInflateBytes: L.maxInflateBytes });
        const text = d.text || '';
        contents.push({ num: contentRefs[k], bytes: d.bytes, binary: d.binary, text });
        /* 与原实现一致：数组内容流之间以换行分隔，单个引用不加分隔 */
        contentText += text + (contentRefs.length > 1 ? '\n' : '');
      }
      pages.push({ num, dict: obj.dict, mediaBox, contentRefs, contents, contentText });
    }
    return { objects, pages };
  }

  return {
    PT_TO_METER, PDF_LIMITS,
    bytesToBinary, binaryToBytes,
    dictName, dictNumber, dictArray, dictRef, dictRawBlock,
    scanObjects, filtersOf, decodeStream, tokenizeContent,
    unpackObjectStreams, lzwDecode, cmykToRgb,
    parse
  };
});
