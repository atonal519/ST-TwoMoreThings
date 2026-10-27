import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorySmsInstaller, storySmsRegex, STORY_SMS_PROMPT } from '../src/story-sms.js';
import { createHostAdapter } from '../src/host.js';

function fixture() {
  const book = { entries: { 5: { uid: 5, comment: '用户内容', content: '保留', custom: { keep: true } } }, custom: { keep: true } };
  const other = { id: 'other', scriptName: '其他正则' }, scripts = [other];
  let saves = 0, rulesSaved = 0;
  const target = { character: { avatar: 'one.png', world: '当前主书' } };
  const host = { captureChat: () => target, readSettings: () => ({ disabledExtensions: [] }), async readStorySmsBindings() {
    return { load: async name => name === '当前主书' ? structuredClone(book) : null,
      create(_name, data) { const entry = { uid: Math.max(...Object.keys(data.entries).map(Number)) + 1 }; data.entries[entry.uid] = entry; return entry; },
      async save(name, next, immediately) { assert.equal(name, '当前主书'); assert.equal(immediately, true); saves++; Object.assign(book, structuredClone(next)); },
      getRules: () => scripts, async saveRules(next) { rulesSaved++; scripts.splice(0, scripts.length, ...next); }, htmlEncoded: () => false };
  } };
  return { host, book, target, scripts, other, counts: () => [saves, rulesSaved] };
}

test('installation preserves the bound book and other rules, and restricts its owned constant to installed card avatars', async () => {
  const f = fixture(), installer = createStorySmsInstaller({ host: f.host });
  assert.deepEqual(await installer.install(), { bookName: '当前主书' });
  assert.deepEqual(f.book.entries[5], { uid: 5, comment: '用户内容', content: '保留', custom: { keep: true } });
  const owned = Object.values(f.book.entries).find(entry => entry.content === STORY_SMS_PROMPT);
  assert.deepEqual([owned.constant, owned.disable, owned.vectorized, owned.position, owned.depth, owned.role, owned.probability, owned.useProbability, owned.ignoreBudget], [true, false, false, 4, 1, 0, 100, false, true]);
  assert.deepEqual(owned.characterFilter, { isExclude: false, names: ['one'], tags: [] });
  assert.equal(f.scripts[0], f.other);
  await installer.install();
  f.target.character.avatar = 'same-display-name.png'; await installer.install();
  assert.equal(Object.keys(f.book.entries).length, 2);
  assert.equal(f.scripts.length, 2);
  assert.deepEqual(owned.characterFilter.names, ['one']);
  assert.deepEqual(Object.values(f.book.entries).find(entry => entry.content === STORY_SMS_PROMPT).characterFilter.names, ['one', 'same-display-name']);
  assert.deepEqual(f.book.custom, { keep: true });
});

test('missing main binding and disabled display return actionable failures without installing anything', async () => {
  for (const failure of ['no-card', 'no-book', 'regex-off', 'html-off', 'save-failed']) {
    const f = fixture();
    if (failure === 'no-card') f.target.character = null;
    if (failure === 'no-book') f.target.character.world = '';
    if (failure === 'regex-off') f.host.readSettings = () => ({ disabledExtensions: ['regex'] });
    const read = f.host.readStorySmsBindings;
    f.host.readStorySmsBindings = async () => { const b = await read(); if (failure === 'html-off') b.htmlEncoded = () => true; if (failure === 'save-failed') b.save = async () => { throw new Error('保存失败'); }; return b; };
    await assert.rejects(createStorySmsInstaller({ host: f.host }).install(), /角色卡|主世界书|正则|HTML|保存失败/);
    assert.deepEqual(f.counts(), [0, 0]);
  }
});

test('the display rule keeps raw protocol out of its CSS and uses display-only AI output fields', () => {
  const rule = storySmsRegex();
  assert.deepEqual([rule.placement, rule.markdownOnly, rule.promptOnly, rule.disabled, rule.substituteRegex, rule.minDepth, rule.maxDepth], [[2], true, false, false, 0, null, null]);
  const pattern = new RegExp(rule.findRegex.slice(1, rule.findRegex.lastIndexOf('/')), rule.findRegex.slice(rule.findRegex.lastIndexOf('/') + 1));
  assert.equal('[tmt|朋友甲|朋友甲]完整原话[/tmt]'.match(pattern).length, 1);
  assert.equal('普通正文'.match(pattern), null);
  assert.match(rule.replaceString, /<style>/);
  assert.match(rule.replaceString, /tmt-main-sms/);
  assert.ok(!STORY_SMS_PROMPT.includes('<style>'));
});

test('phone worldbook materials omit only the owned main-story format while keeping the actual primary book binding', async () => {
  const entries = { 0: { constant: true, content: '世界设定' }, 1: { constant: true, content: STORY_SMS_PROMPT, extensions: { twoMoreThings: { storySms: true } } } };
  const character = { name: '人物甲', avatar: 'one.png', data: { extensions: { world: '原主书' } } };
  const host = createHostAdapter({ contextProvider: () => ({ chatId: 'fixture', chat: [], chatMetadata: {}, characterId: 0, characters: [character] }),
    worldInfoBindings: { getNames: () => [], async load(name) { assert.equal(name, '原主书'); return { entries }; } } });
  const target = host.captureChat();
  assert.equal(target.character.world, '原主书');
  assert.equal(await target.readWorldInfo(), '\n世界设定');
  assert.equal(entries[1].content, STORY_SMS_PROMPT);
  assert.equal(character.data.extensions.world, '原主书');
});

test('installation status reads actual card membership and current enabled rule without writing', async () => {
  const f = fixture(), installer = createStorySmsInstaller({ host: f.host });
  assert.equal((await installer.readStatus()).state, 'missing');
  await installer.install();
  const counts = f.counts();
  assert.equal((await installer.readStatus()).state, 'installed');
  f.scripts.at(-1).pluginOnly = true;
  assert.equal((await installer.readStatus()).state, 'outdated');
  f.scripts.at(-1).pluginOnly = false;
  f.scripts.at(-1).replaceString = 'old template';
  assert.equal((await installer.readStatus()).state, 'outdated');
  f.scripts.at(-1).replaceString = storySmsRegex().replaceString;
  f.target.character.avatar = 'other.png';
  assert.equal((await installer.readStatus()).state, 'outdated');
  assert.deepEqual(f.counts(), counts);
});

test('an old installed entry uses the normal update action to remove retired output instructions', async () => {
  const f = fixture(), installer = createStorySmsInstaller({ host: f.host });
  await installer.install();
  const owned = Object.values(f.book.entries).find(entry => entry.extensions?.twoMoreThings?.storySms);
  owned.content = '旧版短信格式，带待办输出指令';
  const before = f.counts();
  assert.equal((await installer.readStatus()).state, 'outdated');
  assert.deepEqual(f.counts(), before);
  await installer.install();
  assert.equal(Object.values(f.book.entries).find(entry => entry.extensions?.twoMoreThings?.storySms).content, STORY_SMS_PROMPT, 'the bound owned entry is updated through the existing installer');
  assert.equal((await installer.readStatus()).state, 'installed');
  assert.deepEqual(f.book.entries[5], { uid: 5, comment: '用户内容', content: '保留', custom: { keep: true } });
});
