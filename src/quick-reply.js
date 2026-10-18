const SET = '两三事';
const LABEL = '两三事';
export const OPEN_COMMAND = 'tmt-open';
const MESSAGE = `/${OPEN_COMMAND}`;

// 复用构画的快捷入口约定：只维护本插件按钮，不改 Quick Replies 总开关。
export async function syncQuickReply(api, enabled) {
  if (!api) {
    if (enabled) throw new Error('请先启用酒馆的快速回复功能，再打开 QR 入口。');
    return;
  }
  let set = api.getSetByName(SET);
  if (!set && !enabled) return;
  if (!set) set = await api.createSet(SET);
  const existing = set.qrList.find(qr => qr.label === LABEL);
  if (existing && (existing.message !== MESSAGE || existing.automationId)) throw new Error('快速回复组中已有同名按钮，请先将它改名。');
  if (enabled) {
    if (!existing) api.createQuickReply(SET, LABEL, { message: MESSAGE, title: '打开两三事', showLabel: true, executeOnStartup: false, executeOnUser: false, executeOnAi: false, executeOnChatChange: false, executeOnGroupMemberDraft: false, executeOnNewChat: false, executeBeforeGeneration: false, automationId: '' });
    if (!api.settings?.config?.hasSet?.(set)) api.addGlobalSet(SET, true);
  } else {
    if (existing) api.deleteQuickReply(SET, LABEL);
    if (!set.qrList.length) {
      if (api.settings?.config?.hasSet?.(set)) api.removeGlobalSet(SET);
      await set.save?.();
      await api.deleteSet(SET);
    }
  }
}
