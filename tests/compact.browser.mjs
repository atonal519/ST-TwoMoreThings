import { openApp } from './navigation.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
const failures = [];
const check = (label, value) => { if (!value) failures.push(label); };
try {
 for (const width of [320, 390]) for (const theme of ['day', 'night']) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto('http://127.0.0.1:8917/tests/preview.html?clock=story');
  await page.locator('.phone-shell').waitFor();
  await page.evaluate(theme => {
    const s = previewHarness.metadata.pocketPhone, batch = s.conversations.lin[0].batch;
    s.theme = theme;
    s.contacts.find(person => person.id === 'lin').nickname = '这是一个比短短信长得多的群聊网名测试';
    s.contacts.find(person => person.id === 'zhou').nickname = '比他的回复更长的网名';
    s.groups = [{ id: 'group:test', name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: true }];
    s.conversations['group:test'] = [
      { id: 'c1', role: 'assistant', speakerId: 'lin', text: 'I saved the books. Come and get them after work.', translation: '书替你们留好了，下班过来拿吧。', timeLabel: '23:58', batch },
      { id: 'c2', role: 'assistant', speakerId: 'lin', text: '在门口等。', timeLabel: '23:58', batch },
      { id: 'c3', role: 'assistant', speakerId: 'zhou', text: '好', timeLabel: '23:58', batch },
      { id: 'u1', role: 'user', speakerId: '@user', text: '好，我还有一点事。', timeLabel: '23:58', batch },
      { id: 'u2', role: 'user', speakerId: '@user', text: '我也快到了。', timeLabel: '23:58', batch },
    ];
  }, theme);
  await openApp(page, '短信');
  check(`${width}: 整理操作应收进加号`, await page.locator('.heading-actions [data-action="identify"]').count() === 0);
  await page.locator('[data-group]').click();
  const rows = page.getByRole('log').locator('.message-row');
  check(`${width}/${theme}: 群聊每段发言仅首条显示小号姓名`, await page.locator('.message-sender').count() === 2 && await page.locator('.message-sender').first().evaluate(node => getComputedStyle(node).fontSize === '10px'));
  check(`${width}: char首条显示头像、末条隐藏头像`, await rows.nth(0).locator('.avatar').isVisible() && !await rows.nth(1).locator('.avatar').isVisible());
  check(`${width}: user首条隐藏头像、末条显示头像`, !await rows.nth(3).locator('.avatar').isVisible() && await rows.nth(4).locator('.avatar').isVisible());
  check(`${width}: char头像对齐首条姓名上沿`, await rows.nth(0).evaluate(row => Math.abs(row.querySelector('.avatar').getBoundingClientRect().top - row.querySelector('.message-sender').getBoundingClientRect().top) < 1));
  check(`${width}: user头像对齐末气泡下沿`, await rows.nth(4).evaluate(row => Math.abs(row.querySelector('.avatar').getBoundingClientRect().bottom - row.querySelector('.bubble').getBoundingClientRect().bottom) < 1));
  for (const [index, mine] of [[0, false], [2, false], [4, true]]) {
    const row = rows.nth(index), before = await row.locator('.bubble').boundingBox();
    await row.locator('.bubble').click();
    const after = await row.locator('.bubble').boundingBox();
    check(`${width}: 展开操作不移动或压窄气泡${index}`, Math.abs(before.x - after.x) < 1 && Math.abs(before.width - after.width) < 1);
    check(`${width}: 垃圾桶在内侧并与气泡垂直居中${index}`, await row.evaluate((row, mine) => {
      const b = row.querySelector('.bubble').getBoundingClientRect(), t = row.querySelector('.message-delete').getBoundingClientRect();
      return (mine ? t.right <= b.left : t.left >= b.right) && Math.abs(t.y + t.height / 2 - b.y - b.height / 2) < 1;
    }, mine));
  }
  const draft = page.getByRole('textbox', { name: '短信内容' });
  check(`${width}: 单行输入扁平且无placeholder`, await draft.evaluate(node => node.getBoundingClientRect().height <= 36 && !node.getAttribute('placeholder')));
  check(`${width}: 输入区不超过48px`, await page.locator('.composer').evaluate(node => node.getBoundingClientRect().height <= 48));
  await draft.fill('第一行\n第二行\n第三行');
  check(`${width}: 输入仍可正常多行增高`, await draft.evaluate(node => node.getBoundingClientRect().height >= 60));
  await page.getByRole('button', { name: '聊天资料', exact: true }).click();
  const profileCheck = async (form) => {
   check(`${width}/${theme}: 头像编辑居中`, await form.evaluate(form => {
    const f = form.getBoundingClientRect(), a = form.querySelector('.profile-avatar .avatar').getBoundingClientRect();
    return Math.abs(a.x + a.width / 2 - f.x - f.width / 2) < 1;
   }));
   check(`${width}/${theme}: 保存和删除同尺寸并使用主题/红色实底`, await form.locator('.form-actions').evaluate(actions => {
    const save = actions.querySelector('.save-button'), remove = actions.querySelector('.danger-button'), style = getComputedStyle(actions);
    const color = value => { const swatch = document.createElement('span'); swatch.style.color = value; actions.append(swatch); const result = getComputedStyle(swatch).color; swatch.remove(); return result; };
    return save.textContent === '保存' && remove.textContent === '删除' && save.getBoundingClientRect().height === remove.getBoundingClientRect().height && getComputedStyle(save).backgroundColor === color(style.getPropertyValue('--pp-active')) && getComputedStyle(remove).backgroundColor === color(style.getPropertyValue('--pp-danger-fill'));
   }));
  };
  await profileCheck(page.locator('.group-form'));
  check(`${width}: 保存按钮不高过字段`, await page.locator('.group-form').evaluate(form => form.querySelector('.save-button').getBoundingClientRect().height <= form.querySelector('#group-name').getBoundingClientRect().height));
  check(`${width}: 成员行足够紧凑`, await page.locator('.group-member').first().evaluate(node => node.getBoundingClientRect().height <= 38));
  await openApp(page, '短信');
  await page.locator('[data-contact="lin"]').click();
  check(`${width}/${theme}: 私聊不重复显示姓名`, await page.locator('.message-sender').count() === 0);
  await page.getByRole('button', { name: '聊天资料', exact: true }).click();
  await profileCheck(page.locator('.profile-form'));
  check(`${width}: 不横向溢出`, !await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  await page.close();
 }
 assert.deepEqual(failures, []);
 console.log('Compact mobile forms/composer, first-char/last-user avatars and mirrored centered trash controls passed.');
} finally { await browser.close(); }
