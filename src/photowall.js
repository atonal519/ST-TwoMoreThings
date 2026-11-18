import { albumPhotoKey } from './album.js';

export function readPhotoWall(state) {
  const wall = { schemes: [], photos: [], activeSchemeId: '', desktopPhotoId: '', ...state.photoWall };
  const photos = wall.photos.filter(photo => !photo.missing);
  return photos.length === wall.photos.length ? wall : { ...wall, photos, desktopPhotoId: photos.some(photo => photo.id === wall.desktopPhotoId) ? wall.desktopPhotoId : '' };
}
export const characterKey = person => JSON.stringify([person.name, person.scope || '']);

// 桌面只读已保存指针或旧墙图，避免常规重绘遍历整份相册来源。
export function readPhotoWallImage(state) {
  const wall = readPhotoWall(state);
  if (Object.hasOwn(wall, 'desktopPhotoPath')) {
    const path = albumPhotoKey(wall.desktopPhotoPath);
    return path ? { path, description: wall.desktopPhotoDescription || '照片墙', ...(wall.desktopPhotoCrop ? { crop: wall.desktopPhotoCrop } : {}) } : null;
  }
  const photo = wall.photos.find(row => row.id === wall.desktopPhotoId);
  return photo ? { path: photo.path, description: photo.people?.length ? `${photo.people.map(person => person.name).join(' 与 ')} · 合照` : photo.description || '照片墙' } : null;
}
