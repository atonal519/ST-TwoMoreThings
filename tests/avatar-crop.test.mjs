import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarCropLayout } from '../src/ui/avatar-cropper.js';

test('wide avatar covers the round frame and clamps dragging without empty edges', () => {
  assert.deepEqual(avatarCropLayout({ naturalWidth: 400, naturalHeight: 200, frameSize: 240 }),
    { zoom: 1, width: 480, height: 240, left: -120, top: 0, offsetX: 0, offsetY: 0 });
  assert.deepEqual(avatarCropLayout({ naturalWidth: 400, naturalHeight: 200, frameSize: 240, zoom: 2, offsetX: 999, offsetY: -999 }),
    { zoom: 2, width: 960, height: 480, left: 0, top: -240, offsetX: 360, offsetY: -120 });
});

test('portrait avatar zoom stays within the same slider range', () => {
  assert.deepEqual(avatarCropLayout({ naturalWidth: 200, naturalHeight: 400, frameSize: 200, zoom: 0 }),
    { zoom: 1, width: 200, height: 400, left: 0, top: -100, offsetX: 0, offsetY: 0 });
  const enlarged = avatarCropLayout({ naturalWidth: 200, naturalHeight: 400, frameSize: 200, zoom: 9 });
  assert.equal(enlarged.zoom, 3);
  assert.equal(enlarged.width, 600);
});
