/**
 * serve.mjs —— 零依赖静态服务器（仅用于浏览器级测试）
 *
 * 浏览器 IndexedDB 在 file:// 下被禁用，e2e 必须经 http 加载页面。
 * 只读取仓库内文件、不做任何写入；不进入发行包，也不被运行时引用。
 *
 * 用法：node scripts/serve.mjs   （PORT / HOST 环境变量可选，默认 127.0.0.1:4173）
 *       E2E_ENTRY=dist node scripts/serve.mjs   把 / 与 /index.html 指向单文件发行版，
 *       供 dist 全量 e2e 复用同一套用例（用例里的 page.goto('/index.html') 不需要改）。
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, isAbsolute, join, normalize, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || process.env.E2E_PORT || 4173);
/* dist 入口：单文件发行版没有 js/、css/ 目录，只映射页面本身；
   其余请求仍按仓库路径解析，未命中的资源会 404（正好暴露发行版残留外链）。 */
const distEntry = process.env.E2E_ENTRY === 'dist';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8'
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || host}`);
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const rel = distEntry && pathname === '/index.html'
      ? '/dist/plotpin-standalone.html'
      : decodeURIComponent(pathname);
    const abs = normalize(join(root, rel));
    if (!isAbsolute(abs) || relative(root, abs).startsWith('..')) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    let file = abs;
    const st = await stat(file);
    if (st.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(body);
  } catch (_) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
});

server.listen(port, host, () => {
  console.log(`[e2e-serve] http://${host}:${port}/index.html`
    + (distEntry ? ' → dist/plotpin-standalone.html' : ''));
});
