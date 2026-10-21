/**
 * check.mjs —— 零依赖工程质量门禁（CI 前置）
 *
 * 1) 语法校验：对 js/ 下每个脚本执行 `node --check`
 * 2) 资源完整性：index.html 引用的本地脚本/样式/manifest 必须存在
 * 3) 入口完整性：js/ 下每个脚本都必须被 index.html 引用（Service Worker 例外）
 * 4) 离线承诺：入口不得引用任何远程脚本/样式/资源
 * 5) 断言数一致：README 徽章/正文/命令注释与 selftest 实际断言数一致
 *
 * 用法：node scripts/check.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const errors = [];
const html = readFileSync(join(root, 'index.html'), 'utf8');

/* 1. 语法校验 */
function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : (p.endsWith('.js') ? [p] : []);
  });
}
const jsFiles = walk(join(root, 'js'));
/* 工程脚本（开发工具）只需语法校验，不参与入口引用检查 */
const toolFiles = readdirSync(join(root, 'scripts')).filter(n => n.endsWith('.mjs')).map(n => join(root, 'scripts', n));
for (const f of [...jsFiles, ...toolFiles]) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) errors.push(`语法错误：${relative(root, f)}\n${(r.stderr || '').trim()}`);
}

/* 2/3. 入口引用与资源存在性 */
const scriptRefs = [...html.matchAll(/<script\s+src="([^"]+)"><\/script>/g)].map(m => m[1]);
const assetRefs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1])
  .filter(u => u && !u.startsWith('#') && !u.startsWith('data:') && !/^[a-z]+:/i.test(u));
for (const ref of new Set([...scriptRefs, ...assetRefs])) {
  if (!existsSync(join(root, ref))) errors.push(`入口引用的文件不存在：${ref}`);
}
const scriptSet = new Set(scriptRefs);
for (const f of jsFiles) {
  const rel = relative(root, f).replace(/\\/g, '/');
  if (rel === 'js/sw.js') continue;               /* Service Worker 由 register 注册，非入口脚本 */
  if (!scriptSet.has(rel)) errors.push(`脚本未被 index.html 引用：${rel}`);
}

/* 4. 离线承诺：不得有远程脚本/样式/图片 */
for (const m of html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)) {
  errors.push(`入口引用远程资源（破坏离线双击即用）：${m[1]}`);
}

/* 5. 断言数一致性 */
const badge = spawnSync(process.execPath, [join(root, 'scripts', 'badge.mjs'), '--check'], { encoding: 'utf8' });
if (badge.status !== 0) errors.push((badge.stdout || badge.stderr || '断言数校验失败').trim());

if (errors.length) {
  console.error('❌ 工程自检未通过：');
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}
console.log(`✅ 工程自检通过：${jsFiles.length} 个脚本语法正确、入口资源完整、离线引用合规、断言数一致`);
