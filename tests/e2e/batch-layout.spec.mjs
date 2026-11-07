/* 清单页批次输入布局：数值框可读宽度、触控 44px、桌面/移动与中英文不溢出 */
import { test, expect } from '@playwright/test';

async function openReady(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  await page.waitForFunction(() => typeof bgLoadSeq === 'number' && bgLoadSeq > 0);
  return errors;
}

async function switchLang(page, lang) {
  await page.locator('#settingsBtn').click();
  await page.locator('#setLang').selectOption(lang);
  await page.locator('#modalFooter button.primary').click();
  await page.waitForFunction(() => !document.getElementById('modalBackdrop').classList.contains('show'));
}

async function measure(page) {
  return page.evaluate(() => {
    const row = document.querySelector('.batch-row');
    const sb = document.querySelector('.sidebar').getBoundingClientRect();
    const inputs = ['batchDx', 'batchDy', 'batchAngle'].map(id => {
      const el = document.getElementById(id);
      const r = el.getBoundingClientRect();
      return { id, w: r.width, h: r.height, left: r.left, right: r.right, scroll: el.scrollWidth, client: el.clientWidth };
    });
    const rr = row.getBoundingClientRect();
    const btns = ['batchShowAnnotBtn', 'batchHideAnnotBtn'].map(id => {
      const el = document.getElementById(id);
      const r = el.getBoundingClientRect();
      return { id, w: r.width, h: r.height, left: r.left, right: r.right, scroll: el.scrollWidth, client: el.clientWidth, text: el.textContent.trim() };
    });
    return { inputs, btns, row: { scroll: row.scrollWidth, client: row.clientWidth, left: rr.left, right: rr.right }, sidebar: { left: sb.left, right: sb.right } };
  });
}

test.describe('1280×800 桌面', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('数值框 ≥92px、控件不溢出侧栏；英文界面不截断', async ({ page }) => {
    const errors = await openReady(page);
    await page.locator('#tabBtn-list').click();
    await page.locator('#batchAngle').fill('-359.9');

    const zh = await measure(page);
    for (const i of zh.inputs) {
      expect(i.w).toBeGreaterThanOrEqual(92);
      expect(i.right).toBeLessThanOrEqual(zh.sidebar.right + 1);
      expect(i.left).toBeGreaterThanOrEqual(zh.sidebar.left - 1);
      expect(i.scroll).toBeLessThanOrEqual(i.client + 1);
    }
    expect(await page.locator('#batchAngle').inputValue()).toBe('-359.9');
    expect(zh.row.scroll).toBeLessThanOrEqual(zh.row.client + 1);
    expect(zh.btns.map(b => b.text)).toEqual(['显示标注', '隐藏标注']);

    await switchLang(page, 'en');
    const en = await measure(page);
    expect(en.btns.map(b => b.text)).toEqual(['Show labels', 'Hide labels']);
    for (const b of en.btns) {
      expect(b.scroll).toBeLessThanOrEqual(b.client + 1);
      expect(b.right).toBeLessThanOrEqual(en.sidebar.right + 1);
    }
    for (const i of en.inputs) {
      expect(i.w).toBeGreaterThanOrEqual(92);
      expect(i.scroll).toBeLessThanOrEqual(i.client + 1);
    }
    expect(en.row.scroll).toBeLessThanOrEqual(en.row.client + 1);
    expect(errors).toEqual([]);
  });
});

test.describe('390×844 移动触控', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('控件 ≥44px、数值框 ≥92px、无横向溢出；英文界面不截断', async ({ page }) => {
    const errors = await openReady(page);
    await switchLang(page, 'en');
    await page.locator('#sidebarToggle').click();
    await page.locator('#tabBtn-list').click();
    await page.locator('#batchAngle').fill('-359.9');

    const m = await measure(page);
    for (const i of m.inputs) {
      expect(i.w).toBeGreaterThanOrEqual(92);
      expect(i.h).toBeGreaterThanOrEqual(44);
      expect(i.right).toBeLessThanOrEqual(m.sidebar.right + 1);
      expect(i.scroll).toBeLessThanOrEqual(i.client + 1);
    }
    for (const b of m.btns) {
      expect(b.h).toBeGreaterThanOrEqual(44);
      expect(b.scroll).toBeLessThanOrEqual(b.client + 1);
      expect(b.right).toBeLessThanOrEqual(m.sidebar.right + 1);
    }
    expect(m.row.scroll).toBeLessThanOrEqual(m.row.client + 1);
    expect(await page.locator('#batchAngle').inputValue()).toBe('-359.9');
    expect(errors).toEqual([]);
  });
});
