import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader, createBackflowService } from '../src/context.js';
import { readPhoneContext } from '../src/phone-context.js';
import { readTimeline } from '../src/timeline.js';
import { contextMessage } from '../src/content.js';
import { createMessageService } from '../src/messages.js';
import { createSocialService } from '../src/social.js';
import { createLiangshiService } from '../src/liangshi.js';
import { createGroupService } from '../src/groups.js';
const size = value => JSON.stringify(value).length;
function setup() {
 const h=createHarness({messages:[{is_user:false,mes:'<content>EARLIER_FLOOR</content>'},{is_user:false,mes:'<analysis>HIDDEN_REASONING</analysis><content>'+ '最新正文'.repeat(2200)+' LATEST_STORY_END</content><!-- SDC-end | date=2031/4/8 | time=10:00 -->'}],metadata:{pocketPhone:{contacts:[{id:'a',name:'甲',avatar:'fixed'},{id:'b',name:'乙',avatar:'fixed'}],groups:[{id:'g',name:'本群',memberIds:['a'],userIsMember:true}],conversations:{},userProfile:{name:'本人',nickname:'网名'},forum:{posts:[]},social:{posts:[],npcs:[],feedIds:[]},liangshi:{accounts:[],posts:[],feedIds:[],topics:[]}}}});
 const target=h.host.captureChat(),store=createPhoneStore({target});const queries=[];target.readWorldInfo=async q=>{queries.push(q);return '固定世界';};
 const reader=createContextReader({target,store,qqjBridgeProvider:()=>null,wrapperSettingsProvider:()=>({keepTags:'content',extraTags:'analysis'})}),calls=[];let answer;
 const client={complete:async q=>{calls.push(JSON.parse(q.messages[0].content));return JSON.stringify(typeof answer==='function'?answer(calls.at(-1)):answer);}};
 return {h,target,store,reader,client,calls,queries,choose:value=>{answer=value;},anchor:readTimeline(target.messages)};
}
for(const kind of ['private','group'])test(`${kind} continuation keeps its complete current and past segments without input clipping`,async()=>{
 const {h,target,store,reader,anchor,client,calls,choose}=setup(),id=kind==='group'?'g':'a',scope=kind==='group'?{speakerId:'a',knownToIds:['a','@user']}:{role:'user'};
 const current=Array.from({length:64},(_,i)=>({id:'now'+i,...scope,text:'CURRENT_'+i+' '+ '完整正文'.repeat(80),batch:anchor}));
 if(kind==='private'){
  Object.assign(current[1],{type:'image',image:{description:'原照片描述'.repeat(150),path:'/user/images/keep-private.png'},secret:'RAW_FIELD_NOT_FOR_MODEL'});
  Object.assign(current[2],{type:'location',location:{name:'书店',address:'街角'}});
  Object.assign(current[3],{type:'transfer',transfer:{amount:'12.00',currency:'CNY',recipientId:'a',status:'pending'}});
  Object.assign(current[4],{type:'pat',pat:{targetId:'@user'}});
  Object.assign(current[5],{type:'sticker',stickerId:'test-sticker'});
 }
 store.read().conversations[id]=[...Array.from({length:25},(_,i)=>({id:'past'+i,...scope,text:'OLD_HISTORY_'+i+' '+ '旧'.repeat(1800),translation:'译'.repeat(1800),batch:{key:'[-1]'}})),...current];
 store.read().conversations.b=[{id:'private-b',role:'user',text:'OTHER_PERSON_PRIVATE_SECRET',batch:anchor}];
 Object.assign(current.at(-1),{text:'新'.repeat(9000)+'NEWEST_CURRENT',translation:'译'.repeat(6000),replyToId:'past24'});
 const before=structuredClone(store.read()),input=kind==='group'?await reader.readForGroup(id):await reader.readForContact(id);
 assert.equal(input.previousMessages.length,25);assert.deepEqual(input.previousMessages.map(row=>row.text),before.conversations[id].slice(0,25).map(row=>row.text));assert.equal(JSON.stringify(input).includes('OTHER_PERSON_PRIVATE_SECRET'),false);
 if(kind==='group'){
  assert.deepEqual(input.history,current.map(message=>contextMessage(message,before.conversations[id])));
 }else{
  const expected=current.map(message=>contextMessage(message,before.conversations[id]));
  assert.equal(input.history.length,64);assert.ok(size(input.history)>6000);assert.deepEqual(input.history,expected);assert.equal(input.history[0].text,current[0].text);assert.equal(input.history.at(-1).text,current.at(-1).text);assert.equal(input.history.at(-1).translation,current.at(-1).translation);assert.equal(JSON.stringify(input.history).includes('[节选]'),false);assert.equal(JSON.stringify(input.history).includes('excerpted'),false);assert.equal(JSON.stringify(input.history).includes('RAW_FIELD_NOT_FOR_MODEL'),false);assert.equal(JSON.stringify(input.history).includes('keep-private.png'),false);assert.deepEqual(input.phoneContext,[]);
  assert.equal(input.history[1].text,'[图片：'+current[1].image.description+']');assert.equal(input.history[3].transferId,'now3');assert.deepEqual(input.history[4].pat,{targetId:'@user'});assert.equal(input.history[5].stickerId,'test-sticker');
 }
 assert.ok(input.history.at(-1).text.endsWith('NEWEST_CURRENT'));assert.deepEqual(store.read(),before);assert.equal(h.metadataSaves,0);assert.equal(h.settingsSaves,0);assert.equal(calls.length,0);
 {
  choose(kind==='private'?{messages:[{text:'正常续聊回复。'}]}:{anchor:{memberIds:['a','@user'],speakerIds:['a']},messages:[{speakerId:'a',text:'正常续聊回复。'}]});const service=kind==='private'?createMessageService({target,store,contextReader:reader,modelClient:client}):createGroupService({target,store,contextReader:reader,modelClient:client});await service.continueChat(id);
  assert.equal(calls.length,1);assert.deepEqual(calls[0].history,input.history);assert.equal(h.metadataSaves,1);assert.equal(h.settingsSaves,0);assert.deepEqual(store.read().conversations[id].slice(0,before.conversations[id].length),before.conversations[id]);assert.equal(store.read().conversations[id].at(-1).text,'正常续聊回复。');
 }
});
test('shared phone material keeps all qualified records with relationship priority',()=>{
 const {store,anchor}=setup();store.read().liangshi={accounts:[{id:'u',ownerId:'@user',name:'本人'}],posts:[{id:'ancient',authorId:'u',text:'ANCIENT_OWN',publishedAt:'1990-01-01',comments:[],reposts:[]}],userPostIds:['ancient']};store.read().forum.posts=Array.from({length:40},(_,i)=>({id:'f'+i,author:'路人',title:'公开',content:'RECENT_'+i,publishedAt:`2031-04-${String(1+Math.floor(i/24)).padStart(2,'0')} ${String(i%24).padStart(2,'0')}:00`}));
 const rows=readPhoneContext(store.read(),{anchor,targetIds:['@user']});assert.equal(rows.length,41);assert.equal(JSON.stringify(rows).includes('ANCIENT_OWN'),true);assert.deepEqual(new Set(rows.map(row=>row.source.id)),new Set(['ancient',...Array.from({length:40},(_,i)=>'f'+i)]));
});
test('AI draft keeps only the full cleaned latest floor without extra story progress',async()=>{
 const {store,target,reader,client,calls,choose,queries}=setup();const before=structuredClone(store.read());choose({text:'正常草稿'});await createLiangshiService({store,contextReader:reader,modelClient:client}).draftUser({seed:'用户种子'});const input=calls.at(-1);assert.equal(input.story.length,1);assert.equal(input.story[0].text,'最新正文'.repeat(2200)+' LATEST_STORY_END');assert.ok(JSON.stringify(input.story).includes('LATEST_STORY_END'));for(const sentinel of ['EARLIER_FLOOR','HIDDEN_REASONING'])assert.equal(JSON.stringify(input).includes(sentinel),false);assert.ok(queries.at(-1).scanText.includes('LATEST_STORY_END'));assert.deepEqual(store.read(),before);
 target.messages.splice(0,target.messages.length,...Array.from({length:30},(_,i)=>({is_user:false,mes:'<content>'+i+' '+ '进展'.repeat(1000)+'</content>'})));store.read().conversations.a=[{id:'source',role:'assistant',text:'来源',batch:{key:'[0]'}}];const context=await reader.readForContact('a');assert.equal('storyProgress' in context,false);assert.equal(context.story.length,1);assert.equal(context.story[0].text,'29 '+ '进展'.repeat(1000));
 const square=await reader.readForLiangshi(),hot=await reader.readForLiangshiHot();assert.deepEqual(square.story,context.story);assert.deepEqual(hot.story,context.story);
});
test('Ins response keeps all comments and their authors without changing the original archive',async()=>{
 const {h,store,reader,client,calls,choose}=setup();store.read().social={npcs:Array.from({length:61},(_,i)=>({id:'n'+i,name:'作者'+i})),posts:[{id:'p',authorId:'n0',text:'原帖'.repeat(4000),comments:Array.from({length:60},(_,i)=>({authorId:'n'+(i+1),name:'作者'+(i+1),text:'COMMENT_'+i+' '+ '评'.repeat(500)}))}],feedIds:['p']};const saved=structuredClone(store.read().social.posts[0].comments);choose({comments:[{name:'路人',text:'回应'}]});await createSocialService({store,contextReader:reader,modelClient:client}).comment('p','CURRENT_USER_COMMENT');const input=calls.at(-1);assert.equal(input.post.comments.length,60);assert.equal(input.authors.length,61);assert.equal(input.existingCommenters.length,61);assert.equal(input.post.text,'原帖'.repeat(4000));assert.deepEqual(input.post.comments.map(row=>row.text),saved.map(row=>row.text));assert.equal(JSON.stringify(input).includes('COMMENT_0 '),true);assert.equal(input.userComment.text,'CURRENT_USER_COMMENT');assert.deepEqual(store.read().social.posts[0].comments.slice(0,60),saved);assert.equal(h.metadataSaves,2);assert.equal(calls.length,1);
});
test('More keeps the complete post/reference/comments/reposts and all participating accounts',async()=>{
 const {h,store,reader,client,calls,choose}=setup();const accounts=Array.from({length:122},(_,i)=>({id:'u'+i,name:'作者'+i,handle:'handle'+i,description:'说明'.repeat(100)}));const post={id:'p',authorId:'u0',userAuthored:true,text:'原帖'.repeat(5000),quoteId:'q',comments:Array.from({length:60},(_,i)=>({authorId:'u'+(i+1),text:'COMMENT_'+i+' '+ '评'.repeat(300)})),reposts:Array.from({length:60},(_,i)=>({authorId:'u'+(i+61),text:'REPOST_'+i+' '+ '转'.repeat(300)}))};accounts[0].ownerId='@user';store.read().liangshi={accounts,posts:[post,{id:'q',authorId:'u121',text:'被引正文'.repeat(3000),comments:[],reposts:[]}],userPostIds:['p'],feedIds:[],topics:[]};choose({accounts:[{key:'new',name:'新路人',handle:'new'}],comments:[{authorKey:'new',text:'新评论'}]});await createLiangshiService({store,contextReader:reader,modelClient:client}).loadMore('p');const input=calls.at(-1);assert.equal(input.post.commentCount,60);assert.equal(input.post.repostCount,60);assert.equal(input.post.comments.length,60);assert.equal(input.post.reposts.length,60);assert.equal(input.accounts.length,122);assert.equal(input.post.text,post.text);assert.equal(input.original.text,'被引正文'.repeat(3000));assert.deepEqual(input.post.comments.map(row=>row.text),post.comments.map(row=>row.text));assert.deepEqual(input.post.reposts.map(row=>row.text),post.reposts.map(row=>row.text));assert.equal(store.read().liangshi.posts[0].comments.length,61);assert.equal(store.read().liangshi.posts[0].reposts.length,60);assert.equal(h.metadataSaves,1);assert.equal(calls.length,1);
});
test('the existing backflow summary receives all qualified messages and the full latest story in one call',async()=>{
 const {store,target,client,calls,choose,anchor}=setup();store.read().injectEnabled=true;store.read().conversations.a=Array.from({length:50},(_,i)=>({id:'m'+i,role:'assistant',text:'消息'+i+' '+ '长'.repeat(1000),batch:anchor}));choose({summary:'近期手机内容。'});const before=structuredClone(store.read());await createBackflowService({target,store,modelClient:client}).prepare();assert.equal(calls.length,1);assert.equal(calls[0].conversations.flatMap(c=>c.messages).length,50);assert.deepEqual(calls[0].conversations[0].messages.map(row=>row.text),before.conversations.a.map(row=>row.text));assert.equal(calls[0].story[0].text,'最新正文'.repeat(2200)+' LATEST_STORY_END');assert.equal('storyProgress' in calls[0],false);assert.equal(calls[0].maxCharacters,100);assert.deepEqual(store.read(),before);
});
test('retired todos disappear only in the next real ordinary save, without writes on a read or no-op',async()=>{
 const {h,store}=setup();store.read().todos=[{title:'退役数据'}];store.read().unknownExtension={keep:true};store.read();await store.updateLiangshi(data=>data);assert.equal(h.metadataSaves,0);assert.ok(store.read().todos);h.saveFailure=Error('offline');await assert.rejects(store.appendMessage('a',{id:'fail',role:'user',text:'失败不清理'}),/保存失败/);assert.ok(store.read().todos);h.saveFailure=null;await store.appendMessage('a',{id:'new',role:'user',text:'正常写入'});assert.equal(h.metadataSaves,1);assert.equal('todos' in store.read(),false);assert.deepEqual(store.read().unknownExtension,{keep:true});assert.equal('todos' in h.persistedMetadata.pocketPhone,false);
});

test('long emoji and translations reach private input as complete well-formed text',async()=>{
 const {store,reader,anchor}=setup();const text='😀'.repeat(5000),translation='👍'.repeat(5000)+'！';store.read().conversations.a=[{id:'long',role:'user',text,translation,batch:anchor}];const input=await reader.readForContact('a');assert.equal(input.history[0].text,text);assert.equal(input.history[0].translation,translation);assert.equal(input.history[0].text.isWellFormed(),true);assert.equal(input.history[0].translation.isWellFormed(),true);
});
