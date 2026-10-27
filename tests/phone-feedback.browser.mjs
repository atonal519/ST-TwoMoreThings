import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { openApp } from './navigation.mjs';

const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
const portrait = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jHbcAAAAASUVORK5CYII=';
const screenshots = process.env.POCKET_FEEDBACK_SCREENSHOTS;
const checkImages = process.env.POCKET_FEEDBACK_IMAGES !== '0';
try {
  for (const [kind, mode] of [['native', 'standalone'], ['luker', 'embedded']]) {
    const page = await browser.newPage({ viewport: { width: 391, height: 844 } }); page.setDefaultTimeout(7000);
    const errors = [], requests = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.route('**/scripts/extensions.js', route => route.fulfill({ contentType: 'text/javascript', body: "export const extensionTypes={'third-party/ST-PocketPhone':'local'};" }));
    await page.route('**/scripts/power-user.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const power_user={encode_tags:false};' }));
    await page.route('**/scripts/world-info.js', route => route.fulfill({ contentType: 'text/javascript', body: `export const selected_world_info=[],world_info={};export async function loadWorldInfo(){return structuredClone(previewHarness.book)}export function createWorldInfoEntry(n,d){const e={uid:Object.keys(d.entries).length};d.entries[e.uid]=e;return e}export async function saveWorldInfo(n,d){if(previewHarness.installWait)await previewHarness.installWait;if(previewHarness.failInstall)throw Error('合成保存失败');previewHarness.book=structuredClone(d);previewHarness.bookSaves++}` }));
    await page.route('**/scripts/extensions/regex/engine.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const SCRIPT_TYPES={GLOBAL:0};export function getScriptsByType(){return previewHarness.rules}export async function saveScriptsByType(r){previewHarness.rules=r;previewHarness.ruleSaves++}' }));
    await page.route('**/api/extensions/version', route => route.fulfill({ json: { isUpToDate: true, remoteUrl: 'https://example.invalid/phone', currentCommitHash: 'a'.repeat(40) } }));
    await page.route('https://raw.githubusercontent.com/atonal519/ST-TwoMoreThings/main/release.json', route => route.fulfill({ json: { version: '0.3.9', sha: 'a'.repeat(40), update_notice: 'docs/updates-0.3.9.md' }, headers: { 'Access-Control-Allow-Origin': '*' } }));
    await page.route('**/user/images/mock-image.png', route => route.fulfill({ body: Buffer.from(portrait.split(',')[1], 'base64'), contentType: 'image/png' }));
    await page.route('https://example.invalid/manual.png', route => route.fulfill({ body: Buffer.from(portrait.split(',')[1], 'base64'), contentType: 'image/png' }));
    await page.route('**/api/backends/chat-completions/generate', route => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ json: { choices: [{ message: { content: '{"prompt":"plant, window","characters":[]}' } }] } });
    });
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${kind}&entry=extension&group=1`);
    await page.getByRole('button', { name: '打开两三事', exact: true }).waitFor();
    await page.evaluate(async ({ mode, portrait }) => {
      const h = previewHarness;
      h.context.characters[0].avatar = 'fixture.png'; h.context.characters[0].data = { extensions: { world: 'fixture-book' } };
      h.book = { entries: { 0: { uid: 0, content: '已有设定', foreign: true } } }; h.rules = [{ id: 'other' }]; h.bookSaves = 0; h.ruleSaves = 0;
      h.metadata.pocketPhone.contacts[0].source = { kind: 'qqj', entityId: 'lin-person' };
      globalThis.qqj_v3_public_bridge_v1 = { getStatus: () => ({ status: 'disabled' }), getPeopleSnapshot: () => ({ status: 'ready', people: { items: [{ entityId: 'lin-person', displayName: '林舟' }] } }), getPeopleAvatars: ids => ({ status: 'ready', avatarsByEntityId: Object.fromEntries(ids.map(id => [id, portrait])) }) };
      const { readTimeline } = await import('/src/timeline.js');
      for (const [id, speakerId, messageId] of [['lin', 'lin', 'private-photo'], ['preview-friends', 'lin', 'group-photo']]) h.metadata.pocketPhone.conversations[id].push({ id: messageId, role: 'assistant', speakerId, type: 'image', image: { description: '窗边的盆栽' }, batch: readTimeline(h.mainMessages), read: true });
      h.drawCalls = 0;
      globalThis.STBaiBaiImage = { apiVersion: 1, getBackendStatus: () => ({ configured: true, supportsCharacters: true }), getCharacters: () => ({ characters: [] }), async generate() { h.drawCalls++; if (h.drawWait) await h.drawWait; if (h.failDraw) throw Error('合成生图失败'); return { path: '/user/images/mock-image.png', seed: 1 }; } };
      if (mode === 'embedded') { h.settings.pocketPhone = { disabledCards: { 'character:fixture.png': true } }; h.embedded = (await import('/embed.js')).mountEmbedded({ release: { version: '0.3.9', sha: 'a'.repeat(40) } }); }
    }, { mode, portrait });
    const phone = page.locator(mode === 'embedded' ? '#pocket-phone-card-host' : '#pocket-phone-host');
    const launch = page.getByRole('button', { name: mode === 'embedded' ? '打开两三事 · 随卡' : '打开两三事', exact: true });
    await launch.click(); await openApp(phone, '设置');
    const versionBounds = () => phone.locator('.app-version').evaluate(row => {
      const a = row.getBoundingClientRect(), nav = row.nextElementSibling.getBoundingClientRect();
      return { outsideMain: !row.closest('.phone-main'), aboveNav: Math.abs(a.bottom - nav.top) < 1, y: a.y };
    });
    const fixedVersion = await versionBounds();
    assert.equal(fixedVersion.outsideMain, true); assert.equal(fixedVersion.aboveNav, true);
    const api = phone.locator('#api-source'); await api.selectOption(await api.locator('option').evaluateAll(options => options.find(option => option.value && option.value !== 'manual').value));
    await phone.getByRole('button', { name: '内容设置', exact: true }).click();
    assert.deepEqual(await phone.locator('#default-language option').allTextContents(), ['自动', '汉语', '英语', '粤语', '日语', '韩语']);
    assert.deepEqual(await phone.locator('#default-language').evaluate(select => ({ width: select.getBoundingClientRect().width, height: select.getBoundingClientRect().height, labelOneLine: select.previousElementSibling.getBoundingClientRect().height < 25 })), { width: 88, height: 24, labelOneLine: true });
    assert.equal(await phone.locator('#default-language-text').count(), 0);
    assert.equal(await phone.locator('.settings-export-row').evaluate(row => !row.closest('.settings-drawer')), true);
    await phone.locator('[data-story-sms-install]').getByRole('button', { name: '注入', exact: true }).waitFor({ state: 'visible' });
    await page.evaluate(() => { previewHarness.installWait = new Promise(resolve => { previewHarness.releaseInstall = resolve; }); });
    await phone.getByRole('button', { name: '注入', exact: true }).click();
    await phone.getByRole('button', { name: '关闭手机', exact: true }).click();
    await page.evaluate(() => { previewHarness.releaseInstall(); delete previewHarness.installWait; });
    await page.waitForFunction(() => previewHarness.bookSaves === 1 && previewHarness.ruleSaves === 1);
    await launch.click(); assert.equal(await phone.locator('.feedback').count(), 0, 'late successful install does not write feedback to lockscreen');
    await openApp(phone, '设置'); await phone.getByRole('button', { name: '已注入', exact: true }).waitFor();
    assert.equal(await phone.getByRole('button', { name: '已注入', exact: true }).isDisabled(), true);
    await page.evaluate(() => { previewHarness.rules.find(rule => rule.id !== 'other').replaceString = '旧样式'; });
    await phone.getByRole('button', { name: '内容设置', exact: true }).click(); await phone.getByRole('button', { name: '内容设置', exact: true }).click();
    await phone.getByRole('button', { name: '更新', exact: true }).click(); await phone.getByRole('button', { name: '已注入', exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => [Object.keys(previewHarness.book.entries).length, previewHarness.rules.length]), [2, 2]);
    const bar = await phone.locator('.master-switch-actions').evaluate(row => { const a = row.querySelector('.pp-update-status').getBoundingClientRect(), b = row.querySelector('.switch').getBoundingClientRect(); return { left: a.right <= b.left, height: a.height, toggle: b.height, centered: Math.abs(a.y - b.y) < 1, buttonInLabel: !!row.querySelector('.pp-update-status').closest('label') }; });
    assert.deepEqual(bar, { left: true, height: 20, toggle: 20, centered: true, buttonInLabel: false });
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await phone.evaluate(async (element, data) => { const font = new FontFace('PhoneFixtureCJK', `url(data:font/otf;base64,${data})`); await font.load(); document.fonts.add(font); const style = document.createElement('style'); style.textContent = ':host{font-family:PhoneFixtureCJK,sans-serif}'; element.shadowRoot.append(style); }, (await readFile('/tmp/st-dollars-npc-rewrite-20261017/graph-ui-20261018/diagnostic-assets/NotoSansCJKsc-Regular.otf')).toString('base64'));
      await phone.locator('.phone-shell').screenshot({ path: `${screenshots}/${kind}-settings.png` });
    }
    await phone.getByRole('button', { name: '内容设置', exact: true }).click();
    if (screenshots) await phone.locator('.phone-shell').screenshot({ path: `${screenshots}/${kind}-settings-collapsed.png` });
    await phone.getByRole('button', { name: '外观设置', exact: true }).click();
    await phone.locator('.phone-main').evaluate(main => { main.scrollTop = main.scrollHeight; });
    assert.deepEqual(await versionBounds(), fixedVersion, 'version row stays above system navigation while content scrolls');
    await page.setViewportSize({ width: 1080, height: 844 });
    assert.equal((await versionBounds()).aboveNav, true, 'desktop version row stays above system navigation');
    assert.equal((await versionBounds()).outsideMain, true);
    await page.setViewportSize({ width: 391, height: 844 });
    if (screenshots) await phone.locator('.phone-shell').screenshot({ path: `${screenshots}/${kind}-settings-scrolled.png` });
    await openApp(phone, '短信'); await phone.locator('[data-contact="lin"]').click();
    assert.equal(await phone.locator('.app-version').count(), 0, 'only settings has a version footer');
    await phone.getByRole('button', { name: '聊天资料', exact: true }).click();
    const avatarAction = async name => { await phone.getByRole('button', { name: '头像操作', exact: true }).click(); await phone.getByRole('button', { name, exact: true }).click(); };
    const menu = phone.getByRole('group', { name: '头像操作菜单', exact: true }), toggle = phone.getByRole('button', { name: '头像操作', exact: true });
    await phone.locator('#profile-nickname').fill('舟');
    await toggle.click(); assert.deepEqual(await menu.locator('.avatar-menu-item').allTextContents(), ['上传', '移除', '恢复']);
    const position = await phone.locator('.avatar-editor').evaluate(editor => {
      const a = editor.querySelector('.profile-avatar').getBoundingClientRect(), b = editor.getBoundingClientRect(), toggle = editor.querySelector('.avatar-menu-toggle').getBoundingClientRect();
      return { centered: Math.abs(a.x + a.width / 2 - b.x - b.width / 2) < 1, right: toggle.left >= a.right };
    });
    assert.deepEqual(position, { centered: true, right: true });
    assert.equal(await phone.locator('.field-refresh > svg').evaluate(svg => getComputedStyle(svg).transform), 'matrix(1, 0, 0, 1, 0, -1.5)');
    if (screenshots) for (const width of [391, 1080]) { await page.setViewportSize({ width, height: 844 }); await phone.locator('.phone-shell').screenshot({ path: `${screenshots}/${kind}-avatar-menu-${width}.png` }); }
    await page.setViewportSize({ width: 391, height: 844 });
    await toggle.click(); assert.equal(await menu.count(), 0);
    await toggle.click(); await phone.locator('#profile-name').click({ position: { x: 12, y: 12 } }); assert.equal(await menu.count(), 0, 'outside click closes menu');
    assert.equal(await phone.locator('#profile-nickname').inputValue(), '舟', 'closing menu preserves profile draft');
    await toggle.click(); await page.keyboard.press('Escape'); assert.equal(await menu.count(), 0); assert.equal(await phone.locator('.phone-shell').isVisible(), true);
    assert.equal(await phone.locator('.profile-avatar img').getAttribute('src'), portrait);
    const original = await page.evaluate(() => previewHarness.metadata.pocketPhone.contacts[0].avatar);
    const upload = { name: 'portrait.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#314a50"/></svg>') };
    await toggle.click(); await phone.getByLabel('选择头像图片', { exact: true }).setInputFiles(upload);
    const cropper = phone.getByRole('dialog', { name: '调整头像', exact: true }); await cropper.waitFor();
    await cropper.getByRole('button', { name: '取消', exact: true }).click(); await cropper.waitFor({ state: 'hidden' });
    assert.equal(await phone.locator('.profile-avatar img').getAttribute('src'), portrait);
    assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.contacts[0].avatar), original);
    await toggle.click(); await phone.getByLabel('选择头像图片', { exact: true }).setInputFiles(upload); await cropper.waitFor();
    await cropper.locator('[data-crop="confirm"]').click(); await cropper.waitFor({ state: 'hidden' });
    assert.match(await phone.locator('.profile-avatar img').getAttribute('src'), /^data:image\//);
    await phone.locator('[data-action="back-profile"]').click();
    assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.contacts[0].avatar), original, 'uploaded draft is cancelled without a save');
    await phone.getByRole('button', { name: '聊天资料', exact: true }).click();
    await phone.locator('#profile-nickname').fill('舟'); await phone.getByRole('button', { name: '保存', exact: true }).click();
    assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.contacts[0].avatar), original);
    assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.contacts[0].manualFields.includes('avatar')), false);
    await phone.getByRole('button', { name: '聊天资料', exact: true }).click();
    await avatarAction('移除头像');
    assert.equal(await phone.locator('.profile-avatar img').count(), 0);
    await phone.getByRole('button', { name: '保存', exact: true }).click();
    await phone.getByRole('button', { name: '聊天资料', exact: true }).click();
    await avatarAction('恢复自动头像');
    assert.equal(await phone.locator('.profile-avatar img').getAttribute('src'), portrait);
    await phone.locator('[data-action="back-profile"]').click();
    assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.contacts[0].avatar), '', 'cancel restoration does not write');
    await phone.getByRole('button', { name: '聊天资料', exact: true }).click(); await avatarAction('恢复自动头像');
    await phone.locator('#profile-avatar').fill('https://example.invalid/manual.png');
    assert.equal(await phone.locator('.profile-avatar img').getAttribute('src'), 'https://example.invalid/manual.png');
    await phone.getByRole('button', { name: '保存', exact: true }).click();
    assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.contacts[0].avatar), 'https://example.invalid/manual.png');
    await phone.getByRole('button', { name: '聊天资料', exact: true }).click(); await avatarAction('恢复自动头像'); await phone.getByRole('button', { name: '保存', exact: true }).click();
    assert.equal(await page.evaluate(async () => (await import('/src/cameo-avatar.js')).isCameoAvatar(previewHarness.metadata.pocketPhone.contacts[0].avatar)), true);
    assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.contacts[0].manualFields.includes('avatar')), false);
    await openApp(phone, '短信'); await phone.locator('[data-group="preview-friends"]').click(); await phone.getByRole('button', { name: '聊天资料', exact: true }).click();
    await toggle.click(); assert.deepEqual(await menu.locator('.avatar-menu-item').allTextContents(), ['上传', '移除']);
    await openApp(phone, '设置'); assert.equal(await menu.count(), 0, 'navigation closes avatar menu');
    await phone.getByRole('button', { name: '编辑我的资料', exact: true }).click();
    await toggle.click(); assert.deepEqual(await menu.locator('.avatar-menu-item').allTextContents(), ['上传', '移除']);
    for (const [conversation, photo, failFirst] of checkImages ? [['lin', 'private-photo', false], ['preview-friends', 'group-photo', true]] : []) {
      await openApp(phone, '短信'); await phone.locator(conversation === 'lin' ? '[data-contact="lin"]' : '[data-group="preview-friends"]').click();
      await page.evaluate(fail => { const h = previewHarness; h.failDraw = fail; h.drawWait = new Promise(resolve => { h.releaseDraw = resolve; }); }, failFirst);
      const bubble = phone.locator(`[data-photo="${photo}"]`), before = requests.length;
      await bubble.click(); await bubble.locator('.photo-placeholder [role="status"]').waitFor();
      assert.equal(await bubble.getAttribute('aria-busy'), 'true'); assert.equal(await bubble.isDisabled(), true);
      assert.equal(await bubble.evaluate(node => getComputedStyle(node).opacity), '1');
      await bubble.dispatchEvent('click'); assert.equal(requests.length, before + 1);
      if (screenshots) for (const width of [391, 1080]) { await page.setViewportSize({ width, height: 844 }); await phone.locator('.phone-shell').screenshot({ path: `${screenshots}/${kind}-${photo}-${width}.png` }); }
      await page.evaluate(() => { previewHarness.releaseDraw(); delete previewHarness.drawWait; });
      if (failFirst) {
        await phone.getByRole('alert').getByText('合成生图失败', { exact: true }).waitFor();
        assert.equal(await bubble.isDisabled(), false); assert.equal(await bubble.locator('.photo-description').textContent(), '窗边的盆栽');
        await page.evaluate(() => { previewHarness.failDraw = false; }); await bubble.click();
      }
      await bubble.locator('img').waitFor();
      assert.equal(await bubble.getAttribute('aria-busy'), 'false'); assert.equal(await bubble.isDisabled(), false);
    }
    assert.equal(requests.length, checkImages ? 3 : 0); assert.equal(await page.evaluate(() => previewHarness.drawCalls), checkImages ? 3 : 0);
    assert.deepEqual(errors, []);
    console.log(`${kind}/${mode}: install status/update/no duplicate, fixed settings version row/content scroll, avatar menu/close/upload/crop/cancel/clear/restore, QQJ projection/raw save, user/group boundaries, local refresh offset passed; ${checkImages ? 'image pending/duplicate-click/success/failure passed; 3 mock recipe and 3 mock image calls' : 'image matrix skipped; 0 model/image calls'}.`);
    await page.close();
  }
} finally { await browser.close(); }
