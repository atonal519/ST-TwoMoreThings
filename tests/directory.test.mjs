import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createApiSettings, createModelClient } from '../src/api.js';
import { createContextReader } from '../src/context.js';

test('one directory request adds contacts and groups together without resetting existing profiles/history', async () => {
  const h = createHarness({ settings: { qianqianjie: { apiUrl: 'https://example.invalid/v1', apiKey: 'test', apiModel: 'm' } }, completion: { choices: [{ message: { content: JSON.stringify({ contacts: [{ sourceId: 'lin', name: '林舟', expression: '不可覆盖' }, { sourceId: 'qqj:q2', name: '周予', expression: '短句' }], groups: [{ name: '朋友', memberIds: ['lin', 'qqj:q2'], userIsMember: true }] }) } }] } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'lin', name: '林舟', expression: '已有线上方式' }]);
  await store.appendMessage('lin', { id: 'keep', text: '已有历史' });
  assert.equal(typeof store.mergeDirectory, 'function');
  const { createDirectoryService } = await import('../src/directory.js');
  const bridge = { getPeopleSnapshot: () => ({ status: 'ready', people: { items: [{ entityId: 'q2', displayName: '周予', profile: { personality: '爽快', expression: '表达直接' } }] } }) };
  const service = createDirectoryService({ store, contextReader: createContextReader({ target, store, qqjBridgeProvider: () => bridge }), modelClient: createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) }) });
  const before = h.metadataSaves;
  const added = await service.organize();
  assert.equal(h.modelRequests.length, 1);
  assert.equal(h.metadataSaves, before + 1);
  assert.equal(added.contacts.length, 1);
  assert.equal(added.groups.length, 1);
  assert.equal(store.read().contacts[0].expression, '已有线上方式');
  assert.equal(store.read().conversations.lin[0].id, 'keep');
  assert.deepEqual(store.read().groups[0].memberIds, ['lin', 'qqj:q2']);
  const input = JSON.parse(h.modelRequests[0].body.messages[1].content);
  assert.ok(input.worldbook.includes('周予性格爽快'));
  assert.equal(input.contacts[0].id, 'lin');
  await service.organize();
  assert.equal(store.read().contacts.length, 2);
  assert.equal(store.read().groups.length, 1);
});

test('without QQJ, directory reads card/worldbook and permits an empty result without resetting the save', async () => {
  const h = createHarness({ settings: { qianqianjie: { apiUrl: 'https://example.invalid/v1', apiKey: 'test', apiModel: 'm' } }, completion: { choices: [{ message: { content: '{"contacts":[{"name":"周予","expression":"简短直接"}],"groups":[]}' } }] } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const { createDirectoryService } = await import('../src/directory.js');
  const service = createDirectoryService({ store, contextReader: createContextReader({ target, store, qqjBridgeProvider: () => null }), modelClient: createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) }) });
  await service.organize();
  assert.equal(store.read().contacts[0].id, 'card-world:周予');
  assert.ok(JSON.parse(h.modelRequests[0].body.messages[1].content).worldbook.includes('周予性格爽快'));
  h.completion = { choices: [{ message: { content: '{"contacts":[],"groups":[]}' } }] };
  const before = h.metadataSaves;
  assert.deepEqual(await service.organize(), { contacts: [], groups: [] });
  assert.equal(h.metadataSaves, before, '无新增不重复写档');
  assert.equal(store.read().contacts.length, 1);
});
