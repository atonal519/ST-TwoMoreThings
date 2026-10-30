import test from 'node:test';
import assert from 'node:assert/strict';
import { readAlbumPhotos, findAlbumPhoto, albumPhotoKey } from '../src/album.js';
import { renderAlbum } from '../src/ui/album.js';

const picture = (name, description = name) => ({ path: `/user/images/${name}.png`, description });
const fixture = () => ({
  contacts: [{ id: 'c', name: '联系人', avatar: '/user/images/avatar.png' }],
  groups: [{ id: 'g', name: '旁观群', memberIds: ['c'], userIsMember: false }],
  conversations: {
    c: [{ id: 'm', type: 'image', image: picture('shared'), storyDate: '第七年秋日', timeLabel: '10:20', createdAt: '2026-10-20T10:20:00Z', batch: { key: 'past' } }],
    g: [{ id: 'gm', type: 'image', image: picture('group'), knownToIds: ['c'], createdAt: '2026-10-20T10:21:00Z' }],
  },
  social: { npcs: [{ id: 'n', name: '路人' }], posts: [{ id: 's', authorId: 'n', image: picture('ins'), publishedAt: '秋日 午后' }] },
  forum: { posts: [{ id: 'f', title: '旅行', author: '匿名', image: picture('forum'), comments: [{ author: '回帖者', image: picture('forum-reply') }] }] },
  liangshi: { accounts: [{ id: 'a', name: '博主' }, { id: 'me', ownerId: '@user', name: '旧网名' }], posts: [{ id: 'l', authorId: 'a', image: picture('weibo'), comments: [{ authorId: 'a', image: picture('weibo-comment') }], reposts: [{ authorId: 'me', image: { ...picture('shared'), path: 'user/images/shared.png' } }] }] },
  userProfile: { nickname: '我的网名' }, wallpapers: { day: '/user/images/wallpaper.png' },
});

test('汇总真实UI可见各渠道图片，历史和旁观群仍可见', () => {
  const state = fixture(), before = structuredClone(state), photos = readAlbumPhotos(state);
  assert.deepEqual(photos.map(p => p.path).sort(), ['shared', 'group', 'ins', 'forum', 'forum-reply', 'weibo', 'weibo-comment'].map(n => `/user/images/${n}.png`).sort());
  assert.deepEqual(state, before);
  const shared = findAlbumPhoto(state, 'user/images/shared.png');
  assert.equal(shared.sources.length, 2);
  assert.deepEqual(shared.sources.map(s => s.kind), ['messages', 'liangshi-reposts']);
  assert.ok(shared.sources.some(s => s.label.includes('我的网名')));
  assert.equal(shared.sources[0].publishedAt, '第七年秋日 10:20');
  assert.equal(shared.sources[1].publishedAt, '');
  assert.equal(findAlbumPhoto(state, '/user/images/group.png').sources[0].kind, 'groups');
});

test('不收占位、头像背景、孤儿会话及失效作者的主帖和互动', () => {
  const state = fixture();
  state.conversations.c.push({ id: 'placeholder', type: 'image', image: { description: '还未生图' } }, { id: 'text', type: 'text', image: picture('not-image-message') });
  state.conversations.orphan = [{ id: 'gone', type: 'image', image: picture('orphan') }];
  state.social.posts.push({ id: 'bad-s', authorId: 'gone', image: picture('missing-ins-author') });
  state.liangshi.posts.push({ id: 'bad-l', authorId: 'gone', image: picture('missing-author'), comments: [{ authorId: 'a', image: picture('hidden-thread') }] });
  state.liangshi.posts[0].comments.push({ authorId: 'gone', image: picture('missing-comment-author') });
  assert.equal(readAlbumPhotos(state).length, 7);
});

test('缺日期不把createdAt伪装为剧情时间，排序仍可使用已有创建时间', () => {
  const state = fixture(), photos = readAlbumPhotos(state);
  assert.equal(photos[0].path, '/user/images/group.png');
  assert.equal(photos[0].timeLabel, '');
  assert.equal(photos[0].sources[0].publishedAt, '');
  assert.equal(findAlbumPhoto(state, '/user/images/ins.png').timeLabel, '秋日 午后');
});

test('未归档的live投影随来源改变，读取本身不自动创建持久照片', () => {
  const state = fixture();
  state.conversations.c = [];
  assert.equal(findAlbumPhoto(state, '/user/images/shared.png').sources.length, 1);
  state.liangshi.posts[0].reposts[0].image = picture('replacement');
  assert.equal(findAlbumPhoto(state, '/user/images/shared.png'), undefined);
  assert.equal(findAlbumPhoto(state, '/user/images/replacement.png').description, 'replacement');
});

test('来源只投影展示字段，不携带联系人私有资料或完整原记录', () => {
  const state = fixture();
  state.contacts[0].remarkForUser = '私有备注';
  state.contacts[0].privateMemory = '私有记忆';
  state.conversations.c[0].privateField = '不可投影';
  const serialized = JSON.stringify(readAlbumPhotos(state));
  assert.ok(!serialized.includes('私有备注') && !serialized.includes('私有记忆') && !serialized.includes('不可投影'));
  assert.equal(findAlbumPhoto(state, '/user/images/no.png'), undefined);
  assert.deepEqual(readAlbumPhotos({}), []);
});

test('旧HTTP图片沿原URL去重，拒绝危险scheme和会话临时URL', () => {
  const state = fixture(), url = 'https://photos.example.test/a.jpg?size=large';
  state.conversations.c = [url, ` ${url} `, 'javascript:alert(1)', 'data:image/png;base64,a', 'blob:https://host.test/x', 'https://'].map((path, i) => ({ id: `url-${i}`, type: 'image', image: { path } }));
  const photo = findAlbumPhoto(state, url);
  assert.equal(photo.sources.length, 2);
  assert.equal(albumPhotoKey(` ${url} `), url);
  assert.equal(albumPhotoKey('https://'), '');
  assert.equal(readAlbumPhotos(state).filter(photo => photo.path.startsWith('http')).length, 1);
});

test('旧Ins保原剧情日期，显式空发布时间保未知；同日照片共用三列网格', () => {
  const state = fixture();
  state.social.posts = [{ id: 'legacy', authorId: 'n', image: picture('legacy'), storyDate: '2026年10月18日', timeLabel: '14:45' }, { id: 'empty', authorId: 'n', image: picture('empty-date'), publishedAt: '', storyDate: '不应回填', timeLabel: '15:00' }];
  assert.equal(findAlbumPhoto(state, '/user/images/legacy.png').timeLabel, '2026年10月18日 14:45');
  assert.equal(findAlbumPhoto(state, '/user/images/empty-date.png').timeLabel, '');
  const onlyMessages = { contacts: state.contacts, conversations: { c: [state.conversations.c[0], { ...state.conversations.c[0], id: 'second', image: picture('second'), timeLabel: '11:40' }] } };
  const markup = renderAlbum(onlyMessages, { ui: { albumPage: 'gallery', defaultUser: '我' } });
  assert.equal((markup.match(/class="album-grid"/g) || []).length, 1);
  assert.equal((markup.match(/class="album-photo"/g) || []).length, 2);
  assert.ok(markup.includes('第七年秋日'));
});
