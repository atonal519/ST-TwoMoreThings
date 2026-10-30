import { action, escape } from './shared.js';
import { renderPhotoViewer } from './cards.js';
import { renderLockMeta, renderStatusBar } from './status.js';
import { renderConflict } from './conflict.js';

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

export function renderShell({ content, view, enabled, weather, feedback, photo, conflict, mode, conflictBusy, lockStyle, settingsVersion = '' }) {
  const locked = view === 'home', themed = locked && ['stacked', 'rounded'].includes(lockStyle);
  const footer = `<footer class="phone-footer ${locked ? 'home-footer' : ''}">
    ${locked ? `${action('unlock', '进入桌面', 'fingerprint', 'icon-button unlock-button')}
    ${themed ? '' : renderLockMeta(weather)}
    ${action('close', '关闭手机', 'phone-close', 'icon-button close-button lock-close')}` : renderNavigation(view, enabled)}
  </footer>`;

  return `${renderStatusBar({ notificationsEnabled: enabled && !conflict && !photo })}
    <main class="phone-main view-${view}${themed ? lockStyle === 'rounded' ? ' is-rounded' : ' is-stacked' : locked ? ' is-classic' : ''}">${content}${locked ? footer : ''}</main>
    ${conflict ? '' : renderFeedback(feedback)}
    ${settingsVersion}
    ${locked ? '' : footer}${renderPhotoViewer(photo)}
    ${conflict ? renderConflict({ mode, busy: conflictBusy, feedbackMarkup: renderFeedback(feedback) }) : ''}`;
}
