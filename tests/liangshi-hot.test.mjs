import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader } from '../src/context.js';
import { createModelClient, createApiSettings } from '../src/api.js';
import * as implementation from '../src/liangshi.js';

const state = liangshi => ({ schemaVersion:1, contacts:[], groups:[], conversations:{private:[{text:'PRIVATE_SMS'}]}, todos:[{title:'PRIVATE_TODO'}], forum:{posts:[]}, defaultLanguage:'中文', liangshi });
const account = {id:'a',name:'旧作者',handle:'old',avatar:'KEEP_AVATAR'};
const oldPost = {id:'old',authorId:'a',text:'OLD_POST_SENTINEL',topic:'同名话题',publishedAt:'2031/4/8 09:00',image:{description:'OLD_IMAGE_SENTINEL',path:'/user/images/old.png'},comments:[],reposts:[],userLiked:true};
function setup(initial, hostKind='native') {
 const h=createHarness({hostKind,metadata:{pocketPhone:state(initial)},settings:{'schedule-planner':{apiPresets:[{id:'test',url:'https://fixture.invalid',key:'mock',model:'m'}]}},messages:[{is_user:false,mes:'LATEST_STORY_SENTINEL<!-- QQJ-end | date=2031/4/8 | time=13:00 -->'}]});
 const target=h.host.captureChat(),removed=[],store=createPhoneStore({target,removeImages:async paths=>removed.push(...paths)}),reader=createContextReader({target,store,qqjBridgeProvider:()=>{throw Error('no private memory')} ,wrapperSettingsProvider:()=>({})});
 const modelClient=createModelClient({host:h.host,sourceProvider:createApiSettings({host:h.host})}),service=implementation.createLiangshiService({store,contextReader:reader,modelClient,random:()=>0});
 const inputs=[];let answer;
 h.completion=(_path,init)=>{inputs.push(JSON.parse(JSON.parse(init.body).messages[1].content));return {choices:[{message:{content:JSON.stringify(typeof answer==='function'?answer(inputs.at(-1)):answer)}}]};};
 return {h,target,store,reader,service,inputs,removed,answer:value=>{answer=value;}};
}
const topics = () => ({topics:Array.from({length:15},(_,index)=>({name:index?'公共话题'+index:'同名话题',description:'独立公开事件摘要'+index,heat:index?undefined:'热议'}))});
const batch = (prefix='TOPIC') => ({accounts:[{key:'b',name:'路人',handle:'reader'}],posts:[{key:'p1',authorKey:'b',text:prefix+'_BODY',image:{description:prefix+'_IMAGE'},quoteKey:'p2',comments:[{authorKey:'b',text:'初始评论'}]},{key:'p2',authorKey:'b',text:prefix+'_ORIGINAL'}]});

test('legacy feed/topic ownership is read-only and explicit empty hot ownership never borrows same-name square posts',()=>{
 const data={accounts:[account],posts:[oldPost],topics:[{name:'同名话题',description:'旧话题'}]},before=structuredClone(data);
 assert.equal(typeof implementation.readLiangshiFeed,'function');assert.equal(typeof implementation.readLiangshiTopic,'function');
 assert.deepEqual(implementation.readLiangshiFeed(data),[oldPost]);
 assert.deepEqual(implementation.readLiangshiTopic(data,'legacy:0').postIds,['old']);
 assert.deepEqual(implementation.readLiangshiTopic({...data,topics:[{id:'new',name:'同名话题',postIds:[]}]},'new').postIds,[]);
 assert.deepEqual(data,before);
});

for(const kind of ['native','luker'])test(`${kind}: independent hot and topic requests omit drafts, retain square state, load once and reroll only their own posts`,async()=>{
 const {h,store,service,inputs,answer}=setup({accounts:[account],posts:[oldPost],topics:[],promoCountdown:3},kind);
 assert.equal(typeof service.refreshHot,'function');assert.equal(typeof service.loadTopic,'function');
 answer(topics());await service.refreshHot();
 const hot=structuredClone(store.read().liangshi),topic=hot.topics[0];
 assert.equal(h.modelRequests.length,1);assert.equal(h.metadataSaves,1);assert.equal(hot.topics.length,15);assert.ok(hot.topics.every(item=>item.id&&Array.isArray(item.postIds)&&!item.postIds.length));
 assert.deepEqual(hot.feedIds,['old']);assert.deepEqual(hot.posts,[oldPost]);assert.equal(hot.promoCountdown,3);
 assert.equal(inputs[0].recipe.topics,15);assert.equal(inputs[0].story[0].text,'LATEST_STORY_SENTINEL');
 for(const marker of ['OLD_POST_SENTINEL','OLD_IMAGE_SENTINEL','旧作者','PRIVATE_SMS','PRIVATE_TODO'])assert.equal(JSON.stringify(inputs[0]).includes(marker),false,marker);
 answer(batch());await service.loadTopic(topic.id);const loaded=structuredClone(store.read().liangshi),ids=loaded.topics[0].postIds;
 assert.equal(ids.length,2);assert.deepEqual(loaded.feedIds,['old']);assert.deepEqual(service.getPost('old'),oldPost);
 assert.deepEqual(inputs[1].topic,{name:'同名话题',description:'独立公开事件摘要0。'});assert.equal(inputs[1].recipe.posts,8);assert.equal(inputs[1].existingAccounts,undefined);
 await service.loadTopic(topic.id);assert.equal(h.modelRequests.length,2);assert.equal(h.metadataSaves,2);
 await service.toggleLike(ids[0]);await store.updateLiangshi(current=>({...current,posts:current.posts.map(post=>post.id===ids[0]?{...post,image:{...post.image,path:'/user/images/hot.png'}}:post)}));
 answer({comments:[{authorId:service.getPost(ids[0]).authorId,text:'MORE_COMMENT'}],reposts:[{authorId:service.getPost(ids[0]).authorId,text:'MORE_REPOST'}]});await service.loadMore(ids[0]);
 assert.equal('story'in inputs[2],false);assert.equal(inputs[2].post.userLiked,undefined);assert.equal(inputs[2].original.id,ids[1]);assert.equal(service.getPost(ids[0]).userLiked,true);assert.equal(service.getPost(ids[0]).image.path,'/user/images/hot.png');
 answer(batch('REROLL'));await service.loadTopic(topic.id,{refresh:true});
 assert.deepEqual(inputs[3].topic,inputs[1].topic);for(const marker of ['TOPIC_BODY','TOPIC_IMAGE','TOPIC_ORIGINAL','MORE_COMMENT','MORE_REPOST'])assert.equal(JSON.stringify(inputs[3]).includes(marker),false,marker);
 assert.ok(store.read().liangshi.posts.every(post=>!ids.includes(post.id)));assert.deepEqual(service.getPost('old'),oldPost);assert.equal(store.read().liangshi.promoCountdown,3);
 assert.equal(h.modelRequests.length,4);assert.deepEqual(h.persistedMetadata.pocketPhone,store.read());
});

test('square and hot replacement retain cross-page quote dependencies and clean only discarded files/authors',async()=>{
 const hotPost={id:'hot',authorId:'hot-author',text:'HOT_BODY',quoteId:'old',image:{description:'河边',path:'/user/images/hot.png'},comments:[{authorId:'interactor',text:'互动'}],reposts:[],userLiked:true};
 const {store,service,answer,removed,inputs}=setup({accounts:[account,{id:'hot-author',name:'热榜作者'},{id:'interactor',name:'互动者'}],posts:[oldPost,hotPost],feedIds:['old'],topics:[{id:'topic',name:'独立话题',description:'摘要',postIds:['hot']}],promoCountdown:3});
 answer(batch('SQUARE'));await service.refresh();const data=store.read().liangshi;
 assert.equal(inputs[0].recipe.topics,undefined);assert.ok(!data.feedIds.includes('hot'));assert.equal(data.feedIds.length,2);assert.equal(service.getPost('hot').userLiked,true);assert.equal(service.getPost('old').image.path,'/user/images/old.png');
 assert.ok(data.accounts.some(item=>item.id==='interactor'));assert.deepEqual(removed,[]);
 answer({topics:[{name:'新热榜',description:'简短摘要'}]});await service.refreshHot();
 assert.equal(service.getPost('hot'),undefined);assert.equal(service.getPost('old'),undefined);assert.deepEqual(new Set(removed),new Set(['/user/images/old.png','/user/images/hot.png']));
 assert.ok(store.read().liangshi.accounts.every(item=>!['a','hot-author','interactor'].includes(item.id)));assert.equal(implementation.readLiangshiFeed(store.read().liangshi).length,2);
});

test('parallel square and topic results resolve the same explicit handle against the latest saved account',async()=>{
 const {h,store,reader}=setup({accounts:[],posts:[],feedIds:[],topics:[{id:'topic',name:'公共话题',description:'摘要',postIds:[]}],promoCountdown:3});
 const pending=[],service=implementation.createLiangshiService({store,contextReader:reader,random:()=>0,modelClient:{complete:request=>new Promise(resolve=>pending.push({request,resolve}))}});
 const square=service.refresh(),topic=service.loadTopic('topic');while(pending.length<2)await new Promise(resolve=>setImmediate(resolve));
 const answer=JSON.stringify({accounts:[{key:'author',name:'公共账号',handle:'same-public-handle'}],posts:[{authorKey:'author',text:'公开消息'}]});
 pending.find(item=>!JSON.parse(item.request.messages[0].content).topic).resolve(answer);await square;
 const first=store.read().liangshi.accounts[0];
 pending.find(item=>JSON.parse(item.request.messages[0].content).topic).resolve(answer);await topic;
 assert.equal(store.read().liangshi.accounts.length,1);assert.equal(store.read().liangshi.accounts[0].id,first.id);assert.equal(store.read().liangshi.accounts[0].avatar,first.avatar);
 assert.equal(new Set(store.read().liangshi.posts.map(post=>post.authorId)).size,1);assert.equal(h.metadataSaves,2);assert.equal(pending.length,2);
});

test('a legacy topic owns its untagged quoted original for notification navigation after square replacement',()=>{
 const data={accounts:[],feedIds:['square'],posts:[{id:'square',topic:'旧话题'},{id:'root',topic:'旧话题',quoteId:'original',reposts:[]},{id:'original',reposts:[]}],topics:[{id:'legacy:0',name:'旧话题',postIds:['root']}]},before=structuredClone(data);
 assert.equal(typeof implementation.findLiangshiTopicForPost,'function');
 assert.equal(implementation.findLiangshiTopicForPost(data,'original').id,'legacy:0');
 assert.equal(implementation.findLiangshiTopicForPost(data,'square'),undefined);
 assert.deepEqual(data,before);
});
