import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, extname, basename } from 'node:path';

const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const root = resolve(import.meta.dirname, '..');
const output = '/tmp/mobile-plugin-reference-research/desktop-round';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--no-sandbox'],
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' },
});

try {
  for (const host of ['native', 'luker']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Shanghai' });
    page.setDefaultTimeout(4000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://127.0.0.1:8917/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.startsWith('/__font/')) {
        const name = basename(pathname), candidate = '/tmp/mobile-plugin-reference-research/preview-fonts/' + name;
        return route.fulfill({ path: existsSync(candidate) ? candidate : '/tmp/myriad-home-design-20261016/' + name, contentType: 'font/woff2' });
      }
      const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json' };
      return route.fulfill({ body: readFileSync(resolve(root, '.' + pathname)), contentType: types[extname(pathname)] || 'text/plain' });
    });
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${host}&clock=story`);
    await page.locator('.phone-shell').waitFor();
    assert.equal(await page.locator('.status-time').textContent(), '23:58');
    assert.equal(await page.locator('.home-clock text').textContent(), '2358');
    await page.getByRole('button', { name: '进入桌面', exact: true }).click();
    await page.locator('.view-desktop').waitFor();
    assert.equal(await page.locator('.desktop-app').count(), 5);
    assert.equal(await page.locator('.desktop-calendar').count(), 0, 'no Gouhua means no fabricated calendar widget');
    assert.equal(await page.locator('.status-time').textContent(), '23:58');

    await page.evaluate(() => {
      const days = Array.from({ length: 31 }, (_, index) => ({ day: index + 1, label: `2026年10月${index + 1}日`, isToday: index === 17, items: [] }));
      days[17].items = [{ id: 'anniversary', name: '书店初遇', type: 'anniversary', date: '10月18日', days: 1, note: '' }];
      window.desktopCalendar = { year: 2026, yearLabel: '2026年', month: 10, monthName: '10月', today: '2026年10月18日', title: '', eraLabel: '', weekdays: ['一', '二', '三', '四', '五', '六', '日'], columns: 7, leading: 3, days };
      window.desktopCalendarOffsets = [];
      window.STSevenDaysCal = { apiVersion: 1, getPhoneCalendar: ({ monthOffset }) => {
        desktopCalendarOffsets.push(monthOffset);
        return desktopCalendar;
      } };
      dispatchEvent(new CustomEvent('st-sevendayscal:calendar-changed'));
    });
    await page.locator('.desktop-calendar').waitFor();
    assert.equal(await page.locator('.desktop-calendar').getByText('书店初遇', { exact: true }).count(), 1);
    assert.equal(await page.locator('.desktop-week-day').count(), 7);

    const fontCss = readFileSync('/tmp/mobile-plugin-reference-research/preview-fonts.css', 'utf8').replaceAll('Nowar Rounded TW Wc', 'PocketPreviewCJK');
    await page.evaluate(css => {
      const face = document.createElement('style'); face.textContent = css; document.head.append(face);
      const style = document.createElement('style'); style.textContent = ':host{font-family:PocketPreviewCJK,sans-serif}';
      document.querySelector('.pocket-phone').shadowRoot.append(style);
    }, fontCss);
    await page.evaluate(async () => { await document.fonts.load('15px PocketPreviewCJK', '短信论坛日历设置书店初遇锁屏'); await document.fonts.ready; });

    for (const theme of ['day', 'night']) {
      await page.evaluate(theme => { previewHarness.metadata.pocketPhone.theme = theme; previewHarness.app.open(); }, theme);
      for (const [width, height] of [[320, 568], [390, 844], [641, 800]]) {
        await page.setViewportSize({ width, height });
        assert.equal(await page.locator('.phone-shell').evaluate(el => el.scrollWidth <= el.clientWidth), true);
        assert.equal(await page.locator('.view-desktop').evaluate(el => el.scrollWidth <= el.clientWidth), true);
        assert.equal(await page.getByRole('button', { name: '设置', exact: true }).isVisible(), true);
        await page.locator('.phone-shell').screenshot({ path: `${output}/${host}-${theme}-${width}.png` });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '打开日历', exact: true }).click();
    await page.locator('.view-calendar').waitFor();
    assert.equal(await page.locator('.status-time').textContent(), '23:58');
    await page.getByRole('button', { name: '下个月', exact: true }).click();
    await page.getByRole('button', { name: '2026年10月15日', exact: true }).click();
    await page.getByRole('button', { name: '主页', exact: true }).click();
    await page.getByRole('button', { name: '打开日历', exact: true }).click();
    assert.equal(await page.evaluate(() => desktopCalendarOffsets.at(-1)), 0, 'current-month widget opens the displayed month, not an earlier browsing offset');
    assert.equal(await page.locator('.calendar-day[aria-pressed="true"]').count(), 0);
    await page.getByRole('button', { name: '主页', exact: true }).click();
    await page.locator('.view-desktop').waitFor();
    for (const [label, view] of [['短信', 'inbox'], ['论坛', 'forum'], ['设置', 'settings']]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.locator(`.view-${view}`).waitFor();
      assert.equal(await page.locator('.phone-status').count(), 1);
      await page.getByRole('button', { name: '主页', exact: true }).click();
    }
    await page.evaluate(() => {
      previewHarness.mainMessages.at(-1).mes = '<!-- QQJ-end | date=2026年10月19日 | time=00:04 -->';
      previewHarness.storyUpdated();
    });
    assert.equal(await page.locator('.status-time').textContent(), '00:04');
    await page.getByRole('button', { name: '关闭手机', exact: true }).click();
    await page.evaluate(() => previewHarness.app.open());
    await page.locator('.view-home').waitFor();
    assert.equal(await page.locator('.home-clock text').textContent(), '0004');
    assert.equal(await page.getByRole('button', { name: '进入桌面', exact: true }).isVisible(), true);
    assert.equal(await page.getByRole('button', { name: '设置', exact: true }).count(), 0);

    await page.getByRole('button', { name: '进入桌面', exact: true }).click();
    await page.evaluate(() => {
      previewHarness.metadata.pocketPhone.wallpapers = { night: '/assets/stickers/sepia-1.png' };
      previewHarness.app.open();
    });
    assert.equal(await page.locator('.desktop-wallpaper').getAttribute('src'), '/assets/stickers/sepia-1.png');
    assert.equal(await page.locator('.desktop-wallpaper').evaluate(el => getComputedStyle(el).opacity), '1');

    await page.clock.install({ time: new Date('2026-10-18T01:37:00Z') });
    await page.evaluate(() => {
      previewHarness.mainMessages.at(-1).mes = '本楼没有剧情时间戳。';
      previewHarness.storyUpdated();
    });
    await page.getByRole('button', { name: '短信', exact: true }).click();
    await page.locator('[data-contact="lin"]').click();
    const draft = page.getByRole('textbox', { name: '短信内容', exact: true });
    await draft.fill('保留正在输入的内容');
    const originalDraft = await draft.elementHandle();
    await page.clock.fastForward(61000);
    assert.equal(await page.locator('.status-time').textContent(), '09:38');
    assert.equal(await originalDraft.evaluate(el => el === el.getRootNode().querySelector('#sms-draft')), true);
    assert.equal(await draft.inputValue(), '保留正在输入的内容');
    assert.equal(await draft.evaluate(el => el === el.getRootNode().activeElement), true);
    assert.deepEqual(await page.evaluate(() => ({ requests: previewHarness.requests.length, saves: previewHarness.metadataSaves })), { requests: 0, saves: 0 });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Desktop/status bar: native/Luker, fingerprint entry, five apps, read-only calendar widget, story clock, compact day/night layouts; no model calls or archive writes.');
} finally { await browser.close(); }
