import { inspectionOwners } from '../inspect-phone.js';

export const diaryOwners = state => inspectionOwners(state).filter(person => !person.needsName && typeof person.name === 'string' && person.name.trim());
export function assertDiaryOwner(state, ownerId) {
  const owner = diaryOwners(state).find(person => person.id === ownerId);
  if (!owner) throw new Error('请选择已有姓名的日记主人。');
  return owner;
}
export function assertDiaryMode(mode) {
  if (!['finished', 'draft'].includes(mode)) throw new Error('请选择日记或废稿。');
}
export function diaryEntries(state, ownerId, mode = 'finished') {
  assertDiaryMode(mode);
  if (!diaryOwners(state).some(person => person.id === ownerId)) return [];
  const entries = state.diary?.owners?.[ownerId]?.[mode];
  return Array.isArray(entries) ? entries : [];
}
export function appendDiaryEntry(state, ownerId, mode, entry) {
  assertDiaryOwner(state, ownerId); assertDiaryMode(mode);
  const domain = state.diary || { owners: {} }, owner = domain.owners?.[ownerId] || {};
  return { ...state, diary: { ...domain, owners: { ...domain.owners, [ownerId]: { ...owner, [mode]: [...diaryEntries(state, ownerId, mode), entry] } } } };
}
export function diaryHistory(state, ownerId, mode) {
  const project = rows => rows.map(({ title, text, translation, titleTranslation, storyDate, timeLabel }) => ({ title, text, ...(translation ? { translation } : {}), ...(titleTranslation ? { titleTranslation } : {}), storyDate, timeLabel }));
  return { finished: project(diaryEntries(state, ownerId)), ...(mode === 'draft' ? { draft: project(diaryEntries(state, ownerId, 'draft')) } : {}) };
}
