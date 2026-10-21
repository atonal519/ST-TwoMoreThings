import { openApp } from './navigation.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
const failures = [];
const check = (label, value) => { if (!value) failures.push(label); };
try {
 for (const width of [320, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(10000);
  await page.goto('http://127.0.0.1:8917/tests/preview.html');
  await page.locator('.phone-shell').waitFor();
  if (process.env.POCKET_CJK_CSS) {
   await page.route('**/__font/*.woff2', route => { const name=basename(new URL(route.request().url()).pathname), local=`/tmp/mobile-plugin-reference-research/preview-fonts/${name}`; return route.fulfill({path:existsSync(local)?local:`/tmp/myriad-home-design-20261016/${name}`,contentType:'font/woff2'}); });
   const css=readFileSync(process.env.POCKET_CJK_CSS,'utf8').replaceAll('Nowar Rounded TW Wc','PocketPreviewCJK');
   await page.evaluate(css => { const docStyle=document.createElement('style');docStyle.textContent=css;document.head.append(docStyle);const style=document.createElement('style');style.textContent=':host {font-family:PocketPreviewCJK,sans-serif}';document.querySelector('.pocket-phone').shadowRoot.append(style); },css);
   await page.evaluate(async()=>{await document.fonts.load('15px PocketPreviewCJK','小手机短信论坛林舟星期六');await document.fonts.ready;});
  }
  async function aligned(action) {
   return page.locator(`[data-action="${action}"]`).evaluate(button => {
    const root=button.getRootNode(), title=root.querySelector('.page-heading h1').getBoundingClientRect(), b=button.getBoundingClientRect();
    const status=root.querySelector('.phone-status').getBoundingClientRect(), close=root.querySelector('[data-action="close"]').getBoundingClientRect(), home=root.querySelector('[data-action="system-home"]').getBoundingClientRect();
    return Math.abs(title.y+title.height/2-b.y-b.height/2)<1 && close.left>=home.right && Math.abs(close.y-home.y)<1 && status.bottom<=title.top;
   });
  }
  await openApp(page, '短信');
  check(`${width}: 通讯录操作与短信标题同行，关闭在底部主页旁`, await aligned('inbox-menu'));
  await openApp(page, '论坛');
  check(`${width}: 刷新与论坛标题同行，关闭在底部主页旁`, await aligned('refresh'));
  await openApp(page, '短信');
  await page.getByRole('button', { name:/林舟/ }).click();
  const row=page.getByRole('log').locator('.message-row').nth(1);
  const before=await row.boundingBox();
  await row.locator('.bubble').click();
  const remove=page.getByRole('button', { name:'删除这条短信',exact:true });
  check(`${width}: 删除在气泡内侧小菜单，图标与短标签清楚可见`, await remove.evaluate(button => {
   const row=button.closest('.message-row'), bubble=row.querySelector('.bubble').getBoundingClientRect(), menu=button.closest('.message-actions').getBoundingClientRect(), svg=button.querySelector('svg').getBoundingClientRect(), feed=row.closest('.message-feed').getBoundingClientRect();
   const inside=row.classList.contains('is-mine') ? menu.right<=bubble.left : menu.x>=bubble.right;
   return button.textContent.trim()==='删除' && svg.width===14 && inside && menu.right<=feed.right && menu.left>=feed.left && Math.abs(menu.y+menu.height/2-(bubble.y+bubble.height/2))<1;
  }));
  check(`${width}: 点击短消息不应插入一块按钮并增高消息`, Math.abs((await row.boundingBox()).height-before.height)<1);
  await page.getByRole('button', { name:'聊天选项',exact:true }).click();
  check(`${width}: 打开聊天菜单收起单条删除操作`, await remove.count()===0);
  await page.evaluate(() => { previewHarness.metadata.pocketPhone.conversations.lin.push(...Array.from({length:20},(_,i)=>({batch:previewHarness.metadata.pocketPhone.conversations.lin[0].batch,id:`layout-pad-${i}`,role:i%2?'user':'assistant',text:'查看较长聊天记录的排版。',timeLabel:'23:58'})),{ batch:previewHarness.metadata.pocketPhone.conversations.lin[0].batch, id:'layout-long',role:'assistant',text:'On my way. See you at the bookstore.',translation:'我在路上，书店见。',timeLabel:'23:58' }); });
  await openApp(page, '短信');
  await page.getByRole('button', { name:/林舟/ }).click();
  const last=page.getByRole('log').locator('.message-row').last();
  await last.locator('.bubble').click();
  check(`${width}: 展开长气泡的垃圾桶后时间仍在可见区`, await last.evaluate(row => {
   const feed=row.closest('.message-feed').getBoundingClientRect(), time=row.querySelector('time').getBoundingClientRect(); return time.bottom<=feed.bottom && time.top>=feed.top;
  }));
  check(`${width}: 页面不横向溢出`, !await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
  check(`${width}: 外观操作不调用模型或写存档`, await page.evaluate(()=>previewHarness.requests.length===0 && previewHarness.metadataSaves===0));
  await page.close();
 }
 assert.deepEqual(failures, []);
 console.log('Title/action alignment, compact adjacent message menu, menu exclusivity and mobile bounds passed. UI only; no generation or persistence changes.');
} finally { await browser.close(); }
