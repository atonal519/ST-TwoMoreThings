import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader, createBackflowService } from '../src/context.js';
import { createApiSettings, createModelClient } from '../src/api.js';
import { createMessageService } from '../src/messages.js';
import { createGroupService } from '../src/groups.js';
import { createSocialService } from '../src/social.js';

function continuityHarness(hostKind = 'native') {
  const sourceBatch = { key: '[0,"2026-10-18","15:30"]', label: '2026-10-18 15:30' };
  const h = createHarness({ hostKind, settings: { 'schedule-planner': { apiPresets: [{ id: 'test', url: 'https://example.invalid/v1', key: 'synthetic', model: 'm' }] } }, messages: [
    { is_user: false, mes: '最初约定时的正文。<!-- SDC-end | date=2026-10-18 | time=15:30 -->' },
    { is_user: false, mes: '后来约定已取消，改成休息。' },
    { is_user: false, mes: '此刻在家。<!-- SDC-end | date=2026-10-18 | time=19:30 -->' },
  ], metadata: { pocketPhone: {
    contacts: [{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }, { id: 'other', name: '旁人' }], todos: [],
    groups: [
      { id: 'current', name: '当前群', memberIds: ['lin', 'zhou'], userIsMember: true },
      { id: 'plans', name: '约定群', memberIds: ['lin', 'zhou'], userIsMember: true, avatar: '/secret/group.png' },
      { id: 'observer', name: '两人群', memberIds: ['lin', 'other'], userIsMember: false },
      { id: 'unrelated', name: '无关群', memberIds: ['other'], userIsMember: true },
    ], conversations: {
      current: [{ id: 'current-message', speakerId: 'zhou', text: '当前群不重复', batch: sourceBatch }],
      plans: [
        { id: 'original', speakerId: 'lin', type: 'image', text: '旧占位', image: { description: '周二见面地点的路牌', path: '/secret/image.png' }, storyDate: '2026-10-18', timeLabel: '15:30', batch: sourceBatch },
        { id: 'agreement', speakerId: 'zhou', text: '周二十九点这里见。', translation: 'Meet here at nineteen on Tuesday.', replyToId: 'original', storyDate: '2026-10-18', timeLabel: '15:31', batch: sourceBatch },
      ],
      observer: [{ id: 'observer-message', speakerId: 'other', text: '只有两位成员知道的安排', batch: sourceBatch }],
      unrelated: [{ id: 'unrelated-message', speakerId: 'other', text: '无关群秘密', batch: sourceBatch }],
    }, social: { posts: [], npcs: [], feedIds: [] },
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  return { h, target, store, reader };
}

test('group references preserve member knowledge, full message projection and later story evidence without todos or writes', async () => {
  const { h, target, store, reader } = continuityHarness();
  const before = structuredClone(target.metadata);
  const context = await reader.readForContact('lin');
  assert.deepEqual([...new Set(context.phoneContext.map(row => row.conversationId))].sort(), ['current', 'observer', 'plans']);
  const agreement = context.phoneContext.find(row => row.source.id === 'agreement');
  assert.deepEqual(agreement.knownToIds, ['lin', 'zhou', '@user']);
  assert.equal(agreement.author.personId, 'zhou');
  assert.equal(agreement.time, '2026-10-18 15:31');
  assert.equal(agreement.sourceBatch.key, '[0,"2026-10-18","15:30"]');
  assert.equal(agreement.translation, 'Meet here at nineteen on Tuesday.');
  assert.equal(agreement.replyTo.messageText, '[图片：周二见面地点的路牌]');
  assert.deepEqual(context.phoneContext.find(row => row.conversationId === 'observer').knownToIds, ['lin', 'other']);
  assert.equal(JSON.stringify(context).includes('/secret/'), false);
  assert.equal(JSON.stringify(context).includes('无关群秘密'), false);
  assert.deepEqual(context.storyProgress.messages.map(row => row.text), ['后来约定已取消，改成休息。', '此刻在家。']);
  assert.equal(context.storyProgress.complete, true);
  const group = await reader.readForGroup('current');
  assert.deepEqual([...new Set(group.phoneContext.map(row => row.conversationId))], ['plans']);
  assert.equal(group.previousMessages.filter(row => row.text === '当前群不重复').length, 1);
  assert.deepEqual(target.metadata, before);
  assert.equal(h.metadataSaves, 0); assert.equal(h.modelRequests.length, 0);
  assert.deepEqual(store.read().todos, []);
});

test('shared public material excludes private groups while known authors keep their own references', async () => {
  const { h, target, store, reader } = continuityHarness();
  const before = structuredClone(target.metadata);
  const authors = [...store.read().contacts.slice(0, 2).map(person => ({ ...person, kind: 'contact' })), { id: 'npc', name: '路人', kind: 'npc' }];
  for (const context of [await reader.readForSocial(authors), await reader.readForSocial([authors.at(-1)]), await reader.readForLiangshi(), await reader.readForLiangshiHot(), await reader.readForForum()]) {
    assert.equal('groupHistories' in context, false);
    assert.equal(JSON.stringify(context.phoneContext || []).includes('只有两位成员知道的安排'), false);
    assert.equal(JSON.stringify(context.phoneContext || []).includes('周二十九点这里见'), false);
    assert.ok((context.authors || []).every(author => !('privateHistory' in author)));
  }
  assert.equal(h.metadataSaves, 0); assert.equal(h.modelRequests.length, 0);
  assert.deepEqual(target.metadata, before);
});

test('real private arrangements retain later story progress and remain scoped to the participating contact', async () => {
  const { h, target, store, reader } = continuityHarness();
  target.metadata.pocketPhone.conversations.lin = [{ id: 'private-agreement', role: 'assistant', text: '明天把书带给你。', batch: { key: '[0]' } }];
  const lin = await reader.readForContact('lin'), zhou = await reader.readForContact('zhou');
  assert.equal(lin.previousMessages[0].text, '明天把书带给你。');
  assert.ok(JSON.stringify(lin.storyProgress).includes('约定已取消'));
  assert.equal(JSON.stringify(zhou).includes('明天把书带给你'), false);
  const group = await reader.readForGroup('current');
  assert.equal(JSON.stringify(group).includes('明天把书带给你'), false);
  const authors = store.read().contacts.slice(0,2).map(person => ({ ...person, kind: 'contact' }));
  const social = await reader.readForSocial(authors);
  assert.equal(JSON.stringify(social.phoneContext).includes('明天把书带给你'), false); assert.ok(JSON.stringify(social.authors.find(person => person.id === 'lin').phoneContext).includes('明天把书带给你')); assert.equal(JSON.stringify(social.authors.find(person => person.id === 'zhou').phoneContext || []).includes('明天把书带给你'), false);
  assert.ok(social.authors.every(author => !('privateHistory' in author)));
  assert.equal(h.metadataSaves, 0); assert.equal(h.modelRequests.length, 0);
});

test('group reference budget counts the complete projected JSON including long replies and preserves whole recent messages', async () => {
  const { h, target, reader } = continuityHarness();
  const state = target.metadata.pocketPhone;
  state.conversations.plans = [
    { id: 'outside', speakerId: 'lin', text: '引用'.repeat(4000) },
    ...Array.from({ length: 10 }, (_, index) => ({ id: `m-${index}`, speakerId: 'zhou', text: `${index}:${'整句'.repeat(60)}`, timeLabel: `16:${index}`, batch: { key: '[0]' }, ...(index === 9 ? { replyToId: 'outside' } : {}) })),
  ];
  let context = await reader.readForContact('lin');
  assert.ok(JSON.stringify(context.phoneContext).length <= 6000);
  assert.ok(context.phoneContext.some(row => row.source.id === 'm-9' && row.excerpted && row.replyTo.messageText.startsWith('[节选]')), 'the recent message keeps a bounded quote excerpt');
  delete state.conversations.plans.at(-1).replyToId;
  context = await reader.readForContact('lin');
  const plans = context.phoneContext.filter(row => row.conversationId === 'plans');
  assert.equal(plans.length, 8);
  assert.deepEqual(new Set(plans.map(row => row.text)), new Set(state.conversations.plans.slice(-8).map(row => row.text)));
  assert.ok(JSON.stringify(context.phoneContext).length <= 6000);
  for (let index = 0; index < 12; index++) {
    const id = `extra-${index}`;
    state.groups.push({ id, name: `群${index}`, memberIds: ['lin'], userIsMember: false });
    state.conversations[id] = [{ id, speakerId: 'lin', text: '完整长句'.repeat(200), batch: { key: '[0]' } }];
  }
  context = await reader.readForContact('lin');
  assert.ok(JSON.stringify(context.phoneContext).length <= 6000, 'one budget covers all groups together');
  assert.ok(new Set(context.phoneContext.map(row => row.conversationId)).size < state.groups.length - 1);
  for (const row of context.phoneContext.filter(row => row.conversationId.startsWith('extra-'))) assert.ok(row.text === '完整长句'.repeat(200) || row.excerpted && row.text.startsWith('[节选]'));
  assert.equal(h.metadataSaves, 0); assert.equal(h.modelRequests.length, 0);
});

for (const hostKind of ['native', 'luker']) test(`${hostKind}: actual SMS/group/social services receive scoped groups in their original single request`, async () => {
  const { h, target, store, reader } = continuityHarness(hostKind);
  const modelClient = createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) });
  const requestInput = () => JSON.parse(h.modelRequests.at(-1).body.messages.find(row => row.role === 'user').content);
  h.completion = { choices: [{ message: { content: '{"messages":[{"text":"好，那就休息。"}],"todoSuggestions":[]}' } }] };
  await createMessageService({ target, store, contextReader: reader, modelClient }).continueChat('lin');
  assert.equal(h.modelRequests.length, 1); assert.equal(h.metadataSaves, 1);
  assert.ok(requestInput().phoneContext.some(row => row.conversationId === 'plans'));
  assert.ok(JSON.stringify(requestInput().storyProgress).includes('约定已取消'));
  h.completion = { choices: [{ message: { content: '{"anchor":{"memberIds":["lin","zhou","@user"],"speakerIds":["lin"]},"messages":[{"speakerId":"lin","text":"知道，改日再约。"}],"todoSuggestions":[]}' } }] };
  await createGroupService({ target, store, contextReader: reader, modelClient }).continueChat('current');
  assert.equal(h.modelRequests.length, 2); assert.equal(h.metadataSaves, 2);
  assert.deepEqual([...new Set(requestInput().phoneContext.map(row => row.conversationId))], ['plans']);
  const social = createSocialService({ store, contextReader: reader, modelClient, random: () => 0 });
  h.completion = (_path, init) => {
    const input = JSON.parse(JSON.parse(init.body).messages[1].content);
    const body = input.task === 'comment' ? { comments: [{ authorId: 'lin', text: '谢谢。' }] } : {
      posts: input.authors.filter(person => person.kind !== 'npc').map(person => ({ authorId: person.id, image:{description:'街边风景。'}, text: '休息一下。', publishedAt: '2026-10-18 19:00' })),
    };
    return { choices: [{ message: { content: JSON.stringify(body) } }] };
  };
  await social.refresh();
  assert.equal(h.modelRequests.length, 3); assert.equal(h.metadataSaves, 3);
  assert.equal(requestInput().phoneContext.some(row => row.source.app === 'messages'), false);
  const post = store.read().social.posts.find(row => row.authorId === 'lin');
  await social.comment(post.id, '今天好好休息');
  assert.equal(h.modelRequests.length, 4); assert.equal(h.metadataSaves, 5, 'one user-comment save plus one original response save');
  assert.equal(requestInput().phoneContext.some(row => row.source.app === 'messages'), false);
  assert.ok(!JSON.stringify(requestInput()).includes('无关群秘密'));
  assert.equal(store.read().todos, undefined);
});

test('剧情正文副本共用包裹规则，短信自身文本和原始时间楼保持原样', async () => {
  const raw = '[[<content>草稿</content>]]<content>正式正文</content><!-- SDC-end | date=2026-10-18 | time=15:30 -->';
  const h = createHarness({ messages: [{ is_user: false, mes: raw }], metadata: { pocketPhone: {
    contacts: [{ id: 'lin', name: '林舟' }], groups: [], conversations: { lin: [{ id: 'sms', role: 'assistant', text: '[DRAFT]短信自身文字[/DRAFT]', batch: { key: '[-1,"2026-10-18","15:30"]' } }] },
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null, wrapperSettingsProvider: () => ({ keepTags: 'content', extraTags: '[[...]]' }) });
  const context = await reader.readForContact('lin');
  assert.equal(context.story[0].text, '正式正文');
  assert.equal(context.storyProgress.messages[0].text, '正式正文');
  assert.match(JSON.stringify(context.previousMessages), /短信自身文字/);
  assert.equal(target.messages[0].mes, raw);
  assert.match(context.batch.key, /2026-10-18/);
});

test('进展范围只考察近期6条候选，清空不回找旧楼且净文字计量', async () => {
  const messages = [{ is_user: false, mes: '<content>不应回找的旧楼</content>' },
    ...Array.from({ length: 6 }, () => ({ is_user: false, mes: '[[草稿]]' }))];
  messages.at(-1).mes += '<!-- SDC-end | date=2026-10-18 | time=15:30 -->';
  const h = createHarness({ messages, metadata: { pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }], groups: [], conversations: { lin: [{ id: 'sms', role: 'assistant', text: '约定', batch: { key: '[-1,"2026-10-18","15:30"]' } }] } } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null, wrapperSettingsProvider: () => ({ keepTags: 'content', extraTags: '[[...]]' }) });
  const result = await reader.readForContact('lin');
  assert.deepEqual(result.storyProgress.messages, []);
  assert.equal(result.storyProgress.complete, false);
});

test('进展6000完整JSON预算计算净正文，保留来源时间且后续读取新共享值', async () => {
  const messages = [
    { is_user: false, mes: `[[${'草'.repeat(20000)}]]<content>${'甲'.repeat(9000)}</content>` },
    { is_user: false, mes: `<content>${'乙'.repeat(9000)}</content><!-- QQJ-end | date=2026-10-18 | time=15:30 -->` },
  ];
  const h = createHarness({ messages, metadata: { pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }], groups: [], conversations: { lin: [{ id: 'sms', role: 'assistant', text: '约定', batch: { key: '[-1,"2026-10-18","15:30"]' } }] } } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  let wrappers = { keepTags: 'content', extraTags: '[[...]]' };
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null, wrapperSettingsProvider: () => wrappers });
  const result = await reader.readForContact('lin');
  assert.ok(JSON.stringify(result.storyProgress).length <= 6000); assert.equal(result.storyProgress.messages.length, 2); assert.ok(result.storyProgress.messages[0].text.endsWith('甲')); assert.ok(result.storyProgress.messages[1].text.endsWith('乙')); assert.equal(JSON.stringify(result.storyProgress).includes('草'), false);
  assert.equal(result.storyProgress.complete, false);
  assert.equal(result.clock.time, '15:30');
  wrappers = { keepTags: '', extraTags: '' };
  assert.deepEqual((await reader.readForForum()).storyBackground, []);
  assert.deepEqual(target.messages, messages);
});

test('SMS continuity retains recent prior batches and scopes proactive references to their own contact', async () => {
  const h = createHarness({ messages: [
    { is_user: false, mes: '午后休假。<!-- SDC-end | date=2026-10-18 | time=15:30 -->' },
    { is_user: true, mes: '继续。' },
    { is_user: false, mes: '傍晚还在休息。<!-- SDC-end | date=2026-10-18 | time=17:30 -->' },
  ], metadata: { pocketPhone: {
    contacts: [{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }, { id: 'other', name: '旁人' }], groups: [],
    conversations: {
      lin: [{ id: 'agreement', role: 'assistant', text: '这三天不安排工作，周二晚七点书店见。', translation: 'No work for three days.',
        storyDate: '2026-10-18', timeLabel: '15:30', batch: { key: '[0,"2026-10-18","15:30"]' } }],
      zhou: [{ role: 'user', text: '周予的私信，只给周予。', batch: { key: 'older' } }],
      other: [{ role: 'user', text: '未入选人物的私信。', batch: { key: 'older' } }],
    }, social: { posts: [], npcs: [], feedIds: [] },
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  const before = structuredClone(target.metadata);
  const contact = await reader.readForContact('lin');
  assert.deepEqual(contact.history, [], 'current batch still means current batch');
  assert.equal(contact.previousMessages[0].text, '这三天不安排工作，周二晚七点书店见。');
  assert.equal(contact.previousMessages[0].translation, 'No work for three days.');
  assert.equal(contact.previousMessages[0].time, '2026-10-18 15:30');
  const authors = store.read().contacts.slice(0, 2).map(person => ({ ...person, kind: 'contact' }));
  const plain = await reader.readForSocial(authors);
  assert.equal(JSON.stringify(plain.phoneContext).includes('这三天不安排工作'), false); assert.ok(JSON.stringify(plain.authors.find(author=>author.id==='lin').phoneContext).includes('这三天不安排工作')); assert.equal(JSON.stringify(plain.authors.find(author=>author.id!=='lin')?.phoneContext||[]).includes('这三天不安排工作'),false);
  const proactive = await reader.readForSocial(authors);
  assert.equal(JSON.stringify(proactive.phoneContext).includes('这三天不安排工作'), false);
  assert.equal(JSON.stringify(proactive.phoneContext).includes('周予的私信'), false); assert.ok(JSON.stringify(proactive.authors.find(author=>author.id==='zhou').phoneContext).includes('周予的私信'));
  assert.equal(JSON.stringify(proactive.authors[0]).includes('周予的私信'), false);
  assert.equal(JSON.stringify(proactive).includes('未入选人物的私信'), false);
  assert.deepEqual(target.metadata, before);
  assert.equal(h.modelRequests.length, 0);
});

test('SMS receives saved public feed posts across story floors without image files, private sources or another model', async () => {
  const h = createHarness({ messages: [{ is_user: false, mes: '新一楼。' }], metadata: { pocketPhone: {
    contacts: [{ id: 'lin', name: '林舟' }], conversations: {}, groups: [], social: { npcs: [], feedIds: ['post'], posts: [
      { id: 'post', authorId: 'lin', text: 'The bookshop is open.', translation: '书店开门了。', publishedAt: '2026-10-18 18:00',
        batch: { key: 'earlier-floor' }, image: { description: '书店窗边', path: '/private/full-image.png' },
        comments: [{ name: '小满', text: 'See you there.', translation: '那里见。' }] },
      { id: 'older', authorId: 'lin', text: '不把整份人物历史带入。', publishedAt: '2026-09-01 18:00' },
    ] },
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const before = structuredClone(target.metadata);
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  for (const context of [await reader.readForContact('lin'), await (async () => {
    await store.saveGroup('', { name: '读书群', memberIds: ['lin'], userIsMember: true });
    return reader.readForGroup(store.read().groups[0].id);
  })()]) {
    const post = context.phoneContext.find(row => row.source.id === 'post');
    assert.equal(post.author.personId, 'lin'); assert.equal(post.text, 'The bookshop is open.');
    assert.equal(post.translation, '书店开门了。'); assert.equal(post.time, '2026-10-18 18:00');
    assert.deepEqual(post.image, { description: '书店窗边' });
    const comment = context.phoneContext.find(row => row.source.kind === 'comment');
    assert.equal(comment.author.name, '小满'); assert.equal(comment.text, 'See you there.');
    assert.equal(comment.translation, '那里见。');
    assert.ok(!JSON.stringify(context.phoneContext).includes('/private/'));
    assert.ok(context.phoneContext.some(row => row.source.id === 'older'), 'already saved public history participates within the shared budget');
  }
  assert.deepEqual(target.metadata.pocketPhone.social, before.pocketPhone.social);
  assert.equal(h.modelRequests.length, 0);
});

test('forum receives one story background and setting without user identity or private recall', async () => {
  const latest = '周予经过广场。<!-- QQJ-end | date=2026-10-18 | time=18:00 -->';
  const h = createHarness({ messages: [
    { is_user: false, mes: '上一楼，不作为论坛背景。' },
    { is_user: false, name: '叙述', mes: latest },
    { is_user: true, mes: '随后用户的私下发言。' },
  ], metadata: { foreign: { keep: true } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.saveUserProfile({ name: '用户私有姓名', nickname: '用户私有网名' });
  await store.upsertContacts([{ id: 'lin', name: '林舟', source: { kind: 'qqj', entityId: 'q1' } }]);
  await store.appendMessage('lin', { id: 'private-sms', role: 'user', text: '短信私有内容' });
  const scans = [], readWorldInfo = target.readWorldInfo;
  target.readWorldInfo = options => { scans.push(options); return readWorldInfo(options); };
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => { throw new Error('论坛不应访问人物记忆'); } });
  const before = structuredClone(target.metadata), saves = h.metadataSaves;
  const context = await reader.readForForum();
  assert.deepEqual(Object.keys(context).sort(), ['clock', 'defaultLanguage', 'phoneContext', 'setting', 'storyBackground', 'worldbook']);
  assert.deepEqual(context.storyBackground, [{ speaker: '叙述', text: '周予经过广场。' }]);
  assert.ok(context.setting.includes(target.character.description));
  assert.equal(context.clock.time, '18:00');
  assert.deepEqual(scans, [{ scanText: '周予经过广场。' }], 'worldbook activation uses the actual latest AI narrative copy');
  const serialized = JSON.stringify(context);
  for (const privateText of ['用户私有姓名', '用户私有网名', '短信私有内容', '随后用户的私下发言', '上一楼']) assert.equal(serialized.includes(privateText), false);
  assert.deepEqual(target.metadata, before);
  assert.equal(h.metadataSaves, saves);
  assert.equal(h.modelRequests.length, 0);
});

test('reads one AI floor and a bounded current/past tail without removing saved history', async () => {
  const history = Array.from({ length: 1000 }, (_, i) => ({ id: `m${i}`, role: i % 2 ? 'assistant' : 'user', text: `短信${i}`, batch: { key: i < 800 ? 'older' : '[999]', label: '时间卡口' }, createdAt: new Date(2026, 9, 1, 0, i).toISOString() }));
  const h = createHarness({ messages: Array.from({ length: 1000 }, (_, i) => ({ mes: `剧情${i}`, is_user: false })), metadata: { pocketPhone: { schemaVersion: 1, contacts: [{ id: 'lin', name: '林舟' }], conversations: { lin: history }, forum: { posts: [] }, injectEnabled: false } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const reader = createContextReader({ target, store });
  const context = await reader.readForContact('lin');
  assert.equal(context.history.length, 12);
  assert.equal(context.history[0].text, '短信988');
  assert.equal(context.previousMessages.length, 4);
  assert.equal(context.previousMessages[0].text, '短信796', 'prior context is a bounded tail, without duplicating the current batch');
  assert.equal(context.story.length, 1);
  assert.equal(context.story[0].text, '剧情999');
  assert.equal(store.read().conversations.lin.length, 1000);
  assert.equal(await createBackflowService({ target, store, modelClient: { complete() { throw Error('关闭回流时不请求摘要'); } } }).prepare(), '');
});

test('forum context excludes private SMS and QQJ author-side background', async () => {
  const h = createHarness();
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'lin', name: '林舟', source: { kind: 'qqj', entityId: 'q1' } }]);
  await store.appendMessage('lin', { text: '私聊密码', role: 'user' });
  const bridge = { getStatus: () => ({ status: 'ready' }), readContext: () => ({ status: 'ready', routerText: '作者侧秘密', actors: [{ entityId: 'q1', memoryText: '林舟的相关记忆' }] }) };
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => bridge });
  assert.equal((await reader.readForContact('lin')).related, '林舟的相关记忆');
  const forum = await reader.readForForum();
  assert.ok(!JSON.stringify(forum).includes('私聊密码'));
  assert.ok(!JSON.stringify(forum).includes('作者侧秘密'));
});


test('group continuation excludes private arrangements not shared by all possible speakers', async () => {
  const h = createHarness({ messages: [{ is_user: false, mes: '约定之后事情已经办完。' }], metadata: { pocketPhone: {
    contacts: [{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }, { id: 'other', name: '旁人' }],
    groups: [{ id: 'g', name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: true }], conversations: {
      lin: [{ id: 'l', role: 'assistant', text: '我明天把书带给你。', batch: { key: '[-1]' } }],
      zhou: [{ id: 'z', role: 'user', text: '只同周予说过的话。', batch: { key: '[-1]' } }],
      other: [{ id: 'o', role: 'assistant', text: '群外人物私信不提供。' }],
    },
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const context = await createContextReader({ target, store, qqjBridgeProvider: () => null }).readForGroup('g');
  assert.equal('privateHistories' in context, false);
  assert.equal(JSON.stringify(context).includes('我明天把书带给你'), false);
  assert.equal(JSON.stringify(context).includes('只同周予说过'), false);
  assert.ok(!JSON.stringify(context).includes('群外人物私信不提供'));
  assert.equal('storyProgress' in context, false, 'no eligible phone source is projected for this group');
  assert.equal(h.modelRequests.length, 0);
});

test('default language is read live by every generation context without overriding contact language or exposing forum profiles', async () => {
  const h = createHarness(), store = createPhoneStore({ target: h.host.captureChat() });
  await store.upsertContacts([{ id: 'a', name: '人物甲', language: '日语' }, { id: 'b', name: '人物乙' }]);
  const group = await store.saveGroup('', { name: '小组', memberIds: ['a', 'b'], userIsMember: true });
  const reader = createContextReader({ target: h.host.captureChat(), store, qqjBridgeProvider: () => null });
  assert.equal((await reader.readForContact('a')).defaultLanguage, '');
  await store.setDefaultLanguage('粤语');
  assert.equal((await reader.readForContact('a')).contact.language, '日语');
  for (const context of [await reader.readForContact('b'), await reader.readForGroup(group.id), await reader.readForSocial(store.read().contacts), await reader.readForForum()]) assert.equal(context.defaultLanguage, '粤语');
  const forum = await reader.readForForum();
  assert.equal('contacts' in forum, false); assert.equal('userProfile' in forum, false);
  await store.setDefaultLanguage('中文'); assert.equal((await reader.readForForum()).defaultLanguage, '中文');
});

for (const hostKind of ['native', 'luker']) test(`${hostKind}: Liangshi primary context adds one latest story while still excluding old drafts and phone history`, async () => {
  const h=createHarness({hostKind,messages:[{is_user:false,mes:'LATEST_STORY_SENTINEL<!-- QQJ-end | date=2031年4月8日 | time=06:07 -->'}],metadata:{pocketPhone:{contacts:[{id:'public',name:'公开联系人',expression:'简短',language:'日语',nickname:'PRIVATE_NICKNAME_SENTINEL',personality:'PRIVATE_PERSONALITY_SENTINEL'}],groups:[],conversations:{public:[{text:'PRIVATE_SMS_SENTINEL'}]},userProfile:{name:'PRIVATE_USER_SENTINEL'},defaultLanguage:'英语',liangshi:{accounts:[{name:'OLD_ACCOUNT_SENTINEL'}],posts:[{text:'OLD_POST_SENTINEL'}]}}}});
  h.context.characters[0].description='WORLD_SETTING_SENTINEL';const target=h.host.captureChat(),store=createPhoneStore({target}),scans=[];
  target.readWorldInfo=async options=>{scans.push(options.scanText);return 'WORLD_BOOK_SENTINEL';};
  const reader=createContextReader({target,store,qqjBridgeProvider:()=>{throw Error('fresh public feed does not read private memory');},wrapperSettingsProvider:()=>({})});
  const before=structuredClone(target.metadata),fresh=await reader.readForLiangshi();
  assert.deepEqual(Object.keys(fresh).sort(),['clock','defaultLanguage','emojis','knownContacts','setting','story','worldbook']);assert.equal(fresh.clock.time,'06:07');assert.equal(fresh.defaultLanguage,'英语');assert.ok(fresh.setting.includes('WORLD_SETTING_SENTINEL'));assert.equal(fresh.worldbook,'WORLD_BOOK_SENTINEL');assert.ok(fresh.emojis.length>0);
  assert.deepEqual(fresh.knownContacts.map(({phoneContext,...profile})=>profile),[{id:'public',name:'公开联系人',expression:'简短',language:'日语'}]);assert.ok(JSON.stringify(fresh.knownContacts[0].phoneContext).includes('PRIVATE_SMS_SENTINEL'));
  for(const sentinel of ['OLD_ACCOUNT_SENTINEL','OLD_POST_SENTINEL','PRIVATE_PERSONALITY_SENTINEL']){assert.equal(JSON.stringify(fresh).includes(sentinel),false);assert.equal(scans[0].includes(sentinel),false);}
  for(const sentinel of ['PRIVATE_NICKNAME_SENTINEL','PRIVATE_SMS_SENTINEL','PRIVATE_USER_SENTINEL'])assert.equal(scans[0].includes(sentinel),false);assert.ok(scans[0].includes('微博'));assert.ok(scans[0].includes('LATEST_STORY_SENTINEL'));assert.equal(fresh.story[0].text,'LATEST_STORY_SENTINEL');await reader.readForLiangshi({scanText:'MORE_PUBLIC_POST_SENTINEL',includeStory:false});assert.ok(scans[1].includes('MORE_PUBLIC_POST_SENTINEL'));assert.equal(scans[1].includes('LATEST_STORY_SENTINEL'),false);assert.deepEqual(target.metadata,before);assert.equal(h.modelRequests.length,0);assert.equal(h.metadataSaves,0);
});

for(const hostKind of ['native','luker'])test(`${hostKind}: hot ranking reads all bounded static book material and latest story without private phone history`,async()=>{
 const h=createHarness({hostKind,messages:[{is_user:false,mes:'HOT_STORY_PRIVATE<!-- QQJ-end | date=2031/4/8 | time=13:00 -->'}],metadata:{pocketPhone:{contacts:[{id:'lin',name:'PRIVATE_PHONE_NAME'}],conversations:{lin:[{text:'PRIVATE_SMS'}]},todos:[{title:'PRIVATE_TODO'}],liangshi:{posts:[{text:'OLD_POST'}],accounts:[{name:'OLD_ACCOUNT'}],topics:[{name:'OLD_TOPIC'}]},defaultLanguage:'日语'}}});
 const target=h.host.captureChat(),store=createPhoneStore({target});target.character.description='设定列出公众人物甲、公共机构乙及普通居民丙。';
 const reader=createContextReader({target,store,qqjBridgeProvider:()=>{throw Error('no private memory');},wrapperSettingsProvider:()=>({})});
 assert.equal(typeof reader.readForLiangshiHot,'function');const input=await reader.readForLiangshiHot();
 assert.deepEqual(Object.keys(input).sort(),['clock','setting','defaultLanguage','worldbook','story'].sort());assert.ok(input.setting.includes('普通居民丙'));assert.ok(input.worldbook.includes('周予性格爽快'));assert.equal(input.clock.time,'13:00');assert.equal(input.defaultLanguage,'日语');assert.equal(input.story[0].text,'HOT_STORY_PRIVATE');
 for(const marker of ['PRIVATE_PHONE_NAME','PRIVATE_SMS','PRIVATE_TODO','OLD_POST','OLD_ACCOUNT','OLD_TOPIC'])assert.equal(JSON.stringify(input).includes(marker),false,marker);
 assert.equal(h.modelRequests.length,0);assert.equal(h.metadataSaves,0);
});
