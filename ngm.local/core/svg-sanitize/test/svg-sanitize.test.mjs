/* @local/core-svg-sanitize 自测：路径白名单 / SVG 安全 / viewBox / 符号包导入 */
import assert from 'node:assert/strict';
import Pkg from '../src/index.mjs';

const { createSymbolSanitizer } = Pkg;
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };
const eq = (name, a, b) => { assert.deepEqual(a, b); n++; console.log('  ✓ ' + name); };
const throws = (name, fn, re) => { assert.throws(fn, re); n++; console.log('  ✓ ' + name); };

const S = createSymbolSanitizer({
  limits: { PATHS: 3, PATH_CHARS: 40, BUNDLE_SYMBOLS: 2, NAME_CHARS: 6, ALIASES: 2, ALIAS_CHARS: 4 },
  viewBox: { x: 0, y: 0, w: 10, h: 10 },
  categories: ['监控', '其他'],
  defaultColor: '#123456'
});

ok('路径合法通过', () => eq('归一化路径', S.normalizePaths(['M0 0L1 1']), [{ d: 'M0 0L1 1', fill: false }]));
throws('路径缺少 M 起始被拒', () => S.normalizePaths(['L0 0']), /M\/m/);
throws('路径非法字符被拒', () => S.normalizePaths(['M0 0 <']), /非法字符/);
throws('路径条数上限', () => S.normalizePaths(['M0 0', 'M1 1', 'M2 2', 'M3 3']), /最多 3 条/);
throws('路径长度上限', () => S.normalizePaths(['M' + '0'.repeat(50)]), /过长/);
eq('viewBox 非法回退默认', S.normalizeViewBox({ x: 0, y: 0, w: 0, h: 10 }), { x: 0, y: 0, w: 10, h: 10 });
eq('别名截断与限条', S.normalizeAliases(['abcd', 'efgh', '', 'ijkl']), ['abcd', 'efgh']);
throws('SVG script 被拒', () => S.parseSvg('<svg><script>alert(1)</script></svg>'), /script/);
throws('SVG 事件属性被拒', () => S.parseSvg('<svg onload="x()"></svg>'), /on\*/);
throws('SVG 外链被拒', () => S.parseSvg('<svg><path href="https://x/a" d="M0 0"/></svg>'), /外部资源/);
throws('SVG 危险元素被拒', () => S.parseSvg('<svg><foreignObject/></svg>'), /foreignObject/);
const parsed = S.parseSvg('<svg viewBox="0 0 20 20"><path d="M1 1L2 2" fill="none"/><circle cx="5" cy="5" r="2"/></svg>');
eq('SVG 提取 path 与圆', parsed.paths.length, 2);
eq('SVG viewBox 解析', parsed.vb, { x: 0, y: 0, w: 20, h: 20 });
const bundle = S.sanitizeBundle({ symbols: [
  { id: 'sym.a', name: '超长名称超过六字', cat: '监控', aliases: ['abcde'], color: 'bad', paths: ['M0 0'] },
  { id: 'sym.a', name: '', cat: '未知', paths: ['M1 1'] }
] }, ['sym.a']);
eq('导入名称截断', bundle[0].name, '超长名称超过');
eq('非法颜色回退默认', bundle[0].color, '#123456');
eq('未知分类回退兜底', bundle[1].category, '其他');
eq('重复 id 自动改名', bundle[1].id, 'sym.import.2');
throws('符号包非数组被拒', () => S.sanitizeBundle({}), /symbols/);
throws('符号包条数上限', () => S.sanitizeBundle([{ paths: ['M0 0'] }, { paths: ['M0 0'] }, { paths: ['M0 0'] }]), /最多 2 个/);
console.log(`\n✅ @local/core-svg-sanitize：${n} 项断言通过`);
