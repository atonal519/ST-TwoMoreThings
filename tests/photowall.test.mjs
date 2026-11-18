import test from 'node:test';
import assert from 'node:assert/strict';
import { readPhotoWall, readPhotoWallImage } from '../src/photowall.js';
import { readAlbumPhotos } from '../src/album.js';
import { createPhoneStore } from '../src/store.js';
import { createHarness } from './harness.mjs';
test('old wall photos and their source snapshots stay available through the unified album without read writes', () => {
  const state = { photoWall: { schemes: [{ id: 's', name: '旧组', people: [] }], activeSchemeId: 's', photos: [{ id: 'old', path: '/user/images/a.png', prompt: 'old prompt', nl: '旧图', people: [], seed: 4, schemeName: '旧组' }], desktopPhotoId: 'old' } }, before = structuredClone(state);
  const photos = readAlbumPhotos(state); assert.equal(photos.length, 1); assert.equal(photos[0].sources[0].prompt, 'old prompt'); assert.equal(photos[0].sources[0].seed, 4); assert.deepEqual(state, before); assert.equal(readPhotoWallImage(state).path, '/user/images/a.png');
});
test('confirmed missing wall photos and new wall paths clear together without deleting schemes', async () => {
  const h = createHarness({ metadata: { pocketPhone: { contacts: [], groups: [], conversations: {}, photoWall: { schemes: [{ id: 's' }], photos: [{ id: 'a', path: '/user/images/a.png', people: [] }, { id: 'b', path: '/user/images/b.png', people: [] }], desktopPhotoId: 'a', desktopPhotoPath: '/user/images/a.png' } } } });
  const store = createPhoneStore({ target: h.host.captureChat() }); await store.clearImagePaths(['/user/images/a.png']);
  assert.equal(store.read().photoWall.desktopPhotoPath, ''); assert.equal(store.read().photoWall.desktopPhotoId, ''); assert.deepEqual(store.read().photoWall.schemes, [{ id: 's' }]); assert.equal(readAlbumPhotos(store.read()).length, 1); assert.equal(h.modelRequests.length, 0);
});
test('legacy missing markers are read-only and do not replace another selected wall photo', () => {
  const state = { photoWall: { schemes: [], photos: [{ id: 'a', path: '/user/images/a.png', missing: true }, { id: 'b', path: '/user/images/b.png', people: [] }], desktopPhotoId: 'b' } }, before = structuredClone(state);
  assert.equal(readPhotoWall(state).photos.length, 1); assert.equal(readPhotoWallImage(state).path, '/user/images/b.png'); assert.deepEqual(state, before);
});
