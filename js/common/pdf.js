/* pdf.js —— 零依赖多页 PDF 生成（每页为 JPEG 图像 XObject，DCTDecode）
 * 用 Canvas 预渲染页面，因此底图、设备图标、中文标签都与画面完全一致，无需嵌入字体。
 * 输入：[{width,height,b64(JPEG base64)}]，输出：Uint8Array(PDF 字节) */
(function (global) {
  'use strict';

function stringToBytes(s){
  const n=s.length, out=new Uint8Array(n);
  for(let i=0;i<n;i++) out[i]=s.charCodeAt(i)&0xff;
  return out;
}
function buildImagePdf(pages){
  pages=(pages||[]).filter(Boolean);
  if(!pages.length) throw new Error('PDF 没有可输出的页面');
  const bodies=[];   // 1-based：bodies[n]=对象内容（字符串或 {bin}）
  bodies[1]='<< /Type /Catalog /Pages 2 0 R >>';
  const pageNo=i=>3+i*3, contentNo=i=>4+i*3, imgNo=i=>5+i*3;
  const total=2+pages.length*3;
  bodies[2]='<< /Type /Pages /Kids ['+pages.map((p,i)=>pageNo(i)+' 0 R').join(' ')+'] /Count '+pages.length+' >>';
  pages.forEach((p,i)=>{
    bodies[pageNo(i)]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+p.width+' '+p.height+
      '] /Resources << /XObject << /Im0 '+imgNo(i)+' 0 R >> >> /Contents '+contentNo(i)+' 0 R >>';
    const cm='q '+p.width+' 0 0 '+p.height+' 0 0 cm /Im0 Do Q';
    bodies[contentNo(i)]='<< /Length '+cm.length+' >>\nstream\n'+cm+'\nendstream';
    const bin=globalThis.atob(p.b64);
    bodies[imgNo(i)]='<< /Type /XObject /Subtype /Image /Width '+p.width+' /Height '+p.height+
      ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+bin.length+' >>\nstream\n'+bin+'\nendstream';
  });
  /* 拼装并记录字节偏移（Latin1，1 字符=1 字节，二进制 JPEG 已经 atob 解码） */
  let pdf='%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n';
  const offsets=[0];
  for(let n=1;n<=total;n++){
    offsets[n]=pdf.length;
    pdf+=n+' 0 obj\n'+bodies[n]+'\nendobj\n';
  }
  const xrefPos=pdf.length;
  let xref='xref\n0 '+(total+1)+'\n0000000000 65535 f \n';
  for(let n=1;n<=total;n++) xref+=String(offsets[n]).padStart(10,'0')+' 00000 n \n';
  xref+='trailer\n<< /Size '+(total+1)+' /Root 1 0 R >>\nstartxref\n'+xrefPos+'\n%%EOF';
  return stringToBytes(pdf+xref);
}

global.Pdf={ buildImagePdf };
})(typeof window !== 'undefined' ? window : globalThis);
