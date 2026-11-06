/**
 * i18n-scan.mjs —— 中英文案覆盖率可复跑扫描器（B-14）
 *
 * 口径（实测，非估算）：
 * 1) 只扫 js/**\/*.js 的字符串字面量（单引号 / 双引号 / 模板串），按字符串值去重；
 *    注释、标识符与 i18n 字典文件本身不计入。
 * 2) 「走翻译入口」= 字面量是 L(...) / I18N.p(...) / I18N.fmt(...) 的第一个实参，
 *    或直接作为 toast / commitChange / openModal / showConfirm / collabNotifyThrottled 的
 *    文案实参（这些 UI sink 在运行时统一调用 L()）。这些字面量是中文短语 key，不是未翻译硬编码。
 * 3) 「硬编码中文」= 含 CJK 的字面量中，未被上述入口包裹的部分（去重条数）。
 * 4) 「已字典化」= 走翻译入口的中文 key 且存在于 I18N.phrases 或 I18N.templates；
 *    「缺口」= 走入口但字典未收录（英文界面会回退中文）。
 * 5) 覆盖率 = 已字典化 / (已字典化 + 缺口 + 硬编码)，分母全部为去重后的中文字符串条数。
 *
 * 用法：node scripts/i18n-scan.mjs [--json]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const HAN = /[\u4e00-\u9fff]/;

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : (p.endsWith('.js') ? [p] : []);
  });
}

/** 逐字符扫描：跳过注释，收集字符串字面量与其起始偏移 */
function literalsOf(src) {
  const out = [];
  let i = 0;
  let state = 'code';
  while (i < src.length) {
    const ch = src[i];
    const nx = src[i + 1];
    if (state === 'line') {
      if (ch === '\n') state = 'code';
      i++;
      continue;
    }
    if (state === 'block') {
      if (ch === '*' && nx === '/') { state = 'code'; i += 2; continue; }
      i++;
      continue;
    }
    if (ch === '/' && nx === '/') { state = 'line'; i += 2; continue; }
    if (ch === '/' && nx === '*') { state = 'block'; i += 2; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') {
      const quote = ch;
      const start = i;
      i++;
      let value = '';
      while (i < src.length) {
        const c = src[i];
        if (c === '\\') { value += c + (src[i + 1] || ''); i += 2; continue; }
        if (c === quote) { i++; break; }
        value += c;
        i++;
      }
      out.push({ value, start });
      continue;
    }
    i++;
  }
  return out;
}

const TRANSLATED_CALL = /(?:\bL|\bI18N\.p|\bI18N\.t|\bI18N\.fmt|\bI18N\.tpl|\btoast|\bcommitChange|\bopenModal|\bshowConfirm|\bcollabNotifyThrottled)\s*\(\s*$/;
const files = walk(join(root, 'js')).filter(f => !f.endsWith(join('js', 'common', 'i18n.js')));
const byValue = new Map();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const rel = relative(root, f).replace(/\\/g, '/');
  for (const lit of literalsOf(src)) {
    if (!HAN.test(lit.value)) continue;
    const wrapped = TRANSLATED_CALL.test(src.slice(Math.max(0, lit.start - 40), lit.start));
    const rec = byValue.get(lit.value) || { value: lit.value, wrapped: false, files: new Set() };
    rec.wrapped = rec.wrapped || wrapped;
    rec.files.add(rel);
    byValue.set(lit.value, rec);
  }
}

/* 运行时读取字典条目数（不靠正则数 JSON） */
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(root, 'js', 'common', 'i18n.js'), 'utf8'), sandbox);
const I18N = sandbox.I18N;
const phrases = Object.keys(I18N.phrases || {});
const templates = Object.keys(I18N.templates || {});
const dictZh = Object.keys((I18N.dict && I18N.dict.zh) || {});

const all = Array.from(byValue.values());
const wrapped = all.filter(r => r.wrapped);
const hardcoded = all.filter(r => !r.wrapped);
const covered = wrapped.filter(r => (I18N.phrases && I18N.phrases[r.value] !== undefined) || (I18N.templates && I18N.templates[r.value] !== undefined));
const missing = wrapped.filter(r => !covered.includes(r));
const hardcodedCovered = hardcoded.filter(r => (I18N.phrases && I18N.phrases[r.value] !== undefined) || (I18N.templates && I18N.templates[r.value] !== undefined));
const total = covered.length + missing.length + hardcoded.length;
const report = {
  files: files.length,
  literals: all.length,
  wrapped: wrapped.length,
  hardcoded: hardcoded.length,
  hardcodedInDict: hardcodedCovered.length,
  hardcodedUncovered: hardcoded.length - hardcodedCovered.length,
  covered: covered.length,
  missing: missing.length,
  phrases: phrases.length,
  templates: templates.length,
  dictZh: dictZh.length,
  coveragePct: total ? Math.round((covered.length / total) * 10000) / 100 : 0,
  hardcodedTop: hardcoded.slice(0, 30).map(r => ({ text: r.value, files: Array.from(r.files) })),
  missingTop: missing.slice(0, 30).map(r => ({ text: r.value, files: Array.from(r.files) })),
  hardcodedInDictTop: hardcodedCovered.slice(0, 300).map(r => ({ text: r.value, files: Array.from(r.files) })),
  hardcodedByFile: Object.entries(hardcoded.reduce((acc, r) => {
    const f = Array.from(r.files)[0];
    acc[f] = (acc[f] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1])
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`i18n 扫描（${report.files} 个业务脚本，字典文件除外）`);
  console.log(`字面量去重：${report.literals}`);
  console.log(`走翻译入口：${report.wrapped}（已字典化 ${report.covered} / 缺口 ${report.missing}）`);
  console.log(`未走翻译入口的硬编码中文：${report.hardcoded}`);
  console.log(`字典：PHRASES ${report.phrases} 条 / TEMPLATES ${report.templates} 条 / DICT.zh ${report.dictZh} 键`);
  console.log(`覆盖率：${report.coveragePct}%（口径见文件头）`);
  if (report.hardcodedTop.length) {
    console.log('硬编码样例：');
    report.hardcodedTop.slice(0, 10).forEach(r => console.log(`  - ${r.text}  (${r.files.join(', ')})`));
  }
}
