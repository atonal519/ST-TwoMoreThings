import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { openApp } from './navigation.mjs';

const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const output = '/home/admin/sillytavern/data/codex-private/tmt-history-delete-20261028';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
try {
  console.log(`Browser: ${browser.version()}`);
  for (const host of ['native', 'luker']) for (const [width, theme] of [[390, 'day'], [320, 'night']]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${host}&group=1&clock=story`);
    await page.locator('.phone-shell').waitFor();
    await page.locator('.pocket-phone').evaluate(async (element, data) => {
      const font = new FontFace('HistoryPreviewCJK', `url(data:font/otf;base64,${data})`);
      await font.load(); document.fonts.add(font);
      const style = document.createElement('style'); style.textContent = ':host{font-family:HistoryPreviewCJK,sans-serif}';
      element.shadowRoot.append(style);
    }, readFileSync('/tmp/st-tools-browser-libs/noto-sans-cjk-sc-regular.otf').toString('base64'));
    await page.evaluate(theme => {
      const state = previewHarness.metadata.pocketPhone;
      state.theme = theme;
      state.conversations.lin = [
        ...Array.from({ length: 65 }, (_, index) => ({ id: `past-${index}`, role: index % 2 ? 'user' : 'assistant', text: `历史短信 ${index}`, read: true,
          ...(index === 0 ? { source: { kind: 'main-story' } } : {}),
          batch: { key: '[0,"旧历二千六百八十六年秋分后的星期三","18:00"]', label: '旧历二千六百八十六年秋分后的星期三 · 18:00 · 主楼 #1' } })),
        { id: 'same-floor-time', role: 'assistant', text: '同楼另一时间保留', read: true, batch: { key: '[0,"旧历二千六百八十六年秋分后的星期三","19:00"]', label: '旧历二千六百八十六年秋分后的星期三 · 19:00 · 主楼 #1' } },
        { id: 'current', role: 'assistant', text: 'Current bilingual message. '.repeat(7), translation: '当前双语短信。'.repeat(10), read: true, batch: state.conversations.zhou[0].batch },
      ];
      state.storySmsImportedFloor = 0;
      previewHarness.app.open();
    }, theme);
    await openApp(page, '短信');
    await page.locator('[data-contact="lin"]').click();
    const draft = page.getByRole('textbox', { name: '短信内容', exact: true });
    await draft.fill('尚未发送的草稿');
    const before = await page.evaluate(() => ({ state: structuredClone(previewHarness.metadata.pocketPhone), saves: previewHarness.metadataSaves }));
    await page.getByRole('button', { name: '查看过去', exact: true }).click();
    const batch = page.locator('.past-batch').filter({ hasText: '18:00' });
    assert.equal(await batch.getByRole('button', { name: '删除这段历史', exact: true }).count(), 1, 'every displayed batch exposes manual deletion');
    assert.ok(await batch.locator('.message-date').innerText().then(text => text.includes('主楼 #0')));
    assert.equal(await batch.locator('.message-row').count(), 59, 'the batch is partly outside the visible history window');
    await batch.getByRole('button', { name: '删除这段历史', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: '删除这段历史', exact: true });
    assert.ok((await confirmation.innerText()).includes('65 条'), 'confirmation counts the whole batch');
    assert.ok((await confirmation.innerText()).includes('林舟'));
    await page.locator('.phone-shell').screenshot({ path: `${output}/history-confirm-${host}-${theme}-${width}.png` });
    await confirmation.getByRole('button', { name: '取消', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => previewHarness.metadata.pocketPhone), before.state);
    assert.equal(await page.evaluate(() => previewHarness.metadataSaves), before.saves);
    assert.equal(await draft.inputValue(), '尚未发送的草稿');
    await page.locator('.phone-shell').screenshot({ path: `${output}/history-batches-${host}-${theme}-${width}.png` });
    assert.equal(await page.locator('.message-feed').evaluate(node => node.scrollWidth <= node.clientWidth), true, 'long labels fit the feed');
    await batch.getByRole('button', { name: '删除这段历史', exact: true }).click();
    await confirmation.getByRole('button', { name: '确认删除', exact: true }).click();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.conversations.lin.length === 2);
    assert.deepEqual(await page.evaluate(() => previewHarness.metadata.pocketPhone.conversations.lin.map(row => row.id)), ['same-floor-time', 'current']);
    assert.equal(await draft.inputValue(), '尚未发送的草稿');
    assert.deepEqual(await page.evaluate(() => previewHarness.metadata.pocketPhone.conversations.zhou), before.state.conversations.zhou);
    assert.deepEqual(await page.evaluate(() => previewHarness.metadata.pocketPhone.contacts), before.state.contacts);
    assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.storySmsImportedFloor), 0);
    const current = page.locator('.bubble[data-message="current"]');
    const originalBox = await current.boundingBox();
    await current.click();
    assert.equal(await page.locator('.message-actions').count(), 1);
    assert.equal(await page.getByRole('button', { name: '引用', exact: true }).count(), 0, 'private chats only offer delete');
    assert.deepEqual(await current.boundingBox(), originalBox, 'side actions keep the bubble in place');
    await page.locator('.phone-shell').screenshot({ path: `${output}/private-side-actions-${host}-${theme}-${width}.png` });
    const draftNode = await draft.elementHandle();
    await draft.click();
    assert.equal(await page.locator('.message-actions').count(), 0);
    assert.equal(await draft.evaluate((node, previous) => node === previous, draftNode), true);
    await page.getByRole('button', { name: '聊天选项', exact: true }).click();
    assert.equal(await page.getByRole('menu', { name: '聊天选项', exact: true }).count(), 1, 'other button menus keep their current implementation');
    await draft.click();
    await page.evaluate(() => {
      const state = previewHarness.metadata.pocketPhone, batch = state.conversations.zhou[0].batch;
      state.conversations['preview-friends'] = [
        { id: 'group-old', role: 'assistant', speakerId: 'zhou', text: '历史群消息', read: true, batch: { key: 'old', label: '旧历史' } },
        { id: 'group-current', role: 'assistant', speakerId: 'lin', text: 'Long group message. '.repeat(6), translation: '群聊双语文本。'.repeat(8), knownToIds: ['@user', 'lin', 'zhou'], read: true, batch },
        { id: 'group-location', role: 'user', speakerId: '@user', type: 'location', text: '书店定位', location: { name: '很长的书店定位名称'.repeat(4), address: '街道地址'.repeat(8) }, read: true, batch },
        { id: 'group-transfer', role: 'assistant', speakerId: 'zhou', type: 'transfer', text: '转账', transfer: { amount: '20', currency: 'CNY', recipientId: '@user', status: 'pending' }, read: true, batch },
        { id: 'group-image', role: 'assistant', speakerId: 'lin', type: 'image', text: '图片', image: { description: '书店窗边的咖啡，无人物。' }, read: true, batch },
      ];
    });
    await openApp(page, '短信');
    await page.locator('[data-group="preview-friends"]').click();
    await page.locator('[data-message="group-current"]').click();
    assert.equal(await page.locator('.message-actions').getByRole('button', { name: '引用', exact: true }).count(), 1);
    await page.locator('.phone-shell').screenshot({ path: `${output}/group-side-actions-${host}-${theme}-${width}.png` });
    await page.getByRole('button', { name: '引用', exact: true }).click();
    await page.locator('.reply-preview').waitFor();
    await page.getByRole('button', { name: '取消引用', exact: true }).click();
    for (const id of ['group-current', 'group-location', 'group-transfer', 'group-image']) {
      await page.locator(`[data-message="${id}"]`).click();
      assert.equal(await page.locator('.message-actions').count(), 1);
      assert.equal(await page.getByRole('menu', { name: '短信操作', exact: true }).count(), 0);
      assert.equal(await page.locator('.message-actions').getByRole('button', { name: '引用', exact: true }).getAttribute('data-message-target'), id);
      const bounds = await page.locator('.message-actions').evaluate(menu => {
        const box = menu.getBoundingClientRect(), bubble = menu.closest('.bubble-line').querySelector('.bubble').getBoundingClientRect(), feed = menu.closest('.message-feed').getBoundingClientRect();
        return { inside: box.left >= feed.left && box.right <= feed.right, towardMiddle: menu.closest('.is-mine') ? box.right <= bubble.left : box.left >= bubble.right };
      });
      assert.deepEqual(bounds, { inside: true, towardMiddle: true });
      if (id === 'group-location' || id === 'group-image') await page.locator('.phone-shell').screenshot({ path: `${output}/${id}-${host}-${theme}-${width}.png` });
      await draft.click();
    }
    await page.getByRole('button', { name: '查看过去', exact: true }).click();
    await page.locator('[data-message="group-old"]').click();
    assert.equal(await page.locator('.message-actions').getByRole('button', { name: '引用', exact: true }).count(), 0, 'history stays non-repliable');
    await page.getByRole('button', { name: '删除这条短信', exact: true }).click();
    await page.waitForFunction(() => !previewHarness.metadata.pocketPhone.conversations['preview-friends'].some(row => row.id === 'group-old'));
    await page.evaluate(() => {
      const rows = previewHarness.metadata.pocketPhone.conversations['preview-friends'];
      rows.unshift({ id: 'legacy-group', role: 'assistant', speakerId: 'lin', text: '早期群记录', read: true },
        { id: 'empty-batch-group', role: 'user', text: '早期空批次', batch: {}, read: true });
      previewHarness.app.open();
    });
    const early = page.locator('.past-batch').filter({ hasText: '早期记录（未按楼分组）' });
    assert.equal(await early.locator('.message-row').count(), 2);
    await early.getByRole('button', { name: '删除这段历史', exact: true }).click();
    assert.ok((await confirmation.innerText()).includes('2 条'));
    assert.ok((await confirmation.innerText()).includes('书店碰头小组'));
    await confirmation.getByRole('button', { name: '确认删除', exact: true }).click();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.conversations['preview-friends'].length === 4);
    assert.deepEqual(await page.evaluate(() => previewHarness.metadata.pocketPhone.conversations['preview-friends'].map(row => row.id)), ['group-current', 'group-location', 'group-transfer', 'group-image']);
    assert.deepEqual(await page.evaluate(() => previewHarness.metadata.pocketPhone.conversations.lin.map(row => row.id)), ['same-floor-time', 'current']);
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Native/Luker 390-day and 320-night: manual full-batch deletion, cancel/draft retention, same-floor isolation, side actions, group quotes, cards and label bounds passed. Simulated hosts only.');
} finally { await browser.close(); }
