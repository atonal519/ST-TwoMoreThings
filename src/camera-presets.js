import { createUuid } from './uuid.js';
import { characterKey } from './photowall.js';

export const cameraRole = index => index === 0 ? 'A' : index === 1 ? 'B' : String(index + 1);
export function newCameraPreset() {
  const prompt = { id: `camera-prompt:${createUuid()}`, name: '提示词', prompt: '' };
  return { id: `camera:${createUuid()}`, name: '', groups: [], groupId: '', prompts: [prompt], promptId: prompt.id, mode: 'direct' };
}

// 旧方案只投影为草稿，首次明确保存才归当前聊天所有。
export function readCamera(state, legacy = {}) {
  if (Object.hasOwn(state, 'camera')) return state.camera || { presets: [], selectedId: '' };
  const groups = (state.photoWall?.schemes || []).map(row => ({ id: row.id, name: row.name, people: structuredClone(row.people || []) }));
  const prompts = (legacy.templates || []).map(row => ({ id: row.id, name: row.name, prompt: row.prompt }));
  if (!groups.length && (!legacy.explicit || !prompts.length)) return { presets: [], selectedId: '' };
  const preset = { id: 'camera:legacy-wall', name: '原照片墙', groups, groupId: groups.some(row => row.id === state.photoWall?.activeSchemeId) ? state.photoWall.activeSchemeId : groups[0]?.id || '', prompts, promptId: prompts.some(row => row.id === legacy.selectedId) ? legacy.selectedId : prompts[0]?.id || '', mode: 'polish' };
  return { presets: [preset], selectedId: preset.id };
}

export function cleanCameraPreset(id, draft) {
  const name = String(draft.name || '').trim();
  if (!name) throw new Error('请填写预设名称。');
  const groups = (draft.groups || []).map(row => {
    const people = (row.people || []).map(person => ({ name: String(person.name || '').trim(), scope: person.scope || '' }));
    if (people.some(person => !person.name) || new Set(people.map(characterKey)).size !== people.length) throw new Error('人物搭配中有缺失或重复的人物，请重新选择。');
    return { id: row.id, name: String(row.name || '').trim() || '人物搭配', people };
  });
  const prompts = (draft.prompts || []).map(row => ({ id: row.id, name: String(row.name || '').trim() || '提示词', prompt: typeof row.prompt === 'string' ? row.prompt : '' }));
  for (const rows of [groups, prompts]) if (rows.some(row => !row.id) || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('预设内的条目编号无法对应，请重新打开编辑。');
  if (draft.groupId && !groups.some(row => row.id === draft.groupId) || draft.promptId && !prompts.some(row => row.id === draft.promptId)) throw new Error('请选择已有的人物搭配和提示词。');
  return { id: id || `camera:${createUuid()}`, name, groups, groupId: draft.groupId || '', prompts, promptId: draft.promptId || '', mode: draft.mode === 'polish' ? 'polish' : 'direct' };
}
