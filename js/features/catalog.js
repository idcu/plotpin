/* catalog.js —— 产品目录校验/存储与导入导出 */
const CATALOG_SCHEMA='plotpin-catalog/v1',CATALOG_KEY='catalog:current';
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
async function catalogLoad(){try{const r=await idbGetKey(CATALOG_KEY);if(r)currentCatalog=catalogValidate(r)}catch(_){currentCatalog=null}return currentCatalog}
async function importCatalog(raw,save){const c=catalogValidate(raw);await(save||(x=>idbPutKey(CATALOG_KEY,x)))(c);currentCatalog=c;return c}
function roundMoney(n){return Math.round(n*100)/100}
function exportCatalogJSON(){
  if(!currentCatalog)return toast('未载入目录','warn');
  downloadBlob(new Blob([JSON.stringify(currentCatalog,null,2)],{type:'application/json'}),safeName()+'-产品目录.json');
  toast('目录已导出','success');
}
async function deleteCatalog(){
  if(!currentCatalog)return toast('未载入目录','warn');
  if(!confirm('删除目录？BOM 降级为名称/数量。'))return;
  try{await idbDeleteKey(CATALOG_KEY);currentCatalog=null;toast('目录已删除','success');renderProps()}catch(e){toast('删除失败：'+e.message,'error')}
}
