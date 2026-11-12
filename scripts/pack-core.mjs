/**
 * pack-core.mjs —— 单文件 HTML 打包核心（纯函数，便于自测）
 * 把 <link rel="stylesheet"> 与 <script src> 内联，移除 PWA manifest，图标转 data URI。
 * 产物无任何外部引用，双击即可离线使用。
 *
 * 脚本内联后仍然是「内联脚本」：CSP 的 script-src 不含 'unsafe-inline'，
 * 因此这里把每个内联脚本的 sha256 追加到页面 CSP（hash 由内容确定性计算，构建可复现）。
 */
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { minifyCss, minifyJs } from './minify-core.mjs';
import { findRemoteRefs } from './lib/offline-scan.mjs';

export function buildStandalone(html, readFile) {
  /* 结构缩进在 HTML 渲染里等价于一个空白：去掉「换行 + 空白 + 紧跟标签」的行首缩进与空白行，
     渲染结果不变（仍保留一个换行），省下约 1.7 KB。文本内容与属性值不受影响。
     HTML 注释先行删除：注释不参与渲染，且必须在脚本内联**之前**删（内联后 JS 里的
     `<!--` 字符串会被误判成注释起点）。 */
  let out = String(html).replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n[ \t]+(?=<)/g, '\n').replace(/\n[ \t]*\n/g, '\n');
  const cspHashes = [];

  /* 样式内联（构建期无损压缩：只删注释/多余空白，源文件保持可读） */
  out = out.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g,
    (_, href) => `<style>\n/* ${href} */\n${minifyCss(readFile(href))}\n</style>`);

  /* 脚本内联（保持原有顺序）；先做构建期无损压缩，再转义 </script> 防止提前闭合。
     哈希必须按浏览器看到的**脚本文本内容**计算（含压缩后的换行）。
     压缩后立刻做语法解析：压缩器只删注释/空白，解析失败说明压缩器有缺陷，构建必须失败。 */
  out = out.replace(/<script\s+src="([^"]+)"><\/script>/g, (_, src) => {
    const code = minifyJs(String(readFile(src))).replace(/<\/script/gi, '<\\/script');
    try { new vm.Script(code, { filename: src }); }
    catch (e) { throw new Error(`压缩后脚本无法解析（${src}）：${e.message}`); }
    const inner = `\n/* ${src} */\n${code}\n`;
    cspHashes.push(createHash('sha256').update(inner, 'utf8').digest('base64'));
    return `<script>${inner}</script>`;
  });

  /* CSP 升级：只给内联脚本签哈希，其余策略原样保留 */
  if (cspHashes.length) {
    const add = cspHashes.map(h => `'sha256-${h}'`).join(' ');
    const hasCsp = /http-equiv="Content-Security-Policy"/i.test(out);
    if (!hasCsp) throw new Error('单文件打包要求入口声明 Content-Security-Policy（否则内联脚本无法受策略约束）');
    if (!/script-src[^;]*'self'/.test(out)) {
      throw new Error("单文件打包要求 CSP 的 script-src 含 'self'（由它派生内联脚本哈希白名单）");
    }
    out = out.replace(/script-src([^;]*)/i, (m, rest) => `script-src${rest} ${add}`);
  }

  /* PWA manifest 在单文件模式下无意义，移除避免 404 */
  out = out.replace(/<link\s+rel="manifest"[^>]*>\s*/g, '');

  /* 图标 -> data URI（SVG 图标） */
  try {
    const icon = readFile('icon.svg');
    const b64 = globalThis.Buffer ? Buffer.from(icon).toString('base64') : '';
    if (b64) out = out.replace(/href="icon\.svg"/g, `href="data:image/svg+xml;base64,${b64}"`);
  } catch (_) { /* 无图标则保留原引用 */ }

  /* 校验：不得残留本地/远程外链脚本或样式 */
  const leftovers = [
    /<script\s+src=/i,
    /<link\s+rel="stylesheet"/i,
    /href="css\//i,
    /src="js\//i,
    /href="\.?\/?(manifest|icon)\./i
  ];
  for (const re of leftovers) {
    if (re.test(out)) throw new Error('单文件打包后仍有外部引用：' + re);
  }
  /* 内联后的样式/脚本同样会联网：按 CSS/JS 词法再扫一遍，避免「已内联」被当成「离线安全」 */
  for (const kind of ['html', 'css', 'js']) {
    const hits = findRemoteRefs(out, kind);
    if (hits.length) throw new Error('单文件打包后仍有远程引用：' + hits[0].url);
  }
  return out;
}
