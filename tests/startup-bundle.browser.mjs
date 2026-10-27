import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { openApp } from './navigation.mjs';

const root = resolve(import.meta.dirname, '..'), prefix = '/scripts/extensions/third-party/ST-PocketPhone/';
const before = process.env.POCKET_BUNDLE_PHASE === 'before', results = [];
const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
try {
  for (const kind of ['native', 'luker']) for (const mode of ['standalone', 'embedded']) {
    const page = await browser.newPage({ viewport: { width: 391, height: 844 } }); page.setDefaultTimeout(7000);
    const errors = [], failed = [], resources = [], bodies = [], models = []; let releaseReads = 0;
    page.on('pageerror', error => { errors.push(error.message); console.error(`${kind}/${mode}: ${error.message}`); });
    page.on('requestfailed', request => failed.push(request.url()));
    page.on('response', response => {
      const url = new URL(response.url());
      if (!url.pathname.startsWith(prefix) || url.pathname.startsWith(prefix + 'tests/')) return;
      bodies.push((async () => { resources.push({ path: url.pathname.slice(prefix.length), bytes: (await response.body()).length, status: response.status() }); })());
    });
    await (await page.context().newCDPSession(page)).send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      if (url.href === 'https://raw.githubusercontent.com/atonal519/ST-TwoMoreThings/main/release.json') { releaseReads++; return route.fulfill({ json: { version: '0.3.9', sha: 'a'.repeat(40) }, headers: { 'Access-Control-Allow-Origin': '*' } }); }
      if (url.hostname === 'cdn.jsdelivr.net' && path.startsWith('/gh/atonal519/ST-TwoMoreThings@')) {
        const relative = path.split('/').slice(4).join('/');
        return route.fulfill({ path: resolve(root, relative), contentType: mime[extname(path)] || 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' } });
      }
      if (url.hostname !== '127.0.0.1') return route.abort();
      if (path.startsWith(prefix)) return route.fulfill({ path: resolve(root, decodeURIComponent(path.slice(prefix.length))), contentType: mime[extname(path)] || 'application/octet-stream' });
      if (path === '/scripts/extensions.js') return route.fulfill({ contentType: 'text/javascript', body: `export const extensionTypes={'third-party/ST-PocketPhone':'local'};` });
      if (path === '/scripts/world-info.js') return route.fulfill({ contentType: 'text/javascript', body: `export const selected_world_info=[],world_info={};export async function loadWorldInfo(){return {entries:{0:{uid:0,content:'林舟在城里生活。'}}}}` });
      if (path === '/scripts/extensions/regex/engine.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const SCRIPT_TYPES={GLOBAL:0};export const getScriptsByType=()=>[];' });
      if (path === '/scripts/power-user.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const power_user={encode_tags:false};' });
      if (path === '/api/extensions/version') return route.fulfill({ json: { currentBranchName: 'main', currentCommitHash: 'a'.repeat(40), remoteUrl: 'https://github.com/fixture/phone', isUpToDate: true } });
      if (path === '/api/backends/chat-completions/generate') {
        const body = route.request().postDataJSON(); models.push(body); const input = JSON.parse(body.messages[1].content);
        const answer = input.group ? { anchor: { memberIds: ['lin', '@user'], speakerIds: ['lin'] }, messages: [{ speakerId: 'lin', text: '好，在书店见。' }] } : { messages: [{ text: '好，在书店见。' }] };
        return route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(answer) } }] } });
      }
      return route.abort();
    });
    await page.goto(`http://127.0.0.1:8917${prefix}tests/startup.html?host=${kind}&mode=${mode}`);
    await page.waitForFunction(() => startupHarness.ready);
    await Promise.all(bodies);
    const summary = () => ({ requests: resources.length, javascript: resources.filter(item => item.path.endsWith('.js')).length, javascriptBytes: resources.filter(item => item.path.endsWith('.js')).reduce((sum, item) => sum + item.bytes, 0), other: resources.filter(item => !item.path.endsWith('.js')).map(item => ({ path: item.path, bytes: item.bytes })) });
    const startup = summary();
    if (!before) { assert.equal(startup.javascript, 2); assert.equal(resources.some(item => item.path.startsWith('src/')), false); }
    assert.equal(await page.locator(mode === 'embedded' ? '#pocket-phone-card-launch' : '#pocket-phone-launch').count(), 1);
    assert.equal(await page.locator(mode === 'embedded' ? '#tmt-card-fab-host' : '#tmt-fab-host').count(), 1);
    await page.getByRole('button', { name: mode === 'embedded' ? '打开两三事 · 随卡' : '打开两三事', exact: true }).click();
    const phone = page.locator(mode === 'embedded' ? '#pocket-phone-card-host' : '#pocket-phone-host');
    await phone.locator('.phone-shell').waitFor();
    await phone.locator('.home-wallpaper').evaluate(image => image.decode());
    await page.evaluate(() => document.fonts.ready);
    await Promise.all(bodies);
    const opened = summary(), timings = await page.evaluate(() => ({ initializeMs: Math.round(startupHarness.readyAt - startupHarness.startedAt), openMs: Math.round(performance.now() - startupHarness.readyAt) }));
    console.log(`${kind}/${mode}: startup ${startup.requests} resources/${startup.javascript} JS/${startup.javascriptBytes} JS bytes; opened ${opened.requests} resources.`);
    if (!before) {
      assert.equal(await phone.locator('link[rel="stylesheet"]').getAttribute('href'), `http://127.0.0.1:8917${prefix}style.css`);
      assert.equal(await phone.locator('.home-wallpaper').getAttribute('src'), `http://127.0.0.1:8917${prefix}assets/lock-petals-day.png`);
      await openApp(phone, '设置');
      assert.equal(await phone.locator('.app-version').evaluate(row => !row.closest('main')), true, 'previous settings footer work is bundled');
      await phone.getByRole('button', { name: '内容设置', exact: true }).click();
      assert.deepEqual(await phone.locator('#default-language option').allTextContents(), ['自动', '汉语', '英语', '粤语', '日语', '韩语']);
      await phone.getByRole('button', { name: '内容设置', exact: true }).click();
      const api = phone.locator('#api-source'); await api.selectOption(await api.locator('option').evaluateAll(options => options.find(option => option.value && option.value !== 'manual').value));
      await phone.getByRole('switch', { name: '启用两三事', exact: true }).uncheck();
      assert.equal(await page.locator(mode === 'embedded' ? '#tmt-card-fab-host' : '#tmt-fab-host').isVisible(), false);
      await phone.getByRole('switch', { name: '启用两三事', exact: true }).check();
      assert.equal(await page.evaluate(mode => !!quickReplyApi.getSetByName(mode === 'embedded' ? '两三事 · 随卡' : '两三事').qrList.find(item => item.label === '手机'), mode), true);
      for (const selector of ['[data-contact="lin"]', '[data-group="friends"]']) {
        await openApp(phone, '短信'); await phone.locator(selector).click();
        await phone.getByRole('button', { name: '继续', exact: true }).click();
        await phone.getByText('好，在书店见。', { exact: true }).waitFor();
      }
      assert.equal(models.length, 2); assert.ok(models.every(body => body.messages[0].content.includes('无需等用户索要')));
      await phone.getByRole('button', { name: '添加消息', exact: true }).click(); await phone.getByRole('button', { name: '表情', exact: true }).click();
      await phone.locator('.sticker-grid img').first().evaluate(image => image.decode());
      assert.ok((await phone.locator('.sticker-grid img').first().getAttribute('src')).startsWith(`http://127.0.0.1:8917${prefix}assets/stickers/`));
      await openApp(phone, '设置'); await phone.getByRole('button', { name: '导出酒馆助手脚本', exact: true }).click();
      await phone.locator('#export-source').selectOption(mode === 'embedded' ? 'remote' : 'local');
      const snapshot = await page.evaluate(() => JSON.stringify(startupHarness.metadata));
      const downloading = page.waitForEvent('download'); await phone.getByRole('button', { name: '导出', exact: true }).click();
      const download = await downloading, script = JSON.parse(await readFile(await download.path(), 'utf8'));
      assert.equal(await page.evaluate(() => JSON.stringify(startupHarness.metadata)), snapshot, 'export is read-only');
      assert.equal(script.data.twoMoreThings.contacts[0].name, '林舟');
      assert.ok(script.content.includes(mode === 'embedded' ? 'https://cdn.jsdelivr.net/' : `http://127.0.0.1:8917${prefix}embed.js`));
      await page.goto(`http://127.0.0.1:8917${prefix}tests/startup.html?host=${kind}&mode=empty`); await page.waitForFunction(() => startupHarness.ready);
      await page.evaluate(() => { delete startupHarness.metadata.pocketPhone; const iframe = document.createElement('iframe'); iframe.name = 'helper-fixture'; iframe.srcdoc = '<!doctype html><html><body>合成酒馆助手</body></html>'; document.body.append(iframe); });
      const helper = page.frameLocator('iframe[name="helper-fixture"]'); await helper.locator('body').waitFor();
      await helper.locator('body').evaluate((body, script) => { globalThis.getVariables = () => script.data; new Function(script.content)(); }, script);
      await page.getByRole('button', { name: '打开两三事 · 随卡', exact: true }).waitFor();
      await page.getByRole('button', { name: '打开两三事 · 随卡', exact: true }).click();
      const imported = page.locator('#pocket-phone-card-host'); await openApp(imported, '短信');
      await imported.locator('[data-contact="card:contact-1"]').waitFor();
      assert.equal(await page.locator('#pocket-phone-launch').count(), 0, 'serialized helper mounts embedded only');
      assert.equal(releaseReads, mode === 'embedded' ? 1 : 0, 'remote helper reads one release; local helper reads none');
      await download.delete();
    }
    await Promise.all(bodies);
    assert.deepEqual(errors, []); assert.deepEqual(failed, []); assert.ok(resources.every(item => item.status === 200));
    results.push({ kind, mode, startup, opened, timings, mockModels: models.length, exportedHelper: before ? 'not run' : mode === 'embedded' ? 'remote SHA helper in parent realm' : 'local helper in parent realm', releaseReads });
    await page.close();
  }
  if (process.env.POCKET_BUNDLE_RESULT) await writeFile(process.env.POCKET_BUNDLE_RESULT, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify({ phase: before ? 'before' : 'after', results }, null, 2));
} finally { await browser.close(); }
