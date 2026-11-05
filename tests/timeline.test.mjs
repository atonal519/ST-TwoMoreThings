import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { readTimeline, partitionHistory } from '../src/timeline.js';
import { renderInbox } from '../src/ui/messages.js';

for (const isGroup of [false, true]) test(`${isGroup ? 'group' : 'private'} inbox rows show the last saved story date and time without inferring a real date or reordering`, () => {
  const cases = [
    { id: 'full', last: { storyDate: '2025年7月2日', timeLabel: '23:55' }, expected: '2025年7月2日 23:55' },
    { id: 'time', last: { timeLabel: '01:10' }, expected: '01:10' },
    { id: 'date', last: { storyDate: '旧历三年初月' }, expected: '旧历三年初月' },
    { id: 'unknown', last: {}, expected: '' },
    { id: 'empty', expected: '' },
    { id: 'photo', last: { type: 'image', image: { description: '合成照片。' }, storyDate: '2025年7月3日', timeLabel: '11:05' }, expected: '2025年7月3日 11:05' },
  ];
  const state = { contacts: isGroup ? [{ id: 'speaker', name: '甲' }] : cases.map(({ id }) => ({ id, name: `联系人${id}` })),
    groups: isGroup ? cases.map(({ id }) => ({ id, name: `群${id}`, memberIds: ['speaker'], userIsMember: true })) : [],
    conversations: Object.fromEntries(cases.map(({ id, last }) => [id, last ? [
      { id: `${id}-previous`, role: 'assistant', text: '前一条。', storyDate: '2098年1月1日', timeLabel: '12:00' },
      { id: `${id}-last`, role: 'assistant', speakerId: 'speaker', text: '末条预览。', createdAt: '2099-12-31T00:00:00Z', ...last },
    ] : []])) };
  const before = structuredClone(state), html = renderInbox(state, { ui: {}, busy: new Set() }), attribute = isGroup ? 'group' : 'contact';
  for (const { id, expected } of cases) assert.equal(html.match(new RegExp(`data-${attribute}="${id}"[\\s\\S]*?<span class="contact-time">([^<]*)<\\/span>`))[1], expected);
  assert.deepEqual([...html.matchAll(new RegExp(`data-${attribute}="([^"]+)"`, 'g'))].map(match => match[1]), cases.map(item => item.id));
  assert.deepEqual(state, before);
});

test('timeline labels use the host zero-based AI message index', () => {
  const first = { is_user: false, mes: '<!-- QQJ-end | date=2026-10-18 | time=18:00 -->' };
  assert.equal(readTimeline([first]).label, '2026-10-18 · 18:00 · 主楼 #0');
  assert.equal(readTimeline([first, { is_user: true, mes: '继续' }, first]).label, '2026-10-18 · 18:00 · 主楼 #2');
});

test('past labels correct only the trailing floor from a valid batch key without changing saved records', () => {
  const rows = [
    { id: 'old', batch: { key: '[6,"旧历二年九月","18:00"]', label: '旧历二年九月 · 18:00 · 主楼 #7' } },
    { id: 'unknown', batch: { key: 'old-format', label: '过去 · 主楼 #7' } },
    { id: 'before', batch: { key: '[-1]', label: '正文开始前' } },
  ];
  const saved = structuredClone(rows);
  assert.deepEqual(partitionHistory(rows, { key: '[8]' }).past.map(group => group.label), [
    '旧历二年九月 · 18:00 · 主楼 #6', '过去 · 主楼 #7', '正文开始前',
  ]);
  assert.deepEqual(rows, saved);
});

test('same story time on two AI floors still separates history; clear only removes current messages', async () => {
  const h = createHarness({ messages: [{ is_user: false, mes: '<!-- QQJ-end | date=2026-10-18 | time=18:00 -->' }], settings: { pocketPhone:{apiSourceRef:{kind:'shared-preset',presetId:'test'}}, 'schedule-planner': { apiPresets: [{ id: 'test', url: 'https://example.invalid/v1', key: 'test', model: 'm' }] } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'lin', name: '林舟' }]);
  const { createContextReader } = await import('../src/context.js');
  const { createMessageService } = await import('../src/messages.js');
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  const service = createMessageService({ target, store, contextReader: reader });
  await service.send('lin', '上一批短信');
  assert.ok(store.read().conversations.lin[0].batch?.key, '短信保存所属楼和时间卡口');
  const { readTimeline, partitionHistory } = await import('../src/timeline.js');
  const oldKey = readTimeline(target.messages).key;
  target.messages.push({ is_user: true, mes: '继续剧情' }, { is_user: false, mes: '<!-- QQJ-end | date=2026-10-18 | time=18:00 -->' });
  const anchor = readTimeline(target.messages);
  assert.notEqual(anchor.key, oldKey);
  await service.send('lin', '当前批短信');
  assert.deepEqual((await reader.readForContact('lin')).history.map(x => x.text), ['当前批短信']);
  assert.deepEqual((await reader.readForContact('lin')).previousMessages.map(x => x.text), ['上一批短信'], 'past grouping does not erase conversation continuity');
  assert.deepEqual(partitionHistory(store.read().conversations.lin, anchor).past[0].messages.map(x => x.text), ['上一批短信']);
  await store.clearConversation('lin', anchor);
  assert.deepEqual(store.read().conversations.lin.map(x => x.text), ['上一批短信']);
  assert.deepEqual(h.persistedMetadata.pocketPhone.conversations.lin.map(x => x.text), ['上一批短信']);
});

test('worldbook activation is used without QQJ and only one complete AI floor reaches phone generation', async () => {
  const h = createHarness({ messages: [{ is_user: false, mes: '旧楼不能送入' }, { is_user: true, mes: '用户输入不是最新AI楼' }, { is_user: false, mes: '最新AI楼：书店见。' + '正文'.repeat(1500) }] });
  const { createContextReader } = await import('../src/context.js');
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'lin', name: '林舟' }]);
  const input = await createContextReader({ target, store, qqjBridgeProvider: () => null }).readForContact('lin');
  assert.equal(input.story.length, 1);
  assert.equal(input.story[0].text.length, 3010);
  assert.equal(input.related, '');
  assert.equal(typeof input.worldbook, 'string');
  assert.ok(!JSON.stringify(input).includes('旧楼不能送入'));
});
