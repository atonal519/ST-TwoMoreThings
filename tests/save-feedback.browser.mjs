import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { openApp } from './navigation.mjs';

const root=resolve(import.meta.dirname,'..'),prefix='/scripts/extensions/third-party/ST-PocketPhone/',output=process.env.POCKET_SAVE_FEEDBACK_OUTPUT,red=process.argv.includes('--red');
const tools=process.env.POCKET_BROWSER_TOOLS||'/tmp/tmt-hot-browser-20261026';
if(output)await mkdir(output,{recursive:true});
const {chromium}=createRequire(resolve(tools,'package.json'))('playwright');
const browser=await chromium.launch({executablePath:process.env.POCKET_CHROMIUM||resolve(tools,'browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell'),args:['--no-sandbox'],env:{...process.env,LD_LIBRARY_PATH:resolve(tools,'libs/usr/lib/x86_64-linux-gnu')}});
const results=[],mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2'};
try{for(const[kind,mode]of[['native','standalone'],['luker','embedded']]){
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(6500);
 const errors=[],unexpected=[],completions=[];let updateFails=false;page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{const url=new URL(route.request().url()),path=url.pathname;
  if(url.hostname!=='127.0.0.1'){unexpected.push(url.href);return route.abort();}
  if(path===prefix+'release.json'&&updateFails)return route.fulfill({status:503,json:{error:'synthetic'}});
  if(path.startsWith(prefix))return route.fulfill({path:resolve(root,decodeURIComponent(path.slice(prefix.length))),contentType:mime[extname(path)]||'application/octet-stream'});
  if(path==='/fixture-font.ttf')return route.fulfill({path:process.env.POCKET_CJK_FONT||resolve(tools,'NotoSansSC.ttf'),contentType:'font/ttf'});
  if(path==='/lib.js')return route.fulfill({contentType:mime['.js'],body:'export const showdown={Converter:class{makeHtml(t){return t}}};export const DOMPurify={sanitize:h=>h};'});
  if(path==='/scripts/extensions.js')return route.fulfill({contentType:mime['.js'],body:"export const extensionTypes={'third-party/ST-PocketPhone':'local'};"});
  if(path==='/scripts/world-info.js')return route.fulfill({contentType:mime['.js'],body:"export const selected_world_info=[],world_info={};export async function loadWorldInfo(){if(startupHarness.longWorldError)throw Error('合成读取错误，完整原因需要保留供检查。'.repeat(40));return {entries:{0:{constant:true,content:'合成设定'}}}}"});
  if(path==='/scripts/extensions/regex/engine.js')return route.fulfill({contentType:mime['.js'],body:'export const SCRIPT_TYPES={GLOBAL:0};export function getScriptsByType(){return []}'});
  if(path==='/scripts/power-user.js')return route.fulfill({contentType:mime['.js'],body:'export const power_user={encode_tags:false};'});
  if(path==='/api/extensions/version')return route.fulfill(updateFails?{status:503,json:{error:'synthetic'}}:{json:{currentBranchName:'main',currentCommitHash:'a'.repeat(40),remoteUrl:'https://github.com/fixture/phone',isUpToDate:true}});
  if(path==='/api/backends/chat-completions/generate'){const body=route.request().postDataJSON();completions.push({model:body.model,url:body.reverse_proxy});return route.fulfill({json:{choices:[{message:{content:'{"messages":[{"text":"合成回复。"}]}'}}]}});}
  unexpected.push(url.href);return route.abort();
 });
 await page.goto(`http://127.0.0.1:8917${prefix}tests/startup.html?host=${kind}&mode=${mode}`);await page.waitForFunction(()=>startupHarness.ready);
 await page.evaluate(mode=>{const h=startupHarness;h.context.saveSettingsDebounced=async()=>{h.settingsSaves++;if(h.saveWait)await h.saveWait;if(h.failSave)throw new Error('合成设置保存失败');};h.settings['schedule-planner'].apiPresets.push({id:'b',name:'B',url:'https://b.invalid/v1',key:'b-key',model:'b-default'});Object.assign(h.settings[mode==='embedded'?'twoMoreThingsEmbedded':'pocketPhone'],{apiSourceRef:{kind:'shared-preset',presetId:'test'},apiModel:'a-custom'});},mode);
 const launch=page.getByRole('button',{name:mode==='embedded'?'打开两三事 · 随卡':'打开两三事',exact:true});await launch.click();
 const phone=page.locator(mode==='embedded'?'#pocket-phone-card-host':'#pocket-phone-host');
 await phone.evaluate(async element=>{const font=new FontFace('PhoneFixtureCJK','url(http://127.0.0.1:8917/fixture-font.ttf)');await font.load();document.fonts.add(font);const style=document.createElement('style');style.textContent=':host{font-family:PhoneFixtureCJK,sans-serif}';element.shadowRoot.append(style);});
 await openApp(phone,'设置');await page.clock.install();await page.clock.pauseAt(new Date());
 const save=async()=>{await phone.locator('#api-model').fill('fixture-model');await phone.locator('.api-form button[type="submit"]').click();await phone.locator('.feedback:not(.is-error)').getByText('连接已保存。',{exact:true}).waitFor();};
 const bounds=()=>phone.locator('.phone-shell').evaluate(shell=>{const rect=node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};return{main:rect(shell.querySelector('.phone-main')),version:rect(shell.querySelector('.app-version')),nav:rect(shell.querySelector('.system-nav')),save:rect(shell.querySelector('.api-form button[type="submit"]'))};});
 const before=await bounds();await save();
 if(red&&output)await phone.locator('.phone-shell').screenshot({path:resolve(output,'before-feedback.png')});
 await page.clock.runFor(2499);assert.equal(await phone.locator('.feedback').count(),1);
 await page.clock.runFor(1);assert.equal(await phone.locator('.feedback').count(),0,'saved connection feedback expires at 2500ms');
 if(red)break;
 const layouts=[];
 for(const theme of['day','night']){await page.evaluate(theme=>{startupHarness.metadata.pocketPhone.theme=theme;},theme);await openApp(phone,'设置');
  for(const width of[320,390]){await page.setViewportSize({width,height:844});const geometryBefore=await bounds();await save();const geometryAfter=await bounds();assert.deepEqual(geometryAfter,geometryBefore,'toast does not shrink main or move version/navigation/save');
   const visual=await phone.locator('.feedback').evaluate(node=>{const r=node.getBoundingClientRect(),shell=node.closest('.phone-shell').getBoundingClientRect();return{position:getComputedStyle(node).position,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,shellX:shell.x,shellRight:shell.right};});
   assert.equal(visual.position,'absolute');assert.ok(visual.x>=visual.shellX&&visual.right<=visual.shellRight);assert.ok(visual.bottom<geometryAfter.version.y);assert.ok(visual.y>=geometryAfter.save.bottom||visual.bottom<=geometryAfter.save.y,'save button remains clear');layouts.push({theme,viewport:width,...visual});
   if(output&&kind==='native'&&width===390)await phone.locator('.phone-shell').screenshot({path:resolve(output,`feedback-${theme}.png`)});
   await phone.getByRole('button',{name:'关闭提示',exact:true}).click();assert.equal(await phone.locator('.feedback').count(),0);await page.clock.runFor(2500);
  }
 }
 // Expiry patches only the message: the current input, caret and scroll survive.
 await save();await phone.getByRole('button',{name:'外观设置',exact:true}).click();
 await phone.locator('#api-model').fill('UNSAVED_DRAFT');
 const focus=await phone.locator('#api-model').evaluate(input=>{input.focus();input.setSelectionRange(2,8);const main=input.closest('.phone-main');main.scrollTop=40;globalThis.feedbackInput=input;return{scroll:main.scrollTop,start:input.selectionStart,end:input.selectionEnd};});
 await page.clock.runFor(2500);
 const after=await phone.locator('#api-model').evaluate(input=>({same:input===globalThis.feedbackInput,focused:input.getRootNode().activeElement===input,value:input.value,scroll:input.closest('.phone-main').scrollTop,start:input.selectionStart,end:input.selectionEnd}));
 assert.deepEqual(after,{same:true,focused:true,value:'UNSAVED_DRAFT',...focus});
 // A's timeout must not remove B; B gets its own complete interval.
 await save();await page.clock.runFor(1000);await save();await page.clock.runFor(1500);assert.equal(await phone.locator('.feedback').count(),1);await page.clock.runFor(999);assert.equal(await phone.locator('.feedback').count(),1);await page.clock.runFor(1);assert.equal(await phone.locator('.feedback').count(),0);
 // A newly displayed error gets 5s and cannot be cleared by an older success.
 await save();await page.clock.runFor(1000);await page.evaluate(()=>{startupHarness.failSave=true;});await phone.locator('.api-form button[type="submit"]').click();await phone.locator('.feedback.is-error').waitFor();await page.clock.runFor(1500);assert.equal(await phone.locator('.feedback.is-error[role="alert"]').count(),1);await page.clock.runFor(3499);assert.equal(await phone.locator('.feedback.is-error').count(),1);await page.clock.runFor(1);assert.equal(await phone.locator('.feedback').count(),0);
 await phone.locator('.api-form button[type="submit"]').click();await phone.locator('.feedback.is-error').waitFor();assert.equal(await phone.locator('.feedback.is-error').evaluate(node=>getComputedStyle(node).position),'absolute');await phone.getByRole('button',{name:'关闭提示',exact:true}).click();await page.evaluate(()=>{startupHarness.failSave=false;});
 // Another ordinary notice shares the same TTL; QR stays a synthetic host fixture.
 await page.evaluate(()=>{quickReplyApi.settings.isEnabled=false;});await phone.locator('[data-entry-preference="qrShow"]').uncheck();await phone.locator('[data-entry-preference="qrShow"]').check();await phone.locator('.feedback').filter({hasText:'QR入口已保存'}).waitFor();await page.clock.runFor(2500);assert.equal(await phone.locator('.feedback').count(),0);
 // Update checks and long asynchronous operation errors use the same floating slot.
 updateFails=true;await phone.locator('.pp-update-status').click();await phone.locator('.feedback.is-error').waitFor();assert.equal(await phone.locator('.settings-result.error').count(),0);await page.clock.runFor(5000);assert.equal(await phone.locator('.feedback').count(),0);updateFails=false;
 await page.evaluate(()=>{startupHarness.longWorldError=true;});await phone.getByRole('button',{name:'内容设置',exact:true}).click();await phone.locator('.feedback.is-error').waitFor();
 const longError=await phone.locator('.feedback.is-error').evaluate(node=>{const text=node.querySelector('span'),button=node.querySelector('button'),box=node.getBoundingClientRect(),close=button.getBoundingClientRect();return{length:text.textContent.length,scroll:text.scrollHeight>text.clientHeight,afterMain:node.previousElementSibling.matches('.phone-main'),position:getComputedStyle(node).position,closeInside:close.x>=box.x&&close.right<=box.right&&close.y>=box.y&&close.bottom<=box.bottom,closeRect:{x:close.x,y:close.y,width:close.width,height:close.height},boxRect:{x:box.x,y:box.y,width:box.width,height:box.height}};});assert.ok(longError.length>500);assert.ok(longError.scroll);assert.ok(longError.afterMain);assert.equal(longError.position,'absolute');assert.ok(longError.closeInside,JSON.stringify(longError));
 if(output&&kind==='native')await phone.locator('.phone-shell').screenshot({path:resolve(output,'feedback-error.png')});await page.evaluate(()=>{startupHarness.longWorldError=false;});await page.clock.runFor(5000);assert.equal(await phone.locator('.feedback').count(),0);await phone.getByRole('button',{name:'内容设置',exact:true}).click();
 // Conflict decisions remain modal; their operation error is a closeable 5s toast inside the allowed layer.
 await page.evaluate(mode=>{const other=document.createElement('div');other.id=mode==='embedded'?'pocket-phone-launch':'pocket-phone-card-launch';other.dataset.feedbackFixture='true';document.body.append(other);startupHarness.failSave=true;},mode);await launch.click();await phone.getByRole('button',{name:'关闭当前这份',exact:true}).click();await phone.locator('.phone-dialog-backdrop .feedback.is-error').waitFor();await phone.getByRole('button',{name:'关闭提示',exact:true}).click();assert.equal(await phone.locator('.feedback').count(),0);assert.equal(await phone.getByRole('alertdialog').isVisible(),true);
 await phone.getByRole('button',{name:'关闭当前这份',exact:true}).click();await phone.locator('.feedback.is-error').waitFor();await page.clock.runFor(5000);assert.equal(await phone.locator('.feedback,.phone-dialog-error').count(),0);await phone.getByRole('button',{name:'暂时继续',exact:true}).click();await page.evaluate(()=>{document.querySelector('[data-feedback-fixture]')?.remove();startupHarness.failSave=false;});
 await save();await phone.locator('.system-nav').getByRole('button',{name:'主页',exact:true}).click();await page.clock.runFor(2500);assert.equal(await phone.locator('.feedback').count(),0);
 await openApp(phone,'设置');await save();await phone.getByRole('button',{name:'关闭手机',exact:true}).click();await page.clock.runFor(2500);await launch.click();assert.equal(await phone.locator('.feedback').count(),0);
 // Late completion still saves the configuration but does not resurrect a closed toast.
 await openApp(phone,'设置');await page.evaluate(()=>{const h=startupHarness;h.saveWait=new Promise(resolve=>{h.releaseSave=resolve;});});await phone.locator('.api-form button[type="submit"]').click();await phone.getByRole('button',{name:'关闭手机',exact:true}).click();await page.evaluate(()=>{const h=startupHarness;h.releaseSave();h.saveWait=null;});await launch.click();assert.equal(await phone.locator('.feedback').count(),0);
 // The actual consumer follows B's default; unsaved edits are discarded, custom models require Save.
 await page.clock.resume();await openApp(phone,'设置');
 const pickB=async()=>{await phone.getByRole('button',{name:'使用的配置',exact:true}).click();await phone.locator('[data-api-source="shared-preset:b"]').click();await page.waitForFunction(mode=>document.querySelector(mode==='embedded'?'#pocket-phone-card-host':'#pocket-phone-host').shadowRoot.querySelector('#api-model')?.value==='b-default',mode);};
 await pickB();assert.equal(await phone.locator('#api-url').inputValue(),'https://b.invalid/v1');await phone.locator('#api-model').fill('UNSAVED_B');await openApp(phone,'短信');await phone.locator('[data-contact="lin"]').click();await phone.getByRole('button',{name:'继续',exact:true}).click();await page.waitForFunction(()=>startupHarness.metadata.pocketPhone.conversations.lin?.length===1);assert.deepEqual(completions,[{model:'b-default',url:'https://b.invalid/v1'}]);
 await openApp(phone,'设置');assert.equal(await phone.locator('#api-model').inputValue(),'b-default');await phone.locator('#api-model').fill('b-custom');await phone.locator('.api-form button[type="submit"]').click();await phone.locator('.feedback').getByText('连接已保存。',{exact:true}).waitFor();await phone.getByRole('button',{name:'使用的配置',exact:true}).click();await phone.locator('[data-api-source="shared-preset:b"]').click();assert.equal(await phone.locator('#api-model').inputValue(),'b-custom');
 await openApp(phone,'短信');await phone.locator('[data-contact="lin"]').click();await phone.getByRole('button',{name:'继续',exact:true}).click();await page.waitForFunction(()=>startupHarness.metadata.pocketPhone.conversations.lin?.length===2);assert.deepEqual(completions[1],{model:'b-custom',url:'https://b.invalid/v1'});assert.equal(await page.evaluate(()=>startupHarness.settings['schedule-planner'].apiPresets.find(p=>p.id==='b').model),'b-default');
 let disposed=false;if(kind==='luker'){await openApp(phone,'设置');await save();await page.evaluate(()=>startupHarness.app.dispose());await page.clock.runFor(3000);assert.equal(await phone.count(),0);disposed=true;}
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert.deepEqual(await page.evaluate(()=>startupHarness.errors),[]);
 results.push({kind,mode,successTtlMs:2500,errorTtlMs:5000,layouts,expiryPreservesInputFocusSelectionScroll:true,replacementGetsFullInterval:true,errorGetsFullInterval:true,dismissClears:true,ordinaryQrNotice:true,updateErrorsShared:true,longError,conflictErrorShared:true,navigationAndCloseClear:true,lateSuccessHidden:true,disposeClears:disposed,completions,unexpected,errors});await page.close();
}
if(output&&!red)await writeFile(resolve(output,'browser-result.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
