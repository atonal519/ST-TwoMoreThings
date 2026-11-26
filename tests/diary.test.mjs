import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader, createBackflowService } from '../src/context.js';
import { createDiaryService } from '../src/diary/service.js';
import { diaryOwners, diaryEntries } from '../src/diary/store.js';
import { renderDiary } from '../src/ui/diary.js';
import { renderInspection } from '../src/ui/inspect-phone.js';
import { createInspectPhoneService } from '../src/inspect-phone.js';
import { readPhoneContext } from '../src/phone-context.js';
import { createAuthoringService } from '../src/authoring.js';

function fixture() {
  const h = createHarness({ messages: [{ mes: '较旧正文', is_user: false }, { mes: '当前正文。<secret>应清洗</secret>', is_user: false }], metadata: { pocketPhone: {
    contacts: [{ id: 'a', name: '林舟', personality: '细心', source: { kind: 'qqj', entityId: 'ea' } }, { id: 'same', name: '林舟', personality: '独立身份' }, { id: 'b', name: '周予' }, { id: 'mine', name: '本人账号', identityOwnerId: '@user' }],
    storyReferenceFloors: 1, groups: [], conversations: {}, forum: { posts: [] }, injectEnabled: true,
    inspectPhone: { owners: { manual: { profile: { name: '林舟', personality: '手填人设' }, people: [], conversations: [] }, 'card:legacy': { people: [], conversations: [{ messages: [{ text: '旧档' }] }] } } },
  } } });
  const target = h.host.captureChat(); const notices = [];
  const store = createPhoneStore({ target, onNotifications: rows => notices.push(...rows) });
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  const requests = []; let answer = { title: '纸页', text: 'DIARY_FINISHED\n第二行', translation: '可选译文' }, current = true;
  const service = createDiaryService({ store, contextReader: reader, isCurrentChat: () => current, modelClient: { complete: async request => { requests.push(request); if (typeof answer === 'function') return answer(request); if (answer instanceof Error) throw answer; return JSON.stringify(answer); } } });
  return { h, target, store, reader, service, requests, notices, setAnswer: value => { answer = value; }, setCurrent: value => { current = value; } };
}

test('diary owners reuse exact IDs, exclude user/unnamed legacy owners, and opening never writes or generates', () => {
  const f = fixture(), before = structuredClone(f.store.read());
  assert.deepEqual(diaryOwners(f.store.read()).map(row => row.id), ['a', 'same', 'b', 'manual']);
  for (const ownerId of ['a', 'same', 'manual', 'mine', 'unknown']) assert.deepEqual(diaryEntries(f.store.read(), ownerId), []);
  const html = renderDiary(f.store.read(), { ui: { view: 'diary', diaryOwnerId: 'a' }, diary: f.service, busy: new Set() });
  assert.match(html, /select[^>]+data-diary-owner/); assert.doesNotMatch(html, /废稿|data-diary-mode|inspect-open/);
  assert.deepEqual(f.store.read(), before); assert.equal(f.requests.length, 0); assert.equal(f.h.metadataSaves, 0);
});

test('one call appends only the selected owner/mode and finished generation never reads drafts', async () => {
  const f = fixture(); await f.service.generate('a', 'finished');
  assert.equal(f.requests.length, 1); assert.equal(f.h.metadataSaves, 1);
  assert.equal(diaryEntries(f.store.read(), 'a')[0].text, 'DIARY_FINISHED\n第二行');
  assert.deepEqual(diaryEntries(f.store.read(), 'same'), []); assert.deepEqual(diaryEntries(f.store.read(), 'manual'), []);
  assert.equal(diaryEntries(f.store.read(), 'a')[0].storyDate, '');
  f.setAnswer({ ownerId: 'same', title: '未寄出的', text: 'DIARY_DRAFT ~~划掉~~', storyDate: '2099-01-01' });
  await f.service.generate('a', 'draft');
  assert.match(f.requests[1].messages[0].content, /DIARY_FINISHED/);
  assert.equal(diaryEntries(f.store.read(), 'a', 'draft')[0].storyDate, '');
  f.setAnswer({ title: '再一页', text: '新正文' }); await f.service.generate('a', 'finished');
  assert.match(f.requests[2].messages[0].content, /DIARY_FINISHED/); assert.doesNotMatch(f.requests[2].messages[0].content, /DIARY_DRAFT/);
  assert.equal(diaryEntries(f.store.read(), 'a').length, 2); assert.equal(f.requests.length, 3);
  assert.match(f.requests[0].system, /至少\s*200\s*字/); assert.match(f.requests[1].system, /至少\s*100\s*字/);
  assert.equal(f.notices.length, 0); assert.equal(f.store.read().notifications, undefined);
  const reopened = createPhoneStore({ target: f.target }); assert.equal(diaryEntries(reopened.read(), 'a').length, 2);
});

test('diary context selects user floor count and writer material, never phone feeds or unrelated people', async () => {
  const f = fixture();
  f.store.read().inspectPhone.owners.a = { people: [{ name: 'PRIVATE_PERSON' }], conversations: [{ messages: [{ text: 'INSPECTION_CHAT_SECRET' }] }] };
  f.store.read().conversations.a = [{ id: 'm', text: 'SMS_SECRET', role: 'assistant' }];
  const input = await f.reader.readForDiary('a');
  assert.equal(input.owner.id, 'a'); assert.equal(input.owner.personality, '细心');
  assert.equal(input.story.length, 1); assert.match(input.story[0].text, /当前正文/);
  assert.equal(input.clock, undefined); assert.equal(input.storyTime, null);
  assert.doesNotMatch(JSON.stringify(input), /INSPECTION_CHAT_SECRET|PRIVATE_PERSON|SMS_SECRET|独立身份|手填人设/);
  assert.equal(input.contacts, undefined); assert.equal(input.phoneContext, undefined); assert.equal(input.history, undefined);
  assert.equal((await f.reader.readForDiary('manual')).owner.personality, '手填人设');
  await assert.rejects(f.service.generate('mine', 'finished')); await assert.rejects(f.service.generate('card:legacy', 'finished'));
  await assert.rejects(f.service.generate('a', 'wrong')); assert.equal(f.requests.length, 0);
});

test('diary time comes only from captured plot stamp; model IDs, dates and fields never assign ownership', async () => {
  const f = fixture(); f.target.messages.push({ mes: '<!-- SDC-end | date=2031-04-09 | time=19:20 -->', is_user: false });
  f.setAnswer({ ownerId: 'b', mode: 'draft', title: '今天', text: '我写下这一页。', storyDate: '9999-01-01', extra: 'ignored' });
  await f.service.generate('manual', 'finished');
  const row = diaryEntries(f.store.read(), 'manual')[0];
  assert.equal(row.storyDate, '2031-04-09'); assert.equal(row.timeLabel, '19:20'); assert.equal(row.extra, undefined);
  assert.equal(diaryEntries(f.store.read(), 'b').length, 0); assert.equal(diaryEntries(f.store.read(), 'manual', 'draft').length, 0);
});

test('model and save failures preserve history without retry, while changed identity or chat rejects late result', async () => {
  const f = fixture(); await f.service.generate('a', 'finished'); const before = structuredClone(f.store.read());
  f.setAnswer(new Error('模型失败')); await assert.rejects(f.service.generate('a', 'draft'), /模型失败/);
  f.setAnswer({ title: '失败', text: '不落盘' }); f.h.saveFailure = new Error('保存失败');
  await assert.rejects(f.service.generate('a', 'finished')); assert.deepEqual(f.store.read(), before); assert.equal(f.requests.length, 3);
  f.h.saveFailure = null;
  let resolve; f.setAnswer(() => new Promise(done => { resolve = done; })); const pending = f.service.generate('a', 'finished');
  while (!resolve) await new Promise(done => setImmediate(done));
  f.store.read().contacts[0].identityOwnerId = '@user'; resolve(JSON.stringify({ title: '迟到', text: '不应保存' })); await assert.rejects(pending);
  const g = fixture(); let release; g.setAnswer(() => new Promise(done => { release = done; })); const later = g.service.generate('a', 'finished');
  while (!release) await new Promise(done => setImmediate(done));
  g.setCurrent(false); release(JSON.stringify({ title: '迟到', text: '不应保存' })); await assert.rejects(later, /聊天已切换/); assert.equal(g.h.metadataSaves, 0);
});

test('concurrent targets stay bound to their captured owner and append through the existing queue', async () => {
  const f = fixture(), g = fixture(); const releases = [];
  f.setAnswer(() => new Promise(resolve => releases.push(resolve)));
  const first = f.service.generate('a', 'finished'), second = f.service.generate('b', 'draft');
  while (releases.length < 2) await new Promise(done => setImmediate(done));
  releases[1](JSON.stringify({ title: 'B', text: 'B_PRIVATE' })); await second;
  releases[0](JSON.stringify({ title: 'A', text: 'A_PRIVATE' })); await first;
  assert.equal(diaryEntries(f.store.read(), 'a')[0].text, 'A_PRIVATE'); assert.equal(diaryEntries(f.store.read(), 'b', 'draft')[0].text, 'B_PRIVATE');
  assert.equal(g.store.read().diary, undefined); assert.equal(f.h.metadataSaves, 2);
});

test('main/inspection share finished pages, drafts only render inside inspection; paper safely escapes text and supports revisions', async () => {
  const f = fixture(); await f.service.generate('a', 'finished');
  f.setAnswer({ title: '<img onerror=bad>', text: 'DIARY_DRAFT ~~划掉~~\n<script>bad()</script>' }); await f.service.generate('a', 'draft');
  f.setAnswer({ title: '较新一页', text: '最新正文' }); await f.service.generate('a', 'finished');
  const main = renderDiary(f.store.read(), { ui: { view: 'diary', diaryOwnerId: 'a', diaryMode: 'draft' }, diary: f.service, busy: new Set() });
  const inspected = renderDiary(f.store.read(), { ui: { view: 'inspect-diary', inspectOwnerId: 'a', diaryMode: 'finished' }, diary: f.service, busy: new Set() });
  assert.match(main, /DIARY_FINISHED/); assert.match(inspected, /DIARY_FINISHED/); assert.doesNotMatch(main, /DIARY_DRAFT|废稿/);
  assert.ok(main.indexOf('最新正文') < main.indexOf('DIARY_FINISHED')); assert.match(main, /details class="diary-entry"[^>]* open/);
  const draft = renderDiary(f.store.read(), { ui: { view: 'inspect-diary', inspectOwnerId: 'a', diaryMode: 'draft' }, diary: f.service, busy: new Set() });
  assert.match(draft, /<del>划掉<\/del>/); assert.match(draft, /&lt;script&gt;/); assert.doesNotMatch(draft, /<script>|<img onerror/);
  const inspectPhone = createInspectPhoneService({ target: f.target, store: f.store, contextReader: f.reader, modelClient: {} });
  const desktop = renderInspection(f.store.read(), { ui: { view: 'inspect-desktop', inspectOwnerId: 'a' }, inspectPhone, busy: new Set() });
  assert.match(desktop, /inspect-open-wechat/); assert.match(desktop, /inspect-open-diary/);
  assert.equal(f.requests.length, 3); assert.equal(f.h.metadataSaves, 3);
});

test('ordinary contexts, backflow, author export, notifications and inspection generation never read diary text', async () => {
  const f = fixture(); await f.service.generate('a', 'finished'); f.setAnswer({ title: '私稿', text: 'DIARY_DRAFT' }); await f.service.generate('a', 'draft');
  const outputs = [readPhoneContext(f.store.read(), { targetIds: ['a'], defaultUser: '我', anchor: { key: 'current' } }), await f.reader.readForContact('a'), await f.reader.readForForum(), await f.reader.readForLiangshi({ includePhoneContext: true }), await f.reader.readForLiangshiHot(), await f.reader.readForLiangshiFollowing(), await f.reader.readForLiangshiDraft({ seed: '测试' }), await f.reader.readForSocial([{ ...f.store.read().contacts[0], kind: 'contact' }]), await f.reader.readDirectorySources(), await f.reader.readForInspection('a'), await createBackflowService({ target: f.target, store: f.store, modelClient: { complete() { throw new Error('无需摘要'); } } }).prepare(), await createAuthoringService({ host: f.h.host, store: f.store, readEntries: () => ({}) }).exportScript({ coreUrl: 'https://example.invalid/embed.js' })];
  for (const output of outputs) assert.doesNotMatch(JSON.stringify(output), /DIARY_FINISHED|DIARY_DRAFT/);
  assert.equal(f.notices.length, 0); assert.equal(f.h.settingsSaves, 0);
});

test('diary QQJ lookup keeps same-name private owners separate from explicitly bound stable identities', async () => {
  const f = fixture(), reads = [];
  const bridge = { getStatus: () => ({ status: 'ready' }), getPeopleSnapshot: () => ({ status: 'ready', people: { items: [{ entityId: 'ea', displayName: '林舟' }, { entityId: 'eb', displayName: '独一角色' }] } }), readContext: async request => { reads.push(request); return { status: 'ready', actors: [{ entityId: 'ea', stateText: 'EXPLICIT_A_SECRET' }, { entityId: 'eb', stateText: 'UNIQUE_OWNER_MEMORY' }] }; } };
  const reader = createContextReader({ target: f.target, store: f.store, qqjBridgeProvider: () => bridge });
  assert.match((await reader.readForDiary('a')).related, /EXPLICIT_A_SECRET/);
  assert.equal((await reader.readForDiary('manual')).related, '');
  const sent = []; const service = createDiaryService({ store: f.store, contextReader: reader, modelClient: { complete: async request => { sent.push(request); return JSON.stringify({ text: '我自己的私页' }); } } });
  await service.generate('manual', 'draft'); assert.doesNotMatch(sent[0].messages[0].content, /EXPLICIT_A_SECRET/);
  assert.equal(reads.length, 1);
  f.store.read().inspectPhone.owners.unique = { profile: { name: '独一角色' }, people: [], conversations: [] };
  assert.equal((await reader.readForDiary('unique')).related, 'UNIQUE_OWNER_MEMORY');
  f.store.read().contacts.push({ id: 'claimed', name: '另一个名字', source: { kind: 'qqj', entityId: 'eb' } });
  assert.equal((await reader.readForDiary('unique')).related, '');
  assert.equal(reads.length, 2);
});

test('only ambiguous diary choices show source/nickname/ordinal labels', () => {
  const f = fixture();
  f.store.read().contacts[0].nickname = '旧友';
  const html = renderDiary(f.store.read(), { ui: { view: 'diary' }, diary: f.service, busy: new Set() });
  assert.match(html, /林舟（旧友 · 短信）/); assert.match(html, /林舟（查手机）/); assert.match(html, /林舟（短信）/);
  assert.match(html, />周予<\/option>/);
  f.store.read().contacts.push({ id: 'same2', name: '林舟' });
  const repeated = renderDiary(f.store.read(), { ui: { view: 'diary' }, diary: f.service, busy: new Set() });
  assert.match(repeated, /林舟（短信 · 1）/); assert.match(repeated, /林舟（短信 · 2）/);
});

test('production diary controller navigation is read-only and in-flight target remains captured', async () => {
  const { createDiaryController } = await import('../src/ui/diary.js');
  const f = fixture(), ui = { view: 'diary', inspectOwnerId: 'manual' }, operations = [], routes = [];
  const controller = createDiaryController({ ui, diary: f.service, root: { querySelectorAll: () => [] }, showPage: view => { ui.view = view; routes.push(view); }, render() {}, isCurrentChat: () => true,
    perform: (key, work) => { const promise = work(); operations.push({ key, promise }); return promise; } });
  controller.change({ target: { id: 'diary-owner', value: 'a' } });
  controller.click({ dataset: { action: 'inspect-open-diary' } });
  controller.click({ dataset: { action: 'diary-mode', diaryMode: 'draft' } });
  assert.deepEqual(routes, ['inspect-diary']); assert.equal(ui.inspectOwnerId, 'manual'); assert.equal(f.requests.length, 0); assert.equal(f.h.metadataSaves, 0);
  let release; f.setAnswer(() => new Promise(done => { release = done; }));
  controller.click({ dataset: { action: 'diary-generate' } });
  while (!release) await new Promise(done => setImmediate(done));
  ui.inspectOwnerId = 'b'; controller.click({ dataset: { action: 'diary-mode', diaryMode: 'finished' } });
  release(JSON.stringify({ text: 'CAPTURED_MANUAL_DRAFT' })); await operations[0].promise;
  assert.equal(operations[0].key, 'diary:manual:draft'); assert.equal(f.requests.length, 1);
  assert.equal(diaryEntries(f.store.read(), 'manual', 'draft')[0].text, 'CAPTURED_MANUAL_DRAFT'); assert.equal(diaryEntries(f.store.read(), 'b').length, 0);
  ui.view = 'diary'; ui.diaryMode = 'draft'; controller.click({ dataset: { action: 'diary-mode', diaryMode: 'draft' } }); assert.equal(f.requests.length, 1);
});

test('new pages fold older default-open entries while preserving explicit user disclosures', async () => {
  const { createDiaryController } = await import('../src/ui/diary.js');
  const f = fixture(); await f.service.generate('a', 'finished');
  const id = diaryEntries(f.store.read(), 'a')[0].id, key = JSON.stringify(['a', 'finished', id]);
  const ui = { view: 'diary', diaryOwnerId: 'a' };
  const entry = { open: true, dataset: { diaryEntry: key, diaryRenderedOpen: 'true' } };
  const controller = createDiaryController({ ui, root: { querySelectorAll: () => [entry] } });
  controller.capture();
  f.setAnswer({ title: '新页', text: '新的一页' }); await f.service.generate('a', 'finished');
  let html = renderDiary(f.store.read(), { ui, diary: f.service, busy: new Set() });
  assert.equal((html.match(/<details[^>]* open>/g) || []).length, 1);
  entry.dataset.diaryRenderedOpen = 'false'; controller.capture();
  html = renderDiary(f.store.read(), { ui, diary: f.service, busy: new Set() });
  assert.equal((html.match(/<details[^>]* open>/g) || []).length, 2);
  entry.dataset.diaryRenderedOpen = 'true'; entry.open = false; controller.capture();
  html = renderDiary(f.store.read(), { ui, diary: f.service, busy: new Set() });
  assert.equal((html.match(/<details[^>]* open>/g) || []).length, 1);
});

test('diary name fallback excludes user-role QQJ material and entities explicitly owned by any user account', async () => {
  for (const boundary of ['user-role', 'user-alias', 'user-id']) {
    const f = fixture(), reads = [], sent = [];
    f.store.read().inspectPhone.owners.unique = { profile: { name: '独一角色' }, people: [], conversations: [] };
    if (boundary === 'user-alias') f.store.read().contacts.find(person => person.id === 'mine').source = { kind: 'qqj', entityId: 'user-entity' };
    if (boundary === 'user-id') f.store.read().contacts.push({ id: '@user', name: '本人', source: { kind: 'qqj', entityId: 'user-entity' } });
    const bridge = { getStatus: () => ({ status: 'ready' }), getPeopleSnapshot: () => ({ status: 'ready', people: { items: [{ entityId: 'user-entity', displayName: '独一角色', ...(boundary === 'user-role' ? { specialRole: 'user' } : {}) }] } }), readContext: async request => { reads.push(request); return { status: 'ready', actors: [{ entityId: 'user-entity', stateText: 'USER_PRIVATE_MEMORY' }, { entityId: 'ea', stateText: 'EXPLICIT_A_MEMORY' }] }; } };
    const reader = createContextReader({ target: f.target, store: f.store, qqjBridgeProvider: () => bridge });
    assert.equal((await reader.readForDiary('unique')).related, '', boundary);
    const service = createDiaryService({ store: f.store, contextReader: reader, modelClient: { complete: async request => { sent.push(request); return JSON.stringify({ text: '我自己的文字' }); } } });
    await service.generate('unique', 'finished');
    assert.doesNotMatch(sent[0].messages[0].content, /USER_PRIVATE_MEMORY/, boundary); assert.equal(reads.length, 0, boundary);
    assert.equal((await reader.readForDiary('a')).related, 'EXPLICIT_A_MEMORY', 'explicit stable owner remains usable');
    assert.equal(reads.length, 1);
  }
});
