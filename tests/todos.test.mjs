import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTodoCandidates, readTodos, pendingTodoCount } from '../src/todos.js';
import { createPhoneStore } from '../src/store.js';
import { createHarness } from './harness.mjs';

const assistant = (id, batch = { key: 'batch-1', label: '2026-10-20 18:00' }) => ({ id, role: 'assistant', text: `${id}短信`, batch });

test('parses only explicit candidates that point to actual assistant messages', () => {
  const messages = [
    { id: 'user-1', role: 'user', text: '好' },
    assistant('reply-1'),
  ];
  const rows = [
    { title: '明晚开会', sourceMessageIndexes: [1], participantIds: ['@user', 'lin'], startTime: '2026-10-21 19:00', endTime: '未定' },
    { title: '没有来源', sourceMessageIndexes: [0], participantIds: ['@user', 'lin'] },
    { title: '没有相关人', sourceMessageIndexes: [1], participantIds: [] },
    { title: '越界人物', sourceMessageIndexes: [1], participantIds: ['@user', 'unknown'] },
  ];
  const parsed = parseTodoCandidates(rows, { conversationId: 'lin', messages, participantIds: ['@user', 'lin'] });
  assert.equal(parsed.length, 1);
  assert.match(parsed[0].id, /^todo:/);
  assert.deepEqual({ ...parsed[0], id: undefined }, {
    id: undefined, status: 'candidate', title: '明晚开会', startAt: '2026-10-21 19:00', endAt: '',
    participantIds: ['@user', 'lin'], sourceConversationId: 'lin', sourceMessageIds: ['reply-1'],
  });
});

test('manual participant edits do not change the original knowledge snapshot', async () => {
  const h = createHarness({ metadata: { pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }], conversations: {}, forum: { posts: [] } } } });
  const store = createPhoneStore({ target: h.host.captureChat() });
  await store.appendMessages('lin', [assistant('reply-1')], { todoCandidates: [{ id: 'todo:reply-1', status: 'candidate', title: '事项', startAt: '', endAt: '', participantIds: ['@user', 'lin'], knownToIds: ['@user', 'lin'], sourceMessageIds: ['reply-1'] }] });
  const id = store.read().todos[0].id;
  await store.saveTodo(id, { participantIds: ['@user', 'zhou'] });
  assert.deepEqual(store.read().todos[0].participantIds, ['@user', 'zhou']);
  assert.deepEqual(store.read().todos[0].knownToIds, ['@user', 'lin']);
  await store.saveTodo(id, { startAt: '未定', endAt: '未定' });
  assert.equal(store.read().todos[0].startAt, '');
  assert.equal(store.read().todos[0].endAt, '');
});

test('an already referenced deleted participant remains editable by its stable id', async () => {
  const h = createHarness({ metadata: { pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }], conversations: {}, forum: { posts: [] } } } });
  const store = createPhoneStore({ target: h.host.captureChat() });
  const group = await store.saveGroup('', { name: '小组', memberIds: ['lin', 'zhou'], userIsMember: true });
  await store.appendMessages(group.id, [{ ...assistant('reply-1'), speakerId: 'lin' }], { todoCandidates: [{ id: 'todo:reply-1', status: 'candidate', title: '事项', startAt: '', endAt: '', participantIds: ['@user', 'zhou'], knownToIds: ['@user', 'lin', 'zhou'], sourceMessageIds: ['reply-1'] }] });
  const id = store.read().todos[0].id;
  await store.deleteContact('zhou');
  await store.saveTodo(id, { participantIds: ['@user', 'zhou'] });
  assert.deepEqual(store.read().todos[0].participantIds, ['@user', 'zhou']);
});

test('reads legacy state without writing it and counts only open todos', () => {
  assert.deepEqual(readTodos({ conversations: {} }), []);
  assert.equal(pendingTodoCount({ todos: [{ status: 'candidate' }, { status: 'open' }, { status: 'done' }] }), 1);
});

test('saves messages and candidates in one metadata save with derived source facts', async () => {
  const h = createHarness({ metadata: { pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }], conversations: {}, forum: { posts: [] } } } });
  const store = createPhoneStore({ target: h.host.captureChat() });
  const message = assistant('reply-1');
  const candidate = { id: 'todo:reply-1', status: 'candidate', title: '明晚开会', startAt: '', endAt: '', participantIds: ['@user', 'lin'], sourceConversationId: 'model-must-not-win', sourceMessageIds: ['reply-1'], knownToIds: ['model-must-not-win'], sourceBatch: { key: 'model-must-not-win' } };
  await store.appendMessages('lin', [message], { todoCandidates: [candidate] });
  assert.equal(h.metadataSaves, 1);
  const todo = store.read().todos[0];
  assert.equal(todo.sourceConversationId, 'lin');
  assert.deepEqual(todo.sourceMessageIds, ['reply-1']);
  assert.deepEqual(todo.knownToIds, ['@user', 'lin']);
  assert.deepEqual(todo.sourceBatch, message.batch);
  assert.equal(todo.status, 'candidate');
});

test('confirmation is idempotent and manual completion is the only done transition', async () => {
  const h = createHarness({ metadata: { pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }], conversations: {}, forum: { posts: [] } } } });
  const store = createPhoneStore({ target: h.host.captureChat() });
  await store.appendMessages('lin', [assistant('reply-1')], { todoCandidates: [{ id: 'todo:reply-1', status: 'open', title: '明晚开会', startAt: '', endAt: '', participantIds: ['@user', 'lin'], sourceMessageIds: ['reply-1'] }] });
  const id = store.read().todos[0].id;
  await store.confirmTodo(id, { title: '明晚七点开会' });
  await store.confirmTodo(id, { title: '不应覆盖' });
  assert.equal(store.read().todos[0].title, '明晚七点开会');
  assert.equal(store.read().todos[0].status, 'open');
  await store.setTodoDone(id, true);
  assert.equal(store.read().todos[0].status, 'done');
  await store.setTodoDone(id, false);
  assert.equal(store.read().todos[0].status, 'open');
});

test('source deletion removes candidates but preserves confirmed todos', async () => {
  const h = createHarness({ metadata: { pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }], conversations: {}, forum: { posts: [] } } } });
  const store = createPhoneStore({ target: h.host.captureChat() });
  await store.appendMessages('lin', [assistant('reply-1')], { todoCandidates: [{ title: '候选事项', participantIds: ['@user', 'lin'], sourceMessageIds: ['reply-1'] }] });
  const candidateId = store.read().todos[0].id;
  await store.confirmTodo(candidateId);
  await store.appendMessages('lin', [assistant('reply-2')], { todoCandidates: [{ title: '仍是候选', participantIds: ['@user', 'lin'], sourceMessageIds: ['reply-2'] }] });
  await store.deleteMessage('lin', 'reply-2');
  assert.deepEqual(store.read().todos.map(todo => todo.status), ['open']);
});

test('a candidate with a multi-message source is removed when any source message disappears', async () => {
  const h = createHarness({ metadata: { pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }], conversations: {}, forum: { posts: [] } } } });
  const store = createPhoneStore({ target: h.host.captureChat() });
  await store.appendMessages('lin', [assistant('reply-1'), assistant('reply-2')], {
    todoCandidates: [{ title: '两条短信共同约定', participantIds: ['@user', 'lin'], sourceMessageIds: ['reply-1', 'reply-2'] }],
  });
  assert.equal(store.read().todos.length, 1);
  await store.deleteMessage('lin', 'reply-1');
  assert.equal(store.read().todos.length, 0);
});

test('candidate and message roll back together on a failed metadata save', async () => {
  const h = createHarness({ metadata: { pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }], conversations: {}, forum: { posts: [] } } } });
  const store = createPhoneStore({ target: h.host.captureChat() });
  h.saveFailure = new Error('保存失败');
  await assert.rejects(store.appendMessages('lin', [assistant('reply-1')], { todoCandidates: [{ title: '失败事项', participantIds: ['@user', 'lin'], sourceMessageIds: ['reply-1'] }] }), /保存失败/);
  assert.deepEqual(store.read().conversations, {});
  assert.equal(store.read().todos, undefined);
});

test('social incoming messages and candidates share one save', async () => {
  const h = createHarness({ metadata: { pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }], conversations: {}, forum: { posts: [] } } } });
  const store = createPhoneStore({ target: h.host.captureChat() });
  const message = assistant('social-reply');
  await store.updateSocial(() => ({ posts: [{ id: 'post-1', authorId: 'lin', text: '动态' }], feedIds: ['post-1'], npcs: [] }), {
    incomingMessages: [{ contactId: 'lin', messages: [message], todoCandidates: [{ title: '动态后联系', participantIds: ['@user', 'lin'], sourceMessageIds: ['social-reply'] }] }],
  });
  assert.equal(h.metadataSaves, 1);
  assert.equal(store.read().conversations.lin[0].id, 'social-reply');
  assert.equal(store.read().todos[0].sourceMessageIds[0], 'social-reply');
});
