/* B-03：DXF 版本审计 + SOLID/3DFACE/LEADER/ATTRIB 补充解析（浏览器链路） */
import { test, expect } from '@playwright/test';

function dxf(rows) {
  return rows.map(([c, v]) => String(c) + '\r\n' + String(v)).join('\r\n') + '\r\n';
}

function mixedDxf(ver = 'AC1032') {
  return dxf([
    [0,'SECTION'],[2,'HEADER'],[9,'$ACADVER'],[1,ver],[9,'$INSUNITS'],[70,4],[0,'ENDSEC'],
    [0,'SECTION'],[2,'ENTITIES'],
    [0,'LINE'],[8,'轴线'],[10,0],[20,0],[11,10000],[21,0],
    [0,'SOLID'],[8,'地面'],[10,0],[20,0],[11,10000],[21,0],[12,0],[22,10000],[13,10000],[23,10000],
    [0,'3DFACE'],[8,'墙体'],[10,20000],[20,0],[11,30000],[21,0],[12,30000],[22,10000],[13,20000],[23,10000],
    [0,'LEADER'],[8,'标注'],[10,0],[20,20000],[10,5000],[20,20000],[10,5000],[20,25000],
    [0,'TEXT'],[8,'文字'],[10,10000],[20,10000],[40,500],[1,'原始文字'],
    [0,'ATTRIB'],[8,'文字'],[10,20000],[20,20000],[40,500],[1,'门牌 A'],
    [0,'DIMENSION'],[8,'0'],[10,0],[20,0],
    [0,'ENDSEC'],[0,'EOF']
  ]);
}

test('B-03：AC1032 混合实体导入（版本与补充实体可见）', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();

  await page.setInputFiles('#fileInput', {
    name: 'mixed-ac1032.dxf', mimeType: 'application/dxf', buffer: Buffer.from(mixedDxf(), 'utf8')
  });
  /* B-02：先预检（版本/单位/保真度），确认后点「导入」才提交 */
  await expect(page.locator('#modalBackdrop')).toHaveClass(/show/);
  await expect(page.locator('#modalBody')).toContainText('AC1032');
  await expect(page.locator('#dxfUnitSelect')).toHaveValue('auto');
  await page.locator('#modalFooter button', { hasText: '导入' }).click();
  /* toast 只在数秒内可见：先断言审计信息，再等对象落地 */
  await expect(page.locator('#toastWrap')).toContainText(/版本：AC1032[\s\S]*补充解析/);
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(6);

  const result = await page.evaluate(() => ({
    kinds: state.objects.reduce((m, o) => { m[o.kind] = (m[o.kind] || 0) + 1; return m; }, {}),
    texts: state.objects.filter(o => o.kind === 'text').map(o => o.text).sort(),
    closedLines: state.objects.filter(o => o.kind === 'line' && o.closed).length,
    layers: state.layers.map(l => l.name).sort()
  }));
  expect(result.kinds).toEqual({ line: 4, text: 2 });
  expect(result.texts).toEqual(['原始文字', '门牌 A'].sort());
  expect(result.closedLines).toBe(2);   /* SOLID + 3DFACE 闭合，LINE/LEADER 开放 */
  expect(result.layers).toEqual(expect.arrayContaining(['地面', '墙体', '标注', '文字', '轴线']));
  expect(errors).toEqual([]);
});

test('B-03：二进制 DXF 给出明确指引而不是“不支持的文件类型”', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  await page.setInputFiles('#fileInput', {
    name: 'binary.dxf', mimeType: 'application/dxf',
    buffer: Buffer.from('AutoCAD Binary DXF\r\n\u0000\u0000rest', 'utf8')
  });
  await expect(page.locator('#toastWrap')).toContainText('二进制格式');
  expect(await page.evaluate(() => state.objects.length)).toBe(0);
});

test('B-02：预检可选单位与只读参考层，落点锁定且坐标按选择换算', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  await page.setInputFiles('#fileInput', {
    name: 'site-10000mm.dxf', mimeType: 'application/dxf', buffer: Buffer.from(dxf([
      [0,'SECTION'],[2,'HEADER'],[9,'$ACADVER'],[1,'AC1032'],[9,'$INSUNITS'],[70,4],[0,'ENDSEC'],
      [0,'SECTION'],[2,'ENTITIES'],
      [0,'LINE'],[8,'轴线'],[10,0],[20,0],[11,10000],[21,0],
      [0,'ENDSEC'],[0,'EOF']
    ]), 'utf8')
  });
  await expect(page.locator('#modalBackdrop')).toHaveClass(/show/);
  /* 用户改判“按米”并把落点改为只读参考层 */
  await page.selectOption('#dxfUnitSelect', '6');
  await page.selectOption('#dxfLanding', 'reference');
  await page.locator('#modalFooter button', { hasText: '导入' }).click();
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(1);

  const r = await page.evaluate(() => {
    const o = state.objects[0];
    const layer = state.layers.find(l => l.id === o.layerId);
    return { endX: o.points ? o.points[1][0] : o.x, layerName: layer && layer.name, locked: !!(layer && layer.locked) };
  });
  expect(r.endX).toBeCloseTo(10000, 0);          /* 文件声明毫米，按米解释 → ×1000 */
  expect(r.layerName).toContain('DXF参考');
  expect(r.locked).toBe(true);
  await expect(page.locator('#toastWrap')).toContainText('只读参考层');
});

test('B-02：DWG 入口识别版本并给出转换指引，不报“不支持的文件类型”', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  let acceptHint = '';
  await page.setInputFiles('#fileInput', {
    name: 'plan-2018.dwg', mimeType: 'application/acad',
    buffer: Buffer.from('AC1032\u0000\u0000\u0000\u0000rest-of-dwg', 'utf8')
  });
  await expect(page.locator('#modalBackdrop')).toHaveClass(/show/);
  await expect(page.locator('#modalBody')).toContainText('AC1032');
  await expect(page.locator('#modalBody')).toContainText('2018');
  await expect(page.locator('#modalBody')).toContainText('转 DXF');
  await expect(page.locator('#modalBody')).toContainText('转 PDF');
  await expect(page.locator('#toastWrap')).not.toContainText('不支持的文件类型');
  await page.locator('#modalFooter button', { hasText: '取消' }).click();
  acceptHint = await page.evaluate(() => $('fileInput').getAttribute('accept'));
  expect(acceptHint).toContain('.dwg');
  expect(await page.evaluate(() => state.objects.length)).toBe(0);
});
