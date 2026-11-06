/* 示例：隔离沙箱插件（完整可运行）
 *
 * 用法：在 index.html 的 app.js 之后加一行
 *   <script src="plugins/sample-sandboxed.js"></script>
 * 刷新后「导出 → 格式」里出现「沙箱 Markdown 清单」，导出得到 .md 文件。
 *
 * 这个文件本身只是加载器：真正的插件源码放在 PLUGIN_CODE 字符串里，
 * 由 PlotPin.loadPlugin 送进 Worker；插件没有 DOM / window / parent /
 * IndexedDB / 网络，只能调用 capabilities 中声明过的能力。
 */
(function () {
  'use strict';
  if (!window.PlotPin || typeof PlotPin.loadPlugin !== 'function') {
    console.warn('示例插件：PlotPin.loadPlugin 不可用（请先加载 js/features/plugins.js）');
    return;
  }
  var PLUGIN_CODE = [
    'PlotPin.registerExporter({',
    '  id: "sandbox-markdown",',
    '  label: "沙箱 Markdown 清单",',
    '  ext: ".md",',
    '  mime: "text/markdown",',
    '  run: function (ctx) {',
    '    var s = ctx.state || { objects: [] };',
    '    var lines = ["# " + (ctx.projectName || "图纸工程"), "", "| 编号 | 名称 |", "| --- | --- |"];',
    '    (s.objects || []).slice(0, 50).forEach(function (o) {',
    '      lines.push("| " + String(o.id || "") + " | " + String(o.name || "") + " |");',
    '    });',
    '    ctx.download(lines.join("\\n") + "\\n", "sandbox-markdown.md");',
    '    ctx.toast("示例插件已导出 Markdown", "success");',
    '  }',
    '});'
  ].join('\n');
  PlotPin.loadPlugin({
    id: 'sandbox-markdown',
    apiVersion: '1.0',
    capabilities: ['state:read', 'export'],
    code: PLUGIN_CODE
  }).then(function (r) {
    if (!r.ok) console.warn('示例沙箱插件加载失败：' + r.reason);
    else console.info('示例沙箱插件已就绪：导出格式中选择「沙箱 Markdown 清单」');
  });
})();
