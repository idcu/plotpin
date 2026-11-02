import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { encodeText, byteLength, SIZE, MAX_BYTES, _internals } from '../src/index.mjs';

const require = createRequire(import.meta.url);

test('constants', () => {
  assert.equal(SIZE, 29);
  assert.equal(MAX_BYTES, 42);
  assert.equal(_internals.formatBits(0), 0x5412);
});

test('Reed-Solomon parity has 26 zero syndromes', () => {
  const data = Array.from({ length: 44 }, (_, i) => (i * 7) & 255);
  const ec = _internals.rsEc(data);
  assert.equal(ec.length, 26);
  for (let i = 0; i < 26; i++) {
    let s = 0;
    for (const b of data.concat(ec)) s = _internals.gfMul(s, _internals.EXP[i]) ^ b;
    assert.equal(s, 0);
  }
});

test('encodeText returns a valid 29×29 matrix with finder/timing patterns', () => {
  const r = encodeText('PLOTPIN:P0001');
  assert.equal(r.size, 29);
  assert.ok(r.mask >= 0 && r.mask <= 7);
  const corner = (r0, c0) => {
    for (let i = 0; i < 7; i++) {
      if (!r.modules[r0][c0 + i] || !r.modules[r0 + 6][c0 + i]
        || !r.modules[r0 + i][c0] || !r.modules[r0 + i][c0 + 6]) return false;
    }
    return true;
  };
  assert.ok(corner(0, 0));
  assert.ok(corner(0, 22));
  assert.ok(corner(22, 0));
  assert.equal(r.modules[6][8], 1);
  assert.equal(r.modules[6][9], 0);
  assert.equal(r.modules[8][6], 1);
  assert.equal(r.modules[9][6], 0);
  assert.equal(r.modules[21][8], 1);
});

test('payload length is UTF-8 bytes and over-limit is rejected', () => {
  assert.equal(byteLength('P0001'), 5);
  assert.ok(byteLength('设备') > 2);
  assert.throws(() => encodeText('x'.repeat(43)), /过长/);
});

test('cjs entry loads the same encoder', () => {
  const cjs = require('../src/index.cjs');
  assert.equal(cjs.encodeText('P1').size, 29);
  assert.equal(cjs.byteLength('设备'), byteLength('设备'));
});
