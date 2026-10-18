import test from 'node:test';
import assert from 'node:assert/strict';
import { readPhoneTime } from '../src/time.js';

const now = new Date('2026-10-18T09:37:00');
const floor = (namespace, time = '22:15', date = '大陆历1686年10月4日', weekday = '周二') => ({
  is_user: false,
  mes: `<!-- ${namespace}-start | date=${date} | weekday=${weekday} | time=21:00 -->正文<!-- ${namespace}-end | date=${date} | weekday=${weekday} | time=${time} -->`,
});

for (const namespace of ['QQJ', 'SDC', 'myknots']) test(`uses ${namespace} end time without converting the story calendar`, () => {
  assert.deepEqual(readPhoneTime([floor(namespace)], now), { source: 'story', date: '大陆历1686年10月4日', weekday: '周二', time: '22:15' });
});

test('reads the latest AI floor and ignores user/system timestamps', () => {
  const messages = [floor('QQJ', '18:10'), floor('SDC', '23:58'), { ...floor('QQJ', '01:00'), is_user: true }, { ...floor('QQJ', '02:00'), is_system: true }];
  assert.equal(readPhoneTime(messages, now).time, '23:58');
  messages.push({ is_user: false, mes: '本楼没有时间戳。' });
  assert.equal(readPhoneTime(messages, now).source, 'real', '不拿旧楼时间冒充新楼时间');
  assert.equal(readPhoneTime(messages, now).time, '09:37');
});

test('keeps a known clock when the date or weekday is not established', () => {
  assert.deepEqual(readPhoneTime([floor('QQJ', '07:25', '未知', '未知')], now), { source: 'story', date: '', weekday: '', time: '07:25' });
});

test('normalizes a full-width or twelve-hour clock and falls back for an unreadable clock', () => {
  assert.equal(readPhoneTime([floor('SDC', '下午８：０５')], now).time, '20:05');
  for (const time of ['25:10', '22:77', '深夜', '未知']) assert.equal(readPhoneTime([floor('QQJ', time)], now).source, 'real');
  assert.equal(readPhoneTime([], now).time, '09:37');
});
