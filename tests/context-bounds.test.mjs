import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader, createBackflowService } from '../src/context.js';
import { readPhoneContext } from '../src/phone-context.js';
import { readTimeline } from '../src/timeline.js';
import { createSocialService } from '../src/social.js';
import { createLiangshiService } from '../src/liangshi.js';
import { clipProjection } from '../src/context-budget.js';
const size = value => JSON.stringify(value).length;
function setup() {
 const h=createHarness({messages:[{is_user:false,mes:'<content>EARLIER_FLOOR</content>'},{is_user:false,mes:'<analysis>HIDDEN_REASONING</analysis><content>'+ '最新正文'.repeat(2200)+' LATEST_STORY_END</content><!-- SDC-end | date=2031/4/8 | time=10:00 -->'}],metadata:{pocketPhone:{contacts:[{id:'a',name:'甲',avatar:'fixed'},{id:'b',name:'乙',avatar:'fixed'}],groups:[{id:'g',name:'本群',memberIds:['a'],userIsMember:true}],conversations:{},userProfile:{name:'本人',nickname:'网名'},forum:{posts:[]},social:{posts:[],npcs:[],feedIds:[]},liangshi:{accounts:[],posts:[],feedIds:[],topics:[]}}}});
 const target=h.host.captureChat(),store=createPhoneStore({target});const queries=[];target.readWorldInfo=async q=>{queries.push(q);return '固定世界';};
 const reader=createContextReader({target,store,qqjBridgeProvider:()=>null,wrapperSettingsProvider:()=>({keepTags:'content',extraTags:'analysis'})}),calls=[];let answer;
 const client={complete:async q=>{calls.push(JSON.parse(q.messages[0].content));return JSON.stringify(typeof answer==='function'?answer(calls.at(-1)):answer);}};
 return {h,target,store,reader,client,calls,queries,choose:value=>{answer=value;},anchor:readTimeline(target.messages)};
}
for(const kind of ['private','group'])test(`${kind} continuation budgets the complete current/past/reference JSON without losing the newest long message`,async()=>{
 const {h,store,reader,anchor}=setup(),id=kind==='group'?'g':'a',scope=kind==='group'?{speakerId:'a',knownToIds:['a','@user']}:{role:'user'};
 store.read().conversations[id]=[...Array.from({length:25},(_,i)=>({id:'past'+i,...scope,text:'OLD_HISTORY_'+i+' '+ '旧'.repeat(1800),translation:'译'.repeat(1800),batch:{key:'[-1]'}})),...Array.from({length:30},(_,i)=>({id:'now'+i,...scope,text:'CURRENT_'+i,batch:anchor}))];
 const last=store.read().conversations[id].at(-1);Object.assign(last,{text:'新'.repeat(9000)+'NEWEST_CURRENT',translation:'译'.repeat(6000),replyToId:'past24'});
 const before=structuredClone(store.read());const input=kind==='group'?await reader.readForGroup(id):await reader.readForContact(id);
 assert.ok(input.history.length<=12);assert.ok(input.previousMessages.length<=4);assert.ok(input.history.length+input.previousMessages.length+input.phoneContext.length<=20);assert.ok(size({history:input.history,previousMessages:input.previousMessages,phoneContext:input.phoneContext})<=6000);assert.ok(input.history.at(-1).text.endsWith('NEWEST_CURRENT'));assert.deepEqual(store.read(),before);assert.equal(h.metadataSaves,0);
});
test('shared phone material selects a recent twenty-record window before relationship priority',()=>{
 const {store,anchor}=setup();store.read().liangshi={accounts:[{id:'u',ownerId:'@user',name:'本人'}],posts:[{id:'ancient',authorId:'u',text:'ANCIENT_OWN',publishedAt:'1990-01-01',comments:[],reposts:[]}],userPostIds:['ancient']};store.read().forum.posts=Array.from({length:40},(_,i)=>({id:'f'+i,author:'路人',title:'公开',content:'RECENT_'+i,publishedAt:`2031-04-${String(1+Math.floor(i/24)).padStart(2,'0')} ${String(i%24).padStart(2,'0')}:00`}));
 const rows=readPhoneContext(store.read(),{anchor,targetIds:['@user']});assert.ok(rows.length<=20);assert.equal(JSON.stringify(rows).includes('ANCIENT_OWN'),false);assert.ok(size(rows)<=6000);
});
test('AI draft adds only the cleaned latest floor while story progress is six complete JSON-bounded records',async()=>{
 const {store,target,reader,client,calls,choose,queries}=setup();const before=structuredClone(store.read());choose({text:'正常草稿'});await createLiangshiService({store,contextReader:reader,modelClient:client}).draftUser({seed:'用户种子'});const input=calls.at(-1);assert.equal(input.story.length,1);assert.ok(size(input.story)<=6000);assert.ok(JSON.stringify(input.story).includes('LATEST_STORY_END'));for(const sentinel of ['EARLIER_FLOOR','HIDDEN_REASONING'])assert.equal(JSON.stringify(input).includes(sentinel),false);assert.ok(queries.at(-1).scanText.includes('LATEST_STORY_END'));assert.deepEqual(store.read(),before);
 target.messages.splice(0,target.messages.length,...Array.from({length:30},(_,i)=>({is_user:false,mes:'<content>'+i+' '+ '进展'.repeat(1000)+'</content>'})));store.read().conversations.a=[{id:'source',role:'assistant',text:'来源',batch:{key:'[0]'}}];const context=await reader.readForContact('a');assert.ok(context.storyProgress.messages.length<=6);assert.ok(size(context.storyProgress)<=6000);assert.equal(context.storyProgress.complete,false);
 const square=await reader.readForLiangshi(),hot=await reader.readForLiangshiHot();assert.ok(square.story.length<=1&&size(square.story)<=6000);assert.ok(hot.story.length<=1&&size(hot.story)<=6000);
});
test('Ins response uses only ten recent comments and their authors, keeping the original archive',async()=>{
 const {h,store,reader,client,calls,choose}=setup();store.read().social={npcs:Array.from({length:61},(_,i)=>({id:'n'+i,name:'作者'+i})),posts:[{id:'p',authorId:'n0',text:'原帖'.repeat(4000),comments:Array.from({length:60},(_,i)=>({authorId:'n'+(i+1),name:'作者'+(i+1),text:'COMMENT_'+i+' '+ '评'.repeat(500)}))}],feedIds:['p']};const saved=structuredClone(store.read().social.posts[0].comments);choose({comments:[{name:'路人',text:'回应'}]});await createSocialService({store,contextReader:reader,modelClient:client}).comment('p','CURRENT_USER_COMMENT');const input=calls.at(-1);assert.ok(input.post.comments.length<=10);assert.ok(input.authors.length<=11);assert.ok(input.existingCommenters.length<=11);assert.ok(size({post:input.post,userComment:input.userComment,existingCommenters:input.existingCommenters})<=8000);assert.equal(JSON.stringify(input).includes('COMMENT_0 '),false);assert.equal(input.userComment.text,'CURRENT_USER_COMMENT');assert.deepEqual(store.read().social.posts[0].comments.slice(0,60),saved);assert.equal(h.metadataSaves,2);assert.equal(calls.length,1);
});
test('More bounds the selected post/reference/ten comments/four reposts plus only needed accounts, not real totals',async()=>{
 const {h,store,reader,client,calls,choose}=setup();const accounts=Array.from({length:122},(_,i)=>({id:'u'+i,name:'作者'+i,handle:'handle'+i,description:'说明'.repeat(100)}));const post={id:'p',authorId:'u0',userAuthored:true,text:'原帖'.repeat(5000),quoteId:'q',comments:Array.from({length:60},(_,i)=>({authorId:'u'+(i+1),text:'COMMENT_'+i+' '+ '评'.repeat(300)})),reposts:Array.from({length:60},(_,i)=>({authorId:'u'+(i+61),text:'REPOST_'+i+' '+ '转'.repeat(300)}))};accounts[0].ownerId='@user';store.read().liangshi={accounts,posts:[post,{id:'q',authorId:'u121',text:'被引正文'.repeat(3000),comments:[],reposts:[]}],userPostIds:['p'],feedIds:[],topics:[]};choose({accounts:[{key:'new',name:'新路人',handle:'new'}],comments:[{authorKey:'new',text:'新评论'}]});await createLiangshiService({store,contextReader:reader,modelClient:client}).loadMore('p');const input=calls.at(-1);assert.equal(input.post.commentCount,60);assert.equal(input.post.repostCount,60);assert.ok(input.post.comments.length<=10);assert.ok(input.post.reposts.length<=4);assert.ok(input.accounts.length<=16);assert.ok(size({post:input.post,original:input.original,accounts:input.accounts})<=8000);assert.equal(JSON.stringify(input).includes('COMMENT_0 '),false);assert.equal(store.read().liangshi.posts[0].comments.length,61);assert.equal(store.read().liangshi.posts[0].reposts.length,60);assert.equal(h.metadataSaves,1);assert.equal(calls.length,1);
});
test('the existing backflow summary receives at most twenty messages and six thousand JSON characters in one call',async()=>{
 const {store,target,client,calls,choose,anchor}=setup();store.read().injectEnabled=true;store.read().conversations.a=Array.from({length:50},(_,i)=>({id:'m'+i,role:'assistant',text:'消息'+i+' '+ '长'.repeat(1000),batch:anchor}));choose({summary:'近期手机内容。'});const before=structuredClone(store.read());await createBackflowService({target,store,modelClient:client}).prepare();assert.equal(calls.length,1);assert.ok(calls[0].conversations.flatMap(c=>c.messages).length<=20);assert.ok(size(calls[0].conversations)<=6000);assert.deepEqual(store.read(),before);
});
test('retired todos disappear only in the next real ordinary save, without writes on a read or no-op',async()=>{
 const {h,store}=setup();store.read().todos=[{title:'退役数据'}];store.read().unknownExtension={keep:true};store.read();await store.updateLiangshi(data=>data);assert.equal(h.metadataSaves,0);assert.ok(store.read().todos);h.saveFailure=Error('offline');await assert.rejects(store.appendMessage('a',{id:'fail',role:'user',text:'失败不清理'}),/保存失败/);assert.ok(store.read().todos);h.saveFailure=null;await store.appendMessage('a',{id:'new',role:'user',text:'正常写入'});assert.equal(h.metadataSaves,1);assert.equal('todos' in store.read(),false);assert.deepEqual(store.read().unknownExtension,{keep:true});assert.equal('todos' in h.persistedMetadata.pocketPhone,false);
});

 test('long emoji in body, translation and quotation stay valid text after JSON budgeting',()=>{
  for(const budget of [1000,3500,6000,8000]){
   const value=clipProjection({text:'😀'.repeat(5000),translation:'👍'.repeat(5000)+'！',replyTo:{messageText:'🌙'.repeat(5000)+'。'}},budget);
   assert.ok(size(value)<=budget);for(const text of [value.text,value.translation,value.replyTo.messageText])assert.equal(text.isWellFormed(),true);
  }
 });
