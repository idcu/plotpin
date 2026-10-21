/**
 * pack-core.mjs —— 单文件 HTML 打包核心（纯函数，便于自测）
 * 把 <link rel="stylesheet"> 与 <script src> 内联，移除 PWA manifest，图标转 data URI。
 * 产物无任何外部引用，双击即可离线使用。
 */
export function buildStandalone(html, readFile) {
  let out = String(html);

  /* 样式内联 */
  out = out.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g,
    (_, href) => `<style>\n/* ${href} */\n${readFile(href)}\n</style>`);

  /* 脚本内联（保持原有顺序）；转义 </script> 防止提前闭合 */
  out = out.replace(/<script\s+src="([^"]+)"><\/script>/g, (_, src) => {
    const code = String(readFile(src)).replace(/<\/script/gi, '<\\/script');
    return `<script>\n/* ${src} */\n${code}\n</script>`;
  });

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
  return out;
}
