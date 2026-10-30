import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader } from '../src/context.js';
import { createApiSettings, createModelClient } from '../src/api.js';
import { createMessageService } from '../src/messages.js';
import { createGroupService } from '../src/groups.js';
import { createSocialService } from '../src/social.js';
import { createLiangshiService } from '../src/liangshi.js';
import { createForumService } from '../src/forum.js';
import * as prompts from '../src/prompts.js';

// Catches an unanchored private speaker or any generation entry omitting the shared
// knowledge contract. Synthetic completions exercise routing/save behavior only.
function fixture(hostKind = 'native', bbs = false) {
  const past = { key: '[0]', label: '过去' };
  const h = createHarness({ hostKind,
    settings: { pocketPhone: { apiSourceRef: { kind: 'shared-preset', presetId: 'test' } }, 'schedule-planner': { apiPresets: [{ id: 'test', url: 'https://fixture.invalid/v1', key: 'synthetic', model: 'm' }] } },
    messages: [{ is_user: false, mes: '过去公开背景。' }, { is_user: false, mes: '仅本人和甲知道的旧事：OLDER_SECRET。' }, { is_user: false, mes: '仅本人和甲知道的现事：STORY_SECRET。<!-- QQJ-end | date=2031年4月8日 | time=10:00 -->' }],
    metadata: { pocketPhone: {
      userProfile: { name: '本人', nickname: '公开号' },
      contacts: [{ id: 'a', name: '同名', source: { kind: 'qqj', entityId: 'qa' } }, { id: 'b', name: '同名', source: { kind: 'qqj', entityId: 'qb' } }],
      groups: [{ id: 'g', name: '本群', memberIds: ['a', 'b'], userIsMember: true }],
      conversations: { a: [{ id: 'sa', role: 'assistant', text: 'A_PRIVATE', batch: past }], b: [{ id: 'sb', role: 'assistant', text: 'B_PRIVATE', batch: past }] },
      social: { npcs: [{ id: 'npc:old', name: '陌生路人' }], feedIds: ['sp'], posts: [{ id: 'sp', authorId: 'a', text: '公开窗景。', image: { description: '窗景。' }, comments: [{ id: 'sc', authorId: 'b', name: '同名', text: '公开评论。' }] }] },
      liangshi: {
        accounts: [{ id: 'la', name: '甲公开号', handle: 'public-a', contactId: 'a' }, { id: 'lb', name: '乙公开号', handle: 'public-b', contactId: 'b' }, { id: 'lu', ownerId: '@user', name: '公开号', handle: 'public-user' }],
        posts: [{ id: 'lp', authorId: 'la', text: '公开帖。', comments: [{ id: 'lc', authorId: 'lb', text: '公开评论。' }], reposts: [] }, { id: 'up', authorId: 'lu', userAuthored: true, text: '本人公开帖。', comments: [{ id: 'uc', authorId: 'la', text: '公开来评。' }, { id: 'ur', authorId: 'lu', userAuthored: true, text: '本人公开回复。', replyToId: 'uc', replyToAuthorId: 'la' }], reposts: [] }],
        feedIds: ['lp'], userPostIds: ['up'], followingFeedIds: [], topics: [{ id: 'topic', name: '公开话题', description: '公开摘要。', postIds: [] }], promoCountdown: 3,
      },
      forum: { posts: [{ id: 'fp', title: '匿名题', author: '匿名甲', content: '公开正文。', comments: [{ id: 'fc', author: '匿名乙', text: '公开回帖。' }] }] },
    } },
  });
  h.context.characters[0].description = 'CARD_SECRET';
  const target = { ...h.host.captureChat(), userPersona: 'PERSONA_SECRET', readWorldInfo: async () => 'WORLD_SECRET' };
  const store = createPhoneStore({ target });
  const bridge = { readContext: async () => ({ status: 'ready', actors: [{ entityId: 'qa', memoryText: 'A_RELATED' }, { entityId: 'qb', memoryText: 'B_RELATED' }] }) };
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => bridge,
    memorySources: { select: () => ({ bridge: bbs ? null : bridge }), readStoryMemory: () => bbs ? 'MEMORY_SECRET' : '' },
    calendar: { context: () => ({ events: [{ name: '私人纪念日', note: 'CALENDAR_SECRET' }] }) },
  });
  const client = createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) });
  return { h, target, store,
    sms: createMessageService({ target, store, contextReader: reader, modelClient: client }),
    group: createGroupService({ target, store, contextReader: reader, modelClient: client }),
    social: createSocialService({ store, contextReader: reader, modelClient: client, random: () => 0 }),
    ls: createLiangshiService({ store, contextReader: reader, modelClient: client, random: () => 0 }),
    forum: createForumService({ store, contextReader: reader, modelClient: client }),
  };
}

async function request(f, operation, answer, saves) {
  const calls = f.h.modelRequests.length, before = f.h.metadataSaves;
  f.h.completion = { choices: [{ message: { content: JSON.stringify(answer) } }] };
  await operation(f);
  assert.equal(f.h.modelRequests.length, calls + 1, 'one existing model request');
  assert.equal(f.h.metadataSaves, before + saves, 'original save count');
  assert.equal(f.h.settingsSaves, 0);
  const body = f.h.modelRequests.at(-1).body, system = body.messages[0].content;
  for (const key of ['max_tokens', 'max_completion_tokens', 'reasoning_effort', 'thinking']) assert.equal(Object.hasOwn(body, key), false);
  return { system, input: JSON.parse(body.messages[1].content) };
}

function assertKnowledgeContract(system) {
  assert.ok(typeof prompts.KNOWLEDGE_BOUNDARY_RULE === 'string' && system.includes(prompts.KNOWLEDGE_BOUNDARY_RULE), 'actual request carries the shared knowledge contract');
  assert.equal(system.split(prompts.KNOWLEDGE_BOUNDARY_RULE).length - 1, 1);
}

for (const hostKind of ['native', 'luker']) test(`${hostKind}: private request anchors the account ID while retaining background, personal scope and one reply save`, async () => {
  const f = fixture(hostKind);
  const answer = { messages: [{ text: '今日は休み。', translation: '今天休息。' }, { type: 'image', image: { description: '窗景。' } }, { text: '?' }], remarkForUser: '书友' };
  const { system, input } = await request(f, x => x.sms.continueChat('a'), answer, 1);
  assert.equal(input.contact.id, 'a', 'same-name accounts retain a stable current speaker');
  assertKnowledgeContract(system);
  assert.equal(input.contact.name, '同名');
  assert.ok(input.story[0].text.includes('STORY_SECRET'));
  assert.ok(JSON.stringify(input.storyProgress).includes('OLDER_SECRET'));
  assert.equal(input.character.includes('CARD_SECRET'), true);
  assert.equal(input.worldbook, 'WORLD_SECRET');
  assert.equal(input.calendar.events[0].note, 'CALENDAR_SECRET');
  assert.equal(input.related, 'A_RELATED');
  assert.equal(JSON.stringify(input).includes('B_PRIVATE'), false);
  assert.equal(JSON.stringify(input).includes('B_RELATED'), false);
  assert.ok(system.includes('messages每轮至少3条'));
  const saved = f.store.read().conversations.a.slice(-3);
  assert.equal(saved[0].translation, '今天休息。');
  assert.equal(saved[1].image.description, '窗景。');
  assert.equal(f.store.read().contacts.find(row => row.id === 'a').remarkForUser, '书友');
});

const feed = { accounts: [{ key: 'new', name: '公开新账号', handle: 'new-public' }], posts: [{ authorKey: 'new', text: '公开日常。' }] };
const photo = { posts: [{ authorId: 'a', image: { description: '公开窗景。' }, text: '公开日常。' }] };
const entries = [
  ['group', f => f.group.continueChat('g'), { anchor: { memberIds: ['a', 'b', '@user'], speakerIds: ['a'] }, messages: [{ speakerId: 'a', text: '收到。' }] }, 1],
  ['Ins.feed.QQJ', f => f.social.refresh(), photo, 1],
  ['Ins.author.known', f => f.social.generateAuthor('a'), photo, 1],
  ['Ins.author.NPC', f => f.social.generateAuthor('npc:old'), { posts: [{ authorId: 'npc:old', image: { description: '无人窗景。' } }] }, 1],
  ['Ins.comment', f => f.social.comment('sp', '本人公开留言。'), { comments: [{ authorId: 'b', text: '公开回应。' }] }, 2],
  ['Ins.feed.BBS', f => f.social.refresh(), photo, 1],
  ['Liangshi.square', f => f.ls.refresh(), feed, 1],
  ['Liangshi.following', f => f.ls.refreshFollowing(), feed, 1],
  ['Liangshi.hot', f => f.ls.refreshHot(), { topics: [{ name: '公开话题', description: '公开摘要。' }] }, 1],
  ['Liangshi.topic', f => f.ls.loadTopic('topic'), feed, 1],
  ['Liangshi.more.other', f => f.ls.loadMore('lp'), { comments: [{ authorId: 'lb', text: '新增公开评论。' }], reposts: [] }, 1],
  ['Liangshi.more.own', f => f.ls.loadMore('up'), { comments: [{ authorId: 'la', text: '新增公开评论。' }], reposts: [] }, 1],
  ['Liangshi.reply.own', f => f.ls.generateReplies('up'), { comments: [{ authorId: 'la', replyToId: 'ur', text: '接续公开回应。' }] }, 1],
  ['Liangshi.draft.own', f => f.ls.draftUser(), { text: '本人预览草稿。' }, 0],
  ['Forum.feed', f => f.forum.refresh(), { posts: [{ title: '公开题', author: '匿名丙', content: '公开正文。', comments: [] }] }, 1],
  ['Forum.more', f => f.forum.loadMore('fp'), { comments: [{ author: '匿名丙', text: '新公开回帖。' }] }, 1],
];
for (const [name, operation, answer, saves] of entries) test(`${name}: production request receives the shared knowledge contract without stripping its existing context`, async () => {
  const f = fixture('native', name.endsWith('BBS'));
  const { system, input } = await request(f, operation, answer, saves);
  assertKnowledgeContract(system);
  assert.equal((input.character || input.setting).includes('CARD_SECRET'), true);
  assert.equal(input.worldbook, 'WORLD_SECRET');
  const continuation = name.startsWith('Liangshi.more') || name.startsWith('Liangshi.reply') || name === 'Forum.more';
  if (continuation) assert.equal('story' in input || 'storyBackground' in input, false);
  else assert.ok(JSON.stringify(input.story || input.storyBackground).includes('STORY_SECRET'));
  if (name === 'group') assert.ok(system.includes('messages每轮合计至少6条'));
  if (name === 'Ins.feed.BBS') assert.equal(input.storyMemory, 'MEMORY_SECRET');
  const authors = input.authors || input.knownContacts || [];
  for (const author of authors) {
    const own = JSON.stringify(author.phoneContext || []);
    if (author.id === 'a') assert.equal(own.includes('B_PRIVATE'), false);
    if (author.id === 'b') assert.equal(own.includes('A_PRIVATE'), false);
    if (author.kind === 'npc') { assert.equal(author.related, ''); assert.equal(own.includes('_PRIVATE'), false); }
  }
  if (input.authors?.some(row => row.id === 'a') && name !== 'Ins.feed.BBS') {
    assert.equal(input.authors.find(row => row.id === 'a').related, 'A_RELATED');
    assert.ok(JSON.stringify(input.authors.find(row => row.id === 'a').phoneContext).includes('A_PRIVATE'));
  }
  if (input.phoneContext && name !== 'Liangshi.draft.own') assert.equal(JSON.stringify(input.phoneContext).includes('_PRIVATE'), false);
  if (name === 'Liangshi.more.own' || name === 'Liangshi.reply.own') {
    assert.ok(input.knownContacts.find(row => row.id === 'a').phoneContext.length);
    assert.equal(input.knownContacts.find(row => row.id === 'b').phoneContext, undefined);
  }
});
