import { action, avatarEditor, escape } from './shared.js';

export function renderProfile(state, { ui, busy }) {
  const person = ui.profileDraft;
  const contact = ui.editor === 'contact';
  return `<header class="post-heading" data-phone-tools>${action('back-profile', '返回', 'arrow', 'back-link')}<span>${contact ? ui.editId ? '联系人资料' : '添加联系人' : '我的资料'}</span></header>
    <form class="profile-form">${avatarEditor(person)}
    <label class="field-label" for="profile-name">姓名</label><input id="profile-name" name="name" value="${escape(person.name)}" required>
    <label class="field-label" for="profile-nickname">网名</label><input id="profile-nickname" name="nickname" value="${escape(person.nickname)}" placeholder="手机里显示的名字，不填则用姓名">
    <label class="field-label" for="profile-avatar">头像地址</label><input id="profile-avatar" name="avatar" type="url" value="${escape(person.avatar?.startsWith('data:') ? '' : person.avatar)}" placeholder="https://…，也可从上方选择图片">
    ${contact ? `<label class="field-label" for="profile-expression">线上聊天方式</label><textarea id="profile-expression" name="expression" rows="4" placeholder="句长、分条、标点、称呼、符号或表情习惯">${escape(person.expression)}</textarea>
    ${ui.editId ? action('refine-style', busy.has('style') ? '提炼中…' : '重新提炼线上方式', 'refresh', 'quiet-button', busy.has('style')) : ''}
    <label class="field-label" for="profile-language">语言习惯</label><input id="profile-language" name="language" value="${escape(person.language)}" placeholder="例如：英语，附中文翻译；不填则按剧情判断">` : ''}
    <div class="form-actions"><button class="save-button" type="submit" ${busy.has('profile') || busy.has('avatar') || busy.has('style') ? 'disabled' : ''}>${busy.has('profile') ? '保存中…' : '保存'}</button>${contact && ui.editId ? action('remove-contact', '删除', '', 'danger-button') : ''}</div></form>`;
}

