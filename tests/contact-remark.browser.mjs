import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, existsSync, mkdtempSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { openApp } from './navigation.mjs';

const { chromium } = await import(process.env.POCKET_PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(import.meta.dirname, '..'), prefix = '/scripts/extensions/third-party/ST-PocketPhone/';
const output = process.env.POCKET_BROWSER_OUTPUT || mkdtempSync(resolve(tmpdir(), 'tmt-remark-'));
mkdirSync(output, { recursive: true });
const font = process.env.POCKET_CJK_FONT ? readFileSync(process.env.POCKET_CJK_FONT).toString('base64') : '';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const browser = await chromium.launch({ ...(process.env.POCKET_CHROMIUM_PATH ? { executablePath: process.env.POCKET_CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
try {
  for (const host of ['native', 'luker']) for (const [width, theme] of [[390, 'day'], [320, 'night']]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(6000);
    const errors = [], unexpected = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url()), path = url.pathname;
      if (url.hostname === '127.0.0.1' && path.startsWith(prefix)) {
        const file = resolve(root, decodeURIComponent(path.slice(prefix.length)));
        if (file === resolve(root, 'tests/preview.js')) return route.fulfill({ contentType: 'text/javascript', body: readFileSync(file, 'utf8').replace('const settings = {', "const settings = { pocketPhone: { fontCssUrl: '', apiSourceRef: { kind: 'shared-preset', presetId: 'daily' } },") });
        if (existsSync(file)) return route.fulfill({ path: file, contentType: mime[extname(file)] || 'application/octet-stream' });
      }
      if (path === '/scripts/extensions.js') return route.fulfill({ contentType: 'text/javascript', body: "export const extensionTypes={'third-party/ST-PocketPhone':'local'};" });
      if (path === '/api/extensions/version') return route.fulfill({ json: { currentBranchName: 'main', currentCommitHash: 'a'.repeat(40), remoteUrl: 'https://github.com/fixture/phone', isUpToDate: true } });
      unexpected.push(url.href); return route.abort();
    });
    await page.goto(`http://127.0.0.1:8917${prefix}tests/preview.html?host=${host}&group=1&clock=story`);
    await page.locator('.phone-shell').waitFor();
    if (font) await page.locator('.pocket-phone').evaluate(async (element, data) => {
      const font = new FontFace('RemarkPreviewCJK', `url(data:font/otf;base64,${data})`);
      await font.load(); document.fonts.add(font);
      const style = document.createElement('style'); style.textContent = ':host{font-family:RemarkPreviewCJK,sans-serif}'; element.shadowRoot.append(style);
    }, font);
    await page.evaluate(theme => { previewHarness.metadata.pocketPhone.theme = theme; previewHarness.app.open(); }, theme);
    await openApp(page, '短信'); await page.locator('[data-contact="lin"]').click();
    const before = await page.evaluate(() => ({ requests: previewHarness.requests.length, saves: previewHarness.metadataSaves }));
    await page.getByRole('button', { name: '聊天资料', exact: true }).click();
    const remark = page.locator('#profile-remark');
    assert.equal(await remark.textContent(), '—');
    assert.equal(await page.locator('[name="remarkForUser"]').count(), 0);
    assert.deepEqual(await page.evaluate(() => ({ requests: previewHarness.requests.length, saves: previewHarness.metadataSaves })), before, 'opening the read-only field does not generate or save');
    await page.locator('.phone-shell').screenshot({ path: `${output}/remark-empty-${host}-${theme}-${width}.png` });
    await page.locator('[data-action="back-profile"]').click();
    await page.evaluate(() => { previewHarness.replyWait = new Promise(resolve => { previewHarness.releaseReply = resolve; }); });
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.waitForFunction(() => previewHarness.requests.length === 1);
    await page.getByRole('button', { name: '聊天资料', exact: true }).click();
    const name = page.locator('#profile-name');
    await name.fill('尚未保存的姓名'); await name.evaluate(node => { node.focus(); node.setSelectionRange(2, 4); });
    const nameNode = await name.elementHandle();
    const newRemark = '书友 📚 <img src=x onerror=alert(1)> & "周末" ' + '一起逛书店'.repeat(24);
    const savesBeforeReply = await page.evaluate(() => previewHarness.metadataSaves);
    await page.evaluate(value => { previewHarness.reply = { messages: [{ text: '书已经给你留好。' }], remarkForUser: value }; previewHarness.releaseReply(); }, newRemark);
    await page.waitForFunction(value => previewHarness.metadata.pocketPhone.contacts.find(person => person.id === 'lin').remarkForUser === value, newRemark);
    await page.waitForFunction(value => document.querySelector('.pocket-phone').shadowRoot.querySelector('#profile-remark').textContent === value, newRemark);
    assert.equal(await page.evaluate(() => previewHarness.metadataSaves), savesBeforeReply + 1, 'normal reply and remark share one save');
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 1);
    assert.equal(await name.inputValue(), '尚未保存的姓名');
    assert.equal(await name.evaluate((node, original) => node === original, nameNode), true);
    assert.deepEqual(await name.evaluate(node => [node.selectionStart, node.selectionEnd]), [2, 4]);
    assert.equal(await remark.locator('img, script').count(), 0, 'remark content is escaped text');
    assert.equal(await remark.evaluate(node => node.scrollWidth <= node.clientWidth), true);
    await page.locator('.phone-shell').screenshot({ path: `${output}/remark-long-${host}-${theme}-${width}.png` });
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.contacts.find(person => person.id === 'lin').name === '尚未保存的姓名');
    const notice = page.locator('[data-action="dismiss-phone-notice"]');
    if (await notice.isVisible()) await notice.click();
    await page.getByRole('button', { name: '聊天资料', exact: true }).click();
    assert.equal(await remark.textContent(), newRemark, 'saving the old draft retains the latest generated remark');
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 1);
    await page.locator('.phone-shell').screenshot({ path: `${output}/remark-reopened-${host}-${theme}-${width}.png` });
    await page.evaluate(() => { previewHarness.metadata.pocketPhone.contacts.find(person => person.id === 'zhou').identityOwnerId = '@user'; });
    await openApp(page, '短信'); await page.locator('[data-contact="zhou"]').click();
    await page.getByRole('button', { name: '聊天资料', exact: true }).click();
    assert.equal(await remark.count(), 0, 'user-owned accounts do not show this field');
    await openApp(page, '短信'); await page.getByRole('button', { name: '通讯录操作', exact: true }).click();
    await page.getByRole('menuitem', { name: '添加联系人', exact: true }).click();
    assert.equal(await remark.count(), 0, 'new unsaved contacts do not show this field');
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 1);
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    await page.close();
  }
  console.log(`Chromium ${browser.version()}: Native/Luker 390-day and 320-night remark display, original 1 request/1 save, asynchronous draft/selection retention, escaped long text, profile save/reopen and own/new contact exclusions passed. Simulated hosts/models only.`);
  console.log(`Remark browser artifacts: ${output}`);
} finally { await browser.close(); }
