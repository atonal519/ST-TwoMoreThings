import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { openApp } from './navigation.mjs';
const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const output = '/tmp/mobile-plugin-reference-research/lock-style-round'; mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
try {
  for (const style of ['stacked', 'rounded']) for (const host of ['native', 'luker']) for (const width of [320, 390, 640, 641]) {
    const clockClass = style === 'stacked' ? 'stack-clock' : 'round-clock';
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: width <= 640, hasTouch: width <= 640 });
    page.setDefaultTimeout(5000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__font/*', route => {
      const name = basename(new URL(route.request().url()).pathname), path = '/tmp/mobile-plugin-reference-research/preview-fonts/' + name;
      return route.fulfill({ path: existsSync(path) ? path : '/tmp/myriad-home-design-20261016/' + name, contentType: 'font/woff2' });
    });
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${host}&clock=story&notifications=1`);
    await page.locator('.phone-shell').waitFor();
    await page.evaluate(css => {
      const face = document.createElement('style'); face.textContent = css; document.head.append(face);
      const style = document.createElement('style'); style.textContent = ':host{font-family:PocketPreviewCJK,sans-serif}'; document.querySelector('.pocket-phone').shadowRoot.append(style);
    }, readFileSync('/tmp/mobile-plugin-reference-research/preview-fonts.css', 'utf8').replaceAll('Nowar Rounded TW Wc', 'PocketPreviewCJK'));
    await openApp(page, '设置');
    await page.getByRole('button', { name: '外观设置', exact: true }).click();
    assert.equal(await page.getByLabel('锁屏样式', { exact: true }).inputValue(), 'classic');
    await page.getByLabel('锁屏样式', { exact: true }).selectOption(style);
    await page.waitForFunction(style => previewHarness.metadata.pocketPhone.lockStyle === style, style);
    assert.equal(await page.getByRole('button', { name: style === 'stacked' ? '湖蓝玻璃' : '花瓣剪纸', exact: true }).count(), 0, '默认背景不再重复一份相同预设');
    for (const theme of ['day', 'night']) {
      if (theme === 'night') {
        await openApp(page, '设置');
        await page.getByLabel('外观主题', { exact: true }).selectOption('night');
        await page.waitForFunction(() => previewHarness.metadata.pocketPhone.theme === 'night');
      }
      await page.getByRole('button', { name: '关闭手机', exact: true }).click();
      await page.evaluate(() => previewHarness.app.open());
      await page.locator(`.${clockClass}`).waitFor();
      await page.evaluate(async () => { await document.fonts.load('180px PocketPhoneClock', '0123456789'); await document.fonts.load('500 100px PocketPhoneRoundClock', '0123456789'); await document.fonts.load('13px PocketPreviewCJK', '大陆历年月日周二林舟书店碰头小组不急慢慢来我替你留了靠窗的位置买好咖啡你们喝什么'); await document.fonts.ready; });
      assert.equal(await page.locator('.home-clock').getAttribute('aria-label'), '当前时间 23:58');
      assert.equal(await page.locator('.home-wallpaper').evaluate((img, { style, theme }) => style === 'stacked' ? img.src.startsWith('data:image/svg+xml') : img.complete && img.naturalWidth > 0 && img.src.endsWith(`/assets/lock-petals-${theme}.png`), { style, theme }), true);
      await page.evaluate(() => { previewHarness.originalClock = document.querySelector('.pocket-phone').shadowRoot.querySelector('.home-clock'); });
      for (const time of ['16:57', '11:11', '08:08', '23:59', '10:04', '00:00']) {
        await page.evaluate(async time => {
          previewHarness.mainMessages[0].mes = `<!-- QQJ-end | date=大陆历1686年10月4日 | weekday=周二 | time=${time} -->`;
          await previewHarness.storyUpdated();
        }, time);
        assert.equal(await page.locator(`.${clockClass}`).textContent(), time.replace(':', ''));
        const layout = await page.locator('.view-home').evaluate((main, { style, clockClass }) => {
          const box = selector => main.querySelector(selector).getBoundingClientRect();
          const cells = [...main.querySelectorAll(`.${clockClass} > span`)].map(node => node.getBoundingClientRect());
          const clock = box(`.${clockClass}`), notices = box('.lock-notifications'), finger = box('.unlock-button'), shell = main.closest('.phone-shell').getBoundingClientRect(), date = box('.home-date'), weather = box('.lock-weather');
          const aligned = style === 'stacked' ? Math.abs(cells[0].x - cells[2].x) < .1 && Math.abs(cells[1].x - cells[3].x) < .1 : cells.every(cell => Math.abs(cell.y - cells[0].y) < .1);
          return { aligned: aligned && cells.every(cell => Math.abs(cell.width - cells[0].width) < .1), room: clock.bottom <= notices.top && date.bottom <= notices.top && weather.bottom <= notices.top, finger: Math.abs(finger.x + finger.width / 2 - shell.x - shell.width / 2) < 1, overflow: main.scrollHeight > main.clientHeight + 1 };
        }, { style, clockClass });
        assert.deepEqual(layout, { aligned: true, room: true, finger: true, overflow: false }, `${host} ${width} ${theme} ${time}`);
        assert.equal(await page.evaluate(() => previewHarness.originalClock === document.querySelector('.pocket-phone').shadowRoot.querySelector('.home-clock')), true, '只更新时间，不重建页面');
      }
      await page.locator('.phone-shell').screenshot({ path: `${output}/${style}-${host}-${width}-${theme}.png` });
      if (width === 390) {
        await page.setViewportSize({ width, height: 430 });
        assert.equal(await page.locator('.view-home').evaluate((main, clockClass) => {
          const clock = main.querySelector(`.${clockClass}`).getBoundingClientRect(), notices = main.querySelector('.lock-notifications').getBoundingClientRect(), weather = main.querySelector('.lock-weather').getBoundingClientRect();
          return clock.bottom <= notices.top && weather.bottom <= notices.top && main.scrollHeight <= main.clientHeight + 1;
        }, clockClass), true, '短视口也不压住通知');
        await page.setViewportSize({ width, height: 844 });
      }
      if (theme === 'day') {
        await page.evaluate(async () => {
          previewHarness.mainMessages[0].mes = '<!-- QQJ-end | date=大陆历1686年10月4日 | weekday=周二 | time=23:58 -->';
          await previewHarness.storyUpdated();
        });
      }
    }
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 0);
    await page.locator('.lock-notification').first().click();
    await page.locator('.message-feed').waitFor();
    await openApp(page, '设置');
    await page.getByLabel('锁屏样式', { exact: true }).selectOption('classic');
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.lockStyle === 'classic');
    await page.getByRole('button', { name: '关闭手机', exact: true }).click();
    await page.evaluate(() => previewHarness.app.open());
    assert.equal(await page.locator('.stack-clock').count(), 0);
    await page.locator('.home-clock text').waitFor();
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Native/Luker 320/390/640/641: stacked/rounded styles, matching day/night backgrounds, clock updates without rebuilding, notices/date/fingerprint, short viewport, notice jump and legacy style passed. Mock hosts only.');
} finally { await browser.close(); }
