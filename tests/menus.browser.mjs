import { openApp } from './navigation.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  await page.goto('http://127.0.0.1:8917/tests/preview.html');
  await openApp(page, '短信');
  await page.getByRole('button', { name: /林舟/ }).click();
  await page.getByRole('button', { name: '聊天选项', exact: true }).click();
  await page.getByRole('textbox', { name: '短信内容' }).click();
  assert.equal(await page.locator('.chat-menu').count(), 0, '点击输入框应关闭更多菜单');
  await page.keyboard.type('菜单关闭后直接输入');
  assert.equal(await page.getByRole('textbox', { name: '短信内容' }).inputValue(), '菜单关闭后直接输入');
  await page.getByRole('button', { name: '聊天选项', exact: true }).click();
  await page.mouse.click(15, 15);
  assert.equal(await page.locator('.chat-menu').count(), 0, '点击手机外的空白也应关闭菜单');
  await page.locator('.bubble').first().click();
  await page.getByRole('textbox', { name: '短信内容' }).click();
  assert.equal(await page.getByRole('button', { name: '删除这条短信', exact: true }).count(), 0);
  assert.equal(await page.locator('.message-actions').count(), 0, '点击输入框收起整个消息菜单');
  assert.equal(await page.evaluate(() => previewHarness.requests.length + previewHarness.metadataSaves), 0);
  console.log('Outside-click dismissal preserves typing and does not request or save.');
} finally { await browser.close(); }
