/* scripts/lib/budget.mjs —— 发行体积预算的单一来源（上限 / gzip 阈值 / 分级预警）
 *
 * build.mjs 与 size-report.mjs 共用；改数值只改这里，并同步 dist-manifest.json
 * （build.mjs --check 会校验两者一致，避免「报告一套、门禁另一套」）。
 * 分级预警不阻断构建：余量跌破 8,000 B 警告、跌破 6,000 B 强警告；
 * gzip 超过 260 KiB 警告、超过 280 KiB 判红（发布指标的硬边界）。
 */
export const MAX_BYTES = 820 * 1024;
export const GZIP_MAX_BYTES = 280 * 1024;
export const GZIP_WARN_BYTES = 260 * 1024;
export const MARGIN_WARN_BYTES = 8000;
export const MARGIN_CRITICAL_BYTES = 6000;

/** @returns {{margin:number,gzipMargin:number,level:'ok'|'warn'|'error',warnings:string[],errors:string[]}} */
export function budgetStatus({ bytes, gzipBytes }) {
  const margin = MAX_BYTES - bytes;
  const gzipMargin = GZIP_MAX_BYTES - gzipBytes;
  const warnings = [];
  const errors = [];
  if (bytes > MAX_BYTES) {
    errors.push(`产物体积超限：${bytes} B > 上限 ${MAX_BYTES} B（超出 ${bytes - MAX_BYTES} B）`);
  } else if (margin < MARGIN_CRITICAL_BYTES) {
    warnings.push(`强警告：体积余量仅 ${margin} B（< ${MARGIN_CRITICAL_BYTES} B），下一次功能改动前必须先回收`);
  } else if (margin < MARGIN_WARN_BYTES) {
    warnings.push(`预警：体积余量 ${margin} B（< ${MARGIN_WARN_BYTES} B），新增代码需同步回收`);
  }
  if (gzipBytes > GZIP_MAX_BYTES) {
    errors.push(`gzip 体积超限：${gzipBytes} B > 上限 ${GZIP_MAX_BYTES} B（超出 ${gzipBytes - GZIP_MAX_BYTES} B）`);
  } else if (gzipBytes > GZIP_WARN_BYTES) {
    warnings.push(`gzip 预警：${gzipBytes} B > ${GZIP_WARN_BYTES} B（距硬上限 ${gzipMargin} B）`);
  }
  const level = errors.length ? 'error' : warnings.length ? 'warn' : 'ok';
  return { margin, gzipMargin, level, warnings, errors };
}
