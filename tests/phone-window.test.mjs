import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPhoneWindow } from '../src/ui/window.js';

function fixture(width = 1200, height = 900, withVisual = false) {
  const target = () => {
    const listeners = new Map();
    return { listeners, addEventListener: (type, handler) => listeners.set(type, handler), removeEventListener: type => listeners.delete(type), fire: (type, event = {}) => listeners.get(type)?.(event) };
  };
  const observed = [], resizeObservers = [], visual = target();
  let chat = { left: 400, top: 200, width: 400, height: 400 };
  const win = { ...target(), innerWidth: width, innerHeight: height,
    ResizeObserver: class { constructor(callback) { resizeObservers.push(callback); } observe(node) { observed.push(node); } disconnect() {} } };
  if (withVisual) win.visualViewport = Object.assign(visual, { offsetLeft: 0, offsetTop: 0, width, height });
  win.matchMedia = () => ({ get matches() { return win.innerWidth >= 641; } });
  const style = { setProperty(key, value) { this[key] = value; }, removeProperty(key) { delete this[key]; } };
  const captures = new Set(), surface = { ...target(), ownerDocument: { defaultView: win, getElementById: id => id === 'chat' ? { getBoundingClientRect: () => chat } : null }, style,
    classList: { add() {}, remove() {} }, setPointerCapture: id => captures.add(id), hasPointerCapture: id => captures.has(id), releasePointerCapture: id => captures.delete(id),
    getBoundingClientRect: () => Object.fromEntries(['left', 'top', 'width', 'height'].map(key => [key, Number.parseFloat(style[key]) || 0])) };
  const controls = createPhoneWindow(surface);
  controls.refresh();
  return { surface, controls, style, win, visual, observed, resizeObservers, setChat: value => { chat = value; } };
}

test('desktop phone defaults to 360×600 and ignores chat/input size changes', () => {
  const f = fixture(1200, 700);
  assert.deepEqual(f.surface.getBoundingClientRect(), { left: 820, top: 80, width: 360, height: 600 });
  f.setChat({ left: 500, top: 300, width: 100, height: 50 });
  for (const callback of f.resizeObservers) callback();
  f.controls.refresh();
  assert.deepEqual(f.surface.getBoundingClientRect(), { left: 820, top: 80, width: 360, height: 600 });
  assert.equal(f.observed.length, 0);
  f.controls.dispose();
  assert.equal(f.win.listeners.size, 0);
  assert.equal(f.surface.listeners.size, 0);
});

test('desktop phone drags across all chat edges and restores its preferred position after a smaller viewport', () => {
  const f = fixture();
  const target = { closest: selector => selector === '.phone-status' ? {} : null };
  for (const [x, y, left, top] of [[-2000, 0, 10, 80], [4000, 0, 830, 80], [0, -2000, 830, 10], [0, 4000, 830, 290]]) {
    f.surface.fire('pointerdown', { pointerId: 1, button: 0, clientX: 0, clientY: 0, target, preventDefault() {}, stopPropagation() {} });
    f.surface.fire('pointermove', { pointerId: 1, clientX: x, clientY: y });
    f.surface.fire('pointerup', { pointerId: 1, type: 'pointerup' });
    assert.deepEqual(f.surface.getBoundingClientRect(), { left, top, width: 360, height: 600 });
    f.controls.stop(); f.controls.refresh();
    assert.equal(f.style.left, `${left}px`); assert.equal(f.style.top, `${top}px`);
  }
  f.win.innerWidth = 700; f.win.innerHeight = 400; f.win.fire('resize');
  assert.deepEqual(f.surface.getBoundingClientRect(), { left: 330, top: 10, width: 360, height: 380 });
  f.win.innerWidth = 1200; f.win.innerHeight = 900; f.win.fire('resize');
  assert.deepEqual(f.surface.getBoundingClientRect(), { left: 830, top: 290, width: 360, height: 600 });
  f.controls.dispose();
});

test('390 and 320 mobile phone bounds follow the visual viewport and keep 40px single safe-area margins', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /max\(40px, env\(safe-area-inset-top, 0px\)\)/);
  assert.match(css, /max\(40px, env\(safe-area-inset-bottom, 0px\)\)/);
  for (const width of [390, 320]) {
    const f = fixture(width, 844, true);
    assert.equal(f.style['--pp-window-width'], `${width}px`);
    assert.equal(f.style['--pp-window-height'], '844px');
    assert.equal(f.style.width, undefined);
    f.setChat({ left: 100, top: 300, width: 100, height: 50 });
    f.controls.refresh();
    assert.equal(f.style['--pp-window-height'], '844px');
    assert.equal(f.observed.length, 0);
    f.win.visualViewport = Object.assign(f.visual, { offsetLeft: 10, offsetTop: 30, width: width - 20, height: 420 });
    f.visual.fire('resize');
    assert.equal(f.style['--pp-window-top'], '30px');
    assert.equal(f.style['--pp-window-height'], '420px');
    f.controls.dispose();
  }
});
