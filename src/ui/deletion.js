import { escape } from './shared.js';

export function renderDeletion({ kind, name }) {
  const group = kind === 'group';
  return `<section class="delete-confirm">
      <p>确认删除“${escape(name)}”？</p>
      <p>${group ? '群聊资料、全部群消息和历史存档都会删除。' : '联系人资料、全部私聊和历史存档都会删除；同时移出群聊并删除其群内发言，保留群聊及其他人的记录。'}所有相关短信存档都不会保留。</p>
      <p>${group ? '关联的生成图片' : '相关动态及生成图片'}也会删除，图库不保留这些图片。以后可以重新整理添加，已删除的记录不会恢复。</p>
    </section>`;
}
