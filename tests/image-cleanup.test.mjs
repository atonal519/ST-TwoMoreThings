import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createPhoneImageService } from '../src/phone-images.js';
import { createImageFiles } from '../src/image-files.js';

const photo = (id, path, key = 'now') => ({ id, role: 'assistant', type: 'image', image: { description: `照片${id}`, path, seed: 1 }, batch: { key } });
const path = id => `/user/images/柏宝绘_朋友/bbi_abc_0_hash-${id}.png`;

for (const hostKind of ['native', 'luker']) test(`${hostKind}: delete and clear save first, then remove only the discarded photos`, async () => {
  const h = createHarness({ hostKind }), removed = [];
  const store = createPhoneStore({ target: h.host.captureChat(), removeImages: async paths => {
    assert.deepEqual(h.persistedMetadata.pocketPhone, store.read());
    removed.push(...paths);
  } });
  await store.upsertContacts([{ id: 'a', name: '朋友' }]);
  await store.appendMessages('a', [photo('old', path('old'), 'past'), photo('one', path('one')), photo('two', path('two'))]);
  await store.deleteMessage('a', 'one');
  assert.deepEqual(removed, [path('one')]);
  await store.clearConversation('a', { key: 'now' });
  assert.deepEqual(removed, [path('one'), path('two')]);
  assert.deepEqual(store.read().conversations.a.map(message => message.id), ['old']);
});

test('deleting a contact also cleans their private, group and social photos while preserving other people', async () => {
  const h = createHarness(), removed = [];
  const store = createPhoneStore({ target: h.host.captureChat(), removeImages: async paths => removed.push(...paths) });
  await store.upsertContacts([{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }]);
  const group = await store.saveGroup('', { name: '朋友', memberIds: ['a', 'b'], userIsMember: true });
  await store.appendMessages('a', [photo('private', path('private'))]);
  await store.appendMessages(group.id, [{ ...photo('group', path('group')), speakerId: 'a' }, { ...photo('keep', path('keep')), speakerId: 'b' }]);
  await store.updateSocial(social => ({ ...social, posts: [{ id: 'post', authorId: 'a', image: { description: '咖啡', path: path('social') } }] }));
  await store.deleteContact('a');
  assert.deepEqual(new Set(removed), new Set([path('private'), path('group'), path('social')]));
  assert.deepEqual(store.read().conversations[group.id].map(message => message.id), ['keep']);
  await store.deleteGroup(group.id);
  assert.equal(removed.at(-1), path('keep'));
});

test('replacement cleans retired photos once, retains still-used files and does not clean after a failed save', async () => {
  const h = createHarness(), removed = [];
  const store = createPhoneStore({ target: h.host.captureChat(), removeImages: async paths => removed.push(...paths) });
  await store.upsertContacts([{ id: 'a', name: '甲' }]);
  await store.appendMessage('a', photo('keep', path('shared')));
  await store.updateSocial(social => ({ ...social, posts: [
    { id: 'old1', image: { path: path('retired') } }, { id: 'old2', image: { path: path('retired') } }, { id: 'shared', image: { path: path('shared') } },
  ] }));
  h.saveFailure = new Error('offline');
  await assert.rejects(store.updateSocial(social => ({ ...social, posts: [] }), { cleanImages: true }), /保存失败/);
  assert.deepEqual(removed, []);
  h.saveFailure = null;
  await store.updateSocial(social => ({ ...social, posts: [] }), { cleanImages: true });
  assert.deepEqual(removed, [path('retired')]);
  await store.replaceForum([{ id: 'forum-photo', image: { path: path('forum') } }]);
  await store.replaceForum([{ id: 'new', content: '新帖子' }]);
  assert.deepEqual(removed, [path('retired'), path('forum')]);
});

test('a cleanup error reports the saved deletion without pretending that content was restored', async () => {
  const h = createHarness();
  const store = createPhoneStore({ target: h.host.captureChat(), removeImages: async () => { throw new Error('offline'); } });
  await store.upsertContacts([{ id: 'a', name: '甲' }]);
  await store.appendMessage('a', photo('one', path('one')));
  await assert.rejects(store.deleteMessage('a', 'one'), /内容已保存.*图片.*清理失败/);
  assert.deepEqual(store.read().conversations.a, []);
  assert.deepEqual(h.persistedMetadata.pocketPhone.conversations.a, []);
});

test('confirmed missing files lose every current-chat reference but keep their descriptions and never generate', async () => {
  const h = createHarness(), missing = path('missing'), present = path('present');
  const store = createPhoneStore({ target: h.host.captureChat() });
  await store.upsertContacts([{ id: 'a', name: '甲' }]);
  await store.appendMessages('a', [photo('gone', missing), photo('keep', present)]);
  await store.updateSocial(social => ({ ...social, posts: [{ id: 'post', authorId: 'a', text: '午后', image: { description: '咖啡', path: missing, seed: 3 } }] }));
  const calls = [];
  const service = createPhoneImageService({ store, files: { findMissing: async paths => { calls.push(paths); return paths.filter(item => item === missing); } }, modelClient: { complete: () => assert.fail('不应调用模型') } });
  assert.equal(typeof service.recoverMissing, 'function');
  assert.deepEqual(await service.recoverMissing([missing, present]), [missing]);
  assert.deepEqual(store.read().conversations.a[0].image, { description: '照片gone' });
  assert.equal(store.read().conversations.a[1].image.path, present);
  assert.deepEqual(store.read().social.posts[0].image, { description: '咖啡' });
  assert.deepEqual(calls, [[missing, present]]);
  assert.equal(h.modelRequests.length, 0);
});

test('image cleanup deletes the actual normalized file and BaiBai sidecar, tolerating already removed files', async () => {
  const requests = [];
  const files = createImageFiles({ host: { request: async (endpoint, init) => {
    requests.push({ endpoint, body: JSON.parse(init.body) });
    return new Response(null, { status: 404 });
  } } });
  await files.remove([path('one'), path('one').slice(1), '/user/images/pocket-phone/custom.webp', 'https://example.invalid/remote.png', 'data:image/png;base64,abc']);
  assert.deepEqual(requests, [
    { endpoint: '/api/images/delete', body: { path: path('one') } },
    { endpoint: '/api/files/delete', body: { path: '/user/files/bbi_abc_0_hash-one.json' } },
    { endpoint: '/api/images/delete', body: { path: '/user/images/pocket-phone/custom.webp' } },
  ]);
});

test('one failed file deletion does not skip the other selected files and reports a real cleanup failure', async () => {
  const requests = [];
  const files = createImageFiles({ host: { request: async (endpoint, init) => {
    const value = JSON.parse(init.body).path; requests.push(value);
    return new Response(null, { status: value.endsWith('one.png') ? 500 : 200 });
  } } });
  await assert.rejects(files.remove([path('one'), path('two')]), /清理失败/);
  assert.equal(requests.length, 4);
  assert.ok(requests.includes('/user/files/bbi_abc_0_hash-two.json'));
});

test('missing-image probes bypass the image cache and only a confirmed 404 removes a reference', async () => {
  const calls = [];
  const files = createImageFiles({ host: { request: async (value, init) => {
    calls.push({ value, init });
    if (value.endsWith('offline.png')) throw new Error('offline');
    return new Response(null, { status: value.endsWith('gone.png') ? 404 : value.endsWith('error.png') ? 500 : 200 });
  } } });
  assert.deepEqual(await files.findMissing([path('gone'), path('error'), path('offline'), path('present'), path('gone'), 'https://example.invalid/remote.png']), [path('gone')]);
  assert.equal(calls.length, 4);
  assert.ok(calls.every(({ init }) => init.method === 'HEAD' && init.cache === 'no-store'));
});

test('a real filename containing # and a literal percent escape is encoded for HEAD but remains exact for deletion', async () => {
  const raw = '/user/images/柏宝绘_A#100%23/bbi_abc_0_hash-special.png';
  const source = raw.split('/').map(encodeURIComponent).join('/'), requests = [];
  const files = createImageFiles({ host: { request: async (url, init) => {
    requests.push({ url, init });
    return new Response(null, { status: init.method === 'HEAD' && url !== source ? 404 : 200 });
  } } });
  assert.deepEqual(await files.findMissing([raw]), [], '不能把真实存在的图片当成缺失');
  assert.equal(requests[0].url, source);
  await files.remove([raw]);
  assert.equal(JSON.parse(requests[1].init.body).path, raw);
});

test('a past photo description can be drawn manually without adding or changing its historical message', async () => {
  const h = createHarness(), store = createPhoneStore({ target: h.host.captureChat() });
  await store.upsertContacts([{ id: 'a', name: '朋友' }]);
  const message = { ...photo('old', undefined, 'past'), text: '[图片：窗边咖啡]', storyDate: '2026年9月1日', timeLabel: '12:30' };
  await store.appendMessage('a', message);
  const saved = structuredClone(store.read().conversations.a[0]);
  const service = createPhoneImageService({ store, readBatch: () => ({ key: 'now' }), modelClient: { complete: async () => '{"prompt":"coffee, window","characters":[]}' }, apiProvider: () => ({
    apiVersion: 1, getBackendStatus: () => ({ configured: true }), getCharacters: () => ({ characters: [] }), generate: async () => ({ path: path('redrawn'), seed: 5 }),
  }) });
  await service.generate('a', 'old');
  assert.deepEqual(store.read().conversations.a, [{ ...saved, image: { ...saved.image, path: path('redrawn'), seed: 5 } }]);
});
