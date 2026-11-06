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


test('same-route editor redraw attaches the new feed without forcing a reading jump', () => {
  const h = setup(); h.scroll.attach(); h.focus(); h.flush();
  const next = { clientHeight: 500, scrollHeight: 2800, scrollTop: 140 };
  h.root.feed = next; h.scroll.attach({ followFocus: false }); h.flush();
  assert.equal(next.scrollTop, 140, 'ordinary redraw preserves the restored reading position');
  h.resize(220); h.flush(); assert.equal(next.scrollTop, 2800, 'a real keyboard shrink still follows');
  h.scroll.dispose();
});

function pullSetup() {
  const view = new EventTarget(), root = new EventTarget(); let action = 'earlier', selected = false, historyOpen = null, allowed = true;
  Object.assign(view, { ResizeObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, getComputedStyle: () => ({ paddingBottom: '14px' }), getSelection: () => ({ isCollapsed: !selected }) });
  const makeFeed = (rows = []) => {
    const feed = new EventTarget();
    Object.assign(feed, { scrollTop: 0, scrollHeight: 2500, clientHeight: 500, matches: selector => selector === '.message-feed',
      getBoundingClientRect: () => ({ top: 100, bottom: 600 }),
      querySelector: selector => selector.includes('"history"') && historyOpen !== null ? { dataset: { action: 'history' }, getAttribute: () => String(historyOpen) } : selector.includes(`"${action}"`) ? { dataset: { action }, getAttribute: () => 'false' } : null,
      querySelectorAll: () => feed.rows, parentElement: { append() {} },
    });
    feed.rows = rows.map(([id, top, height = 80]) => ({ dataset: { messageId: id }, getBoundingClientRect: () => ({ top: 100 + top - feed.scrollTop, bottom: 100 + top + height - feed.scrollTop }) }));
    return feed;
  };
  root.ownerDocument = { defaultView: view, createElement: () => ({ className: '', dataset: {}, style: {}, setAttribute() {}, querySelector: () => ({ textContent: '' }), remove() {} }) };
  root.activeElement = null; root.querySelector = () => root.feed; root.feed = makeFeed();
  let loads = [], starts = 0;
  const scroll = createChatScroll(root, { onEarlier: action => loads.push(action), onPullStart: () => starts++, canPull: () => allowed }); scroll.attach({ key: 'chat:a' });
  const touch = (type, x, y, options = {}) => {
    const event = new Event(type, { cancelable: options.cancelable !== false });
    const point = { identifier: 1, clientX: x, clientY: y };
    Object.defineProperties(event, { touches: { value: type === 'touchend' || type === 'touchcancel' ? [] : options.multi ? [point, { ...point, identifier: 2 }] : [point] }, changedTouches: { value: [point] } });
    if (options.target) Object.defineProperty(event, 'target', { value: options.target });
    root.feed.dispatchEvent(event); return event.defaultPrevented;
  };
  return { root, view, scroll, makeFeed, touch, loads, get starts() { return starts; }, action: value => { action = value; }, history: value => { historyOpen = value; }, allow: value => { allowed = value; }, selection: value => { selected = value; } };
}

test('top pull claims the early vertical move but only loads once on threshold release', () => {
  const h = pullSetup();
  assert.equal(h.touch('touchstart', 80, 100), false);
  assert.equal(h.touch('touchmove', 81, 112), true);
  h.touch('touchmove', 82, 175); assert.deepEqual(h.loads, []);
  h.touch('touchend', 82, 175); h.touch('touchend', 82, 175);
  assert.deepEqual(h.loads, ['earlier']); assert.equal(h.starts, 1);
  h.touch('touchstart', 80, 100); h.touch('touchmove', 80, 125); h.touch('touchend', 80, 125);
  assert.equal(h.loads.length, 1);
  h.scroll.dispose();
});

test('non-top, horizontal, upward, multi-touch, selection and uncancelable scrolls stay native', () => {
  for (const mode of ['non-top', 'moved-before-claim', 'horizontal', 'up', 'multi', 'selection', 'uncancelable', 'cancel']) {
    const h = pullSetup();
    if (mode === 'non-top') h.root.feed.scrollTop = 30;
    if (mode === 'selection') h.selection(true);
    h.touch('touchstart', 80, 100);
    if (mode === 'moved-before-claim') h.root.feed.scrollTop = 30;
    const prevented = h.touch('touchmove', mode === 'horizontal' ? 170 : 80, mode === 'up' ? 30 : 175, { multi: mode === 'multi', cancelable: mode !== 'uncancelable' });
    if (mode !== 'cancel') assert.equal(prevented, false, mode);
    else h.touch('touchcancel', 80, 175);
    h.touch('touchend', 80, 175); assert.deepEqual(h.loads, [], mode); h.scroll.dispose();
  }
});

test('feed replacement, close, blur and no-more cancel a pending pull and detach old feed', () => {
  for (const mode of ['replace', 'stop', 'blur', 'no-more']) {
    const h = pullSetup(), old = h.root.feed;
    if (mode === 'no-more') h.action('');
    h.touch('touchstart', 80, 100); h.touch('touchmove', 80, 175);
    if (mode === 'replace') { h.root.feed = h.makeFeed(); h.scroll.attach({ key: 'chat:a' }); }
    if (mode === 'stop') h.scroll.stop();
    if (mode === 'blur') h.view.dispatchEvent(new Event('blur'));
    h.touch('touchend', 80, 175); assert.deepEqual(h.loads, [], mode);
    old.dispatchEvent(new Event('touchcancel')); h.scroll.dispose();
  }
});

test('pull follows current pages before opening past, then only past pages at the top', () => {
  for (const [action, open, expected] of [['earlier', false, 'earlier'], ['', false, 'history'], ['earlier-history', true, 'earlier-history'], ['earlier', true, null]]) {
    const h = pullSetup(); h.action(action); h.history(open);
    h.touch('touchstart', 80, 100); h.touch('touchmove', 80, 180); h.touch('touchend', 80, 180);
    assert.deepEqual(h.loads, expected ? [expected] : []); h.scroll.dispose();
  }
});

test('plain text bubbles allow pulling while avatars, rich controls, selection and overlays keep ownership', () => {
  for (const kind of ['text', 'avatar', 'image', 'link', 'input', 'selection-during-pull', 'overlay']) {
    const h = pullSetup(), plain = ['text', 'selection-during-pull', 'overlay'].includes(kind);
    const control = { classList: { length: plain ? 1 : 2 }, matches: selector => plain && selector === 'button.bubble' };
    h.touch('touchstart', 80, 100, { target: { closest: () => control } });
    if (kind === 'selection-during-pull' || kind === 'overlay') { h.touch('touchmove', 80, 112); assert.equal(h.starts, 1); }
    if (kind === 'selection-during-pull') h.selection(true);
    if (kind === 'overlay') h.allow(false);
    h.touch('touchmove', 80, 180); h.touch('touchend', 80, 180);
    assert.deepEqual(h.loads, kind === 'text' ? ['earlier'] : []); h.scroll.dispose();
  }
});

test('prepend ends at the last newly revealed row in the new same-route feed, never at the whole conversation bottom', () => {
  const h = pullSetup(); h.root.feed = h.makeFeed([['old', 0], ['tail', 1340]]); h.scroll.attach({ key: 'chat:a' });
  h.scroll.prepend(() => { h.root.feed = h.makeFeed([['new-first', 0], ['new-last', 480], ['old', 560], ['tail', 1900]]); h.scroll.attach({ followFocus: false, key: 'chat:a' }); });
  assert.equal(h.root.feed.scrollTop, 74);
  assert.equal(h.root.feed.rows[1].getBoundingClientRect().bottom, 586);
  assert.ok(h.root.feed.scrollTop < h.root.feed.scrollHeight - h.root.feed.clientHeight);
  h.scroll.dispose();
});

test('prepend falls back to the old visible message only without new rows and never positions a different chat', () => {
  const h = pullSetup(); h.root.feed = h.makeFeed([['old', 0]]); h.scroll.attach({ key: 'chat:a' });
  h.scroll.prepend(() => { h.root.feed = h.makeFeed([['old', 130]]); h.scroll.attach({ followFocus: false, key: 'chat:a' }); });
  assert.equal(h.root.feed.scrollTop, 130);
  h.scroll.prepend(() => { h.root.feed = h.makeFeed([['other', 300]]); h.scroll.attach({ key: 'chat:b' }); });
  assert.equal(h.root.feed.scrollTop, 0); h.scroll.dispose();
});

test('history positioning wins over its delayed resize delivery, then real keyboard shrinking follows normally', () => {
  const h = setup(), bounds = () => ({ top: 100, bottom: 600 });
  h.feed.querySelectorAll = () => []; h.feed.getBoundingClientRect = bounds;
  h.root.ownerDocument.defaultView.getComputedStyle = () => ({ paddingBottom: '14px' });
  h.scroll.attach({ key: 'chat:a' }); h.focus(); h.flush();
  const next = { clientHeight: 400, scrollHeight: 3200, scrollTop: 0, getBoundingClientRect: bounds };
  next.querySelectorAll = () => [{ dataset: { messageId: 'new-last' }, getBoundingClientRect: () => ({ top: 580 - next.scrollTop, bottom: 660 - next.scrollTop }) }];
  h.scroll.prepend(() => { h.root.feed = next; h.scroll.attach({ followFocus: false, key: 'chat:a' }); });
  h.resize(350); h.flush(); assert.equal(next.scrollTop, 74);
  h.flush(); h.resize(300); h.flush(); assert.equal(next.scrollTop, 3200);
  h.scroll.dispose(); assert.equal(h.frames.size, 0);
});
