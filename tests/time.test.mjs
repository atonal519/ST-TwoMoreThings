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

test('reads official BBS endpoints including attributes, case and internal whitespace', () => {
  const messages = [{ is_user: false, mes: '<BBS_START data-source="story">\n2031/4/8 09:10\n</BBS_START>正文<bbs_end> 2031/4/8 09:30 </bbs_end>' }];
  assert.deepEqual(readPhoneTime(messages, now), { source: 'story', date: '2031/4/8', weekday: '', time: '09:30' });
  messages[0].mes = '<bbs_start>大陆历1686年10月4日  下午８：０５</bbs_start>正文';
  assert.deepEqual(readPhoneTime(messages, now), { source: 'story', date: '大陆历1686年10月4日', weekday: '', time: '20:05' });
});

test('mixed timestamp sources use the last end in the latest AI floor, or its last start', () => {
  const messages = [{ is_user: false, mes: `${floor('QQJ').mes}<bbs_end>2031/4/8 09:30</bbs_end><!-- SDC-start | date=后来 | time=10:00 -->` }];
  assert.equal(readPhoneTime(messages, now).time, '09:30');
  messages[0].mes += '<!-- myknots-end | date=之后 | weekday=周三 | time=11:00 -->';
  assert.deepEqual(readPhoneTime(messages, now), { source: 'story', date: '之后', weekday: '周三', time: '11:00' });
  messages[0].mes = '<!-- QQJ-start | date=之前 | time=08:00 --><bbs_start>2031/4/8 09:10</bbs_start>';
  assert.equal(readPhoneTime(messages, now).time, '09:10');
  messages.push({ is_user: false, mes: '<bbs_end>2031/4/8 25:10</bbs_end>' });
  assert.equal(readPhoneTime(messages, now).source, 'real');
});

const endpoint = (namespace, kind, time, date = '2031/4/8', weekday = '') => namespace === 'BBS'
  ? `<bbs_${kind}>${date} ${time}</bbs_${kind}>`
  : `<!-- ${namespace}-${kind} | date=${date} | weekday=${weekday} | time=${time} -->`;
const mixedClock = (...tags) => readPhoneTime([{ is_user: false, mes: tags.join('正文') }], now);

for (const namespace of ['QQJ', 'myknots', 'BBS']) {
  for (const [calendarTime, expected] of [['10:31', '09:30'], ['10:30', '10:30'], ['10:29', '10:29']]) {
    test(`${namespace} precedes trailing SDC only when same-day difference exceeds 60 minutes (${calendarTime})`, () => {
      const memory = endpoint(namespace, 'end', '09:30');
      const calendar = endpoint('SDC', 'end', calendarTime);
      assert.equal(mixedClock(memory, calendar).time, expected);
      assert.equal(mixedClock(calendar, memory).time, '09:30', 'a trailing memory endpoint keeps the existing selection');
    });
  }
}

test('comparison uses the last usable memory endpoint at the same boundary and retains all its original fields', () => {
  assert.deepEqual(mixedClock(
    endpoint('QQJ', 'end', '07:00', '大陆历1686年10月4日', '周一'),
    endpoint('myknots', 'end', '09:30', '大陆历1686年10月4日', '周二'),
    endpoint('SDC', 'end', '11:00', '大陆历1686年10月4日', '周三'),
  ), { source: 'story', date: '大陆历1686年10月4日', weekday: '周二', time: '09:30' });
  assert.equal(mixedClock(endpoint('BBS', 'start', '09:30'), endpoint('SDC', 'end', '11:00')).time, '11:00', 'start cannot override an end');
  assert.equal(mixedClock(endpoint('BBS', 'end', '09:30'), endpoint('SDC', 'start', '11:00')).time, '09:30', 'a later start does not enter the end comparison');
  assert.equal(mixedClock(endpoint('BBS', 'start', '09:30'), endpoint('SDC', 'start', '11:00')).time, '09:30', 'start endpoints are compared only when there are no ends');
  assert.equal(mixedClock(endpoint('QQJ', 'end', '09:30'), endpoint('SDC', 'end', '未知')).source, 'real', 'an unreadable final endpoint keeps the existing fallback');
});

test('lightweight date comparison normalizes explicit numeric forms and preserves calendar prefixes', () => {
  assert.equal(mixedClock(endpoint('BBS', 'end', '09:30', '２０３１／０４／０８'), endpoint('SDC', 'end', '11:00', '2031-4-8')).time, '09:30');
  assert.equal(mixedClock(endpoint('QQJ', 'end', '09:30', '大陆历 １６８６ 年 １０ 月 ０４ 日'), endpoint('SDC', 'end', '11:00', '大陆历1686/10/4')).time, '09:30');
  assert.deepEqual(mixedClock(endpoint('QQJ', 'end', '09:30', '2031年4月7日', '周一'), endpoint('SDC', 'end', '09:45', '2031/4/8', '周二')), { source: 'story', date: '2031年4月7日', weekday: '周一', time: '09:30' });
  assert.equal(mixedClock(endpoint('BBS', 'end', '09:30', '大陆历1686年10月4日'), endpoint('SDC', 'end', '09:45', '大陆历1686年10月5日')).time, '09:30');
  for (const [memoryDate, calendarDate] of [['大陆历1686年10月4日', '新历1686年10月4日'], ['大陆历1686年10月4日', '1686-10-4'], ['春日', '翌日'], ['未知', '2031/4/8'], ['2031/4/8', '未知'], ['ｕｎｋｎｏｗｎ', 'ｕｎｋｎｏｗｎ'], ['未 知', '未 知'], ['', '']]) {
    assert.equal(mixedClock(endpoint('QQJ', 'end', '09:30', memoryDate), endpoint('SDC', 'end', '11:00', calendarDate)).time, '11:00', `${memoryDate}/${calendarDate}: do not guess an uncertain date relationship`);
  }
});

for (const [afterMidnight, expected] of [['00:10', '00:10'], ['00:50', '00:50'], ['00:51', '23:50']]) {
  test(`same-calendar midnight difference uses elapsed minutes, not a different-date shortcut (${afterMidnight})`, () => {
    assert.equal(mixedClock(endpoint('BBS', 'end', '23:50', '2031/4/8'), endpoint('SDC', 'end', afterMidnight, '2031/4/9')).time, expected);
    const reverseExpected = afterMidnight === '00:51' ? afterMidnight : '23:50';
    assert.equal(mixedClock(endpoint('QQJ', 'end', afterMidnight, '大陆历1686年10月5日'), endpoint('SDC', 'end', '23:50', '大陆历1686年10月4日')).time, reverseExpected, 'use absolute elapsed difference in either direction');
  });
}

test('different months or years use only a conservative lower bound without calendar conversion', () => {
  for (const [memoryDate, calendarDate] of [['2031/4/30', '2031/5/1'], ['大陆历1686年12月30日', '大陆历1687年1月1日']]) {
    assert.equal(mixedClock(endpoint('QQJ', 'end', '09:30', memoryDate), endpoint('SDC', 'end', '12:00', calendarDate)).time, '09:30');
    for (const [calendarTime, expected] of [['00:10', '00:10'], ['00:50', '00:50'], ['00:51', '23:50']]) {
      assert.equal(mixedClock(endpoint('BBS', 'end', '23:50', memoryDate), endpoint('SDC', 'end', calendarTime, calendarDate)).time, expected);
    }
  }
});

test('identical unstructured date text cannot establish a same-day time conflict', () => {
  for (const date of ['日期未定', '未知日期', '普通备注']) {
    assert.deepEqual(mixedClock(endpoint('QQJ', 'end', '09:30', date, '周一'), endpoint('SDC', 'end', '11:00', date, '周二')), {
      source: 'story', date, weekday: '周二', time: '11:00',
    });
  }
});
