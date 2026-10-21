import test from 'node:test';
import assert from 'node:assert/strict';
import { syncQuickReply } from '../src/quick-reply.js';

function fixture() {
  const sets = new Map(), active = new Set();
  const api = {
    settings: { isEnabled: false, config: { hasSet: set => active.has(set.name) } },
    getSetByName: name => sets.get(name),
    createSet: async name => { const set = { name, qrList: [], save: async () => {} }; sets.set(name, set); return set; },
    createQuickReply: (name, label, value) => sets.get(name).qrList.push({ label, ...value }),
    updateQuickReply: (name, label, value) => Object.assign(sets.get(name).qrList.find(qr => qr.label === label), value),
    deleteQuickReply: (name, label) => { const set = sets.get(name); set.qrList = set.qrList.filter(qr => qr.label !== label); },
    addGlobalSet: name => active.add(name), removeGlobalSet: name => active.delete(name), deleteSet: async name => sets.delete(name),
  };
  return { api, sets, active };
}

test('QR is opt-in, creates one manual launcher, and disabling removes only that launcher', async () => {
  const { api, sets, active } = fixture();
  await syncQuickReply(api, false);
  assert.equal(sets.size, 0);
  await syncQuickReply(api, true); await syncQuickReply(api, true);
  const set = sets.get('两三事');
  assert.equal(set.qrList.length, 1);
  assert.equal(set.qrList[0].label, '手机');
  assert.equal(set.qrList[0].message, '/tmt-open');
  assert.equal(set.qrList[0].executeBeforeGeneration, false);
  assert.equal(set.qrList[0].executeOnAi, false);
  assert.equal(api.settings.isEnabled, false, '不修改宿主 QR 总开关');
  set.qrList.push({ label: '用户按钮', message: '/echo 保留' });
  await syncQuickReply(api, false);
  assert.deepEqual(set.qrList.map(qr => qr.label), ['用户按钮']);
  assert.equal(active.has('两三事'), true);
});

test('an empty generated QR set is removed; a conflicting user button is preserved', async () => {
  const { api, sets, active } = fixture();
  await syncQuickReply(api, true); await syncQuickReply(api, false);
  assert.equal(sets.size, 0); assert.equal(active.size, 0);
  await api.createSet('两三事');
  sets.get('两三事').qrList.push({ label: '手机', message: '/echo 自己的按钮' });
  await assert.rejects(syncQuickReply(api, true), /同名按钮/);
  assert.equal(sets.get('两三事').qrList[0].message, '/echo 自己的按钮');
  await assert.rejects(syncQuickReply(null, true), /快速回复/);
});

test('embedded QR uses its own command and removal leaves the standalone launcher intact', async () => {
  const { api, sets } = fixture();
  const card = { setName: '两三事 · 随卡', command: 'tmt-card-open' };
  await syncQuickReply(api, true);
  await syncQuickReply(api, true, card);
  assert.equal(sets.get(card.setName).qrList[0].message, '/tmt-card-open');
  assert.equal(sets.get(card.setName).qrList[0].label, '手机');
  await syncQuickReply(api, false, card);
  assert.equal(sets.has(card.setName), false);
  assert.equal(sets.get('两三事').qrList[0].message, '/tmt-open');
});

test('existing standalone and embedded launchers become 手机 without leaving duplicate buttons', async () => {
  for (const options of [{}, { setName: '两三事 · 随卡', command: 'tmt-card-open' }]) {
    const { api, sets } = fixture(), setName = options.setName || '两三事';
    const set = await api.createSet(setName);
    set.qrList.push({ label: setName, message: `/${options.command || 'tmt-open'}`, automationId: '' });
    set.qrList.push({ label: '用户按钮', message: '/echo 保留' });
    await syncQuickReply(api, true, options);
    await syncQuickReply(api, true, options);
    assert.deepEqual(set.qrList.map(qr => qr.label), ['用户按钮', '手机']);
    await syncQuickReply(api, false, options);
    assert.deepEqual(sets.get(setName).qrList.map(qr => qr.label), ['用户按钮']);
  }
});

test('turning off an old launcher removes it while an unrelated old-label button stays untouched', async () => {
  const { api, sets } = fixture(), set = await api.createSet('两三事');
  set.qrList.push({ label: '两三事', message: '/tmt-open' });
  await syncQuickReply(api, false);
  assert.equal(sets.size, 0);
  const userSet = await api.createSet('两三事');
  userSet.qrList.push({ label: '两三事', message: '/echo 保留' });
  await syncQuickReply(api, true);
  assert.deepEqual(userSet.qrList.map(qr => qr.message), ['/echo 保留', '/tmt-open']);
});

test('a disabled card hides only its launcher while retaining the QR set and other user buttons', async () => {
  const { api, sets, active } = fixture();
  await syncQuickReply(api, true);
  const set = sets.get('两三事'), launcher = set.qrList.find(qr => qr.label === '手机');
  set.qrList.push({ label: '用户按钮', message: '/echo 保留', isHidden: false });
  await syncQuickReply(api, true, { visible: false });
  assert.equal(launcher.isHidden, true);
  assert.equal(sets.get('两三事'), set, 'hiding does not delete and recreate the shared QR set');
  assert.equal(set.qrList.find(qr => qr.label === '用户按钮').isHidden, false);
  assert.equal(active.has('两三事'), true);
  await syncQuickReply(api, true, { visible: true });
  assert.equal(launcher.isHidden, false);
  assert.equal(set.qrList.find(qr => qr.label === '手机'), launcher);
  assert.equal(api.settings.isEnabled, false);
});

test('a QR preference enabled on a disabled card creates a hidden launcher', async () => {
  const { api, sets } = fixture();
  await syncQuickReply(api, true, { visible: false });
  assert.equal(sets.get('两三事').qrList[0].isHidden, true);
});
