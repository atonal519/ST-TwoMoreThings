import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
try {
  for (const host of ['native', 'luker']) for (const width of [320, 390]) for (const theme of ['day', 'night']) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${host}&group=1&clock=story`);
    await page.getByRole('button', { name: '进入桌面', exact: true }).click();
    if (theme === 'night') {
      await page.evaluate(() => { previewHarness.metadata.pocketPhone.theme = 'night'; previewHarness.app.open(); });
      await page.waitForFunction(() => document.querySelector('.pocket-phone')?.dataset.theme === 'night');
    }
    assert.equal(await page.locator('.desktop-app').count(), 6);
    assert.equal(await page.getByRole('button', { name: '待办', exact: true }).count(), 1);
    await page.getByRole('button', { name: '短信', exact: true }).click();
    await page.locator('[data-contact="lin"]').click();
    await page.evaluate(() => {
      previewHarness.reply = {
        messages: [{ text: '明晚一起吃饭。' }],
        todoSuggestions: [{ title: '明晚一起吃饭', startAt: '大陆历1686年10月5日 18:00', endAt: '', participantIds: ['@user', 'lin'], sourceMessageIndexes: [0] }],
      };
    });
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByText('建议加入待办', { exact: true }).waitFor();
    const candidate = page.locator('[data-todo-candidate]');
    const candidateId = await candidate.getAttribute('data-todo-candidate');
    await candidate.getByRole('button', { name: '修改', exact: true }).click();
    await candidate.locator('input[name="title"]').fill('改到旧书店见面');
    await candidate.locator('input[name="endAt"]').fill('大陆历1686年10月5日 20:00');
    await page.evaluate(() => { previewHarness.failSave = true; });
    await candidate.getByRole('button', { name: '保存并加入', exact: true }).click();
    await page.getByText('建议加入待办', { exact: true }).waitFor();
    assert.equal(await candidate.locator('input[name="title"]').inputValue(), '改到旧书店见面', 'save failure keeps candidate draft');
    assert.ok(candidateId);
    await candidate.getByRole('button', { name: '保存并加入', exact: true }).click();
    await page.getByText('建议加入待办', { exact: true }).waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '主页', exact: true }).click();
    const todoButton = page.getByRole('button', { name: '待办，1 项未完成', exact: true });
    await todoButton.waitFor();
    await todoButton.click();
    await page.getByText('改到旧书店见面', { exact: true }).waitFor();
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await page.locator('.todo-row.is-done .todo-status').getByText('已完成', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '待办，1 项未完成', exact: true }).count(), 0);
    await page.getByRole('button', { name: '取消完成', exact: true }).click();
    await page.locator('.todo-row:not(.is-done) .todo-status').getByText('待完成', { exact: true }).waitFor();
    await page.getByRole('button', { name: '主页', exact: true }).click();
    const restoredTodoButton = page.getByRole('button', { name: '待办，1 项未完成', exact: true });
    await restoredTodoButton.waitFor();
    await restoredTodoButton.click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${host}/${width}/${theme}: 待办页不横向溢出`);
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    await page.locator('.todo-form input[name="title"]').fill('改到旧书店见面（来源删除后仍保留）');
    await page.locator('.todo-form button[type="submit"]').click();
    await page.getByText('改到旧书店见面（来源删除后仍保留）', { exact: true }).waitFor();
    await page.getByRole('button', { name: '主页', exact: true }).click();
    await page.getByRole('button', { name: '短信', exact: true }).click();
    await page.locator('[data-contact="lin"]').click();
    await page.locator('[data-message]').last().click();
    await page.getByRole('button', { name: '删除这条短信', exact: true }).click();
    await page.getByRole('button', { name: '主页', exact: true }).click();
    await page.getByRole('button', { name: '待办，1 项未完成', exact: true }).click();
    await page.getByText('来源短信已删除', { exact: true }).waitFor();
    await page.getByRole('button', { name: '删除', exact: true }).click();
    await page.getByText('还没有已确认的待办。', { exact: true }).waitFor();
    await page.getByRole('button', { name: '主页', exact: true }).click();
    await page.getByRole('button', { name: '短信', exact: true }).click();
    await page.locator('[data-group="preview-friends"]').click();
    await page.evaluate(() => {
      previewHarness.reply = {
        anchor: { memberIds: ['lin', 'zhou', '@user'], speakerIds: ['lin'] },
        messages: [{ speakerId: 'lin', text: '我们明晚一起去书店。' }],
        todoSuggestions: [{ title: '群里明晚去书店', startAt: '大陆历1686年10月6日 18:00', endAt: '', participantIds: ['@user', 'lin'], sourceMessageIndexes: [0] }],
      };
    });
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByText('群里明晚去书店', { exact: true }).waitFor();
    await page.getByRole('button', { name: '加入待办', exact: true }).click();
    await page.getByText('已加入', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Native/Luker todo entry: candidate card edit/confirm, desktop badge, manual complete/cancel/delete passed. Mock hosts only.');
} finally { await browser.close(); }
