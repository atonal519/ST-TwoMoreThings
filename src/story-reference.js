export function normalizeStoryReferenceFloors(value) {
  if (typeof value !== 'number' && typeof value !== 'string' || typeof value === 'string' && !value.trim()) return undefined;
  const count = Number(value);
  return Number.isFinite(count) && Number.isInteger(count) && count >= 0 ? count : undefined;
}

export function readStoryReferenceFloors(state) {
  return normalizeStoryReferenceFloors(state?.storyReferenceFloors) ?? 1;
}
