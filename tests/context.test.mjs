import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader, createBackflowService } from '../src/context.js';
import { createApiSettings, createModelClient } from '../src/api.js';
import { createMessageService } from '../src/messages.js';
import { createGroupService } from '../src/groups.js';
import { createSocialService } from '../src/social.js';

test('only the selected private account receives its remark; groups, public context, backflow and presets do not', async () => {
  const h = createHarness({ metadata: { pocketPhone: { schemaVersion: 1, contacts: [
    { id: 'lin', name: '林舟', remarkForUser: 'LIN_PRIVATE_REMARK' },
    { id: 'alias', name: '别号', identityOwnerId: 'lin', remarkForUser: 'ALIAS_PRIVATE_REMARK' },
    { id: 'zhou', name: '周予' },
  ], groups: [{ id: 'friends', name: '朋友群', memberIds: ['lin', 'zhou'], userIsMember: true }], conversations: { lin: [{ role: 'user', text: '晚点见。', batch: { key: '[-1]' } }] }, forum: { posts: [] }, injectEnabled: true } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target }), reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  const before = structuredClone(store.read());
  const own = await reader.readForContact('lin');
  assert.equal(own.contact.remarkForUser, 'LIN_PRIVATE_REMARK');
  assert.equal(JSON.stringify(own).includes('ALIAS_PRIVATE_REMARK'), false);
  const alias = await reader.readForContact('alias');
  assert.equal(alias.contact.remarkForUser, 'ALIAS_PRIVATE_REMARK');
  assert.equal(JSON.stringify(alias).includes('LIN_PRIVATE_REMARK'), false);
  const { createAuthoringService } = await import('../src/authoring.js');
  const exported = await createAuthoringService({ host: h.host, store, readEntries: () => ({}) }).exportScript({ coreUrl: 'https://example.invalid/embed.js' });
  const outputs = [await reader.readForContact('zhou'), await reader.readForGroup('friends'), await reader.readForSocial(store.read().contacts), await reader.readForForum(), await reader.readForLiangshi({ includePhoneContext: true }), await reader.readForLiangshiHot(), await reader.readDirectorySources(), await createBackflowService({ target, store, modelClient: { complete() { throw new Error('短消息不调用模型'); } } }).prepare(), exported];
  for (const output of outputs) for (const secret of ['remarkForUser', 'LIN_PRIVATE_REMARK', 'ALIAS_PRIVATE_REMARK']) assert.equal(JSON.stringify(output).includes(secret), false, secret);
  assert.deepEqual(store.read(), before); assert.equal(h.metadataSaves, 0); assert.equal(h.modelRequests.length, 0);
});

function continuityHarness(hostKind = 'native') {
  const sourceBatch = { key: '[0,"2026-10-18","15:30"]', label: '2026-10-18 15:30' };
  const h = createHarness({ hostKind, settings: { pocketPhone:{apiSourceRef:{kind:'shared-preset',presetId:'test'}}, 'schedule-planner': { apiPresets: [{ id: 'test', url: 'https://example.invalid/v1', key: 'synthetic', model: 'm' }] } }, messages: [
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

test('group references preserve member knowledge, full message projection and only the latest story without todos or writes', async () => {
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
  assert.deepEqual(context.story.map(row => row.text), ['此刻在家。']);
  assert.equal('storyProgress' in context, false);assert.equal(JSON.stringify(context).includes('后来约定已取消'),false);
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

test('real private arrangements retain their full saved history and remain scoped to the participating contact', async () => {
  const { h, target, store, reader } = continuityHarness();
  target.metadata.pocketPhone.conversations.lin = [{ id: 'private-agreement', role: 'assistant', text: '明天把书带给你。', batch: { key: '[0]' } }];
  const lin = await reader.readForContact('lin'), zhou = await reader.readForContact('zhou');
  assert.equal(lin.previousMessages[0].text, '明天把书带给你。');
  assert.equal('storyProgress' in lin,false);assert.deepEqual(lin.story.map(row=>row.text),['此刻在家。']);
  assert.equal(JSON.stringify(zhou).includes('明天把书带给你'), false);
  const group = await reader.readForGroup('current');
  assert.equal(JSON.stringify(group).includes('明天把书带给你'), false);
  const authors = store.read().contacts.slice(0,2).map(person => ({ ...person, kind: 'contact' }));
  const social = await reader.readForSocial(authors);
  assert.equal(JSON.stringify(social.phoneContext).includes('明天把书带给你'), false); assert.ok(JSON.stringify(social.authors.find(person => person.id === 'lin').phoneContext).includes('明天把书带给你')); assert.equal(JSON.stringify(social.authors.find(person => person.id === 'zhou').phoneContext || []).includes('明天把书带给你'), false);
  assert.ok(social.authors.every(author => !('privateHistory' in author)));
  assert.equal(h.metadataSaves, 0); assert.equal(h.modelRequests.length, 0);
});

test('group references preserve all projected messages and complete long quotes', async () => {
  const { h, target, reader } = continuityHarness();
  const state = target.metadata.pocketPhone;
  state.conversations.plans = [
    { id: 'outside', speakerId: 'lin', text: '引用'.repeat(4000) },
    ...Array.from({ length: 10 }, (_, index) => ({ id: `m-${index}`, speakerId: 'zhou', text: `${index}:${'整句'.repeat(60)}`, timeLabel: `16:${index}`, batch: { key: '[0]' }, ...(index === 9 ? { replyToId: 'outside' } : {}) })),
  ];
  let context = await reader.readForContact('lin');
  assert.ok(JSON.stringify(context.phoneContext).length > 6000);
  assert.equal(context.phoneContext.find(row=>row.source.id==='m-9').replyTo.messageText,'引用'.repeat(4000));assert.equal(context.phoneContext.some(row=>row.excerpted),false);
  delete state.conversations.plans.at(-1).replyToId;
  context = await reader.readForContact('lin');
  const plans = context.phoneContext.filter(row => row.conversationId === 'plans');
  assert.equal(plans.length, 11);
  assert.deepEqual(new Set(plans.map(row => row.text)), new Set(state.conversations.plans.map(row => row.text)));
  assert.ok(JSON.stringify(context.phoneContext).length > 6000);
  for (let index = 0; index < 12; index++) {
    const id = `extra-${index}`;
    state.groups.push({ id, name: `群${index}`, memberIds: ['lin'], userIsMember: false });
    state.conversations[id] = [{ id, speakerId: 'lin', text: '完整长句'.repeat(200), batch: { key: '[0]' } }];
  }
  context = await reader.readForContact('lin');
  assert.ok(JSON.stringify(context.phoneContext).length > 6000);
  assert.equal(new Set(context.phoneContext.filter(row=>row.conversationId.startsWith('extra-')).map(row=>row.conversationId)).size,12);
  for (const row of context.phoneContext.filter(row => row.conversationId.startsWith('extra-'))) assert.equal(row.text,'完整长句'.repeat(200));
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
  assert.equal('storyProgress' in requestInput(),false);assert.deepEqual(requestInput().story.map(row=>row.text),['此刻在家。']);
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
  assert.equal('storyProgress' in context,false);
  assert.match(JSON.stringify(context.previousMessages), /短信自身文字/);
  assert.equal(target.messages[0].mes, raw);
  assert.match(context.batch.key, /2026-10-18/);
});

test('最新一楼清空后不回找旧楼，也不附加进展材料', async () => {
  const messages = [{ is_user: false, mes: '<content>不应回找的旧楼</content>' },
    ...Array.from({ length: 6 }, () => ({ is_user: false, mes: '[[草稿]]' }))];
  messages.at(-1).mes += '<!-- SDC-end | date=2026-10-18 | time=15:30 -->';
  const h = createHarness({ messages, metadata: { pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }], groups: [], conversations: { lin: [{ id: 'sms', role: 'assistant', text: '约定', batch: { key: '[-1,"2026-10-18","15:30"]' } }] } } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null, wrapperSettingsProvider: () => ({ keepTags: 'content', extraTags: '[[...]]' }) });
  const result = await reader.readForContact('lin');
  assert.deepEqual(result.story, []);
  assert.equal('storyProgress' in result,false);
});

test('最新一楼净正文完整保留，来源时间及共享清洗规则照常读取', async () => {
  const messages = [
    { is_user: false, mes: `[[${'草'.repeat(20000)}]]<content>${'甲'.repeat(9000)}</content>` },
    { is_user: false, mes: `<content>${'乙'.repeat(9000)}</content><!-- QQJ-end | date=2026-10-18 | time=15:30 -->` },
  ];
  const h = createHarness({ messages, metadata: { pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }], groups: [], conversations: { lin: [{ id: 'sms', role: 'assistant', text: '约定', batch: { key: '[-1,"2026-10-18","15:30"]' } }] } } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  let wrappers = { keepTags: 'content', extraTags: '[[...]]' };
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null, wrapperSettingsProvider: () => wrappers });
  const result = await reader.readForContact('lin');
  assert.deepEqual(result.story.map(row=>row.text),['乙'.repeat(9000)]);assert.equal('storyProgress' in result,false);assert.equal(JSON.stringify(result.story).includes('甲'),false);assert.equal(JSON.stringify(result.story).includes('草'),false);
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

test('forum receives the selected user story with role while retaining private identity and recall isolation', async () => {
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
  assert.deepEqual(context.storyBackground, [{ role: 'user', speaker: '用户', text: '随后用户的私下发言。' }]);
  assert.ok(context.setting.includes(target.character.description));
  assert.equal(context.clock.time, '18:00');
  assert.deepEqual(scans, [{ scanText: '随后用户的私下发言。' }], 'worldbook activation uses the actual configured story records');
  const serialized = JSON.stringify(context);
  for (const privateText of ['用户私有姓名', '用户私有网名', '短信私有内容', '上一楼', '周予经过广场']) assert.equal(serialized.includes(privateText), false);
  assert.deepEqual(target.metadata, before);
  assert.equal(h.metadataSaves, saves);
  assert.equal(h.modelRequests.length, 0);
});

test('reads one AI floor, the full current private segment and full past history without removing saved history', async () => {
  const history = Array.from({ length: 1000 }, (_, i) => ({ id: `m${i}`, role: i % 2 ? 'assistant' : 'user', text: `短信${i}`, batch: { key: i < 800 ? 'older' : '[999]', label: '时间卡口' }, createdAt: new Date(2026, 9, 1, 0, i).toISOString() }));
  const h = createHarness({ messages: Array.from({ length: 1000 }, (_, i) => ({ mes: `剧情${i}`, is_user: false })), metadata: { pocketPhone: { schemaVersion: 1, contacts: [{ id: 'lin', name: '林舟' }], conversations: { lin: history }, forum: { posts: [] }, injectEnabled: false } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const reader = createContextReader({ target, store });
  const context = await reader.readForContact('lin');
  assert.equal(context.history.length, 200);
  assert.deepEqual(context.history.map(message => message.text), Array.from({ length: 200 }, (_, index) => `短信${800 + index}`));
  assert.equal(context.previousMessages.length, 800);
  assert.deepEqual(context.previousMessages.map(row=>row.text),Array.from({length:800},(_,i)=>`短信${i}`));
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

for(const hostKind of ['native','luker'])test(`${hostKind}: hot ranking reads all static book material and latest story without private phone history`,async()=>{
 const h=createHarness({hostKind,messages:[{is_user:false,mes:'HOT_STORY_PRIVATE<!-- QQJ-end | date=2031/4/8 | time=13:00 -->'}],metadata:{pocketPhone:{contacts:[{id:'lin',name:'PRIVATE_PHONE_NAME'}],conversations:{lin:[{text:'PRIVATE_SMS'}]},todos:[{title:'PRIVATE_TODO'}],liangshi:{posts:[{text:'OLD_POST'}],accounts:[{name:'OLD_ACCOUNT'}],topics:[{name:'OLD_TOPIC'}]},defaultLanguage:'日语'}}});
 const target=h.host.captureChat(),store=createPhoneStore({target});target.character.description='设定列出公众人物甲、公共机构乙及普通居民丙。';
 const reader=createContextReader({target,store,qqjBridgeProvider:()=>{throw Error('no private memory');},wrapperSettingsProvider:()=>({})});
 assert.equal(typeof reader.readForLiangshiHot,'function');const input=await reader.readForLiangshiHot();
 assert.deepEqual(Object.keys(input).sort(),['clock','setting','defaultLanguage','worldbook','story'].sort());assert.ok(input.setting.includes('普通居民丙'));assert.ok(input.worldbook.includes('周予性格爽快'));assert.equal(input.clock.time,'13:00');assert.equal(input.defaultLanguage,'日语');assert.equal(input.story[0].text,'HOT_STORY_PRIVATE');
 for(const marker of ['PRIVATE_PHONE_NAME','PRIVATE_SMS','PRIVATE_TODO','OLD_POST','OLD_ACCOUNT','OLD_TOPIC'])assert.equal(JSON.stringify(input).includes(marker),false,marker);
 assert.equal(h.modelRequests.length,0);assert.equal(h.metadataSaves,0);
});

test('complete card text and draft/following worldbook queries retain both ends beyond former caps',async()=>{
 const {target,reader,h}=continuityHarness(),queries=[];const description='CARD_HEAD'+'卡片'.repeat(8000)+'CARD_TAIL',story='STORY_HEAD'+'剧情'.repeat(6000)+'STORY_TAIL',seed='SEED_HEAD'+'素材'.repeat(6000)+'SEED_TAIL';target.character.description=description;target.messages.splice(0,target.messages.length,{is_user:false,mes:story});target.readWorldInfo=async options=>{queries.push(options?.scanText);return '完整世界';};
 const contact=await reader.readForContact('lin'),group=await reader.readForGroup('current'),following=await reader.readForLiangshiFollowing(),draft=await reader.readForLiangshiDraft({seed,imageSeed:'图种子'});assert.ok(contact.character.includes(description));assert.ok(group.character.includes(description));assert.ok(following.setting.includes(description));assert.ok(draft.setting.includes(description));for(const q of queries)assert.ok(q.includes(story));assert.ok(queries.at(-1).includes(seed));assert.equal(draft.seed,seed);assert.equal('storyProgress' in contact,false);assert.equal(h.metadataSaves,0);assert.equal(h.modelRequests.length,0);
});

test('story reference selects recent AI and user records with full raw user wrappers, roles and unchanged AI clock',async()=>{
 const user='<user_input> 真正用户输入😀\n'+'长'.repeat(25000)+'尾 </user_input>',messages=[{name:'角色',is_user:false,mes:'<content>OLD_AI</content>'},{is_system:true,mes:'SYSTEM_NEVER'},{name:'玩家',is_user:true,mes:'<user_input>USER_MIDDLE</user_input>'},{name:'角色',is_user:false,mes:'<analysis>HIDDEN_NEVER</analysis><content>AI_FULL</content><!-- QQJ-end | date=2031年4月8日 | time=09:30 -->'},{role:'system',mes:'SYSTEM_NEVER_TWO'},{name:'玩家',role:'user',mes:user},{is_user:false,mes:''},{mes:42}],h=createHarness({messages,metadata:{pocketPhone:{contacts:[{id:'a',name:'甲'}],groups:[],conversations:{}}}}),target=h.host.captureChat(),store=createPhoneStore({target}),reader=createContextReader({target,store,qqjBridgeProvider:()=>null,wrapperSettingsProvider:()=>({keepTags:'content',extraTags:'analysis'})});
 const initial=await reader.readForContact('a');assert.deepEqual(initial.story,[{role:'user',speaker:'玩家',text:user}]);assert.equal(initial.clock.time,'09:30');assert.ok(initial.batch.key.startsWith('[3,'));assert.equal(h.metadataSaves,0);assert.equal('storyReferenceFloors' in store.read(),false);
 store.read().storyReferenceFloors=2;const two=await reader.readForContact('a');assert.deepEqual(two.story,[{role:'assistant',speaker:'角色',text:'AI_FULL'},{role:'user',speaker:'玩家',text:user}]);
 store.read().storyReferenceFloors=100;assert.deepEqual((await reader.readForContact('a')).story.map(r=>r.text),['OLD_AI','<user_input>USER_MIDDLE</user_input>','AI_FULL',user]);store.read().storyReferenceFloors=0;assert.deepEqual((await reader.readForContact('a')).story,[]);
 store.read().storyReferenceFloors=1;target.messages.push({name:'角色',mes:'<analysis>ONLY_HIDDEN</analysis>'});assert.deepEqual((await reader.readForContact('a')).story,[],'a selected empty AI record does not refill from outside N');assert.equal(h.metadataSaves,0);assert.equal(h.modelRequests.length,0);assert.equal(h.settingsSaves,0);
});

test('story reference has no maximum, keeps every configured record and reaches all existing readers and one real service payload',async()=>{
 const messages=Array.from({length:1205},(_,i)=>({name:i%2?'玩家':'角色',is_user:Boolean(i%2),mes:i%2?'<user_input>USER_'+i+'</user_input>':'AI_'+i})),h=createHarness({messages,metadata:{pocketPhone:{contacts:[{id:'a',name:'甲'}],groups:[{id:'g',name:'群',memberIds:['a'],userIsMember:true}],conversations:{},storyReferenceFloors:1000}}}),target=h.host.captureChat(),store=createPhoneStore({target}),reader=createContextReader({target,store,qqjBridgeProvider:()=>null});const expected=messages.slice(-1000).map(m=>m.mes);
 for(const input of [await reader.readForContact('a'),await reader.readForGroup('g'),await reader.readForSocial([]),await reader.readDirectorySources(),await reader.readForForum(),await reader.readForLiangshi(),await reader.readForLiangshiHot(),await reader.readForLiangshiFollowing(),await reader.readForLiangshiDraft({seed:'种子',imageSeed:''})])assert.deepEqual((input.story||input.storyBackground).map(r=>r.text),expected);
 assert.equal('story' in await reader.readForLiangshi({includeStory:false}),false);assert.equal('storyBackground' in await reader.readForForum({continuation:true}),false);store.read().storyReferenceFloors=100;assert.equal((await reader.readForContact('a')).story.length,100);store.read().storyReferenceFloors=1e100;assert.deepEqual((await reader.readForContact('a')).story.map(r=>r.text),messages.map(m=>m.mes));for(const value of [undefined,-1,1.5,'',Infinity,NaN,null]){store.read().storyReferenceFloors=value;assert.equal((await reader.readForContact('a')).story.length,1);}store.read().storyReferenceFloors=2;const calls=[];await createMessageService({target,store,contextReader:reader,modelClient:{complete:async q=>{calls.push(JSON.parse(q.messages[0].content));return JSON.stringify({messages:[{text:'回复。'}]});}}}).continueChat('a');assert.deepEqual(calls[0].story.map(r=>r.text),messages.slice(-2).map(m=>m.mes));assert.deepEqual(calls[0].story.map(r=>r.role),['user','assistant']);assert.equal(calls.length,1);assert.equal(h.metadataSaves,1);assert.equal(h.settingsSaves,0);target.messages.length=0;assert.deepEqual((await reader.readForContact('a')).story,[]);
});

test('story reference cleans imported SMS per selected AI floor and backflow regeneration selects before the old reply',async()=>{
 const messages=[{name:'角色',mes:'<content>AI_ZERO[tmt|甲|甲]FIRST_SMS[/tmt]</content>'},{name:'玩家',is_user:true,mes:'<user_input>USER_RAW</user_input>'},{name:'角色',mes:'<content>AI_TWO[tmt|甲|甲]SECOND_SMS[/tmt]</content>'}],h=createHarness({messages,metadata:{pocketPhone:{contacts:[{id:'a',name:'甲'}],groups:[],conversations:{a:[{id:'first',role:'assistant',text:'FIRST_SMS',source:{kind:'main-story',floor:0,block:0},batch:{key:'[0]'}},{id:'second',role:'assistant',text:'SECOND_SMS',source:{kind:'main-story',floor:2,block:0},batch:{key:'[2]'}}]},storyReferenceFloors:3,injectEnabled:true}}}),target=h.host.captureChat(),store=createPhoneStore({target}),reader=createContextReader({target,store,qqjBridgeProvider:()=>null,wrapperSettingsProvider:()=>({keepTags:'content'})});assert.deepEqual((await reader.readForContact('a')).story.map(r=>r.text),['AI_ZERO','<user_input>USER_RAW</user_input>','AI_TWO']);
 target.messages.push({name:'角色',mes:'OLD_ANSWER_EXCLUDED'});store.read().conversations.a.push({id:'long',role:'user',text:'长'.repeat(4000),batch:{key:'[2]'}});store.read().storyReferenceFloors=2;const calls=[];await createBackflowService({target,store,wrapperSettingsProvider:()=>({keepTags:'content'}),modelClient:{complete:async q=>{calls.push(JSON.parse(q.messages[0].content));return JSON.stringify({summary:'参考。'});}}}).prepare('regenerate');assert.equal(calls.length,1);assert.deepEqual(calls[0].story.map(r=>r.text),['<user_input>USER_RAW</user_input>','AI_TWO']);assert.equal(JSON.stringify(calls[0]).includes('OLD_ANSWER_EXCLUDED'),false);assert.equal(h.metadataSaves,0);
});


test('WeChat omits ambient forum posts while preserving explicit shares, complete SMS and other public sources', async () => {
  const { h, target, store, reader } = continuityHarness();
  const state = target.metadata.pocketPhone;
  const shared = '我转述论坛那段：' + '这是我选择分享的完整原话。'.repeat(900);
  state.forum = { posts: [{ id: 'ambient', title: '未分享的论坛标题', author: '匿名', content: '未分享的论坛全文'.repeat(900), comments: [{ id: 'ambient-reply', author: '网友', text: '未分享的完整论坛回帖'.repeat(300) }] }] };
  state.social = { npcs: [], feedIds: ['photo'], posts: [{ id: 'photo', authorId: 'lin', text: '仍允许的公开动态'.repeat(900), image: { description: '完整图片说明'.repeat(300) }, comments: [] }] };
  const current = { key: '[2,"2026-10-18","19:30"]', label: '2026-10-18 19:30' };
  for (const [id, group] of [['lin', false], ['current', true]]) {
    state.conversations[id] = [
      { id: id + '-share', role: 'user', ...(group ? { speakerId: '@user' } : {}), text: shared, storyDate: '2026-10-18', timeLabel: '15:30', batch: { key: '[0]', label: '过去' } },
      { id: id + '-reply', role: 'assistant', ...(group ? { speakerId: 'lin' } : {}), text: '已经看到了。', translation: 'Already read it.', batch: current },
      { id: id + '-now', role: 'user', ...(group ? { speakerId: '@user', replyToId: id + '-share' } : {}), type: 'image', image: { description: '这张我发来的图'.repeat(900) }, batch: current },
    ];
  }
  const before = structuredClone(target.metadata);
  for (const context of [await reader.readForContact('lin'), await reader.readForGroup('current')]) {
    assert.equal(context.phoneContext.some(row => row.source.app === 'forum'), false);
    assert.equal(context.previousMessages[0].text, shared);
    assert.equal(context.history[0].translation, 'Already read it.');
    assert.equal(context.history[1].text, '[图片：' + '这张我发来的图'.repeat(900) + ']');
    assert.equal(context.phoneContext.find(row => row.source.id === 'photo').text, '仍允许的公开动态'.repeat(900));
    assert.equal(context.phoneContext.find(row => row.source.id === 'photo').image.description, '完整图片说明'.repeat(300));
  }
  const group = await reader.readForGroup('current');
  assert.equal(group.history[1].replyTo.messageText, shared);
  const social = await reader.readForSocial(store.read().contacts.map(person => ({ ...person, kind: 'contact' })));
  assert.equal(social.phoneContext.find(row => row.source.id === 'ambient').text, state.forum.posts[0].content);
  assert.equal(social.phoneContext.find(row => row.source.id === 'ambient-reply').text, state.forum.posts[0].comments[0].text);
  assert.deepEqual(target.metadata, before);
  assert.equal(h.metadataSaves, 0); assert.equal(h.settingsSaves, 0); assert.equal(h.modelRequests.length, 0);
});

test('private and group model requests end in full previous/current SMS without changing their values or request count', async () => {
  const { h, target, store, reader } = continuityHarness();
  const current = { key: '[2,"2026-10-18","19:30"]', label: '2026-10-18 19:30' };
  const state = target.metadata.pocketPhone;
  state.contacts[0].expression = '按人设连发；使用表情包。';
  state.conversations.lin = [{ role: 'user', text: '前面的分享完整保留。'.repeat(1000), batch: { key: '[0]' } }, { role: 'user', text: '我知道了，你先休息。', batch: current }];
  state.conversations.current = [{ role: 'user', speakerId: '@user', text: '旧群消息完整保留。'.repeat(1000), batch: { key: '[0]' } }, { role: 'user', speakerId: '@user', text: '我们都确认过了。', batch: current }];
  const modelClient = createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) });
  for (const [id, group] of [['lin', false], ['current', true]]) {
    const context = group ? await reader.readForGroup(id) : await reader.readForContact(id);
    h.completion = { choices: [{ message: { content: JSON.stringify(group ? { anchor: { memberIds: ['lin', 'zhou', '@user'], speakerIds: ['lin'] }, messages: [{ speakerId: 'lin', text: '收到。' }] } : { messages: [{ text: '收到。' }] }) } }] };
    const calls = h.modelRequests.length;
    const service = group ? createGroupService({ target, store, contextReader: reader, modelClient }) : createMessageService({ target, store, contextReader: reader, modelClient });
    await service.continueChat(id);
    assert.equal(h.modelRequests.length, calls + 1);
    const body = h.modelRequests.at(-1).body;
    assert.equal(body.messages.length, 2);
    const input = JSON.parse(body.messages[1].content);
    assert.deepEqual(input, JSON.parse(JSON.stringify(context)));
    assert.deepEqual(Object.keys(input).slice(-2), ['previousMessages', 'history']);
    assert.equal(input.history.at(-1).text, group ? '我们都确认过了。' : '我知道了，你先休息。');
    assert.equal(body.messages[0].content.includes(group ? 'messages每轮合计至少6条' : 'messages每轮至少3条'), true);
    assert.equal(store.read().conversations[id].at(-1).text, '收到。');
  }
  assert.equal(state.contacts[0].expression, '按人设连发；使用表情包。');
});
