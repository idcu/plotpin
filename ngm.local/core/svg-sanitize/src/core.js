/* core.js —— @local/core-svg-sanitize 的 UMD 实现
 *
 * 输入是用户 SVG / 符号 JSON，输出是只含几何的 {paths, vb} 或 ObjectType 列表；
 * 所有业务常量（上限、viewBox、分类、默认色）由调用方注入，模块自身不读全局状态。
 */
(function (global) {
  'use strict';

  const DEFAULT_LIMITS = Object.freeze({
    SVG_BYTES: 64 * 1024,
    SVG_ELEMENTS: 200,
    SVG_DEPTH: 16,
    PATHS: 200,
    PATH_CHARS: 5000,
    BUNDLE_SYMBOLS: 200,
    NAME_CHARS: 40,
    ALIASES: 8,
    ALIAS_CHARS: 24
  });

  function createSymbolSanitizer(opts) {
    const o = opts || {};
    const LIMITS = Object.assign({}, DEFAULT_LIMITS, o.limits || {});
    const VB = o.viewBox || { x: 0, y: 0, w: 24, h: 24 };
    const CATS = Array.isArray(o.categories) ? o.categories : [];
    const DEFAULT_COLOR = o.defaultColor || '#7c3aed';

    const attr = (tag, name) => {
      const m = tag.match(new RegExp(name + '\\s*=\\s*["\']([^"\']*)["\']', 'i'));
      return m ? m[1] : null;
    };
    const num = (tag, name, fb = 0) => {
      const v = attr(tag, name);
      const n = v === null ? NaN : Number(String(v).replace(/[^\d.eE+-]/g, ''));
      return Number.isFinite(n) ? n : fb;
    };

    /** 统一 path 校验：路径数、单条长度、字符白名单；返回新数组，绝不静默修改 */
    function normalizePaths(raw) {
      if (!Array.isArray(raw) || !raw.length) throw new Error('符号缺少可渲染路径');
      if (raw.length > LIMITS.PATHS) throw new Error('图元路径过多（最多 ' + LIMITS.PATHS + ' 条）');
      const out = [];
      for (const item of raw) {
        const d = typeof item === 'string' ? item : (item && item.d);
        if (typeof d !== 'string' || !d.trim()) continue;
        const text = d.trim();
        if (text.length > LIMITS.PATH_CHARS) throw new Error('单条 path 过长（最多 ' + LIMITS.PATH_CHARS + ' 字符）');
        if (!/^[MmZzLlHhVvCcSsQqTtAa0-9.,+\-eE\s]+$/.test(text)) throw new Error('path 含非法字符');
        if (!/^[Mm]/.test(text)) throw new Error('path 必须以 M/m 起始');
        out.push({ d: text, fill: !!(item && item.fill) });
      }
      if (!out.length) throw new Error('符号缺少可渲染路径');
      return out;
    }

    /** viewBox 归一：非法/非正尺寸回退默认，避免编辑器/导出出现零尺寸 */
    function normalizeViewBox(raw) {
      if (!raw || typeof raw !== 'object') return Object.assign({}, VB);
      const a = [raw.x, raw.y, raw.w, raw.h].map(Number);
      if (!a.every(Number.isFinite) || a[2] <= 0 || a[3] <= 0 || a[2] > 50000 || a[3] > 50000) return Object.assign({}, VB);
      return { x: a[0], y: a[1], w: a[2], h: a[3] };
    }

    function normalizeAliases(raw) {
      return (Array.isArray(raw) ? raw : [])
        .map(x => String(x || '').trim().slice(0, LIMITS.ALIAS_CHARS)).filter(Boolean).slice(0, LIMITS.ALIASES);
    }

    /** 安全扫描：字节 / 元素 / 嵌套 / 脚本 / 事件 / 外链 / 危险标签，逐条给出原因 */
    function assertSafe(src) {
      if (src.length > LIMITS.SVG_BYTES) throw new Error('SVG 超过 ' + (LIMITS.SVG_BYTES / 1024) + ' KB 上限（当前 ' + src.length + ' 字符）');
      if (/<!DOCTYPE|<!ENTITY/i.test(src)) throw new Error('SVG 含 DOCTYPE/ENTITY 声明，已拒绝');
      if (/<script\b/i.test(src)) throw new Error('SVG 含 script 脚本，已拒绝');
      if (/\son\w+\s*=/i.test(src)) throw new Error('SVG 含 on* 事件属性（如 onload），已拒绝');
      const forbidden = src.match(/<(foreignObject|iframe|object|embed|image|use|style|audio|video|canvas|animate|set|link|meta|base)\b/i);
      if (forbidden) throw new Error('SVG 含不允许的元素 <' + forbidden[1] + '>，已拒绝');
      for (const m of src.matchAll(/(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
        const v = (m[1] || m[2] || m[3] || '').trim();
        if (v && !v.startsWith('#')) throw new Error('SVG 引用外部资源（href=' + v.slice(0, 40) + '），已拒绝');
      }
      const tags = [...src.matchAll(/<\/?([A-Za-z][\w:.-]*)\b[^>]*>/g)];
      const open = tags.filter(m => !m[0].startsWith('</'));
      if (open.length > LIMITS.SVG_ELEMENTS) throw new Error('SVG 元素过多（最多 ' + LIMITS.SVG_ELEMENTS + ' 个，当前 ' + open.length + ' 个）');
      let depth = 0, max = 0;
      const box = /^(svg|g|defs|symbol|clipPath|mask|marker|pattern|filter|switch)$/i;
      for (const m of tags) {
        const closing = m[0].startsWith('</');
        const self = m[0].endsWith('/>');
        if (!box.test(m[1])) continue;
        if (closing) depth--;
        else if (!self) depth++;
        if (depth > max) max = depth;
        if (depth > LIMITS.SVG_DEPTH) throw new Error('SVG 嵌套过深（最多 ' + LIMITS.SVG_DEPTH + ' 层）');
      }
    }

    /**
     * 解析用户 SVG：提取 path/circle/rect/polygon/line/polyline 为 {d,fill} 与 viewBox。
     * 只保留几何数据；脚本/事件/外链/超限一律拒绝并给出原因。
     */
    function parseSvg(text) {
      const src = String(text || '');
      assertSafe(src);
      const vbRaw = src.match(/viewBox\s*=\s*["']([^"']+)["']/i);
      const vb = vbRaw && vbRaw[1].split(/[\s,]+/).length === 4
        ? normalizeViewBox({ x: vbRaw[1].split(/[\s,]+/)[0], y: vbRaw[1].split(/[\s,]+/)[1], w: vbRaw[1].split(/[\s,]+/)[2], h: vbRaw[1].split(/[\s,]+/)[3] })
        : Object.assign({}, VB);
      const paths = [];
      const push = (d, fill) => { if (d && String(d).trim()) paths.push({ d: String(d).trim(), fill: !!fill }); };
      for (const m of src.matchAll(/<path\b[^>]*>/gi)) {
        const tag = m[0], d = attr(tag, 'd');
        if (d) push(d, attr(tag, 'fill') && attr(tag, 'fill').toLowerCase() !== 'none');
      }
      for (const m of src.matchAll(/<circle\b[^>]*>/gi)) {
        const tag = m[0], cx = num(tag, 'cx'), cy = num(tag, 'cy'), r = num(tag, 'r');
        if (r > 0) push('M' + (cx - r) + ' ' + cy + 'a' + r + ' ' + r + ' 0 1 0 ' + (2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + (-2 * r) + ' 0', false);
      }
      for (const m of src.matchAll(/<rect\b[^>]*>/gi)) {
        const tag = m[0], x = num(tag, 'x'), y = num(tag, 'y'), w = num(tag, 'width'), h = num(tag, 'height');
        if (w > 0 && h > 0) push('M' + x + ' ' + y + 'h' + w + 'v' + h + 'h' + (-w) + 'z', false);
      }
      for (const m of src.matchAll(/<(polygon|polyline)\b[^>]*>/gi)) {
        const pts = (attr(m[0], 'points') || '').trim().replace(/\s+/g, ' ');
        if (pts) push('M' + pts.replace(/ /g, ' L') + (m[1].toLowerCase() === 'polygon' ? ' Z' : ''), false);
      }
      for (const m of src.matchAll(/<line\b[^>]*>/gi)) {
        const tag = m[0];
        push('M' + num(tag, 'x1') + ' ' + num(tag, 'y1') + 'L' + num(tag, 'x2') + ' ' + num(tag, 'y2'), false);
      }
      if (!paths.length) throw new Error('SVG 中未找到可用图形（支持 path/circle/rect/polygon/line/polyline）');
      return { paths: normalizePaths(paths), vb };
    }

    /** 导入 JSON → 完整 ObjectType 列表；只追加到调用方工程，id 冲突自动改名 */
    function sanitizeBundle(raw, usedIds) {
      const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.symbols) ? raw.symbols : null);
      if (!list) throw new Error('符号 JSON 缺少 symbols 数组');
      if (list.length > LIMITS.BUNDLE_SYMBOLS) throw new Error('单次导入符号过多（最多 ' + LIMITS.BUNDLE_SYMBOLS + ' 个）');
      const used = new Set(Array.isArray(usedIds) ? usedIds : []);
      return list.map((item, i) => {
        if (!item || typeof item !== 'object') throw new Error('第 ' + (i + 1) + ' 个符号格式无效');
        const name = String(item.name || '').trim().slice(0, LIMITS.NAME_CHARS) || ('导入符号 ' + (i + 1));
        const paths = normalizePaths(item.paths);
        const views = normalizeViewBox(item.views || item.symbolViewBox);
        let id = String(item.id || '').trim();
        if (!/^[A-Za-z0-9_.-]{2,60}$/.test(id) || used.has(id)) {
          let n = i + 1, base;
          do { base = 'sym.import.' + n; n++; } while (used.has(base));
          id = base;
        }
        used.add(id);
        const cat = CATS.includes(item.cat) ? item.cat : (CATS[CATS.length - 1] || '其他');
        const color = /^#[0-9a-f]{3,8}$/i.test(String(item.color || '')) ? String(item.color) : DEFAULT_COLOR;
        return {
          id, kind: 'point', name, color, icon: 'symbol', builtin: false, scaleShape: 'none',
          category: cat, symbolAliases: normalizeAliases(item.aliases), symbol: paths, symbolViewBox: views
        };
      });
    }

    return { normalizePaths, normalizeViewBox, normalizeAliases, assertSafe, parseSvg, sanitizeBundle, LIMITS };
  }

  global.__localSvgSanitize = { createSymbolSanitizer, DEFAULT_LIMITS };
})(typeof window !== 'undefined' ? window : globalThis);
