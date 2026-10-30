import { action, empty, escape } from './shared.js';
import { imageSource } from '../image-files.js';
import { readAlbumPhotos, findAlbumPhoto } from '../album.js';

const heading = (title, extra = '', back = false) => `<header class="album-heading">${back ? action('album-back', '返回上页', 'arrow', 'icon-button') : ''}<h1>${title}</h1>${extra}</header>`;

function renderEditor(model = {}) {
  const positions = model.tab !== 'result', disabled = model.loading || model.error || model.exporting;
  return `${heading('打孔拼贴', '<button type="button" class="quiet-button" data-action="album-reset">重置</button>', true)}
    <div class="album-template-row" aria-label="拼贴模板">${[['circle', '圆孔'], ['swallow', '燕子']].map(([key, label]) => `<button type="button" data-album-template="${key}" aria-pressed="${model.template === key}" ${model.loading ? 'disabled' : ''}>${label}</button>`).join('')}</div>
    <div class="album-edit-stage">${model.loading ? '<p role="status">正在读取照片…</p>' : model.error ? `<p role="alert">${escape(model.error)}</p>` : positions ? '<div class="album-source-surface"><canvas data-album-hole-canvas aria-label="照片孔位，拖动调整"></canvas></div>' : '<button type="button" class="album-result-surface" data-action="album-zoom" aria-label="放大拼贴作品"><canvas data-album-result-canvas aria-label="拼贴成品"></canvas></button>'}</div>
    ${positions ? `<div class="album-size-row"><label for="album-hole-size">孔位大小</label><input id="album-hole-size" type="range" min="0.65" max="1.25" step="0.05" value="${model.size || 1}" aria-label="孔位大小" ${disabled ? 'disabled' : ''}></div><p class="album-editor-hint">拖动孔位，选择取下的画面</p>` : `<p class="album-editor-hint">轻点作品放大查看</p><div class="album-actionbar album-result-actions"><button type="button" class="save-button" data-action="album-export" ${disabled ? 'disabled' : ''}>导出作品</button><button type="button" class="quiet-button" data-action="album-export-pieces" ${disabled ? 'disabled' : ''}>导出碎片</button></div>`}
    <div class="album-editor-tabs" role="tablist" aria-label="打孔页面"><button type="button" role="tab" data-album-tab="positions" aria-selected="${positions}">选孔位</button><button type="button" role="tab" data-album-tab="result" aria-selected="${!positions}">看成品</button></div>`;
}

export function renderAlbum(state, { ui, albumEditor }) {
  const options = { defaultUser: ui.defaultUser }, photos = readAlbumPhotos(state, options);
  const photo = ui.albumPath && findAlbumPhoto(state, ui.albumPath, options);
  if (ui.albumPage === 'editor' && photo) return renderEditor(albumEditor);
  if (ui.albumPage !== 'gallery' && photo) {
    return `${heading('照片', '', true)}<div class="album-scroll album-detail-scroll">
      <button type="button" class="album-detail-photo" data-action="album-view" aria-label="放大照片"><img data-phone-image="${escape(photo.path)}" src="${escape(imageSource(photo.path))}" alt="${escape(photo.description)}"></button>
      <div class="album-detail-meta">${photo.description ? `<p>${escape(photo.description)}</p>` : ''}${photo.sources.map(source => `<div><span>${escape(source.label)}</span><small>${escape(source.publishedAt || '未标日期')}</small></div>`).join('')}</div>
    </div><div class="album-actionbar"><button type="button" class="save-button" data-action="album-edit">打孔拼贴</button></div>`;
  }
  const groups = new Map();
  for (const photo of photos) {
    const key = photo.dateLabel || '未标日期';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(photo);
  }
  return `${heading('相册', `<small>${photos.length} 张</small>`)}<div class="album-scroll album-gallery">${photos.length ? [...groups].map(([label, rows]) => `<section><div class="album-day"><strong>${escape(label)}</strong></div><div class="album-grid">${rows.map(photo => `<button type="button" class="album-photo" data-album-photo="${escape(photo.path)}" aria-label="${escape(photo.description || '查看照片')}"><img data-phone-image="${escape(photo.path)}" src="${escape(imageSource(photo.path))}" alt="${escape(photo.description)}" loading="lazy" decoding="async" draggable="false"><span>${escape(photo.sources[0].label.split(' · ')[0])}</span></button>`).join('')}</div></section>`).join('') : empty('还没有照片', '短信、动态和帖子里的图片会显示在这里。', 'image')}</div>`;
}
