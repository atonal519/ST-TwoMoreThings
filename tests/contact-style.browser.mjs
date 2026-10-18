import { openApp } from './navigation.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
try {
 for (const kind of ['native', 'luker']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(8000);
  await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${kind}`);
  await page.locator('.phone-shell').waitFor();
  await page.evaluate(() => {
    const person = previewHarness.metadata.pocketPhone.contacts[0]; person.edited = true; person.expression = '烦躁时敲桌面';
    previewHarness.reply = { contacts: [{ sourceId: 'lin', name: '林舟', expression: '短句，烦躁时只回问号' }] };
  });
  await openApp(page, '短信');
  await page.getByRole('button', { name: /林舟/ }).click();
  await page.getByRole('button', { name: '聊天资料', exact: true }).click();
  await page.getByRole('button', { name: '刷新线上聊天方式', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.pocket-phone').shadowRoot.querySelector('#profile-expression')?.value === '短句，烦躁时只回问号');
  assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.contacts[0].expression), '烦躁时敲桌面');
  assert.equal(await page.evaluate(() => previewHarness.metadataSaves), 0, '先检查，不自动改存档');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('log').waitFor();
  assert.equal(await page.evaluate(() => previewHarness.metadata.pocketPhone.contacts[0].expression), '短句，烦躁时只回问号');
  assert.equal(await page.evaluate(() => previewHarness.requests.length), 1);
  await page.close();
 }
 console.log('Legacy contact style can be regenerated, reviewed and explicitly saved on native/Luker simulated hosts.');
} finally { await browser.close(); }
