import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhoneStore } from '../src/store.js';
import { createHarness } from './harness.mjs';
import { lockNotifications, unreadConversations, notificationEventKey } from '../src/notifications.js';
import { renderHome } from '../src/ui/home.js';

const state = () => ({ contacts: [{ id: 'lin', name: '林舟' }], groups: [], conversations: {}, forum: { posts: [] } });
const incoming = (id, body = '晚点见。') => ({ id, role: 'assistant', text: body, createdAt: '2026-10-29T03:35:00.000Z', storyDate: '1686-10-29', timeLabel: '11:35' });

test('an incoming save archives immutable bilingual snapshots even while reading, without a second save', async () => {
  const h = createHarness({ metadata: { pocketPhone: state() } }), events = [];
  const store = createPhoneStore({ target: h.host.captureChat(), isReading: () => true, onNotifications: records => { assert.equal(h.metadataSaves, 1); events.push(...records); } });
  await store.appendMessages('lin', [{ ...incoming('a', 'Good morning.'), translation: '早上好。' }, incoming('b')]);
  assert.equal(h.metadataSaves, 1);
  assert.equal(store.read().notifications?.items.length, 2);
  assert.deepEqual(events.map(row => row.id), ['lin', 'lin']);
  assert.ok(events.some(row => row.text === 'Good morning.\n早上好。' && row.title === '林舟' && row.app === 'messages'));
  assert.equal(store.read().conversations.lin[0].read, true);
  const snapshot = structuredClone(store.read().notifications.items);
  await store.deleteMessage('lin', 'a');
  assert.deepEqual(store.read().notifications.items, snapshot, 'deleting the original message does not rewrite history');
});

test('first seed imports only existing unread SMS and Ins replies once, and clear preserves initialized across reopen', async () => {
  const initial = state(); initial.conversations.lin = [{ ...incoming('older-unread'), read: false }, { ...incoming('seed-sms'), read: false }, { ...incoming('read-sms'), read: true }];
  initial.social = { npcs: [], feedIds: ['post'], posts: [{ id: 'post', authorId: 'lin', text: '动态', comments: [{ id: 'own', role: 'user', text: '留言' }, { id: 'seed-ins', authorId: 'lin', name: '林舟', replyToId: 'own', read: false, text: '谢谢', publishedAt: '1686-10-29 11:35' }] }] };
  const h = createHarness({ metadata: { pocketPhone: initial } }), store = createPhoneStore({ target: h.host.captureChat() });
  await store.initializeNotifications();
  assert.equal(store.read().notifications.initialized, true); assert.equal(store.read().notifications.items.length, 3);
  assert.deepEqual(new Set(store.read().notifications.items.map(row => row.kind)), new Set(['message', 'social-reply']));
  await store.initializeNotifications(); assert.equal(h.metadataSaves, 1);
  await store.clearNotifications(); assert.equal(h.metadataSaves, 2); assert.equal(store.read().conversations.lin[0].read, false);
  const reopened = createPhoneStore({ target: { ...h.host.captureChat(), metadata: h.persistedMetadata } });
  await reopened.initializeNotifications(); assert.deepEqual(reopened.read().notifications, { initialized: true, items: [] }); assert.equal(h.metadataSaves, 2);
  await reopened.appendMessage('lin', incoming('new')); assert.equal(reopened.read().notifications.items.length, 1);
});

test('cleared or repeated source IDs cannot reappear through ordinary writes; only new assistant IDs archive', async () => {
  const h = createHarness({ metadata: { pocketPhone: state() } }), store = createPhoneStore({ target: h.host.captureChat() });
  await store.appendMessage('lin', incoming('old')); await store.clearNotifications();
  await store.appendMessage('lin', incoming('old')); await store.appendMessage('lin', { id: 'user', role: 'user', text: '自己发的' });
  assert.deepEqual(store.read().notifications.items, []);
  await store.markRead('lin'); assert.deepEqual(store.read().notifications.items, []);
  await store.appendMessage('lin', incoming('fresh')); assert.equal(store.read().notifications.items.length, 1);
});

test('failed content and clear saves roll back notification state and never deliver an unpersisted record', async () => {
  const h = createHarness({ metadata: { pocketPhone: state() } }), records = [];
  const store = createPhoneStore({ target: h.host.captureChat(), onNotifications: added => records.push(...added) });
  h.saveFailure = new Error('保存失败'); await assert.rejects(store.appendMessage('lin', incoming('failed')), /保存失败/);
  assert.equal(store.read().notifications, undefined); assert.deepEqual(records, []);
  h.saveFailure = null; await store.appendMessage('lin', incoming('saved')); const before = structuredClone(store.read().notifications);
  h.saveFailure = new Error('保存失败'); await assert.rejects(store.clearNotifications(), /保存失败/); assert.deepEqual(store.read().notifications, before); assert.equal(records.length, 1);
});

test('service saves archive their actual social, forum and liangshi events, never an old returned author post', async () => {
  const { createSocialService } = await import('../src/social.js');
  const { createForumService } = await import('../src/forum.js');
  const initial = state(); initial.social = { npcs: [], feedIds: [], posts: [{ id: 'old', authorId: 'lin', text: '旧动态。', publishedAt: '1686-10-28 11:00', comments: [] }] };
  const h = createHarness({ metadata: { pocketPhone: initial } }), store = createPhoneStore({ target: h.host.captureChat() });
  const social = createSocialService({ store, contextReader: { readForSocial: async () => ({ user: '我', clock: { date: '1686-10-29', time: '11:35' } }) }, modelClient: { complete: async () => JSON.stringify({ posts: [{ authorId: 'lin', text: '新动态', image: { description: '湖边' } }] }) } });
  await social.generateAuthor('lin');
  assert.equal(store.read().notifications?.items[0]?.kind, 'social-author'); assert.equal(store.read().notifications.items[0].text, '新动态。');
  const forum = createForumService({ store, contextReader: { readForForum: async () => ({ clock: { date: '1686-10-29', time: '11:35' } }) }, modelClient: { complete: async () => JSON.stringify({ posts: [{ title: '书店', author: '匿名', content: '旧书交流', comments: [] }] }) } });
  await forum.refresh(); assert.equal(store.read().notifications.items[0].kind, 'forum');
  const before = store.read().notifications.items.length;
  await store.updateLiangshi(() => ({ accounts: [{ id: 'a', name: '阿舟' }], posts: [{ id: 'p', authorId: 'a', text: '广场新文', comments: [], reposts: [] }], topics: [], feedIds: ['p'] }), { notice: { kind: 'liangshi-feed' } });
  assert.equal(store.read().notifications.items.length, before + 1); assert.equal(store.read().notifications.items[0].text, '广场新文');
});

test('own publishing and editing never claim that new third-party discussion arrived', async () => {
  const { createLiangshiService } = await import('../src/liangshi.js'); const initial = state();
  initial.liangshi = { accounts: [{ id: 'self', ownerId: '@user', name: '我', handle: 'self' }], posts: [{ id: 'p', authorId: 'self', userAuthored: true, text: '旧文', comments: [], reposts: [] }], topics: [], userPostIds: ['p'], feedIds: [] };
  initial.notifications = { initialized: true, items: [] };
  const h = createHarness({ metadata: { pocketPhone: initial } }), store = createPhoneStore({ target: h.host.captureChat() });
  const service = createLiangshiService({ store, contextReader: { readClock: () => ({ date: '1686-10-29', time: '11:35' }), readUserProfile: () => ({ name: '我' }) } });
  await service.editUser('p', { text: '新文' }); await service.editUser('p', { text: '再改一遍' }); await service.publishUser({ text: '本人新文' });
  assert.deepEqual(store.read().notifications.items, []); assert.equal(h.metadataSaves, 3);
});

test('a display observer cannot turn successfully saved source content into a save failure', async () => {
  const h = createHarness({ metadata: { pocketPhone: state() } }), store = createPhoneStore({ target: h.host.captureChat(), onNotifications: () => { throw new Error('显示失败'); } });
  await store.appendMessage('lin', incoming('saved')); assert.equal(h.persistedMetadata.pocketPhone.notifications.items.length, 1); assert.equal(h.metadataSaves, 1);
});

test('clearing history removes lock notices without reading sources, and deleting a new source never revives the old one', async () => {
  const initial = state(); initial.conversations.lin = [{ ...incoming('old'), read: false }];
  const h = createHarness({ metadata: { pocketPhone: initial } }), store = createPhoneStore({ target: h.host.captureChat() });
  await store.initializeNotifications(); assert.equal(lockNotifications(store.read()).length, 1);
  await store.clearNotifications(); assert.deepEqual(lockNotifications(store.read()), []); assert.equal(unreadConversations(store.read()).length, 1);
  await store.appendMessage('lin', incoming('new')); assert.equal(lockNotifications(store.read())[0].message.id, 'new');
  await store.deleteMessage('lin', 'new'); assert.deepEqual(lockNotifications(store.read()), [], 'the old unread message remains cleared'); assert.equal(store.read().conversations.lin[0].read, false);
});

test('lock notifications bind the exact displayed SMS and Ins reply keys before history is initialized', () => {
  const initial = state(); initial.conversations.lin = [{ ...incoming('a', '旧短信'), read: false }, { ...incoming('b', '显示的短信'), read: false }];
  initial.social = { posts: [{ id: 'p', authorId: 'lin', comments: [{ id: 'x', replyToId: 'own', read: false, text: '旧回应' }, { id: 'y', replyToId: 'own', read: false, text: '显示的回应' }] }] };
  const rows = lockNotifications(initial), message = rows.find(row => !row.isSocial), reply = rows.find(row => row.isSocial);
  assert.equal(message.notificationKey, notificationEventKey('message', 'lin', ['b']));
  assert.equal(reply.notificationKey, notificationEventKey('social-reply', 'p', ['y']));
  assert.deepEqual([message.preview, message.count, reply.preview, reply.count], ['显示的短信', 2, '显示的回应', 2]);
  const markup = renderHome(initial, { weather: { text: '晴', temperature: '20°' } });
  assert.equal((markup.match(/data-action="open-lock-notice"/g) || []).length, 2);
  for (const row of rows) assert.ok(markup.includes(`data-notification-key="${row.notificationKey.replaceAll('"', '&quot;')}"`));
});

test('opening one legacy lock notice seeds the other unread rows before the original markRead save', async () => {
  const initial = state(); initial.conversations.lin = [{ ...incoming('a'), read: false }, { ...incoming('b'), read: false }];
  initial.contacts.push({ id: 'zhou', name: '周策' }); initial.conversations.zhou = [{ ...incoming('c'), read: false }];
  const h = createHarness({ metadata: { pocketPhone: initial } }), store = createPhoneStore({ target: h.host.captureChat() });
  assert.equal(typeof store.dismissNotification, 'function');
  const key = notificationEventKey('message', 'lin', ['b']); let opened = false;
  const dismissed = store.dismissNotification(key, () => opened);
  opened = true; const read = store.markRead('lin');
  await Promise.all([dismissed, read]);
  assert.equal(h.metadataSaves, 2, 'one seed-and-dismiss save plus the unchanged read save');
  assert.deepEqual(new Set(store.read().notifications.items.map(row => row.key)), new Set([notificationEventKey('message', 'lin', ['a']), notificationEventKey('message', 'zhou', ['c'])]));
  assert.equal(store.read().notifications.initialized, true); assert.equal(store.read().conversations.lin.length, 2);
  assert.equal(store.read().conversations.zhou[0].read, false);
  const reopened = createPhoneStore({ target: { ...h.host.captureChat(), metadata: h.persistedMetadata } });
  await reopened.initializeNotifications(); await reopened.dismissNotification(key); await reopened.dismissNotification('');
  assert.equal(h.metadataSaves, 2); assert.equal(reopened.read().notifications.items.length, 2);
});

test('failed navigation and failed dismissal saves preserve notification history', async () => {
  const h = createHarness({ metadata: { pocketPhone: state() } }), events = [], store = createPhoneStore({ target: h.host.captureChat(), onNotifications: rows => events.push(...rows) });
  await store.appendMessages('lin', [incoming('a'), incoming('b')]);
  const before = structuredClone(store.read()), saves = h.metadataSaves, key = notificationEventKey('message', 'lin', ['b']);
  assert.equal(typeof store.dismissNotification, 'function');
  await store.dismissNotification(key, () => false); assert.deepEqual(store.read(), before); assert.equal(h.metadataSaves, saves);
  await store.dismissNotification('missing'); assert.equal(h.metadataSaves, saves);
  h.saveFailure = new Error('保存失败');
  await assert.rejects(store.dismissNotification(key), /保存失败/);
  assert.deepEqual(store.read(), before); assert.equal(events.length, 2, 'dismiss never emits a new content notification');
});

test('dismissal uses queued source state and does not seed a source deleted earlier in the queue', async () => {
  const initial = state(); initial.conversations.lin = ['a', 'b', 'c'].map(id => ({ ...incoming(id), read: false }));
  const h = createHarness({ metadata: { pocketPhone: initial } }), store = createPhoneStore({ target: h.host.captureChat() });
  assert.equal(typeof store.dismissNotification, 'function');
  const removed = store.deleteMessage('lin', 'a'); let opened = false;
  const dismissed = store.dismissNotification(notificationEventKey('message', 'lin', ['b']), () => opened);
  opened = true; const read = store.markRead('lin');
  await Promise.all([removed, dismissed, read]);
  assert.deepEqual(store.read().notifications.items.map(row => row.key), [notificationEventKey('message', 'lin', ['c'])]);
  assert.equal(h.metadataSaves, 3);
});

test('queued content additions and clear neither lose new keys nor revive a dismissed key', async () => {
  const h = createHarness({ metadata: { pocketPhone: state() } }), target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.appendMessage('lin', incoming('a'));
  assert.equal(typeof store.dismissNotification, 'function');
  const save = target.saveMetadata; let release, started;
  const waiting = new Promise(resolve => started = resolve);
  target.saveMetadata = async () => { started(); await new Promise(resolve => release = resolve); return save(); };
  const adding = store.appendMessage('lin', incoming('b')); await waiting;
  const dismissed = store.dismissNotification(notificationEventKey('message', 'lin', ['a']));
  const next = store.appendMessage('lin', incoming('c'));
  target.saveMetadata = save; release(); await Promise.all([adding, dismissed, next]);
  assert.deepEqual(new Set(store.read().notifications.items.map(row => row.key)), new Set(['b', 'c'].map(id => notificationEventKey('message', 'lin', [id]))));
  await Promise.all([store.clearNotifications(), store.dismissNotification(notificationEventKey('message', 'lin', ['b'])), store.appendMessage('lin', incoming('d'))]);
  assert.deepEqual(store.read().notifications.items.map(row => row.key), [notificationEventKey('message', 'lin', ['d'])]);
  assert.deepEqual(store.read().conversations.lin.map(row => row.id), ['a', 'b', 'c', 'd']);
});
