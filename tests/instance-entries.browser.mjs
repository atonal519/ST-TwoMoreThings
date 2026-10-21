import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
try {
  for (const kind of ['native', 'luker']) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 844 } });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${kind}&entry=extension`);
    const launch = page.getByRole('button', { name: '打开两三事', exact: true });
    await launch.waitFor();
    const dark = { color: 'rgb(235, 239, 244)', backgroundColor: 'rgb(17, 23, 29)', borderColor: 'rgb(120, 140, 159)' };
    const light = { color: 'rgb(32, 37, 37)', backgroundColor: 'rgb(244, 239, 231)', borderColor: 'rgb(115, 125, 117)' };
    const setHostTheme = async palette => {
      await page.evaluate(palette => {
        for (const [key, value] of Object.entries({ '--SmartThemeBodyColor': palette.color, '--SmartThemeBlurTintColor': palette.backgroundColor, '--SmartThemeBorderColor': palette.borderColor, '--SmartThemeQuoteColor': palette.borderColor })) document.documentElement.style.setProperty(key, value);
      }, palette);
      await page.waitForTimeout(350);
    };
    const assertFabTheme = async (id, palette) => {
      const actual = await page.locator(id).getByRole('button').evaluate(button => {
        const style = getComputedStyle(button), box = button.getBoundingClientRect();
        return { color: style.color, backgroundColor: style.backgroundColor, borderColor: style.borderColor, opacity: style.opacity, width: box.width, height: box.height };
      });
      assert.deepEqual(actual, { ...palette, opacity: '1', width: 36, height: 36 }, 'floating entry follows the host palette with a visible surface');
    };
    await setHostTheme(dark);
    await assertFabTheme('#tmt-fab-host', dark);
    const before = await page.evaluate(() => {
      previewHarness.metadata.pocketPhone.theme = 'night';
      previewHarness.settings.pocketPhone = { fabShow: true };
      previewHarness.context.characters[0].avatar = 'one.png';
      previewHarness.context.characters.push({ name: '另一张卡', avatar: 'two.png' });
      return JSON.stringify(previewHarness.metadata);
    });
    await launch.click();
    const local = page.locator('#pocket-phone-host');
    await local.getByRole('button', { name: '进入桌面', exact: true }).click();
    await local.getByRole('button', { name: '设置', exact: true }).click();
    await local.getByRole('button', { name: '外观设置', exact: true }).click();
    assert.equal(await local.getAttribute('data-theme'), 'night');
    await assertFabTheme('#tmt-fab-host', dark);
    await local.getByRole('switch', { name: 'QR', exact: true }).check();
    await page.evaluate(() => quickReplyApi.createQuickReply('两三事', '用户按钮', { message: '/echo 保留', isHidden: false }));
    await local.getByRole('switch', { name: '启用两三事', exact: true }).uncheck();
    assert.equal(await page.locator('#tmt-fab-host').isVisible(), false, 'disabling this card hides this instance’s floating entry');
    assert.equal(await page.evaluate(() => previewHarness.settings.pocketPhone.fabShow), true, 'does not change the global floating-entry preference');
    assert.equal(await page.evaluate(() => quickReplyApi.getSetByName('两三事').qrList.find(qr => qr.label === '手机').isHidden), true, 'disabling also hides this instance’s QR launcher');
    assert.equal(await page.evaluate(() => previewHarness.settings.pocketPhone.qrShow), true, 'preserves the global QR preference');
    assert.equal(await page.evaluate(() => quickReplyApi.getSetByName('两三事').qrList.find(qr => qr.label === '用户按钮').isHidden), false);
    await local.getByText('插件版已在当前角色卡停用，重新开启后可使用其他页面。', { exact: true }).waitFor();
    await local.locator('.app-version').getByText('插件版', { exact: true }).waitFor();
    assert.equal(await local.getByRole('button', { name: '主页', exact: true }).isDisabled(), true);
    await local.getByRole('button', { name: '关闭手机', exact: true }).click();
    await page.evaluate(async () => {
      previewHarness.context.characterId = 1;
      await previewHarness.context.eventSource.emit('chat-changed');
    });
    assert.equal(await page.locator('#tmt-fab-host').isVisible(), true, 'the global preference still applies on another enabled card');
    assert.equal(await page.evaluate(() => quickReplyApi.getSetByName('两三事').qrList.find(qr => qr.label === '手机').isHidden), false);
    await page.evaluate(async () => {
      previewHarness.context.characterId = 0;
      await previewHarness.context.eventSource.emit('chat-changed');
    });
    assert.equal(await page.locator('#tmt-fab-host').isVisible(), false, 'returning to the disabled card hides only its floating entry');
    assert.equal(await page.evaluate(() => quickReplyApi.getSetByName('两三事').qrList.find(qr => qr.label === '手机').isHidden), true);
    await launch.click();
    await local.getByRole('switch', { name: '启用两三事', exact: true }).check();
    assert.equal(await page.locator('#tmt-fab-host').isVisible(), true);
    assert.equal(await page.evaluate(() => quickReplyApi.getSetByName('两三事').qrList.find(qr => qr.label === '手机').isHidden), false);
    await local.getByRole('button', { name: '关闭手机', exact: true }).click();
    await page.evaluate(async () => {
      const { mountEmbedded } = await import('/embed.js');
      previewHarness.card = mountEmbedded();
    });
    const cardLaunch = page.getByRole('button', { name: '打开两三事 · 随卡', exact: true });
    await cardLaunch.click();
    const card = page.locator('#pocket-phone-card-host');
    await card.getByRole('button', { name: '暂时继续', exact: true }).click();
    await setHostTheme(light);
    await assertFabTheme('#tmt-fab-host', light);
    await assertFabTheme('#tmt-card-fab-host', light);
    assert.equal(await local.getAttribute('data-theme'), 'night', 'host theme changes leave the phone theme intact');
    assert.equal(await card.getAttribute('data-theme'), 'night');
    const topPhone = () => page.evaluate(() => {
      const shell = document.getElementById('pocket-phone-card-host').shadowRoot.querySelector('.phone-shell').getBoundingClientRect();
      return document.elementFromPoint(shell.x + shell.width / 2, shell.y + shell.height / 2)?.id;
    });
    for (let index = 0; index < 3; index++) {
      await launch.click();
      assert.equal(await topPhone(), 'pocket-phone-host', 'opening the plugin brings its real window above the still-open card window');
      await local.getByRole('button', { name: '暂时继续', exact: true }).click();
      await cardLaunch.click();
      assert.equal(await topPhone(), 'pocket-phone-card-host', 'opening the card brings its window back above the plugin');
      await card.getByRole('button', { name: '暂时继续', exact: true }).click();
    }
    await page.locator('#tmt-fab-host').getByRole('button').click();
    assert.equal(await topPhone(), 'pocket-phone-host', 'clicking the plugin floating entry brings a covered window forward instead of closing it');
    await local.getByRole('button', { name: '暂时继续', exact: true }).click();
    await page.locator('#tmt-fab-host').getByRole('button').click();
    assert.equal(await local.isVisible(), false, 'a second floating-entry click still closes the foreground window');
    await page.setViewportSize({ width: 390, height: 844 });
    for (const command of ['tmt-open', 'tmt-card-open', 'tmt-open']) {
      await page.evaluate(command => previewHarness.context.SlashCommandParser.commands[command].callback(), command);
      assert.equal(await topPhone(), command === 'tmt-open' ? 'pocket-phone-host' : 'pocket-phone-card-host', 'mobile command opens the requested window above the other instance');
      const active = command === 'tmt-open' ? local : card;
      await active.getByRole('button', { name: '暂时继续', exact: true }).click();
    }
    await local.getByRole('button', { name: '关闭手机', exact: true }).click();
    await card.getByRole('button', { name: '进入桌面', exact: true }).click();
    await card.getByRole('button', { name: '设置', exact: true }).click();
    await card.locator('.app-version').getByText('随卡版', { exact: true }).waitFor();
    await card.getByRole('button', { name: '外观设置', exact: true }).click();
    await card.getByRole('switch', { name: 'QR', exact: true }).check();
    await card.getByRole('switch', { name: '启用两三事', exact: true }).uncheck();
    assert.equal(await page.locator('#tmt-card-fab-host').isVisible(), false);
    assert.equal(await page.locator('#tmt-fab-host').isVisible(), true);
    assert.equal(await page.evaluate(() => quickReplyApi.getSetByName('两三事 · 随卡').qrList.find(qr => qr.label === '手机').isHidden), true);
    assert.equal(await page.evaluate(() => quickReplyApi.getSetByName('两三事').qrList.find(qr => qr.label === '手机').isHidden), false);
    await card.getByRole('switch', { name: 'QR', exact: true }).uncheck();
    await card.getByRole('switch', { name: 'QR', exact: true }).check();
    assert.equal(await page.evaluate(() => quickReplyApi.getSetByName('两三事 · 随卡').qrList.find(qr => qr.label === '手机').isHidden), true, 'changing the preference while stopped cannot show its QR button');
    assert.equal(await page.evaluate(() => quickReplyApi.settings.isEnabled), true, 'does not alter the host QR master switch');
    assert.equal(await page.evaluate(() => previewHarness.settings.pocketPhone.fabShow), true);
    assert.equal(await page.evaluate(() => JSON.stringify(previewHarness.metadata)), before);
    assert.equal(await page.evaluate(() => previewHarness.metadataSaves), 0);
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Native/Luker: live light/dark host palettes for both floating entries independent of phone theme, per-card visibility, retained preferences and menu re-enable, instance labels, foreground selection, unchanged archives and no model calls passed. Mock hosts only.');
} finally { await browser.close(); }
