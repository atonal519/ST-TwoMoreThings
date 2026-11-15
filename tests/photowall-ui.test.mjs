import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderDesktop } from '../src/ui/desktop.js';
import { renderPhotoWall, photoWallImage } from '../src/ui/photowall.js';
const apps = ['liangshi','social','messages','forum','calendar','album','settings','favorites','inspect-phone'].map(id => ({ id, label: id }));
const state = { photoWall: { schemes: [{ id: 'p', name: '当前方案', people: [{ name: '甲', scope: 'chat' }, { name: '乙', scope: 'global' }] }], photos: [{ id: 'old', path: '/user/images/a.png', people: [{ name: '甲' }, { name: '乙' }], schemeId: 'removed', schemeName: '旧方案' }], activeSchemeId: 'p', desktopPhotoId: 'old' } };
test('desktop keeps first five-row grid and second six-row grid with four-by-four photo', () => {
  const markup = renderDesktop(state, { apps });
  assert.equal((markup.match(/class="desktop-grid"/g)||[]).length, 2);
  assert.match(markup, /data-action="photowall-open"/); assert.match(markup, /data-phone-image="\/user\/images\/a.png"/);
  assert.equal((markup.match(/class="photowall-app-slot"/g)||[]).length, 4);
  assert.match(markup, /desktop-calendar-time/); assert.doesNotMatch(markup, /desktop-calendar-anchor|desktop-widget-space/);
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /grid-template-rows: repeat\(5, 71.5px\)/); assert.match(css, /margin-inline: var\(--desktop-widget-inset\)/);
  assert.match(css, /--desktop-widget-columns: 4/); assert.match(css, /--desktop-widget-columns: 2/);
  assert.match(css, /grid-template-rows: repeat\(6, 71.5px\)/);
  assert.match(css, /\.photowall-desktop-photo \{[^}]*grid-column: 1 \/ 5; grid-row: 1 \/ 5/);
  assert.match(css, /\.photowall-widget-slot \{[^}]*grid-column: 3 \/ 5; grid-row: 5 \/ 7/);
  assert.match(css, /\.photowall-desktop-photo img \{[^}]*object-fit: cover;[^}]*transform: scale\(1.04\)/);
  assert.match(css, /\.photowall-thumbnail img \{[^}]*object-fit: contain/);
});
test('manager keeps photos visible across schemes/removal, has no photo deletion or sample content', () => {
  const markup = renderPhotoWall(state, { ui: { photoWallCharacters: [] }, busy: new Set() });
  assert.match(markup, /旧方案的合照/); assert.match(markup, /photowall-new/); assert.match(markup, /photowall-edit/); assert.match(markup, /photowall-person-0/);
  assert.match(markup, /当前桌面/); assert.doesNotMatch(markup, /删除照片|photowall-delete|预览不生成|data:image/);
  assert.match(renderPhotoWall({}, { ui: {}, busy: new Set() }), /生成第一张合照/);
});


test('wall viewer receives only original path and a short caption, while missing photos have no viewer', () => {
  const photo = { ...state.photoWall.photos[0], prompt: 'DO_NOT_RENDER_THE_FULL_PROMPT', nl: 'DO_NOT_RENDER_THE_FULL_NL', seed: 7 };
  assert.deepEqual(photoWallImage(photo), { path: '/user/images/a.png', description: '甲 与 乙 · 合照' });
  assert.equal(photoWallImage({ ...photo, missing: true }), null); assert.equal(photoWallImage(undefined), null);
  assert.match(renderPhotoWall(state, { ui: {}, busy: new Set() }), /aria-label="查看旧方案的合照"/);
});

test('legacy missing photos have no count, thumbnail, selected action or broken desktop placeholder', () => {
  const old = { ...state, photoWall: { ...state.photoWall, photos: state.photoWall.photos.map(photo => ({ ...photo, missing: true })) } };
  const markup = renderPhotoWall(old, { ui: { photoWallPhotoId: 'old' }, busy: new Set() });
  assert.match(markup, /照片<span>0张<\/span>/); assert.match(markup, /生成第一张合照/);
  assert.doesNotMatch(markup, /data-photowall-photo=|data-phone-image=|图片已失效|换一张|photowall-photo-actions/);
  const desktop = renderDesktop(old, { apps });
  assert.match(desktop, /data-action="photowall-open"[^>]*><span>照片墙<\/span>/);
  assert.doesNotMatch(desktop, /data-phone-image=|照片已失效/);
  const mixed = { ...old, photoWall: { ...old.photoWall, photos: [...old.photoWall.photos, { ...state.photoWall.photos[0], id: 'valid', path: '/user/images/valid.png' }] } };
  const withValid = renderPhotoWall(mixed, { ui: { photoWallPhotoId: 'old' }, busy: new Set() });
  assert.match(withValid, /照片<span>1张<\/span>/); assert.match(withValid, /data-photowall-photo="valid"/);
  assert.doesNotMatch(withValid, /data-photowall-photo="old"/);
});


test('prompt selection is independent, escaped and disabled only when no template is available', () => {
 const ui={photoWallCharacters:[{name:'甲'},{name:'乙'}]}, busy=new Set();
 const photoWall={readTemplates:()=>({templates:[{id:'t',name:'<海边>',prompt:'never inline'}],selectedId:'t'})};
 const markup=renderPhotoWall(state,{ui,busy,photoWall});
 assert.match(markup,/提示词方案/);assert.match(markup,/&lt;海边&gt;/);assert.doesNotMatch(markup,/never inline/);
 assert.match(markup,/photowall-template-new/);assert.match(markup,/photowall-template-edit/);
 assert.doesNotMatch(markup,/data-action="photowall-generate" disabled/);
 const empty=renderPhotoWall(state,{ui,busy,photoWall:{readTemplates:()=>({templates:[],selectedId:''})}});
 assert.match(empty,/data-action="photowall-generate" disabled/);assert.match(empty,/人物方案/);
});
