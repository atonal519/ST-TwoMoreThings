import test from 'node:test';
import assert from 'node:assert/strict';
import { renderChat, renderChatMenu, renderInboxMenu } from '../src/ui/messages.js';
import { renderLiangshiOwnMenu } from '../src/ui/liangshi.js';

const disabled = (markup, action) => /\sdisabled(?:[\s=>]|$)/.test(markup.match(new RegExp(`<button[^>]*data-action="${action}"[^>]*>`))?.[0] || '');

test('chat menu keeps the original per-conversation busy boundaries and actions', () => {
  for (const view of ['chat', 'group-chat']) {
    const ui = { view, contactId: 'lin', groupId: 'friends' }, id = view === 'chat' ? 'lin' : 'friends';
    for (const key of [`continue:${id}`, `send:${id}`]) {
      const menu = renderChatMenu({}, { ui, busy: new Set([key]) });
      assert.equal(disabled(menu, 'clear-chat'), true);
      assert.equal(disabled(menu, view === 'chat' ? 'profile' : 'edit-group'), false);
      assert.equal(disabled(menu, view === 'chat' ? 'remove-contact' : 'remove-group'), false);
    }
    assert.equal(disabled(renderChatMenu({}, { ui, busy: new Set(['continue:other']) }), 'clear-chat'), false);
  }
});

test('own Weibo menu keeps all shared busy keys including nested image tasks', () => {
  const post = { id: 'p', comments: [{ id: 'reply', userAuthored: true }], reposts: [], replyBatch: { inputIds: ['reply'] } };
  for (const key of ['liangshi-more:p', 'liangshi-replies:p', 'liangshi-image:p', 'liangshi-delete:p', 'liangshi-reply:p', 'liangshi-image:p:comment']) {
    const menu = renderLiangshiOwnMenu(post, new Set([key]));
    for (const action of ['liangshi-edit', 'liangshi-delete', 'liangshi-generate-replies', 'liangshi-regenerate-replies']) assert.equal(disabled(menu, action), true, `${key}: ${action}`);
  }
  const idle = renderLiangshiOwnMenu(post, new Set(['liangshi-image:other:comment']));
  for (const action of ['liangshi-edit', 'liangshi-delete', 'liangshi-generate-replies', 'liangshi-regenerate-replies']) assert.equal(disabled(idle, action), false);
  const empty = renderLiangshiOwnMenu({ id: 'p', comments: [] }, new Set());
  assert.equal(disabled(empty, 'liangshi-generate-replies'), true); assert.equal(disabled(empty, 'liangshi-regenerate-replies'), true);
});


test('message side actions keep stable targets, current group reply eligibility and conversation busy limits', () => {
  const messages = [{ id: 'current', batch: { key: 'floor:3' }, storyFloor: 3, storyDate: '2031年4月8日', text: '当前消息' }, { id: 'past', batch: { key: 'floor:1' }, storyFloor: 1, storyDate: '2031年4月7日', text: '历史消息' }];
  const state = { contacts: [{ id: 'lin', name: '林舟' }], groups: [{ id: 'friends', name: '朋友群', memberIds: ['lin'], userIsMember: true }], conversations: { friends: messages, lin: messages } };
  const ui = { view: 'group-chat', groupId: 'friends', selectedMessage: 'current', batch: { key: 'floor:3', floor: 3 }, visibleMessages: 60, visibleHistory: 60, historyOpen: true, drafts: new Map() };
  const current = renderChat(state, { ui, busy: new Set(['delete:friends']) });
  assert.ok(current.includes('data-message-target="current"')); assert.equal(disabled(current, 'delete-message'), true);
  assert.ok(current.includes('reply-message'));
  const history = renderChat(state, { ui: { ...ui, selectedMessage: 'past' }, busy: new Set() });
  assert.ok(!history.includes('reply-message')); assert.ok(history.includes('data-message-target="past"'));
  assert.ok(!renderChat(state, { ui: { ...ui, view: 'chat', contactId: 'lin' }, busy: new Set() }).includes('reply-message'));
  assert.equal(disabled(renderInboxMenu(new Set(['directory'])), 'organize'), true);
  assert.equal(disabled(renderInboxMenu(new Set(['other'])), 'organize'), false);
});
