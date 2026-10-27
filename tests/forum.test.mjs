import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader } from '../src/context.js';
import { createApiSettings, createModelClient } from '../src/api.js';
import { createForumService } from '../src/forum.js';

for (const hostKind of ['native', 'luker']) test(`${hostKind}: one forum refresh saves separate translations and reads them without another request`, async () => {
  const main = [{ is_user: false, mes: '广场开放周末集市。<!-- QQJ-end | date=2026-10-18 | time=18:00 -->' }];
  const translated = {
    title: 'Marché du week-end', titleTranslation: '周末集市', author: 'Une passante',
    content: 'Le marché ouvre samedi.', contentTranslation: '集市周六开放。', category: '城市生活',
    comments: [{ author: 'Voisine', text: 'À bientôt.', translation: '到时见。' }],
  };
  const chinese = { title: '街角书店', author: '读者', content: '书店周末开放阅读区。', comments: [{ author: '路人', text: '好耶！' }, { author: '邻居', text: '👍' }] };
  const h = createHarness({ hostKind, messages: main, metadata: { foreign: { keep: true } },
    settings: { 'schedule-planner': { apiPresets: [{ id: 'test', url: 'https://example.invalid', key: 'mock-key', model: 'mock-model' }] } },
    completion: { choices: [{ message: { content: JSON.stringify({ posts: [translated, chinese] }) } }] },
  });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.saveUserProfile({ name: '私有用户姓名', nickname: '私有用户网名' });
  await store.upsertContacts([{ id: 'lin', name: '林舟' }]);
  await store.appendMessage('lin', { id: 'private', role: 'user', text: '不应发给论坛的私聊' });
  const before = structuredClone(store.read()), mainBefore = structuredClone(main), saves = h.metadataSaves;
  const service = createForumService({ store,
    contextReader: createContextReader({ target, store, qqjBridgeProvider: () => { throw new Error('论坛不应召回人物记忆'); } }),
    modelClient: createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) }),
  });
  assert.equal(h.modelRequests.length, 0);
  await service.refresh();
  assert.equal(h.modelRequests.length, 1);
  const sent = JSON.parse(h.modelRequests[0].body.messages.find(message => message.role === 'user').content);
  assert.deepEqual(Object.keys(sent).sort(), ['clock', 'defaultLanguage', 'phoneContext', 'setting', 'storyBackground', 'worldbook']);
  assert.equal(sent.clock.time, '18:00');
  assert.equal(sent.storyBackground[0].text, '广场开放周末集市。');
  for (const privateText of ['私有用户姓名', '私有用户网名', '不应发给论坛的私聊']) assert.equal(JSON.stringify(sent).includes(privateText), false);
  const posts = store.read().forum.posts;
  assert.equal(posts.length, 2);
  const { id, publishedAt, createdAt, ...saved } = posts[0];
  assert.ok(publishedAt); saved.comments = saved.comments.map(({ id, publishedAt, createdAt, ...comment }) => { assert.ok(id && publishedAt); return comment; });
  assert.ok(id);
  assert.deepEqual(saved, translated);
  assert.equal('titleTranslation' in posts[1], false);
  assert.equal('contentTranslation' in posts[1], false);
  assert.equal('translation' in posts[1].comments[0], false);
  assert.equal('translation' in posts[1].comments[1], false);
  assert.deepEqual(createPhoneStore({ target }).read().forum.posts, posts, 'reopening uses the persisted bilingual fields');
  assert.deepEqual(service.getPost(id), posts[0]);
  assert.equal(h.modelRequests.length, 1, 'reading original and translation needs no translation request');
  assert.ok(h.modelRequests[0].body.messages[0].content.includes('两者均省略译文字段'));
  assert.ok(!h.modelRequests[0].body.messages[0].content.includes('"titleTranslation":'));
  assert.ok(!h.modelRequests[0].body.messages[0].content.includes('"contentTranslation":'));
  assert.equal(h.metadataSaves, saves + 1);
  assert.deepEqual(store.read(), { ...before, forum: { posts } });
  assert.deepEqual(h.persistedMetadata, { foreign: { keep: true }, pocketPhone: store.read() });
  assert.deepEqual(main, mainBefore);
  assert.equal(h.promptSlots.size, 0);
});

test('refresh replaces the batch; reading posts is free and preserves main messages', async () => {
  const main = [{ mes: '在街上散步。', is_user: false }];
  const h = createHarness({ messages: main, settings: { 'schedule-planner': { apiPresets: [{ id: 'test', url: 'https://example.invalid', key: 'key', model: 'm' }] } }, completion: { choices: [{ message: { content: '{"posts":[{"title":"晚风","author":"路人甲","content":"今晚很凉快","comments":[{"author":"路人乙","text":"适合散步"}]},{"title":"小店","author":"路人丙","content":"新开了一家面馆"}]}' } }] } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.replaceForum([{ id: 'old', title: '旧帖' }]);
  const service = createForumService({ store, contextReader: createContextReader({ target, store }), modelClient: createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) }) });
  assert.equal(h.modelRequests.length, 0);
  await service.refresh();
  assert.equal(store.read().forum.posts.length, 2);
  assert.equal(service.getPost('old'), undefined);
  assert.equal(service.getPost(store.read().forum.posts[0].id).comments[0].text, '适合散步。');
  assert.equal(h.modelRequests.length, 1);
  assert.deepEqual(main, [{ mes: '在街上散步。', is_user: false }]);
});

for (const hostKind of ['native', 'luker']) test(`${hostKind}: forum requests ten posts once, persists the full batch and replaces only forum data with public inputs`, async () => {
  const posts = Array.from({ length: 10 }, (_, index) => ({ title: `公共生活话题${index + 1}`, author: `街坊${index + 1}`, content: `不同地方的公共日常${index + 1}。`, category: '生活', comments: Array.from({ length: 3 }, (_, n) => ({ author: `路人${n}`, text: `自然回帖${n}。` })) }));
  const h = createHarness({ hostKind, messages: [{ is_user: false, mes: '最新一楼公开背景。<!-- QQJ-end | date=2031/4/8 | time=10:00 -->' }],
    metadata: { foreign: '保留', pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }], groups: [{ id: 'g', name: '朋友群', memberIds: ['lin'], userIsMember: true }],
      conversations: { lin: [{ id: 'pm', role: 'assistant', text: 'PRIVATE_SMS_NEVER', batch: { key: '[-1]' } }], g: [{ id: 'gm', speakerId: 'lin', text: 'PRIVATE_GROUP_NEVER', batch: { key: '[-1]' }, knownToIds: ['lin', '@user'] }] },
      forum: { posts: [{ id: 'old', title: 'OLD_FORUM_TITLE', author: '旧作者', content: 'OLD_FORUM_BODY', comments: [{ author: '旧回复', text: 'OLD_FORUM_COMMENT' }] }] },
      social: { npcs: [{ id: 'public', name: '公开路人' }], posts: [{ id: 'public-ins', authorId: 'public', text: 'PUBLIC_PHONE_CONTEXT', comments: [] }] },
      liangshi: { accounts: [], posts: [], feedIds: [], topics: [] } } },
    settings: { 'schedule-planner': { apiPresets: [{ id: 'test', url: 'https://example.invalid', key: 'mock', model: 'mock-model' }] } },
    completion: { choices: [{ message: { content: JSON.stringify({ posts }) } }] } });
  const target = h.host.captureChat(), store = createPhoneStore({ target }), before = structuredClone(store.read());
  const service = createForumService({ store, contextReader: createContextReader({ target, store, qqjBridgeProvider: () => { throw Error('no private actor recall'); } }), modelClient: createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) }) });
  const result = await service.refresh();
  assert.equal(h.modelRequests.length, 1); assert.equal(h.metadataSaves, 1);
  const wire = h.modelRequests[0].body, input = JSON.parse(wire.messages[1].content);
  assert.match(wire.messages[0].content, /目标10篇完整帖子/);
  for (const marker of ['OLD_FORUM_TITLE', 'OLD_FORUM_BODY', 'OLD_FORUM_COMMENT', 'PRIVATE_SMS_NEVER', 'PRIVATE_GROUP_NEVER']) assert.equal(JSON.stringify(input).includes(marker), false, marker);
  assert.ok(JSON.stringify(input.phoneContext).includes('PUBLIC_PHONE_CONTEXT')); assert.equal(input.storyBackground[0].text, '最新一楼公开背景。');
  assert.equal('max_tokens' in wire, false); assert.equal('max_completion_tokens' in wire, false);
  assert.equal(result.length, 10); assert.deepEqual(result.map(({ id, publishedAt, createdAt, comments, ...post }) => ({ ...post, comments: comments.map(({ id, publishedAt, createdAt, ...row }) => row) })), posts);
  assert.deepEqual(store.read(), { ...before, forum: { posts: result } }); assert.equal(service.getPost('old'), undefined);
  assert.deepEqual(createPhoneStore({ target }).read().forum.posts, result); assert.deepEqual(h.persistedMetadata, { foreign: '保留', pocketPhone: store.read() });
});
