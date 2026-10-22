import { renderModelPicker } from './models.js';
import { homeImage } from './home.js';
import { action, avatar, escape, icon, pageHeading, refKey } from './shared.js';
import { displayName } from '../profiles.js';
import { renderBackgroundPicker } from './backgrounds.js';
import { VERSION } from '../version.js';

export function renderSettings(state, { ui, busy, apiSettings, imageProviders, entries, appearance, control, mode, updates }) {
  const sources = apiSettings.listSources(), selected = apiSettings.getSelected();
  const current = sources.find(source => refKey(source.ref) === refKey(selected));
  const manual = ui.manual || !sources.length, preferences = entries.read();
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
  const connectionDetails = manual ? `<form class="api-form">
    <label class="field-label" for="api-url">接口地址</label>
    <input id="api-url" name="url" type="url" placeholder="https://…/v1" value="${escape(ui.apiDraft.url || '')}" required>
    <label class="field-label" for="api-key">密钥</label>
    <input id="api-key" name="key" type="password" placeholder="输入 API 密钥" value="${escape(ui.apiDraft.key || '')}" autocomplete="off" required>
    ${renderModelPicker(ui, busy)}
    <button type="submit" class="save-button" ${busy.has('api') ? 'disabled' : ''}>保存</button>
  </form>` : current ? `<div class="connection-summary">
    <span class="connection-dot"></span>
    <strong>${escape(current.model || '尚未选择模型')}</strong>
  </div>` : '';
  const connection = `<label class="field-label" for="api-source">使用的配置</label>
    <select id="api-source" aria-label="使用的配置">
      ${!manual && !current ? '<option value="" selected disabled>请选择现有连接</option>' : ''}
      <option value="manual" ${manual ? 'selected' : ''}>自行填写</option>
      ${sources.map(source => `<option value="${escape(refKey(source.ref))}" ${!manual && refKey(source.ref) === refKey(selected) ? 'selected' : ''}>${escape(source.label)}</option>`).join('')}
    </select>
    ${connectionDetails}`;
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
  <small class="field-label">短材料由主楼一起判断；超过3000字才额外生成摘要。</small>
  <label class="compact-switch-row" for="image-provider">
    <span>生图设置</span>
    <select id="image-provider" class="image-provider-select" aria-label="生图设置" ${busy.has('image-provider') ? 'disabled' : ''}>
      <option value="baibai" ${imageProviders?.getSelected() !== 'chatu8' ? 'selected' : ''}>柏宝绘</option>
      <option value="chatu8" ${imageProviders?.getSelected() === 'chatu8' ? 'selected' : ''}>智绘姬</option>
    </select>
  </label>
  <div class="compact-switch-row settings-export-row">
    <span>导出酒馆助手脚本</span>
    <button type="button" class="switch-button" data-action="authoring" aria-label="导出酒馆助手脚本" ${control.isEnabled() ? '' : 'disabled'}>导出</button>
  </div>${updates ? '<div data-update-notice></div>' : ''}`;
  return `${pageHeading('设置')}
    <div class="master-switch-row">
    <label class="compact-switch-row master-switch">
      <span>启用两三事</span>
      <span class="switch">
        <input id="phone-enabled" type="checkbox" role="switch" aria-label="启用两三事" ${control.isEnabled() ? 'checked' : ''} ${busy.has('enabled') ? 'disabled' : ''}>
        <span></span>
      </span>
    </label>
    ${updates ? '<div data-update-controls></div>' : ''}
    </div>
    ${updates ? '<div data-update-feedback></div>' : ''}
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
    <small class="app-version"><span>两三事 ${VERSION}</span> · <span>${instanceLabel}</span></small>`;
}
