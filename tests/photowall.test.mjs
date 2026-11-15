import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createPhotoWallService, readPhotoWall } from '../src/photowall.js';
import { createImageFiles } from '../src/image-files.js';
import { createPhoneImageService } from '../src/phone-images.js';
import { readAlbumPhotos } from '../src/album.js';
import { createPhotoWallTemplateSettings } from '../src/photowall-templates.js';
const panels = [{ zh: '人物B轻吻脸颊，人物A从容看向镜头。', en: 'character B kisses character A on the cheek, character A calmly facing the camera.' }, { zh: '人物A主动亲吻人物B，人物B指尖微绷。', en: 'character A initiates a kiss on character B’s lips, character B’s fingertips tensing slightly.' }];

const scene = { prompt: panels.map(panel => panel.en).join(' '), nl: panels.map(panel => panel.zh).join(' ') };

function setup() {
  const h = createHarness(), store = createPhoneStore({ target: h.host.captureChat(), assertEnabled: () => { if (!enabled) throw Error('手机已停用'); } });
  let enabled = true, current = true, reads = 0, calls = [], models = [], serial = 0;
  const catalog = [{ name: '甲', scope: 'global', tag: 'long hair', nl: '甲的完整外貌' }, { name: '乙', scope: 'chat', tag: 'short hair', nl: '乙的完整外貌' }];
  const api = { apiVersion: 1, getCharacters: () => { reads++; return { characters: catalog }; }, getBackendStatus: () => ({ configured: true, supportsCharacters: true }), generate: async request => { calls.push(request); return { path: `/user/images/test/wall-${++serial}.png`, seed: serial, dataUrl: 'data:NEVER_SAVE' }; } };
  const modelClient = { complete: async request => { models.push(request); return JSON.stringify(scene); } };
  const contextReader = { readForPhotoWall: async people => ({ people: people.map((person, index) => ({ role: index ? 'B' : 'A', name: person.name, appearance: { tag: person.tag, nl: person.nl }, profile: { personality: index ? '克制' : '从容' } })) }) };
  const templateSettings = createPhotoWallTemplateSettings({ host: h.host });
  const service = createPhotoWallService({ store, contextReader, modelClient, templateSettings, providers: { resolveBaibai: () => ({ api }) }, assertEnabled: () => { if (!enabled) throw Error('手机已停用'); }, isCurrentChat: () => current, readTime: () => ({ date: '雨季三月二日', time: '09:41' }) });
  const draft = { name: '两个人', people: catalog.map(({ name, scope }) => ({ name, scope })) };
  return { h, store, service, templateSettings, api, catalog, calls, models, modelClient, contextReader, draft, get reads() { return reads; }, disable: () => { enabled = false; }, switchChat: () => { current = false; } };
}

test('schemes persist separately from appended photos, one BBH save shared with album', async () => {
  const s = setup(); assert.equal(s.reads, 0); assert.equal(s.service.readCharacters().length, 2); assert.equal(s.reads, 1);
  const plan = await s.service.saveScheme(null, s.draft);
  await s.service.generate(plan.id); const first = s.store.read().photoWall.photos[0];
  await s.service.generate(plan.id);
  assert.equal(s.calls.length, 2); assert.equal(s.models.length, 2); assert.equal(s.calls[0].save, true); assert.equal(s.calls[0].size, 'portrait'); assert.equal(Object.hasOwn(s.calls[0], 'character'), false, 'BBH owns the current-chat gallery classification');
  assert.deepEqual(s.calls[0].characters, s.catalog.map(({ name, tag, nl }) => ({ name, tag, nl })));
  assert.doesNotMatch(s.calls[0].prompt, /male couple|【Char/); assert.match(s.calls[0].nl, /甲/); assert.match(s.calls[0].nl, /乙/);
  assert.equal(s.reads, 3); assert.equal(s.store.read().photoWall.photos.length, 2);
  assert.equal(readAlbumPhotos(s.store.read()).length, 2); assert.equal(readAlbumPhotos(s.store.read()).find(p => p.path === first.path).description, '甲 与 乙 · 合照');
  assert.equal(readAlbumPhotos(s.store.read()).find(p => p.path === first.path).sources[0].prompt, first.prompt);
  assert.equal(JSON.stringify(s.store.read()).includes('data:NEVER_SAVE'), false);
  await s.service.setDesktop(first.id);
  await s.service.saveScheme(plan.id, { ...s.draft, name: '改名', people: [...s.draft.people].reverse() });
  assert.equal(s.store.read().photoWall.desktopPhotoId, first.id); assert.equal(first.schemeName, '两个人');
  await s.service.removeScheme(plan.id);
  assert.equal(s.store.read().photoWall.photos.length, 2); assert.equal(readAlbumPhotos(s.store.read()).length, 2);
  const reopened = createPhoneStore({ target: { ...s.h.host.captureChat(), metadata: s.h.persistedMetadata } });
  assert.equal(reopened.read().photoWall.desktopPhotoId, first.id); assert.equal(reopened.read().photoWall.photos[0].people[0].tag, 'long hair');
});

test('backend without character fields receives the same current tags and natural appearance, no extra call', async () => {
  const s = setup(); const plan = await s.service.saveScheme(null, s.draft);
  s.api.getBackendStatus = () => ({ configured: true, supportsCharacters: false }); s.catalog[0].tag = 'CURRENT_TAG';
  await s.service.generate(plan.id); assert.equal(s.calls.length, 1); assert.match(s.calls[0].prompt, /CURRENT_TAG/); assert.match(s.calls[0].nl, /甲的完整外貌/);
});

test('missing/ambiguous people and null saved path fail without fake photos or retries', async () => {
  for (const type of ['missing', 'duplicate', 'null']) {
    const s = setup(), plan = await s.service.saveScheme(null, s.draft);
    if (type === 'missing') s.catalog.pop();
    if (type === 'duplicate') s.catalog.push({ ...s.catalog[0] });
    if (type === 'null') s.api.generate = async request => { s.calls.push(request); return { path: null, dataUrl: 'data:image/png;base64,ABC' }; };
    await assert.rejects(s.service.generate(plan.id), type === 'null' ? /保存|地址/ : /人物|目录/);
    assert.equal(s.calls.length, type === 'null' ? 1 : 0); assert.equal(s.store.read().photoWall.photos.length, 0); assert.equal(readAlbumPhotos(s.store.read()).length, 0);
  }
});

test('scheme edits/removal keep generation snapshots; disabling still retains the paid result in album', async () => {
  for (const action of ['edit', 'remove', 'disable']) {
    const s = setup(), plan = await s.service.saveScheme(null, s.draft); let finish;
    s.api.generate = () => new Promise(resolve => { finish = resolve; });
    const pending = s.service.generate(plan.id); await new Promise(resolve => setImmediate(resolve));
    if (action === 'edit') await s.service.saveScheme(plan.id, { ...s.draft, name: '不同方案' });
    if (action === 'remove') await s.service.removeScheme(plan.id);
    if (action === 'disable') s.disable();
    finish({ path: '/user/images/test/paid.png', seed: 8 });
    if (action === 'disable') await assert.rejects(pending, /相册/); else { const photo = await pending; assert.equal(photo.schemeName, '两个人'); }
    assert.equal(readAlbumPhotos(s.store.read())[0].path, '/user/images/test/paid.png'); assert.equal(s.store.read().photoWall.photos.length, action === 'disable' ? 0 : 1);
  }
});

test('confirmed missing photos disappear, clear only their desktop reference and never delete files or regenerate', async () => {
  for (const current of [true, false]) {
    const s = setup(), plan = await s.service.saveScheme(null, s.draft);
    await s.service.generate(plan.id); await s.service.generate(plan.id);
    const [a, b] = s.store.read().photoWall.photos;
    await s.service.setDesktop(current ? a.id : b.id);
    const schemes = structuredClone(s.store.read().photoWall.schemes);
    await s.store.clearImagePaths([a.path]);
    assert.deepEqual(s.store.read().photoWall.photos, [b]);
    assert.deepEqual(s.store.read().photoWall.schemes, schemes);
    assert.equal(s.store.read().photoWall.desktopPhotoId, current ? '' : b.id);
    assert.deepEqual(readAlbumPhotos(s.store.read()).map(photo => photo.path), [b.path]);
    assert.ok(b.prompt && b.nl && b.people[0].tag && b.seed);
    const saves = s.h.metadataSaves;
    await s.store.clearImagePaths([a.path]); assert.equal(s.h.metadataSaves, saves, 'repeat 404 does not save again');
    await assert.rejects(s.service.setDesktop(a.id), /失效|不存在/);
    await s.store.clearImagePaths([b.path]);
    assert.deepEqual(s.store.read().photoWall.photos, []); assert.equal(s.store.read().photoWall.desktopPhotoId, '');
    assert.deepEqual(s.store.read().photoWall.schemes, schemes); assert.deepEqual(readAlbumPhotos(s.store.read()), []);
    assert.equal(s.calls.length, 2); assert.equal(s.models.length, 2); assert.equal(s.h.modelRequests.length, 0);
  }
});

test('legacy missing photos are hidden without writes and normalized in the next wall save', async () => {
  const s = setup(), plan = await s.service.saveScheme(null, s.draft);
  await s.service.generate(plan.id); await s.service.generate(plan.id);
  const raw = s.store.read().photoWall, [a, b] = raw.photos;
  raw.photos[0] = { ...a, missing: true }; raw.desktopPhotoId = a.id;
  const saves = s.h.metadataSaves, original = structuredClone(raw);
  const visible = readPhotoWall(s.store.read());
  assert.deepEqual(visible.photos, [b]); assert.equal(visible.desktopPhotoId, ''); assert.deepEqual(raw, original);
  assert.equal(s.h.metadataSaves, saves);
  await s.service.selectScheme(plan.id);
  assert.deepEqual(s.h.persistedMetadata.pocketPhone.photoWall, visible);
  assert.equal(s.h.metadataSaves, saves + 1); assert.equal(s.calls.length, 2);
});

test('wall recovery uses exact HEAD 404, preserves network/HTTP errors and rolls back a failed save', async () => {
  const s = setup(), plan = await s.service.saveScheme(null, s.draft);
  await s.service.generate(plan.id); const photo = s.store.read().photoWall.photos[0]; await s.service.setDesktop(photo.id);
  let status = 200; const requests = [];
  const files = createImageFiles({ host: { request: async (url, init) => {
    requests.push({ url, init }); if (status === 'offline') throw Error('offline'); return new Response(null, { status });
  } } });
  const images = createPhoneImageService({ store: s.store, files, modelClient: { complete: () => assert.fail('no model during recovery') } });
  const before = structuredClone(s.store.read()), saves = s.h.metadataSaves;
  for (status of [200, 403, 500, 'offline']) {
    assert.deepEqual(await images.recoverMissing([photo.path]), []); assert.deepEqual(s.store.read(), before);
  }
  assert.equal(s.h.metadataSaves, saves);
  status = 404; s.h.saveFailure = Error('offline');
  await assert.rejects(images.recoverMissing([photo.path]), /保存失败/);
  assert.deepEqual(s.store.read(), before); assert.equal(s.h.metadataSaves, saves);
  s.h.saveFailure = null; assert.deepEqual(await images.recoverMissing([photo.path]), [photo.path]);
  assert.deepEqual(s.store.read().photoWall.photos, []); assert.equal(s.store.read().photoWall.desktopPhotoId, '');
  assert.ok(requests.every(({ url, init }) => url === photo.path && init.method === 'HEAD' && init.cache === 'no-store'));
  assert.equal(s.calls.length, 1); assert.equal(s.models.length, 1);
});

test('photo wall is excluded from ordinary model material and author card exports', async () => {
  const s = setup(), plan = await s.service.saveScheme(null, s.draft); await s.service.generate(plan.id);
  const { createContextReader, createBackflowService } = await import('../src/context.js'), { createAuthoringService } = await import('../src/authoring.js');
  Object.assign(s.store.read(), { contacts: [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }], groups: [{ id: 'g', name: '群', memberIds: ['a', 'b'], userIsMember: true }], injectEnabled: true });
  const target = s.h.host.captureChat(), reader = createContextReader({ target, store: s.store, qqjBridgeProvider: () => null });
  const outputs = [await reader.readForContact('a'), await reader.readForGroup('g'), await reader.readForSocial([]), await reader.readForForum(), await reader.readForLiangshi({ includePhoneContext: true }), await reader.readForLiangshiHot(), await reader.readDirectorySources(), await createBackflowService({ target, store: s.store, modelClient: { complete() { throw Error('no model for empty history'); } } }).prepare(), await createAuthoringService({ host: s.h.host, store: s.store }).exportScript()];
  for (const output of outputs) assert.doesNotMatch(JSON.stringify(output), /vertical comic strip|wall-1.png|两个人/);
  assert.equal(s.store.read().notifications, undefined);
  assert.equal(s.h.modelRequests.length, 0);
});

test('failed metadata save keeps original wall state and reports failure without retrying provider', async () => {
  const s = setup(), plan = await s.service.saveScheme(null, s.draft);
  const before = structuredClone(s.store.read()); s.h.saveFailure = Error('metadata save failed');
  await assert.rejects(s.service.generate(plan.id), /保存失败/);
  assert.deepEqual(s.store.read(), before); assert.equal(s.calls.length, 1); assert.equal(readAlbumPhotos(s.store.read()).length, 0);
});

test('wall always resolves BBH independently of the normal provider setting', async () => {
  const { createImageProviders } = await import('../src/image-providers.js');
  const h = createHarness({ settings: { pocketPhone: { imageProvider: 'chatu8' } } }), api = { apiVersion: 1 };
  const providers = createImageProviders({ host: h.host, baibai: () => api });
  assert.equal(providers.resolveBaibai().api, api); assert.notEqual(providers.resolve().api, api);
  assert.equal(providers.getSelected(), 'chatu8'); assert.equal(h.settingsSaves, 0);
});


test('switching active chat during provider generation leaves BBH file alone and never writes the new chat', async () => {
  const s = setup(), plan = await s.service.saveScheme(null, s.draft); let finish;
  s.api.generate = () => new Promise(resolve => { finish = resolve; });
  const pending = s.service.generate(plan.id); await new Promise(resolve => setImmediate(resolve));
  const oldMetadata = s.h.context.chatMetadata, newMetadata = { pocketPhone: { contacts: [], conversations: {}, foreign: 'new chat' } };
  s.h.context.chatMetadata = newMetadata; s.h.context.chatId = 'new chat'; s.switchChat();
  const before = s.h.metadataSaves;
  finish({ path: '/user/images/test/paid-old.png', seed: 9 });
  await assert.rejects(pending, /已保存在柏宝绘.*聊天已切换.*未登记/);
  assert.equal(s.h.metadataSaves, before); assert.equal(s.h.context.chatMetadata, newMetadata);
  assert.equal(oldMetadata.pocketPhone.photoWall.photos.length, 0); assert.equal(oldMetadata.pocketPhone.albumPhotos, undefined);
  assert.deepEqual(newMetadata, { pocketPhone: { contacts: [], conversations: {}, foreign: 'new chat' } });
});

test('chat ownership is checked again inside save queue before retaining a paid result', async () => {
  const s = setup(), plan = await s.service.saveScheme(null, s.draft); let finishSave;
  const original = s.h.context.saveMetadata;
  s.h.context.saveMetadata = async () => { await new Promise(resolve => { finishSave = resolve; }); await original(); };
  const blocked = s.store.setTheme('night'); await new Promise(resolve => setImmediate(resolve));
  const pending = s.service.generate(plan.id); await new Promise(resolve => setImmediate(resolve));
  s.switchChat(); finishSave(); await blocked;
  const before = s.h.metadataSaves;
  await assert.rejects(pending, /已保存在柏宝绘.*未登记/); assert.equal(s.h.metadataSaves, before);
  assert.equal(s.store.read().albumPhotos, undefined); assert.equal(s.store.read().photoWall.photos.length, 0);
});


test('each manual photo uses exactly one panel-planning call; fixed emotions are not added outside its panels', async () => {
  const s = setup(), plan = await s.service.saveScheme(null, s.draft);
  assert.equal(s.models.length, 0); s.service.readCharacters(); await s.service.selectScheme(plan.id); assert.equal(s.models.length, 0);
  await s.service.generate(plan.id);
  assert.equal(s.models.length, 1); assert.equal(s.calls.length, 1);
  assert.match(s.models[0].system, /只输出JSON.*prompt.*nl/s); assert.match(s.models[0].system, /英文不额外加入/);
  assert.doesNotMatch(s.models[0].system, /手都放在|各自身侧|不互摸/);
  assert.match(s.calls[0].prompt, /character A \(甲\), character B \(乙\)/); assert.match(s.calls[0].prompt, /fingertips tensing slightly/);
  assert.doesNotMatch(s.calls[0].prompt, /slightly surprised|eyes closed|passionate deep kiss/);
  assert.equal(s.store.read().photoWall.photos[0].nl.includes(panels[0].zh), true);
  assert.equal(JSON.stringify(s.store.read().photoWall.photos[0]).includes('personality'), false);
});

test('bad planning output or failed text call never dispatches BBH, retries or falls back to old poses', async () => {
  for (const answer of [null, 'not JSON', '{}', JSON.stringify({ panels }), JSON.stringify({ prompt: 'English', nl: '' }), JSON.stringify({ prompt: 3, nl: '中文' })]) {
    const s = setup(), plan = await s.service.saveScheme(null, s.draft); let models = 0;
    s.modelClient.complete = async () => { models++; if (answer === null) throw Error('text failed'); return answer; };
    await assert.rejects(s.service.generate(plan.id), /text failed|提示词/); assert.equal(models, 1); assert.equal(s.calls.length, 0); assert.equal(s.store.read().photoWall.photos.length, 0);
  }
});

test('switching chat or disabling while planning prevents a later paid image request', async () => {
  for (const action of ['chat', 'disable']) {
    const s = setup(), plan = await s.service.saveScheme(null, s.draft); let finish;
    s.modelClient.complete = () => new Promise(resolve => { finish = resolve; });
    const pending = s.service.generate(plan.id); await new Promise(resolve => setImmediate(resolve));
    if (action === 'chat') s.switchChat(); else s.disable();
    finish(JSON.stringify(scene)); await assert.rejects(pending, /切换|停用/);
    assert.equal(s.calls.length, 0); assert.equal(readAlbumPhotos(s.store.read()).length, 0);
  }
});

test('BBH status is reread after planning so a changed backend receives the correct character branch', async () => {
  const s = setup(), plan = await s.service.saveScheme(null, s.draft); let statuses = 0;
  s.api.getBackendStatus = () => ({ configured: true, supportsCharacters: ++statuses === 1 });
  await s.service.generate(plan.id); assert.equal(statuses, 2); assert.match(s.calls[0].prompt, /long hair/); assert.match(s.calls[0].nl, /甲的完整外貌/);
  const t = setup(), other = await t.service.saveScheme(null, t.draft); let checks = 0;
  t.api.getBackendStatus = () => ({ configured: ++checks === 1, reason: 'backend disabled' });
  await assert.rejects(t.service.generate(other.id), /backend disabled/); assert.equal(t.models.length, 1); assert.equal(t.calls.length, 0);
});


test('real selected phone model and context reader compose one text request, one BBH request and one shared-path save', async () => {
  const { createApiSettings, createModelClient } = await import('../src/api.js');
  const { createContextReader } = await import('../src/context.js');
  for (const hostKind of ['native', 'luker']) {
    const settings = { pocketPhone: { apiSourceRef: { kind: 'shared-preset', presetId: 'chosen' }, apiModel: 'phone-current-model' }, 'schedule-planner': { apiPresets: [{ id: 'chosen', url: 'https://synthetic.invalid/v1', key: 'synthetic-only', model: 'preset-default-model' }] } };
    const settingsBefore = structuredClone(settings);
    const h = createHarness({ hostKind, settings, metadata: { pocketPhone: { contacts: [{ id: 'a', name: '甲', personality: 'SELECTED_PERSONALITY' }, { id: 'b', name: '乙' }], groups: [], conversations: { a: [{ text: 'PRIVATE_SMS' }] }, forum: { posts: [] } } }, messages: [{ mes: 'STORY_NOT_FOR_PHOTO' }], completion: { choices: [{ message: { content: JSON.stringify(scene) } }] } });
    const target = h.host.captureChat(), store = createPhoneStore({ target }), reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
    const calls = [], api = { apiVersion: 1, getBackendStatus: () => ({ configured: true, supportsCharacters: true }), getCharacters: () => ({ characters: [{ name: '甲', scope: 'global', tag: 'tag-a', nl: 'nl-a' }, { name: '乙', scope: 'chat', tag: 'tag-b', nl: 'nl-b' }] }), generate: async request => { assert.equal(h.modelRequests.length, 1, 'text completes before BBH'); calls.push(request); return { path: '/user/images/test/composed.png', seed: 18 }; } };
    const service = createPhotoWallService({ store, templateSettings: createPhotoWallTemplateSettings({ host: h.host }), providers: { resolveBaibai: () => ({ api }) }, contextReader: reader, modelClient: createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) }) });
    const plan = await service.saveScheme(null, { name: '两人', people: [{ name: '甲', scope: 'global' }, { name: '乙', scope: 'chat' }] });
    const before = h.metadataSaves; await service.generate(plan.id);
    assert.equal(h.modelRequests.length, 1); assert.equal(h.modelRequests[0].body.model, 'phone-current-model'); assert.equal(calls.length, 1); assert.equal(h.metadataSaves - before, 1); assert.equal(h.settingsSaves, 0);
    const input = JSON.parse(h.modelRequests[0].body.messages.at(-1).content);
    assert.match(JSON.stringify(input), /SELECTED_PERSONALITY/); assert.doesNotMatch(JSON.stringify(input), /PRIVATE_SMS|STORY_NOT_FOR_PHOTO/);
    assert.equal(store.read().photoWall.photos[0].path, store.read().albumPhotos[0].path); assert.equal(store.read().photoWall.photos[0].prompt, calls[0].prompt); assert.equal(store.read().albumPhotos[0].sources[0].nl, calls[0].nl);
    assert.equal(JSON.stringify(store.read().photoWall.photos[0]).includes('SELECTED_PERSONALITY'), false);
    assert.equal(Object.hasOwn(calls[0], 'character'), false); assert.deepEqual(h.context.extensionSettings, settingsBefore);
  }
});

test('scheme edits or removal during text planning still append the original requested pair and scheme snapshot', async () => {
  for (const action of ['edit', 'remove']) {
    const s = setup(), plan = await s.service.saveScheme(null, s.draft); let finish;
    s.modelClient.complete = () => new Promise(resolve => { finish = resolve; });
    const pending = s.service.generate(plan.id); await new Promise(resolve => setImmediate(resolve));
    if (action === 'edit') await s.service.saveScheme(plan.id, { name: '新方案', people: [...s.draft.people].reverse() }); else await s.service.removeScheme(plan.id);
    finish(JSON.stringify(scene)); const photo = await pending;
    assert.equal(photo.schemeName, '两个人'); assert.deepEqual(photo.people.map(person => person.name), ['甲', '乙']); assert.equal(s.store.read().photoWall.photos.length, 1); assert.equal(s.calls.length, 1);
  }
});

test('chat change while reading selected profiles stops before the text request', async () => {
  const s = setup(), plan = await s.service.saveScheme(null, s.draft); let finish;
  s.contextReader.readForPhotoWall = () => new Promise(resolve => { finish = resolve; });
  const pending = s.service.generate(plan.id); s.switchChat(); finish({ people: [] });
  await assert.rejects(pending, /切换/); assert.equal(s.models.length, 0); assert.equal(s.calls.length, 0);
});


test('Chinese single image and weighted English templates stay independent of people and have complete generation snapshots', async () => {
 const s=setup(), scheme=await s.service.saveScheme(null,s.draft);
 const raw='  单张，不分格，两人并肩看海，不亲吻。\n2::evening light::  ';
 const template=await s.service.saveTemplate(null,{name:'海边',prompt:raw});
 s.modelClient.complete=async request=>{s.models.push(request);return JSON.stringify({prompt:'single image, character A and character B by the sea, 2::evening light::',nl:'单张，两人并肩看海，2::evening light::'})};
 const photo=await s.service.generate(scheme.id);
 assert.equal(JSON.parse(s.models[0].messages[0].content).template.prompt,raw);
 assert.doesNotMatch(s.calls[0].prompt,/2koma|2 panels|couple|kiss/);assert.match(s.calls[0].prompt,/2::evening light::/);
 assert.deepEqual(photo.template,template);assert.deepEqual(s.store.read().albumPhotos[0].sources[0].template,template);
 const second=await s.service.saveTemplate(null,{name:'English',prompt:'single frame, 1.7::rain::\n two people with umbrellas'});
 await s.service.generate(scheme.id);assert.equal(JSON.parse(s.models[1].messages[0].content).template.prompt,second.prompt);
 await s.service.selectTemplate(template.id);assert.equal(s.store.read().photoWall.activeSchemeId,scheme.id);
 assert.equal(s.models.length,2);assert.equal(s.calls.length,2);assert.equal(photo.prompt,s.calls[0].prompt);
});

test('editing/removing templates while planning preserves the initiating snapshot and empty libraries block before any call', async () => {
 for(const action of ['edit','remove']){
  const s=setup(), scheme=await s.service.saveScheme(null,s.draft), original=s.service.readTemplates().templates[0];let finish;
  s.modelClient.complete=()=>new Promise(resolve=>{finish=resolve});const pending=s.service.generate(scheme.id);await new Promise(resolve=>setImmediate(resolve));
  if(action==='edit')await s.service.saveTemplate(original.id,{name:'new',prompt:'different'});else await s.service.removeTemplate(original.id);
  finish(JSON.stringify(scene));const photo=await pending;assert.deepEqual(photo.template,original);assert.deepEqual(s.store.read().albumPhotos[0].sources[0].template,original);
 }
 const s=setup(), scheme=await s.service.saveScheme(null,s.draft);await s.service.removeTemplate(s.service.readTemplates().selectedId);
 await assert.rejects(s.service.generate(scheme.id),/提示词方案/);assert.equal(s.calls.length,0);assert.equal(s.models.length,0);
});
