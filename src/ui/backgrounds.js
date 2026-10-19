import { chatColors, wallpaperPresets } from '../backgrounds.js';
import { action, escape, icon } from './shared.js';

export function renderBackgroundPicker({ value = '', theme, busy, chat = false, preview }) {
  const entries = chat ? chatColors.map(item => ({ value: `color:${item.id}`, name: item.name, color: item[theme === 'night' ? 'night' : 'day'] }))
    : wallpaperPresets.map(item => ({ value: `builtin:${item.id}`, name: item.name, src: item[theme === 'night' ? 'night' : 'day'] }));
  const attribute = chat ? 'data-chat-background' : 'data-wallpaper';
  const choices = entries.map(item => `<button type="button" class="background-choice" ${attribute}="${escape(item.value)}" aria-label="${item.name}" aria-pressed="${value === item.value}" ${busy ? 'disabled' : ''} ${item.color ? `style="background-color:${item.color}"` : ''}>${item.src ? `<img src="${escape(item.src)}" alt="" draggable="false">` : ''}</button>`).join('');
  const custom = value && !entries.some(item => item.value === value);
  return `<div class="background-choices" role="group" aria-label="${chat ? '聊天背景' : '锁屏背景'}">
    <button type="button" class="background-choice background-default" ${attribute}="" aria-label="默认背景" aria-pressed="${!value}" ${busy ? 'disabled' : ''}>${preview ? `<img src="${escape(preview)}" alt="" draggable="false">` : icon('sun')}</button>
    ${choices}
    <label class="background-choice background-upload ${busy ? 'is-busy' : ''}" aria-label="上传背景">${custom ? `<img src="${escape(value)}" alt="自定义背景">` : icon('plus')}<input id="${chat ? 'chat-background-file' : 'wallpaper-file'}" type="file" accept="image/*" aria-label="${chat ? '选择聊天背景' : '选择主页背景'}" ${busy ? 'disabled' : ''}></label>
  </div>${value ? action(chat ? 'restore-chat-background' : 'restore-wallpaper', '恢复默认', '', 'quiet-button background-restore', busy) : ''}`;
}
