import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildImagePdf } from '../src/index.mjs';

const require = createRequire(import.meta.url);

const page = (w, h, s) => ({ width: w, height: h, b64: Buffer.from(s).toString('base64') });

test('single and multi page PDF structure', () => {
  const one = buildImagePdf([page(100, 50, 'JPEG-A')]);
  assert.ok(one instanceof Uint8Array);
  const text = Buffer.from(one).toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4\n'));
  assert.ok(text.includes('/MediaBox [0 0 100 50]'));
  assert.ok(text.includes('%%EOF'));

  const two = buildImagePdf([page(100, 50, 'A'), page(50, 100, 'B')]);
  const t2 = Buffer.from(two).toString('latin1');
  assert.ok(t2.includes('/Count 2'));
  assert.ok(t2.includes('/MediaBox [0 0 50 100]'));
  assert.ok(t2.includes('startxref'));
});

test('empty or missing pages are rejected', () => {
  assert.throws(() => buildImagePdf([]), /没有可输出的页面/);
  assert.throws(() => buildImagePdf(null), /没有可输出的页面/);
  assert.throws(() => buildImagePdf([null]), /没有可输出的页面/);
});

test('cjs entry loads the same builder', () => {
  const cjs = require('../src/index.cjs');
  const out = cjs.buildImagePdf([page(10, 10, 'X')]);
  assert.ok(Buffer.from(out).toString('latin1').includes('%PDF-1.4'));
});
