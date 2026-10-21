import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhoneStore } from '../src/store.js';
import { createHarness } from './harness.mjs';

for (const hostKind of ['native', 'luker']) test(`preserves foreign metadata and sent messages through ${hostKind} save entry`, async () => {
  const originalMessages = [{ mes: '他们刚约好晚餐。', is_user: false, extra: { foreign: 1 } }];
  const h = createHarness({ hostKind, metadata: { foreign: { keep: '原样' }, integrity: 'test-version' }, messages: originalMessages });
  const before = structuredClone(originalMessages);
  const store = createPhoneStore({ target: h.host.captureChat() });
  await store.upsertContacts([{ id: 'lin', name: '林舟', personality: '温和', expression: '简短' }]);
  await store.appendMessage('lin', { id: 'm1', role: 'user', text: '晚点见。' });
  assert.equal(h.persistedMetadata.pocketPhone.conversations.lin[0].text, '晚点见。');
  assert.deepEqual(h.persistedMetadata.foreign, { keep: '原样' });
  assert.deepEqual(h.context.chat, before);
  const reopened = createPhoneStore({ target: { ...h.host.captureChat(), metadata: h.persistedMetadata } });
  assert.equal(reopened.read().conversations.lin[0].role, 'user');
});

test('persists several reply bubbles in one save and replaces the forum batch', async () => {
  const h = createHarness({ metadata: { pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }], conversations: {}, forum: { posts: [] } } } });
  const store = createPhoneStore({ target: h.host.captureChat() });
  await store.appendMessages('lin', [{ id: 'a', role: 'assistant', text: '好。' }, { id: 'b', role: 'assistant', text: '我等你。' }]);
  assert.equal(h.metadataSaves, 1);
  assert.deepEqual(h.persistedMetadata.pocketPhone.conversations.lin.map(x => x.text), ['好。', '我等你。']);
  await store.replaceForum([{ id: 'old', title: '旧帖' }]);
  await store.replaceForum([{ id: 'new', title: '新帖' }]);
  assert.deepEqual(h.persistedMetadata.pocketPhone.forum.posts.map(x => x.id), ['new']);
});

test('reports a real save failure without presenting the unpersisted message as saved', async () => {
  const h = createHarness({ metadata: { foreign: 'keep', pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }], conversations: {}, forum: { posts: [] } } } });
  const store = createPhoneStore({ target: h.host.captureChat() });
  h.saveFailure = new Error('保存失败');
  await assert.rejects(store.appendMessage('lin', { id: 'a', role: 'user', text: '你好' }), /保存失败/);
  assert.equal(store.read().conversations.lin, undefined);
  assert.equal(h.context.chatMetadata.foreign, 'keep');
});

test('incoming message notices refer only to the messages this operation actually saved', async () => {
  const h = createHarness({ metadata: { pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }], conversations: {}, forum: { posts: [] } } } });
  const notices = [];
  const store = createPhoneStore({ target: h.host.captureChat(), onIncomingMessage: id => {
    assert.ok(h.persistedMetadata.pocketPhone.conversations[id].some(message => message.role === 'assistant'), 'notice follows successful persistence');
    notices.push(id);
  } });
  await store.appendMessage('lin', { id: 'sent', role: 'user', text: '我先留言。' });
  assert.deepEqual(notices, []);
  await Promise.all([
    store.appendMessages('lin', [{ id: 'reply-1', role: 'assistant', text: '来了。' }, { id: 'reply-2', role: 'assistant', text: '晚点见。' }]),
    store.updateSocial(social => social, { incomingMessages: [{ contactId: 'zhou', messages: [{ id: 'reply-3', role: 'assistant', text: '我也在。' }] }] }),
  ]);
  assert.deepEqual(notices, ['lin', 'zhou']);
  await store.updateSocial(social => ({ ...social, feedIds: [] }));
  assert.deepEqual(notices, ['lin', 'zhou'], 'a separate social save never repeats another task’s SMS notice');
  h.saveFailure = new Error('保存失败');
  await assert.rejects(store.appendMessage('lin', { id: 'failed', role: 'assistant', text: '没存成。' }));
  assert.deepEqual(notices, ['lin', 'zhou']);
});
