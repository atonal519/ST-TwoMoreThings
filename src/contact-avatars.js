import { avatarSource } from './profiles.js';
import { isCameoAvatar } from './cameo-avatar.js';

// 编辑器只投影预览，不把借用的千千结图片写回原始草稿。
export function readContactAvatarDraft(draft, current, bridge) {
  if (draft.automaticAvatar === false || draft.automaticAvatar !== true && draft.avatar !== (current?.avatar || '')) return draft;
  const person = { ...current, ...draft };
  if (draft.automaticAvatar === true) person.manualFields = (current?.manualFields || []).filter(key => key !== 'avatar');
  return readContactAvatars([person], bridge)[0];
}

// 千千结仍拥有头像；这里只为当前画面补充，不把图片复制进手机档案或作者包。
export function readContactAvatars(contacts, bridge) {
  if (!bridge?.getPeopleAvatars) return contacts;
  const candidates = contacts.filter(person => (!person.avatar || isCameoAvatar(person.avatar)) && !person.manualFields?.includes('avatar') && !(person.edited && !person.manualFields));
  if (!candidates.length) return contacts;
  const entityIds = new Map(candidates.filter(person => person.source?.kind === 'qqj' && person.source.entityId)
    .map(person => [person.id, person.source.entityId]));
  if (entityIds.size < candidates.length) {
    const snapshot = bridge.getPeopleSnapshot?.();
    const names = new Map();
    if (snapshot?.status === 'ready') {
      for (const person of snapshot.people?.items || []) {
        const name = person.displayName?.trim(), id = person.entityId;
        if (!name || !id) continue;
        names.set(name, !names.has(name) || names.get(name) === id ? id : null);
      }
      for (const person of candidates) {
        const id = names.get(person.name?.trim());
        if (!entityIds.has(person.id) && id) entityIds.set(person.id, id);
      }
    }
  }
  if (!entityIds.size) return contacts;
  const result = bridge.getPeopleAvatars([...new Set(entityIds.values())]);
  if (result?.status !== 'ready') return contacts;
  return contacts.map(person => {
    const id = entityIds.get(person.id), avatar = id && avatarSource(result.avatarsByEntityId?.[id]);
    return avatar ? { ...person, avatar } : person;
  });
}
