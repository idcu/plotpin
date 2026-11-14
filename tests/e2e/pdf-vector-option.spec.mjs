import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/* V-3b1/V-3b2b：矢量 PDF 是显式选项；面板必须明示「文字为位图、不可选不可搜、放大会发虚」
   与当前 DPI 档位。默认 `pdf` 路径不动；矢量选项输出图纸页（底图位图 + 对象矢量 +
   文字/点位/标题栏位图）与清单页。 */

const sha = b => createHash('sha256').update(b).digest('hex');

test('V-3b1：矢量 PDF 选项明示文字口径与档位，默认路径字节不变', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();

  /* 固定时间戳，让两次导出的字节可比 */
  await page.evaluate(() => {
    Date.prototype.toLocaleString = () => '2026-01-01 00:00';
    state.meta.name = 'V3B1';
    state.objects.push(baseObject('point', 'point.marker', { name: 'P1', x: 10, y: 10 }));
    commitChange('V-3b1 默认路径');
  });

  /* 默认档：pdf 仍走整页位图，作为字节基准 */
  const dl0 = page.waitForEvent('download');
  await page.selectOption('#exportKind', 'pdf');
  await page.click('#exportBtn');
  const base = readFileSync(await (await dl0).path());

  /* 选项文案：与 P1-03 口径一致，明确「文字为位图」 */
  await expect(page.locator('#exportKind option[value="pdf-vector"]')).toHaveText(/矢量/);

  /* 面板：强制警示 + 默认 200 DPI 档位 + 本阶段范围说明 */
  await page.selectOption('#exportKind', 'pdf-vector');
  await page.click('#exportBtn');
  const modal = page.locator('#modalBody');
  await expect(modal).toContainText('文字为位图，不可选不可搜，放大会发虚');
  await expect(modal).toContainText('200 DPI（默认）');
  await expect(modal).toContainText('底图为位图、对象为矢量');
  await expect(modal).toContainText('含图纸页与清单页');

  /* 取消不产生下载 */
  await page.locator('#modalFooter button').first().click();
  await expect(page.locator('#modalBackdrop')).not.toHaveClass(/show/);

  /* 确认导出：矢量单页 PDF，与默认位图路径不同 */
  const dl1 = page.waitForEvent('download');
  await page.click('#exportBtn');
  await page.locator('#modalFooter button').last().click();
  const vec = readFileSync(await (await dl1).path());
  expect(vec.subarray(0, 5).toString()).toBe('%PDF-');
  expect(sha(vec)).not.toBe(sha(base));

  /* V-3b0：清单页逐页 MediaBox——图纸页 842×595、清单页 1240×1748；
     修复前列表页也被写成 842×595，1240×1748 的整页图被非等比拉伸。 */
  const pdfText = vec.toString('latin1');
  const boxes = [...pdfText.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map(m => m[1] + 'x' + m[2]);
  expect(boxes).toEqual(['842x595', '1240x1748']);
  /* 图片落位与 MediaBox 同尺寸 → 横纵缩放一致（清单页拉伸系数回到 1） */
  expect(pdfText).toContain('q 1240 0 0 1748 0 0 cm');

  /* 默认导出路径逐字节未变：同输入两次导出 sha 必须相同（时间戳已固定） */
  const dl2 = page.waitForEvent('download');
  await page.selectOption('#exportKind', 'pdf');
  await page.click('#exportBtn');
  const base2 = readFileSync(await (await dl2).path());
  expect(sha(base2)).toBe(sha(base));
});
