/* plugins.js —— 第三方扩展注册点（纯 JS，无构建）
 *
 * 通过全局 `PlotPin` 注册：
 *   PlotPin.registerExporter({id,label,ext,mime,run(ctx)})   出现在「导出」下拉，选中即执行
 *   PlotPin.registerImporter({ext,label,run(ctx)})           拖拽/导入对应扩展名时执行
 *
 * 约定：
 *   - 导出 run(ctx) 可返回 Blob / 字符串，或调用 ctx.download(blob, name)
 *   - 导入 run(ctx) 拿到 File，可读写 ctx.state，完成后调用 ctx.commitChange(msg)
 *   - 插件脚本在页面内以同源方式运行，安装即代表信任；本层只做注册与菜单接线，不做沙箱
 */
(function (global) {
  'use strict';
  const exporters = [];
  const importers = [];
  const pluginTypes = new Map();

  const normExt = e => String(e || '').replace(/^\./, '').toLowerCase();
  /** 实时工程状态是全局词法绑定（let state），不是 window 属性；用裸引用安全取值 */
  const appState = () => { try { return state; } catch (_) { return undefined; } };
  const cloneJSON = v => JSON.parse(JSON.stringify(v));
  const TYPE_KINDS = ['point', 'rect', 'line'];
  const TYPE_SHAPES = ['none', 'circle', 'square', 'sector', 'bar'];

  function builtinTypes() {
    try { return Array.isArray(BUILTIN_TYPES) ? BUILTIN_TYPES : null; } catch (_) { return null; }
  }
  function typeInUse(id) {
    const st = appState();
    if (!st) return false;
    const has = arr => Array.isArray(arr) && arr.some(o => o && o.typeId === id);
    return has(st.objects) || (Array.isArray(st.floors) && st.floors.some(f => has(f && f.objects)));
  }
  function refreshTypeUI() {
    if (typeof global.populateSelects === 'function') global.populateSelects();
    if (typeof global.renderTypes === 'function') global.renderTypes();
    if (typeof global.requestRender === 'function') global.requestRender();
  }
  /** 注册类型进入当前工程（若不存在）；同时已写入内置类型表，后续新建/载入工程都会带上 */
  function installType(t) {
    const st = appState();
    if (st && Array.isArray(st.objectTypes) && !st.objectTypes.some(x => x && x.id === t.id)) {
      st.objectTypes.push(cloneJSON(t));
    }
    refreshTypeUI();
  }
  /** 校验并规范化插件类型定义（与 persistence.js 的清洗规则保持同形，避免保存后被改写） */
  function normalizeObjectType(def) {
    if (!def || typeof def !== 'object') throw new Error('类型定义必须是对象');
    const id = String(def.id || '').trim();
    if (!/^[A-Za-z0-9_.-]{2,64}$/.test(id)) throw new Error('类型 id 需为 2–64 位字母、数字、点、下划线或短横线');
    if (!TYPE_KINDS.includes(def.kind)) throw new Error('类型 kind 仅支持 point / rect / line');
    const name = String(def.name || '').trim().slice(0, 30);
    if (!name) throw new Error('类型需提供名称 name');
    const color = /^#[0-9a-fA-F]{6}$/.test(String(def.color || '')) ? String(def.color) : '#7c3aed';
    const t = {
      id, kind: def.kind, name, color,
      icon: String(def.icon || (def.kind === 'point' ? 'custom' : def.kind)).slice(0, 30),
      builtin: false, plugin: true
    };
    if (def.kind === 'point') {
      if (def.iconSize !== undefined) {
        const n = Number(def.iconSize);
        if (!(Number.isFinite(n) && n >= 0.5 && n <= 5)) throw new Error('iconSize 需在 0.5–5');
        t.iconSize = n;
      }
      if (def.scaleShape !== undefined) {
        if (!TYPE_SHAPES.includes(def.scaleShape)) throw new Error('scaleShape 仅支持 ' + TYPE_SHAPES.join(' / '));
        t.scaleShape = def.scaleShape;
        if (def.scaleShape === 'sector') {
          const fov = Number(def.fov);
          if (!(Number.isFinite(fov) && fov >= 10 && fov <= 360)) throw new Error('扇形视场需提供 10–360 的 fov');
          t.fov = Math.round(fov);
        }
      }
      if (def.symbol !== undefined) {
        if (!Array.isArray(def.symbol) || !def.symbol.length) throw new Error('symbol 需为非空路径数组');
        if (def.symbol.length > 200) throw new Error('symbol 路径最多 200 条');
        t.symbol = def.symbol.map(p => {
          if (!p || typeof p.d !== 'string' || !p.d.trim() || p.d.length > 5000) {
            throw new Error('每条 symbol 需提供不超过 5000 字符的 d');
          }
          return { d: p.d, fill: !!p.fill };
        });
        if (def.symbolViewBox !== undefined) {
          const vb = def.symbolViewBox;
          if (!vb || !['x', 'y', 'w', 'h'].every(k => Number.isFinite(Number(vb[k]))) || Number(vb.w) <= 0 || Number(vb.h) <= 0) {
            throw new Error('symbolViewBox 需为 {x,y,w>0,h>0}');
          }
          t.symbolViewBox = { x: Number(vb.x), y: Number(vb.y), w: Number(vb.w), h: Number(vb.h) };
        }
      }
    }
    if (def.defaultStyle !== undefined) {
      if (!def.defaultStyle || typeof def.defaultStyle !== 'object') throw new Error('defaultStyle 需为对象');
      const fill = Number(def.defaultStyle.fillAlpha);
      const stroke = Number(def.defaultStyle.strokeWidth);
      t.defaultStyle = {
        fillAlpha: Math.min(1, Math.max(0, Number.isFinite(fill) ? fill : 0.15)),
        strokeWidth: Math.max(0.01, Number.isFinite(stroke) ? stroke : 0.1)
      };
    } else if (def.kind === 'rect') {
      t.defaultStyle = { fillAlpha: 0.15, strokeWidth: 0.1 };
    } else if (def.kind === 'line') {
      t.defaultStyle = { strokeWidth: 0.1 };
    }
    return t;
  }

  function syncExportOptions() {
    const sel = typeof document !== 'undefined' && document.getElementById && document.getElementById('exportKind');
    if (!sel || !sel.querySelectorAll) return;
    sel.querySelectorAll('option[data-plugin]').forEach(o => o.remove());
    exporters.forEach(ex => {
      const opt = document.createElement('option');
      opt.value = 'plugin:' + ex.id;
      opt.textContent = ex.label;
      opt.dataset.plugin = '1';
      sel.appendChild(opt);
    });
  }

  const PlotPin = {
    version: '0.2.0',
    registerExporter(def) {
      if (!def || !def.id || typeof def.run !== 'function') throw new Error('导出器需提供 id 与 run(ctx)');
      if (exporters.some(e => e.id === def.id)) throw new Error('导出器 id 已存在：' + def.id);
      exporters.push({
        id: String(def.id),
        label: String(def.label || def.name || def.id),
        ext: normExt(def.ext),
        mime: String(def.mime || 'application/octet-stream'),
        run: def.run
      });
      syncExportOptions();
      return true;
    },
    unregisterExporter(id) {
      const i = exporters.findIndex(e => e.id === id);
      if (i < 0) return false;
      exporters.splice(i, 1);
      syncExportOptions();
      return true;
    },
    registerImporter(def) {
      if (!def || !normExt(def.ext) || typeof def.run !== 'function') throw new Error('导入器需提供 ext 与 run(ctx)');
      const ext = normExt(def.ext);
      if (importers.some(e => e.ext === ext)) throw new Error('导入器扩展名已存在：' + ext);
      importers.push({ ext, label: String(def.label || ext.toUpperCase()), run: def.run });
      return true;
    },
    unregisterImporter(ext) {
      const e = normExt(ext), i = importers.findIndex(x => x.ext === e);
      if (i < 0) return false;
      importers.splice(i, 1);
      return true;
    },
    /** 注册自定义设备/区域/折线类型：写入内置类型表并立即出现在当前工程的类型下拉 */
    registerObjectType(def) {
      const t = normalizeObjectType(def);
      const list = builtinTypes();
      if (pluginTypes.has(t.id) || (list && list.some(x => x && x.id === t.id))) throw new Error('类型 id 已存在：' + t.id);
      pluginTypes.set(t.id, t);
      if (list) list.push(t);
      installType(t);
      return true;
    },
    /** 注销插件类型；被对象使用时拒绝，避免既有图纸丢失外观 */
    unregisterObjectType(id) {
      const t = pluginTypes.get(String(id));
      if (!t || typeInUse(t.id)) return false;
      pluginTypes.delete(t.id);
      const list = builtinTypes();
      if (list) {
        const i = list.findIndex(x => x && x.id === t.id);
        if (i >= 0) list.splice(i, 1);
      }
      const st = appState();
      if (st && Array.isArray(st.objectTypes)) st.objectTypes = st.objectTypes.filter(x => !x || x.id !== t.id);
      refreshTypeUI();
      return true;
    },
    listPluginTypes() { return Array.from(pluginTypes.values()).map(cloneJSON); },
    findExporter(id) { return exporters.find(e => e.id === id) || null; },
    findImporter(ext) { const e = normExt(ext); return importers.find(x => x.ext === e) || null; },
    listExporters() { return exporters.map(e => ({ id: e.id, label: e.label, ext: e.ext, mime: e.mime })); },
    listImporters() { return importers.map(e => ({ ext: e.ext, label: e.label })); },
    get state() { return appState(); },
    syncExportOptions
  };

  global.PlotPin = PlotPin;

  /** 导出按钮把 plugin:<id> 交给这里执行 */
  function exportViaPlugin(id) {
    const ex = PlotPin.findExporter(id);
    if (!ex) return global.toast('插件导出器不存在：' + id, 'error');
    try {
      const live = appState();
      const result = ex.run({
        state: global.persistableState(),
        liveState: live,
        projectName: live && live.meta ? live.meta.name : '',
        site: typeof global.siteDescription === 'function' ? global.siteDescription() : '',
        download: (blob, name) => global.downloadBlob(blob, name || (global.safeName() + '.' + (ex.ext || 'bin'))),
        toast: global.toast
      });
      if (result && typeof result.then === 'function') {
        result.catch(err => global.toast('插件导出失败：' + (err && err.message || err), 'error'));
      }
    } catch (err) {
      global.toast('插件导出失败：' + (err && err.message || err), 'error');
    }
  }
  /** 导入路由把未知扩展交给已注册插件 */
  function importViaPlugin(imp, file) {
    try {
      const result = imp.run({
        file,
        state: appState(),
        toast: global.toast,
        commitChange: global.commitChange,
        downloadBlob: global.downloadBlob
      });
      if (result && typeof result.then === 'function') {
        result.catch(err => global.toast('插件导入失败：' + (err && err.message || err), 'error'));
      }
    } catch (err) {
      global.toast('插件导入失败：' + (err && err.message || err), 'error');
    }
  }

  global.exportViaPlugin = exportViaPlugin;
  global.importViaPlugin = importViaPlugin;
  if (typeof document !== 'undefined' && document.readyState !== 'loading') syncExportOptions();
  else if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('DOMContentLoaded', syncExportOptions);
})(typeof window !== 'undefined' ? window : globalThis);
