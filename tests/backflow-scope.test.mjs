import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './harness.mjs';
import {createPhoneStore} from '../src/store.js';
import {createBackflowService} from '../src/context.js';
import {readTimeline} from '../src/timeline.js';
function setup({userIsMember=true,rows=[]}={}){
 const h=createHarness({messages:[{is_user:false,mes:'普通正文。<!-- QQJ-end | date=2031年4月8日 | time=10:00 -->'}],metadata:{pocketPhone:{injectEnabled:true,contacts:[{id:'a',name:'甲'},{id:'b',name:'后来成员'},{id:'ua',name:'本人别号',identityOwnerId:'@user'}],groups:[{id:'g',name:'群聊',memberIds:['a','b','ua'],userIsMember}],conversations:{g:[]}}}}),target=h.host.captureChat(),batch=readTimeline(target.messages);h.context.chatMetadata.pocketPhone.conversations.g=rows.map((row,i)=>({role:'assistant',speakerId:'a',createdAt:`2031-04-08T10:00:${String(i).padStart(2,'0')}Z`,batch,...row}));
 const store=createPhoneStore({target}),calls=[];let answer={summary:'一条已确认的短信参考。'};const service=createBackflowService({target,store,modelClient:{complete:async request=>{calls.push(request);return typeof answer==='function'?answer(request):JSON.stringify(answer);}}});return{h,target,store,calls,service,answer:value=>{answer=value;}};
}

test('backflow excludes pre-join and explicit invalid group scopes while keeping legacy compatibility and filtering quotes',async()=>{
 const f=setup({rows:[{id:'secret',text:'不可知旧群内容',knownToIds:['a']},{id:'empty',text:'空scope不可知',knownToIds:[]},{id:'bad',text:'坏scope不可知',knownToIds:null},{id:'legacy',text:'旧版缺scope兼容'},{id:'new',text:'本人已知的新消息',knownToIds:['a','@user'],replyToId:'secret'}]});const before=structuredClone(f.store.read()),result=await f.service.prepare();assert.ok(result.includes('本人已知的新消息'));assert.ok(result.includes('旧版缺scope兼容'));for(const secret of ['不可知旧群内容','空scope不可知','坏scope不可知'])assert.equal(result.includes(secret),false,secret);assert.equal(f.calls.length,0);assert.equal(f.h.metadataSaves,0);assert.deepEqual(f.store.read(),before);
});

test('summary receives each frozen group scope instead of a current-roster grant',async()=>{
 const f=setup({rows:[{id:'first',text:'记录正文'.repeat(850),knownToIds:['a','@user']},{id:'second',text:'另一条参考。',knownToIds:['a','ua']}]});await f.service.prepare();assert.equal(f.calls.length,1);const input=JSON.parse(f.calls[0].messages[0].content),group=input.conversations[0];assert.equal(Object.hasOwn(group,'knownToIds'),false);assert.deepEqual(group.messages.map(row=>row.knownToIds),[['a','@user'],['a','ua']]);assert.equal(JSON.stringify(input.conversations).includes('后来成员'),false);assert.equal(f.h.metadataSaves,0);
});

test('a user-owned alias can carry only the group messages it actually knew without joining the main user slot',async()=>{
 const f=setup({userIsMember:false,rows:[{id:'old',text:'别号加入前旧消息',knownToIds:['a']},{id:'own',text:'本人别号参与消息',knownToIds:['a','ua']}]});const result=await f.service.prepare();assert.ok(result.includes('本人别号参与消息'));assert.equal(result.includes('别号加入前旧消息'),false);assert.equal(f.calls.length,0);assert.equal(f.h.metadataSaves,0);
});

test('short backflow identifies actual per-message knowers rather than implying later members knew it',async()=>{
 const f=setup({rows:[{id:'known',text:'已知事情。',knownToIds:['a','@user']}]});const result=await f.service.prepare();assert.ok(result.includes('知情'));assert.ok(result.includes('甲'));assert.equal(result.includes('后来成员'),false);assert.equal(f.calls.length,0);
});

for(const change of ['owner','scope','delete'])test(`a pending summary rechecks an expanded old quote parent after ${change} changes`,async()=>{
 const f=setup({rows:[{id:'parent',batch:{key:'previous',label:'之前'},text:'只经别号已知的父消息。',knownToIds:['a','ua']},{id:'child',text:'较长的当前短信'.repeat(600),knownToIds:['a','@user'],replyToId:'parent'}]});let resolve;f.answer(()=>new Promise(done=>{resolve=done;}));const pending=f.service.prepare();while(!resolve)await new Promise(done=>setTimeout(done,0));
 const input=JSON.parse(f.calls[0].messages[0].content);assert.deepEqual(input.conversations[0].messages.map(row=>row.id),['child']);assert.equal(input.conversations[0].messages[0].replyTo.messageId,'parent');
 if(change==='owner')await f.store.saveContact('ua',{name:'本人别号',identityOwnerId:''});else if(change==='delete')await f.store.deleteMessage('g','parent');else f.h.context.chatMetadata.pocketPhone.conversations.g.find(row=>row.id==='parent').knownToIds=['a'];
 resolve(JSON.stringify({summary:'旧父消息形成的摘要。'}));await assert.rejects(pending,/知情|参考|成员/);assert.equal(f.calls.length,1);assert.equal(f.h.metadataSaves,change==='scope'?0:1);
});

for(const long of [false,true])test(`quote parent keeps its own audience apart from the citing message (${long?'summary':'short'})`,async()=>{
 const f=setup({rows:[{id:'parent',batch:{key:'previous',label:'之前'},text:'只有甲和本人知道的父消息。',knownToIds:['a','@user']},{id:'child',text:long?'子消息正常正文'.repeat(600):'后来成员也看到的引用消息。',knownToIds:['a','b','@user'],replyToId:'parent'}]});const result=await f.service.prepare();
 if(long){const quote=JSON.parse(f.calls[0].messages[0].content).conversations[0].messages[0].replyTo;assert.deepEqual(quote.knownToIds,['a','@user']);assert.deepEqual(quote.knownTo,['甲','我']);}
 else {const label=result.match(/\[引用知情：([^\]]+)\]/)?.[1];assert.equal(label,'甲、我');assert.ok(result.includes('只有甲和本人知道的父消息。'));}
});

test('leaving a group does not erase frozen user or alias knowledge and does not grant unknown old messages',async()=>{
 const f=setup({userIsMember:false,rows:[{id:'user',text:'本人离群仍记得的旧消息。',knownToIds:['a','@user']},{id:'alias',text:'别号离群仍记得的旧消息。',knownToIds:['a','ua']},{id:'other',text:'本人从未知道的旧消息。',knownToIds:['a']},{id:'legacy',text:'旧版无scope不推定已知。'}]});f.h.context.chatMetadata.pocketPhone.groups[0].memberIds=['a'];const result=await f.service.prepare();assert.ok(result.includes('本人离群仍记得的旧消息。'));assert.ok(result.includes('别号离群仍记得的旧消息。'));assert.equal(result.includes('本人从未知道的旧消息。'),false);assert.equal(result.includes('旧版无scope不推定已知。'),false);assert.equal(f.calls.length,0);assert.equal(f.h.metadataSaves,0);
});

for(const location of ['child','parent'])for(const legacy of [false,true])test(`pending summary rejects scope narrowing for ${location} ${legacy?'legacy':'explicit'} audience`,async()=>{
 const scope=legacy?{}:{knownToIds:['a','b','@user']},f=setup({rows:[{id:'parent',batch:{key:'previous',label:'之前'},text:'父消息原文。',...(location==='parent'?scope:{knownToIds:['a','@user']})},{id:'child',text:'正常长短信正文'.repeat(600),replyToId:'parent',...(location==='child'?scope:{knownToIds:['a','@user']})}]});let resolve;f.answer(()=>new Promise(done=>{resolve=done;}));const pending=f.service.prepare();while(!resolve)await new Promise(done=>setTimeout(done,0));if(legacy)f.h.context.chatMetadata.pocketPhone.groups[0].memberIds=['a','ua'];else f.h.context.chatMetadata.pocketPhone.conversations.g.find(row=>row.id===location).knownToIds=['a','@user'];resolve(JSON.stringify({summary:'仍使用旧知情范围的摘要。'}));await assert.rejects(pending,/知情/);assert.equal(f.calls.length,1);assert.equal(f.h.metadataSaves,0);
});
for(const location of ['child','parent'])test(`pending summary accepts a reordered equivalent ${location} audience`,async()=>{
 const f=setup({rows:[{id:'parent',batch:{key:'previous',label:'之前'},text:'父消息原文。',knownToIds:['a','b','@user']},{id:'child',text:'正常长短信正文'.repeat(600),replyToId:'parent',knownToIds:['a','b','@user']}]});let resolve;f.answer(()=>new Promise(done=>{resolve=done;}));const pending=f.service.prepare();while(!resolve)await new Promise(done=>setTimeout(done,0));f.h.context.chatMetadata.pocketPhone.conversations.g.find(row=>row.id===location).knownToIds=['@user','b','a'];resolve(JSON.stringify({summary:'相同知情范围的摘要。'}));assert.ok((await pending).includes('相同知情范围的摘要。'));assert.equal(f.calls.length,1);assert.equal(f.h.metadataSaves,0);
});
