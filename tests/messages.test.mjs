import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createApiSettings, createModelClient } from '../src/api.js';
import { createContextReader } from '../src/context.js';
import { createMessageService } from '../src/messages.js';

export async function serviceHarness(options = {}) {
  const h = createHarness({ settings: { 'schedule-planner': { apiPresets: [{ id: 'test', url: 'https://example.invalid/v1', key: 'test-key', model: 'm' }] } }, ...options });
  const target = h.host.captureChat();
  const store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'lin', name: '林舟', personality: '温和', expression: '说话简短' }]);
  const reader = createContextReader({ target, store, qqjBridgeProvider: options.qqjBridgeProvider });
  const modelClient = createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) });
  return { h, target, store, reader, modelClient, service: createMessageService({ target, store, contextReader: reader, modelClient }) };
}

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
  assert.ok(!h.modelRequests[0].body.messages[0].content.includes('"translation":'));
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

test('a saved Cantonese default reaches the real request and preserves its standard Chinese translation in the same save', async () => {
  const { h, store, service } = await serviceHarness({ completion: { choices: [{ message: { content: '{"messages":[{"text":"我到咗啦。","translation":"我到了。"}]}' } }] } });
  await store.setDefaultLanguage('粤语');
  const before = h.metadataSaves;
  await service.continueChat('lin');
  const request = h.modelRequests[0].body;
  assert.equal(JSON.parse(request.messages.find(message => message.role === 'user').content).defaultLanguage, '粤语');
  assert.ok(request.messages[0].content.includes('粤语也要翻译'));
  assert.equal(store.read().conversations.lin.at(-1).text, '我到咗啦。');
  assert.equal(store.read().conversations.lin.at(-1).translation, '我到了。');
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

