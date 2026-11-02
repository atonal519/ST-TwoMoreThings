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
