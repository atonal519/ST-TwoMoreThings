import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { readTimeline } from '../src/timeline.js';

async function setup(reply, hostKind = 'native') {
  const h = createHarness({ hostKind, messages: [{ is_user: false, mes: '<!-- QQJ-end | date=2026年10月4日 | weekday=周日 | time=22:15 -->' }], settings: { pocketPhone:{apiSourceRef:{kind:'shared-preset',presetId:'test'}}, 'schedule-planner': { apiPresets: [{ id: 'test', url: 'https://example.invalid/v1', key: 'test', model: 'm' }] } }, completion: { choices: [{ message: { content: JSON.stringify(reply) } }] } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'lin', name: '林舟', expression: '短句不用句号' }, { id: 'zhou', name: '周予', expression: '熟人间调侃', language: '日语，附中文译文' }, { id: 'xu', name: '许知' }]);
  assert.equal(typeof store.saveGroup, 'function', '应能保存当前聊天内的群聊');
  const { createGroupService } = await import('../src/groups.js');
  const { createContextReader } = await import('../src/context.js');
  const { createApiSettings, createModelClient } = await import('../src/api.js');
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  const service = createGroupService({ target, store, contextReader: reader, modelClient: createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) }) });
  return { h, store, service };
}

for (const kind of ['native', 'luker']) test(`${kind}: observer group generates several speakers in one request and preserves identity/time`, async () => {
  const { h, store, service } = await setup({ anchor: { memberIds: ['lin', 'zhou', 'xu'], speakerIds: ['lin', 'zhou'] }, messages: [{ speakerId: 'lin', text: '周予，你到哪了？' }, { speakerId: 'zhou', text: '向かってる。', translation: '在路上。' }, { speakerId: 'lin', text: '👌' }] }, kind);
  const group = await store.saveGroup('', { name: '晚饭', avatar: 'https://example.invalid/group.png', memberIds: ['lin', 'zhou', 'xu'], userIsMember: false });
  assert.equal(store.read().groups[0].avatar, 'https://example.invalid/group.png');
  await assert.rejects(service.send(group.id, '旁观者不能代发'), /不在这个群/);
  const before = h.metadataSaves;
  await service.continueChat(group.id);
  assert.equal(h.modelRequests.length, 1);
  assert.ok(h.modelRequests[0].body.messages[0].content.includes('无需等用户索要'));
  assert.ok(h.modelRequests[0].body.messages[0].content.includes('两者均省略译文字段'));
  assert.match(h.modelRequests[0].body.messages[0].content, /标准汉语和纯符号省略translation/);
  assert.equal(h.metadataSaves, before + 1);
  const history = store.read().conversations[group.id];
  assert.deepEqual(history.map(x => x.speakerId), ['lin', 'zhou', 'lin']);
  assert.deepEqual(history.map(x => x.text), ['周予，你到哪了？', '向かってる。', '👌']);
  assert.equal(history[1].translation, '在路上。');
  assert.equal('translation' in history[0], false);
  assert.equal('translation' in history[2], false);
  assert.equal(history[0].timeLabel, '22:15');
  assert.ok(Date.parse(history[0].createdAt));
  const input = JSON.parse(h.modelRequests[0].body.messages[1].content);
  assert.equal(JSON.stringify(input).includes('https://example.invalid/group.png'), false, '群头像仅用于显示，不送模型');
  assert.deepEqual(input.group.members.map(x => x.id), ['lin', 'zhou', 'xu']);
  assert.equal(input.group.members[0].expression, '短句不用句号');
  assert.equal(input.group.members[1].language, '日语，附中文译文');
  assert.equal(store.read().contacts.find(person => person.id === 'zhou').language, '日语，附中文译文');
  await store.deleteMessage(group.id, history[0].id);
  assert.equal(store.read().conversations[group.id].length, 2);
  await store.clearConversation(group.id, readTimeline(h.context.chat));
  assert.deepEqual(store.read().conversations[group.id], []);
});

test('group avatar can be edited and removed without altering its members or messages', async () => {
  const { h, store } = await setup({});
  const group = await store.saveGroup('', { name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: true });
  await store.appendMessage(group.id, { id: 'hello', role: 'user', text: '到了' });
  const edited = await store.saveGroup(group.id, { ...group, avatar: 'https://example.invalid/friends.png' });
  assert.equal(edited.avatar, 'https://example.invalid/friends.png');
  const before = h.metadataSaves;
  await assert.rejects(store.saveGroup(group.id, { ...edited, avatar: 'javascript:alert(1)' }), /头像地址/);
  assert.equal(h.metadataSaves, before);
  assert.equal(store.read().groups[0].avatar, edited.avatar);
  await store.saveGroup(group.id, { ...edited, avatar: '' });
  assert.equal(store.read().groups[0].avatar, '');
  assert.deepEqual(store.read().groups[0].memberIds, ['lin', 'zhou']);
  assert.equal(store.read().conversations[group.id][0].text, '到了');
});

test('group permits silence, rejects unanchored outsiders, and does not save rejected messages', async () => {
  const { h, store, service } = await setup({ anchor: { memberIds: ['lin', 'zhou'], speakerIds: [] }, messages: [] });
  const group = await store.saveGroup('', { name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: false });
  assert.deepEqual(await service.continueChat(group.id), []);
  h.completion = { choices: [{ message: { content: JSON.stringify({ anchor: { memberIds: ['lin', 'zhou'], speakerIds: ['xu'] }, messages: [{ speakerId: 'xu', text: '不属于此群' }] }) } }] };
  await assert.rejects(service.continueChat(group.id), /群成员|发言者/);
  assert.equal(store.read().conversations[group.id]?.length || 0, 0);
});


for (const hostKind of ['native', 'luker']) test(`${hostKind}: group split translations retain speakers and voice while saving in one request`, async () => {
  const { h, store, service } = await setup({ anchor: { memberIds: ['lin', 'zhou'], speakerIds: ['lin', 'zhou'] }, messages: [
    { speakerId: 'lin', text: '听日见。' }, { translation: '明天见。' },
    { speakerId: 'zhou', type: 'voice', text: '行先喇。' }, { translatedText: '先走了。' },
    { speakerId: 'lin', text: '收到。' }, { speakerId: 'zhou', text: '👌' },
  ] }, hostKind);
  const group = await store.saveGroup('', { name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: false }); const before = h.metadataSaves;
  await service.continueChat(group.id);
  const system = h.modelRequests[0].body.messages[0].content;
  const shape = JSON.parse(system.match(/只输出JSON：(\{"anchor":.*?\})。messages每轮/)[1]); assert.ok(shape.messages[0].translation); assert.match(system, /translation与text放在同一条message对象内/);
  const rows = store.read().conversations[group.id]; assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(row => row.speakerId), ['lin', 'zhou', 'lin', 'zhou']); assert.deepEqual(rows.map(row => row.translation), ['明天见。', '先走了。', undefined, undefined]); assert.equal(rows[1].type, 'voice');
  const cold = createPhoneStore({ target: h.host.captureChat() }); assert.deepEqual(cold.read().conversations[group.id], rows);
  const { renderChat } = await import('../src/ui/messages.js');
  const html = renderChat(cold.read(), { ui: { view: 'group-chat', groupId: group.id, batch: rows[0].batch, visibleMessages: 60, drafts: new Map(), expandedVoices: { has: () => true } }, busy: new Set() });
  assert.equal((html.match(/class="message-translation"/g) || []).length, 2);
  assert.equal(h.modelRequests.length, 1); assert.equal(h.metadataSaves, before + 1); assert.equal(h.settingsSaves, 0);
});

test('group translation placeholders do not mask invalid message or speaker entries', async () => {
  const { h, store, service } = await setup({ anchor: { memberIds: ['lin', 'zhou'], speakerIds: ['lin'] }, messages: [
    { translation: '开头孤立' }, { speakerId: 'lin', text: '听日见。', translation: '原译文' }, { translation: '不覆盖' }, { translation: '不回找' },
  ] });
  const group = await store.saveGroup('', { name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: false });
  await service.continueChat(group.id); assert.equal(store.read().conversations[group.id].length, 1); assert.equal(store.read().conversations[group.id][0].translation, '原译文');
  const before = h.metadataSaves;
  for (const invalid of [null, { translation: '另一身份', speakerId: 'outsider' }]) {
    h.completion = { choices: [{ message: { content: JSON.stringify({ anchor: { memberIds: ['lin', 'zhou'], speakerIds: ['lin'] }, messages: [{ speakerId: 'lin', text: '听日见。' }, invalid] }) } }] };
    await assert.rejects(service.continueChat(group.id), /发言者/); assert.equal(h.metadataSaves, before); assert.equal(store.read().conversations[group.id].length, 1);
  }
});
