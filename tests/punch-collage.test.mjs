import test from 'node:test';
import assert from 'node:assert/strict';
import { fitPunchPhoto, createPunchLayout, clampPunchHole } from '../src/punch-collage.js';
import { createAlbumEditor } from '../src/ui/album-editor.js';

test('照片完整contain，横竖方与全景不会裁成同一比例', () => {
  for (const [w, h, expected] of [[1280, 853, [855, 570]], [800, 1200, [380, 570]], [700, 700, [570, 570]], [6000, 400, [856, 57]], [1, 100000, [1, 570]]]) {
    const fit = fitPunchPhoto(w, h);
    assert.deepEqual([fit.width, fit.height], expected);
    assert.ok(fit.width <= 856 && fit.height <= 570 && fit.width > 0 && fit.height > 0);
  }
});

const assertInside = (piece, rect) => {
  const points = piece.type === 'circle' ? [[-1, -1], [1, 1]] : [[-111, -100], [111, -100], [-111, 76], [111, 76]];
  for (const [x, y] of points) {
    const cos = piece.type === 'circle' ? 1 : Math.cos(piece.sourceAngle), sin = piece.type === 'circle' ? 0 : Math.sin(piece.sourceAngle);
    const px = piece.sx + (x * cos - y * sin) * piece.sourceScale, py = piece.sy + (x * sin + y * cos) * piece.sourceScale;
    assert.ok(px >= -1e-7 && px <= rect.width + 1e-7, `hole ${piece.id} x ${px}`);
    assert.ok(py >= -1e-7 && py <= rect.height + 1e-7, `hole ${piece.id} y ${py}`);
  }
};

test('默认孔和大幅拖动/放大均留在横竖与超宽照片内', () => {
  for (const template of ['circle', 'swallow']) for (const [w, h] of [[1280, 853], [800, 1200], [6000, 400], [1, 100000]]) {
    const layout = createPunchLayout(template, w, h);
    assert.equal(layout.width, 1000); assert.equal(layout.height, 1400);
    assert.equal(layout.pieces.length, template === 'circle' ? 12 : 11);
    for (const piece of layout.pieces) {
      assertInside(piece, layout.photoRect);
      const moved = clampPunchHole(piece, layout.photoRect, { sx: -10000, sy: 10000, sourceScale: 10000 });
      assertInside(moved, layout.photoRect);
      for (const key of ['dx', 'dy', 'destScale', 'destAngle', 'sourceAngle']) assert.equal(moved[key], piece[key]);
      assert.ok(moved.sourceScale > 0);
    }
  }
});

test('目标碎片布局独立于源图比例及取样尺寸', () => {
  for (const template of ['circle', 'swallow']) {
    const landscape = createPunchLayout(template, 1280, 853), portrait = createPunchLayout(template, 800, 1200);
    assert.deepEqual(portrait.pieces.map(p => [p.dx, p.dy, p.destScale, p.destAngle]), landscape.pieces.map(p => [p.dx, p.dy, p.destScale, p.destAngle]));
  }
  const circle = createPunchLayout('circle', 1280, 853);
  assert.deepEqual([circle.pieces[0].dx, circle.pieces[0].dy, circle.pieces[11].dx, circle.pieces[11].dy], [168, 829, 831, 1213]);
});

test('无效照片尺寸和模板报告实际错误', () => {
  assert.throws(() => fitPunchPhoto(0, 200), /图片尺寸/);
  assert.throws(() => createPunchLayout('other', 300, 200), /模板/);
});

function controllerFixture() {
  const callbacks = [];
  const context = { drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(16) }), putImageData() {}, fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, fill() {}, stroke() {}, clip() {} };
  const doc = {
    defaultView: { Image: class { naturalWidth = 1280; naturalHeight = 853; async decode() {} }, Path2D: class { arc() {} }, URL, location: { origin: 'https://host.test' }, setTimeout, clearTimeout },
    createElement: kind => kind === 'canvas' ? { getContext: () => context, toBlob: callback => callbacks.push(callback) } : { click() {}, remove() {} },
    body: { append() {} },
  };
  const editor = createAlbumEditor({ root: { querySelector: () => null }, documentRef: doc, readPhoto: () => ({}), isActive: () => true, onChange() {}, onView() {}, onFeedback() {} });
  return { editor, callbacks };
}

test('旧图导出迟到收尾不能解锁新图正在等待的导出', async () => {
  const { editor, callbacks } = controllerFixture();
  await editor.select('/user/images/a.png'); const old = editor.download('art');
  editor.leave(); await editor.select('/user/images/b.png'); const next = editor.download('art');
  assert.equal(callbacks.length, 2); assert.equal(editor.model().exporting, true);
  callbacks[0](new Blob(['old'], { type: 'image/png' })); await old;
  assert.equal(editor.model().exporting, true, '只有当前导出拥有按钮忙碌状态');
  callbacks[1](new Blob(['next'], { type: 'image/png' })); await next;
  assert.equal(editor.model().exporting, false); editor.dispose();
});

test('删除当前B图只清B，不清同会话A图已选孔位', async () => {
  const { editor } = controllerFixture();
  await editor.select('/user/images/a.png'); editor.setSize(1.25);
  assert.equal(editor.model().size, 1.25);
  await editor.select('/user/images/b.png'); editor.setSize(.65); editor.forgetCurrent();
  await editor.select('/user/images/a.png');
  assert.equal(editor.model().size, 1.25, 'A的孔位草稿应保留');
  await editor.select('/user/images/b.png'); assert.equal(editor.model().size, 1, 'B的已失效草稿应清除');
  editor.dispose();
});

test('只看B详情未编辑，B失效仍按B身份删稿，不清控制器缓存的A', async () => {
  const { editor } = controllerFixture();
  await editor.select('/user/images/a.png'); editor.setSize(1.25); editor.leave();
  editor.forgetCurrent('/user/images/b.png');
  await editor.select('/user/images/a.png');
  assert.equal(editor.model().size, 1.25, '只打开B详情不能让B失效清A');
  editor.dispose();
});
