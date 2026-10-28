import { escape, icon } from './shared.js';

export function positionPhonePopup(popup, button, minWidth = 0) {
  const surface = button.closest('.phone-shell'), root = surface.getRootNode(), view = surface.ownerDocument.defaultView;
  const shell = surface.getBoundingClientRect(), main = root.querySelector('.phone-main').getBoundingClientRect(), box = button.getBoundingClientRect();
  const originX = shell.left + surface.clientLeft, originY = shell.top + surface.clientTop;
  const width = Math.min(Math.max(box.width, minWidth), surface.clientWidth - 16), start = Math.max(4, main.top - originY + 4), end = Math.min(surface.clientHeight - 4, main.bottom - originY - 4);
  Object.assign(popup.style, { right: 'auto', width: `${width}px`, left: `${Math.max(8, Math.min(box.left - originX, surface.clientWidth - width - 8))}px`, top: '0px' });
  const list = popup.firstElementChild; list.style.maxHeight = '';
  const overhead = popup.offsetHeight - list.offsetHeight, below = end - (box.bottom - originY) - 4, above = box.top - originY - start - 4;
  const upward = popup.offsetHeight > below && above > below, room = upward ? above : below;
  list.style.maxHeight = `${Math.max(0, Math.min(parseFloat(view.getComputedStyle(list).maxHeight), room - overhead))}px`;
  const top = upward ? box.top - originY - popup.offsetHeight - 4 : box.bottom - originY + 4;
  popup.style.top = `${Math.max(start, Math.min(top, end - popup.offsetHeight))}px`;
}

export function focusPopupOption(option) {
  if (!option) return;
  option.focus({ preventScroll: true });
  const list = option.closest('.model-options'), item = option.getBoundingClientRect(), bounds = list.getBoundingClientRect();
  if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom;
  else if (item.top < bounds.top) list.scrollTop += item.top - bounds.top;
}

// Native fields retain form values and change handlers; visible controls reuse
// the API source picker's anchored-list styles inside the phone shell.
export function createPhoneSelects({ root, beforeOpen = () => {} }) {
  const surface = root.querySelector('.phone-shell'), view = root.ownerDocument.defaultView;
  let route = '', opened = null, pendingFocus = null, busy = new Set();
  const focusTask = { 'phone-theme': 'theme', 'phone-lock-style': 'lock-style', 'default-language': 'default-language', 'image-provider': 'image-provider' };
  const source = (id, ownerRoute = route) => ownerRoute === route ? root.querySelector(`.phone-main select#${CSS.escape(id)}`) : null;
  const trigger = id => root.querySelector(`[data-phone-select="${CSS.escape(id)}"]`);
  const label = select => select.getAttribute('aria-label') || root.querySelector(`label[for="${CSS.escape(select.id)}-picker"]`)?.textContent.trim() || select.name;
  function restore() {
    if (!pendingFocus || pendingFocus.route !== route) { pendingFocus = null; return; }
    if (busy.has(focusTask[pendingFocus.id])) return;
    const button = trigger(pendingFocus.id), active = root.activeElement;
    if (active && active !== button || root.ownerDocument.activeElement !== root.host && root.ownerDocument.activeElement !== root.ownerDocument.body) { pendingFocus = null; return; }
    if (button && !button.disabled) { button.focus({ preventScroll: true }); pendingFocus = null; }
  }
  function close(returnFocus = false) {
    const owner = opened;
    if (!owner) return;
    opened = null; owner.popup.remove();
    root.removeEventListener('scroll', scroll, true); view.removeEventListener('resize', resize); view.visualViewport?.removeEventListener('resize', resize);
    if (owner.route === route) {
      const button = trigger(owner.id); button?.setAttribute('aria-expanded', 'false');
      if (returnFocus) button?.focus({ preventScroll: true });
    }
  }
  function scroll(event) {
    if (!opened || opened.popup.contains(event.target)) return;
    const previous = opened.scrollPositions.get(event.target);
    if (!previous || previous[0] !== event.target.scrollTop || previous[1] !== event.target.scrollLeft) close();
  }
  function scrollPositions(button) {
    const positions = new Map();
    for (let parent = button.parentElement; parent && parent !== surface; parent = parent.parentElement) positions.set(parent, [parent.scrollTop, parent.scrollLeft]);
    return positions;
  }
  function resize() {
    const button = opened && trigger(opened.id);
    if (!button) { close(); return; }
    positionPhonePopup(opened.popup, button); opened.scrollPositions = scrollPositions(button);
  }
  function open(select, direction = 1) {
    if (!select || select.disabled) return;
    if (opened?.id === select.id) { close(true); return; }
    close(); beforeOpen();
    const button = trigger(select.id), popup = select.ownerDocument.createElement('div');
    popup.className = 'model-popup source-popup phone-select-popup';
    popup.innerHTML = `<div class="model-options source-options phone-select-options" id="phone-select-options" role="listbox" aria-label="${escape(label(select))}">${[...select.options].map(option => `<button type="button" role="option" data-phone-select-option="${escape(option.value)}" aria-selected="${option.selected}" ${option.disabled || option.parentElement.disabled ? 'disabled' : ''}>${escape(option.label)}</button>`).join('')}</div>`;
    surface.append(popup); positionPhonePopup(popup, button);
    opened = { id: select.id, route, popup, scrollPositions: scrollPositions(button) }; button.setAttribute('aria-expanded', 'true');
    root.addEventListener('scroll', scroll, true); view.addEventListener('resize', resize); view.visualViewport?.addEventListener('resize', resize);
    const options = [...popup.querySelectorAll('button:not(:disabled)')], selected = options.find(option => option.getAttribute('aria-selected') === 'true') || (direction > 0 ? options[0] : options.at(-1));
    focusPopupOption(selected);
  }
  return {
    mount(nextRoute, busyKeys = busy) {
      if (opened) { const owner = opened; close(); if (owner.route === nextRoute) pendingFocus = { id: owner.id, route: owner.route }; }
      route = nextRoute; busy = busyKeys;
      for (const select of root.querySelectorAll('.phone-main select')) {
        if (!select.hasAttribute('data-phone-select-source')) {
          select.dataset.phoneSelectSource = ''; select.hidden = true; select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
          select.addEventListener('invalid', event => { event.preventDefault(); trigger(select.id)?.focus({ preventScroll: true }); open(select); });
        }
        let button = trigger(select.id);
        if (!button) { button = select.ownerDocument.createElement('button'); button.type = 'button'; button.id = `${select.id}-picker`; button.dataset.phoneSelect = select.id; button.className = 'source-list-toggle phone-select-button'; select.after(button); }
        for (const fieldLabel of root.querySelectorAll(`label[for="${CSS.escape(select.id)}"]`)) fieldLabel.htmlFor = button.id;
        const implicitLabel = select.closest('label:not([for])'); if (implicitLabel) implicitLabel.htmlFor = button.id;
        button.disabled = select.disabled; button.setAttribute('aria-label', label(select)); button.setAttribute('aria-haspopup', 'listbox'); button.setAttribute('aria-controls', 'phone-select-options'); button.setAttribute('aria-expanded', 'false');
        button.innerHTML = `<span>${escape(select.selectedOptions[0]?.label || '')}</span>${icon('next')}`;
      }
      restore();
    },
    click(event) {
      const button = event.target.closest('button');
      if (button?.hasAttribute('data-phone-select')) { event.preventDefault(); open(source(button.dataset.phoneSelect)); return true; }
      if (!button?.hasAttribute('data-phone-select-option')) return false;
      event.preventDefault();
      const owner = opened, select = owner && source(owner.id, owner.route), value = button.dataset.phoneSelectOption;
      const option = select && [...select.options].find(option => option.value === value);
      if (!select || select.disabled || !option || option.disabled || option.parentElement.disabled) return true;
      const changed = select.value !== value; select.value = value; close(true);
      if (changed) {
        pendingFocus = { id: owner.id, route: owner.route };
        select.dispatchEvent(new select.ownerDocument.defaultView.Event('change', { bubbles: true }));
        this.mount(route);
      }
      return true;
    },
    keydown(event) {
      const button = event.target.closest('[data-phone-select]'), option = event.target.closest('[data-phone-select-option]');
      if (opened && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return true; }
      if (opened && event.key === 'Tab') { event.stopPropagation(); close(true); return true; }
      if (!button && !option) return false;
      if (['Enter', ' '].includes(event.key)) { event.stopPropagation(); return true; }
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return false;
      event.preventDefault(); event.stopPropagation(); const direction = event.key === 'ArrowDown' ? 1 : -1;
      if (button) open(source(button.dataset.phoneSelect), direction);
      else if (opened) { const options = [...opened.popup.querySelectorAll('button:not(:disabled)')], index = options.indexOf(option); focusPopupOption(options[(index + direction + options.length) % options.length]); }
      return true;
    },
    dismiss(event) { if (opened && (!event || !event.composedPath().some(node => node.matches?.('.phone-select-popup, [data-phone-select]')))) close(); },
    close() { close(); pendingFocus = null; },
  };
}
