#!/usr/bin/env node
/* check-sw.mjs —— Service Worker 缓存版本门禁（K1）
 *
 * 背景：sw.js 的 CACHE 名带版本号，activate 会删除所有非当前版本缓存；但版本号靠发布纪律手工 bump。
 * 预缓存清单在运行时从 index.html 解析，构建期不知道「上一版」，所以这里用 git HEAD 作为上一版基线：
 *
 *   - 预缓存输入 = index.html 自身 + index.html 引用的全部脚本/样式/资源；
 *   - 这些文件相对 HEAD 有改动（含新文件）时，sw.js 的 VERSION 必须严格递增；
 *   - 版本号回退（无输入变更也不允许）直接报错。
 *
 * 非 git 工作区或尚无 HEAD 时跳过（本地解压包/首次提交），CI 与日常提交均在 git 内，门禁照常生效。
 *
 * 用法：node scripts/check-sw.mjs
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const fail = (msg) => { console.error(`❌ SW 缓存版本门禁：${msg}`); process.exit(1); };

const html = readFileSync(join(root, 'index.html'), 'utf8');
const refs = [
  ...html.matchAll(/<script\s+src="([^"]+)"><\/script>/g),
  ...html.matchAll(/(?:src|href)="([^"]+)"/g)
].map(m => m[1])
  .filter(u => u && !u.startsWith('#') && !u.startsWith('data:') && !/^[a-z]+:/i.test(u))
  .map(u => u.replace(/^\.\//, ''));
const inputs = [...new Set(['index.html', 'css/style.css', 'manifest.webmanifest', 'icon.svg', ...refs])];

const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
const inRepo = git(['rev-parse', '--is-inside-work-tree']);
if (inRepo.status !== 0) {
  console.log('ℹ️ SW 缓存版本门禁：非 git 工作区，跳过（发布纪律仍适用）');
  process.exit(0);
}
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const cur = (sw.match(/const VERSION\s*=\s*['"](\d+)['"]/) || [])[1];
if (!cur) fail('sw.js 未找到 const VERSION = \'<数字>\'');
const head = git(['show', 'HEAD:sw.js']);
if (head.status !== 0) {
  console.log('ℹ️ SW 缓存版本门禁：无 HEAD 基线（首次提交），跳过');
  process.exit(0);
}
const prev = (head.stdout.match(/const VERSION\s*=\s*['"](\d+)['"]/) || [])[1];
if (!prev) fail('HEAD 的 sw.js 缺少 VERSION，无法比较');

const diff = git(['diff', '--name-only', 'HEAD', '--', ...inputs]);
const untracked = git(['ls-files', '--others', '--exclude-standard', '--', ...inputs]);
if (diff.status !== 0 || untracked.status !== 0) fail('git diff 执行失败，无法判定预缓存输入变更');
const changed = new Set(
  [...diff.stdout.split('\n'), ...untracked.stdout.split('\n')].map(s => s.trim()).filter(Boolean)
);

if (Number(cur) < Number(prev)) fail(`VERSION 回退：HEAD=${prev} → 当前=${cur}`);
if (changed.size && Number(cur) <= Number(prev)) {
  fail(`预缓存输入已变更但 VERSION 未递增（HEAD=${prev}，当前=${cur}）：\n  - `
    + [...changed].join('\n  - ') + '\n  请把 sw.js 的 VERSION 提升到至少 ' + (Number(prev) + 1));
}
console.log(`✅ SW 缓存版本守约：VERSION=${cur}（预缓存输入变更 ${changed.size} 个，HEAD=${prev}）`);
