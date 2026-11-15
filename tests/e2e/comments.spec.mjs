import { test, expect } from '@playwright/test';

/* 本地批注（comments.js）：独立 localStorage，不进工程 JSON、不同步协作。
   UI 路径此前只有 selftest 覆盖，这里补真实交互：新增/编辑/删除/只读/锚点失效。 */

async function open(page) {
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => typeof state)).toBe('object');
  await page.evaluate(() => { try { closeModal(); } catch (e) {} });
}

async function drawAndSelectPoint(page) {
  const box = await page.locator('#canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.locator('.tool-btn[data-tool="point"]').click();
  await page.mouse.click(cx, cy);
  await page.locator('.tool-btn[data-tool="select"]').click();
  await page.mouse.click(cx, cy);
  await expect.poll(() => page.evaluate(() => selectedIds.size)).toBe(1);
}

async function addComment(page, text) {
  await page.locator('.side-tab[data-tab="comments"]').click();
  await page.fill('#commentText', text);
  await page.click('#addCommentBtn');
  await expect(page.locator('#commentList [data-ci]')).toHaveCount(1);
}

const storageOf = page => page.evaluate(() => {
  const k = 'plotpin.comments.v1.' + (state.meta.projectId || state.meta.id);
  return JSON.parse(localStorage.getItem(k) || 'null');
});

test('批注：新增后即时渲染，并写入独立本地键（不进工程 JSON）', async ({ page }) => {
  await open(page);
  await drawAndSelectPoint(page);
  const oid = await page.evaluate(() => Array.from(selectedIds)[0]);
  await addComment(page, '现场复核：标高有误');

  await expect(page.locator('#commentList')).toContainText('现场复核：标高有误');
  const st = await storageOf(page);
  expect(st.v).toBe(1);
  expect(st.comments).toHaveLength(1);
  expect(st.comments[0].objectId).toBe(oid);
  /* 工程 JSON 里不得出现批注正文 */
  expect(await page.evaluate(() => JSON.stringify(persistableState()).includes('现场复核'))).toBe(false);
});

test('批注：编辑走统一模态，Esc 取消不改，确认后更新', async ({ page }) => {
  await open(page);
  await drawAndSelectPoint(page);
  await addComment(page, '原始内容');

  await page.locator('#commentList [data-ca="e"]').click();
  await expect(page.locator('#promptInput')).toBeVisible();
  expect(await page.inputValue('#promptInput')).toBe('原始内容');
  await page.keyboard.press('Escape');
  await expect(page.locator('#modalBackdrop')).not.toHaveClass(/show/);
  await expect(page.locator('#commentList')).toContainText('原始内容');

  await page.locator('#commentList [data-ca="e"]').click();
  await page.fill('#promptInput', '改后内容');
  await page.locator('#modalFooter button.primary').click();
  await expect(page.locator('#commentList')).toContainText('改后内容');
  await expect(page.locator('#commentList')).not.toContainText('原始内容');
  expect((await storageOf(page)).comments[0].text).toBe('改后内容');
});

test('批注：删除需确认，取消保留、确认后清空', async ({ page }) => {
  await open(page);
  await drawAndSelectPoint(page);
  await addComment(page, '待删除');

  await page.locator('#commentList [data-ca="d"]').click();
  await page.locator('#modalFooter button', { hasText: '取消' }).click();
  await expect(page.locator('#commentList [data-ci]')).toHaveCount(1);

  await page.locator('#commentList [data-ca="d"]').click();
  await page.locator('#modalFooter button.primary').click();
  await expect(page.locator('#commentList [data-ci]')).toHaveCount(0);
  await expect(page.locator('#commentList')).toContainText('暂无评论');
  expect((await storageOf(page)).comments).toHaveLength(0);
});

test('批注：本地只读时禁用输入与操作按钮，退出后恢复', async ({ page }) => {
  await open(page);
  await drawAndSelectPoint(page);
  await addComment(page, '只读校验');

  await page.click('#readOnlyBtn');
  await expect(page.locator('#commentsReadOnly')).toBeVisible();
  await expect(page.locator('#commentText')).toBeDisabled();
  await expect(page.locator('#addCommentBtn')).toBeDisabled();
  await expect(page.locator('#commentList [data-ca="e"]')).toBeDisabled();
  await expect(page.locator('#commentList [data-ca="d"]')).toBeDisabled();

  await page.click('#readOnlyBtn');
  await expect(page.locator('#commentsReadOnly')).toBeHidden();
  await expect(page.locator('#commentText')).toBeEnabled();
  await expect(page.locator('#commentList [data-ca="e"]')).toBeEnabled();
});

test('批注：锚定对象删除后评论保留并标注「对象已删除」', async ({ page }) => {
  await open(page);
  await drawAndSelectPoint(page);
  await addComment(page, '锚点会消失');

  await page.locator('.tool-btn[data-tool="select"]').click();
  const box = await page.locator('#canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => page.evaluate(() => selectedIds.size)).toBe(1);
  await page.keyboard.press('Delete');
  await expect(page.locator('#modalFooter button.primary')).toBeVisible();
  await page.locator('#modalFooter button.primary').click();
  await expect.poll(() => page.evaluate(() => state.objects.length)).toBe(0);

  await page.locator('.side-tab[data-tab="comments"]').click();
  await expect(page.locator('#commentList [data-ci]')).toHaveCount(1);
  await expect(page.locator('#commentList')).toContainText('对象已删除');
  expect((await storageOf(page)).comments).toHaveLength(1);
});
