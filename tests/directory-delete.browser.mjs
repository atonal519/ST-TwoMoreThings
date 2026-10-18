import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
try {
 for (const kind of ['native', 'luker']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(8000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${kind}`);
  await page.locator('.phone-shell').waitFor();
  await page.evaluate(() => {
    const s = previewHarness.metadata.pocketPhone, batch = s.conversations.lin[0].batch;
    s.groups = [{ id: 'group:keep', name: '朋友群', memberIds: ['lin', 'zhou'], userIsMember: true }, { id: 'group:remove', name: '另一个群', memberIds: ['lin', 'zhou'], userIsMember: false }];
    s.conversations['group:keep'] = [{ id: 'from-lin', role: 'assistant', speakerId: 'lin', text: '林舟的群消息', batch }, { id: 'from-zhou', role: 'assistant', speakerId: 'zhou', text: '周予的群消息', batch }];
    s.conversations['group:remove'] = [{ id: 'old-group', role: 'assistant', speakerId: 'lin', text: '整个群删除的存档', batch }];
  });
  await page.getByRole('button', { name: '短信', exact: true }).click();
  await page.locator('[data-group="group:keep"]').click();
  await page.getByRole('button', { name: '聊天资料', exact: true }).click();
  await page.getByRole('button', { name: '短信', exact: true }).click();
  await page.locator('[data-group="group:remove"]').click();
  await page.getByRole('button', { name: '聊天选项', exact: true }).click();
  await page.getByRole('button', { name: '删除群聊', exact: true }).click();
  assert.ok(await page.locator('.delete-confirm').textContent().then(text => text.includes('另一个群') && text.includes('所有相关短信存档都不会保留')));
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await page.evaluate(() => previewHarness.metadataSaves), 0);
  await page.getByRole('button', { name: '聊天选项', exact: true }).click();
  await page.getByRole('button', { name: '删除群聊', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.locator('[data-contact="lin"]').waitFor();
  assert.deepEqual(await page.evaluate(() => previewHarness.metadata.pocketPhone.groups.map(group => group.id)), ['group:keep']);
  assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.conversations['group:remove']), undefined);
  await page.locator('[data-contact="lin"]').click();
  await page.getByRole('textbox', { name: '短信内容' }).fill('未发送草稿也应删除');
  await page.getByRole('button', { name: '聊天选项', exact: true }).click();
  await page.getByRole('button', { name: '删除联系人', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.locator('[data-contact="zhou"]').waitFor();
  assert.equal(await page.locator('[data-contact="lin"]').count(), 0);
  assert.deepEqual(await page.evaluate(() => previewHarness.metadata.pocketPhone.groups[0].memberIds), ['zhou']);
  assert.deepEqual(await page.evaluate(() => previewHarness.metadata.pocketPhone.conversations['group:keep'].map(message => message.id)), ['from-zhou']);
  assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.conversations.lin), undefined);
  assert.equal(await page.evaluate(() => previewHarness.requests.length), 0, '删除不调用模型');
  await page.evaluate(() => { previewHarness.reply = { contacts: [{ name: '林舟', expression: '简短直接' }], groups: [{ name: '新群', memberIds: ['card-world:林舟', 'zhou'], userIsMember: true }] }; });
  await page.getByRole('button', { name: '通讯录操作', exact: true }).click();
  await page.getByRole('button', { name: '整理通讯录', exact: true }).click();
  await page.locator('[data-contact="card-world:林舟"]').waitFor();
  assert.equal(await page.evaluate(() => previewHarness.requests.length), 1, '一次整理同时补充联系人和群聊');
  assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.groups.length), 2);
  await page.locator('[data-contact="card-world:林舟"]').click();
  assert.equal(await page.getByRole('textbox', { name: '短信内容' }).inputValue(), '');
  assert.equal(await page.getByRole('log').locator('.bubble').count(), 0);
  assert.deepEqual(errors, []);
  await page.close();
 }
 console.log('Native/Luker delete confirmation/cancel, contact/group archive removal, preserved group members and one-request directory rediscovery passed.');
} finally { await browser.close(); }
