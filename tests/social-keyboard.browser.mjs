import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { openApp } from './navigation.mjs';

const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const output = '/tmp/mobile-plugin-reference-research/social-keyboard';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' },
});

const twoFrames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function assertFocusedFormVisible(page, label, screenshot) {
  const form = page.locator('.social-comment-form').first();
  const textarea = form.locator('textarea');
  await form.scrollIntoViewIfNeeded();
  await textarea.fill(`${label} 留言草稿`);
  await textarea.click();
  await page.evaluate(() => {
    const root = document.querySelector('#pocket-phone-host').shadowRoot;
    root.querySelector('.social-comment-form textarea').dataset.keyboardRegression = 'focused';
  });
  const before = await page.evaluate(() => ({
    scroll: window.scrollY,
    viewScroll: document.querySelector('#pocket-phone-host').shadowRoot.querySelector('.phone-main').scrollTop,
    value: document.querySelector('#pocket-phone-host').shadowRoot.activeElement.value,
    start: document.querySelector('#pocket-phone-host').shadowRoot.activeElement.selectionStart,
    end: document.querySelector('#pocket-phone-host').shadowRoot.activeElement.selectionEnd,
  }));
  await page.setViewportSize({ width: page.viewportSize().width, height: 430 });
  await twoFrames(page);
  const after = await page.evaluate(() => {
    const host = document.querySelector('#pocket-phone-host'), root = host.shadowRoot;
    const main = root.querySelector('.phone-main'), footer = root.querySelector('.phone-footer');
    const form = root.querySelector('.social-comment-form'), textarea = form.querySelector('textarea'), send = form.querySelector('.social-comment-send');
    const m = main.getBoundingClientRect(), f = footer.getBoundingClientRect(), a = textarea.getBoundingClientRect(), s = send.getBoundingClientRect();
    return { scroll: window.scrollY, viewScroll: main.scrollTop, value: textarea.value,
      focused: root.activeElement === textarea, sameNode: textarea.dataset.keyboardRegression === 'focused', start: textarea.selectionStart, end: textarea.selectionEnd,
      form: { top: a.top, bottom: s.bottom }, main: { top: m.top, bottom: m.bottom }, footer: { top: f.top } };
  });
  assert.equal(after.focused, true, `${label}: comment textarea remains focused after keyboard resize`);
  assert.equal(after.sameNode, true, `${label}: focused comment input node is retained`);
  assert.equal(after.value, before.value, `${label}: comment draft survives keyboard resize`);
  assert.equal(after.start, before.start);
  assert.equal(after.end, before.end);
  assert.equal(after.scroll, before.scroll, `${label}: document scroll does not move`);
  assert.ok(after.form.top >= after.main.top && after.form.bottom <= after.footer.top,
    `${label}: comment form is inside phone main above footer after resize (${JSON.stringify(after)})`);
  await page.locator('.phone-shell').screenshot({ path: screenshot });
}

async function assertUnfocusedShrinkStable(page, label) {
  const main = page.locator('.phone-main');
  await main.evaluate(el => { el.scrollTop = Math.min(80, el.scrollHeight - el.clientHeight); });
  const before = await main.evaluate(el => el.scrollTop);
  await page.setViewportSize({ width: page.viewportSize().width, height: 500 });
  await twoFrames(page);
  assert.equal(await main.evaluate(el => el.scrollTop), before, `${label}: unfocused browsing does not jump on resize`);
  await page.setViewportSize({ width: page.viewportSize().width, height: 844 });
  await twoFrames(page);
}

try {
  for (const host of ['native', 'luker']) for (const width of [320, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(8000);
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${host}&clock=story`);
    await page.locator('.phone-shell').waitFor();
    await openApp(page, 'ainstgram');
    await page.getByRole('button', { name: '刷新动态', exact: true }).click();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.social?.feedIds.length === 5);
    assert.equal(await page.locator('.social-feed .social-post').count(), 5);
    assert.equal(await page.locator('.social-feed .social-post').first().locator('.social-photo').count(), 1, `${host}-${width}: fixture includes one photo descriptor`);
    assert.ok(await page.locator('.social-feed .social-post').first().locator('.social-caption').textContent(), `${host}-${width}: fixture includes plain text`);
    await assertUnfocusedShrinkStable(page, `${host}-${width} feed`);
    await page.locator('.social-comment-toggle').first().click();
    await assertFocusedFormVisible(page, `${host}-${width} feed`, `${output}/${host}-${width}-feed.png`);
    await page.setViewportSize({ width, height: 844 });
    await twoFrames(page);
    await page.locator('.social-author').first().click();
    await page.locator('.view-social-profile').waitFor();
    if (!await page.locator('.social-comment-form').isVisible()) await page.locator('.social-profile-posts .social-comment-toggle').first().click();
    await assertFocusedFormVisible(page, `${host}-${width} profile`, `${output}/${host}-${width}-profile.png`);
    await page.setViewportSize({ width, height: 844 });
    await twoFrames(page);
    const textarea = page.locator('.social-comment-form textarea');
    await textarea.click();
    await page.locator('.social-header h1').click();
    assert.equal(await textarea.evaluate(input => input.getRootNode().activeElement === input), false, 'outside click blurs a nonempty editor');
    assert.ok(await textarea.inputValue(), 'nonempty draft stays open');
    await textarea.fill('');
    await page.locator('.social-header h1').click();
    assert.equal(await page.locator('.social-comment-form').count(), 0, 'outside click collapses an empty editor');
    assert.equal(await page.locator('.social-comment-toggle').first().getAttribute('aria-expanded'), 'false');
    await page.locator('.social-comment-toggle').first().click();
    await page.locator('.social-like').first().click();
    assert.equal(await page.locator('.social-like').first().getAttribute('aria-pressed'), 'true', 'outside click still reaches the like button');
    assert.equal(await page.locator('.social-comment-form').count(), 0);
    await page.close();
  }
  console.log('Social comment keyboard resize regression passed.');
} finally { await browser.close(); }
