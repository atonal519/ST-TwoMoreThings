import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader, createBackflowService } from '../src/context.js';

test('SMS continuity retains recent prior batches and scopes proactive references to their own contact', async () => {
  const h = createHarness({ messages: [
    { is_user: false, mes: '午后休假。<!-- SDC-end | date=2026-10-18 | time=15:30 -->' },
    { is_user: true, mes: '继续。' },
    { is_user: false, mes: '傍晚还在休息。<!-- SDC-end | date=2026-10-18 | time=17:30 -->' },
  ], metadata: { pocketPhone: {
    contacts: [{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }, { id: 'other', name: '旁人' }], groups: [],
    conversations: {
      lin: [{ id: 'agreement', role: 'assistant', text: '这三天不安排工作，周二晚七点书店见。', translation: 'No work for three days.',
        storyDate: '2026-10-18', timeLabel: '15:30', batch: { key: '[0,"2026-10-18","15:30"]' } }],
      zhou: [{ role: 'user', text: '周予的私信，只给周予。', batch: { key: 'older' } }],
      other: [{ role: 'user', text: '未入选人物的私信。', batch: { key: 'older' } }],
    }, social: { posts: [], npcs: [], feedIds: [] },
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  const before = structuredClone(target.metadata);
  const contact = await reader.readForContact('lin');
  assert.deepEqual(contact.history, [], 'current batch still means current batch');
  assert.equal(contact.previousMessages[0].text, '这三天不安排工作，周二晚七点书店见。');
  assert.equal(contact.previousMessages[0].translation, 'No work for three days.');
  assert.equal(contact.previousMessages[0].time, '2026-10-18 15:30');
  const authors = store.read().contacts.slice(0, 2).map(person => ({ ...person, kind: 'contact' }));
  const plain = await reader.readForSocial(authors);
  assert.equal(JSON.stringify(plain).includes('这三天不安排工作'), false, 'public-only source reads do not request private threads');
  const proactive = await reader.readForSocial(authors, { includePrivateMessages: true });
  assert.equal(proactive.authors[0].privateHistory[0].text, '这三天不安排工作，周二晚七点书店见。');
  assert.equal(proactive.authors[1].privateHistory[0].text, '周予的私信，只给周予。');
  assert.equal(JSON.stringify(proactive.authors[0]).includes('周予的私信'), false);
  assert.equal(JSON.stringify(proactive).includes('未入选人物的私信'), false);
  assert.deepEqual(target.metadata, before);
  assert.equal(h.modelRequests.length, 0);
});

test('SMS receives saved public feed posts across story floors without image files, private sources or another model', async () => {
  const h = createHarness({ messages: [{ is_user: false, mes: '新一楼。' }], metadata: { pocketPhone: {
    contacts: [{ id: 'lin', name: '林舟' }], conversations: {}, groups: [], social: { npcs: [], feedIds: ['post'], posts: [
      { id: 'post', authorId: 'lin', text: 'The bookshop is open.', translation: '书店开门了。', publishedAt: '2026-10-18 18:00',
        batch: { key: 'earlier-floor' }, image: { description: '书店窗边', path: '/private/full-image.png' },
        comments: [{ name: '小满', text: 'See you there.', translation: '那里见。' }] },
      { id: 'older', authorId: 'lin', text: '不把整份人物历史带入。', publishedAt: '2026-09-01 18:00' },
    ] },
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const before = structuredClone(target.metadata);
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  for (const context of [await reader.readForContact('lin'), await (async () => {
    await store.saveGroup('', { name: '读书群', memberIds: ['lin'], userIsMember: true });
    return reader.readForGroup(store.read().groups[0].id);
  })()]) {
    assert.equal(context.social.length, 1);
    assert.deepEqual(context.social[0], { author: '林舟', text: 'The bookshop is open.', translation: '书店开门了。', publishedAt: '2026-10-18 18:00',
      image: { description: '书店窗边' }, comments: [{ name: '小满', text: 'See you there.', translation: '那里见。' }] });
    assert.ok(!JSON.stringify(context.social).includes('/private/'));
    assert.ok(!JSON.stringify(context.social).includes('整份人物历史'));
  }
  assert.deepEqual(target.metadata.pocketPhone.social, before.pocketPhone.social);
  assert.equal(h.modelRequests.length, 0);
});

test('forum receives one story background and setting without user identity or private recall', async () => {
  const latest = '周予经过广场。<!-- QQJ-end | date=2026-10-18 | time=18:00 -->';
  const h = createHarness({ messages: [
    { is_user: false, mes: '上一楼，不作为论坛背景。' },
    { is_user: false, name: '叙述', mes: latest },
    { is_user: true, mes: '随后用户的私下发言。' },
  ], metadata: { foreign: { keep: true } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.saveUserProfile({ name: '用户私有姓名', nickname: '用户私有网名' });
  await store.upsertContacts([{ id: 'lin', name: '林舟', source: { kind: 'qqj', entityId: 'q1' } }]);
  await store.appendMessage('lin', { id: 'private-sms', role: 'user', text: '短信私有内容' });
  const scans = [], readWorldInfo = target.readWorldInfo;
  target.readWorldInfo = options => { scans.push(options); return readWorldInfo(options); };
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => { throw new Error('论坛不应访问人物记忆'); } });
  const before = structuredClone(target.metadata), saves = h.metadataSaves;
  const context = await reader.readForForum();
  assert.deepEqual(Object.keys(context).sort(), ['clock', 'setting', 'storyBackground', 'worldbook']);
  assert.deepEqual(context.storyBackground, [{ speaker: '叙述', text: latest }]);
  assert.ok(context.setting.includes(target.character.description));
  assert.equal(context.clock.time, '18:00');
  assert.deepEqual(scans, [{ scanText: latest }], 'worldbook activation still uses only the latest AI floor');
  const serialized = JSON.stringify(context);
  for (const privateText of ['用户私有姓名', '用户私有网名', '短信私有内容', '随后用户的私下发言', '上一楼']) assert.equal(serialized.includes(privateText), false);
  assert.deepEqual(target.metadata, before);
  assert.equal(h.metadataSaves, saves);
  assert.equal(h.modelRequests.length, 0);
});

test('reads one AI floor and the complete current batch without removing saved history', async () => {
  const history = Array.from({ length: 1000 }, (_, i) => ({ id: `m${i}`, role: i % 2 ? 'assistant' : 'user', text: `短信${i}`, batch: { key: i < 800 ? 'older' : '[999]', label: '时间卡口' }, createdAt: new Date(2026, 9, 1, 0, i).toISOString() }));
  const h = createHarness({ messages: Array.from({ length: 1000 }, (_, i) => ({ mes: `剧情${i}`, is_user: false })), metadata: { pocketPhone: { schemaVersion: 1, contacts: [{ id: 'lin', name: '林舟' }], conversations: { lin: history }, forum: { posts: [] }, injectEnabled: false } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const reader = createContextReader({ target, store });
  const context = await reader.readForContact('lin');
  assert.equal(context.history.length, 200);
  assert.equal(context.history[0].text, '短信800');
  assert.equal(context.previousMessages.length, 20);
  assert.equal(context.previousMessages[0].text, '短信780', 'prior context is a bounded tail, without duplicating the current batch');
  assert.equal(context.story.length, 1);
  assert.equal(context.story[0].text, '剧情999');
  assert.equal(store.read().conversations.lin.length, 1000);
  assert.equal(await createBackflowService({ target, store, modelClient: { complete() { throw Error('关闭回流时不请求摘要'); } } }).prepare(), '');
});

test('forum context excludes private SMS and QQJ author-side background', async () => {
  const h = createHarness();
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'lin', name: '林舟', source: { kind: 'qqj', entityId: 'q1' } }]);
  await store.appendMessage('lin', { text: '私聊密码', role: 'user' });
  const bridge = { readContext: () => ({ status: 'ready', routerText: '作者侧秘密', actors: [{ entityId: 'q1', memoryText: '林舟的相关记忆' }] }) };
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => bridge });
  assert.equal((await reader.readForContact('lin')).related, '林舟的相关记忆');
  const forum = await reader.readForForum();
  assert.ok(!JSON.stringify(forum).includes('私聊密码'));
  assert.ok(!JSON.stringify(forum).includes('作者侧秘密'));
});

