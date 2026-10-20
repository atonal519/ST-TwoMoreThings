// 输入时跟随实际内容区缩小；普通浏览不抢滚动位置，也不重建输入框。
export function createChatScroll(root) {
  const view = root.ownerDocument.defaultView;
  let feed, height = 0, frame;
  const focused = () => root.activeElement?.id === 'sms-draft' || root.activeElement?.matches?.('.social-comment-form textarea');
  function follow() {
    if (!feed || !focused() || frame) return;
    frame = view.requestAnimationFrame(() => {
      frame = null;
      if (!feed || !focused()) return;
      const input = root.activeElement;
      if (input.id === 'sms-draft') { feed.scrollTop = feed.scrollHeight; return; }
      const form = input.closest('.social-comment-form').getBoundingClientRect();
      const bounds = feed.getBoundingClientRect();
      const top = feed.querySelector('.social-header')?.getBoundingClientRect().bottom ?? bounds.top;
      if (form.bottom > bounds.bottom - 8) feed.scrollTop += form.bottom - bounds.bottom + 8;
      else if (form.top < top + 8) feed.scrollTop += form.top - top - 8;
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
  function focus(event) { if (event.target.id === 'sms-draft' || event.target.matches?.('.social-comment-form textarea')) follow(); }
  root.addEventListener('focusin', focus);
  return {
    attach() {
      const next = root.querySelector('.message-feed, .view-social, .view-social-profile');
      if (next === feed) return;
      stop(); feed = next;
      if (feed) { height = feed.clientHeight; observer.observe(feed); }
    },
    stop,
    dispose() { stop(); root.removeEventListener('focusin', focus); },
  };
}
