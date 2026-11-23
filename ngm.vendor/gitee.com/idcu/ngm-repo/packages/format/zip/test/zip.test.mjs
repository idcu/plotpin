import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { deflateRawSync } from 'node:zlib';
import {
  crc32, encodeUtf8, decodeUtf8, build, readEntries, readText, LIMITS
} from '../src/index.mjs';

const require = createRequire(import.meta.url);

test('crc32 matches the zlib reference vector', () => {
  assert.equal(crc32(encodeUtf8('123456789')), 0xCBF43926);
});

test('utf-8 round trip', () => {
  assert.equal(decodeUtf8(encodeUtf8('工资单 · a1')), '工资单 · a1');
});

test('build + readEntries round trip (stored)', async () => {
  const buf = build([
    { name: 'a.txt', text: 'hello' },
    { name: '目录/b.txt', text: '你好' }
  ]);
  assert.ok(buf instanceof ArrayBuffer);
  const entries = await readEntries(buf);
  assert.equal(decodeUtf8(entries['a.txt']), 'hello');
  assert.equal(decodeUtf8(entries['目录/b.txt']), '你好');
});

test('readText decodes by entry name and misses to null', async () => {
  const entries = await readEntries(build([{ name: 'x.txt', text: 'hi' }]));
  assert.equal(readText(entries, 'x.txt'), 'hi');
  assert.equal(readText(entries, 'missing.txt'), null);
});

test('invalid zip is rejected with a clear error', async () => {
  await assert.rejects(() => readEntries(new Uint8Array([1, 2, 3])), /ZIP/);
});

test('limits are exposed for callers', () => {
  assert.ok(LIMITS.maxEntries > 0);
  assert.ok(LIMITS.maxBytes > 0);
});

test('limits can be overridden per call', async () => {
  const buf = build([{ name: 'a.txt', text: 'hello' }, { name: 'b.txt', text: 'world' }]);
  const entries = await readEntries(buf, { maxEntries: 10000, maxEntryBytes: 32 * 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024 });
  assert.equal(decodeUtf8(entries['a.txt']), 'hello');
  await assert.rejects(
    () => readEntries(buf, { maxEntries: 1 }),
    /条目数超过上限/
  );
  await assert.rejects(
    () => readEntries(buf, { maxEntryBytes: 3 }),
    /单文件解压后超过/
  );
});

test('compressed entries are capped while inflating, even if the central directory lies', async () => {
  const buf = build(
    [{ name: 'big.txt', text: 'compress-me-'.repeat(200) }],
    { compress: (bytes) => deflateRawSync(bytes) }
  );
  /* 把中央目录声明的解压后大小改成 1 字节，绕过「解压后复核」，
     只有流式累计能在展开过程中中止（防止先完整展开再拒绝的内存峰值）。 */
  const bytes = new Uint8Array(buf);
  const dv = new DataView(bytes.buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  assert.ok(eocd > 0);
  const cen = dv.getUint32(eocd + 16, true);
  assert.equal(dv.getUint32(cen, true), 0x02014b50);
  dv.setUint32(cen + 24, 1, true);
  await assert.rejects(() => readEntries(bytes, { maxEntryBytes: 3 }), /解压中超过/);
});

test('verifyCrc rejects corrupted entries when requested', async () => {
  const buf = build([{ name: 'a.txt', text: 'hello' }]);
  const bytes = new Uint8Array(buf);
  const at = bytes.findIndex((v, i) => v === 104 && bytes[i + 1] === 101 && bytes[i + 2] === 108);
  assert.ok(at > 0);
  bytes[at] = 105;
  const corrupted = bytes.buffer;
  const entries = await readEntries(corrupted);
  assert.equal(decodeUtf8(entries['a.txt']), 'iello');
  await assert.rejects(() => readEntries(corrupted, { verifyCrc: true }), /CRC/);
});

test('optional compressor writes method=8 and round trips', async () => {
  const buf = build(
    [{ name: 'big.txt', text: 'compress-me-'.repeat(200) }],
    { compress: (bytes) => deflateRawSync(bytes) }
  );
  const entries = await readEntries(buf);
  assert.equal(entries['big.txt'].length > 0, true);
  assert.equal(decodeUtf8(entries['big.txt']), 'compress-me-'.repeat(200));
});

test('cjs entry loads and shares the same implementation', () => {
  const cjs = require('../src/index.cjs');
  assert.equal(cjs.crc32(encodeUtf8('123456789')), 0xCBF43926);
  assert.equal(typeof cjs.readText, 'function');
});
