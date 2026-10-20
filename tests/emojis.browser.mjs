import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { openApp } from './navigation.mjs';
const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const output = '/tmp/mobile-plugin-reference-research/blob-inline'; mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
try {
  for (const kind of ['native', 'luker']) for (const width of [320, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(8000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${kind}&clock=story`);
    await page.locator('.phone-shell').waitFor();
    await page.evaluate(() => {
      const state = previewHarness.metadata.pocketPhone, batch = state.conversations.lin[0].batch;
      state.conversations.lin = [
        { id: 'old-emoji', role: 'assistant', text: '旧消息里也能显示。[合十] 😀', translation: 'An old message. 🙏', batch },
        { id: 'past-emoji', role: 'assistant', text: '过去的消息。[微笑]', batch: { key: 'past', label: '过去' } },
      ];
      state.groups = [{ id: 'friends', name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: true }];
      state.conversations.friends = [{ id: 'group-emoji', role: 'assistant', speakerId: 'zhou', text: '群聊。[合十] [备注]', batch }];
    });
    await openApp(page, '短信');
    await page.locator('[data-contact="lin"]').click();
    assert.equal(await page.locator('.message-feed .inline-emoji').count(), 3, 'existing private messages and translations render small Blob images');
    assert.equal(await page.evaluate(() => previewHarness.metadataSaves), 0, 'reading old messages does not migrate or rewrite them');
    await page.getByRole('button', { name: '查看过去', exact: true }).click();
    assert.equal(await page.locator('.past-batch .inline-emoji').count(), 1);
    const draft = page.getByRole('textbox', { name: '短信内容', exact: true });
    await draft.fill('甲乙');
    await draft.evaluate(field => field.setSelectionRange(1, 1));
    await page.getByRole('button', { name: '添加消息', exact: true }).click();
    await page.getByRole('button', { name: '表情', exact: true }).click();
    assert.equal(await page.getByRole('tab', { name: '小表情', exact: true }).getAttribute('aria-selected'), 'true');
    await page.getByRole('button', { name: '插入表情：合十', exact: true }).click();
    assert.equal(await page.getByRole('tab', { name: '小表情', exact: true }).evaluate(button => {
      const box = button.getBoundingClientRect(), panel = button.closest('.attachment-panel').getBoundingClientRect();
      return box.top >= panel.top && box.bottom <= panel.bottom;
    }), true, 'scrolling through the full catalog keeps pack tabs reachable');
    assert.equal(await draft.inputValue(), '甲🙏乙', 'small emoji is inserted at the original cursor, not sent as a sticker');
    assert.equal(await page.evaluate(() => previewHarness.metadataSaves), 0);
    await page.getByRole('button', { name: '收起附件', exact: true }).click();
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.conversations.lin.at(-1)?.text === '甲🙏乙');
    assert.equal(await page.locator('.is-mine .inline-emoji').count(), 1);
    assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.conversations.lin.at(-1).type), undefined);
    await page.evaluate(() => { previewHarness.reply = { messages: [{ text: '好呀。[合十] 🥺' }] }; });
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.conversations.lin.at(-1)?.text === '好呀。[合十] 🥺');
    const request = await page.evaluate(() => JSON.parse(previewHarness.requests.at(-1).body.messages[1].content));
    assert.ok(request.emojis.includes('合十'));
    const decoded = await page.evaluate(async () => {
      const { blobEmojis } = await import('../src/emojis.js');
      await Promise.all(blobEmojis.map(emoji => new Promise((resolve, reject) => {
        const image = new Image(); image.onload = resolve; image.onerror = () => reject(Error(emoji.code)); image.src = emoji.src;
      })));
      return blobEmojis.length;
    });
    assert.ok(decoded >= 220, 'every catalog asset actually decodes');
    await openApp(page, '短信'); await page.locator('[data-group="friends"]').click();
    assert.equal(await page.locator('.message-feed .inline-emoji').count(), 1);
    assert.ok((await page.getByRole('log').textContent()).includes('[备注]'));
    await page.route('**/__font/*.woff2', route => { const name = basename(new URL(route.request().url()).pathname), path = '/tmp/mobile-plugin-reference-research/preview-fonts/' + name; return route.fulfill({ path: existsSync(path) ? path : '/tmp/myriad-home-design-20261016/' + name, contentType: 'font/woff2' }); });
    const css = readFileSync('/tmp/mobile-plugin-reference-research/preview-fonts.css', 'utf8').replaceAll('Nowar Rounded TW Wc', 'PocketPreviewCJK');
    await page.evaluate(async css => {
      const fonts = document.createElement('style'); fonts.textContent = css; document.head.append(fonts);
      const style = document.createElement('style'); style.textContent = ':host{font-family:PocketPreviewCJK,sans-serif}'; document.querySelector('.pocket-phone').shadowRoot.append(style);
      await document.fonts.load('15px PocketPreviewCJK', '小表情合十开心微笑群聊备注朋友返回'); await document.fonts.ready;
    }, css);
    const sizes = await page.locator('.inline-emoji').evaluateAll(images => images.map(image => ({ width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height, loaded: image.complete && image.naturalWidth > 0 })));
    assert.ok(sizes.every(size => size.loaded && size.width <= 24 && size.height <= 24), 'inline emoji follows text size, not the 104px sticker size');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('.phone-shell').screenshot({ path: `${output}/${kind}-${width}-chat.png` });
    await page.getByRole('button', { name: '添加消息', exact: true }).click(); await page.getByRole('button', { name: '表情', exact: true }).click();
    await page.locator('.phone-shell').screenshot({ path: `${output}/${kind}-${width}-picker.png` });
    await page.getByRole('tab', { name: 'Blob Emoji', exact: true }).click();
    await page.getByRole('button', { name: '发送表情：开心', exact: true }).click();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.conversations.friends.at(-1)?.type === 'sticker');
    assert.equal(await page.locator('.sticker-message img').last().evaluate(image => image.getBoundingClientRect().width), 104, 'large Blob stickers stay large');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Blob inline emoji: native/Luker 320/390, old/private/group messages, bilingual text, real asset decode, cursor insertion and separate large stickers passed. Simulated hosts only.');
} finally { await browser.close(); }
