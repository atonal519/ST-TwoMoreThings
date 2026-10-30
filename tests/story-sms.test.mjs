import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader, createBackflowService } from '../src/context.js';
import { createMessageService } from '../src/messages.js';
import { syncStorySms, parseStorySms, storySmsRegex, removeAcceptedStorySms } from '../src/story-sms.js';
import { readContactAvatars } from '../src/contact-avatars.js';

test('main-story SMS theme reuses one scoped style and leaves regex output unchanged', async () => {
  const { syncStorySmsTheme, storySmsRegex } = await import('../src/story-sms.js');
  assert.equal(typeof syncStorySmsTheme, 'function');
  let writes = 0;
  const styles = [], documentRef = { getElementById: id => styles.find(style => style.id === id), createElement: () => ({ dataset: {}, set textContent(value) { this.content = value; writes++; }, get textContent() { return this.content; } }), head: { append: style => styles.push(style) } };
  const regex = storySmsRegex();
  syncStorySmsTheme(documentRef, 'night');
  assert.equal(styles.length, 1); assert.match(styles[0].textContent, /^\.tmt-main-sms\{/); assert.match(styles[0].textContent, /--pp-surface:#162d3a/); assert.match(styles[0].textContent, /--pp-ink:#f2efdc/);
  syncStorySmsTheme(documentRef, 'night'); assert.equal(writes, 1, 'same theme does not rewrite the style');
  syncStorySmsTheme(documentRef, 'day');
  assert.equal(styles.length, 1); assert.equal(writes, 2); assert.match(styles[0].textContent, /--pp-surface:#fbfaf6/); assert.match(styles[0].textContent, /--pp-ink:#222a29/);
  assert.deepEqual(storySmsRegex(), regex, 'existing installed regex need not be changed');
});

function setup() {
  const h = createHarness({ messages: [{ is_user: false, mes: '[tmt|朋友甲|朋友甲]晚上八点见。[/tmt][tmt|朋友甲|我]收到[/tmt][tmt|群:读书群|朋友乙]我带书。[/tmt][tmt|群:读书群|我]好[/tmt]<!-- QQJ-end | date=2031/4/8 | time=09:30 -->' }] });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  return { h, target, store };
}

test('old metadata is stripped, original SMS imports once, and the normal save removes only retired todos', async () => {
  const s = setup();
  s.target.metadata.pocketPhone = { contacts: [], groups: [], conversations: {}, todos: [{ id: 'old', title: '退役旧数据', custom: true }], unknownField: { keep: true } };
  s.target.messages[0].mes = '[tmt|朋友甲|朋友甲]明晚八点前核对活动海报。<!--tmt-todo|核对活动海报|2031/4/9 20:00|未定|我、朋友甲、朋友乙-->[/tmt][tmt|群:读书群|朋友乙]我会带新书。[/tmt]';
  const raw = s.target.messages[0].mes;
  await syncStorySms(s);
  const state = s.store.read(), a = state.contacts.find(person => person.name === '朋友甲');
  assert.equal(s.h.metadataSaves, 1);
  assert.equal(state.conversations[a.id][0].text, '明晚八点前核对活动海报。');
  assert.equal('todos' in state, false); assert.deepEqual(state.unknownField, { keep: true });
  assert.equal(s.target.messages[0].mes, raw);
  await syncStorySms(s);
  assert.equal(s.h.metadataSaves, 1); assert.equal(s.h.modelRequests.length, 0);
});

test('retired metadata is not interpreted, and new three-part SMS imports without a task field', async () => {
  const rows = parseStorySms('[tmt|朋友甲|朋友甲]原话。<!--tmt-todo|任意|字段|不再|解析--><!--tmt-todo|字段|多|了|一个|竖线-->[/tmt][tmt|朋友甲|我]收到。[/tmt]');
  assert.deepEqual(rows.map(row => row.text), ['原话。', '收到。']);
  assert.ok(rows.every(row => !('todoSuggestions' in row)));
  assert.equal(parseStorySms('[tmt|朋友甲|朋友甲]旧格式仍保留[/tmt]')[0].text, '旧格式仍保留');
});

test('latest main-story SMS creates explicit people/groups in one silent transaction and respects later manual deletion', async () => {
  const s = setup();
  await syncStorySms(s);
  const state = s.store.read(), a = state.contacts.find(person => person.name === '朋友甲'), b = state.contacts.find(person => person.name === '朋友乙'), group = state.groups[0];
  assert.equal(s.h.metadataSaves, 1);
  assert.equal(a.personality || '', ''); assert.match(a.avatar, /^data:image\/svg/);
  assert.deepEqual(group.memberIds, [b.id]); assert.equal(group.userIsMember, true);
  assert.deepEqual(state.conversations[a.id].map(row => [row.role, row.text]), [['assistant', '晚上八点见。'], ['user', '收到']]);
  for (const row of Object.values(state.conversations).flat()) {
    assert.equal(row.read, true); assert.equal(row.source.kind, 'main-story'); assert.equal(row.source.floor, 0);
    assert.deepEqual(JSON.parse(row.batch.key), [0, '2031/4/8', '09:30']);
  }
  await syncStorySms({ ...s, store: createPhoneStore({ target: s.target }) });
  assert.equal(s.h.metadataSaves, 1);
  await s.store.deleteMessage(a.id, state.conversations[a.id][0].id);
  const afterDelete = s.h.metadataSaves;
  await syncStorySms(s); assert.equal(s.h.metadataSaves, afterDelete);
  assert.equal(s.store.read().conversations[a.id].length, 1);
});

test('names and nicknames match only unique people; existing group members and manual profiles remain', async () => {
  const s = setup();
  await s.store.upsertContacts([{ id: 'a', name: '朋友甲', nickname: '小甲', expression: '人工习惯' }, { id: 'old', name: '旧成员' }, { id: 'x', name: '同名' }, { id: 'y', name: '同名' }]);
  await s.store.saveGroup('', { name: '读书群', memberIds: ['old'], userIsMember: true });
  s.target.messages[0].mes = '[tmt|小甲|朋友甲]完整原话[/tmt][tmt|群:读书群|朋友乙]新消息[/tmt][tmt|同名|同名]歧义保留[/tmt]';
  await syncStorySms(s);
  const state = s.store.read(), b = state.contacts.find(person => person.name === '朋友乙');
  assert.deepEqual(state.groups[0].memberIds, ['old', b.id]);
  assert.equal(state.contacts.find(person => person.id === 'a').expression, '人工习惯');
  assert.equal(state.conversations.a[0].text, '完整原话');
  assert.equal(state.conversations.x, undefined); assert.equal(state.conversations.y, undefined);
  const reader = createContextReader({ target: s.target, store: s.store, qqjBridgeProvider: () => null });
  const context = await reader.readForContact('a');
  assert.equal(context.history[0].text, '完整原话');
  assert.equal(context.story[0].text.includes('完整原话'), false);
  assert.equal(context.story[0].text.includes('歧义保留'), true, 'unaccepted blocks stay in narrative context');
});

test('projected messages continue normally but do not flow back; independently repeated text remains a new event', async () => {
  const s = setup(); await syncStorySms(s);
  const a = s.store.read().contacts.find(person => person.name === '朋友甲');
  await s.store.setInjectionEnabled(true);
  const requests = [], modelClient = { async complete(request) { requests.push(request); return '{"messages":[{"text":"手机新回复"}]}'; } };
  const reader = createContextReader({ target: s.target, store: s.store, qqjBridgeProvider: () => null });
  const backflow = createBackflowService({ target: s.target, store: s.store, modelClient });
  assert.equal(await backflow.prepare(), '');
  await createMessageService({ target: s.target, store: s.store, contextReader: reader, modelClient }).continueChat(a.id);
  assert.ok(JSON.parse(requests[0].messages[0].content).history.some(row => row.text === '晚上八点见。'));
  const prompt = await backflow.prepare();
  assert.match(prompt, /手机新回复/); assert.ok(!prompt.includes('晚上八点见。'));
  s.target.messages.push({ is_user: false, mes: '[tmt|朋友甲|我]收到[/tmt]<!-- QQJ-end | date=2031/4/8 | time=10:00 -->' });
  await syncStorySms(s);
  assert.equal(s.store.read().conversations[a.id].filter(row => row.text === '收到').length, 2);
  assert.equal(requests.length, 1);
});

test('story progress removes accepted SMS from each floor in its existing narrative window', async () => {
  const h = createHarness({ messages: [{ is_user: false, mes: '最初的约定。' }] });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'a', name: '朋友甲' }, { id: 'b', name: '朋友乙' }, { id: 'x', name: '同名' }, { id: 'y', name: '同名' }]);
  const { readTimeline } = await import('../src/timeline.js');
  await store.appendMessage('a', { id: 'old', role: 'assistant', text: '之前的手机消息', batch: readTimeline(target.messages) });
  target.messages.push({ is_user: false, mes: '第一楼剧情。[tmt|朋友乙|朋友乙]第一楼已收短信[/tmt][tmt|同名|同名]歧义短信保留[/tmt]' });
  await syncStorySms({ target, store });
  target.messages.push({ is_user: false, mes: '第二楼剧情。[tmt|朋友乙|朋友乙]第二楼已收短信[/tmt]' });
  await syncStorySms({ target, store });
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  const context = await reader.readForContact('a');
  assert.deepEqual(context.storyProgress.messages.map(row => row.text), ['第一楼剧情。[tmt|同名|同名]歧义短信保留[/tmt]', '第二楼剧情。']);
  assert.equal(context.storyProgress.complete, true);
});

test('new story people use unique reader QQJ identities and display avatars without copying them into storage', async () => {
  const s = setup(); await syncStorySms(s);
  const a = s.store.read().contacts.find(person => person.name === '朋友甲'), savedAvatar = a.avatar;
  const bridge = {
    getStatus: () => ({ status: 'ready' }),
    getPeopleSnapshot: () => ({ status: 'ready', people: { items: [{ entityId: 'reader-person', displayName: '朋友甲' }, { entityId: 'other', displayName: '其他人' }] } }),
    getPeopleAvatars(ids) { assert.deepEqual(ids, ['reader-person']); return { status: 'ready', avatarsByEntityId: { 'reader-person': 'https://example.invalid/portrait.png' } }; },
    async readContext({ entityIds }) { assert.deepEqual(entityIds, ['reader-person']); return { status: 'ready', actors: [{ entityId: 'reader-person', memoryText: '甲的记忆' }, { entityId: 'other', memoryText: '其他人私事' }] }; },
  };
  assert.equal(readContactAvatars([a], bridge)[0].avatar, 'https://example.invalid/portrait.png');
  const context = await createContextReader({ target: s.target, store: s.store, qqjBridgeProvider: () => bridge }).readForContact(a.id);
  assert.equal(context.related, '甲的记忆'); assert.equal(s.store.read().contacts.find(person => person.id === a.id).avatar, savedAvatar);
  assert.deepEqual(a.source, { kind: 'story' });
});

test('a failed projection save keeps the original archive and its raw narrative intact', async () => {
  const s = setup(), before = structuredClone(s.target.metadata);
  s.h.saveFailure = new Error('save unavailable');
  await assert.rejects(syncStorySms(s), /手机内容保存失败/);
  assert.deepEqual(s.target.metadata, before); assert.equal(s.h.metadataSaves, 0);
  assert.ok(s.target.messages[0].mes.includes('[tmt|朋友甲|朋友甲]'));
});

const draftWrappers = { keepTags: 'content,titlebar', extraTags: '[[...]],think,thinking,snow,sidestory,bbi_image,[draft]...[/draft],draft' };
const repeatedSms = '[tmt|朋友甲|我]完整原话，保留  两格与换行。\n收到。[/tmt]';
const draftStory = `<content><draft>${repeatedSms}</draft><draft>${repeatedSms}</draft><draft>${repeatedSms}</draft>正式叙事。${repeatedSms}</content>`;
function wrappedStory(raw, wrappers = draftWrappers) {
  const h = createHarness({ messages: [{ is_user: false, mes: raw }] });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  return { h, target, store, wrapperSettingsProvider: () => wrappers };
}

test('an unclosed draft SMS opener cannot swallow the formal SMS in parse, display, accepted removal or import', async () => {
  const raw = '<content><draft>复查：短信保留[tmt|甲|甲]结构，内容完整。</draft>正式正文。[tmt|甲|甲]晚上见。[/tmt]</content>';
  assert.deepEqual(parseStorySms(raw), [{ index: 0, name: '甲', sender: '甲', text: '晚上见。', group: false }]);
  const rule = storySmsRegex(), end = rule.findRegex.lastIndexOf('/');
  const pattern = new RegExp(rule.findRegex.slice(1, end), rule.findRegex.slice(end + 1));
  const matches = [...raw.matchAll(pattern)];
  assert.deepEqual(matches.map(row => row.slice(1)), [['甲', '甲', '晚上见。']], 'display keeps exactly the original three capture groups');
  const rendered = raw.replace(pattern, rule.replaceString), formal = rendered.split('</draft>')[1];
  assert.ok(formal.includes('class="tmt-main-sms-bubble">晚上见。</div>')); assert.equal(formal.includes('[tmt|'), false);
  assert.equal(removeAcceptedStorySms(raw, new Set([0])), '<content><draft>复查：短信保留[tmt|甲|甲]结构，内容完整。</draft>正式正文。</content>');
  const s = wrappedStory(raw); await syncStorySms(s);
  const state = s.store.read(), person = state.contacts.find(row => row.name === '甲');
  assert.deepEqual(state.conversations[person.id].map(row => [row.text, row.source.block]), [['晚上见。', 0]]);
  assert.equal(s.target.messages[0].mes, raw); assert.equal(s.h.metadataSaves, 1); assert.equal(s.h.modelRequests.length, 0);
  const reader = createContextReader({ target: s.target, store: s.store, qqjBridgeProvider: () => null, wrapperSettingsProvider: s.wrapperSettingsProvider });
  assert.deepEqual((await reader.readForContact(person.id)).story.map(row => row.text), ['正式正文。']);
});

test('an invalid opener consumes no block index while closed draft blocks and repeated formal originals keep theirs', async () => {
  const text = '  正式原话，保留  两格与换行。\n提到部分结构[tmt|，原样保留。  ';
  const sms = `[tmt|甲|我]${text}[/tmt]`, raw = `<content><draft>[tmt|甲|甲]合法草稿。[/tmt]复查[tmt|甲|甲]保持格式。</draft>正式正文。${sms}${sms}</content>`;
  assert.deepEqual(parseStorySms(raw).map(row => [row.index, row.text]), [[0, '合法草稿。'], [1, text], [2, text]]);
  const s = wrappedStory(raw); await syncStorySms(s);
  const person = s.store.read().contacts.find(row => row.name === '甲'), rows = s.store.read().conversations[person.id];
  assert.deepEqual(rows.map(row => [row.id, row.source.block, row.text, row.role]), [['story:0:1', 1, text, 'user'], ['story:0:2', 2, text, 'user']]);
  await syncStorySms(s); assert.equal(s.h.metadataSaves, 1); assert.equal(s.h.modelRequests.length, 0);
  assert.equal(s.target.messages[0].mes, raw);
});

test('three draft SMS copies are excluded while the formal copy keeps its original raw block index', async () => {
  const s = wrappedStory(draftStory);
  await syncStorySms(s);
  const state = s.store.read(), person = state.contacts.find(row => row.name === '朋友甲'), rows = state.conversations[person.id];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source.block, 3); assert.equal(rows[0].id, 'story:0:3');
  assert.equal(rows[0].text, '完整原话，保留  两格与换行。\n收到。'); assert.equal(rows[0].role, 'user'); assert.equal(rows[0].speakerId, '@user');
  assert.equal(s.target.messages[0].mes, draftStory); assert.equal(s.h.metadataSaves, 1); assert.equal(s.h.modelRequests.length, 0);
  const reader = createContextReader({ target: s.target, store: s.store, qqjBridgeProvider: () => null, wrapperSettingsProvider: s.wrapperSettingsProvider });
  assert.deepEqual((await reader.readForContact(person.id)).story.map(row => row.text), ['正式叙事。']);
});

test('SMS import follows shared XML keep, literal draft exclusion and default plain-body rules', async () => {
  const cases = [
    { raw: `[DRAFT]<content>${repeatedSms}</content>[/DRAFT]<content>${repeatedSms}</content>`, expected: [1] },
    { raw: `<think><content>${repeatedSms}</content>${repeatedSms}</think><titlebar>${repeatedSms}</titlebar>`, expected: [0, 2] },
    { raw: `[[${repeatedSms}]]${repeatedSms}`, expected: [1] },
    { raw: repeatedSms, wrappers: {}, expected: [0] },
  ];
  for (const { raw, wrappers = draftWrappers, expected } of cases) {
    const s = wrappedStory(raw, wrappers); await syncStorySms(s);
    assert.deepEqual(Object.values(s.store.read().conversations).flat().map(row => row.source.block), expected);
    assert.equal(s.target.messages[0].mes, raw); assert.equal(s.h.metadataSaves, 1);
  }
});

test('genuinely repeated formal SMS stays distinct, while floor gating and manual deletion stay unchanged', async () => {
  const raw = `<content>${repeatedSms}${repeatedSms}</content>`, s = wrappedStory(raw);
  await syncStorySms(s);
  const person = s.store.read().contacts.find(row => row.name === '朋友甲');
  assert.deepEqual(s.store.read().conversations[person.id].map(row => row.source.block), [0, 1]);
  await syncStorySms(s); assert.equal(s.h.metadataSaves, 1);
  await s.store.deleteMessage(person.id, 'story:0:0'); const saves = s.h.metadataSaves;
  assert.equal(await syncStorySms(s), false); assert.equal(s.h.metadataSaves, saves);
  s.target.messages.push({ is_user: false, mes: `<content>${repeatedSms}</content>` }); await syncStorySms(s);
  assert.deepEqual(s.store.read().conversations[person.id].map(row => [row.source.floor, row.source.block]), [[0, 1], [1, 0]]);
});

test('excluded-only or no SMS body performs no import or save and failed formal import leaves state intact', async () => {
  for (const raw of [`<draft>${repeatedSms}</draft>`, '[DRAFT]<content>无短信</content>[/DRAFT]', '<content>纯正文。</content>']) {
    const s = wrappedStory(raw); let imports = 0;
    const store = { read: s.store.read, importStorySms() { imports++; throw new Error('unexpected import'); } };
    assert.equal(await syncStorySms({ ...s, store }), false); assert.equal(imports, 0); assert.equal(s.h.metadataSaves, 0);
  }
  const s = wrappedStory(draftStory), before = structuredClone(s.target.metadata); s.h.saveFailure = new Error('save unavailable');
  await assert.rejects(syncStorySms(s), /手机内容保存失败/); assert.deepEqual(s.target.metadata, before); assert.equal(s.target.messages[0].mes, draftStory); assert.equal(s.h.modelRequests.length, 0);
});

for (const hostKind of ['native', 'luker']) test(`${hostKind}: separated contact labels route both private ends to the existing account without changing its profile`, async () => {
  for (const [name, nickname, conversation, sender] of [
    ['张三', '', '老板-张三', '张三（老板）'],
    ['张三', '', '【张三】', '张三'],
    ['老板-张三', '', '张三', '张三'],
    ['张三（老板）', '', '张三', '张三'],
    ['张三', '小张', '同事-小张', '小张（同事）'],
    ['老板-张三', '张三（同事）', '张三', '张三'],
    ['A', '', '主管-A', 'A'],
    ['明', '', '明（店员）', '明'],
    ['Mary Jane', '', '同事—Mary Jane', 'Mary Jane'],
    ['张三', '', '📞张三📞', '张三'],
    ['A+B', '', '老板-A+B', 'A+B'],
    ['王(三)', '', '同事-王(三)', '王(三)'],
  ]) {
    const h = createHarness({ hostKind, messages: [{ is_user: false, mes: `[tmt|${conversation}|${sender}]  完整原话。\n第二行！  [/tmt][tmt|${conversation}|我]收到。[/tmt]` }] });
    const target = h.host.captureChat(), store = createPhoneStore({ target });
    await store.upsertContacts([{ id: 'a', name, nickname, expression: '人工习惯', language: '粤语', remarkForUser: '原备注' }]);
    const profiles = structuredClone(store.read().contacts), before = h.metadataSaves, raw = target.messages[0].mes;
    await syncStorySms({ target, store });
    assert.deepEqual(store.read().contacts, profiles, `${conversation}/${sender}: routing does not rename or add aliases`);
    assert.deepEqual(store.read().conversations.a.map(row => [row.role, row.speakerId, row.text]), [['assistant', 'a', '  完整原话。\n第二行！  '], ['user', '@user', '收到。']]);
    assert.deepEqual(store.read().conversations.a.map(row => [row.source.floor, row.source.block, row.read]), [[0, 0, true], [0, 1, true]]);
    assert.equal(target.messages[0].mes, raw); assert.equal(h.metadataSaves, before + 1); assert.equal(h.modelRequests.length, 0);
    await syncStorySms({ target, store }); assert.equal(h.metadataSaves, before + 1, 'same floor imports once');
  }
});

test('continuous longer names and words remain distinct people in either containment direction', async () => {
  for (const [name, label] of [['张三', '张三丰'], ['张三丰', '张三'], ['A', 'Amy'], ['Amy', 'A'], ['明', '阿明'], ['阿明', '明'], ['张三', '老板张三'], ['张三', '张三经理']]) {
    const s = setup(); await s.store.upsertContacts([{ id: 'a', name }]);
    s.target.messages[0].mes = `[tmt|${label}|${label}]新人的原话。[/tmt]`;
    await syncStorySms(s);
    const added = s.store.read().contacts.find(row => row.name === label);
    assert.ok(added && added.id !== 'a', `${name}/${label}: no continuous substring merge`);
    assert.equal(s.store.read().conversations.a, undefined);
    assert.equal(s.store.read().conversations[added.id][0].text, '新人的原话。');
    assert.equal(s.h.modelRequests.length, 0);
  }
});

test('exact names and nicknames win before decorated candidates; ambiguous IDs are not merged by owner', async () => {
  const s = setup();
  await s.store.upsertContacts([{ id: 'a', name: '张三', nickname: '小张' }, { id: 'b', name: '老板-张三', nickname: '同事-小张' }, { id: 'x', name: '同名' }, { id: 'y', name: '同名' }]);
  await s.store.saveContact('b', { ...s.store.read().contacts.find(row => row.id === 'b'), identityOwnerId: 'a' });
  assert.equal(s.store.read().contacts.find(row => row.id === 'b').identityOwnerId, 'a');
  const profiles = structuredClone(s.store.read().contacts);
  s.target.messages[0].mes = '[tmt|张三|张三]精确姓名。[/tmt][tmt|小张|小张]精确昵称。[/tmt][tmt|老板-张三（朋友）|老板-张三（朋友）]包装歧义。[/tmt][tmt|同名|同名]精确歧义。[/tmt]';
  await syncStorySms(s);
  assert.deepEqual(s.store.read().contacts, profiles);
  assert.deepEqual(s.store.read().conversations.a.map(row => row.text), ['精确姓名。', '精确昵称。']);
  for (const id of ['b', 'x', 'y']) assert.equal(s.store.read().conversations[id], undefined);
  assert.equal(s.h.modelRequests.length, 0);
});

test('private labels and non-user senders must independently resolve to the same unique account', async () => {
  const s = setup();
  await s.store.upsertContacts([{ id: 'a', name: '张三' }, { id: 'b', name: '李四' }, { id: 'c', name: '张三', nickname: '另一号' }]);
  const profiles = structuredClone(s.store.read().contacts);
  s.target.messages[0].mes = '[tmt|另一号|老板-李四]不同人。[/tmt][tmt|另一号|老板-张三]发信人歧义。[/tmt][tmt|另一号|张三经理]发信人未匹配。[/tmt][tmt|另一号（朋友）|我]本人发信。[/tmt]';
  await syncStorySms(s);
  assert.deepEqual(s.store.read().contacts, profiles);
  assert.equal(s.store.read().conversations.a, undefined); assert.equal(s.store.read().conversations.b, undefined);
  assert.ok(s.store.read().conversations.c, 'the independently unique wrapped conversation must receive the user message');
  assert.deepEqual(s.store.read().conversations.c.map(row => [row.role, row.speakerId, row.text]), [['user', '@user', '本人发信。']]);
  assert.equal(s.h.modelRequests.length, 0);
});

test('group sender decoration reuses the existing ID and freezes old scope while group names stay exact', async () => {
  const s = setup(); await s.store.upsertContacts([{ id: 'a', name: '张三' }, { id: 'old', name: '旧成员' }]);
  const group = await s.store.saveGroup('', { name: '读书群', memberIds: ['old'], userIsMember: true });
  await s.store.appendMessage(group.id, { id: 'old-msg', role: 'assistant', speakerId: 'old', text: '旧消息。' });
  const profiles = structuredClone(s.store.read().contacts);
  s.target.messages[0].mes = '[tmt|群:读书群|老板-张三]新消息。[/tmt][tmt|群:老板-读书群|张三（老板）]另一个群。[/tmt]';
  await syncStorySms(s);
  const state = s.store.read(), other = state.groups.find(row => row.name === '老板-读书群');
  assert.deepEqual(state.contacts, profiles); assert.equal(state.groups.length, 2); assert.notEqual(other.id, group.id);
  assert.deepEqual(state.conversations[group.id].map(row => [row.speakerId, row.knownToIds]), [['old', ['old', '@user']], ['a', ['old', 'a', '@user']]]);
  assert.equal(state.conversations[other.id][0].speakerId, 'a'); assert.equal(s.h.modelRequests.length, 0);
});

test('a failed decorated import rolls back the existing contact and leaves the floor available for a manual retry', async () => {
  const s = setup(); await s.store.upsertContacts([{ id: 'a', name: '张三', nickname: '小张' }]);
  s.target.messages[0].mes = '[tmt|老板-张三|小张（同事）]原话。[/tmt]';
  const before = structuredClone(s.target.metadata); s.h.saveFailure = new Error('fixture save unavailable');
  await assert.rejects(syncStorySms(s), /手机内容保存失败/); assert.deepEqual(s.target.metadata, before);
  s.h.saveFailure = null; await syncStorySms(s);
  assert.equal(s.store.read().contacts.length, 1); assert.ok(s.store.read().conversations.a, 'manual retry routes to the original contact'); assert.equal(s.store.read().conversations.a[0].text, '原话。');
  assert.equal(s.h.modelRequests.length, 0);
});
