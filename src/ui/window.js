import { readChatBounds, observeChatBounds } from './panel-window.js';

// 窗口位置只属于当前 UI 实例；手机布局仍由 CSS 接管，不写入聊天或全局设置。
export function createPhoneWindow(surface) {
  const win = surface.ownerDocument.defaultView;
  const desktop = win.matchMedia('(min-width: 641px)');
  let gesture = null;
  let preferredPosition = null;

  function place(left, top, { width, height }) {
    const view = readChatBounds(surface.ownerDocument, win);
    surface.style.left = `${Math.max(view.left + 10, Math.min(left, view.left + view.width - width - 10))}px`;
    surface.style.top = `${Math.max(view.top + 10, Math.min(top, view.top + view.height - height - 10))}px`;
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
    if (event.pointerId !== gesture?.id) return;
    if (event.type === 'pointerup' && gesture.moved) {
      const rect = surface.getBoundingClientRect();
      preferredPosition = { left: rect.left, top: rect.top };
    }
    stop();
  }
  function refresh() {
    const view = readChatBounds(surface.ownerDocument, win);
    for (const property of ['left', 'top', 'width', 'height']) surface.style.setProperty(`--pp-window-${property}`, `${view[property]}px`);
    if (!desktop.matches) {
      for (const property of ['left', 'top', 'right', 'width', 'height']) surface.style.removeProperty(property);
      return;
    }
    const width = Math.max(0, Math.min(360, view.width - 20));
    const height = Math.max(0, Math.min(view.height - 20, Math.max(300, Math.min(600, view.height * .85))));
    surface.style.width = `${width}px`;
    surface.style.height = `${height}px`;
    place(preferredPosition?.left ?? view.left + view.width - width - 20, preferredPosition?.top ?? view.top + 80, { width, height });
  }
  const resize = () => { stop(); refresh(); };
  const listeners = [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['lostpointercapture', up]];
  for (const [type, handler] of listeners) surface.addEventListener(type, handler);
  win.addEventListener('resize', resize);
  win.addEventListener('orientationchange', resize);
  win.visualViewport?.addEventListener('resize', resize);
  win.visualViewport?.addEventListener('scroll', resize);
  const unobserve = observeChatBounds(surface.ownerDocument, resize);
  return {
    stop, refresh,
    dispose() {
      stop();
      for (const [type, handler] of listeners) surface.removeEventListener(type, handler);
      win.removeEventListener('resize', resize);
      win.removeEventListener('orientationchange', resize);
      win.visualViewport?.removeEventListener('resize', resize);
      win.visualViewport?.removeEventListener('scroll', resize);
      unobserve();
    },
  };
}
