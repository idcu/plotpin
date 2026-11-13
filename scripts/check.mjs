/**
 * check.mjs —— 零依赖工程质量门禁（CI 前置）
 *
 * 1) 语法校验：对 js/ 与 scripts/（含 lib/）下每个脚本执行 `node --check`
 * 2) 资源完整性：index.html 引用的本地脚本/样式/manifest 必须存在
 * 3) 入口完整性：js/ 下每个脚本都必须被 index.html 引用（Service Worker 例外）
 * 4) 离线承诺：入口 / CSS / JS 不得引用会发起网络请求的远程资源（白名单集中在 lib/offline-scan.mjs）
 * 5) 断言数一致：README 徽章/正文/命令注释与 selftest 实际断言数一致
 * 6) 契约判据：contracts/conventions.json 里列出的约定（版本三处一致 / i18n 键对齐 /
 *    文件头唯一 / 枚举同源）由 scripts/check-contracts.mjs 逐条核对（总是真实核对）
 * 7) 对外 API 面：PlotPin.* 的顶层键 ↔ contracts/plugin-api.json 双向比对（总是真实核对）
 * 8) 删除记录：docs/deletions.md 字段齐全、无假删除
 * 9) 模块分层：js/ 下只允许 common/core/features，且加载顺序按层非递减（docs/modules.md）；
 *    state 的整体替换只允许出现在 replaceState 内（scripts 测试夹具按白名单放行）；
 *    9.2 core→features / common→core 的跨层引用按 contracts/coupling.json 计数（只减不增）；
 *    9.3 callHook ↔ registerHook 与 REQUIRED_HOOKS 必须配对；9.4 软调用必须分类登记。
 * 10) --selftest：显式执行逻辑层自测并把退出码纳入本门禁（CI 必须传）
 * 11) --selftest：i18n 覆盖率门禁（scripts/i18n-scan.mjs --check，D-11）
 * 12) Service Worker 缓存版本：预缓存输入指纹与 scripts/sw-inputs.sha256 不一致时 VERSION 必须递增（K1）
 *     6/7 在 --selftest 下额外跑判据自检（证明判据会红），自检不会替代真实核对。
 * 13) CSS 结构：去注释/字符串后花括号必须配平（未闭合的 @media 会静默吞掉其后所有规则）
 *
 * 用法：node scripts/check.mjs [--selftest]
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { walkFiles } from './lib/fs-utils.mjs';
import { findRemoteRefs } from './lib/offline-scan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const errors = [];
const html = readFileSync(join(root, 'index.html'), 'utf8');

/* 1. 语法校验 */
const jsFiles = walkFiles(join(root, 'js'), { ext: '.js' });
/* 工程脚本（开发工具）只需语法校验，不参与入口引用检查；scripts/lib 递归纳入，避免共享库语法错误逃逸 */
const toolFiles = walkFiles(join(root, 'scripts'), { ext: '.mjs' });
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

/* 4. 离线承诺：入口、样式、脚本都不得引用会发起网络请求的远程资源 */
for (const { file, kind, text } of [
  { file: 'index.html', kind: 'html', text: html },
  ...walkFiles(join(root, 'css'), { ext: '.css' }).map(f => (
    { file: relative(root, f).replace(/\\/g, '/'), kind: 'css', text: readFileSync(f, 'utf8') }
  )),
  ...jsFiles.map(f => (
    { file: relative(root, f).replace(/\\/g, '/'), kind: 'js', text: readFileSync(f, 'utf8') }
  ))
]) {
  for (const hit of findRemoteRefs(text, kind)) {
    errors.push(`远程资源（破坏离线双击即用）：${file}:${hit.line} ${hit.url}`);
  }
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

/* 9.1 状态写入口（片B）：`state = ...` 只允许出现在 replaceState 内。
   只靠约定迟早会被绕过；这里去注释/字符串后按行扫描，scripts 下的测试夹具整文件白名单。
   允许项仅两处：model.js 的 let 声明、persistence.js 中 replaceState 函数体。
   词法处理含正则字面量，避免正则里的引号把后续代码误吞造成假绿。 */
function stripJsForScan(src, keepStrings = false) {
  const out = [];
  let i = 0, prev = '';
  const regexOk = () => prev === '' || '([{,;:=!&|?+-*%~^<>'.includes(prev);
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out.push('\n');
        i++;
      }
      i += 2; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; const start = i; i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i++; break; }
        if (src[i] === '\n') out.push('\n');
        i++;
      }
      out.push(keepStrings ? src.slice(start, i) : q + q); prev = q; continue;
    }
    if (c === '/' && regexOk()) {
      i++;
      let cls = false;
      while (i < src.length) {
        const ch = src[i];
        if (ch === '\\') { i += 2; continue; }
        if (ch === '[') cls = true;
        else if (ch === ']') cls = false;
        else if (ch === '/' && !cls) { i++; break; }
        else if (ch === '\n') break;
        i++;
      }
      out.push('/r/'); prev = 'r'; continue;
    }
    out.push(c);
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out.join('');
}
const STATE_FIXTURES = new Set(['scripts/selftest.mjs', 'scripts/bench.mjs']);
const entryRel = 'js/core/persistence.js';
const entryLines = stripJsForScan(readFileSync(join(root, entryRel), 'utf8')).split('\n');
const entryStart = entryLines.findIndex(l => /function\s+replaceState\s*\(/.test(l));
let entryEnd = -1;
if (entryStart >= 0) {
  /* 先跳过参数表（默认值里可能有 {}），再对函数体的花括号配平 */
  let paren = 0, depth = 0, bodyStarted = false;
  for (let i = entryStart; i < entryLines.length && entryEnd < 0; i++) {
    for (const ch of entryLines[i]) {
      if (!bodyStarted) {
        if (ch === '(') paren++;
        else if (ch === ')') paren--;
        else if (ch === '{' && paren === 0) { bodyStarted = true; depth = 1; }
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) { entryEnd = i; break; }
    }
  }
}
if (entryStart < 0 || entryEnd < 0) errors.push('状态写入口缺失：js/core/persistence.js 必须定义 replaceState');
const stateScanFiles = [...jsFiles, ...Array.from(STATE_FIXTURES, p => join(root, p))];
for (const f of stateScanFiles) {
  const rel = relative(root, f).replace(/\\/g, '/');
  if (STATE_FIXTURES.has(rel)) continue;
  stripJsForScan(readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
    if (!/(^|[^.\w$])state\s*=(?![=>])/.test(line)) return;
    if (rel === 'js/core/model.js' && /^\s*let state\s*=\s*createInitialState\(\);?\s*$/.test(line)) return;
    if (rel === entryRel && i >= entryStart && i <= entryEnd) return;
    errors.push(`state 直接赋值只允许出现在 replaceState 内：${rel}:${i + 1}（请改用 replaceState(next,{...})）`);
  });
}

/* 9.2 分层耦合：core 不得依赖 features，common 不得依赖 core。
   口径与 contracts/coupling.json 严格相等（按 文件+符号+次数，不用行号）：基线只能下调。
   解析只认全仓唯一顶层声明；同文件已声明（含局部同名）与对象字面量键不计；
   1-2 字符标识符不计（误报率过高，改由人工复核）。入口层 app.js 允许编排 features。 */
const couplingRel = 'contracts/coupling.json';
let coupling = { softCalls: [], coreToFeatures: [], commonToCore: [] };
try {
  coupling = JSON.parse(readFileSync(join(root, couplingRel), 'utf8'));
} catch (e) {
  errors.push(`耦合基线缺失或非法：${couplingRel}`);
}
const jsRel = (f) => relative(root, f).replace(/\\/g, '/');
const layerOfRel = (rel) => rel === 'js/core/app.js' ? 'entry'
  : rel.startsWith('js/common/') ? 'common'
  : rel.startsWith('js/core/') ? 'core'
  : rel.startsWith('js/features/') ? 'features' : 'other';
const jsSrc = jsFiles.map(f => [jsRel(f), stripJsForScan(readFileSync(f, 'utf8'))]);
const declTop = new Map();
const declAny = new Map();
for (const [rel, text] of jsSrc) {
  const any = new Set();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const m = line.match(/(?:^|\s)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/)
      || line.match(/(?:^|\s)(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/);
    if (!m) continue;
    any.add(m[1]);
    if (!/^\s/.test(line)) {
      if (!declTop.has(m[1])) declTop.set(m[1], new Set());
      declTop.get(m[1]).add(rel);
    }
  }
  declAny.set(rel, any);
}
function crossLayerCounts(fromLayer, toLayer) {
  const counts = new Map();
  const keyRe = /([?.]?)([A-Za-z_$][\w$]*)(\s*:)/g;
  for (const [rel, text] of jsSrc) {
    if (layerOfRel(rel) !== fromLayer || rel === 'js/core/app.js') continue;
    text.split('\n').forEach((line, i) => {
      if (!line.trim()) return;
      const keyHits = new Set([...line.matchAll(keyRe)].map(m => m.index + m[1].length));
      for (const m of line.matchAll(/([?.]?)([A-Za-z_$][\w$]*)/g)) {
        if (m[1] || keyHits.has(m.index)) continue;
        const n = m[2];
        if (n.length < 3 || (declAny.get(rel) && declAny.get(rel).has(n))) continue;
        const d = declTop.get(n);
        if (!d || d.size !== 1) continue;
        const target = [...d][0];
        if (target === rel || layerOfRel(target) !== toLayer) continue;
        const key = `${rel}|${n}`;
        const cur = counts.get(key) || { file: rel, symbol: n, count: 0, first: i + 1 };
        cur.count++;
        counts.set(key, cur);
      }
    });
  }
  return counts;
}
for (const [listName, fromLayer, toLayer, label] of [
  ['coreToFeatures', 'core', 'features', 'core→features'],
  ['commonToCore', 'common', 'core', 'common→core']
]) {
  const allowed = new Map((coupling[listName] || []).map(e => [`${e.file}|${e.symbol}`, e.count]));
  const actual = crossLayerCounts(fromLayer, toLayer);
  for (const [key, v] of actual) {
    const a = allowed.get(key);
    if (a === undefined) errors.push(`${label} 未登记的跨层依赖：${v.file}:${v.symbol}（${v.count} 次，首处第 ${v.first} 行）——必需依赖改走 callHook，或在 ${couplingRel} 登记为已知违规`);
    else if (v.count > a) errors.push(`${label} 跨层引用增加：${v.file}:${v.symbol} ${a} → ${v.count} 次（${couplingRel} 只允许下调）`);
    else if (v.count < a) errors.push(`${label} 基线已过期：${v.file}:${v.symbol} 实际 ${v.count} 次、基线 ${a} 次——请同步下调 ${couplingRel}`);
  }
  for (const key of allowed.keys()) {
    if (!actual.has(key)) errors.push(`${label} 基线条目已失效：${key.replace('|', ':')}——请从 ${couplingRel} 删除`);
  }
}

/* 9.3 必需依赖注册表：callHook ↔ registerHook 一一配对，REQUIRED_HOOKS 必须全部注册。
   软调用只留给真正的可选特性；必需依赖靠这张表变成可检查的显式引用。 */
const hookCalls = new Set();
const hookRegs = new Map();
/* 钩子 id 本身是字符串字面量：必须用保留字符串模式扫描，9.2 的 jsSrc 会把 id 清成 ''。 */
const jsSrcKeepStrings = jsFiles.map(f => [jsRel(f), stripJsForScan(readFileSync(f, 'utf8'), true)]);
for (const [, text] of jsSrcKeepStrings) {
  for (const m of text.matchAll(/\bcallHook\(\s*['"]([\w.:-]+)['"]/g)) hookCalls.add(m[1]);
  for (const m of text.matchAll(/\bregisterHook\(\s*['"]([\w.:-]+)['"]/g)) hookRegs.set(m[1], (hookRegs.get(m[1]) || 0) + 1);
}
const cfgSrc = (jsSrcKeepStrings.find(([rel]) => rel === 'js/core/config.js') || [])[1] || '';
const reqMatch = cfgSrc.match(/REQUIRED_HOOKS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
const requiredHooks = reqMatch
  ? [...reqMatch[1].matchAll(/['"]([\w.:-]+)['"]/g)].map(m => m[1]) : [];
for (const id of requiredHooks) {
  if (!hookRegs.has(id)) errors.push(`必需钩子未注册：${id}（features 层缺少 registerHook）`);
  if (!hookCalls.has(id)) errors.push(`必需钩子无调用方：${id}（core 层缺少 callHook）`);
}
for (const id of hookCalls) {
  if (!hookRegs.has(id)) errors.push(`钩子无提供方：callHook('${id}') 找不到对应 registerHook`);
}
for (const [id, n] of hookRegs) {
  if (n > 1) errors.push(`钩子重复注册：${id}（${n} 处）`);
  if (!hookCalls.has(id) && !requiredHooks.includes(id)) errors.push(`钩子无使用方：registerHook('${id}') 没有任何 callHook`);
}
if (hookCalls.size || hookRegs.size) {
  console.log(`  [门禁] 依赖钩子：${hookRegs.size} 个提供方 / ${hookCalls.size} 个调用点 / ${requiredHooks.length} 个必需`);
}

/* 9.4 软调用分类完备：每个 typeof X==='function' 必须登记类别与次数（只减不增）。
   host/param 类不是依赖，但同样登记，便于把"不算依赖"这件事也落在纸面上。 */
const softActual = new Map();
for (const f of jsFiles) {
  const rel = jsRel(f);
  /* 保留字符串内容才能区分 'function' 与 'string'；整行以引号开头的是插件沙箱源码串，不参与统计。 */
  const text = stripJsForScan(readFileSync(f, 'utf8'), true);
  text.split('\n').forEach((line, i) => {
    if (/^\s*['"`]/.test(line)) return;
    for (const m of line.matchAll(/\btypeof\s+([A-Za-z_$][\w$]*)\s*===\s*(['"])function\2/g)) {
      const key = `${rel}|${m[1]}`;
      const cur = softActual.get(key) || { file: rel, symbol: m[1], count: 0, first: i + 1 };
      cur.count++;
      softActual.set(key, cur);
    }
  });
}
const softAllowed = new Map((coupling.softCalls || []).map(e => [`${e.file}|${e.symbol}`, e]));
const SOFT_CLASSES = new Set(['optional', 'required', 'host', 'param']);
for (const [key, v] of softActual) {
  const a = softAllowed.get(key);
  if (!a) {
    errors.push(`未分类的软调用：${v.file}:${v.symbol}（${v.count} 次，首处第 ${v.first} 行）——可选特性登记 optional，必需依赖改 callHook`);
    continue;
  }
  if (!SOFT_CLASSES.has(a.class)) errors.push(`软调用分类非法：${v.file}:${v.symbol} class=${a.class}`);
  if (v.count !== a.count) errors.push(`软调用次数与基线不一致：${v.file}:${v.symbol} 基线 ${a.count} 次、实际 ${v.count} 次`);
}
for (const key of softAllowed.keys()) {
  if (!softActual.has(key)) errors.push(`软调用基线条目已失效：${key.replace('|', ':')}——请从 ${couplingRel} 删除`);
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

/* 13. CSS 结构：去注释/字符串后花括号必须配平。
   未闭合的 @media 会让其后所有规则被静默吞进该媒体查询——语法合法、渲染错误，
   node --check 管不到，只能在样式生效前做结构校验。 */
const cssDir = join(root, 'css');
const cssFiles = existsSync(cssDir)
  ? readdirSync(cssDir).filter(n => n.endsWith('.css')).map(n => join(cssDir, n))
  : [];
for (const f of cssFiles) {
  const src = readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
  let depth = 0, extraCloseAt = -1;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth < 0 && extraCloseAt < 0) extraCloseAt = i; }
  }
  if (depth !== 0 || extraCloseAt >= 0) {
    const where = extraCloseAt >= 0
      ? `第 ${src.slice(0, extraCloseAt).split('\n').length} 行出现多余 }`
      : `文件末尾仍少 ${depth} 个 }`;
    errors.push(`CSS 结构未配平：${relative(root, f).replace(/\\/g, '/')}（${where}）`);
  }
}

if (errors.length) {
  console.error('❌ 工程自检未通过：');
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}
console.log(`✅ 工程自检通过：${jsFiles.length} 个脚本语法正确、入口资源完整、离线引用合规、断言数一致、契约守约、插件 API 面守约、模块分层守约、状态写入口守约、i18n 覆盖率守约、SW 缓存版本守约、CSS 结构配平`);
