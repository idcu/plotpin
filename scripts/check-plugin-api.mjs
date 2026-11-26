/**
 * check-plugin-api.mjs —— 对外 API 承诺面判据（零依赖）
 *
 * 插件生态的边界不是"能不能调"，而是"**调了算数吗**"。`PlotPin` 对象上每多一个键，
 * 就多一个别人可以依赖、你却不能随便改的东西；每少一个键，就是一句承诺落空。
 * 这条判据把两边钉在一起：
 *
 *   代码里有的键 —— 必须在 contracts/plugin-api.json 里登记（否则是**未承诺的 API 泄漏**）
 *   清单里有的键 —— 必须在代码里真的存在（否则是**落空的承诺**）
 *
 * 为什么需要它：`PlotPin` 是个普通对象字面量，加一个内部方法（比如 `syncExportOptions`）
 * 不会有人察觉；但插件一旦用了它，改名就是破坏兼容——而这种事**没有报错**，
 * 只在别人升级后静默坏掉。
 *
 * 用法：node scripts/check-plugin-api.mjs [--selftest]
 * 退出码：0 一致；1 有漂移。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from './lib/fs-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTRACT = path.join(ROOT, 'contracts', 'plugin-api.json');

/** 跳过字符串/模板串，返回闭合引号下标（未闭合则到文件尾）。 */
function skipQuoted(src, i) {
  const q = src[i];
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') { j++; continue; }
    if (src[j] === q) return j;
  }
  return src.length - 1;
}
function skipComment(src, i) {
  if (src[i + 1] === '/') {
    const n = src.indexOf('\n', i + 2);
    return n < 0 ? src.length - 1 : n;
  }
  const n = src.indexOf('*/', i + 2);
  return n < 0 ? src.length - 1 : n + 1;
}
/** 配对括号：从 open 开始找同类型闭合位置（跳过字符串/注释）。 */
function matching(src, open) {
  const opener = src[open];
  const closer = { '{': '}', '(': ')', '[': ']' }[opener];
  if (!closer) return -1;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\'' || ch === '"' || ch === '`') { i = skipQuoted(src, i); continue; }
    if (ch === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) { i = skipComment(src, i); continue; }
    if (ch === opener) depth++;
    else if (ch === closer) { depth--; if (!depth) return i; }
  }
  return -1;
}
/** 从 pos 跳到当前层级的下一个逗号（跳过嵌套括号、字符串、注释），返回逗号下标或 body 末尾。 */
function nextComma(body, pos, end) {
  let d = 0;
  for (let i = pos; i < end; i++) {
    const ch = body[i];
    if (ch === '\'' || ch === '"' || ch === '`') { i = skipQuoted(body, i); continue; }
    if (ch === '/' && (body[i + 1] === '/' || body[i + 1] === '*')) { i = skipComment(body, i); continue; }
    if (ch === '{' || ch === '(' || ch === '[') d++;
    else if (ch === '}' || ch === ')' || ch === ']') { if (!d) return i; d--; }
    else if (ch === ',' && !d) return i;
  }
  return end;
}
/** 只接受字符串字面量形式的计算键；`[expr]` 返回 null（无法静态确认）。 */
function literalKey(expr) {
  const s = expr.trim();
  const m = s.match(/^'([^'\\]*)'$/) || s.match(/^"([^"\\]*)"$/);
  return m ? m[1] : null;
}
/**
 * 从对象字面量里取顶层键：`name(` / `get name` / `name:` / ES6 简写 `name,` /
 * 字符串键 `'name':` / 字面量计算键 `['name']:`。按花括号配对离开内层，跳过字符串与注释。
 * 返回 { keys, dynamic }：dynamic 记录无法静态确认的写法（展开 `...x`、`[expr]` 等），
 * 由 check() 按失败处理——不能因为“解析器看不懂”就当作没有这个键。
 */
function topLevelKeys(source, objectName) {
  const marker = 'const ' + objectName + ' = {';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('找不到 const ' + objectName + ' = {');
  const open = start + marker.length - 1;
  const end = matching(source, open);
  if (end < 0) throw new Error('花括号不配对');
  const body = source.slice(open + 1, end);

  const keys = [];
  const dynamic = [];
  let i = 0;
  while (i < body.length) {
    /* 跳过空白、逗号与注释 */
    while (i < body.length && /\s|,/.test(body[i])) i++;
    if (i >= body.length) break;
    if (body[i] === '/' && (body[i + 1] === '/' || body[i + 1] === '*')) { i = skipComment(body, i) + 1; continue; }
    if (body.startsWith('...', i)) {
      const stop = nextComma(body, i + 3, body.length);
      dynamic.push('展开 ' + body.slice(i, Math.min(stop, i + 40)).trim());
      i = stop + 1;
      continue;
    }
    let key = null;
    if (body[i] === '[') {
      const close = matching(body, i);
      if (close < 0) throw new Error('计算键方括号不配对');
      key = literalKey(body.slice(i + 1, close));
      if (key === null) dynamic.push('计算键 ' + body.slice(i, close + 1).slice(0, 40));
      i = close + 1;
    } else if (body[i] === '\'' || body[i] === '"') {
      const close = skipQuoted(body, i);
      key = body.slice(i + 1, close);
      i = close + 1;
    } else {
      const m = body.slice(i).match(/^(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*|\d+)/);
      if (!m) {
        const stop = nextComma(body, i, body.length);
        dynamic.push('无法解析 ' + body.slice(i, Math.min(stop, i + 40)).trim());
        i = stop + 1;
        continue;
      }
      key = m[1];
      i += m[0].length;
    }
    if (key !== null) keys.push(key);
    i = nextComma(body, i, body.length) + 1;
  }
  return { keys, dynamic };
}

/** 声明之后对 PlotPin 的运行时扩展/改写（Object.assign / defineProperty / 属性赋值）同样会改变承诺面。 */
function runtimeExtensions(source, objectName) {
  const name = objectName.replace(/\$/g, '\\$');
  const out = [];
  for (const re of [
    new RegExp('Object\\.assign\\(\\s*' + name + '\\b', 'g'),
    new RegExp('Object\\.defineProper(?:ty|ties)\\(\\s*' + name + '\\b', 'g'),
    new RegExp('\\b' + name + '\\s*\\[\\s*[^\\]]+\\]\\s*=(?!=)', 'g'),
    new RegExp('\\b' + name + '\\s*\\.\\s*[A-Za-z_$][\\w$]*\\s*=(?!=)', 'g')
  ]) {
    for (const m of source.matchAll(re)) out.push(m[0].replace(/\s+/g, ' ').slice(0, 60));
  }
  return out;
}

/** 从源码取插件 API 版本与能力键；契约描述必须与代码同源，否则只是「口头承诺」。 */
function apiFacts(source) {
  const ver = source.match(/const PLUGIN_API_VERSION = '([^']+)'/);
  const block = source.match(/const PLUGIN_CAPABILITIES = Object\.freeze\(\{([\s\S]*?)\}\);/);
  const caps = block ? [...block[1].matchAll(/'([^']+)':/g)].map((m) => m[1]) : [];
  return { version: ver ? ver[1] : null, caps };
}

/** 契约里 apiVersion/capabilities 两段描述是给人看的；这里把可校验的部分抽出来。 */
function contractFacts(api) {
  const desc = api || {};
  const m = String(desc.capabilities || '').match(/（([^）]*)）/);
  const listed = m ? m[1].split('/').map((s) => s.trim()).filter(Boolean) : [];
  return { versionText: String(desc.apiVersion || ''), listed };
}

function check() {
  const contract = readJson(CONTRACT);
  const file = path.join(ROOT, contract.file);
  if (!fs.existsSync(file)) return { error: contract.file + ' 不存在' };
  const source = fs.readFileSync(file, 'utf8');
  const { keys, dynamic } = topLevelKeys(source, contract.object);
  const ext = runtimeExtensions(source, contract.object);
  const declared = Object.keys(contract.api || {});
  const leaked = keys.filter((k) => !declared.includes(k));
  const missing = declared.filter((k) => !keys.includes(k));
  const facts = apiFacts(source);
  const cf = contractFacts(contract.api);
  const drift = [];
  if (!facts.version) drift.push('plugins.js 缺少 PLUGIN_API_VERSION 常量');
  else if (!cf.versionText.includes(facts.version)) drift.push('契约 apiVersion 描述未登记代码版本 ' + facts.version);
  for (const c of facts.caps) if (!cf.listed.includes(c)) drift.push('契约 capabilities 漏登记 ' + c);
  for (const c of cf.listed) if (!facts.caps.includes(c)) drift.push('契约 capabilities 登记了代码没有的 ' + c);
  return { keys, dynamic, ext, declared, leaked, missing, apiVersion: facts.version, caps: facts.caps, drift };
}

if (process.argv.includes('--selftest')) {
  const src = 'const X = { a(n) { return { b: 1 }; }, b: 2, get c() { return 3; }, d, e: 4 };';
  const got = topLevelKeys(src, 'X').keys.join(',');
  if (got !== 'a,b,c,d,e') {
    console.error('SELFTEST FAILED：期望 a,b,c,d,e，实得 ' + got);
    process.exit(1);
  }
  const s2 = topLevelKeys("const X = { 'a-b': 1, ['c']: 2, [k]: 3, ...y, d: 4 /* } */ };", 'X');
  if (s2.keys.join(',') !== 'a-b,c,d' || s2.dynamic.length !== 2) {
    console.error('SELFTEST FAILED：字符串键/字面量计算键/展开/动态键期望 a-b,c,d + 2 处动态，实得 '
      + s2.keys.join(',') + ' + ' + s2.dynamic.length);
    process.exit(1);
  }
  const ext = runtimeExtensions('PlotPin.x = 1;\nPlotPin["y"] = 2;\nObject.assign(PlotPin, { z: 3 });', 'PlotPin');
  if (ext.length !== 3) {
    console.error('SELFTEST FAILED：运行时改写期望 3 处，实得 ' + ext.length);
    process.exit(1);
  }
  const f = apiFacts("const PLUGIN_API_VERSION = '1.2.3';\n"
    + "const PLUGIN_CAPABILITIES = Object.freeze({ 'a': '甲', 'b:c': '乙' });");
  if (f.version !== '1.2.3' || f.caps.join(',') !== 'a,b:c') {
    console.error('SELFTEST FAILED：版本/能力解析期望 1.2.3 + a,b:c，实得 ' + f.version + ' + ' + f.caps.join(','));
    process.exit(1);
  }
  const cf = contractFacts({ apiVersion: '当前 1.2.3', capabilities: '能力白名单表（a/b:c）' });
  if (!cf.versionText.includes('1.2.3') || cf.listed.join(',') !== 'a,b:c') {
    console.error('SELFTEST FAILED：契约描述解析期望 1.2.3 + a,b:c，实得 ' + cf.listed.join(','));
    process.exit(1);
  }
  console.log('plugin-api selftest: 字面量键/方法简写/getter/ES6 简写/字符串键/字面量计算键解析正确，展开与动态计算键被记为待确认，声明后赋值被识别为运行时改写；版本与契约描述一致');
  process.exit(0);
}

const r = check();
if (r.error) { console.error('plugin-api: FAILED ' + r.error); process.exit(1); }
console.log('plugin-api: ' + r.keys.length + ' 个键，清单 ' + r.declared.length + ' 条，'
  + r.leaked.length + ' 处泄漏，' + r.missing.length + ' 处落空，'
  + r.dynamic.length + ' 处无法静态确认，' + r.ext.length + ' 处运行时改写；API ' + r.apiVersion + ' / '
  + r.caps.length + ' 项能力，契约描述漂移 ' + r.drift.length + ' 处');
for (const k of r.leaked) console.error('  - ' + k + '：代码里有、契约没登记（插件可能已经依赖它）');
for (const k of r.missing) console.error('  - ' + k + '：契约登记了、代码里没有（承诺落空）');
for (const d of r.dynamic) console.error('  - ' + d + '：无法静态确认的键写法（按失败处理，改成字面量键）');
for (const e of r.ext) console.error('  - ' + e + '：声明后运行时改写 ' + 'PlotPin' + '（承诺面被绕过）');
for (const d of r.drift) console.error('  - ' + d + '：契约描述与代码不同源');
process.exitCode = r.leaked.length + r.missing.length + r.dynamic.length + r.ext.length + r.drift.length ? 1 : 0;
