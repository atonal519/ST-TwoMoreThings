import test from 'node:test';
import assert from 'node:assert/strict';

import * as layout from '../src/ui/panel-window.js';
const rect = (left, top, width, height) => ({ left, top, width, height });

test('main window reads the complete visual viewport including offsets', () => {
  const win = { innerWidth: 1200, innerHeight: 900, visualViewport: { offsetLeft: 50, offsetTop: 80, width: 900, height: 700 } };
  assert.deepEqual(layout.readPanelViewport(win), rect(50, 80, 900, 700));
});

test('main window uses the browser viewport when visualViewport is unavailable', () => {
  assert.deepEqual(layout.readPanelViewport({ innerWidth: 390, innerHeight: 844 }), rect(0, 0, 390, 844));
});

class Target {
  listeners = new Map();
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  removeEventListener(type) { this.listeners.delete(type); }
  emit(type, values = {}) { this.listeners.get(type)?.({ button: 0, pointerId: 1, clientX: 5, clientY: 5, target: this, composedPath: () => [this], ...values }); }
}

test('outside dismissal requires a plain complete outside click and respects child dialogs', () => {
  const target = new Target(), panel = {}, inside = { composedPath: () => [panel, target] };
  let closes = 0, child = false;
  const dispose = layout.bindOutsideClose({ target, panel, close: () => closes++, canClose: () => !child });
  const click = () => { target.emit('pointerdown'); target.emit('pointerup'); target.emit('click'); };
  click(); assert.equal(closes, 1);
  target.emit('pointerdown', inside); target.emit('pointerup'); target.emit('click'); assert.equal(closes, 1);
  target.emit('pointerdown'); target.emit('pointerup', inside); target.emit('click', inside); assert.equal(closes, 1);
  target.emit('pointerdown'); target.emit('pointermove', { clientY: 50 }); target.emit('pointerup'); target.emit('click'); assert.equal(closes, 1);
  target.emit('pointerdown'); target.emit('pointercancel'); target.emit('pointerup'); target.emit('click'); assert.equal(closes, 1);
  child = true; click(); assert.equal(closes, 1);
  child = false; click(); assert.equal(closes, 2);
  dispose(); assert.equal(target.listeners.size, 0);
});

test('native dialog backdrop uses coordinates so dialog padding remains internal', () => {
  const target = new Target(); target.getBoundingClientRect = () => rect(30, 40, 300, 500);
  let closes = 0;
  layout.bindOutsideClose({ target, panel: target, nativeDialog: true, close: () => closes++ });
  const click = (x, y) => { for (const type of ['pointerdown', 'pointerup', 'click']) target.emit(type, { clientX: x, clientY: y }); };
  click(35, 45); assert.equal(closes, 0);
  click(5, 5); assert.equal(closes, 1);
});


test('foreign fixed shadow window remains interactive while ordinary host clicks dismiss', () => {
  const target = new Target(), ownHost = {}, foreignHost = {}, foreignRoot = { nodeType: 11, host: foreignHost };
  const panel = { getRootNode: () => ({ host: ownHost }), ownerDocument: { defaultView: { getComputedStyle: () => ({ position: 'fixed' }) } } };
  let closes = 0; layout.bindOutsideClose({ target, panel, close: () => closes++ });
  for (const type of ['pointerdown', 'pointerup', 'click']) target.emit(type, { composedPath: () => [foreignRoot, foreignHost, target] });
  assert.equal(closes, 0);
  for (const type of ['pointerdown', 'pointerup', 'click']) target.emit(type);
  assert.equal(closes, 1);
});
