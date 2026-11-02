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

test('cjs entry loads the same API', () => {
  const cjs = require('../src/index.cjs');
  assert.equal(typeof cjs.parse, 'function');
  assert.equal(cjs.nearestAci('#ff0000'), 1);
  assert.equal(cjs.parse(build(ENTITIES, [])).entities.length, 5);
});
