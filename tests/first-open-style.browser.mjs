import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const prefix = '/scripts/extensions/third-party/ST-PocketPhone/';
const source = process.env.POCKET_STYLE_SOURCE === '1';
const screenshots = process.env.POCKET_STYLE_SCREENSHOTS;
if (screenshots) await mkdir(screenshots, { recursive: true });
const { chromium } = createRequire(process.env.POCKET_PLAYWRIGHT_MODULE || resolve(root, 'package.json'))(process.env.POCKET_PLAYWRIGHT_PACKAGE || 'playwright');
const browser = process.env.POCKET_BROWSER_CDP
  ? await chromium.connectOverCDP(process.env.POCKET_BROWSER_CDP)
  : await chromium.launch({ executablePath: process.env.POCKET_BROWSER_EXECUTABLE, headless: true, args: ['--no-sandbox'],
    env: { ...process.env, ...(process.env.POCKET_BROWSER_LIBS ? { LD_LIBRARY_PATH: process.env.POCKET_BROWSER_LIBS } : {}) } });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const results = [];

async function fixture(kind, mode, width = 390) {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  page.setDefaultTimeout(7000);
  const errors = [], unexpected = [], pending = [];
  let cssRequests = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (path === prefix + 'style.css') { cssRequests++; pending.push(route); return; }
    if (url.hostname === 'fontsapi.zeoseven.com') return route.fulfill({ contentType: 'text/css', body: '' });
    if (url.hostname !== '127.0.0.1') { unexpected.push(url.href); return route.abort(); }
    if (source && path === prefix + 'dist/runtime.js') return route.fulfill({ contentType: 'text/javascript', body: "export * from '../src/runtime.js';" });
    if (path.startsWith(prefix)) {
      const relative = decodeURIComponent(path.slice(prefix.length));
      const base = source && process.env.POCKET_STYLE_BASELINE_ROOT && ['src/ui.js', 'src/runtime.js'].includes(relative) ? process.env.POCKET_STYLE_BASELINE_ROOT : root;
      return route.fulfill({ path: resolve(base, relative), contentType: mime[extname(path)] || 'application/octet-stream' });
    }
    if (path === '/scripts/extensions.js') return route.fulfill({ contentType: 'text/javascript', body: "export const extensionTypes={'third-party/ST-PocketPhone':'local'};" });
    if (path === '/api/extensions/version') return route.fulfill({ json: { currentBranchName: 'main', currentCommitHash: 'a'.repeat(40), remoteUrl: 'https://github.com/fixture/phone', isUpToDate: true } });
    unexpected.push(url.href); return route.abort();
  });
  await page.goto(`http://127.0.0.1:8917${prefix}tests/startup.html?host=${kind}&mode=${mode}`);
  await page.waitForFunction(() => startupHarness.ready);
  await page.evaluate(() => {
    const field = document.createElement('textarea'); field.id = 'host-input';
    field.style.cssText = 'position:fixed;left:40px;bottom:0;width:260px;height:18px;z-index:1'; document.body.append(field);
    const outside = document.createElement('button'); outside.id = 'host-outside'; outside.textContent = '宿主按钮';
    outside.style.cssText = 'position:fixed;left:5px;top:5px;width:80px;height:30px;z-index:1';
    outside.onclick = () => { globalThis.hostClicks = (globalThis.hostClicks || 0) + 1; }; document.body.append(outside);
  });
  const launcher = page.getByRole('button', { name: mode === 'embedded' ? '打开两三事 · 随卡' : '打开两三事', exact: true });
  const phone = page.locator(mode === 'embedded' ? '#pocket-phone-card-host' : '#pocket-phone-host');
  const saves = await page.evaluate(() => ({ metadata: startupHarness.metadataSaves, settings: startupHarness.settingsSaves }));
  const open = async () => { await launcher.click(); await phone.locator('.phone-shell').waitFor({ state: 'attached' }); };
  const waitCss = async count => {
    for (let i = 0; pending.length < count && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(pending.length, count, 'the real main stylesheet request reached the controlled route');
  };
  const releaseCss = async (index = 0, success = true) => {
    await pending[index].fulfill(success ? { path: resolve(root, 'style.css'), contentType: 'text/css' } : { status: 404, contentType: 'text/plain', body: 'not found' });
  };
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const checkClean = async () => {
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    assert.deepEqual(await page.evaluate(() => ({ metadata: startupHarness.metadataSaves, settings: startupHarness.settingsSaves })), saves);
  };
  return { page, phone, launcher, open, waitCss, releaseCss, settle, checkClean, cssRequests: () => cssRequests };
}

try {
  for (const kind of process.env.POCKET_STYLE_ONLY_CONFLICT || process.env.POCKET_STYLE_ONLY_RETRY ? [] : ['native', 'luker']) for (const mode of ['standalone', 'embedded']) {
    const f = await fixture(kind, mode);
    try {
      await f.page.evaluate(() => { Object.assign(document.documentElement.style, { minHeight: '100vh', overflow: 'hidden', transform: 'translate(7px,11px)' }); });
      await f.open(); await f.waitCss(1); await f.settle();
      if (screenshots) await f.page.screenshot({ path: resolve(screenshots, `${kind}-${mode}-waiting.png`) });
      assert.equal(await f.phone.locator('.phone-shell').isVisible(), false, `${kind}/${mode}: no bare controls before main CSS`);
      await f.releaseCss(); await f.phone.locator('.phone-shell').waitFor();
      assert.deepEqual(await f.phone.locator('.phone-shell').evaluate(node => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }), { x: 10, y: 20, width: 370, height: 764 });
      await f.page.locator('#host-input').click();
      assert.equal(await f.phone.evaluate(node => node.hidden), true);
      assert.equal(await f.page.evaluate(() => document.activeElement.id), 'host-input');
      await f.page.locator('#host-input').press('x');
      assert.equal(await f.page.locator('#host-input').inputValue(), 'x');
      await f.page.setViewportSize({ width: 1200, height: 844 }); await f.open();
      assert.deepEqual(await f.phone.locator('.phone-shell').evaluate(node => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }), { x: 820, y: 70, width: 360, height: 600 });
      await f.page.locator('#host-outside').click();
      assert.equal(await f.page.evaluate(() => hostClicks), 1);
      assert.equal(await f.phone.evaluate(node => node.hidden), false);
      const status = await f.phone.locator('.phone-status').boundingBox();
      await f.page.mouse.move(status.x + 80, status.y + 15); await f.page.mouse.down();
      await f.page.mouse.move(status.x - 20, status.y + 65, { steps: 5 }); await f.page.mouse.up();
      assert.deepEqual(await f.phone.locator('.phone-shell').evaluate(node => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y }; }), { x: 720, y: 120 });
      await f.phone.getByRole('button', { name: '关闭手机', exact: true }).click(); await f.open();
      assert.deepEqual(await f.phone.locator('.phone-shell').evaluate(node => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y }; }), { x: 720, y: 120 });
      assert.equal(f.cssRequests(), 1); await f.checkClean();
      results.push({ kind, mode, scenario: 'delayed CSS, success, native input, desktop click-through and drag', pass: true });
    } finally { await f.page.close(); }

    const closed = await fixture(kind, mode);
    try {
      await closed.open(); await closed.waitCss(1);
      await closed.page.locator('#host-input').click();
      assert.equal(await closed.phone.evaluate(node => node.hidden), true);
      await closed.releaseCss();
      await closed.phone.locator('link[rel="stylesheet"]').first().evaluate(link => link.sheet ? undefined : new Promise(resolve => link.addEventListener('load', resolve, { once: true })));
      await closed.settle();
      assert.equal(await closed.phone.locator('.phone-shell').isVisible(), false, 'late CSS must preserve the pre-load close');
      assert.equal(await closed.page.evaluate(() => document.activeElement.id), 'host-input');
      await closed.open(); await closed.phone.locator('.phone-shell').waitFor(); await closed.checkClean();
      results.push({ kind, mode, scenario: 'close before CSS, late load, manual reopen', pass: true });
    } finally { await closed.page.close(); }

    const failed = await fixture(kind, mode);
    try {
      await failed.open(); await failed.waitCss(1); await failed.releaseCss(0, false);
      await failed.page.waitForFunction(() => startupHarness.errors.length === 1);
      assert.match(await failed.page.evaluate(() => startupHarness.errors[0]), /样式.*重新打开/);
      assert.equal(await failed.phone.locator('.phone-shell').isVisible(), false);
      assert.equal(await failed.phone.evaluate(node => node.hidden), true);
      await failed.settle(); assert.equal(failed.cssRequests(), 1, 'failed CSS does not retry automatically');
      await failed.open(); await failed.waitCss(2);
      assert.equal(await failed.phone.locator('.phone-shell').isVisible(), false);
      await failed.releaseCss(1); await failed.phone.locator('.phone-shell').waitFor();
      assert.equal(await failed.page.evaluate(() => startupHarness.errors.length), 1); await failed.checkClean();
      results.push({ kind, mode, scenario: 'CSS failure reports once, manual reopen retries and recovers', pass: true });
    } finally { await failed.page.close(); }

    const disposed = await fixture(kind, mode);
    try {
      await disposed.open(); await disposed.waitCss(1);
      await disposed.page.evaluate(async mode => {
        globalThis.disposedPhone = document.querySelector('.pocket-phone');
        if (mode === 'embedded') startupHarness.app.dispose();
        else {
          // A chat switch goes through the production replacement path and disposes the pending UI.
          startupHarness.context.chatId = 'other'; startupHarness.context.chatMetadata = { pocketPhone: { schemaVersion: 1, contacts: [], theme: 'day', lockStyle: 'rounded' } };
          document.querySelector('#pocket-phone-launch').click();
        }
      }, mode);
      await disposed.releaseCss(0); await disposed.settle();
      assert.deepEqual(await disposed.page.evaluate(() => ({ connected: disposedPhone.isConnected, display: disposedPhone.style.display })), { connected: false, display: 'none' });
      assert.deepEqual(await disposed.page.evaluate(() => startupHarness.errors), []); await disposed.checkClean();
      results.push({ kind, mode, scenario: 'disposed UI ignores late stylesheet load', pass: true });
    } finally { await disposed.page.close(); }
  }
  for (const opening of process.env.POCKET_STYLE_ONLY_RETRY ? [] : ['launcher', 'command', 'host-input']) {
    const f = await fixture('native', 'standalone', 1200);
    try {
      await f.page.evaluate(async path => {
        const { mountEmbedded } = await import(path);
        startupHarness.extra = mountEmbedded({ release: { version: '0.3.9', sha: 'a'.repeat(40) } });
      }, prefix + 'embed.js');
      if (opening === 'command') await f.page.evaluate(() => startupHarness.context.SlashCommandParser.commands['tmt-open'].callback());
      else await f.open();
      await f.waitCss(1);
      if (opening === 'host-input') await f.page.locator('#host-input').click();
      await f.releaseCss(); await f.phone.locator('[role="alertdialog"]').waitFor();
      assert.equal(await f.phone.evaluate(node => node.shadowRoot.activeElement?.dataset.action || document.activeElement.id), opening === 'host-input' ? 'host-input' : 'conflict-continue', `pending CSS preserves conflict focus ownership (${opening})`);
      if (opening !== 'host-input') {
        await f.page.keyboard.press('Escape');
        assert.equal(await f.phone.locator('[role="alertdialog"]').count(), 0, 'the initial conflict modal keeps its Escape entry');
        assert.equal(await f.phone.evaluate(node => node.hidden), false);
      }
      assert.deepEqual(await f.page.evaluate(() => startupHarness.errors), []); await f.checkClean();
      results.push({ kind: 'native', mode: 'standalone + embedded', scenario: `conflict initial focus from ${opening}`, pass: true });
    } finally { await f.page.close(); }
  }
  for (const moveFocus of process.env.POCKET_STYLE_ONLY_CONFLICT ? [] : [false, true]) {
    const f = await fixture('native', 'standalone', 1200);
    try {
      await f.page.evaluate(async path => {
        const { mountEmbedded } = await import(path);
        startupHarness.extra = mountEmbedded({ release: { version: '0.3.9', sha: 'a'.repeat(40) } });
      }, prefix + 'embed.js');
      await f.open(); await f.waitCss(1); await f.releaseCss(0, false);
      await f.page.waitForFunction(() => startupHarness.errors.length === 1);
      await f.page.evaluate(() => {
        document.body.tabIndex = -1; document.body.focus();
        startupHarness.context.SlashCommandParser.commands['tmt-open'].callback();
      });
      await f.waitCss(2);
      if (moveFocus) await f.page.locator('#host-input').click();
      await f.releaseCss(1); await f.phone.locator('[role="alertdialog"]').waitFor();
      assert.equal(await f.phone.evaluate(node => node.shadowRoot.activeElement?.dataset.action || document.activeElement.id), moveFocus ? 'host-input' : 'conflict-continue', `CSS retry captures its own opening focus (host focus moved: ${moveFocus})`);
      if (!moveFocus) {
        await f.page.keyboard.press('Escape');
        assert.equal(await f.phone.locator('[role="alertdialog"]').count(), 0);
      } else {
        await f.page.locator('#host-input').press('x');
        assert.equal(await f.page.locator('#host-input').inputValue(), 'x');
      }
      assert.equal(await f.page.evaluate(() => startupHarness.errors.length), 1);
      await f.checkClean();
      results.push({ kind: 'native', mode: 'standalone + embedded', scenario: moveFocus ? 'CSS retry preserves later host input focus' : 'CSS retry from a different public entry focuses conflict modal and supports Escape', pass: true });
    } finally { await f.page.close(); }
  }
  if (process.env.POCKET_STYLE_RESULT) await writeFile(process.env.POCKET_STYLE_RESULT, JSON.stringify({ source, results }, null, 2) + '\n');
  console.log(JSON.stringify({ source, results }, null, 2));
} finally { await browser.close(); }
