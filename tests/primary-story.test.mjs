import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './harness.mjs';
import {createPhoneStore} from '../src/store.js';
import {createContextReader} from '../src/context.js';
import {createLiangshiService} from '../src/liangshi.js';
import {createApiSettings,createModelClient} from '../src/api.js';
import * as prompts from '../src/prompts.js';
function setup(hostKind){
 const h=createHarness({hostKind,settings:{'schedule-planner':{apiPresets:[{id:'p',url:'https://fixture.invalid/v1',key:'synthetic',model:'m'}]}},messages:[{is_user:false,mes:'<content>EARLIER_FLOOR_ONLY</content>'},{is_user:false,mes:'<analysis>HIDDEN_REASONING</analysis><content>'+ '当楼叙事😀'.repeat(1800)+'明确已发布的公开消息 LATEST_PUBLIC_EVENT[tmt|林舟|林舟]IMPORTED_SMS_NO_DUPLICATION[/tmt]</content><!-- SDC-end | date=2031/4/8 | time=13:00 -->'}],metadata:{pocketPhone:{contacts:[{id:'lin',name:'林舟',avatar:'fixed'}],groups:[],conversations:{lin:[{id:'story-sms',role:'assistant',text:'IMPORTED_SMS_NO_DUPLICATION',source:{kind:'main-story',floor:1,block:0},batch:{key:'[1]'}}]},forum:{posts:[]},social:{posts:[],npcs:[]},userProfile:{name:'本人'},liangshi:{accounts:[{id:'old',name:'OLD_AUTHOR_ONLY',handle:'old'}],posts:[{id:'old-p',authorId:'old',text:'OLD_A_BODY',image:{description:'OLD_A_IMAGE'},comments:[],reposts:[]}],feedIds:['old-p'],topics:[],promoCountdown:3}}}});
 const target=h.host.captureChat(),store=createPhoneStore({target}),queries=[],requests=[];target.readWorldInfo=async options=>{queries.push(options);return options===undefined?'ALL_STATIC_PEOPLE':'SCANNED_WORLD';};
 const reader=createContextReader({target,store,qqjBridgeProvider:()=>{throw Error('public primary does not read private actors');},wrapperSettingsProvider:()=>({keepTags:'content',extraTags:'analysis'})});
 h.completion=(_p,init)=>{const body=JSON.parse(init.body),input=JSON.parse(body.messages[1].content);requests.push({input,system:body.messages[0].content});let answer;
 if(input.post)answer={comments:[{authorId:input.post.authorId,text:'更多互动'}]};else if(input.recipe.topics)answer={topics:[{name:'城市公开话题',description:'公开事件摘要'}]};else answer={accounts:[{key:'a',name:'公开作者',handle:input.topic?'topic':input.userPersona!==undefined?'following':'square'}],posts:[{authorKey:'a',text:input.topic?'TOPIC_BODY':input.userPersona!==undefined?'FOLLOWING_BODY':'SQUARE_BODY'}]};
 return {choices:[{message:{content:JSON.stringify(answer)}}]};};
 return{h,target,store,reader,queries,requests,service:createLiangshiService({store,contextReader:reader,modelClient:createModelClient({host:h.host,sourceProvider:createApiSettings({host:h.host})}),random:()=>0})};
}
for(const kind of ['native','luker'])test(`${kind}: four primary requests share one cleaned latest floor; More explicitly excludes it without changing calls or ownership`,async()=>{
 const {h,target,store,reader,queries,requests,service}=setup(kind),raw=structuredClone(target.messages);
 await service.refresh();await service.refreshFollowing();await service.refreshHot();const topicId=store.read().liangshi.topics[0].id;await service.loadTopic(topicId);
 for(let i=0;i<4;i++){
  const {input,system}=requests[i];assert.equal(input.story.length,1);assert.ok(JSON.stringify(input.story).length<=6000);assert.ok(input.story[0].text.includes('LATEST_PUBLIC_EVENT'));assert.equal(input.story[0].text.isWellFormed(),true);
  for(const word of ['EARLIER_FLOOR_ONLY','HIDDEN_REASONING','IMPORTED_SMS_NO_DUPLICATION','OLD_A_BODY','OLD_A_IMAGE','OLD_AUTHOR_ONLY'])assert.equal(JSON.stringify(input).includes(word),false,word);
  assert.ok(system.includes(prompts.PUBLIC_STORY_RULE));if(i!==1)assert.equal('phoneContext'in input,false);
 }
 assert.equal(queries[2],undefined,'Hot still reads the full bounded static book');assert.equal(requests[2].input.worldbook,'ALL_STATIC_PEOPLE');
 for(const i of [0,1,3]){assert.ok(queries[i].scanText.includes('LATEST_PUBLIC_EVENT'));assert.equal(queries[i].scanText.includes('HIDDEN_REASONING'),false);assert.equal(queries[i].scanText.includes('IMPORTED_SMS_NO_DUPLICATION'),false);}
 await service.loadTopic(topicId);assert.equal(requests.length,4);assert.equal(h.metadataSaves,4);
 const post=store.read().liangshi.posts.find(p=>p.id===store.read().liangshi.topics[0].postIds[0]);await service.loadMore(post.id);
 assert.equal('story'in requests[4].input,false);assert.equal(queries[4].scanText.includes('LATEST_PUBLIC_EVENT'),false);assert.ok(queries[4].scanText.includes('TOPIC_BODY'));assert.equal(requests.length,5);assert.equal(h.metadataSaves,5);assert.deepEqual(target.messages,raw);
 const noStory=createContextReader({target,store,qqjBridgeProvider:()=>null,wrapperSettingsProvider:()=>{throw Error('More must not construct body');}});assert.equal('story'in await noStory.readForLiangshi({includeStory:false}),false);
});
