/** 左侧工具栏按组折叠：先展开工具所在组，再点击组内按钮。
 *  组按钮本身只激活当前工具；组内全部工具在弹出面板里。 */
export async function clickTool(page, tool) {
  await page.evaluate(t => openGroupFor(t), tool);
  await page.locator(`.tool-btn[data-tool="${tool}"]`).click();
}
export async function tapTool(page, tool) {
  await page.evaluate(t => openGroupFor(t), tool);
  await page.locator(`.tool-btn[data-tool="${tool}"]`).tap();
}
