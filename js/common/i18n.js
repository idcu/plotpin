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
      baseSite: '底图/场地', scaleBtn: '比例尺', affineBtn: '仿射校准', coverageBtn: '覆盖率分析', parkingBtn: '停车规划',
      panelToggle: '☰ 面板', fitBtn: '适应',
      typeNamePlaceholder: '例如：烟感、货位、警戒线',
      iconDot: '圆点', iconCamera: '摄像头', iconDome: '球机', iconLight: '路灯', iconGate: '道闸',
      iconCharger: '充电桩', iconWarning: '警示', iconCustom: '菱形',
      scaleNone: '仅位置图标（不缩放）', scaleCircle: '圆形覆盖区', scaleSquare: '方形区域',
      scaleSector: '扇形视场（如摄像头）', scaleBar: '杆/线段（如道闸）',
      saveUnsaved: '未保存', savePending: '待保存…', saveSaved: '已保存', saveAuto: '已自动保存',
      saveManual: '请手动导出', cursorPrefix: '鼠标：',
      toolSelectHint: '选择：点击对象，框选多个对象；画线/拖点会自动捕捉端点、中点、圆心（设置可关）',
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
      baseSite: 'Base/Site', scaleBtn: 'Scale', affineBtn: 'Affine', coverageBtn: 'Coverage', parkingBtn: 'Parking',
      panelToggle: '☰ Panel', fitBtn: 'Fit',
      typeNamePlaceholder: 'e.g. smoke detector, bay, warning line',
      iconDot: 'Dot', iconCamera: 'Camera', iconDome: 'Dome camera', iconLight: 'Street light', iconGate: 'Barrier gate',
      iconCharger: 'Charger', iconWarning: 'Warning', iconCustom: 'Diamond',
      scaleNone: 'Position marker only', scaleCircle: 'Circle coverage', scaleSquare: 'Square area',
      scaleSector: 'Sector FOV (e.g. camera)', scaleBar: 'Bar/segment (e.g. gate)',
      saveUnsaved: 'Unsaved', savePending: 'Saving…', saveSaved: 'Saved', saveAuto: 'Auto-saved',
      saveManual: 'Export manually', cursorPrefix: 'Cursor: ',
      toolSelectHint: 'Select: click objects or drag a selection box; drawing/dragging snaps to endpoints, midpoints and centers (toggle in Settings)',
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
  /* 动态业务文案以「中文原文」为键：L('宽度') 在英文模式返回 Width，未收录则原样返回中文。
     这样属性面板/弹窗模板无需为每个词组再造语义 key，也不会影响用户数据。 */
  const PHRASES = {
    '编号':'ID', '名称':'Name', '类型':'Type', '图层':'Layer', '形状':'Shape', '闭合':'Closed', '节点':'Nodes',
    '面积':'Area', '周长':'Perimeter', '宽度':'Width', '高度':'Height', '宽度 (m)':'Width (m)', '高度 (m)':'Height (m)',
    '旋转角':'Rotation', '倾角 (°)':'Skew (°)',
    '半径 (m)':'Radius (m)', '半径X (m)':'Radius X (m)', '半径Y (m)':'Radius Y (m)',
    '起始角':'Start angle', '张角 (0–360)':'Sweep (0–360)', '填充色':'Fill color', '透明度':'Opacity', '线宽':'Line width',
    '透明':'Transparent', '颜色':'Color', '基点':'Base', '基点 X':'Base X', '基点 Y':'Base Y',
    '圆心':'Center', '圆心 X':'Center X', '圆心 Y':'Center Y', '中心':'Center', '中心 X':'Center X', '中心 Y':'Center Y',
    'X 坐标':'X', 'Y 坐标':'Y', '朝向角':'Heading', '型号':'Model', '安装高度 (m)':'Mount height (m)', 'IP':'IP',
    '责任人':'Owner', '照片':'Photo', '图标大小':'Icon size', '物理尺寸(m)':'Physical size (m)', '文字':'Text',
    '字高(m)':'Text height (m)', '对象属性':'Object properties', '自定义属性':'Custom properties',
    '暂无自定义属性':'No custom properties', '键':'Key', '值':'Value', '复制':'Duplicate',
    '上移一层':'Raise', '下移一层':'Lower', '隐藏':'Hide', '显示':'Show', '解锁':'Unlock', '锁定':'Lock', '删除':'Delete',
    '批量属性':'Batch properties', '移动到':'Move to', '应用图层':'Apply layer', '批量旋转':'Rotate all', '全部删除':'Delete all',
    '图上标注':'On-drawing labels', '场地属性':'Site properties', '场地节点':'Site nodes', '图片底图':'Image base map',
    '像素':'Pixels', '比例':'Scale', '校准':'Calibration', '实测范围':'Measured extent', '已校准':'Calibrated',
    '未校准':'Not calibrated', '已校正倾斜':'Deskewed', '轴对齐':'Axis-aligned', '底图/场地…':'Base/Site…',
    '比例尺校准':'Scale calibration', '仿射校准':'Affine calibration', '未命名':'Untitled',
    '矩形':'Rectangle', '圆形':'Circle', '椭圆':'Ellipse', '扇形（饼形）':'Sector (pie)', '平行四边形':'Parallelogram',
    '点设备':'Point', '矩形/区域':'Rect/Area', '线段/折线':'Polyline', '尺寸标注':'Dimension',
    '个对象':'objects', '个顶点':'vertices', '工程信息':'Project info', '工程名称':'Project name',
    '场地':'Site', '场地参数':'Site parameters', '对象总数':'Total objects', '最近更新':'Last updated',
    '几何检查':'Geometry check', '本地存储':'Local storage', '统计中…':'Calculating…',
    '浏览器配额':'Browser quota', '使用率':'Usage', '点坐标':'Point coords', '基点坐标':'Base coords',
    '半径':'Radius', '边长':'Side length', '顶点坐标':'Vertex coords', '节点坐标':'Node coords', '段长':'Segment length',
    '上移节点':'Move node up', '下移节点':'Move node down', '删除该节点':'Delete node',
    '在此节点后插入一个节点':'Insert a node after this one', '拖拽调整节点顺序':'Drag to reorder nodes',
    '节点 X（米，可为负）':'Node X (m, may be negative)', '节点 Y（米，可为负）':'Node Y (m, may be negative)',
    '顶点 X（米，可为负）':'Vertex X (m, may be negative)', '顶点 Y（米，可为负）':'Vertex Y (m, may be negative)',
    '上移顶点':'Move vertex up', '下移顶点':'Move vertex down', '在此顶点后插入一个顶点':'Insert a vertex after this one',
    '删除该顶点':'Delete this vertex', '填充':'Fill',
    '基点为图形左下角，也是旋转中心；平行四边形面积=底×高，倾角只改变斜边不改变面积；':
      'Base is the lower-left corner and rotation center; parallelogram area = base × height, skew changes only the slanted edge.',
    '圆心/中心即形状基点（画布上以 ⊕ 标出），移动图形即移动基点；':
      'The circle/ellipse/sector center is the shape base (marked ⊕ on canvas); moving the shape moves the base.',
    '坐标按世界坐标（米），可为负；区域随底图保持真实比例。三角形/任意多边形请用「折线」工具勾选「闭合区域」。':
      'Coordinates are world coordinates in metres and may be negative; areas stay true-to-scale. For triangles/arbitrary polygons use the Polyline tool with Closed area.',
    '该类型仅标识位置（屏幕固定图标）。如需与底图成比例的覆盖范围，请在「图层/类型」中改用圆/方/扇形/杆型点类型。':
      'This type is a fixed-screen position marker. For scale-true coverage, use a circle/square/sector/bar point type under Layers/Types.',
    '当前为图片底图，暂无场地节点可编辑。':'This is an image base map; there are no site nodes to edit.',
    '请先在「底图」弹窗中切换为矩形/圆形/椭圆/扇形/平行四边形/多边形矢量场地；图片底图请改用「仿射校准」。':
      'Switch to a rectangle/circle/ellipse/sector/parallelogram/polygon vector site under Base/Site first; for image base maps use Affine calibration.',
    '尚未设置底图/场地，请点顶部「底图/场地」上传图片或绘制矢量场地。':
      'No base map or site yet. Use Base/Site at the top to upload an image or draw a vector site.',
    '直接修改下方坐标/参数即可调整场地；点左侧「⊗ 场地节点」工具可在画布上拖拽控制点。坐标按世界坐标（米），可为负。':
      'Edit the coordinates/parameters below to adjust the site, or use the Site nodes tool to drag handles on canvas. Coordinates are world metres and may be negative.',
    '拖拽画布上的控制点即可调整场地；也可在此输入精确坐标/参数。坐标按世界坐标（米），可为负；场地随底图保持真实比例。':
      'Drag handles on canvas to adjust the site, or enter precise coordinates/parameters here. Coordinates are world metres and may be negative; the site stays true-to-scale.',
    '提示：单击对象可在此编辑其属性；框选可批量选择；Delete 删除；Ctrl+Z 撤销。':
      'Tip: click an object to edit its properties here; drag a box to select multiple; Delete removes; Ctrl+Z undoes.',
    '图片以像素×比例尺映射到世界坐标；如需精确贴合请用「比例尺校准」或「仿射校准」。':
      'The image maps pixels to world coordinates via the scale; use Scale calibration or Affine calibration for precise alignment.',
    '未发现明显的零尺寸、自相交或越界问题。':'No obvious zero-size, self-intersection, or out-of-bounds issues found.',
    '工程与底图存于 IndexedDB（底图按内容哈希去重），设置存于 localStorage。':
      'Projects and base maps live in IndexedDB (content-hashed); settings live in localStorage.',
    '存储使用率较高：可移除不用的底图，或导出 JSON 备份后清理本站数据。':
      'Storage usage is high: remove unused base maps or export a JSON backup and clear site data.',
    '在图上显示':'Show on drawing', '共':'total', '至少':'min', '个':'',
    '已插入节点':'Node inserted', '已插入场地顶点':'Site vertex inserted', '已删除场地顶点':'Site vertex deleted',
    '场地顶点顺序已调整':'Site vertex order updated',
    '多边形场地至少保留 3 个顶点':'A polygon site needs at least 3 vertices',
    '该类型按':'This type renders as', '渲染：填 0 为纯位置图标；填':'Fill 0 for a pure position marker; fill',
    '（米）后随底图真实比例缩放':' (m) to scale with the base map',
    '，张角 ':' with a sweep of ', '°，朝向随朝向角':'°, heading follows the heading angle',
    '杆长':'bar length', '视场半径':'FOV radius', '直径':'diameter',
    '该类型按「':'This type renders as "', '」渲染':'', '图标 ':'Icon ',
    '尺寸过小':'is too small', '折线节点不足':'has too few polyline nodes', '存在自相交':'self-intersects',
    '物理尺寸':'physical size', '超过场地长边':'exceeds the site long edge', '超出场地范围':'is outside the site',
    '参与统计的点设备':'Cameras counted', '个（含物理尺寸的圆/球机、扇形/摄像头、方形覆盖）':' (circles/dome cameras with physical size, sector/cameras, square coverage)',
    '未计入':'not counted', '仅标识位置的图标点':'position-only marker points',
    '标注总长':'Total annotation length', '区域总面积':'Total area', '（含闭合边）':'(including closing edge)',
    '（外接矩形）':'(bounding box)', '外接':'bounding box',
    '画布上双击边插入顶点、双击顶点删除':'double-click an edge to insert a vertex, double-click a vertex to delete',
    '移除照片':'Remove photo', '设备照片':'Device photo', '顶栏还有全局点大小':'top bar also has a global marker size',
    '占用':'Usage', 'IndexedDB 含底图':'IndexedDB incl. base maps', 'localStorage':'localStorage',
    '点':'pts', '条边':'edges', '扇区':'sector', '旋转':'rotation', '占地':'footprint',
    '图片底图：':'Image base map: ', '圆形场地：':'Circle site: ', '椭圆场地：':'Ellipse site: ',
    '扇形场地：':'Sector site: ', '多边形场地：':'Polygon site: ', '矩形场地：':'Rectangle site: ',
    '（世界坐标，无需比例尺校准）':'(world coordinates, no scale calibration needed)',
    '（已校准）':'(calibrated)', '（未校准）':'(not calibrated)',
    '：半径 ':' radius ', ' m ｜ ':' m | ', ' m，外接 ':' m, bounding ',
    ' ｜ 旋转 ':' | rotation ', ' ｜ ':' | ', ' m（外接矩形）':' m (bounding box)',
    '尺寸图形':'Sized shape', '仅位置图标（不缩放）':'Position marker only', '圆形覆盖区':'Circle coverage',
    '方形区域':'Square area', '扇形视场（如摄像头）':'Sector FOV (e.g. camera)', '杆/线段（如道闸）':'Bar/segment (e.g. barrier)',
    '在图上显示「':'Show on drawing "', '」':' ',
    '共 ':'total ', '个顶点（至少 3）；':'vertices (min 3); ',
    '拖 ⠿ 或 ↑↓ 调整顺序；画布上双击线段插入节点、双击节点删除':'Drag ⠿ or use ↑↓ to reorder; double-click a segment to insert a node, double-click a node to delete',
    '可在画布上拖节点手柄调整位置':'Drag node handles on canvas to adjust positions',
    '测距链':'Measure chain', '闭合区域':'Closed area', '开放折线':'Open polyline',
    '上传图片底图，或改画矢量场地':'Upload an image base map or switch to a vector site',
    '仅图片底图需要：指定两点实际距离校准米/像素':'Image base maps only: set the real distance between two points to calibrate m/px',
    '在图上依次点击已知点并输入实地坐标，纠正倾斜与不等比缩放':'Click known points and enter their real-world coordinates to correct skew and non-uniform scale',
    '该类型按「':'This type renders as “', '」渲染：填 0 为纯位置图标；填':'”: fill 0 for a position-only marker; fill',
    '，张角 ':' with a sweep of ', '°，朝向随朝向角':'°, heading follows the heading angle',
    '（顶栏还有全局点大小）':'(the top bar also has a global marker size)', '图标':'Icon',
    '默认图标大小（屏幕倍率）':'Default icon size (screen multiplier)',
    /* 工具提示 */
    '选择：点击对象，框选多个对象；画线/拖点会自动捕捉端点、中点、圆心（设置可关）':
      'Select: click objects or drag a selection box; drawing/dragging snaps to endpoints, midpoints and centers (toggle in Settings)',
    '平移：拖拽移动画布':'Pan: drag to move the canvas',
    '点设备：单击放置（自动捕捉特征点，设置可关）':'Point: click to place (auto-snaps to feature points; toggle in Settings)',
    '区域：上方选形状后按住左键拖画；按住 Shift 矩形=正方形、椭圆=正圆、扇形=45°吸附，Esc 取消':
      'Area: choose a shape above and drag; Shift makes a square/circle or snaps sectors to 45°; Esc cancels',
    '折线：逐点单击，双击完成；按住 Shift 画水平/垂直线，右键/Esc 取消（勾选闭合画三角形/多边形）':
      'Polyline: click point by point, double-click to finish; Shift constrains to horizontal/vertical; right-click/Esc cancels (enable Closed for triangles/polygons)',
    '文字：单击输入文字内容':'Text: click to enter text',
    '尺寸标注：测距逐点单击、双击结束（右键/Esc 取消）；其他类型按提示逐点单击':
      'Dimension: click point by point and double-click to finish (right-click/Esc cancels); other types follow the on-screen prompts',
    '比例尺：依次点击图上两个已知点':'Scale: click two known points on the drawing',
    '仿射校准：在图上依次点击已知点并输入其实地坐标 X,Y（2 点=旋转+等比相似，≥3 点=完整仿射）；按 Enter 或左侧 ✓ 求解，右键/Esc 取消':
      'Affine calibration: click known points and enter real-world X,Y (2 points = rotation + uniform scale, 3+ = full affine); press Enter or ✓ to solve, right-click/Esc cancels',
    '绘制矩形场地：按住左键拖出对角（Shift=正方形），松开完成，Esc 取消':
      'Draw rectangle site: drag the diagonal (Shift = square), release to finish, Esc cancels',
    '绘制圆形场地：按住左键从圆心拖出半径，松开完成，Esc 取消':
      'Draw circle site: drag the radius from the center, release to finish, Esc cancels',
    '绘制椭圆场地：拖包围盒（Shift=正圆），松开完成，Esc 取消':
      'Draw ellipse site: drag the bounding box (Shift = circle), release to finish, Esc cancels',
    '绘制扇形场地：拖半径时 Shift 吸附 45°，松开后输入起止角，Esc 取消':
      'Draw sector site: Shift snaps the radius to 45°; enter start/end angles after release; Esc cancels',
    '绘制平行四边形场地：拖出底边×高，松开后按默认倾角 30° 生成（可在场地属性改倾角/尺寸）':
      'Draw parallelogram site: drag base × height; it is created with a default 30° skew (editable in Site properties)',
    '绘制多边形场地：沿边界逐点单击，双击/Enter 或点左侧✓闭合，Esc 取消':
      'Draw polygon site: click along the boundary, double-click/Enter or ✓ closes it, Esc cancels',
    '场地节点：拖拽画布上的控制点调整矢量场地形状；属性面板可精确输入坐标/参数，多边形支持双击边插入、双击节点删除':
      'Site nodes: drag handles to reshape the vector site; enter exact coordinates/parameters in the panel; polygons support double-click edge insert and vertex delete',
    '参考线：两次点击定义一条无限长参考线（参与交点/垂足/平行/垂直捕捉）；Backspace 删除上一条，Shift+G 清除全部，Esc 退出':
      'Guides: two clicks define an infinite guide (participates in intersection/perpendicular/parallel snapping); Backspace removes the last, Shift+G clears all, Esc exits',
    '鼠标：':'Cursor: ',
    /* 快捷键帮助 */
    '撤销 / 重做':'Undo / Redo', '删除选中对象':'Delete selected objects',
    '原地复制选中对象':'Duplicate selection in place', '复制 / 粘贴对象（偏移 1m）':'Copy / paste objects (offset 1 m)',
    '取消当前绘制 / 清除选择（右键取消测距等逐点录入，无草稿时平移）':
      'Cancel drawing / clear selection (right-click cancels point entry; pans when idle)',
    '完成测距、折线或面积标注（双击处不会产生重复节点）':
      'Finish measure/polyline/area (double-click does not add a duplicate node)',
    '删除上一个录入节点':'Remove the last entered node',
    '在折线上插入节点 / 删除节点':'Insert/delete a node on the polyline',
    '约束为水平/垂直线（正交）':'Constrain to horizontal/vertical (ortho)',
    '正方形 / 正圆 / 45°方位吸附':'Square / circle / 45° bearing snap',
    '自动吸附端点□ 中点△ 圆心◎ 象限◇ 垂足⊥ 交点× 切点；画线时橙色虚线=45°极轴/平行追踪':
      'Auto-snap endpoint □ midpoint △ center ◎ quadrant ◇ perpendicular ⊥ intersection × tangent; orange dashed = 45° polar/parallel tracking',
    '画布聚焦时循环切换捕捉类型（自动→端点→中点→圆心→象限点→交点→垂足→切点）；点击底部捕捉徽标恢复自动':
      'Cycle snap types when the canvas is focused (Auto→Endpoint→Midpoint→Center→Quadrant→Intersection→Perpendicular→Tangent); click the bottom badge to restore Auto',
    '在顶栏 / 左侧工具栏 / 侧栏页签之间循环焦点（画布内 Tab 用于捕捉，需离开画布时按 F6）':
      'Cycle focus across the top bar / tool rail / sidebar tabs (Tab inside the canvas cycles snapping; press F6 to leave)',
    '临时平移画布':'Temporary canvas pan', '移动选中对象（Shift ×10 倍步距）':'Move selected objects (Shift ×10 step)',
    '适应窗口（显示整张场地）':'Fit view (whole site)', '缩放 / 平移画布':'Zoom / pan canvas',
    '单指绘制与移动；双指捏合缩放、双指拖动平移':'One finger draws/moves; pinch to zoom, two-finger drag to pan',
    '导入 JSON / DXF / CSV·TSV·XLSX 表格或底图图片':'Import JSON/DXF/CSV·TSV·XLSX tables or a base-map image',
    '显示本帮助':'Show this help', '快捷键帮助':'Keyboard shortcuts', '知道了':'Got it',
    /* 工程库 / 楼层 / 底图 / 导入预览 / 覆盖率 */
    '切换':'Switch', '重命名':'Rename', '打开':'Open', '关闭':'Close', '层':'floors', '对象':'objects', '个':'',
    '楼层 / 多底图':'Floors / Base maps', '当前楼层：':'Current floor: ',
    '新增楼层（空白场地）':'Add floor (blank site)',
    '每层可独立设置底图/场地与对象；切换后画布只显示当前楼层。楼层共用图层与对象类型，工程库与 JSON 会保存全部楼层。':
      'Each floor has its own base map/site and objects; the canvas shows only the current floor. Layers and types are shared, and the project library/JSON keep all floors.',
    '新增楼层':'Add floor', '楼层名称':'Floor name', '已新增楼层：':'Floor added: ',
    '已切换到楼层：':'Switched to floor: ', '重命名楼层':'Rename floor',
    '确定删除楼层「':'Delete floor “', '」及其全部对象？此操作可撤销。':'” and all its objects? This can be undone.',
    '楼层已删除':'Floor deleted', '楼层操作失败：':'Floor operation failed: ',
    '当前楼层':'Current floor', '当前打开':'Currently open',
    '工程库（保存在本机浏览器）':'Project library (stored in this browser)',
    '工程库还是空的。先把当前图纸「另存到工程库」，以后可在多个工程间快速切换。':
      'The project library is empty. Save the current drawing to the library first, then switch between projects anytime.',
    '当前工程':'Current project', '当前草稿：':'Current draft: ', '已绑定工程库':'linked to the library',
    '把当前图纸另存到工程库':'Save current drawing to library', '合并他人工程…':'Merge another project…',
    '工程自动保存：绑定后每次修改都会同步到工程库；删除工程不影响已导出的 JSON 文件。':
      'Auto-save: once linked, every change syncs to the library; deleting a project does not affect exported JSON files.',
    '离线协作：双方各自编辑后，用「合并他人工程」选择对方导出的 JSON，按对象更新时间合并（较新者胜出），删除操作也会同步。':
      'Offline collaboration: each side edits, then use Merge another project to pick the other side’s JSON; objects merge by update time (newest wins), and deletions are synced.',
    '另存到工程库':'Save to library', '未命名图纸工程':'Untitled drawing project', '已存入工程库':'Saved to the library',
    '冲突':'conflicts', '项按较新版本保留':'kept the newer version', '合并完成：':'Merge complete: ',
    '新增':'added', '更新':'updated', '新增楼层':'floors added', '合并失败：':'Merge failed: ',
    '已打开工程：':'Opened project: ', '重命名工程':'Rename project', '已重命名':'Renamed',
    '已复制一份到工程库':'Copied to the library', '确定删除工程「':'Delete project “',
    '」？此操作不可撤销（不影响已导出的文件）。':'”? This cannot be undone (exported files are unaffected).',
    '工程已删除':'Project deleted', '操作失败：':'Operation failed: ',
    '底图 / 场地':'Base map / Site', '当前：':'Current: ', '上传图片底图':'Upload image base map',
    'PNG/JPG/WebP/BMP；再用「比例尺」校准米/像素':'PNG/JPG/WebP/BMP; then calibrate m/px with Scale',
    '矩形场地（输入尺寸）':'Rectangle site (enter size)', '直接输入长×宽（米）':'Enter length × width (m)',
    '矩形场地（拖画）':'Rectangle site (draw)', '在画布上拖出对角':'Drag the diagonal on canvas',
    '圆形场地（输入半径）':'Circle site (enter radius)', '按半径（米）生成':'Create from radius (m)',
    '圆形场地（拖画）':'Circle site (draw)', '拖出半径长度':'Drag the radius',
    '椭圆场地（输入半径）':'Ellipse site (enter radii)', '输入长/短轴半径（米）':'Enter major/minor radii (m)',
    '椭圆场地（拖画）':'Ellipse site (draw)', '拖出外接包围盒':'Drag the bounding box',
    '扇形场地（拖画）':'Sector site (draw)', '拖出半径后输入起止角':'Drag the radius, then enter start/end angles',
    '平行四边形场地（输入尺寸）':'Parallelogram site (enter size)', '输入 底边, 高, 倾角（米/度）':'Enter base, height, skew (m/deg)',
    '平行四边形场地（拖画）':'Parallelogram site (draw)', '拖出底×高，生成后默认倾角 30°':'Drag base × height; default skew is 30°',
    '多边形场地（描边）':'Polygon site (trace)', '沿边界逐点单击，双击/✓闭合；三角形同理':'Click along the boundary; double-click/✓ closes; same for triangles',
    '矢量场地直接以米为世界坐标，缩放时设备尺寸与场地保持真实比例。切换会替换当前底图/场地，已有标注对象保留（如需请重新对齐）。':
      'Vector sites use metres as world coordinates; devices and the site stay true-to-scale when zooming. Switching replaces the current base map/site while existing annotations remain (realign if needed).',
    '平行四边形场地':'Parallelogram site', '底边, 高, 倾角（米/度，用逗号分隔），例如 120,80,30':'base, height, skew (m/deg, comma-separated), e.g. 120,80,30',
    '请输入底边与高（均为正数），如 120,80,30':'Enter base and height (both positive), e.g. 120,80,30',
    '椭圆场地':'Ellipse site', '长轴半径, 短轴半径（米，用逗号分隔），例如 40,25':'major radius, minor radius (m, comma-separated), e.g. 40,25',
    '请输入两个正数半径，如 40,25':'Enter two positive radii, e.g. 40,25',
    '矩形场地':'Rectangle site', '长 × 宽（米，用逗号或 x 分隔），例如 120,80':'length × width (m, comma or x separated), e.g. 120,80',
    '请输入两个正数，如 120,80':'Enter two positive numbers, e.g. 120,80',
    '圆形场地':'Circle site', '半径（米）':'Radius (m)', '请输入正数半径':'Enter a positive radius', '已设置为':'Set to ',
    '无法导入：':'Cannot import: ', '其余提示略':'more warnings omitted', '全部行均可导入。':'All rows can be imported.',
    '表格导入预览：':'Table import preview: ', '将按「编号」匹配对象并更新属性：':'Objects are matched by ID and updated: ',
    '项更新、':'updates, ', '项新增。':'new objects.',
    '可更新：名称、业务类型、图层、基点坐标、角度、宽高、形状、闭合、节点坐标、标注类型、显隐、锁定、备注；新对象支持点设备 / 矩形·圆·椭圆·扇形区域 / 折线（含闭合）/ 测距等标注（需「节点坐标」列）。':
      'Updatable: name, business type, layer, base coordinates, angle, width/height, shape, closed, node coordinates, dimension type, visibility, lock, note. New objects support point / rect·circle·ellipse·sector areas / polylines (closed) / measure annotations (Node coordinates column required).',
    '长度/面积/节点数为系统按几何自动计算值，导入时会逐行核对，手改不一致只告警不拦截、以几何为准。':
      'Length/area/node count are recomputed from geometry; inconsistent manual values only warn and never block, geometry wins.',
    '建议导入前先导出 JSON 备份。':'Export a JSON backup before importing.',
    '取消':'Cancel', '合并导入':'Merge import',
    '参与统计的点设备：':'Cameras counted: ', '（含物理尺寸的圆/球机、扇形/摄像头、方形覆盖）':' (physical circles/dome cameras, sector/cameras, square coverage)',
    '仅标识位置的图标点':'position-only markers', '个未计入':'not counted',
    '区域/闭合折线：':'Areas/closed polylines: ', '合计覆盖':'total coverage ',
    '覆盖面积':'Covered area', '盲区':'Blind area', '总面积':'Total area', '覆盖':'Coverage ',
    '已覆盖':'Covered', '栅格法估算，覆盖率＝区域内被任一视场覆盖的采样格占比':
      'Grid estimate; coverage = sampled cells covered by any field of view inside the area',
    '当前没有可用于统计的区域：请先绘制「区域」或勾选闭合的「折线」。':'No areas to analyze: draw an Area or a closed Polyline first.',
    '视场覆盖率分析':'Field-of-view coverage', '布点优化…':'Placement optimization…', '导出盲区 GeoJSON':'Export blind spots GeoJSON',
    '清除叠加层':'Clear overlay', '布点优化':'Placement optimization',
    '视场半径(m), 张角(°), 目标覆盖率(%), 最多新增台数（如 120,90,90,5）':'FOV radius (m), sweep (°), target coverage (%), max new cameras (e.g. 120,90,90,5)',
    '没有可用于布点的区域：请先绘制区域或闭合折线':'No areas for placement: draw an area or closed polyline first',
    '当前覆盖':'Current coverage', '预计':'estimated', '目标':'target', '已达标':'target reached', '仍未达标':'target not reached',
    '视场半径':'FOV radius', '张角':'sweep', '仅在「区域/闭合折线」内统计；建议点位可位于场地边界外（立杆/壁挂）':
      'Counted only inside areas/closed polylines; suggested positions may lie outside the site (pole/wall mount)',
    '建议位置 X, Y (m)':'Suggested X, Y (m)', '朝向':'Heading', '新增覆盖':'New coverage', '累计覆盖':'Cumulative coverage',
    '当前已达标，无需新增点位。':'Target already reached; no new cameras needed.',
    '应用建议（新增':'Apply suggestions (add', '台）':' cameras)', '已按建议新增':'Added', '台摄像头':'cameras as suggested',
    '布点优化（贪心覆盖最大化）':'Placement optimization (greedy coverage)',
    '新建将清空当前工程。已自动保存的草稿会被覆盖，是否先导出 JSON 或另存到工程库？':
      'New project clears the current project. The auto-saved draft will be overwritten; export JSON or save to the library first?',
    '添加文字':'Add text', '文字内容':'Text content', '标注文字':'Annotation text', '已添加文字':'Text added',
    '扇形场地角度':'Sector site angles', '起始角, 张角（度，用逗号分隔），例如 0,90':'start angle, sweep (deg, comma-separated), e.g. 0,90',
    '张角需在 0–360° 之间':'Sweep must be between 0 and 360°', '两点之间的实际距离（米）':'Real distance between the two points (m)',
    '比例尺已校准':'Scale calibrated', '仿射校准 · 第 ':'Affine calibration · point ', ' 点':'',
    '该点的实地坐标 X,Y（米，逗号分隔）。已记录图上像素 ':'Real-world X,Y of this point (m, comma-separated). Recorded pixel ',
    '坐标无效，请输入 X,Y':'Invalid coordinates; enter X,Y',
    '确定删除选中的':'Delete the selected', '个对象吗？':'objects?',
    '已记录':'Recorded', '个点，Enter/✓ 求解':'points; press Enter/✓ to solve',
    '已记录 1 个点，继续点击下一已知点':'Recorded 1 point; click the next known point',
    /* 常用操作反馈（toast 自动按整句匹配翻译） */
    '已撤销':'Undone', '已重做':'Redone', '已删除对象':'Objects deleted', '已复制对象':'Objects duplicated',
    '已新增图层':'Layer added', '已删除图层':'Layer deleted', '已修改图层':'Layer updated',
    '已批量平移':'Batch moved', '已批量旋转':'Batch rotated', '已隐藏对象':'Objects hidden', '已锁定对象':'Objects locked',
    '至少保留一个图层':'Keep at least one layer', '请先移走该图层下的对象':'Move objects out of this layer first',
    '该类型仍被对象使用':'This type is still used by objects', '选中对象位于锁定图层':'Selected objects are on a locked layer',
    '没有可删除的选中对象（可能位于锁定图层）':'No deletable selection (it may be on a locked layer)',
    '没有可修改的选中对象':'No editable selection', '没有可移动的选中对象':'No movable selection',
    '已新建工程':'New project created', '工程已导入':'Project imported', '设置已保存':'Settings saved',
    '已插入节点':'Node inserted', '已删除节点':'Node deleted', '已移动节点':'Node moved', '已更新节点':'Node updated',
    '半径过小（不足 0.5m），可在底图弹窗中直接输入半径':'Radius too small (under 0.5 m); enter it in the Base/Site dialog',
    '场地过小（不足 0.5m），可在底图弹窗中直接输入半径':'Site too small (under 0.5 m); enter radii in the Base/Site dialog',
    '多边形场地至少需要 3 个顶点':'A polygon site needs at least 3 vertices',
    '仿射校准仅适用于图片底图':'Affine calibration applies to image base maps only',
    '请先导入图片底图':'Import an image base map first', '已完成仿射校准':'Affine calibration complete',
    '矢量场地直接以米为坐标，无需比例尺校准；仅图片底图需要':'Vector sites use metres directly; scale calibration is only needed for image base maps',
    '重命名图层':'Rename layer', '重命名类型':'Rename type', '实地':'real extent',
    '已添加区域':'Area added', '已添加平行四边形区域':'Parallelogram area added', '已添加圆形区域':'Circle area added',
    '已添加椭圆区域':'Ellipse area added', '已添加扇形区域':'Sector area added', '已添加闭合区域':'Closed area added',
    '已添加折线':'Polyline added', '已添加测距':'Measure added', '已添加尺寸标注':'Dimension added'
  };

  /* 带数字/文件名的动态提示：正则模板翻译（整句匹配，避免误伤用户数据） */
  const PATTERNS = [
    [/^已粘贴 (\d+) 个对象$/, 'Pasted $1 objects'],
    [/^已复制 (\d+) 个对象到剪贴板$/, 'Copied $1 objects to clipboard'],
    [/^至少保留 (\d+) 个节点$/, 'Keep at least $1 nodes'],
    [/^捕捉已锁定：(.+)（Tab 切换，循环回自动）$/, 'Snap locked: $1 (Tab to cycle back to Auto)'],
    [/^已导入 SVG 图元：(.+)$/, 'SVG symbol imported: $1'],
    [/^SVG 导入失败：(.+)$/, 'SVG import failed: $1'],
    [/^表格读取失败：(.+)$/, 'Table read failed: $1'],
    [/^XLSX 解析失败：(.+)$/, 'XLSX parse failed: $1'],
    [/^DXF 解析失败：(.+)$/, 'DXF parse failed: $1'],
    [/^PDF 解析失败：(.+)$/, 'PDF parse failed: $1'],
    [/^底图读取失败：(.+)$/, 'Base map read failed: $1'],
    [/^照片保存失败：(.+)$/, 'Photo save failed: $1'],
    [/^DXF 已导入：(\d+) 线 \/ (\d+) 圆 \/ (\d+) 点 \/ (\d+) 文字$/,
      'DXF imported: $1 lines / $2 circles / $3 points / $4 texts'],
    [/^PDF 已导入：(\d+) 线 \/ (\d+) 区域 \/ (\d+) 文字(.*)$/,
      'PDF imported: $1 lines / $2 areas / $3 texts$4'],
    [/^表格导入完成：更新 (\d+) 项，新增 (\d+) 项$/, 'Table import complete: $1 updated, $2 created'],
    [/^已导出 (\d+) 张设备二维码标签（可打印）$/, 'Exported $1 device QR labels (printable)'],
    [/^盲区多边形已导出：(\d+) 个面（合计 (.+) ㎡）$/, 'Blind-spot polygons exported: $1 features ($2 m² total)'],
    [/^PDF 已导出：图纸 1 页 \+ 清单 (\d+) 页$/, 'PDF exported: 1 drawing page + $1 list pages'],
    [/^PDF 生成失败：(.+)$/, 'PDF generation failed: $1'],
    [/^不支持的文件类型：\.(.+)（支持 JSON 工程 \/ DXF \/ PDF \/ CSV·TSV·XLSX 表格 \/ 图片底图）$/,
      'Unsupported file type: .$1 (supported: JSON project / DXF / PDF / CSV·TSV·XLSX tables / base-map images)']
  ];
  /** 动态短语补充（整句精确匹配即可翻译的常用提示） */
  const MORE = {
    '捕捉：自动（全部类型）':'Snap: Auto (all types)', '已取消仿射校准':'Affine calibration cancelled',
    '已取消测距':'Measure cancelled', '已取消当前绘制':'Drawing cancelled',
    '已记录参考线起点，再点一次确定方向':'Guide start recorded; click again to set direction',
    '已添加参考线':'Guide added', '已添加点设备':'Point added', '场地节点已更新':'Site node updated',
    '至少需要 2 个点':'At least 2 points required', '闭合区域至少需要 3 个点':'A closed area needs at least 3 points',
    '点数不足':'Not enough points', '节点已上移':'Node moved up', '节点已下移':'Node moved down',
    '节点顺序已调整':'Node order updated', '已旋转选中对象':'Selection rotated', '对象或图层已锁定':'Object or layer is locked',
    '图层已锁定':'Layer is locked', '照片已附加':'Photo attached', '没有可旋转的选中对象':'No rotatable selection',
    '闭合区域至少需要 3 个节点，请先插入节点':'A closed area needs at least 3 nodes; insert nodes first',
    '请填写类型名称':'Enter a type name', '已新增类型':'Type added', '已删除类型':'Type deleted',
    '工程已导入':'Project imported',
    'JSON 工程格式不正确（应为图钉 PlotPin 导出的 v1 工程文件）':'Invalid JSON project (expected a PlotPin v1 project file)',
    'XLSX 中没有可导入的工作表':'The XLSX has no importable worksheet',
    'DXF 中未找到支持的实体（LINE/多段线/圆/弧/点/文字）':'No supported DXF entities found (LINE/polyline/circle/arc/point/text)',
    'PDF 中未提取到可用图形（可能是扫描图片但无内嵌图，或使用了不支持的压缩）':
      'No usable graphics found in the PDF (scanned image without embedded raster, or unsupported compression)',
    '请选择图片文件（PNG/JPG/WebP/BMP/GIF/SVG）':'Choose an image file (PNG/JPG/WebP/BMP/GIF/SVG)',
    '底图已导入':'Base map imported',
    '浏览器本地存储不可用，底图仅本次会话有效，请改用 JSON 工程保存':'Browser storage unavailable; the base map lasts this session only—save a JSON project instead',
    '当前没有可见的点设备':'No visible point devices', '请先执行「覆盖率分析」':'Run Coverage analysis first',
    '当前没有盲区可导出':'No blind spots to export', 'JSON 工程已导出（含底图与设备照片）':'JSON project exported (with base map and device photos)',
    'XLSX 已导出（可再次导入更新对象属性）':'XLSX exported (re-import to update object properties)',
    'PNG 已导出':'PNG exported', 'SVG 已导出':'SVG exported', '当前没有可导出的对象':'No objects to export',
    'DXF 已导出（坐标单位：毫米，可用 AutoCAD/LibreCAD 打开）':'DXF exported (unit: mm; open in AutoCAD/LibreCAD)',
    '已删除上一条参考线':'Last guide removed', '参考线已清除':'Guides cleared',
    '已保存设置':'Settings saved',
    '端点':'endpoint', '中点':'midpoint', '圆心':'center', '象限点':'quadrant', '垂足':'perpendicular',
    '交点':'intersection', '切点':'tangent', '自动':'Auto',
    '捕捉已锁定：':'Snap locked: ', '（Tab 切换，循环回自动）':' (Tab to cycle back to Auto)',
    '捕捉：自动（全部类型）':'Snap: Auto (all types)', '◈ 捕捉：':'◈ Snap: ', '◈ 捕捉：自动':'◈ Snap: Auto',
    '设备标签':'device labels', '设备二维码标签':'Device QR labels', '台':'units', '图纸工程':'Drawing project',
    '扫码得到 PLOTPIN:编号，可在工程内搜索该编号定位设备。本页由 PlotPin 离线生成，无外部依赖。':
      'Scan to get PLOTPIN:ID; search this ID in the project to locate the device. Generated offline by PlotPin with no external resources.',
    '图纸标注报告':'Drawing annotation report', '生成时间：':'Generated: ', '统计摘要':'Summary',
    '对象总数：':'Total objects: ', '点设备：':'Points: ', '区域：':'Areas: ', '折线：':'Polylines: ',
    '几何检查：':'Geometry check: ', '项提示':'warnings', '未发现明显问题':'No obvious issues',
    '对象清单':'Object list', '清单超过 180 行，已在打印版截断；完整数据请导出 JSON/CSV。':
      'The list exceeds 180 rows and is truncated in print; export JSON/CSV for the full data.',
    '第':'page ', '页':'', '对象类型':'Object type', '业务类型':'Business type', '参数':'Params', '长度':'Length',
    '未发现明显的零尺寸':'No obvious zero-size',
    /* 停车规划 */
    '停车规划':'Parking planner', '当前场地：':'Current site: ', '可排布':'Layout ',
    '个/排':'per row', '排（双面）':'rows (double-loaded)', '条通道':'aisles',
    '车位面积':'Stall area', '含通道利用':'Utilization incl. aisles', '剩余边角':'Remaining corners',
    '车位宽度 (m)':'Stall width (m)', '车位深度 (m)':'Stall depth (m)', '通道宽度 (m)':'Aisle width (m)',
    '场地边距 (m)':'Site margin (m)', '排列方向':'Orientation', '沿场地长边':'Along long edge', '沿场地短边':'Along short edge',
    '先清除「停车场」图层已有对象':'Clear existing objects on the Parking layer first', '生成车位':'Generate stalls',
    '停车场':'Parking', '没有可生成的车位':'No stalls to generate', '已生成':'Generated', '个车位':'stalls',
    '自动排布双面垂直车位；通道两侧共用，靠背车位连续排布。':
      'Automatically lays out double-loaded perpendicular stalls; each aisle serves both sides and back-to-back rows are contiguous.',
    '尺寸无效，请填写正数':'Invalid dimensions; enter positive numbers',
    '通道净宽不足 2.5 m，无法生成停车位':'Aisle net width below 2.5 m; cannot generate stalls',
    '通道净宽偏小（建议 5.5–6.0 m）':'Aisle net width is small (recommended 5.5–6.0 m)',
    '车位宽度偏小（建议 ≥ 2.4 m）':'Stall width is small (recommended ≥ 2.4 m)',
    '车位深度偏小（建议 ≥ 5.0 m）':'Stall depth is small (recommended ≥ 5.0 m)',
    '场地边距偏小（建议 ≥ 0.3 m）':'Site margin is small (recommended ≥ 0.3 m)',
    '当前场地不足以排下完整车位与通道':'The current site cannot fit complete stalls and aisles',
    /* 内置类型名称（用户自定义类型保持原名） */
    '通用标记':'Generic marker', '摄像头':'Camera', '球机':'Dome camera', '路灯':'Street light', '道闸':'Barrier gate',
    '充电桩':'Charger', '警示点':'Warning point', '自定义点':'Custom point', '普通区域':'Generic area', '车位区域':'Parking bay',
    '建筑/遮挡':'Building/obstruction', '通道':'Aisle', '围墙/边界':'Wall/boundary', '围栏':'Fence',
    '车行线':'Vehicle lane', '人行线':'Pedestrian lane', '自定义线':'Custom line', '尺寸标注':'Dimension'
  };
  Object.assign(PHRASES, MORE);

  let lang = 'zh';

  function t(key) {
    const d = DICT[lang] || DICT.zh;
    if (d[key] !== undefined) return d[key];
    return DICT.zh[key] !== undefined ? DICT.zh[key] : key;
  }
  /** 动态中文文案 → 当前语言；英文未收录时回退中文，保证不出现空白 */
  function p(text) {
    if (lang !== 'en') return text;
    if (PHRASES[text] !== undefined) return PHRASES[text];
    for (const [re, out] of PATTERNS) {
      if (re.test(text)) return text.replace(re, out);
    }
    return text;
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

  global.I18N = { t, p, setLang, apply, dict: DICT, phrases: PHRASES, get lang() { return lang; } };
  global.L = p;   /* 动态模板简写：${L('宽度')} */
})(typeof window !== 'undefined' ? window : globalThis);
