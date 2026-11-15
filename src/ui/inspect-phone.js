import { inspectionData, inspectionThreads } from '../inspect-phone.js';
import { action, avatar, empty, escape, icon, pageHeading } from './shared.js';
import { renderInbox, renderMessage } from './messages.js';
import { renderDesktop } from './desktop.js';
import { phoneUrl } from '../paths.js';

export const INSPECT_LOADING_DURATION_MS = 2160;

export function renderInspection(state, { ui, busy, inspectPhone, reducedMotion = false }) {
  const owners = inspectPhone?.owners() || [], owner = owners.find(person => person.id === ui.inspectOwnerId);
  if (ui.view === 'inspect-phone') {
    const rows = owners.map(person => `<button type="button" class="contact-row" data-inspect-owner="${escape(person.id)}" aria-label="查看${escape(person.name)}的手机">${avatar(person)}<span class="contact-copy"><span class="contact-title"><strong>${escape(person.name)}</strong></span>${person.needsName ? '<span class="contact-preview">待指定主人</span>' : ''}</span></button>`).join('');
    return `${pageHeading('查手机', action('inspect-add-owner', '添加人物', 'plus', 'quiet-button'))}<div class="contact-list">${rows}</div>${!owners.length ? '<p class="inspect-empty">选择手机主人</p>' : ''}`;
  }
  if (ui.inspectLoading) {
    const theme = state.theme === 'night' ? 'night' : 'day';
    const asset = reducedMotion ? `still-${theme}.png` : `${theme}.gif`;
    // Reuse the browser image cache between openings; change the version with the asset pixels.
    const source = phoneUrl(`assets/inspect-phone/${asset}`) + '?v=7540e96b8fa8';
    return `<div class="inspect-loading" role="status" aria-label="正在打开手机"><img src="${escape(source)}" width="300" height="232" alt=""></div>`;
  }
  if (!owner) return empty('请选择手机主人');
  if (ui.view === 'inspect-desktop') return renderDesktop(state, { owner, apps: [{ id: 'inspect-wechat', label: '微信', icon: 'messages', action: 'inspect-open-wechat' }] });
  const threads = inspectionThreads(state, owner.id, ui.defaultUser);
  const people = [...owners.filter(person => !person.needsName), ...inspectionData(state, owner.id).people, { ...state.userProfile, id: '@user', name: state.userProfile?.name || ui.defaultUser }];
  if (ui.view === 'inspect-chat') {
    const thread = threads.find(item => item.id === ui.inspectThreadId);
    if (!thread) return empty('这个会话已不存在');
    const others = thread.participantIds.filter(id => id !== '@owner'), isGroup = others.length > 1;
    const contact = { ...(people.find(person => person.id === others[0]) || {}), id: thread.id, name: thread.name, memberIds: others, userIsMember: false };
    const projection = { ...state, contacts: people, conversations: { [thread.id]: thread.messages } };
    const rows = thread.messages.map((message, index) => renderMessage({ ...message, role: message.speakerId === '@owner' ? 'user' : 'assistant' }, thread.messages[index - 1], thread.messages[index + 1], {
      contact, user: owner, selected: ui.inspectSelectedMessage, deleting: busy.has('inspect-delete'), isGroup, busy, readOnly: true,
      state: projection, ui: { ...ui, defaultUser: owner.name }, conversationId: thread.id, inspection: true, mirror: thread.mirror,
    })).join('');
    return `<header class="conversation-heading">${action('inspect-back-wechat', '返回微信', 'arrow', 'icon-button back-button')}${avatar(contact, true)}<div class="conversation-person"><h1>${escape(thread.name)}</h1><small>${escape(owner.name)}的微信${thread.mirror ? ' · 已有短信' : ''}</small></div>${thread.mirror ? '' : `<div class="chat-options"><button type="button" class="icon-button" data-action="inspect-menu" aria-label="微信会话操作" aria-haspopup="menu" aria-expanded="${ui.chatMenu}">${icon('more')}</button></div>`}</header><div class="chat-stage"><div class="message-feed" role="log" aria-label="微信记录">${rows || empty('还没有消息')}</div></div>`;
  }
  const generating = busy.has(`inspect:${owner.id}`);
  const heading = pageHeading('微信', `${owner.needsName ? action('inspect-name-owner', '指定主人', '', 'quiet-button') : ''}${action('inspect-refresh', generating ? '生成中…' : '刷新', 'refresh', 'quiet-button', generating || owner.needsName)}`);
  const projection = { ...state, contacts: threads.filter(thread => thread.participantIds.length === 2).map(thread => ({ ...(people.find(person => thread.participantIds.includes(person.id)) || {}), id: thread.id, name: thread.name, nickname: '' })),
    groups: threads.filter(thread => thread.participantIds.length > 2).map(thread => ({ id: thread.id, name: thread.name, memberIds: thread.participantIds.filter(id => id !== '@owner'), userIsMember: true })),
    conversations: Object.fromEntries(threads.map(thread => [thread.id, thread.messages.map(message => ({ ...message, role: message.speakerId === '@owner' ? 'user' : 'assistant', read: true }))])) };
  return `${heading}${renderInbox(projection, { ui, busy, inspection: true, senderPeople: people })}${!threads.length ? '<p class="inspect-empty">还没有微信记录</p>' : ''}`;
}
