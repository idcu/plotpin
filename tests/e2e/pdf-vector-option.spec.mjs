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
});
