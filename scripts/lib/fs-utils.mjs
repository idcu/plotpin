/* scripts/lib/fs-utils.mjs —— 门禁脚本共享的递归遍历 / JSON 读取（此前四处各写一份） */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** 递归收集文件：ext 为后缀过滤（空串表示不过滤），skip 按目录名跳过 */
export function walkFiles(dir, { ext = '', skip = [], out = [] } = {}) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (skip.includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkFiles(p, { ext, skip, out });
    else if (!ext || p.endsWith(ext)) out.push(p);
  }
  return out;
}

/** 读取并解析 JSON；读/解析异常抛给调用方，由各自门禁决定如何报告 */
export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}
