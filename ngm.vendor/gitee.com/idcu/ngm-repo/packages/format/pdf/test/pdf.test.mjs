import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { deflateSync, inflateSync } from 'node:zlib';
import * as P from '../src/index.mjs';

const inflate = async bytes => new Uint8Array(inflateSync(Buffer.from(bytes)));
const toLatin = bytes => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return s; };
const obj = (n, body) => n + ' 0 obj\n' + body + '\nendobj\n';

/* 与 plotpin scripts/selftest.mjs 第 37 组同一夹具：1 页、3 条路径、1 段文本、Flate RGB 图 + DCT JPEG */
function fixture() {
  const content = '1 0 0 1 0 0 cm\n10 10 100 50 re S\n50 50 m 150 60 l S\n20 20 30 30 re f\nBT /F1 12 Tf 50 80 Td (Hello World) Tj ET\n';
  const rgb = new Uint8Array([255, 0, 0, 0, 255, 0]);
  const z = deflateSync(rgb);
  let pdf = '%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n';
  pdf += obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  pdf += obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [5 7 205 107] >>');
  pdf += obj(3, '<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>');
  pdf += obj(4, '<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream');
  pdf += obj(5, '<< /Type /XObject /Subtype /Image /Width 2 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 ' +
    '/Filter /FlateDecode /DecodeParms << /Predictor 1 /Columns 2 /Colors 3 >> /Length ' + z.length + ' >>\nstream\n' + toLatin(z) + 'endstream');
  pdf += obj(6, '<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length 4 >>\nstream\n' +
    toLatin(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0])) + 'endstream');
  return { pdf, content, z };
}

test('dict helpers', () => {
  const d = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Rotate -90 /Filter [/FlateDecode /DCTDecode] /DecodeParms << /Predictor 1 >> >>';
  assert.equal(P.dictName(d, 'Type'), 'Page');
  assert.equal(P.dictNumber(d, 'Rotate'), -90);
  assert.deepEqual(P.dictArray(d, 'MediaBox'), [0, 0, 200, 100]);
  assert.deepEqual(P.dictRef(d, 'Parent'), { num: 2, gen: 0 });
  assert.equal(P.dictRawBlock(d, 'DecodeParms'), '<< /Predictor 1 >>');
  assert.deepEqual(P.filtersOf(d), ['FlateDecode', 'DCTDecode']);
  assert.deepEqual(P.filtersOf('<< /Filter /FlateDecode >>'), ['FlateDecode']);
  assert.deepEqual(P.filtersOf('<< /Type /Page >>'), []);
});

test('bytesToBinary / binaryToBytes round trip', () => {
  const b = new Uint8Array([0, 1, 127, 128, 255]);
  const s = P.bytesToBinary(b);
  assert.deepEqual([...P.binaryToBytes(s)], [...b]);
});

test('scanObjects splits dict and stream data by /Length', () => {
  const { pdf } = fixture();
  const objs = P.scanObjects(P.bytesToBinary(new Uint8Array(Buffer.from(pdf, 'binary'))));
  assert.equal(objs.size, 6);
  assert.equal(objs.get(4).data.length, fixture().content.length);
  assert.ok(objs.get(5).dict.includes('/FlateDecode'));
});

test('tokenizeContent: numbers / names / strings / arrays / operators', () => {
  const toks = P.tokenizeContent('1 0 0 1 0 0 cm\n[ (Hi) 20 ] TJ\n/F1 12 Tf\n0.5 45.2 m');
  const kinds = toks.map(t => t.t + ':' + t.v);
  assert.ok(kinds.includes('num:1'));
  assert.ok(kinds.includes('op:cm'));
  assert.ok(kinds.includes('[:['));
  assert.ok(kinds.includes('str:Hi'));
  assert.ok(kinds.includes('name:F1'));
  assert.ok(kinds.includes('num:45.2'));
  assert.ok(kinds.includes('op:m'));
});

test('decodeStream: FlateDecode uses injected inflate; DCTDecode passes bytes through', async () => {
  const { z } = fixture();
  const data = toLatin(z);
  const flate = await P.decodeStream({ dict: '<< /Filter /FlateDecode /Length ' + z.length + ' >>', data }, { inflate });
  assert.equal(flate.binary, true);
  assert.deepEqual([...flate.bytes], [255, 0, 0, 0, 255, 0]);
  const dct = await P.decodeStream({ dict: '<< /Filter /DCTDecode /Length 4 >>', data: '\u00FF\u00D8\u00FF\u00E0' }, { inflate });
  assert.equal(dct.binary, true);
  assert.deepEqual([...dct.bytes], [0xFF, 0xD8, 0xFF, 0xE0]);
  assert.equal(await P.decodeStream({ dict: '<< >>', data: null }, { inflate }), '');
  await assert.rejects(P.decodeStream({ dict: '<< /Filter /FlateDecode >>', data }, {}), /需要注入 inflate/);
});

test('decodeStream rejects inflated payloads over maxInflateBytes', async () => {
  const { z } = fixture();
  await assert.rejects(
    P.decodeStream({ dict: '<< /Filter /FlateDecode >>', data: toLatin(z) }, { inflate, maxInflateBytes: 5 }),
    /解压后超过/
  );
});

test('parse returns object tree + page list + raw content, never drawing objects', async () => {
  const { pdf, content } = fixture();
  const r = await P.parse(pdf, { inflate });
  assert.equal(r.objects.size, 6);
  assert.equal(r.pages.length, 1);
  const page = r.pages[0];
  assert.deepEqual(page.mediaBox, { x: 5, y: 7, width: 200, height: 100, raw: [5, 7, 205, 107] });
  assert.deepEqual(page.contentRefs, [4]);
  assert.equal(page.contentText, content);
  assert.equal(page.contents[0].text, content);
  assert.equal('paths' in r, false);
  assert.equal('images' in r, false);
});

test('parse: MediaBox from parent chain and default fallback', async () => {
  let pdf = '%PDF-1.4\n';
  pdf += obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  pdf += obj(2, '<< /Type /Pages /Kids [3 0 R 4 0 R] /MediaBox [0 0 300 200] >>');
  pdf += obj(3, '<< /Type /Page /Parent 2 0 R >>');
  pdf += obj(4, '<< /Type /Page >>');
  const r = await P.parse(pdf, { inflate });
  assert.equal(r.pages.length, 2);
  assert.equal(r.pages[0].mediaBox.width, 300);
  assert.deepEqual(r.pages[1].mediaBox.raw, [0, 0, 612, 792]);
});

test('parse: multiple content streams are concatenated with newline', async () => {
  let pdf = '%PDF-1.4\n';
  pdf += obj(1, '<< /Type /Page /MediaBox [0 0 100 100] /Contents [3 0 R 4 0 R] >>');
  pdf += obj(3, '<< /Length 6 >>\nstream\nA B m\nendstream');
  pdf += obj(4, '<< /Length 6 >>\nstream\nC D l\nendstream');
  const r = await P.parse(pdf, { inflate });
  assert.deepEqual(r.pages[0].contentRefs, [3, 4]);
  assert.equal(r.pages[0].contentText, 'A B m\n\nC D l\n\n');
});

test('parse rejects invalid input and limit violations', async () => {
  await assert.rejects(P.parse('not a pdf at all', { inflate }), /不是有效的 PDF 文件/);
  await assert.rejects(P.parse('%PDF-1.4\n', { inflate, limits: { maxBytes: 5 } }), /PDF 过大/);
  await assert.rejects(P.parse(fixture().pdf, { inflate, limits: { maxObjects: 2 } }), /对象数超过上限/);
  await assert.rejects(P.parse(fixture().pdf, { inflate, limits: { maxPages: 0 } }), /页数超过上限/);
});

/* 最小 PDF LZW 编码器（仅测试用，earlyChange=1），与解码器形成往返闭环 */
function lzwEncode(input, earlyChange = 1) {
  const dict = new Map();
  let next = 258, codeLen = 9;
  for (let i = 0; i < 256; i++) dict.set(String.fromCharCode(i), i);
  const bits = [];
  const emit = (code) => { for (let i = codeLen - 1; i >= 0; i--) bits.push((code >> i) & 1); };
  emit(256);
  let seq = String.fromCharCode(input[0]);
  for (let i = 1; i < input.length; i++) {
    const c = String.fromCharCode(input[i]), cand = seq + c;
    if (dict.has(cand)) { seq = cand; continue; }
    emit(dict.get(seq));
    if (next < 4096) {
      dict.set(cand, next); next++;
      if (next + earlyChange >= (1 << codeLen) && codeLen < 12) codeLen++;
    }
    seq = c;
  }
  emit(dict.get(seq));
  emit(257);
  const out = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((b, i) => { out[i >> 3] |= b << (7 - (i & 7)); });
  return out;
}

test('lzwDecode round trips the PDF LZW variant', () => {
  /* PDF 规范示例：-----A---B */
  assert.deepEqual([...P.lzwDecode(new Uint8Array([0x80, 0x0B, 0x60, 0x50, 0x22, 0x0C, 0x0C, 0x85, 0x01]))],
    [45, 45, 45, 45, 45, 65, 45, 45, 45, 66]);
  const raw = new Uint8Array(700);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 37) % 251;
  const packed = lzwEncode(raw);
  const back = P.lzwDecode(packed);
  assert.deepEqual([...back], [...raw]);
  assert.ok(back.length > 300);               // 覆盖 9→10 位扩宽
});

test('decodeStream supports LZWDecode', async () => {
  const content = '0 0 m 4 4 l S';
  const packed = lzwEncode(new Uint8Array(Buffer.from(content, 'binary')));
  const d = await P.decodeStream({ dict: '<< /Filter /LZWDecode /Length ' + packed.length + ' >>', data: toLatin(packed) }, { inflate });
  assert.equal(d.text, content);
});

test('parse unpacks /ObjStm object streams so pages are discoverable', async () => {
  const body = '<< /Type /Page /MediaBox [0 0 100 100] /Contents 4 0 R >>';
  const text = '3 0 ' + body;
  const z = deflateSync(Buffer.from(text, 'binary'));
  let pdf = '%PDF-1.4\n';
  pdf += obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  pdf += obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  pdf += obj(4, '<< /Length 5 >>\nstream\nA B m\nendstream');
  pdf += obj(5, '<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length ' + z.length + ' >>\nstream\n' + toLatin(z) + 'endstream');
  const r = await P.parse(pdf, { inflate });
  assert.equal(r.pages.length, 1);
  assert.ok(r.objects.has(3));
  assert.deepEqual(r.pages[0].contentRefs, [4]);
  assert.equal(r.pages[0].contentText, 'A B m\n');
});

test('cmykToRgb converts 4-channel pixels to RGB', () => {
  const rgb = P.cmykToRgb(new Uint8Array([0, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255, 0]));
  assert.deepEqual([...rgb], [255, 0, 0, 0, 0, 0, 0, 0, 0]);
});

test('cjs entry loads and shares the same implementation', () => {
  const require = createRequire(import.meta.url);
  const C = require('../src/index.cjs');
  assert.equal(typeof C.parse, 'function');
  assert.equal(C.PT_TO_METER, P.PT_TO_METER);
  assert.deepEqual(C.dictArray('<< /MediaBox [0 0 1 1] >>', 'MediaBox'), [0, 0, 1, 1]);
});
