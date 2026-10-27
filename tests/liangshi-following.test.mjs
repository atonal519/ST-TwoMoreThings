import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader } from '../src/context.js';
import { createApiSettings, createModelClient } from '../src/api.js';
import * as implementation from '../src/liangshi.js';
import { renderLiangshi } from '../src/ui/liangshi.js';
import { renderPhoneNotice } from '../src/ui/notifications.js';

const account=(id,handle=id)=>({id,name:id,handle,avatar:'KEEP_AVATAR',followed:false});
const post=(id,authorId,extra={})=>({id,authorId,text:id,publishedAt:'2031/4/8 09:00',comments:[],reposts:[],...extra});
function setup(hostKind='native') {
  const b={key:'[0,"2031/4/8","09:00"]',label:'早间'};
  const data={accounts:[account('square'),account('hot'),account('following')],posts:[post('SQUARE_OLD','square'),post('HOT_OLD','hot'),post('FOLLOWING_OLD','following',{image:{description:'FOLLOWING_IMAGE_OLD',path:'/user/images/following-old.png'},userLiked:true})],feedIds:['SQUARE_OLD'],followingFeedIds:['FOLLOWING_OLD'],topics:[{id:'topic',name:'公开事件',description:'热点摘要',postIds:['HOT_OLD']}],promoCountdown:3};
  const h=createHarness({hostKind,settings:{'schedule-planner':{apiPresets:[{id:'p',url:'https://fixture.invalid/v1',key:'mock',model:'m'}]}},messages:[{is_user:false,mes:'OMNISCIENT_STORY_SENTINEL<!-- SDC-end | date=2031/4/8 | time=10:00 -->'}],metadata:{pocketPhone:{schemaVersion:1,contacts:[{id:'lin',name:'林舟',expression:'短句',language:'日语',nickname:'NOT_IN_KNOWN_PROFILE',personality:'NOT_IN_KNOWN_PROFILE'}],groups:[{id:'member',name:'本人群',memberIds:['lin'],userIsMember:true},{id:'observer',name:'旁观群',memberIds:['lin'],userIsMember:false}],conversations:{lin:[{id:'original',role:'user',text:'USER_OWN_AGREEMENT',batch:b,storyDate:'2031/4/8',timeLabel:'09:00'},{id:'reply',role:'assistant',text:'CONTACT_OPINION',replyToId:'original',batch:b}],member:[{id:'g',role:'assistant',speakerId:'lin',type:'image',image:{description:'GROUP_PICTURE_DESCRIPTION',path:'/private/picture.png'},batch:b}],observer:[{id:'secret',speakerId:'lin',text:'OBSERVER_SECRET'}],unknown:[{text:'UNKNOWN_PRIVATE'}]},userProfile:{name:'读者角色',nickname:'自己的网名'},defaultLanguage:'粤语',liangshi:data}}});
  h.context.powerUserSettings={persona_description:'USER_PERSONA: 喜欢老相机和夜间散步。'};
  const target=h.host.captureChat(),removed=[],store=createPhoneStore({target,removeImages:async paths=>removed.push(...paths)});
  const reader=createContextReader({target,store,qqjBridgeProvider:()=>{throw Error('Following must not read actor memory');},wrapperSettingsProvider:()=>({})});
  const inputs=[];let answer;
  h.completion=(_path,init)=>{const body=JSON.parse(init.body);inputs.push({input:JSON.parse(body.messages[1].content),body});return{choices:[{message:{content:JSON.stringify(typeof answer==='function'?answer(inputs.at(-1).input):answer)}}]};};
  return{h,target,store,reader,removed,inputs,answer:value=>{answer=value;},service:implementation.createLiangshiService({store,contextReader:reader,modelClient:createModelClient({host:h.host,sourceProvider:createApiSettings({host:h.host})}),random:()=>0})};
}
const batch=(label='A',handle='creator')=>({accounts:[{key:'a',name:'公开作者',handle,expression:'自然简短',language:'粤语'},{key:'b',name:'另一位作者',handle:`${handle}-other`}],posts:[{key:'p1',authorKey:'a',text:`${label}_CAPTION`,image:{description:`${label}_IMAGE`},quoteKey:'p2',comments:[{authorKey:'b',text:`${label}_COMMENT`}]},{key:'p2',authorKey:'b',text:`${label}_ORIGINAL`}]});

for(const kind of ['native','luker'])test(`${kind}: Following reads live user persona and public-only phone context with latest story and without actor context`,async()=>{
  const {h,target,reader}=setup(kind),before=structuredClone(target.metadata);
  assert.equal(target.userPersona,h.context.powerUserSettings.persona_description);
  const c=await reader.readForLiangshiFollowing();
  assert.equal(c.userPersona,'USER_PERSONA: 喜欢老相机和夜间散步。');assert.deepEqual(c.userProfile,{name:'读者角色',nickname:'自己的网名'});
  assert.equal('userConversations' in c,false);assert.deepEqual(c.phoneContext,[]);
  const sent=JSON.stringify(c);for(const marker of ['OBSERVER_SECRET','UNKNOWN_PRIVATE','SQUARE_OLD','HOT_OLD','FOLLOWING_OLD','FOLLOWING_IMAGE_OLD','/private/','NOT_IN_KNOWN_PROFILE','USER_OWN_AGREEMENT','CONTACT_OPINION','GROUP_PICTURE_DESCRIPTION'])assert.equal(sent.includes(marker),false,marker);
  assert.equal(c.story[0].text,'OMNISCIENT_STORY_SENTINEL');assert.equal('accounts' in c,false);assert.equal('existingAccounts' in c,false);
  assert.equal(c.clock.time,'10:00');assert.equal(c.defaultLanguage,'粤语');assert.ok(c.setting.includes('普通城市'));
  h.context.powerUserSettings.persona_description='USER_PERSONA_CHANGED';assert.equal((await reader.readForLiangshiFollowing()).userPersona,'USER_PERSONA_CHANGED');
  assert.equal('userPersona' in await reader.readForLiangshi(),false);assert.equal('userPersona' in await reader.readForLiangshiHot(),false);
  assert.deepEqual(target.metadata,before);assert.equal(h.metadataSaves,0);assert.equal(h.modelRequests.length,0);
});

test('Following public projection counts complete JSON while all private threads remain excluded',async()=>{
  const {target,reader,h}=setup(),state=target.metadata.pocketPhone;
  state.conversations.lin=[{id:'huge',role:'user',text:'PRIVATE_LONG'.repeat(4000)}];
  state.social={npcs:[],feedIds:[],posts:Array.from({length:20},(_,i)=>({id:`p${i}`,authorId:'lin',text:'完整公开动态'.repeat(50)+i,publishedAt:`2031/4/8 ${String(i).padStart(2,'0')}:00`,comments:[]}))};
  state.social.posts.push({id:'huge',authorId:'lin',text:'公开长文'.repeat(4000),comments:[]});
  const c=await reader.readForLiangshiFollowing();assert.ok(JSON.stringify(c.phoneContext).length<=6000);assert.ok(c.phoneContext.length>0&&c.phoneContext.length<=20);assert.equal('userConversations' in c,false);assert.equal(JSON.stringify(c).includes('PRIVATE_LONG'),false);
  for(const row of c.phoneContext)assert.ok(state.social.posts.some(post=>post.id===row.source.id&&(post.text===row.text||row.excerpted&&row.text.startsWith('[节选]'))));assert.equal(h.metadataSaves,0);
});

test('empty user persona and conversations still permit one ordinary Following generation without inventing a stored profile',async()=>{
  const {h,target,service,store,answer,inputs}=setup();h.context.powerUserSettings={};delete target.metadata.pocketPhone.userProfile;target.metadata.pocketPhone.contacts=[];target.metadata.pocketPhone.groups=[];target.metadata.pocketPhone.conversations={};
  answer(batch());await service.refreshFollowing();
  assert.equal(inputs[0].input.userPersona,'');assert.equal('userConversations' in inputs[0].input,false);assert.deepEqual(inputs[0].input.phoneContext,[]);assert.equal(inputs[0].input.userProfile.name,'我');assert.equal('userProfile' in store.read(),false);assert.equal(h.modelRequests.length,1);assert.equal(h.metadataSaves,1);
});

test('old archives do not borrow Square for Following, and all three ownership roots protect posts and images',async()=>{
  assert.equal(typeof implementation.readLiangshiFollowingFeed,'function');
  const legacy={accounts:[],posts:[post('old','square')],feedIds:['old']},before=structuredClone(legacy);assert.deepEqual(implementation.readLiangshiFollowingFeed(legacy),[]);assert.deepEqual(legacy,before);
  const {service,store,answer,removed}=setup();answer(batch('NEW_SQUARE'));await service.refresh();assert.ok(store.read().liangshi.posts.some(row=>row.id==='FOLLOWING_OLD'));assert.ok(store.read().liangshi.posts.some(row=>row.id==='HOT_OLD'));assert.deepEqual(removed,[]);
  answer({topics:[{name:'新热点',description:'新公开事件'}]});await service.refreshHot();assert.ok(store.read().liangshi.posts.some(row=>row.id==='FOLLOWING_OLD'));assert.deepEqual(removed,[]);
});

for(const kind of ['native','luker'])test(`${kind}: Following refresh replaces only its own batch in one request/save and excludes prior drafts`,async()=>{
  const {service,store,answer,inputs,h,removed}=setup(kind),square=structuredClone(store.read().liangshi.posts[0]),hot=structuredClone(store.read().liangshi.posts[1]);
  answer(batch());await service.refreshFollowing();const first=structuredClone(implementation.readLiangshiFollowingFeed(store.read().liangshi));
  assert.equal(first.length,2);assert.deepEqual(service.getPost('SQUARE_OLD'),square);assert.deepEqual(service.getPost('HOT_OLD'),hot);assert.equal(store.read().liangshi.promoCountdown,3);assert.deepEqual(removed,['/user/images/following-old.png']);
  assert.equal(inputs[0].input.recipe.posts,15);assert.equal(inputs[0].body.max_tokens, undefined);assert.equal(h.modelRequests.length,1);assert.equal(h.metadataSaves,1);
  await service.toggleLike(first[0].id);await store.updateLiangshi(data=>({...data,posts:data.posts.map(row=>row.id===first[0].id?{...row,image:{...row.image,path:'/user/images/first.png'}}:row)}));
  answer({comments:[{authorId:first[0].authorId,text:'新评论'}],reposts:[{authorId:first[0].authorId,text:'新转发'}]});await service.loadMore(first[0].id);assert.equal(service.getPost(first[0].id).userLiked,true);assert.equal(service.getPost(first[0].id).image.path,'/user/images/first.png');
  const authorId=first[0].authorId;answer(batch('B'));const saves=h.metadataSaves;await service.refreshFollowing();assert.equal(h.metadataSaves,saves+1);assert.equal(h.modelRequests.length,3);
  for(const marker of ['A_CAPTION','A_IMAGE','A_COMMENT','A_ORIGINAL','SQUARE_OLD','HOT_OLD','FOLLOWING_OLD','/user/images/first.png'])assert.equal(JSON.stringify(inputs[2].input).includes(marker),false,marker);
  assert.equal(implementation.readLiangshiFollowingFeed(store.read().liangshi)[0].authorId,authorId);assert.equal(store.read().liangshi.promoCountdown,3);assert.deepEqual(removed,['/user/images/following-old.png','/user/images/first.png']);
  assert.deepEqual(h.persistedMetadata.pocketPhone,store.read());
});

test('Following author state is display-only and the selected stream is independent from Square',async()=>{
  const {store}=setup();const state=store.read(),before=structuredClone(state);
  const html=renderLiangshi(state,{ui:{liangshiPage:{kind:'feed',tab:'following'},liangshiExpanded:new Set()},busy:new Set()});
  assert.ok(html.includes('FOLLOWING_OLD'));assert.equal(html.includes('SQUARE_OLD'),false);assert.ok(html.includes('已关注'));assert.ok(html.includes('disabled'));assert.equal(html.includes('data-action="follow'),false);assert.deepEqual(state,before);
  const notice=renderPhoneNotice(state,{kind:'liangshi-following'});assert.ok(notice.includes('FOLLOWING_OLD'));assert.equal(notice.includes('SQUARE_OLD'),false);assert.ok(notice.includes('data-notice-kind="liangshi-following"'));
});

test('Following quote ownership survives Square replacement and releases only unowned files when Following is replaced',async()=>{
  const {target,service,store,answer,removed}=setup();
  target.metadata.pocketPhone.liangshi.posts[0].image={description:'旧广场共享原图',path:'/user/images/shared-square.png'};
  target.metadata.pocketPhone.liangshi.posts[2].quoteId='SQUARE_OLD';
  answer(batch('NEW_SQUARE'));await service.refresh();
  assert.ok(service.getPost('SQUARE_OLD'));assert.equal(implementation.isLiangshiFollowingPost(store.read().liangshi,'SQUARE_OLD'),true);assert.equal(implementation.isLiangshiFollowingPost(store.read().liangshi,'missing'),false);assert.deepEqual(removed,[]);
  answer(batch('NEW_FOLLOWING'));await service.refreshFollowing();
  assert.equal(service.getPost('SQUARE_OLD'),undefined);assert.ok(service.getPost('HOT_OLD'));
  assert.deepEqual(new Set(removed),new Set(['/user/images/shared-square.png','/user/images/following-old.png']));
});

test('parallel Following and Square parse handles against the latest saved pool without duplicate identities',async()=>{
  const {h,store,reader}=setup(),pending=[];
  const service=implementation.createLiangshiService({store,contextReader:reader,modelClient:{complete:request=>new Promise(resolve=>pending.push({request,resolve}))},random:()=>0});
  const square=service.refresh(),following=service.refreshFollowing();while(pending.length<2)await new Promise(resolve=>setImmediate(resolve));
  const follower=pending.find(row=>JSON.parse(row.request.messages[0].content).userPersona),publicRequest=pending.find(row=>!JSON.parse(row.request.messages[0].content).userPersona);
  publicRequest.resolve(JSON.stringify(batch('SQUARE','same-handle')));await square;const known=store.read().liangshi.accounts.find(row=>row.handle==='same-handle');
  follower.resolve(JSON.stringify(batch('FOLLOWING','same-handle')));await following;
  const data=store.read().liangshi;assert.equal(data.accounts.filter(row=>row.handle==='same-handle').length,1);assert.equal(data.accounts.find(row=>row.handle==='same-handle').avatar,known.avatar);
  assert.equal(implementation.readLiangshiFeed(data)[0].authorId,known.id);assert.equal(implementation.readLiangshiFollowingFeed(data)[0].authorId,known.id);assert.equal(h.metadataSaves,2);
});
