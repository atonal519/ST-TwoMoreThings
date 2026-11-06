import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostAdapter } from '../src/host.js';

test('blue constants, green primary/secondary rules, regex and disabled entries use captured chat sources', async () => {
  const ctx = { chatId: 'test', chat: [], chatMetadata: { world_info: '当前世界' }, name1: '小满', characters: [{ name: '林舟' }], characterId: 0 };
  const entries = {
    0: { constant: true, content: '蓝灯背景' },
    1: { key: ['书店'], content: '命中绿灯' },
    2: { key: ['咖啡馆'], content: '不应出现' },
    3: { constant: true, disable: true, content: '禁用不应出现' },
    4: { key: ['书店'], selective: true, keysecondary: ['朋友'], selectiveLogic: 0, content: '次键命中' },
    5: { key: ['书店'], selective: true, keysecondary: ['朋友'], selectiveLogic: 2, content: '排除不应出现' },
    6: { key: ['/book\\s*shop/i'], content: '正则命中' },
  };
  const host = createHostAdapter({ contextProvider: () => ctx, worldInfoBindings: { getNames: () => ['当前世界'], load: async () => ({ entries }) } });
  const text = await host.captureChat().readWorldInfo({ scanText: '和朋友去书店 Book shop' });
  assert.ok(text.includes('蓝灯背景'));
  assert.ok(text.includes('命中绿灯'));
  assert.ok(text.includes('次键命中'));
  assert.ok(text.includes('正则命中'));
  assert.ok(!text.includes('不应出现'));
});

test('all eligible worldbook entries and their full text survive beyond 24k',async()=>{
 const ctx={chatId:'long',chat:[],chatMetadata:{},name1:'我',characters:[{name:'甲',description:'卡片'}],characterId:0};const first='FIRST_HEAD'+'设定'.repeat(15000)+'FIRST_TAIL',last='LAST_AFTER_24K';const host=createHostAdapter({contextProvider:()=>ctx,worldInfoBindings:{getNames:()=>['长书'],load:async()=>({entries:{0:{constant:true,content:first},1:{key:['QUERY_HEAD'],content:last},2:{disable:true,constant:true,content:'DISABLED_NEVER'}}})}});const text=await host.captureChat().readWorldInfo({scanText:'QUERY_HEAD'+'检索'.repeat(8000)+'QUERY_TAIL'});assert.equal(text,'\n'+first+'\n\n\n'+last);assert.ok(text.length>24000);
});

for (const scan of [undefined, { scanText: 'MATCH' }]) test(`shared QQJ book exclusions apply before every worldbook load (${scan ? 'scan' : 'no scan'}) without settings writes or content caps`, async () => {
  let writes = 0; const loaded = [], long = 'HEAD' + '完整设定'.repeat(12000) + 'TAIL';
  const exclusions = ['Résumé', ...Array.from({ length: 11 }, (_, i) => `旧排除${i}`)];
  const ctx = { chatId: 'test', chat: [], chatMetadata: { world_info: ['RESUME', 'allowed'] }, extensionSettings: { 'schedule-planner': { wiExcludeBooks: exclusions }, qianqianjie: { sourceWorldInfoExcludedBooks: ['allowed'] } }, saveSettingsDebounced: () => writes++, name1: '我', characters: [{ name: '甲', data: { extensions: { world: 'RESUME' } } }], characterId: 0 };
  const before = structuredClone(ctx.extensionSettings), host = createHostAdapter({ contextProvider: () => ctx, worldInfoBindings: { getNames: () => ['RESUME', 'allowed'], load: async name => { loaded.push(name); if (name === 'RESUME') throw new Error('excluded book must not load'); return { entries: { 1: { constant: true, content: long } } }; } } });
  const target = host.captureChat(); assert.equal(await target.readWorldInfo(scan), '\n' + long); assert.deepEqual(loaded, ['allowed']); assert.equal(writes, 0); assert.deepEqual(ctx.extensionSettings, before);
  ctx.extensionSettings = { ...ctx.extensionSettings, 'schedule-planner': { wiExcludeBooks: [] } };
  await assert.rejects(target.readWorldInfo(scan), /excluded book must not load/, 'empty latest shared list is authoritative rather than an old local fallback'); assert.equal(writes, 0);
});

test('every context consumer uses the same pre-load shared exclusion while retaining complete allowed material', async () => {
  const { createContextReader } = await import('../src/context.js');
  const state = { contacts: [{ id: 'p', name: '甲', personality: '设定', expression: '短句' }], groups: [{ id: 'g', name: '测试群', memberIds: ['p'], userIsMember: true }], conversations: {}, forum: { posts: [] } };
  const ctx = { chatId: 'test', chat: [{ is_user: false, mes: '<content>MATCH</content>' }], chatMetadata: { pocketPhone: state }, extensionSettings: { 'schedule-planner': { wiExcludeBooks: ['excluded'] } }, characters: [{ name: '甲' }], characterId: 0, name1: '我' }, loads = [];
  const long = 'ALLOWED_HEAD' + '完整'.repeat(22000) + 'ALLOWED_TAIL';
  const host = createHostAdapter({ contextProvider: () => ctx, worldInfoBindings: { getNames: () => ['excluded', 'allowed'], load: async name => { loads.push(name); assert.equal(name, 'allowed'); return { entries: { 0: { constant: true, content: long } } }; } } });
  const target = host.captureChat(), reader = createContextReader({ target, store: { read: () => state, readSaved: async () => state }, calendar: { context: () => null }, memorySources: { select: () => ({ kind: 'none' }), readStoryMemory: () => '' }, qqjBridgeProvider: () => null });
  for (const read of [() => reader.readForContact('p'), () => reader.readForGroup('g'), () => reader.readForForum(), () => reader.readForForum({ continuation: true }), () => reader.readForForum({ scope: 'circle' }), () => reader.readForLiangshi(), () => reader.readForLiangshiHot(), () => reader.readForLiangshiFollowing(), () => reader.readForLiangshiDraft({ seed: 'MATCH', imageSeed: '' }), () => reader.readForSocial(state.contacts)]) {
    assert.equal((await read()).worldbook, '\n' + long);
  }
  assert.deepEqual(loads, Array(10).fill('allowed'));
});
