import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { readTimeline, partitionHistory } from '../src/timeline.js';
import { renderInbox } from '../src/ui/messages.js';

for (const isGroup of [false, true]) test(`${isGroup ? 'group' : 'private'} inbox rows show the last saved story date and time without inferring a real date`, () => {
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
  assert.deepEqual([...html.matchAll(new RegExp(`data-${attribute}="([^"]+)"`, 'g'))].map(match => match[1]), cases.filter(item => item.last).concat(cases.filter(item => !item.last)).map(item => item.id));
  assert.deepEqual(state, before);
});

test('inbox mixes groups and contacts by last arrival, keeps legacy ties stable and never sorts saved arrays', () => {
  const groups = ['g-old', 'g-new', 'g-tie', 'g-legacy', 'g-empty'].map(id => ({ id, name: id, memberIds: ['p-old'], userIsMember: true }));
  const contacts = ['p-old', 'p-new', 'p-tie', 'p-bad', 'p-empty'].map(id => ({ id, name: id }));
  const row = (id, createdAt, storyDate = '旧历三年') => ({ id, role: 'assistant', speakerId: 'p-old', text: `预览${id}`, createdAt, storyDate, timeLabel: '01:10' });
  const state = { groups, contacts, conversations: {
    'g-old': [row('go', '2026-11-01T10:00:00Z', '2999年')], 'g-new': [row('gn', '2026-11-05T10:00:00Z')],
    'g-tie': [row('gt', '2026-11-03T10:00:00Z')], 'g-legacy': [row('gl')],
    'p-old': [row('po', '2026-11-02T10:00:00Z')], 'p-new': [row('ignored-max', '2099-01-01T00:00:00Z'), row('pn', '2026-11-06T10:00:00Z', '1900年')],
    'p-tie': [row('pt', '2026-11-03T10:00:00Z')], 'p-bad': [row('pb', 'bad-date')],
  } };
  const before = structuredClone(state), render = () => renderInbox(state, { ui: {}, busy: new Set() });
  const order = html => [...html.matchAll(/data-(group|contact)="([^"]+)"/g)].map(([, kind, id]) => `${kind}:${id}`);
  const html = render();
  assert.deepEqual(order(html), ['contact:p-new', 'group:g-new', 'group:g-tie', 'contact:p-tie', 'contact:p-old', 'group:g-old', 'group:g-legacy', 'contact:p-bad', 'group:g-empty', 'contact:p-empty']);
  assert.equal((html.match(/class="contact-list"/g) || []).length, 1);
  assert.ok(!html.includes('section-label'));
  assert.ok(html.includes('p-old：预览gn') && html.includes('1900年 01:10'));
  assert.deepEqual(state, before);
  state.conversations['g-old'].push(row('new-arrival', '2026-11-07T10:00:00Z', '1800年'));
  assert.equal(order(render())[0], 'group:g-old');
  assert.deepEqual(state.groups, before.groups); assert.deepEqual(state.contacts, before.contacts);
  assert.ok(!renderInbox({ groups: [groups[4]], contacts: [], conversations: {} }, { ui: {}, busy: new Set() }).includes('还没有联系人'));
  assert.ok(renderInbox({ groups: [], contacts: [], conversations: {} }, { ui: {}, busy: new Set() }).includes('还没有联系人'));
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

for (const isGroup of [false, true]) test(`${isGroup ? 'group' : 'private'} inbox shows exact unread count across all saved history and rich messages without mutation`, () => {
  const person = { id: 'target', name: '很长的会话名称用于确认日期和摘要仍然保留', ...(isGroup ? { memberIds: ['speaker'], userIsMember: true } : {}) };
  const messages = [
    ...Array.from({ length: 61 }, (_, i) => ({ id: `past-${i}`, role: 'assistant', speakerId: 'speaker', text: '折叠历史', read: false, batch: { key: '[0]' } })),
    { id: 'rich', role: 'assistant', speakerId: 'speaker', type: 'image', image: { description: '图片摘要' }, read: false },
    { id: 'read', role: 'assistant', text: '已读不计', read: true },
    { id: 'legacy', role: 'assistant', text: '缺字段不计' },
    { id: 'user', role: 'user', text: '本人不计', read: false, storyDate: '旧历三年初月', timeLabel: '23:55', createdAt: '2026-11-05T10:00:00Z' },
  ];
  const state = { contacts: isGroup ? [{ id: 'speaker', name: '甲' }] : [person], groups: isGroup ? [person] : [], conversations: { target: messages } };
  const before = structuredClone(state), render = () => renderInbox(state, { ui: {}, busy: new Set() });
  const html = render();
  assert.match(html, /<small class="contact-unread"><span aria-hidden="true">62<\/span><span class="sr-only">未读 62 条<\/span><\/small>/);
  assert.equal((html.match(/class="contact-unread"/g) || []).length, 1);
  assert.ok(html.includes('旧历三年初月 23:55') && html.includes('本人不计'));
  assert.ok(html.includes(`data-${isGroup ? 'group' : 'contact'}="target"`)); assert.deepEqual(state, before);
  messages.forEach(row => { if (row.role === 'assistant' && row.read === false) row.read = true; });
  assert.ok(!render().includes('contact-unread'));
});

test('inbox unread badges show 1, two digits and 99+ with exact accessible counts and no row arrows', () => {
  const counts = [0, 1, 12, 99, 100, 128];
  const contacts = counts.filter((_, i) => i % 2 === 0).map(count => ({ id: `c${count}`, name: `私聊${count}` }));
  const groups = counts.filter((_, i) => i % 2 === 1).map(count => ({ id: `c${count}`, name: `群聊${count}`, memberIds: ['c0'], userIsMember: true }));
  contacts.push({ id: 'empty', name: '还没聊过' });
  const state = { contacts, groups, conversations: Object.fromEntries(counts.map(count => [`c${count}`, Array.from({ length: count }, (_, i) => ({ id: `${count}-${i}`, role: 'assistant', read: false, text: '摘要保持原样', speakerId: 'c0', storyDate: '旧历三年', timeLabel: '01:10' }))])) };
  const before = structuredClone(state), html = renderInbox(state, { ui: {}, busy: new Set() });
  const rows = [...html.matchAll(/<button type="button" class="contact-row" data-(?:group|contact)="([^"]+)">([\s\S]*?)<\/button>/g)];
  assert.equal(rows.length, 7);
  for (const [_, id, body] of rows) {
    assert.ok(!body.includes('<svg'), 'every inbox row loses its tail arrow, including zero/empty rows');
    const count = id === 'empty' ? 0 : Number(id.slice(1));
    if (!count) { assert.ok(!body.includes('contact-unread')); continue; }
    assert.ok(body.includes(`<span aria-hidden="true">${count > 99 ? '99+' : count}</span>`));
    assert.ok(body.includes(`<span class="sr-only">未读 ${count} 条</span>`));
    assert.match(body, /class="contact-preview-row"><span class="contact-preview">[\s\S]*?<\/span><small class="contact-unread">/);
  }
  assert.deepEqual(state, before);
});
