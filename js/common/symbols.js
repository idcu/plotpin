/* symbols.js —— 内置符号库（C-04）
 * 36 个 24×24 线性图元，六个分类：视频监控 / 门禁 / 消防 / 网络 / 停车 / 其他。
 * 每个图元 = 若干 SVG path d；画布、SVG、PNG/PDF 与 DXF 近似共用同一 path 源。
 * 另提供：
 *  - parseSvgSymbol(text)：安全解析用户 SVG（白名单 + 字节/元素/嵌套/路径上限）
 *  - searchSymbols / buildSymbolIndex：名称与别名搜索
 *  - normalizeSymbolPaths / sanitizeSymbolBundle：自定义符号统一校验
 *  - symbolPolylinesInWorld：DXF 折线近似（明确降级，不静默丢符号）
 */
(function (global) {
  'use strict';
  const VB = { x: 0, y: 0, w: 24, h: 24 };
  const CATS = Object.freeze(['视频监控', '门禁', '消防', '网络', '停车', '其他']);
  const LIMITS = Object.freeze({
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
  const s = (id, name, cat, aliases, paths) => ({ id: 'sym.' + id, name, cat, aliases, views: VB, paths });

  const SYMBOL_LIBRARY = [
    /* ---- 视频监控 ---- */
    s('camera_gun', '枪机摄像头', '视频监控', ['摄像头', '枪机', 'camera', '监控'], ['M3 9h11v6H3z', 'M14 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0', 'M6 15v4', 'M3 19h6']),
    s('dome', '球机', '视频监控', ['球型摄像机', 'dome', 'ptz'], ['M4 15a8 8 0 0 1 16 0', 'M2 15h20', 'M12 13a2 2 0 1 0 0 4a2 2 0 1 0 0-4']),
    s('hemisphere', '半球摄像机', '视频监控', ['半球', 'hemisphere', 'mini dome'], ['M5 15a7 7 0 0 1 14 0', 'M3 15h18', 'M8 15a4 4 0 0 1 8 0']),
    s('ptz', '云台摄像机', '视频监控', ['云台', 'ptz', 'gimbal'], ['M12 3v3', 'M6 9a6 6 0 0 1 12 0v4H6z', 'M4 16h16', 'M9 19h6']),
    s('ir_beam', '红外对射', '视频监控', ['红外', '对射', 'beam'], ['M3 9h4v6H3z', 'M17 9h4v6h-4z', 'M7 12h3', 'M14 12h3']),
    s('laser', '激光对射', '视频监控', ['激光', 'laser', '对射'], ['M4 4v16', 'M20 4v16', 'M4 8h16', 'M4 12h16', 'M4 16h16']),

    /* ---- 门禁 ---- */
    s('card_reader', '门禁读卡器', '门禁', ['读卡器', '刷卡', 'card reader'], ['M8 3h8v18H8z', 'M10 7h4v3h-4z', 'M10 13h1', 'M13 13h1', 'M10 16h1', 'M13 16h1']),
    s('keypad', '密码键盘', '门禁', ['键盘', '密码', 'keypad'], ['M6 3h12v18H6z', 'M9 7h1', 'M12 7h1', 'M15 7h1', 'M9 11h1', 'M12 11h1', 'M15 11h1', 'M9 15h1', 'M12 15h1', 'M15 15h1']),
    s('exit_button', '出门按钮', '门禁', ['按钮', '出门', 'exit button'], ['M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16', 'M7 12h9', 'M13 9l3 3-3 3']),
    s('electric_lock', '电控锁', '门禁', ['磁力锁', '电锁', 'lock'], ['M5 9h7v8H5z', 'M7 9V7a2 2 0 0 1 4 0', 'M8.5 12v2']),
    s('turnstile', '闸机', '门禁', ['通道闸', '三辊闸', 'turnstile'], ['M3 5h4v14H3z', 'M17 5h4v14h-4z', 'M8 12h4', 'M12 9l3 3-3 3']),
    s('door_station', '可视对讲门口机', '门禁', ['门口机', '对讲', 'intercom'], ['M5 3h14v18H5z', 'M9 7h6v4H9z', 'M10 14h1', 'M13 14h1', 'M11 17h2']),

    /* ---- 消防 ---- */
    s('smoke', '烟感探测器', '消防', ['烟感', '烟雾', 'smoke'], ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M12 8v3', 'M12 14v1', 'M8 10l1 1', 'M16 10l-1 1']),
    s('heat', '温感探测器', '消防', ['温感', '感温', 'heat'], ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M12 7v6', 'M10 15a2 2 0 1 0 4 0a2 2 0 1 0-4 0']),
    s('hydrant', '消火栓', '消防', ['消防栓', 'hydrant'], ['M9 7h6v13H9z', 'M7 10h10', 'M12 7V4', 'M9 20h6']),
    s('sprinkler', '喷淋头', '消防', ['喷淋', 'sprinkler'], ['M4 5h16', 'M12 5v6', 'M12 11l-3 3', 'M12 11l3 3', 'M12 11v4', 'M6 9c0 2 2 2 2 0', 'M16 9c0 2 2 2 2 0']),
    s('manual_call', '手动报警按钮', '消防', ['手报', '手动报警', 'call point'], ['M5 3h14v18H5z', 'M12 7v8', 'M12 17v1', 'M9 20h6']),
    s('exit_sign', '疏散指示', '消防', ['疏散', '出口', 'exit sign'], ['M3 5h18v12H3z', 'M9 11h10', 'M16 8l3 3-3 3', 'M6 17v3']),

    /* ---- 网络 ---- */
    s('switch', '交换机', '网络', ['网络交换机', 'switch'], ['M3 8h18v8H3z', 'M6 11h1', 'M9 11h1', 'M12 11h1', 'M15 11h1', 'M18 11h1', 'M6 13h1', 'M9 13h1', 'M12 13h1', 'M15 13h1', 'M18 13h1']),
    s('router', '路由器', '网络', ['路由', 'router', 'gateway'], ['M3 13h18v6H3z', 'M6 10l-2-5', 'M18 10l2-5', 'M9 10V5', 'M15 10V5', 'M6 16h2', 'M10 16h2']),
    s('wifi', '无线 AP', '网络', ['AP', '无线', 'wifi', '热点'], ['M4 14a8 8 0 0 1 16 0', 'M7 17a5 5 0 0 1 10 0', 'M3 19h18', 'M12 18v1']),
    s('fiber_patch', '光纤配线架', '网络', ['光纤', '配线架', 'ODF'], ['M3 6h18v12H3z', 'M6 9h1', 'M9 9h1', 'M12 9h1', 'M15 9h1', 'M6 12h6', 'M6 15h12']),
    s('rack', '机柜', '网络', ['弱电机柜', 'rack', 'cabinet'], ['M5 3h14v18H5z', 'M5 8h14', 'M5 13h14', 'M5 18h14', 'M7 5h2', 'M7 10h2', 'M7 15h2']),
    s('nvr', '网络录像机', '网络', ['NVR', '录像机', '硬盘录像机'], ['M3 5h18v14H3z', 'M6 9h8', 'M6 12h8', 'M6 15h8', 'M17 9v1', 'M17 13v1']),

    /* ---- 停车 ---- */
    s('barrier', '道闸', '停车', ['栏杆机', '道闸杆', 'barrier'], ['M5 4v16', 'M2 20h7', 'M6 8h14', 'M17 5v7', 'M6 8l9-3']),
    s('loop', '地感线圈', '停车', ['地感', '线圈', 'loop'], ['M5 6h14v12H5z', 'M8 6v1', 'M11 6v1', 'M14 6v1', 'M17 6v1', 'M8 17v1', 'M11 17v1', 'M14 17v1']),
    s('parking_space', '车位', '停车', ['停车位', '车位编号', 'parking'], ['M4 4h16v16H4z', 'M9 17V7h4a3 3 0 0 1 0 6H9']),
    s('charger', '充电桩', '停车', ['充电', '新能源', 'charger'], ['M6 4h12v16H6z', 'M13 7l-4 6h3l-1 4 4-6h-3z']),
    s('guide_screen', '诱导屏', '停车', ['诱导', '车位引导屏', 'guide'], ['M3 6h18v10H3z', 'M8 20h8', 'M12 16v4', 'M7 11h3l-2-2', 'M14 11h3l-2 2']),
    s('ticket_machine', '取卡机', '停车', ['取卡', '发卡机', 'ticket'], ['M6 3h12v18H6z', 'M9 7h6v3H9z', 'M9 13h6', 'M9 16h4']),

    /* ---- 其他 ---- */
    s('elevator', '电梯', '其他', ['升降梯', 'elevator', 'lift'], ['M5 3h14v18H5z', 'M12 3v18', 'M8 8l1-2 1 2', 'M8 16l1 2 1-2', 'M16 8l-1-2-1 2', 'M16 16l-1 2-1-2']),
    s('door_sensor', '门磁', '其他', ['门磁开关', '门禁磁', 'door sensor'], ['M4 4h7v16H4z', 'M15 7h5v4h-5z', 'M15 14h5v4h-5z']),
    s('window_sensor', '窗磁', '其他', ['窗磁开关', 'window sensor'], ['M4 8h16v8H4z', 'M12 8v8', 'M6 5h4', 'M14 19h4']),
    s('temp_humidity', '温湿度传感器', '其他', ['温湿度', 'temperature', 'humidity'], ['M9 4a2 2 0 0 1 4 0v10a4 4 0 1 1-4 0z', 'M11 10v6', 'M17 6c2 3 3 4 3 6a3 3 0 0 1-6 0c0-2 1-3 3-6z']),
    s('water_leak', '漏水检测', '其他', ['漏水', '水浸', 'water leak'], ['M12 3c4 6 7 8 7 12a7 7 0 0 1-14 0c0-4 3-6 7-12z', 'M8 16c1-1 2-1 3 0s2 1 3 0']),
    s('face_recognition', '人脸识别', '其他', ['人脸', '刷脸', 'face'], ['M4 8V4h4', 'M20 8V4h-4', 'M4 16v4h4', 'M20 16v4h-4', 'M9 10h1', 'M15 10h1', 'M9 15c2 2 4 2 6 0'])
  ];

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
  function normalizeSymbolPaths(raw) {
    if (!Array.isArray(raw) || !raw.length) throw new Error('符号缺少可渲染路径');
    if (raw.length > LIMITS.PATHS) throw new Error('图元路径过多（最多 ' + LIMITS.PATHS + ' 条）');
    const out = [];
    for (const item of raw) {
      const d = typeof item === 'string' ? item : (item && item.d);
      if (typeof d !== 'string' || !d.trim()) continue;
      const text = d.trim();
      if (text.length > LIMITS.PATH_CHARS) throw new Error('单条 path 过长（最多 ' + LIMITS.PATH_CHARS + ' 字符）');
      if (!/^[MmZzLlHhVvCcSsQqTtAa0-9.,+\-eE\s]+$/.test(text)) throw new Error('path 含非法字符');
      /* N-10：首命令必须是 M/m，避免 A/S/Q/T 起始时没有当前点而抛错或画出伪路径 */
      if (!/^[Mm]/.test(text)) throw new Error('path 必须以 M/m 起始');
      out.push({ d: text, fill: !!(item && item.fill) });
    }
    if (!out.length) throw new Error('符号缺少可渲染路径');
    return out;
  }

  /** 统一入口：对象类型 → 校验后的 path 列表（画布/SVG/DXF 共用；坏数据降级为空而不是抛错） */
  function symbolPathsFor(type) {
    const raw = Array.isArray(type) ? type : (type && type.symbol);
    try { return normalizeSymbolPaths(raw); } catch (e) { return []; }
  }

  /** viewBox 归一：非法/非正尺寸回退 24×24，避免编辑器/导出出现零尺寸 */
  function normalizeSymbolViewBox(raw) {
    if (!raw || typeof raw !== 'object') return VB;
    const a = [raw.x, raw.y, raw.w, raw.h].map(Number);
    if (!a.every(Number.isFinite) || a[2] <= 0 || a[3] <= 0 || a[2] > 50000 || a[3] > 50000) return VB;
    return { x: a[0], y: a[1], w: a[2], h: a[3] };
  }

  /** 别名归一：去空、截断、限条数 */
  function normalizeSymbolAliases(raw) {
    return (Array.isArray(raw) ? raw : [])
      .map(x => String(x || '').trim().slice(0, LIMITS.ALIAS_CHARS)).filter(Boolean).slice(0, LIMITS.ALIASES);
  }

  /** 安全扫描：字节 / 元素 / 嵌套 / 脚本 / 事件 / 外链 / 危险标签，逐条给出原因 */
  function assertSafeSvg(src) {
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
  function parseSvgSymbol(text) {
    const src = String(text || '');
    assertSafeSvg(src);
    const vbRaw = src.match(/viewBox\s*=\s*["']([^"']+)["']/i);
    const vb = vbRaw && vbRaw[1].split(/[\s,]+/).length === 4
      ? normalizeSymbolViewBox({ x: vbRaw[1].split(/[\s,]+/)[0], y: vbRaw[1].split(/[\s,]+/)[1], w: vbRaw[1].split(/[\s,]+/)[2], h: vbRaw[1].split(/[\s,]+/)[3] })
      : VB;
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
    return { paths: normalizeSymbolPaths(paths), vb };
  }

  /* -------------------- 名称 / 别名搜索 -------------------- */
  function buildSymbolIndex(lib) {
    const list = lib || SYMBOL_LIBRARY;
    return list.map(sym => ({
      sym,
      text: [sym.id, sym.name].concat(sym.aliases || []).join(' ').toLowerCase()
    }));
  }
  let symbolIndexCache = null;
  function searchSymbols(query, cat) {
    const q = String(query || '').trim().toLowerCase();
    if (!symbolIndexCache) symbolIndexCache = buildSymbolIndex();
    return symbolIndexCache.filter(e =>
      (!cat || e.sym.cat === cat) && (!q || e.text.includes(q))
    ).map(e => e.sym);
  }

  /* -------------------- 自定义符号 JSON（工程命名空间） -------------------- */
  /** 从当前工程导出非内置符号；不读取其他工程，导出内容不含全局状态 */
  function customSymbolsFromTypes(types, meta) {
    const libIds = new Set(SYMBOL_LIBRARY.map(x => x.id));
    const symbols = (types || []).filter(t => t && t.kind === 'point' && Array.isArray(t.symbol) && !libIds.has(t.id)).map(t => ({
      id: t.id, name: String(t.name || '').slice(0, LIMITS.NAME_CHARS),
      cat: CATS.includes(t.category) ? t.category : '其他',
      aliases: normalizeSymbolAliases(t.symbolAliases), views: normalizeSymbolViewBox(t.symbolViewBox),
      paths: symbolPathsFor(t), color: t.color || '#7c3aed'
    }));
    const out = { schema: 'plotpin.symbols/v1', symbols };
    if (meta && meta.id) out.project = { id: String(meta.id), name: String(meta.name || '') };
    return out;
  }

  /** 导入 JSON → 完整 ObjectType 列表；只追加到调用方工程，id 冲突自动改名 */
  function sanitizeSymbolBundle(raw, usedIds) {
    const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.symbols) ? raw.symbols : null);
    if (!list) throw new Error('符号 JSON 缺少 symbols 数组');
    if (list.length > LIMITS.BUNDLE_SYMBOLS) throw new Error('单次导入符号过多（最多 ' + LIMITS.BUNDLE_SYMBOLS + ' 个）');
    const used = new Set(Array.isArray(usedIds) ? usedIds : []);
    return list.map((item, i) => {
      if (!item || typeof item !== 'object') throw new Error('第 ' + (i + 1) + ' 个符号格式无效');
      const name = String(item.name || '').trim().slice(0, LIMITS.NAME_CHARS) || ('导入符号 ' + (i + 1));
      const paths = normalizeSymbolPaths(item.paths);
      const views = normalizeSymbolViewBox(item.views || item.symbolViewBox);
      let id = String(item.id || '').trim();
      if (!/^[A-Za-z0-9_.-]{2,60}$/.test(id) || used.has(id)) {
        let n = i + 1, base;
        do { base = 'sym.import.' + n; n++; } while (used.has(base));
        id = base;
      }
      used.add(id);
      const cat = CATS.includes(item.cat) ? item.cat : '其他';
      const color = /^#[0-9a-f]{3,8}$/i.test(String(item.color || '')) ? String(item.color) : '#7c3aed';
      return {
        id, kind: 'point', name, color, icon: 'symbol', builtin: false, scaleShape: 'none',
        category: cat, symbolAliases: normalizeSymbolAliases(item.aliases), symbol: paths, symbolViewBox: views
      };
    });
  }

  /* -------------------- path → 折线（DXF 明确降级） -------------------- */
  const TAU = Math.PI * 2;
  function angleBetween(ux, uy, vx, vy) {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy)) || 1;
    let a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  }
  /** SVG 椭圆弧 → 采样点（端点参数化） */
  function arcPoints(x0, y0, rx, ry, phiDeg, large, sweep, x, y, steps) {
    rx = Math.abs(rx); ry = Math.abs(ry);
    if (!rx || !ry) return [[x, y]];
    const phi = phiDeg * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
    const dx = (x0 - x) / 2, dy = (y0 - y) / 2;
    const x1 = cos * dx + sin * dy, y1 = -sin * dx + cos * dy;
    const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lam > 1) { const k = Math.sqrt(lam); rx *= k; ry *= k; }
    const sign = large !== sweep ? 1 : -1;
    const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
    const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    const coef = sign * Math.sqrt(Math.max(0, num / (den || 1)));
    const cxp = coef * (rx * y1 / ry), cyp = coef * (-ry * x1 / rx);
    const cx = cos * cxp - sin * cyp + (x0 + x) / 2;
    const cy = sin * cxp + cos * cyp + (y0 + y) / 2;
    const ux = (x1 - cxp) / rx, uy = (y1 - cyp) / ry;
    const vx = (-x1 - cxp) / rx, vy = (-y1 - cyp) / ry;
    const t1 = angleBetween(1, 0, ux, uy);
    let dt = angleBetween(ux, uy, vx, vy);
    if (!sweep && dt > 0) dt -= TAU;
    if (sweep && dt < 0) dt += TAU;
    const n = Math.max(6, Math.min(48, steps || Math.ceil(Math.abs(dt) / (Math.PI / 12))));
    const pts = [];
    for (let i = 1; i <= n; i++) {
      const t = t1 + dt * i / n;
      const px = cos * rx * Math.cos(t) - sin * ry * Math.sin(t) + cx;
      const py = sin * rx * Math.cos(t) + cos * ry * Math.sin(t) + cy;
      pts.push([px, py]);
    }
    return pts;
  }

  /** 解析紧凑 path d → 子路径折线；曲线/圆弧按固定步长离散 */
  function pathToPolylines(d) {
    const tokens = String(d || '').match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) || [];
    const out = [];
    let i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0, lastCx = 0, lastCy = 0, lastQx = 0, lastQy = 0;
    let cur = null;
    const move = (x, y) => { cur = { points: [[x, y]], closed: false }; out.push(cur); cx = sx = x; cy = sy = y; };
    const line = (x, y) => { if (!cur) move(x, y); else { cur.points.push([x, y]); cx = x; cy = y; } };
    const cubic = (x1, y1, x2, y2, x, y) => {
      if (!cur) move(cx, cy);
      const n = 10, ox = cx, oy = cy;
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t;
        cur.points.push([
          u * u * u * ox + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
          u * u * u * oy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y
        ]);
      }
      lastCx = x2; lastCy = y2; cx = x; cy = y;
    };
    const quad = (x1, y1, x, y) => {
      if (!cur) move(cx, cy);
      const n = 8, ox = cx, oy = cy;
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t;
        cur.points.push([u * u * ox + 2 * u * t * x1 + t * t * x, u * u * oy + 2 * u * t * y1 + t * t * y]);
      }
      lastQx = x1; lastQy = y1; cx = x; cy = y;
    };
    while (i < tokens.length) {
      if (/^[a-zA-Z]$/.test(tokens[i])) { cmd = tokens[i++]; }
      else if (!cmd) { i++; continue; }
      const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
      if (C === 'Z') { if (cur) { cur.closed = true; cx = sx; cy = sy; } cmd = ''; continue; }
      const need = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 }[C];
      if (!need) { i++; cmd = ''; continue; }
      const vals = [];
      while (vals.length < need && i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) vals.push(Number(tokens[i++]));
      if (vals.length < need || vals.some(v => !Number.isFinite(v))) { cmd = ''; continue; }
      if (C === 'M') {
        const x = rel ? cx + vals[0] : vals[0], y = rel ? cy + vals[1] : vals[1];
        move(x, y);
        cmd = rel ? 'l' : 'L';
        continue;
      }
      if (C === 'L') { line(rel ? cx + vals[0] : vals[0], rel ? cy + vals[1] : vals[1]); }
      else if (C === 'H') { line(rel ? cx + vals[0] : vals[0], cy); }
      else if (C === 'V') { line(cx, rel ? cy + vals[0] : vals[0]); }
      else if (C === 'C') {
        const x1 = rel ? cx + vals[0] : vals[0], y1 = rel ? cy + vals[1] : vals[1];
        const x2 = rel ? cx + vals[2] : vals[2], y2 = rel ? cy + vals[3] : vals[3];
        cubic(x1, y1, x2, y2, rel ? cx + vals[4] : vals[4], rel ? cy + vals[5] : vals[5]);
      } else if (C === 'S') {
        const px = lastCx, py = lastCy;
        cubic(2 * cx - px, 2 * cy - py, rel ? cx + vals[0] : vals[0], rel ? cy + vals[1] : vals[1], rel ? cx + vals[2] : vals[2], rel ? cy + vals[3] : vals[3]);
      } else if (C === 'Q') {
        const qx = rel ? cx + vals[0] : vals[0], qy = rel ? cy + vals[1] : vals[1];
        quad(qx, qy, rel ? cx + vals[2] : vals[2], rel ? cy + vals[3] : vals[3]);
      } else if (C === 'T') {
        const qx = 2 * cx - lastQx, qy = 2 * cy - lastQy;
        const ex = rel ? cx + vals[0] : vals[0], ey = rel ? cy + vals[1] : vals[1];
        quad(qx, qy, ex, ey);
      } else if (C === 'A') {
        /* N-10：A 分支缺省当前点时先落到 (cx,cy)，避免 cur 为空导致 TypeError（S/Q/T 已由 cubic/quad 兜底） */
        if (!cur) move(cx, cy);
        const ex = rel ? cx + vals[5] : vals[5], ey = rel ? cy + vals[6] : vals[6];
        for (const p of arcPoints(cx, cy, vals[0], vals[1], vals[2], !!vals[3], !!vals[4], ex, ey)) cur.points.push(p);
        cx = ex; cy = ey;
      }
      if (C !== 'C' && C !== 'S' && C !== 'Q' && C !== 'T') { lastCx = cx; lastCy = cy; }
      if (C !== 'Q' && C !== 'T') { lastQx = cx; lastQy = cy; }
    }
    return out.filter(p => p.points.length > 1);
  }

  /**
   * 符号 → 世界坐标折线（DXF 明确降级）。
   * sizeMeters>0 用真实尺寸；否则调用方给名义尺寸。angleDeg 为对象旋转角。
   */
  function symbolPolylinesInWorld(type, x, y, sizeMeters, angleDeg, viewBox) {
    const vb = viewBox || (type && (type.symbolViewBox || type.views)) || VB;
    const paths = symbolPathsFor(type);
    const size = Number(sizeMeters) > 0 ? Number(sizeMeters) : 0.6;
    const k = size / Math.max(vb.w || 24, vb.h || 24);
    const cx0 = (Number(vb.x) || 0) + (vb.w || 24) / 2;
    const cy0 = (Number(vb.y) || 0) + (vb.h || 24) / 2;
    const a = (Number(angleDeg) || 0) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
    const ox = Number(x) || 0, oy = Number(y) || 0;
    const out = [];
    for (const path of paths) {
      for (const poly of pathToPolylines(path.d)) {
        const pts = poly.points.map(([px, py]) => {
          const lx = (px - cx0) * k, ly = -(py - cy0) * k;
          return [ox + lx * cos - ly * sin, oy + lx * sin + ly * cos];
        });
        out.push({ points: pts, closed: poly.closed });
      }
    }
    return out;
  }

  global.SYMBOL_LIBRARY = SYMBOL_LIBRARY;
  global.SYMBOL_CATEGORIES = CATS;
  global.SYMBOL_LIMITS = LIMITS;
  global.parseSvgSymbol = parseSvgSymbol;
  global.buildSymbolIndex = buildSymbolIndex;
  global.searchSymbols = searchSymbols;
  global.symbolPathsFor = symbolPathsFor;
  global.normalizeSymbolPaths = normalizeSymbolPaths;
  global.normalizeSymbolViewBox = normalizeSymbolViewBox;
  global.normalizeSymbolAliases = normalizeSymbolAliases;
  global.symbolPolylinesInWorld = symbolPolylinesInWorld;
  global.pathToPolylines = pathToPolylines;
  global.customSymbolsFromTypes = customSymbolsFromTypes;
  global.sanitizeSymbolBundle = sanitizeSymbolBundle;
})(typeof window !== 'undefined' ? window : globalThis);
