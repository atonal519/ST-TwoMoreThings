import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhoneWindow } from '../src/ui/window.js';

test('phone geometry follows chat resizes and visual viewport offsets without saving preferences', () => {
  const listeners = new Map(), observed = [];
  let resized, chat = { left: 200, top: 100, width: 500, height: 600 };
  const win = { innerWidth: 1200, innerHeight: 900, matchMedia: () => ({ matches: true }),
    addEventListener: (type, handler) => listeners.set(type, handler), removeEventListener: type => listeners.delete(type),
    ResizeObserver: class { constructor(callback) { resized = callback; } observe(node) { observed.push(node); } disconnect() { observed.length = 0; } } };
  const node = { getBoundingClientRect: () => chat };
  const style = { setProperty(key, value) { this[key] = value; }, removeProperty(key) { delete this[key]; } };
  const surface = { ownerDocument: { defaultView: win, getElementById: id => id === 'chat' ? node : null }, style,
    addEventListener() {}, removeEventListener() {}, classList: { remove() {} },
    getClientRects: () => [1], getBoundingClientRect: () => ({ left: Number.parseFloat(style.left) || 0, top: Number.parseFloat(style.top) || 0, width: Number.parseFloat(style.width) || 360, height: Number.parseFloat(style.height) || 600 }) };
  const controls = createPhoneWindow(surface);
  controls.refresh();
  assert.equal(style.left, '320px'); assert.equal(style.top, '180px');
  assert.equal(style.width, '360px'); assert.equal(style.height, '510px');
  assert.deepEqual(observed, [node]);
  chat = { left: 250, top: 200, width: 310, height: 200 }; resized();
  assert.equal(style.width, '290px'); assert.equal(style.height, '180px');
  assert.equal(style.left, '260px'); assert.equal(style.top, '210px');
  controls.dispose(); assert.equal(listeners.size, 0); assert.equal(observed.length, 0);
});
