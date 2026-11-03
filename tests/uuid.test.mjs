import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { createApiSettings, saveManualPreset } from '../src/api.js';
import { createAuthoringService } from '../src/authoring.js';

const uuid4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const draft = { url: 'https://fixture.invalid/v1', key: 'fixture-key', model: 'fixture-model' };
function globals(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => { if (previous) Object.defineProperty(globalThis, key, previous); else delete globalThis[key]; });
  }
}

test('API creation and save-as work without randomUUID or a host helper, retaining saved references and distinct UUID4 IDs', async t => {
  globals(t, { crypto: {}, SillyTavern: undefined, Luker: undefined });
  const settings = { foreign: { keep: true } }; let saves = 0;
  const api = createApiSettings({ host: { readSettings: () => settings, saveSettings: async () => { saves++; } } });
  const first = await api.createPreset(draft, 'First');
  assert.match(first.presetId, uuid4); assert.equal(api.getSelected(), null); assert.equal(saves, 1);
  await api.select(first);
  const second = await api.saveAs(api.readDraft(), 'Second');
  assert.match(second.presetId, uuid4); assert.notEqual(second.presetId, first.presetId);
  assert.deepEqual(api.getSelected(), second); assert.equal(api.resolve().model, 'fixture-model');
  assert.equal(saves, 3); assert.equal(settings['schedule-planner'].apiPresets.length, 2);
  assert.deepEqual(settings.foreign, { keep: true });
});

test('API IDs keep the native randomUUID method receiver and take precedence over host helpers', async t => {
  let nativeCalls = 0;
  const crypto = { randomUUID() { assert.equal(this, crypto); nativeCalls++; return '10000000-0000-4000-8000-000000000001'; } };
  globals(t, { crypto, SillyTavern: { getContext() { throw Error('native IDs must not query the host'); } }, Luker: undefined });
  const settings = {}; let saves = 0;
  const ref = await saveManualPreset(settings, draft, async () => { saves++; });
  assert.equal(ref.presetId, '10000000-0000-4000-8000-000000000001'); assert.equal(nativeCalls, 1); assert.equal(saves, 1);
});

for (const hostName of ['SillyTavern', 'Luker']) test(`API IDs use the ${hostName} uuidv4 method with its context when native randomUUID is absent`, async t => {
  let calls = 0;
  const context = { uuidv4() { assert.equal(this, context); calls++; return '20000000-0000-4000-9000-000000000002'; } };
  globals(t, { crypto: {}, SillyTavern: undefined, Luker: undefined, [hostName]: { getContext: () => context } });
  const settings = {};
  const ref = await saveManualPreset(settings, draft, async () => {});
  assert.equal(ref.presetId, '20000000-0000-4000-9000-000000000002'); assert.equal(calls, 1);
});

test('newly exported bootstrap executes independently without crypto or a host helper and carries the author preset', async t => {
  globals(t, { crypto: undefined, SillyTavern: undefined, Luker: undefined });
  const authoring = createAuthoringService({ store: { read: () => ({ contacts: [{ id: 'lin', name: '林舟' }], groups: [] }) }, host: { readSettings: () => ({}), captureChat: () => ({ character: { name: '合成角色' } }) } });
  const first = await authoring.exportScript(), second = await authoring.exportScript();
  assert.match(first.script.id, uuid4); assert.match(second.script.id, uuid4); assert.notEqual(first.script.id, second.script.id);
  const nodes = [];
  const document = { createElement: () => ({}), head: { append: node => nodes.push(node) } };
  const window = { parent: { document } };
  for (const { script } of [first, second]) runInNewContext(script.content, { window, getVariables: () => script.data });
  assert.equal(nodes.length, 2); assert.equal(nodes[0].preset.contacts[0].name, '林舟'); assert.equal(nodes[0].owner, window);
  for (const node of nodes) assert.match(node.id, /^tmt-card-loader-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(nodes[0].id, nodes[1].id); assert.ok(nodes[0].textContent.includes(nodes[0].id));
});
