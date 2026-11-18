import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { readPhotoWallImage } from '../src/photowall.js';
const module = await import('../src/wall-crop.js').catch(() => ({}));

test('minimum zoom fits a vertical double panel, centering its smaller axis', () => {
  assert.equal(typeof module.wallCropGeometry, 'function');
  const crop = module.wallCropGeometry({ width: 300, height: 316 }, { width: 832, height: 1216 }, { x: 1, y: -1, zoom: 0 });
  assert.equal(crop.height, 316);
  assert.ok(crop.width < 300);
  assert.equal(crop.left, (300 - crop.width) / 2);
  assert.equal(crop.top, 0);
  assert.deepEqual(crop.crop, { x: 0, y: 0, zoom: 0 });
});

test('overflow axes clamp at image edges, and normalized crops restore in a different frame', () => {
  const image = { width: 1600, height: 900 }, saved = { x: 0.4, y: -0.3, zoom: 2 };
  for (const frame of [{ width: 280, height: 316 }, { width: 410, height: 316 }]) {
    const geometry = module.wallCropGeometry(frame, image, saved);
    assert.deepEqual(geometry.crop, saved);
    assert.ok(geometry.left <= 0 && geometry.left + geometry.width >= frame.width);
    assert.ok(geometry.top <= 0 && geometry.top + geometry.height >= frame.height);
    const edge = module.wallCropGeometry(frame, image, { x: 99, y: -99, zoom: 2 });
    assert.equal(edge.left, 0);
    assert.equal(edge.top + edge.height, frame.height);
  }
});

test('wall confirmation stores only original path and three crop numbers, restores and clears on 404', async () => {
  const photo = { path: '/user/images/crop.png', description: '原图', sources: [{ kind: 'camera', id: 'photo', label: '相机' }] };
  const h = createHarness({ metadata: { pocketPhone: { contacts: [], groups: [], conversations: {}, albumPhotos: [photo], photoWall: { schemes: [], photos: [], desktopPhotoId: '' } } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const before = structuredClone(store.read().albumPhotos), crop = { x: 0.2, y: -0.4, zoom: 0 };
  await store.setPhotoWall(photo.path, crop);
  assert.equal(h.metadataSaves, 1);
  assert.deepEqual(store.read().albumPhotos, before);
  assert.deepEqual(readPhotoWallImage(createPhoneStore({ target }).read()).crop, crop);
  await store.clearImagePaths([photo.path]);
  assert.equal(store.read().photoWall.desktopPhotoPath, '');
  assert.equal(store.read().photoWall.desktopPhotoCrop, undefined);
  assert.equal(h.modelRequests.length, 0);
});

const { createWallCropEditor } = await import('../src/ui/wall-crop.js');
function editorFixture() {
  let active = true, available = true, reads = 0, observers = 0, changed = 0;
  const image = { naturalWidth: 832, naturalHeight: 1216, style: {}, dataset: {}, addEventListener() {} };
  const wrap = { clientWidth: 350, clientHeight: 220 };
  const frame = { parentElement: wrap, style: {}, listeners: {}, querySelector: () => image, focus() {}, setPointerCapture() {},
    get clientWidth() { return Number.parseFloat(this.style.width) || 300; }, get clientHeight() { return Number.parseFloat(this.style.height) || 316; },
    addEventListener(type, fn) { this.listeners[type] = fn; } };
  const measure = { clientWidth: 300, clientHeight: 316 }, slider = { value: 0 };
  const root = { querySelector: selector => ({ '[data-wall-crop-preview]': active ? frame : null, '[data-wall-crop-measure]': measure, '#wall-crop-zoom': slider })[selector],
    querySelectorAll: selector => active && selector.includes('preview') ? [frame] : [] };
  const loaded = [];
  const doc = { defaultView: { Image: class { constructor() { reads++; loaded.push(this); } async decode() {} }, ResizeObserver: class { constructor() { observers++; } observe() {} disconnect() {} } } };
  const editor = createWallCropEditor({ root, documentRef: doc, readPhoto: () => available, readWall: () => ({ path: 'https://images.example/old.png', crop: { x: 0.3, y: 0.2, zoom: 2 } }), isActive: () => active, onChange: () => { changed++; } });
  return { editor, frame, slider, image, loaded, counts: () => ({ reads, observers, changed }), leave() { active = false; editor.leave(); }, remove() { available = false; } };
}

test('crop controller restores a remote image, fits short screens and supports pointer and arrow adjustments without saves', async () => {
  const f = editorFixture();
  await f.editor.select('https://images.example/old.png');
  f.editor.attach();
  assert.equal(f.loaded[0].crossOrigin, undefined);
  assert.deepEqual(f.editor.value().crop, { x: 0.3, y: 0.2, zoom: 2 });
  assert.ok(f.frame.clientHeight <= 196);
  assert.ok(Math.abs(f.frame.clientWidth / f.frame.clientHeight - 300 / 316) < 0.000001);
  const event = { button: 0, pointerId: 1, clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() {} };
  f.frame.listeners.pointerdown(event);
  f.frame.listeners.pointermove({ ...event, clientX: 999, clientY: -999 });
  assert.deepEqual(f.editor.value().crop, { x: 1, y: -1, zoom: 2 });
  f.frame.listeners.keydown({ ...event, key: 'ArrowLeft' });
  assert.ok(f.editor.value().crop.x < 1);
  f.editor.setZoom('0');
  assert.deepEqual(f.editor.value().crop, { x: 0, y: 0, zoom: 0 });
  f.editor.reset(); assert.equal(f.slider.value, 1.04);
  const session = f.editor.session;
  f.leave(); f.editor.attach();
  assert.notEqual(f.editor.session, session);
  assert.equal(f.counts().observers, 1, 'unrelated pages allocate no observer');
  assert.throws(() => f.editor.value(), /重新打开/);
});

test('missing photos and cancelled pending image loads cannot produce a confirmable crop', async () => {
  const f = editorFixture();
  const pending = f.editor.select('/user/images/old.png');
  f.leave(); await pending;
  assert.throws(() => f.editor.value(), /重新打开/);
  const missing = editorFixture(); await missing.editor.select('/user/images/old.png'); missing.remove();
  assert.throws(() => missing.editor.value(), /重新打开/);
});
