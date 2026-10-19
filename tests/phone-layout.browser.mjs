import { openApp } from './navigation.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(process.env.POCKET_PLAYWRIGHT_MODULE || '/tmp/st-tools-browser/package.json')('playwright');
const browser = await chromium.launch({ executablePath: process.env.POCKET_BROWSER_EXECUTABLE || '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', headless: true, args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: process.env.POCKET_BROWSER_LIBS || '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
const failures = [];
const check = (label, actual, expected) => { try { assert.deepEqual(actual, expected, label); } catch (error) { failures.push(error.message); } };
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-18T01:37:00Z') });
  const url = new URL(process.env.POCKET_PREVIEW_URL || 'http://127.0.0.1:8917/tests/preview.html');
  url.searchParams.set('clock', 'story');
  await page.goto(url.href);
  await page.locator('.phone-shell').waitFor();
  check('top brand row removed', await page.locator('.phone-top').count(), 0);
  check('home uses story time', await page.locator('.home-clock text').textContent(), '2358');
  await page.clock.fastForward(61000);
  check('real minutes do not advance story time', await page.locator('.home-clock text').textContent(), '2358');
  await openApp(page, '短信');
  await page.getByRole('button', { name: /林舟/ }).click();
  check('chat fills the screen inside the phone bezel', await page.evaluate(() => {
    const root = document.querySelector('.pocket-phone').shadowRoot;
    const shell = root.querySelector('.phone-shell'), bounds = shell.getBoundingClientRect();
    const border = parseFloat(getComputedStyle(shell).borderLeftWidth);
    return ['.message-feed', '.composer'].every(selector => {
      const box = root.querySelector(selector).getBoundingClientRect();
      return Math.abs(box.x - bounds.x - border) < 1 && Math.abs(box.width - shell.clientWidth) < 1;
    });
  }), true);
  check('chat has no nested rounded container', await page.locator('.message-feed').evaluate(x => getComputedStyle(x).borderRadius), '0px');
  const sentText = '这条用来检查短信时间。';
  await page.getByRole('textbox', { name: '短信内容' }).fill(sentText);
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await page.getByRole('log').getByText(sentText, { exact: true }).waitFor();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('log').getByText('好，那我在书店门口等你。', { exact: true }).waitFor();
  const sent = page.getByRole('log').locator('.message-row').filter({ hasText: sentText });
  check('SMS use story time', await sent.locator('time').textContent(), '23:58');
  check('sent timestamp is above the next reply bubble', await sent.evaluate(row => {
    const time = row.querySelector('time').getBoundingClientRect();
    const reply = row.nextElementSibling.querySelector('.bubble').getBoundingClientRect();
    return time.bottom <= reply.top;
  }), true);
  check('reply uses the same story time', await page.getByRole('log').locator('.message-row').last().locator('time').textContent(), '23:58');
  await openApp(page, '论坛');
  check('forum fills the screen without an extra inner frame', await page.evaluate(() => {
    const root = document.querySelector('.pocket-phone').shadowRoot, shell = root.querySelector('.phone-shell'), main = root.querySelector('.phone-main');
    return Math.abs(shell.clientWidth - main.getBoundingClientRect().width) < 1 && getComputedStyle(main).borderTopWidth === '0px';
  }), true);
  await page.getByRole('button', { name: '关闭手机', exact: true }).click();
  await page.evaluate(() => previewHarness.app.open());
  await page.locator('.view-home').waitFor();
  await page.evaluate(() => {
    window.originalClock = document.querySelector('.pocket-phone').shadowRoot.querySelector('.home-clock');
    previewHarness.mainMessages.push({ is_user: false, mes: '<!-- SDC-end | date=大陆历1686年10月5日 | weekday=周三 | time=00:04 -->' });
    previewHarness.storyUpdated();
  });
  check('main-story update refreshes the clock', await page.locator('.home-clock text').textContent(), '0004');
  check('story date does not become the real-world date', await page.locator('.home-date').textContent(), '大陆历1686年10月5日 / 周三');
  check('clock update does not rebuild the page', await page.evaluate(() => originalClock === document.querySelector('.pocket-phone').shadowRoot.querySelector('.home-clock')), true);
  await page.evaluate(() => { previewHarness.mainMessages.at(-1).mes = '本楼没有时间戳。'; previewHarness.storyUpdated(); });
  check('missing current timestamp falls back to real time', await page.locator('.home-clock text').textContent(), '0938');
  check('clock updates never write metadata', await page.evaluate(() => previewHarness.metadataSaves), 2);
  check('no runtime errors', errors, []);
  assert.deepEqual(failures, []);
  console.log('Edge-to-edge phone pages, unobstructed message times, story clock updates and real-time fallback passed. Simulated host only.');
} finally { await browser.close(); }
