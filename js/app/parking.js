/* parking.js —— 停车规划：按场地范围自动排布双面垂直车位与通道（纯布局函数 + 弹窗） */
const PARKING_LAYER='layer.parking';

/**
 * 纯布局：在矩形场地内生成双面垂直停车位与两侧共用通道。
 * 坐标系：场地 (siteX,siteY,siteW,siteH)；orientation='x' 沿场地 X 轴排列，'y' 整体旋转 90°。
 * 返回 error 为不可排布原因码，warnings 为规范提示码；对象矩形以旋转前左下角为基点（与 rect 模型一致）。
 * @param {Object} cfg
 * @returns {{error:string|null,warnings:string[],stalls:Array<{x:number,y:number,width:number,height:number,angle:number}>,aisles:Array<{x:number,y:number,width:number,height:number,angle:number}>,stats:Object,orientation:string}}
 */
function parkingLayout(cfg){
  const num=(v,fb)=>Number.isFinite(Number(v))?Number(v):fb;
  const siteX=num(cfg.siteX,0), siteY=num(cfg.siteY,0);
  const siteW=num(cfg.siteW,0), siteH=num(cfg.siteH,0);
  const stallWidth=num(cfg.stallWidth,2.5), stallDepth=num(cfg.stallDepth,5.3);
  const aisleWidth=num(cfg.aisleWidth,6), margin=num(cfg.margin,1);
  const orientation=cfg.orientation==='y'?'y':'x';
  const empty={stallCount:0,aisleCount:0,stallArea:0,aisleArea:0,siteArea:siteW*siteH,stallRatio:0,totalRatio:0,perRow:0,modules:0,usedW:0,usedD:0,remainderW:0,remainderD:0};
  const fail=(error,warnings=[])=>({error,warnings,stalls:[],aisles:[],stats:empty,orientation});
  if(!(siteW>0)||!(siteH>0)||!(stallWidth>0)||!(stallDepth>0)||!(aisleWidth>0)||margin<0) return fail('invalid');
  const warnings=[];
  if(aisleWidth<2.5) return fail('aisleTooSmall',warnings);
  if(aisleWidth<5) warnings.push('aisleNarrow');
  if(stallWidth<2.4) warnings.push('stallWidthSmall');
  if(stallDepth<5) warnings.push('stallDepthSmall');
  if(margin<.3) warnings.push('marginSmall');
  const swap=orientation==='y';
  const localW=swap?siteH:siteW, localH=swap?siteW:siteH;
  const usableW=localW-2*margin, usableH=localH-2*margin;
  const moduleD=2*stallDepth+aisleWidth;
  if(usableW<stallWidth||usableH<moduleD) return fail('siteTooSmall',warnings);
  const perRow=Math.floor(usableW/stallWidth+1e-9);
  const modules=Math.floor(usableH/moduleD+1e-9);
  if(perRow<1||modules<1) return fail('siteTooSmall',warnings);
  const usedW=perRow*stallWidth, usedD=modules*moduleD;
  const u0=margin+(usableW-usedW)/2;
  const v0=margin+(usableH-usedD)/2;
  const mapRect=(u,v,w,h)=>swap
    ?{x:siteX+v,y:siteY+(localW-u-w),width:w,height:h,angle:90}
    :{x:siteX+u,y:siteY+v,width:w,height:h,angle:0};
  const stalls=[], aisles=[];
  for(let i=0;i<modules;i++){
    const baseV=v0+i*moduleD;
    aisles.push(mapRect(u0,baseV+stallDepth,usedW,aisleWidth));
    for(let j=0;j<perRow;j++){
      const u=u0+j*stallWidth;
      stalls.push(mapRect(u,baseV,stallWidth,stallDepth));
      stalls.push(mapRect(u,baseV+stallDepth+aisleWidth,stallWidth,stallDepth));
    }
  }
  const stallArea=stalls.length*stallWidth*stallDepth;
  const aisleArea=aisles.length*usedW*aisleWidth;
  const siteArea=siteW*siteH;
  return {
    error:null, warnings, stalls, aisles, orientation,
    stats:{stallCount:stalls.length,aisleCount:aisles.length,stallArea,aisleArea,siteArea,
      stallRatio:siteArea?stallArea/siteArea:0,totalRatio:siteArea?(stallArea+aisleArea)/siteArea:0,
      perRow,modules,usedW,usedD,remainderW:usableW-usedW,remainderD:usableH-usedD}
  };
}

function parkingWarningText(code){
  return L(({
    invalid:'尺寸无效，请填写正数',
    aisleTooSmall:'通道净宽不足 2.5 m，无法生成停车位',
    aisleNarrow:'通道净宽偏小（建议 5.5–6.0 m）',
    stallWidthSmall:'车位宽度偏小（建议 ≥ 2.4 m）',
    stallDepthSmall:'车位深度偏小（建议 ≥ 5.0 m）',
    marginSmall:'场地边距偏小（建议 ≥ 0.3 m）',
    siteTooSmall:'当前场地不足以排下完整车位与通道'
  })[code]||code);
}

function parkingOptionsFromInputs(){
  return {
    siteX:parkingSite().x, siteY:parkingSite().y, siteW:parkingSite().w, siteH:parkingSite().h,
    stallWidth:Number($('parkingStallW').value),
    stallDepth:Number($('parkingStallD').value),
    aisleWidth:Number($('parkingAisle').value),
    margin:Number($('parkingMargin').value),
    orientation:$('parkingOrient').value
  };
}
function parkingSite(){
  const d=worldDims();
  return {x:d.minX,y:d.minY,w:d.w,h:d.h};
}

function parkingPreviewHTML(res){
  if(res.error) return `<div class="issue">${esc(parkingWarningText(res.error))}</div>`;
  const s=res.stats;
  const warn=res.warnings.length?`<div class="issue">${res.warnings.map(w=>esc(parkingWarningText(w))).join('<br>')}</div>`:'';
  return `<div class="ok-banner">${esc(L('可排布'))} <b>${s.perRow}</b> ${esc(L('个/排'))} × <b>${s.modules}</b> ${esc(L('排（双面）'))} = <b>${s.stallCount}</b> ${esc(L('个车位'))}，<b>${s.aisleCount}</b> ${esc(L('条通道'))}</div>
    <div class="kv-list" style="margin-top:8px">
      <span>${esc(L('车位面积'))}</span><b>${fmt(s.stallArea)} ㎡（${(s.stallRatio*100).toFixed(1)}%）</b>
      <span>${esc(L('含通道利用'))}</span><b>${fmt(s.stallArea+s.aisleArea)} ㎡（${(s.totalRatio*100).toFixed(1)}%）</b>
      <span>${esc(L('剩余边角'))}</span><b>${fmt(s.remainderW)} × ${fmt(s.remainderD)} m</b>
    </div>${warn}`;
}

function openParkingPlanner(){
  const site=parkingSite();
  const T=L;
  openModal(T('停车规划'),
    `<div class="hint-text" style="margin-bottom:8px">${esc(L('当前场地：'))}${fmt(site.w)} × ${fmt(site.h)} m ｜ ${esc(L('自动排布双面垂直车位；通道两侧共用，靠背车位连续排布。'))}</div>
     <div class="form-grid">
       <label>${esc(L('车位宽度 (m)'))}</label><input id="parkingStallW" type="number" min="1.8" step="0.1" value="2.5">
       <label>${esc(L('车位深度 (m)'))}</label><input id="parkingStallD" type="number" min="3" step="0.1" value="5.3">
       <label>${esc(L('通道宽度 (m)'))}</label><input id="parkingAisle" type="number" min="2" step="0.1" value="6">
       <label>${esc(L('场地边距 (m)'))}</label><input id="parkingMargin" type="number" min="0" step="0.1" value="1">
       <label>${esc(L('排列方向'))}</label><select id="parkingOrient">
         <option value="x">${esc(L('沿场地长边'))}</option><option value="y">${esc(L('沿场地短边'))}</option>
       </select>
     </div>
     <label class="hint-text" style="display:block;margin:8px 0"><input type="checkbox" id="parkingClear" checked> ${esc(L('先清除「停车场」图层已有对象'))}</label>
     <div id="parkingPreview" class="section" style="margin:6px 0 0"></div>`,
    [{text:L('取消'),click:closeModal},{text:L('生成车位'),class:'primary',click:applyParkingLayout}]);
  const refresh=()=>{ $('parkingPreview').innerHTML=parkingPreviewHTML(parkingLayout(parkingOptionsFromInputs())); };
  ['parkingStallW','parkingStallD','parkingAisle','parkingMargin','parkingOrient'].forEach(id=>{
    $(id).addEventListener('input',refresh); $(id).addEventListener('change',refresh);
  });
  refresh();
}

function ensureParkingLayer(){
  let layer=state.layers.find(l=>l.id===PARKING_LAYER);
  if(!layer){ layer={id:PARKING_LAYER,name:L('停车场'),visible:true,locked:false}; state.layers.push(layer); }
  return layer;
}

function applyParkingLayout(){
  const res=parkingLayout(parkingOptionsFromInputs());
  if(res.error){ toast(parkingWarningText(res.error),'error'); return; }
  if(!res.stalls.length){ toast(L('没有可生成的车位'),'warn'); return; }
  pushHistory();
  const layer=ensureParkingLayer();
  if($('parkingClear') && $('parkingClear').checked){
    state.objects.filter(o=>o.layerId===layer.id).forEach(o=>markTombstone(o.id,'object'));
    state.objects=state.objects.filter(o=>o.layerId!==layer.id);
  }
  const used=new Set(state.objects.map(o=>o.name));
  (state.floors||[]).forEach(f=>{ if(f.id!==state.activeFloorId) (f.objects||[]).forEach(o=>{ if(o&&o.name) used.add(o.name); }); });
  let pSeq=0,aSeq=0;
  const fresh=(prefix,seq)=>{ let n=seq,name; do{ n++; name=prefix+String(n).padStart(3,'0'); }while(used.has(name)); used.add(name); return {name,n}; };
  res.stalls.forEach((s,i)=>{
    const nm=fresh('P',pSeq); pSeq=nm.n;
    state.objects.push(baseObject('rect','rect.parking',{name:nm.name,layerId:layer.id,x:s.x,y:s.y,width:s.width,height:s.height,angle:s.angle,props:{parkingSlot:i+1}}));
  });
  res.aisles.forEach((a,i)=>{
    const nm=fresh('A',aSeq); aSeq=nm.n;
    state.objects.push(baseObject('rect','rect.aisle',{name:nm.name,layerId:layer.id,x:a.x,y:a.y,width:a.width,height:a.height,angle:a.angle,props:{parkingAisle:i+1}}));
  });
  selectedIds.clear();
  commitChange(`${L('已生成')} ${res.stats.stallCount} ${L('个车位')}、${res.stats.aisleCount} ${L('条通道')}（${L('停车场')}）`);
  closeModal();
}

$('parkingBtn').onclick=openParkingPlanner;
