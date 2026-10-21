import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const output = '/home/admin/sillytavern/data/codex-private/tmt-todos';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
try {
  for (const host of ['native', 'luker']) for (const [width, theme] of [[320, 'day'], [390, 'night']]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__font/*', route => {
      const name = basename(new URL(route.request().url()).pathname), candidate = '/tmp/mobile-plugin-reference-research/preview-fonts/' + name;
      return route.fulfill({ path: existsSync(candidate) ? candidate : '/tmp/myriad-home-design-20261016/' + name, contentType: 'font/woff2' });
    });
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${host}&group=1&clock=story`);
    await page.locator('.phone-shell').waitFor();
    const fontCss = readFileSync('/tmp/mobile-plugin-reference-research/preview-fonts.css', 'utf8').replaceAll('Nowar Rounded TW Wc', 'PocketPreviewCJK');
    await page.evaluate(({ css, theme }) => {
      const face = document.createElement('style'); face.textContent = css; document.head.append(face);
      const style = document.createElement('style'); style.textContent = ':host{font-family:PocketPreviewCJK,sans-serif}'; document.querySelector('.pocket-phone').shadowRoot.append(style);
      previewHarness.metadata.pocketPhone.theme = theme; previewHarness.app.open();
    }, { css: fontCss, theme });
    await page.evaluate(async () => { await document.fonts.load('14px PocketPreviewCJK', '短信引用待办林舟收到'); await document.fonts.ready; });
    await page.getByRole('button', { name: '进入桌面', exact: true }).click();
    await page.getByRole('button', { name: '短信', exact: true }).click();
    await page.locator('[data-group="preview-friends"]').click();
    await page.evaluate(() => { previewHarness.reply = { anchor: { memberIds: ['lin', 'zhou', '@user'], speakerIds: ['lin'] }, messages: [
      { speakerId: 'lin', text: '@林舟提醒你明晚见面 😊 ' + '请带上之前约好的那本书。'.repeat(5), translation: '@我也记下这个约定。' },
      { speakerId: 'lin', text: '时间不变。' },
    ] }; });
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.locator('.message-mention').first().waitFor();
    assert.equal(await page.locator('.message-mention').count(), 2, 'original and translation mentions are both highlighted');
    assert.equal(await page.locator('.mention-avatar').nth(1).isVisible(), false, 'consecutive sender avatars stay hidden');
    const draft = page.getByRole('textbox', { name: '短信内容', exact: true });
    await draft.fill('前半 后半');
    await draft.evaluate(input => input.setSelectionRange(3, 3));
    await page.locator('.mention-avatar[data-mention-id="lin"]').first().click();
    assert.equal(await draft.inputValue(), '前半 @林舟 后半');
    assert.equal(await draft.evaluate(input => input.getRootNode().activeElement === input), true);
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 1, 'mentioning is local only');
    const sourceId = await page.evaluate(() => previewHarness.metadata.pocketPhone.conversations['preview-friends'][0].id);
    const sourceBox = await page.locator('.bubble[data-message]').first().boundingBox();
    await page.locator('[data-message]').first().click();
    assert.deepEqual(await page.locator('.bubble[data-message]').first().boundingBox(), sourceBox, 'opening the action menu keeps the bubble in place');
    assert.equal(await page.getByRole('group', { name: '短信操作', exact: true }).count(), 1);
    const shell = await page.locator('.phone-shell').boundingBox();
    for (const label of ['引用', '删除这条短信']) {
      const box = await page.getByRole('button', { name: label, exact: true }).boundingBox();
      assert.ok(box.x >= shell.x && box.x + box.width <= shell.x + shell.width, `${label} remains inside the phone at ${width}px`);
    }
    await page.locator('.phone-shell').screenshot({ path: `${output}/group-message-menu-${host}-${theme}-${width}.png` });
    const draftNode = await draft.elementHandle();
    await draft.click();
    assert.equal(await page.locator('.message-actions').count(), 0, 'clicking outside closes the whole message menu');
    assert.equal(await draft.evaluate((node, previous) => node === previous, draftNode), true, 'closing the menu preserves the input node');
    await page.locator('[data-message]').first().click();
    await page.getByRole('button', { name: '引用', exact: true }).click();
    await page.locator('.reply-preview').waitFor();
    await page.getByRole('button', { name: '取消引用', exact: true }).click();
    assert.equal(await draft.inputValue(), '前半 @林舟 后半', 'canceling a quote preserves the SMS draft');
    await page.locator('[data-message]').first().click();
    await page.getByRole('button', { name: '引用', exact: true }).click();
    await page.locator('.reply-preview').waitFor();
    await page.locator('.phone-shell').screenshot({ path: `${output}/group-quote-${host}-${theme}-${width}.png` });
    await draft.fill('收到');
    await page.evaluate(() => { previewHarness.failSave = true; });
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await draft.inputValue(), '收到');
    assert.equal(await page.locator('.reply-preview').isVisible(), true, 'failed save preserves the quote');
    assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.conversations['preview-friends'].length), 2);
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await page.locator('.is-mine .message-reply').waitFor();
    assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.conversations['preview-friends'].at(-1).replyToId), sourceId);
    assert.equal(await page.locator('.reply-preview').count(), 0);
    assert.equal(await draft.inputValue(), '');
    await page.locator('.is-mine .bubble[data-message]').click();
    assert.equal(await page.locator('.is-mine .message-actions').evaluate(menu => {
      const box = menu.getBoundingClientRect(), bubble = menu.closest('.bubble-line').querySelector('.bubble').getBoundingClientRect(), feed = menu.closest('.message-feed').getBoundingClientRect();
      return box.right <= bubble.left && box.left >= feed.left;
    }), true, 'own-message menu opens toward the middle of the phone');
    await draft.click();
    await page.evaluate(() => { previewHarness.reply = { anchor: { memberIds: ['lin', 'zhou', '@user'], speakerIds: [] }, messages: [] }; });
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.waitForFunction(() => previewHarness.requests.length === 2);
    const quoted = await page.evaluate(() => JSON.parse(previewHarness.requests.at(-1).body.messages[1].content).history.at(-1).replyTo);
    assert.equal(quoted.messageId, sourceId);
    assert.equal(quoted.speakerId, 'lin');
    assert.ok(quoted.messageText.includes('明晚见面'));
    await page.locator('[data-message]').first().click();
    await page.getByRole('button', { name: '删除这条短信', exact: true }).click();
    await page.locator('.message-reply.is-missing').getByText('原消息已删除', { exact: true }).waitFor();
    assert.equal(await page.locator('.chat-stage').evaluate(node => node.scrollWidth <= node.clientWidth), true);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Native/Luker 320-day/390-night: mentions and emoji, avatar insertion at caret, grouped avatars, quote/cancel/send/failure retention, real model context, deleted sources and action bounds passed. Mock hosts/models only.');
} finally { await browser.close(); }
