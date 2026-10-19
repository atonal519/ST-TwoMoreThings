import { action, escape } from './shared.js';

export function renderDeletion(_state, { ui, busy }) {
  const { kind, name } = ui.deletion, group = kind === 'group';
  return `<header class="post-heading">
      ${action('cancel-delete', '返回', 'arrow', 'back-link')}
      <h1>删除${group ? '群聊' : '联系人'}</h1>
    </header>
    <section class="delete-confirm">
      <p>确认删除“${escape(name)}”？</p>
      <p>${group ? '群聊资料、全部群消息和历史存档都会删除。' : '联系人资料、全部私聊和历史存档都会删除；同时移出群聊并删除其群内发言，保留群聊及其他人的记录。'}所有相关短信存档都不会保留。</p>
      <p>${group ? '关联的生成图片' : '相关动态及生成图片'}也会删除，图库不保留这些图片。以后可以重新整理添加，已删除的记录不会恢复。</p>
      <div class="form-actions">
        ${action('cancel-delete', '取消', '', 'quiet-button')}
        ${action('confirm-delete', '确认删除', '', 'danger-button', busy.has('remove'))}
      </div>
    </section>`;
}
