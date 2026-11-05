import { action, empty, escape, icon, pageHeading, renderBilingual, renderEmojiText } from './shared.js';
import { captureFavorite, favoriteFor, favoriteApps, favoriteRefAttributes } from '../favorites.js';
import { imageSource } from '../image-files.js';
import { renderCardBody } from './cards.js';
import { formatPublicationTime } from '../social-time.js';

export function favoriteButton(state, ref, busy, defaultUser) {
  const entry = favoriteFor(state, captureFavorite(state, ref, { defaultUser }));
  return favoriteAction(ref, entry, busy.has(`favorite-add:${JSON.stringify(ref)}`));
}
export function favoriteAction(ref, entry, busy, { message = false } = {}) {
  const label = entry ? '已收藏' : '收藏';
  return `<button type="button" class="${message ? 'message-action message-favorite' : 'content-favorite'}" data-action="favorite-add" ${favoriteRefAttributes(ref)} ${entry ? `data-favorite-id="${escape(entry.id)}"` : ''} aria-label="${label}" aria-pressed="${Boolean(entry)}" ${busy ? 'disabled' : ''}>${icon(entry ? 'favorites-active' : 'favorites')}<span>收藏</span></button>`;
}
const thumbnail = image => image?.path ? `<span class="favorite-thumbnail"><img data-phone-image="${escape(image.path)}" src="${escape(imageSource(image.path))}" alt="${escape(image.description || '')}" loading="lazy" draggable="false"></span>` : '';
const excerpt = value => { const characters = Array.from(value || ''); return characters.slice(0, 110).join('') + (characters.length > 110 ? '…' : ''); };
const bilingual = snapshot => renderBilingual(snapshot.text, snapshot.translation, renderEmojiText);
const publication = snapshot => snapshot.publishedAt ? `<time>${escape(formatPublicationTime(snapshot.publishedAt))}</time>` : '';

export function renderFavorites(state, { ui }) {
  const entries = (state.favorites || []).filter(item => !ui.favoriteFilter || item.source.app === ui.favoriteFilter).slice().reverse();
  return `${pageHeading('收藏夹')}<nav class="forum-tags favorite-filters" aria-label="收藏来源">${favoriteApps.map(([key,label]) => `<button type="button" data-action="favorite-filter" data-favorite-filter="${key}" aria-pressed="${ui.favoriteFilter === key}">${label}</button>`).join('')}</nav>
    <div class="forum-posts favorite-list">${entries.map(entry => {
      const s = entry.snapshot;
      return `<button type="button" class="forum-card favorite-card" data-action="favorite-open" data-favorite-id="${escape(entry.id)}"><span class="post-topline"><span>${escape(s.sourceLabel)}</span><span class="post-author">${escape(s.authorName)}</span></span>${s.title ? `<span class="post-title">${renderBilingual(s.title, s.titleTranslation)}</span>` : ''}<span class="post-excerpt favorite-card-content"><span>${renderBilingual(excerpt(s.text || s.image?.description), excerpt(s.translation), renderEmojiText)}</span>${thumbnail(s.image)}</span>${s.publishedAt ? `<span class="post-footer">${publication(s)}</span>` : ''}</button>`;
    }).join('')}</div>${!entries.length ? empty('还没有收藏', '在消息或帖子旁的操作里，留下想再看的内容。', 'favorites') : ''}`;
}

function snapshotPhoto(image, source) {
  if (!image?.path && !image?.description) return '';
  const frame = { forum: 'forum-photo', social: 'social-photo', liangshi: 'ls-photo' }[source];
  const placeholder = source === 'social' ? 'social-photo-placeholder' : source === 'liangshi' ? 'ls-photo-placeholder' : '';
  const body = image.path
    ? `<img data-phone-image="${escape(image.path)}" src="${escape(imageSource(image.path))}" alt="${escape(image.description || '')}" loading="lazy" draggable="false">`
    : `<span class="${placeholder}">${icon('image')}<span class="photo-description">${escape(image.description)}</span><small>尚未生成图片</small></span>`;
  return image.path
    ? `<button type="button" class="${frame} favorite-photo" data-action="favorite-photo" aria-label="查看收藏图片">${body}</button>${image.description ? `<p class="photo-description">${escape(image.description)}</p>` : ''}`
    : `<div class="${frame} favorite-photo">${body}</div>`;
}
function snapshotQuote(quote) {
  return quote ? `<div class="ls-quote favorite-quote"><strong class="ls-quote-name">${escape(quote.authorName)}</strong>${renderBilingual(quote.text, quote.translation, renderEmojiText)}</div>` : '';
}
function snapshotMessage(s) {
  if (s.type === 'pat') return `<div class="message-row pat-row"><div class="pat-copy"><div class="pat-message favorite-copy">${bilingual(s)}</div></div></div>`;
  const rich = ['sticker', 'location', 'transfer'].includes(s.type);
  const image = s.type === 'image' || !s.type && Boolean(s.image);
  const body = image
    ? `${!s.type ? bilingual(s) : ''}${s.image?.path ? `<img class="message-photo" data-phone-image="${escape(s.image.path)}" src="${escape(imageSource(s.image.path))}" alt="${escape(s.image.description || '')}" loading="lazy">` : `<span class="photo-placeholder">${icon('image')}<small>尚未生成图片</small></span>`}<span class="photo-description">${escape(s.image?.description || '')}</span>`
    : rich ? renderCardBody(s) : bilingual(s);
  const classes = `bubble favorite-copy${image ? ' image-message favorite-rich' : s.type ? ` ${escape(s.type)}-message favorite-rich` : ''}`;
  const bubble = image && s.image?.path ? `<button type="button" class="${classes}" data-action="favorite-photo" aria-label="查看收藏图片">${body}</button>` : `<div class="${classes}">${body}</div>`;
  return `<div class="message-row"><div class="message-copy"><h2 class="message-sender">${escape(s.authorName)}</h2>${bubble}<span class="message-foot">${publication(s)}</span></div></div>`;
}
function snapshotContent(entry) {
  const s = entry.snapshot, { app, kind } = entry.source;
  if (app === 'forum') {
    const content = `${s.text || s.translation ? `<p class="post-body favorite-copy">${bilingual(s)}</p>` : ''}${snapshotPhoto(s.image, app)}`;
    return kind === 'post'
      ? `<article class="post-detail">${s.title ? `<h1>${renderBilingual(s.title, s.titleTranslation)}</h1>` : ''}<div class="post-byline"><span>${escape(s.authorName)}</span>${publication(s)}</div>${content}</article>`
      : `<article class="comment-row"><div><h3>${escape(s.authorName)}</h3>${publication(s)}${content}</div></article>`;
  }
  if (app === 'social') {
    const header = `<div class="social-author"><div class="social-author-copy"><h2><strong>${escape(s.authorName)}</strong></h2>${publication(s)}</div></div>`;
    return kind === 'post'
      ? `<article class="social-post">${header}${snapshotPhoto(s.image, app)}<p class="social-caption favorite-copy">${bilingual(s)}</p></article>`
      : `<article class="social-post">${header}<p class="social-comment favorite-copy">${bilingual(s)}</p>${snapshotPhoto(s.image, app)}</article>`;
  }
  if (app === 'liangshi') {
    const header = `<div class="ls-author"><div class="ls-author-copy"><h2 class="ls-name">${escape(s.authorName)}</h2><span class="ls-meta">${publication(s)}</span></div></div>`;
    return kind === 'comment'
      ? `<article class="ls-comment"><div class="ls-comment-body">${header}<p class="favorite-copy">${bilingual(s)}</p>${snapshotPhoto(s.image, app)}${snapshotQuote(s.quote)}</div></article>`
      : `<article class="${kind === 'repost' ? 'ls-repost' : 'ls-post'}">${header}<p class="ls-copy favorite-copy">${bilingual(s)}</p>${snapshotPhoto(s.image, app)}${snapshotQuote(s.quote)}</article>`;
  }
  return snapshotMessage(s);
}
export function renderFavoriteDetail(state, { ui, busy }) {
  const entry = (state.favorites || []).find(item => item.id === ui.favoriteId);
  if (!entry) return `${pageHeading('收藏详情', action('favorite-back', '返回收藏夹', 'arrow', 'icon-button'))}${empty('这条收藏已移除')}`;
  return `${pageHeading('收藏详情', action('favorite-back', '返回收藏夹', 'arrow', 'icon-button'))}<section class="favorite-detail" data-favorite-app="${escape(entry.source.app)}"><div class="favorite-detail-header"><p class="favorite-origin">${escape(entry.snapshot.sourceLabel)}</p>${action('favorite-remove', '取消收藏', '', 'quiet-button danger', busy.has(`favorite-remove:${entry.id}`))}</div>${snapshotContent(entry)}</section>`;
}
