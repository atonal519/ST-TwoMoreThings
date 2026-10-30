import { imagePath } from './image-files.js';
import { getSocialAuthor } from './social.js';
import { forumComments } from './forum.js';
import { liangshiInteractions } from './liangshi.js';
import { displayName } from './profiles.js';
import { hasPublicationDate, formatPublicationTime, savedPublication } from './social-time.js';

const text = value => typeof value === 'string' ? value.trim() : '';
const description = value => typeof value === 'string' ? value : '';
const dateLabel = row => hasPublicationDate(row) ? formatPublicationTime(savedPublication(row)).replace(/ \d{2}:\d{2}$/u, '') : Object.hasOwn(row, 'publishedAt') ? '' : text(row.storyDate);
export function albumPhotoKey(value) {
  const local = imagePath(value), path = text(value);
  if (local) return local;
  if (!/^https?:\/\//i.test(path)) return '';
  try { new URL(path); return path; } catch { return ''; }
}

function liveAlbumPhotos(state, { defaultUser = '我', includeUnavailable = false } = {}) {
  const photos = new Map();
  const add = (image, source) => {
    const path = albumPhotoKey(image?.path);
    if (!path) return;
    let photo = photos.get(path);
    if (!photo) { photo = { path, description: description(image.description), timeLabel: '', dateLabel: '', sources: [] }; photos.set(path, photo); }
    if (!photo.description) photo.description = description(image.description);
    photo.sources.push(source);
    if (!photo.timeLabel) photo.timeLabel = source.publishedAt;
    if (!photo.dateLabel) photo.dateLabel = source.dateLabel;
  };
  const source = (kind, row, label, ids = {}) => ({ kind, id: row.id, label, publishedAt: savedPublication(row), dateLabel: dateLabel(row), createdAt: text(row.createdAt), ...ids });
  for (const person of [...(state.contacts || []), ...(state.groups || [])]) {
    const group = (state.groups || []).includes(person), kind = group ? 'groups' : 'messages';
    for (const row of state.conversations?.[person.id] || []) {
      if (row.type !== 'image') continue;
      add(row.image, { ...source(kind, row, `${group ? '群聊' : '短信'} · ${displayName(person)}`, { conversationId: person.id }), publishedAt: [text(row.storyDate), text(row.timeLabel)].filter(Boolean).join(' ') });
    }
  }
  if (includeUnavailable) {
    const known = new Set([...(state.contacts || []), ...(state.groups || [])].map(person => person.id));
    for (const [id, rows] of Object.entries(state.conversations || {})) if (!known.has(id)) for (const row of rows) {
      if (row.type === 'image') add(row.image, source('messages', row, '聊天图片', { conversationId: id }));
    }
  }
  for (const post of state.social?.posts || []) {
    const author = getSocialAuthor(state, post.authorId);
    if (author || includeUnavailable) add(post.image, source('social', post, author ? `Ins · ${displayName(author)}` : 'Ins', { authorId: post.authorId }));
  }
  for (const post of state.forum?.posts || []) {
    add(post.image, source('forum', post, `论坛 · ${post.title || post.author || '主帖'}`));
    for (const row of forumComments(post)) add(row.image, source('forum-comments', row, `论坛评论 · ${row.author || '匿名'}`, { postId: post.id }));
  }
  const accounts = new Map((state.liangshi?.accounts || []).map(account => [account.id, account]));
  const accountName = account => account.ownerId === '@user' ? state.userProfile?.nickname || state.userProfile?.name || defaultUser : account.name || account.handle || '博主';
  for (const post of state.liangshi?.posts || []) {
    const author = accounts.get(post.authorId);
    if (!author && !includeUnavailable) continue;
    add(post.image, source('liangshi', post, author ? `两事 · ${accountName(author)}` : '两事', { authorId: post.authorId }));
    for (const collection of ['comments', 'reposts']) for (const row of liangshiInteractions(post, collection)) {
      const author = accounts.get(row.authorId);
      if (author || includeUnavailable) add(row.image, source(`liangshi-${collection}`, row, `两事${collection === 'comments' ? '评论' : '转发'}${author ? ` · ${accountName(author)}` : ''}`, { postId: post.id, authorId: row.authorId }));
    }
  }
  const created = photo => photo.sources.reduce((latest, row) => row.createdAt > latest ? row.createdAt : latest, '');
  return [...photos.values()].sort((a, b) => created(b).localeCompare(created(a)));
}

function mergePhotos(...collections) {
  const photos = new Map();
  for (const row of collections.flat()) {
    const path = albumPhotoKey(row.path); if (!path) continue;
    let photo = photos.get(path);
    if (!photo) { photo = { path, description: description(row.description), timeLabel: text(row.timeLabel), dateLabel: text(row.dateLabel), sources: [] }; photos.set(path, photo); }
    if (!photo.description) photo.description = description(row.description);
    if (!photo.timeLabel) photo.timeLabel = text(row.timeLabel);
    if (!photo.dateLabel) photo.dateLabel = text(row.dateLabel);
    for (const source of row.sources) if (!photo.sources.some(item => item.kind === source.kind && item.id === source.id && item.postId === source.postId && item.conversationId === source.conversationId)) photo.sources.push({ ...source });
  }
  const created = photo => photo.sources.reduce((latest, row) => row.createdAt > latest ? row.createdAt : latest, '');
  return [...photos.values()].sort((a, b) => created(b).localeCompare(created(a)));
}

export function readAlbumPhotos(state, options) {
  return mergePhotos(state.albumPhotos || [], liveAlbumPhotos(state, options));
}

export function rememberAlbumPhotos(state, photos) {
  const albumPhotos = mergePhotos(state.albumPhotos || [], photos);
  return albumPhotos.length || state.albumPhotos ? { ...state, albumPhotos } : state;
}

export function preserveAlbumPhotos(current, next) {
  return rememberAlbumPhotos(next, liveAlbumPhotos(current, { includeUnavailable: true }));
}

export function findAlbumPhoto(state, path, options) {
  const normalized = albumPhotoKey(path);
  return readAlbumPhotos(state, options).find(photo => photo.path === normalized);
}
