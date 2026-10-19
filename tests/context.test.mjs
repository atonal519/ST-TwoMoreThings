import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader, createBackflowService } from '../src/context.js';

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

