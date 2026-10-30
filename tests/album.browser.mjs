import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { openApp } from './navigation.mjs';
import { createHash } from 'node:crypto';

const { chromium } = await import(process.env.POCKET_PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(import.meta.dirname, '..'), prefix = '/scripts/extensions/third-party/ST-PocketPhone/';
const output = process.env.POCKET_BROWSER_OUTPUT || mkdtempSync(resolve(tmpdir(), 'tmt-album-'));
mkdirSync(output, { recursive: true });
const font = process.env.POCKET_CJK_FONT ? readFileSync(process.env.POCKET_CJK_FONT).toString('base64') : '';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const browser = await chromium.launch({ ...(process.env.POCKET_CHROMIUM_PATH ? { executablePath: process.env.POCKET_CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
const results = [];
const fingerprint = value => ({ length: value.length, sha256: createHash('sha256').update(value).digest('hex').slice(0, 16) });
try {
  const fixture = await browser.newPage();
  const lake = Buffer.from((await fixture.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 853;
    const context = canvas.getContext('2d'), gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#d5e6ed'); gradient.addColorStop(0.5, '#6d9696'); gradient.addColorStop(1, '#223f4d');
    context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#e2b280';
    for (let i = 0; i < 12; i++) context.fillRect(35 + i * 103, 260 + i * 29, 47, 95 + i * 11);
    return canvas.toDataURL('image/png');
  })).split(',')[1], 'base64');
  await fixture.close();
  for (const host of ['native', 'luker']) for (const [width, theme] of [[390, 'day'], [320, 'night']]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
    page.setDefaultTimeout(7000);
    const errors = [], unexpected = []; let slowGate, releaseSlow;
    page.on('pageerror', error => errors.push(error.message));
    const sources = new Map();
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      if (url.hostname === '127.0.0.1' && path.startsWith(prefix)) {
        const file = resolve(root, decodeURIComponent(path.slice(prefix.length)));
        if (file === resolve(root, 'tests/preview.js')) return route.fulfill({ contentType: 'text/javascript', body: readFileSync(file, 'utf8').replace('const settings = {', "const settings = { pocketPhone: { fontCssUrl: '' },") });
        if (existsSync(file)) return route.fulfill({ path: file, contentType: mime[extname(file)] || 'application/octet-stream' });
      }
      if (path.startsWith('/user/images/album-')) {
        if (path.includes('slow') && route.request().method() === 'GET' && slowGate) await slowGate;
        return route.fulfill({ body: sources.get(path) || lake, contentType: 'image/png' });
      }
      if (path === '/scripts/extensions.js') return route.fulfill({ contentType: 'text/javascript', body: "export const extensionTypes={'third-party/ST-PocketPhone':'local'};" });
      if (path === '/api/extensions/version') return route.fulfill({ json: { currentBranchName: 'main', currentCommitHash: 'a'.repeat(40), remoteUrl: 'https://github.com/fixture/phone', isUpToDate: true } });
      unexpected.push(url.href); return route.abort();
    });
    await page.goto(`http://127.0.0.1:8917${prefix}tests/preview.html?host=${host}&group=1&clock=story`);
    await page.locator('.phone-shell').waitFor();
    if (font) await page.locator('.pocket-phone').evaluate(async (element, data) => {
      const face = new FontFace('AlbumFixtureCJK', `url(data:font/otf;base64,${data})`); await face.load(); document.fonts.add(face);
      const style = document.createElement('style'); style.textContent = ':host{font-family:AlbumFixtureCJK,sans-serif}'; element.shadowRoot.append(style);
    }, font);
    const synthetic = await page.evaluate(() => {
      const make = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#6d9696'; x.fillRect(0, 0, w, h); x.fillStyle = '#e2b280'; x.fillRect(0, h / 2, w, h / 2); x.fillStyle = '#223f4d'; x.fillRect(0, 0, Math.max(2, w / 20), h); x.fillStyle = '#e8d8c8'; x.fillRect(w - Math.max(2, w / 20), 0, Math.max(2, w / 20), h); return c.toDataURL('image/png'); };
      return { portrait: make(600, 1000), wide: make(6000, 400) };
    });
    for (const key of ['portrait', 'wide']) sources.set(`/user/images/album-${key}.png`, Buffer.from(synthetic[key].split(',')[1], 'base64'));
    await page.evaluate(theme => {
      const h = previewHarness, state = h.metadata.pocketPhone; state.theme = theme;
      state.conversations.lin = Array.from({ length: 18 }, (_, i) => ({ id: `album-${i}`, role: 'assistant', type: 'image', text: '', image: { path: `/user/images/album-${String(i).padStart(2, '0')}.jpg`, description: `湖景 ${i + 1}` }, storyDate: '大陆历1686年10月4日', timeLabel: `10:${String(i).padStart(2, '0')}`, createdAt: `2026-10-04T10:${String(i).padStart(2, '0')}:00Z` }));
      state.conversations.lin.push(...['portrait', 'wide', 'slow'].map((key, i) => ({ id: key, role: 'assistant', type: 'image', image: { path: `/user/images/album-${key}.png`, description: `${key}测试照片` }, storyDate: '大陆历1686年10月3日', timeLabel: '11:00', createdAt: `2026-10-03T11:0${i}:00Z` })));
      h.app.open();
    }, theme);
    const before = await page.evaluate(() => ({ requests: previewHarness.requests.length, saves: previewHarness.metadataSaves, settings: previewHarness.settingsSaves }));
    await page.getByRole('button', { name: '进入桌面', exact: true }).click();
    assert.equal(await page.locator('.desktop-app').count(), 7);
    for (const app of await page.locator('.desktop-app').all()) assert.ok(await app.isVisible());
    await page.getByRole('button', { name: '相册', exact: true }).click();
    const shell = page.locator('.phone-shell'), geometry = await shell.evaluate(n => { const b = n.getBoundingClientRect(); return { width: b.width, height: b.height, left: b.left, top: b.top, right: b.right, bottom: b.bottom, vw: innerWidth, vh: innerHeight, overflow: n.scrollWidth > n.clientWidth }; });
    assert.equal(geometry.width, width - 20); assert.equal(geometry.height, 804);
    assert.ok(geometry.left >= 0 && geometry.top >= 0 && geometry.right <= geometry.vw && geometry.bottom <= geometry.vh && !geometry.overflow);
    assert.equal(await page.locator('.album-photo').count(), 21);
    await page.locator('.album-gallery').evaluate(async gallery => {
      const viewport = gallery.getBoundingClientRect();
      const visible = [...gallery.querySelectorAll('img')].filter(img => { const b = img.getBoundingClientRect(); return b.bottom > viewport.top && b.top < viewport.bottom; });
      await Promise.all(visible.map(img => img.decode()));
      if (visible.some(img => !img.complete || !img.naturalWidth)) throw Error('可见相册照片尚未载入');
    });
    await shell.screenshot({ path: `${output}/album-gallery-${host}-${theme}-${width}.png` });
    await page.locator('.album-gallery').evaluate(n => { n.scrollTop = 150; });
    const scroll = await page.locator('.album-gallery').evaluate(n => n.scrollTop);
    await page.locator('[data-album-photo="/user/images/album-10.jpg"]').click();
    await shell.screenshot({ path: `${output}/album-detail-${host}-${theme}-${width}.png` });
    await page.getByRole('button', { name: '打孔拼贴', exact: true }).click();
    await page.locator('[data-album-hole-canvas]').waitFor();
    const canvas = page.locator('[data-album-hole-canvas]');
    await page.getByRole('tab', { name: '看成品', exact: true }).click();
    const original = await page.locator('[data-album-result-canvas]').evaluate(c => c.toDataURL());
    await page.getByRole('tab', { name: '选孔位', exact: true }).click();
    const first = await page.evaluate(async prefix => { const { createPunchLayout } = await import(prefix + 'src/punch-collage.js'); return createPunchLayout('swallow', 1280, 853).pieces[0]; }, prefix);
    const box = await canvas.boundingBox(), size = await canvas.evaluate(c => ({ width: c.width, height: c.height }));
    const start = { x: box.x + first.sx / size.width * box.width, y: box.y + first.sy / size.height * box.height };
    if (width === 320) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y }] });
      for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + 26 * i / 8, y: start.y - 12 * i / 8 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
    } else { await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 26, start.y - 12, { steps: 8 }); await page.mouse.up(); }
    await shell.screenshot({ path: `${output}/album-editor-${host}-${theme}-${width}.png` });
    await page.getByRole('tab', { name: '看成品', exact: true }).click();
    const changed = await page.locator('[data-album-result-canvas]').evaluate(c => c.toDataURL()); assert.ok(changed !== original, '拖动孔位后成品像素应改变');
    await shell.screenshot({ path: `${output}/album-result-${host}-${theme}-${width}.png` });
    const pngs = [];
    for (const label of ['导出作品', '导出碎片']) {
      const got = page.waitForEvent('download'); await page.getByRole('button', { name: label, exact: true }).click(); const download = await got;
      const stream = await download.createReadStream(), chunks = []; for await (const chunk of stream) chunks.push(chunk); const bytes = Buffer.concat(chunks);
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a'); assert.equal(bytes.readUInt32BE(16), 1000); assert.equal(bytes.readUInt32BE(20), 1400);
      const alpha = await page.evaluate(async encoded => { const img = new Image(); img.src = 'data:image/png;base64,' + encoded; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let zero = 0, nonzero = 0; for (let i = 3; i < d.length; i += 4) { if (d[i]) nonzero++; else zero++; } return { zero, nonzero, data: c.toDataURL() }; }, bytes.toString('base64'));
      if (label === '导出碎片') assert.ok(alpha.zero > 0 && alpha.nonzero > 0); else { assert.equal(alpha.zero, 0); assert.ok(alpha.data === changed, '完整PNG下载与同一成品预览像素相等'); }
      writeFileSync(`${output}/${label === '导出碎片' ? 'pieces' : 'artwork'}-${host}-${theme}-${width}.png`, bytes); pngs.push({ label, bytes: bytes.length, zero: alpha.zero, nonzero: alpha.nonzero });
    }
    await page.getByRole('button', { name: '放大拼贴作品', exact: true }).click(); await page.getByRole('dialog', { name: '查看图片', exact: true }).waitFor();
    assert.equal(await page.locator('.photo-viewer img[data-phone-image]').count(), 0);
    await page.getByRole('button', { name: '关闭图片', exact: true }).click();
    await page.locator('[data-action="system-back"]').click(); await page.locator('[data-action="system-back"]').click();
    assert.ok(Math.abs(await page.locator('.album-gallery').evaluate(n => n.scrollTop) - scroll) < 2);
    await page.locator('[data-album-photo="/user/images/album-10.jpg"]').click(); await page.getByRole('button', { name: '打孔拼贴', exact: true }).click(); await page.locator('[data-album-hole-canvas]').waitFor(); await page.getByRole('tab', { name: '看成品', exact: true }).click();
    assert.ok(await page.locator('[data-album-result-canvas]').evaluate(c => c.toDataURL()) === changed, '返回相册再进入应保留当前图孔位');
    await page.getByRole('button', { name: '圆孔', exact: true }).click(); await page.getByRole('button', { name: '燕子', exact: true }).click(); assert.ok(await page.locator('[data-album-result-canvas]').evaluate(c => c.toDataURL()) === changed, '圆孔切回燕子应保留燕子草稿');
    if (host === 'native' && width === 390) {
      await page.setViewportSize({ width: 1180, height: 900 });
      await page.locator('[data-action="system-back"]').click(); await page.getByRole('button', { name: '打孔拼贴', exact: true }).click(); await page.locator('[data-album-hole-canvas]').waitFor();
      const compact = await shell.evaluate(n => { const r = n.getBoundingClientRect(); return { width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom, vw: innerWidth, vh: innerHeight }; });
      assert.equal(compact.width, 360); assert.equal(compact.height, 600);
      assert.ok(compact.left >= 0 && compact.top >= 0 && compact.right <= compact.vw && compact.bottom <= compact.vh);
      await shell.screenshot({ path: `${output}/album-editor-desktop-360-600.png` });
      await page.getByRole('tab', { name: '看成品', exact: true }).click(); await shell.screenshot({ path: `${output}/album-result-desktop-360-600.png` });
      assert.ok(await page.locator('[data-album-result-canvas]').evaluate(c => c.toDataURL()) === changed, '桌面600高重进应保留湖景草稿');
      await page.setViewportSize({ width, height: 844 });
    }
    for (const key of ['portrait', 'wide']) {
      await page.locator('[data-action="system-back"]').click(); await page.locator('[data-action="system-back"]').click();
      await page.locator(`[data-album-photo="/user/images/album-${key}.png"]`).click(); await page.getByRole('button', { name: '打孔拼贴', exact: true }).click(); await page.locator('[data-album-hole-canvas]').waitFor(); await page.getByRole('tab', { name: '看成品', exact: true }).click();
      await shell.screenshot({ path: `${output}/album-${key}-${host}-${theme}-${width}.png` });
    }
    assert.deepEqual(await page.evaluate(() => ({ requests: previewHarness.requests.length, saves: previewHarness.metadataSaves, settings: previewHarness.settingsSaves })), before, '正常浏览/编辑/导出不请求模型或保存');
    if (host === 'native' && width === 390) {
      await page.evaluate(() => { const h = previewHarness; h.metadata.pocketPhone.conversations.lin = h.metadata.pocketPhone.conversations.lin.filter(m => m.id !== 'wide'); h.app.open(); });
      await page.locator('.album-gallery').waitFor(); assert.equal(await page.locator('[data-album-photo="/user/images/album-wide.png"]').count(), 0);
      await page.evaluate(() => { window.albumDecodeEvents = []; const decode = HTMLImageElement.prototype.decode; HTMLImageElement.prototype.decode = function (...args) { const src = this.src; return decode.apply(this, args).finally(() => window.albumDecodeEvents.push(src)); }; });
      slowGate = new Promise(resolve => { releaseSlow = resolve; });
      sources.set('/user/images/album-slow-late.png', sources.get('/user/images/album-portrait.png'));
      await page.evaluate(() => { const h = previewHarness; h.metadata.pocketPhone.conversations.lin.find(m => m.id === 'slow').image.path = '/user/images/album-slow-late.png'; h.app.open(); });
      await page.locator('[data-album-photo="/user/images/album-slow-late.png"]').click(); await page.getByRole('button', { name: '打孔拼贴', exact: true }).click();
      await page.locator('[role="status"]').filter({ hasText: '正在读取照片' }).waitFor();
      await page.locator('[data-action="system-back"]').click(); await page.locator('[data-action="system-back"]').click();
      await page.locator('[data-album-photo="/user/images/album-10.jpg"]').click(); await page.getByRole('button', { name: '打孔拼贴', exact: true }).click(); await page.locator('[data-album-hole-canvas]').waitFor();
      await page.getByRole('tab', { name: '看成品', exact: true }).click();
      const beforeRelease = await page.locator('[data-album-result-canvas]').evaluate(c => c.toDataURL());
      console.log(JSON.stringify({ stage: 'late-load-before-release', matchesEarlierDraft: beforeRelease === changed, expected: fingerprint(changed), actual: fingerprint(beforeRelease) }));
      assert.ok(beforeRelease === changed, '删B图后重新选A图应保留此前孔位');
      releaseSlow(); slowGate = null;
      await page.waitForFunction(() => window.albumDecodeEvents.some(src => src.includes('album-slow-late.png')));
      const afterRelease = await page.locator('[data-album-result-canvas]').evaluate(c => c.toDataURL());
      console.log(JSON.stringify({ stage: 'late-load-after-release', lateDecodeFinished: true, matchesBeforeRelease: afterRelease === beforeRelease, matchesEarlierDraft: afterRelease === changed, actual: fingerprint(afterRelease) }));
      assert.ok(afterRelease === beforeRelease, '不同尺寸和像素的迟到载图不得覆盖当前A图');
      const switchChat = async id => page.evaluate(async id => { const h = previewHarness, state = structuredClone(h.metadata.pocketPhone); state.conversations.lin = [{ id, role: 'assistant', type: 'image', image: { path: `/user/images/album-${id}.jpg`, description: id } }]; h.metadata = { pocketPhone: state }; h.context.chatId = id; h.context.chatMetadata = h.metadata; await h.context.eventSource.emit('chat-changed'); }, id);
      await switchChat('second-chat'); assert.ok(await page.locator('.pocket-phone').isHidden());
      await page.evaluate(() => previewHarness.app.open()); await openApp(page, '相册'); assert.equal(await page.locator('.album-photo').count(), 1); assert.equal(await page.locator('[data-album-photo="/user/images/album-second-chat.jpg"]').count(), 1);
      await openApp(page, '短信'); await page.locator('[data-contact="lin"]').click(); await switchChat('third-chat');
      await page.locator('[data-action="system-home"]').click(); await page.getByRole('button', { name: '相册', exact: true }).click(); assert.equal(await page.locator('[data-album-photo="/user/images/album-third-chat.jpg"]').count(), 1);
    }
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    results.push({ host, width, theme, geometry, drag: width === 320 ? 'touch' : 'mouse', changesArtwork: true, restoresDraftAndScroll: true, pngs, errors, unexpected });
    console.log(`${host} ${theme} ${width}: passed`); await page.close();
  }
  writeFileSync(`${output}/album-browser-results.json`, JSON.stringify({ browser: browser.version(), results }, null, 2) + '\n');
  console.log(`Album browser artifacts: ${output}`);
} finally { await browser.close(); }
