import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { renderDesktop } from '../src/ui/desktop.js';
import { readCamera } from '../src/camera-presets.js';
import { createContextReader } from '../src/context.js';
import { createAuthoringService } from '../src/authoring.js';
import { initializeNotificationHistory } from '../src/notifications.js';

const cameraModule = await import('../src/camera.js').catch(() => ({}));
const presets = [{ id: 'p', name: '街拍', groups: [], groupId: '', prompts: [{ id: 't', name: '雨巷', prompt: '  rainy alley\n1.4::light::  ' }], promptId: 't', mode: 'direct' }];
function setup({ people = 0, mode = 'direct', supportsCharacters = true, hostKind = 'native', legacy = false } = {}) {
  assert.equal(typeof cameraModule.createCameraService, 'function');
  const h = createHarness({ hostKind, metadata: { pocketPhone: legacy ? { contacts: [], groups: [], conversations: {}, photoWall: { schemes: [{ id: 'old', name: '旧人组', people: [{ name: '人物1', scope: '' }, { name: '人物2', scope: '' }] }], activeSchemeId: 'old', photos: [], desktopPhotoId: '' } } : { contacts: [], groups: [], conversations: {}, camera: { presets: structuredClone(presets), selectedId: 'p' } } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const catalog = Array.from({ length: Math.max(people, 3) }, (_, index) => ({ name: `人物${index + 1}`, scope: '', tag: `appearance-${index + 1}`, nl: `外貌${index + 1}` }));
  if (!legacy) Object.assign(store.read().camera.presets[0], { mode, groups: people ? [{ id: 'g', name: '人物组', people: catalog.slice(0, people).map(({ name, scope }) => ({ name, scope })) }] : [], groupId: people ? 'g' : '' });
  let current = true, enabled = true, directoryReads = 0, profileReads = 0;
  const calls = [], models = [], busy = [], api = { apiVersion: 1, getBackendStatus: () => ({ configured: true, supportsCharacters }), getCharacters: () => { directoryReads++; return { characters: catalog }; }, generate: async request => { calls.push(structuredClone(request)); return { path: '/user/images/test/camera.png', seed: 11 }; } };
  const contextReader = { readForPhotoWall: async selected => { profileReads++; return { people: selected.map((person, index) => ({ role: index === 0 ? 'A' : index === 1 ? 'B' : String(index + 1), name: person.name, appearance: { tag: person.tag, nl: person.nl } })) }; } };
  const modelClient = { complete: async request => { models.push(request); const input = JSON.parse(request.messages[0].content); return JSON.stringify({ prompt: 'global scene', nl: '共同场景', characters: [...input.people].reverse().map(person => ({ role: person.role, tag: `action-${person.name}`, nl: `${person.name}动作` })) }); } };
  const service = cameraModule.createCameraService({ store, providers: { resolveBaibai: () => ({ api }) }, contextReader, modelClient, legacyTemplates: { read: () => ({ templates: [{ id: 'old-t', name: '旧词', prompt: '  old\nweighted::  ' }], selectedId: 'old-t', explicit: true }) }, assertEnabled: () => { if (!enabled) throw Error('停用'); }, isCurrentChat: () => current, onBusyChange: value => busy.push(value), readTime: () => ({ date: '2031年4月8日', time: '10:00' }) });
  return { h, target, store, catalog, calls, models, api, service, modelClient, contextReader, busy, get directoryReads() { return directoryReads; }, get profileReads() { return profileReads; }, switchChat() { current = false; }, disable() { enabled = false; } };
}

for (const count of [0, 1, 3]) for (const supportsCharacters of [true, false]) test(`direct ${count} people with characters=${supportsCharacters} keeps raw prompt and one image call`, async () => {
  const s = setup({ people: count, supportsCharacters }), before = s.h.metadataSaves;
  const photo = await s.service.generate('p');
  assert.equal(s.models.length, 0); assert.equal(s.profileReads, 0); assert.equal(s.directoryReads, Number(count > 0)); assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].prompt, supportsCharacters || !count ? presets[0].prompts[0].prompt : [...s.catalog.slice(0, count).map(person => person.tag), presets[0].prompts[0].prompt].join(', '));
  assert.equal(s.calls[0].characters.length, count); assert.equal(photo.path, s.store.read().albumPhotos[0].path); assert.equal(s.h.metadataSaves, before + 1); assert.equal(s.h.settingsSaves, 0);
});

for (const hostKind of ['native', 'luker']) test(`${hostKind}: three-person polish binds each action and appearance in returned visual order`, async () => {
  const s = setup({ people: 3, mode: 'polish', hostKind }); await s.service.generate('p');
  const example = JSON.parse(s.models[0].system.split('结构为')[1].split('。characters')[0]);
  assert.deepEqual(example.characters.map(person => person.role), ['A', 'B', '3']);
  assert.equal(s.models.length, 1); assert.equal(s.profileReads, 1); assert.equal(s.calls.length, 1); assert.equal(s.calls[0].prompt, 'global scene');
  assert.deepEqual(s.calls[0].characters.map(person => person.name), ['人物3', '人物2', '人物1']);
  assert.deepEqual(s.calls[0].characters.map(person => person.tag), ['appearance-3, action-人物3', 'appearance-2, action-人物2', 'appearance-1, action-人物1']);
});

test('legacy preset is read without writes and first whole-preset save freezes legacy groups and exact prompt', async () => {
  const s = setup({ legacy: true }), before = structuredClone(s.store.read()); const value = s.service.readPresets();
  assert.equal(value.presets[0].name, '原照片墙'); assert.equal(value.presets[0].mode, 'polish'); assert.equal(value.presets[0].prompts[0].prompt, '  old\nweighted::  ');
  assert.deepEqual(s.store.read(), before); assert.equal(s.h.metadataSaves, 0);
  const draft = structuredClone(value.presets[0]); draft.name = '新名称'; draft.prompts.push({ id: 'extra', name: '另一个词', prompt: '' });
  await s.service.savePreset(draft.id, draft); assert.equal(s.h.metadataSaves, 1); assert.equal(s.h.settingsSaves, 0); assert.equal(s.store.read().camera.presets[0].prompts.length, 2);
  assert.equal(createPhoneStore({ target: s.target }).read().camera.presets[0].name, '新名称');
});

test('any normalized album path sets the wall once, ordinary desktop renders without scanning album history', async () => {
  const h = createHarness({ metadata: { pocketPhone: { contacts: [], groups: [], conversations: {}, albumPhotos: [{ path: '/user/images/test/album.png', description: '相册图', sources: [{ kind: 'messages', id: 'm', label: '短信' }] }] } } });
  const store = createPhoneStore({ target: h.host.captureChat() }); assert.equal(typeof store.setPhotoWall, 'function');
  await store.setPhotoWall(' /user/images/test/album.png ');
  assert.equal(store.read().photoWall.desktopPhotoPath, '/user/images/test/album.png'); assert.equal(h.metadataSaves, 1);
  const state = { ...store.read(), get albumPhotos() { assert.fail('desktop must use stored wall pointer'); } };
  const markup = renderDesktop(state, { apps: [] }); assert.match(markup, /data-phone-image="\/user\/images\/test\/album.png"/); assert.match(markup, /data-action="album-open"/);
  await store.clearImagePaths(['/user/images/test/album.png']); assert.equal(store.read().photoWall.desktopPhotoPath, '');
});


function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

for (const hostKind of ['native', 'luker']) {
  test(`${hostKind}: switching during profile or text waits prevents image dispatch`, async () => {
    for (const stage of ['profile', 'text']) {
      const s = setup({ people: 1, mode: 'polish', hostKind });
      const started = deferred(), wait = deferred();
      const object = stage === 'profile' ? s.contextReader : s.modelClient;
      const method = stage === 'profile' ? 'readForPhotoWall' : 'complete';
      const original = object[method];
      object[method] = async input => {
        started.resolve();
        await wait.promise;
        return original(input);
      };
      const pending = s.service.generate('p');
      await started.promise;
      s.switchChat();
      wait.resolve();
      await assert.rejects(pending, /聊天已切换/);
      assert.equal(s.calls.length, 0);
      assert.equal(s.h.metadataSaves, 0);
    }
  });

  test(`${hostKind}: switching while a paid image waits leaves the provider file unregistered`, async () => {
    const s = setup({ hostKind }), started = deferred(), wait = deferred();
    s.api.generate = async request => {
      s.calls.push(request);
      started.resolve();
      await wait.promise;
      return { path: '/user/images/test/paid.png' };
    };
    const pending = s.service.generate('p');
    await started.promise;
    s.switchChat();
    wait.resolve();
    await assert.rejects(pending, /已保存在柏宝绘.*未登记/);
    assert.equal(s.calls.length, 1);
    assert.equal(s.h.metadataSaves, 0);
    assert.equal(s.store.read().albumPhotos, undefined);
    assert.deepEqual(s.busy, [true, false]);
  });

  test(`${hostKind}: save queue rechecks chat identity before registering an already paid image`, async () => {
    const s = setup({ hostKind }), started = deferred(), save = deferred();
    const originalSave = s.target.saveMetadata;
    s.target.saveMetadata = async () => {
      started.resolve();
      await save.promise;
      return originalSave();
    };
    const blocker = s.service.selectPreset('p');
    await started.promise;
    const generated = deferred(), originalGenerate = s.api.generate;
    s.api.generate = async request => {
      const result = await originalGenerate(request);
      generated.resolve();
      return result;
    };
    const pending = s.service.generate('p');
    await generated.promise;
    await Promise.resolve();
    s.switchChat();
    save.resolve();
    await blocker;
    await assert.rejects(pending, /未登记/);
    assert.equal(s.h.metadataSaves, 1);
    assert.equal(s.store.read().albumPhotos, undefined);
    assert.equal(s.calls.length, 1);
  });

  test(`${hostKind}: metadata save failure rolls back registration and sends no second image request`, async () => {
    const s = setup({ hostKind }), before = structuredClone(s.store.read());
    s.h.saveFailure = Error('metadata unavailable');
    await assert.rejects(s.service.generate('p'), /手机内容保存失败/);
    assert.deepEqual(s.store.read(), before);
    assert.equal(s.calls.length, 1);
    assert.equal(s.h.metadataSaves, 0);
    assert.deepEqual(s.busy, [true, false]);
  });

  test(`${hostKind}: disabling after image return retains only the paid album asset`, async () => {
    const s = setup({ hostKind }), original = s.api.generate;
    s.api.generate = async request => {
      const result = await original(request);
      s.disable();
      return result;
    };
    await assert.rejects(s.service.generate('p'), /停用.*图片已保存到相册/);
    assert.equal(s.store.read().albumPhotos.length, 1);
    assert.equal(s.store.read().photoWall, undefined);
    assert.equal(s.h.metadataSaves, 1);
    assert.equal(s.calls.length, 1);
  });
}

test('waiting edits and deletion keep generated source snapshots and leave the latest preset selection intact', async () => {
  for (const remove of [false, true]) {
    const s = setup({ people: 3 }), started = deferred(), wait = deferred();
    s.api.generate = async request => {
      s.calls.push(structuredClone(request));
      started.resolve();
      await wait.promise;
      return { path: '/user/images/test/snapshot.png', seed: 24 };
    };
    const pending = s.service.generate('p');
    await started.promise;
    const draft = structuredClone(s.service.readPresets().presets[0]);
    draft.name = '后来的预设';
    draft.prompts[0].prompt = 'later prompt';
    if (remove) await s.service.removePreset('p');
    else await s.service.savePreset('p', draft);
    wait.resolve();
    const photo = await pending;
    const cold = createPhoneStore({ target: s.target }).read();
    const source = cold.albumPhotos[0].sources[0];
    assert.equal(source.preset.name, '街拍');
    assert.equal(source.template.prompt, presets[0].prompts[0].prompt);
    assert.deepEqual(source.people, s.catalog.slice(0, 3));
    assert.equal(source.seed, 24);
    assert.equal(photo.path, cold.albumPhotos[0].path);
    assert.equal(cold.photoWall, undefined);
    assert.equal(cold.camera.presets.length, remove ? 0 : 1);
    if (!remove) assert.equal(cold.camera.presets[0].name, '后来的预设');
  }
});

test('one-person polish has a matching one-slot example and allows empty dynamic fields', async () => {
  const s = setup({ people: 1, mode: 'polish' });
  s.modelClient.complete = async request => {
    s.models.push(request);
    return JSON.stringify({ prompt: 'global', nl: '全局', characters: [{ role: 'A', tag: '', nl: '' }] });
  };
  await s.service.generate('p');
  const example = JSON.parse(s.models[0].system.split('结构为')[1].split('。characters')[0]);
  assert.deepEqual(example.characters.map(row => row.role), ['A']);
  assert.deepEqual(s.calls[0].characters, [{ name: '人物1', tag: 'appearance-1', nl: '外貌1' }]);
});

test('polished fallback merges the same ordered per-person fields into the actual base', async () => {
  const s = setup({ people: 3, mode: 'polish', supportsCharacters: false });
  const photo = await s.service.generate('p');
  const request = s.calls[0];
  assert.equal(request.prompt, [...request.characters.map(row => row.tag), 'global scene'].join(', '));
  assert.equal(request.nl, [...request.characters.map(row => row.nl), '共同场景'].join('\n'));
  assert.equal(photo.prompt, request.prompt);
  assert.equal(s.store.read().albumPhotos[0].sources[0].nl, request.nl);
});

test('invalid role structures stop before any image or save and never retry text', async () => {
  const variants = [
    [{ role: 'A', tag: '', nl: '' }],
    [{ role: 'A', tag: '', nl: '' }, { role: 'A', tag: '', nl: '' }, { role: '3', tag: '', nl: '' }],
    [{ role: 'A', tag: '', nl: '' }, { role: 'B', tag: '', nl: '' }, { role: 'unknown', tag: '', nl: '' }],
    [{ role: 'A', tag: '', nl: '' }, { role: 'B', tag: 1, nl: '' }, { role: '3', tag: '', nl: '' }],
  ];
  for (const characters of variants) {
    const s = setup({ people: 3, mode: 'polish' });
    s.modelClient.complete = async request => {
      s.models.push(request);
      return JSON.stringify({ prompt: 'global', nl: '全局', characters });
    };
    await assert.rejects(s.service.generate('p'), /角色/);
    assert.equal(s.models.length, 1);
    assert.equal(s.calls.length, 0);
    assert.equal(s.h.metadataSaves, 0);
  }
});

test('zero-person polish bypasses profile, model and even an unavailable character directory', async () => {
  const s = setup({ mode: 'polish' });
  delete s.api.getCharacters;
  await s.service.generate('p');
  assert.equal(s.models.length, 0);
  assert.equal(s.profileReads, 0);
  assert.equal(s.calls[0].prompt, presets[0].prompts[0].prompt);
  assert.deepEqual(s.calls[0].characters, []);
});

test('missing or ambiguous selected library identities fail before paid dispatch', async () => {
  for (const entries of [[], [{ name: '人物1', tag: '' }], [{ name: '人物1', tag: 'one' }, { name: '人物1', tag: 'two' }]]) {
    const s = setup({ people: 1 });
    s.api.getCharacters = () => ({ characters: entries });
    await assert.rejects(s.service.generate('p'), /缺失或存在重名/);
    assert.equal(s.calls.length, 0);
    assert.equal(s.models.length, 0);
  }
});

test('whole-preset commits are atomic and failed saves retain original state and editable draft', async () => {
  const s = setup(), before = structuredClone(s.store.read()), draft = structuredClone(presets[0]);
  draft.name = '多套人物和词';
  draft.groups = [{ id: 'one', name: '独照', people: [{ name: '人物1', scope: '' }] }, { id: 'many', name: '合照', people: s.catalog.map(({ name, scope }) => ({ name, scope })) }];
  draft.groupId = 'many';
  draft.prompts.push({ id: 'other', name: '空白备用', prompt: '' });
  draft.mode = 'polish';
  s.h.saveFailure = Error('save failed');
  await assert.rejects(s.service.savePreset('p', draft), /手机内容保存失败/);
  assert.deepEqual(s.store.read(), before);
  assert.equal(draft.groups.length, 2);
  s.h.saveFailure = null;
  await s.service.savePreset('p', draft);
  assert.equal(s.h.metadataSaves, 1);
  assert.equal(s.h.settingsSaves, 0);
  assert.deepEqual(s.store.read().camera.presets[0], draft);
  await s.service.removePreset('p');
  assert.deepEqual(s.service.readPresets(), { presets: [], selectedId: '' });
});

test('fresh chats omit default-only legacy pairs and explicit camera emptiness stays empty', () => {
  const legacy = { templates: [{ id: 't', name: '双人格', prompt: 'pair' }], explicit: false };
  assert.deepEqual(readCamera({}, legacy), { presets: [], selectedId: '' });
  assert.deepEqual(readCamera({ camera: { presets: [], selectedId: '' }, photoWall: { schemes: [{ id: 'g' }] } }, { ...legacy, explicit: true }), { presets: [], selectedId: '' });
});

test('photo context generalizes selected roles while ordinary model and author exports isolate camera state', async () => {
  const s = setup({ people: 3 });
  s.store.read().camera.presets[0].prompts[0].prompt = 'PRIVATE_CAMERA_TEXT';
  const reader = createContextReader({ target: s.target, store: s.store, qqjBridgeProvider: () => null });
  const selected = await reader.readForPhotoWall(s.catalog);
  assert.deepEqual(selected.people.map(row => row.role), ['A', 'B', '3']);
  assert.doesNotMatch(JSON.stringify(selected), /PRIVATE_CAMERA_TEXT/);
  assert.equal(initializeNotificationHistory(s.store.read()).notifications.items.length, 0);
  const exported = await createAuthoringService({ store: s.store, host: s.h.host }).exportScript();
  assert.doesNotMatch(JSON.stringify(exported), /PRIVATE_CAMERA_TEXT|camera/);
});
