import test from 'node:test';
import assert from 'node:assert/strict';
import { publicationValue, publicationLabel, formatPublicationTime, hasPublicationDate, sortSocialPosts } from '../src/social-time.js';
import { renderLiangshi } from '../src/ui/liangshi.js';

test('publication input accepts the single field, explicit aliases and split date/time without interpreting prose', () => {
  for (const key of ['publishedAt', 'published_at', 'postedAt', 'publishTime']) {
    assert.equal(publicationValue({ [key]: '  大陆历1686年10月4日 09:30  ' }, {}, true), '大陆历1686年10月4日 09:30');
  }
  assert.equal(publicationValue({ publishedAt: '2026-10-18 10:00', postedAt: '2026-10-17 09:00' }, {}), '2026-10-18 10:00');
  assert.equal(publicationValue({ date: '2026-10-18', time: '10:00' }, {}), '2026-10-18 10:00');
  assert.equal(publicationValue({ storyDate: '2026年10月18日', timeLabel: '10:00' }, {}), '2026年10月18日 10:00');
  assert.equal(publicationValue({ publishedAt: '很久以前的一个下午' }, {}, true), '很久以前的一个下午');
  assert.equal(publicationValue({ date: '2026-10-18' }, { time: '22:00' }, true), '2026-10-18');
  assert.equal(publicationValue({ time: '09:30' }, { date: '2026-10-18' }, true), '09:30');
});

test('missing publication time falls back to the feed clock only, never to a history generation date', () => {
  const clock = { date: '2026年10月18日', time: '14:45' };
  assert.equal(publicationValue({}, clock), '2026年10月18日 14:45');
  assert.equal(publicationValue({ publishedAt: null }, clock), '2026年10月18日 14:45');
  assert.equal(publicationValue({ publishedAt: ' ' }, clock, true), '');
  assert.equal(publicationValue({ createdAt: '2026-10-19T10:00:00Z' }, clock, true), '');
  assert.equal(publicationValue({}, { date: '大陆历1686年10月4日' }), '大陆历1686年10月4日');
  assert.equal(publicationValue({}, {}), '');
});

test('labels distinguish explicit unknown publication time from old records and do not use creation time', () => {
  assert.equal(publicationLabel({ publishedAt: '大陆历1686年10月4日 09:30', storyDate: '2099年1月1日' }), '大陆历1686年10月4日 09:30');
  assert.equal(publicationLabel({ publishedAt: '', storyDate: '2026年10月18日', timeLabel: '14:45' }), '过去');
  assert.equal(publicationLabel({ storyDate: '2026年10月18日', timeLabel: '14:45' }), '2026年10月18日 14:45');
  assert.equal(publicationLabel({ timeLabel: '14:45' }), '14:45');
  assert.equal(publicationLabel({ createdAt: '2026-10-19T10:00:00Z' }), '过去');
});

test('numeric publication sorting handles Chinese dates, prefixes, ISO seconds and stable equal times', () => {
  const posts = [
    { id: 'equal-first', publishedAt: '大陆历1686年10月4日 09:30' },
    { id: 'older', publishedAt: '1686-9-30 23:59' },
    { id: 'seconds', publishedAt: '1686-10-04T09:30:01Z' },
    { id: 'equal-second', storyDate: '1686年10月4日', timeLabel: '09:30' },
    { id: 'next-year', publishedAt: '1687-01-01 00:00' },
  ];
  posts.forEach(Object.freeze); Object.freeze(posts);
  assert.deepEqual(sortSocialPosts(posts).map(post => post.id), ['next-year', 'seconds', 'equal-first', 'equal-second', 'older']);
  assert.deepEqual(posts.map(post => post.id), ['equal-first', 'older', 'seconds', 'equal-second', 'next-year']);
  assert.equal(sortSocialPosts(posts)[0], posts[4], 'sorting creates an array without copying or changing stored posts');
});

test('date-only sorts within its day after explicit times, while time-only and unknown dates retain their order', () => {
  const posts = [
    { id: 'unknown', publishedAt: '去年夏天' },
    { id: 'date', publishedAt: '2026-10-18' },
    { id: 'time', publishedAt: '12:30' },
    { id: 'midnight', publishedAt: '2026-10-18 00:00' },
    { id: 'empty', publishedAt: '', createdAt: '2099-01-01T00:00:00Z' },
    { id: 'previous', publishedAt: '2026-10-17 23:59' },
  ];
  assert.deepEqual(sortSocialPosts(posts).map(post => post.id), ['midnight', 'date', 'previous', 'unknown', 'time', 'empty']);
  assert.equal(publicationLabel(posts[1]), '2026-10-18', 'sort defaults never become displayed facts');
  assert.equal(hasPublicationDate(posts[1]), true);
  assert.equal(hasPublicationDate(posts[3]), true);
  assert.equal(hasPublicationDate(posts[0]), false);
  assert.equal(hasPublicationDate(posts[2]), false);
  assert.equal(hasPublicationDate(posts[4]), false);
  assert.equal(hasPublicationDate({ storyDate: '大陆历1686年10月4日', timeLabel: '09:30' }), true);
});

test('sorting does not normalize fictional dates into Gregorian dates or apply time zone conversion', () => {
  const posts = [
    { id: 'march', publishedAt: '大陆历1686年3月1日 01:00' },
    { id: 'fictional-day', publishedAt: '大陆历1686年2月30日 22:00' },
    { id: 'later-wall-clock', publishedAt: '1686-03-01T10:00:00+08:00' },
    { id: 'earlier-wall-clock', publishedAt: '1686-03-01T09:00:00Z' },
  ];
  assert.deepEqual(sortSocialPosts(posts).map(post => post.id), ['later-wall-clock', 'earlier-wall-clock', 'march', 'fictional-day']);
});

test('sorting accepts adjoining Chinese date/time and year-first slash dates without guessing month-first dates', () => {
  const posts = [
    { id: 'adjoining', publishedAt: '大陆历1686年10月3日19:05' },
    { id: 'slash', publishedAt: '1686/10/4 09:30' },
    { id: 'hyphen', publishedAt: '1686-10-3 19:04' },
    { id: 'ambiguous', publishedAt: '10/04/1686 09:30' },
    { id: 'short-ambiguous', publishedAt: '10/04/26 09:30' },
  ];
  assert.deepEqual(sortSocialPosts(posts).map(post => post.id), ['slash', 'adjoining', 'hyphen', 'ambiguous', 'short-ambiguous']);
  assert.equal(publicationLabel(posts[0]), '大陆历1686年10月3日19:05');
  assert.equal(publicationLabel(posts[1]), '1686/10/4 09:30');
});


test('Weibo renders publication dates for reading while retaining the original stored time and edited marker', () => {
  const post = { id: 'own', authorId: 'self', userAuthored: true, text: '测试正文', publishedAt: '2027-03-22T18:32:00', editedAt: '2027-03-22T18:33:00', comments: [], reposts: [] };
  const state = { userProfile: {}, liangshi: { accounts: [{ id: 'self', ownerId: '@user', name: '我' }], userPostIds: ['own'], feedIds: [], posts: [post] } };
  const before = structuredClone(state);
  const html = renderLiangshi(state, { ui: { defaultUser: '我', liangshiPage: { kind: 'feed', tab: 'mine' }, liangshiExpanded: new Set() }, busy: new Set() });
  assert.ok(html.includes('2027-03-22 18:32 · 已编辑'), 'UI exposes a readable publication date and minute');
  assert.ok(!html.includes('2027-03-22T18:32:00'));
  assert.deepEqual(state, before);
});


test('publication display uses recorded date and minute without inventing missing fields or changing its era', () => {
  for (const [raw, displayed] of [
    ['2027-03-22T18:32:00', '2027-03-22 18:32'],
    ['2027-03-22T18:32:59.999Z', '2027-03-22 18:32'],
    ['2027-03-22T18:32:59+08:00', '2027-03-22 18:32'],
    ['2027-03-22T18:32:00-0500', '2027-03-22 18:32'],
    ['2027-3-2', '2027-03-02'],
    ['大陆历1686年2月30日19:05', '大陆历1686-02-30 19:05'],
    ['1686/10/4 09:30', '1686-10-04 09:30'],
    ['09:30', '09:30'], ['10/04/26', '10/04/26'], ['去年夏天', '去年夏天'], ['过去', '过去'], ['', ''],
    ['2027-03-22T25:32:00', '2027-03-22T25:32:00'],
  ]) assert.equal(formatPublicationTime(raw), displayed, raw);
  assert.equal(formatPublicationTime(publicationLabel({ publishedAt: '', storyDate: '2027年3月22日', createdAt: '2099-01-01T00:00:00Z' })), '过去');
  const posts = [{ id: 'second', publishedAt: '2027-03-22T18:32:02+08:00' }, { id: 'first', publishedAt: '2027-03-22T18:32:01Z' }];
  const before = structuredClone(posts);
  assert.deepEqual(posts.map(post => formatPublicationTime(publicationLabel(post))), ['2027-03-22 18:32', '2027-03-22 18:32']);
  assert.deepEqual(sortSocialPosts(posts).map(post => post.id), ['second', 'first']);
  assert.equal(publicationLabel(posts[0]), '2027-03-22T18:32:02+08:00', 'model history input keeps its original seconds and timezone');
  assert.deepEqual(posts, before);
});
