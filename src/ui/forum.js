import { readForumTags } from '../forum-tags.js';
import { action, empty, escape, icon, pageHeading, renderBilingual, renderContentImage } from './shared.js';
import { forumComments } from '../forum.js';
import { imageSource } from '../image-files.js';

// UI-only fictional totals: the post ID fixes the baseline across renders.
export function forumVoteCounts(id) {
  let seed = 2166136261;
  for (const character of String(id)) seed = Math.imul(seed ^ character.codePointAt(0), 16777619) >>> 0;
  const range = [30, 300, 3000, 30000][seed % 4], like = 3 + ((seed >>> 2) % range);
  const dislike = seed % 5 === 0 ? like + 1 + ((seed >>> 6) % range) : (seed >>> 8) % Math.max(2, Math.floor(like / 3));
  return { like, dislike };
}

export function renderForum(state, { ui = {}, busy }) {
  const posts = state.forum?.posts || [];
  const tags = [...new Set(posts.flatMap(readForumTags))];
  if (!tags.includes(ui.forumTag)) ui.forumTag = '';
  const selected = ui.forumTag ? posts.filter(post => readForumTags(post).includes(ui.forumTag)) : posts;
  const cards = selected.map((post, index) => `<button type="button" class="forum-card" data-post="${escape(post.id)}">
    <span class="post-topline">
      ${(readForumTags(post).length ? readForumTags(post) : ['闲聊']).map(tag => `<span class="post-category category-${index % 3}">${escape(tag)}</span>`).join('')}
      <span class="post-author">${escape(post.author)}</span>
    </span>
    <strong class="post-title">${renderBilingual(post.title, post.titleTranslation)}</strong>
    <span class="post-excerpt">${renderBilingual(post.content, post.contentTranslation)}</span>
    <span class="post-footer">
      <span>${icon('messages')}${post.comments?.length || 0} 条回帖${post.image ? `${icon('image')}1 张图片` : ''}</span>
      <span>展开看看 ${icon('next')}</span>
    </span>
  </button>`).join('');
  return `${pageHeading('论坛', action('refresh', busy.has('forum') ? '刷新中' : '刷新', 'refresh', 'quiet-button', busy.has('forum')))}
    ${tags.length ? `<nav class="forum-tags" aria-label="论坛标签">${['', ...tags].map(tag => `<button type="button" class="quiet-button" data-action="forum-tag" data-forum-tag="${escape(tag)}" aria-pressed="${ui.forumTag === tag}">${escape(tag || '全部')}</button>`).join('')}</nav>` : ''}
    <div class="forum-posts">${cards}</div>
    ${!posts.length ? empty('还没有帖子', '', 'forum') : ''}`;
}

export function renderPost(state, { ui, busy = new Set() }) {
  const post = state.forum?.posts.find(post => post.id === ui.postId);
  if (!post) return empty('这批帖子已经更新', '返回论坛，看看新的帖子。', 'forum');
  const rows = forumComments(post), byId = new Map(rows.map(row => [row.id, row])), draft = ui.forumDrafts?.get(post.id) || { text: '', replyToId: '' };
  const selected = byId.get(draft.replyToId), vote = ui.forumVotes?.get(post.id), totals = forumVoteCounts(post.id), drawing = busy.has(`forum-image:${post.id}`), loading = busy.has(`forum-more:${post.id}`);
  const readable = row => row.text || row.content || (row.image?.description ? `[图片] ${row.image.description}` : '');
  const excerpt = text => { const chars = Array.from(String(text || '').replace(/\s+/g, ' ').trim()); return chars.slice(0, 100).join('') + (chars.length > 100 ? '…' : ''); };
  const targetLabel = comment => `回复 #${rows.findIndex(row => row.id === comment.id) + 1} · ${comment.author}`;
  const quote = id => {
    const parent = byId.get(id), isPost = id === post.id;
    if (!parent && !isPost) return '<small class="forum-reply-target">回复的原楼层已不在此处</small>';
    return `<button type="button" class="forum-comment-quote" data-action="forum-jump" data-forum-comment="${escape(id)}" aria-label="查看${isPost ? '主帖' : ` #${rows.findIndex(row => row.id === id) + 1} 楼`}原文"><span class="forum-reply-target">${escape(isPost ? `回复主帖《${post.title}》` : targetLabel(parent))}</span><span class="forum-quote-text">${escape(excerpt(isPost ? readable(post) : readable(parent)))}</span></button>`;
  };
  const comments = rows.map((comment, index) => `<article class="comment-row" data-forum-comment="${escape(comment.id)}" tabindex="-1">
    <span class="comment-avatar tone-${index % 3}" aria-hidden="true">${escape(Array.from(comment.author || '路人')[0])}</span>
    <div><h3>${escape(comment.author)}${comment.userAuthored ? '<small class="forum-self">我</small>' : ''}</h3>
      ${comment.replyToId ? quote(comment.replyToId) : ''}
      ${comment.text ? `<p>${renderBilingual(comment.text, comment.translation)}</p>` : ''}${renderContentImage(comment.image, { action: 'forum-image', data: { 'forum-comment': comment.id }, busy: busy.has(`forum-image:${post.id}:${comment.id}`), label: '论坛回帖图片' })}<button type="button" class="forum-reply-button" data-action="forum-reply" data-forum-comment="${escape(comment.id)}">回复</button>
    </div></article>`).join('');
  const photo = post.image ? `<button type="button" class="forum-photo" data-action="forum-image" aria-label="${post.image.path ? '查看论坛图片' : '生成论坛图片'}" ${drawing ? 'disabled' : ''}>
    ${post.image.path ? `<img data-phone-image="${escape(post.image.path)}" src="${escape(imageSource(post.image.path))}" alt="${escape(post.image.description)}" draggable="false">` : `<span>${icon(drawing ? 'refresh' : 'image')}<span>${drawing ? '生成中…' : escape(post.image.description)}</span>${drawing ? '' : '<small>点击生成图片</small>'}</span>`}</button>` : '';
  return `<header class="post-heading">${action('back-forum', '返回论坛', 'arrow', 'back-link')}<span>帖子详情</span></header>
    <article class="post-detail" tabindex="-1">${(readForumTags(post).length ? readForumTags(post) : ['闲聊']).map(tag => `<span class="post-category">${escape(tag)}</span>`).join(' ')}<h1>${renderBilingual(post.title, post.titleTranslation)}</h1>
      <div class="post-byline"><span class="author-mark">${escape(Array.from(post.author || '友')[0])}</span><span>${escape(post.author)}</span></div>
      <p class="post-body">${renderBilingual(post.content, post.contentTranslation)}</p>${photo}
      <div class="forum-votes" aria-label="帖子态度">${[['like','赞'],['dislike','踩']].map(([key,label]) => `<button type="button" data-action="forum-vote" data-forum-vote="${key}" aria-pressed="${vote === key}">${icon(key)}${label} <span>${totals[key] + Number(vote === key)}</span></button>`).join('')}</div>
    </article>
    <section class="comments"><h2>回帖 <span>${rows.length}</span></h2>${comments}</section>
    <div class="ls-more-area">${action('forum-more',loading ? '加载中…' : '加载更多','','ls-more-button',loading)}</div>
    <form class="forum-comment-form" data-forum-post="${escape(post.id)}"><label class="field-label" for="forum-comment-text">${escape(selected ? targetLabel(selected) : `回复主帖《${post.title}》`)}</label>
      ${selected ? `<div class="forum-reply-context"><span class="forum-quote-text">${escape(excerpt(readable(selected)))}</span></div>` : ''}
      <textarea id="forum-comment-text" name="comment" rows="3" placeholder="说说你的想法…" required>${escape(draft.text)}</textarea>
      <div class="forum-comment-actions">${selected ? action('forum-reply-cancel','取消回复','','quiet-button') : ''}<button type="submit" class="save-button" ${busy.has(`forum-comment:${post.id}`) ? 'disabled' : ''}>发布回帖</button></div>
    </form>`;
}
