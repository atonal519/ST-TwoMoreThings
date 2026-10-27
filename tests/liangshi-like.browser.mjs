import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { openApp } from './navigation.mjs';

const root = resolve(import.meta.dirname, '..'), prefix = '/scripts/extensions/third-party/ST-PocketPhone/', output = process.env.POCKET_LIKE_OUTPUT;
if (output) await mkdir(output, { recursive: true });
const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
const results = [], mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.ttf':'font/ttf', '.woff2':'font/woff2' };
try {
  for (const [kind, mode] of [['native','standalone'], ['luker','embedded']]) {
    const page = await browser.newPage({ viewport: { width:390, height:844 } }); page.setDefaultTimeout(6000);
    const requests = [], errors = [], unexpected = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      if (url.hostname !== '127.0.0.1') { unexpected.push(url.href); return route.abort(); }
      if (path.startsWith(prefix)) return route.fulfill({ path:resolve(root, decodeURIComponent(path.slice(prefix.length))), contentType:mime[extname(path)] || 'application/octet-stream' });
      if (path === '/lib.js') return route.fulfill({ contentType:'text/javascript', body:'export const showdown={Converter:class{makeHtml(t){return t}}};export const DOMPurify={sanitize:h=>h};' });
      if (path === '/scripts/extensions.js') return route.fulfill({ contentType:'text/javascript', body:"export const extensionTypes={'third-party/ST-PocketPhone':'local'};" });
      if (path === '/scripts/world-info.js') return route.fulfill({ contentType:'text/javascript', body:'export const selected_world_info=[],world_info={};export async function loadWorldInfo(){return {entries:{}}}' });
      if (path === '/api/extensions/version') return route.fulfill({ json:{currentBranchName:'main', currentCommitHash:'a'.repeat(40), remoteUrl:'https://github.com/fixture/phone', isUpToDate:true} });
      if (path === '/api/backends/chat-completions/generate') {
        const payload = JSON.parse(route.request().postDataJSON().messages[1].content); requests.push(payload);
        assert.equal(payload.post.id,'ad'); assert.equal(payload.post.userLiked,undefined); assert.equal(payload.post.likes,50000);
        const answer = { comments:[{authorId:'a',text:`追加评论${requests.length}`}], reposts:[{authorId:'a',text:`追加转发${requests.length}`}] };
        return route.fulfill({json:{choices:[{message:{content:JSON.stringify(answer)}}]}});
      }
      unexpected.push(url.href); return route.abort();
    });
    await page.goto(`http://127.0.0.1:8917${prefix}tests/startup.html?host=${kind}&mode=${mode}`); await page.waitForFunction(() => startupHarness.ready);
    await page.evaluate(() => {
      const h = startupHarness;
      h.metadata.pocketPhone.liangshi = { accounts:[{id:'a',name:'林舟',handle:'lin_public',contactId:'lin',avatar:h.metadata.pocketPhone.contacts[0].avatar},{id:'b',name:'纸间影像',handle:'paper_scene',avatar:h.metadata.pocketPhone.contacts[0].avatar}], topics:[{name:'露天电影夜',description:'街边今晚多了一个放映点。'}], posts:Array.from({length:15}, (_,index) => ({id:index===7?'ad':`post-${index}`, authorId:index===7?'b':'a', text:index===7?'白鳥·两三事把短信、群聊、论坛和动态装进小手机，日常在这里接上故事。':index===2?'散场后还有人在讨论结尾。有人觉得太慢，有人说就喜欢这样慢慢走回家的感觉。 #露天电影夜#':'晚风吹过街角，放映厅外的小摊还亮着灯。忙了一天，坐下来听完一首片尾曲也挺好。', topic:index===2?'露天电影夜':'', publishedAt:'2031/4/8 09:20', promoted:index===7, ...(index===7?{builtinPromotion:'两三事'}:{}), likes:index===7?0:100+index, commentCount:40, repostCount:20, comments:[], reposts:[], ...(index===0?{userLiked:true}:{}) })), promoCountdown:2 };
      h.context.saveMetadata = async () => { h.metadataSaves++; h.persisted = structuredClone(h.metadata); };
      h.likeAnimations = [];
      const animate = Element.prototype.animate;
      Element.prototype.animate = function(frames, options) {
        const result = animate.call(this, frames, options), id = this.closest('[data-liangshi-like]')?.dataset.liangshiLike;
        if (id) h.likeAnimations.push({id,duration:result.effect.getTiming().duration,frames:result.effect.getKeyframes().map(frame=>frame.transform)});
        return result;
      };
    });
    await page.getByRole('button',{name:mode==='embedded'?'打开两三事 · 随卡':'打开两三事',exact:true}).click();
    const phone = page.locator(mode==='embedded'?'#pocket-phone-card-host':'#pocket-phone-host');
    const like = id => phone.locator(`[data-liangshi-like="${id}"]`);
    const waitLiked = async (id,value) => { await page.waitForFunction(([id,value]) => startupHarness.metadata.pocketPhone.liangshi.posts.find(post=>post.id===id).userLiked===value,[id,value]); await page.waitForFunction(([id,value]) => { const button=document.querySelector('.pocket-phone')?.shadowRoot.querySelector(`[data-liangshi-like="${id}"]`); return button?.getAttribute('aria-pressed')===String(value)&&!button.disabled; },[id,value]); };
    await openApp(phone,'两事'); assert.equal(await phone.locator('.ls-post').count(),15);
    await phone.locator('.phone-main').evaluate(node=>{node.scrollTop=180;}); await like('post-2').scrollIntoViewIfNeeded(); const scrollBefore = await phone.locator('.phone-main').evaluate(node=>node.scrollTop); assert.ok(scrollBefore>0);
    await like('post-2').click(); await waitLiked('post-2',true); assert.equal((await like('post-2').textContent()).trim(),'103');
    assert.equal(await phone.locator('.ls-post').count(),15); assert.equal(await phone.locator('.phone-main').evaluate(node=>node.scrollTop),scrollBefore);
    assert.equal(await like('post-2').getAttribute('aria-pressed'),'true'); assert.equal(await like('post-2').locator('svg path[fill="currentColor"]').count(),1);
    assert.equal(await like('post-2').locator('svg').evaluate(node=>getComputedStyle(node).color),'rgb(214, 69, 69)');
    assert.deepEqual(await page.evaluate(()=>startupHarness.likeAnimations.map(({id,duration})=>({id,duration}))),[{id:'post-2',duration:200}]);
    await like('post-2').click(); await waitLiked('post-2',false); assert.equal((await like('post-2').textContent()).trim(),'102');
    await page.emulateMedia({reducedMotion:'reduce'}); await like('post-2').focus(); await like('post-2').press('Space'); await waitLiked('post-2',true);
    assert.equal(await page.evaluate(()=>startupHarness.likeAnimations.length),1); await page.emulateMedia({reducedMotion:'no-preference'});
    await openApp(phone,'设置'); await openApp(phone,'两事'); assert.equal((await like('post-2').textContent()).trim(),'103'); assert.equal(await page.evaluate(()=>startupHarness.likeAnimations.length),1);
    await phone.locator('[data-liangshi-id="post-2"] [aria-label="查看评论"]').click(); assert.equal((await like('post-2').textContent()).trim(),'赞103');
    await phone.getByRole('button',{name:'返回上页',exact:true}).click(); await phone.getByRole('button',{name:'关注',exact:true}).click(); assert.equal((await like('post-2').textContent()).trim(),'103');
    await phone.getByRole('button',{name:'热榜',exact:true}).click(); await phone.locator('.ls-hot-row').click(); assert.equal((await like('post-2').textContent()).trim(),'103');
    await phone.getByRole('button',{name:'返回上页',exact:true}).click(); await phone.getByRole('button',{name:'广场',exact:true}).click();
    assert.equal(requests.length,0); assert.equal(await page.evaluate(()=>startupHarness.metadataSaves),3); assert.equal(await phone.locator('.phone-top-notice').count(),0);
    if(output && kind==='native') {
      const font=(await readFile('/tmp/st-dollars-npc-rewrite-20261017/graph-ui-20261018/diagnostic-assets/NotoSansCJKsc-Regular.otf')).toString('base64');
      await phone.evaluate(async(element,data)=>{const face=new FontFace('PhoneFixtureCJK',`url(data:font/otf;base64,${data})`);await face.load();document.fonts.add(face);const style=document.createElement('style');style.textContent=':host{font-family:PhoneFixtureCJK,sans-serif}';element.shadowRoot.append(style);},font);
      await like('post-2').scrollIntoViewIfNeeded(); await phone.locator('.phone-shell').screenshot({path:resolve(output,'liangshi-like.png')});
    }
    await like('ad').scrollIntoViewIfNeeded(); await like('ad').click(); await waitLiked('ad',true);
    assert.equal(await page.evaluate(()=>startupHarness.metadata.pocketPhone.liangshi.posts.find(post=>post.id==='ad').likes),0);
    await phone.locator('[data-liangshi-id="ad"] [aria-label="查看评论"]').click();
    for(let index=0;index<2;index++){await phone.getByRole('button',{name:'加载更多',exact:true}).click();await phone.getByText(`追加评论${index+1}`,{exact:true}).waitFor();assert.equal(await like('ad').getAttribute('aria-pressed'),'true');}
    await like('ad').click(); await waitLiked('ad',false);
    const final=await page.evaluate(()=>({state:startupHarness.metadata.pocketPhone,saved:startupHarness.persisted.pocketPhone,saves:startupHarness.metadataSaves,animations:startupHarness.likeAnimations,errors:startupHarness.errors}));
    assert.deepEqual(final.state,final.saved); assert.equal(final.state.liangshi.posts.find(post=>post.id==='ad').likes,50000); assert.equal(final.state.liangshi.posts.find(post=>post.id==='ad').reposts.length,2);
    assert.equal(final.state.liangshi.posts.find(post=>post.id==='post-2').likes,102); assert.equal(final.state.liangshi.posts.find(post=>post.id==='post-2').userLiked,true);
    assert.equal(final.animations.length,2); assert.equal(final.saves,7); assert.equal(requests.length,2); assert.deepEqual(final.errors,[]); assert.deepEqual(errors,[]); assert.deepEqual(unexpected,[]);
    results.push({kind,mode,likeClicks:5,likeSaves:5,likeModelRequests:0,moreRequests:2,totalSaves:7,baseCountsPreserved:true,adMoreBase:50000,displayedLike:103,samePostViews:['square','detail','following','topic'],reopenPreserved:true,scrollBefore,scrollAfterLike:scrollBefore,animations:final.animations,reducedMotionAndKeyboard:true,noRenderReplay:true,noLikeNotification:true,errors,unexpected});
    await page.close();
  }
  if(output)await writeFile(resolve(output,'browser-result.json'),JSON.stringify(results,null,2)+'\n');
  console.log(JSON.stringify(results,null,2));
} finally {await browser.close();}
