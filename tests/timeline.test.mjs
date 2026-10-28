import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { readTimeline, partitionHistory } from '../src/timeline.js';

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
  const h = createHarness({ messages: [{ is_user: false, mes: '<!-- QQJ-end | date=2026-10-18 | time=18:00 -->' }], settings: { 'schedule-planner': { apiPresets: [{ id: 'test', url: 'https://example.invalid/v1', key: 'test', model: 'm' }] } } });
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
