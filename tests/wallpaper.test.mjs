import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createWallpaperService } from '../src/wallpaper.js';

for (const hostKind of ['native', 'luker']) for (const kind of ['contact', 'group']) {
  test(`${hostKind}: ${kind} form saves a new background together with its profile and preserves it when omitted`, async () => {
    const h = createHarness({ hostKind, metadata: { foreign: { keep: true } } });
    const store = createPhoneStore({ target: h.host.captureChat() });
    await store.upsertContacts([{ id: 'lin', name: '林舟' }]);
    const save = draft => kind === 'contact' ? store.saveContact('', draft) : store.saveGroup('', draft);
    const person = await save({ name: '朋友', memberIds: ['lin'], userIsMember: true, background: 'color:rose' });
    assert.equal(person.background, 'color:rose');
    const change = draft => kind === 'contact' ? store.saveContact(person.id, draft) : store.saveGroup(person.id, draft);
    const updated = await change({ ...person, background: 'color:sage' });
    assert.equal(updated.background, 'color:sage');
    const { background, ...remaining } = updated;
    assert.equal((await change(remaining)).background, 'color:sage');
    assert.equal((await change({ ...remaining, background: '' })).background, '');
    const before = structuredClone(store.read()), saves = h.metadataSaves;
    await assert.rejects(change({ ...remaining, background: 'javascript:bad' }), /背景/);
    assert.equal(h.metadataSaves, saves);
    assert.deepEqual(store.read(), before);
    assert.deepEqual(h.persistedMetadata.foreign, { keep: true });
  });
}

test('uploading a form background returns a reusable path without changing the archive or lock wallpaper', async () => {
  const h = createHarness({ completion: { path: '/user/images/form.webp' } });
  const store = createPhoneStore({ target: h.host.captureChat() });
  await store.setWallpaper('day', 'builtin:glass-lake');
  const before = structuredClone(store.read()), saves = h.metadataSaves;
  const service = createWallpaperService({ host: h.host, store });
  assert.equal(await service.uploadImage('data:image/webp;base64,dGVzdA=='), '/user/images/form.webp');
  assert.deepEqual(store.read(), before);
  assert.equal(h.metadataSaves, saves);
  assert.equal(h.modelRequests.length, 1);
  assert.equal(h.modelRequests[0].path, '/api/images/upload');
});

for (const hostKind of ['native', 'luker']) for (const kind of ['contact', 'group']) {
  test(`${hostKind}: ${kind} background upload, color selection and restore only change that conversation`, async () => {
    const h = createHarness({ hostKind, metadata: { foreign: { keep: true } }, completion: { path: 'user/images/chat.webp' } });
    const store = createPhoneStore({ target: h.host.captureChat() });
    await store.upsertContacts([{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }]);
    const group = await store.saveGroup('', { name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: true });
    await store.setWallpaper('day', 'builtin:glass-lake');
    await store.setChatBackground('zhou', 'color:rose');
    await store.appendMessage('lin', { id: 'sms', role: 'user', text: '下午见' });
    const id = kind === 'contact' ? 'lin' : group.id;
    const key = kind === 'contact' ? 'contacts' : 'groups';
    const expected = structuredClone(store.read()), saves = h.metadataSaves;
    const expectedPerson = expected[key].find(person => person.id === id);
    const service = createWallpaperService({ host: h.host, store });
    assert.equal(await service.uploadChat(id, 'data:image/webp;base64,dGVzdA=='), '/user/images/chat.webp');
    expectedPerson.background = '/user/images/chat.webp';
    assert.deepEqual(store.read(), expected);
    assert.equal(h.modelRequests.length, 1);
    assert.equal(h.modelRequests[0].path, '/api/images/upload');
    assert.equal(h.modelRequests[0].body.image, 'dGVzdA==');
    assert.equal(h.modelRequests[0].headers['X-CSRF-Token'], 'test-csrf');
    await store.setChatBackground(id, 'color:sage');
    expectedPerson.background = 'color:sage';
    assert.deepEqual(store.read(), expected);
    await store.setChatBackground(id, '');
    expectedPerson.background = '';
    assert.deepEqual(store.read(), expected);
    assert.deepEqual(h.persistedMetadata, { foreign: { keep: true }, pocketPhone: expected });
    assert.equal(h.metadataSaves, saves + 3);
    assert.equal(h.modelRequests.length, 1, 'color selection and restore do not upload, delete files or call a model');
    assert.equal(JSON.stringify(h.persistedMetadata).includes('base64'), false);
  });
}

for (const hostKind of ['native', 'luker']) test(`${hostKind}: wallpaper upload uses host image storage and saves only a theme-specific path`, async () => {
  const h = createHarness({ metadata: { foreign: { keep: true } }, completion: { path: '/user/images/pocket-phone/background.webp' } });
  const store = createPhoneStore({ target: h.host.captureChat() });
  const service = createWallpaperService({ host: h.host, store });
  await service.upload('day', 'data:image/webp;base64,dGVzdA==');
  assert.equal(h.modelRequests[0].path, '/api/images/upload');
  assert.equal(h.modelRequests[0].body.ch_name, 'pocket-phone');
  assert.equal(h.modelRequests[0].body.format, 'webp');
  assert.equal(h.modelRequests[0].body.image, 'dGVzdA==');
  assert.equal(h.modelRequests[0].headers['X-CSRF-Token'], 'test-csrf');
  assert.deepEqual(store.read().wallpapers, { day: '/user/images/pocket-phone/background.webp' });
  assert.equal(JSON.stringify(h.persistedMetadata).includes('base64'), false);
  assert.deepEqual(h.context.chatMetadata.foreign, { keep: true });
  await store.setWallpaper('night', '/user/images/pocket-phone/night.webp');
  await service.restore('day');
  assert.equal(store.read().wallpapers.day, '');
  assert.equal(store.read().wallpapers.night, '/user/images/pocket-phone/night.webp');
  assert.equal(h.modelRequests.length, 1, '恢复默认不请求模型或删除图片文件');
});

test('failed image upload does not replace the saved wallpaper', async () => {
  const h = createHarness({ completion: {} });
  const store = createPhoneStore({ target: h.host.captureChat() });
  const service = createWallpaperService({ host: h.host, store });
  await store.setWallpaper('day', '/user/images/pocket-phone/old.webp');
  const saved = h.metadataSaves;
  await assert.rejects(service.upload('day', 'data:image/webp;base64,dGVzdA=='), /图片地址/);
  h.host.request = async () => Response.json({}, { status: 500 });
  await assert.rejects(service.upload('day', 'data:image/webp;base64,dGVzdA=='), /背景图片上传失败/);
  assert.equal(store.read().wallpapers.day, '/user/images/pocket-phone/old.webp');
  assert.equal(h.metadataSaves, saved);
});
