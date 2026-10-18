import { messageText } from './content.js';

export function unreadConversations(state) {
  return [...(state.contacts || []), ...(state.groups || [])].flatMap(person => {
    const messages = state.conversations[person.id] || [];
    const incoming = messages.filter(message => message.role === 'assistant' && message.read === false);
    const last = incoming.at(-1);
    return last ? [{ ...person, count: incoming.length, message: last, preview: messageText(last), isGroup: Boolean(person.memberIds) }] : [];
  }).sort((a, b) => (b.message.createdAt || '').localeCompare(a.message.createdAt || ''));
}
