/* sw.js —— 托管（http/https）部署时的离线缓存层
 * file:// 双击模式本身就是完全离线的，浏览器不允许该协议注册 Service Worker，故不注册。
 * 缓存清单从 index.html 动态解析，新增脚本无需手工维护。
 * 版本策略：CACHE 名带版本号；activate 仅在新缓存完整时删除其他版本缓存。
 * 更新原子性：任一预缓存失败都不 skipWaiting、不删旧缓存，页面用 STATUS 查询失败项数。 */
const VERSION = '244';
const CACHE = 'plotpin-v' + VERSION;
const STATE_KEY = new URL('./__sw-precache.json', self.location.href).href;
const OFFLINE_HTML = '<!doctype html><html lang="zh-CN"><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1"><title>PlotPin 离线</title>' +
  '<body style="font:15px/1.7 system-ui,sans-serif;padding:24px;color:#172033">' +
  '<h3 style="margin:0 0 8px">当前离线，且本机没有可用缓存</h3>' +
  '<p style="margin:0;color:#667085">联网打开一次 PlotPin 后即可离线使用。</p></body></html>';

let lastPrecache = { ok: 0, failed: 0, total: 0 };

/* 安装结果写入当前缓存条目，供下一次实例的 activate 判定（浏览器重启后全局变量会丢）。 */
async function remember(info) {
  const cache = await caches.open(CACHE);
  await cache.put(STATE_KEY, new Response(JSON.stringify(info), { headers: { 'Content-Type': 'application/json' } }));
}
async function recall() {
  try {
    const res = await (await caches.open(CACHE)).match(STATE_KEY);
    return res ? await res.json() : null;
  } catch (_) { return null; }
}

async function precache() {
  const cache = await caches.open(CACHE);
  const html = await (await fetch('./index.html', { cache: 'no-store' })).text();
  /* 属性引号写法与 scripts/check-sw.mjs 的指纹口径一致：双引号 / 单引号 / 无引号都认。
     只认双引号时，把 <script src='x.js'> 改成单引号会让运行时漏缓存，而校验脚本仍认为一致。 */
  const ATTR = /(?:\bsrc|\bhref)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/g;
  const refs = [...html.matchAll(ATTR)].map(m => m[1] ?? m[2] ?? m[3])
    .filter(u => u && !u.startsWith('#') && !u.startsWith('data:') && !/^[a-z]+:/i.test(u))
    .map(u => './' + u.replace(/^\.\//, ''));
  const urls = [...new Set(['./', './index.html', './manifest.webmanifest', './icon.svg', './css/style.css', ...refs])];
  /* 单个资源失败不阻断安装流程（Promise.allSettled），但会阻止本次激活（见 install）；
     失败计数写入缓存标记，页面可通过 STATUS 消息查询本次预缓存结果 */
  const results = await Promise.allSettled(urls.map(u => cache.add(u)));
  const failed = results.filter(r => r.status === 'rejected');
  lastPrecache = { ok: urls.length - failed.length, failed: failed.length, total: urls.length };
  await remember(lastPrecache);
  if (failed.length) {
    console.warn('[sw] 预缓存失败 ' + failed.length + '/' + urls.length + '：'
      + failed.map(r => (r.reason && r.reason.message) || r.reason).join('; '));
  }
  return lastPrecache;
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    let info;
    try {
      info = await precache();
    } catch (err) {
      /* 连 index.html 都取不到：保持旧版本 active，等下一次更新 */
      console.warn('[sw] 预缓存整体失败，保留旧版本：' + ((err && err.message) || err));
      return;
    }
    if (info.failed > 0) {
      console.warn('[sw] 预缓存失败 ' + info.failed + '/' + info.total + '，不激活新版本');
      return;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const info = lastPrecache.total ? lastPrecache : await recall();
    const entries = (await (await caches.open(CACHE)).keys()).length;
    /* 只有「本次安装零失败」且「新缓存条目不少于清单数」才允许删旧缓存，
       否则保留旧版本缓存，离线能力不回退。 */
    if (info && info.failed === 0 && entries >= info.total) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    } else {
      console.warn('[sw] 新缓存不完整，保留旧缓存：' + JSON.stringify(info || { entries }));
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'STATUS' || !e.source) return;
  e.source.postMessage(Object.assign({ type: 'STATUS', version: VERSION, cache: CACHE }, lastPrecache));
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
