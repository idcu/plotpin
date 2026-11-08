/* catalog.js —— 产品目录校验/存储与导入导出 */
const CATALOG_SCHEMA='plotpin-catalog/v1',CATALOG_KEY='catalog:current',QUOTE_SNAPSHOT_KEY='quote:last';
let currentCatalog=null;
function catalogValidate(r){
  if(!r||typeof r!=='object'||Array.isArray(r))throw Error('目录根对象非法');
  if(r.schema!==CATALOG_SCHEMA)throw Error('schema 须为 '+CATALOG_SCHEMA);
  if(!Array.isArray(r.items)||!r.items.length)throw Error('items 须非空');
  if(r.items.length>2000)throw Error('型号数超过上限 2000');
  const seen=new Set(),items=r.items.map((it,i)=>{
    const at='第'+(i+1)+'项';
    if(!it||typeof it!=='object')throw Error(at+'非对象');
    const vendor=String(it.vendor??'').trim(),model=String(it.model??'').trim(),price=Number(it.price),params=it.params;
    if(!vendor||!model)throw Error(at+'厂商/型号缺');
    if(!Number.isFinite(price)||price<0||price>1e9)throw Error(at+'单价非法');
    if(params!==undefined&&(!params||typeof params!=='object'||Array.isArray(params)))throw Error(at+'params 须为对象');
    const key=vendor+'\u0001'+model;
    if(seen.has(key))throw Error(at+'厂商型号重复');
    seen.add(key);
    return {vendor,model,category:String(it.category||'其他').slice(0,40),unit:String(it.unit||'台').slice(0,10),price,params:params||{}};
  });
  return {schema:CATALOG_SCHEMA,items};
}
let catalogLoadError='';
/* IO-P2-22：损坏记录不覆盖已载入目录、也不静默吞掉——保留原因供启动提示（IDB 不可用属降级路径，不算损坏） */
async function catalogLoad(){
  let r;
  try{ r=await idbGetKey(CATALOG_KEY); }catch(_){ return currentCatalog; }
  if(!r){ catalogLoadError=''; return currentCatalog; }
  try{ currentCatalog=catalogValidate(r); catalogLoadError=''; }
  catch(e){ catalogLoadError=String((e&&e.message)||''); }
  return currentCatalog;
}
async function importCatalog(raw,save){const c=catalogValidate(raw);await(save||(x=>idbPutKey(CATALOG_KEY,x)))(c);currentCatalog=c;return c}
function roundMoney(n){return Math.round(n*100)/100}
/* 目录版本：内容指纹（FNV-1a 32 位），用于报价快照追溯 */
function catalogVersion(cat){
  const items=(cat&&cat.items)||[];
  if(!items.length)return 'none';
  const s=JSON.stringify(items);
  let h=2166136261;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
  return 'c'+((h>>>0).toString(16).padStart(8,'0'));
}
function exportCatalogJSON(){
  if(!currentCatalog)return toast('未载入目录','warn');
  downloadBlob(new Blob([JSON.stringify(currentCatalog,null,2)],{type:'application/json'}),safeName()+'-产品目录.json');
  toast('目录已导出','success');
}
async function deleteCatalog(){
  if(!currentCatalog)return toast('未载入目录','warn');
  if(!confirm(L('删除目录？BOM 降级为名称/数量。')))return;
  try{await idbDeleteKey(CATALOG_KEY);currentCatalog=null;toast('目录已删除','success');renderProps()}catch(e){toast(L('删除失败：{msg}',{msg:e.message}),'error')}
}
