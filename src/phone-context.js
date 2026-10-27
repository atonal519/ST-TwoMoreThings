import { contextMessage } from './content.js';
import { partitionHistory } from './timeline.js';
import { fitRows } from './context-budget.js';
import { identityOwnerId } from './identities.js';

export const groupAudience = group => [...new Set([...(group.memberIds || []), ...(group.userIsMember ? ['@user'] : [])])];
export const messageAudience = (message, group) => Object.hasOwn(message, 'knownToIds') ? Array.isArray(message.knownToIds) ? message.knownToIds : [] : groupAudience(group);

// A missing legacy scope uses the present roster; an explicit empty scope stays empty.
export function readableGroupMessages(state, group, targetIds) {
  if (!targetIds.length) return [];
  return (state.conversations[group.id] || []).filter(message => {
    const audience = messageAudience(message, group);
    const owners = new Set(audience.map(id => identityOwnerId(state, id)));
    return targetIds.every(id => owners.has(identityOwnerId(state, id)));
  });
}

const name = person => person?.nickname || person?.name || '';
const time = item => item.publishedAt || [item.storyDate, item.timeLabel].filter(Boolean).join(' ') || item.createdAt || '';

// No writes, identity inference, file paths, or private-source expansion. Permissions
// precede relationship ranking; the budget counts the actual complete JSON records.
export function readPhoneContext(state, { anchor, targetIds = [], publicOnly = false, excludeApps = [], excludeConversationId, budget = 6000, limit = 20, defaultUser = '' } = {}) {
  const people = new Map((state.contacts || []).map(person => [person.id, person]));
  const targets = [...new Set(targetIds)];
  const targetOwners = new Set(targets.map(id => identityOwnerId(state, id)));
  const onlyPublic = publicOnly || !targets.length || targets.some(id => id !== '@user' && !people.has(id));
  const excluded = new Set(excludeApps), candidates = [];
  const person = id => ({ id, name: id === '@user' ? name(state.userProfile) || defaultUser || '我' : name(people.get(id)), ...(id === '@user' || people.has(id) ? { personId: id } : {}) });
  const add = (app, kind, id, author, text, extra = {}, related = [], createdAt = '') => {
    if (excluded.has(app) || !text) return;
    const row = { source: { app, kind, id, ...(extra.parentId ? { parentId: extra.parentId } : {}) }, author, text,
      visibility: extra.knownToIds ? 'members' : 'public', ...extra };
    delete row.parentId;
    const rank = author.personId && targetOwners.has(identityOwnerId(state, author.personId)) ? 0 : related.some(id => targetOwners.has(identityOwnerId(state, id))) ? 1 : 2;
    candidates.push({ row, rank: onlyPublic ? 2 : rank, index: candidates.length, createdAt: typeof createdAt === 'string' ? createdAt : '' });
  };
  if (!onlyPublic && !excluded.has('messages')) {
    const threads = [
      ...(state.contacts || []).map(contact => ({ id: contact.id, kind: 'private', knownToIds: ['@user', contact.id] })),
      ...(state.groups || []).map(group => ({ id: group.id, kind: 'group', group })),
    ];
    for (const thread of threads) {
      if (thread.id === excludeConversationId) continue;
      if (!thread.group && !targets.every(id => thread.knownToIds.some(member => identityOwnerId(state, member) === identityOwnerId(state, id)))) continue;
      const qualified = thread.group ? readableGroupMessages(state, thread.group, targets) : state.conversations[thread.id] || [];
      const stable = partitionHistory(qualified, anchor).past.flatMap(batch => batch.messages);
      for (const message of stable.slice(-8)) {
        const content = contextMessage(message, stable), { role, speakerId, ...body } = content;
        const authorId = speakerId || (role === 'user' ? '@user' : thread.id);
        add('messages', thread.kind, message.id, person(authorId), body.text, { ...body, conversationId: thread.id,
          knownToIds: thread.group ? messageAudience(message, thread.group) : thread.knownToIds,
          time: time(message), ...(message.batch ? { sourceBatch: message.batch } : {}) }, thread.group ? messageAudience(message, thread.group) : thread.knownToIds, message.createdAt);
      }
    }
  }
  if (!excluded.has('social')) {
    const authors = new Map([...(state.social?.npcs || []).map(author => [author.id, { id: author.id, name: name(author) }]), ...[...people.values()].map(author => [author.id, person(author.id)])]);
    for (const post of state.social?.posts || []) {
      const author = authors.get(post.authorId); if (!author) continue;
      const commenters = (post.comments || []).map(row => row.role === 'user' ? '@user' : authors.get(row.authorId)?.personId).filter(Boolean);
      add('social', 'post', post.id, author, post.text || (post.image?.description ? '[图片]' : ''), {
        ...(post.translation ? { translation: post.translation } : {}), ...(post.image?.description ? { image: { description: post.image.description } } : {}), time: time(post) }, commenters, post.createdAt);
      for (const [index, comment] of (post.comments || []).entries()) {
        const commenter = comment.role === 'user' ? person('@user') : authors.get(comment.authorId) || { ...(comment.authorId ? { id: comment.authorId } : {}), name: comment.name || '' };
        add('social', 'comment', comment.id || `${post.id}:comment:${index}`, commenter, comment.text, { parentId: post.id,
          ...(comment.translation ? { translation: comment.translation } : {}), ...(comment.replyToId ? { replyToId: comment.replyToId } : {}), time: time(comment) }, [author.personId].filter(Boolean), comment.createdAt);
      }
    }
  }
  if (!excluded.has('liangshi')) {
    const authors = new Map((state.liangshi?.accounts || []).map(account => [account.id, { id: account.id, name: account.ownerId === '@user' ? name(state.userProfile) || defaultUser || account.name || '' : account.name || '', ...(account.handle ? { handle: account.handle } : {}),
      ...(account.ownerId === '@user' ? { personId: '@user' } : account.handle && people.has(account.contactId) ? { personId: account.contactId } : {}) }]));
    for (const post of state.liangshi?.posts || []) {
      const author = authors.get(post.authorId); if (!author) continue;
      const related = [...(post.comments || []), ...(post.reposts || [])].map(row => authors.get(row.authorId)?.personId).filter(Boolean);
      add('liangshi', 'post', post.id, author, post.text || (post.image?.description ? '[图片]' : ''), { time: time(post),
        ...(post.editedAt ? { editedAt: post.editedAt } : {}),
        ...(post.translation ? { translation: post.translation } : {}), ...(post.image?.description ? { image: { description: post.image.description } } : {}), ...(post.quoteId ? { quoteId: post.quoteId } : {}) }, related, post.createdAt);
      for (const kind of ['comments', 'reposts']) for (const [index, comment] of (post[kind] || []).entries()) {
        const commenter = authors.get(comment.authorId); if (!commenter) continue;
        add('liangshi', kind === 'comments' ? 'comment' : 'repost', comment.id || `${post.id}:${kind}:${index}`, commenter, comment.text || (comment.image?.description ? '[图片]' : ''), { parentId: post.id,
          ...(comment.image?.description ? { image: { description: comment.image.description } } : {}),
          ...(comment.translation ? { translation: comment.translation } : {}), ...(comment.quoteId ? { quoteId: comment.quoteId } : {}),
          ...(comment.replyToId ? { replyToId: comment.replyToId, ...(authors.has(comment.replyToAuthorId) ? { replyToAuthor: authors.get(comment.replyToAuthorId) } : {}) } : {}), time: time(comment) }, [author.personId, authors.get(comment.replyToAuthorId)?.personId].filter(Boolean), comment.createdAt);
      }
    }

  }
  if (!excluded.has('forum')) for (const post of state.forum?.posts || []) {
    add('forum', 'post', post.id, { name: post.author }, post.content || (post.image?.description ? '[图片]' : ''), { title: post.title, time: time(post),
      ...(post.image?.description ? { image: { description: post.image.description } } : {}),
      ...(post.titleTranslation ? { titleTranslation: post.titleTranslation } : {}), ...(post.contentTranslation ? { translation: post.contentTranslation } : {}) }, [], post.createdAt);
    for (const [index, comment] of (post.comments || []).entries()) add('forum', 'comment', comment.id || `${post.id}:comment:${index}`, { name: comment.author }, comment.text || (comment.image?.description ? '[图片]' : ''),
      { parentId: post.id, time: time(comment), ...(comment.image?.description ? { image: { description: comment.image.description } } : {}), ...(comment.translation ? { translation: comment.translation } : {}), ...(comment.replyToId ? { replyToId: comment.replyToId } : {}) }, [], comment.createdAt);
  }
  const newest = (a, b) => String(b.row.time).localeCompare(String(a.row.time), undefined, { numeric: true }) || b.createdAt.localeCompare(a.createdAt) || b.index - a.index;
  const window = candidates.sort(newest).slice(0, 20);
  window.sort((a, b) => a.rank - b.rank || newest(a, b));
  return fitRows(window.map(item => item.row), { limit, budget });
}
