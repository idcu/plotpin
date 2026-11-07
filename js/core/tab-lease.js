/* tab-lease.js —— 同工程多标签编辑租约：BroadcastChannel 心跳优先，storage 事件降级 */
/* 只做「同工程另一标签正在编辑」的可见提示与保存前拦截；不做实时互斥，不改合并逻辑。
   心跳 5s、租约 15s：对端心跳过期即视为已离开；pagehide 主动广播 release。 */
const LEASE_CHANNEL='plotpin:editor-lease';
const LEASE_STORAGE_KEY='plotpin:editor-lease';
const LEASE_TTL_MS=15000;
const LEASE_HEARTBEAT_MS=5000;
let leaseMode='none',leaseTabId='',leaseProjectId='',leaseActive=false,leaseConfirmed=false,leaseConflict=false,leaseLastSent=0,leaseChannel=null,leaseTimer=null,leaseHandler=null;
const leasePeers=new Map();
function leaseCurProject(){ return String((state&&state.meta&&state.meta.projectId)||''); }
/** 广播心跳；1.5s 内重复发送合并；flag='release' 广播释放，flag=1 附带 claim */
function leaseSend(now,force,flag){
  if(!leaseActive) return;
  now=now||Date.now();
  if(!force&&now-leaseLastSent<1500) return;
  leaseLastSent=now;
  const msg={type:flag==='release'?'release':'lease',tabId:leaseTabId,projectId:leaseProjectId,ts:now};
  if(flag===1) msg.claim=1;
  if(leaseChannel){ try{ leaseChannel.postMessage(msg); }catch(_){} }
  else if(leaseMode==='storage'){ try{ localStorage.setItem(LEASE_STORAGE_KEY,JSON.stringify(msg)); }catch(_){} }
}
/** 当前工程最鲜对端心跳时刻（0=无；超过租约即失效） */
function leaseFreshTs(now){
  now=now||Date.now(); let t=0;
  leasePeers.forEach(p=>{ if(p.projectId===leaseProjectId&&p.tabId!==leaseTabId&&now-p.ts<LEASE_TTL_MS&&p.ts>t) t=p.ts; });
  return t;
}
function leaseConflictAt(now){ return !leaseConfirmed&&leaseFreshTs(now)>0; }
function leaseEmit(active,lastBeat){
  if(leaseHandler) leaseHandler({active:active,lastBeat:lastBeat||0,projectId:leaseProjectId});
}
/** 工程切换即清空对端快照并广播新工程，避免切换后残留旧冲突 */
function leaseSyncProject(now){
  const p=leaseCurProject();
  if(p===leaseProjectId) return p;
  leaseProjectId=p; leasePeers.clear(); leaseConfirmed=false;
  if(leaseConflict){ leaseConflict=false; leaseEmit(false); }
  leaseSend(now,true);
  return p;
}
/** 冲突可见性只在此处翻转，避免横幅/状态栏各自判断 */
function leaseApply(now){
  const c=leaseConflictAt(now);
  if(c===leaseConflict) return;
  leaseConflict=c;
  leaseEmit(c,c?leaseFreshTs(now):0);
}
/** 收到对端消息（BC onmessage / storage 事件 / 自测注入）：合并快照并复算冲突 */
function leaseIngest(msg,now){
  now=now||Date.now();
  if(!msg||typeof msg!=='object'||msg.tabId===leaseTabId) return leaseConflictAt(now);
  if(msg.type==='release') leasePeers.delete(msg.tabId);
  else if(msg.type==='lease'){
    leasePeers.set(msg.tabId,{projectId:String(msg.projectId||''),ts:Number(msg.ts)||now});
    if(msg.claim) leaseConfirmed=false;
    leaseSend(now);
  }
  leasePeers.forEach((p,k)=>{ if(now-p.ts>=LEASE_TTL_MS) leasePeers.delete(k); });
  leaseApply(now);
  return leaseConflictAt(now);
}
/** 确认取得本页租约：本页不再提示冲突，并向对端广播 claim */
function leaseClaim(now){
  now=now||Date.now();
  leaseConfirmed=true; leaseConflict=false;
  leaseEmit(false);
  leaseSend(now,true,1);
  return true;
}
/** 保存前检查：仍有新鲜对端心跳时阻断自动保存（只检测，不做实时互斥） */
function leaseSaveBlocked(){
  if(!leaseActive||leaseConfirmed) return false;
  leaseSyncProject();
  return leaseConflictAt(Date.now());
}
function leaseStatus(){
  return {confirmed:leaseConfirmed,conflict:leaseConflict,lastBeat:leaseFreshTs(Date.now())};
}
function onLeaseConflict(fn){ leaseHandler=typeof fn==='function'?fn:null; }
function leaseTick(){
  const now=Date.now();
  leaseSyncProject(now); leaseSend(now,true); leaseApply(now);
}
function acquireEditorLease(){
  if(leaseActive) return leaseStatus();
  leaseTabId=leaseTabId||('T'+Math.random().toString(36).slice(2,10));
  leaseProjectId=leaseCurProject();
  if(typeof BroadcastChannel==='function'){
    try{ leaseChannel=new BroadcastChannel(LEASE_CHANNEL); leaseChannel.onmessage=e=>leaseIngest(e&&e.data,Date.now()); leaseMode='bc'; }catch(_){ leaseChannel=null; }
  }
  if(!leaseChannel){
    try{
      const old=localStorage.getItem(LEASE_STORAGE_KEY);
      if(old) leaseIngest(JSON.parse(old),Date.now());
      addEventListener('storage',e=>{
        if(!e||e.key!==LEASE_STORAGE_KEY||!e.newValue) return;
        try{ leaseIngest(JSON.parse(e.newValue),Date.now()); }catch(_){}
      });
      leaseMode='storage';
    }catch(_){ leaseMode='none'; }
  }
  leaseActive=true;
  if(leaseMode==='none') toast(L('无法检测多标签页，编辑仍可用'),'warn');
  leaseSend(Date.now(),true);
  leaseTimer=setInterval(leaseTick,LEASE_HEARTBEAT_MS);
  addEventListener('pagehide',releaseEditorLease);
  return leaseStatus();
}
function releaseEditorLease(){
  if(!leaseActive) return;
  leaseSend(Date.now(),true,'release');
  if(leaseChannel){ try{ leaseChannel.close(); }catch(_){} leaseChannel=null; }
  clearInterval(leaseTimer); leaseTimer=null;
  leaseActive=false; leasePeers.clear(); leaseConfirmed=false;
  if(leaseConflict){ leaseConflict=false; leaseEmit(false); }
  leaseMode='none';
}
