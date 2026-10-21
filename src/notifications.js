import { messageText } from './content.js';
import { getSocialAuthor } from './social.js';

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
    return [{ ...(author || { name: last.name || '有人' }), id: post.id, count: incoming.length, preview: last.text, createdAt: last.createdAt || '', isSocial: true }];
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function lockNotifications(state) {
  return [...unreadConversations(state), ...unreadSocialReplies(state)]
    .sort((a, b) => (b.createdAt || b.message?.createdAt || '').localeCompare(a.createdAt || a.message?.createdAt || ''));
}
