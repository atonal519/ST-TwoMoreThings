import { action, escape, icon } from './shared.js';
import { renderPhotoViewer } from './cards.js';
import { renderStatusBar } from './status.js';

function renderNavigation(view, enabled) {
  return `<nav class="bottom-nav system-nav" aria-label="手机导航">
    ${action('system-back', '返回', 'back', 'nav-item', !enabled || view === 'desktop')}
    ${action('system-home', '主页', 'home', 'nav-item', !enabled)}
    ${action('close', '关闭手机', 'phone-close', 'nav-item close-button')}
  </nav>`;
}

// 窗口结构和导航只在这里生成；页面模块不接管关闭、状态栏或底栏。
export function renderFeedback(feedback) {
  return feedback ? `<div class="feedback ${feedback.error ? 'is-error' : ''}" role="${feedback.error ? 'alert' : 'status'}">
    <span>${escape(feedback.text)}</span>${action('dismiss', '关闭提示', 'close', 'icon-button')}
  </div>` : '';
}

export function renderShell({ content, view, enabled, weather, feedback, photo }) {
  const locked = view === 'home';
  const footer = `<footer class="phone-footer ${locked ? 'home-footer' : ''}">
    ${locked ? `${action('unlock', '进入桌面', 'fingerprint', 'icon-button unlock-button')}
    <div class="lock-meta">
      <span class="lock-weather" title="${weather.source === 'decoration' ? '装饰天气' : '构画剧情天气'}">
        ${icon('sun')}<span>${escape(weather.text)} ${escape(weather.temperature)}</span>
      </span>
      <span class="home-date"></span>
    </div>
    ${action('close', '关闭手机', 'phone-close', 'icon-button close-button lock-close')}` : renderNavigation(view, enabled)}
  </footer>`;

  return `${renderStatusBar()}
    <main class="phone-main view-${view}">${content}</main>
    ${renderFeedback(feedback)}
    ${footer}${renderPhotoViewer(photo)}`;
}
