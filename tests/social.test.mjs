import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createApiSettings, createModelClient } from '../src/api.js';
import { createContextReader } from '../src/context.js';
import { createSocialService, getSocialAuthor, readSocialPosts, readSocialFeed } from '../src/social.js';

async function setup(count = 5, bridge = null) {
  const h = createHarness({
    metadata: { foreign: { keep: true } },
    messages: [{ name: '林舟', mes: '午后正在街边散步。<!-- QQJ-end | date=2026年10月19日 | weekday=周一 | time=14:20 -->' }],
    settings: { qianqianjie: { apiUrl: 'https://example.invalid/v1', apiKey: 'test', apiModel: 'm' } },
  });
  const store = createPhoneStore({ target: h.host.captureChat() });
  await store.upsertContacts(Array.from({ length: count }, (_, i) => ({ id: `friend-${i}`, name: `朋友${i}`, nickname: `昵称${i}`, personality: '随和',
    ...(bridge ? { source: { kind: 'qqj', entityId: `entity-${i}` } } : {}),
  })));
  const contextReader = createContextReader({ target: h.host.captureChat(), store, qqjBridgeProvider: () => bridge });
  const modelClient = createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) });
  const create = () => createSocialService({ store, contextReader, modelClient, random: () => 0 });
  h.completion = (_path, init) => {
    const input = JSON.parse(JSON.parse(init.body).messages[1].content);
    return { choices: [{ message: { content: JSON.stringify({
      npcs: input.authors.filter(author => author.kind === 'npc').map(author => ({ id: author.id, name: '花店店主', description: '街角花店的店主。' })),
      posts: input.authors.map(author => ({ authorId: author.id, text: `${author.name || '店主'}的午后。`, publishedAt: '2026-10-19 14:10',
        image: author.kind === 'npc' ? undefined : { description: '窗边的一杯茶。', path: 'https://example.invalid/model-image.png' },
        likes: 12, reposts: 2, commentsCount: 3, comments: [{ name: '路过的人', text: '下午好。' }],
      })),
    }) } }] };
  };
  return { h, store, create, service: create() };
}

test('feed chooses five friends, replaces the previous batch and its profile history, and preserves other metadata', async () => {
  const { h, store, service } = await setup(7);
  const before = h.metadataSaves;
  await service.refresh();
  const first = structuredClone(store.read().social.posts);
  assert.equal(first.length, 5);
  assert.equal(new Set(first.map(post => post.authorId)).size, 5);
  assert.ok(first.every(post => store.read().contacts.some(person => person.id === post.authorId)));
  assert.equal(h.modelRequests.length, 1);
  assert.equal(h.metadataSaves, before + 1);
  assert.equal(JSON.parse(h.modelRequests[0].body.messages[1].content).authors.length, 5);
  assert.equal(first[0].publishedAt, '2026-10-19 14:10');
  assert.equal(first[0].batch.clock.time, '14:20', '生成卡口不随发布时间移动');
  assert.deepEqual([first[0].likes, first[0].reposts, first[0].commentsCount], [12, 2, 3]);
  assert.deepEqual(first[0].comments, [{ name: '路过的人', text: '下午好。' }]);
  assert.deepEqual(first[0].image, { description: '窗边的一杯茶。' }, 'text generation cannot supply a generated image path');
  await store.updateSocial(social => ({ ...social, posts: [...social.posts, { id: 'old-history', authorId: first[0].authorId, text: '过去的日常。' }],
    npcs: [{ id: 'old-npc', name: '旧路人' }], expandedAuthors: [first[0].authorId] }));
  await service.refresh();
  assert.equal(h.modelRequests.length, 2);
  assert.equal(store.read().social.posts.length, 5);
  assert.equal(store.read().social.posts.some(post => first.some(old => old.id === post.id) || post.id === 'old-history'), false);
  assert.deepEqual(store.read().social.npcs, []);
  assert.equal(store.read().social.expandedAuthors, undefined);
  assert.equal(store.read().social.feedIds.length, 5);
  assert.ok(store.read().social.feedIds.every(id => !first.some(post => post.id === id)));
  assert.deepEqual(h.context.chatMetadata.foreign, { keep: true });
  assert.equal(h.context.chat.length, 1);
  assert.equal(h.promptSlots.size, 0);
});

test('four friends are supplemented by one stable NPC without inserting it in contacts', async () => {
  const { h, store, service } = await setup(4);
  await service.refresh();
  const state = store.read(), npc = state.social.npcs[0];
  assert.equal(state.contacts.length, 4);
  assert.equal(state.social.npcs.length, 1);
  assert.ok(npc.id.startsWith('npc:'));
  assert.deepEqual({ name: npc.name, description: npc.description }, { name: '花店店主', description: '街角花店的店主。' });
  assert.equal(state.social.posts.length, 5);
  assert.equal(state.social.posts.filter(post => post.authorId === npc.id).length, 1);
  assert.equal(state.social.posts.find(post => post.authorId === npc.id).image, undefined);
  assert.equal(getSocialAuthor(state, npc.id).kind, 'npc');
  assert.equal(service.getAuthor('friend-0').nickname, '昵称0');
  assert.equal(h.modelRequests.length, 1);
});

test('foreign post and comment translations survive generation, storage and read-only queries', async () => {
  const { h, store, service } = await setup(1);
  h.completion = { choices: [{ message: { content: JSON.stringify({ posts: [{ authorId: 'friend-0',
    text: 'The bakery opened early today.', translation: '今天面包店开门很早。',
    comments: [{ name: '路人', text: 'The bread smells wonderful.', translation: '面包闻起来真香。' }],
  }] }) } }] };
  await service.refresh();
  const post = service.readPosts({ authorId: 'friend-0' })[0];
  assert.equal(post.translation, '今天面包店开门很早。');
  assert.equal(post.comments[0].translation, '面包闻起来真香。');
  assert.deepEqual(store.read().social.posts[0], post);
});

test('explicit author refresh appends posts without changing the home feed and can be requested again', async () => {
  const { h, store, service, create } = await setup();
  await service.refresh();
  const feedIds = [...store.read().social.feedIds];
  const authorId = store.read().social.posts[0].authorId;
  h.completion = { choices: [{ message: { content: JSON.stringify({ posts: [
    { authorId, text: '回家的路上看见落叶。', publishedAt: '2026-08-01 18:10', likes: 1 },
    { authorId, text: '窗台上的花开了。', publishedAt: '2026-10-18 11:20', comments: [{ name: '朋友', text: '真好。' }] },
  ] }) } }] };
  const result = await service.generateAuthor(authorId);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map(post => post.publishedAt), ['2026-10-19 14:10', '2026-10-18 11:20', '2026-08-01 18:10']);
  assert.equal(store.read().social.posts.length, 7);
  assert.deepEqual(store.read().social.feedIds, feedIds);
  const input = JSON.parse(h.modelRequests[1].body.messages[1].content);
  assert.deepEqual(input.authors.map(author => author.id), [authorId]);
  assert.equal(input.existingPosts.length, 1, 'author generation receives its saved posts to avoid repeating them');
  assert.equal(input.historyBefore, '2026-10-19 14:10');
  const before = h.metadataSaves;
  await create().generateAuthor(authorId);
  assert.equal(h.modelRequests.length, 3, 'only explicit author refreshes generate new posts');
  assert.equal(h.metadataSaves, before + 1);
  assert.equal(service.readPosts({ authorId }).length, 5);
  assert.equal(JSON.parse(h.modelRequests[2].body.messages[1].content).historyBefore, '2026-08-01 18:10');
});

test('sorting uses publication time for new and legacy records, and preserves ties without changing saved posts', () => {
  const posts = [
    { id: 'latest', authorId: 'a', publishedAt: '2026-10-19 14:10', createdAt: '2020-01-01' },
    { id: 'old', authorId: 'a', publishedAt: '2026-07-08 12:00', createdAt: '2030-01-01' },
    { id: 'middle', authorId: 'a', storyDate: '2026年10月18日', timeLabel: '20:00' },
    { id: 'tie-1', authorId: 'a', publishedAt: '2026-10-19 14:10' },
    { id: 'tie-2', authorId: 'a', publishedAt: '2026-10-19 14:10' },
  ];
  const state = { social: { posts } }, before = structuredClone(state);
  assert.deepEqual(readSocialPosts(state).map(post => post.id), ['latest', 'tie-1', 'tie-2', 'middle', 'old']);
  assert.deepEqual(state, before);
});

test('home keeps the selected authors and resolves each latest saved publication after history is added', () => {
  const state = { social: { posts: [
    { id: 'a-first', authorId: 'a', publishedAt: '2026-10-18 12:00' },
    { id: 'b-new', authorId: 'b', publishedAt: '2026-10-19 12:00' },
    { id: 'a-new', authorId: 'a', publishedAt: '2026-10-19 13:00' },
    { id: 'a-old', authorId: 'a', publishedAt: '2026-09-01 12:00' },
    { id: 'unselected', authorId: 'c', publishedAt: '2026-10-19 14:00' },
  ], feedIds: ['a-first', 'b-new'] } };
  assert.deepEqual(readSocialFeed(state).map(post => post.id), ['a-new', 'b-new']);
});

test('feed input includes latest posts for newly selected friends outside the previous home selection', async () => {
  const { h, service, store } = await setup(7);
  await store.updateSocial(social => ({ ...social, posts: [
    { id: 'previous-home', authorId: 'friend-0', text: '上次主页的作者。', publishedAt: '2026-10-18 10:00' },
    { id: 'other-history', authorId: 'friend-1', text: '新入选作者也有历史。', publishedAt: '2026-10-18 11:00' },
  ], feedIds: ['previous-home'] }));
  await service.refresh();
  const input = JSON.parse(h.modelRequests[0].body.messages[1].content);
  assert.equal(input.existingPosts.some(post => post.authorId === 'friend-1'), true);
  assert.equal(input.existingPosts.some(post => post.authorId === 'friend-0'), false);
});

test('history without known publication times supplies the story clock as its boundary', async () => {
  const { h, service } = await setup(1);
  await service.generateAuthor('friend-0');
  const input = JSON.parse(h.modelRequests[0].body.messages[1].content);
  assert.equal(input.historyBefore, '2026年10月19日 14:20');
});

test('history boundary uses the oldest comparable date instead of an undated clock time', async () => {
  const { h, service, store } = await setup(1);
  await store.updateSocial(social => ({ ...social, posts: [
    { id: 'dated', authorId: 'friend-0', text: '已知日期。', publishedAt: '2026-08-01 12:00' },
    { id: 'undated', authorId: 'friend-0', text: '只有几点。', publishedAt: '09:30' },
  ] }));
  await service.generateAuthor('friend-0');
  assert.equal(JSON.parse(h.modelRequests[0].body.messages[1].content).historyBefore, '2026-08-01 12:00');
});

test('an unambiguous single post can use author_id and a publication field alias', async () => {
  const { h, service } = await setup(1);
  h.completion = { choices: [{ message: { content: JSON.stringify({ author_id: 'friend-0', caption: '只有一条也保留。', published_at: '2026-08-01 12:00' }) } }] };
  const posts = await service.generateAuthor('friend-0');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].authorId, 'friend-0');
  assert.equal(posts[0].text, '只有一条也保留。');
  assert.equal(posts[0].publishedAt, '2026-08-01 12:00');
});

test('author generation keeps clear format variants and missing optional times instead of losing usable posts', async () => {
  const { h, service, store } = await setup(1);
  await service.refresh();
  h.completion = { choices: [{ message: { content: '```json\n' + JSON.stringify([
    { caption: '一段有效旧日常。', date: '2026年9月8日', time: '12:00' },
    { content: '没有时间也保留正文。', author_id: 'friend-0' },
    { authorId: 123, text: '给了无法确认的作者编号，不能当成省略。' },
    { authorId: 'wrong-person', text: '不能猜归属。', publishedAt: '2026-09-01 09:00' },
  ]) + '\n```' } }] };
  const saved = await service.generateAuthor('friend-0');
  assert.equal(saved.length, 3);
  assert.equal(saved[0].text, '朋友0的午后。');
  assert.equal(saved[1].text, '一段有效旧日常。');
  assert.equal(saved[2].text, '没有时间也保留正文。');
  assert.equal(saved[2].publishedAt, '');
  assert.equal(store.read().social.posts.some(post => post.authorId === 'wrong-person'), false);
});

test('usable posts survive unrelated invalid authors and optional fields while identities remain exact', async () => {
  const { h, store, service } = await setup(1);
  h.completion = { choices: [{ message: { content: JSON.stringify({ posts: [
    { authorId: 'invented-author', text: '不能归属。' },
    { authorId: 'friend-0', content: '有效正文。', likes: -3, reposts: '4', commentsCount: 'bad', comments: [
      { name: '旁观者', text: '不错。' }, { name: '假身份', authorId: 'invented-author', text: '不应存入。' },
    ] },
  ] }) } }] };
  await service.refresh();
  const posts = store.read().social.posts;
  assert.equal(posts.length, 1);
  assert.equal(posts[0].authorId, 'friend-0');
  assert.equal(posts[0].text, '有效正文。');
  assert.deepEqual([posts[0].likes, posts[0].reposts, posts[0].commentsCount], [0, 4, 1]);
  assert.deepEqual(posts[0].comments, [{ name: '旁观者', text: '不错。' }]);
  assert.equal(store.read().social.npcs.length, 0, 'unnamed NPC slots do not become saved people');
});

test('empty or unowned author replies preserve saved posts', async () => {
  const { h, store, service } = await setup();
  await service.refresh();
  const before = structuredClone(store.read().social);
  h.completion = { choices: [{ message: { content: '{"posts":[{"authorId":"other","text":"不能归属"}]}' } }] };
  await assert.rejects(service.generateAuthor('friend-0'), /动态/);
  assert.deepEqual(store.read().social, before);
  const requests = h.modelRequests.length;
  await assert.rejects(service.generateAuthor('missing'), /作者|人物/);
  assert.equal(h.modelRequests.length, requests);
});

test('read-only post queries filter author and batch without generation, writes, or exposing mutable save objects', async () => {
  const { h, store, service } = await setup();
  await service.refresh();
  const authorId = store.read().social.posts[0].authorId;
  const batchKey = store.read().social.posts[0].batch.key;
  const before = { requests: h.modelRequests.length, saves: h.metadataSaves };
  const result = service.readPosts({ authorId, batchKey, limit: 1 });
  assert.equal(result.length, 1);
  assert.equal(result[0].authorId, authorId);
  assert.equal(readSocialPosts(store.read(), { batchKey: 'other' }).length, 0);
  result[0].text = '外部修改';
  result[0].comments[0].text = '外部评论修改';
  assert.notEqual(store.read().social.posts.find(post => post.authorId === authorId).text, '外部修改');
  assert.equal(store.read().social.posts.find(post => post.authorId === authorId).comments[0].text, '下午好。');
  assert.deepEqual({ requests: h.modelRequests.length, saves: h.metadataSaves }, before);
});

test('a genuinely deleted friend is not restored as an author or named comment when a feed reply is saved', async () => {
  const { h, store, service } = await setup();
  let deletion;
  h.completion = () => {
    deletion = store.deleteContact('friend-1');
    return { choices: [{ message: { content: JSON.stringify({ posts: [
      { authorId: 'friend-0', text: '保留的动态', comments: [
        { authorId: 'friend-1', name: '朋友1', text: '已删除者的评论' },
        { name: '路过的人', text: '保留的评论' },
      ] },
      { authorId: 'friend-1', text: '已删除者的动态' },
    ] }) } }] };
  };
  await service.refresh();
  await deletion;
  const posts = store.read().social.posts;
  assert.deepEqual(posts.map(post => post.authorId), ['friend-0']);
  assert.deepEqual(posts[0].comments, [{ name: '路过的人', text: '保留的评论' }]);
});

test('social context recalls selected friends once, keeps actor ownership, and excludes private SMS and unrelated memory', async () => {
  const calls = [];
  const bridge = { readContext: async request => {
    calls.push(request);
    return { status: 'ready', actors: [
      ...request.entityIds.map(entityId => ({ entityId, stateText: `${entityId}的状态`, memoryText: `${entityId}的记忆` })),
      { entityId: 'unrelated', memoryText: '不相关人物的秘密' },
    ] };
  } };
  const { h, store, service } = await setup(4, bridge);
  await store.appendMessage('friend-0', { id: 'private-sms', role: 'user', text: '不应进入动态的私信' });
  await service.refresh();
  const input = JSON.parse(h.modelRequests[0].body.messages[1].content);
  assert.equal(calls.length, 1);
  assert.deepEqual([...calls[0].entityIds].sort(), ['entity-0', 'entity-1', 'entity-2', 'entity-3']);
  assert.equal(input.authors.find(author => author.id === 'friend-0').related, 'entity-0的状态\nentity-0的记忆');
  assert.equal(input.authors.find(author => author.kind === 'npc').related, '');
  assert.equal(JSON.stringify(input).includes('不相关人物的秘密'), false);
  assert.equal(JSON.stringify(input).includes('不应进入动态的私信'), false);
});
