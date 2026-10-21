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

  const normExt = e => String(e || '').replace(/^\./, '').toLowerCase();

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
    findExporter(id) { return exporters.find(e => e.id === id) || null; },
    findImporter(ext) { const e = normExt(ext); return importers.find(x => x.ext === e) || null; },
    listExporters() { return exporters.map(e => ({ id: e.id, label: e.label, ext: e.ext, mime: e.mime })); },
    listImporters() { return importers.map(e => ({ ext: e.ext, label: e.label })); },
    get state() { return global.state; },
    syncExportOptions
  };

  global.PlotPin = PlotPin;

  /** 导出按钮把 plugin:<id> 交给这里执行 */
  function exportViaPlugin(id) {
    const ex = PlotPin.findExporter(id);
    if (!ex) return global.toast('插件导出器不存在：' + id, 'error');
    try {
      const result = ex.run({
        state: global.persistableState(),
        projectName: global.state && global.state.meta ? global.state.meta.name : '',
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
        state: global.state,
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
