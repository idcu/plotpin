/* i18n.js —— 界面文案字典与切换（中/英）
 *
 * 覆盖范围（静态界面 chrome）：顶栏、左侧工具栏、侧栏页签、导出格式选项。
 * 动态生成的属性面板/弹窗文案仍为中文，属后续增量；核心绘图流程不依赖语言。
 * 用法：I18N.setLang('en'); I18N.apply(document); I18N.t('new')
 */
(function (global) {
  'use strict';
  const DICT = {
    zh: {
      brand: '图钉',
      new: '新建', projects: '📁 工程库', floors: '🏢 楼层', import: '导入', export: '导出',
      print: '打印/PDF', settings: '设置',
      select: '选择', pan: '平移', point: '点设备', area: '区域', line: '折线', text: '文字',
      ruler: '测距', dimension: '标注', siteNode: '场地节点', guide: '参考线', finish: '完成',
      tabProps: '属性', tabList: '清单', tabLayers: '图层/类型', tabStats: '统计',
      exportJson: 'JSON 工程', exportPng: 'PNG 高清图', exportSvg: 'SVG 矢量图',
      exportPdf: 'PDF 矢量（图纸+清单）', exportDxf: 'DXF（CAD 互通）',
      exportCsv: 'CSV 表格', exportTsv: 'TSV 表格', exportXlsx: 'Excel (.xlsx)',
      exportLabels: '设备二维码标签 (HTML)',
      language: '界面语言'
    },
    en: {
      brand: 'PlotPin',
      new: 'New', projects: '📁 Projects', floors: '🏢 Floors', import: 'Import', export: 'Export',
      print: 'Print/PDF', settings: 'Settings',
      select: 'Select', pan: 'Pan', point: 'Point', area: 'Area', line: 'Polyline', text: 'Text',
      ruler: 'Measure', dimension: 'Dimension', siteNode: 'Site nodes', guide: 'Guides', finish: 'Finish',
      tabProps: 'Properties', tabList: 'Objects', tabLayers: 'Layers/Types', tabStats: 'Statistics',
      exportJson: 'JSON project', exportPng: 'PNG (high-res)', exportSvg: 'SVG (vector)',
      exportPdf: 'PDF (drawing + list)', exportDxf: 'DXF (CAD)',
      exportCsv: 'CSV table', exportTsv: 'TSV table', exportXlsx: 'Excel (.xlsx)',
      exportLabels: 'Device QR labels (HTML)',
      language: 'Language'
    }
  };
  let lang = 'zh';

  function t(key) {
    const d = DICT[lang] || DICT.zh;
    if (d[key] !== undefined) return d[key];
    return DICT.zh[key] !== undefined ? DICT.zh[key] : key;
  }
  function setLang(l) {
    lang = l === 'en' ? 'en' : 'zh';
    if (typeof document !== 'undefined' && document.documentElement)
      document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    return lang;
  }
  /** 应用 data-i18n / data-i18n-title 到 DOM（返回替换数量，便于自测） */
  function apply(root) {
    if (typeof document === 'undefined') return 0;
    const r = root || document;
    let n = 0;
    r.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); n++; });
    r.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); n++; });
    return n;
  }

  global.I18N = { t, setLang, apply, dict: DICT, get lang() { return lang; } };
})(typeof window !== 'undefined' ? window : globalThis);
