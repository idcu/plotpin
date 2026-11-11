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

/** 从对象字面量里取顶层键：`name(` / `get name` / `name:` / ES6 简写 `name,`，按花括号配对离开内层。 */
function topLevelKeys(source, objectName) {
  const start = source.indexOf('const ' + objectName + ' = {');
  if (start < 0) throw new Error('找不到 const ' + objectName + ' = {');
  const open = source.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) throw new Error('花括号不配对');
  const body = source.slice(open + 1, end);

  const keys = [];
  let d = 0;
  let lineStart = true;
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === '{' || ch === '(' || ch === '[') d++;
    else if (ch === '}' || ch === ')' || ch === ']') d--;
    if (d === 0 && lineStart) {
      const rest = body.slice(i);
      /* 末尾的 `,` / `}` / 换行用于识别 ES6 简写属性（`syncExportOptions` 这类只写名字的键） */
      const m = rest.match(/^(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*(?:[(:,}]|$)/);
      if (m) {
        keys.push(m[1]);
        // 跳到该键的结束（顶层逗号）
        let j = i;
        let k = 0;
        while (j < body.length) {
          const c = body[j];
          if (c === '{' || c === '(' || c === '[') k++;
          else if (c === '}' || c === ')' || c === ']') k--;
          else if (c === ',' && k === 0) break;
          j++;
        }
        i = j + 1;
        lineStart = /\s/.test(body[i] || '');
        continue;
      }
    }
    if (ch === '\n') lineStart = true;
    else if (ch !== ' ' && ch !== '\t') lineStart = false;
    i++;
  }
  return keys;
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
  const keys = topLevelKeys(source, contract.object);
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
  return { keys, declared, leaked, missing, apiVersion: facts.version, caps: facts.caps, drift };
}

if (process.argv.includes('--selftest')) {
  const src = 'const X = { a(n) { return { b: 1 }; }, b: 2, get c() { return 3; }, d, e: 4 };';
  const got = topLevelKeys(src, 'X').join(',');
  if (got !== 'a,b,c,d,e') {
    console.error('SELFTEST FAILED：期望 a,b,c,d,e，实得 ' + got);
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
  console.log('plugin-api selftest: 解析器对内层花括号、方法简写、getter、ES6 简写属性四种形态都取对了；版本/能力与契约描述解析一致');
  process.exit(0);
}

const r = check();
if (r.error) { console.error('plugin-api: FAILED ' + r.error); process.exit(1); }
console.log('plugin-api: ' + r.keys.length + ' 个键，清单 ' + r.declared.length + ' 条，'
  + r.leaked.length + ' 处泄漏，' + r.missing.length + ' 处落空；API ' + r.apiVersion + ' / '
  + r.caps.length + ' 项能力，契约描述漂移 ' + r.drift.length + ' 处');
for (const k of r.leaked) console.error('  - ' + k + '：代码里有、契约没登记（插件可能已经依赖它）');
for (const k of r.missing) console.error('  - ' + k + '：契约登记了、代码里没有（承诺落空）');
for (const d of r.drift) console.error('  - ' + d + '：契约描述与代码不同源');
process.exitCode = r.leaked.length + r.missing.length + r.drift.length ? 1 : 0;
