import { Avatar, Style } from './vendor/dicebear/core.js';
import cameo from './vendor/dicebear/cameo.js';

const style = new Style(cameo);
const heads = Object.keys(cameo.components.shape.variants).filter(name => name !== 'taper');
const svgStart = '<svg data-tmt-avatar="cameo" ';
const uriStart = 'data:image/svg+xml;charset=utf-8,';
const cameoStart = uriStart + encodeURIComponent(svgStart);

// 来源随唯一头像字符串保存；千千结可以替换画面，手工图片或清空仍拥有优先权。
export const isCameoAvatar = value => typeof value === 'string' && value.startsWith(cameoStart);

export function createCameoAvatar(seed = globalThis.crypto.randomUUID()) {
  const svg = new Avatar(style, { seed, shapeVariant: heads }).toString().replace('<svg ', svgStart);
  return uriStart + encodeURIComponent(svg);
}
