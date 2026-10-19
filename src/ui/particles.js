// 正常重绘只重绑原画布，保留光点位置与相位；离开聊天、关闭或销毁时回收。
export function mountChatParticles(stage) {
  const doc = stage.ownerDocument, win = doc.defaultView;
  const canvas = doc.createElement('canvas');
  canvas.className = 'chat-particles';
  canvas.setAttribute('aria-hidden', 'true');
  stage.append(canvas);
  const context = canvas.getContext('2d');
  const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
  const particles = Array.from({ length: 12 }, () => ({
    x: Math.random(), y: Math.random(), radius: .8 + Math.random(),
    alpha: .55 + Math.random() * .35,
    vx: (Math.random() - .5) * .18, vy: (Math.random() - .5) * .12,
    wobble: Math.random() * Math.PI * 2, wobbleSpeed: .004 + Math.random() * .006,
  }));
  let width = 0, height = 0, frame = 0, previousTime = null;

  function paint(time) {
    // 按经过时间推进，刷新率不同的手机保持同样的漂浮速度。
    const step = previousTime === null ? 1 : Math.min((time - previousTime) / (1000 / 60), 2);
    previousTime = time;
    context.clearRect(0, 0, width, height);
    for (const particle of particles) {
      particle.wobble += particle.wobbleSpeed * step;
      particle.x += (particle.vx + Math.sin(particle.wobble) * .06) * step / width;
      particle.y += (particle.vy + Math.cos(particle.wobble * .7) * .04) * step / height;
      if (particle.x < -4 / width) particle.x = 1 + 4 / width;
      if (particle.x > 1 + 4 / width) particle.x = -4 / width;
      if (particle.y < -4 / height) particle.y = 1 + 4 / height;
      if (particle.y > 1 + 4 / height) particle.y = -4 / height;
      context.beginPath();
      context.arc(particle.x * width, particle.y * height, particle.radius, 0, Math.PI * 2);
      context.globalAlpha = particle.alpha;
      context.shadowBlur = 8 + particle.radius * 3;
      context.fill();
    }
    context.shadowBlur = 0;
    context.globalAlpha = 1;
    frame = win.requestAnimationFrame(paint);
  }
  function stop() {
    win.cancelAnimationFrame(frame);
    frame = 0;
    previousTime = null;
  }
  function sync() {
    canvas.hidden = reducedMotion.matches || doc.hidden || !width || !height;
    if (canvas.hidden) stop();
    else if (!frame) frame = win.requestAnimationFrame(paint);
  }
  const observer = new win.ResizeObserver(([entry]) => {
    width = entry.contentRect.width;
    height = entry.contentRect.height;
    const ratio = Math.min(win.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * ratio), pixelHeight = Math.round(height * ratio);
    // 同尺寸重复赋值也会清空位图；重绑时只更新实际发生变化的尺寸。
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = win.getComputedStyle(canvas).color;
    context.shadowColor = context.fillStyle;
    sync();
  });
  function attach(nextStage) {
    observer.disconnect();
    nextStage.append(canvas);
    observer.observe(nextStage);
  }
  attach(stage);
  reducedMotion.addEventListener('change', sync);
  doc.addEventListener('visibilitychange', sync);
  return {
    attach,
    dispose() {
      stop();
      observer.disconnect();
      reducedMotion.removeEventListener('change', sync);
      doc.removeEventListener('visibilitychange', sync);
      canvas.remove();
    },
  };
}
