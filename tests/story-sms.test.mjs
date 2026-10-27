import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader, createBackflowService } from '../src/context.js';
import { createMessageService } from '../src/messages.js';
import { syncStorySms, parseStorySms } from '../src/story-sms.js';
import { readContactAvatars } from '../src/contact-avatars.js';

function setup() {
  const h = createHarness({ messages: [{ is_user: false, mes: '[tmt|朋友甲|朋友甲]晚上八点见。[/tmt][tmt|朋友甲|我]收到[/tmt][tmt|群:读书群|朋友乙]我带书。[/tmt][tmt|群:读书群|我]好[/tmt]<!-- QQJ-end | date=2031/4/8 | time=09:30 -->' }] });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  return { h, target, store };
}

test('old metadata is stripped, original SMS imports once, and the normal save removes only retired todos', async () => {
  const s = setup();
  s.target.metadata.pocketPhone = { contacts: [], groups: [], conversations: {}, todos: [{ id: 'old', title: '退役旧数据', custom: true }], unknownField: { keep: true } };
  s.target.messages[0].mes = '[tmt|朋友甲|朋友甲]明晚八点前核对活动海报。<!--tmt-todo|核对活动海报|2031/4/9 20:00|未定|我、朋友甲、朋友乙-->[/tmt][tmt|群:读书群|朋友乙]我会带新书。[/tmt]';
  const raw = s.target.messages[0].mes;
  await syncStorySms(s);
  const state = s.store.read(), a = state.contacts.find(person => person.name === '朋友甲');
  assert.equal(s.h.metadataSaves, 1);
  assert.equal(state.conversations[a.id][0].text, '明晚八点前核对活动海报。');
  assert.equal('todos' in state, false); assert.deepEqual(state.unknownField, { keep: true });
  assert.equal(s.target.messages[0].mes, raw);
  await syncStorySms(s);
  assert.equal(s.h.metadataSaves, 1); assert.equal(s.h.modelRequests.length, 0);
});

test('retired metadata is not interpreted, and new three-part SMS imports without a task field', async () => {
  const rows = parseStorySms('[tmt|朋友甲|朋友甲]原话。<!--tmt-todo|任意|字段|不再|解析--><!--tmt-todo|字段|多|了|一个|竖线-->[/tmt][tmt|朋友甲|我]收到。[/tmt]');
  assert.deepEqual(rows.map(row => row.text), ['原话。', '收到。']);
  assert.ok(rows.every(row => !('todoSuggestions' in row)));
  assert.equal(parseStorySms('[tmt|朋友甲|朋友甲]旧格式仍保留[/tmt]')[0].text, '旧格式仍保留');
});

test('latest main-story SMS creates explicit people/groups in one silent transaction and respects later manual deletion', async () => {
  const s = setup();
  await syncStorySms(s);
  const state = s.store.read(), a = state.contacts.find(person => person.name === '朋友甲'), b = state.contacts.find(person => person.name === '朋友乙'), group = state.groups[0];
  assert.equal(s.h.metadataSaves, 1);
  assert.equal(a.personality || '', ''); assert.match(a.avatar, /^data:image\/svg/);
  assert.deepEqual(group.memberIds, [b.id]); assert.equal(group.userIsMember, true);
  assert.deepEqual(state.conversations[a.id].map(row => [row.role, row.text]), [['assistant', '晚上八点见。'], ['user', '收到']]);
  for (const row of Object.values(state.conversations).flat()) {
    assert.equal(row.read, true); assert.equal(row.source.kind, 'main-story'); assert.equal(row.source.floor, 0);
    assert.deepEqual(JSON.parse(row.batch.key), [0, '2031/4/8', '09:30']);
  }
  await syncStorySms({ ...s, store: createPhoneStore({ target: s.target }) });
  assert.equal(s.h.metadataSaves, 1);
  await s.store.deleteMessage(a.id, state.conversations[a.id][0].id);
  const afterDelete = s.h.metadataSaves;
  await syncStorySms(s); assert.equal(s.h.metadataSaves, afterDelete);
  assert.equal(s.store.read().conversations[a.id].length, 1);
});

test('names and nicknames match only unique people; existing group members and manual profiles remain', async () => {
  const s = setup();
  await s.store.upsertContacts([{ id: 'a', name: '朋友甲', nickname: '小甲', expression: '人工习惯' }, { id: 'old', name: '旧成员' }, { id: 'x', name: '同名' }, { id: 'y', name: '同名' }]);
  await s.store.saveGroup('', { name: '读书群', memberIds: ['old'], userIsMember: true });
  s.target.messages[0].mes = '[tmt|小甲|朋友甲]完整原话[/tmt][tmt|群:读书群|朋友乙]新消息[/tmt][tmt|同名|同名]歧义保留[/tmt]';
  await syncStorySms(s);
  const state = s.store.read(), b = state.contacts.find(person => person.name === '朋友乙');
  assert.deepEqual(state.groups[0].memberIds, ['old', b.id]);
  assert.equal(state.contacts.find(person => person.id === 'a').expression, '人工习惯');
  assert.equal(state.conversations.a[0].text, '完整原话');
  assert.equal(state.conversations.x, undefined); assert.equal(state.conversations.y, undefined);
  const reader = createContextReader({ target: s.target, store: s.store, qqjBridgeProvider: () => null });
  const context = await reader.readForContact('a');
  assert.equal(context.history[0].text, '完整原话');
  assert.equal(context.story[0].text.includes('完整原话'), false);
  assert.equal(context.story[0].text.includes('歧义保留'), true, 'unaccepted blocks stay in narrative context');
});

test('projected messages continue normally but do not flow back; independently repeated text remains a new event', async () => {
  const s = setup(); await syncStorySms(s);
  const a = s.store.read().contacts.find(person => person.name === '朋友甲');
  await s.store.setInjectionEnabled(true);
  const requests = [], modelClient = { async complete(request) { requests.push(request); return '{"messages":[{"text":"手机新回复"}]}'; } };
  const reader = createContextReader({ target: s.target, store: s.store, qqjBridgeProvider: () => null });
  const backflow = createBackflowService({ target: s.target, store: s.store, modelClient });
  assert.equal(await backflow.prepare(), '');
  await createMessageService({ target: s.target, store: s.store, contextReader: reader, modelClient }).continueChat(a.id);
  assert.ok(JSON.parse(requests[0].messages[0].content).history.some(row => row.text === '晚上八点见。'));
  const prompt = await backflow.prepare();
  assert.match(prompt, /手机新回复/); assert.ok(!prompt.includes('晚上八点见。'));
  s.target.messages.push({ is_user: false, mes: '[tmt|朋友甲|我]收到[/tmt]<!-- QQJ-end | date=2031/4/8 | time=10:00 -->' });
  await syncStorySms(s);
  assert.equal(s.store.read().conversations[a.id].filter(row => row.text === '收到').length, 2);
  assert.equal(requests.length, 1);
});

test('story progress removes accepted SMS from each floor in its existing narrative window', async () => {
  const h = createHarness({ messages: [{ is_user: false, mes: '最初的约定。' }] });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'a', name: '朋友甲' }, { id: 'b', name: '朋友乙' }, { id: 'x', name: '同名' }, { id: 'y', name: '同名' }]);
  const { readTimeline } = await import('../src/timeline.js');
  await store.appendMessage('a', { id: 'old', role: 'assistant', text: '之前的手机消息', batch: readTimeline(target.messages) });
  target.messages.push({ is_user: false, mes: '第一楼剧情。[tmt|朋友乙|朋友乙]第一楼已收短信[/tmt][tmt|同名|同名]歧义短信保留[/tmt]' });
  await syncStorySms({ target, store });
  target.messages.push({ is_user: false, mes: '第二楼剧情。[tmt|朋友乙|朋友乙]第二楼已收短信[/tmt]' });
  await syncStorySms({ target, store });
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  const context = await reader.readForContact('a');
  assert.deepEqual(context.storyProgress.messages.map(row => row.text), ['第一楼剧情。[tmt|同名|同名]歧义短信保留[/tmt]', '第二楼剧情。']);
  assert.equal(context.storyProgress.complete, true);
});

test('new story people use unique reader QQJ identities and display avatars without copying them into storage', async () => {
  const s = setup(); await syncStorySms(s);
  const a = s.store.read().contacts.find(person => person.name === '朋友甲'), savedAvatar = a.avatar;
  const bridge = {
    getStatus: () => ({ status: 'ready' }),
    getPeopleSnapshot: () => ({ status: 'ready', people: { items: [{ entityId: 'reader-person', displayName: '朋友甲' }, { entityId: 'other', displayName: '其他人' }] } }),
    getPeopleAvatars(ids) { assert.deepEqual(ids, ['reader-person']); return { status: 'ready', avatarsByEntityId: { 'reader-person': 'https://example.invalid/portrait.png' } }; },
    async readContext({ entityIds }) { assert.deepEqual(entityIds, ['reader-person']); return { status: 'ready', actors: [{ entityId: 'reader-person', memoryText: '甲的记忆' }, { entityId: 'other', memoryText: '其他人私事' }] }; },
  };
  assert.equal(readContactAvatars([a], bridge)[0].avatar, 'https://example.invalid/portrait.png');
  const context = await createContextReader({ target: s.target, store: s.store, qqjBridgeProvider: () => bridge }).readForContact(a.id);
  assert.equal(context.related, '甲的记忆'); assert.equal(s.store.read().contacts.find(person => person.id === a.id).avatar, savedAvatar);
  assert.deepEqual(a.source, { kind: 'story' });
});

test('a failed projection save keeps the original archive and its raw narrative intact', async () => {
  const s = setup(), before = structuredClone(s.target.metadata);
  s.h.saveFailure = new Error('save unavailable');
  await assert.rejects(syncStorySms(s), /手机内容保存失败/);
  assert.deepEqual(s.target.metadata, before); assert.equal(s.h.metadataSaves, 0);
  assert.ok(s.target.messages[0].mes.includes('[tmt|朋友甲|朋友甲]'));
});
