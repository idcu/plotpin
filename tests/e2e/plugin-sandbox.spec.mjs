/* C-01 插件沙箱：版本协商 / 能力白名单 / 恶意用例隔离 / 示例插件 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function openApp(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
}

function loadPlugin(page, spec) {
  return page.evaluate(s => window.PlotPin.loadPlugin(s), spec);
}

function pluginRecord(page, id) {
  return page.evaluate(id => {
    const p = window.PlotPin.listPlugins().find(x => x.id === id);
    return p || null;
  }, id);
}

async function waitDisabled(page, id) {
  await expect.poll(async () => {
    const p = await pluginRecord(page, id);
    return p && p.status;
  }).toBe('disabled');
  return pluginRecord(page, id);
}

async function drawPoint(page) {
  await page.locator('.tool-btn[data-tool="point"]').click();
  const box = await page.locator('#canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBeGreaterThan(0);
}

test('版本协商：不兼容主版本 / 缺失 apiVersion 均给出原因且不创建 Worker', async ({ page }) => {
  await openApp(page);
  const bad = await loadPlugin(page, {
    id: 'legacy.demo',
    apiVersion: '2.0',
    capabilities: ['export'],
    code: 'PlotPin.registerExporter({id:"x",label:"x",run:function(){}});'
  });
  expect(bad.ok).toBe(false);
  expect(bad.reason).toMatch(/主版本/);

  const missing = await loadPlugin(page, {
    id: 'legacy.missing',
    capabilities: ['export'],
    code: 'PlotPin.toast("should not run");'
  });
  expect(missing.ok).toBe(false);
  expect(missing.reason).toMatch(/apiVersion/);

  expect(await page.evaluate(() => window.PlotPin.listPlugins().length)).toBe(0);
  expect(await page.evaluate(() => typeof state)).toBe('object');
});

test('能力白名单：未声明 types 时注册类型被拒绝、插件禁用并显示原因', async ({ page }) => {
  await openApp(page);
  const r = await loadPlugin(page, {
    id: 'cap.denied',
    apiVersion: '1.0',
    capabilities: ['export'],
    code: 'PlotPin.registerObjectType({id:"type.cap",kind:"point",name:"CAP",icon:"circle"});'
  });
  expect(r.ok).toBe(false);
  expect(r.reason).toMatch(/types/);

  const rec = await waitDisabled(page, 'cap.denied');
  expect(rec.reason).toMatch(/能力未声明|types/);
  await expect.poll(() => page.locator('#toastWrap').innerText()).toContain('插件已禁用');
  expect(await page.evaluate(() => state.objectTypes.some(t => t.id === 'type.cap'))).toBe(false);
  await drawPoint(page);
});

test('恶意 parent.document：访问被隔离，主工程仍可绘制', async ({ page }) => {
  await openApp(page);
  const r = await loadPlugin(page, {
    id: 'evil.parent',
    apiVersion: '1.0',
    capabilities: [],
    code: 'parent.document.body.dataset.pwned="1"; PlotPin.toast("leak");'
  });
  expect(r.ok).toBe(false);
  expect(r.reason).toMatch(/parent/);
  const rec = await waitDisabled(page, 'evil.parent');
  expect(rec.reason).toMatch(/parent/);
  expect(await page.evaluate(() => typeof window.__pwned)).toBe('undefined');
  expect(await page.evaluate(() => document.body.dataset.pwned)).toBeUndefined();
  await drawPoint(page);
});

test('恶意 fetch：网络被阻断，无新增请求', async ({ page }) => {
  await openApp(page);
  let probes = 0;
  page.on('request', req => { if (req.url().includes('/plugin-net-probe')) probes++; });
  const r = await loadPlugin(page, {
    id: 'evil.net',
    apiVersion: '1.0',
    capabilities: [],
    code: 'fetch("/plugin-net-probe").then(function () { PlotPin.toast("net ok"); }, function () {});'
  });
  expect(r.ok).toBe(false);
  expect(r.reason).toMatch(/fetch/);
  await waitDisabled(page, 'evil.net');
  await page.waitForTimeout(300);
  expect(probes).toBe(0);
  await drawPoint(page);
});

test('恶意 indexedDB：存储访问被阻断，工程数据不受影响', async ({ page }) => {
  await openApp(page);
  const before = await page.evaluate(() => state.schema);
  const r = await loadPlugin(page, {
    id: 'evil.idb',
    apiVersion: '1.0',
    capabilities: [],
    code: 'indexedDB.open("offline_drawing_annotation");'
  });
  expect(r.ok).toBe(false);
  expect(r.reason).toMatch(/indexedDB|reading 'open'/);
  const rec = await waitDisabled(page, 'evil.idb');
  expect(rec.reason).toMatch(/indexedDB|reading 'open'/);
  expect(await page.evaluate(() => state.schema)).toBe(before);
  expect(await page.evaluate(() => typeof indexedDB)).toBe('object'); /* 主工程自己的 IDB 仍可用 */
  await drawPoint(page);
});

test('无限循环（加载期）：≤2s 超时终止，主线程不被拖死', async ({ page }) => {
  await openApp(page);
  const t0 = Date.now();
  const r = await loadPlugin(page, {
    id: 'evil.loop',
    apiVersion: '1.0',
    capabilities: [],
    code: 'while (true) {}'
  });
  const elapsed = Date.now() - t0;
  expect(elapsed).toBeLessThan(2500);
  expect(r.ok).toBe(false);
  expect(r.reason).toMatch(/超时/);
  const rec = await waitDisabled(page, 'evil.loop');
  expect(rec.reason).toMatch(/超时/);
  await drawPoint(page);
});

test('导出器抛异常：主工程不回退，插件禁用并带上异常原因', async ({ page }) => {
  await openApp(page);
  const r = await loadPlugin(page, {
    id: 'evil.throw',
    apiVersion: '1.0',
    capabilities: ['export'],
    code: 'PlotPin.registerExporter({id:"boom",label:"Boom",ext:".txt",run:function(){throw new Error("boom-run");}});'
  });
  expect(r.ok).toBe(true);
  expect((await pluginRecord(page, 'evil.throw')).status).toBe('active');
  const t0 = Date.now();
  const result = await page.evaluate(() => window.exportViaPlugin('boom'));
  expect(Date.now() - t0).toBeLessThan(2500);
  expect(result.ok).toBe(false);
  const rec = await waitDisabled(page, 'evil.throw');
  expect(rec.reason).toMatch(/boom-run/);
  await drawPoint(page);
});

test('原型污染：Worker 域内改原型不影响主工程', async ({ page }) => {
  await openApp(page);
  const r = await loadPlugin(page, {
    id: 'evil.proto',
    apiVersion: '1.0',
    capabilities: ['types', 'state:write'],
    code: [
      'Object.prototype.polluted = "yes";',
      'Array.prototype.polluted = "yes";',
      'PlotPin.registerObjectType({id:"type.proto",kind:"point",name:"PROTO",icon:"circle",__proto__:{polluted:"yes"}});',
      'PlotPin.addObjects([{kind:"point",x:1,y:1,__proto__:{polluted:"yes"}}]);'
    ].join('\n')
  });
  expect(r.ok).toBe(true);
  const clean = await page.evaluate(() => ({
    obj: typeof ({}).polluted,
    arr: typeof [].polluted,
    own: typeof Object.prototype.polluted
  }));
  expect(clean).toEqual({ obj: 'undefined', arr: 'undefined', own: 'undefined' });
  expect(await page.evaluate(() => Array.isArray(state.objects))).toBe(true);
  await page.evaluate(() => window.PlotPin.unloadPlugin('evil.proto'));
  expect(await page.evaluate(() => window.PlotPin.listPlugins().length)).toBe(0);
});

test('图标仍走 A-02 白名单：sandbox 类型需 icons 能力，恶意 icon/name 被清洗与转义', async ({ page }) => {
  await openApp(page);
  const payload = '"><img src=x onerror="window.__pwned=1">';

  const denied = await loadPlugin(page, {
    id: 'icon.denied',
    apiVersion: '1.0',
    capabilities: ['types'],
    code: 'PlotPin.registerObjectType({id:"type.noicon",kind:"point",name:"NOICON",symbol:[{d:"M0 0L10 10Z"}]});'
  });
  expect(denied.ok).toBe(false);
  expect(denied.reason).toMatch(/icons/);
  await waitDisabled(page, 'icon.denied');

  const ok = await loadPlugin(page, {
    id: 'icon.allowed',
    apiVersion: '1.0',
    capabilities: ['types', 'icons'],
    code: 'PlotPin.registerObjectType(' + JSON.stringify({
      id: 'type.sandbox', kind: 'point', name: payload, color: '#ff0000', icon: payload,
      symbol: [{ d: 'M0 0L10 10Z', fill: false }]
    }) + ');'
  });
  expect(ok.ok).toBe(true);
  await page.click('#tabBtn-layers');
  await page.waitForTimeout(150);
  const dom = await page.evaluate(() => {
    const t = state.objectTypes.find(x => x.id === 'type.sandbox');
    const list = document.getElementById('typeList');
    return {
      pwned: typeof window.__pwned !== 'undefined',
      imgCount: list.querySelectorAll('img').length,
      text: list.textContent,
      icon: t && t.icon,
      name: t && t.name,
      symbolCount: t && Array.isArray(t.symbol) ? t.symbol.length : 0
    };
  });
  expect(dom.pwned).toBe(false);
  expect(dom.imgCount).toBe(0);
  expect(dom.icon).toBe('custom');
  expect(dom.text).toContain(payload.slice(0, 30));
  expect(dom.symbolCount).toBe(1);
  await page.evaluate(() => window.PlotPin.unloadPlugin('icon.allowed'));
});

test('示例插件：加载后可导出 Markdown，卸载后撤销注册', async ({ page }) => {
  await openApp(page);
  await page.addScriptTag({ url: '/plugins/sample-sandboxed.js' });
  await expect.poll(async () => (await pluginRecord(page, 'sandbox-markdown'))?.status).toBe('active');
  await drawPoint(page);
  await page.evaluate(() => { state.objects[0].name = 'P-01'; });

  await expect.poll(() => page.evaluate(() => window.PlotPin.listExporters().some(e => e.id === 'sandbox-markdown'))).toBe(true);
  const downloadPromise = page.waitForEvent('download');
  await page.selectOption('#exportKind', 'plugin:sandbox-markdown');
  await page.click('#exportBtn');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('sandbox-markdown.md');
  const text = readFileSync(await download.path(), 'utf8');
  expect(text.startsWith('# ')).toBe(true);
  expect(text).toContain('| P-01 |');

  await page.evaluate(() => window.PlotPin.unloadPlugin('sandbox-markdown'));
  expect(await page.evaluate(() => window.PlotPin.listPlugins().length)).toBe(0);
  expect(await page.evaluate(() => window.PlotPin.listExporters().some(e => e.id === 'sandbox-markdown'))).toBe(false);
  expect(await page.evaluate(() => Array.from(document.querySelectorAll('#exportKind option')).some(o => o.value === 'plugin:sandbox-markdown'))).toBe(false);
});
