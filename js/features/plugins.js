/* plugins.js —— 插件注册点与隔离沙箱（纯 JS，无构建）
 *
 * 两条加载路径：
 *   1) 旧路径（兼容入口，受信任）：页面内 <script> 直接调用 PlotPin.register*；
 *      同源脚本天然拥有页面权限，不做沙箱，仅保留给已审查的自有插件。
 *   2) 隔离路径（推荐）：PlotPin.loadPlugin({id,apiVersion,capabilities,code})。
 *      插件代码在独立 Worker 中执行，只能通过消息传递使用白名单能力；
 *      无 DOM / window / parent / IndexedDB / 网络，单次调用 >2s 直接 terminate。
 *
 * 沙箱能力白名单（未声明一律不可用）：
 *   state:read   读取工程快照（getState / 导出器 ctx.state）
 *   state:write  新增对象（addObjects，经主工程 sanitizeObjects 清洗后提交）
 *   annotate     新增文字/尺寸标注（addAnnotation）
 *   types        注册/注销自定义对象类型
 *   icons        自定义类型允许携带 symbol 图元（否则 symbol 一律拒绝）
 *   export       注册/执行导出器
 *   import       注册/执行导入器
 */
(function (global) {
  'use strict';
  const exporters = [];
  const importers = [];
  const pluginTypes = new Map();   /* typeId -> 规范化类型 */
  const typeOwners = new Map();    /* typeId -> 沙箱插件 id（旧路径无 owner） */

  const normExt = e => String(e || '').replace(/^\./, '').toLowerCase();
  /** 实时工程状态是全局词法绑定（let state），不是 window 属性；用裸引用安全取值 */
  const appState = () => { try { return state; } catch (_) { return undefined; } };
  const cloneJSON = v => JSON.parse(JSON.stringify(v));
  const TYPE_KINDS = ['point', 'rect', 'line'];
  const TYPE_SHAPES = ['none', 'circle', 'square', 'sector', 'bar'];

  /* -------------------- 版本与能力 ---------------------------------------- */
  const PLUGIN_API_VERSION = '1.0.0';
  const PLUGIN_CALL_TIMEOUT = 2000;   /* 单次调用/初始化上限，超时直接 terminate */
  const PLUGIN_CAPABILITIES = Object.freeze({
    'state:read': '读取工程对象快照',
    'state:write': '新增对象（经主工程清洗后提交）',
    'annotate': '新增文字/尺寸标注',
    'types': '注册/注销自定义对象类型',
    'icons': '自定义类型允许携带 symbol 图元',
    'export': '注册/执行导出器',
    'import': '注册/执行导入器'
  });
  const CAP_KEYS = Object.keys(PLUGIN_CAPABILITIES);
  const API_MAJOR = 1;
  const API_MINOR = 0;

  /** 版本协商：只接受 1.x 且次版本不高于宿主；失败必须给出可读原因，绝不抛异常 */
  function checkPluginApiVersion(v) {
    const raw = String(v == null ? '' : v).trim();
    if (!raw) return { ok: false, reason: '未声明 apiVersion（本宿主兼容 1.0，示例：apiVersion: "1.0"）' };
    const m = raw.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-[0-9A-Za-z.-]+)?$/);
    if (!m) return { ok: false, reason: 'apiVersion 格式非法：' + raw + '（示例：1.0）' };
    const major = Number(m[1]);
    const minor = Number(m[2] || 0);
    if (major !== API_MAJOR) return { ok: false, reason: '插件声明 API ' + raw + '，本宿主为 ' + PLUGIN_API_VERSION + '：主版本不兼容' };
    if (minor > API_MINOR) return { ok: false, reason: '插件声明 API ' + raw + '，本宿主最高 ' + PLUGIN_API_VERSION + '：次版本高于宿主' };
    return { ok: true };
  }
  /** 能力声明校验：未知能力直接拒绝；空数组合法（等于什么都做不了） */
  function checkPluginCapabilities(v) {
    if (v === undefined) return { ok: false, reason: '未声明 capabilities（可用能力：' + CAP_KEYS.join(' / ') + '）' };
    if (!Array.isArray(v)) return { ok: false, reason: 'capabilities 需为字符串数组（可用能力：' + CAP_KEYS.join(' / ') + '）' };
    const caps = [];
    for (const item of v) {
      const c = String(item == null ? '' : item).trim();
      if (!PLUGIN_CAPABILITIES[c]) return { ok: false, reason: '未知能力：' + (c || '(空)') + '（可用能力：' + CAP_KEYS.join(' / ') + '）' };
      if (!caps.includes(c)) caps.push(c);
    }
    return { ok: true, caps };
  }
  const PLUGIN_ID_RE = /^[A-Za-z0-9_.-]{2,64}$/;
  /** 供插件/工具在加载前自检；同步、不执行任何代码 */
  function checkPlugin(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    if (s.id !== undefined && !PLUGIN_ID_RE.test(String(s.id).trim())) {
      return { ok: false, reason: '插件 id 需为 2–64 位字母、数字、点、下划线或短横线' };
    }
    const ver = checkPluginApiVersion(s.apiVersion);
    if (!ver.ok) return ver;
    const caps = checkPluginCapabilities(s.capabilities);
    if (!caps.ok) return caps;
    return { ok: true, caps: caps.caps };
  }

  /* -------------------- 注册表（旧路径与沙箱共用） ------------------------- */
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
    if (!PLUGIN_ID_RE.test(id)) throw new Error('类型 id 需为 2–64 位字母、数字、点、下划线或短横线');
    if (!TYPE_KINDS.includes(def.kind)) throw new Error('类型 kind 仅支持 point / rect / line');
    const name = String(def.name || '').trim().slice(0, 30);
    if (!name) throw new Error('类型需提供名称 name');
    const color = /^#[0-9a-fA-F]{6}$/.test(String(def.color || '')) ? String(def.color) : '#7c3aed';
    const t = {
      id, kind: def.kind, name, color,
      icon: normalizeIcon(def.icon, def.kind),
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

  /** ownerId 非空 = 沙箱插件；沙箱导出器没有本地 run，执行时回 Worker 调用 */
  function addExporter(def, ownerId) {
    const sandbox = !!ownerId;
    if (!def || !def.id) throw new Error('导出器需提供 id' + (sandbox ? '' : ' 与 run(ctx)'));
    if (!sandbox && typeof def.run !== 'function') throw new Error('导出器需提供 run(ctx)');
    const id = String(def.id).trim();
    if (!id || id.length > 64) throw new Error('导出器 id 需为 1–64 字符');
    if (exporters.some(e => e.id === id)) throw new Error('导出器 id 已存在：' + id);
    exporters.push({
      id,
      label: String(def.label || def.name || id).slice(0, 80),
      ext: normExt(def.ext).slice(0, 16),
      mime: String(def.mime || 'application/octet-stream').slice(0, 100),
      run: sandbox ? null : def.run,
      pluginId: ownerId || null,
      sandbox
    });
    syncExportOptions();
    return true;
  }
  function removeExporter(id, ownerId) {
    const i = exporters.findIndex(e => e.id === id && (!ownerId || e.pluginId === ownerId));
    if (i < 0) return false;
    exporters.splice(i, 1);
    syncExportOptions();
    return true;
  }
  function addImporter(def, ownerId) {
    const sandbox = !!ownerId;
    if (!def || !normExt(def.ext)) throw new Error('导入器需提供 ext' + (sandbox ? '' : ' 与 run(ctx)'));
    if (!sandbox && typeof def.run !== 'function') throw new Error('导入器需提供 run(ctx)');
    const ext = normExt(def.ext);
    if (ext.length > 16) throw new Error('导入器扩展名过长');
    if (importers.some(e => e.ext === ext)) throw new Error('导入器扩展名已存在：' + ext);
    importers.push({
      ext,
      label: String(def.label || ext.toUpperCase()).slice(0, 80),
      run: sandbox ? null : def.run,
      pluginId: ownerId || null,
      sandbox
    });
    return true;
  }
  function removeImporter(ext, ownerId) {
    const e = normExt(ext);
    const i = importers.findIndex(x => x.ext === e && (!ownerId || x.pluginId === ownerId));
    if (i < 0) return false;
    importers.splice(i, 1);
    return true;
  }
  function addType(def, ownerId) {
    const t = normalizeObjectType(def);
    const list = builtinTypes();
    if (pluginTypes.has(t.id) || (list && list.some(x => x && x.id === t.id))) throw new Error('类型 id 已存在：' + t.id);
    pluginTypes.set(t.id, t);
    if (ownerId) typeOwners.set(t.id, ownerId);
    if (list) list.push(t);
    installType(t);
    return true;
  }
  function removeType(id) {
    const t = pluginTypes.get(String(id));
    if (!t || typeInUse(t.id)) return false;
    pluginTypes.delete(t.id);
    typeOwners.delete(t.id);
    const list = builtinTypes();
    if (list) {
      const i = list.findIndex(x => x && x.id === t.id);
      if (i >= 0) list.splice(i, 1);
    }
    const st = appState();
    if (st && Array.isArray(st.objectTypes)) st.objectTypes = st.objectTypes.filter(x => !x || x.id !== t.id);
    refreshTypeUI();
    return true;
  }

  /* -------------------- 沙箱管理 ------------------------------------------ */
  const sandboxPlugins = new Map();   /* id -> 记录（禁用后保留以便 listPlugins 展示原因） */
  let pluginSeq = 0;
  const newPluginToken = () => 'pp' + Date.now().toString(36) + '.' + (++pluginSeq) + '.' + Math.random().toString(36).slice(2, 8);

  /** 生成 Worker 源码：bootstrap（消息协议 + 能力门 + 全局硬化）后拼接插件代码 */
  function sandboxSource(rec) {
    const T = PLUGIN_CALL_TIMEOUT;
    return [
      '(function(){',
      'var g=self,post=g.postMessage.bind(g),add=g.addEventListener.bind(g),later=g.setTimeout.bind(g);',
      'var V=', JSON.stringify(PLUGIN_API_VERSION), ',CAPS=', JSON.stringify(rec.caps),
      ',TOKEN=', JSON.stringify(rec.token), ',T=', String(T), ';',
      'var seq=0,pend={},runs={exporter:{},importer:{}},dls=[];',
      'function send(m){m.__pp=1;m.token=TOKEN;post(m);}',
      'function need(c){if(CAPS.indexOf(c)<0)throw new Error("能力未声明："+c);}',
      'function rpc(method,args){return new Promise(function(ok,no){var id=++seq;pend[id]={ok:ok,no:no};send({type:"rpc",id:id,method:method,args:args||[]});later(function(){if(pend[id]){delete pend[id];no(new Error("插件调用超时（>"+T+"ms）"));}},T);});}',
      'function toast(msg,level){send({type:"toast",message:String(msg==null?"":msg).slice(0,200),level:String(level||"")});}',
      'function dl(callId,name,data){var base={type:"download",callId:callId,name:String(name||"").slice(0,120)};var p;',
      'if(typeof data==="string"){send(Object.assign({},base,{kind:"text",text:data}));p=Promise.resolve();}',
      'else if(data&&typeof data.arrayBuffer==="function"){p=data.arrayBuffer().then(function(b){send(Object.assign({},base,{kind:"bytes",bytes:b,mime:String(data.type||"")}));});}',
      'else if(data&&typeof data.byteLength==="number"){send(Object.assign({},base,{kind:"bytes",bytes:data,mime:""}));p=Promise.resolve();}',
      'else{p=Promise.reject(new Error("download 仅支持字符串 / Blob / ArrayBuffer"));}',
      'dls.push(p);return p;}',
      'var api={apiVersion:V,capabilities:CAPS.slice(),',
      'getState:function(){need("state:read");return rpc("getState");},',
      'addObjects:function(list,msg){need("state:write");return rpc("addObjects",[list,String(msg||"")]);},',
      'addAnnotation:function(spec,msg){need("annotate");return rpc("addAnnotation",[spec,String(msg||"")]);},',
      'registerObjectType:function(def){need("types");if(def&&def.symbol&&CAPS.indexOf("icons")<0)throw new Error("能力未声明：icons");return rpc("registerObjectType",[def]);},',
      'unregisterObjectType:function(id){need("types");return rpc("unregisterObjectType",[id]);},',
      'registerExporter:function(def){need("export");if(!def||typeof def.run!=="function")throw new Error("导出器需提供 run(ctx)");var id=String(def.id||"").trim();if(!id)throw new Error("导出器需提供 id");runs.exporter[id]=def.run;return rpc("registerExporter",[{id:id,label:String(def.label||def.name||id),ext:def.ext,mime:def.mime}]);},',
      'unregisterExporter:function(id){need("export");delete runs.exporter[String(id)];return rpc("unregisterExporter",[id]);},',
      'registerImporter:function(def){need("import");if(!def||typeof def.run!=="function")throw new Error("导入器需提供 run(ctx)");var ext=String(def.ext||"").replace(/^\\./,"").toLowerCase();if(!ext)throw new Error("导入器需提供 ext");runs.importer[ext]=def.run;return rpc("registerImporter",[{ext:ext,label:String(def.label||ext)}]);},',
      'unregisterImporter:function(ext){need("import");var e=String(ext||"").replace(/^\\./,"").toLowerCase();delete runs.importer[e];return rpc("unregisterImporter",[e]);},',
      'toast:toast};',
      'g.PlotPin=api;',
      'add("message",function(e){var d=e.data;if(!d||d.__pp!==1||d.token!==TOKEN)return;',
      'if(d.type==="rpc-result"){var p=pend[d.id];if(!p)return;delete pend[d.id];if(d.ok)p.ok(d.value);else p.no(new Error(String(d.error||"调用失败")));return;}',
      'if(d.type!=="invoke")return;var fn=runs[d.kind]&&runs[d.kind][d.id];',
      'if(!fn){send({type:"invoke-result",callId:d.callId,ok:false,error:"未找到"+String(d.kind)+"："+String(d.id)});return;}',
      'var input=d.input||{},ctx={state:input.state,projectName:input.projectName,site:input.site,file:input.file,toast:toast,download:function(data,name){return dl(d.callId,name,data);}};',
      'try{var r=fn.call(api,ctx);Promise.resolve(r).then(function(){return Promise.all(dls);}).then(function(){dls=[];send({type:"invoke-result",callId:d.callId,ok:true});},function(err){dls=[];send({type:"invoke-result",callId:d.callId,ok:false,error:String(err&&err.message||err)});});}catch(err){dls=[];send({type:"invoke-result",callId:d.callId,ok:false,error:String(err&&err.message||err)});}',
      '});',
      /* 全局硬化：直连 API 与原型链一起删；bootstrap 用的引用已提前绑定 */
      '["fetch","indexedDB","XMLHttpRequest","WebSocket","EventSource","importScripts","caches","localStorage","sessionStorage","navigator","location","postMessage","addEventListener","removeEventListener","self","Worker","SharedWorker","close"].forEach(function(k){',
      'try{Object.defineProperty(g,k,{value:undefined,configurable:false,writable:false});}catch(e){}',
      'var p=g;while(p){try{delete p[k];}catch(e){}p=Object.getPrototypeOf(p);}});',
      'later(function(){send({type:"loaded"});},0);',
      '})();',
      ''
    ].join('') + '\n' + rec.code;
  }

  function validSandboxMessage(rec, d) {
    return !!d && typeof d === 'object' && d.__pp === 1 && d.token === rec.token;
  }

  function replyRpc(rec, d, ok, value, error) {
    if (!rec.worker) return;
    rec.worker.postMessage({ __pp: 1, token: rec.token, type: 'rpc-result', id: d.id, ok: !!ok, value, error: error == null ? '' : String(error) });
  }
  function needCap(rec, cap) {
    if (!rec.caps.includes(cap)) throw new Error('能力未声明：' + cap);
  }
  function safeFileName(name, fallback) {
    const s = String(name || '').replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim().slice(0, 120);
    return s || fallback;
  }

  function pluginAddObjects(list, msg, annotationOnly) {
    if (!Array.isArray(list)) throw new Error('addObjects 需传入对象数组');
    if (list.length > 500) throw new Error('单次最多添加 500 个对象');
    const st = appState();
    if (!st) throw new Error('当前没有可写入的工程');
    const raw = [];
    for (const src of list) {
      if (!src || typeof src !== 'object') throw new Error('对象必须是对象字面量');
      if (annotationOnly && !['text', 'dimension'].includes(src.kind)) throw new Error('addAnnotation 仅支持 text / dimension');
      const o = Object.create(null);
      for (const k of Object.keys(src)) {
        if (k === 'id' || k === 'createdAt' || k === 'updatedAt') continue;   /* 主工程重新编号与打时间戳 */
        o[k] = src[k];
      }
      raw.push(o);
    }
    const layers = Array.isArray(st.layers) ? st.layers : [];
    const types = Array.isArray(st.objectTypes) ? st.objectTypes : [];
    const sanitize = typeof global.sanitizeObjects === 'function' ? global.sanitizeObjects
      : (typeof sanitizeObjects === 'function' ? sanitizeObjects : null);
    if (!sanitize) throw new Error('主工程清洗函数不可用，拒绝写入');
    const clean = sanitize(raw, layers, types);
    if (!clean.length) throw new Error('没有可添加的有效对象');
    const objectsMax = typeof APP_LIMITS !== 'undefined' && APP_LIMITS.OBJECTS_MAX ? APP_LIMITS.OBJECTS_MAX : 100000;
    if (Array.isArray(st.objects) && st.objects.length + clean.length > objectsMax) {
      throw new Error('对象数量超过上限 ' + objectsMax);
    }
    st.objects.push(...clean);
    if (typeof global.commitChange === 'function') global.commitChange(String(msg || '').slice(0, 80));
    return clean.map(o => o.id);
  }

  function handleSandboxRpc(rec, d) {
    let value;
    let ok = true;
    try {
      const args = Array.isArray(d.args) ? d.args : [];
      const a0 = args[0];
      switch (d.method) {
        case 'getState':
          needCap(rec, 'state:read');
          value = cloneJSON(global.persistableState ? global.persistableState() : appState());
          break;
        case 'addObjects':
          needCap(rec, 'state:write');
          value = pluginAddObjects(a0, args[1], false);
          break;
        case 'addAnnotation':
          needCap(rec, 'annotate');
          value = pluginAddObjects([a0], args[1], true);
          break;
        case 'registerObjectType':
          needCap(rec, 'types');
          if (a0 && a0.symbol !== undefined) needCap(rec, 'icons');
          addType(a0, rec.id);
          rec.types.add(String(a0.id).trim());
          value = true;
          break;
        case 'unregisterObjectType': {
          needCap(rec, 'types');
          const id = String(a0 || '');
          if (typeOwners.get(id) !== rec.id) throw new Error('只能注销本插件注册的类型');
          value = removeType(id);
          if (value) rec.types.delete(id);
          break;
        }
        case 'registerExporter':
          needCap(rec, 'export');
          value = addExporter(a0, rec.id);
          break;
        case 'unregisterExporter':
          needCap(rec, 'export');
          value = removeExporter(String(a0 || ''), rec.id);
          break;
        case 'registerImporter':
          needCap(rec, 'import');
          value = addImporter(a0, rec.id);
          break;
        case 'unregisterImporter':
          needCap(rec, 'import');
          value = removeImporter(a0, rec.id);
          break;
        default:
          throw new Error('未知的插件调用：' + String(d.method));
      }
    } catch (e) {
      ok = false;
      value = undefined;
      replyRpc(rec, d, false, undefined, e && e.message || e);
      if (rec.status === 'loading') rec.errors.push(String(e && e.message || e));
      else if (rec.status === 'active') disablePlugin(rec, '插件异常：' + String(e && e.message || e));
      return;
    }
    replyRpc(rec, d, ok, value);
  }

  function handleDownload(rec, d) {
    const pending = rec.pending.get(d.callId);
    const fallback = pending ? pending.fallback : '插件导出.bin';
    const name = safeFileName(d.name, fallback);
    let blob;
    if (d.kind === 'text') {
      blob = new Blob([String(d.text == null ? '' : d.text)], { type: 'text/plain;charset=utf-8' });
    } else {
      const bytes = d.bytes;
      const buf = (typeof ArrayBuffer !== 'undefined' && bytes instanceof ArrayBuffer)
        ? bytes
        : (bytes && typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(bytes) ? bytes.buffer : new ArrayBuffer(0));
      blob = new Blob([buf], { type: String(d.mime || 'application/octet-stream') });
    }
    if (typeof global.downloadBlob === 'function') global.downloadBlob(blob, name);
  }

  function onSandboxMessage(rec, d) {
    if (!validSandboxMessage(rec, d)) return;
    switch (d.type) {
      case 'loaded':
        if (rec.status !== 'loading') return;
        clearTimeout(rec.timer);
        rec.timer = null;
        if (rec.errors.length) { disablePlugin(rec, '插件初始化失败：' + rec.errors[0]); return; }
        rec.status = 'active';
        if (rec.loadResolve) rec.loadResolve({ ok: true, id: rec.id, apiVersion: rec.apiVersion, capabilities: rec.caps.slice() });
        rec.loadResolve = null;
        break;
      case 'rpc':
        handleSandboxRpc(rec, d);
        break;
      case 'toast':
        if (typeof global.toast === 'function') global.toast(String(d.message || '').slice(0, 200), /^(error|warn|success)$/.test(String(d.level || '')) ? String(d.level) : '');
        break;
      case 'download':
        handleDownload(rec, d);
        break;
      case 'invoke-result': {
        const pending = rec.pending.get(d.callId);
        if (!pending) return;
        rec.pending.delete(d.callId);
        clearTimeout(pending.timer);
        if (d.ok) pending.resolve({ ok: true });
        else {
          pending.resolve({ ok: false, error: String(d.error || '插件执行失败') });
          disablePlugin(rec, '插件异常：' + String(d.error || '插件执行失败'));
        }
        break;
      }
      case 'fatal':
        disablePlugin(rec, '插件异常：' + String(d.reason || '未知错误'));
        break;
      default:
        break;
    }
  }

  function terminateWorker(rec) {
    if (rec.timer) { clearTimeout(rec.timer); rec.timer = null; }
    if (rec.worker) { try { rec.worker.terminate(); } catch (_) {} rec.worker = null; }
    if (rec.url) { try { URL.revokeObjectURL(rec.url); } catch (_) {} rec.url = null; }
    rec.pending.forEach(p => { clearTimeout(p.timer); p.resolve({ ok: false, error: '插件已终止' }); });
    rec.pending.clear();
  }

  function removePluginRegistrations(rec) {
    for (let i = exporters.length - 1; i >= 0; i--) if (exporters[i].pluginId === rec.id) exporters.splice(i, 1);
    for (let i = importers.length - 1; i >= 0; i--) if (importers[i].pluginId === rec.id) importers.splice(i, 1);
    Array.from(rec.types).forEach(id => { if (!typeInUse(id)) removeType(id); });
    rec.types.clear();
    syncExportOptions();
    refreshTypeUI();
  }

  function disablePlugin(rec, reason) {
    if (!rec || rec.status === 'disabled' || rec.status === 'unloaded') return;
    rec.status = 'disabled';
    rec.reason = String(reason || '未知原因');
    terminateWorker(rec);
    removePluginRegistrations(rec);
    if (rec.loadResolve) { rec.loadResolve({ ok: false, id: rec.id, reason: rec.reason }); rec.loadResolve = null; }
    if (typeof global.toast === 'function') global.toast('插件已禁用：' + rec.id + ' · ' + rec.reason, 'error');
  }

  function invokeSandbox(rec, kind, id, input, fallback) {
    if (!rec || rec.status !== 'active' || !rec.worker) {
      return Promise.resolve({ ok: false, error: '插件不可用：' + (rec ? rec.status + (rec.reason ? ' · ' + rec.reason : '') : '未加载') });
    }
    const callId = ++rec.callSeq;
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        rec.pending.delete(callId);
        disablePlugin(rec, '调用超时（>' + PLUGIN_CALL_TIMEOUT + 'ms）已终止');
        resolve({ ok: false, error: '调用超时（>' + PLUGIN_CALL_TIMEOUT + 'ms）已终止' });
      }, PLUGIN_CALL_TIMEOUT);
      rec.pending.set(callId, { resolve, timer, fallback });
      rec.worker.postMessage({ __pp: 1, token: rec.token, type: 'invoke', callId, kind, id, input });
    });
  }

  /** 隔离加载：所有校验失败都返回 {ok:false,reason}，不抛异常、不影响主工程 */
  function loadPlugin(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const fail = reason => {
      if (typeof global.toast === 'function') global.toast('插件未加载：' + reason, 'error');
      return Promise.resolve({ ok: false, reason });
    };
    const id = String(s.id == null ? '' : s.id).trim();
    if (!PLUGIN_ID_RE.test(id)) return fail('插件 id 需为 2–64 位字母、数字、点、下划线或短横线');
    if (sandboxPlugins.has(id)) return fail('插件 id 已存在：' + id);
    const check = checkPlugin({ id, apiVersion: s.apiVersion, capabilities: s.capabilities });
    if (!check.ok) return fail(check.reason);
    if (s.code !== undefined && typeof s.code !== 'string') return fail('插件 code 需为字符串');
    if (!String(s.code || '').trim()) return fail('插件需提供 code');
    if (typeof global.Worker !== 'function' || typeof global.Blob !== 'function' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return fail('当前环境不支持 Worker 隔离，拒绝以同源方式执行插件');
    }
    const rec = {
      id,
      apiVersion: String(s.apiVersion),
      caps: check.caps,
      code: String(s.code),
      status: 'loading',
      reason: '',
      token: newPluginToken(),
      types: new Set(),
      errors: [],
      pending: new Map(),
      callSeq: 0,
      worker: null,
      url: null,
      timer: null,
      loadResolve: null
    };
    sandboxPlugins.set(id, rec);
    let resolveLoad;
    const done = new Promise(r => { resolveLoad = r; });
    rec.loadResolve = resolveLoad;
    try {
      const blob = new Blob([sandboxSource(rec)], { type: 'text/javascript' });
      rec.url = URL.createObjectURL(blob);
      rec.worker = new global.Worker(rec.url);
    } catch (e) {
      sandboxPlugins.delete(id);
      if (rec.url) { try { URL.revokeObjectURL(rec.url); } catch (_) {} }
      return fail('无法创建隔离 Worker：' + (e && e.message || e));
    }
    rec.worker.onmessage = e => onSandboxMessage(rec, e.data);
    rec.worker.onerror = e => {
      disablePlugin(rec, '插件异常：' + String(e && e.message ? e.message : '脚本错误'));
    };
    rec.timer = setTimeout(() => disablePlugin(rec, '插件初始化超时（>' + PLUGIN_CALL_TIMEOUT + 'ms）'), PLUGIN_CALL_TIMEOUT);
    return done;
  }

  function unloadPlugin(id) {
    const key = String(id);
    const rec = sandboxPlugins.get(key);
    if (!rec) return false;
    sandboxPlugins.delete(key);
    terminateWorker(rec);
    removePluginRegistrations(rec);
    rec.status = 'unloaded';
    rec.reason = '已卸载';
    if (rec.loadResolve) { rec.loadResolve({ ok: false, id: rec.id, reason: '已卸载' }); rec.loadResolve = null; }
    return true;
  }

  function listPlugins() {
    return Array.from(sandboxPlugins.values()).map(p => ({
      id: p.id,
      apiVersion: p.apiVersion,
      capabilities: p.caps.slice(),
      status: p.status,
      reason: p.reason,
      types: Array.from(p.types)
    }));
  }

  const PlotPin = {
    version: '0.2.0',
    apiVersion: PLUGIN_API_VERSION,
    capabilities: PLUGIN_CAPABILITIES,
    checkPlugin: checkPlugin,
    loadPlugin: loadPlugin,
    unloadPlugin: unloadPlugin,
    listPlugins: listPlugins,
    registerExporter(def) { return addExporter(def, null); },
    unregisterExporter(id) { return removeExporter(String(id), null); },
    registerImporter(def) { return addImporter(def, null); },
    unregisterImporter(ext) { return removeImporter(ext, null); },
    /** 注册自定义设备/区域/折线类型：写入内置类型表并立即出现在当前工程的类型下拉 */
    registerObjectType(def) { return addType(def, null); },
    /** 注销插件类型；被对象使用时拒绝，避免既有图纸丢失外观 */
    unregisterObjectType(id) { return removeType(id); },
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
    if (ex.sandbox) {
      const rec = sandboxPlugins.get(ex.pluginId);
      if (!rec || rec.status !== 'active') {
        return global.toast('插件不可用：' + (ex.pluginId || id) + (rec && rec.reason ? ' · ' + rec.reason : ''), 'error');
      }
      const live = appState();
      const read = rec.caps.includes('state:read');
      const input = read ? {
        state: global.persistableState(),
        projectName: live && live.meta ? live.meta.name : '',
        site: typeof global.siteDescription === 'function' ? global.siteDescription() : ''
      } : {};
      const fallback = safeFileName('', (typeof global.safeName === 'function' ? global.safeName() : '图纸工程') + '.' + (ex.ext || 'bin'));
      return invokeSandbox(rec, 'exporter', ex.id, input, fallback);
    }
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
    if (imp && imp.sandbox) {
      const rec = sandboxPlugins.get(imp.pluginId);
      if (!rec || rec.status !== 'active') {
        return global.toast('插件不可用：' + (imp.pluginId || imp.ext) + (rec && rec.reason ? ' · ' + rec.reason : ''), 'error');
      }
      const max = typeof APP_LIMITS !== 'undefined' && APP_LIMITS.IMPORT_FILE_MAX_BYTES ? APP_LIMITS.IMPORT_FILE_MAX_BYTES : 32 * 1024 * 1024;
      if (file && file.size > max) return global.toast('插件导入失败：文件过大（上限 ' + Math.round(max / 1048576) + ' MB）', 'error');
      const read = rec.caps.includes('state:read');
      return Promise.resolve(file && typeof file.arrayBuffer === 'function' ? file.arrayBuffer() : new ArrayBuffer(0)).then(buf => {
        const input = {
          file: { name: String(file && file.name || ''), size: Number(file && file.size || 0), type: String(file && file.type || '') },
          bytes: buf,
          state: read ? global.persistableState() : null
        };
        return invokeSandbox(rec, 'importer', normExt(imp.ext), input, '');
      }).catch(err => {
        if (typeof global.toast === 'function') global.toast('插件导入失败：' + (err && err.message || err), 'error');
      });
    }
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
