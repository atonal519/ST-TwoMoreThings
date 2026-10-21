import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createAuthoringService } from '../src/authoring.js';
import { createPhoneStore } from '../src/store.js';
import { createHarness } from './harness.mjs';
import { openApp } from './navigation.mjs';

const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const h = createHarness(), store = createPhoneStore({ target: h.host.captureChat() });
const { script } = await createAuthoringService({ store, host: h.host }).exportScript();
const revisions = ['a'.repeat(40), 'b'.repeat(40)], prefix = '/gh/atonal519/ST-TwoMoreThings@';
const bundledRevision = '079f7f84e763382758267aed25ecfc66ad923b45';
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
try {
  for (const kind of ['native', 'luker']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(6000);
    let current = 0, failure = '', checks = 0;
    const requested = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://api.github.com/repos/atonal519/ST-TwoMoreThings/git/ref/heads/main', async route => {
      checks++;
      assert.equal(route.request().postData(), null, 'update checks send no archive or settings');
      assert.equal(route.request().headers()['authorization'], undefined);
      assert.equal(route.request().headers()['x-csrf-token'], undefined);
      if (failure === 'network') return route.abort('failed');
      if (failure === 'timeout') { await new Promise(resolve => setTimeout(resolve, 9000)); return route.abort().catch(() => {}); }
      return route.fulfill({ status: failure === 'rate-limit' ? 403 : 200, json: failure === 'rate-limit' ? { message: 'API rate limit exceeded' } : failure === 'invalid' ? { object: { type: 'tag', sha: 'unknown' } } : { object: { type: 'commit', sha: revisions[current] } }, headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    await page.route('https://cdn.jsdelivr.net/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      assert.ok(pathname.startsWith(prefix), pathname);
      const [revision, ...parts] = pathname.slice(prefix.length).split('/'), file = parts.join('/');
      assert.ok(['main', bundledRevision, ...revisions].includes(revision));
      requested.push({ revision, file });
      const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=604800' };
      if (file === 'src/version.js') return route.fulfill({ contentType: 'text/javascript', body: `export const VERSION = '${revision === 'main' ? '0.1.0' : revision === bundledRevision ? '0.3.4' : revision === revisions[0] ? '0.3.1' : '0.3.2'}';`, headers });
      const types = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
      return route.fulfill({ body: readFileSync(resolve(import.meta.dirname, '..', file)), contentType: types[extname(file)] || 'text/plain', headers });
    });
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${kind}`);
    await page.locator('.phone-shell').waitFor();
    const before = await page.evaluate(async kind => {
      previewHarness.app.dispose();
      globalThis[kind === 'native' ? 'SillyTavern' : 'Luker'] = { getContext: () => previewHarness.context };
      globalThis.toastr = { error: message => (previewHarness.loadErrors ||= []).push(message), warning: message => (previewHarness.loadWarnings ||= []).push(message) };
      previewHarness.metadata.pocketPhone.userProfile = { name: '读者自己的名字' };
      previewHarness.metadata.pocketPhone.wallpapers = { day: '/assets/stickers/sepia-0.png' };
      await import('https://cdn.jsdelivr.net/gh/atonal519/ST-TwoMoreThings@main/embed.js');
      return { archive: JSON.stringify(previewHarness.metadata), settings: JSON.stringify(previewHarness.settings), saves: previewHarness.metadataSaves };
    }, kind);
    requested.length = 0;
    const load = async () => {
      await page.evaluate(script => {
        previewHarness.reloadScript = script;
        const frame = document.createElement('iframe'); frame.id = 'update-script'; frame.hidden = true;
        frame.srcdoc = '<script>window.getVariables=()=>parent.previewHarness.reloadScript.data;<\/script><script type="module">' + script.content + '<\/script>';
        document.body.append(frame);
      }, script);
    };
    const unload = async () => {
      await page.evaluate(() => { const frame = document.getElementById('update-script'); frame.contentWindow.dispatchEvent(new frame.contentWindow.Event('pagehide')); frame.remove(); });
      await page.locator('#pocket-phone-card-host').waitFor({ state: 'detached' });
    };
    for (current = 0; current < 2; current++) {
      await load();
      await page.getByRole('button', { name: '打开两三事 · 随卡', exact: true }).waitFor();
      assert.equal(checks, current + 1, 'every script start resolves the published commit');
      assert.ok(requested.length > 5, 'loads the real core and its dependencies');
      assert.ok(requested.every(item => item.revision === revisions[current]), 'all modules and styles share the resolved immutable revision');
      await page.getByRole('button', { name: '打开两三事 · 随卡', exact: true }).click();
      const embedded = page.locator('#pocket-phone-card-host');
      await openApp(embedded, '设置');
      await embedded.getByText(`两三事 0.3.${current + 1}`, { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => JSON.stringify(previewHarness.metadata)), before.archive);
      assert.equal(await page.evaluate(() => JSON.stringify(previewHarness.settings)), before.settings);
      assert.equal(await page.evaluate(() => previewHarness.metadataSaves), before.saves);
      await unload(); requested.length = 0;
    }
    for (failure of ['rate-limit', 'network', 'invalid', 'timeout']) {
      await page.evaluate(() => { previewHarness.loadErrors = []; previewHarness.loadWarnings = []; });
      const checksBefore = checks;
      await load();
      await page.getByRole('button', { name: '打开两三事 · 随卡', exact: true }).waitFor({ timeout: 8000 });
      assert.equal(checks, checksBefore + 1, 'failed lookups are not retried');
      await page.waitForFunction(() => previewHarness.loadWarnings.length === 1);
      assert.deepEqual(await page.evaluate(() => previewHarness.loadErrors), [], 'unavailable updates do not prevent startup');
      assert.ok(requested.every(item => item.revision === bundledRevision), 'uses the stable published revision rather than a cached mutable branch');
      await page.getByRole('button', { name: '打开两三事 · 随卡', exact: true }).click();
      const embedded = page.locator('#pocket-phone-card-host');
      await openApp(embedded, '设置');
      await embedded.getByText('两三事 0.3.4', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => JSON.stringify(previewHarness.metadata)), before.archive);
      assert.equal(await page.evaluate(() => JSON.stringify(previewHarness.settings)), before.settings);
      assert.equal(await page.evaluate(() => previewHarness.metadataSaves), before.saves);
      await unload(); requested.length = 0;
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Native/Luker: fresh pinned revisions, rate-limit/network/invalid/timeout fallback to the bundled release, one lookup per start, visible warnings and versions, and unchanged reader data passed. Mock network only.');
} finally { await browser.close(); }
