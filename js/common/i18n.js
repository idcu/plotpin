/* i18n.js —— 界面文案字典与切换（中/英）
 *
 * 覆盖范围：顶栏、工具栏、页签、导出、HUD、清单/图层静态文案、设置面板与通用确认按钮。
 * 属性面板等动态业务文案仍为中文，属后续增量；核心绘图流程不依赖语言。
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
      language: '界面语言',
      /* 通用动作 / 弹窗 */
      cancel: '取消', ok: '确定', close: '关闭', save: '保存',
      confirmTitle: '确认操作', settingsTitle: '工程设置',
      /* ARIA 标签 */
      ariaTools: '绘图工具', ariaCanvas: '绘图画布：使用左侧工具在此绘制和选择对象',
      ariaTabs: '侧栏页签', ariaExport: '选择导出格式',
      ariaUndo: '撤销 (Ctrl+Z)', ariaRedo: '重做 (Ctrl+Y)',
      ariaZoomIn: '放大', ariaZoomOut: '缩小', ariaZoomFit: '适应窗口显示整张场地',
      ariaSidebar: '显示或隐藏属性面板', ariaLabels: '显示或隐藏对象编号标签',
      ariaMarkerScale: '点设备图标显示大小',
      ariaObjVisible: '切换对象显隐', ariaObjLock: '切换对象锁定',
      ariaLayerVisible: '切换图层显隐', ariaLayerLock: '切换图层锁定',
      ariaLayerRename: '重命名图层', ariaLayerDelete: '删除图层',
      ariaTypeColor: '类型颜色', ariaTypeRename: '重命名类型', ariaTypeDelete: '删除类型',
      ariaBatchLayer: '批量移动到图层', ariaBatchDx: 'X 方向平移距离', ariaBatchDy: 'Y 方向平移距离', ariaBatchAngle: '旋转角度',
      /* HUD / 清单 / 图层与类型 */
      typeLabel: '类型', shapeLabel: '形状', closedArea: '闭合区域', labelsToggle: '标签', pointSize: '点大小',
      hintText: '滚轮缩放；右键/中键或空格拖拽画布；Delete 删除；Tab 切换捕捉类型；可拖拽文件到画布导入；按 ? 查看全部快捷键',
      allObjects: '全部对象', allLayers: '全部图层',
      filterPoint: '点设备', filterArea: '矩形/区域', filterLine: '线段/折线', filterText: '文字', filterDimension: '尺寸标注',
      thId: '编号', thName: '名称', thType: '类型', thLayer: '图层', thParam: '参数', thVisible: '显隐', thLock: '锁',
      searchPlaceholder: '搜索编号/名称/备注',
      batchChangeLayer: '改图层', batchMove: '平移', batchRotate: '旋转', batchDelete: '删除',
      selectAll: '全选当前筛选结果',
      layersHeading: '图层', newLayerPlaceholder: '新图层名称', addLayer: '新增图层',
      typesHeading: '类型管理', addTypeHeading: '新增自定义类型',
      builtinType: '内置', customType: '自定义', objectsUnit: '个对象',
      kindLabel: '类别', nameLabel: '名称', colorLabel: '颜色', iconLabel: '图标',
      scaleShapeLabel: '尺寸图形', iconSizeLabel: '图标大小', addType: '新增类型', importSvg: '导入 SVG 图元…',
      shapeRect: '矩形', shapeCircle: '圆形', shapeEllipse: '椭圆', shapeSector: '扇形', shapeParallelogram: '平行四边形',
      dimDistance: '两点距离', dimRuler: '测距（多点总长）', dimArea: '面积', dimAngle: '角度',
      /* 设置面板 */
      projectName: '工程名称', gridSpacing: '网格间距', enableSnap: '启用捕捉', showGrid: '显示网格',
      showLabelsSetting: '显示标签', crosshair: '十字准星/坐标', segLenSetting: '段长度标注',
      areaTagSetting: '图上显示面积', siteNodesSetting: '场地节点坐标', siteSegLenSetting: '场地段长',
      siteBaseSetting: '场地基点坐标', siteRadiusSetting: '场地半径', siteAreaSetting: '场地面积',
      sitePerimeterSetting: '场地周长', osnapSetting: '对象捕捉', polarSetting: '极轴追踪',
      polarStepSetting: '极轴角', precisionSetting: '坐标精度', runtimeSetting: '运行环境',
      siteBgSetting: '场地/底图', languageLabel: '界面语言'
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
      language: 'Language',
      cancel: 'Cancel', ok: 'OK', close: 'Close', save: 'Save',
      confirmTitle: 'Confirm', settingsTitle: 'Project settings',
      ariaTools: 'Drawing tools', ariaCanvas: 'Drawing canvas: draw and select objects with the tools on the left',
      ariaTabs: 'Sidebar tabs', ariaExport: 'Choose export format',
      ariaUndo: 'Undo (Ctrl+Z)', ariaRedo: 'Redo (Ctrl+Y)',
      ariaZoomIn: 'Zoom in', ariaZoomOut: 'Zoom out', ariaZoomFit: 'Fit the whole site in view',
      ariaSidebar: 'Show or hide the properties panel', ariaLabels: 'Show or hide object labels',
      ariaMarkerScale: 'Device icon display size',
      ariaObjVisible: 'Toggle object visibility', ariaObjLock: 'Toggle object lock',
      ariaLayerVisible: 'Toggle layer visibility', ariaLayerLock: 'Toggle layer lock',
      ariaLayerRename: 'Rename layer', ariaLayerDelete: 'Delete layer',
      ariaTypeColor: 'Type color', ariaTypeRename: 'Rename type', ariaTypeDelete: 'Delete type',
      ariaBatchLayer: 'Move selection to layer', ariaBatchDx: 'X offset', ariaBatchDy: 'Y offset', ariaBatchAngle: 'Rotation angle',
      typeLabel: 'Type', shapeLabel: 'Shape', closedArea: 'Closed area', labelsToggle: 'Labels', pointSize: 'Marker size',
      hintText: 'Wheel to zoom; right/middle drag or Space+drag to pan; Delete to remove; Tab cycles snap types; drop files to import; press ? for shortcuts',
      allObjects: 'All objects', allLayers: 'All layers',
      filterPoint: 'Point', filterArea: 'Rect/Area', filterLine: 'Polyline', filterText: 'Text', filterDimension: 'Dimension',
      thId: 'ID', thName: 'Name', thType: 'Type', thLayer: 'Layer', thParam: 'Params', thVisible: 'Visible', thLock: 'Lock',
      searchPlaceholder: 'Search ID / name / note',
      batchChangeLayer: 'Set layer', batchMove: 'Move', batchRotate: 'Rotate', batchDelete: 'Delete',
      selectAll: 'Select all filtered results',
      layersHeading: 'Layers', newLayerPlaceholder: 'New layer name', addLayer: 'Add layer',
      typesHeading: 'Types', addTypeHeading: 'Add custom type',
      builtinType: 'Built-in', customType: 'Custom', objectsUnit: 'objects',
      kindLabel: 'Category', nameLabel: 'Name', colorLabel: 'Color', iconLabel: 'Icon',
      scaleShapeLabel: 'Sized shape', iconSizeLabel: 'Icon size', addType: 'Add type', importSvg: 'Import SVG symbol…',
      shapeRect: 'Rectangle', shapeCircle: 'Circle', shapeEllipse: 'Ellipse', shapeSector: 'Sector', shapeParallelogram: 'Parallelogram',
      dimDistance: 'Two-point distance', dimRuler: 'Measure (total length)', dimArea: 'Area', dimAngle: 'Angle',
      projectName: 'Project name', gridSpacing: 'Grid spacing', enableSnap: 'Enable snapping', showGrid: 'Show grid',
      showLabelsSetting: 'Show labels', crosshair: 'Crosshair / coordinates', segLenSetting: 'Segment lengths',
      areaTagSetting: 'Show area on drawing', siteNodesSetting: 'Site node coordinates', siteSegLenSetting: 'Site segment lengths',
      siteBaseSetting: 'Site base coordinates', siteRadiusSetting: 'Site radius', siteAreaSetting: 'Site area',
      sitePerimeterSetting: 'Site perimeter', osnapSetting: 'Object snap', polarSetting: 'Polar tracking',
      polarStepSetting: 'Polar angle', precisionSetting: 'Coordinate precision', runtimeSetting: 'Runtime',
      siteBgSetting: 'Site / base map', languageLabel: 'Interface language'
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
  /** 应用 data-i18n / data-i18n-title / data-i18n-placeholder / data-i18n-aria-label 到 DOM（返回替换数量） */
  function apply(root) {
    if (typeof document === 'undefined') return 0;
    const r = root || document;
    let n = 0;
    r.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); n++; });
    r.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); n++; });
    r.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); n++; });
    r.querySelectorAll('[data-i18n-aria-label]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel)); n++; });
    return n;
  }

  global.I18N = { t, setLang, apply, dict: DICT, get lang() { return lang; } };
})(typeof window !== 'undefined' ? window : globalThis);
