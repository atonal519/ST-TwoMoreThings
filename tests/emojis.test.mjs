import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCardBody, renderAttachments } from '../src/ui/cards.js';
import { renderBilingual, renderEmojiText, renderMentionText } from '../src/ui/shared.js';
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

test('saved full Blob IDs render inline while independent large stickers keep their rendering', () => {
  const message = normalizeContent({ text: '测试[blob.1f602]' });
  const before = structuredClone(message);
  const html = renderCardBody(message);
  assert.match(html, /测试<img class="inline-emoji"[^>]+blob-1f602\.svg/);
  assert.match(html, /alt="\[blob\.1f602\]"/);
  assert.deepEqual(message, before);
  assert.equal(contextMessage(message).text, '测试[blob.1f602]');
  const sticker = { type: 'sticker', stickerId: 'blob.1f602', text: '[笑哭]' };
  const large = renderCardBody(sticker);
  assert.match(large, /^<img src="[^">]+blob-1f602\.svg"/);
  assert.equal(large.includes('inline-emoji'), false);
  assert.deepEqual(sticker, { type: 'sticker', stickerId: 'blob.1f602', text: '[笑哭]' });
});

test('full Blob IDs share inline and mention renderers without consuming unknown pack IDs or markup', () => {
  const input = '<b>@林舟</b> [blob.1f602]【blob.1f441-200d-1f5e8】[表情：blob.1f64f][笑哭]😂 👍🏽 ❤︎ 👨‍👩‍👧‍👦';
  for (const html of [renderEmojiText(input), renderMentionText(input, [{ name: '林舟' }])]) {
    assert.equal((html.match(/class="inline-emoji"/g) || []).length, 5);
    assert.match(html, /blob-1f441-200d-1f5e8\.svg/);
    assert.match(html, /&lt;b&gt;/);
    assert.match(html, /&lt;\/b&gt;/);
    assert.match(html, /👍🏽 ❤︎ 👨‍👩‍👧‍👦/);
  }
  assert.match(renderMentionText(input, [{ name: '林舟' }]), /<mark class="message-mention">@林舟<\/mark>/);
  const unknown = '[blob.unknown][blob.1F602][blob.1f602-extra][sepia.hello]【other.1f602】[1f602]';
  assert.equal(renderEmojiText(unknown), unknown);
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

test('every catalog name, glyph and full Blob ID identifies exactly its own Blob image', () => {
  assert.equal(new Set(blobEmojis.map(item => item.code)).size, blobEmojis.length);
  for (const emoji of blobEmojis) {
    assert.equal(splitEmojiText(`[${emoji.label}]`)[0]?.emoji?.code, emoji.code, emoji.label);
    assert.equal(splitEmojiText(emoji.emoji)[0]?.emoji?.code, emoji.code, emoji.label);
    for (const shortcode of [`[blob.${emoji.code}]`, `【表情：blob.${emoji.code}】`]) {
      const parts = splitEmojiText(shortcode);
      assert.equal(parts.length, 1, shortcode);
      assert.equal(parts[0]?.emoji?.code, emoji.code, shortcode);
      assert.equal(parts[0]?.text, shortcode);
    }
  }
});
