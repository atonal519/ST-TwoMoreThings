import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader } from '../src/context.js';
import { createMessageService } from '../src/messages.js';
import { createGroupService } from '../src/groups.js';
import { createSocialService } from '../src/social.js';

function setup(answer, hostKind = 'native') {
  const h = createHarness({ hostKind, messages: [{ is_user: false, mes: '在书店聊天。<!-- SDC-end | date=2026-10-18 | time=18:00 -->' }], metadata: { pocketPhone: {
    contacts: [{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }], groups: [], conversations: {}, injectEnabled: false,
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target }), requests = [];
  const contextReader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  const modelClient = { complete(request) { requests.push(request); return JSON.stringify(answer); } };
  return { h, target, store, requests, deps: { target, store, contextReader, modelClient } };
}
const suggestion = { title: '还书', startAt: '2026-10-19 18:00', endAt: '', participantIds: ['@user', 'lin'], sourceMessageIndexes: [1] };

for (const hostKind of ['native', 'luker']) test(`${hostKind}: private reply saves candidate with its actual message, once, without a second extraction request`, async () => {
  const { h, store, requests, deps } = setup({ messages: [{ text: '' }, { text: '明天六点一起去还书。' }], todoSuggestions: [suggestion] }, hostKind);
  const before = h.metadataSaves;
  const saved = await createMessageService(deps).continueChat('lin');
  assert.equal(requests.length, 1);
  assert.equal(h.metadataSaves, before + 1);
  assert.equal(saved.length, 1);
  const todo = store.read().todos[0];
  assert.equal(todo.status, 'candidate');
  assert.equal(todo.title, '还书');
  assert.deepEqual(todo.sourceMessageIds, [saved[0].id], 'filtering an empty reply does not shift the original index');
  assert.deepEqual(todo.knownToIds, ['@user', 'lin']);
  assert.equal(todo.endAt, '');
  const input = JSON.parse(requests[0].messages[0].content);
  assert.deepEqual(input.todoPeople.map(person => person.id), ['@user', 'lin']);
  assert.equal(h.persistedMetadata.pocketPhone.todos[0].id, todo.id);
});

test('an unassignable suggestion is skipped while its valid SMS is retained', async () => {
  const { store, deps } = setup({ messages: [{ text: '明天见。' }], todoSuggestions: [{ ...suggestion, sourceMessageIndexes: [99] }] });
  await createMessageService(deps).continueChat('lin');
  assert.equal(store.read().conversations.lin.length, 1);
  assert.equal(store.read().todos?.length || 0, 0);
});

test('group suggestions keep source positions and actual group knowledge rather than only the related people', async () => {
  const answer = { anchor: { memberIds: ['lin', 'zhou', '@user'], speakerIds: ['lin'] }, messages: [{ speakerId: 'lin', text: '' }, { speakerId: 'lin', text: '我们明天还书。' }], todoSuggestions: [suggestion] };
  const { h, store, requests, deps } = setup(answer);
  const group = await store.saveGroup('', { name: '读书群', memberIds: ['lin', 'zhou'], userIsMember: true });
  const before = h.metadataSaves;
  const messages = await createGroupService(deps).continueChat(group.id);
  assert.equal(h.metadataSaves, before + 1);
  assert.equal(requests.length, 1);
  const todo = store.read().todos[0];
  assert.equal(todo.sourceConversationId, group.id);
  assert.deepEqual(todo.sourceMessageIds, [messages[0].id]);
  assert.ok(todo.knownToIds.includes('zhou'), 'a present group member knows an arrangement even when not related to the task');
});

test('social private messages can suggest a todo in the same social/SMS save; public posts cannot', async () => {
  const answer = { posts: [{ authorId: 'lin', text: '新书到了。', publishedAt: '2026-10-18 17:00' }], todoSuggestions: [suggestion], proactiveMessages: [{ contactId: 'lin', messages: [{ text: '' }, { text: '明天帮你把书带来。' }], todoSuggestions: [suggestion] }] };
  const { h, store, requests, deps } = setup(answer);
  const before = h.metadataSaves;
  await createSocialService({ ...deps, random: () => 0 }).refresh();
  assert.equal(requests.length, 1);
  assert.equal(h.metadataSaves, before + 1);
  assert.equal(store.read().todos.length, 1);
  const todo = store.read().todos[0];
  assert.equal(todo.sourceConversationId, 'lin');
  assert.deepEqual(todo.sourceMessageIds, [store.read().conversations.lin[0].id]);
});
