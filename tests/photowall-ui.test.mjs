import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderDesktop } from '../src/ui/desktop.js';
import { readPhotoWallImage } from '../src/photowall.js';
import { renderCamera } from '../src/ui/camera.js';
import { renderAlbum } from '../src/ui/album.js';
const apps = ['liangshi','social','messages','forum','calendar','album','settings','favorites','inspect-phone','camera'].map(id => ({ id, label: id }));
const photo = { id: 'old', path: '/user/images/a.png', people: [{ name: '甲' }, { name: '乙' }], schemeName: '旧方案' };
const state = { photoWall: { schemes: [], photos: [photo], desktopPhotoId: 'old' } };
test('desktop keeps both grids and the wall, with camera eighth on the first screen and favorites in the second-screen slot', () => {
  const markup = renderDesktop(state, { apps });
  assert.equal((markup.match(/class="desktop-grid"/g)||[]).length, 2); assert.match(markup, /data-action="album-open"/); assert.match(markup, /data-phone-image="\/user\/images\/a.png"/);
  const [first, second] = markup.split('data-desktop-page="1"');
  const ids = html => [...html.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(ids(first), ['liangshi', 'social', 'messages', 'forum', 'calendar', 'album', 'settings', 'camera']);
  assert.deepEqual(ids(second), ['inspect-phone', 'favorites']);
  assert.deepEqual(ids(second.match(/data-slot="1">([\s\S]*?)<\/div>/)[1]), ['favorites']);
  assert.equal((markup.match(/data-tab="camera"/g) || []).length, 1);
  assert.equal((markup.match(/data-tab="favorites"/g) || []).length, 1);
  assert.equal((markup.match(/class="photowall-app-slot"/g)||[]).length, 4);
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /grid-template-rows: repeat\(5, 71.5px\)/); assert.match(css, /grid-template-rows: repeat\(6, 71.5px\)/);
  assert.match(css, /\.photowall-desktop-photo \{[^}]*grid-column: 1 \/ 5; grid-row: 1 \/ 5/); assert.match(css, /\.photowall-desktop-photo img \{[^}]*object-fit: cover;[^}]*transform: scale\(1.04\)/);
  assert.match(css, /\.camera-button \{[^}]*height: 26.4px/); assert.match(css, /\.camera-result img \{[^}]*object-fit: contain/);
});
test('main camera contains the preset row, generation and a blank result without editor fields', () => {
  const camera = { readPresets: () => ({ presets: [{ id: 'p', name: '<预设>', prompts: [{ id: 't', prompt: 'PRIVATE_PROMPT' }], promptId: 't' }], selectedId: 'p' }) };
  const html = renderCamera({}, { ui: {}, busy: new Set(), camera });
  assert.match(html, /camera-generate/); assert.match(html, /camera-new/); assert.match(html, /camera-edit/); assert.match(html, /&lt;预设&gt;/);
  assert.doesNotMatch(html, /textarea|人物搭配|生图方式|PRIVATE_PROMPT|<img/);
  const result = { path: '/user/images/a.png', description: '成图' }, options = { ui: { cameraPhoto: result }, busy: new Set(), camera };
  assert.match(renderCamera({ albumPhotos: [result] }, options), /data-phone-image="\/user\/images\/a.png"/);
  assert.doesNotMatch(renderCamera({ albumPhotos: [] }, options), /<img/);
});
test('legacy wall references and new path pointers read without writes, including explicit clear', () => {
  assert.deepEqual(readPhotoWallImage(state), { path: photo.path, description: '甲 与 乙 · 合照' });
  assert.deepEqual(readPhotoWallImage({ photoWall: { desktopPhotoPath: '/user/images/zero.png', desktopPhotoDescription: '纯景' } }), { path: '/user/images/zero.png', description: '纯景' });
  assert.equal(readPhotoWallImage({ photoWall: { ...state.photoWall, desktopPhotoPath: '' } }), null);
  assert.equal(readPhotoWallImage({ photoWall: { ...state.photoWall, photos: [{ ...photo, missing: true }] } }), null);
});
test('album includes legacy wall-only images and its detail exposes wall selection beside collage', () => {
  const ui = { albumPage: 'detail', albumPath: photo.path }, html = renderAlbum({ ...state, photoWall: { ...state.photoWall, desktopPhotoId: '' } }, { ui });
  assert.match(html, /打孔拼贴/); assert.match(html, /设为照片墙/); assert.match(html, /album-wall/);
  const current = renderAlbum({ ...state, photoWall: { ...state.photoWall, desktopPhotoPath: photo.path } }, { ui }); assert.match(current, /调整照片墙/); assert.match(current, /data-action="album-wall">调整照片墙/);
});
