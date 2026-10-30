import { renderSourcePicker } from './models.js';
import { homeImage } from './home.js';
import { action, avatar, escape, icon, pageHeading, refKey } from './shared.js';
import { displayName } from '../profiles.js';
import { renderBackgroundPicker } from './backgrounds.js';
import { VERSION } from '../version.js';

export function renderStorySmsInstall(ui, busy, control) {
  const state = ui.storySmsStatus?.state;
  const checking = busy.has('story-sms-status'), installing = busy.has('story-sms-install');
  return `<div class="compact-switch-row" data-story-sms-install><span>楼内信息注入</span>
    <button type="button" class="switch-button" data-action="install-story-sms" ${checking || installing || state === 'installed' || !control.isEnabled() ? 'disabled' : ''}>${checking ? '读取中' : installing ? '注入中' : state === 'installed' ? '已注入' : state === 'outdated' ? '更新' : '注入'}</button></div>`;
}

export function renderSettingsVersion(mode, updates) {
  return `<small class="app-version"><span class="app-version-label"><span>两三事 ${VERSION}</span> · <span>${mode === 'embedded' ? '随卡版' : '插件版'}</span></span>${updates ? '<span data-update-notice></span>' : ''}</small>`;
}

export function renderSettings(state, { ui, busy, apiSettings, imageProviders, entries, appearance, control, mode, updates }) {
  const sources = apiSettings.listSources(), selected = apiSettings.getSelected();
  const current = sources.find(source => refKey(source.ref) === refKey(selected));
  const preferences = entries.read();
  const instanceLabel = mode === 'embedded' ? '随卡版' : '插件版';
  const drawer = (key, title, content) => `<section class="settings-drawer">
    <button type="button" class="settings-drawer-toggle" data-drawer="${key}" aria-expanded="${ui.drawers[key]}">
      <span>${title}</span>${icon('next')}
    </button>
    ${ui.drawers[key] ? `<div class="settings-drawer-body">${content}</div>` : ''}
  </section>`;
  const entrySwitch = (key, label) => `<label class="compact-switch-row">
    <span>${label}</span>
    <span class="switch">
      <input type="checkbox" role="switch" aria-label="${label}" data-entry-preference="${key}" ${preferences[key] ? 'checked' : ''} ${busy.has('entry') ? 'disabled' : ''}>
      <span></span>
    </span>
  </label>`;
  const connection = `<label class="field-label" for="api-source">使用的配置</label>
    <div class="api-source-row">${renderSourcePicker(ui, sources, selected)}${action('api-edit', '编辑', '', 'quiet-button', busy.has('api') || !current)}</div>
    <div class="api-actions">${action('api-new', '新增 API', '', 'quiet-button', busy.has('api'))}</div>
    <p class="setting-note">新增连接后，可在用途中选择。</p>`;
  const appearanceContent = `<label class="field-label" for="phone-theme">主题</label>
    <select id="phone-theme" aria-label="外观主题">
      <option value="day" ${state.theme !== 'night' ? 'selected' : ''}>日间 · 回声</option>
      <option value="night" ${state.theme === 'night' ? 'selected' : ''}>夜间 · 深蓝</option>
    </select>
    <label class="compact-switch-row" for="phone-lock-style">
      <span>锁屏样式</span>
      <select id="phone-lock-style" class="lock-style-select" aria-label="锁屏样式" ${busy.has('lock-style') ? 'disabled' : ''}>
        <option value="classic" ${!['stacked', 'rounded'].includes(state.lockStyle) ? 'selected' : ''}>默认</option>
        <option value="stacked" ${state.lockStyle === 'stacked' ? 'selected' : ''}>纵时</option>
        <option value="rounded" ${state.lockStyle === 'rounded' ? 'selected' : ''}>圆时</option>
      </select>
    </label>
    ${entrySwitch('fabShow', '悬浮球')}
    ${entrySwitch('qrShow', 'QR')}
    <label class="compact-switch-row">
      <span>粒子效果</span>
      <span class="switch">
        <input id="particles-enabled" type="checkbox" role="switch" aria-label="粒子效果" ${appearance.particlesEnabled() ? 'checked' : ''} ${busy.has('particles') ? 'disabled' : ''}>
        <span></span>
      </span>
    </label>
    <label class="field-label" for="font-css-url">字体 CSS URL</label>
    <input id="font-css-url" type="url" aria-label="字体 CSS URL" value="${escape(appearance.fontPreference().cssUrl)}" placeholder="https://…/font.css" autocomplete="off" spellcheck="false">
    ${action('restore-font', '恢复默认字体', '', 'quiet-button')}
    <p class="setting-note">留空使用系统字体，日韩原文保留手写体。</p>
    <span class="field-label">锁屏背景</span>
    <div class="wallpaper-editor">
      ${renderBackgroundPicker({ value: state.wallpapers?.[state.theme === 'night' ? 'night' : 'day'], theme: state.theme,
        defaultPreset: state.lockStyle === 'stacked' ? 'glass-lake' : state.lockStyle === 'rounded' ? 'paper-petals' : undefined,
        busy: busy.has('wallpaper'), preview: homeImage({ ...state, wallpapers: {} }).src })}
    </div>`;
  const content = `<label class="compact-switch-row">
    <span>短信带入正文</span>
    <span class="switch">
      <input id="inject-enabled" type="checkbox" role="switch" aria-label="短信带入正文" ${state.injectEnabled ? 'checked' : ''}>
      <span></span>
    </span>
  </label>
  ${renderStorySmsInstall(ui, busy, control)}
  <label class="compact-switch-row" for="default-language"><span>默认语言</span>
    <select id="default-language" class="default-language-select" aria-label="默认语言" ${busy.has('default-language') ? 'disabled' : ''}>
      ${[['', '自动'], ['中文', '汉语'], ['英语', '英语'], ['粤语', '粤语'], ['日语', '日语'], ['韩语', '韩语']].map(([value, label]) => `<option value="${value}" ${(state.defaultLanguage || '') === value ? 'selected' : ''}>${label}</option>`).join('')}
    </select>
  </label>
  <label class="compact-switch-row" for="image-provider">
    <span>生图设置</span>
    <select id="image-provider" class="image-provider-select" aria-label="生图设置" ${busy.has('image-provider') ? 'disabled' : ''}>
      <option value="baibai" ${imageProviders?.getSelected() !== 'chatu8' ? 'selected' : ''}>柏宝绘</option>
      <option value="chatu8" ${imageProviders?.getSelected() === 'chatu8' ? 'selected' : ''}>智绘姬</option>
    </select>
  </label>`;
  return `${pageHeading('设置')}
    <div class="master-switch-row">
    <label for="phone-enabled">启用两三事</label>
    <div class="master-switch-actions">
      ${updates ? '<div data-update-controls></div>' : ''}
      <label class="switch">
        <input id="phone-enabled" type="checkbox" role="switch" aria-label="启用两三事" ${control.isEnabled() ? 'checked' : ''} ${busy.has('enabled') ? 'disabled' : ''}>
        <span></span>
      </label>
    </div>
    </div>
    ${control.isEnabled() ? '' : `<p class="setting-note">${instanceLabel}已在当前角色卡停用，重新开启后可使用其他页面。</p>`}
    <section class="settings-section">
      <button type="button" class="my-profile" data-action="edit-user" aria-label="编辑我的资料" ${control.isEnabled() ? '' : 'disabled'}>
        ${avatar(state.userProfile || { name: ui.defaultUser })}
        <span>
          <strong>${escape(displayName(state.userProfile || { name: ui.defaultUser }))}</strong>
          <small>我的资料</small>
        </span>
        ${icon('next')}
      </button>
    </section>
    ${drawer('connection', '连接设置', connection)}
    ${drawer('appearance', '外观设置', appearanceContent)}
    ${drawer('content', '内容设置', content)}
    <div class="compact-switch-row settings-export-row">
      <span>导出酒馆助手脚本</span>
      <button type="button" class="switch-button" data-action="authoring" aria-label="导出酒馆助手脚本" ${control.isEnabled() ? '' : 'disabled'}>导出</button>
    </div>`;
}
