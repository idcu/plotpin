import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  parse, build, nearestAci, safeLayer, stripMtext, LIMITS
} from '../src/index.mjs';

const require = createRequire(import.meta.url);

const ENTITIES = [
  { type: 'LWPOLYLINE', layer: '围墙', closed: true, points: [[0, 0], [10, 0], [10, 10], [0, 10]] },
  { type: 'CIRCLE', layer: '设备', x: 20, y: 20, r: 5 },
  { type: 'POINT', layer: '设备', x: 3, y: 4 },
  { type: 'LINE', layer: '0', points: [[0, 15], [5, 15]] },
  { type: 'TEXT', layer: '0', color: '#111111', x: 0, y: 15, text: 'O0001 camera-01', height: 0.8 }
];

test('build + parse round trip (mm ↔ m)', () => {
  const text = build(ENTITIES, [{ name: '围墙', color: '#334155' }, { name: '设备', color: '#dc2626' }]);
  assert.ok(text.includes('$ACADVER') && text.includes('AC1009'));
  assert.ok(text.includes('$INSUNITS') && text.includes('\r\n70\r\n4\r\n'));
  assert.ok(text.trimEnd().endsWith('EOF'));
  assert.ok(text.includes('\r\n围墙\r\n'));

  const back = parse(text);
  assert.equal(back.entities.length, 5);
  assert.equal(back.unit, 0.001);
  const poly = back.entities.find((e) => e.type === 'LWPOLYLINE' && e.layer === '围墙');
  assert.equal(poly.closed, true);
  assert.equal(poly.points.length, 4);
  assert.equal(poly.points[0][0], 0);
  assert.equal(poly.points[1][0], 10);
  const circle = back.entities.find((e) => e.type === 'CIRCLE');
  assert.equal(circle.r, 5);
  const point = back.entities.find((e) => e.type === 'POINT');
  assert.equal(point.x, 3);
  const txt = back.entities.find((e) => e.type === 'TEXT');
  assert.equal(txt.text, 'O0001 camera-01');
});

test('parse handles empty / junk / truncated input', () => {
  assert.equal(parse('').entities.length, 0);
  assert.equal(parse(null).entities.length, 0);
  assert.equal(parse('not a dxf at all\n1\n2\n3').entities.length, 0);
  assert.doesNotThrow(() => parse('0\nSECTION\n2\nENTITIES\n0\nLINE\n10\n0'));
});

test('parse limits are parameters', () => {
  const text = build(ENTITIES, []);
  assert.throws(() => parse(text, { maxChars: 20 }), /文本上限/);
  assert.throws(() => parse(text, { maxEntities: 2 }), /实体数超过上限/);
  assert.equal(parse(text, { maxEntities: LIMITS.maxEntities }).entities.length, 5);
});

test('helpers: ACI / layer sanitising / MTEXT cleanup', () => {
  assert.equal(nearestAci('#ff0000'), 1);
  assert.equal(nearestAci('#00ff00'), 3);
  assert.equal(nearestAci('nope'), 7);
  assert.equal(safeLayer('a/b:c*'), 'a_b_c_');
  assert.equal(stripMtext('{\\fArial;hello\\Pworld}'), 'hello world');
});

function dxf(insUnits, blocks, entities) {
  let s = '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n' + insUnits + '\n0\nENDSEC\n';
  if (blocks) s += '0\nSECTION\n2\nBLOCKS\n' + blocks + '0\nENDSEC\n';
  s += '0\nSECTION\n2\nENTITIES\n' + entities + '0\nENDSEC\n0\nEOF\n';
  return s;
}
const block = (name, body) => '0\nBLOCK\n8\n0\n2\n' + name + '\n70\n0\n' + body + '0\nENDBLK\n';

test('strictUnits enables the full AutoCAD $INSUNITS table', () => {
  const line = '0\nLINE\n8\n0\n10\n1\n20\n0\n11\n2\n21\n0\n';
  for (const [code, factor] of [[3, 1609.344], [7, 1000], [8, 2.54e-8], [9, 2.54e-5],
    [10, 0.9144], [11, 1e-10], [12, 1e-9], [13, 1e-6]]) {
    const r = parse(dxf(code, '', line), { strictUnits: true });
    assert.equal(r.unit, factor, 'INSUNITS ' + code);
    assert.equal(r.entities[0].points[0][0], factor);
  }
});

test('default unit mapping stays backward-compatible', () => {
  const line = '0\nLINE\n8\n0\n10\n1\n20\n0\n11\n2\n21\n0\n';
  assert.equal(parse(dxf(10, '', line)).unit, 1);       // 旧映射：yard 仍按 1
  assert.equal(parse(dxf(13, '', line)).unit, 1000);    // 旧映射：micron 仍按 1000
});

test('nested INSERT expansion is opt-in and depth-limited', () => {
  const inner = '0\nLINE\n8\n0\n10\n0\n20\n0\n11\n1\n21\n1\n';
  const outer = '0\nINSERT\n8\n0\n2\nINNER\n10\n2\n20\n0\n41\n2\n42\n2\n50\n90\n';
  const blocks = block('INNER', inner) + block('OUTER', outer);
  const top = '0\nINSERT\n8\nL1\n2\nOUTER\n10\n100\n20\n0\n41\n1\n42\n1\n50\n0\n';
  const text = dxf(6, blocks, top);

  /* 默认只展开顶层（旧行为）：内层 INSERT 不产生几何 */
  assert.equal(parse(text).entities.length, 0);
  /* 放开到 2 层：外块缩放/旋转 + 内块平移后落到世界系 */
  const deep = parse(text, { maxInsertDepth: 2 });
  assert.equal(deep.entities.length, 1);
  const line = deep.entities[0];
  assert.deepEqual(line.points, [[102, 0], [100, 2]]);
  assert.equal(line.layer, 'L1');              // block 内 layer 0 继承顶层 INSERT 图层
});

test('INSERT scales TEXT height and fixes rotated placement', () => {
  const txt = '0\nTEXT\n8\n0\n10\n1\n20\n1\n40\n1.5\n1\nHI\n';
  const text = dxf(6, block('B', txt), '0\nINSERT\n8\nL2\n2\nB\n10\n10\n20\n0\n41\n1\n42\n2\n50\n90\n');
  const e = parse(text).entities[0];
  assert.equal(e.type, 'TEXT');
  assert.equal(e.height, 3);                   // 1.5 × |sy|
  assert.equal(e.x, 8);                        // (1,1) → sy=2 → (1,2) → rot90 (-2,1) → +10 = (8,1)
  assert.ok(Math.abs(e.y - 1) < 1e-12);
});

test('zero-vertex LWPOLYLINE is skipped instead of throwing', () => {
  const emptyPoly = '0\nLWPOLYLINE\n8\n0\n90\n0\n';
  const r = parse(dxf(6, '', emptyPoly + '0\nPOINT\n8\n0\n10\n2\n20\n3\n'));
  assert.equal(r.entities.length, 1);
  assert.equal(r.entities[0].type, 'POINT');
});

test('build emits R12 by default and R14 on request', () => {
  assert.ok(build(ENTITIES, []).includes('AC1009'));
  const r14 = build(ENTITIES, [], { version: 'R14' });
  assert.ok(r14.includes('AC1014'));
  assert.ok(parse(r14).entities.length >= 5);
});

test('cjs entry loads the same API', () => {
  const cjs = require('../src/index.cjs');
  assert.equal(typeof cjs.parse, 'function');
  assert.equal(cjs.nearestAci('#ff0000'), 1);
  assert.equal(cjs.parse(build(ENTITIES, [])).entities.length, 5);
});
