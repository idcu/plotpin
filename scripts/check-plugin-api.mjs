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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTRACT = path.join(ROOT, 'contracts', 'plugin-api.json');

/** 从对象字面量里取顶层键：`name(` / `get name` / `name:`，按花括号配对离开内层。 */
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
      const m = rest.match(/^(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*(?:\(|:)/);
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

function check() {
  const contract = JSON.parse(fs.readFileSync(CONTRACT, 'utf8'));
  const file = path.join(ROOT, contract.file);
  if (!fs.existsSync(file)) return { error: contract.file + ' 不存在' };
  const keys = topLevelKeys(fs.readFileSync(file, 'utf8'), contract.object);
  const declared = Object.keys(contract.api || {});
  const leaked = keys.filter((k) => !declared.includes(k));
  const missing = declared.filter((k) => !keys.includes(k));
  return { keys, declared, leaked, missing };
}

if (process.argv.includes('--selftest')) {
  const src = 'const X = { a(n) { return { b: 1 }; }, b: 2, get c() { return 3; } };';
  const got = topLevelKeys(src, 'X').join(',');
  if (got !== 'a,b,c') {
    console.error('SELFTEST FAILED：期望 a,b,c，实得 ' + got);
    process.exit(1);
  }
  console.log('plugin-api selftest: 解析器对内层花括号、方法简写、getter 三种形态都取对了');
  process.exit(0);
}

const r = check();
if (r.error) { console.error('plugin-api: FAILED ' + r.error); process.exit(1); }
console.log('plugin-api: ' + r.keys.length + ' 个键，清单 ' + r.declared.length + ' 条，'
  + r.leaked.length + ' 处泄漏，' + r.missing.length + ' 处落空');
for (const k of r.leaked) console.error('  - ' + k + '：代码里有、契约没登记（插件可能已经依赖它）');
for (const k of r.missing) console.error('  - ' + k + '：契约登记了、代码里没有（承诺落空）');
process.exitCode = r.leaked.length + r.missing.length ? 1 : 0;
