import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { openApp } from './navigation.mjs';
const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
try {
  for (const [kind, mode] of [['native', 'standalone'], ['luker', 'embedded']]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); page.setDefaultTimeout(6000);
    const errors = [], requests = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.route('**/scripts/extensions.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const extensionTypes={};' }));
    await page.route('**/scripts/power-user.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const power_user={encode_tags:false};' }));
    await page.route('**/scripts/world-info.js', route => route.fulfill({ contentType: 'text/javascript', body: `export const selected_world_info=[],world_info={}; export async function loadWorldInfo(){return structuredClone(previewHarness.book)} export function createWorldInfoEntry(n,d){const e={uid:Math.max(...Object.keys(d.entries).map(Number))+1};d.entries[e.uid]=e;return e} export async function saveWorldInfo(n,d,now){if(!now)throw Error('must save immediately');previewHarness.book=structuredClone(d);previewHarness.bookSaves++}` }));
    await page.route('**/scripts/extensions/regex/engine.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const SCRIPT_TYPES={GLOBAL:0};export function getScriptsByType(){return previewHarness.rules}export async function saveScriptsByType(r){previewHarness.rules=r;previewHarness.ruleSaves++}' }));
    await page.route('**/api/backends/chat-completions/generate', async route => {
      const body = route.request().postDataJSON(); requests.push(body);
      await route.fulfill({ json: { choices: [{ message: { content: '{"messages":[{"text":"手机新回复"}]}' } }] } });
    });
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${kind}&entry=extension`);
    await page.getByRole('button', { name: '打开两三事', exact: true }).waitFor();
    await page.evaluate(async mode => {
      const h = previewHarness;
      h.context.characters[0].avatar = 'fixture.png'; h.context.characters[0].data = { extensions: { world: 'fixture-book' } };
      h.book = { entries: { 0: { uid: 0, comment: '其他条目', constant: true, content: '原世界观', custom: 7 } } }; h.rules = [{ id: 'other', scriptName: '原规则' }]; h.bookSaves = 0; h.ruleSaves = 0;
      h.mainMessages[0].mes = '首次打开前的正文。[tmt|开场朋友|开场朋友]首次短信[/tmt]';
      h.saveWait = new Promise(resolve => { h.releaseSave = resolve; });
      if (mode === 'embedded') {
        h.settings.pocketPhone = { disabledCards: { 'character:fixture.png': true } };
        h.embedded = (await import('/embed.js')).mountEmbedded({ release: { version: '0.3.9', sha: 'a'.repeat(40) } });
      }
    }, mode);
    const phone = page.locator(mode === 'embedded' ? '#pocket-phone-card-host' : '#pocket-phone-host');
    const launcher = page.getByRole('button', { name: mode === 'embedded' ? '打开两三事 · 随卡' : '打开两三事', exact: true });
    const fab = page.locator(mode === 'embedded' ? '#tmt-card-fab-host' : '#tmt-fab-host').getByRole('button');
    await fab.click(); await launcher.dispatchEvent('click');
    assert.equal(await phone.count(), 1, 'repeated entry while save is pending reuses one phone component');
    await page.evaluate(() => { previewHarness.releaseSave(); delete previewHarness.saveWait; });
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.storySmsImportedFloor === 0);
    assert.equal(await phone.count(), 1);
    await openApp(phone, '短信'); await phone.getByText('开场朋友', { exact: true }).click(); await phone.getByText('首次短信', { exact: true }).waitFor();
    await openApp(phone, '设置'); await phone.getByRole('button', { name: '内容设置', exact: true }).click();
    await phone.getByRole('button', { name: '注入', exact: true }).click();
    await phone.getByRole('button', { name: '已注入', exact: true }).waitFor();
    assert.equal(await phone.getByRole('button', { name: '已注入', exact: true }).isDisabled(), true);
    const installed = await page.evaluate(() => ({ book: previewHarness.book, rules: previewHarness.rules }));
    assert.equal(installed.book.entries[0].custom, 7); assert.equal(installed.rules[0].id, 'other');
    const owned = Object.values(installed.book.entries).find(entry => entry.extensions?.twoMoreThings?.storySms);
    assert.deepEqual(owned.characterFilter.names, ['fixture']); assert.equal(owned.position, 4); assert.equal(owned.depth, 1); assert.equal(owned.role, 0);
    const select = phone.locator('#api-source');
    await select.selectOption(await select.locator('option').evaluateAll(options => options.find(option => option.value && option.value !== 'manual').value));
    await phone.getByRole('switch', { name: '短信带入正文' }).check();
    await phone.getByRole('button', { name: '关闭手机', exact: true }).click();
    await page.evaluate(async () => { const h = previewHarness; h.mainMessages.push({ is_user: false, mes: '街边很安静。[tmt|朋友甲|朋友甲]晚上八点见，完整原话。[/tmt][tmt|群:读书群|朋友乙]我会带书。[/tmt]<!-- QQJ-end | date=2031/4/8 | time=09:30 -->' }); await h.storyUpdated(); });
    const saved = await page.evaluate(() => ({ data: structuredClone(previewHarness.metadata.pocketPhone), saves: previewHarness.metadataSaves }));
    const contact = saved.data.contacts.find(person => person.name === '朋友甲'); assert.ok(contact);
    assert.equal(saved.data.conversations[contact.id][0].read, true); assert.equal(saved.data.conversations[contact.id][0].source.floor, 1);
    await page.evaluate(() => previewHarness.storyUpdated());
    assert.equal(await page.evaluate(() => previewHarness.metadataSaves), saved.saves);
    await page.getByRole('button', { name: mode === 'embedded' ? '打开两三事 · 随卡' : '打开两三事', exact: true }).click();
    await openApp(phone, '短信'); await phone.locator(`[data-contact="${contact.id}"]`).click();
    await phone.getByText('晚上八点见，完整原话。', { exact: true }).waitFor();
    await page.evaluate(() => previewHarness.beforeGeneration());
    assert.equal(await page.evaluate(() => previewHarness.prompt), ''); assert.equal(requests.length, 0);
    await phone.getByRole('button', { name: '继续', exact: true }).click(); await phone.getByText('手机新回复', { exact: true }).waitFor();
    assert.equal(requests.length, 1);
    const input = JSON.parse(requests[0].messages[1].content);
    assert.ok(input.history.some(row => row.text === '晚上八点见，完整原话。')); assert.equal(input.story[0].text, '街边很安静。'); assert.ok(!input.worldbook.includes('[tmt|'));
    await page.evaluate(() => previewHarness.beforeGeneration());
    assert.ok(await page.evaluate(() => previewHarness.prompt.includes('手机新回复') && !previewHarness.prompt.includes('晚上八点见')));
    await phone.getByText('晚上八点见，完整原话。', { exact: true }).click(); await phone.getByRole('button', { name: '删除这条短信', exact: true }).click();
    await page.waitForFunction(id => !previewHarness.metadata.pocketPhone.conversations[id].some(row => row.source?.kind === 'main-story'), contact.id);
    await page.evaluate(() => previewHarness.storyUpdated()); assert.equal(await phone.getByText('晚上八点见，完整原话。', { exact: true }).count(), 0);
    const saveErrors = [];
    page.on('dialog', async dialog => { saveErrors.push(dialog.message()); await dialog.dismiss(); });
    const beforeFailure = await page.evaluate(() => structuredClone(previewHarness.metadata.pocketPhone));
    await page.evaluate(async () => {
      previewHarness.failSave = true;
      previewHarness.mainMessages.push({ is_user: false, mes: '[tmt|保存失败测试|保存失败测试]未保存的短信[/tmt]' });
      await previewHarness.storyUpdated();
    });
    assert.deepEqual(await page.evaluate(() => previewHarness.metadata.pocketPhone), beforeFailure);
    assert.equal(saveErrors.length, 1); assert.match(saveErrors[0], /主楼短信未能同步/);
    await openApp(phone, '设置'); await phone.getByRole('switch', { name: '启用两三事', exact: true }).uncheck();
    await page.evaluate(async () => {
      previewHarness.mainMessages.push({ is_user: false, mes: '[tmt|启用朋友|启用朋友]重新启用后同步[/tmt]' });
      await previewHarness.storyUpdated();
    });
    assert.deepEqual(await page.evaluate(() => previewHarness.metadata.pocketPhone), beforeFailure, 'disabled phone does not project SMS');
    await phone.getByRole('switch', { name: '启用两三事', exact: true }).check();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.contacts.some(person => person.name === '启用朋友'));
    await openApp(phone, '短信'); await phone.getByText('启用朋友', { exact: true }).click(); await phone.getByText('重新启用后同步', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`${kind}/${mode}: install into bound book, owned regex/card filter, pending-save repeated entry uses one component, hidden-window projection, one batch save, reopening/continued SMS, source-only backflow exclusion, manual delete retention and save-failure feedback passed; one simulated model request.`);
    await page.close();
  }
} finally { await browser.close(); }
