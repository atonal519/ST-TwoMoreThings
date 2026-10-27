import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBilingual } from '../src/ui/shared.js';
import { renderChat } from '../src/ui/messages.js';
import { renderSocial } from '../src/ui/social.js';
import { renderPost } from '../src/ui/forum.js';

const hasTranslation = html => html.includes('class="message-translation"');

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
