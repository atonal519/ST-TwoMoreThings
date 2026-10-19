import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePayload } from '../src/api.js';
import { createPhoneStore } from '../src/store.js';
import { createMessageService } from '../src/messages.js';
import { createPhoneImageService } from '../src/phone-images.js';
import { createContextReader, createBackflowService } from '../src/context.js';
import { readTimeline } from '../src/timeline.js';
import { createHarness } from './harness.mjs';

function setup() {
  const h = createHarness({ messages: [{ is_user: false, mes: '<!-- QQJ-end | date=2026-10-18 | time=18:00 -->' }] });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  return { h, target, store, batch: readTimeline(target.messages) };
}

test('social photo generation is explicit, updates the existing post and reuses its saved image', async () => {
  const { h, store } = setup();
  await store.upsertContacts([{ id: 'lin', name: '林舟', nickname: '舟' }]);
  await store.updateSocial(social => ({ ...social, posts: [
    { id: 'photo-post', authorId: 'lin', text: '午后的窗边', image: { description: '我在窗边的自拍' }, likes: 12, comments: [{ name: '邻居', text: '下午好' }] },
    { id: 'other-post', authorId: 'lin', text: '今天晴朗' },
  ], feedIds: ['photo-post', 'other-post'] }));
  const before = structuredClone(store.read()), saves = h.metadataSaves;
  const calls = [], recipes = [], drawings = [];
  const service = createPhoneImageService({ store, modelClient: { complete: async request => {
    calls.push('recipe'); recipes.push(JSON.parse(request.messages[0].content));
    return '{"prompt":"selfie, window","characters":["林舟"],"size":"portrait"}';
  } }, apiProvider: () => ({
    apiVersion: 1,
    getBackendStatus: () => ({ configured: true, supportsCharacters: true }),
    getCharacters: () => ({ characters: [{ name: '林舟', tag: 'black hair, white shirt', nl: '黑发白衬衫' }] }),
    generate: async request => { calls.push('draw'); drawings.push(request); return { path: '/images/social-selfie.png', seed: 789 }; },
  }) });
  assert.deepEqual(calls, [], 'creating the service and reading posts do not generate images');
  assert.deepEqual(store.read(), before);
  assert.equal(h.metadataSaves, saves);
  const result = await service.generatePost('photo-post');
  assert.deepEqual(calls, ['recipe', 'draw']);
  assert.equal(recipes[0].description, '我在窗边的自拍');
  assert.deepEqual(recipes[0].sender, { name: '林舟', nickname: '舟' });
  assert.deepEqual(drawings[0].characters, [{ name: '林舟', tag: 'black hair, white shirt', nl: '黑发白衬衫' }]);
  assert.equal(drawings[0].save, true);
  const expected = structuredClone(before);
  Object.assign(expected.social.posts[0].image, { path: '/images/social-selfie.png', seed: 789 });
  assert.deepEqual(store.read(), expected, 'only the canonical post image changes; feed IDs and other records remain intact');
  assert.deepEqual(result, expected.social.posts[0].image);
  assert.deepEqual(h.persistedMetadata.pocketPhone, expected);
  assert.equal(h.metadataSaves, saves + 1);
  assert.deepEqual(await service.generatePost('photo-post'), result);
  assert.deepEqual(calls, ['recipe', 'draw'], 'an existing image needs neither prompt preparation nor another drawing');
  assert.equal(h.metadataSaves, saves + 1);
});

test('NPC social photos reject people before drawing and accept an explicit scenery-only recipe', async () => {
  const { h, store } = setup();
  await store.updateSocial(social => ({ ...social,
    npcs: [{ id: 'npc:neighbor', name: '邻居', description: '住在附近的路人' }],
    posts: [{ id: 'npc-photo', authorId: 'npc:neighbor', text: '窗边一角', image: { description: '窗边的盆栽' } }], feedIds: ['npc-photo'],
  }));
  const before = structuredClone(store.read()), saves = h.metadataSaves;
  let people = ['林舟'];
  const drawings = [];
  const service = createPhoneImageService({ store, modelClient: { complete: async () => JSON.stringify({ prompt: 'plant, window', characters: people }) }, apiProvider: () => ({
    apiVersion: 1,
    getBackendStatus: () => ({ configured: true, supportsCharacters: true }),
    getCharacters: () => ({ characters: [{ name: '林舟', tag: 'black hair' }] }),
    generate: async request => { drawings.push(request); return { path: '/images/plant.png', seed: 321 }; },
  }) });
  await assert.rejects(service.generatePost('npc-photo'), /包含人物.*未生成/);
  assert.deepEqual(drawings, []);
  assert.deepEqual(store.read(), before);
  assert.equal(h.metadataSaves, saves);
  people = [];
  await service.generatePost('npc-photo');
  assert.equal(drawings.length, 1);
  assert.deepEqual(drawings[0].characters, []);
  assert.equal(store.read().social.posts[0].image.path, '/images/plant.png');
  assert.deepEqual(store.read().contacts, [], 'a photo does not turn its NPC author into a contact');
  assert.equal(h.metadataSaves, saves + 1);
});

for (const [label, fields] of [['missing', {}], ['string', { characters: '林舟' }], ['null', { characters: null }]]) {
  test(`photo generation rejects a ${label} character list before drawing or saving`, async () => {
    const { h, store, batch } = setup();
    await store.upsertContacts([{ id: 'lin', name: '林舟' }]);
    await store.appendMessage('lin', { id: 'photo', role: 'assistant', type: 'image', image: { description: '林舟在窗边的自拍' }, batch });
    const before = structuredClone(store.read()), saves = h.metadataSaves;
    let drawings = 0;
    const service = createPhoneImageService({ store, modelClient: { complete: async () => JSON.stringify({ prompt: 'selfie, window', size: 'portrait', ...fields }) }, apiProvider: () => ({
      apiVersion: 1,
      getBackendStatus: () => ({ configured: true, supportsCharacters: true }),
      getCharacters: () => ({ characters: [{ name: '林舟', tag: 'black hair, white shirt', nl: '黑发白衬衫' }] }),
      generate: async () => { drawings++; return { path: '/images/photo.png', seed: 123 }; },
    }) });
    await assert.rejects(service.generate('lin', 'photo'), /人物列表/);
    assert.equal(drawings, 0);
    assert.equal(h.metadataSaves, saves);
    assert.deepEqual(store.read(), before);
  });
}

test('an explicit empty character list generates and saves a photo without people', async () => {
  const { h, store, batch } = setup();
  await store.upsertContacts([{ id: 'lin', name: '林舟' }]);
  await store.appendMessage('lin', { id: 'photo', role: 'assistant', type: 'image', image: { description: '窗边的一杯咖啡' }, batch });
  const saves = h.metadataSaves, requests = [];
  const service = createPhoneImageService({ store, modelClient: { complete: async () => '{"prompt":"coffee, window","characters":[],"size":"landscape"}' }, apiProvider: () => ({
    apiVersion: 1,
    getBackendStatus: () => ({ configured: true, supportsCharacters: true }),
    getCharacters: () => ({ characters: [] }),
    generate: async request => { requests.push(request); return { path: '/images/coffee.png', seed: 456 }; },
  }) });
  await service.generate('lin', 'photo');
  assert.deepEqual(requests, [{ prompt: 'coffee, window', nl: '', characters: [], size: 'landscape', save: true }]);
  assert.equal(h.metadataSaves, saves + 1);
  assert.deepEqual(store.read().conversations.lin[0].image, { description: '窗边的一杯咖啡', path: '/images/coffee.png', seed: 456 });
});

test('model message parser keeps sticker, location, transfer and photo semantics without accepting arbitrary sticker URLs', () => {
  const result = parsePayload(JSON.stringify({ messages: [
    { type: 'sticker', stickerId: 'sepia.happy' },
    { type: 'location', location: { name: '街角咖啡店', address: '广场东侧' } },
    { type: 'transfer', transfer: { amount: '20.00', currency: 'CNY', note: '咖啡', recipientId: '@user' } },
    { type: 'image', image: { description: '窗边的一杯热咖啡' } },
    { type: 'sticker', stickerId: 'https://invalid.example/a.svg', text: '笑了' },
  ] }), 'messages');
  assert.equal(result[0].type, 'sticker');
  assert.equal(result[0].stickerId, 'sepia.happy');
  assert.equal(result[1].location.address, '广场东侧');
  assert.equal(result[2].transfer.status, 'pending');
  assert.equal(result[3].image.description, '窗边的一杯热咖啡');
  assert.equal(result[4].type, undefined);
  assert.equal(result[4].text, '笑了');
});

test('sending a sticker and receiving rich replies use the same stored batch and semantic context', async () => {
  const { target, store, batch } = setup();
  await store.upsertContacts([{ id: 'lin', name: '林舟' }]);
  const contextReader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  const service = createMessageService({ target, store, contextReader, modelClient: { complete: async () => '{"messages":[{"type":"location","location":{"name":"咖啡店","address":"广场东侧"}}]}' } });
  assert.equal(typeof service.sendCard, 'function');
  await service.sendCard('lin', { type: 'sticker', stickerId: 'sepia.happy' });
  await service.continueChat('lin');
  const saved = store.read().conversations.lin;
  assert.equal(saved.length, 2);
  assert.ok(saved.every(message => message.batch.key === batch.key));
  const context = await contextReader.readForContact('lin');
  assert.ok(context.history[0].text.includes('开心'));
  assert.equal(context.history[0].type, 'sticker');
  assert.equal(context.history[0].stickerId, 'sepia.happy');
  assert.ok(context.history[1].text.includes('广场东侧'));
  await store.deleteMessage('lin', saved[1].id);
  assert.equal((await contextReader.readForContact('lin')).history.length, 1);
});

test('accepting or returning a received transfer updates its record and is included in the main-story summary', async () => {
  const { target, store, batch } = setup();
  await store.upsertContacts([{ id: 'lin', name: '林舟' }]);
  const service = createMessageService({ target, store, contextReader: createContextReader({ target, store }), modelClient: { complete: async () => '{"messages":[{"type":"transfer","transfer":{"amount":"20","recipientId":"@user","note":"咖啡"}}]}' } });
  await service.continueChat('lin');
  const message = store.read().conversations.lin[0];
  assert.equal(typeof store.respondTransfer, 'function');
  await store.respondTransfer('lin', message.id, 'accepted', '@user', batch);
  assert.equal(store.read().conversations.lin.length, 1);
  assert.equal(store.read().conversations.lin[0].transfer.status, 'accepted');
  await store.setInjectionEnabled(true);
  let summaryInput;
  const backflow = createBackflowService({ target, store, modelClient: { complete: async request => { summaryInput = JSON.parse(request.messages[0].content); return '{"summary":"林舟给用户转账20元，用户已收下。"}'; } } });
  await backflow.prepare();
  assert.ok(summaryInput.conversations[0].messages[0].text.includes('已收下'));
  await assert.rejects(store.respondTransfer('lin', message.id, 'returned', '@user', batch), /处理/);
});

test('unread notifications merge each conversation and disappear after reading without deleting messages', async () => {
  const { store } = setup();
  await store.upsertContacts([{ id: 'lin', name: '林舟' }]);
  await store.appendMessages('lin', [{ id: 'a', role: 'assistant', text: '你好' }, { id: 'b', role: 'assistant', text: '在吗' }]);
  assert.equal(typeof store.markRead, 'function');
  const { unreadConversations } = await import('../src/notifications.js');
  assert.equal(unreadConversations(store.read())[0].count, 2);
  await store.markRead('lin');
  assert.equal(unreadConversations(store.read()).length, 0);
  assert.equal(store.read().conversations.lin.length, 2);
  await store.appendMessage('lin', { id: 'c', role: 'assistant', text: '再见' });
  assert.equal(unreadConversations(store.read())[0].count, 1);
  await store.deleteMessage('lin', 'c');
  assert.equal(unreadConversations(store.read()).length, 0);
});

test('group transfer summaries retain the named recipient and settlement result', async () => {
  const { target, store, batch } = setup();
  await store.upsertContacts([{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }]);
  const group = await store.saveGroup('', { name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: true });
  await store.appendMessage(group.id, { id: 't', role: 'user', speakerId: '@user', type: 'transfer', transfer: { amount: '20.00', currency: 'CNY', recipientId: 'zhou', status: 'accepted' }, batch });
  await store.setInjectionEnabled(true);
  let summaryInput;
  const backflow = createBackflowService({ target, store, modelClient: { complete: async request => { summaryInput = JSON.parse(request.messages[0].content); return '{"summary":"用户给周予转账20元，周予已收下。"}'; } } });
  await backflow.prepare();
  const message = summaryInput.conversations[0].messages[0];
  assert.equal(message.recipient, '周予');
  assert.ok(message.text.includes('已收下'));
});

test('old archives do not become new notifications and visible replies are read in the same save', async () => {
  const { h, target } = setup();
  target.metadata.pocketPhone = { contacts: [{ id: 'lin', name: '林舟' }], groups: [], conversations: { lin: [{ id: 'old', role: 'assistant', text: '旧短信' }] } };
  const store = createPhoneStore({ target, isReading: () => true });
  const { unreadConversations } = await import('../src/notifications.js');
  assert.equal(unreadConversations(store.read()).length, 0);
  await store.markRead('lin');
  assert.equal(h.metadataSaves, 0);
  await store.appendMessage('lin', { id: 'new', role: 'assistant', text: '正看到的回复' });
  assert.equal(store.read().conversations.lin.at(-1).read, true);
  assert.equal(h.metadataSaves, 1);
});

test('a transfer result changed during summarization is not injected as an obsolete fact', async () => {
  const { target, store, batch } = setup();
  await store.upsertContacts([{ id: 'lin', name: '林舟' }]);
  await store.appendMessage('lin', { id: 't', role: 'assistant', type: 'transfer', transfer: { amount: '20.00', currency: 'CNY', recipientId: '@user', status: 'pending' }, batch });
  await store.setInjectionEnabled(true);
  const backflow = createBackflowService({ target, store, modelClient: { complete: async () => { await store.respondTransfer('lin', 't', 'accepted', '@user', batch); return '{"summary":"林舟给用户转账20元，尚未收款。"}'; } } });
  await assert.rejects(backflow.prepare(), /改变|变更|变化/);
});

test('a removed group recipient cannot settle a transfer using an earlier reply', async () => {
  const { store, batch } = setup();
  await store.upsertContacts([{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }]);
  const group = await store.saveGroup('', { name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: true });
  await store.appendMessage(group.id, { id: 't', role: 'user', speakerId: '@user', type: 'transfer', transfer: { amount: '20.00', currency: 'CNY', recipientId: 'lin', status: 'pending' }, batch });
  await store.deleteContact('lin');
  await assert.rejects(store.respondTransfer(group.id, 't', 'accepted', 'lin', batch), /群/);
});

test('group rich replies retain each speaker and a character can return a user transfer without creating a fake user message', async () => {
  const { target, store } = setup();
  await store.upsertContacts([{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }]);
  const group = await store.saveGroup('', { name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: true });
  const { createGroupService } = await import('../src/groups.js');
  let reply;
  const service = createGroupService({ target, store, contextReader: createContextReader({ target, store, qqjBridgeProvider: () => null }), modelClient: { complete: async () => JSON.stringify(reply) } });
  await service.sendCard(group.id, { type: 'transfer', transfer: { amount: '12.50', recipientId: 'lin', note: '咖啡' } });
  const sent = store.read().conversations[group.id][0];
  reply = { anchor: { memberIds: ['lin', 'zhou', '@user'], speakerIds: ['lin'] }, messages: [], transferActions: [{ speakerId: 'lin', transferId: sent.id, status: 'returned' }] };
  await service.continueChat(group.id);
  assert.equal(store.read().conversations[group.id].length, 1);
  assert.equal(store.read().conversations[group.id][0].transfer.status, 'returned');
  reply = { anchor: { memberIds: ['lin', 'zhou', '@user'], speakerIds: ['lin', 'zhou'] }, messages: [{ speakerId: 'lin', type: 'sticker', stickerId: 'sepia.happy' }, { speakerId: 'zhou', type: 'location', location: { name: '书店', address: '广场' } }] };
  await service.continueChat(group.id);
  assert.deepEqual(store.read().conversations[group.id].slice(1).map(message => [message.speakerId, message.type]), [['lin', 'sticker'], ['zhou', 'location']]);
});
