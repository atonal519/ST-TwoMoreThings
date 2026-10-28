import { action, avatar, empty, escape, icon, pageHeading, renderEmojiText, renderMentionText, translationForDisplay } from './shared.js';
import { displayName } from '../profiles.js';
import { partitionHistory } from '../timeline.js';
import { messageText } from '../content.js';
import { renderAttachments, renderCardActions, renderCardBody } from './cards.js';
import { chatBackgroundStyle } from '../backgrounds.js';
import { replyContext } from '../replies.js';
import { isUserIdentity } from '../identities.js';

export function renderInbox(state, { ui, busy }) {
  const groups = state.groups || [];
  const options = `<div class="inbox-options"><button type="button" class="icon-button" data-action="inbox-menu" aria-label="通讯录操作" aria-haspopup="menu" aria-expanded="${ui.inboxMenu}">${icon('plus')}</button></div>`;
  const groupRows = groups.map(group => {
    const last = state.conversations[group.id]?.at(-1), sender = state.contacts.find(person => person.id === last?.speakerId);
    const preview = last
      ? `${last.role === 'user' ? '我' : displayName(sender || { name: '群成员' })}：${messageText(last)}`
      : `${group.memberIds.length + Number(group.userIsMember)} 位成员`;
    return `<button type="button" class="contact-row" data-group="${escape(group.id)}">
      ${avatar(group)}
      <span class="contact-copy">
        <span class="contact-title">
          <strong>${escape(group.name)}</strong>
          <span class="contact-time">${escape(last?.timeLabel || '')}</span>
        </span>
        <span class="contact-preview">${renderEmojiText(preview)}</span>
      </span>
      ${icon('next')}
    </button>`;
  }).join('');
  const contactRows = state.contacts.map(contact => {
    const last = state.conversations[contact.id]?.at(-1);
    return `<button type="button" class="contact-row" data-contact="${escape(contact.id)}">
      ${avatar(contact)}
      <span class="contact-copy">
        <span class="contact-title">
          <strong>${escape(displayName(contact))}</strong>
          <span class="contact-time">${escape(last?.timeLabel || '')}</span>
        </span>
        ${last ? `<span class="contact-preview">${renderEmojiText(messageText(last))}</span>` : ''}
      </span>
      ${icon('next')}
    </button>`;
  }).join('');
  return `${pageHeading('短信', options)}
    ${groups.length ? `
      <div class="section-label"><span>群聊</span><span>${groups.length} 个</span></div>
      <div class="contact-list">${groupRows}</div>` : ''}
    <div class="section-label"><span>联系人</span><span>${state.contacts.length} 位</span></div>
    <div class="contact-list">${contactRows}</div>
    ${!state.contacts.length ? empty('还没有联系人') : ''}`;
}

export function renderChatMenu(state, { ui, busy }) {
  const isGroup = ui.view === 'group-chat', id = isGroup ? ui.groupId : ui.contactId;
  const generating = busy.has(`continue:${id}`), saving = busy.has(`send:${id}`);
  return `<div class="phone-menu-actions">
    ${action(isGroup ? 'edit-group' : 'profile', isGroup ? '编辑群聊' : '编辑联系人', '', 'menu-item')}
    <div class="phone-menu-danger">
      ${action('clear-chat', '清空聊天', '', 'menu-item danger', generating || saving)}
      ${action(isGroup ? 'remove-group' : 'remove-contact', isGroup ? '删除群聊' : '删除联系人', '', 'menu-item danger')}
    </div>
  </div>`;
}

export function renderInboxMenu(busy) {
  return `${action('organize', busy.has('directory') ? '整理中…' : '整理通讯录', '', 'menu-item', busy.has('directory'))}${action('add-contact', '添加联系人', '', 'menu-item')}${action('add-group', '创建群聊', '', 'menu-item')}`;
}

function renderMessage(message, previous, next, { contact, user, selected, deleting, isGroup, busy, readOnly = false, state, ui, conversationId }) {
  const mine = message.role === 'user';
  const party = item => item && (item.speakerId || item.role);
  const hasPrev = party(previous) === party(message), hasNext = party(next) === party(message);
  const grouped = `${hasPrev ? ' grouped-top' : ''}${hasNext ? ' grouped-bottom' : ''}${previous && !hasPrev ? ' group-start' : ''}`;
  const chosen = selected === message.id;
  const bubbleAttributes = message.type === 'image'
    ? `data-action="photo" data-photo="${escape(message.id)}" aria-label="${message.image.path ? '查看图片' : '生成图片'}" aria-busy="${busy.has(`image:${message.id}`)}" ${busy.has(`image:${message.id}`) ? 'disabled' : ''}`
    : `data-message="${escape(message.id)}" aria-label="短信：${escape(messageText(message))}" aria-expanded="${chosen}"`;
  const timestamp = message.timeLabel
    ? `<div class="message-foot"><time title="${escape([message.storyDate, message.storyWeekday, message.timeLabel].filter(Boolean).join(' '))}" datetime="${escape(message.createdAt || '')}">${escape(message.timeLabel)}</time></div>`
    : '';
  const groupPeople = isGroup ? [{ ...user, id: '@user', name: user.name || ui.defaultUser || '我' }, ...(state.contacts || []).filter(person => contact.memberIds?.includes(person.id))] : [];
  const sender = isGroup && !mine ? state.contacts?.find(person => person.id === message.speakerId) || { name: '群成员' } : null;
  const messageAvatar = isGroup && !mine && sender?.id ? `<button type="button" class="mention-avatar" data-mention-id="${escape(sender.id)}" aria-label="提及${escape(displayName(sender))}">${avatar(sender, true)}</button>` : avatar(mine ? { tone: 'lilac', ...user } : contact, true);
  const reply = isGroup ? replyContext(message, state.conversations?.[conversationId] || []) : undefined;
  const replyName = reply && !reply.missing ? displayName(reply.role === 'user' ? user : state.contacts.find(person => person.id === reply.speakerId) || { name: '已移除联系人' }) : '';
  const replyTranslation = reply && translationForDisplay(reply.messageText, reply.translation), translation = translationForDisplay(message.text, message.translation);
  const replyBlock = reply ? `<div class="message-reply${reply.missing ? ' is-missing' : ''}"><small>引用${replyName ? ` ${escape(replyName)}` : ''}</small><span>${reply.missing ? '原消息已删除' : renderMentionText(reply.messageText, groupPeople)}</span>${replyTranslation ? `<span class="message-translation" lang="zh-CN">${renderMentionText(replyTranslation, groupPeople)}</span>` : ''}</div>` : '';
  const body = !message.type ? `<span class="message-original">${renderMentionText(message.text, groupPeople)}</span>${translation ? `<span class="message-translation" lang="zh-CN">${renderMentionText(translation, groupPeople)}</span>` : ''}` : renderCardBody(message, busy.has(`image:${message.id}`));
  return `<div class="message-row ${mine ? 'is-mine' : 'is-theirs'}${chosen ? ' is-selected' : ''}${!hasNext && message.timeLabel ? ' has-time' : ''}${grouped}">
    ${messageAvatar}
    <div class="message-body">
      <div class="message-copy">
        ${isGroup && !mine && !hasPrev ? `<span class="message-sender">${escape(displayName(sender || contact))}</span>` : ''}
        <div class="bubble-line">
          <button type="button" class="bubble ${message.type ? `${message.type}-message` : ''}" ${bubbleAttributes}>${replyBlock}${body}</button>
          ${chosen ? `<div class="message-actions" role="group" aria-label="短信操作">
            ${isGroup && !readOnly ? `<button type="button" class="message-action message-reply-action" data-action="reply-message" data-message-target="${escape(message.id)}">${icon('message-reply')}<span>引用</span></button>` : ''}
            <button type="button" class="message-action message-delete danger" data-action="delete-message" data-message-target="${escape(message.id)}" aria-label="删除这条短信" ${deleting ? 'disabled' : ''}>${icon('message-delete')}<span>删除</span></button>
          </div>` : ''}
        </div>
        ${renderCardActions(message, { readOnly, busy, selected: chosen })}
        ${timestamp}
      </div>
    </div>
  </div>`;
}

export function renderChat(state, { ui, busy }) {
  const isGroup = ui.view === 'group-chat';
  const contact = isGroup ? state.groups?.find(item => item.id === ui.groupId) : state.contacts.find(item => item.id === ui.contactId);
  if (!contact) return empty('还没有选择联系人', '返回消息页，选择一个想聊的人。');
  const { current: history, past } = partitionHistory(state.conversations[contact.id] || [], ui.batch);
  const visible = history.slice(-ui.visibleMessages);
  const generating = busy.has(`continue:${contact.id}`), saving = busy.has(`send:${contact.id}`);
  const cannotReply = isGroup ? !contact.memberIds.some(id => !isUserIdentity(state, id)) : isUserIdentity(state, contact.id);
  const messageView = {
    contact, user: state.userProfile || { name: ui.defaultUser }, selected: ui.selectedMessage, state, ui, conversationId: contact.id,
    deleting: busy.has(`delete:${contact.id}`), isGroup, busy,
  };
  const profileAction = isGroup ? 'edit-group' : 'profile';
  const observer = isGroup && !contact.userIsMember;
  const reply = isGroup && ui.replyToId ? replyContext({ replyToId: ui.replyToId }, state.conversations[contact.id] || []) : undefined;
  const replyPreview = reply && !observer ? `<div class="reply-preview"><div><small>引用${reply.missing ? ' · 原消息已删除' : ''}</small><span>${reply.missing ? '原消息已删除' : escape(reply.messageText)}</span></div>${action('cancel-reply', '取消引用', 'close', 'icon-button')}</div>` : '';
  const renderList = (items, readOnly = false) => items.map((message, index) => renderMessage(
    message, items[index - 1], items[index + 1], {
      ...messageView, readOnly,
      contact,
    },
  )).join('');
  const historySections = [];
  let remaining = ui.visibleHistory;
  if (ui.historyOpen) for (let index = past.length - 1; index >= 0 && remaining > 0; index--) {
    const group = past[index], items = group.messages.slice(-remaining);
    remaining -= items.length;
    historySections.unshift(`<section class="past-batch" aria-label="历史聊天，只读">
      <div class="message-date"><span class="history-batch-heading"><span>${escape(group.label)}</span><button type="button" class="icon-button history-batch-delete danger" data-action="delete-history" data-history-key="${escape(group.key)}" aria-label="删除这段历史" title="删除这段历史" ${busy.has(`delete-history:${contact.id}`) ? 'disabled' : ''}>${icon('message-delete')}</button></span></div>
      ${renderList(items, true)}
    </section>`);
  }
  const pastCount = past.reduce((sum, group) => sum + group.messages.length, 0);
  const clearConfirmation = ui.confirmClear ? `<section class="clear-confirm" role="alert">
    <p>清空当前主楼时间点之后的消息及草稿，同时删除相关生成图片；过去的记录保留。</p>
    <div>
      ${action('cancel-clear', '取消', '', 'quiet-button')}
      ${action('confirm-clear', '确认清空', '', 'quiet-button danger', busy.has(`clear:${contact.id}`))}
    </div>
  </section>` : '';
  const composer = observer ? `<div class="composer observer-composer">
    <span>旁观群聊</span>
    ${action('continue', '继续', 'refresh', 'continue-button', generating || cannotReply)}
  </div>` : `<form class="composer">
    <div class="composer-input">
      ${action('attachments', '添加消息', 'plus', 'icon-button attachment-button')}
      <label class="sr-only" for="sms-draft">短信内容</label>
      <textarea id="sms-draft" name="message" rows="1" aria-label="短信内容">${escape(ui.drafts.get(contact.id) || '')}</textarea>
      ${action('continue', '继续', 'refresh', 'continue-button', generating || saving || cannotReply)}
      ${action('send', '发送', 'send', 'send-button', saving)}
    </div>
  </form>
  ${renderAttachments(state, ui, busy, contact, isGroup)}`;
  return `<header class="conversation-heading">
      ${action('back-inbox', '返回消息', 'arrow', 'icon-button back-button')}
      ${avatar(contact, true)}
      <button type="button" class="conversation-person" data-action="${profileAction}" aria-label="聊天资料">
        <h1>${escape(displayName(contact))}</h1>
        ${isGroup ? `<small>${contact.memberIds.length + Number(contact.userIsMember)} 位成员${observer ? ' · 旁观' : ''}</small>` : ''}
      </button>
      <div class="chat-options">
        <button type="button" class="icon-button" data-action="chat-menu" aria-label="聊天选项" aria-haspopup="menu" aria-expanded="${ui.chatMenu}">${icon('more')}</button>
      </div>
    </header>
    ${clearConfirmation}
    <div class="chat-stage ${contact.background && !contact.background.startsWith('color:') ? 'has-wallpaper' : ''}" style="${escape(chatBackgroundStyle(contact.background, state.theme))}">
      <div class="message-feed" role="log" aria-label="短信记录" aria-live="polite">
        ${pastCount ? `<button type="button" class="history-fold" data-action="history" aria-expanded="${ui.historyOpen}"><span>${ui.historyOpen ? '收起过去' : '查看过去'}</span></button>` : ''}
        ${ui.historyOpen && pastCount > ui.visibleHistory ? action('earlier-history', '查看更早的历史', '', 'earlier-button') : ''}
        ${historySections.join('')}
        ${history.length > visible.length ? action('earlier', '查看更早的短信', '', 'earlier-button') : ''}
        ${visible.length ? `<div class="message-date current-batch-label"><span>${escape(ui.batch.label)}</span></div>` : ''}
        ${renderList(visible)}
        ${generating ? `<div class="message-row is-theirs">
          ${avatar(contact, true)}
          <div class="typing" role="status" aria-label="正在生成回复"><i></i><i></i><i></i></div>
        </div>` : ''}
      </div>
    </div>
    ${replyPreview}${composer}`;
}
