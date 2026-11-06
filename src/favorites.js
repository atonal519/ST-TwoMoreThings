import { displayName } from './profiles.js';
import { getSocialAuthor } from './social.js';
import { messageText } from './content.js';
import { findSticker } from './stickers.js';
import { imagePath } from './image-files.js';
import { savedPublication, publicationLabel } from './social-time.js';
import { forumData } from './forum-scope.js';

export const favoriteApps = [['', '全部'], ['messages', '聊天'], ['liangshi', '两事'], ['social', '动态'], ['forum', '论坛']];
const copyText = (value, keys) => Object.fromEntries(keys.filter(key => typeof value?.[key] === 'string').map(key => [key, value[key]]));
const imageCopy = image => image && (image.description || imagePath(image.path)) ? { ...copyText(image, ['description']), ...(imagePath(image.path) ? { path: imagePath(image.path) } : {}) } : undefined;
const bodyCopy = item => ({ ...copyText(item, ['text', 'translation']), ...(imageCopy(item.image) ? { image: imageCopy(item.image) } : {}) });
const sourceKey = source => JSON.stringify([source.app, source.kind, source.conversationId || '', source.messageId || '', source.batchKey || '', source.postId || '', source.rowId || '', ...(source.app === 'forum' && source.scope === 'circle' ? ['circle'] : [])]);
export function favoriteFor(state, candidate) {
  if (!candidate) return undefined;
  return (state.favorites || []).find(item => sourceKey(item.source) === sourceKey(candidate.source) && (!candidate.source.legacy || JSON.stringify(item.snapshot) === JSON.stringify(candidate.snapshot)));
}
function readUnit(state, ref) {
  if (ref.app === 'messages') {
    const group = state.groups?.find(item => item.id === ref.conversationId), person = group || state.contacts?.find(item => item.id === ref.conversationId);
    const unit = state.conversations?.[ref.conversationId]?.find(item => item.id === ref.messageId && (ref.batchKey === undefined || (item.batch?.key ?? 'legacy') === ref.batchKey));
    return person && unit ? { unit, person, group } : null;
  }
  const post = (ref.app === 'forum' ? forumData(state, ref.scope) : state[ref.app])?.posts?.find(item => item.id === ref.postId);
  if (!post) return null;
  if (ref.kind === 'post') return { post, unit: post };
  const collection = ref.kind === 'repost' ? 'reposts' : 'comments', rows = post[collection] || [];
  const unit = ref.rowId ? rows.find(item => item.id === ref.rowId) : rows[ref.rowIndex];
  return unit ? { post, unit } : null;
}
export function captureFavorite(state, ref, { defaultUser = '我' } = {}) {
  if (!['messages', 'social', 'liangshi', 'forum'].includes(ref.app) || !['message', 'post', 'comment', 'repost'].includes(ref.kind)) return null;
  const found = readUnit(state, ref); if (!found) return null;
  const { unit, person, group, post } = found;
  let authorName, sourceLabel;
  const source = { app: ref.app, kind: ref.kind };
  let snapshot = bodyCopy(unit);
  if (ref.app === 'messages') {
    Object.assign(source, { conversationId: ref.conversationId, messageId: unit.id, batchKey: unit.batch?.key ?? 'legacy' });
    const author = unit.role === 'user' ? state.userProfile || { name: defaultUser } : group ? state.contacts?.find(item => item.id === unit.speakerId) : person;
    authorName = displayName(author || { name: unit.role === 'user' ? defaultUser : '已移除联系人' }) || defaultUser;
    sourceLabel = `${group ? '群聊' : '私聊'} · ${displayName(person)}`;
    snapshot.text = unit.type === 'sticker' && !findSticker(unit.stickerId) ? unit.text || '' : messageText(unit);
    if (unit.type) snapshot.type = unit.type;
    if (unit.type === 'location') snapshot.location = copyText(unit.location, ['name', 'address']);
    if (unit.type === 'transfer') snapshot.transfer = copyText(unit.transfer, ['amount', 'currency', 'note', 'status']);
    if (unit.type === 'sticker') snapshot.stickerId = unit.stickerId;
  } else {
    source.postId = post.id;
    if (ref.kind !== 'post') { if (unit.id) source.rowId = unit.id; else source.legacy = true; }
    if (ref.app === 'social') { authorName = ref.kind === 'post' ? displayName(getSocialAuthor(state, unit.authorId) || { name: '已移除作者' }) : unit.name || displayName(getSocialAuthor(state, unit.authorId) || { name: '评论者' }); sourceLabel = `ainstgram · ${ref.kind === 'post' ? '动态' : '评论'}`; }
    if (ref.app === 'forum') {
      if (ref.scope === 'circle') source.scope = 'circle';
      authorName = unit.author || '匿名'; sourceLabel = `论坛 · ${ref.kind === 'post' ? '主帖' : '回帖'}`;
      if (ref.scope === 'circle') sourceLabel = `圈内论坛 · ${forumData(state, 'circle').profile?.name || '圈内'} · ${ref.kind === 'post' ? '主帖' : '回帖'}`;
      if (ref.kind === 'post') snapshot = { ...snapshot, ...copyText(unit, ['title', 'titleTranslation']), text: unit.content || '', ...(unit.contentTranslation ? { translation: unit.contentTranslation } : {}) };
    }
    if (ref.app === 'liangshi') {
      const account = state.liangshi.accounts?.find(item => item.id === unit.authorId);
      authorName = account?.ownerId === '@user' ? displayName(state.userProfile || { name: defaultUser }) : account?.name || '已移除作者';
      sourceLabel = `两事 · ${{post:'微博',comment:'评论',repost:'转发'}[ref.kind]}`;
      const quote = unit.quoteId && state.liangshi.posts.find(item => item.id === unit.quoteId);
      if (quote) {
        const excerpt = value => { const characters = Array.from(value || ''); return characters.slice(0, 110).join('') + (characters.length > 110 ? '…' : ''); };
        const author = state.liangshi.accounts?.find(item => item.id === quote.authorId);
        const quoteAuthor = author?.ownerId === '@user' ? displayName(state.userProfile || { name: defaultUser }) || defaultUser : author?.name || '作者';
        snapshot.quote = { text: excerpt(quote.text || (quote.image?.description ? `[图片] ${quote.image.description}` : '')), ...(quote.translation ? { translation: excerpt(quote.translation) } : {}), authorName: quoteAuthor };
      }
    }
  }
  snapshot = { authorName, sourceLabel, ...snapshot, publishedAt: ref.app === 'social' && ref.kind === 'post' ? publicationLabel(unit) : savedPublication(unit) };
  return { source, snapshot };
}
// These attributes locate the clicked raw unit only; legacy positions are never persisted as identity.
export function favoriteRefAttributes(ref) {
  return `data-favorite-ref="${encodeURIComponent(JSON.stringify(ref))}"`;
}
