import { openApp } from './navigation.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/RecentRequestLog/tour.js', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
  await page.route('**/scripts/world-info.js', route => route.fulfill({ body: 'export const selected_world_info=[]; export const world_info={}; export const loadWorldInfo=async()=>({entries:{}});', contentType: 'text/javascript' }));
  await page.goto('http://127.0.0.1:8917/tests/preview.html?entry=extension');
  await page.getByRole('button', { name: '打开两三事', exact: true }).click();
  // The real phone adapter is initialized first. Only the network below both plugins is replaced.
  await page.evaluate(() => {
    const menu = document.createElement('div'); menu.id = 'extensionsMenu'; document.body.append(menu);
    const ctx = SillyTavern.getContext();
    ctx.event_types = { ...ctx.eventTypes, APP_READY: 'ready' };
    ctx.eventSource.once = (name, callback) => { window.loggerReady = callback; };
    const original = window.fetch;
    window.fetch = (path, init) => String(path).includes('/api/backends/chat-completions/generate')
      ? Promise.resolve(Response.json({ choices: [{ message: { content: '{"messages":[{"text":"日志联动示例回复"}]}' } }] }))
      : original(path, init);
  });
  // Execute the actual installed logger unchanged, including its fetch hook and request classifier.
  await page.addScriptTag({ path: new URL('../../RecentRequestLog/index.js', import.meta.url).pathname });
  await page.evaluate(() => loggerReady());
  await page.waitForFunction(() => typeof window.__rlogDebug?.getRecords === 'function');
  await openApp(page, '短信');
  await page.getByRole('button', { name: /林舟/ }).click();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByText('日志联动示例回复', { exact: true }).waitFor();
  await page.waitForFunction(() => __RLogApi.records().length === 1);
  const record = await page.evaluate(() => { const record = __RLogApi.records()[0]; return { source: record.source.type, messages: record.messages.map(item => ({ role: item.role, content: item.content })) }; });
  assert.equal(record.source, 'plugin');
  assert.ok(record.messages.some(item => item.role === 'system' && item.content.includes('指定联系人')));
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => previewHarness.mainMessages.length), 1);
  console.log('Actual RecentRequestLog script installed after phone captured one plugin request. Network and host persistence are simulated.');
} finally { await browser.close(); }
