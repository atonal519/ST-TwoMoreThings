import { openApp } from './navigation.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.POCKET_PLAYWRIGHT_MODULE || '/tmp/st-tools-browser/package.json')('playwright');
const browser = await chromium.launch({
  executablePath: process.env.POCKET_BROWSER_EXECUTABLE || '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',
  headless: true, args: ['--no-sandbox'],
  env: { ...process.env, LD_LIBRARY_PATH: process.env.POCKET_BROWSER_LIBS || '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' },
});
const failures = [];
const check = (label, actual, expected) => {
  try { assert.deepEqual(actual, expected, label); }
  catch (error) { failures.push(error.message); }
};
try {
  for (const kind of ['native', 'luker']) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = new URL(process.env.POCKET_PREVIEW_URL || 'http://127.0.0.1:8917/tests/preview.html');
    url.searchParams.set('entry', 'extension'); url.searchParams.set('host', kind);
    await page.goto(url.href);
    const launcher = page.getByRole('button', { name: '打开两三事', exact: true });
    await launcher.waitFor();
    check(`${kind}: launcher uses the host menu icon slot`, await launcher.locator('.extensionsMenuExtensionButton').count(), 1);
    check(`${kind}: entry registers without opening or saving`, await page.evaluate(() => ({
      phones: document.querySelectorAll('.pocket-phone').length,
      requests: previewHarness.requests.length, metadata: previewHarness.metadataSaves, settings: previewHarness.settingsSaves,
    })), { phones: 0, requests: 0, metadata: 0, settings: 0 });
    await page.evaluate(() => (globalThis.SillyTavern || globalThis.Luker).getContext().name1 = '小满');
    await launcher.click();
    await page.locator('.phone-shell').waitFor();
    for (const [width, height, expected] of [
      [1200, 1000, { x: 820, y: 80, width: 360, height: 600 }],
      [641, 800, { x: 261, y: 80, width: 360, height: 600 }],
      [640, 800, { x: 10, y: 20, width: 620, height: 760 }],
      [390, 844, { x: 10, y: 20, width: 370, height: 804 }],
      [320, 568, { x: 10, y: 20, width: 300, height: 528 }],
    ]) {
      await page.setViewportSize({ width, height });
      check(`${kind}: ${width}px follows QQJ default geometry`, await page.locator('.phone-shell').evaluate(x => {
        const b = x.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
      }), expected);
    }
    await page.setViewportSize({ width: 1200, height: 1000 });
    const shell = page.locator('.phone-shell');
    const rectangle = () => shell.evaluate(node => {
      const b = node.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
    });
    const dragStatusTo = async (x, y) => {
      const status = await page.locator('.phone-status').boundingBox();
      await page.mouse.move(status.x + 80, status.y + status.height / 2);
      await page.mouse.down(); await page.mouse.move(x, y, { steps: 6 }); await page.mouse.up();
    };
    const status = await page.locator('.phone-status').boundingBox();
    await dragStatusTo(status.x + 80 - 180, status.y + status.height / 2 + 70);
    check(`${kind}: desktop top bar drags the whole phone`, await rectangle(), { x: 640, y: 150, width: 360, height: 600 });
    check(`${kind}: black bezel belongs to the original window bounds`, await shell.evaluate(node => {
      const style = getComputedStyle(node); return { border: style.borderTopWidth, color: style.borderTopColor };
    }), { border: '4px', color: 'rgb(20, 22, 23)' });
    await openApp(page, '短信');
    await page.locator('[data-contact="lin"]').click();
    check(`${kind}: navigation preserves the dragged position`, await rectangle(), { x: 640, y: 150, width: 360, height: 600 });
    const input = page.getByRole('textbox', { name: '短信内容' });
    await input.fill('拖动时保留的草稿');
    const textBox = await input.boundingBox();
    await page.mouse.move(textBox.x + 10, textBox.y + 15); await page.mouse.down();
    await page.mouse.move(textBox.x + 40, textBox.y + 25); await page.mouse.up();
    check(`${kind}: text selection does not move the phone`, await rectangle(), { x: 640, y: 150, width: 360, height: 600 });
    check(`${kind}: dragging does not replace the draft`, await input.inputValue(), '拖动时保留的草稿');
    check(`${kind}: top bar has no separate lock button`, await page.getByRole('button', { name: '锁屏', exact: true }).count(), 0);
    await page.getByRole('button', { name: '关闭手机', exact: true }).click();
    await launcher.click();
    await page.locator('.view-home').waitFor();
    check(`${kind}: reopening preserves this instance position`, await rectangle(), { x: 640, y: 150, width: 360, height: 600 });
    await dragStatusTo(0, 0);
    check(`${kind}: dragging keeps the phone inside the upper viewport edges`, await rectangle(), { x: 10, y: 10, width: 360, height: 600 });
    await dragStatusTo(1199, 999);
    check(`${kind}: dragging keeps the phone inside the lower viewport edges`, await rectangle(), { x: 830, y: 390, width: 360, height: 600 });
    await page.setViewportSize({ width: 641, height: 800 });
    await page.waitForTimeout(50);
    await dragStatusTo(100, 100);
    check(`${kind}: 641px still supports dragging`, (await rectangle()).x < 261, true);
    await page.setViewportSize({ width: 640, height: 800 });
    await page.waitForTimeout(50);
    await dragStatusTo(200, 150);
    check(`${kind}: 640px returns to the fixed mobile layout and ignores dragging`, await rectangle(), { x: 10, y: 20, width: 620, height: 760 });
    check(`${kind}: mobile layout owns its coordinates`, await shell.evaluate(node => [node.style.left, node.style.top, node.style.right]), ['', '', '']);
    await page.setViewportSize({ width: 1200, height: 1000 });
    await openApp(page, '设置');
    await page.getByRole('button', { name: '编辑我的资料', exact: true }).click();
    check(`${kind}: unsaved user profile defaults to the host user name`, await page.getByLabel('姓名', { exact: true }).inputValue(), '小满');
    await page.getByRole('button', { name: '关闭手机', exact: true }).click();
    await launcher.click();
    await page.locator('.view-home').waitFor();
    check(`${kind}: main surface is isolated in a shadow root`, await page.evaluate(() => {
      const host = document.querySelector('.pocket-phone');
      return host.shadowRoot?.mode === 'open' && document.querySelector('.phone-shell') === null;
    }), true);
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = 'html,body{font-size:45px;text-shadow:4px 4px red;letter-spacing:8px;--paper:magenta} button,input,textarea,select{font-size:50px!important;background:magenta!important;border:12px solid red!important}';
      document.head.append(style);
      const outside = document.createElement('button'); outside.id = 'host-outside'; outside.textContent = 'host';
      outside.style.cssText = 'position:fixed;top:0;left:0;width:30px;height:30px;padding:0;z-index:1'; document.body.append(outside);
      window.hostPhoneKeys = [];
      document.addEventListener('keydown', event => window.hostPhoneKeys.push(event.key));
    });
    check(`${kind}: uncovered host remains clickable`, await page.evaluate(() => document.elementFromPoint(5, 5)?.id), 'host-outside');
    check(`${kind}: host text effects do not enter phone`, await page.locator('.home-date').evaluate(x => {
      const s = getComputedStyle(x); return { shadow: s.textShadow, spacing: s.letterSpacing, size: s.fontSize };
    }), { shadow: 'none', spacing: '1.8975px', size: '12.65px' });
    check(`${kind}: host palette does not replace phone background`, await page.locator('.phone-shell').evaluate(x => getComputedStyle(x).backgroundColor), 'rgb(243, 241, 232)');
    await openApp(page, '短信');
    await page.getByRole('button', { name: /林舟/ }).click();
    const draft = page.getByRole('textbox', { name: '短信内容' });
    await draft.fill('键盘隔离');
    await draft.press('ArrowLeft'); await draft.press('Enter');
    check(`${kind}: editing keys do not reach host shortcuts`, await page.evaluate(() => hostPhoneKeys), []);
    check(`${kind}: host control CSS does not enter textarea`, await draft.evaluate(x => getComputedStyle(x).fontSize), '13px');
    await draft.press('Escape');
    check(`${kind}: Escape inside phone closes it`, await page.locator('.pocket-phone').evaluate(x => x.hidden), true);
    check(`${kind}: open and edit do not call models or save data`, await page.evaluate(() => ({
      requests: previewHarness.requests.length, metadata: previewHarness.metadataSaves, settings: previewHarness.settingsSaves,
    })), { requests: 0, metadata: 0, settings: 0 });
    check(`${kind}: no runtime errors`, errors, []);
    await page.close();
  }
  assert.deepEqual(failures, []);
  console.log('Manifest entry, native/Luker geometry, black bezel, desktop dragging, mobile reset, Shadow DOM and input isolation passed. Simulated hosts; no real data or model calls.');
} finally { await browser.close(); }
