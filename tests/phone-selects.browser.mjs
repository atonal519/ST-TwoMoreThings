import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve, extname } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { openApp } from './navigation.mjs';

const repo = resolve(import.meta.dirname, '..'), tools = process.env.TMT_BROWSER_TOOLS || '/tmp/tmt-hot-browser-20261026';
const output = process.env.TMT_SELECT_OUTPUT || '/tmp/tmt-phone-selects'; await mkdir(output, { recursive: true });
const { chromium } = createRequire(resolve(tools, 'package.json'))('playwright');
const browser = await chromium.launch({ executablePath: resolve(tools, 'browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell'), env: { ...process.env, LD_LIBRARY_PATH: resolve(tools, 'libs/usr/lib/x86_64-linux-gnu') } });
const prefix = '/scripts/extensions/third-party/ST-PocketPhone/';
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const results = [], errors = [], blocked = [];
try {
  for (const width of [320, 390, 1100]) {
    const host = width === 390 ? 'luker' : 'native';
    const page = await browser.newPage({ viewport: { width, height: 844 } }); page.setDefaultTimeout(6000); page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      if (url.hostname === '127.0.0.1' && path === prefix + 'index.js') return route.fulfill({ contentType: 'text/javascript', body: `import { initialize } from './${process.env.TMT_UI_SOURCE ? 'src/runtime.js' : 'dist/runtime.js'}'; startupHarness.app = initialize();` });
      if (url.hostname === '127.0.0.1' && path.startsWith(prefix)) return route.fulfill({ path: resolve(repo, decodeURIComponent(path.slice(prefix.length))), contentType: mime[extname(path)] || 'application/octet-stream' });
      if (path === '/fixture-font.ttf') return route.fulfill({ path: resolve(tools, 'NotoSansSC.ttf'), contentType: 'font/ttf' });
      if (path === '/scripts/extensions.js') return route.fulfill({ contentType: 'text/javascript', body: "export const extensionTypes={'third-party/ST-PocketPhone':'local'};" });
      if (path === '/api/extensions/version') return route.fulfill({ json: { currentBranchName: 'main', currentCommitHash: 'f3f712535789088c897ba8a13115518606d77315', remoteUrl: 'https://github.com/atonal519/ST-TwoMoreThings', isUpToDate: true } });
      if (path === '/lib.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const DOMPurify={sanitize:x=>x};export const showdown={Converter:class{makeHtml(x){return x}}};' });
      if (path === '/scripts/world-info.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const selected_world_info=[];export const world_info={charLore:[]};export const world_info_case_sensitive=false;export const world_info_match_whole_words=false;export async function loadWorldInfo(){return {entries:{}}}' });
      blocked.push(path); return route.abort();
    });
    await page.goto(`http://127.0.0.1:8917${prefix}tests/startup.html?host=${host}`); await page.waitForFunction(() => startupHarness.ready);
    await page.evaluate(() => startupHarness.app.open()); const phone = page.locator('#pocket-phone-host');
    await phone.evaluate(async el => { const font=new FontFace('FixtureCJK','url(http://127.0.0.1:8917/fixture-font.ttf)');await font.load();document.fonts.add(font);const style=document.createElement('style');style.textContent='.phone-shell{font-family:FixtureCJK,sans-serif}';el.shadowRoot.append(style); });
    await page.evaluate(() => {const s=startupHarness.metadata.pocketPhone;s.contacts.push({...s.contacts[0],id:'zhou',name:'周遥'});s.groups[0].memberIds=['lin','zhou'];s.forum={posts:Array.from({length:10},(_,i)=>({id:`f${i}`,title:`普通讨论${i}`,author:'路人',content:'普通帖子正文。'.repeat(20),tags:['生活日常',i%2?'职场交流':'文化娱乐'],comments:[]}))};});
    const counts=()=>page.evaluate(()=>({metadata:startupHarness.metadataSaves,settings:startupHarness.settingsSaves}));
    async function choose(id,value) {
      const before=await counts(),previous=await phone.locator(`#${id}`).inputValue();
      await phone.locator(`[data-phone-select="${id}"]`).scrollIntoViewIfNeeded();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await phone.locator(`[data-phone-select="${id}"]`).click();
      await phone.locator('.phone-select-popup.model-popup.source-popup').waitFor();
      assert.equal(await phone.locator('.phone-sheet-backdrop').count(),0,'select uses the API-style anchored list without a modal');
      const bounds=await phone.locator('.phone-select-popup').evaluate(n=>{const p=n.getBoundingClientRect(),m=n.parentElement.querySelector('.phone-main').getBoundingClientRect(),f=n.parentElement.querySelector('.phone-footer').getBoundingClientRect();return {top:p.top,bottom:p.bottom,left:p.left,right:p.right,mainTop:m.top,mainBottom:m.bottom,footerTop:f.top};});
      assert.ok(bounds.top>=bounds.mainTop&&bounds.bottom<=Math.min(bounds.mainBottom,bounds.footerTop),`${id}: menu stays in content above system navigation: ${JSON.stringify(bounds)}`);
      if(await phone.locator('#api-source').count())assert.deepEqual(await phone.locator(`[data-phone-select="${id}"]`).evaluate(n=>{const a=getComputedStyle(n),b=getComputedStyle(n.getRootNode().querySelector('#api-source'));return [a.minHeight===b.minHeight,a.padding===b.padding,a.fontSize===b.fontSize,a.borderRadius===b.borderRadius];}),[true,true,true,true],'actual API trigger and select trigger share geometry');
      await phone.locator(`[data-phone-select-option="${value}"]`).click();
      await page.waitForFunction(({id,value})=>document.querySelector('#pocket-phone-host').shadowRoot.querySelector(`#${id}`)?.value===value,{id,value});
      const after=await counts();assert.equal(await phone.locator(`[data-phone-select="${id}"]`).evaluate(n=>n.getRootNode().activeElement===n),true,`${id}: return to current button after change`);
      if(previous===value)assert.deepEqual(after,before,`${id}: same choice saves nothing`);
      else if(['phone-theme','phone-lock-style','default-language'].includes(id))assert.equal(after.metadata,before.metadata+1,`${id}: one original change/save`);
      else if(id==='image-provider')assert.equal(after.settings,before.settings+1,'provider choice only changes its settings');
      else assert.deepEqual(after,before,`${id}: draft-only choice saves nothing`);
    }
    for(const theme of ['day','night']) {
      await page.evaluate(theme=>{startupHarness.metadata.pocketPhone.theme=theme;startupHarness.app.open();},theme);
      await openApp(phone,'设置');
      if(await phone.locator('[data-drawer="appearance"]').getAttribute('aria-expanded')!=='true')await phone.locator('[data-drawer="appearance"]').click();
      await choose('phone-theme',theme);await choose('phone-theme',theme==='day'?'night':'day');await choose('phone-theme',theme);
      await choose('phone-lock-style','classic');
      const gap=await phone.locator('[data-phone-select="phone-theme"]').evaluate(n=>n.getRootNode().querySelector('[data-phone-select="phone-lock-style"]').getBoundingClientRect().top-n.getBoundingClientRect().bottom);assert.ok(gap>=8&&gap<=10,`theme/lock gap ${gap}`);
      await phone.locator('[data-phone-select="phone-theme"]').focus();await page.keyboard.press('ArrowDown');await phone.locator('.phone-select-options').waitFor();await page.keyboard.press('Tab');assert.equal(await phone.locator('.phone-select-popup').count(),0);assert.equal(await phone.locator('[data-phone-select="phone-lock-style"]').evaluate(n=>n.getRootNode().activeElement===n),true,'Tab leaves list to the next field without a modal loop');
      await page.setViewportSize({width,height:600});await phone.locator('#api-url').focus();await phone.locator('[data-phone-select="phone-theme"]').click();await phone.locator('.phone-select-popup').waitFor();await page.setViewportSize({width,height:844});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await phone.locator('.phone-select-popup').count(),1,'keyboard-closing viewport growth keeps the just-opened list');await page.keyboard.press('Escape');
      await page.evaluate(()=>{window.hostPickerKeys=[];document.addEventListener('keydown',event=>hostPickerKeys.push(event.key));});
      for(const key of ['Enter','Space']){await phone.locator('[data-phone-select="phone-theme"]').focus();await page.keyboard.press(key);await phone.locator('.phone-select-options').waitFor();assert.equal(await phone.locator('.phone-select-options').count(),1,'native button click opens one sheet');await page.keyboard.press('Escape');}
      assert.deepEqual(await page.evaluate(()=>hostPickerKeys),[],'picker Enter/Space/Escape never reaches host keyboard listener');
      const beforeDismiss=await counts();
      for(const method of ['same','outside','escape']) {
        await phone.locator('[data-phone-select="phone-theme"]').focus();await page.keyboard.press('ArrowDown');await phone.locator('.phone-select-options').waitFor();
        if(method==='same'){await phone.locator('.phone-shell').screenshot({path:resolve(output,`${host}-${width}-${theme}-theme-picker.png`)});await phone.locator(`[data-phone-select-option="${theme}"]`).click();}
        else if(method==='outside')await phone.locator('.phone-status').click({position:{x:7,y:7}});else await page.keyboard.press('Escape');
        assert.equal(await phone.locator('.phone-select-popup').count(),0);
        if(method!=='outside')assert.equal(await phone.locator('[data-phone-select="phone-theme"]').evaluate(n=>n.getRootNode().activeElement===n),true);
      }
      assert.deepEqual(await counts(),beforeDismiss);
      if(await phone.locator('[data-drawer="content"]').getAttribute('aria-expanded')!=='true')await phone.locator('[data-drawer="content"]').click();
      await phone.getByRole('button',{name:'读取中',exact:true}).waitFor({state:'hidden'});
      await phone.locator('[data-phone-select="default-language"]').scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await phone.locator('[data-phone-select="default-language"]').click();for(let i=0;i<5;i++)await page.keyboard.press('ArrowDown');
      const arrowVisibility=await phone.locator('.phone-select-options').evaluate(n=>{const option=n.getRootNode().activeElement,b=option.getBoundingClientRect(),l=n.getBoundingClientRect();return {top:b.top,bottom:b.bottom,listTop:l.top,listBottom:l.bottom,scroll:n.scrollTop};});assert.ok(arrowVisibility.scroll>0&&arrowVisibility.top>=arrowVisibility.listTop&&arrowVisibility.bottom<=arrowVisibility.listBottom,`Arrow navigation reveals the next clipped option: ${JSON.stringify(arrowVisibility)}`);await page.keyboard.press('Escape');
      await choose('default-language','中文');await choose('default-language','');await choose('image-provider','chatu8');await choose('image-provider','baibai');
      assert.equal(await phone.locator('select').evaluateAll(nodes=>nodes.every(n=>n.hidden&&n.tabIndex===-1&&n.getAttribute('aria-hidden')==='true')),true,'no accessible native duplicate');
      await phone.locator('[data-action="authoring"]').click();await choose('export-source','local');await choose('export-source','remote');
      await openApp(phone,'短信');await phone.locator('[data-group="friends"]').click();await phone.locator('[data-action="attachments"]').click();await phone.locator('[data-action="choose-transfer"]').click();await phone.getByRole('spinbutton',{name:'金额',exact:true}).fill('8');
      assert.equal(await phone.locator('#transfer-recipient').evaluate(n=>n.closest('label').control===n.getRootNode().querySelector('[data-phone-select="transfer-recipient"]')),true,'implicit recipient label points to the visible picker');
      await phone.getByText('收款人',{exact:true}).click();await phone.locator('.phone-select-options').waitFor();await page.keyboard.press('Escape');
      const transferCounts=await counts();await phone.getByRole('button',{name:'发送转账',exact:true}).click();await phone.locator('.phone-select-options').waitFor();await phone.locator('[data-phone-select-option="lin"]').click();
      assert.equal(await phone.locator('#transfer-recipient').inputValue(),'lin');assert.deepEqual(await counts(),transferCounts,'choosing a required member does not send or save');
      await choose('transfer-recipient','zhou');
      const nav=phone.locator('[data-action="system-home"]');assert.equal(await nav.evaluate(n=>getComputedStyle(n).borderRadius),'10px');
      await openApp(phone,'论坛');
      const tags=await phone.locator('.forum-tags').evaluate(n=>({margin:getComputedStyle(n).marginTop,font:getComputedStyle(n.querySelector('button')).fontSize}));assert.equal(tags.margin,'8px');assert.equal(tags.font,'10.5px');
      await phone.locator('.phone-shell').screenshot({path:resolve(output,`${host}-${width}-${theme}-forum-tags.png`)});
      const forumCounts=await counts();await phone.locator('[data-forum-tag="生活日常"]').click();await phone.locator('.view-forum').evaluate(n=>{n.scrollTop=180;});const anchor=phone.locator('[data-post="f2"]');await anchor.scrollIntoViewIfNeeded();const beforeAnchor=await anchor.evaluate(n=>n.getBoundingClientRect().top-n.closest('.phone-main').getBoundingClientRect().top);assert.ok(await phone.locator('.view-forum').evaluate(n=>n.scrollTop)>0,'return case starts from a scrolled feed');await anchor.click();await phone.locator('[data-action="back-forum"]').click();assert.equal(await phone.locator('[data-forum-tag="生活日常"]').getAttribute('aria-pressed'),'true');assert.ok(Math.abs(await anchor.evaluate(n=>n.getBoundingClientRect().top-n.closest('.phone-main').getBoundingClientRect().top)-beforeAnchor)<1,'detail returns to the same post offset');assert.deepEqual(await counts(),forumCounts,'category selection/detail return save nothing');
      results.push({host,width,theme,internalPickers:6,tagStyle:tags,models:0,realUserWrites:0});
    }
    await page.close();
  }
  assert.deepEqual(errors,[]); assert.ok(blocked.every(path=>['/scripts/extensions/regex/engine.js','/scripts/power-user.js'].includes(path)), 'only unrelated injection-status imports may be isolated');
  console.log(JSON.stringify({pass:true,results,errors,blocked}));
}finally{await writeFile(resolve(output,'result.json'),JSON.stringify({results,errors,blocked},null,2));await browser.close();}
