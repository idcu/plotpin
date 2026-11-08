/**
 * check-contracts.mjs —— 契约判据：读 contracts/conventions.json，逐条核对代码是否守约
 *
 * 契约先于代码（见 docs/engineering.md）：每条约定先写成一份机器可读的数据，
 * 再由本脚本把「契约说什么」与「代码在做什么」对上。判据只做一件事——
 * **把漂移说出来**，而不是猜哪个才是对的。
 *
 * 逐条：
 *   1. 版本号三处一致（package.json / ngm.json / PlotPin.version）
 *   2. i18n 键对齐（zh ↔ en 同键集；index.html 的 data-i18n* 键都有译文）
 *   3. 文件头唯一且与文件名一致（每个 js 脚本恰好一行）
 *   4. 枚举同源（契约里列出的两处集合必须相等）
 *
 * 在逐条核对之前先做契约结构校验：契约文件既是判据来源又是被检查对象，
 * 规则被删空时若只看 violations，会以「0 项核对，0 处违约」退 0，等于门禁被静默关闭。
 *
 * 用法：
 *   node scripts/check-contracts.mjs              检查本仓库
 *   node scripts/check-contracts.mjs --root=<dir> 检查任意根（自检用）
 *   node scripts/check-contracts.mjs --selftest   用临时树证明判据会红（牙齿）
 */

import { readFileSync, existsSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, basename } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

function argValue(name) {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function walkJs(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkJs(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** 按点分路径取值（契约里用 `version` 这种浅路径，不引入 JSONPath）。 */
function pick(obj, dotted) {
  return dotted.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

/** 逐条核对的最低读数：低于这个数说明规则被削弱，而不是「恰好没有违约」。 */
const MIN_READINGS = 6;

/** 契约结构校验：规则数量/必备段落是否还在。规则被删空同样算违约。 */
function validateContract(c) {
  const violations = [];
  let readings = 0;
  const require = (ok, msg) => { readings++; if (!ok) violations.push(msg); };
  require(Array.isArray(c.versionSources) && c.versionSources.length >= 3,
    `契约 versionSources 少于 3 条（实有 ${Array.isArray(c.versionSources) ? c.versionSources.length : 0} 条），版本锚点无法交叉校验`);
  require(c.i18n && typeof c.i18n.source === 'string' && typeof c.i18n.html === 'string',
    '契约 i18n 规则缺失：必须同时声明 source 与 html');
  require(c.headers && typeof c.headers.root === 'string',
    '契约 headers 规则缺失：必须声明 root');
  require(Array.isArray(c.enums) && c.enums.length >= 1,
    '契约 enums 规则为空：枚举同源检查被关闭');
  return { readings, violations };
}

/** i18n 字典：用 vm 跑一遍源文件，取它自己挂到全局的导出面。
 *  不另写一个解析器——两份实现必然漂移，而"检查器与产品不一致"比没有检查器更糟。 */
function loadDict(file) {
  const src = readFileSync(file, 'utf8');
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: file });
  const dict = sandbox.I18N && sandbox.I18N.dict;
  if (!dict || !dict.zh || !dict.en) throw new Error('i18n 源没有导出 I18N.dict.zh / .en');
  return dict;
}

function check(root) {
  const contract = readJson(join(root, 'contracts', 'conventions.json'));
  let violations = [];
  let readings = 0;

  /* 契约规则本身还在不在：删空规则必须红，而不是「0 项核对，0 处违约」全绿。 */
  const shape = validateContract(contract);
  readings += shape.readings;
  if (shape.violations.length) return { readings, violations: shape.violations };

  /* 1. 版本号三处一致 */
  const versions = [];
  for (const src of contract.versionSources || []) {
    const file = join(root, src.file);
    let value = null;
    if (!existsSync(file)) {
      violations.push(`${src.file} 不存在（契约点名的版本来源）`);
    } else if (src.path) {
      value = pick(readJson(file), src.path);
    } else if (src.pattern) {
      const m = readFileSync(file, 'utf8').match(new RegExp(src.pattern));
      value = m ? m[1] : null;
      if (!value) violations.push(`${src.file} 里匹配不到版本号（模式：${src.pattern}）`);
    }
    readings++;
    versions.push({ file: src.file, value: String(value) });
  }
  const distinct = new Set(versions.map(v => v.value));
  if (distinct.size > 1) {
    violations.push('版本号不一致：' + versions.map(v => `${v.file}=${v.value}`).join(' · '));
  }

  /* 2. i18n 键对齐 */
  if (contract.i18n) {
    const dict = loadDict(join(root, contract.i18n.source));
    readings++;
    const zh = new Set(Object.keys(dict.zh));
    const en = new Set(Object.keys(dict.en));
    const missingEn = [...zh].filter(k => !en.has(k));
    const extraEn = [...en].filter(k => !zh.has(k));
    if (missingEn.length) violations.push('en 缺少键：' + missingEn.join(', '));
    if (extraEn.length) violations.push('en 多出键（zh 没有）：' + extraEn.join(', '));
    for (const k of zh) {
      if (!String(dict.zh[k] || '').trim()) violations.push(`zh.${k} 是空文案`);
      if (!String(dict.en[k] || '').trim() && en.has(k)) violations.push(`en.${k} 是空文案`);
    }

    const htmlFile = join(root, contract.i18n.html);
    const html = readFileSync(htmlFile, 'utf8');
    const keys = new Set([...html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map(m => m[1]));
    readings++;
    const unkeyed = [...keys].filter(k => !zh.has(k));
    if (unkeyed.length) violations.push('index.html 引用了字典里没有的键：' + unkeyed.join(', '));
  }

  /* 3. 文件头唯一且与文件名一致 */
  if (contract.headers) {
    const files = walkJs(join(root, contract.headers.root));
    readings++;
    const offenders = [];
    for (const f of files) {
      const lines = readFileSync(f, 'utf8').split(/\r?\n/).slice(0, 4);
      const heads = lines
        .map(l => l.match(/^\/\* ([\w.-]+\.(?:js|mjs)) —— /))
        .filter(Boolean)
        .map(m => m[1]);
      const want = basename(f);
      if (heads.length === 0) offenders.push(`${relative(root, f)}：缺文件头 /* ${want} —— 职责 */`);
      else if (heads.length > 1) offenders.push(`${relative(root, f)}：有 ${heads.length} 行文件头（互相矛盾）`);
      else if (heads[0] !== want) offenders.push(`${relative(root, f)}：文件头写的是 ${heads[0]}，与文件名不符`);
    }
    offenders.forEach(o => violations.push(o));
  }

  /* 4. 枚举同源 */
  for (const rule of contract.enums || []) {
    const grab = (spec) => {
      const m = readFileSync(join(root, spec.file), 'utf8').match(new RegExp(spec.pattern));
      if (!m) return null;
      // A 侧是对象字面量（裸键），B 侧是数组（带引号）：两种都按标识符/字符串提取。
      // 末尾元素后面没有逗号，所以 lookahead 必须接受"字符串结束"——否则每次都比少一个，
      // 而少的那一个恰好是数组的最后一项（这是自检抓出来的，不是想出来的）。
      return new Set([...m[1].matchAll(/(?:^|[,{\s])['"]?([A-Za-z_$][\w$]*)['"]?(?=\s*(?:[:,]|$))/g)].map(x => x[1]));
    };
    const a = grab(rule.a);
    const b = grab(rule.b);
    readings++;
    if (!a || !b) {
      violations.push(`枚举 ${rule.name}：匹配不到 ${!a ? rule.a.file : rule.b.file} 的集合`);
      continue;
    }
    const onlyA = [...a].filter(x => !b.has(x));
    const onlyB = [...b].filter(x => !a.has(x));
    if (onlyA.length || onlyB.length) {
      violations.push(`枚举 ${rule.name} 不同源：仅 ${rule.a.file} 有 [${onlyA.join(', ')}]；`
        + `仅 ${rule.b.file} 有 [${onlyB.join(', ')}]`);
    }
  }

  /* 读数下限：规则被逐条删减但仍能跑完时，最终读数会低于基线。 */
  if (readings < MIN_READINGS) {
    violations.push(`契约核对读数 ${readings} < 最低要求 ${MIN_READINGS}（判据被削弱）`);
  }

  return { readings, violations };
}

function report(result, root) {
  const ok = result.violations.length === 0;
  console.log(`${ok ? '✅' : '❌'} contracts: ${result.readings} 项核对，${result.violations.length} 处违约`
    + `（${relative(process.cwd(), root) || '.'}）`);
  for (const v of result.violations) console.error('  - ' + v);
}

/* --selftest：造一棵必然违约的临时树，断言四类发现各命中至少一次。
   没有它，这条判据就只是"看起来在检查"——从未红过的判据与没有判据，
   区别只在于前者更贵。 */
function selftest() {
  const dir = mkdtempSync(join(tmpdir(), 'plotpin-contracts-'));
  const write = (relPath, body) => {
    const full = join(dir, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body, 'utf8');
  };
  try {
    write('contracts/conventions.json', JSON.stringify({
      schemaVersion: 1,
      versionSources: [
        { file: 'package.json', path: 'version' },
        { file: 'ngm.json', path: 'version' },
        { file: 'js/features/plugins.js', pattern: "version:\\s*'([0-9.]+)'" }
      ],
      i18n: { source: 'js/common/i18n.js', html: 'index.html' },
      headers: { root: 'js' },
      enums: [{
        name: 'k',
        a: { file: 'js/a.js', pattern: 'A\\s*=\\s*\\{([^}]*)\\}' },
        b: { file: 'js/b.js', pattern: 'B\\s*=\\s*\\[([^\\]]*)\\]' }
      }]
    }, null, 2));
    write('package.json', JSON.stringify({ version: '1.0.0' }));
    write('ngm.json', JSON.stringify({ version: '1.0.0' }));
    write('js/features/plugins.js', '/* plugins.js —— x */\nconst PlotPin = { version: \'0.9.0\' };\n');
    write('js/common/i18n.js', '(function (g) { g.I18N = { dict: { zh: { a: \'A\' }, en: {} } }; })(this)\n');
    write('index.html', '<button data-i18n="nope">x</button>\n');
    write('js/dup.js', '/* dup.js —— 第一行 */\n/* dup.js —— 第二行 */\n');
    write('js/nohead.js', 'const x = 1;\n');
    write('js/a.js', 'const A = { p: 1, q: 2 };\n');
    write('js/b.js', "const B = ['p'];\n");

    const r = check(dir);
    const text = r.violations.join('\n');
    const want = [
      ['版本号不一致', /版本号不一致/],
      ['en 缺键', /en 缺少键/],
      ['html 未登记键', /data-i18n|字典里没有的键/],
      ['重复文件头', /2 行文件头/],
      ['缺文件头', /缺文件头/],
      ['枚举不同源', /不同源/]
    ];
    const missing = want.filter(([, re]) => !re.test(text)).map(([name]) => name);
    if (missing.length) {
      console.error('SELFTEST FAILED：以下形态没有被判出来 → ' + missing.join('、'));
      console.error(text);
      process.exitCode = 1;
      return;
    }

    /* 空契约不得静默变绿（审计 P2-01）：规则删空后必须报违约，而不是 0 项核对退 0。 */
    write('contracts/conventions.json', JSON.stringify({
      schemaVersion: 1, versionSources: [], i18n: null, headers: null, enums: []
    }, null, 2));
    const empty = check(dir);
    if (!empty.violations.length || !/契约/.test(empty.violations.join('\n'))) {
      console.error('SELFTEST FAILED：空契约没有变红（读数 ' + empty.readings
        + '，违约 ' + empty.violations.length + '）——0 项核对被当成了通过');
      process.exitCode = 1;
      return;
    }

    console.log(`contracts selftest：6 类违约全部被识别（${r.violations.length} 条）；`
      + `空契约被拒绝（读数 ${empty.readings}，违约 ${empty.violations.length} 条）`);
    process.exitCode = 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv.includes('--selftest')) {
  selftest();
} else {
  const root = argValue('root') ? join(process.cwd(), argValue('root')) : repoRoot;
  const result = check(root);
  report(result, root);
  process.exitCode = result.violations.length ? 1 : 0;
}
