import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createWallpaperService } from '../src/wallpaper.js';

for (const hostKind of ['native', 'luker']) test(`${hostKind}: wallpaper upload uses host image storage and saves only a theme-specific path`, async () => {
  const h = createHarness({ metadata: { foreign: { keep: true } }, completion: { path: '/user/images/pocket-phone/background.webp' } });
  const store = createPhoneStore({ target: h.host.captureChat() });
  const service = createWallpaperService({ host: h.host, store });
  await service.upload('day', 'data:image/webp;base64,dGVzdA==');
  assert.equal(h.modelRequests[0].path, '/api/images/upload');
  assert.equal(h.modelRequests[0].body.ch_name, 'pocket-phone');
  assert.equal(h.modelRequests[0].body.format, 'webp');
  assert.equal(h.modelRequests[0].body.image, 'dGVzdA==');
  assert.equal(h.modelRequests[0].headers['X-CSRF-Token'], 'test-csrf');
  assert.deepEqual(store.read().wallpapers, { day: '/user/images/pocket-phone/background.webp' });
  assert.equal(JSON.stringify(h.persistedMetadata).includes('base64'), false);
  assert.deepEqual(h.context.chatMetadata.foreign, { keep: true });
  await store.setWallpaper('night', '/user/images/pocket-phone/night.webp');
  await service.restore('day');
  assert.equal(store.read().wallpapers.day, '');
  assert.equal(store.read().wallpapers.night, '/user/images/pocket-phone/night.webp');
  assert.equal(h.modelRequests.length, 1, '恢复默认不请求模型或删除图片文件');
});

test('failed image upload does not replace the saved wallpaper', async () => {
  const h = createHarness({ completion: {} });
  const store = createPhoneStore({ target: h.host.captureChat() });
  const service = createWallpaperService({ host: h.host, store });
  await store.setWallpaper('day', '/user/images/pocket-phone/old.webp');
  const saved = h.metadataSaves;
  await assert.rejects(service.upload('day', 'data:image/webp;base64,dGVzdA=='), /图片地址/);
  h.host.request = async () => Response.json({}, { status: 500 });
  await assert.rejects(service.upload('day', 'data:image/webp;base64,dGVzdA=='), /背景图片上传失败/);
  assert.equal(store.read().wallpapers.day, '/user/images/pocket-phone/old.webp');
  assert.equal(h.metadataSaves, saved);
});
