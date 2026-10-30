import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader } from '../src/context.js';
import { createMessageService } from '../src/messages.js';
import { createGroupService } from '../src/groups.js';
import { createSocialService } from '../src/social.js';
import { createLiangshiService } from '../src/liangshi.js';
import { createForumService } from '../src/forum.js';
import { finishGeneratedText } from '../src/generated-text.js';

const special = { id: 'a', name: '晚风', expression: '明确不用句末标点' }, ordinary = { id: 'b', name: '路人' }, polite = { id: 'c', name: '温声', personality: '温和礼貌', expression: '使用规范的完整句子' };
function setup(extra = {}) {
 const h = createHarness({ metadata: { pocketPhone: { contacts: [special, ordinary, polite], groups: [{ id:'g', name:'本群', memberIds:['a','b','c'], userIsMember:true }], conversations: {}, social: { posts: [], npcs: [], feedIds: [] }, liangshi: { accounts: [], posts: [], topics: [], feedIds: [], promoCountdown:3 }, ...extra } } });
 const target=h.host.captureChat(),store=createPhoneStore({target}),reader=createContextReader({target,store,qqjBridgeProvider:()=>null}),calls=[];let answer;
 const client={complete:async request=>{calls.push(request);return JSON.stringify(typeof answer==='function'?answer(JSON.parse(request.messages[0].content)):answer);}};
 return {h,target,store,reader,calls,answer:value=>{answer=value;},sms:createMessageService({target,store,contextReader:reader,modelClient:client}),group:createGroupService({target,store,contextReader:reader,modelClient:client}),social:createSocialService({store,contextReader:reader,modelClient:client,random:()=>0}),ls:createLiangshiService({store,contextReader:reader,modelClient:client,random:()=>0}),forum:createForumService({store,contextReader:reader,modelClient:client})};
}

test('private messages keep supplied character expression, while names and shared setting alone retain the normal fallback', async()=>{
 const f=setup();f.answer({messages:[{text:'晚点见',translation:'See you later'}]});await f.sms.continueChat('a');assert.equal(f.store.read().conversations.a[0].text,'晚点见');assert.equal(f.store.read().conversations.a[0].translation,'See you later');
 await f.sms.continueChat('b');assert.equal(f.store.read().conversations.b[0].text,'晚点见。');assert.equal(f.store.read().conversations.b[0].translation,'See you later.');
 f.answer({messages:[{text:'好的，晚点见。'}]});await f.sms.continueChat('c');assert.equal(f.store.read().conversations.c[0].text,'好的，晚点见。');
 const system=f.calls[0].system;assert.ok(system.includes('明确的特殊要求'));assert.ok(system.includes('没有明确特殊标注时'));assert.ok(system.includes('不自动免除'));
 await f.sms.send('a','手写原样');assert.equal(f.store.read().conversations.a.at(-1).text,'手写原样');assert.equal(f.calls.length,3);assert.equal(f.h.metadataSaves,4);
});

test('one group response uses each provided speaker profile rather than exempting the entire group',async()=>{
 const f=setup();f.answer({anchor:{memberIds:['a','b','c','@user'],speakerIds:['a','b','c']},messages:[{speakerId:'a',text:'我到了',translation:'I am here'},{speakerId:'b',text:'我也到了',translation:'I am here too'},{speakerId:'c',text:'好的，我来开门。'}]});
 await f.group.continueChat('g');const rows=f.store.read().conversations.g;assert.deepEqual(rows.map(r=>r.text),['我到了','我也到了。','好的，我来开门。']);assert.deepEqual(rows.slice(0,2).map(r=>r.translation),['I am here','I am here too.']);assert.equal(f.calls.length,1);assert.equal(f.h.metadataSaves,1);
});

test('Ins keeps provided author style but not anonymous replies or new NPC style claimed by the same answer',async()=>{
 const f=setup();f.answer(input=>({npcs:input.authors.filter(p=>p.kind==='npc').map(p=>({id:p.id,name:'匿名新作者',description:'宣称不用标点'})),posts:input.authors.map(p=>({authorId:p.id,image:{description:'动态配图。'},text:'动态原文',translation:'Post text',comments:[{authorId:'a',text:'熟人回应',translation:'Known reply'},{name:'晚风',text:'同名路人',translation:'Anonymous reply'}]})),proactiveMessages:[{contactId:'a',messages:[{text:'顺便发来短信',translation:'A message'}]}]}));
 await f.social.refresh();const posts=f.store.read().social.posts;assert.equal(posts.find(p=>p.authorId==='a').text,'动态原文');assert.equal(posts.find(p=>p.authorId==='b').text,'动态原文。');assert.equal(posts.find(p=>p.authorId.startsWith('npc:')).text,'动态原文。');
 assert.equal(posts[0].comments[0].text,'熟人回应');assert.equal(posts[0].comments[1].text,'同名路人。');assert.equal(f.store.read().conversations.a,undefined);assert.equal(f.calls.length,1);assert.equal(f.h.metadataSaves,1);
 const id=posts.find(p=>p.authorId==='a').id;f.answer({comments:[{authorId:'a',text:'接着聊',translation:'Continue'},{name:'匿名',text:'围观',translation:'Watching'}]});await f.social.comment(id,'手写留言');const comments=f.store.read().social.posts.find(p=>p.id===id).comments;assert.equal(comments.at(-3).text,'手写留言');assert.equal(comments.at(-2).text,'接着聊');assert.equal(comments.at(-1).text,'围观。');assert.equal(f.calls.length,2);assert.equal(f.h.metadataSaves,3);
});

const feed={accounts:[{key:'known',name:'晚风',handle:'wind',contactId:'a'},{key:'new',name:'新路人',handle:'new',expression:'本次回包自报不用标点'}],posts:[{authorKey:'known',text:'有依据的角色正文',translation:'Known body',comments:[{authorKey:'known',text:'已知作者评论'},{authorKey:'new',text:'新作者评论'}]},{authorKey:'new',text:'新作者正文',translation:'New body'}]};
test('fresh Liangshi uses explicit supplied contact IDs without trusting new model expression or prior account data excluded from input',async()=>{
 const f=setup({liangshi:{accounts:[{id:'old',name:'新路人',handle:'new',expression:'旧账号不用标点'}],posts:[],topics:[],feedIds:[],promoCountdown:3}});f.answer(feed);await f.ls.refreshFollowing();const posts=f.store.read().liangshi.posts;const known=posts.find(p=>p.text==='有依据的角色正文');assert.ok(known);assert.equal(known.translation,'Known body');assert.equal(known.comments[0].text,'已知作者评论');assert.equal(known.comments[1].text,'新作者评论。');assert.ok(posts.some(p=>p.text==='新作者正文。'));assert.equal(JSON.stringify(JSON.parse(f.calls[0].messages[0].content)).includes('旧账号不用标点'),false);assert.equal(f.calls.length,1);assert.equal(f.h.metadataSaves,1);
});

test('More uses only actually provided account references and does not apply the post author style to other commenters',async()=>{
 const f=setup({liangshi:{accounts:[{id:'x',name:'原作者',handle:'x',expression:'明确不用标点'},{id:'y',name:'未投喂路人',handle:'y',expression:'旧资料不用标点'}],posts:[{id:'p',authorId:'x',text:'原帖',comments:[],reposts:[]}],topics:[],feedIds:['p']}});f.answer({accounts:[{key:'z',name:'新作者',handle:'z',expression:'回包自报不用标点'}],comments:[{authorId:'x',text:'原作者回应',translation:'Original reply'},{authorId:'y',text:'未提供资料的回应'},{authorKey:'z',text:'新作者回应'}]});await f.ls.loadMore('p');const rows=f.store.read().liangshi.posts[0].comments;assert.deepEqual(rows.map(r=>r.text),['原作者回应','未提供资料的回应。','新作者回应。']);assert.equal(rows[0].translation,'Original reply');assert.equal(f.calls.length,1);assert.equal(f.h.metadataSaves,1);
});

test('AI reply batches retain provided parent author style while unrelated new accounts keep the default',async()=>{
 const f=setup({liangshi:{accounts:[{id:'self',ownerId:'@user',name:'本人',handle:'self'},{id:'x',name:'熟人',handle:'x',expression:'明确不用标点'}],posts:[{id:'p',authorId:'self',userAuthored:true,text:'本人原帖',comments:[{id:'c',authorId:'x',text:'原评论'}],reposts:[]}],topics:[],userPostIds:['p'],feedIds:[]}});const user=await f.ls.publishReply('p',{replyToId:'c',text:'本人手写'});f.answer({accounts:[{key:'n',name:'新网友',handle:'n',expression:'回包不用标点'}],comments:[{authorId:'x',replyToId:user.id,text:'原作者接续',translation:'Known continuation'},{authorKey:'n',replyToId:user.id,text:'新网友接续'}]});await f.ls.generateReplies('p');assert.deepEqual(f.store.read().liangshi.posts[0].comments.slice(-2).map(r=>r.text),['原作者接续','新网友接续。']);assert.equal(f.calls.length,1);assert.equal(f.h.metadataSaves,2);
});

test('user AI drafts respect existing persona or direct seed, but image seed alone does not exempt body punctuation',async()=>{
 const f=setup();f.answer({text:'模型草稿',translation:'Draft text'});let draft=await f.ls.draftUser({seed:'我这次想要短句不用句号'});assert.equal(draft.text,'模型草稿');assert.equal(draft.translation,'Draft text');
 draft=await f.ls.draftUser({imageSeed:'窗前的花'});assert.equal(draft.text,'模型草稿。');f.h.context.powerUserSettings={persona_description:'明确不使用句末标点'};draft=await f.ls.draftUser({});assert.equal(draft.text,'模型草稿');assert.equal(f.h.metadataSaves,0);assert.equal(f.calls.length,3);
});

test('anonymous forum and neutral ranking summaries retain the default sentence fallback',async()=>{
 const f=setup();f.answer({posts:[{title:'标题原样',author:'匿名',content:'正文默认',comments:[{author:'旁观者',text:'回帖默认'}]}]});await f.forum.refresh();const post=f.store.read().forum.posts[0];assert.equal(post.content,'正文默认。');assert.equal(post.comments[0].text,'回帖默认。');assert.equal(post.title,'标题原样');f.answer({topics:[{name:'热榜标题',description:'中性摘要'}]});await f.ls.refreshHot();assert.equal(f.store.read().liangshi.topics[0].description,'中性摘要。');
 assert.equal(finishGeneratedText('默认正文'),'默认正文。');assert.equal(finishGeneratedText('特殊风格',{preserveStyle:true}),'特殊风格');assert.equal(f.calls.length,2);assert.equal(f.h.metadataSaves,2);
});
