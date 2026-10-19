import { openApp } from './navigation.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const output = '/tmp/mobile-plugin-reference-research/calendar-round'; mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
try {
  for (const host of ['native', 'luker']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/gouhua/**', route => route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(import.meta.dirname, '../../ST-SevenDaysCal', new URL(route.request().url()).pathname.replace('/gouhua/', ''))) }));
    await page.route('**/__font/*.woff2', route => { const name = basename(new URL(route.request().url()).pathname), local = '/tmp/mobile-plugin-reference-research/preview-fonts/' + name; return route.fulfill({ path: existsSync(local) ? local : '/tmp/myriad-home-design-20261016/' + name, contentType: 'font/woff2' }); });
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${host}`);
    await page.locator('.phone-shell').waitFor();
    const fontCSS = readFileSync('/tmp/mobile-plugin-reference-research/preview-fonts.css', 'utf8').replaceAll('Nowar Rounded TW Wc', 'PocketPreviewCJK');
    await page.evaluate(css => { const face = document.createElement('style'); face.textContent = css; document.head.append(face); const style = document.createElement('style'); style.textContent = ':host{font-family:PocketPreviewCJK,sans-serif}'; document.querySelector('.pocket-phone').shadowRoot.append(style); }, fontCSS);
    await page.evaluate(async () => { await document.fonts.load('15px PocketPreviewCJK', '日历回到本月纪念日节日初遇秋日庆典一二三四五六'); await document.fonts.ready; });
    assert.equal(await page.getByRole('button', { name: '日历', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '设置', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '短信', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '论坛', exact: true }).count(), 0);
    assert.equal(await page.locator('.system-nav').count(), 0);
    await openApp(page, '日历');
    assert.equal(await page.locator('.calendar-grid').count(), 0);
    assert.equal(await page.evaluate(() => previewHarness.metadataSaves), 0);
    await page.evaluate(async () => {
      const { createPhoneCalendarApi } = await import('/gouhua/business/axis/phone.js');
      const months = [31,29,31,30,31,30,31,31,30,31,30,31].map((days, i) => ({ name: `${i + 1}月`, days }));
      window.calendarFixture = { calendar: { kind: 'gregorian', months }, today: { year: 2026, month: 10, day: 18, weekday: 0 }, items: [
        { id: 'festival', name: '秋日节', type: 'festival', month: 10, day: 20, days: 2, note: '街区的秋日庆典。' },
        { id: 'anniversary', name: '书店初遇', type: 'anniversary', month: 10, day: 19, days: 1, note: '你与林舟初次相识的日子。' },
        { id: 'private-extra', name: '不属于Calendar的内容', type: 'custom', month: 10, day: 19, days: 1 },
      ] };
      window.calendarBefore = JSON.stringify(calendarFixture);
      window.STSevenDaysCal = createPhoneCalendarApi({ read: () => calendarFixture });
      dispatchEvent(new CustomEvent('st-sevendayscal:calendar-changed'));
    });
    await page.locator('.calendar-grid').waitFor();
    assert.equal(await page.locator('.calendar-day').count(), 31);
    await page.getByRole('button', { name: /2026年10月19日/ }).click();
    await page.locator('.calendar-events').getByText('书店初遇', { exact: true }).waitFor();
    assert.equal(await page.locator('.calendar-events').getByText('秋日节', { exact: true }).count(), 0);
    await page.getByRole('button', { name: '下个月', exact: true }).click();
    assert.equal(await page.locator('.calendar-day').count(), 30);
    await page.getByRole('button', { name: '回到本月', exact: true }).click();
    assert.equal(await page.locator('.calendar-day').count(), 31);
    assert.equal(await page.getByText('不属于Calendar的内容', { exact: true }).count(), 0);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.locator('.phone-main').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    }
    await page.evaluate(() => { calendarFixture.items[0].name = '更新后的秋日节'; dispatchEvent(new CustomEvent('st-sevendayscal:calendar-changed')); });
    await page.getByText('更新后的秋日节', { exact: true }).waitFor();
    await page.evaluate(() => { calendarFixture.items[0].name = '秋日节'; });
    for (const theme of ['day', 'night']) {
      await openApp(page, '设置');
      if (!(await page.getByRole('combobox', { name: '外观主题', exact: true }).count())) await page.getByRole('button', { name: '外观设置', exact: true }).click();
      await page.getByRole('combobox', { name: '外观主题', exact: true }).selectOption(theme);
      await openApp(page, '日历');
      await page.locator('.phone-shell').screenshot({ path: `${output}/${host}-${theme}.png` });
    }
    const baseline = await page.evaluate(() => ({ saves: previewHarness.metadataSaves, requests: previewHarness.requests.length }));
    await page.getByRole('button', { name: '关闭手机', exact: true }).click();
    await page.evaluate(() => previewHarness.app.open());
    await page.locator('.view-home').waitFor();
    const art = await page.locator('.home-artboard').elementHandle();
    await page.evaluate(() => dispatchEvent(new CustomEvent('st-sevendayscal:calendar-changed')));
    assert.equal(await art.evaluate(el => el.isConnected), true);
    assert.equal(await page.getByRole('button', { name: '日历', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '设置', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '短信', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '论坛', exact: true }).count(), 0);
    assert.equal(await page.locator('.system-nav').count(), 0);
    await openApp(page, '日历');
    assert.equal(await page.evaluate(() => previewHarness.metadataSaves), baseline.saves);
    assert.equal(await page.evaluate(() => previewHarness.requests.length), baseline.requests);
    assert.equal(await page.evaluate(() => JSON.stringify(calendarFixture) === calendarBefore), true);
    await openApp(page, '短信');
    await page.getByRole('button', { name: /林舟/ }).click();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.waitForFunction(() => previewHarness.requests.length > 0);
    const input = await page.evaluate(() => JSON.parse(previewHarness.requests.at(-1).body.messages[1].content));
    assert.deepEqual(input.calendar.events.map(item => item.name), ['书店初遇', '秋日节']);
    assert.equal(await page.evaluate(() => previewHarness.mainMessages.length), 1);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Calendar: absent source stays blank; real Gouhua projection drives native/Luker phone month/day navigation, live updates, day/night, read-only data and SMS context. Mock host/model only.');
} finally { await browser.close(); }
