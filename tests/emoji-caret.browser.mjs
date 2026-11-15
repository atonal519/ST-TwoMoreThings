import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApp } from './navigation.mjs';

const { chromium } = createRequire(process.env.POCKET_PLAYWRIGHT_PACKAGE || '/tmp/st-tools-browser/package.json')('playwright-core');
const output = resolve(process.env.EMOJI_EVIDENCE || '/tmp/emoji-caret-evidence');
mkdirSync(output, { recursive: true });
const url = new URL(process.env.POCKET_PREVIEW_URL || 'http://127.0.0.1:8944/tests/preview.html?group=1');
const browser = await chromium.launch({ executablePath: process.env.POCKET_CHROMIUM, args: ['--no-sandbox'] });
let checks = 0;
const results = [];
const check = (value, expected, message) => { assert.deepEqual(value, expected, message); checks++; };
const metrics = page => page.evaluate(() => ({ models: previewHarness.requests.length, saves: previewHarness.metadataSaves, settings: previewHarness.settingsSaves }));
try {
  for (const touch of [false, true]) for (const group of [false, true]) {
    const page = await browser.newPage({ viewport: { width: touch ? 390 : 1100, height: 844 }, isMobile: touch, hasTouch: touch });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const activate = locator => touch ? locator.tap() : locator.click();
    await page.route('**/*', async route => {
      const target = new URL(route.request().url());
      if (target.origin !== url.origin) return route.abort();
      if (process.env.EMOJI_SOURCE === '1' && target.pathname.endsWith('/index.js')) {
        const response = await route.fetch();
        return route.fulfill({ response, body: (await response.text()).replaceAll(/\.\/dist\/runtime\.js(?:\?[^']*)?/g, './src/runtime.js') });
      }
      return route.continue();
    });
    await page.goto(url.href);
    await openApp(page, '短信');
    await activate(page.locator(group ? '[data-group="preview-friends"]' : '[data-contact="lin"]'));
    const draft = page.locator('#sms-draft');
    const initial = await metrics(page);
    await draft.fill('ABCD');
    await draft.evaluate(input => { window.originalSmsDraft = input; input.setSelectionRange(2, 2); });
    await activate(page.getByRole('button', { name: '添加消息', exact: true }));
    check(await draft.evaluate(input => [input === window.originalSmsDraft, input.selectionStart, input.selectionEnd]), [true, 2, 2], 'opening attachments preserves native input and caret');
    await activate(page.getByRole('button', { name: '表情', exact: true }));
    check(await draft.evaluate(input => [input === window.originalSmsDraft, input.selectionStart, input.selectionEnd]), [true, 2, 2], 'opening emoji keeps the native caret');
    for (const name of ['Blob Emoji', 'Sepia', '小表情']) await activate(page.getByRole('tab', { name, exact: true }));
    check(await draft.evaluate(input => [input === window.originalSmsDraft, input.selectionStart, input.selectionEnd]), [true, 2, 2], 'changing packs preserves input identity and selection');

    const positionCaret = async prefix => {
      const point = await draft.evaluate((input, prefix) => {
        const rect = input.getBoundingClientRect(), style = getComputedStyle(input);
        const canvas = document.createElement('canvas'), context = canvas.getContext('2d'); context.font = style.font;
        return { x: rect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft) + context.measureText(prefix).width + .2, y: rect.top + rect.height / 2 };
      }, prefix);
      if (touch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
      check(await page.locator('.sticker-picker').count(), 1, 'touching/clicking the input keeps the emoji picker open');
      check(await draft.evaluate(input => input.selectionStart), prefix.length, 'a real input click moves the native caret');
    };
    for (const prefix of ['', 'AB', 'ABCD']) {
      await draft.fill('ABCD');
      await positionCaret(prefix);
      await activate(page.getByRole('button', { name: '插入表情：合十', exact: true }));
      check(await draft.inputValue(), `${prefix}🙏${'ABCD'.slice(prefix.length)}`, 'emoji inserts at the current beginning/middle/end caret');
      check(await draft.evaluate(input => input.selectionStart), prefix.length + 2, 'native caret follows the inserted emoji');
    }
    await draft.fill('ABCD');
    await positionCaret('A');
    await draft.press('ArrowRight');
    await draft.press('x');
    check(await draft.inputValue(), 'ABxCD', 'typing and keyboard movement work with the picker open');
    check(await page.locator('.sticker-picker').count(), 1, 'editing leaves the picker visible');
    await draft.fill('ABCD');
    await draft.evaluate(input => input.setSelectionRange(1, 3));
    await activate(page.getByRole('tab', { name: 'Blob Emoji', exact: true }));
    await activate(page.getByRole('tab', { name: '小表情', exact: true }));
    check(await draft.evaluate(input => [input.selectionStart, input.selectionEnd]), [1, 3], 'pack switching retains a selected range');
    await activate(page.getByRole('button', { name: '插入表情：合十', exact: true }));
    check(await draft.inputValue(), 'A🙏D', 'emoji replaces the selected range');
    await activate(page.getByRole('button', { name: '插入表情：合十', exact: true }));
    check(await draft.inputValue(), 'A🙏🙏D', 'consecutive insertions follow the updated native caret');

    await draft.focus();
    await draft.dispatchEvent('compositionstart', { data: '中' });
    await page.evaluate(() => previewHarness.app.open());
    check(await draft.evaluate(input => input === window.originalSmsDraft), true, 'an existing same-route async refresh preserves the active composing input');
    await draft.dispatchEvent('compositionend', { data: '中' });
    check(await draft.inputValue(), 'A🙏🙏D', 'refresh leaves the draft untouched');
    const prefix = `${touch ? 'touch' : 'mouse'}-${group ? 'group' : 'private'}`;
    await page.locator('.phone-shell').screenshot({ path: `${output}/${prefix}-picker.png` });
    const feed = await page.locator('.message-feed').boundingBox();
    if (touch) await page.touchscreen.tap(feed.x + feed.width - 3, feed.y + feed.height - 3);
    else await page.mouse.click(feed.x + feed.width - 3, feed.y + feed.height - 3);
    check(await page.locator('.sticker-picker').count(), 0, 'clicking blank message space closes the picker');
    check(await metrics(page), initial, 'editing and emoji insertion do not call models or save messages');

    await page.evaluate(group => {
      previewHarness.settings.pocketPhone = { ...previewHarness.settings.pocketPhone, apiSourceRef: { kind: 'shared-preset', presetId: 'daily' } };
      previewHarness.replyWait = new Promise(resolve => { previewHarness.finishReply = resolve; });
      previewHarness.reply = { ...(group ? { anchor: { memberIds: ['lin', 'zhou', '@user'], speakerIds: ['lin'] } } : {}), messages: [{ text: '模拟晚到回复。', ...(group ? { speakerId: 'lin' } : {}) }] };
    }, group);
    await activate(page.getByRole('button', { name: '继续', exact: true }));
    await page.waitForFunction(() => previewHarness.requests.length === 1);
    await draft.fill('ABCD');
    await draft.evaluate(input => { window.originalSmsDraft = input; input.setSelectionRange(1, 3); });
    await activate(page.getByRole('button', { name: '添加消息', exact: true }));
    if (!group) await activate(page.getByRole('button', { name: '表情', exact: true }));
    const asyncControl = group ? page.getByRole('button', { name: '表情', exact: true }) : page.getByRole('tab', { name: '小表情', exact: true });
    await draft.focus();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      if (await asyncControl.evaluate(control => control.getRootNode().activeElement === control)) break;
    }
    check(await asyncControl.evaluate(control => control.getRootNode().activeElement === control), true, 'native Tab moves focus to the attachment menu or picker controls');
    await page.evaluate(() => { previewHarness.replyWait = null; previewHarness.finishReply(); });
    await page.waitForFunction(id => previewHarness.metadata.pocketPhone.conversations[id].some(message => message.text === '模拟晚到回复。'), group ? 'preview-friends' : 'lin');
    await page.waitForFunction(() => !document.querySelector('.pocket-phone').shadowRoot.querySelector('.typing'));
    check(await draft.evaluate(input => [input === window.originalSmsDraft, input.selectionStart, input.selectionEnd]), [true, 1, 3], 'a late reply retains the inactive SMS editor and native range');
    if (group) await activate(page.getByRole('button', { name: '表情', exact: true }));
    await activate(page.getByRole('button', { name: '插入表情：合十', exact: true }));
    check(await draft.inputValue(), 'A🙏D', 'emoji still replaces the chosen range after an asynchronous reply');
    check((await metrics(page)).models, 1, 'only the intended simulated continuation requests a model');
    await draft.fill('A🙏🙏D');
    await activate(page.getByRole('button', { name: '收起附件', exact: true }));
    const beforeSticker = await metrics(page);

    await activate(page.getByRole('button', { name: '添加消息', exact: true }));
    await activate(page.getByRole('button', { name: '定位', exact: true }));
    await activate(draft);
    check(await page.locator('.attachment-form').count(), 0, 'location form retains its original outside-input dismissal');
    await activate(page.getByRole('button', { name: '聊天选项', exact: true }));
    await activate(page.getByRole('button', { name: '添加消息', exact: true }));
    check(await page.locator('.phone-action-popup').count(), 0, 'opening attachments closes the old chat menu');
    check(await page.getByRole('button', { name: '聊天选项', exact: true }).getAttribute('aria-expanded'), 'false', 'old menu state is reset');
    await activate(page.getByRole('button', { name: '表情', exact: true }));
    await activate(page.getByRole('tab', { name: 'Blob Emoji', exact: true }));
    await activate(page.getByRole('button', { name: '发送表情：开心', exact: true }));
    const id = group ? 'preview-friends' : 'lin';
    await page.waitForFunction(id => previewHarness.metadata.pocketPhone.conversations[id].at(-1)?.type === 'sticker', id);
    check(await page.locator('.sticker-message img').last().evaluate(image => image.getBoundingClientRect().width), 104, 'large stickers still send as original 104px cards');
    check(await draft.inputValue(), 'A🙏🙏D', 'sending a separate large sticker preserves the text draft');
    check(await metrics(page), { ...beforeSticker, saves: beforeSticker.saves + 1 }, 'a large sticker performs only its original one simulated save');
    check(errors, [], 'browser has no page errors');
    results.push({ prefix, initial, final: await metrics(page), errors });
    await page.close();
  }
  writeFileSync(`${output}/result.json`, JSON.stringify({ checks, results }, null, 2));
  console.log(`emoji caret ${checks} checks passed across mouse/touch private/group`);
} finally { await browser.close(); }
