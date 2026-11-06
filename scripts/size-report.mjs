/**
 * size-report.mjs —— 单文件发行版的体积组成 / 重复 / 死代码统计
 *
 * 用法：
 *   node scripts/size-report.mjs          人类可读报告
 *   node scripts/size-report.mjs --json   JSON（便于前后对比）
 *
 * 口径：
 *   - 组成：按 dist/plotpin-standalone.html 中的 `/* 文件 *​/` 标记切分（与 build 完全同源），
 *     剩余部分记作 HTML 其余（含 CSP/图标 data URI/内联壳）。
 *   - 注释/缩进：逐字符状态机跳过字符串与模板字面量，只统计真正的 JS 注释；缩进统计行首空白。
 *     模板字面量内部换行与缩进不参与「可压缩」估算（删除会改字符串内容）。
 *   - 重复字符串：所有 JS 源文件的字符串字面量（单/双/反引号，长度 ≥ 6），按值分组；
 *     浪费字节 = Σ 长度 × (出现次数 − 1)。
 *   - 重复代码行：去空白后长度 ≥ 24 的非注释行，按内容分组；浪费字节同口径。
 *   - 死代码：顶层 `function name(...)` 在全仓（js + index.html + scripts 引用测试）只出现 1 次定义，
 *     视为无引用候选（仅候选，删除前必须人工确认，且由 selftest/e2e 兜底）。
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

/* ---- 1. 按构建标记切分组成 ---- */
const parts = [];
for (const m of bundle.matchAll(/<script>\n\/\* ([^*]+) \*\/\n([\s\S]*?)\n<\/script>/g)) {
  parts.push({ path: m[1].trim(), bytes: bytes(m[2]) });
}
const cssMatch = bundle.match(/<style>\n\/\* ([^*]+) \*\/\n([\s\S]*?)\n<\/style>/);
if (cssMatch) parts.push({ path: cssMatch[1].trim(), bytes: bytes(cssMatch[2]) });
const marked = parts.reduce((a, p) => a + p.bytes, 0);
parts.push({ path: '(HTML 其余：CSP/图标/内联壳)', bytes: total - marked });
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

const jsParts = parts.filter(p => p.path.endsWith('.js') && p.path !== '(HTML 其余：CSP/图标/内联壳)');
const savings = { comment: 0, indent: 0, blank: 0, templateInside: 0 };
for (const p of jsParts) {
  const s = scanJs(read(p.path));
  savings.comment += s.comment; savings.indent += s.indent; savings.blank += s.blank; savings.templateInside += s.template;
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
  const list = stringLiterals(read(p.path));
  literals.push(...list);
  for (const v of list) literalMap.set(v, (literalMap.get(v) || 0) + 1);
}
const dupStrings = [...literalMap.entries()].filter(([, n]) => n > 1)
  .map(([v, n]) => ({ value: v, count: n, bytes: bytes(v), wasted: bytes(v) * (n - 1) }))
  .sort((a, b) => b.wasted - a.wasted);

const lineMap = new Map();
for (const p of jsParts) {
  for (const line of read(p.path).split('\n')) {
    const t = line.trim();
    if (t.length < 24 || t.startsWith('//') || t.startsWith('/*')) continue;
    lineMap.set(t, (lineMap.get(t) || 0) + 1);
  }
}
const dupLines = [...lineMap.entries()].filter(([, n]) => n > 1)
  .map(([v, n]) => ({ line: v, count: n, wasted: bytes(v) * (n - 1) }))
  .sort((a, b) => b.wasted - a.wasted);

/* ---- 4. 死代码候选 ---- */
const allJs = jsParts.map(p => read(p.path)).join('\n');
const indexHtml = read('index.html');
const selftest = read('scripts/selftest.mjs');
const names = [];
for (const p of jsParts) {
  for (const m of read(p.path).matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) names.push({ name: m[1], file: p.path });
}
const deadCandidates = names.filter(({ name }) => {
  const re = new RegExp('\\b' + name.replace(/[$]/g, '\\$') + '\\b', 'g');
  const hits = (allJs.match(re) || []).length + (indexHtml.match(re) || []).length + (selftest.match(re) || []).length;
  return hits <= 1;
}).map(({ name, file }) => ({ name, file }));

const report = {
  totalBytes: total,
  top: parts.slice(0, 10).map(p => ({ path: p.path, bytes: p.bytes, pct: +(p.bytes / total * 100).toFixed(2) })),
  jsBytes: jsParts.reduce((a, p) => a + p.bytes, 0),
  compressible: { ...savings, total: savings.comment + savings.indent + savings.blank },
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
  console.log('\nTop 10 组成：');
  for (const p of report.top) console.log(`  ${String(p.bytes).padStart(7)} B  ${String(p.pct).padStart(5)}%  ${p.path}`);
  console.log(`\nJS 合计：${report.jsBytes} B；可压缩估算：注释 ${savings.comment} B / 行首缩进 ${savings.indent} B / 空行 ${savings.blank} B`
    + `（模板内换行 ${savings.templateInside} B 不可删；合计 ${report.compressible.total} B）`);
  console.log(`\n重复字符串：${literals.length} 个，唯一 ${literalMap.size} 个，重复组 ${dupStrings.length}，浪费 ${report.duplicateStrings.wastedBytes} B`);
  for (const d of dupStrings.slice(0, 10)) console.log(`  ×${d.count}  ${d.bytes} B  ${d.value.slice(0, 60)}`);
  console.log(`\n重复代码行：${dupLines.length} 组，浪费 ${report.duplicateLines.wastedBytes} B`);
  for (const d of dupLines.slice(0, 10)) console.log(`  ×${d.count}  ${d.wasted} B  ${d.line.slice(0, 80)}`);
  console.log(`\n死代码候选（仅顶层 function 且全仓仅 1 次出现，需人工确认）：${deadCandidates.length} 个`);
  for (const d of deadCandidates.slice(0, 30)) console.log(`  ${d.name}  (${d.file})`);
}
