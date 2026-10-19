import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { openApp } from './navigation.mjs';

const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const output = '/tmp/mobile-plugin-reference-research/social-round';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' },
});
try {
  for (const host of ['native', 'luker']) for (const width of [320, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__font/*', route => {
      const name = basename(new URL(route.request().url()).pathname);
      const file = `${'/tmp/mobile-plugin-reference-research/preview-fonts'}/${name}`;
      return route.fulfill({ path: existsSync(file) ? file : '/tmp/myriad-home-design-20261016/' + name, contentType: 'font/woff2' });
    });
    await page.route('**/user/images/pocket-phone/preview.webp', async route => route.fulfill({ body: Buffer.from(await page.evaluate(() => previewHarness.lastUpload.image), 'base64'), contentType: 'image/webp' }));
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${host}&clock=story`);
    await page.locator('.phone-shell').waitFor();
    const fonts = readFileSync('/tmp/mobile-plugin-reference-research/preview-fonts.css', 'utf8').replaceAll('Nowar Rounded TW Wc', 'PocketPreviewCJK');
    await page.evaluate(css => {
      const face = document.createElement('style'); face.textContent = css; document.head.append(face);
      const style = document.createElement('style'); style.textContent = ':host{font-family:PocketPreviewCJK,sans-serif}';
      document.querySelector('.pocket-phone').shadowRoot.append(style);
      window.drawRequests = [];
      previewHarness.socialBilingual = true;
      window.STBaiBaiImage = { apiVersion: 1, getBackendStatus: () => ({ configured: true, supportsCharacters: true }), getCharacters: () => ({ characters: [] }),
        generate: async request => { drawRequests.push(request); return { path: '/assets/stickers/sepia-1.png', seed: 123 }; } };
    }, fonts);
    await openApp(page, 'ainstgram');
    await page.getByRole('heading', { name: '暂无动态', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 0, '打开动态不自动调用模型');
    assert.equal(await page.evaluate(() => previewHarness.metadataSaves), 0, '打开空动态不改存档');
    await page.getByRole('button', { name: '主页', exact: true }).click();
    await openApp(page, 'ainstgram');
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 0, '重复打开空动态仍等待手动刷新');
    await page.getByRole('button', { name: '刷新动态', exact: true }).click();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.social?.feedIds.length === 5);
    assert.equal(await page.locator('.social-feed .social-post').count(), 5);
    assert.equal(await page.locator('.social-stats').count(), 5);
    assert.equal(await page.locator('.social-comment').count(), 10);
    assert.equal(await page.locator('.social-caption .message-translation').count(), 5);
    assert.equal(await page.locator('.social-comment .message-translation').count(), 10);
    assert.ok((await page.locator('.social-caption .message-original').first().textContent()).includes('coffee'));
    assert.equal(await page.locator('.social-caption .message-translation').first().evaluate(el => getComputedStyle(el).borderTopStyle), 'solid');
    assert.equal(await page.locator('.social-stats button, .social-comments button').count(), 0, '虚拟互动只读');
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 1);
    assert.equal(await page.evaluate(() => drawRequests.length), 0, '刷新动态不自动生图');
    assert.deepEqual(await page.evaluate(() => previewHarness.metadata.foreign), { keep: true });
    const first = await page.locator('.social-post').first().getAttribute('data-social-post');
    const author = await page.locator('.social-author').first().getAttribute('data-social-author');
    const snapshot = await page.evaluate(() => JSON.stringify(previewHarness.metadata.pocketPhone.social.posts.map(({ likes, reposts, comments }) => ({ likes, reposts, comments }))));
    await page.evaluate(async () => { await document.fonts.load('13px PocketPreviewCJK', '动态评论日常咖啡林舟旧书'); await document.fonts.ready; });
    await page.locator('.phone-shell').screenshot({ path: `${output}/${host}-${width}-feed.png` });
    await page.getByRole('button', { name: '生成动态图片', exact: true }).click();
    await page.waitForFunction(id => previewHarness.metadata.pocketPhone.social.posts.find(p => p.id === id)?.image.path, first);
    assert.equal(await page.evaluate(() => drawRequests.length), 1);
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 2, '点击图片才整理绘图提示');
    await page.getByRole('button', { name: '查看动态图片', exact: true }).click();
    await page.locator('.photo-viewer').waitFor();
    assert.equal(await page.evaluate(() => drawRequests.length), 1, '已有图片只查看');
    await page.getByRole('button', { name: '关闭图片', exact: true }).click();
    await page.locator('.social-author').first().click();
    await page.locator('.view-social-profile').waitFor();
    assert.equal(await page.locator('.social-profile-posts .social-post').count(), 1);
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 2, '首次进入人物页不自动生成');
    await page.getByRole('button', { name: '补充个人动态', exact: true }).click();
    await page.waitForFunction(id => previewHarness.metadata.pocketPhone.social.posts.filter(post => post.authorId === id).length === 3, author);
    assert.equal(await page.locator('.social-profile-posts .social-post').count(), 3);
    assert.equal(await page.locator('.social-profile-posts .social-post').first().getAttribute('data-social-post'), first, '补历史不把已有最新动态挤到末尾');
    assert.deepEqual(await page.locator('.social-profile-posts .social-time').allTextContents(), [
      '大陆历1686年10月4日 23:53', '大陆历1686年10月3日 19:05', '大陆历1686年8月5日 10:20',
    ]);
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 3);
    await page.locator('.phone-shell').screenshot({ path: `${output}/${host}-${width}-profile.png` });
    await page.getByRole('button', { name: '返回动态', exact: true }).click();
    assert.equal(await page.locator('.social-feed .social-post').count(), 5);
    assert.equal(await page.locator('.social-feed .social-post').first().getAttribute('data-social-post'), first, '主页仍是每个入选作者最新一条');
    assert.equal(await page.evaluate(() => JSON.stringify(previewHarness.metadata.pocketPhone.social.posts.slice(0, 5).map(({ likes, reposts, comments }) => ({ likes, reposts, comments })))), snapshot);
    await page.locator('.social-author').first().click();
    assert.equal(await page.getByRole('button', { name: '补充个人动态', exact: true }).isEnabled(), true, '已补充过的作者仍可手动补充');
    await page.getByRole('button', { name: '返回动态', exact: true }).click();
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 3, '再访人物页不重复生成');
    await page.getByRole('button', { name: '刷新动态', exact: true }).click();
    await page.waitForFunction(id => previewHarness.metadata.pocketPhone.social.posts.length === 5 && !previewHarness.metadata.pocketPhone.social.posts.some(post => post.id === id), first);
    assert.equal(await page.locator('.social-history').count(), 0, '刷新替换上一批及人物页历史');
    const calls = await page.evaluate(() => previewHarness.requests.length);
    await page.getByRole('button', { name: '主页', exact: true }).click();
    const social = await page.getByRole('button', { name: 'ainstgram', exact: true }).boundingBox();
    const settings = await page.getByRole('button', { name: '设置', exact: true }).boundingBox();
    assert.equal(social.x, settings.x); assert.ok(social.y < settings.y);
    await openApp(page, 'ainstgram');
    assert.equal(await page.evaluate(() => previewHarness.requests.length), calls);
    await page.evaluate(() => {
      const social = previewHarness.metadata.pocketPhone.social;
      const source = social.posts[0];
      social.posts.unshift(...Array.from({ length: 70 }, (_, i) => ({ ...source, id: `older-${i}`, publishedAt: '大陆历1685年1月1日 09:00', image: undefined, text: `更早的动态${i}` })));
      previewHarness.app.open();
    });
    await page.getByRole('button', { name: '查看过去的动态', exact: true }).click();
    await page.getByRole('button', { name: '查看更早的动态', exact: true }).click();
    const older = page.locator('[data-social-post="older-30"] .social-author');
    await older.scrollIntoViewIfNeeded();
    const position = await page.locator('.view-social').evaluate(el => el.scrollTop);
    await older.click();
    await page.getByRole('button', { name: '返回动态', exact: true }).click();
    assert.equal(await page.locator('.social-history .social-post').count(), 60, '作者页返回保留已加载历史');
    assert.ok(Math.abs(await page.locator('.view-social').evaluate(el => el.scrollTop) - position) < 2, '返回总流保留原位置');
    await page.evaluate(() => { previewHarness.metadata.pocketPhone.theme = 'night'; previewHarness.app.open(); });
    assert.equal(await page.locator('.phone-main').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await page.locator('.phone-shell').screenshot({ path: `${output}/${host}-${width}-night.png` });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('ainstgram: native/Luker 320/390; publication-time order and newest-per-author home, month-spanning history, manual updates, bilingual posts/comments, click-only images and retained scroll passed. Mock APIs/storage only.');
} finally { await browser.close(); }
