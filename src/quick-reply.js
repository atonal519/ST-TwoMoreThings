const SET = '两三事';
const LABEL = '两三事';
export const OPEN_COMMAND = 'tmt-open';

// 复用构画的快捷入口约定：只维护本插件按钮，不改 Quick Replies 总开关。
export async function syncQuickReply(api, enabled, { setName = SET, label = LABEL, command = OPEN_COMMAND } = {}) {
  const message = `/${command}`;
  if (!api) {
    if (enabled) throw new Error('请先启用酒馆的快速回复功能，再打开 QR 入口。');
    return;
  }
  let set = api.getSetByName(setName);
  if (!set && !enabled) return;
  if (!set) set = await api.createSet(setName);
  const existing = set.qrList.find(qr => qr.label === label);
  if (existing && (existing.message !== message || existing.automationId)) throw new Error('快速回复组中已有同名按钮，请先将它改名。');
  if (enabled) {
    if (!existing) api.createQuickReply(setName, label, { message, title: `打开${label}`, showLabel: true, executeOnStartup: false, executeOnUser: false, executeOnAi: false, executeOnChatChange: false, executeOnGroupMemberDraft: false, executeOnNewChat: false, executeBeforeGeneration: false, automationId: '' });
    if (!api.settings?.config?.hasSet?.(set)) api.addGlobalSet(setName, true);
  } else {
    if (existing) api.deleteQuickReply(setName, label);
    if (!set.qrList.length) {
      if (api.settings?.config?.hasSet?.(set)) api.removeGlobalSet(setName);
      await set.save?.();
      await api.deleteSet(setName);
    }
  }
}
