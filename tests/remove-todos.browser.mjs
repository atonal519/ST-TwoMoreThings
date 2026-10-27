import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { openApp } from './navigation.mjs';

const root = resolve(import.meta.dirname, '..'), prefix = '/scripts/extensions/third-party/ST-PocketPhone/';
const toolRoot = process.env.POCKET_BROWSER_TOOLS || '/tmp/tmt-hot-browser-20261026', output = process.env.POCKET_REMOVE_OUTPUT;
if (output) await mkdir(output, { recursive: true });
const { chromium } = createRequire(resolve(toolRoot, 'package.json'))('playwright');
const browser = await chromium.launch({ executablePath: process.env.POCKET_CHROMIUM || resolve(toolRoot, 'browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell'), args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: resolve(toolRoot, 'libs/usr/lib/x86_64-linux-gnu') } });
const results = [], mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
try {
  for (const [kind, mode] of [['native','standalone'],['luker','embedded']]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); page.setDefaultTimeout(6500);
    const errors = [], unexpected = [], requests = []; let release, started;
    const modelStarted = new Promise(resolve => { started = resolve; });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      if (url.hostname !== '127.0.0.1') { unexpected.push(url.href); return route.abort(); }
      if (path.startsWith(prefix)) return route.fulfill({ path: resolve(root, decodeURIComponent(path.slice(prefix.length))), contentType: mime[extname(path)] || 'application/octet-stream' });
      if (path === '/fixture-font.ttf') return route.fulfill({ path: process.env.POCKET_CJK_FONT || resolve(toolRoot, 'NotoSansSC.ttf'), contentType: 'font/ttf' });
      if (path === '/lib.js') return route.fulfill({ contentType: mime['.js'], body: 'export const showdown={Converter:class{makeHtml(t){return t}}};export const DOMPurify={sanitize:h=>h};' });
      if (path === '/scripts/extensions.js') return route.fulfill({ contentType: mime['.js'], body: "export const extensionTypes={'third-party/ST-PocketPhone':'local'};" });
      if (path === '/scripts/world-info.js') return route.fulfill({ contentType: mime['.js'], body: "export const selected_world_info=[],world_info={};export async function loadWorldInfo(){return {entries:{0:{constant:true,content:'合成城市设定'}}}}" });
      if (path === '/api/extensions/version') return route.fulfill({ json: { currentBranchName: 'main', currentCommitHash: 'a'.repeat(40), remoteUrl: 'https://github.com/fixture/phone', isUpToDate: true } });
      if (path === '/api/backends/chat-completions/generate') {
        const body = route.request().postDataJSON(), input = JSON.parse(body.messages[1].content); requests.push(input);
        assert.equal(JSON.stringify(body).includes('LEGACY_UNUSED_TASK'), false);
        assert.equal(body.messages[0].content.includes('todoSuggestions'), false);
        assert.equal(body.messages[0].content.includes('待办'), false);
        assert.ok(input.history.some(message => message.replyTo?.messageText === '明天带上那本书。'));
        await new Promise(resolve => { release = resolve; started(); });
        return route.fulfill({ json: { choices: [{ message: { content: JSON.stringify({ anchor: { memberIds: ['lin','@user'], speakerIds: ['lin'] }, messages: [{ speakerId: 'lin', text: '收到，到时见。' }], todoSuggestions: [{ title: '忽略的旧字段', participantIds: ['@user','lin'], sourceMessageIndexes: [0] }] }) } }] } });
      }
      unexpected.push(url.href); return route.abort();
    });
    await page.goto(`http://127.0.0.1:8917${prefix}tests/startup.html?host=${kind}&mode=${mode}`);
    await page.waitForFunction(() => startupHarness.ready);
    const initial = await page.evaluate(() => {
      const h = startupHarness, state = h.metadata.pocketPhone, batch = { key: '[0,"2031年4月8日","09:30"]', label: '2031年4月8日 09:30' };
      state.todos = [{ id: 'legacy', title: 'LEGACY_UNUSED_TASK', status: 'candidate', participantIds: ['@user','lin'], knownToIds: ['@user','lin'], sourceConversationId: 'lin', sourceMessageIds: ['legacy-source'], custom: { keep: true } }];
      state.conversations.lin = [{ id: 'legacy-source', role: 'assistant', text: '下午在旧书店见。', read: true, batch }];
      state.conversations.friends = [{ id: 'group-original', role: 'assistant', speakerId: 'lin', text: '明天带上那本书。', read: true, batch }];
      state.lockStyle = 'rounded';
      h.context.saveMetadata = async () => { h.metadataSaves++; h.persisted = structuredClone(h.metadata); };
      h.calendarReads = [];
      globalThis.STSevenDaysCal = { apiVersion: 1, getPhoneCalendar({ monthOffset }) {
        h.calendarReads.push(monthOffset);
        const month = 4 + monthOffset;
        return { title: '城市历', yearLabel: '2031年', eraLabel: '', monthName: `${month}月`, columns: 7, leading: 1, weekdays: ['一','二','三','四','五','六','日'], today: '4月8日', days: Array.from({ length: 30 }, (_, index) => ({ day: index + 1, label: `2031年${month}月${index + 1}日`, isToday: monthOffset === 0 && index === 7, items: monthOffset === 0 && index === 7 ? [{ id: 'festival', type: 'festival', name: '街区读书日', date: '4月8日', days: 1, note: '合成日历节日' }] : [] })) };
      }, getPhoneCalendarContext() { return null; } };
      return { todos: structuredClone(state.todos), saves: h.metadataSaves };
    });
    await page.getByRole('button', { name: mode === 'embedded' ? '打开两三事 · 随卡' : '打开两三事', exact: true }).click();
    const phone = page.locator(mode === 'embedded' ? '#pocket-phone-card-host' : '#pocket-phone-host');
    await phone.evaluate(async element => { const font = new FontFace('PhoneFixtureCJK', 'url(http://127.0.0.1:8917/fixture-font.ttf)'); await font.load(); document.fonts.add(font); const style = document.createElement('style'); style.textContent = ':host{font-family:PhoneFixtureCJK,sans-serif}'; element.shadowRoot.append(style); });
    await phone.getByRole('button', { name: '进入桌面', exact: true }).click();
    const layouts = [];
    for (const theme of ['day','night']) {
      await page.evaluate(value => { startupHarness.metadata.pocketPhone.theme = value; }, theme);
      await openApp(phone, '日历'); await phone.locator('.system-nav').getByRole('button', { name: '主页', exact: true }).click();
      for (const width of [320,390]) {
        await page.setViewportSize({ width, height: 844 });
        const layout = await phone.locator('.view-desktop').evaluate(element => {
          const apps = [...element.querySelectorAll('.desktop-app')].map(button => { const rect = button.getBoundingClientRect(), css = getComputedStyle(button), visual = getComputedStyle(button.querySelector('.desktop-app-icon')); return { id: button.dataset.tab, x: rect.x, y: rect.y, width: rect.width, column: css.gridColumnStart, row: css.gridRowStart, background: visual.backgroundColor, color: visual.color }; });
          const shell = element.closest('.phone-shell').getBoundingClientRect(), navigation = element.closest('.phone-shell').querySelector('.system-nav').getBoundingClientRect();
          return { apps, width: element.clientWidth, scrollWidth: element.scrollWidth, navInside: navigation.bottom <= shell.bottom + 1 };
        });
        assert.deepEqual(layout.apps.map(app => app.id), ['liangshi','social','messages','forum','calendar','settings']);
        assert.ok(layout.apps[0].x < layout.apps[1].x); assert.equal(layout.apps[0].y, layout.apps[1].y);
        assert.equal(layout.apps[0].column, '1'); assert.equal(layout.apps[1].column, '2');
        assert.deepEqual(layout.apps.slice(2).map(app => app.column), ['1','2','3','4']);
        assert.equal(layout.apps[0].background, layout.apps[2].background); assert.equal(layout.apps[2].background, layout.apps[4].background);
        assert.equal(layout.apps[1].background, layout.apps[3].background); assert.equal(layout.apps[3].background, layout.apps[5].background);
        assert.notEqual(layout.apps[0].background, layout.apps[1].background);
        assert.equal(new Set(layout.apps.map(app => app.color)).size, 1);
        assert.ok(layout.scrollWidth <= layout.width); assert.ok(layout.navInside);
        assert.equal(await phone.locator('.desktop-app-badge,[data-tab="todos"]').count(), 0);
        layouts.push({ theme, viewport: width, ...layout });
      }
      if (output && kind === 'native') await phone.locator('.phone-shell').screenshot({ path: resolve(output, `desktop-${theme}.png`) });
    }
    await openApp(phone, '日历');
    await phone.getByRole('button', { name: '2031年4月8日：街区读书日', exact: true }).click();
    await phone.locator('.calendar-events').getByText('街区读书日', { exact: true }).waitFor();
    await phone.getByRole('button', { name: '下个月', exact: true }).click();
    await phone.locator('.calendar-month h2').getByText('5月', { exact: true }).waitFor();
    await phone.getByRole('button', { name: '回到本月', exact: true }).click();
    await phone.locator('.calendar-month h2').getByText('4月', { exact: true }).waitFor();
    await openApp(phone, '短信'); await phone.locator('[data-contact="lin"]').click();
    assert.equal(await phone.locator('[data-todo-candidate]').count(), 0);
    await phone.getByRole('textbox', { name: '短信内容', exact: true }).fill('好，下午见。');
    await phone.getByRole('button', { name: '发送', exact: true }).click();
    await phone.getByText('好，下午见。', { exact: true }).waitFor();
    await openApp(phone, '短信'); await phone.locator('[data-group="friends"]').click();
    await phone.locator('.bubble').filter({ hasText: '明天带上那本书。' }).click();
    await phone.getByRole('button', { name: '引用', exact: true }).click();
    await phone.locator('.reply-preview').waitFor();
    await phone.getByRole('textbox', { name: '短信内容', exact: true }).fill('这条收到。');
    await phone.getByRole('button', { name: '发送', exact: true }).click();
    await phone.locator('.message-reply').getByText('明天带上那本书。', { exact: true }).waitFor();
    await phone.getByRole('button', { name: '继续', exact: true }).click(); await modelStarted;
    await openApp(phone, '日历'); release();
    await phone.locator('.phone-top-notice-open').filter({ hasText: '收到，到时见。' }).waitFor();
    assert.equal(await phone.locator('.view-calendar').isVisible(), true);
    await phone.locator('.phone-top-notice-open').click();
    await phone.locator('.view-group-chat').waitFor();
    await phone.getByText('收到，到时见。', { exact: true }).waitFor();
    assert.equal(await phone.locator('[data-todo-candidate],.todo-form,.view-todos').count(), 0);
    const final = await page.evaluate(() => ({ todos: startupHarness.metadata.pocketPhone.todos, saves: startupHarness.metadataSaves, errors: startupHarness.errors, calendarReads: startupHarness.calendarReads }));
    assert.equal(final.todos, undefined); assert.equal(final.saves - initial.saves, 4, 'SMS send, group reply, generated response and notification mark-read'); assert.equal(requests.length, 1);
    assert.deepEqual(final.errors, []); assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    results.push({ kind, mode, layouts, modelRequests: 1, metadataSaves: 4, retiredTasksRemovedOnSave: true, noTaskUi: true, calendarInteractive: true, messageSend: true, groupReply: true, notificationReturnsToGroup: true, errors, unexpected });
    await page.close();
  }
  if (output) await writeFile(resolve(output, 'browser-result.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results.map(({ kind, modelRequests, metadataSaves, retiredTasksRemovedOnSave, errors, unexpected }) => ({ kind, modelRequests, metadataSaves, retiredTasksRemovedOnSave, errors, unexpected })), null, 2));
} finally { await browser.close(); }
