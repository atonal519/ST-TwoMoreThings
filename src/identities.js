// Account IDs remain public identities. Ownership is a manual, private reference
// used only for a person's own material and permission comparisons.
export function identityOwnerId(state, id) {
  if (id === '@user') return id;
  const person = (state.contacts || []).find(item => item.id === id), owner = person?.identityOwnerId;
  return owner === '@user' || owner && owner !== id && (state.contacts || []).some(item => item.id === owner && !item.identityOwnerId) ? owner : id;
}
export const isUserIdentity = (state, id) => identityOwnerId(state, id) === '@user';
export function identityProfile(state, person) {
  const owner = identityOwnerId(state, person.id);
  if (owner === person.id) return person;
  const main = (state.contacts || []).find(item => item.id === owner);
  return { ...person, personality: main?.personality || '', source: main?.source };
}
export const identitySnapshot = (state, ids) => new Map(ids.map(id => [id, identityOwnerId(state, id)]));
export const sameIdentity = (state, id, snapshot) => !snapshot?.has(id) || snapshot.get(id) === identityOwnerId(state, id);
export function assertIdentitySnapshot(state, snapshot) {
  if (snapshot && [...snapshot.keys()].some(id => !sameIdentity(state, id, snapshot))) throw new Error('账号归属已更改，本次回复未保存。');
}
// Request-local dependencies are deliberately excluded from JSON/model payloads.
export const identitySource = Symbol('phone identity source');
export function withIdentitySource(context, state, ids) {
  const referenced = (context.phoneContext || []).filter(row => row.source?.app === 'messages').flatMap(row => {
    const quote = row.replyTo && !row.replyTo.missing ? (state.conversations[row.conversationId] || []).find(message => message.id === row.replyTo.messageId) : undefined;
    const group = quote && !Object.hasOwn(quote, 'knownToIds') ? (state.groups || []).find(item => item.id === row.conversationId) : undefined;
    const quotedScope = Array.isArray(quote?.knownToIds) ? quote.knownToIds : group ? [...group.memberIds, ...(group.userIsMember ? ['@user'] : [])] : [];
    return [row.author?.id, ...(row.knownToIds || []), ...quotedScope];
  }).filter(Boolean);
  Object.defineProperty(context, identitySource, { value: identitySnapshot(state, [...new Set([...ids, ...referenced])]) });
  return context;
}

export function assignIdentityOwner(state, id, selection, original = state) {
  if (selection && selection !== '@user' && !(original.contacts || []).some(person => person.id === selection)) throw new Error('所属人物已不存在，请重新选择。');
  const owner = selection ? identityOwnerId(original, selection) : id;
  return state.contacts.map(person => {
    if (person.id !== id && !(owner !== id && person.identityOwnerId === id)) return person;
    const { identityOwnerId: previous, ...rest } = person;
    return { ...rest, ...(owner !== person.id ? { identityOwnerId: owner } : {}), manualFields: [...new Set([...(person.manualFields || []), 'identityOwnerId'])] };
  });
}
