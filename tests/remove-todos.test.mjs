import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader, createBackflowService } from '../src/context.js';
import { createApiSettings, createModelClient } from '../src/api.js';
import { createMessageService } from '../src/messages.js';
import { createGroupService } from '../src/groups.js';
import { createSocialService } from '../src/social.js';
import { readTimeline } from '../src/timeline.js';

function setup(hostKind = 'native') {
  const h = createHarness({ hostKind, settings: { pocketPhone:{apiSourceRef:{kind:'shared-preset',presetId:'test'}}, 'schedule-planner': { apiPresets: [{ id: 'test', url: 'https://example.invalid/v1', key: 'synthetic', model: 'm' }] } }, messages: [{ is_user: false, mes: '后续已经改约。<!-- SDC-end | date=2026-10-18 | time=18:00 -->' }], metadata: { pocketPhone: {
    contacts: [{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }], groups: [{ id: 'g', name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: true }], conversations: { lin: [{ id: 'source', role: 'assistant', text: '明晚见。', batch: { key: '[-1]' } }], g: [{ id: 'group-source', role: 'assistant', speakerId: 'zhou', text: '早已在群里说定的约定。', batch: { key: '[-1]' } }] }, injectEnabled: true,
    todos: [{ id: 'legacy', status: 'candidate', title: 'LEGACY_UNUSED_TASK', participantIds: ['@user', 'lin'], knownToIds: ['@user', 'lin'], sourceConversationId: 'lin', sourceMessageIds: ['source'], sourceBatch: { key: '[-1]' }, unknownField: { keep: true } }],
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  const modelClient = createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) });
  return { h, target, store, reader, modelClient, legacy: structuredClone(store.read().todos) };
}

test('retired todo records are removed by the next real save while unrelated records survive', async () => {
  const { store, legacy } = setup();
  const keep = () => assert.equal('todos' in store.read(), false);
  await store.appendMessage('lin', { id: 'new', role: 'user', text: '好。' }); keep();
  await store.saveContact('lin', { name: '林舟', expression: '短句' }); keep();
  await store.saveGroup('g', { name: '朋友们', memberIds: ['lin', 'zhou'], userIsMember: true }); keep();
  await store.updateSocial(() => ({ posts: [], npcs: [], feedIds: [] }), { incomingMessages: [{ contactId: 'lin', messages: [{ id: 'incoming', role: 'assistant', text: '收到。' }], todoCandidates: [{ title: 'IGNORED_NEW_TASK', participantIds: ['@user','lin'], sourceMessageIds: ['incoming'] }] }] }); keep();
  await store.deleteMessage('lin', 'source'); keep();
  await store.clearConversation('lin', { key: '[-1]' }); keep();
  await store.deleteGroup('g'); keep();
  await store.deleteContact('lin'); keep();
});

for (const hostKind of ['native', 'luker']) test(`${hostKind}: original services ignore retired tasks and stale model suggestions while preserving real conversation context`, async () => {
  const { h, target, store, reader, modelClient, legacy } = setup(hostKind);
  const assertInput = () => {
    const body = h.modelRequests.at(-1).body, input = JSON.parse(body.messages.find(row => row.role === 'user').content);
    assert.equal(JSON.stringify(body).includes('LEGACY_UNUSED_TASK'), false);
    assert.equal(body.messages[0].content.includes('todoSuggestions'), false);
    assert.equal(body.messages[0].content.includes('待办'), false);
    assert.equal('todos' in input, false); assert.equal('todoPeople' in input, false);
    assert.ok(Array.isArray(input.phoneContext));
    assert.equal('todos' in store.read(), false);
    return input;
  };
  const stale = [{ title: 'IGNORED_NEW_TASK', participantIds: ['@user','lin'], sourceMessageIndexes: [0] }];
  h.completion = { choices: [{ message: { content: JSON.stringify({ messages: [{ text: '仍按新约定来。' }], todoSuggestions: stale }) } }] };
  await createMessageService({ target, store, contextReader: reader, modelClient }).continueChat('lin'); assertInput();
  h.completion = { choices: [{ message: { content: JSON.stringify({ anchor: { memberIds: ['lin','zhou','@user'], speakerIds: ['lin'] }, messages: [{ speakerId: 'lin', text: '好，群里知道了。' }], todoSuggestions: stale }) } }] };
  await createGroupService({ target, store, contextReader: reader, modelClient }).continueChat('g'); assertInput();
  const social = createSocialService({ store, contextReader: reader, modelClient, random: () => 0 });
  h.completion = (_path, init) => {
    const input = JSON.parse(JSON.parse(init.body).messages[1].content);
    const proactiveMessages = [{ contactId: 'lin', messages: [{ text: '退役渠道不应保存。' }], todoSuggestions: stale }];
    const answer = input.task === 'comment' ? { comments: [{ authorId: 'lin', text: '谢谢。' }], proactiveMessages } : { posts: input.authors.filter(person => person.kind !== 'npc').map(person => ({ authorId: person.id, image:{description:'日常照片。'}, text: '普通近况。', publishedAt: '2026-10-18 17:00' })), proactiveMessages };
    return { choices: [{ message: { content: JSON.stringify(answer) } }] };
  };
  await social.refresh(); const feed = assertInput();
  assert.ok(feed.authors.filter(author => author.kind !== 'npc').every(author => !('todos' in author) && !('todoPeople' in author)));
  await social.comment(store.read().social.posts.find(post => post.authorId === 'lin').id, '下午好。'); assertInput();
  assert.equal(h.modelRequests.length, 4); assert.equal(h.metadataSaves, 5);
  assert.equal(store.read().conversations.lin.filter(message => message.text === '退役渠道不应保存。').length, 0);
});

for (const hostKind of ['native', 'luker']) test(`${hostKind}: short/long backflow uses only actual SMS and leaves retired todos inert`, async () => {
  const { h, target, store, modelClient, legacy } = setup(hostKind);
  const backflow = createBackflowService({ target, store, modelClient });
  assert.equal(await backflow.prepare(), '', 'legacy task alone cannot trigger a main-story reference');
  assert.equal(h.modelRequests.length, 0);
  const batch = readTimeline(target.messages);
  await store.appendMessage('lin', { id: 'short', role: 'user', text: '明天改到六点见。', batch });
  assert.ok((await backflow.prepare()).includes('明天改到六点见。'));
  assert.equal(h.modelRequests.length, 0);
  await store.appendMessage('lin', { id: 'long', role: 'user', text: '这是正式短信。'.repeat(500), batch });
  h.completion = { choices: [{ message: { content: '{"summary":"双方已约定明天六点见。"}' } }] };
  const before = h.metadataSaves;
  assert.ok((await backflow.prepare()).includes('双方已约定明天六点见。'));
  assert.equal(h.modelRequests.length, 1); assert.equal(h.metadataSaves, before);
  const request = h.modelRequests[0].body;
  assert.equal(JSON.stringify(request).includes('LEGACY_UNUSED_TASK'), false);
  assert.equal(request.messages[0].content.includes('待办'), false);
  assert.equal('todos' in JSON.parse(request.messages[1].content), false);
  assert.equal('todos' in store.read(), false);
});
