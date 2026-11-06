/* collab.js —— 实时协作：本机多标签 BroadcastChannel + 跨设备 WebRTC 邀请串（无服务器） */
const COLLAB_CHUNK=48000, COLLAB_MAX=8*1024*1024, COLLAB_PREFIX='plotpin-collab-';
const COLLAB_INVITE_PREFIX='PLOTPIN-COLLAB:1:';
/* 消息层护栏：半截分块必须有寿命、数量与总字节上限，否则不可信对端可让内存无界增长 */
const COLLAB_INBOUND_TTL_MS=30000;
const COLLAB_INBOUND_MAX_KEYS=64;
const COLLAB_INBOUND_MAX_BYTES=COLLAB_MAX*2;
const COLLAB_HELLO_DEDUP_MS=1500;
const COLLAB_DC_BUFFER_LIMIT=2*1024*1024;
const COLLAB_ID_MAX=96;
const collabPeerId='U'+Math.random().toString(36).slice(2,8).toUpperCase();
let collabBC=null, collabPC=null, collabDC=null, collabMode=null, collabActive=false;
let collabTimer=null, collabApplyChain=Promise.resolve(), collabLastStatus='', collabLastError='';
let collabState='idle', collabClosing=false, collabPendingSnapshot=false, collabSendRetry=null;
let collabLastMerge=null, collabNotifyAt=0;
const collabPeers=new Map();
const collabInbound=new Map();
const collabHelloSeen=new Map();

/** SDP 兼容清洗：移除 a=max-message-size 与空行、去掉行尾空白，统一 CRLF。
 *  Chromium 的 setRemoteDescription 解析器不接受空行（会报「Expects m line」），
 *  而浏览器自身生成的 data-only SDP 也不含空行；手动复制常引入多余空行或行尾空白，
 *  因此在生成/应用信令前统一清洗，保证双方解析一致。 */
function collabCleanSDP(sdp){
  const lines=String(sdp||'')
    .replace(/\r\n?/g,'\n')
    .split('\n')
    .map(line=>line.replace(/\s+$/,''))
    .filter(line=>line!==''&&!/^a=max-message-size:/i.test(line.trim()));
  return lines.join('\r\n')+'\r\n';
}

/** 长消息按字符切块，避免 DataChannel/实现的消息大小限制（纯函数） */
function collabChunkText(text,size=COLLAB_CHUNK){
  const s=String(text??''), step=Math.max(1,Number(size)||COLLAB_CHUNK), out=[];
  for(let i=0;i<s.length;i+=step) out.push(s.slice(i,i+step));
  return out.length?out:[''];
}

/* -------------------- 邀请串编解码（纯函数） -------------------- */
/** SDP → 可粘贴邀请串：`PLOTPIN-COLLAB:1:O|A:<base64>`；SDP 为 ASCII，btoa 安全且比 JSON 更短 */
function collabInviteEncode(kind,sdp){
  const clean=collabCleanSDP(sdp);
  if(!clean||clean.trim()==='') throw new Error(L('邀请内容为空'));
  if(clean.length>COLLAB_MAX) throw new Error(L('邀请内容过大'));
  const tag=kind==='answer'?'A':'O';
  return COLLAB_INVITE_PREFIX+tag+':'+btoa(clean);
}
/** 邀请串 → {kind,sdp,tagged}；兼容直接粘贴裸 SDP（tagged=false），非法输入抛中文错误 */
function collabInviteDecode(text){
  const raw=String(text||'').trim();
  if(!raw) throw new Error(L('邀请串为空'));
  let kind='offer', sdp=raw, tagged=false;
  if(raw.startsWith(COLLAB_INVITE_PREFIX)){
    const rest=raw.slice(COLLAB_INVITE_PREFIX.length), i=rest.indexOf(':');
    if(i<0) throw new Error(L('邀请串格式无效'));
    const tag=rest.slice(0,i).toUpperCase();
    if(tag!=='O'&&tag!=='A') throw new Error(L('邀请串类型无效'));
    kind=tag==='A'?'answer':'offer';
    try{ sdp=atob(rest.slice(i+1)); }
    catch(_){ throw new Error(L('邀请串编码无效')); }
    tagged=true;
  }else if(!/^v=0(\r?\n)?$/m.test(raw.split('\n')[0].trim())){
    throw new Error(L('不是有效的邀请串或 SDP'));
  }
  if(sdp.length>COLLAB_MAX) throw new Error(L('邀请内容过大'));
  const clean=collabCleanSDP(sdp);
  if(!/m=application/i.test(clean)) throw new Error(L('SDP 缺少数据通道媒体段'));
  return {kind,sdp:clean,tagged};
}
/** 内置二维码容量判定（Qr 固定 Version 3-M，MAX_BYTES=42） */
function collabQrFit(text){
  const s=String(text||'');
  const limit=(typeof Qr!=='undefined'&&Number.isFinite(Qr.MAX_BYTES))?Number(Qr.MAX_BYTES):0;
  const bytes=(typeof Qr!=='undefined'&&typeof Qr.byteLength==='function')?Number(Qr.byteLength(s)):s.length;
  return {bytes,limit,fits:limit>0&&bytes<=limit};
}

/* -------------------- 入站分块缓冲护栏 -------------------- */
function collabInboundBytes(){
  let n=0;
  collabInbound.forEach(b=>{ if(b&&Number.isFinite(b.size)) n+=b.size; });
  return n;
}
/** TTL + key 上限 + 总字节上限；按 lastAt 最旧优先淘汰。返回清理后的 key 数。 */
function collabSweepInbound(now=Date.now()){
  for(const [key,b] of collabInbound){
    if(!b||now-(b.lastAt||b.at||0)>COLLAB_INBOUND_TTL_MS) collabInbound.delete(key);
  }
  if(collabInbound.size>COLLAB_INBOUND_MAX_KEYS){
    const olds=Array.from(collabInbound.entries()).sort((a,b)=>(a[1].lastAt||0)-(b[1].lastAt||0));
    let extra=collabInbound.size-COLLAB_INBOUND_MAX_KEYS;
    for(const [key] of olds){ if(extra<=0) break; collabInbound.delete(key); extra--; }
  }
  let bytes=collabInboundBytes();
  if(bytes>COLLAB_INBOUND_MAX_BYTES){
    const olds=Array.from(collabInbound.entries()).sort((a,b)=>(a[1].lastAt||0)-(b[1].lastAt||0));
    for(const [key,b] of olds){ if(bytes<=COLLAB_INBOUND_MAX_BYTES) break; collabInbound.delete(key); bytes-=(b&&b.size)||0; }
  }
  return collabInbound.size;
}
/** 重复 hello 去重：同一 sender + 同一 name 在窗口内只处理一次（首见返回 false） */
function collabHelloDup(sender,name,now=Date.now()){
  const key=String(sender||''), sig=String(name||key);
  const prev=collabHelloSeen.get(key);
  if(prev&&prev.sig===sig&&now-prev.at<COLLAB_HELLO_DEDUP_MS) return true;
  collabHelloSeen.set(key,{sig,at:now});
  if(collabHelloSeen.size>COLLAB_INBOUND_MAX_KEYS){
    const olds=Array.from(collabHelloSeen.entries()).sort((a,b)=>a[1].at-b[1].at);
    let extra=collabHelloSeen.size-COLLAB_INBOUND_MAX_KEYS;
    for(const [k] of olds){ if(extra<=0) break; collabHelloSeen.delete(k); extra--; }
  }
  return false;
}

/* -------------------- 状态机与提示 -------------------- */
function collabStateText(code,detail){
  const base={
    idle:L('尚未连接'), waiting:L('等待对方接入'), connecting:L('连接中…'),
    connected:L('已连接'), disconnected:L('已断开'), error:L('连接异常')
  }[code]||L('尚未连接');
  return detail ? base+'：'+detail : base;
}
function collabRecordError(text){
  collabLastError=String(text||'');
  try{ window.__collabLastError=collabLastError; }catch(_){}
}
function collabSetStatus(text,type=''){
  collabLastStatus=text||'';
  if(type==='error') collabRecordError(collabLastStatus);
  const el=$('collabStatus');
  if(el){ el.textContent=collabLastStatus; el.className='hint-text'+(type?' '+type:''); }
}
/** 状态迁移：idle / waiting / connecting / connected / disconnected / error */
function collabSetState(code,detail,type=''){
  collabState=code||'idle';
  collabSetStatus(collabStateText(collabState,detail),type);
  try{ window.__collabState=collabState; }catch(_){}
}
/** 同一提示 2 秒内只报一次，避免 500ms 快照把控制台/界面刷爆 */
function collabNotifyThrottled(text,type='warn'){
  const now=Date.now();
  if(now-collabNotifyAt<2000) return;
  collabNotifyAt=now;
  if(type==='error') collabRecordError(text);
  collabSetStatus(text,type);
}
function collabRefreshConflictInfo(){
  const el=$('collabConflictInfo');
  if(!el) return;
  const m=collabLastMerge;
  if(!m){ el.textContent=L('尚无冲突记录'); el.className='hint-text'; return; }
  const changed=(m.added||0)+(m.updated||0)+(m.deleted||0)+(m.floorsAdded||0)+(m.floorMetaUpdated||0)+(m.floorsDeleted||0);
  if(!changed){ el.textContent=L('最近一次合并：无变化'); el.className='hint-text'; return; }
  const overwritten=(m.updated||0)+(m.deleted||0)+(m.floorMetaUpdated||0)+(m.floorsDeleted||0);
  el.textContent=`${L('最近一次合并')}：+${m.added||0} ~${m.updated||0} -${m.deleted||0} · ${L('冲突')} ${m.conflicts||0}`+
    (overwritten?` · ${L('已写入撤销栈，可 Ctrl+Z 回滚')}`:'');
  el.className='hint-text'+(overwritten?' warn':'');
}
function collabRefreshUI(){
  const b=$('collabLocalBtn');
  if(b) b.textContent=collabMode==='local'&&collabActive?L('停用本机同步'):L('启用本机同步');
  const peers=$('collabPeers');
  if(peers){
    const names=Array.from(collabPeers.values());
    if(names.length) peers.textContent=`${L('已连接对端')}：${names.join('、')}`;
    else if(collabState==='waiting') peers.textContent=L('等待对方接入');
    else if(collabState==='disconnected') peers.textContent=L('已断开');
    else peers.textContent=L('尚未连接');
  }
  const el=$('collabStatus');
  if(el) el.textContent=collabLastStatus||collabStateText(collabState);
  collabRefreshConflictInfo();
}

/* -------------------- 传输层（发送全部包异常保护） -------------------- */
function collabTransportReady(){
  return !!(collabBC||(collabDC&&collabDC.readyState==='open'));
}
function collabSendRaw(data,to='*'){
  if(collabBC){
    try{ collabBC.postMessage(data); return true; }
    catch(e){ collabRecordError(L('发送失败：{msg}',{msg:(e.message||e)})); collabNotifyThrottled(L('发送失败：{msg}',{msg:(e.message||e)}),'error'); return false; }
  }
  if(collabDC&&collabDC.readyState==='open'){
    if(typeof collabDC.bufferedAmount==='number'&&collabDC.bufferedAmount>COLLAB_DC_BUFFER_LIMIT){
      collabRecordError(L('通道拥塞，消息已跳过'));
      collabNotifyThrottled(L('通道拥塞，消息已跳过（将在下次变更时重试）'),'warn');
      return false;
    }
    try{ collabDC.send(data); return true; }
    catch(e){ collabRecordError(L('发送失败：{msg}',{msg:(e.message||e)})); collabNotifyThrottled(L('发送失败：{msg}',{msg:(e.message||e)}),'error'); return false; }
  }
  return false;
}
function collabSendObject(obj,to='*'){
  if(!collabTransportReady()) return false;
  const payload=JSON.stringify(Object.assign({},obj,{sender:collabPeerId,to:to||'*'}));
  if(payload.length>COLLAB_MAX){
    toast(L('协作消息过大，已跳过（请用工程库合并或 JSON 交换）'),'warn');
    return false;
  }
  const chunks=collabChunkText(payload);
  const id=Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  let ok=true;
  for(let i=0;i<chunks.length;i++){
    const frame=JSON.stringify({t:'chunk',id,sender:collabPeerId,to:to||'*',total:chunks.length,seq:i,data:chunks[i]});
    if(!collabSendRaw(frame)){ ok=false; break; }
  }
  if(!ok){
    collabRecordError(L('协作消息发送失败（分块中断）'));
    if(obj&&obj.t==='snapshot'){
      collabPendingSnapshot=true;
      clearTimeout(collabSendRetry);
      collabSendRetry=setTimeout(()=>{
        collabSendRetry=null;
        if(collabActive&&collabTransportReady()&&collabPendingSnapshot){
          collabPendingSnapshot=false;
          collabSendObject({t:'snapshot',project:persistableState()});
        }
      },2000);
    }
  }else if(obj&&obj.t==='snapshot'){
    collabPendingSnapshot=false;
  }
  return ok;
}
function collabReceiveRaw(raw){
  let m;
  try{ m=typeof raw==='string'?JSON.parse(raw):raw; }
  catch(_){ collabRecordError(L('协作消息解析失败')); return; }
  if(!m||typeof m!=='object'||m.t!=='chunk') return;
  const sender=typeof m.sender==='string'?m.sender:'';
  if(!sender||sender===collabPeerId) return;
  const to=typeof m.to==='string'?m.to:'*';
  if(to!=='*'&&to!==collabPeerId) return;
  if(sender.length>COLLAB_ID_MAX||String(m.id||'').length>COLLAB_ID_MAX) return;
  const total=Number(m.total), seq=Number(m.seq);
  if(!(total>0&&total<=400)||!(seq>=0&&seq<total)) return;
  if(total*COLLAB_CHUNK>COLLAB_MAX+COLLAB_CHUNK) return;
  collabSweepInbound();
  const key=sender+':'+String(m.id||'');
  let buf=collabInbound.get(key);
  if(!buf){ buf={total,parts:new Array(total),size:0,lastAt:Date.now()}; collabInbound.set(key,buf); }
  if(buf.total!==total||buf.parts[seq]!==undefined) return;
  buf.parts[seq]=String(m.data||''); buf.size+=buf.parts[seq].length; buf.lastAt=Date.now();
  if(buf.size>COLLAB_MAX){ collabInbound.delete(key); return; }
  if(collabInbound.size>COLLAB_INBOUND_MAX_KEYS) collabSweepInbound();
  if(!buf.parts.every(p=>p!==undefined)) return;
  collabInbound.delete(key);
  let msg;
  try{ msg=JSON.parse(buf.parts.join('')); }
  catch(_){ collabRecordError(L('协作消息解析失败')); return; }
  collabHandleMessage(msg,sender);
}
function collabHandleMessage(msg,from){
  if(!msg||!from) return;
  if(msg.t==='hello'){
    const name=String(msg.name||from).slice(0,80);
    const dup=collabHelloDup(from,name);
    collabPeers.set(from,msg.name||from);
    /* 重复 hello 只刷新在线表，不再重复回 hello-ack/整份快照，避免对端反复被覆盖 */
    if(!dup){
      collabSendObject({t:'hello-ack',name:collabPeerId},from);
      collabSendObject({t:'snapshot',project:persistableState()},from);
    }
    collabSetState('connected',L('已连接对端：{name}',{name:(msg.name||from)}),'ok');
    collabRefreshUI();
    return;
  }
  if(msg.t==='hello-ack'){
    const name=String(msg.name||from).slice(0,80);
    collabHelloDup('ack:'+from,name);
    collabPeers.set(from,msg.name||from);
    collabSetState('connected',L('已连接对端：{name}',{name:(msg.name||from)}),'ok');
    collabRefreshUI();
    return;
  }
  if(msg.t==='bye'){
    collabPeers.delete(from);
    collabHelloSeen.delete(from); collabHelloSeen.delete('ack:'+from);
    collabSetState('disconnected',L('对端已断开'),'warn');
    collabRefreshUI();
    return;
  }
  if(msg.t==='snapshot'&&msg.project&&isReadableSchema(msg.project.schema)){
    collabQueueApply(msg.project,from);
    return;
  }
  if(msg.t==='snapshot') collabRecordError(L('收到无法识别的工程快照'));
}
function collabQueueApply(raw,from){
  collabApplyChain=collabApplyChain.then(async()=>{
    try{
      /* overwrite：只有远端真正覆盖本地对象/楼层时才入撤销栈，避免每条远端快照都挤占 20 条历史 */
      const stats=await mergeProjectJSON(raw,{history:'overwrite'});
      collabLastMerge=Object.assign({at:nowISO(),from},stats);
      try{ window.__collabLastMerge=collabLastMerge; }catch(_){}
      const changed=(stats.added||0)+(stats.updated||0)+(stats.deleted||0)+(stats.floorsAdded||0)+(stats.floorMetaUpdated||0)+(stats.floorsDeleted||0);
      if(!changed){
        collabSetStatus(`${L('已同步')}：${L('无变化')}`,'ok');
        collabRefreshConflictInfo();
        return;
      }
      const overwritten=(stats.updated||0)+(stats.deleted||0)+(stats.floorMetaUpdated||0)+(stats.floorsDeleted||0);
      const detail=`+${stats.added||0} ~${stats.updated||0} -${stats.deleted||0}`+
        (stats.floorMetaUpdated?` · ${L('楼层元数据覆盖 {n}',{n:stats.floorMetaUpdated})}`:'')+
        (stats.conflicts?` · ${L('冲突 {n}',{n:stats.conflicts})}`:'');
      if(overwritten){
        collabSetStatus(L('已同步：{detail} · 可按 Ctrl+Z 回滚',{detail}),'warn');
        collabNotifyOverwrite(stats);
      }else{
        collabSetStatus(L('已同步：{detail}',{detail}),'ok');
      }
      collabRefreshConflictInfo();
    }catch(e){
      collabRecordError(L('同步失败：{msg}',{msg:e.message}));
      collabSetStatus(L('同步失败：{msg}',{msg:e.message}),'error');
      toast(L('同步失败：{msg}',{msg:e.message}),'error');
    }
  });
}
function collabNotifyOverwrite(stats){
  const now=Date.now();
  if(now-collabNotifyAt<3000) return;
  collabNotifyAt=now;
  const parts=[];
  if(stats.updated) parts.push(`~${stats.updated}`);
  if(stats.deleted) parts.push(`-${stats.deleted}`);
  if(stats.floorMetaUpdated) parts.push(`${L('楼层')} ${stats.floorMetaUpdated}`);
  toast(`${L('协作覆盖')}：${parts.join(' ')}，${L('可按 Ctrl+Z 回滚')}`,'warn');
}

/** 本地提交后防抖广播整份可持久化工程（LWW 合并保证幂等） */
function collabOnLocalChange(){
  if(!collabActive||!collabTransportReady()) return;
  clearTimeout(collabTimer);
  collabTimer=setTimeout(()=>{
    collabTimer=null;
    if(collabActive&&collabTransportReady()) collabSendObject({t:'snapshot',project:persistableState()});
  },500);
}

function collabStopAll(reason){
  /* 主动断开要告诉对端，否则对端只能看到静默失联，无法区分「已断开」与「异常」 */
  try{ if(collabActive&&collabTransportReady()) collabSendObject({t:'bye',name:collabPeerId}); }catch(_){}
  collabClosing=true;
  clearTimeout(collabTimer); collabTimer=null;
  clearTimeout(collabSendRetry); collabSendRetry=null;
  try{ if(collabDC){ collabDC.onclose=null; collabDC.onerror=null; collabDC.close(); } }catch(_){}
  try{ if(collabPC) collabPC.close(); }catch(_){}
  try{ if(collabBC) collabBC.close(); }catch(_){}
  collabDC=null; collabPC=null; collabBC=null; collabMode=null; collabActive=false;
  collabPeers.clear(); collabInbound.clear(); collabHelloSeen.clear();
  collabPendingSnapshot=false;
  if(reason==='peer') collabSetState('disconnected',L('对端已断开'),'warn');
  else collabSetState('disconnected',null);
  collabRefreshUI();
  collabClosing=false;
}
function collabStartLocal(name){
  if(typeof BroadcastChannel!=='function'){
    toast(L('当前环境不支持 BroadcastChannel，请使用跨设备直连或工程 JSON 合并'),'error');
    return false;
  }
  collabStopAll();
  const channel=COLLAB_PREFIX+String(name||'draft').trim().slice(0,60);
  try{ collabBC=new BroadcastChannel(channel); }
  catch(e){ toast(L('启用本机同步失败：{msg}',{msg:e.message}),'error'); collabStopAll(); return false; }
  collabBC.onmessage=e=>collabReceiveRaw(e.data);
  collabBC.onmessageerror=()=>{
    collabRecordError(L('本机频道消息解析失败'));
    collabNotifyThrottled(L('本机频道消息解析失败'),'error');
  };
  collabMode='local'; collabActive=true;
  collabSetState('waiting',`${L('频道')} ${channel}`);
  try{ localStorage.setItem('plotpin.collab.channel',String(name||'draft')); }catch(_){}
  /* hello + 自己的快照：重连时对端可能只回 hello-ack，若不主动带快照，离线期间的本地修改会传不出去 */
  collabSendObject({t:'hello',name:collabPeerId});
  collabSendObject({t:'snapshot',project:persistableState()});
  collabRefreshUI();
  return true;
}

function collabNewPeer(){
  const pc=new RTCPeerConnection({iceServers:[]});
  collabPC=pc;
  pc.onconnectionstatechange=()=>{
    const st=pc.connectionState;
    if(st==='connecting') collabSetState('connecting',L('正在建立连接…'));
    else if(st==='connected') collabSetState('connected',L('实时同步已就绪'),'ok');
    else if(st==='failed') collabSetState('error',`${L('连接失败')}（connectionState=failed）`,'error');
    else if(st==='disconnected') collabSetState('disconnected',L('连接已断开，等待恢复…'),'warn');
    else if(st==='closed'&&!collabClosing) collabSetState('disconnected',L('连接已关闭'),'warn');
    collabRefreshUI();
  };
  return pc;
}
function collabWaitIce(pc){
  if(!pc||pc.iceGatheringState==='complete') return Promise.resolve();
  return new Promise(resolve=>{
    const done=()=>{ clearTimeout(timer); pc.removeEventListener('icegatheringstatechange',check); resolve(); };
    const check=()=>{ if(pc.iceGatheringState==='complete') done(); };
    const timer=setTimeout(done,4000);
    pc.addEventListener('icegatheringstatechange',check);
  });
}
function collabWireDC(dc){
  collabDC=dc;
  dc.onopen=()=>{
    collabActive=true;
    collabPeers.set('webrtc','WebRTC');
    collabSetState('connected',L('实时同步已就绪'),'ok');
    collabSendObject({t:'hello',name:collabPeerId});
    collabSendObject({t:'snapshot',project:persistableState()});
    collabRefreshUI();
  };
  dc.onmessage=e=>collabReceiveRaw(e.data);
  dc.onclose=()=>{
    if(collabDC===dc) collabDC=null;
    collabActive=false;
    collabPeers.delete('webrtc');
    if(!collabClosing){
      collabSetState('error',`${L('连接异常断开')}（DataChannel closed）`,'error');
      toast(L('连接异常断开'),'error');
    }else{
      collabSetState('disconnected',null);
    }
    collabRefreshUI();
  };
  dc.onerror=e=>{
    const detail=(e&&(e.message||(e.error&&e.error.message)))||L('未知错误');
    collabRecordError(L('连接异常：{detail}',{detail}));
    collabSetState('error',`${L('连接异常')}：${detail}`,'error');
    toast(L('连接异常：{detail}',{detail}),'error');
    collabRefreshUI();
  };
}
async function collabCreateOffer(){
  if(typeof RTCPeerConnection!=='function'){
    toast(L('当前环境不支持 WebRTC，请使用本机同步或工程 JSON 合并'),'error');
    return;
  }
  collabStopAll();
  try{
    const pc=collabNewPeer();
    collabWireDC(pc.createDataChannel('plotpin'));
    collabSetState('connecting',L('正在生成邀请…'));
    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    await collabWaitIce(pc);
    const invite=collabInviteEncode('offer',pc.localDescription.sdp);
    const out=$('collabSignalOut');
    if(out) out.value=invite;
    collabRenderInviteQR(invite);
    collabMode='webrtc'; collabActive=true; collabLastError='';
    collabSetState('waiting',L('邀请已生成，等待对方粘贴应答'),'ok');
    collabRefreshUI();
  }catch(e){
    collabRecordError(L('生成邀请失败：{msg}',{msg:e.message}));
    collabSetState('error',L('生成邀请失败：{msg}',{msg:e.message}),'error');
    toast(L('生成邀请失败：{msg}',{msg:e.message}),'error');
    collabStopAll();
  }
}
async function collabAcceptSignal(){
  const raw=String($('collabSignalIn')?.value||'').trim();
  if(!raw){ toast(L('请粘贴对方信令'),'warn'); return; }
  let parsed;
  try{ parsed=collabInviteDecode(raw); }
  catch(e){
    collabRecordError(L('邀请串无效：{msg}',{msg:e.message}));
    collabSetState('error',L('邀请串无效：{msg}',{msg:e.message}),'error');
    toast(L('邀请串无效：{msg}',{msg:e.message}),'error');
    return;
  }
  try{
    const hasOffer=!!(collabPC&&collabPC.localDescription&&collabPC.localDescription.type==='offer');
    const isAnswer=parsed.tagged?parsed.kind==='answer':hasOffer;
    if(hasOffer){
      if(!isAnswer) throw new Error(L('请粘贴对方的应答邀请串'));
      collabSetState('connecting',L('已应用应答，正在建立连接…'));
      await collabPC.setRemoteDescription({type:'answer',sdp:parsed.sdp});
      return;
    }
    if(collabPC&&collabPC.localDescription&&collabPC.localDescription.type==='answer'){
      toast(L('本机已生成应答，等待主机应用'),'warn');
      return;
    }
    if(parsed.tagged&&parsed.kind!=='offer') throw new Error(L('请粘贴主机的邀请串'));
    collabStopAll();
    const pc=collabNewPeer();
    pc.ondatachannel=e=>collabWireDC(e.channel);
    collabSetState('connecting',L('正在应用邀请…'));
    await pc.setRemoteDescription({type:'offer',sdp:parsed.sdp});
    const ans=await pc.createAnswer();
    await pc.setLocalDescription(ans);
    await collabWaitIce(pc);
    const invite=collabInviteEncode('answer',pc.localDescription.sdp);
    const out=$('collabSignalOut');
    if(out) out.value=invite;
    collabRenderInviteQR(invite);
    collabMode='webrtc'; collabActive=true; collabLastError='';
    collabSetState('waiting',L('应答已生成，请复制给主机'),'ok');
    collabRefreshUI();
  }catch(e){
    collabRecordError(L('应用信令失败：{msg}',{msg:e.message}));
    collabSetState('error',L('应用信令失败：{msg}',{msg:e.message}),'error');
    toast(L('应用信令失败：{msg}',{msg:e.message}),'error');
  }
}
async function collabCopySignal(){
  const el=$('collabSignalOut');
  const text=String(el?.value||'');
  if(!text) return toast(L('还没有可复制的信令'),'warn');
  try{ await navigator.clipboard.writeText(text); toast(L('已复制')); }
  catch(_){
    try{ el.focus(); el.select(); document.execCommand('copy'); toast(L('已复制')); }
    catch(e){ toast(L('复制失败，请手动选择文本'),'warn'); }
  }
}
/** 邀请二维码：内置编码器只有 42 字节，超限必须明说，绝不渲染不可扫的假码 */
function collabRenderInviteQR(text){
  const box=$('collabInviteQr');
  if(!box) return;
  const s=String(text||'');
  if(!s){ box.innerHTML=''; return; }
  const fit=collabQrFit(s);
  if(!fit.fits){
    box.innerHTML=`<div class="hint-text warn">${esc(L('邀请串'))} ${fit.bytes} ${esc(L('字节，超过内置二维码上限'))} ${fit.limit} ${esc(L('字节：请复制邀请串文本发送，未生成无效二维码。'))}</div>`;
    return;
  }
  try{ box.innerHTML=qrSvg(s,140); }
  catch(e){ box.innerHTML=`<div class="hint-text error">${esc(L('二维码生成失败：{msg}',{msg:e.message}))}</div>`; }
}

function openCollabPanel(){
  let stored='draft';
  try{ stored=localStorage.getItem('plotpin.collab.channel')||state.meta.projectId||'draft'; }catch(_){ stored=state.meta.projectId||'draft'; }
  openModal(L('实时协作'),
    modalBody`<div class="hint-text">${L('同一浏览器多标签页即时同步；跨设备可用 WebRTC 邀请串手动信令，无需服务器。')}</div>
     <div class="section" style="margin-top:8px"><h3>${L('本机标签页同步')}</h3>
       <div class="form-grid"><label>${L('频道名称')}</label><input id="collabChannel" value="${stored}"></div>
       <div class="form-actions"><button class="primary" id="collabLocalBtn">${L('启用本机同步')}</button>
       <button id="collabStopBtn">${L('断开')}</button></div>
     </div>
     <div class="section"><h3>${L('跨设备邀请（WebRTC）')}</h3>
       <div class="hint-text">${L('三步建连：① 主机生成邀请；② 客机粘贴邀请并生成应答；③ 主机粘贴应答完成连接。邀请串含本机网络地址，仅发给可信协作方；连接后对方可编辑当前工程。')}</div>
       <div class="form-actions">
         <button id="collabOfferBtn">${L('生成邀请（主机）')}</button>
         <button id="collabAcceptBtn">${L('应用邀请 / 生成应答')}</button>
         <button id="collabCopyBtn">${L('复制本机邀请串')}</button>
       </div>
       <div class="form-grid" style="margin-top:6px">
         <label>${L('本机邀请串（发给对方）')}</label><textarea id="collabSignalOut" readonly rows="4" style="width:100%;font-family:Consolas,monospace;font-size:11px"></textarea>
         <label>${L('对方邀请串（粘贴）')}</label><textarea id="collabSignalIn" rows="4" placeholder="${L('粘贴邀请串或原始 SDP')}" style="width:100%;font-family:Consolas,monospace;font-size:11px"></textarea>
       </div>
       <div id="collabInviteQr" style="margin-top:8px"></div>
     </div>
     <div class="hint-text">${L('底图图片与设备照片不通过实时通道传输；完整同步请用工程库合并或 JSON 导出。')}</div>
     <div id="collabPeers" class="hint-text">${L('尚未连接')}</div>
     <div id="collabStatus" class="hint-text">${collabLastStatus||L('尚未连接')}</div>
     <div id="collabConflictInfo" class="hint-text">${L('尚无冲突记录')}</div>`,
    [{text:L('关闭'),click:closeModal}]);
  $('collabLocalBtn').onclick=()=>{
    if(collabMode==='local'&&collabActive) collabStopAll();
    else collabStartLocal($('collabChannel').value||'draft');
  };
  $('collabStopBtn').onclick=()=>collabStopAll();
  $('collabOfferBtn').onclick=()=>collabCreateOffer();
  $('collabAcceptBtn').onclick=()=>collabAcceptSignal();
  $('collabCopyBtn').onclick=()=>collabCopySignal();
  collabRefreshUI();
}

$('collabBtn').onclick=openCollabPanel;
