/* 示例插件：注册一个「设备清单 Markdown」导出器。
 *
 * 启用方式：在 index.html 的 plugins.js 之后追加
 *   <script src="plugins/sample-exporter.js"></script>
 * 刷新后「导出」下拉会出现「设备清单 (Markdown)」。
 */
(function () {
  'use strict';
  if (!window.PlotPin) return;
  PlotPin.registerExporter({
    id: 'sample.markdown',
    label: '设备清单 (Markdown)',
    ext: 'md',
    mime: 'text/markdown;charset=utf-8',
    run(ctx) {
      const rows = (ctx.state.objects || []).filter(o => o.kind === 'point');
      const lines = [
        '# ' + (ctx.projectName || '图纸工程') + ' · 设备清单',
        '',
        '| 编号 | 名称 | 类型 | 型号 | IP | 安装高度 | 责任人 |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        ...rows.map(o => {
          const p = o.props || {};
          return `| ${o.name || ''} | ${o.text || ''} | ${o.typeId || ''} | ${p.model || ''} | ${p.ip || ''} | ${p.mountHeight ?? ''} | ${p.owner || ''} |`;
        }),
        '',
        '> 由 PlotPin 插件导出（' + ctx.site + '）'
      ];
      ctx.download(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }), (ctx.projectName || 'plotpin') + '-设备清单.md');
      ctx.toast('Markdown 设备清单已导出', 'success');
    }
  });
})();
