import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { openApp } from './navigation.mjs';
const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const output = '/tmp/mobile-plugin-reference-research/avatar-adjustment';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
try {
  for (const kind of ['native', 'luker']) {
    const page = await browser.newPage({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(8000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.particlePaints = new Map();
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const context = getContext.apply(this, args);
        if (context && this.classList.contains('chat-particles') && !particlePaints.has(this)) {
          particlePaints.set(this, 0);
          const clear = context.clearRect;
          context.clearRect = (...values) => { particlePaints.set(this, particlePaints.get(this) + 1); return clear.apply(context, values); };
        }
        return context;
      };
    });
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${kind}&clock=story`);
    await openApp(page, '设置');
    await page.getByRole('button', { name: '外观设置', exact: true }).click();
    assert.equal(await page.getByRole('switch', { name: '粒子效果', exact: true }).count(), 1, 'appearance has a compact particle switch');
    assert.equal(await page.getByRole('switch', { name: '粒子效果', exact: true }).isChecked(), true);
    await page.getByRole('switch', { name: '粒子效果', exact: true }).uncheck();
    await page.waitForFunction(() => previewHarness.settings.pocketPhone?.particlesEnabled === false);
    await openApp(page, '短信');
    await page.locator('[data-contact="lin"]').click();
    assert.equal(await page.locator('.chat-particles').count(), 0, 'disabled means no animation canvas');
    // Use a second runtime with the real embedded host adapter and the same global settings.
    await page.evaluate(async () => {
      const { initialize } = await import('../src/runtime.js');
      const { createHostAdapter } = await import('../src/host.js');
      window.embeddedApp = initialize({ host: createHostAdapter({ contextProvider: () => previewHarness.context, mode: 'embedded' }), documentRef: document });
      embeddedApp.open();
    });
    const embedded = page.locator('#pocket-phone-card-host');
    await embedded.getByRole('button', { name: '暂时继续', exact: true }).click();
    await openApp(embedded, '短信');
    await embedded.locator('[data-contact="lin"]').click();
    assert.equal(await embedded.locator('.chat-particles').count(), 0, 'embedded runtime reads the same preference');
    await openApp(embedded, '设置');
    await embedded.getByRole('button', { name: '外观设置', exact: true }).click();
    await embedded.getByRole('switch', { name: '粒子效果', exact: true }).check();
    await page.waitForFunction(() => document.querySelector('#pocket-phone-host').shadowRoot.querySelector('.chat-particles'));
    await page.waitForFunction(() => [...particlePaints.values()].some(count => count > 2));
    await embedded.getByRole('switch', { name: '粒子效果', exact: true }).uncheck();
    assert.equal(await page.locator('#pocket-phone-host .chat-particles').count(), 0, 'other mounted instance stops immediately');
    const paints = await page.evaluate(() => [...particlePaints.values()]);
    await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(() => [...particlePaints.values()]), paints, 'disabled particles stop painting rather than hiding an active animation');
    await page.evaluate(() => embeddedApp.dispose());
    assert.equal(await page.evaluate(() => previewHarness.metadataSaves), 0, 'global effects do not save chat data');
    await page.route('**/__font/*.woff2', route => {
      const name = basename(new URL(route.request().url()).pathname), local = '/tmp/mobile-plugin-reference-research/preview-fonts/' + name;
      return route.fulfill({ path: existsSync(local) ? local : '/tmp/myriad-home-design-20261016/' + name, contentType: 'font/woff2' });
    });
    const fontCss = readFileSync('/tmp/mobile-plugin-reference-research/preview-fonts.css', 'utf8').replaceAll('Nowar Rounded TW Wc', 'PocketPreviewCJK');
    await page.evaluate(async css => {
      const fonts = document.createElement('style'); fonts.textContent = css; document.head.append(fonts);
      const style = document.createElement('style'); style.textContent = ':host{font-family:PocketPreviewCJK,sans-serif}'; document.querySelector('.pocket-phone').shadowRoot.append(style);
      await document.fonts.load('15px PocketPreviewCJK', '调整头像拖动图片位置缩放确定取消粒子效果外观设置'); await document.fonts.ready;
    }, fontCss);

    const fixture = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 300;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ed2222'; ctx.fillRect(0, 0, 300, 300); ctx.fillStyle = '#2244ee'; ctx.fillRect(300, 0, 300, 300);
      window.avatarUrls = { created: [], revoked: [] };
      const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = value => { const url = create(value); avatarUrls.created.push(url); return url; };
      URL.revokeObjectURL = url => { avatarUrls.revoked.push(url); revoke(url); };
      return canvas.toDataURL('image/png').split(',')[1];
    });
    const upload = () => page.getByLabel('选择头像图片', { exact: true }).setInputFiles({ name: 'two-colors.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') });
    await openApp(page, '设置');
    await page.getByRole('button', { name: '编辑我的资料', exact: true }).click();
    await page.getByLabel('网名', { exact: true }).fill('裁剪测试');
    const beforeSaves = await page.evaluate(() => previewHarness.metadataSaves);
    await upload();
    const dialog = page.getByRole('dialog', { name: '调整头像', exact: true });
    await dialog.waitFor();
    await dialog.getByRole('button', { name: '确定', exact: true }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('.pocket-phone').shadowRoot.querySelector('[data-crop="confirm"]').disabled);
    assert.equal(await dialog.locator('.avatar-crop-frame').evaluate(node => getComputedStyle(node).borderRadius), '50%');
    const frame = await dialog.locator('.avatar-crop-frame').boundingBox();
    const shell = await page.locator('.phone-shell').boundingBox();
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= shell.x && bounds.x + bounds.width <= shell.x + shell.width + 1);
    assert.ok(bounds.y >= shell.y && bounds.y + bounds.height <= shell.y + shell.height + 1, 'crop fits the narrow phone');
    await dialog.getByRole('slider', { name: '缩放', exact: true }).fill('2');
    if (kind === 'luker') {
      const session = await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: frame.x + frame.width * 4, y: frame.y + frame.height / 2 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await session.detach();
    } else {
      await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
      await page.mouse.down(); await page.mouse.move(frame.x + frame.width * 4, frame.y + frame.height / 2); await page.mouse.up();
    }
    await dialog.screenshot({ path: `${output}/${kind}-crop.png` });
    await dialog.getByRole('button', { name: '确定', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    const cropped = await page.locator('.profile-avatar img').getAttribute('src');
    const pixels = await page.evaluate(async src => {
      const image = new Image(); image.src = src; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      return { width: image.width, height: image.height, center: [...context.getImageData(256, 256, 1, 1).data] };
    }, cropped);
    assert.equal(pixels.width, 512); assert.equal(pixels.height, 512);
    assert.ok(pixels.center[0] > 200 && pixels.center[2] < 70, 'dragging selects the red side in the actual saved pixels');
    assert.equal(await page.getByLabel('网名', { exact: true }).inputValue(), '裁剪测试');
    assert.equal(await page.evaluate(() => previewHarness.metadataSaves), beforeSaves, 'crop confirmation only updates the form draft');
    await upload();
    await dialog.waitFor();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.locator('.profile-avatar img').getAttribute('src'), cropped);
    await upload(); await dialog.waitFor(); await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.locator('.phone-shell').isVisible(), true, 'Escape cancels crop without closing the phone');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('heading', { name: '设置', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.userProfile.avatar), cropped);
    const exported = await page.evaluate(async () => {
      const { createAuthoringService } = await import('../src/authoring.js');
      const { createPhoneStore } = await import('../src/store.js');
      const { createHostAdapter } = await import('../src/host.js');
      const host = createHostAdapter({ contextProvider: () => previewHarness.context });
      const { script } = await createAuthoringService({ host, store: createPhoneStore({ target: host.captureChat() }) }).exportScript();
      return { avatar: script.data.twoMoreThings.userProfile.avatar, particlesIncluded: JSON.stringify(script.data.twoMoreThings).includes('particlesEnabled') };
    });
    assert.deepEqual(exported, { avatar: cropped, particlesIncluded: false }, 'author export keeps only the cropped avatar and omits the personal global effect preference');
    await page.getByRole('button', { name: '编辑我的资料', exact: true }).click();
    await upload(); await dialog.waitFor();
    await page.evaluate(() => previewHarness.app.dispose());
    await page.waitForTimeout(50);
    assert.equal(await page.locator('#pocket-phone-host').count(), 0, 'disposal removes the open cropper too');
    const urls = await page.evaluate(() => avatarUrls);
    assert.equal(urls.created.length, 4); assert.deepEqual([...urls.revoked].sort(), [...urls.created].sort(), 'confirm, cancel and disposal release all source URLs');
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Global particle setting and avatar cropping: native/Luker, standalone/embedded synchronization, actual drag/zoom pixels, draft-only confirm, cancel and resource cleanup passed.');
} finally { await browser.close(); }
