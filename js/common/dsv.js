/* dsv.js —— CSV/TSV 等分隔文本解析（零依赖，支持引号转义/引号内换行/BOM/自动探测）
 * 借鉴 qforge/js/importers/csv-importer.js，可独立复用。 */
(function (global) {
  'use strict';
/* ---- CSV / TSV：原生状态机（引号转义、引号内换行、BOM） ---- */
function parseRows(text,delimiter){
  if(text.charCodeAt(0)===0xfeff) text=text.slice(1);
  const rows=[]; let row=[], field='', inQuotes=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(inQuotes){
      if(c==='"'){ if(text[i+1]==='"'){ field+='"'; i++; } else inQuotes=false; }
      else field+=c;
    }else if(c==='"') inQuotes=true;
    else if(c===delimiter){ row.push(field); field=''; }
    else if(c==='\n'){ row.push(field); rows.push(row); row=[]; field=''; }
    else if(c!=='\r') field+=c;
  }
  if(field!==''||row.length){ row.push(field); rows.push(row); }
  return rows;
}
function detectDelimiter(text){
  const firstLine=text.split(/\r?\n/)[0]||'';
  const commas=(firstLine.match(/,/g)||[]).length, tabs=(firstLine.match(/\t/g)||[]).length, semis=(firstLine.match(/;/g)||[]).length;
  if(tabs>commas&&tabs>=semis) return '\t';
  if(semis>commas) return ';';
  return ',';
}
  global.DSV = { parseRows: parseRows, detectDelimiter: detectDelimiter };
})(typeof window !== 'undefined' ? window : globalThis);
