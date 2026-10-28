import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve, extname } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { openApp } from './navigation.mjs';

const repo = resolve(import.meta.dirname, '..'), tools = process.env.TMT_BROWSER_TOOLS || '/tmp/tmt-hot-browser-20261026';
const output = process.env.TMT_CONFIRM_OUTPUT || '/tmp/tmt-confirmation-buttons'; await mkdir(output, { recursive: true });
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
    for (const theme of ['day', 'night']) {
      await page.evaluate(async ({ prefix, theme }) => {
        const h=startupHarness,s=h.metadata.pocketPhone,base=s.contacts[0]||{ avatar:'' }; const { readTimeline }=await import(prefix+'src/timeline.js'),batch=readTimeline(h.context.chat);
        s.theme=theme;s.contacts=[{...base,id:'lin',name:'林舟'},{...base,id:'zhou',name:'周遥'}];s.groups=[{id:'friends',name:'读书群',memberIds:['lin','zhou'],userIsMember:true}];
        s.conversations={lin:[{id:'private',role:'assistant',text:'联系人私聊记录',batch}],zhou:[{id:'other',role:'assistant',text:'其他人的私聊',batch}],friends:[{id:'from-lin',role:'assistant',speakerId:'lin',text:'林舟的群消息',batch},{id:'from-zhou',role:'assistant',speakerId:'zhou',text:'周遥的群消息',batch}]};
      }, { prefix, theme });
      await openApp(phone, '短信'); await phone.locator('[data-contact="lin"]').click(); await phone.getByRole('button',{name:'聊天资料',exact:true}).click();
      await phone.locator('#profile-nickname').fill('未保存的资料草稿');
      const remove=phone.locator('.profile-form [data-action="remove-contact"]');await remove.scrollIntoViewIfNeeded();
      const originalMain=await phone.locator('.view-contact-profile').elementHandle(),position=await phone.locator('.view-contact-profile').evaluate(n=>n.scrollTop),saved=await page.evaluate(()=>startupHarness.metadataSaves);
      const dialog=phone.getByRole('dialog',{name:'删除联系人',exact:true});
      for (const dismissal of ['cancel','outside','escape']) {
        await remove.click();await dialog.waitFor();
        assert.equal(await phone.locator('.view-delete-confirm').count(),0,'deletion remains a modal on the original page');
        assert.equal(await originalMain.evaluate(n=>n.isConnected),true);assert.match(await dialog.textContent(),/全部私聊和历史存档都会删除/);
        assert.equal(await dialog.getByRole('button',{name:'取消',exact:true}).count(),1);assert.equal(await dialog.getByRole('button',{name:'确认删除',exact:true}).count(),1);
        if(dismissal==='cancel') { await phone.locator('.phone-shell').screenshot({path:resolve(output,`${host}-${width}-${theme}-delete.png`)});await dialog.getByRole('button',{name:'取消',exact:true}).click(); }
        else if(dismissal==='outside') await phone.locator('.phone-dialog-backdrop').click({position:{x:7,y:7}});
        else await page.keyboard.press('Escape');
        assert.equal(await dialog.count(),0);assert.equal(await page.evaluate(()=>startupHarness.metadataSaves),saved);assert.equal(await phone.locator('#profile-nickname').inputValue(),'未保存的资料草稿');assert.equal(await phone.locator('.view-contact-profile').evaluate(n=>n.scrollTop),position);
      }
      await phone.locator('[data-action="back-profile"]').click();await phone.locator('[data-action="chat-menu"]').click();await phone.locator('[data-action="remove-contact"]').click();await dialog.getByRole('button',{name:'确认删除',exact:true}).click();
      await phone.locator('.view-inbox').waitFor();assert.equal(await phone.locator('[data-contact="lin"]').count(),0);
      assert.deepEqual(await page.evaluate(()=>startupHarness.metadata.pocketPhone.groups[0].memberIds),['zhou']);assert.deepEqual(await page.evaluate(()=>startupHarness.metadata.pocketPhone.conversations.friends.map(n=>n.id)),['from-zhou']);assert.equal(await page.evaluate(()=>startupHarness.metadataSaves),saved+1);
      await phone.locator('[data-group="friends"]').click();await phone.getByRole('button',{name:'聊天资料',exact:true}).click();await phone.locator('[data-action="remove-group"]').click();
      const groupDialog=phone.getByRole('dialog',{name:'删除群聊',exact:true});await groupDialog.waitFor();assert.match(await groupDialog.textContent(),/全部群消息和历史存档都会删除/);await page.keyboard.press('Escape');assert.equal(await phone.locator('.view-group-profile').count(),1);
      await phone.locator('[data-action="back-group"]').click();await phone.locator('[data-action="chat-menu"]').click();await phone.locator('[data-action="remove-group"]').click();await groupDialog.getByRole('button',{name:'确认删除',exact:true}).click();await phone.locator('.view-inbox').waitFor();
      assert.deepEqual(await page.evaluate(()=>startupHarness.metadata.pocketPhone.groups),[]);assert.equal(await page.evaluate(()=>startupHarness.metadata.pocketPhone.conversations.friends),undefined);assert.equal(await page.evaluate(()=>startupHarness.metadataSaves),saved+2);
      await openApp(phone,'设置');await phone.locator('#api-source').click();const source=phone.locator('[data-api-source]:not([data-api-source="manual"])').first();await source.click();
      await phone.locator('.api-actions').scrollIntoViewIfNeeded();
      const buttons=await phone.locator('.api-actions > button').evaluateAll(nodes=>nodes.map(n=>{const s=getComputedStyle(n);return {height:n.getBoundingClientRect().height,border:s.borderTopWidth,background:s.backgroundColor,color:s.color};}));
      assert.ok(buttons.every(b=>b.height>=36&&b.height===buttons[0].height&&b.border==='1px'),'settings actions have the same explicit button geometry');
      await phone.locator('.phone-shell').screenshot({path:resolve(output,`${host}-${width}-${theme}-settings.png`)});
      await phone.locator('[data-action="api-save-as"]').click();const presetDialog=phone.getByRole('dialog',{name:'另存为预设',exact:true});await presetDialog.waitFor();await presetDialog.getByRole('button',{name:'取消',exact:true}).click();
      await phone.locator('[data-action="api-delete"]').click();const apiDelete=phone.getByRole('dialog',{name:'删除 API 预设',exact:true});await apiDelete.waitFor();assert.equal(await apiDelete.locator('.danger-button').count(),1);await apiDelete.getByRole('button',{name:'取消',exact:true}).click();
      if(width===390&&theme==='day'){
        await page.evaluate(()=>{startupHarness.metadata.pocketPhone.liangshi={accounts:[{id:'self',ownerId:'@user',name:'我'}],feedIds:[],userPostIds:['own'],posts:[{id:'own',authorId:'self',userAuthored:true,text:'隔离本人微博',comments:[],reposts:[]}]};});
        await openApp(phone,'两事');await phone.locator('[data-liangshi-tab="mine"]').click();const beforeWeibo=await page.evaluate(()=>startupHarness.metadataSaves);await phone.locator('[data-action="liangshi-menu"]').click();await phone.locator('[data-action="liangshi-delete"]').click();const weibo=phone.getByRole('dialog',{name:'删除微博',exact:true});assert.equal(await weibo.locator('.danger-button').count(),1);await weibo.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await page.evaluate(()=>startupHarness.metadataSaves),beforeWeibo);
      }
      results.push({host,width,theme,contactRemoved:true,groupRemoved:true,cancellationSaves:0,confirmationSaves:2,buttons,modelRequests:0,realUserWrites:0});
    }
    await page.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);console.log(JSON.stringify({pass:true,results,errors,blocked}));
}finally{await writeFile(resolve(output,'result.json'),JSON.stringify({results,errors,blocked},null,2));await browser.close();}
