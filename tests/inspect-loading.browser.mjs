import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApp } from './navigation.mjs';

const { chromium } = createRequire(process.env.POCKET_PLAYWRIGHT_PACKAGE || '/tmp/st-tools-browser/package.json')('playwright-core');
const output = resolve(process.env.INSPECT_EVIDENCE || '/tmp/inspect-loading-evidence');
mkdirSync(output, { recursive: true });
const url = new URL(process.env.POCKET_PREVIEW_URL || 'http://127.0.0.1:8941/tests/preview.html');
const browser = await chromium.launch({ executablePath: process.env.POCKET_CHROMIUM, headless: true, args: ['--no-sandbox'] });
let checks = 0;
const check = (value, expected, message) => { assert.deepEqual(value, expected, message); checks++; };
const metrics = page => page.evaluate(() => ({ models: previewHarness.requests.length, saves: previewHarness.metadataSaves, settings: previewHarness.settingsSaves }));
const back = page => page.locator('.system-nav [data-action="system-back"]').click();
const errors = [], layouts = [], requests = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: Number(process.env.INSPECT_DPR || 1) });
  page.on('pageerror', error => errors.push(error.message));
  let holdMedia, failMedia = false;
  await page.route('**/*', async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== url.origin) return route.abort();
    if (requestUrl.pathname.endsWith('/tests/preview.js')) {
      const response = await route.fetch();
      return route.fulfill({ response, body: (await response.text()).replace('const settings = {', "const settings = { pocketPhone: { apiSourceRef: { kind: 'shared-preset', presetId: 'daily' } },") });
    }
    if (requestUrl.pathname.includes('/assets/inspect-phone/')) {
      requests.push(requestUrl.pathname);
      const gate = holdMedia; holdMedia = undefined;
      if (gate) await gate;
      if (failMedia) { failMedia = false; return route.abort(); }
    }
    if (process.env.INSPECT_SOURCE === '1' && requestUrl.pathname.endsWith('/index.js')) {
      const response = await route.fetch();
      return route.fulfill({ response, body: (await response.text()).replaceAll(/\.\/dist\/runtime\.js(?:\?[^']*)?/g, './src/runtime.js') });
    }
    return route.continue();
  });
  await page.goto(url.href);
  await openApp(page, '查手机');
  const initial = await metrics(page);
  check(requests.length, 0, 'owner selection does not preload media');

  for (const width of process.env.INSPECT_SKIP_LAYOUTS === '1' ? [] : (process.env.INSPECT_WIDTHS || '320,390,1100').split(',').map(Number)) for (const theme of ['day', 'night']) for (const lockStyle of ['classic', 'stacked', 'rounded']) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(({ theme, lockStyle }) => { Object.assign(previewHarness.metadata.pocketPhone, { theme, lockStyle }); previewHarness.app.open(); }, { theme, lockStyle });
    await page.locator('[data-inspect-owner="lin"]').click();
    const image = page.locator('.inspect-loading img');
    await image.evaluate(image => image.decode());
    const geometry = await page.locator('.phone-shell').evaluate(shell => {
      const root = shell.getRootNode(), main = shell.querySelector('.phone-main'), image = main.querySelector('img');
      const s = shell.getBoundingClientRect(), m = main.getBoundingClientRect(), i = image.getBoundingClientRect();
      const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      const inner = { left: s.left + shell.clientLeft, top: s.top + shell.clientTop, width: shell.clientWidth, height: shell.clientHeight };
      const corners = [[inner.left + 12, inner.top + 12], [inner.left + inner.width - 12, inner.top + 12], [inner.left + 12, inner.top + inner.height - 12], [inner.left + inner.width - 12, inner.top + inner.height - 12]];
      return {
        bounds: [m.left - inner.left, m.top - inner.top, m.width - inner.width, m.height - inner.height],
        center: [i.left + i.width / 2 - inner.left - inner.width / 2, i.top + i.height / 2 - inner.top - inner.height / 2],
        image: [i.width, i.height], naturalSize: [image.naturalWidth, image.naturalHeight], themeBackground: getComputedStyle(main).getPropertyValue('--pp-paper').trim(), background: getComputedStyle(main).backgroundColor,
        corners: corners.map(([x, y]) => root.elementFromPoint(x, y) === main),
        childCount: [...shell.children].filter(visible).length, mainText: main.textContent,
        otherElements: [...shell.querySelectorAll('button, nav, header, footer, h1, .phone-status, .feedback')].filter(visible).length,
        assetBackground: [...context.getImageData(0, 0, 1, 1).data],
        imageCount: shell.querySelectorAll('img').length, overflow: main.scrollWidth > main.clientWidth || main.scrollHeight > main.clientHeight,
      };
    });
    check(geometry.bounds, [0, 0, 0, 0], 'loading covers all inner screen bounds');
    check(geometry.center, [0, 0], 'image is centered against the whole inner screen');
    const background = theme === 'night' ? [13, 32, 44] : [243, 241, 232];
    check(geometry.background, `rgb(${background.join(', ')})`, 'loading follows the current phone theme');
    check(geometry.themeBackground, theme === 'night' ? '#0d202c' : '#f3f1e8', 'loading consumes the phone paper variable');
    check(geometry.assetBackground, [...background, 255], 'the actual animation background exactly matches the screen');
    check(geometry.naturalSize, [600, 464], 'the animation has double the original display resolution');
    check(geometry.corners, [true, true, true, true], 'all four corners are the loading surface');
    check([geometry.childCount, geometry.mainText, geometry.otherElements, geometry.imageCount, geometry.overflow], [1, '', 0, 1, false], 'the screen contains only the image');
    check((await image.getAttribute('src')).includes(`/${theme}.gif?v=`), true, 'animation follows the current phone theme');
    const name = `dpr${process.env.INSPECT_DPR || 1}-${width}-${theme}-${lockStyle}`;
    layouts.push({ name, ...geometry });
    await page.locator('.phone-shell').screenshot({ path: `${output}/${name}.png` });
    await page.locator('.inspect-owned-content').waitFor();
    check(await page.locator('.phone-status').count(), 1, 'status returns after loading');
    check(await page.locator('.system-nav').count(), 1, 'navigation returns after loading');
    await page.getByRole('button', { name: '微信', exact: true }).click();
    await page.locator('.view-inspect-wechat').waitFor();
    await page.locator('.system-nav [data-action="system-home"]').click();
    await back(page);
    check(await page.locator('[data-inspect-owner="lin"]').count(), 1, 'owner desktop navigation is restored');
  }

  let release;
  holdMedia = new Promise(resolve => { release = resolve; });
  await page.locator('[data-inspect-owner="lin"]').click();
  await page.locator('.inspect-loading img').waitFor();
  await page.waitForTimeout(2250);
  check(await page.locator('.inspect-loading').count(), 1, 'the timer begins after image load');
  release();
  await page.locator('.inspect-loading img').evaluate(image => image.decode());
  await page.waitForTimeout(1500);
  check(await page.locator('.inspect-loading').count(), 1, 'the full animation remains visible after cold media loading');
  await page.keyboard.press('Escape');
  await page.evaluate(() => previewHarness.app.open());
  await openApp(page, '查手机');
  await page.waitForTimeout(800);
  check(await page.locator('.view-inspect-phone').count(), 1, 'closing cancels an active animation timer');

  holdMedia = new Promise(resolve => { release = resolve; });
  await page.locator('[data-inspect-owner="zhou"]').click();
  await page.locator('.inspect-loading img').waitFor();
  await page.keyboard.press('Escape');
  release();
  await page.evaluate(() => previewHarness.app.open());
  await openApp(page, '查手机');
  await page.waitForTimeout(2250);
  check(await page.locator('.view-inspect-phone').count(), 1, 'late media after exit does not change the route');

  check(await metrics(page), initial, 'loading and navigation use no model and save no data');
  await page.locator('[data-inspect-owner="lin"]').click();
  await page.locator('.inspect-owned-content').waitFor();
  await page.getByRole('button', { name: '微信', exact: true }).click();
  await page.evaluate(() => { previewHarness.replyWait = new Promise((resolve, reject) => { previewHarness.rejectReply = reject; }); });
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.waitForFunction(() => previewHarness.requests.length === 1);
  await page.locator('.system-nav [data-action="system-home"]').click();
  await back(page);
  await page.locator('[data-inspect-owner="zhou"]').click();
  await page.locator('.inspect-loading img').evaluate(image => image.decode());
  await page.evaluate(() => { previewHarness.replyWait = null; previewHarness.rejectReply(new Error('模拟晚到的刷新失败')); });
  await page.waitForTimeout(100);
  check(await page.locator('.inspect-loading').count(), 1, 'a late async failure leaves the loading screen active');
  check(await page.locator('.feedback, .phone-status, .phone-footer').count(), 0, 'late feedback does not overlay the image-only screen');
  await page.locator('.inspect-owned-content').waitFor();
  check(await page.getByRole('alert').filter({ hasText: '生成请求未能连接' }).count(), 1, 'the pending feedback appears when normal UI returns');
  await back(page);

  await page.evaluate(() => { previewHarness.metadata.pocketPhone.theme = 'night'; previewHarness.app.open(); });
  failMedia = true;
  await page.locator('[data-inspect-owner="zhou"]').click();
  await page.getByRole('heading', { name: '周予的手机', exact: true }).waitFor();
  check(await page.locator('.system-nav').count(), 1, 'media failure goes directly to the selected desktop');
  await back(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[data-inspect-owner="lin"]').click();
  await page.locator('.inspect-loading img').evaluate(image => image.decode());
  check(new URL(await page.locator('.inspect-loading img').getAttribute('src')).pathname.endsWith('/still-night.png'), true, 'reduced motion follows the current night theme');
  await page.locator('.phone-shell').screenshot({ path: `${output}/reduced-motion.png` });
  check(await metrics(page), { ...initial, models: 1 }, 'the isolated mocked failure is the only model request and saves no data');
  await page.locator('.inspect-owned-content').waitFor();
  await page.getByRole('button', { name: '微信', exact: true }).click();
  check(await page.getByLabel('生成条数', { exact: true }).count(), 0, 'natural generation has no quantity control');
  await page.evaluate(() => {
    const phone = previewHarness.metadata.pocketPhone;
    phone.inspectPhone = { owners: { ...phone.inspectPhone?.owners, lin: { people: [], conversations: [], count: 1 } } };
    previewHarness.reply = { conversations: [{ name: '周予', participantIds: ['@owner', 'zhou'], messages: Array.from({ length: 32 }, (_, index) => ({ speakerId: index % 2 ? '@owner' : 'zhou', text: `自然生成${index}。` })) }] };
  });
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.waitForFunction(() => previewHarness.metadata.pocketPhone.inspectPhone.owners.lin.conversations[0]?.messages.length === 32);
  const request = await page.evaluate(() => previewHarness.requests.at(-1).body.messages);
  check(Object.hasOwn(JSON.parse(request[1].content), 'count'), false, 'refresh request has no count target');
  check(/\bcount\b|目标.*条新消息|(?:20|二十)条/.test(request[0].content), false, 'prompt has no numeric message target');
  check(await metrics(page), { ...initial, models: 2, saves: initial.saves + 1 }, 'natural refresh uses one request and saves the full returned batch once');
  check(await page.evaluate(() => previewHarness.metadata.pocketPhone.inspectPhone.owners.lin.count), 1, 'the unused legacy count is preserved without migration');
  await page.locator('.phone-shell').screenshot({ path: `${output}/natural-wechat.png` });
  await page.evaluate(() => previewHarness.app.dispose());
  await page.waitForTimeout(2250);
  check(await page.locator('.pocket-phone').count(), 0, 'dispose clears the loading screen and timer');
  check(errors, [], 'browser has no errors');
  writeFileSync(`${output}/result.json`, JSON.stringify({ checks, layouts, requests, metrics: await metrics(page), errors }, null, 2));
  console.log(`inspect loading ${checks} checks passed; ${layouts.length} layout variants`);
} finally { await browser.close(); }
