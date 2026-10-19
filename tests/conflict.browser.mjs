import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const output = '/tmp/mobile-plugin-reference-research/conflict-round';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
try {
  for (const host of ['native', 'luker']) for (const width of [320, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(5000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__font/*', route => {
      const name = basename(new URL(route.request().url()).pathname), path = '/tmp/mobile-plugin-reference-research/preview-fonts/' + name;
      return route.fulfill({ path: existsSync(path) ? path : '/tmp/myriad-home-design-20261016/' + name, contentType: 'font/woff2' });
    });
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${host}&clock=story`);
    await page.locator('.phone-shell').waitFor();
    await page.evaluate(() => {
      previewHarness.before = JSON.stringify(previewHarness.metadata);
      previewHarness.notices = [];
      globalThis.toastr = { warning: value => previewHarness.notices.push(value) };
      previewHarness.context.characters[0].data = { extensions: { twoMoreThings: { schemaVersion: 1, contacts: [], groups: [] } } };
      previewHarness.app.open();
    });
    assert.equal(await page.getByRole('alertdialog').count(), 0, '卡内标记不是实际双开');
    assert.equal(await page.evaluate(() => previewHarness.notices.length), 0, '不再叠加旧toast');
    await page.evaluate(async () => {
      const { initialize } = await import('/src/runtime.js');
      const { createHostAdapter } = await import('/src/host.js');
      previewHarness.card = initialize({ host: createHostAdapter({ mode: 'embedded', contextProvider: () => previewHarness.context }), documentRef: document, qqjBridgeProvider: () => null });
      previewHarness.card.open();
    });
    const card = page.locator('#pocket-phone-card-host'), local = page.locator('#pocket-phone-host');
    await card.getByRole('alertdialog', { name: '两份手机同时启用' }).waitFor();
    await card.getByText('当前打开：随卡版', { exact: true }).waitFor();
    await card.getByRole('button', { name: '暂时继续', exact: true }).click();
    await card.getByRole('button', { name: '关闭手机', exact: true }).click();
    await page.evaluate(() => previewHarness.app.open());
    const dialog = local.getByRole('alertdialog');
    await dialog.getByText('当前打开：插件版', { exact: true }).waitFor();
    await page.evaluate(css => {
      const face = document.createElement('style'); face.textContent = css; document.head.append(face);
      for (const element of document.querySelectorAll('.pocket-phone')) {
        const style = document.createElement('style'); style.textContent = ':host{font-family:PocketPreviewCJK,sans-serif}'; element.shadowRoot.append(style);
      }
    }, readFileSync('/tmp/mobile-plugin-reference-research/preview-fonts.css', 'utf8').replaceAll('Nowar Rounded TW Wc', 'PocketPreviewCJK'));
    await page.evaluate(async () => { await document.fonts.load('13px PocketPreviewCJK', '两份手机同时启用检测到插件版与随卡版可能重复生成和回流当前打开暂时继续关闭这份'); await document.fonts.ready; });
    await page.keyboard.press('Tab');
    assert.equal(await dialog.locator('button:focus').count(), 1, '焦点留在手机内弹层');
    const bounds = await dialog.boundingBox(), shell = await local.locator('.phone-shell').boundingBox();
    assert.ok(bounds.x >= shell.x && bounds.x + bounds.width <= shell.x + shell.width);
    assert.ok(bounds.y >= shell.y && bounds.y + bounds.height <= shell.y + shell.height);
    await local.locator('.phone-shell').screenshot({ path: `${output}/${host}-${width}.png` });
    await page.evaluate(() => { previewHarness.saveSettings = previewHarness.context.saveSettingsDebounced; previewHarness.context.saveSettingsDebounced = () => { throw Error('offline'); }; });
    await dialog.getByRole('button', { name: '关闭当前这份', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: '总开关保存失败' }).waitFor();
    assert.equal(await page.evaluate(() => previewHarness.settings.pocketPhone?.disabledCards?.['chat:preview']), undefined);
    await page.evaluate(() => { previewHarness.context.saveSettingsDebounced = previewHarness.saveSettings; });
    await dialog.getByRole('button', { name: '暂时继续', exact: true }).click();
    await local.getByRole('button', { name: '关闭手机', exact: true }).click();
    await page.evaluate(() => previewHarness.context.SlashCommandParser.commands['tmt-card-open'].callback());
    await card.getByRole('alertdialog').getByRole('button', { name: '关闭当前这份', exact: true }).click();
    await page.waitForFunction(() => previewHarness.settings.twoMoreThingsEmbedded?.disabledCards?.['chat:preview'] === true);
    assert.equal(await card.getByRole('alertdialog').count(), 0);
    assert.equal(await card.getByRole('switch', { name: '启用两三事', exact: true }).isChecked(), false);
    await card.getByRole('button', { name: '关闭手机', exact: true }).click();
    await page.evaluate(() => previewHarness.app.open());
    assert.equal(await local.getByRole('alertdialog').count(), 0, '关闭一份后不再提醒');
    await local.getByRole('button', { name: '关闭手机', exact: true }).click();
    await page.evaluate(() => previewHarness.card.open());
    await card.getByRole('switch', { name: '启用两三事', exact: true }).check();
    await card.getByRole('button', { name: '关闭手机', exact: true }).click();
    await page.locator('#tmt-fab-host').getByRole('button').click();
    await local.getByRole('alertdialog').getByRole('button', { name: '关闭当前这份', exact: true }).click();
    await page.waitForFunction(() => previewHarness.settings.pocketPhone?.disabledCards?.['chat:preview'] === true);
    assert.equal(await page.evaluate(() => previewHarness.settings.twoMoreThingsEmbedded.disabledCards['chat:preview']), undefined);
    await page.evaluate(() => previewHarness.card.open());
    assert.equal(await card.getByRole('alertdialog').count(), 0);
    assert.equal(await page.locator('#pocket-phone-launch, #pocket-phone-card-launch').count(), 2, '各自入口保留');
    assert.equal(await page.locator('#tmt-fab-host, #tmt-card-fab-host').count(), 2);
    assert.equal(await page.evaluate(() => JSON.stringify(previewHarness.metadata) === previewHarness.before), true);
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 0);
    assert.equal(await page.evaluate(() => previewHarness.metadataSaves), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Native/Luker 320/390: actual dual-instance detection, internal dialogs through both launchers/FAB/QR command, temporary continue, current-only disable, save failure and unchanged archives passed. Mock hosts only.');
} finally { await browser.close(); }
