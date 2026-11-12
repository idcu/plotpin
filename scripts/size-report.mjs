/**
 * size-report.mjs —— 单文件发行版的体积组成 / 重复 / 死代码统计
 *
 * 用法：
 *   node scripts/size-report.mjs          人类可读报告
 *   node scripts/size-report.mjs --json   JSON（便于前后对比）
 *
 * 口径（P2-06 修正，V-3R 去标记）：
 *   - 组成：按 index.html 中 `<script src>` / `<link rel=stylesheet>` 的声明顺序，
 *     与 dist 里的 `<script>` / `<style>` 块逐一对应切分（构建不再嵌来源标记）；
 *     V-4a 起 dist 全部脚本合并为 1 段，JS 组成显示为单个 bundle 项（不再逐文件对位），
 *     剩余部分记作 HTML 其余（含 CSP/图标 data URI/内联壳）。
 *   - 注释/缩进/空行：统计对象是 **dist 内联后的分块文本**（构建期已删注释、行首缩进与空行），
 *     得到的是「当前产物还能再回收多少」；另给 `sourcePotential` 作为源文件潜在值参考，
 *     不能直接当作 dist 可回收空间（旧口径把两者混为一谈，高估约 200 KB）。
 *   - 重复字符串：dist 分块内的字符串字面量（单/双/反引号，长度 ≥ 6），按值分组；
 *     浪费字节 = Σ 长度 × (出现次数 − 1)。
 *   - 重复代码行：dist 分块内去空白后长度 ≥ 24 的非注释行，按内容分组；浪费字节同口径。
 *   - 死代码：顶层 `function name(...)` 在 dist 分块 + index.html + scripts/selftest 中只出现 1 次，
 *     视为无引用候选（仅候选，删除前必须人工确认，且由 selftest/e2e 兜底）。
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { MAX_BYTES, GZIP_MAX_BYTES, budgetStatus } from './lib/budget.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const bytes = s => Buffer.byteLength(s, 'utf8');

const dist = join(root, 'dist', 'plotpin-standalone.html');
if (!existsSync(dist)) {
  console.error('缺少 dist/plotpin-standalone.html，请先运行 node scripts/build.mjs');
  process.exit(1);
}
const bundle = readFileSync(dist, 'utf8');
const total = bytes(bundle);
/* 体积预算与 build.mjs 同源（lib/budget.mjs）：分级预警 + gzip 阈值判断 */
const gzipBytes = gzipSync(Buffer.from(bundle, 'utf8')).length;
const budget = budgetStatus({ bytes: total, gzipBytes });

/* ---- 1. 按 index.html 声明顺序切分组成 ---- */
/* 构建不再嵌来源标记：dist 里每个 <script>/<style> 块与 index.html 的声明一一对应、顺序一致。
   V-4a 起 dist 把全部脚本合并为 1 段（CSP 只需 1 条哈希），此时 JS 组成合并为单个 bundle 项。 */
const entry = read('index.html');
const srcList = [...entry.matchAll(/<script\s+src="([^"]+)"><\/script>/g)].map(m => m[1]);
const cssList = [...entry.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g)].map(m => m[1]);
const scriptBodies = [...bundle.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)].map(m => m[1]);
const styleBodies = [...bundle.matchAll(/<style>\n([\s\S]*?)\n<\/style>/g)].map(m => m[1]);
const mergedJs = scriptBodies.length === 1 && srcList.length > 1;
if ((scriptBodies.length !== srcList.length && !mergedJs) || styleBodies.length !== cssList.length) {
  console.error(`区块数与 index.html 声明不一致：脚本 ${scriptBodies.length}/${srcList.length}、`
    + `样式 ${styleBodies.length}/${cssList.length}（dist 与源可能不同步，请先重新构建）`);
  process.exit(1);
}
const parts = [];
if (mergedJs) parts.push({ path: `bundle(${srcList.length} 个脚本，已合并)`, bytes: bytes(scriptBodies[0]), text: scriptBodies[0], kind: 'js' });
else scriptBodies.forEach((text, i) => parts.push({ path: srcList[i], bytes: bytes(text), text, kind: 'js' }));
styleBodies.forEach((text, i) => parts.push({ path: cssList[i], bytes: bytes(text), text, kind: 'css' }));
const marked = parts.reduce((a, p) => a + p.bytes, 0);
parts.push({ path: '(HTML 其余：CSP/图标/内联壳)', bytes: total - marked, kind: 'html' });
parts.sort((a, b) => b.bytes - a.bytes);

/* ---- 2. 注释 / 缩进 / 空行（状态机） ---- */
function scanJs(text) {
  let comment = 0, indent = 0, blank = 0, template = 0;
  let inBlock = false, inTemplate = false;
  for (const line of text.split('\n')) {
    const lineBytes = bytes(line);
    if (!line.trim()) { blank += lineBytes + 1; continue; }
    let codeStart = 0;
    if (!inBlock && !inTemplate) {
      const lead = (line.match(/^\s*/) || [''])[0].length;
      indent += bytes(line.slice(0, lead));
      codeStart = lead;
    }
    /* 整行注释：行首（忽略缩进）就是 // 或 /*，且不在字符串/模板内 */
    const trimmed = line.slice(codeStart);
    if (!inTemplate && !inBlock && (trimmed.startsWith('//') || trimmed.startsWith('/*'))) {
      if (trimmed.startsWith('//') || trimmed.includes('*/')) {
        /* 行注释，或单行块注释 */ comment += lineBytes + 1;
        if (trimmed.startsWith('/*') && !trimmed.includes('*/')) inBlock = true;
        continue;
      }
    }
    /* 逐字符更新跨行状态并累计行内块注释字节 */
    let i = codeStart;
    while (i < line.length) {
      const ch = line[i];
      if (inBlock) {
        const end = line.indexOf('*/', i);
        if (end < 0) { comment += bytes(line.slice(i)) + 1; i = line.length; }
        else { comment += bytes(line.slice(i, end + 2)); inBlock = false; i = end + 2; }
        continue;
      }
      if (inTemplate) {
        if (ch === '\\') { i += 2; continue; }
        if (ch === '`') inTemplate = false;
        i++; continue;
      }
      if (ch === '"' || ch === "'") {
        const q = ch; i++;
        while (i < line.length) { if (line[i] === '\\') i += 2; else if (line[i] === q) { i++; break; } else i++; }
        continue;
      }
      if (ch === '`') { inTemplate = true; i++; continue; }
      if (ch === '/' && line[i + 1] === '/') { comment += bytes(line.slice(i)) + 1; break; }
      if (ch === '/' && line[i + 1] === '*') {
        const end = line.indexOf('*/', i + 2);
        if (end < 0) { inBlock = true; comment += bytes(line.slice(i)) + 1; i = line.length; }
        else { comment += bytes(line.slice(i, end + 2)); i = end + 2; }
        continue;
      }
      i++;
    }
    if (inTemplate) template += lineBytes + 1;
  }
  return { comment, indent, blank, template };
}

const jsParts = parts.filter(p => p.kind === 'js');

/* 产物口径：dist 分块文本里还剩多少可回收（构建期压缩后的真实值）。 */
const savings = { comment: 0, indent: 0, blank: 0, templateInside: 0 };
for (const p of jsParts) {
  const s = scanJs(p.text);
  savings.comment += s.comment; savings.indent += s.indent; savings.blank += s.blank; savings.templateInside += s.template;
}

/* 源文件潜在值：仅供跨版本比较，不能当作 dist 预算（构建期已删注释/缩进/空行）。 */
const sourceSavings = { comment: 0, indent: 0, blank: 0, templateInside: 0 };
for (const p of jsParts) {
  let src;
  try { src = read(p.path); } catch (_) { continue; }
  const s = scanJs(src);
  sourceSavings.comment += s.comment; sourceSavings.indent += s.indent;
  sourceSavings.blank += s.blank; sourceSavings.templateInside += s.template;
}

/* ---- 3. 重复字符串 / 重复代码行 ---- */
function stringLiterals(text) {
  const out = [];
  let i = 0, inBlock = false;
  while (i < text.length) {
    const ch = text[i];
    if (inBlock) { const e = text.indexOf('*/', i); if (e < 0) break; inBlock = false; i = e + 2; continue; }
    if (ch === '/' && text[i + 1] === '/') { const e = text.indexOf('\n', i); i = e < 0 ? text.length : e; continue; }
    if (ch === '/' && text[i + 1] === '*') { inBlock = true; i += 2; continue; }
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch; let v = ''; i++;
      while (i < text.length) {
        if (text[i] === '\\') { v += text[i] + (text[i + 1] || ''); i += 2; continue; }
        if (text[i] === q) { i++; break; }
        if (text[i] === '\n' && q !== '`') { break; }
        v += text[i++];
      }
      if (v.length >= 6) out.push(v);
      continue;
    }
    i++;
  }
  return out;
}

const literalMap = new Map();
const literals = [];
for (const p of jsParts) {
  const list = stringLiterals(p.text);
  literals.push(...list);
  for (const v of list) literalMap.set(v, (literalMap.get(v) || 0) + 1);
}
const dupStrings = [...literalMap.entries()].filter(([, n]) => n > 1)
  .map(([v, n]) => ({ value: v, count: n, bytes: bytes(v), wasted: bytes(v) * (n - 1) }))
  .sort((a, b) => b.wasted - a.wasted);

const lineMap = new Map();
for (const p of jsParts) {
  for (const line of p.text.split('\n')) {
    const t = line.trim();
    if (t.length < 24 || t.startsWith('//') || t.startsWith('/*')) continue;
    lineMap.set(t, (lineMap.get(t) || 0) + 1);
  }
}
const dupLines = [...lineMap.entries()].filter(([, n]) => n > 1)
  .map(([v, n]) => ({ line: v, count: n, wasted: bytes(v) * (n - 1) }))
  .sort((a, b) => b.wasted - a.wasted);

/* ---- 4. 死代码候选 ---- */
const allJs = jsParts.map(p => p.text).join('\n');
const indexHtml = read('index.html');
const selftest = read('scripts/selftest.mjs');
const names = [];
for (const p of jsParts) {
  for (const m of p.text.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) names.push({ name: m[1], file: p.path });
}
const deadCandidates = names.filter(({ name }) => {
  const re = new RegExp('\\b' + name.replace(/[$]/g, '\\$') + '\\b', 'g');
  const hits = (allJs.match(re) || []).length + (indexHtml.match(re) || []).length + (selftest.match(re) || []).length;
  return hits <= 1;
}).map(({ name, file }) => ({ name, file }));

const report = {
  totalBytes: total,
  maxBytes: MAX_BYTES,
  marginBytes: budget.margin,
  gzipBytes,
  gzipMaxBytes: GZIP_MAX_BYTES,
  gzipMarginBytes: budget.gzipMargin,
  budgetLevel: budget.level,
  budgetWarnings: budget.warnings,
  top: parts.slice(0, 10).map(p => ({ path: p.path, bytes: p.bytes, pct: +(p.bytes / total * 100).toFixed(2) })),
  jsBytes: jsParts.reduce((a, p) => a + p.bytes, 0),
  compressible: { ...savings, total: savings.comment + savings.indent + savings.blank },
  sourcePotential: { ...sourceSavings, total: sourceSavings.comment + sourceSavings.indent + sourceSavings.blank },
  duplicateStrings: {
    totalLiterals: literals.length,
    unique: literalMap.size,
    groups: dupStrings.length,
    wastedBytes: dupStrings.reduce((a, d) => a + d.wasted, 0),
    top: dupStrings.slice(0, 10)
  },
  duplicateLines: {
    groups: dupLines.length,
    wastedBytes: dupLines.reduce((a, d) => a + d.wasted, 0),
    top: dupLines.slice(0, 10)
  },
  deadCandidates: deadCandidates.slice(0, 30)
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`发行包总体积：${total} B（${(total / 1024).toFixed(1)} KB）`);
  console.log(`体积预算：上限 ${MAX_BYTES} B，余量 ${budget.margin} B；`
    + `gzip ${gzipBytes} B（上限 ${GZIP_MAX_BYTES} B，余量 ${budget.gzipMargin} B）`);
  if (budget.level === 'ok') console.log('预算状态：正常（余量与 gzip 均在阈值内）');
  for (const w of budget.warnings) console.log(`! ${w}`);
  console.log('\nTop 10 组成：');
  for (const p of report.top) console.log(`  ${String(p.bytes).padStart(7)} B  ${String(p.pct).padStart(5)}%  ${p.path}`);
  console.log(`\nJS 合计：${report.jsBytes} B`);
  console.log(`产物可回收（dist 分块实测）：注释 ${savings.comment} B / 行首缩进 ${savings.indent} B / 空行 ${savings.blank} B`
    + `（模板内换行 ${savings.templateInside} B 不可删；合计 ${report.compressible.total} B）`);
  console.log(`源文件潜在值（构建期已压缩，仅作参考，不可当 dist 预算）：注释 ${sourceSavings.comment} B / 缩进 ${sourceSavings.indent} B`
    + ` / 空行 ${sourceSavings.blank} B（合计 ${report.sourcePotential.total} B）`);
  console.log(`\n重复字符串：${literals.length} 个，唯一 ${literalMap.size} 个，重复组 ${dupStrings.length}，浪费 ${report.duplicateStrings.wastedBytes} B`);
  for (const d of dupStrings.slice(0, 10)) console.log(`  ×${d.count}  ${d.bytes} B  ${d.value.slice(0, 60)}`);
  console.log(`\n重复代码行：${dupLines.length} 组，浪费 ${report.duplicateLines.wastedBytes} B`);
  for (const d of dupLines.slice(0, 10)) console.log(`  ×${d.count}  ${d.wasted} B  ${d.line.slice(0, 80)}`);
  console.log(`\n死代码候选（仅顶层 function 且全仓仅 1 次出现，需人工确认）：${deadCandidates.length} 个`);
  for (const d of deadCandidates.slice(0, 30)) console.log(`  ${d.name}  (${d.file})`);
}
