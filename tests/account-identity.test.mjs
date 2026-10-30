import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './harness.mjs';
import {createPhoneStore} from '../src/store.js';
import {createContextReader} from '../src/context.js';
import {createApiSettings,createModelClient} from '../src/api.js';
import {createLiangshiService} from '../src/liangshi.js';
import {createMessageService} from '../src/messages.js';
import {createGroupService} from '../src/groups.js';
import {createSocialService} from '../src/social.js';
import {createAuthoringService,stateFromPreset} from '../src/authoring.js';
import {readPhoneContext,readableGroupMessages} from '../src/phone-context.js';
import {readTimeline} from '../src/timeline.js';

function setup(kind='native'){
 const past={key:'[0,"2031/4/8","08:00"]'},current={key:'[1,"2031/4/8","09:30"]'};
 const h=createHarness({hostKind:kind,settings:{pocketPhone:{apiSourceRef:{kind:'shared-preset',presetId:'p'}}, 'schedule-planner':{apiPresets:[{id:'p',url:'https://fixture.invalid/v1',key:'synthetic',model:'m'}]}},messages:[{is_user:false,mes:'旧楼'},{is_user:false,mes:'当前普通场景<!-- QQJ-end | date=2031/4/8 | time=09:30 -->'}],metadata:{pocketPhone:{contacts:[
  {id:'a',name:'林舟',personality:'MAIN_PERSONALITY',expression:'主号表达',source:{kind:'qqj',entityId:'qa'},extensionKeep:'keep'},
  {id:'b',name:'路边纸袋',identityOwnerId:'a',personality:'NOT_AUTHORITY',expression:'小号表达',avatar:'https://fixture.invalid/avatar.png'},
  {id:'c',name:'周予',personality:'另一人'},{id:'same',name:'林舟'},{id:'ua',name:'自己的小号',identityOwnerId:'@user'}],
  groups:[{id:'g',name:'小群',memberIds:['a','b','ua'],userIsMember:true}],
  conversations:{a:[{id:'a-old',role:'assistant',text:'A_PAST',batch:past}],b:[{id:'b-old',role:'assistant',text:'B_PAST',batch:past},{id:'b-now',role:'assistant',text:'B_CURRENT',batch:current}],ua:[{id:'u-old',role:'assistant',text:'USER_ALIAS_PAST',batch:past}],g:[{id:'g-old',speakerId:'a',role:'assistant',text:'A_SCOPE',knownToIds:['a'],batch:past}]},
  userProfile:{name:'本人',nickname:'当前昵称'},liangshi:{accounts:[{id:'self',ownerId:'@user',name:'旧名字',handle:'current-account'},{id:'other',name:'其他作者',handle:'other'}],posts:[{id:'own',authorId:'self',userAuthored:true,text:'本人正文',likes:0,comments:[],reposts:[]},{id:'other-post',authorId:'other',text:'别人正文',comments:[],reposts:[]}],userPostIds:['own'],feedIds:['other-post'],followingFeedIds:[],topics:[]},social:{posts:[],npcs:[],feedIds:[]}}}});
 h.context.powerUserSettings={persona_description:'另一个名为other-handle的摄影账号有很多读者，但不是本次当前账号。'};
 const target=h.host.captureChat(),store=createPhoneStore({target}),bridge={getStatus:()=>({status:'ready'}),readContext:async()=>({status:'ready',actors:[{entityId:'qa',memoryText:'MAIN_QQJ_MEMORY'}]})},reader=createContextReader({target,store,qqjBridgeProvider:()=>bridge});
 const client=createModelClient({host:h.host,sourceProvider:createApiSettings({host:h.host})});
 const answer=value=>{h.completion={choices:[{message:{content:JSON.stringify(value)}}]};};
 return{h,target,store,reader,bridge,client,answer,ls:createLiangshiService({store,contextReader:reader,modelClient:client}),sms:createMessageService({target,store,contextReader:reader,modelClient:client}),groups:createGroupService({target,store,contextReader:reader,modelClient:client})};
}

for(const kind of ['native','luker'])test(`${kind}: own More receives the actual account and persona background, accepts explicit zero without a save`,async()=>{
 const{h,store,ls,answer}=setup(kind),before=structuredClone(store.read());answer({comments:[],reposts:[]});
 const result=await ls.loadMore('own');assert.equal(result,null);assert.deepEqual(store.read(),before);assert.equal(h.metadataSaves,0);assert.equal(h.modelRequests.length,1);
 const input=JSON.parse(h.modelRequests[0].body.messages[1].content);assert.equal(input.currentAccount.name,'当前昵称');assert.equal(input.currentAccount.handle,'current-account');assert.equal(input.userPersona,h.context.powerUserSettings.persona_description);assert.equal('story'in input,false);
 answer({comments:[{authorId:'other',text:'只有一条评论'}]});await ls.loadMore('own');assert.equal(h.metadataSaves,1);assert.equal(ls.getPost('own').comments.length,1);assert.equal(ls.getPost('own').reposts.length,0);
});

test('zero compatibility does not swallow missing fields, malformed arrays, invalid authors or ordinary empty More',async()=>{
 const{h,ls,answer}=setup();for(const bad of [{},{comments:[]},{comments:'无',reposts:[]},{comments:[{authorId:'missing',text:'坏归属'}],reposts:[]}]){answer(bad);await assert.rejects(ls.loadMore('own'));}answer({comments:[],reposts:[]});await assert.rejects(ls.loadMore('other-post'));assert.equal(h.metadataSaves,0);
});

test('manual owner changes flatten dependents, preserve unknown fields and omitted ownership, and detach on root deletion',async()=>{
 const{store}=setup();await store.saveContact('a',{name:'林舟',identityOwnerId:'b'});assert.equal(store.read().contacts.find(p=>p.id==='a').identityOwnerId,undefined);assert.equal(store.read().contacts.find(p=>p.id==='b').identityOwnerId,'a');
 await store.saveContact('a',{name:'林舟',identityOwnerId:'c'});
 assert.equal(store.read().contacts.find(p=>p.id==='a').identityOwnerId,'c');assert.equal(store.read().contacts.find(p=>p.id==='b').identityOwnerId,'c');assert.equal(store.read().contacts.find(p=>p.id==='a').extensionKeep,'keep');
 await store.saveContact('b',{name:'路边纸袋',expression:'仍独立'});assert.equal(store.read().contacts.find(p=>p.id==='b').identityOwnerId,'c');
 await store.saveContact('b',{name:'路边纸袋',identityOwnerId:''});assert.equal(store.read().contacts.find(p=>p.id==='b').identityOwnerId,undefined);
 await assert.rejects(store.saveContact('b',{name:'路边纸袋',identityOwnerId:'missing'}));
 await store.upsertContacts([{id:'a',name:'林舟',identityOwnerId:'@user'}]);assert.equal(store.read().contacts.find(p=>p.id==='a').identityOwnerId,'c');
 await store.deleteContact('c');assert.equal(store.read().contacts.find(p=>p.id==='a').identityOwnerId,undefined);
});

test('card export remaps owner references and import keeps explicit user ownership while old packages remain independent',async()=>{
 const{store,h}=setup();const result=await createAuthoringService({store,host:h.host}).exportScript();const preset=result.script.data.twoMoreThings;
 const alias=preset.contacts.find(p=>p.name==='路边纸袋'),main=preset.contacts.find(p=>p.name==='林舟'&&p.personality==='MAIN_PERSONALITY');assert.equal(alias.identityOwnerId,main.id);assert.equal(preset.contacts.find(p=>p.name==='自己的小号').identityOwnerId,'@user');
 const restored=stateFromPreset(preset);assert.equal(restored.contacts.find(p=>p.id===alias.id).identityOwnerId,main.id);assert.deepEqual(restored.conversations,{});
 const bad=structuredClone(preset);bad.contacts[0].identityOwnerId='missing';assert.throws(()=>stateFromPreset(bad));const old=structuredClone(preset);old.contacts.forEach(p=>delete p.identityOwnerId);assert.ok(stateFromPreset(old).contacts.every(p=>!p.identityOwnerId));assert.equal(h.settingsSaves,0);
});

test('only stable same-owner history is shared; group audiences compare owners without rewriting or exposing their mapping',async()=>{
 const{store,target}=setup(),s=store.read(),anchor=readTimeline(target.messages),read=ids=>readPhoneContext(s,{anchor,targetIds:ids});
 const own=JSON.stringify(read(['a']));assert.ok(own.includes('B_PAST'));assert.equal(own.includes('B_CURRENT'),false);assert.equal(own.includes('identityOwnerId'),false);
 for(const id of ['c','same']){const x=JSON.stringify(read([id]));assert.equal(x.includes('B_PAST'),false);assert.equal(x.includes('A_PAST'),false);}
 assert.ok(JSON.stringify(read(['@user'])).includes('USER_ALIAS_PAST'));assert.equal(JSON.stringify(readPhoneContext(s,{anchor,publicOnly:true,targetIds:['a']})).includes('B_PAST'),false);
 assert.equal(readableGroupMessages(s,s.groups[0],['b']).length,1);assert.equal(readableGroupMessages(s,s.groups[0],['c']).length,0);assert.deepEqual(s.conversations.g[0].knownToIds,['a']);
});

test('alias continuation inherits main personality and QQJ while keeping account identity and expression',async()=>{
 const{reader}=setup();const c=await reader.readForContact('b');assert.equal(c.contact.name,'路边纸袋');assert.equal(c.contact.personality,'MAIN_PERSONALITY');assert.equal(c.contact.expression,'小号表达');assert.equal(c.related,'MAIN_QQJ_MEMORY');assert.equal(JSON.stringify(c).includes('identityOwnerId'),false);
});

test('only the acting alias sees its own explicit person identity, never outsiders, common group or public tasks',async()=>{
 const{reader}=setup();const own=await reader.readForContact('b');assert.deepEqual(own.actingPerson,{id:'a',name:'林舟'});assert.equal(own.contact.name,'路边纸袋');
 assert.deepEqual(own.ownAccounts,[{id:'a',name:'林舟'},{id:'b',name:'路边纸袋'}]);const main=await reader.readForContact('a');assert.deepEqual(main.actingPerson,{id:'a',name:'林舟'});assert.deepEqual(main.ownAccounts,own.ownAccounts);
 for(const context of [await reader.readForContact('c'),await reader.readForGroup('g'),await reader.readForLiangshi({includePhoneContext:true}),await reader.readForForum()]){assert.equal(JSON.stringify(context).includes('"actingPerson"'),false);assert.equal('ownAccounts'in context,false);}
});

test('a card/story main owner uses its unique QQJ name internally while the replying account keeps its own name',async()=>{
 for(const kind of ['card','story']){const{reader,bridge,store}=setup();store.read().contacts.find(p=>p.id==='a').source={kind};bridge.getPeopleSnapshot=()=>({status:'ready',people:{items:[{entityId:'qa',displayName:'林舟'}]}});const c=await reader.readForContact('b');assert.equal(c.related,'MAIN_QQJ_MEMORY');assert.equal(c.contact.name,'路边纸袋');assert.equal(JSON.stringify(c).includes('identityOwnerId'),false);}
});

test('user-owned aliases cannot be AI SMS speakers or group speakers/actions',async()=>{
 const{sms,groups,h,answer}=setup();await assert.rejects(sms.continueChat('ua'));assert.equal(h.modelRequests.length,0);
 answer({anchor:{memberIds:['a','b','ua','@user'],speakerIds:['ua']},messages:[{speakerId:'ua',text:'不能代本人发言'}]});await assert.rejects(groups.continueChat('g'));assert.equal(h.metadataSaves,0);
 answer({anchor:{memberIds:['a','b','ua','@user'],speakerIds:['a']},messages:[],transferActions:[{speakerId:'ua',transferId:'x',status:'accepted'}]});await assert.rejects(groups.continueChat('g'));assert.equal(h.metadataSaves,0);
});

test('a pending SMS cannot save an old owners private material after manual reassignment',async()=>{
 const{store,target,reader,h}=setup();let release,started;const waiting=new Promise(r=>started=r);const service=createMessageService({target,store,contextReader:reader,modelClient:{complete:()=>{started();return new Promise(r=>release=r);}}});
 const pending=service.continueChat('b');await waiting;await store.saveContact('b',{name:'路边纸袋',identityOwnerId:'c'});const before=structuredClone(store.read());release('{"messages":[{"text":"旧owner资料不能写给新owner"}]}');await assert.rejects(pending);assert.deepEqual(store.read(),before);assert.equal(h.metadataSaves,1);
});

test('public candidate sets exclude manually user-owned contacts and retired SMS fields remain inert',async()=>{
 const{store,reader,client,h}=setup();let input;h.completion=(_p,init)=>{input=JSON.parse(JSON.parse(init.body).messages[1].content);const author=input.authors.find(p=>p.kind==='contact');return{choices:[{message:{content:JSON.stringify({posts:[{authorId:author.id,image:{description:'公开场景。'},text:'普通公开动态'}],proactiveMessages:[{contactId:'ua',messages:[{text:'不能代本人发短信'}]}]})}}]};};
 await createSocialService({store,contextReader:reader,modelClient:client,random:()=>0}).refresh();assert.ok(!input.authors.some(p=>p.id==='ua'));assert.equal(store.read().conversations.ua.length,1);assert.equal(h.modelRequests.length,1);
 await store.updateSocial(s=>s,{incomingMessages:[{contactId:'ua',messages:[{role:'assistant',text:'持久化口也不能代发'}]}]});assert.equal(store.read().conversations.ua.length,1);
 assert.ok(!(await reader.readForLiangshi()).knownContacts.some(p=>p.id==='ua'));
});

test('pending social output cannot be written after its actor is reassigned',async()=>{
 const{store,reader,h}=setup();let release,signal,selected;const started=new Promise(r=>signal=r);
 const service=createSocialService({store,contextReader:reader,random:()=>0,modelClient:{complete:request=>{const input=JSON.parse(request.messages[0].content);selected=input.authors.find(p=>p.kind==='contact');signal();return new Promise(r=>release=r);}}});
 const task=service.refresh();await started;await store.saveContact(selected.id,{name:selected.name,identityOwnerId:'@user'});const before=structuredClone(store.read());
 release(JSON.stringify({posts:[{authorId:selected.id,image:{description:'旧身份照片。'},text:'不能保存旧owner的内容'}],proactiveMessages:[{contactId:selected.id,messages:[{text:'不能代本人发来短信'}]}]}));await assert.rejects(task);assert.deepEqual(store.read(),before);assert.equal(h.metadataSaves,1);
});

test('a selected group message keeps its original audience owner dependencies during a pending reply',async()=>{
 const{store,target,reader,h}=setup();const state=store.read();state.contacts.push({id:'d',name:'旧群账号',identityOwnerId:'a'});state.groups[0].memberIds=['b','c'];state.conversations.g=[{id:'scope-only',speakerId:'d',role:'assistant',text:'只凭当时D和C的scope可读',knownToIds:['d','c'],batch:{key:'[1,"2031/4/8","09:30"]'}}];
 let release,signal;const started=new Promise(r=>signal=r),service=createGroupService({store,target,contextReader:reader,modelClient:{complete:()=>{signal();return new Promise(r=>release=r);}}});const pending=service.continueChat('g');await started;await store.saveContact('d',{name:'旧群账号',identityOwnerId:''});const before=structuredClone(store.read());release(JSON.stringify({anchor:{memberIds:['b','c','@user'],speakerIds:['b']},messages:[{speakerId:'b',text:'不能继续引用已失效归属的scope'}]}));await assert.rejects(pending);assert.deepEqual(store.read(),before);assert.equal(h.metadataSaves,1);
});

test('a cross-group quote keeps its audience dependency even when the original row falls outside the eight-message projection',async()=>{
 for(const legacy of [false,true]){const{store,target,reader,h}=setup(),s=store.read(),past={key:'[0,"2031/4/8","08:00"]'};s.contacts.push({id:'d',name:'群内号D',identityOwnerId:'a'},{id:'e',name:'群内号E',identityOwnerId:'a'});s.groups[0].memberIds=['e','c'];s.conversations.g=[{id:'quoted',speakerId:'e',role:'assistant',text:'QUOTED_SCOPE_PRIVATE',...(!legacy?{knownToIds:['e','c']}:{}),batch:past},...Array.from({length:8},(_,i)=>({id:'later'+i,speakerId:'d',role:'assistant',text:'普通旧消息'+i,knownToIds:['d','c'],batch:past,...(i===7?{replyToId:'quoted'}:{})}))];
 s.groups.push({id:'g2',name:'当前群',memberIds:['b','c'],userIsMember:true});s.conversations.g2=[];let release,signal;const started=new Promise(r=>signal=r),service=createGroupService({store,target,contextReader:reader,modelClient:{complete:request=>{const input=JSON.parse(request.messages[0].content);assert.ok(JSON.stringify(input.phoneContext).includes('QUOTED_SCOPE_PRIVATE'));signal();return new Promise(r=>release=r);}}});const pending=service.continueChat('g2');await started;await store.saveContact('e',{name:'群内号E',identityOwnerId:''});const before=structuredClone(store.read());release('{"anchor":{"memberIds":["b","c","@user"],"speakerIds":["b"]},"messages":[{"speakerId":"b","text":"不能使用已失效的引用scope"}]}');await assert.rejects(pending);assert.deepEqual(store.read(),before);assert.equal(h.metadataSaves,1);}
});

test('generated directory records cannot assign owners and malformed preset ownership is rejected',async()=>{
 const{store}=setup();await store.mergeDirectory({contacts:[{id:'new',name:'新联系人',identityOwnerId:'@user'}],groups:[]});assert.equal(store.read().contacts.find(p=>p.id==='new').identityOwnerId,undefined);
 for(const value of [null,12,{},'unknown'])assert.throws(()=>stateFromPreset({schemaVersion:1,contacts:[{id:'a',name:'甲',identityOwnerId:value}]}));
});

test('explicit user contact bindings cannot become NPC authors or interactions, including old bound accounts',async()=>{
 const{store,ls,answer,h}=setup();for(const contactId of ['ua','@user']){answer({accounts:[{key:'x',name:'不猜名字',handle:'new-'+contactId,contactId}],posts:[{authorKey:'x',text:'不能降成匿名NPC'}]});await assert.rejects(ls.refreshFollowing());}assert.equal(h.metadataSaves,0);
 store.read().liangshi.accounts.push({id:'old-bound',name:'原档账号',handle:'old-bound-handle',contactId:'ua'});const before=structuredClone(store.read());
 for(const author of [{authorId:'old-bound'},{authorId:'old-bound-handle'},{author:{id:'old-bound',name:'行内名',handle:'different'}},{author:{name:'行内名',handle:'old-bound-handle'}}]){answer({comments:[{...author,text:'不能借已有明确绑定代写'}]});await assert.rejects(ls.loadMore('own'));assert.deepEqual(store.read(),before);}assert.equal(h.metadataSaves,0);
 store.read().liangshi.accounts.push({id:'without-handle',name:'旧账号',contactId:'ua'});answer({accounts:[{key:'new',name:'新路人'}],comments:[{authorKey:'new',text:'合法路人仍能评论'}]});await ls.loadMore('own');assert.equal(h.metadataSaves,1);
});
