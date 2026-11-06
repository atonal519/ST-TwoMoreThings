import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader } from '../src/context.js';
import { createForumService } from '../src/forum.js';
import { readPhoneContext } from '../src/phone-context.js';
import { captureFavorite, favoriteFor } from '../src/favorites.js';
import { readAlbumPhotos } from '../src/album.js';
import { createPhoneImageService } from '../src/phone-images.js';
import { contentImagePaths } from '../src/image-files.js';
import { createAuthoringService, stateFromPreset } from '../src/authoring.js';

const profile={name:'听雪宗',memberScope:'本宗门人及常驻山门的杂役'};
const post=()=>({title:'藏书阁借阅时限能商量吗',author:'山门扫雪人',content:'最近抄录典籍比较慢，想问问大家如何安排。',comments:[{author:'风过松林',text:'先借卷一就好。'}]});
function setup(){
 const h=createHarness({messages:[{is_user:false,mes:'山门今日开放藏书阁。'}],metadata:{pocketPhone:{contacts:[],groups:[],conversations:{},forum:{posts:[{id:'public-old',title:'圈外旧帖',author:'过客',content:'公共话题。',comments:[]}]}}}});
 h.context.powerUserSettings={persona_description:'宗门弟子。PRIVATE_PERSONA_DETAIL'};
 const target=h.host.captureChat(),store=createPhoneStore({target}),calls=[],scans=[];let answer={profile,posts:[post()]};
 target.readWorldInfo=async({scanText})=>{scans.push(scanText);return '世界设定';};
 const reader=createContextReader({target,store,qqjBridgeProvider:()=>{throw Error('no actor memory');}});
 const service=createForumService({store,contextReader:reader,modelClient:{complete:async request=>{calls.push(request);return typeof answer==='function'?answer(request):JSON.stringify(answer);}}});
 return {h,target,store,reader,service,calls,scans,answer:value=>{answer=value;}};
}

test('circle first refresh learns a non-dictionary community in its one request and one save, then keeps the saved profile',async()=>{
 const f=setup(),before=structuredClone(f.store.read());assert.equal(f.h.metadataSaves,0);assert.equal(f.service.getPost('missing','circle'),undefined);
 await f.service.refresh('circle');assert.equal(f.calls.length,1);assert.equal(f.h.metadataSaves,1);assert.deepEqual(f.store.read().forum.posts,before.forum.posts);assert.deepEqual(f.store.read().forum.circle.profile,profile);
 const input=JSON.parse(f.calls[0].messages[0].content);assert.equal(input.circleProfile,null);assert.equal(f.calls[0].system.includes('外部公众视角'),false);assert.equal(f.calls[0].system.includes('论坛内容公开、作者身份匿名'),false);assert.ok(input.userPersona.includes('PRIVATE_PERSONA_DETAIL'));assert.ok(f.scans[0].includes(input.setting)&&f.scans[0].includes('PRIVATE_PERSONA_DETAIL'));
 let scanned='';f.target.readWorldInfo=async ({scanText})=>{scanned=scanText;return '世界设定';};
 f.answer({profile:{name:'模型不应改名',memberScope:'任何人'},posts:[post()]});await f.service.refresh('circle');assert.equal(f.calls.length,2);assert.deepEqual(f.store.read().forum.circle.profile,profile);
 const next=JSON.parse(f.calls[1].messages[0].content);assert.deepEqual(next.circleProfile,profile);assert.equal('userPersona' in next,false);assert.ok(scanned.includes(profile.name)&&scanned.includes(profile.memberScope));
 await f.service.refresh();assert.deepEqual(f.store.read().forum.circle.profile,profile);assert.equal(f.calls.length,3);
});

test('unknown or invalid first profile never saves posts or mutates old state',async()=>{
 for(const value of [null,{}, {name:'猜一个',memberScope:''}]){const f=setup(),before=structuredClone(f.store.read());f.answer({profile:value,posts:[post()]});await assert.rejects(f.service.refresh('circle'),/圈内|范围|社区/);assert.deepEqual(f.store.read(),before);assert.equal(f.calls.length,1);assert.equal(f.h.metadataSaves,0);}
});

test('manual profile changes clear only circle posts, same values are no-op, stale generation cannot override',async()=>{
 const f=setup();await f.service.refresh('circle');const count=f.h.metadataSaves;await f.store.saveCircleProfile({...profile});assert.equal(f.h.metadataSaves,count);
 let release;f.answer(()=>new Promise(resolve=>{release=resolve;}));const pending=f.service.refresh('circle');while(!release)await new Promise(r=>setTimeout(r,0));
 const next={name:'新社区',memberScope:'新社区常驻成员'};await f.store.saveCircleProfile(next);release(JSON.stringify({profile,posts:[post()]}));await assert.rejects(pending,/范围|修改|更新/);
 assert.deepEqual(f.store.read().forum.circle,{profile:next,posts:[]});assert.equal(f.store.read().forum.posts[0].id,'public-old');
});

test('circle more/manual comments stay in that scope and all circle material stays outside public phoneContext',async()=>{
 const f=setup();await f.service.refresh('circle');const p=f.store.read().forum.circle.posts[0];const own=await f.service.publishComment(p.id,{text:'CIRCLE_PRIVATE_COMMENT'},'circle');
 f.answer({comments:[{author:'山风',text:'CIRCLE_PRIVATE_REPLY',replyToId:own.id,translation:'CIRCLE_PRIVATE_TRANSLATION',image:{description:'CIRCLE_PRIVATE_IMAGE'}}]});await f.service.loadMore(p.id,'circle');
 const input=JSON.parse(f.calls.at(-1).messages[0].content);assert.deepEqual(input.circleProfile,profile);assert.ok(input.continuation.comments.some(row=>row.id===own.id));assert.equal('storyBackground' in input,false);assert.equal('userPersona' in input,false);assert.ok(f.calls.at(-1).system.includes('circleProfile'));assert.equal(f.calls.at(-1).system.includes('论坛内容公开、作者身份匿名'),false);
 assert.equal(f.service.getPost(p.id),undefined);assert.equal(f.service.getPost(p.id,'circle').comments.at(-1).replyToId,own.id);
 const publicContext=JSON.stringify(readPhoneContext(f.store.read(),{publicOnly:true}));for(const marker of ['CIRCLE_PRIVATE_COMMENT','CIRCLE_PRIVATE_REPLY','CIRCLE_PRIVATE_TRANSLATION','CIRCLE_PRIVATE_IMAGE'])assert.equal(publicContext.includes(marker),false);
 assert.equal(f.store.read().forum.posts[0].id,'public-old');
});

test('circle favorites and notifications have explicit scope, old public keys stay distinct and snapshots survive profile edits',async()=>{
 const f=setup();await f.service.refresh('circle');const p=f.store.read().forum.circle.posts[0];
 assert.equal(f.store.read().notifications.items.at(-1).kind,'forum-circle');
 const ref={app:'forum',kind:'post',postId:p.id,scope:'circle'};await f.store.addFavorite(ref);const saved=structuredClone(f.store.read().favorites[0]);
 assert.equal(saved.source.scope,'circle');assert.ok(saved.snapshot.sourceLabel.includes(profile.name));
 const sameIdPublic={...p,title:'圈外同编号'};await f.store.replaceForum([sameIdPublic]);assert.equal(favoriteFor(f.store.read(),captureFavorite(f.store.read(),{app:'forum',kind:'post',postId:p.id})),undefined);
 f.answer({comments:[{author:'新网友',text:'圈内回复。'}]});await f.service.loadMore(p.id,'circle');assert.equal(f.store.read().notifications.items[0].kind,'forum-circle-post');assert.equal(f.store.read().notifications.items[0].id,p.id);
 await f.store.saveCircleProfile({name:'新组织',memberScope:'新成员'});assert.deepEqual(f.store.read().favorites[0],saved);assert.equal(f.store.read().forum.posts[0].title,'圈外同编号');
});

function imageService(f,generate){
 const recipes=[];const service=createPhoneImageService({store:f.store,modelClient:{complete:async request=>{recipes.push(request);return JSON.stringify({prompt:'quiet courtyard',characters:[]});}},apiProvider:()=>({apiVersion:1,getBackendStatus:()=>({configured:true}),getCharacters:()=>({characters:[{name:'PRIVATE_CATALOG_NAME',tag:'private'}]}),generate}),files:{findMissing:async paths=>paths}});
 return {service,recipes};
}

test('circle post and reply images use original anonymous drawing and 404 clears all circle/favorite/album references',async()=>{
 const f=setup();f.answer({profile,posts:[{...post(),image:{description:'旧山门石阶'},comments:[{author:'风过松林',text:'回帖。',image:{description:'藏书阁窗棂'}}]}]});await f.service.refresh('circle');const p=f.store.read().forum.circle.posts[0];let draws=0;
 const {service,recipes}=imageService(f,async()=>({path:`/user/images/circle-${++draws}.png`}));
 await service.generateForum(p.id,undefined,'circle');await service.generateForum(p.id,p.comments[0].id,'circle');assert.equal(draws,2);
 for(const recipe of recipes)assert.equal(JSON.stringify(recipe).includes('PRIVATE_CATALOG_NAME'),false);
 assert.equal(contentImagePaths(f.store.read()).size,2);assert.equal(readAlbumPhotos(f.store.read()).length,2);
 await f.store.addFavorite({app:'forum',kind:'post',postId:p.id,scope:'circle'});const paths=[...contentImagePaths(f.store.read())];await service.recoverMissing(paths);
 assert.equal(f.store.read().forum.circle.posts[0].image.path,undefined);assert.equal(f.store.read().forum.circle.posts[0].comments[0].image.path,undefined);assert.equal(f.store.read().favorites[0].snapshot.image.path,undefined);assert.equal(readAlbumPhotos(f.store.read()).length,0);
});

test('paid circle image arriving after a profile change remains in captured old-community album without attaching',async()=>{
 const f=setup();f.answer({profile,posts:[{...post(),image:{description:'旧社区的石阶'}}]});await f.service.refresh('circle');const p=f.store.read().forum.circle.posts[0];let release;
 const {service}=imageService(f,()=>new Promise(resolve=>{release=resolve;}));const pending=service.generateForum(p.id,undefined,'circle');while(!release)await new Promise(r=>setTimeout(r,0));
 await f.store.saveCircleProfile({name:'新社区',memberScope:'新成员'});release({path:'/user/images/circle-late.png'});await assert.rejects(pending,/未关联|已保存/);
 const photo=readAlbumPhotos(f.store.read())[0];assert.equal(photo.path,'/user/images/circle-late.png');assert.ok(photo.sources.some(source=>source.label.includes(profile.name)));assert.ok(photo.sources.every(source=>!source.label.includes('新社区')));assert.equal(f.store.read().forum.circle.posts.length,0);
});

test('card presets export only circle configuration and initialize an empty circle without history or favorites',async()=>{
 const f=setup();await f.service.refresh('circle');const p=f.store.read().forum.circle.posts[0];await f.store.addFavorite({app:'forum',kind:'post',postId:p.id,scope:'circle'});
 const exported=await createAuthoringService({store:f.store,host:f.h.host}).exportScript();const preset=exported.script.data.twoMoreThings;
 assert.deepEqual(preset.forumCircleProfile,profile);for(const key of ['forum','favorites','albumPhotos','notifications'])assert.equal(key in preset,false);
 const state=stateFromPreset(preset);assert.deepEqual(state.forum,{posts:[],circle:{profile,posts:[]}});assert.equal('favorites' in state,false);
});

test('production forum renders only the selected scope, preserves public defaults and emits scoped favorite/form targets',async()=>{
 const {renderForum,renderForumMenu,renderPost}=await import('../src/ui/forum.js');const f=setup();await f.service.refresh('circle');const state=f.store.read(),before=structuredClone(state),busy=new Set();
 const outside=renderForum(state,{ui:{forumTag:''},busy}),inside=renderForum(state,{ui:{forumScope:'circle',forumTag:''},busy});assert.ok(outside.includes('圈外旧帖'));assert.ok(!outside.includes('藏书阁借阅'));assert.ok(inside.includes('藏书阁借阅'));assert.ok(!inside.includes('圈外旧帖'));assert.ok(!inside.includes('forum-sections')&&!inside.includes('forum-circle-line'));assert.ok(inside.includes('id="forum-title-toggle"'));
 const menu=renderForumMenu(state,{ui:{forumScope:'circle'}});assert.ok(menu.includes('role="menuitemradio"')&&menu.includes('aria-checked="true"')&&menu.includes(profile.name)&&menu.includes('更改圈内范围'));
 const detail=renderPost(state,{ui:{forumScope:'circle',postId:state.forum.circle.posts[0].id,forumDrafts:new Map(),forumVotes:new Map()},busy});assert.ok(detail.includes('data-forum-scope="circle"'));const encoded=detail.match(/data-favorite-ref="([^"]+)"/)[1];assert.equal(JSON.parse(decodeURIComponent(encoded)).scope,'circle');assert.deepEqual(state,before);
});
