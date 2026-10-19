import { action, empty, escape, icon, pageHeading, renderBilingual } from './shared.js';

export function renderForum(state, { busy }) {
  const posts = state.forum?.posts || [];
  const cards = posts.map((post, index) => `<button type="button" class="forum-card" data-post="${escape(post.id)}">
    <span class="post-topline">
      <span class="post-category category-${index % 3}">${escape(post.category || '闲聊')}</span>
      <span class="post-author">${escape(post.author)}</span>
    </span>
    <strong class="post-title">${renderBilingual(post.title, post.titleTranslation)}</strong>
    <span class="post-excerpt">${renderBilingual(post.content, post.contentTranslation)}</span>
    <span class="post-footer">
      <span>${icon('messages')}${post.comments?.length || 0} 条回帖</span>
      <span>展开看看 ${icon('next')}</span>
    </span>
  </button>`).join('');
  return `${pageHeading('论坛', action('refresh', busy.has('forum') ? '刷新中' : '刷新', 'refresh', 'quiet-button', busy.has('forum')))}
    <div class="forum-intro"><span class="live-mark"></span><span>街角、日常与偶然的谈话</span></div>
    <div class="forum-posts">${cards}</div>
    ${!posts.length ? empty('还没有帖子', '点“刷新”，看看最近大家在聊什么。', 'forum') : ''}`;
}

export function renderPost(state, { ui }) {
  const post = state.forum?.posts.find(post => post.id === ui.postId);
  if (!post) return empty('这批帖子已经更新', '返回论坛，看看新的帖子。', 'forum');
  const comments = (post.comments || []).map((comment, index) => `<article class="comment-row">
    <span class="comment-avatar tone-${index % 3}" aria-hidden="true">${escape(Array.from(comment.author || '路人')[0])}</span>
    <div>
      <h3>${escape(comment.author)}</h3>
      <p>${renderBilingual(comment.text, comment.translation)}</p>
    </div>
  </article>`).join('');
  return `<header class="post-heading">
      ${action('back-forum', '返回论坛', 'arrow', 'back-link')}
      <span>帖子详情</span>
    </header>
    <article class="post-detail">
      <span class="post-category">${escape(post.category || '闲聊')}</span>
      <h1>${renderBilingual(post.title, post.titleTranslation)}</h1>
      <div class="post-byline">
        <span class="author-mark">${escape(Array.from(post.author || '友')[0])}</span>
        <span>${escape(post.author)}</span>
      </div>
      <p class="post-body">${renderBilingual(post.content, post.contentTranslation)}</p>
    </article>
    <section class="comments">
      <h2>回帖 <span>${post.comments?.length || 0}</span></h2>
      ${comments}
    </section>`;
}
