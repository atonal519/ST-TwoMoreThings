import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { openApp } from './navigation.mjs';

const { chromium } = await import(process.env.POCKET_PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(import.meta.dirname, '..'), prefix = '/scripts/extensions/third-party/ST-PocketPhone/';
const output = process.env.POCKET_BROWSER_OUTPUT || mkdtempSync(resolve(tmpdir(), 'tmt-favorites-'));
mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const browser = await chromium.launch({ ...(process.env.POCKET_CHROMIUM_PATH ? { executablePath: process.env.POCKET_CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
const results = [];
try {
  for (const host of (process.env.POCKET_BROWSER_HOST ? [process.env.POCKET_BROWSER_HOST] : ['native', 'luker'])) for (const [width, theme] of [[390, 'day'], [320, 'night']].filter(([,theme]) => !process.env.POCKET_BROWSER_THEME || theme === process.env.POCKET_BROWSER_THEME)) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(6000);
    const errors = [], unexpected = []; let imageMode = 'ok';
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      if (url.hostname === '127.0.0.1' && path.startsWith(prefix)) {
        const file = resolve(root, decodeURIComponent(path.slice(prefix.length)));
        if (file === resolve(root, 'tests/preview.js')) return route.fulfill({ contentType: 'text/javascript', body: readFileSync(file, 'utf8')
          .replace('const settings = {', `const settings = { pocketPhone: { fontCssUrl: '${process.env.POCKET_FONT_FIXTURE_DIR ? 'http://127.0.0.1:8917/fixture-font/result.css' : ''}', ${process.env.POCKET_FONT_FIXTURE_DIR ? "fontFamily: 'Nowar Rounded TW Wc'," : ''} apiSourceRef: { kind: 'shared-preset', presetId: 'daily' } },`)
          .replace("'schedule-planner': {", "'schedule-planner': { processingPrompt: 'Fixture processing prompt', bodyWrappers: { keepTags: 'content', extraTags: '' },") });
        if (file === resolve(root, 'index.js') && process.env.POCKET_UI_SOURCE) return route.fulfill({ contentType: 'text/javascript', body: "export { initialize } from './src/runtime.js';" });
        if (existsSync(file)) return route.fulfill({ path: file, contentType: mime[extname(file)] || 'application/octet-stream' });
      }
      if (path === '/user/images/favorite.png' && imageMode === 'missing') return route.fulfill({status:404,body:''});
      if (path === '/user/images/favorite.png' && imageMode === 'network' && route.request().method() === 'HEAD') return route.abort();
      if (path === '/user/images/favorite.png') return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#639083"/></svg>'});
      if (path.startsWith('/fixture-font/') && process.env.POCKET_FONT_FIXTURE_DIR) { const file=path.endsWith('result.css') ? resolve(process.env.POCKET_FONT_FIXTURE_DIR,'default-387.css') : resolve(process.env.POCKET_FONT_FIXTURE_DIR,'public-font-cache',path.split('/').pop()); return existsSync(file) ? route.fulfill({path:file,contentType:path.endsWith('.css')?'text/css':'font/woff2'}) : route.fulfill({status:404,body:''}); }
      if (path === '/scripts/extensions.js') return route.fulfill({ contentType: 'text/javascript', body: "export const extensionTypes={'third-party/ST-PocketPhone':'local'};" });
      if (path === '/api/extensions/version') return route.fulfill({ json: { currentBranchName: 'main', currentCommitHash: 'a'.repeat(40), remoteUrl: 'https://github.com/fixture/phone', isUpToDate: true } });
      unexpected.push(url.href); return route.abort();
    });
    await page.goto(`http://127.0.0.1:8917${prefix}tests/preview.html?host=${host}&group=1&clock=story`);
    await page.locator('.phone-shell').waitFor();
    await page.evaluate(theme => {
      const h=previewHarness,s=h.metadata.pocketPhone,batch=s.conversations.lin[0].batch;
      s.theme=theme;s.userProfile={name:'我'};
      s.conversations.lin=[{id:'old-message',role:'assistant',text:'Past original',translation:'过去的原话',batch:{key:'old',label:'过去'}},...Array.from({length:72},(_,i)=>({id:'m'+i,role:'assistant',text:'消息 '+i,batch})),{id:'rich',role:'assistant',type:'location',location:{name:'街角书店',address:'南街'},text:'定位',batch},{id:'photo',role:'assistant',type:'image',image:{path:'/user/images/favorite.png',description:'短信原图描述'},text:'图',batch},{id:'money',role:'assistant',type:'transfer',transfer:{amount:'12.00',currency:'CNY',note:'一杯茶',recipientId:'@user',status:'pending'},text:'转账',batch},{id:'sticker',role:'assistant',type:'sticker',stickerId:'unknown',text:'旧贴纸',batch},{id:'pat',role:'assistant',type:'pat',pat:{targetId:'@user'},text:'林舟轻轻拍了拍你',batch}];
      s.conversations['preview-friends']=[{id:'group',role:'assistant',speakerId:'zhou',text:'群里的原话',batch}];
      s.social={npcs:[],feedIds:['s'],posts:[{id:'s',authorId:'lin',text:'A moment',translation:'片刻',publishedAt:'2026-10-31 12:30',image:{path:'/user/images/favorite.png',description:'原始配图描述'},comments:[{id:'sc',name:'周予',text:'So lovely',translation:'真好看'},{name:'旧评论人',text:'旧评论位置'}]}]};
      s.forum={posts:[{id:'f',publishedAt:'2031-04-08 10:00',title:'A small story',titleTranslation:'一件小事',author:'路人',content:'论坛正文',comments:[{id:'fc',author:'回帖人',text:'论坛回帖'},{author:'旧楼人',text:'旧楼内容'}]}]};
      s.liangshi={accounts:[{id:'la',name:'街边树',handle:'tree'}],posts:[{id:'l',authorId:'la',text:'两事正文',likes:3,comments:[{id:'lc',authorId:'la',text:'两事评论'}],reposts:[{id:'lr',authorId:'la',text:'两事转发',quoteId:'l'}]}],feedIds:['l'],followingFeedIds:[],topics:[]};h.app.open();
    },theme);
    if(process.env.POCKET_FONT_FIXTURE_DIR) { await page.waitForFunction(()=>document.querySelector('.pocket-phone').shadowRoot.querySelector('[data-appearance-font-faces]') || [...document.head.querySelectorAll('style')].some(n=>n.textContent.includes('Nowar Rounded'))); await page.evaluate(async()=>{await document.fonts.load('15px "Nowar Rounded TW Wc"','收藏夹片刻过去的原话');await document.fonts.ready;}); }
    const shell=page.locator('.phone-shell'), counters=()=>page.evaluate(()=>({models:previewHarness.requests.length,saves:previewHarness.metadataSaves,settings:previewHarness.settingsSaves}));

    const seedLegacyComments = async () => page.evaluate(async prefix => {
      const {captureFavorite}=await import(prefix+'src/favorites.js');const s=previewHarness.metadata.pocketPhone;
      const refs=[{app:'social',kind:'comment',postId:'s',rowId:'sc'},{app:'social',kind:'comment',postId:'s',rowIndex:1},{app:'forum',kind:'comment',postId:'f',rowId:'fc'},{app:'liangshi',kind:'comment',postId:'l',rowId:'lc'}];
      s.favorites=[...(s.favorites||[]),...refs.map((ref,index)=>({id:'legacy-comment-'+index,savedAt:'2031-04-08T10:00:00Z',...captureFavorite(s,ref)}))];previewHarness.app.open();
    },prefix);
    if(process.env.POCKET_PREVIEW_ONLY) {
      await page.evaluate(()=>{previewHarness.metadata.pocketPhone.favorites=[{id:'sample',source:{app:'messages'},snapshot:{sourceLabel:'群聊 · 读书小组',authorName:'林舟',text:'I kept the book you mentioned.',translation:'你说过的那本书，我留着。',publishedAt:'2026-10-31 12:30'}}];previewHarness.app.open();});
      const contrast=async(target,background)=>target.evaluate((node,bg)=>{const read=s=>s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);const fg=getComputedStyle(node).color;let parent=node.closest(bg),b=getComputedStyle(parent).backgroundColor;while(parent.parentElement && b==='rgba(0, 0, 0, 0)'){parent=parent.parentElement;b=getComputedStyle(parent).backgroundColor;}const a=read(fg),c=read(b);return {fg,bg:b,ratio:(Math.max(a,c)+.05)/(Math.min(a,c)+.05)};},background);
      await openApp(page,'收藏夹');await page.locator('.favorite-card').hover();const card=await contrast(page.locator('.favorite-card-content > span:first-child'),'.favorite-card');
      assert.ok(card.ratio>=4.5,JSON.stringify({kind:'hover-card',theme,...card}));await page.mouse.move(0,0);await page.locator('.favorite-card').focus();const focused=await contrast(page.locator('.favorite-card-content > span:first-child'),'.favorite-card');assert.ok(focused.ratio>=4.5);await shell.screenshot({path:`${output}/favorites-font-list-${host}-${theme}-${width}.png`});
      await page.locator('.favorite-card').click();const original=await contrast(page.locator('.favorite-copy .message-original'),'.phone-main'),translated=await contrast(page.locator('.favorite-copy .message-translation'),'.phone-main');assert.ok(original.ratio>=4.5);assert.ok(translated.ratio>=4.5);
      await shell.screenshot({path:`${output}/favorites-font-detail-${host}-${theme}-${width}.png`});await page.locator('[data-action="favorite-remove"]').click();const modal=await contrast(page.locator('.phone-dialog > p').first(),'.phone-dialog');assert.ok(modal.ratio>=4.5);await shell.screenshot({path:`${output}/favorites-font-dialog-${host}-${theme}-${width}.png`});
      const font=await page.locator('.favorite-copy').evaluate(n=>getComputedStyle(n).fontFamily);results.push({host,width,theme,source:Boolean(process.env.POCKET_UI_SOURCE),preview:true,card,focused,original,translated,modal,font,errors,unexpected});await page.close();continue;
    }
    if (process.env.POCKET_FAVORITES_UI_ONLY) {
      await page.getByRole('button',{name:'进入桌面',exact:true}).click();
      const desktopIcon = async id => page.locator(`.desktop-app-${id}`).evaluate(n=>{const s=getComputedStyle(n);return {color:s.color,background:s.backgroundColor,border:s.borderColor,shadow:s.boxShadow,width:s.width,height:s.height,svg:getComputedStyle(n.querySelector('svg')).color};});
      const settingsIcon=await desktopIcon('settings'), initialIcon=await desktopIcon('favorites');
      const cardMetrics=async selector=>page.locator(selector).first().evaluate(n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect();return {width:r.width,padding:s.padding,border:s.border,borderRadius:s.borderRadius,background:s.backgroundColor,shadow:s.boxShadow,title:n.querySelector('.post-title')?getComputedStyle(n.querySelector('.post-title')).fontSize:null,excerpt:getComputedStyle(n.querySelector('.post-excerpt')).fontSize,topline:getComputedStyle(n.querySelector('.post-topline')).fontSize,footer:getComputedStyle(n.querySelector('.post-footer')).fontSize};});
      let forumReference;
      await shell.screenshot({path:`${output}/favorite-desktop-${host}-${theme}-${width}.png`});
      assert.deepEqual(initialIcon,settingsIcon,'收藏夹与同列设置图标的日夜主题色及尺寸一致');
      await page.locator('[data-tab="favorites"]').hover();const hoveredIcon=await desktopIcon('favorites');assert.deepEqual(hoveredIcon,settingsIcon);
      await page.mouse.move(0,0);await page.locator('[data-tab="favorites"]').focus();const focusedIcon=await desktopIcon('favorites');assert.deepEqual(focusedIcon,settingsIcon);
      await openApp(page, '短信'); await page.locator('[data-contact="lin"]').click();
      await page.locator('[data-message="m71"]').click();
      const aligned = async () => page.locator('.message-actions').evaluate(node => [...node.querySelectorAll('.message-action')].map(button => {
        const svg=button.querySelector('svg').getBoundingClientRect(), text=button.querySelector('span').getBoundingClientRect();
        const range=document.createRange();range.selectNodeContents(button.querySelector('span'));const visibleText=range.getBoundingClientRect(),rect=button.getBoundingClientRect();return { label:button.textContent.trim(), iconLeft:svg.left, iconWidth:svg.width, textLeft:visibleText.left, iconCenter:svg.top+svg.height/2, textCenter:text.top+text.height/2, groupCenter:(svg.left+visibleText.right)/2, buttonCenter:rect.left+rect.width/2 };
      }));
      const assertAligned = rows => {
        assert.ok(rows.length>=2); for(const row of rows) { assert.ok(Math.abs(row.groupCenter-row.buttonCenter)<.5, '侧浮图标和可见文字整组应水平居中'); assert.equal(rows[0].iconWidth,row.iconWidth); assert.ok(Math.abs(row.iconCenter-row.textCenter)<.5, '图文垂直居中'); }
      };
      const beforeAligned=await aligned(); assertAligned(beforeAligned);
      await page.locator('.message-favorite').click(); await page.locator('.feedback').filter({hasText:'已收藏'}).waitFor();
      const savedAligned=await aligned(); assertAligned(savedAligned);
      const toast=await page.locator('.feedback').evaluate(node=>{const r=node.getBoundingClientRect();return {height:r.height,width:r.width,bottom:r.bottom};});
      assert.ok(toast.height<=36 && toast.width<=120, '收藏成功提示应紧凑');
      await shell.screenshot({path:`${output}/favorite-alignment-toast-${host}-${theme}-${width}.png`});
      await page.locator('.feedback [data-action="dismiss"]').click();assert.equal(await page.locator('.feedback').count(),0);
      await page.locator('[data-action="back-inbox"]').click();await page.locator('[data-group="preview-friends"]').click();await page.locator('[data-message="group"]').click();
      assert.equal(await page.locator('.message-actions [data-action="reply-message"]').count(),1);assertAligned(await aligned());await page.locator('.message-favorite').click();await page.locator('.feedback').filter({hasText:'已收藏'}).waitFor();const groupAligned=await aligned();assertAligned(groupAligned);
      await shell.screenshot({path:`${output}/favorite-group-alignment-${host}-${theme}-${width}.png`});await page.locator('.feedback').waitFor({state:'detached'});
      const directAdd = async button => { assert.equal(await button.count(),1); await button.click(); await page.locator('.feedback').filter({hasText:'已收藏'}).waitFor(); assert.equal(await page.locator('.phone-action-popup').count(),0); };
      await openApp(page,'ainstgram'); assert.equal(await page.locator('[data-action="favorite-menu"]').count(),0);
      await directAdd(page.locator('.social-stats [data-action="favorite-add"]')); assert.equal(await page.locator('.social-comment [data-action="favorite-add"]').count(),0);
      await shell.screenshot({path:`${output}/favorite-direct-social-${host}-${theme}-${width}.png`});
      await openApp(page,'论坛');forumReference=await cardMetrics('.forum-card'); await shell.screenshot({path:`${output}/favorite-forum-reference-${host}-${theme}-${width}.png`});await page.locator('[data-post="f"]').click(); assert.equal(await page.locator('[data-action="favorite-menu"]').count(),0);
      await directAdd(page.locator('.forum-votes [data-action="favorite-add"]')); assert.equal(await page.locator('.comment-row [data-action="favorite-add"]').count(),0);
      await shell.screenshot({path:`${output}/favorite-direct-forum-${host}-${theme}-${width}.png`});
      await openApp(page,'两事'); assert.equal(await page.locator('[data-action="favorite-menu"]').count(),0);
      await directAdd(page.locator('.ls-post [data-action="favorite-add"]')); await page.locator('[data-liangshi-open="l"]').first().click(); assert.equal(await page.locator('.ls-comment [data-action="favorite-add"]').count(),0);
      await page.getByRole('tab',{name:'转发',exact:true}).click(); await directAdd(page.locator('[data-liangshi-repost="lr"] [data-action="favorite-add"]'));
      await shell.screenshot({path:`${output}/favorite-direct-liangshi-${host}-${theme}-${width}.png`});
      await page.evaluate(()=>{const s=previewHarness.metadata.pocketPhone;s.liangshi.accounts.push({id:'self',name:'内部名',ownerId:'@user'});s.liangshi.posts.push({id:'own',authorId:'self',text:'自己的微博',userAuthored:true,comments:[],reposts:[]});s.liangshi.userPostIds=['own'];});
      await page.locator('[data-action="liangshi-back"]').click(); await page.locator('[data-liangshi-tab="mine"]').click(); await directAdd(page.locator('.ls-post [data-action="favorite-add"]')); await page.locator('[data-action="liangshi-menu"]').click(); assert.equal(await page.locator('[data-action="liangshi-edit"]').count(),1); assert.equal(await page.locator('[data-action="liangshi-delete"]').count(),1); assert.equal(await page.locator('.phone-action-popup [data-action="favorite-add"]').count(),0); await page.keyboard.press('Escape');
      await seedLegacyComments();await openApp(page,'收藏夹'); assert.equal(await page.locator('.favorite-card').count(),11);
      const favoriteMetrics=await cardMetrics('.favorite-card:has(.post-title)');assert.deepEqual(favoriteMetrics,forumReference,'收藏卡片复用论坛相同宽度、边框、内边距和文字层级');
      const filters=await page.locator('.favorite-filters').evaluate(n=>{const r=n.getBoundingClientRect(),heading=n.previousElementSibling.getBoundingClientRect(),list=n.nextElementSibling,first=list.firstElementChild.getBoundingClientRect(),button=n.querySelector('button[aria-pressed="true"]'),s=getComputedStyle(button),b=button.getBoundingClientRect();return {topGap:r.top-heading.bottom,bottomGap:first.top-r.bottom,height:b.height,font:s.fontSize,padding:s.padding,border:s.border,color:s.color,background:s.backgroundColor};});
      assert.ok(filters.topGap>=8 && filters.bottomGap>=12);assert.equal(filters.font,'10.5px');assert.ok(filters.height<28);
      await page.locator('.favorite-card').first().hover();await shell.screenshot({path:`${output}/favorite-forum-cards-${host}-${theme}-${width}.png`});await page.mouse.move(0,0);await page.locator('.favorite-card').first().focus();
      // Saved source styles render without a live source or a generation action.
      await page.evaluate(()=>{const s=previewHarness.metadata.pocketPhone;s.favorites.push({id:'forum-unmade',source:{app:'forum',kind:'post'},snapshot:{sourceLabel:'论坛 · 主帖',authorName:'路过书店',title:'A note from the bookshop',titleTranslation:'书店里的一张纸条',text:'The little bookshop stayed open after the rain.\nI left a note by the window, hoping you would find it when you returned. '.repeat(4),translation:'雨后的书店还亮着灯。\n我在窗边留了一张纸条，希望你下次经过时能够看到。'.repeat(4),publishedAt:'2031-04-08 10:00',image:{description:'雨后书店的窗边，一张写着约定时间的纸条。'}}});previewHarness.app.open();});
      await page.locator('.favorite-card').filter({hasText:'书店里的一张纸条'}).click();assert.equal(await page.locator('.favorite-detail .post-detail .post-body').count(),1);assert.equal(await page.locator('.favorite-detail .forum-photo').count(),1);assert.equal(await page.locator('.favorite-detail [data-action="forum-image"],[data-action="favorite-photo"]').count(),0);assert.ok((await page.locator('.favorite-detail .forum-photo').innerText()).includes('尚未生成'));await shell.screenshot({path:`${output}/favorite-source-forum-detail-${host}-${theme}-${width}.png`});await page.locator('.favorite-detail .forum-photo').scrollIntoViewIfNeeded();await shell.screenshot({path:`${output}/favorite-source-forum-description-${host}-${theme}-${width}.png`});
      await page.locator('[data-action="favorite-back"]').click();await page.locator('.favorite-card').filter({hasText:'片刻'}).click();assert.equal(await page.locator('.phone-main').evaluate(n=>n.scrollTop),0,'打开新收藏应从内容开头阅读');assert.equal(await page.locator('.favorite-detail .social-post .social-photo').count(),1);await page.locator('.favorite-detail img').evaluate(n=>n.decode());await page.waitForTimeout(100);assert.equal(await page.locator('.phone-main').evaluate(n=>n.scrollTop),0,'图片加载后仍从收藏详情开头阅读');await shell.screenshot({path:`${output}/favorite-source-social-detail-${host}-${theme}-${width}.png`});
      await page.evaluate(()=>{previewHarness.metadata.pocketPhone.social.posts=[];previewHarness.app.open();}); assert.ok((await page.locator('.favorite-detail').innerText()).includes('片刻'));
      await page.locator('[data-action="favorite-photo"]').click();await page.locator('.photo-viewer').waitFor();await page.locator('[data-action="close-photo"]').click();
      await page.locator('[data-action="favorite-back"]').click();await page.locator('.favorite-card').filter({hasText:'两事正文'}).first().click();assert.equal(await page.locator('.favorite-detail .ls-post .ls-copy').count(),1);await shell.screenshot({path:`${output}/favorite-source-liangshi-detail-${host}-${theme}-${width}.png`});
      await page.locator('[data-action="favorite-back"]').click();await page.locator('.favorite-card').filter({hasText:'群里的原话'}).click();assert.equal(await page.locator('.favorite-detail .bubble').count(),1);await shell.screenshot({path:`${output}/favorite-source-message-detail-${host}-${theme}-${width}.png`});
      const counts=await counters(); assert.equal(counts.models,0); assert.equal(counts.settings,0); assert.deepEqual(errors,[]); assert.deepEqual(unexpected,[]);
      results.push({host,width,theme,source:Boolean(process.env.POCKET_UI_SOURCE),directFavorites:true,compactToast:toast,beforeAligned,savedAligned,groupAligned,filters,favoriteMetrics,forumReference,desktop:{initialIcon,hoveredIcon,focusedIcon},permanentSnapshot:true,counts,errors,unexpected}); await page.close(); continue;
    }
    const addDirect = async button => {await button.click();await page.locator('.feedback').filter({hasText:'已收藏'}).waitFor();};
    await openApp(page,'收藏夹');assert.equal(await page.locator('.favorite-card').count(),0);assert.equal(await page.evaluate(()=>previewHarness.metadata.pocketPhone.favorites),undefined);
    await shell.screenshot({path:`${output}/favorites-empty-${host}-${theme}-${width}.png`});
    await openApp(page,'短信');await page.locator('[data-contact="lin"]').click();const draft=page.locator('#sms-draft');await draft.fill('收藏时保留草稿');await draft.focus();
    await page.locator('[data-message="pat"]').click();await page.locator('.message-favorite').click();
    await page.locator('[data-message="rich"]').click();await page.locator('.message-favorite').click();
    for (const id of ['money','sticker','photo']) { await page.locator(`[data-message="${id}"]`).click(); await page.locator('.message-favorite').click(); }
    await page.locator('[data-message="m71"]').click();await page.locator('.message-favorite').evaluate(n=>{n.click();n.click();});
    await page.waitForFunction(()=>previewHarness.metadata.pocketPhone.favorites?.length===6);assert.equal(await draft.inputValue(),'收藏时保留草稿');
    assert.equal(await page.locator('.message-favorite').innerText(),'收藏');assert.equal(await page.locator('.message-favorite').getAttribute('aria-pressed'),'true');
    await page.locator('.message-favorite').click();await page.waitForFunction(()=>previewHarness.metadata.pocketPhone.favorites.length===5);assert.equal(await page.locator('.message-favorite').getAttribute('aria-pressed'),'false');assert.equal(await page.getByRole('dialog').count(),0);
    await page.locator('.message-favorite').click();await page.waitForFunction(()=>previewHarness.metadata.pocketPhone.favorites.length===6);assert.equal(await page.locator('.message-favorite').getAttribute('aria-pressed'),'true');
    await page.evaluate(()=>{previewHarness.failSave=true;});await page.locator('.message-favorite').click();await page.locator('.feedback.is-error').waitFor();assert.equal(await page.evaluate(()=>previewHarness.metadata.pocketPhone.favorites.length),6);assert.equal(await page.locator('.message-favorite').getAttribute('aria-pressed'),'true');
    await shell.screenshot({path:`${output}/favorites-message-${host}-${theme}-${width}.png`});
    if (host==='native' && theme==='day') {
      await page.evaluate(()=>{previewHarness.saveWait=new Promise(resolve=>{previewHarness.releaseSave=resolve;});});
      await page.locator('[data-message="m70"]').click();await page.locator('.message-favorite').click();
      await draft.fill('异步保存中的新草稿');await draft.focus();await draft.evaluate(n=>{window.pendingDraft=n;n.setSelectionRange(2,6,'backward');});
      await page.evaluate(()=>{previewHarness.releaseSave();previewHarness.saveWait=null;});
      await page.waitForFunction(()=>previewHarness.metadata.pocketPhone.favorites.length===7);
      assert.deepEqual(await draft.evaluate(n=>({same:n===pendingDraft,active:n.getRootNode().activeElement===n,start:n.selectionStart,end:n.selectionEnd,text:n.value})),{same:true,active:true,start:2,end:6,text:'异步保存中的新草稿'});
      // Remove the extra test item through the real confirmation, preserving the shared matrix count.
      await openApp(page,'收藏夹');await page.locator('.favorite-card').filter({hasText:'消息 70'}).click();await page.locator('[data-action="favorite-remove"]').click();await page.getByRole('dialog',{name:'取消收藏',exact:true}).getByRole('button',{name:'取消收藏',exact:true}).click();await page.locator('.view-favorites').waitFor();await openApp(page,'短信');await page.locator('[data-contact="lin"]').click();
    }
    await page.locator('[data-action="history"]').click();await page.locator('[data-message="old-message"]').click();await page.locator('.message-favorite').click();
    await page.locator('[data-action="back-inbox"]').click();await page.locator('[data-group="preview-friends"]').click();await page.locator('[data-message="group"]').click();await page.locator('.message-favorite').click();
    await openApp(page,'ainstgram');await addDirect(page.locator('.social-stats [data-action="favorite-add"]'));assert.equal(await page.locator('.social-comment [data-action="favorite-add"]').count(),0);
    await shell.screenshot({path:`${output}/favorites-social-${host}-${theme}-${width}.png`});
    await openApp(page,'论坛');await page.locator('[data-post="f"]').click();await addDirect(page.locator('.forum-votes [data-action="favorite-add"]'));assert.equal(await page.locator('.comment-row [data-action="favorite-add"]').count(),0);
    await openApp(page,'两事');await addDirect(page.locator('.ls-post [data-action="favorite-add"]'));await page.locator('[data-liangshi-open="l"]').first().click();assert.equal(await page.locator('.ls-comment [data-action="favorite-add"]').count(),0);await page.getByRole('tab',{name:'转发',exact:true}).click();await addDirect(page.locator('[data-liangshi-repost="lr"] [data-action="favorite-add"]'));
    await page.evaluate(()=>{const s=previewHarness.metadata.pocketPhone;s.liangshi.accounts.push({id:'self',name:'内部名',ownerId:'@user'});s.liangshi.posts.push({id:'own',authorId:'self',text:'自己的微博',userAuthored:true,comments:[],reposts:[]});s.liangshi.userPostIds=['own'];});
    await page.locator('[data-action="liangshi-back"]').click();await page.locator('[data-liangshi-tab="mine"]').click();await page.locator('[data-action="liangshi-menu"]').click();assert.equal(await page.locator('[data-action="liangshi-edit"]').count(),1);await page.keyboard.press('Escape');await page.locator('.ls-post [data-action="favorite-add"]').click();
    await openApp(page,'收藏夹');await page.locator('[data-favorite-filter=""]').click();await page.locator('.favorite-card').filter({hasText:'自己的微博'}).click();assert.equal(await page.locator('.favorite-detail h2').innerText(),'我');await page.locator('[data-action="favorite-remove"]').click();await page.getByRole('dialog',{name:'取消收藏',exact:true}).getByRole('button',{name:'取消收藏',exact:true}).click();await page.locator('.view-favorites').waitFor();
    await seedLegacyComments();await openApp(page,'收藏夹');assert.equal(await page.locator('.favorite-card').count(),16);const after=await counters();assert.equal(after.models,0);assert.equal(after.settings,0);
    await shell.screenshot({path:`${output}/favorites-list-${host}-${theme}-${width}.png`});
    await page.locator('[data-favorite-filter="messages"]').click();assert.equal(await page.locator('.favorite-card').count(),8);await page.locator('.favorite-card').filter({hasText:'旧贴纸'}).click();assert.equal(await page.locator('.favorite-rich').innerText(),'旧贴纸');await page.locator('[data-action="favorite-back"]').click();await page.locator('.favorite-card').filter({hasText:'过去的原话'}).click();assert.equal(await page.locator('.favorite-copy').innerText().then(x=>x.includes('Past original')&&x.includes('过去的原话')),true);assert.equal(await page.locator('[data-action="favorite-source"]').count(),0);await page.locator('[data-action="favorite-back"]').click();assert.equal(await page.locator('[data-favorite-filter="messages"]').getAttribute('aria-pressed'),'true');
    await page.locator('[data-favorite-filter="social"]').click();await page.locator('.favorite-card').filter({hasText:'片刻'}).click();await page.locator('.favorite-photo').click();await page.locator('.photo-viewer').waitFor();assert.equal(await page.locator('.photo-viewer p').innerText(),'原始配图描述');await page.locator('[data-action="close-photo"]').click();
    await shell.screenshot({path:`${output}/favorites-detail-${host}-${theme}-${width}.png`});
    await page.locator('[data-action="favorite-remove"]').click();const remove=page.getByRole('dialog',{name:'取消收藏',exact:true});await remove.getByRole('button',{name:'保留',exact:true}).click();assert.equal(await page.locator('.view-favorite-detail').count(),1);
    await page.locator('[data-action="favorite-remove"]').click();await page.keyboard.press('Escape');assert.equal(await page.locator('.view-favorite-detail').count(),1);
    await page.evaluate(()=>{previewHarness.metadata.pocketPhone.social.posts=[];previewHarness.app.open();});assert.equal(await page.locator('.favorite-detail').innerText().then(x=>x.includes('片刻')&&x.includes('林舟')&&x.includes('ainstgram')),true);assert.equal(await page.locator('.favorite-photo img').getAttribute('src'),'/user/images/favorite.png');
    if(host==='native'&&theme==='day') {
      imageMode='network';await page.locator('.favorite-photo').click();await page.locator('.photo-viewer').waitFor();await page.locator('[data-action="close-photo"]').click();assert.equal(await page.locator('.favorite-photo').count(),1);
      imageMode='missing';await page.locator('.favorite-photo').click();await page.locator('[data-action="favorite-photo"]').waitFor({state:'detached'});assert.equal(await page.locator('.favorite-detail .social-photo-placeholder').count(),1);assert.equal(await page.locator('.photo-description').innerText(),'原始配图描述');assert.equal(await page.locator('[data-action="favorite-photo"]').count(),0);imageMode='ok';
    }
    await page.locator('[data-action="favorite-back"]').click();await page.locator('.favorite-card').filter({hasText:'旧评论位置'}).click();await page.evaluate(()=>{previewHarness.metadata.pocketPhone.social.posts=[{id:'s',authorId:'lin',text:'新帖文',comments:[{id:'new',name:'新',text:'不同评论'}]}];previewHarness.app.open();});assert.equal(await page.locator('.favorite-copy').innerText(),'旧评论位置');
    await page.locator('[data-action="favorite-remove"]').click();await page.evaluate(()=>{previewHarness.failSave=true;});await remove.getByRole('button',{name:'取消收藏',exact:true}).click();await page.locator('.feedback.is-error').waitFor();assert.equal(await remove.count(),1);assert.equal(await page.evaluate(()=>previewHarness.metadata.pocketPhone.favorites.length),16);await page.keyboard.press('Escape');
    await page.locator('[data-action="favorite-remove"]').click();await remove.getByRole('button',{name:'取消收藏',exact:true}).click();await page.locator('.view-favorites').waitFor();assert.equal(await page.evaluate(()=>previewHarness.metadata.pocketPhone.favorites.length),15);
    await openApp(page,'短信');await page.locator('[data-contact="lin"]').click();await page.getByRole('button',{name:'聊天选项',exact:true}).click();await page.locator('[data-action="clear-chat"]').click();await page.getByRole('dialog',{name:'清空聊天',exact:true}).getByRole('button',{name:'确认清空',exact:true}).click();await page.getByRole('dialog',{name:'清空聊天',exact:true}).waitFor({state:'detached'});assert.equal(await page.evaluate(()=>previewHarness.metadata.pocketPhone.favorites.length),15);
    await openApp(page,'收藏夹');await page.locator('[data-favorite-filter="messages"]').click();await page.locator('.favorite-card').filter({hasText:'消息 71'}).click();await page.locator('[data-action="favorite-remove"]').click();const beforeInvalid=await counters();await page.evaluate(()=>{previewHarness.context.chatId='different-chat';});await remove.getByRole('button',{name:'取消收藏',exact:true}).click();assert.deepEqual(await counters(),beforeInvalid);assert.equal(await remove.count(),0);
    assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);results.push({host,width,theme,source:Boolean(process.env.POCKET_UI_SOURCE),models:after.models,errors,unexpected,font:process.env.POCKET_FONT_FIXTURE_DIR ? 'Nowar Rounded TW Wc (387 offline fixture)' : 'system fixture'});await page.close();
  }
  writeFileSync(resolve(output,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({output,results}));
} finally {await browser.close();}
