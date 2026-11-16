import test from 'node:test';
import assert from 'node:assert/strict';
import * as content from '../src/content.js';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader } from '../src/context.js';
import { createMessageService } from '../src/messages.js';
import { createGroupService } from '../src/groups.js';
import { createInspectPhoneService, inspectionThreads } from '../src/inspect-phone.js';
import { renderCardBody, renderAttachments } from '../src/ui/cards.js';
import { renderMessage, renderChat } from '../src/ui/messages.js';
import { renderFavoriteDetail } from '../src/ui/favorites.js';
import { renderInspection } from '../src/ui/inspect-phone.js';
import { readPhoneContext } from '../src/phone-context.js';
import { replyContext } from '../src/replies.js';

function fixture(hostKind = 'native') {
  const h = createHarness({ hostKind, messages: [{ mes: '<!-- QQJ-end | date=2026年11月16日 | weekday=周一 | time=20:15 -->\n原文。' }], metadata: { pocketPhone: {
    contacts: [{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }],
    groups: [{ id: 'friends', name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: true }], conversations: {},
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target }), reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  const requests = []; let answer = {};
  const modelClient = { complete: async request => { requests.push(request); return JSON.stringify(answer); } };
  return { h, target, store, reader, requests, setAnswer: value => { answer = value; },
    messages: createMessageService({ target, store, contextReader: reader, modelClient }), groups: createGroupService({ target, store, contextReader: reader, modelClient }),
    inspection: createInspectPhoneService({ target, store, contextReader: reader, modelClient }) };
}

test('voice normalization preserves full original and translation, ignores claimed seconds and never infers from plain words', () => {
  const original = `多语言 😀\n${'长'.repeat(1000)}结尾`, translation = '译'.repeat(2000);
  const message = content.normalizeContent({ type: 'voice', text: original, translation, seconds: 2, audio: 'https://example.invalid/a.mp3' });
  assert.deepEqual(message, { type: 'voice', text: original, translation });
  assert.equal(content.normalizeContent({ type: 'voice', text: ' \n ' }), null);
  assert.deepEqual(content.normalizeContent({ text: '发一条语音吧。' }), { text: '发一条语音吧。' });
  assert.equal(typeof content.voiceDuration, 'function');
  for (const [text, seconds] of [['', 1], ['一 二\n三\t四', 1], ['一二三四五', 2], ['😀😀😀😀', 1], ['abcde', 2], ['字'.repeat(1000), 250]]) assert.equal(content.voiceDuration(text), seconds);
  assert.equal(content.messageText(message), `[语音] ${original}`);
  assert.deepEqual(content.contextMessage({ ...message, role: 'assistant' }), { role: 'assistant', text: `[语音] ${original}`, translation });
  assert.equal(content.messageText(content.contextMessage(message)), `[语音] ${original}`);
});

for (const hostKind of ['native', 'luker']) test(`${hostKind}: both private parties send voice on existing send and one-reply paths with full context`, async () => {
  const f = fixture(hostKind), original = `实际语音\n${'说'.repeat(1000)}尾句`;
  await f.messages.sendCard('lin', { type: 'voice', text: original });
  const sent = f.store.read().conversations.lin[0];
  assert.equal(sent.type, 'voice'); assert.equal(sent.text, original); assert.equal(sent.role, 'user'); assert.equal(sent.timeLabel, '20:15'); assert.ok(sent.batch.key);
  assert.equal(f.requests.length, 0); assert.equal(f.h.metadataSaves, 1);
  f.setAnswer({ messages: [{ type: 'voice', text: 'Hello\nthere', translation: '你好。', seconds: 60 }, { text: '普通短信。' }] });
  await f.messages.continueChat('lin');
  assert.equal(f.requests.length, 1); assert.equal(f.h.metadataSaves, 2);
  const received = f.store.read().conversations.lin[1];
  assert.equal(received.type, 'voice'); assert.equal(received.text, 'Hello\nthere'); assert.equal(received.translation, '你好。'); assert.equal(received.seconds, undefined);
  const input = JSON.parse(f.requests[0].messages[0].content);
  assert.equal(input.history[0].text, `[语音] ${original}`);
  assert.equal(createPhoneStore({ target: f.target }).read().conversations.lin[0].text, original);
  assert.ok(readPhoneContext(f.store.read(), { targetIds: ['lin'], defaultUser: '我', anchor: { key: 'next-batch' } }).some(row => row.text === `[语音] ${original}`));
});

test('group voice sends keep user identity, batch and reply while generated voices retain their actual speaker', async () => {
  const f = fixture();
  await f.groups.sendCard('friends', { type: 'voice', text: '原群语音。', translation: 'Original.' });
  const first = f.store.read().conversations.friends[0];
  await f.groups.sendCard('friends', { type: 'voice', text: '引用着继续。' }, { replyToId: first.id });
  const sent = f.store.read().conversations.friends[1];
  assert.equal(sent.speakerId, '@user'); assert.equal(sent.replyToId, first.id); assert.equal(sent.type, 'voice'); assert.equal(sent.batch.key, first.batch.key);
  assert.equal(replyContext(sent, f.store.read().conversations.friends).messageText, '[语音] 原群语音。');
  f.setAnswer({ anchor: { memberIds: ['lin', 'zhou', '@user'], speakerIds: ['zhou'] }, messages: [{ speakerId: 'zhou', type: 'voice', text: '見つかったよ', translation: '找到了。' }] });
  await f.groups.continueChat('friends');
  const last = f.store.read().conversations.friends.at(-1);
  assert.equal(last.type, 'voice'); assert.equal(last.speakerId, 'zhou'); assert.equal(last.text, '見つかったよ'); assert.equal(last.translation, '找到了。'); assert.equal(f.requests.length, 1);
  assert.equal(JSON.parse(f.requests[0].messages[0].content).history[1].replyTo.messageText, '[语音] 原群语音。');
  f.store.read().groups[0].userIsMember = false;
  await assert.rejects(f.groups.sendCard('friends', { type: 'voice', text: '不能旁观代发。' }), /不在这个群/);
});

test('inspection voice stays in its private domain and live mirrors preserve real voice without becoming writable', async () => {
  const f = fixture(); await f.messages.sendCard('lin', { type: 'voice', text: '真实用户语音。' });
  const real = structuredClone(f.store.read().conversations);
  f.setAnswer({ conversations: [{ participantIds: ['@owner', 'zhou'], messages: [{ speakerId: '@owner', type: 'voice', text: 'PRIVATE_VOICE', translation: '私有语音。' }, { speakerId: 'zhou', type: 'voice', text: '对方语音。' }, { speakerId: 'zhou', type: 'voice', image: { description: '缺原文的语音不接为图片。' } }, { speakerId: '@user', type: 'voice', text: '不能代发。' }] }] });
  await f.inspection.refresh('lin');
  const thread = f.store.read().inspectPhone.owners.lin.conversations[0];
  assert.deepEqual(thread.messages.map(m => m.type), ['voice', 'voice']); assert.equal(thread.messages[0].text, 'PRIVATE_VOICE'); assert.equal(thread.messages[0].translation, '私有语音。');
  assert.equal(f.requests.length, 1); assert.deepEqual(f.store.read().conversations, real);
  assert.equal(JSON.stringify(await f.reader.readForContact('lin')).includes('PRIVATE_VOICE'), false);
  const mirror = inspectionThreads(f.store.read(), 'lin', '我').find(t => t.mirror);
  assert.equal(mirror.messages[0].type, 'voice');
  const ui = { view: 'inspect-chat', inspectOwnerId: 'lin', inspectThreadId: '@user', defaultUser: '我', expandedVoices: new Set(), batch: f.store.read().conversations.lin[0].batch, visibleMessages: 60, visibleHistory: 60, historyOpen: false };
  const html = renderInspection(f.store.read(), { ui, busy: new Set(), inspectPhone: f.inspection });
  assert.match(html, /data-action="toggle-voice"/); assert.doesNotMatch(html, /data-inspect-message=|data-action="inspect-delete"/);
});

test('voice renderers fold raw text, expand bilingual and escaped content, and scope repeated IDs across conversations and inspection', () => {
  const message = { id: 'same', role: 'assistant', type: 'voice', text: 'Hello <b>\n[blob.1f602]', translation: '你好。', seconds: 999 };
  const folded = renderCardBody(message);
  assert.match(folded, /voice-summary/); assert.match(folded, /5″/); assert.doesNotMatch(folded, /Hello|你好|<audio|<button/);
  const expanded = renderCardBody(message, false, { voiceExpanded: true });
  assert.match(expanded, /Hello &lt;b&gt;/); assert.match(expanded, /你好。/); assert.match(expanded, /inline-emoji/);
  const state = { contacts: [{ id: 'lin', name: '林舟' }], conversations: { lin: [message] } };
  const ui = { defaultUser: '我', expandedVoices: new Set([JSON.stringify(['messages', 'lin', 'legacy', 'same'])]) };
  const options = { contact: state.contacts[0], user: { name: '我' }, busy: new Set(), state, ui, conversationId: 'lin' };
  const normal = renderMessage(message, null, null, options);
  assert.match(normal, /aria-expanded="true"/); assert.match(normal, /voice-transcript/); assert.match(normal, /data-message="same"/);
  const other = renderMessage(message, null, null, { ...options, conversationId: 'zhou' });
  const inspection = renderMessage(message, null, null, { ...options, inspection: true, ui: { ...ui, inspectOwnerId: 'owner' } });
  assert.doesNotMatch(other, /voice-transcript/); assert.doesNotMatch(inspection, /voice-transcript/); assert.match(inspection, /data-inspect-message="same"/);
  const history = renderChat(state, { ui: { ...ui, view: 'chat', contactId: 'lin', batch: { key: 'new', label: '当前' }, historyOpen: true, visibleHistory: 60, visibleMessages: 60, drafts: new Map() }, busy: new Set() });
  assert.match(history, /past-batch/); assert.match(history, /voice-transcript/); assert.match(history, /data-message="same"/); assert.doesNotMatch(history, /data-action="reply-message"/);
});

test('voice favorites retain raw bilingual snapshot after source deletion and expand independently', async () => {
  const f = fixture(), original = 'Saved <voice>\n' + '完'.repeat(500);
  await f.messages.sendCard('lin', { type: 'voice', text: original, translation: '完整译文。' });
  const source = f.store.read().conversations.lin[0];
  await f.store.addFavorite({ app: 'messages', kind: 'message', conversationId: 'lin', messageId: source.id });
  const favorite = f.store.read().favorites[0];
  assert.equal(favorite.snapshot.text, original); assert.equal(favorite.snapshot.type, 'voice'); assert.equal(favorite.snapshot.translation, '完整译文。');
  await f.store.deleteMessage('lin', source.id);
  const ui = { favoriteId: favorite.id, expandedVoices: new Set() }, busy = new Set();
  assert.doesNotMatch(renderFavoriteDetail(f.store.read(), { ui, busy }), /voice-transcript/);
  ui.expandedVoices.add(JSON.stringify(['favorite', favorite.id]));
  const expanded = renderFavoriteDetail(f.store.read(), { ui, busy });
  assert.match(expanded, /voice-transcript/); assert.match(expanded, /Saved &lt;voice&gt;/); assert.ok(expanded.includes('完'.repeat(500))); assert.match(expanded, /完整译文。/); assert.match(expanded, /data-action="toggle-voice"/);
  assert.equal(f.requests.length, 0);
});

test('plus menu exposes a text-backed voice form with no recording or upload request', () => {
  const contact = { id: 'lin' }, busy = new Set();
  assert.match(renderAttachments({}, { attachment: 'menu' }, busy, contact, false), /data-action="choose-voice"/);
  const html = renderAttachments({}, { attachment: 'voice', attachmentDraft: { text: '原文<&>' } }, busy, contact, false);
  assert.match(html, /<textarea[^>]+name="text"[^>]+required/); assert.match(html, /原文&lt;&amp;&gt;/); assert.match(html, /aria-label="发送语音"/); assert.doesNotMatch(html, /type="file"|maxlength=/);
});
