import { positionPhonePopup, focusPopupOption } from './selects.js';

// One transient operation menu per phone. Business actions remain in ui.js.
export function createPhoneActionMenu({ root, onClose }) {
  const surface = root.querySelector('.phone-shell'), view = root.ownerDocument.defaultView;
  let opened;
  const trigger = () => opened && root.querySelector(opened.triggerSelector);
  function positions(button) {
    const result = new Map();
    for (let parent = button.parentElement; parent && parent !== surface; parent = parent.parentElement) result.set(parent, [parent.scrollTop, parent.scrollLeft]);
    return result;
  }
  function close(returnFocus = false) {
    if (!opened) return;
    const button = trigger(), popup = opened.popup;
    opened = null; popup.remove(); button?.setAttribute('aria-expanded', 'false');
    root.removeEventListener('scroll', scroll, true); view.removeEventListener('resize', resize); view.visualViewport?.removeEventListener('resize', resize);
    onClose();
    if (returnFocus) button?.focus({ preventScroll: true });
  }
  function scroll(event) {
    if (!opened || opened.popup.contains(event.target)) return;
    const previous = opened.positions.get(event.target);
    if (!previous || previous[0] !== event.target.scrollTop || previous[1] !== event.target.scrollLeft) close();
  }
  function resize() {
    const button = trigger();
    if (!button) { close(); return; }
    positionPhonePopup(opened.popup, button, 180); opened.positions = positions(button);
  }
  function update(route) {
    if (!opened) return;
    const button = trigger(), content = opened.content();
    if (route !== opened.route || !button || button.disabled || !content) { close(); return; }
    const focused = root.activeElement, action = opened.popup.contains(focused) && focused.dataset.action;
    if (opened.markup !== content) {
      opened.markup = content; opened.list.innerHTML = content;
      for (const option of opened.list.querySelectorAll('button')) option.setAttribute('role', 'menuitem');
      if (action) {
        const option = opened.list.querySelector(`[data-action="${CSS.escape(action)}"]:not(:disabled)`) || opened.list.querySelector('button:not(:disabled)');
        if (option) focusPopupOption(option); else button.focus({ preventScroll: true });
      }
    }
    button.setAttribute('aria-expanded', 'true'); resize();
  }
  return {
    get isOpen() { return Boolean(opened); },
    open({ title, triggerSelector, content, route }) {
      close();
      const button = root.querySelector(triggerSelector); if (!button || button.disabled) return;
      const popup = root.ownerDocument.createElement('div'); popup.className = 'model-popup source-popup phone-action-popup'; popup.dataset.phoneOverlay = '';
      const list = root.ownerDocument.createElement('div'); list.className = 'model-options source-options'; list.setAttribute('role', 'menu'); list.setAttribute('aria-label', title);
      popup.append(list); surface.append(popup); opened = { popup, list, triggerSelector, content, route };
      update(route); if (!opened) return;
      root.addEventListener('scroll', scroll, true); view.addEventListener('resize', resize); view.visualViewport?.addEventListener('resize', resize);
      const option = list.querySelector('button:not(:disabled)');
      if (option) focusPopupOption(option); else button.focus({ preventScroll: true });
    },
    update, close,
    dismiss(event) {
      if (!opened) return;
      if (!event?.composedPath().some(node => node === opened.popup || node === trigger())) close(Boolean(event));
    },
    keydown(event) {
      const inside = opened && (opened.popup.contains(event.target) || event.target === trigger());
      if (opened && (inside || event.key === 'Escape')) {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); close(true); }
        else if (event.key === 'Tab') close(true);
        else if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
          event.preventDefault();
          const options = [...opened.list.querySelectorAll('button:not(:disabled)')], index = options.indexOf(event.target), step = event.key === 'ArrowDown' ? 1 : -1;
          focusPopupOption(options[(index + step + options.length) % options.length]);
        }
        return true;
      }
      if (['Enter', ' '].includes(event.key) && event.target.matches('[data-action="chat-menu"], [data-action="liangshi-menu"], [data-action="inbox-menu"], [data-action="avatar-menu"], [data-message]')) event.stopPropagation();
      return false;
    },
  };
}
