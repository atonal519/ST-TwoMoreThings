import test from 'node:test';
import assert from 'node:assert/strict';
import { readForumTags } from '../src/forum-tags.js';
import { parsePayload } from '../src/api.js';
import { renderForum, renderPost } from '../src/ui/forum.js';

const stateFor = posts => ({ forum: { posts: posts.map((post, i) => ({ id: `p${i}`, title: `帖子${i}`, content: '正文。', author: '路人', comments: [], ...post })) } });
const filters = markup => [...markup.matchAll(/data-forum-tag="([^"]*)"/g)].map(match => match[1]);
const render = (state, ui = {}) => renderForum(state, { ui, busy: new Set() });

test('explicit tags normalize wrappers, deduplicate and cap two; missing-only legacy fallback never mutates archives', () => {
  const old = { category: ' 生活 ' }, before = structuredClone(old);
  assert.deepEqual(readForumTags(old), ['生活']); assert.deepEqual(old, before);
  assert.deepEqual(readForumTags({ tags: [], category: '旧' }), []);
  assert.deepEqual(readForumTags({ tags: [' #城市# ', '城市', '【日常】', '第三个'] }), ['城市', '日常']);
  assert.deepEqual(readForumTags({ tags: ' #城市# ' }), ['城市']); assert.deepEqual(readForumTags({}), []);
});

test('twenty one-off keywords produce no top filters or category rewriting', () => {
  const state = stateFor(Array.from({ length: 10 }, (_, i) => ({ tags: [`关键词${i}a`, `关键词${i}b`] }))), before = JSON.stringify(state), ui = { forumTag: '关键词0a' };
  const markup = render(state, ui);
  assert.deepEqual(filters(markup), []); assert.equal(ui.forumTag, '');
  assert.equal((markup.match(/class="forum-card"/g) || []).length, 10); assert.equal(JSON.stringify(state), before);
});

test('a repeated label in one post and display-only default chat never qualify', () => {
  assert.deepEqual(filters(render(stateFor([{ tags: ['生活', '生活'] }, {}, { tags: [] }]))), []);
});

test('shared categories rank by distinct post frequency then first appearance', () => {
  const state = stateFor([{ tags: ['生活', '文化'] }, { tags: ['文化', '生活'] }, { tags: ['文化'] }]);
  assert.deepEqual(filters(render(state)), ['', '文化', '生活']);
});

test('stable first six cap also invalidates a selected seventh category without reintroducing it', () => {
  const state = stateFor(Array.from({ length: 14 }, (_, i) => ({ tags: [`分类${Math.floor(i / 2)}`] }))), ui = { forumTag: '分类6' };
  const markup = render(state, ui);
  assert.deepEqual(filters(markup), ['', '分类0', '分类1', '分类2', '分类3', '分类4', '分类5']);
  assert.equal(ui.forumTag, ''); assert.equal((markup.match(/class="forum-card"/g) || []).length, 14);
});

test('missing-only legacy categories may be shared but explicit empty tags never inherit', () => {
  const state = stateFor([{ category: '生活' }, { category: '生活' }, { tags: [], category: '文化' }, { tags: ['文化'] }]);
  assert.deepEqual(filters(render(state)), ['', '生活']);
});

test('model tags persist, shared filtering is UI-only, and vanished filters return all posts', () => {
  const parsed = parsePayload(JSON.stringify({ posts: [
    { title: '花开了', author: '路人', content: '经过。', tags: ['#生活#', '生活', '城市', '第三个'] },
    { title: '图书馆', author: '另一位', content: '问题。', tags: ['生活', '学术'] },
    { title: '独立帖子', author: '第三位', content: '另一件事。', tags: ['科技'] },
  ] }), 'forum');
  assert.deepEqual(parsed[0].tags, ['生活', '城市']);
  const state = stateFor(parsed), before = JSON.stringify(state), ui = { forumTag: '生活', forumDrafts: new Map(), forumVotes: new Map(), postId: 'p0' };
  const markup = render(state, ui);
  assert.ok(markup.includes('图书馆')); assert.ok(markup.includes('花开了')); assert.equal(markup.includes('独立帖子'), false);
  assert.deepEqual(filters(markup), ['', '生活']); assert.ok(renderPost(state, { ui, busy: new Set() }).includes('城市')); assert.equal(JSON.stringify(state), before);
  ui.forumTag = '已移除'; render(state, ui); assert.equal(ui.forumTag, '');
});
