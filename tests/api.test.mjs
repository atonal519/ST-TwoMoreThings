import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppearanceSettings } from '../src/appearance.js';
import { createApiSettings, createModelClient, parsePayload } from '../src/api.js';
import { createHarness } from './harness.mjs';
import { BASE_PROCESSING_PROMPT } from '../src/shared-processing-prompt.js';

for (const hostKind of ['native','luker']) test(`${hostKind}: changing shared preset adopts its default model in the same local save and actual request`, async () => {
  const presets=[{id:'a',url:'https://a.invalid/v1',key:'a-key',model:'a-default'},{id:'b',url:'https://b.invalid/v1',key:'b-key',model:'b-default'},{id:'empty',url:'https://empty.invalid/v1',key:'empty-key',model:''}];
  const settings={pocketPhone:{apiSourceRef:{kind:'shared-preset',presetId:'a'},apiModel:'a-custom',fabShow:false},'schedule-planner':{apiPresets:presets}};
  const h=createHarness({hostKind,settings}),api=createApiSettings({host:h.host}),client=createModelClient({host:h.host,sourceProvider:api});
  const shared=structuredClone(presets);
  await api.select({kind:'shared-preset',presetId:'b'});
  assert.equal(h.settingsSaves,1);assert.equal(api.readDraft().model,'b-default');assert.equal(settings.pocketPhone.fabShow,false);
  await client.complete({system:'test',messages:[]});
  assert.deepEqual([h.modelRequests[0].body.reverse_proxy,h.modelRequests[0].body.proxy_password,h.modelRequests[0].body.model],['https://b.invalid/v1','b-key','b-default']);
  const draft=api.readDraft();draft.model='unsaved';
  await client.complete({system:'test',messages:[]});assert.equal(h.modelRequests[1].body.model,'b-default');
  await api.saveModel('b-custom');await api.select({kind:'shared-preset',presetId:'b'});
  assert.equal(createApiSettings({host:h.host}).readDraft().model,'b-custom');
  await client.complete({system:'test',messages:[]});assert.equal(h.modelRequests[2].body.model,'b-custom');
  await api.select({kind:'shared-preset',presetId:'empty'});
  assert.equal(api.readDraft().model,'');assert.throws(api.resolve,/填写模型/);
  assert.deepEqual(presets,shared);
  await api.saveManual({url:'https://manual.invalid/v1',key:'manual-key',model:'manual-custom'});
  assert.equal(api.resolve().model,'manual-custom');assert.equal(api.resolve().url,'https://manual.invalid/v1');
});

test('reselecting the same explicit or inherited embedded preset keeps the saved custom model', async () => {
  const settings={pocketPhone:{apiSourceRef:{kind:'shared-preset',presetId:'only'},apiModel:'implicit-custom'},twoMoreThingsEmbedded:{apiModel:'embedded-custom'},'schedule-planner':{apiPresets:[{id:'only',url:'https://only.invalid/v1',key:'key',model:'default'}]}};
  const h=createHarness({settings}),ref={kind:'shared-preset',presetId:'only'},api=createApiSettings({host:h.host});
  await api.select(ref);assert.equal(api.readDraft().model,'implicit-custom');
  const embedded=createApiSettings({host:{...h.host,phoneSettingsKey:'twoMoreThingsEmbedded'}});
  await embedded.select(ref);assert.equal(embedded.readDraft().model,'embedded-custom');
});

test('manual model discovery needs only URL and key, normalizes the list, and does not save settings', async () => {
  const h = createHarness({ completion: { data: [{ id: 'z-model' }, { id: 'a-model' }, 'z-model', null] } });
  const api = createApiSettings({ host: h.host });
  const models = await api.fetchModels({ url: 'https://example.invalid/v1/chat/completions', key: 'test-key' });
  assert.deepEqual(models, ['a-model', 'z-model']);
  assert.equal(h.modelRequests[0].path, '/api/backends/chat-completions/status');
  assert.equal(h.modelRequests[0].body.reverse_proxy, 'https://example.invalid/v1');
  assert.equal(h.modelRequests[0].body.proxy_password, 'test-key');
  assert.equal(h.settingsSaves, 0);
});

test('choosing an API source preserves floating and QR preferences', async () => {
  const h = createHarness({ settings: { pocketPhone: { fabShow: false, qrShow: true }, 'schedule-planner': { apiPresets: [{ id: 'test', url: 'https://example.invalid', key: 'test', model: 'm' }] } } });
  await createApiSettings({ host: h.host }).select({ kind: 'shared-preset', presetId: 'test' });
  assert.deepEqual(h.context.extensionSettings.pocketPhone, { fabShow: false, qrShow: true, apiSourceRef: { kind: 'shared-preset', presetId: 'test' }, apiModel: 'm' });
});

test('model discovery reports an empty list and request errors without reflecting credentials', async () => {
  const h = createHarness({ completion: { models: [] } });
  const api = createApiSettings({ host: h.host });
  await assert.rejects(api.fetchModels({ url: 'https://example.invalid', key: 'private-key' }), /没有返回可用模型/);
  await assert.rejects(api.fetchModels({ url: '', key: '' }), /接口地址和密钥/);
  h.host.request = async () => Response.json({ error: 'private-key' }, { status: 401 });
  await assert.rejects(api.fetchModels({ url: 'https://example.invalid', key: 'private-key' }), error => error.message.includes('401') && !error.message.includes('private-key'));
});

test('reads the selected shared source fresh without changing other plugins', async () => {
  const settings = { pocketPhone: { apiSourceRef: { kind: 'shared-preset', presetId: 'p' } }, qianqianjie: { apiMode: 'seven-preset', selectedSevenDaysPresetId: 'p' }, 'schedule-planner': { apiPresetActiveId: 'other', apiPresets: [{ id: 'p', name: '日常', url: 'https://example.invalid/v1', key: 'test-key', model: 'first', qqjTemperature: 0.3 }] } };
  const h = createHarness({ settings });
  const api = createApiSettings({ host: h.host });
  const client = createModelClient({ host: h.host, sourceProvider: api });
  assert.equal(h.settingsSaves, 0);
  await client.complete({ system: '只回复短信。', messages: [{ role: 'user', content: '你好' }] });
  settings['schedule-planner'].apiPresets[0].model = 'second';
  await client.complete({ system: '只回复短信。', messages: [] });
  assert.deepEqual(h.modelRequests.map(x => x.body.model), ['first', 'second']);
  assert.equal(h.modelRequests[0].path, '/api/backends/chat-completions/generate');
  assert.equal(h.modelRequests[0].body.reverse_proxy, 'https://example.invalid/v1');
  assert.equal(h.modelRequests[0].body.proxy_password, 'test-key');
  assert.equal(h.modelRequests[0].headers['X-CSRF-Token'], 'test-csrf');
  assert.equal(settings['schedule-planner'].apiPresetActiveId, 'other');
  assert.equal(settings['schedule-planner'].apiPresets[0].qqjTemperature, 0.3);
});

test('every actual request uses the latest shared prompt, preserving custom text and resolving blank to the built-in default', async () => {
  const settings = { pocketPhone: { apiSourceRef: { kind: 'shared-preset', presetId: 'test' } }, qianqianjie: { apiUrl: 'https://example.invalid', apiKey: 'test', apiModel: 'm', processingPrompt: '旧自定义不应回灌' }, 'schedule-planner': { apiPresets: [{ id: 'test', url: 'https://example.invalid', key: 'test', model: 'm' }], processingPrompt: '  自定义前缀\n保持原文  ' } };
  const h = createHarness({ settings }), client = createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) });
  await client.complete({ system: '任务', messages: [] });
  settings['schedule-planner'].processingPrompt = ' \n ';
  await client.complete({ system: '任务', messages: [] });
  settings['schedule-planner'].processingPrompt = '第二份自定义';
  await client.complete({ system: '任务', messages: [] });
  assert.deepEqual(h.modelRequests.map(row => row.body.messages[0].content), ['  自定义前缀\n保持原文  \n\n任务', `${BASE_PROCESSING_PROMPT}\n\n任务`, '第二份自定义\n\n任务']);
  assert.equal(h.modelRequests.length, 3);
  assert.equal(h.settingsSaves, 0);
});

test('manual setup adds a shared connection and stores its reference plus the local model', async () => {
  const h = createHarness({ settings: { 'schedule-planner': { apiPresetActiveId: 'old', apiPresets: [{ id: 'old', unknown: { keep: true } }] } } });
  const api = createApiSettings({ host: h.host });
  await api.saveManual({ url: 'https://example.invalid/v1/chat/completions', key: 'test-key', model: 'chosen' });
  assert.equal(api.resolve().url, 'https://example.invalid/v1');
  assert.equal(h.context.extensionSettings['schedule-planner'].apiPresets.length, 2);
  assert.deepEqual(h.context.extensionSettings['schedule-planner'].apiPresets[0], { id: 'old', unknown: { keep: true } });
  assert.deepEqual(Object.keys(h.context.extensionSettings.pocketPhone), ['apiSourceRef', 'apiModel']);
  assert.equal(h.context.extensionSettings['schedule-planner'].apiPresetActiveId, 'old');
});

test('does not silently change an explicitly missing source or choose among several presets', () => {
  const h = createHarness({ settings: { pocketPhone: { apiSourceRef: { kind: 'shared-preset', presetId: 'gone' } }, 'schedule-planner': { apiUrl: 'https://example.invalid', apiKey: 'key', apiModel: 'm' } } });
  assert.throws(() => createApiSettings({ host: h.host }).resolve(), /选择|补全/);
  delete h.context.extensionSettings.pocketPhone;
  h.context.extensionSettings['schedule-planner'] = { apiPresets: [{ id: 'a' }, { id: 'b' }] };
  assert.equal(createApiSettings({ host: h.host }).getSelected(), null);
});

test('extracts formal answers and keeps valid parts without inventing attribution', () => {
  assert.deepEqual(parsePayload('说明\n```json\n{"data":{"replies":[{"content":"你好"},{"role":"user","text":"不要代写"},{}]}}\n```', 'messages'), [{ text: '你好。' }]);
  const posts = parsePayload('{"posts":[{"title":"散步","author":"路人甲","content":"晚风很好","replies":[{"author":"路人乙","content":"同感"}]},{"title":"无作者","content":"不猜作者"}]}', 'forum');
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].comments, [{ author: '路人乙', text: '同感。' }]);
  assert.throws(() => parsePayload('只有一段无法归属的正文', 'forum'), /没有|无法/);
});

test('reports request failure without reflecting provider credentials into the UI', async () => {
  const h = createHarness({ settings: { pocketPhone: { apiSourceRef: { kind: 'shared-preset', presetId: 'test' } }, 'schedule-planner': { apiPresets: [{ id: 'test', url: 'https://example.invalid', key: 'test-secret', model: 'm' }] } } });
  h.host.request = async () => Response.json({ error: 'Bearer test-secret https://example.invalid' }, { status: 401 });
  const client = createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) });
  await assert.rejects(client.complete({ system: 'test', messages: [] }), error => /401/.test(error.message) && !/test-secret|example.invalid/.test(error.message));
});

test('text connections list only shared presets and keep old follow references explicit until the user selects a source', () => {
  const h = createHarness({ settings: { qianqianjie: { apiUrl: 'https://qqj.invalid', apiKey: 'q', apiModel: 'q' }, 'schedule-planner': { apiUrl: 'https://g.invalid', apiKey: 'g', apiModel: 'g', apiPresets: [{ id: 'p', name: '共享', url: 'https://shared.invalid', key: 'key', model: 'shared-model' }] }, pocketPhone: { apiSourceRef: { kind: 'qqj-current' } } } });
  const api = createApiSettings({ host: h.host }); assert.deepEqual(api.listSources().map(item => item.ref), [{ kind: 'shared-preset', presetId: 'p' }]); assert.deepEqual(api.getSelected(), { kind: 'qqj-current' }); assert.throws(api.resolve, /选择|连接/); assert.equal(h.settingsSaves, 0);
});

test('saved local model overrides the shared model while shared URL and key are read fresh for each request', async () => {
  const settings = { pocketPhone: { apiSourceRef: { kind: 'shared-preset', presetId: 'p' }, apiModel: 'own-model' }, 'schedule-planner': { apiPresets: [{ id: 'p', url: 'https://first.invalid', key: 'first-key', model: '' }] } };
  const h = createHarness({ settings }), api = createApiSettings({ host: h.host }), client = createModelClient({ host: h.host, sourceProvider: api });
  await client.complete({ system: 'test', messages: [] }); settings['schedule-planner'].apiPresets[0] = { id: 'p', url: 'https://second.invalid', key: 'second-key', model: 'changed-shared-model' }; await client.complete({ system: 'test', messages: [] });
  assert.deepEqual(h.modelRequests.map(row => [row.body.model, row.body.reverse_proxy, row.body.proxy_password]), [['own-model', 'https://first.invalid/v1', 'first-key'], ['own-model', 'https://second.invalid/v1', 'second-key']]); assert.equal(h.settingsSaves, 0);
});

test('draft fill and model-list selection do not save until the local model is explicitly saved', async () => {
  const h = createHarness({ settings: { pocketPhone: { fabShow: false }, 'schedule-planner': { apiPresets: [{ id: 'p', url: 'https://shared.invalid', key: 'secret', model: 'shared-default' }, { id: 'p2', url: 'https://other.invalid', key: 'other', model: 'other-default' }] } } });
  const api = createApiSettings({ host: h.host }); await api.select({ kind: 'shared-preset', presetId: 'p' }); const poolBefore = structuredClone(h.context.extensionSettings['schedule-planner']);
  assert.equal(typeof api.readDraft, 'function'); const draft = api.readDraft(); assert.deepEqual(draft, { url: 'https://shared.invalid/v1', key: '', model: 'shared-default' }); draft.model = 'not-saved'; assert.equal(api.resolve().model, 'shared-default');
  assert.equal(typeof api.saveModel, 'function'); await api.saveModel(draft.model); assert.equal(api.resolve().model, 'not-saved'); await api.select({ kind: 'shared-preset', presetId: 'p2' }); assert.equal(api.readDraft().model, 'other-default'); assert.equal(api.resolve().model, 'other-default');
  await assert.rejects(api.saveModel('   '), /模型/); assert.equal(api.resolve().model, 'other-default'); assert.deepEqual(h.context.extensionSettings['schedule-planner'], poolBefore); assert.equal(h.context.extensionSettings.pocketPhone.fabShow, false);
});

test('a blank shared model still permits model discovery using the selected live URL and key', async () => {
  const h = createHarness({ settings: { pocketPhone: { apiSourceRef: { kind: 'shared-preset', presetId: 'p' } }, 'schedule-planner': { apiPresets: [{ id: 'p', url: 'https://shared.invalid', key: 'key', model: '' }] } }, completion: { data: [{ id: 'available' }] } }); const api = createApiSettings({ host: h.host });
  assert.equal(typeof api.readDraft, 'function'); assert.equal(api.readDraft().model, ''); assert.throws(api.resolve, /模型|补全/);
  assert.deepEqual(await api.fetchModels(api.readDraft(), api.getSelected()), ['available']); assert.equal(h.modelRequests[0].body.reverse_proxy, 'https://shared.invalid/v1'); assert.equal(h.modelRequests[0].body.proxy_password, 'key'); assert.equal(h.settingsSaves, 0);
});

for (const settingsKey of ['pocketPhone', 'twoMoreThingsEmbedded']) test(`shared rename preserves latest fields and all independent phone settings (${settingsKey})`, async () => {
  const settings = { pocketPhone: { apiSourceRef: { kind: 'shared-preset', presetId: 'p' }, apiModel: 'native-own', qrShow: false }, twoMoreThingsEmbedded: { apiSourceRef: { kind: 'shared-preset', presetId: 'p' }, apiModel: 'embedded-own' }, 'schedule-planner': { apiPresetActiveId: 'p', utilityPresetId: 'p', other: true, apiPresets: [{ id: 'p', name: '旧名', url: 'https://saved.invalid', key: 'saved', model: 'shared-default', excludeParams: ['seed'], timeoutSec: 70, stream: true, extra: { stable: true } }] } };
  const h = createHarness({ settings }), api = createApiSettings({ host: { ...h.host, phoneSettingsKey: settingsKey } });
  assert.equal(typeof api.renamePreset, 'function');
  const draft = api.readDraft(); draft.url = '非法但未保存地址'; draft.key = 'unsaved'; draft.model = 'unsaved';
  await assert.rejects(api.renamePreset({ kind: 'shared-preset', presetId: 'p' }, ' '), /名称/); assert.equal(h.settingsSaves, 0);
  settings['schedule-planner'].apiPresets[0] = { ...settings['schedule-planner'].apiPresets[0], key: 'late-key', lateField: { keep: 2 } };
  const before = structuredClone(settings);
  await api.renamePreset({ kind: 'shared-preset', presetId: 'p' }, ' 新名称 ');
  before['schedule-planner'].apiPresets[0].name = '新名称';
  assert.deepEqual(settings, before); assert.equal(h.settingsSaves, 1); assert.equal(h.modelRequests.length, 0);
  assert.equal(api.listSources()[0].label, '新名称'); assert.equal(draft.model, 'unsaved');
  settings['schedule-planner'].apiPresets = [];
  await assert.rejects(api.renamePreset({ kind: 'shared-preset', presetId: 'p' }, '不可复活'), /不存在/);
  assert.deepEqual(settings['schedule-planner'].apiPresets, []); assert.equal(h.settingsSaves, 1);
});

test('failed shared rename restores its own pool edit without touching phone preferences', async () => {
  const settings = { pocketPhone: { apiModel: 'own' }, 'schedule-planner': { apiPresets: [{ id: 'p', name: '旧名', url: 'https://saved.invalid', model: 'saved', key: 'saved' }] } };
  const before = structuredClone(settings), api = createApiSettings({ host: { readSettings: () => settings, saveSettings: async () => { throw Error('offline'); } } });
  await assert.rejects(api.renamePreset({ kind: 'shared-preset', presetId: 'p' }, '新名'), /重命名.*失败/);
  assert.deepEqual(settings, before);
});

test('overview editing is enabled only for a live selected shared connection', async () => {
 const {renderSettings}=await import('../src/ui/settings.js');
 const source={ref:{kind:'shared-preset',presetId:'p'},label:'连接'};
 const render=selected=>renderSettings({theme:'day'},{ui:{drawers:{connection:true}},busy:new Set(),apiSettings:{listSources:()=>[source],getSelected:()=>selected},entries:{read:()=>({})},appearance:createAppearanceSettings({host:{readSettings:()=>({})}}),control:{isEnabled:()=>true},mode:'plugin'});
 assert.doesNotMatch(render(source.ref).match(/<button[^>]*data-action="api-edit"[^>]*>/u)[0],/disabled/);
 for(const selected of [null,{kind:'shared-preset',presetId:'gone'}]) assert.match(render(selected).match(/<button[^>]*data-action="api-edit"[^>]*>/u)[0],/disabled/);
});

test('API overview exposes only source/edit and one global add, keeping connection fields inside the modal',async()=>{
 const {renderSettings}=await import('../src/ui/settings.js');const source={ref:{kind:'shared-preset',presetId:'p'},label:'连接'};
 const ui={manual:false,apiDraft:{url:'https://draft.invalid',key:'draft',model:'draft'},models:[],modelSearch:'',sourcesOpen:false,drawers:{connection:true},defaultUser:'我'};
 const html=renderSettings({theme:'day'},{ui,busy:new Set(),apiSettings:{listSources:()=>[source],getSelected:()=>source.ref},entries:{read:()=>({})},appearance:createAppearanceSettings({host:{readSettings:()=>({})}}),control:{isEnabled:()=>true},mode:'plugin'});
 assert.match(html,/data-action="api-edit"/);assert.equal((html.match(/data-action="api-new"/g)||[]).length,1);assert.doesNotMatch(html,/id="api-(?:url|key|model)"/);assert.doesNotMatch(html,/data-action="api-(?:rename|save-as|delete)"/);
});
