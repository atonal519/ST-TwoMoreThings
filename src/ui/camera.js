import { escape, icon } from './shared.js';
import { imageSource } from '../image-files.js';

export function renderCamera(state, { ui, busy, camera }) {
  const value = camera?.readPresets() || { presets: [], selectedId: '' }, preset = value.presets.find(row => row.id === value.selectedId);
  const template = preset?.prompts.find(row => row.id === preset.promptId), working = [...busy].some(key => key.startsWith('camera:'));
  const photo = state.albumPhotos?.some(row => row.path === ui.cameraPhoto?.path) ? ui.cameraPhoto : null;
  return `<header class="page-heading camera-heading"><div class="page-title-row"><h1>相机</h1></div><button type="button" class="camera-button is-primary" data-action="camera-generate" ${working || !template?.prompt?.trim() ? 'disabled' : ''}>${icon('camera')}<span>${busy.has('camera:generate') ? '生成中…' : '生成'}</span></button></header>
    <label class="camera-label" for="camera-preset">照片预设</label>
    <div class="camera-preset-row"><select id="camera-preset" aria-label="照片预设" ${working || !value.presets.length ? 'disabled' : ''}>${value.presets.length ? value.presets.map(row => `<option value="${escape(row.id)}" ${row.id === preset?.id ? 'selected' : ''}>${escape(row.name)}</option>`).join('') : '<option value="">暂无预设</option>'}</select><button type="button" class="camera-button" data-action="camera-new" ${working ? 'disabled' : ''}>新建</button><button type="button" class="camera-button" data-action="camera-edit" ${working || !preset ? 'disabled' : ''}>编辑</button></div>
    <div class="camera-result" aria-label="成图">${photo ? `<button type="button" data-action="camera-view" aria-label="查看本次成图"><img data-phone-image="${escape(photo.path)}" src="${escape(imageSource(photo.path))}" alt="${escape(photo.description)}"></button>` : ''}</div>`;
}
