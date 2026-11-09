/**
 * badge.mjs —— 数量类计数自动注入 README，并校验文档计数与实测一致
 *
 * 运行 selftest 并读取实际断言总数，同步更新 README 三处：
 *   - shields.io 徽章中的 selftest-N%20assertions
 *   - 正文「当前共 **N 项断言全部通过**」
 *   - 测试命令注释 `# N assertions, no dependencies`
 * 同时校验 docs/facts.md、docs/testing.md、docs/engineering.md 的计数锚点
 * （断言 / 分区 / 加载脚本 / e2e spec / check.mjs 步数）必须等于实测值，
 * 防止「测试数字动了、文档没动」再次漂移（审计 P2-05）。
 *
 * 用法：
 *   node scripts/badge.mjs           写入（断言数变化时才改文件）
 *   node scripts/badge.mjs --check   只校验，不一致则退出码 1（CI 用）
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { walkFiles } from './lib/fs-utils.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const checkOnly = process.argv.includes('--check');

const run = spawnSync(process.execPath, [join(root, 'scripts', 'selftest.mjs')], { encoding: 'utf8' });
process.stdout.write(run.stdout || '');
process.stderr.write(run.stderr || '');
if (run.status !== 0) {
  console.error('❌ selftest 未通过，拒绝写入断言数');
  process.exit(run.status || 1);
}
const m = (run.stdout || '').match(/共\s*(\d+)\s*项断言/);
if (!m) {
  console.error('❌ 无法从 selftest 输出解析断言数');
  process.exit(1);
}
const count = Number(m[1]);

const readmePath = join(root, 'README.md');
const before = readFileSync(readmePath, 'utf8');

/* 模板缺失必须失败：三处锚点都不存在时，下面的 replace 全是空操作，
   旧实现会打印「无需更新」并退 0 —— 断言数漂移从此无人发现。 */
const ANCHORS = [
  { re: /(selftest-)\d+(%20assertions)/, desc: 'shields.io 徽章 selftest-N%20assertions' },
  { re: /(当前共 \*\*)\d+( 项断言全部通过\*\*)/, desc: '正文「当前共 **N 项断言全部通过**」' },
  { re: /(# )\d+( assertions, no dependencies)/, desc: '测试命令注释「# N assertions, no dependencies」' }
];
const missing = ANCHORS.filter(a => !a.re.test(before)).map(a => a.desc);
if (missing.length) {
  console.error('❌ README 缺少断言数模板锚点，无法校验/写入：');
  missing.forEach(d => console.error('  - ' + d));
  process.exit(1);
}

const after = before
  .replace(ANCHORS[0].re, `$1${count}$2`)
  .replace(ANCHORS[1].re, `$1${count}$2`)
  .replace(ANCHORS[2].re, `$1${count}$2`);

if (checkOnly) {
  if (after !== before) {
    console.error(`❌ README 断言数与 selftest 实际值（${count}）不一致，请运行：node scripts/badge.mjs`);
    process.exit(1);
  }
  console.log(`✅ README 断言数与 selftest 一致（${count}）`);
} else if (after !== before) {
  writeFileSync(readmePath, after);
  console.log(`✅ README 断言数已更新为 ${count}`);
} else {
  console.log(`✅ README 断言数无需更新（${count}）`);
}

/* ---- 文档计数锚点：与实测同源，防止测试数字动了、文档没动（P2-05） ---- */
const scriptCount = Number(((run.stdout || '').match(/加载\s*(\d+)\s*个脚本/) || [])[1] || 0);
const listRun = spawnSync(process.execPath, [join(root, 'scripts', 'selftest.mjs'), '--list'], { encoding: 'utf8' });
const sectionCount = Number(((listRun.stdout || '').match(/共\s*(\d+)\s*个分区/) || [])[1] || 0);
const specCount = readdirSync(join(root, 'tests', 'e2e')).filter(n => n.endsWith('.spec.mjs')).length;
const testFileCount = walkFiles(join(root, 'tests')).length;
const checkHeader = readFileSync(join(root, 'scripts', 'check.mjs'), 'utf8');
const stepCount = (checkHeader.slice(0, checkHeader.indexOf('*/') + 2).match(/^\s*\*?\s*\d+\)/gm) || []).length;

const docErrors = [];
function expectCount(file, re, expected, label, group = 1) {
  const text = readFileSync(join(root, file), 'utf8');
  const m = text.match(re);
  if (!m) { docErrors.push(`${file} 缺少${label}计数锚点`); return; }
  const actual = Number(String(m[group]).replace(/,/g, ''));
  if (actual !== expected) docErrors.push(`${file} 的${label}写着 ${actual}，实测 ${expected}`);
}
if (!scriptCount) docErrors.push('无法从 selftest 输出解析「加载 N 个脚本」');
if (!sectionCount) docErrors.push('无法从 selftest --list 输出解析分区数');
if (!stepCount) docErrors.push('无法从 check.mjs 头部注释解析门禁步数');

expectCount('docs/facts.md', /selftest 断言 \| ([\d,]+) 通过/, count, 'selftest 断言');
expectCount('docs/facts.md', /selftest 分区 \| ([\d,]+) 个/, sectionCount, 'selftest 分区');
expectCount('docs/facts.md', /加载脚本 \| ([\d,]+) 个/, scriptCount, '加载脚本');
expectCount('docs/facts.md', /e2e spec 文件 \| ([\d,]+) 个/, specCount, 'e2e spec 文件');
expectCount('docs/testing.md', /([\d,]+) 个分区 \/ ([\d,]+) 条断言 \/ 加载 ([\d,]+) 个脚本/, sectionCount, '分区', 1);
expectCount('docs/testing.md', /([\d,]+) 个分区 \/ ([\d,]+) 条断言 \/ 加载 ([\d,]+) 个脚本/, count, '断言', 2);
expectCount('docs/testing.md', /([\d,]+) 个分区 \/ ([\d,]+) 条断言 \/ 加载 ([\d,]+) 个脚本/, scriptCount, '加载脚本', 3);
expectCount('docs/testing.md', /([\d,]+) 个 spec \/ ([\d,]+) 个用例/, specCount, 'e2e spec', 1);
expectCount('docs/engineering.md', /`check\.mjs` 的 ([\d,]+) 步/, stepCount, 'check.mjs 步数');
expectCount('docs/engineering.md', /`node scripts\/check\.mjs --selftest` \| ([\d,]+) 步总闸/, stepCount, 'check.mjs 步数（表格）');
expectCount('docs/modules.md', /## tests（([\d,]+) 个）/, testFileCount, 'tests 文件数');
expectCount('docs/modules.md', /### e2e 用例（([\d,]+) 个 spec）/, specCount, 'e2e spec 文件');
expectCount('README.md', /npm run lint\s+# ([\d,]+) 步工程质量门禁/, stepCount, 'check.mjs 步数');
expectCount('README.md', /当前覆盖 ([\d,]+) 步：/, stepCount, 'check.mjs 步数');

if (docErrors.length) {
  console.error('❌ 文档计数与实测不一致（改数字请以实测为准）：');
  docErrors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}
console.log(`✅ 文档计数与实测一致（断言 ${count} / 分区 ${sectionCount} / 脚本 ${scriptCount} / e2e spec ${specCount} / 门禁 ${stepCount} 步）`);
