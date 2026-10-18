import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, extname, basename } from 'node:path';

const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const root = resolve(import.meta.dirname, '..');
const output = '/tmp/mobile-plugin-reference-research/phone-navigation';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--no-sandbox'],
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' },
});
try {
  for (const host of ['native', 'luker']) for (const width of [320, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    page.setDefaultTimeout(4000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://127.0.0.1:8917/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith('/__font/')) {
        const name = basename(path), local = '/tmp/mobile-plugin-reference-research/preview-fonts/' + name;
        return route.fulfill({ path: existsSync(local) ? local : '/tmp/myriad-home-design-20261016/' + name, contentType: 'font/woff2' });
      }
      const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json' };
      return route.fulfill({ body: readFileSync(resolve(root, '.' + path)), contentType: types[extname(path)] || 'text/plain' });
    });
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${host}&clock=story`);
    await page.locator('.view-home').waitFor();
    assert.equal(await page.getByRole('button', { name: '短信', exact: true }).count(), 0, 'lockscreen has no persistent SMS shortcut');
    assert.equal(await page.getByRole('button', { name: '论坛', exact: true }).count(), 0);
    assert.equal(await page.locator('.system-nav').count(), 0);
    assert.equal(await page.locator('.phone-status [data-action="close"]').count(), 0, 'phone close belongs at the bottom');
    assert.equal(await page.locator('.home-footer [data-action="close"]').isVisible(), true);
    const centeredFingerprint = () => page.getByRole('button', { name: '进入桌面', exact: true }).evaluate(button => {
      const b = button.getBoundingClientRect(), shell = button.getRootNode().querySelector('.phone-shell').getBoundingClientRect();
      const center = b.y + b.height / 2;
      return Math.abs(b.x + b.width / 2 - shell.x - shell.width / 2) < 1 && center > shell.y + shell.height * .75 && center < shell.y + shell.height * .95;
    });
    assert.equal(await centeredFingerprint(), true, 'fingerprint is in the lower center');
    const css = readFileSync('/tmp/mobile-plugin-reference-research/preview-fonts.css', 'utf8').replaceAll('Nowar Rounded TW Wc', 'PocketPreviewCJK');
    await page.evaluate(css => {
      const face = document.createElement('style'); face.textContent = css; document.head.append(face);
      const local = document.createElement('style'); local.textContent = ':host{font-family:PocketPreviewCJK,sans-serif}';
      document.querySelector('.pocket-phone').shadowRoot.append(local);
    }, css);
    await page.evaluate(async () => { await document.fonts.load('15px PocketPreviewCJK', '锁屏短信论坛设置日历主页返回'); await document.fonts.ready; });
    await page.locator('.phone-shell').screenshot({ path: `${output}/${host}-${width}-lock-day.png` });

    const home = () => page.locator('.system-nav').getByRole('button', { name: '主页', exact: true });
    const back = () => page.locator('.system-nav').getByRole('button', { name: '返回', exact: true });
    await page.getByRole('button', { name: '进入桌面', exact: true }).click();
    await page.locator('.view-desktop').waitFor();
    assert.equal(await page.locator('.system-nav button').count(), 3);
    assert.equal(await page.locator('.system-nav').evaluate(nav => {
      const home = nav.querySelector('[data-action="system-home"]').getBoundingClientRect();
      const close = nav.querySelector('[data-action="close"]').getBoundingClientRect();
      return close.left >= home.right && Math.abs(close.y + close.height / 2 - home.y - home.height / 2) < 1;
    }), true, 'phone close sits to the right of home on the same bottom row');
    assert.equal(await back().isDisabled(), true, 'back on the desktop does not return to lockscreen');
    await page.getByRole('button', { name: '短信', exact: true }).click();
    await page.locator('.view-inbox').waitFor();
    for (const label of ['短信', '论坛', '日历', '设置']) assert.equal(await page.getByRole('button', { name: label, exact: true }).count(), 0);
    assert.equal(await page.locator('.system-nav button').count(), 3);
    await page.locator('[data-contact="lin"]').click();
    await page.getByRole('textbox', { name: '短信内容' }).fill('尚未发送的草稿');
    await page.getByRole('button', { name: '聊天选项', exact: true }).click();
    await page.getByRole('button', { name: '清空聊天', exact: true }).click();
    await page.getByRole('button', { name: '聊天资料', exact: true }).click();
    await page.locator('.view-contact-profile').waitFor();
    await back().click();
    assert.equal(await page.locator('.view-chat').count(), 1, 'leaving a chat confirmation for a profile must not consume its first back press');
    await page.getByRole('button', { name: '聊天选项', exact: true }).click();
    await page.getByRole('button', { name: '清空聊天', exact: true }).click();
    await page.getByRole('button', { name: '聊天选项', exact: true }).click();
    await page.getByRole('button', { name: '删除联系人', exact: true }).click();
    await page.locator('.view-delete-confirm').waitFor();
    await back().click();
    assert.equal(await page.locator('.view-chat').count(), 1, 'back from contact deletion returns to the source page in one press');
    await back().click();
    await page.locator('.view-inbox').waitFor();
    await back().click();
    await page.locator('.view-desktop').waitFor();
    await page.getByRole('button', { name: '短信', exact: true }).click();
    await page.locator('[data-contact="lin"]').click();
    assert.equal(await page.getByRole('textbox', { name: '短信内容' }).inputValue(), '尚未发送的草稿');
    await home().click();
    await page.locator('.view-desktop').waitFor();
    await page.getByRole('button', { name: '论坛', exact: true }).click();
    await page.locator('.forum-card').first().click();
    await page.locator('.view-post').waitFor();
    await back().click();
    await page.locator('.view-forum').waitFor();
    await home().click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '编辑我的资料', exact: true }).click();
    await back().click();
    await page.locator('.view-settings').waitFor();
    await page.getByRole('button', { name: '内容设置', exact: true }).click();
    await page.getByRole('button', { name: '导出随卡包', exact: true }).click();
    await back().click();
    await page.locator('.view-settings').waitFor();
    await home().click();
    await page.getByRole('button', { name: '短信', exact: true }).click();
    await page.locator('[data-contact="lin"]').click();
    await page.locator('.phone-shell').screenshot({ path: `${output}/${host}-${width}-chat.png` });
    await page.getByRole('button', { name: '关闭手机', exact: true }).click();
    await page.evaluate(() => previewHarness.app.open());
    await page.locator('.view-desktop').waitFor();
    await page.getByRole('button', { name: '锁屏', exact: true }).click();
    await page.locator('.view-home').waitFor();
    assert.equal(await centeredFingerprint(), true);
    await page.getByRole('button', { name: '关闭手机', exact: true }).click();
    await page.evaluate(() => previewHarness.app.open());
    await page.locator('.view-home').waitFor();
    await page.evaluate(() => {
      previewHarness.metadata.pocketPhone.theme = 'night';
      previewHarness.app.open();
    });
    assert.equal(await centeredFingerprint(), true);
    await page.locator('.phone-shell').screenshot({ path: `${output}/${host}-${width}-lock-night.png` });
    await page.getByRole('button', { name: '进入桌面', exact: true }).click();
    await page.getByRole('button', { name: '关闭手机', exact: true }).click();
    await page.evaluate(() => {
      previewHarness.context.chatId = 'preview-second-chat';
      previewHarness.app.open();
    });
    await page.locator('.view-home').waitFor();
    assert.equal(await page.getByRole('button', { name: '进入桌面', exact: true }).isVisible(), true, 'first opening in another chat begins at its lockscreen');
    assert.deepEqual(await page.evaluate(() => ({ requests: previewHarness.requests.length, saves: previewHarness.metadataSaves })), { requests: 0, saves: 0 });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Phone navigation: lower-center fingerprint, lockscreen without shortcuts, back/home plus adjacent close, parent-page back, draft retention, reopen desktop and explicit lock; native/Luker 320/390, no model calls or saves.');
} finally { await browser.close(); }
