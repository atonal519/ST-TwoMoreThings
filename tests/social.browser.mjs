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
    await page.waitForFunction(() => previewHarness.metadataSaves === 1);
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
    assert.equal(await page.evaluate(() => previewHarness.metadataSaves), 1, '打开空动态只保留首开联系人补图，不额外改存档');
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
    assert.equal(await page.locator('.social-like').count(), 5, '每条动态提供点赞按钮');
    assert.equal(await page.locator('.social-comment-toggle').count(), 5, '每条动态提供紧凑留言入口');
    assert.equal(await page.locator('.social-stats > span').count(), 5, '转发统计仍只读');
    const like = page.locator('.social-like').first();
    const likeId = await like.getAttribute('data-social-post');
    const baseLikes = await page.evaluate(id => previewHarness.metadata.pocketPhone.social.posts.find(post => post.id === id).likes, likeId);
    assert.equal(await like.locator('svg > path').evaluate(path => getComputedStyle(path).fill), 'none', '未点赞心形保持空心');
    await like.click();
    await page.waitForFunction(id => previewHarness.metadata.pocketPhone.social.posts.find(post => post.id === id).userLiked === true, likeId);
    assert.equal(await like.getAttribute('aria-pressed'), 'true');
    assert.equal((await like.textContent()).trim(), `${baseLikes + 1} 赞`);
    assert.equal(await like.locator('svg > path').evaluate(path => getComputedStyle(path).fill), 'rgb(214, 69, 69)', '点赞心形使用红色填充');
    assert.equal(await like.locator('svg > path').evaluate(path => getComputedStyle(path).fill === getComputedStyle(path).color), true, '点赞心形填充跟随红色图标色');
    assert.equal(await like.evaluate(button => getComputedStyle(button).color === getComputedStyle(button.querySelector('svg')).color), false, '点赞数字保持原文字色');
    await page.locator('#pocket-phone-host').evaluate(host => { host.dataset.theme = 'night'; });
    assert.equal(await like.locator('svg > path').evaluate(path => getComputedStyle(path).fill), 'rgb(255, 118, 108)', '夜间也显示红心');
    await page.locator('#pocket-phone-host').evaluate(host => { host.dataset.theme = 'day'; });
    await like.click();
    await page.waitForFunction(id => previewHarness.metadata.pocketPhone.social.posts.find(post => post.id === id).userLiked === false, likeId);
    assert.equal(await like.getAttribute('aria-pressed'), 'false');
    assert.equal(await like.locator('svg > path').evaluate(path => getComputedStyle(path).fill), 'none', '取消点赞恢复空心');
    assert.equal((await like.textContent()).trim(), `${baseLikes} 赞`);
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 1, '点赞和取消不调用模型');
    await page.locator('.social-comment-toggle').first().click();
    assert.equal(await page.locator('.social-comment-form').count(), 1, '留言表单按需展开');
    await page.locator('.social-comment-form textarea').fill('保留这段留言草稿');
    await page.getByRole('button', { name: '主页', exact: true }).click();
    await openApp(page, 'ainstgram');
    assert.equal(await page.locator('.social-comment-form textarea').inputValue(), '保留这段留言草稿', '留言草稿按动态保留');
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

    const commentPost = await page.locator('.social-feed .social-post').first().getAttribute('data-social-post');
    await page.locator(`[data-social-post="${commentPost}"] .social-comment-toggle`).click();
    await page.locator(`[data-social-post="${commentPost}"] .social-comment-form textarea`).fill('我也喜欢这段日常。');
    const beforeComment = await page.evaluate(id => {
      const h = previewHarness, post = h.metadata.pocketPhone.social.posts.find(item => item.id === id);
      h.reply = { comments: [{ authorId: post.authorId, text: 'I saw your comment.', translation: '看到你的留言啦。' }],
        proactiveMessages: [{ contactId: post.authorId, messages: [{ text: '你也看到了。' }] }] };
      return { requests: h.requests.length, saves: h.metadataSaves, count: post.commentsCount, date: post.publishedAt, authorId: post.authorId, sms: h.metadata.pocketPhone.conversations[post.authorId] || [] };
    }, commentPost);
    await page.locator(`[data-social-post="${commentPost}"] .social-comment-send`).click();
    await page.waitForFunction(id => previewHarness.metadata.pocketPhone.social.posts.find(post => post.id === id)?.comments.some(comment => comment.text === 'I saw your comment.'), commentPost);
    const commentArticle = page.locator(`[data-social-post="${commentPost}"]`);
    assert.equal(await commentArticle.getByText('I saw your comment.', { exact: true }).count(), 1);
    assert.equal(await commentArticle.getByText('看到你的留言啦。', { exact: true }).count(), 1);
    assert.equal(await commentArticle.locator('textarea').inputValue(), '');
    assert.equal(await page.evaluate(() => previewHarness.requests.length), beforeComment.requests + 1);
    assert.equal(await page.evaluate(() => previewHarness.metadataSaves), beforeComment.saves + 2);
    const savedComment = await page.evaluate(({ id, authorId }) => {
      const state = previewHarness.metadata.pocketPhone, post = state.social.posts.find(item => item.id === id);
      return { count: post.commentsCount, date: post.publishedAt, sms: state.conversations[authorId] || [] };
    }, { id: commentPost, authorId: beforeComment.authorId });
    assert.equal(savedComment.count, beforeComment.count + 2);
    assert.equal(savedComment.date, beforeComment.date);
    assert.deepEqual(savedComment.sms, beforeComment.sms);
    await page.locator('.phone-shell').screenshot({ path: `${output}/${host}-${width}-comment.png` });
    await page.locator(`[data-social-post="${commentPost}"] .social-author`).click();
    assert.equal(await page.locator(`[data-social-post="${commentPost}"]`).getByText('I saw your comment.', { exact: true }).count(), 1, '人物页引用同一份已保存评论');
    await page.getByRole('button', { name: '返回动态', exact: true }).click();
    await page.evaluate(() => { previewHarness.reply = 'not JSON'; });
    if (!await commentArticle.locator('textarea').isVisible()) await commentArticle.locator('.social-comment-toggle').click();
    await commentArticle.locator('textarea').fill('模型失败时留言仍然发布');
    await commentArticle.locator('.social-comment-send').click();
    await page.getByRole('alert').waitFor();
    assert.equal(await commentArticle.locator('textarea').inputValue(), '');
    assert.equal(await commentArticle.getByText('模型失败时留言仍然发布', { exact: true }).count(), 1);
    const unchanged = await page.evaluate(() => JSON.stringify(previewHarness.metadata));
    await page.evaluate(() => {
      previewHarness.reply = { comments: [] };
      previewHarness.originalSaveMetadata = previewHarness.context.saveMetadata;
      previewHarness.context.saveMetadata = async () => { throw new Error('保存失败'); };
    });
    await commentArticle.locator('textarea').fill('保存失败时保留草稿');
    await commentArticle.locator('.social-comment-send').click();
    await page.getByRole('alert').filter({ hasText: '保存失败' }).waitFor();
    assert.equal(await commentArticle.locator('textarea').inputValue(), '保存失败时保留草稿');
    assert.equal(await page.evaluate(() => JSON.stringify(previewHarness.metadata)), unchanged);
    await page.evaluate(() => {
      previewHarness.context.saveMetadata = previewHarness.originalSaveMetadata;
      previewHarness.reply = null;
    });
    await page.evaluate(() => { previewHarness.metadata.pocketPhone.theme = 'night'; previewHarness.app.open(); });
    assert.equal(await page.locator('.phone-main').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await page.locator('.phone-shell').screenshot({ path: `${output}/${host}-${width}-night.png` });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('ainstgram: native/Luker 320/390; manual feed/history, bilingual text/images, immediate comments and later replies/SMS in one call, failed reply retains published comment, failed initial save retains draft, shared author page, and scroll passed. Mock APIs/storage only.');
} finally { await browser.close(); }
