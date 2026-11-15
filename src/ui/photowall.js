import { escape, icon } from './shared.js';
import { readPhotoWall, characterKey } from '../photowall.js';
import { imageSource } from '../image-files.js';

export function renderCharacterOptions(characters, selected) {
  const key = selected ? characterKey(selected) : '';
  const missing = key && !characters.some(person => characterKey(person) === key);
  return `<option value="">请选择人物</option>${missing ? `<option value="${escape(key)}" selected disabled>${escape(selected.name)} · 目录中已不存在</option>` : ''}${characters.map(person => `<option value="${escape(characterKey(person))}" ${characterKey(person) === key ? 'selected' : ''}>${escape(person.name)}${person.scope === 'chat' ? ' · 当前聊天' : ''}</option>`).join('')}`;
}

export function photoWallImage(photo) {
  return photo && !photo.missing ? { path: photo.path, description: `${photo.people.map(person => person.name).join(' 与 ')} · 合照` } : null;
}

export function renderPhotoWall(state, { ui, busy, photoWall }) {
  const wall = readPhotoWall(state), scheme = wall.schemes.find(row => row.id === wall.activeSchemeId);
  const photo = wall.photos.find(row => row.id === ui.photoWallPhotoId) || wall.photos.find(row => row.id === wall.desktopPhotoId) || wall.photos.at(-1);
  const templates = photoWall?.readTemplates() || { templates: [], selectedId: '' }, template = templates.templates.find(row => row.id === templates.selectedId);
  const working = [...busy].some(key => key.startsWith('photowall:'));
  const button = (action, label, image = '', primary = false, disabled = false, attributes = '') => `<button type="button" class="quiet-button photowall-button${primary ? ' is-primary' : ''}" data-action="${action}" ${disabled ? 'disabled' : ''} ${attributes}>${image ? icon(image) : ''}<span>${label}</span></button>`;
  return `<header class="page-heading"><div class="page-title-row"><h1>照片墙</h1></div></header>
    <label class="photowall-group-label" for="photowall-scheme">人物方案</label>
    <div class="photowall-scheme-row"><select id="photowall-scheme" class="photowall-scheme-picker" aria-label="人物方案" ${!wall.schemes.length || working ? 'disabled' : ''}>${wall.schemes.length ? wall.schemes.map(row => `<option value="${escape(row.id)}" ${row.id === scheme?.id ? 'selected' : ''}>${escape(row.name)}</option>`).join('') : '<option value="">暂无方案</option>'}</select>${button('photowall-new', '新建', '', false, working)}${button('photowall-edit', '编辑', '', false, !scheme || working)}</div>
    <div class="photowall-fields">${['A', 'B'].map((role, index) => `<label class="photowall-field"><span>人物${role}</span><select id="photowall-person-${index}" aria-label="人物${role}" ${!scheme || working ? 'disabled' : ''}>${renderCharacterOptions(ui.photoWallCharacters || [], scheme?.people[index])}</select></label>`).join('')}</div>
    <label class="photowall-group-label" for="photowall-template">提示词方案</label>
    <div class="photowall-scheme-row"><select id="photowall-template" class="photowall-scheme-picker" aria-label="提示词方案" ${!templates.templates.length || working ? 'disabled' : ''}>${templates.templates.length ? templates.templates.map(row => `<option value="${escape(row.id)}" ${row.id === template?.id ? 'selected' : ''}>${escape(row.name)}</option>`).join('') : '<option value="">暂无方案</option>'}</select>${button('photowall-template-new', '新建', '', false, working)}${button('photowall-template-edit', '编辑', '', false, !template || working)}</div>
    <div class="photowall-generate-row">${button('photowall-generate', busy.has('photowall:generate') ? '生成中…' : '生成', 'refresh', true, !scheme || !template || working || !ui.photoWallCharacters?.length)}</div>
    <div class="photowall-gallery-head">照片<span>${wall.photos.length}张</span></div>
    <div class="photowall-thumbnails" aria-label="已存照片">${wall.photos.length ? wall.photos.map(row => `<button type="button" class="photowall-thumbnail" data-action="photowall-select" data-photowall-photo="${escape(row.id)}" aria-label="查看${escape(row.schemeName)}的合照" aria-pressed="${row.id === photo?.id}"><span class="photowall-thumbnail-image"><img src="${escape(imageSource(row.path))}" data-phone-image="${escape(row.path)}" alt="${escape(row.people.map(person => person.name).join('与'))}的合照" loading="lazy" draggable="false"></span><span>${escape(row.schemeName)}<small>${row.id === wall.desktopPhotoId ? '当前桌面' : '柏宝绘'}</small></span></button>`).join('') : '<p class="empty-hint">选好两位人物，生成第一张合照。</p>'}</div>
    ${photo ? `<div class="photowall-photo-actions"><div class="photowall-selected-copy">${escape(photo.people.map(person => person.name).join(' × '))}<br>${escape(photo.schemeName)}</div>${button('photowall-desktop', photo.id === wall.desktopPhotoId ? '当前桌面' : '设为桌面', '', false, working || photo.id === wall.desktopPhotoId, `data-photowall-photo="${escape(photo.id)}"`)}</div>` : ''}`;
}
