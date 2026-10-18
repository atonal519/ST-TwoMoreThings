import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import * as entry from '../index.js';

// Each fixture calls production entry points; no real model or file requests are made.
test('the per-card master switch preserves shared preferences and gates storage plus backflow', async () => {
  assert.equal(typeof entry.createPhoneControl, 'function');
  const h = createHarness({ settings: { pocketPhone: { fabShow: false } } });
  const target = h.host.captureChat(), control = entry.createPhoneControl({ host: h.host, target });
  const store = createPhoneStore({ target, assertEnabled: control.assertEnabled });
  await store.upsertContacts([{ id: 'lin', name: '林舟' }]);
  await control.setEnabled(false);
  assert.equal(control.isEnabled(), false);
  assert.equal(h.context.extensionSettings.pocketPhone.fabShow, false);
  await assert.rejects(store.appendMessage('lin', { id: 'x', role: 'user', text: '不应写入' }), /关闭/);
  h.context.characterId = 1;
  h.context.characters.push({ name: '另一个角色', avatar: 'other.png' });
  assert.equal(entry.createPhoneControl({ host: h.host, target: h.host.captureChat() }).isEnabled(), true);
  const { createBackflowService } = await import('../src/context.js');
  await store.setInjectionEnabled(true);
  assert.equal(await createBackflowService({ target, store, isEnabled: control.isEnabled, modelClient: { complete: () => { throw new Error('不应调用'); } } }).prepare(), '');
});

test('an image card generates only when requested, uses BaiBaoHui character tags and reuses the saved path', async () => {
  assert.equal(typeof entry.createPhoneImageService, 'function');
  const h = createHarness(), target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'lin', name: '林舟' }]);
  await store.appendMessage('lin', { id: 'photo', role: 'assistant', text: '[图片]', type: 'image', image: { description: '林舟在窗边喝咖啡' }, batch: { key: '[0]', label: '今天' } });
  let drawings = 0, recipes = 0, request;
  const api = { apiVersion: 1, getBackendStatus: () => ({ configured: true, supportsCharacters: true }), getCharacters: () => ({ characters: [{ name: '林舟', tag: '1boy, black hair', nl: '' }] }), generate: async value => { drawings++; request = value; return { path: '/user/images/test/photo.png', seed: 5, dataUrl: 'data:image/png;base64,AAA' }; } };
  const service = entry.createPhoneImageService({ store, apiProvider: () => api, modelClient: { complete: async () => { recipes++; return '{"prompt":"window, coffee","characters":["林舟"],"size":"portrait"}'; } } });
  assert.equal(drawings, 0);
  assert.equal((await service.generate('lin', 'photo')).path, '/user/images/test/photo.png');
  assert.equal(request.characters[0].tag, '1boy, black hair');
  assert.equal((await service.generate('lin', 'photo')).path, '/user/images/test/photo.png');
  assert.equal(drawings, 1); assert.equal(recipes, 1);
  assert.ok(!JSON.stringify(store.read()).includes('base64'));
});

test('a missing BaiBaoHui reports what to enable without calling the language model', async () => {
  assert.equal(typeof entry.createPhoneImageService, 'function');
  const h = createHarness(), store = createPhoneStore({ target: h.host.captureChat() });
  await store.upsertContacts([{ id: 'lin', name: '林舟' }]);
  await store.appendMessage('lin', { id: 'photo', type: 'image', image: { description: '咖啡' } });
  const service = entry.createPhoneImageService({ store, apiProvider: () => null, modelClient: { complete: () => { throw new Error('不应调用'); } } });
  await assert.rejects(service.generate('lin', 'photo'), /柏宝绘/);
});

test('a backend without separate character prompts still receives the library appearance and clothing', async () => {
  const h = createHarness(), store = createPhoneStore({ target: h.host.captureChat() });
  await store.upsertContacts([{ id: 'lin', name: '林舟', nickname: '木木' }]);
  await store.appendMessage('lin', { id: 'photo', role: 'assistant', type: 'image', image: { description: '我的自拍' } });
  let request, input;
  const api = { apiVersion: 1, getBackendStatus: () => ({ configured: true, supportsCharacters: false }), getCharacters: () => ({ characters: [{ name: '林舟', tag: '1boy, black hair, blue coat', nl: 'a boy with black hair wearing a blue coat' }] }), generate: async value => { request = value; return { path: '/user/images/photo.png' }; } };
  const service = entry.createPhoneImageService({ store, apiProvider: () => api, modelClient: { complete: async value => { input = JSON.parse(value.messages[0].content); return '{"prompt":"selfie, window","characters":["林舟"]}'; } } });
  await service.generate('lin', 'photo');
  assert.equal(input.sender.name, '林舟');
  assert.ok(request.prompt.includes('blue coat'));
  assert.ok(request.nl.includes('blue coat'));
});

test('a photo with a missing character archive stops before image generation', async () => {
  const h = createHarness(), store = createPhoneStore({ target: h.host.captureChat() });
  await store.upsertContacts([{ id: 'lin', name: '林舟' }]);
  await store.appendMessage('lin', { id: 'photo', role: 'assistant', type: 'image', image: { description: '我的自拍' } });
  let drawings = 0;
  const service = entry.createPhoneImageService({ store, apiProvider: () => ({ apiVersion: 1, getBackendStatus: () => ({ configured: true }), getCharacters: () => ({ characters: [] }), generate: () => { drawings++; } }), modelClient: { complete: async () => '{"prompt":"selfie","characters":["林舟"]}' } });
  await assert.rejects(service.generate('lin', 'photo'), /柏宝绘.*档案/);
  assert.equal(drawings, 0);
});

test('lockscreen weather reads the agreed Gouhua snapshot without writing or generating', async () => {
  const { readLockWeather } = await import('../src/weather.js');
  assert.equal(readLockWeather(null).source, 'decoration');
  let reads = 0;
  assert.deepEqual(readLockWeather({ apiVersion: 1, getPhoneSnapshot: () => { reads++; return { weather: { text: '小雨', temperature: '18°C' } }; } }), { source: 'gouhua', text: '小雨', temperature: '18°C' });
  assert.equal(reads, 1);
});
