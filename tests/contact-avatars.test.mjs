import test from 'node:test';
import assert from 'node:assert/strict';
import { readContactAvatars } from '../src/contact-avatars.js';

const portrait = 'data:image/png;base64,cG9ydHJhaXQ=';

test('bound contacts read one avatar batch without a people snapshot or changing the saved profile', () => {
  const contact = Object.freeze({ id: 'phone-id', name: '林舟', source: Object.freeze({ kind: 'qqj', entityId: 'person-id' }) });
  const contacts = Object.freeze([contact]);
  let reads = 0;
  const result = readContactAvatars(contacts, {
    getPeopleSnapshot() { throw new Error('bound contacts do not need the full people list'); },
    getPeopleAvatars(ids) {
      reads++;
      assert.deepEqual(ids, ['person-id']);
      return { status: 'ready', avatarsByEntityId: { 'person-id': portrait } };
    },
  });
  assert.equal(result[0].avatar, portrait);
  assert.equal(result[0].source, contact.source);
  assert.equal(contact.avatar, undefined);
  assert.equal(reads, 1);
});

test('unbound contacts match only a unique exact name and never override an explicit entity with a namesake', () => {
  const contacts = [
    { id: 'unique', name: '许知' }, { id: 'duplicate', name: '同名人物' }, { id: 'missing', name: '未建档' },
    { id: 'explicit', name: '许知', source: { kind: 'qqj', entityId: 'unknown-id' } },
    { id: 'card', name: '许知', source: { kind: 'card', entityId: 'author-library-id' } },
  ];
  const items = Array.from({ length: 1000 }, (_, index) => ({ entityId: `extra-${index}`, displayName: `其他人物${index}` }));
  items.push({ entityId: 'xu-id', displayName: '许知' }, { entityId: 'same-1', displayName: '同名人物' }, { entityId: 'same-2', displayName: '同名人物' });
  let peopleReads = 0, avatarReads = 0;
  const result = readContactAvatars(contacts, {
    getPeopleSnapshot() { peopleReads++; return { status: 'ready', people: { items } }; },
    getPeopleAvatars(ids) {
      avatarReads++;
      assert.deepEqual(new Set(ids), new Set(['unknown-id', 'xu-id']));
      assert.equal(ids.length, 2, 'same matched entity is requested only once');
      return { status: 'ready', avatarsByEntityId: { 'unknown-id': null, 'xu-id': portrait } };
    },
  });
  assert.deepEqual(result.map(person => person.avatar), [portrait, undefined, undefined, undefined, portrait]);
  assert.equal(peopleReads, 1);
  assert.equal(avatarReads, 1);
  assert.equal(contacts.some(person => 'avatar' in person), false);
});

test('manual portraits and an explicit manual clearing retain ownership without requesting a fallback', () => {
  const contacts = [
    { id: 'portrait', avatar: 'https://example.invalid/manual.png' },
    { id: 'cleared', avatar: '', manualFields: ['avatar'] },
    { id: 'legacy', name: '旧版手工资料', edited: true },
  ];
  const result = readContactAvatars(contacts, { getPeopleAvatars() { throw new Error('manual avatars stay local'); } });
  assert.equal(result, contacts);
});

test('missing, unready or empty avatar sources stay empty and are read again on the next normal render', () => {
  const contacts = [{ id: 'person', source: { kind: 'qqj', entityId: 'person-id' } }];
  assert.equal(readContactAvatars(contacts, null), contacts);
  assert.equal(readContactAvatars(contacts, { getPeopleSnapshot() { throw new Error('old bridge has no avatar capability'); } }), contacts);
  for (const status of ['not-ready', 'disabled', 'error']) {
    assert.equal(readContactAvatars(contacts, { getPeopleAvatars: () => ({ status, avatarsByEntityId: { 'person-id': portrait } }) }), contacts);
  }
  assert.equal(readContactAvatars(contacts, { getPeopleAvatars: () => ({ status: 'ready', avatarsByEntityId: { 'person-id': null } }) })[0], contacts[0]);
  assert.equal(readContactAvatars(contacts, { getPeopleAvatars: () => ({ status: 'ready', avatarsByEntityId: { 'person-id': portrait } }) })[0].avatar, portrait);
  assert.equal(contacts[0].avatar, undefined);
});
