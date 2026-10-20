const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function avatarCropLayout({ naturalWidth, naturalHeight, frameSize, zoom = 1, offsetX = 0, offsetY = 0 }) {
  const scaleZoom = clamp(zoom, 1, 3);
  const scale = Math.max(frameSize / naturalWidth, frameSize / naturalHeight) * scaleZoom;
  const width = naturalWidth * scale, height = naturalHeight * scale;
  const x = clamp(offsetX, -(width - frameSize) / 2, (width - frameSize) / 2);
  const y = clamp(offsetY, -(height - frameSize) / 2, (height - frameSize) / 2);
  return { zoom: scaleZoom, width, height, left: (frameSize - width) / 2 + x, top: (frameSize - height) / 2 + y, offsetX: x, offsetY: y };
}

// 原图和拖动状态仅属于这次弹窗；交回一张裁剪图，由资料表单决定何时保存。
export function mountAvatarCropper(surface, file) {
  const doc = surface.ownerDocument, win = doc.defaultView;
  const overlay = doc.createElement('div');
  overlay.className = 'phone-dialog-backdrop avatar-crop-backdrop';
  overlay.innerHTML = `<section class="phone-dialog avatar-crop-dialog" role="dialog" aria-modal="true" aria-label="调整头像">
    <h2>调整头像</h2>
    <div class="avatar-crop-frame"><img alt="头像裁剪预览" draggable="false"></div>
    <p class="avatar-crop-hint" role="status">正在读取图片…</p>
    <label class="avatar-crop-zoom"><span>缩放</span><input type="range" aria-label="缩放" min="1" max="3" step="0.01" value="1" disabled></label>
    <div class="form-actions"><button type="button" class="text-button" data-crop="cancel">取消</button><button type="button" class="save-button" data-crop="confirm" disabled>确定</button></div>
  </section>`;
  const frame = overlay.querySelector('.avatar-crop-frame'), image = frame.querySelector('img');
  const slider = overlay.querySelector('input'), confirm = overlay.querySelector('[data-crop="confirm"]');
  const objectUrl = win.URL.createObjectURL(file);
  let settle, fail;
  const result = new Promise((resolve, reject) => { settle = resolve; fail = reject; });
  let closed = false, ready = false, drag = null, zoom = 1, offsetX = 0, offsetY = 0;

  function preview() {
    if (!ready || closed) return;
    const size = frame.clientWidth;
    const layout = avatarCropLayout({ naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, frameSize: size, zoom, offsetX: offsetX * size, offsetY: offsetY * size });
    offsetX = layout.offsetX / size; offsetY = layout.offsetY / size;
    Object.assign(image.style, { width: `${layout.width}px`, height: `${layout.height}px`, left: `${layout.left}px`, top: `${layout.top}px` });
  }
  const observer = new win.ResizeObserver(preview);
  function attach() {
    if (closed) return;
    // 控制器可重绘表单，裁剪弹窗保留同一节点、原图和拖动位置。
    for (const child of surface.children) if (child !== overlay) child.inert = true;
    surface.append(overlay);
    if (!overlay.contains(surface.getRootNode().activeElement)) overlay.querySelector('[data-crop="cancel"]').focus({ preventScroll: true });
  }
  function finish(value, error) {
    if (closed) return;
    closed = true;
    observer.disconnect();
    image.onload = null; image.onerror = null;
    image.removeAttribute('src');
    win.URL.revokeObjectURL(objectUrl);
    overlay.remove();
    for (const child of surface.children) child.inert = false;
    if (error) fail(error); else settle(value);
  }
  function crop() {
    const canvas = doc.createElement('canvas');
    canvas.width = canvas.height = 512;
    const layout = avatarCropLayout({ naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, frameSize: 512, zoom, offsetX: offsetX * 512, offsetY: offsetY * 512 });
    canvas.getContext('2d').drawImage(image, layout.left, layout.top, layout.width, layout.height);
    return canvas.toDataURL('image/webp', .9);
  }
  overlay.addEventListener('click', event => {
    event.stopPropagation();
    const action = event.target.closest('[data-crop]');
    if (!action || action.disabled) return;
    if (action.dataset.crop === 'cancel') finish(null);
    else try { finish(crop()); } catch { finish(null, new Error('头像裁剪失败，请换一张图片重试。')); }
  });
  overlay.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); finish(null); }
    if (event.key === 'Tab') {
      const inputs = [...overlay.querySelectorAll('input:not(:disabled), button:not(:disabled)')];
      const index = inputs.indexOf(event.target), step = event.shiftKey ? -1 : 1;
      event.preventDefault(); inputs[(index + step + inputs.length) % inputs.length].focus();
    }
  });
  overlay.addEventListener('input', event => { event.stopPropagation(); zoom = Number(slider.value); preview(); });
  overlay.addEventListener('change', event => event.stopPropagation());
  frame.addEventListener('pointerdown', event => {
    if (!ready || event.button !== 0) return;
    event.preventDefault();
    frame.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, offsetX, offsetY };
  });
  frame.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    offsetX = drag.offsetX + (event.clientX - drag.x) / frame.clientWidth;
    offsetY = drag.offsetY + (event.clientY - drag.y) / frame.clientWidth;
    preview();
  });
  const endDrag = event => {
    if (drag?.id !== event.pointerId) return;
    if (frame.hasPointerCapture(event.pointerId)) frame.releasePointerCapture(event.pointerId);
    drag = null;
  };
  frame.addEventListener('pointerup', endDrag);
  frame.addEventListener('pointercancel', endDrag);
  image.onload = () => {
    ready = true; slider.disabled = false; confirm.disabled = false;
    overlay.querySelector('.avatar-crop-hint').textContent = '拖动图片调整位置';
    preview();
  };
  image.onerror = () => finish(null, new Error('这张图片无法读取，请换一张图片。'));
  attach(); observer.observe(frame); image.src = objectUrl;
  return { result, attach, close: () => finish(null) };
}
