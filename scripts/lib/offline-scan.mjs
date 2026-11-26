/**
 * offline-scan.mjs —— 离线承诺的远程引用扫描（零依赖，供 check.mjs 与 pack-core.mjs 共用）
 *
 * 判据只认「会触发网络请求」的引用位置，而不是文本里出现 http:// 就算违规：
 *  - HTML：src / href / action / poster 属性
 *  - CSS ：url(...) 与 @import
 *  - JS  ：fetch / import / Worker / EventSource / sendBeacon / XHR.open / 赋给 src|href 的字面量
 * 白名单集中在本文件，用于放过不产生请求的标识符（如 SVG/XML 命名空间）。
 */
export const REMOTE_URL_WHITELIST = [
  /* XML / SVG 命名空间只是标识符，浏览器不会为它发起请求 */
  /^https?:\/\/www\.w3\.org\//i
];

/** 该远程 URL 是否被白名单放过 */
export function isRemoteUrlAllowed(url) {
  return REMOTE_URL_WHITELIST.some(re => re.test(String(url || '')));
}

const PATTERNS = {
  html: [
    /(?:src|href|action|poster)\s*=\s*["'](https?:\/\/[^"']+)["']/gi
  ],
  css: [
    /url\(\s*["']?(https?:\/\/[^"')\s]+)/gi,
    /@import\s+(?:url\(\s*)?["']?(https?:\/\/[^"')\s;]+)/gi
  ],
  js: [
    /(?:fetch|import|Worker|SharedWorker|EventSource|sendBeacon)\s*\(\s*["'`](https?:\/\/[^"'`]+)/g,
    /(?:from|import)\s*["'](https?:\/\/[^"']+)/g,
    /\.(?:src|href)\s*=\s*["'`](https?:\/\/[^"'`]+)/g,
    /open\s*\(\s*["'][A-Z]+["']\s*,\s*["'](https?:\/\/[^"']+)/gi
  ]
};

/**
 * 找出一段文本里的远程引用。
 * @param {string} text 文本内容
 * @param {'html'|'css'|'js'} kind 文本类型，决定「活跃引用」的词法
 * @returns {{url:string,line:number}[]} 行号从 1 开始，已排除白名单
 */
export function findRemoteRefs(text, kind) {
  const src = String(text || '');
  const patterns = PATTERNS[kind] || PATTERNS.html;
  const hits = [];
  const seen = new Set();
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const url = m[1];
      if (isRemoteUrlAllowed(url)) continue;
      const at = m.index + m[0].indexOf(url);
      const key = at + '|' + url;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ url, line: src.slice(0, at).split('\n').length });
    }
  }
  return hits;
}
