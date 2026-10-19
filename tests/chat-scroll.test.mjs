import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatScroll } from '../src/ui/chat-scroll.js';

function setup() {
  const frames = new Map(); let nextFrame = 0, observe;
  const feed = { clientHeight: 500, scrollHeight: 2400, scrollTop: 80 };
  const root = new EventTarget();
  root.activeElement = null;
  root.querySelector = () => root.feed;
  root.feed = feed;
  root.ownerDocument = { defaultView: {
    ResizeObserver: class {
      constructor(callback) { observe = callback; }
      observe(target) { this.target = target; }
      disconnect() { this.target = null; }
    },
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
  } };
  const scroll = createChatScroll(root);
  const flush = () => { for (const [id, callback] of [...frames]) { frames.delete(id); callback(); } };
  const focus = () => {
    const input = new EventTarget(); input.id = 'sms-draft'; root.activeElement = input;
    const event = new Event('focusin'); Object.defineProperty(event, 'target', { value: input }); root.dispatchEvent(event);
  };
  return { root, feed, scroll, frames, flush, focus, resize: height => observe([{ contentRect: { height } }]) };
}

test('input focus and real feed shrink follow the bottom on the next frame without replacing the input', () => {
  const h = setup(); h.scroll.attach(); h.focus();
  const input = h.root.activeElement;
  assert.equal(h.feed.scrollTop, 80, 'wait for layout');
  h.flush(); assert.equal(h.feed.scrollTop, 2400);
  h.feed.scrollTop = 200; h.resize(260); h.resize(200);
  assert.equal(h.frames.size, 1, 'coalesce one layout frame');
  h.flush(); assert.equal(h.feed.scrollTop, 2400);
  assert.equal(h.root.activeElement, input);
  h.scroll.dispose();
});

test('ordinary history browsing and observer groups never force a scroll', () => {
  const h = setup(); h.scroll.attach();
  h.resize(250); h.flush(); assert.equal(h.feed.scrollTop, 80);
  h.focus(); h.root.activeElement = null;
  h.flush(); assert.equal(h.feed.scrollTop, 80, 'blur before layout preserves history');
  h.root.feed = null; h.scroll.attach();
  h.resize(150); h.flush(); assert.equal(h.feed.scrollTop, 80);
  h.scroll.dispose();
});

test('close and destruction cancel pending frames; reopening attaches the current feed', () => {
  const h = setup(); h.scroll.attach(); h.focus(); h.scroll.stop();
  assert.equal(h.frames.size, 0); h.flush(); assert.equal(h.feed.scrollTop, 80);
  const next = { clientHeight: 400, scrollHeight: 3200, scrollTop: 100 };
  h.root.feed = next; h.scroll.attach(); h.resize(220); h.flush();
  assert.equal(next.scrollTop, 3200);
  next.scrollTop = 50; h.resize(180); h.scroll.dispose(); h.flush();
  assert.equal(next.scrollTop, 50); assert.equal(h.frames.size, 0);
});
