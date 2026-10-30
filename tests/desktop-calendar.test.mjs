import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDesktop } from '../src/ui/desktop.js';

const now = new Date(2024, 1, 29, 12, 0), render = calendar => renderDesktop({}, { apps: [], calendar, now });

test('desktop has a static real-date calendar without Gouhua, including leap-day highlight', () => {
  const markup = render(null);
  assert.match(markup, /class="desktop-calendar"/); assert.match(markup, /2024年/); assert.match(markup, /2月/); assert.match(markup, /2月29日 · 周四/); assert.match(markup, /desktop-week-day is-today[\s\S]*?<span>29<\/span>/);
  assert.doesNotMatch(markup, /data-action="open-calendar"/);
});

test('a source with no reliable today uses the same static fallback without mutating source data', () => {
  for (const source of [
    { today: '', yearLabel: '', days: [{ day: 1, isToday: false, items: [] }] },
    { today: '未定位日期', days: [{ day: 1, isToday: false, items: [] }] },
    { today: '', days: [{ day: 1, isToday: true, items: [] }] },
  ]) { const before = structuredClone(source); assert.match(render(source), /2月29日 · 周四/); assert.doesNotMatch(render(source), /data-action="open-calendar"/); assert.deepEqual(source, before); }
});

test('a reliable story calendar replaces the placeholder and keeps its own yearless three-day week and action', () => {
  const story = { today: '雨季三月二日', yearLabel: '', monthName: '雨季三月', columns: 3, leading: 0, weekdays: ['雾', '雨', '晴'], days: [{ day: 1, isToday: false, items: [] }, { day: 2, isToday: true, items: [{ name: '灯会' }] }, { day: 3, isToday: false, items: [] }] }, before = structuredClone(story);
  const markup = render(story); assert.match(markup, /<button[^>]*class="desktop-calendar"[^>]*data-action="open-calendar"/); assert.match(markup, /雨季三月/); assert.match(markup, /灯会/); assert.match(markup, /--desktop-week-columns:3/); assert.doesNotMatch(markup, /2024年/); assert.deepEqual(story, before);
  assert.match(render(null), /2月29日 · 周四/); assert.match(render(story), /雨季三月/, 'next existing render adopts the real source');
});
