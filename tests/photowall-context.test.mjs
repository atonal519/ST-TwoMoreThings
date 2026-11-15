import test from 'node:test';
import assert from 'node:assert/strict';
import { createContextReader } from '../src/context.js';

function setup({ contacts = [], items = [], persona = '', user = '雎酒', identity = 'chat', status = 'ready' } = {}) {
  const state = { contacts, conversations: { a: [{ text: 'PRIVATE_SMS' }] }, groups: [], forum: { posts: [{ content: 'FORUM_SECRET' }] }, photoWall: { photos: [{ prompt: 'OLD_PHOTO_PROMPT' }] } };
  let snapshots = 0; const worldCalls = [];
  const target = { id: 'chat', user, userPersona: persona, messages: [{ mes: 'STORY_SECRET' }], character: { name: 'UNSELECTED_CARD', description: 'CARD_SECRET' }, readWorldInfo: async options => { worldCalls.push(options); return 'MATCHED_WORLD_PROFILE'; } };
  const reader = createContextReader({ target, store: { read: () => state, readSaved: async () => state }, qqjBridgeProvider: () => ({ getPeopleSnapshot() { snapshots++; return { status, identity: { hostChatId: identity }, people: { status: 'ready', items } }; }, getSnapshot() { assert.fail('no full memory snapshot'); }, readContext() { assert.fail('no recall'); } }), memorySources: { select() { assert.fail('no story memory selection'); }, readStoryMemory() { assert.fail('no story memory'); } } });
  return { reader, worldCalls, get snapshots() { return snapshots; } };
}
const pair = names => names.map(name => ({ name, scope: 'chat', tag: `appearance:${name}`, nl: `外貌:${name}` }));

test('only selected people use public aliases/stable contact ownership and preserve manual empty personality', async () => {
  const s = setup({ contacts: [{ id: 'main', name: '本名', personality: 'PHONE_MUST_NOT_REFILL', expression: 'PHONE_STYLE', source: { kind: 'qqj', entityId: 'entity-a' } }, { id: 'alias', name: '网名', identityOwnerId: 'main' }], items: [{ entityId: 'entity-a', displayName: '公开本名', aliases: ['A别名'], profile: { name: '本名', personality: '', conduct: '有分寸', manualFields: ['personality'] } }, { entityId: 'entity-b', displayName: '乙', aliases: ['B别名'], profile: { personality: '克制', background: '相关背景' } }, { entityId: 'unrelated', displayName: '无关', profile: { personality: 'UNRELATED_PROFILE' } }] });
  const input = await s.reader.readForPhotoWall(pair(['网名', 'B别名']));
  assert.equal(s.snapshots, 1); assert.equal(input.people.length, 2);
  assert.equal(input.people[0].profile.personality, ''); assert.deepEqual(input.people[0].profile.manualFields, ['personality']);
  assert.equal(input.people[0].phoneProfile?.personality, undefined); assert.equal(input.people[1].profile.personality, '克制');
  assert.doesNotMatch(JSON.stringify(input), /PHONE_MUST_NOT_REFILL|UNRELATED_PROFILE|PRIVATE_SMS|FORUM_SECRET|OLD_PHOTO_PROMPT|STORY_SECRET|CARD_SECRET/);
  assert.equal(s.worldCalls.length, 1); assert.ok(s.worldCalls[0].requiredNames.includes('A别名')); assert.ok(s.worldCalls[0].requiredNames.includes('乙'));
});

test('full persona name is an independent candidate rather than guessed ownership from short host username', async () => {
  const s = setup({ persona: '我的姓名为关雎酒，性格从容。' });
  const input = await s.reader.readForPhotoWall(pair(['关雎酒', '萧煜']));
  assert.equal(input.people[0].profile, null); assert.equal(input.userPersona.text, '我的姓名为关雎酒，性格从容。');
  assert.equal(input.userPersona.userName, '雎酒'); assert.match(input.userPersona.source, /仅当原文姓名明确/);
  assert.equal(input.userPersona.matchedNames, undefined);
  const unrelated = await s.reader.readForPhotoWall(pair(['甲', '乙'])); assert.equal(unrelated.userPersona, undefined);
});

test('explicit user ownership or public specialRole binds persona, no QQJ or matching profile still permits a pair', async () => {
  const s = setup({ persona: '用户人设原文', contacts: [{ id: 'user-account', name: '用户的公开名', identityOwnerId: '@user' }] });
  const input = await s.reader.readForPhotoWall(pair(['用户的公开名', '陌生人']));
  assert.deepEqual(input.userPersona.matchedNames, ['用户的公开名']); assert.equal(input.people[1].profile, null);
  const q = setup({ persona: '另一个写法的人设', items: [{ entityId: 'u', displayName: '全名', aliases: ['BBH名'], specialRole: 'user', profile: null }] });
  assert.deepEqual((await q.reader.readForPhotoWall(pair(['BBH名', '乙']))).userPersona.matchedNames, ['BBH名']);
  const absent = setup({ status: 'disabled' }); assert.equal((await absent.reader.readForPhotoWall(pair(['甲', '乙']))).people.length, 2);
});

test('stale chat snapshots and ambiguous public aliases do not assign another person profile', async () => {
  const items = [{ entityId: 'a', displayName: '甲', aliases: ['同名'], profile: { personality: 'WRONG_A' } }, { entityId: 'b', displayName: '乙', aliases: ['同名'], profile: { personality: 'WRONG_B' } }];
  const stale = setup({ items, identity: 'other-chat' }), ambiguous = setup({ items });
  assert.equal((await stale.reader.readForPhotoWall(pair(['甲', '乙']))).people[0].profile, null);
  const input = await ambiguous.reader.readForPhotoWall(pair(['同名', '其他'])); assert.equal(input.people[0].profile, null); assert.doesNotMatch(JSON.stringify(input), /WRONG_A|WRONG_B/);
});


test('unavailable bridge and unavailable profiles do not require a second source or invent personality', async () => {
  const state = { contacts: [], conversations: {}, groups: [], forum: { posts: [] } }, target = { id: 'chat', user: '我', userPersona: '', readWorldInfo: async () => '' };
  const reader = createContextReader({ target, store: { read: () => state, readSaved: async () => state }, qqjBridgeProvider: () => null });
  const input = await reader.readForPhotoWall(pair(['甲', '乙']));
  assert.deepEqual(input.people.map(person => person.profile), [null, null]); assert.equal(input.worldbook, ''); assert.equal(input.userPersona, undefined);
});

test('generic user identity labels confirm ownership without expanding worldbook name queries', async () => {
  const s = setup({ persona: '当前用户人设', contacts: [{ id: 'b', name: '周予', nickname: '   ' }], items: [{ entityId: 'u', displayName: '我', entityDisplayName: '用户', aliases: ['周予', 'user', '@user', '   '], specialRole: 'user', profile: { name: '周予', personality: '从容' } }] });
  const input = await s.reader.readForPhotoWall(pair(['林舟', '周予']));
  assert.deepEqual(input.userPersona.matchedNames, ['周予']);
  assert.deepEqual(s.worldCalls[0].requiredNames.sort(), ['周予', '林舟'].sort());
  assert.equal(s.worldCalls[0].scanText.includes('我'), false); assert.equal(s.worldCalls[0].scanText.includes('   '), false);
});

test('ordinary first-person words in unrelated constants never enter the selected-pair model material', async () => {
  const { createHostAdapter } = await import('../src/host.js');
  const state = { contacts: [], conversations: {}, groups: [], forum: { posts: [] } };
  const ctx = { chatId: 'chat', chat: [], chatMetadata: { pocketPhone: state }, name1: '我', extensionSettings: {}, characters: [], characterId: 0 };
  const host = createHostAdapter({ contextProvider: () => ctx, worldInfoBindings: { getNames: () => ['allowed'], load: async () => ({ entries: { 0: { constant: true, content: '我只是无关的常驻说明 FOREIGN_CONSTANT_SECRET' }, 1: { constant: true, content: '周予有明确的处事习惯 NAMED_PERSONALITY' } } }) } });
  const reader = createContextReader({ target: host.captureChat(), store: { read: () => state, readSaved: async () => state }, qqjBridgeProvider: () => ({ getPeopleSnapshot: () => ({ status: 'ready', identity: { hostChatId: 'chat' }, people: { status: 'ready', items: [{ entityId: 'u', displayName: '我', aliases: ['周予'], specialRole: 'user', profile: null }] } }) }) });
  const input = await reader.readForPhotoWall(pair(['林舟', '周予']));
  assert.match(input.worldbook, /NAMED_PERSONALITY/); assert.doesNotMatch(JSON.stringify(input), /FOREIGN_CONSTANT_SECRET/);
});
