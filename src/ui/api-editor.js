export function openApiEditor({ documentRef: doc, dialog, apiSettings, isNew = false, onSaved = () => {} }) {
  const selected = isNew ? null : apiSettings.getSelected(), ref = selected ? { ...selected } : null;
  const source = apiSettings.listSources().find(item => item.ref.kind === ref?.kind && item.ref.presetId === ref?.presetId);
  if (!isNew && !source) throw new Error('这条连接已不存在，请重新选择。');
  const initial = isNew ? { url: '', key: '', model: '' } : apiSettings.readDraft(ref);
  let alive = true, deleted = false;
  const form = doc.createElement('form'); form.className = 'api-editor-form';
  const element = (tag, className = '', text = '') => { const node = doc.createElement(tag); node.className = className; node.textContent = text; return node; };
  const input = (field, value = '', type = 'text') => { const node = element('input'); node.type = type; node.value = value; node.id = `api-editor-${field}`; return node; };
  const field = (label, control) => { const node = element('label', 'api-editor-field'); node.append(element('span', 'field-label', label), control); return node; };
  const name = input('name', isNew ? '' : source.label), url = input('url', initial.url, 'url'), key = input('key', '', 'password'), model = input('model', initial.model);
  key.placeholder = isNew ? '输入 API 密钥' : '已保存，留空保持不变'; key.autocomplete = 'off'; url.placeholder = 'https://example.invalid/v1'; model.placeholder = '模型名称';
  const feedback = element('p', 'api-editor-feedback'); feedback.setAttribute('aria-live', 'polite');
  const message = (text, error = false) => { if (alive) { feedback.textContent = text; feedback.className = `api-editor-feedback${error ? ' is-error' : ''}`; } };
  const draft = () => ({ url: url.value, key: key.value, model: model.value });
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
  search.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); event.stopPropagation(); } });
  search.addEventListener('input', renderModels);
  modelRow.append(model, button('拉取模型', async () => {
    const response = await apiSettings.fetchModels(draft(), deleted ? null : ref); if (!alive) return;
    models = response; if (!model.value.trim() && models[0]) model.value = models[0]; modelPanel.hidden = false; renderModels(); message(`已拉取 ${models.length} 个模型。`);
  }));
  modelPanel.append(search, list);
  form.append(field('预设名称', name), field('接口地址', url), field('密钥', key), field('模型', modelRow), modelPanel);
  if (!isNew) form.append(element('p', 'setting-note', '地址、密钥和名称共享；模型只保存在当前两三事实例。'));
  if (!isNew) {
    const actions = element('div', 'api-actions'), copy = element('div', 'api-editor-confirm'); copy.hidden = true;
    const copyName = input('copy-name');
    const saveCopy = button('保存副本', async () => {
      if (!copyName.value.trim()) throw new Error('请输入预设名称。');
      await apiSettings.saveAs(draft(), copyName.value, deleted ? null : ref, { select: false }); copy.hidden = true; if (alive) onSaved(); message('共享连接已另存，当前用途保持不变。');
    });
    copyName.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); event.stopPropagation(); saveCopy.click(); } });
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
  return dialog.custom({ title: isNew ? '新增 API' : '编辑 API', content: form, confirmText: '保存', cancelText: '取消', onClose: () => { alive = false; }, submit: async () => {
    if (!name.value.trim()) throw new Error('请输入预设名称。');
    if (isNew) await apiSettings.createPreset(draft(), name.value);
    else await apiSettings.saveCurrent(draft(), ref, name.value);
    if (alive) onSaved(); return true;
  } });
}
