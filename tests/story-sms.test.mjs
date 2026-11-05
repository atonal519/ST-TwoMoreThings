import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader, createBackflowService } from '../src/context.js';
import { createMessageService } from '../src/messages.js';
import { syncStorySms, parseStorySms, storySmsRegex, removeAcceptedStorySms } from '../src/story-sms.js';
import { readContactAvatars } from '../src/contact-avatars.js';
import { renderChat } from '../src/ui/messages.js';
import { readTimeline } from '../src/timeline.js';
import { captureFavorite } from '../src/favorites.js';
import { replyContext } from '../src/replies.js';

const rerollSms = text => `[tmt|群:测试群|甲]${text}[/tmt]`;
const rerollBody = texts => `<content>当前叙事。${texts.map(rerollSms).join('')}</content><!-- QQJ-end | date=2031年4月8日 | time=10:00 -->`;
function rerollSetup(texts = ['候选A。'], hostKind = 'native') {
  const h = createHarness({ hostKind, messages: [{ is_user: false, mes: rerollBody(texts) }], metadata: { pocketPhone: {
    contacts: [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }], groups: [{ id: 'g', name: '测试群', memberIds: ['a', 'b'], userIsMember: true }], conversations: {},
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  return { h, target, store, reader: () => createContextReader({ target, store, qqjBridgeProvider: () => null }) };
}

for (const hostKind of ['native', 'luker']) test(`${hostKind}: same-floor candidates append with independent message references and stay deleted across switching and store reconstruction`, async () => {
  const s = rerollSetup(undefined, hostKind);
  await syncStorySms(s);
  const first = structuredClone(s.store.read().conversations.g[0]), firstSaves = s.h.metadataSaves;
  assert.equal(await syncStorySms(s), false);
  assert.equal(s.h.metadataSaves, firstSaves);
  s.target.messages[0].mes = rerollBody(['候选B。']);
  await syncStorySms(s);
  const rows = s.store.read().conversations.g;
  assert.deepEqual(rows.map(row => row.text), ['候选A。', '候选B。']);
  assert.equal(new Set(rows.map(row => row.id)).size, 2);
  assert.deepEqual(rows[0], first);
  assert.equal(rows[0].batch.key, rows[1].batch.key, 'same time and floor keep the existing batch contract');
  const ids = rows.map(row => row.id);
  for (let index = 0; index < rows.length; index++) {
    assert.equal(replyContext({ replyToId: ids[index] }, rows).messageText, rows[index].text);
    const ref = { app: 'messages', kind: 'message', conversationId: 'g', messageId: ids[index], batchKey: rows[index].batch.key };
    assert.equal(captureFavorite(s.store.read(), ref).snapshot.text, rows[index].text);
    await s.store.addFavorite(ref);
  }
  const favorites = structuredClone(s.store.read().favorites);
  await s.store.deleteMessage('g', ids[0]);
  assert.deepEqual(s.store.read().conversations.g.map(row => row.id), [ids[1]]);
  s.target.messages[0].mes = rerollBody(['候选A。']);
  const before = s.h.metadataSaves;
  assert.equal(await syncStorySms(s), false);
  assert.equal(s.h.metadataSaves, before);
  await s.store.deleteMessage('g', ids[1]);
  for (const text of ['候选B。', '候选A。']) {
    s.h.context.chatMetadata.pocketPhone = JSON.parse(JSON.stringify(s.store.read()));
    s.target.messages[0].mes = rerollBody([text]);
    const fresh = createPhoneStore({ target: s.target }), saves = s.h.metadataSaves;
    assert.equal(await syncStorySms({ ...s, store: fresh }), false);
    assert.equal(s.h.metadataSaves, saves);
    assert.deepEqual(fresh.read().conversations.g, []);
    assert.deepEqual(fresh.read().favorites, favorites);
  }
  assert.equal(s.store.read().storySmsImports.processed.length, 2);
  assert.equal(s.h.modelRequests.length, 0);
});

test('formal projection identity ignores draft changes and maps its source position to the current raw block index', async () => {
  const s = rerollSetup(); await syncStorySms(s);
  const source = structuredClone(s.store.read().conversations.g[0].source), saves = s.h.metadataSaves;
  s.target.messages[0].mes = `<draft>${rerollSms('草稿一。')}${rerollSms('草稿二。')}</draft>${rerollBody(['候选A。'])}`;
  assert.equal(await syncStorySms(s), false);
  assert.equal(s.h.metadataSaves, saves);
  assert.deepEqual(s.store.read().conversations.g[0].source, source);
  assert.deepEqual((await s.reader().readForContact('a')).story.map(row => row.text), ['当前叙事。']);
  s.target.messages[0].mes = rerollBody(['候选B。']);
  assert.ok((await s.reader().readForContact('a')).story[0].text.includes('候选B。'));
  await syncStorySms(s);
  assert.deepEqual((await s.reader().readForContact('a')).story.map(row => row.text), ['当前叙事。']);
});

test('new-floor receipts replace the previous receipt while old candidate records and their source identities remain', async () => {
  const s = rerollSetup(); await syncStorySms(s);
  s.target.messages[0].mes = rerollBody(['候选B。']); await syncStorySms(s);
  const old = structuredClone(s.store.read().conversations.g);
  s.target.messages.push({ is_user: false, mes: rerollBody(['下一楼。']) }); await syncStorySms(s);
  assert.equal(s.store.read().storySmsImports.floor, 1);
  assert.equal(s.store.read().storySmsImports.processed.length, 1);
  assert.deepEqual(s.store.read().conversations.g.slice(0, 2), old);
  s.store.read().storyReferenceFloors = 2;
  assert.deepEqual((await s.reader().readForContact('a')).story.map(row => row.text), ['当前叙事。', '当前叙事。']);
});

test('duplicate sync calls and a reconstructed store publish one projection in the normal save queue', async () => {
  const s = rerollSetup(), fresh = createPhoneStore({ target: s.target });
  await Promise.all([syncStorySms(s), syncStorySms(s), syncStorySms({ ...s, store: fresh })]);
  assert.equal(s.h.metadataSaves, 1);
  assert.equal(s.store.read().conversations.g.length, 1);
  assert.equal(s.store.read().storySmsImports.processed.length, 1);
});

test('a failed candidate save rolls back messages and receipt together and the same candidate can be retried', async () => {
  const s = rerollSetup(), before = structuredClone(s.store.read());
  s.h.saveFailure = new Error('synthetic save failure');
  await assert.rejects(syncStorySms(s), /保存/);
  assert.deepEqual(s.store.read(), before);
  s.h.saveFailure = null;
  await syncStorySms(s);
  assert.equal(s.h.metadataSaves, 1);
  assert.equal(s.store.read().conversations.g.length, 1);
  assert.equal(s.store.read().storySmsImports.processed.length, 1);
  assert.equal(await syncStorySms(s), false);
});

test('legacy surviving text that differs from all seven new formal blocks allows the current candidate to append', async () => {
  const s = rerollSetup(Array.from({ length: 7 }, (_, index) => `新短信${index}。`));
  s.target.messages[0].mes = `<draft>${Array.from({ length: 41 }, () => rerollSms('草稿。')).join('')}</draft>${s.target.messages[0].mes}`;
  const old = { id: 'story:0:38', role: 'assistant', speakerId: 'a', text: '\n旧短信。\n', batch: readTimeline(s.target.messages), source: { kind: 'main-story', floor: 0, block: 38 } };
  s.store.read().storySmsImportedFloor = 0; s.store.read().conversations.g = [old];
  await syncStorySms(s);
  assert.equal(s.store.read().conversations.g.length, 8);
  assert.deepEqual(s.store.read().conversations.g[0], old);
  assert.deepEqual(s.store.read().conversations.g.slice(1).map(row => [row.source.block, row.source.position]), Array.from({ length: 7 }, (_, i) => [41 + i, i]));
  assert.equal(s.h.metadataSaves, 1);
  assert.equal(await syncStorySms({ ...s, store: createPhoneStore({ target: s.target }) }), false);
});

for (const surviving of [true, false]) test(`legacy ${surviving ? 'partially retained boundary-wrapped text' : 'fully deleted text'} gets one conservative receipt without restoring removed messages`, async () => {
  const s = rerollSetup(['候选A。', '已手删的同候选短信。']);
  const old = { id: 'legacy-stable-id', role: 'assistant', speakerId: 'a', text: '\r\n候选A。\r\n', batch: readTimeline(s.target.messages), source: { kind: 'main-story', floor: 0, block: 0 } };
  s.store.read().storySmsImportedFloor = 0; s.store.read().conversations.g = surviving ? [old] : [];
  const before = structuredClone(s.store.read()), raw = s.target.messages[0].mes;
  await syncStorySms(s);
  const { storySmsImports, ...unchanged } = s.store.read();
  assert.deepEqual(unchanged, before);
  assert.equal(storySmsImports.processed.length, 1);
  assert.equal(s.h.metadataSaves, 1);
  assert.equal(await syncStorySms({ ...s, store: createPhoneStore({ target: s.target }) }), false);
  assert.equal(s.h.metadataSaves, 1);
  assert.equal(s.target.messages[0].mes, raw);
});

for (const block of ['[tmt|甲|甲]同文。[/tmt]', '[tmt|群:测试群|乙]同文。[/tmt]']) test(`legacy accepted-removal requires the actual conversation and sender for ${block}`, async () => {
  const s = rerollSetup();
  s.target.messages[0].mes = `<content>当前叙事。${block}</content>`;
  s.store.read().conversations.g = [{ id: 'legacy', role: 'assistant', speakerId: 'a', text: '同文。', batch: readTimeline(s.target.messages), source: { kind: 'main-story', floor: 0, block: 0 } }];
  s.store.read().storySmsImportedFloor = 0;
  assert.ok((await s.reader().readForContact('a')).story[0].text.includes(block));
  await syncStorySms(s);
  const rows = Object.values(s.store.read().conversations).flat();
  assert.equal(rows.length, 2);
  assert.equal(rows.filter(row => row.source.projection).length, 1);
  assert.ok(rows.some(row => row.id === 'legacy'));
});

for (const newline of ['\n', '\r\n', '\r']) test(`TMT wrapper blank lines are excluded from display capture and imported text (${JSON.stringify(newline)})`, async () => {
  const text = `  第一行的缩进和尾空格  ${newline}${newline}  内部段落也保留。  `;
  const block = `[tmt|甲|甲]${newline}\t${newline}${text}${newline}  ${newline}[/tmt]`;
  const raw = `\n\n${block}\n\n`;
  const rule = storySmsRegex(), pattern = new RegExp(rule.findRegex.slice(1, -2), 'g');
  const match = [...raw.matchAll(pattern)][0];
  assert.equal(match.length, 4);
  assert.equal(match[0], block);
  assert.deepEqual(match.slice(1), ['甲', '甲', text]);
  assert.deepEqual(parseStorySms(raw), [{ index: 0, name: '甲', sender: '甲', text, group: false }]);
  assert.equal(raw.replace(pattern, rule.replaceString).match(/class="tmt-main-sms-bubble">([\s\S]*?)<\/div>/)[1], text);
  assert.equal(removeAcceptedStorySms(raw, new Set([0])), '\n\n\n\n');
  const h = createHarness({ messages: [{ is_user: false, mes: raw }], metadata: { pocketPhone: { contacts: [{ id: 'a', name: '甲' }], groups: [], conversations: {} } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await syncStorySms({ target, store });
  assert.equal(store.read().conversations.a[0].text, text);
  assert.equal(target.messages[0].mes, raw);
  assert.equal(h.metadataSaves, 1);
  assert.equal(h.modelRequests.length, 0);
});

test('empty and unclosed TMT wrappers keep full matching and raw block indexes while same-line spaces survive', () => {
  const empty = '[tmt|甲|甲]\n \t\n[/tmt]', first = '[tmt|甲|甲]\n第一条。\n[/tmt]', second = '[tmt|甲|我]  第二条。  [/tmt]';
  const raw = `${empty}[tmt|草稿|草稿]\n未闭合示例。${first}\n${second}`;
  const rule = storySmsRegex(), matches = [...raw.matchAll(new RegExp(rule.findRegex.slice(1, -2), 'g'))];
  assert.deepEqual(matches.map(match => match[0]), [empty, first, second]);
  assert.ok(matches.every(match => match.length === 4));
  assert.deepEqual(parseStorySms(raw).map(({ index, text }) => [index, text]), [[1, '第一条。'], [2, '  第二条。  ']]);
  assert.equal(removeAcceptedStorySms(raw, new Set([1])), `${empty}[tmt|草稿|草稿]\n未闭合示例。\n${second}`);
  assert.deepEqual(parseStorySms(empty), []);
  const unclosed = `[tmt|未闭合|甲]${'\r\n'.repeat(64)}`;
  assert.deepEqual(parseStorySms(unclosed + first).map(({ index, text }) => [index, text]), [[0, '第一条。']]);
});

for (const isGroup of [false, true]) test(`existing main-story ${isGroup ? 'group' : 'private'} messages keep stored text while a legacy receipt is established once`, async () => {
  const text = '\r\n \t\r\n  第一段原样保留。  \r\n\r\n第二段。\r\n\t\r\n';
  const shown = '  第一段原样保留。  \r\n\r\n第二段。';
  const raw = `[tmt|${isGroup ? '群:读书群' : '甲'}|甲]${text}[/tmt]`;
  const h = createHarness({ messages: [{ is_user: false, mes: raw }], metadata: { pocketPhone: {
    contacts: [{ id: 'a', name: '甲' }], groups: [{ id: 'g', name: '读书群', memberIds: ['a'], userIsMember: true }], conversations: {}, storySmsImportedFloor: 0,
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target }), batch = readTimeline(target.messages), id = isGroup ? 'g' : 'a';
  store.read().conversations[id] = [
    { id: 'story', role: 'assistant', speakerId: 'a', text, batch, source: { kind: 'main-story', floor: 0, block: 0 } },
    { id: 'manual', role: 'user', speakerId: '@user', text, batch },
    { id: 'phone-model', role: 'assistant', speakerId: 'a', text, batch },
  ];
  const before = structuredClone(store.read());
  const html = renderChat(store.read(), { ui: { view: isGroup ? 'group-chat' : 'chat', contactId: 'a', groupId: 'g', defaultUser: '我', batch, visibleMessages: 30, visibleHistory: 30, drafts: new Map() }, busy: new Set() });
  assert.deepEqual([...html.matchAll(/class="message-original"[^>]*>([\s\S]*?)<\/span>/g)].map(match => match[1]), [shown, text, text]);
  assert.equal(parseStorySms(raw)[0].text, shown);
  assert.equal(await syncStorySms({ target, store }), true);
  const { storySmsImports, ...unchanged } = store.read();
  assert.deepEqual(unchanged, before);
  assert.equal(storySmsImports.processed.length, 1);
  assert.equal(target.messages[0].mes, raw);
  assert.equal(h.metadataSaves, 1);
  assert.equal(await syncStorySms({ target, store }), false);
  assert.equal(h.metadataSaves, 1);
  assert.equal(h.modelRequests.length, 0);
});

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
  const directory = await backflow.prepare();
  assert.equal(directory.split('读书群').length - 1, 1);
  for (const value of ['晚上八点见。', '收到', '我带书。', '[手机参考']) assert.equal(directory.includes(value), false, value);
  assert.equal(requests.length, 0);
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
  assert.deepEqual(context.story.map(row=>row.text),['第二楼剧情。']);assert.equal('storyProgress' in context,false);assert.equal(JSON.stringify(context.story).includes('第一楼剧情'),false);
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
  assert.deepEqual(rows.map(row => [row.source.block, row.text, row.role]), [[1, text, 'user'], [2, text, 'user']]);
  assert.equal(new Set(rows.map(row => row.id)).size, 2);
  assert.match(rows[0].id, /^story:0:1:/); assert.match(rows[1].id, /^story:0:2:/);
  await syncStorySms(s); assert.equal(s.h.metadataSaves, 1); assert.equal(s.h.modelRequests.length, 0);
  assert.equal(s.target.messages[0].mes, raw);
});

test('three draft SMS copies are excluded while the formal copy keeps its original raw block index', async () => {
  const s = wrappedStory(draftStory);
  await syncStorySms(s);
  const state = s.store.read(), person = state.contacts.find(row => row.name === '朋友甲'), rows = state.conversations[person.id];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source.block, 3); assert.match(rows[0].id, /^story:0:3:/);
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

test('genuinely repeated formal SMS stays distinct, while candidate gating respects manual deletion', async () => {
  const raw = `<content>${repeatedSms}${repeatedSms}</content>`, s = wrappedStory(raw);
  await syncStorySms(s);
  const person = s.store.read().contacts.find(row => row.name === '朋友甲');
  assert.deepEqual(s.store.read().conversations[person.id].map(row => row.source.block), [0, 1]);
  await syncStorySms(s); assert.equal(s.h.metadataSaves, 1);
  await s.store.deleteMessage(person.id, s.store.read().conversations[person.id][0].id); const saves = s.h.metadataSaves;
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
