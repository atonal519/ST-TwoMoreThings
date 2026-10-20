const CHANGE_EVENT = 'tmt-appearance-changed';

// 个人动效偏好共用扩展全局设置，不随聊天或作者包保存；两种运行方式读取同一字段。
export function createAppearanceSettings({ host, documentRef = globalThis.document }) {
  return {
    particlesEnabled: () => host.readSettings().pocketPhone?.particlesEnabled !== false,
    async setParticlesEnabled(enabled) {
      const settings = host.readSettings(), previous = settings.pocketPhone;
      settings.pocketPhone = { ...previous, particlesEnabled: enabled === true };
      try { await host.saveSettings(); }
      catch { settings.pocketPhone = previous; throw new Error('外观设置保存失败，请重试。'); }
      const EventClass = documentRef?.defaultView?.Event || globalThis.Event;
      documentRef?.dispatchEvent(new EventClass(CHANGE_EVENT));
    },
    subscribe(callback) {
      documentRef?.addEventListener(CHANGE_EVENT, callback);
      return () => documentRef?.removeEventListener(CHANGE_EVENT, callback);
    },
  };
}
