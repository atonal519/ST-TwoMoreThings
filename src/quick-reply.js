const SET = '两三事';
const LABEL = '手机';
export const OPEN_COMMAND = 'tmt-open';

// 复用构画的快捷入口约定：只维护本插件按钮，不改 Quick Replies 总开关。
export async function syncQuickReply(api, enabled, { setName = SET, label = LABEL, command = OPEN_COMMAND, visible = true } = {}) {
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
  // 旧版按钮与组同名；仅替换仍指向本实例的入口，保留用户自己的按钮。
  const legacy = setName !== label && set.qrList.find(qr => qr.label === setName && qr.message === message && !qr.automationId);
  if (legacy) api.deleteQuickReply(setName, legacy.label);
  if (enabled) {
    if (!existing) api.createQuickReply(setName, label, { message, title: `打开${label}`, showLabel: true, isHidden: !visible, executeOnStartup: false, executeOnUser: false, executeOnAi: false, executeOnChatChange: false, executeOnGroupMemberDraft: false, executeOnNewChat: false, executeBeforeGeneration: false, automationId: '' });
    else if (Boolean(existing.isHidden) !== !visible) api.updateQuickReply(setName, label, { isHidden: !visible });
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
