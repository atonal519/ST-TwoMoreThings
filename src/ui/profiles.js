import { action, avatarEditor, escape, icon } from './shared.js';
import { renderBackgroundPicker } from './backgrounds.js';

export function renderIdentityOptions(state, ui) {
  const choices = [{ id: '', name: '此联系人本人' }, { id: '@user', name: '我' }, ...state.contacts.filter(person => person.id !== ui.editId).map(person => ({ id: person.id, name: person.nickname || person.name }))];
  return `<div class="model-popup identity-popup"><div class="model-options" role="listbox" aria-label="选择所属人物">${choices.map(person => `<button type="button" role="option" data-identity-owner="${escape(person.id)}" aria-selected="${person.id === (ui.profileDraft.identityOwnerId || '')}">${escape(person.name)}</button>`).join('')}</div></div>`;
}

export function renderProfile(state, { ui, busy, profileAvatar }) {
  const person = ui.profileDraft;
  const contact = ui.editor === 'contact';
  const selectedOwner = person.identityOwnerId === '@user' ? '我' : state.contacts.find(item => item.id === person.identityOwnerId)?.nickname || state.contacts.find(item => item.id === person.identityOwnerId)?.name || '此联系人本人';
  const contactFields = contact ? `
    <div class="field-label profile-expression-heading">
      <label for="profile-expression">线上聊天方式</label>
      ${ui.editId ? action('refine-style', busy.has('style') ? '刷新中…' : '刷新线上聊天方式', 'refresh', 'field-refresh', busy.has('style')) : ''}
    </div>
    <textarea id="profile-expression" name="expression" rows="4" placeholder="句长、分条、标点、称呼、符号或表情习惯">${escape(person.expression)}</textarea>
    <label class="field-label" for="profile-language">语言习惯</label>
    <input id="profile-language" name="language" value="${escape(person.language)}" placeholder="优先于默认语言；留空则沿用手机默认语言">` : '';
  return `<header class="post-heading">
      ${action('back-profile', '返回', 'arrow', 'back-link')}
      <span>${contact ? ui.editId ? '联系人资料' : '添加联系人' : '我的资料'}</span>
    </header>
    <form class="profile-form">
      ${avatarEditor(profileAvatar || person, { open: ui.avatarMenuOpen, canRestore: contact, busy: busy.has('avatar') || busy.has('profile') })}
      <label class="field-label" for="profile-name">姓名</label>
      <input id="profile-name" name="name" value="${escape(person.name)}" required>
      <label class="field-label" for="profile-nickname">网名</label>
      <input id="profile-nickname" name="nickname" value="${escape(person.nickname)}" placeholder="手机里显示的名字，不填则用姓名">
      <label class="field-label" for="profile-avatar">头像地址</label>
      <input id="profile-avatar" name="avatar" type="url" value="${escape(person.avatar?.startsWith('data:') ? '' : person.avatar)}" placeholder="https://…，也可从上方选择图片">
      ${contact ? `<label class="field-label" for="identity-owner">所属人物</label><div class="identity-picker"><button type="button" id="identity-owner" class="model-list-toggle" data-action="identity-menu" aria-haspopup="listbox" aria-expanded="${Boolean(ui.identityOwnersOpen)}"><span>${escape(selectedOwner)}</span>${icon('next')}</button>${ui.identityOwnersOpen ? renderIdentityOptions(state, ui) : ''}</div>` : ''}
      ${contactFields}
      ${contact ? `<span class="field-label">聊天背景</span>${renderBackgroundPicker({ value: person.background, theme: state.theme, busy: busy.has('chat-background'), chat: true })}` : ''}
      <div class="form-actions">
        <button class="save-button" type="submit" ${busy.has('profile') || busy.has('avatar') || busy.has('style') || busy.has('chat-background') ? 'disabled' : ''}>${busy.has('profile') ? '保存中…' : '保存'}</button>
        ${contact && ui.editId ? action('remove-contact', '删除', '', 'danger-button') : ''}
      </div>
    </form>`;
}
