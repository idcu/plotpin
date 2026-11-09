/* sw.js —— 托管（http/https）部署时的离线缓存层
 * file:// 双击模式本身就是完全离线的，浏览器不允许该协议注册 Service Worker，故不注册。
 * 缓存清单从 index.html 动态解析，新增脚本无需手工维护。
 * 版本策略：CACHE 名带版本号；activate 删除所有非当前版本缓存。
 * 更新失败不阻断：单个资源 404/失败不影响安装（Promise.allSettled），注册失败也不影响界面。 */
const VERSION = '123';
const CACHE = 'plotpin-v' + VERSION;
const OFFLINE_HTML = '<!doctype html><html lang="zh-CN"><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1"><title>PlotPin 离线</title>' +
  '<body style="font:15px/1.7 system-ui,sans-serif;padding:24px;color:#172033">' +
  '<h3 style="margin:0 0 8px">当前离线，且本机没有可用缓存</h3>' +
  '<p style="margin:0;color:#667085">联网打开一次 PlotPin 后即可离线使用。</p></body></html>';

async function precache() {
  const cache = await caches.open(CACHE);
  const html = await (await fetch('./index.html', { cache: 'no-store' })).text();
  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"><\/script>/g)].map(m => './' + m[1]);
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1])
    .filter(u => u && !u.startsWith('#') && !u.startsWith('data:') && !/^[a-z]+:/i.test(u))
    .map(u => './' + u.replace(/^\.\//, ''));
  const urls = [...new Set(['./', './index.html', './manifest.webmanifest', './icon.svg', './css/style.css', ...scripts, ...assets])];
  /* 单个资源失败不阻断整体安装，否则一次 404 会让新版本永远装不上 */
  await Promise.allSettled(urls.map(u => cache.add(u).catch(() => {})));
}

self.addEventListener('install', e => {
  e.waitUntil(precache().catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  /* 网络优先：在线时始终拿到最新脚本/页面（避免旧缓存卡住升级），离线再回退缓存。
     导航请求回退忽略 query，保证任意入口 URL 都能打开；缓存也没有时返回离线提示页，
     而不是浏览器默认错误页。 */
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() =>
      caches.match(req).then(hit => hit ||
        (req.mode === 'navigate' ? caches.match('./index.html', { ignoreSearch: true }) : undefined)
      ).then(hit => hit || new Response(OFFLINE_HTML, {
        status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }))
    )
  );
});
