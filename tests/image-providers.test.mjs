import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createPhoneImageService } from '../src/phone-images.js';
import { createImageProviders } from '../src/image-providers.js';

async function setup(hostKind = 'native') {
  const h = createHarness({ hostKind, settings: { pocketPhone: { imageProvider: 'chatu8' }, 'st-chatu8': { scriptEnabled: true, mode: 'novelai', cache: '1', characterPresets: { lin: { nameCN: '林舟', nameEN: 'Lin', characterTraits: 'black hair' } } } } });
  const events = h.context.eventSource = new EventEmitter();
  const store = createPhoneStore({ target: h.host.captureChat() }), uploads = [], calls = [];
  h.host.request = async (url, init) => { uploads.push({ url, body: JSON.parse(init.body) }); return Response.json({ path: '/user/images/pocket-phone/generated.png' }); };
  await store.upsertContacts([{ id: 'lin', name: '林舟' }]);
  await store.appendMessage('lin', { id: 'image', role: 'assistant', type: 'image', image: { description: '窗边的咖啡' } });
  let recipe = { prompt: 'coffee, window', characters: [], size: 'landscape' };
  const service = createPhoneImageService({ store, host: h.host, modelClient: { complete: async input => { calls.push(input); return JSON.stringify(recipe); } }, apiProvider: () => assert.fail('选择智绘姬不应读取柏宝绘') });
  return { h, events, store, uploads, calls, service, recipe: value => { recipe = value; } };
}

for (const hostKind of ['native', 'luker']) test(`${hostKind}: selected Chatu8 uses correlated events and saves its image without requiring BaiBai`, async () => {
  const { h, events, store, uploads, calls, service } = await setup(hostKind);
  const settings = structuredClone(h.context.extensionSettings), requests = [];
  events.on('generate-image-request', request => {
    requests.push(request);
    events.emit('generate-image-response', { id: 'unrelated', success: true, imageData: 'data:image/png;base64,d3Jvbmc=' });
    events.emit('generate-image-response', { id: request.id, success: true, imageData: 'data:image/png;base64,dGVzdA==' });
  });
  assert.equal(calls.length + requests.length + uploads.length, 0);
  await service.generate('lin', 'image');
  assert.equal(calls.length, 1);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].prompt, 'coffee, window');
  assert.ok(requests[0].width > requests[0].height);
  assert.equal(uploads[0].url, '/api/images/upload');
  assert.equal(uploads[0].body.image, 'dGVzdA==');
  assert.equal(store.read().conversations.lin[0].image.path, '/user/images/pocket-phone/generated.png');
  assert.equal(JSON.stringify(h.persistedMetadata).includes('base64'), false);
  assert.deepEqual(h.context.extensionSettings, settings, '不改智绘姬缓存和连接设置');
  assert.equal(events.listenerCount('generate-image-response'), 0);
  await service.generate('lin', 'image');
  assert.equal(requests.length, 1, '已有图只读');
});

test('provider failures preserve the description and remove the response listener', async () => {
  const { events, store, service, uploads } = await setup();
  events.on('generate-image-request', request => events.emit('generate-image-response', { id: request.id, success: false, error: '渠道没有配置' }));
  await assert.rejects(service.generate('lin', 'image'), /渠道没有配置/);
  assert.equal(events.listenerCount('generate-image-response'), 0);
  assert.deepEqual(store.read().conversations.lin[0].image, { description: '窗边的咖啡' });
  assert.equal(uploads.length, 0);
});

test('a disabled or absent Chatu8 reports its own setup instruction before calling the text model', async () => {
  const { h, calls, service } = await setup();
  h.context.extensionSettings['st-chatu8'].scriptEnabled = false;
  await assert.rejects(service.generate('lin', 'image'), /智绘姬/);
  assert.equal(calls.length, 0);
});

test('Chatu8 character names and appearance triggers come from its own library', async () => {
  const { events, service, recipe, calls } = await setup();
  recipe({ prompt: 'selfie, window', characters: ['林舟'], size: 'portrait' });
  let request;
  events.on('generate-image-request', item => { request = item; events.emit('generate-image-response', { id: item.id, success: true, imageData: 'data:image/png;base64,dGVzdA==' }); });
  await service.generate('lin', 'image');
  assert.deepEqual(JSON.parse(calls[0].messages[0].content).characters, ['林舟']);
  assert.ok(request.prompt.includes('林舟'));
  assert.ok(request.prompt.includes('$'));
});

test('Chatu8 accepts appearance sections without general traits and omits entirely empty profiles', async () => {
  for (const field of ['facialFeatures', 'upperBodySFW', 'fullBodySFW']) {
    const { h, events, service, recipe, calls } = await setup();
    h.context.extensionSettings['st-chatu8'].characterPresets = {
      lin: { nameCN: '林舟', [field]: 'appearance description' },
      empty: { nameCN: '空白档案', characterTraits: ' ' },
    };
    recipe({ prompt: 'selfie', characters: ['林舟'], size: 'portrait' });
    let request;
    events.on('generate-image-request', value => {
      request = value;
      events.emit('generate-image-response', { id: value.id, success: true, imageData: 'data:image/png;base64,dGVzdA==' });
    });
    await service.generate('lin', 'image');
    assert.deepEqual(JSON.parse(calls[0].messages[0].content).characters, ['林舟'], field);
    assert.ok(request.prompt.includes('"name":"林舟"'), field);
  }
});

test('source is explicit, defaults to BaiBai and keeps standalone and card settings independent', async () => {
  const { h } = await setup();
  delete h.context.extensionSettings.pocketPhone.imageProvider;
  const baibai = { generate() {} }, standalone = createImageProviders({ host: h.host, baibai: () => baibai });
  assert.equal(standalone.getSelected(), 'baibai');
  assert.equal(standalone.resolve().api, baibai);
  await standalone.select('chatu8');
  assert.equal(standalone.getSelected(), 'chatu8');
  const embedded = createImageProviders({ host: { ...h.host, phoneSettingsKey: 'twoMoreThingsEmbedded' }, baibai: () => baibai });
  assert.equal(embedded.getSelected(), 'baibai');
  await embedded.select('baibai');
  assert.equal(standalone.getSelected(), 'chatu8');
  h.context.saveSettingsDebounced = () => { throw new Error('offline'); };
  await assert.rejects(standalone.select('baibai'), /生图设置保存失败/);
  assert.equal(standalone.getSelected(), 'chatu8');
});

test('a Chatu8 timeout cleans its event listener and never uploads an empty result', async () => {
  const { h, events, uploads } = await setup();
  const providers = createImageProviders({ host: h.host, timeoutMs: 5 });
  await assert.rejects(providers.resolve().api.generate({ prompt: 'coffee', size: 'portrait' }), /等待超时/);
  assert.equal(events.listenerCount('generate-image-response'), 0);
  assert.equal(uploads.length, 0);
});

test('clothes use only explicit matching Chatu8 presets and keep the model output flat', async () => {
  const { h, events, service, recipe, calls } = await setup();
  h.context.extensionSettings['st-chatu8'].outfitPresets = { shirt: { nameCN: '白衬衫', upperBody: 'white shirt' } };
  recipe({ prompt: 'selfie', characters: ['林舟'], outfits: '白衬衫' });
  let request;
  events.on('generate-image-request', value => { request = value; events.emit('generate-image-response', { id: value.id, success: true, imageData: 'data:image/png;base64,dGVzdA==' }); });
  await service.generate('lin', 'image');
  assert.deepEqual(JSON.parse(calls[0].messages[0].content).outfits, ['白衬衫']);
  assert.ok(request.prompt.includes('"name":"白衬衫"'));
});
