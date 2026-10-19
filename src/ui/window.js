// 窗口位置只属于当前 UI 实例；手机布局仍由 CSS 接管，不写入聊天或全局设置。
export function createPhoneWindow(surface) {
  const win = surface.ownerDocument.defaultView;
  const desktop = win.matchMedia('(min-width: 641px)');
  let gesture = null;

  function place(left, top, { width, height }) {
    surface.style.left = `${Math.max(10, Math.min(left, win.innerWidth - width - 10))}px`;
    surface.style.top = `${Math.max(10, Math.min(top, win.innerHeight - height - 10))}px`;
    surface.style.right = 'auto';
  }
  function stop() {
    if (!gesture) return;
    const id = gesture.id;
    gesture = null;
    surface.classList.remove('is-dragging');
    if (surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
  }
  function down(event) {
    if (!desktop.matches || event.button !== 0 || gesture || !event.target.closest('.phone-status') || event.target.closest('button')) return;
    const bounds = surface.getBoundingClientRect();
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, moved: false };
    surface.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }
  function move(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.moved && Math.hypot(dx, dy) <= 5) return;
    gesture.moved = true;
    surface.classList.add('is-dragging');
    place(gesture.left + dx, gesture.top + dy, gesture);
  }
  function up(event) {
    if (event.pointerId === gesture?.id) stop();
  }
  function refresh() {
    if (!desktop.matches) {
      for (const property of ['left', 'top', 'right']) surface.style.removeProperty(property);
    } else if (surface.style.left && surface.getClientRects().length) {
      const bounds = surface.getBoundingClientRect();
      place(bounds.left, bounds.top, bounds);
    }
  }
  const resize = () => { stop(); refresh(); };
  const listeners = [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['lostpointercapture', up]];
  for (const [type, handler] of listeners) surface.addEventListener(type, handler);
  win.addEventListener('resize', resize);
  return {
    stop, refresh,
    dispose() {
      stop();
      for (const [type, handler] of listeners) surface.removeEventListener(type, handler);
      win.removeEventListener('resize', resize);
    },
  };
}
