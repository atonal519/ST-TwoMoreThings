import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { openApp } from './navigation.mjs';

const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
try {
  for (const kind of ['native', 'luker']) for (const mode of ['standalone', 'embedded']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(5000);
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    await page.route('**/scripts/extensions.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const extensionTypes = {};' }));
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${kind}&entry=extension`);
    await page.getByRole('button', { name: '打开两三事', exact: true }).waitFor();
    await page.evaluate(async mode => {
      const h = previewHarness, { createCameoAvatar } = await import('/src/cameo-avatar.js');
      h.loadedMetadata = { foreign: { keep: true }, pocketPhone: {
        schemaVersion: 1,
        contacts: ['a', 'b', 'c'].map((id, index) => ({ id, name: ['人物甲', '人物乙', '人物丙'][index], avatar: createCameoAvatar(`loaded-${id}`) })),
        groups: [{ id: 'group', name: '示例群', memberIds: ['a', 'b', 'c'], userIsMember: true }],
        conversations: Object.fromEntries([['a', 0], ['b', 4], ['c', 41], ['group', 7]].map(([id, count]) => [id, Array.from({ length: count }, (_, index) => ({ id: `${id}-${index}`, role: 'assistant', speakerId: id === 'group' ? 'a' : id, text: `离线消息 ${id}-${index}`, read: true, timeLabel: '18:00' }))])),
        forum: { posts: Array.from({ length: 3 }, (_, index) => ({ id: `f${index}`, title: `离线帖子 ${index}`, content: '已保存的帖子', comments: [] })) },
        social: { posts: ['a', 'b', 'c', 'npc1', 'npc2'].map((authorId, index) => ({ id: `s${index}`, authorId, text: `离线动态 ${index}`, comments: [] })), feedIds: ['s0', 's1', 's2', 's3', 's4'], npcs: [{ id: 'npc1', name: '路人甲' }, { id: 'npc2', name: '路人乙' }] },
      } };
      h.liveMetadata = {}; h.initialMetadata = h.liveMetadata;
      Object.defineProperty(h.context, 'chatMetadata', { configurable: true, get: () => h.liveMetadata });
      if (mode === 'embedded') {
        h.settings.pocketPhone = { disabledCards: { 'chat:preview': true } };
        const { mountEmbedded } = await import('/embed.js');
        h.loadedApp = mountEmbedded({ release: { version: '0.3.8', sha: 'a'.repeat(40) } });
      }
    }, mode);
    const phone = page.locator(mode === 'embedded' ? '#pocket-phone-card-host' : '#pocket-phone-host');
    const launch = page.getByRole('button', { name: mode === 'embedded' ? '打开两三事 · 随卡' : '打开两三事', exact: true });
    await launch.click();
    await openApp(phone, '短信');
    assert.equal(await phone.locator('[data-contact]').count(), 0, 'opening before the chat loads starts with the empty archive');
    const initialPhone = await phone.elementHandle();
    await phone.getByRole('button', { name: '关闭手机', exact: true }).click();
    const saved = await page.evaluate(() => {
      const h = previewHarness;
      h.liveMetadata = h.loadedMetadata;
      h.mainMessages.splice(0, h.mainMessages.length, ...Array.from({ length: 145 }, (_, index) => ({ is_user: false, mes: `正文示例 ${index}` })));
      return JSON.stringify(h.loadedMetadata);
    });
    await launch.click();
    await openApp(phone, '短信');
    await page.waitForFunction(() => previewHarness.metadataSaves === 1);
    const filled = await page.evaluate(() => structuredClone(previewHarness.liveMetadata));
    for (const npc of filled.pocketPhone.social.npcs) assert.match(npc.avatar, /^data:image\/svg\+xml;/);
    const withoutNpcAvatars = structuredClone(filled);
    for (const npc of withoutNpcAvatars.pocketPhone.social.npcs) delete npc.avatar;
    assert.equal(JSON.stringify(withoutNpcAvatars), saved, 'loading the actual archive only adds the missing NPC portraits');
    assert.equal(await phone.locator('[data-contact]').count(), 3, 'reopening after the same chat loads reads its actual contacts');
    assert.equal(await phone.locator('[data-group]').count(), 1);
    assert.equal(await initialPhone.evaluate(element => element.isConnected), false, 'the phone bound to the replaced metadata is disposed');
    assert.equal(await page.locator('style[data-pocket-phone-font]').count(), 1, 'the old phone releases its document-level resources');
    const histories = {};
    for (const [id, count] of [['a', 0], ['b', 4], ['c', 41], ['group', 7]]) {
      await phone.locator(id === 'group' ? `[data-group="${id}"]` : `[data-contact="${id}"]`).click();
      if (count) await phone.getByRole('button', { name: '查看过去', exact: true }).click();
      histories[id] = await phone.locator('.bubble').count();
      assert.equal(histories[id], count, 'all saved history remains readable through the conversation');
      await phone.locator('.system-nav').getByRole('button', { name: '返回', exact: true }).click();
    }
    await openApp(phone, '论坛');
    assert.equal(await phone.locator('.forum-card').count(), 3);
    await phone.locator('[data-post="f0"]').click();
    await phone.getByText('已保存的帖子', { exact: true }).waitFor();
    await openApp(phone, 'ainstgram');
    assert.equal(await phone.locator('.social-post[data-social-post]').count(), 5);
    const loadedPhone = await phone.elementHandle();
    await phone.getByRole('button', { name: '关闭手机', exact: true }).click();
    await launch.click();
    assert.equal(await phone.evaluate((element, previous) => element === previous, loadedPhone), true, 'ordinary reopening with the same metadata keeps the existing instance');
    assert.equal(await phone.locator('.view-home').count(), 1, 'ordinary reopening still starts at the lockscreen');
    assert.equal(await page.evaluate(() => JSON.stringify(previewHarness.liveMetadata)), JSON.stringify(filled), 'subsequent opening and reading retain the filled archive');
    assert.equal(await page.evaluate(() => JSON.stringify(previewHarness.initialMetadata)), '{}');
    assert.equal(await page.evaluate(() => previewHarness.context.chatId), 'preview');
    assert.equal(await page.evaluate(() => previewHarness.metadataSaves), 1);
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 0);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    await page.close();
  }
  console.log('Native/Luker plugin/card: reopening after initial chat metadata loading binds the actual archive; 3 contacts, 1 group, 52 messages, 3 forum posts and 5 social posts remain readable, replaced UI disposed and unchanged-source UI retained; one missing-NPC portrait save and no model calls. Mock hosts only.');
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
      const mixedBorder = await page.evaluate(palette => {
        const reference = document.createElement('span');
        reference.style.color = `color-mix(in srgb,${palette.borderColor} 45%,${palette.backgroundColor})`;
        document.body.append(reference);
        const color = getComputedStyle(reference).color;
        reference.remove(); return color;
      }, palette);
      const actual = await page.locator(id).getByRole('button').evaluate(button => {
        const style = getComputedStyle(button), box = button.getBoundingClientRect();
        return { color: style.color, backgroundColor: style.backgroundColor, borderColor: style.borderColor, opacity: style.opacity, width: box.width, height: box.height };
      });
      assert.deepEqual(actual, { color: palette.color, backgroundColor: 'rgba(0, 0, 0, 0)', borderColor: mixedBorder, opacity: '0.45', width: 36, height: 36 }, 'floating entry mixes the host accent and surface for its border over a transparent background');
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
    await page.waitForFunction(() => previewHarness.metadataSaves === 1);
    const filled = await page.evaluate(() => structuredClone(previewHarness.metadata));
    for (const person of filled.pocketPhone.contacts) assert.match(person.avatar, /^data:image\/svg\+xml;/);
    const withoutAvatars = structuredClone(filled);
    for (const person of withoutAvatars.pocketPhone.contacts) delete person.avatar;
    assert.equal(JSON.stringify(withoutAvatars), before, 'first opening only adds the missing fixed portraits');
    const afterAvatarFill = JSON.stringify(filled);
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
    assert.equal(await page.evaluate(() => JSON.stringify(previewHarness.metadata)), afterAvatarFill);
    assert.equal(await page.evaluate(() => previewHarness.metadataSaves), 1);
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Native/Luker: live light/dark host palettes for both floating entries independent of phone theme, per-card visibility, retained preferences and menu re-enable, instance labels, foreground selection, one opening portrait save followed by unchanged archives and no model calls passed. Mock hosts only.');
} finally { await browser.close(); }
