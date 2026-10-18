// 目录是贴纸身份与语义的唯一来源；消息只保存 id，不接受模型给出的远程图片地址。
const blob = [
  ['1f600', '开心'], ['1f601', '笑嘻嘻'], ['1f602', '笑哭'], ['1f609', '眨眼'],
  ['1f60d', '喜欢'], ['1f618', '亲亲'], ['1f60e', '得意'], ['1f610', '无语'],
  ['1f612', '不满'], ['1f614', '失落'], ['1f622', '难过'], ['1f62d', '大哭'],
  ['1f621', '生气'], ['1f631', '惊吓'], ['1f633', '害羞'], ['1f634', '睡觉'],
  ['1f914', '思考'], ['1f644', '白眼'], ['1f44d', '赞同'], ['1f44e', '反对'],
  ['1f44b', '挥手'], ['1f64f', '拜托'], ['2764', '爱心'], ['1f389', '庆祝'],
];
const sepia = [['hello', '打招呼'], ['happy', '开心'], ['angry', '生气'], ['dizzy', '晕了'], ['sick', '不舒服'], ['point', '看这里']];
export const stickerPacks = [
  { id: 'blob', name: 'Blob Emoji', credit: 'Google / C1710 · Apache 2.0' },
  { id: 'sepia', name: 'Sepia', credit: 'David Revoy · CC-BY 4.0 / Framasky 整理' },
];
export const stickers = [
  ...blob.map(([code, label]) => ({ id: `blob.${code}`, pack: 'blob', label, file: `blob-${code}.svg` })),
  ...sepia.map(([code, label], index) => ({ id: `sepia.${code}`, pack: 'sepia', label, file: `sepia-${index}.png` })),
].map(item => ({ ...item, src: new URL(`../assets/stickers/${item.file}`, import.meta.url).href }));
export const findSticker = id => stickers.find(item => item.id === id);
export const stickerChoices = () => stickers.map(({ id, label }) => ({ id, meaning: label }));
