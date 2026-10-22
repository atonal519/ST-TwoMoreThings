import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, extname, basename } from 'node:path';
import { openApp } from './navigation.mjs';

const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
const root = resolve(import.meta.dirname, '..'), oldSha = '56a6614198bd177f967a9406f7b6f425f9a810af', newSha = 'a'.repeat(40);
const announcement = '# 版本公告\n\n[说明](https://example.invalid)\n\n<img src=x onerror=alert(1)>\n\n' + readFileSync(resolve(root, 'README.md'), 'utf8');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png', '.webp': 'image/webp' };
const file = (route, path) => route.fulfill({ path, contentType: types[extname(path)] || 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' } });
const hostLibraries = async page => {
  await page.route('**/lib.js', route => route.fulfill({ contentType: 'text/javascript', body: `import DOMPurify from '/__purify.mjs'; const module={exports:{}};\n${readFileSync('/home/admin/sillytavern/node_modules/showdown/dist/showdown.min.js', 'utf8')}\nexport const showdown=module.exports; export {DOMPurify};` }));
  await page.route('**/__purify.mjs', route => file(route, '/home/admin/sillytavern/node_modules/dompurify/dist/purify.es.mjs'));
};
try {
  for (const kind of ['native', 'luker']) for (const installation of ['local', 'global']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); page.setDefaultTimeout(6000);
    const errors = [], posts = []; let noticeFails = false, updateFails = true;
    page.on('pageerror', error => errors.push(error.message));
    await hostLibraries(page);
    await page.route('**/scripts/extensions.js', route => route.fulfill({ contentType: 'text/javascript', body: `export const extensionTypes={'third-party/My Phone':'${installation}'};` }));
    await page.route('**/scripts/extensions/third-party/My%20Phone/**', route => {
      const pathname = new URL(route.request().url()).pathname.split('/My%20Phone/')[1];
      return file(route, resolve(root, decodeURIComponent(pathname)));
    });
    await page.route('**/api/extensions/*', route => {
      posts.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
      return route.fulfill({ status: posts.at(-1).path.endsWith('/update') && updateFails ? 409 : 200, json: posts.at(-1).path.endsWith('/version')
        ? { currentBranchName: 'main', currentCommitHash: oldSha, remoteUrl: 'https://github.com/mirror/phone.git', isUpToDate: false }
        : { isUpToDate: true, shortCommitHash: 'aaaaaaa' } });
    });
    await page.route('https://raw.githubusercontent.com/mirror/phone/main/**', route => {
      assert.equal(route.request().headers()['x-csrf-token'], undefined);
      if (noticeFails) return route.fulfill({ status: 404, body: '', headers: { 'Access-Control-Allow-Origin': '*' } });
      return route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('manifest.json') ? { update_notice: 'docs/new.md' } : undefined,
        body: new URL(route.request().url()).pathname.endsWith('manifest.json') ? undefined : announcement, headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    await page.goto(`http://127.0.0.1:8917/scripts/extensions/third-party/My%20Phone/tests/preview.html?host=${kind}&entry=extension`);
    await page.evaluate(() => { globalThis.toastr = { success: text => (previewHarness.notices ||= []).push(text), error: text => (previewHarness.errors ||= []).push(text) }; });
    await page.getByRole('button', { name: '打开两三事', exact: true }).click();
    await page.waitForFunction(() => previewHarness.metadataSaves === 1);
    const phone = page.locator('#pocket-phone-host'); await openApp(phone, '设置');
    await phone.locator('.app-version').getByText('两三事 0.3.8', { exact: true }).waitFor();
    await phone.getByRole('button', { name: '可更新', exact: true }).waitFor();
    assert.equal(posts.length, 1);
    if (kind === 'native' && installation === 'local' && process.env.POCKET_UPDATE_SCREENSHOTS !== '0') {
      mkdirSync('/tmp/tmt-plugin-updates-screenshots', { recursive: true });
      await page.route('**/__font/*.woff2', route => {
        const name = basename(new URL(route.request().url()).pathname), primary = `/tmp/mobile-plugin-reference-research/preview-fonts/${name}`;
        return file(route, existsSync(primary) ? primary : `/tmp/myriad-home-design-20261016/${name}`);
      });
      await phone.evaluate((element, css) => {
        const font = document.createElement('style'); font.textContent = css; document.head.append(font);
        const style = document.createElement('style'); style.textContent = ':host{font-family:PocketPreviewCJK,sans-serif}'; element.shadowRoot.append(style);
      }, readFileSync('/tmp/mobile-plugin-reference-research/preview-fonts.css', 'utf8').replaceAll('Nowar Rounded TW Wc', 'PocketPreviewCJK'));
      await page.evaluate(async () => { await document.fonts.load('15px PocketPreviewCJK', '设置可更新公告检查版本更新暂不更新启用两三事'); await document.fonts.ready; });
      for (const width of [320, 390]) for (const theme of ['day', 'night']) {
        await page.setViewportSize({ width, height: 844 });
        await phone.evaluate((element, theme) => { element.dataset.theme = theme; }, theme);
        await phone.locator('.phone-shell').screenshot({ path: `/tmp/tmt-plugin-updates-screenshots/settings-${width}-${theme}.png` });
        await phone.getByRole('button', { name: '可更新', exact: true }).click();
        await phone.getByRole('heading', { name: '版本公告', exact: true }).waitFor();
        assert.equal(await phone.getByRole('button', { name: '更新', exact: true }).evaluate(button => {
          const box = button.getBoundingClientRect(), panel = button.closest('.phone-dialog').getBoundingClientRect();
          return box.top >= panel.top && box.bottom <= panel.bottom;
        }), true);
        assert.equal(await phone.locator('.pp-update-notice').evaluate(content => content.scrollHeight > content.clientHeight), true);
        await phone.locator('.phone-shell').screenshot({ path: `/tmp/tmt-plugin-updates-screenshots/notice-${width}-${theme}.png` });
        await phone.getByRole('button', { name: '暂不更新' }).click();
      }
    }
    await phone.getByRole('button', { name: '可更新', exact: true }).click();
    const modal = phone.getByRole('dialog', { name: '两三事更新公告' });
    await modal.getByRole('heading', { name: '版本公告', exact: true }).waitFor();
    assert.equal(await modal.locator('img').count(), 0);
    assert.equal(await modal.getByRole('link', { name: '说明', exact: true }).getAttribute('rel'), 'noopener noreferrer');
    await modal.getByRole('button', { name: '暂不更新' }).click(); assert.equal(posts.length, 1);
    noticeFails = true;
    await phone.getByRole('button', { name: '可更新', exact: true }).click();
    await phone.getByText('暂时无法读取更新公告，仍可更新。', { exact: true }).waitFor();
    await phone.getByRole('button', { name: '更新', exact: true }).click();
    await phone.getByRole('button', { name: '可更新', exact: true }).waitFor();
    assert.equal(await phone.locator('.phone-shell').isVisible(), true);
    assert.equal(posts.length, 2);
    updateFails = false;
    await phone.getByRole('button', { name: '可更新', exact: true }).click();
    await phone.getByRole('button', { name: '更新', exact: true }).click();
    await phone.getByRole('button', { name: '稳定版本', exact: true }).waitFor();
    assert.equal(posts.length, 3);
    for (const request of posts) assert.deepEqual(request.body, { extensionName: 'My Phone', global: installation === 'global' });
    assert.deepEqual(await page.evaluate(() => previewHarness.notices), ['两三事已更新，请刷新酒馆后使用']);
    await phone.locator('.app-version').getByRole('button', { name: '查看公告', exact: true }).click();
    const installedNotice = phone.getByRole('dialog', { name: '已安装版本公告' });
    await installedNotice.getByRole('heading', { name: '两三事 0.3.8', exact: true }).waitFor();
    assert.equal(await installedNotice.getByRole('listitem').count(), 7);
    await installedNotice.getByRole('button', { name: '关闭', exact: true }).click();
    assert.equal(await page.evaluate(() => previewHarness.metadataSaves), 1, 'only the initial missing-contact portraits are saved');
    assert.deepEqual(errors, []); await page.close();
  }
  for (const kind of ['native', 'luker']) for (const custom of [false, true]) for (const failImport of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); page.setDefaultTimeout(7000);
    const errors = [], imported = []; let checks = 0, pulls = 0;
    page.on('pageerror', error => errors.push(error.message));
    if (custom) await hostLibraries(page);
    await page.route('**/api/extensions/**', route => { pulls++; return route.abort(); });
    await page.route('https://raw.githubusercontent.com/atonal519/ST-TwoMoreThings/main/release.json', route => {
      checks++; assert.equal(route.request().headers()['x-csrf-token'], undefined);
      return route.fulfill({ json: { version: '0.3.7', sha: newSha, update_notice: 'docs/new.md' }, headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    await page.route('https://cdn.jsdelivr.net/**', route => {
      const pathname = new URL(route.request().url()).pathname, [revision, ...parts] = pathname.split('@')[1].split('/'), path = parts.join('/');
      imported.push({ revision, path });
      if (revision === newSha && path === 'src/runtime.js' && failImport) return route.abort('failed');
      if (path === 'docs/new.md') return route.fulfill({ status: custom ? 200 : 404, body: custom ? '# 随卡新版公告' : '', headers: { 'Access-Control-Allow-Origin': '*' } });
      if (path === 'src/version.js') return route.fulfill({ contentType: 'text/javascript', body: `export const VERSION='${revision === newSha ? '0.3.7' : '0.3.6'}';`, headers: { 'Access-Control-Allow-Origin': '*' } });
      return file(route, resolve(root, path));
    });
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${kind}`);
    await page.locator('.phone-shell').waitFor();
    const before = await page.evaluate(async ({ custom, oldSha, kind }) => {
      previewHarness.app.dispose();
      globalThis[kind === 'native' ? 'SillyTavern' : 'Luker'] = { getContext: () => previewHarness.context };
      globalThis.toastr = { success: text => (previewHarness.notices ||= []).push(text), error: text => (previewHarness.errors ||= []).push(text) };
      previewHarness.settings.twoMoreThingsEmbedded = { qrShow: true };
      const remove = quickReplyApi.deleteQuickReply; quickReplyApi.deleteQuickReply = (...args) => { (previewHarness.qrDeletes ||= []).push(args); return remove(...args); };
      const preset = { schemaVersion: 1, contacts: [{ id: 'authored', name: '作者联系人' }], groups: [] };
      if (custom) delete previewHarness.metadata.pocketPhone;
      const { mountEmbedded } = await import(`https://cdn.jsdelivr.net/gh/atonal519/ST-TwoMoreThings@${oldSha}/embed.js`);
      let host;
      if (custom) {
        const { createHostAdapter } = await import(`https://cdn.jsdelivr.net/gh/atonal519/ST-TwoMoreThings@${oldSha}/src/host.js`);
        host = createHostAdapter({ mode: 'embedded', contextProvider: () => previewHarness.context });
        for (const key of ['readExtensionTypes', 'getRequestHeaders', 'renderUpdateMarkdown', 'reportSuccess']) delete host[key];
        const capture = host.captureChat.bind(host); host.captureChat = () => { previewHarness.customCaptures = (previewHarness.customCaptures || 0) + 1; return capture(); };
      }
      previewHarness.embedded = mountEmbedded({ preset, ...(host ? { host } : {}), documentRef: document });
      previewHarness.embedded.open();
      return { metadata: JSON.stringify(previewHarness.metadata), settings: JSON.stringify(previewHarness.settings), saves: previewHarness.metadataSaves };
    }, { custom, oldSha, kind });
    const phone = page.locator('#pocket-phone-card-host'); await openApp(phone, '设置');
    await phone.getByRole('button', { name: '可更新', exact: true }).waitFor();
    assert.equal(checks, 1);
    await phone.getByRole('button', { name: '可更新', exact: true }).click();
    await phone.getByRole('button', { name: '暂不更新' }).click();
    assert.equal(imported.some(item => item.revision === newSha && item.path.endsWith('.js')), false);
    const captures = await page.evaluate(() => previewHarness.customCaptures || 0);
    await phone.getByRole('button', { name: '可更新', exact: true }).click();
    if (custom) await phone.getByRole('heading', { name: '随卡新版公告', exact: true }).waitFor();
    else await phone.getByText('暂时无法读取更新公告，仍可更新。', { exact: true }).waitFor();
    await phone.getByRole('button', { name: '更新', exact: true }).click();
    if (failImport) {
      await page.waitForFunction(() => previewHarness.errors?.length === 1);
      await phone.getByText('两三事 0.3.6', { exact: true }).waitFor();
      assert.equal(await phone.locator('.phone-shell').isVisible(), true);
      assert.equal(await phone.getByRole('button', { name: '可更新', exact: true }).count(), 1);
    } else {
      await page.waitForFunction(() => previewHarness.notices?.length || previewHarness.errors?.length);
      assert.deepEqual(await page.evaluate(() => previewHarness.errors || []), []);
      await openApp(phone, '设置');
      await phone.getByText('两三事 0.3.7', { exact: true }).waitFor();
      await phone.getByRole('button', { name: '稳定版本', exact: true }).waitFor();
      assert.deepEqual(await page.evaluate(() => previewHarness.notices), ['两三事已更新，可继续使用。']);
      assert.deepEqual(await page.evaluate(() => previewHarness.qrDeletes || []), []);
      assert.equal(await page.evaluate(() => !!previewHarness.context.SlashCommandParser.commands['tmt-card-open']), true);
      if (custom) assert.ok(await page.evaluate(() => previewHarness.customCaptures) > captures);
      assert.equal(imported.filter(item => item.revision === newSha && item.path === 'embed.js').length, 0, 'replacement imports runtime, not another mount proxy');
      if (custom) {
        await openApp(phone, '短信');
        await phone.getByRole('button', { name: /作者联系人/ }).waitFor();
        await openApp(phone, '设置');
        await phone.locator('.app-version').getByRole('button', { name: '查看公告', exact: true }).click();
        await phone.getByRole('dialog', { name: '已安装版本公告' }).getByRole('heading', { name: '随卡新版公告' }).waitFor();
        await phone.getByRole('button', { name: '关闭', exact: true }).click();
      }
    }
    assert.equal(checks, 1); assert.equal(pulls, 0);
    assert.equal(await page.evaluate(() => JSON.stringify(previewHarness.metadata)), before.metadata);
    assert.equal(await page.evaluate(() => JSON.stringify(previewHarness.settings)), before.settings);
    assert.equal(await page.evaluate(() => previewHarness.metadataSaves), before.saves);
    await page.evaluate(() => previewHarness.embedded.dispose());
    await page.waitForFunction(() => previewHarness.qrDeletes?.length === 1);
    assert.equal(await page.locator('#pocket-phone-card-launch').count(), 0);
    assert.equal(await page.locator('#pocket-phone-card-host').count(), 0);
    assert.deepEqual(errors, []); await page.close();
  }
  console.log('Native/Luker local/global plugin updates, shared notices/confirmation, and default/custom embedded live runtime replacement/failure/disposal passed. Mock network and archives only.');
} finally { await browser.close(); }
