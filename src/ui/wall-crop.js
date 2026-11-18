import { imageSource } from '../image-files.js';
import { cleanWallCrop, DEFAULT_WALL_CROP, paintWallCrop } from '../wall-crop.js';

export function createWallCropEditor({ root, documentRef: doc, readPhoto, readWall, isActive, onChange, onMissing }) {
  let path = '', crop = cleanWallCrop(), loading = false, error = '', token = 0;
  let observer;
  const bound = new WeakSet();
  const current = (expected, chosen) => expected === token && chosen === path && isActive() && Boolean(readPhoto(chosen));
  const preview = () => root.querySelector('[data-wall-crop-preview]');
  function paint() {
    const frame = preview();
    if (!frame) return;
    const measure = root.querySelector('[data-wall-crop-measure]');
    if (measure?.clientWidth) {
      const wrap = frame.parentElement;
      const scale = Math.min(1, Math.max(1, wrap.clientWidth - 24) / measure.clientWidth, Math.max(1, wrap.clientHeight - 24) / measure.clientHeight);
      frame.style.width = `${measure.clientWidth * scale}px`; frame.style.height = `${measure.clientHeight * scale}px`;
      const radius = Number.parseFloat(doc.defaultView.getComputedStyle?.(measure).borderTopLeftRadius) || 14;
      frame.style.borderRadius = `${radius * scale}px`;
    }
    return paintWallCrop(frame, frame.querySelector('img'), crop);
  }
  function update(next) {
    crop = cleanWallCrop(next);
    const geometry = paint();
    if (geometry) crop = geometry.crop;
    const slider = root.querySelector('#wall-crop-zoom');
    if (slider) slider.value = crop.zoom;
  }
  async function select(chosen) {
    const expected = ++token;
    path = chosen; loading = true; error = '';
    const wall = readWall(); crop = cleanWallCrop(wall?.path === chosen ? wall.crop : DEFAULT_WALL_CROP);
    onChange();
    try {
      const image = new doc.defaultView.Image();
      image.src = imageSource(chosen);
      await image.decode();
      if (!current(expected, chosen)) return;
      loading = false; onChange();
    } catch {
      if (!current(expected, chosen)) return;
      loading = false; error = '照片暂时无法读取，请返回后重试。'; onChange(); onMissing?.(chosen);
    }
  }
  function attach() {
    observer?.disconnect(); observer = null;
    const frames = [...root.querySelectorAll('[data-wall-crop], [data-wall-crop-preview]')];
    if (!frames.length) return;
    const paintAll = () => {
      paint();
      for (const frame of root.querySelectorAll('[data-wall-crop]')) paintWallCrop(frame, frame.querySelector('img'), JSON.parse(frame.dataset.wallCrop));
    };
    if (doc.defaultView.ResizeObserver) {
      observer = new doc.defaultView.ResizeObserver(paintAll);
      const measure = root.querySelector('[data-wall-crop-measure]');
      if (measure) observer.observe(measure);
      const wrap = preview()?.parentElement; if (wrap) observer.observe(wrap);
    }
    for (const frame of frames) {
      observer?.observe(frame);
      const image = frame.querySelector('img');
      if (!image || bound.has(image)) continue;
      bound.add(image); image.addEventListener('load', paintAll);
    }
    paintAll();
    const frame = preview();
    if (!frame || bound.has(frame)) return;
    bound.add(frame);
    let drag;
    frame.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !isActive()) return;
      const geometry = paint(); if (!geometry) return;
      event.preventDefault(); frame.focus({ preventScroll: true });
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, crop: { ...crop }, geometry };
      frame.setPointerCapture(event.pointerId);
    });
    frame.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId || !isActive()) return;
      update({ ...crop, x: drag.crop.x + (drag.geometry.overflowX ? (event.clientX - drag.x) / drag.geometry.overflowX : 0), y: drag.crop.y + (drag.geometry.overflowY ? (event.clientY - drag.y) / drag.geometry.overflowY : 0) });
    });
    const stop = event => { if (drag?.id === event.pointerId) drag = null; };
    frame.addEventListener('pointerup', stop); frame.addEventListener('pointercancel', stop);
    frame.addEventListener('keydown', event => {
      const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (!direction || !isActive()) return;
      event.preventDefault(); event.stopPropagation();
      const geometry = paint(); if (!geometry) return;
      const step = event.shiftKey ? 10 : 2;
      update({ ...crop, x: crop.x + (geometry.overflowX ? direction[0] * step / geometry.overflowX : 0), y: crop.y + (geometry.overflowY ? direction[1] * step / geometry.overflowY : 0) });
    });
  }
  function leave() { token++; path = ''; crop = cleanWallCrop(); loading = false; error = ''; }
  return { select, attach, leave, get session() { return token; }, model: () => ({ path, crop, loading, error }),
    value() {
      if (!isActive() || loading || error || !readPhoto(path)) throw Error('这张照片暂时无法设为照片墙，请重新打开。');
      const geometry = paint();
      return { path, crop: geometry?.crop || cleanWallCrop(crop) };
    },
    setZoom: value => update({ ...crop, zoom: Number(value) }), reset: () => update(DEFAULT_WALL_CROP),
    dispose() { leave(); observer?.disconnect(); },
  };
}
