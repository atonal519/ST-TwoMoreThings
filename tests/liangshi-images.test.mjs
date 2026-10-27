import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createPhoneImageService } from '../src/phone-images.js';

for (const linked of [true, false]) test(`${linked ? 'linked contact' : 'unlinked same-name account'} photo is drawn on demand and merges into the latest post`, async () => {
  const h = createHarness(), store = createPhoneStore({ target: h.host.captureChat() });
  await store.upsertContacts([{ id: 'lin', name: '林舟' }]);
  await store.updateLiangshi(() => ({ accounts: [{ id: 'a', name: '林舟', handle: 'public-lin', ...(linked ? { contactId: 'lin' } : {}) }], topics: [], promoCountdown: 2, posts: [{ id: 'p', authorId: 'a', text: '原帖', quoteId: 'original', comments: [], reposts: [], image: { description: '窗边咖啡' } }] }));
  let calls = 0, draws = 0, finish, input;
  const service = createPhoneImageService({ store, modelClient: { complete: async value => { calls++; input = value; return JSON.stringify({ prompt: 'window, coffee', characters: linked ? ['林舟'] : [] }); } }, apiProvider: () => ({ apiVersion: 1, getBackendStatus: () => ({ configured: true, supportsCharacters: true }), getCharacters: () => ({ characters: [{ name: '林舟', tag: 'library appearance' }] }), generate: async () => { draws++; await new Promise(resolve => { finish = resolve; }); return { path: '/user/images/liangshi.png', seed: 3, dataUrl: 'do-not-store' }; } }) });
  assert.equal(typeof service.generateLiangshi, 'function'); assert.equal(calls + draws, 0);
  const generating = service.generateLiangshi('p'); while (!finish) await new Promise(resolve => setImmediate(resolve));
  await store.updateLiangshi(current => ({ ...current, posts: current.posts.map(post => ({ ...post, comments: [{ id: 'c', text: '生成中收到的评论' }], reposts: [{ id: 'r', quoteId: 'p', text: '生成中收到的转发' }] })) }));
  finish(); await generating;
  const post = store.read().liangshi.posts[0]; assert.equal(post.comments[0].id, 'c'); assert.equal(post.reposts[0].id, 'r'); assert.equal(post.quoteId, 'original'); assert.equal(post.text, '原帖'); assert.deepEqual(post.image, { description: '窗边咖啡', path: '/user/images/liangshi.png', seed: 3 });
  assert.equal(input.system.includes('只允许无人风景或物品'), !linked); if (linked) assert.equal(JSON.parse(input.messages[0].content).sender.name, '林舟');
  await service.generateLiangshi('p'); assert.equal(calls, 1); assert.equal(draws, 1); assert.equal(store.read().liangshi.promoCountdown, 2);
});

test('a failed provider preserves the Liangshi description and original post', async () => {
  const h = createHarness(), store = createPhoneStore({ target: h.host.captureChat() });
  await store.updateLiangshi(() => ({ accounts: [{ id: 'a', name: '路人' }], topics: [], posts: [{ id: 'p', authorId: 'a', comments: [], reposts: [], image: { description: '河边风景' } }] }));
  const service = createPhoneImageService({ store, modelClient: { complete: async () => '{"prompt":"river","characters":[]}' }, apiProvider: () => ({ apiVersion: 1, getBackendStatus: () => ({ configured: true }), getCharacters: () => ({ characters: [] }), generate: async () => { throw new Error('合成渠道失败'); } }) });
  assert.equal(typeof service.generateLiangshi, 'function'); await assert.rejects(service.generateLiangshi('p'), /合成渠道失败/); assert.deepEqual(store.read().liangshi.posts[0].image, { description: '河边风景' });
});

test('own account picture resolves the real user drawing identity and still draws only on explicit request', async () => {
  const h = createHarness(), store = createPhoneStore({ target: h.host.captureChat() });
  h.context.chatMetadata.pocketPhone = { contacts: [], conversations: {}, userProfile: { name: '本人绘图库名', nickname: '手机昵称' }, liangshi: { accounts: [{ id: 'own', ownerId: '@user', name: '公开微博名' }], posts: [{ id: 'p', authorId: 'own', userAuthored: true, text: '自拍', comments: [], reposts: [], image: { description: '我在窗边的自拍' } }] } };
  let calls = 0, draws = 0, input;
  const service = createPhoneImageService({ store, modelClient: { complete: async request => { calls++; input = request; return '{"prompt":"window","characters":["本人绘图库名"]}'; } }, apiProvider: () => ({ apiVersion: 1, getBackendStatus: () => ({ configured: true, supportsCharacters: true }), getCharacters: () => ({ characters: [{ name: '本人绘图库名', tag: 'existing appearance' }] }), generate: async () => { draws++; return { path: '/user/images/own.png' }; } }) });
  assert.equal(calls + draws, 0); await service.generateLiangshi('p'); assert.equal(calls, 1); assert.equal(draws, 1); assert.equal(JSON.parse(input.messages[0].content).sender.name, '本人绘图库名'); assert.equal(JSON.parse(input.messages[0].content).sender.nickname, '手机昵称'); assert.equal(input.system.includes('只允许无人风景或物品'), false); assert.equal(store.read().liangshi.posts[0].image.path, '/user/images/own.png');
});

test('a picture generated for an earlier description cannot attach after the post is edited', async () => {
  const h = createHarness({ metadata: { pocketPhone: { contacts: [], conversations: {}, userProfile: { name: '本人' }, liangshi: { accounts: [{ id: 'u', ownerId: '@user', name: '网名' }], posts: [{ id: 'p', authorId: 'u', userAuthored: true, text: '正文', image: { description: '原照片' }, comments: [], reposts: [] }] } } } });
  const store = createPhoneStore({ target: h.host.captureChat() }); let finish;
  const images = createPhoneImageService({ store, modelClient: { complete: async () => '{"prompt":"window","characters":[]}' }, apiProvider: () => ({ apiVersion: 1, getBackendStatus: () => ({ configured: true }), getCharacters: () => ({ characters: [] }), generate: () => new Promise(resolve => { finish = resolve; }) }) });
  const generating = images.generateLiangshi('p'); while (!finish) await new Promise(resolve => setImmediate(resolve));
  await store.updateLiangshi(data => ({ ...data, posts: data.posts.map(post => ({ ...post, image: { description: '已经换了照片描述' } })) }));
  finish({ path: '/user/images/late.png' }); await assert.rejects(generating, /已修改|已改变/); assert.deepEqual(store.read().liangshi.posts[0].image, { description: '已经换了照片描述' });
});
