import { action, pageHeading } from './shared.js';

export function renderAuthoring(state, { ui, busy }) {
  return `${pageHeading('随卡包')}
    <div class="authoring-summary">${state.contacts.length} 位联系人 · ${(state.groups || []).length} 个群聊</div>
    <label class="field-label" for="export-source">核心来源</label>
    <select id="export-source" aria-label="核心来源">
      <option value="remote" ${ui.exportLocal ? '' : 'selected'}>跟随正式更新</option>
      <option value="local" ${ui.exportLocal ? 'selected' : ''}>本机测试</option>
    </select>
    ${ui.exportLocal ? '<p class="authoring-note">测试包仅适用于当前酒馆。</p>' : ''}
    <div class="form-actions">
      ${action('export-card', busy.has('export') ? '打包中…' : '导出', '', 'save-button', busy.has('export'))}
      ${action('back-authoring', '返回', '', 'quiet-button')}
    </div>`;
}
