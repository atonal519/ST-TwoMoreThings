import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader } from '../src/context.js';
import * as implementation from '../src/liangshi.js';
import { readPhoneContext } from '../src/phone-context.js';
import { readTimeline } from '../src/timeline.js';
import { renderLiangshi } from '../src/ui/liangshi.js';

function setup(hostKind = 'native', userProfile = { name: '本人设定名', nickname: '本人网名' }) {
  const h = createHarness({ hostKind, messages: [{ is_user: false, mes: '角色的活动。<!-- SDC-end | date=2031/4/8 | time=10:00 -->' }], metadata: { pocketPhone: { contacts: [{ id: 'a', name: '甲' }], groups: [{ id: 'member', name: '本群', memberIds: ['a'], userIsMember: true }, { id: 'observer', name: '旁观', memberIds: ['a'], userIsMember: false }],
    conversations: { a: [{ id: 'old', role: 'user', text: 'USER_KNOWN_PAST', batch: { key: '[-1]' } }, { id: 'active', role: 'user', text: 'ACTIVE_PRIVATE', batch: { key: '[0,"2031/4/8","10:00"]' } }], observer: [{ id: 'secret', speakerId: 'a', text: 'UNKNOWN_GROUP' }] }, userProfile, forum: { posts: [] }, social: { posts: [], npcs: [], feedIds: [] }, liangshi: { accounts: [{ id: 'other', name: '路人', handle: 'other' }], posts: [{ id: 'old-post', authorId: 'other', text: 'OLD_LIANGSHI_DRAFT', comments: [], reposts: [] }], feedIds: ['old-post'], topics: [], promoCountdown: 3 } } } });
  h.context.powerUserSettings = { persona_description: '喜欢旧物与慢跑' };
  const target = h.host.captureChat(), removed = [], store = createPhoneStore({ target, removeImages: async paths => removed.push(...paths) });
  let worldReads = 0; target.readWorldInfo = async () => { worldReads++; return '普通城市设定'; };
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => { throw Error('draft does not read actors'); } }), calls = [];
  let answer;
  const service = implementation.createLiangshiService({ store, contextReader: reader, modelClient: { complete: async request => { calls.push(request); return JSON.stringify(typeof answer === 'function' ? answer(request) : answer); } }, random: () => 0 });
  return { h, target, store, reader, service, calls, removed, worldReads: () => worldReads, answer: value => { answer = value; } };
}

for (const kind of ['native', 'luker']) test(`${kind}: manual publish is one save and zero model/world reads, with a program-owned author and zero counts`, async () => {
  const { h, store, service, calls, worldReads, reader } = setup(kind);
  assert.equal(typeof service.publishUser, 'function'); assert.equal(typeof implementation.readLiangshiUserPosts, 'function');
  const published = await service.publishUser({ publicName: '公开网名', text: '今天沿河走了一圈。', translation: '' });
  assert.equal(h.metadataSaves, 1); assert.equal(calls.length, 0); assert.equal(worldReads(), 0);
  const user = store.read().liangshi.accounts.find(account => account.id === published.authorId); assert.equal(user.ownerId, '@user'); assert.equal(user.name, '本人网名'); assert.notEqual(user.name, '林舟'); assert.equal(published.userAuthored, true);
  assert.equal(published.publishedAt, '2031/4/8 10:00'); assert.deepEqual(implementation.liangshiStatistics(published), { likes: 0, commentCount: 0, repostCount: 0 }); assert.deepEqual(implementation.readLiangshiUserPosts(store.read().liangshi).map(post => post.id), [published.id]);
  const phone = readPhoneContext(store.read(), { anchor: readTimeline([]), publicOnly: true }); assert.equal(phone.find(row => row.source.id === published.id).author.personId, '@user'); assert.ok(JSON.stringify(await createContextReader({target: h.host.captureChat(),store,qqjBridgeProvider:()=>null}).readForContact('a')).includes('今天沿河走了一圈。'));
});

test('AI draft reads only the user-known past, excludes old Liangshi and saves nothing until publish', async () => {
  const { service, reader, answer, calls, h, store, worldReads } = setup(); assert.equal(typeof service.draftUser, 'function'); assert.equal(typeof reader.readForLiangshiDraft, 'function');
  const before = structuredClone(store.read()); answer({ text: 'FIRST_AI_TEXT', translation: '第一稿译文' }); const first = await service.draftUser({ seed: '原用户想法', publicName: '网名' });
  assert.equal(first.text, 'FIRST_AI_TEXT'); answer({ text: 'SECOND_AI_TEXT' }); await service.draftUser({ seed: '原用户想法', publicName: '网名' });
  const input = JSON.parse(calls[1].messages[0].content); assert.equal(input.seed, '原用户想法'); assert.ok(JSON.stringify(input).includes('USER_KNOWN_PAST'));
  for (const marker of ['FIRST_AI_TEXT', 'OLD_LIANGSHI_DRAFT', 'ACTIVE_PRIVATE', 'UNKNOWN_GROUP']) assert.equal(JSON.stringify(input).includes(marker), false, marker);
  assert.equal(calls.length, 2); assert.equal(worldReads(), 2); assert.equal(h.metadataSaves, 0); assert.deepEqual(store.read(), before);
});

test('all three generated roots retain user posts, references, avatar and images while replacing their own content', async () => {
  const { service, store, answer, removed } = setup(); assert.equal(typeof service.publishUser, 'function');
  const post = await service.publishUser({ publicName: '网名', text: '本人已发布。' });
  await store.updateLiangshi(data => ({ ...data, posts: data.posts.map(row => row.id === post.id ? { ...row, quoteId: 'old-post', image: { description: '既有图', path: '/user/images/kept.png' } } : row) }));
  const user = structuredClone(store.read().liangshi.accounts.find(row => row.ownerId === '@user'));
  const feed = { accounts: [{ key: 'new', name: '新路人', handle: 'new' }], posts: [{ authorKey: 'new', text: '新公开帖。' }] };
  answer(feed); await service.refresh(); await service.refreshFollowing(); answer({ topics: [{ name: '热点', description: '公开事件' }] }); await service.refreshHot(); answer(feed); await service.loadTopic(store.read().liangshi.topics[0].id);
  assert.ok(service.getPost(post.id)); assert.ok(service.getPost('old-post')); assert.equal(service.getPost(post.id).image.path, '/user/images/kept.png'); assert.deepEqual(store.read().liangshi.accounts.find(row => row.ownerId === '@user'), user); assert.deepEqual(removed, []);
});

test('model IDs, handles, nested author objects and ownership claims cannot take over the user account or emit its interactions', async () => {
  const { service, store, answer } = setup(); assert.equal(typeof service.publishUser, 'function');
  const own = await service.publishUser({ publicName: '本人公开名', text: '本人原帖。' }); const user = structuredClone(store.read().liangshi.accounts.find(row => row.id === own.authorId));
  answer({ accounts: [{ id: user.id, key: 'id-attack', name: '改名', handle: 'new-handle' }, { key: 'handle-attack', handle: user.handle, name: '改名2' }, { key: 'safe', handle: 'safe', name: '正常路人', ownerId: '@user' }], posts: [{ authorId: user.id, text: 'BAD_ID' }, { authorKey: 'handle-attack', text: 'BAD_HANDLE' }, { author: { handle: user.handle, name: '改名3' }, text: 'BAD_NESTED' }, { authorKey: 'safe', text: 'SAFE', userAuthored: true }] });
  await service.refresh(); assert.deepEqual(store.read().liangshi.accounts.find(row => row.id === user.id), user); assert.equal(store.read().liangshi.accounts.filter(row => row.ownerId === '@user').length, 1); assert.equal(service.getPost(implementation.readLiangshiFeed(store.read().liangshi)[0].id).userAuthored, undefined); for (const marker of ['BAD_ID','BAD_HANDLE','BAD_NESTED']) assert.equal(JSON.stringify(store.read()).includes(marker), false);
  answer({ accounts: [{ key: 'stranger', handle: 'reply', name: '路人' }], comments: [{ authorId: user.id, text: 'BAD_USER_COMMENT' }, { author: { id: user.id, name: '改名' }, text: 'BAD_NESTED_COMMENT' }, { authorKey: 'stranger', text: '他人评论' }], reposts: [{ authorId: user.handle, text: 'BAD_USER_REPOST' }, { authorKey: 'stranger', text: '他人转发' }] });
  const more = await service.loadMore(own.id); assert.equal(more.comments.length, 1); assert.equal(more.reposts.length, 1); assert.deepEqual(implementation.liangshiStatistics(more), { likes: 0, commentCount: 1, repostCount: 1 }); assert.deepEqual(store.read().liangshi.accounts.find(row => row.id === user.id), user);
  assert.deepEqual(implementation.liangshiStatistics({ comments: [], reposts: [] }), { likes: 0, commentCount: 20, repostCount: 10 });
});

test('invalid publish or failed save leaves the authoritative archive untouched and draft failure performs no save', async () => {
  const { service, store, target, answer, h } = setup(); assert.equal(typeof service.publishUser, 'function'); const before = structuredClone(store.read());
  await assert.rejects(service.publishUser({ publicName: '网名', text: '   ' }), /正文/);
  target.saveMetadata = async () => { throw Error('save failed'); }; await assert.rejects(service.publishUser({ publicName: '网名', text: '草稿不丢' }), /save failed/); assert.deepEqual(store.read(), before);
  answer({ text: '' }); await assert.rejects(service.draftUser({ publicName: '网名', seed: '想法' }), /草稿|正文/); assert.equal(h.metadataSaves, 0);
});

test('optional picture descriptions remain ungenerated on publish and AI pictures are not reused as the user seed', async () => {
  const { service, h, calls, answer } = setup();
  const post = await service.publishUser({ publicName: '网名', text: '配图正文', imageDescription: '河边一排旧长椅', image: { path: '/untrusted.png' } });
  assert.deepEqual(post.image, { description: '河边一排旧长椅' }); assert.equal(calls.length, 0); assert.equal(h.metadataSaves, 1);
  answer({ text: 'A_TEXT', image: { description: 'A_AI_PICTURE', path: '/model.png' } }); const a = await service.draftUser({ seed: '用户原稿', imageSeed: '用户原图想法', publicName: '网名' });
  assert.equal(a.imageDescription, 'A_AI_PICTURE'); answer({ text: 'B_TEXT', image: { description: 'B_AI_PICTURE' } }); await service.draftUser({ seed: '用户原稿', imageSeed: '用户原图想法', publicName: '网名' });
  const input = JSON.parse(calls[1].messages[0].content); assert.equal(input.imageSeed, '用户原图想法'); assert.equal(JSON.stringify(input).includes('A_AI_PICTURE'), false); assert.equal(h.metadataSaves, 1);
});

test('a picture-only user post or AI preview needs a description but never an image path', async () => {
  const { service, answer, calls, h } = setup();
  const post = await service.publishUser({ publicName: '网名', text: '', imageDescription: '空椅子和树影', image: { path: '/ignored' } }); assert.equal(post.text, ''); assert.deepEqual(post.image, { description: '空椅子和树影' }); assert.equal(calls.length, 0); assert.equal(h.metadataSaves, 1);
  answer({ text: '', image: { description: '晴天的一把椅子', path: '/not-accepted' } }); const draft = await service.draftUser({ seed: '', imageSeed: '椅子', publicName: '网名' }); assert.equal(draft.imageDescription, '晴天的一把椅子'); assert.equal(h.metadataSaves, 1);
});

test('deleting only an own post removes every ownership root, keeps public retellings and retains the user account', async () => {
  const { service, store, removed, h, calls } = setup(); assert.equal(typeof service.deleteUser, 'function');
  const own = await service.publishUser({ publicName: '最后也保留的昵称', text: '要删除的原帖' }); const user = structuredClone(store.read().liangshi.accounts.find(row => row.ownerId === '@user'));
  await store.updateLiangshi(data => ({ ...data, feedIds: [...data.feedIds, own.id, 'retelling'], followingFeedIds: [own.id], topics: [{ id: 't', name: '已发布转述', postIds: [own.id] }], posts: [...data.posts.map(post => post.id === own.id ? { ...post, image: { description: '图', path: '/user/images/delete-own.png' } } : post), { id: 'retelling', authorId: 'other', text: '第三人已经发布的公开转述', quoteId: own.id, comments: [], reposts: [] }] }));
  const saves = h.metadataSaves; await service.deleteUser(own.id); assert.equal(h.metadataSaves, saves + 1); assert.equal(calls.length, 0);
  const data = store.read().liangshi; assert.equal(service.getPost(own.id), undefined); assert.ok(service.getPost('retelling')); assert.deepEqual(data.userPostIds, []); assert.equal(data.feedIds.includes(own.id), false); assert.equal(data.followingFeedIds.includes(own.id), false); assert.equal(data.topics[0].postIds.includes(own.id), false); assert.deepEqual(data.accounts.find(row => row.ownerId === '@user'), user);
  assert.deepEqual(removed, ['/user/images/delete-own.png']); assert.equal(JSON.stringify(readPhoneContext(store.read(), { anchor: readTimeline([]), publicOnly: true })).includes('要删除的原帖'), false);
  await assert.rejects(service.deleteUser('retelling'), /本人|自己/); assert.equal(h.metadataSaves, saves + 1);
});

test('editing merges into the latest own post, preserves identity/time/interactions and changes public text only on save', async () => {
  const { service, store, h, calls } = setup(); assert.equal(typeof service.editUser, 'function');
  const original = await service.publishUser({ publicName: '昵称', text: '原公开正文', imageDescription: '原图描述' });
  await store.updateLiangshi(data => ({ ...data, posts: data.posts.map(post => post.id === original.id ? { ...post, userLiked: true, comments: [{ id: 'c', authorId: 'other', text: '保留评论' }], reposts: [{ id: 'r', authorId: 'other', text: '保留转发' }], image: { ...post.image, path: '/user/images/keep.png', seed: 42 } } : post) }));
  const draft = { publicName: '新昵称', text: '新公开正文', imageDescription: '原图描述' }; assert.equal(JSON.stringify(readPhoneContext(store.read(), { publicOnly: true })).includes(draft.text), false);
  const saves = h.metadataSaves, edited = await service.editUser(original.id, draft); assert.equal(h.metadataSaves, saves + 1); assert.equal(calls.length, 0); assert.equal(edited.id, original.id); assert.equal(edited.publishedAt, original.publishedAt); assert.ok(edited.editedAt); assert.equal(edited.userLiked, true); assert.equal(edited.comments[0].id, 'c'); assert.equal(edited.reposts[0].id, 'r'); assert.equal(edited.image.path, '/user/images/keep.png'); assert.equal(edited.image.seed, 42);
  const row = readPhoneContext(store.read(), { publicOnly: true }).find(row => row.source.id === original.id); assert.equal(row.text, draft.text); assert.equal(row.editedAt, edited.editedAt); assert.equal(JSON.stringify(row).includes('原公开正文'), false);
});

test('editing an image description drops old generated fields, removes only unreferenced files, and cannot edit another author', async () => {
  const { service, store, removed, h, target } = setup(); assert.equal(typeof service.editUser, 'function');
  const own = await service.publishUser({ publicName: '昵称', text: '原帖', imageDescription: '旧图' });
  await store.updateLiangshi(data => ({ ...data, posts: data.posts.map(post => post.id === own.id ? { ...post, image: { description: '旧图', path: '/user/images/change.png', seed: 9 } } : post) }));
  let edited = await service.editUser(own.id, { publicName: '昵称', text: '', imageDescription: '新图' }); assert.equal(edited.text, ''); assert.deepEqual(edited.image, { description: '新图' }); assert.deepEqual(removed, ['/user/images/change.png']);
  edited = await service.editUser(own.id, { publicName: '昵称', text: '改回纯文字', imageDescription: '' }); assert.equal('image' in edited, false);
  const before = structuredClone(store.read()), saves = h.metadataSaves; await assert.rejects(service.editUser('old-post', { publicName: '昵称', text: '不能改他人' }), /本人|自己/); assert.equal(h.metadataSaves, saves);
  target.saveMetadata = async () => { throw Error('save failed'); }; await assert.rejects(service.editUser(own.id, { publicName: '昵称', text: '失败草稿' }), /save failed/); assert.deepEqual(store.read(), before);
});


test('personal profile is the only user name source for old posts, new posts, edits and AI drafts', async () => {
  const { service, store, h, answer, calls } = setup();
  const first = await service.publishUser({ publicName: '伪造独立昵称', text: '原本人正文' });
  const authorId = first.authorId, archived = structuredClone(store.read().liangshi.accounts.find(a => a.id === authorId));
  assert.equal(archived.name, '本人网名');
  const saves = h.metadataSaves; await store.saveUserProfile({ name: '本人设定名', nickname: '新资料网名', avatar: '' });
  assert.equal(h.metadataSaves, saves + 1);
  const projection = readPhoneContext(store.read(), { publicOnly: true }).find(row => row.source.id === first.id);
  assert.equal(projection.author.name, '新资料网名'); assert.equal(projection.author.personId, '@user'); assert.equal(projection.text, '原本人正文');
  assert.deepEqual(store.read().liangshi.accounts.find(a => a.id === authorId), archived, 'name projection does not rewrite old account metadata');
  answer({ text: '拟稿' }); const beforeDraft = h.metadataSaves; await service.draftUser({ seed: '想法', publicName: '伪造AI昵称' });
  assert.equal(JSON.parse(calls.at(-1).messages[0].content).publicName, '新资料网名'); assert.equal(h.metadataSaves, beforeDraft);
  const next = await service.publishUser({ publicName: '伪造新发昵称', text: '第二帖' }); assert.equal(next.authorId, authorId);
  assert.equal(store.read().liangshi.accounts.find(a => a.id === authorId).name, '新资料网名');
  await service.editUser(first.id, { publicName: '伪造编辑昵称', text: '编辑正文' });
  assert.equal(store.read().liangshi.accounts.find(a => a.id === authorId).name, '新资料网名');
  answer({ comments: [{ authorId: 'other', text: '保留别人的称呼和正文' }] }); await service.loadMore(first.id); assert.equal(JSON.parse(calls.at(-1).messages[0].content).accounts.find(a => a.id === authorId).name, '新资料网名');
  await store.saveUserProfile({ name: '只用姓名', nickname: '', avatar: '' });
  assert.equal(readPhoneContext(store.read(), { publicOnly: true }).find(row => row.source.id === first.id).author.name, '只用姓名');
  answer({ text: '无昵称的拟稿' }); await service.draftUser({ seed: '想法', publicName: '仍不能覆盖' }); assert.equal(JSON.parse(calls.at(-1).messages[0].content).publicName, '只用姓名');
});

test('profile-less local publishing uses the captured user name without model or world reads', async () => {
  const { service, store, target, h, calls, worldReads, answer } = setup('native', null); target.user = '宿主本人姓名';
  const legacy = h.context.chatMetadata.pocketPhone.liangshi; legacy.accounts.push({ id: 'legacy-own', ownerId: '@user', handle: 'legacy-me', name: '已撤回的旧独立昵称' }); legacy.posts.push({ id: 'legacy-p', authorId: 'legacy-own', userAuthored: true, text: '旧本人正文', comments: [], reposts: [] }); legacy.userPostIds = ['legacy-p'];
  const ui = { defaultUser: target.user, liangshiPage: { kind: 'feed', tab: 'mine' }, liangshiExpanded: new Set() };
  assert.ok(renderLiangshi(store.read(), { ui, busy: new Set() }).includes('class="ls-name">宿主本人姓名</span>'));
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  assert.equal((await reader.readForContact('a')).phoneContext.find(row => row.source.id === 'legacy-p').author.name, '宿主本人姓名');
  const beforePublishWorldReads = worldReads(); const post = await service.publishUser({ publicName: '冒用角色名', text: '无资料也可直接发布' });
  assert.equal(store.read().liangshi.accounts.find(a => a.id === post.authorId).name, '宿主本人姓名'); assert.equal(calls.length, 0); assert.equal(worldReads(), beforePublishWorldReads);
  answer({ text: '草稿' }); await service.draftUser({ seed: '', publicName: '错误旧UI值' }); assert.equal(JSON.parse(calls[0].messages[0].content).publicName, '宿主本人姓名');
});
