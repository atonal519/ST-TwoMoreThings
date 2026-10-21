import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.POCKET_PLAYWRIGHT_MODULE || '/tmp/st-tools-browser/package.json')('playwright');
const browser = await chromium.launch({
  executablePath: process.env.POCKET_BROWSER_EXECUTABLE || '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--no-sandbox'],
  env: { ...process.env, LD_LIBRARY_PATH: process.env.POCKET_BROWSER_LIBS || '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' },
});
try {
  for (const kind of ['native', 'luker']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${kind}`);
    await page.locator('.home-art').waitFor();
    const result = await page.evaluate(async () => {
      const h = previewHarness;
      h.mainMessages.splice(0, h.mainMessages.length,
        { is_user: false, mes: '<!-- SDC-end | date=2027-03-19 | time=15:30 -->' },
        { is_user: true, mes: '继续剧情。' },
        { is_user: false, mes: '<!-- SDC-end | date=2027-03-19 | time=17:40 -->' });
      h.metadata.pocketPhone.injectEnabled = true;
      h.metadata.pocketPhone.conversations = { lin: [
        { id: 'original', role: 'user', text: '六点在书店见。', batch: { key: '[0,"2027-03-19","15:30"]' } },
        { id: 'later', role: 'user', text: '当前楼之后的短信。', batch: { key: '[2,"2027-03-19","17:40"]' } },
      ] };
      const before = JSON.stringify(h.metadata), saves = h.metadataSaves, calls = h.requests.length;
      const prompts = [];
      h.context.setExtensionPrompt = (...args) => { h.prompt = args[1]; prompts.push(args); };
      const emit = (type, text) => { h.summary = { summary: text }; return h.context.eventSource.emit('before-main', type, {}, false); };
      await emit('normal', '当前楼之后的短信。');
      const normal = h.prompt;
      // 真正宿主在此事件之后才移除重生成的旧楼。
      await emit('regenerate', '六点在书店见。');
      const regenerated = h.prompt;
      h.mainMessages.at(-1).mes = '';
      await emit('swipe', '六点在书店见。');
      const swiped = h.prompt;
      h.mainMessages.pop();
      await emit('regenerate', '六点在书店见。');
      return { normal, regenerated, swiped, removed: h.prompt,
        slots: prompts.filter(args => args[1]).map(args => args.slice(2)),
        unchanged: before === JSON.stringify(h.metadata), saves: h.metadataSaves - saves, calls: h.requests.length - calls };
    });
    assert.ok(result.normal.includes('当前楼之后的短信。'));
    assert.ok(!result.normal.includes('六点在书店见。'));
    for (const value of [result.regenerated, result.swiped, result.removed]) {
      assert.ok(value.includes('六点在书店见。'));
      assert.ok(!value.includes('当前楼之后的短信。'));
    }
    assert.ok(result.slots.every(args => args[0] === 1 && args[1] === 0), 'references still use in-chat depth zero');
    assert.equal(result.unchanged, true);
    assert.equal(result.saves, 0);
    assert.equal(result.calls, 0, 'short references use the existing main-generation request');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Native/Luker generation entry: normal, regenerate before/after removal and blank swipe use the correct SMS batch, depth 0, and no extra model calls or SMS writes. Simulated hosts only.');
} finally { await browser.close(); }
