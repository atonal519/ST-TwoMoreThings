import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { openApp } from './navigation.mjs';

const root = resolve(import.meta.dirname, '..'), prefix = '/scripts/extensions/third-party/ST-PocketPhone/';
const tools = process.env.POCKET_BROWSER_TOOLS || '/tmp/tmt-hot-browser-20261026';
const { chromium } = createRequire(resolve(tools, 'package.json'))('playwright');
const browser = await chromium.launch({ executablePath: resolve(tools, 'browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell'), args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: resolve(tools, 'libs/usr/lib/x86_64-linux-gnu') } });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf' };
const results = [];
try {
  for (const [kind, mode] of [['native', 'standalone'], ['luker', 'embedded']]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }), inputs = [], errors = [], unexpected = [];
    let feeds = 0, following = 0;
    page.setDefaultTimeout(8000); page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      if (url.hostname !== '127.0.0.1') { unexpected.push(url.href); return route.abort(); }
      if (path.startsWith(prefix)) return route.fulfill({ path: resolve(root, decodeURIComponent(path.slice(prefix.length))), contentType: mime[extname(path)] || 'application/octet-stream' });
      if (path === '/lib.js') return route.fulfill({ contentType: mime['.js'], body: 'export const showdown={Converter:class{makeHtml(t){return t}}};export const DOMPurify={sanitize:h=>h};' });
      if (path === '/scripts/extensions.js') return route.fulfill({ contentType: mime['.js'], body: "export const extensionTypes={'third-party/ST-PocketPhone':'local'};" });
      if (path === '/scripts/world-info.js') return route.fulfill({ contentType: mime['.js'], body: "export const selected_world_info=[],world_info={};export async function loadWorldInfo(){return {entries:{0:{constant:true,content:'普通城市公共设定'}}}}" });
      if (path === '/api/extensions/version') return route.fulfill({ json: { currentBranchName: 'main', currentCommitHash: 'a'.repeat(40), remoteUrl: 'https://github.com/fixture/phone', isUpToDate: true } });
      if (path === '/api/backends/chat-completions/generate') {
        const request = route.request().postDataJSON(), input = JSON.parse(request.messages[1].content); let answer, type;
        if (input.group) { type = 'group'; answer = { anchor: { memberIds: ['lin', 'b', '@user'], speakerIds: ['lin'] }, messages: [{ speakerId: 'lin', text: '群内收到。' }] }; }
        else if (input.contact) { type = 'private'; answer = { messages: [{ text: '私聊收到。' }] }; }
        else if (input.task === 'feed') {
          type = `social-${++feeds}`;
          answer = { posts: [{ authorId: input.authors.find(author => author.kind === 'contact').id, text: `INS_${feeds}_PUBLIC`, image: { description: `INS_${feeds}_IMAGE` }, comments: [{ name: '路人', text: `INS_${feeds}_COMMENT` }] }] };
        } else if ('userPersona' in input) {
          type = `following-${++following}`;
          answer = { accounts: [{ key: 'a', name: '旧物记录员', handle: 'public-creator' }], posts: [{ authorKey: 'a', text: `FOLLOWING_${following}_PUBLIC`, image: { description: `FOLLOWING_${following}_IMAGE` } }] };
        } else if (input.post) { type = 'more'; answer = { accounts: [{ key: 'r', name: '路人', handle: 'new-commenter' }], comments: [{ authorKey: 'r', text: '公开讨论补充。' }] }; }
        else throw Error('Unexpected model operation');
        inputs.push({ type, input, outputLimitAbsent: !Object.hasOwn(request, 'max_tokens') && !Object.hasOwn(request, 'max_completion_tokens') });
        return route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(answer) } }] } });
      }
      unexpected.push(url.href); return route.abort();
    });
    await page.goto(`http://127.0.0.1:8917${prefix}tests/startup.html?host=${kind}&mode=${mode}`);
    await page.waitForFunction(() => startupHarness.ready);
    await page.evaluate(() => {
      const h = startupHarness, state = h.metadata.pocketPhone, portrait = state.contacts[0].avatar;
      h.context.powerUserSettings = { persona_description: '喜欢旧物和散步。' };
      state.contacts.push({ id: 'b', name: '乙', avatar: portrait }, { id: 'c', name: '丙', avatar: portrait });
      state.groups[0].memberIds = ['lin', 'b'];
      const past = { key: '[-1]', label: '过去' }, current = { key: '[0,"2031年4月8日","09:30"]', label: '当前' };
      state.conversations = {
        lin: [{ id: 'lp', role: 'assistant', text: 'PRIVATE_LIN', batch: past, read: true }, { id: 'la', role: 'user', text: 'ACTIVE_LIN', batch: current }],
        b: [{ id: 'bp', role: 'assistant', text: 'PRIVATE_B', batch: past, read: true }],
        friends: [{ id: 'gp', role: 'assistant', speakerId: 'lin', text: 'GROUP_SHARED', batch: past, knownToIds: ['lin', 'b', '@user'], read: true }],
      };
      state.forum.posts = [{ id: 'f', author: '林舟', title: '街边公开消息', content: 'FORUM_PUBLIC', comments: [] }];
      state.liangshi = { accounts: [{ id: 'ls', name: '公开账号', handle: 'public', contactId: 'lin' }], posts: [{ id: 'p', authorId: 'ls', text: 'LS_PUBLIC', comments: [], reposts: [] }], feedIds: ['p'], topics: [], promoCountdown: 3 };
    });
    await page.getByRole('button', { name: mode === 'embedded' ? '打开两三事 · 随卡' : '打开两三事', exact: true }).click();
    const phone = page.locator(mode === 'embedded' ? '#pocket-phone-card-host' : '#pocket-phone-host');
    await openApp(phone, '短信'); await phone.locator('[data-contact="lin"]').click();
    await phone.getByRole('button', { name: '继续', exact: true }).click(); await phone.getByText('私聊收到。', { exact: true }).waitFor();
    assert.ok(JSON.stringify(inputs[0].input.phoneContext).includes('GROUP_SHARED')); assert.ok(JSON.stringify(inputs[0].input.history).includes('ACTIVE_LIN')); assert.equal(JSON.stringify(inputs[0].input).includes('PRIVATE_B'), false);
    await openApp(phone, '短信'); await phone.locator('[data-group="friends"]').click();
    await phone.getByRole('button', { name: '继续', exact: true }).click(); await phone.getByText('群内收到。', { exact: true }).waitFor();
    for (const marker of ['PRIVATE_LIN', 'PRIVATE_B', 'ACTIVE_LIN']) assert.equal(JSON.stringify(inputs[1].input).includes(marker), false, marker);
    await openApp(phone, 'ainstgram');
    for (let index = 1; index <= 2; index++) { await phone.getByRole('button', { name: '刷新动态', exact: true }).click(); await phone.getByText(`INS_${index}_PUBLIC`, { exact: true }).waitFor(); }
    assert.ok(JSON.stringify(inputs[3].input.phoneContext).includes('LS_PUBLIC')); assert.ok(JSON.stringify(inputs[3].input.phoneContext).includes('FORUM_PUBLIC'));
    for (const marker of ['INS_1_', 'PRIVATE_LIN', 'PRIVATE_B', 'GROUP_SHARED', 'ACTIVE_LIN']) assert.equal(JSON.stringify(inputs[3].input).includes(marker), false, marker);
    await openApp(phone, '两事'); await phone.getByRole('button', { name: '关注', exact: true }).click(); assert.equal(inputs.length, 4);
    for (let index = 1; index <= 2; index++) { await phone.getByRole('button', { name: '刷新关注', exact: true }).click(); await phone.getByText(`FOLLOWING_${index}_PUBLIC`, { exact: true }).waitFor(); }
    const fresh = inputs[5].input;
    assert.ok(JSON.stringify(fresh.phoneContext).includes('INS_2_PUBLIC')); assert.equal('userConversations' in fresh, false);
    for (const marker of ['FOLLOWING_1_', 'LS_PUBLIC', 'PRIVATE_LIN', 'PRIVATE_B', 'GROUP_SHARED', 'ACTIVE_LIN']) assert.equal(JSON.stringify(fresh).includes(marker), false, marker);
    await phone.getByRole('button', { name: '查看评论', exact: true }).first().click(); await phone.getByRole('button', { name: '加载更多', exact: true }).click(); await phone.getByText('公开讨论补充。', { exact: true }).waitFor();
    assert.equal(inputs[6].input.post.text, 'FOLLOWING_2_PUBLIC'); assert.ok(Array.isArray(inputs[6].input.phoneContext)); assert.ok(inputs[6].input.phoneContext.every(row => row.visibility === 'public'));
    const final = await page.evaluate(() => ({ saves: startupHarness.metadataSaves, errors: startupHarness.errors }));
    assert.equal(inputs.length, 7); assert.equal(final.saves, 7); assert.deepEqual(final.errors, []); assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    results.push({ kind, mode, requests: inputs.map(({ type, outputLimitAbsent }) => ({ type, outputLimitAbsent })), saves: final.saves, activeOnlyInOriginalThread: true, privateGroupIntersection: true, publicOnlyAnonymousTasks: true, regeneratedDraftsExcluded: true, selectedPostMoreRetained: true, initialFollowingCalls: 0, errors, unexpected });
    await page.close();
  }
  if (process.env.POCKET_CONTEXT_RESULT) await writeFile(process.env.POCKET_CONTEXT_RESULT, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
