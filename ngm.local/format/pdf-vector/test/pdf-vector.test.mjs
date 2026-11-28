/* pdf-vector.test.mjs —— @local/format-pdf-vector 的零依赖单测
 * 只测不依赖 Canvas 的纯函数：stream / fit / mapPt / path / docPages。
 * 运行：node ngm.local/format/pdf-vector/test/pdf-vector.test.mjs
 */
import assert from 'node:assert/strict';
import PdfVec from '../src/index.mjs';

let pass = 0;
const eq = (name, actual, expected) => {
  assert.deepEqual(actual, expected, name);
  pass++;
};
const ok = (name, value) => {
  assert.ok(value, name);
  pass++;
};

const { stream, fit, mapPt, path, docPages } = PdfVec;

eq('stream-基础命令', stream([['m', 0, 0], ['l', 10, 10]]), '0 0 m\n10 10 l');
eq('stream-两位小数', stream([['rg', 0.1234, 0.5, 1]]), '0.12 0.5 1 rg');
assert.throws(() => stream([['nope', 1]]), /未知运算符/, 'stream-未知运算符');
pass++;

const f = fit({ minX: 0, minY: 0, w: 100, h: 50 }, 500, 500, 10);
eq('fit-等比缩放', f.k, 4.8);
eq('fit-居中偏移', [f.ox, f.oy], [10, 130]);
eq('mapPt-左上', mapPt(f, 0, 0), [10, 130]);
eq('mapPt-右下', mapPt(f, 100, 50), [490, 370]);
eq('path-闭合', path(f, [[0, 0], [100, 50]], true), [['m', 10, 130], ['l', 490, 370], ['h']]);

const pdf = docPages(100, 100, [{ body: '0 0 m 10 10 l S' }], {
  measure: { width: () => 0.5, ascent: 0.88, descent: 0.12 }
});
ok('docPages-返回字节', pdf instanceof Uint8Array && pdf.length > 100);
ok('docPages-文件头', new TextDecoder().decode(pdf.slice(0, 8)) === '%PDF-1.4');
ok('docPages-包含 Catalog', new TextDecoder().decode(pdf).includes('/Type /Catalog'));

console.log(`✅ @local/format-pdf-vector：${pass} 项断言通过`);
