/**
 * check.mjs —— 零依赖工程质量门禁（CI 前置）
 *
 * 1) 语法校验：对 js/ 下每个脚本执行 `node --check`
 * 2) 资源完整性：index.html 引用的本地脚本/样式/manifest 必须存在
 * 3) 入口完整性：js/ 下每个脚本都必须被 index.html 引用（Service Worker 例外）
 * 4) 离线承诺：入口不得引用任何远程脚本/样式/资源
 * 5) 断言数一致：README 徽章/正文/命令注释与 selftest 实际断言数一致
 * 6) 契约判据：contracts/conventions.json 里列出的约定（版本三处一致 / i18n 键对齐 /
 *    文件头唯一 / 枚举同源）由 scripts/check-contracts.mjs 逐条核对（总是真实核对）
 * 7) 对外 API 面：PlotPin.* 的顶层键 ↔ contracts/plugin-api.json 双向比对（总是真实核对）
 * 8) 删除记录：docs/deletions.md 字段齐全、无假删除
 * 9) 模块分层：js/ 下只允许 common/core/features，且加载顺序按层非递减（docs/modules.md）
 * 10) --selftest：显式执行逻辑层自测并把退出码纳入本门禁（CI 必须传）
 * 11) --selftest：i18n 覆盖率门禁（scripts/i18n-scan.mjs --check，D-11）
 * 12) Service Worker 缓存版本：预缓存输入指纹与 scripts/sw-inputs.sha256 不一致时 VERSION 必须递增（K1）
 *     6/7 在 --selftest 下额外跑判据自检（证明判据会红），自检不会替代真实核对。
 *
 * 用法：node scripts/check.mjs [--selftest]
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
/* Service Worker 必须在站点根目录：放在 js/ 下默认 scope 仅 /js/，无法接管 index.html 与全站离线缓存 */
const swFile = join(root, 'sw.js');
if (!existsSync(swFile)) errors.push('Service Worker 缺失：sw.js 必须位于站点根目录');
for (const f of [...jsFiles, ...toolFiles, ...(existsSync(swFile) ? [swFile] : [])]) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) errors.push(`语法错误：${relative(root, f)}\n${(r.stderr || '').trim()}`);
}
const appSrc = readFileSync(join(root, 'js', 'core', 'app.js'), 'utf8');
const swReg = appSrc.match(/serviceWorker\.register\(\s*['"]([^'"]+)['"]/);
if (!swReg) errors.push('app.js 中未找到 Service Worker 注册调用');
else if (swReg[1].replace(/^\.\//, '') !== 'sw.js') errors.push(`Service Worker 注册路径应指向根目录 sw.js（当前：${swReg[1]}）`);

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
  if (!scriptSet.has(rel)) errors.push(`脚本未被 index.html 引用：${rel}`);
}

/* 4. 离线承诺：不得有远程脚本/样式/图片 */
for (const m of html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)) {
  errors.push(`入口引用远程资源（破坏离线双击即用）：${m[1]}`);
}

/* 5. 断言数一致性 */
const badge = spawnSync(process.execPath, [join(root, 'scripts', 'badge.mjs'), '--check'], { encoding: 'utf8' });
if (badge.status !== 0) errors.push((badge.stdout || badge.stderr || '断言数校验失败').trim());

/* 6. 契约判据（版本 / i18n / 文件头 / 枚举）：真实核对总是执行。
   --selftest 只额外加跑「判据自己会红」的解析器自检，绝不替代真实核对
   （旧实现把 --selftest 透传过去，脚本只跑自检就退出，汇总行却写「契约守约」——典型假绿）。 */
const withSelftest = process.argv.includes('--selftest');
const contracts = spawnSync(process.execPath, [join(root, 'scripts', 'check-contracts.mjs')], { encoding: 'utf8' });
if (contracts.status !== 0) {
  errors.push('契约判据未通过：\n' + (contracts.stdout || '').trim() + '\n' + (contracts.stderr || '').trim());
} else {
  console.log('  [门禁] 契约判据已执行：' + (contracts.stdout || '').trim().split('\n').pop());
}
if (withSelftest) {
  const teeth = spawnSync(process.execPath, [join(root, 'scripts', 'check-contracts.mjs'), '--selftest'], { encoding: 'utf8' });
  if (teeth.status !== 0) errors.push('契约判据自检未通过：\n' + (teeth.stdout || '').trim() + '\n' + (teeth.stderr || '').trim());
}

/* 7. 对外 API 承诺面（PlotPin.* 的键 ↔ contracts/plugin-api.json）：同样是真实核对总是执行 */
const api = spawnSync(process.execPath, [join(root, 'scripts', 'check-plugin-api.mjs')], { encoding: 'utf8' });
if (api.status !== 0) {
  errors.push('对外 API 面未守约：\n' + (api.stdout || '').trim() + '\n' + (api.stderr || '').trim());
} else {
  console.log('  [门禁] 插件 API 面已执行：' + (api.stdout || '').trim().split('\n').pop());
}
if (withSelftest) {
  const teeth = spawnSync(process.execPath, [join(root, 'scripts', 'check-plugin-api.mjs'), '--selftest'], { encoding: 'utf8' });
  if (teeth.status !== 0) errors.push('插件 API 判据自检未通过：\n' + (teeth.stdout || '').trim() + '\n' + (teeth.stderr || '').trim());
}

/* 8. 结构性删除的账本（docs/deletions.md：字段齐全、无假删除） */
const dels = spawnSync(process.execPath, [join(root, 'scripts', 'check-deletions.mjs')], { encoding: 'utf8' });
if (dels.status !== 0) {
  errors.push('删除记录未守约：\n' + (dels.stdout || '').trim() + '\n' + (dels.stderr || '').trim());
}

/* 9. 模块分层（docs/modules.md）：目录归属 + 加载顺序按层非递减。
   classic <script> 共享全局作用域，目录边界是唯一还能被机器核对的"模块边界"。 */
const LAYERS = { 'js/common/': 0, 'js/core/': 1, 'js/features/': 2 };
const ENTRY_LAYER = 3;
const layerOf = (p) => {
  const n = relative(root, p).replace(/\\/g, '/');
  if (n === 'js/core/app.js') return ENTRY_LAYER;
  for (const [prefix, v] of Object.entries(LAYERS)) if (n.startsWith(prefix)) return v;
  return -1;
};
const jsDirs = readdirSync(join(root, 'js'), { withFileTypes: true })
  .filter(e => e.isDirectory()).map(e => e.name).sort();
const allowedDirs = ['common', 'core', 'features'];
for (const d of jsDirs) {
  if (!allowedDirs.includes(d)) errors.push(`js/ 下出现未登记的层：${d}/（只允许 ${allowedDirs.join(' / ')}）`);
}

const layerSrcs = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);
let prev = -1;
for (const src of layerSrcs) {
  if (!src.startsWith('js/')) continue;
  const lv = layerOf(join(root, src));
  if (lv < 0) { errors.push(`脚本不在任何已登记的层里：${src}`); continue; }
  if (lv < prev) errors.push(`层序倒退：${src} 属于第 ${lv} 层，却排在第 ${prev} 层之后（见 docs/modules.md）`);
  prev = Math.max(prev, lv);
}

/* 10. 逻辑层自测：--selftest 显式执行；未传时也由 badge --check 执行一次，
   但本步保证 CI 日志里有独立的「--selftest 已执行」证据与退出码。 */
if (withSelftest) {
  const st = spawnSync(process.execPath, [join(root, 'scripts', 'selftest.mjs')], { encoding: 'utf8' });
  const tail = (st.stdout || '').trim().split('\n').pop() || (st.stderr || '').trim().split('\n').pop() || '';
  if (st.status !== 0) errors.push('逻辑层自测失败（--selftest）：\n' + (st.stdout || st.stderr || '').trim());
  else console.log(`  [门禁] --selftest 已执行：${tail}`);
  /* 11. i18n 覆盖率门禁（D-11）：阈值与口径写在 i18n-scan.mjs 文件头 */
  const i18n = spawnSync(process.execPath, [join(root, 'scripts', 'i18n-scan.mjs'), '--check'], { encoding: 'utf8' });
  const i18nTail = (i18n.stdout || '').trim().split('\n').pop() || (i18n.stderr || '').trim().split('\n').pop() || '';
  if (i18n.status !== 0) errors.push('i18n 门禁未通过：\n' + (i18n.stdout || i18n.stderr || '').trim());
  else console.log(`  [门禁] i18n 已执行：${i18nTail}`);
}

/* 12. Service Worker 缓存版本门禁（K1）：预缓存输入变更时必须递增 VERSION */
const sw = spawnSync(process.execPath, [join(root, 'scripts', 'check-sw.mjs')], { encoding: 'utf8' });
const swTail = (sw.stdout || '').trim().split('\n').pop() || (sw.stderr || '').trim().split('\n').pop() || '';
if (sw.status !== 0) errors.push('SW 缓存版本门禁未通过：\n' + (sw.stdout || sw.stderr || '').trim());
else console.log(`  [门禁] SW 缓存版本已执行：${swTail}`);

if (errors.length) {
  console.error('❌ 工程自检未通过：');
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}
console.log(`✅ 工程自检通过：${jsFiles.length} 个脚本语法正确、入口资源完整、离线引用合规、断言数一致、契约守约、插件 API 面守约、模块分层守约、i18n 覆盖率守约、SW 缓存版本守约`);
