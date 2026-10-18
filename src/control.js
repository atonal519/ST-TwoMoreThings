export function createPhoneControl({ host, target }) {
  const key = target.character?.avatar ? `character:${target.character.avatar}` : target.groupId ? `group:${target.groupId}` : `chat:${target.id}`;
  const isEnabled = () => host.readSettings().pocketPhone?.disabledCards?.[key] !== true;
  return {
    isEnabled,
    assertEnabled() { if (!isEnabled()) throw new Error('当前角色卡的两三事已关闭，请在设置顶部开启。'); },
    async setEnabled(enabled) {
      const settings = host.readSettings(), previous = settings.pocketPhone;
      const disabledCards = { ...previous?.disabledCards };
      if (enabled) delete disabledCards[key]; else disabledCards[key] = true;
      settings.pocketPhone = { ...previous, disabledCards };
      try { await host.saveSettings(); }
      catch { settings.pocketPhone = previous; throw new Error('总开关保存失败，请重试。'); }
      if (!enabled) host.setPrompt('');
    },
  };
}
