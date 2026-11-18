import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader, createBackflowService } from '../src/context.js';
import { syncStorySms, readStorySmsProjection, parseStorySms, storySmsBlockMatches, storySmsRegex } from '../src/story-sms.js';
import { readTimeline } from '../src/timeline.js';
import { renderChat } from '../src/ui/messages.js';
import { captureFavorite } from '../src/favorites.js';
const marker = '【微信转账：2000.00元】';
const body = content => `<content>朋友发来一笔款项。${content}</content><!-- QQJ-end | date=2031年4月8日 | time=10:00 -->`;
const sms = (text, sender = '朋友甲', name = '朋友甲') => `[tmt|${name}|${sender}]${text}[/tmt]`;
function fixture(hostKind = 'native', legacy = false) {
  const raw = body(legacy ? sms(marker) : sms(marker) + sms('这笔用于下周的材料。') + sms('【微信转账: 0.10 元】', '我') + sms(marker, '朋友甲', '群:材料组'));
  const messages = [{ is_user: false, mes: raw }], batch = readTimeline(messages), projection = readStorySmsProjection(raw);
  const saved = { contacts: [{ id: 'peer', name: '朋友甲' }], groups: [], conversations: {} };
  if (legacy) Object.assign(saved, { conversations: { peer: [{ id: 'old-transfer', role: 'assistant', speakerId: 'peer', text: marker, batch: { key: batch.key, label: batch.label }, source: { kind: 'main-story', floor: 0, block: 0, position: 0, projection: projection.key } }] }, storySmsImportedFloor: 0, storySmsImports: { floor: 0, processed: [projection.key] } });
  const h = createHarness({ hostKind, messages, metadata: { pocketPhone: saved } }), target = h.host.captureChat(), store = createPhoneStore({ target });
  const ui = { view: 'chat', contactId: 'peer', batch, visibleMessages: 60, visibleHistory: 60, drafts: new Map() };
  return { h, target, store, batch, projection, raw, ui, reader: () => createContextReader({ target, store, qqjBridgeProvider: () => null }) };
}

for (const hostKind of ['native', 'luker']) test(`${hostKind}: exact private story transfer imports with direction, source positions and ordinary neighboring SMS intact`, async () => {
  const f = fixture(hostKind); await syncStorySms(f);
  const rows = f.store.read().conversations.peer; assert.equal(rows.length, 3);
  assert.equal(rows[0].type, 'transfer'); assert.deepEqual(rows[0].transfer, { amount: '2000.00', currency: 'CNY', note: '', recipientId: '@user', status: 'pending' });
  assert.equal(rows[0].text, marker); assert.equal(rows[0].source.projection, f.projection.key); assert.equal(rows[0].source.position, 0); assert.equal(rows[0].source.block, 0);
  assert.equal(rows[1].text, '这笔用于下周的材料。'); assert.equal(rows[1].type, undefined); assert.equal(rows[1].source.position, 1);
  assert.equal(rows[2].role, 'user'); assert.equal(rows[2].transfer.recipientId, 'peer'); assert.equal(rows[2].transfer.amount, '0.10');
  const group = f.store.read().groups[0]; assert.equal(f.store.read().conversations[group.id][0].type, undefined);
  assert.deepEqual(readStorySmsProjection(f.raw), f.projection); assert.equal(f.h.metadataSaves, 1); assert.equal(f.h.modelRequests.length, 0);
  const html = renderChat(f.store.read(), { ui: f.ui, busy: new Set() }); assert.match(html, /transfer-message/); assert.match(html, /CNY 2000.00/); assert.match(html, /data-transfer-id=/);
  const first = rows[0], saves = f.h.metadataSaves; assert.equal(await syncStorySms(f), false); assert.equal(f.h.metadataSaves, saves); assert.equal(f.store.read().conversations.peer[0].id, first.id);
});

for (const hostKind of ['native', 'luker']) for (const status of ['accepted', 'returned']) test(`${hostKind}: legacy story transfer is read without writes and settles the same ID as ${status}`, async () => {
  const f = fixture(hostKind, true), before = structuredClone(f.store.read()), saves = f.h.metadataSaves;
  const html = renderChat(f.store.read(), { ui: f.ui, busy: new Set() }); assert.match(html, /CNY 2000.00/); assert.match(html, /data-transfer-id="old-transfer"/);
  const context = await f.reader().readForContact('peer'); assert.equal(context.history[0].transferId, 'old-transfer'); assert.equal(context.history[0].recipientId, '@user'); assert.match(context.history[0].text, /待收款/);
  const ref = { app: 'messages', kind: 'message', conversationId: 'peer', messageId: 'old-transfer', batchKey: f.batch.key };
  const snapshot = captureFavorite(f.store.read(), ref).snapshot; assert.equal(snapshot.type, 'transfer'); assert.equal(snapshot.transfer.amount, '2000.00');
  assert.deepEqual(f.store.read(), before); assert.equal(f.h.metadataSaves, saves); assert.equal(await syncStorySms(f), false);
  await f.store.respondTransfer('peer', 'old-transfer', status, '@user', f.batch);
  const row = f.store.read().conversations.peer[0]; assert.equal(row.id, 'old-transfer'); assert.equal(row.transfer.status, status); assert.equal(row.text, marker); assert.deepEqual(row.source, before.conversations.peer[0].source); assert.equal(f.h.metadataSaves, saves + 1);
  assert.ok(storySmsBlockMatches(f.store.read(), 'peer', row, parseStorySms(f.raw)[0]));
  const cold = createPhoneStore({ target: f.target }); assert.deepEqual(cold.read().conversations.peer, [row]);
  const settled = renderChat(cold.read(), { ui: f.ui, busy: new Set() }); assert.match(settled, status === 'accepted' ? /已收下/ : /已退回/); assert.doesNotMatch(settled, /data-transfer-id=/);
  await assert.rejects(f.store.respondTransfer('peer', row.id, status, '@user', f.batch), /处理/);
  assert.equal((await f.reader().readForContact('peer')).story.some(item => item.text.includes(marker)), false, 'saved raw text still removes the accepted story block');
  await f.store.setInjectionEnabled(true); const backflow = createBackflowService({ target: f.target, store: f.store, modelClient: { complete() { assert.fail('story transfers remain excluded from main-floor backflow'); } } }); assert.equal(await backflow.prepare(), '');
  await f.store.deleteMessage('peer', row.id); assert.equal(await syncStorySms({ ...f, store: cold }), false); assert.deepEqual(cold.read().conversations.peer, []); assert.equal(f.h.modelRequests.length, 0);
});

test('story transfer amount parsing is exact, decimal-safe and private/source-scoped', async () => {
  const { storySmsTransfer } = await import('../src/story-sms.js'); assert.equal(typeof storySmsTransfer, 'function');
  const base = { id: 'same', role: 'assistant', text: marker, source: { kind: 'main-story', projection: 'p' } };
  for (const [text, amount] of [['【微信转账: 0002.5 元】', '2.50'], ['【微信转账：0.01元】', '0.01'], ['【微信转账：9007199254740993.01元】', '9007199254740993.01']]) assert.equal(storySmsTransfer({ ...base, text }, 'peer').transfer.amount, amount);
  for (const text of ['转给你2000元', '【微信转账：2000.00元】收好', '“【微信转账：2000.00元】”', '【微信转账：0元】', '【微信转账：-2元】', '【微信转账：2.001元】', '【微信转账：2,000元】', '【微信转账：1e2元】', '【微信转账：.5元】']) { const row = { ...base, text }; assert.equal(storySmsTransfer(row, 'peer'), row, text); }
  for (const row of [{ ...base, source: undefined }, { ...base, type: 'voice' }, { ...base, role: 'assistant', speakerId: 'other' }]) assert.equal(storySmsTransfer(row, 'peer'), row);
  assert.equal(storySmsTransfer(base, 'group', true), base); assert.equal(base.type, undefined);
});

test('legacy transfer failures roll back and past batches stay read-only', async () => {
  const f = fixture('native', true), before = structuredClone(f.store.read()); f.h.saveFailure = new Error('synthetic failure');
  await assert.rejects(f.store.respondTransfer('peer', 'old-transfer', 'accepted', '@user', f.batch), /保存/); assert.deepEqual(f.store.read(), before); f.h.saveFailure = null;
  const newBatch = { key: 'next', label: '下一楼' }, html = renderChat(f.store.read(), { ui: { ...f.ui, batch: newBatch, historyOpen: true }, busy: new Set() }); assert.match(html, /CNY 2000.00/); assert.doesNotMatch(html, /data-transfer-id=/);
  await assert.rejects(f.store.respondTransfer('peer', 'old-transfer', 'accepted', '@user', newBatch), /过去/); assert.deepEqual(f.store.read(), before);
});

test('one host display rule captures only whole positive transfer markers while retaining raw block captures', () => {
  const rule = storySmsRegex(), end = rule.findRegex.lastIndexOf('/'), re = new RegExp(rule.findRegex.slice(1, end), rule.findRegex.slice(end + 1));
  for (const [text, amount] of [[marker, '2000.00'], ['【微信转账: 0.01 元】', '0.01'], ['说明2000元。', undefined], [marker + '收好', undefined], ['【微信转账：0元】', undefined], ['【微信转账：1.001元】', undefined]]) {
    const raw = sms(text), match = [...raw.matchAll(re)][0]; assert.deepEqual(match.slice(1, 4), ['朋友甲', '朋友甲', text]); assert.equal(match[4], amount);
    assert.equal(raw.replace(re, rule.replaceString).includes(`data-transfer="${amount || ''}"`), true);
  }
  assert.match(rule.replaceString, /tmt-main-transfer/); assert.match(rule.replaceString, /手机会话/); assert.doesNotMatch(rule.replaceString, /待收款|已收下|已退回|animation/);
});

test('updated transfer CSS opts in only marked nodes, keeping old plain templates and group bubbles visible', () => {
  const rule = storySmsRegex(), css = rule.replaceString.match(/<style>([\s\S]*?)<\/style>/)[1];
  const selectors = [...css.matchAll(/([^{}]+)\{[^{}]*display:(?:none|flex)[^{}]*\}/g)].map(match => match[1].trim()).filter(selector => selector.includes(':not([data-transfer='));
  assert.equal(selectors.length, 2);
  for (const selector of selectors) { assert.match(selector, /^\.tmt-main-sms\[data-transfer\]:not\(\[data-transfer=""\]\)/); assert.match(selector, /data-conversation\^="群:/); assert.doesNotMatch(selector, /data-conversation\*=/); }
  const end = rule.findRegex.lastIndexOf('/'), re = new RegExp(rule.findRegex.slice(1, end), rule.findRegex.slice(end + 1));
  const group = [...sms(marker, ' 朋友甲 ', ' 群:材料组 ').matchAll(re)][0]; assert.equal(group[1], '群:材料组'); assert.equal(group[2], '朋友甲'); assert.equal(group[3], marker);
});
