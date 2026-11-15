// 跨应用操作统一走指纹与桌面入口；scope 也可限定为随卡手机宿主。
export async function openApp(scope, label) {
  await scope.locator('.phone-shell').waitFor({ state: 'visible' });
  const unlock = scope.getByRole('button', { name: '进入桌面', exact: true });
  if (await unlock.isVisible()) await unlock.click();
  const desktop = scope.locator('.view-desktop');
  if (!await desktop.isVisible()) await scope.locator('.system-nav').getByRole('button', { name: '主页', exact: true }).click();
  if (!await desktop.isVisible()) {
    await scope.locator('.system-nav').getByRole('button', { name: '返回', exact: true }).click();
    await scope.locator('.system-nav').getByRole('button', { name: '返回', exact: true }).click();
  }
  if (await desktop.locator('[data-desktop-target]').count()) await desktop.getByRole('button', { name: label === '查手机' ? '第2屏' : '第1屏', exact: true }).click();
  await desktop.getByRole('button', { name: label, exact: true }).click();
}
