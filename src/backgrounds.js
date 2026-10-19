// 预设编号随卡保存，图样由当前核心提供；上传图片仍使用宿主文件地址。
export const chatColors = [
  { id: 'cream', name: '米白', day: '#edece5', night: '#202d32' },
  { id: 'mist', name: '雾蓝', day: '#e0eaf0', night: '#18313e' },
  { id: 'sage', name: '浅绿', day: '#e4eadd', night: '#26362e' },
  { id: 'rose', name: '淡粉', day: '#f0e2e3', night: '#382d35' },
  { id: 'lilac', name: '灰紫', day: '#e8e3ef', night: '#2d2d40' },
  { id: 'slate', name: '深灰', day: '#343d43', night: '#172128' },
];

function glassArtwork(tones) {
  const [paper, accent, soft, line] = tones;
  const drawing = `<defs><radialGradient id="glow"><stop stop-color="${accent}"/><stop offset="1" stop-color="${paper}"/></radialGradient><filter id="f"><feGaussianBlur stdDeviation="28"/></filter></defs><g filter="url(#f)"><ellipse cx="385" cy="660" rx="260" ry="330" fill="url(#glow)"/><ellipse cx="35" cy="815" rx="220" ry="155" fill="${soft}"/></g><path d="M130 460 455 370 455 970 80 970Z" fill="${soft}" fill-opacity=".16" stroke="${line}" stroke-opacity=".35"/><path d="M200 430v460M285 410v480" stroke="${line}" stroke-opacity=".18"/>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="420" height="900" viewBox="0 0 420 900"><path fill="${paper}" d="M0 0h420v900H0z"/>${drawing}</svg>`)}`;
}

export const wallpaperPresets = [{
  id: 'glass-lake', name: '湖蓝玻璃',
  day: glassArtwork(['#e9f0ed', '#90bdc7', '#e8b9ab', '#d0dfd9']),
  night: glassArtwork(['#102b38', '#315e6b', '#8d676d', '#25434c']),
}];

export const wallpaperPreset = value => wallpaperPresets.find(item => `builtin:${item.id}` === value);
export function cleanBackground(value, chat = false) {
  const source = typeof value === 'string' ? value.trim() : '';
  if (!source || (chat ? chatColors.some(color => source === `color:${color.id}`) : wallpaperPreset(source))) return source;
  if (/^(?:https?:\/\/|\/(?!\/)|data:image\/(?:png|jpeg|webp|gif|avif);base64,)/i.test(source)) return source;
  throw new Error('背景图片地址无法使用，请重新选择图片。');
}

export function chatBackgroundStyle(value, theme) {
  const color = chatColors.find(item => value === `color:${item.id}`);
  if (color) return `background-color:${color[theme === 'night' ? 'night' : 'day']};--pp-chat-label:${color.id === 'slate' || theme === 'night' ? '#b8c6ce' : '#5f6d69'}`;
  // URL在保存与随卡导入时校验；JSON字符串编码避免图片地址破坏CSS属性。
  return value ? `background-image:url(${JSON.stringify(cleanBackground(value, true))});background-size:cover;background-position:center` : '';
}
