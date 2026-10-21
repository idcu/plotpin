/* app.js —— 启动：恢复工程、首屏适配、能力探测与离线缓存注册 */
/* -------------------- 启动 -------------------- */
(async function init(){
  const caps=detectRuntimeCapabilities();
  const saved=await loadSavedProject();
  if(saved) state=saved;
  try{ const ss=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}'); Object.assign(state.settings,ss); }catch(e){}
  afterStateLoaded(!state.viewport.zoom || state.viewport.zoom===1);
  resizeCanvas();
  if(state.viewport.zoom===1) fitView();
  updateOsnapChip();
  /* 界面语言：作用于顶栏/工具栏/页签/导出选项等静态 chrome */
  I18N.setLang(state.settings.lang);
  I18N.apply(document);
  /* IndexedDB 不可用：首次启动即提示降级，避免自动保存静默失效 */
  if(!caps.idb) notifyIdbFallback();
  /* 仅托管（http/https）部署可注册 Service Worker；file:// 双击模式本身即离线 */
  if(caps.sw){
    try{ await navigator.serviceWorker.register('sw.js'); }catch(_){ /* 注册失败不影响离线使用 */ }
  }
})();
