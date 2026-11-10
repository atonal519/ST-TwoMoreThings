// 主窗口按浏览器可视视口定位，手机安全区与外侧间距由CSS处理。
export function readPanelViewport(win = globalThis.window) {
  const visual = win.visualViewport;
  return { left: Number(visual?.offsetLeft) || 0, top: Number(visual?.offsetTop) || 0,
    width: Math.max(0, Number(visual?.width) || win.innerWidth), height: Math.max(0, Number(visual?.height) || win.innerHeight) };
}

// down/up 两端均在外侧才关闭，拖选、滚动、取消的手势不转换成关闭。
export function bindOutsideClose({ target, panel, close, canClose = () => true, nativeDialog = false }) {
  let gesture = null;
  const outside = event => {
    if (nativeDialog) {
      if (event.target !== panel) return false;
      const rect = panel.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.left + rect.width || event.clientY < rect.top || event.clientY > rect.top + rect.height;
    }
    const path = event.composedPath?.();
    const host = panel.getRootNode?.().host;
    const foreignWindow = path?.some(node => node !== panel && (node?.matches?.('dialog,[role~="dialog"],[role~="alertdialog"],[role~="menu"],[role~="listbox"],[role~="combobox"]')
      || typeof node?.popover === 'string' && node.matches?.(':popover-open'))
      || node?.nodeType === 11 && node.host !== host
      && panel.ownerDocument?.defaultView?.getComputedStyle?.(node.host)?.position === 'fixed');
    const inside = path?.includes(panel) ?? panel.contains(event.target);
    const rect = inside ? panel.getBoundingClientRect?.() : null;
    // Touch adjustment may target the panel even when the physical tap is in its margin.
    const outsidePoint = rect && (event.clientX < rect.left || event.clientX > rect.left + rect.width
      || event.clientY < rect.top || event.clientY > rect.top + rect.height);
    return !foreignWindow && (!inside || outsidePoint);
  };
  const down = event => {
    gesture = event.button === 0 && event.isPrimary !== false && outside(event) && canClose()
      ? { id: event.pointerId, x: event.clientX, y: event.clientY, up: false, moved: false } : null;
  };
  const move = event => {
    if (gesture?.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 5) gesture.moved = true;
  };
  const up = event => {
    if (gesture?.id !== event.pointerId) { gesture = null; return; }
    move(event);
    gesture.up = outside(event);
  };
  const reset = () => { gesture = null; };
  const click = event => {
    const dismiss = gesture?.up && !gesture.moved && canClose();
    reset();
    if (dismiss) {
      // Only suppress a touch-adjusted click sent back into our own panel.
      if (nativeDialog || event.composedPath?.().includes(panel)) {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
      }
      close();
    }
  };
  const listeners = [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', reset], ['click', click]];
  for (const [type, listener] of listeners) target.addEventListener(type, listener, true);
  return () => { reset(); for (const [type, listener] of listeners) target.removeEventListener(type, listener, true); };
}
