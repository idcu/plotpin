/* V-4b：dist 的 file:// 真实离线路径。
   与 http 入口的 e2e 不同，这里直接打开单文件发行版的绝对路径，
   用真实动作覆盖导入底图（图片 + PDF）、比例预设、新增点位与画几何、PDF/清单导出；
   同时如实记录 file:// 与 http 的能力差异（IndexedDB / 下载 / Service Worker / CSP）。
   本用例不依赖 scripts/serve.mjs，源码入口与 dist 入口的 e2e 跑法都会执行它。 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../../dist/plotpin-standalone.html', import.meta.url));
const FILE_URL = pathToFileURL(DIST).href;
const FIRST_RUN_KEY = 'plotpin:firstRunGuide:v1';

/* 64×48 浅色底图 + 深色边框，构建期固定，不依赖额外二进制夹具 */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAVklEQVR4nO3PQQ3AIAAAMeQgAiX4/+2DhMm4QJrUQMdc+2pjrn3OdymBmkBNoCZQE6gJ1ARqAjWBmkBNoCZQE6gJ1ARqAjWBmkBNoCZQE6gJ1F4JXO0H2MLCpr8dF+kAAAAASUVORK5CYII=',
  'base64');

/* 只含一行文本的最小 PDF（xref 偏移按实际字节计算），与 scale-preset 用例同构 */
function buildPdf(text) {
  const content = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(o => { pdf += String(o).padStart(10, '0') + ' 00000 n \n'; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

async function bootFile(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  /* file:// 下若 localStorage 可用，预置「已完成引导」；不可用则忽略（本用例不测引导） */
  await page.addInitScript(key => {
    try {
      localStorage.setItem(key, JSON.stringify({
        v: 1, status: 'completed', choice: 'blank', at: '2026-11-07T00:00:00.000Z'
      }));
    } catch (_) { /* file:// 禁用 localStorage 时由产品自身降级 */ }
  }, FIRST_RUN_KEY);
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof state === 'object' && typeof afterStateLoaded === 'function');
  await page.waitForTimeout(200);
  return errors;
}

test('file:// 探针：应用启动、CSP 内联哈希生效，存储/下载/SW 能力如实记录', async ({ page }) => {
  const errors = await bootFile(page);
  const probe = await page.evaluate(async () => {
    const cap = {
      protocol: location.protocol,
      secureContext: window.isSecureContext,
      cspHashes: 0,
      localStorage: false,
      indexedDB: 'unknown',
      swApi: typeof navigator.serviceWorker
    };
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    cap.cspHashes = ((meta && meta.content) || '').match(/'sha256-/g)?.length || 0;
    /* 产品自身的 file:// 能力判定（persistence.js#detectRuntimeCapabilities） */
    cap.appCaps = typeof detectRuntimeCapabilities === 'function'
      ? (() => {
        const c = detectRuntimeCapabilities();
        return { file: c.file, idb: c.idb, sw: c.sw, blob: c.blob, level: c.level, warnings: c.warnings };
      })()
      : null;

    try {
      localStorage.setItem('plotpin:file-probe', '1');
      cap.localStorage = localStorage.getItem('plotpin:file-probe') === '1';
      localStorage.removeItem('plotpin:file-probe');
    } catch (e) {
      cap.localStorageError = String((e && e.name) || e);
    }

    try {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('plotpin-file-probe', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('probe');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('open error'));
        req.onblocked = () => reject(new Error('blocked'));
      });
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction('probe', 'readwrite');
          tx.objectStore('probe').put(1, 'k');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error('tx error'));
          tx.onabort = () => reject(tx.error || new Error('tx abort'));
        });
        cap.indexedDB = 'readwrite-ok';
      } catch (e) {
        cap.indexedDB = 'open-ok/tx-fail';
        cap.idbError = String((e && e.name) || e);
      }
      db.close();
    } catch (e) {
      cap.indexedDB = 'open-fail';
      cap.idbError = String((e && e.name) || e);
    }

    /* 注入内联脚本：CSP 必须拦下，证明 file:// 下 hash 策略仍然生效。
       以 securitypolicyviolation 事件为准（跨浏览器稳定），控制台文案仅作参考。 */
    cap.cspViolations = [];
    document.addEventListener('securitypolicyviolation',
      e => cap.cspViolations.push(e.violatedDirective || e.effectiveDirective || 'unknown'));
    window.__file_probe_inline = undefined;
    const s = document.createElement('script');
    s.textContent = 'window.__file_probe_inline = 1';
    document.body.appendChild(s);
    await new Promise(r => setTimeout(r, 120));
    cap.inlineBlocked = typeof window.__file_probe_inline === 'undefined';
    return cap;
  });
  console.log('[file:// 探针] ' + JSON.stringify(probe));

  expect(probe.protocol).toBe('file:');
  expect(probe.cspHashes).toBe(1);
  expect(probe.inlineBlocked).toBe(true);
  expect(probe.cspViolations.length).toBeGreaterThanOrEqual(1);
  /* 注入脚本被拦会产生预期的 CSP 违规日志；除它之外不允许任何控制台错误。
     兼容 Chromium 与 Firefox 的两种文案（后者为连字符版 Content-Security-Policy）。 */
  const cspNoise = /Executing inline script violates|Refused to execute inline script|Content[- ]Security[- ]Policy/i;
  expect(errors.filter(e => !cspNoise.test(e))).toEqual([]);
});

test('file:// 真实链路：导入图片底图 → 比例预设 → 新增点位 → 画区域 → 导出 PDF', async ({ page }) => {
  const errors = await bootFile(page);

  await page.setInputFiles('#bgInput', { name: 'plan.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect.poll(() => page.evaluate(() => state.background && state.background.kind)).toBe('image');

  await page.click('#bgBtn');
  await page.selectOption('#presetScale', '100');
  await page.selectOption('#presetDpi', '300');
  await page.click('#presetApply');
  await page.locator('#modalFooter button', { hasText: '确定' }).click();

  const bg = await page.evaluate(() => ({
    mpp: state.background.metersPerPixel,
    calibrated: state.background.calibrated,
    width: state.background.width,
    height: state.background.height
  }));
  expect(bg.calibrated).toBe(true);
  expect(bg.mpp).toBeCloseTo(100 * 0.0254 / 300, 12);
  expect(bg.width).toBe(64);
  expect(bg.height).toBe(48);

  const box = await page.locator('#canvas').boundingBox();
  await page.locator('.tool-btn[data-tool="point"]').click();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => page.evaluate(() => state.objects.filter(o => o.kind === 'point').length)).toBe(1);

  /* 区域是「两次点击」画法（首点定起点，次点定对角并落盘），不是拖拽；
     新增点位后属性面板会重排布局，坐标必须重新量 */
  await page.locator('.tool-btn[data-tool="rect"]').click();
  const box2 = await page.locator('#canvas').boundingBox();
  await page.mouse.click(box2.x + box2.width * 0.35, box2.y + box2.height * 0.35);
  await page.mouse.click(box2.x + box2.width * 0.65, box2.y + box2.height * 0.65);
  await expect.poll(() => page.evaluate(() => state.objects.filter(o => o.kind === 'rect').length)).toBe(1);

  const dlPromise = page.waitForEvent('download');
  await page.selectOption('#exportKind', 'pdf');
  await page.click('#exportBtn');
  const dl = await dlPromise;
  const pdf = readFileSync(await dl.path());
  console.log('[file:// 导出] PDF ' + dl.suggestedFilename() + ' ' + pdf.length + ' B');
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(10000);

  expect(errors).toEqual([]);
});

test('file:// 导入 PDF 底图并导出 CSV 清单', async ({ page }) => {
  const errors = await bootFile(page);

  await page.setInputFiles('#fileInput', {
    name: 'plan.pdf', mimeType: 'application/pdf', buffer: buildPdf('PLOTPIN FILE OFFLINE 1:100')
  });
  await expect.poll(() => page.evaluate(() => state.objects.filter(o => o.kind === 'text').length)).toBeGreaterThan(0);

  const dlPromise = page.waitForEvent('download');
  await page.selectOption('#exportKind', 'csv');
  await page.click('#exportBtn');
  const dl = await dlPromise;
  const csv = readFileSync(await dl.path(), 'utf8');
  console.log('[file:// 导出] CSV ' + dl.suggestedFilename() + ' ' + Buffer.byteLength(csv) + ' B');
  expect(csv).toContain('编号');
  expect(csv).toContain('PLOTPIN FILE OFFLINE');

  expect(errors).toEqual([]);
});
