/* collab.js —— 实时协作：本机多标签 BroadcastChannel + 跨设备 WebRTC 手动信令（无服务器） */
const COLLAB_CHUNK=48000, COLLAB_MAX=8*1024*1024, COLLAB_PREFIX='plotpin-collab-';
const collabPeerId='U'+Math.random().toString(36).slice(2,8).toUpperCase();
let collabBC=null, collabPC=null, collabDC=null, collabMode=null, collabActive=false;
let collabTimer=null, collabApplyChain=Promise.resolve(), collabLastStatus='', collabLastError='';
const collabPeers=new Map();
const collabInbound=new Map();

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

function collabTransportReady(){
  return !!(collabBC||(collabDC&&collabDC.readyState==='open'));
}
function collabSendRaw(data,to='*'){
  if(collabBC){ collabBC.postMessage(data); return true; }
  if(collabDC&&collabDC.readyState==='open'){ collabDC.send(data); return true; }
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
  chunks.forEach((data,i)=>collabSendRaw(JSON.stringify({t:'chunk',id,sender:collabPeerId,to:to||'*',total:chunks.length,seq:i,data})));
  return true;
}
function collabReceiveRaw(raw){
  let m;
  try{ m=typeof raw==='string'?JSON.parse(raw):raw; }catch(_){ return; }
  if(!m||typeof m!=='object'||m.t!=='chunk') return;
  if(m.sender===collabPeerId) return;
  if(m.to&&m.to!=='*'&&m.to!==collabPeerId) return;
  const total=Number(m.total), seq=Number(m.seq);
  if(!(total>0&&total<=400)||!(seq>=0&&seq<total)) return;
  const key=m.sender+':'+m.id;
  let buf=collabInbound.get(key);
  if(!buf){ buf={total,parts:new Array(total),size:0}; collabInbound.set(key,buf); }
  if(buf.total!==total||buf.parts[seq]!==undefined) return;
  buf.parts[seq]=String(m.data||''); buf.size+=buf.parts[seq].length;
  if(buf.size>COLLAB_MAX){ collabInbound.delete(key); return; }
  if(!buf.parts.every(p=>p!==undefined)) return;
  collabInbound.delete(key);
  let msg;
  try{ msg=JSON.parse(buf.parts.join('')); }catch(_){ return; }
  collabHandleMessage(msg,m.sender);
}
function collabHandleMessage(msg,from){
  if(!msg) return;
  if(msg.t==='hello'){
    collabPeers.set(from,msg.name||from);
    collabSendObject({t:'hello-ack',name:collabPeerId},from);
    collabSendObject({t:'snapshot',project:persistableState()},from);
    collabSetStatus(L('已连接对端')+'：'+(msg.name||from));
    collabRefreshUI();
    return;
  }
  if(msg.t==='hello-ack'){
    collabPeers.set(from,msg.name||from);
    collabSetStatus(L('已连接对端')+'：'+(msg.name||from));
    collabRefreshUI();
    return;
  }
  if(msg.t==='bye'){
    collabPeers.delete(from);
    collabSetStatus(L('对端已断开'));
    collabRefreshUI();
    return;
  }
  if(msg.t==='snapshot'&&msg.project&&msg.project.schema===SCHEMA){
    collabQueueApply(msg.project,from);
  }
}
function collabQueueApply(raw,from){
  collabApplyChain=collabApplyChain.then(async()=>{
    try{
      const stats=await mergeProjectJSON(raw,{history:false});
      const changed=stats.added||stats.updated||stats.deleted||stats.floorsAdded;
      if(changed) collabSetStatus(`${L('已同步')}：+${stats.added} ~${stats.updated} -${stats.deleted}（${from}）`);
    }catch(e){ collabSetStatus(L('同步失败：')+e.message,'error'); }
  });
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

function collabSetStatus(text,type=''){
  collabLastStatus=text||'';
  if(type==='error'){ collabLastError=collabLastStatus; try{ window.__collabLastError=collabLastError; }catch(_){} }
  const el=$('collabStatus');
  if(el){ el.textContent=collabLastStatus; el.className='hint-text'+(type?' '+type:''); }
}
function collabRefreshUI(){
  const b=$('collabLocalBtn');
  if(b) b.textContent=collabMode==='local'&&collabActive?L('停用本机同步'):L('启用本机同步');
  const el=$('collabStatus');
  if(el){ el.textContent=collabLastStatus; }
}
function collabStopAll(){
  clearTimeout(collabTimer); collabTimer=null;
  try{ if(collabDC){ collabDC.onclose=null; collabDC.close(); } }catch(_){}
  try{ if(collabPC) collabPC.close(); }catch(_){}
  try{ if(collabBC) collabBC.close(); }catch(_){}
  collabDC=null; collabPC=null; collabBC=null; collabMode=null; collabActive=false;
  collabPeers.clear(); collabInbound.clear();
  collabSetStatus(L('已断开'));
  collabRefreshUI();
}
function collabStartLocal(name){
  if(typeof BroadcastChannel!=='function'){
    toast(L('当前环境不支持 BroadcastChannel，请使用跨设备直连或工程 JSON 合并'),'error');
    return false;
  }
  collabStopAll();
  const channel=COLLAB_PREFIX+String(name||'draft').trim().slice(0,60);
  try{ collabBC=new BroadcastChannel(channel); }
  catch(e){ toast(L('启用本机同步失败：')+e.message,'error'); collabStopAll(); return false; }
  collabBC.onmessage=e=>collabReceiveRaw(e.data);
  collabMode='local'; collabActive=true;
  collabSetStatus(L('本机同步已启用')+'（'+channel+'）','ok');
  try{ localStorage.setItem('plotpin.collab.channel',String(name||'draft')); }catch(_){}
  collabSendObject({t:'hello',name:collabPeerId});
  collabRefreshUI();
  return true;
}

function collabNewPeer(){
  const pc=new RTCPeerConnection({iceServers:[]});
  collabPC=pc;
  pc.onconnectionstatechange=()=>{
    const st=pc.connectionState;
    if(st==='connected') collabSetStatus(L('已连接，开始实时同步'),'ok');
    else if(st==='failed'||st==='disconnected'||st==='closed') collabSetStatus(L('连接已断开'));
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
    collabSetStatus(L('已连接，开始实时同步'),'ok');
    collabSendObject({t:'hello',name:collabPeerId});
    collabSendObject({t:'snapshot',project:persistableState()});
    collabRefreshUI();
  };
  dc.onmessage=e=>collabReceiveRaw(e.data);
  dc.onclose=()=>{
    if(collabDC===dc) collabDC=null;
    collabActive=!!collabPC&&collabPC.connectionState==='connected';
    collabSetStatus(L('连接已断开'));
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
    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    await collabWaitIce(pc);
    $('collabSignalOut').value=collabCleanSDP(pc.localDescription.sdp);
    collabMode='webrtc'; collabActive=true; collabLastError='';
    collabSetStatus(L('邀请已生成：复制给客机，再把客机应答粘贴回来'),'ok');
    collabRefreshUI();
  }catch(e){ collabSetStatus(L('生成邀请失败：')+e.message,'error'); toast(L('生成邀请失败：')+e.message,'error'); collabStopAll(); }
}
async function collabAcceptSignal(){
  const sdp=String($('collabSignalIn')?.value||'').trim();
  if(!sdp){ toast(L('请粘贴对方信令'),'warn'); return; }
  try{
    if(collabPC&&collabPC.localDescription&&collabPC.localDescription.type==='offer'){
      await collabPC.setRemoteDescription({type:'answer',sdp:collabCleanSDP(sdp)});
      collabSetStatus(L('已应用应答，正在建立连接…'));
      return;
    }
    if(collabPC&&collabPC.localDescription&&collabPC.localDescription.type==='answer'){
      toast(L('本机已生成应答，等待主机应用'),'warn');
      return;
    }
    collabStopAll();
    const pc=collabNewPeer();
    pc.ondatachannel=e=>collabWireDC(e.channel);
    await pc.setRemoteDescription({type:'offer',sdp:collabCleanSDP(sdp)});
    const ans=await pc.createAnswer();
    await pc.setLocalDescription(ans);
    await collabWaitIce(pc);
    $('collabSignalOut').value=collabCleanSDP(pc.localDescription.sdp);
    collabMode='webrtc'; collabActive=true; collabLastError='';
    collabSetStatus(L('应答已生成：复制给主机'),'ok');
    collabRefreshUI();
  }catch(e){ collabSetStatus(L('应用信令失败：')+e.message,'error'); toast(L('应用信令失败：')+e.message,'error'); }
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
function openCollabPanel(){
  let stored='draft';
  try{ stored=localStorage.getItem('plotpin.collab.channel')||state.meta.projectId||'draft'; }catch(_){ stored=state.meta.projectId||'draft'; }
  openModal(L('实时协作'),
    `<div class="hint-text">${esc(L('同一浏览器多标签页即时同步；跨设备可用 WebRTC 手动信令，无需服务器。'))}</div>
     <div class="section" style="margin-top:8px"><h3>${esc(L('本机标签页同步'))}</h3>
       <div class="form-grid"><label>${esc(L('频道名称'))}</label><input id="collabChannel" value="${esc(stored)}"></div>
       <div class="form-actions"><button class="primary" id="collabLocalBtn">${esc(L('启用本机同步'))}</button>
       <button id="collabStopBtn">${esc(L('断开'))}</button></div>
     </div>
     <div class="section"><h3>${esc(L('跨设备直连（WebRTC）'))}</h3>
       <div class="hint-text">${esc(L('主机生成邀请 → 客机粘贴后生成应答 → 主机把应答粘贴回来。SDP 含本机网络地址，仅发给可信协作方；连接后对方可编辑当前工程。'))}</div>
       <div class="form-actions">
         <button id="collabOfferBtn">${esc(L('生成邀请（主机）'))}</button>
         <button id="collabAcceptBtn">${esc(L('应用对方信令 / 生成应答'))}</button>
         <button id="collabCopyBtn">${esc(L('复制本机信令'))}</button>
       </div>
       <div class="form-grid" style="margin-top:6px">
         <label>${esc(L('本机信令（发给对方）'))}</label><textarea id="collabSignalOut" readonly rows="4" style="width:100%;font-family:Consolas,monospace;font-size:11px"></textarea>
         <label>${esc(L('对方信令（粘贴）'))}</label><textarea id="collabSignalIn" rows="4" placeholder="${esc(L('粘贴邀请或应答 SDP'))}" style="width:100%;font-family:Consolas,monospace;font-size:11px"></textarea>
       </div>
     </div>
     <div class="hint-text">${esc(L('底图图片与设备照片不通过实时通道传输；完整同步请用工程库合并或 JSON 导出。'))}</div>
     <div id="collabStatus" class="hint-text">${esc(collabLastStatus||L('尚未连接'))}</div>`,
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
