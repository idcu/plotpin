/**
 * badge.mjs —— 断言数自动注入 README（杜绝人工漂移）
 *
 * 运行 selftest 并读取实际断言总数，同步更新 README 三处：
 *   - shields.io 徽章中的 selftest-N%20assertions
 *   - 正文「当前共 **N 项断言全部通过**」
 *   - 测试命令注释 `# N assertions, no dependencies`
 *
 * 用法：
 *   node scripts/badge.mjs           写入（断言数变化时才改文件）
 *   node scripts/badge.mjs --check   只校验，不一致则退出码 1（CI 用）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
const after = before
  .replace(/(selftest-)\d+(%20assertions)/, `$1${count}$2`)
  .replace(/(当前共 \*\*)\d+( 项断言全部通过\*\*)/, `$1${count}$2`)
  .replace(/(# )\d+( assertions, no dependencies)/, `$1${count}$2`);

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
