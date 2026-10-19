// 输入时跟随实际消息视口的缩小；浏览历史与其他窗口尺寸变化不抢滚动位置。
export function createChatScroll(root) {
  const view = root.ownerDocument.defaultView;
  let feed, height = 0, frame;
  const focused = () => root.activeElement?.id === 'sms-draft';
  function bottom() {
    if (!feed || !focused() || frame) return;
    frame = view.requestAnimationFrame(() => {
      frame = null;
      if (feed && focused()) feed.scrollTop = feed.scrollHeight;
    });
  }
  const observer = new view.ResizeObserver(entries => {
    const next = entries[0]?.contentRect.height || 0;
    if (next > 0 && next < height) bottom();
    height = next;
  });
  function stop() {
    observer.disconnect();
    if (frame) view.cancelAnimationFrame(frame);
    frame = null; feed = null; height = 0;
  }
  function focus(event) { if (event.target.id === 'sms-draft') bottom(); }
  root.addEventListener('focusin', focus);
  return {
    attach() {
      const next = root.querySelector('.message-feed');
      if (next === feed) return;
      stop(); feed = next;
      if (feed) { height = feed.clientHeight; observer.observe(feed); }
    },
    stop,
    dispose() { stop(); root.removeEventListener('focusin', focus); },
  };
}
