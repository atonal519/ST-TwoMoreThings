import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader, createBackflowService } from '../src/context.js';
import { createInspectPhoneService, inspectionOwners, inspectionThreads } from '../src/inspect-phone.js';
import { readPhoneContext } from '../src/phone-context.js';
import { createAuthoringService } from '../src/authoring.js';
import { readTimeline } from '../src/timeline.js';

function fixture() {
  const h = createHarness({ messages: [{ mes: '正文完整材料。', is_user: false }], metadata: { pocketPhone: {
    contacts: [{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }, { id: 'mine', name: '本人别号', identityOwnerId: '@user' }],
    groups: [], conversations: { lin: [{ id: 'real', role: 'user', text: '真实用户短信。', read: false }, { id: 'real2', role: 'assistant', text: '真实角色短信。', read: false }] }, forum: { posts: [] }, injectEnabled: true,
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  const requests = []; let answer = { conversations: [{ key: 'a', name: '周予', participantIds: ['@owner', 'zhou'], messages: [{ speakerId: '@owner', text: 'PRIVATE_SENTINEL。' }, { speakerId: 'zhou', text: 'Hello.', translation: '你好。' }] }] };
  const service = createInspectPhoneService({ target, store, contextReader: reader, modelClient: { complete: async request => { requests.push(request); if (answer instanceof Error) throw answer; return JSON.stringify(answer); } } });
  return { h, target, store, reader, requests, service, setAnswer: value => { answer = value; } };
}

test('opening owners and live user mirror is read only and uses exact IDs', () => {
  const { store, target, h } = fixture(), before = structuredClone(store.read());
  const owners = inspectionOwners(store.read(), target.character);
  assert.deepEqual(owners.map(person => person.id), ['lin', 'zhou']); assert.ok(!owners.some(p => p.id === 'mine'));
  const thread = inspectionThreads(store.read(), 'lin', target.user)[0];
  assert.equal(thread.id, '@user'); assert.equal(thread.mirror, true);
  assert.deepEqual(thread.messages.map(m => m.speakerId), ['@user', '@owner']);
  assert.equal(inspectionThreads(store.read(), 'card:林舟.png', target.user).length, 0);
  assert.deepEqual(store.read(), before); assert.equal(h.metadataSaves, 0);
});

test('one refresh appends all usable returned messages, continuation carries full history, delete only private records', async () => {
  const f = fixture(), real = structuredClone(f.store.read().conversations);
  await f.service.refresh('lin'); assert.equal(f.requests.length, 1); assert.equal(f.h.metadataSaves, 1);
  let saved = f.store.read().inspectPhone.owners.lin;
  assert.equal(saved.conversations[0].messages.length, 2);
  const threadId = saved.conversations[0].id;
  f.setAnswer({ conversations: [{ id: threadId, participantIds: ['@owner', 'zhou'], messages: [{ speakerId: 'zhou', text: '下一条。' }] }] });
  await f.service.refresh('lin');
  assert.match(f.requests[1].messages[0].content, /PRIVATE_SENTINEL/);
  saved = f.store.read().inspectPhone.owners.lin;
  assert.equal(saved.conversations[0].messages.length, 3); assert.equal(Object.hasOwn(saved, 'count'), false);
  await f.store.deleteInspectionMessage('lin', threadId, saved.conversations[0].messages[0].id);
  assert.equal(f.store.read().inspectPhone.owners.lin.conversations[0].messages.length, 2);
  await f.store.deleteInspectionMessage('lin', '@user', 'real');
  assert.deepEqual(f.store.read().conversations, real); assert.equal(f.requests.length, 2);
});

test('user speakers, user aliases and user-containing synthetic threads never save', async () => {
  for (const participant of ['@user', 'mine']) {
    const f = fixture(); f.setAnswer({ conversations: [{ participantIds: ['@owner', participant], messages: [{ speakerId: participant, text: '捏造。' }] }] });
    await assert.rejects(f.service.refresh('lin')); assert.equal(f.h.metadataSaves, 0);
  }
  const f = fixture(); f.setAnswer({ people: [{ id: 'fake', name: '我' }], conversations: [{ participantIds: ['@owner', 'fake'], messages: [{ speakerId: 'fake', text: '捏造。' }] }] });
  await assert.rejects(f.service.refresh('lin')); assert.equal(f.h.metadataSaves, 0);
});

test('natural generation ignores legacy counts, sends no target and saves every valid message', async () => {
  const f = fixture();
  f.store.read().inspectPhone = { owners: { lin: { people: [], conversations: [], count: 1 } } };
  const before = structuredClone(f.store.read());
  const { renderInspection } = await import('../src/ui/inspect-phone.js');
  const html = renderInspection(f.store.read(), { ui: { view: 'inspect-wechat', inspectOwnerId: 'lin' }, busy: new Set(), inspectPhone: f.service });
  assert.equal(html.includes('inspect-count'), false); assert.equal(html.includes('生成条数'), false);
  assert.deepEqual(f.store.read(), before); assert.equal(f.h.metadataSaves, 0);
  f.setAnswer({ conversations: [{ participantIds: ['@owner', 'zhou'], messages: Array.from({ length: 32 }, (_, index) => ({ speakerId: index % 2 ? '@owner' : 'zhou', text: `自然消息${index}。` })) }] });
  await f.service.refresh('lin');
  assert.equal(f.requests.length, 1); assert.equal(f.h.metadataSaves, 1);
  assert.equal(Object.hasOwn(JSON.parse(f.requests[0].messages[0].content), 'count'), false);
  assert.doesNotMatch(f.requests[0].system, /\bcount\b|目标.*条新消息|(?:20|二十)条/);
  assert.equal(f.store.read().inspectPhone.owners.lin.conversations[0].messages.length, 32);
  assert.equal(f.store.read().inspectPhone.owners.lin.count, 1);
});

test('private people remain private, independent stable owner IDs do not merge by name', async () => {
  const f = fixture(); f.setAnswer({ people: [{ id: 'new', name: '新朋友' }], conversations: [{ name: '小组', participantIds: ['@owner', 'zhou', 'new'], messages: [{ speakerId: 'new', text: 'PRIVATE_SENTINEL。' }] }] });
  await f.service.refresh('lin');
  assert.equal(f.store.read().contacts.length, 3); assert.equal(f.store.read().groups.length, 0);
  assert.equal(inspectionThreads(f.store.read(), 'zhou', '我').some(t => t.messages.some(m => m.text === 'PRIVATE_SENTINEL。')), false);
  assert.equal(f.store.read().inspectPhone.owners.lin.people[0].name, '新朋友');
});

test('failure preserves prior state and rollback uses existing captured store', async () => {
  const f = fixture(); await f.service.refresh('lin'); const before = structuredClone(f.store.read());
  f.setAnswer(new Error('模拟API失败')); await assert.rejects(f.service.refresh('lin'), /模拟API失败/); assert.deepEqual(f.store.read(), before);
  f.setAnswer({ conversations: [{ participantIds: ['@owner', 'zhou'], messages: [{ speakerId: 'zhou', text: '不落盘。' }] }] });
  f.h.saveFailure = new Error('模拟保存失败'); await assert.rejects(f.service.refresh('lin')); assert.deepEqual(f.store.read(), before);
});

test('inspection is a one-way domain across all ordinary context, backflow and preset outputs', async () => {
  const f = fixture(); await f.service.refresh('lin');
  const outputs = [readPhoneContext(f.store.read(), { targetIds: ['lin'], defaultUser: '我', anchor: { key: 'current' } }), await f.reader.readForContact('lin'), await f.reader.readForForum(), await f.reader.readForLiangshi({ includePhoneContext: true }), await f.reader.readForLiangshiHot(), await f.reader.readForLiangshiFollowing(), await f.reader.readForLiangshiDraft({ seed: '测试' }), await f.reader.readForSocial([{ ...f.store.read().contacts[0], kind: 'contact' }]), await f.reader.readDirectorySources(), await createBackflowService({ target: f.target, store: f.store, modelClient: { complete() { throw new Error('无需摘要'); } } }).prepare(), await createAuthoringService({ host: f.h.host, store: f.store, readEntries: () => ({}) }).exportScript({ coreUrl: 'https://example.invalid/embed.js' })];
  for (const output of outputs) assert.equal(JSON.stringify(output).includes('PRIVATE_SENTINEL'), false);
  assert.equal(f.store.read().notifications, undefined); assert.equal(f.store.read().favorites, undefined);
});

test('shared inbox and bubble renderers preserve phone styling with inspection-only actions', async () => {
  const { renderInspection } = await import('../src/ui/inspect-phone.js');
  const f = fixture(); await f.service.refresh('lin');
  const thread = f.store.read().inspectPhone.owners.lin.conversations[0];
  const ui = { view: 'inspect-chat', defaultUser: '我', inspectOwnerId: 'lin', inspectThreadId: thread.id, inspectSelectedMessage: thread.messages[0].id,
    batch: readTimeline(f.target.messages), visibleMessages: 60, visibleHistory: 60, historyOpen: false };
  const html = renderInspection(f.store.read(), { ui, busy: new Set(), inspectPhone: f.service });
  assert.match(html, /message-row is-mine/); assert.match(html, /bilingual-copy/); assert.match(html, /data-action="inspect-delete"/);
  for (const forbidden of ['data-action="send"', 'favorite-add', 'data-pat-target', 'data-action="delete-message"', 'data-action="photo"']) assert.equal(html.includes(forbidden), false);
  const mirror = renderInspection(f.store.read(), { ui: { ...ui, inspectThreadId: '@user', inspectSelectedMessage: 'real' }, busy: new Set(), inspectPhone: f.service });
  assert.equal(mirror.includes('inspect-delete'), false); assert.match(mirror, /已有短信/);
});

test('inspection folds old batches using exact story keys, keeps legacy and voice readable, and never clips continuation material', async () => {
  const { renderInspection } = await import('../src/ui/inspect-phone.js');
  const f = fixture(), current = { key: '[7]', label: '当前日期 · 主楼 #7' };
  const first = { key: '[2]', label: '旧日期 · 主楼 #99' }, second = { key: '[4]', label: '前一日 · 主楼 #98' };
  const messages = [
    { id: 'legacy', speakerId: 'zhou', role: 'assistant', type: 'voice', text: 'LEGACY_VOICE', translation: '早期语音。' },
    { id: 'old-a', speakerId: '@owner', role: 'user', text: 'OLD_A', batch: first },
    { id: 'old-b', speakerId: 'zhou', role: 'assistant', text: 'OLD_B', batch: first },
    { id: 'old-c', speakerId: 'zhou', role: 'assistant', text: 'OLD_C', batch: second },
    { id: 'now', speakerId: '@owner', role: 'user', text: 'CURRENT_ONLY', batch: current },
  ];
  f.store.read().inspectPhone = { owners: { lin: { people: [], conversations: [{ id: 'private', name: '周予', participantIds: ['@owner', 'zhou'], messages }] } } };
  const before = structuredClone(f.store.read()), history = (await f.reader.readForInspection('lin')).history;
  const ui = { view: 'inspect-chat', defaultUser: '我', inspectOwnerId: 'lin', inspectThreadId: 'private', inspectSelectedMessage: 'now', batch: current, historyOpen: false, visibleMessages: 60, visibleHistory: 60, expandedVoices: new Set() };
  const render = () => renderInspection(f.store.read(), { ui, busy: new Set(), inspectPhone: f.service });
  const collapsed = render();
  assert.equal(collapsed.includes('OLD_A'), false); assert.equal(collapsed.includes('LEGACY_VOICE'), false); assert.equal(collapsed.includes('CURRENT_ONLY'), true);
  assert.match(collapsed, /data-action="history" aria-expanded="false"/); assert.match(collapsed, /current-batch-label/); assert.match(collapsed, /data-action="inspect-delete"/);
  ui.historyOpen = true;
  ui.expandedVoices.add(JSON.stringify(['inspection', 'lin', 'private', 'legacy', 'legacy']));
  const opened = render();
  assert.equal((opened.match(/class="past-batch"/g) || []).length, 3);
  assert.equal((opened.match(/旧日期 · 主楼 #2/g) || []).length, 1); assert.match(opened, /前一日 · 主楼 #4/); assert.match(opened, /早期记录（未按楼分组）/);
  for (const text of ['OLD_A', 'OLD_B', 'OLD_C', 'CURRENT_ONLY', 'LEGACY_VOICE', '早期语音。']) assert.ok(opened.includes(text));
  assert.match(opened, /voice-transcript/); assert.doesNotMatch(opened, /delete-history|data-action="send"|favorite-add/);
  ui.historyOpen = false; assert.equal(render().includes('OLD_A'), false);
  assert.deepEqual(f.store.read(), before); assert.deepEqual((await f.reader.readForInspection('lin')).history, history);
  assert.equal(history.find(thread => thread.id === 'private').messages.length, 5);
  assert.equal(f.requests.length, 0); assert.equal(f.h.metadataSaves, 0); assert.equal(f.h.settingsSaves, 0);
});

test('inspection pages current and past records in sixty-message steps without truncating saved history', async () => {
  const { renderInspection } = await import('../src/ui/inspect-phone.js');
  const f = fixture(), current = { key: 'current', label: '当前' }, oldA = { key: 'old-a', label: '早一批' }, oldB = { key: 'old-b', label: '晚一批' };
  const rows = (prefix, count, batch) => Array.from({ length: count }, (_, index) => ({ id: `${prefix}_${index}`, speakerId: 'zhou', role: 'assistant', text: `${prefix}_${index}`, batch }));
  const messages = [{ id: 'legacy', speakerId: 'zhou', role: 'assistant', text: 'LEGACY' }, ...rows('PAST_A', 70, oldA), ...rows('PAST_B', 70, oldB), ...rows('CURRENT', 65, current)];
  f.store.read().inspectPhone = { owners: { lin: { people: [], conversations: [{ id: 'paged', name: '周予', participantIds: ['@owner', 'zhou'], messages }] } } };
  const ui = { view: 'inspect-chat', defaultUser: '我', inspectOwnerId: 'lin', inspectThreadId: 'paged', batch: current, historyOpen: false, visibleMessages: 60, visibleHistory: 60 };
  const render = () => renderInspection(f.store.read(), { ui, busy: new Set(), inspectPhone: f.service });
  const count = html => (html.match(/data-message-id=/g) || []).length;
  const initial = render(); assert.equal(count(initial), 60); assert.equal(initial.includes('data-message-id="CURRENT_4"'), false); assert.match(initial, /data-action="earlier"/);
  ui.historyOpen = true; let html = render(); assert.equal(count(html), 120); assert.match(html, /data-message-id="PAST_B_10"/); assert.equal(html.includes('data-message-id="PAST_A_69"'), false); assert.match(html, /data-action="earlier-history"/);
  ui.visibleHistory += 60; html = render(); assert.equal(count(html), 180); assert.match(html, /data-message-id="PAST_A_20"/); assert.equal(html.includes('data-message-id="PAST_A_19"'), false);
  ui.visibleHistory += 60; ui.visibleMessages += 60; html = render(); assert.equal(count(html), 206); assert.doesNotMatch(html, /data-action="earlier-history"|data-action="earlier"/); assert.match(html, /data-message-id="legacy"/);
  assert.equal(f.store.read().inspectPhone.owners.lin.conversations[0].messages.length, 206); assert.equal((await f.reader.readForInspection('lin')).history.find(t => t.id === 'paged').messages.length, 206);
  assert.equal(f.requests.length, 0); assert.equal(f.h.metadataSaves, 0);
});

test('real SMS mirror uses the same collapsed batch display without private deletion or read writes', async () => {
  const { renderInspection } = await import('../src/ui/inspect-phone.js');
  const f = fixture(), current = { key: 'now', label: '当前' }, old = { key: 'past', label: '过去' };
  f.store.read().conversations.lin = [{ id: 'old', role: 'assistant', type: 'voice', text: 'MIRROR_OLD', batch: old, read: false }, { id: 'new', role: 'user', text: 'MIRROR_CURRENT', batch: current }];
  const before = structuredClone(f.store.read());
  const ui = { view: 'inspect-chat', defaultUser: '我', inspectOwnerId: 'lin', inspectThreadId: '@user', inspectSelectedMessage: 'old', batch: current, visibleMessages: 60, visibleHistory: 60, historyOpen: false, expandedVoices: new Set() };
  const render = () => renderInspection(f.store.read(), { ui, busy: new Set(), inspectPhone: f.service });
  assert.equal(render().includes('MIRROR_OLD'), false); assert.match(render(), /MIRROR_CURRENT/);
  ui.historyOpen = true; ui.expandedVoices.add(JSON.stringify(['inspection', 'lin', '@user', 'past', 'old']));
  const html = render(); assert.match(html, /MIRROR_OLD/); assert.match(html, /past-batch/); assert.match(html, /voice-transcript/);
  assert.doesNotMatch(html, /inspect-delete|delete-history|data-action="send"|favorite-add/);
  assert.deepEqual(f.store.read(), before); assert.equal(f.h.metadataSaves, 0); assert.equal(f.requests.length, 0);
});

test('full private continuation and QQJ memory are read without clipping or new lookups', async () => {
  const f = fixture(); await f.service.refresh('lin');
  const domain = f.store.read().inspectPhone.owners.lin;
  const long = `完整私有记录${'长'.repeat(50000)}末尾锚点。`;
  await f.store.appendInspection('lin', { people: [], count: 20, conversations: [{ ...domain.conversations[0], messages: Array.from({ length: 150 }, (_, index) => ({ id: `full:${index}`, speakerId: '@owner', role: 'user', text: `${index}:${long}` })) }] });
  let reads = 0;
  const bridge = { getStatus: () => ({ status: 'ready' }), getPeopleSnapshot: () => ({ status: 'ready', people: { items: [{ entityId: 'lin-entity', displayName: '林舟' }] } }), readContext: async () => { reads++; return { status: 'ready', actors: [{ entityId: 'lin-entity', stateText: 'QQJ_CONTEXT_SENTINEL', memoryText: '完整记忆。' }] }; } };
  f.store.read().contacts[0].source = { kind: 'card' };
  const reader = createContextReader({ target: f.target, store: f.store, qqjBridgeProvider: () => bridge });
  const result = await reader.readForInspection('lin');
  assert.equal(result.history.find(item => item.id === domain.conversations[0].id).messages.length, 152);
  assert.equal(result.history.find(item => item.id === domain.conversations[0].id).messages.at(-1).text, `149:${long}`);
  assert.equal(result.related, 'QQJ_CONTEXT_SENTINEL\n完整记忆。'); assert.equal(reads, 1);
});

test('a delayed refresh saves only to its captured chat and owner', async () => {
  const f = fixture(); let resolve;
  const result = new Promise(done => { resolve = done; });
  const service = createInspectPhoneService({ target: f.target, store: f.store, contextReader: f.reader, modelClient: { complete: () => result } });
  const pending = service.refresh('lin');
  await new Promise(done => setTimeout(done, 0));
  const other = fixture();
  resolve(JSON.stringify({ conversations: [{ participantIds: ['@owner', 'zhou'], messages: [{ speakerId: 'zhou', text: '迟到的原聊天结果。' }] }] }));
  await pending;
  assert.equal(f.store.read().inspectPhone.owners.lin.conversations[0].messages[0].text, '迟到的原聊天结果。');
  assert.equal(other.store.read().inspectPhone, undefined);
});

test('private group inbox previews resolve the last speaker from the actual participant directory', async () => {
  const { renderInspection } = await import('../src/ui/inspect-phone.js');
  const f = fixture(); f.setAnswer({ people: [{ id: 'new', name: '顾宁' }], conversations: [{ name: '小组', participantIds: ['@owner', 'zhou', 'new'], messages: [{ speakerId: 'new', text: '群聊摘要。' }] }] });
  await f.service.refresh('lin');
  const html = renderInspection(f.store.read(), { ui: { view: 'inspect-wechat', defaultUser: '我', inspectOwnerId: 'lin' }, busy: new Set(), inspectPhone: f.service });
  assert.match(html, /顾宁：群聊摘要。/);
});

test('deleting a generated conversation retains private people and a delayed continuation cannot restore old messages', async () => {
  const f = fixture(); f.setAnswer({ people: [{ id: 'new', name: '顾宁' }], conversations: [{ name: '顾宁', participantIds: ['@owner', 'new'], messages: [{ speakerId: 'new', text: '删除的旧记录。' }] }] });
  await f.service.refresh('lin');
  const owner = f.store.read().inspectPhone.owners.lin, thread = owner.conversations[0];
  let resolve;
  const result = new Promise(done => { resolve = done; });
  const delayed = createInspectPhoneService({ target: f.target, store: f.store, contextReader: f.reader, modelClient: { complete: () => result } }).refresh('lin');
  await new Promise(done => setTimeout(done, 0));
  await f.store.deleteInspectionConversation('lin', thread.id);
  assert.equal(f.store.read().inspectPhone.owners.lin.conversations.length, 0);
  assert.deepEqual(f.store.read().inspectPhone.owners.lin.people, owner.people);
  const before = structuredClone(f.store.read().conversations);
  await f.store.deleteInspectionConversation('lin', '@user');
  assert.deepEqual(f.store.read().conversations, before);
  resolve(JSON.stringify({ conversations: [{ id: thread.id, messages: [{ speakerId: thread.participantIds[1], text: '迟到的新记录。' }] }] }));
  await delayed;
  const messages = f.store.read().inspectPhone.owners.lin.conversations[0].messages;
  assert.equal(messages.length, 1); assert.equal(messages[0].text, '迟到的新记录。');
});

test('invalid array rows do not discard other valid returned conversations and messages', async () => {
  const f = fixture(); f.setAnswer({ people: [null, 12, []], conversations: [null, 'bad', { name: '周予', participantIds: ['@owner', 'zhou'], messages: [null, false, [], { speakerId: 'zhou', text: '有效消息保留。' }] }] });
  await f.service.refresh('lin');
  assert.equal(f.store.read().inspectPhone.owners.lin.conversations[0].messages[0].text, '有效消息保留。');
});

test('inspection loading contains only its theme image, with a static frame for reduced motion', async () => {
  const { renderInspection, INSPECT_LOADING_DURATION_MS } = await import('../src/ui/inspect-phone.js');
  const f = fixture();
  const ui = { view: 'inspect-desktop', inspectLoading: true, inspectOwnerId: 'lin' };
  const regular = renderInspection(f.store.read(), { ui, busy: new Set(), inspectPhone: f.service });
  assert.equal(INSPECT_LOADING_DURATION_MS, 2160);
  assert.match(regular, /assets\/inspect-phone\/day.gif\?v=[a-f0-9]+"/);
  assert.equal(regular.replace(/<[^>]*>/g, ''), '');
  assert.equal(regular.includes('林舟'), false);
  assert.equal(regular.includes('<canvas'), false);
  const repeated = renderInspection(f.store.read(), { ui: { ...ui, inspectLoadingId: 'another-open' }, busy: new Set(), inspectPhone: f.service });
  assert.equal(repeated, regular); assert.equal(regular.includes('?open='), false);
  const night = renderInspection({ ...f.store.read(), theme: 'night' }, { ui, busy: new Set(), inspectPhone: f.service, reducedMotion: true });
  assert.match(night, /assets\/inspect-phone\/still-night.png/);
  assert.equal(night.includes('.gif'), false);
  const nightAnimation = renderInspection({ ...f.store.read(), theme: 'night' }, { ui, busy: new Set(), inspectPhone: f.service });
  assert.match(nightAnimation, /assets\/inspect-phone\/night.gif\?v=[a-f0-9]+"/);
  const dayStill = renderInspection(f.store.read(), { ui, busy: new Set(), inspectPhone: f.service, reducedMotion: true });
  assert.match(dayStill, /assets\/inspect-phone\/still-day.png/);
});

test('inspection loading fills the main without chrome and restores ordinary shell after loading', async () => {
  const { renderShell } = await import('../src/ui/shell.js');
  const props = { content: '<div class="inspect-loading"><img alt=""></div>', view: 'inspect-desktop', enabled: true, inspectedPhone: true, feedback: { text: '旧提示' } };
  const loading = renderShell({ ...props, inspectionLoading: true });
  assert.match(loading, /<main class="phone-main view-inspect-desktop is-inspect-loading">/);
  for (const chrome of ['phone-status', 'phone-footer', 'system-nav', '旧提示']) assert.equal(loading.includes(chrome), false);
  const desktop = renderShell(props);
  for (const chrome of ['phone-status', 'phone-footer', 'system-nav']) assert.ok(desktop.includes(chrome));
  const conflict = renderShell({ ...props, inspectionLoading: true, conflict: true, mode: 'standalone' });
  assert.match(conflict, /data-action="conflict-continue"/);
});

test('a simulator card title never creates a phone owner or an empty legacy candidate', () => {
  const state = { contacts: [], conversations: {}, inspectPhone: { owners: { 'card:simulator.png': { people: [], conversations: [], count: 20 } } } };
  assert.deepEqual(inspectionOwners(state, { avatar: 'simulator.png', name: '都市群像模拟器', description: '林舟和周予是不同人物。' }), []);
});

test('manual owners keep stable separate IDs and explicit profiles within this module', async () => {
  const f = fixture(), contacts = structuredClone(f.store.read().contacts);
  const first = await f.store.saveInspectionOwner('', { name: '顾宁', personality: '喜欢看旧书。' });
  const second = await f.store.saveInspectionOwner('', { name: '顾宁', personality: '另一个同名人物。' });
  assert.notEqual(first.id, second.id);
  assert.equal(Object.hasOwn(f.store.read().inspectPhone.owners[first.id], 'count'), false);
  assert.deepEqual(f.store.read().contacts, contacts);
  assert.equal(f.requests.length, 0);
  const context = await f.reader.readForInspection(first.id);
  assert.equal(context.owner.name, '顾宁'); assert.equal(context.owner.personality, '喜欢看旧书。');
  assert.equal(context.owner.personality.includes('一座普通城市'), false);
  await f.service.refresh(first.id);
  assert.equal(inspectionOwners(f.store.read()).find(person => person.id === first.id).name, '顾宁');
  assert.equal(f.store.read().inspectPhone.owners[first.id].profile.personality, '喜欢看旧书。');
  assert.equal(f.store.read().inspectPhone.owners[second.id].conversations.length, 0);
  assert.deepEqual(f.store.read().contacts, contacts);
});

test('legacy card records remain readable and receive an explicit name on their original key', async () => {
  const f = fixture(), id = 'card:林舟.png';
  const legacy = { people: [], count: 20, conversations: [{ id: 'legacy', name: '周予', participantIds: ['@owner', 'zhou'], messages: [{ id: 'old', role: 'user', speakerId: '@owner', text: 'LEGACY_OWNER_SENTINEL。' }] }] };
  f.store.read().inspectPhone = { owners: { [id]: legacy } };
  const before = structuredClone(f.store.read());
  const candidate = inspectionOwners(f.store.read()).find(person => person.id === id);
  assert.equal(candidate.needsName, true); assert.equal(candidate.name, '旧手机记录');
  assert.equal(inspectionThreads(f.store.read(), id, '我')[0].messages[0].text, 'LEGACY_OWNER_SENTINEL。');
  await assert.rejects(f.service.refresh(id), /指定手机主人/);
  assert.deepEqual(f.store.read(), before); assert.equal(f.h.metadataSaves, 0); assert.equal(f.requests.length, 0);
  await f.store.saveInspectionOwner(id, { name: '实际人物', personality: '明确的人物资料。' });
  assert.deepEqual(f.store.read().inspectPhone.owners[id].conversations, legacy.conversations);
  assert.equal((await f.reader.readForInspection(id)).owner.name, '实际人物');
  assert.equal(f.h.metadataSaves, 1);
});

test('manual owner validation and a failed save preserve existing records and ordinary outputs', async () => {
  const f = fixture(), before = structuredClone(f.store.read());
  await assert.rejects(f.store.saveInspectionOwner('', { name: '' }));
  await assert.rejects(f.store.saveInspectionOwner('', { name: '我' }));
  f.h.saveFailure = new Error('mock save failure');
  await assert.rejects(f.store.saveInspectionOwner('', { name: 'PRIVATE_OWNER_SENTINEL' }));
  assert.deepEqual(f.store.read(), before);
  f.h.saveFailure = null;
  await f.store.saveInspectionOwner('', { name: 'PRIVATE_OWNER_SENTINEL', personality: 'PROFILE_SECRET' });
  for (const output of [await f.reader.readForContact('lin'), await f.reader.readDirectorySources(), await f.reader.readForForum()]) {
    assert.equal(JSON.stringify(output).includes('PRIVATE_OWNER_SENTINEL'), false);
    assert.equal(JSON.stringify(output).includes('PROFILE_SECRET'), false);
  }
});

test('main phone desktop puts inspection on a separate page and owner desktop exposes only WeChat', async () => {
  const { renderDesktop } = await import('../src/ui/desktop.js');
  const apps = ['liangshi', 'social', 'messages', 'forum', 'calendar', 'album', 'settings', 'camera', 'inspect-phone', 'favorites'].map(id => ({ id, label: id }));
  const main = renderDesktop({}, { apps });
  assert.match(main, /data-desktop-page="0"/); assert.match(main, /data-desktop-page="1"/);
  const first = main.slice(main.indexOf('data-desktop-page="0"'), main.indexOf('data-desktop-page="1"'));
  assert.equal(first.includes('data-tab="inspect-phone"'), false);
  for (const app of apps.slice(0, 8)) assert.match(first, new RegExp(`data-tab="${app.id}"`));
  const owned = renderDesktop({}, { owner: { id: 'manual', name: '顾宁' }, apps: [{ id: 'inspect-wechat', label: '微信', icon: 'messages', action: 'inspect-open-wechat' }] });
  assert.match(owned, /顾宁的手机/); assert.match(owned, /data-clock-digits/); assert.match(owned, /data-action="inspect-open-wechat"/);
  assert.equal(owned.includes('desktop-calendar'), false); assert.equal(owned.includes('data-action="open-calendar"'), false);
});

test('owner identity changes while background material is loading stop before calling the model', async () => {
  const f = fixture(); let release, started;
  const waiting = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  f.target.readWorldInfo = async () => { started(); await waiting; return ''; };
  const request = f.service.refresh('lin');
  await entered;
  await f.store.saveContact('lin', { name: '林舟', identityOwnerId: '@user' });
  release();
  await assert.rejects(request);
  assert.equal(f.requests.length, 0);
  assert.equal(f.store.read().inspectPhone, undefined);
});
