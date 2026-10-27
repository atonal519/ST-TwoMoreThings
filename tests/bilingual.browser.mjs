import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { openApp } from './navigation.mjs';

const root = resolve(import.meta.dirname, '..'), prefix = '/scripts/extensions/third-party/ST-PocketPhone/';
const output = process.env.POCKET_BILINGUAL_OUTPUT;
const previewOnly = process.env.POCKET_BILINGUAL_PREVIEW_ONLY === '1';
if (output) await mkdir(output, { recursive: true });
const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' }, results = [];
try {
  for (const [kind, mode] of previewOnly ? [['native', 'standalone']] : [['native', 'standalone'], ['luker', 'embedded']]) {
    const page = await browser.newPage({ viewport: { width: 391, height: 844 } }); page.setDefaultTimeout(6000);
    const errors = [], unexpected = [], models = [], scripts = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { const path = new URL(request.url()).pathname; if (path.startsWith(prefix) && path.endsWith('.js') && !path.includes('/tests/')) scripts.push(path.slice(prefix.length)); });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      if (url.hostname !== '127.0.0.1') { unexpected.push(url.href); return route.abort(); }
      if (path === prefix + 'tests/startup-harness.js') {
        let body = await readFile(resolve(root, 'tests/startup-harness.js'), 'utf8');
        body = body.replace("if (query.get('host') === 'luker')", `
          const state=h.metadata.pocketPhone,batch={key:JSON.stringify([0,'2031年4月8日','09:30']),label:'当前'};
          state.contacts[0].language='中文';state.contacts.push({id:'zhou',name:'周予',avatar:portrait,language:'中文'},{id:'jp',name:'小野',avatar:portrait,language:'日语'});state.defaultLanguage='中文';
          state.groups[0].memberIds=['lin','jp'];
          state.conversations={lin:[{id:'private-cn',role:'assistant',text:'材料收到了。[合十]',translation:'材料收到了。',read:true,batch}],jp:[{id:'private-jp',role:'assistant',text:'今日は休み。',translation:'今天休息。',read:true,batch}],friends:[{id:'group-cn',role:'assistant',speakerId:'lin',text:'收到。[合十]',translation:'收到。',read:true,batch},{id:'group-canto',role:'assistant',speakerId:'lin',text:'我到咗啦。',translation:'我到了。',replyToId:'group-cn',read:true,batch}]};
          state.social={posts:[{id:'s1',authorId:'lin',text:'今天的排练终于结束了。[翻白眼]',translation:'今天的排练终于结束了。',publishedAt:'2031年4月8日 09:20',comments:[{name:'朋友',text:'辛苦。[合十]',translation:'辛苦。'},{name:'邻居',text:'早啲休息啦。',translation:'早点休息吧。'}]},{id:'s2',authorId:'zhou',text:'材料收到了，辛苦。[合十]',translation:'材料收到了，辛苦。',publishedAt:'2031年4月8日 09:19',comments:[]},{id:'s3',authorId:'jp',text:'今日は休み。',translation:'今天休息。',publishedAt:'2031年4月8日 09:18',comments:[]}],feedIds:['s1','s2','s3'],npcs:[]};
          state.forum={posts:[{id:'p1',title:'街角见闻。',titleTranslation:'街角见闻！',content:'今天的街道很安静。[微笑]',contentTranslation:'今天的街道很安静。',author:'路人',comments:[{author:'邻居',text:'确实。[合十]',translation:'确实。'}]},{id:'p2',title:'静かな朝。',titleTranslation:'安静的早晨。',content:'今日は晴れ。',contentTranslation:'今天晴天。',author:'旅人',comments:[{author:'邻居',text:'いいね。',translation:'真好。'}]}]};
          if (query.get('host') === 'luker')`);
        return route.fulfill({ contentType: 'text/javascript', body });
      }
      if (path.startsWith(prefix)) return route.fulfill({ path: resolve(root, decodeURIComponent(path.slice(prefix.length))), contentType: mime[extname(path)] || 'application/octet-stream' });
      if (path === '/scripts/extensions.js') return route.fulfill({ contentType: 'text/javascript', body: "export const extensionTypes={'third-party/ST-PocketPhone':'local'};" });
      if (path === '/scripts/world-info.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const selected_world_info=[],world_info={};export async function loadWorldInfo(){return {entries:{0:{content:"普通城市生活。"}}}}' });
      if (path === '/api/extensions/version') return route.fulfill({ json: { currentBranchName: 'main', currentCommitHash: 'a'.repeat(40), remoteUrl: 'https://github.com/fixture/phone', isUpToDate: true } });
      if (path === '/api/backends/chat-completions/generate') { models.push(route.request().postDataJSON()); return route.fulfill({ json: { choices: [{ message: { content: '{"messages":[{"text":"普通中文新回复。"}]}' } }] } }); }
      unexpected.push(url.href); return route.abort();
    });
    await page.goto(`http://127.0.0.1:8917${prefix}tests/startup.html?host=${kind}&mode=${mode}`); await page.waitForFunction(() => startupHarness.ready);
    await page.getByRole('button', { name: mode === 'embedded' ? '打开两三事 · 随卡' : '打开两三事', exact: true }).click();
    const phone = page.locator(mode === 'embedded' ? '#pocket-phone-card-host' : '#pocket-phone-host');
    const saved = await page.evaluate(() => JSON.stringify(startupHarness.metadata));
    await openApp(phone, 'ainstgram');
    for (const id of ['s1', 's2']) assert.equal(await phone.locator(`[data-social-post="${id}"] .social-caption .message-translation`).count(), 0);
    assert.equal(await phone.locator('[data-social-post="s1"] .social-comment .message-translation').count(), 1);
    assert.equal(await phone.locator('[data-social-post="s3"] .social-caption .message-translation').count(), 1);
    await phone.locator('[data-social-post="s2"] .social-caption .inline-emoji').scrollIntoViewIfNeeded();
    await page.waitForFunction(id => [...document.querySelector(id).shadowRoot.querySelectorAll('[data-social-post="s1"] .inline-emoji,[data-social-post="s2"] .inline-emoji')].every(image => image.complete && image.naturalWidth > 0), mode === 'embedded' ? '#pocket-phone-card-host' : '#pocket-phone-host');
    const aliasImages = await phone.locator('[data-social-post="s1"] .inline-emoji,[data-social-post="s2"] .inline-emoji').evaluateAll(images => images.map(image => ({ alt: image.alt, src: new URL(image.src).pathname, naturalWidth: image.naturalWidth })));
    assert.ok(aliasImages.some(image => image.alt === '[翻白眼]' && image.naturalWidth > 0));
    assert.ok(aliasImages.some(image => image.alt === '[合十]' && image.naturalWidth > 0));
    await phone.locator('article[data-social-post="s1"]').scrollIntoViewIfNeeded();
    if (output && kind === 'native') {
      const data = (await readFile('/tmp/st-dollars-npc-rewrite-20261017/graph-ui-20261018/diagnostic-assets/NotoSansCJKsc-Regular.otf')).toString('base64');
      await phone.evaluate(async (element, data) => { const font = new FontFace('PhoneFixtureCJK', `url(data:font/otf;base64,${data})`); await font.load(); document.fonts.add(font); const style = document.createElement('style'); style.textContent = ':host{font-family:PhoneFixtureCJK,sans-serif}'; element.shadowRoot.append(style); }, data);
      await phone.screenshot({ path: resolve(output, 'chinese-social.png') });
    }
    if (previewOnly) {
      assert.equal(models.length, 0); assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
      results.push({ kind, mode, knownAliasDuplicatesHidden: 2, aliasImages, modelRequests: 0, errors, unexpected });
      await page.close(); continue;
    }
    await phone.locator('[data-social-post="s1"] [data-social-author]').click();
    assert.equal(await phone.locator('.social-profile-posts .social-caption .message-translation').count(), 0);
    await openApp(phone, '论坛');
    assert.equal(await phone.locator('[data-post="p1"] .message-translation').count(), 0);
    assert.equal(await phone.locator('[data-post="p2"] .message-translation').count(), 2);
    await phone.locator('[data-post="p1"]').click(); assert.equal(await phone.locator('.post-detail .message-translation,.comments .message-translation').count(), 0);
    await openApp(phone, '论坛'); await phone.locator('[data-post="p2"]').click(); assert.equal(await phone.locator('.post-detail .message-translation,.comments .message-translation').count(), 3);
    await openApp(phone, '短信'); await phone.locator('[data-contact="lin"]').click(); assert.equal(await phone.locator('.bubble .message-translation').count(), 0);
    await openApp(phone, '短信'); await phone.locator('[data-contact="jp"]').click(); assert.equal(await phone.locator('.bubble .message-translation').count(), 1);
    await openApp(phone, '短信'); await phone.locator('[data-group="friends"]').click();
    assert.equal(await phone.locator('.message-reply .message-translation').count(), 0); assert.equal(await phone.locator('.bubble .message-translation').count(), 1);
    assert.equal(await page.evaluate(() => JSON.stringify(startupHarness.metadata)), saved, 'browsing existing bilingual records keeps the saved archive unchanged');
    assert.equal(await page.evaluate(() => startupHarness.metadataSaves), 0); assert.equal(models.length, 0);
    await openApp(phone, '短信'); await phone.locator('[data-contact="lin"]').click();
    await phone.getByRole('button', { name: '继续', exact: true }).click(); await phone.getByText('普通中文新回复。', { exact: true }).waitFor();
    assert.equal(models.length, 1); assert.ok(models[0].messages[0].content.includes('两者均省略译文字段')); assert.ok(!models[0].messages[0].content.includes('"translation":'));
    assert.ok(scripts.includes('dist/runtime.js')); assert.ok(!scripts.some(path => path.startsWith('src/')));
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []); assert.deepEqual(await page.evaluate(() => startupHarness.errors), []);
    results.push({ kind, mode, knownAliasDuplicatesHidden: 2, aliasImages, socialCommentsAndProfile: true, forumListAndDetails: true, smsAndGroupQuote: true, cantoneseAndJapaneseTranslationsKept: true, existingArchiveUnchangedDuringBrowsing: true, browsingRequests: 0, mockGenerationRequests: models.length, standardChineseSchemaOmitsTranslation: true, scripts, errors, unexpected });
    await page.close();
  }
  if (output) await writeFile(resolve(output, previewOnly ? 'browser-assets-result.json' : 'browser-result.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
