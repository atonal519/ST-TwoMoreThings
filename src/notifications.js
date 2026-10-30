import { messageText } from './content.js';
import { getSocialAuthor } from './social.js';
import { displayName } from './profiles.js';
import { savedPublication } from './social-time.js';

const string = value => typeof value === 'string' ? value.trim() : '';
export const notificationEventKey = (kind, id, ids) => JSON.stringify([kind, id || '', ids]);
const addedRows = (previous = [], next = []) => { const ids = new Set(previous.map(row => row.id).filter(Boolean)); return next.filter(row => row.id && !ids.has(row.id)); };
const body = row => {
  const original = string(row.text || row.content || row.image?.description), translation = string(row.translation || row.contentTranslation);
  return [original, translation && translation !== original ? translation : ''].filter(Boolean).join('\n');
};
function snapshot(kind, id, ids, title, row, app, createdAt) {
  return { key: notificationEventKey(kind, id, ids), kind, app, id: id || '', title: string(title) || '新通知', text: body(row) || '点击查看', timeLabel: savedPublication(row), createdAt };
}
function messageSnapshots(state, id, rows, createdAt) {
  const person = [...(state.contacts || []), ...(state.groups || [])].find(item => item.id === id);
  return person ? rows.filter(row => row.id && row.role === 'assistant').map(row => snapshot('message', id, [row.id], displayName(person), { ...row, text: messageText(row) }, 'messages', createdAt || row.createdAt || '')) : [];
}
function socialReplySnapshots(state, post, rows, createdAt) {
  return rows.filter(row => row.id && row.replyToId && row.role !== 'user' && !row.userAuthored).map(row => {
    const author = row.authorId ? getSocialAuthor(state, row.authorId) : null;
    return snapshot('social-reply', post.id, [row.id], author ? displayName(author) : row.name || '有人', row, 'social', createdAt || row.createdAt || '');
  });
}

export function initializeNotificationHistory(state) {
  if (state.notifications?.initialized === true) return state;
  const messages = [...(state.contacts || []), ...(state.groups || [])].flatMap(person => messageSnapshots(state, person.id, (state.conversations?.[person.id] || []).filter(row => row.read === false)));
  const replies = (state.social?.posts || []).flatMap(post => socialReplySnapshots(state, post, (post.comments || []).filter(row => row.read === false)));
  return { ...state, notifications: { initialized: true, items: [...messages, ...replies].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) } };
}

// Each descriptor belongs to the same save as its source content. Only this local
// before/after slice supplies event IDs; clear never needs an eternal seen list.
export function archiveNotifications(previous, next, descriptors = []) {
  const history = initializeNotificationHistory(previous).notifications, records = [], createdAt = new Date().toISOString();
  for (const { kind, id = '' } of descriptors.filter(Boolean)) {
    if (kind === 'message') { records.push(...messageSnapshots(next, id, addedRows(previous.conversations?.[id], next.conversations?.[id]), createdAt)); continue; }
    if (kind === 'social-reply') {
      const before = previous.social?.posts?.find(post => post.id === id), after = next.social?.posts?.find(post => post.id === id);
      if (after) records.push(...socialReplySnapshots(next, after, addedRows(before?.comments, after.comments), createdAt));
      continue;
    }
    let rows = [], title = '', app = kind.startsWith('social') ? 'social' : kind.startsWith('forum') ? 'forum' : 'liangshi';
    if (kind === 'social-feed' || kind === 'social-author') {
      rows = addedRows(previous.social?.posts, next.social?.posts).filter(post => (kind !== 'social-author' || post.authorId === id) && getSocialAuthor(next, post.authorId));
      const author = kind === 'social-author' && getSocialAuthor(next, id); title = author ? `${displayName(author)}的动态已更新` : 'ainstgram已更新';
    } else if (kind === 'forum') { rows = addedRows(previous.forum?.posts, next.forum?.posts); title = '论坛有新内容'; }
    else if (kind === 'forum-post') { const before = previous.forum?.posts?.find(post => post.id === id), after = next.forum?.posts?.find(post => post.id === id); rows = addedRows(before?.comments, after?.comments).filter(row => !row.userAuthored); title = '论坛有新回帖'; }
    else if (kind === 'liangshi-hot') { rows = addedRows(previous.liangshi?.topics, next.liangshi?.topics).map(row => ({ ...row, text: row.name, translation: row.nameTranslation })); title = '两事热榜已更新'; }
    else if (kind === 'liangshi-post') {
      const before = previous.liangshi?.posts?.find(post => post.id === id), after = next.liangshi?.posts?.find(post => post.id === id);
      if (after) {
        rows = [...addedRows(before?.comments, after.comments), ...addedRows(before?.reposts, after.reposts)].filter(row => !row.userAuthored);
      }
      title = '微博有新讨论';
    } else if (['liangshi-feed', 'liangshi-following', 'liangshi-topic'].includes(kind)) {
      const data = next.liangshi || {}, ids = kind === 'liangshi-following' ? data.followingFeedIds : kind === 'liangshi-topic' ? data.topics?.find(topic => topic.id === id)?.postIds : data.feedIds;
      rows = addedRows(previous.liangshi?.posts, data.posts).filter(post => ids?.includes(post.id)); title = kind === 'liangshi-following' ? '关注微博已更新' : kind === 'liangshi-topic' ? '话题微博已更新' : '两事广场已更新';
    }
    if (rows.length) { const row = rows.at(-1); records.push(snapshot(kind, id, rows.map(row => row.id), title, row, app, createdAt)); }
  }
  const keys = new Set(history.items.map(row => row.key)), added = records.filter(row => { if (keys.has(row.key)) return false; keys.add(row.key); return true; });
  return { state: { ...next, notifications: { initialized: true, items: [...added].reverse().concat(history.items) } }, records: added };
}

export function unreadConversations(state) {
  return [...(state.contacts || []), ...(state.groups || [])].flatMap(person => {
    const messages = state.conversations[person.id] || [];
    const incoming = messages.filter(message => message.role === 'assistant' && message.read === false);
    const last = incoming.at(-1);
    return last ? [{ ...person, count: incoming.length, message: last, preview: messageText(last), isGroup: Boolean(person.memberIds) }] : [];
  }).sort((a, b) => (b.message.createdAt || '').localeCompare(a.message.createdAt || ''));
}

export function unreadSocialReplies(state) {
  return (state.social?.posts || []).flatMap(post => {
    const incoming = (post.comments || []).filter(comment => comment.replyToId && comment.read === false);
    const last = incoming.at(-1);
    if (!last) return [];
    const author = last.authorId ? getSocialAuthor(state, last.authorId) : null;
    return [{ ...(author || { name: last.name || '有人' }), id: post.id, count: incoming.length, preview: last.text, createdAt: last.createdAt || '', isSocial: true,
      ...(last.id ? { notificationKey: notificationEventKey('social-reply', post.id, [last.id]) } : {}) }];
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function lockNotifications(state) {
  if (state.notifications?.initialized) {
    const keys = new Set(state.notifications.items.map(record => record.key));
    state = { ...state, conversations: Object.fromEntries(Object.entries(state.conversations || {}).map(([id, rows]) => [id, rows.filter(row => keys.has(notificationEventKey('message', id, [row.id])))])),
      ...(state.social ? { social: { ...state.social, posts: (state.social.posts || []).map(post => ({ ...post, comments: (post.comments || []).filter(row => keys.has(notificationEventKey('social-reply', post.id, [row.id]))) })) } } : {}) };
  }
  return [...unreadConversations(state).map(item => ({ ...item, ...(item.message.id ? { notificationKey: notificationEventKey('message', item.id, [item.message.id]) } : {}) })), ...unreadSocialReplies(state)]
    .sort((a, b) => (b.createdAt || b.message?.createdAt || '').localeCompare(a.createdAt || a.message?.createdAt || ''));
}
