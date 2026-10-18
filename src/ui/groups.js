import { action, avatar, avatarEditor, escape } from './shared.js';
import { displayName } from '../profiles.js';

export function renderGroupProfile(state, { ui, busy }) {
  const draft = ui.groupDraft;
  const member = (id, person, checked) => `<label class="group-member">
    ${avatar(person, true)}
    <span>${escape(displayName(person))}</span>
    <input type="checkbox" name="member" value="${escape(id)}" ${checked ? 'checked' : ''}>
  </label>`;
  return `<header class="post-heading">
      ${action('back-group', '返回短信', 'arrow', 'back-link')}
      <h1>${ui.groupEditId ? '编辑群聊' : '创建群聊'}</h1>
    </header>
    <form class="group-form">
      ${avatarEditor({ ...draft, name: draft.name || '群聊' })}
      <label class="field-label" for="group-name">群名</label>
      <input id="group-name" name="name" value="${escape(draft.name)}" required>
      <label class="field-label" for="group-avatar">头像地址</label>
      <input id="group-avatar" name="avatar" type="url" value="${escape(draft.avatar?.startsWith('data:') ? '' : draft.avatar)}" placeholder="https://…，也可从上方选择图片">
      <p class="field-label">群成员</p>
      <div class="group-members">
        ${member('@user', state.userProfile || { name: ui.defaultUser }, draft.userIsMember)}
        ${state.contacts.map(person => member(person.id, person, draft.memberIds.includes(person.id))).join('')}
      </div>
      <p class="setting-note">不选自己时，以旁观者身份查看群聊。</p>
      <div class="form-actions">
        <button class="save-button" type="submit" ${busy.has('group-profile') || busy.has('avatar') ? 'disabled' : ''}>${busy.has('group-profile') ? '保存中…' : '保存'}</button>
        ${ui.groupEditId ? action('remove-group', '删除', '', 'danger-button') : ''}
      </div>
    </form>`;
}
