import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhoneStore } from '../src/store.js';
import { createHarness } from './harness.mjs';
import { captureFavorite, favoriteFor } from '../src/favorites.js';
import { contentImagePaths } from '../src/image-files.js';
import { createAuthoringService, stateFromPreset } from '../src/authoring.js';
import { readPhoneContext } from '../src/phone-context.js';
import { renderSocial } from '../src/ui/social.js';
import { renderPost } from '../src/ui/forum.js';
import { renderLiangshi } from '../src/ui/liangshi.js';
import { renderFavorites, renderFavoriteDetail, favoriteAction } from '../src/ui/favorites.js';

const fixture = () => ({ schemaVersion: 1, contacts: [{id:'a',name:'甲',nickname:'阿甲',secret:'不能保存'}], groups:[{id:'g',name:'群',memberIds:['a'],userIsMember:true}], userProfile:{name:'我'}, conversations:{a:[{id:'m',role:'assistant',text:' Original ',translation:'译文',batch:{key:'old'},image:{path:'/user/images/old.png',description:' 原描述 ',seed:8},secret:'不要保存'}],g:[{id:'pat',role:'assistant',speakerId:'a',type:'pat',text:'甲拍了拍你',pat:{targetId:'@user'},batch:{key:'now'}}]},social:{npcs:[],posts:[{id:'s',authorId:'a',text:'动态',image:{description:'未生成图'},comments:[{id:'sc',name:'乙',text:'评',translation:'译'}, {name:'旧评者',text:'旧评论'}]}]},forum:{posts:[{id:'f',author:'丙',title:'Title',titleTranslation:'标题',content:'Body',contentTranslation:'正文',comments:[{id:'fc',author:'丁',text:'楼层',image:{path:'/user/images/row.png',description:'楼图'}},{author:'旧楼',text:'旧内容'}]}]},liangshi:{accounts:[{id:'la',name:'博主'}],posts:[{id:'l',authorId:'la',text:'微博',comments:[{id:'lc',authorId:'la',text:'博评'}],reposts:[{id:'lr',authorId:'la',text:'转发',quoteId:'l'}]}],feedIds:['l'],topics:[]} });
function setup(){const h=createHarness({metadata:{pocketPhone:fixture()}});return {h,store:createPhoneStore({target:h.host.captureChat()})};}
const refs=[{app:'messages',kind:'message',conversationId:'a',messageId:'m'},{app:'messages',kind:'message',conversationId:'g',messageId:'pat'}, {app:'social',kind:'post',postId:'s'},{app:'social',kind:'comment',postId:'s',rowId:'sc'}, {app:'forum',kind:'post',postId:'f'},{app:'forum',kind:'comment',postId:'f',rowId:'fc'}, {app:'liangshi',kind:'post',postId:'l'},{app:'liangshi',kind:'comment',postId:'l',rowId:'lc'},{app:'liangshi',kind:'repost',postId:'l',rowId:'lr'}];
test('all domains capture only the selected unit and snapshot visible bilingual content and rich messages',()=>{
 const state=fixture();const snapshots=refs.map(ref=>captureFavorite(state,ref));assert.equal(snapshots.length,9);assert.deepEqual(snapshots.map(x=>x.snapshot.text),[' Original ','甲拍了拍你','动态','评','Body','楼层','微博','博评','转发']);
 assert.equal(snapshots[0].snapshot.authorName,'阿甲');assert.equal(snapshots[0].snapshot.translation,'译文');assert.deepEqual(snapshots[0].snapshot.image,{path:'/user/images/old.png',description:' 原描述 '});assert.equal(snapshots[0].source.batchKey,'old');assert.equal(snapshots[4].snapshot.titleTranslation,'标题');assert.equal(JSON.stringify(snapshots).includes('secret'),false);assert.equal(JSON.stringify(snapshots).includes('seed'),false);assert.equal(snapshots[8].snapshot.quote.text,'微博');
 for(const message of [{id:'r',type:'location',location:{name:'书店',address:'街角'},text:'定位'},{id:'r',type:'transfer',transfer:{amount:'2.00',currency:'CNY',note:'奶茶',status:'pending',recipientId:'@user'},text:'转账'},{id:'r',type:'sticker',stickerId:'test',text:'贴纸'}]) {state.conversations.a=[message];assert.equal(captureFavorite(state,{...refs[0],messageId:'r'}).snapshot.type,message.type);}
});
test('favorites save serially, deduplicate stable sources, preserve snapshots after source clear, and rollback failure',async()=>{
 const {h,store}=setup();assert.equal(h.metadataSaves,0);assert.equal(store.read().favorites,undefined);
 await Promise.all([store.addFavorite(refs[0]),store.addFavorite(refs[0])]);assert.equal(h.metadataSaves,1);assert.equal(store.read().favorites.length,1);const saved=structuredClone(store.read().favorites[0]);
 h.context.chatMetadata.pocketPhone.conversations.a[0].text='修改了';assert.equal(favoriteFor(store.read(),captureFavorite(store.read(),refs[0])).id,saved.id);
 await store.clearConversation('a',{key:'old'});assert.deepEqual(store.read().favorites[0],saved);assert.equal(store.read().conversations.a.length,0);
 h.saveFailure=Error('失败');await assert.rejects(store.removeFavorite(saved.id));assert.deepEqual(store.read().favorites,[saved]);h.saveFailure=null;
 await store.removeFavorite(saved.id);assert.equal(store.read().favorites.length,0);assert.equal(h.modelRequests.length,0);
});
test('legacy rows deduplicate by full snapshot and preserve the old content when source rows change',async()=>{
 const {store}=setup(),ref={app:'social',kind:'comment',postId:'s',rowIndex:1};await store.addFavorite(ref);await store.addFavorite(ref);assert.equal(store.read().favorites.length,1);
 const entry=store.read().favorites[0];assert.equal(entry.source.rowId,undefined);assert.equal(entry.source.legacy,true);
 store.read().social.posts[0].comments.splice(0,2,{id:'new',name:'新',text:'换批'});assert.equal(entry.source.legacy,true);assert.equal(entry.snapshot.text,'旧评论');
});
test('favorite image references survive source deletion and a true missing path removes only its path',async()=>{
 const {store}=setup();await store.addFavorite(refs[5]);const entry=store.read().favorites[0];store.read().forum.posts=[];
 assert.equal(contentImagePaths(store.read()).has('/user/images/row.png'),true);
 await store.clearImagePaths(['/user/images/row.png']);assert.deepEqual(store.read().favorites[0].snapshot.image,{description:'楼图'});assert.equal(entry.snapshot.image.path,'/user/images/row.png');
});
test('favorite snapshots are excluded from model phone context',async()=>{
 const {store}=setup();await store.addFavorite(refs[0]);const state=store.read();state.conversations={};state.social.posts=[];state.forum.posts=[];state.liangshi.posts=[];
 assert.equal(JSON.stringify(readPhoneContext(state,{anchor:{key:'now'},targetIds:['a']})).includes('Original'),false);
});

test('a queued favorite saves the unit captured at the click even if that ID is replaced meanwhile',async()=>{
 const {h,store}=setup();let release;const gate=new Promise(resolve=>{release=resolve});const originalSave=h.context.saveMetadata;h.context.saveMetadata=async()=>{await gate;return originalSave();};
 const earlier=store.setTheme('night');await new Promise(resolve=>setImmediate(resolve));
 const favorite=store.addFavorite(refs[0]);store.read().conversations.a=[{id:'m',role:'assistant',text:'后来同ID的内容',batch:{key:'new'}}];release();await earlier;await favorite;
 assert.equal(store.read().favorites[0].snapshot.text,' Original ');assert.equal(store.read().favorites[0].source.batchKey,'old');
});
test('a quoted post snapshot contains only its visible 110-character excerpt, without hidden photo or quote tree',()=>{
 const state=fixture();state.liangshi.posts[0].text='A'.repeat(150);state.liangshi.posts[0].translation='中'.repeat(150);state.liangshi.posts[0].image={path:'/user/images/hidden.png',description:'未在引用中显示'};
 const quote=captureFavorite(state,refs[8]).snapshot.quote;assert.equal(quote.text,'A'.repeat(110)+'…');assert.equal(quote.translation,'中'.repeat(110)+'…');assert.equal(quote.image,undefined);assert.equal(quote.quote,undefined);
});
test('reused story message IDs in another exact batch are distinct favorite sources',async()=>{
 const {store}=setup();store.read().conversations.a[0].id='story:5:0';await store.addFavorite({...refs[0],messageId:'story:5:0',batchKey:'old'});const entry=store.read().favorites[0];
 store.read().conversations.a=[{id:'story:5:0',role:'assistant',text:'新锚的短信',batch:{key:'new'}}];
 assert.equal(entry.snapshot.text,' Original ');const now=captureFavorite(store.read(),{...refs[0],messageId:'story:5:0',batchKey:'new'});assert.equal(favoriteFor(store.read(),now),undefined);
 await store.addFavorite({...refs[0],messageId:'story:5:0',batchKey:'new'});assert.equal(store.read().favorites.length,2);
});

test('quoted self posts save the visible user nickname instead of the internal account name',()=>{
 const state=fixture();state.userProfile={name:'本人名',nickname:'页面网名'};state.liangshi.accounts[0]={id:'la',name:'内部账号名',ownerId:'@user'};
 const snapshot=captureFavorite(state,refs[8]).snapshot;assert.equal(snapshot.authorName,'页面网名');assert.equal(snapshot.quote.authorName,'页面网名');
});

test('unknown source publication time never becomes private generated-at time',()=>{
 const state=fixture();Object.assign(state.social.posts[0],{publishedAt:'',createdAt:'2026-10-31T12:00:00Z',storyDate:'旧剧情日期'});
 assert.equal(captureFavorite(state,refs[2]).snapshot.publishedAt,'过去');
 state.conversations.a[0].createdAt='2026-10-31T12:00:00Z';assert.equal(captureFavorite(state,refs[0]).snapshot.publishedAt,'');
});
test('failed first favorite save leaves the old archive untouched and retry saves one copy',async()=>{
 const {h,store}=setup();h.saveFailure=Error('失败');await assert.rejects(store.addFavorite(refs[0]));assert.equal(store.read().favorites,undefined);h.saveFailure=null;await store.addFavorite(refs[0]);assert.equal(store.read().favorites.length,1);assert.equal(h.metadataSaves,1);
});

test('author export and preset initialization exclude private favorite snapshots',async()=>{
 const {h,store}=setup();await store.addFavorite(refs[0]);const authoring=createAuthoringService({host:h.host,store,readEntries:()=>({})});const {script}=await authoring.exportScript();
 assert.equal(Object.hasOwn(script.data.twoMoreThings,'favorites'),false);assert.equal(JSON.stringify(script).includes('Original'),false);
 assert.equal(Object.hasOwn(stateFromPreset({...script.data.twoMoreThings,favorites:store.read().favorites}),'favorites'),false);assert.equal(h.modelRequests.length,0);
});

test('an unavailable old sticker keeps the visible original text in its saved detail',()=>{
 const state=fixture();state.conversations.a=[{id:'old-sticker',role:'assistant',type:'sticker',stickerId:'unavailable-old-id',text:'这张旧贴纸原本保留的说明'}];
 const candidate=captureFavorite(state,{app:'messages',kind:'message',conversationId:'a',messageId:'old-sticker'});assert.equal(candidate.snapshot.text,'这张旧贴纸原本保留的说明');
});


test('posts and independent reposts expose favorites while comments retain text and replies without separate favorite controls', async () => {
 const {store}=setup(), state=store.read(), busy=new Set();
 state.social.feedIds=['s'];
 const socialUI={socialCommentOpen:new Set(),socialDrafts:new Map()}, liangshiUI={liangshiExpanded:new Set(),liangshiReplyDrafts:new Map()};
 const social=()=>renderSocial(state,{ui:socialUI,busy});
 assert.equal((social().match(/data-action="favorite-add"/g)||[]).length,1);
 assert.doesNotMatch(social(),/data-action="favorite-menu"/);assert.ok(social().includes('旧评论'));assert.ok(social().includes('评'));
 await store.addFavorite(refs[2]);const socialSaved=renderSocial(store.read(),{ui:socialUI,busy});
 assert.match(socialSaved, /aria-label="已收藏"/);
 const forum=renderPost(state,{ui:{postId:'f'},busy});
 assert.equal((forum.match(/data-action="favorite-add"/g)||[]).length,1);assert.doesNotMatch(forum,/data-action="favorite-menu"/);assert.match(forum,/data-action="forum-reply"/);
 for(const tab of ['comments','reposts']) {
  const html=renderLiangshi(state,{ui:{...liangshiUI,liangshiPage:{kind:'post',id:'l',tab}},busy});
  assert.equal((html.match(/data-action="favorite-add"/g)||[]).length,tab==='reposts'?2:1);assert.doesNotMatch(html,/data-action="favorite-menu"/);
 }
 state.liangshi.accounts[0].ownerId='@user';state.liangshi.posts[0].userAuthored=true;state.liangshi.userPostIds=['l'];
 const own=renderLiangshi(state,{ui:{...liangshiUI,liangshiPage:{kind:'feed',tab:'mine'}},busy});
 assert.equal((own.match(/data-action="favorite-add"/g)||[]).length,1);assert.match(own,/data-action="liangshi-menu"/);
});


test('favorite filters and rows reuse forum tags and forum cards rather than a separate card style',()=>{
 const state={favorites:[{id:'archive',source:{app:'forum',kind:'post'},snapshot:{sourceLabel:'论坛 · 主帖',authorName:'甲',title:'Title',titleTranslation:'标题',text:'完整正文',translation:'Full body',publishedAt:'2031-04-08 10:00'}}]};
 const html=renderFavorites(state,{ui:{favoriteFilter:''}});
 assert.match(html,/class="[^"]*forum-tags[^"]*favorite-filters/);assert.match(html,/class="[^"]*forum-posts[^"]*favorite-list/);assert.match(html,/class="[^"]*forum-card[^"]*favorite-card/);
 assert.match(html,/class="post-title"/);assert.match(html,/class="post-topline"/);assert.match(html,/class="post-footer"/);assert.doesNotMatch(html,/class="quiet-button"/);
});

for(const [app,kind,sourceClass,imageClass] of [
 ['forum','post','post-detail','forum-photo'],['forum','comment','comment-row','forum-photo'],
 ['social','post','social-post','social-photo'],['social','comment','social-comment','social-photo'],
 ['liangshi','post','ls-post','ls-photo'],['liangshi','comment','ls-comment','ls-photo'],['liangshi','repost','ls-repost','ls-photo'],
 ['messages','message','bubble','image-message']
]) test(`${app} ${kind} favorite detail keeps source typography and an ungenerated image frame from the saved snapshot`,()=>{
 const entry={id:'saved',source:{app,kind},snapshot:{sourceLabel:'保存时来源',authorName:'保存时作者',title:'Original title',titleTranslation:'原标题',text:'Original body',translation:'原正文',publishedAt:'2031-04-08 10:00',image:{description:'收藏时尚未生成的画面'}}};
 if(app==='messages')entry.snapshot.type='image';
 const state={favorites:[entry]},before=structuredClone(state),html=renderFavoriteDetail(state,{ui:{favoriteId:'saved'},busy:new Set()});
 assert.match(html,new RegExp(`class="[^"]*${sourceClass}`));assert.match(html,new RegExp(`class="[^"]*${imageClass}`));assert.ok(html.includes('收藏时尚未生成的画面'));assert.ok(html.includes('未生成'));
 assert.doesNotMatch(html,/data-action="(?:forum-image|social-image|liangshi-image|image|favorite-source)"/);assert.doesNotMatch(html,/点击生成/);assert.deepEqual(state,before);
 entry.snapshot.image.path='/user/images/saved.png';const saved=renderFavoriteDetail(state,{ui:{favoriteId:'saved'},busy:new Set()});assert.match(saved,/data-action="favorite-photo"/);assert.match(saved,/saved.png/);
});


test('legacy chat snapshots with an image field keep both their saved text and photo',()=>{
 const state={favorites:[{id:'legacy-photo',source:{app:'messages',kind:'message'},snapshot:{authorName:'甲',sourceLabel:'私聊',text:'旧消息原文',translation:'Saved original',image:{path:'/user/images/legacy.png',description:'旧图描述'}}}]};
 const html=renderFavoriteDetail(state,{ui:{favoriteId:'legacy-photo'},busy:new Set()});
 assert.ok(html.includes('旧消息原文'));assert.ok(html.includes('Saved original'));assert.ok(html.includes('legacy.png'));assert.match(html,/data-action="favorite-photo"/);
});


for(const message of [false,true]) test(`${message?'message':'post'} favorites keep two visible characters and use hollow or solid bookmark from saved state`,async()=>{
 const {store}=setup(),ref=refs[0];
 const before=favoriteAction(ref,undefined,false,{message});assert.match(before,/aria-pressed="false"/);assert.match(before,/<span>收藏<\/span>/);assert.doesNotMatch(before,/<path[^>]*fill="currentColor"/);
 await store.addFavorite(ref);const entry=store.read().favorites[0],after=favoriteAction(ref,entry,false,{message});assert.match(after,/aria-pressed="true"/);assert.match(after,/aria-label="已收藏"/);assert.match(after,new RegExp(`data-favorite-id="${entry.id}"`));assert.match(after,/<span>收藏<\/span>/);assert.doesNotMatch(after,/<span>已收藏<\/span>/);assert.match(after,/<path[^>]*fill="currentColor"/);
 const saves=store.read().favorites.length;await store.addFavorite(ref);assert.equal(store.read().favorites.length,saves);
});
