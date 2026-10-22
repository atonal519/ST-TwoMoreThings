export const displayName = person => person?.nickname || person?.name || '我';

export function avatarSource(value) {
  const source = String(value || '').trim();
  return /^(?:https?:\/\/|data:image\/(?:png|jpeg|webp|gif|avif);base64,|data:image\/svg\+xml(?:;charset=utf-8)?(?:;base64)?,)/i.test(source) ? source : '';
}

export function cleanProfile(draft, contact = false) {
  const text = key => String(draft[key] || '').trim();
  if (!text('name')) throw new Error('请填写姓名。');
  if (text('avatar') && !avatarSource(draft.avatar)) throw new Error('头像地址需使用 http 或 https，也可以选择本地图片。');
  return { name: text('name'), nickname: text('nickname'), avatar: avatarSource(draft.avatar),
    ...(contact ? { expression: text('expression'), language: text('language') } : {}),
  };
}
