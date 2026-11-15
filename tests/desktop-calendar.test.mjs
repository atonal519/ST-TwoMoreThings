import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDesktop } from '../src/ui/desktop.js';

const now = new Date(2024, 1, 29, 12, 0), render = calendar => renderDesktop({}, { apps: [], calendar, now });

test('desktop has a real-date week calendar without Gouhua, including leap-day highlight', () => {
  const markup = render(null);
  assert.match(markup, /class="desktop-calendar desktop-widget-frame"/); assert.match(markup, /desktop-calendar-header/); assert.match(markup, /desktop-calendar-date/); assert.match(markup, /desktop-calendar-primary/); assert.match(markup, /desktop-calendar-year">2024年/); assert.match(markup, /2月29日 · 周四/); assert.match(markup, /desktop-week-day is-today[\s\S]*?<span>29<\/span>/);
  assert.doesNotMatch(markup, /data-action="open-calendar"/);
  assert.doesNotMatch(renderDesktop({}, { apps: [], now: new Date(2026, 10, 14) }), /desktop-calendar-date is-long-date/);
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
  const markup = render(story); assert.match(markup, /<button[^>]*class="desktop-calendar desktop-widget-frame"[^>]*data-action="open-calendar"/); assert.match(markup, /title="雨季三月二日 · 灯会"/); assert.match(markup, /灯会/); assert.match(markup, /--desktop-week-columns:3/); assert.match(markup, /desktop-calendar-date is-long-date">雨季三月二日/); assert.doesNotMatch(markup, /2024年/); assert.deepEqual(story, before);
  assert.match(render(null), /2月29日 · 周四/); assert.match(render(story), /雨季三月/, 'next existing render adopts the real source');
});

test('month-end week fills from existing days without inventing dates or changing a normal mid-month window', () => {
  const calendar = today => ({ today: `本月${today}日`, columns: 7, leading: 6, weekdays: ['一', '二', '三', '四', '五', '六', '日'], days: Array.from({ length: 30 }, (_, index) => ({ day: index + 1, isToday: index + 1 === today, items: [] })) });
  const dates = markup => [...markup.matchAll(/class="desktop-week-day[^"]*"[\s\S]*?<span>(\d+)<\/span>/g)].map(match => Number(match[1]));
  const end = calendar(30), before = structuredClone(end);
  assert.deepEqual(dates(render(end)), [24, 25, 26, 27, 28, 29, 30]);
  assert.match(render(end), /desktop-week-day is-today[\s\S]*?<span>30<\/span>/);
  assert.deepEqual(end, before);
  assert.deepEqual(dates(render(calendar(17))), [16, 17, 18, 19, 20, 21, 22]);
});

test('matching story year prefix splits the actual Chinese date into two rows without rewriting calendar names', () => {
  const source = { today: '玄昭16年7月31日', yearLabel: '玄昭16年', monthName: '7月', columns: 7, leading: 0, weekdays: ['一','二','三','四','五','六','日'], days: Array.from({length:31},(_,i)=>({ day:i+1,isToday:i===30,items:[] })) };
  const before = structuredClone(source), markup = render(source);
  assert.match(markup, /desktop-calendar-date">7月31日<\/span>/); assert.match(markup, /desktop-calendar-year">玄昭16年<\/span>/);
  assert.match(markup, /title="玄昭16年7月31日"/); assert.match(markup, /desktop-week-day is-today[\s\S]*?<span>31<\/span>/);
  assert.doesNotMatch(markup, /CALENDAR|Month|Current|desktop-calendar-month|NOV/); assert.deepEqual(source,before);
  const numeric = render({ ...source, today: '玄昭16年11月14日', monthName: '11月', days: source.days.slice(0,30).map(day => ({ ...day, isToday: day.day === 14 })) });
  assert.match(numeric, /desktop-calendar-date">11月14日<\/span>/); assert.doesNotMatch(numeric, /desktop-calendar-date is-long-date/);
  assert.match(numeric, /title="玄昭16年11月14日"/); assert.match(numeric, /desktop-week-day is-today[\s\S]*?<span>14<\/span>/);
  const mismatched = render({...source, yearLabel:'另一纪年'});
  assert.match(mismatched, /desktop-calendar-date is-long-date">玄昭16年7月31日/); assert.doesNotMatch(mismatched, /另一纪年/);
});
