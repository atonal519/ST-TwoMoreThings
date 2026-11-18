import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createApiSettings, createModelClient } from '../src/api.js';
import { createContextReader } from '../src/context.js';
import { createMessageService } from '../src/messages.js';
import { renderChat } from '../src/ui/messages.js';

export async function serviceHarness(options = {}) {
  const h = createHarness({ settings: { pocketPhone:{apiSourceRef:{kind:'shared-preset',presetId:'test'}}, 'schedule-planner': { apiPresets: [{ id: 'test', url: 'https://example.invalid/v1', key: 'test-key', model: 'm' }] } }, ...options });
  const target = h.host.captureChat();
  const store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'lin', name: '林舟', personality: '温和', expression: '说话简短' }]);
  const reader = createContextReader({ target, store, qqjBridgeProvider: options.qqjBridgeProvider });
  const modelClient = createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) });
  return { h, target, store, reader, modelClient, service: createMessageService({ target, store, contextReader: reader, modelClient }) };
}

for (const hostKind of ['native', 'luker']) test(`${hostKind}: a normal private reply creates and updates only that contact's remark in its original request and save`, async () => {
  const { h, target, store, service } = await serviceHarness({ hostKind, completion: { choices: [{ message: { content: JSON.stringify({ messages: [{ text: '书给你留好了。' }], remarkForUser: '  书友 📚  ' }) } }] } });
  const before = h.metadataSaves;
  await service.continueChat('lin');
  assert.equal(h.modelRequests.length, 1);
  assert.equal(h.metadataSaves, before + 1);
  assert.equal(store.read().contacts[0].remarkForUser, '书友 📚');
  assert.equal(h.persistedMetadata.pocketPhone.contacts[0].remarkForUser, '书友 📚');
  assert.equal(store.read().conversations.lin.at(-1).text, '书给你留好了。');
  assert.equal(createPhoneStore({ target }).read().contacts[0].remarkForUser, '书友 📚');
  h.completion = { choices: [{ message: { content: JSON.stringify({ messages: [{ text: '下周也一起逛。' }], remarkForUser: '周末逛书店搭子' }) } }] };
  await service.continueChat('lin');
  assert.equal(JSON.parse(h.modelRequests[1].body.messages[1].content).contact.remarkForUser, '书友 📚');
  assert.equal(store.read().contacts[0].remarkForUser, '周末逛书店搭子');
  assert.equal(h.modelRequests.length, 2);
  assert.equal(h.metadataSaves, before + 2);
});

test('missing, blank or invalid private reply remarks preserve the old remark while saving usable messages', async () => {
  for (const remarkForUser of [undefined, '', '   ', null, 12, { text: '不能转成字符串' }]) {
    const { h, store, service } = await serviceHarness({ metadata: { pocketPhone: { contacts: [{ id: 'lin', name: '林舟', remarkForUser: '旧备注' }], conversations: {} } }, completion: { choices: [{ message: { content: JSON.stringify({ messages: [{ text: '收到。' }], remarkForUser }) } }] } });
    const before = h.metadataSaves;
    await service.continueChat('lin');
    assert.equal(store.read().contacts[0].remarkForUser, '旧备注');
    assert.equal(store.read().conversations.lin.at(-1).text, '收到。');
    assert.equal(h.metadataSaves, before + 1); assert.equal(h.modelRequests.length, 1);
  }
});

test('a failed reply save preserves both the old remark and the original messages', async () => {
  const { h, store, service } = await serviceHarness({ metadata: { pocketPhone: { contacts: [{ id: 'lin', name: '林舟', remarkForUser: '旧备注' }], conversations: { lin: [{ id: 'original', role: 'user', text: '保留这条。' }] } } }, completion: { choices: [{ message: { content: '{"messages":[{"text":"新回复"}],"remarkForUser":"新备注"}' } }] } });
  const before = structuredClone(store.read()); h.saveFailure = new Error('模拟保存失败');
  await assert.rejects(service.continueChat('lin'), /保存失败/);
  assert.deepEqual(store.read(), before); assert.equal(h.modelRequests.length, 1);
});

test('a transfer-action-only private reply saves its remark with the existing transfer save', async () => {
  const { h, store, service } = await serviceHarness();
  await service.sendCard('lin', { type: 'transfer', transfer: { amount: '8', currency: 'CNY' } });
  const transferId = store.read().conversations.lin[0].id, before = h.metadataSaves;
  h.completion = { choices: [{ message: { content: JSON.stringify({ messages: [], transferActions: [{ transferId, status: 'accepted' }], remarkForUser: '一起买书的人' }) } }] };
  assert.deepEqual(await service.continueChat('lin'), []);
  assert.equal(store.read().conversations.lin[0].transfer.status, 'accepted');
  assert.equal(store.read().contacts[0].remarkForUser, '一起买书的人');
  assert.equal(h.metadataSaves, before + 1); assert.equal(h.modelRequests.length, 1);
});

test('send and continue are separate and do not write any main floor', async () => {
  const main = [{ mes: '约好今晚去书店。', is_user: false }];
  const { h, store, service } = await serviceHarness({ messages: main });
  await service.send('lin', '晚上一起吃饭吗？');
  await service.send('lin', '我可以晚一点到。');
  assert.equal(h.modelRequests.length, 0);
  assert.equal(store.read().conversations.lin.length, 2);
  await service.continueChat('lin');
  assert.equal(h.modelRequests.length, 1);
  assert.equal(store.read().conversations.lin.at(-1).role, 'assistant');
  assert.deepEqual(main, [{ mes: '约好今晚去书店。', is_user: false }]);
  assert.ok(JSON.stringify(h.modelRequests[0].body.messages).includes('约好今晚去书店。'));
  assert.ok(h.modelRequests[0].body.messages[0].content.includes('无需等用户索要'));
  assert.ok(h.modelRequests[0].body.messages[0].content.includes('两者均省略译文字段'));
  assert.match(h.modelRequests[0].body.messages[0].content, /标准汉语和纯符号省略translation/);
  assert.equal(h.persistedMetadata.pocketPhone.conversations.lin.length, 3);
});

test('continue saves originals and optional translations for several bubbles in one request', async () => {
  const { h, target, store, service } = await serviceHarness({ completion: { choices: [{ message: { content: '{"messages":[{"text":"在忙吗？"},{"text":"少し話したいことがある。","translation":"想和你说件事。"},{"text":"?"}]}' } }] } });
  await store.upsertContacts([{ id: 'lin', name: '林舟', language: '日语，附中文译文' }]);
  const before = h.metadataSaves;
  await service.continueChat('lin');
  const messages = store.read().conversations.lin;
  assert.deepEqual(messages.map(({ role, text, translation }) => ({ role, text, translation })), [
    { role: 'assistant', text: '在忙吗？', translation: undefined },
    { role: 'assistant', text: '少し話したいことがある。', translation: '想和你说件事。' },
    { role: 'assistant', text: '?', translation: undefined },
  ]);
  assert.deepEqual(createPhoneStore({ target }).read().conversations.lin, messages);
  assert.equal(store.read().contacts[0].language, '日语，附中文译文');
  const input = JSON.parse(h.modelRequests[0].body.messages.find(message => message.role === 'user').content);
  assert.equal(input.contact.language, '日语，附中文译文');
  assert.equal(h.metadataSaves, before + 1);
  assert.equal(h.modelRequests.length, 1);
});

for (const hostKind of ['native', 'luker']) test(`${hostKind}: Cantonese translation conditions reach the final request and bilingual replies save and display in the same call`, async () => {
  const { h, target, store, service } = await serviceHarness({ hostKind, completion: { choices: [{ message: { content: JSON.stringify({ messages: [
    { text: '我到咗喇。', translation: '我到了。' }, { type: 'voice', text: '迟啲见。', translation: '晚点见。' }, { text: '收到。' }, { text: '👌' },
  ] }) } }] } });
  await store.setDefaultLanguage('粤语');
  await store.upsertContacts([{ id: 'lin', name: '林舟', language: '粤语' }]);
  const before = h.metadataSaves;
  await service.continueChat('lin');
  const request = h.modelRequests[0].body;
  assert.equal(JSON.parse(request.messages.find(message => message.role === 'user').content).defaultLanguage, '粤语');
  assert.equal(JSON.parse(request.messages.find(message => message.role === 'user').content).contact.language, '粤语');
  assert.ok(request.messages[0].content.includes('粤语也要翻译'));
  assert.doesNotMatch(request.messages[0].content, /普通消息仍用text和可选translation/);
  assert.match(request.messages[0].content, /包括用汉字书写的粤语.*每条.*本次回答.*标准汉语.*translation/);
  assert.match(request.messages[0].content, /标准汉语和纯符号省略translation/);
  const example = request.messages[0].content.match(/\{"text":"[^"]*咗[^"]*","translation":"[^"]+"\}/)?.[0];
  assert.ok(example); assert.deepEqual(JSON.parse(example), { text: '我到咗喇。', translation: '我到了。' });
  const messages = store.read().conversations.lin;
  assert.equal(messages[0].text, '我到咗喇。'); assert.equal(messages[0].translation, '我到了。');
  assert.equal(messages[1].type, 'voice'); assert.equal(messages[1].text, '迟啲见。'); assert.equal(messages[1].translation, '晚点见。');
  assert.equal(Object.hasOwn(messages[2], 'translation'), false); assert.equal(Object.hasOwn(messages[3], 'translation'), false);
  assert.deepEqual(createPhoneStore({ target }).read().conversations.lin, messages);
  const ui = { view: 'chat', contactId: 'lin', defaultUser: '我', batch: messages[0].batch, drafts: new Map(), visibleMessages: 60, visibleHistory: 60,
    expandedVoices: new Set([JSON.stringify(['messages', 'lin', messages[1].batch.key, messages[1].id])]) };
  const html = renderChat(store.read(), { ui, busy: new Set() });
  assert.equal((html.match(/class="message-translation"/g) || []).length, 2);
  assert.match(html, /我到咗喇。/); assert.match(html, /我到了。/); assert.match(html, /迟啲见。/); assert.match(html, /晚点见。/);
  assert.equal(h.modelRequests.length, 1); assert.equal(h.metadataSaves, before + 1);
});

test('new SMS use story time while createdAt still records actual save order', async () => {
  const main = [{ is_user: false, mes: '<!-- QQJ-end | date=大陆历1686年10月4日 | weekday=周二 | time=22:15 -->' }];
  const { h, store, service } = await serviceHarness({ messages: main });
  await service.send('lin', '收到，晚点见。');
  const sent = store.read().conversations.lin[0];
  assert.equal(sent.timeLabel, '22:15');
  assert.equal(sent.storyDate, '大陆历1686年10月4日');
  assert.ok(Number.isFinite(Date.parse(sent.createdAt)));
  main.push({ is_user: false, mes: '<!-- SDC-end | date=大陆历1686年10月4日 | weekday=周二 | time=22:28 -->' });
  await service.continueChat('lin');
  assert.equal(store.read().conversations.lin.at(-1).timeLabel, '22:28');
  assert.equal(store.read().conversations.lin[0].timeLabel, '22:15', '不因剧情更新重写历史短信时间');
  assert.equal(h.modelRequests.length, 1, '读取时间不请求模型');
});


for (const hostKind of ['native', 'luker']) test(`${hostKind}: adjacent split translations save as three bilingual messages in the original private request`, async () => {
  const reply = { messages: [{ text: '听日见。' }, { translation: '明天见。' }, { type: 'voice', text: '行先喇。' }, { translation: '先走了。' }, { text: '👌' }] };
  const { h, target, store, service } = await serviceHarness({ hostKind, completion: { choices: [{ message: { content: JSON.stringify(reply) } }] } });
  await store.upsertContacts([{ id: 'lin', name: '林舟', language: '粤语' }]); const before = h.metadataSaves;
  await service.continueChat('lin');
  const system = h.modelRequests[0].body.messages[0].content;
  const shape = JSON.parse(system.match(/只输出JSON：(\{"messages":.*?\})。remarkForUser/)[1]);
  assert.ok(shape.messages[0].translation); assert.match(system, /translation与text放在同一条message对象内/);
  const messages = store.read().conversations.lin; assert.equal(messages.length, 3);
  assert.deepEqual(messages.map(row => row.translation), ['明天见。', '先走了。', undefined]); assert.equal(messages[1].type, 'voice');
  assert.deepEqual(createPhoneStore({ target }).read().conversations.lin, messages);
  const html = renderChat(store.read(), { ui: { view: 'chat', contactId: 'lin', batch: messages[0].batch, visibleMessages: 60, drafts: new Map(), expandedVoices: { has: () => true } }, busy: new Set() });
  assert.equal((html.match(/class="message-translation"/g) || []).length, 2);
  assert.equal(h.modelRequests.length, 1); assert.equal(h.metadataSaves, before + 1); assert.equal(h.settingsSaves, 0);
});
