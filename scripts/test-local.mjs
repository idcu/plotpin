#!/usr/bin/env node
/* test-local.mjs —— 运行 ngm.local 下每个本地 ngm 包的 test/*.test.mjs（零依赖）
 *
 * 用法：node scripts/test-local.mjs
 * 退出码：0 全部通过 / 1 有失败 / 无本地包时直接 0（不阻断旧仓库）。
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { walkFiles } from './lib/fs-utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = path.join(ROOT, 'ngm.local');
if (!existsSync(LOCAL)) {
  console.log('test-local: 没有 ngm.local（跳过）');
  process.exit(0);
}
const tests = walkFiles(LOCAL, { ext: '.test.mjs' }).sort();
if (!tests.length) {
  console.log('test-local: 没有本地包测试（跳过）');
  process.exit(0);
}
let failed = 0;
for (const file of tests) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const r = spawnSync(process.execPath, [file], { cwd: path.dirname(file), stdio: 'inherit' });
  if (r.status !== 0) {
    failed++;
    console.error(`❌ 本地包测试失败：${rel}`);
  }
}
if (failed) {
  console.error(`test-local: ${failed}/${tests.length} 个测试文件失败`);
  process.exit(1);
}
console.log(`✅ test-local: ${tests.length} 个本地包测试通过`);
