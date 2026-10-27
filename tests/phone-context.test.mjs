import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader } from '../src/context.js';
import { readTimeline } from '../src/timeline.js';
import { createApiSettings, createModelClient } from '../src/api.js';
import { createMessageService } from '../src/messages.js';
import { createGroupService } from '../src/groups.js';
import { createSocialService } from '../src/social.js';
import { createForumService } from '../src/forum.js';
import { createLiangshiService } from '../src/liangshi.js';

let project;
try { ({ readPhoneContext: project } = await import('../src/phone-context.js')); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const past = { key: '[-1]', label: '此前' };
const message = (id, text, extra = {}) => ({ id, role: 'assistant', text, batch: past, storyDate: '2031/4/8', timeLabel: '09:00', ...extra });
const lsPost = (id, authorId, text, extra = {}) => ({ id, authorId, text, comments: [], reposts: [], publishedAt: '2031/4/8 09:00', ...extra });
function setup(hostKind = 'native') {
  const h = createHarness({ hostKind, messages: [{ is_user: false, mes: '普通场景。<!-- SDC-end | date=2031/4/8 | time=10:00 -->' }], settings: { 'schedule-planner': { apiPresets: [{ id: 'p', url: 'https://fixture.invalid/v1', key: 'mock', model: 'model' }] } }, metadata: { pocketPhone: {
    contacts: [{ id: 'a', name: '甲', expression: '简短' }, { id: 'b', name: '乙' }, { id: 'c', name: '丙' }],
    groups: [{ id: 'ab', name: '甲乙群', memberIds: ['a', 'b'], userIsMember: true }, { id: 'ac', name: '甲丙群', memberIds: ['a', 'c'], userIsMember: false }],
    conversations: { a: [message('a1', 'PRIVATE_A'), message('a2', 'ACTIVE_A')], b: [message('b1', 'PRIVATE_B')],
      ab: [message('g1', 'GROUP_AB', { speakerId: 'a', knownToIds: ['@user', 'a', 'b'] })],
      ac: [message('g2', 'GROUP_AC', { speakerId: 'c', knownToIds: ['a', 'c'] })] },
    social: { npcs: [{ id: 'npc:1', name: '甲' }], feedIds: ['s'], posts: [{ id: 's', authorId: 'a', text: 'SOCIAL_PUBLIC', image: { description: 'SOCIAL_IMAGE', path: '/user/images/secret.png' }, publishedAt: '2031/4/8 09:00', comments: [{ id: 'sc', role: 'user', name: '我', text: 'USER_PUBLIC_COMMENT' }] }] },
    forum: { posts: [{ id: 'f', author: '甲', title: 'FORUM_TITLE', content: 'FORUM_PUBLIC', comments: [{ author: '乙', text: 'FORUM_COMMENT' }] }] },
    liangshi: { accounts: [{ id: 'la', name: '甲的公开账号', handle: 'public-a', contactId: 'a', followed: true }, { id: 'same', name: '甲', handle: 'stranger' }], feedIds: ['l'], followingFeedIds: [], topics: [], posts: [lsPost('l', 'la', 'PUBLIC_RELEASE_ONLY', { comments: [{ id: 'lc', authorId: 'same', text: 'STRANGER_COMMENT' }], sourceConversationId: 'a', sourceMessageIds: ['a1'], userLiked: true })], promoCountdown: 3 },
  } } });
  h.context.powerUserSettings = { persona_description: '喜欢散步' };
  const target = h.host.captureChat(), store = createPhoneStore({ target }), anchor = readTimeline(target.messages);
  store.read().conversations.a[1].batch = anchor;
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  const modelClient = createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) });
  return { h, target, store, anchor, reader, modelClient };
}
const serialized = value => JSON.stringify(value);
const ids = value => value.map(row => row.source.id);

test('one read-only projection filters active messages and intersects actual known recipients before ranking', () => {
  assert.equal(typeof project, 'function');
  const { h, store, anchor } = setup(), before = structuredClone(store.read());
  const a = project(store.read(), { anchor, targetIds: ['a'] });
  for (const value of ['PRIVATE_A', 'GROUP_AB', 'GROUP_AC', 'PUBLIC_RELEASE_ONLY']) assert.ok(serialized(a).includes(value), value);
  for (const value of ['ACTIVE_A', 'PRIVATE_B', '/user/images/', 'sourceConversationId', 'sourceMessageIds', 'userLiked']) assert.equal(serialized(a).includes(value), false, value);
  const ac = project(store.read(), { anchor, targetIds: ['a', 'c'] });
  assert.ok(serialized(ac).includes('GROUP_AC'));
  for (const value of ['PRIVATE_A', 'GROUP_AB']) assert.equal(serialized(ac).includes(value), false, value);
  const c = project(store.read(), { anchor, targetIds: ['c'] });
  assert.equal(serialized(c).includes('GROUP_AB'), false); assert.equal(serialized(c).includes('PRIVATE_A'), false); assert.ok(serialized(c).includes('PUBLIC_RELEASE_ONLY'));
  const publicRows = project(store.read(), { anchor, publicOnly: true });
  for (const value of ['PRIVATE_A', 'GROUP_AB', 'GROUP_AC', 'ACTIVE_A']) assert.equal(serialized(publicRows).includes(value), false, value);
  for (const targetIds of [[], ['unknown'], ['a', 'unknown']]) assert.deepEqual(project(store.read(), { anchor, targetIds }), publicRows);
  assert.deepEqual(store.read(), before); assert.equal(h.metadataSaves, 0); assert.equal(h.modelRequests.length, 0);
});

test('source exclusions remove the complete previous draft and names never create cross-platform identity', () => {
  assert.equal(typeof project, 'function');
  const { store, anchor } = setup(), rows = project(store.read(), { anchor, targetIds: ['a'], excludeApps: ['social'] });
  assert.equal(serialized(rows).includes('SOCIAL_'), false); assert.equal(serialized(rows).includes('USER_PUBLIC_COMMENT'), false);
  const forum = rows.find(row => row.source.app === 'forum'); assert.equal(forum.author.personId, undefined);
  const stranger = rows.find(row => row.text === 'STRANGER_COMMENT'); assert.equal(stranger.author.personId, undefined);
  assert.equal(rows.find(row => row.text === 'PUBLIC_RELEASE_ONLY').author.personId, 'a');
  assert.ok(ids(rows).includes('a1')); assert.equal(ids(rows).includes('a2'), false);
});

test('stable message references only resolve against other eligible messages, and complete JSON fits the shared budget', () => {
  assert.equal(typeof project, 'function');
  const { store, anchor } = setup(), state = store.read();
  state.conversations.a[0].replyToId = 'a2';
  let rows = project(state, { anchor, targetIds: ['a'] });
  assert.equal(rows.find(row => row.source.id === 'a1').replyTo.missing, true); assert.equal(serialized(rows).includes('ACTIVE_A'), false);
  state.conversations.a.unshift(message('huge', 'REPLY'.repeat(1300)));
  state.conversations.a[1].replyToId = 'huge';
  state.forum.posts.push({ id: 'huge-post', author: '路人', title: '完整长帖', content: '不可裁断'.repeat(2000), comments: [] });
  rows = project(state, { anchor, targetIds: ['a'] });
  assert.ok(serialized(rows).length <= 6000); assert.ok(rows.some(row => row.source.id === 'a1' && row.excerpted)); assert.equal(serialized(rows).includes('ACTIVE_A'), false);
  assert.ok(rows.some(row => row.text === 'GROUP_AB'));
});

test('explicit self/direct identity outranks newer general public records, without inferring a follow graph', () => {
  assert.equal(typeof project, 'function');
  const { store, anchor } = setup(), state = store.read();
  state.liangshi.posts.push(lsPost('new', 'same', 'GENERAL_RECENT', { publishedAt: '2032/4/8 09:00' }));
  const rows = project(state, { anchor, targetIds: ['a'] });
  assert.ok(ids(rows).indexOf('l') < ids(rows).indexOf('new')); assert.ok(ids(rows).indexOf('a1') < ids(rows).indexOf('new'));
  const pub = project(state, { anchor, publicOnly: true });
  assert.ok(ids(pub).indexOf('new') < ids(pub).indexOf('l'), 'followed presentation is not a ranking relationship');
});

test('normal group writes capture audience and membership changes freeze only unmarked old messages', async () => {
  const { store, h, anchor } = setup();
  store.read().conversations.ab.push(message('legacy', 'LEGACY_GROUP'), message('empty', 'EXPLICIT_EMPTY', { knownToIds: [] }));
  const saves = h.metadataSaves;
  await store.saveGroup('ab', { name: '甲丙群', memberIds: ['a', 'c'], userIsMember: false });
  assert.deepEqual(store.read().conversations.ab.find(row => row.id === 'legacy').knownToIds, ['a', 'b', '@user']);
  assert.deepEqual(store.read().conversations.ab.find(row => row.id === 'empty').knownToIds, []);
  await store.appendMessage('ab', message('new', 'NEW_AC', { speakerId: 'c', batch: anchor, knownToIds: ['b'] }));
  assert.deepEqual(store.read().conversations.ab.at(-1).knownToIds, ['a', 'c']);
  const input = await createContextReader({ target: h.host.captureChat(), store, qqjBridgeProvider: () => null }).readForGroup('ab');
  const sent = serialized(input); assert.ok(sent.includes('NEW_AC')); for (const text of ['LEGACY_GROUP', 'EXPLICIT_EMPTY', 'GROUP_AB']) assert.equal(sent.includes(text), false, text);
  assert.equal(h.metadataSaves, saves + 2);
});

test('story import seals the old group scope and stamps imported messages within its original one save', async () => {
  const { store, h, anchor } = setup();
  delete store.read().conversations.ab[0].knownToIds;
  await store.importStorySms({ floor: 3, batch: anchor, blocks: [{ group: true, name: '甲乙群', sender: '丙', text: 'IMPORTED_C', index: 0 }] });
  assert.deepEqual(store.read().conversations.ab[0].knownToIds, ['a', 'b', '@user']);
  assert.deepEqual(store.read().conversations.ab.at(-1).knownToIds, ['a', 'b', 'c', '@user']);
  assert.equal(h.metadataSaves, 1);
});

test('leaving a group preserves known old material while a new member cannot expand references to it', async () => {
  const { store, reader, anchor } = setup();
  store.read().conversations.ab.push(message('old-user', 'USER_KNOWN_BEFORE_LEAVING', { role: 'user', speakerId: '@user' }));
  await store.saveGroup('ab', { name: '新成员群', memberIds: ['b', 'c'], userIsMember: false });
  assert.deepEqual(store.read().conversations.ab.at(-1).knownToIds, ['a', 'b', '@user']);
  await store.appendMessage('ab', message('new-reply', 'SAFE_NEW_MESSAGE', { speakerId: 'b', replyToId: 'g1', batch: anchor }));
  const group = await reader.readForGroup('ab');
  assert.equal(group.history[0].replyTo.missing, true); assert.equal(serialized(group).includes('GROUP_AB'), false);
  const known = project(store.read(), { anchor, targetIds: ['a'] }); assert.ok(serialized(known).includes('GROUP_AB')); assert.ok(serialized(known).includes('USER_KNOWN_BEFORE_LEAVING'));
  const unknown = project(store.read(), { anchor, targetIds: ['c'] }); assert.equal(serialized(unknown).includes('GROUP_AB'), false);
  await store.saveGroup('ab', { name: '新成员群', memberIds: ['b', 'c'], userIsMember: true });
  assert.deepEqual(store.read().conversations.ab.at(-1).knownToIds, ['b', 'c']);
});

test('explicit malformed group scopes grant no permission and are not replaced on membership edits', async () => {
  const { store, anchor, reader } = setup();
  const scopes = [null, 'a', { a: true }];
  store.read().conversations.ab = scopes.map((knownToIds, i) => message(`bad${i}`, `INVALID_SCOPE_${i}`, { knownToIds, speakerId: 'a' }));
  for (const targetIds of [['a'], ['a', 'b']]) assert.equal(serialized(project(store.read(), { anchor, targetIds })).includes('INVALID_SCOPE'), false);
  assert.equal(serialized(await reader.readForGroup('ab')).includes('INVALID_SCOPE'), false);
  await store.saveGroup('ab', { name: '更新群', memberIds: ['a', 'c'], userIsMember: false });
  assert.deepEqual(store.read().conversations.ab.map(row => row.knownToIds), scopes);
});

test('unbound group speakers retain only their platform identity rather than a fabricated person binding', () => {
  const { store, anchor } = setup();
  store.read().conversations.ab = [message('unsigned', 'UNSIGNED_GROUP'), message('unknown', 'UNKNOWN_SPEAKER', { speakerId: 'ghost' })];
  const rows = project(store.read(), { anchor, targetIds: ['a'] });
  assert.equal(rows.find(row => row.source.id === 'unsigned').author.personId, undefined);
  const ghost = rows.find(row => row.source.id === 'unknown'); assert.equal(ghost.author.id, 'ghost'); assert.equal(ghost.author.personId, undefined);
});

test('a former group participant keeps the direct-interaction priority of an old message they actually knew', async () => {
  const { store, anchor } = setup();
  await store.saveGroup('ab', { name: '已离开的群', memberIds: ['a', 'c'], userIsMember: true });
  store.read().forum.posts[0].publishedAt = '2032/4/8 09:00';
  const rows = project(store.read(), { anchor, targetIds: ['b'] });
  assert.ok(ids(rows).indexOf('g1') < ids(rows).indexOf('f'));
});

test('readers wait for an existing save and use its saved snapshot, including failure rollback', async () => {
  const { target, store, reader, h } = setup();
  const original = structuredClone(store.read().forum);
  let finish;
  target.saveMetadata = () => new Promise(resolve => { finish = resolve; });
  const saving = store.replaceForum([{ id: 'pending', author: '路人', title: '新帖', content: 'PENDING_PUBLIC' }]);
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  assert.ok(serialized(store.read()).includes('PENDING_PUBLIC'), 'the original live metadata contract remains');
  let finishedReading = false;
  const reading = reader.readForContact('a').then(value => { finishedReading = true; return value; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(finishedReading, false);
  let nextFinish;
  target.saveMetadata = () => new Promise(resolve => { nextFinish = resolve; });
  const next = store.replaceForum([{ id: 'next', author: '路人', title: '更晚', content: 'UNSAVED_NEXT' }]);
  finish(); await saving;
  const result = await reading; assert.ok(serialized(result.phoneContext).includes('PENDING_PUBLIC')); assert.equal(serialized(result).includes('UNSAVED_NEXT'), false);
  while (!nextFinish) await new Promise(resolve => setImmediate(resolve)); nextFinish(); await next;
  let fail;
  target.saveMetadata = () => new Promise((_resolve, reject) => { fail = reject; });
  const failing = store.replaceForum([{ id: 'failed', author: '路人', title: '失败', content: 'FAILED_PUBLIC' }]);
  const failure = assert.rejects(failing, /save failed/);
  while (!fail) await new Promise(resolve => setImmediate(resolve));
  const afterFailure = reader.readForContact('a'); fail(Error('save failed')); await failure;
  assert.equal(serialized(await afterFailure).includes('FAILED_PUBLIC'), false); assert.ok(serialized(await store.readSaved()).includes('UNSAVED_NEXT'));
  assert.equal(h.modelRequests.length, 0); assert.ok(original.posts.length);
});

for (const hostKind of ['native', 'luker']) test(`${hostKind}: actual service requests use one permission path and exclude regenerated drafts without extra requests or saves`, async () => {
  const { h, target, store, reader, modelClient } = setup(hostKind), inputs = [];
  let answer;
  h.completion = (_path, init) => { const body = JSON.parse(init.body), input = JSON.parse(body.messages[1].content); inputs.push(input); return { choices: [{ message: { content: serialized(typeof answer === 'function' ? answer(input) : answer) } }] }; };
  const choose = value => { answer = value; };
  choose({ messages: [{ text: '私聊正常续接。' }] });
  await createMessageService({ target, store, contextReader: reader, modelClient }).continueChat('a');
  let input = inputs.at(-1); assert.ok(Array.isArray(input.phoneContext)); assert.ok(serialized(input.phoneContext).includes('GROUP_AB')); assert.equal(serialized(input).includes('PRIVATE_B'), false); assert.ok(serialized(input.history).includes('ACTIVE_A'));
  choose({ anchor: { memberIds: ['a', 'b', '@user'], speakerIds: ['a'] }, messages: [{ speakerId: 'a', text: '群内正常续接。' }] });
  await createGroupService({ target, store, contextReader: reader, modelClient }).continueChat('ab');
  input = inputs.at(-1); for (const text of ['PRIVATE_A', 'PRIVATE_B', 'GROUP_AC']) assert.equal(serialized(input).includes(text), false, text); assert.equal('privateHistories' in input, false);
  const social = createSocialService({ store, contextReader: reader, modelClient, random: () => .99 });
  choose(input => ({ posts: [{ authorId: input.authors[0].id, text: 'A_SOCIAL_BODY', image: { description: 'A_SOCIAL_IMAGE' }, comments: [{ name: '路人', text: 'A_SOCIAL_COMMENT' }] }] }));
  await social.refresh(); const selected = store.read().social.posts[0];
  choose(input => ({ posts: [{ authorId: input.authors[0].id, image:{description:'B_SOCIAL_IMAGE'}, text: 'B_SOCIAL_BODY' }] })); await social.refresh();
  const fresh = inputs.at(-1); for (const text of ['A_SOCIAL_BODY', 'A_SOCIAL_IMAGE', 'A_SOCIAL_COMMENT', 'ACTIVE_A']) assert.equal(serialized(fresh).includes(text), false, text);
  assert.ok(serialized(fresh.phoneContext).includes('PUBLIC_RELEASE_ONLY'));assert.equal(serialized(fresh.phoneContext).includes('PRIVATE_A'),false);assert.equal(serialized(fresh.authors.find(author=>author.id==='b')?.phoneContext||[]).includes('PRIVATE_A'),false); assert.ok(fresh.authors.every(author => !('privateHistory' in author))); assert.equal('groupHistories' in fresh, false);
  choose(input => ({ posts: [{ authorId: input.authors[0].id, image:{description:'过去的主图。'}, text: 'AUTHOR_PAST', publishedAt: '2030/1/1 08:00' }] })); await social.generateAuthor(store.read().social.posts[0].authorId);
  assert.ok(inputs.at(-1).historyBefore); assert.equal(serialized(inputs.at(-1)).includes('B_SOCIAL_BODY'), false);
  choose({ comments: [{ name: '新路人', text: '公开评论回应' }] }); await social.comment(store.read().social.posts[0].id, 'USER_COMMENT'); assert.ok(inputs.at(-1).post.text); assert.equal(serialized(inputs.at(-1).phoneContext).includes('PRIVATE_A'), false);
  const ls = createLiangshiService({ store, contextReader: reader, modelClient, random: () => 0 });
  const following = label => ({ accounts: [{ key: 'a', name: '公开作者', handle: 'following-author' }], posts: [{ authorKey: 'a', text: `${label}_FOLLOWING_BODY.`, image: { description: `${label}_FOLLOWING_IMAGE` }, comments: [] }] });
  choose(following('A')); await ls.refreshFollowing(); choose(following('B')); await ls.refreshFollowing();
  input = inputs.at(-1); assert.equal('userConversations' in input, false); assert.equal(serialized(input).includes('A_FOLLOWING_'), false); assert.equal(serialized(input).includes('PUBLIC_RELEASE_ONLY'), false); assert.ok(serialized(input.phoneContext).includes('B_SOCIAL_BODY'));
  const post = store.read().liangshi.posts.find(row => row.text === 'B_FOLLOWING_BODY.'); choose({ accounts: [{ key: 'r', name: '路人', handle: 'reply' }], comments: [{ authorKey: 'r', text: '新评论' }] }); await ls.loadMore(post.id);
  assert.equal(inputs.at(-1).post.text, 'B_FOLLOWING_BODY.'); assert.ok(Array.isArray(inputs.at(-1).phoneContext)); assert.equal(serialized(inputs.at(-1).phoneContext).includes('PRIVATE_A'), false);
  choose({ posts: [{ title: '新论坛', author: '路人', content: '新公开帖' }] }); await createForumService({ store, contextReader: reader, modelClient }).refresh(); assert.equal(serialized(inputs.at(-1)).includes('FORUM_PUBLIC'), false); assert.ok(serialized(inputs.at(-1).phoneContext).includes('B_SOCIAL_BODY'));
  const square = await reader.readForLiangshi(), hot = await reader.readForLiangshiHot(); assert.equal('phoneContext' in square, false); assert.equal('phoneContext' in hot, false);
  assert.equal(h.modelRequests.length, 10); assert.equal(h.metadataSaves, 11); assert.ok(selected.id);
});
