import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { openApp } from './navigation.mjs';
const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const output = '/tmp/mobile-plugin-reference-research/image-cleanup-round';
mkdirSync(output, { recursive: true });
const image = id => `/user/images/柏宝绘_朋友/bbi_abc_0_hash-${id}.png`;
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
try {
  for (const host of ['native', 'luker']) for (const width of [320, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(8000);
    const gone = new Set([image('gone')]), probes = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/user/images/**', route => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname);
      if (route.request().method() === 'HEAD') probes.push(path);
      // fresh图的GET继续模拟浏览器缓存，只有绕过缓存的HEAD能识别文件已删。
      const missing = gone.has(path) && (route.request().method() === 'HEAD' || path.endsWith('-gone.png'));
      return missing ? route.fulfill({ status: 404 }) : route.fulfill({ body: readFileSync(new URL('../assets/stickers/sepia-1.png', import.meta.url)), contentType: 'image/png' });
    });
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${host}&clock=story`);
    await page.locator('.phone-shell').waitFor();
    await page.evaluate(path => {
      previewHarness.metadata.pocketPhone.social = { posts: [{ id: 'broken', authorId: 'lin', text: '今天的咖啡。', image: { description: '窗边的一杯咖啡，无人物。', path, seed: 2 }, publishedAt: '大陆历1686年10月4日 23:53' }], npcs: [], feedIds: ['broken'] };
      previewHarness.drawings = 0;
      globalThis.STBaiBaiImage = { apiVersion: 1, getBackendStatus: () => ({ configured: true }), getCharacters: () => ({ characters: [] }), generate: async () => ({ path: `/user/images/柏宝绘_朋友/bbi_abc_0_hash-fresh${++previewHarness.drawings}.png`, seed: 9 }) };
    }, image('gone'));
    await openApp(page, 'ainstgram');
    await page.waitForFunction(() => !previewHarness.metadata.pocketPhone.social.posts[0].image.path);
    assert.deepEqual(await page.evaluate(() => previewHarness.metadata.pocketPhone.social.posts[0].image), { description: '窗边的一杯咖啡，无人物。' });
    assert.equal(await page.locator('.social-photo img').count(), 0);
    assert.equal(await page.getByRole('button', { name: '生成动态图片', exact: true }).isEnabled(), true);
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 0, '确认缺图不会调用模型或生图');
    assert.ok(probes.includes(image('gone')));
    await page.getByRole('button', { name: '生成动态图片', exact: true }).click();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.social.posts[0].image.path?.endsWith('fresh1.png'));
    await page.locator('.social-photo img').evaluate(img => img.decode());
    gone.add(image('fresh1'));
    await openApp(page, 'ainstgram');
    await page.waitForFunction(() => !previewHarness.metadata.pocketPhone.social.posts[0].image.path);
    assert.equal(await page.evaluate(() => previewHarness.drawings), 1, '重新打开会发现已删文件，但不会自行重生');
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 1);
    await page.locator('.phone-shell').screenshot({ path: `${output}/${host}-${width}-recovered.png` });
    await page.getByRole('button', { name: '生成动态图片', exact: true }).click();
    await page.waitForFunction(() => previewHarness.drawings === 2 && previewHarness.metadata.pocketPhone.social.posts[0].image.path?.endsWith('fresh2.png'));
    await page.locator('.social-author').click();
    await page.getByRole('button', { name: '补充个人动态', exact: true }).click();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.social.posts.length === 3);
    await page.getByRole('button', { name: '返回动态', exact: true }).click();
    await page.getByRole('button', { name: '刷新动态', exact: true }).click();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.social.posts.length === 5 && !previewHarness.metadata.pocketPhone.social.posts.some(post => post.id === 'broken'));
    await page.waitForFunction(() => previewHarness.fileDeletes.some(item => item.path.endsWith('fresh2.json')));
    assert.equal(await page.locator('.social-history').count(), 0, '刷新移除上一批及人物历史');
    assert.equal(await page.evaluate(() => previewHarness.fileDeletes.filter(item => item.path.endsWith('fresh2.png')).length), 1);
    await page.evaluate(path => {
      const history = previewHarness.metadata.pocketPhone.conversations.lin;
      history.push({ id: 'sms-photo', role: 'assistant', type: 'image', image: { description: '书桌上的一杯茶。', path, seed: 1 }, batch: history[0].batch });
    }, image('sms'));
    await openApp(page, '短信');
    await page.getByRole('button', { name: /林舟/ }).click();
    await page.getByRole('button', { name: '图片消息操作', exact: true }).click();
    await page.getByRole('button', { name: '删除这条短信', exact: true }).click();
    await page.waitForFunction(() => !previewHarness.metadata.pocketPhone.conversations.lin.some(message => message.id === 'sms-photo'));
    await page.waitForFunction(() => previewHarness.fileDeletes.some(item => item.path.endsWith('sms.json')));
    await openApp(page, '设置');
    await page.locator('[data-drawer="appearance"]').click();
    assert.equal(await page.locator('[data-wallpaper^="builtin:"]').count(), 1);
    assert.equal(await page.getByRole('button', { name: '湖蓝玻璃', exact: true }).count(), 1);
    const special = '/user/images/柏宝绘_A#100%23/bbi_abc_0_hash-special.png';
    await page.evaluate(path => {
      previewHarness.metadata.pocketPhone.social = { posts: [{ id: 'special', authorId: 'lin', text: '特殊目录', image: { description: '咖啡', path } }], npcs: [], feedIds: ['special'] };
    }, special);
    await openApp(page, 'ainstgram');
    await page.locator('.social-photo img').evaluate(img => img.decode());
    assert.equal(await page.locator('.social-photo img').getAttribute('src'), special.split('/').map(encodeURIComponent).join('/'));
    assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.social.posts[0].image.path), special);
    await page.getByRole('button', { name: '查看动态图片', exact: true }).click();
    await page.locator('.photo-viewer img').evaluate(img => img.decode());
    await page.getByRole('button', { name: '关闭图片', exact: true }).click();
    await page.evaluate(() => {
      previewHarness.metadata.pocketPhone.conversations.lin.unshift({ id: 'past-photo', role: 'assistant', type: 'image', read: true, text: '过去的茶杯', image: { description: '木桌上的一只茶杯，无人物。' }, batch: { key: 'past', label: '过去' }, storyDate: '大陆历1686年9月1日', timeLabel: '12:30' });
    });
    await openApp(page, '短信');
    await page.getByRole('button', { name: /林舟/ }).click();
    await page.getByRole('button', { name: '查看过去', exact: true }).click();
    const past = page.locator('[data-photo="past-photo"]');
    assert.equal(await past.isEnabled(), true);
    await past.click();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.conversations.lin.find(message => message.id === 'past-photo').image.path);
    assert.deepEqual(await page.evaluate(() => {
      const saved = previewHarness.metadata.pocketPhone.conversations.lin.find(message => message.id === 'past-photo');
      return [saved.batch.key, saved.storyDate, saved.timeLabel, saved.text];
    }), ['past', '大陆历1686年9月1日', '12:30', '过去的茶杯']);
    const failed = image('savefailed'); gone.add(failed);
    await page.evaluate(path => {
      previewHarness.metadata.pocketPhone.social = { posts: [{ id: 'failed', authorId: 'lin', text: '保存失败测试', image: { description: '咖啡', path } }], npcs: [], feedIds: ['failed'] };
      previewHarness.context.saveMetadata = async () => { throw new Error('模拟保存失败'); };
    }, failed);
    // 模拟确实损坏的GET，检查保存失败的提示不会反复重挂破图。
    await page.route('**/user/images/**savefailed.png', route => route.fulfill({ status: 404 }));
    await openApp(page, 'ainstgram');
    await page.getByRole('alert').filter({ hasText: '保存失败' }).waitFor();
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.social.posts[0].image.path), failed);
    assert.equal(await page.locator('.social-photo img').count(), 1);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Native/Luker 320/390: removed/cached image recovery, explicit regeneration, whole-feed/history cleanup, SMS/image/sidecar deletion and one wallpaper pair passed. Mock files/models only.');
} finally { await browser.close(); }
