/* pdf-read.js —— PDF 读取：容器解析委托 @idcu/format-pdf，内容流→绘图对象/底图语义留在本项目
 * 能力：
 *  - 对象/xref 扫描、FlateDecode 解压（浏览器 DecompressionStream，zlib/deflate-raw 双兜底）
 *  - 内容流算子：m/l/c/v/y/re/h/S/f/b/q/cm + 文本 BT..ET（Tj/TJ/Tm/Td/Tf）
 *  - 内嵌图像：DCTDecode 直接取 JPEG；FlateDecode 原始像素重组为 PNG（RGB/灰度，PNG 预测器）
 * 不支持：嵌入字体 CID 文本解码（疑似乱码自动丢弃）、CMYK/LZW、压缩对象流（CAD 打印 PDF 通常不涉及）
 * 坐标：PDF 点（1/72 英寸，Y 向上），输出已按 MediaBox 左下角归零，与内部世界坐标朝向一致 */
(function (global) {
  'use strict';

const __pdf=globalThis.__idcuPdf;
if(!__pdf) throw new Error('pdf-read.js：缺少 @idcu/format-pdf，请检查 index.html 脚本顺序');
const PT_TO_METER=__pdf.PT_TO_METER;
/* 读取上限：防止畸形/超大 PDF 与解压炸弹耗尽内存（测试可传入更小的 opt） */
const PDF_LIMITS=__pdf.PDF_LIMITS;

function binaryToBytes(s){ return __pdf.binaryToBytes(s); }

/* ---------------- Flate 解压（zlib 头优先，失败退 deflate-raw 去头） ---------------- */
async function inflate(bytes){
  if(typeof DecompressionStream==='undefined') throw new Error('当前浏览器不支持 DecompressionStream，无法读取该 PDF');
  const tryStream=(data,format)=>new Promise((resolve,reject)=>{
    try{
      const st=new Blob([data]).stream().pipeThrough(new DecompressionStream(format));
      new Response(st).arrayBuffer().then(b=>{
        if(b.byteLength>PDF_LIMITS.maxInflateBytes)
          return reject(new Error('PDF 内嵌流解压后超过 '+(PDF_LIMITS.maxInflateBytes/1048576)+'MB 上限，疑似解压炸弹'));
        resolve(new Uint8Array(b));
      }).catch(reject);
    }catch(e){ reject(e); }
  });
  try{ return await tryStream(bytes,'deflate'); }catch(e){
    const raw=bytes.subarray(2,bytes.length-4);   /* 去 zlib 头与 adler32 */
    return tryStream(raw,'deflate-raw');
  }
}

/* ---------------- 字典小工具（委托模块） ---------------- */
function dictName(dict,name){ return __pdf.dictName(dict,name); }
function dictNumber(dict,name){ return __pdf.dictNumber(dict,name); }
/* /Name 后可能是直接字典，也可能是间接引用；数组同理。这里取内容字符串（内联）或解析引用 */
function dictRawBlock(dict,name){ return __pdf.dictRawBlock(dict,name); }

/* ---------------- 内容流词法分析 ---------------- */
function tokenizeContent(str){ return __pdf.tokenizeContent(str); }
/* 2x3 仿射矩阵 */
function mulCTM(m,cm){
  const [a,b,c,d,e,f]=m,[A,B,C,D,E,F]=cm;
  return [a*A+c*B, b*A+d*B, a*C+c*D, b*C+d*D, a*E+c*F+e, b*E+d*F+f];
}
const ID=[1,0,0,1,0,0];
function applyCTM(m,p){ return [m[0]*p[0]+m[2]*p[1]+m[4], m[1]*p[0]+m[3]*p[1]+m[5]]; }

function looksLikeCidGarbage(s){
  if(!s) return true;
  let bad=0,hasAscii=0;
  for(let i=0;i<s.length;i++){
    const c=s.charCodeAt(i);
    if(c<32&&s[i]!=='\n'&&s[i]!=='\t') bad++;
    else if(c<127) hasAscii++;
    else bad++;
  }
  /* 几乎全是非拉丁/控制字符，按嵌入 CID 字体无法解码处理 */
  return s.length>1 && hasAscii/s.length<0.55;
}

function interpretContent(str){
  const toks=tokenizeContent(str);
  const paths=[];
  const stack=[];
  const ctmStack=[];
  let m=ID;
  let sub=null;                 /* {pts:[],closed:false} */
  let cur=null;
  const tx=p=>applyCTM(m,p);
  const begin=x=>{ if(!sub) sub={pts:[x],closed:false}; };
  const line=x=>{ if(sub) sub.pts.push(x); };
  const finish=(filled)=>{
    if(sub && sub.pts.length>=2){ paths.push({points:sub.pts,closed:!!(filled||sub.closed),filled:!!filled}); }
    sub=null;
  };
  for(let i=0;i<toks.length;i++){
    const tk=toks[i];
    if(tk.t!=='op'){ stack.push(tk); continue; }
    const op=tk.v, nums=()=>{ const a=[]; let k=stack.length;
      while(k>0 && stack[k-1].t==='num'){ a.unshift(stack[k-1].v); k--; } stack.length=k; return a; };
    if(op==='q'){ ctmStack.push(m); }
    else if(op==='Q'){ m=ctmStack.pop()||ID; }
    else if(op==='cm'){ const a=nums(); m=mulCTM(m,[a[0],a[1],a[2],a[3],a[4],a[5]]); }
    else if(op==='m'){ const a=nums(); finish(false); cur=tx([a[0],a[1]]); begin(cur); }
    else if(op==='l'){ const a=nums(); line(tx([a[0],a[1]])); }
    else if(op==='c'||op==='v'||op==='y'){
      const a=nums(); let p1,p2,p3;
      if(op==='c'){ p1=[a[0],a[1]]; p2=[a[2],a[3]]; p3=[a[4],a[5]]; }
      else if(op==='v'){ p1=cur; p2=[a[0],a[1]]; p3=[a[2],a[3]]; }
      else { p1=[a[0],a[1]]; p2=p1; p3=[a[2],a[3]]; }
      if(!sub||!cur) continue;
      const N=8;
      for(let k=1;k<=N;k++){
        const t=k/N, u=1-t;
        const x=u*u*u*cur[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0];
        const y=u*u*u*cur[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1];
        line(tx([x,y]));
      }
      cur=tx(p3);
    }
    else if(op==='re'){ const a=nums(); finish(false); const [x,y,w,h]=a;
      const q=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
      sub={pts:q.map(tx),closed:true}; cur=tx([x,y]); }
    else if(op==='h'){ if(sub){ sub.closed=true; cur=sub.pts[0]; } }
    else if(op==='S'||op==='s'){ finish(false); }
    else if(op==='f'||op==='F'||op==='f*'||op==='B'||op==='B*'||op==='b'||op==='b*'){ finish(true); }
    else if(op==='n'){ sub=null; }
    /* BT..ET 文本在 collectTJ 中单独扫描，主循环不处理栈上字符串 */
  }
  const texts=collectTJ(str);
  /* 去重近重复文本（Tj 与 TJ 可能提取到同一串） */
  const seen=new Set(); const finalTexts=[];
  for(const t of texts){
    const key=t.text+'@'+t.x.toFixed(1)+','+t.y.toFixed(1);
    if(seen.has(key)) continue; seen.add(key); finalTexts.push(t);
  }
  /* 合并过近的重复点（不同子路径拼接处的浮点缝隙） */
  const finalPaths=paths.map(p=>{
    const out=[p.points[0]];
    for(let k=1;k<p.points.length;k++){
      const q=p.points[k], last=out[out.length-1];
      if(Math.hypot(q[0]-last[0],q[1]-last[1])>0.01) out.push(q);
    }
    return {points:out,closed:p.closed,filled:p.filled};
  }).filter(p=>p.points.length>=2);
  return {paths:finalPaths,texts:finalTexts};
}
/* BT..ET 区间提取 Tj/TJ 文本（定位取最近 Tm；PDF 内嵌标准字体的拉丁字符可解，CID 字体丢弃） */
function collectTJ(content){
  const out=[];
  const re2=/BT([\s\S]*?)ET/g; let mm;
  while((mm=re2.exec(content))){
    const body=mm[1];
    let mat=ID, fs=1, dx=0, dy=0;
    const tmM=body.match(/([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm/);
    if(tmM) mat=tmM.slice(1,7).map(Number);
    const fsM=body.match(/\/[A-Za-z0-9_+\-.]+\s+([-\d.]+)\s+Tf/);
    if(fsM) fs=parseFloat(fsM[1]);
    /* Td/TD 为相对换行/定位，累积到当前文本原点；TD 带前导 -a*h 行距项，简单按后两数处理 */
    let tdm; const tdRe=/(-?[\d.]+)\s+(-?[\d.]+)\s+T[dD]/g;
    while((tdm=tdRe.exec(body))){ dx+=parseFloat(tdm[1]); dy+=parseFloat(tdm[2]); }
    const parts=[];
    const strRe=/\(((?:[^()\\]|\\.)*)\)\s*Tj|\[([\s\S]*?)\]\s*TJ/g;
    let sm;
    while((sm=strRe.exec(body))){
      if(sm[1]!==undefined) parts.push(unescapePdfString(sm[1]));
      else {
        const inner=sm[2]; let t='';
        const r3=/\(((?:[^()\\]|\\.)*)\)/g;
          let qm;
          while((qm=r3.exec(inner))) t+=unescapePdfString(qm[1]);
        parts.push(t);
      }
    }
    const text=parts.join('').replace(/\s+/g,' ').trim();
    if(text&&!looksLikeCidGarbage(text)) out.push({x:mat[4]+dx,y:mat[5]+dy,size:fs,text});
  }
  return out;
}
function unescapePdfString(s){
  return s.replace(/\\([()\\])/g,'$1').replace(/\\n/g,'\n').replace(/\\r/g,'\r').replace(/\\t/g,'\t');
}

/* ---------------- Flate 栅格 → PNG ---------------- */
function paeth(a,b,c){ const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c); return pa<=pb&&pa<=pc?a:pb<=pc?b:c; }
function unfilterPngPredictors(raw,w,h,colors){
  const bpp=colors, rowLen=w*colors, stride=rowLen+1;
  const out=new Uint8Array(h*rowLen);
  const prior=new Uint8Array(rowLen);
  for(let r=0;r<h;r++){
    const off=r*stride, type=raw[off], row=raw.subarray(off+1,off+1+rowLen);
    const cur=new Uint8Array(rowLen);
    for(let i=0;i<rowLen;i++){
      const x=row[i]||0, left=i>=bpp?cur[i-bpp]:0, up=prior[i]||0, ul=i>=bpp?prior[i-bpp]:0;
      let v=x;
      if(type===1) v=x+left;
      else if(type===2) v=x+up;
      else if(type===3) v=x+((left+up)>>1);
      else if(type===4) v=x+paeth(left,up,ul);
      cur[i]=v&0xff;
    }
    cur.forEach((v,i)=>out[r*rowLen+i]=v);
    prior.set(cur);
  }
  return out;
}
function buildPng(w,h,rgb){
  const u8=(s)=>{const a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i)&0xff;return a;};
  const chunk=(type,data)=>{
    const len=new Uint8Array(4); new DataView(len.buffer).setUint32(0,data.length);
    const head=u8(type);
    const crcInput=new Uint8Array(head.length+data.length); crcInput.set(head); crcInput.set(data,head.length);
    const crc=new Uint8Array(4); new DataView(crc.buffer).setUint32(0,global.Zip.crc32(crcInput));
    const all=new Uint8Array(4+head.length+data.length+4);
    all.set(len); all.set(head,4); all.set(data,4+head.length); all.set(crc,4+head.length+data.length);
    return all;
  };
  const sig=u8('\x89PNG\r\n\x1a\n');
  const ihdr=new Uint8Array(13);
  const dv=new DataView(ihdr.buffer);
  dv.setUint32(0,w); dv.setUint32(4,h); ihdr[8]=8; ihdr[9]=2;  /* 8bit RGB */
  /* IDAT：每行前加 filter 0 字节 */
  const withFilter=new Uint8Array(h*(w*3+1));
  for(let r=0;r<h;r++){
    withFilter[r*(w*3+1)]=0;
    withFilter.set(rgb.subarray(r*w*3,(r+1)*w*3),r*(w*3+1)+1);
  }
  let pos=0; const parts=[sig,chunk('IHDR',ihdr),chunk('IDAT',withFilter),chunk('IEND',new Uint8Array(0))];
  const total=parts.reduce((s,p)=>s+p.length,0);
  const png=new Uint8Array(total);
  parts.forEach(p=>{ png.set(p,pos); pos+=p.length; });
  return png;
}

/* ---------------- 页序 / 多页落点 ---------------- */
/** 按文档页树顺序展开页面对象号：/Catalog → /Pages → /Kids 递归。
 *  容器层按对象编号扫描页对象，编号≠页序；此处在适配层恢复真实页序（不改 vendor）。 */
function pageTreeOrder(objects){
  const byNum=new Map();
  for(const [num,o] of objects||[]) byNum.set(num,o);
  let catalog=null;
  for(const [,o] of objects||[]){ if(/\/Type\s*\/Catalog/.test(o.dict)){ catalog=o; break; } }
  const out=[], seen=new Set();
  const walkRef=(num,depth)=>{
    if(depth>64||seen.has(num)) return;
    const o=byNum.get(num); if(!o) return;
    seen.add(num);
    if(/\/Type\s*\/Page(?!s)/.test(o.dict)){ out.push(num); return; }
    const kids=(o.dict.match(/\/Kids\s*\[([\s\S]*?)\]/)||[])[1];
    if(!kids) return;
    for(const m of kids.matchAll(/(\d+)\s+\d+\s*R/g)) walkRef(+m[1],depth+1);
  };
  const ref=catalog&&(catalog.dict.match(/\/Pages\s+(\d+)\s+\d+\s*R/)||[])[1];
  if(ref) walkRef(+ref,0);
  return out;
}
function pagesInDocumentOrder(parsed){
  const order=pageTreeOrder(parsed.objects);
  if(!order.length) return parsed.pages.slice();
  const byNum=new Map(parsed.pages.map(p=>[p.num,p]));
  const out=order.filter(n=>byNum.has(n)).map(n=>byNum.get(n));
  /* 损坏文件兜底：页树未覆盖但可解析的页面追加在末尾，避免静默丢内容 */
  parsed.pages.forEach(p=>{ if(!order.includes(p.num)) out.push(p); });
  return out;
}
/**
 * 多页落点规划：按文档页序沿 +X 依次排布，页间留 gap（默认最大页宽的 8%）。
 * 返回 [{pageNo,width,height,x,y,sourceOrigin}]，x/y 为页面在「整套图纸」中的 PDF 点偏移。
 * 旧行为把所有页归零到各自 MediaBox 后叠在同一原点，导入后跨页几何互相覆盖；此函数给每页独立原点。
 */
function layoutPdfPages(pages,opt){
  const arr=Array.isArray(pages)?pages.filter(Boolean):[];
  if(!arr.length) return [];
  const o=opt||{};
  const gapRatio=Number.isFinite(Number(o.gapRatio))?Math.max(0,Number(o.gapRatio)):0.08;
  const maxW=arr.reduce((m,p)=>Math.max(m,Number(p.width)||0),0);
  const gap=Number.isFinite(Number(o.gap))?Math.max(0,Number(o.gap)):maxW*gapRatio;
  let x=0;
  return arr.map((p,i)=>{
    const r={pageNo:i+1,width:Number(p.width)||0,height:Number(p.height)||0,x,y:0,
      sourceOrigin:Array.isArray(p.origin)?[p.origin[0],p.origin[1]]:[0,0]};
    x+=r.width+gap;
    return r;
  });
}

/* ---------------- 主入口 ---------------- */
async function parsePdf(input,opt){
  /* 容器层（对象树/页面/内容流原文）由 @idcu/format-pdf 解析；这里只做绘图语义转换 */
  const parsed=await __pdf.parse(input,{inflate,limits:opt});
  const merged={paths:[],texts:[],images:[]};
  const pages=[];
  let firstBox=null;
  pagesInDocumentOrder(parsed).forEach((page,i)=>{
    const box=page.mediaBox;
    if(!firstBox) firstBox={w:box.width,h:box.height};
    const interp=interpretContent(page.contentText);
    const paths=interp.paths.map(p=>({
      points:p.points.map(q=>[q[0]-box.x,q[1]-box.y]),closed:p.closed,filled:p.filled}));
    const texts=interp.texts.map(t=>({x:t.x-box.x,y:t.y-box.y,size:t.size,text:t.text}));
    pages.push({pageNo:i+1,num:page.num,width:box.width,height:box.height,
      origin:[box.x,box.y],paths,texts});
    paths.forEach(p=>merged.paths.push(p));
    texts.forEach(t=>merged.texts.push(t));
  });
  /* 内嵌图像（每页资源）：收集 /Subtype /Image 对象，选最大者 */
  const images=[];
  for(const [num,o] of parsed.objects){
    if(!/\/Subtype\s*\/Image/.test(o.dict)||o.data===null) continue;
    const w=dictNumber(o.dict,'Width'), h=dictNumber(o.dict,'Height');
    if(!w||!h) continue;
    const filters=o.dict.match(/\/Filter\s*\[([^\]]*)\]/);
    const f=dictName(o.dict,'Filter');
    const isJpeg=(f==='DCTDecode')||(filters&&/DCTDecode/.test(filters[1]));
    const isFlate=(f==='FlateDecode')||(filters&&/FlateDecode/.test(filters[1]));
    try{
      if(isJpeg){
        const b=binaryToBytes(o.data);
        if(b[0]===0xFF&&b[1]===0xD8) images.push({mime:'image/jpeg',bytes:b,width:w,height:h});
      }else if(isFlate){
        const decoded=await inflate(binaryToBytes(o.data));
        const cs=dictName(o.dict,'ColorSpace');
        const bpc=dictNumber(o.dict,'BitsPerComponent')||8;
        let rgb=null;
        if(bpc===8 && (cs==='DeviceRGB'||/DeviceRGB/.test(o.dict))){
          const dp=dictRawBlock(o.dict,'DecodeParms');
          const predictor=dp?(dictNumber(dp,'Predictor')||1):1;
          rgb=predictor>=10?unfilterPngPredictors(decoded,w,h,3):(()=>{ /* 无预测器：行可能带/不带前缀 */
            if(decoded.length===h*(w*3+1)) return unfilterPngPredictors(decoded,w,h,3);
            return decoded.subarray(0,h*w*3);
          })();
        }else if(bpc===8 && (cs==='DeviceGray'||/DeviceGray/.test(o.dict))){
          const dp=dictRawBlock(o.dict,'DecodeParms');
          const predictor=dp?(dictNumber(dp,'Predictor')||1):1;
          let gray=predictor>=10?unfilterPngPredictors(decoded,w,h,1):decoded.subarray(0,h*w);
          rgb=new Uint8Array(h*w*3);
          for(let i=0;i<w*h;i++){ rgb[i*3]=gray[i];rgb[i*3+1]=gray[i];rgb[i*3+2]=gray[i]; }
        }
        if(rgb&&rgb.length>=h*w*3) images.push({mime:'image/png',bytes:buildPng(w,h,rgb),width:w,height:h});
      }
    }catch(e){ /* 不支持的图像编码静默跳过 */ }
  }
  images.sort((a,b)=>b.width*b.height-a.width*a.height);
  return {pageWidth:firstBox?.w||0,pageHeight:firstBox?.h||0,
    pageCount:pages.length,pages,
    paths:merged.paths,texts:merged.texts,images,
    unitMeter:PT_TO_METER};
}

global.PdfRead={ parsePdf, layoutPdfPages, PT_TO_METER, tokenizeContent, looksLikeCidGarbage, LIMITS: PDF_LIMITS };
})(typeof window !== 'undefined' ? window : globalThis);
