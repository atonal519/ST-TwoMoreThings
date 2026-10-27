import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { openApp } from './navigation.mjs';

const root = resolve(import.meta.dirname, '..'), prefix = '/scripts/extensions/third-party/ST-PocketPhone/';
const tools = process.env.POCKET_BROWSER_TOOLS || '/tmp/tmt-hot-browser-20261026', output = process.env.POCKET_PRESETS_OUTPUT;
if (output) await mkdir(output, { recursive: true });
const { chromium } = createRequire(resolve(tools, 'package.json'))('playwright');
const browser = await chromium.launch({ executablePath: resolve(tools, 'browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell'), args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: resolve(tools, 'libs/usr/lib/x86_64-linux-gnu') } });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf' }, results = [];
try {
  for (const [kind, mode] of [['native', 'standalone'], ['luker', 'embedded']]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }), errors = [], unexpected = [], calls = [], layouts = [];
    page.setDefaultTimeout(8000); page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      if (url.hostname !== '127.0.0.1') { unexpected.push(url.href); return route.abort(); }
      if (path.startsWith(prefix)) return route.fulfill({ path: resolve(root, decodeURIComponent(path.slice(prefix.length))), contentType: mime[extname(path)] || 'application/octet-stream' });
      if (path === '/fixture-font.ttf') return route.fulfill({ path: resolve(tools, 'NotoSansSC.ttf'), contentType: 'font/ttf' });
      if (path === '/lib.js') return route.fulfill({ contentType: mime['.js'], body: 'export const showdown={Converter:class{makeHtml(t){return t}}};export const DOMPurify={sanitize:h=>h};' });
      if (path === '/scripts/extensions.js') return route.fulfill({ contentType: mime['.js'], body: "export const extensionTypes={'third-party/ST-PocketPhone':'local'};" });
      if (path === '/scripts/world-info.js') return route.fulfill({ contentType: mime['.js'], body: "export const selected_world_info=[],world_info={};export async function loadWorldInfo(){return {entries:{0:{constant:true,content:'普通公共设定'}}}}" });
      if (path === '/api/extensions/version') return route.fulfill({ json: { currentBranchName: 'main', currentCommitHash: 'a'.repeat(40), remoteUrl: 'https://github.com/fixture/phone', isUpToDate: true } });
      if (path === '/api/backends/chat-completions/status') { const body = route.request().postDataJSON(); calls.push({ type: 'list', url: body.reverse_proxy, inheritedKey: body.proxy_password === 'fixture-key' }); return route.fulfill({ json: { data: [{ id: 'a-model' }, { id: 'b-model' }] } }); }
      if (path === '/api/backends/chat-completions/generate') { const body = route.request().postDataJSON(); calls.push({ type: 'complete', url: body.reverse_proxy, model: body.model }); return route.fulfill({ json: { choices: [{ message: { content: '{"messages":[{"text":"合成回复。"}]}' } }] } }); }
      unexpected.push(url.href); return route.abort();
    });
    await page.goto(`http://127.0.0.1:8917${prefix}tests/startup.html?host=${kind}&mode=${mode}`); await page.waitForFunction(() => startupHarness.ready);
    await page.evaluate(mode => {
      const h = startupHarness, own = mode === 'embedded' ? 'twoMoreThingsEmbedded' : 'pocketPhone';
      h.ownKey = own; h.otherKey = mode === 'embedded' ? 'pocketPhone' : 'twoMoreThingsEmbedded';
      h.settings['schedule-planner'] = { apiPresetActiveId: 'a', foreign: true, apiPresets: [{ id: 'a', name: '日常连接', url: 'https://saved.invalid/v1', key: 'fixture-key', model: 'shared-default', timeoutSec: 180, excludeParams: [], unknown: { keep: true } }, { id: 'b', name: '备用连接', url: 'https://other.invalid/v1', key: 'other-key', model: 'other-default' }] };
      Object.assign(h.settings[own], { apiSourceRef: { kind: 'shared-preset', presetId: 'a' }, apiModel: 'saved-custom' });
      Object.assign(h.settings[h.otherKey], { apiSourceRef: { kind: 'shared-preset', presetId: 'a' }, apiModel: 'other-custom' });
      h.original = structuredClone(h.settings['schedule-planner'].apiPresets[0]); h.other = structuredClone(h.settings[h.otherKey]);
      h.context.saveSettingsDebounced = async () => { h.settingsSaves++; };
    }, mode);
    await page.getByRole('button', { name: mode === 'embedded' ? '打开两三事 · 随卡' : '打开两三事', exact: true }).click();
    const phone = page.locator(mode === 'embedded' ? '#pocket-phone-card-host' : '#pocket-phone-host');
    await phone.evaluate(async element => { const font = new FontFace('PhoneFixtureCJK', 'url(http://127.0.0.1:8917/fixture-font.ttf)'); await font.load(); document.fonts.add(font); const style = document.createElement('style'); style.textContent = ':host{font-family:PhoneFixtureCJK,sans-serif}'; element.shadowRoot.append(style); });
    for (const theme of ['day', 'night']) for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 }); await page.evaluate(theme => { startupHarness.metadata.pocketPhone.theme = theme; }, theme); await openApp(phone, '设置');
      const geometry = await phone.locator('.api-form').evaluate(form => { const main = form.closest('.phone-main'), shell = form.closest('.phone-shell'), sr = shell.getBoundingClientRect(); return { width: main.clientWidth, scrollWidth: main.scrollWidth, buttonsInside: [...form.querySelectorAll('.api-actions button')].every(button => { const r = button.getBoundingClientRect(); return r.left >= sr.left && r.right <= sr.right && r.width > 0; }) }; });
      assert.ok(geometry.scrollWidth <= geometry.width); assert.equal(geometry.buttonsInside, true); layouts.push({ theme, viewport: width, ...geometry });
    }
    await page.evaluate(() => { startupHarness.metadata.pocketPhone.theme = 'day'; }); await openApp(phone, '设置');
    await page.evaluate(() => { startupHarness.managementSaveBase = startupHarness.settingsSaves; });
    assert.equal(await phone.locator('#api-key').inputValue(), ''); assert.equal(await phone.locator('#api-url').getAttribute('readonly'), null);
    await phone.getByRole('button', { name: '使用的配置', exact: true }).click(); assert.deepEqual(await phone.locator('[data-api-source]').allTextContents(), ['自行填写', '日常连接', '备用连接']); await page.keyboard.press('Escape');
    await phone.locator('#api-url').fill('https://draft.invalid/v1'); await phone.locator('#api-model').fill('draft-custom'); await phone.getByRole('button', { name: '拉取模型', exact: true }).click(); await phone.getByRole('button', { name: /已拉取 2 个模型/ }).waitFor(); assert.equal(await phone.locator('#api-url').inputValue(), 'https://draft.invalid/v1');
    await openApp(phone, '短信'); await phone.locator('[data-contact="lin"]').click(); await phone.getByRole('button', { name: '继续', exact: true }).click(); await page.waitForFunction(() => startupHarness.metadata.pocketPhone.conversations.lin?.length === 1);
    assert.deepEqual(calls[1], { type: 'complete', url: 'https://saved.invalid/v1', model: 'saved-custom' });
    await openApp(phone, '设置'); await phone.locator('#api-url').fill('https://edited.invalid/v1'); await phone.locator('#api-model').fill('edited-custom');
    await phone.getByRole('button', { name: '拉取模型', exact: true }).click(); await phone.getByRole('button', { name: /已拉取 2 个模型/ }).waitFor(); await phone.locator('.api-form button[type="submit"]').click(); await phone.getByText('连接已保存。', { exact: true }).waitFor();
    assert.equal(await phone.locator('#api-url').inputValue(), 'https://edited.invalid/v1'); assert.equal(await phone.locator('#api-model').inputValue(), 'edited-custom');
    await page.evaluate(() => { const h = startupHarness; const a = h.settings['schedule-planner'].apiPresets[0]; if (a.model !== 'shared-default' || a.key !== 'fixture-key' || !a.unknown.keep || h.settingsSaves-h.managementSaveBase !== 1) throw Error(JSON.stringify({model:a.model,keyMatches:a.key==='fixture-key',unknownKept:a.unknown?.keep,saves:h.settingsSaves-h.managementSaveBase})); });
    if (output && kind === 'native') await phone.locator('.phone-shell').screenshot({ path: resolve(output, 'api-presets-day.png') });
    await phone.locator('#api-url').fill('https://copy.invalid/v1'); await phone.locator('#api-model').fill('copy-custom'); await phone.getByRole('button', { name: '另存为', exact: true }).click();
    const dialog = phone.getByRole('dialog', { name: '另存为预设' }), input = dialog.getByRole('textbox', { name: '预设名称' });
    assert.equal(await input.evaluate(n => n.getRootNode().activeElement === n), true); await input.fill('  '); await input.press('Enter'); assert.equal(await dialog.count(), 1); assert.equal(await page.evaluate(() => startupHarness.settingsSaves-startupHarness.managementSaveBase), 1);
    await page.keyboard.press('Tab'); assert.equal(await dialog.getByRole('button', { name: '取消', exact: true }).evaluate(n => n.getRootNode().activeElement === n), true); await page.keyboard.press('Shift+Tab'); assert.equal(await input.evaluate(n => n.getRootNode().activeElement === n), true);
    await page.keyboard.press('Escape'); assert.equal(await dialog.count(), 0); assert.equal(await phone.locator('#api-url').inputValue(), 'https://copy.invalid/v1'); assert.equal(await page.evaluate(() => startupHarness.settingsSaves-startupHarness.managementSaveBase), 1);
    await page.evaluate(() => { startupHarness.metadata.pocketPhone.theme = 'night'; }); await openApp(phone, '设置'); await phone.locator('#api-url').fill('https://copy.invalid/v1'); await phone.locator('#api-model').fill('copy-custom'); await phone.getByRole('button', { name: '另存为', exact: true }).click(); await input.fill('随手聊聊');
    if (output && kind === 'native') await phone.locator('.phone-shell').screenshot({ path: resolve(output, 'api-presets-name-night.png') });
    await input.press('Enter'); await phone.getByText('预设已另存。', { exact: true }).waitFor();
    const copied = await page.evaluate(() => { const h = startupHarness, pool = h.settings['schedule-planner'].apiPresets; return { own: h.settings[h.ownKey], a: pool[0], copy: pool.at(-1), count: pool.length }; });
    assert.equal(copied.count, 3); assert.equal(copied.copy.name, '随手聊聊'); assert.equal(copied.copy.key, 'fixture-key'); assert.equal(copied.copy.model, 'copy-custom'); assert.equal(copied.a.model, 'shared-default'); assert.equal(copied.a.url, 'https://edited.invalid/v1'); assert.notEqual(copied.copy.id, 'a'); assert.equal(copied.own.apiSourceRef.presetId, copied.copy.id);
    await openApp(phone, '短信'); await phone.locator('[data-contact="lin"]').click(); await phone.getByRole('button', { name: '继续', exact: true }).click(); await page.waitForFunction(() => startupHarness.metadata.pocketPhone.conversations.lin?.length === 2); assert.deepEqual(calls[3], { type: 'complete', url: 'https://copy.invalid/v1', model: 'copy-custom' });
    await openApp(phone, '设置'); await phone.locator('#api-model').fill(''); await phone.getByRole('button', { name: '删除', exact: true }).click(); const deletion = phone.getByRole('dialog', { name: '删除 API 预设' }); await deletion.getByText(/使用它的其他插件/).waitFor(); await deletion.getByRole('button', { name: '取消', exact: true }).click(); assert.equal(await page.evaluate(() => startupHarness.settingsSaves-startupHarness.managementSaveBase), 2);
    await phone.getByRole('button', { name: '删除', exact: true }).click(); await deletion.getByRole('button', { name: '删除', exact: true }).click(); await phone.getByText('预设已删除。', { exact: true }).waitFor();
    await phone.getByRole('button', { name: '关闭手机', exact: true }).click(); await page.getByRole('button', { name: mode === 'embedded' ? '打开两三事 · 随卡' : '打开两三事', exact: true }).click(); await openApp(phone, '设置'); assert.equal(await phone.locator('#api-url').inputValue(), ''); assert.equal(await phone.locator('#api-model').inputValue(), '');
    await openApp(phone, '短信'); await phone.locator('[data-contact="lin"]').click(); await phone.getByRole('button', { name: '继续', exact: true }).click(); await phone.locator('.feedback.is-error').waitFor(); assert.equal(calls.length, 4);
    const final = await page.evaluate(() => { const h = startupHarness; return { saves: h.settingsSaves-h.managementSaveBase, startupSaves:h.managementSaveBase, own: h.settings[h.ownKey], other: h.settings[h.otherKey], originalOther: h.other, poolIds: h.settings['schedule-planner'].apiPresets.map(p => p.id), active: h.settings['schedule-planner'].apiPresetActiveId, errors: h.errors }; });
    assert.equal(final.saves, 3); assert.deepEqual(final.own.apiSourceRef, { kind: 'none' }); assert.equal(final.own.apiModel, ''); assert.deepEqual(final.other, final.originalOther); assert.deepEqual(final.poolIds, ['a', 'b']); assert.equal(final.active, 'a'); assert.deepEqual(final.errors, []); assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    results.push({ kind, mode, settingsSaves: final.saves, startupSettingsSaves:final.startupSaves, totalSettingsSaves:final.saves+final.startupSaves, calls, cancelledActionsSaveCount: 0, explicitNoneSurvivesReopen: true, deletingEmptyModelAllowed: true, originalPresetAndOtherInstancePreserved: true, keyboardNameValidation: true, firstSaveWhileModelListOpen: true, noCredentialEcho: true, layouts, errors, unexpected }); await page.close();
  }
  if (output) await writeFile(resolve(output, 'browser-result.json'), JSON.stringify(results, null, 2) + '\n'); console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
