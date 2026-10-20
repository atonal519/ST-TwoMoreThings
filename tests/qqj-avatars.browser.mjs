import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { openApp } from './navigation.mjs';

const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const portrait = `data:image/png;base64,${readFileSync(new URL('../assets/stickers/sepia-0.png', import.meta.url)).toString('base64')}`;
const manualPortrait = `data:image/png;base64,${readFileSync(new URL('../assets/stickers/sepia-1.png', import.meta.url)).toString('base64')}`;
const browser = await chromium.launch({
  executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' },
});
try {
  for (const host of ['native', 'luker']) for (const width of [320, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${host}`);
    await page.locator('.phone-shell').waitFor();
    await page.evaluate(({ portrait, manualPortrait }) => {
      const state = previewHarness.metadata.pocketPhone;
      state.contacts[0].source = { kind: 'qqj', entityId: 'entity-lin' };
      state.contacts[1].avatar = manualPortrait;
      state.contacts.push(
        { id: 'duplicate', name: '同名人物' },
        { id: 'missing', name: '没有对应的人' },
        { id: 'empty', name: '没有头像的人', source: { kind: 'qqj', entityId: 'entity-empty' } },
        { id: 'cleared', name: '手工清空', avatar: '', manualFields: ['avatar'], source: { kind: 'qqj', entityId: 'entity-cleared' } },
      );
      previewHarness.avatarStatus = 'ready';
      previewHarness.avatarReads = [];
      previewHarness.peopleReads = 0;
      previewHarness.qqjBridge = {
        getPeopleSnapshot() {
          previewHarness.peopleReads++;
          return { status: 'ready', people: { items: [
            { entityId: 'entity-xu', displayName: '许知' },
            { entityId: 'same-1', displayName: '同名人物' },
            { entityId: 'same-2', displayName: '同名人物' },
          ] } };
        },
        getPeopleAvatars(ids) {
          previewHarness.avatarReads.push(ids);
          return { status: previewHarness.avatarStatus, avatarsByEntityId: Object.fromEntries(ids.map(id => [id,
            previewHarness.avatarStatus === 'ready' && id !== 'entity-empty' ? portrait : null])) };
        },
      };
      previewHarness.avatarBefore = JSON.stringify(previewHarness.metadata);
    }, { portrait, manualPortrait });
    await openApp(page, '短信');
    const contact = id => page.locator(`[data-contact="${id}"]`);
    assert.equal(await contact('lin').locator('.avatar img').count(), 1, 'explicit entity avatar reaches inbox');
    assert.equal(await contact('lin').locator('.avatar img').getAttribute('src'), portrait);
    assert.equal(await contact('xu').locator('.avatar img').getAttribute('src'), portrait, 'unique exact name receives its avatar');
    assert.equal(await contact('zhou').locator('.avatar img').getAttribute('src'), manualPortrait, 'manual avatar wins');
    for (const id of ['duplicate', 'missing', 'empty', 'cleared']) assert.equal(await contact(id).locator('.avatar img').count(), 0, id);
    await contact('lin').locator('.avatar img').evaluate(image => image.decode());
    await contact('lin').click();
    assert.equal(await page.locator('.conversation-heading .avatar img').getAttribute('src'), portrait);
    assert.equal(await page.locator('.message-row.is-theirs .avatar img').count() > 0, true);
    await page.locator('[data-action="system-home"]').click();
    await page.evaluate(() => { previewHarness.avatarStatus = 'not-ready'; });
    await openApp(page, '短信');
    assert.equal(await contact('lin').locator('.avatar img').count(), 0, 'not-ready stays empty without saving absence');
    await page.evaluate(() => { previewHarness.avatarStatus = 'ready'; });
    await page.locator('[data-action="system-home"]').click();
    await openApp(page, '短信');
    assert.equal(await contact('lin').locator('.avatar img').getAttribute('src'), portrait, 'normal navigation rereads ready avatars');
    assert.equal(await page.evaluate(() => JSON.stringify(previewHarness.metadata) === previewHarness.avatarBefore), true, 'display does not write avatars into the archive');
    assert.equal(await page.evaluate(() => previewHarness.metadataSaves), 0);
    assert.equal(await page.evaluate(() => previewHarness.requests.length), 0);
    assert.ok(await page.evaluate(() => previewHarness.avatarReads.every(ids => ids.length === new Set(ids).size && !ids.includes('entity-cleared'))));
    await page.close();
  }
  console.log('QQJ avatars: native/Luker 320/390 inbox and SMS, exact IDs and unique names, manual/empty/ambiguous/not-ready cases, zero model calls or archive writes passed.');
} finally { await browser.close(); }
