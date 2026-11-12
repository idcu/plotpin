#!/usr/bin/env node
/* check-gates.mjs —— 门禁的牙齿：正面基线 + 13 种人为破坏，断言对应门禁会红
 *
 * 为什么需要它：门禁脚本本身也会假绿（只打印不比对、缺文件退 0、模板缺失空操作、把 --selftest 透传给
 * 只跑解析器自检的分支）。一条从未红过的判据，与没有判据的区别只在于它更贵。这里把「会红」这件事本身
 * 做成判据，并先要求未破坏副本上的同一批判据全绿——没有正面基线，"变红"可能只是环境坏了。
 *
 *   0. 正面基线（同一份未破坏副本）    → check.mjs --selftest / check-sw / check-plugin-api /
 *                                       check-ngm / badge --check / i18n-scan --check 必须全 0
 *   1. 渲染 P95 人为超标              → node scripts/bench.mjs          必须非 0
 *   2. dist 产物被篡改                → node scripts/build.mjs --check  必须非 0
 *   3. ngm.json 缺失                  → node scripts/check-ngm.mjs      必须非 0
 *   4. README 断言数模板被删除        → node scripts/badge.mjs --check  必须非 0
 *   5. selftest 人为失败              → node scripts/check.mjs --selftest 必须非 0
 *   6. 预缓存输入变更但 SW 版本未升    → node scripts/check-sw.mjs      必须非 0
 *   7. UI 模板内新增硬编码中文        → node scripts/i18n-scan.mjs --check 必须非 0
 *   8. PlotPin 新增未登记私有键       → node scripts/check.mjs --selftest 必须非 0（API 面真实判据）
 *   9. sw.js VERSION 回退             → node scripts/check-sw.mjs      必须非 0
 *  10. CSS 花括号未配平（@media 未闭合）→ node scripts/check.mjs --selftest 必须非 0
 *  11. 契约规则被清空                 → node scripts/check-contracts.mjs 必须非 0
 *  12. 输入变更未 bump 就执行 --update → node scripts/check-sw.mjs --update 必须非 0
 *  13. 样式引入远程资源（离线承诺破坏）→ node scripts/check.mjs --selftest 必须非 0
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

/* 整仓副本排除：版本库、构建产物、编辑器缓存、系统临时目录、只读审计产物 */
const SKIP_TOP = new Set(['.git', 'dist', 'node_modules', '.trae', '.screenshots',
  '.trae-html-share-packages', 'analysis', 'tmp', 'temp', 'coverage', 'audit-out', 'test-results']);

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
  /* 副本不含 .git，但 check.mjs 的删除账本判据要读 `git ls-files`。
     建一个空索引并 stage 当前文件即可（不需要 commit），否则基线会因为「不是 git 仓库」而红。 */
  const git = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  const init = git(['init', '-q']);
  if (init.status !== 0) throw new Error('临时仓库 git init 失败：' + tail(init));
  const add = git(['add', '-A']);
  if (add.status !== 0) throw new Error('临时仓库 git add 失败：' + tail(add));
  return dir;
}

function run(dir, args) {
  return spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });
}

function tail(res, lines = 4) {
  const text = `${res.stdout || ''}\n${res.stderr || ''}`.trim();
  return text.split('\n').slice(-lines).join('\n');
}

function textOf(res) {
  return `${res.stdout || ''}\n${res.stderr || ''}`;
}

/* 取第一条真正的失败行，证明红的确实是那条门禁，而不是别的步骤顺带失败 */
function reason(res) {
  const lines = textOf(res).split('\n');
  const hit = lines.find(l => l.includes('❌'))
    || lines.find(l => /FAILED|error|错误|不一致|超限|未递增|回退/.test(l));
  return hit ? `（${hit.trim().slice(0, 110)}）` : '';
}

const scenarios = [
  {
    name: 'bench P95 人为超标',
    expected: 'node scripts/bench.mjs 退出码非 0',
    args: ['scripts/bench.mjs'],
    expect: /P95|缓存帧/,
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
    expect: /单文件打包校验未通过|哈希|不一致/,
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
    expect: /ngm\.json|缺少/,
    sabotage(dir) {
      unlinkSync(join(dir, 'ngm.json'));
    }
  },
  {
    name: 'README 断言数模板缺失',
    expected: 'node scripts/badge.mjs --check 退出码非 0',
    args: ['scripts/badge.mjs', '--check'],
    expect: /断言数/,
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
    expect: /人为失败|自测失败/,
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
    expect: /VERSION/,
    sabotage(dir) {
      /* 基线是仓库内提交的 scripts/sw-inputs.sha256，与 git 工作区状态无关：
         直接改一个预缓存输入，清单指纹就不再匹配。 */
      appendFileSync(join(dir, 'js', 'core', 'render.js'),
        '\n/* 门禁牙齿：预缓存输入变更但 VERSION 未递增 */\n');
    }
  },
  {
    name: 'UI 模板内新增硬编码中文',
    expected: 'node scripts/i18n-scan.mjs --check 退出码非 0',
    args: ['scripts/i18n-scan.mjs', '--check'],
    expect: /硬编码|模板内 UI 文案/,
    sabotage(dir) {
      appendFileSync(join(dir, 'js', 'features', 'ui-panels.js'),
        '\nconst __gateProbe = `<span>门禁探针硬编码</span>`;\n');
    }
  },
  {
    name: 'PlotPin 新增未登记私有键（API 面真实判据）',
    expected: 'node scripts/check.mjs --selftest 退出码非 0',
    args: ['scripts/check.mjs', '--selftest'],
    expect: /未守约|API|泄漏/,
    sabotage(dir) {
      /* 旧实现把 --selftest 透传给 check-plugin-api，只跑解析器自检就退出；这个场景证明
         check.mjs --selftest 现在会走真实的 PlotPin 顶层键 ↔ 契约清单比对。 */
      const p = join(dir, 'js', 'features', 'plugins.js');
      const text = readFileSync(p, 'utf8');
      const marker = 'const PlotPin = {';
      if (!text.includes(marker)) throw new Error('找不到 const PlotPin = {');
      writeFileSync(p, text.replace(marker, marker + '\n  __gatePrivateKey: 1,'));
    }
  },
  {
    name: 'sw.js VERSION 回退',
    expected: 'node scripts/check-sw.mjs 退出码非 0',
    args: ['scripts/check-sw.mjs'],
    expect: /VERSION 回退/,
    sabotage(dir) {
      const p = join(dir, 'sw.js');
      const text = readFileSync(p, 'utf8');
      const m = text.match(/const VERSION\s*=\s*'(\d+)'/);
      if (!m) throw new Error('sw.js 找不到 VERSION');
      writeFileSync(p, text.replace(m[0], `const VERSION = '${Math.max(0, Number(m[1]) - 1)}'`));
    }
  },
  {
    name: '契约规则被清空（空文件静默关闭）',
    expected: 'node scripts/check-contracts.mjs 退出码非 0',
    args: ['scripts/check-contracts.mjs'],
    expect: /契约 versionSources|契约 i18n|契约 headers|契约 enums/,
    sabotage(dir) {
      /* 契约文件既是判据来源又是被检查对象：把规则数组清空后，旧实现会输出
         「0 项核对，0 处违约」并退 0，等于门禁被合法地关掉。 */
      writeFileSync(join(dir, 'contracts', 'conventions.json'),
        JSON.stringify({ schemaVersion: 1, versionSources: [], i18n: null, headers: null, enums: [] }, null, 2));
    }
  },
  {
    name: '预缓存输入变更未 bump VERSION 就执行 --update',
    expected: 'node scripts/check-sw.mjs --update 退出码非 0',
    args: ['scripts/check-sw.mjs', '--update'],
    expect: /拒绝生成|VERSION 未递增/,
    sabotage(dir) {
      /* 旧实现只拒绝版本回退：改资产后直接 --update 会把新指纹写成基线，
         校验步骤再也看不到这次变更，等于绕过「输入变更必须 bump」。 */
      appendFileSync(join(dir, 'js', 'core', 'render.js'),
        '\n/* 门禁牙齿：输入变更未 bump 就刷新指纹 */\n');
    }
  },
  {
    name: 'CSS 花括号未配平（@media 未闭合）',
    expected: 'node scripts/check.mjs --selftest 退出码非 0',
    args: ['scripts/check.mjs', '--selftest'],
    expect: /CSS 结构未配平/,
    sabotage(dir) {
      /* CSS 语法不需要闭合也能被浏览器解析：未闭合的 @media 会把其后所有规则吞进媒体查询，
         页面照常加载、只是样式错位，node --check 与 e2e 都可能看不出来。 */
      appendFileSync(join(dir, 'css', 'style.css'), '\n@media print{\n');
    }
  },
  {
    name: '样式引入远程资源（离线承诺被破坏）',
    expected: 'node scripts/check.mjs --selftest 退出码非 0',
    args: ['scripts/check.mjs', '--selftest'],
    expect: /远程资源/,
    sabotage(dir) {
      /* 内联进单文件后仍会发起网络请求：只扫 index.html 的 src/href 看不出来 */
      appendFileSync(join(dir, 'css', 'style.css'), '\n.remote-probe{background:url(https://cdn.example.com/a.png)}\n');
    }
  }
];

/* 正面基线：同一份未破坏副本必须先全绿，否则「变红」没有意义 */
const BASELINE = [
  ['check.mjs --selftest（含契约 / 插件 API 真实判据）', ['scripts/check.mjs', '--selftest']],
  ['check-sw.mjs', ['scripts/check-sw.mjs']],
  ['check-plugin-api.mjs', ['scripts/check-plugin-api.mjs']],
  ['check-ngm.mjs', ['scripts/check-ngm.mjs']],
  ['badge.mjs --check', ['scripts/badge.mjs', '--check']],
  ['i18n-scan.mjs --check', ['scripts/i18n-scan.mjs', '--check']]
];

console.log(`门禁牙齿自测（正面基线 ${BASELINE.length} 条 + ${scenarios.length} 种人为破坏，均在临时副本中构造，不改动仓库）`);
const failures = [];
let tempDirs = [];
try {
  const baselineDir = copyRepo();
  tempDirs.push(baselineDir);
  for (const [label, args] of BASELINE) {
    const res = run(baselineDir, args);
    const ok = res.status === 0;
    console.log(`  [基线] ${label} → 退出码 ${res.status} ${ok ? '✓' : '✗'}`);
    if (!ok) failures.push(`[基线] ${label}：未破坏副本必须通过，实际退出码 ${res.status}\n${tail(res)}`);
  }

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
    const red = res.status !== 0;
    const keywordHit = sc.expect.test(textOf(res));
    const passed = red && keywordHit;
    console.log(`  [${i + 1}/${scenarios.length}] ${sc.name} → 退出码 ${res.status}`
      + ` ${passed ? '✓' : '✗'}${red ? reason(res) : ''}${red && !keywordHit ? '（输出未命中关键字 ' + sc.expect + '）' : ''}`);
    if (!passed) {
      failures.push(`[${i + 1}/${scenarios.length}] ${sc.name}：期望「${sc.expected}」且输出命中 ${sc.expect}，`
        + `实际退出码 ${res.status}${red ? '' : '（未变红）'}\n${tail(res)}`);
    }
  }
} finally {
  for (const dir of tempDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch (_) { /* 临时目录清理失败不影响结论 */ }
  }
}

if (failures.length) {
  console.error(`\n❌ 门禁牙齿自测失败：${failures.length} 项未达预期（含正面基线）`);
  failures.forEach(f => console.error('  - ' + f));
  process.exit(1);
}
console.log(`\n✅ 门禁牙齿自测通过：正面基线 ${BASELINE.length}/${BASELINE.length} 全绿，`
  + `${scenarios.length}/${scenarios.length} 种人为破坏均被对应门禁以非 0 拦截且输出命中关键字`);
