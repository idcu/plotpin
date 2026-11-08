/**
 * i18n-scan.mjs —— 中英文案覆盖率可复跑扫描器（B-14 / D-11）
 *
 * 口径（实测，非估算）：
 * 1) 只扫 js/**\/*.js 的字符串字面量（单引号 / 双引号 / 模板串），按字符串值去重；
 *    注释、标识符与 i18n 字典文件本身不计入。
 * 2) 「走翻译入口」= 字面量是 L(...) / I18N.p(...) / I18N.fmt(...) 的第一个实参，
 *    或直接作为 toast / commitChange / openModal / showConfirm / collabNotifyThrottled 的
 *    文案实参（这些 UI sink 在运行时统一调用 L()）。
 * 3) 「硬编码中文」= 含 CJK 的字面量中，未被上述入口包裹的部分（去重条数）。
 * 4) 「已字典化」= 走翻译入口的中文 key 且存在于 I18N.phrases 或 I18N.templates；
 *    「缺口」= 走入口但字典未收录（英文界面会回退中文）。含 `${...}` 的复合模板串是
 *    句子拼接壳（内部片段已走 L()），不是可登记的整句 key，不计为缺口。
 * 5) 覆盖率 = 已字典化 / (已字典化 + 缺口 + 硬编码)，分母全部为去重后的中文字符串条数。
 * 6) 模板内中文（D-15）：含 `${...}` 的模板串按静态片段拆分，HTML 标签只取文本节点
 *    以及 title / aria-label / placeholder / alt 的属性值；这些片段与普通字面量一样
 *    进入覆盖率分母。UI 文件里「模板内、未走翻译入口、不在显式白名单」的片段由
 *    `templateCopy` 单独计数，门槛为 0（新增硬编码中文会被立即拦截）。
 *    白名单 `TEMPLATE_ALLOW` 只允许语言选项的母语自称「中文」（`English` 为英文 UI 的母语名，
 *    切换目标语言必须能被使用者自识别），不是批量豁免旧文案的入口。
 *
 * D-11「UI 文案硬编码 ≤20」的可复算定义（与体积预算互斥后的口径修正，见
 * CHANGELOG.internal.md 与 docs/testing.md）：
 * - UI 文件 = js/core/app.js、js/core/interaction.js、js/features/*.js；
 * - 适配器/格式模块 io-import.js、io-export.js、io-table.js、io-fields.js、
 *   plugins.js、rules.js 的文案属于数据标签/诊断信息，按计划风险条款单列统计并豁免；
 * - 排除 HTML/CSS 标记模板（含 `<`、`>` 或换行）与含 `${...}` 的复合模板壳（不是文案字面量）；
 * - 只统计「未字典化」的 UI 文案；已在字典但尚未接入 L() 的条目单列为 `uiInDict`。
 * 门槛（--check）：总覆盖率 ≥40%、缺口 ≤10、UI 文案硬编码 ≤20、模板内 UI 文案 0。
 *
 * 用法：node scripts/i18n-scan.mjs [--json|--check]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import vm from 'node:vm';
import { walkFiles } from './lib/fs-utils.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const HAN = /[\u4e00-\u9fff]/;
const ADAPTER_FILES = new Set([
  'js/features/io-import.js',
  'js/features/io-export.js',
  'js/features/io-table.js',
  'js/features/io-fields.js',
  'js/features/plugins.js',
  'js/features/rules.js'
]);

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
      out.push({ value, start, template: quote === '`' });
      continue;
    }
    i++;
  }
  return out;
}

/** 跳到字符串字面量结尾（i 指向引号之后） */
function skipQuoted(raw, i, quote) {
  i++;
  while (i < raw.length) {
    if (raw[i] === '\\') { i += 2; continue; }
    if (raw[i] === quote) return i + 1;
    i++;
  }
  return i;
}

/** 跳到嵌套模板串结尾（i 指向反引号之后） */
function skipNestedTemplate(raw, i) {
  i++;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch === '`') return i + 1;
    if (ch === '$' && raw[i + 1] === '{') { i = skipTemplateExpr(raw, i + 2); continue; }
    i++;
  }
  return i;
}

/** 跳过 `${ ... }` 表达式（i 指向 `{` 之后），正确处理嵌套字符串/模板/注释/大括号 */
function skipTemplateExpr(raw, i) {
  let depth = 1;
  while (i < raw.length && depth) {
    const ch = raw[i];
    if (ch === '\'' || ch === '"') { i = skipQuoted(raw, i, ch); continue; }
    if (ch === '`') { i = skipNestedTemplate(raw, i); continue; }
    if (ch === '/' && raw[i + 1] === '/') { while (i < raw.length && raw[i] !== '\n') i++; continue; }
    if (ch === '/' && raw[i + 1] === '*') {
      i += 2;
      while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return i;
}

/** 把模板串拆成静态片段（丢弃 `${...}` 内容） */
function templateSegments(raw) {
  const out = [];
  let cur = '';
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '\\') { cur += ch + (raw[i + 1] || ''); i += 2; continue; }
    if (ch === '$' && raw[i + 1] === '{') {
      if (cur) out.push(cur);
      cur = '';
      i = skipTemplateExpr(raw, i + 2);
      continue;
    }
    cur += ch;
    i++;
  }
  if (cur) out.push(cur);
  return out;
}

/** 从静态片段取出可见文案：文本节点 + title/aria-label/placeholder/alt 属性值 */
function templateTexts(seg) {
  const out = [];
  for (const m of seg.matchAll(/(?:title|aria-label|placeholder|alt)="([^"]*)"/g)) {
    const t = m[1].trim();
    if (HAN.test(t)) out.push(t);
  }
  const text = seg
    .replace(/[a-zA-Z-]+="[^"]*"/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/<[^>]*$/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/^[<>]+|[<>]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (HAN.test(text)) out.push(text);
  return out;
}

const TRANSLATED_CALL = /(?:\bL|\bI18N\.p|\bI18N\.t|\bI18N\.fmt|\bI18N\.tpl|\btoast|\bcommitChange|\bopenModal|\bshowConfirm|\bcollabNotifyThrottled)\s*\(\s*$/;
const files = walkFiles(join(root, 'js'), { ext: '.js' }).filter(f => !f.endsWith(join('js', 'common', 'i18n.js')));
const byValue = new Map();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const rel = relative(root, f).replace(/\\/g, '/');
  for (const lit of literalsOf(src)) {
    if (!HAN.test(lit.value)) continue;
    const wrapped = TRANSLATED_CALL.test(src.slice(Math.max(0, lit.start - 40), lit.start));
    /* 含 ${...} 的模板串：不把整个壳当作一条文案，改按其静态片段去重统计 */
    if (lit.template && lit.value.includes('${')) {
      for (const seg of templateSegments(lit.value)) {
        for (const text of templateTexts(seg)) {
          const rec = byValue.get(text) || { value: text, wrapped: false, template: false, files: new Set() };
          rec.template = true;
          rec.files.add(rel);
          byValue.set(text, rec);
        }
      }
      continue;
    }
    /* 静态 HTML 模板串（无反引号插值）：同样只取文本节点/可读属性，避免整段标记壳掩盖硬编码 */
    if (lit.template && /[<>]/.test(lit.value)) {
      for (const text of templateTexts(lit.value)) {
        const rec = byValue.get(text) || { value: text, wrapped: false, template: false, files: new Set() };
        rec.template = true;
        rec.files.add(rel);
        byValue.set(text, rec);
      }
      continue;
    }
    const rec = byValue.get(lit.value) || { value: lit.value, wrapped: false, template: false, files: new Set() };
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
const inDict = value => (I18N.phrases && I18N.phrases[value] !== undefined) || (I18N.templates && I18N.templates[value] !== undefined);

const all = Array.from(byValue.values());
const wrapped = all.filter(r => r.wrapped);
const hardcoded = all.filter(r => !r.wrapped);
const composite = value => value.includes('${');
const markup = value => /[<>\n]/.test(value);
const covered = wrapped.filter(r => inDict(r.value));
const missing = wrapped.filter(r => !inDict(r.value) && !composite(r.value));
const hardcodedCovered = hardcoded.filter(r => inDict(r.value));
const hardcodedUncovered = hardcoded.filter(r => !inDict(r.value));
const isUiFile = f => f === 'js/core/app.js' || f === 'js/core/interaction.js'
  || (f.startsWith('js/features/') && !ADAPTER_FILES.has(f));
const uiRecord = r => Array.from(r.files).some(isUiFile);
/* 语言选项按母语自称展示；这是唯一允许的模板内文案，新增条目必须走字典而不是白名单 */
const TEMPLATE_ALLOW = new Set(['中文']);
const uiCopyAll = hardcodedUncovered.filter(r => uiRecord(r) && !markup(r.value) && !composite(r.value));
const templateCopy = uiCopyAll.filter(r => r.template && !TEMPLATE_ALLOW.has(r.value));
const templateAllowed = uiCopyAll.filter(r => r.template && TEMPLATE_ALLOW.has(r.value));
const uiCopy = uiCopyAll.filter(r => !templateAllowed.includes(r));
const uiInDict = hardcodedCovered.filter(r => uiRecord(r) && !markup(r.value) && !composite(r.value));
const total = covered.length + missing.length + hardcoded.length;
const uiByFile = {};
for (const r of uiCopy) {
  const f = Array.from(r.files).find(isUiFile);
  uiByFile[f] = (uiByFile[f] || 0) + 1;
}
const hardcodedByFile = Object.entries(hardcoded.reduce((acc, r) => {
  const f = Array.from(r.files)[0];
  acc[f] = (acc[f] || 0) + 1;
  return acc;
}, {})).sort((a, b) => b[1] - a[1]);

const report = {
  files: files.length,
  literals: all.length,
  wrapped: wrapped.length,
  hardcoded: hardcoded.length,
  hardcodedInDict: hardcodedCovered.length,
  hardcodedUncovered: hardcodedUncovered.length,
  covered: covered.length,
  missing: missing.length,
  uiCopy: uiCopy.length,
  templateCopy: templateCopy.length,
  templateAllowed: templateAllowed.map(r => r.value),
  uiInDict: uiInDict.length,
  uiByFile: Object.entries(uiByFile).sort((a, b) => b[1] - a[1]),
  phrases: phrases.length,
  templates: templates.length,
  dictZh: dictZh.length,
  coveragePct: total ? Math.round((covered.length / total) * 10000) / 100 : 0,
  hardcodedTop: hardcoded.slice(0, 30).map(r => ({ text: r.value, files: Array.from(r.files) })),
  missingTop: missing.slice(0, 30).map(r => ({ text: r.value, files: Array.from(r.files) })),
  hardcodedInDictTop: hardcodedCovered.slice(0, 300).map(r => ({ text: r.value, files: Array.from(r.files) })),
  hardcodedByFile
};

const LIMITS = { coverage: 40, missing: 10, uiCopy: 20 };
const fails = [];
if (report.coveragePct < LIMITS.coverage) fails.push(`覆盖率 ${report.coveragePct}% < ${LIMITS.coverage}%`);
if (report.missing > LIMITS.missing) fails.push(`缺口 ${report.missing} > ${LIMITS.missing}`);
if (report.uiCopy > LIMITS.uiCopy) fails.push(`UI 文案硬编码 ${report.uiCopy} > ${LIMITS.uiCopy}`);
if (report.templateCopy > 0) fails.push(`模板内 UI 文案 ${report.templateCopy} > 0（新增硬编码模板中文必须接入 L() 或字典）`);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ...report, limits: LIMITS, ok: fails.length === 0, fails }, null, 2));
} else {
  console.log(`i18n 扫描（${report.files} 个业务脚本，字典文件除外）`);
  console.log(`字面量去重：${report.literals}`);
  console.log(`走翻译入口：${report.wrapped}（已字典化 ${report.covered} / 缺口 ${report.missing}）`);
  console.log(`未走翻译入口的硬编码中文：${report.hardcoded}（其中未字典化 ${report.hardcodedUncovered}）`);
  console.log(`UI 文案硬编码：${report.uiCopy}（已字典待接入 ${report.uiInDict}）`);
  console.log(`模板内 UI 文案：${report.templateCopy}（白名单 ${report.templateAllowed.length}${report.templateAllowed.length ? '：' + report.templateAllowed.join('、') : ''}）`);
  report.uiByFile.forEach(([f, n]) => console.log(`  - ${f}: ${n}`));
  console.log(`字典：PHRASES ${report.phrases} 条 / TEMPLATES ${report.templates} 条 / DICT.zh ${report.dictZh} 键`);
  console.log(`覆盖率：${report.coveragePct}%（口径见文件头）`);
  if (process.argv.includes('--check')) {
    if (fails.length) {
      console.log(`❌ i18n 门禁未通过：${fails.join('；')}`);
      process.exitCode = 1;
    } else {
      console.log(`✅ i18n 门禁通过：覆盖率 ${report.coveragePct}% ≥ ${LIMITS.coverage}%，缺口 ${report.missing} ≤ ${LIMITS.missing}，UI 文案硬编码 ${report.uiCopy} ≤ ${LIMITS.uiCopy}，模板内 UI 文案 ${report.templateCopy} = 0`);
    }
  } else if (report.hardcodedTop.length) {
    console.log('硬编码样例：');
    report.hardcodedTop.slice(0, 10).forEach(r => console.log(`  - ${r.text}  (${r.files.join(', ')})`));
  }
}
