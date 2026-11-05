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
import { buildStandalone } from './pack-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const checkOnly = process.argv.includes('--check');
const FILE = 'plotpin-standalone.html';
const manifestPath = join(root, 'scripts', 'dist-manifest.json');
const MAX_BYTES = 750 * 1024;

const html = readFileSync(join(root, 'index.html'), 'utf8');
const readSource = p => readFileSync(join(root, p), 'utf8');
const bundled = buildStandalone(html, readSource);
const sha = createHash('sha256').update(bundled).digest('hex');
const bytes = Buffer.byteLength(bundled, 'utf8');
const kb = (bytes / 1024).toFixed(1);

if (!checkOnly) {
  const dist = join(root, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, FILE), bundled);
  writeFileSync(join(dist, 'SHA256SUMS.txt'), `${sha}  ${FILE}\n`);
  const manifest = { file: FILE, sha256: sha, bytes, kb: `${kb} KB`, maxBytes: MAX_BYTES };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✅ 已生成 dist/${FILE}（${kb} KB）`);
  console.log(`   SHA256: ${sha}`);
  console.log(`   已刷新 scripts/dist-manifest.json（--check 以此为准）`);
  console.log('   双击该文件即可离线使用；校验和见 dist/SHA256SUMS.txt');
} else {
  const errors = [];

  if (bytes > MAX_BYTES) {
    errors.push(`产物体积超限：${kb} KB > ${(MAX_BYTES / 1024).toFixed(0)} KB`);
  }

  /* 确定性：同一份源两次构建必须得到同一字节串，否则「可从源复现」不成立 */
  const again = buildStandalone(html, readSource);
  const shaAgain = createHash('sha256').update(again).digest('hex');
  if (shaAgain !== sha || Buffer.byteLength(again, 'utf8') !== bytes) {
    errors.push(`构建不确定：连续两次构建哈希不同（${sha.slice(0, 12)}… / ${shaAgain.slice(0, 12)}…）`);
  }

  /* 真实比对产物：以 scripts/dist-manifest.json 为准（CI 无 dist/ 也能校验） */
  if (!existsSync(manifestPath)) {
    errors.push('缺少 scripts/dist-manifest.json（无法比对产物，请运行 node scripts/build.mjs 生成）');
  } else {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
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
  console.log(`✅ 单文件打包校验通过：${kb} KB（上限 ${(MAX_BYTES / 1024).toFixed(0)} KB），无外部引用，`
    + `SHA256 ${sha} 与 scripts/dist-manifest.json 登记值一致；二次构建确定性一致`);
}
