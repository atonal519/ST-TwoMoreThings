import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { openApp } from './navigation.mjs';

const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const project = resolve(import.meta.dirname, '..');
const output = '/tmp/mobile-plugin-reference-research/chat-particles';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--no-sandbox'],
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' },
});
try {
  for (const host of ['native', 'luker']) for (const width of [320, 390]) for (const theme of ['day', 'night']) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      // Count actual paints without replacing the renderer or animation scheduler.
      window.particlePaints = new Map();
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const context = getContext.apply(this, args);
        if (context && this.classList.contains('chat-particles') && !particlePaints.has(this)) {
          particlePaints.set(this, 0);
          const clear = context.clearRect;
          context.clearRect = (...values) => {
            particlePaints.set(this, particlePaints.get(this) + 1);
            return clear.apply(context, values);
          };
        }
        return context;
      };
    });
    await page.route('http://127.0.0.1:8917/**', route => {
      const path = new URL(route.request().url()).pathname;
      const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf' };
      return route.fulfill({ body: readFileSync(resolve(project, '.' + path)), contentType: types[extname(path)] || 'text/plain' });
    });
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${host}&clock=story`);
    await page.locator('.phone-shell').waitFor();
    await page.evaluate(theme => {
      previewHarness.metadata.pocketPhone.theme = theme;
      previewHarness.metadata.pocketPhone.groups = [{ id: 'glow-group', name: '书店小组', memberIds: ['lin', 'zhou'], userIsMember: true }];
    }, theme);
    await openApp(page, '短信');
    assert.equal(await page.locator('.chat-particles').count(), 0, 'inbox has no animated layer');
    await page.locator('[data-contact="lin"]').click();
    assert.equal(await page.locator('.chat-particles').count(), 1, 'a chat mounts one particle layer');
    await page.waitForFunction(() => [...particlePaints.values()].some(count => count > 2));
    const visual = await page.locator('.chat-particles').evaluate(canvas => {
      const feed = canvas.parentElement.querySelector('.message-feed').getBoundingClientRect();
      const rect = canvas.getBoundingClientRect(), style = getComputedStyle(canvas);
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const expected = style.color.match(/\d+/g).slice(0, 3).map(Number);
      let colored = false;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 100 && expected.every((value, channel) => Math.abs(pixels[i + channel] - value) <= 3)) colored = true;
      if (!colored) {
        let strongest = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > pixels[strongest + 3]) strongest = i;
        throw new Error(JSON.stringify({ expected, fill: canvas.getContext('2d').fillStyle, actual: [...pixels.slice(strongest, strongest + 4)] }));
      }
      return { colored, decorative: canvas.getAttribute('aria-hidden') === 'true', clickThrough: style.pointerEvents === 'none',
        fits: Math.abs(rect.top - feed.top) < 1 && Math.abs(rect.height - feed.height) < 1,
        retina: Math.abs(canvas.width - rect.width * 2) <= 1, inChat: canvas.closest('.view-chat') !== null };
    });
    assert.deepEqual(visual, { colored: true, decorative: true, clickThrough: true, fits: true, retina: true, inChat: true }, 'real pixels use the theme color; overlay fits the visible log without intercepting input');
    await page.evaluate(() => {
      window.liveParticles = document.querySelector('.pocket-phone').shadowRoot.querySelector('.chat-particles');
      window.particleSnapshot = liveParticles.toDataURL();
    });
    await page.waitForTimeout(140);
    assert.equal(await page.evaluate(() => liveParticles.toDataURL() !== particleSnapshot), true, 'particles move rather than remaining static');
    await page.getByRole('textbox', { name: '短信内容' }).fill('尚未发送的草稿');
    await page.locator('.message-row .bubble').first().click();
    assert.equal(await page.getByRole('button', { name: '删除这条短信', exact: true }).count(), 1, 'message selection remains clickable');
    assert.equal(await page.getByRole('textbox', { name: '短信内容' }).inputValue(), '尚未发送的草稿');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(60);
    const stopped = await page.evaluate(() => [...particlePaints.values()]);
    await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(() => [...particlePaints.values()]), stopped, 'reduced motion stops painting');
    assert.equal(await page.locator('.chat-particles').isVisible(), false);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.pocket-phone').shadowRoot.querySelector('.chat-particles');
      return !canvas.hidden && particlePaints.get(canvas) > 2;
    });
    await page.setViewportSize({ width, height: 560 });
    await page.waitForTimeout(80);
    assert.equal(await page.locator('.chat-particles').evaluate(canvas => Math.abs(canvas.height - canvas.getBoundingClientRect().height * 2) <= 1), true, 'canvas resizes with the chat viewport');
    await page.setViewportSize({ width, height: 844 });
    await page.locator('.system-nav [data-action="system-back"]').click();
    assert.equal(await page.locator('.chat-particles').count(), 0);
    const inboxPaints = await page.evaluate(() => [...particlePaints.values()]);
    await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(() => [...particlePaints.values()]), inboxPaints, 'leaving chat stops detached animation');
    await page.locator('[data-group="glow-group"]').click();
    assert.equal(await page.locator('.view-group-chat .chat-particles').count(), 1, 'groups share the same effect');
    await page.waitForTimeout(100);
    await page.locator('.phone-shell').screenshot({ path: `${output}/${host}-${width}-${theme}.png` });
    await page.getByRole('button', { name: '关闭手机', exact: true }).click();
    const closedPaints = await page.evaluate(() => [...particlePaints.values()]);
    await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(() => [...particlePaints.values()]), closedPaints, 'closed phone stops painting');
    await page.evaluate(() => previewHarness.app.open());
    assert.equal(await page.locator('.view-desktop').count(), 1);
    assert.equal(await page.locator('.chat-particles').count(), 0);
    await openApp(page, '短信');
    await page.locator('[data-contact="lin"]').click();
    await page.evaluate(() => previewHarness.app.dispose());
    const disposedPaints = await page.evaluate(() => [...particlePaints.values()]);
    await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(() => [...particlePaints.values()]), disposedPaints, 'disposed phone releases its animation');
    assert.deepEqual(await page.evaluate(() => ({ requests: previewHarness.requests.length, saves: previewHarness.metadataSaves })), { requests: 0, saves: 0 });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Chat particles: native/Luker, day/night, 320/390, real moving theme pixels, resize, clicks, drafts, reduced motion and lifecycle cleanup; no model calls or saves.');
} finally { await browser.close(); }
