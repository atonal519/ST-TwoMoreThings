import { action, escape, icon, refKey } from './shared.js';

export function renderSourcePicker(ui, sources, selected) {
  const value = ui.manual || !sources.length ? 'manual' : refKey(selected);
  const options = [{ value: 'manual', label: '自行填写' }, ...sources.map(source => ({ value: refKey(source.ref), label: source.label }))];
  return `<div class="source-picker">
    <button type="button" id="api-source" class="source-list-toggle" data-action="sources-menu" aria-label="使用的配置" aria-haspopup="listbox" aria-expanded="${ui.sourcesOpen}"><span>${escape(options.find(option => option.value === value)?.label || '请选择现有连接')}</span>${icon('next')}</button>
    ${ui.sourcesOpen ? `<div class="model-popup source-popup"><div class="model-options source-options" role="listbox" aria-label="可用配置">${options.map(option => `<button type="button" role="option" data-api-source="${escape(option.value)}" aria-selected="${option.value === value}">${escape(option.label)}</button>`).join('')}</div></div>` : ''}
  </div>`;
}

// 沿用千千结的内嵌模型列表：只过滤已拉取结果，不因搜索再次请求接口。
export function renderModelOptions(ui) {
  const query = ui.modelSearch.trim().toLocaleLowerCase();
  const shown = ui.models.filter(name => name.toLocaleLowerCase().includes(query));
  return shown.length
    ? shown.map(name => `<button type="button" role="option" aria-selected="${name === ui.apiDraft.model}" data-model="${escape(name)}">${escape(name)}</button>`).join('')
    : '<div class="model-empty" role="status">无匹配项</div>';
}

export function renderModelPicker(ui, busy) {
  const modelList = ui.models.length ? `
    <button type="button" class="model-list-toggle" data-action="models-menu" aria-haspopup="listbox" aria-expanded="${ui.modelsOpen}">
      <span>已拉取 ${ui.models.length} 个模型</span>
      ${icon('next')}
    </button>
    ${ui.modelsOpen ? `<div class="model-popup">
      <input type="search" id="model-search" aria-label="搜索模型" placeholder="搜索模型…" value="${escape(ui.modelSearch)}" autocomplete="off">
      <div class="model-options" role="listbox" aria-label="可用模型">${renderModelOptions(ui)}</div>
    </div>` : ''}` : '';
  return `<label class="field-label" for="api-model">模型</label>
    <div class="model-picker">
      <div class="api-model-row">
        <input id="api-model" name="model" placeholder="输入或选择模型" value="${escape(ui.apiDraft.model || '')}" required>
        ${action('fetch-models', busy.has('models') ? '正在拉取模型' : '拉取模型', 'refresh', 'icon-button', busy.has('models'))}
      </div>
      ${modelList}
    </div>`;
}
