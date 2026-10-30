import { escape, icon, renderEmojiText } from './shared.js';
import { formatPublicationTime } from '../social-time.js';

const template = () => `<button type="button" class="notification-shade-backdrop" data-action="notification-shade-home" aria-label="收起通知并回桌面"></button>
  <section class="phone-notification-shade" aria-label="通知与快捷设置" data-open="false">
    <header class="notification-shade-clock"><span data-notification-date></span><strong data-notification-time></strong></header>
    <div class="notification-quick-grid" aria-label="快捷设置">
      <button type="button" class="notification-quick-long notification-placeholder" disabled aria-label="预留快捷位"><span></span></button>
      <button type="button" class="notification-quick-long notification-theme" data-action="toggle-notification-theme" aria-pressed="false"><span data-notification-theme-icon>${icon('sun')}</span><span class="notification-theme-copy"><span data-notification-theme-label></span><small data-notification-theme-hint></small></span></button>
      ${Array.from({ length: 4 }, () => '<button type="button" class="notification-quick-small notification-placeholder" disabled aria-label="预留快捷位"><span></span></button>').join('')}
    </div><h3 class="notification-history-title">通知</h3><div class="phone-notification-list" aria-label="通知历史" aria-live="polite"></div>
  </section><section class="phone-notification-footer" aria-label="通知底部区域"><button type="button" class="notification-footer-background" data-action="notification-shade-home" aria-label="收起通知并回桌面"></button><button type="button" class="notification-clear" data-action="clear-notifications">${icon('message-delete')}<span>清除通知</span></button></section>`;

function row(record) {
  return `<button type="button" class="phone-history-notice" data-action="open-history-notice" data-notification-key="${escape(record.key)}"><span class="notification-app-icon">${icon(['messages', 'social', 'forum', 'liangshi'].includes(record.app) ? record.app : 'messages')}</span><span class="notification-history-copy"><span class="notification-history-meta"><strong title="${escape(record.title)}">${escape(record.title)}</strong><small title="${escape(record.timeLabel)}">${escape(formatPublicationTime(record.timeLabel))}</small></span><p>${renderEmojiText(record.text)}</p></span></button>`;
}

// The shade owns only its overlay DOM. Normal page routes and editors stay mounted.
export function createNotificationShade({ root, surface, readState, initialize, onClear, onTheme, onNotice, onHome, onBeforeOpen = () => {}, onClose = () => {}, onError, canOpen = () => true }) {
  const doc = surface.ownerDocument, win = doc.defaultView, layer = doc.createElement('div');
  layer.className = 'phone-notification-layer'; layer.hidden = true; layer.inert = true; layer.innerHTML = template();
  const panel = layer.querySelector('.phone-notification-shade'), list = layer.querySelector('.phone-notification-list');
  let phase = 'closed', token = 0, timer, pending = false, clearing = false, theming = false, markup = '', clock, rememberedFocus, gesture;
  const trigger = () => root.querySelector('[data-action="toggle-notification-shade"]');
  const isOpen = () => phase !== 'closed';
  const reduced = () => win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function entry() {
    const button = trigger(); if (!button) return;
    button.hidden = ['open', 'closing'].includes(phase); button.setAttribute('aria-expanded', String(isOpen()));
  }
  function layout() {
    const footer = surface.querySelector('.phone-footer'), bounds = surface.getBoundingClientRect(), border = parseFloat(win.getComputedStyle(surface).borderBottomWidth) || 0;
    const inset = footer && !footer.classList.contains('home-footer') ? bounds.bottom - border - footer.getBoundingClientRect().top : 0;
    layer.style.setProperty('--notification-footer-inset', `${Math.max(0, inset)}px`);
  }
  function updateClock(value) {
    clock = value || clock; if (!clock) return;
    layer.querySelector('[data-notification-time]').textContent = clock.time || '--:--';
    layer.querySelector('[data-notification-date]').textContent = [clock.date, clock.weekday].filter(Boolean).join(' · ');
  }
  function refresh() {
    if (!isOpen()) { entry(); return; }
    const state = readState(), night = state.theme === 'night', button = layer.querySelector('[data-action="toggle-notification-theme"]');
    button.setAttribute('aria-pressed', String(night)); button.disabled = theming;
    layer.querySelector('[data-notification-theme-label]').textContent = night ? '夜间模式' : '日间模式';
    layer.querySelector('[data-notification-theme-hint]').textContent = night ? '切换为日间' : '切换为夜间';
    layer.querySelector('[data-notification-theme-icon]').innerHTML = night ? '<span class="notification-moon" aria-hidden="true"></span>' : icon('sun');
    layer.querySelector('[data-action="clear-notifications"]').disabled = clearing;
    const content = (state.notifications?.items || []).map(row).join('') || '<p class="notification-history-empty">暂无通知</p>';
    if (content !== markup) { const scroll = list.scrollTop, key = list.contains(root.activeElement) && root.activeElement.closest('[data-notification-key]')?.dataset.notificationKey; markup = content; list.innerHTML = content; list.scrollTop = scroll; if (key) [...list.querySelectorAll('[data-notification-key]')].find(node => node.dataset.notificationKey === key)?.focus({ preventScroll: true }); }
    updateClock(); entry();
  }
  function attach() {
    const previous = rememberedFocus; rememberedFocus = null;
    const active = previous?.node || root.activeElement, main = surface.querySelector('.phone-main');
    if (layer.parentNode !== surface) surface.append(layer);
    if (isOpen() && !canOpen()) close({ immediate: true, restoreFocus: false });
    if (main && isOpen()) main.inert = true;
    if (isOpen()) layout(); refresh();
    if (layer.contains(active) && active.isConnected) active.focus({ preventScroll: true });
    else if (previous && isOpen()) ([...list.querySelectorAll('[data-notification-key]')].find(node => node.dataset.notificationKey === previous.key) || panel.querySelector('button:not(:disabled)'))?.focus({ preventScroll: true });
  }
  function finishClose(home, restoreFocus) {
    phase = 'closed'; layer.hidden = true; layer.inert = true; entry();
    const main = surface.querySelector('.phone-main'); if (main && !root.querySelector('.phone-dialog-backdrop, .photo-viewer')) main.inert = false;
    onClose({ restoreFocus: restoreFocus && !home });
    if (home) onHome(); else if (restoreFocus && !root.activeElement?.matches?.('input,textarea')) trigger()?.focus({ preventScroll: true });
  }
  function close({ home = false, immediate = false, restoreFocus = true } = {}) {
    token++; pending = false; win.clearTimeout(timer);
    if (phase === 'closed') { onClose({ restoreFocus: false }); return; }
    phase = 'closing'; entry(); panel.dataset.open = 'false'; layer.inert = true;
    if (immediate || reduced()) finishClose(home, restoreFocus); else timer = win.setTimeout(() => finishClose(home, restoreFocus), 210);
  }
  async function open() {
    if (isOpen() || pending || !canOpen()) return;
    onBeforeOpen(); pending = true; const current = ++token;
    try { await initialize(); }
    catch (error) { if (current === token) { pending = false; onClose({ restoreFocus: true }); onError(error); } return; }
    if (current !== token) return;
    if (!canOpen()) { pending = false; onClose({ restoreFocus: true }); return; }
    pending = false; phase = 'opening'; layer.hidden = false; layer.inert = false; panel.dataset.open = 'false'; attach();
    const settle = () => { if (current !== token) return; phase = 'open'; entry(); layer.querySelector('[data-action="toggle-notification-theme"]').focus({ preventScroll: true }); };
    if (reduced()) { panel.dataset.open = 'true'; settle(); }
    else win.requestAnimationFrame(() => win.requestAnimationFrame(() => { if (current !== token) return; panel.dataset.open = 'true'; timer = win.setTimeout(settle, 200); }));
  }
  const interactive = target => target.closest('button, a[href], input, textarea, select, [contenteditable="true"]');
  function pointerDown(event) {
    gesture = isOpen() && event.button === 0 && event.target.closest('.phone-notification-layer, .phone-status')
      ? { id: event.pointerId, x: event.clientX, y: event.clientY, scroll: list.scrollTop, moved: false, status: Boolean(event.target.closest('.phone-status')), interactive: Boolean(interactive(event.target)) } : null;
  }
  function pointerMove(event) {
    if (gesture?.id === event.pointerId && (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6 || surface.classList.contains('is-dragging'))) gesture.moved = true;
  }
  function pointerCancel(event) { if (gesture?.id === event.pointerId) gesture.moved = true; }
  function wasDragged(event) {
    const dragged = event.detail !== 0 && gesture && (gesture.moved || list.scrollTop !== gesture.scroll);
    gesture = null; return dragged;
  }
  function statusClick(event) {
    const fromStatus = event.target.closest('.phone-status') || event.target === surface && gesture?.status;
    if (!isOpen() || !fromStatus || interactive(event.target) || gesture?.interactive) return;
    event.stopPropagation(); if (!wasDragged(event)) close({ home: true });
  }
  async function click(event) {
    event.stopPropagation(); if (wasDragged(event)) return;
    if (!interactive(event.target)) { close({ home: true }); return; }
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === 'notification-shade-home') { close({ home: true }); return; }
    if (action === 'open-history-notice') { const record = readState().notifications?.items.find(item => item.key === button.dataset.notificationKey); if (record) { close({ immediate: true, restoreFocus: false }); onNotice(record); } return; }
    if (action === 'clear-notifications' && !clearing) { clearing = true; refresh(); try { await onClear(); } catch (error) { onError(error); } finally { clearing = false; refresh(); } }
    if (action === 'toggle-notification-theme' && !theming) { theming = true; refresh(); try { await onTheme(); } catch (error) { onError(error); } finally { theming = false; refresh(); } }
  }
  layer.addEventListener('click', click);
  surface.addEventListener('pointerdown', pointerDown); surface.addEventListener('pointermove', pointerMove); surface.addEventListener('pointercancel', pointerCancel); surface.addEventListener('click', statusClick);
  const resize = () => { if (isOpen()) layout(); }; win.addEventListener('resize', resize);
  return {
    get isOpen() { return isOpen(); }, get isClearing() { return clearing; }, attach, refresh, updateClock, open, close,
    beforeRender() { const active = root.activeElement; rememberedFocus = isOpen() && layer.contains(active) ? { node: active, key: active.dataset.notificationKey } : null; },
    keydown(event) {
      if (!isOpen()) return false;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return true; }
      if (event.key === 'Tab') {
        const controls = [...layer.querySelectorAll('button:not(:disabled)'), ...surface.querySelectorAll('.phone-footer:not(.home-footer) button:not(:disabled)')].filter(node => node.getClientRects().length), index = controls.indexOf(root.activeElement);
        event.preventDefault(); event.stopPropagation(); controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus(); return true;
      }
      return false;
    },
    dispose() { close({ immediate: true, restoreFocus: false }); layer.removeEventListener('click', click); surface.removeEventListener('pointerdown', pointerDown); surface.removeEventListener('pointermove', pointerMove); surface.removeEventListener('pointercancel', pointerCancel); surface.removeEventListener('click', statusClick); win.removeEventListener('resize', resize); layer.remove(); },
  };
}
