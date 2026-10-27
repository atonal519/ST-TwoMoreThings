import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {openApp} from './navigation.mjs';

const root=resolve(import.meta.dirname,'..'),prefix='/scripts/extensions/third-party/ST-PocketPhone/',tools=process.env.POCKET_BROWSER_TOOLS||'/tmp/tmt-hot-browser-20261026';
const {chromium}=createRequire(resolve(tools,'package.json'))('playwright');
const browser=await chromium.launch({executablePath:resolve(tools,'browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell'),args:['--no-sandbox'],env:{...process.env,LD_LIBRARY_PATH:resolve(tools,'libs/usr/lib/x86_64-linux-gnu')}});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf'};
const body='前段\n\n说了 "some words"\n继续。😀🌙',sms='我说 "晚点见"\n不是马上出发。👍';
const malformed=value=>JSON.stringify(value).replaceAll(String.raw`\"`,'"'),results=[];
try{for(const[kind,mode]of[['native','standalone'],['luker','embedded']]){
 const page=await browser.newPage({viewport:{width:390,height:844}}),calls=[],errors=[],unexpected=[];let following=0;
 page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url()),p=u.pathname;
  if(u.hostname!=='127.0.0.1'){unexpected.push(u.href);return route.abort();}
  if(p.startsWith(prefix))return route.fulfill({path:resolve(root,decodeURIComponent(p.slice(prefix.length))),contentType:mime[extname(p)]||'application/octet-stream'});
  if(p==='/lib.js')return route.fulfill({contentType:mime['.js'],body:'export const showdown={Converter:class{makeHtml(t){return t}}};export const DOMPurify={sanitize:h=>h};'});
  if(p==='/scripts/extensions.js')return route.fulfill({contentType:mime['.js'],body:"export const extensionTypes={'third-party/ST-PocketPhone':'local'};"});
  if(p==='/scripts/world-info.js')return route.fulfill({contentType:mime['.js'],body:"export const selected_world_info=[],world_info={};export async function loadWorldInfo(){return{entries:{0:{constant:true,content:'普通城市的公开背景。'}}}}"});
  if(p==='/api/extensions/version')return route.fulfill({json:{currentBranchName:'main',currentCommitHash:'a'.repeat(40),remoteUrl:'https://github.com/fixture/phone',isUpToDate:true}});
  if(p==='/api/backends/chat-completions/generate'){
   const request=route.request().postDataJSON(),input=JSON.parse(request.messages[1].content);
   for(const key of ['max_tokens','max_completion_tokens','num_predict','reasoning_effort','thinking'])assert.equal(Object.hasOwn(request,key),false,key);
   let type,content;
   if(input.contact){type='sms-repair';content=malformed({messages:[{text:sms}]});}
   else if(input.userPersona!==undefined){following++;type=following===1?'following-repair':'following-rejected';content=following===1?'```json\n'+malformed({accounts:[{key:'a',name:'街角记录',handle:'street'}],posts:Array.from({length:15},(_,i)=>({authorKey:'a',text:body+i}))})+'\n```':'{"accounts":[],"posts":[{"text":}]}';}
   else{type='strict-square';content=JSON.stringify({accounts:[{key:'a',name:'日常消息',handle:'square'}],posts:[{authorKey:'a',text:'严格JSON的广场正文。'}]});}
   calls.push(type);return route.fulfill({json:{choices:[{finish_reason:'stop',message:{content,reasoning_content:'不得拿作正文'}}]}});
  }
  unexpected.push(p);return route.abort();
 });
 await page.goto(`http://127.0.0.1:8917${prefix}tests/startup.html?host=${kind}&mode=${mode}`);await page.waitForFunction(()=>startupHarness.ready);
 await page.getByRole('button',{name:mode==='embedded'?'打开两三事 · 随卡':'打开两三事',exact:true}).click();
 const phone=page.locator(mode==='embedded'?'#pocket-phone-card-host':'#pocket-phone-host');await openApp(phone,'两事');assert.equal(calls.length,0);
 const initialSettingsSaves=await page.evaluate(()=>startupHarness.settingsSaves);
 await phone.getByRole('button',{name:'刷新广场',exact:true}).click();await phone.getByText('严格JSON的广场正文。',{exact:true}).waitFor();
 await phone.getByRole('button',{name:'关注',exact:true}).click();await phone.getByRole('button',{name:'刷新关注',exact:true}).click();await phone.locator('.ls-post').first().waitFor();assert.equal(await phone.locator('.ls-post').count(),15);
 const before=await page.evaluate(()=>({state:JSON.stringify(startupHarness.metadata.pocketPhone),saves:startupHarness.metadataSaves}));
 assert.equal(before.saves,2);
 const texts=await page.evaluate(()=>{const d=startupHarness.metadata.pocketPhone.liangshi;return d.followingFeedIds.map(id=>d.posts.find(p=>p.id===id).text);});assert.deepEqual(texts,Array.from({length:15},(_,i)=>body+i));
 await phone.getByRole('button',{name:'刷新关注',exact:true}).click();await phone.locator('.feedback.is-error').waitFor();
 assert.deepEqual(await page.evaluate(()=>({state:JSON.stringify(startupHarness.metadata.pocketPhone),saves:startupHarness.metadataSaves})),before);
 await openApp(phone,'短信');await phone.locator('[data-contact="lin"]').click();await phone.getByRole('button',{name:'继续',exact:true}).click();await phone.getByText('我说 "晚点见"',{exact:false}).waitFor();
 await openApp(phone,'设置');assert.deepEqual(await phone.locator('.api-actions button').allTextContents(),['保存','另存为','删除']);
 const final=await page.evaluate(()=>({saves:startupHarness.metadataSaves,settingsSaves:startupHarness.settingsSaves,sms:startupHarness.metadata.pocketPhone.conversations.lin.at(-1).text,foreign:startupHarness.metadata.foreign}));
 assert.deepEqual(calls,['strict-square','following-repair','following-rejected','sms-repair']);assert.equal(final.saves,3);assert.equal(final.settingsSaves,initialSettingsSaves);assert.equal(final.sms,sms);assert.equal(final.foreign,'keep');assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 results.push({kind,mode,calls,requests:calls.length,...final,initialSettingsSaves,generationSettingsSaves:final.settingsSaves-initialSettingsSaves,repairedFollowingPosts:15,unescapedQuotesNewlinesAndEmojiPreserved:true,rejectedAnswerSaves:0,noOutputOrThinkingLimits:true,apiSmoke:true,errors,unexpected});await page.close();
}if(process.env.POCKET_JSON_RESULT)await writeFile(process.env.POCKET_JSON_RESULT,JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));}finally{await browser.close();}
