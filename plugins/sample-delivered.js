/* 示例：已交付清单（隔离沙箱插件，只读工程状态）
 *
 * 用法：在 index.html 的 app.js 之后加一行
 *   <script src="plugins/sample-delivered.js"></script>
 * 刷新后「导出 → 格式」里出现「已交付清单 (Markdown)」。
 *
 * 交付判据是 props.publishState === '1'（可选键，缺失=未交付，旧工程无需迁移）。
 * 本示例只读 state、只声明 state:read / export 两项能力，不写回、不新增键，
 * 作为 docs/engineering.md §4.3 弃用策略的对照样例。
 */
(function () {
  'use strict';
  if (!window.PlotPin || typeof PlotPin.loadPlugin !== 'function') {
    console.warn('示例插件：PlotPin.loadPlugin 不可用（请先加载 js/features/plugins.js）');
    return;
  }
  var PLUGIN_CODE = [
    'PlotPin.registerExporter({',
    '  id: "delivered-list",',
    '  label: "已交付清单 (Markdown)",',
    '  ext: ".md",',
    '  mime: "text/markdown",',
    '  run: function (ctx) {',
    '    var s = ctx.state || { objects: [] };',
    '    var rows = (s.objects || []).filter(function (o) {',
    '      return o && o.props && o.props.publishState === "1";',
    '    });',
    '    var lines = ["# " + (ctx.projectName || "图纸工程") + " · 已交付清单", "", "| 名称 | 编号 | 类型 |", "| --- | --- | --- |"];',
    '    rows.forEach(function (o) {',
    '      lines.push("| " + String(o.name || "") + " | " + String(o.text || "") + " | " + String(o.typeId || "") + " |");',
    '    });',
    '    if (!rows.length) lines.push("", "（当前工程没有已交付对象）");',
    '    ctx.download(lines.join("\\n") + "\\n", "已交付清单.md");',
    '    ctx.toast("已交付清单已导出（" + rows.length + " 项）", "success");',
    '  }',
    '});'
  ].join('\n');
  PlotPin.loadPlugin({
    id: 'delivered-list',
    apiVersion: '1.0',
    capabilities: ['state:read', 'export'],
    code: PLUGIN_CODE
  }).then(function (r) {
    if (!r.ok) console.warn('示例交付清单插件加载失败：' + r.reason);
    else console.info('示例交付清单插件已就绪：导出格式中选择「已交付清单 (Markdown)」');
  });
})();
