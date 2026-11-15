import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { openApp } from './navigation.mjs';

const { chromium } = createRequire(process.env.POCKET_PLAYWRIGHT_PACKAGE || '/tmp/st-tools-browser/package.json')('playwright-core');
const evidence = process.env.INSPECT_EVIDENCE || '/home/admin/sillytavern/data/codex-private/tmt-inspect-phone-20261110/ui-owner-browser';
const referenceDirectory = process.env.POCKET_RELEASE_REFERENCE;
mkdirSync(evidence, { recursive: true });
const previewUrl = new URL(process.env.POCKET_PREVIEW_URL || 'http://127.0.0.1:8941/tests/preview.html');
const rootPath = new URL('../', previewUrl).pathname;
const browser = await chromium.launch({ executablePath: '/tmp/qqj-ui-browser-20261028/browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', headless: true, args: ['--no-sandbox'], env: { ...process.env, FONTCONFIG_FILE: '/home/admin/sillytavern/data/codex-private/tmt-bilingual-typography-20261030/fonts.conf', LD_LIBRARY_PATH: '/tmp/qqj-ui-browser-20261028/syslibs/usr/lib/x86_64-linux-gnu' } });
let assertions = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); assertions++; };
const back = page => page.locator('.system-nav').getByRole('button', { name: '返回', exact: true }).click();
const home = page => page.locator('.system-nav').getByRole('button', { name: '主页', exact: true }).click();
const metrics = page => page.evaluate(() => ({ models: previewHarness.requests.length, metadata: previewHarness.metadataSaves, settings: previewHarness.settingsSaves }));
async function createPage(kind, mode, reference = false) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(10000);
  const state = { errors: [], loading: [], delay: true, failMedia: false };
  page.on('pageerror', error => state.errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/assets/inspect-phone/')) state.loading.push(request.url()); });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== previewUrl.origin) return route.abort();
    if (reference) {
      const old = new Map([[`${rootPath}src/ui.js`, 'ui.js'], [`${rootPath}src/ui/desktop.js`, 'desktop.js'], [`${rootPath}style.css`, 'style.css']]).get(url.pathname);
      if (old) return route.fulfill({ body: readFileSync(`${referenceDirectory}/${old}`), contentType: old.endsWith('.css') ? 'text/css' : 'text/javascript' });
    }
    if (url.pathname === `${rootPath}tests/preview.js`) {
      const response = await route.fetch();
      let source = (await response.text()).replace("characters: [{ name: '林舟',", "characters: [{ avatar: 'simulator.png', name: '都市群像模拟器',");
      source = source.replace("const settings = {", "const settings = { pocketPhone: { apiSourceRef: { kind: 'shared-preset', presetId: 'daily' } },");
      source = source.replace("if (h.replyWait) await h.replyWait;", "if (h.inspectApiFailure) { h.inspectApiFailure = false; return Response.json({ error: { message: '模拟503' } }, { status: 503 }); } if (h.replyWait) await h.replyWait;");
      if (mode === 'embedded') source = source.replace("const { initialize } = await import('../index.js');", "const { mountEmbedded } = await import('../embed.js'); const initialize = options => mountEmbedded({ ...options, host: { ...options.host, mode: 'embedded' } });");
      return route.fulfill({ response, body: source });
    }
    if ((reference || process.env.INSPECT_SOURCE === '1') && [`${rootPath}index.js`, `${rootPath}embed.js`].includes(url.pathname)) {
      const response = await route.fetch();
      return route.fulfill({ response, body: (await response.text()).replaceAll("'./dist/runtime.js'", "'./src/runtime.js'") });
    }
    if (url.pathname.includes('/assets/inspect-phone/')) {
      if (state.failMedia) { state.failMedia = false; return route.abort(); }
      if (state.delay) { state.delay = false; await new Promise(resolve => setTimeout(resolve, 800)); }
    }
    return route.continue();
  });
  const url = new URL(previewUrl); url.searchParams.set('host', kind);
  await page.goto(url.href); await page.locator('.phone-shell').waitFor();
  return { page, state };
}
async function choose(page, id) {
  await page.locator(`[data-inspect-owner="${id}"]`).click();
  await page.locator('.inspect-owned-content').waitFor();
}
async function wechat(page) {
  await page.getByRole('button', { name: '微信', exact: true }).click();
  await page.locator('.view-inspect-wechat').waitFor();
}
async function owners(page) { await home(page); await back(page); await page.locator('.view-inspect-phone').waitFor(); }
async function createOwner(page, name, personality = '') {
  await page.getByRole('button', { name: '添加人物', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '添加手机主人', exact: true });
  await dialog.getByLabel('姓名', { exact: true }).fill(name);
  await dialog.getByLabel('人物资料', { exact: true }).fill(personality);
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await page.locator('.inspect-owned-content').waitFor();
  return page.evaluate(value => Object.entries(previewHarness.context.chatMetadata.pocketPhone.inspectPhone.owners).find(([, owner]) => owner.profile?.name === value)[0], name);
}
async function desktopRectangles(page) {
  return page.evaluate(() => Object.fromEntries(['.desktop-calendar', ...['liangshi', 'social', 'album', 'favorites', 'messages', 'forum', 'calendar', 'settings'].map(id => `.desktop-app[data-tab="${id}"]`)].map(selector => {
    const box = document.querySelector('.pocket-phone').shadowRoot.querySelector(selector).getBoundingClientRect();
    return [selector, ['x', 'y', 'width', 'height'].map(key => Number(box[key].toFixed(3)))];
  })));
}
const releaseRectangles = {};
try {
  if (referenceDirectory) {
    const { page } = await createPage('native', 'standalone', true);
    await page.getByRole('button', { name: '进入桌面', exact: true }).click();
    for (const width of [320, 390, 1100]) for (const theme of ['day', 'night']) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(value => { previewHarness.metadata.pocketPhone.theme = value; previewHarness.app.open(); }, theme);
      await page.waitForTimeout(80);
      releaseRectangles[`${width}/${theme}`] = await desktopRectangles(page);
    }
    await page.close();
  }
  for (const kind of ['native', 'luker']) for (const mode of ['standalone', 'embedded']) {
    const { page, state } = await createPage(kind, mode);
    const prefix = `${kind}-${mode}`;
    await page.getByRole('button', { name: '进入桌面', exact: true }).click();
    if (kind === 'native' && mode === 'standalone' && referenceDirectory) {
      for (const width of [320, 390, 1100]) for (const theme of ['day', 'night']) {
        await page.setViewportSize({ width, height: 844 });
        await page.evaluate(value => { previewHarness.metadata.pocketPhone.theme = value; previewHarness.app.open(); }, theme);
        await page.waitForTimeout(80);
        check(await desktopRectangles(page), releaseRectangles[`${width}/${theme}`], `released 0.6.4 first-screen geometry ${width}/${theme}`);
      }
      writeFileSync(`${evidence}/released-geometry.json`, JSON.stringify(releaseRectangles, null, 2));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { previewHarness.metadata.pocketPhone.theme = 'day'; previewHarness.app.open(); });
    check(await page.getByRole('button', { name: '第2屏', exact: true }).count(), 1, 'only the current page dots enter the accessibility tree');
    check(await page.locator('[data-desktop-page="1"]').evaluate(page => page.inert), true, 'offscreen page is inert');
    await page.locator('.phone-shell').screenshot({ path: `${evidence}/${prefix}-main-first.png` });
    if (kind === 'native' && mode === 'standalone') {
      const session = await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 320, y: 220 }] });
      for (let step = 1; step <= 8; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 320 - step * 34, y: 220 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(250);
      check(await page.locator('[data-desktop-page="1"]').evaluate(page => !page.inert), true, 'native horizontal touch reaches screen two');
      await page.getByRole('button', { name: '第1屏', exact: true }).click();
    }
    await page.getByRole('button', { name: '第2屏', exact: true }).focus(); await page.keyboard.press('Enter');
    check(await page.locator('[data-desktop-page="0"]').evaluate(page => page.inert), true, 'keyboard pagination deactivates page one');
    check(await page.getByRole('button', { name: '查手机', exact: true }).count(), 1, 'inspection is on page two');
    check(await page.getByRole('button', { name: '第2屏', exact: true }).evaluate(button => { const b = button.getBoundingClientRect(); return [b.width, b.height]; }), [24, 24], 'dots retain 24px hit targets');
    const entering = await metrics(page);
    await page.getByRole('button', { name: '查手机', exact: true }).click();
    check(await page.locator('.inspect-loading').count(), 0, 'opening the module selects a person before loading');
    check(await page.locator('[data-inspect-owner]').count(), 3, 'the simulator title is not a person');
    check(await metrics(page), entering, 'person selection is zero-model and zero-save');
    check(state.loading.length, 0, 'media is not preloaded before a person is selected');
    await page.locator('[data-inspect-owner="lin"]').click();
    await page.locator('.inspect-loading img').evaluate(image => image.decode());
    await page.waitForTimeout(1500);
    check(await page.locator('.inspect-loading').count(), 1, 'cold loading still plays a full cycle after media load');
    await page.keyboard.press('Escape');
    await page.evaluate(() => previewHarness.app.open());
    await openApp(page, '查手机'); await page.waitForTimeout(800);
    check(await page.locator('.view-inspect-phone').isVisible(), true, 'closing during loading cancels the old timer');
    await choose(page, 'lin');
    check(await page.getByRole('heading', { name: '林舟的手机', exact: true }).count(), 1, 'the selected person has a complete named desktop');
    check(await page.locator('.inspect-owned-content .desktop-app').count(), 1, 'the owner phone exposes only WeChat');
    check(await page.locator('.view-inspect-desktop .desktop-calendar').count(), 0, 'user calendar is not projected into the other phone');
    check(await page.locator('.notification-shade-toggle').isDisabled(), true, 'user notifications are disabled on the owner screen');
    await page.locator('.phone-shell').screenshot({ path: `${evidence}/${prefix}-owner-desktop.png` });
    await wechat(page);
    check(await page.getByLabel('生成条数', { exact: true }).count(), 0, 'natural generation has no count input');
    check(await page.locator('#inspect-owner').count(), 0, 'WeChat has no duplicated owner selector');
    for (const width of [320, 390, 1100]) {
      await page.setViewportSize({ width, height: 844 });
      const sizes = await page.evaluate(() => {
        const root = document.querySelector('.pocket-phone').shadowRoot;
        const button = root.querySelector('[data-action="inspect-refresh"]');
        const svg = button.querySelector('svg');
        return { buttonHeight: button.getBoundingClientRect().height, textSize: getComputedStyle(button).fontSize, iconWidth: svg.getBoundingClientRect().width, overflow: root.querySelector('.phone-main').scrollWidth > root.querySelector('.phone-main').clientWidth };
      });
      check(sizes, { buttonHeight: 26.390625, textSize: '12px', iconWidth: 17, overflow: false }, `compact WeChat controls ${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const realBefore = await page.evaluate(() => JSON.stringify(previewHarness.metadata.pocketPhone.conversations));
    await page.locator('[data-inspect-thread="@user"]').click();
    check(await page.locator('.is-mine').count(), 3, 'actual owner messages are on the right');
    check(await page.locator('.is-theirs').count(), 1, 'actual user messages are on the left');
    await page.locator('[data-inspect-message="m2"]').click();
    check(await page.locator('[data-action="inspect-menu"], [data-action="inspect-delete"]').count(), 0, 'the actual SMS mirror has no delete action');
    check(await page.evaluate(() => JSON.stringify(previewHarness.metadata.pocketPhone.conversations)), realBefore, 'reading preserves real SMS and read flags');
    await back(page); check(await page.locator('.view-inspect-wechat').isVisible(), true, 'chat back reaches WeChat');
    const beforeBatch = await metrics(page);
    await page.evaluate(() => { previewHarness.reply = { conversations: [{ name: '周予', participantIds: ['@owner', 'zhou'], messages: [{ speakerId: '@owner', text: 'PRIVATE_OWNER_FLOW_SENTINEL。' }, { speakerId: 'zhou', text: 'I will bring the book.', translation: '我会把书带上。' }] }] }; });
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.inspectPhone?.owners.lin?.conversations.length === 1);
    check(await metrics(page), { ...beforeBatch, models: beforeBatch.models + 1, metadata: beforeBatch.metadata + 1 }, 'one refresh is one request and one save');
    check(await page.evaluate(() => previewHarness.metadata.pocketPhone.inspectPhone.owners.lin.conversations[0].messages.length), 2, 'all valid natural output is retained');
    await page.locator('.phone-shell').screenshot({ path: `${evidence}/${prefix}-owner-wechat.png` });
    const threadId = await page.evaluate(() => previewHarness.metadata.pocketPhone.inspectPhone.owners.lin.conversations[0].id);
    await page.locator(`[data-inspect-thread="${threadId}"]`).click();
    check(await page.locator('.bilingual-copy').count(), 1, 'the actual shared bilingual bubble renderer is used');
    const deleteId = await page.evaluate(() => previewHarness.metadata.pocketPhone.inspectPhone.owners.lin.conversations[0].messages[0].id);
    await page.locator(`[data-inspect-message="${deleteId}"]`).click();
    await page.getByRole('button', { name: '删除这条短信', exact: true }).click();
    await page.getByRole('dialog', { name: '删除微信记录' }).getByRole('button', { name: '删除', exact: true }).click();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.inspectPhone.owners.lin.conversations[0].messages.length === 1);
    await back(page);
    await page.evaluate(id => { previewHarness.reply = { conversations: [{ id, messages: [{ speakerId: '@owner', text: '第二次追加。' }, { speakerId: 'zhou', text: '承接第二次。' }] }] }; }, threadId);
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.inspectPhone.owners.lin.conversations[0].messages.length === 3);
    const lastRequest = await page.evaluate(() => JSON.parse(previewHarness.requests.at(-1).body.messages[1].content));
    check(lastRequest.history.find(thread => thread.id === threadId).messages.length, 1, 'deleted private records stay absent on continuation');
    const saved = await page.evaluate(() => JSON.stringify(previewHarness.metadata.pocketPhone));
    await page.evaluate(() => { previewHarness.inspectApiFailure = true; });
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '503' }).waitFor();
    check(await page.evaluate(() => JSON.stringify(previewHarness.metadata.pocketPhone)), saved, 'API failures preserve all prior records');
    await page.locator(`[data-inspect-thread="${threadId}"]`).click();
    await home(page);
    check(await page.locator('.inspect-owned-content').isVisible(), true, 'system home stays on the selected person phone');
    await back(page); check(await page.locator('.view-inspect-phone').isVisible(), true, 'owner desktop back reaches person selection');
    await back(page); check(await page.locator('[data-desktop-page="1"]').evaluate(page => !page.inert), true, 'person list back reaches user screen two');

    if (kind === 'native' && mode === 'standalone') {
      await openApp(page, '查手机'); await choose(page, 'lin'); await wechat(page);
      await owners(page);
      const originalContacts = await page.evaluate(() => JSON.stringify(previewHarness.metadata.pocketPhone.contacts));
      const beforeCreate = await metrics(page);
      const firstId = await createOwner(page, '顾宁', '只属于顾宁的资料。');
      await wechat(page);
      check(await page.getByLabel('生成条数', { exact: true }).count(), 0, 'new manual owners have no count input');
      check((await metrics(page)).models, beforeCreate.models, 'manual naming makes no model request');
      await owners(page);
      await page.getByRole('button', { name: '添加人物', exact: true }).click();
      const form = page.getByRole('dialog', { name: '添加手机主人' });
      await form.getByLabel('姓名', { exact: true }).fill('沈鹤');
      await form.getByLabel('人物资料', { exact: true }).fill('另一位真实人物。');
      await page.evaluate(() => { previewHarness.failSave = true; });
      await form.getByRole('button', { name: '保存', exact: true }).click();
      await form.getByRole('alert').waitFor();
      check(await form.getByLabel('姓名', { exact: true }).inputValue(), '沈鹤', 'failed saves retain the exact name draft');
      await form.getByRole('button', { name: '保存', exact: true }).click();
      await page.locator('.inspect-owned-content').waitFor();
      const secondId = await page.evaluate(() => Object.entries(previewHarness.metadata.pocketPhone.inspectPhone.owners).find(([, owner]) => owner.profile?.name === '沈鹤')[0]);
      check(firstId !== secondId, true, 'one simulator card contains two explicit stable phone owners');
      check(await page.evaluate(() => JSON.stringify(previewHarness.metadata.pocketPhone.contacts)), originalContacts, 'manual owners stay outside the ordinary address book');
      await owners(page);
      await page.evaluate(() => { previewHarness.metadata.pocketPhone.inspectPhone.owners['card:simulator.png'] = { people: [], count: 31, conversations: [{ id: 'legacy-thread', name: '周予', participantIds: ['@owner', 'zhou'], messages: [{ id: 'legacy-message', role: 'user', speakerId: '@owner', text: 'OLD_OWNER_SENTINEL。' }] }] }; previewHarness.app.open(); });
      await choose(page, 'card:simulator.png'); await wechat(page);
      check(await page.getByRole('button', { name: '刷新', exact: true }).isDisabled(), true, 'an unnamed legacy record cannot generate as a card title');
      await page.getByRole('button', { name: '指定主人', exact: true }).click();
      const rename = page.getByRole('dialog', { name: '指定手机主人' });
      check(await rename.getByLabel('人物资料', { exact: true }).inputValue(), '', 'the card setting is not prefilled as a real person profile');
      await rename.getByLabel('姓名', { exact: true }).fill('历史人物');
      await rename.getByRole('button', { name: '保存', exact: true }).click();
      await page.waitForFunction(() => previewHarness.metadata.pocketPhone.inspectPhone.owners['card:simulator.png'].profile?.name === '历史人物');
      check(await page.getByLabel('生成条数', { exact: true }).count(), 0, 'legacy counts do not restore a quantity control');
      check(await page.evaluate(() => previewHarness.metadata.pocketPhone.inspectPhone.owners['card:simulator.png'].conversations[0].messages[0].text), 'OLD_OWNER_SENTINEL。', 'legacy history remains on its original exact key');
    }

    await openApp(page, '短信'); await page.locator('[data-contact="lin"]').click();
    const beforeIncoming = (await metrics(page)).models;
    await page.evaluate(() => { previewHarness.reply = { messages: [{ text: 'USER_NOTICE_SENTINEL。' }] }; previewHarness.replyWait = new Promise(resolve => { previewHarness.releaseReply = resolve; }); });
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.waitForFunction(value => previewHarness.requests.length > value, beforeIncoming);
    await openApp(page, '查手机'); await choose(page, 'lin');
    await page.evaluate(() => { previewHarness.replyWait = null; previewHarness.releaseReply(); });
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.conversations.lin.some(message => message.text === 'USER_NOTICE_SENTINEL。'));
    check(await page.locator('[data-action="open-phone-notice"]').count(), 0, 'user incoming toasts do not appear on the other phone');
    check(await page.locator('.notification-shade-toggle').isDisabled(), true, 'the user notification shade cannot open in the other phone');
    check((await page.locator('.inspect-owned-content').textContent()).includes('USER_NOTICE_SENTINEL'), false, 'user message text is not rendered on the other desktop');
    await page.evaluate(() => { previewHarness.metadata.pocketPhone.theme = 'night'; previewHarness.app.open(); });
    await page.locator('.phone-shell').screenshot({ path: `${evidence}/${prefix}-owner-night.png` });
    await owners(page);
    state.failMedia = true;
    const beforeError = await metrics(page);
    await choose(page, 'zhou');
    check(await metrics(page), beforeError, 'missing animation media still opens the correct owner desktop without a save or model call');
    check(await page.getByRole('heading', { name: '周予的手机', exact: true }).count(), 1, 'media failure retains the selected owner');
    await owners(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('[data-inspect-owner="lin"]').click();
    await page.locator('.inspect-loading img').waitFor();
    check(new URL(await page.locator('.inspect-loading img').getAttribute('src')).pathname.endsWith('/still-night.png'), true, 'reduced motion follows the current night theme');
    const beforeDispose = await metrics(page);
    await page.evaluate(() => previewHarness.app.dispose());
    await page.waitForTimeout(2300);
    check(await page.locator('.pocket-phone').count(), 0, 'dispose clears the owner loading view and timer');
    check(await metrics(page), beforeDispose, 'dispose and reduced motion do not generate or save');
    check(state.errors, [], `${prefix} browser errors`);
    await page.close(); console.log(`${prefix} passed`);
  }
  console.log(`inspect browser ${assertions} assertions passed`);
} finally { await browser.close(); }
