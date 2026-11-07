/* app.js —— 启动：恢复工程、首屏适配、能力探测与离线缓存注册 */
/* -------------------- 启动 -------------------- */
(async function init(){
  const caps=detectRuntimeCapabilities();
  const saved=await loadSavedProject();
  if(saved) state=saved;
  try{ const ss=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}'); Object.assign(state.settings,ss); }catch(e){}
  await catalogLoad();
  /* 界面语言先于首屏渲染：动态面板/ARIA 标签也按当前语言生成 */
  I18N.setLang(state.settings.lang);
  I18N.apply(document);
  refreshI18nRuntimeText();
  afterStateLoaded(!state.viewport.zoom || state.viewport.zoom===1);
  resizeCanvas();
  if(state.viewport.zoom===1) fitView();
  updateOsnapChip();
  /* 首次启动引导：仅有「无已保存工程」且当前来源从未完成引导时展示；老工程一律不打扰 */
  if(firstRunGuideState(savedProjectHasContent(saved)).shouldShow) showFirstRunGuide();
  /* IndexedDB 不可用：首次启动即提示降级，避免自动保存静默失效 */
  if(!caps.idb) notifyIdbFallback();
  /* 仅托管（http/https）部署可注册 Service Worker；file:// 双击模式本身即离线。
     更新检测：新 SW 装好且已有旧版在控制页面时提示刷新；注册/更新失败只是保持旧版本，不影响使用。 */
  if(caps.sw){
    try{
      const reg=await navigator.serviceWorker.register('sw.js');
      const notify=()=>{
        if(!reg.waiting || !navigator.serviceWorker.controller) return;
        toast(L('新版本可用：刷新页面后生效'),'warn');
      };
      reg.addEventListener('updatefound',()=>{
        const w=reg.installing;
        if(w) w.addEventListener('statechange',()=>{ if(w.state==='installed') notify(); });
      });
      notify();
      document.addEventListener('visibilitychange',()=>{
        if(document.visibilityState==='visible') reg.update().catch(()=>{ /* 离线时更新失败保持旧版本 */ });
      });
    }catch(_){ /* 注册失败不影响离线使用 */ }
  }
})();
