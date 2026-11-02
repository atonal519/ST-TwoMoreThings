import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { openApp } from './navigation.mjs';

const { chromium } = await import(process.env.POCKET_PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(import.meta.dirname, '..'), prefix = '/scripts/extensions/third-party/ST-PocketPhone/';
const output = process.env.POCKET_BROWSER_OUTPUT || mkdtempSync(resolve(tmpdir(), 'tmt-clear-'));
mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const browser = await chromium.launch({ ...(process.env.POCKET_CHROMIUM_PATH ? { executablePath: process.env.POCKET_CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
const results = [];
try {
  for (const host of ['native', 'luker']) for (const [width, theme] of [[320, 'day'], [320, 'night']]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(6000);
    const errors = [], unexpected = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      if (url.hostname === '127.0.0.1' && path.startsWith(prefix)) {
        const file = resolve(root, decodeURIComponent(path.slice(prefix.length)));
        if (file === resolve(root, 'tests/preview.js')) return route.fulfill({ contentType: 'text/javascript', body: readFileSync(file, 'utf8')
          .replace('const settings = {', "const settings = { pocketPhone: { fontCssUrl: '', apiSourceRef: { kind: 'shared-preset', presetId: 'daily' } },")
          .replace("'schedule-planner': {", "'schedule-planner': { processingPrompt: 'Fixture processing prompt', bodyWrappers: { keepTags: 'content', extraTags: '' },") });
        if (file === resolve(root, 'index.js') && process.env.POCKET_UI_SOURCE) return route.fulfill({ contentType: 'text/javascript', body: "export { initialize } from './src/runtime.js';" });
        if (existsSync(file)) return route.fulfill({ path: file, contentType: mime[extname(file)] || 'application/octet-stream' });
      }
      if (path === '/scripts/extensions.js') return route.fulfill({ contentType: 'text/javascript', body: "export const extensionTypes={'third-party/ST-PocketPhone':'local'};" });
      if (path === '/api/extensions/version') return route.fulfill({ json: { currentBranchName: 'main', currentCommitHash: 'a'.repeat(40), remoteUrl: 'https://github.com/fixture/phone', isUpToDate: true } });
      unexpected.push(url.href); return route.abort();
    });
    await page.goto(`http://127.0.0.1:8917${prefix}tests/preview.html?host=${host}&group=1&clock=story`);
    await page.locator('.phone-shell').waitFor();
    await page.evaluate(theme => {
      const h = previewHarness, s = h.metadata.pocketPhone, batch = s.conversations.lin[0].batch;
      s.theme = theme; s.albumPhotos = [{ path: '/user/images/kept.png', description: '保留的照片', sources: [] }];
      for (const id of ['lin', 'preview-friends']) s.conversations[id] = [
        { id: id + '-past', role: 'assistant', speakerId: 'lin', text: '过去的记录', batch: { key: 'past', label: '过去' } },
        { id: id + '-now', role: 'assistant', speakerId: 'lin', text: '当前的记录', batch },
      ];
      h.app.open();
    }, theme);
    await openApp(page, '短信'); await page.locator('[data-contact="lin"]').click();
    const draft = page.locator('#sms-draft'), shell = page.locator('.phone-shell');
    const dialog = () => page.getByRole('dialog', { name: '清空聊天', exact: true });
    const saves = () => page.evaluate(() => previewHarness.metadataSaves);
    const openClear = async () => {
      await page.getByRole('button', { name: '聊天选项', exact: true }).click();
      await page.locator('[data-action="clear-chat"]').click();
      await dialog().waitFor();
      assert.equal(await page.locator('.clear-confirm').count(), 0);
      assert.equal(await dialog().evaluate(n => n.getRootNode().activeElement.textContent), '取消');
    };
    await draft.fill('未发送的草稿');
    for (const dismissal of ['取消', 'Escape', 'backdrop']) {
      const before = await saves(); await openClear();
      assert.equal(await page.locator('.view-chat').evaluate(n => n.inert), true);
      if (dismissal === '取消') await dialog().getByRole('button', { name: '取消', exact: true }).click();
      else if (dismissal === 'Escape') await page.keyboard.press('Escape');
      else await page.locator('.phone-dialog-backdrop').click({ position: { x: 24, y: 80 } });
      assert.equal(await saves(), before); assert.equal(await draft.inputValue(), '未发送的草稿');
    }
    await openClear();
    assert.equal(await dialog().evaluate(n => { const b=n.getBoundingClientRect(), s=n.getRootNode().querySelector('.phone-shell').getBoundingClientRect();return Math.abs(b.x+b.width/2-s.x-s.width/2)<1 && Math.abs(b.y+b.height/2-s.y-s.height/2)<1; }), true);
    await shell.screenshot({ path: `${output}/clear-${host}-${theme}-${width}.png` });
    // A refresh with a new timeline must keep the original segment captured by the dialog.
    await page.evaluate(() => { const h=previewHarness;h.mainMessages.push({is_user:false,mes:'新的主楼'});h.app.open(); });
    const before = await saves();
    await dialog().getByRole('button', { name: '确认清空', exact: true }).evaluate(n => {n.click();n.click();});
    await dialog().waitFor({ state: 'detached' });
    assert.equal(await saves(), before + 1);
    assert.deepEqual(await page.evaluate(() => previewHarness.metadata.pocketPhone.conversations.lin.map(n=>n.id)), ['lin-past']);
    assert.equal(await draft.inputValue(), '');
    assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.albumPhotos[0].path), '/user/images/kept.png');
    assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.conversations['preview-friends'].length), 2);
    await page.locator('[data-action="back-inbox"]').click(); await page.locator('[data-group="preview-friends"]').click();
    await draft.fill('群聊草稿'); await openClear();
    await page.evaluate(() => { previewHarness.failSave=true; });
    await dialog().getByRole('button', { name: '确认清空', exact: true }).click();
    await page.locator('.feedback.is-error').waitFor();
    assert.equal(await dialog().count(), 1); assert.equal(await draft.inputValue(), '群聊草稿');
    assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.conversations['preview-friends'].length), 2);
    await page.keyboard.press('Escape');
    // A dialog from a prior route cannot later submit.
    await openClear();
    await page.locator('[data-action="system-home"]').evaluate(n=>n.click());
    assert.equal(await dialog().count(), 0);
    await openApp(page, '短信'); await page.locator('[data-group="preview-friends"]').click();
    await openClear(); const closeBefore=await saves();
    await page.locator('[data-action="close"]').evaluate(n=>n.click()); assert.equal(await dialog().count(),0);assert.equal(await saves(),closeBefore);
    await page.evaluate(()=>previewHarness.app.open());await openApp(page,'短信');await page.locator('[data-group="preview-friends"]').click();assert.equal(await draft.inputValue(),'群聊草稿');
    await openClear();
    await page.evaluate(()=>{previewHarness.saveWait=new Promise(resolve=>{previewHarness.releaseSave=resolve;});});
    await dialog().getByRole('button',{name:'确认清空',exact:true}).click();
    await page.locator('[data-action="system-home"]').evaluate(n=>n.click());await openApp(page,'短信');await page.locator('[data-contact="lin"]').click();await draft.fill('新路由草稿');await draft.focus();await draft.evaluate(n=>{window.lateDraft=n;n.setSelectionRange(1,3);});
    await page.evaluate(()=>{previewHarness.releaseSave();previewHarness.saveWait=null;});await page.waitForTimeout(80);
    assert.deepEqual(await draft.evaluate(n=>({same:n===lateDraft,active:n.getRootNode().activeElement===n,text:n.value,start:n.selectionStart,end:n.selectionEnd})),{same:true,active:true,text:'新路由草稿',start:1,end:3});
    await page.locator('[data-action="back-inbox"]').click();await page.locator('[data-group="preview-friends"]').click();
    await openClear(); const invalidBefore=await saves();
    await page.evaluate(() => {previewHarness.context.chatId='another-chat';});
    await dialog().getByRole('button', {name:'确认清空',exact:true}).click();
    assert.equal(await saves(), invalidBefore); assert.equal(await dialog().count(), 0);
    assert.equal(await draft.inputValue(), '群聊草稿');
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    results.push({host, theme, width, source:Boolean(process.env.POCKET_UI_SOURCE), errors, unexpected, requests:await page.evaluate(()=>previewHarness.requests.length)}); await page.close();
  }
  writeFileSync(resolve(output, 'result.json'), JSON.stringify(results,null,2));
  console.log(JSON.stringify({output,results}));
} finally { await browser.close(); }
