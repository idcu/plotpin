/* qr.js —— 零依赖二维码编码器（字节模式，Version 3 / 纠错等级 M，29×29）
 *
 * 为什么固定 Version 3-M：设备标签只需短载荷（PLOTPIN:编号，≤42 字节），
 * 该版本为单一 RS 块（44 数据码字 + 26 纠错码字），实现规模小且可完整自测。
 * 能力：GF(256) Reed-Solomon、8 种掩码与惩罚规则、BCH 格式信息。
 * 导出：Qr.encodeText(text) → { size, modules, mask }; Qr.byteLength(text)
 */
(function (global) {
  'use strict';
  const SIZE = 29, VERSION = 3, DATA_CW = 44, EC_CW = 26, TOTAL_CW = 70, MAX_BYTES = 42;

  /* ---- GF(256)：本原多项式 0x11D ---- */
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  /* ---- Reed-Solomon：26 个纠错码字 ---- */
  function polyMul(a, b) {
    const out = new Array(a.length + b.length - 1).fill(0);
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] ^= gfMul(a[i], b[j]);
    return out;
  }
  function rsEc(data) {
    let gen = [1];
    for (let i = 0; i < EC_CW; i++) gen = polyMul(gen, [1, EXP[i]]);
    const rem = new Array(EC_CW).fill(0);
    for (const b of data) {
      const factor = b ^ rem[0];
      rem.shift(); rem.push(0);
      for (let i = 0; i < EC_CW; i++) rem[i] ^= gfMul(gen[i + 1], factor);
    }
    return rem;
  }

  /* ---- 格式信息：纠错等级 M(00) + 掩码，BCH(15,5)，固定异或 0x5412 ---- */
  function formatBits(mask) {
    const data = (0 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >>> 9) & 1) * 0x537);
    return (((data << 10) | rem) ^ 0x5412) & 0x7FFF;
  }

  function maskFn(mask, r, c) {
    switch (mask) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return (r * c) % 2 + (r * c) % 3 === 0;
      case 6: return ((r * c) % 2 + (r * c) % 3) % 2 === 0;
      default: return ((r + c) % 2 + (r * c) % 3) % 2 === 0;
    }
  }

  /** 构建矩阵：功能图形 → 数据（按掩码写入）→ 格式信息 */
  function createMatrix(mask, codewords) {
    const modules = Array.from({ length: SIZE }, () => new Uint8Array(SIZE));
    const reserved = Array.from({ length: SIZE }, () => new Uint8Array(SIZE));
    const put = (r, c, v) => {
      if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return;
      modules[r][c] = v ? 1 : 0; reserved[r][c] = 1;
    };
    /* 三个定位图形 + 分隔带 */
    const finder = (r0, c0) => {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const rr = r0 + r, cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= SIZE || cc >= SIZE) continue;
        const inCore = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const dark = inCore && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        put(rr, cc, dark);
      }
    };
    finder(0, 0); finder(0, SIZE - 7); finder(SIZE - 7, 0);
    /* 定时图形 */
    for (let i = 8; i < SIZE - 8; i++) { put(6, i, i % 2 === 0); put(i, 6, i % 2 === 0); }
    /* 校正图形（Version 3 仅一个，中心 22,22） */
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const ring = Math.max(Math.abs(dr), Math.abs(dc));
      put(22 + dr, 22 + dc, ring !== 1);
    }
    /* 预留格式信息区域 */
    for (let i = 0; i < 9; i++) { if (i !== 6) { reserved[8][i] = 1; reserved[i][8] = 1; } }
    for (let i = 0; i < 8; i++) { reserved[8][SIZE - 1 - i] = 1; reserved[SIZE - 1 - i][8] = 1; }
    reserved[SIZE - 8][8] = 1;

    /* 数据放置：自右下角两列一组蛇形上行，跳过功能模块 */
    let inc = -1, row = SIZE - 1, bit = 0, byte = 0;
    for (let col = SIZE - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (;;) {
        for (let k = 0; k < 2; k++) {
          const cc = col - k;
          if (reserved[row][cc]) continue;
          let dark = false;
          if (byte < codewords.length) dark = ((codewords[byte] >>> (7 - bit)) & 1) === 1;   /* QR 规定高位先放 */
          if (maskFn(mask, row, cc)) dark = !dark;
          modules[row][cc] = dark ? 1 : 0;
          bit++;
          if (bit === 8) { bit = 0; byte++; }
        }
        row += inc;
        if (row < 0 || row >= SIZE) { row -= inc; inc = -inc; break; }
      }
    }
    /* 格式信息（15 位，按规范两处镜像写入） */
    const bits = formatBits(mask);
    for (let i = 0; i < 15; i++) {
      const dark = ((bits >> i) & 1) === 1 ? 1 : 0;
      if (i < 6) modules[i][8] = dark;
      else if (i < 8) modules[i + 1][8] = dark;
      else modules[SIZE - 15 + i][8] = dark;
      if (i < 8) modules[8][SIZE - i - 1] = dark;
      else if (i < 9) modules[8][7] = dark;
      else modules[8][14 - i] = dark;
    }
    modules[SIZE - 8][8] = 1;
    return modules;
  }

  /* ---- 掩码惩罚（规则 1/2/3/4） ---- */
  function penalty(m) {
    let p = 0, dark = 0;
    const runScore = (arr) => {
      let s = 0, run = 1;
      for (let i = 1; i <= arr.length; i++) {
        if (i < arr.length && arr[i] === arr[i - 1]) run++;
        else { if (run >= 5) s += 3 + (run - 5); run = 1; }
      }
      return s;
    };
    const finderLike = (str) => {
      let n = 0;
      for (let i = 0; i + 10 < str.length; i++) {
        const seg = str.slice(i, i + 11);
        if (seg === '10111010000' || seg === '00001011101') n++;
      }
      return n * 40;
    };
    for (let r = 0; r < SIZE; r++) {
      const row = Array.from(m[r]);
      p += runScore(row);
      p += finderLike(row.join(''));
      for (let c = 0; c < SIZE; c++) if (m[r][c]) dark++;
    }
    for (let c = 0; c < SIZE; c++) {
      const col = [];
      for (let r = 0; r < SIZE; r++) col.push(m[r][c]);
      p += runScore(col);
      p += finderLike(col.join(''));
    }
    for (let r = 0; r < SIZE - 1; r++) for (let c = 0; c < SIZE - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3;
    }
    const ratio = dark * 100 / (SIZE * SIZE);
    p += Math.floor(Math.abs(ratio - 50) / 5) * 10;
    return p;
  }

  function utf8Bytes(s) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(s));
    const out = [];
    for (const ch of unescape(encodeURIComponent(s))) out.push(ch.charCodeAt(0));
    return out;
  }
  const byteLength = (s) => utf8Bytes(String(s)).length;

  /**
   * 编码文本（字节模式，UTF-8）。超过 42 字节抛错——设备标签应改用编号作为载荷。
   * 返回 { size, modules, mask, text }。
   */
  function encodeText(text) {
    const cw = buildCodewords(text);
    let best = null;
    for (let mask = 0; mask < 8; mask++) {
      const modules = createMatrix(mask, cw);
      const score = penalty(modules);
      if (!best || score < best.score) best = { mask, score, modules };
    }
    return { size: SIZE, version: VERSION, modules: best.modules, mask: best.mask, text: String(text) };
  }
  /** 生成最终码字序列（数据 44 + 纠错 26），供掩码对比与自测使用 */
  function buildCodewords(text) {
    const bytes = utf8Bytes(String(text));
    if (bytes.length > MAX_BYTES) throw new Error('二维码内容过长（最多 ' + MAX_BYTES + ' 字节）');
    const bits = [];
    const push = (v, len) => { for (let i = len - 1; i >= 0; i--) bits.push((v >> i) & 1); };
    push(4, 4);            /* 字节模式 0100 */
    push(bytes.length, 8); /* Version 1–9 字符计数 8 位 */
    bytes.forEach(b => push(b, 8));
    const capacity = DATA_CW * 8;
    for (let i = 0; i < 4 && bits.length < capacity; i++) bits.push(0);   /* 终止符 */
    while (bits.length % 8) bits.push(0);
    const data = new Uint8Array(DATA_CW);
    for (let i = 0; i < bits.length / 8; i++) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
      data[i] = b;
    }
    /* 填充码字固定从 0xEC 开始交替（0xEC, 0x11, 0xEC, …），与起始字节序号无关 */
    for (let i = bits.length / 8, pad = 0; i < DATA_CW; i++, pad++) data[i] = pad % 2 ? 0x11 : 0xEC;
    const ec = rsEc(data);
    const cw = new Uint8Array(TOTAL_CW);
    cw.set(data); cw.set(ec, DATA_CW);
    return cw;
  }

  global.Qr = {
    encodeText, buildCodewords, byteLength, SIZE, MAX_BYTES,
    _internals: { formatBits, rsEc, maskFn, penalty, createMatrix, gfMul, EXP }
  };
})(typeof window !== 'undefined' ? window : globalThis);
