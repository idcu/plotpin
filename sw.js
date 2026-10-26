/* sw.js —— 托管（http/https）部署时的离线缓存层
 * file:// 双击模式本身就是完全离线的，浏览器不允许该协议注册 Service Worker，故不注册。
 * 缓存清单从 index.html 动态解析，新增脚本无需手工维护。 */
const CACHE = 'plotpin-v1';

async function precache() {
  const cache = await caches.open(CACHE);
  const html = await (await fetch('./index.html', { cache: 'no-store' })).text();
  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"><\/script>/g)].map(m => './' + m[1]);
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1])
    .filter(u => u && !u.startsWith('#') && !u.startsWith('data:') && !/^[a-z]+:/i.test(u))
    .map(u => './' + u.replace(/^\.\//, ''));
  const urls = [...new Set(['./', './index.html', './manifest.webmanifest', './icon.svg', './css/style.css', ...scripts, ...assets])];
  await cache.addAll(urls);
}

self.addEventListener('install', e => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
