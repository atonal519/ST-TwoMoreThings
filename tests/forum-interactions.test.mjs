import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader } from '../src/context.js';
import * as forumModule from '../src/forum.js';
import { readPhoneContext } from '../src/phone-context.js';
import { createPhoneImageService } from '../src/phone-images.js';

function setup() {
  const h = createHarness({ messages: [{ is_user: false, mes: 'LATEST_STORY_NO_MORE。<!-- QQJ-end | date=2031/4/8 | time=10:00 -->' }], metadata: { pocketPhone: {
    contacts: [{ id: 'lin', name: '私有联系人姓名' }], groups: [], conversations: { lin: [{ id: 'pm', role: 'user', text: 'PRIVATE_NEVER', batch: { key: '[-1]' } }] },
    userProfile: { name: 'PRIVATE_PROFILE', nickname: 'PRIVATE_NICK' }, forum: { posts: [{ id: 'p', title: '周末去哪里', author: '匿名路人', content: '附近有什么好去处。', comments: [{ author: '蓝纸', text: '河边不错。' }, { author: '风声', text: '我也去过。' }] }] },
    social: { npcs: [{ id: 'public', name: '公开账号' }], posts: [{ id: 'ins', authorId: 'public', text: 'OTHER_PUBLIC_PHONE。', comments: [] }] } } } });
  h.context.powerUserSettings = { persona_description: 'PRIVATE_PERSONA' };
  const target = h.host.captureChat(), removed = [], store = createPhoneStore({ target, removeImages: async paths => removed.push(...paths) }), calls = [], queries = [];
  target.readWorldInfo = async options => { queries.push(options); return '静态世界背景'; };
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => { throw Error('no actor recall'); } });
  let answer = { comments: [] };
  const modelClient = { complete: async request => { calls.push(request); return typeof answer === 'function' ? answer(request) : JSON.stringify(answer); } };
  const service = forumModule.createForumService({ store, contextReader: reader, modelClient });
  return { h, target, store, reader, removed, calls, queries, modelClient, service, answer: value => { answer = value; }, post: () => service.getPost('p') };
}

test('anonymous manual comments save once without generation or read-time migration, and publish only anonymous relations', async () => {
  const f = setup(); assert.equal(typeof f.service.publishComment, 'function');
  const before = structuredClone(f.store.read()), post = f.post(); assert.ok(post.comments[0].id); assert.deepEqual(f.store.read(), before); assert.equal(f.h.metadataSaves, 0);
  const row = await f.service.publishComment('p', { text: '手写不补句号', replyToId: post.comments[0].id });
  assert.equal(row.text, '手写不补句号'); assert.equal(row.userAuthored, true); assert.equal(row.replyToId, post.comments[0].id); assert.ok(row.publishedAt); assert.equal(f.calls.length, 0); assert.equal(f.h.metadataSaves, 1);
  const projection = readPhoneContext(f.store.read(), { publicOnly: true }).find(item => item.source.id === row.id);
  assert.equal(projection.author.name, row.author); assert.equal(projection.replyToId, row.replyToId); assert.equal('personId' in projection.author, false);
  for (const marker of ['PRIVATE_PROFILE', 'PRIVATE_NICK', '@user', 'userAuthored', 'identityOwnerId']) assert.equal(JSON.stringify(projection).includes(marker), false);
  assert.ok(f.store.read().forum.posts[0].comments.every(comment => comment.id));
});

test('one anonymous more call links old and earlier same-batch floors and does not expose the writer or private context', async () => {
  const f = setup(); const own = await f.service.publishComment('p', { text: '有没有近一点的地方？' });
  f.answer({ comments: [{ key: 'a', author: '红叶', text: '可以去街角公园', replyToId: own.id }, { author: '石头', text: '那边最近在修步道。', replyToId: 'a' }] });
  await f.service.loadMore('p'); assert.equal(f.calls.length, 1); assert.equal(f.h.metadataSaves, 2);
  const input = JSON.parse(f.calls[0].messages[0].content); assert.ok(input.continuation.replyTargets.includes(own.id)); assert.ok(JSON.stringify(input.phoneContext).includes('OTHER_PUBLIC_PHONE'));
  for (const marker of ['PRIVATE_NEVER', 'PRIVATE_PROFILE', 'PRIVATE_NICK', 'PRIVATE_PERSONA', 'LATEST_STORY_NO_MORE', '@user', 'userAuthored', 'identityOwnerId', '"role":"user"']) assert.equal(JSON.stringify(input).includes(marker), false, marker);
  assert.equal(JSON.stringify(f.queries).includes('LATEST_STORY_NO_MORE'), false);
  const a = f.post().comments.at(-2), b = f.post().comments.at(-1); assert.equal(a.text, '可以去街角公园。'); assert.equal(a.replyToId, own.id); assert.equal(b.replyToId, a.id); assert.ok(a.publishedAt);
});

test('reply requests preserve complete routing IDs inside 8k and public phone 20/6k without truncating saved text', async () => {
  const f = setup(); f.h.context.chatMetadata.pocketPhone.forum.posts[0].content = '长正文'.repeat(5000);
  const own = await f.service.publishComment('p', { text: '😂'.repeat(5000), replyToId: f.post().comments[0].id });
  f.answer({ comments: [{ author: '路人', text: '正常回应。', replyToId: own.id }] }); await f.service.loadMore('p');
  const input = JSON.parse(f.calls[0].messages[0].content); assert.ok(JSON.stringify(input.continuation).length <= 8000); assert.equal(input.continuation.comments.find(c => c.id === own.id).id, own.id); assert.ok(input.continuation.comments.every(c => c.text.isWellFormed()));
  assert.ok(input.phoneContext.length <= 20); assert.ok(JSON.stringify(input.phoneContext).length <= 6000); assert.equal(f.post().comments.find(c => c.id === own.id).text.length, 10000);
});

test('new manual comments and draft-independent post fields survive in-flight results; errors never predelete or revive a refreshed post', async () => {
  const f = setup(); const first = await f.service.publishComment('p', { text: '先发的一条' }); let resolve;
  await f.store.updateForum(data => ({ ...data, posts: data.posts.map(p => ({ ...p, image: { description: '河流' } })) }));
  f.answer(() => new Promise(done => { resolve = done; })); const pending = f.service.loadMore('p'); while (!resolve) await new Promise(done => setTimeout(done, 0));
  const later = await f.service.publishComment('p', { text: '后来的一条' }); await f.store.updateForum(data => ({ ...data, posts: data.posts.map(p => ({ ...p, image: { description: '河流', path: '/user/images/shared.png' } })) }));
  resolve(JSON.stringify({ comments: [{ author: '黄纸', text: '正常接续。', replyToId: first.id }] })); await pending; assert.ok(f.post().comments.some(c => c.id === later.id)); assert.equal(f.post().image.path, '/user/images/shared.png');
  const before = structuredClone(f.store.read()); f.answer({ comments: [{ author: '错误楼层', text: '不能保存。', replyToId: 'foreign-thread' }] }); await assert.rejects(f.service.loadMore('p')); assert.deepEqual(f.store.read(), before);
  f.answer({ comments: [{ author: first.author, text: '不能代写保留马甲。' }] }); await assert.rejects(f.service.loadMore('p')); assert.deepEqual(f.store.read(), before);
  f.answer({ comments: [{ author: '正常', text: '保存会失败。' }] }); f.h.saveFailure = Error('save fail'); await assert.rejects(f.service.loadMore('p'), /保存失败/); assert.deepEqual(f.store.read(), before); f.h.saveFailure = null;
  f.answer(() => new Promise(done => { resolve = done; })); resolve = null; const stale = f.service.loadMore('p'); while (!resolve) await new Promise(done => setTimeout(done, 0)); await f.store.replaceForum([]); resolve(JSON.stringify({ comments: [{ author: '黄纸', text: '不复活旧帖。' }] })); await assert.rejects(stale, /更新|不存在/); assert.equal(f.store.read().forum.posts.length, 0);
});

test('forum pictures are opt-in anonymous scenery and shared image lifecycle survives replacement', async () => {
  const f = setup(); f.answer({ posts: [{ title: '河边', author: '匿名', content: '看看河边', image: { description: '河边的旧长椅', path: '/model-ignored' }, comments: [] }] }); await f.service.refresh();
  const post = f.store.read().forum.posts[0]; assert.deepEqual(post.image, { description: '河边的旧长椅' }); assert.equal(f.calls.length, 1);
  f.answer({ prompt: 'river, bench', characters: [] }); let drawn = 0;
  const images = createPhoneImageService({ store: f.store, modelClient: f.modelClient, apiProvider: () => ({ apiVersion: 1, getBackendStatus: () => ({ configured: true }), getCharacters: () => ({ characters: [{ name: 'PRIVATE_LIBRARY_NAME', tag: 'private' }] }), generate: async () => { drawn++; return { path: '/user/images/forum.png', seed: 1 }; } }), files: { remove: async paths => f.removed.push(...paths) } });
  assert.equal(typeof images.generateForum, 'function'); await images.generateForum(post.id); await images.generateForum(post.id); assert.equal(drawn, 1); assert.equal(f.calls.length, 2);
  const recipe = JSON.parse(f.calls[1].messages[0].content); for (const marker of ['PRIVATE_PROFILE','PRIVATE_NICK','PRIVATE_LIBRARY_NAME']) assert.equal(JSON.stringify(recipe).includes(marker), false);
  const projection = readPhoneContext(f.store.read(), { publicOnly: true }).find(row => row.source.id === post.id);
  assert.deepEqual(projection.image, { description: '河边的旧长椅' }); assert.equal(JSON.stringify(projection).includes('/user/images/'), false); assert.equal('personId' in projection.author, false);
  await f.store.replaceForum([]); assert.deepEqual(f.removed, ['/user/images/forum.png']);
});

test('more waits for the existing save queue and never sends a manual comment whose save rolls back', async () => {
  const f = setup(); let release, entered;
  f.target.saveMetadata = async () => { entered = true; await new Promise(done => { release = done; }); throw Error('save failed'); };
  const writing = f.service.publishComment('p', { text: 'UNSAVED_NEVER' }); const rejected = assert.rejects(writing, /save failed/);
  while (!entered) await new Promise(done => setTimeout(done, 0));
  f.answer({ comments: [] }); const more = f.service.loadMore('p'); await new Promise(done => setTimeout(done, 0)); assert.equal(f.calls.length, 0);
  release(); await rejected; assert.equal(await more, null); assert.equal(JSON.stringify(f.calls[0]).includes('UNSAVED_NEVER'), false); assert.equal(f.store.read().forum.posts[0].comments.length, 2);
});

test('same-batch keys cannot shadow explicit old floor or post IDs and duplicate keys do not guess a parent', async () => {
  const f = setup(), old = f.post().comments[0].id;
  f.answer({ comments: [{ key: old, author: '甲', text: '同名临时key。' }, { author: '乙', text: '明确回旧楼。', replyToId: old }, { key: 'p', author: '丙', text: '又一个同名key。' }, { author: '丁', text: '明确回帖子。', replyToId: 'p' }, { key: 'duplicate', author: '戊', text: '正常一条。' }, { key: 'duplicate', author: '己', text: '正常另一条。' }, { author: '庚', text: '不猜重复key。', replyToId: 'duplicate' }] });
  await f.service.loadMore('p'); const comments = f.post().comments;
  assert.equal(comments.length, 8); assert.equal(comments[3].replyToId, old); assert.equal('replyToId' in comments[5], false); assert.equal(comments.some(row => row.author === '庚'), false);
});

test('each published comment gets a fixed random anonymous nickname and replies keep IDs across different names', async () => {
  const f = setup();
  const a = await f.service.publishComment('p', { text: '第一条手写' });
  const b = await f.service.publishComment('p', { text: '第二条手写', replyToId: a.id });
  assert.notEqual(a.author, b.author); assert.equal(b.replyToId, a.id);
  assert.equal(f.service.getPost('p').comments.find(row => row.id === a.id).author, a.author);
  f.answer({ comments: [{ author: '其他网友', text: '正常接续。', replyToId: b.id }, { author: a.author, text: '不能代写第一个网名。' }, { author: b.author, text: '不能代写第二个网名。' }] });
  await f.service.loadMore('p'); assert.equal(f.post().comments.length, 5);
  const input = JSON.parse(f.calls[0].messages[0].content).continuation;
  assert.equal('reservedAuthors' in input, false); assert.equal('reservedAuthor' in input, false);
  assert.equal(JSON.stringify(input).includes('userAuthored'), false); assert.equal(JSON.stringify(input).includes('identityOwnerId'), false);
});

test('new comments in the first of fifteen same-clock posts enter the recent public window without exposing metadata time', async () => {
  const f = setup(); f.answer({ posts: Array.from({ length: 15 }, (_, i) => ({ title: `帖子${i}`, author: '匿名', content: '同一剧情钟下的论坛帖。', comments: Array.from({ length: 3 }, (_, j) => ({ author: `网友${j}`, text: '初始评论。' })) })) });
  await f.service.refresh(); const postId = f.store.read().forum.posts[0].id;
  await new Promise(done => setTimeout(done, 2)); const own = await f.service.publishComment(postId, { text: '后来刚发布的匿名评论' });
  const projection = readPhoneContext(f.store.read(), { publicOnly: true });
  assert.ok(projection.some(row => row.source.id === own.id)); assert.equal(JSON.stringify(projection).includes('createdAt'), false);
});

test('creation timestamps only break story-time ties and do not replace relationship ranking or leak to public DTOs', () => {
  const state = { contacts: [{ id: 'a', name: '甲' }], groups: [], conversations: {}, social: { npcs: [], posts: [{ id: 'self', authorId: 'a', text: '本人可见的公开内容。', publishedAt: '2031-04-08 10:00', createdAt: '2020-01-01T00:00:00.000Z', comments: [] }] }, forum: { posts: [
    { id: 'future', author: '匿名甲', content: '剧情时间较新。', publishedAt: '2031-04-09 10:00', createdAt: '2000-01-01T00:00:00.000Z' },
    { id: 'tie-new', author: '匿名乙', content: '同剧情钟后创建。', publishedAt: '2031-04-08 10:00', createdAt: '2099-01-01T00:00:00.000Z' },
    { id: 'tie-old', author: '匿名丙', content: '同剧情钟早创建。', publishedAt: '2031-04-08 10:00', createdAt: '2021-01-01T00:00:00.000Z' },
  ] } };
  const rows = readPhoneContext(state, { publicOnly: true }); assert.deepEqual(rows.map(row => row.source.id), ['future', 'tie-new', 'tie-old', 'self']);
  assert.equal(readPhoneContext(state, { targetIds: ['a'] })[0].source.id, 'self');
  assert.equal(JSON.stringify(rows).includes('createdAt'), false); assert.ok(rows.length <= 20 && JSON.stringify(rows).length <= 6000);
});
