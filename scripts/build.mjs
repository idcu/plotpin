/**
 * build.mjs —— 发行版打包：单文件 HTML + SHA256 校验和
 *
 * 用法：
 *   node scripts/build.mjs            构建并写入 dist/ + scripts/dist-manifest.json（发布前）
 *   node scripts/build.mjs --check    CI 校验：从源重建 → 与 scripts/dist-manifest.json 比对
 *                                     （SHA256 / 字节数 / 体积上限），dist/ 存在时逐字节比对
 *
 * --check 不做「只打印」：产物哈希与登记值不一致、体积超限、构建不确定（两次构建哈希不同）
 * 任一发生即退出码 1。改动 js/css/index.html 后必须运行一次 `node scripts/build.mjs`
 * 刷新登记值，否则 CI 会红——这是「发行产物可从源复现」的判据，不是提示。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { buildStandalone } from './pack-core.mjs';
import { MAX_BYTES, GZIP_MAX_BYTES, budgetStatus } from './lib/budget.mjs';
import { readJson } from './lib/fs-utils.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const checkOnly = process.argv.includes('--check');
const FILE = 'plotpin-standalone.html';
const manifestPath = join(root, 'scripts', 'dist-manifest.json');

const html = readFileSync(join(root, 'index.html'), 'utf8');
const readSource = p => readFileSync(join(root, p), 'utf8');
const bundled = await buildStandalone(html, readSource);
const sha = createHash('sha256').update(bundled).digest('hex');
const bytes = Buffer.byteLength(bundled, 'utf8');
const kb = (bytes / 1024).toFixed(1);
const gzipBytes = gzipSync(Buffer.from(bundled, 'utf8')).length;
const gzipKb = (gzipBytes / 1024).toFixed(1);
const budget = budgetStatus({ bytes, gzipBytes });

if (!checkOnly) {
  const dist = join(root, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, FILE), bundled);
  writeFileSync(join(dist, 'SHA256SUMS.txt'), `${sha}  ${FILE}\n`);
  const manifest = {
    file: FILE, sha256: sha, bytes, kb: `${kb} KB`, gzipBytes, gzipKb: `${gzipKb} KB`,
    maxBytes: MAX_BYTES, gzipMaxBytes: GZIP_MAX_BYTES
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✅ 已生成 dist/${FILE}（${kb} KB）`);
  console.log(`   gzip: ${gzipKb} KB（${gzipBytes} B，硬上限 ${(GZIP_MAX_BYTES / 1024).toFixed(0)} KB）`);
  console.log(`   体积余量：${budget.margin} B / gzip 余量：${budget.gzipMargin} B`);
  budget.warnings.forEach(w => console.log(`   ! ${w}`));
  console.log(`   SHA256: ${sha}`);
  console.log(`   已刷新 scripts/dist-manifest.json（--check 以此为准）`);
  console.log('   双击该文件即可离线使用；校验和见 dist/SHA256SUMS.txt');
} else {
  const errors = [];

  /* 体积门禁：上限判红（errors）、余量分级预警（warnings 不阻断）、gzip 硬阈值判红 */
  errors.push(...budget.errors);
  budget.warnings.forEach(w => console.log(`  ! ${w}`));

  /* 确定性：同一份源两次构建必须得到同一字节串，否则「可从源复现」不成立 */
  const again = await buildStandalone(html, readSource);
  const shaAgain = createHash('sha256').update(again).digest('hex');
  if (shaAgain !== sha || Buffer.byteLength(again, 'utf8') !== bytes) {
    errors.push(`构建不确定：连续两次构建哈希不同（${sha.slice(0, 12)}… / ${shaAgain.slice(0, 12)}…）`);
  }

  /* CSP：脚本策略不得允许内联执行；每个内联脚本都必须有 sha256 白名单 */
  if (!/http-equiv="Content-Security-Policy"/i.test(bundled)) {
    errors.push('发行包缺少 Content-Security-Policy');
  }
  const scriptSrc = (bundled.match(/script-src[^;]*/i) || [''])[0];
  if (/'unsafe-inline'/.test(scriptSrc)) errors.push("CSP script-src 含 'unsafe-inline'（内联注入路径未被封堵）");
  /* 统计内联脚本时先剔除 HTML 注释（注释里也会出现文档性的 <script> 字样） */
  const noComments = bundled.replace(/<!--[\s\S]*?-->/g, '');
  const inlineScripts = (noComments.match(/<script>/g) || []).length;
  const hashes = (bundled.match(/'sha256-[A-Za-z0-9+/=]+'/g) || []).length;
  if (inlineScripts !== hashes) {
    errors.push(`CSP 内联脚本哈希数不匹配：内联脚本 ${inlineScripts} 个 / 哈希 ${hashes} 个`);
  }
  /* 实质校验：哈希值必须真的对应脚本体，而不只是「条数相等」。
     只比条数时，任何打包语义错误（脚本被截断/替换/漏签）都能通过 —— 这正是假绿的口子。 */
  const scriptBodies = [...noComments.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const actualHashes = new Set(scriptBodies.map(b => createHash('sha256').update(b, 'utf8').digest('base64')));
  const declaredHashes = new Set((scriptSrc.match(/'sha256-([A-Za-z0-9+/=]+)'/g) || [])
    .map(s => s.slice("'sha256-".length, -1)));
  for (const h of actualHashes) {
    if (!declaredHashes.has(h)) {
      errors.push(`CSP 哈希值与脚本体不匹配：脚本体 sha256-${h.slice(0, 12)}… 未出现在 script-src 白名单中`);
    }
  }
  for (const h of declaredHashes) {
    if (!actualHashes.has(h)) {
      errors.push(`CSP 哈希值与脚本体不匹配：白名单 sha256-${h.slice(0, 12)}… 找不到对应内联脚本`);
    }
  }

  /* 真实比对产物：以 scripts/dist-manifest.json 为准（CI 无 dist/ 也能校验） */
  if (!existsSync(manifestPath)) {
    errors.push('缺少 scripts/dist-manifest.json（无法比对产物，请运行 node scripts/build.mjs 生成）');
  } else {
    let manifest;
    try {
      manifest = readJson(manifestPath);
    } catch (e) {
      errors.push(`scripts/dist-manifest.json 不是合法 JSON：${e.message}`);
    }
    if (manifest) {
      if (manifest.sha256 !== sha) {
        errors.push(`产物 SHA256 与登记值不一致：构建 ${sha} / 登记 ${manifest.sha256}`
          + '（改了 js/css/index.html 后需运行 node scripts/build.mjs 刷新登记值）');
      }
      if (manifest.bytes !== bytes) {
        errors.push(`产物字节数与登记值不一致：构建 ${bytes} / 登记 ${manifest.bytes}`);
      }
      if (manifest.gzipBytes !== gzipBytes) {
        errors.push(`产物 gzip 字节数与登记值不一致：构建 ${gzipBytes} / 登记 ${manifest.gzipBytes}`
          + '（改了 js/css/index.html 后需运行 node scripts/build.mjs 刷新登记值）');
      }
      /* 预算常量单一来源：清单里的上限必须与 lib/budget.mjs 一致，防止「改清单绕过门禁」 */
      if (manifest.maxBytes !== MAX_BYTES) {
        errors.push(`dist-manifest.json 的 maxBytes（${manifest.maxBytes}）与 lib/budget.mjs（${MAX_BYTES}）不一致`);
      }
      if (manifest.gzipMaxBytes !== undefined && manifest.gzipMaxBytes !== GZIP_MAX_BYTES) {
        errors.push(`dist-manifest.json 的 gzipMaxBytes（${manifest.gzipMaxBytes}）与 lib/budget.mjs（${GZIP_MAX_BYTES}）不一致`);
      }
    }
  }

  /* dist/ 存在时额外逐字节比对，能抓到「登记正确但本地产物被改」 */
  const distFile = join(root, 'dist', FILE);
  if (existsSync(distFile)) {
    const distBytes = readFileSync(distFile);
    const distSha = createHash('sha256').update(distBytes).digest('hex');
    if (distBytes.length !== bytes || distSha !== sha) {
      errors.push(`dist/${FILE} 与源重建产物不一致（dist ${distSha.slice(0, 12)}… / 构建 ${sha.slice(0, 12)}…），`
        + '请删除 dist/ 后重新运行 node scripts/build.mjs');
    }
  }

  if (errors.length) {
    console.error('❌ 单文件打包校验未通过：');
    errors.forEach(e => console.error('  - ' + e));
    process.exit(1);
  }
  console.log(`✅ 单文件打包校验通过：${kb} KB（上限 ${(MAX_BYTES / 1024).toFixed(0)} KB，余量 ${budget.margin} B；`
    + `gzip ${gzipKb} KB，余量 ${budget.gzipMargin} B），无外部引用，`
    + `SHA256 ${sha} 与 scripts/dist-manifest.json 登记值一致；二次构建确定性一致`);
}
