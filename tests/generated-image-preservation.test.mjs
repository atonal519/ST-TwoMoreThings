import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createSocialService } from '../src/social.js';
import { readAlbumPhotos } from '../src/album.js';
import { contentImagePaths } from '../src/image-files.js';

const path = '/user/images/fixture/paid.png';
const initial = () => ({ contacts: [{ id: 'a', name: '甲', remarkForUser: 'PRIVATE_REMARK' }], groups: [], conversations: {}, forum: { posts: [] }, social: { npcs: [], posts: [{ id: 'old', authorId: 'a', text: 'OLD_POST_TEXT', image: { path, description: '窗边的照片。' }, publishedAt: '2026-10-29 15:00' }], feedIds: ['old'] } });

test('real Ins refresh keeps a paid photo in the current-chat album in its original save without deleting files', async () => {
  const h = createHarness({ metadata: { pocketPhone: initial() } }), removed = [];
  const store = createPhoneStore({ target: h.host.captureChat(), removeImages: async values => removed.push(...values) });
  const service = createSocialService({ store, random: () => 0, contextReader: { readForSocial: async authors => ({ authors, clock: { date: '2026-10-30', time: '12:00' } }) }, modelClient: { complete: async () => JSON.stringify({ posts: [{ authorId: 'a', text: '新动态', image: { description: '新的画面' } }] }) } });
  await service.refresh();
  assert.deepEqual(removed, []); assert.equal(h.metadataSaves, 1);
  assert.equal(store.read().social.posts.some(row => row.id === 'old'), false);
  const photo = readAlbumPhotos(store.read()).find(row => row.path === path);
  assert.ok(photo); assert.equal(photo.description, '窗边的照片。'); assert.equal(photo.sources[0].label, 'Ins · 甲');
  assert.equal(photo.timeLabel, '2026-10-29 15:00');
  assert.equal(JSON.stringify(store.read().albumPhotos).includes('OLD_POST_TEXT'), false);
  assert.equal(JSON.stringify(store.read().albumPhotos).includes('PRIVATE_REMARK'), false);
  assert.equal(contentImagePaths(store.read()).has(path), true);
  const reopened = createPhoneStore({ target: { ...h.host.captureChat(), metadata: h.persistedMetadata } });
  assert.equal(readAlbumPhotos(reopened.read())[0].path, path);
});

test('orphan-source paths are preserved as photos without inventing an author', async () => {
  const data = initial(); data.social.posts[0].authorId = 'gone';
  const h = createHarness({ metadata: { pocketPhone: data } }), removed = [];
  const store = createPhoneStore({ target: h.host.captureChat(), removeImages: async values => removed.push(...values) });
  await store.updateSocial(social => ({ ...social, posts: [] }), { cleanImages: true });
  assert.deepEqual(removed, []); assert.equal(readAlbumPhotos(store.read())[0].path, path);
  assert.equal(readAlbumPhotos(store.read())[0].sources[0].label, 'Ins');
});

test('confirmed 404 clears live and saved photo references and later source refresh cannot rearchive it', async () => {
  const h = createHarness({ metadata: { pocketPhone: initial() } }), store = createPhoneStore({ target: h.host.captureChat() });
  await store.updateSocial(social => ({ ...social }), { cleanImages: true });
  assert.equal(store.read().albumPhotos?.length, 1);
  await store.clearImagePaths([path]);
  assert.deepEqual(store.read().social.posts[0].image, { description: '窗边的照片。' });
  assert.deepEqual(store.read().albumPhotos, []);
  await store.updateSocial(social => ({ ...social, posts: [] }), { cleanImages: true });
  assert.deepEqual(readAlbumPhotos(store.read()), []); assert.equal(contentImagePaths(store.read()).has(path), false);
});

test('saved photos deduplicate live sources and ordinary reads and theme saves do not archive legacy photos', async () => {
  const h = createHarness({ metadata: { pocketPhone: initial() } }), store = createPhoneStore({ target: h.host.captureChat() });
  readAlbumPhotos(store.read()); await store.setTheme('night');
  assert.equal(store.read().albumPhotos, undefined);
  await store.updateSocial(social => ({ ...social }), { cleanImages: true });
  await store.updateSocial(social => ({ ...social }), { cleanImages: true });
  assert.equal(store.read().albumPhotos?.length, 1); assert.equal(readAlbumPhotos(store.read()).length, 1);
  assert.equal(readAlbumPhotos(store.read())[0].sources.length, 1);
});

test('the saved original image description is exact and later live edits cannot replace it', async () => {
  const data = initial(), original = ' 原来的画面描述，保留两格  与换行。\n窗边的光。 ';
  data.social.posts[0].image.description = original;
  const h = createHarness({ metadata: { pocketPhone: data } }), store = createPhoneStore({ target: h.host.captureChat() });
  await store.updateSocial(social => ({ ...social }), { cleanImages: true });
  await store.updateSocial(social => ({ ...social, posts: social.posts.map(post => ({ ...post, image: { ...post.image, description: '后来的另一句描述' } })) }));
  assert.equal(store.read().albumPhotos[0].description, original);
  assert.equal(readAlbumPhotos(store.read())[0].description, original);
});

test('photo assets stay out of model context and card presets without extra saves or image fetches', async () => {
  const data = initial(); data.social.posts = []; data.albumPhotos = [{ path, description: 'ASSET_ONLY_DESCRIPTION', timeLabel: '', dateLabel: '', sources: [{ kind: 'social', id: 'old', label: 'Ins', createdAt: '', publishedAt: '' }] }];
  const h = createHarness({ metadata: { pocketPhone: data } }), target = h.host.captureChat(), store = createPhoneStore({ target });
  const { createContextReader } = await import('../src/context.js'), { createAuthoringService } = await import('../src/authoring.js');
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  const inputs = [await reader.readForContact('a'), await reader.readForSocial([{ ...data.contacts[0], kind: 'contact' }])];
  assert.equal(JSON.stringify(inputs).includes('ASSET_ONLY_DESCRIPTION'), false); assert.equal(JSON.stringify(inputs).includes(path), false);
  const result = await createAuthoringService({ host: h.host, store, fetchImage: () => assert.fail('photo assets are not exported') }).exportScript();
  assert.equal(JSON.stringify(result).includes('ASSET_ONLY_DESCRIPTION'), false); assert.equal(JSON.stringify(result).includes(path), false);
  assert.equal(h.metadataSaves, 0); assert.equal(h.modelRequests.length, 0);
});
