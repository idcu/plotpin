import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* V-6：矢量 PDF 的不可见文字层验收。
   正向：真实导出后 pdftotext 必须提取出图上文字（含中文与空格）。
   负向：把同一 PDF 的 `/ToUnicode N 0 R` 等长抹成空格（xref 偏移不变），
        提取结果必须退化——证明可提取性来自 ToUnicode，而不是位图或巧合。
   说明：pdftotext 只证明「文字可被提取」，不证明查看器选中高亮/打印表现；
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
