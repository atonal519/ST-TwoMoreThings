import { findBlobEmoji } from './emojis.js';
import { phoneUrl } from './paths.js';

// 目录是贴纸身份与语义的唯一来源；消息只保存 id，不接受模型给出的远程图片地址。
const blob = [
  '1f600', '1f601', '1f602', '1f609', '1f60d', '1f618', '1f60e', '1f610',
  '1f612', '1f614', '1f622', '1f62d', '1f621', '1f631', '1f633', '1f634',
  '1f914', '1f644', '1f44d', '1f44e', '1f44b', '1f64f', '2764', '1f389',
];
const sepia = [['hello', '打招呼'], ['happy', '开心'], ['angry', '生气'], ['dizzy', '晕了'], ['sick', '不舒服'], ['point', '看这里']];
export const stickerPacks = [
  { id: 'blob', name: 'Blob Emoji', credit: 'Google / C1710 · Apache 2.0' },
  { id: 'sepia', name: 'Sepia', credit: 'David Revoy · CC-BY 4.0 / Framasky 整理' },
];
export const stickers = [
  ...blob.map(code => ({ id: `blob.${code}`, pack: 'blob', label: findBlobEmoji(code).label, file: `blob-${code}.svg` })),
  ...sepia.map(([code, label], index) => ({ id: `sepia.${code}`, pack: 'sepia', label, file: `sepia-${index}.png` })),
].map(item => ({ ...item, src: phoneUrl(`assets/stickers/${item.file}`) }));
export const findSticker = id => stickers.find(item => item.id === id);
export const stickerChoices = () => stickers.map(({ id, label }) => ({ id, meaning: label }));
