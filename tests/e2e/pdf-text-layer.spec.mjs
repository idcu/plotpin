import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* V-6：矢量 PDF 的不可见文字层验收。
   正向：真实导出后 pdftotext 必须提取出图上文字（含中文与空格）。
   负向：把同一 PDF 的 `/ToUnicode N 0 R` 等长抹成空格（xref 偏移不变），
        提取结果必须退化——证明可提取性来自 ToUnicode，而不是位图或巧合。
   V-6b：清单页（1240×1748）也带同一套文字层，按行列落位；判据是「完整行序列 + 列序 + -layout 行对齐」，
        不是「包含关键字」——真正乱序时会红。
        实测（poppler 26.01）：默认模式不还原表格，而是每个单元格一行、行优先、列内左到右；
        加 `-layout` 才把同一行的单元格还原成一行并按列对齐。两条判据都断言，不能只留一种。
   说明：pdftotext 只证明「文字可被提取、顺序正确」，不证明查看器选中高亮/打印表现；
   后者需人工在 Edge/Adobe/Foxit/WPS 验证（未自动化）。 */

const needs = (bin) => spawnSync(bin, ['-v'], { stdio: 'ignore' }).status === 0;

test('V-6：矢量 PDF 文字可提取；删掉 /ToUnicode 后必须退化', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();

  /* 固定时间戳；文字对象 + 带名称/面积/周长的矩形，覆盖中英文、数字、㎡ 与空格 */
  await page.evaluate(() => {
    Date.prototype.toLocaleString = () => '2026-01-01 00:00';
    state.meta.name = 'V6';
    state.objects.push(baseObject('text', 'text.builtin', { name: 'T1', text: '配电箱 A1', x: 20, y: 20, height: 0.6 }));
    state.objects.push(baseObject('rect', 'rect.area', {
      name: 'V6矩形', x: 0, y: 0, width: 10, height: 5, annot: { name: true, area: true, perimeter: true }
    }));
    commitChange('V-6 文字层');
  });

  const dl = page.waitForEvent('download');
  await page.selectOption('#exportKind', 'pdf-vector');
  await page.click('#exportBtn');
  await page.locator('#modalFooter button').last().click();
  const pdf = readFileSync(await (await dl).path());
  const src = pdf.toString('latin1');

  /* 结构判据（不依赖 poppler）：Type3 + ToUnicode + 不可见渲染模式，且内容流仍是 ASCII */
  expect(src).toContain('/Subtype /Type3');
  expect(src).toMatch(/\/ToUnicode \d+ 0 R/);
  expect(src).toContain('3 Tr');
  expect(src).toMatch(/\/CharProcs << \/g1 \d+ 0 R/);

  if (!needs('pdftotext')) {
    test.skip(true, '未安装 pdftotext（poppler）：提取对比是本地验收项，需在装 poppler 的机器上复跑');
    return;
  }

  /* 等长抹掉 /ToUnicode：不破坏 xref 偏移，负向样本仍是合法 PDF */
  const neg = Buffer.from(src.replace(/\/ToUnicode \d+ 0 R/g, m => ' '.repeat(m.length)), 'latin1');
  expect(neg.toString('latin1')).not.toContain('/ToUnicode');

  const dir = mkdtempSync(join(tmpdir(), 'plotpin-v6-'));
  const posPath = join(dir, 'with-tounicode.pdf'), negPath = join(dir, 'without-tounicode.pdf');
  writeFileSync(posPath, pdf);
  writeFileSync(negPath, neg);
  const extract = p => execFileSync('pdftotext', ['-enc', 'UTF-8', p, '-'], { encoding: 'utf8', maxBuffer: 32 << 20 });
  const posTxt = extract(posPath), negTxt = extract(negPath);

  /* 正向：中文文字、名称、面积/周长都必须真的被提取出来 */
  expect(posTxt).toContain('配电箱 A1');
  expect(posTxt).toContain('V6矩形');
  expect(posTxt).toContain('面积 50.00 ㎡');
  expect(posTxt).toContain('周长 30.00 m');

  /* 负向：没有 ToUnicode 就不能再提取出可读文字（允许空/控制字节） */
  expect(negTxt).not.toContain('配电箱');
  expect(negTxt).not.toContain('V6矩形');
  expect(negTxt.trim().length).toBeLessThan(posTxt.trim().length);
});

test('V-6b：清单页文字按行列可提取；删掉 /ToUnicode 后同样退化', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();

  /* 三条记录用唯一的名称与面积，便于逐行、逐列核对提取顺序 */
  await page.evaluate(() => {
    Date.prototype.toLocaleString = () => '2026-01-01 00:00';
    state.meta.name = 'V6L';
    state.objects.push(baseObject('rect', 'rect.area', { name: 'A1配电箱', x: 0, y: 0, width: 10, height: 5 }));
    state.objects.push(baseObject('rect', 'rect.area', { name: 'B2机柜', x: 20, y: 0, width: 20, height: 3 }));
    state.objects.push(baseObject('rect', 'rect.area', { name: 'C3桥架', x: 60, y: 0, width: 40, height: 2 }));
    commitChange('V-6b 清单页文字层');
  });

  const dl = page.waitForEvent('download');
  await page.selectOption('#exportKind', 'pdf-vector');
  await page.click('#exportBtn');
  await page.locator('#modalFooter button').last().click();
  const pdf = readFileSync(await (await dl).path());
  const src = pdf.toString('latin1');

  /* 结构判据（不依赖 poppler）：图纸页 842×595 + 清单页 1240×1748，清单页字体资源与文字流都在 */
  expect(src).toContain('/Subtype /Type3');
  expect([...src.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map(m => m[1] + 'x' + m[2]))
    .toEqual(['842x595', '1240x1748']);
  expect(src).toContain('3 Tr');

  if (!needs('pdftotext')) {
    test.skip(true, '未安装 pdftotext（poppler）：清单页提取对比需在装 poppler 的机器上复跑');
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), 'plotpin-v6b-'));
  const posPath = join(dir, 'list-tounicode.pdf'), negPath = join(dir, 'list-no-tounicode.pdf');
  const neg = Buffer.from(src.replace(/\/ToUnicode \d+ 0 R/g, m => ' '.repeat(m.length)), 'latin1');
  writeFileSync(posPath, pdf);
  writeFileSync(negPath, neg);
  const page2 = (p, layout) => execFileSync('pdftotext',
    ['-f', '2', '-l', '2', ...(layout ? ['-layout'] : []), '-enc', 'UTF-8', p, '-'],
    { encoding: 'utf8', maxBuffer: 32 << 20 });

  const posTxt = page2(posPath);
  /* 原样打印，便于人工核对空格/列距与提取顺序；断言不依赖这段输出 */
  console.log('[V-6b] 清单页提取原文 >>>\n' + posTxt + '<<<');

  /* 默认模式判据：pdftotext 不按表格还原，而是「每个单元格一行、行优先、列内左到右」。
     这里断言完整行序列（不是包含关键字）：标题、副标题、10 个表头、3×8 个非空单元格，
     任何换序、漏项、多项、串行都会在这里红。空单元格（编号/长度）不产生行，故每行 8 格。 */
  const nonEmpty = s => s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const expectRow = (name, x, area) => [name, '矩形/区域', '普通区域', '默认图层', x, '0.00', '矩形', area];
  expect(nonEmpty(posTxt)).toEqual([
    'V6L — 对象清单',
    '共 3 个对象 · 第 2 / 2 页 · 2026-01-01 00:00',
    '编号', '名称', '对象类型', '业务类型', '图层', 'X', 'Y', '参数', '长度', '面积',
    ...expectRow('A1配电箱', '0.00', '50.00'),
    ...expectRow('B2机柜', '20.00', '60.00'),
    ...expectRow('C3桥架', '60.00', '80.00')
  ]);

  /* -layout 模式判据：同一行的单元格必须落到同一行、列不串位（默认模式把每格切行，
     这里补上「表格行结构」的证明：名称在左、面积在右，且三行的列位置一致）。 */
  const layLines = nonEmpty(page2(posPath, true));
  const head = layLines.find(l => l.includes('编号') && l.includes('面积'));
  expect(head).toBeTruthy();
  const colIdx = ['编号', '名称', '对象类型', '业务类型', '图层', 'X', 'Y', '参数', '长度', '面积'].map(k => head.indexOf(k));
  expect(colIdx.every(i => i >= 0)).toBe(true);
  expect(colIdx).toEqual([...colIdx].sort((a, b) => a - b));

  const rowAt = (name, area) => {
    const hits = layLines.filter(l => l.includes(name));
    expect(hits.length).toBe(1);
    const line = hits[0];
    /* 名称与面积必须在同一行，且名称在左侧、面积在右侧 */
    expect(line).toContain(area);
    expect(line.indexOf(name)).toBeLessThan(line.lastIndexOf(area));
    /* 同一行不得串入其他记录的名称 */
    for (const other of ['A1配电箱', 'B2机柜', 'C3桥架']) if (other !== name) expect(line).not.toContain(other);
    return line;
  };
  const r1 = rowAt('A1配电箱', '50.00'), r2 = rowAt('B2机柜', '60.00'), r3 = rowAt('C3桥架', '80.00');
  expect(layLines.indexOf(r2)).toBe(layLines.indexOf(r1) + 1);
  expect(layLines.indexOf(r3)).toBe(layLines.indexOf(r2) + 1);
  /* 列对齐：三行里「默认图层」所在的字符偏移一致（列宽固定，未因内容长度漂移） */
  const colA = [r1, r2, r3].map(l => l.indexOf('默认图层'));
  expect(colA.every(i => i >= 0)).toBe(true);
  expect(colA[1]).toBe(colA[0]);
  expect(colA[2]).toBe(colA[0]);

  /* 负向：抹掉 /ToUnicode 后清单页同样不可提取（默认与 -layout 两种模式都退化） */
  const negTxt = page2(negPath), negLay = page2(negPath, true);
  expect(negTxt).not.toContain('A1配电箱');
  expect(negTxt).not.toContain('编号');
  expect(negTxt).not.toContain('对象清单');
  expect(negLay).not.toContain('A1配电箱');
  expect(negTxt.trim().length).toBeLessThan(posTxt.trim().length);
});
