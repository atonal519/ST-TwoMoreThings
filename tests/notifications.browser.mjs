import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { openApp } from './navigation.mjs';

const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const output = '/home/admin/sillytavern/data/codex-private/tmt-social-notifications';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
try {
  for (const host of ['native', 'luker']) for (const width of [320, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__font/*', route => {
      const name = basename(new URL(route.request().url()).pathname), candidate = '/tmp/mobile-plugin-reference-research/preview-fonts/' + name;
      return route.fulfill({ path: existsSync(candidate) ? candidate : '/tmp/myriad-home-design-20261016/' + name, contentType: 'font/woff2' });
    });
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${host}&group=1`);
    await page.locator('.phone-shell').waitFor();
    await page.evaluate(({ css, theme }) => {
      const face = document.createElement('style'); face.textContent = css; document.head.append(face);
      const style = document.createElement('style'); style.textContent = ':host{font-family:PocketPreviewCJK,sans-serif}'; document.querySelector('.pocket-phone').shadowRoot.append(style);
      previewHarness.metadata.pocketPhone.theme = theme; previewHarness.app.open();
    }, { css: readFileSync('/tmp/mobile-plugin-reference-research/preview-fonts.css', 'utf8').replaceAll('Nowar Rounded TW Wc', 'PocketPreviewCJK'), theme: width === 390 ? 'night' : 'day' });
    await page.evaluate(async () => { await document.fonts.load('14px PocketPreviewCJK', '短信通知回复林舟'); await document.fonts.ready; });
    await openApp(page, 'ainstgram');
    await page.getByRole('button', { name: '刷新动态', exact: true }).click();
    await page.locator('.social-post').first().waitFor();
    const postId = await page.locator('.social-post').first().getAttribute('data-social-post');
    const article = page.locator(`[data-social-post="${postId}"].social-post`);
    async function hold(reply) {
      return page.evaluate(reply => {
        previewHarness.reply = reply;
        previewHarness.replyWait = new Promise(resolve => { previewHarness.releaseReply = resolve; });
        return previewHarness.requests.length;
      }, reply);
    }
    async function release() { await page.evaluate(() => { previewHarness.releaseReply(); previewHarness.replyWait = null; }); }
    const authorId = await page.evaluate(id => previewHarness.metadata.pocketPhone.social.posts.find(post => post.id === id).authorId, postId);
    await article.locator('.social-comment-toggle').click();
    await article.locator('textarea').fill('先发出来，我去逛别的。');
    const calls = await hold({ comments: [{ authorId, text: '看见你的留言啦。' }] });
    await article.locator('.social-comment-send').click();
    await page.waitForFunction(count => previewHarness.requests.length === count + 1, calls);
    await article.getByText('先发出来，我去逛别的。', { exact: true }).waitFor();
    assert.equal(await article.locator('textarea').inputValue(), '', 'published comment clears its draft before the model finishes');
    assert.equal(await article.getByText('看见你的留言啦。', { exact: true }).count(), 0);
    await openApp(page, '日历');
    await release();
    await page.locator('.phone-top-notice').filter({ hasText: '回复了你' }).waitFor();
    assert.equal(await page.locator('.view-calendar').isVisible(), true, 'reply completion does not navigate away from the current app');
    assert.equal(await page.evaluate(() => previewHarness.requests.length), calls + 1, 'posting and notifying use only the original model request');
    await page.locator('.phone-shell').screenshot({ path: `${output}/${host}-${width}-reply-push.png` });
    await page.locator('[data-action="open-phone-notice"]').click();
    await page.locator('.view-social-profile').waitFor();
    await article.getByText('看见你的留言啦。', { exact: true }).waitFor();
    await page.waitForFunction(id => previewHarness.metadata.pocketPhone.social.posts.find(post => post.id === id).comments.every(comment => comment.read !== false), postId);

    await article.locator('.social-comment-toggle').click();
    await article.locator('textarea').fill('关手机后也留着我的评论。');
    await hold({ comments: [{ name: '路人朋友', text: '回来记得看这里。' }] });
    await article.locator('.social-comment-send').click();
    await article.getByText('关手机后也留着我的评论。', { exact: true }).waitFor();
    await page.getByRole('button', { name: '关闭手机', exact: true }).click();
    await release();
    await page.waitForFunction(id => previewHarness.metadata.pocketPhone.social.posts.find(post => post.id === id).comments.some(comment => comment.text === '回来记得看这里。'), postId);
    assert.equal(await page.locator('.phone-top-notice').isVisible(), false, 'no push leaks outside the closed phone');
    await page.evaluate(() => previewHarness.app.open());
    await page.locator('.lock-notification[data-action="open-social-reply"]').waitFor();
    await page.locator('.lock-notification[data-action="open-social-reply"]').click();
    await page.locator('.view-social-profile').waitFor();
    await article.getByText('回来记得看这里。', { exact: true }).waitFor();

    await openApp(page, '短信');
    await page.locator('[data-contact="lin"]').click();
    await page.getByRole('textbox', { name: '短信内容', exact: true }).fill('我的草稿');
    const smsCalls = await hold({ messages: [{ text: '这是稍后到的短信。' }] });
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.waitForFunction(count => previewHarness.requests.length === count + 1, smsCalls);
    await openApp(page, '设置');
    await release();
    await page.locator('.phone-top-notice').filter({ hasText: '这是稍后到的短信。' }).waitFor();
    await page.locator('[data-action="open-phone-notice"]').click();
    await page.locator('.view-chat').waitFor();
    assert.equal(await page.getByRole('textbox', { name: '短信内容', exact: true }).inputValue(), '我的草稿');
    assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.conversations.lin.at(-1).read), true);
    assert.equal(await page.locator('.phone-top-notice').count(), 0);

    const samePageCalls = await hold({ messages: [{ text: '就在当前会话收到。' }] });
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.waitForFunction(count => previewHarness.requests.length === count + 1, samePageCalls);
    await release();
    await page.getByText('就在当前会话收到。', { exact: true }).waitFor();
    assert.equal(await page.locator('.phone-top-notice').count(), 0, 'a reply in the current SMS page does not push');

    await openApp(page, '短信');
    await page.locator('[data-group="preview-friends"]').click();
    const groupCalls = await hold({ anchor: { memberIds: ['lin', 'zhou', '@user'], speakerIds: ['zhou'] }, messages: [{ speakerId: 'zhou', text: '群里的新消息。' }] });
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.waitForFunction(count => previewHarness.requests.length === count + 1, groupCalls);
    await openApp(page, '设置');
    await release();
    await page.locator('.phone-top-notice').filter({ hasText: '群里的新消息。' }).waitFor();
    await page.locator('[data-action="open-phone-notice"]').click();
    await page.locator('.view-group-chat').waitFor();

    await openApp(page, '论坛');
    const forumCalls = await hold({ posts: [{ category: '日常', author: '路人', title: '新来的论坛帖子', content: '新的话题。', comments: [] }] });
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await page.waitForFunction(count => previewHarness.requests.length === count + 1, forumCalls);
    await openApp(page, '设置');
    await release();
    await page.locator('.phone-top-notice').filter({ hasText: '论坛有新内容' }).waitFor();
    await page.locator('[data-action="open-phone-notice"]').click();
    await page.locator('.view-forum').getByText('新来的论坛帖子', { exact: true }).waitFor();

    await openApp(page, 'ainstgram');
    const feedCalls = await hold(null);
    await page.getByRole('button', { name: '刷新动态', exact: true }).click();
    await page.waitForFunction(count => previewHarness.requests.length === count + 1, feedCalls);
    await openApp(page, '日历');
    await release();
    await page.locator('.phone-top-notice').filter({ hasText: 'ainstgram已更新' }).waitFor();
    const mainBox = await page.locator('.phone-main').boundingBox(), banner = await page.locator('.phone-top-notice').boundingBox(), shell = await page.locator('.phone-shell').boundingBox();
    assert.ok(banner.x >= shell.x && banner.x + banner.width <= shell.x + shell.width && banner.y < mainBox.y + 40, 'push stays at the top inside the phone');
    await page.locator('[data-action="dismiss-phone-notice"]').click();
    assert.equal(await page.locator('.view-calendar').isVisible(), true);
    assert.equal(await page.locator('.phone-top-notice').count(), 0);
    await openApp(page, 'ainstgram');
    await page.locator('.social-author').first().click();
    const profileCalls = await hold(null);
    await page.getByRole('button', { name: '补充个人动态', exact: true }).click();
    await page.waitForFunction(count => previewHarness.requests.length === count + 1, profileCalls);
    await openApp(page, '设置');
    await release();
    await page.locator('.phone-top-notice').filter({ hasText: '的动态已更新' }).waitFor();
    await page.locator('[data-action="open-phone-notice"]').click();
    await page.locator('.view-social-profile').waitFor();
    const samePost = page.locator('.social-post').first(), samePostId = await samePost.getAttribute('data-social-post');
    await samePost.locator('.social-comment-toggle').click();
    await samePost.locator('textarea').fill('我在这里等回复。');
    const samePostCalls = await hold({ comments: [{ name: '朋友', text: '在当前动态看见回应。' }] });
    await samePost.locator('.social-comment-send').click();
    await page.waitForFunction(count => previewHarness.requests.length === count + 1, samePostCalls);
    await release();
    await samePost.getByText('在当前动态看见回应。', { exact: true }).waitFor();
    assert.equal(await page.locator('.phone-top-notice').count(), 0, 'a reply visible in the current post does not push');
    assert.equal(await page.evaluate(id => previewHarness.metadata.pocketPhone.social.posts.find(post => post.id === id).comments.at(-1).read, samePostId), true);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Native/Luker 320/390: immediate persisted comments, one model call, navigation during reply, internal clickable pushes for replies/SMS/forum/feed, drafts, read state and lockscreen replies passed. Mock hosts/models only.');
} finally { await browser.close(); }
