import { action, avatar, empty, escape, icon, renderBilingual } from './shared.js';
import { displayName } from '../profiles.js';
import { getSocialAuthor, readSocialPosts, readSocialFeed } from '../social.js';
import { publicationLabel } from '../social-time.js';
import { imageSource } from '../image-files.js';

function renderPost(post, state, busy) {
  const author = getSocialAuthor(state, post.authorId);
  if (!author) return '';
  const generating = busy.has(`social-image:${post.id}`);
  const photo = post.image ? `<button type="button" class="social-photo" data-action="social-image" data-social-image="${escape(post.id)}"
      aria-label="${post.image.path ? '查看动态图片' : '生成动态图片'}" ${generating ? 'disabled' : ''}>
      ${post.image.path
        ? `<img data-phone-image="${escape(post.image.path)}" src="${escape(imageSource(post.image.path))}" alt="${escape(post.image.description)}" loading="lazy" draggable="false">`
        : `<span class="social-photo-placeholder">${icon('image')}<span>${escape(post.image.description)}</span><small>${generating ? '生成中…' : '点击生成图片'}</small></span>`}
    </button>` : '';
  const comments = (post.comments || []).map(comment => `<p class="social-comment"><strong>${escape(comment.name)}</strong>${renderBilingual(comment.text, comment.translation)}</p>`).join('');
  const date = publicationLabel(post);
  return `<article class="social-post" data-social-post="${escape(post.id)}">
    <button type="button" class="social-author" data-action="social-author" data-social-author="${escape(author.id)}" aria-label="查看${escape(displayName(author))}的主页">
      ${avatar(author, true)}
      <span class="social-author-copy">
        <strong>${escape(displayName(author))}</strong>
        ${author.nickname && author.name !== author.nickname ? `<span>${escape(author.name)}</span>` : ''}
      </span>
    </button>
    ${photo}
    ${post.text ? `<p class="social-caption">${renderBilingual(post.text, post.translation)}</p>` : ''}
    <div class="social-stats" aria-label="动态统计">
      <span>${icon('heart')}${post.likes || 0} 赞</span><span>${icon('repost')}${post.reposts || 0} 转发</span><span>${icon('comment')}${post.commentsCount || 0} 评论</span>
    </div>
    ${comments ? `<div class="social-comments">${comments}</div>` : ''}
    ${date ? `<time class="social-time">${escape(date)}</time>` : ''}
  </article>`;
}

export function renderSocial(state, { ui, busy }) {
  const ordered = readSocialPosts(state), feed = readSocialFeed(state, ordered);
  const feedIds = new Set(feed.map(post => post.id));
  const past = ordered.filter(post => !feedIds.has(post.id));
  const limit = ui.socialLimit || 30;
  return `<header class="social-header">
      <h1 class="social-wordmark">ainstgram</h1>
      ${action('social-refresh', busy.has('social') ? '刷新动态中' : '刷新动态', 'refresh', 'icon-button', busy.has('social'))}
    </header>
    <div class="social-feed">${feed.map(post => renderPost(post, state, busy)).join('')}</div>
    ${!feed.length ? empty(busy.has('social') ? '正在整理动态' : '暂无动态', '', 'image') : ''}
    ${past.length ? `<section class="social-history">
      <button type="button" class="history-fold" data-action="social-past" aria-expanded="${Boolean(ui.socialPastOpen)}"><span>${ui.socialPastOpen ? '收起过去的动态' : '查看过去的动态'}</span></button>
      ${ui.socialPastOpen ? `${past.slice(0, limit).map(post => renderPost(post, state, busy)).join('')}
        ${past.length > limit ? action('social-earlier', '查看更早的动态', '', 'earlier-button') : ''}` : ''}
    </section>` : ''}`;
}

export function renderSocialProfile(state, { ui, busy }) {
  const author = getSocialAuthor(state, ui.socialAuthorId);
  if (!author) return `${action('social-back', '返回动态', 'arrow', 'back-link')}${empty('这位作者已不存在', '返回动态列表查看其他内容。', 'image')}`;
  const posts = readSocialPosts(state, { authorId: author.id });
  const limit = ui.socialLimit || 30;
  const generating = busy.has(`social-author:${author.id}`);
  return `<header class="social-header">
      ${action('social-back', '返回动态', 'arrow', 'back-link')}
      <h1>${escape(displayName(author))}</h1>
      ${action('social-author-refresh', '补充个人动态', 'refresh', 'icon-button', generating)}
    </header>
    <section class="social-profile">
      ${avatar(author)}
      <div class="social-profile-copy">
        <h2>${escape(displayName(author))}</h2>
        ${author.description ? `<p>${escape(author.description)}</p>` : ''}
        <span>${posts.length} 条动态</span>
      </div>
    </section>
    ${generating ? '<p class="social-loading" role="status">正在补充个人动态…</p>' : ''}
    <div class="social-profile-posts">${posts.slice(0, limit).map(post => renderPost(post, state, busy)).join('')}</div>
    ${posts.length > limit ? action('social-earlier', '查看更早的动态', '', 'earlier-button') : ''}
    ${!posts.length && !generating ? empty('暂无动态', '', 'image') : ''}`;
}
