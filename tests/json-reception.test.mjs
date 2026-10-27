import test from 'node:test';
import assert from 'node:assert/strict';
import {parseJsonObject,parsePayload,createApiSettings,createModelClient} from '../src/api.js';
import {createHarness} from './harness.mjs';
import {createPhoneStore} from '../src/store.js';
import {createContextReader} from '../src/context.js';
import {createLiangshiService,readLiangshiFollowingFeed} from '../src/liangshi.js';

const body='前段\n\n说了 "some words"\n继续。😀🌙 [合十]，地址 https://example.invalid/a?q=1，括号 {保留}。';
const translation='译文 "原样"\n下一行👍';
const malformed=value=>JSON.stringify(value).replaceAll(String.raw`\"`,'"');

test('strict JSON remains exact, including literal code fences, escapes, nulls and existing wrappers',()=>{
 const value={messages:[{text:'原文 ```json {保留} \\ "引用"\n😀',translation}],empty:null,zero:0};
 assert.deepEqual(parseJsonObject(JSON.stringify(value)),value);
 assert.deepEqual(parseJsonObject('说明\n```json\n'+JSON.stringify({data:value})+'\n```'),value);
 assert.deepEqual(parsePayload(JSON.stringify(value),'messages'),value.messages);
 assert.deepEqual(parseJsonObject('说明 '+JSON.stringify(value)+' 结束'),value);
});

test('complete multiline text with unescaped embedded quotes is repaired without losing text or emoji',()=>{
 const value={messages:[{text:body,translation}]};
 assert.deepEqual(parseJsonObject(malformed(value)),value);
 assert.deepEqual(parseJsonObject('```json\n'+malformed({result:value})+'\n```'),value);
 assert.deepEqual(parsePayload(malformed(value),'messages'),value.messages);
});

test('the shared path accepts missing commas and trailing commas for SMS, contacts and forum while keeping their schemas',()=>{
 assert.deepEqual(parsePayload('{"messages":[{"text":"你好"} {"text":"再见"},]}','messages'),[{text:'你好'},{text:'再见'}]);
 assert.deepEqual(parsePayload(malformed({contacts:[{name:'林舟',expression:body}]}),'contacts'),[{name:'林舟',personality:'',expression:body}]);
 assert.deepEqual(parsePayload(malformed({posts:[{title:'街角',author:'路人',content:body}]}),'forum'),[{title:'街角',author:'路人',content:body,comments:[],category:''}]);
 assert.throws(()=>parsePayload('{"messages":[{"role":"user","text":"别代写",}]}','messages'),/没有可用/);
});

test('repair does not promote incomplete values, containers, strings, numbers or Unicode into a complete answer',()=>{
 for(const source of ['{"messages":[{"text":}]}','{"messages":[{"text":"未完成}]}','{"messages":[{"text":"正文"}}','{"messages":[{"text":"正文"}]','{"value":2e}','{"value":2.}','{"value":-}','{"text":"末尾'+String.raw`\u12`+'}','{"messages":[...]}']) {
  assert.throws(()=>parseJsonObject(source),undefined,source);
 }
});

test('repair does not extract malformed inner fragments from prose, thought tags or multiple answers',()=>{
 const part=malformed({messages:[{text:body}]});
 for(const source of ['说明 '+part+' 结束','<think>仅思考 '+part+'</think>','```json\n'+part+'\n```\n```json\n'+part+'\n```',part+'\n'+part])assert.throws(()=>parseJsonObject(source));
});

function setup(hostKind){
 const h=createHarness({hostKind,settings:{'schedule-planner':{apiPresets:[{id:'p',url:'https://fixture.invalid/v1',key:'synthetic',model:'m'}]}},metadata:{pocketPhone:{contacts:[{id:'lin',name:'林舟'}],groups:[],conversations:{},liangshi:{accounts:[{id:'own',ownerId:'@user',name:'本人',handle:'owner-handle'}],posts:[{id:'own-post',authorId:'own',userAuthored:true,text:'本人已发布',comments:[],reposts:[]}],userPostIds:['own-post'],feedIds:[],followingFeedIds:[],topics:[]}}}});
 const target=h.host.captureChat(),store=createPhoneStore({target}),reader=createContextReader({target,store,qqjBridgeProvider:()=>null});
 const service=createLiangshiService({store,contextReader:reader,modelClient:createModelClient({host:h.host,sourceProvider:createApiSettings({host:h.host})})});
 return{h,store,service};
}
for(const hostKind of ['native','luker'])test(`${hostKind}: the actual client and Following service accept fifteen repaired posts in one request/save without relaxing ownership`,async()=>{
 const{h,store,service}=setup(hostKind);
 const posts=Array.from({length:15},(_,i)=>({authorKey:'a',text:body+i,translation}));
 const answer={accounts:[{key:'a',name:'街角记录',handle:'street'},{key:'spoof',name:'冒用者',handle:'owner-handle',ownerId:'@user'}],posts:[...posts,{authorKey:'spoof',text:'不应冒用本人'},{authorKey:'missing',text:'身份不明'}]};
 h.completion={choices:[{finish_reason:'stop',message:{content:'```json\n'+malformed(answer)+'\n```',reasoning_content:'不用这段推理'}}]};
 const saved=await service.refreshFollowing();assert.equal(saved.length,15);assert.deepEqual(saved.map(p=>p.text),posts.map(p=>p.text));assert.ok(saved.every(p=>p.translation===translation));
 assert.equal(h.modelRequests.length,1);assert.equal(h.metadataSaves,1);assert.equal(h.settingsSaves,0);assert.equal('max_tokens'in h.modelRequests[0].body,false);
 assert.equal(store.read().liangshi.accounts.filter(a=>a.ownerId==='@user').length,1);assert.equal(service.getPost('own-post').text,'本人已发布');assert.equal(readLiangshiFollowingFeed(store.read().liangshi).length,15);
});

test('unusable syntax and reasoning-only answers keep the previous batch and do not trigger a repair request or save',async()=>{
 const{h,store,service}=setup('native'),before=structuredClone(store.read());
 for(const content of ['{"accounts":[],"posts":[{"text":}]}','无法生成']){
  h.completion={choices:[{finish_reason:'stop',message:{content,reasoning_content:JSON.stringify({accounts:[],posts:[]})}}]};
  await assert.rejects(service.refreshFollowing());assert.deepEqual(store.read(),before);assert.equal(h.metadataSaves,0);
 }
 h.completion={choices:[{message:{content:'',reasoning_content:'{"messages":[{"text":"不能当正文"}]}'}}]};await assert.rejects(service.refreshFollowing(),/没有返回正文/);
 assert.equal(h.modelRequests.length,3);assert.equal(h.metadataSaves,0);
});
