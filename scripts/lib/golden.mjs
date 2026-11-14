/**
 * golden.mjs —— golden 基线写入的唯一闸门
 *
 * 为什么需要它：过去只要 `UPDATE_GOLDEN=1` 就能覆盖基线，一次误设就能把缺陷输出
 * 静默固化成「新的正确答案」。这里把写入变成两个环境变量同时成立才允许：
 *
 *   UPDATE_GOLDEN=1 && ALLOW_GOLDEN=1 && !CI
 *
 * 允许写时：把差异摘要追加到 `test-results/golden-change.log`，并在 stdout 打印前 20 行差异。
 * 不允许写时：调用方必须报失败（本模块提供 refusalReason() 用于断言消息），基线文件一个字节都不动。
 *
 * 零第三方依赖；scripts/** 不进发行包。
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, relative, join, basename } from 'node:path';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
export const GOLDEN_ROOT = join(here, '..', '..');
export const GOLDEN_LOG = join(GOLDEN_ROOT, 'test-results', 'golden-change.log');

/** 是否允许写 golden：三个条件必须同时成立，CI 下永不可写。 */
export function goldenWritable() {
  return process.env.UPDATE_GOLDEN === '1'
    && process.env.ALLOW_GOLDEN === '1'
    && !process.env.CI;
}

/** 拒绝原因（允许写时返回空串）。供调用方拼进断言消息，避免静默跳过。 */
export function refusalReason() {
  if (goldenWritable()) return '';
  if (process.env.UPDATE_GOLDEN !== '1') return '';
  return process.env.CI
    ? 'golden 写入被拒绝：CI 环境永不可写基线'
    : 'golden 写入被拒绝：设置 ALLOW_GOLDEN=1 才允许更新基线（UPDATE_GOLDEN 单独不再生效）';
}

const sha = buf => createHash('sha256').update(buf).digest('hex');
const clip = s => (s === undefined ? '（无此行）' : (s.length > 160 ? s.slice(0, 160) + '…' : s));

/** 生成前后差异摘要：文本按行，二进制按字节数 + sha。无差异返回 null。 */
function summarize(file, next) {
  if (!existsSync(file)) return { header: '新建文件', detail: [] };
  const prev = readFileSync(file);
  if (Buffer.compare(prev, next) === 0) return null;
  const isText = /\.(svg|dxf|csv|tsv|json|geojson|txt|meta)$/i.test(file);
  if (!isText) {
    return {
      header: `二进制变更 ${prev.length} B → ${next.length} B（sha256 ${sha(prev).slice(0, 12)}… → ${sha(next).slice(0, 12)}…）`,
      detail: []
    };
  }
  const a = prev.toString('utf8').split('\n');
  const b = next.toString('utf8').split('\n');
  const detail = [];
  let firstLine = 0;
  for (let i = 0; i < Math.max(a.length, b.length) && detail.length < 40; i++) {
    if (a[i] !== b[i]) {
      if (!firstLine) firstLine = i + 1;
      detail.push(`  L${i + 1}\n    - ${clip(a[i])}\n    + ${clip(b[i])}`);
    }
  }
  return {
    header: `文本变更 ${prev.length} B → ${next.length} B（首个差异行 L${firstLine}）`,
    detail
  };
}

/**
 * 写 golden。调用方必须先判断 goldenWritable()；不满足时这里抛错（调用方本应报失败）。
 * @param {string} file 基线绝对路径
 * @param {Buffer|string} data 新内容
 * @param {string} label 人类可读名称（进日志）
 */
export function writeGolden(file, data, label = basename(file)) {
  if (!goldenWritable()) {
    throw new Error(refusalReason() || 'golden 写入被拒绝：需要 UPDATE_GOLDEN=1 且 ALLOW_GOLDEN=1');
  }
  const next = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  const summary = summarize(file, next);
  writeFileSync(file, next);
  if (!summary) {
    console.log(`[golden] ${label} 无变化，已重写`);
    return;
  }
  console.log(`[golden] ${label} 已更新：${summary.header}`);
  summary.detail.slice(0, 20).forEach(l => console.log(l));
  try {
    mkdirSync(dirname(GOLDEN_LOG), { recursive: true });
    const rel = relative(GOLDEN_ROOT, file).replace(/\\/g, '/');
    appendFileSync(GOLDEN_LOG,
      `${new Date().toISOString()} ${rel} ${summary.header}\n${summary.detail.join('\n')}\n`, 'utf8');
  } catch (e) {
    console.error(`[golden] 差异日志写入失败（不影响基线写入）：${e.message}`);
  }
}
