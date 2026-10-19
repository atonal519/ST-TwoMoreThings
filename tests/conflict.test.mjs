import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createHostAdapter } from '../src/host.js';
import { createPhoneControl } from '../src/control.js';

const mounted = (...ids) => ({ getElementById: id => ids.includes(id) ? {} : null });
const both = mounted('pocket-phone-launch', 'pocket-phone-card-launch');

for (const hostKind of ['native', 'luker']) {
  test(`${hostKind}: conflict needs both running entries and both current-card switches`, async () => {
    const h = createHarness({ hostKind }), target = h.host.captureChat();
    const embeddedHost = createHostAdapter({ contextProvider: () => h.context, mode: 'embedded' });
    const local = createPhoneControl({ host: h.host, target });
    const card = createPhoneControl({ host: embeddedHost, target });
    assert.equal(local.hasConflict(mounted('pocket-phone-launch')), false);
    assert.equal(card.hasConflict(mounted('pocket-phone-card-launch')), false);
    assert.equal(local.hasConflict(both), true);
    assert.equal(card.hasConflict(both), true);
    await local.setEnabled(false);
    assert.equal(local.hasConflict(both), false);
    assert.equal(card.hasConflict(both), false);
    assert.equal(card.isEnabled(), true, '关闭当前这份不关闭另一份');
    await local.setEnabled(true);
    await card.setEnabled(false);
    assert.equal(local.hasConflict(both), false);
    assert.equal(card.isEnabled(), false);
    assert.equal(local.isEnabled(), true);
    assert.equal(h.metadataSaves, 0, '开关不改手机档案');
  });
}

test('a card marker alone is not a running embedded phone; other cards do not determine this conflict', () => {
  const h = createHarness({ settings: { pocketPhone: { disabledCards: { 'character:另一个.png': true } } } });
  h.context.characters[0].data.extensions.twoMoreThings = { schemaVersion: 1, contacts: [], groups: [] };
  const control = createPhoneControl({ host: h.host, target: h.host.captureChat() });
  assert.equal(control.hasConflict(mounted('pocket-phone-launch')), false);
  assert.equal(control.hasConflict(both), true);
  assert.equal(h.settingsSaves, 0);
});
