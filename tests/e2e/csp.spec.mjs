/* A-14 CSP 真实阻断：4 条注入路径 + 直接内联执行 */
import { test, expect } from '@playwright/test';
import { DB, idb } from './helpers.mjs';

const PAYLOAD = '"><img src=x onerror="window.__pwned=1">';
const now = '2026-01-01T00:00:00.000Z';

function evilProject() {
  return {
    schema: 'offline-drawing-annotation/v2',
    meta: { name: 'CSP PoC 工程', createdAt: now, updatedAt: now },
    settings: {}, viewport: { zoom: 1, panX: 0, panY: 0 },
    background: { kind: 'empty' }, site: null, objects: [], layers: [],
    objectTypes: [{
      id: 'type.evil', kind: 'point', name: PAYLOAD, color: '#ff0000', icon: PAYLOAD
    }],
    floors: [{ id: 'floor.default', name: '1F', updatedAt: now }],
    activeFloorId: 'floor.default', tombstones: []
  };
}

async function openApp(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
  await page.evaluate(() => { window.__pwned = undefined; });
}

async function openLayersTab(page) {
  await page.click('#tabBtn-layers');
  await page.waitForTimeout(120); /* 给潜在 onerror 触发窗口 */
}

/* 导入/插件路径会按约定截断类型名到 30 字符；渲染侧不截断 */
const STORED_NAME = PAYLOAD.slice(0, 30);

async function assertNoExecution(page, typeId, expectedName = STORED_NAME) {
  const dom = await page.evaluate(id => {
    const t = state.objectTypes.find(x => x.id === id);
    const list = document.getElementById('typeList');
    return {
      pwned: typeof window.__pwned !== 'undefined',
      imgCount: list.querySelectorAll('img').length,
      text: list.textContent,
      icon: t && t.icon,
      name: t && t.name
    };
  }, typeId);
  expect(dom.pwned).toBe(false);
  expect(dom.imgCount).toBe(0);
  expect(dom.name).toBe(expectedName);
  expect(dom.text).toContain(expectedName);
  return dom;
}

test('注入路径 1/4：导入 JSON 的恶意 type.name/icon 不执行', async ({ page }) => {
  await openApp(page);
  await page.setInputFiles('#fileInput', {
    name: 'csp-import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(evilProject()))
  });
  await expect.poll(() => page.evaluate(() => state.objectTypes.some(t => t.id === 'type.evil'))).toBe(true);
  await openLayersTab(page);
  const dom = await assertNoExecution(page, 'type.evil');
  expect(dom.icon).toBe('custom'); /* 白名单：未知 icon 回退到 point 默认 */
});

test('注入路径 2/4：旧存档（v1 current）恶意 icon 迁移后不执行', async ({ page }) => {
  await openApp(page);
  const legacy = { ...evilProject(), schema: 'offline-drawing-annotation/v1' };
  delete legacy.site; /* v1 旧档没有独立 site 槽 */
  await idb(page, { store: DB.projects, mode: 'readwrite', op: 'put', key: 'current', value: legacy });
  await page.reload();
  await expect.poll(() => page.evaluate(() => state.objectTypes.some(t => t.id === 'type.evil'))).toBe(true);
  await page.evaluate(() => { window.__pwned = undefined; });
  await openLayersTab(page);
  const dom = await assertNoExecution(page, 'type.evil');
  expect(dom.icon).toBe('custom');
});

test('注入路径 3/4：PlotPin.registerObjectType 恶意 icon 不执行', async ({ page }) => {
  await openApp(page);
  const registered = await page.evaluate(payload => {
    window.__pwned = undefined;
    return window.PlotPin.registerObjectType({
      id: 'type.plugin_evil', kind: 'point', name: payload, color: '#123456', icon: payload
    });
  }, PAYLOAD);
  expect(registered).toBe(true);
  await openLayersTab(page);
  const dom = await assertNoExecution(page, 'type.plugin_evil');
  expect(dom.icon).toBe('custom');
});

test('注入路径 4/4：类型列表渲染对未清洗数据全量转义', async ({ page }) => {
  await openApp(page);
  await page.evaluate(payload => {
    window.__pwned = undefined;
    state.objectTypes.push({ id: 'type.render_evil', kind: 'point', name: payload, color: '#ff0000', icon: payload, builtin: false });
    renderTypes();
  }, PAYLOAD);
  await openLayersTab(page);
  const dom = await assertNoExecution(page, 'type.render_evil', PAYLOAD);
});

test('CSP 兜底：内联 <script> 与 onerror/onclick 属性均被拒绝执行', async ({ page }) => {
  await openApp(page);
  const violations = [];
  /* 文案因内核而异：Chromium 用「Content Security Policy / Refused to」，
     Firefox 用连字符版「Content-Security-Policy: The page’s settings blocked…」 */
  page.on('console', m => { if (/Content[- ]Security[- ]Policy|Refused to/i.test(m.text())) violations.push(m.text()); });

  const result = await page.evaluate(async () => {
    window.__pwned_inline = undefined;
    window.__pwned_click = undefined;
    const s = document.createElement('script');
    s.textContent = 'window.__pwned_inline = 1';
    document.body.appendChild(s);
    const d = document.createElement('div');
    d.setAttribute('onclick', 'window.__pwned_click = 1');
    document.body.appendChild(d);
    d.click();
    const img = document.createElement('img');
    img.setAttribute('src', 'x');
    img.setAttribute('onerror', 'window.__pwned_error = 1');
    document.body.appendChild(img);
    await new Promise(r => setTimeout(r, 150));
    return {
      inline: typeof window.__pwned_inline !== 'undefined',
      click: typeof window.__pwned_click !== 'undefined',
      error: typeof window.__pwned_error !== 'undefined'
    };
  });
  expect(result).toEqual({ inline: false, click: false, error: false });
  expect(violations.length).toBeGreaterThan(0);
});
