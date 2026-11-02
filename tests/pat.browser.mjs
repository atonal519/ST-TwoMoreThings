import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { openApp } from './navigation.mjs';

const { chromium } = await import(process.env.POCKET_PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(import.meta.dirname, '..'), prefix = '/scripts/extensions/third-party/ST-PocketPhone/';
const output = process.env.POCKET_BROWSER_OUTPUT || mkdtempSync(resolve(tmpdir(), 'tmt-pat-'));
mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const browser = await chromium.launch({ ...(process.env.POCKET_CHROMIUM_PATH ? { executablePath: process.env.POCKET_CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
const results = [];
try {
  for (const host of ['native', 'luker']) for (const [width, theme] of [[390, 'day'], [320, 'night']]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(6000);
    const errors = [], unexpected = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      if (url.hostname === '127.0.0.1' && path.startsWith(prefix)) {
        const file = resolve(root, decodeURIComponent(path.slice(prefix.length)));
        if (file === resolve(root, 'tests/preview.js')) return route.fulfill({ contentType: 'text/javascript', body: readFileSync(file, 'utf8')
          .replace('const settings = {', "const settings = { pocketPhone: { fontCssUrl: '', apiSourceRef: { kind: 'shared-preset', presetId: 'daily' } },")
          .replace("'schedule-planner': {", "'schedule-planner': { processingPrompt: 'Fixture processing prompt', bodyWrappers: { keepTags: 'content', extraTags: '' },") });
        if (file === resolve(root, 'index.js') && process.env.POCKET_PAT_SOURCE) return route.fulfill({ contentType: 'text/javascript', body: "export { initialize } from './src/runtime.js';" });
        if (existsSync(file)) return route.fulfill({ path: file, contentType: mime[extname(file)] || 'application/octet-stream' });
      }
      if (path === '/scripts/extensions.js') return route.fulfill({ contentType: 'text/javascript', body: "export const extensionTypes={'third-party/ST-PocketPhone':'local'};" });
      if (path === '/api/extensions/version') return route.fulfill({ json: { currentBranchName: 'main', currentCommitHash: 'a'.repeat(40), remoteUrl: 'https://github.com/fixture/phone', isUpToDate: true } });
      unexpected.push(url.href); return route.abort();
    });
    await page.goto(`http://127.0.0.1:8917${prefix}tests/preview.html?host=${host}&group=1&clock=story`);
    await page.locator('.phone-shell').waitFor();
    await page.evaluate(theme => {
      const h = previewHarness, state = h.metadata.pocketPhone, batch = state.conversations.lin[0].batch;
      state.theme = theme; state.userProfile = { name: '我' };
      state.conversations.lin = [{ id: 'private-a', role: 'assistant', text: '前一句。', batch }, { id: 'private-m', role: 'user', text: '我到了。', batch }];
      state.conversations['preview-friends'] = [{ id: 'g-a', role: 'assistant', speakerId: 'lin', text: '书店见。', batch }, { id: 'g-b', role: 'assistant', speakerId: 'zhou', text: '我也快到了。', batch }, { id: 'g-m', role: 'user', speakerId: '@user', text: '好。', batch }];
      h.app.open();
    }, theme);
    await openApp(page, '短信'); await page.locator('[data-contact="lin"]').click();
    const draft = page.locator('#sms-draft'), phone = page.locator('.pocket-phone'), shell = page.locator('.phone-shell');
    const counters = () => page.evaluate(() => ({ requests: previewHarness.requests.length, saves: previewHarness.metadataSaves }));
    await draft.fill('准备好的草稿保留'); await draft.focus(); await draft.evaluate(n => { n.setSelectionRange(2, 5, 'backward'); window.originalDraft = n; window.editorBlur = 0; n.addEventListener('blur', () => editorBlur++); });
    const privateAvatar = page.locator('[data-pat-target="lin"]').first();
    assert.equal(await privateAvatar.count(), 1, '消息头像应接入拍一拍');
    // Both recognized double clicks must reach the existing save queue while the first save waits.
    const slowMark = await counters();
    await page.evaluate(() => { const h = previewHarness; h.saveWait = new Promise(resolve => { h.releasePatSave = resolve; }); });
    await privateAvatar.dblclick(); await privateAvatar.dblclick();
    await page.evaluate(() => { previewHarness.releasePatSave(); previewHarness.saveWait = null; });
    await page.waitForFunction(saves => previewHarness.metadataSaves === saves + 2, slowMark.saves);
    assert.deepEqual(await page.evaluate(() => previewHarness.metadata.pocketPhone.conversations.lin.filter(m => m.type === 'pat')), [], '慢保存期间连续两次双击应新增后撤回');
    assert.equal((await counters()).requests, slowMark.requests);
    const before = await counters();
    await privateAvatar.dblclick();
    await page.locator('.pat-message').filter({ hasText: '你拍了拍林舟' }).waitFor();
    assert.deepEqual(await counters(), { requests: before.requests, saves: before.saves + 1 });
    assert.deepEqual(await draft.evaluate(n => ({ same: n === originalDraft, active: n.getRootNode().activeElement === n, text: n.value, start: n.selectionStart, end: n.selectionEnd, direction: n.selectionDirection, blur: editorBlur })), { same: true, active: true, text: '准备好的草稿保留', start: 2, end: 5, direction: 'backward', blur: 0 });
    const ownPat = page.locator('.pat-row').first();
    await ownPat.locator('.pat-message').click();
    assert.equal(await ownPat.locator('[data-action="delete-message"],[data-action="reply-message"]').count(), 0);
    await ownPat.locator('[data-action="favorite-add"]').click();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.favorites?.length === 1);
    const favorite = await page.evaluate(() => structuredClone(previewHarness.metadata.pocketPhone.favorites[0]));
    await privateAvatar.dblclick(); await page.waitForFunction(() => !previewHarness.metadata.pocketPhone.conversations.lin.some(m => m.type === 'pat'));
    assert.deepEqual(await page.evaluate(() => previewHarness.metadata.pocketPhone.favorites[0]), favorite, '撤回后仍保留当时的收藏副本和来源');
    await privateAvatar.dblclick(); await page.locator('.pat-message').filter({ hasText: '你拍了拍林舟' }).waitFor();
    await page.locator('[data-pat-target="@user"]').dblclick(); await page.locator('.pat-message').filter({ hasText: '你拍了拍自己' }).waitFor();
    await page.locator('[data-pat-target="@user"]').dblclick(); await page.waitForFunction(() => !previewHarness.metadata.pocketPhone.conversations.lin.some(m => m.pat?.targetId === '@user'));
    await page.locator('[data-pat-target="@user"]').dblclick(); await page.locator('.pat-message').filter({ hasText: '你拍了拍自己' }).waitFor();
    const zoomBefore = await page.evaluate(() => visualViewport.scale);
    await privateAvatar.tap(); await privateAvatar.tap();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.conversations.lin.filter(m => m.type === 'pat').length === 3);
    assert.equal(await page.evaluate(() => visualViewport.scale), zoomBefore);
    await shell.screenshot({ path: `${output}/pat-private-${host}-${theme}-${width}.png` });
    await page.locator('[data-action="back-inbox"]').click(); await page.locator('[data-group="preview-friends"]').click();
    const groupAvatar = () => page.locator('[data-pat-target="lin"]').first();
    await draft.fill('新的草稿内容'); await draft.focus(); await draft.evaluate(n => n.setSelectionRange(1, 3));
    await groupAvatar().click();
    await draft.evaluate(n => n.setSelectionRange(4, 5));
    await page.waitForFunction(() => document.querySelector('.pocket-phone').shadowRoot.querySelector('#sms-draft').value.includes('@林舟'));
    assert.equal(await draft.inputValue(), '新的草稿@林舟 容', '单击确认使用当前选区');
    await draft.fill('多人提及'); await draft.focus(); await draft.evaluate(n => n.setSelectionRange(n.value.length, n.value.length));
    const mentionMark = await counters();
    await groupAvatar().click(); await page.locator('[data-pat-target="zhou"]').click();
    await page.waitForFunction(() => document.querySelector('.pocket-phone').shadowRoot.querySelector('#sms-draft').value.includes('@周予'));
    assert.equal(await draft.inputValue(), '多人提及@林舟 @周予 ', '不同头像的连续单击按点击顺序提及两人');
    assert.deepEqual(await counters(), mentionMark, '多人提及不保存也不发模型');
    await draft.fill('双击保留这份草稿'); await draft.focus(); await draft.evaluate(n => n.setSelectionRange(2, 4));
    let mark = await counters();
    await groupAvatar().dblclick(); await page.locator('.pat-message').filter({ hasText: '你拍了拍林舟' }).waitFor();
    assert.equal(await draft.inputValue(), '双击保留这份草稿');
    assert.deepEqual(await counters(), { requests: mark.requests, saves: mark.saves + 1 });
    await page.waitForTimeout(340); assert.equal((await draft.inputValue()).includes('@'), false);
    await groupAvatar().tap(); await groupAvatar().tap();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.conversations['preview-friends'].filter(m => m.type === 'pat').length === 0);
    assert.equal((await draft.inputValue()).includes('@'), false);

    // One pending click survives a same-route redraw by account ID, not old avatar DOM.
    await groupAvatar().click(); await page.evaluate(() => previewHarness.app.open()); await groupAvatar().click();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.conversations['preview-friends'].filter(m => m.type === 'pat').length === 1);
    assert.equal((await draft.inputValue()).includes('@'), false);
    // Native Chromium composition remains connected while a pat saves and redraws.
    await draft.fill('中文输入：'); await draft.focus();
    const ime = await page.context().newCDPSession(page);
    await draft.evaluate(n => { window.imeNode = n; window.imeEvents = []; for (const kind of ['compositionstart', 'compositionend', 'blur']) n.addEventListener(kind, () => imeEvents.push(kind)); });
    await ime.send('Input.imeSetComposition', { text: 'zhou', selectionStart: 4, selectionEnd: 4 });
    const composing = await draft.inputValue();
    await groupAvatar().dblclick();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.conversations['preview-friends'].filter(m => m.type === 'pat').length === 0);
    assert.equal(await draft.inputValue(), composing); assert.deepEqual(await page.evaluate(() => imeEvents), ['compositionstart']);
    assert.equal(await draft.evaluate(n => n === imeNode && n.isConnected && n.getRootNode().activeElement === n), true);
    // Successive single-click mentions wait for compositionend in click order.
    await groupAvatar().click(); await page.locator('[data-pat-target="zhou"]').click(); await page.waitForTimeout(340); assert.equal(await draft.inputValue(), composing);
    await ime.send('Input.imeSetComposition', { text: '周末', selectionStart: 2, selectionEnd: 2 }); await ime.send('Input.insertText', { text: '周末' });
    await page.waitForFunction(() => document.querySelector('.pocket-phone').shadowRoot.querySelector('#sms-draft').value.includes('@林舟'));
    assert.equal(await draft.inputValue(), '中文输入：周末@林舟 @周予 '); assert.deepEqual(await page.evaluate(() => imeEvents), ['compositionstart', 'compositionend']); await ime.detach();
    // A confirmed mention survives another person's double click during composition.
    await draft.fill('组字期间'); await draft.focus();
    const mixedIme = await page.context().newCDPSession(page);
    await mixedIme.send('Input.imeSetComposition', { text: 'zhong', selectionStart: 5, selectionEnd: 5 });
    await groupAvatar().click(); await page.waitForTimeout(340);
    await page.locator('[data-pat-target="zhou"]').dblclick();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.conversations['preview-friends'].filter(m => m.type === 'pat').length === 1);
    await mixedIme.send('Input.insertText', { text: '中' });
    await page.waitForFunction(() => document.querySelector('.pocket-phone').shadowRoot.querySelector('#sms-draft').value.includes('@林舟'));
    assert.equal(await draft.inputValue(), '组字期间中@林舟 '); await mixedIme.detach();
    await draft.fill('键盘提及'); await draft.evaluate(n => n.setSelectionRange(n.value.length, n.value.length));
    await groupAvatar().focus(); await page.keyboard.press('Enter'); assert.equal(await draft.inputValue(), '键盘提及@林舟 ');
    await page.locator('[data-pat-target="@user"]').dblclick();
    await page.locator('.pat-message').filter({ hasText: '你拍了拍自己' }).waitFor();
    assert.equal(await draft.inputValue(), '键盘提及@林舟 ');

    // Reply in the existing single request, without clearing a newer draft.
    await page.evaluate(() => { const h = previewHarness; h.replyWait = new Promise(resolve => { h.releaseReply = resolve; }); h.reply = { anchor: { memberIds: ['lin', 'zhou', '@user'], speakerIds: ['lin'] }, messages: [{ speakerId: 'lin', text: '前面的短信。' }, { speakerId: 'lin', type: 'pat', pat: { targetId: '@user' }, text: 'Lin gave you a gentle pat to remind you to bring the book.', translation: '林舟轻轻拍了拍你，提醒你别忘了带上那本约好的书' }, { speakerId: 'lin', text: '后面的短信。' }] }; });
    mark = await counters(); await page.locator('[data-action="continue"]').click();
    await draft.fill('等回复时写的新草稿'); await draft.focus(); await draft.evaluate(n => { n.setSelectionRange(3, 7, 'backward'); window.waitingDraft = n; });
    await groupAvatar().dblclick();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.conversations['preview-friends'].filter(m => m.type === 'pat').length === 3);
    await page.evaluate(() => { previewHarness.releaseReply(); previewHarness.replyWait = null; });
    await page.locator('.pat-message').filter({ hasText: '林舟轻轻拍了拍你' }).waitFor();
    assert.deepEqual(await counters(), { requests: mark.requests + 1, saves: mark.saves + 2 });
    assert.deepEqual(await draft.evaluate(n => ({ same: n === waitingDraft, active: n.getRootNode().activeElement === n, text: n.value, start: n.selectionStart, end: n.selectionEnd, direction: n.selectionDirection })), { same: true, active: true, text: '等回复时写的新草稿', start: 3, end: 7, direction: 'backward' });
    const pat = page.locator('.pat-row').last();
    assert.equal(await pat.locator('.avatar,.bubble').count(), 0);
    assert.equal(await pat.locator('.message-original').evaluate(n => getComputedStyle(n).userSelect), 'text');
    assert.equal(await pat.evaluate(n => n.previousElementSibling.classList.contains('grouped-bottom') || n.nextElementSibling.classList.contains('grouped-top')), false);
    await pat.locator('.pat-message').click(); assert.equal(await pat.locator('[data-action="reply-message"],[data-action="delete-message"]').count(), 0);
    assert.equal(await pat.locator('[data-action="favorite-add"]').count(), 1);
    const geometry = await pat.locator('.message-actions').evaluate(n => { const b = n.getBoundingClientRect(), feed = n.closest('.message-feed').getBoundingClientRect(); return { left: b.left, right: b.right, feedLeft: feed.left, feedRight: feed.right }; });
    assert.ok(geometry.left >= geometry.feedLeft && geometry.right <= geometry.feedRight, '窄屏收藏侧浮按钮可见');
    await shell.screenshot({ path: `${output}/pat-group-selected-${host}-${theme}-${width}.png` });
    await pat.locator('[data-action="favorite-add"]').click(); await page.waitForFunction(() => previewHarness.metadata.pocketPhone.favorites.length === 2);
    assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.conversations['preview-friends'].filter(m => m.role === 'assistant' && m.type === 'pat').length), 1);
    assert.equal(await page.locator('.bubble').filter({ hasText: '后面的短信。' }).count(), 1);

    // A pending single click must not cross phone navigation, close/reopen or host chat changes.
    await draft.fill('导航原草稿'); await groupAvatar().click(); await page.locator('[data-action="back-inbox"]').click(); await page.locator('[data-contact="lin"]').click();
    await page.waitForTimeout(340); assert.equal((await draft.inputValue()).includes('@'), false);
    await page.locator('[data-action="back-inbox"]').click(); await page.locator('[data-group="preview-friends"]').click();
    await groupAvatar().click(); await page.evaluate(() => previewHarness.app.dispose()); await page.waitForTimeout(340); assert.equal(await phone.count(), 0);
    // Re-initialize reads the same saved records; no history migration or generation.
    await page.evaluate(async prefix => { const { initialize } = await import(prefix + 'index.js'); const { createHostAdapter } = await import(prefix + 'src/host.js'); const h = previewHarness; h.app = initialize({ host: createHostAdapter({ contextProvider: () => h.context, fetchImpl: async () => Response.json({ isUpToDate: true }) }), documentRef: document, qqjBridgeProvider: () => null }); h.app.open(); }, prefix);
    await openApp(page, '短信'); await page.locator('[data-group="preview-friends"]').click(); assert.equal(await page.locator('.pat-row').count(), 4);
    await draft.fill('导航原草稿');
    await groupAvatar().click(); await page.locator('[data-action="close"]').click(); await page.waitForTimeout(340); await page.evaluate(() => previewHarness.app.open()); await openApp(page, '短信'); await page.locator('[data-group="preview-friends"]').click(); assert.equal(await draft.inputValue(), '导航原草稿');
    await groupAvatar().click();
    await page.evaluate(async () => { const h = previewHarness; window.oldPatMetadata = h.metadata; h.context.chatId = 'another-host-chat'; h.metadata = { pocketPhone: structuredClone(h.metadata.pocketPhone) }; h.context.chatMetadata = h.metadata; await h.context.eventSource.emit('chat-changed'); });
    await page.waitForTimeout(340); assert.equal((await draft.inputValue()).includes('@'), false, '宿主换聊取消待提及');
    const switched = await page.evaluate(() => ({ old: JSON.stringify(oldPatMetadata), current: JSON.stringify(previewHarness.metadata), saves: previewHarness.metadataSaves }));
    await groupAvatar().dblclick(); await page.waitForTimeout(340);
    assert.deepEqual(await page.evaluate(before => ({ oldUnchanged: JSON.stringify(oldPatMetadata) === before.old, currentUnchanged: JSON.stringify(previewHarness.metadata) === before.current, saves: previewHarness.metadataSaves }), switched), { oldUnchanged: true, currentUnchanged: true, saves: switched.saves }, '换宿主chat后旧DOM的新双击不写A或B，也不调用宿主保存');
    await page.evaluate(() => previewHarness.app.open()); await openApp(page, '短信'); await page.locator('[data-group="preview-friends"]').click(); assert.equal((await draft.inputValue()).includes('@'), false);

    // Current and historical events keep favorite as their only per-message action.
    await page.evaluate(() => { previewHarness.mainMessages.push({ is_user: false, mes: '第二天。<!-- QQJ-end | date=大陆历1686年10月5日 | time=08:00 -->' }); previewHarness.app.open(); });
    await page.locator('[data-action="history"]').click(); assert.equal(await page.locator('.past-batch .pat-row').count(), 4);
    await page.locator('.past-batch .pat-message').first().click(); assert.equal(await page.locator('.past-batch .message-actions [data-action="delete-message"]').count(), 0); assert.equal(await page.locator('.past-batch .message-actions [data-action="favorite-add"],[data-action="favorite-open"]').count(), 1); assert.equal(await page.locator('.past-batch .message-actions [data-action="reply-message"]').count(), 0);
    await shell.screenshot({ path: `${output}/pat-history-${host}-${theme}-${width}.png` });
    if (host === 'native' && width === 390) {
      await page.setViewportSize({ width: 1180, height: 900 });
      await shell.screenshot({ path: `${output}/pat-history-desktop-360-600.png` });
    }
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    results.push({ host, width, theme, desktopDoubleClick: true, touchDoubleTap: true, noZoom: true, zeroLocalModel: true, preservesDraftSelectionAndIME: true, singleMentionUsesCurrentSelection: true, lifecycleCancellation: true, slowSaveToggle: true, permanentFavoriteAfterWithdrawal: true, favoriteOnlyCurrentAndHistory: true, geometry, errors, unexpected });
    console.log(`${host} ${theme} ${width}: passed`); await page.close();
  }
  writeFileSync(`${output}/pat-browser-results.json`, JSON.stringify({ browser: browser.version(), source: Boolean(process.env.POCKET_PAT_SOURCE), results }, null, 2) + '\n');
  console.log(`Pat browser artifacts: ${output}`);
} finally { await browser.close(); }
