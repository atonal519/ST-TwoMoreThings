// 输入时跟随实际内容区缩小；普通浏览不抢滚动位置，也不重建输入框。
import { icon } from './shared.js';

export function createChatScroll(root, { onEarlier, onPullStart, canPull = () => true } = {}) {
  const view = root.ownerDocument.defaultView;
  let feed, height = 0, frame, restoreFrame, key, pull, cue, restoring = false;
  const forms = '.social-comment-form, .forum-comment-form, .ls-reply-form, .ls-compose-form';
  const isInput = input => input?.id === 'sms-draft' || input?.matches?.('textarea, input') && input.closest(forms);
  const focused = () => Boolean(isInput(root.activeElement));
  function follow() {
    if (!feed || !focused() || frame || restoring) return;
    frame = view.requestAnimationFrame(() => {
      frame = null;
      if (!feed || !focused()) return;
      const input = root.activeElement;
      if (input.id === 'sms-draft') { feed.scrollTop = feed.scrollHeight; return; }
      const form = input.closest(forms).getBoundingClientRect();
      const bounds = feed.getBoundingClientRect();
      const top = Math.max(bounds.top, feed.querySelector('.social-header, .ls-chrome')?.getBoundingClientRect().bottom ?? bounds.top);
      const available = bounds.bottom - top - 16;
      const target = form.height <= available ? form : input.getBoundingClientRect();
      if (target.height > available || target.top < top + 8) feed.scrollTop += target.top - top - 8;
      else if (target.bottom > bounds.bottom - 8) feed.scrollTop += target.bottom - bounds.bottom + 8;
    });
  }
  const observer = new view.ResizeObserver(entries => {
    const next = entries[0]?.contentRect.height || 0;
    if (next > 0 && next < height) follow();
    height = next;
  });
  const selection = () => !(root.getSelection?.() || view.getSelection?.())?.isCollapsed;
  function earlierAction() {
    const history = feed?.querySelector?.('[data-action="history"]');
    if (history?.getAttribute('aria-expanded') === 'true') return feed.querySelector('[data-action="earlier-history"]')?.dataset.action;
    return feed?.querySelector?.('[data-action="earlier"]')?.dataset.action || history?.dataset.action;
  }
  function cancelPull() { pull = null; cue?.remove(); cue = null; }
  function start(event) {
    cancelPull();
    if (!onEarlier || feed.scrollTop > 1 || event.touches.length !== 1 || !canPull() || selection()) return;
    const control = event.target.closest?.('button, a, input, textarea, select, [contenteditable], img, .message-avatar, .message-actions, .message-reply, .message-mention');
    if (control && !(control.matches('button.bubble') && control.classList.length === 1 || control.matches('button.pat-message'))) return;
    const action = earlierAction(); if (!action) return;
    const touch = event.touches[0];
    pull = { id: touch.identifier, x: touch.clientX, y: touch.clientY, time: event.timeStamp, action, distance: 0, claimed: false };
  }
  function move(event) {
    if (!pull) return;
    if (feed.scrollTop > 1 || event.touches.length !== 1 || !event.cancelable || !canPull() || selection()) { cancelPull(); return; }
    const touch = event.touches[0], dx = touch.clientX - pull.x, dy = touch.clientY - pull.y;
    if (touch.identifier !== pull.id || dy < 0 || Math.abs(dx) > dy || !pull.claimed && event.timeStamp - pull.time > 350) { cancelPull(); return; }
    if (!dy) return;
    // Claim the first downward move; waiting for the load threshold lets native scrolling take ownership.
    event.preventDefault();
    if (!pull.claimed) {
      pull.claimed = true; onPullStart?.();
      cue = root.ownerDocument.createElement('div'); cue.className = 'chat-pull-indicator'; cue.setAttribute('role', 'status');
      cue.innerHTML = `${icon('arrow')}<span></span>`; feed.parentElement.append(cue);
    }
    pull.distance = dy;
    cue.dataset.ready = String(dy >= 56);
    cue.style.transform = `translate(-50%, ${Math.min(24, dy / 3)}px)`;
    cue.querySelector('span').textContent = dy >= 56 ? '松开查看' : '下拉查看更早消息';
  }
  function end(event) {
    const action = pull?.claimed && pull.distance >= 56 && !event.touches.length && canPull() && !selection() && earlierAction() === pull.action ? pull.action : null;
    cancelPull();
    if (action) onEarlier(action);
  }
  function detachPull() {
    if (feed?.removeEventListener) {
      feed.removeEventListener('touchstart', start); feed.removeEventListener('touchmove', move);
      feed.removeEventListener('touchend', end); feed.removeEventListener('touchcancel', cancelPull);
    }
    view.removeEventListener?.('blur', cancelPull); cancelPull();
  }
  function stop() {
    detachPull();
    if (restoreFrame) { view.cancelAnimationFrame(restoreFrame); restoreFrame = null; restoring = false; }
    observer.disconnect();
    if (frame) view.cancelAnimationFrame(frame);
    frame = null; feed = null; height = 0; key = undefined;
  }
  function focus(event) { if (isInput(event.target)) follow(); }
  root.addEventListener('focusin', focus);
  return {
    attach({ followFocus = true, key: nextKey } = {}) {
      const next = root.querySelector('.message-feed, .view-social, .view-social-profile, .view-post, .view-liangshi');
      if (next === feed && key === nextKey) return;
      stop(); feed = next; key = nextKey;
      if (feed) { height = feed.clientHeight; observer.observe(feed); if (followFocus) follow(); }
      if (onEarlier && feed?.matches('.message-feed')) {
        feed.addEventListener('touchstart', start, { passive: true }); feed.addEventListener('touchmove', move, { passive: false });
        feed.addEventListener('touchend', end); feed.addEventListener('touchcancel', cancelPull);
        view.addEventListener('blur', cancelPull);
      }
    },
    prepend(change) {
      const previousKey = key, rows = [...(feed?.querySelectorAll('[data-message-id]') || [])];
      const ids = new Set(rows.map(row => row.dataset.messageId)), bounds = feed?.getBoundingClientRect();
      const first = bounds && rows.find(row => { const box = row.getBoundingClientRect(); return box.bottom > bounds.top && box.top < bounds.bottom; });
      const anchor = first && { id: first.dataset.messageId, offset: first.getBoundingClientRect().top - bounds.top };
      if (frame) view.cancelAnimationFrame(frame); frame = null;
      if (restoreFrame) view.cancelAnimationFrame(restoreFrame); restoreFrame = null;
      restoring = true;
      try {
        change();
        if (!feed || previousKey !== key) return;
        const destination = feed, nextRows = [...feed.querySelectorAll('[data-message-id]')];
        const target = nextRows.filter(row => !ids.has(row.dataset.messageId)).at(-1);
        const place = () => {
          const bounds = destination.getBoundingClientRect();
          if (target) destination.scrollTop += target.getBoundingClientRect().bottom - bounds.bottom + (parseFloat(view.getComputedStyle(destination).paddingBottom) || 0);
          else if (anchor) {
            const previous = nextRows.find(row => row.dataset.messageId === anchor.id);
            if (previous) destination.scrollTop += previous.getBoundingClientRect().top - bounds.top - anchor.offset;
          }
        };
        place();
        // Let this render's ResizeObserver delivery settle before keyboard following resumes.
        restoreFrame = view.requestAnimationFrame(() => {
          place();
          restoreFrame = view.requestAnimationFrame(() => { restoreFrame = null; restoring = false; });
        });
      } finally { if (!restoreFrame) restoring = false; }
    },
    revealEditor() { if (root.activeElement?.id !== 'sms-draft') follow(); },
    stop,
    dispose() { stop(); root.removeEventListener('focusin', focus); },
  };
}
