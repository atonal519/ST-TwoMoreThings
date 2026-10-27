import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { openApp } from './navigation.mjs';

const root = resolve(import.meta.dirname, '..'), prefix = '/scripts/extensions/third-party/ST-PocketPhone/', output = process.env.POCKET_REGENERATION_OUTPUT;
if (output) await mkdir(output, { recursive: true });
const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
const results = [], mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
try {
  for (const [kind, mode] of [['native', 'standalone'], ['luker', 'embedded']]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); page.setDefaultTimeout(6000);
    const requests = [], errors = [], unexpected = [], deleted = []; let feeds = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      if (url.hostname !== '127.0.0.1') { unexpected.push(url.href); return route.abort(); }
      if (path.startsWith(prefix)) return route.fulfill({ path: resolve(root, decodeURIComponent(path.slice(prefix.length))), contentType: mime[extname(path)] || 'application/octet-stream' });
      if (path === '/lib.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const showdown={Converter:class{makeHtml(t){return t}}};export const DOMPurify={sanitize:h=>h};' });
      if (path === '/scripts/extensions.js') return route.fulfill({ contentType: 'text/javascript', body: "export const extensionTypes={'third-party/ST-PocketPhone':'local'};" });
      if (path === '/scripts/world-info.js') return route.fulfill({ contentType: 'text/javascript', body: `export const selected_world_info=[],world_info={};export async function loadWorldInfo(){globalThis.startupHarness.bookReads++;return {entries:{0:{constant:true,content:'FIXED_WORLD'},1:{key:['FIXED_STORY'],content:'STORY_ACTIVATED_WORLD'},2:{key:['A_OLD_CAPTION','A_OLD_IMAGE','A_OLD_COMMENT'],content:'OLD_DRAFT_QUERY_LEAK'}}}}` });
      if (path === '/api/extensions/version') return route.fulfill({ json: { currentBranchName: 'main', currentCommitHash: 'a'.repeat(40), remoteUrl: 'https://github.com/fixture/phone', isUpToDate: true } });
      if (path === '/api/images/delete') { deleted.push(route.request().postDataJSON().path); return route.fulfill({ json: {} }); }
      if (path === '/user/images/old-draft.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="gray"/></svg>' });
      if (path === '/api/backends/chat-completions/generate') {
        const body = route.request().postDataJSON(), input = JSON.parse(body.messages[1].content); requests.push(input);
        let answer;
        if (input.task === 'feed' || input.task === 'author') {
          assert.equal(input.existingPosts, undefined);
          for (const marker of ['A_OLD_CAPTION', 'A_OLD_IMAGE', 'A_OLD_COMMENT', 'B_OLD_CAPTION', 'B_OLD_IMAGE', 'B_OLD_COMMENT', 'OLD_DRAFT_QUERY_LEAK']) assert.equal(JSON.stringify(input).includes(marker), false, marker);
          assert.equal(input.story[0].text, 'FIXED_STORY'); assert.ok(input.character.includes('FIXED_CARD'));
          assert.ok(input.worldbook.includes('FIXED_WORLD')); assert.ok(input.worldbook.includes('STORY_ACTIVATED_WORLD')); assert.equal(input.clock.time, '09:30');
          const person = input.authors.find(author => author.id === 'lin');
          assert.equal(person.personality, 'FIXED_PERSONALITY'); assert.equal(person.expression, 'FIXED_EXPRESSION'); assert.equal(person.language, '粤语');
          if (kind === 'native') assert.equal(person.related, 'FIXED_QQJ_MEMORY'); else assert.ok(input.storyMemory.includes('FIXED_BBS_MEMORY'));
          const draft = input.task === 'feed' ? (++feeds === 1 ? 'A' : 'B') : 'HISTORY';
          if (input.task === 'feed') {
            assert.equal('privateHistory' in person,false);assert.equal(JSON.stringify(input).includes('FIXED_SMS'),false);
            assert.equal('todos' in person, false);
            assert.equal(JSON.stringify(input).includes('UNCONFIRMED_CANDIDATE'), false); assert.equal(JSON.stringify(input).includes('PROACTIVE_CANDIDATE'), false);
            if (feeds === 2) assert.equal(JSON.stringify(input).includes('SAVED_PROACTIVE_SMS'),false);
          } else { assert.equal(input.historyBefore, '2031/4/8 09:20'); assert.deepEqual(input.authors.map(author => author.id), ['lin']); }
          answer = {
            npcs: input.authors.filter(author => author.kind === 'npc').map((author, index) => ({ id: author.id, name: `路人${index}`, description: '普通路人' })),
            posts: input.authors.flatMap(author => Array.from({ length: input.task === 'author' ? 2 : 1 }, (_, index) => ({ authorId: author.id, text: `${draft}_OLD_CAPTION_${index}`, image: { description: `${draft}_OLD_IMAGE` }, publishedAt: input.task === 'author' ? `2031/4/${6-index} 09:20` : '2031/4/8 09:20', comments: [{ authorId: 'lin', name: '林舟', text: `${draft}_OLD_COMMENT` }] }))),
            ...(input.task === 'feed' ? { proactiveMessages: [{ contactId: 'lin', messages: [{ text: 'SAVED_PROACTIVE_SMS' }], todoSuggestions: [{ title: 'PROACTIVE_CANDIDATE', participantIds: ['@user', 'lin'], sourceMessageIndexes: [0] }] }] } : {}),
          };
        } else if (input.people) {
          assert.deepEqual(input.people, [{ sourceId: 'lin', name: '林舟', personality: 'FIXED_PERSONALITY', language: '粤语' }]);
          answer = { contacts: [{ sourceId: 'lin', name: '林舟', expression: 'STYLE_NEW' }] };
        } else if (input.task === 'comment') {
          assert.equal(input.post.text, 'B_OLD_CAPTION_0'); assert.equal(input.post.image.description, 'B_OLD_IMAGE'); assert.equal(input.post.comments[0].text, 'B_OLD_COMMENT'); assert.equal(input.userComment.text, 'USER_NEW_COMMENT');
          assert.equal(input.authors.find(author => author.id === 'lin').expression, 'STYLE_NEW');
          assert.equal(JSON.stringify(input).includes('FIXED_SMS'),false);
          answer = { comments: [{ authorId: 'lin', text: 'COMMENT_REPLY' }] };
        } else throw new Error('Unexpected synthetic operation');
        return route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(answer) } }] } });
      }
      unexpected.push(url.href); return route.abort();
    });
    await page.goto(`http://127.0.0.1:8917${prefix}tests/startup.html?host=${kind}&mode=${mode}`); await page.waitForFunction(() => startupHarness.ready);
    await page.evaluate(kind => {
      const h = startupHarness, state = h.metadata.pocketPhone;
      h.bookReads = 0; h.memoryReads = 0;
      Object.assign(state.contacts[0], { personality: 'FIXED_PERSONALITY', expression: 'FIXED_EXPRESSION', language: '粤语', source: { kind: 'qqj', entityId: 'lin' } });
      const batch = { key: '[-1,"2031/4/8","09:00"]', label: '固定短信批次' };
      state.conversations.lin = [{ id: 'fixed-sms', role: 'assistant', text: 'FIXED_SMS', read: true, batch }];
      state.todos = ['open', 'done', 'candidate'].map((status, index) => ({ id: `fixed-todo-${index}`, title: ['FIXED_OPEN', 'FIXED_DONE', 'UNCONFIRMED_CANDIDATE'][index], status, participantIds: ['@user','lin'], knownToIds: ['@user','lin'], sourceConversationId: 'lin', sourceMessageIds: ['fixed-sms'], sourceBatch: batch }));
      h.context.chat[0].mes = 'FIXED_STORY<!-- QQJ-end | date=2031/4/8 | time=09:30 -->'; h.context.characters[0].description = 'FIXED_CARD';
      h.context.saveMetadata = async () => { h.metadataSaves++; h.persisted = structuredClone(h.metadata); };
      if (kind === 'native') globalThis.qqj_v3_public_bridge_v1 = { getStatus: () => ({ status: 'ready' }), async readContext({ entityIds }) { h.memoryReads++; return { status: 'ready', actors: entityIds.map(entityId => ({ entityId, memoryText: 'FIXED_QQJ_MEMORY' })) }; } };
      else { h.settings.baibai_book = { enabled: true }; globalThis.STBaiBaiBook = { apiVersion: 1, getInjectedHistory() { h.memoryReads++; return { text: 'FIXED_BBS_MEMORY' }; } }; }
    }, kind);
    await page.getByRole('button', { name: mode === 'embedded' ? '打开两三事 · 随卡' : '打开两三事', exact: true }).click();
    const phone = page.locator(mode === 'embedded' ? '#pocket-phone-card-host' : '#pocket-phone-host');
    await openApp(phone, 'ainstgram');
    for (let index = 0; index < 2; index++) {
      await phone.getByRole('button', { name: '刷新动态', exact: true }).click();
      await phone.getByText(`${index ? 'B' : 'A'}_OLD_CAPTION_0`, { exact: true }).first().waitFor();
      assert.equal(await phone.locator('.social-post').count(), 5);
      if (await phone.locator('.phone-top-notice-dismiss').isVisible()) await phone.locator('.phone-top-notice-dismiss').click();
      if (!index) await page.evaluate(() => { startupHarness.metadata.pocketPhone.social.posts[0].image.path = '/user/images/old-draft.svg'; });
    }
    assert.deepEqual(deleted, ['/user/images/old-draft.svg']);
    const feedIds = await page.evaluate(() => startupHarness.metadata.pocketPhone.social.feedIds);
    await phone.locator('[data-social-author="lin"]').first().click(); await phone.getByRole('button', { name: '补充个人动态', exact: true }).click();
    await phone.getByText('HISTORY_OLD_CAPTION_0', { exact: true }).waitFor();
    assert.equal(await phone.locator('.social-profile-posts .social-post').count(), 3);
    assert.deepEqual(await page.evaluate(() => startupHarness.metadata.pocketPhone.social.feedIds), feedIds);
    assert.equal(await page.evaluate(() => startupHarness.metadata.pocketPhone.social.posts.length), 7);
    await openApp(phone, '短信'); await phone.locator('[data-contact="lin"]').click(); await phone.getByRole('button', { name: '聊天资料', exact: true }).click();
    await phone.getByRole('textbox', { name: '线上聊天方式', exact: true }).fill('UNSAVED_STYLE');
    const beforeStyle = await page.evaluate(() => startupHarness.metadataSaves);
    await phone.getByRole('button', { name: '刷新线上聊天方式', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.pocket-phone')?.shadowRoot.querySelector('#profile-expression')?.value === 'STYLE_NEW');
    assert.equal(await page.evaluate(() => startupHarness.metadata.pocketPhone.contacts[0].expression), 'FIXED_EXPRESSION');
    assert.equal(await page.evaluate(() => startupHarness.metadataSaves), beforeStyle);
    await phone.getByRole('button', { name: '保存', exact: true }).click();
    await page.waitForFunction(() => startupHarness.metadata.pocketPhone.contacts[0].expression === 'STYLE_NEW');
    assert.equal(await page.evaluate(() => startupHarness.metadataSaves), beforeStyle + 1);
    await openApp(phone, 'ainstgram'); const post = phone.locator('.social-post').filter({ hasText: 'B_OLD_CAPTION_0' }).first();
    await post.locator('.social-comment-toggle').click(); await post.getByRole('textbox', { name: '给这条动态留言' }).fill('USER_NEW_COMMENT'); await post.getByRole('button', { name: '发送', exact: true }).click();
    await post.getByText('COMMENT_REPLY', { exact: true }).waitFor();
    const final = await page.evaluate(() => ({ state: startupHarness.metadata.pocketPhone, saved: startupHarness.persisted.pocketPhone, saves: startupHarness.metadataSaves, bookReads: startupHarness.bookReads, memoryReads: startupHarness.memoryReads, errors: startupHarness.errors }));
    assert.equal(requests.length, 5); assert.equal(final.bookReads, 4); assert.equal(final.memoryReads, 4); assert.deepEqual(final.state, final.saved);
    assert.deepEqual(final.state.todos.map(row => row.title), ['FIXED_OPEN','FIXED_DONE','UNCONFIRMED_CANDIDATE']);
    assert.equal(final.state.conversations.lin.filter(message => message.text === 'SAVED_PROACTIVE_SMS').length, 2);
    assert.deepEqual(final.errors, []); assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    results.push({ kind, mode, requests: 5, refreshes: 2, historyAdded: 2, commentsAdded: 1, saves: final.saves, bookReads: 4, memoryReads: 4, memorySource: kind === 'native' ? 'QQJ' : 'BBS', previousDraftOmitted: true, fixedSourcesRetained: true, candidateExcluded: true, proactiveSmsRetained: 2, retiredTasksUnchanged: true, historyBoundary: requests[2].historyBefore, explicitStyleSave: true, commentThreadRetained: true, removedImagePaths: deleted, errors, unexpected });
    await page.close();
  }
  if (output) await writeFile(resolve(output, 'browser-result.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
