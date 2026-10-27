import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {openApp} from './navigation.mjs';
import {readTimeline} from '../src/timeline.js';
const root=resolve(import.meta.dirname,'..'),prefix='/scripts/extensions/third-party/ST-PocketPhone/',output=process.env.POCKET_LOCK_OUTPUT;
if(output)await mkdir(output,{recursive:true});
const {chromium}=createRequire('/tmp/st-tools-browser/package.json')('playwright');
const browser=await chromium.launch({executablePath:'/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox'],env:{...process.env,LD_LIBRARY_PATH:'/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu'}}),results=[];
try{for(const[kind,mode]of[['native','standalone'],['luker','embedded']]){
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(6000);const errors=[],unexpected=[],assets=[];let releaseArt,releaseFont;
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{const url=new URL(route.request().url()),path=url.pathname;
  if(url.hostname!=='127.0.0.1'){unexpected.push(url.href);return route.abort();}
  if(path.startsWith(prefix)){
   const file=decodeURIComponent(path.slice(prefix.length));assets.push(file);
   if(file==='tests/startup-harness.js')return route.fulfill({contentType:'text/javascript',body:(await readFile(resolve(root,file),'utf8')).replace("lockStyle: 'rounded'","lockStyle: 'classic'")});
   if(file==='assets/echo-foreground.png')await new Promise(done=>releaseArt=done);
   if(file==='assets/clock-dorsa.ttf')await new Promise(done=>releaseFont=done);
   return route.fulfill({path:resolve(root,file),contentType:{'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf'}[extname(file)]||'text/plain'});
  }
  if(path==='/scripts/extensions.js')return route.fulfill({contentType:'text/javascript',body:"export const extensionTypes={'third-party/ST-PocketPhone':'local'};"});
  if(path==='/api/extensions/version')return route.fulfill({json:{currentBranchName:'main',currentCommitHash:'a'.repeat(40),remoteUrl:'https://github.com/fixture/phone',isUpToDate:true}});
  unexpected.push(url.href);return route.abort();
 });
 await page.goto(`http://127.0.0.1:8917${prefix}tests/startup.html?host=${kind}&mode=${mode}`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>startupHarness.ready);
 await page.getByRole('button',{name:mode==='embedded'?'打开两三事 · 随卡':'打开两三事',exact:true}).click();
 const phone=page.locator(mode==='embedded'?'#pocket-phone-card-host':'#pocket-phone-host'),board=phone.locator('.home-artboard');
 await page.waitForFunction(()=>document.querySelector('.pocket-phone')?.shadowRoot.querySelector('.home-clock'));
 const cold=await board.evaluate(element=>({visibility:getComputedStyle(element).visibility,imageComplete:element.querySelector('img').complete,fontReady:document.fonts.check('480px PocketPhoneClock','0123456789')}));assert.equal(cold.visibility,'hidden','cold classic PNG and clock wait together');
 assert.ok(releaseFont&&releaseArt);releaseFont();await page.waitForFunction(()=>document.fonts.check('480px PocketPhoneClock','0123456789'));assert.equal(await board.evaluate(element=>getComputedStyle(element).visibility),'hidden');
 releaseArt();await board.waitFor({state:'visible'});await phone.locator('.home-art').evaluate(image=>image.decode());
 assert.equal(assets.filter(path=>path==='assets/echo-foreground.png').length,1);assert.equal(assets.filter(path=>path==='assets/clock-dorsa.ttf').length,1);assert.equal(assets.filter(path=>path==='assets/night-fold-foreground.png').length,0);
 if(output&&kind==='native'){const font=(await readFile('/tmp/st-dollars-npc-rewrite-20261017/graph-ui-20261018/diagnostic-assets/NotoSansCJKsc-Regular.otf')).toString('base64');await phone.evaluate(async(element,data)=>{const face=new FontFace('PhoneFixtureCJK',`url(data:font/otf;base64,${data})`);await face.load();document.fonts.add(face);const style=document.createElement('style');style.textContent=':host{font-family:PhoneFixtureCJK,sans-serif}';element.shadowRoot.append(style);},font);}
 const layouts=[],fixtureBatch=readTimeline(await page.evaluate(()=>startupHarness.context.chat));
 for(const theme of ['day','night'])for(const width of[320,390]){
  await page.setViewportSize({width,height:844});await openApp(phone,'设置');await page.evaluate(({theme,batch})=>{const state=startupHarness.metadata.pocketPhone;state.theme=theme;state.conversations.lin=[{id:'unread-fixture',role:'assistant',text:'合成锁屏通知',read:false,...(batch?{batch}:{})}];},{theme,batch:fixtureBatch});
  await phone.getByRole('button',{name:'关闭手机',exact:true}).click();await page.getByRole('button',{name:mode==='embedded'?'打开两三事 · 随卡':'打开两三事',exact:true}).click();await board.waitFor({state:'visible'});await phone.locator('.home-art').evaluate(image=>image.decode());
  const layout=await phone.evaluate(element=>{const root=element.shadowRoot,main=root.querySelector('.view-home'),art=root.querySelector('.home-art'),footer=root.querySelector('.home-footer'),notification=root.querySelector('.lock-notification'),rect=node=>{const b=node.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,height:b.height};};return {main:rect(main),art:rect(art),footer:rect(footer),notification:notification&&rect(notification),fontReady:document.fonts.check('480px PocketPhoneClock','0123456789'),artVisible:getComputedStyle(art).visibility,overflow:main.scrollWidth>main.clientWidth};});
  assert.ok(layout.art.bottom>=layout.main.bottom-1&&layout.art.bottom>layout.footer.top);assert.ok(!layout.overflow);assert.equal(layout.artVisible,'visible');assert.ok(layout.fontReady);assert.ok(layout.notification&&layout.notification.bottom<=layout.footer.top);layouts.push({theme,width,...layout});
  const captured=await phone.locator('.phone-shell').screenshot();
  if(theme==='night'){
   const sampling=await phone.locator('.phone-shell').evaluate(element=>({top:element.getBoundingClientRect().top,paper:getComputedStyle(element).backgroundColor.match(/\d+/g).slice(0,3).map(Number)}));
   const visibleTexture=await page.evaluate(async({png,row,paper})=>{const img=new Image();img.src='data:image/png;base64,'+png;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const left=Math.floor(canvas.width*.2),right=Math.floor(canvas.width*.8),pixels=ctx.getImageData(left,row,right-left,1).data;let visible=0;for(let i=0;i<pixels.length;i+=4)if(Math.abs(pixels[i]-paper[0])+Math.abs(pixels[i+1]-paper[1])+Math.abs(pixels[i+2]-paper[2])>12)visible++;return {row,visible,sampled:right-left,fraction:visible/(right-left)};},{png:captured.toString('base64'),row:Math.floor(layout.main.bottom-sampling.top-2),paper:sampling.paper});
   assert.ok(visibleTexture.fraction>.1,'night rendered bottom must contain visible artwork: '+JSON.stringify(visibleTexture));layouts.at(-1).visibleTexture=visibleTexture;
  }
  if(output&&kind==='native'&&width===390)await writeFile(resolve(output,`classic-${theme}.png`),captured);
  await phone.locator('.lock-notification').click();await phone.getByText('合成锁屏通知',{exact:true}).waitFor();
 }
 // Same-source re-render keeps the already decoded artwork element.
 await phone.getByRole('button',{name:'关闭手机',exact:true}).click();await page.getByRole('button',{name:mode==='embedded'?'打开两三事 · 随卡':'打开两三事',exact:true}).click();await board.waitFor({state:'visible'});await phone.locator('.home-art').evaluate(image=>image.dataset.probe='same-node');await page.getByRole('button',{name:mode==='embedded'?'打开两三事 · 随卡':'打开两三事',exact:true}).click();assert.equal(await phone.locator('.home-art').getAttribute('data-probe'),'same-node');
 await phone.getByRole('button',{name:'进入桌面',exact:true}).click();await phone.locator('.view-desktop').waitFor();
 await page.evaluate(()=>{const state=startupHarness.metadata.pocketPhone;state.theme='day';state.wallpapers={day:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="900"%3E%3Crect width="400" height="900" fill="%23b3cbc6"/%3E%3C/svg%3E'};});await phone.getByRole('button',{name:'关闭手机',exact:true}).click();await page.getByRole('button',{name:mode==='embedded'?'打开两三事 · 随卡':'打开两三事',exact:true}).click();await board.waitFor({state:'visible'});const custom=await phone.locator('.home-wallpaper').evaluate(image=>{const art=image.getBoundingClientRect(),main=image.closest('main').getBoundingClientRect();return {loaded:image.complete&&image.naturalWidth>0,bottom:art.bottom,mainBottom:main.bottom};});assert.ok(custom.loaded);assert.ok(Math.abs(custom.bottom-custom.mainBottom)<1);
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);results.push({kind,mode,cold,readyTogether:true,oneCurrentPngAndFont:true,sameSourceNodeReused:true,notificationAndUnlock:true,layouts,custom,modelCalls:0,errors,unexpected});await page.close();
}}
finally{await browser.close();}
if(output)await writeFile(resolve(output,'lock-result.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results.map(({kind,layouts,readyTogether,errors,unexpected})=>({kind,readyTogether,edges:layouts.filter(row=>row.theme==='night').map(({width,visibleTexture})=>({width,visibleTexture})),errors,unexpected})),null,2));
