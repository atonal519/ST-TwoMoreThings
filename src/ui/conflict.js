import { action } from './shared.js';

export function renderConflict({ mode, busy, feedbackMarkup = '' }) {
  return `<div class="phone-dialog-backdrop">
    <section class="phone-dialog" role="alertdialog" aria-modal="true" aria-labelledby="phone-conflict-title">
      <h2 id="phone-conflict-title">两份手机同时启用</h2>
      <p>检测到插件版与随卡版同时启用，可能重复生成和回流。建议关闭其中一份。</p>
      <p class="phone-dialog-current">当前打开：${mode === 'embedded' ? '随卡版' : '插件版'}</p>
      <div class="form-actions">
        ${action('conflict-continue', '暂时继续', '', 'quiet-button', busy)}
        ${action('conflict-disable', '关闭当前这份', '', 'save-button', busy)}
      </div>
    </section>
    ${feedbackMarkup}
  </div>`;
}
