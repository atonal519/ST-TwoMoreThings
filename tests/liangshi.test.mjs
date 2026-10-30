import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader } from '../src/context.js';
import { createApiSettings, createModelClient } from '../src/api.js';
import { stateFromPreset } from '../src/authoring.js';
import { liangshiFeed } from './liangshi-fixture.mjs';
import { LIANGSHI_PROMPT } from '../src/prompts.js';

const implementation = await import('../src/liangshi.js').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url?.endsWith('/src/liangshi.js')) return {}; throw error; });
const makeService = options => { assert.equal(typeof implementation.createLiangshiService, 'function', 'the Liangshi production service must exist'); return implementation.createLiangshiService(options); };
const settings = () => ({ pocketPhone:{apiSourceRef:{kind:'shared-preset',presetId:'test'}}, 'schedule-planner': { apiPresets: [{ id: 'test', url: 'https://fixture.invalid', key: 'mock', model: 'mock-model' }], processingPrompt: 'FIRST SHARED PREFIX' } });
function setup(hostKind = 'native', initial) {
  const h = createHarness({ hostKind, settings: settings(), messages: [{ is_user: false, mes: '城市广场正在布置放映。<!-- QQJ-end | date=2031年4月8日 | time=09:30 -->' }], metadata: { foreign: 'keep', ...(initial ? { pocketPhone: initial } : {}) } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const contextReader = createContextReader({ target, store, qqjBridgeProvider: () => { throw new Error('public feed must not read private actor memories'); } });
  const modelClient = createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) });
  h.completion = () => ({ choices: [{ message: { content: JSON.stringify(liangshiFeed()) } }] });
  return { h, target, store, contextReader, modelClient };
}

test('square/following/topic initial comments and more comments/reposts each expose and preserve conditional translations', async () => {
  const { h, store, contextReader, modelClient } = setup(), service = makeService({ store, contextReader, modelClient, random: () => 0 });
  const foreign = [{ authorKey: 'a', text: 'Nice view.', translation: '风景真美。' }, { authorKey: 'b', text: '멋진 풍경이에요.', translation: '景色很漂亮。' }];
  const accounts = [{ key: 'a', name: '山风', handle: 'wind', language: '英语' }, { key: 'b', name: '湖畔', handle: 'lake', language: '韩语' }];
  const feed = () => ({ accounts, posts: [{ key: 'p', authorKey: 'a', text: '湖畔。', comments: foreign }, { key: 'q', authorKey: 'b', text: '山间。', comments: [{ authorKey: 'a', text: '真好。' }, { authorKey: 'b', text: '🙂' }] }] });
  h.completion = { choices: [{ message: { content: JSON.stringify(feed()) } }] };
  for (const [field, action] of [['feedIds', () => service.refresh()], ['followingFeedIds', () => service.refreshFollowing()]]) {
    const before = h.modelRequests.length; await action(); assert.equal(h.modelRequests.length, before + 1);
    assert.match(h.modelRequests.at(-1).body.messages[0].content, /"comments":\[\{[^}]*"translation":/);
    const data = store.read().liangshi, batch = data[field].map(id => data.posts.find(post => post.id === id));
    assert.deepEqual(batch.find(p => p.text === '湖畔。').comments.map(c => c.translation), ['风景真美。', '景色很漂亮。']);
  }
  h.completion = { choices: [{ message: { content: JSON.stringify({ topics: [{ name: '湖边散步', description: '公开日常' }] }) } }] }; await service.refreshHot();
  h.completion = { choices: [{ message: { content: JSON.stringify(feed()) } }] }; const requests = h.modelRequests.length, topicId = store.read().liangshi.topics[0].id, topicBatch = await service.loadTopic(topicId); assert.equal(h.modelRequests.length, requests + 1);
  assert.match(h.modelRequests.at(-1).body.messages[0].content, /"comments":\[\{[^}]*"translation":/);
  assert.deepEqual(topicBatch.map(post => post.id), store.read().liangshi.topics.find(topic => topic.id === topicId).postIds);
  const post = topicBatch.find(p => p.text === '湖畔。'); assert.deepEqual(post.comments.map(c => c.translation), ['风景真美。', '景色很漂亮。']);
  h.completion = { choices: [{ message: { content: JSON.stringify({ accounts, comments: [...foreign, { authorKey: 'a', text: '收到了。' }, { authorKey: 'b', text: '✨' }], reposts: [{ authorKey: 'a', text: 'A quiet afternoon.', translation: '安静的午后。' }, { authorKey: 'b', text: '조용한 오후예요.', translation: '这是宁静的午后。' }] }) } }] };
  const before = h.modelRequests.length; await service.loadMore(post.id); assert.equal(h.modelRequests.length, before + 1);
  const system = h.modelRequests.at(-1).body.messages[0].content; assert.match(system, /"comments":\[\{[^}]*"translation":/); assert.match(system, /"reposts":\[\{[^}]*"translation":/);
  const saved = service.getPost(post.id); assert.deepEqual(saved.comments.slice(-4).map(c => c.translation), ['风景真美。', '景色很漂亮。', undefined, undefined]); assert.deepEqual(saved.reposts.map(c => c.translation), ['安静的午后。', '这是宁静的午后。']);
});

test('old chat and card presets stay empty until the public feed is manually refreshed', () => {
  const { h, store, contextReader, modelClient } = setup();
  const service = makeService({ store, contextReader, modelClient });
  assert.equal(store.read().liangshi, undefined); assert.equal(service.getPost('missing'), undefined);
  assert.equal(h.modelRequests.length, 0); assert.equal(h.metadataSaves, 0);
  assert.equal(stateFromPreset({ schemaVersion: 1, contacts: [], groups: [] }).liangshi, undefined);
});

for (const hostKind of ['native', 'luker']) test(`${hostKind}: one public request saves the batch and maps forward quotes with private material only under its owning contact`, async () => {
  const initial = { schemaVersion: 1, contacts: [{ id: 'private-person', name: '不公开联系人' }], groups: [], conversations: { 'private-person': [{ id: 'secret', text: '不公开短信' }] }, forum: { posts: [{ id: 'forum-old' }] }, userProfile: { name: '不公开用户' }, social: { posts: [], feedIds: [], npcs: [] }, theme: 'night', defaultLanguage: '中文' };
  const { h, target, store, contextReader, modelClient } = setup(hostKind, initial), scans = [];
  target.readWorldInfo = async options => { scans.push(options.scanText); return '城市公共文化设定'; };
  const service = makeService({ store, contextReader, modelClient, random: () => 0 });
  await service.refresh();
  assert.equal(h.modelRequests.length, 1); assert.equal(h.metadataSaves, 1);
  const saved = store.read().liangshi; assert.equal(saved.posts.length, 15); assert.equal(saved.topics.length, 0); assert.equal(saved.feedIds.length, 15); assert.equal(saved.posts.filter(post => post.promoted).length, 2);
  assert.equal(saved.posts.filter(post => post.quoteId).length, 2);
  assert.equal(saved.posts.find(post => post.text.startsWith('第1条')).quoteId, saved.posts.find(post => post.text.startsWith('第6条')).id);
  assert.ok(saved.accounts.every(account => account.avatar.startsWith('data:image/svg+xml') && account.followed !== true));
  const translated = saved.posts.find(post => post.text === '今日は休み。'); assert.equal(translated.translation, '今天休息。');
  assert.equal(saved.posts[0].comments[0].translation, '真好。');
  const { notifications, ...contentState } = store.read(); assert.deepEqual(contentState, { ...initial, liangshi: saved }); assert.equal(notifications.items[0].kind, 'liangshi-feed'); assert.deepEqual(h.persistedMetadata, { foreign: 'keep', pocketPhone: store.read() });
  const payload = JSON.parse(h.modelRequests[0].body.messages[1].content);
  assert.equal(JSON.stringify(payload.phoneContext || []).includes('不公开短信'),false); assert.ok(JSON.stringify(payload.knownContacts.find(row=>row.id==='private-person').phoneContext).includes('不公开短信')); assert.equal(JSON.stringify({...payload,knownContacts:[]}).includes('不公开用户'),false);
  assert.ok(scans[0].includes('微博'));assert.equal(scans[0].includes('城市广场'),true);
  assert.equal(h.modelRequests[0].body.max_tokens, undefined); assert.ok(h.modelRequests[0].body.messages[0].content.startsWith('FIRST SHARED PREFIX'));
  assert.ok(h.modelRequests[0].body.messages[0].content.includes('标准汉语')); assert.equal(saved.promoCountdown, 1);
});

test('wrapped aliases and missing mechanical keys retain usable bodies and omit only an unknown quote', async () => {
  const { h, store, contextReader, modelClient } = setup();
  h.completion = { choices: [{ message: { content: '回答如下：\n```json\n' + JSON.stringify({ result: { users: [{ name: '匿名读者', username: 'reader' }], items: [{ author: 'reader', content: '仍然可读的正文', quoteId: 'absent', translatedText: 'still readable' }, { author: 'unknown', content: '没有可确认作者' }], hotTopics: ['公共话题'] } }) + '\n```' } }] };
  await makeService({ store, contextReader, modelClient, random: () => 0 }).refresh();
  assert.equal(store.read().liangshi.posts.length, 1); assert.equal(store.read().liangshi.posts[0].text, '仍然可读的正文。'); assert.equal(store.read().liangshi.posts[0].quoteId, undefined);
  assert.equal(store.read().liangshi.posts[0].translation, 'still readable.'); assert.equal(h.modelRequests.length, 1);
});

test('the due promotion occupies one requested slot and the countdown advances only with the saved batch', async () => {
  const initial = { schemaVersion: 1, contacts: [], groups: [], conversations: {}, forum: { posts: [] }, liangshi: { accounts: [], posts: [], topics: [], promoCountdown: 1 } };
  const { h, store, contextReader, modelClient } = setup('native', initial);
  h.completion = (_path, init) => { const request = JSON.parse(JSON.parse(init.body).messages[1].content); assert.equal(request.recipe.promotions, 1); return { choices: [{ message: { content: JSON.stringify(liangshiFeed(1)) } }] }; };
  const service = makeService({ store, contextReader, modelClient, random: () => 0 });
  h.saveFailure = new Error('合成保存失败'); await assert.rejects(service.refresh(), /保存失败/); assert.equal(store.read().liangshi.promoCountdown, 1);
  h.saveFailure = null; await service.refresh();
  const saved = store.read().liangshi; assert.equal(saved.posts.length, 15); assert.equal(saved.posts.filter(post => post.promoted).length, 2); assert.equal(saved.posts.filter(post => post.builtinPromotion).length, 1); assert.equal(saved.posts.find(post => post.builtinPromotion).topic, ''); assert.equal(saved.promoCountdown, 2);
  assert.equal(h.modelRequests.length, 2); assert.equal(h.metadataSaves, 1);
});

test('each details request appends comments and reposts to its own post and retains its original quote and account avatar', async () => {
  const { h, store, contextReader, modelClient } = setup(); const service = makeService({ store, contextReader, modelClient, random: () => 0 });
  await service.refresh(); const first = store.read().liangshi.posts[0], second = store.read().liangshi.posts[1], original = structuredClone(first), countdown = store.read().liangshi.promoCountdown;
  h.context.extensionSettings['schedule-planner'].processingPrompt = 'SECOND SHARED PREFIX';
  let call = 0;
  h.completion = (_path, init) => {
    call++; const request = JSON.parse(JSON.parse(init.body).messages[1].content); assert.equal(request.post.id, call <= 2 ? first.id : second.id);
    if (call <= 2) assert.equal(request.original.id, first.quoteId);
    if (call === 2) assert.equal(request.post.comments.length, original.comments.length + 1);
    return { choices: [{ message: { content: JSON.stringify({ accounts: [{ key: 'new', name: '新路人', handle: 'neighbor' }], comments: [{ authorKey: 'new', text: `第${call}次评论` }], reposts: [{ authorId: first.authorId, text: `第${call}次转发`, quoteId: 'wrong-model-quote' }] }) } }] };
  };
  await service.loadMore(first.id); await service.loadMore(first.id); await service.loadMore(second.id);
  const saved = service.getPost(first.id); assert.equal(saved.comments.length, original.comments.length + 2); assert.equal(saved.reposts.length, 2); assert.equal(saved.quoteId, original.quoteId); assert.equal(saved.text, original.text);
  assert.ok(saved.reposts.every(repost => repost.quoteId === first.id)); assert.equal(service.getPost(second.id).reposts[0].quoteId, second.id);
  assert.equal(new Set(saved.comments.map(item => item.id)).size, saved.comments.length);
  assert.equal(store.read().liangshi.accounts.filter(account => account.handle === 'neighbor').length, 1); assert.equal(store.read().liangshi.promoCountdown, countdown);
  assert.equal(h.modelRequests.length, 4); assert.equal(h.metadataSaves, 4);
  for (const request of h.modelRequests.slice(1)) { assert.equal(request.body.max_tokens, undefined); assert.ok(request.body.messages[0].content.startsWith('SECOND SHARED PREFIX')); }
});

test('same-handle refresh preserves omitted account language, expression and institution profile', async () => {
  const account={id:'old-account',name:'公共机构',handle:'known',kind:'institution',description:'既有公开简档',expression:'克制短句',language:'日语',avatar:'data:image/svg+xml,existing',followed:true};
  const {h,store,contextReader,modelClient}=setup('native',{schemaVersion:1,contacts:[],groups:[],conversations:{},forum:{posts:[]},liangshi:{accounts:[account],posts:[],topics:[],promoCountdown:2}});
  h.completion={choices:[{message:{content:JSON.stringify({accounts:[{key:'a',name:'公共机构',handle:'known'}],posts:[{authorKey:'a',text:'新公开内容'}]})}}]};
  await makeService({store,contextReader,modelClient,random:()=>0}).refresh();
  assert.deepEqual(store.read().liangshi.accounts[0],account);
});

for (const [randomValue, moods] of [[0, ['温情','安利']], [.999, ['争吵','拉踩']]]) test(`refresh binds thirteen world domains to the original genres and two moods (${randomValue})`, async () => {
  const {h,store,contextReader,modelClient}=setup();await makeService({store,contextReader,modelClient,random:()=>randomValue}).refresh();
  const request=h.modelRequests[0].body,recipe=JSON.parse(request.messages[1].content).recipe,subjects=recipe.subjects;
  const domains={生活趣味:['衣食起居','住处邻里','出行往来','买卖交换','闲暇见闻'],公开消息:['生计劳动','物产供需','公共设施','自然环境'],观点吐槽:['风俗人情','公共规矩']};
  assert.equal(subjects.length,13);assert.equal(new Set(subjects.map(subject=>subject.domain)).size,13);
  for(const [type,expected]of Object.entries(domains))assert.deepEqual(subjects.filter(subject=>subject.type===type).map(subject=>subject.domain).sort(),[...expected].sort());
  const emotional=subjects.filter(subject=>['器物技艺','异地风物'].includes(subject.domain));assert.equal(emotional.length,2);assert.deepEqual(emotional.map(subject=>subject.type).sort(),[...moods].sort());
  assert.ok(subjects.every(subject=>Object.keys(subject).length===2));assert.equal(request.messages[0].content,'FIRST SHARED PREFIX\n\n'+LIANGSHI_PROMPT);
  assert.equal(recipe.content,13);assert.equal(recipe.quotes,2);assert.equal(h.modelRequests.length,1);assert.equal(h.metadataSaves,1);assert.equal(store.read().liangshi.posts.length,15);
});

for (const [remaining, posts, promotions, programPromotions] of [[2,15,2,0],[1,14,1,1]]) test(`refresh requests ${posts} model posts and ${programPromotions} program promotion for a final batch of fifteen`, async () => {
  const { h, store, contextReader, modelClient } = setup('native', { schemaVersion: 1, contacts: [], groups: [], conversations: {}, forum: { posts: [] }, liangshi: { accounts: [], posts: [], topics: [], promoCountdown: remaining } });
  h.completion = (_path, init) => ({ choices: [{ message: { content: JSON.stringify(liangshiFeed(JSON.parse(JSON.parse(init.body).messages[1].content).recipe.promotions)) } }] });
  await makeService({ store, contextReader, modelClient, random: () => 0 }).refresh();
  const recipe = JSON.parse(h.modelRequests[0].body.messages[1].content).recipe;
  assert.deepEqual({ posts: recipe.posts, content: recipe.content, promotions: recipe.promotions, programPromotions: recipe.programPromotions, quotes: recipe.quotes }, { posts, content: 13, promotions, programPromotions, quotes: 2 });
  assert.equal(store.read().liangshi.posts.length, 15); assert.equal(store.read().liangshi.posts.filter(post => !post.promoted).length, 13);
  assert.equal(h.modelRequests.length, 1); assert.equal(h.metadataSaves, 1);
});

test('public knownContacts use only four fields and only explicit existing contact IDs with handles bind accounts', async () => {
  const contacts = [{ id: 'lin', name: '林舟', nickname: '仅手机备注', personality: '私人性格资料', expression: '短句', language: '中文', source: { entityId: 'private-memory' } }];
  const { h, store, contextReader, modelClient } = setup('native', { schemaVersion: 1, contacts, groups: [], conversations: { lin: [{ text: '私信不发送' }] }, forum: { posts: [] } });
  const accounts = [{ key: 'a', name: '公开小林', handle: 'lin-public', contactId: 'lin' }, { key: 'b', name: '林舟', handle: 'unlinked' }, { key: 'c', name: '未知', handle: 'unknown', contactId: 'absent' }, { key: 'd', name: '没账号', contactId: 'lin' }];
  h.completion = { choices: [{ message: { content: JSON.stringify({ accounts, posts: accounts.map(account => ({ authorKey: account.key, text: '公开正文' })) }) } }] };
  const service = makeService({ store, contextReader, modelClient, random: () => 0 }); await service.refresh();
  const request = JSON.parse(h.modelRequests[0].body.messages[1].content);
  assert.deepEqual(request.knownContacts.map(({phoneContext,...row})=>row), [{ id: 'lin', name: '林舟', expression: '短句', language: '中文' }]); assert.ok(JSON.stringify(request.knownContacts[0].phoneContext).includes('私信不发送'));
  for (const value of ['私人性格资料', 'private-memory']) assert.equal(JSON.stringify(request).includes(value), false); assert.equal(JSON.stringify(request.phoneContext || []).includes('私信不发送'),false);
  assert.equal(store.read().liangshi.accounts[0].contactId, 'lin'); assert.ok(store.read().liangshi.accounts.slice(1).every(account => !account.contactId));
  assert.ok(store.read().liangshi.accounts.every(account => account.followed === false));
  h.completion = { choices: [{ message: { content: JSON.stringify({ accounts: [{ key: 'a', name: '公开小林', handle: 'lin-public' }], posts: [{ authorKey: 'a', text: '后续公开正文' }] }) } }] };
  await service.refresh(); assert.equal(store.read().liangshi.accounts.find(account => account.handle === 'lin-public').contactId, 'lin');
  h.completion.choices[0].message.content = JSON.stringify({ accounts: [{ key: 'a', name: '公开小林', handle: 'lin-public', contactId: 'unknown-new-id' }], posts: [{ authorKey: 'a', text: '再一条公开正文' }] });
  await service.refresh(); assert.equal(store.read().liangshi.accounts.find(account => account.handle === 'lin-public').contactId, 'lin');
});

test('optional feed photos accept descriptions only and details requests project away generated file data', async () => {
  const { h, store, contextReader, modelClient } = setup();
  const feed = liangshiFeed(); feed.posts[0].image = { description: '窗边咖啡', path: '/user/images/model-invented.png', seed: 4, base64: 'invented' };
  h.completion = { choices: [{ message: { content: JSON.stringify(feed) } }] };
  const service = makeService({ store, contextReader, modelClient, random: () => 0 }); await service.refresh();
  const post = store.read().liangshi.posts[0]; assert.deepEqual(post.image, { description: '窗边咖啡' }); assert.equal(store.read().liangshi.posts[1].image, undefined);
  await store.updateLiangshi(current => ({ ...current, posts: current.posts.map(item => item.id === post.id ? { ...item, image: { ...item.image, path: '/user/images/saved.png', seed: 3 } } : item) }));
  h.completion = { choices: [{ message: { content: JSON.stringify({ comments: [{ authorId: post.authorId, text: '新的评论' }] }) } }] };
  await service.loadMore(post.id);
  const request = JSON.parse(h.modelRequests.at(-1).body.messages[1].content);
  assert.deepEqual(request.post.image, { description: '窗边咖啡' }); assert.ok(!JSON.stringify(request).includes('/user/images/saved.png')); assert.equal(service.getPost(post.id).image.path, '/user/images/saved.png');
});

test('two fresh batches omit old posts/accounts while latest story and local identity remain', async () => {
  const old={accounts:[{id:'old',name:'OLD_ACCOUNT_SENTINEL',handle:'lin',avatar:'LOCAL_AVATAR_SENTINEL'}],topics:[],promoCountdown:3,posts:[{id:'old-post',authorId:'old',text:'OLD_POST_SENTINEL',comments:[],reposts:[]}]};
  const {h,target,store,contextReader,modelClient}=setup('native',{schemaVersion:1,contacts:[],groups:[],conversations:{},forum:{posts:[]},liangshi:old}),scans=[];
  target.messages[0].mes+=' LATEST_STORY_SENTINEL';target.readWorldInfo=async options=>{scans.push(options.scanText);return 'PUBLIC_WORLD_SENTINEL';};let batch=0;
  h.completion=()=>{const answer=liangshiFeed();answer.accounts[0].name=++batch===1?'FIRST_ACCOUNT_SENTINEL':'SECOND_ACCOUNT_SENTINEL';answer.posts[0].text=batch===1?'FIRST_POST_SENTINEL':'SECOND_POST_SENTINEL';return {choices:[{message:{content:JSON.stringify(answer)}}]};};
  const service=makeService({store,contextReader,modelClient,random:()=>0});await service.refresh();await service.refresh();
  for(const row of h.modelRequests){const payload=JSON.parse(row.body.messages[1].content);assert.equal(payload.recentPosts,undefined);assert.equal(payload.existingAccounts,undefined);assert.equal(payload.storyBackground,undefined);assert.ok(JSON.stringify(payload.story).includes('LATEST_STORY_SENTINEL'));assert.equal(payload.recipe.subjects.length,13);assert.equal(payload.worldbook,'PUBLIC_WORLD_SENTINEL');for(const sentinel of ['OLD_ACCOUNT_SENTINEL','OLD_POST_SENTINEL','FIRST_ACCOUNT_SENTINEL','FIRST_POST_SENTINEL','LOCAL_AVATAR_SENTINEL'])assert.equal(JSON.stringify(payload).includes(sentinel),false);}
  for(const scan of scans)for(const sentinel of ['OLD_ACCOUNT_SENTINEL','OLD_POST_SENTINEL','FIRST_POST_SENTINEL','FIRST_ACCOUNT_SENTINEL'])assert.equal(scan.includes(sentinel),false);
  const post=service.getPost(store.read().liangshi.posts[0].id);assert.equal(post.authorId,'old');assert.equal(store.read().liangshi.accounts.find(account=>account.id==='old').avatar,'LOCAL_AVATAR_SENTINEL');assert.equal(store.read().liangshi.promoCountdown,1);assert.equal(h.modelRequests.length,2);assert.equal(h.metadataSaves,2);
  h.completion={choices:[{message:{content:JSON.stringify({comments:[{authorId:post.authorId,text:'追加互动'}],reposts:[{authorId:post.authorId,text:'追加转发'}]})}}]};await service.loadMore(post.id);
  const more=JSON.parse(h.modelRequests.at(-1).body.messages[1].content);assert.equal(more.post.text,'SECOND_POST_SENTINEL.');assert.equal(more.original.id,post.quoteId);assert.equal(more.post.comments.length,1);assert.ok(more.accounts.some(account=>account.name==='SECOND_ACCOUNT_SENTINEL'));assert.ok(scans[2].includes('SECOND_POST_SENTINEL'));assert.ok(scans[2].includes(more.original.text));assert.equal(scans[2].includes('LATEST_STORY_SENTINEL'),false);assert.equal(more.storyBackground,undefined);assert.equal(more.story,undefined);assert.equal(h.modelRequests.length,3);assert.equal(h.metadataSaves,3);
});

test('untagged ordinary posts and usable extra quotes are saved without a recipe quota gate', async () => {
  const { h, store, contextReader, modelClient } = setup(), feed = liangshiFeed();
  for (const [index, post] of feed.posts.entries()) { if (index < 5) post.quoteKey = `p${index + 5}`; if (index > 1) delete post.topic; }
  h.completion = { choices: [{ message: { content: JSON.stringify(feed) } }] };
  await makeService({ store, contextReader, modelClient, random: () => 0 }).refresh();
  assert.equal(store.read().liangshi.posts.length, 15); assert.equal(store.read().liangshi.posts.filter(post => !post.topic).length, 13); assert.equal(store.read().liangshi.posts.filter(post => post.quoteId).length, 5);
  assert.equal(JSON.parse(h.modelRequests[0].body.messages[1].content).recipe.quotes, 2);
});

test('one mechanical statistics rule projects old zero ads and preserves higher totals without mutating the record', () => {
  assert.equal(typeof implementation.liangshiStatistics, 'function');
  const post = { text: '两三事小手机推广', promoted: true, likes: 0, commentCount: 0, repostCount: 0, comments: [], reposts: [] }, before = structuredClone(post);
  assert.deepEqual(implementation.liangshiStatistics(post), { likes: 50000, commentCount: 5000, repostCount: 2000 }); assert.deepEqual(post, before);
  assert.deepEqual(implementation.liangshiStatistics({ ...post, likes: 80000, commentCount: 6000, repostCount: 3000, favoriteCount: 30000 }), { likes: 80000, commentCount: 6000, repostCount: 3000 });
  assert.deepEqual(implementation.liangshiStatistics({ comments: Array(23).fill({}), reposts: Array(12).fill({}) }), { likes: 0, commentCount: 23, repostCount: 12 });
});

test('new batches omit retired favorites while old ad details preserve saved fields and photos', async () => {
  const { h, store, contextReader, modelClient } = setup(); const feed = liangshiFeed(); feed.posts[0].favorites = 37;
  h.completion = { choices: [{ message: { content: JSON.stringify(feed) } }] }; const service = makeService({ store, contextReader, modelClient, random: () => 0 }); await service.refresh();
  assert.equal(store.read().liangshi.posts[0].favoriteCount, undefined); assert.ok(store.read().liangshi.posts.every(post => post.commentCount >= 20 && post.repostCount >= 10));
  const id = store.read().liangshi.posts[0].id;
  await store.updateLiangshi(current => ({ ...current, posts: current.posts.map(post => post.id === id ? { ...post, builtinPromotion: '千千结', favoriteCount: 37, likes: 0, commentCount: 0, repostCount: 0, image: { description: '保留图片', path: '/user/images/saved.png' } } : post) }));
  h.completion = { choices: [{ message: { content: JSON.stringify({ comments: [{ authorId: store.read().liangshi.posts[0].authorId, text: '新评论' }], reposts: [{ authorId: store.read().liangshi.posts[0].authorId, text: '新转发' }] }) } }] }; await service.loadMore(id);
  const request = JSON.parse(h.modelRequests.at(-1).body.messages[1].content); assert.equal(request.post.likes, 50000); assert.equal(request.post.commentCount, 5000); assert.equal(request.post.repostCount, 2000); assert.equal(request.post.favoriteCount, 37); assert.equal(service.getPost(id).favoriteCount, 37);
  assert.equal(service.getPost(id).image.path, '/user/images/saved.png'); assert.equal(service.getPost(id).comments.length, 2); assert.equal(service.getPost(id).reposts.length, 1); assert.equal(service.getPost(id).commentCount, 5000);
});

for (const [label, body, likes, expected] of [['ordinary', '普通日常', 12, 12], ['promotion', '两三事小手机推广', 0, 50000]]) test(`${label}: local like toggles without changing the statistical base or making a model call`, async () => {
  const initial = { schemaVersion: 1, contacts: [], groups: [], conversations: {}, forum: { posts: [] }, liangshi: { accounts: [{ id: 'a', name: '作者', handle: 'author' }], topics: [], posts: [{ id: 'post', authorId: 'a', text: body, promoted: label === 'promotion', likes, comments: [], reposts: [] }] } };
  const { h, store, contextReader, modelClient } = setup('native', initial), service = makeService({ store, contextReader, modelClient });
  assert.equal(typeof service.toggleLike, 'function');
  for (const liked of [true, false, true]) {
    const post = await service.toggleLike('post');
    assert.equal(post.userLiked, liked); assert.equal(service.getPost('post').likes, likes);
    assert.equal(implementation.liangshiStatistics(post).likes, expected);
  }
  assert.equal(h.modelRequests.length, 0); assert.equal(h.metadataSaves, 3);
  assert.equal(makeService({ store: createPhoneStore({ target: h.host.captureChat() }), contextReader, modelClient }).getPost('post').userLiked, true);
  assert.deepEqual(h.persistedMetadata.pocketPhone, store.read());
});

test('more retains local likes and images but sends only base statistics for the post and quoted original', async () => {
  const { h, store, contextReader, modelClient } = setup(), service = makeService({ store, contextReader, modelClient });
  await service.refresh(); const post = store.read().liangshi.posts.find(post => post.quoteId), originalId = post.quoteId;
  assert.equal(typeof service.toggleLike, 'function');
  await store.updateLiangshi(current => ({ ...current, posts: current.posts.map(item => item.id === post.id ? { ...item, promoted: true, builtinPromotion: '两三事', likes: 0, image: { description: '固定图', path: '/user/images/kept.png' } } : item) }));
  await service.toggleLike(post.id); await service.toggleLike(originalId);
  h.completion = { choices: [{ message: { content: JSON.stringify({ comments: [{ authorId: post.authorId, text: '追加评论' }], reposts: [{ authorId: post.authorId, text: '追加转发' }] }) } }] };
  for (let index = 0; index < 2; index++) {
    await service.loadMore(post.id);
    const input = JSON.parse(h.modelRequests.at(-1).body.messages[1].content);
    assert.equal(input.post.userLiked, undefined); assert.equal(input.original.userLiked, undefined); assert.equal(input.post.likes, 50000);
    assert.equal(service.getPost(post.id).likes, 50000); assert.equal(service.getPost(post.id).userLiked, true); assert.equal(service.getPost(originalId).userLiked, true);
    assert.equal(service.getPost(post.id).image.path, '/user/images/kept.png');
  }
  assert.equal(implementation.liangshiStatistics(service.getPost(post.id)).likes + Number(service.getPost(post.id).userLiked), 50001);
  await service.toggleLike(post.id);
  assert.equal(implementation.liangshiStatistics(service.getPost(post.id)).likes, 50000); assert.equal(service.getPost(post.id).userLiked, false);
});
