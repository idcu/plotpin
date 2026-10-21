/* symbols.js —— 行业标准图元库（点设备符号）
 * 64 个 24×24 线性图标，覆盖安防 / 弱电 / 停车 / 消防 / 通用设备。
 * 每个图元 = 若干 SVG path d（Path2D 与 SVG 导出共用同一数据源）。
 * 另提供 parseSvgSymbol(text)：把用户上传的 SVG 转为同一结构（path/circle/rect/polygon/line/polyline）。
 */
(function (global) {
  'use strict';
  const VB = { x: 0, y: 0, w: 24, h: 24 };
  const s = (id, name, cat, paths) => ({ id: 'sym.' + id, name, cat, views: VB, paths });

  const SYMBOL_LIBRARY = [
    /* ---- 安防 ---- */
    s('camera_gun', '枪机摄像头', '安防', ['M3 9h11v6H3z', 'M14 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0', 'M6 15v4', 'M3 19h6']),
    s('dome', '球机', '安防', ['M4 15a8 8 0 0 1 16 0', 'M2 15h20', 'M12 13a2 2 0 1 0 0 4a2 2 0 1 0 0-4']),
    s('hemisphere', '半球摄像机', '安防', ['M5 15a7 7 0 0 1 14 0', 'M3 15h18', 'M8 15a4 4 0 0 1 8 0']),
    s('ptz', '云台摄像机', '安防', ['M12 3v3', 'M6 9a6 6 0 0 1 12 0v4H6z', 'M4 16h16', 'M9 19h6']),
    s('ir_beam', '红外对射', '安防', ['M3 9h4v6H3z', 'M17 9h4v6h-4z', 'M7 12h3', 'M14 12h3']),
    s('card_reader', '门禁读卡器', '安防', ['M8 3h8v18H8z', 'M10 7h4v3h-4z', 'M10 13h1', 'M13 13h1', 'M10 16h1', 'M13 16h1']),
    s('keypad', '密码键盘', '安防', ['M6 3h12v18H6z', 'M9 7h1', 'M12 7h1', 'M15 7h1', 'M9 11h1', 'M12 11h1', 'M15 11h1', 'M9 15h1', 'M12 15h1', 'M15 15h1']),
    s('exit_button', '出门按钮', '安防', ['M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16', 'M7 12h9', 'M13 9l3 3-3 3']),
    s('electric_lock', '电控锁', '安防', ['M5 9h7v8H5z', 'M7 9V7a2 2 0 0 1 4 0', 'M8.5 12v2']),
    s('turnstile', '闸机', '安防', ['M3 5h4v14H3z', 'M17 5h4v14h-4z', 'M8 12h4', 'M12 9l3 3-3 3']),
    s('smoke', '烟感探测器', '安防', ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M12 8v3', 'M12 14v1', 'M8 10l1 1', 'M16 10l-1 1']),
    s('heat', '温感探测器', '安防', ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M12 7v6', 'M10 15a2 2 0 1 0 4 0a2 2 0 1 0-4 0']),
    s('gas', '燃气探测器', '安防', ['M4 7h16v10H4z', 'M7 14c1-2 2-2 3 0', 'M12 14c1-2 2-2 3 0', 'M17 14c1-2 2-2 2 0']),
    s('panic', '紧急按钮', '安防', ['M5 4h14v16H5z', 'M12 8v5', 'M12 16v1']),
    s('sound_light', '声光报警器', '安防', ['M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8', 'M5 8a8 8 0 0 1 0 8', 'M19 8a8 8 0 0 0 0 8', 'M2 5h4', 'M2 19h4']),
    s('siren', '警号', '安防', ['M4 10l9-6v16l-9-6z', 'M16 8a6 6 0 0 1 0 8', 'M19 6a10 10 0 0 1 0 12']),
    s('glass_break', '玻璃破碎探测器', '安防', ['M4 4l6 6', 'M10 10l-3 3', 'M7 13l9 7', 'M13 5l4 4', 'M17 9l3-3']),
    s('vibration', '震动探测器', '安防', ['M3 16l3-8 3 8 3-11 3 11 3-8 3 8']),
    s('curtain', '红外幕帘', '安防', ['M5 4v16', 'M19 4v16', 'M9 8h6', 'M9 12h6', 'M9 16h6']),
    s('microwave', '微波对射', '安防', ['M3 12h5', 'M16 12h5', 'M8 9l-3 3 3 3', 'M16 9l3 3-3 3', 'M12 7v10']),
    s('fence', '电子围栏', '安防', ['M4 5v14', 'M9 5v14', 'M14 5v14', 'M19 5v14', 'M4 10h15', 'M4 15h15']),
    s('fiber_fence', '光纤振动围栏', '安防', ['M3 16c2-4 4 4 6 0s4 4 6 0', 'M3 8c2-4 4 4 6 0s4 4 6 0', 'M19 4v16']),
    s('laser', '激光对射', '安防', ['M4 4v16', 'M20 4v16', 'M4 8h16', 'M4 12h16', 'M4 16h16']),
    s('patrol', '巡更点', '安防', ['M12 3l2.5 5 5 .8-3.6 3.6.8 5-4.7-2.4-4.7 2.4.8-5L4.5 8.8 9.5 8z']),
    s('door_station', '可视对讲门口机', '安防', ['M5 3h14v18H5z', 'M9 7h6v4H9z', 'M10 14h1', 'M13 14h1', 'M11 17h2']),
    s('indoor_monitor', '室内分机', '安防', ['M3 5h18v11H3z', 'M9 20h6', 'M12 16v4', 'M6 8h5', 'M6 11h8']),
    s('master_station', '管理机', '安防', ['M3 4h18v10H3z', 'M8 17h8', 'M12 14v3', 'M6 7h6', 'M6 10h3', 'M14 13h3']),

    /* ---- 弱电 / 网络 ---- */
    s('switch', '交换机', '弱电', ['M3 8h18v8H3z', 'M6 11h1', 'M9 11h1', 'M12 11h1', 'M15 11h1', 'M18 11h1', 'M6 13h1', 'M9 13h1', 'M12 13h1', 'M15 13h1', 'M18 13h1']),
    s('router', '路由器', '弱电', ['M3 13h18v6H3z', 'M6 10l-2-5', 'M18 10l2-5', 'M9 10V5', 'M15 10V5', 'M6 16h2', 'M10 16h2']),
    s('wifi', '无线 AP', '弱电', ['M4 14a8 8 0 0 1 16 0', 'M7 17a5 5 0 0 1 10 0', 'M3 19h18', 'M12 18v1']),
    s('info_point', '信息点', '弱电', ['M5 4h14v16H5z', 'M12 8v1', 'M12 11v6', 'M9 17h6']),
    s('telephone', '电话点', '弱电', ['M6 3l3 4-2 3c2 4 5 7 9 9l3-2 4 3-1 3c-1 2-3 2-5 1C9 21 3 15 2 7 1 5 2 3 4 3z']),
    s('fiber_patch', '光纤配线架', '弱电', ['M3 6h18v12H3z', 'M6 9h1', 'M9 9h1', 'M12 9h1', 'M15 9h1', 'M6 12h6', 'M6 15h12']),
    s('rack', '机柜', '弱电', ['M5 3h14v18H5z', 'M5 8h14', 'M5 13h14', 'M5 18h14', 'M7 5h2', 'M7 10h2', 'M7 15h2']),
    s('ups', 'UPS 电源', '弱电', ['M4 7h16v12H4z', 'M7 10h4v5H7z', 'M13 10h4', 'M13 13h4', 'M8 19v2', 'M16 19v2']),
    s('amplifier', '广播功放', '弱电', ['M3 7h18v10H3z', 'M6 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4', 'M11 9v6', 'M14 9v6', 'M17 9v6']),
    s('ceiling_speaker', '吸顶音箱', '弱电', ['M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16', 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8', 'M12 12h.1']),
    s('wall_speaker', '壁挂音箱', '弱电', ['M4 4h12v16H4z', 'M7 8h6v8H7z', 'M18 8h3', 'M18 12h3', 'M18 16h3']),
    s('nvr', '网络录像机', '弱电', ['M3 5h18v14H3z', 'M6 9h8', 'M6 12h8', 'M6 15h8', 'M17 9v1', 'M17 13v1']),
    s('dvr', '硬盘录像机', '弱电', ['M3 5h18v14H3z', 'M6 8h5v5H6z', 'M6 15h12', 'M14 8h4', 'M14 11h4']),
    s('monitor', '监视器', '弱电', ['M3 4h18v12H3z', 'M9 20h6', 'M12 16v4', 'M6 7h12']),
    s('tv', '电视', '弱电', ['M4 6h16v12H4z', 'M8 3l4 3 4-3', 'M8 9h8', 'M8 12h5']),
    s('projector', '投影机', '弱电', ['M3 9h12v8H3z', 'M15 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0', 'M18 12l4-3', 'M18 13l4 3']),

    /* ---- 停车 ---- */
    s('barrier', '道闸', '停车', ['M5 4v16', 'M2 20h7', 'M6 8h14', 'M17 5v7', 'M6 8l9-3']),
    s('loop', '地感线圈', '停车', ['M5 6h14v12H5z', 'M8 6v1', 'M11 6v1', 'M14 6v1', 'M17 6v1', 'M8 17v1', 'M11 17v1', 'M14 17v1']),
    s('parking_space', '车位', '停车', ['M4 4h16v16H4z', 'M9 17V7h4a3 3 0 0 1 0 6H9']),
    s('charger', '充电桩', '停车', ['M6 4h12v16H6z', 'M13 7l-4 6h3l-1 4 4-6h-3z']),
    s('guide_screen', '诱导屏', '停车', ['M3 6h18v10H3z', 'M8 20h8', 'M12 16v4', 'M7 11h3l-2-2', 'M14 11h3l-2 2']),
    s('parking_guide', '车位引导', '停车', ['M4 4h16v16H4z', 'M8 17V7h4a3 3 0 0 1 0 6H8', 'M16 8v9', 'M16 12l2-2']),
    s('ticket_machine', '取卡机', '停车', ['M6 3h12v18H6z', 'M9 7h6v3H9z', 'M9 13h6', 'M9 16h4']),
    s('booth', '岗亭', '停车', ['M4 10l8-6 8 6', 'M6 10v10h12V10', 'M9 14h6v6']),

    /* ---- 消防 ---- */
    s('hydrant', '消火栓', '消防', ['M9 7h6v13H9z', 'M7 10h10', 'M12 7V4', 'M9 20h6']),
    s('sprinkler', '喷淋头', '消防', ['M4 5h16', 'M12 5v6', 'M12 11l-3 3', 'M12 11l3 3', 'M12 11v4', 'M6 9c0 2 2 2 2 0', 'M16 9c0 2 2 2 2 0']),
    s('manual_call', '手动报警按钮', '消防', ['M5 3h14v18H5z', 'M12 7v8', 'M12 17v1', 'M9 20h6']),
    s('emergency_light', '应急照明', '消防', ['M6 10h8v8H6z', 'M14 12l5-4v8l-5-4', 'M4 5l2 2', 'M8 3v3']),
    s('exit_sign', '疏散指示', '消防', ['M3 5h18v12H3z', 'M9 11h10', 'M16 8l3 3-3 3', 'M6 17v3']),

    /* ---- 通用设备 ---- */
    s('elevator', '电梯', '通用', ['M5 3h14v18H5z', 'M12 3v18', 'M8 8l1-2 1 2', 'M8 16l1 2 1-2', 'M16 8l-1-2-1 2', 'M16 16l-1 2-1-2']),
    s('door_sensor', '门磁', '通用', ['M4 4h7v16H4z', 'M15 7h5v4h-5z', 'M15 14h5v4h-5z']),
    s('window_sensor', '窗磁', '通用', ['M4 8h16v8H4z', 'M12 8v8', 'M6 5h4', 'M14 19h4']),
    s('temp_humidity', '温湿度传感器', '通用', ['M9 4a2 2 0 0 1 4 0v10a4 4 0 1 1-4 0z', 'M11 10v6', 'M17 6c2 3 3 4 3 6a3 3 0 0 1-6 0c0-2 1-3 3-6z']),
    s('water_leak', '漏水检测', '通用', ['M12 3c4 6 7 8 7 12a7 7 0 0 1-14 0c0-4 3-6 7-12z', 'M8 16c1-1 2-1 3 0s2 1 3 0']),
    s('elevator_monitor', '电梯监控', '通用', ['M4 3h10v18H4z', 'M9 3v18', 'M7 8l1-2 1 2', 'M17 7h5v6h-5z', 'M19 13v4']),
    s('face_recognition', '人脸识别', '通用', ['M4 8V4h4', 'M20 8V4h-4', 'M4 16v4h4', 'M20 16v4h-4', 'M9 10h1', 'M15 10h1', 'M9 15c2 2 4 2 6 0']),
    s('anpr', '车牌识别', '通用', ['M4 8h9v7H4z', 'M9 11.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0', 'M13 11h4', 'M3 18h18', 'M6 18v2', 'M18 18v2'])
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

  /**
   * 解析用户 SVG：提取 path/circle/rect/polygon/line/polyline 为 {d,fill} 列表与 viewBox。
   * 仅保留几何数据（不含脚本/样式/外链），路径数与单条 d 长度均设上限。
   */
  function parseSvgSymbol(text) {
    const src = String(text || '');
    if (/<script\b/i.test(src)) throw new Error('SVG 含有脚本，已拒绝导入');
    const vbRaw = src.match(/viewBox\s*=\s*["']([^"']+)["']/i);
    let vb = { x: 0, y: 0, w: 24, h: 24 };
    if (vbRaw) {
      const a = vbRaw[1].split(/[\s,]+/).map(Number);
      if (a.length === 4 && a.every(Number.isFinite) && a[2] > 0 && a[3] > 0) vb = { x: a[0], y: a[1], w: a[2], h: a[3] };
    }
    const paths = [];
    const push = (d, fill) => { if (d && String(d).trim().length <= 5000) paths.push({ d: String(d).trim(), fill: !!fill }); };
    for (const m of src.matchAll(/<path\b[^>]*>/gi)) {
      const tag = m[0], d = attr(tag, 'd');
      if (d) push(d, attr(tag, 'fill') && attr(tag, 'fill').toLowerCase() !== 'none');
    }
    for (const m of src.matchAll(/<circle\b[^>]*>/gi)) {
      const tag = m[0], cx = num(tag, 'cx'), cy = num(tag, 'cy'), r = num(tag, 'r');
      if (r > 0) push(`M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`, false);
    }
    for (const m of src.matchAll(/<rect\b[^>]*>/gi)) {
      const tag = m[0], x = num(tag, 'x'), y = num(tag, 'y'), w = num(tag, 'width'), h = num(tag, 'height');
      if (w > 0 && h > 0) push(`M${x} ${y}h${w}v${h}h${-w}z`, false);
    }
    for (const m of src.matchAll(/<(polygon|polyline)\b[^>]*>/gi)) {
      const pts = (attr(m[0], 'points') || '').trim().replace(/\s+/g, ' ');
      if (pts) push('M' + pts.replace(/ /g, ' L') + (m[1].toLowerCase() === 'polygon' ? ' Z' : ''), false);
    }
    for (const m of src.matchAll(/<line\b[^>]*>/gi)) {
      const tag = m[0];
      push(`M${num(tag, 'x1')} ${num(tag, 'y1')}L${num(tag, 'x2')} ${num(tag, 'y2')}`, false);
    }
    if (!paths.length) throw new Error('SVG 中未找到可用图形（支持 path/circle/rect/polygon/line/polyline）');
    if (paths.length > 200) throw new Error('图元路径过多（最多 200 条）');
    return { paths, vb };
  }

  global.SYMBOL_LIBRARY = SYMBOL_LIBRARY;
  global.parseSvgSymbol = parseSvgSymbol;
})(typeof window !== 'undefined' ? window : globalThis);
