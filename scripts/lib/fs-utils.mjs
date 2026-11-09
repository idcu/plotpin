/* scripts/lib/fs-utils.mjs —— 门禁脚本共享的递归遍历 / JSON 读取（此前多处各写一份） */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

/**
 * 递归收集文件。
 * @param {string} dir 起始目录
 * @param {object} [opts]
 * @param {string} [opts.ext] 单后缀过滤（空串表示不过滤）
 * @param {string[]} [opts.exts] 多后缀过滤（优先于 ext）
 * @param {string[]} [opts.skip] 按名字跳过的文件/目录（每层生效）
 * @param {(dir:string,name:string)=>boolean} [opts.skipDir] 目录级跳过判定
 * @param {string[]} [opts.out] 结果累加数组
 */
export function walkFiles(dir, { ext = '', exts = [], skip = [], skipDir = null, out = [] } = {}) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (skip.includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (skipDir && skipDir(dir, name)) continue;
      walkFiles(p, { ext, exts, skip, skipDir, out });
    } else if (exts.length ? exts.includes(extname(name)) : (!ext || p.endsWith(ext))) {
      out.push(p);
    }
  }
  return out;
}

/** 读取并解析 JSON；读/解析异常抛给调用方，由各自门禁决定如何报告 */
export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}
