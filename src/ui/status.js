import { action, icon } from './shared.js';

export function renderStatusBar({ locked, enabled }) {
  return `<header class="phone-status" aria-label="手机状态栏">
    <time class="status-time"></time>
    <span class="status-indicators" aria-hidden="true" title="装饰状态">
      ${icon('signal')}${icon('wifi')}${icon('battery')}
    </span>
    ${locked ? '' : `<div class="phone-tools">${action('lock', '锁屏', 'lock', 'icon-button status-lock', !enabled)}</div>`}
  </header>`;
}

// 状态栏和锁屏共用一个时钟；只有现实时间回退才安排下一次刷新。
export function createPhoneClock({ root, element, readTime }) {
  let timer;
  function refresh() {
    clearTimeout(timer);
    if (element.hidden) return;
    const clock = readTime();
    const status = root.querySelector('.status-time');
    if (status) status.textContent = clock.time;
    const digits = root.querySelector('.home-clock text');
    if (digits) {
      const values = clock.time.replace(':', '');
      for (let i = 0; i < 4; i++) digits.children[i].textContent = values[i];
      root.querySelector('.home-clock').setAttribute('aria-label', `当前时间 ${clock.time}`);
    }
    const date = root.querySelector('.home-date');
    if (date) {
      const label = clock.source === 'real' ? clock.date.slice(5).replace('-', '.') : clock.date || '日期未明确';
      date.textContent = [label, clock.weekday].filter(Boolean).join(' / ');
      date.title = date.textContent;
    }
    if (clock.source === 'real') timer = setTimeout(refresh, 60000 - Date.now() % 60000);
  }
  return { refresh, stop: () => clearTimeout(timer) };
}
