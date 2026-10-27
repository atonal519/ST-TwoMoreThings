import { action, avatar, empty, escape, icon, renderBilingual, renderContentImage } from './shared.js';
import { getLiangshiContact, liangshiStatistics, liangshiReplyState, readLiangshiFeed, readLiangshiFollowingFeed, readLiangshiUserPosts, readLiangshiTopics, readLiangshiTopic, isLiangshiFollowingPost, isLiangshiUserPost, liangshiInteractions } from '../liangshi.js';
import { imageSource } from '../image-files.js';

const truncate = (value, limit) => Array.from(value || '').length > limit ? Array.from(value).slice(0, limit).join('') + '…' : value || '';
const totalLabel = value => value >= 1e8 ? `${+(value / 1e8).toFixed(1)}亿` : value >= 1e4 ? `${+(value / 1e4).toFixed(1)}万` : String(value);
const follow = (account, state, following) => account.ownerId === '@user' ? '' : `<button type="button" class="ls-follow${(following || account.followed === true || getLiangshiContact(state, account)) ? ' is-followed' : ''}" disabled>${(following || account.followed === true || getLiangshiContact(state, account)) ? '已关注' : '＋关注'}</button>`;

export function renderLiangshiOwnMenu(post, busy) {
  const id = post.id, state = liangshiReplyState(post), disabled = ['liangshi-more', 'liangshi-replies', 'liangshi-image', 'liangshi-delete', 'liangshi-reply'].some(key => busy.has(`${key}:${id}`)) || [...busy].some(key => key.startsWith(`liangshi-image:${id}:`));
  return `<div class="ls-own-menu" role="menu" aria-label="本人微博操作"><button type="button" role="menuitem" data-action="liangshi-generate-replies" data-liangshi-id="${escape(id)}" ${disabled || !state.pending.length ? 'disabled' : ''}>生成回应</button><button type="button" role="menuitem" data-action="liangshi-regenerate-replies" data-liangshi-id="${escape(id)}" ${disabled || !state.last?.inputIds?.length ? 'disabled' : ''}>重新生成</button><button type="button" role="menuitem" data-action="liangshi-edit" data-liangshi-id="${escape(id)}" ${disabled ? 'disabled' : ''}>编辑微博</button><button type="button" class="danger" role="menuitem" data-action="liangshi-delete" data-liangshi-id="${escape(id)}" ${disabled ? 'disabled' : ''}>删除微博</button></div>`;
}

export function renderLiangshi(state, { ui, busy }) {
  const data = state.liangshi || { accounts: [], posts: [], topics: [] }, page = ui.liangshiPage;
  const self = { ...state.userProfile, name: state.userProfile?.name || ui.defaultUser || '我' };
  const selfName = self.nickname || self.name;
  const feed = readLiangshiFeed(data), following = readLiangshiFollowingFeed(data), mine = readLiangshiUserPosts(data), topics = readLiangshiTopics(data);
  const followingAuthors = new Set(following.map(post => post.authorId));
  const followingView = page.kind === 'feed' && page.tab === 'following' || page.kind === 'topic' && page.source === 'following' || page.kind === 'post' && isLiangshiFollowingPost(data, page.id);
  const mineView = page.kind === 'feed' && page.tab === 'mine' || page.kind === 'topic' && page.source === 'mine' || page.kind === 'post' && isLiangshiUserPost(data, page.id);
  const keywordFeed = mineView ? mine : followingView ? following : feed, keywordTopics = [...new Set(keywordFeed.map(post => post.topic).filter(Boolean))];
  const accounts = new Map(data.accounts.map(account => [account.id, account.ownerId === '@user' ? { ...account, name: selfName, avatar: self.avatar || '' } : account]));
  const posts = new Map(data.posts.map(post => [post.id, post]));
  const like = (post, detail = false) => `<button type="button" class="ls-like" data-action="liangshi-like" data-liangshi-like="${escape(post.id)}" aria-pressed="${Boolean(post.userLiked)}" aria-label="${post.userLiked ? '取消点赞' : '点赞'}" ${busy.has(`liangshi-like:${post.id}`) ? 'disabled' : ''}>${icon(post.userLiked ? 'heart-active' : 'heart')}${detail ? '<span>赞</span><strong>' : ''}${totalLabel(liangshiStatistics(post).likes + Number(Boolean(post.userLiked)))}${detail ? '</strong>' : ''}</button>`;
  const bilingual = (text, translation) => {
    let html = renderBilingual(text, translation);
    for (const topic of keywordTopics) html = html.replaceAll(`#${escape(topic)}#`, `<button type="button" class="ls-topic" data-liangshi-topic="${escape(topic)}" data-liangshi-topic-source="${mineView ? 'mine' : followingView ? 'following' : 'square'}">#${escape(topic)}#</button>`);
    return html;
  };
  const author = (account, time) => `<div class="ls-author">${avatar(account)}<div class="ls-author-copy"><span class="ls-name">${escape(account.name)}</span><span class="ls-meta"><span>${escape(time || '')}</span>${account.handle && account.ownerId !== '@user' ? `<span>@${escape(account.handle)}</span>` : ''}</span></div>${follow(account, state, followingAuthors.has(account.id))}</div>`;
  const quote = post => post ? `<button type="button" class="ls-quote" data-liangshi-open="${escape(post.id)}" aria-label="查看引用的原博"><span class="ls-quote-name">@${escape(accounts.get(post.authorId)?.name || '作者')}</span>：${renderBilingual(truncate(post.text || (post.image?.description ? `[图片] ${post.image.description}` : ''), 110), truncate(post.translation, 110))}</button>` : '<div class="ls-quote is-missing">原博已删除</div>';
  function postMarkup(post, detail = false) {
    const account = accounts.get(post.authorId), totals = liangshiStatistics(post);
    if (!account) return '';
    const expanded = detail || ui.liangshiExpanded.has(post.id), long = Math.max(post.text.length, post.translation?.length || 0) > 160;
    const generating = busy.has(`liangshi-image:${post.id}`);
    const photo = post.image ? `<button type="button" class="ls-photo" data-action="liangshi-image" data-liangshi-image="${escape(post.id)}" aria-label="${post.image.path ? '查看微博图片' : '生成微博图片'}" aria-busy="${generating}" ${generating ? 'disabled' : ''}>
      ${post.image.path ? `<img data-phone-image="${escape(post.image.path)}" src="${escape(imageSource(post.image.path))}" alt="${escape(post.image.description)}" loading="lazy" draggable="false">`
      : `<span class="ls-photo-placeholder${generating ? ' is-generating' : ''}">${icon(generating ? 'refresh' : 'image')}<span${generating ? ' role="status"' : ''}>${generating ? '生成中…' : escape(post.image.description)}</span>${generating ? '' : '<small>点击生成图片</small>'}</span>`}
    </button>` : '';
    return `<article class="ls-post" data-liangshi-id="${escape(post.id)}">${author(account, (post.publishedAt || '') + (post.editedAt ? ' · 已编辑' : ''))}${post.promoted ? '<span class="ls-ad-label">推广</span>' : ''}
      <p class="ls-copy" data-liangshi-open="${escape(post.id)}">${bilingual(expanded || !long ? post.text : truncate(post.text, 120), expanded || !long ? post.translation : truncate(post.translation, 120))}</p>
      ${photo}
      ${long && !detail ? `<button type="button" class="ls-expand" data-action="liangshi-expand" data-liangshi-id="${escape(post.id)}">${expanded ? '收起' : '展开全文'}</button>` : ''}
      ${post.quoteId ? quote(posts.get(post.quoteId)) : ''}
      <div class="ls-post-footer">${detail ? '' : `<div class="ls-stats"><button type="button" data-liangshi-open="${escape(post.id)}" data-liangshi-section="reposts" aria-label="查看转发">${icon('repost')}${totalLabel(totals.repostCount)}</button><button type="button" data-liangshi-open="${escape(post.id)}" data-liangshi-section="comments" aria-label="查看评论">${icon('comment')}${totalLabel(totals.commentCount)}</button>${like(post)}</div>`}
      ${post.userAuthored && account.ownerId === '@user' ? `<div class="ls-own-actions"><button type="button" class="ls-own-toggle" data-action="liangshi-menu" data-liangshi-id="${escape(post.id)}" aria-label="微博操作" aria-haspopup="menu" aria-expanded="${ui.liangshiMenu === post.id}">${icon('more')}</button>
        ${ui.liangshiMenu === post.id ? renderLiangshiOwnMenu(post, busy) : ''}</div>` : ''}</div></article>`;
  }
  const comment = (row, post) => {
    const account = accounts.get(row.authorId); if (!account) return '';
    const own = post.userAuthored && accounts.get(post.authorId)?.ownerId === '@user', target = accounts.get(row.replyToAuthorId), draft = ui.liangshiReplyDrafts?.get(post.id);
    const writing = busy.has(`liangshi-reply:${post.id}`), selected = own && draft?.replyToId === row.id;
    return `<div class="ls-comment" data-liangshi-comment="${escape(row.id)}">${avatar(account)}<div class="ls-comment-body"><b>${escape(account.name)}</b>${row.replyToId ? `<small class="ls-reply-target">回复 @${escape(target?.name || '原评论作者')}</small>` : ''}${row.text ? `<p>${bilingual(row.text, row.translation)}</p>` : ''}${renderContentImage(row.image, { action: 'liangshi-image', data: { 'liangshi-image': post.id, 'liangshi-row': row.id, 'liangshi-collection': 'comments' }, busy: busy.has(`liangshi-image:${post.id}:${row.id}`), label: '微博评论图片' })}
      ${own ? `<button type="button" class="ls-reply-button" data-action="liangshi-reply" data-liangshi-id="${escape(post.id)}" data-liangshi-comment="${escape(row.id)}" aria-label="回复${escape(account.name)}">回复</button>` : ''}
      ${selected ? `<form class="ls-reply-form" data-liangshi-reply-form="${escape(post.id)}"><label class="field-label" for="ls-reply-text">回复 @${escape(account.name)}</label><textarea id="ls-reply-text" name="reply" rows="3" placeholder="写下回复…" required>${escape(draft.text)}</textarea><div class="ls-reply-actions"><button type="button" class="quiet-button" data-action="liangshi-reply-cancel" data-liangshi-id="${escape(post.id)}">取消</button><button type="submit" class="save-button" ${writing ? 'disabled' : ''}>${writing ? '发布中…' : '发布回复'}</button></div></form>` : ''}</div></div>`;
  };
  const repost = (row, post) => {
    const account = accounts.get(row.authorId); if (!account) return '';
    return `<article class="ls-repost">${author(account, '转发了这条微博')}${row.text ? `<p class="ls-copy">${bilingual(row.text, row.translation)}</p>` : ''}${renderContentImage(row.image, { action: 'liangshi-image', data: { 'liangshi-image': post.id, 'liangshi-row': row.id, 'liangshi-collection': 'reposts' }, busy: busy.has(`liangshi-image:${post.id}:${row.id}`), label: '微博转发图片' })}${quote(posts.get(row.quoteId))}</article>`;
  };
  const hotTopic = page.kind === 'hot-topic' ? readLiangshiTopic(data, page.id) : null;
  const refreshing = page.kind === 'compose' || page.kind === 'feed' && page.tab === 'mine' ? '' : page.kind === 'hot-topic'
    ? action('liangshi-topic-refresh', '刷新话题微博', 'refresh', 'icon-button', busy.has(`liangshi-topic:${page.id}`))
    : page.kind === 'feed' && page.tab === 'hot'
      ? action('liangshi-hot-refresh', '刷新热榜', 'refresh', 'icon-button', busy.has('liangshi-hot'))
      : followingView ? action('liangshi-following-refresh', '刷新关注', 'refresh', 'icon-button', busy.has('liangshi-following'))
      : action('liangshi-refresh', '刷新广场', 'refresh', 'icon-button', busy.has('liangshi'));
  const header = `<div class="ls-chrome"><header class="ls-header"><span class="ls-wordmark">两事</span><div class="ls-header-actions">${page.kind !== 'post' ? refreshing : ''}${page.kind !== 'compose' ? action('liangshi-compose', '发微博', 'plus', 'icon-button') : ''}</div></header>
    ${page.kind === 'feed' ? `<nav class="ls-tabs" aria-label="两事栏目">${[['following','关注'],['square','广场'],['hot','热榜'],['mine','我的']].map(([key,name]) => `<button type="button" data-liangshi-tab="${key}" aria-current="${page.tab === key ? 'page' : 'false'}">${name}</button>`).join('')}</nav>` : `<div class="ls-subhead">${action('liangshi-back', '返回上页', 'arrow', 'ls-back')}<span>${page.kind === 'topic' ? `#${escape(page.topic)}#` : page.kind === 'hot-topic' ? '热榜话题' : page.kind === 'compose' ? ui.liangshiDraft.postId ? '编辑微博' : '发微博' : '微博正文'}</span></div>`}</div>`;
  if (page.kind === 'compose') {
    const draft = ui.liangshiDraft, writing = busy.has('liangshi-draft'), publishing = busy.has('liangshi-publish') || busy.has(`liangshi-edit:${ui.liangshiDraft.postId}`);
    return header + `<form class="ls-compose-form">
      <label class="field-label" for="ls-draft-text">微博正文</label><textarea id="ls-draft-text" name="text" rows="7" placeholder="写下想分享的事…">${escape(draft.text)}</textarea>
      <label class="field-label" for="ls-draft-image">配图描述（可选）</label><textarea id="ls-draft-image" name="imageDescription" rows="3" placeholder="描述想分享的照片，发布后点图片生成">${escape(draft.imageDescription)}</textarea>
      ${draft.translation ? `<p class="ls-copy ls-draft-translation">${renderBilingual(draft.translation)}</p>` : ''}
      <div class="ls-compose-actions">${action('liangshi-draft', writing ? '帮写中…' : '帮我写', 'refresh', 'quiet-button', writing || publishing)}<button type="submit" class="save-button" ${writing || publishing ? 'disabled' : ''}>${publishing ? '保存中…' : draft.postId ? '保存修改' : '发布'}</button></div>
    </form>`;
  }
  if (page.kind === 'post') {
    const post = posts.get(page.id);
    if (!post) return header + empty('这批微博已经更新', '返回上页查看新内容。', 'liangshi');
    const working = busy.has(`liangshi-more:${post.id}`), responding = busy.has(`liangshi-replies:${post.id}`), tab = page.tab || 'comments', totals = liangshiStatistics(post);
    const tabs = `<div class="ls-detail-stats"><div role="tablist" aria-label="微博互动">${[['reposts','转发',totals.repostCount],['comments','评论',totals.commentCount]].map(([key,label,total]) => `<button type="button" role="tab" data-liangshi-detail-tab="${key}" aria-label="${label}" aria-selected="${tab === key}"><span>${label}</span><strong>${totalLabel(total)}</strong></button>`).join('')}</div>${like(post, true)}</div>`;
    const list = tab === 'reposts' ? liangshiInteractions(post, 'reposts').map(row => repost(row, post)).join('') : liangshiInteractions(post).map(row => comment(row, post)).join('');
    return `${header}${postMarkup(post, true)}${tabs}${responding ? '<p class="ls-response-status" role="status">正在生成回应…</p>' : ''}<section class="ls-detail-list" role="tabpanel" aria-label="${tab === 'reposts' ? '转发' : '评论'}">${list || `<p class="ls-no-comments">暂无${tab === 'reposts' ? '转发' : '评论'}</p>`}</section><div class="ls-more-area">${action('liangshi-more', working ? '加载中' : '加载更多', '', 'ls-more-button', working || responding)}</div>`;
  }
  if (page.kind === 'hot-topic') {
    if (!hotTopic) return header + empty('这条话题已经更新', '返回热榜，看看新的话题。', 'liangshi');
    const selected = hotTopic.postIds.flatMap(id => posts.has(id) ? [posts.get(id)] : []), working = busy.has(`liangshi-topic:${page.id}`);
    const summary = `<section class="ls-topic-summary"><h1>${renderBilingual(hotTopic.name, hotTopic.nameTranslation)}</h1><p class="ls-copy">${renderBilingual(hotTopic.description, hotTopic.descriptionTranslation)}</p>${hotTopic.heat !== undefined ? `<small>${escape(hotTopic.heat)}</small>` : ''}</section>`;
    return header + summary + selected.map(post => postMarkup(post)).join('') + (selected.length ? working ? '<p class="ls-list-end" role="status">正在加载话题微博…</p>' : '' : `<div class="ls-more-area">${action('liangshi-topic-load', working ? '加载中' : '加载话题微博', '', 'ls-more-button', working)}</div>`);
  }
  if (page.kind === 'topic') {
    const selected = keywordFeed.filter(post => post.topic === page.topic);
    return header + selected.map(post => postMarkup(post)).join('');
  }
  if (page.tab === 'mine') return header + `<section class="ls-mine-profile" aria-label="我的主页"><div class="ls-mine-identity">${avatar(self)}<h1>${escape(selfName)}</h1></div><div class="ls-mine-stats" aria-label="模拟账号数据"><span><strong>128</strong>关注</span><span><strong>360</strong>粉丝</span><span><strong>1.2万</strong>转评赞</span></div></section>`
    + (mine.length ? mine.map(post => postMarkup(post)).join('') : '<div class="ls-empty">还没有发布微博</div>');
  if (page.tab === 'following') {
    return header + (following.length ? following.map(post => postMarkup(post)).join('') : '<div class="ls-empty">暂无关注微博</div>');
  }
  if (page.tab === 'hot') return header + `<h1 class="ls-hot-heading">此刻热议</h1>${topics.map((topic,index) => `<button type="button" class="ls-hot-row" data-liangshi-hot="${escape(topic.id)}"><span class="ls-rank">${index + 1}</span><span class="ls-hot-copy"><strong>${renderBilingual(topic.name, topic.nameTranslation)}</strong><small>${renderBilingual(truncate(topic.description, 64), truncate(topic.descriptionTranslation, 64))}</small>${topic.heat !== undefined ? `<span class="ls-hot-heat">${escape(topic.heat)}</span>` : ''}</span>${icon('next')}</button>`).join('')}${!topics.length ? '<div class="ls-empty">暂无热榜话题</div>' : ''}`;
  return header + (feed.length ? feed.map(post => postMarkup(post)).join('') : empty('还没有微博', '', 'liangshi'));
}
