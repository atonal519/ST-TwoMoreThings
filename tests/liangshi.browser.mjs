import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { openApp } from './navigation.mjs';
import { liangshiFeed } from './liangshi-fixture.mjs';
import { readTimeline } from '../src/timeline.js';
import { LIANGSHI_PROMPT } from '../src/prompts.js';
const root = resolve(import.meta.dirname,'..'), prefix='/scripts/extensions/third-party/ST-PocketPhone/', output=process.env.POCKET_LIANGSHI_OUTPUT,freshSmoke=process.argv.includes('--fresh-smoke'),smoke=process.argv.includes('--smoke')||freshSmoke;
if(output)await mkdir(output,{recursive:true});
const { chromium }=createRequire('/tmp/st-tools-browser/package.json')('playwright');
const browser=await chromium.launch({executablePath:'/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox'],env:{...process.env,LD_LIBRARY_PATH:'/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu'}});
const results=[],mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2'};
try{
 for(const [kind,mode] of [['native','standalone'],['luker','embedded']]){
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(6000);
  const models=[],uploads=[],errors=[],unexpected=[];let releaseFeed,releaseMore;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url()),path=url.pathname;
   if(url.hostname!=='127.0.0.1'){unexpected.push(url.href);return route.abort();}
   if(path.startsWith(prefix))return route.fulfill({path:resolve(root,decodeURIComponent(path.slice(prefix.length))),contentType:mime[extname(path)]||'application/octet-stream'});
   if(path==='/lib.js')return route.fulfill({contentType:'text/javascript',body:'export const showdown={Converter:class{makeHtml(text){return text.split("\\n").map(line=>"<p>"+line+"</p>").join("");}}};export const DOMPurify={sanitize:html=>html};'});
   if(path==='/scripts/extensions.js')return route.fulfill({contentType:'text/javascript',body:"export const extensionTypes={'third-party/ST-PocketPhone':'local'};"});
   if(path==='/scripts/world-info.js')return route.fulfill({contentType:'text/javascript',body:freshSmoke?`export const selected_world_info=[],world_info={};export async function loadWorldInfo(){globalThis.startupHarness.worldBookReads=(globalThis.startupHarness.worldBookReads||0)+1;return {entries:{0:{content:'PUBLIC_WORLD_ALLOWED',constant:true},1:{key:['LATEST_STORY_SENTINEL'],content:'LATEST_STORY_WORLD_ALLOWED'},2:{key:['OLD_POST_SENTINEL'],content:'OLD_ACTIVATED_LEAK'},3:{key:['BATCH_1_POST_SENTINEL'],content:'FIRST_BATCH_ACTIVATED_LEAK'},4:{key:['BATCH_2_POST_SENTINEL'],content:'MORE_POST_ACTIVATED_ALLOWED'}}}}`:'export const selected_world_info=[],world_info={};export async function loadWorldInfo(){return {entries:{0:{content:"公开的城市文化活动。",constant:true}}}}'});
   if(path==='/api/extensions/version')return route.fulfill({json:{currentBranchName:'main',currentCommitHash:'a'.repeat(40),remoteUrl:'https://github.com/fixture/phone',isUpToDate:true}});
   if(path==='/user/images/liangshi-fixture.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#d5dcd6"/><path d="M0 270L220 80 440 270H640V400H0" fill="#6e8b81"/><circle cx="490" cy="90" r="42" fill="#e9c68e"/></svg>'});
   if(path==='/api/files/upload'){const data=route.request().postDataJSON();uploads.push(JSON.parse(Buffer.from(data.data,'base64').toString('utf8')));return route.fulfill({json:{path:'user/files/codex-tmt-liangshi-first-run.json'}});}
   if(path==='/api/backends/chat-completions/generate'){
    const request=route.request().postDataJSON();models.push(request);const payload=JSON.parse(request.messages[1].content);
    if(payload.recipe){assert.ok(request.messages[0].content.endsWith('\n\n'+LIANGSHI_PROMPT),'current world prompt reaches the public bundle request');assert.equal(payload.recipe.subjects.length,13);assert.equal(new Set(payload.recipe.subjects.map(subject=>subject.domain)).size,13);assert.equal(payload.recipe.subjects.filter(subject=>subject.type==='生活趣味').length,5);assert.equal(payload.recipe.subjects.filter(subject=>subject.type==='公开消息').length,4);assert.equal(payload.recipe.subjects.filter(subject=>subject.type==='观点吐槽').length,2);assert.equal(payload.recipe.posts,15);assert.equal(payload.recipe.quotes,2);assert.equal(payload.recentPosts,undefined);assert.equal(payload.existingAccounts,undefined);assert.equal(payload.storyBackground,undefined);assert.deepEqual(payload.knownContacts,[{id:'lin',name:'林舟',expression:'说话简短',language:''}]);if(freshSmoke){for(const marker of ['OLD_POST_SENTINEL','OLD_ACCOUNT_SENTINEL','BATCH_1_POST_SENTINEL','BATCH_1_ACCOUNT_SENTINEL','OLD_ACTIVATED_LEAK','FIRST_BATCH_ACTIVATED_LEAK'])assert.equal(JSON.stringify(payload).includes(marker),false);assert.ok(payload.worldbook.includes('PUBLIC_WORLD_ALLOWED'));assert.ok(JSON.stringify(payload.story).includes('LATEST_STORY_SENTINEL'));assert.ok(payload.worldbook.includes('LATEST_STORY_WORLD_ALLOWED'));}const feed=liangshiFeed(payload.recipe.promotions);if(freshSmoke){feed.posts[0].text=`BATCH_${models.length}_POST_SENTINEL`;feed.accounts[0].name=`BATCH_${models.length}_ACCOUNT_SENTINEL`;}feed.accounts[0].contactId='lin';feed.posts[0].image={description:'窗边的咖啡'};feed.posts[1].image={description:'河边长椅与落叶'};await new Promise(resolve=>{releaseFeed=resolve;});return route.fulfill({json:{choices:[{message:{content:JSON.stringify(feed)}}]}});}
    if(freshSmoke&&payload.post){assert.equal(payload.post.text,'BATCH_2_POST_SENTINEL');assert.ok(payload.original);assert.equal(payload.post.comments.length,1);assert.ok(payload.accounts.some(account=>account.name==='BATCH_2_ACCOUNT_SENTINEL'));assert.ok(payload.worldbook.includes('MORE_POST_ACTIVATED_ALLOWED'));for(const marker of ['LATEST_STORY_SENTINEL','OLD_POST_SENTINEL','OLD_ACCOUNT_SENTINEL','BATCH_1_POST_SENTINEL','BATCH_1_ACCOUNT_SENTINEL','LATEST_STORY_WORLD_ALLOWED','OLD_ACTIVATED_LEAK','FIRST_BATCH_ACTIVATED_LEAK'])assert.equal(JSON.stringify(payload).includes(marker),false);assert.equal(payload.storyBackground,undefined);assert.equal(payload.story,undefined);}
    if(payload.description)return route.fulfill({json:{choices:[{message:{content:JSON.stringify({prompt:'coffee, window',characters:payload.sender.name==='林舟'?['林舟']:[],size:'landscape'})}}]}});
    if(models.length===2&&!smoke)await new Promise(resolve=>{releaseMore=resolve;});
    return route.fulfill({json:{choices:[{message:{content:JSON.stringify({comments:[{authorId:payload.accounts[0].id,text:`追加评论${models.length}😂😭`}],reposts:[{authorId:payload.accounts[0].id,text:`追加转发${models.length}`} ]})}}]}});
   }
   unexpected.push(url.href);return route.abort();
  });
  await page.goto(`http://127.0.0.1:8917${prefix}tests/startup.html?host=${kind}&mode=${mode}`);await page.waitForFunction(()=>startupHarness.ready);
  await page.evaluate(()=>{const h=startupHarness;h.imageCalls=[];globalThis.STBaiBaiImage={apiVersion:1,getBackendStatus:()=>({configured:true,supportsCharacters:true}),getCharacters:()=>({characters:[{name:'林舟',tag:'library appearance'}]}),generate:async request=>{h.imageCalls.push(request);if(h.imageCalls.length===2)throw Error('合成图片渠道失败');await new Promise(resolve=>{h.releaseImage=resolve;});return {path:'/user/images/liangshi-fixture.svg',seed:3};}};});
  await page.getByRole('button',{name:mode==='embedded'?'打开两三事 · 随卡':'打开两三事',exact:true}).click();
  const phone=page.locator(mode==='embedded'?'#pocket-phone-card-host':'#pocket-phone-host');
  if(freshSmoke){
   await page.evaluate(()=>{const h=startupHarness;h.context.chat[0].mes='LATEST_STORY_SENTINEL<!-- QQJ-end | date=2031年4月8日 | time=09:30 -->';h.metadata.pocketPhone.liangshi={accounts:[{id:'old-account',name:'OLD_ACCOUNT_SENTINEL',handle:'lin',avatar:h.metadata.pocketPhone.contacts[0].avatar}],posts:[{id:'old-post',authorId:'old-account',text:'OLD_POST_SENTINEL',comments:[],reposts:[]}],topics:[],promoCountdown:3};});
   await openApp(phone,'两事');const oldAvatar=await page.evaluate(()=>startupHarness.metadata.pocketPhone.liangshi.accounts[0].avatar);
   for(let batch=1;batch<=2;batch++){releaseFeed=undefined;await phone.getByRole('button',{name:'刷新广场',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.pocket-phone')?.shadowRoot.querySelector('[data-action="liangshi-refresh"]')?.disabled);await phone.getByRole('button',{name:'主页',exact:true}).click();assert.ok(releaseFeed);releaseFeed();await phone.locator('.phone-top-notice-open').waitFor();await phone.locator('.phone-top-notice-open').click();await phone.getByText(`BATCH_${batch}_POST_SENTINEL`,{exact:true}).waitFor();assert.equal(await phone.locator('.ls-post').count(),15);assert.equal(await page.evaluate(()=>startupHarness.metadataSaves),batch);}
   const saved=await page.evaluate(()=>startupHarness.metadata.pocketPhone.liangshi);assert.equal(saved.accounts.find(account=>account.handle==='lin').id,'old-account');assert.equal(saved.accounts.find(account=>account.handle==='lin').avatar,oldAvatar);assert.equal(saved.promoCountdown,1);assert.equal(await phone.locator('.ls-photo-placeholder').count(),2);
   const first=phone.locator('.ls-post').first(),id=await first.getAttribute('data-liangshi-id'),quoteId=saved.posts[0].quoteId;await first.locator('.ls-quote').click();assert.equal(await phone.locator('.ls-post').getAttribute('data-liangshi-id'),quoteId);await phone.getByRole('button',{name:'返回',exact:true}).click();await first.getByRole('button',{name:'查看评论',exact:true}).click();const initialComments=await phone.locator('.ls-comment').count();await phone.getByRole('button',{name:'加载更多',exact:true}).click();await phone.getByText('追加评论3',{exact:false}).waitFor();assert.equal(await phone.locator('.ls-comment').count(),initialComments+1);assert.equal(await page.evaluate(id=>startupHarness.metadata.pocketPhone.liangshi.posts.find(post=>post.id===id).reposts.length,id),1);assert.equal(models.length,3);assert.equal(await page.evaluate(()=>startupHarness.metadataSaves),3);assert.equal(await page.evaluate(()=>startupHarness.worldBookReads),3);assert.equal(uploads.length,0);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
   results.push({kind,mode,freshSmoke:true,requests:3,saves:3,refreshes:2,more:1,worldBookReads:3,oldStoryPostsAccountsOmitted:true,freshWorldActivationClean:true,selectedPostMoreActivation:true,localIdAvatarPreserved:true,promoCountdown:1,quoteNavigation:true,notificationNavigation:true,optionalImages:2,imageCalls:0,diagnosticUploads:0,subjects:JSON.parse(models[1].messages[1].content).recipe.subjects,errors,unexpected});await page.close();continue;
  }
  await openApp(phone,'两事');assert.equal(await phone.locator('.ls-post').count(),0);assert.equal(models.length,0);
  await phone.getByRole('button',{name:'刷新广场',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.pocket-phone')?.shadowRoot.querySelector('[data-action="liangshi-refresh"]')?.disabled);
  await phone.getByRole('button',{name:'主页',exact:true}).click();assert.ok(releaseFeed);releaseFeed();
  await phone.locator('.phone-top-notice-open').waitFor();await phone.locator('.phone-top-notice-open').click();
  await phone.locator('.ls-post').first().waitFor();assert.equal(await phone.locator('.ls-post').count(),15);assert.equal(await phone.locator('.ls-ad-label').count(),2);assert.equal(await phone.locator('.ls-quote').count(),2);
  assert.equal(await phone.locator('.ls-follow:disabled').count(),15);assert.equal(await phone.locator('.ls-follow:not(:disabled)').count(),0);
  if(smoke){
   assert.equal(await phone.locator('.ls-photo-placeholder').count(),2);
   const untagged=await page.evaluate(()=>startupHarness.metadata.pocketPhone.liangshi.posts.filter(post=>!post.topic).length);assert.equal(untagged,7);
   const first=phone.locator('.ls-post').first(),id=await first.getAttribute('data-liangshi-id'),quoteId=await page.evaluate(id=>startupHarness.metadata.pocketPhone.liangshi.posts.find(post=>post.id===id).quoteId,id);
   await first.locator('.ls-quote').click();assert.equal(await phone.locator('.ls-post').getAttribute('data-liangshi-id'),quoteId);await phone.getByRole('button',{name:'返回',exact:true}).click();
   await phone.getByRole('button',{name:'关注',exact:true}).click();assert.equal(await phone.locator('.ls-post').count(),0);await phone.getByRole('button',{name:'广场',exact:true}).click();
   await first.locator('.ls-stats button').nth(1).click();const before=await phone.locator('.ls-comment').count();await phone.getByRole('button',{name:'加载更多',exact:true}).click();await phone.getByText('追加评论2',{exact:false}).waitFor();
   assert.equal(await phone.locator('.ls-comment').count(),before+1);assert.equal(await phone.locator('.ls-repost').count(),0);assert.equal(await page.evaluate(id=>startupHarness.metadata.pocketPhone.liangshi.posts.find(post=>post.id===id).reposts.length,id),1);assert.equal(models.length,2);assert.equal(uploads.length,0);assert.equal(await page.evaluate(()=>startupHarness.metadataSaves),2);assert.equal(await page.evaluate(()=>startupHarness.imageCalls.length),0);
   assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert.deepEqual(await page.evaluate(()=>startupHarness.errors),[]);
   results.push({kind,mode,smoke:true,requests:2,saves:2,worldPromptDispatched:true,subjects:JSON.parse(models[0].messages[1].content).recipe.subjects,quotesRequested:2,quotesAccepted:2,untaggedPosts:untagged,emptyFollowingWithoutRefresh:true,optionalImagePlaceholders:2,imageCalls:0,diagnosticUploads:0,quoteNavigation:true,notificationNavigation:true,moreAppended:true,errors,unexpected});await page.close();continue;
  }
  await phone.locator('.inline-emoji').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));assert.ok(await phone.locator('.inline-emoji').evaluateAll(images=>images.every(image=>image.naturalWidth>0)));
  for(const width of [320,390]){await page.setViewportSize({width,height:844});assert.ok(await phone.locator('.phone-main').evaluate(element=>element.scrollWidth<=element.clientWidth));}
  if(output&&kind==='native'){
   const font=(await readFile('/tmp/st-dollars-npc-rewrite-20261017/graph-ui-20261018/diagnostic-assets/NotoSansCJKsc-Regular.otf')).toString('base64');
   await phone.evaluate(async(element,data)=>{const face=new FontFace('PhoneFixtureCJK',`url(data:font/otf;base64,${data})`);await face.load();document.fonts.add(face);const style=document.createElement('style');style.textContent=':host{font-family:PhoneFixtureCJK,sans-serif}';element.shadowRoot.append(style);},font);
   await phone.screenshot({path:resolve(output,'liangshi-square.png')});
  }
  await phone.getByRole('button',{name:'关注',exact:true}).click();assert.equal(await phone.locator('.ls-post').count(),0);assert.equal(await phone.locator('.ls-follow.is-followed:disabled').count(),0);assert.equal(models.length,1);
  if(output&&kind==='native')await phone.screenshot({path:resolve(output,'liangshi-following.png')});
  await phone.getByRole('button',{name:'热榜',exact:true}).click();assert.equal(await phone.locator('.ls-hot-row').count(),0);assert.equal(models.length,1);await phone.getByRole('button',{name:'广场',exact:true}).click();
  const first=phone.locator('.ls-post').first(),id=await first.getAttribute('data-liangshi-id');
  const quoteId=await page.evaluate(id=>startupHarness.metadata.pocketPhone.liangshi.posts.find(post=>post.id===id).quoteId,id);
  await first.locator('.ls-quote').click();assert.equal(await phone.locator('.ls-post').getAttribute('data-liangshi-id'),quoteId);await phone.getByRole('button',{name:'返回',exact:true}).click();
  await first.locator('.ls-stats button').nth(1).click();
  const before=await phone.locator('.ls-comment').count();await phone.getByRole('button',{name:'加载更多',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.pocket-phone')?.shadowRoot.querySelector('[data-action="liangshi-more"]')?.disabled);
  await phone.getByRole('button',{name:'主页',exact:true}).click();assert.ok(releaseMore);releaseMore();
  await phone.locator('.phone-top-notice-open').waitFor();await phone.locator('.phone-top-notice-open').click();await phone.getByText('追加评论2',{exact:false}).waitFor();
  assert.equal(await phone.locator('.ls-comment').count(),before+1);assert.equal(await phone.locator('.ls-repost').count(),0);assert.equal(await page.evaluate(id=>startupHarness.metadata.pocketPhone.liangshi.posts.find(post=>post.id===id).reposts.length,id),1);
  await phone.getByRole('button',{name:'加载更多',exact:true}).click();await phone.getByText('追加评论3',{exact:false}).waitFor();assert.equal(await phone.locator('.ls-comment').count(),before+2);assert.equal(await phone.locator('.ls-repost').count(),0);assert.equal(await page.evaluate(id=>startupHarness.metadata.pocketPhone.liangshi.posts.find(post=>post.id===id).reposts.length,id),2);
  assert.ok(await page.evaluate(id=>startupHarness.metadata.pocketPhone.liangshi.posts.find(post=>post.id===id).reposts.every(item=>item.quoteId===id),id));
  if(output&&kind==='native')await phone.screenshot({path:resolve(output,'liangshi-detail.png')});
  assert.equal(await page.evaluate(()=>startupHarness.imageCalls.length),0);
  assert.equal(await phone.locator('.ls-photo').count(),1);
  await phone.getByRole('button',{name:'生成微博图片',exact:true}).click();
  await phone.locator('.ls-photo:disabled .is-generating').waitFor();await page.waitForFunction(()=>Boolean(startupHarness.releaseImage));
  assert.equal(await page.evaluate(()=>startupHarness.imageCalls.length),1);assert.equal(models.length,4);
  await page.evaluate(()=>startupHarness.releaseImage());await phone.locator('.ls-photo > img').waitFor();await phone.locator('.ls-photo > img').evaluate(image=>image.decode());
  assert.equal(await phone.locator('.ls-comment').count(),before+2);assert.equal(await phone.locator('.ls-repost').count(),0);assert.equal(await page.evaluate(id=>startupHarness.metadata.pocketPhone.liangshi.posts.find(post=>post.id===id).reposts.length,id),2);
  await phone.getByRole('button',{name:'查看微博图片',exact:true}).click();await phone.locator('.photo-viewer').waitFor();await phone.getByRole('button',{name:'关闭图片',exact:true}).click();assert.equal(models.length,4);
  if(output&&kind==='native')await phone.screenshot({path:resolve(output,'liangshi-photo.png')});
  await phone.getByRole('button',{name:'返回',exact:true}).click();await phone.getByRole('button',{name:'广场',exact:true}).click();
  await phone.getByRole('button',{name:'生成微博图片',exact:true}).click();await phone.locator('.feedback.is-error').waitFor();assert.ok((await phone.locator('.feedback').innerText()).includes('合成图片渠道失败'));assert.equal(await page.evaluate(()=>startupHarness.imageCalls.length),2);await phone.getByRole('button',{name:'关闭提示',exact:true}).click();
  const scrolls=[];async function verifyScroll(selector){const item=await phone.locator(selector).evaluate(element=>{element.scrollTop=100;const thumb=getComputedStyle(element,'::-webkit-scrollbar-thumb'),button=getComputedStyle(element,'::-webkit-scrollbar-button');return {scrolled:element.scrollTop>0,scrollHeight:element.scrollHeight,clientHeight:element.clientHeight,width:getComputedStyle(element,'::-webkit-scrollbar').width,radius:thumb.borderTopLeftRadius,button:button.display,buttonWidth:button.width,buttonHeight:button.height,standardWidth:getComputedStyle(element).scrollbarWidth};});assert.ok(item.scrolled,selector+' must have real overflow: '+JSON.stringify(item));assert.equal(item.width,'4px');assert.equal(item.radius,'999px');assert.equal(item.button,'none');assert.equal(item.buttonWidth,'0px');assert.equal(item.buttonHeight,'0px');assert.equal(item.standardWidth,'auto');scrolls.push({selector,...item});}
  await verifyScroll('.phone-main');
  const story=await page.evaluate(()=>startupHarness.context.chat),scrollBatch=readTimeline(story);
  await page.evaluate(batch=>{startupHarness.metadata.pocketPhone.conversations.lin=Array.from({length:24},(_,index)=>({id:'scroll-'+index,role:'assistant',text:'正常阅读的合成短信。'.repeat(8),read:true,batch}));},scrollBatch);
  await openApp(phone,'短信');await phone.locator('[data-contact="lin"]').click();await verifyScroll('.message-feed');
  await page.setViewportSize({width:390,height:600});await openApp(phone,'设置');await phone.getByRole('button',{name:'查看公告',exact:true}).click();await phone.locator('.phone-dialog .pp-update-notice').getByText('小手机各页统一使用圆角细滚动条。',{exact:false}).waitFor();await verifyScroll('.phone-dialog .pp-update-notice');await phone.locator('.phone-dialog').getByRole('button',{name:'关闭',exact:true}).click();await page.setViewportSize({width:390,height:844});
  await openApp(phone,'两事');
  await page.evaluate(()=>startupHarness.metadata.pocketPhone.theme='night');await phone.getByRole('button',{name:'返回',exact:true}).click();assert.equal(await phone.getAttribute('data-theme'),'night');
  assert.equal(models.length,5);assert.equal(uploads.length,0);assert.equal(await page.evaluate(()=>startupHarness.metadataSaves),4);
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert.deepEqual(await page.evaluate(()=>startupHarness.errors),[]);
  results.push({kind,mode,requests:models.length,saves:4,diagnosticUploads:uploads.length,posts:15,initialEmpty:true,notificationNavigation:true,moreNotificationNavigation:true,quoteNavigation:true,moreTwice:true,emptyFollowingWithoutRefresh:true,photoOnDemand:true,photoFailure:true,photoViewer:true,scrolls,widths:[320,390],dayNight:true,errors,unexpected});await page.close();
 }
 if(output)await writeFile(resolve(output,'browser-result.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
