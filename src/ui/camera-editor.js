import { createUuid } from '../uuid.js';
import { characterKey } from '../photowall.js';
import { escape } from './shared.js';

// 内层操作仅编辑本弹窗草稿，文本输入不重挂节点。
export function createCameraPresetEditor({ documentRef: doc, draft, readCharacters }) {
  const form = doc.createElement('form'); form.className = 'camera-preset-form';
  const button = (action, label) => `<button type="button" class="camera-button" data-camera-editor="${action}">${label}</button>`;
  form.innerHTML = `<label class="camera-field"><span>预设名称</span><input name="presetName" aria-label="预设名称" value="${escape(draft.name)}" required></label>
    <section class="camera-editor-section"><label class="camera-label" for="camera-group">人物搭配</label><div class="camera-preset-row"><select id="camera-group" aria-label="人物搭配"></select>${button('new-group', '新建')}${button('edit-group', '编辑')}</div><p class="camera-group-summary"></p>
      <div class="camera-group-editor" hidden><label class="camera-field"><span>搭配名称</span><input name="groupName" aria-label="搭配名称"></label><div class="camera-character-checks"></div><p class="camera-editor-error" role="alert"></p><div class="camera-editor-actions">${button('remove-group', '移除搭配')}${button('finish-group', '完成')}</div></div></section>
    <section class="camera-editor-section"><label class="camera-label" for="camera-prompt">提示词</label><div class="camera-preset-row"><select id="camera-prompt" aria-label="提示词"></select>${button('new-prompt', '新建')}${button('remove-prompt', '移除')}</div><div class="camera-prompt-editor"><label class="camera-field"><input name="promptName" aria-label="提示词名称"></label><label class="camera-field"><textarea name="promptText" aria-label="提示词内容" rows="5"></textarea></label></div></section>
    <div class="camera-editor-mode"><span class="camera-label">生图方式</span><div role="group" aria-label="生图方式">${button('direct', '原词直出')}${button('polish', '人设润色')}</div></div>`;
  const find = selector => form.querySelector(selector), groupSelect = find('#camera-group'), promptSelect = find('#camera-prompt');
  const group = () => draft.groups.find(row => row.id === draft.groupId), prompt = () => draft.prompts.find(row => row.id === draft.promptId);
  let groupOpen = false, catalog = [];
  const options = (rows, id, empty) => `<option value="">${empty}</option>${rows.map(row => `<option value="${escape(row.id)}" ${row.id === id ? 'selected' : ''}>${escape(row.name)}</option>`).join('')}`;
  function modes() {
    const hasPeople = Boolean(group()?.people.length);
    for (const mode of ['direct', 'polish']) {
      const node = find(`[data-camera-editor="${mode}"]`);
      node.disabled = mode === 'polish' && !hasPeople;
      node.setAttribute('aria-pressed', String(mode === (hasPeople ? draft.mode : 'direct')));
    }
    const selected = group();
    find('.camera-group-summary').textContent = selected?.people.map(person => person.name).join('、') || '';
    find('.camera-group-summary').hidden = groupOpen || !selected?.people.length;
  }
  function renderGroups() {
    groupSelect.innerHTML = options(draft.groups, draft.groupId, '不选人物');
    const selected = group();
    find('[name="groupName"]').value = selected?.name || '';
    find('[data-camera-editor="edit-group"]').disabled = !selected;
    find('.camera-group-editor').hidden = !selected || !groupOpen;
    const keys = new Set(selected?.people.map(characterKey) || []);
    const available = [...catalog, ...(selected?.people || []).filter(person => !catalog.some(row => characterKey(row) === characterKey(person)))];
    find('.camera-character-checks').innerHTML = available.map(person => `<label><span>${escape(person.name)}${person.scope === 'chat' ? ' · 当前聊天' : ''}</span><input type="checkbox" data-camera-person="${escape(characterKey(person))}" ${keys.has(characterKey(person)) ? 'checked' : ''}></label>`).join('');
    modes();
  }
  function renderPrompts() {
    promptSelect.innerHTML = options(draft.prompts, draft.promptId, '未选提示词');
    const selected = prompt();
    find('.camera-prompt-editor').hidden = !selected;
    find('[data-camera-editor="remove-prompt"]').disabled = !selected;
    find('[name="promptName"]').value = selected?.name || '';
    find('[name="promptText"]').value = selected?.prompt || '';
  }
  function openGroup() {
    groupOpen = true; find('.camera-editor-error').textContent = '';
    try { catalog = readCharacters(); } catch (error) { find('.camera-editor-error').textContent = error.message; }
    renderGroups();
  }
  form.addEventListener('input', event => {
    event.stopPropagation(); const { name, value } = event.target;
    if (name === 'presetName') draft.name = value;
    if (name === 'groupName' && group()) { group().name = value; const option = groupSelect.selectedOptions[0]; if (option) option.textContent = value || '人物搭配'; }
    if (name === 'promptName' && prompt()) { prompt().name = value; const option = promptSelect.selectedOptions[0]; if (option) option.textContent = value || '提示词'; }
    if (name === 'promptText' && prompt()) prompt().prompt = value;
  });
  form.addEventListener('change', event => {
    event.stopPropagation();
    if (event.target === groupSelect) { draft.groupId = groupSelect.value; groupOpen = false; renderGroups(); }
    if (event.target === promptSelect) { draft.promptId = promptSelect.value; renderPrompts(); }
    if (event.target.dataset.cameraPerson && group()) {
      const key = event.target.dataset.cameraPerson, person = catalog.find(row => characterKey(row) === key) || group().people.find(row => characterKey(row) === key);
      if (person) group().people = event.target.checked ? [...group().people.filter(row => characterKey(row) !== key), { ...person }] : group().people.filter(row => characterKey(row) !== key);
      modes();
    }
  });
  form.addEventListener('click', event => {
    const action = event.target.closest('[data-camera-editor]')?.dataset.cameraEditor;
    if (!action) return; event.stopPropagation();
    if (action === 'new-group') { const row = { id: `camera-group:${createUuid()}`, name: '新搭配', people: [] }; draft.groups.push(row); draft.groupId = row.id; openGroup(); find('[name="groupName"]').focus(); }
    if (action === 'edit-group') { if (groupOpen) { groupOpen = false; renderGroups(); } else openGroup(); }
    if (action === 'finish-group') { groupOpen = false; renderGroups(); }
    if (action === 'remove-group') { draft.groups = draft.groups.filter(row => row.id !== draft.groupId); draft.groupId = ''; groupOpen = false; renderGroups(); }
    if (action === 'new-prompt') { const row = { id: `camera-prompt:${createUuid()}`, name: '新提示词', prompt: '' }; draft.prompts.push(row); draft.promptId = row.id; renderPrompts(); find('[name="promptName"]').focus(); }
    if (action === 'remove-prompt') { draft.prompts = draft.prompts.filter(row => row.id !== draft.promptId); draft.promptId = draft.prompts[0]?.id || ''; renderPrompts(); }
    if (['direct', 'polish'].includes(action)) { draft.mode = action; modes(); }
  });
  renderGroups(); renderPrompts();
  return { form, draft };
}
