import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve, extname } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const repo = resolve(import.meta.dirname, '..'), tools = process.env.TMT_BROWSER_TOOLS || '/tmp/tmt-hot-browser-20261026';
const output = process.env.TMT_STORY_OUTPUT || '/tmp/tmt-story-sms-drafts'; await mkdir(output, { recursive: true });
const { chromium } = createRequire(resolve(tools, 'package.json'))('playwright');
const browser = await chromium.launch({ executablePath: resolve(tools, 'browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell'), env: { ...process.env, LD_LIBRARY_PATH: resolve(tools, 'libs/usr/lib/x86_64-linux-gnu') } });
const prefix = '/scripts/extensions/third-party/ST-PocketPhone/';
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const results = [], errors = [], blocked = [];
try {
  for (const host of ['native', 'luker']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); page.setDefaultTimeout(6000); page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      if (url.hostname === '127.0.0.1' && path === prefix + 'index.js') return route.fulfill({ contentType: 'text/javascript', body: "import { initialize } from './dist/runtime.js'; startupHarness.app = initialize();" });
      if (url.hostname === '127.0.0.1' && path.startsWith(prefix)) return route.fulfill({ path: resolve(repo, decodeURIComponent(path.slice(prefix.length))), contentType: mime[extname(path)] || 'application/octet-stream' });
      if (path === '/scripts/extensions.js') return route.fulfill({ contentType: 'text/javascript', body: "export const extensionTypes={'third-party/ST-PocketPhone':'local'};" });
      if (path === '/api/extensions/version') return route.fulfill({ json: { currentBranchName: 'main', currentCommitHash: 'f3f712535789088c897ba8a13115518606d77315', remoteUrl: 'https://github.com/atonal519/ST-TwoMoreThings', isUpToDate: true } });
      if (path === '/lib.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const DOMPurify={sanitize:x=>x};export const showdown={Converter:class{makeHtml(x){return x}}};' });
      if (path === '/scripts/world-info.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const selected_world_info=[];export const world_info={charLore:[]};export const world_info_case_sensitive=false;export const world_info_match_whole_words=false;export async function loadWorldInfo(){return {entries:{}}}' });
      blocked.push(path); return route.abort();
    });
    await page.goto(`http://127.0.0.1:8917${prefix}tests/startup.html?host=${host}`); await page.waitForFunction(() => startupHarness.ready);
    const raw = '<content><draft>[tmt|朋友甲|我]正式原话，保留  两格。[/tmt]</draft><draft>[tmt|朋友甲|我]正式原话，保留  两格。[/tmt]</draft><draft>[tmt|朋友甲|我]正式原话，保留  两格。[/tmt]</draft>正式叙事。[tmt|朋友甲|我]正式原话，保留  两格。[/tmt]</content>';
    await page.evaluate(raw => {
      const h = startupHarness, state = h.metadata.pocketPhone; state.contacts = []; state.groups = []; state.conversations = {};
      h.context.chat[0].mes = raw;
      h.settings['schedule-planner'].bodyWrappers = { keepTags: 'content,titlebar', extraTags: '[[...]],think,thinking,snow,sidestory,bbi_image,[draft]...[/draft],draft' };
      h.app.open();
    }, raw);
    await page.waitForFunction(() => startupHarness.metadata.pocketPhone.storySmsImportedFloor === 0);
    const imported = await page.evaluate(() => { const h=startupHarness,s=h.metadata.pocketPhone;return { rows:Object.values(s.conversations).flat(),metadataSaves:h.metadataSaves,raw:h.context.chat[0].mes,errors:h.errors }; });
    assert.equal(imported.rows.length, 1); assert.equal(imported.rows[0].source.block, 3); assert.equal(imported.rows[0].id, 'story:0:3');
    assert.equal(imported.rows[0].role, 'user'); assert.equal(imported.rows[0].speakerId, '@user'); assert.equal(imported.rows[0].text, '正式原话，保留  两格。');
    assert.equal(imported.metadataSaves, 1); assert.equal(imported.raw, raw); assert.deepEqual(imported.errors, []);
    await page.evaluate(() => startupHarness.app.open());
    assert.equal(await page.evaluate(() => startupHarness.metadataSaves), 1, 'same-floor reopening does not save or import twice');
    results.push({ host, count: imported.rows.length, source: imported.rows[0].source, metadataSaves: imported.metadataSaves, sameFloorSaves: 1, modelRequests: 0, realUserWrites: 0 });
    await page.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(blocked, []); console.log(JSON.stringify({ pass: true, results, errors, blocked }));
} finally { await writeFile(resolve(output, 'result.json'), JSON.stringify({ results, errors, blocked }, null, 2)); await browser.close(); }
