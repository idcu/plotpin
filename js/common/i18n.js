/* i18n.js —— 界面文案字典与切换（中/英）
 *
 * 覆盖范围：顶栏、工具栏、页签、导出、HUD、清单/图层静态文案、设置面板与通用确认按钮。
 * 属性面板等动态业务文案仍为中文，属后续增量；核心绘图流程不依赖语言。
 * 用法：I18N.setLang('en'); I18N.apply(document); I18N.t('new')
 */
/* 长文案单一来源：既做 i18n 键，也被界面直接引用，避免同一串在产物里重复两遍 */
const TX_CLR='将清空当前楼层底图、场地、{n} 个对象与标注、校准/仿射配置；可用 Ctrl+Z 撤销。';
const TX_AFF='仿射校准：点击已知点并输入实地 X,Y（2 点=相似，≥3 点=完整仿射）；控制点可拖拽/Delete/Ctrl+Z，Enter 或 ✓ 求解，右键/Esc 取消';
const TX_TIMP='可更新名称、业务类型、图层、坐标/角度/宽高/形状/闭合/节点、标注、显隐、锁定、备注；替换只改属性不改几何；匹配列限定范围，「楼层」列限定落点。';
const TX_DWG='PlotPin 不内置 DWG 内核，也不会修改原文件。请在 CAD 中另存为 DXF 或 PDF 后导入：';
const TX_SDRAG='拖拽画布控制点调整场地；也可输入精确坐标/参数（米，可为负）；场地与图片底图可同时存在。';
const TX_SEDIT='直接改下方坐标/参数；也可用「场地节点」工具拖拽控制点（米，可为负）。';
const TX_SNAPC='画布聚焦时 Tab 循环切换捕捉类型；点击底部捕捉徽标恢复自动';
const TX_SNAP='回滚到快照「{name}」？未保存修改先入撤销栈（Ctrl+Z 可撤回）；回滚后立即落盘。';
const TX_REF='参考层导入后整层锁定，需编辑请在图层管理器解锁；DXF 样式不映射，以几何与图层为准。';
const TX_TAUTO='长度/面积/节点数按几何自动计算；导入核对不一致只告警，以几何为准。';
const TX_BDXF='该 DXF 是二进制格式（AutoCAD Binary DXF），浏览器端暂不能直接解析；请在 CAD 中另存为 ASCII DXF 后导入';
const TX_POLY='折线：逐点单击、双击结束；Shift 正交，右键/Esc 取消（可勾选闭合）';
/* 界面提示与字典键共用同一份字符串：同一句在产物里只存一份（体积预算按原始字节计） */
const TX_PTYPE='该类型仅标识位置（屏幕固定图标）；如需真实覆盖范围，请在「图层/类型」改用圆/方/扇形/杆型。';
const TX_CALIB='比例尺：点两个已知点，可拖拽/Delete 删除/Ctrl+Z 撤销，Enter 或 ✓ 应用';
const TX_STATS='统计与缩放/像素/DPR 无关；面积为解析公式，与报告同源；历史 v1/v2 报告不可直接对比。';
const TX_LENS='镜头口径：张角取 fov（默认 90°，10–360°）；距离取 phys(m)：扇形=phys，圆/方=phys/2；未填 phys 不计入；隐藏对象/图层不进分母。';
const TX_DXFIMP='DXF 已导入：{line} 线 / {rect} 圆 / {point} 点 / {text} 文字{extra}';
const TX_UNSUP='不支持的文件类型：.{ext}（支持 JSON 工程 / DXF / PDF / CSV·TSV·XLSX 表格 / 图片底图）';
const TX_MERGE='合并完成：新增 {added} · 更新 {updated} · 删除 {deleted} · 新增楼层 {floorsAdded}{extra}{conflict}';
const TX_LDEL='图层「{layer}」在 {floors} 个楼层被 {count} 个对象使用；删除后迁移到「{target}」。继续？';
const TX_TDEL='类型「{type}」在 {floors} 个楼层被 {count} 个对象使用；删除后迁移到「{target}」。继续？';
const TX_PDFMP='多页按所选页升序并排，首页锚定原点，页间距 {gap} m；每页对象归入「PDF 第 i 页」图层，底图只取首页。';
const TX_REST='恢复=一次新编辑（可 Ctrl+Z）；对端采纳前可能仍显示旧版；旧底图/照片可能已回收。';
const TX_PEER='对端已推送工程快照。确认后对方拥有完整编辑权：可覆盖、删除对象与楼层、改配置。是否应用？';
const TX_PDFE='PDF 第 1 页未提取到可用图形（仅导入第 1 页；也可能是扫描图或使用了不支持的压缩）';
const TX_RELAY='默认直连。每行：地址 | 用户名 | 凭据；STUN 只填地址，多个用逗号分隔。凭据明文存本机，不进邀请/协作/工程。';
const TX_ACOORD='坐标按世界坐标（米），可为负；区域随底图保持真实比例。三角形/多边形请用「折线」勾选闭合。';
const TX_RECT='区域：上方选形状后按住左键拖画；按住 Shift 矩形=正方形、椭圆=正圆、扇形=45°吸附，Esc 取消';
const TX_OSNAP='自动吸附端点□ 中点△ 圆心◎ 象限◇ 垂足⊥ 交点× 切点；画线时橙色虚线=45°极轴/平行追踪';
const TX_ARC='含圆弧的工程请用 ≥ 当前版本打开；旧版打开会丢弃圆弧，保存一次后永久消失。';
const TX_ARCIMP='不勾选则按 24 段折线导入（与旧版一致）。圆弧为纯描边几何，不参与面积与覆盖率。';
const TX_QR='扫码得到 PLOTPIN:编号，可搜索定位设备。本页由 PlotPin 离线生成，无外部依赖。';
const TX_TB='默认关闭，关闭时导出与旧版一致；日期留空=当天，比例留空=自动 1:N。';
const TX_PDFST='浏览器本地存储不可用，PDF 底图仅本次会话有效，请改用 JSON 工程保存';
const TX_BADJSON='JSON 工程格式不正确（应为图钉 PlotPin 导出的 v1 工程文件）';
const TX_DSCALE='检测到图纸比例 1:{a}{more}（仅提示，不修改自动标定）';
const TX_RSMALL='半径过小（不足 0.5m），可在底图弹窗中直接输入半径';
const TX_SSMALL='场地过小（不足 0.5m），可在底图弹窗中直接输入尺寸';
const TX_QUICK='快速上手：底图/场地并校准 → 左栏选工具逐点单击，双击/Enter 完成 → 拖圆手柄旋转、方手柄缩放 → 清单批量编辑 → 导出。';
const TX_LOCKED='选中对象位于锁定图层';
const TX_NOEDIT='没有可修改的选中对象';
const TX_PICKFIRST='先勾选对象';
const TX_PARA='基点为图形左下角，也是旋转中心；平行四边形面积=底×高，倾角只改变斜边不改变面积；';
const TX_IMGSCALE='图片以像素×比例尺映射到世界坐标；如需精确贴合请用「比例尺校准」或「仿射校准」。';
const TX_AUTOSAVE='工程自动保存：绑定后每次修改都会同步到工程库；删除工程不影响已导出的 JSON 文件。';
const TX_DXFLOSS='动态块 / 外部参照 / 代理对象 / 标注样式在转换时可能丢失，导入后请核对保真度提示。';
const TX_SELTITLE='选择：点击对象，框选多个对象；画线/拖点会自动捕捉端点、中点、圆心（设置可关）';
const TX_NEWWARN='新建将清空当前工程。已自动保存的草稿会被覆盖，是否先导出 JSON 或另存到工程库？';
const TX_LIBEMPTY='工程库还是空的。先把当前图纸「另存到工程库」，以后可在多个工程间快速切换。';
const TX_DIMTITLE='尺寸标注：测距逐点单击、双击结束（右键/Esc 取消）；其他类型按提示逐点单击';
const TX_PROPTIP='提示：单击对象可在此编辑其属性；框选可批量选择；Delete 删除；Ctrl+Z 撤销。';
const TX_POLARHINT='逐点录入时自动吸附到极轴角整数倍（参考边平行/垂直与等距约束始终可用）';
const TX_NOAREA='当前没有可用于统计的区域：请先绘制「区域」或勾选闭合的「折线」。';
const TX_STORAGE='存储使用率较高：可移除不用的底图，或导出 JSON 备份后清理本站数据。';
const TX_STORAGE2='工程与底图存于 IndexedDB（底图按内容哈希去重），设置存于 localStorage。';
const TX_BADROWS='存在非法行，整批取消导入；修正后重新导入即可，现有对象未被修改。';
const TX_AFFHINT='用已知点及真实 X,Y 求图片到世界的变换；2 点=相似，≥3 点=完整仿射。';
const TX_ARCTITLE='圆/圆弧：先点圆心，再点半径端（圆）或起点/终点（圆弧）；Esc 取消';
const TX_CENTERTIP='圆心/中心即形状基点（画布上以 ⊕ 标出），移动图形即移动基点；';
const TX_NODETIP='拖 ⠿ 或 ↑↓ 调整顺序；画布上双击线段插入节点、双击节点删除';
const TX_FOVHINT='视场半径(m), 张角(°), 目标覆盖率(%), 最多新增台数（如 120,90,90,5）';
const TX_IMPORTFIRST='先核对版本、单位与保真度，再决定落点；导入失败会整批回滚。';
const TX_AFFPRE='在图上依次点击已知点并输入实地坐标，纠正倾斜与不等比缩放';
const TX_LOCALCONV='转换在你的本机完成，PlotPin 只读取 DXF/PDF，单文件承诺不变。';
const TX_DXFSAVE='AutoCAD「文件 → 另存为 → DXF（ASCII）」，建议 2013/2018 版本；';
const TX_PDFSAVE='AutoCAD「打印/导出 → PDF」，可作矢量图纸或底图导入；';
const TX_TABLEOPS='按「编号」更新 / 「匹配…」条件批量替换 / 无编号行新增：';
const TX_POLYMIN='多边形场地至少保留 3 个顶点';
const TX_ALIGNTIP='按对象包围盒对齐；分布保持首末对象不动、其余等间距。';
const TX_SEGMIN='屏幕上短于该像素长度的线段不显示段长标注，避免拥挤';
const TX_RO='本地只读：{what}已拒（仅锁本端编辑，对端仍可改本工程）';
const TX_FLOORGLOSS='每层独立底图/场地与对象；图层、类型与工程库跨层共享。';
const TX_GLOSSIMG='栅格图片（PNG/JPG/WebP）；先校准像素→米，仅影响图片对象。';
const TX_GLOSSSITE='按米制绘制的矩形/圆/椭圆/扇形/多边形边界；无需校准。';
const TX_GLOSSSCALE='用两点及其实距求像素→米比例与旋转；仅作用于图片底图。';
const TX_GLOSSCOV='按视场角与安装高度投影，统计可见设备覆盖率与盲区。';
(function (global) {
  'use strict';
  const DICT = {
    zh: {
      brand: '图钉',
      new: '新建', projects: '📁 工程库', floors: '🏢 楼层', import: '导入', export: '导出',
      print: '打印/PDF', settings: '设置', clearAll: '清空', helpTitle: '快速上手与快捷键',
      clearAllTitle: '清空当前楼层的底图、场地、对象与标注；可 Ctrl+Z 撤销',
      select: '选择', pan: '平移', point: '点设备', area: '区域', line: '折线', segment: '线段', arrow: '箭头', arrowBoth: '双向箭头', freehand: '手绘', spline: '样条曲线', circleArc: '圆/弧', arcThree: '三点圆弧', text: '文字',
      dimension: '标注', siteNode: '场地节点', imageXform: '图片变换', guide: '参考线', finish: '完成',
      tabProps: '属性', tabList: '清单', tabLayers: '图层/类型', tabSymbols: '符号库', tabStats: '统计', tabRules: '规则', tabComments: '批注',
      commentsLocalOnly: '评论仅本机可见，不随协作同步',
      commentPlaceholder: '写评论…', addComment: '添加',
      exportJson: 'JSON 工程', exportPng: 'PNG 高清图', exportSvg: 'SVG 矢量图',
      exportPdf: 'PDF（图纸位图+清单）', exportPdfVector: 'PDF（矢量）· 文字可搜索', exportDxf: 'DXF（CAD 互通）', exportDxfFidelity: 'DXF（保真：椭圆+圆弧）',
      exportCsv: 'CSV 表格', exportTsv: 'TSV 表格', exportXlsx: 'Excel (.xlsx)',
      exportLedgerTpl: '台账模板导出…',
      exportTitleBlock: '图框模板…',
      exportLabels: '设备二维码标签 (HTML)',
      baseSite: '底图/场地', scaleBtn: '比例尺', affineBtn: '仿射校准', coverageBtn: '覆盖率分析', parkingBtn: '停车规划', collabBtn: '协作',
      panelToggle: '☰ 面板', fitBtn: '适应',
      typeNamePlaceholder: '例如：烟感、货位、警戒线',
      iconDot: '圆点', iconCamera: '摄像头', iconDome: '球机', iconLight: '路灯', iconGate: '道闸',
      iconCharger: '充电桩', iconWarning: '警示', iconCustom: '菱形',
      scaleNone: '仅位置图标（不缩放）', scaleCircle: '圆形覆盖区', scaleSquare: '方形区域',
      scaleSector: '扇形视场（如摄像头）', scaleBar: '杆/线段（如道闸）',
      saveUnsaved: '未保存',
      /* 通用动作 / 弹窗 */
      cancel: '取消', ok: '确定', close: '关闭', save: '保存',
      confirmTitle: '确认操作', settingsTitle: '工程设置',
      /* ARIA 标签 */
      ariaTools: '绘图工具', ariaCanvas: '绘图画布：使用左侧工具在此绘制和选择对象',
      ariaTabs: '侧栏页签', ariaExport: '选择导出格式',
      ariaUndo: '撤销 (Ctrl+Z)', ariaRedo: '重做 (Ctrl+Y)',
      ariaZoomIn: '放大', ariaZoomOut: '缩小', ariaZoomFit: '适应窗口显示整张场地',
      ariaSidebar: '显示或隐藏属性面板',
      ariaMarkerScale: '点设备图标显示大小',
      ariaObjVisible: '切换对象显隐', ariaObjLock: '切换对象锁定',
      ariaLayerVisible: '切换图层显隐', ariaLayerLock: '切换图层锁定',
      ariaLayerRename: '重命名图层', ariaLayerDelete: '删除图层',
      ariaTypeColor: '类型颜色', ariaTypeRename: '重命名类型', ariaTypeDelete: '删除类型',
      ariaBatchLayer: '批量移动到图层', ariaBatchDx: 'X 方向平移距离', ariaBatchDy: 'Y 方向平移距离', ariaBatchAngle: '旋转角度',
      /* HUD / 清单 / 图层与类型 */
      typeLabel: '类型', shapeLabel: '形状', closedArea: '闭合区域', pointSize: '点大小',
      hintText: '滚轮缩放；右键/中键或空格拖拽画布；Delete 删除；Tab 切换捕捉；按 ? 查看帮助；可拖拽文件导入',
      allObjects: '全部对象', allTypes: '全部类型', allLayers: '全部图层',
      filterPoint: '点设备', filterArea: '矩形/区域', filterLine: '线段/折线', filterArc: '圆弧', filterText: '文字', filterDimension: '尺寸标注',
      thId: '编号', thName: '名称', thType: '类型', thLayer: '图层', thParam: '参数', thVisible: '显隐', thLock: '锁',
      searchPlaceholder: '搜索编号/名称/备注',
      batchChangeLayer: '改图层', batchMove: '平移', batchRotate: '旋转', batchDelete: '删除',
      batchAnnotLabel: '图上标注', batchAnnotAll: '全选/全不选',
      selectAll: '全选当前筛选结果',
      layersHeading: '图层', newLayerPlaceholder: '新图层名称', addLayer: '新增图层',
      typesHeading: '类型管理', addTypeHeading: '新增自定义类型',
      builtinType: '内置', customType: '自定义', objectsUnit: '个对象',
      kindLabel: '类别', nameLabel: '名称', colorLabel: '颜色', widthLabel: '线宽', iconLabel: '图标',
      scaleShapeLabel: '尺寸图形', iconSizeLabel: '图标大小', addType: '新增类型', importSvg: '导入 SVG 图元…',
      shapeRect: '矩形', shapeCircle: '圆形', shapeEllipse: '椭圆', shapeSector: '扇形', shapeParallelogram: '平行四边形',
      areaNoFill: '仅描边', revCloud: '修订云线',
      dimDistance: '两点距离', dimRuler: '测距（多点总长）', dimArea: '面积', dimAngle: '角度', dimLeader: '引线标注',
      dimRadius: '半径标注', dimDiameter: '直径标注', dimCoord: '坐标', dimElev: '标高', mirror: '镜像',
      batchArray: '阵列', batchPolar: '环形', batchOffset: '偏移', batchClose: '闭合', batchReverse: '反向', arrayHint: '行,列,行距,列距', polarHint: '数量,角度(°)[,中心X,中心Y]', arrayDone: '已生成阵列',
      offsetHint: '距离(m)', badParam: '参数无效', opDone: '已创建副本',
      pickCircle: '请点击圆或圆弧',
      /* 设置面板 */
      projectName: '工程名称', gridSpacing: '网格间距', enableSnap: '启用捕捉', showGrid: '显示网格',
      crosshair: '十字准星/坐标', segLabelMinPxSetting: '段长标注最小像素',
      exportOnlyDelivered: '仅导出已交付对象', pdfDpi: 'PDF 图纸页分辨率',
      osnapSetting: '对象捕捉', polarSetting: '极轴追踪',
      polarStepSetting: '极轴角', precisionSetting: '坐标精度', runtimeSetting: '运行环境',
      siteBgSetting: '场地/底图', languageLabel: '界面语言',
      /* D-14 */
      symbolSearchPlaceholder: '搜索名称或别名，如 烟感 / NVR / 道闸',
      symbolSearchAria: '搜索符号名称或别名', symbolCategoryAria: '按符号分类筛选', symbolAllCategories: '全部分类',
      symbolAngleLabel: '旋转角 (°)', symbolAngleTitle: '放置时的初始旋转角（可在属性面板继续调整）', symbolAngleAria: '符号放置旋转角',
      symbolPhysLabel: '真实尺寸 (m)', symbolPhysTitle: '0=屏幕固定图标；填图元外接宽度（米）后按真实比例渲染', symbolPhysAria: '符号真实尺寸（米）',
      symbolPlaceHint: '点击符号即切换到「点设备」工具，再点击画布放置；旋转角与真实尺寸可在属性面板继续调整。',
      symbolCustomHeading: '自有符号', symbolImportSvg: '导入 SVG…',
      symbolImportSvgTitle: '导入 SVG：经安全清洗（禁脚本/事件/外链，限元素与字节）',
      symbolExportJson: '导出 JSON', symbolExportJsonTitle: '仅导出当前工程的自定义符号',
      symbolImportJson: '导入 JSON', symbolImportJsonTitle: '导入自定义符号 JSON，仅写入当前工程',
      symbolCustomHint: '自定义符号保存在当前工程命名空间；导入只影响当前工程，不影响其他工程。',
      rulesHeading: '几何规则检查', rulesViolationsHeading: '违规清单',
      rulesRun: '运行检查', rulesExport: '导出 CSV', rulesClear: '清空结果',
      pluginSessionOnly: '插件与本地插件库',
      ghostLayer: '幽灵参考层（仅本会话）', ghostPick: '选择参考图…', ghostClear: '清除参考层', ghostOpacity: '不透明度',
      siteBgHint: '可点顶部「底图/场地」上传图片或改画矩形/圆形/椭圆/扇形/平行四边形/多边形',
      pluginStatusActive: '可用', pluginStatusLoading: '加载中', pluginStatusDisabled: '已禁用', pluginStatusUnloaded: '已卸载',
      pluginNoCapabilities: '无能力', pluginUnload: '卸载', pluginNoneImported: '尚未导入插件',
      pluginSavedDisabled: '已保存未启用', pluginEnable: '启用', pluginLibrary: '本地插件库',
      pluginImportManifest: '导入清单（.json）',
      pluginManifestHint: '格式 plotpin.plugin/v1；code ≤64 KB、清单 ≤192 KB；刷新后需手动启用。',
      bwTitle: '带宽/存储', bwCodec: '编码', bwRes: '分辨率', bwFps: '帧率 (fps)', bwStream: '码流类型',
      bwChannels: '路数', bwDays: '天数', bwHours: '写入小时', bwRedundancy: '冗余%',
      wireTitle: '布线统计', wireRoute: '沿折线走线', wireChain: '设备点对点',
      wireReserve: '端点预留 (m/端)', wireBend: '弯曲余量 (%)',
      wireGeom: '几何', wireReserveLen: '预留', wireBendLen: '弯曲', wireTotal: '合计',
      wireHint: '几何估算（非实测）；不含垂直段；明细最多100行；预留/弯曲为经验值，可改。'
    },
    en: {
      brand: 'PlotPin',
      new: 'New', projects: '📁 Projects', floors: '🏢 Floors', import: 'Import', export: 'Export',
      print: 'Print/PDF', settings: 'Settings', clearAll: 'Clear', helpTitle: 'Quick start & shortcuts',
      clearAllTitle: 'Clear floor base/site/objects/annotations; Ctrl+Z undoes',
      select: 'Select', pan: 'Pan', point: 'Point', area: 'Area', line: 'Polyline', segment: 'Segment', arrow: 'Arrow', arrowBoth: 'Both ends', freehand: 'Freehand', spline: 'Spline', circleArc: 'Circle/Arc', arcThree: '3-point arc', text: 'Text',
      dimension: 'Dimension', siteNode: 'Site nodes', imageXform: 'Image transform', guide: 'Guides', finish: 'Finish',
      tabProps: 'Properties', tabList: 'Objects', tabLayers: 'Layers/Types', tabSymbols: 'Symbols', tabStats: 'Statistics', tabRules: 'Rules', tabComments: 'Comments',
      commentsLocalOnly: 'Comments are local only; not synced',
      commentPlaceholder: 'Write a comment…', addComment: 'Add',
      exportJson: 'JSON project', exportPng: 'PNG (high-res)', exportSvg: 'SVG (vector)',
      exportPdf: 'PDF (raster drawing + list)', exportPdfVector: 'PDF (vector) · searchable text', exportDxf: 'DXF (CAD)', exportDxfFidelity: 'DXF (fidelity: ellipse + arc)',
      exportCsv: 'CSV table', exportTsv: 'TSV table', exportXlsx: 'Excel (.xlsx)',
      exportLedgerTpl: 'Ledger template…',
      exportTitleBlock: 'Title block…',
      exportLabels: 'Device QR labels (HTML)',
      baseSite: 'Base/Site', scaleBtn: 'Scale', affineBtn: 'Affine', coverageBtn: 'Coverage', parkingBtn: 'Parking', collabBtn: 'Collab',
      panelToggle: '☰ Panel', fitBtn: 'Fit',
      typeNamePlaceholder: 'e.g. smoke detector, bay, warning line',
      iconDot: 'Dot', iconCamera: 'Camera', iconDome: 'Dome camera', iconLight: 'Street light', iconGate: 'Barrier gate',
      iconCharger: 'Charger', iconWarning: 'Warning', iconCustom: 'Diamond',
      scaleNone: 'Position marker only', scaleCircle: 'Circle coverage', scaleSquare: 'Square area',
      scaleSector: 'Sector FOV (e.g. camera)', scaleBar: 'Bar/segment (e.g. gate)',
      saveUnsaved: 'Unsaved',
      cancel: 'Cancel', ok: 'OK', close: 'Close', save: 'Save',
      confirmTitle: 'Confirm', settingsTitle: 'Project settings',
      ariaTools: 'Drawing tools', ariaCanvas: 'Drawing canvas: draw & select objects with the tools on the left',
      ariaTabs: 'Sidebar tabs', ariaExport: 'Choose export format',
      ariaUndo: 'Undo (Ctrl+Z)', ariaRedo: 'Redo (Ctrl+Y)',
      ariaZoomIn: 'Zoom in', ariaZoomOut: 'Zoom out', ariaZoomFit: 'Fit the whole site in view',
      ariaSidebar: 'Show or hide the properties panel',
      ariaMarkerScale: 'Device icon display size',
      ariaObjVisible: 'Toggle object visibility', ariaObjLock: 'Toggle object lock',
      ariaLayerVisible: 'Toggle layer visibility', ariaLayerLock: 'Toggle layer lock',
      ariaLayerRename: 'Rename layer', ariaLayerDelete: 'Delete layer',
      ariaTypeColor: 'Type color', ariaTypeRename: 'Rename type', ariaTypeDelete: 'Delete type',
      ariaBatchLayer: 'Move selection to layer', ariaBatchDx: 'X offset', ariaBatchDy: 'Y offset', ariaBatchAngle: 'Rotation angle',
      typeLabel: 'Type', shapeLabel: 'Shape', closedArea: 'Closed area', pointSize: 'Marker size',
      hintText: 'Wheel zoom; right/middle/Space-drag pan; Delete; Tab snaps; ? help; drop to import',
      allObjects: 'All objects', allTypes: 'All types', allLayers: 'All layers',
      filterPoint: 'Point', filterArea: 'Rect/Area', filterLine: 'Polyline', filterArc: 'Arc', filterText: 'Text', filterDimension: 'Dimension',
      thId: 'ID', thName: 'Name', thType: 'Type', thLayer: 'Layer', thParam: 'Params', thVisible: 'Visible', thLock: 'Lock',
      searchPlaceholder: 'Search ID / name / note',
      batchChangeLayer: 'Set layer', batchMove: 'Move', batchRotate: 'Rotate', batchDelete: 'Delete',
      batchAnnotLabel: 'On-plan labels', batchAnnotAll: 'All / none',
      selectAll: 'Select all filtered results',
      layersHeading: 'Layers', newLayerPlaceholder: 'New layer name', addLayer: 'Add layer',
      typesHeading: 'Types', addTypeHeading: 'Add custom type',
      builtinType: 'Built-in', customType: 'Custom', objectsUnit: 'objects',
      kindLabel: 'Category', nameLabel: 'Name', colorLabel: 'Color', widthLabel: 'Line width', iconLabel: 'Icon',
      scaleShapeLabel: 'Sized shape', iconSizeLabel: 'Icon size', addType: 'Add type', importSvg: 'Import SVG symbol…',
      shapeRect: 'Rectangle', shapeCircle: 'Circle', shapeEllipse: 'Ellipse', shapeSector: 'Sector', shapeParallelogram: 'Parallelogram',
      areaNoFill: 'Outline only', revCloud: 'Revision cloud',
      dimDistance: 'Two-point distance', dimRuler: 'Measure (total length)', dimArea: 'Area', dimAngle: 'Angle', dimLeader: 'Leader label',
      dimRadius: 'Radius label', dimDiameter: 'Diameter label', dimCoord: 'Coords', dimElev: 'Level', mirror: 'Mirror',
      batchArray: 'Array', batchPolar: 'Polar', batchOffset: 'Offset', batchClose: 'Close', batchReverse: 'Reverse', arrayHint: 'rows, cols, dx, dy', polarHint: 'count, angle (°)[, centerX, centerY]', arrayDone: 'Array created',
      offsetHint: 'Distance (m)', badParam: 'Invalid parameters', opDone: 'Copies created',
      pickCircle: 'Click a circle or arc',
      projectName: 'Project name', gridSpacing: 'Grid spacing', enableSnap: 'Enable snapping', showGrid: 'Show grid',
      crosshair: 'Crosshair / coords', segLabelMinPxSetting: 'Min segment label (px)',
      exportOnlyDelivered: 'Export delivered only', pdfDpi: 'PDF drawing DPI',
      osnapSetting: 'Object snap', polarSetting: 'Polar tracking',
      polarStepSetting: 'Polar angle', precisionSetting: 'Coord precision', runtimeSetting: 'Runtime',
      siteBgSetting: 'Site / base map', languageLabel: 'Interface language',
      symbolSearchPlaceholder: 'Search name or alias (smoke / NVR / barrier)',
      symbolSearchAria: 'Search symbol name or alias', symbolCategoryAria: 'Filter by symbol category', symbolAllCategories: 'All categories',
      symbolAngleLabel: 'Rotation (°)', symbolAngleTitle: 'Initial rotation on placement (adjust in Properties)', symbolAngleAria: 'Symbol rotation when placing',
      symbolPhysLabel: 'Real size (m)', symbolPhysTitle: '0 = fixed icon; enter width (m) for true scale', symbolPhysAria: 'Real symbol width (m)',
      symbolPlaceHint: 'Click a symbol, then the canvas; adjust rotation/size in Properties.',
      symbolCustomHeading: 'Custom symbols', symbolImportSvg: 'Import SVG…',
      symbolImportSvgTitle: 'Import SVG (sanitized: no scripts/events/links; size-limited)',
      symbolExportJson: 'Export JSON', symbolExportJsonTitle: "Export this project's custom symbols only",
      symbolImportJson: 'Import JSON', symbolImportJsonTitle: 'Import custom symbols into this project only',
      symbolCustomHint: 'Custom symbols apply to this project only.',
      rulesHeading: 'Geometry rules', rulesViolationsHeading: 'Violations',
      rulesRun: 'Run check', rulesExport: 'Export CSV', rulesClear: 'Clear results',
      pluginSessionOnly: 'Plugins & local library',
      ghostLayer: 'Ghost reference (this session only)', ghostPick: 'Choose reference…', ghostClear: 'Clear reference', ghostOpacity: 'Opacity',
      siteBgHint: 'Base/Site in the top bar uploads an image or redraws the site',
      pluginStatusActive: 'Active', pluginStatusLoading: 'Loading', pluginStatusDisabled: 'Disabled', pluginStatusUnloaded: 'Unloaded',
      pluginNoCapabilities: 'no capabilities', pluginUnload: 'Unload', pluginNoneImported: 'No plugin imported',
      pluginSavedDisabled: 'Saved, not enabled', pluginEnable: 'Enable', pluginLibrary: 'Local plugin library',
      pluginImportManifest: 'Import manifest (.json)',
      pluginManifestHint: 'plotpin.plugin/v1; code ≤64 KB, manifest ≤192 KB; enable after refresh.',
      bwTitle: 'Bandwidth/storage', bwCodec: 'Codec', bwRes: 'Res', bwFps: 'FPS', bwStream: 'Stream',
      bwChannels: 'Cams', bwDays: 'Days', bwHours: 'Hours', bwRedundancy: 'Redundancy%',
      wireTitle: 'Cabling', wireRoute: 'Polylines', wireChain: 'Chain',
      wireReserve: 'End reserve (m)', wireBend: 'Bend (%)',
      wireGeom: 'Geom.', wireReserveLen: 'Reserve', wireBendLen: 'Bend', wireTotal: 'Total',
      wireHint: 'Geometric estimate; no vertical runs; first 100 rows.'
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
    '上移一层':'Raise', '下移一层':'Lower', '隐藏':'Hide', '显示':'Show', '解锁':'Unlock', '锁定':'Lock', '删除':'Delete', '显隐':'Show/hide',
    '只读':'Read-only', '只读中':'Read-only ON',
    '已进入本地只读：仅锁本端，对端仍可改本工程':'Read-only on: this device only; peers can still edit',
    '已退出本地只读':'Read-only off',
    [TX_RO]:'Read-only: {what} denied (local only; peers can still edit)',
    '编辑':'Edit', '撤销':'Undo', '重做':'Redo', '拖拽':'drag', '该工具':'this tool', '属性写入':'property edit',
    '编辑快捷键':'edit shortcut', '复制对象':'duplicate', '粘贴':'paste', '清空楼层':'clear floor',
    '批量属性':'Batch properties', '移动到':'Move to', '应用图层':'Apply layer', '批量旋转':'Rotate all', '全部删除':'Delete all',
    '图上标注':'On-drawing labels', '场地属性':'Site properties', '场地节点':'Site nodes', '图片底图':'Image base map',
    '像素':'Pixels', '比例':'Scale', '校准':'Calibration', '实测范围':'Measured extent', '已校准':'Calibrated',
    '未校准':'Not calibrated', '已校正倾斜':'Deskewed', '轴对齐':'Axis-aligned', '底图/场地…':'Base/Site…',
    '比例尺校准':'Scale calibration', '仿射校准':'Affine calibration', '未命名':'Untitled',
    '矩形':'Rectangle', '圆形':'Circle', '椭圆':'Ellipse', '扇形（饼形）':'Sector (pie)', '扇形':'Sector', '平行四边形':'Parallelogram', '倾角':'Skew',
    '点设备':'Point', '矩形/区域':'Rect/Area', '线段/折线':'Polyline', '尺寸标注':'Dimension',
    '个对象':'objects', '个顶点':'vertices', '工程信息':'Project info', '工程名称':'Project name',
    '场地':'Site', '场地参数':'Site parameters', '对象总数':'Total objects', '最近更新':'Last updated',
    '几何检查':'Geometry check', '本地存储':'Local storage', '统计中…':'Calculating…',
    '浏览器配额':'Browser quota', '使用率':'Usage', '点坐标':'Point coords', '基点坐标':'Base coords',
    '半径':'Radius', '边长':'Side length', '顶点坐标':'Vertex coords', '节点坐标':'Node coords', '段长':'Segment length', '角度':'Angle',
    [TX_SEGMIN]:'Hide segment labels under this many pixels',
    '自动吸附端点、中点、圆心、垂足、交点等（Tab 切换类型）':'Snap endpoints/midpoints/centers/feet/intersections (Tab cycles)',
    [TX_POLARHINT]:'While picking points, snap to polar-angle multiples (parallel/perpendicular and spacing constraints stay available)',
    '极轴追踪的角度步长':'Polar tracking angle step',
    '拖拽调整节点顺序':'Drag to reorder nodes',
    [TX_PARA]:
      'Base = lower-left corner and rotation center; parallelogram area = base × height; skew moves only the slanted edge.',
    [TX_CENTERTIP]:
      'Circle/ellipse/sector center is the shape base (⊕ on canvas); moving the shape moves the base.',
    [TX_ACOORD]:
      'World coordinates in metres, may be negative; areas stay true-to-scale. For triangles/polygons use Polyline with Closed.',
    [TX_PTYPE]:
      'Marker only (fixed screen icon); for real coverage use a circle/square/sector/bar type under Layers/Types.',
    [TX_SEDIT]:
      'Edit coordinates/parameters below, or drag handles with Site nodes (metres, may be negative).',
    [TX_PROPTIP]:
      'Tip: click an object to edit properties; drag a box to select multiple; Delete removes; Ctrl+Z undoes.',
    [TX_IMGSCALE]:
      'The image maps pixels to world coordinates via scale; use Scale or Affine calibration for precise alignment.',
    '未发现明显的零尺寸、自相交或越界问题。':'No zero-size, self-intersection or out-of-bounds issues.',
    [TX_STORAGE2]:
      'Projects/base maps: IndexedDB (hashed); settings: localStorage.',
    [TX_STORAGE]:
      'Storage usage is high: remove unused base maps or export a JSON backup and clear site data.',
    '在图上显示':'Show on drawing', '共':'total', '至少':'min', 
    '已插入场地顶点':'Site vertex inserted', '已删除场地顶点':'Site vertex deleted',
    '场地顶点顺序已调整':'Site vertex order updated',
    [TX_POLYMIN]:'A polygon site needs at least 3 vertices',
    '（米）后随底图真实比例缩放':' (m) to scale with the base map',
    '杆长':'bar length', '直径':'diameter',
    '尺寸过小':'is too small', '折线节点不足':'has too few polyline nodes', '存在自相交':'self-intersects',
    '物理尺寸':'physical size', '超过场地长边':'exceeds the site long edge', '超出场地范围':'is outside the site',
    '标注总长':'Total annotation length', '区域总面积':'Total area', '（含闭合边）':'(including closing edge)',
    '（外接矩形）':'(bounding box)', '外接':'bounding box',
    '画布上双击边插入顶点、双击顶点删除':'double-click edge to add a vertex, double-click vertex to delete',
    '移除照片':'Remove photo', '设备照片':'Device photo', '顶栏还有全局点大小':'top bar also has a global marker size',
    '占用':'Usage', 'IndexedDB 含底图':'IndexedDB incl. base maps', 'localStorage':'localStorage',
    '点':'pts', '条边':'edges', '扇区':'sector', '旋转':'rotation', '占地':'footprint',
    '图片底图：':'Image base map: ', '圆形场地：':'Circle site: ', '椭圆场地：':'Ellipse site: ',
    '扇形场地：':'Sector site: ', '多边形场地：':'Polygon site: ', '矩形场地：':'Rectangle site: ',
    '矢量场地：':'Vector site: ', '未设置':'not set',
    '（世界坐标，无需比例尺校准）':'(world coordinates, no scale calibration needed)',
    '（已校准）':'(calibrated)', '（未校准）':'(not calibrated)',
    '方形区域':'Square area', '主码流':'Main stream', '子码流':'Sub stream',
    [TX_NODETIP]:'Drag ⠿ or use ↑↓ to reorder; double-click a segment to insert a node, double-click a node to delete',
    '可在画布上拖节点手柄调整位置':'Drag node handles on canvas to adjust positions',
    '测距链':'Measure chain', '闭合区域':'Closed area', '开放折线':'Open polyline',
    '上传图片底图，或改画矢量场地':'Upload an image base map or switch to a vector site',
    '仅图片底图需要：指定两点实际距离校准米/像素':'Image base maps: set a known distance between two points (m/px)',
    [TX_AFFPRE]:'Click known points and enter their real-world coordinates to correct skew and non-uniform scale',
    '该类型按「':'This type renders as “', '」渲染：填 0 为纯位置图标；填':'”: fill 0 for a position-only marker; fill',
    '，张角 ':' with a sweep of ', '°，朝向随朝向角':'°, heading follows the heading angle',
    '图标':'Icon',
    '默认图标大小（屏幕倍率）':'Default icon size (screen multiplier)',
    /* 工具提示 */
    [TX_SELTITLE]:
      'Select: click objects or drag a box; drawing/dragging snaps to endpoints, midpoints and centers (toggle in Settings)',
    '点设备：单击放置（自动捕捉特征点，设置可关）':'Point: click to place (auto-snaps; toggle in Settings)',
    [TX_RECT]:
      'Area: choose a shape and drag; Shift = square/circle or 45° sector snap; Esc cancels',
    [TX_POLY]:
      'Polyline: click points, double-click to finish; Shift ortho; right-click/Esc cancels (enable Closed for polygons)',
    [TX_ARCTITLE]:
      'Circle/Arc: click the center, then the radius point (circle) or start/end points (arc); Esc cancels',
    [TX_DIMTITLE]:
      'Dimension: click points, double-click to finish (right-click/Esc cancels); other types follow on-screen prompts',
    '图片变换': 'Image transform',
    [TX_CALIB]:
      'Scale: click two known points; drag/Delete adjust, Ctrl+Z undo, Enter/✓ apply',
    [TX_AFF]:
      'Affine: click known points, enter real X,Y (2 = similarity, 3+ = full); drag/Delete/Ctrl+Z; Enter/✓ solves; Esc cancels.',
    '参考线': 'Guides',
    '鼠标：':'Cursor: ',
    /* 快捷键帮助 */
    '撤销 / 重做':'Undo / Redo', '删除选中对象':'Delete selected objects',
    '原地复制选中对象':'Duplicate selection in place', '复制 / 剪切 / 粘贴对象（偏移 1m）':'Copy / cut / paste objects (offset 1 m)',
    '取消绘制 / 清除选择（右键取消逐点录入；空闲时平移）':
      'Cancel drawing/clear (right-click cancels picking; pans when idle)',
    '完成测距/折线/面积（双击不重复落点）':
      'Finish measure/polyline/area (double-click adds no duplicate)',
    '删除上一个录入节点':'Remove the last entered node',
    '在折线上插入节点 / 删除节点':'Insert/delete a node on the polyline',
    '双击线段 / 节点（选择工具）':'Double-click segment/node (Select tool)',
    '水平/垂直约束':'Horizontal/vertical constraint',
    '水平/垂直约束（F8 锁定，Shift 临时）':'Horizontal/vertical constraint (F8 locks, Shift temporary)',
    '正方形 / 正圆 / 45°方位吸附':'Square / circle / 45° bearing snap',
    '自动吸附端点□ 中点△ 圆心◎ 象限◇ 垂足⊥ 交点× 切点；画线时橙色虚线=45°极轴/平行追踪':
      'Snap endpoint □ midpoint △ center ◎ quadrant ◇ perpendicular ⊥ intersection × tangent; dashed = polar/parallel',
    [TX_SNAPC]:
      'Tab cycles snap types when canvas focused; click bottom badge for Auto',
    '在顶栏/工具栏/侧栏循环焦点（Tab 用于捕捉）':
      'Cycle focus: top bar/tool rail/sidebar tabs (Tab snaps)',
    '网格显隐 / 网格吸附':'Grid show / grid snap',
    '网格吸附':'Grid snap',
    '临时平移画布':'Temporary canvas pan', '移动选中对象（Shift ×10）':'Move objects (Shift ×10)',
    '适应窗口（显示整张场地）':'Fit view (whole site)', '缩放 / 平移画布 / 键盘缩放':'Zoom / pan / keyboard zoom',
    '单指绘制移动；双指缩放/平移':'One finger draws/moves; pinch zooms, two-finger pans',
    '导入 JSON / DXF / 表格 / 图片':'Import JSON/DXF/tables/images',
    [TX_QUICK]:
      'Quick start: base map/site + calibrate → pick a tool, click points; double-click/Enter finish → round handle rotate, square scale → edit in List → export.',
    '显示本帮助':'Show this help', '知道了':'Got it',
    /* D-03 帮助中心：页签 / 概念词典 / 导出检查清单 */
    '帮助中心':'Help center', '快捷键':'Keyboard shortcuts', '概念词典':'Glossary', '导出检查清单':'Export checklist',
    '矢量场地':'Vector site', '比例尺':'Scale', '仿射':'Affine', '覆盖率口径':'Coverage definition',
    [TX_GLOSSIMG]:
      'Raster image (PNG/JPG/WebP); calibrate px→metres; image objects only.',
    [TX_GLOSSSITE]:
      'Metre-based rect/circle/ellipse/sector/polygon; no calibration.',
    [TX_FLOORGLOSS]:
      'Floors keep their own base map/site/objects; layers, types, archives shared.',
    [TX_GLOSSSCALE]:
      'Two points and their real distance solve pixel-to-metre scale and rotation; image maps only.',
    [TX_AFFHINT]:
      'Real X,Y solve image-to-world; 2 points = similarity, 3+ = full affine.',
    [TX_GLOSSCOV]:
      'FOV and mounting height projected; counts visible devices and blind spots.',
    'JSON 工程':'JSON project', 'PNG 高清图':'HD PNG', 'SVG 矢量图':'SVG vector',
    'PDF（图纸位图+清单）':'PDF (raster drawing + list)', 'DXF（CAD 互通）':'DXF (CAD)',
    'CSV 表格':'CSV table', 'TSV 表格':'TSV table', 'Excel (.xlsx)':'Excel (.xlsx)',
    '全部楼层、底图与照片，可回导。':
      'All floors, base maps, photos; re-importable.',
    '当前楼层位图快照，放大不保真。':
      'Current-floor raster snapshot; not lossless when zoomed.',
    '当前楼层矢量图，底图嵌入，可无损缩放。':
      'Vector drawing with embedded raster base; scales losslessly.',
    '图纸页为位图页；清单独立分页。':
      'Drawing page bitmap; list pages separate.',
    '场地为独立 SITE 图层；毫米坐标可在 CAD 编辑。':
      'Site on SITE layer; mm coords stay editable.',
    'DXF（保真：椭圆+圆弧）':'DXF (fidelity: ellipse + arc)',
    [TX_ARC]:
      'Open projects with arcs in this version or newer; older builds discard arcs and one save loses them.',
    '全楼层台账；= + - @ 开头加单引号防公式注入。':
      'All-floor ledger; leading apostrophe guards = + - @ formulas.',
    '同 CSV，制表符分隔；同一公式防护。':
      'Tab-separated CSV; same formula guard.',
    '全楼层台账；单元格按文本写入，无公式。':
      'All-floor ledger; cells are text, no formula nodes.',
    /* 工程库 / 楼层 / 底图 / 导入预览 / 覆盖率 */
    '切换':'Switch', '重命名':'Rename', '打开':'Open', '关闭':'Close', '层':'floors', '对象':'objects', '个':'',
    '楼层 / 多底图':'Floors / Base maps', '当前楼层：':'Current floor: ',
    '新增楼层（空白场地）':'Add floor (blank site)',
    '楼层名称':'Floor name',
    '重命名楼层':'Rename floor',
    '楼层已删除':'Floor deleted',
    '当前楼层':'Current floor', '当前打开':'Currently open',
    '楼层':'Floor', '楼层汇总':'Floor summary', '全楼合计':'All floors', '总长':'Total length',
    '点击切换到该楼层':'Click to switch to this floor',
    '点击楼层行可切换；汇总覆盖全部楼层。':'Click a floor row to switch; totals cover all floors.',
    '工程库（保存在本机浏览器）':'Project library (stored in this browser)',
    [TX_LIBEMPTY]:
      'The library is empty. Save the current drawing to it first, then switch projects anytime.',
    '当前工程':'Current project', '当前草稿：':'Current draft: ', '已绑定工程库':'linked to the library',
    '把当前图纸另存到工程库':'Save current drawing to library', '合并他人工程…':'Merge another project…',
    [TX_AUTOSAVE]:
      'Auto-save: once linked, every change syncs to the library; deleting a project keeps exported JSON files.',
    '另存到工程库':'Save to library', '未命名图纸工程':'Untitled drawing project', '已存入工程库':'Saved to the library',
    '冲突':'conflicts',
    '新增':'added', '更新':'updated', '新增楼层':'floors added',
    '重命名工程':'Rename project', '已重命名':'Renamed',
    '已复制一份到工程库':'Copied to the library',
    '工程已删除':'Project deleted',
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
    '平行四边形场地':'Parallelogram site', '底边, 高, 倾角（米/度，用逗号分隔），例如 120,80,30':'base, height, skew (m/deg, comma-separated), e.g. 120,80,30',
    '请输入底边与高（均为正数），如 120,80,30':'Enter base and height (both positive), e.g. 120,80,30',
    '椭圆场地':'Ellipse site', '长轴半径, 短轴半径（米，用逗号分隔），例如 40,25':'major radius, minor radius (m, comma-separated), e.g. 40,25',
    '请输入两个正数半径，如 40,25':'Enter two positive radii, e.g. 40,25',
    '矩形场地':'Rectangle site', '长 × 宽（米，用逗号或 x 分隔），例如 120,80':'length × width (m, comma or x separated), e.g. 120,80',
    '请输入两个正数，如 120,80':'Enter two positive numbers, e.g. 120,80',
    '圆形场地':'Circle site', '半径（米）':'Radius (m)', '请输入正数半径':'Enter a positive radius',
    '全部行均可导入。':'All rows can be imported.',
    '项更新、':'updates, ', '项新增。':'new objects.',
    [TX_TAUTO]:
      'Length/area/node count are computed from geometry; imported mismatches only warn; geometry wins.',
    '建议导入前先导出 JSON 备份。':'Export a JSON backup before importing.',
    '取消':'Cancel', '合并导入':'Merge import',
    '参与统计的点设备：':'Cameras counted: ', '（含物理尺寸的圆/球机、扇形/摄像头、方形覆盖）':' (physical circles/dome cameras, sector/cameras, square coverage)',
    '仅标识位置的图标点':'position-only markers', '个未计入':'not counted',
    '区域/闭合折线：':'Areas/closed polylines: ', '合计覆盖':'total coverage ',
    '覆盖面积':'Covered area', '盲区':'Blind area', '总面积':'Total area', '覆盖':'Coverage ',
    '已覆盖':'Covered', '栅格法估算，覆盖率＝区域内被任一视场覆盖的采样格占比':
      'Grid estimate; coverage = sampled cells covered by any FOV in the area',
    '统计口径 v3':'Coverage spec v3', '固定目标':'fixed target', '格，按可见区域面积分配（实际':'cells allocated by visible area (actual', '格），格边':'cells), cell edge',
    [TX_STATS]:
      'Independent of zoom/pixels/DPR; areas are analytic, shared with reports. Legacy v1/v2 reports are not comparable.',
    [TX_LENS]:
      'Lens: fov 90° (10–360°); range from phys(m): sector=phys, circle/square=phys/2; no phys or hidden excluded.',
    [TX_NOAREA]:'No areas to analyze: draw an Area or a closed Polyline first.',
    '视场覆盖率分析':'Field-of-view coverage', '布点优化…':'Placement optimization…', '导出盲区 GeoJSON':'Export blind spots GeoJSON',
    '清除叠加层':'Clear overlay', '布点优化':'Placement optimization',
    [TX_FOVHINT]:'FOV radius (m), sweep (°), target coverage (%), max new cameras (e.g. 120,90,90,5)',
    '没有可用于布点的区域：请先绘制区域或闭合折线':'No areas for placement: draw an area or closed polyline first',
    '当前覆盖':'Current coverage', '预计':'estimated', '目标':'target', '已达标':'target reached', '仍未达标':'target not reached',
    '视场半径':'FOV radius', '张角':'sweep', '仅在「区域/闭合折线」内统计；建议点位可位于场地边界外（立杆/壁挂）':
      'Counted only in areas/closed polylines; suggested positions may fall outside the site (pole/wall mount)',
    '建议位置 X, Y (m)':'Suggested X, Y (m)', '朝向':'Heading', '新增覆盖':'New coverage', '累计覆盖':'Cumulative coverage',
    '当前已达标，无需新增点位。':'Target already reached; no new cameras needed.',
    '布点优化（贪心覆盖最大化）':'Placement optimization (greedy coverage)',
    [TX_NEWWARN]:
      'New project clears the current one; the auto-saved draft will be overwritten. Export JSON or save to library first?',
    '已清空当前楼层':'Current floor cleared',
    '添加文字':'Add text', '文字内容':'Text content', '标注文字':'Annotation text', '已添加文字':'Text added',
    '扇形场地角度':'Sector site angles', '起始角, 张角（度，用逗号分隔），例如 0,90':'start angle, sweep (deg, comma-separated), e.g. 0,90',
    '张角需在 0–360° 之间':'Sweep must be between 0 and 360°', '两点之间的实际距离（米）':'Real distance between the two points (m)',
    '比例尺已校准':'Scale calibrated',
    '坐标无效，请输入 X,Y':'Invalid coordinates; enter X,Y',
    '确定删除选中的':'Delete the selected', '个对象吗？':'objects?',
    '已记录 1 个点，继续点击下一已知点':'Recorded 1 point; click the next known point',
    /* 常用操作反馈（toast 自动按整句匹配翻译） */
    '已撤销':'Undone', '已重做':'Redone', '已删除对象':'Objects deleted', '已复制对象':'Objects duplicated',
    '剪切':'Cut', '已剪切 {n} 个对象':'Cut {n} objects',
    '选择同类 / 反向选择':'Select similar / invert',
    '已选择 {n} 个同类对象':'Selected {n} similar objects',
    '已反向选择 {n} 个对象':'Inverted: {n} objects selected',
    '隐藏选中 / 显示全部':'Hide selection / show all',
    '已隐藏 {n} 个对象':'Hid {n} objects', '已显示 {n} 个对象':'Restored {n} objects',
    '没有隐藏的对象':'No hidden objects',
    /* 核心层默认名与快照差异字段（CORE-P2-16） */
    '默认图层':'Default layer', '未命名工程':'Untitled project', '自定义类型':'Custom type', ' 副本':' copy',
    '当前':'Current', '设为当前图层':'Set as current layer',
    '当前楼层 {n} 个对象':'{n} objects on this floor',
    '隐藏或锁定的图层不能设为当前':'Hidden or locked layers cannot be current',
    '默认图层不可删除（可重命名）':'The default layer cannot be deleted (rename it)',
    '图层名称为空或与现有图层重复':'Layer name is empty or duplicated',
    '选择该图层的对象':'Select objects on this layer',
    '已选择图层「{layer}」的 {n} 个对象':'Selected {n} objects on layer "{layer}"',
    '对象类别':'Object kind', '可见':'Visible', '宽':'Width', '高':'Height', '属性':'Properties', '样式':'Style',
    '标注':'Annotations', '图标倍率':'Icon scale', '子类型':'Subtype', '场地形状':'Site shape', '场地名称':'Site name',
    '底图':'Background image', '楼层名':'Floor name', '图层名':'Layer name', '类型定义':'Type definition',
    '是':'Yes', '否':'No', '未知':'Unknown',
    '已新增图层':'Layer added', '已删除图层':'Layer deleted', '已修改图层':'Layer updated',
    '已批量平移':'Batch moved', '已隐藏对象':'Objects hidden', '已锁定对象':'Objects locked',
    '对齐 / 分布':'Align / distribute', '左对齐':'Align left', '水平居中':'Center horizontally', '右对齐':'Align right',
    '上对齐':'Align top', '垂直居中':'Center vertically', '下对齐':'Align bottom',
    '水平分布':'Distribute horizontally', '垂直分布':'Distribute vertically',
    [TX_ALIGNTIP]:
      'Aligns by object bounding boxes; distribution keeps the first/last objects fixed and spaces the rest evenly.',
    '至少选择两个对象':'Select at least two objects', '至少选择三个对象':'Select at least three objects',
    '编号 / 层级':'Numbering / z-order', '编号前缀':'Number prefix', '起始序号':'Start number', '步长':'Step',
    '批量编号':'Renumber selected', '置顶':'Bring to front', '置底':'Send to back',
    '编号跨楼层自动避让；置顶/置底改变叠放顺序。':
      'Numbering avoids cross-floor duplicates; front/back restacks.',
    '已置顶':'Brought to front', '已置底':'Sent to back',
    '至少保留一个图层':'Keep at least one layer',
    [TX_LOCKED]:'Selected objects are on a locked layer',
    '没有可删除的选中对象（可能位于锁定图层）':'No deletable selection (it may be on a locked layer)',
    [TX_NOEDIT]:'No editable selection', '没有可移动的选中对象':'No movable selection',
    '已新建工程':'New project created', '工程已导入':'Project imported', '设置已保存':'Settings saved',
    '已插入节点':'Node inserted', '已删除节点':'Node deleted',
    [TX_RSMALL]:'Radius too small (<0.5 m); enter it in the Base/Site dialog',
    '多边形场地至少需要 3 个顶点':'A polygon site needs at least 3 vertices',
    '仿射校准仅适用于图片底图':'Affine calibration applies to image base maps only',
    '请先导入图片底图':'Import an image base map first', '已完成仿射校准':'Affine calibration complete',
    '重命名图层':'Rename layer', '重命名类型':'Rename type', '实地':'real extent',
    '已添加区域':'Area added', '已添加平行四边形区域':'Parallelogram area added', '已添加圆形区域':'Circle area added',
    '已添加椭圆区域':'Ellipse area added', '已添加扇形区域':'Sector area added', '已添加闭合区域':'Closed area added',
    '已添加折线':'Polyline added', '已添加线段':'Segment added', '已添加箭头':'Arrow added', '已添加圆':'Circle added', '已添加圆弧':'Arc added', '半径过小':'Radius too small', '已添加测距':'Measure added', '已添加尺寸标注':'Dimension added',
    '已添加样条曲线':'Spline added', '已添加三点圆弧':'3-point arc added', '三点共线，无法生成圆弧':'Collinear points cannot form an arc',
    '三点圆弧：依次点击起点、经过点、终点；Esc 取消':'3-point arc: click start, through, end; Esc cancels',
    '样条曲线：逐点单击，双击/Enter 结束；Esc 取消':'Spline: click points; double-click/Enter finishes; Esc cancels',
    /* D-11：补齐 D-07/D-09 新增存档、导入预览与 UI 文案的英文条目 */
    '底图资产缺失，请重新导入底图':'Base-map asset missing; re-import the base map',
    '图片底图正在解码，请稍后重试':'Image base map is still decoding; try again shortly',
    [TX_DWG]:'PlotPin has no DWG engine and never modifies originals. Save a copy as DXF or PDF in CAD, then import:',
    '转 DXF':'Convert to DXF',
    [TX_DXFSAVE]:'In AutoCAD: File → Save As → DXF (ASCII), prefer 2013/2018;',
    '转 PDF':'Convert to PDF',
    [TX_PDFSAVE]:'In AutoCAD: Print/Export → PDF; import as vector drawing or base map;',
    [TX_DXFLOSS]:'Dynamic blocks, xrefs, proxy objects and dimension styles may be lost; check fidelity notices after import.',
    [TX_LOCALCONV]:'Conversion happens locally; PlotPin only reads DXF/PDF, and the single-file promise is unchanged.',
    '转 DXF 后选择文件':'Choose the converted DXF file',
    '转 PDF 后选择文件':'Choose the converted PDF file',
    'DXF 中暂未找到可导入实体；文件含未落地类型：':'No importable entities; this DXF has unsupported types:',
    '按文件（未声明，按米处理）':'By file (undeclared; treat as metres)',
    [TX_IMPORTFIRST]:'Check version, units and fidelity first, then choose the target; a failed import rolls back the batch.',
    '单位确认':'Unit confirmation',
    '落点':'Target',
    '可编辑对象（按原图层）':'Editable objects (keep original layers)',
    '只读参考层（新建层并锁定）':'Read-only reference layer (new layer, locked)',
    [TX_REF]:'Reference layers stay locked after import; unlock in the layer manager. DXF styles unmapped; geometry/layers win.',
    '导入':'Import',
    'DXF 中没有可导入实体':'No importable entities in this DXF',
    '提示：该 DXF 含 ':'Note: this DXF contains ',
    'DXF 导入失败（已回滚）：':'DXF import failed (rolled back): ',
    [TX_BADROWS]:'Invalid rows found; the whole import is cancelled. Fix and re-import; existing objects are untouched.',
    [TX_TABLEOPS]:'Update by ID / batch-replace via “Match…” / add rows without IDs:',
    '个对象替换（':' objects replaced (',
    '行条件）、':' row conditions), ',
    [TX_TIMP]:'Edit name, type, layer, geometry, annotation, visibility, lock, note; Replace changes props only; match/Floor narrow scope.',
    '表格导入失败（已回滚）：':'Table import failed (rolled back): ',
    '该型号在多厂商重名，请填写厂商后计价':'Model duplicated across vendors; fill vendor before pricing.',
    '定位失败：无法切换到目标楼层':'Locate failed: cannot switch to the target floor',
    '定位失败：对象已不存在':'Locate failed: object no longer exists',
    '检查完成：未发现违规':'Check complete: no violations found',
    '版本快照与对比':'Version snapshots & comparison',
    '生成版本快照':'Create version snapshot',
    '版本备注（可留空）':'Version note (optional)',
    '快照已删除':'Snapshot deleted',
    '请先打开该工程再回滚':'Open the project before rolling back',
    '快照读取失败或已损坏':'Failed to read the snapshot or it is corrupted',
    '快照对比':'Snapshot comparison',
    '返回快照列表':'Back to snapshot list',
    '已批量修改图层':'Layer changed for selection',
    '当前工程没有自定义符号可导出':'This project has no custom symbols to export',
    'JSON 中没有可导入的符号':'No importable symbols in this JSON',
    '区域':'Area',
    '折线':'Polyline',
    '插件清单读取失败':'Failed to read the plugin manifest',
    '插件清单被拒：':'Plugin manifest rejected: ',
    '插件已加载：':'Plugin loaded: ',
    '插件已卸载：':'Plugin unloaded: ',
    '未保存':'Unsaved',
    '导出失败：':'Export failed: ', '导出失败：{msg}':'Export failed: {msg}',
    '已清理未引用资产，正在重试保存':'Unused assets cleared; retrying save',
    '顶点':'Vertex',
    '其他':'Other',
    '移动':'Move',
    '方向键':'Arrow keys',
    '非对象':'not an object',
    '换楼层':'Changed floor',
    '新图层':'New layer',
    '已卸载':'Unloaded',
    '单价非法':'Invalid unit price',
    '对象捕捉':'Object snap',
    '类型变更':'Type changed',
    '扇形场地':'Sector site',
    '属性修改':'Property changed',
    '自动快照':'Auto snapshot',
    '场地多边形':'Site polygon',
    '多边形场地':'Polygon site',
    '厂商/型号缺':'Vendor/model missing',
    '厂商型号重复':'Duplicate vendor/model',
    'SVG 图元':'SVG symbol',
    '空格 + 拖拽':'Space + drag',
    '目录根对象非法':'Invalid catalog root object',
    '拖拽文件到画布':'Drag files onto canvas',
    '触屏单指 / 双指':'Touch: one / two fingers',
    '滚轮 / 右键拖拽 / + / -':'Wheel / right-drag / + / -',
    'items 须非空':'items must not be empty',
    '-产品目录.json':'-catalog.json',
    '双击 / Enter':'Double-click / Enter',
    'schema 须为 ':'schema must be ',
    'params 须为对象':'params must be an object',
    '型号数超过上限 2000':'Model count exceeds limit 2000',
    'Esc / 右键（绘制中）':'Esc / right-click (drawing)',
    'Backspace（绘制中）':'Backspace (drawing)',
    '双击线段 / 双击节点（选择工具）':'Double-click segment / node (select tool)',
    '校准点退化（共线/重合），无法求解':'Calibration points degenerate (collinear/coincident)',
    'Shift / F8（正交）':'Shift / F8 (ortho)',
    'Shift（拖矩形/椭圆/扇形时）':'Shift (while dragging rectangle/ellipse/sector)',
    '已批量显示标注':'Labels shown for selection',
    '已批量隐藏标注':'Labels hidden for selection',
    '已更新图上标注':'On-plan labels updated',
    [TX_PICKFIRST]:'Select objects first',
    '选中对象标注状态未变化':'Selected objects already have the requested label state',
    '没有可修改标注的选中对象':'No selected objects with editable labels',
    /* V-5 图纸修订参照版（仅本会话运行时，不持久化） */
    '参照版':'Reference',
    '选择 JSON…':'Choose JSON…',
    '清除参照版':'Clear reference',
    '闪烁':'Blink',
    '标定不一致':'calibration mismatch',
    '画布不一致':'canvas mismatch',
    '参照版为空':'reference is empty',
    '不是工程 JSON':'not a project JSON',
    /* M1 多页 PDF 导入 */
    'PDF 导入预检':'PDF import pre-check',
    '有内嵌图':'Has embedded image',
    '尺寸':'Size',
    '图形':'Shapes',
    '内嵌图':'Embedded image',
    '仅第 1 页（默认，与旧版一致）':'Page 1 only (default, same as before)',
    '指定页范围':'Specify page range',
    '请输入页范围':'Enter a page range',
    '页范围过长（最多 200 字符）':'Page range is too long (max 200 characters)',
    '页范围格式如 1-3,5':'Page range format e.g. 1-3,5',
    '没有有效页码':'No valid page number',
    '所选页没有可导入的图形':'The selected pages contain no importable shapes',
    [TX_SDRAG]:'Drag handles to adjust the site, or enter exact coordinates (m, negative allowed); site and image base can coexist.'
  };

  /* 插值模板：中文整句（含 {占位}）→ 英文整句。调用方只传数据，不再拼接句子；
     中文模式原样填充占位，保证中文语义与改造前一致。 */
  const TEMPLATES = {
    '已粘贴 {n} 个对象': 'Pasted {n} objects',
    '评论上限 {max} 条': 'Comment limit {max}',
    '已复制 {n} 个对象到剪贴板': 'Copied {n} objects to clipboard',
    '至少保留 {n} 个节点': 'Keep at least {n} nodes',
    '捕捉已锁定：{label}（Tab 切换，循环回自动）': 'Snap locked: {label} (Tab to cycle back to Auto)',
    '已导入 SVG 图元：{name}': 'SVG symbol imported: {name}',
    'SVG 导入失败：{msg}': 'SVG import failed: {msg}',
    '表格读取失败：{msg}': 'Table read failed: {msg}',
    'XLSX 解析失败：{msg}': 'XLSX parse failed: {msg}',
    'DXF 解析失败：{msg}': 'DXF parse failed: {msg}',
    'DXF 读取失败：{msg}': 'DXF read failed: {msg}',
    'DXF 导入失败：{msg}': 'DXF import failed: {msg}',
    'PDF 导入失败：{msg}': 'PDF import failed: {msg}',
    'PDF 导入失败（已回滚）：{msg}': 'PDF import failed (rolled back): {msg}',
    '目录已导入：{n} 个型号': 'Catalog imported: {n} models',
    '目录导入失败：{msg}': 'Catalog import failed: {msg}',
    '检测到厂商目录列（厂商/型号/单价），导入为设备目录？取消则按对象表格导入。':'Vendor columns (vendor/model/price). Import as catalog? Cancel = table.',
    '工程导入失败：{msg}': 'Project import failed: {msg}',
    '工程导入失败（已回滚）：{msg}': 'Project import failed (rolled back): {msg}',
    '导入失败：{msg}': 'Import failed: {msg}',
    '顶点数已达上限 {n}': 'Vertex limit reached: {n}',
    '对象数量已达上限（{max}），请先删除部分对象':'Object limit reached ({max}); delete some objects first',
    '已交付':'Delivered',
    '没有已交付对象：请先标记交付，或在设置中关闭「仅导出已交付」':'No delivered objects: mark some or disable "Export delivered only".',
    '表格导入失败：{msg}': 'Table import failed: {msg}',
    '表格导入失败：存在非法行，已整批取消': 'Table import failed: invalid rows; batch cancelled',
    'PDF 解析失败：{msg}': 'PDF parse failed: {msg}',
    '底图读取失败：{msg}': 'Base map read failed: {msg}',
    '照片保存失败：{msg}': 'Photo save failed: {msg}',
    [TX_DXFIMP]:
      'DXF imported: {line} lines / {rect} circles / {point} points / {text} texts{extra}',
    '保留圆弧（ARC {n} 条）：写入圆弧对象；旧版 PlotPin 打开该工程会丢弃这些圆弧':
      'Keep arcs ({n} ARC) as objects; older versions drop them',
    [TX_ARCIMP]:
      'Unchecked: import as 24-segment polylines (as before). Arcs are stroke-only, excluded from area/coverage.',
    'PDF 已导入：{line} 线 / {area} 区域 / {text} 文字{notes}':
      'PDF: {line} lines / {area} areas / {text} texts{notes}',
    '表格导入完成：更新 {updated} 项，替换 {replaced} 个对象，新增 {created} 项':
      'Table import: {updated} updated, {replaced} replaced, {created} created',
    '已导出 {n} 张设备二维码标签（可打印）': 'Exported {n} device QR labels (printable)',
    '盲区多边形已导出：{n} 个面（合计 {area} ㎡，口径 v{version}）':
      'Blind spots: {n} features ({area} m² total, spec v{version})',
    'PDF 已导出：图纸 1 页 + 清单 {n} 页': 'PDF exported: 1 drawing page + {n} list pages',
    '多楼层 PDF 已导出：{floors} 层 / {pages} 页': 'Multi-floor PDF exported: {floors} floors / {pages} pages',
    'PDF 生成失败：{msg}': 'PDF generation failed: {msg}',
    [TX_UNSUP]:
      'Unsupported file type: .{ext} (JSON project / DXF / PDF / CSV·TSV·XLSX tables / base-map images)',
    /* 「前缀：+ 动态值」家族：模板化后不再拼句子，英文整句可命中字典 */
    '发送失败：{msg}': 'Send failed: {msg}',
    '已连接对端：{name}': 'Peer connected: {name}',
    '同步失败：{msg}': 'Sync failed: {msg}',
    '启用本机同步失败：{msg}': 'Failed to enable local sync: {msg}',
    '连接异常：{detail}': 'Connection error: {detail}',
    '生成邀请失败：{msg}': 'Failed to create invite: {msg}',
    '邀请串无效：{msg}': 'Invalid invite string: {msg}',
    '应用信令失败：{msg}': 'Failed to apply signal: {msg}',
    '二维码生成失败：{msg}': 'QR code generation failed: {msg}',
    '读取快照失败：{msg}': 'Failed to read snapshots: {msg}',
    '楼层操作失败：{msg}': 'Floor operation failed: {msg}',
    '合并失败：{msg}': 'Merge failed: {msg}',
    '操作失败：{msg}': 'Operation failed: {msg}',
    '文件超限：{detail}': 'File too large: {detail}',
    '报告生成失败：{msg}': 'Report generation failed: {msg}',
    '已切换到楼层：{name}': 'Switched to floor: {name}',
    '已新增楼层：{name}': 'Floor added: {name}',
    '已打开工程：{name}': 'Project opened: {name}',
    '已设置为{name}': 'Set to {name}',
    'DWG 文件兼容入口：{name}': 'DWG compatibility entry: {name}',
    'DXF 导入预检：{name}': 'DXF import pre-check: {name}',
    '按文件单位：{unit}（$INSUNITS={code}）': 'By file unit: {unit} ($INSUNITS={code})',
    '按{unit}': 'By {unit}',
    '无法导入（整批未生效）：{name}': 'Import failed (nothing applied): {name}',
    '无法导入：{name}': 'Cannot import: {name}',
    '表格导入预览：{name}': 'Table import preview: {name}',
    '应用建议（新增 {n} 台）': 'Apply suggestions (add {n})',
    '已按建议新增 {n} 台摄像头': 'Added {n} camera(s) as suggested',
    '确定删除楼层「{name}」及其全部对象？此操作可撤销。':
      'Delete floor "{name}" and all its objects? Undo is available.',
    '确定删除工程「{name}」？此操作不可撤销（不影响已导出的文件）。':
      'Delete project "{name}"? Irreversible; exports unaffected.',
    [TX_CLR]:
      'Clear this floor\'s base map, site, {n} objects/labels & calibration/affine data; Ctrl+Z undoes it.',
    '其余提示略 {n}': 'Remaining warnings omitted: {n}',
    '其余错误略 {n}': 'Remaining errors omitted: {n}',
    ' · 第 {n} / {total} 页': ' · Page {n} / {total}',
    '共 {n} 个对象 · 第 {page} / {total} 页 · {time}': 'Objects: {n} · Page {page} / {total} · {time}',
    '楼层元数据覆盖 {n}': 'Floor metadata overrides: {n}',
    '冲突 {n}': 'Conflicts: {n}',
    '已同步：{detail}': 'Synced: {detail}',
    '已同步：{detail} · 可按 Ctrl+Z 回滚': 'Synced: {detail} · Ctrl+Z to roll back',
    [TX_MERGE]:
      'Merged: {added} added · {updated} updated · {deleted} deleted · {floorsAdded} floors added{extra}{conflict}',
    '；冲突 {n} 项按较新版本保留': '; {n} conflicts kept by the newer version',
    '配置未采纳 {n} 项（本地优先）': '{n} config changes not applied (local wins)',
    '配置已补缺 {n} 项': '{n} config items filled from peer',
    '配置差异检查失败：{msg}': 'Config diff check failed: {msg}',
    '已对齐 {n} 个对象': 'Aligned {n} objects',
    '已分布 {n} 个对象': 'Distributed {n} objects',
    '已重新编号 {n} 个对象': 'Renumbered {n} objects',
    '生成快照失败：{msg}': 'Snapshot creation failed: {msg}',
    '快照操作失败：{msg}': 'Snapshot operation failed: {msg}',
    '删除快照「{name}」？只删除该版本记录，不影响当前工程与其它快照。':
      'Delete snapshot "{name}"? Only this record; project & others stay.',
    '快照已生成：{n} 个对象 · {size} · {ms}ms': 'Snapshot created: {n} objects · {size} · {ms}ms',
    [TX_SNAP]:
      'Roll back to snapshot "{name}"? Unsaved changes go to undo (Ctrl+Z); rollback saves immediately.',
    '已回滚到快照：{time}': 'Rolled back to snapshot: {time}',
    '仿射校准 · 第 {n} 点': 'Affine calibration · point {n}',
    '该点的实地坐标 X,Y（米，逗号分隔）。已记录图上像素 ({x}, {y})':
      'Site X,Y (metres, comma-separated). Pixel recorded: ({x}, {y})',
    '已记录 {n} 个点，Enter/✓ 求解': 'Recorded {n} points; Enter/✓ to solve',
    '比例尺校准需要 2 个控制点（当前 {n} 个）': 'Scale calibration needs 2 control points (currently {n})',
    '删除失败：{msg}': 'Delete failed: {msg}',
    '报价导出失败：{msg}': 'Quote export failed: {msg}',
    '报价表已导出；{n} 个型号跨厂商重名未计价（请填厂商）':
      'Quote exported; {n} duplicate-name models unpriced (fill vendor)',
    '鼠标：{x}, {y} {unit}{osnap}': 'Cursor: {x}, {y} {unit}{osnap}',
    '◈ 捕捉：{label} ✕': '◈ Snap: {label} ✕',
    '新增于 {floor}': 'Added on {floor}',
    '删除于 {floor}': 'Removed from {floor}',
    '楼层：{a} → {b}': 'Floor: {a} → {b}',
    '图片底图：{file}；{site}': 'Image base: {file}; {site}',
    '底图 {w}×{h}': 'Base image {w}×{h}',
    '比例尺 {n}/2：点击第 {k} 个已知点': 'Scale {n}/2: click known point {k}',
    '比例尺 2/2：拖动调整控制点，Enter/✓ 应用': 'Scale 2/2: drag control points, then Enter/✓ to apply',
    '仿射 ≥3：已记录 {n} 点，Enter/✓ 求解（≥3 点为完整仿射）': 'Affine ≥3: {n} points recorded, Enter/✓ to solve',
    '仿射 2/2：再记录 1 点即完整仿射；当前 2 点可按相似求解': 'Affine 2/2: 1 more point for full affine; 2 points = similarity',
    '仿射 {n}/2：点击第 {k} 个已知点并输入实地坐标': 'Affine {n}/2: click known point {k} & enter its ground coords',
    '另一标签页正在编辑（最后心跳 {time}）': 'Another tab is editing this project (last heartbeat {time})',
    '本次导出含 {n} 个符号图元，已按 {m} 条 LWPOLYLINE 折线近似（曲线/圆弧离散）。': 'Export: {n} symbols, ~{m} LWPOLYLINE segments (curves/arcs discretised).',
    '上限 {n} 个 / {mb} MB，超出自动淘汰最旧': 'Limit {n} items / {mb} MB; oldest are evicted automatically',
    '已选择符号「{name}」，点击画布放置': 'Symbol “{name}” selected; click the canvas to place',
    '共 {n} 个符号（六类内置 + 自有导入）': '{n} symbols (six built-in categories + imported)',
    '已导出 {n} 个自定义符号（仅当前工程）': 'Exported {n} custom symbols (this project only)',
    '已导入自定义符号：{n} 个': 'Custom symbols imported: {n}',
    '已导入 {n} 个符号（仅写入当前工程）': 'Imported {n} symbols (this project only)',
    '符号 JSON 导入失败：{msg}': 'Symbol JSON import failed: {msg}',
    /* V-5 参照版（含占位） */
    '参照版加载失败：{msg}': 'reference load failed: {msg}',
    /* 片2 协作安全默认 / 导入与图层类型的整句缺口 */
    '已跳过 {n} 个超过 5 万行的附表，仅导入可用工作表': 'Skipped {n} sheets >50,000 rows; only usable sheets imported.',
    [TX_LDEL]:
      'Layer "{layer}" is used by {count} objects on {floors} floors; they move to "{target}". Continue?',
    [TX_TDEL]:
      'Type "{type}" is used by {count} objects on {floors} floors; they will move to "{target}". Continue?',
    /* M1 多页 PDF 导入（含占位） */
    '检测到多页 PDF（共 {n} 页）。默认只导入第 1 页；选择页范围才会走多页导入。':
      'Multi-page PDF ({n} pages). Page 1 default; choose a range.',
    '页码必须在 1–{n} 内，且起始页不大于结束页':
      'Page numbers must be 1–{n}, & start must not exceed end',
    '已选 {n} 项':'{n} selected',
    '已选 {n} 页 · 图形 {e} 个 · 导入后对象 {o} / {max}':
      '{n} page(s) · {e} shapes · {o} / {max} objects after import',
    [TX_PDFMP]:
      'Pages side by side in selected order, first page at origin, {gap} m apart; each page\'s objects go to a "PDF page i" layer; base map from page 1 only.',
    '共 {total} 页，已导入第 {list} 页（横向并排，间距 {gap} m）':
      '{total} page(s); imported {list} ({gap} m apart)',
    '第 {list} 页没有可导入的图形，已跳过':
      'Page(s) {list} had no importable shapes & were skipped'
  };
  /** {name} 插值（不做 HTML 转义；写入 DOM/属性前由调用方走 esc，SVG 由导出层走 esc） */
  function fillTemplate(text, params) {
    if (!params) return text;
    return String(text).replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined ? m : String(params[k])));
  }

  /** 动态短语补充（整句精确匹配即可翻译的常用提示） */
  const MORE = {
    '请先导入图片底图':'Import a base image first',
    '重新载入':'Reload', '仍以本页为准':'Keep this tab',
    '另一标签页可能正在编辑，仍以本页为准会覆盖对方最近的修改。':'Another tab editing; this tab overwrites its changes.',
    '另一标签页正在编辑，已暂停自动保存':'Another tab is editing this project; autosave paused',
    '工程标识不一致，已按工程库记录修正':'Project ID mismatch; corrected to the project library record',
    '资产回收已跳过：{msg}，未删除任何文件':'Asset cleanup skipped: {msg}; no files were deleted',
    '已忽略旧工程同步快照':'Ignored a sync snapshot from a previous project',
    '已忽略其他工程的同步快照':'Ignored a sync snapshot from another project',
    '仅限可直连网络（同一局域网/可直连）；跨 NAT 通常不可用（未配置 TURN）':'Direct networks only (same LAN); NAT usually fails (no TURN)',
    '已连接（未绑定工程，业务消息被忽略）':'Connected (no project bound; business messages are ignored)',
    '文字 {n} 条无法解码，已跳过':'Skipped {n} text run(s) that could not be decoded',
    '已跳过 {n} 个非法绘制操作':'Skipped {n} invalid drawing operation(s)',
    '{n} 张内嵌图无法解码，已跳过':'Skipped {n} embedded image(s) that could not be decoded',
    '跳过非法实体：{n} 个（缺少坐标或必需参数）':'Skipped {n} invalid entities (missing coords/params).',
    '单位 {code} 未知，已按文件单位导入（$INSUNITS={ins}）':'Unknown unit {code}; imported with file unit ($INSUNITS={ins})',
    '当前处于救援模式，未落盘编辑将丢失。请先导出救援 JSON；确定继续？':'Rescue mode: unsaved edits will be lost. Export rescue JSON first.',
    '已恢复离线协作待发的最新改动；重连后会补发':'Restored the latest offline draft; it resends after reconnect.',
    '图纸比例':'Drawing scale', '扫描 DPI':'Scan DPI', '像素比例':'Pixel scale',
    '应用比例':'Apply scale', '1 px = {mpp} m':'1 px = {mpp} m',
    '1 px = {mpp} m（1:{s} @ {d}dpi）':'1 px = {mpp} m (1:{s} @ {d}dpi)',
    '图纸比例与 DPI 必须为正数':'Drawing scale & DPI must be positive numbers',
    '将覆盖当前标定：1 px = {old} m → {mpp} m（1:{s} @ {d}dpi）。确定应用？':'Overwrite calibration: 1 px = {old} m → {mpp} m (1:{s} @ {d}dpi)?',
    '图纸比例已应用':'Drawing scale applied',
    [TX_DSCALE]:'Drawing scale 1:{a}{more} detected (hint only; calibration unchanged)',
    '、1:{b}':', 1:{b}',
    '水平像素':'Horizontal pixels', '水平张角 (°)':'Horizontal FOV (°)', '水平张角':'Horizontal FOV',
    '未填':'Not set', '侦测':'Detect', '观察':'Observe', '识别':'Recognize', '辨认':'Identify',
    'DORI 最远判读距离':'DORI max distance',
    '按水平像素与张角估算；阈值见 IEC 62676-4（25/62.5/125/250 px/m）。':'Estimated from pixels & FOV (IEC 62676-4: 25/62.5/125/250 px/m).',
    '无法检测多标签页，编辑仍可用':'Multi-tab detection unavailable; editing still works',
    '场地按米绘制，无需校准':'The site is drawn in m; calibration is not required',
    '图片变换仅适用于图片底图':'Image transform only applies to image base maps',
    '未知的校准工具':'Unknown calibration tool',
    '已取消仿射校准':'Affine calibration cancelled',
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
    'XLSX 中没有可导入的工作表':'The XLSX has no importable worksheet',
    'DXF 中未找到支持的实体（线/多段线/圆/弧/椭圆/样条/块参照/点/文字）':'No supported DXF entities (LINE/polyline/circle/arc/block/point/text)',
    '请选择图片文件（PNG/JPG/WebP/BMP/GIF/SVG）':'Choose an image file (PNG/JPG/WebP/BMP/GIF/SVG)',
    '底图已导入':'Base map imported',
    '浏览器本地存储不可用，底图仅本次会话有效，请改用 JSON 工程保存':'Browser storage unavailable; base map lasts this session—save JSON project.',
    '当前没有可见的点设备':'No visible point devices', '请先执行「覆盖率分析」':'Run Coverage analysis first',
    '当前没有盲区可导出':'No blind spots to export', 'JSON 工程已导出（含底图与设备照片）':'JSON project exported (with base map & device photos)',
    'XLSX 已导出（可再次导入更新对象属性）':'XLSX exported (re-import to update object properties)',
    'PNG 已导出':'PNG exported', 'SVG 已导出':'SVG exported', '当前没有可导出的对象':'No objects to export',
    'DXF 已导出（坐标单位：毫米，可用 AutoCAD/LibreCAD 打开）':'DXF exported (unit: mm; open in AutoCAD/LibreCAD)',
    '已删除上一条参考线':'Last guide removed', '参考线已清除':'Guides cleared',
    '端点':'endpoint', '中点':'midpoint', '圆心':'center', '象限点':'quadrant', '垂足':'perpendicular',
    '交点':'intersection', '切点':'tangent', '自动':'Auto',
    '（Tab 切换，循环回自动）':' (Tab to cycle back to Auto)',
    '捕捉：自动（全部类型）':'Snap: Auto (all types)', '◈ 捕捉：':'◈ Snap: ', '◈ 捕捉：自动':'◈ Snap: Auto',
    '设备标签':'device labels', '设备二维码标签':'Device QR labels', '台':'units', '图纸工程':'Drawing project',
    [TX_QR]:
      'Scan for PLOTPIN:ID; search the ID to locate the device. Generated offline, no external resources.',
    '图纸标注报告':'Drawing annotation report', '生成时间：':'Generated: ', '统计摘要':'Summary',
    '统计摘要（全部楼层）':'Summary (all floors)', '正在生成多楼层报告…':'Generating multi-floor report…',
    '正在生成多楼层 PDF…':'Generating multi-floor PDF…', '报告生成失败：':'Report generation failed: ',
    '每层图纸与对象清单见后；几何检查按层列出。':'Per-floor drawings & object lists; geometry checks by floor.',
    '对象总数：':'Total objects: ', '点设备：':'Points: ', '区域：':'Areas: ', '折线：':'Polylines: ',
    '几何检查：':'Geometry check: ', '项提示':'warnings', '未发现明显问题':'No obvious issues',
    '对象清单':'Object list', '清单超过 180 行，已在打印版截断；完整数据请导出 JSON/CSV。':
      'List >180 rows truncated in print; export JSON/CSV for all data.',
    '第':'page ', '页':'', '对象类型':'Object type', '业务类型':'Business type', '参数':'Params', '长度':'Length',
    /* 停车规划 */
    '停车规划':'Parking planner', '当前场地：':'Current site: ', '可排布':'Layout ',
    '个/排':'per row', '排（双面）':'rows (double-loaded)', '条通道':'aisles',
    '车位面积':'Stall area', '含通道利用':'Utilization incl. aisles', '剩余边角':'Remaining corners',
    '车位宽度 (m)':'Stall width (m)', '车位深度 (m)':'Stall depth (m)', '通道宽度 (m)':'Aisle width (m)',
    '场地边距 (m)':'Site margin (m)', '排列方向':'Orientation', '沿场地长边':'Along long edge', '沿场地短边':'Along short edge',
    '先清除「停车场」图层已有对象':'Clear existing objects on the Parking layer first', '生成车位':'Generate stalls',
    '停车场':'Parking', '没有可生成的车位':'No stalls to generate', '已生成':'Generated', '个车位':'stalls',
    '自动排布双面垂直车位；通道两侧共用，靠背车位连续排布。':
      'Auto-layout double-loaded perpendicular stalls; aisle serves both sides; back-to-back rows contiguous.',
    '尺寸无效，请填写正数':'Invalid dimensions; enter positive numbers',
    '通道净宽不足 2.5 m，无法生成停车位':'Aisle net width below 2.5 m; cannot generate stalls',
    '通道净宽偏小（建议 5.5–6.0 m）':'Aisle net width is small (recommended 5.5–6.0 m)',
    '车位宽度偏小（建议 ≥ 2.4 m）':'Stall width is small (recommended ≥ 2.4 m)',
    '车位深度偏小（建议 ≥ 5.0 m）':'Stall depth is small (recommended ≥ 5.0 m)',
    '场地边距偏小（建议 ≥ 0.3 m）':'Site margin is small (recommended ≥ 0.3 m)',
    '当前场地不足以排下完整车位与通道':'The current site cannot fit complete stalls & aisles',
    /* 实时协作 */
    '实时协作':'Live collaboration',
    '本机标签页同步':'Local tab sync', '频道名称':'Channel name', '启用本机同步':'Enable local sync',
    '停用本机同步':'Disable local sync', '断开':'Disconnect',
    '已连接对端':'Peer connected', '对端已断开':'Peer disconnected', '心跳超时':'heartbeat timeout',
    '时间戳异常 {n} 条已置空':'{n} abnormal timestamp(s) cleared',
    '已同步':'Synced', '同步失败：':'Sync failed: ',
    '已断开':'Disconnected', '连接已断开':'Connection closed',
    '当前环境不支持 BroadcastChannel，请使用跨设备直连或工程 JSON 合并':
      'BroadcastChannel unavailable; use direct WebRTC or JSON merge',
    '当前环境不支持 WebRTC，请使用本机同步或工程 JSON 合并':
      'WebRTC unavailable; use local tab sync or JSON merge instead',
    '生成邀请（主机）':'Create invite (host)',
    '请粘贴对方信令':'Paste the peer signal first',
    '已应用应答，正在建立连接…':'Answer applied; connecting…',
    '本机已生成应答，等待主机应用':'Answer created locally; waiting for the host to apply it',
    '已复制':'Copied',
    '还没有可复制的信令':'No signal to copy yet', '复制失败，请手动选择文本':'Copy failed; select the text manually',
    '底图图片与设备照片不通过实时通道传输；完整同步请用工程库合并或 JSON 导出。':
      'Base maps/photos not live; use library merge or JSON export to sync.',
    '尚未连接':'Not connected', '协作消息过大，已跳过（请用工程库合并或 JSON 交换）':
      'Collab message too large, skipped (use library merge or JSON)',
    /* 实时协作 B-06：邀请串、连接状态、冲突回滚、消息层护栏 */
    '同一浏览器多标签页即时同步；跨设备可用 WebRTC 邀请串手动信令，无需服务器。':
      'Instant tab sync; cross-device via manual WebRTC invites, no server.',
    '邀请内容为空':'Invite content is empty', '邀请内容过大':'Invite content is too large',
    '邀请串为空':'Invite string is empty', '邀请串格式无效':'Invalid invite format',
    '邀请串类型无效':'Invalid invite type', '邀请串编码无效':'Invite string has invalid encoding',
    '不是有效的邀请串或 SDP':'Not a valid invite string or SDP',
    'SDP 缺少数据通道媒体段':'SDP is missing the data-channel media section',
    '等待对方接入':'Waiting for peer', '连接中…':'Connecting…', '已连接':'Connected',
    '连接异常':'Connection error', '连接失败':'Connection failed',
    '连接已断开，等待恢复…':'Connection lost; waiting to recover…', '连接已关闭':'Connection closed',
    '实时同步已就绪':'Live sync ready', '正在建立连接…':'Establishing connection…',
    '连接异常断开':'Connection dropped unexpectedly', '未知错误':'Unknown error',
    '正在生成邀请…':'Creating invite…',
    '邀请已生成，等待对方粘贴应答':'Invite created; waiting for the peer answer',


    '请粘贴对方的应答邀请串':'Paste the peer answer invite string',
    '请粘贴主机的邀请串':'Paste the host invite string', '正在应用邀请…':'Applying invite…',
    '应答已生成，请复制给主机':'Answer created; copy it back to the host',
    '尚无冲突记录':'No conflicts recorded', '最近一次合并：无变化':'Last merge: no changes',
    '最近一次合并':'Last merge', '无变化':'No changes',
    '已写入撤销栈，可 Ctrl+Z 回滚':'Written to undo stack; press Ctrl+Z to roll back',
    '可按 Ctrl+Z 回滚':'press Ctrl+Z to roll back', '楼层元数据覆盖':'floor metadata overwritten',
    '场地已清空':'Site cleared', '对端清空了场地':'the peer cleared the site',
    '协作覆盖':'Collaboration overwrote', '发送失败：':'Send failed: ',
    '通道拥塞，消息已跳过':'Channel congested; message skipped',
    '通道拥塞，消息已跳过（将在下次变更时重试）':'Channel congested; message skipped (retry on next change)',
    '协作消息发送失败（分块中断）':'Collaboration message send failed (chunk interrupted)',
    '协作消息解析失败':'Failed to parse collaboration message',
    '收到无法识别的工程快照':'Received an unrecognized project snapshot',
    '收到无法识别的楼层同步消息':'Received an unrecognized floor sync message',
    /* N-16：断线待发队列与自动重连 */
    '离线待发快照超过 {n} KB，未写入本地队列（仍在内存，重连后补发）':
      'Offline draft >{n} KB not queued (in memory; sent later)',
    '离线待发队列写入失败：{msg}':'Failed to write the offline pending queue: {msg}',
    '{s} 秒后自动重连（第 {n} 次）':'Reconnecting automatically in {s}s (attempt {n})',
    '跨设备连接已断开：请重新交换邀请串（WebRTC 无信令通道，无法自动重连）':
      'Cross-device lost: re-exchange invites (no signaling/reconnect).',
    /* N-17：冲突可见性与跨工程隔离 */
    '冲突 {n} 条（保留较新值）':'{n} conflict(s) (newer value kept)',
    '已保留较新值':'newer value kept',
    '已标记交付':'Marked as delivered', '已取消交付':'Delivery mark removed',
    '楼层名称「{name}」已存在，请换一个名称':'Floor name "{name}" already exists; choose another name',
    '已丢弃跨工程消息 {n} 条':'Dropped {n} cross-project message(s)',
    '已丢弃跨工程协作消息（{got} ≠ {want}）':'Dropped cross-project collaboration message ({got} ≠ {want})',
    /* S3/S4：覆盖报告、冲突账本与对象级恢复 */
    '本端被覆盖':'Overwritten locally', '本端保留（对端未采纳）':'Local kept (remote not adopted)',
    '本端被覆盖 {n}':'Overwritten {n}', '本端保留 {n}':'Local kept {n}',
    '本端被覆盖 {n} 条（可在冲突清单恢复）':'{n} overwritten locally (restore from the conflict list)',
    '本端被覆盖 {n} 条（打开协作面板查看）':'{n} overwritten locally (open the collaboration panel)',
    '同步覆盖了你的 {n} 处修改':'Sync overwrote {n} of your edits',
    '已被对端更新 {n} 处':'{n} item(s) already updated by the peer',
    '可在协作面板恢复':'restore in the collaboration panel', '可在协作面板查看':'view in the collaboration panel',
    '查看冲突清单…':'View conflict list…', '冲突清单':'Conflict list', '清除记录':'Clear records',
    '尚无可恢复的冲突记录':'No restorable conflicts recorded',
    '冲突记录已清除':'Conflict records cleared',
    '该记录没有可恢复的旧值':'This entry has no restorable old value',
    '整层删除只有记录，请用撤销（Ctrl+Z）或版本快照':'Whole-floor delete is record-only; use Undo or a snapshot',
    '请先切换到该楼层后再恢复':'Switch to that floor before restoring',
    '恢复我的版本':'Restore my version', '恢复场地':'Restore site',
    '已删除':'Deleted', '已更新':'Updated',
    '已恢复':'Restored', '已恢复场地（可 Ctrl+Z 撤销）':'Site restored (Ctrl+Z to undo)',
    '已恢复「{name}」（可 Ctrl+Z 撤销）':'Restored “{name}” (Ctrl+Z to undo)',
    '双方都改过':'both changed', '无法证明并发':'concurrency unproven',
    '本机时钟不晚于删除时间，已拒绝恢复（否则下次同步会被删除盖回）':
      'Local clock not later than deletion; restore refused (next sync deletes it).',
    [TX_REST]:
      'Restore is a new edit (Ctrl+Z); the peer may show the old version until applied; old base maps may be reclaimed.',
    '{n} 个对象':'{n} object(s)',
    '邀请串':'Invite string',
    '字节，超过内置二维码上限':'bytes, exceeding the built-in QR limit of',
    '字节：请复制邀请串文本发送，未生成无效二维码。':'bytes. Copy the invite text instead; no QR generated.',


    '跨设备邀请（WebRTC）':'Cross-device invite (WebRTC)',
    '应用邀请 / 生成应答':'Apply invite / create answer',
    '复制本机邀请串':'Copy local invite string',
    '本机邀请串（发给对方）':'Local invite string (send to peer)',
    '对方邀请串（粘贴）':'Peer invite string (paste)',
    '粘贴邀请串或原始 SDP':'Paste invite string or raw SDP', '频道':'Channel',
    /* 内置类型名称（用户自定义类型保持原名） */
    '通用标记':'Generic marker', '摄像头':'Camera', '球机':'Dome camera', '路灯':'Street light', '道闸':'Barrier gate',
    '充电桩':'Charger', '警示点':'Warning point', '自定义点':'Custom point', '普通区域':'Generic area', '车位区域':'Parking bay',
    '建筑/遮挡':'Building/obstruction', '通道':'Aisle', '围墙/边界':'Wall/boundary', '围栏':'Fence',
    '车行线':'Vehicle lane', '人行线':'Pedestrian lane', '自定义线':'Custom line', '尺寸标注':'Dimension', '圆弧':'Arc',
    /* B-07 图框 / 标题栏 */
    '图框 / 标题栏模板':'Frame / title block template',
    '启用图框、标题栏、比例尺与图例':'Enable frame, title block, scale bar & legend',
    '绘制图框边框':'Draw frame border', '绘制比例尺':'Draw scale bar',
    '绘制图例（按可见对象类型/图层）':'Draw legend (visible types / layers)',
    [TX_TB]:
      'Off by default (exports unchanged). Empty date = today; empty scale = auto 1:N.',
    '图框模板已保存':'Title block saved',
    '工程名':'Project name', '图号':'Drawing no.', '比例':'Scale', '日期':'Date', '版本':'Version',
    '设计':'Designer', '审核':'Reviewer', '单位':'Company', '图例':'Legend',
    '落点 只读参考层（已锁定）':'Imported to a read-only reference layer (locked)',
    /* 校准 / 场地 / 目录 / 报价等界面短句（B-14 补齐缺口） */
    '已取消比例尺校准':'Scale calibration cancelled',
    '已有 2 个校准点：拖动调整，Enter 应用，Delete 删除选中点':'Two control points set: drag, Enter applies, Delete removes.',
    '图片已变换':'Image transformed',
    [TX_SSMALL]:'Site too small (<0.5 m); enter dimensions in the base-map dialog',
    '比例尺校准仅适用于图片底图':'Scale calibration only applies to image base maps',
    '仿射校准至少需要 2 个对应点':'Affine calibration needs at least 2 point pairs',
    'IndexedDB 不可用：已降级为 localStorage 自动保存（容量有限，建议定期导出 JSON）':
      'IndexedDB unavailable: localStorage autosave (export JSON often)',
    '已删除楼层':'Floor deleted',
    '楼层已重命名':'Floor renamed',
    '待保存…':'Saving…', '已保存':'Saved', '已自动保存':'Auto-saved', '请手动导出':'Export manually',
    '新版本可用：刷新页面后生效':'New version available: refresh to update',
    '预缓存失败 {n} 项，已保留旧版本':'Precache failed for {n} item(s); keeping the old version',
    '底图读取失败，请重新导入底图':'Failed to read the base map; re-import it',
    '未载入目录':'No catalog loaded',
    '报价表已导出':'Quote table exported',
    '报价表已导出（沿用上次单价快照）':'Quote table exported (reused previous price snapshot)',
    '删除目录？BOM 降级为名称/数量。':'Delete the catalog? BOMs fall back to name/quantity.',
    '检测到 DWG 文件版本：':'DWG file version detected: ',
    [TX_BADJSON]:
      'Invalid JSON project (expected v1 export from PlotPin)',
    [TX_BDXF]:
      'This DXF is binary (AutoCAD Binary DXF) and cannot be parsed in the browser; save it as ASCII DXF first',
    '目录已导出':'Catalog exported',
    '目录已删除':'Catalog deleted',
    '目录数据损坏，已忽略：{msg}':'Catalog data is corrupt & was ignored: {msg}',
    '本机频道消息解析失败':'Failed to parse the local channel message',
    '无可汇总型号：先绑定型号并填数量':'Nothing to summarize: bind a model & enter quantities first',
    '标注总长：':'Total measured length: ', '区域总面积：':'Total area: ',
    '欢迎使用图钉':'Welcome to PlotPin',
    '载入图片底图，或直接使用默认矢量场地':'Import an image base map, or use the default vector site',
    '用左侧工具放置点设备、区域、折线与标注':'Place points, areas, polylines & dimensions from the toolbar',
    '导出 JSON、PNG、SVG、PDF、DXF 或表格':'Export JSON, PNG, SVG, PDF, DXF or tables',
    '打开示例工程':'Open demo project',
    '空白开始':'Start blank',
    '示例工程包含 100×70 m 场地与 6 个示例对象，可随意修改或删除':'Demo: 100×70 m site & 6 objects; edit or delete freely',
    '已打开示例工程':'Demo project opened',
    '示例工程':'Demo project',
    '示例场地':'Demo site',
    '示例文字':'Sample text',
    '已进入空白工程':'Started with a blank project',
    '示例工程生成失败':'Failed to create the demo project',
    /* D-14 */
    '枪机摄像头':'Bullet camera', '半球摄像机':'Mini dome camera', '云台摄像机':'PTZ camera',
    '红外对射':'Infrared beam', '激光对射':'Laser beam',
    '门禁读卡器':'Card reader', '密码键盘':'Keypad', '出门按钮':'Exit button', '电控锁':'Electric lock',
    '闸机':'Turnstile', '可视对讲门口机':'Video intercom',
    '烟感探测器':'Smoke detector', '温感探测器':'Heat detector', '消火栓':'Fire hydrant', '喷淋头':'Sprinkler',
    '手动报警按钮':'Manual call point', '疏散指示':'Exit sign',
    '交换机':'Network switch', '路由器':'Router', '无线 AP':'Wireless AP', '光纤配线架':'Fiber patch panel',
    '机柜':'Rack', '网络录像机':'NVR',
    '地感线圈':'Induction loop', '车位':'Parking space', '诱导屏':'Guide display', '取卡机':'Ticket machine',
    '电梯':'Elevator', '门磁':'Door sensor', '窗磁':'Window sensor', '温湿度传感器':'Temp/humidity sensor',
    '漏水检测':'Water leak detector', '人脸识别':'Face recognition',
    '视频监控':'Video surveillance', '门禁':'Access control', '消防':'Fire safety', '网络':'Network', '停车':'Parking',
    '仅位置图标':'Position marker only', '圆形覆盖':'Circle coverage', '方形区域':'Square area',
    '扇形视场':'Sector FOV', '杆/线段':'Bar/segment',
    '没有匹配的符号':'No matching symbols',
    '这是几何检查，不是消防/规范审图；不内置任何规范数值。':
      'Geometry check only; no fire-code values are built in.',
    '对象重叠，贴合容差':'Object overlap, touching tolerance',
    '最小间距（按类型填写阈值；留空=不检查该类型）':'Minimum spacing per type (blank = skip)',
    '越界，容差':'Bounds, tolerance',
    '未配置':'Not set', '暂无对象类型':'No object types', '已注册规则（{n}）':'Registered rules ({n})',
    '来源':'Source', '插件':'Plugin', '页面脚本':'Page script', '检查全部楼层':'Check all floors',
    '尚未运行检查。配置修改后请重新运行。':'No check run yet. Re-run after changes.',
    '未发现违规。':'No violations found.',
    '耗时 {ms} ms｜对象 {objects}｜候选对 {pairs} / 理论 {theoretical}':
      'Time {ms} ms | objects {objects} | pairs {pairs}/{theoretical}',
    '未执行：':'Not run: ', '点击定位':'Click to locate',
    '仅展示前 {n} 条':'Showing first {n}',
    '覆盖率已降级：格边放大 {n} 倍以控制在格数上限内':'Coverage degraded: cell ×{n} to stay within grid limit',
    '已导出前 {n} 条':'Exported first {n}',
    '共 {n} 页，已导入第 1 页':'{n} page(s); imported page 1 only',
    '未配置阈值类型 {n} 个':'Unconfigured threshold types: {n}',
    ' · {n} 条':' · {n} violations', '检查完成：{n} 条违规':'Done: {n} violations',
    '已导出 {n} 条违规':'Exported {n} violations',
    /* F12：规则名 / 违规消息 / 跳过原因 / CSV 表头（此前硬编码中文） */
    '规则':'Rule', '对象编号':'Object ID', '对象名称':'Object name', '关联对象':'Related object', '说明':'Note',
    '对象重叠':'Object overlap', '最小间距':'Minimum spacing', '越界':'Out of bounds',
    '与 {name} 实质重叠 {area} m²':'Substantially overlaps {name} by {area} m²',
    '（轮廓自相交，按包围盒估算）':'(self-intersecting outline; bounding-box estimate)',
    '与 {name} 净距 {gap} m，低于阈值 {t} m':'Clearance to {name} is {gap} m, below threshold {t} m',
    '部分越出场地边界':'Partly outside the site boundary',
    '完全越出场地边界':'Completely outside the site boundary',
    '未设置矢量场地':'No vector site set', '场地边界无效':'Invalid site boundary',
    '规则异常：{msg}':'Rule error: {msg}',
    '仅导出前 {n} 条（共 {full} 条）':'Exporting first {n} of {full}',
    /* 片2 协作安全默认 + 其余整句缺口 */
    '快照索引写入失败，列表改为按记录实时重建':'Snapshot index write failed; the list rebuilds from records',
    '已连接：对方拥有本工程完整编辑权（可覆盖、删除、清空、修改配置）':'Connected: peer has full edit rights (overwrite, delete, clear, settings).',
    [TX_PEER]:'Peer sent a project snapshot. Confirming grants full edit rights: overwrite, delete objects/floors, change settings. Apply?',
    '已拒绝应用对端快照，协作连接已断开':'Peer snapshot declined; collaboration disconnected',
    [TX_PDFE]:'No usable graphics on PDF page 1 (only page 1 is imported; scans may lack graphics or use unsupported compression)',
    [TX_PDFST]:'Browser storage unavailable; the PDF base map lasts this session only—save a JSON project instead',
    '该类型仍被对象使用，且没有可迁移的同类内置类型':'Type still used; no migratable built-in type of the same kind.',
    '评论':'Comment', '编辑评论':'Edit comment',
    '评论不能为空':'Comment required', '先选中一个对象':'Select one object',
    '评论不存在':'Comment not found', '评论保存失败':'Failed to save comment',
    '只读：可看评论，不能写':'Read-only: comments visible, writing disabled',
    '删除这条评论？':'Delete this comment?', '对象已删除':'Object deleted', '暂无评论':'No comments',
    '草稿评论将一并清除。':'Draft comments will also be cleared.',
    /* G7 台账模板 */
    '台账模板导出':'Ledger template export',
    '选择模板':'Template', '列（逗号分隔，字段名）':'Columns (comma-separated field names)',
    '导出 CSV':'Export CSV', '导出 XLSX':'Export XLSX',
    '模板列不存在：{cols}':'Template columns not found: {cols}',
    '模板没有列':'Template has no columns',
    '已导出 {n} 行（模板）':'Exported {n} row(s) with template', '台账':'Ledger',
    /* ICE 中继配置（凭据只存本机，文案一律脱敏） */
    '中继服务器（可选：跨 NAT 才需要）':'Relay servers (optional; only needed across NAT)',
    [TX_RELAY]:'Direct by default. Per line: URL | user | credential; STUN URL only; comma-separated. Credentials stay local; never in invites/collab/projects.',
    '中继配置':'Relay config', '应用配置':'Apply', '清除配置':'Clear config',
    '在本机记住（明文存于浏览器）':'Remember on this device (plain text in browser)',
    '仅本次会话':'This session only', '已记住':'Saved',
    '未配置中继：仅使用直连候选':'No relay configured: direct candidates only',
    '中继配置已应用（已记住，刷新后仍生效）':'Relay config applied (saved; persists after reload)',
    '中继配置已应用（仅本次会话，刷新后失效）':'Relay configured (this session only; cleared after reload)',
    '中继配置已清除':'Relay config cleared',
    '没有可用的服务器地址':'No usable server URL',
    '最多 {n} 个服务器':'At most {n} servers',
    '第 {n} 行：地址无效或过长（只支持 stun/stuns/turn/turns，≤{max} 字符）':'Line {n}: bad/overlong URL (stun/stuns/turn/turns only, ≤{max})',
    '第 {n} 行：TURN 必须填写用户名与凭据':'Line {n}: TURN requires both username & credential',
    '第 {n} 行：用户名或凭据过长':'Line {n}: username or credential too long',
    '地址中不要内嵌账号密码，请填到用户名/凭据列':'No credentials in URLs; use username/credential columns',
    '配置无法写入本机存储：{msg}':'Cannot write the config to local storage: {msg}',
    '用户 {u}':'user {u}',
    '{n} 个服务器（TURN {t} / STUN {s}）':'{n} server(s) (TURN {t} / STUN {s})',
    /* ICE 运行时诊断：只展示候选类型计数与配对类型 */
    '已配置中继：跨 NAT 取决于 TURN 可用性与鉴权（未验证）':'Relay: NAT crossing depends on TURN availability/auth.',
    '本机候选：{v}':'Local candidates: {v}', '对端候选：{v}':'Remote candidates: {v}',
    '尚未收集到候选（邀请串可能未包含候选）':'No candidates yet (the invite string may not include them)',
    '选中候选对：{pair}':'Selected candidate pair: {pair}'
  };
  Object.assign(PHRASES, MORE);

  let lang = 'zh';

  function t(key) {
    const d = DICT[lang] || DICT.zh;
    if (d[key] !== undefined) return d[key];
    return DICT.zh[key] !== undefined ? DICT.zh[key] : key;
  }
  /** 动态中文文案 → 当前语言；插值模板优先，其次整句短语；未收录时回退中文，保证不出现空白 */
  function p(text, params) {
    let out = text;
    if (lang === 'en') {
      if (TEMPLATES[text] !== undefined) out = TEMPLATES[text];
      else if (PHRASES[text] !== undefined) out = PHRASES[text];
    }
    return fillTemplate(out, params);
  }
  function setLang(l) {
    lang = l === 'en' ? 'en' : 'zh';
    if (typeof document !== 'undefined' && document.documentElement)
      document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    return lang;
  }
  /** 应用 data-x / data-xt / data-xp / data-xa 到 DOM（返回替换数量）。
   *  属性名是 data-i18n* 的发行版缩写：每处省 3–13 B，154 处合计约 1 KB。 */
  function apply(root) {
    if (typeof document === 'undefined') return 0;
    const r = root || document;
    let n = 0;
    r.querySelectorAll('[data-x]').forEach(el => { el.textContent = t(el.dataset.x); n++; });
    r.querySelectorAll('[data-xt]').forEach(el => { el.title = t(el.dataset.xt); n++; });
    r.querySelectorAll('[data-xp]').forEach(el => { el.placeholder = t(el.dataset.xp); n++; });
    r.querySelectorAll('[data-xa]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.xa)); n++; });
    return n;
  }

  global.I18N = { t, p, fmt: fillTemplate, setLang, apply, dict: DICT, phrases: PHRASES, templates: TEMPLATES, get lang() { return lang; } };
  global.L = p;   /* 动态模板简写：L('宽度') / L('已粘贴 {n} 个对象', {n:3}) */
})(typeof window !== 'undefined' ? window : globalThis);
