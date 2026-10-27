import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader } from '../src/context.js';
import * as implementation from '../src/liangshi.js';
import { readPhoneContext } from '../src/phone-context.js';

function setup() {
  const h = createHarness({ metadata: { pocketPhone: { contacts: [{ id: 'alias', name: '本人别号', identityOwnerId: '@user' }], groups: [], conversations: {}, userProfile: { name: '本人', nickname: '小琥珀' }, liangshi: {
    accounts: [{ id: 'self', ownerId: '@user', name: '旧昵称', handle: 'self' }, { id: 'a', name: '林间风', handle: 'lin' }, { id: 'b', name: '纸盒', handle: 'box' }],
    posts: [{ id: 'p', authorId: 'self', userAuthored: true, text: '今晚在街口看见一只猫。', publishedAt: '2031/4/8 10:00', comments: [{ id: 'c1', authorId: 'a', text: '是那只橘猫吗？' }, { id: 'c2', authorId: 'b', text: '它每天都在这里😂' }], reposts: [] }], userPostIds: ['p'], feedIds: [], topics: [] }, social: { posts: [{ id: 'ins', authorId: 'alias', text: '正式公开素材', comments: [] }], npcs: [] } } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target }), calls = [], queries = [];
  target.readWorldInfo = async options => { queries.push(options); return '静态世界'; };
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  let answer = { accounts: [], comments: [] };
  const service = implementation.createLiangshiService({ store, contextReader: reader, modelClient: { complete: async request => { calls.push(request); return typeof answer === 'function' ? answer(request) : JSON.stringify(answer); } } });
  return { h, target, store, calls, queries, service, answer: value => { answer = value; }, post: () => service.getPost('p') };
}
const response = (id, body = 'AI回应') => ({ accounts: [{ key: 'new', name: '林间风', handle: 'lin' }], comments: [{ authorKey: 'new', replyToId: id, text: body }] });

test('manual replies use the profile account, save once each, then generate one batch for only pending replies', async () => {
  const f = setup(); assert.equal(typeof f.service.publishReply, 'function');
  const a = await f.service.publishReply('p', { replyToId: 'c1', text: '对，就是它。' });
  const b = await f.service.publishReply('p', { replyToId: 'c2', text: '明天带点猫粮。' });
  assert.equal(f.calls.length, 0); assert.equal(f.h.metadataSaves, 2);
  assert.equal(a.authorId, 'self'); assert.equal(a.userAuthored, true); assert.equal(a.replyToAuthorId, 'a');
  f.answer(response(a.id)); await f.service.generateReplies('p');
  const input = JSON.parse(f.calls[0].messages[0].content);
  assert.deepEqual(input.replies.map(row => row.id), [a.id, b.id]); assert.equal(input.currentAccount.name, '小琥珀'); assert.equal('story' in input, false);
  assert.equal(input.phoneContext.some(row => row.source.app === 'liangshi'), false); assert.equal(f.h.metadataSaves, 3);
  assert.equal(f.post().comments.filter(row => row.replyToId === a.id).length, 1);
  assert.equal(f.post().comments.find(row => row.id === b.id).replyHandled, true);
  assert.equal(await f.service.generateReplies('p'), null); assert.equal(f.calls.length, 1);
  const c = await f.service.publishReply('p', { replyToId: 'c1', text: '又看到它了' }); f.answer(response(c.id)); await f.service.generateReplies('p');
  assert.deepEqual(JSON.parse(f.calls[1].messages[0].content).replies.map(row => row.id), [c.id]);
});

test('regeneration replaces only the last batch, keeps user children and target author after ordinary pool pruning', async () => {
  const f = setup(); const a = await f.service.publishReply('p', { replyToId: 'c1', text: '本人回复' });
  f.answer({ accounts: [{ key: 'a3', name: '橘子汽水', handle: 'orange' }], comments: [{ authorKey: 'a3', replyToId: a.id, text: 'OLD_AI_BATCH' }] }); await f.service.generateReplies('p');
  const ai = f.post().comments.at(-1); const child = await f.service.publishReply('p', { replyToId: ai.id, text: '本人保留的子回复' });
  f.answer(response(a.id, 'NEW_AI_BATCH')); await f.service.generateReplies('p', { regenerate: true });
  const input = JSON.stringify(JSON.parse(f.calls[1].messages[0].content)); assert.equal(input.includes('OLD_AI_BATCH'), false); assert.equal(JSON.stringify(f.queries[1]).includes('OLD_AI_BATCH'), false);
  assert.ok(f.post().comments.some(row => row.id === child.id)); assert.equal(f.post().comments.some(row => row.id === ai.id), false);
  assert.equal(f.post().comments.find(row => row.id === child.id).replyHandled, undefined);
  f.answer({ accounts: [{ key: 'x', name: '别处', handle: 'else' }], posts: [{ authorKey: 'x', text: '新广场' }] }); await f.service.refresh();
  assert.ok(f.store.read().liangshi.accounts.some(row => row.id === ai.authorId));
  const row = readPhoneContext(f.store.read(), { publicOnly: true }).find(row => row.source.id === child.id);
  assert.equal(row.replyToId, ai.id); assert.equal(row.replyToAuthor.id, ai.authorId); assert.equal(JSON.stringify(row).includes('OLD_AI_BATCH'), false);
});

test('an in-flight batch merges later manual replies and interactions, while save/model failures preserve the previous batch', async () => {
  const f = setup(); const a = await f.service.publishReply('p', { replyToId: 'c1', text: '先发' });
  let resolve; f.answer(() => new Promise(done => { resolve = done; })); const pending = f.service.generateReplies('p');
  while (!resolve) await new Promise(done => setTimeout(done, 0));
  const b = await f.service.publishReply('p', { replyToId: 'c2', text: '后来新发' });
  await f.store.updateLiangshi(data => ({ ...data, posts: data.posts.map(p => ({ ...p, userLiked: true, comments: [...p.comments, { id: 'extra', authorId: 'b', text: '后来加载' }] })) }));
  resolve(JSON.stringify(response(a.id))); await pending;
  assert.equal(f.post().userLiked, true); assert.ok(f.post().comments.some(row => row.id === 'extra')); assert.equal(f.post().comments.find(row => row.id === b.id).replyHandled, undefined);
  const before = structuredClone(f.store.read()); f.answer('not-json'); await assert.rejects(f.service.generateReplies('p', { regenerate: true })); assert.deepEqual(f.store.read(), before);
  f.answer(response(a.id)); f.h.saveFailure = Error('save failure'); await assert.rejects(f.service.generateReplies('p', { regenerate: true }), /保存失败/); assert.deepEqual(f.store.read(), before);
});

test('wrong targets, user ownership and malformed empty responses cannot create AI comments', async () => {
  const f = setup(); const a = await f.service.publishReply('p', { replyToId: 'c1', text: '本人' });
  const before = structuredClone(f.store.read());
  for (const value of [response('c1'), { accounts: [{ key: 'u', handle: 'alias', name: '本人别号', contactId: 'alias' }], comments: [{ authorKey: 'u', replyToId: a.id, text: '不能代写' }] }, { comments: [{ authorId: 'self', replyToId: a.id, text: '不能代本人' }] }, { comments: [{}] }, {}]) {
    f.answer(value); await assert.rejects(f.service.generateReplies('p')); assert.deepEqual(f.store.read(), before);
  }
  f.answer({ comments: [] }); assert.equal(await f.service.generateReplies('p'), null); assert.equal(f.post().comments.length, 3);
  assert.deepEqual(f.post().replyBatch.inputIds, [a.id]); assert.deepEqual(f.post().replyBatch.commentIds, []);
  const saves = f.h.metadataSaves, requests = f.calls.length; assert.equal(await f.service.generateReplies('p'), null); assert.equal(f.h.metadataSaves, saves); assert.equal(f.calls.length, requests);
  f.answer(response(a.id, '空批后仍可重新生成')); await f.service.generateReplies('p', { regenerate: true }); assert.equal(f.post().comments.at(-1).text, '空批后仍可重新生成。');
  await assert.rejects(f.service.publishReply('p', { replyToId: 'missing', text: '错误目标' }));
  await f.store.updateLiangshi(data => ({ ...data, posts: data.posts.map(p => ({ ...p, userAuthored: false })) }));
  await assert.rejects(f.service.publishReply('p', { replyToId: 'c1', text: '不扩陌生帖' }));
});

test('regeneration preserves earlier AI batches and rejects a changed source instead of replacing it', async () => {
  const f = setup(); const a = await f.service.publishReply('p', { replyToId: 'c1', text: '第一批本人回复' });
  f.answer(response(a.id, '第一批AI保留')); await f.service.generateReplies('p');
  const b = await f.service.publishReply('p', { replyToId: 'c2', text: '第二批本人回复' });
  f.answer(response(b.id, '第二批AI待换')); await f.service.generateReplies('p');
  f.answer(response(b.id, '第二批AI新稿')); await f.service.generateReplies('p', { regenerate: true });
  assert.equal(f.post().comments.some(row => row.text === '第一批AI保留。'), true); assert.equal(f.post().comments.some(row => row.text === '第二批AI待换。'), false);
  let resolve; f.answer(() => new Promise(done => { resolve = done; })); const pending = f.service.generateReplies('p', { regenerate: true });
  while (!resolve) await new Promise(done => setTimeout(done, 0));
  await f.service.editUser('p', { text: '本人修改了原帖' }); const before = structuredClone(f.store.read());
  resolve(JSON.stringify(response(b.id, '不能存回改过的帖'))); await assert.rejects(pending, /修改/); assert.deepEqual(f.store.read(), before);
});

test('new AI replies carry the operation clock and enter the recent public window ahead of older public posts', async () => {
  const f = setup(); f.target.messages.push({ is_user: false, mes: '普通背景。<!-- QQJ-end | date=2031/4/8 | time=10:00 -->' });
  f.h.context.chatMetadata.pocketPhone.forum = { posts: Array.from({ length: 20 }, (_, i) => ({ id: `old${i}`, author: '旧路人', content: `一周前的公开内容${i}`, publishedAt: '2031/4/1 09:00', comments: [] })) };
  const reply = await f.service.publishReply('p', { replyToId: 'c1', text: '新的本人回复' }); f.answer(response(reply.id)); await f.service.generateReplies('p');
  const ai = f.post().comments.at(-1); assert.ok(ai.publishedAt);
  assert.ok(readPhoneContext(f.store.read(), { publicOnly: true }).some(row => row.source.id === ai.id));
});

test('long replies and parent chains fit the complete continuation budget without cutting routing IDs or mutating stored text', async () => {
  const f = setup(); await f.store.updateLiangshi(data => ({ ...data, posts: data.posts.map(p => ({ ...p, text: '🌙'.repeat(5000), comments: p.comments.map(c => ({ ...c, text: '父正文'.repeat(4000) })) })) }));
  const a = await f.service.publishReply('p', { replyToId: 'c1', text: '😂'.repeat(6000) }); f.answer(response(a.id)); await f.service.generateReplies('p');
  const input = JSON.parse(f.calls[0].messages[0].content), { post, original, accounts, currentAccount, replies, parents } = input;
  assert.ok(JSON.stringify({ post, ...(original ? { original } : {}), accounts, currentAccount, replies, parents, ...(input.excerpted ? { excerpted: true } : {}) }).length <= 8000);
  assert.equal(replies[0].id, a.id); assert.equal(replies[0].replyToId, 'c1'); assert.equal(replies[0].text.isWellFormed(), true); assert.equal(f.post().comments.find(c => c.id === a.id).text.length, 12000);
});
