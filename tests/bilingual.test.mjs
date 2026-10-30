import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBilingual } from '../src/ui/shared.js';
import { renderChat } from '../src/ui/messages.js';
import { renderSocial } from '../src/ui/social.js';
import { renderForum, renderPost } from '../src/ui/forum.js';
import { renderLiangshi } from '../src/ui/liangshi.js';

const hasTranslation = html => html.includes('class="message-translation"');

test('all three comment renderers show English/Korean once, deduplicate Chinese and omit emoji translations', () => {
  const comments = [{ id: 'en', name: '甲', author: '甲', authorId: 'lin', text: 'Good morning.', translation: '早上好。' }, { id: 'ko', name: '乙', author: '乙', authorId: 'lin', text: '좋은 아침.', translation: '早安。' }, { id: 'zh', name: '丙', author: '丙', authorId: 'lin', text: '晚上见。', translation: '晚上见。' }, { id: 'emoji', name: '丁', author: '丁', authorId: 'lin', text: '🙂' }];
  const state = { contacts: [{ id: 'lin', name: '林舟' }], social: { posts: [{ id: 's', authorId: 'lin', text: '窗边。', comments }], feedIds: ['s'], npcs: [] }, forum: { posts: [{ id: 'p', title: '早晨', author: '匿名', content: '聊聊今天。', comments }] }, liangshi: { accounts: [{ id: 'lin', name: '林舟' }], posts: [{ id: 'l', authorId: 'lin', text: '清晨。', comments, reposts: [] }] } };
  const before = structuredClone(state), busy = new Set();
  const htmls = [renderSocial(state, { ui: { socialCommentOpen: new Set(['s']), socialDrafts: new Map() }, busy }), renderPost(state, { ui: { postId: 'p' } }), renderLiangshi(state, { ui: { liangshiPage: { kind: 'post', id: 'l' }, liangshiExpanded: new Set(), liangshiReplyDrafts: new Map() }, busy })];
  for (const html of htmls) {
    assert.equal((html.match(/class="message-translation"/g) || []).length, 2);
    for (const translated of ['早上好。', '早安。', '晚上见。']) assert.equal(html.split(translated).length - 1, 1);
  }
  assert.deepEqual(state, before);
});

test('existing Chinese originals with known emoji aliases show once when their translations repeat the text', () => {
  for (const [original, translated] of [
    ['今天的排练终于结束了。[翻白眼]', '今天的排练终于结束了。'],
    ['材料收到了，辛苦。[合十]', '材料收到了，辛苦。'],
    ['晚上见！[微笑]', ' 晚上见。 '],
  ]) assert.equal(hasTranslation(renderBilingual(original, translated)), false, original);
});

test('foreign wording, unknown bracketed text, numbers, operators and combining accents keep their translations', () => {
  for (const [original, translated] of [
    ['我到咗啦。', '我到了。'], ['今日は休み。', '今天休息。'], ['집에 왔어.', '我到家了。'], ['Good morning.', '早上好。'],
    ['今晚[备注]见。', '今晚见。'], ['预算3.5万元。', '预算35万元。'], ['温度-5度。', '温度5度。'],
    ['进度1/2。', '进度12。'], ['增长5%。', '增长5。'], ['1+2=3', '12=3'], ['cafe\u0301', 'cafe'],
  ]) assert.equal(hasTranslation(renderBilingual(original, translated)), true, original);
});

test('social captions and forum details share display deduplication without editing saved translations', () => {
  const state = { contacts: [{ id: 'lin', name: '林舟' }], social: { posts: [{ id: 's', authorId: 'lin', text: '晚安。[合十]', translation: '晚安。', comments: [{ name: '路人', text: '好梦。[微笑]', translation: '好梦。' }] }], feedIds: ['s'], npcs: [] }, forum: { posts: [{ id: 'p', title: '晚风。', titleTranslation: '晚风！', content: '今天不错。[翻白眼]', contentTranslation: '今天不错。', comments: [{ author: '路人', text: '确实。[微笑]', translation: '确实。' }] }] } };
  const before = structuredClone(state), ui = { socialCommentOpen: new Set(), socialDrafts: new Map(), postId: 'p' };
  assert.equal(hasTranslation(renderSocial(state, { ui, busy: new Set() })), false);
  assert.equal(hasTranslation(renderPost(state, { ui })), false);
  assert.deepEqual(state, before);
});

test('SMS and group quote renderers hide repeated translations while retaining a different Cantonese translation', () => {
  const batch = { key: 'batch', label: '当前' };
  const state = { contacts: [{ id: 'lin', name: '林舟' }], groups: [{ id: 'g', name: '朋友', memberIds: ['lin'], userIsMember: true }], conversations: {
    lin: [{ id: 'm', role: 'assistant', text: '收到。[合十]', translation: '收到。', batch }],
    g: [{ id: 'a', role: 'assistant', speakerId: 'lin', text: '收到。[合十]', translation: '收到。', batch }, { id: 'b', role: 'assistant', speakerId: 'lin', text: '我到咗啦。', translation: '我到了。', replyToId: 'a', batch }],
  } };
  const ui = { view: 'chat', contactId: 'lin', groupId: 'g', batch, drafts: new Map(), visibleMessages: 60, visibleHistory: 60 };
  assert.equal(hasTranslation(renderChat(state, { ui, busy: new Set() })), false);
  const group = renderChat(state, { ui: { ...ui, view: 'group-chat' }, busy: new Set() });
  assert.equal((group.match(/class="message-translation"/g) || []).length, 1);
  assert.ok(group.includes('我到了。'));
});

test('displayed bilingual text forms one group and marks only kana originals as Japanese without changing single-language text', () => {
  const html = renderBilingual('今日は休み。', '今天休息。');
  assert.match(html, /^<span class="bilingual-copy"><span class="message-original" lang="ja">今日は休み。<\/span><span class="message-translation" lang="zh-CN">今天休息。<\/span><\/span>$/);
  for (const [text, translated] of [['Good morning.', '早上好。'], ['좋은 아침.', '早安。'], ['明日休業', '明天休息']]) {
    const result = renderBilingual(text, translated); assert.ok(result.includes('class="bilingual-copy"')); assert.equal(result.includes('lang="ja"'), false);
  }
  assert.equal(renderBilingual('中文单语。'), '<span class="message-original">中文单语。</span>');
  assert.equal(renderBilingual('晚上见。', '晚上见！'), '<span class="message-original">晚上见。</span>');
});

test('social names remain outside each bilingual group and forum headings retain their title container', () => {
  const state = { contacts: [{ id: 'lin', name: '林舟' }], social: { posts: [{ id: 's', authorId: 'lin', text: '单语配文。', comments: [{ name: 'minseo.and.everyday', text: '오늘도 좋아.', translation: '今天也不错。' }] }], feedIds: ['s'], npcs: [] },
    forum: { posts: [{ id: 'p', title: '今日は休み。', titleTranslation: '今天休息。', author: '匿名', content: 'また明日。', contentTranslation: '明天见。', comments: [] }] } };
  const before = structuredClone(state), busy = new Set(), ui = { socialCommentOpen: new Set(), socialDrafts: new Map(), postId: 'p' };
  const social = renderSocial(state, { ui, busy });
  assert.match(social, /<strong class="social-comment-name">minseo\.and\.everyday<\/strong><span class="bilingual-copy">/);
  assert.match(renderForum(state, { ui: {}, busy }), /<strong class="post-title"><span class="bilingual-copy">/);
  assert.match(renderPost(state, { ui }), /<h1><span class="bilingual-copy">/);
  assert.deepEqual(state, before);
});

test('group mentions and quoted originals use the shared grouping and Japanese marker without changing stored messages', () => {
  const batch = { key: 'batch', label: '当前' }, state = { userProfile: { name: '我' }, contacts: [{ id: 'lin', name: '林舟' }], groups: [{ id: 'g', name: '朋友', memberIds: ['lin'], userIsMember: true }], conversations: { g: [
    { id: 'first', role: 'assistant', speakerId: 'lin', text: '@我 明日は休み。', translation: '@我 明天休息。', batch },
    { id: 'reply', role: 'user', text: '@林舟 了解です。', translation: '@林舟 明白了。', replyToId: 'first', batch },
  ] } };
  const before = structuredClone(state), html = renderChat(state, { ui: { view: 'group-chat', groupId: 'g', batch, drafts: new Map(), visibleMessages: 60, visibleHistory: 60 }, busy: new Set() });
  assert.equal((html.match(/class="bilingual-copy"/g) || []).length, 3);
  assert.equal((html.match(/class="message-original" lang="ja"/g) || []).length, 3);
  assert.match(html, /<mark class="message-mention">@林舟<\/mark>/);
  assert.match(html, /class="message-reply[^]*?<span class="bilingual-copy"><span class="message-original" lang="ja">/);
  assert.deepEqual(state, before);
});
