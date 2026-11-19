import { apiOptions } from '../api-options.js';
import { icon } from './shared.js';
import { submitOnEnter } from './editing.js';

export function openApiEditor({ documentRef: doc, dialog, apiSettings, isNew = false, onSaved = () => {}, isComposing = () => false }) {
  const selected = isNew ? null : apiSettings.getSelected(), ref = selected ? { ...selected } : null;
  const source = apiSettings.listSources().find(item => item.ref.kind === ref?.kind && item.ref.presetId === ref?.presetId);
  if (!isNew && !source) throw new Error('这条连接已不存在，请重新选择。');
  const initial = isNew ? { url: '', key: '', model: '', stream: false, timeoutSec: 180, excludeParams: [], tmtTemperature: '', tmtAdditionalParams: '', tmtRetryCount: 0 } : apiSettings.readDraft(ref);
  let alive = true, deleted = false;
  const form = doc.createElement('form'); form.className = 'api-editor-form';
  const element = (tag, className = '', text = '') => { const node = doc.createElement(tag); node.className = className; node.textContent = text; return node; };
  const input = (field, value = '', type = 'text') => { const node = element('input'); node.type = type; node.value = value; node.id = `api-editor-${field}`; return node; };
  const field = (label, control) => { const node = element('label', 'api-editor-field'); node.append(element('span', 'field-label', label), control); return node; };
  const name = input('name', isNew ? '' : source.label), url = input('url', initial.url, 'url'), key = input('key', '', 'password'), model = input('model', initial.model);
  key.placeholder = isNew ? '输入 API 密钥' : '已保存，留空保持不变'; key.autocomplete = 'off'; url.placeholder = 'https://example.invalid/v1'; model.placeholder = '模型名称';
  const feedback = element('p', 'api-editor-feedback'); feedback.setAttribute('aria-live', 'polite');
  const message = (text, error = false) => { if (alive) { feedback.textContent = text; feedback.className = `api-editor-feedback${error ? ' is-error' : ''}`; } };
  const stream = input('stream', '', 'checkbox'); stream.checked = initial.stream === true;
  const temperature = input('temperature', initial.tmtTemperature, 'number'); temperature.min = '0'; temperature.max = '2'; temperature.step = '0.01'; temperature.placeholder = '留空使用默认值';
  const timeout = input('timeout', initial.timeoutSec, 'number'); timeout.min = '5'; timeout.max = '600'; timeout.step = '1';
  const retry = input('retry', initial.tmtRetryCount, 'number'); retry.min = '0'; retry.step = '1';
  const exclude = element('textarea'); exclude.id = 'api-editor-exclude'; exclude.rows = 2; exclude.value = Array.isArray(initial.excludeParams) ? initial.excludeParams.join('\n') : initial.excludeParams;
  const additional = element('textarea'); additional.id = 'api-editor-additional'; additional.rows = 3; additional.value = initial.tmtAdditionalParams; additional.placeholder = '{}';
  const controls = { url, model, stream, timeoutSec: timeout, excludeParams: exclude, tmtTemperature: temperature, tmtAdditionalParams: additional, tmtRetryCount: retry };
  const valueOf = control => control.type === 'checkbox' ? control.checked : control.value;
  const initialValues = Object.fromEntries(Object.entries(controls).map(([name, control]) => [name, valueOf(control)]));
  const draft = (copy = false) => {
    apiOptions(Object.fromEntries(Object.entries(controls).map(([name, control]) => [name, valueOf(control)])));
    const value = { key: key.value };
    for (const [name, control] of Object.entries(controls)) if (isNew || deleted || valueOf(control) !== initialValues[name] || copy && name === 'model') value[name] = valueOf(control);
    return value;
  };
  const button = (label, action, disabledWhen = () => false) => {
    const node = element('button', 'quiet-button', label); node.type = 'button';
    node.addEventListener('click', async () => {
      if (node.disabled) return; node.disabled = true;
      try { await action(); } catch (error) { message(error?.message || '操作未完成，请重试。', true); }
      finally { node.disabled = !alive || disabledWhen(); }
    });
    return node;
  };
  const modelRow = element('div', 'api-model-row'), list = element('div', 'model-options'), modelPanel = element('div', 'model-popup'); modelPanel.hidden = true;
  const search = input('model-search'); search.type = 'search'; search.placeholder = '搜索模型…'; search.setAttribute('aria-label', '搜索模型');
  let models = [];
  const renderModels = () => {
    const query = search.value.trim().toLocaleLowerCase(), shown = models.filter(value => value.toLocaleLowerCase().includes(query));
    list.replaceChildren(...shown.map(value => { const node = button(value, async () => { model.value = value; renderModels(); }); node.setAttribute('aria-selected', String(value === model.value)); return node; }));
    if (!shown.length) list.append(element('div', 'model-empty', '无匹配项'));
  };
  search.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229 && !isComposing(search)) { event.preventDefault(); event.stopPropagation(); } });
  search.addEventListener('input', renderModels);
  modelRow.append(model, button('拉取模型', async () => {
    const response = await apiSettings.fetchModels({ url: url.value, key: key.value }, deleted ? null : ref); if (!alive) return;
    models = response; if (!model.value.trim() && models[0]) model.value = models[0]; modelPanel.hidden = false; renderModels(); message(`已拉取 ${models.length} 个模型。`);
  }));
  modelPanel.append(search, list);
  form.append(field('预设名称', name), field('接口地址', url), field('密钥', key), field('模型', modelRow), modelPanel);
  const advanced = element('div', 'api-editor-advanced'); advanced.open = false;
  const toggle = button('高级参数', async () => {
    advanced.open = !advanced.open; advancedBody.hidden = !advanced.open; toggle.setAttribute('aria-expanded', String(advanced.open));
  });
  toggle.className = 'api-editor-advanced-toggle'; toggle.setAttribute('aria-expanded', 'false');
  const arrow = element('span', 'api-editor-advanced-arrow'); arrow.innerHTML = icon('next'); toggle.append(arrow);
  const advancedBody = element('div', 'api-editor-advanced-body'); advancedBody.hidden = true;
  const streamLabel = element('label', 'api-editor-stream'); streamLabel.append(stream, element('span', '', '流式请求'));
  advancedBody.append(streamLabel, field('两三事温度（0–2）', temperature), field('超时秒数', timeout), field('排除参数', exclude), field('附加参数（JSON）', additional), field('失败重试次数', retry), element('p', 'setting-note', '流式、超时、排除参数与共享预设共用；温度、附加参数和重试次数仅用于两三事。0 次重试只发一次请求。'));
  advanced.append(toggle, advancedBody); form.append(advanced);
  if (!isNew) form.append(element('p', 'setting-note', '地址、密钥和名称共享；模型只保存在当前两三事实例。'));
  if (!isNew) {
    const actions = element('div', 'api-actions'), copy = element('div', 'api-editor-confirm'); copy.hidden = true;
    const copyName = input('copy-name');
    const saveCopy = button('保存副本', async () => {
      if (!copyName.value.trim()) throw new Error('请输入预设名称。');
      await apiSettings.saveAs(draft(true), copyName.value, deleted ? null : ref, { select: false }); copy.hidden = true; if (alive) onSaved(); message('共享连接已另存，当前用途保持不变。');
    });
    copyName.addEventListener('keydown', event => {
      if (submitOnEnter(event, () => saveCopy.click(), isComposing(copyName))) event.stopPropagation();
    });
    copy.append(field('副本名称', copyName), saveCopy, button('取消另存', async () => { copy.hidden = true; }));
    actions.append(button('另存为', async () => { copyName.value = name.value; copy.hidden = false; copyName.focus(); }));
    const confirm = element('div', 'api-editor-confirm'); confirm.hidden = true;
    const remove = button('删除', async () => {
      confirm.replaceChildren(element('p', 'setting-note', `删除「${source.label}」？使用此共享预设的插件将无法继续使用该连接。`), button('确认删除', async () => {
        await apiSettings.deletePreset(ref); deleted = true; confirm.hidden = true; key.placeholder = '原连接已删除，另存请输入密钥'; remove.disabled = true; if (alive) onSaved(); message('连接已删除，原输入仍保留；填写密钥后可另存。');
      }), button('返回编辑', async () => { confirm.hidden = true; })); confirm.hidden = false;
    }, () => deleted);
    remove.className += ' danger'; actions.append(remove); form.append(actions, copy, confirm);
  }
  form.append(feedback);
  return dialog.custom({ title: isNew ? '新增 API' : '编辑 API', content: form, confirmText: '保存', cancelText: '取消', initialFocus: 'panel', onClose: () => { alive = false; }, submit: async () => {
    if (!name.value.trim()) throw new Error('请输入预设名称。');
    if (isNew) await apiSettings.createPreset(draft(), name.value);
    else await apiSettings.saveCurrent(draft(), ref, name.value === source.label ? undefined : name.value);
    if (alive) onSaved(); return true;
  } });
}
