import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { openApp } from './navigation.mjs';

const root = resolve(import.meta.dirname, '..'), prefix = '/scripts/extensions/third-party/ST-PocketPhone/';
const tools = process.env.POCKET_BROWSER_TOOLS || '/tmp/tmt-hot-browser-20261026', output = process.env.POCKET_MANUAL_TOPIC_OUTPUT;
if (output) await mkdir(output, { recursive: true });
const { chromium } = createRequire(resolve(tools, 'package.json'))('playwright');
const browser = await chromium.launch({ executablePath: process.env.POCKET_CHROMIUM || resolve(tools, 'browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell'), args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: resolve(tools, 'libs/usr/lib/x86_64-linux-gnu') } });
const results = [], mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.ttf':'font/ttf', '.woff2':'font/woff2' };
try {
  for (const [kind, mode] of [['native','standalone'],['luker','embedded']]) {
    const page = await browser.newPage({ viewport: { width:390, height:844 } }); page.setDefaultTimeout(6500);
    const requests = [], errors = [], unexpected = []; let topicCalls = 0, release, started;
    const firstStarted = new Promise(resolve => { started = resolve; });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      if (url.hostname !== '127.0.0.1') { unexpected.push(url.href); return route.abort(); }
      if (path.startsWith(prefix)) return route.fulfill({ path:resolve(root,decodeURIComponent(path.slice(prefix.length))), contentType:mime[extname(path)] || 'application/octet-stream' });
      if (path === '/fixture-font.ttf') return route.fulfill({ path:process.env.POCKET_CJK_FONT || resolve(tools,'NotoSansSC.ttf'), contentType:'font/ttf' });
      if (path === '/lib.js') return route.fulfill({ contentType:mime['.js'], body:'export const showdown={Converter:class{makeHtml(t){return t}}};export const DOMPurify={sanitize:h=>h};' });
      if (path === '/scripts/extensions.js') return route.fulfill({ contentType:mime['.js'], body:"export const extensionTypes={'third-party/ST-PocketPhone':'local'};" });
      if (path === '/scripts/world-info.js') return route.fulfill({ contentType:mime['.js'], body:"export const selected_world_info=[],world_info={};export async function loadWorldInfo(){return {entries:{0:{constant:true,content:'合成城市设定'}}}}" });
      if (path === '/api/extensions/version') return route.fulfill({ json:{ currentBranchName:'main', currentCommitHash:'a'.repeat(40), remoteUrl:'https://github.com/fixture/phone', isUpToDate:true } });
      if (path === '/api/backends/chat-completions/generate') {
        const body = route.request().postDataJSON(), input = JSON.parse(body.messages[1].content); let answer;
        if (input.topic) {
          topicCalls++; requests.push({ type:'topic', outputLimitAbsent:!Object.hasOwn(body,'max_tokens')&&!Object.hasOwn(body,'max_completion_tokens') });
          answer = { accounts:Array.from({length:8},(_,index)=>({key:`a${index}`,name:`读者${index+1}`,handle:`reader${index}`})), posts:Array.from({length:8},(_,index)=>({key:`p${index}`,authorKey:`a${index}`,text:(topicCalls===1?'散场后继续聊。':'再看一遍有了新发现。')+` 第${index+1}位观众聊起了电影里的城市。`,publishedAt:'2031年4月8日 09:20',likes:30,commentCount:25,repostCount:15,comments:[]})) };
          if (topicCalls === 1) await new Promise(resolve => { release=resolve; started(); });
        } else if (input.post) {
          requests.push({type:'more',outputLimitAbsent:!Object.hasOwn(body,'max_tokens')&&!Object.hasOwn(body,'max_completion_tokens')});
          answer = {comments:[{authorId:input.accounts[0].id,text:'看到最后才懂那个镜头。'}],reposts:[{authorId:input.accounts[0].id,text:'这一段值得再看一次。'}]};
        } else throw new Error('Unexpected synthetic model operation');
        return route.fulfill({ json:{choices:[{message:{content:JSON.stringify(answer)}}]} });
      }
      unexpected.push(url.href); return route.abort();
    });
    await page.goto(`http://127.0.0.1:8917${prefix}tests/startup.html?host=${kind}&mode=${mode}`);
    await page.waitForFunction(()=>startupHarness.ready);
    await page.evaluate(()=>{
      const h=startupHarness;h.metadata.pocketPhone.liangshi={accounts:[],posts:[],feedIds:[],topics:[{id:'movie',name:'城市电影夜',description:'街边露天放映散场之后，观众聊起同一部电影里的不同细节。',heat:'12万',postIds:[]}]};
      h.context.saveMetadata=async()=>{h.metadataSaves++;h.persisted=structuredClone(h.metadata);};
    });
    await page.getByRole('button',{name:mode==='embedded'?'打开两三事 · 随卡':'打开两三事',exact:true}).click();
    const phone=page.locator(mode==='embedded'?'#pocket-phone-card-host':'#pocket-phone-host');
    await phone.evaluate(async element=>{const font=new FontFace('PhoneFixtureCJK','url(http://127.0.0.1:8917/fixture-font.ttf)');await font.load();document.fonts.add(font);const style=document.createElement('style');style.textContent=':host{font-family:PhoneFixtureCJK,sans-serif}';element.shadowRoot.append(style);});
    await openApp(phone,'论坛');
    await phone.getByRole('heading',{name:'论坛',exact:true}).waitFor();
    assert.equal(await phone.locator('.forum-intro,.live-mark').count(),0);
    assert.equal(await phone.locator('.empty-state p').count(),0);
    await phone.getByRole('heading',{name:'还没有帖子',exact:true}).waitFor();
    await openApp(phone,'短信');
    await phone.getByRole('heading',{name:'短信',exact:true}).waitFor();
    assert.equal(await phone.locator('[data-contact="lin"]').count(),1);
    await openApp(phone,'ainstgram');
    await phone.getByRole('heading',{name:'ainstgram',exact:true}).waitFor();
    await phone.getByRole('heading',{name:'暂无动态',exact:true}).waitFor();
    await openApp(phone,'日历');
    await phone.getByRole('heading',{name:'日历',exact:true}).waitFor();
    await openApp(phone,'两事');await phone.getByRole('button',{name:'热榜',exact:true}).click();
    await phone.locator('[data-liangshi-hot="movie"]').click();
    await phone.locator('.ls-topic-summary').getByText('城市电影夜',{exact:true}).waitFor();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(requests.length,0,'opening a hot topic only navigates; model generation is explicit');
    assert.equal(await phone.getByRole('button',{name:'加载话题微博',exact:true}).isEnabled(),true);
    if(output&&kind==='native')await phone.locator('.phone-shell').screenshot({path:resolve(output,'topic-before-load.png')});
    await phone.getByRole('button',{name:'加载话题微博',exact:true}).click();await firstStarted;
    assert.equal(requests.length,1);assert.equal(await phone.getByRole('button',{name:'加载中',exact:true}).isDisabled(),true);
    assert.equal(await phone.getByRole('button',{name:'刷新话题微博',exact:true}).isDisabled(),true);
    release();await phone.locator('.ls-post').nth(7).waitFor();
    assert.equal(await phone.locator('.ls-post').count(),8);
    assert.equal(await phone.locator('.ls-header-note').count(),0);
    assert.equal(await phone.locator('.ls-list-end').count(),0);
    if(output&&kind==='native')await phone.locator('.phone-shell').screenshot({path:resolve(output,'topic-loaded.png')});
    await phone.getByRole('button',{name:'返回上页',exact:true}).click();await phone.locator('[data-liangshi-hot="movie"]').click();
    assert.equal(requests.length,1);assert.equal(await phone.locator('.ls-post').count(),8);
    await phone.getByRole('button',{name:'刷新话题微博',exact:true}).click();
    await phone.getByText('再看一遍有了新发现。 第1位观众聊起了电影里的城市。',{exact:true}).waitFor();
    assert.equal(requests.length,2);assert.equal(await phone.locator('.ls-post').count(),8);
    await phone.locator('.ls-post').first().getByRole('button',{name:'查看评论',exact:true}).click();
    await phone.getByRole('button',{name:'加载更多',exact:true}).click();
    await phone.getByText('看到最后才懂那个镜头。',{exact:true}).waitFor();assert.equal(requests.length,3);
    await phone.getByRole('tab',{name:'转发',exact:true}).click();await phone.getByText('这一段值得再看一次。',{exact:true}).waitFor();
    const layouts=[];for(const width of[320,390]){await page.setViewportSize({width,height:844});const layout=await phone.locator('.phone-main').evaluate(node=>({width:node.clientWidth,scrollWidth:node.scrollWidth}));assert.ok(layout.scrollWidth<=layout.width);layouts.push({viewport:width,...layout});}
    const final=await page.evaluate(()=>({saves:startupHarness.metadataSaves,errors:startupHarness.errors}));assert.equal(final.saves,3);assert.deepEqual(final.errors,[]);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
    results.push({kind,mode,openingCalls:0,manualLoadCalls:1,reentryCalls:0,explicitRefreshCalls:1,moreCalls:1,busyDisabled:true,topicPosts:8,plainBoardHeadings:['forum','messages','social','calendar','liangshi'],forumIntroRemoved:true,forumEmptyExplanationRemoved:true,requests,saves:3,layouts,errors,unexpected});await page.close();
  }
  if(output)await writeFile(resolve(output,'browser-result.json'),JSON.stringify(results,null,2)+'\n');
  console.log(JSON.stringify(results,null,2));
} finally {await browser.close();}
