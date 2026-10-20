import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppearanceSettings } from '../src/appearance.js';
import { createHostAdapter } from '../src/host.js';

for (const kind of ['native', 'luker']) test(`${kind}: particles use one global preference across cards and runtime modes`, async () => {
  const settings = { pocketPhone: { fabShow: false }, twoMoreThingsEmbedded: { qrShow: true } };
  let saves = 0;
  const context = { extensionSettings: settings, saveSettingsDebounced: async () => { saves++; } };
  if (kind === 'luker') context.saveChatMetadata = async () => true;
  const documentRef = new EventTarget();
  const regular = createAppearanceSettings({ host: createHostAdapter({ contextProvider: () => context }), documentRef });
  const embedded = createAppearanceSettings({ host: createHostAdapter({ contextProvider: () => context, mode: 'embedded' }), documentRef });
  let notifications = 0;
  const unsubscribe = embedded.subscribe(() => { notifications++; });
  assert.equal(regular.particlesEnabled(), true);
  await regular.setParticlesEnabled(false);
  assert.equal(embedded.particlesEnabled(), false);
  context.chatId = 'another-card';
  assert.equal(regular.particlesEnabled(), false);
  assert.deepEqual(settings, { pocketPhone: { fabShow: false, particlesEnabled: false }, twoMoreThingsEmbedded: { qrShow: true } });
  await embedded.setParticlesEnabled(true);
  assert.equal(regular.particlesEnabled(), true);
  assert.equal(notifications, 2);
  assert.equal(saves, 2);
  unsubscribe();
  await regular.setParticlesEnabled(false);
  assert.equal(notifications, 2);
});

test('failed appearance save preserves the previous global settings', async () => {
  const previous = { fabShow: false };
  const settings = { pocketPhone: previous };
  const appearance = createAppearanceSettings({ host: { readSettings: () => settings, saveSettings: async () => { throw Error('offline'); } } });
  await assert.rejects(appearance.setParticlesEnabled(false), /外观设置保存失败/);
  assert.equal(settings.pocketPhone, previous);
  assert.equal(appearance.particlesEnabled(), true);
});
