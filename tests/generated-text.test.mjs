import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePayload } from '../src/api.js';
import { normalizeContent } from '../src/content.js';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader } from '../src/context.js';
import { createMessageService } from '../src/messages.js';
import { createGroupService } from '../src/groups.js';
import { createSocialService } from '../src/social.js';
import { createLiangshiService } from '../src/liangshi.js';
const helper = await import('../src/generated-text.js').catch(() => ({}));

test('generated sentence endings preserve punctuation, quotes, languages, emoji, numeric values and URLs', () => {
  assert.equal(typeof helper.finishGeneratedText, 'function');
  for (const [source, expected] of [['今晚见','今晚见。'],['I will be there','I will be there.'],['また明日','また明日。'],['내일 봐요','내일 봐요.'],['他说“回来”','他说“回来”。'],['他说“回来。”','他说“回来。”'],['好？','好？'],['好！','好！'],['好……','好……'],['好...','好...'],['好😂','好😂'],['好[合十]','好[合十]'],['好👍🏽','好👍🏽'],['好🇨🇳','好🇨🇳'],['123','123'],['https://example.invalid/a','https://example.invalid/a'],['看这里 https://example.invalid/a','看这里 https://example.invalid/a'],['第一段\n\n第二段','第一段。\n\n第二段。']]) assert.equal(helper.finishGeneratedText(source), expected, source);
});

test('actual SMS, group, social and Liangshi consumers finish only generated prose while all manual sends remain exact', async () => {
  const h = createHarness({ metadata: { pocketPhone: { contacts: [{ id: 'a', name: '甲' }], groups: [{ id: 'g', name: '群', memberIds: ['a'], userIsMember: true }], conversations: {}, userProfile: { name: '本人' }, social: { posts: [], npcs: [], feedIds: [] } } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target }), reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  const modelClient = { complete: async request => { const input = JSON.parse(request.messages[0].content);
    if (input.group) return JSON.stringify({ anchor: { memberIds: input.group.members.map(p => p.id), speakerIds: ['a'] }, messages: [{ speakerId: 'a', text: '群生成', translation: 'group reply' }] });
    if (input.authors) return JSON.stringify({ posts: [{ authorId: 'a', image:{description:'公开画面。'}, text: '动态生成', comments: [{ name: '路人', text: '动态评论' }] }] });
    if ('seed' in input) return JSON.stringify({ text: '帮写生成', image: { description: '不加句号的图片描述' } });
    return JSON.stringify({ messages: [{ text: '短信生成', translation: 'generated reply' }] });
  } };
  const messages = createMessageService({ target, store, contextReader: reader, modelClient }), groups = createGroupService({ target, store, contextReader: reader, modelClient });
  await messages.send('a', '私聊手写原样'); await groups.send('g', '群聊手写原样'); await messages.continueChat('a'); await groups.continueChat('g');
  assert.equal(store.read().conversations.a[0].text, '私聊手写原样'); assert.equal(store.read().conversations.g[0].text, '群聊手写原样');
  assert.equal(store.read().conversations.a[1].text, '短信生成。'); assert.equal(store.read().conversations.a[1].translation, 'generated reply.');
  assert.equal(store.read().conversations.g[1].text, '群生成。'); assert.equal(store.read().conversations.g[1].translation, 'group reply.');
  const social = createSocialService({ store, contextReader: reader, modelClient, random: () => 0 }); await social.refresh();
  assert.equal(store.read().social.posts[0].text, '动态生成。'); assert.equal(store.read().social.posts[0].comments[0].text, '动态评论。');
  const ls = createLiangshiService({ store, contextReader: reader, modelClient }); const draft = await ls.draftUser({ seed: '想法' });
  assert.equal(draft.text, '帮写生成'); assert.equal(draft.imageDescription, '不加句号的图片描述');
  const post = await ls.publishUser({ text: '微博手写原样' }); assert.equal(post.text, '微博手写原样');
});

test('only generated accepted prose gets a terminal mark; user drafts, titles and picture descriptions stay verbatim', () => {
  const plain = parsePayload('{"messages":[{"text":"今晚见","translation":"See you tonight"}]}', 'messages')[0];
  assert.deepEqual(plain, { text: '今晚见。', translation: 'See you tonight.' });
  assert.deepEqual(normalizeContent({ text: '手写原样', translation: 'manual' }), { text: '手写原样', translation: 'manual' });
  const post = parsePayload('{"posts":[{"title":"无标点标题","author":"网名","content":"完整正文","comments":[{"author":"匿名","text":"正文回帖"}]}]}','forum')[0];
  assert.equal(post.title, '无标点标题'); assert.equal(post.author, '网名'); assert.equal(post.content, '完整正文。'); assert.equal(post.comments[0].text, '正文回帖。');
  assert.deepEqual(parsePayload('{"messages":[{"type":"image","image":{"description":"原配图描述"}}]}','messages')[0].image, { description: '原配图描述' });
});

test('mailto and FTP URLs are not turned into a different address by the sentence finisher', () => {
  for (const url of ['mailto:person@example.invalid', 'ftp://example.invalid/readme']) assert.equal(helper.finishGeneratedText(url), url);
});
