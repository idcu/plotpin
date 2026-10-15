/* app.js —— 启动：恢复工程、首屏适配 */
/* -------------------- 启动 -------------------- */
(async function init(){
  const saved=await loadSavedProject();
  if(saved) state=saved;
  try{ const ss=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}'); Object.assign(state.settings,ss); }catch(e){}
  afterStateLoaded(!state.viewport.zoom || state.viewport.zoom===1);
  resizeCanvas();
  if(state.viewport.zoom===1) fitView();
  updateOsnapChip();
})();
