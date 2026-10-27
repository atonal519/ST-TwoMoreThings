import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { openApp } from './navigation.mjs';
import { liangshiFeed } from './liangshi-fixture.mjs';
const root=resolve(import.meta.dirname,'..'),prefix='/scripts/extensions/third-party/ST-PocketPhone/',output=process.env.POCKET_POLISH_OUTPUT;
if(output)await mkdir(output,{recursive:true});
const {chromium}=createRequire('/tmp/st-tools-browser/package.json')('playwright');
const browser=await chromium.launch({executablePath:'/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox'],env:{...process.env,LD_LIBRARY_PATH:'/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu'}});
const results=[],mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf'};
try{for(const [kind,mode] of [['native','standalone'],['luker','embedded']]){
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(6000);
 const ownKey=mode==='embedded'?'twoMoreThingsEmbedded':'pocketPhone',models=[],lists=[],errors=[],unexpected=[];
 let expectedModel='model-beta',expectedUrl='https://manual.invalid/v1',expectedKey='manual-key';
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(url.hostname!=='127.0.0.1'){unexpected.push(url.href);return route.abort();}
  if(path.startsWith(prefix))return route.fulfill({path:resolve(root,decodeURIComponent(path.slice(prefix.length))),contentType:mime[extname(path)]||'text/plain'});
  if(path==='/scripts/extensions.js')return route.fulfill({contentType:'text/javascript',body:"export const extensionTypes={'third-party/ST-PocketPhone':'local'};"});
  if(path==='/scripts/world-info.js')return route.fulfill({contentType:'text/javascript',body:'export const selected_world_info=[],world_info={};export async function loadWorldInfo(){return {entries:{0:{content:"公开城市背景。",constant:true}}}}'});
  if(path==='/api/extensions/version')return route.fulfill({json:{currentBranchName:'main',currentCommitHash:'a'.repeat(40),remoteUrl:'https://github.com/fixture/phone',isUpToDate:true}});
  if(path==='/user/images/polish.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250"><rect width="400" height="250" fill="#c7d8d0"/><circle cx="300" cy="70" r="35" fill="#e9c68e"/></svg>'});
  if(path==='/api/backends/chat-completions/status'){lists.push(route.request().postDataJSON());return route.fulfill({json:{data:[{id:'model-alpha'},{id:'model-beta'}]}});}
  if(path==='/api/backends/chat-completions/generate'){
   const request=route.request().postDataJSON(),payload=JSON.parse(request.messages[1].content),system=request.messages[0].content;
   assert.equal(request.model,expectedModel);assert.equal(request.reverse_proxy,expectedUrl);assert.equal(request.proxy_password,expectedKey);
   let answer,type;
   if(payload.recipe){type='liangshi';answer=liangshiFeed(payload.recipe.promotions);answer.accounts[0].contactId='lin';answer.posts[0].image={description:'河边风景'};answer.posts.at(-2).text='白鳥两三事把短信、群聊、论坛与动态装进小手机。';answer.posts.at(-2).likes=0;answer.posts.at(-2).commentCount=0;answer.posts.at(-2).repostCount=0;}
   else if(payload.post){type='liangshi-more';assert.equal(payload.post.likes,50000);assert.equal(payload.post.commentCount,5000);assert.equal(payload.post.repostCount,2000);answer={comments:Array.from({length:10},(_,index)=>({authorId:payload.accounts[0].id,text:`合成评论${index+1}：这个小手机有意思😂`})),reposts:Array.from({length:4},(_,index)=>({authorId:payload.accounts[0].id,text:`合成转发${index+1}：记下这个功能`}))};}
   else if(payload.description){type='image-tags';answer={prompt:'river, landscape',characters:[],size:'landscape'};}
   else if(payload.maxCharacters){type='summary';answer={summary:'合成短信内容供主楼参考。'};}
   else if(payload.task==='feed'){type='social';answer={posts:[{authorId:'lin',text:'普通动态',publishedAt:'2031年4月8日 09:20'}]};}
   else if(payload.group){type='group';answer={anchor:{memberIds:payload.group.members.map(person=>person.id),speakerIds:['lin']},messages:[{speakerId:'lin',text:'合成群消息'}]};}
   else if(payload.contact){type='sms';answer={messages:[{text:'合成短信回复'}]};}
   else if(system.includes('外部公众视角的论坛')){type='forum';answer={posts:[{title:'合成城市消息',author:'路人',content:'普通公开消息'}]};}
   else throw Error('unexpected task');
   models.push({type,model:request.model});return route.fulfill({json:{choices:[{message:{content:JSON.stringify(answer)}}]}});
  }
  unexpected.push(url.href);return route.abort();
 });
 await page.goto(`http://127.0.0.1:8917${prefix}tests/startup.html?host=${kind}&mode=${mode}`);await page.waitForFunction(()=>startupHarness.ready);
 await page.evaluate(key=>{const h=startupHarness;h.settings['schedule-planner'].apiPresets=[];h.settings[key].apiSourceRef={kind:'qqj-current'};h.imageCalls=0;globalThis.STBaiBaiImage={apiVersion:1,getBackendStatus:()=>({configured:true}),getCharacters:()=>({characters:[]}),generate:async()=>{h.imageCalls++;return {path:'/user/images/polish.svg'};}};},ownKey);
 await page.getByRole('button',{name:mode==='embedded'?'打开两三事 · 随卡':'打开两三事',exact:true}).click();
 const phone=page.locator(mode==='embedded'?'#pocket-phone-card-host':'#pocket-phone-host'),initialSettingsSaves=await page.evaluate(()=>startupHarness.settingsSaves);
 if(output&&kind==='native'){
  const font=(await readFile('/tmp/st-dollars-npc-rewrite-20261017/graph-ui-20261018/diagnostic-assets/NotoSansCJKsc-Regular.otf')).toString('base64');await phone.evaluate(async(element,data)=>{const face=new FontFace('PhoneFixtureCJK',`url(data:font/otf;base64,${data})`);await face.load();document.fonts.add(face);const style=document.createElement('style');style.textContent=':host{font-family:PhoneFixtureCJK,sans-serif}';element.shadowRoot.append(style);},font);
 }
 await openApp(phone,'设置');assert.equal(await phone.locator('#api-source').evaluate(element=>element.tagName),'BUTTON');assert.equal(await phone.locator('[data-drawer="connection"] svg').count(),1);
 await phone.locator('#api-url').fill('https://manual.invalid');await phone.locator('#api-key').fill('manual-key');await phone.locator('#api-model').fill('   ');await phone.getByRole('button',{name:'拉取模型',exact:true}).click();await phone.locator('.model-options').waitFor();
 assert.equal(lists.length,1);assert.equal(lists[0].reverse_proxy,'https://manual.invalid/v1');assert.equal(lists[0].proxy_password,'manual-key');assert.equal(await phone.locator('#api-model').inputValue(),'model-alpha');
 await phone.locator('[data-model="model-beta"]').click();assert.equal(await page.evaluate(()=>startupHarness.settingsSaves),initialSettingsSaves);await phone.locator('.api-form').getByRole('button',{name:'保存',exact:true}).click();await phone.locator('#api-url[readonly]').waitFor();
 assert.equal(await page.evaluate(key=>startupHarness.settings[key].apiModel,ownKey),'model-beta');assert.equal(await page.evaluate(()=>startupHarness.settings['schedule-planner'].apiPresets.length),1);
 const savedPool=await page.evaluate(()=>structuredClone(startupHarness.settings['schedule-planner'].apiPresets));
 await phone.locator('#api-model').fill('unsaved-model');await openApp(phone,'论坛');await phone.getByRole('button',{name:'刷新',exact:true}).click();await phone.getByText('合成城市消息',{exact:true}).waitFor();assert.equal(models.at(-1).model,'model-beta');
 await openApp(phone,'设置');assert.equal(await phone.locator('#api-model').inputValue(),'model-beta');
 await page.evaluate(()=>Object.assign(startupHarness.settings['schedule-planner'].apiPresets[0],{url:'https://changed.invalid',key:'changed-key',model:'remote-model'}));expectedUrl='https://changed.invalid/v1';expectedKey='changed-key';
 await phone.getByRole('button',{name:'拉取模型',exact:true}).click();await phone.locator('.model-options').waitFor();assert.equal(await phone.locator('#api-model').inputValue(),'model-beta');assert.equal(lists.at(-1).reverse_proxy,expectedUrl);assert.equal(lists.at(-1).proxy_password,expectedKey);
 await phone.locator('#model-search').fill('alpha');assert.equal(await phone.locator('[data-model]').count(),1);await phone.locator('[data-model="model-alpha"]').click();
 if(output&&kind==='native')await phone.locator('.phone-shell').screenshot({path:resolve(output,'api-models.png')});
 assert.equal(await page.evaluate(key=>startupHarness.settings[key].apiModel,ownKey),'model-beta');await phone.locator('.api-form').getByRole('button',{name:'保存',exact:true}).click();await page.waitForFunction(key=>startupHarness.settings[key].apiModel==='model-alpha',ownKey);expectedModel='model-alpha';
 assert.equal(await page.evaluate(()=>startupHarness.settings['schedule-planner'].apiPresets[0].model),'remote-model');
 await page.evaluate(()=>startupHarness.settings['schedule-planner'].apiPresets.push({id:'second',name:'第二连接',url:'https://second.invalid',key:'second-key',model:'second-model'}));await openApp(phone,'论坛');await openApp(phone,'设置');await phone.locator('#api-source').click();await phone.locator('[data-api-source="shared-preset:second"]').click();await page.waitForFunction(key=>startupHarness.settings[key].apiSourceRef.presetId==='second',ownKey);assert.equal(await phone.locator('#api-model').inputValue(),'model-alpha');expectedUrl='https://second.invalid/v1';expectedKey='second-key';
 await phone.locator('#api-source').click();assert.ok((await phone.locator('.source-options').innerText()).includes('自行填写'));assert.ok(!(await phone.locator('.source-options').innerText()).includes('跟随'));await phone.locator('#api-source').click();
 await openApp(phone,'短信');await phone.locator('[data-contact="lin"]').click();await phone.getByRole('button',{name:'继续',exact:true}).click();await phone.getByText('合成短信回复',{exact:true}).waitFor();
 await openApp(phone,'短信');await phone.locator('[data-group="friends"]').click();await phone.getByRole('button',{name:'继续',exact:true}).click();await phone.getByText('合成群消息',{exact:true}).waitFor();
 await openApp(phone,'论坛');await phone.getByRole('button',{name:'刷新',exact:true}).click();await phone.getByText('合成城市消息',{exact:true}).waitFor();
 await openApp(phone,'ainstgram');await phone.getByRole('button',{name:'刷新动态',exact:true}).click();await phone.getByText('普通动态',{exact:true}).waitFor();
 await openApp(phone,'两事');await phone.getByRole('button',{name:'刷新广场',exact:true}).click();await phone.locator('.ls-post').first().waitFor();const ad=phone.locator('.ls-post').filter({hasText:'白鳥两三事把短信'}),adId=await ad.getAttribute('data-liangshi-id');
 await page.evaluate(id=>{const post=startupHarness.metadata.pocketPhone.liangshi.posts.find(post=>post.id===id);post.likes=0;post.commentCount=0;post.repostCount=0;post.favoriteCount=0;},adId);
 await openApp(phone,'设置');await openApp(phone,'两事');const old=await page.evaluate(id=>structuredClone(startupHarness.metadata.pocketPhone.liangshi.posts.find(post=>post.id===id)),adId);assert.equal(old.likes,0);
 await ad.getByRole('button',{name:'查看转发',exact:true}).click();assert.equal(await phone.getByRole('tab',{name:'转发',exact:true}).getAttribute('aria-selected'),'true');assert.ok((await phone.locator('.ls-detail-stats').innerText()).includes('5万'));assert.ok(!(await phone.locator('.ls-detail-stats').innerText()).includes('收藏'));assert.equal(await phone.locator('.ls-comment').count(),0);
 const beforeTab=models.length;await phone.getByRole('tab',{name:'评论',exact:true}).click();assert.equal(models.length,beforeTab);await phone.getByRole('button',{name:'加载更多',exact:true}).click();await phone.locator('.ls-comment').nth(9).waitFor();assert.ok((await phone.locator('.ls-comment').first().innerText()).includes('合成评论1：这个小手机有意思'));assert.equal(models.length,beforeTab+1);assert.equal(await phone.locator('.ls-comment').count(),10);assert.equal(await phone.locator('.ls-repost').count(),0);
 const navigationGeometry=await phone.evaluate(element=>{const root=element.shadowRoot,shell=root.querySelector('.phone-shell').getBoundingClientRect(),nav=root.querySelector('.system-nav').getBoundingClientRect(),main=root.querySelector('.phone-main');main.scrollTop=100;return {shell:{top:shell.top,bottom:shell.bottom,height:shell.height},nav:{top:nav.top,bottom:nav.bottom,height:nav.height},main:{height:main.clientHeight,scrollHeight:main.scrollHeight,scrollTop:main.scrollTop},viewport:innerHeight};});
 assert.ok(navigationGeometry.nav.top>=navigationGeometry.shell.top&&navigationGeometry.nav.bottom<=navigationGeometry.shell.bottom&&navigationGeometry.nav.height>0);assert.ok(navigationGeometry.main.scrollTop>0);await phone.locator('.phone-main').evaluate(element=>element.scrollTop=0);
 if(output&&kind==='native'){await page.evaluate(()=>new Promise(requestAnimationFrame));await phone.locator('.phone-shell').screenshot({path:resolve(output,'liangshi-comments.png')});}
 await phone.getByRole('tab',{name:'转发',exact:true}).click();assert.equal(await phone.locator('.ls-comment').count(),0);assert.equal(await phone.locator('.ls-repost').count(),4);assert.equal(models.length,beforeTab+1);
 await page.setViewportSize({width:320,height:844});assert.ok(await phone.locator('.phone-main').evaluate(element=>element.scrollWidth<=element.clientWidth));if(output&&kind==='native')await phone.locator('.phone-shell').screenshot({path:resolve(output,'liangshi-reposts.png')});await page.setViewportSize({width:390,height:844});
 await phone.getByRole('button',{name:'返回',exact:true}).click();await ad.getByRole('button',{name:'查看评论',exact:true}).click();assert.equal(await phone.getByRole('tab',{name:'评论',exact:true}).getAttribute('aria-selected'),'true');
 await phone.getByRole('button',{name:'返回',exact:true}).click();await phone.getByRole('button',{name:'生成微博图片',exact:true}).click();await phone.getByRole('button',{name:'查看微博图片',exact:true}).waitFor();assert.equal(await page.evaluate(()=>startupHarness.imageCalls),1);
 await page.evaluate(()=>{const h=startupHarness,state=h.metadata.pocketPhone;state.injectEnabled=true;const batch=state.conversations.lin.at(-1).batch;state.conversations.lin.push({id:'long-synthetic-reference',role:'user',text:'合成日常消息。'.repeat(600),batch});});
 await page.evaluate(async()=>{for(const callback of startupHarness.listeners.get('before-main')||[])await callback('normal',{},false);});
 for(const type of ['sms','group','forum','social','liangshi','liangshi-more','image-tags','summary'])assert.ok(models.some(row=>row.type===type),'actual consumer '+type);
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert.deepEqual(await page.evaluate(()=>startupHarness.errors),[]);
 results.push({kind,mode,modelRequests:models,statusRequests:lists.length,oldFollowManualUpgrade:true,whitespaceModelFilled:true,nonemptyModelRetained:true,sharedCredentialsFresh:true,modelSavedLocally:true,sharedModelUnchanged:true,samePresetSharedEditsRetainLocalModel:true,unsavedDraftInactive:true,detailTabsIndependent:true,moreSingleCallBothLists:true,legacyHighStatistics:true,threeInlineStatistics:true,navigationGeometry,widths:[320,390],imageCalls:1,errors,unexpected});await page.close();
}}
finally{await browser.close();}
if(output)await writeFile(resolve(output,'browser-result.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
