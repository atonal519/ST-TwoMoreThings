import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createMessageService } from '../src/messages.js';
import { createModelClient, createApiSettings } from '../src/api.js';

test('editing a name protects that field while AI can still refine an untouched online style', async () => {
  const h = createHarness(), target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'lin', name: '林舟', expression: '旧表达' }]);
  await store.saveContact('lin', { name: '我的称呼', expression: '旧表达' });
  await store.upsertContacts([{ id: 'lin', name: '模型姓名', expression: '短句，偶尔只回问号' }]);
  assert.equal(store.read().contacts[0].name, '我的称呼');
  assert.equal(store.read().contacts[0].expression, '短句，偶尔只回问号');
  await store.saveContact('lin', { name: '我的称呼', expression: '我手动填写的方式' });
  await store.upsertContacts([{ id: 'lin', name: '模型姓名', expression: '不要覆盖' }]);
  assert.equal(store.read().contacts[0].expression, '我手动填写的方式');
});

test('a legacy edited contact can explicitly regenerate style for review without overwriting saved profile', async () => {
  const h = createHarness({ settings: { pocketPhone:{apiSourceRef:{kind:'shared-preset',presetId:'test'}}, 'schedule-planner': { apiPresets: [{ id: 'test', url: 'https://example.invalid/v1', key: 'test', model: 'm' }] } }, metadata: { pocketPhone: { schemaVersion: 1, contacts: [{ id: 'lin', name: '林舟', edited: true, expression: '烦躁时敲桌面', personality: '不耐烦', language: '粤语' }], conversations: {}, forum: { posts: [] } } }, completion: { choices: [{ message: { content: '{"contacts":[{"sourceId":"lin","name":"林舟","expression":"短句，烦躁时只回问号"}]}' } }] } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'lin', name: '覆盖旧资料', expression: '不要盲目覆盖' }]);
  const service = createMessageService({ target, store, modelClient: createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) }) });
  assert.equal(typeof service.refineOnlineStyle, 'function');
  const text = await service.refineOnlineStyle('lin');
  assert.equal(text, '短句，烦躁时只回问号');
  assert.equal(store.read().contacts[0].expression, '烦躁时敲桌面');
  assert.equal(store.read().contacts[0].name, '林舟');
  assert.equal(h.metadataSaves, 1, '只生成供检查，不自动保存');
  assert.equal(h.modelRequests.length, 1);
  const input = JSON.parse(h.modelRequests[0].body.messages[1].content);
  assert.deepEqual(input.people, [{ sourceId: 'lin', name: '林舟', personality: '不耐烦', language: '粤语' }]);
  await store.saveContact('lin', { ...store.read().contacts[0], expression: text });
  assert.equal(store.read().contacts[0].expression, '短句，烦躁时只回问号');
});
