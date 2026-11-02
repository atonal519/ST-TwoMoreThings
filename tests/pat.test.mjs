import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createMessageService } from '../src/messages.js';
import { createGroupService } from '../src/groups.js';
import { createContextReader, createBackflowService } from '../src/context.js';
import { contextMessage, normalizeContent } from '../src/content.js';
import { readPhoneContext } from '../src/phone-context.js';
import { readTimeline } from '../src/timeline.js';
import { unreadConversations } from '../src/notifications.js';
import { renderChat } from '../src/ui/messages.js';

async function setup(hostKind = 'native') {
  const h = createHarness({ hostKind, messages: [{ is_user: false, mes: '书店碰头。<!-- QQJ-end | date=2031年4月8日 | time=10:00 -->' }] });
  const target = h.host.captureChat(), incoming = [], notices = [];
  const store = createPhoneStore({ target, onIncomingMessage: id => incoming.push(id), onNotifications: rows => notices.push(...rows) });
  await store.upsertContacts([{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }, { id: 'xu', name: '许知' }]);
  const group = await store.saveGroup('', { name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: true });
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  const requests = []; let answer = { messages: [] };
  const modelClient = { complete: async request => { requests.push(request); return typeof answer === 'function' ? answer(request) : JSON.stringify(answer); } };
  return { h, target, store, group, reader, requests, incoming, notices, answer: value => { answer = value; },
    private: createMessageService({ target, store, contextReader: reader, modelClient }),
    groups: createGroupService({ target, store, contextReader: reader, modelClient }) };
}

for (const host of ['native', 'luker']) test(`${host}: local private and group pats save once each with account IDs and no model`, async () => {
  const f = await setup(host), before = f.h.metadataSaves;
  assert.equal(typeof f.private.pat, 'function'); assert.equal(typeof f.groups.pat, 'function');
  await f.private.pat('lin', 'lin'); await f.private.pat('lin', '@user'); await f.groups.pat(f.group.id, 'zhou');
  assert.equal(f.h.metadataSaves, before + 3); assert.equal(f.requests.length, 0);
  const rows = f.store.read().conversations.lin;
  assert.deepEqual(rows.map(row => [row.type, row.speakerId, row.pat.targetId, row.text]), [
    ['pat', '@user', 'lin', '你拍了拍林舟'], ['pat', '@user', '@user', '你拍了拍自己'],
  ]);
  assert.ok(rows.every(row => row.role === 'user' && row.batch.key === readTimeline(f.target.messages).key));
  assert.deepEqual(f.store.read().conversations[f.group.id][0].knownToIds, ['lin', 'zhou', '@user']);
  assert.deepEqual(createPhoneStore({ target: f.target }).read().conversations.lin, rows);
});

test('local pats reject an unrelated private target or observer group without saving', async () => {
  const f = await setup(), before = f.h.metadataSaves;
  await assert.rejects(f.private.pat('lin', 'zhou'), /会话|对象/);
  await assert.rejects(f.groups.pat(f.group.id, 'xu'), /成员|对象/);
  await f.store.saveGroup(f.group.id, { ...f.group, userIsMember: false });
  await assert.rejects(f.groups.pat(f.group.id, 'lin'), /不在这个群/);
  assert.equal(f.h.metadataSaves, before + 1); assert.equal(f.requests.length, 0);
});

test('private normal continuation binds pat speaker to contact and skips bad pats beside valid messages', async () => {
  const f = await setup();
  f.answer({ messages: [{ type: 'pat', speakerId: '@user', pat: { targetId: '@user' }, text: '林舟轻轻拍了拍你', translation: 'Lin patted you.' },
    { type: 'pat', pat: { targetId: 'lin' }, text: '林舟拍了拍自己' },
    { type: 'pat', pat: { targetId: 'zhou' }, text: '不能拍会话外的人' },
    { type: 'pat', pat: { targetId: '@user' } }, { text: '书给你留好了。' }] });
  const before = f.h.metadataSaves, result = await f.private.continueChat('lin');
  assert.equal(f.requests.length, 1); assert.equal(f.h.metadataSaves, before + 1);
  assert.deepEqual(result.map(row => [row.type, row.speakerId, row.text]), [['pat', 'lin', '林舟轻轻拍了拍你'], ['pat', 'lin', '林舟拍了拍自己'], [undefined, undefined, '书给你留好了。']]);
  assert.equal(result[0].translation, 'Lin patted you.');
  const context = await f.reader.readForContact('lin');
  assert.deepEqual(context.history[0], { speakerId: 'lin', type: 'pat', pat: { targetId: '@user' }, text: '林舟轻轻拍了拍你', translation: 'Lin patted you.' });
  assert.equal(unreadConversations(f.store.read())[0].count, 3);
});

test('group continuation keeps pats within speaker whitelist and roster in the same reply save', async () => {
  const f = await setup();
  f.answer({ anchor: { memberIds: ['lin', 'zhou', '@user'], speakerIds: ['lin', 'zhou'] }, messages: [
    { speakerId: 'lin', type: 'pat', pat: { targetId: 'zhou' }, text: '林舟拍了拍周予' },
    { speakerId: 'zhou', type: 'pat', pat: { targetId: '@user' }, text: '周予戳了戳你' },
    { speakerId: '@user', type: 'pat', pat: { targetId: 'lin' }, text: '不能代发' },
    { speakerId: 'xu', type: 'pat', pat: { targetId: 'lin' }, text: '不能冒充群外人' },
    { speakerId: 'lin', type: 'pat', pat: { targetId: 'xu' }, text: '不能拍群外人' },
    { speakerId: 'lin', type: 'pat', pat: { targetId: 'zhou' } }, { speakerId: 'zhou', text: '走吧。' },
  ] });
  const before = f.h.metadataSaves, result = await f.groups.continueChat(f.group.id);
  assert.equal(f.requests.length, 1); assert.equal(f.h.metadataSaves, before + 1);
  assert.deepEqual(result.map(row => [row.type, row.speakerId]), [['pat', 'lin'], ['pat', 'zhou'], [undefined, 'zhou']]);
  assert.ok(f.store.read().conversations[f.group.id].every(row => row.knownToIds.join(',') === 'lin,zhou,@user'));
});

test('malformed pat content never degrades into a plain message while legacy messages remain readable', () => {
  for (const row of [{ type: 'pat', text: '缺目标' }, { type: 'pat', pat: { targetId: 42 }, text: '坏目标' }, { type: 'pat', pat: { targetId: '@user' } }]) assert.equal(normalizeContent(row), null);
  assert.deepEqual(contextMessage({ role: 'assistant', text: '旧短信。' }), { role: 'assistant', text: '旧短信。' });
});

test('save queue rejects stale pat target and forged initiator without losing earlier data', async () => {
  const f = await setup(), batch = readTimeline(f.target.messages);
  const pat = { id: 'p', role: 'assistant', speakerId: 'lin', type: 'pat', pat: { targetId: 'zhou' }, text: '林舟拍了拍周予', batch };
  await f.store.saveGroup(f.group.id, { ...f.group, memberIds: ['lin'] });
  const before = structuredClone(f.store.read()), saves = f.h.metadataSaves;
  await assert.rejects(f.store.appendMessage(f.group.id, pat), /拍一拍|对象|成员/);
  await assert.rejects(f.store.appendMessage('lin', { ...pat, pat: { targetId: '@user' }, speakerId: '@user' }), /拍一拍|发起/);
  await assert.rejects(f.store.appendMessage('lin', { ...pat, role: 'user', speakerId: 'lin', pat: { targetId: '@user' } }), /拍一拍|发起/);
  await assert.rejects(f.store.appendMessage('lin', { ...pat, role: 'system', pat: { targetId: '@user' } }), /拍一拍|发起/);
  assert.deepEqual(f.store.read(), before); assert.equal(f.h.metadataSaves, saves);
});

test('pats retain original frozen audience through phone reference, backflow and contact deletion', async () => {
  const f = await setup(), batch = readTimeline(f.target.messages);
  await f.store.appendMessage(f.group.id, { id: 'p', role: 'assistant', speakerId: 'lin', type: 'pat', pat: { targetId: 'zhou' }, text: '林舟拍了拍周予', batch });
  await f.store.saveGroup(f.group.id, { ...f.group, memberIds: ['lin', 'zhou', 'xu'] });
  await f.store.setInjectionEnabled(true);
  const backflow = createBackflowService({ target: f.target, store: f.store, modelClient: { complete() { assert.fail('short backflow must not call model'); } } });
  const reference = await backflow.prepare(); assert.ok(reference.includes('林舟拍了拍周予')); assert.equal(reference.includes('许知'), false);
  const anchor = { key: 'next-batch', label: '之后' };
  const own = readPhoneContext(f.store.read(), { anchor, targetIds: ['lin'] });
  assert.equal(own[0].type, 'pat'); assert.deepEqual(own[0].pat, { targetId: 'zhou' }); assert.equal(own[0].author.id, 'lin');
  assert.equal(readPhoneContext(f.store.read(), { anchor, targetIds: ['xu'] }).length, 0);
  assert.equal(readPhoneContext(f.store.read(), { anchor, publicOnly: true }).length, 0);
  await f.store.deleteContact('zhou');
  assert.equal(f.store.read().conversations[f.group.id][0].text, '林舟拍了拍周予');
  await f.store.deleteMessage(f.group.id, 'p'); assert.equal(f.store.read().conversations[f.group.id].length, 0);
});

test('local pat save failure rolls back and the next normal save still works', async () => {
  const f = await setup(), before = structuredClone(f.store.read()); f.h.saveFailure = new Error('模拟保存失败');
  await assert.rejects(f.private.pat('lin', 'lin'), /保存失败/); assert.deepEqual(f.store.read(), before);
  f.h.saveFailure = null; await f.private.pat('lin', '@user'); assert.equal(f.store.read().conversations.lin.length, 1);
});

test('chat renderer exposes both parties as pat targets and separates centered events from bubbles and quotes', async () => {
  const f = await setup(), batch = readTimeline(f.target.messages);
  await f.store.appendMessages(f.group.id, [{ id: 'before', role: 'assistant', speakerId: 'lin', text: '前一句。', batch },
    { id: 'pat', role: 'assistant', speakerId: 'lin', type: 'pat', pat: { targetId: '@user' }, text: '林舟拍了拍你', batch },
    { id: 'after', role: 'assistant', speakerId: 'lin', text: '后一句。', batch }, { id: 'mine', role: 'user', speakerId: '@user', text: '我到了。', batch }]);
  const options = { ui: { view: 'group-chat', groupId: f.group.id, drafts: new Map(), visibleMessages: 60, batch, selectedMessage: 'pat', defaultUser: '我' }, busy: new Set() };
  const html = renderChat(f.store.read(), options);
  assert.match(html, /data-pat-target="lin"/); assert.match(html, /data-pat-target="@user"/);
  assert.match(html, /class="[^"\n]*pat-row[^"\n]*"/);
  assert.match(html, /class="pat-message"[^>]*data-message="pat"/);
  assert.doesNotMatch(html, /message-reply-action/);
  assert.doesNotMatch(html, /grouped-top|grouped-bottom/);
  assert.match(html, /data-action="favorite-add"/);
  assert.doesNotMatch(html, /data-action="delete-message"/);
});


for (const host of ['native', 'luker']) for (const kind of ['private', 'groups']) for (const self of [false, true]) test(`${host}: ${kind} ${self ? 'self' : 'other'} pat toggles the latest own event with two saves and zero model or notification`, async () => {
  const f = await setup(host), id = kind === 'private' ? 'lin' : f.group.id, targetId = self ? '@user' : 'lin';
  const before = f.h.metadataSaves;
  await f[kind].pat(id, targetId);
  assert.equal(f.store.read().conversations[id].length, 1);
  assert.equal(f.store.read().conversations[id][0].pat.targetId, targetId);
  await f[kind].pat(id, targetId);
  assert.deepEqual(f.store.read().conversations[id], []);
  assert.equal(f.h.metadataSaves, before + 2);
  assert.deepEqual(f.requests, []); assert.deepEqual(f.incoming, []); assert.deepEqual(f.notices, []);
  assert.deepEqual(createPhoneStore({ target: f.target }).read().conversations[id], []);
});

for (const kind of ['private', 'groups']) test(`${kind}: a different target or intervening plain or character message starts a new pat`, async () => {
  const f = await setup(), id = kind === 'private' ? 'lin' : f.group.id, batch = readTimeline(f.target.messages);
  await f[kind].pat(id, 'lin'); await f[kind].pat(id, '@user');
  assert.deepEqual(f.store.read().conversations[id].map(m => m.pat.targetId), ['lin', '@user']);
  await f[kind].send(id, '中间的本人短信。'); await f[kind].pat(id, '@user');
  assert.equal(f.store.read().conversations[id].length, 4);
  await f.store.appendMessage(id, { id: 'character-text', role: 'assistant', speakerId: 'lin', text: '中间的角色短信。', batch });
  await f[kind].pat(id, '@user'); assert.equal(f.store.read().conversations[id].length, 6);
  await f.store.appendMessage(id, { id: 'character-pat', role: 'assistant', speakerId: 'lin', type: 'pat', pat: { targetId: '@user' }, text: '林舟拍了拍你', batch });
  await f[kind].pat(id, '@user'); assert.equal(f.store.read().conversations[id].length, 8);
  assert.equal(f.store.read().conversations[id][6].id, 'character-pat');
});

test('pat toggle selects only the current batch tail and removes exactly that index when story IDs repeat', async () => {
  const f = await setup(), batch = readTimeline(f.target.messages);
  const own = { id: 'story:5:0', role: 'user', speakerId: '@user', type: 'pat', pat: { targetId: 'lin' }, text: '你拍了拍林舟' };
  const old = { ...own, batch: { key: 'old', label: '过去' } };
  await f.store.appendMessage('lin', old);
  await f.private.pat('lin', 'lin');
  assert.equal(f.store.read().conversations.lin.length, 2, '过去段末同目标不被撤回');
  // The same story ID can be present in separate batches, even out of array order.
  f.store.read().conversations.lin[1] = { ...own, batch };
  await f.store.appendMessage('lin', { ...own, batch: { key: 'elsewhere', label: '另一段' } });
  await f.private.pat('lin', 'lin');
  assert.deepEqual(f.store.read().conversations.lin, [old, { ...own, batch: { key: 'elsewhere', label: '另一段' } }]);
});

for (const kind of ['private', 'groups']) test(`${kind}: two concurrent pat intents serialize through a slow save and leave no event`, async () => {
  const f = await setup(), id = kind === 'private' ? 'lin' : f.group.id, before = f.h.metadataSaves;
  let release; const gate = new Promise(resolve => { release = resolve; }), save = f.h.context.saveMetadata;
  f.h.context.saveMetadata = async () => { await gate; return save(); };
  const first = f[kind].pat(id, 'lin'), second = f[kind].pat(id, 'lin');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.store.read().conversations[id].length, 1); assert.equal(f.h.metadataSaves, before);
  release(); await Promise.all([first, second]);
  assert.deepEqual(f.store.read().conversations[id], []); assert.equal(f.h.metadataSaves, before + 2);
});

for (const kind of ['private', 'groups']) test(`${kind}: failed append and withdrawal both roll back, and the next gesture uses the saved state`, async () => {
  const f = await setup(), id = kind === 'private' ? 'lin' : f.group.id, before = structuredClone(f.store.read()), saves = f.h.metadataSaves;
  f.h.saveFailure = new Error('保存失败');
  await assert.rejects(f[kind].pat(id, 'lin'), /保存失败/); assert.deepEqual(f.store.read(), before);
  f.h.saveFailure = null; await f[kind].pat(id, 'lin'); const added = structuredClone(f.store.read());
  f.h.saveFailure = new Error('撤回保存失败');
  await assert.rejects(f[kind].pat(id, 'lin'), /保存失败/); assert.deepEqual(f.store.read(), added);
  f.h.saveFailure = null; await f[kind].pat(id, 'lin');
  assert.deepEqual(f.store.read().conversations[id], []); assert.equal(f.h.metadataSaves, saves + 2);
});

test('a queued second gesture creates one event after the first append fails without retry', async () => {
  const f = await setup(), save = f.h.context.saveMetadata, before = f.h.metadataSaves; let attempts = 0;
  f.h.context.saveMetadata = async () => { if (++attempts === 1) throw new Error('首次失败'); return save(); };
  const first = f.private.pat('lin', 'lin'), second = f.private.pat('lin', 'lin');
  await assert.rejects(first, /保存失败/); await second;
  assert.equal(f.store.read().conversations.lin.length, 1); assert.equal(f.h.metadataSaves, before + 1); assert.equal(attempts, 2);
});

for (const kind of ['private', 'groups']) test(`${kind}: consecutive generated pats append independently and retain notifications`, async () => {
  const f = await setup(), id = kind === 'private' ? 'lin' : f.group.id;
  const message = { speakerId: 'lin', type: 'pat', pat: { targetId: '@user' }, text: '林舟拍了拍你' };
  f.answer({ anchor: { memberIds: ['lin', 'zhou', '@user'], speakerIds: ['lin'] }, messages: [message, message] });
  const before = f.h.metadataSaves; await f[kind].continueChat(id);
  assert.equal(f.store.read().conversations[id].length, 2); assert.equal(f.notices.length, 2); assert.deepEqual(f.incoming, [id]);
  assert.equal(f.requests.length, 1); assert.equal(f.h.metadataSaves, before + 1);
  await f[kind].pat(id, '@user'); assert.equal(f.store.read().conversations[id].length, 3); assert.equal(f.notices.length, 2);
});

for (const kind of ['private', 'groups']) test(`${kind}: withdrawing a favorited pat preserves its permanent snapshot and original source`, async () => {
  const f = await setup(), id = kind === 'private' ? 'lin' : f.group.id;
  await f[kind].pat(id, 'lin'); const message = f.store.read().conversations[id][0];
  await f.store.addFavorite({ app: 'messages', kind: 'message', conversationId: id, messageId: message.id, batchKey: message.batch.key });
  const favorites = structuredClone(f.store.read().favorites);
  await f[kind].pat(id, 'lin'); assert.deepEqual(f.store.read().conversations[id], []); assert.deepEqual(f.store.read().favorites, favorites);
  assert.equal(favorites[0].snapshot.text, '你拍了拍林舟'); assert.equal(favorites[0].source.messageId, message.id); assert.equal(favorites[0].source.batchKey, message.batch.key);
});

for (const historical of [false, true]) for (const role of ['user', 'assistant']) test(`${historical ? 'past' : 'current'} ${role} pat offers favorite without delete or group reply while normal messages keep delete`, async () => {
  const f = await setup(), current = readTimeline(f.target.messages), batch = historical ? { key: 'old', label: '过去' } : current;
  await f.store.appendMessages(f.group.id, [{ id: 'pat-actions', role, speakerId: role === 'user' ? '@user' : 'lin', type: 'pat', pat: { targetId: 'lin' }, text: '拍一拍记录', batch }, { id: 'plain', role: 'user', text: '普通短信', batch: current }]);
  const ui = { view: 'group-chat', groupId: f.group.id, drafts: new Map(), visibleMessages: 60, batch: current, historyOpen: historical, visibleHistory: 60, selectedMessage: 'pat-actions', defaultUser: '我' };
  const html = renderChat(f.store.read(), { ui, busy: new Set() });
  assert.match(html, /data-action="favorite-add"/); assert.doesNotMatch(html, /data-action="delete-message"/); assert.doesNotMatch(html, /data-action="reply-message"/);
  const plain = renderChat(f.store.read(), { ui: { ...ui, selectedMessage: 'plain' }, busy: new Set() }); assert.match(plain, /data-action="delete-message"/);
});
