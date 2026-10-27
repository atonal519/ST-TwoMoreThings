import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createApiSettings, createModelClient } from '../src/api.js';

function setup(hostKind = 'native', embedded = false) {
  const a = { id: 'a', name: '日常连接', url: 'https://a.invalid/v1', key: 'a-key', model: 'shared-default', timeoutSec: 90, excludeParams: ['temperature'], stream: true, unknown: { keep: true }, qqjAdditionalParams: '{"x":1}' };
  const settings = { 'schedule-planner': { apiPresets: [a], apiPresetActiveId: 'a', unrelated: true }, qianqianjie: { selectedSevenDaysPresetId: 'a' }, pocketPhone: { apiSourceRef: { kind: 'shared-preset', presetId: 'a' }, apiModel: 'native-custom', fabShow: false }, twoMoreThingsEmbedded: { apiSourceRef: { kind: 'shared-preset', presetId: 'a' }, apiModel: 'card-custom' } };
  const h = createHarness({ hostKind, settings }), host = embedded ? { ...h.host, phoneSettingsKey: 'twoMoreThingsEmbedded' } : h.host;
  const api = createApiSettings({ host }), client = createModelClient({ host, sourceProvider: api });
  return { h, settings, api, client, key: embedded ? 'twoMoreThingsEmbedded' : 'pocketPhone' };
}

test('preset names display exactly without a program-added shared prefix', () => {
  const { settings, api } = setup();
  settings['schedule-planner'].apiPresets.push({ id: 'b', name: '共享·自己起的名字' }, { id: 'c', model: 'fallback-model' }, { id: 'd' });
  assert.deepEqual(api.listSources().map(row => row.label), ['日常连接', '共享·自己起的名字', 'fallback-model', '未命名']);
});

for (const [kind, embedded] of [['native', false], ['luker', true]]) test(`${kind}: saving a selected preset updates shared credentials and local model in one save only`, async () => {
  const { h, settings, api, client, key } = setup(kind, embedded), old = structuredClone(settings['schedule-planner'].apiPresets[0]);
  assert.equal(typeof api.saveCurrent, 'function');
  const other = structuredClone(settings[embedded ? 'pocketPhone' : 'twoMoreThingsEmbedded']);
  await api.saveCurrent({ url: 'https://edited.invalid/v1/chat/completions', key: '', model: 'local-chosen' });
  assert.deepEqual(settings['schedule-planner'].apiPresets[0], { ...old, url: 'https://edited.invalid/v1' });
  assert.equal(settings[key].apiModel, 'local-chosen'); assert.deepEqual(settings[embedded ? 'pocketPhone' : 'twoMoreThingsEmbedded'], other); assert.equal(h.settingsSaves, 1);
  await client.complete({ system: 'test', messages: [] });
  assert.deepEqual([h.modelRequests[0].body.reverse_proxy, h.modelRequests[0].body.proxy_password, h.modelRequests[0].body.model], ['https://edited.invalid/v1', 'a-key', 'local-chosen']);
  assert.equal(api.readDraft().key, '');
});

test('model discovery uses unsaved draft URL and key, while complete keeps saved values', async () => {
  const { h, api, client } = setup();
  h.completion = { data: [{ id: 'm' }] };
  await api.fetchModels({ url: 'https://draft.invalid/v1', key: '', model: '' }, api.getSelected());
  assert.deepEqual([h.modelRequests[0].body.reverse_proxy, h.modelRequests[0].body.proxy_password], ['https://draft.invalid/v1', 'a-key']);
  await api.fetchModels({ url: 'https://draft.invalid/v1', key: 'draft-key' }, api.getSelected()); assert.equal(h.modelRequests[1].body.proxy_password, 'draft-key');
  h.completion = { choices: [{ message: { content: '{"messages":[{"text":"好"}]}' } }] }; await client.complete({ system: 'test', messages: [] });
  assert.deepEqual([h.modelRequests[2].body.reverse_proxy, h.modelRequests[2].body.model], ['https://a.invalid/v1', 'native-custom']); assert.equal(h.settingsSaves, 0);
});

test('whitespace-only key edits retain the current preset key for saving and model discovery', async () => {
  const { h, api } = setup();
  await api.saveCurrent({ url: 'https://new.invalid', key: '   ', model: 'm' }); assert.equal(api.resolve().key, 'a-key');
  h.completion = { models: ['m'] }; await api.fetchModels({ url: 'https://draft.invalid', key: '  ' }, api.getSelected()); assert.equal(h.modelRequests[0].body.proxy_password, 'a-key');
});

test('Save As keeps the original preset and its extra settings, inherits blank key, and selects the new ID', async () => {
  const { settings, api, h } = setup(), old = structuredClone(settings['schedule-planner']);
  assert.equal(typeof api.saveAs, 'function');
  await assert.rejects(api.saveAs({ url: 'https://copy.invalid', key: '', model: 'copy-model' }, '   '), /名称/); assert.equal(h.settingsSaves, 0);
  const ref = await api.saveAs({ url: 'https://copy.invalid', key: '', model: 'copy-model' }, '新连接');
  const presets = settings['schedule-planner'].apiPresets; assert.equal(presets.length, 2); assert.notEqual(ref.presetId, 'a');
  assert.deepEqual(presets[0], old.apiPresets[0]); assert.deepEqual(presets[1], { ...old.apiPresets[0], id: ref.presetId, name: '新连接', url: 'https://copy.invalid/v1', key: 'a-key', model: 'copy-model' });
  assert.deepEqual(api.getSelected(), ref); assert.equal(settings.pocketPhone.apiModel, 'copy-model'); assert.equal(h.settingsSaves, 1); assert.equal(settings['schedule-planner'].apiPresetActiveId, 'a');
});

for (const embedded of [false, true]) test(`delete selected preset leaves explicit none across reopen and preserves foreign references (${embedded ? 'embedded' : 'native'})`, async () => {
  const { settings, api, h, key } = setup('native', embedded);
  settings['schedule-planner'].apiPresets.push({ id: 'b', name: '另一个', url: 'https://b.invalid/v1', key: 'b-key', model: 'b-model' });
  assert.equal(typeof api.deletePreset, 'function');
  const foreign = structuredClone(settings[embedded ? 'pocketPhone' : 'twoMoreThingsEmbedded']);
  await api.deletePreset();
  assert.deepEqual(settings['schedule-planner'].apiPresets.map(row => row.id), ['b']); assert.deepEqual(api.getSelected(), { kind: 'none' }); assert.equal(settings[key].apiModel, '');
  assert.deepEqual(settings[embedded ? 'pocketPhone' : 'twoMoreThingsEmbedded'], foreign); assert.equal(settings.qianqianjie.selectedSevenDaysPresetId, 'a'); assert.equal(settings['schedule-planner'].apiPresetActiveId, 'a');
  assert.equal(h.settingsSaves, 1); assert.throws(api.resolve, /选择|连接/);
  const reopened = createApiSettings({ host: { ...h.host, phoneSettingsKey: key } }); assert.deepEqual(reopened.getSelected(), { kind: 'none' }); assert.throws(reopened.resolve, /选择|连接/);
  assert.equal(h.modelRequests.length, 0);
});

test('all three mutations restore the previous shared pool and local selection when settings save fails', async () => {
  const { settings, api, h } = setup(), old = structuredClone(settings); h.host.saveSettings = async () => { throw Error('synthetic'); };
  for (const [method, args] of [['saveCurrent', [{ url: 'https://new.invalid', model: 'm' }]], ['saveAs', [{ url: 'https://new.invalid', model: 'm' }, 'copy']], ['deletePreset', []]]) {
    assert.equal(typeof api[method], 'function'); await assert.rejects(api[method](...args), /保存失败|删除失败/); assert.deepEqual(settings, old);
  }
});
