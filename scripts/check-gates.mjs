#!/usr/bin/env node
/* check-gates.mjs —— 门禁的牙齿：在临时副本里构造 6 种人为破坏，断言对应门禁会红
 *
 * 为什么需要它：门禁脚本本身也会假绿（只打印不比对、缺文件退 0、模板缺失空操作）。
 * 一条从未红过的判据，与没有判据的区别只在于它更贵。这里把「会红」这件事本身做成判据：
 *
 *   1. 渲染 P95 人为超标            → node scripts/bench.mjs          必须非 0
 *   2. dist 产物被篡改              → node scripts/build.mjs --check  必须非 0
 *   3. ngm.json 缺失                → node scripts/check-ngm.mjs      必须非 0
 *   4. README 断言数模板被删除      → node scripts/badge.mjs --check  必须非 0
 *   5. selftest 人为失败            → node scripts/check.mjs --selftest 必须非 0
 *   6. 预缓存输入变更但 SW 版本未升  → node scripts/check-sw.mjs      必须非 0
 *
 * 所有破坏只发生在系统临时目录的整仓副本里，仓库本身一个字节都不改。零第三方依赖。
 *
 * 用法：node scripts/check-gates.mjs
 */
import { cpSync, mkdtempSync, rmSync, readFileSync, writeFileSync, appendFileSync, unlinkSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/* 整仓副本排除：版本库、构建产物、编辑器缓存、系统临时目录 */
const SKIP_TOP = new Set(['.git', 'dist', 'node_modules', '.trae', '.screenshots',
  '.trae-html-share-packages', 'analysis', 'tmp', 'temp', 'coverage']);

function copyRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'plotpin-gates-'));
  cpSync(root, dir, {
    recursive: true,
    filter: (src) => {
      const rel = relative(root, src);
      if (!rel) return true;
      const top = rel.split(sep)[0];
      return !SKIP_TOP.has(top);
    }
  });
  return dir;
}

function run(dir, args) {
  return spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });
}

function tail(res, lines = 4) {
  const text = `${res.stdout || ''}\n${res.stderr || ''}`.trim();
  return text.split('\n').slice(-lines).join('\n');
}

/* 取第一行失败原因，证明红的确实是那条门禁，而不是别的步骤顺带失败 */
function reason(res) {
  const lines = `${res.stderr || ''}\n${res.stdout || ''}`.split('\n');
  const hit = lines.find(l => /❌|FAILED|error|失败|不一致|超限/i.test(l));
  return hit ? `（${hit.trim().slice(0, 110)}）` : '';
}

const scenarios = [
  {
    name: 'bench P95 人为超标',
    expected: 'node scripts/bench.mjs 退出码非 0',
    args: ['scripts/bench.mjs'],
    sabotage(dir) {
      /* 在渲染入口注入 4ms 忙等：平均帧仍 < 8ms，只有 P95 会破 3ms 阈值——
         正是「偶发卡顿被平均帧掩盖」的形态。用沙箱内可用的 Date.now()（bench 的 vm 无 performance）。 */
      appendFileSync(join(dir, 'js', 'core', 'render.js'),
        '\n/* 门禁牙齿：人为注入渲染延迟 */\n'
        + '(function () { var d = drawScene; drawScene = function () {'
        + ' var t = Date.now(); while (Date.now() - t < 4) {}'
        + ' return d.apply(null, arguments); }; })();\n');
    }
  },
  {
    name: 'dist 产物被篡改',
    expected: 'node scripts/build.mjs --check 退出码非 0',
    args: ['scripts/build.mjs', '--check'],
    sabotage(dir) {
      const built = run(dir, ['scripts/build.mjs']);
      if (built.status !== 0) throw new Error('沙箱内基础构建失败：' + tail(built));
      appendFileSync(join(dir, 'dist', 'plotpin-standalone.html'), '\n<!-- 门禁牙齿：产物被篡改 -->\n');
    }
  },
  {
    name: 'ngm.json 缺失',
    expected: 'node scripts/check-ngm.mjs 退出码非 0',
    args: ['scripts/check-ngm.mjs'],
    sabotage(dir) {
      unlinkSync(join(dir, 'ngm.json'));
    }
  },
  {
    name: 'README 断言数模板缺失',
    expected: 'node scripts/badge.mjs --check 退出码非 0',
    args: ['scripts/badge.mjs', '--check'],
    sabotage(dir) {
      const p = join(dir, 'README.md');
      const text = readFileSync(p, 'utf8');
      writeFileSync(p, text.replace(/selftest-\d+%20assertions/, 'selftest-unknown'));
    }
  },
  {
    name: 'selftest 人为失败（check --selftest 传导）',
    expected: 'node scripts/check.mjs --selftest 退出码非 0',
    args: ['scripts/check.mjs', '--selftest'],
    sabotage(dir) {
      const p = join(dir, 'scripts', 'selftest.mjs');
      const text = readFileSync(p, 'utf8');
      writeFileSync(p, text.replace('/* ---------------- 结果汇总 ---------------- */',
        "eq('门禁牙齿-人为失败', 1, 2);\n\n/* ---------------- 结果汇总 ---------------- */"));
    }
  },
  {
    name: '预缓存输入变更但 SW 版本未递增',
    expected: 'node scripts/check-sw.mjs 退出码非 0',
    args: ['scripts/check-sw.mjs'],
    sabotage(dir) {
      /* check-sw 以 git HEAD 为上一版基线；临时副本不含 .git，这里只提交预缓存相关文件作为基线 */
      const git = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
      const init = git(['init', '-q']);
      if (init.status !== 0) throw new Error('临时仓库 git init 失败：' + tail(init));
      const paths = ['sw.js', 'index.html', 'manifest.webmanifest', 'icon.svg', 'css', 'js']
        .filter(p => existsSync(join(dir, p)));
      const add = git(['add', '--', ...paths]);
      if (add.status !== 0) throw new Error('临时仓库 git add 失败：' + tail(add));
      const commit = git(['-c', 'user.name=gate', '-c', 'user.email=gate@local', 'commit', '-q', '-m', 'baseline']);
      if (commit.status !== 0) throw new Error('临时仓库 git commit 失败：' + tail(commit));
      appendFileSync(join(dir, 'js', 'core', 'render.js'),
        '\n/* 门禁牙齿：预缓存输入变更但 VERSION 未递增 */\n');
    }
  }
];

console.log(`门禁牙齿自测（${scenarios.length} 种人为破坏，均在临时副本中构造，不改动仓库）`);
const failures = [];
let tempDirs = [];
try {
  for (let i = 0; i < scenarios.length; i++) {
    const sc = scenarios[i];
    const dir = copyRepo();
    tempDirs.push(dir);
    try {
      sc.sabotage(dir);
    } catch (e) {
      failures.push(`[${i + 1}/${scenarios.length}] ${sc.name}：构造破坏失败 —— ${e.message}`);
      continue;
    }
    const res = run(dir, sc.args);
    const passed = res.status !== 0;
    console.log(`  [${i + 1}/${scenarios.length}] ${sc.name} → 退出码 ${res.status} ${passed ? '✓' : '✗'}${passed ? reason(res) : ''}`);
    if (!passed) {
      failures.push(`[${i + 1}/${scenarios.length}] ${sc.name}：期望「${sc.expected}」，实际退出码 0\n${tail(res)}`);
    }
  }
} finally {
  for (const dir of tempDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch (_) { /* 临时目录清理失败不影响结论 */ }
  }
}

if (failures.length) {
  console.error(`\n❌ 门禁牙齿自测失败：${failures.length}/${scenarios.length} 种破坏未被拦截`);
  failures.forEach(f => console.error('  - ' + f));
  process.exit(1);
}
console.log(`\n✅ 门禁牙齿自测通过：${scenarios.length}/${scenarios.length} 种人为破坏均被对应门禁拦截（非 0 退出）`);
