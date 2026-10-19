import { asset, avatar, escape } from './shared.js';
import { unreadConversations } from '../notifications.js';
import { displayName } from '../profiles.js';
import { wallpaperPreset } from '../backgrounds.js';

export function homeImage(state) {
  const night = state.theme === 'night', custom = state.wallpapers?.[night ? 'night' : 'day'];
  const preset = wallpaperPreset(custom);
  return { custom: Boolean(custom), src: preset?.[night ? 'night' : 'day'] || custom || asset(night ? 'night-fold-foreground.png' : 'echo-foreground.png'), alt: preset?.name || (custom ? '自定义主页背景' : night ? '银白与深蓝折叠线带，内折处一抹朱红' : '矿蓝与青铜色的回声线环') };
}

export function renderHome(state) {
  const night = state.theme === 'night';
  const image = homeImage(state);
  // Dorsa 的数字不等宽；四个字位固定，分钟变化时保持整组比例。
  return `<div class="home-artboard">
    ${image.custom ? `<img class="home-wallpaper" src="${escape(image.src)}" alt="${image.alt}" draggable="false">` : ''}
    <svg class="home-clock" viewBox="0 0 340 420" preserveAspectRatio="none" role="img" aria-label="当前时间">
      <text y="345" text-anchor="middle"><tspan x="40"></tspan><tspan x="119"></tspan><tspan x="221"></tspan><tspan x="300"></tspan></text>
      <path d="${night ? 'M170 90v.01M170 120v.01' : 'M170 116v.01M170 259v.01'}"
        fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    </svg>
    ${image.custom ? '' : `<img class="home-art" src="${image.src}" alt="${image.alt}" draggable="false">`}
  </div>
  <div class="lock-notifications" aria-label="未读消息">
    ${unreadConversations(state).map(item => `<button type="button" class="lock-notification"
      data-${item.isGroup ? 'group' : 'contact'}="${escape(item.id)}">
      ${avatar(item, true)}
      <span class="notification-copy"><strong>${escape(displayName(item))}</strong><span>${escape(item.preview)}</span></span>
      <small>${item.count}</small>
    </button>`).join('')}
  </div>`;
}
