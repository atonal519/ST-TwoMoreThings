// 输入时跟随实际内容区缩小；普通浏览不抢滚动位置，也不重建输入框。
export function createChatScroll(root) {
  const view = root.ownerDocument.defaultView;
  let feed, height = 0, frame;
  const forms = '.social-comment-form, .forum-comment-form, .ls-reply-form, .ls-compose-form';
  const isInput = input => input?.id === 'sms-draft' || input?.matches?.('textarea, input') && input.closest(forms);
  const focused = () => Boolean(isInput(root.activeElement));
  function follow() {
    if (!feed || !focused() || frame) return;
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
  function stop() {
    observer.disconnect();
    if (frame) view.cancelAnimationFrame(frame);
    frame = null; feed = null; height = 0;
  }
  function focus(event) { if (isInput(event.target)) follow(); }
  root.addEventListener('focusin', focus);
  return {
    attach({ followFocus = true } = {}) {
      const next = root.querySelector('.message-feed, .view-social, .view-social-profile, .view-post, .view-liangshi');
      if (next === feed) return;
      stop(); feed = next;
      if (feed) { height = feed.clientHeight; observer.observe(feed); if (followFocus) follow(); }
    },
    revealEditor() { if (root.activeElement?.id !== 'sms-draft') follow(); },
    stop,
    dispose() { stop(); root.removeEventListener('focusin', focus); },
  };
}
