#!/usr/bin/env node
/* check-sw.mjs —— Service Worker 缓存版本门禁（K1）
 *
 * 背景：sw.js 的 CACHE 名带版本号，activate 会删除所有非当前版本缓存；版本号靠发布纪律手工 bump。
 * 基线不再来自工作区 diff（干净检出恒为空，等于没有门禁），而是**提交入库的内容指纹清单**
 * scripts/sw-inputs.sha256：清单与 sw.js 的 VERSION 一起提交，任何分支/任何机器上都能核对。
 *
 *   预缓存输入 = index.html 自身 + index.html 引用的全部脚本/样式/资源；
 *   指纹口径   = 文件按 UTF-8 读取、CRLF→LF 归一后取 sha256（Windows 与 CI 结果一致）；
 *               路径统一 / 分隔并按字典序排列，清单逐行 `<sha256>  <path>`。
 *
 * 判据：
 *   1. 清单文件必须存在且可解析（缺失即红，不再静默跳过）；
 *   2. 清单里的 version 必须等于 sw.js 的 VERSION；
 *   3. 输入有变更而 VERSION 未高于清单版本 → 红（要求 bump）；
 *   4. VERSION 低于清单版本 → 红（回退）；
 *   5. 变更后即使 bump 了 VERSION，也必须用 --update 刷新清单（否则下一条输入变更又会漏过）。
 *
 * 合并冲突处理：不要手工合并哈希行；取合并后的工作树重新执行 --update，再与 VERSION 一起提交。
 *
 * 用法：
 *   node scripts/check-sw.mjs            校验
 *   node scripts/check-sw.mjs --update   重新生成指纹清单（bump VERSION 后必须执行）
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const fail = (msg) => { console.error(`❌ SW 缓存版本门禁：${msg}`); process.exit(1); };

const MANIFEST = join(root, 'scripts', 'sw-inputs.sha256');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const refs = [
  ...html.matchAll(/<script\s+src="([^"]+)"><\/script>/g),
  ...html.matchAll(/(?:src|href)="([^"]+)"/g)
].map(m => m[1])
  .filter(u => u && !u.startsWith('#') && !u.startsWith('data:') && !/^[a-z]+:/i.test(u))
  .map(u => u.replace(/^\.\//, ''));
const inputs = [...new Set(['index.html', 'css/style.css', 'manifest.webmanifest', 'icon.svg', ...refs])].sort();

const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const cur = (sw.match(/const VERSION\s*=\s*['"](\d+)['"]/) || [])[1];
if (!cur) fail('sw.js 未找到 const VERSION = \'<数字>\'');

/** 内容指纹：CRLF 归一后取 sha256，避免同一份源码在 Windows/CI 得到不同结果。 */
function digest(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) return 'MISSING';
  const text = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function parseManifest(text) {
  const version = (text.match(/^version=(\d+)\s*$/m) || [])[1] || null;
  const entries = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([0-9a-f]{64}|MISSING) {2}(.+)$/);
    if (m) entries.set(m[2].trim(), m[1]);
  }
  return { version, entries };
}

const current = new Map(inputs.map(rel => [rel, digest(rel)]));

if (process.argv.includes('--update')) {
  const next = Number(cur);
  if (existsSync(MANIFEST)) {
    const old = parseManifest(readFileSync(MANIFEST, 'utf8'));
    if (old.version && Number(cur) < Number(old.version)) {
      fail(`拒绝生成：VERSION 回退（清单 ${old.version} → 当前 ${cur}）`);
    }
  }
  const lines = [
    '# sw-inputs.sha256 —— Service Worker 预缓存输入内容指纹（check-sw.mjs 的基线）',
    '# 生成：node scripts/check-sw.mjs --update（bump sw.js VERSION 后必须执行）',
    '# 指纹：UTF-8 读取、CRLF→LF 归一后取 sha256；路径字典序、统一 / 分隔',
    '# 合并冲突：不要手工合并哈希行，取合并后的工作树重新执行 --update',
    `version=${next}`,
    ...[...current].map(([rel, hash]) => `${hash}  ${rel}`)
  ];
  writeFileSync(MANIFEST, lines.join('\n') + '\n', 'utf8');
  console.log(`✅ SW 指纹清单已更新：version=${next}，${current.size} 个预缓存输入 → scripts/sw-inputs.sha256`);
  process.exit(0);
}

if (!existsSync(MANIFEST)) {
  fail('缺少基线清单 scripts/sw-inputs.sha256；请运行 node scripts/check-sw.mjs --update 生成并提交');
}
const base = parseManifest(readFileSync(MANIFEST, 'utf8'));
if (!base.version) fail('scripts/sw-inputs.sha256 缺少 version=<数字> 行');

const changed = [];
for (const [rel, hash] of current) {
  if (base.entries.get(rel) !== hash) changed.push(rel);
}
for (const rel of base.entries.keys()) {
  if (!current.has(rel)) changed.push(rel);
}

if (Number(cur) < Number(base.version)) {
  fail(`VERSION 回退：清单=${base.version} → 当前=${cur}`);
}
if (changed.length) {
  if (Number(cur) <= Number(base.version)) {
    fail(`预缓存输入已变更但 VERSION 未递增（清单=${base.version}，当前=${cur}）：\n  - `
      + changed.join('\n  - ') + `\n  请把 sw.js 的 VERSION 提升到至少 ${Number(base.version) + 1}，`
      + '再运行 node scripts/check-sw.mjs --update 刷新清单');
  }
  fail(`预缓存输入已变更（VERSION 已提升到 ${cur}），但指纹清单仍是 version=${base.version}：\n  - `
    + changed.join('\n  - ') + '\n  请运行 node scripts/check-sw.mjs --update 并一并提交');
}
if (Number(cur) > Number(base.version)) {
  fail(`指纹清单 version=${base.version} 落后于 sw.js VERSION=${cur}：请运行 node scripts/check-sw.mjs --update`);
}
console.log(`✅ SW 缓存版本守约：VERSION=${cur}（指纹清单 version=${base.version}，${current.size} 个预缓存输入一致）`);
