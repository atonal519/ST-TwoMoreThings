import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { openApp } from './navigation.mjs';
const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const output = '/tmp/mobile-plugin-reference-research/image-provider-round';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
try {
 for (const host of ['native', 'luker']) for (const width of [320, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(8000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__font/*', route => {
   const name = basename(new URL(route.request().url()).pathname), path = '/tmp/mobile-plugin-reference-research/preview-fonts/' + name;
   return route.fulfill({ path: existsSync(path) ? path : '/tmp/myriad-home-design-20261016/' + name, contentType: 'font/woff2' });
  });
  await page.route('**/user/images/pocket-phone/preview.webp', route => route.fulfill({ path: new URL('../assets/stickers/sepia-1.png', import.meta.url).pathname, contentType: 'image/png' }));
  await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${host}&clock=story`);
  await page.locator('.phone-shell').waitFor();
  await page.evaluate(({ css, data }) => {
   const face = document.createElement('style'); face.textContent = css; document.head.append(face);
   const style = document.createElement('style'); style.textContent = ':host{font-family:PocketPreviewCJK,sans-serif}'; document.querySelector('.pocket-phone').shadowRoot.append(style);
   previewHarness.settings['st-chatu8'] = { scriptEnabled: true, mode: 'novelai', cache: '1', characterPresets: {} };
   previewHarness.chatuRequests = []; previewHarness.baibaiDraws = 0;
   previewHarness.context.eventSource.on('generate-image-request', request => {
    previewHarness.chatuRequests.push(request);
    return previewHarness.context.eventSource.emit('generate-image-response', { id: request.id, success: true, imageData: data });
   });
   globalThis.STBaiBaiImage = { apiVersion: 1, getBackendStatus: () => ({ configured: true }), getCharacters: () => ({ characters: [] }), generate: async () => { previewHarness.baibaiDraws++; return { path: '/assets/stickers/sepia-1.png', seed: 3 }; } };
  }, { css: readFileSync('/tmp/mobile-plugin-reference-research/preview-fonts.css', 'utf8').replaceAll('Nowar Rounded TW Wc', 'PocketPreviewCJK'), data: 'data:image/png;base64,' + readFileSync(new URL('../assets/stickers/sepia-1.png', import.meta.url)).toString('base64') });
  await openApp(page, '设置');
  await page.locator('[data-drawer="content"]').click();
  const select = page.getByLabel('生图设置', { exact: true });
  assert.equal(await select.inputValue(), 'baibai', '同时装有两个也保持默认来源');
  assert.deepEqual(await select.locator('option').allTextContents(), ['柏宝绘', '智绘姬']);
  const right = await select.boundingBox(), toggle = await page.locator('#inject-enabled + span').boundingBox();
  assert.ok(Math.abs(right.x + right.width - toggle.x - toggle.width) < 1);
  assert.ok(right.height <= 26, '选择框保持紧凑');
  await select.selectOption('chatu8');
  await page.waitForFunction(() => previewHarness.settings.pocketPhone.imageProvider === 'chatu8');
  await page.evaluate(async () => { await document.fonts.load('13px PocketPreviewCJK', '生图设置柏宝绘智绘姬短信带入正文导出酒馆助手脚本'); await document.fonts.ready; });
  await page.locator('.phone-shell').screenshot({ path: `${output}/${host}-${width}-settings.png` });
  await page.evaluate(() => {
   const history = previewHarness.metadata.pocketPhone.conversations.lin;
   history.push({ id: 'provider-sms', role: 'assistant', type: 'image', image: { description: '窗边的咖啡，无人物' }, batch: history[0].batch });
  });
  await openApp(page, '短信');
  await page.getByRole('button', { name: /林舟/ }).click();
  await page.getByRole('button', { name: '生成图片', exact: true }).click();
  await page.waitForFunction(() => previewHarness.metadata.pocketPhone.conversations.lin.at(-1).image.path);
  assert.equal(await page.evaluate(() => previewHarness.chatuRequests.length), 1);
  assert.equal(await page.evaluate(() => previewHarness.baibaiDraws), 0);
  assert.equal(await page.evaluate(() => previewHarness.lastUpload.format), 'png');
  assert.equal(await page.evaluate(() => previewHarness.settings['st-chatu8'].cache), '1');
  await page.evaluate(() => { previewHarness.metadata.pocketPhone.social = { posts: [{ id: 'provider-post', authorId: 'lin', text: '午后', image: { description: '一杯茶，无人物' } }], npcs: [], feedIds: ['provider-post'] }; });
  await openApp(page, 'ainstgram');
  await page.getByRole('button', { name: '生成动态图片', exact: true }).click();
  await page.waitForFunction(() => previewHarness.metadata.pocketPhone.social.posts[0].image.path);
  assert.equal(await page.evaluate(() => previewHarness.chatuRequests.length), 2);
  await openApp(page, '设置');
  assert.equal(await page.getByLabel('生图设置', { exact: true }).inputValue(), 'chatu8');
  await page.getByLabel('生图设置', { exact: true }).selectOption('baibai');
  await page.waitForFunction(() => previewHarness.settings.pocketPhone.imageProvider === 'baibai');
  await page.evaluate(() => { delete previewHarness.metadata.pocketPhone.social.posts[0].image.path; });
  await openApp(page, 'ainstgram');
  await page.getByRole('button', { name: '生成动态图片', exact: true }).click();
  await page.waitForFunction(() => previewHarness.baibaiDraws === 1);
  assert.equal(await page.evaluate(() => previewHarness.chatuRequests.length), 2, '来源只由手选改变');
  assert.equal(await page.evaluate(() => previewHarness.mainMessages.length), 1, '没有向主楼添加假消息');
  assert.deepEqual(errors, []);
  await page.close();
 }
 console.log('Native/Luker 320/390: compact aligned content selector, explicit source persistence, Chatu8 SMS/social events and local saving, untouched provider cache and BaiBai switching passed. Mock providers only.');
} finally { await browser.close(); }
