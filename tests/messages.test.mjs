import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createApiSettings, createModelClient } from '../src/api.js';
import { createContextReader } from '../src/context.js';
import { createMessageService } from '../src/messages.js';

export async function serviceHarness(options = {}) {
  const h = createHarness({ settings: { qianqianjie: { apiUrl: 'https://example.invalid/v1', apiKey: 'test-key', apiModel: 'm' } }, ...options });
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
  assert.equal(h.persistedMetadata.pocketPhone.conversations.lin.length, 3);
});

test('continue works without a new user message and saves several bubbles once', async () => {
  const { h, store, service } = await serviceHarness({ completion: { choices: [{ message: { content: '{"messages":[{"text":"在忙吗？"},{"text":"想和你说件事。"}]}' } }] } });
  const before = h.metadataSaves;
  await service.continueChat('lin');
  assert.deepEqual(store.read().conversations.lin.map(x => x.role), ['assistant', 'assistant']);
  assert.equal(h.metadataSaves, before + 1);
  assert.equal(h.modelRequests.length, 1);
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

