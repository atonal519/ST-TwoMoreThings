import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoringService, readCardPreset, stateFromPreset } from '../src/authoring.js';
import { createPhoneStore } from '../src/store.js';
import { createHostAdapter } from '../src/host.js';
import { createPhoneControl } from '../src/control.js';
import { createHarness } from './harness.mjs';
import { createContextReader } from '../src/context.js';
import { createApiSettings } from '../src/api.js';

test('background presets and local images survive a portable card round trip without social records', async () => {
  const h = createHarness(), store = createPhoneStore({ target: h.host.captureChat() });
  await store.upsertContacts([{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }]);
  const group = await store.saveGroup('', { name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: true });
  await store.setChatBackground('lin', 'color:sage');
  await store.setChatBackground('zhou', '/user/images/shared.webp');
  await store.setChatBackground(group.id, '/user/images/shared.webp');
  await store.setWallpaper('day', 'builtin:glass-lake');
  await store.setWallpaper('night', '/user/images/shared.webp');
  await store.updateSocial(social => ({ ...social,
    posts: [{ id: 'private-post', authorId: 'lin', text: '这条动态不能随卡导出', image: { description: '私有配图', path: '/images/private.png' } }],
    npcs: [{ id: 'npc:private', name: '私有路人', description: '不随卡复制' }],
    feedIds: ['private-post'], expandedAuthors: ['lin'],
  }));
  const before = structuredClone(store.read()), saves = h.metadataSaves, reads = [];
  const authoring = createAuthoringService({ store, host: h.host, baseUrl: 'http://localhost/', fetchImage: async url => {
    reads.push(url);
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/webp' } });
  } });
  const { script } = await authoring.exportScript();
  const preset = script.data.twoMoreThings;
  assert.deepEqual(reads, ['/user/images/shared.webp'], 'shared uploads are embedded once; builtins and color IDs are not fetched');
  assert.equal(preset.contacts[0].background, 'color:sage');
  assert.equal(preset.contacts[1].background, 'data:image/webp;base64,AQID');
  assert.equal(preset.groups[0].background, 'data:image/webp;base64,AQID');
  assert.deepEqual(preset.wallpapers, { day: 'builtin:glass-lake', night: 'data:image/webp;base64,AQID' });
  assert.equal('social' in preset, false);
  const serialized = JSON.stringify(script);
  for (const privateValue of ['private-post', '这条动态不能随卡导出', '/images/private.png', 'npc:private', '私有路人']) assert.equal(serialized.includes(privateValue), false);
  const imported = stateFromPreset(preset);
  const reader = createHarness(), readerStore = createPhoneStore({ target: reader.host.captureChat(), initialState: imported });
  assert.deepEqual(readerStore.read().contacts.map(person => person.background), ['color:sage', 'data:image/webp;base64,AQID']);
  assert.equal(readerStore.read().groups[0].background, 'data:image/webp;base64,AQID');
  assert.deepEqual(readerStore.read().groups[0].memberIds, readerStore.read().contacts.map(person => person.id));
  assert.deepEqual(readerStore.read().wallpapers, preset.wallpapers);
  assert.equal(readerStore.read().social, undefined);
  assert.deepEqual(readerStore.read().conversations, {});
  assert.equal(reader.metadataSaves, 0, 'loading author defaults does not write a reader archive');
  assert.deepEqual(store.read(), before);
  assert.equal(h.metadataSaves, saves, 'export does not change the author archive');
});

test('export produces a portable helper script with authored profiles and groups, excluding records and credentials', async () => {
  const h = createHarness(), store = createPhoneStore({ target: h.host.captureChat() });
  await store.saveContact('', { name: '林舟', nickname: '舟', expression: '短句，只用文字表达。', avatar: 'http://localhost/user/avatars/a.png', language: '英语，附中文翻译' });
  const person = store.read().contacts[0];
  await store.saveGroup('', { name: '朋友', memberIds: [person.id], userIsMember: true, avatar: 'http://localhost/user/avatars/a.png' });
  await store.setWallpaper('day', '/user/wallpaper.png');
  await store.appendMessage(person.id, { role: 'user', id: 'private', text: '不应导出的短信' });
  h.context.chatMetadata.pocketPhone.todos = [{ id: 'private-todo', status: 'open', title: '不应导出的私人待办', participantIds: ['@user', person.id] }];
  h.context.extensionSettings.pocketPhone = { apiKey: 'do-not-export', apiSourceRef: { kind: 'shared-preset', presetId: 'secret-reference' } };
  const reads = [];
  const authoring = createAuthoringService({ store, host: h.host, readEntries: () => ({ fabShow: false, qrShow: true }), fetchImage: async url => { reads.push(url); return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/png' } }); } });
  const result = await authoring.exportScript({ coreUrl: 'https://example.invalid/embed.js' });
  const script = result.script, preset = script.data.twoMoreThings;
  assert.equal(script.type, 'script');
  assert.equal(script.export_with.data, true);
  assert.equal(preset.contacts[0].name, '林舟');
  assert.equal(preset.contacts[0].expression, '短句，只用文字表达。');
  assert.equal(preset.contacts[0].avatar, 'data:image/png;base64,AQID');
  assert.deepEqual(preset.groups[0].memberIds, [preset.contacts[0].id]);
  assert.equal(preset.groups[0].avatar, preset.contacts[0].avatar);
  assert.equal(preset.wallpapers.day, 'data:image/png;base64,AQID');
  assert.deepEqual(preset.entries, { fabShow: false, qrShow: true });
  assert.equal(reads.length, 2, 'the same local image is read only once per export');
  const serialized = JSON.stringify(script);
  assert.equal(serialized.includes('不应导出的短信'), false);
  assert.equal(serialized.includes('不应导出的私人待办'), false);
  assert.equal('todos' in preset, false);
  assert.equal(serialized.includes('do-not-export'), false);
  assert.equal(serialized.includes('secret-reference'), false);
  assert.equal('source' in preset.contacts[0], false);
});

test('a new chat reads author defaults without saving, existing archives and subsequent edits remain authoritative', async () => {
  const preset = { schemaVersion: 1, theme: 'night', contacts: [{ id: 'one', name: '林舟', expression: '只回短句' }], groups: [{ id: 'friends', name: '朋友', memberIds: ['one'], userIsMember: true }] };
  const h = createHarness(), target = h.host.captureChat();
  const store = createPhoneStore({ target, initialState: stateFromPreset(preset) });
  assert.equal(store.read().contacts[0].name, '林舟');
  assert.equal(store.read().theme, 'night');
  assert.equal(h.metadataSaves, 0);
  await store.saveContact('one', { name: '新名字', expression: '只回短句' });
  const reopened = createPhoneStore({ target, initialState: stateFromPreset(preset) });
  assert.equal(reopened.read().contacts[0].name, '新名字');
  assert.deepEqual(reopened.read().conversations, {});
  assert.equal(preset.contacts[0].name, '林舟');
});

test('card marker can be read from a helper script, including a folder, without modifying the card', () => {
  const preset = { schemaVersion: 1, contacts: [], groups: [] };
  const extensions = { tavern_helper: { scripts: [{ type: 'folder', scripts: [{ type: 'script', data: { twoMoreThings: preset } }] }] } };
  assert.equal(readCardPreset({ data: { extensions } }), preset);
  assert.equal(readCardPreset({ data: { extensions: { unrelated: true } } }), null);
  assert.deepEqual(Object.keys(extensions), ['tavern_helper']);
});

test('a group with an unknown member is reported instead of guessing another character', () => {
  assert.throws(() => stateFromPreset({ schemaVersion: 1, contacts: [], groups: [{ id: 'g', name: '朋友', memberIds: ['missing'], userIsMember: true }] }), /群.*成员/);
});

test('embedded control and prompt slots are independent while retaining the same chat archive', async () => {
  const h = createHarness();
  const embeddedHost = createHostAdapter({ contextProvider: () => h.context, mode: 'embedded' });
  const standalone = createPhoneControl({ host: h.host, target: h.host.captureChat() });
  const embedded = createPhoneControl({ host: embeddedHost, target: embeddedHost.captureChat() });
  await standalone.setEnabled(false);
  assert.equal(embedded.isEnabled(), true);
  embeddedHost.setPrompt('卡内摘要');
  h.host.setPrompt('');
  assert.ok([...h.promptSlots.values()].includes('卡内摘要'));
  const store = createPhoneStore({ target: embeddedHost.captureChat() });
  await store.saveContact('', { name: '林舟' });
  assert.equal(h.host.captureChat().metadata.pocketPhone.contacts.length, 1);
});

test('authored contacts recall the reader’s own uniquely named QQJ actor without exporting author entity IDs', async () => {
  const h = createHarness(), target = h.host.captureChat();
  const store = createPhoneStore({ target, initialState: stateFromPreset({ schemaVersion: 1, contacts: [{ id: 'card:one', name: '林舟' }], groups: [] }) });
  const queries = []; let items = [{ displayName: '林舟', entityId: 'reader-owned-actor', profile: { personality: '温和' } }];
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => ({
    getPeopleSnapshot: () => ({ status: 'ready', people: { items } }),
    readContext: async request => { queries.push(request); return { status: 'ready', actors: [{ entityId: 'reader-owned-actor', memoryText: '用户与林舟去过书店。' }] }; },
  }) });
  assert.equal((await reader.readForContact('card:one')).related, '用户与林舟去过书店。');
  assert.deepEqual(queries[0].entityIds, ['reader-owned-actor']);
  assert.equal(store.read().contacts[0].source.kind, 'card');
  const group = await store.saveGroup('', { name: '朋友', memberIds: ['card:one'], userIsMember: true });
  assert.equal((await reader.readForGroup(group.id)).group.members[0].related, '用户与林舟去过书店。');
  assert.equal((await reader.readDirectorySources()).people[0].sourceId, 'card:one', 'directory uses the existing authored contact identity');
  items = [...items, { displayName: '林舟', entityId: 'another-reader-actor' }];
  assert.equal((await reader.readForContact('card:one')).related, '');
  assert.equal(queries.length, 2, 'ambiguous names do not choose someone else’s memory');
});

test('embedded phone initially follows the reader’s existing phone connection without changing it', () => {
  const h = createHarness({ settings: { pocketPhone: { apiSourceRef: { kind: 'shared-preset', presetId: 'chosen' } }, 'schedule-planner': { apiPresets: [{ id: 'chosen', url: 'https://example.invalid', key: 'reader-key', model: 'reader-model' }, { id: 'other', url: 'https://other.invalid', key: 'other-key', model: 'other-model' }] } } });
  const host = createHostAdapter({ contextProvider: () => h.context, mode: 'embedded' });
  assert.equal(createApiSettings({ host }).resolve().model, 'reader-model');
  assert.equal(h.settingsSaves, 0);
});

test('an unavailable local picture gives an actionable export error', async () => {
  const h = createHarness(), store = createPhoneStore({ target: h.host.captureChat() });
  await store.setWallpaper('day', '/user/images/missing.png');
  const authoring = createAuthoringService({ store, host: h.host, fetchImage: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(authoring.exportScript(), /图片打包失败.*重新上传/);
});
