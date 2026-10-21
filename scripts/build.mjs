/**
 * build.mjs —— 发行版打包：单文件 HTML + SHA256 校验和
 *
 * 用法：
 *   node scripts/build.mjs            输出 dist/plotpin-standalone.html 与 dist/SHA256SUMS.txt
 *   node scripts/build.mjs --check    仅构建并校验（不写 dist，CI 用）
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildStandalone } from './pack-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const checkOnly = process.argv.includes('--check');

const html = readFileSync(join(root, 'index.html'), 'utf8');
const bundled = buildStandalone(html, p => readFileSync(join(root, p), 'utf8'));
const sha = createHash('sha256').update(bundled).digest('hex');
const kb = (Buffer.byteLength(bundled, 'utf8') / 1024).toFixed(1);

if (checkOnly) {
  console.log(`✅ 单文件打包校验通过：${kb} KB，无外部引用，SHA256 ${sha}`);
} else {
  const dist = join(root, 'dist');
  mkdirSync(dist, { recursive: true });
  const file = 'plotpin-standalone.html';
  writeFileSync(join(dist, file), bundled);
  writeFileSync(join(dist, 'SHA256SUMS.txt'), `${sha}  ${file}\n`);
  console.log(`✅ 已生成 dist/${file}（${kb} KB）`);
  console.log(`   SHA256: ${sha}`);
  console.log('   双击该文件即可离线使用；校验和见 dist/SHA256SUMS.txt');
}
