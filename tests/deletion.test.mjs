import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';

for (const hostKind of ['native', 'luker']) test(`${hostKind}: a history batch deletes mixed story and phone messages only in that conversation`, async () => {
  const selected = { key: '[6,"2026-10-18","18:00"]', label: '2026-10-18 · 18:00 · 主楼 #7' };
  const nextTime = { key: '[6,"2026-10-18","19:00"]', label: '2026-10-18 · 19:00 · 主楼 #7' };
  const h = createHarness({ hostKind, metadata: { pocketPhone: {
    schemaVersion: 1, contacts: [{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }],
    groups: [{ id: 'friends', name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: true }],
    storySmsImportedFloor: 6,
    conversations: {
      lin: [
        { id: 'story', role: 'assistant', text: '主楼导入', source: { kind: 'main-story' }, batch: selected },
        { id: 'phone', role: 'user', text: '手机续聊', batch: selected, type: 'image', image: { path: '/user/images/pocket-phone/removed.png' } },
        { id: 'next', role: 'assistant', text: '同楼另一个时间', batch: nextTime },
      ],
      zhou: [{ id: 'other', role: 'assistant', text: '另一会话', batch: selected }],
      friends: [{ id: 'group', role: 'assistant', speakerId: 'lin', text: '群聊保留', batch: selected }],
    },
  } } });
  const removed = [], store = createPhoneStore({ target: h.host.captureChat(), removeImages: async paths => removed.push(...paths) });
  const people = structuredClone([store.read().contacts, store.read().groups]);
  await store.clearConversation('lin', { key: selected.key });
  assert.deepEqual(store.read().conversations.lin.map(message => message.id), ['next']);
  assert.deepEqual(store.read().conversations.zhou.map(message => message.id), ['other']);
  assert.deepEqual(store.read().conversations.friends.map(message => message.id), ['group']);
  assert.deepEqual([store.read().contacts, store.read().groups], people);
  assert.deepEqual(removed, []); assert.ok(store.read().albumPhotos.some(photo => photo.path === '/user/images/pocket-phone/removed.png'));
  assert.equal(store.read().storySmsImportedFloor, 6);
  await store.importStorySms({ floor: 6, blocks: [{ name: '林舟', sender: '林舟', text: '已删除的主楼导入', index: 0 }], batch: selected });
  assert.deepEqual(h.persistedMetadata.pocketPhone.conversations.lin.map(message => message.id), ['next'], 'opening the same imported floor does not add the deleted messages back');
  assert.equal(h.modelRequests.length, 0);
});

test('deleting the early ungrouped batch removes its full contents and keeps keyed messages', async () => {
  const h = createHarness({ metadata: { pocketPhone: { schemaVersion: 1, contacts: [{ id: 'lin', name: '林舟' }], conversations: {
    lin: [{ id: 'early', text: '早期短信' }, { id: 'empty-batch', text: '早期空分组', batch: {} }, { id: 'keyed', text: '有分组', batch: { key: '[0]' } }],
  } } } });
  const store = createPhoneStore({ target: h.host.captureChat() });
  await store.clearConversation('lin', { key: 'legacy' });
  assert.deepEqual(store.read().conversations.lin.map(message => message.id), ['keyed']);
});

test('a failed batch deletion save preserves every message and image reference', async () => {
  const h = createHarness({ metadata: { pocketPhone: { schemaVersion: 1, contacts: [{ id: 'lin', name: '林舟' }], conversations: {
    lin: [{ id: 'photo', type: 'image', image: { path: '/user/images/pocket-phone/keep.png' }, batch: { key: '[0]' } }],
  } } } });
  const removed = [], store = createPhoneStore({ target: h.host.captureChat(), removeImages: async paths => removed.push(...paths) });
  const before = structuredClone(store.read());
  h.saveFailure = new Error('模拟保存失败');
  await assert.rejects(store.clearConversation('lin', { key: '[0]' }), /手机内容保存失败/);
  assert.deepEqual(store.read(), before);
  assert.deepEqual(removed, []);
});

for (const hostKind of ['native', 'luker']) test(`${hostKind}: deleting a contact removes all private history and their group posts, retaining everyone else`, async () => {
  const h = createHarness({ hostKind, metadata: { foreign: { keep: true } } });
  const store = createPhoneStore({ target: h.host.captureChat() });
  await store.upsertContacts([{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }]);
  const group = await store.saveGroup('', { name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: true });
  await store.appendMessages('lin', [{ id: 'old', text: '过去的私聊', batch: { key: 'old' } }, { id: 'new', text: '当前的私聊' }]);
  await store.appendMessage('zhou', { id: 'other', text: '其他私聊' });
  await store.appendMessages(group.id, [{ id: 'g1', speakerId: 'lin', text: '被删成员的群消息' }, { id: 'g2', speakerId: 'zhou', text: '其他成员的群消息' }]);
  assert.equal(typeof store.deleteContact, 'function');
  await store.deleteContact('lin');
  assert.equal(store.read().contacts.some(person => person.id === 'lin'), false);
  assert.equal(store.read().conversations.lin, undefined);
  assert.deepEqual(store.read().groups[0].memberIds, ['zhou']);
  assert.deepEqual(store.read().conversations[group.id].map(message => message.id), ['g2']);
  assert.equal(store.read().conversations.zhou[0].id, 'other');
  assert.deepEqual(h.persistedMetadata.foreign, { keep: true });
  await assert.rejects(store.appendMessage('lin', { id: 'late', text: '不能复活已删除会话' }), /已删除|不存在/);
  await assert.rejects(store.appendMessage(group.id, { id: 'late-group', role: 'assistant', speakerId: 'lin', text: '不能保存已移出成员的新发言' }), /群成员/);
  await store.upsertContacts([{ id: 'lin', name: '林舟', expression: '再次整理可添加' }]);
  assert.equal(store.read().contacts.some(person => person.id === 'lin'), true);
  assert.equal(store.read().conversations.lin, undefined);
  await store.deleteGroup(group.id);
  assert.equal(store.read().groups.length, 0);
  assert.equal(store.read().conversations[group.id], undefined);
});
