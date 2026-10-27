import { blobEmojiData } from './emoji-data.js';
import { phoneUrl } from './paths.js';

// 大贴纸和行内表情引用同一份 Blob 图片；消息仍保存原文字，不保存图片副本。
export const blobEmojis = blobEmojiData.map(([code, label, emoji, aliases]) => ({
  code, label, emoji, aliases, src: phoneUrl(`assets/stickers/blob-${code}.svg`),
}));
const byCode = new Map(blobEmojis.map(item => [item.code, item]));
const byGlyph = new Map(blobEmojis.map(item => [item.emoji.replaceAll('\ufe0f', ''), item]));
const byName = new Map(blobEmojis.map(item => [item.label, item]));
for (const item of blobEmojis) for (const alias of item.aliases) if (!byName.has(alias)) byName.set(alias, item);
const graphemes = new Intl.Segmenter('und', { granularity: 'grapheme' });
const shortcodes = /\[(?:表情[:：]\s*)?([^\[\]\r\n]{1,24})\]|【(?:表情[:：]\s*)?([^【】\r\n]{1,24})】/gu;

export const findBlobEmoji = code => byCode.get(code);
export const emojiChoices = () => blobEmojis.map(item => item.label);

export function splitEmojiText(value) {
  const text = String(value ?? ''), parts = [];
  const append = (text, emoji) => {
    if (!text) return;
    const last = parts.at(-1);
    if (!emoji && last && !last.emoji) last.text += text;
    else parts.push({ text, ...(emoji ? { emoji } : {}) });
  };
  function appendUnicode(text) {
    if (!/\p{Extended_Pictographic}/u.test(text)) { append(text); return; }
    // 按完整字素查目录，不把未收录的肤色、组合人物或文字样式拆成零碎图片。
    for (const { segment } of graphemes.segment(text)) {
      append(segment, segment.includes('\ufe0e') ? undefined : byGlyph.get(segment.replaceAll('\ufe0f', '')));
    }
  }
  let start = 0;
  for (const match of text.matchAll(shortcodes)) {
    appendUnicode(text.slice(start, match.index));
    append(match[0], byName.get((match[1] || match[2]).trim()));
    start = match.index + match[0].length;
  }
  appendUnicode(text.slice(start));
  return parts;
}
