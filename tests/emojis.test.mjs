import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCardBody, renderAttachments } from '../src/ui/cards.js';
import { renderBilingual } from '../src/ui/shared.js';
import { normalizeContent, contextMessage } from '../src/content.js';
import { blobEmojis, splitEmojiText } from '../src/emojis.js';

test('bracketed basic emoji names render inline without changing saved text or context', () => {
  const message = normalizeContent({ text: '收到。[合十] [微笑] [表情：笑哭]', translation: 'Thanks. 🙏' });
  const before = structuredClone(message);
  const html = renderCardBody(message);
  assert.equal((html.match(/class="inline-emoji"/g) || []).length, 4);
  assert.match(html, /blob-1f64f\.svg/);
  assert.match(html, /alt="\[合十\]"/);
  assert.match(html, /blob-1f642\.svg/);
  assert.match(html, /blob-1f602\.svg/);
  assert.deepEqual(message, before);
  assert.equal(contextMessage(message).text, before.text);
});

test('Unicode emoji clusters stay intact and supported Blob faces replace whole clusters only', () => {
  const html = renderBilingual('😶‍🌫️ 🙏 👍🏽 👨‍👩‍👧‍👦 © 1️⃣', '【合十】');
  assert.equal((html.match(/class="inline-emoji"/g) || []).length, 3);
  assert.match(html, /blob-1f636-200d-1f32b\.svg/);
  assert.match(html, /👍🏽 👨‍👩‍👧‍👦 © 1️⃣/);
});

test('unknown bracketed text and HTML remain ordinary escaped text', () => {
  const html = renderBilingual('<img src=x onerror=alert(1)> [备注] [不存在的表情] [合十]');
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; \[备注\] \[不存在的表情\]/);
  assert.equal((html.match(/<img /g) || []).length, 1);
  assert.equal((html.match(/class="inline-emoji"/g) || []).length, 1);
});

test('the basic emoji picker inserts emoji and preserves the separate large sticker packs', () => {
  const ui = { attachment: 'stickers', stickerPack: 'emoji' }, contact = { id: 'lin' };
  const html = renderAttachments({}, ui, new Set(), contact, false);
  assert.ok((html.match(/data-inline-emoji=/g) || []).length >= 220);
  assert.match(html, /插入表情：合十/);
  assert.match(html, />小表情<\/button>/);
  assert.match(html, />Blob Emoji<\/button>/);
  assert.match(html, />Sepia<\/button>/);
});

test('every catalog name and glyph identifies exactly its own Blob image', () => {
  assert.equal(new Set(blobEmojis.map(item => item.code)).size, blobEmojis.length);
  for (const emoji of blobEmojis) {
    assert.equal(splitEmojiText(`[${emoji.label}]`)[0]?.emoji?.code, emoji.code, emoji.label);
    assert.equal(splitEmojiText(emoji.emoji)[0]?.emoji?.code, emoji.code, emoji.label);
  }
});
