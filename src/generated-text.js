import { splitEmojiText } from './emojis.js';

const graphemes = new Intl.Segmenter('und', { granularity: 'grapheme' });
const endsEmoji = text => Boolean(splitEmojiText(text).at(-1)?.emoji) || /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test([...graphemes.segment(text)].at(-1)?.segment || '');
function finishParagraph(value) {
  const text = value.trimEnd();
  if (!/[\p{L}]/u.test(text) || /(?:[a-z][a-z\d+.-]*:\/\/|mailto:|www\.)\S+$/i.test(text)) return value;
  let ending = text;
  while (/[”’"'」』）)\]】》〉]$/u.test(ending)) { if (endsEmoji(ending)) return value; ending = ending.slice(0, -1); }
  if (/[。.!！?？…，,；;：:、〜～~—–-]$/u.test(ending) || endsEmoji(ending)) return value;
  return text + (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text) ? '。' : '.') + value.slice(text.length);
}

// Only model consumers opt into this; user input and canonical history never pass here.
export const finishGeneratedText = (value, { preserveStyle = false } = {}) => typeof value === 'string' ? preserveStyle ? value : value.split(/(\n[\t ]*\n)/).map((part, index) => index % 2 ? part : finishParagraph(part)).join('') : '';

// The supplied reference lets the model decide style; it is not a punctuation exemption.
export const hasStyleReference = profile => ['personality', 'expression', 'language', 'description', 'related'].some(key => typeof profile?.[key] === 'string' && profile[key].trim());
