import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader } from '../src/context.js';
import { createMessageService } from '../src/messages.js';
import { createGroupService } from '../src/groups.js';
import { createCalendarReader } from '../src/calendar.js';
import { renderCalendar } from '../src/ui/calendar.js';

test('calendar reference reaches private and group generation once, without entering forum context or saving another calendar', async () => {
  const h = createHarness({ messages: [{ is_user: false, mes: '你和林舟谈起明天的新年庆典。' }] });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.saveContact('', { name: '林舟' });
  const person = store.read().contacts[0];
  await store.saveGroup('', { name: '朋友', memberIds: [person.id], userIsMember: true });
  const group = store.read().groups[0];
  let reads = 0;
  const calendar = { context(query) { reads++; assert.ok(query.includes('新年')); return { today: '2026年12月31日', events: [{ name: '新年', date: '1月1日', when: '1天后', type: 'festival', note: '' }] }; } };
  const contextReader = createContextReader({ target, store, calendar });
  const requests = [], modelClient = { async complete(request) {
    const input = JSON.parse(request.messages[0].content); requests.push(input);
    assert.equal(input.calendar.events[0].name, '新年');
    return input.group ? JSON.stringify({ anchor: { memberIds: [person.id, '@user'], speakerIds: [person.id] }, messages: [{ speakerId: person.id, text: '明天见。' }] }) : '{"messages":[{"text":"明天见。"}]}';
  } };
  await createMessageService({ target, store, contextReader, modelClient }).continueChat(person.id);
  await createGroupService({ target, store, contextReader, modelClient }).continueChat(group.id);
  assert.equal(requests.length, 2);
  assert.equal(reads, 2);
  assert.equal('calendar' in await contextReader.readForForum(), false);
  assert.equal('calendar' in store.read(), false);
  assert.equal(target.messages.length, 1);
});

test('without Gouhua no calendar reference is fabricated', async () => {
  const h = createHarness(), target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.saveContact('', { name: '林舟' });
  const reader = createContextReader({ target, store });
  const context = await reader.readForContact(store.read().contacts[0].id);
  assert.ok(!context.calendar);
});

test('calendar cards label all four date types without adding schedules to the month layout', () => {
  const calendar = { yearLabel: '城历2026年', monthName: '五月', weekdays: [], leading: 0, columns: 7,
    days: [{ day: 1, label: '五月一日', items: ['festival', 'birthday', 'anniversary', 'custom'].map((type, i) => ({ id: String(i), name: type, type, date: '五月一日', days: 1 })) }] };
  const before = structuredClone(calendar), html = renderCalendar({}, { ui: {}, calendar });
  for (const label of ['节日', '生日', '纪念日', '日程']) assert.ok(html.includes(`<small>${label}</small>`), label);
  assert.deepEqual(calendar, before);
});

test('calendar reader forwards the captured chat ID while remaining compatible with event-only v1 providers', () => {
  const event = { today: '五月一日', events: [{ name: '节日', type: 'festival' }] };
  let seen;
  const reader = createCalendarReader({ apiProvider: () => ({ apiVersion: 1, getPhoneCalendarContext(options) { seen = options; return event; }, getPhoneCalendar: () => null }) });
  assert.equal(reader.context('节日', 'captured-A'), event);
  assert.deepEqual(seen, { query: '节日', expectedChatId: 'captured-A', includeSchedules: true });
  assert.equal(reader.month(), null);
  assert.equal(createCalendarReader({ apiProvider: () => null }).context('节日', 'captured-A'), null);
});
