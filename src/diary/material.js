import { diaryOwners } from './store.js';
import { identityOwnerId, identityProfile } from '../identities.js';

export function diaryActorId(state, owner, bridge) {
  const profile = identityProfile(state, owner);
  if (profile.source?.kind === 'qqj' && profile.source.entityId) return profile.source.entityId;
  if (!['card', 'story', 'inspection'].includes(profile.source?.kind)) return undefined;
  const ownerId = identityOwnerId(state, owner.id), owners = diaryOwners(state);
  const nameOf = person => state.contacts.find(row => row.id === identityOwnerId(state, person.id))?.name || person.name;
  const name = nameOf(owner);
  // A name can discover unclaimed material, never borrow another stable owner's identity.
  if (owners.some(person => identityOwnerId(state, person.id) !== ownerId && nameOf(person) === name)) return undefined;
  const snapshot = bridge?.getPeopleSnapshot?.();
  if (snapshot?.status !== 'ready') return undefined;
  const matches = (snapshot.people?.items || []).filter(person => person.displayName === name);
  if (matches.length !== 1 || matches[0].specialRole === 'user') return undefined;
  const entityId = matches[0].entityId;
  if (state.contacts.some(person => identityOwnerId(state, person.id) !== ownerId && person.source?.kind === 'qqj' && person.source.entityId === entityId)) return undefined;
  return entityId;
}
